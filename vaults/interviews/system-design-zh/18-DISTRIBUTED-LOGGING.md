# 设计分布式日志与监控系统（ELK / Datadog）

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [日志收集与摄入](#5-日志收集与摄入)
6. [分布式追踪](#6-分布式追踪)
7. [指标管道](#7-指标管道)
8. [Elasticsearch 深入剖析](#8-elasticsearch-深入剖析)
9. [告警系统](#9-告警系统)
10. [扩展策略](#10-扩展策略)
11. [部署架构](#11-部署架构)
12. [成本优化](#12-成本优化)
13. [对比：自建 vs 购买](#13-对比自建-vs-购买)
14. [常见面试追问](#14-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| 类别           | 需求                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **日志摄入**   | 从 100K+ 服务器、容器和 Serverless 函数收集日志；支持结构化（JSON）和非结构化（纯文本）格式；自动解析常见格式（Apache、Nginx、syslog） |
| **搜索与查询** | 跨所有日志的全文搜索；按服务、严重级别、主机、时间范围过滤；支持正则表达式和通配符；保存查询和视图                                     |
| **分布式追踪** | 通过 trace ID 关联跨微服务请求；可视化请求瀑布图/火焰图；识别延迟瓶颈；支持 OpenTelemetry                                              |
| **指标**       | 收集系统指标（CPU、内存、磁盘、网络）；应用指标（请求速率、错误率、延迟百分位）；自定义业务指标；聚合和降采样                          |
| **告警**       | 基于阈值的告警（例如错误率 > 5%）；异常检测（偏离基线）；复合告警（多条件）；升级策略和值班轮换                                        |
| **仪表盘**     | 自动刷新的实时仪表盘；可自定义的组件（折线图、热力图、表格）；环境/服务过滤的模板变量；可分享的 URL                                    |
| **合规性**     | 日志访问审计追踪；按法规制定的数据保留策略；PII 脱敏；基于角色的访问控制（RBAC）                                                       |

### 非功能性需求

| 需求     | 目标                                                       |
| -------- | ---------------------------------------------------------- |
| 摄入延迟 | 从日志产生到可搜索 < 5 秒                                  |
| 搜索延迟 | 查询 1 小时数据范围 < 2 秒                                 |
| 可用性   | 摄入 99.9% 正常运行时间；仪表盘 99.95%                     |
| 数据保留 | 热存储：7 天，温存储：30 天，冷存储：1 年，冻结/归档：7 年 |
| 持久性   | 正常运行时零日志丢失；故障转移期间最多 0.01% 丢失          |
| 吞吐量   | 峰值时持续 10M+ 日志事件/秒                                |
| 可扩展性 | 摄入和存储线性水平扩展                                     |
| 安全性   | 传输中加密（TLS）和静态加密（AES-256）；RBAC；SOC2 合规    |

### 规模估算

```
服务器:                      100,000 台主机（裸机、虚拟机、容器混合）
容器:                        500,000 个（平均每台主机 5 个）
微服务:                      2,000 个不同的服务

日志量:
  每台主机平均日志行数:       1,000 行/秒
  总日志行数/秒:             100,000 * 1,000 = 100M 行/秒
  平均日志行大小:            500 字节
  摄入带宽:                  100M * 500 B = 50 GB/秒 = 400 Gbps

  每日日志量:                50 GB/s * 86,400 = 4.32 PB/天（原始）
  压缩后（5:1）:             ~864 TB/天（压缩后）
  月存储量（热存储）:         864 TB * 7 = ~6 PB（7 天热存储层）

指标量:
  每台主机指标数:            500 个唯一时间序列
  总时间序列:                100K * 500 = 50M 活跃时间序列
  每个序列的数据点:          1 个点 / 15 秒 = 5,760/天
  每日数据点:                50M * 5,760 = 288 十亿点/天
  每个数据点存储:            16 字节（时间戳 + float64）
  每日指标存储:              288B * 16 = ~4.6 TB/天

追踪:
  每秒请求数:                所有服务共 5M 请求/秒
  每条追踪平均 Span 数:      8 个 Span
  追踪采样率:                10%（头部采样）
  采样后 Span 数/秒:         5M * 0.1 * 8 = 4M Span/秒
  平均 Span 大小:            400 字节
  每日追踪存储:              4M * 400 * 86,400 = ~138 TB/天
```

### 粗略估算汇总

```
+-----------------------+------------------+------------------+
| 信号                  | 摄入速率         | 每日存储         |
+-----------------------+------------------+------------------+
| 日志                  | 50 GB/秒         | 864 TB（压缩后） |
| 指标                  | ~75 MB/秒        | 4.6 TB           |
| 追踪（10% 采样）      | 1.6 GB/秒        | 138 TB           |
+-----------------------+------------------+------------------+
| 总计                  | ~52 GB/秒        | ~1 PB/天         |
+-----------------------+------------------+------------------+
```

---

## 2. API 设计

### 2.1 日志摄入 API

```
POST /api/v1/logs/ingest
Content-Type: application/json
Authorization: Bearer <api-key>
X-Org-ID: org_12345

Request Body:
[
  {
    "timestamp": "2026-03-01T12:00:00.123Z",
    "severity": "ERROR",
    "service": "payment-service",
    "host": "prod-payment-07",
    "container_id": "abc123def",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "message": "Payment processing failed: timeout after 30s",
    "attributes": {
      "payment_id": "pay_9x8y7z",
      "amount": 99.99,
      "currency": "USD",
      "error_code": "GATEWAY_TIMEOUT",
      "retry_count": 3
    },
    "resource": {
      "k8s.namespace": "production",
      "k8s.pod": "payment-service-7b9f4d-x2k9l",
      "k8s.cluster": "us-east-1-prod",
      "cloud.region": "us-east-1"
    }
  }
]

Response: 202 Accepted
{
  "accepted": 1,
  "rejected": 0,
  "request_id": "req_abc123"
}
```

### 2.2 日志搜索 API

```
POST /api/v1/logs/search
Authorization: Bearer <api-key>

Request Body:
{
  "query": "severity:ERROR AND service:payment-service AND message:\"timeout\"",
  "time_range": {
    "from": "2026-03-01T11:00:00Z",
    "to": "2026-03-01T12:00:00Z"
  },
  "filters": {
    "host": ["prod-payment-07", "prod-payment-08"],
    "k8s.namespace": "production"
  },
  "sort": { "field": "timestamp", "order": "desc" },
  "limit": 100,
  "offset": 0,
  "aggregations": {
    "error_count_by_service": {
      "type": "terms",
      "field": "service",
      "size": 10
    },
    "errors_over_time": {
      "type": "date_histogram",
      "field": "timestamp",
      "interval": "5m"
    }
  }
}

Response: 200 OK
{
  "total_hits": 1423,
  "took_ms": 342,
  "logs": [ ... ],
  "aggregations": {
    "error_count_by_service": {
      "buckets": [
        { "key": "payment-service", "doc_count": 892 },
        { "key": "order-service", "doc_count": 312 }
      ]
    },
    "errors_over_time": {
      "buckets": [
        { "key": "2026-03-01T11:00:00Z", "doc_count": 45 },
        { "key": "2026-03-01T11:05:00Z", "doc_count": 120 }
      ]
    }
  }
}
```

### 2.3 指标查询 API

```
POST /api/v1/metrics/query
Authorization: Bearer <api-key>

Request Body:
{
  "query": "avg:system.cpu.usage{service:payment-service, env:production} by {host}",
  "time_range": {
    "from": "2026-03-01T11:00:00Z",
    "to": "2026-03-01T12:00:00Z"
  },
  "rollup": {
    "interval": "1m",
    "aggregation": "avg"
  }
}

Response: 200 OK
{
  "series": [
    {
      "metric": "system.cpu.usage",
      "tags": { "host": "prod-payment-07" },
      "points": [
        [1709290800, 45.2],
        [1709290860, 47.8],
        [1709290920, 92.1]
      ]
    }
  ]
}
```

### 2.4 告警规则 API

```
POST /api/v1/alerts/rules
Authorization: Bearer <api-key>

Request Body:
{
  "name": "High Error Rate - Payment Service",
  "type": "threshold",
  "query": "count:logs{severity:ERROR, service:payment-service}.rollup(sum, 300)",
  "conditions": [
    {
      "threshold": 100,
      "comparison": "above",
      "window": "5m",
      "trigger_after": 2
    }
  ],
  "severity": "critical",
  "notification_channels": ["pagerduty-oncall", "slack-payments-team"],
  "escalation_policy": "payments-escalation",
  "tags": ["team:payments", "env:production"],
  "message": "Error rate for payment-service exceeded 100 errors in 5 minutes.\nDashboard: https://monitor.example.com/d/payments\nRunbook: https://wiki.example.com/runbooks/payment-errors"
}

Response: 201 Created
{
  "id": "alert_rule_789",
  "status": "active",
  "created_at": "2026-03-01T12:00:00Z"
}
```

### 2.5 追踪查询 API

```
GET /api/v1/traces/{trace_id}
Authorization: Bearer <api-key>

Response: 200 OK
{
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "root_service": "api-gateway",
  "duration_ms": 847,
  "span_count": 12,
  "error": true,
  "spans": [
    {
      "span_id": "00f067aa0ba902b7",
      "parent_span_id": null,
      "service": "api-gateway",
      "operation": "POST /api/orders",
      "start_time": "2026-03-01T12:00:00.000Z",
      "duration_ms": 847,
      "status": "ERROR",
      "attributes": { "http.status_code": 500 },
      "events": [
        {
          "name": "exception",
          "timestamp": "2026-03-01T12:00:00.845Z",
          "attributes": {
            "exception.type": "TimeoutError",
            "exception.message": "Payment gateway timeout"
          }
        }
      ],
      "children": ["span_abc123", "span_def456"]
    }
  ]
}
```

---

## 3. 数据模型

### 3.1 日志事件 Schema

```json
{
  "timestamp": "datetime（纳秒精度，UTC）",
  "observed_at": "datetime（收集器接收时间）",
  "severity": "enum: TRACE|DEBUG|INFO|WARN|ERROR|FATAL",
  "severity_num": "int (1-24, OpenTelemetry 严重级别编号)",
  "body": "string（日志消息）",
  "service": "string（服务名称）",
  "host": "string（主机名或 IP）",
  "source": "string（文件路径或组件）",

  "trace_id": "string（128 位十六进制，W3C Trace Context）",
  "span_id": "string（64 位十六进制）",

  "resource": {
    "service.name": "string",
    "service.version": "string",
    "k8s.namespace": "string",
    "k8s.pod.name": "string",
    "k8s.container.name": "string",
    "k8s.cluster.name": "string",
    "cloud.provider": "string",
    "cloud.region": "string",
    "host.name": "string",
    "host.ip": "string"
  },

  "attributes": {
    "key": "value（任意键值对）"
  },

  "org_id": "string（租户标识符）",
  "ingestion_id": "string（去重键）"
}
```

### 3.2 Elasticsearch 索引映射

```json
{
  "mappings": {
    "properties": {
      "timestamp": {
        "type": "date",
        "format": "strict_date_optional_time_nanos"
      },
      "observed_at": { "type": "date" },
      "severity": { "type": "keyword" },
      "severity_num": { "type": "byte" },
      "body": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 1024 }
        }
      },
      "service": { "type": "keyword" },
      "host": { "type": "keyword" },
      "source": { "type": "keyword" },
      "trace_id": { "type": "keyword" },
      "span_id": { "type": "keyword" },
      "resource": {
        "type": "object",
        "properties": {
          "service.name": { "type": "keyword" },
          "service.version": { "type": "keyword" },
          "k8s.namespace": { "type": "keyword" },
          "k8s.pod.name": { "type": "keyword" },
          "k8s.cluster.name": { "type": "keyword" },
          "cloud.region": { "type": "keyword" }
        }
      },
      "attributes": { "type": "flattened" },
      "org_id": { "type": "keyword" },
      "ingestion_id": { "type": "keyword" }
    }
  },
  "settings": {
    "number_of_shards": 6,
    "number_of_replicas": 1,
    "index.codec": "best_compression",
    "index.refresh_interval": "5s",
    "index.translog.durability": "async",
    "index.translog.sync_interval": "5s"
  }
}
```

### 3.3 时间序列指标 Schema（ClickHouse）

```sql
CREATE TABLE metrics (
    org_id          UInt32,
    metric_name     LowCardinality(String),
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    timestamp       DateTime64(3, 'UTC'),
    value           Float64,
    metric_type     Enum8('gauge' = 1, 'counter' = 2, 'histogram' = 3, 'summary' = 4)
)
ENGINE = MergeTree()
PARTITION BY (org_id, toYYYYMMDD(timestamp))
ORDER BY (org_id, metric_name, tag_keys, tag_values, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- 降采样汇总表（1 分钟聚合）
CREATE TABLE metrics_1m (
    org_id          UInt32,
    metric_name     LowCardinality(String),
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    timestamp       DateTime64(3, 'UTC'),
    min_value       Float64,
    max_value       Float64,
    avg_value       Float64,
    sum_value       Float64,
    count           UInt64
)
ENGINE = AggregatingMergeTree()
PARTITION BY (org_id, toYYYYMM(timestamp))
ORDER BY (org_id, metric_name, tag_keys, tag_values, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- 自动汇总的物化视图
CREATE MATERIALIZED VIEW metrics_1m_mv TO metrics_1m AS
SELECT
    org_id,
    metric_name,
    tag_keys,
    tag_values,
    toStartOfMinute(timestamp) AS timestamp,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    sum(value) AS sum_value,
    count() AS count
FROM metrics
GROUP BY org_id, metric_name, tag_keys, tag_values, timestamp;
```

### 3.4 追踪/Span Schema

```sql
CREATE TABLE spans (
    trace_id        FixedString(32),
    span_id         FixedString(16),
    parent_span_id  FixedString(16),
    org_id          UInt32,
    service_name    LowCardinality(String),
    operation_name  LowCardinality(String),
    span_kind       Enum8('INTERNAL'=0, 'SERVER'=1, 'CLIENT'=2, 'PRODUCER'=3, 'CONSUMER'=4),
    start_time      DateTime64(6, 'UTC'),
    duration_ns     UInt64,
    status_code     Enum8('UNSET'=0, 'OK'=1, 'ERROR'=2),
    status_message  String,
    tag_keys        Array(LowCardinality(String)),
    tag_values      Array(String),
    events          Nested(
                        name String,
                        timestamp DateTime64(6, 'UTC'),
                        attributes Map(String, String)
                    ),
    resource_tags   Map(LowCardinality(String), String)
)
ENGINE = MergeTree()
PARTITION BY (org_id, toYYYYMMDD(start_time))
ORDER BY (org_id, service_name, operation_name, start_time, trace_id)
TTL start_time + INTERVAL 14 DAY
SETTINGS index_granularity = 8192;

-- 用于 trace_id 查找的二级索引
ALTER TABLE spans ADD INDEX idx_trace_id (trace_id) TYPE bloom_filter GRANULARITY 4;
```

### 3.5 告警规则 Schema

```sql
CREATE TABLE alert_rules (
    id              UUID PRIMARY KEY,
    org_id          UInt32,
    name            String,
    description     String,
    type            Enum8('threshold'=1, 'anomaly'=2, 'composite'=3, 'log_pattern'=4),
    signal          Enum8('logs'=1, 'metrics'=2, 'traces'=3),
    query           String,
    conditions      JSON,      -- 阈值、比较方式、窗口等
    severity        Enum8('info'=1, 'warn'=2, 'error'=3, 'critical'=4),
    notification_channels Array(String),
    escalation_policy_id  Nullable(UUID),
    tags            Array(String),
    enabled         Boolean DEFAULT true,
    mute_until      Nullable(DateTime),
    created_by      String,
    created_at      DateTime DEFAULT now(),
    updated_at      DateTime DEFAULT now()
);

CREATE TABLE alert_events (
    id              UUID,
    rule_id         UUID,
    org_id          UInt32,
    status          Enum8('triggered'=1, 'acknowledged'=2, 'resolved'=3, 'snoozed'=4),
    triggered_at    DateTime64(3, 'UTC'),
    resolved_at     Nullable(DateTime64(3, 'UTC')),
    value           Float64,
    threshold       Float64,
    message         String,
    notification_log Array(Tuple(channel String, sent_at DateTime, status String))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(triggered_at)
ORDER BY (org_id, rule_id, triggered_at);
```

---

## 4. 高层架构

```
  +--------------------------------------------------------------------------+
  |                              应用层                                       |
  |                                                                           |
  |  +----------+  +----------+  +----------+  +----------+  +----------+   |
  |  | 服务 A   |  | 服务 B   |  | 服务 C   |  | 基础设施  |  | 云服务   |   |
  |  |  (Java)  |  |  (Go)    |  | (Python) |  | (syslog) |  | (Lambda) |   |
  |  +----+-----+  +----+-----+  +----+-----+  +----+-----+  +----+-----+   |
  |       |              |              |              |              |        |
  +-------+--------------+--------------+--------------+--------------+-------+
          |              |              |              |              |
          v              v              v              v              v
  +--------------------------------------------------------------------------+
  |                           收集层                                          |
  |                                                                           |
  |  +---------------+  +---------------+  +---------------+  +------------+ |
  |  |  OTel Agent   |  |  Fluentd /    |  |  Prometheus   |  |  StatsD /  | |
  |  |  (sidecar)    |  |  Vector       |  |  Node Export  |  |  DogStatsD | |
  |  |               |  |  (DaemonSet)  |  |               |  |            | |
  |  | 日志+追踪     |  |  日志         |  |  指标         |  | 自定义指标 | |
  |  | +指标         |  |               |  |               |  |            | |
  |  +-------+-------+  +-------+-------+  +-------+-------+  +------+-----+ |
  |          |                  |                   |                 |        |
  +----------+------------------+-------------------+-----------------+-------+
             |                  |                   |                 |
             v                  v                   v                 v
  +--------------------------------------------------------------------------+
  |                    消息队列 / 缓冲层                                       |
  |                                                                           |
  |  +-------------------------------------------------------------------+   |
  |  |                         Apache Kafka                               |   |
  |  |                                                                    |   |
  |  |   Topic: logs          Topic: metrics       Topic: traces          |   |
  |  |   (100 partitions)     (50 partitions)      (50 partitions)        |   |
  |  |                                                                    |   |
  |  |   保留时间: 24h        保留时间: 6h         保留时间: 12h           |   |
  |  +-------------------------------------------------------------------+   |
  |                                                                           |
  +-----------+--------------------+--------------------+---------------------+
              |                    |                    |
              v                    v                    v
  +--------------------------------------------------------------------------+
  |                   处理 / 富化层                                            |
  |                                                                           |
  |  +------------------+  +------------------+  +------------------+        |
  |  |  日志处理器       |  |  指标聚合器       |  |  追踪组装器       |        |
  |  |                   |  |                   |  |                  |        |
  |  |  - 解析 / grok    |  |  - 预聚合         |  |  - Span 关联     |        |
  |  |  - 富化（地理位置, |  |  - 降采样         |  |  - 服务图谱      |        |
  |  |    k8s 元数据）    |  |  - 标签标准化     |  |  - 错误标记      |        |
  |  |  - PII 脱敏       |  |  - 速率/计数器    |  |  - 尾部采样      |        |
  |  |  - 严重级别映射    |  |    转换           |  |    决策          |        |
  |  |  - 去重           |  |                   |  |                  |        |
  |  +--------+----------+  +--------+----------+  +--------+---------+        |
  |           |                      |                      |                  |
  +-----------+----------------------+----------------------+------------------+
              |                      |                      |
              v                      v                      v
  +--------------------------------------------------------------------------+
  |                            存储层                                          |
  |                                                                           |
  |  +------------------+  +------------------+  +------------------+        |
  |  |  Elasticsearch   |  |  ClickHouse /    |  |  ClickHouse /    |        |
  |  |  （日志存储）     |  |  Mimir / VicMet  |  |  Tempo / Jaeger  |        |
  |  |                  |  |  （指标 TSDB）    |  |  （追踪存储）     |        |
  |  |  热: NVMe SSD    |  |                  |  |                  |        |
  |  |  温: SSD         |  |  原始: 15秒分辨率 |  |  近期: 14 天     |        |
  |  |  冷: HDD         |  |  1分钟汇总: 90天  |  |  归档: S3        |        |
  |  |  冻结: S3        |  |  1小时汇总: 1年   |  |                  |        |
  |  +------------------+  +------------------+  +------------------+        |
  |                                                                           |
  |  +-------------------------------------------------------------------+   |
  |  |                    对象存储（S3 / GCS）                              |   |
  |  |              长期归档、合规、冻结层                                   |   |
  |  +-------------------------------------------------------------------+   |
  |                                                                           |
  +----------+---------------------+---------------------+-------------------+
             |                     |                     |
             v                     v                     v
  +--------------------------------------------------------------------------+
  |                    查询与展示层                                            |
  |                                                                           |
  |  +--------------+  +--------------+  +--------------+  +--------------+  |
  |  |  查询 API    |  |  告警        |  |  仪表盘      |  |  CLI / SDK   |  |
  |  |  网关         |  |  引擎        |  |  (Grafana /  |  |              |  |
  |  |              |  |              |  |   Kibana)    |  |              |  |
  |  |  统一        |  |  规则评估    |  |              |  |  日志追踪    |  |
  |  |  查询语言    |  |  异常检测    |  |  实时         |  |  指标推送    |  |
  |  |  扇出        |  |  PagerDuty   |  |  图表         |  |  追踪查询   |  |
  |  |  缓存        |  |  Slack/Email |  |  模板         |  |              |  |
  |  +--------------+  +--------------+  +--------------+  +--------------+  |
  |                                                                           |
  +--------------------------------------------------------------------------+
```

### 可观测性三大支柱

```
         +----------------------------------------------+
         |           可观测性                             |
         |                                               |
         |   +-------+   +---------+   +--------+       |
         |   | 日志  |   | 指标    |   | 追踪   |       |
         |   |       |   |         |   |        |       |
         |   | 发生了 |   | 系统    |   | 请求   |       |
         |   | 什么   |   | 表现    |   | 去了   |       |
         |   |       |   | 如何    |   | 哪里   |       |
         |   |       |   |         |   |        |       |
         |   +---+---+   +----+----+   +---+----+       |
         |       |            |            |             |
         |       +------------+------------+             |
         |                    |                          |
         |           通过以下方式关联：                    |
         |           trace_id、service、                  |
         |           timestamp、tags                     |
         +----------------------------------------------+
```

---

## 5. 日志收集与摄入

### 5.1 基于 Agent 的收集

```
  应用进程
  +-----------------------------+
  |  应用代码                    |
  |  +--------------------+     |           +--------------------+
  |  | 日志库              |     |           | 容器运行时          |
  |  | (log4j / zap /     |-----+--stdout-->| (Docker/containerd)|
  |  |  structlog / slog) |     |           +----------+---------+
  |  +--------------------+     |                      |
  +-----------------------------+                      v
                                            +--------------------+
                                            | 日志文件 / Journal  |
                                            | /var/log/containers|
                                            +----------+---------+
                                                       |
                                              +--------v---------+
                                              | 收集 Agent        |
                                              | (Vector/Fluentd/  |
                                              |  OTel Collector)  |
                                              |                   |
                                              |  - 尾部跟踪文件   |
                                              |  - 解析格式       |
                                              |  - 本地缓冲       |
                                              |  - 批量发送       |
                                              +--------+----------+
                                                       |
                                                       v
                                                   发往 Kafka
```

### 5.2 收集 Agent 对比

| 特性       | Fluentd              | Vector       | OTel Collector     |
| ---------- | -------------------- | ------------ | ------------------ |
| 语言       | Ruby + C             | Rust         | Go                 |
| 内存使用   | ~40 MB               | ~15 MB       | ~30 MB             |
| 吞吐量     | ~10K 事件/秒         | ~50K 事件/秒 | ~30K 事件/秒       |
| 配置方式   | Ruby DSL             | TOML/YAML    | YAML               |
| 插件生态   | 800+ 插件            | 内置转换     | 持续增长中         |
| 支持的信号 | 仅日志               | 日志 + 指标  | 日志 + 指标 + 追踪 |
| 背压处理   | 依赖插件             | 内置         | 内置               |
| 最适合     | 遗留系统、Kubernetes | 高吞吐量     | 统一可观测性       |

### 5.3 结构化日志最佳实践

```
推荐（结构化 JSON）:
{
  "timestamp": "2026-03-01T12:00:00.123Z",
  "level": "ERROR",
  "service": "order-service",
  "message": "Failed to process order",
  "order_id": "ord_12345",
  "customer_id": "cust_789",
  "error": "insufficient_funds",
  "duration_ms": 234
}

不推荐（非结构化）:
2026-03-01 12:00:00 ERROR Failed to process order ord_12345
  for customer cust_789: insufficient_funds (took 234ms)

结构化日志更好的原因：
  - 机器可解析，无需正则/grok 模式
  - 一致的 schema 支持类型化索引
  - 可按任意字段搜索，无需全文解析
  - 便于聚合以提取指标
```

### 5.4 日志级别及使用场景

```
+----------+------+------------------------------------------+------------------+
| 级别     | 编号 | 使用场景                                  | 数据量影响        |
+----------+------+------------------------------------------+------------------+
| TRACE    |  1   | 详细调试，方法入口/出口                    | 极高             |
| DEBUG    |  5   | 开发者诊断信息                            | 高               |
| INFO     |  9   | 正常操作，请求完成                        | 中               |
| WARN     | 13   | 意外但可恢复的情况                        | 低               |
| ERROR    | 17   | 需要关注的失败操作                        | 低               |
| FATAL    | 21   | 不可恢复的错误，进程将退出                 | 极少             |
+----------+------+------------------------------------------+------------------+

生产环境建议：
  - 默认级别：INFO
  - 通过动态配置（功能开关）按服务启用 DEBUG
  - 生产环境永远不要记录 TRACE
  - WARN 及以上：始终记录，始终可触发告警
```

### 5.5 采样策略

```python
# 头部采样：在追踪/日志创建时决定
def head_sample(trace_id, sample_rate=0.1):
    """基于 trace_id 哈希的确定性采样。
    相同的 trace_id 在所有服务中始终得到相同的决策。"""
    hash_value = fnv1a_hash(trace_id) % 10000
    return hash_value < (sample_rate * 10000)

# 尾部采样：在看到所有数据后决定
def tail_sample(trace):
    """保留所有有价值的追踪，对普通追踪采样。"""
    if trace.has_error:
        return True                  # 保留所有错误
    if trace.duration_ms > 5000:
        return True                  # 保留慢请求追踪
    if trace.is_new_deployment:
        return True                  # 保留金丝雀流量
    return random() < 0.01           # 正常追踪保留 1%

# 动态采样：根据流量调整采样率
def dynamic_sample(service, current_rate_per_sec, target_rate=1000):
    """当流量激增时自动降低采样率。"""
    if current_rate_per_sec <= target_rate:
        return 1.0                   # 全部保留
    return target_rate / current_rate_per_sec
```

### 5.6 背压处理

```
正常流量：
  Agent --(100K/s)--> Kafka --(100K/s)--> 处理器 --(100K/s)--> 存储

背压（存储变慢）：
  Agent --(100K/s)--> Kafka --(100K/s)--> 处理器 --(30K/s)--> 存储
                                                |                    |
                                                |  消费者延迟        | 写入变慢
                                                |  增加              |
                                                v                    |
                                          Kafka 缓冲最多             |
                                          24小时保留                  |

背压策略（按优先级排序）：
  1. Kafka 缓冲      - 增加分区数量，延长保留时间
  2. Agent 磁盘缓冲   - 网络慢时写入本地磁盘
  3. 自适应采样       - 在流量高峰时降低采样率
  4. 优先级队列       - ERROR/FATAL 始终摄入；DEBUG 优先丢弃
  5. 熔断器           - 停止发送以防级联故障
  6. 负载卸载         - 丢弃最低优先级数据（TRACE/DEBUG）
```

---

## 6. 分布式追踪

### 6.1 追踪和 Span 模型

```
  追踪：一个请求在系统中流转的完整路径

  +--------------------------------------------------------------------+
  | trace_id: 4bf92f3577b34da6a3ce929d0e0e4736                         |
  |                                                                     |
  | +-- api-gateway: POST /api/orders ---------------------- 847ms ---+|
  | |                                                                  ||
  | |  +-- auth-service: validateToken ---- 12ms ---+                  ||
  | |  +--------------------------------------------+                  ||
  | |                                                                  ||
  | |  +-- order-service: createOrder -------------- 820ms ---------+  ||
  | |  |                                                             |  ||
  | |  |  +-- inventory-service: checkStock -- 45ms --+              |  ||
  | |  |  +-------------------------------------------+              |  ||
  | |  |                                                             |  ||
  | |  |  +-- payment-service: charge --------- 750ms -- ERROR --+  |  ||
  | |  |  |                                                       |  |  ||
  | |  |  |  +-- stripe-client: POST /charges -- 730ms TIMEOUT -+ |  |  ||
  | |  |  |  +-------------------------------------------------+ |  |  ||
  | |  |  +-------------------------------------------------------+  |  ||
  | |  +--------------------------------------------------------------+  ||
  | +------------------------------------------------------------------+|
  +---------------------------------------------------------------------+

  每个方框是一个 "Span"：
    - span_id:        此工作单元的唯一 ID
    - parent_span_id: 将子 Span 链接到父 Span
    - service_name:   哪个微服务
    - operation_name: 什么操作（HTTP 端点、数据库查询等）
    - start_time:     开始时间（纳秒精度）
    - duration:       持续时间
    - status:         OK、ERROR 或 UNSET
    - attributes:     键值元数据（http.method、db.statement 等）
    - events:         带时间戳的注解（异常、日志）
```

### 6.2 上下文传播

```
  服务 A                       服务 B                      服务 C
  +-----------------+         +-----------------+         +------------------+
  |                 |  HTTP   |                 |  gRPC   |                  |
  |  创建 Span      |-------->|  提取上下文      |-------->|  提取上下文       |
  |  将上下文注入    | Headers |  创建子 Span     | Metadat |  创建子 Span      |
  |  到 Headers     |         |  注入上下文       |         |                  |
  |                 |         |                  |         |                  |
  +-----------------+         +-----------------+         +------------------+

  W3C Trace Context Headers（标准）：
    traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                 |  |                                 |                 |
                 |  trace-id (128位)                  span-id (64位)    |
                 version                                          trace-flags
                                                                  (01 = 已采样)

    tracestate: vendor1=value1,vendor2=value2
                （供应商特定的传播数据）

  不同传输方式中的传播：
    HTTP:    traceparent / tracestate headers
    gRPC:    Metadata（相同的 headers）
    Kafka:   消息 headers
    SQS:     消息属性
    Lambda:  X-Amzn-Trace-Id（在边界处转换）
```

### 6.3 头部采样 vs 尾部采样

```
头部采样（在起始点）：
  +--------+         +------------+
  | 客户端 |--req--> | 服务 A     |-- sampled=true? --> 跨所有服务继续追踪
  +--------+         | （决策点） |
                     +------------+

  优点：                             缺点：
  + 低开销                           - 可能遗漏有价值的追踪
  + 实现简单                         - 无法基于结果采样
  + 跨服务一致                       - 错误/慢请求可能被丢弃
  + 可预测的存储成本


尾部采样（在终点）：
  +--------+   +-------+   +-------+   +--------------+   +--------+
  | 客户端 |-->| 服务A |-->| 服务B |-->| 尾部采样器    |-->| 存储   |
  +--------+   +---+---+   +---+---+   | （收集器）    |   +--------+
                   |            |       |              |
                   +--spans---->+------>| - 收集所有   |
                                        |   Span      |
                                        | - 等待追踪   |
                                        |   完成       |
                                        | - 决定：     |
                                        |   保留/丢弃  |
                                        +--------------+

  优点：                             缺点：
  + 可保留所有错误                    - 更高的内存开销（缓冲所有 Span）
  + 可保留慢请求追踪                  - 更复杂的架构
  + 更好的信噪比                      - Span 必须按 trace_id 路由
  + 基于策略的决策                    - 数据可用前有延迟

  建议：两者结合使用！
    - 头部采样 10% 作为基线
    - 尾部采样捕获 100% 的错误和慢请求追踪
    - 有效采样率约 15-20%，信号质量高
```

### 6.4 追踪存储架构

```
  +---------------------------------------------------------------+
  |                    追踪存储分层                                  |
  |                                                                |
  |  +------------------+   +-----------------+   +-------------+  |
  |  |   热存储          |   |  温存储          |   |   冷存储     |  |
  |  |   (ClickHouse)    |   |  (ClickHouse)    |   |   (S3)      |  |
  |  |                   |   |                  |   |             |  |
  |  |   最近 48 小时    |   |  最近 14 天      |   |  90 天      |  |
  |  |   全分辨率        |   |  服务图谱        |   |  已采样     |  |
  |  |   NVMe SSD        |   |  + 错误追踪      |   |  Parquet    |  |
  |  |                   |   |  SSD             |   |             |  |
  |  |   查询: <100ms    |   |  查询: <500ms    |   |  查询:      |  |
  |  |                   |   |                  |   |  <30秒      |  |
  |  +------------------+   +-----------------+   +-------------+  |
  +---------------------------------------------------------------+
```

---

## 7. 指标管道

### 7.1 拉取 vs 推送模型

```
拉取模型（Prometheus）：
  +--------------+                    +-------------------+
  |  应用程序     |                    |   Prometheus       |
  |              |   GET /metrics     |                   |
  |  /metrics <--+--------------------+   - 每 15 秒      |
  |  端点        |   （每 15 秒）      |     抓取一次       |
  |              |-------------------->   - 存储 TSDB     |
  |  导出：      |   Prometheus       |   - 通过 k8s API  |
  |  计数器、    |   exposition       |     服务发现       |
  |  仪表盘、    |   格式             |                   |
  |  直方图      |                    +-------------------+
  +--------------+

  优点：                             缺点：
  + 易于调试（curl /metrics）         - 需要网络访问目标
  + 服务发现驱动                      - 不适合短生命周期任务
  + 无客户端缓冲                      - 抓取间隔限制分辨率
  + 集中控制抓取频率                  - 防火墙/NAT 可能有问题


推送模型（StatsD / DogStatsD）：
  +--------------+                    +-------------------+
  |  应用程序     |  UDP/TCP 推送      |   StatsD Server   |
  |              |-------------------->                   |
  |  statsd.     |                    |   - 本地聚合      |
  |  increment(  |  即发即忘           |                   |
  |    'orders', |  （无响应）         |   - 每 10 秒      |
  |    tags={})  |                    |     刷新一次       |
  |              |                    |   - 转发到        |
  +--------------+                    |     存储           |
                                      +-------------------+

  优点：                             缺点：
  + 可穿透防火墙/NAT                  - 客户端必须缓冲/批处理
  + 适合短生命周期进程                 - 可能丢失数据（UDP）
  + 低延迟发送                        - 更难调试
  + 不需要 /metrics 端点              - 客户端复杂度更高


混合模型（OpenTelemetry - 推荐）：
  应用程序 --(OTLP 推送)--> OTel Collector --> 多个后端
                                    |
                                    +--> Prometheus（remote write）
                                    +--> Datadog
                                    +--> ClickHouse
```

### 7.2 时间序列数据模型

```
一个指标数据点：
  +-------------------------------------------------+
  |  指标名称：  http_request_duration_seconds        |
  |  标签/Tags：{method="POST", path="/api/orders"   |
  |              service="order-svc", env="prod"}     |
  |  时间戳：    2026-03-01T12:00:15.000Z            |
  |  值：        0.247（秒）                          |
  |  类型：      histogram                            |
  +-------------------------------------------------+

基数爆炸警告：
  高基数标签会严重影响性能：
    不好：  {user_id="12345", request_id="abc-def"}    -- 数百万个序列
    推荐：  {method="POST", status="200", env="prod"}  -- 有界组合

  基数预算：
    50M 活跃时间序列 = 大集群安全范围
    500M 活跃时间序列 = 需要分片和仔细规划
    5B 活跃时间序列 = 几乎肯定是基数 bug
```

### 7.3 聚合和降采样

```
  原始数据（15 秒分辨率）：
  --------------------------------------------------
  12:00:00  12:00:15  12:00:30  12:00:45  12:01:00
    45.2      47.8      92.1      88.3      52.0
  --------------------------------------------------
                        |
                        v  1 分钟汇总
  --------------------------------------------------
  12:00:00                                12:01:00
    min=45.2  max=92.1  avg=68.35  count=4  sum=273.4
  --------------------------------------------------
                        |
                        v  1 小时汇总
  --------------------------------------------------
  12:00:00                                 13:00:00
    min=12.1  max=98.7  avg=55.2  count=240  p99=95.3
  --------------------------------------------------

  存储节省：
    原始 15秒：   5,760 点/天/序列 * 16B = 92 KB/天
    1 分钟：      1,440 点/天/序列 * 40B = 56 KB/天
    1 小时：         24 点/天/序列 * 40B = 960 B/天

  保留策略：
    原始 15秒 数据：   7 天    （运维调试）
    1 分钟汇总：      90 天    （近期趋势）
    1 小时汇总：       2 年    （长期容量规划）
```

### 7.4 常见查询的 PromQL 示例

```promql
# 过去 5 分钟的请求速率（每秒请求数）
rate(http_requests_total{service="api-gateway"}[5m])

# 错误率百分比
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100

# 从直方图计算 P99 延迟
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{service="order-svc"}[5m]))
  by (le)
)

# 每个 Pod 的 CPU 使用率
100 - (avg by (pod) (
  rate(container_cpu_usage_seconds_total{namespace="production"}[5m])
) * 100)

# 内存使用百分比
container_memory_working_set_bytes{namespace="production"}
/
container_spec_memory_limit_bytes{namespace="production"}
* 100

# 磁盘空间预测（线性外推）
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600)
```

---

## 8. Elasticsearch 深入剖析

### 8.1 倒排索引

```
  文档：
    doc_1: "payment processing failed timeout"
    doc_2: "payment gateway error connection refused"
    doc_3: "order processing completed successfully"

  倒排索引：
  +-----------------+------------------------+
  | 词项             | 倒排列表               |
  +-----------------+------------------------+
  | payment          | [doc_1, doc_2]         |
  | processing       | [doc_1, doc_3]         |
  | failed           | [doc_1]                |
  | timeout          | [doc_1]                |
  | gateway          | [doc_2]                |
  | error            | [doc_2]                |
  | connection       | [doc_2]                |
  | refused          | [doc_2]                |
  | order            | [doc_3]                |
  | completed        | [doc_3]                |
  | successfully     | [doc_3]                |
  +-----------------+------------------------+

  查询: "payment AND timeout"
    -> 倒排列表求交集: [doc_1, doc_2] ^ [doc_1] = [doc_1]

  对于日志搜索，keyword 字段使用 doc_values（列式存储）
  而非倒排索引，用于精确匹配和聚合。
```

### 8.2 分片策略

```
  索引: logs-2026.03.01
  +--------------------------------------------------------------+
  |                                                              |
  |  分片 0 (P)     分片 1 (P)     分片 2 (P)     分片 3 (P)    |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  | 25% 数据 |   | 25% 数据 |   | 25% 数据 |   | 25% 数据 |  |
  |  | 节点 A   |   | 节点 B   |   | 节点 C   |   | 节点 D   |  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |  | 副本     |   | 副本     |   | 副本     |   | 副本     |  |
  |  | 节点 C   |   | 节点 D   |   | 节点 A   |   | 节点 B   |  |
  |  +----------+   +----------+   +----------+   +----------+  |
  |                                                              |
  +--------------------------------------------------------------+

  分片大小指南：
    - 目标：每个分片 20-50 GB
    - 最大推荐：每个分片 65 GB
    - 最小推荐：每个分片 10 GB（避免过小的分片）

  每个索引的分片数：
    每个索引每日日志量：864 TB / 天（如果是单索引）
    按服务分索引：864 TB / 2000 个服务 = ~432 GB/服务/天
    每个服务索引的分片数：432 GB / 40 GB = ~11 个分片

  策略：基于时间的索引配合 rollover
    logs-payment-service-000001  （在 50GB 或 1 天时滚动）
    logs-payment-service-000002
    logs-payment-service-000003
    ...
```

### 8.3 索引生命周期管理（ILM）

```
  +----------+      +----------+      +----------+      +----------+
  |   热     |----->|  温      |----->|  冷      |----->|  删除    |
  |          |      |          |      |          |      |  / 冻结  |
  | NVMe SSD |      | SSD      |      | HDD      |      |  (S3)    |
  | 0-2 天   |      | 2-30天   |      | 30-365天 |      | >365天   |
  |          |      |          |      |          |      |          |
  | 写入 +   |      | 读取     |      | 极少     |      | 仅用于   |
  | 搜索     |      | 密集     |      | 访问     |      | 合规     |
  +----------+      +----------+      +----------+      +----------+

  阶段转换和操作：
  +----------+------------------+------------------------------------+
  | 阶段     | 触发条件          | 操作                               |
  +----------+------------------+------------------------------------+
  | 热       | 写入时            | 在 50GB 或 1 天时 Rollover          |
  |          |                  | 1 个副本，refresh_interval=5s       |
  +----------+------------------+------------------------------------+
  | 温       | Rollover 后      | 强制合并为 1 个 Segment              |
  |          | 2 天             | 从 6 个分片缩减为 1 个               |
  |          |                  | 启用 best_compression               |
  |          |                  | 设为只读，refresh=30s               |
  +----------+------------------+------------------------------------+
  | 冷       | Rollover 后      | 冻结索引（无内存开销）               |
  |          | 30 天            | 迁移到冷节点（HDD）                  |
  |          |                  | 可搜索快照（S3 支持）                |
  |          |                  | 0 个副本                            |
  +----------+------------------+------------------------------------+
  | 冻结     | 365 天           | 完全从 S3 挂载                      |
  |          |                  | 不需要本地存储                       |
  |          |                  | 可接受非常慢的查询                   |
  +----------+------------------+------------------------------------+
  | 删除     | 按保留策略        | 完全删除索引                        |
  |          | （如 7 年）       |                                    |
  +----------+------------------+------------------------------------+
```

### 8.4 热-温-冷节点架构

```
  +--------------------------------------------------------------------+
  |                    Elasticsearch 集群                                |
  |                                                                     |
  |  主节点（3 个，专用，无数据）：                                       |
  |  +---------+  +---------+  +---------+                             |
  |  |主节点 1 |  |主节点 2 |  |主节点 3 |  集群状态、分片               |
  |  | 8 CPU   |  | 8 CPU   |  | 8 CPU   |  分配、ILM 管理             |
  |  | 16 GB   |  | 16 GB   |  | 16 GB   |                            |
  |  +---------+  +---------+  +---------+                             |
  |                                                                     |
  |  热节点（20 个）：                                                   |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 32 CPU  |  | 32 CPU  |  | 32 CPU  |     高 CPU + 内存           |
  |  | 128 GB  |  | 128 GB  |  | 128 GB  |     NVMe SSD (8 TB)       |
  |  | NVMe    |  | NVMe    |  | NVMe    |     最新索引               |
  |  +---------+  +---------+  +---------+     活跃写入               |
  |                                                                     |
  |  温节点（30 个）：                                                   |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 16 CPU  |  | 16 CPU  |  | 16 CPU  |     中等 CPU + 内存         |
  |  | 64 GB   |  | 64 GB   |  | 64 GB   |     SSD (16 TB)           |
  |  | SSD     |  | SSD     |  | SSD     |     较旧的索引             |
  |  +---------+  +---------+  +---------+     只读                   |
  |                                                                     |
  |  冷/冻结节点（10 个）：                                              |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 8 CPU   |  | 8 CPU   |  | 8 CPU   |     低 CPU + 内存           |
  |  | 32 GB   |  | 32 GB   |  | 32 GB   |     HDD (50 TB) + S3      |
  |  | HDD+S3  |  | HDD+S3  |  | HDD+S3  |     可搜索快照             |
  |  +---------+  +---------+  +---------+     极少查询               |
  |                                                                     |
  |  协调节点（5 个，无数据）：                                          |
  |  +---------+  +---------+  +---------+  ...                        |
  |  | 16 CPU  |  | 16 CPU  |  | 16 CPU  |     分散-聚合               |
  |  | 64 GB   |  | 64 GB   |  | 64 GB   |     查询路由               |
  |  | 无磁盘  |  | 无磁盘  |  | 无磁盘  |     结果合并               |
  |  +---------+  +---------+  +---------+                             |
  +--------------------------------------------------------------------+
```

### 8.5 搜索优化技术

```
  1. 按天分索引策略：
     查询"过去 1 小时" -> 只搜索 1 个索引（而非全部历史）

  2. 按服务路由：
     _routing = service_name -> 一个服务的所有日志在同一分片上
     单分片查询而非跨所有分片的分散-聚合

  3. Keyword vs Text 字段：
     - severity: keyword（精确匹配，无分析）
     - body:     text（全文搜索，带分析器）
     - host:     keyword（精确匹配过滤）

  4. Filter 上下文 vs Query 上下文：
     - Filters: 可缓存，无评分（severity:ERROR, service:payment）
     - Queries: 有评分，不缓存（body:"timeout"，带相关性）
     - 精确匹配始终放在 filter 上下文中

  5. 日期范围预过滤：
     Elasticsearch 在打开分片前检查索引名称。
     如果查询的是 2026.02.28，logs-2026.03.01 可以完全跳过。

  6. 避免昂贵的查询：
     不好：  通配符前置（"*timeout*"）  -> 扫描整个索引
     推荐：  前缀查询（"timeout*"）     -> 高效使用索引
     推荐：  精确匹配（severity:ERROR） -> 单词项查找

  7. Scroll / Search After 分页：
     不好：  from=10000, size=10（深度分页，O(from+size)）
     推荐：  search_after=[last_sort_value]（游标分页，O(size)）
```

---

## 9. 告警系统

### 9.1 告警规则引擎

```
  +--------------------------------------------------------------+
  |                    告警引擎                                    |
  |                                                               |
  |  +--------------+    +---------------+    +--------------+    |
  |  |  规则存储     |    |  评估器        |    |  状态存储     |    |
  |  |               |    |               |    |              |    |
  |  |  每个组织     |--->|  每 60 秒：    |--->|  当前告警     |    |
  |  |  2000 条规则  |    |  - 获取数据   |    |  状态         |    |
  |  |               |    |  - 评估规则   |    |  （触发中、   |    |
  |  |  跨评估       |    |  - 与阈值     |    |   待定、      |    |
  |  |  Worker       |    |    比较       |    |   已解决）    |    |
  |  |  分区         |    |  - 更新       |    |              |    |
  |  |               |    |    状态       |    |  Redis +     |    |
  |  |               |    |               |    |  PostgreSQL  |    |
  |  +--------------+    +-------+-------+    +--------------+    |
  |                              |                                 |
  |                              v                                 |
  |                    +------------------+                        |
  |                    |  通知            |                        |
  |                    |  路由器          |                        |
  |                    |                  |                        |
  |                    |  +------------+  |                        |
  |                    |  | PagerDuty  |  |                        |
  |                    |  | Slack      |  |                        |
  |                    |  | Email      |  |                        |
  |                    |  | Webhook    |  |                        |
  |                    |  | OpsGenie   |  |                        |
  |                    |  | MS Teams   |  |                        |
  |                    |  +------------+  |                        |
  |                    +------------------+                        |
  +--------------------------------------------------------------+
```

### 9.2 告警类型

```python
# 1. 阈值告警
def evaluate_threshold(rule, data_points):
    """当指标超过静态阈值时触发。"""
    window = data_points.last(rule.window)  # 例如过去 5 分钟
    value = aggregate(window, rule.aggregation)  # 例如 avg、sum、count

    if rule.comparison == "above" and value > rule.threshold:
        return AlertResult(status="FIRING", value=value)
    if rule.comparison == "below" and value < rule.threshold:
        return AlertResult(status="FIRING", value=value)
    return AlertResult(status="OK", value=value)


# 2. 异常检测告警
def evaluate_anomaly(rule, data_points):
    """当指标偏离学习到的基线时触发。"""
    current = data_points.last(rule.window)
    baseline = compute_baseline(
        data_points.historical(weeks=4),
        seasonality="weekly"
    )

    current_value = aggregate(current, "avg")
    expected = baseline.expected_value()
    stddev = baseline.standard_deviation()

    deviation = abs(current_value - expected) / stddev

    if deviation > rule.sensitivity:  # 例如 3 个标准差
        return AlertResult(
            status="FIRING",
            value=current_value,
            expected=expected,
            deviation_sigma=deviation
        )
    return AlertResult(status="OK")


# 3. 复合告警
def evaluate_composite(rule, sub_alerts):
    """当多个条件同时满足时触发。"""
    # 示例：高错误率 AND 高延迟 AND 低吞吐量
    conditions_met = sum(
        1 for sub in rule.sub_conditions
        if sub_alerts[sub.alert_id].status == "FIRING"
    )

    if rule.operator == "AND" and conditions_met == len(rule.sub_conditions):
        return AlertResult(status="FIRING")
    if rule.operator == "OR" and conditions_met > 0:
        return AlertResult(status="FIRING")
    return AlertResult(status="OK")


# 4. 日志模式告警
def evaluate_log_pattern(rule, log_stream):
    """当日志模式频率超过阈值时触发。"""
    matching_logs = log_stream.query(
        query=rule.pattern,
        time_range=rule.window
    )
    count = len(matching_logs)

    if count > rule.threshold:
        return AlertResult(
            status="FIRING",
            value=count,
            sample_logs=matching_logs[:5]
        )
    return AlertResult(status="OK")
```

### 9.3 升级策略

```
  升级策略："payments-critical"
  +------------------------------------------------------------------+
  |                                                                  |
  |  第 1 步（0 分钟）：通过 PagerDuty 通知值班工程师                  |
  |                      + Slack #payments-alerts                    |
  |                      等待：5 分钟等待确认                         |
  |                                                                  |
  |  第 2 步（5 分钟）：通过 PagerDuty 通知备用值班                   |
  |                      + 电话联系主值班                             |
  |                      等待：10 分钟等待确认                        |
  |                                                                  |
  |  第 3 步（15 分钟）：通知工程经理                                  |
  |                      + Slack #payments-escalation                |
  |                      等待：15 分钟等待确认                        |
  |                                                                  |
  |  第 4 步（30 分钟）：通知工程副总裁                                |
  |                      + 自动开启事故响应会议桥                      |
  |                                                                  |
  +------------------------------------------------------------------+

  值班轮换：
  +----------+--------------+--------------+--------------+
  | 周次     | 主值班       | 备用值班      | 经理         |
  +----------+--------------+--------------+--------------+
  | 第 1 周  | Alice        | Bob          | Carol        |
  | 第 2 周  | Bob          | Charlie      | Carol        |
  | 第 3 周  | Charlie      | Alice        | Carol        |
  +----------+--------------+--------------+--------------+
```

### 9.4 告警疲劳预防

```
  问题：告警太多 -> 人类忽略它们 -> 真实事故被遗漏

  策略：
  +-----------------------+----------------------------------------------+
  | 策略                  | 描述                                          |
  +-----------------------+----------------------------------------------+
  | 去重                  | 将相同告警（同一服务 +                         |
  |                       | 同一错误）合并为单条通知                       |
  +-----------------------+----------------------------------------------+
  | 分组                  | 将同一根因的告警批量处理                       |
  |                       | （例如节点故障触发 50 个 Pod 告警）             |
  +-----------------------+----------------------------------------------+
  | 冷却 / 暂停           | 告警触发后，在 N 分钟内                        |
  |                       | 抑制重复通知                                  |
  +-----------------------+----------------------------------------------+
  | 自动恢复              | 当指标恢复时自动解除告警                       |
  |                       | （在 M 分钟内）                               |
  +-----------------------+----------------------------------------------+
  | 严重级别分层           | INFO -> 仅 Slack                             |
  |                       | WARN -> Slack + 工单                         |
  |                       | ERROR -> PagerDuty（工作时间）                |
  |                       | CRITICAL -> PagerDuty（24/7）+ 电话           |
  +-----------------------+----------------------------------------------+
  | 可操作性要求           | 每条告警必须包含运维手册链接。                  |
  |                       | 如果没人知道该怎么做，就删除该规则。             |
  +-----------------------+----------------------------------------------+
  | 告警审查节奏           | 每月审查：删除自动恢复率                       |
  |                       | >90% 或操作率 <5% 的告警                      |
  +-----------------------+----------------------------------------------+

  关键指标：信噪比
    目标：>80% 的告警应需要人工操作
    大多数组织的现实：~30% 是可操作的
```

---

## 10. 扩展策略

### 10.1 Kafka 分区用于日志摄入

```
  Topic: logs（100 个分区）
  +--------------------------------------------------------------+
  |                                                              |
  |  分区 0   -->  消费者组 A（日志处理器）                        |
  |  分区 1   -->  消费者 1: 分区 [0-9]                           |
  |  分区 2   -->  消费者 2: 分区 [10-19]                         |
  |  ...      -->  消费者 3: 分区 [20-29]                         |
  |  分区 99  -->  ...                                            |
  |           -->  消费者 10: 分区 [90-99]                        |
  |                                                              |
  +--------------------------------------------------------------+

  分区键策略：
    选项 A: service_name    -> 一个服务的所有日志在一个分区上
                              （有利于排序，有热分区风险）

    选项 B: hash(host_id)   -> 跨分区均匀分布
                              （有利于吞吐量，失去服务排序）

    选项 C: hash(org_id)    -> 多租户系统中的租户隔离
                              （有利于隔离，热门租户需要拆分）

  推荐：hash(service_name + host_id)
    -> 均匀分布同时保持特定实例的局部性

  每个分区的吞吐量：
    目标：每个分区 1 MB/秒（Kafka 默认生产者批次大小）
    100 个分区：100 MB/秒 = 800 Mbps
    需要 50 GB/秒？-> 50,000 个分区，跨多个 Kafka 集群
                     （或使用 Kafka 分层存储增加缓冲容量）
```

### 10.2 Elasticsearch 集群容量规划

```
  已知：864 TB/天压缩日志，7 天热存储保留

  热存储层容量规划：
    每日数据：         864 TB 压缩后
    7 天保留：         864 * 7 = 6,048 TB = ~6 PB
    副本因子：         1（1 主 + 1 副本）= 12 PB 总计
    分片大小目标：     40 GB
    分片数量：         12 PB / 40 GB = 300,000 个分片
    每个节点分片数：   最多 1,000（64 GB 堆内存）
    最少热节点数：     300,000 / 1,000 = 300 个节点
    每个节点存储：     12 PB / 300 = 40 TB 每节点（使用 8x 8TB NVMe）

  现实检查：这个规模非常庞大。在此规模下，你可能需要：
    1. 按服务分 Elasticsearch 集群（不是一个单体集群）
    2. 激进采样（保留 10% 的 DEBUG/INFO，100% 的 ERROR）
    3. ClickHouse 用于批量存储（5-10 倍更好的压缩率）
    4. Elasticsearch 仅用于最近的可搜索数据

  此规模下的实际架构：
    Elasticsearch: 最近 2 天的热数据（~1.7 PB，50 个节点）
    ClickHouse:    最近 30 天的所有数据（压缩后）
    S3 + Parquet:  长期归档（使用 Athena/Trino 查询）
```

### 10.3 存储分层

```
  +-------------------------------------------------------------------+
  |                    存储层对比                                        |
  |                                                                    |
  |  +---------+----------+------------+--------------+------------+   |
  |  | 层级    | 存储介质  | 延迟       | 成本/TB/月   | 持续时间    |   |
  |  +---------+----------+------------+--------------+------------+   |
  |  | 热      | NVMe SSD | <100ms     | ~$200        | 0-7 天     |   |
  |  | 温      | SSD      | <500ms     | ~$100        | 7-30 天    |   |
  |  | 冷      | HDD      | <5s        | ~$30         | 30-365 天  |   |
  |  | 冻结    | S3       | <30s       | ~$5          | 1-7 年     |   |
  |  | 归档    | S3 Glac. | 数小时     | ~$1          | 7+ 年      |   |
  |  +---------+----------+------------+--------------+------------+   |
  |                                                                    |
  |  成本节省：将 1 PB 从热层迁移到冷层可节省 ~$170K/月                |
  |  成本节省：将 1 PB 从热层迁移到 S3 可节省 ~$195K/月                |
  +-------------------------------------------------------------------+
```

### 10.4 数据保留策略

```python
# 保留策略配置
RETENTION_POLICIES = {
    "logs": {
        "default": {
            "hot": "7d",
            "warm": "30d",
            "cold": "365d",
            "delete": "2555d"   # 7 年
        },
        "by_severity": {
            "DEBUG": {"hot": "1d", "warm": "7d", "delete": "30d"},
            "INFO":  {"hot": "3d", "warm": "14d", "delete": "90d"},
            "WARN":  {"hot": "7d", "warm": "30d", "delete": "365d"},
            "ERROR": {"hot": "14d", "warm": "90d", "delete": "2555d"},
            "FATAL": {"hot": "30d", "warm": "180d", "delete": "2555d"},
        },
        "by_compliance": {
            "pci_dss":  {"min_retention": "365d", "encryption": "required"},
            "hipaa":    {"min_retention": "2190d", "encryption": "required"},
            "gdpr":     {"max_retention": "depends", "pii_redaction": "required"},
            "sox":      {"min_retention": "2555d", "immutable": True},
        }
    },
    "metrics": {
        "raw_15s":  "7d",
        "rollup_1m": "90d",
        "rollup_1h": "730d",   # 2 年
        "rollup_1d": "3650d",  # 10 年
    },
    "traces": {
        "full_resolution": "14d",
        "service_graphs":  "90d",
        "error_traces":    "365d",
    }
}
```

---

## 11. 部署架构

### 11.1 多区域部署

```
  +---------------------------------------------------------------------+
  |                        区域：US-EAST-1                               |
  |                                                                      |
  |  +-------------+  +--------------+  +---------------------------+   |
  |  | 50K 服务器  |  | 收集         |  | Kafka 集群（主集群）       |   |
  |  | + 容器      |->| Agent        |->| 30 个 Broker              |   |
  |  |             |  | (Vector)     |  | Topics: logs, metrics,    |   |
  |  +-------------+  +--------------+  |         traces            |   |
  |                                     +------------+--------------+   |
  |                                                  |                   |
  |                    +-----------------------------+                   |
  |                    |  处理管道                    |                   |
  |                    |  （50 个 Worker，k8s）       |                   |
  |                    +-----------------------------+                   |
  |                                  |                                    |
  |                                  v                                    |
  |  +------------------------------------------------------+           |
  |  |  存储                                                |           |
  |  |  +------------+ +------------+ +----------+           |           |
  |  |  | ES 集群    | | ClickHouse | | S3       |           |           |
  |  |  | （热+温）  | | （指标+    | | （归档） |           |           |
  |  |  | 50 个节点  | |  追踪）    | |          |           |           |
  |  |  |            | | 20 个节点  | |          |           |           |
  |  |  +------------+ +------------+ +----------+           |           |
  |  +------------------------------------------------------+           |
  |                                                                      |
  |  +------------------------------------------------------+           |
  |  |  查询 + UI 层                                        |           |
  |  |  +----------+ +----------+ +----------+              |           |
  |  |  |查询 API  | |告警      | |Grafana   |              |           |
  |  |  |(10 pods) | |引擎      | |仪表盘    |              |           |
  |  |  +----------+ +----------+ +----------+              |           |
  |  +------------------------------------------------------+           |
  |                                                                      |
  +--------------------------------------+-------------------------------+
                                         |
                跨区域复制               |  （关键告警 + 配置）
                (Kafka MirrorMaker 2.0)  |
                                         |
  +--------------------------------------v-------------------------------+
  |                        区域：EU-WEST-1                                |
  |                                                                       |
  |  +-------------+  +--------------+  +---------------------------+    |
  |  | 50K 服务器  |  | 收集         |  | Kafka 集群（主集群）       |    |
  |  | + 容器      |->| Agent        |->| 30 个 Broker              |    |
  |  |             |  | (Vector)     |  | （独立集群）              |    |
  |  +-------------+  +--------------+  +------------+--------------+    |
  |                                                   |                   |
  |                    +------------------------------+                   |
  |                    |  存储 + 处理                  |                   |
  |                    |  （与 US-EAST-1 架构一致）     |                   |
  |                    +------------------------------+                   |
  |                                                                       |
  |  GDPR 合规：                                                          |
  |  - 欧盟日志保留在欧盟区域                                              |
  |  - 跨区域复制前进行 PII 脱敏                                           |
  |  - 按组织/租户的数据驻留控制                                            |
  |                                                                       |
  +-----------------------------------------------------------------------+

  +-----------------------------------------------------------------------+
  |                    全局控制平面                                         |
  |                                                                        |
  |  +---------------+  +---------------+  +---------------+              |
  |  |  配置存储      |  |  告警规则      |  |  用户/组织     |              |
  |  |  (etcd/Consul) |  |  (PostgreSQL) |  |  管理          |              |
  |  |  已复制        |  |  多主         |  |  (PostgreSQL)  |              |
  |  +---------------+  +---------------+  +---------------+              |
  |                                                                        |
  |  基于 DNS 的路由：logs.us.example.com / logs.eu.example.com            |
  |  全局仪表盘：dashboard.example.com（从两个区域读取）                     |
  +-----------------------------------------------------------------------+
```

### 11.2 灾难恢复

```
  按组件的恢复策略：
  +------------------+-------------------+------------------------------+
  | 组件             | RPO / RTO         | 灾难恢复策略                  |
  +------------------+-------------------+------------------------------+
  | Kafka            | RPO=0, RTO<5分钟  | MirrorMaker 2.0 到灾备区域    |
  |                  |                   | 异步复制，延迟 <30秒          |
  +------------------+-------------------+------------------------------+
  | Elasticsearch    | RPO<1小时,        | 每小时快照到 S3               |
  |                  | RTO<30分钟        | 关键索引的跨集群复制           |
  +------------------+-------------------+------------------------------+
  | ClickHouse       | RPO<1小时,        | 跨可用区的复制表              |
  |                  | RTO<30分钟        | 冷数据的 S3 备份              |
  +------------------+-------------------+------------------------------+
  | 告警规则         | RPO=0, RTO<5分钟  | PostgreSQL 流复制              |
  |                  |                   | 规则定义的 GitOps              |
  +------------------+-------------------+------------------------------+
  | 仪表盘           | RPO<1小时,        | Dashboard-as-code（Terraform   |
  |                  | RTO<15分钟        | 或 Grafana provisioning）      |
  +------------------+-------------------+------------------------------+

  关键原则：灾难恢复时丢失日志是可以接受的。
  丢失告警能力是不可接受的。
  告警必须独立于存储进行故障转移。
```

---

## 12. 成本优化

### 12.1 规模化成本细分

```
  100K 服务器监控平台月成本：

  +------------------------+--------------+------------+------------+
  | 组件                   | 节点/单位数   | 单价       | 月成本      |
  +------------------------+--------------+------------+------------+
  | Kafka Broker           | 60           | $2,000     | $120,000   |
  | ES 热节点 (32c/128G)   | 50           | $4,000     | $200,000   |
  | ES 温节点 (16c/64G)    | 80           | $2,000     | $160,000   |
  | ES 冷节点              | 20           | $800       | $16,000    |
  | ClickHouse 节点        | 30           | $2,500     | $75,000    |
  | 处理 Worker            | 100          | $500       | $50,000    |
  | 收集 Agent             | 100,000      | $0（开源）  | $0*        |
  | S3 存储（归档）         | 10 PB        | $23/TB     | $230,000   |
  | 网络传输               | 5 PB         | $50/TB     | $250,000   |
  | Grafana/Kibana         | 10           | $500       | $5,000     |
  +------------------------+--------------+------------+------------+
  | 总计（自建）            |              |            | ~$1.1M/月  |
  +------------------------+--------------+------------+------------+
  | Datadog 等价成本        | 100K 主机    | $23/主机   | ~$2.3M/月  |
  | （仅基础设施）          |              | + 摄入费   | + 摄入费   |
  +------------------------+--------------+------------+------------+

  * Agent 的 CPU/内存开销已包含在服务器计算成本中
```

### 12.2 成本优化策略

```
  +-----------------------------+----------+-----------------------------+
  | 策略                        | 节省     | 权衡                        |
  +-----------------------------+----------+-----------------------------+
  | 激进采样                     | 50-80%   | 可能遗漏稀有事件            |
  | （保留 10% 的 DEBUG/INFO）   |          | 边缘情况更难调试            |
  +-----------------------------+----------+-----------------------------+
  | 日志排除规则                 | 10-30%   | 必须维护排除列表            |
  | （丢弃健康检查等）           |          | 有过滤过多的风险            |
  +-----------------------------+----------+-----------------------------+
  | 压缩（zstd）                | 60-80%   | 压缩/解压缩的 CPU 开销      |
  +-----------------------------+----------+-----------------------------+
  | 指标预聚合                   | 70-90%   | 旧数据失去单实例详情         |
  | （摄入前聚合）               |          |                             |
  +-----------------------------+----------+-----------------------------+
  | 缩短热存储保留时间            | 40-60%   | 较旧数据查询变慢            |
  | （2 天热 vs 7 天）           |          |                             |
  +-----------------------------+----------+-----------------------------+
  | 预留实例 / 竞价实例           | 30-60%   | 需要承诺或有中断风险         |
  | （用于处理 Worker）           |          |                             |
  +-----------------------------+----------+-----------------------------+
  | 分层存储（S3 冻结）           | 90%+     | 归档数据查询非常慢（秒级）   |
  +-----------------------------+----------+-----------------------------+
```

### 12.3 采样 vs 全量摄入决策框架

```
  何时使用全量摄入（100%）：
    - Error 和 Fatal 严重级别的日志（始终保留）
    - 安全/审计日志（合规要求）
    - 支付交易日志（调试财务问题）
    - 告警关键指标（SLO 跟踪）
    - 错误路径的追踪

  何时使用采样：
    - DEBUG/TRACE 级别日志 -> 1-5% 采样
    - 健康检查日志 -> 完全排除
    - 高量级 INFO 日志 -> 10-20% 采样
    - 正常（非错误）追踪 -> 10% 头部采样
    - 每请求指标 -> 预聚合为每分钟

  何时使用动态采样：
    - 流量高峰期间 -> 自动降低以保持在预算内
    - 新部署 -> 临时提高到 100% 然后逐步降低
    - 事故后 -> 在事后分析窗口期内提高

  成本影响示例：
    全量摄入：     $1.1M/月
    使用采样后：   $350K/月（降低 68%）
    关键洞察：80% 的日志是很少被搜索的 DEBUG/INFO
```

---

## 13. 对比：自建 vs 购买

### 13.1 平台对比

```
+------------------+--------------+--------------+--------------+--------------+
| 功能             | ELK Stack    | Datadog      | Grafana      | Splunk       |
|                  | （自建）      | (SaaS)       | Cloud (SaaS) | (SaaS/本地)  |
+------------------+--------------+--------------+--------------+--------------+
| 日志             | Elasticsearch| 原生         | Loki         | 原生         |
|                  | + Kibana     |              | + Grafana    |              |
+------------------+--------------+--------------+--------------+--------------+
| 指标             | 需额外添加   | 原生         | Mimir        | 附加组件     |
|                  | (Prometheus) |              | (Prometheus) | (ITSI)       |
+------------------+--------------+--------------+--------------+--------------+
| 追踪             | 需额外添加   | 原生 (APM)   | Tempo        | 附加组件     |
|                  | (Jaeger)     |              |              |              |
+------------------+--------------+--------------+--------------+--------------+
| 告警             | ElastAlert / | 原生         | Grafana      | 原生         |
|                  | Kibana alerts| (monitors)   | Alerting     |              |
+------------------+--------------+--------------+--------------+--------------+
| APM              | Elastic APM  | 原生         | Tempo + Pyro | Splunk APM   |
+------------------+--------------+--------------+--------------+--------------+
| 运维负担         | 非常高       | 无           | 低-中        | 中           |
+------------------+--------------+--------------+--------------+--------------+
| 100K 主机成本    | ~$1.1M/月    | ~$2.5M/月    | ~$800K/月    | ~$3M/月      |
|                  | （仅基础设施）| （全包）      | （全包）      | （全包）      |
+------------------+--------------+--------------+--------------+--------------+
| 所需团队         | 5-10 SRE     | 0-1 SRE      | 2-3 SRE      | 2-3 SRE      |
+------------------+--------------+--------------+--------------+--------------+
| 搜索性能         | 优秀         | 优秀         | 良好（Loki   | 优秀         |
|                  | （倒排       |              | 使用标签     |              |
|                  |  索引）      |              | 索引，非     |              |
|                  |              |              | 全文）       |              |
+------------------+--------------+--------------+--------------+--------------+
| 数据所有权       | 完全         | 供应商持有   | 完全（LGTM   | 供应商持有   |
|                  |              |              | 栈是开源的） |              |
+------------------+--------------+--------------+--------------+--------------+
| 供应商锁定       | 无           | 高           | 低           | 高           |
+------------------+--------------+--------------+--------------+--------------+
| 最适合           | 想要完全     | 各种规模，   | 注重成本     | 有充足       |
|                  | 控制权的     | 特别是中型   | 且拥有       | 预算的       |
|                  | 大型团队     | 初创公司     | k8s 原生     | 企业         |
|                  |              |              | 基础设施的   |              |
|                  |              |              | 团队         |              |
+------------------+--------------+--------------+--------------+--------------+
```

### 13.2 自建 vs 购买决策框架

```
  自建（自托管 ELK/LGTM 栈）适用于：
    + 拥有 5+ 名 SRE 可以管理平台
    + 数据主权/合规要求本地或特定云部署
    + 日志量超过 SaaS 成本阈值（通常 >50TB/天）
    + 需要对管道进行深度定制
    + 组织已经在大规模运行 Kubernetes

  购买（Datadog/Splunk/New Relic）适用于：
    + 工程团队较小（<50 名工程师）
    + 价值实现时间比成本更重要
    + 日志量在 10TB/天以下
    + 需要开箱即用的集成 APM + 日志 + 指标 + RUM
    + 值班团队不专注于可观测性基础设施

  混合方案（大规模下最常见）：
    + 指标：自建 Prometheus/Mimir（高量级，低成本）
    + 追踪：SaaS 或 Tempo（中等量级）
    + 日志：高量级服务自建，其余使用 SaaS
    + 告警：集中式 SaaS（PagerDuty/OpsGenie）
    + 仪表盘：Grafana（兼容任何后端）
```

---

## 14. 常见面试追问

### 14.1 如何处理日志激增

```
  场景：一次错误部署导致某服务日志量达到正常的 100 倍
  （100M/秒 -> 10B/秒）

  立即响应（自动化）：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. 检测（30 秒内）：                                                |
  |     - Kafka 消费者延迟告警触发                                       |
  |     - 日志摄入速率指标激增                                            |
  |     - 自适应采样自动启动                                              |
  |                                                                      |
  |  2. 动态采样（1 分钟内）：                                            |
  |     - 从元数据中识别出流量激增的服务                                   |
  |     - 降低该服务的采样率：100% -> 1%                                  |
  |     - 无论如何保留 100% 的 ERROR/FATAL                               |
  |     - 其他服务不受影响                                                |
  |                                                                      |
  |  3. 背压处理（2 分钟内）：                                            |
  |     - Kafka 缓冲区吸收突发流量（24 小时保留）                         |
  |     - Kafka 满时 Agent 侧磁盘缓冲                                    |
  |     - 熔断器丢弃最低优先级日志                                        |
  |                                                                      |
  |  4. 恢复（5 分钟内）：                                                |
  |     - 错误部署被回滚（或修复）                                        |
  |     - 日志量恢复正常                                                  |
  |     - Kafka 消费者延迟被消化                                          |
  |     - 采样率恢复正常                                                  |
  |                                                                      |
  +----------------------------------------------------------------------+

  设计考虑：
  - 绝不允许日志激增导致监控系统崩溃
  - 监控的监控（元监控）至关重要
  - 在摄入网关处按租户/服务进行速率限制
  - 高优先级（ERROR）和低优先级（DEBUG）使用独立的 Kafka Topic
```

### 14.2 使用日志/追踪/指标调试生产问题

```
  场景：用户在 14:00 UTC 报告"订单失败"

  逐步排查：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. 检查指标（30 秒）- "有多严重？"                                  |
  |     仪表盘：order-service SLO                                        |
  |     -> 错误率：23%（正常 0.1%）                                      |
  |     -> P99 延迟：12s（正常 200ms）                                   |
  |     -> 吞吐量：500 req/s（正常 2000 req/s）                          |
  |     -> 开始时间：13:47 UTC                                           |
  |                                                                      |
  |  2. 检查日志（1 分钟）- "什么错误？"                                 |
  |     查询：severity:ERROR AND service:order-service                   |
  |            AND timestamp:[13:45 TO 14:00]                            |
  |     -> 最多的错误："connection refused: payment-service:8080"        |
  |     -> 15 分钟内 4,500 次出现                                        |
  |     -> 关联：均来自 payment-service 依赖                              |
  |                                                                      |
  |  3. 转向 PAYMENT SERVICE 指标                                       |
  |     -> payment-service Pod：0/5 运行中（CrashLoopBackOff）           |
  |     -> 上次重启：13:46 UTC                                           |
  |     -> 部署：v2.4.1 在 13:45 UTC 部署                               |
  |                                                                      |
  |  4. 检查追踪（1 分钟）- "哪些请求受影响？"                           |
  |     查询：service:order-service AND status:ERROR                     |
  |     -> 追踪瀑布图显示：order-service -> payment-service 失败         |
  |     -> 所有到 payment-service 的 Span 状态：UNAVAILABLE              |
  |     -> 可见重试 Span（3 次重试，全部失败）                            |
  |                                                                      |
  |  5. 根因分析（2 分钟）                                               |
  |     payment-service 日志（崩溃前）：                                  |
  |     -> "FATAL: OOM Killed. Memory usage 4.2GB exceeded 4GB limit"   |
  |     -> v2.4.1 在连接池中引入了内存泄漏                               |
  |                                                                      |
  |  6. 解决                                                             |
  |     -> 将 payment-service 回滚到 v2.4.0                             |
  |     -> Pod 恢复，错误率降至正常                                      |
  |     -> 总解决时间：~5 分钟                                           |
  |                                                                      |
  +----------------------------------------------------------------------+

  关键洞察：三大支柱协同工作：
    指标 -> 检测（有问题发生）
    日志 -> 诊断（什么问题）
    追踪 -> 定位（请求流程中的哪个环节）
```

### 14.3 日志的 GDPR 合规

```
  日志数据的 GDPR 要求：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  1. PII 识别                                                         |
  |     可能包含 PII 的日志字段：                                         |
  |     - 消息正文（可能包含邮箱、姓名、IP）                              |
  |     - HTTP 请求 URL（可能包含带 PII 的查询参数）                      |
  |     - User-Agent（指纹识别）                                         |
  |     - 源 IP 地址（欧盟将 IP 视为 PII）                               |
  |     - 自定义属性（支付详情、地址）                                    |
  |                                                                      |
  |  2. PII 脱敏管道                                                     |
  |     在处理层实现（存储之前）：                                        |
  |                                                                      |
  |     输入：  "User alice@example.com failed login from 10.0.0.1"     |
  |     输出：  "User [REDACTED_EMAIL] failed login from [REDACTED_IP]" |
  |                                                                      |
  |     技术：                                                           |
  |     - 正则表达式匹配邮箱、身份证号、信用卡号                          |
  |     - 命名实体识别用于姓名和地址                                     |
  |     - IP 匿名化（末位八位归零：10.0.0.0）                            |
  |     - 令牌化（用可逆令牌替换 PII，                                   |
  |       授权访问时可还原）                                              |
  |                                                                      |
  |  3. 被遗忘权                                                         |
  |     挑战：日志是追加式的，删除代价高昂                                |
  |     解决方案：                                                       |
  |     a) 假名化：用 hash(user_id + salt) 替换 user_id                  |
  |        -> 要"遗忘"：轮换 salt（所有哈希变得不可关联）                 |
  |     b) 加密销毁：用每用户密钥加密 PII 字段                           |
  |        -> 要"遗忘"：删除加密密钥                                     |
  |     c) 保留限制：N 天后自动删除所有日志                               |
  |                                                                      |
  |  4. 数据驻留                                                         |
  |     - 欧盟用户日志必须保留在欧盟区域                                  |
  |     - 在收集 Agent 层面做路由决策                                     |
  |     - 每个区域独立的 Kafka 集群                                      |
  |     - 跨区域查询使用联邦（而非复制）                                  |
  |                                                                      |
  |  5. 审计追踪                                                         |
  |     - 记录对日志系统的每次查询                                        |
  |     - 谁访问了什么数据，何时，为什么                                  |
  |     - 防篡改的审计日志（追加式，独立存储）                             |
  |                                                                      |
  +----------------------------------------------------------------------+
```

### 14.4 实时异常检测

```
  可观测性中的异常检测方法：

  1. 统计方法（简单，对大多数情况有效）：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  移动平均 + 标准差：                                                  |
  |                                                                      |
  |  baseline = exponential_moving_average(metric, window=1h)            |
  |  stddev = rolling_stddev(metric, window=1h)                          |
  |  anomaly = abs(current - baseline) > 3 * stddev                     |
  |                                                                      |
  |  季节性感知（用于有日/周模式的指标）：                                  |
  |  expected = average_of_same_time_last_4_weeks(metric)                |
  |  deviation = (current - expected) / historical_stddev                |
  |  anomaly = abs(deviation) > threshold                                |
  |                                                                      |
  +----------------------------------------------------------------------+

  2. 基于机器学习的方法（用于复杂模式）：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  Isolation Forest：                                                  |
  |  - 无监督，适合多变量异常                                             |
  |  - 在正常数据上训练，标记异常值                                       |
  |  - 适用于基础设施指标                                                 |
  |                                                                      |
  |  LSTM Autoencoders：                                                 |
  |  - 学习时间序列中的时间模式                                           |
  |  - 重建误差表示异常                                                   |
  |  - 适合复杂的季节性                                                   |
  |                                                                      |
  |  日志聚类（drain 算法）：                                              |
  |  - 自动解析日志模板                                                   |
  |  - 检测新的/罕见的日志模式作为异常                                     |
  |  - "这条错误消息从未出现过"                                           |
  |                                                                      |
  +----------------------------------------------------------------------+

  3. 实际实现：
  +----------------------------------------------------------------------+
  |                                                                      |
  |  面试中建议推荐混合方法：                                              |
  |                                                                      |
  |  a) 已知故障模式使用简单阈值告警                                      |
  |     （错误率 > 5%，延迟 > 2s，磁盘 > 90%）                           |
  |                                                                      |
  |  b) 漂移检测使用统计异常检测                                          |
  |     （偏离 4 周基线 3 个标准差）                                      |
  |                                                                      |
  |  c) 复杂的多信号关联使用基于 ML 的检测                                |
  |     （仅在团队有 ML 专业知识时）                                      |
  |                                                                      |
  |  关键权衡：灵敏度 vs 误报                                             |
  |  - 太灵敏：告警疲劳，团队忽略告警                                     |
  |  - 太保守：遗漏真实事故                                               |
  |  - 解决方案：按指标调优，每月审查                                     |
  |                                                                      |
  +----------------------------------------------------------------------+
```

### 14.5 其他追问问题

```
问：如何处理多租户？
答：- 每条日志/指标/追踪上都有租户 ID（org_id）
   - 按租户分 Kafka Topic（或分区键 = org_id）
   - Elasticsearch：按租户分索引，或索引级 RBAC
   - 查询时过滤：始终附加 org_id 过滤条件
   - 按租户限速以防止嘈杂邻居
   - 按租户设置存储配额，超额计费

问：如何关联日志、指标和追踪？
答：- trace_id 将日志链接到追踪（在每条日志中注入 trace_id）
   - service + timestamp 将指标链接到日志（相同的 5 分钟窗口）
   - Exemplars：指标携带示例 trace_id 用于下钻
   - UI：点击指标峰值 -> 查看对应追踪 -> 查看日志

问：Elasticsearch 宕机时怎么办？
答：- Kafka 缓冲所有日志（24 小时保留）
   - 告警引擎查询指标（独立的 ClickHouse），不查 ES
   - ES 恢复：消费者从 Kafka offset 重放
   - 只要 Kafka 保留时间 > ES 恢复时间就不会丢数据
   - 元监控（监控的监控）使用独立的、
     更简单的系统（例如独立基础设施上的 Prometheus + Alertmanager）

问：如何处理日志的 Schema 演进？
答：- 动态字段使用 Elasticsearch "flattened" 类型
   - 关键字段（severity、service、trace_id）使用 Schema Registry
   - 处理管道将旧格式标准化为当前 Schema
   - 破坏性变更：写入新索引，别名指向两个索引
   - 永不删除字段；标记为弃用并停止填充

问：如何确保精确一次处理？
答：- Kafka 消费者 offset + 幂等写入
   - 每条日志事件有 ingestion_id（内容 + 时间戳的哈希）
   - Elasticsearch：使用 ingestion_id 作为文档 _id（upsert 语义）
   - ClickHouse：ReplacingMergeTree 在插入时去重
   - 权衡：精确一次代价高昂；至少一次 + 去重
     在大规模下更实际

问：如何处理跨多数据中心的日志搜索？
答：- 选项 1：查询联邦（将查询扇出到每个区域的 ES）
     优点：数据留在本地，对 GDPR 友好
     缺点：较慢（跨区域延迟），实现更复杂
   - 选项 2：将所有数据复制到中央集群
     优点：查询快速，实现简单
     缺点：昂贵，欧盟数据有 GDPR 问题
   - 选项 3：混合（元数据集中，原始数据留在本地）
     先查询元数据索引，然后从源区域获取原始日志
     速度、成本和合规的最佳平衡
```

---

## 总结：面试策略

在面试中设计分布式日志与监控系统时，围绕以下关键决策组织你的回答：

```
  1. 范围：什么信号？（日志、指标、追踪，还是全部？）
  2. 规模：多少数据？（粗略估算至关重要）
  3. 摄入：如何收集？（Agent -> 队列 -> 处理 -> 存储）
  4. 存储：放在哪里？（热/温/冷分层，TSDB vs 搜索索引）
  5. 查询：如何搜索？（全文 vs 基于标签，延迟要求）
  6. 告警：如何通知？（阈值 vs 异常，升级，疲劳）
  7. 成本：如何负担？（采样，压缩，分层，自建 vs 购买）

  45 分钟面试的时间分配：
    需求 + 规模估算：      8 分钟
    高层架构：             7 分钟
    深入探讨（选 2-3 个）：20 分钟
    权衡 + 追问：          10 分钟
```
