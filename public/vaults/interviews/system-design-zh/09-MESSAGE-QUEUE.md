# 设计分布式消息队列 (Kafka)

## 目录

1. [需求澄清](#1-需求澄清)
2. [消息队列 vs 事件流](#2-消息队列-vs-事件流)
3. [高层架构](#3-高层架构)
4. [核心概念深入](#4-核心概念深入)
5. [数据模型](#5-数据模型)
6. [副本复制与容错](#6-副本复制与容错)
7. [投递语义](#7-投递语义)
8. [性能优化](#8-性能优化)
9. [消息顺序](#9-消息顺序)
10. [扩展](#10-扩展)
11. [部署架构](#11-部署架构)
12. [常见面试追问](#12-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| 需求                 | 描述                                                          |
| -------------------- | ------------------------------------------------------------- |
| 发布消息             | Producer 将消息发送到指定的 topic                             |
| 订阅 topic           | Consumer 从一个或多个 topic 读取消息                          |
| 基于 topic 的路由    | 消息按逻辑 topic 进行组织                                     |
| 消息保留             | 消息持久化保存可配置的时长（如 7 天）                         |
| 消息重放             | Consumer 可通过重置 offset 重新读取历史消息                   |
| Consumer group       | 多个 consumer 共同分担工作；每条消息在每个 group 内只投递一次 |
| 顺序保证             | 同一 partition 内的消息严格有序                               |
| At-least-once 投递   | 默认的投递保证，配合 consumer 确认机制                        |
| Exactly-once（可选） | 针对关键工作负载的事务支持                                    |

### 非功能性需求

| 需求     | 目标                                                 |
| -------- | ---------------------------------------------------- |
| 吞吐量   | 每秒数百万条消息（集群聚合）                         |
| 延迟     | 端到端 99 分位延迟 < 10ms（从 producer 到 consumer） |
| 持久性   | 确认后不丢失消息（replication factor >= 3）          |
| 可用性   | 99.99% 正常运行时间；单个 broker 故障时零停机        |
| 可扩展性 | 通过增加 broker 和 partition 实现水平扩展            |
| 顺序性   | 单个 partition 内严格有序                            |
| 保留策略 | 可配置；默认 7 天；支持无限保留                      |

### 规模估算

```
每日数据量：             1 TB/天
每秒消息数：             1,000,000（峰值）
平均消息大小：           1 KB
每日消息数：             1 TB / 1 KB = ~10 亿条消息/天
保留周期：               7 天
总存储量：               7 TB 原始数据 * 3 副本 = 21 TB
```

### 粗略估算

```
写入吞吐量：
  1,000,000 msgs/sec * 1 KB = 1 GB/sec 聚合写入吞吐量
  3 倍副本复制：3 GB/sec 总磁盘写入吞吐量

所需 broker 数量（写入密集型）：
  单个 broker 磁盘吞吐量：~200 MB/sec（SSD 顺序写入）
  写入所需 broker：3 GB/sec / 200 MB/sec = 最少 15 个 broker
  预留余量（60% 利用率）：~25 个 broker

Partition 数量：
  目标：1,000,000 msgs/sec
  单个 partition 吞吐量：~10,000 msgs/sec（producer 端）
  所需 partition 数：1,000,000 / 10,000 = 最少 100 个 partition
  预留余量：所有 topic 合计 ~200-300 个 partition

网络带宽：
  入站：1 GB/sec
  出站：1 GB/sec * N 个 consumer group（扇出）
  如果有 5 个 consumer group：5 GB/sec 出站
  每个 broker 出站（25 个 broker）：200 MB/sec 每 broker

内存（page cache）：
  热数据 = 最近 30 分钟的数据
  30 min * 60 sec * 1 GB/sec = 1.8 TB
  每个 broker：1.8 TB / 25 = ~72 GB
  目标：每个 broker 128 GB RAM（良好的 page cache 覆盖率）
```

---

## 2. 消息队列 vs 事件流

### 传统消息队列（如 RabbitMQ、ActiveMQ）

```
Producer --> [ Queue ] --> Consumer
                |
                v
         (消息在消费后被删除)
```

- 消息在成功消费后被删除
- 支持复杂路由（fanout、topic、headers、direct exchange）
- 推送模式投递给 consumer
- 逐条消息确认
- 最适合任务分发和 RPC 模式

### 事件流平台（如 Kafka、Pulsar）

```
Producer --> [ Append-Only Log ] --> Consumer A (offset 5)
                                 --> Consumer B (offset 2)
                                 --> Consumer C (offset 8)
```

- 消息无论是否被消费都会保留（基于日志）
- Consumer 自行跟踪在日志中的位置（offset）
- 拉取模式投递（consumer 轮询获取新数据）
- 支持通过重置 consumer offset 进行重放
- 最适合事件溯源、流处理、数据管道

### 对比表

| 特性           | 传统消息队列 (RabbitMQ)      | 事件流 (Kafka)                  |
| -------------- | ---------------------------- | ------------------------------- |
| 消息生命周期   | 消费后删除                   | 按配置时长保留                  |
| 投递模型       | 推送给 consumer              | 由 consumer 拉取                |
| 重放能力       | 否（消息已删除）             | 是（重置 offset）               |
| 路由复杂度     | 丰富（exchange、binding）    | 简单（topic + partition key）   |
| Consumer group | 竞争消费者                   | 带 offset 的 consumer group     |
| 顺序性         | 每个队列（不保证）           | 每个 partition（保证）          |
| 吞吐量         | 每节点 ~50K msgs/sec         | 每节点 ~1M+ msgs/sec            |
| 延迟           | 亚毫秒级                     | 个位数毫秒                      |
| 协议           | AMQP、STOMP、MQTT            | 自定义二进制协议                |
| 背压           | 队列深度 / consumer prefetch | consumer 控制的拉取速率         |
| 消息优先级     | 是（内置）                   | 否（需设计变通方案）            |
| 死信队列       | 内置                         | 需手动实现                      |
| Exactly-once   | 通过事务                     | Idempotent producer + EOS       |
| 存储           | 内存 + 可选磁盘              | 始终使用磁盘（append-only log） |

### 何时使用哪种

```
使用传统消息队列的场景：
  - 需要复杂路由逻辑（fanout、topic exchange、headers）
  - 在 worker 间分发任务（竞争消费者）
  - 请求-应答 / RPC 模式
  - 消息优先级很重要
  - 消息处理后应被删除
  - 亚毫秒级延迟至关重要

使用事件流的场景：
  - 需要消息重放/重新处理
  - 需要高吞吐量（每秒数百万条消息）
  - 事件溯源或 CQRS 架构
  - 多个独立 consumer 需要相同数据
  - 流处理（聚合、连接、窗口）
  - 数据管道 / ETL 工作负载
  - 审计日志 / 合规要求
```

---

## 3. 高层架构

### 类 Kafka 架构

```
                         ┌─────────────────────────────────────────┐
                         │           Coordination Layer             │
                         │     (ZooKeeper / KRaft Controller)       │
                         │                                         │
                         │  - Broker 成员与健康管理                │
                         │  - Topic/partition 元数据               │
                         │  - Leader 选举                          │
                         │  - ACL 和配额                           │
                         └────────────┬────────────────────────────┘
                                      │ metadata
                                      │
    ┌──────────┐          ┌───────────┴───────────────────────────────────┐
    │Producer 1│──────┐   │                 Broker Cluster                 │
    ├──────────┤      │   │                                               │
    │Producer 2│──────┤   │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
    ├──────────┤      ├──>│  │Broker 1 │  │Broker 2 │  │Broker 3 │      │
    │Producer 3│──────┤   │  │         │  │         │  │         │      │
    └──────────┘      │   │  │ TopicA  │  │ TopicA  │  │ TopicA  │      │
                      │   │  │ P0(L)   │  │ P0(F)   │  │ P0(F)   │      │
                      │   │  │ P1(F)   │  │ P1(L)   │  │ P1(F)   │      │
                      │   │  │ P2(F)   │  │ P2(F)   │  │ P2(L)   │      │
                      │   │  │         │  │         │  │         │      │
                      │   │  │ TopicB  │  │ TopicB  │  │ TopicB  │      │
                      │   │  │ P0(F)   │  │ P0(L)   │  │ P0(F)   │      │
                      │   │  └─────────┘  └─────────┘  └─────────┘      │
                      │   │                                               │
                      │   │  (L) = Leader    (F) = Follower              │
                      │   │  Replication factor = 3                       │
                      │   └───────────┬───────────────────────────────────┘
                      │               │
                      │               │
                      │   ┌───────────┴────────────────────────────┐
                      │   │            Consumer Groups              │
                      │   │                                        │
                      │   │  Group "analytics"    Group "search"   │
                      │   │  ┌────────────┐       ┌────────────┐  │
                      │   │  │Consumer A  │       │Consumer D  │  │
                      │   │  │ (P0, P1)   │       │ (P0)       │  │
                      │   │  ├────────────┤       ├────────────┤  │
                      │   │  │Consumer B  │       │Consumer E  │  │
                      │   │  │ (P2)       │       │ (P1, P2)   │  │
                      │   │  └────────────┘       └────────────┘  │
                      │   └────────────────────────────────────────┘
                      │
              ┌───────┴────────┐
              │  Schema Registry│ (可选)
              │  (Avro/Protobuf)│
              └────────────────┘
```

### 组件职责

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ 组件         │ 职责                                                 │
├──────────────┼──────────────────────────────────────────────────────┤
│ Producer     │ 序列化、分区、批处理、压缩、发送消息                │
│ Broker       │ 存储消息、服务读取、副本复制、状态管理              │
│ Consumer     │ 轮询消息、反序列化、处理、提交 offset               │
│ ZK / KRaft   │ 集群元数据、leader 选举、配置管理                   │
│ Schema Reg.  │ Schema 存储、兼容性检查、序列化                     │
└──────────────┴──────────────────────────────────────────────────────┘
```

### 请求流程：生产消息

```
1. Producer 序列化消息（key + value）
2. Partitioner 选择目标 partition
     - 如果有 key：hash(key) % num_partitions
     - 如果 key 为 null：round-robin 或 sticky partition
3. 消息添加到每个 partition 对应的批处理缓冲区
4. 后台发送线程将批次传输到 partition leader
5. Leader broker：
   a. 验证消息（CRC、大小、授权）
   b. 追加到本地日志段
   c. 复制到 follower broker（ISR）
6. 根据 acks 设置：
   - acks=0：不等待确认（发送即忘）
   - acks=1：leader 本地写入后确认
   - acks=all：所有 ISR 副本确认后 leader 再确认
7. Producer 收到确认（或失败时重试）
```

### 请求流程：消费消息

```
1. Consumer 向 partition leader 发送 FetchRequest
     - 包含：topic、partition、offset、max_bytes
2. Leader broker：
   a. 在索引文件中查找 offset
   b. 从日志段中读取数据（通常从 page cache 提供服务）
   c. 使用 zero-copy（sendfile）将数据传输到 socket
3. Consumer 收到包含消息批次的 FetchResponse
4. Consumer 反序列化并处理消息
5. Consumer 提交 offset：
   - 自动提交：后台定期提交（默认 5 秒）
   - 手动提交：应用程序控制，处理完成后提交
6. 已提交的 offset 存储在 __consumer_offsets 内部 topic 中
```

---

## 4. 核心概念深入

### 4.1 Topic 与 Partition

**Topic** 是组织消息的逻辑通道。**Partition** 是 topic 内并行和排序的单元。

```
Topic: "user-events" (3 个 partition，replication factor = 3)

  Partition 0                    Partition 1                    Partition 2
  ┌───┬───┬───┬───┬───┬───┐    ┌───┬───┬───┬───┬───┐         ┌───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │    │ 0 │ 1 │ 2 │ 3 │ 4 │         │ 0 │ 1 │ 2 │ 3 │
  └───┴───┴───┴───┴───┴───┘    └───┴───┴───┴───┴───┘         └───┴───┴───┴───┘
  offset ──────────────────>    offset ──────────────>         offset ────────>
  (append-only, immutable)      (append-only, immutable)       (append-only)

  Leader: Broker 1               Leader: Broker 2              Leader: Broker 3
  Followers: Broker 2, 3         Followers: Broker 1, 3        Followers: Broker 1, 2
```

**Partition 的关键属性：**

- 每个 partition 是消息的有序、不可变序列
- partition 内的每条消息获得唯一的、单调递增的 **offset**
- Partition 分布在各 broker 上以实现负载均衡
- 单个 partition 不能跨越多个 broker（放置单元）
- 顺序保证仅限于单个 partition 内
- 可以增加 partition 但不能删除（增加会使基于 key 的路由失效）

**Partition 数量规划指南：**

```
期望吞吐量：             T msgs/sec
单个 partition 吞吐量：   p msgs/sec（producer 端 ~10,000，consumer 端 ~50,000）
最少 partition 数：       max(T/p_producer, T/p_consumer)

示例：
  目标：500,000 msgs/sec
  Producer 端：500,000 / 10,000 = 50 个 partition
  Consumer 端：500,000 / 50,000 = 10 个 partition
  推荐：50 个 partition（受 producer 吞吐量限制）
  预留余量：60-80 个 partition
```

**Partition 分配策略：**

| 策略        | 描述                                              | 使用场景           |
| ----------- | ------------------------------------------------- | ------------------ |
| Round-robin | 均匀分配到各 partition                            | 无顺序要求         |
| 基于 Key    | hash(key) % partitions；相同 key 到相同 partition | 按实体排序         |
| 自定义      | 应用程序定义的 partitioner                        | 地理位置、优先级等 |
| Sticky      | 批次填满前一直发到同一个 partition                | 提高批处理效率     |

### 4.2 Producer

#### Producer 架构

```
                    ┌─────────────────────────────────────────────────┐
                    │                   Producer                       │
                    │                                                  │
  send(record) ──> │  ┌────────────┐   ┌────────────┐                │
                    │  │ Serializer │──>│Partitioner │                │
                    │  │ (key+value)│   │            │                │
                    │  └────────────┘   └─────┬──────┘                │
                    │                         │                        │
                    │         ┌────────────────┼────────────────┐      │
                    │         v                v                v      │
                    │  ┌──────────┐     ┌──────────┐    ┌──────────┐ │
                    │  │ Batch P0 │     │ Batch P1 │    │ Batch P2 │ │
                    │  │ (buffer) │     │ (buffer) │    │ (buffer) │ │
                    │  └────┬─────┘     └────┬─────┘    └────┬─────┘ │
                    │       └────────────────┬┘───────────────┘       │
                    │                        v                         │
                    │               ┌────────────────┐                │
                    │               │  Sender Thread  │                │
                    │               │  (background)   │                │
                    │               └────────┬───────┘                │
                    └────────────────────────┼─────────────────────────┘
                                             │
                              Network ───────┴──────── Network
                                │                          │
                           ┌────┴────┐              ┌──────┴──┐
                           │Broker 1 │              │Broker 2  │
                           │(P0 lead)│              │(P1 lead) │
                           └─────────┘              └──────────┘
```

#### 批处理与压缩

```
Producer 配置：

  batch.size = 16384            # 每批最大字节数（默认 16 KB）
  linger.ms = 5                 # 最多等待 5ms 以填满批次
  compression.type = lz4        # 压缩整个批次
  buffer.memory = 33554432      # 总缓冲区内存（32 MB）

批处理流程：
  Record 1 ─┐
  Record 2 ─┤
  Record 3 ─┼──> Batch（压缩后）──> 单次网络请求
  Record 4 ─┤
  Record 5 ─┘

压缩算法对比：
  ┌─────────────┬───────────┬───────────────┬─────────────────┐
  │ 算法        │ 压缩比    │ 压缩速度      │ 解压速度        │
  ├─────────────┼───────────┼───────────────┼─────────────────┤
  │ none        │ 1.0x      │ N/A           │ N/A             │
  │ gzip        │ ~0.35x    │ 慢            │ 中等            │
  │ snappy      │ ~0.45x    │ 快            │ 非常快          │
  │ lz4         │ ~0.40x    │ 非常快        │ 非常快          │
  │ zstd        │ ~0.33x    │ 中等          │ 快              │
  └─────────────┴───────────┴───────────────┴─────────────────┘

  推荐：大多数工作负载使用 lz4（速度/压缩比最佳平衡）
        对存储敏感的工作负载使用 zstd（最佳压缩比）
```

#### 确认模式

```
acks=0（发送即忘）
  Producer ──send──> Broker
  （不等待、不重试、最高吞吐量、可能丢失消息）

  吞吐量：~2,000,000 msgs/sec
  持久性：无
  使用场景：监控指标、日志等可接受丢失的场景

acks=1（Leader 确认）
  Producer ──send──> Leader Broker ──ack──> Producer
                         │
                         └──async replicate──> Followers
  （leader 确认写入，follower 可能落后）

  吞吐量：~1,000,000 msgs/sec
  持久性：可承受 follower 故障；leader 故障可能丢失数据
  使用场景：大多数通用工作负载

acks=all / acks=-1（完整 ISR 确认）
  Producer ──send──> Leader Broker ──replicate──> All ISR Followers
                         │                              │
                         │<─────────ack─────────────────┘
                         │
                         └──────────ack──> Producer
  （所有同步副本确认）

  吞吐量：~500,000 msgs/sec
  持久性：可承受任何单个 broker 故障；最强保证
  使用场景：金融交易、关键事件
```

#### 关键 Producer 配置

```properties
# 可靠性
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
enable.idempotence=true

# 性能
batch.size=65536
linger.ms=10
compression.type=lz4
buffer.memory=67108864

# 超时
delivery.timeout.ms=120000
request.timeout.ms=30000
```

### 4.3 Consumer 与 Consumer Group

#### Consumer Group 概念

Consumer group 是一组协同消费某个 topic 的 consumer。
每个 partition 仅分配给 group 内的一个 consumer。

```
Topic "orders" 有 6 个 partition：P0、P1、P2、P3、P4、P5

Consumer Group A（3 个 consumer）：
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  Consumer A1 ◄── P0, P1    （2 个 partition）           │
  │  Consumer A2 ◄── P2, P3    （2 个 partition）           │
  │  Consumer A3 ◄── P4, P5    （2 个 partition）           │
  │                                                         │
  │  每条消息只投递给一个 consumer                          │
  └─────────────────────────────────────────────────────────┘

Consumer Group B（2 个 consumer）- 独立于 Group A：
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  Consumer B1 ◄── P0, P1, P2    （3 个 partition）       │
  │  Consumer B2 ◄── P3, P4, P5    （3 个 partition）       │
  │                                                         │
  │  每条消息只投递给一个 consumer                          │
  └─────────────────────────────────────────────────────────┘

两个 group 都接收所有消息���独立消费）。
在每个 group 内部，消息在 consumer 之间进行负载均衡。
```

#### 在 Group 内扩展 Consumer

```
6 个 Partition：P0、P1、P2、P3、P4、P5

1 个 Consumer：    C1 ◄── P0, P1, P2, P3, P4, P5  （所有 partition）

2 个 Consumer：    C1 ◄── P0, P1, P2
                   C2 ◄── P3, P4, P5

3 个 Consumer：    C1 ◄── P0, P1
                   C2 ◄── P2, P3
                   C3 ◄── P4, P5

6 个 Consumer：    C1 ◄── P0
                   C2 ◄── P1
                   C3 ◄── P2
                   C4 ◄── P3
                   C5 ◄── P4
                   C6 ◄── P5

7 个 Consumer：    C1 ◄── P0    （一个 consumer 处于空闲状态！）
                   C2 ◄── P1
                   C3 ◄── P2
                   C4 ◄── P3
                   C5 ◄── P4
                   C6 ◄── P5
                   C7 ◄── （无分配 - 浪费资源）

规则：最大有效 consumer 数 = partition 数量
```

#### Rebalance 协议

```
Rebalance 触发条件：
  1. Consumer 加入 group
  2. Consumer 离开 group（优雅关闭或崩溃）
  3. Topic partition 数量变化
  4. Consumer 心跳超时（超过 session.timeout.ms）

Rebalance 流程（Eager 模式）：
  ┌──────────┐        ┌──────────────┐        ┌──────────┐
  │Consumer 1│        │Group Leader  │        │Consumer 2│
  │          │        │(Coordinator) │        │          │
  └────┬─────┘        └──────┬───────┘        └────┬─────┘
       │   JoinGroup         │                      │
       │────────────────────>│  JoinGroup            │
       │                     │<─────────────────────│
       │                     │                      │
       │  撤销所有           │    撤销所有          │
       │  partition          │    partition          │
       │                     │                      │
       │   SyncGroup         │                      │
       │────────────────────>│  SyncGroup            │
       │                     │<─────────────────────│
       │                     │                      │
       │  分配结果           │    分配结果          │
       │<────────────────────│─────────────────────>│
       │  (P0, P1)           │    (P2, P3)          │
       │                     │                      │

Rebalance 策略：
  ┌─────────────────┬────────────────────────────────────────────────┐
  │ 策略            │ 描述                                            │
  ├─────────────────┼────────────────────────────────────────────────┤
  │ Eager           │ 撤销全部，重新分配全部（导致停机）              │
  │ Cooperative     │ 增量式；只撤销需要移动的 partition              │
  │ Static          │ 通过 group.instance.id 固定分配                │
  └─────────────────┴────────────────────────────────────────────────┘
```

#### Offset 管理

```
Offset = consumer 在 partition 中的位置

Partition 0：
  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │
  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
                    ^               ^       ^
                    │               │       │
              已提交的          当前        日志末尾
              offset (3)      位置        offset
                                (7)

  已提交的 offset：最后确认已处理的 offset
  当前位置：consumer 当前正在读取的位置
  日志末尾 offset：partition 中最新消息（high watermark）
  Lag = log_end_offset - committed_offset = 9 - 3 = 6

自动提交：
  enable.auto.commit=true
  auto.commit.interval.ms=5000
  - 后台定期提交
  - 风险：提交之间崩溃 -> 重新处理消息（at-least-once）

手动提交：
  enable.auto.commit=false
  consumer.commitSync()  / consumer.commitAsync()
  - 应用程序控制何时提交 offset
  - 处理后提交：at-least-once
  - 处理前提交：at-most-once

Offset 存储：
  存储在内部 topic：__consumer_offsets（50 个 partition）
  Key：  (group_id, topic, partition)
  Value：(offset, metadata, timestamp)
```

### 4.4 消息存储

#### Append-Only 日志结构

```
Topic "payments"，Partition 0
目录：/data/kafka-logs/payments-0/

  ┌──────────────────────────────────────────────────────┐
  │                     Partition 0                       │
  │                                                      │
  │  Segment 0            Segment 1           Segment 2  │
  │  (offsets 0-999)     (offsets 1000-1999)  (活跃)     │
  │                                                      │
  │  ┌──────────────┐   ┌──────────────┐   ┌──────────┐ │
  │  │00000000.log  │   │00001000.log  │   │00002000. │ │
  │  │00000000.index│   │00001000.index│   │log       │ │
  │  │00000000.time │   │00001000.time │   │00002000. │ │
  │  │index         │   │index         │   │index     │ │
  │  └──────────────┘   └──────────────┘   │00002000. │ │
  │   (不可变)           (不可变)           │timeindex │ │
  │                                        └──────────┘ │
  │                                         (活跃，     │
  │                                          可写)      │
  └──────────────────────────────────────────────────────┘

文件命名：base_offset.{log, index, timeindex}
  00000000000000000000.log       # offset 0+ 开始的消息
  00000000000000001000.log       # offset 1000+ 开始的消息
```

#### 段文件

```
日志段 (.log)：
  ┌─────────────────────────────────────────────────────────┐
  │ Record Batch 1                                          │
  │ ┌─────────────────────────────────────────────────────┐ │
  │ │ Base Offset: 0                                      │ │
  │ │ Batch Length: 256 bytes                              │ │
  │ │ Magic: 2 (消息格式 v2)                              │ │
  │ │ CRC: 0x3A2B1C4D                                     │ │
  │ │ Compression: lz4                                     │ │
  │ │ Records:                                             │ │
  │ │   Record 0: {key: "user-123", value: "...", ts: ..} │ │
  │ │   Record 1: {key: "user-456", value: "...", ts: ..} │ │
  │ │   Record 2: {key: "user-789", value: "...", ts: ..} │ │
  │ └─────────────────────────────────────────────────────┘ │
  │ Record Batch 2                                          │
  │ ┌─────────────────────────────────────────────────────┐ │
  │ │ Base Offset: 3                                      │ │
  │ │ ...                                                  │ │
  │ └─────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘

段配置：
  log.segment.bytes=1073741824     # 每段 1 GB
  log.roll.ms=604800000            # 每 7 天滚动
  log.retention.hours=168          # 7 天后删除
  log.retention.bytes=-1           # 无大小限制（使用基于时间的策略）
  log.cleanup.policy=delete        # delete 或 compact
```

#### 索引文件实现快速查找

```
Offset 索引 (.index)：
  将 offset 映射到 .log 文件中的物理位置
  稀疏索引（不是每个 offset 都索引，默认每 4KB 数据一个条目）

  ┌──────────┬──────────────────┐
  │ Offset   │ 物理位置         │
  ├──────────┼──────────────────┤
  │ 0        │ 0                │
  │ 15       │ 4096             │
  │ 32       │ 8192             │
  │ 48       │ 12288            │
  │ ...      │ ...              │
  └──────────┴──────────────────┘

查找算法（查找 offset 37）：
  1. 按文件名对段文件进行二分查找 -> 从 00000000032 开始的段
  2. 在 .index 中二分查找 -> offset 32 位于位置 8192
  3. 从位置 8192 开始顺序扫描 .log 直到 offset 37

时间戳索引 (.timeindex)：
  将时间戳映射到 offset（用于基于时间的查找）

  ┌──────────────┬──────────┐
  │ 时间戳       │ Offset   │
  ├──────────────┼──────────┤
  │ 1700000000   │ 0        │
  │ 1700000100   │ 15       │
  │ 1700000200   │ 32       │
  └──────────────┴──────────┘
```

#### Zero-Copy 优化

```
传统数据传输（4 次拷贝）：
  Disk ──DMA──> Kernel Buffer ──CPU──> User Buffer ──CPU──> Socket Buffer ──DMA──> NIC
  （4 次拷贝，内核态和用户态之间 2 次上下文切换）

Zero-copy 传输（2 次拷贝）：
  Disk ──DMA──> Kernel Buffer ──DMA──> NIC
  （2 次拷贝，0 次用户态上下文切换）

  使用 Linux sendfile() 系统调用
  Java：FileChannel.transferTo()

  效果：consumer 读取的 CPU 使用率降低 ~65%
        大量读取的吞吐量提升 ~3 倍
```

---

## 5. 数据模型

### 消息格式（Kafka Record）

```
Record（消息 v2 格式）：
  ┌──────────────────────────────────────────────────────────┐
  │ 字段              │ 大小      │ 描述                      │
  ├───────────────────┼───────────┼───────────────────────────┤
  │ length            │ varint    │ 记录总大小                 │
  │ attributes        │ int8      │ 未使用（保留）             │
  │ timestamp_delta   │ varint    │ 与批次时间戳的差值         │
  │ offset_delta      │ varint    │ 与批次 base offset 的差值  │
  │ key_length        │ varint    │ Key 大小（null 时为 -1）   │
  │ key               │ bytes     │ 消息 key（可选）           │
  │ value_length      │ varint    │ Value 大小（null 时为 -1） │
  │ value             │ bytes     │ 消息负载                   │
  │ headers_count     │ varint    │ header 数量                │
  │ headers[]         │ varies    │ key-value header 对        │
  └──────────────────────────────────────────────────────────┘

Record Batch（包装多条记录）：
  ┌──────────────────────────────────────────────────────────┐
  │ base_offset        │ int64    │ 批次中第一个 offset        │
  │ batch_length       │ int32    │ 批次总大小                 │
  │ partition_leader_  │ int32    │ 用于 fencing 的 leader epoch│
  │ epoch              │          ��                            │
  │ magic              │ int8     │ 格式版本（2）              │
  │ crc                │ int32    │ 剩余字段的 CRC             │
  │ attributes         │ int16    │ 压缩方式、时间戳类型       │
  │ last_offset_delta  │ int32    │ 最后一条记录的 offset 差值 │
  │ first_timestamp    │ int64    │ 第一条记录的时间戳         │
  │ max_timestamp      │ int64    │ 批次中的最大时间戳         │
  │ producer_id        │ int64    │ 用于幂等 producer          │
  │ producer_epoch     │ int16    │ Producer epoch             │
  │ base_sequence      │ int32    │ 第一个序列号               │
  │ records_count      │ int32    │ 记录数量                   │
  │ records[]          │ varies   │ 实际记录                   │
  └──────────────────────────────────────────────────────────┘
```

### Topic 元数据

```json
{
  "topic": "user-events",
  "partitions": [
    {
      "partition": 0,
      "leader": 1,
      "replicas": [1, 2, 3],
      "isr": [1, 2, 3],
      "leader_epoch": 5
    },
    {
      "partition": 1,
      "leader": 2,
      "replicas": [2, 3, 1],
      "isr": [2, 3, 1],
      "leader_epoch": 3
    },
    {
      "partition": 2,
      "leader": 3,
      "replicas": [3, 1, 2],
      "isr": [3, 1, 2],
      "leader_epoch": 7
    }
  ],
  "config": {
    "retention.ms": 604800000,
    "segment.bytes": 1073741824,
    "cleanup.policy": "delete",
    "min.insync.replicas": 2,
    "compression.type": "producer"
  }
}
```

### Consumer Group Offset

```
内部 topic：__consumer_offsets

Key：  [group_id, topic, partition]
Value：[offset, leader_epoch, metadata, commit_timestamp]

示例条目：
  Key：  ["analytics-group", "user-events", 0]
  Value: {
    "offset": 15432,
    "leader_epoch": 5,
    "metadata": "",
    "commit_timestamp": 1700000500000
  }

Compacted topic：
  - 相同 key 的旧条目会被垃圾回收
  - 每个 (group, topic, partition) 只保留最新的 offset
  - 默认 50 个 partition（offsets.topic.num.partitions）
```

### Broker 元数据（KRaft）

```
KRaft 元数据记录（存储在 __cluster_metadata topic 中）：

  BrokerRegistration:
    { broker_id: 1, host: "broker1.example.com", port: 9092,
      rack: "us-east-1a", endpoints: [...], features: {...} }

  TopicRecord:
    { topic_name: "user-events", topic_id: "uuid-abc-123" }

  PartitionRecord:
    { topic_id: "uuid-abc-123", partition: 0,
      leader: 1, replicas: [1,2,3], isr: [1,2,3],
      leader_epoch: 5, partition_epoch: 8 }

  PartitionChangeRecord:
    { topic_id: "uuid-abc-123", partition: 0,
      isr: [1,3], leader: 1, leader_epoch: 6 }
```

---

## 6. 副本复制与容错

### 每个 Partition 的 Leader-Follower 复制

```
Topic "orders"，Partition 0，Replication Factor = 3

  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Broker 1 (LEADER)                                          │
  │  ┌──────────────────────────────────────────┐               │
  │  │ P0: [0][1][2][3][4][5][6][7][8][9]      │               │
  │  │                               ^          │               │
  │  │                          LEO = 10        │               │
  │  │                          HW  = 8         │               │
  │  └──────────────────────────────────────────┘               │
  │       │ replicate               │ replicate                 │
  │       v                         v                           │
  │  Broker 2 (FOLLOWER, ISR)  Broker 3 (FOLLOWER, ISR)       │
  │  ┌──────────────────────┐  ┌──────────────────────┐        │
  │  │ P0: [0][1]...[7][8] │  │ P0: [0][1]...[7]    │        │
  │  │              ^       │  │              ^       │        │
  │  │         LEO = 9     │  │         LEO = 8     │        │
  │  └──────────────────────┘  └──────────────────────┘        │
  │                                                              │
  │  LEO = Log End Offset（该副本上的最新 offset）              │
  │  HW  = High Watermark（所有 ISR 副本中 LEO 的最小值）      │
  │                                                              │
  │  Consumer 只能读取到 HW（offset 8）                         │
  │  这防止了读取未提交（未复制）的数据                         │
  └──────────────────────────────────────────────────────────────┘
```

### In-Sync Replicas (ISR)

```
ISR = "跟上" leader 的副本集合

副本在 ISR 中的条件：
  1. 在 replica.lag.time.max.ms（默认 30s）内从 leader 拉取过数据
  2. 存活且连接到 ZK/KRaft

ISR 缩减场景：
  时刻 0：ISR = [1, 2, 3]    （所有副本已跟上）
  时刻 1：Broker 3 变慢（网络问题）
  时刻 2：Broker 3 滞后超过 replica.lag.time.max.ms
  时刻 3：ISR = [1, 2]       （Broker 3 从 ISR 中移除）
  时刻 4：Broker 3 追上进度
  时刻 5：ISR = [1, 2, 3]    （Broker 3 重新加入 ISR）

  min.insync.replicas = 2（推荐 replication factor 为 3 时使用）
  - 配合 acks=all，要求至少 2 个副本确认
  - 如果 ISR 降至 min.insync.replicas 以下，producer 收到
    NotEnoughReplicasException（防止副本不足时写入）
```

### Leader 选举过程

```
场景：Broker 1（P0 的 leader）崩溃

  崩溃前：
    ISR(P0) = [Broker 1 (L), Broker 2, Broker 3]

  步骤 1：Controller 检测到 Broker 1 故障
    - ZK：会话超时 / 临时节点消失
    - KRaft：心跳超时

  步骤 2：Controller 从 ISR 中选择新 leader
    - 优先：ISR 列表中的第一个副本
    - 新 leader：Broker 2

  步骤 3：Controller 更新元数据
    - ISR(P0) = [Broker 2 (L), Broker 3]
    - Leader epoch 递增：5 -> 6

  步骤 4：Controller 通知所有 broker 新的 leader
    - Producer 将写入重定向到 Broker 2
    - Consumer 将读取重定向到 Broker 2
    - Broker 3 开始从 Broker 2 拉取数据

  步骤 5：Broker 1 恢复上线
    - 将日志截断到 HW（移除未复制的消息）
    - 开始从新 leader（Broker 2）拉取数据
    - 最终重新加入 ISR

  选举类型：
    Clean 选举：从 ISR 中选择新 leader（无数据丢失）
    Unclean 选举：无可用 ISR 副本；选择任意副本
                   （unclean.leader.election.enable=true）
                   风险：数据丢失（被选中的副本可能落后）
```

### 处理 Broker 故障

```
┌──────────────────┬────────────────────────────────────────────────┐
│ 故障类型         │ 恢复操作                                        │
├──────────────────┼────────────────────────────────────────────────┤
│ 单个 follower    │ 从 ISR 中移除；追上后重新加入。                │
│ 崩溃             │ 对读写无影响。                                  │
├──────────────────┼────────────────────────────────────────────────┤
│ Leader 崩溃      │ 从 ISR 中选举新 leader。                       │
│                  │ 选举期间短暂不可用（< 1 秒）。                 │
│                  │ 如果满足 min.insync.replicas 则无数据丢失。    │
├──────────────────┼────────────────────────────────────────────────┤
│ 多个 broker      │ 如果 ISR 有法定人数，选举新 leader。           │
│ 崩溃             │ 如果 ISR 为空，partition 不可用                │
│                  │ （除非启用 unclean 选举）。                    │
├──────────────────┼────────────────────────────────────────────────┤
│ 磁盘故障         │ Broker 标记为死亡。所有 leader partition       │
│                  │ 重新选举。替换 broker 加入后将数据重新复制。   │
├──────────────────┼────────────────────────────────────────────────┤
│ 网络分区         │ 滞后超时后 broker 从 ISR 中移除。             │
│                  │ 网络恢复且追上后重新加入 ISR。                 │
└──────────────────┴────────────────────────────────────────────────┘
```

---

## 7. 投递语义

### 三种保证

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AT-MOST-ONCE                                │
│                                                                     │
│  Producer：acks=0，不重试                                          │
│  Consumer：处理前提交 offset                                       │
│                                                                     │
│  流程：                                                             │
│    1. Consumer 读取 offset 5 的消息                                │
│    2. Consumer 提交 offset 6（下一个要读取的）                     │
│    3. Consumer 处理消息                                             │
│    4. 如果在步骤 3 崩溃：消息丢失（已提交跳过它）                  │
│                                                                     │
│  保证：消息投递 0 或 1 次                                          │
│  数据丢失：可能                                                     │
│  重复：无                                                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        AT-LEAST-ONCE                                │
│                                                                     │
│  Producer：acks=all，启用重试                                      │
│  Consumer：处理后提交 offset                                       │
│                                                                     │
│  流程：                                                             │
│    1. Consumer 读取 offset 5 的消息                                │
│    2. Consumer 处理消息                                             │
│    3. Consumer 提交 offset 6                                       │
│    4. 如果在步骤 3 崩溃：消息重新处理（offset 未提交）             │
│                                                                     │
│  保证：消息投递 1 次或多次                                         │
│  数据丢失：无                                                       │
│  重复：可能（consumer 必须是幂等的）                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         EXACTLY-ONCE                                │
│                                                                     │
│  Producer：Idempotent producer（enable.idempotence=true）          │
│  Consumer：Transactional consumer + 原子 offset 提交              │
│                                                                     │
│  Producer 端（幂等）：                                              │
│    - 每个 producer 获得唯一的 Producer ID（PID）                   │
│    - 每条消息获得单调递增的序列号                                  │
│    - Broker 通过 (PID, sequence) 对进行去重                        │
│    - 重试不会产生重复                                               │
│                                                                     │
│  Consumer 端（事务性）：                                            │
│    - 从输入 topic 读取消息                                         │
│    - 处理并生产到输出 topic                                        │
│    - 原子性提交输入 offset 和输出消息                              │
│    - 使用两阶段提交协议                                             │
│                                                                     │
│  保证：端到端 exactly-once 处理                                    │
│  数据丢失：无                                                       │
│  重复：无                                                           │
│  代价：吞吐量降低 ~20%                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 对比表

| 语义          | Producer 配置              | Consumer 配置          | 数据丢失 | 重复 | 吞吐量 | 使用场景       |
| ------------- | -------------------------- | ---------------------- | -------- | ---- | ------ | -------------- |
| At-most-once  | acks=0，不重试             | 处理前提���            | 是       | 否   | 最高   | 监控指标、日志 |
| At-least-once | acks=all，retries=MAX      | 处理后提交             | 否       | 是   | 高     | 大多数应用     |
| Exactly-once  | Idempotent + transactional | Transactional consumer | 否       | 否   | 中等   | 金融、计费     |

### Idempotent Producer 深入解析

```
没有 idempotent producer：
  Producer ──msg(seq=1)──> Broker（写入）
  Producer ◄──ack 丢失──── Broker
  Producer ──msg(seq=1)──> Broker（写入重复！）

  Partition 日志：[msg1, msg1]  <-- 重复

有 idempotent producer（enable.idempotence=true）：
  Producer ──msg(PID=5, seq=1)──> Broker（写入，存储 PID+seq）
  Producer ◄──ack 丢失───────── Broker
  Producer ──msg(PID=5, seq=1)──> Broker（检测到重复，丢弃）

  Partition 日志：[msg1]  <-- 无重复

  Broker 维护：{ PID: 5, last_sequence: { partition_0: 1 } }
  如果传入 seq <= 相同 PID 已存储的 seq：丢弃为重复
  如果传入 seq > 已存储 seq + 1：OutOfOrderSequenceException
```

### Exactly-Once 语义（事务性）

```
事务性处理模式（consume-transform-produce）：

  Input Topic           处理                    Output Topic
  ┌───────────┐                                 ┌───────────┐
  │ msg A     │──read──>  transform(A) ──write──>│ result A  │
  │ msg B     │──read──>  transform(B) ──write──>│ result B  │
  └───────────┘                                 └───────────┘
                              │
                              └──原子性提交 offset + 输出──>
                                （全有或全无，通过 2PC）

  __consumer_offsets：原子性更新 offset
  __transaction_state：跟踪进行中的事务

配置：
  # Producer
  enable.idempotence=true
  transactional.id=my-transaction-id

  # Consumer
  isolation.level=read_committed
  # 只能看到已提交事务的消息
```

---

## 8. 性能优化

### Kafka 为什么快

```
┌───────────────────────────────────────────────────────────────────┐
│                  传统消息中间件                                    │
│                                                                   │
│  写入：随机 I/O 写入 B-tree 索引 + 数据文件                      │
│  读取：随机 I/O 在索引中查找，然后读取数据                       │
│  结果：每磁盘 ~100 MB/sec（受随机 I/O 限制）                     │
│                                                                   │
│  磁盘寻道时间：~10ms（HDD），~0.1ms（SSD）                       │
│  随机 IOPS：~200（HDD），~100,000（SSD）                          │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                       Kafka                                       │
│                                                                   │
│  写入：顺序追加到日志文件末尾                                    │
│  读取：从日志文件顺序读取（通常从 page cache 提供）              │
│  结果：每磁盘 ~600 MB/sec（顺序 I/O）                            │
│                                                                   │
│  顺序磁盘吞吐量：~600 MB/sec（HDD），~3 GB/sec（SSD）            │
│  比 HDD 随机 I/O 快 6 倍，SSD 快 ~30 倍                         │
└───────────────────────────────────────────────────────────────────┘
```

### 顺序 I/O

```
传统方式（随机写入）：
  ┌────────────────────────────────────────────┐
  │ 磁盘                                      │
  │    ┌──┐   ┌──┐         ┌──┐               │
  │    │A │   │C │         │B │               │
  │    └──┘   └──┘         └──┘               │
  │  寻道 ──> 写入 ──> 寻道 ──> 写入 ──>...  │
  │  磁头来回跳转（慢）                       │
  └────────────────────────────────────────────┘

Kafka 方式（顺序追加）：
  ┌────────────────────────────────────────────┐
  │ 磁盘                                      │
  │  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┐            │
  │  │A │B │C │D │E │F │G │H │  │<-- 追加    │
  │  └──┴──┴──┴──┴──┴──┴──┴──┴──┘   到这里   │
  │  始终写入末尾（快）                        │
  │  无寻道，无碎片                            │
  └────────────────────────────────────────────┘

  关键洞察：在许多情况下，顺序磁盘 I/O 比随机内存访问更快。
  这就是 Kafka 使用磁盘而非内存存储的原因。
```

### Page Cache 利用

```
Linux Page Cache：
  ┌─────────────────────────────────────────────────────────┐
  │                     RAM (128 GB)                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │              OS Page Cache (~100 GB)               │  │
  │  │                                                    │  │
  │  │  最近写入的数据       最近读取的数据              │  │
  │  │  (producer 热数据)    (consumer 热数据)            │  │
  │  │                                                    │  │
  │  │  当 consumer 读取刚刚生产的数据时：               │  │
  │  │  -> 直接从 page cache 提供服务                     │  │
  │  │  -> 实时 consumer 零磁盘 I/O                      │  │
  │  └───────────────────────────────────────────────────┘  │
  │  ┌─────────────────────┐                                │
  │  │  JVM Heap (~6 GB)   │ (Kafka 进程)                  │
  │  └─────────────────────┘                                │
  │  ┌─────────────────────┐                                │
  │  │  OS + 其他 (~22 GB) │                                │
  │  └─────────────────────┘                                │
  └─────────────────────────────────────────────────────────┘

  Kafka 刻意不在 JVM 堆中缓存数据：
    - 避免 GC 暂停
    - 避免双重缓冲（JVM 堆 + OS 缓存）
    - OS page cache 由内核管理（LRU，高效）
    - 在 Kafka 进程重启后缓存依然存在（缓存在 OS 中，不在进程中）
```

### Zero-Copy 传输

```
无 zero-copy（传统方式）：
  ┌──────┐  DMA   ┌────────────┐  CPU   ┌────────────┐  CPU   ┌──────────┐  DMA   ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──copy──>│ User Buf   │──copy──>│Socket Buf│──copy──>│ NIC │
  └──────┘    1    └────────────┘    2    └────────────┘    3    └──────────┘    4    └─────┘
                    上下文切换              上下文切换
                    (kernel->user)         (user->kernel)

  4 次数据拷贝，2 次上下文切换

有 zero-copy（Kafka 使用 sendfile()）：
  ┌──────┐  DMA   ┌────────────┐  DMA   ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──copy──>│ NIC │
  └──────┘    1    └────────────┘    2    └─────┘

  2 次数据拷贝，0 次用户态上下文切换
  sendfile() 告诉内核直接将数据从文件传输到 socket

  使用 DMA scatter-gather（现代网卡）：
  ┌──────┐  DMA   ┌────────────┐  DMA gather  ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──(无拷贝)───>│ NIC │
  └──────┘    1    └────────────┘               └─────┘

  实际上只有 1 次拷贝（DMA 从磁盘到内核缓冲区，NIC 从那里读取）
```

### 批处理（Producer 和 Consumer）

```
Producer 批处理：
  无批处理：
    msg1 -> [网络往返] -> ack
    msg2 -> [网络往返] -> ack
    msg3 -> [网络往返] -> ack
    总计：3 次往返，3 次系统调用，低吞吐量

  有批处理（batch.size=64KB，linger.ms=5）：
    msg1 ─┐
    msg2 ─┼─> [batch] -> [1 次网络往返] -> ack
    msg3 ─┘
    总计：1 次往返，1 次系统调用，高吞吐量

Consumer 批处理：
  fetch.min.bytes=1048576     # 等待直到有 1 MB 数据可用
  fetch.max.wait.ms=500       # 或最多等待 500ms
  max.poll.records=500        # 每次 poll 最多返回 500 条记录

  Consumer 轮询一次 -> 接收消息批次 -> 处理批次
  将网络开销摊销到多条消息上
```

### 性能总结

```
┌──────────────────────┬──────────────────────────────────────────────┐
│ 优化                 │ 影响                                         │
├──────────────────────┼──────────────────────────────────────────────┤
│ 顺序 I/O             │ 比随机 I/O 快 6 倍（HDD）                   │
│ Page cache            │ 实时 consumer 接近零延迟                     │
│ Zero-copy             │ CPU 降低 65%，读取吞吐量提升 3 倍            │
│ 批处理                │ 摊销网络/系统调用开销                        │
│ 压缩                  │ 网络/磁盘 I/O 减少 50-70%                   │
│ Partition 并行         │ 随 partition 数量线性扩展                    │
│ 稀疏索引              │ 无需完整索引即可 O(log n) 查找 offset        │
│ 仅 leader 读取        │ 避免一致性复杂度                             │
└──────────────────────┴──────────────────────────────────────────────┘

典型基准测试数据（每个 broker，单个 partition）：
  Producer（acks=1，无压缩）：~800,000 msgs/sec，~80 MB/sec
  Producer（acks=all，lz4）：  ~400,000 msgs/sec，~40 MB/sec
  Consumer（单个 partition）：  ~900,000 msgs/sec，~90 MB/sec

集群聚合（25 个 broker，100 个 partition）：
  Producer：~10,000,000 msgs/sec
  Consumer：~20,000,000 msgs/sec（受 partition 数量限制）
```

---

## 9. 消息顺序

### 每个 Partition 的顺序保证

```
Kafka 保证：单个 partition 内的消息严格有序。

Producer 发送：A、B、C、D、E（按顺序）到 Partition 0

  Partition 0：
  ┌───┬───┬───┬───┬───┐
  │ A │ B │ C │ D │ E │
  └───┴───┴───┴───┴───┘
  offset: 0   1   2   3   4

  Consumer 读取：A、B、C、D、E（保证相同顺序）

但跨 partition 没有顺序保证：
  P0: [A, C, E]
  P1: [B, D, F]

  Consumer 可能读取：B、A、C、D、E、F（交错，全局无序）
```

### 基于 Key 的分区实现实体排序

```
使用场景：user-123 的所有事件必须有序

  Producer 使用 key = "user-123"：
    hash("user-123") % 3 = 1  -> 始终发到 Partition 1

  P0: [user-456 事件]
  P1: [user-123 事件]  <-- 所有 user-123 事件在这里有序
  P2: [user-789 事件]

  只要 partition 数量不变，相同 key -> 相同 partition
  警告：增加 partition 会改变 hash 映射，破坏排序！
```

### 全局排序（单 Partition 权衡）

```
如果需要所有消息的全局排序：

  方案：使用单个 partition
    Topic "transactions"（1 个 partition）
    ┌───┬───┬───┬───┬───┬───┬───┬───┐
    │ A │ B │ C │ D │ E │ F │ G │ H │
    └───┴───┴───┴───┴───┴───┴───┴───┘
    全局有序：A < B < C < D < E < F < G < H

  权衡：
    + 完美的全局排序
    - 最多 1 个 consumer（group 内无并行）
    - 有限的吞吐量（~10,000-50,000 msgs/sec）
    - 单点故障（一个 partition leader）
    - 无法水平扩展

  可接受的场景：
    - 低流量 topic（配置变更、管理事件）
    - 严格排序 > 吞吐量（金融账本）
```

### 因果排序模式

```
模式 1：通过分区实现因果排序
  事件：UserCreated -> OrderPlaced -> OrderShipped
  Key：user_id（同一用户的所有事件发到同一 partition）
  结果：保证每用户的因果排序

模式 2：跨实体的因果排序
  问题：订单同时依赖用户和产品
  方案：在消息 header 中使用序列号或向量时钟

  消息：{
    key: "order-456",
    value: { ... },
    headers: {
      "causal-deps": "user-123:5,product-789:3"
    }
  }

  Consumer：缓冲消息直到所有因果依赖满足
  复杂度：需要大量应用层逻辑

模式 3：单写者模式
  每个 partition 一个 producer -> 天然的因果排序
  示例：每个微服务实例拥有特定的 partition
  避免并发 producer 导致的乱序问题

排序 + 重试：
  max.in.flight.requests.per.connection=1（最安全，较慢）
  或
  enable.idempotence=true + max.in.flight.requests.per.connection=5
  （idempotent producer 即使有多个 in-flight 请求也能正确重排序）
```

---

## 10. 扩展

### 增加 Partition

```
当前：Topic "events" 有 6 个 partition

  kafka-topics.sh --alter --topic events --partitions 12

  之前：                          之后：
  P0 [###########]               P0  [###########]  （现有数据）
  P1 [###########]               P1  [###########]  （现有数据）
  P2 [###########]               P2  [###########]  （现有数据）
  P3 [###########]               P3  [###########]  （现有数据）
  P4 [###########]               P4  [###########]  （现有数据）
  P5 [###########]               P5  [###########]  （现有数据）
                                  P6  []             （空，新的）
                                  P7  []             （空，新的）
                                  P8  []             （空，新的）
                                  P9  []             （空，新的）
                                  P10 []             （空，新的）
                                  P11 []             （空，新的）

  影响：
    + 更高并行度（更多 consumer 可以参与）
    + 更高吞吐量容量
    - 基于 Key 的路由被破坏：hash(key) % 12 != hash(key) % 6
    - 现有数据保留在旧 partition 中（不会重新均衡）
    - 无法减少 partition 数量（不可逆操作）
    - 触发 consumer group rebalance

  建议：初始时多分配 partition
    从比当前需要更多的 partition 数开始
    典型值：预期峰值 consumer 数量的 3 倍
```

### 增加 Broker 与 Partition 重新分配

```
当前：3 个 broker，12 个 partition

  Broker 1: P0, P3, P6, P9    （4 个 partition，leader）
  Broker 2: P1, P4, P7, P10   （4 个 partition，leader）
  Broker 3: P2, P5, P8, P11   （4 个 partition，leader）

增加 Broker 4：
  Broker 4:（空 - 不会自动接收任何 partition！）

  必须手动重新分配 partition：
  kafka-reassign-partitions.sh --reassignment-json-file plan.json --execute

  plan.json:
  {
    "partitions": [
      {"topic": "events", "partition": 9,  "replicas": [4, 1, 2]},
      {"topic": "events", "partition": 10, "replicas": [4, 2, 3]},
      {"topic": "events", "partition": 11, "replicas": [4, 3, 1]}
    ]
  }

  重新分配后：
  Broker 1: P0, P3, P6         （3 个 partition）
  Broker 2: P1, P4, P7         （3 个 partition）
  Broker 3: P2, P5, P8         （3 个 partition）
  Broker 4: P9, P10, P11       （3 个 partition）<-- 已均衡

  数据迁移在后台进行（限流以避免影响流量）
  kafka-reassign-partitions.sh --throttle 50000000  # 50 MB/sec 限制
```

### Consumer 扩展

```
在 consumer group 内扩展 consumer：

  Partition 数量 = 最大有效 consumer 数

  有 6 个 partition 的 topic：
  ┌─────────────────────────────���──────────────────────────────┐
  │ Consumer 数 │ 分配                      │ 吞吐量           │
  ├───────────┼───────────────────────────┼─────────────────────┤
  │ 1         │ C1: P0,P1,P2,P3,P4,P5    │ 1x（瓶颈）        │
  │ 2         │ C1: P0,P1,P2 / C2: P3,P4,P5 │ ~2x             │
  │ 3         │ C1: P0,P1 / C2: P2,P3 / C3: P4,P5 │ ~3x      │
  │ 6         │ C1:P0/C2:P1/C3:P2/C4:P3/C5:P4/C6:P5│ 6x（最大）│
  │ 7         │ 同 6 个，C7 空闲          │ 6x（浪费 C7）    │
  │ 12        │ 同 6 个，6 个空闲         │ 6x（浪费 6 个）  │
  └────────────────────────────────────────────────────────────┘

  超过 partition 数量后的扩展方式：
    方案 A：增加 partition（会改变 key 路由）
    方案 B：内部并行（每个 consumer 使用线程池）
    方案 C：增加 consumer group（用于不同的处理逻辑）

  Consumer lag 监控：
    kafka-consumer-groups.sh --describe --group my-group

    GROUP      TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
    my-group   events     0          15432           15500           68
    my-group   events     1          22100           22100           0
    my-group   events     2          18700           19200           500
```

### 多集群复制（MirrorMaker）

```
跨数据中心复制：

  DC-East（主）                       DC-West（副本）
  ┌──────────────────────┐            ┌──────────────────────┐
  │  Kafka Cluster A     │            │  Kafka Cluster B     │
  │                      │            │                      │
  │  Topic: orders       │ ──MM2──>  │  Topic: orders       │
  │  Topic: payments     │ ──MM2──>  │  Topic: payments     │
  │  Topic: user-events  │ ──MM2──>  │  Topic: user-events  │
  │                      │            │                      │
  └──────────────────────┘            └──────────────────────┘
         │                                     │
    MirrorMaker 2 (MM2)                   Consumer 从
    - 复制 topic                          本地集群读取
    - 保留 offset                         （低延迟）
    - 处理 schema

  复制模式：
    Active-Passive：一个主，一个灾备（DR）
    Active-Active：  两个集群都接受写入（复杂的冲突解决）
    Hub-and-Spoke：  中心集群从区域集群聚合
    Fan-out：        中心集群复制到区域集群

  MirrorMaker 2 特性：
    - 基于 Kafka Connect 构建（分布式、可扩展）
    - 自动发现和创建 topic
    - Offset 转换（将源 offset 映射到目标 offset）
    - 心跳和检查点用于监控
    - 可配置的复制策略
```

---

## 11. 部署架构

### 生产集群布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          生产 Kafka 集群                                    │
│                                                                             │
│  ┌──── 可用区 1 ────────────────┐  ┌──── 可用区 2 ────────────────┐       │
│  │                                │  │                                │     │
│  │  ┌────────────┐ ┌────────────┐│  │  ┌────────────┐ ┌────────────┐│     │
│  │  │  Broker 1  │ │  Broker 2  ││  │  │  Broker 3  │ │  Broker 4  ││     │
│  │  │  32 cores  │ │  32 cores  ││  │  │  32 cores  │ │  32 cores  ││     │
│  │  │  128GB RAM │ │  128GB RAM ││  │  │  128GB RAM │ │  128GB RAM ││     │
│  │  │  12x 2TB   │ │  12x 2TB   ││  │  │  12x 2TB   │ │  12x 2TB   ││     │
│  │  │  SSD JBOD  │ │  SSD JBOD  ││  │  │  SSD JBOD  │ │  SSD JBOD  ││     │
│  │  │  10Gbps NIC│ │  10Gbps NIC││  │  │  10Gbps NIC│ │  10Gbps NIC││     │
│  │  └────────────┘ └────────────┘│  │  └────────────┘ └────────────┘│     │
│  │                                │  │                                │     │
│  │  ┌────────────┐               │  │  ┌────────────┐               │     │
│  │  │ KRaft      │               │  │  │ KRaft      │               │     │
│  │  │ Controller │               │  │  │ Controller │               │     │
│  │  │ (voter)    │               │  │  │ (voter)    │               │     │
│  │  └────────────┘               │  │  └────────────┘               │     │
│  └────────────────────────────────┘  └────────────────────────────────┘     │
│                                                                             │
│  ┌──── 可用区 3 ────────────────┐                                         │
│  │                                │  ┌──────────────────────────────────┐   │
│  │  ┌────────────┐ ┌────────────┐│  │     监控与管理                   │   │
│  │  │  Broker 5  │ │  Broker 6  ││  │                                  │   │
│  │  │  32 cores  │ │  32 cores  ││  │  ┌─────────┐  ┌──────────────┐ │   │
│  │  │  128GB RAM │ │  128GB RAM ││  │  │Prometheus│  │ Grafana      │ │   │
│  │  │  12x 2TB   │ │  12x 2TB   ││  │  │ + JMX   │  │ Dashboards   │ │   │
│  │  │  SSD JBOD  │ │  SSD JBOD  ││  │  │Exporter  │  │              │ │   │
│  │  │  10Gbps NIC│ │  10Gbps NIC││  │  └─────────┘  └──────────────┘ │   │
│  │  └────────────┘ └────────────┘│  │                                  │   │
│  │                                │  │  ┌─────────┐  ┌──────────────┐ │   │
│  │  ┌────────────┐               │  │  │ Cruise  │  │ Schema       │ │   │
│  │  │ KRaft      │               │  │  │ Control │  │ Registry     │ │   │
│  │  │ Controller │               │  │  │ (自动   │  │ (Avro/Proto) │ │   │
│  │  │ (voter)    │               │  │  │  均衡)  │  │              │ │   │
│  │  └────────────┘               │  │  └─────────┘  └──────────────┘ │   │
│  └────────────────────────────────┘  └──────────────────────────────────┘   │
│                                                                             │
│  Replication factor：3（每个可用区一个副本）                               │
│  min.insync.replicas：2                                                    │
│  KRaft：3 个 controller（每个可用区一个，基于 quorum 的 leader 选举）     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 多数据中心部署

```
                    ┌────────────────────────────────────┐
                    │          全局 DNS / LB              │
                    │   （将 producer 路由到最近的 DC）   │
                    └───────────┬────────────┬───────────┘
                                │            │
              ┌─────────────────┘            └──────────────────┐
              │                                                  │
  ┌───────────┴──────────────┐            ┌──────────────────────┴──┐
  │    DC-East（主）          │            │    DC-West（Active DR）  │
  │                           │            │                          │
  │  Kafka Cluster            │            │  Kafka Cluster           │
  │  6 Brokers, 3 AZs        │  ◄──MM2──► │  6 Brokers, 3 AZs       │
  │                           │            │                          │
  │  Topics：                 │            │  Topics（复制的）：      │
  │  - orders                 │            │  - dc-east.orders        │
  │  - payments               │            │  - dc-east.payments      │
  │  - user-events            │            │  - dc-west.orders        │
  │                           │            │  - dc-west.payments      │
  │  Schema Registry          │            │  Schema Registry         │
  │  （主）                   │            │  （从）                  │
  └───────────────────────────┘            └──────────────────────────┘

  Active-Active 注意事项：
    1. Topic 命名：以数据中心名称前缀避免冲突
    2. 冲突解决：最后写入者获胜或应用层合并
    3. Offset 转换：MM2 维护集群间的 offset 映射
    4. Consumer 故障转移：Consumer 从本地集群读取，故障时切换到远程

  延迟预算：
    数据中心内：< 1ms（同可用区），< 2ms（跨可用区）
    跨数据中心：~30ms（同区域），~100ms（跨区域）
    复制：异步（数据中心间最终一致性）

  RPO/RTO 目标：
    Active-Passive：RPO = 复制延迟（~秒级），RTO = ~分钟级
    Active-Active：RPO = 0（每个 DC 有自己的数据），RTO = ~秒级
```

### 硬件建议

```
┌────────────────┬─────────────────────────────────────────────────────┐
│ 组件           │ 建议                                                │
├────────────────┼─────────────────────────────────────────────────────┤
│ CPU            │ 16-32 核（Kafka 是 I/O 密集型，非 CPU 密集型）     │
│ 内存           │ 128 GB（主要用于 OS page cache，JVM 堆 ~6 GB）    │
│ 磁盘           │ 12x 2TB SSD JBOD（无 RAID，Kafka 通过复制         │
│                │ 处理冗余）                                          │
│ 网络           │ 最低 10 Gbps NIC（高吞吐量场景用 25 Gbps）        │
│ 操作系统       │ Linux（ext4 或 XFS 文件系统）                      │
│ JVM            │ Java 17+，G1GC，6 GB 堆                            │
└────────────────┴─────────────────────────────────────────────────────┘

JVM 设置：
  -Xmx6g -Xms6g
  -XX:+UseG1GC
  -XX:MaxGCPauseMillis=20
  -XX:InitiatingHeapOccupancyPercent=35

OS 调优：
  vm.swappiness=1                         # 最小化交换
  vm.dirty_background_ratio=5             # 脏页达 5% 时开始刷写
  vm.dirty_ratio=60                       # 脏页达 60% 时阻塞
  net.core.wmem_max=2097152               # Socket 发送缓冲区
  net.core.rmem_max=2097152               # Socket 接收缓冲区
  fs.file-max=1000000                     # 最大打开文件数
  net.ipv4.tcp_max_syn_backlog=4096       # TCP 积压
```

### 生产关键 Broker 配置

```properties
# Broker 身份
broker.id=1
listeners=PLAINTEXT://broker1:9092,SSL://broker1:9093
advertised.listeners=PLAINTEXT://broker1.example.com:9092

# 日志存储
log.dirs=/data/kafka-logs-1,/data/kafka-logs-2,/data/kafka-logs-3
log.retention.hours=168
log.retention.bytes=-1
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000

# 复制
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
replica.lag.time.max.ms=30000

# 性能
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# Topic 默认值
num.partitions=12
auto.create.topics.enable=false
delete.topic.enable=true

# ZK/KRaft
# KRaft 模式：
process.roles=broker
controller.quorum.voters=100@controller1:9093,101@controller2:9093,102@controller3:9093
```

---

## 12. 常见面试追问

### 如何处理 Poison Pill（毒丸消息）？

```
"Poison pill" 是一条格式错误的消息，导致 consumer 反复崩溃。

检测方式：
  - Consumer 崩溃、重启、读取同一条消息、再次崩溃（无限循环）
  - Offset 始终无法越过错误消息

解决方案：

  1. Try-Catch 跳过：
     while (true) {
       records = consumer.poll(100);
       for (record : records) {
         try {
           process(record);
         } catch (Exception e) {
           log.error("Bad message at offset {}: {}", record.offset(), e);
           // 跳过该消息，继续处理
         }
       }
       consumer.commitSync();
     }

  2. 重试 + 死信队列（DLQ）：
     for (record : records) {
       int retries = 0;
       while (retries < MAX_RETRIES) {
         try {
           process(record);
           break;
         } catch (RetryableException e) {
           retries++;
           backoff(retries);
         } catch (NonRetryableException e) {
           producer.send("dead-letter-topic", record);  // 发送到 DLQ
           break;
         }
       }
       if (retries >= MAX_RETRIES) {
         producer.send("dead-letter-topic", record);    // 重试耗尽
       }
     }

  3. 熔断器模式：
     - 跟踪每个 partition 的错误率
     - 如果错误率超过阈值，暂停该 partition 的消费
     - 通知运维团队进行人工排查
```

### 如何实现死信队列？

```
死信队列（DLQ）模式：

  Main Topic ──> Consumer ──> 处理
                    │                │
                    │ （失败时）     │ （成功时）
                    v                v
              DLQ Topic          Output Topic

实现方式：
  ┌─────────────────────────────────────────────────────────────┐
  │  DLQ Topic："orders.dead-letter"                            │
  │                                                             │
  │  DLQ 中的消息包含：                                        │
  │  {                                                          │
  │    "original_topic": "orders",                              │
  │    "original_partition": 3,                                 │
  │    "original_offset": 45231,                                │
  │    "original_key": "order-789",                             │
  │    "original_value": { ... },                               │
  │    "error_message": "Invalid payment method",               │
  │    "error_class": "ValidationException",                    │
  │    "retry_count": 3,                                        │
  │    "failed_at": "2024-01-15T10:30:00Z",                    │
  │    "consumer_group": "order-processor",                     │
  │    "consumer_id": "consumer-2"                              │
  │  }                                                          │
  │                                                             │
  │  DLQ 监控：                                                │
  │    - DLQ 消息数超过阈值时告警                              │
  │    - 仪表盘展示 DLQ 深度随时间变化                         │
  │    - 固定延迟后自动重试（可选）                            │
  │                                                             │
  │  DLQ 处理选项：                                            │
  │    A. 人工审核并重放                                       │
  │    B. 指数退避自动重试                                     │
  │    C. 路由到人工工作流进行解决                             │
  └─────────────────────────────────────────────────────────────┘

多级 DLQ：
  Main Topic -> Retry Topic 1（1 分钟延迟）
                    -> Retry Topic 2（10 分钟延迟）
                         -> Retry Topic 3（1 小时延迟）
                              -> Final DLQ（人工干预）
```

### 如何处理消息 Schema 演进？

```
问题：Producer 更新消息格式；consumer 出错。

方案：Schema Registry + 兼容性规则

  ┌──────────┐     ┌─────────────────┐     ┌──────────┐
  │ Producer │────>│ Schema Registry │<────│ Consumer │
  │          │     │                 │     │          │
  │ 写入时   │     │ - 存储 schema   │     │ 读取时   │
  │ 注册     │     │ - 检查兼容性    │     │ 获取     │
  │ schema   │     │ - 版本管理      │     │ schema   │
  └──────────┘     └─────────────────┘     └──────────┘

兼容性模式：
  ┌──────────────────┬────────────────────────────────────────────────┐
  │ 模式             │ 允许的变更                                      │
  ├──────────────────┼─────────────��──────────────────────────────────┤
  │ BACKWARD         │ 新 schema 能读取旧数据                        │
  │                  │ （删除字段、添加可选字段）                     │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ FORWARD          │ 旧 schema 能读取新数据                        │
  │                  │ （添加字段、删除可选字段）                     │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ FULL             │ 前向和后向都兼容                               │
  │                  │ （只能添加/删除可选字段）                      │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ NONE             │ 不做兼容性检查（危险）                        │
  └──────────────────┴────────────────────────────────────────────────┘

Schema 演进示例（Avro）：
  版本 1：
    { "name": "User", "fields": [
      {"name": "id", "type": "string"},
      {"name": "email", "type": "string"}
    ]}

  版本 2（BACKWARD 兼容 - 添加了可选字段）：
    { "name": "User", "fields": [
      {"name": "id", "type": "string"},
      {"name": "email", "type": "string"},
      {"name": "phone", "type": ["null", "string"], "default": null}
    ]}

  新 consumer（v2 schema）读取旧数据（v1）：phone = null（默认值）
  旧 consumer（v1 schema）读取新数据（v2）：phone 字段被忽略

序列化格式对比：
  ┌────────────┬────────────┬──────────────┬────────────────┐
  │ 格式       │ Schema Reg │ 大小         │ 速度           │
  ├────────────┼────────────┼──────────────┼────────────────┤
  │ JSON       │ 可选       │ 大           │ 慢             │
  │ Avro       │ 必需       │ 紧凑         │ 快             │
  │ Protobuf   │ 可选       │ 紧凑         │ 非常快         │
  │ Thrift     │ 可选       │ 紧凑         │ 快             │
  └────────────┴────────────┴──────────────┴────────────────┘
```

### 如何实现优先级队列？

```
Kafka 原生不支持消息优先级。

变通方案：

  方案 1：按优先级使用不同 topic
    ┌─────────────────────┐
    │ orders.high         │──> Consumer（高优先级，优先轮询）
    │ orders.medium       │──> Consumer（中优先级，高优先级为空时轮询）
    │ orders.low          │──> Consumer（低优先级，其他为空时轮询）
    └─────────────────────┘

    Consumer 逻辑：
      while (true) {
        records = highPriorityConsumer.poll(0);  // 非阻塞
        if (records.isEmpty()) {
          records = mediumPriorityConsumer.poll(0);
        }
        if (records.isEmpty()) {
          records = lowPriorityConsumer.poll(100);  // 阻塞等待
        }
        process(records);
      }

  方案 2：优先级 header + consumer 端排序
    Producer 设置 header：priority = HIGH | MEDIUM | LOW
    Consumer 读取批次，按优先级排序，先处理高优先级
    风险：批次边界可能分割优先级组

  方案 3：对优先级场景使用 RabbitMQ
    如果优先级是硬性需求，考虑使用原生支持
    优先级队列的传统消息队列（RabbitMQ 支持 0-255）

  建议：方案 1 在实践中最常见
    简单、可预测、无复杂 consumer 逻辑
    权衡：需要管理更多 topic
```

### 如何确保 Exactly-Once 处理？

```
端到端 exactly-once 需要 producer 和 consumer 双方配合：

  Producer 端：
    enable.idempotence=true          # 在 broker 上对重试去重
    transactional.id=my-txn-id       # 用于多 partition 原子性

  Consumer 端（方案 A - 事务性）：
    isolation.level=read_committed
    # 消费 -> 处理 -> 生产到输出 + 原子性提交 offset

  Consumer 端（方案 B - 幂等 consumer）：
    # 在外部存储（DB、Redis）中存储已处理的消息 ID
    # 重新处理时，检查是否已处理 -> 跳过

    process(record):
      messageId = record.headers().get("message-id")
      if (deduplicationStore.exists(messageId)):
        return  // 已处理，跳过
      result = transform(record)
      atomically:
        outputStore.save(result)
        deduplicationStore.add(messageId)
        consumer.commitSync()

  Consumer 端（方案 C - 幂等操作）：
    # 将操作设计为天然幂等
    # 例如，"设置余额为 $100" 而不是 "余额增加 $10"
    # 重新处理相同消息不会产生额外效果

  Exactly-once 开销：
    - 吞吐量降低 ~20%（producer 端，序列号跟踪）
    - 需要额外存储用于事务协调器状态
    - 事务提交延迟增加（~50ms）
    - 更复杂的故障处理和恢复
```

### Kafka vs RabbitMQ vs SQS 对比

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ 特性             │ Kafka            │ RabbitMQ         │ Amazon SQS       │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 模型             │ 分布式日志       │ 消息中间件       │ 托管队列         │
│ 协议             │ 自定义二进制     │ AMQP 0.9.1       │ HTTP REST API    │
│ 消息生命周期     │ 保留（日志）     │ 确认后删除       │ 确认后删除       │
│ 重放             │ 是（按 offset）  │ 否               │ 否               │
│ 顺序性           │ 每 partition     │ 每队列           │ 仅 FIFO 队列    │
│ 吞吐量           │ 百万/秒          │ ~50K/秒          │ ~3K/秒（FIFO）   │
│                  │                  │                  │ ~无限（标准）    │
│ 延迟             │ ~5ms p99         │ ~1ms p99         │ ~10-50ms         │
│ 投递保证         │ At-least-once    │ At-least-once    │ At-least-once    │
│                  │ Exactly-once     │（带 confirm）    │（FIFO：exactly-  │
│                  │（带事务）        │                  │  once）          │
│ 路由             │ Topic+partition  │ Exchange+binding │ 队列名           │
│                  │                  │（灵活）          │                  │
│ Consumer group   │ 内置             │ 竞争消费者       │ N/A（固有）      │
│                  │                  │                  │                  │
│ 优先级队列       │ 否（变通方案）   │ 是（0-255）      │ 否               │
│ 死信队列         │ 手动             │ 内置             │ 内置             │
│ 消息 TTL         │ Topic 级别       │ 每条消息         │ 队列级别         │
│ 集群             │ 内置             │ 镜像队列         │ 托管（AWS）      │
│ 运维复杂度       │ 高               │ 中等             │ 无（托管）       │
│ 成本模型         │ 自托管 /         │ 自托管 /         │ 按请求付费       │
│                  │ Confluent Cloud  │ CloudAMQP       │                  │
│ 最适合           │ 事件流、         │ 任务队列、       │ 简单队列、       │
│                  │ 数据管道、       │ RPC、路由、      │ Serverless、     │
│                  │ 流处理           │ 低延迟           │ AWS 集成         │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 选择场景...      │ 高吞吐量、       │ 复杂路由、       │ 托管服务、       │
│                  │ 需要重放、       │ 优先级、         │ 低运维负担、     │
│                  │ 事件溯源、       │ 灵活确认、       │ AWS 生态系统、   │
│                  │ 流处理           │ 请求-应答        │ 中等规模         │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### 其他面试问题与简要回答

```
问：Kafka 如何处理背压？
答：Consumer 控制的拉取模型。Consumer 按自己的速率轮询。
   如果 consumer 较慢，lag 增加但 producer 不被阻塞。
   使用 consumer.pause()/resume() 进行细粒度流量控制。
   监控 consumer lag 并在超过阈值时告警。

问：Log compaction 如何工作？
答：cleanup.policy=compact 只保留每个 key 的最新值。
   后台线程移除相同 key 的旧记录。
   用于 changelog、KTable 物化、配置 topic。
   Tombstone（null 值）在 delete.retention.ms 后标记 key 为删除。

问：当 consumer group 的 consumer 数多于 partition 数时会怎样？
答：多余的 consumer 处于空闲状态。最大并行度 = partition 数量。
   这些空闲 consumer 作为故障转移的热备。
   发生 rebalance 时（如活跃 consumer 挂掉），空闲 consumer 接管。

问：如何在生产环境监控 Kafka？
答：通过 JMX + Prometheus 监控关键指标：
   - 副本不足的 partition（> 0 就是问题）
   - 每个 group 的 consumer lag（应接近零或在减少）
   - 请求延迟（produce/fetch p99）
   - 活跃 controller 数量（必须恰好为 1）
   - ISR 缩减/扩展速率
   - 日志刷写延迟
   - 网络处理器空闲比率

问：如何零停机升级 Kafka？
答：滚动重启策略：
   1. 每次升级一个 broker
   2. 将 inter.broker.protocol.version 设置为旧版本
   3. 所有 broker 升级后，提升协议版本
   4. 再次滚动重启以激活新协议
   5. 如需要，对 log.message.format.version 重复此过程

问：Kafka Streams 与 consumer API 有何区别？
答：Kafka Streams 是用于流处理的客户端库：
   - 有状态操作（聚合、连接、窗口）
   - 内置状态存储（RocksDB 支持）
   - Exactly-once 处理语义
   - 不需要单独的集群（在应用程序中运行）
   - 对于以 Kafka 为中心的工作负载，是 Flink/Spark Streaming 的替代方案
```

---

## 总结：面试检查清单

```
在面试中设计分布式消息队列时：

[ ] 澄清需求（吞吐量、延迟、顺序、持久性）
[ ] 粗略估算（存储、带宽、broker 数量）
[ ] 在传统消息队列和事件流之间做选择
[ ] 设计 topic/partition 方案（基于 key 的路由）
[ ] 解释复制模型（leader-follower、ISR、acks）
[ ] 讨论投递语义（at-least-once vs exactly-once）
[ ] 解释存储模型（append-only log、段、索引）
[ ] 讨论性能优化（zero-copy、批处理、page cache）
[ ] 阐述顺序保证和权衡
[ ] 描述 consumer group 机制和 rebalance
[ ] 规划扩展方案（partition、broker、多数据中心）
[ ] 讨论运维关注点（监控、升级、schema 演进）
[ ] 处理故障场景（broker 崩溃、网络分区、poison pill）
```
