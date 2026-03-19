# 设计电商库存与订单系统（Amazon / Shopify）

---

## 1. 需求澄清

### 功能需求

| #   | 需求            | 描述                                                    |
| --- | --------------- | ------------------------------------------------------- |
| 1   | 商品目录        | 浏览、搜索和查看商品详情，包括 SKU 和变体               |
| 2   | 购物车          | 添加/删除商品，跨会话持久化购物车，登录时合并游客购物车 |
| 3   | 库存管理        | 按 SKU 和仓库跟踪库存水平（可用、预留、已售）           |
| 4   | 结账与订单创建  | 原子性地预留库存、处理支付、确认订单                    |
| 5   | 订单跟踪        | 查看订单状态和历史，接收状态更新通知                    |
| 6   | 退货与退款      | 发起退货，部分/全额退款，退回商品重新入库               |
| 7   | 卖家库存更新    | 卖家可以更新库存水平，触发补货提醒                      |
| 8   | Flash Sale 支持 | 处理突发流量，支持预售预留和基于队列的下单              |
| 9   | 多仓库路由      | 将订单路由到最近的仓库，支持拆分发货                    |
| 10  | 价格快照        | 在订单创建时锁定商品价格                                |

### 非功能需求

| #   | 需求         | 目标                                    |
| --- | ------------ | --------------------------------------- |
| 1   | 订单创建延迟 | < 500ms (p99)                           |
| 2   | 库存准确度   | 99.99%（接近零超卖）                    |
| 3   | 可用性       | 99.99%（每年 < 1 小时停机）             |
| 4   | 峰值吞吐量   | Flash Sale 期间 50,000 订单/分钟        |
| 5   | 持久性       | 零订单丢失（at-least-once 投递）        |
| 6   | 一致性       | 库存扣减强一致性，读取最终一致性        |
| 7   | 幂等性       | 重复提交订单不得创建重复订单            |
| 8   | 可扩展性     | 1 亿商品，每天 100 万订单，5 亿日活用户 |

### 规模估算

```
每日订单：        1,000,000 订单/天
峰值订单：        10,000 订单/秒（flash sale：50,000 订单/分钟 ~ 833/秒持续）
商品数：          100,000,000（1 亿）
每个商品 SKU 数：  ~5 个平均（共 5 亿 SKU）
仓库：            全球 500+
购物车会话：       50,000,000 个活跃购物车

订单大小：        ~2 KB/条订单记录
订单项：          ~500 字节/项
每日写入量：       100 万订单 * 2KB = 2 GB/天（仅订单）
商品目录：        1 亿 * 5KB 平均 = 500 GB
库存记录：        5 亿 SKU * 平均 3 个仓库 * 100 字节 = 150 GB

读写比（目录）：   1000:1（高度读密集型）
读写比（订单）：   10:1
读写比（库存）：   100:1
```

---

## 2. API 设计

### 商品目录 API

```
GET    /v1/products?category=&search=&page=&limit=
GET    /v1/products/{productId}
GET    /v1/products/{productId}/skus
GET    /v1/skus/{skuId}
GET    /v1/skus/{skuId}/availability?warehouseId=

POST   /v1/products                          (seller)
PUT    /v1/products/{productId}              (seller)
PATCH  /v1/skus/{skuId}                     (seller)
```

### 购物车 API

```
GET    /v1/cart                              (current user's cart)
POST   /v1/cart/items
       Body: { skuId, quantity, warehouseId? }

PUT    /v1/cart/items/{itemId}
       Body: { quantity }

DELETE /v1/cart/items/{itemId}
DELETE /v1/cart                              (clear cart)

POST   /v1/cart/merge                        (merge guest cart on login)
       Body: { guestCartToken }
```

### 结账 API

```
POST   /v1/checkout/preview
       Body: { cartId, shippingAddress, couponCode? }
       Response: { items, subtotal, tax, shipping, total, estimatedDelivery }

POST   /v1/checkout/reserve
       Body: { cartId, shippingAddress }
       Response: { reservationId, expiresAt, priceSummary }
       Note: Reserves inventory for TTL=15min

POST   /v1/checkout/confirm
       Body: { reservationId, paymentMethodId }
       Response: { orderId, status, estimatedDelivery }
```

### 订单 API

```
GET    /v1/orders?status=&page=&limit=
GET    /v1/orders/{orderId}
GET    /v1/orders/{orderId}/items
GET    /v1/orders/{orderId}/tracking

POST   /v1/orders/{orderId}/cancel
POST   /v1/orders/{orderId}/return
       Body: { items: [{ orderItemId, quantity, reason }] }

GET    /v1/orders/{orderId}/refunds
```

### 库存 API（内部 / 卖家）

```
GET    /v1/inventory/{skuId}
GET    /v1/inventory/{skuId}/warehouses
PUT    /v1/inventory/{skuId}/warehouses/{warehouseId}
       Body: { quantity }                    (set absolute quantity)

POST   /v1/inventory/{skuId}/warehouses/{warehouseId}/adjust
       Body: { delta, reason }              (relative adjustment)

GET    /v1/inventory/low-stock?threshold=&sellerId=
POST   /v1/inventory/transfer
       Body: { skuId, fromWarehouseId, toWarehouseId, quantity }
```

---

## 3. 数据模型

### 商品表

```sql
CREATE TABLE products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id     UUID NOT NULL,
    title         VARCHAR(500) NOT NULL,
    description   TEXT,
    category_id   UUID NOT NULL,
    brand         VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, INACTIVE, DELETED
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_products_seller (seller_id),
    INDEX idx_products_category (category_id),
    INDEX idx_products_status (status)
);
```

### SKU 表（Stock Keeping Unit）

```sql
CREATE TABLE skus (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID NOT NULL REFERENCES products(id),
    sku_code      VARCHAR(100) NOT NULL UNIQUE,
    attributes    JSONB NOT NULL DEFAULT '{}',  -- { "color": "red", "size": "M" }
    price         DECIMAL(12, 2) NOT NULL,
    weight_grams  INT,
    image_url     VARCHAR(500),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_skus_product (product_id),
    INDEX idx_skus_code (sku_code)
);
```

### 库存表

```sql
CREATE TABLE inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id          UUID NOT NULL REFERENCES skus(id),
    warehouse_id    UUID NOT NULL,
    available_qty   INT NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
    reserved_qty    INT NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    sold_qty        INT NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
    reorder_point   INT NOT NULL DEFAULT 10,
    version         BIGINT NOT NULL DEFAULT 0,          -- optimistic lock
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sku_id, warehouse_id),
    INDEX idx_inventory_sku (sku_id),
    INDEX idx_inventory_warehouse (warehouse_id)
);
-- available_qty + reserved_qty + sold_qty = 实际物理库存总量
-- available_qty：当前可购买
-- reserved_qty：正在结账中的预留（结账进行中）
-- sold_qty：已确认并已发货
```

### 库存预留表

```sql
CREATE TABLE inventory_reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL,                       -- 按结账分组项目
    sku_id         UUID NOT NULL REFERENCES skus(id),
    warehouse_id   UUID NOT NULL,
    quantity       INT NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, CONFIRMED, RELEASED
    expires_at     TIMESTAMPTZ NOT NULL,                -- 自动释放的 TTL
    order_id       UUID,                               -- 确认时设置
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_reservations_reservation (reservation_id),
    INDEX idx_reservations_expires (expires_at) WHERE status = 'ACTIVE',
    INDEX idx_reservations_order (order_id)
);
```

### 购物车表

```sql
CREATE TABLE carts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID,                               -- 游客购物车为 NULL
    guest_token    VARCHAR(64),                        -- 用于游客购物车
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, MERGED, CONVERTED, ABANDONED
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ,
    INDEX idx_carts_user (user_id) WHERE user_id IS NOT NULL,
    INDEX idx_carts_guest (guest_token) WHERE guest_token IS NOT NULL
);

CREATE TABLE cart_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id        UUID NOT NULL REFERENCES carts(id),
    sku_id         UUID NOT NULL REFERENCES skus(id),
    quantity       INT NOT NULL CHECK (quantity > 0),
    price_snapshot DECIMAL(12, 2) NOT NULL,            -- 添加时的价格
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cart_id, sku_id),
    INDEX idx_cart_items_cart (cart_id)
);
```

### 订单表

```sql
CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    idempotency_key   VARCHAR(128) NOT NULL UNIQUE,    -- 防止重复订单
    status            VARCHAR(30) NOT NULL DEFAULT 'CREATED',
    -- CREATED, PAYMENT_PENDING, PAID, PICKING, PACKED, SHIPPED, DELIVERED, CANCELLED, RETURN_REQUESTED, RETURNED
    subtotal          DECIMAL(12, 2) NOT NULL,
    tax_amount        DECIMAL(12, 2) NOT NULL DEFAULT 0,
    shipping_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount      DECIMAL(12, 2) NOT NULL,
    currency          CHAR(3) NOT NULL DEFAULT 'USD',
    shipping_address  JSONB NOT NULL,
    payment_method_id VARCHAR(200),
    payment_intent_id VARCHAR(200),                   -- 外部支付引用
    reservation_id    UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at           TIMESTAMPTZ,
    shipped_at        TIMESTAMPTZ,
    delivered_at      TIMESTAMPTZ,
    INDEX idx_orders_user (user_id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_idempotency (idempotency_key)
);
```

### 订单项表

```sql
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    sku_id          UUID NOT NULL REFERENCES skus(id),
    warehouse_id    UUID NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      DECIMAL(12, 2) NOT NULL,           -- 下单时的价格快照
    total_price     DECIMAL(12, 2) NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- PENDING, PICKING, PACKED, SHIPPED, DELIVERED, RETURN_REQUESTED, RETURNED
    tracking_number VARCHAR(100),
    INDEX idx_order_items_order (order_id),
    INDEX idx_order_items_sku (sku_id)
);
```

### 订单状态历史表

```sql
CREATE TABLE order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id),
    status      VARCHAR(30) NOT NULL,
    reason      TEXT,
    actor_id    UUID,                                  -- 用户或系统
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_order_history_order (order_id)
);
```

---

## 4. 高层架构

```
+------------------+     +------------------+     +------------------+
|   Web / Mobile   |     |   Seller Portal  |     |  Admin Console   |
|     Clients      |     |                  |     |                  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                         +--------v---------+
                         |   API Gateway    |
                         | (Auth, Rate Lim, |
                         |  Route, TLS)     |
                         +--------+---------+
                                  |
          +-----------+-----------+-----------+-----------+
          |           |           |           |           |
+---------v-+ +-------v---+ +-----v-----+ +--v--------+ +-v----------+
|  Product  | |   Cart    | |  Order    | | Inventory | |Notification|
|  Service  | |  Service  | |  Service  | |  Service  | |  Service   |
+-----------+ +-----------+ +-----------+ +-----------+ +------------+
     |               |            |              |
     |         +-----v-----+      |         +----v----+
     |         | Redis Cart|      |         |Inventory|
     |         |   Cache   |      |         |  Cache  |
     |         +-----------+      |         | (Redis) |
     |                            |         +---------+
+----v----+              +--------v--------+
| Product |              | Order DB        |
| DB      |              | (PostgreSQL)    |
|(Postgres|              +-----------------+
|+ ES)    |
+---------+              +------------------+
                         | Inventory DB     |
+------------------+     | (PostgreSQL)     |
| Search Engine    |     +------------------+
| (Elasticsearch)  |
+------------------+     +------------------+
                         |  Message Broker  |
+------------------+     | (Kafka / SQS)    |
| CDN / Object     |     +------------------+
| Storage (S3)     |           |
+------------------+    +------v-------+
                        | Event        |
                        | Consumers    |
                        | (Saga Steps) |
                        +--------------+
```

### 内部服务通信

```
+-------------+   REST/gRPC   +--------------+
| Order       +-------------->| Inventory    |
| Service     |               | Service      |
|             |<--------------+              |
+------+------+               +--------------+
       |
       | Publish Events
       v
+------+------+    +----------+    +-----------+
| Kafka Topic |    | Payment  |    | Shipping  |
| order.*     +--->| Service  |    | Service   |
+-------------+    +----------+    +-----------+
                        |                |
                        | Publish Events |
                        v                v
                   +---------+    +-----------+
                   | Kafka   |    | Kafka     |
                   | payment.|    | shipment. |
                   | events  |    | events    |
                   +---------+    +-----------+
```

---

## 5. 深入探讨

### 5.1 库存管理：可用 vs 预留 vs 已售

库存模型为每个 SKU 的每个仓库使用三个计数器：

```
+------------------------------------------+
|         Physical Stock = 100 units        |
|                                          |
|  available_qty  | reserved_qty | sold_qty|
|      75         |      15      |   10    |
|                                          |
|  Can buy now    | In checkout  | Shipped |
|                 | (TTL: 15min) |         |
+------------------------------------------+

Invariant: available_qty + reserved_qty + sold_qty = initial_stock - damaged/lost
```

状态转换：

```
顾客加入购物车：          库存计数无变化
顾客开始结账：           available_qty -= N, reserved_qty += N
预留过期：              available_qty += N, reserved_qty -= N
支付确认：              reserved_qty -= N, sold_qty += N
订单取消（发货前）：      sold_qty -= N, available_qty += N
退货处理：              available_qty += N（重新入库）
```

### 5.2 Stock Reservation 模式（基于 TTL 的持有）

```
Customer                 Order Service            Inventory Service
    |                         |                          |
    |--- POST /checkout/      |                          |
    |    reserve ------------>|                          |
    |                         |--- reserveInventory() -->|
    |                         |   (atomically decrement  |
    |                         |    available, increment  |
    |                         |    reserved)             |
    |                         |<-- reservationId --------|
    |                         |   expires in 15 min      |
    |<-- reservationId -------|                          |
    |    expiresAt: T+15min   |                          |
    |                         |                          |
    |  [Customer fills payment details - up to 15 min]  |
    |                         |                          |
    |--- POST /checkout/      |                          |
    |    confirm ------------>|                          |
    |                         |--- confirmPayment() ---->|
    |                         |   (Payment Service)      |
    |                         |<-- paymentIntentId ------|
    |                         |                          |
    |                         |--- confirmReservation -->|
    |                         |   (reserved -> sold)     |
    |                         |<-- success --------------|
    |<-- orderId, status -----|                          |

If customer never confirms:
    [At T+15 min]             |                          |
                              |<-- TTL expiry event ----|
                              |   (background job or    |
                              |    Kafka scheduled msg) |
                              |--- releaseReservation ->|
                              |   (reserved -> available)|
```

通过后台清理任务进行基于 TTL 的释放：

```sql
-- 后台任务每 60 秒运行一次
UPDATE inventory
SET available_qty = available_qty + r.quantity,
    reserved_qty  = reserved_qty  - r.quantity,
    updated_at    = now()
FROM inventory_reservations r
WHERE r.status = 'ACTIVE'
  AND r.expires_at < now()
  AND inventory.sku_id       = r.sku_id
  AND inventory.warehouse_id = r.warehouse_id;

UPDATE inventory_reservations
SET status = 'RELEASED'
WHERE status = 'ACTIVE' AND expires_at < now();
```

### 5.3 超卖防护

#### 方案 A：悲观锁（SELECT FOR UPDATE）

```sql
BEGIN;
  SELECT available_qty
  FROM inventory
  WHERE sku_id = $1 AND warehouse_id = $2
  FOR UPDATE;                          -- 行级锁，阻塞并发写入者

  -- 检查库存是否充足
  IF available_qty >= requested_qty THEN
    UPDATE inventory
    SET available_qty = available_qty - requested_qty,
        reserved_qty  = reserved_qty  + requested_qty
    WHERE sku_id = $1 AND warehouse_id = $2;

    INSERT INTO inventory_reservations (...) VALUES (...);
  END IF;
COMMIT;

优点：保证正确性，无需重试
缺点：高负载下锁竞争严重，热门 SKU 可扩展性差
```

#### 方案 B：乐观锁（Version 列）

```sql
-- 读取当前状态及版本号
SELECT available_qty, version
FROM inventory
WHERE sku_id = $1 AND warehouse_id = $2;
-- 获取：available_qty=50, version=42

-- 仅在版本号未变时尝试原子更新
UPDATE inventory
SET available_qty = available_qty - $requested_qty,
    reserved_qty  = reserved_qty  + $requested_qty,
    version       = version + 1
WHERE sku_id       = $1
  AND warehouse_id = $2
  AND version      = 42          -- 乐观检查
  AND available_qty >= $requested_qty;

-- 如果影响 0 行：检测到并发修改 -> 重试
-- 如果影响 1 行：成功

优点：不持有锁，低竞争时吞吐量更高
缺点：需要重试逻辑，高竞争下可能出现饥饿
```

#### 方案 C：Redis 原子计数器（用于热门 SKU / Flash Sale）

```lua
-- Lua 脚本在 Redis 上原子执行
local current = redis.call('GET', KEYS[1])
if current == false then
    return -1  -- key not found
end
current = tonumber(current)
local requested = tonumber(ARGV[1])
if current < requested then
    return -2  -- insufficient stock
end
redis.call('DECRBY', KEYS[1], requested)
return current - requested  -- new available count
```

```
策略选择：
+------------------+------------------+------------------+
| 场景             | 策略             | 原因             |
+------------------+------------------+------------------+
| 普通商品         | Optimistic Lock  | 低竞争           |
| 热门商品         | Redis + 异步 DB  | 高吞吐量         |
| Flash Sale SKU   | Pre-deduction    | 极端流量         |
| 低库存商品       | Pessimistic Lock | 准确性至关重要   |
+------------------+------------------+------------------+
```

### 5.4 分布式事务：Two-Phase Commit 的局限性

2PC 要求所有参与者都可用且愿意提交：

```
Coordinator         DB (Orders)       Inventory Service    Payment Service
    |                   |                    |                    |
    |--- PREPARE ------>|--- PREPARE ------->|--- PREPARE ------->|
    |<-- VOTE_YES ------|<-- VOTE_YES -------|<-- VOTE_YES --------|
    |                   |                    |                    |
    |--- COMMIT ------->|--- COMMIT -------->|--- COMMIT -------->|
    |<-- ACK -----------|<-- ACK ------------|<-- ACK ------------|

问题：
1. Coordinator 在 PREPARE 后故障 = 参与者无限期锁定
2. PREPARE 后网络分区 = 不确定状态
3. 服务间紧耦合 = 降低可用性
4. 延迟：每个操作至少需要 2 次往返
5. 违反微服务边界（需要共享事务管理器）

结论：在分布式微服务中通常避免使用 2PC。
改用 Saga pattern。
```

### 5.5 Saga Pattern：编排 vs 协调

#### 编排模式（事件驱动）

```
Order Service                Inventory Service       Payment Service      Shipping Service
     |                              |                      |                    |
     |-- OrderCreated event ------->|                      |                    |
     |                              |-- InventoryReserved ->|                   |
     |                              |   event              |                    |
     |                              |                      |-- PaymentCharged ->|
     |                              |                      |   event            |
     |                              |                      |                    |-- ShipmentCreated
     |<-----------------------------------------------------|                  |   event
     | OrderFulfilled                                        |                  |

失败时的补偿事务：
     |-- OrderCreated event ------->|                      |                    |
     |                              |-- InventoryFailed --->|                   |
     |                              |   event (no stock)   |                    |
     |<-- OrderFailed event --------|                      |                    |
     | (auto-cancelled)             |                      |                    |

优点：松耦合，无单点故障
缺点：难以跟踪整体 saga 状态，调试复杂
```

#### 协调模式（集中式协调器）

```
+------------------+
|  Order Saga      |
|  Orchestrator    |
+--------+---------+
         |
         |  Step 1: Reserve Inventory
         +----------------------------> Inventory Service
         |                                    |
         |<-- InventoryReserved --------------+
         |
         |  Step 2: Charge Payment
         +----------------------------> Payment Service
         |                                    |
         |<-- PaymentCharged ----------------+
         |
         |  Step 3: Create Shipment
         +----------------------------> Shipping Service
         |                                    |
         |<-- ShipmentCreated ---------------+
         |
         |  Step 4: Update Order Status -> PAID/SHIPPED
         +----------------------------> Order DB

支付失败时：
         |<-- PaymentFailed -----------------+
         |
         |  补偿：释放库存
         +----------------------------> Inventory Service
         |                                    |
         |<-- InventoryReleased -------------+
         |
         |  更新订单状态 -> CANCELLED
         +----------------------------> Order DB

优点：职责清晰，易于监控 saga 状态，可测试
缺点：Orchestrator 可能成为瓶颈，单点故障（通过高可用缓解）
```

Saga 状态持久化：

```sql
CREATE TABLE order_sagas (
    id           UUID PRIMARY KEY,
    order_id     UUID NOT NULL UNIQUE,
    state        VARCHAR(50) NOT NULL,
    -- STARTED, INVENTORY_RESERVED, PAYMENT_CHARGED,
    -- SHIPMENT_CREATED, COMPLETED, COMPENSATING, FAILED
    context      JSONB NOT NULL DEFAULT '{}',
    step_results JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.6 订单状态机

```
                          +----------+
              +-----------| CREATED  |----------+
              |           +----+-----+          |
              |                |                |
              | (cancel)       | (payment init) |
              v                v                |
         +----------+   +--------------+        |
         |CANCELLED |   |PAYMENT_PENDING|       |
         +----------+   +------+-------+        |
              ^                |                |
              |                | (payment ok)   | (payment fail)
              | (cancel)       v                v
              |           +--------+       +----------+
              +-----------|  PAID  |       | PAYMENT_ |
              |           +---+----+       | FAILED   |
              |               |           +----------+
              |               | (warehouse picks)
              |               v
              |          +---------+
              +----------| PICKING |
              |          +----+----+
              |               |
              |               | (items packed)
              |               v
              |          +---------+
              +----------| PACKED  |
              |          +----+----+
              |               |
              |               | (shipped)
              |               v
              |          +---------+
              |          | SHIPPED |
              |          +----+----+
              |               |
              |               | (delivered)
              |               v
              |          +-----------+
              |          | DELIVERED |
              |          +-----+-----+
              |                |
              |                | (return request within window)
              |                v
              |     +------------------+
              |     | RETURN_REQUESTED |
              |     +--------+---------+
              |              |
              |              | (return received, refund issued)
              |              v
              |         +---------+
              +-------> | RETURNED|
                        +---------+

终态：CANCELLED, PAYMENT_FAILED, DELIVERED, RETURNED
```

状态转换规则：

```
CREATED          -> PAYMENT_PENDING  （用户发起支付）
CREATED          -> CANCELLED        （用户在 15 分钟内取消）
PAYMENT_PENDING  -> PAID             （支付 webhook 成功）
PAYMENT_PENDING  -> PAYMENT_FAILED   （支付 webhook 失败）
PAYMENT_FAILED   -> CANCELLED        （24 小时后自动取消或用户操作）
PAID             -> PICKING          （仓库系统开始拣货）
PAID             -> CANCELLED        （拣货开始前取消）
PICKING          -> PACKED           （所有商品已拣选）
PICKING          -> CANCELLED        （拣货时缺货）
PACKED           -> SHIPPED          （承运商已取件）
SHIPPED          -> DELIVERED        （确认送达）
DELIVERED        -> RETURN_REQUESTED （在退货窗口期内：30 天）
RETURN_REQUESTED -> RETURNED         （商品已收到 + 退款已发放）
```

### 5.7 购物车设计

#### 持久化购物车架构

```
+----------+       +----------------+       +------------------+
| Client   +------>| Cart Service   +------>| Redis Cart Store |
|          |       |                |       | cart:{userId}    |
+----------+       +-------+--------+       | TTL: 30 days     |
                           |               +------------------+
                           |
                           v
                   +---------------+
                   | Cart DB       |
                   | (PostgreSQL)  |
                   | (persistence) |
                   +---------------+
```

Redis 购物车结构：

```
Key:   cart:{userId}
Type:  Hash
Fields:
  item:{skuId}:qty       -> 2
  item:{skuId}:price     -> 29.99
  item:{skuId}:addedAt   -> 1709251200
  meta:updatedAt         -> 1709251200
  meta:currency          -> USD
```

#### 购物车合并（游客到已登录用户）

```
Guest User                    Logged-In User
     |                              |
[Browses, adds items]               |
[cart in cookie/localStorage]       |
     |                              |
     |         [Logs in]            |
     +------ POST /cart/merge ----->|
             { guestCartToken }     |
                                    |
                    Cart Service 逻辑：
                    1. 通过 token 加载游客购物车
                    2. 加载用户的现有购物车
                    3. 合并策略（按商品）：
                       - 仅在游客车中的商品 -> 添加到用户购物车
                       - 两者都有的商品 -> 取 MAX(qty) 或用户数量
                       - 仅在用户车中的商品 -> 保持不变
                    4. 将价格快照更新为当前价格
                    5. 删除游客购物车
                    6. 返回合并后的购物车
```

#### 遗弃购物车恢复

```
+-------------+   TTL alert   +--------------+   email    +----------+
| Redis Cart  +-------------->| Notification +----------->| Customer |
| (24h idle   |               | Service      |            |          |
|  trigger)   |               +--------------+            +----------+
+-------------+

恢复流程：
1. 后台任务：扫描 updatedAt > 24 小时前且 status=ACTIVE 的购物车
2. 检查购物车是否仍有商品（> 0 件）
3. 入队通知任务
4. 发送"您的购物车中有未完成的商品"邮件，附带购物车链接
5. 如果 48 小时后仍被遗弃，提供折扣优惠券
6. 30 天不活跃后将购物车标记为 ABANDONED
```

### 5.8 Flash Sale / 高并发库存

#### Flash Sale 架构

```
         Millions of Users
               |
               v
    +----------+----------+
    |       CDN           |
    | (product page cache)|
    | Cache product info  |
    | until sale starts   |
    +----------+----------+
               |
               v
    +----------+----------+
    |    Rate Limiter     |
    | (token bucket/      |
    |  sliding window)    |
    | Max 50K req/sec     |
    +----------+----------+
               |
          +-----------+
          | Eligible? |-- NO --> 429 Too Many Requests
          +-----------+
               | YES
               v
    +----------+----------+
    |  Virtual Queue      |
    | (Kafka / SQS FIFO)  |
    | Position token to   |
    | user: "You are #N"  |
    +----------+----------+
               |
               v (dequeue at controlled rate)
    +----------+----------+
    |  Flash Sale Worker  |
    |  Pool               |
    | - Deduct Redis qty  |
    | - If success: create|
    |   reservation       |
    | - If 0 stock: stop  |
    +----------+----------+
               |
               v
    +----------+----------+
    |  Order Service      |
    | (finalize order     |
    |  after payment)     |
    +---------------------+
```

#### Pre-Deduction 策略

在开售前：

```
1. 卖家确认：flash sale 有 10,000 件可用
2. 加载到 Redis：SET inventory:flash:{skuId} 10000
3. 开售时：原子执行 DECRBY（Lua 脚本保证原子性）
4. 定期将 Redis 计数同步回 PostgreSQL
5. 当 Redis 达到 0 时：通过 pub/sub 广播"已售罄"
```

#### Token Bucket 限流

```
+------------------+
| Token Bucket     |
| Capacity: 500    |
| Refill: 500/sec  |
|                  |
| [|||||||||||   ] |
| Current: 300     |
+------------------+

每个请求消耗 1 个 token。
如果桶为空：请求被拒绝并返回 429。

Redis 实现：
  EVAL lua_token_bucket_script 1 bucket_key max_tokens refill_rate now
```

#### Redis 计数器用于热门商品

```python
# Atomic Lua script
RESERVE_INVENTORY_SCRIPT = """
local key = KEYS[1]
local qty = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', key) or '0')
if current < qty then
    return {0, current}  -- failed, return current stock
end
local new_val = redis.call('DECRBY', key, qty)
return {1, new_val}  -- success, return remaining stock
"""

# Async sync to DB
async def sync_inventory_to_db(sku_id: str):
    redis_qty = await redis.get(f"inventory:available:{sku_id}")
    await db.execute(
        "UPDATE inventory SET available_qty = $1 WHERE sku_id = $2",
        int(redis_qty), sku_id
    )
```

### 5.9 多仓库库存路由

```
Customer Order
    |
    v
+---+-------------------+
| Warehouse Routing Svc |
+-----------+-----------+
            |
    +-------+-------+
    |               |
    v               v
 Algorithm      Constraints
 Selection      Checking
    |               |
    v               v
+-------+     +----------+
|Nearest|     |Has stock?|
|warehouse    |Split ok? |
|first  |     |Cost limit|
+-------+     +----------+
    |
    v
+---+----------------------+
|   Routing Decision       |
|                          |
| Case 1: Single warehouse |
|   All items at WH-A      |
|   -> Route all to WH-A   |
|                          |
| Case 2: Split shipment   |
|   Items X,Y at WH-A      |
|   Item Z only at WH-B    |
|   -> 2 shipments created |
|   (only if user allowed) |
|                          |
| Case 3: Backorder        |
|   Item out of stock all  |
|   -> Notify user, offer  |
|      backorder or cancel |
+---+----------------------+
```

仓库选择算法：

```python
def select_warehouse(sku_id: str, qty: int, customer_location: GeoPoint) -> str:
    warehouses = get_warehouses_with_stock(sku_id, min_qty=qty)

    # 为每个仓库打分
    scored = []
    for wh in warehouses:
        distance_km = haversine(customer_location, wh.location)
        shipping_cost = estimate_shipping_cost(distance_km)
        stock_buffer = wh.available_qty - qty  # 优先选择库存余量更多的仓库

        score = (
            -0.6 * normalize(shipping_cost) +   # 更低成本优先
            -0.3 * normalize(distance_km) +      # 更近距离优先
            +0.1 * normalize(stock_buffer)       # 更多余量优先
        )
        scored.append((score, wh.id))

    return max(scored, key=lambda x: x[0])[1]
```

### 5.10 幂等订单创建

```
Client                    Order Service             DB
  |                            |                    |
  |-- POST /checkout/confirm   |                    |
  |   Headers:                 |                    |
  |   Idempotency-Key: UUID-1  |                    |
  |   Body: { reservationId,   |                    |
  |           paymentMethodId }|                    |
  |                            |                    |
  |                            |-- INSERT order     |
  |                            |   ON CONFLICT      |
  |                            |   (idempotency_key)|
  |                            |   DO NOTHING       |
  |                            |   RETURNING id --> |
  |                            |                    |
  |<-- 200 { orderId }---------|                    |

网络重试时（相同 Idempotency-Key）：
  |-- POST /checkout/confirm   |                    |
  |   Idempotency-Key: UUID-1  |                    |
  |                            |-- SELECT order     |
  |                            |   WHERE            |
  |                            |   idempotency_key  |
  |                            |   = UUID-1  ------>|
  |                            |<-- existing order--|
  |<-- 200 { orderId } --------|   (same response)  |

关键：存储 idempotency_key -> response 映射
     在 Redis 中设置 24 小时 TTL 以实现快速查找
```

### 5.11 价格一致性：订单时快照

```
问题：顾客加入购物车后商品价格发生变化。
     顾客期望以看到的价格支付。

解决方案：价格快照策略

时间线：
  T=0: 顾客查看商品价格 $29.99
  T=1: 顾客添加到购物车
       -> cart_items.price_snapshot = 29.99（锁定）
  T=2: 卖家将价格改为 $34.99
  T=3: 顾客开始结账
       -> 显示 cart_items.price_snapshot 中的价格 = 29.99
       -> 显示警告："自您添加此商品以来，价格可能已发生变化"
  T=4: 顾客确认订单
       -> order_items.unit_price = 29.99（来自快照）
       -> 收费总额 = 29.99

规则：
  1. 始终在添加到购物车时快照价格
  2. 在结账预览时重新验证价格（如有变化则警告）
  3. 按结账确认时显示的价格收费
  4. 不得收取高于显示价格的金额；可以收取更低价格（促销价）
```

### 5.12 税费和运费计算流水线

```
POST /v1/checkout/preview
     |
     v
+----+-----------------------------+
| 输入验证                          |
| - 有效的购物车商品                 |
| - 有效的收货地址                   |
| - 商品仍然可用                     |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| 仓库选择                          |
| - 确定履约位置                     |
| - 检查库存可用性                   |
| - 如需要则拆分发货                 |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| 运费计算                          |
| - 承运商 API（UPS/FedEx/USPS）    |
| - 重量 + 尺寸 + 距离              |
| - 多种选项：标准、快递、隔夜送达    |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| 税费计算                          |
| - 管辖区域检测                     |
|   （国家、州、县、城市）            |
| - 商品税务类别                     |
| - 集成：TaxJar / Avalara         |
| - 缓存结果 1 小时                  |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| 折扣 / 优惠券应用                  |
| - 验证优惠券代码                   |
| - 应用百分比或固定金额折扣          |
| - 检查最低订单金额                 |
| - 检查使用次数限制                 |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| 最终价格组装                       |
| subtotal = sum(qty * unit_price)  |
| discount = coupon_discount        |
| shipping = selected_rate          |
| tax = calculated_tax              |
| total = subtotal - discount       |
|         + shipping + tax          |
+----------------------------------+
```

### 5.13 退货与退款

```
Customer             Order Service          Inventory Service    Payment Service
    |                     |                       |                    |
    |-- POST /orders/{id}/return                  |                    |
    |   { items, reason }->|                      |                    |
    |                      |-- validate return    |                    |
    |                      |   window (30 days)   |                    |
    |                      |-- create ReturnRequest                    |
    |<-- returnId, label---|                      |                    |
    |   (prepaid label)    |                      |                    |
    |                      |                      |                    |
    |  [Ships item back]   |                      |                    |
    |                      |                      |                    |
    |  [Carrier delivers]  |                      |                    |
    |                      |                      |                    |
    |         Warehouse confirms receipt           |                    |
    |                      |-- restockInventory ->|                    |
    |                      |   (if not damaged)   |                    |
    |                      |                      |-- processRefund -->|
    |                      |                      |                    |
    |                      |<-- refundId, amount --|<-- refundId ------|
    |<-- refund confirmed--|                      |                    |
    |   (3-5 business days)|                      |                    |

部分退款示例：
  订单：2x product_A + 1x product_B = 总计 $100
  退货：1x product_A（$30）
  退款：$30（部分）
  状态：订单变为 PARTIALLY_RETURNED
```

库存重新入库决策：

```
+---------------------------+
| 商品退回                   |
+---------------------------+
         |
         v
+--------+--------+
| 检查商品         |
+--------+--------+
         |
  +------+------+
  |             |
  v             v
良好           损坏/
状态           缺陷
  |             |
  v             v
重新入库      核销
available_  （不添加
qty += N    回库存）
             |
             v
         向卖家或
         保险公司
         提出索赔
```

### 5.14 读取可扩展性：商品目录的 CQRS

```
写入路径（需要强一致性）：
+----------+    +---------------+    +------------------+
| Seller   +--->| Product API   +--->| PostgreSQL       |
| Portal   |    | (write model) |    | (source of truth)|
+----------+    +------+--------+    +------------------+
                       |
                       | CDC (Change Data Capture)
                       | via Debezium / Kafka Connect
                       v
                +------+--------+
                | Kafka Topic   |
                | product.events|
                +------+--------+
                       |
          +------------+---------------+
          |            |               |
          v            v               v
   +------+--+  +------+---+  +-------+--+
   |Elastic-  |  | Redis    |  | CDN      |
   |search    |  | Cache    |  | Edge     |
   |(search   |  |(hot prods|  | Cache    |
   | index)   |  | details) |  |(category |
   +----------+  +----------+  | pages)   |
                               +----------+
读取路径（可接受最终一致性）：
+----------+    +---------------+
| Customer +--->| Product API   +---> 从 Elasticsearch / Redis / CDN 读取
|          |    | (read model)  |     （最多延迟 30 秒）
+----------+    +---------------+
```

---

## 6. 扩展策略

### 数据库分片

```
订单数据库按 user_id 分片：
  Shard 0: user_id hash % 4 == 0
  Shard 1: user_id hash % 4 == 1
  Shard 2: user_id hash % 4 == 2
  Shard 3: user_id hash % 4 == 3

  优势：用户可以从单个分片查询所有订单
  权衡：跨用户订单分析需要 scatter-gather

库存数据库按 seller_id 分片：
  优势：卖家的全部库存在同一分片上
  权衡：热门卖家造成分片热点（添加只读副本）

商品数据库按 category_id 分片：
  优势：分类浏览只命中一个分片
  权衡：商品搜索仍需 scatter-gather（使用 Elasticsearch）
```

### 缓存层

```
+------------------+------------------+------------------+
| 层               | 技术             | TTL / 策略       |
+------------------+------------------+------------------+
| CDN Edge Cache   | CloudFront/Fastly| 5 分钟（目录）   |
| Product Cache    | Redis Cluster    | 1 小时（热门）   |
| Inventory Cache  | Redis Cluster    | 5 秒（准确性）   |
| Cart Cache       | Redis Cluster    | 30 天（会话）    |
| Session Cache    | Redis Cluster    | 24 小时          |
| Tax/Shipping     | Redis            | 1 小时           |
| Search Results   | Elasticsearch    | 30 秒            |
+------------------+------------------+------------------+

缓存失效：
- 商品更新 -> 失效 product:{id} + 搜索索引更新
- 库存变化 -> 立即更新 inventory:{skuId}:{warehouseId}
- 价格变化 -> 失效 product:{id}，通知活跃购物车
```

### 只读副本

```
Primary DB（写入）
    |
    +---> Replica 1（订单查询、分析）
    |
    +---> Replica 2（商品目录读取）
    |
    +---> Replica 3（报表 / BI）

复制延迟目标：< 100ms
使用连接池：PgBouncer
```

### 微服务扩展

```
服务              扩展策略                    实例数（正常/峰值）
---------------------------------------------------------------------
Product Service  水平扩展（无状态）            5 / 50
Cart Service     水平扩展（无状态）            3 / 20
Order Service    水平扩展（幂等）              5 / 30
Inventory Svc    水平扩展 + 分片数据库         5 / 20
Payment Svc      水平扩展（幂等）              3 / 10
Notification Svc 水平扩展 + 基于队列           3 / 15
Search Service   Elasticsearch 集群          3 节点 / 10 节点
```

---

## 7. 峰值流量处理

### Black Friday / Cyber Monday 准备

```
活动前（提前 1 周）：
1. 容量规划：10 倍正常流量
2. 预热缓存，加载热门商品数据
3. 预生成静态商品页面，推送到 CDN
4. 负载测试到预计峰值的 150%
5. 对所有外部服务启用断路器
6. 增加数据库连接池限制
7. 预扩展 Kubernetes pods（避免峰值期间冷启动）

活动期间：
+---------+    +-----------+    +------------+    +----------+
| Millions|    | CDN       |    | Rate       |    | Service  |
| of      +--->| (90% hit  +--->| Limiter    +--->| Mesh     |
| Users   |    | rate)     |    | (10% pass) |    | (k8s)    |
+---------+    +-----------+    +------------+    +----------+

流量分布：
  90% 由 CDN 服务（商品页面、图片）
  8% 由应用缓存服务（Redis）
  2% 命中数据库

用于降级的功能开关：
  - 禁用商品推荐（减少数据库负载）
  - 显示缓存的库存数量（非实时）
  - 所有订单排队（异步处理）
  - 禁用非关键 API（愿望清单、评价）
```

### Flash Sale 流程（目标 10K 订单/秒）

```
     Start of Flash Sale
          |
          v
+---------+----------+
| Pre-loaded Redis   |
| inventory counter  |
| SET flash:sku:123  |
| 10000              |
+---------+----------+
          |
    +-----------+ rate limit  +--------+
    | API GW    +------------>| Queue  |  <- Kafka FIFO
    | 50K/sec   |             | (FIFO) |
    | max       |             +---+----+
    +-----------+                 |
                                  | consume at 10K/sec
                                  v
                         +--------+--------+
                         | Flash Sale      |
                         | Workers (N pod) |
                         |                 |
                         | 1. DECRBY Redis |
                         | 2. If success:  |
                         |    create order |
                         | 3. If 0:        |
                         |    sold out     |
                         +--------+--------+
                                  |
                         +--------v--------+
                         | Async Order     |
                         | Processing      |
                         | (Saga)          |
                         +-----------------+
```

基于队列的排单确保先到先服务的公平性，并将流量峰值与数据库写入解耦。

---

## 8. 权衡分析

| 决策            | 选择方案                            | 替代方案           | 权衡                                                |
| --------------- | ----------------------------------- | ------------------ | --------------------------------------------------- |
| 库存一致性      | 强一致性（optimistic lock + Redis） | 最终一致性         | 防止超卖但增加重试复杂度                            |
| 事务模式        | Saga（orchestration）               | 2PC / 单数据库事务 | 容错但最终一致性，补偿逻辑复杂                      |
| 购物车存储      | Redis + PostgreSQL                  | 仅数据库           | 读取更快，存在 Redis 数据丢失风险（通过持久化缓解） |
| 库存读取        | Redis 缓存（5 秒延迟）              | 始终从数据库读取   | 更快但可能显示过期库存；可接受的用户体验权衡        |
| 订单分片        | 按 user_id                          | 按订单日期         | 用户查询高效；日期范围查询需要 scatter-gather       |
| Flash Sale 库存 | Redis pre-deduction                 | 数据库加队列       | 更高吞吐量但 Redis-DB 同步复杂                      |
| 商品读取        | CQRS + Elasticsearch                | 单数据库           | 读取近线性扩展但写入最终一致                        |
| 重复订单        | 数据库中的 idempotency key          | 请求去重缓存       | 持久保证但增加数据库约束                            |
| 结账价格        | 加入购物车时快照                    | 实时价格           | 可预测的用户体验；卖家失去动态定价控制              |

---

## 9. 常见面试追问

### 问：当热门商品补货时，如何处理"惊群效应"？

```
当库存从 0 -> N（补货）时：
  问题：数千名关注者同时收到通知，涌入系统

解决方案：
  1. 分批通知：在 10 分钟内分批发送邮件
  2. 虚拟队列：前 N 个"到货提醒"用户获得购买令牌
  3. 限流：该 SKU 最多 100 用户/秒可以开始结账
  4. 随机抖动：为每个用户的通知延迟 random(0, 300) 秒
```

### 问：如何处理支付服务宕机？

```
Order Service              Payment Service
     |                           |
     |--- charge request ------->|
     |                    [DOWN] |
     |<-- timeout (5 sec) -------|
     |
     | 指数退避重试：
     |   - 第 1 次：5 秒
     |   - 第 2 次：10 秒
     |   - 第 3 次：20 秒
     |
     | 如果所有重试都失败：
     |   - 订单保持 PAYMENT_PENDING 状态
     |   - 后台任务在 24 小时内持续重试
     |   - 通知客户重新尝试支付
     |   - 在重试窗口内维持库存预留
     |
     | 50% 失败率后断路器打开：
     |   - 快速失败：拒绝新的支付请求
     |   - 向客户显示维护信息
     |   - 告警值班工程师
```

### 问：如何确保订单事件的 exactly-once 投递？

```
生产者（Order Service）：
  - 使用 Kafka 事务：producer.initTransactions()
  - 在同一事务中写入 Kafka + 标记本地数据库为 "event_sent"

消费者（Inventory Service）：
  - 在自己的数据库中跟踪已消费的 Kafka offset
  - 使用幂等处理：检查事件是否已处理
  - 仅在处理完成后才提交 offset

At-least-once + 幂等消费者 = 有效的 exactly-once 语义
```

### 问：如果 Saga orchestrator 在 saga 执行过程中崩溃怎么办？

```
恢复：
  1. 每个步骤前将 Saga 状态持久化到数据库
  2. Orchestrator 重启时：加载所有未完成的 saga
  3. 从最后已知的成功步骤恢复每个 saga
  4. 每个 saga 步骤都是幂等的（可以安全地重新执行）

+-------------------+
| Saga Recovery Job |
| (runs on startup) |
+-------------------+
         |
         | SELECT * FROM order_sagas
         |   WHERE state NOT IN ('COMPLETED', 'FAILED')
         |     AND updated_at < now() - interval '5 min'
         v
+--------+---------+
| Resume saga from |
| last state       |
+------------------+
```

### 问：如何在商品页面上实现实时库存更新？

```
选项：
  1. 短轮询（每 30 秒）：简单但服务器负载高
  2. Server-Sent Events (SSE)：服务器推送更新，单向，比 WebSocket 简单
  3. WebSocket：双向，对库存更新来说过于复杂
  4. 长轮询：客户端保持连接打开，服务器在变化时响应

推荐：SSE 用于实时库存
  客户端：
    const es = new EventSource('/v1/products/123/inventory/stream')
    es.onmessage = (e) => updateStockDisplay(JSON.parse(e.data))

  服务端：
    Redis pub/sub 频道：inventory:updates:{skuId}
    SSE 处理器订阅并转发到客户端
    当库存变化 > 5% 或跨越阈值时推送更新
```

### 问：如何处理活跃结账会话期间的价格变化？

```
T=0: 顾客看到 $29.99，开始结账，创建预留
T=5: 卖家将价格改为 $34.99
T=8: 顾客确认订单

策略选项：
  A) 遵守原始价格（对顾客友好）
     - 按 $29.99 收费（结账开始时的价格）
     - 预留包含锁定价格

  B) 使用当前价格（对卖家友好）
     - 最终确认前警告顾客价格已变化
     - 要求顾客重新确认

  C) 使用两者中的较低价格（市场中立）
     - 最佳用户体验：顾客始终获得有利价格

方案 A 的实现：
  - inventory_reservations.price_locked = 29.99
  - 订单创建使用 reservation.price_locked
  - 不受后续价格变化影响
```

### 问：如何扩展搜索功能？

```
+------------------+    +-----------------+    +------------------+
| Write: Product   +--->| Kafka CDC       +--->| Elasticsearch    |
| Service (Pg)     |    | (Debezium)      |    | Index            |
+------------------+    +-----------------+    +------------------+
                                                       |
                                               +-------v--------+
                                               | Read: Search   |
                                               | Service        |
                                               | - Full text    |
                                               | - Faceted      |
                                               | - Typo tolerant|
                                               | - Personalized |
                                               +----------------+

Elasticsearch 索引设置：
  - 分片：5 个主分片（每 2000 万商品一个）
  - 副本：2 个（读取可命中任意副本）
  - 分析器：商品名称自定义分词器
  - 同义词："cell phone" = "mobile phone" = "smartphone"

个性化层（在 ES 之上）：
  - 用户购买历史 -> 提升偏好品牌/类别
  - A/B 测试排序算法
  - 在 Redis 中缓存热门查询结果（TTL：5 分钟）
```

### 问：如何处理多币种库存？

```
库存数量与币种无关（单位，不是金额）。
价格按币种存储在单独的表中：

CREATE TABLE sku_prices (
    sku_id     UUID NOT NULL,
    currency   CHAR(3) NOT NULL,
    amount     DECIMAL(12, 4) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sku_id, currency)
);

汇率缓存在 Redis 中，每 15 分钟从外汇 API 更新。
显示价格 = sku_prices[currency] 或 base_price * exchange_rate。
订单记录存储币种和该币种的金额。
退款以原始收费的相同币种发放。
```

### 问：设计订单更新通知系统

```
+-------------------+    +-------------------+    +-------------------+
| Order Service     +--->| Notification      +--->| Channel Router    |
| publishes events  |    | Service           |    |                   |
+-------------------+    +-------------------+    +--+--+--+----------+
                                                     |  |  |
                                              +------+  |  +------+
                                              |         |         |
                                              v         v         v
                                          +------+ +-------+ +-------+
                                          | Email| |  SMS  | | Push  |
                                          | (SES)| |(Twilio)| | Notif|
                                          +------+ +-------+ +-------+

用户偏好存储在 notification_preferences 表中。
通知去重：跟踪 event_id，不重复发送。
失败投递使用指数退避重试。
模板系统：按语言/地区本地化模板。
```

---

## 总结：关键设计决策

```
+-------------------------------+------------------------------------------+
| 挑战                          | 解决方案                                  |
+-------------------------------+------------------------------------------+
| 超卖防护                      | Redis 原子递减 + optimistic lock          |
| 结账原子性                    | Saga pattern 及补偿机制                   |
| Flash Sale 吞吐量            | Pre-deduction + 虚拟队列                  |
| 购物车持久性                  | Redis（快速）+ PostgreSQL（持久）         |
| 重复订单                      | 数据库中的 idempotency key 约束           |
| 价格一致性                    | 加入购物车时快照                          |
| 库存读取                      | Redis 缓存，5 秒 TTL                     |
| 商品搜索                      | Elasticsearch 配合 PostgreSQL CDC         |
| 多仓库路由                    | 评分算法：距离 + 成本                     |
| 订单状态管理                  | 显式状态机 + 历史记录表                   |
| 遗弃购物车恢复                | 后台任务 + 邮件通知                       |
| 退货/退款流程                 | Saga 带库存重新入库步骤                   |
| 峰值流量                      | CDN + 限流 + 队列 + 预扩展               |
+-------------------------------+------------------------------------------+
```
