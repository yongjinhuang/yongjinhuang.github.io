# 设计分布式键值存储

分布式键值存储是一种非关系型数据库，其中唯一标识符（键）被映射到其关联的值，数据分布在多台机器上。Amazon DynamoDB、Apache Cassandra 和 Riak 等系统是生产环境中的典型示例。本指南将从零开始逐步讲解每一个重要的设计决策。

---

## 1. 需求澄清

### 1.1 功能性需求

| 操作 | 签名 | 描述 |
|-----------|-----------|-------------|
| **Put** | `put(key, value)` | 插入或更新一个键值对 |
| **Get** | `get(key) -> value` | 根据给定的键检索值 |
| **Delete** | `delete(key)` | 删除一个键值对 |

其他功能性需求：

- **自动扩缩容**：在不停机的情况下添加或移除节点。
- **可调一致性**：允许调用方按请求选择强一致性或最终一致性。
- **版本控制**：通过冲突检测和解决来处理并发写入。
- **TTL 支持**：键可以在可配置的生存时间后过期。

### 1.2 非功能性需求

| 需求 | 目标 |
|-------------|--------|
| **可用性** | 99.99% 正常运行时间（每年 < 52 分钟停机） |
| **延迟** | 数据中心内 p99 读写 < 10 ms |
| **可扩展性** | 线性水平扩展至数百个节点 |
| **分区容错性** | 在网络分区期间继续运行 |
| **持久性** | 已确认的写入永不丢失 |

### 1.3 规模估算

- **键值对总数**：数十亿（10^9 - 10^12）
- **平均键大小**：16 - 256 bytes
- **平均值大小**：1 KB（最大 10 KB）
- **总数据量**：10 TB - 1 PB
- **QPS**：100K 次读/秒，50K 次写/秒

### 1.4 CAP 定理权衡

CAP 定理指出，分布式系统最多只能同时保证以下三个特性中的**两个**：

```
                    Consistency (C)
                         /\
                        /  \
                       /    \
                      / CP   \
                     /  systems\
                    /    (HBase)\
                   /____________\
                  /              \
    Availability / AP systems    \
        (A)     / (Dynamo, Cass.) \
               /   CA systems     \
              /   (single-node     \
             /     RDBMS - not     \
            /      distributed)     \
           /________________________\
                Partition Tolerance (P)
```

**我们的选择：AP 加可调一致性。**

在分布式环境中，网络分区（P）是不可避免的。因此我们需要在以下两者之间做出选择：

- **CP**：在分区期间牺牲可用性。如果无法达到 quorum，则拒绝写入。
- **AP**：牺牲严格一致性。即使在分区期间也接受写入；稍后进行协调。

我们默认选择 **AP**（类似 Dynamo），但允许**可调一致性**，使调用方可以在需要时（例如金融交易）按请求选择 CP 行为。

---

## 2. 单服务器键值存储

在进行分布式设计之前，让我们先了解单服务器的基线方案。

### 2.1 内存哈希表

最简单的键值存储是一个内存中的哈希映射：

```
┌───────────────────────────────────────┐
│           In-Memory Hash Map          │
│                                       │
│   key_1  ──►  value_1                 │
│   key_2  ──►  value_2                 │
│   key_3  ──►  value_3                 │
│   ...                                 │
│   key_n  ──►  value_n                 │
│                                       │
│   O(1) average get/put/delete         │
└───────────────────────────────────────┘
```

**伪代码：**

```python
class SingleServerKVStore:
    def __init__(self):
        self.store = {}        # in-memory hash map
        self.wal = WAL()       # write-ahead log on disk

    def put(self, key, value):
        self.wal.append("PUT", key, value)   # durability
        self.store[key] = value              # fast access

    def get(self, key):
        return self.store.get(key, None)

    def delete(self, key):
        self.wal.append("DELETE", key)
        del self.store[key]
```

### 2.2 局限性

| 局限性 | 说明 |
|------------|-------------|
| **内存** | 所有数据必须放入 RAM。一台 256 GB RAM 的服务器，在 1 KB/值的情况下大约能存放约 250M 个键。 |
| **持久性** | 没有 WAL 的话，一次崩溃就会丢失所有数据。 |
| **可用性** | 单点故障。一台服务器宕机 = 全部中断。 |
| **吞吐量** | 垂直扩展有硬性限制（CPU、网卡、磁盘 I/O）。 |

### 2.3 持久化：预写日志

**预写日志（WAL）** 在将变更应用到内存之前，先将每次变更追加写入磁盘。在崩溃恢复时，重放 WAL 以重建状态。

```
Client Request
      │
      ▼
┌─────────────┐     ┌────────────────────────┐
│  Append to  │────►│  WAL on Disk           │
│  WAL first  │     │  [PUT k1 v1]           │
└─────┬───────┘     │  [PUT k2 v2]           │
      │             │  [DEL k1]              │
      ▼             │  [PUT k3 v3]           │
┌─────────────┐     │  ...                   │
│  Apply to   │     └────────────────────────┘
│  Hash Map   │
└─────────────┘
```

### 2.4 为什么需要分布式

为了以高可用性和低延迟服务数十亿个键，我们**必须**将数据分布到多台机器上。本指南的其余部分将重点介绍使分布式方案得以运作的各种设计决策。

---

## 3. 数据分区

### 3.1 为什么选择 Consistent Hashing？

朴素的分区方式（`hash(key) % N`）在添加或移除节点时会导致大量数据迁移。如果 `N` 从 4 变为 5，几乎**所有**键都需要重新映射。

**Consistent hashing** 最大限度地减少了数据迁移：当一个节点加入或离开时，平均只有 `K/N` 个键需要迁移。

### 3.2 基本 Consistent Hashing

将**键**和**节点**都映射到同一个环形哈希空间（0 到 2^128 - 1）。

```
                        0 / 2^128
                          │
                     ┌────┴────┐
                    /           \
                  N1              k3
                 /                 \
                │                   │
               k1                  N2
                │                   │
                 \                 /
                  k4             k2
                    \           /
                     └────┬────┘
                          │
                         N3

  Walk clockwise from key to find its owning node:
    k1 → N1    (k1 is between N3 and N1 clockwise)
    k2 → N3    (k2 is between N2 and N3 clockwise)
    k3 → N2    (k3 is between N1 and N2 clockwise)
    k4 → N3    (k4 is between N2 and N3 clockwise)
```

**算法：**

1. 将每个节点 ID 哈希到环上的一个位置：`pos = hash(node_id)`。
2. 将每个键哈希到一个位置：`pos = hash(key)`。
3. 从键的位置开始顺时针遍历；遇到的第一个节点即为该键的所属节点。

### 3.3 Virtual Nodes（虚拟节点）

当物理节点较少时，分布可能会不均匀。**虚拟节点**通过将每个物理节点映射到环上的多个位置来解决这个问题。

```
Physical Node    Virtual Nodes on Ring
─────────────    ─────────────────────
  Node A     →   A_0, A_1, A_2, ..., A_199
  Node B     →   B_0, B_1, B_2, ..., B_199
  Node C     →   C_0, C_1, C_2, ..., C_199
```

```
                        0
                        │
                   ┌────┴────┐
                  /           \
               A_0             B_1
               /                 \
              │                   │
            C_2                  A_1
              │                   │
               \                 /
               B_0             C_0
                  \           /
                   └────┬────┘
                        │
                       A_2

  Keys are distributed more evenly because each
  physical node covers many small arcs.
```

**虚拟节点的好处：**

| 好处 | 说明 |
|---------|-------------|
| **均匀分布** | 每个节点覆盖多个小弧段而非一个大弧段 |
| **异构硬件** | 性能更强的节点可以分配更多虚拟节点 |
| **平滑重平衡** | 添加节点时负载分散到多个现有节点 |

**典型数量：** 每个物理节点 100-200 个虚拟节点。

### 3.4 添加/移除节点

**添加节点 D：**

```
Before:                          After:
   ┌──────┐                        ┌──────┐
  A│      │B                      A│      │B
   │      │                        │  D   │
   │      │                        │ ↗    │
  C│      │                       C│      │
   └──────┘                        └──────┘

Only keys in the arc between D's predecessor and D
need to move to D. All other keys stay put.

Data movement = K / N  (on average)
```

**移除节点 B：**

只有 B 的键会迁移到 B 的后继节点。其他键不受影响。

### 3.5 热点处理

如果某个特定键非常热门（明星推文、病毒式传播的视频元数据）：

1. **读副本**：将热键复制到额外的节点。
2. **客户端缓存**：在应用层缓存热键。
3. **键拆分**：追加随机后缀（`hot_key_0`、`hot_key_1`、...、`hot_key_99`），将读请求分散到 100 个键上。客户端在每次读取时随机选择一个后缀。

---

## 4. 数据复制

### 4.1 复制因子 N

每个键值对被复制到 **N** 个节点上（通常 N = 3），以确保持久性和可用性。如果一两个节点故障，数据仍然可以访问。

### 4.2 哈希环上的副本放置

在通过 consistent hashing 定位到键的主节点之后，环上顺时针方向的下 **N-1 个不同物理节点**也存储副本。

```
                        0
                        │
                   ┌────┴────┐
                  /           \
               Node A          Node B
               /  (replica 1)    \  (primary)
              │                   │
              │       key X       │
              │     hash(X) ──►   │
              │                   │
               \                 /
              Node D          Node C
                  \  (replica 2) /
                   └────┬────┘
                        │

  key X maps to Node B (primary).
  Replicas: Node C (next clockwise), Node D (next).
  N = 3 total copies.

  NOTE: If virtual nodes for the same physical node
  appear consecutively, we skip them and pick the
  next distinct physical node.
```

### 4.3 Sloppy Quorum 和 Hinted Handoff

在严格 quorum 中，如果指定的副本不可达，写入就会失败。**Sloppy quorum** 放宽了这一限制：

- 如果指定的副本宕机，写入将发送到环上的**下一个健康节点**。
- 该健康节点存储数据时附带一个**提示**，指明预期的接收方。
- 当预期节点恢复时，提示的数据将被**移交**（传回）。

```
Normal operation:
  key X → [B, C, D]   (N=3 replicas)

Node C is down:
  key X → [B, E, D]   (E holds data with hint "for C")
                ▲
                │
          hinted handoff

When C recovers:
  E transfers C's data back to C
  E deletes the hinted copy
```

这种机制以临时将副本放置在非理想节点为代价，提高了**写入可用性**。

---

## 5. 一致性模型

### 5.1 强一致性

每次读取都返回最新的写入值。需要协调机制（例如 Raft、Paxos），这会增加延迟并在分区期间降低可用性。

### 5.2 最终一致性

如果没有新的更新，所有副本最终将收敛到相同的值。读取可能会暂时返回过期数据。这是 AP 系统的默认模式。

### 5.3 Quorum 共识

对于 **N** 个副本，定义：
- **W** = 写入时必须确认的副本数量
- **R** = 读取时必须响应的副本数量

**一致性保证：** 如果 `W + R > N`，则读取集合中至少有一个节点拥有最新写入的数据（鸽巢原理）。

```
┌───────────────────────────────────────────────────────────────┐
│                    Quorum Configurations                      │
├──────────────┬───────┬───────┬────────────────────────────────┤
│ Config       │   W   │   R   │ Characteristics               │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Fast writes  │   1   │   N   │ Write to 1, read from all.    │
│              │       │       │ Low write latency.             │
│              │       │       │ High read latency.             │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Fast reads   │   N   │   1   │ Write to all, read from 1.    │
│              │       │       │ Low read latency.              │
│              │       │       │ High write latency.            │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Balanced     │ N/2+1 │ N/2+1 │ Majority quorum.              │
│ (typical)    │       │       │ Good balance of latency.       │
│              │       │       │ Tolerates up to N/2 failures.  │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Eventual     │   1   │   1   │ No consistency guarantee.      │
│              │       │       │ Fastest but may read stale.    │
└──────────────┴───────┴───────┴────────────────────────────────┘

Example with N = 3:
  Balanced: W=2, R=2   →  W + R = 4 > 3  ✓ consistent
  Fast write: W=1, R=3 →  W + R = 4 > 3  ✓ consistent
  Eventual: W=1, R=1   →  W + R = 2 < 3  ✗ may be stale
```

### 5.4 Vector Clocks 用于冲突解决

当副本收到并发写入时，我们需要一种机制来检测和解决冲突。**Vector clocks** 跟踪每个值的因果历史。

Vector clock 是一个 `(node, counter)` 对的列表。每个节点在每次写入时递增自己的计数器。

**Vector clocks 的工作原理：**

```
1. Initial state:
   All replicas have value v0 with clock []

2. Client A writes v1 through Node A:
   Clock: [A:1]

3. Client B reads v1 [A:1], writes v2 through Node B:
   Clock: [A:1, B:1]    (B saw A:1, incremented B)

4. Client C reads v1 [A:1], writes v3 through Node C:
   Clock: [A:1, C:1]    (C saw A:1, incremented C)

5. Conflict detected!
   [A:1, B:1] and [A:1, C:1] are concurrent.
   Neither dominates the other.
```

**Vector Clock 演进图：**

```
  Client A              Node A              Node B              Node C
     │                    │                    │                    │
     │── put(k, v1) ────►│                    │                    │
     │                    │ clock: [A:1]       │                    │
     │                    │── replicate ──────►│                    │
     │                    │── replicate ───────────────────────────►│
     │                    │                    │                    │
     │                    │                    │                    │
  Client B                │                    │                    │
     │                    │                    │                    │
     │── get(k) ─────────────────────────────►│                    │
     │◄─ v1 [A:1] ───────────────────────────│                    │
     │── put(k, v2) ─────────────────────────►│                    │
     │                    │                    │ clock: [A:1, B:1]  │
     │                    │                    │                    │
  Client C                │                    │                    │
     │                    │                    │                    │
     │── get(k) ──────────────────────────────────────────────────►│
     │◄─ v1 [A:1] ────────────────────────────────────────────────│
     │── put(k, v3) ──────────────────────────────────────────────►│
     │                    │                    │  clock: [A:1, C:1] │
     │                    │                    │                    │
  CONFLICT: [A:1, B:1] vs [A:1, C:1]  — neither dominates
```

**支配规则：**

- 时钟 X **支配**时钟 Y，当且仅当 X 的每个分量 >= Y 的对应分量，且至少有一个严格大于。
- 如果两者互不支配，则写入是**并发的**，必须进行解决。

```
[A:2, B:1] dominates [A:1, B:1]     → keep [A:2, B:1], discard other
[A:1, B:1] vs [A:1, C:1]            → CONFLICT (concurrent)
```

**冲突解决策略：**

| 策略 | 描述 | 使用者 |
|----------|-------------|---------|
| **Last-writer-wins (LWW)** | 使用墙上时钟时间戳；最大者胜出 | Cassandra |
| **应用层解决** | 返回所有版本；让应用程序合并 | Riak, DynamoDB |
| **CRDTs** | 无冲突数据结构自动合并 | Riak（可选） |

**Vector clock 比较的伪代码：**

```python
def compare(clock_a, clock_b):
    """
    Returns:
      'BEFORE'     if clock_a < clock_b  (a happened before b)
      'AFTER'      if clock_a > clock_b  (a happened after b)
      'CONCURRENT' if neither dominates
    """
    a_less = False
    b_less = False
    all_nodes = set(clock_a.keys()) | set(clock_b.keys())

    for node in all_nodes:
        ca = clock_a.get(node, 0)
        cb = clock_b.get(node, 0)
        if ca < cb:
            a_less = True
        elif ca > cb:
            b_less = True

    if a_less and not b_less:
        return 'BEFORE'
    if b_less and not a_less:
        return 'AFTER'
    if a_less and b_less:
        return 'CONCURRENT'
    return 'EQUAL'
```

---

## 6. 故障处理

### 6.1 故障检测：Gossip 协议

在没有 leader 的去中心化系统中，节点必须在没有单一协调点的情况下**发现故障**。**Gossip 协议**（也称为流行病协议）实现了这一点。

**Gossip 的工作原理：**

1. 每个节点维护一个**成员列表**：`{node_id: heartbeat_counter, timestamp}`。
2. 定期（例如每 1 秒），每个节点递增自己的心跳计数器。
3. 每个节点随机选择**几个对等节点**并发送自己的成员列表。
4. 收到 gossip 消息后，节点**合并**列表（保留较高的心跳值）。
5. 如果某节点的心跳在**阈值**时间内（例如 10 秒）没有增加，则将其标记为**可疑**。
6. 经过更长的超时后，可疑节点被标记为**故障**。

```
┌─────────┐  gossip   ┌─────────┐  gossip   ┌─────────┐
│ Node A  │◄─────────►│ Node B  │◄─────────►│ Node C  │
│         │           │         │           │         │
│ Members:│           │ Members:│           │ Members:│
│ A: 42   │           │ A: 40   │           │ A: 38   │
│ B: 30   │           │ B: 31   │           │ B: 29   │
│ C: 55   │           │ C: 53   │           │ C: 56   │
│ D: 18   │           │ D: 18   │           │ D: 18   │
└─────────┘           └─────────┘           └─────────┘
     │                                           │
     │              gossip                       │
     └───────────────────────────────────────────┘

After gossip round, each node converges:
  A: 42, B: 31, C: 56, D: 18

If D's counter stays at 18 for > 10 seconds:
  → D is suspected, then marked failed.
```

**Gossip 收敛时间：** 需要 O(log N) 轮才能将信息传播到所有 N 个节点。

### 6.2 临时故障：Sloppy Quorum + Hinted Handoff

（已在第 4.3 节中介绍。）

当一个节点临时不可达时：

1. 将写入重定向到备用节点（sloppy quorum）。
2. 备用节点存储数据并附带转发提示。
3. 当原始节点恢复时，数据被移交回来。

这确保了在短暂中断期间写入不会被拒绝。

### 6.3 永久故障：基于 Merkle Tree 的反熵

当一个节点永久丢失并被替换，或者由于错过 hinted handoff 导致副本出现偏差时，我们需要一种高效同步数据的机制。**Merkle tree**（哈希树）使这一过程变得高效。

**Merkle tree 的工作原理：**

Merkle tree 是一棵二叉树，其中：
- **叶节点**包含单个数据块（键范围）的哈希值。
- **内部节点**包含其子节点的哈希值。
- **根哈希**概括了整个数据集。

```
                    Root: H(AB+CD)
                   /              \
              H(AB)                H(CD)
             /     \              /     \
          H(A)    H(B)         H(C)    H(D)
           │       │            │       │
        ┌──┴──┐ ┌──┴──┐    ┌──┴──┐ ┌──┴──┐
        │ k1  │ │ k2  │    │ k3  │ │ k4  │
        │ k5  │ │ k6  │    │ k7  │ │ k8  │
        │ k9  │ │ k10 │    │ k11 │ │ k12 │
        └─────┘ └─────┘    └─────┘ └─────┘
        Range A  Range B    Range C  Range D
```

**比较树以发现不一致：**

两个副本各自在相同的键范围上构建 Merkle tree。它们进行比较：

```
  Replica 1                           Replica 2
  Root: 0xABCD                        Root: 0xABCE    ← mismatch!
       /      \                            /      \
  H(AB): 0x1234  H(CD): 0x5678       H(AB): 0x1234  H(CD): 0x5679  ← mismatch!
    /   \          /   \                /   \          /   \
 H(A)   H(B)   H(C)   H(D)         H(A)   H(B)   H(C)   H(D)
 0xAA   0xBB   0xCC   0xDD         0xAA   0xBB   0xCC   0xDE
                                                          ↑
                                               Mismatch! Only Range D
                                               needs synchronization.
```

**优势：** 无需传输所有数据，只需同步有差异的范围。对于数百万个键，这大幅减少了网络传输量。

**步骤：**

1. 每个副本在其键范围上构建 Merkle tree。
2. 比较根哈希。如果相等，副本是同步的。
3. 如果不同，递归比较子节点，直到找到有差异的叶范围。
4. 仅同步那些范围。

**复杂度：** O(log N) 次比较即可找到 O(1) 个有差异的范围。

### 6.4 数据中心故障：跨数据中心复制

为了灾难恢复，将数据复制到多个数据中心：

- 每个键在**至少 2 个数据中心**拥有副本。
- 写入通过异步方式跨数据中心复制，以避免写入路径上的跨数据中心延迟。
- 在数据中心故障期间，流量被路由到存活的数据中心。

（完整的多数据中心架构图见第 11 节。）

---

## 7. 存储引擎深入解析

### 7.1 LSM Tree（日志结构合并树）

LSM tree 是写入密集型键值存储的主流存储引擎（Cassandra、RocksDB、LevelDB、HBase）。它将随机写入转换为顺序 I/O。

**架构：**

```
                       Write Path
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                      MemTable                            │
│                (In-Memory Sorted Tree)                   │
│                  e.g., Red-Black Tree                    │
│                                                          │
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐              │
│   │ a  │──│ d  │──│ f  │──│ k  │──│ z  │              │
│   │ =1 │  │ =4 │  │ =6 │  │ =11│  │ =26│              │
│   └────┘  └────┘  └────┘  └────┘  └────┘              │
│                                                          │
│   When MemTable reaches threshold (e.g., 64 MB):        │
│   → Freeze as Immutable MemTable                        │
│   → Create new MemTable for incoming writes             │
│   → Flush Immutable MemTable to disk as SSTable         │
└──────────────────────────────────────────────────────────┘
                          │
                          │ flush
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    SSTable (Level 0)                      │
│            (Sorted String Table on Disk)                 │
│                                                          │
│   ┌──────────────────────────────────────┐              │
│   │  Index Block  │  Data Blocks (sorted) │              │
│   │  a → offset 0 │  [a=1][d=4][f=6]     │              │
│   │  k → offset 48│  [k=11][z=26]        │              │
│   └──────────────────────────────────────┘              │
│                                                          │
│   ┌──────────────────────────────────────┐              │
│   │  Bloom Filter (in memory)            │              │
│   │  Quickly answers: "Is key X in this  │              │
│   │  SSTable?" with no false negatives   │              │
│   └──────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────┘
                          │
                          │ compaction
                          ▼
┌──────────────────────────────────────────────────────────┐
│                SSTables (Levels 1, 2, ...)               │
│                                                          │
│   Level 0:  [SST-1] [SST-2] [SST-3]  (may overlap)     │
│                  │       │       │                        │
│                  └───────┼───────┘                        │
│                     compaction                            │
│                          │                                │
│   Level 1:  [SST-A]──[SST-B]──[SST-C]  (no overlap)    │
│                          │                                │
│                     compaction                            │
│                          │                                │
│   Level 2:  [SST-X]─[SST-Y]─[SST-Z]─[SST-W]           │
│             (10x larger than Level 1)                    │
└──────────────────────────────────────────────────────────┘
```

**写入路径：**

1. 追加写入磁盘上的**预写日志（WAL）** 以保证持久性。
2. 插入到**MemTable**（内存中的平衡树）。
3. 立即向客户端确认写入。
4. 当 MemTable 超过阈值时，冻结它并刷写为磁盘上新的 **SSTable**。
5. 后台**压缩**合并 SSTable 以移除重复项和墓碑标记。

**读取路径：**

1. 检查 **MemTable**（最新数据）。
2. 检查每个 SSTable 的 **Bloom filter**（快速跳过不包含该键的 SSTable）。
3. 从最新到最旧搜索 SSTable，使用索引块进行二分查找。
4. 返回找到的第一个（最新的）值。

**压缩策略：**

| 策略 | 描述 | 权衡 |
|----------|-------------|-----------|
| **Size-tiered** | 合并大小相似的 SSTable | 更高的空间放大，更好的写入吞吐量 |
| **Leveled** | 每层大 10 倍；层内严格无重叠 | 更低的空间放大，更多的压缩 I/O |

### 7.2 B-Tree（对比）

B-Tree 是读取密集型工作负载的传统存储引擎（MySQL InnoDB、PostgreSQL）。

```
                    B-Tree (order 4)
                    ┌───────────┐
                    │  10 │ 20  │
                    └──┬──┴──┬──┘
                   /   │      \
         ┌────────┐ ┌────────┐ ┌────────┐
         │ 3 │ 7  │ │12 │ 15│ │ 25│ 30 │
         └────────┘ └────────┘ └────────┘
            │          │           │
          (leaf      (leaf       (leaf
          pages)     pages)      pages)
```

### 7.3 LSM 与 B-Tree 对比

| 特性 | LSM Tree | B-Tree |
|---------------|----------|--------|
| **写入吞吐量** | 更高（顺序 I/O） | 更低（随机 I/O） |
| **读取吞吐量** | 更低（需检查多个层级） | 更高（单次树遍历） |
| **写放大** | 更高（压缩时重写） | 更低 |
| **空间放大** | 更高（临时重复数据） | 更低（原地更新） |
| **适用场景** | 写入密集型工作负载 | 读取密集型、范围扫描工作负载 |
| **使用者** | Cassandra, RocksDB, LevelDB | MySQL, PostgreSQL |

**对于我们的键值存储，我们选择 LSM tree**，因为键值工作负载通常是写入密集型的，LSM tree 提供了更优的写入吞吐量。

---

## 8. 写入和读取路径

### 8.1 写入路径（详细）

```
  Client
    │
    │  put(key, value)
    │
    ▼
┌────────────────┐
│  Coordinator   │  (any node can be coordinator)
│  Node          │
└───────┬────────┘
        │
        │  1. Determine replica nodes via consistent hashing
        │
        ├──────────────────────────┬──────────────────────────┐
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  Replica 1   │          │  Replica 2   │          │  Replica 3   │
│              │          │              │          │              │
│ ┌──────────┐ │          │ ┌──────────┐ │          │ ┌──────────┐ │
│ │1. Append │ │          │ │1. Append │ │          │ │1. Append │ │
│ │   WAL    │ │          │ │   WAL    │ │          │ │   WAL    │ │
│ └────┬─────┘ │          │ └────┬─────┘ │          │ └────┬─────┘ │
│      │       │          │      │       │          │      │       │
│ ┌────▼─────┐ │          │ ┌────▼─────┐ │          │ ┌────▼─────┐ │
│ │2. Write  │ │          │ │2. Write  │ │          │ │2. Write  │ │
│ │ MemTable │ │          │ │ MemTable │ │          │ │ MemTable │ │
│ └────┬─────┘ │          │ └────┬─────┘ │          │ └────┬─────┘ │
│      │       │          │      │       │          │      │       │
│ ┌────▼─────┐ │          │ ┌────▼─────┐ │          │ ┌────▼─────┐ │
│ │3. Send   │ │          │ │3. Send   │ │          │ │3. Send   │ │
│ │   ACK    │ │          │ │   ACK    │ │          │ │   ACK    │ │
│ └──────────┘ │          │ └──────────┘ │          │ └──────────┘ │
│              │          │              │          │              │
│ (Background) │          │ (Background) │          │ (Background) │
│ 4. Flush to  │          │ 4. Flush to  │          │ 4. Flush to  │
│    SSTable   │          │    SSTable   │          │    SSTable   │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │         ACK              │          ACK             │
        └──────────┬───────────────┘──────────────────────────┘
                   │
                   ▼
           Coordinator waits for W ACKs (e.g., W=2 of 3)
           Then responds SUCCESS to client
```

**步骤：**

1. 客户端向任意节点（**协调者**）发送 `put(key, value)`。
2. 协调者通过 consistent hashing 确定 N 个副本节点。
3. 协调者并行将写入转发给所有 N 个副本。
4. 每个副本：
   a. 将变更追加到其 **WAL**（顺序磁盘写入）。
   b. 插入到其 **MemTable**（内存中）。
   c. 向协调者发送 **ACK**。
5. 协调者等待 **W** 个确认，然后响应客户端。
6. 在后台，当 MemTable 满时，将其刷写为磁盘上的 **SSTable**。

### 8.2 读取路径（详细）

```
  Client
    │
    │  get(key)
    │
    ▼
┌────────────────┐
│  Coordinator   │
│  Node          │
└───────┬────────┘
        │
        │  Send read request to R replicas
        │
        ├──────────────────────────┬──────────────────┐
        ▼                          ▼                  ▼
┌──────────────┐          ┌──────────────┐    ┌──────────────┐
│  Replica 1   │          │  Replica 2   │    │  Replica 3   │
│              │          │              │    │              │
│ 1. MemTable  │          │ 1. MemTable  │    │ 1. MemTable  │
│    found? ───┼─► Yes    │    found? ───┼─►  │    found? ── │
│    return    │  No ↓    │    return    │    │    return    │
│              │          │              │    │              │
│ 2. Bloom     │          │ 2. Bloom     │    │ 2. Bloom     │
│    filter    │          │    filter    │    │    filter    │
│    check     │          │    check     │    │    check     │
│    SST-1: No │          │              │    │              │
│    SST-2: Yes│          │              │    │              │
│         ↓    │          │              │    │              │
│ 3. Binary    │          │              │    │              │
│    search    │          │              │    │              │
│    SST-2     │          │              │    │              │
│    index     │          │              │    │              │
│         ↓    │          │              │    │              │
│ 4. Read data │          │              │    │              │
│    block     │          │              │    │              │
└──────┬───────┘          └──────┬───────┘    └──────┬───────┘
       │                         │                    │
       │     value + clock       │                    │
       └─────────┬───────────────┘────────────────────┘
                 │
                 ▼
         Coordinator collects R responses
         Picks value with highest vector clock
         (Triggers read repair if values differ)
         Returns value to client
```

**步骤：**

1. 客户端向任意节点（协调者）发送 `get(key)`。
2. 协调者并行向 **R** 个副本发送读取请求。
3. 每个副本在本地搜索：
   a. 检查 **MemTable**（最新数据，在内存中）。
   b. 如果未找到，检查每个 SSTable 的 **Bloom filter**（从最新到最旧检查）。
   c. 对于 Bloom filter 回答"可能存在"的 SSTable，在索引块上进行二分查找。
   d. 读取数据块并返回值。
4. 协调者收集 R 个响应，选择具有**最新 vector clock** 的那个。
5. 如果响应不一致，触发 **read repair**：将最新值发送给过期的副本。

---

## 9. 系统架构

### 9.1 完整架构图

```
                              ┌──────────┐
                              │  Client  │
                              └────┬─────┘
                                   │
                          ┌────────▼─────────┐
                          │   Load Balancer   │
                          └────────┬─────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │   Node A    │       │   Node B    │       │   Node C    │
     │ (Coord.)    │       │ (Coord.)    │       │ (Coord.)    │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Request     │       │ Request     │       │ Request     │
     │ Handler     │       │ Handler     │       │ Handler     │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Consistent  │       │ Consistent  │       │ Consistent  │
     │ Hash Ring   │       │ Hash Ring   │       │ Hash Ring   │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Storage     │       │ Storage     │       │ Storage     │
     │ Engine      │       │ Engine      │       │ Engine      │
     │ (LSM Tree)  │       │ (LSM Tree)  │       │ (LSM Tree)  │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Replication  │       │ Replication  │       │ Replication  │
     │ Manager     │       │ Manager     │       │ Manager     │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Failure     │       │ Failure     │       │ Failure     │
     │ Detector    │       │ Detector    │       │ Detector    │
     │ (Gossip)    │       │ (Gossip)    │       │ (Gossip)    │
     └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
            │                      │                      │
            │    Gossip Protocol   │    Gossip Protocol    │
            ◄──────────────────────►──────────────────────►
            │                      │                      │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │   Node D    │       │   Node E    │       │   Node F    │
     │   (same     │       │   (same     │       │   (same     │
     │   structure)│       │   structure)│       │   structure)│
     └─────────────┘       └─────────────┘       └─────────────┘
```

### 9.2 关键设计特性

| 特性 | 实现方式 |
|----------|---------------|
| **无单点故障** | 每个节点地位平等（无 leader / 点对点） |
| **任意节点可协调** | 客户端可以联系任意节点；该节点成为协调者 |
| **去中心化故障检测** | Gossip 协议；没有可能故障的 master |
| **去中心化成员管理** | 基于 Gossip 的成员列表 |
| **水平扩展** | 添加节点；consistent hashing 重新分配最少的数据 |

### 9.3 节点组件

每个节点运行以下组件：

```
┌─────────────────────────────────────────────┐
│                  Node                        │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         Request Handler              │   │
│  │  - Accept client requests            │   │
│  │  - Route to correct replicas         │   │
│  │  - Collect quorum responses          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         Storage Engine (LSM)         │   │
│  │  ┌─────────┐  ┌──────────────────┐  │   │
│  │  │MemTable │  │   WAL            │  │   │
│  │  └────┬────┘  └──────────────────┘  │   │
│  │       │                              │   │
│  │  ┌────▼────────────────────────┐    │   │
│  │  │  SSTables + Bloom Filters   │    │   │
│  │  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │       Gossip / Failure Detector       │   │
│  │  - Membership list                    │   │
│  │  - Heartbeat counters                 │   │
│  │  - Suspicion / failure marking        │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │       Anti-Entropy / Repair           │   │
│  │  - Merkle tree comparison             │   │
│  │  - Read repair                        │   │
│  │  - Hinted handoff queue               │   │
│  └──────────────────────────────────────┘   │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 10. 可调一致性

### 10.1 配置参数

系统暴露三个参数，客户端可以**按请求**设置：

| 参数 | 描述 | 默认值 |
|-----------|-------------|---------|
| **N** | 副本数量 | 3 |
| **W** | 写入 quorum（写入成功所需的 ACK 数量） | 2 |
| **R** | 读取 quorum（读取成功所需的响应数量） | 2 |

### 10.2 使用场景示例

**银行业务的强一致性：**

```
N = 3, W = 2, R = 2    →  W + R = 4 > 3  ✓

  put("balance:user123", 500)
  → Must get ACK from 2/3 replicas before success
  → Read must query 2/3 replicas
  → At least 1 replica overlaps → guaranteed latest value

  Trade-off: Higher latency (wait for slower replica)
             Lower availability (need 2/3 up for writes)
```

**社交媒体的高可用性：**

```
N = 3, W = 1, R = 1    →  W + R = 2 < 3  (eventual consistency)

  put("likes:post456", 10042)
  → Write succeeds as soon as 1 replica ACKs
  → Read returns from fastest replica (may be stale)

  Trade-off: May show slightly stale like counts
             But writes never fail (even if 2/3 nodes down)
```

**写入密集型日志/遥测：**

```
N = 3, W = 1, R = 3

  → Writes are fast (1 ACK)
  → Reads are consistent (query all 3, guaranteed latest)
  → Good for "write once, read rarely" workloads
```

### 10.3 一致性决策树

```
Is strong consistency required?
  │
  ├── YES → Set W + R > N
  │         │
  │         ├── Read-heavy?  → W = N, R = 1
  │         ├── Write-heavy? → W = 1, R = N
  │         └── Balanced?    → W = ⌈(N+1)/2⌉, R = ⌈(N+1)/2⌉
  │
  └── NO  → Eventual consistency acceptable
            │
            ├── Maximize availability → W = 1, R = 1
            └── Best-effort fresh    → W = 1, R = 2
```

---

## 11. 部署架构

### 11.1 多数据中心部署

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Global Load Balancer                        │
│                    (Route to nearest DC)                            │
└───────────────┬────────────────────────────┬────────────────────────┘
                │                            │
     ┌──────────▼──────────┐      ┌──────────▼──────────┐
     │   Data Center 1     │      │   Data Center 2     │
     │   (US-East)         │      │   (EU-West)         │
     │                     │      │                     │
     │  ┌───┐ ┌───┐ ┌───┐ │      │  ┌───┐ ┌───┐ ┌───┐ │
     │  │N1 │ │N2 │ │N3 │ │      │  │N4 │ │N5 │ │N6 │ │
     │  └─┬─┘ └─┬─┘ └─┬─┘ │      │  └─┬─┘ └─┬─┘ └─┬─┘ │
     │    │     │     │    │      │    │     │     │    │
     │    └─────┼─────┘    │      │    └─────┼─────┘    │
     │     Gossip/Repl.    │      │     Gossip/Repl.    │
     │                     │      │                     │
     └──────────┬──────────┘      └──────────┬──────────┘
                │                            │
                │   Cross-DC Async           │
                │   Replication              │
                └────────────────────────────┘

     ┌──────────────────────────────────────────────────┐
     │          Data Center 3 (AP-Tokyo)                │
     │                                                   │
     │  ┌───┐ ┌───┐ ┌───┐                              │
     │  │N7 │ │N8 │ │N9 │                              │
     │  └─┬─┘ └─┬─┘ └─┬─┘                              │
     │    └─────┼─────┘                                  │
     │     Gossip/Repl.                                  │
     │                                                   │
     └──────────────────┬───────────────────────────────┘
                        │
           Cross-DC Async Replication
           to DC1 and DC2
```

### 11.2 跨数据中心复制

| 方面 | 实现方式 |
|--------|---------------|
| **数据中心内复制** | 同步（数据中心内低延迟） |
| **跨数据中心复制** | 异步（避免写入路径上的跨数据中心延迟损耗） |
| **冲突解决** | Last-writer-wins 或 vector clocks（取决于配置） |
| **副本放置** | 确保 N 个副本跨越至少 2 个数据中心 |
| **一致性** | LOCAL_QUORUM（本地数据中心内的 quorum）或 EACH_QUORUM（每个数据中心的 quorum） |

### 11.3 故障场景

```
Scenario 1: Single node failure
  → Sloppy quorum + hinted handoff
  → No data loss, no downtime

Scenario 2: Rack failure
  → Replicas on other racks serve requests
  → Anti-entropy repairs when rack recovers

Scenario 3: Entire DC failure
  → Global load balancer routes to surviving DCs
  → Cross-DC replicas serve all requests
  → When DC recovers, anti-entropy synchronizes
```

---

## 12. 与真实系统的对比

### 12.1 功能对比

```
┌──────────────────┬──────────────┬──────────────┬──────────────┐
│ Feature          │  DynamoDB    │  Cassandra   │  Riak        │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Architecture     │ Managed      │ Self-hosted  │ Self-hosted  │
│                  │ (AWS)        │ (or managed) │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Data Model       │ Key-value +  │ Wide-column  │ Key-value    │
│                  │ document     │              │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Partitioning     │ Consistent   │ Consistent   │ Consistent   │
│                  │ hashing      │ hashing      │ hashing      │
│                  │ (virtual     │ (vnodes or   │ (vnodes)     │
│                  │  partitions) │  tokens)     │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Replication      │ 3 replicas   │ Configurable │ Configurable │
│                  │ across AZs   │ N (default 3)│ N (default 3)│
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Consistency      │ Eventually   │ Tunable      │ Tunable      │
│                  │ consistent   │ (W, R, N)    │ (W, R, N)    │
│                  │ or strong    │              │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Conflict         │ Last-writer  │ Last-writer  │ Vector       │
│ Resolution       │ -wins (LWW)  │ -wins (LWW)  │ clocks +     │
│                  │              │              │ siblings     │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Storage Engine   │ B-Tree       │ LSM Tree     │ Bitcask /    │
│                  │ (custom)     │              │ LevelDB      │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Failure          │ Internal     │ Gossip       │ Gossip       │
│ Detection        │ (managed)    │ (Phi Accrual)│              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Anti-Entropy     │ Internal     │ Merkle trees │ Merkle trees │
│                  │ (managed)    │ + read repair│ + AAE        │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Membership       │ Managed      │ Gossip       │ Gossip       │
│                  │              │ (Snitch)     │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ CAP Choice       │ AP (default) │ AP (default) │ AP           │
│                  │ CP (opt-in)  │ CP (opt-in)  │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Multi-DC         │ Global       │ Yes          │ Yes          │
│                  │ Tables       │ (NetworkTopo │ (multi-DC    │
│                  │              │  Strategy)   │  replication)│
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Query Language   │ PartiQL /    │ CQL          │ HTTP API /   │
│                  │ API          │              │ Erlang API   │
└──────────────────┴──────────────┴──────────────┴──────────────┘
```

### 12.2 设计决策总结

| 决策 | DynamoDB | Cassandra | Riak | 我们的设计 |
|----------|----------|-----------|------|------------|
| Leader 选举 | 无（无 leader） | 无（无 leader） | 无（无 leader） | 无（无 leader） |
| 写入路径 | 内存 + journal | MemTable + CommitLog | Write-back cache | MemTable + WAL |
| Read repair | 是 | 是 | 是 | 是 |
| Hinted handoff | 是 | 是 | 是 | 是 |
| Merkle trees | 是 | 是 | 是（AAE） | 是 |
| Bloom filters | 是 | 是 | 是 | 是 |

---

## 13. 常见面试追问

### 13.1 如何处理范围查询？

标准 consistent hashing 随机分布键，破坏了排序顺序。要支持范围查询：

**方案 A：有序分区**

- 使用键本身（而非其哈希值）来确定分区边界。
- 每个节点拥有一个连续的键范围：`[a-f] → Node1, [g-m] → Node2, ...`
- 优点：天然支持范围扫描。
- 缺点：如果键分布不均匀，存在热点风险。
- 使用者：HBase、早期 DynamoDB。

**方案 B：复合键**

- 按"分区键"的哈希进行分区，但在每个分区内按"排序键"排序。
- 示例：`partition_key = user_id, sort_key = timestamp`
- 分区内的范围查询很高效；跨分区的范围查询需要 scatter-gather。
- 使用者：DynamoDB、Cassandra。

```
Table: user_events
  Partition key: user_id (hashed for distribution)
  Sort key: timestamp (sorted within partition)

  Range query: "All events for user_123 between t1 and t2"
  → Route to single partition → efficient local range scan
```

### 13.2 如何实现 TTL（生存时间）？

```
Approach 1: Lazy expiration
  - Store TTL alongside value: {value, created_at, ttl}
  - On read: if (now - created_at > ttl), return NOT_FOUND and delete
  - Pro: No background work
  - Con: Expired keys consume space until read

Approach 2: Active expiration
  - Background thread scans for expired keys periodically
  - Uses a TTL index (sorted by expiry time) for efficiency
  - Pro: Reclaims space proactively
  - Con: Background CPU and I/O cost

Approach 3: Compaction-based (LSM stores)
  - During SSTable compaction, skip entries past their TTL
  - Natural cleanup with no extra mechanism
  - Used by: Cassandra (with tombstones and gc_grace_seconds)

Best practice: Combine lazy (for correctness) + compaction-based (for cleanup).
```

**伪代码：**

```python
def get_with_ttl(self, key):
    entry = self.store.get(key)
    if entry is None:
        return None

    if entry.ttl > 0 and time.now() - entry.created_at > entry.ttl:
        self.delete(key)  # lazy cleanup
        return None

    return entry.value
```

### 13.3 如何处理大值？

超出典型 10 KB 限制的值（例如图片、文档）：

```
Strategy 1: Chunking
  ┌──────────────────────────────┐
  │  Large value (5 MB)          │
  │                              │
  │  Split into 512 chunks:      │
  │  key_chunk_0  (10 KB)        │
  │  key_chunk_1  (10 KB)        │
  │  ...                         │
  │  key_chunk_511 (10 KB)       │
  │                              │
  │  Metadata key:               │
  │  key_meta = {chunks: 512,    │
  │              size: 5MB}      │
  └──────────────────────────────┘

Strategy 2: External storage
  - Store the value in an object store (S3, GCS)
  - Store the reference (URL/path) in the KV store
  - Trade-off: Extra hop for reads, but KV store stays lean

Strategy 3: Dedicated large-object tier
  - Separate storage tier optimized for large blobs
  - KV store holds pointer to blob tier
  - Used by: DynamoDB (400 KB limit, S3 for larger)
```

### 13.4 如何实现事务？

分布式键值存储通常为了性能而牺牲事务支持。可选方案：

**轻量级事务（compare-and-set）：**

```python
def compare_and_set(key, expected_value, new_value):
    """Atomic conditional update. Requires consensus (Paxos/Raft)."""
    current = get(key)
    if current == expected_value:
        put(key, new_value)
        return True
    return False

# Example: atomic counter increment
while True:
    current = get("counter")
    if compare_and_set("counter", current, current + 1):
        break  # success
    # else retry (optimistic concurrency)
```

**多键事务（2PC 或 Percolator）：**

```
Coordinator
     │
     │  Phase 1: PREPARE
     │  → Lock key_A on Node1
     │  → Lock key_B on Node2
     │  ← Both respond OK
     │
     │  Phase 2: COMMIT
     │  → Commit key_A on Node1
     │  → Commit key_B on Node2
     │  ← Both respond OK
     │
     │  If any PREPARE fails → ABORT all

Trade-off: 2PC blocks if coordinator fails.
           Use 3PC or Paxos-based commit for fault tolerance.
```

使用者：Google Spanner（TrueTime + 2PC）、CockroachDB、FoundationDB。

### 13.5 如何处理时钟偏差？

不同机器之间的墙上时钟永远无法完美同步。这给 last-writer-wins（LWW）冲突解决带来了问题。

**解决方案：**

| 方案 | 描述 | 使用者 |
|----------|-------------|---------|
| **NTP** | 网络时间协议；将时钟偏差控制在 ~1-10 ms 内 | 大多数系统 |
| **Vector clocks** | 逻辑时钟；不依赖墙上时间 | Riak, Dynamo |
| **Hybrid logical clocks (HLC)** | 物理 + 逻辑分量；在每个节点内单调递增 | CockroachDB, Cassandra |
| **TrueTime** | GPS + 原子钟；有界的不确定性区间 | Google Spanner |

**Hybrid Logical Clock (HLC)：**

```
HLC = (physical_time, logical_counter)

Rules:
  1. On local event: HLC = (max(HLC.pt, now()), 0)
     If now() == HLC.pt: increment logical counter instead
  2. On send: attach HLC to message
  3. On receive(msg):
     HLC.pt = max(HLC.pt, msg.HLC.pt, now())
     if all three equal: HLC.lc = max(HLC.lc, msg.HLC.lc) + 1
     else: HLC.lc = 0

Benefits:
  - Always monotonically increasing
  - Closely tracks physical time
  - Captures causal ordering
```

---

## 14. 关键设计决策总结

```
┌────────────────────────┬──────────────────────────────────────┐
│ Design Decision        │ Our Choice                           │
├────────────────────────┼──────────────────────────────────────┤
│ Data partitioning      │ Consistent hashing + virtual nodes   │
├────────────────────────┼──────────────────────────────────────┤
│ Data replication       │ N=3, placed on hash ring successor   │
│                        │ nodes across racks/DCs               │
├────────────────────────┼──────────────────────────────────────┤
│ Consistency model      │ Tunable: W + R > N for strong,       │
│                        │ W=1/R=1 for eventual                 │
├────────────────────────┼──────────────────────────────────────┤
│ Conflict resolution    │ Vector clocks + app-level resolution │
├────────────────────────┼──────────────────────────────────────┤
│ Failure detection      │ Gossip protocol                      │
├────────────────────────┼──────────────────────────────────────┤
│ Temp failure handling  │ Sloppy quorum + hinted handoff       │
├────────────────────────┼──────────────────────────────────────┤
│ Perm failure handling  │ Anti-entropy with Merkle trees       │
├────────────────────────┼──────────────────────────────────────┤
│ Storage engine         │ LSM tree (MemTable + WAL + SSTables) │
├────────────────────────┼──────────────────────────────────────┤
│ Architecture           │ Leaderless (peer-to-peer)            │
├────────────────────────┼──────────────────────────────────────┤
│ Membership management  │ Gossip-based                         │
├────────────────────────┼──────────────────────────────────────┤
│ Multi-DC support       │ Async cross-DC replication            │
├────────────────────────┼──────────────────────────────────────┤
│ CAP trade-off          │ AP by default, CP opt-in per request │
└────────────────────────┴──────────────────────────────────────┘
```

---

## 15. 快速参考：面试检查清单

在面试中使用此检查清单来确保你涵盖了所有要点：

```
□ 澄清需求（功能性、非功能性、规模）
□ 讨论 CAP 定理并论证 AP vs CP 的选择
□ 使用 consistent hashing + virtual nodes 进行数据分区
□ 数据复制（N 个副本，在环上的放置）
□ 一致性模型（quorum: W + R > N）
□ 冲突解决（vector clocks vs LWW）
□ 故障检测（gossip 协议）
□ 临时故障（sloppy quorum + hinted handoff）
□ 永久故障（Merkle trees 用于反熵）
□ 存储引擎（LSM tree: MemTable → WAL → SSTable）
□ 写入路径（WAL → MemTable → ACK → 后台刷写）
□ 读取路径（MemTable → Bloom filter → SSTable）
□ 系统架构（无 leader，任意节点可作为协调者）
□ 多数据中心部署（异步跨数据中心复制）
□ 可调一致性示例（银行 vs 社交媒体）
□ 处理追问（范围查询、TTL、大值、事务、时钟偏差）
```

---

## 16. 延伸阅读

| 资源 | 描述 |
|----------|-------------|
| **Dynamo 论文** (2007) | Amazon 关于分布式键值存储的奠基性论文 |
| **Cassandra 论文** (2010) | Facebook 受 Dynamo + BigTable 启发的宽列存储 |
| **DDIA 第 5-6 章** | Martin Kleppmann 所著《设计数据密集型应用》 |
| **Riak 文档** | 关于分布式键值概念的优秀实践指南 |
| **RocksDB Wiki** | 深入了解 LSM tree 实现细节 |
| **Google Spanner 论文** (2012) | TrueTime 与全局一致性事务 |
