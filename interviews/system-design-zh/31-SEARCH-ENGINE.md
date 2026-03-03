# 设计全文搜索引擎 (Elasticsearch / Solr / Algolia)

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [Inverted Index](#5-inverted-index)
6. [文本分析流水线](#6-文本分析流水线)
7. [索引流程](#7-索引流程)
8. [BM25 评分](#8-bm25-评分)
9. [查询类型](#9-查询类型)
10. [Faceted Search](#10-faceted-search)
11. [自动补全与建议](#11-自动补全与建议)
12. [相关性调优](#12-相关性调优)
13. [分布式搜索](#13-分布式搜索)
14. [Near-Real-Time Search](#14-near-real-time-search)
15. [索引生命周期管理](#15-索引生命周期管理)
16. [Hybrid Search](#16-hybrid-search)
17. [Elasticsearch 集群架构](#17-elasticsearch-集群架构)
18. [扩展策略](#18-扩展策略)
19. [权衡取舍](#19-权衡取舍)
20. [搜索引擎对比](#20-搜索引擎对比)
21. [常见面试追问](#21-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | Full-Text Search | 接受用户查询并根据文本相关性返回排序后的文档 |
| 2 | 文档索引 | 从多个来源摄取、解析、分析和索引文档 |
| 3 | 查询语言 | 支持 term、phrase、bool、fuzzy、wildcard 和 range 查询 |
| 4 | Faceted Search | 返回聚合的 facet 计数，用于下钻导航 |
| 5 | Autocomplete | 基于前缀和 edge n-gram 的建议，延迟低于 50ms |
| 6 | 相关性调优 | 字段加权、自定义评分函数、业务规则注入 |
| 7 | Near-Real-Time (NRT) | 索引后的文档在约 1 秒内可被搜索到 |
| 8 | 多租户 | 每个租户隔离索引，并设置租户级别配额 |
| 9 | 高亮与摘要 | 返回匹配词项的高亮和上下文摘要 |
| 10 | 同义词支持 | 在索引时或查询时使用同义词词典扩展查询 |
| 11 | 分析 | 跟踪查询计数、零结果率、点击率 |
| 12 | Hybrid Search | 结合关键词 (BM25) 和向量 (kNN) 搜索，融合结果 |

### 非功能性需求

| 需求 | 目标 |
|------|------|
| 搜索延迟 | 关键词搜索 p99 < 100ms |
| 索引延迟 | 从文档写入到可搜索 < 1 秒 (NRT) |
| 可用性 | 99.99%（每年停机时间 < 52 分钟） |
| 查询吞吐量 | 持续 10,000+ QPS |
| 索引吞吐量 | 每小时 1,000,000 次文档更新 |
| 持久性 | 零数据丢失；最少跨 3 个节点复制 |
| 可扩展性 | 通过分片实现线性水平扩展 |
| 一致性 | 搜索结果可接受最终一致性 |

### 规模估算

```
文档:
  总文档语料库:                    10 亿文档
  平均文档大小:                    5 KB（未压缩文本 + 元数据）
  原始数据大小:                    10亿 * 5 KB = 5 TB 原始数据

索引大小:
  Inverted index 开销:             ~10x（posting lists、term dict、norms、doc values）
  10 亿文档的索引大小:              ~50 TB 跨集群
  每个 shard 目标:                 25-50 GB（Elasticsearch 推荐）
  所需 shard 数:                   50 TB / 40 GB 平均 = ~1,250 个 shard
  含 1 个副本:                     共 2,500 个主 shard + 副本 shard

查询负载:
  总 QPS:                          10,000 QPS
  峰值 QPS (2x):                   20,000 QPS
  平均查询扇出:                     每次查询 5 个 shard
  Shard 级 QPS:                    10,000 * 5 = 50,000 shard 查询/秒

索引负载:
  100万 更新/小时 = 平均约 278 更新/秒
  峰值突发 (10x):                  2,780 更新/秒
  每次更新: 分析 + 合并 segment + WAL 写入

网络:
  平均查询响应大小:                 10 KB（10 个结果含摘要）
  出站带宽:                        10,000 * 10 KB = 100 MB/秒 查询流量
  索引入站带宽:                     2,780 * 5 KB = ~14 MB/秒

节点（每节点 64 GB RAM 的粗略估算）:
  数据节点:                        ~100 个节点（50 TB / 每节点 500 GB 可用）
  Master 节点:                     3 个专用（奇数仲裁）
  协调节点:                        10 个（用于 10K QPS 的查询扇出）
  Ingest 节点:                     5 个（用于流水线处理）
```

### 粗略估算总结

| 资源 | 估算值 |
|------|--------|
| 总文档数 | 10 亿 |
| 索引存储 | 50 TB |
| 查询吞吐量 | 10K QPS（峰值 20K） |
| 索引速率 | 平均 278/秒，突发 2,780/秒 |
| 数据节点 | ~100 个节点 @ 64 GB RAM |
| p99 搜索延迟 | < 100ms |
| NRT 索引延迟 | < 1 秒 |

---

## 2. API 设计

### 索引文档

```
POST /indexes/{index_name}/documents
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "id": "doc_a1b2c3",
  "title": "Introduction to Distributed Systems",
  "body": "A distributed system is a collection of computers...",
  "author": "Jane Smith",
  "tags": ["distributed", "systems", "computer-science"],
  "category": "technology",
  "published_at": "2024-01-15T10:00:00Z",
  "view_count": 12345,
  "embedding": [0.123, -0.456, ...]  // 可选: 用于 hybrid search
}

Response 201 Created:
{
  "id": "doc_a1b2c3",
  "index": "articles",
  "version": 1,
  "result": "created",
  "shards": { "total": 2, "successful": 2, "failed": 0 }
}
```

### 批量索引文档

```
POST /indexes/{index_name}/documents/bulk
Content-Type: application/json

{
  "documents": [
    { "id": "doc_001", "title": "...", "body": "..." },
    { "id": "doc_002", "title": "...", "body": "..." }
  ],
  "refresh": "wait_for"  // "true" | "false" | "wait_for"
}

Response 200 OK:
{
  "took": 42,
  "errors": false,
  "items": [
    { "index": { "_id": "doc_001", "result": "created", "status": 201 } },
    { "index": { "_id": "doc_002", "result": "created", "status": 201 } }
  ]
}
```

### 搜索文档

```
POST /indexes/{index_name}/search
Content-Type: application/json

{
  "query": {
    "bool": {
      "must": [
        { "match": { "body": "distributed systems" } }
      ],
      "filter": [
        { "term": { "category": "technology" } },
        { "range": { "published_at": { "gte": "2024-01-01" } } }
      ],
      "should": [
        { "match": { "title": { "query": "distributed systems", "boost": 2.0 } } }
      ]
    }
  },
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 10 }
    },
    "by_author": {
      "terms": { "field": "author.keyword", "size": 5 }
    }
  },
  "highlight": {
    "fields": { "body": { "fragment_size": 150, "number_of_fragments": 3 } }
  },
  "sort": [
    { "_score": "desc" },
    { "published_at": "desc" }
  ],
  "from": 0,
  "size": 10,
  "track_total_hits": true
}

Response 200 OK:
{
  "took": 12,
  "timed_out": false,
  "hits": {
    "total": { "value": 4821, "relation": "eq" },
    "max_score": 8.74,
    "hits": [
      {
        "_id": "doc_a1b2c3",
        "_score": 8.74,
        "_source": {
          "title": "Introduction to Distributed Systems",
          "author": "Jane Smith",
          "category": "technology",
          "published_at": "2024-01-15T10:00:00Z"
        },
        "highlight": {
          "body": [
            "A <em>distributed</em> <em>system</em> is a collection of computers..."
          ]
        }
      }
    ]
  },
  "aggregations": {
    "by_category": {
      "buckets": [
        { "key": "technology", "doc_count": 2341 },
        { "key": "science", "doc_count": 1205 }
      ]
    }
  }
}
```

### Autocomplete / 建议

```
POST /indexes/{index_name}/suggest
Content-Type: application/json

{
  "prefix": "distrib",
  "field": "title.suggest",
  "size": 5,
  "fuzzy": { "fuzziness": 1 }
}

Response 200 OK:
{
  "suggestions": [
    { "text": "distributed systems", "score": 0.98, "freq": 4821 },
    { "text": "distributed computing", "score": 0.94, "freq": 3102 },
    { "text": "distributed databases", "score": 0.91, "freq": 2567 }
  ]
}
```

### 删除文档

```
DELETE /indexes/{index_name}/documents/{doc_id}

Response 200 OK:
{
  "id": "doc_a1b2c3",
  "index": "articles",
  "result": "deleted",
  "version": 2
}
```

### 获取索引统计信息

```
GET /indexes/{index_name}/stats

Response 200 OK:
{
  "index": "articles",
  "docs": { "count": 1000000000, "deleted": 12345 },
  "store": { "size_bytes": 52428800000 },
  "indexing": { "index_total": 5000000, "index_time_ms": 14200 },
  "search": { "query_total": 8432000, "query_time_ms": 21043 },
  "shards": { "total": 10, "primary": 5, "replicas": 5 }
}
```

---

## 3. 数据模型

### 索引映射（Schema）

```json
{
  "mappings": {
    "properties": {
      "id":           { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword":  { "type": "keyword", "ignore_above": 256 },
          "suggest":  { "type": "completion" },
          "ngram":    { "type": "text", "analyzer": "edge_ngram_analyzer" }
        }
      },
      "body": {
        "type": "text",
        "analyzer": "english",
        "index_options": "offsets",
        "term_vector": "with_positions_offsets"
      },
      "author": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "tags":         { "type": "keyword" },
      "category":     { "type": "keyword" },
      "published_at": { "type": "date", "format": "strict_date_time" },
      "view_count":   { "type": "long" },
      "embedding": {
        "type": "dense_vector",
        "dims": 768,
        "index": true,
        "similarity": "cosine"
      }
    }
  },
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "edge_ngram_analyzer": {
          "tokenizer": "edge_ngram_tokenizer",
          "filter": ["lowercase"]
        }
      },
      "tokenizer": {
        "edge_ngram_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 20,
          "token_chars": ["letter", "digit"]
        }
      }
    },
    "index.refresh_interval": "1s",
    "index.merge.scheduler.max_thread_count": 1
  }
}
```

### Posting List 条目

```
Term: "distributed"

Posting List:
+----------+--------+-------+---------------------+
| doc_id   | tf     | norm  | positions           |
+----------+--------+-------+---------------------+
| doc_001  |  3     | 0.72  | [4, 18, 42]         |
| doc_005  |  1     | 0.85  | [2]                 |
| doc_012  |  7     | 0.61  | [1, 3, 8, 11, ...]  |
| doc_019  |  2     | 0.78  | [6, 22]             |
+----------+--------+-------+---------------------+

Term Dictionary 条目:
{
  "term": "distributed",
  "doc_freq": 48210,      // 包含该词项的文档数
  "total_tf": 127443,     // 所有文档中该词项的词频总和
  "offset": 4294967296    // posting list 文件中的字节偏移
}
```

### Lucene Segment 结构

```
Segment（一旦写入即不可变）:
+-----------------------------+
|  .tim  - Term Dictionary    |  (FST: 词项 -> 块偏移)
|  .tip  - Term Index         |  (.tim 的 FST 索引)
|  .doc  - Postings (docIDs)  |  (delta 编码, FOR 压缩)
|  .pos  - Positions          |  (用于 phrase 查询的位置数据)
|  .pay  - Payloads           |  (用于高亮的偏移量)
|  .nvd  - Norms              |  (每字段长度归一化)
|  .dvm  - Doc Values         |  (列式: 排序, 聚合)
|  .fdt  - Stored Fields      |  (_source 文档存储)
|  .fdx  - Field Index        |  (.fdt 的偏移)
|  .si   - Segment Info       |  (segment 元数据)
+-----------------------------+
```

---

## 4. 高层架构

```
+--------------------------------------------------+
|                    客户端层                        |
|  Web 应用 | 移动应用 | 内部服务                    |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|              负载均衡器 / API 网关                 |
|        (限流、认证、路由)                          |
+--------------------------------------------------+
           |                          |
           v                          v
+---------------------+    +---------------------+
|  协调节点            |    |   Ingest 节点        |
|  (查询扇出)          |    |   (文档处理)          |
|  10 个节点           |    |   5 个节点            |
+---------------------+    +---------------------+
           |                          |
           v                          v
+--------------------------------------------------+
|            数据节点集群（100 个节点）                |
|                                                  |
|  +----------+  +----------+  +----------+        |
|  | Shard P0 |  | Shard P1 |  | Shard P2 |  ...  |
|  | (主分片)  |  | (主分片)  |  | (主分片)  |        |
|  +----------+  +----------+  +----------+        |
|  +----------+  +----------+  +----------+        |
|  | Shard R0 |  | Shard R1 |  | Shard R2 |  ...  |
|  | (副本)    |  | (副本)    |  | (副本)    |        |
|  +----------+  +----------+  +----------+        |
+--------------------------------------------------+
           |
           v
+--------------------------------------------------+
|            Master 节点集群（3 个节点）               |
|   集群状态 | Shard 分配 | 选举                      |
+--------------------------------------------------+

支撑基础设施:
+------------------+  +------------------+  +------------------+
|   消息队列        |  |   对象存储        |  |   配置存储        |
|   (Kafka)        |  |   (S3 / MinIO)   |  |   (ZooKeeper /   |
|   文档摄取        |  |   快照存储        |  |    etcd)         |
+------------------+  +------------------+  +------------------+
```

### 写入路径（文档索引）

```
文档来源
     |
     v
+-------------+     +------------------+     +------------------+
|  生产者      | --> |  Kafka Topic     | --> |  Ingest 节点      |
|  (API 调用   |     |  (doc-updates)   |     |  流水线           |
|   或 CDC)    |     +------------------+     |  - 丰富           |
+-------------+                              |  - 验证           |
                                             |  - 转换           |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  文本分析         |
                                             |  流水线           |
                                             |  (按字段)         |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  主分片           |
                                             |  - 写入 WAL      |
                                             |  - 添加到缓冲区   |
                                             |  - Refresh ->    |
                                             |    新 segment     |
                                             +------------------+
                                                      |
                                                      v
                                             +------------------+
                                             |  副本分片         |
                                             |  (并行写入)       |
                                             +------------------+
```

### 读取路径（查询执行）

```
客户端查询
     |
     v
+------------------+
|  协调节点         |  1. 解析并验证查询
|                  |  2. 确定目标 shard
|                  |  3. 扇出到 N 个 shard
+------------------+
     |   (scatter)
     +----------+----------+----------+
     v          v          v          v
 Shard 0    Shard 1    Shard 2    Shard N
  本地        本地        本地        本地
  搜索        搜索        搜索        搜索
  Top-K       Top-K       Top-K       Top-K
     |          |          |          |
     +----------+----------+----------+
                   | (gather)
                   v
            +------------------+
            |  协调节点         |  4. 合并并重新排名 top-K
            |                  |  5. 获取 top hits 的 _source
            |                  |  6. 运行聚合
            +------------------+
                   |
                   v
              响应结果
```

---

## 5. Inverted Index

### 概念与结构

Inverted index 是支撑全文搜索的核心数据结构。它不是将文档映射到词语，而是将词语（词项）映射到包含它们的文档。

```
正排索引（文档 -> 词语）:
  doc_1: ["the", "quick", "brown", "fox"]
  doc_2: ["the", "lazy", "brown", "dog"]
  doc_3: ["quick", "fox", "jumped", "dog"]

倒排索引（词项 -> 文档列表）:
  "brown"  -> [doc_1, doc_2]
  "dog"    -> [doc_2, doc_3]
  "fox"    -> [doc_1, doc_3]
  "jumped" -> [doc_3]
  "lazy"   -> [doc_2]
  "quick"  -> [doc_1, doc_3]
  "the"    -> [doc_1, doc_2]
```

### Posting List 详情

Posting list 中的每个条目存储的不仅仅是文档 ID：

```
"search" 的 Posting List:

+--------+---------+----------+--------------------+-----------+
| doc_id | term_freq | doc_norm | positions          | offsets   |
+--------+---------+----------+--------------------+-----------+
|   42   |    5    |  0.8165  | [3, 14, 28, 35, 51]| byte pos  |
|  107   |    2    |  0.9129  | [1, 7]             | byte pos  |
|  283   |    1    |  1.0000  | [22]               | byte pos  |
|  501   |    8    |  0.7071  | [2, 5, 9, ...]     | byte pos  |
+--------+---------+----------+--------------------+-----------+

字段说明:
  doc_id    : 文档标识符（delta 编码以压缩）
  term_freq : 该词项在文档中出现的次数 (TF)
  doc_norm  : 字段长度归一化因子 (1/sqrt(num_tokens))
  positions : 字段中的 token 位置（用于 phrase 查询）
  offsets   : 词项出现位置的字节偏移（用于高亮）
```

### Posting List 压缩

Delta 编码显著减少存储空间：

```
原始 doc ID:      [100, 103, 110, 115, 120, 145, 200]
Delta 编码后:     [100,   3,   7,   5,   5,  25,  55]

Frame of Reference (FOR) 编码:
  128 个 doc ID 为一块:
  +-------+--------+--------+--------+--------+
  | bits  | delta0 | delta1 | delta2 | ...    |
  | per N |        |        |        |        |
  +-------+--------+--------+--------+--------+
  (每个 delta 使用所需的最少位数存储)

PForDelta: 单独处理异常值，其余紧密打包
  -> 相比原始 32 位整数可实现 4-8x 压缩比
```

### Term Dictionary (FST)

Term dictionary 使用 Finite State Transducer (FST) 实现 O(term_length) 的查找：

```
FST 示例，词项: ["cat", "cats", "car", "cars", "bar"]

        +---+
  b --> | b | --> a --> r --> [输出: "bar" 的 posting 偏移]
  c --> | c | --> a --> r --> [输出: "car" 的 posting 偏移]
        |   |         |
        |   |         +-> r --> s --> [输出: "cars" 的 posting 偏移]
        |   |
        |   |     --> a --> t --> [输出: "cat" 的 posting 偏移]
        |   |               |
        +---+               +-> s --> [输出: "cats" 的 posting 偏移]

特性:
  - 一旦构建即不可变（与 Lucene 的 segment 不可变性一致）
  - 存储在单个数组中（紧凑的内存布局）
  - 前缀共享消除冗余存储
  - O(len(term)) 查找时间
```

---

## 6. 文本分析流水线

分析流水线将原始文本转换为可索引的 token。

### 流水线概览

```
原始输入: "The Quick-Brown Foxes are RUNNING fast!"
               |
               v
     +------------------+
     |    Tokenizer     |  按空白/标点分词
     +------------------+
               |
               v
     ["The", "Quick", "Brown", "Foxes", "are", "RUNNING", "fast"]
               |
               v
     +------------------+
     |  小写过滤器       |  统一大小写
     +------------------+
               |
               v
     ["the", "quick", "brown", "foxes", "are", "running", "fast"]
               |
               v
     +------------------+
     | 停用词过滤器      |  移除高频词
     +------------------+  (按语言可配置)
               |
               v
     ["quick", "brown", "foxes", "running", "fast"]
               |
               v
     +------------------+
     |  词干提取/词形还原 |  还原为词根形式
     +------------------+  (英语使用 Snowball/Porter)
               |
               v
     ["quick", "brown", "fox", "run", "fast"]
               |
               v
     +------------------+
     | 同义词扩展器      |  扩展同义词（可选）
     +------------------+
               |
               v
     ["quick", "brown", "fox", "run", "fast",
      "rapid", "swift"]          // "fast" -> 也索引同义词
               |
               v
     最终 Token -> 写入 Inverted Index
```

### 分析器类型

```
+-------------------+------------------------------------------+
| 分析器             | 行为                                      |
+-------------------+------------------------------------------+
| standard          | Unicode 分词器 + 小写 + 停用词             |
| english           | Standard + Snowball 词干提取（英语）        |
| simple            | 空白分割 + 仅小写                          |
| whitespace        | 按空白分割，无其他转换                      |
| keyword           | 整个输入作为单个 token（不分析）              |
| pattern           | 基于正则的分词                              |
| fingerprint       | 去重指纹（排序的唯一 token）                 |
| custom            | 组合任意分词器 + 过滤器                      |
+-------------------+------------------------------------------+
```

### 词干提取示例

```
Snowball / Porter 词干提取器（英语）:

  "running"   -> "run"
  "runs"      -> "run"
  "runner"    -> "runner"  (不是 "run" -- Porter 保留此形式)
  "foxes"     -> "fox"
  "studies"   -> "studi"
  "studying"  -> "studi"
  "beautiful" -> "beauti"
  "beauty"    -> "beauti"

词干提取的重要性:
  查询: "running shoes"
  文档包含: "run track shoes"
  无词干提取: "running" 匹配 0 次
  有词干提取:    "running" -> "run" = 匹配！
```

### 同义词处理

```
两种模式:

1. 索引时同义词（索引时扩展）:
   "quick, fast, rapid, swift"

   输入: "fast car"
   索引的 token: ["fast", "rapid", "swift", "quick", "car"]
   优点: 查询简单，索引更大
   缺点: 同义词变更时必须重建索引

2. 查询时同义词（查询时扩展）:
   输入查询: "fast car"
   扩展后查询: (fast OR rapid OR swift OR quick) AND car
   优点: 无需重建索引即可更改同义词
   缺点: 查询成本略高，评分差异

   最佳实践: 使用查询时同义词以获得灵活性
```

---

## 7. 索引流程

### 文档生命周期

```
1. 文档到达
   +-----------+
   |  文档      |  POST /indexes/articles/documents
   +-----------+
         |
         v
2. Ingest 流水线
   +-------------------+
   | - 解析 JSON       |
   | - 验证 schema     |
   | - 丰富字段        |
   | - 设置时间戳      |
   +-------------------+
         |
         v
3. 路由
   shard = hash(doc._id) % num_primary_shards
   -> 路由到正确的主分片节点
         |
         v
4. 写入主分片
   +---------------------------------------------+
   |  a) 追加到 Translog (WAL) -- fsync          |
   |  b) 添加到内存缓冲区 (IndexWriter)           |
   |  c) translog 写入后向客户端确认               |
   +---------------------------------------------+
         |
         v
5. 复制到副本
   +-------------------------------+
   | 主分片转发到副本               |
   | 副本写入 translog + 缓冲区    |
   | 所有副本 ACK 后视为成功        |
   +-------------------------------+
         |
         v
6. Refresh（默认每 1 秒）
   +----------------------------------------+
   | IndexWriter.flush() -> 新 Lucene seg   |
   | 打开 segment 用于搜索（NRT reader）     |
   | 文档现在可搜索                          |
   +----------------------------------------+
         |
         v
7. Flush（translog -> 持久化）
   +----------------------------------------+
   | 定期（默认 30 分钟）或基于大小           |
   | Lucene commit -> fsync 所有 segment     |
   | commit 后清除 translog                  |
   +----------------------------------------+
         |
         v
8. Segment 合并（后台）
   +----------------------------------------+
   | 小 segment 合并为大 segment              |
   | 物理删除已删除的文档                     |
   | 减少 segment 数量 -> 搜索更快            |
   +----------------------------------------+
```

### Translog（Write-Ahead Log）

```
Translog 在 Lucene commit 之间提供持久性:

  时间:  T0        T1 (refresh)  T2 (flush/commit)
         |              |              |
Translog [op1,op2,op3] [op4,op5]     (截断)
Segments     seg_1                  seg_1 + seg_2 (已提交)
Buffer   [op1,op2,op3]  (空)       (空)

节点重启时:
  1. 加载最后的 Lucene commit 点
  2. 重放自上次 commit 以来的 translog 条目
  3. 节点恢复到一致状态
```

### Segment 合并

```
随着时间推移，许多小 segment 会积累:

合并前:
  [seg_0: 100 docs] [seg_1: 120 docs] [seg_2: 80 docs]
  [seg_3: 90 docs]  [seg_4: 110 docs]

合并后 (TieredMergePolicy):
  [seg_merged: 500 docs]  (已删除的文档被移除！)

优点:
  - 每次搜索需要打开的文件更少
  - 已删除文档被物理清除
  - 更好的压缩比
  - 改善缓存利用率

合并策略控制:
  - max_merge_at_once: 每次合并最大 segment 数（默认 10）
  - segments_per_tier: 每个日志层的理想 segment 数（默认 10）
  - max_merged_segment: 如果结果 > N GB 则不合并（默认 5 GB）
```

---

## 8. BM25 评分

### 从 TF-IDF 的演进

```
TF-IDF（原始）:
  score(q, d) = sum over terms t: TF(t,d) * IDF(t)

  TF(t,d)  = freq(t,d) / |d|    (原始频率，无上限)
  IDF(t)   = log(N / df(t))     (N = 总文档数, df = 文档频率)

TF-IDF 的问题:
  1. TF 无限增长 -- 出现 100 次的词项评分远高于
     出现 10 次的（忽略了收益递减）
  2. 没有单独的长度归一化控制

BM25 (Okapi BM25) -- 解决这些问题:
  score(q, d) = sum over terms t in q:
                  IDF(t) * (TF(t,d) * (k1 + 1))
                           ---------------------------------
                           TF(t,d) + k1 * (1 - b + b * |d|/avgdl)

其中:
  TF(t,d) = 词项 t 在文档 d 中的词频
  |d|     = 文档 d 中的 token 数
  avgdl   = 语料库中的平均文档长度
  k1      = 词频饱和度（默认 1.2）
            k1 越高 -> TF 影响越大（饱和越慢）
  b       = 长度归一化（默认 0.75）
            b=1 -> 完全长度归一化
            b=0 -> 无长度归一化
  IDF(t)  = log(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
            (平滑处理以避免常见词项出现零/负值)
```

### BM25 直觉理解

```
TF 饱和效应:

  k1=1.2, b=0.75, |d|=avgdl

  tf=1  -> 评分分量 = 1 * (2.2) / (1 + 1.2) = ~1.0
  tf=2  -> 评分分量 = 2 * (2.2) / (2 + 1.2) = ~1.375
  tf=5  -> 评分分量 = 5 * (2.2) / (5 + 1.2) = ~1.77
  tf=10 -> 评分分量 = 10 * (2.2) / (10 + 1.2) = ~1.96
  tf=50 -> 评分分量 = 50 * (2.2) / (50 + 1.2) = ~2.15
  tf=inf -> 趋近于 k1+1 = 2.2（饱和上限）

长度归一化效应:

  短文档 (|d| = 50, avgdl = 200):
    分母因子 = 1 - 0.75 + 0.75 * (50/200) = 0.4375
    -> 短文档提升词项重要性（惩罚更少）

  长文档 (|d| = 800, avgdl = 200):
    分母因子 = 1 - 0.75 + 0.75 * (800/200) = 3.25
    -> 长文档降低词项重要性（稀释效应）
```

### 参数调优

```
参数调优指南:

  k1（饱和度，默认 1.2）:
  +-------+--------------------------------------------------+
  | 值    | 效果                                              |
  +-------+--------------------------------------------------+
  |  0.0  | 忽略 TF，只有 IDF 起作用（二值相关性）             |
  |  1.2  | 默认值: 适中的 TF 影响                            |
  |  2.0  | 较高的 TF 影响（适合长文档）                       |
  |  3.0+ | TF 占主导（用于非常特殊的语料库）                  |
  +-------+--------------------------------------------------+

  b（长度归一化，默认 0.75）:
  +-------+--------------------------------------------------+
  | 值    | 效果                                              |
  +-------+--------------------------------------------------+
  |  0.0  | 无长度归一化                                      |
  |  0.75 | 默认值: 适中的归一化                              |
  |  1.0  | 完全归一化（对长文档惩罚很重）                     |
  +-------+--------------------------------------------------+

  调优建议:
  - 短字段搜索（标题）: k1=0.9, b=0.4
  - 长篇文档（文章）: k1=1.5, b=0.75
  - 代码搜索: k1=2.0, b=0.25（代码长度差异很大）
  - 电商产品标题: k1=0.8, b=0.5
```

---

## 9. 查询类型

### Term Query（精确匹配）

```json
{ "term": { "category": "technology" } }
// 不应用分析 -- 匹配精确的 keyword 值
// 用于: 枚举值、ID、状态字段（映射为 keyword）
```

### Match Query（全文搜索）

```json
{
  "match": {
    "body": {
      "query": "distributed systems",
      "operator": "OR",          // OR（默认）或 AND
      "minimum_should_match": "75%",
      "fuzziness": "AUTO"
    }
  }
}
// 对查询文本应用分析
// "distributed systems" -> 分析后 -> ["distribut", "system"]
// OR: 文档匹配任一 token 即可
// AND: 文档必须包含所有 token
```

### Match Phrase Query

```json
{
  "match_phrase": {
    "body": {
      "query": "distributed systems",
      "slop": 1
    }
  }
}
// 要求 token 按顺序且相邻出现
// slop=1 允许 1 个中间 token
// "distributed computing systems" 在 slop=1 时匹配
// 使用 posting list 中的位置数据
```

### Bool Query（复合查询）

```json
{
  "bool": {
    "must": [
      { "match": { "body": "search engine" } }
    ],
    "should": [
      { "match": { "title": { "query": "search engine", "boost": 3.0 } } },
      { "term":  { "tags": "featured" } }
    ],
    "must_not": [
      { "term": { "status": "deleted" } }
    ],
    "filter": [
      { "range": { "published_at": { "gte": "now-30d" } } },
      { "term":  { "category": "technology" } }
    ],
    "minimum_should_match": 1
  }
}
// must:     贡献评分，文档必须匹配
// should:   贡献评分，可选（提升相关性）
// must_not: 文档不得匹配（不评分，缓存为 bitset）
// filter:   文档必须匹配（不评分，缓存为 bitset）
```

### Fuzzy Query

```json
{
  "fuzzy": {
    "title": {
      "value": "serch",
      "fuzziness": "AUTO",   // AUTO: 长度<3 为 0, 3-5 为 1, >5 为 2
      "prefix_length": 2,    // 前 N 个字符必须精确匹配
      "max_expansions": 50   // 最多考虑的候选词项数
    }
  }
}
// 使用 Levenshtein 距离（编辑距离）
// "serch" 匹配 "search"（1 次插入）
// 通过 term dictionary 上的 Levenshtein 自动机实现
```

### Range Query

```json
{
  "range": {
    "published_at": {
      "gte": "2024-01-01",
      "lte": "2024-12-31",
      "format": "yyyy-MM-dd",
      "time_zone": "+05:30"
    }
  }
}
// 数值和日期字段使用 BKD tree (Block K-D Tree)
// O(log N) 范围查找，对多维范围高效
```

### Multi-Match Query

```json
{
  "multi_match": {
    "query": "search engine technology",
    "fields": ["title^3", "body^1", "tags^2"],
    "type": "best_fields",    // 或 cross_fields, most_fields, phrase
    "tie_breaker": 0.3
  }
}
// best_fields: score = max(field_score) + tie_breaker * other_scores
// cross_fields: 将所有字段视为一个大字段（适合姓名搜索）
// most_fields:  所有字段评分之和（适合多分析器场景）
```

---

## 10. Faceted Search

### 聚合架构

```
带聚合的查询:

客户端请求
     |
     v
+--------------------+
| 协调节点            |
| - 执行查询         |
| - 请求部分         |
|   聚合结果         |
+--------------------+
     | scatter
     +--------+--------+--------+
     v        v        v        v
  Shard0   Shard1   Shard2   ShardN
  本地      本地      本地      本地
  聚合      聚合      聚合      聚合
     |        |        |        |
     +--------+--------+--------+
              | gather
              v
     +--------------------+
     | 合并部分聚合        |
     | 返回最终计数        |
     +--------------------+

每个 shard 的部分聚合结果:
  Shard0: { "technology": 412, "science": 301, "sports": 89 }
  Shard1: { "technology": 398, "science": 287, "sports": 102 }
  Shard2: { "technology": 445, "science": 312, "sports": 76 }

合并后: { "technology": 1255, "science": 900, "sports": 267 }
```

### Facet 类型

```
Terms Aggregation（分类 facet）:
  "aggs": {
    "by_category": {
      "terms": {
        "field": "category",
        "size": 10,
        "order": { "_count": "desc" }
      }
    }
  }
  结果: [{ "key": "tech", "doc_count": 1255 }, ...]

Range Aggregation（数值 facet）:
  "aggs": {
    "by_price": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 10 },
          { "from": 10, "to": 50 },
          { "from": 50, "to": 100 },
          { "from": 100 }
        ]
      }
    }
  }

Date Histogram（时间 facet）:
  "aggs": {
    "by_month": {
      "date_histogram": {
        "field": "published_at",
        "calendar_interval": "month"
      }
    }
  }

Nested Aggregations（下钻）:
  "aggs": {
    "by_category": {
      "terms": { "field": "category" },
      "aggs": {
        "by_author": {
          "terms": { "field": "author.keyword", "size": 3 }
        }
      }
    }
  }
```

### 聚合的 Doc Values

```
Doc Values（列式存储，与 inverted index 相反）:

  Inverted index:  词项  -> [doc1, doc2, doc5, ...]
  Doc Values:      doc1  -> { category: "tech", price: 29.99 }
                   doc2  -> { category: "sci",  price: 14.99 }

  以列式格式存储在磁盘上（类似 Parquet）:
  +-------+-----------+-------+
  | docID | category  | price |
  +-------+-----------+-------+
  |   1   | "tech"    | 29.99 |
  |   2   | "sci"     | 14.99 |
  |   5   | "tech"    | 49.99 |
  +-------+-----------+-------+

  优点:
  - 聚合时顺序读取（缓存友好）
  - 无堆内存压力（内存映射文件）
  - 高效排序，适用于按字段排序的查询
  - 用于: terms agg、range agg、排序、脚本
```

---

## 11. 自动补全与建议

### Edge N-gram 方法

```
索引时 edge n-gram 生成:
  输入: "distributed"
  min_gram=2, max_gram=10

  索引的 token:
  "di", "dis", "dist", "distr", "distri", "distrib",
  "distribu", "distribut", "distributi", "distribut..."

搜索查询 "dist" -> 匹配所有以 "dist" 为前缀的文档
  -> 作为简单的前缀搜索工作

映射:
  "title": {
    "type": "text",
    "analyzer": "standard",          // 用于常规搜索
    "fields": {
      "autocomplete": {
        "type": "text",
        "analyzer": "edge_ngram_analyzer",  // 用于自动补全
        "search_analyzer": "standard"       // 不对查询进行 n-gram
      }
    }
  }

自动补全查询:
  { "match": { "title.autocomplete": "dist" } }
```

### Completion Suggester（基于 FST）

```
Completion suggester 构建内存中的 FST 以实现 O(1) 查找:

  映射:
    "title_suggest": {
      "type": "completion",
      "analyzer": "standard",
      "preserve_separators": true,
      "preserve_position_increments": true,
      "max_input_length": 50
    }

  索引时输入:
    {
      "title_suggest": {
        "input": ["Introduction to Distributed Systems",
                  "Distributed Systems",
                  "distributed"],
        "weight": 42           // 流行度评分
      }
    }

  查询:
    {
      "suggest": {
        "title-suggest": {
          "prefix": "dist",
          "completion": {
            "field": "title_suggest",
            "size": 5,
            "skip_duplicates": true,
            "fuzzy": { "fuzziness": 1 }
          }
        }
      }
    }

  相比 edge n-gram 的优势:
  - 完全在内存中（FST）
  - 极快（通常 < 5ms）
  - 支持模糊前缀匹配
  - 支持上下文过滤（例如按类别）
```

### "您是不是要找" 建议

```
针对"无结果"或低召回查询的拼写纠正:

  Term Suggester（基于频率）:
    查询: "distrubuted systems"（拼写错误）
    建议: "distributed systems"

    算法:
    1. 对查询中的每个词项，在字典中找到相似词项
    2. 按编辑距离 + 语料库中的词频排名
    3. 生成纠正后的查询

    配置:
    {
      "suggest": {
        "spell-check": {
          "text": "distrubuted systems",
          "term": {
            "field": "body",
            "suggest_mode": "missing",   // 或 "popular" | "always"
            "sort": "frequency",
            "size": 1
          }
        }
      }
    }

  Phrase Suggester（使用 shingle 模型）:
    - 考虑词对频率
    - "apple iphone" 将 "aple iphne" 作为短语纠正
    - 对多词查询比逐词纠正效果更好
```

---

## 12. 相关性调优

### 字段加权

```
索引时加权字段（在映射中）:
  "title": { "type": "text", "boost": 2.0 }  // 标题更重要

查询时加权字段（推荐，无需重建索引）:
  {
    "multi_match": {
      "query": "search engine",
      "fields": ["title^3", "body^1", "tags^2"]
    }
  }

  文档 d 和查询词项 t 的有效评分:
    score(t, "title") * 3.0 + score(t, "body") * 1.0 + score(t,"tags") * 2.0

  经验法则:
    - 标题/名称字段: 2x-5x 加权
    - 精确匹配字段（keyword 副本）: 5x-10x 加权
    - 正文/描述: 1x（基准）
    - 元数据标签: 1.5x-2x
```

### Function Score Query

```json
{
  "function_score": {
    "query": { "match": { "body": "search engine" } },
    "functions": [
      {
        "filter": { "term": { "is_sponsored": true } },
        "weight": 1.5
      },
      {
        "field_value_factor": {
          "field": "view_count",
          "factor": 1.2,
          "modifier": "log1p",
          "missing": 1
        }
      },
      {
        "gauss": {
          "published_at": {
            "origin": "now",
            "scale": "30d",
            "decay": 0.5
          }
        }
      }
    ],
    "score_mode": "multiply",
    "boost_mode": "multiply",
    "max_boost": 10
  }
}
```

### 自定义排名信号

```
生产环境中组合信号实现相关性:

  final_score = BM25_score
                * freshness_decay(published_at)
                * popularity_factor(log1p(view_count))
                * quality_signal(editorial_score)
                * personalization_factor(user_affinity)

  新鲜度衰减示例:
  +------+-------+-------------+
  | 时长  | Scale | 衰减因子     |
  +------+-------+-------------+
  | 0天   |  --   |    1.0      |
  | 7天   | 30d   |    0.85     |
  | 30天  | 30d   |    0.50     |
  | 90天  | 30d   |    0.12     |
  | 365天 | 30d   |    0.001    |
  +------+-------+-------------+

  流行度因子（log1p 归一化）:
    view_count=0    -> log1p(0)    = 0.0   -> 因子 ~0.5（下限）
    view_count=10   -> log1p(10)   = 2.4
    view_count=100  -> log1p(100)  = 4.6
    view_count=1000 -> log1p(1000) = 6.9
    view_count=10k  -> log1p(10k)  = 9.2
    -> 对数化防止病毒式异常值主导排名
```

---

## 13. 分布式搜索

### Shard 分配策略

```
创建索引，5 个主分片，1 个副本:

  集群: 10 个数据节点 (N0 - N9)

  主分片:   P0 P1 P2 P3 P4
  副本分片: R0 R1 R2 R3 R4

  分配（主分片永远不与其副本在同一节点上）:
  +------+------------------+
  | 节点  | 分片              |
  +------+------------------+
  | N0   | P0, R1           |
  | N1   | P1, R2           |
  | N2   | P2, R3           |
  | N3   | P3, R4           |
  | N4   | P4, R0           |
  | N5   | (空闲/其他索引)    |
  +------+------------------+

  路由公式:
    shard_id = hash(document._id) % number_of_primary_shards

  自定义路由（例如按租户）:
    shard_id = hash(tenant_id) % number_of_primary_shards
    -> 同一租户的所有文档进入同一 shard（避免 scatter）
    -> 风险: 如果某个租户数据量大得多会产生热点
```

### Scatter-Gather 模式

```
使用 scatter-gather 的查询执行:

阶段 1: QUERY（scatter）
  +-------------------+
  | 协调节点           |
  | query_then_fetch  |
  +-------------------+
      |  广播到所有 shard（或路由选择的）
      v
  [Shard0] [Shard1] [Shard2] [Shard3] [Shard4]
     |         |         |         |        |
  执行       执行       执行      执行     执行
  本地       本地       本地      本地     本地
  查询       查询       查询      查询     查询
     |         |         |         |        |
  返回       返回       返回      返回     返回
  Top-K      Top-K     Top-K     Top-K    Top-K
  (评分 +    (仅       doc ID    doc ID   doc ID
   doc_id)   评分)

阶段 2: FETCH（gather）
  协调节点:
  1. 收集所有 (score, doc_id, shard_id) 元组
  2. 按评分全局合并排序
  3. 取 top 10 (from + size)
  4. 向各 shard 发起 MULTI_GET 获取 top 10 的完整 _source
  5. 返回最终响应

效率说明:
  阶段 1 仅 top-K 评分通过网络传输
  阶段 2 仅获取最终 top-N 文档
  K >> N（K = 每个 shard 的 from+size，N = 最终结果大小）
```

### 协调节点

```
协调节点职责:

  +------------------------------------------+
  |           协调节点                         |
  |                                          |
  |  1. 解析并验证查询                         |
  |  2. 确定 shard 路由                       |
  |  3. 转发到 N 个 shard 节点（scatter）      |
  |  4. 等待响应（带超时）                     |
  |  5. 合并部分结果（gather）                 |
  |  6. 重新排名和分页                         |
  |  7. 合并聚合的部分结果                     |
  |  8. 发起 fetch 请求获取 _source            |
  |  9. 组装并返回最终响应                     |
  +------------------------------------------+

  协调节点是无状态的:
  - 不存储数据，不持有 shard
  - 纯 CPU + 内存用于合并操作
  - 可水平扩展
  - 位于负载均衡器后面

  资源使用:
  - 内存: 每次查询在内存中保存所有 K*N_shards 个评分元组
  - 对于 1000 个 shard 且 size=10, from=0:
    1000 * 10 = 每次查询 10,000 个元组在内存中
  - 深度分页 (from=10000, size=10):
    1000 * 10010 = ~1000 万元组 -- 避免使用！
    改用 search_after（基于游标的分页）
```

---

## 14. Near-Real-Time Search

### Refresh 周期

```
文档从写入到可搜索的时间线:

T+0ms:    文档被索引（写入内存缓冲区）
           |
           | (文档尚不可搜索)
           |
T+1000ms: REFRESH（默认 1 秒间隔）
           |
           | IndexWriter 创建新的内存 segment
           | 在 segment 上打开新的 NRT reader
           |
T+1001ms: 文档现在可搜索  (<-- NRT)
           |
           | (translog 仍然保存自上次 commit 以来的操作)
           |
T+30min:  FLUSH（Lucene commit）
           |
           | 所有 segment 持久写入磁盘
           | Translog 截断到新检查点
           |
T+varies: MERGE（后台）
           |
           | 较小的 segment 合并为较大的
           | 从合并的 segment 中清除已删除文档

调整 refresh_interval:
  "1s"    -> NRT 搜索，较高的索引开销
  "30s"   -> 较少开销，适合批量索引
  "-1"    -> 禁用（仅手动 refresh，最大吞吐量）
  "5s"    -> 适用于许多场景的良好平衡
```

### Lucene Segment 深入解析

```
Segment 生命周期:

  RAM 缓冲区
  +--------------------+
  | 进行中的文档        |  <-- 新写入到这里
  +--------------------+
           | refresh（flush 到磁盘）
           v
  seg_0001（不可变，NRT 可读）
  seg_0002（不可变，NRT 可读）
  seg_0003（不可变，NRT 可读）
     ...
  seg_0020（不可变，NRT 可读）
           | 后台合并
           v
  seg_merged_001（seg_0001 + seg_0002 + seg_0003 合并）

不可变性的优点:
  - 并发读取不需要加锁
  - 写入新 segment 时可安全读取
  - 缓存友好（OS 页面缓存完美适配）
  - 简单: 没有部分写入，没有损坏风险

删除处理:
  - 删除操作存储在 .liv（活跃文档 bitset）中
  - Segment 文件不会被修改
  - 搜索时跳过已删除文档（bitset AND 运算）
  - 仅在 segment 合并时物理移除
```

### Refresh 性能

```
Refresh 成本分析:

  每次 refresh 操作:
  - 创建新的 FST term dictionary（CPU 密集）
  - 为 segment 打开新的文件句柄
  - 更新 NRT reader
  - 典型成本: 小 segment 约 10-50ms

  对索引吞吐量的影响:
  +------------------+---------------------+-------------------+
  | refresh_interval | 索引吞吐量          | 搜索新鲜度         |
  +------------------+---------------------+-------------------+
  | 1s（默认）        | ~10K docs/sec       | ~1 秒              |
  | 5s               | ~30K docs/sec       | ~5 秒              |
  | 30s              | ~80K docs/sec       | ~30 秒             |
  | -1（禁用）        | ~100K+ docs/sec     | 仅手动             |
  +------------------+---------------------+-------------------+

  批量索引优化:
  1. 批量加载前设置 refresh_interval = -1
  2. 加载期间设置 number_of_replicas = 0
  3. 使用大批次批量索引（每次请求 5-15 MB）
  4. 加载后: 设置 replicas = 1，触发手动 refresh
  5. 吞吐量提升 5-10x
```

---

## 15. 索引生命周期管理

### ILM 层级

```
时序数据（日志、事件）的索引生命周期阶段:

  HOT 层                  WARM 层                  COLD 层
  +------------------+    +------------------+    +------------------+
  | 活跃索引          |    | 只读             |    | 低频读取          |
  | 快速 NVMe SSD    |    | 普通 HDD         |    | 压缩，S3          |
  | 完整副本          |    | 减少副本          |    | 可搜索快照         |
  | 0-7 天           |    | 7-30 天           |    | 30-90 天          |
  +------------------+    +------------------+    +------------------+
          |                       |                       |
          | Rollover              | 移至 warm             | 移至 cold
          | 条件: max_age=1d      | 7 天后                | 30 天后
          | 或 max_size=50gb      |                       |
          v                       v                       v
  logs-000001             logs-000001             logs-000001
  logs-000002             (forcemerge 1 seg)      (snapshot + mount)
  logs-000003 (当前)       (shrink shard)          (可搜索快照)

  FROZEN 层（新增）:
  +------------------+
  | S3 支撑           |
  | 按需加载          |
  | 读取非常慢        |
  | 90+ 天           |
  +------------------+

  DELETE 阶段:
  365 天后 -> 完全删除索引
```

### ILM 策略示例

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "allocate": {
            "number_of_replicas": 0,
            "require": { "data": "warm" }
          },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "searchable_snapshot": {
            "snapshot_repository": "s3-backup"
          },
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

---

## 16. Hybrid Search

### 结合 BM25 和向量搜索

```
两种检索范式:

  BM25（关键词）:                向量 (kNN):
  - 精确词项匹配               - 语义相似度
  - 快速（inverted index）     - 天然处理同义词
  - 无需训练                   - 密集嵌入（768-1536 维）
  - 同义词处理失败              - 昂贵（ANN 索引）
  - 可解释                     - 大规模精确 kNN 很慢

  Hybrid search 结合两者:
  final_score = alpha * BM25_score + (1 - alpha) * kNN_score
  或通过 Reciprocal Rank Fusion (RRF)

Hybrid 的文档索引:
+------------------+       +------------------+
|  文本字段         |       |  嵌入字段         |
|  (BM25 索引)     |       |  (HNSW 索引)     |
+------------------+       +------------------+
| title: "..."     |       | embedding:        |
| body:  "..."     |       |  [0.12, -0.34, ...]|
+------------------+       +------------------+
```

### 向量索引 (HNSW)

```
Hierarchical Navigable Small World (HNSW) 图:

  Layer 2（稀疏，长距离链接）:
    O---O           O---O
    |               |
  Layer 1（中等密度）:
    O-O-O-O         O-O-O-O
    |               |
  Layer 0（密集，所有节点）:
    O-O-O-O-O-O-O-O-O-O-O-O

  ANN 搜索:
  1. 从顶层进入，贪心导航到最近邻
  2. 降到下一层，从最近邻重复
  3. 在 layer 0，探索 ef_search 候选池
  4. 返回按 cosine/点积相似度的 top-k 最近邻

  HNSW 参数:
  +------------+------------------------------------------+
  | 参数        | 效果                                      |
  +------------+------------------------------------------+
  | m          | 每节点连接数（默认 16）                     |
  |            | m 越高 -> 召回越好，内存越多                 |
  | ef_construction | 构建时候选池（默认 100）                |
  |            | 越高 -> 质量越好，索引越慢                   |
  | ef_search  | 查询时候选池（默认 100）                     |
  |            | 越高 -> 召回越好，查询越慢                   |
  | num_candidates | k * 乘数，用于初始检索                  |
  +------------+------------------------------------------+

  索引大小: 10 亿文档 * 768 维 * 4 字节 = 3 TB（原始向量）
              + HNSW 图开销: ~1.5x = ~4.5 TB
```

### Reciprocal Rank Fusion (RRF)

```
RRF 无需分数归一化即可合并排名列表:

  BM25 结果:               kNN 结果:
  排名 1: doc_A (8.74)     排名 1: doc_C (0.95)
  排名 2: doc_B (7.21)     排名 2: doc_A (0.92)
  排名 3: doc_C (6.88)     排名 3: doc_D (0.89)
  排名 4: doc_D (5.91)     排名 4: doc_B (0.85)

  文档 d 的 RRF 评分:
    RRF(d) = sum over rankers: 1 / (k + rank(d))
    其中 k = 60（常数，减少顶部排名的影响）

  对于 doc_A:
    RRF(A) = 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 = 0.03252

  对于 doc_C:
    RRF(C) = 1/(60+3) + 1/(60+1) = 0.01587 + 0.01639 = 0.03226

  对于 doc_B:
    RRF(B) = 1/(60+2) + 1/(60+4) = 0.01613 + 0.01563 = 0.03176

  最终排名: [doc_A, doc_C, doc_B, doc_D, ...]

  Elasticsearch sub_searches API:
  {
    "sub_searches": [
      { "query": { "match": { "body": "fast search" } } },
      { "knn": { "field": "embedding", "query_vector": [...], "k": 100 } }
    ],
    "rank": {
      "rrf": { "rank_constant": 60, "rank_window_size": 100 }
    }
  }
```

---

## 17. Elasticsearch 集群架构

### 节点类型

```
+------------------------------------------------------------------+
|                    Elasticsearch 集群                              |
|                                                                  |
|  +------------------+   +------------------+                    |
|  | Master 节点 1     |   | Master 节点 2     |  Master 节点 3     |
|  | (活跃 master)     |   | (候选)            |  (候选)            |
|  | - 集群状态        |   | - 备用            |  - 备用            |
|  | - Shard 分配      |   |                  |                    |
|  | - 索引生命周期     |   |                  |                    |
|  +------------------+   +------------------+                    |
|                                                                  |
|  +------------------+   +------------------+   +------------+   |
|  | 数据节点 (hot)    |   | 数据节点 (warm)   |   | Ingest 节点|   |
|  | NVMe SSD         |   | HDD 存储          |   | - 流水线   |   |
|  | 主分片            |   | 只读分片           |   | - 丰富     |   |
|  | 副本分片          |   | Force-merged      |   | - GeoIP    |   |
|  | ~50 个节点        |   | ~30 个节点         |   | 5 个节点   |   |
|  +------------------+   +------------------+   +------------+   |
|                                                                  |
|  +--------------------+   +--------------------+                |
|  | 协调节点            |   | ML 节点            |                |
|  | 查询扇出            |   | 模型推理            |                |
|  | 聚合合并            |   | 异常检测            |                |
|  | 10 个节点           |   | 3 个节点            |                |
|  +--------------------+   +--------------------+                |
+------------------------------------------------------------------+

外部组件:
  +------------------+   +------------------+   +------------------+
  |  负载均衡器       |   |  Kibana          |   |  Logstash/       |
  |  (到协调节点)     |   |  (可视化)         |   |  Beats/Fluentd   |
  +------------------+   +------------------+   +------------------+
```

### Master 选举（类 Raft）

```
Elasticsearch 7+ 中的 Zen2 / 基于 Raft 的共识:

  3 个 master 候选节点: M1, M2, M3

  正常运行:
    M1 (活跃) <-> M2 (follower) <-> M3 (follower)
    M1 发布集群状态；M2, M3 确认

  M1 故障:
    M2 和 M3 检测到心跳超时
    选举: M2 或 M3 请求投票
    法定人数 = (3/2)+1 = 需要 2 票
    M2 获得 M2+M3 的投票 -> M2 成为活跃 master
    发布新的集群状态（不包含 M1 的 shard）
    触发 shard 重新分配

  脑裂防护:
    最小 master 节点数 = (N/2) + 1
    3 个 master 时: 最小 = 2
    两个隔离的节点都无法达到法定人数
    一个分区失去 master -> 集群健康状态: RED
    但数据完整性得到维护
```

### Shard 恢复

```
Shard 恢复场景:

1. 新主分片（节点重启）:
   +----------+     +----------+
   | 旧节点    |     | 新节点    |
   | (故障)    |     |          |
   +----------+     +----------+
                          |
   副本提升为             |  恢复来源:
   主分片                 |  a) 副本（快速 - 无需网络重新同步）
                          |  b) 快照（从 S3 恢复）
                          |  c) Peer 恢复（从另一节点复制）

2. Peer 恢复过程:
   源节点 -> 目标节点
   阶段 1: 发送 Lucene segment 文件（可能很大）
   阶段 2: 发送 translog 操作（自快照以来的增量）
   阶段 3: 开始接受写入

3. 基于快照的恢复（大 shard 首选）:
   节点故障 -> 从 S3 快照恢复
   从快照点到当前重放 translog
   对于 TB 级 shard 比完整 peer 恢复快得多
```

---

## 18. 扩展策略

### 水平扩展

```
增长索引的扩展模式:

  阶段 1: 10 亿文档，10 个主分片
  +------+------+------+------+------+
  | N0   | N1   | N2   | N3   | N4   |
  | P0R1 | P1R2 | P2R3 | P3R4 | P4R0 |
  +------+------+------+------+------+
  (5 个节点上 10 个 shard，每节点 2 个 shard)

  阶段 2: 50 亿文档 -- 需要更多 shard，但无法重新分片！
  解决方案: 创建具有更多 shard 的新索引，将数据重新索引到其中
    或: 使用 split/clone API

  Split Index (P -> 2P shard):
    POST /old-index/_split/new-index
    { "settings": { "index.number_of_shards": 20 } }
    要求: 旧索引必须为只读，shard 数可整除

  或者: Cross-Cluster Reindex
    POST /_reindex
    {
      "source": { "index": "articles_v1" },
      "dest":   { "index": "articles_v2" }
    }
    然后使用别名原子切换流量:
    POST /_aliases
    { "actions": [
        { "remove": { "index": "articles_v1", "alias": "articles" } },
        { "add":    { "index": "articles_v2", "alias": "articles" } }
    ]}
```

### 查询吞吐量扩展

```
10K QPS 分解:

  单个协调节点容量: ~500-1000 QPS（因情况而异）
  目标: 10K QPS -> 需要 10-20 个协调节点

  负载均衡器分配到 10 个协调节点:
  10K QPS / 10 个节点 = 每个协调节点 1K QPS

  每个查询扇出到 5 个 shard（平均）:
  10K * 5 = 50K shard 级搜索/秒

  50K / 100 个数据节点 = 每节点 500 次 shard 搜索/秒

  每次 shard 搜索的 p99:
  - BKD tree range 过滤: 5ms
  - Inverted index 扫描 + BM25: 20ms
  - Doc values 聚合: 15ms
  - 网络（协调 -> 数据）: 5ms
  总计: ~45ms -> 远在 100ms p99 预算内

缓存层:
  +---------------------+---------------------+
  | Request Cache       | Query Cache         |
  | 缓存整个            | 缓存 filter         |
  | 聚合结果            | bitset（segment 级）  |
  | (shard 级)          |                     |
  | TTL: 直到 refresh   | TTL: 直到 segment   |
  |                     |   合并/删除          |
  +---------------------+---------------------+
  缓存预热率:
    热门查询: 预热后 >80% 缓存命中
    长尾查询: ~20% 缓存命中
    总体: 50-60% 缓存命中率 -> 有效 QPS 翻倍
```

### 索引吞吐量扩展

```
目标: 100 万文档/小时 = 278 文档/秒

  Ingest 流水线: 5 个 ingest 节点
  278 / 5 = 每个 ingest 节点约 56 文档/秒（轻松处理）

  峰值突发: 2,780 文档/秒
  Kafka 吸收突发 -> 平滑输入到索引流水线

  主分片写入吞吐量:
  2,780 / 100 个数据节点 = 每节点 27.8 次写入/秒
  每次写入: translog 追加 + 缓冲区添加 = ~1-2ms
  最大: 每 shard 500 次写入/秒（实际限制）
  -> 余量: 27.8 << 500，容量充足

  批量索引优化:
    批次大小: 每个 bulk 请求 5-15 MB
    并发度: 每个 shard 1-2 个并行 bulk 线程
    线程池: bulk queue = 200, size = cpu_count / 2
```

---

## 19. 权衡取舍

| 决策 | 方案 A | 方案 B | 建议 |
|------|--------|--------|------|
| Refresh interval | 1s (NRT) | 30s（高吞吐量） | 搜索应用用 1s，日志摄取用 30s |
| Shard 大小 | 小 (5GB) | 大 (50GB) | 25-50 GB；避免过小（开销大）或过大（恢复慢） |
| 副本数 | 0（无高可用） | 2（额外读取） | 1 个副本保证高可用；读密集型工作负载用 2 个 |
| 索引时 vs 查询时分析 | 索引时同义词 | 查询时同义词 | 查询时: 词汇变更时无需重建索引 |
| Keyword vs text 映射 | 仅 text | text + keyword 子字段 | 多字段: text 用于搜索，keyword 用于聚合/排序 |
| BM25 vs TF-IDF | TF-IDF（更简单） | BM25（ES5 后默认） | 始终用 BM25；TF-IDF 仅用于遗留兼容 |
| Mapping strict vs dynamic | dynamic=true | dynamic=false | 生产环境用 strict；防止 mapping 膨胀 |
| 深度分页 | from/size | search_after（游标） | 超过 1000 条结果时始终用 search_after |
| 聚合精度 | shard_size=10 | shard_size=1000 | 增大 shard_size 以获得准确计数（vs 延迟） |
| 向量搜索 ANN | HNSW（快速，精度略低） | 精确 kNN（慢，完美） | HNSW 配合 num_candidates 调优 |
| 跨集群搜索 | 单集群 | CCS（联邦式） | CCS 用于地理分布或隔离需求 |

### 深度分页问题

```
from+size 分页的问题:
  from=10000, size=10

  每个 shard 返回 top 10,010 条结果
  100 个 shard * 10,010 = 协调节点内存中 1,001,000 个评分元组
  -> OOM 风险！

  Elasticsearch 保护:
    index.max_result_window = 10000（默认）
    超出此限制的请求会报 ResultWindowTooLarge 错误

解决方案: search_after（游标分页）
  第 1 页: 按 [_score, _id] 排序
  第 2 页: { "search_after": [8.74, "doc_a1b2c3"] }
  -> 无状态，无内存膨胀
  -> 但: 无法跳转到任意页（仅支持线性扫描）

跳转到指定页: 使用 scroll 预计算页面边界
  （scroll API 在 ES 8 中已弃用 -> 使用 PIT + search_after）
```

---

## 20. 搜索引擎对比

| 特性 | Elasticsearch | Apache Solr | Algolia | Typesense | Meilisearch |
|------|--------------|-------------|---------|-----------|-------------|
| **许可证** | Elastic License 2.0（旧版为 SSPL） | Apache 2.0 | 专有 SaaS | GPL-3.0 / Cloud | MIT（自托管） |
| **主要用途** | 通用、日志、APM | 企业搜索、faceted | 开发者友好的 SaaS 搜索 | 开源 Algolia 替代品 | 开源、易用 |
| **查询语言** | Query DSL (JSON) | Solr 查询语法, JSON | 自定义 JSON API | 自定义 JSON | 简单 JSON |
| **可扩展性** | 优秀（PB 级） | 良好（TB 级） | 托管 / 自动 | 良好（数十 TB） | 中等（单 TB） |
| **分布式** | 原生（shard+副本） | SolrCloud | 托管 | 原生 | 有限 |
| **默认相关性** | BM25（可调） | BM25（可调） | 专有（拼写纠错、地理、业务规则） | BM25 + 拼写容错 | BM25 + 拼写容错 |
| **Faceted Search** | 优秀（聚合） | 优秀 | 良好 | 良好 | 良好 |
| **地理搜索** | 优秀 | 良好 | 优秀 | 良好 | 基础 |
| **分析** | Kibana, X-Pack | 原生 + Solr Admin | 内置（点击分析） | 基础 | 基础 |
| **向量/Hybrid** | 是 (kNN + RRF) | 是 (KNN) | 否（仅关键词） | 是（hybrid） | 否 |
| **Schema** | 半无 schema（动态映射） | 需要 schema | 无 schema | Schema 可选 | 无 schema |
| **托管** | 自托管或 Elastic Cloud | 自托管或托管 | 仅 SaaS | 自托管或 Cloud | 自托管或 Cloud |
| **设置复杂度** | 高 | 高 | 低（API key + JSON） | 中等 | 非常低 |
| **搜索延迟** | 10-100ms | 20-200ms | < 50ms (SLA) | < 50ms | < 50ms |
| **索引速度** | 非常快（bulk API） | 快 | 快 | 快 | 快 |
| **最适用于** | 企业全文搜索、可观测性 | 企业 Java 应用 | 初创/SaaS 即时搜索 | 自托管 Algolia | 简单自托管搜索 |

### 如何选择

```
使用 Elasticsearch 当:
  - 需要大规模扩展（数十亿文档）
  - 复杂聚合和分析（APM、日志、指标）
  - Hybrid search（BM25 + 向量）
  - 需要完全控制的自定义相关性调优
  - 属于 ELK/Elastic 技术栈的一部分

使用 Solr 当:
  - 已有 Java/Spring 生态系统
  - 强 faceted search 需求
  - 偏好 Apache 许可的软件
  - 需要 XML/Solr 查询语法兼容性

使用 Algolia 当:
  - 快速上线是优先级
  - 偏好托管服务
  - 即时搜索（< 50ms SLA）
  - 内置分析和 A/B 测试
  - 预算允许 SaaS 定价

使用 Typesense 当:
  - 开源 Algolia 替代品
  - 开箱即用的拼写容错
  - 比 Elasticsearch 运维更简单
  - 中等规模（< 1 亿文档）

使用 Meilisearch 当:
  - 自托管、开发者友好
  - 中小规模
  - 快速原型开发
  - 需要最少配置
```

---

## 21. 常见面试追问

**问: Elasticsearch 如何在节点故障期间防止数据丢失？**

答: Elasticsearch 使用多种机制的组合。Translog（write-ahead log）在向客户端确认之前持久记录每个操作。崩溃后，节点重启时会在最后一个 Lucene commit 点之上重放 translog，恢复自上次 flush 以来的所有操作。此外，主分片始终在不同节点上至少有一个副本与之共存；如果主分片故障，副本会立即被提升为主分片，集群继续提供写入和读取服务而不会丢失数据。

**问: 如何处理跨 shard 的相关性评分不一致问题（shard 统计问题）？**

答: BM25 IDF 是按 shard 计算的，而非全局计算。这意味着一个稀有词项在不同 shard 上可能有不同的 IDF 值，导致评分不一致。解决方案: (1) 使用 `search_type=dfs_query_then_fetch` 在评分前预先收集全局词项统计（增加一次往返，约 20% 延迟开销）。(2) 对小索引使用单个 shard，此时全局统计不会有太大差异。(3) 每个 shard 索引足够多的数据，使 IDF 近似全局 IDF（大数定律）。实际上，对于每个 shard 超过 100 万文档的索引，shard 本地 IDF 与全局 IDF 已足够接近，不一致性可以忽略不计。

**问: 如何为处理 100K QPS 的搜索框设计自动补全？**

答: Completion suggester 使用每个 shard 的内存 FST，提供 O(prefix_length) 查找且无磁盘 I/O。对于 100K QPS: (1) 在应用层使用前缀缓存（Redis）缓存最常见的前缀（前 1000 个前缀模式覆盖约 80% 的流量）。(2) 将自动补全查询路由到仅包含 completion 字段的专用索引（更小的内存占用，更好的缓存局部性）。(3) 在 shard 分配时预热 FST。(4) 使用客户端防抖（150-200ms）将实际 QPS 降低约 5-10x。综合来看，实际 Elasticsearch QPS 降至 10-20K，5-10 个数据节点即可轻松处理。

**问: 在批量重建索引期间，如何保持索引新鲜而不影响搜索性能？**

答: 使用零停机重建索引模式: (1) 创建一个新索引 (`articles_v2`)，使用改进的映射。(2) 使用 Reindex API 将文档从 `articles_v1` 复制到 `articles_v2`（在后台运行，不影响线上流量）。(3) 重建索引期间，任何新写入通过现有别名进入 `articles_v1`。(4) 重建索引完成后，确定截止点（时间戳），重新索引增量数据（重建索引开始后写入的文档）。(5) 使用 `_aliases` API 原子切换别名，从 `articles_v1` 切换到 `articles_v2`。(6) 短暂保留 `articles_v1` 作为回退。零停机，零搜索中断。

**问: Segment 合并如何工作，为什么它对性能很重要？**

答: Lucene 频繁写入新 segment（每次 refresh 一个，每 1 秒一次）。每个 segment 是一个自包含的迷你索引，拥有自己的 term dictionary、posting lists 和 doc values。查询执行必须搜索所有 segment 并合并结果；segment 越多 = 需要打开更多文件 + 需要合并更多部分结果。合并使用 TieredMergePolicy 将小 segment 整合为大 segment。它还会物理删除"已删除"的文档（之前仅通过 .liv bitset 屏蔽）。合并后，查询读取更少、更大的 segment = 更好的缓存利用率、更少的文件句柄、更快的聚合。合并调度器（`ConcurrentMergeScheduler`）在单独的后台线程中运行，以最小化对索引吞吐量的影响。

**问: 如何实现字段级安全（FLS），使不同用户看到不同的字段？**

答: 两种方法: (1) 应用层: 存储包含所有字段的文档，但在应用层根据用户角色从 `_source` 响应中过滤字段（简单但字段仍然被索引）。(2) Elasticsearch X-Pack 字段级安全: 定义角色映射来限制用户可以读取/查询的字段。在 shard 级别工作，字段在离开数据节点之前被排除。(3) 索引级隔离（最安全）: 为每个安全域创建单独的索引，将用户路由到其授权的索引。这提供了真正的隔离，但增加了运维复杂性（需要管理 N 倍的索引）。在大多数情况下，X-Pack FLS 提供了安全性和可管理性的良好平衡。

**问: 当用户抱怨结果不相关时，如何调优搜索相关性？**

答: 系统化的相关性调优工作流: (1) 收集带有明确相关性判断的查询-文档对（A/B 测试点击作为隐式反馈，或雇佣编辑进行显式评级）。(2) 计算 NDCG (Normalized Discounted Cumulative Gain) 或 MAP (Mean Average Precision) 作为离线指标。(3) 使用 Ranking Evaluation API (`_rank_eval`) 根据判断集对当前排名评分。(4) 应用更改: 字段加权调优、BM25 参数调优 (k1/b)、function score（新鲜度、流行度）、同义词扩展、自定义分析器调整。(5) 部署前衡量 NDCG 改善。(6) 在生产环境中用保留组进行 A/B 测试。常见的快速优化: 标题加权高于正文 (3-5x)、添加精确匹配子字段加权 (10x)、应用新鲜度衰减、为零结果查询扩展同义词。

**问: Master 节点宕机时会发生什么？**

答: 在 3 个 master 候选节点的情况下，剩余 2 个节点形成法定人数（3 的多数是 2），在几秒内选举新的 master（Zen2/Raft 中通常为 1-10 秒）。在此期间: (1) 现有搜索请求继续由数据节点处理（查询不需要 master）。(2) 新的索引操作根据 `wait_for_active_shards` 设置被缓冲或失败。(3) Shard 分配暂停直到新 master 被选举出来。(4) 选举后，新 master 协调集群状态并恢复正常运行。在 master 选举期间，集群的读取服务永远不会完全不可用；只有写入和集群状态变更会被暂停。
