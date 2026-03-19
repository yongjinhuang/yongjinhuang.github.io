# 设计搜索自动补全（Typeahead）

Typeahead / 自动补全系统在用户输入搜索框时实时建议查询补全。例如 Google 搜索建议、Amazon 商品搜索或 YouTube 的搜索栏。核心挑战是在严格的延迟预算内返回高度相关的建议，同时每天处理数十亿次查询。

---

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据结构深入：Trie](#3-数据结构深入trie)
4. [高层架构](#4-高层架构)
5. [数据模型](#5-数据模型)
6. [数据收集与聚合管道](#6-数据收集与聚合管道)
7. [Trie 构建与更新](#7-trie-构建与更新)
8. [查询处理](#8-查询处理)
9. [缓存策略](#9-缓存策略)
10. [扩展性](#10-扩展性)
11. [部署架构](#11-部署架构)
12. [常见面试追问](#12-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| #   | 需求       | 详情                                                                |
| --- | ---------- | ------------------------------------------------------------------- |
| F1  | 前缀匹配   | 当用户输入 "din" 时，返回 "dinner recipes"、"dinosaur games" 等建议 |
| F2  | Top-K 建议 | 返回最热门/最相关的 5-10 个补全结果                                 |
| F3  | 排序结果   | 建议按热度、时效性和相关性排序                                      |
| F4  | 快速响应   | 用户每输入一个字符后结果应立即出现                                  |
| F5  | 多语言支持 | 支持英语、中文、西班牙语等查询                                      |
| F6  | 过滤       | 排除攻击性、违法或不适当的建议                                      |

### 非功能性需求

| #   | 需求     | 目标                                 |
| --- | -------- | ------------------------------------ |
| NF1 | 延迟     | 端到端 < 100 ms（p99）               |
| NF2 | 可用性   | 99.99% 正常运行时间                  |
| NF3 | 可扩展性 | 处理 1000 万以上日活用户             |
| NF4 | 一致性   | 最终一致性可接受（建议可延迟数分钟） |
| NF5 | 容错性   | 无单点故障                           |

### 粗略估算

```
用户与查询
---------------
DAU:                        10,000,000
每用户每天搜索次数:           10
每日总搜索量:                100,000,000

每次搜索的按键次数（平均查询 = 20 字符，平均 4 次前缀查找）：
  每次搜索的请求数:           4
  （由于 debouncing，用户不会每次按键都发送查询）

总自动补全 QPS：
  100M 搜索 x 4 前缀 = 400,000,000 请求/天
  峰值 QPS = 400M / 86400 * 3（峰值系数）~ 14,000 QPS
  平均 QPS = 400M / 86400 ~ 4,600 QPS

数据量
-----------
每天唯一查询数:              ~5,000,000
平均查询长度:                20 字节（UTF-8）
每天新查询数据:              5M * 20B = 100 MB
每年:                       ~36 GB 原始查询文本

Trie 大小（内存中）
---------------------
假设 Trie 中有 5M 个唯一前缀:
  每个节点: 40 字节（字符 + 子节点指针 + top-K 列表指针）
  Trie 节点（平均每条路径 15 个字符）: 5M * 15 * 40B = 3 GB
  每个节点的 Top-K 缓存（10 条目 * 40 字节）: ~600 MB
  Trie 总内存: ~4 GB（适合单台服务器 RAM）

带宽
---------
平均响应大小: ~200 字节（10 条建议 * 20 字符）
峰值带宽: 14,000 QPS * 200B = 2.8 MB/s（微不足道）
```

---

## 2. API 设计

### 接口

```
GET /v1/suggestions?prefix={prefix}&limit={limit}&lang={lang}&user_id={user_id}
```

| 参数    | 类型   | 是否必需 | 默认值 | 描述                   |
| ------- | ------ | -------- | ------ | ---------------------- |
| prefix  | string | 是       | -      | 用户已输入的字符       |
| limit   | int    | 否       | 10     | 返回建议的最大数量     |
| lang    | string | 否       | "en"   | 多语言支持的语言代码   |
| user_id | string | 否       | -      | 用于个性化建议（可选） |

### 响应格式

```json
{
  "prefix": "how to m",
  "suggestions": [
    {
      "text": "how to make pancakes",
      "score": 98500,
      "type": "trending"
    },
    {
      "text": "how to make money online",
      "score": 87200,
      "type": "popular"
    },
    {
      "text": "how to meditate",
      "score": 76100,
      "type": "popular"
    },
    {
      "text": "how to measure ring size",
      "score": 65400,
      "type": "popular"
    },
    {
      "text": "how to merge pdf files",
      "score": 54300,
      "type": "popular"
    }
  ],
  "metadata": {
    "latency_ms": 12,
    "cache_hit": true
  }
}
```

### 客户端 Debouncing 策略

客户端不应该在每次按键时都发起请求。应使用 debouncing：

```
用户输入: "h" "o" "w" " " "t" "o" " " "m" "a" "k"

不使用 debounce（10 个请求）:
  t=0ms    -> GET ?prefix=h
  t=80ms   -> GET ?prefix=ho
  t=160ms  -> GET ?prefix=how
  ...共 10 个请求

使用 150ms debounce（4 个请求）:
  t=0ms    -> 用户输入 "h"
  t=80ms   -> 用户输入 "o"
  t=160ms  -> 用户输入 "w"    -> debounce 触发 -> GET ?prefix=how
  t=200ms  -> 用户输入 " "
  t=280ms  -> 用户输入 "t"
  t=360ms  -> 用户输入 "o"    -> debounce 触发 -> GET ?prefix=how to
  t=400ms  -> 用户输入 " "
  t=480ms  -> 用户输入 "m"
  t=560ms  -> 用户输入 "a"
  t=640ms  -> 用户输入 "k"    -> debounce 触发 -> GET ?prefix=how to mak
  ...共 4 个请求（减少 60%）
```

**额外的客户端��化：**

| 优化               | 描述                                 |
| ------------------ | ------------------------------------ |
| Debounce 100-200ms | 在最后一次按键后等待再发送请求       |
| 取消进行中的请求   | 当新前缀到达时中止之前的 XHR/fetch   |
| 客户端缓存         | 在 sessionStorage 中缓存前缀 -> 建议 |
| 最小前缀长度       | 输入 2 个以上字符后才发送查询        |
| 自适应 debounce    | 在慢速网络上增加 debounce 间隔       |

---

## 3. 数据结构深入：Trie

### 什么是 Trie？

**Trie**（前缀树 / 数字树）是一种树状数据结构，其中每个节点代表一个字符。从根到叶节点（或标记节点）的路径拼出存储的字符串。一个节点的所有后代共享相同的前缀。

```
                        (root)
                       /  |   \
                      t   b    c
                     /    |     \
                    r     e      a
                   / \    |      |
                  e   i   s      r
                  |   |   |      |
                  e   p   t      [end]
                  |   |   [end]
                 [end][end]

  存储的词: "tree", "trip", "best", "car"
```

从根到 `[end]` 标记的每条路径代表一个完整的存储字符串。

### 基本 Trie 节点（伪代码）

```python
class TrieNode:
    def __init__(self):
        self.children = {}        # char -> TrieNode
        self.is_end = False       # 标记完整单词的结尾
        self.frequency = 0        # 搜索频率计数器

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word, freq=1):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True
        node.frequency += freq

    def search_prefix(self, prefix):
        """找到对应前缀最后一个字符的节点。"""
        node = self.root
        for char in prefix:
            if char not in node.children:
                return None
            node = node.children[char]
        return node

    def get_top_k(self, prefix, k=10):
        """获取前缀的 top-k 补全结果。"""
        node = self.search_prefix(prefix)
        if node is None:
            return []
        # DFS 查找所有补全（生产环境中太慢）
        results = []
        self._dfs(node, prefix, results)
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:k]

    def _dfs(self, node, current, results):
        if node.is_end:
            results.append((current, node.frequency))
        for char, child in node.children.items():
            self._dfs(child, current + char, results)
```

**问题：** `get_top_k` 需要对前缀节点以下的子树进行完整 DFS 遍历。对于像 "a" 这样可能有数百万补全结果的前缀，这在实时场景中太慢了。

### 优化的 Trie：每个节点缓存 Top-K

关键优化：**在每个节点预计算并缓存 Top-K 建议**。

```python
class OptimizedTrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False
        self.frequency = 0
        self.top_k = []           # 预计算的 (word, freq) 元组列表

class OptimizedTrie:
    def __init__(self, k=10):
        self.root = OptimizedTrieNode()
        self.k = k

    def build(self, query_frequencies):
        """从 {query: frequency} 字典构建 Trie，然后传播 top-K。"""
        for query, freq in query_frequencies.items():
            self._insert(query, freq)
        self._propagate_top_k(self.root, "")

    def _insert(self, word, freq):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = OptimizedTrieNode()
            node = node.children[char]
        node.is_end = True
        node.frequency = freq

    def _propagate_top_k(self, node, prefix):
        """后序遍历，将 top-K 向上传播。"""
        candidates = []
        if node.is_end:
            candidates.append((prefix, node.frequency))
        for char, child in node.children.items():
            self._propagate_top_k(child, prefix + char)
            candidates.extend(child.top_k)
        # 仅保留频率最高的 top-K
        candidates.sort(key=lambda x: x[1], reverse=True)
        node.top_k = candidates[:self.k]

    def get_suggestions(self, prefix):
        """O(L) 查找，其中 L = len(prefix)。无需 DFS。"""
        node = self.root
        for char in prefix:
            if char not in node.children:
                return []
            node = node.children[char]
        return node.top_k
```

**查询时间复杂度：O(L)**，其中 L 是前缀的长度。Top-K 列表已经预计算好了——只需沿 Trie 向下遍历并返回缓存的列表。

```
带 Top-K 缓存的优化 Trie（K=2）：

                            (root)
                    top_k: [("tree", 50), ("trip", 40)]
                           /         \
                          t           b
              top_k: [("tree",50),   top_k: [("best",30)]
                      ("trip",40)]
                         |             |
                         r             e
              top_k: [("tree",50),   top_k: [("best",30)]
                      ("trip",40)]
                        / \            |
                       e   i           s
            top_k:     |   |        top_k: [("best",30)]
          [("tree",50)]| [("trip",40)]|
                       e   p           t
                       |   |           |
                     [end] [end]     [end]
                    freq=50 freq=40  freq=30

  查询 "tr" -> 遍历到节点 'r' -> 返回 top_k: [("tree",50), ("trip",40)]
  时间: O(2) -- 只需 2 次字符查找！
```

### 压缩 Trie（Patricia Tree / Radix Tree）

标准 Trie 在节点只有一个子节点时浪费空间。**压缩 Trie**（也称为 Patricia Tree 或 Radix Tree）合并单子节点链：

```
标准 Trie（浪费空间）：                 压缩 Trie（节省空间）：

        (root)                                   (root)
       /      \                                 /      \
      t        b                             "tr"     "best"
      |        |                             /   \      |
      r        e                           "ee"  "ip"  [end]
     / \       |                            |      |
    e   i      s                          [end]  [end]
    |   |      |
    e   p      t
    |   |      |
   [end][end] [end]

节点数: 11                                 节点数: 6（减少 45%）
```

**空间节省：** 对于 N 个平均长度为 L 的字符串语料库：

| 指标   | 标准 Trie           | 压缩 Trie                           |
| ------ | ------------------- | ----------------------------------- |
| 节点数 | O(N \* L)           | O(N)                                |
| 空间   | ~40 字节/节点 * N*L | ~(40 + 平均标签长度) 字节/节点 \* N |
| 查找   | O(L)                | O(L)（相同）                        |

对于 5M 个平均长度为 20 的查询：

- 标准：5M _ 20 _ 40B = 4 GB
- 压缩：5M \* 60B = 300 MB（>10 倍缩减）

### 替代方案：Redis Sorted Sets（ZRANGEBYLEX）

对于更简单的部署，Redis sorted sets 通过 `ZRANGEBYLEX` 提供前缀搜索：

```
ZADD autocomplete 0 "how to cook rice"
ZADD autocomplete 0 "how to code"
ZADD autocomplete 0 "how to clean"
ZADD autocomplete 0 "hotel booking"

# 前缀搜索 "how to c"
ZRANGEBYLEX autocomplete "[how to c" "[how to c\xff" LIMIT 0 10
# 返回: "how to clean", "how to code", "how to cook rice"
```

**权衡：Trie vs Redis Sorted Set**

| 方面       | 自定义 Trie              | Redis ZRANGEBYLEX        |
| ---------- | ------------------------ | ------------------------ |
| 延迟       | < 1ms（进程内内存）      | 1-5ms（网络跳转）        |
| Top-K 排序 | 每个节点预计算           | 需要单独的分数结构       |
| 空间效率   | 压缩 Trie 非常紧凑       | 存储完整字符串，更多内存 |
| 复杂度     | 需要自定义代码构建和维护 | 开箱即用，易于运维       |
| 扩展       | 需要自定义分片逻辑       | Redis Cluster 处理分片   |
| 最适合     | 大规模、低延迟场景       | 原型、中等规模场景       |

---

## 4. 高层架构

系统有两个主要数据流：

1. **查询路径**（在线，延迟敏感）：用户输入前缀 -> 获取建议
2. **数据收集路径**（离线/近实时）：收集搜索日志 -> 构建 Trie

```
                         查询路径（在线）
  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐
  │  客户端   │────>│  负载均衡器   │────>│   API 服务器       │
  │ (浏览器)  │<────│  (L7 / CDN)  │<────│  （无状态）        │
  └──────────┘     └──────────────┘     └─────────┬─────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Trie 服务       │
                                          │  （内存中的       │
                                          │   Trie 缓存）    │
                                          └────────┬────────┘
                                                   │ fallback
                                          ┌────────▼────────┐
                                          │  Redis 缓存      │
                                          │  （L2 缓存）      │
                                          └─────────────────┘


                    数据收集路径（离线 / 近实时）
  ┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────┐
  │  搜索     │────>│  Kafka   │────>│  聚合器      │────>│  频率存储    │
  │  日志     │     │  队列    │     │  (Flink /   │     │  (数据库)   │
  │           │     │          │     │   Spark)    │     │             │
  └──────────┘     └──────────┘     └─────────────┘     └──────┬──────┘
                                                                │
                                                       ┌────────▼────────┐
                                                       │  Trie 构建器    │
                                                       │  （定期任务）    │
                                                       └────────┬────────┘
                                                                │
                                               ┌────────────────▼────────────────┐
                                               │      Trie 快照存储              │
                                               │  (S3 / HDFS 序列化 Trie)       │
                                               └────────────────┬────────────────┘
                                                                │ push / pull
                                               ┌────────────────▼────────────────┐
                                               │      Trie 服务节点              │
                                               │  （加载新快照到内存）            │
                                               └────────────────────────────────┘
```

### 组件职责

| 组件             | 职责                                          |
| ---------------- | --------------------------------------------- |
| 客户端（浏览器） | Debounce 按键、缓存最近结果、展示建议         |
| 负载均衡器 / CDN | 路由请求、在边缘缓存热门前缀响应              |
| API 服务器       | 验证输入、路由到 Trie 服务、应用个性化        |
| Trie 服务        | 内存中 Trie 查找，在 < 1ms 内返回前缀的 Top-K |
| Redis 缓存       | 内存 Trie 中未命中的前缀的 L2 缓存            |
| Kafka            | 缓冲搜索查询日志以进行异步处理                |
| 聚合器           | 按时间窗口（每小时、每天）统计查询频率        |
| 频率存储         | 持久化聚合后的（查询、频率、时间戳）数据      |
| Trie 构建器      | 读取频率数据、构建优化 Trie、序列化为快照     |
| 快照存储         | 持久存储（S3/HDFS）Trie 二进制快照            |

---

## 5. 数据模型

### 原始搜索查询日志

存储在日志结构存储中（Kafka topic，然后归档到 S3）。

```
表: search_query_log
┌──────────────────────────────────────────────────────────────────┐
│ 列名         │ 类型       │ 描述                                 │
├──────────────┼────────────┼─────────────────────────────────────┤
│ query_id     │ UUID       │ 唯一日志条目 ID                      │
│ query        │ VARCHAR    │ 搜索查询字符串                        │
│ user_id      │ VARCHAR    │ 用户标识符（可为空）                   │
│ timestamp    │ BIGINT     │ 查询发出时的 Unix 纪元毫秒数           │
│ locale       │ VARCHAR(5) │ 语言/地区（如 "en-US"）               │
│ device_type  │ VARCHAR    │ "mobile"、"desktop"、"tablet"         │
│ session_id   │ VARCHAR    │ 用于将会话中的查询分组                  │
└──────────────────────────────────────────────────────────────────┘

示例行:
  ("a1b2", "how to make pancakes",  "u123", 1709312400000, "en-US", "mobile",  "s001")
  ("c3d4", "how to make money",     "u456", 1709312401000, "en-US", "desktop", "s002")
  ("e5f6", "how to make pancakes",  "u789", 1709312402000, "en-US", "mobile",  "s003")
```

### 聚合频率表

由聚合管道生成。存储在关系型数据库或键值存储中。

```
表: query_frequency
┌──────────────────────────────────────────────────────────────────┐
│ 列名         │ 类型       │ 描述                                 │
├──────────────┼────────────┼─────────────────────────────────────┤
│ query        │ VARCHAR    │ 标准化搜索查询（主键）                 │
│ frequency    │ BIGINT     │ 加权频率分数                          │
│ last_updated │ TIMESTAMP  │ 此行最后刷新时间                      │
│ locale       │ VARCHAR(5) │ 语言分段                              │
│ is_filtered  │ BOOLEAN    │ 此查询是否被列入黑名单                 │
└──────────────────────────────────────────────────────────────────┘

示例行:
  ("how to make pancakes",      98500, "2024-03-01 12:00", "en-US", false)
  ("how to make money online",  87200, "2024-03-01 12:00", "en-US", false)
  ("how to make a bomb",          120, "2024-03-01 12:00", "en-US", true)
```

### Trie 节点序列化格式

Trie 被序列化为二进制格式用于存储和传输：

```
Trie 快照二进制格式:
┌────────────────────────────────────────────────────┐
│ 头部 (32 字节)                                      │
│   magic_number: 4 字节 ("TRIE")                     │
│   version:      2 字节                              │
│   node_count:   4 字节                              │
│   locale:       8 字节                              │
│   created_at:   8 字节 (unix 纪元)                   │
│   checksum:     4 字节 (CRC32)                      │
│   reserved:     2 字节                              │
├────────────────────────────────────────────────────┤
│ 节点表（可变长度）                                    │
│   对于每个节点:                                      │
│     node_id:        4 字节                          │
│     char_label:     可变（UTF-8，null 终止）          │
│     num_children:   2 字节                          │
│     child_offsets:  4 字节 * num_children            │
│     is_end:         1 字节                          │
│     frequency:      4 字节                          │
│     num_top_k:      1 字节                          │
│     top_k_entries:  (4 + 4) 字节 * num_top_k        │
│       -> string_offset (4) + score (4)             │
├────────────────────────────────────────────────────┤
│ 字符串表（可变长度）                                  │
│   去重的建议字符串，null 终止                         │
└────────────────────────────────────────────────────┘

5M 查询的典型快照大小: ~300-500 MB（压缩后）
```

---

## 6. 数据收集与聚合管道

### 管道概览

```
  ┌───────────────┐
  │  用户搜索      │
  │  （前端）      │
  └───────┬───────┘
          │ 1. 记录搜索事件
          ▼
  ┌───────────────┐     ┌──────────────┐     ┌──────────────────┐
  │  搜索 API     │────>│    Kafka     │────>│  流处理器         │
  │  服务器       │     │  (Topic:     │     │  (Flink / Spark  │
  │               │     │   searches)  │     │   Streaming)     │
  └───────────────┘     └──────────────┘     └────────┬─────────┘
                                                       │
                                    2. 按时间窗口聚合    │
                                                       │
                                                       ▼
                                             ┌──────────────────┐
                                             │  时间窗口         │
                                             │  聚合器           │
                                             │                  │
                                             │  1 小时桶:        │
                                             │  {query: count}  │
                                             └────────┬─────────┘
                                                      │
                                    3. 计算加权频率      │
                                                       │
                                                      ▼
                                             ┌──────────────────┐
                                             │  频率             │
                                             │  计算器           │
                                             │                  │
                                             │  应用时间衰减     │
                                             │  + 权重           │
                                             └────────┬─────────┘
                                                      │
                                    4. 过滤             │
                                       不适当内容       │
                                                      ▼
                                             ┌──────────────────┐
                                             │  内容过滤器       │
                                             │                  │
                                             │  黑名单 +         │
                                             │  ML 分类器        │
                                             └────────┬─────────┘
                                                      │
                                    5. 写入             │
                                       频率存储         │
                                                      ▼
                                             ┌──────────────────┐
                                             │  频率             │
                                             │  存储（数据库）    │
                                             └──────────────────┘
```

### 逐步详解

#### 步骤 1：实时日志记录

每次完成的搜索（用户按回车或点击建议）都会被记录：

```json
{
  "event": "search_completed",
  "query": "how to make pancakes",
  "user_id": "u123",
  "timestamp": 1709312400000,
  "locale": "en-US",
  "source": "typeahead_click"
}
```

**重要：** 我们只记录*完成的*搜索，而非每次前缀按键。这避免了对用户从未想要的部分前缀进行计数膨胀。

#### 步骤 2：时间窗口聚合

流处理器将查询分组到时间窗口中：

```
滚动窗口: 1 小时

窗口 [12:00 - 13:00]:
  "how to make pancakes"     -> 1,240
  "how to make money online" -> 980
  "how to make a resume"     -> 870

窗口 [13:00 - 14:00]:
  "how to make pancakes"     -> 1,180
  "how to make money online" -> 1,050
  ...
```

#### 步骤 3：时间加权频率

近期查询应比旧查询排名更高。使用**指数时间衰减**：

```
weighted_score = 对所有时间窗口求和:
    count_in_window * decay_factor ^ (hours_since_window / half_life)

其中:
    decay_factor = 0.5
    half_life = 168 小时（1 周）

"how to make pancakes" 的示例:
    最近 1 小时:   1,240 * 0.5^(0/168)   = 1,240.0
    2 小时前:      1,180 * 0.5^(1/168)   = 1,175.1
    1 天前:        1,100 * 0.5^(24/168)  = 1,000.4
    1 周前:          900 * 0.5^(168/168) =   450.0
    2 周前:          800 * 0.5^(336/168) =   200.0
                                          --------
    加权总分:                              ~4,065.5
```

这确保了：

- 热门查询快速上升（近期高计数占主导）
- 旧查询自然衰减，无需显式删除
- 常青查询通过持续的量维持分数

#### 步骤 4：内容过滤

两层过滤系统：

```
第 1 层: 黑名单（精确匹配 + 正则表达式模式）
  - 被禁查询的显式列表
  - 按类别的正则表达式模式（暴力、仇恨言论等）
  - 由内容审核团队更新

第 2 层: ML 分类器
  - 在标注数据上训练（安全 / 不安全）
  - 捕获黑名单中没有的新型攻击性查询
  - 在聚合期间离线运行（不在查询路径上）
  - unsafe_score > 阈值的查询被标记
```

---

## 7. Trie 构建与更新

### 离线 Trie 构建流程

Trie 定期重建（例如每 15 分钟到 1 小时）：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. 从频率    │────>│ 2. 构建      │────>│ 3. 序列化为  │────>│ 4. 上传      │
│ 存储读取     │     │ 优化的       │     │ 二进制格式   │     │ 快照到       │
│              │     │ Trie         │     │              │     │ S3 / HDFS    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                                                              ┌───────▼───────┐
                                                              │ 5. 通知       │
                                                              │ Trie 服务器   │
                                                              │ 拉取新快照    │
                                                              │               │
                                                              └───────┬───────┘
                                                                      │
                                                              ┌───────▼───────┐
                                                              │ 6. Trie       │
                                                              │ 服务器加载    │
                                                              │ 新 Trie 到    │
                                                              │ 内存          │
                                                              └───────────────┘
```

**构建伪代码：**

```python
def build_trie_snapshot():
    # 1. 按加权分数获取 top N 查询
    queries = frequency_store.get_top_queries(
        limit=5_000_000,
        min_score=10,
        is_filtered=False
    )

    # 2. 构建带有每个节点 top-K 的优化 Trie
    trie = OptimizedTrie(k=10)
    trie.build(queries)  # {query: score} 字典

    # 3. 序列化为二进制
    snapshot = trie.serialize()
    checksum = crc32(snapshot)

    # 4. 上传到持久存储
    snapshot_key = f"trie/en-US/{timestamp}.bin"
    s3.upload(snapshot_key, snapshot)

    # 5. 通知 Trie 服务器
    notify_servers(snapshot_key, checksum)
```

### 基于快照的更新（主要策略）

```
时间线:

  t=0        t=15min     t=30min     t=45min
  |           |           |           |
  构建 v1     构建 v2     构建 v3     构建 v4
  |           |           |           |
  服务器      服务器      服务器      服务器
  加载 v1     加载 v2     加载 v3     加载 v4

发布策略（蓝绿部署）:
  服务器池 A: 服务 v1     -> 加载 v2 -> 服务 v2
  服务器池 B: 服务 v1（A 加载 v2 时继续服务）
  A 健康后: B 加载 v2
```

**优势：**

- 原子更新（整个 Trie 一次性替换）
- 易于回滚（只需指向上一个快照）
- 不会因部分更新而损坏
- 服务器保持只读（简单、快速）

### 在线更新（热门趋势的补充）

对于突发新闻/热门查询，等待 15 分钟太慢了。使用轻量级的在线更新机制：

```python
class TrieWithHotUpdates:
    def __init__(self):
        self.base_trie = None           # 从快照加载
        self.hot_queries = {}            # {query: score} 用于热门查询
        self.hot_trie = OptimizedTrie()  # 小型热门 Trie

    def get_suggestions(self, prefix, k=10):
        base_results = self.base_trie.get_suggestions(prefix)
        hot_results = self.hot_trie.get_suggestions(prefix)
        # 合并并重新排序
        merged = merge_ranked(base_results, hot_results)
        return merged[:k]

    def update_hot(self, query, score):
        """由实时流处理器为热门查询调用。"""
        self.hot_queries[query] = score
        if len(self.hot_queries) > 10000:
            # 重建小型热门 Trie
            self.hot_trie = OptimizedTrie(k=10)
            self.hot_trie.build(self.hot_queries)
```

### 权衡：新鲜度 vs 构建成本

| 策略               | 新鲜度         | 构建成本             | 复杂度 | 适用场景     |
| ------------------ | -------------- | -------------------- | ------ | ------------ |
| 每小时全量重建     | ~30 分钟延迟   | 高（重建整个 Trie）  | 低     | 查询模式稳定 |
| 每 15 分钟全量重建 | ~8 分钟延迟    | 中高                 | 低     | 通用场景     |
| 快照 + 热更新      | 热门查询约秒级 | 低（热门 Trie 很小） | 中     | 需要突发新闻 |
| 完全实时更新       | 实时           | 非常高（锁竞争）     | 非常高 | 极少需要     |

**建议：** 每 15 分钟快照重建 + 热更新层处理热门趋势。

---

## 8. 查询处理

### 前缀匹配算法

```python
def handle_suggestion_request(prefix, limit, locale, user_id):
    # 1. 标准化前缀
    normalized = normalize(prefix, locale)
    #   - 转小写
    #   - 去除首尾空白
    #   - 标准化 Unicode（NFC 形式）
    #   - 必要时进行音译（特定语言）

    # 2. 检查应用缓存（Redis）
    cache_key = f"suggest:{locale}:{normalized}"
    cached = redis.get(cache_key)
    if cached:
        results = deserialize(cached)
    else:
        # 3. 在 Trie 中查找（内存中）
        results = trie_service.get_suggestions(normalized)
        # 4. 缓存结果
        redis.setex(cache_key, ttl=300, serialize(results))

    # 5. 应用个性化（如果提供了 user_id）
    if user_id:
        results = personalize(results, user_id, limit)

    # 6. 返回 Top-K
    return results[:limit]
```

### 从 Trie 节点检索 Top-K

由于每个节点缓存了 Top-K，检索非常简单：

```
输入前缀: "how to m"

步骤 1: 沿 Trie 向下遍历
  root -> 'h' -> 'o' -> 'w' -> ' ' -> 't' -> 'o' -> ' ' -> 'm'

步骤 2: 读取 'm' 节点的 node.top_k
  [
    ("how to make pancakes",       98500),
    ("how to make money online",   87200),
    ("how to meditate",            76100),
    ("how to measure ring size",   65400),
    ("how to merge pdf files",     54300),
    ("how to make a website",      48900),
    ("how to make slime",          42100),
    ("how to multiply fractions",  38600),
    ("how to make french toast",   35200),
    ("how to move to canada",      31800)
  ]

步骤 3: 返回列表（已按分数排序）

时间复杂度: O(L)，其中 L = 前缀长度（此例中为 8）
无 DFS，无排序，查询时无聚合。
```

### 个性化层

将全局建议与用户特��历史混合：

```python
def personalize(global_results, user_id, limit):
    # 获取用户最近的搜索历史
    user_history = user_store.get_recent_searches(user_id, limit=50)

    # 对用户历史匹配进行评分
    personal_results = []
    for query, timestamp in user_history:
        if query.startswith(prefix):
            recency_boost = compute_recency_boost(timestamp)
            personal_results.append((query, recency_boost))

    # 合并: 交错个人和全局结果
    # 策略: 30% 个人位置，70% 全局位置
    personal_slots = max(1, int(limit * 0.3))
    global_slots = limit - personal_slots

    merged = personal_results[:personal_slots]
    # 用全局结果填充剩余位置，跳过重复
    seen = set(r[0] for r in merged)
    for result in global_results:
        if result[0] not in seen and len(merged) < limit:
            merged.append(result)

    return merged
```

### 拼写纠正 / 模糊匹配

处理前缀中的拼写错误：

```
用户输入: "recpie"（"recipe" 的拼写错误）

策略 1: 编辑距离
  - 计算前缀到 Trie 中已知前缀的编辑距离
  - 如果没有精确匹配，尝试编辑距离 1-2 内的前缀
  - 开销大: O(N * L)，其中 N = 该深度的 Trie 节点数

策略 2: 语音匹配（Soundex / Metaphone）
  - 将前缀转换为语音代码
  - 维护语音索引: phonetic_code -> [original_prefixes]
  - "recpie" -> 语音代码 -> 匹配 "recipe"

策略 3: 预计算纠正映射
  - 离线: 对 top 100K 查询，预计算常见拼写错误
  - 存储为 correction_map: {"recpie": "recipe", "reciepe": "recipe"}
  - 查询时: O(1) 在纠正映射中查找

建议: 生产环境使用策略 3（快速、可预测）
  - 如果没有找到映射条目，回退到策略 1
```

---

## 9. 缓存策略

自动补全非常适合缓存，因为：

- 热门前缀被许多用户查询（"how to"、"what is"、"best"）
- 建议不常变化（每 15 分钟重建一次）
- 响应很小（~200 字节）

### 四层缓存架构

```
  ┌─────────────────┐
  │  第 1 层:        │  命中率: ~30%
  │  浏览器缓存      │  延迟: 0 ms
  │  (sessionStorage │  TTL: 会话时长
  │   + HTTP 缓存)   │
  └────────┬────────┘
           │ 未命中
  ┌────────▼────────┐
  │  第 2 层:        │  命中率: 剩余的 ~40%
  │  CDN / 边缘      │  延迟: 5-20 ms
  │  缓存            │  TTL: 5-15 分钟
  │  (CloudFront)    │
  └────────┬────────┘
           │ 未命中
  ┌────────▼────────┐
  │  第 3 层:        │  命中率: 剩余的 ~20%
  │  Redis 缓存      │  延迟: 1-5 ms
  │  （应用层）       │  TTL: 5 分钟
  └────────┬────────┘
           │ 未命中
  ┌────────▼────────┐
  │  第 4 层:        │  命中率: 100%（权威源）
  │  内存 Trie       │  延迟: < 1 ms
  │  (Trie 服务)     │
  └─────────────────┘
```

### 第 1 层：浏览器缓存

```javascript
// 使用 sessionStorage 的客户端缓存
const CACHE_KEY_PREFIX = 'ac_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function getCachedSuggestions(prefix) {
  const key = CACHE_KEY_PREFIX + prefix;
  const cached = sessionStorage.getItem(key);
  if (!cached) return null;

  const { suggestions, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_TTL_MS) {
    sessionStorage.removeItem(key);
    return null;
  }
  return suggestions;
}

function cacheSuggestions(prefix, suggestions) {
  const key = CACHE_KEY_PREFIX + prefix;
  sessionStorage.setItem(
    key,
    JSON.stringify({
      suggestions,
      timestamp: Date.now(),
    })
  );
}
```

**HTTP 缓存头**（由 API 服务器设置）：

```
Cache-Control: public, max-age=300
Vary: Accept-Encoding
```

### 第 2 层：CDN / 边缘缓存

热门前缀在全球 CDN 边缘节点缓存：

```
按流量排名的热门前缀（积极缓存这些）:

  前缀           QPS    CDN TTL
  ─────────────────────────────
  "how"          850    15 分钟
  "what"         720    15 分钟
  "how to"       680    15 分钟
  "best"         540    15 分钟
  "why"          430    15 分钟
  "where"        390    10 分钟
  "how to m"     180    10 分钟
  "iphone"       150     5 分钟   （产品发布时可能变化）

缓存键: locale + normalized_prefix
  例如 "en-US:how to m"
```

### 第 3 层：Redis 缓存（应用层）

```python
def get_suggestions_with_cache(prefix, locale):
    cache_key = f"ac:{locale}:{prefix}"

    # 先尝试 Redis
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # 回退到 Trie
    results = trie_service.lookup(prefix)

    # 填充 Redis 缓存
    redis.setex(cache_key, 300, json.dumps(results))

    return results
```

### 第 4 层：内存 Trie

Trie 本身充当最终缓存。它在每个 Trie 服务节点上将整个数据集保存在内存中。查找是 O(L) 的，无 I/O 操作。

### 缓存失效

```
当部署新的 Trie 快照时:
  1. Trie 服务器加载新快照（原子交换）
  2. Redis 缓存: 将 TTL 设为 0（清空）或让条目自然过期
  3. CDN: 对高流量前缀发送失效请求
  4. 浏览器缓存: 自行过期（短 TTL）

由于建议变化是渐进的，过期的缓存条目在几分钟内是可接受的。
大多数情况下不需要硬失效。
```

---

## 10. 扩展性

### Trie 分区（按前缀范围分片）

当 Trie 超出单服务器内存（大多数情况不太可能，但在极端规模下必要）时，按前缀分区：

```
分片 0: 以 [a-d] 开头的前缀     ~25% 的查询
分片 1: 以 [e-j] 开头的前缀     ~30% 的查询
分片 2: 以 [k-p] 开头的前缀     ~20% 的查询
分片 3: 以 [q-z] 开头的前缀     ~15% 的查询
分片 4: 以 [0-9, _] 开头的前缀  ~10% 的查询

注意: 分区不是按字母数量均分的。它们按查询量划分
以平衡各分片的负载。

    ┌───────────┐
    │   路由器   │ prefix -> 分片映射
    └─────┬─────┘
     ┌────┼─────┬──────┬──────┐
     ▼    ▼     ▼      ▼      ▼
  ┌────┐┌────┐┌────┐┌────┐┌────┐
  │ S0 ││ S1 ││ S2 ││ S3 ││ S4 │
  │a-d ││e-j ││k-p ││q-z ││0-9 │
  └────┘└────┘└────┘└────┘└────┘
```

**动态重分片：** 如果分片 1（e-j）成为热点：

- 拆分为两个：[e-g] 和 [h-j]
- 更新路由器的前缀到分片映射
- 两个新分片分别加载各自的 Trie 分区

### 读扩展的副本

每个分片都有副本以实现高可用性和读吞吐量：

```
                     ┌──────────────────────────────┐
                     │         分片 0 (a-d)          │
                     │                              │
                     │  ┌────────┐   ┌────────┐    │
                     │  │ 主节点  │   │ 副本   │    │
                     │  │  (读/写)│   │  (读)  │    │
                     │  └────────┘   └────────┘    │
                     │               ┌────────┐    │
                     │               │ 副本   │    │
                     │               │  (读)  │    │
                     │               └────────┘    │
                     └──────────────────────────────┘

读分配:
  - 主节点: 处理 Trie 快照更新
  - 副本: 处理读流量（负载均衡）
  - 复制: 基于推送的（主节点将新快照推送给副本）
```

### 地理分布

在多个区域部署 Trie 服务以最小化延迟：

```
                    ┌──────────────────────┐
                    │  Trie 构建器          │
                    │  （中心 / us-east）   │
                    └──────────┬───────────┘
                               │ 推送快照
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  us-east    │  │  eu-west    │  │  ap-south   │
     │  Trie 节点  │  │  Trie 节点  │  │  Trie 节点  │
     │  (3 分片    │  │  (3 分片    │  │  (3 分片    │
     │   x 2 副本) │  │   x 2 副本) │  │   x 2 副本) │
     └─────────────┘  └─────────────┘  └─────────────┘

用户通过 GeoDNS / Anycast 路由到最近的区域。
每个区域拥有 Trie 的完整副本。
```

### 多语言支持

每种语言有独立的 Trie（不同的字符集、不同的查询模式）：

```
特定语言的考虑因素:

语言        字符集          分词方式          Trie 类型
─────────────────────────────────────────────────────────
English      ASCII/Latin    空格分词          标准前缀 Trie
Chinese      CJK Unicode    字符级别          字符 Trie（无空格）
Japanese     混合           形态学分析        混合（汉字 + 假名 Trie）
Korean       Hangul         字母/音节         字母级别 Trie
Arabic       Arabic script  从右到左          RTL 感知 Trie

存储策略:
  每个 locale 一个独立 Trie:
    trie/en-US/snapshot_2024030112.bin   (300 MB)
    trie/zh-CN/snapshot_2024030112.bin   (250 MB)
    trie/ja-JP/snapshot_2024030112.bin   (200 MB)

  每个 Trie 服务器加载其分配的 locale 的 Trie。
  路由: locale 头 -> 对应的 Trie 分片。
```

**中文示例（字符级别 Trie）：**

```
查询: "how to" 的中文可能以拼音输入: "zenme"
或直接输入中文字符: "怎么"

中文的字符级别 Trie:

        (root)
       /      \
     怎        如
      |         |
     么         何
    / | \       |
   做  办  样   ...
   |  |   |
  饭  事  ...
   |
  [end] -> "怎么做饭"（how to cook）
```

---

## 11. 部署架构

### 多区域部署图

```
                          ┌─────────────────────────┐
                          │      全局 DNS            │
                          │   (Route53 / GeoDNS)    │
                          └────────────┬────────────┘
                                       │
                    ┌──────────────────┬┴──────────────────┐
                    │                  │                    │
           ┌────────▼───────┐ ┌────────▼───────┐  ┌────────▼───────┐
           │   CDN 边缘     │ │   CDN 边缘     │  │   CDN 边缘     │
           │   美国区域     │ │   欧洲区域     │  │   亚太区域     │
           └────────┬───────┘ └────────┬───────┘  └────────┬───────┘
                    │                  │                    │
           ┌────────▼───────┐ ┌────────▼───────┐  ┌────────▼───────┐
           │ us-east-1      │ │ eu-west-1      │  │ ap-southeast-1 │
           │ ┌────────────┐ │ │ ┌────────────┐ │  │ ┌────────────┐ │
           │ │    ALB     │ │ │ │    ALB     │ │  │ │    ALB     │ │
           │ └──────┬─────┘ │ │ └──────┬─────┘ │  │ └──────┬─────┘ │
           │   ┌────┴────┐  │ │   ┌────┴────┐  │  │   ┌────┴────┐  │
           │   ▼         ▼  │ │   ▼         ▼  │  │   ▼         ▼  │
           │ ┌───┐    ┌───┐ │ │ ┌───┐    ┌───┐ │  │ ┌───┐    ┌───┐ │
           │ │API│    │API│ │ │ │API│    │API│ │  │ │API│    │API│ │
           │ │ 1 │    │ 2 │ │ │ │ 1 │    │ 2 │ │  │ │ 1 │    │ 2 │ │
           │ └─┬─┘    └─┬─┘ │ │ └─┬─┘    └─┬─┘ │  │ └─┬─┘    └─┬─┘ │
           │   └────┬────┘  │ │   └────┬────┘  │  │   └────┬────┘  │
           │   ┌────▼────┐  │ │   ┌────▼────┐  │  │   ┌────▼────┐  │
           │   │  Redis   │  │ │   │  Redis   │  │  │   │  Redis   │  │
           │   │  Cluster │  │ │   │  Cluster │  │  │   │  Cluster │  │
           │   └────┬────┘  │ │   └────┬────┘  │  │   └────┬────┘  │
           │   ┌────▼────┐  │ │   ┌────▼────┐  │  │   ┌────▼────┐  │
           │   │  Trie    │  │ │   │  Trie    │  │  │   │  Trie    │  │
           │   │  Service │  │ │   │  Service │  │  │   │  Service │  │
           │   │  Nodes   │  │ │   │  Nodes   │  │  │   │  Nodes   │  │
           │   │ (3x 副本)│  │ │   │ (3x 副本)│  │  │   │ (3x 副本)│  │
           │   └──────────┘  │ │   └──────────┘  │  │   └──────────┘  │
           └─────────────────┘ └─────────────────┘  └─────────────────┘
                    │
           ┌────────▼───────────────────────────────────────────┐
           │              中心数据管道                            │
           │  ┌──────────┐  ┌───────────┐  ┌───────────────┐   │
           │  │  Kafka   │─>│ 聚合器    │─>│ Trie 构建器   │   │
           │  │  Cluster │  │(Flink)    │  │ （定期任务）   │   │
           │  └──────────┘  └───────────┘  └───────┬───────┘   │
           │                                       │            │
           │                               ┌───────▼───────┐   │
           │                               │  快照           │   │
           │                               │  存储 (S3)     │   │
           │                               └───────────────┘   │
           └────────────────────────────────────────────────────┘
```

### CDN + 边缘缓存详情

```
CDN 缓存规则:

路径模式                   缓存 TTL     缓存键
──────────────────────────────────────────────────────
/v1/suggestions?*         5 分钟        locale + prefix
  （热门前缀）             15 分钟       （top 1K 延长）
  （长尾前缀）             1 分钟        （稀有查询缩短）

缓存预热策略:
  - 为每个 locale 预填充 CDN 的 top 10,000 前缀
  - 部署新 Trie 时，为热门前缀预热 CDN
  - 使用缓存标签进行高效失效

CDN 命中率目标: 所有请求的 50-60%
  （将源站流量减少一半以上）
```

### 健康检查与故障转移

```
健康检查层级:

  1. CDN 健康检查（每 10 秒）
     -> 如果区域不健康，路由到最近的下一个区域

  2. ALB 健康检查（每 5 秒）
     -> API 服务器的 /health 端点
     -> 将不健康的实例从轮转中移除

  3. Trie 服务健康检查（每 5 秒）
     -> /ready 端点检查:
        - Trie 已加载到内存？（是/否）
        - 快照年龄 < 2 小时？（是/否）
        - 内存使用率 < 90%？（是/否）

  故障转移序列:
    API 服务器故障   -> ALB 路由到健康服务器（< 5 秒）
    Trie 节点故障    -> API 回退到 Redis 缓存（< 1 秒）
    Redis 故障       -> API 返回空建议（优雅降级）
    整个区域宕机     -> DNS 故障转移到下一个区域（< 60 秒）
```

---

## 12. 常见面试追问

### 如何处理热门/突发查询？

**问题：** 突发新闻事件（如地震、名人新闻）产生大量新查询，而定期 Trie 重建尚未捕获。

**解决方案：热门查询快速通道**

```
检测:
  - 流处理器监控查询速率
  - 如果某查询在过去 5 分钟内的计数超过历史平均值的 10 倍，
    将其标记为"热门"

快速通道:
  1. 热门查询被实时推送到一个小型"热门 Trie"
  2. 查询时，合并基础 Trie + 热门 Trie 的结果
  3. 热门 Trie 每 30-60 秒重建一次（它很小，< 10K 条目）

分数提升:
  trending_score = base_score * trending_multiplier
  trending_multiplier = min(5.0, velocity_ratio)
  其中 velocity_ratio = recent_count / historical_average

示例:
  "earthquake los angeles" -> 历史平均: 10/小时 -> 当前: 50,000/小时
  velocity_ratio = 5000 -> trending_multiplier = 5.0
  此查询跃升至 "earthquake" 前缀建议的顶部
```

### 如何实现个性化建议？

```
个性化的数据来源:
  1. 用户搜索历史（最近 30 天）
  2. 用户点击历史（搜索后点击了什么）
  3. 用户位置（地理感知建议）
  4. 用户语言偏好
  5. 协同过滤（和你类似的用户搜索了 X）

架构:
  ┌────────────┐     ┌──────────────┐     ┌─────────────────┐
  │ 用户输入   │────>│ 全局 Trie    │────>│ 个性化          │
  │ 前缀       │     │ (top-K)      │     │ 排序器          │
  └────────────┘     └──────────────┘     └────────┬────────┘
                                                    │
                                          ┌─────────▼────────┐
                                          │ 用户画像          │
                                          │ 存储 (Redis)     │
                                          │ - 最近查询       │
                                          │ - 点击历史       │
                                          │ - 偏好           │
                                          └──────────────────┘

混合公式:
  final_score = alpha * global_score + beta * personal_score + gamma * recency_score
  其中 alpha + beta + gamma = 1.0

  典型权重:
    alpha = 0.5（全局热度）
    beta  = 0.3（个人相关性）
    gamma = 0.2（时效性）

隐私考虑:
  - 使用静态加密存储用户画像
  - 允许用户选择退出个性化
  - 提供"清除搜索历史"功能
  - 90 天后匿名化数据
```

### 如何过滤不适当的建议？

```
多层过滤:

第 1 层: 静态黑名单
  - 由内容审核团队维护
  - 精确匹配 + 正则表达式模式
  - 每周或按需更新
  - 示例: 脏话、色情内容、非法活动

第 2 层: ML 内容分类器（离线）
  - 在 Trie 构建阶段运行
  - 二分类器: 安全 / 不安全
  - 在 100K+ 标注查询数据集上训练
  - P(unsafe) > 0.8 的查询从 Trie 中排除
  - 模型每月重新训练

第 3 层: 实时安全检查
  - 针对绕过第 1 层和第 2 层的查询（新的、未见过的查询）
  - 查询时进行轻量级正则检查
  - 仅应用于不在基础 Trie 中的热门/趋势查询

第 4 层: 人工审核队列
  - 0.5 < P(unsafe) < 0.8 的查询进入人工审核
  - 审核员标记为安全/不安全
  - 决定反馈到训练数据

边缘案例处理:
  - 上下文相关查询: "how to kill" -> 进程？游戏 Boss？-> 允许但监控
  - 医学查询: "symptoms of..." -> 允许（合法的健康搜索）
  - 新闻事件: "shooting in..." -> 允许新闻相关，阻止教学性内容
```

### 如何处理多语言自动补全？

```
策略: 每种语言一个独立 Trie + 统一路由

检测:
  - 输入法: 键盘布局 / IME 告诉我们语言
  - 字符检测: Unicode 块分析
    - Latin (U+0041-U+024F) -> 可能是英语/欧洲语言
    - CJK (U+4E00-U+9FFF)  -> 可能是中文
    - Hangul (U+AC00-U+D7AF) -> 韩语
  - 用户的 locale 设置（主要信号）
  - 混合输入: 拼音 "nihao" 可能是英语或中文拼音

每种语言一个 Trie:
  trie_en: 英语查询（ASCII 优化，每节点 26 个子节点）
  trie_zh: 中文查询（Unicode，可能有数千个子节点）
  trie_ja: 日语查询（平假名 + 片假名 + 汉字）
  trie_ko: 韩语查询（字母级别分解）

中文特有: 拼音支持
  用户输入拼音 "zhongguo" -> 建议 "中国"（China）
  在字符 Trie 旁边维护一个拼音到汉字的 Trie

查询路由:
  1. 从输入的字符检测输入语言
  2. 路由到适当的语言 Trie
  3. 对于拼音输入，同时检查英语 Trie 和拼音 Trie
  4. 合并结果并按语言偏好加权

跨语言考虑:
  - 品牌名: "iPhone" 应出现在所有语言的 Trie 中
  - 音译: "Starbucks" vs "星巴克" vs "スターバックス"
  - 语码切换: "如何 install python"（中英混合）
```

### 如何实现"您是不是想找"建议？

```
"您是不是想找"纠正的是完整提交的查询，与自动补全
（补全前缀）不同。但两个系统共享基础设施。

技术:

1. 预计算纠正映射（推荐用于自动补全）
   - 对 top 100K 查询，生成常见拼写错误
   - 使用编辑距离、键盘邻近度、语音相似度
   - 存储为哈希映射: 拼写错误 -> 纠正

   示例:
     "recpie"    -> "recipe"
     "pythong"   -> "python"
     "amazno"    -> "amazon"
     "youutbe"   -> "youtube"

2. Norvig 拼写纠正器（轻量级）
   - 生成编辑距离 1-2 内的所有字符串
   - 检查哪些存在于查询词典中
   - 按频率排序

   伪代码:
     def correct(word):
         candidates = (
             known([word]) or           # 精确匹配
             known(edits1(word)) or     # 编辑距离 1
             known(edits2(word)) or     # 编辑距离 2
             [word]                      # 放弃
         )
         return max(candidates, key=frequency)

3. 基于 Embedding 的纠正（ML 方法）
   - 将查询编码为向量 embedding
   - 找到拼写错误查询的最近邻
   - 返回最接近的已知查询作为纠正
   - 对语义相似性效果好，不仅限于拼写错误

与自动补全的集成:
  - 如果前缀在 Trie 中没有匹配:
    1. 对前缀尝试拼写纠正
    2. 如果找到纠正，返回纠正后前缀的建议
    3. 在响应前添加"您是不是想找: {纠正后的查询}"
```

---

## 总结：关键设计决策

| 决策         | 选择                                  | 理由                    |
| ------------ | ------------------------------------- | ----------------------- |
| 核心数据结构 | 带预计算 Top-K 的 Trie                | O(L) 查找，查询时无 DFS |
| Trie 变体    | 压缩（Patricia）Trie                  | 10 倍空间缩减           |
| 更新策略     | 定期快照重建（15 分钟）+ 热门 Trie    | 平衡新鲜度与成本        |
| 缓存         | 4 层（浏览器、CDN、Redis、内存 Trie） | 每一跳都最小化延迟      |
| 分片         | 前缀范围分区                          | 简单路由，负载均衡      |
| 多语言       | 每个 locale 一个独立 Trie             | 不同字符集和模式        |
| 内容过滤     | 黑名单 + ML 分类器（离线）            | 安全且不增加查询延迟    |
| 个性化       | 在 API 层混合全局 + 个人分数          | 非侵入式，可选层        |

### 延迟分解（p50）

```
CDN 命中路径:        ~10 ms  （CDN 边缘 -> 客户端）
缓存命中路径:        ~25 ms  （客户端 -> CDN 未命中 -> API -> Redis 命中 -> 响应）
Trie 查找路径:       ~35 ms  （客户端 -> CDN 未命中 -> API -> Redis 未命中 -> Trie -> 响应）
  - 网络（客户端 -> LB）:   15 ms
  - API 处理:                2 ms
  - Trie 查找:             < 1 ms
  - 网络（LB -> 客户端）:   15 ms
  - 序列化:                  2 ms
```

所有路径都完全在 100 ms p99 目标之内。
