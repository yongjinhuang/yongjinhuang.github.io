# 设计 Event Sourcing 与 CQRS 系统

---

## 1. 需求澄清

### 功能需求

| #   | 需求                                         | 备注                                        |
| --- | -------------------------------------------- | ------------------------------------------- |
| 1   | 接受修改 aggregate 状态的 command            | CreateOrder, AddItem, PayOrder, CancelOrder |
| 2   | 将每个状态变更持久化为不可变 event           | Append-only event log                       |
| 3   | 通过重放 event 重建当前状态                  | 不直接存储可变状态                          |
| 4   | 从读优化的 projection 提供查询服务           | 独立的查询端 (CQRS)                         |
| 5   | 支持 event replay 来重建任意 projection      | 历史和新的 projection                       |
| 6   | 在 aggregate 级别执行 optimistic concurrency | 每个 aggregate 一个 version number          |
| 7   | 向下游消费者发布 event                       | Event streaming / pub-sub                   |
| 8   | 支持 snapshot 优化                           | 避免在大型 aggregate 上重放所有 event       |
| 9   | 通过 Saga 协调分布式事务                     | 长时间运行的 process manager                |
| 10  | 支持 event schema 演进                       | 向后兼容的 event 版本控制                   |

### 非功能需求

| #   | 需求                      | 目标                                   |
| --- | ------------------------- | -------------------------------------- |
| 1   | 写入延迟 (event append)   | < 10ms p99                             |
| 2   | 读取延迟 (projected view) | < 50ms p99                             |
| 3   | Event 吞吐量              | 100,000 events/sec                     |
| 4   | 持久性                    | 零 event 丢失 (at-least-once delivery) |
| 5   | 写侧一致性                | 强一致性 (每个 aggregate 线性化)       |
| 6   | 读侧一致性                | 最终一致性 (可接受读取延迟 < 1s)       |
| 7   | 可用性                    | 99.99% 正常运行时间                    |
| 8   | 可扩展性                  | 读侧水平扩展                           |
| 9   | 可审计性                  | 完整历史永久保留                       |
| 10  | 幂等性                    | 读侧 exactly-once event 处理           |

### 范围之外

- 跨 aggregate 事务（改用 Saga）
- 实时 UI 推送通知（独立关注点）
- 多区域 active-active 写入（在扩展章节中讨论）

---

### 规模估算

```
假设：
  - 每日 1000 万活跃用户
  - 平均每用户每天 50 个 command
  - 每个 event payload：平均约 1 KB

每日 event 量：
  10M * 50 = 5 亿 events/天
  500M / 86,400s = ~5,800 events/sec（平均）
  峰值因子 17x -> ~100,000 events/sec（峰值）

存储增长：
  5 亿 events/天 * 1KB = 500 GB/天
  1 年 = 500 GB * 365 = ~180 TB/年
  3x 副本 = ~540 TB/年

Snapshot 优化：
  每 100 个 event 创建一次 snapshot
  Snapshot 大小：~5KB
  500M / 100 = 500 万 snapshots/天 = 25 GB/天

Read model（projected view）：
  100 种 aggregate 类型 * 平均 1000 万活跃 aggregate = 10 亿行
  平均 read model 行：2KB -> 活跃 read model 约 2 TB

网络带宽（event 发布）：
  100,000 events/sec * 1KB = ~100 MB/s 出站到消费者
```

---

## 2. API 设计

### Command API（写侧）

所有 command 通过 Command Service 处理。每个 command 针对特定的 aggregate 实例。

```
POST /commands/orders
Content-Type: application/json

{
  "commandType": "CreateOrder",
  "aggregateId": "order-uuid-1234",       // 可选：缺失时由服务端生成
  "expectedVersion": -1,                  // -1 表示 aggregate 不能已存在
  "payload": {
    "customerId": "cust-5678",
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "req-abc",
    "causationId": null,
    "userId": "user-999",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

Response 202 Accepted:
{
  "aggregateId": "order-uuid-1234",
  "newVersion": 0,
  "eventId": "evt-aaa111"
}

Response 409 Conflict (optimistic concurrency 冲突):
{
  "error": "CONCURRENCY_CONFLICT",
  "currentVersion": 3,
  "expectedVersion": 2
}
```

```
POST /commands/orders/{aggregateId}/items
{
  "commandType": "AddItem",
  "expectedVersion": 0,
  "payload": {
    "productId": "prod-xyz",
    "quantity": 2,
    "unitPrice": 29.99
  }
}
```

```
POST /commands/orders/{aggregateId}/payment
{
  "commandType": "PayOrder",
  "expectedVersion": 3,
  "payload": {
    "paymentMethod": "CREDIT_CARD",
    "transactionId": "txn-888"
  }
}
```

```
DELETE /commands/orders/{aggregateId}
{
  "commandType": "CancelOrder",
  "expectedVersion": 4,
  "payload": {
    "reason": "CustomerRequest"
  }
}
```

### Query API（读侧）

查询直接命中 read model，查询时不进行 event 重建。

```
GET /queries/orders/{orderId}
Response 200:
{
  "orderId": "order-uuid-1234",
  "customerId": "cust-5678",
  "status": "PAID",
  "items": [...],
  "total": 59.98,
  "createdAt": "2024-01-15T10:30:00Z",
  "paidAt": "2024-01-15T10:35:00Z",
  "_version": 4,
  "_lastEventId": "evt-bbb222"
}
```

```
GET /queries/orders?customerId=cust-5678&status=PAID&page=1&limit=20
Response 200:
{
  "data": [...],
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

```
GET /queries/orders/{orderId}/history
Response 200:
{
  "aggregateId": "order-uuid-1234",
  "events": [
    { "version": 0, "type": "OrderCreated", "timestamp": "...", "payload": {...} },
    { "version": 1, "type": "ItemAdded", "timestamp": "...", "payload": {...} },
    { "version": 2, "type": "ItemAdded", "timestamp": "...", "payload": {...} },
    { "version": 3, "type": "OrderPaid", "timestamp": "...", "payload": {...} }
  ]
}
```

```
GET /queries/projections/{projectionName}/status
Response 200:
{
  "projectionName": "OrderSummaryProjection",
  "status": "RUNNING",
  "lastProcessedEventId": "evt-bbb222",
  "lastProcessedPosition": 98450231,
  "lag": 12,
  "lagMs": 450
}
```

---

## 3. 数据模型

### Event Store Schema

```sql
-- 核心 event store 表（append-only，绝不 UPDATE 或 DELETE）
CREATE TABLE events (
    -- 唯一 event 标识符（UUID v4 或 ULID）
    event_id        UUID            NOT NULL,

    -- Aggregate 标识
    aggregate_type  VARCHAR(100)    NOT NULL,  -- 例如 'Order', 'Account'
    aggregate_id    UUID            NOT NULL,

    -- 此 aggregate 内的序号（从 0 开始，单调递增）
    version         BIGINT          NOT NULL,

    -- Event 类型名称（用于反序列化）
    event_type      VARCHAR(200)    NOT NULL,  -- 例如 'OrderCreated', 'ItemAdded'

    -- Schema 版本用于 upcasting
    event_schema_version INT        NOT NULL DEFAULT 1,

    -- Event payload（JSON 或二进制）
    payload         JSONB           NOT NULL,

    -- 横切 metadata
    metadata        JSONB           NOT NULL,
    -- metadata 包含：correlationId, causationId, userId, ipAddress

    -- 全局排序位置（由 event store 分配，单调递增）
    global_position BIGSERIAL       NOT NULL,

    -- 挂钟时间（仅供参考，不用于排序）
    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- 确保每个 aggregate version 只有一个 event（防止重复）
    CONSTRAINT pk_events PRIMARY KEY (event_id),
    CONSTRAINT uq_aggregate_version UNIQUE (aggregate_type, aggregate_id, version)
);

-- 按 aggregate 高效重放
CREATE INDEX idx_events_aggregate
    ON events (aggregate_type, aggregate_id, version ASC);

-- 用于 projection 的全局有序重放
CREATE INDEX idx_events_global_position
    ON events (global_position ASC);

-- 按 event 类型高效查找（用于选择性 projection）
CREATE INDEX idx_events_type
    ON events (event_type, global_position ASC);
```

### Snapshot Schema

```sql
-- 用于 aggregate 状态优化的 Snapshot
CREATE TABLE snapshots (
    snapshot_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type  VARCHAR(100)    NOT NULL,
    aggregate_id    UUID            NOT NULL,

    -- 此 snapshot 代表的 version number
    version         BIGINT          NOT NULL,

    -- 序列化的 aggregate 状态
    state           JSONB           NOT NULL,

    -- Snapshot schema 版本用于迁移
    state_schema_version INT        NOT NULL DEFAULT 1,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_snapshots PRIMARY KEY (snapshot_id),
    CONSTRAINT uq_snapshot_version UNIQUE (aggregate_type, aggregate_id, version)
);

-- 获取某个 aggregate 的最新 snapshot
CREATE INDEX idx_snapshots_aggregate_version
    ON snapshots (aggregate_type, aggregate_id, version DESC);
```

### Read Model Projection Schema（订单摘要示例）

```sql
-- 订单摘要 read model（由 projection 构建，针对查询优化）
CREATE TABLE order_summary (
    order_id        UUID            PRIMARY KEY,
    customer_id     UUID            NOT NULL,
    status          VARCHAR(50)     NOT NULL,  -- CREATED, CONFIRMED, PAID, CANCELLED
    item_count      INT             NOT NULL DEFAULT 0,
    total_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    currency        CHAR(3)         NOT NULL,
    created_at      TIMESTAMPTZ,
    confirmed_at    TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancellation_reason VARCHAR(500),

    -- 跟踪构建此 projection 的最后 event version
    last_event_version BIGINT       NOT NULL,
    last_event_id   UUID            NOT NULL,

    -- 最后处理的 event 的全局位置（用于延迟跟踪）
    checkpoint_position BIGINT      NOT NULL
);

CREATE INDEX idx_order_summary_customer
    ON order_summary (customer_id, created_at DESC);

CREATE INDEX idx_order_summary_status
    ON order_summary (status, created_at DESC);

-- 订单项 read model（反规范化以提高查询性能）
CREATE TABLE order_items (
    order_id        UUID            NOT NULL,
    line_item_id    UUID            NOT NULL,
    product_id      UUID            NOT NULL,
    product_name    VARCHAR(500),
    quantity        INT             NOT NULL,
    unit_price      DECIMAL(10,2)   NOT NULL,
    line_total      DECIMAL(12,2)   NOT NULL,
    CONSTRAINT pk_order_items PRIMARY KEY (order_id, line_item_id)
);

-- Projection checkpoint 跟踪
CREATE TABLE projection_checkpoints (
    projection_name     VARCHAR(200)    PRIMARY KEY,
    last_position       BIGINT          NOT NULL DEFAULT 0,
    last_event_id       UUID,
    status              VARCHAR(50)     NOT NULL DEFAULT 'RUNNING',
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 具体 Event 示例

```json
// Event 1: OrderCreated (version 0)
{
  "event_id": "evt-aaa111",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 0,
  "event_type": "OrderCreated",
  "event_schema_version": 1,
  "payload": {
    "customerId": "cust-5678",
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "req-abc",
    "causationId": null,
    "userId": "user-999"
  },
  "global_position": 98450001,
  "occurred_at": "2024-01-15T10:30:00Z"
}

// Event 2: ItemAdded (version 1)
{
  "event_id": "evt-bbb222",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 1,
  "event_type": "ItemAdded",
  "event_schema_version": 1,
  "payload": {
    "lineItemId": "item-001",
    "productId": "prod-xyz",
    "quantity": 2,
    "unitPrice": 29.99
  },
  "metadata": { "correlationId": "req-def", "causationId": "evt-aaa111", "userId": "user-999" },
  "global_position": 98450002,
  "occurred_at": "2024-01-15T10:31:00Z"
}

// Event 3: ItemAdded (version 2)
{
  "event_id": "evt-ccc333",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 2,
  "event_type": "ItemAdded",
  "event_schema_version": 1,
  "payload": {
    "lineItemId": "item-002",
    "productId": "prod-abc",
    "quantity": 1,
    "unitPrice": 49.99
  },
  "metadata": { "correlationId": "req-ghi", "causationId": "evt-aaa111", "userId": "user-999" },
  "global_position": 98450003,
  "occurred_at": "2024-01-15T10:32:00Z"
}

// Event 4: OrderPaid (version 3)
{
  "event_id": "evt-ddd444",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 3,
  "event_type": "OrderPaid",
  "event_schema_version": 1,
  "payload": {
    "paymentMethod": "CREDIT_CARD",
    "transactionId": "txn-888",
    "amountPaid": 109.97
  },
  "metadata": { "correlationId": "req-jkl", "causationId": "evt-ccc333", "userId": "user-999" },
  "global_position": 98450010,
  "occurred_at": "2024-01-15T10:35:00Z"
}
```

---

## 4. 高层架构

### 整体系统架构

```
+------------------+      Commands      +------------------+
|                  | -----------------> |                  |
|   Client Apps    |                    |  Command Service  |
|  (Web / Mobile)  |                    |  (Write Side)    |
|                  | <----------------- |                  |
+------------------+    202 Accepted    +--------+---------+
         |                                       |
         |        Queries                        | Validate + Apply
         |                                       | Invariants
         v                                       v
+------------------+              +-----------------------------+
|                  |              |                             |
|   Query Service  |              |       Event Store           |
|  (Read Side)     |              |  (Append-Only Log)          |
|                  |              |  PostgreSQL / EventStoreDB  |
+--------+---------+              |  / Apache Kafka             |
         |                        +-------------+---------------+
         |                                      |
         v                                      | Events Published
+------------------+                            v
|  Read Models /   |           +----------------+----------------+
|  Projections     | <-------- |     Event Bus / Message Broker  |
|  (PostgreSQL /   |           |     (Kafka / RabbitMQ)          |
|   Redis /        |           +----------------+----------------+
|   Elasticsearch) |                            |
+------------------+                            |
                               +----------------+--------------+
                               |                               |
                    +----------+--------+          +-----------+---------+
                    |                   |          |                     |
                    |  Projection       |          |  Saga Coordinator   |
                    |  Builders         |          |  (Process Manager)  |
                    |  (Subscriptions)  |          |                     |
                    +-------------------+          +---------------------+
```

### Command 处理流程

```
Client                Command Service           Event Store           Event Bus
  |                         |                        |                    |
  |--[POST /commands/]----->|                        |                    |
  |                         |                        |                    |
  |                         |--[Load Snapshot]------>|                    |
  |                         |<--[Snapshot v=50]------|                    |
  |                         |                        |                    |
  |                         |--[Load Events v51+]--->|                    |
  |                         |<--[Events 51..55]------|                    |
  |                         |                        |                    |
  |                         |--[Reconstruct State]   |                    |
  |                         |  (apply events to      |                    |
  |                         |   snapshot)            |                    |
  |                         |                        |                    |
  |                         |--[Validate Command]    |                    |
  |                         |  (check invariants)    |                    |
  |                         |                        |                    |
  |                         |--[Append Event]------->|                    |
  |                         |  version=56            |                    |
  |                         |<--[OK, position=N]-----|                    |
  |                         |                        |                    |
  |                         |                        |--[Publish Event]-->|
  |                         |                        |                    |
  |<--[202 Accepted]--------|                        |                    |
  |   {version: 56}         |                        |                    |
```

### 读侧 / Projection 流程

```
Event Store          Event Bus           Projection Builder      Read Model DB
    |                    |                       |                     |
    |--[New Event]------>|                       |                     |
    |                    |--[Deliver to subs]--->|                     |
    |                    |                       |                     |
    |                    |                       |--[Load checkpoint]->|
    |                    |                       |<--[position=N-1]----|
    |                    |                       |                     |
    |                    |                       |--[Handle Event]-    |
    |                    |                       |  Update read model  |
    |                    |                       |--[Upsert rows]----->|
    |                    |                       |--[Save checkpoint]->|
    |                    |                       |<--[ACK]-------------|
    |                    |<--[ACK to bus]--------|                     |
```

---

## 5. 深入探讨

### 5.1 Event Sourcing 基础

Event Sourcing 是一种架构模式，aggregate 的状态完全由一系列 event 推导而来，而不是直接存储当前状态。

**核心原则：Event Log 就是唯一真相来源**

```
传统 CRUD：                          Event Sourcing：
+------------------+                 +----------------------------------+
| orders table     |                 | events table                     |
+------------------+                 +----------------------------------+
| id | status|total|                 | pos | type        | payload      |
|----|-------|-----|                 |-----|-------------|--------------|
| 1  | PAID  |110  |  <-- 当前状态   |  1  | OrderCreated| {cust:5678}  |
+------------------+                 |  2  | ItemAdded   | {qty:2,p:30} |
                                     |  3  | ItemAdded   | {qty:1,p:50} |
 历史：已丢失                         |  4  | OrderPaid   | {txn:888}    |
                                     +----------------------------------+
                                      当前状态 = 重放 event 的结果
```

**状态重建算法**

```python
def load_aggregate(aggregate_id: str) -> Order:
    # 步骤 1：尝试加载最新的 snapshot
    snapshot = snapshot_store.get_latest(aggregate_id)

    if snapshot:
        # 从 snapshot 状态开始
        order = Order.from_snapshot(snapshot.state)
        start_version = snapshot.version + 1
    else:
        # 从空状态开始
        order = Order()
        start_version = 0

    # 步骤 2：加载 snapshot 版本之后的 event
    events = event_store.load(
        aggregate_id=aggregate_id,
        from_version=start_version
    )

    # 步骤 3：按顺序应用每个 event
    for event in events:
        order.apply(event)

    return order

class Order:
    def apply(self, event: Event) -> None:
        # 分发到正确的 event handler
        handler_name = f"on_{event.event_type}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(event.payload)
        self.version = event.version

    def on_OrderCreated(self, payload):
        self.customer_id = payload['customerId']
        self.currency = payload['currency']
        self.status = 'CREATED'
        self.items = []
        self.total = 0

    def on_ItemAdded(self, payload):
        self.items.append({
            'line_item_id': payload['lineItemId'],
            'product_id': payload['productId'],
            'quantity': payload['quantity'],
            'unit_price': payload['unitPrice']
        })
        self.total += payload['quantity'] * payload['unitPrice']

    def on_OrderPaid(self, payload):
        self.status = 'PAID'
        self.transaction_id = payload['transactionId']
```

**Event Sourcing 的优势**

```
+----------------------------------+------------------------------------------+
| 优势                             | 说明                                     |
+----------------------------------+------------------------------------------+
| 完整审计追踪                     | 每个变更都记录了谁/何时                  |
| 时间旅行查询                     | 在任意时间点重建状态                     |
| 事件驱动集成                     | 向下游系统发布 event                     |
| 通过重放调试                     | 通过重放 event 流来复现 bug              |
| 按需新建 projection              | 从历史 event 构建新视图                  |
| 时间解耦                         | 消费者按自己的节奏处理                   |
+----------------------------------+------------------------------------------+
```

---

### 5.2 CQRS 模式：Command 端 vs Query 端

CQRS（Command Query Responsibility Segregation，命令查询职责分离）将写模型（command）与读模型（query）分离。这允许每一端独立优化。

```
+============================================================+
|                   CQRS 架构                                 |
+============================================================+

  写侧 (Command)                     读侧 (Query)
  +----------------------+          +----------------------+
  |                      |          |                      |
  |  Command Handlers    |          |  Query Handlers      |
  |  - 验证输入           |          |  - 无业务逻辑         |
  |  - 加载 aggregate    |          |  - 简单 DB 查询       |
  |  - 检查不变量         |          |  - 优化索引           |
  |  - 发出 event        |          |  - 缓存结果           |
  |                      |          |                      |
  +----------+-----------+          +----------+-----------+
             |                                 ^
             | Events                          | Read Model
             v                                 |
  +----------+-----------+          +----------+-----------+
  |                      |          |                      |
  |    Event Store       +--------->+  Projection Engine   |
  |  (唯一真相来源)       | Events   |  (Event Handlers)    |
  |                      |          |                      |
  +----------------------+          +----------+-----------+
                                               |
                                               | Upserts
                                               v
                                    +----------+-----------+
                                    |                      |
                                    |   Read Database      |
                                    |  (反规范化，           |
                                    |   查询优化)           |
                                    |                      |
                                    +----------------------+
```

**Command Model��为一致性而规范化）**

```
  Aggregate root 执行所有不变量。
  复杂对象图，但仅在处理 command 时查询。
  aggregate 内保证强一致性。
```

**Query Model（为性能而反规范化）**

```
  扁平的、查询优化的结构。
  同一数据的多个视图用于不同场景。
  最终一致性可接受（读取延迟通常 < 1s）。
  每个 projection 可以使用不同的数据库：
    - PostgreSQL 用于关系查询
    - Redis 用于计数器和排行榜
    - Elasticsearch 用于全文搜索
    - ClickHouse 用于分析
```

---

### 5.3 Event Store 设计

Event store 是最关键的组件。它必须提供：

```
需求：
  1. Append-only 写入（不更新，不删除）
  2. 每个 aggregate 的强排序（version number）
  3. 用于 projection 处理的全局排序
  4. Optimistic concurrency control（version 检查）
  5. 按 aggregate 高效范围读取
  6. 基于全局位置的 subscription 读取

技术选型：
  +---------------------+--------------------------------------------------+
  | EventStoreDB        | 专门构建，原生 event sourcing 支持                |
  | Apache Kafka        | 高吞吐量，按 aggregate 类型分区                   |
  | PostgreSQL          | 可靠，使用 UNIQUE 约束实现并发控制                |
  | DynamoDB            | Serverless，使用条件写入实现并发控制              |
  | Apache Cassandra    | 高写入吞吐量，最终一致性                          |
  +---------------------+--------------------------------------------------+
```

**使用 PostgreSQL 的 Optimistic Concurrency**

```sql
-- 带 version 检查的 event 追加（防止丢失更新）
INSERT INTO events (
    event_id, aggregate_type, aggregate_id,
    version, event_type, payload, metadata
)
VALUES (
    $1, $2, $3,
    (
        -- expected_version + 1 必须等于下一个可用版本
        SELECT COALESCE(MAX(version), -1) + 1
        FROM events
        WHERE aggregate_type = $2 AND aggregate_id = $3
        -- 如果返回的版本 != expected_version + 1，
        -- (aggregate_type, aggregate_id, version) 上的 UNIQUE 约束
        -- 将抛出冲突错误
    ),
    $4, $5, $6
)
ON CONFLICT ON CONSTRAINT uq_aggregate_version DO NOTHING
RETURNING version;

-- 如果返回 0 行 -> 并发冲突 -> 重试或失败
```

**EventStoreDB Append 模式**

```csharp
// EventStoreDB 原生客户端（C#）
var eventData = new EventData(
    Uuid.NewUuid(),
    "OrderCreated",
    JsonSerializer.SerializeToUtf8Bytes(payload),
    JsonSerializer.SerializeToUtf8Bytes(metadata)
);

// StreamRevision.None = 不能已存在
// StreamRevision.Any = 不进行并发检查
// new StreamRevision(5) = 期望版本为 5
await client.AppendToStreamAsync(
    streamName: $"Order-{orderId}",
    expectedRevision: new StreamRevision(expectedVersion),
    events: new[] { eventData }
);
```

---

### 5.4 Aggregate 模式

Aggregate 是作为单一单元处理的一组领域对象。Aggregate root 执行所有业务不变量。

```
+----------------------------------------+
|         Order Aggregate                |
|                                        |
|  Root: Order                           |
|  +----------------------------------+  |
|  | id: UUID                         |  |
|  | customerId: UUID                  |  |
|  | status: OrderStatus              |  |
|  | items: List<LineItem>            |  |
|  | version: int                     |  |
|  +----------------------------------+  |
|                                        |
|  Children: LineItem[]                  |
|  +----------------------------------+  |
|  | lineItemId: UUID                 |  |
|  | productId: UUID                  |  |
|  | quantity: int                    |  |
|  | unitPrice: decimal               |  |
|  +----------------------------------+  |
|                                        |
|  不变量：                               |
|  - 不能向已付款订单添加商品               |
|  - 不能为空订单付款                      |
|  - 总额必须等于各项之和                  |
|  - 不能取消已付款订单                    |
+----------------------------------------+
```

**Command Handler + Aggregate 模式**

```python
class OrderCommandHandler:
    def __init__(self, event_store, snapshot_store):
        self.event_store = event_store
        self.snapshot_store = snapshot_store

    def handle_add_item(self, command: AddItemCommand):
        # 1. 加载 aggregate（snapshot + events）
        order = self._load_order(command.aggregate_id)

        # 2. 验证预期版本（optimistic concurrency）
        if order.version != command.expected_version:
            raise ConcurrencyConflictError(order.version, command.expected_version)

        # 3. 执行业务逻辑（返回 event，不进行修改）
        new_events = order.add_item(
            product_id=command.product_id,
            quantity=command.quantity,
            unit_price=command.unit_price
        )

        # 4. 持久化 event
        self.event_store.append(
            aggregate_id=command.aggregate_id,
            events=new_events,
            expected_version=command.expected_version
        )

        # 5. 可能创建 snapshot
        if (order.version + len(new_events)) % SNAPSHOT_FREQUENCY == 0:
            final_state = order.apply_all(new_events)
            self.snapshot_store.save(final_state.to_snapshot())

class Order:
    def add_item(self, product_id, quantity, unit_price) -> List[Event]:
        # 守卫：在发出 event 之前执行不变量
        if self.status != OrderStatus.CREATED:
            raise InvalidOperationError(
                f"Cannot add items to order in status {self.status}"
            )
        if quantity <= 0:
            raise ValidationError("Quantity must be positive")

        # 返回 event（不立即应用）
        return [Event(
            event_type="ItemAdded",
            payload={
                "lineItemId": str(uuid4()),
                "productId": product_id,
                "quantity": quantity,
                "unitPrice": float(unit_price)
            }
        )]
```

---

### 5.5 Projection：构建读优化视图

Projection 是一个 event handler，消费 event 流并维护一个读优化视图。

```python
class OrderSummaryProjection:
    """
    订阅所有 Order event 并维护 order_summary 表。
    按 global_position 顺序处理 event。
    """

    HANDLED_EVENTS = {
        'OrderCreated', 'ItemAdded', 'OrderConfirmed',
        'OrderPaid', 'OrderCancelled'
    }

    def __init__(self, db, checkpoint_store):
        self.db = db
        self.checkpoint_store = checkpoint_store

    def run(self):
        checkpoint = self.checkpoint_store.get('OrderSummaryProjection')
        start_position = checkpoint.last_position + 1

        # 从 checkpoint 开始订阅 event 流
        for event in self.event_store.subscribe_from(start_position):
            if event.event_type in self.HANDLED_EVENTS:
                self._handle(event)
            self._save_checkpoint(event.global_position)

    def _handle(self, event: Event):
        handler = getattr(self, f'on_{event.event_type}', None)
        if handler:
            handler(event)

    def on_OrderCreated(self, event):
        self.db.execute("""
            INSERT INTO order_summary
                (order_id, customer_id, status, currency,
                 item_count, total_amount, created_at,
                 last_event_version, last_event_id, checkpoint_position)
            VALUES ($1, $2, 'CREATED', $3, 0, 0, $4, $5, $6, $7)
            ON CONFLICT (order_id) DO NOTHING
        """, [
            event.aggregate_id,
            event.payload['customerId'],
            event.payload['currency'],
            event.occurred_at,
            event.version,
            event.event_id,
            event.global_position
        ])

    def on_ItemAdded(self, event):
        self.db.execute("""
            UPDATE order_summary SET
                item_count = item_count + $2,
                total_amount = total_amount + ($3 * $4),
                last_event_version = $5,
                last_event_id = $6,
                checkpoint_position = $7
            WHERE order_id = $1
        """, [
            event.aggregate_id,
            event.payload['quantity'],
            event.payload['quantity'],
            event.payload['unitPrice'],
            event.version,
            event.event_id,
            event.global_position
        ])

    def on_OrderPaid(self, event):
        self.db.execute("""
            UPDATE order_summary SET
                status = 'PAID',
                paid_at = $2,
                last_event_version = $3,
                last_event_id = $4,
                checkpoint_position = $5
            WHERE order_id = $1
        """, [
            event.aggregate_id,
            event.occurred_at,
            event.version,
            event.event_id,
            event.global_position
        ])
```

**从同一 Event 流构建多个 Projection**

```
Event 流（全局顺序）：
  pos=1: OrderCreated (order-A)
  pos=2: ItemAdded (order-A)
  pos=3: OrderCreated (order-B)
  pos=4: OrderPaid (order-A)
  pos=5: ItemAdded (order-B)

Projection 1: OrderSummary       (checkpoint 在 pos=4)
  +-------------------+
  | order-A: PAID,$60 |
  | order-B: CREATED  |
  +-------------------+

Projection 2: CustomerOrderCount (checkpoint 在 pos=5)
  +--------------------+
  | cust-X: 2 orders   |
  +--------------------+

Projection 3: Analytics/Revenue  (checkpoint 在 pos=4)
  +---------------------+
  | Jan-2024: $60       |
  +---------------------+

每个 projection 拥有自己的 checkpoint 并独立处理。
```

---

### 5.6 Snapshot 优化

没有 snapshot 时，加载高版本 aggregate 需要从头重放所有 event。

```
不使用 SNAPSHOT（version=10,000）：
  从数据库加载 10,000 个 event -> 应用 10,000 个 event -> 当前状态
  成本：O(N)，其中 N = event 数量

使用 SNAPSHOT（snapshot 在 v=9,900，然后还有 100 个 event）：
  加载 1 个 snapshot + 100 个 event -> 应用 100 个 event -> 当前状态
  成本：O(S)，其中 S = snapshot 频率

SNAPSHOT 频率优化：
  +------------------+------------------+------------------+
  | 频率             | 节省的加载时间   | 存储开销         |
  +------------------+------------------+------------------+
  | 每 10 个 event   | 90%              | 高（大量 snap）  |
  | 每 100 个 event  | 99%              | 中等             |
  | 每 1000 个 event | 99.9%            | 低               |
  +------------------+------------------+------------------+
  建议：根据 aggregate 复杂度，每 100-500 个 event 创建一次
```

**Snapshot 创建策略**

```python
class SnapshotStrategy:
    SNAPSHOT_THRESHOLD = 100  # 每 100 个 event 创建 snapshot

    def should_snapshot(self, aggregate: Aggregate) -> bool:
        # 如果 version 跨过阈值边界则创建 snapshot
        return aggregate.version % self.SNAPSHOT_THRESHOLD == 0

    def create_snapshot(self, aggregate: Aggregate) -> Snapshot:
        return Snapshot(
            aggregate_type=aggregate.__class__.__name__,
            aggregate_id=aggregate.id,
            version=aggregate.version,
            state=aggregate.to_dict(),
            state_schema_version=aggregate.SCHEMA_VERSION
        )

class Order:
    SCHEMA_VERSION = 2  # 当状态结构变化时递增

    def to_dict(self) -> dict:
        return {
            'customerId': self.customer_id,
            'status': self.status.value,
            'currency': self.currency,
            'items': [item.to_dict() for item in self.items],
            'total': float(self.total)
        }

    @classmethod
    def from_snapshot(cls, snapshot: Snapshot) -> 'Order':
        # 如果 snapshot 是旧版本则处理 schema 迁移
        state = cls._migrate_snapshot(snapshot.state, snapshot.state_schema_version)
        order = cls()
        order.customer_id = state['customerId']
        order.status = OrderStatus(state['status'])
        order.currency = state['currency']
        order.items = [LineItem.from_dict(i) for i in state['items']]
        order.total = Decimal(str(state['total']))
        order.version = snapshot.version
        return order
```

---

### 5.7 最终一致性：Read Model 延迟

Read model 落后于 write model。这对大多数场景是可接受的，但需要谨慎处理。

```
时间线：
  T=0ms:  Command Service 收到 command
  T=5ms:  Event 追加到 Event Store
  T=5ms:  Event 发布到 Kafka
  T=10ms: Projection Builder 收到 event
  T=15ms: Projection Builder 更新 Read Model DB
  T=15ms: Read Model 现在是一致的

  客户端在 T=12ms 读取：
    -> 看到旧状态（read model 尚未更新）
    -> 这就是"最终一致性窗口"（典型值约 15ms）

处理读取延迟的策略：

1. Read Your Own Writes (RYOW)：
   - 在 command 响应中返回更新后的状态
   - 客户端使用返回的状态进行即时反馈
   - 避免立即查询 read model 的需要

2. Optimistic UI：
   - 客户端在本地应用预期变更
   - 在服务器确认时进行协调

3. 版本化读取：
   GET /queries/orders/{id}?minVersion=56
   -> Query service 等待直到 read model version >= 56
   -> 轮询或 server-sent events 来通知就绪

4. 显式一致性令牌：
   POST /commands/orders -> 返回 { eventId: "evt-xxx" }
   GET /queries/orders/{id}?afterEvent=evt-xxx
   -> 如果尚未一致则返回 202 和 Retry-After
```

---

### 5.8 Saga 模式：分布式事务协调

Saga 使用 event 在 aggregate 边界或服务之间协调多步骤业务流程。

```
+=========================================================+
|              订单履行 SAGA                                |
+=========================================================+

   OrderCreated
        |
        v
   [1. 预留库存]
        |
   +----+----+
   |         |
  成功      失败
   |         |
   v         v
[2. 扣款]  [补偿：取消订单]
   |
   +----+----+
   |         |
  成功      失败
   |         |
   v         v
[3. 发货]  [补偿：退款 + 释放库存]
   |
   v
[4. 完成]


SAGA 状态机：
  STARTED
    -> INVENTORY_RESERVED (收到 InventoryReserved)
    -> PAYMENT_CHARGED (收到 PaymentCharged)
    -> SHIPPED (收到 OrderShipped)
    -> COMPLETED (收到 ShipmentDelivered)

补偿状态（失败时）：
  INVENTORY_RESERVED -> CANCELLING -> CANCELLED
  PAYMENT_CHARGED -> REFUNDING -> INVENTORY_RELEASING -> CANCELLED
```

**Saga Coordinator 实现**

```python
class OrderFulfillmentSaga:
    """
    基于编排的 Saga：每个服务监听 event 并通过发布 command/event 来响应。

    基于编排的 Saga：中央协调器发送 command。
    """

    class State(Enum):
        STARTED = "STARTED"
        INVENTORY_RESERVED = "INVENTORY_RESERVED"
        PAYMENT_CHARGED = "PAYMENT_CHARGED"
        SHIPPED = "SHIPPED"
        COMPLETED = "COMPLETED"
        COMPENSATING = "COMPENSATING"
        FAILED = "FAILED"

    def handle_order_created(self, event):
        saga = self._create_saga(event.aggregate_id)
        # 向库存服务发送 command
        self.command_bus.send(ReserveInventoryCommand(
            saga_id=saga.id,
            order_id=event.aggregate_id,
            items=event.payload['items']
        ))
        self._transition(saga, self.State.STARTED)

    def handle_inventory_reserved(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        if saga.state != self.State.STARTED:
            return  # 幂等：已处理

        self.command_bus.send(ChargePaymentCommand(
            saga_id=saga.id,
            order_id=saga.order_id,
            amount=event.payload['totalAmount']
        ))
        self._transition(saga, self.State.INVENTORY_RESERVED)

    def handle_inventory_reservation_failed(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        # 补偿：取消订单
        self.command_bus.send(CancelOrderCommand(
            order_id=saga.order_id,
            reason="InventoryUnavailable"
        ))
        self._transition(saga, self.State.FAILED)

    def handle_payment_failed(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        # 补偿：释放已预留的库存
        self.command_bus.send(ReleaseInventoryCommand(
            saga_id=saga.id,
            order_id=saga.order_id
        ))
        self._transition(saga, self.State.COMPENSATING)
```

---

### 5.9 Event Schema 演进：版本控制与 Upcasting

Event 是不可变的。当 schema 变更时，必须将旧 event upcast 为新格式。

```
问题：Event schema 随时间变化

  OrderCreated v1（旧）：             OrderCreated v2（新）：
  {                                     {
    "customerId": "cust-5678",             "customerId": "cust-5678",
    "currency": "USD"                      "currency": "USD",
  }                                        "deliveryAddress": {     <- 新字段
                                             "street": null,        <- 可选，
                                             "city": null           <- 向后兼容
                                           }
                                         }

UPCASTER 链：
  从 store 读取 event
        |
        v
  +------------------+
  | 是 schema v1?    |--是--> Upcast 到 v2 -> Upcast 到 v3 -> 当前版本
  +------------------+
        |
       否
        v
  +------------------+
  | 是 schema v2?    |--是--> Upcast 到 v3 -> 当前版本
  +------------------+
        |
       否
        v
  已是当前版本 -> 直接使用
```

**Upcaster 实现**

```python
class EventUpcasterChain:
    """
    用于 event 迁移的责任链模式。
    Event 在读取时惰性 upcast，不是急切地重写。
    """
    def __init__(self):
        self.upcasters: Dict[str, List[Upcaster]] = {}

    def register(self, event_type: str, from_version: int, upcaster: Callable):
        key = f"{event_type}:v{from_version}"
        self.upcasters.setdefault(key, []).append(upcaster)

    def upcast(self, event: RawEvent) -> Event:
        current_version = event.schema_version
        payload = event.payload

        while True:
            key = f"{event.event_type}:v{current_version}"
            upcasters = self.upcasters.get(key, [])
            if not upcasters:
                break
            for upcaster in upcasters:
                payload = upcaster(payload)
            current_version += 1

        return Event(
            event_id=event.event_id,
            event_type=event.event_type,
            schema_version=current_version,
            payload=payload
        )

# 注册 upcaster
chain = EventUpcasterChain()

def upcast_order_created_v1_to_v2(payload: dict) -> dict:
    """添加 deliveryAddress 字段（可选，默认为 None）"""
    return {
        **payload,
        "deliveryAddress": payload.get("deliveryAddress", {
            "street": None,
            "city": None,
            "country": None
        })
    }

chain.register("OrderCreated", from_version=1, upcaster=upcast_order_created_v1_to_v2)

def upcast_order_created_v2_to_v3(payload: dict) -> dict:
    """将 name 拆分为 firstName/lastName"""
    full_name = payload.pop("customerName", "")
    parts = full_name.split(" ", 1)
    return {
        **payload,
        "customerFirstName": parts[0] if parts else "",
        "customerLastName": parts[1] if len(parts) > 1 else ""
    }

chain.register("OrderCreated", from_version=2, upcaster=upcast_order_created_v2_to_v3)
```

**Event 版本控制策略**

```
策略 1：弱 Schema（不需要 upcasting）
  - event payload 中所有字段均为可选
  - 消费者优雅地处理缺失字段
  - 简单但可能隐藏错误

策略 2：Upcasting（推荐）
  - 旧 event 在读取时在内存中 upcast
  - 新字段以默认值添加
  - 旧 schema 版本在存储中保留

策略 3：Event 迁移（开销大）
  - 用新 schema 重写旧 event
  - 违反不可变性原则
  - 仅用于关键 bug 修复

策略 4：并行 Event 类型
  - 引入 OrderCreatedV2 event 类型
  - 两种 projection 都处理两种类型
  - 干净的分界但代码重复
```

---

### 5.10 幂等 Event 处理

读侧的 exactly-once 处理保证。

```
问题：At-least-once delivery 意味着 event 可能被多次投递。
  Event 在 T=0 发布
  Projection 在 T=5ms 处理，保存 checkpoint 前崩溃
  Event 在 T=10ms 被重新投递
  Projection 再次处理 -> 重复！

  如果 on_ItemAdded 递增计数器，我们会得到双倍递增！

解决方案 1：通过 last_event_id 实现幂等

  处理 event 前：
    检查 event_id 是否已处理（通过 last_event_id 列）
    如果已处理：跳过（幂等）
    如果未处理：原子性地更新 read model + 更新 checkpoint

  def handle_event_idempotently(event):
      existing = db.query("SELECT last_event_id FROM order_summary WHERE order_id = ?", [order_id])
      if existing and existing.last_event_id == event.event_id:
          return  # 已处理，跳过

      db.execute("UPDATE order_summary SET ..., last_event_id = ? WHERE order_id = ?",
                 [event.event_id, order_id])

解决方案 2：数据库级幂等（使用 UPSERT）

  def on_ItemAdded(event):
      # 使用 event_id 作为幂等键
      db.execute("""
          INSERT INTO order_items (order_id, line_item_id, ...)
          VALUES (?, ?, ...)
          ON CONFLICT (order_id, line_item_id) DO NOTHING
      """, [...])  -- 幂等：第二次 insert 被忽略

解决方案 3：Transactional outbox（用于 event 发布）

  写侧原子性操作：
    BEGIN TRANSACTION
      INSERT INTO events (...)        -- 追加 event 到 event store
      INSERT INTO outbox (event_id)   -- 标记为待发布
    COMMIT

  Outbox 轮询器：
    SELECT * FROM outbox WHERE published = FALSE ORDER BY id
    将每个 event 发布到 Kafka
    UPDATE outbox SET published = TRUE WHERE event_id = ?
```

---

### 5.11 Event Replay：重建 Projection

Event Sourcing 最强大的特性之一是能够通过重放 event 来重建任何 projection。

```
REPLAY 的使用场景：
  1. 新 projection（例如从第一天数据创建新的分析视图）
  2. Projection 代码 bug 修复 -> 从头重建
  3. 时间旅行调试：T=2024-01-01 时的状态是什么？
  4. 对不同 projection 算法进行 A/B 测试
  5. 灾难恢复：从 event log 重建 read model

REPLAY 策略：

策略 A：就地重建（可接受停机）
  1. 停止 projection 消费者
  2. 截断 read model 表
  3. 从 position 0 重放所有 event
  4. 在最新位置重启消费者
  5. 总停机时间 = 重放时长

策略 B：蓝绿 projection（零停机）
  1. 创建新的"影子" projection 表
  2. 将所有 event 重放到影子表中
  3. 追上后，原子切换（RENAME TABLE）
  4. 删除旧表
  5. 零停机

  +------------------+     replay      +---------------------+
  | order_summary    |  <-- 仍在线     | order_summary_new   |
  | (生产)           |                 | (影子，重建中)       |
  +------------------+                 +---------------------+
          |                                      |
          |     追上后切换                        |
          +<-------------------------------------+

策略 C：版本化 projection
  CREATE TABLE order_summary_v2 (...)  -- 新 schema
  重放到 v2 中，同时 v1 继续服务流量
  切换 query service 使用 v2
  删除 v1

时间旅行查询：
  def state_at(aggregate_id: str, timestamp: datetime) -> Order:
      events = event_store.load(
          aggregate_id=aggregate_id,
          until_timestamp=timestamp  -- 在此时间点停止重放
      )
      order = Order()
      for event in events:
          order.apply(event)
      return order
```

---

### 5.12 对比：Event Sourcing vs 传统 CRUD

```
+----------------------+---------------------------+---------------------------+
| 维度                 | 传统 CRUD                 | Event Sourcing            |
+----------------------+---------------------------+---------------------------+
| 存储模型             | 仅当前状态                | 完整 event 历史           |
| 存储成本             | 低（当前状态）            | 高（随历史增长）          |
| 可审计性             | 需要审计日志表            | 内置，完整                |
| 时间旅行查询         | 不可能（数据已丢失）      | 原生支持                  |
| 查询灵活性           | 高（SQL join）            | 写侧有限                  |
| 读性能               | 快（直接查询）            | 使用 projection 时快      |
| 写性能               | 快（单次 UPDATE）         | 快（仅 INSERT）           |
| 复杂度               | 低                        | 高                        |
| 调试                 | 难（仅当前状态）          | 易（完整 event 历史）     |
| 集成                 | 时间点快照                | 事件驱动，实时            |
| Schema 迁移          | ALTER TABLE               | Event upcasting           |
| 并发控制             | 悲观/乐观                 | 乐观（version）           |
| 业务对齐             | 以表为中心                | 以领域 event 为中心       |
| 团队学习曲线         | 低                        | 高                        |
+----------------------+---------------------------+---------------------------+
```

---

### 5.13 何时不应使用 Event Sourcing

Event Sourcing 增加了显著的复杂度。在以下情况下避免使用：

```
红色信号（不要使用 Event Sourcing）：
  1. 没有审计需求的简单 CRUD 应用
     -> 博客文章编辑器不需要 event 历史

  2. 没有业务含义的高频状态更新
     -> 每秒更新一次 GPS 位置 -> 只存储最后已知位置

  3. 大对象存储
     -> 将文件内容存储为 event 不切实际

  4. 团队不熟悉 DDD/ES 概念
     -> 学习曲线陡峭；错误的实现会导致严重 bug

  5. 复杂 join 的查询密集型系统
     -> 使用良好索引的传统关系数据库可能更简单

  6. 短生命周期数据（基于 TTL）
     -> 会话数据、临时缓存 -> 使用 Redis

  7. 要求删除数据的监管要求（GDPR）
     -> 不可变日志使"被遗忘权"变得复杂
     -> 解决方案：crypto-shredding（加密 PII，删除加密密钥）

绿色信号（使用 Event Sourcing）：
  1. 审计追踪是业务需求（金融、医疗、法律）
  2. 需要回滚/补偿的复杂业务工作流
  3. 微服务之间的事件驱动集成
  4. 需要重建 projection（分析、报告灵活性）
  5. 时间查询（给定时间点的状态）
  6. 高写入吞吐量（append-only 速度快）
  7. 协作编辑（基于 event 的操作变换）
```

---

### 5.14 领域驱动设计 (DDD) 的关联

Event Sourcing 和 CQRS 自然适配 DDD 的构建模块。

```
DDD 构建模块与 EVENT SOURCING 的映射：
+-------------------+------------------------------------------------------+
| DDD 概念          | Event Sourcing 中的角色                               |
+-------------------+------------------------------------------------------+
| Bounded Context   | 服务边界；拥有自己的 event store / schema             |
| Aggregate         | 一致性边界；发出 domain event                        |
| Domain Event      | 存储在 event log 中的 event                          |
| Value Object      | event payload 中的不可变数据                         |
| Repository        | 被 event-sourced aggregate repository 替代           |
| Application Svc   | Command handler；编排 aggregate + event store        |
| Domain Service    | 跨 aggregate 的复杂领域逻辑                          |
| Anti-Corruption   | 在 bounded context 之间转换 event                    |
| Layer (ACL)       |                                                      |
+-------------------+------------------------------------------------------+

BOUNDED CONTEXT 示例：
  Order Bounded Context 发出：      -> OrderConfirmed（包含订单项）
  Inventory Bounded Context：       <- 监听，预留库存
  Fulfillment Bounded Context：     <- 监听 InventoryReserved，发货

  跨 context 边界的 event 通过 integration event 传递
  （可能会被重命名/转换以匹配每个 context 的通用语言）

  +-------------------+   OrderConfirmed    +---------------------+
  |  Order Context    | ------------------> |  Inventory Context  |
  |                   |                     |  (看到：来自 Order   |
  |  Order aggregate  |                     |   的 StockReserve   |
  +-------------------+                     |   Request)          |
                                            +---------------------+
                                                     |
                                             StockReserved
                                                     v
                                            +---------------------+
                                            |  Fulfillment Context|
                                            +---------------------+
```

---

## 6. 扩展策略

### Event Store 分区

```
KAFKA 支持的 EVENT STORE 分区策略：

  分区键 = aggregate_id
  -> 同一 aggregate 的所有 event 进入同一分区
  -> 分区内保证顺序
  -> 不同 aggregate 可以并行处理

  +------------------+  Partition 0: order-A, order-D, order-G
  | Kafka Topic:     |  Partition 1: order-B, order-E, order-H
  | "order-events"   |  Partition 2: order-C, order-F, order-I
  +------------------+

  消费者：
    Projection Builder 0 -> 读取 partition 0
    Projection Builder 1 -> 读取 partition 1
    Projection Builder 2 -> 读取 partition 2

  扩展：添加 partition + projection builder 实例
  限制：重新分区需要重新处理（蓝绿方式）

EVENTSTORE DB 集群：
  Leader：处理所有写入（追加 event）
  Follower：复制 event，提供 subscription 读取
  Read replica：为 projection 提供全局位置 subscription

  +----------+    Raft consensus    +----------+
  |  Leader  | <------------------> | Follower |
  |  (writes)|                      | (reads)  |
  +----------+                      +----------+
       |                                  |
       | Replication                      |
       v                                  v
  +----------+                      +----------+
  | Follower |                      | Follower |
  | (reads)  |                      | (reads)  |
  +----------+                      +----------+
```

### 读副本扩展

```
读侧扩展：
  Projection 写入 PostgreSQL 主节点
  多个读副本服务查询流量

  +------------------+
  | Projection Builder|
  +--------+---------+
           |  WRITE
           v
  +------------------+     异步复制
  | PostgreSQL Primary| -------------------> +------------------+
  +------------------+                       | Read Replica 1   |
                                             +------------------+
                           异步复制
                        -------------------> +------------------+
                                             | Read Replica 2   |
                                             +------------------+

  Query Service 将读取路由到副本（轮询或按区域）

REDIS 缓存层：
  频繁访问的 aggregate 缓存在 Redis 中
  缓存键："order:{order_id}:summary"
  TTL：60 秒（可接受的陈旧度）
  Projection 更新时使缓存失效

  查询流程：
    1. 检查 Redis 缓存 -> 命中：返回缓存
    2. 未命中：查询 PostgreSQL 副本
    3. 填充 Redis 缓存
    4. 返回结果

ELASTICSEARCH 全文搜索：
  OrderSearchProjection 写入 Elasticsearch 索引
  支持：订单备注、客户名称的全文搜索
  独立于事务性 read model 进行扩展
```

### 写侧扩展

```
COMMAND 端扩展：
  无状态 command handler -> 可水平扩展
  Event store 是瓶颈 -> 优化它

  +---------------+   +---------------+   +---------------+
  | Command Svc 1 |   | Command Svc 2 |   | Command Svc 3 |
  +-------+-------+   +-------+-------+   +-------+-------+
          |                   |                   |
          +-------------------+-------------------+
                              |
                              v
                   +----------+-----------+
                   |    Event Store       |
                   |  (Leader：所有写入)   |
                   +----------------------+

  负载均衡器将 command 分发到各 Command Service 实例。
  每个实例独立加载 aggregate、验证、追加 event。
  Optimistic concurrency 防止冲突（在 409 Conflict 时重试）。

按 AGGREGATE 类型分片：
  OrderEventStore -> 处理 Order aggregate
  InventoryEventStore -> 处理 Product/Stock aggregate
  AccountEventStore -> 处理 Account aggregate

  每个 event store 可以独立调整大小和扩展。
```

---

## 7. 真实案例

### 银行账本（经典 Event Sourcing 用例）

```
Account Aggregate Event：
  AccountOpened       -> { accountId, customerId, currency, initialBalance }
  MoneyDeposited      -> { amount, transactionId, description }
  MoneyWithdrawn      -> { amount, transactionId, description }
  MoneyTransferred    -> { amount, toAccountId, transactionId }
  AccountFrozen       -> { reason, frozenBy }
  AccountClosed       -> { reason, finalBalance }

当前余额 = 所有存款/转入 event 之和
          - 所有取款/转出 event 之和

关键属性：
  - 不能删除或修改 event（监管要求）
  - 审计追踪完整且不可变
  - 可在任意时间点重建（用于争议处理）
  - 每 1000 个 event 创建 snapshot（典型账户有大量交易）

合规性：
  - Event log 满足 SOX 审计要求
  - 没有"魔法"余额更新；每一分钱都有据可查
  - 监管机构可以追溯任何余额到其源 event
```

### 电商订单管理

```
订单生命周期 Event：
  OrderCreated        -> 客户下单
  ItemAdded           -> 商品项添加到购物车
  ItemRemoved         -> 客户移除商品
  CouponApplied       -> 应用折扣
  OrderConfirmed      -> 库存预留，支付授权
  PaymentCharged      -> 支付扣款
  OrderShipped        -> 履行合作伙伴发货
  ShipmentDelivered   -> 客户收到订单
  ReturnInitiated     -> 客户发起退货
  RefundIssued        -> 支付退款

READ MODEL：
  - OrderSummary：状态、总额、商品（客户门户）
  - OrdersByCustomer：列表视图（客户历史）
  - OrderFulfillmentView：拣货单（仓库）
  - OrderAnalytics：每日营收（ClickHouse）
  - SupportView：完整 event 历史及 metadata（客服团队）
```

### 审计与合规系统

```
任何需要完整审计追踪的业务实体：
  - 用户账户变更（安全审计）
  - 人力资源记录（合规）
  - 医疗记录（HIPAA）
  - 配置变更（SOC2）

UserAccountEvent：
  UserRegistered    -> 初始注册
  EmailChanged      -> 审计：谁更改的、何时、从哪里
  PasswordChanged   -> 安全审计
  RoleGranted       -> 谁授予了哪个角色
  RoleRevoked       -> 权限缩减审计
  LoginSucceeded    -> 访问审计
  LoginFailed       -> 安全事件追踪
  AccountLocked     -> 安全响应
  AccountDeleted    -> Crypto-shredding：删除 PII 的加密密钥

GDPR / 被遗忘权：
  解决方案：Crypto-shredding
  - event 中的 PII 字段使用每用户密钥加密
  - 加密密钥单独存储（KMS）
  - 收到删除请求时：删除加密密钥
  - Event 保留（不可变）但 PII 变为不可读的乱码
```

---

## 8. 权衡与反模式

### 权衡

```
+---------------------------+---------------------------+---------------------------+
| 关注点                    | 优势                      | 成本                      |
+---------------------------+---------------------------+---------------------------+
| 存储                      | 完整历史                  | 无限增长                  |
| 一致性                    | 写侧强一致               | 读侧最终一致              |
| 查询                      | 灵活（新 projection）     | 复杂的 projection 管理    |
| 调试                      | 完整 event 重放           | 需要复杂工具              |
| 集成                      | 天然事件驱动              | Schema 演进负担           |
| 并发                      | Optimistic locking        | 需要重试逻辑              |
| 团队复杂度                | DDD 对齐                  | 学习曲线高                |
| 测试                      | 确定性重放                | 更多测试场景              |
+---------------------------+---------------------------+---------------------------+
```

### 应避免的反模式

```
反模式 1：将状态变更而非 domain event 存储为 event
  错误："OrderStatusChangedToPaid"  -- 技术变更，不是领域概念
  正确："OrderPaid"                -- 业务领域 event

反模式 2：过大的 event payload
  错误：在 ItemAdded event 中包含整个产品目录
  正确：只包含变化的内容：productId, quantity, unitPrice
  规则：Event 应包含重建状态变更所需的最少数据

反模式 3：直接查询 event store 进行读取
  错误：SELECT SUM(payload->>'amount') FROM events WHERE event_type='MoneyDeposited'
  正确：使用 projection 维护预计算的 read model
  原因：Event store 针对 append/replay 优化，不适合聚合查询

反模式 4：跨多个 aggregate root 的 aggregate
  错误：OrderAggregate 直接修改 InventoryAggregate
  正确：OrderAggregate 发出 OrderConfirmed，Inventory saga 处理预留
  原因：跨 aggregate 事务破坏一致性边界

反模式 5：在 projection 中放置业务逻辑
  错误：Projection 根据复杂规则计算折扣
  正确：折扣在 aggregate 中计算，存储在 event payload 中
  原因：Projection 是简单的 event handler，不是业务逻辑

反模式 6：未优雅处理 projection 失败
  错误：Projection 崩溃，丢失 checkpoint，从头重放
  正确：幂等 projection handler，持久 checkpoint 存储
  结果：可以安全地多次重放 event

反模式 7：忽略全局级别的 event 排序
  错误：两个 projection 消费 Kafka 时使用不同的 partition 分配
  正确：设计 projection 在时间窗口内对顺序不敏感，
        或为每种 event 类型使用单个有序 partition

反模式 8：不搭配 CQRS 使用 Event Sourcing
  Event-sourced 状态重建对读取来说开销大。
  始终搭配 CQRS 来维护独立的 read model。

反模式 9：可变 event（"软删除"）
  错误：UPDATE events SET payload = '...' WHERE event_id = '...'
  正确：追加一个修正 event（OrderItemQuantityCorrected）
  原因：Event 是唯一真相来源；修改它们会破坏历史

反模式 10：拥有数千个 event 且没有 snapshot 的 aggregate
  错误：加载拥有 50,000 笔交易的 BankAccount 需要重放全部 50,000 个 event
  正确：每 100 个 event 创建 snapshot；仅从 snapshot 加载最近的 event
```

---

## 9. 常见面试追问

### 问：如何处理 projection 中的 bug 导致 read model 损坏？

```
回答：
  1. 停止有 bug 的 projection 消费者
  2. 确定 bug 引入的位置
  3. 修复 projection 代码
  4. 创建新的"影子" read model 表
  5. 从 position 0 将所有 event 重放到影子表中
  6. 影子表追上生产后，原子切换
  7. 重启消费者指向新表

  Event Sourcing 的美妙之处：event log 不变。
  我们总是可以从头重建任何 projection。
```

### 问：如何实现"读自己的写"一致性？

```
回答：
  方案 1：在 command 响应中返回更新后的状态
    Command handler 在 event 追加后重建最终状态
    客户端直接使用返回的状态（不需要查询）

  方案 2：一致性令牌
    Command 返回：{ eventId: "evt-xxx", position: 98450010 }
    查询：GET /orders/{id}?afterPosition=98450010
    Query service 轮询直到 projection checkpoint >= 98450010
    或使用 websocket/SSE 在就绪时通知

  方案 3：版本化读取
    客户端存储从 command 响应获得的最后已知版本
    查询：GET /orders/{id}?minVersion=56
    如果 read model 版本 < 56，query service 返回 202
    客户端使用指数退避重试
```

### 问：如何处理 aggregate 加载时的"惊群效应"？

```
回答：
  当许多并发 command 针对同一 aggregate 时：
  1. 请求合并：去重并发加载
  2. Aggregate 缓存：在内存中保留最近使用的 aggregate（带 TTL）
  3. 每个 aggregate 的 command 队列：为热点 aggregate 序列化 command
  4. 按 aggregate_id 将 aggregate 分片到 command service 实例

  热点 aggregate 模式（例如共享购物车）：
  -> 考虑它是否真的是一个 aggregate 还是应该拆分
  -> 使用最终一致性（例如库存使用预留窗口）
```

### 问：如何处理不可变 event 的 GDPR 被遗忘权？

```
回答：Crypto-shredding
  1. 使用每用户密钥加密 event payload 中的所有 PII 字段
     { "customerName": encrypt("John Doe", key=user_encryption_key) }

  2. 将加密密钥存储在单独的 KMS（密钥管理服务）中
     表：user_encryption_keys (user_id, encryption_key, created_at)

  3. 收到 GDPR 删除请求时：
     DELETE FROM user_encryption_keys WHERE user_id = ?

  4. 旧 event 保留在 event store 中（不可变），但所有 PII
     字段现在是用已删除密钥加密的 -> 不可读的乱码

  5. 包含 PII 的 read model 正常更新（删除行）

  替代方案：将 PII 存储在单独的"个人数据存储"中，以 userId 为键，
  event 中仅引用 userId。删除时，删除 PII 存储。
```

### 问：Event Sourcing 和 Change Data Capture 有什么区别？

```
回答：
  +------------------+---------------------------+---------------------------+
  | 维度             | Event Sourcing            | Change Data Capture (CDC) |
  +------------------+---------------------------+---------------------------+
  | 意图             | Domain event 作为真相      | 技术性 DB 变更            |
  | 粒度             | 业务领域 event             | 行级 DB 变更              |
  | 语义             | 丰富的领域含义             | 底层（INSERT/UPDATE）     |
  | Schema           | 为消费者设计               | 镜像 DB schema            |
  | 存储             | Event store（主要）        | DB 是主要的，CDC 是       |
  |                  |                           | 次要的（Debezium）        |
  | 使用场景         | 新系统，DDD               | 遗留系统迁移，复制        |
  +------------------+---------------------------+---------------------------+

  CDC（例如 Debezium）适用于将现有 CRUD 系统迁移到
  事件驱动架构，而无需完全采用 Event Sourcing。
```

### 问：如何测试 Event Sourcing 系统？

```
回答：
  单元测试（aggregate 行为）：
    Given：[过去的 event 列表]
    When：[command]
    Then：[发出的新 event 列表]

    def test_cannot_pay_empty_order():
        order = Order()
        order.apply(OrderCreated(customerId="cust-1"))
        # 没有添加商品

        with pytest.raises(InvalidOperationError):
            order.pay(paymentMethod="CREDIT_CARD")

  Projection 测试：
    Given：[event 列表]
    When：projection 处理 event
    Then：read model 包含预期状态

    def test_order_summary_shows_paid_after_payment():
        projection = OrderSummaryProjection(test_db)
        projection.on_OrderCreated(mock_event("OrderCreated", {...}))
        projection.on_OrderPaid(mock_event("OrderPaid", {...}))

        result = test_db.query("SELECT status FROM order_summary WHERE order_id = ?")
        assert result.status == "PAID"

  Saga 测试：
    Given：初始 saga 状态
    When：[触发 event]
    Then：[预期发送的 command] + [新 saga 状态]

  集成测试：
    发送 command -> 验证 event 已追加 -> 验证 projection 已更新
    使用内存或测试范围的 event store
```

### 问：Axon Framework 如何实现 Event Sourcing 和 CQRS？

```
回答：Axon Framework（Java）提供：

  @Aggregate
  public class OrderAggregate {
      @AggregateIdentifier
      private String orderId;
      private OrderStatus status;

      @CommandHandler
      public OrderAggregate(CreateOrderCommand cmd) {
          // 验证
          // 发出 event（Axon 处理持久化）
          apply(new OrderCreatedEvent(cmd.getOrderId(), cmd.getCustomerId()));
      }

      @EventSourcingHandler
      public void on(OrderCreatedEvent event) {
          // 应用：更新内部状态
          this.orderId = event.getOrderId();
          this.status = OrderStatus.CREATED;
      }
  }

  @Component
  public class OrderSummaryProjection {
      @EventHandler
      public void on(OrderCreatedEvent event, @Timestamp Instant timestamp) {
          // 更新 read model
          repository.save(new OrderSummary(event.getOrderId(), ...));
      }
  }

  Axon 处理：
    - Event store（Axon Server 或 PostgreSQL）
    - 将 command 路由到正确的 aggregate 实例
    - Optimistic locking（version 追踪）
    - Snapshot 创建
    - Projection subscription 和 checkpoint
    - Saga 状态机管理
```

### 问：如何在生产环境中监控 Event Sourcing 系统？

```
回答：需要跟踪的关键指标：

  写侧：
    - Command 处理延迟（p50, p99）
    - 并发冲突率（409 响应）
    - Event 追加吞吐量（events/sec）
    - Aggregate 加载时间（snapshot 效果）

  EVENT STORE：
    - Event store 磁盘使用增长率
    - 复制延迟（leader 到 follower）
    - Event 追加延迟

  读侧：
    - Projection 延迟（当前位置 vs event store 头部）
    - Kafka 消费者延迟
    - Read model 查询延迟
    - 缓存命中率（Redis）

  SAGA：
    - Saga 持续时间（从开始到完成的时间）
    - 补偿事务率（失败指标）
    - 卡住的 saga 数量（未推进的 saga）

  告警：
    - Projection 延迟 > 5,000 个 event -> 消费者可能卡住
    - 并发冲突率 > 5% -> aggregate 热点
    - Saga 持续时间 > SLA 阈值 -> 调查补偿
    - Event store 磁盘 > 80% 容量 -> 增加存储
```

---

## 10. 总结图：完整系统

```
+==============================================================================+
|                    EVENT SOURCING + CQRS 系统                                 |
+==============================================================================+

  写侧                                    读侧
  +------------------+                       +------------------+
  |  Command API     |                       |  Query API       |
  |  POST /commands/ |                       |  GET /queries/   |
  +--------+---------+                       +--------+---------+
           |                                          |
           v                                          v
  +------------------+                       +------------------+
  |  Command Handler |                       |  Query Handler   |
  |  1. 加载 agg     |                       |  简单 DB 读取    |
  |  2. 验证         |                       |  无业务          |
  |  3. 应用 cmd     |                       |  逻辑            |
  |  4. 发出 event   |                       +--------+---------+
  +--------+---------+                                |
           |                                          |
           v                                          |
  +------------------+        Events         +--------+---------+
  |  Event Store     +---------------------->+ Read Model DB    |
  |  (Append-Only)   |                       |  (PostgreSQL/    |
  |  - Order events  |        +------------> |   Redis/ES)      |
  |  - Snapshots     |        |              +------------------+
  +------------------+        |
           |                  |        +------------------+
           |  Publish         |        | Projection       |
           v                  +--------+ Builder          |
  +------------------+                |  - 订阅           |
  |  Event Bus       |                |  - 处理 event     |
  |  (Kafka)         +--------------->+  - 更新 DB        |
  +------------------+                |  - Checkpoint     |
           |                          +------------------+
           |
           v
  +------------------+
  |  Saga Coordinator|
  |  - 状态机        |
  |  - 补偿          |
  |  - 跨服务        |
  +------------------+

  技术选型：
    Event Store:    EventStoreDB | Apache Kafka | PostgreSQL
    Event Bus:      Apache Kafka | RabbitMQ
    Read Models:    PostgreSQL | Redis | Elasticsearch | ClickHouse
    编排框架:       Axon Framework | 自定义实现
    监控:           Prometheus + Grafana (延迟、吞吐量、错误)
```
