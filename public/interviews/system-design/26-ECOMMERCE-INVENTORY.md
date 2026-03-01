# Design an E-commerce Inventory & Order System (Amazon / Shopify)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Product Catalog | Browse, search, and view product details including SKUs and variants |
| 2 | Shopping Cart | Add/remove items, persist cart across sessions, merge guest cart on login |
| 3 | Inventory Management | Track stock levels (available, reserved, sold) per SKU per warehouse |
| 4 | Checkout & Order Creation | Reserve inventory, process payment, confirm order atomically |
| 5 | Order Tracking | View order status and history, receive status update notifications |
| 6 | Returns & Refunds | Initiate returns, partial/full refunds, restock returned inventory |
| 7 | Seller Inventory Updates | Sellers can update stock levels, trigger restocking alerts |
| 8 | Flash Sale Support | Handle burst traffic with pre-sale reservation and queue-based ordering |
| 9 | Multi-warehouse Routing | Route orders to nearest warehouse, support split shipments |
| 10 | Price Snapshot | Lock in product price at time of order creation |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Order creation latency | < 500ms (p99) |
| 2 | Inventory accuracy | 99.99% (near-zero overselling) |
| 3 | Availability | 99.99% (< 1 hour downtime/year) |
| 4 | Peak throughput | 50,000 orders/minute during flash sales |
| 5 | Durability | Zero order loss (at-least-once delivery) |
| 6 | Consistency | Strong consistency for inventory deduction, eventual consistency for reads |
| 7 | Idempotency | Duplicate order submissions must not create duplicate orders |
| 8 | Scalability | 100M products, 1M orders/day, 500M daily active users |

### Scale Estimation

```
Daily Orders:       1,000,000 orders/day
Peak Orders:        10,000 orders/sec (flash sale: 50,000 orders/min ~ 833/sec sustained)
Products:           100,000,000 (100M)
SKUs per Product:   ~5 average (500M total SKUs)
Warehouses:         500+ globally
Cart Sessions:      50,000,000 active carts

Order size:         ~2 KB per order record
Order items:        ~500 bytes per item
Daily write volume: 1M orders * 2KB = 2 GB/day orders alone
Product catalog:    100M * 5KB avg = 500 GB
Inventory records:  500M SKU * 3 warehouses avg * 100 bytes = 150 GB

Read/Write ratio (catalog):  1000:1 (heavily read-dominant)
Read/Write ratio (orders):   10:1
Read/Write ratio (inventory): 100:1
```

---

## 2. API Design

### Product Catalog API

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

### Cart API

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

### Checkout API

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

### Order API

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

### Inventory API (Internal / Seller)

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

## 3. Data Model

### Product Table

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

### SKU Table (Stock Keeping Unit)

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

### Inventory Table

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
-- available_qty + reserved_qty + sold_qty = total physical stock
-- available_qty: can be purchased now
-- reserved_qty: in active reservations (checkout in progress)
-- sold_qty: confirmed and fulfilled
```

### Inventory Reservation Table

```sql
CREATE TABLE inventory_reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL,                       -- groups items per checkout
    sku_id         UUID NOT NULL REFERENCES skus(id),
    warehouse_id   UUID NOT NULL,
    quantity       INT NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, CONFIRMED, RELEASED
    expires_at     TIMESTAMPTZ NOT NULL,                -- TTL for auto-release
    order_id       UUID,                               -- set when confirmed
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_reservations_reservation (reservation_id),
    INDEX idx_reservations_expires (expires_at) WHERE status = 'ACTIVE',
    INDEX idx_reservations_order (order_id)
);
```

### Cart Table

```sql
CREATE TABLE carts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID,                               -- NULL for guest carts
    guest_token    VARCHAR(64),                        -- for guest carts
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
    price_snapshot DECIMAL(12, 2) NOT NULL,            -- price when added
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cart_id, sku_id),
    INDEX idx_cart_items_cart (cart_id)
);
```

### Order Table

```sql
CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    idempotency_key   VARCHAR(128) NOT NULL UNIQUE,    -- prevent duplicate orders
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
    payment_intent_id VARCHAR(200),                   -- external payment reference
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

### Order Item Table

```sql
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    sku_id          UUID NOT NULL REFERENCES skus(id),
    warehouse_id    UUID NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      DECIMAL(12, 2) NOT NULL,           -- price snapshot at order time
    total_price     DECIMAL(12, 2) NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- PENDING, PICKING, PACKED, SHIPPED, DELIVERED, RETURN_REQUESTED, RETURNED
    tracking_number VARCHAR(100),
    INDEX idx_order_items_order (order_id),
    INDEX idx_order_items_sku (sku_id)
);
```

### Order Status History Table

```sql
CREATE TABLE order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id),
    status      VARCHAR(30) NOT NULL,
    reason      TEXT,
    actor_id    UUID,                                  -- user or system
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_order_history_order (order_id)
);
```

---

## 4. High-Level Architecture

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

### Internal Service Communication

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

## 5. Deep Dive Sections

### 5.1 Inventory Management: Available vs Reserved vs Sold

The inventory model uses three counters per SKU per warehouse:

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

State transitions:

```
Customer adds to cart:      No change to inventory counts
Customer starts checkout:   available_qty -= N, reserved_qty += N
Reservation expires:        available_qty += N, reserved_qty -= N
Payment confirmed:          reserved_qty -= N, sold_qty += N
Order cancelled (pre-ship): sold_qty -= N, available_qty += N
Return processed:           available_qty += N (restocked)
```

### 5.2 Stock Reservation Pattern (TTL-Based Hold)

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

TTL-based release via background sweeper:

```sql
-- Background job runs every 60 seconds
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

### 5.3 Overselling Prevention

#### Option A: Pessimistic Locking (SELECT FOR UPDATE)

```sql
BEGIN;
  SELECT available_qty
  FROM inventory
  WHERE sku_id = $1 AND warehouse_id = $2
  FOR UPDATE;                          -- row-level lock, blocks concurrent writers

  -- Check sufficient stock
  IF available_qty >= requested_qty THEN
    UPDATE inventory
    SET available_qty = available_qty - requested_qty,
        reserved_qty  = reserved_qty  + requested_qty
    WHERE sku_id = $1 AND warehouse_id = $2;

    INSERT INTO inventory_reservations (...) VALUES (...);
  END IF;
COMMIT;

Pros:  Guaranteed correctness, no retry needed
Cons:  Lock contention under high load, poor scalability for hot SKUs
```

#### Option B: Optimistic Locking (Version Column)

```sql
-- Read current state with version
SELECT available_qty, version
FROM inventory
WHERE sku_id = $1 AND warehouse_id = $2;
-- Got: available_qty=50, version=42

-- Attempt atomic update only if version unchanged
UPDATE inventory
SET available_qty = available_qty - $requested_qty,
    reserved_qty  = reserved_qty  + $requested_qty,
    version       = version + 1
WHERE sku_id       = $1
  AND warehouse_id = $2
  AND version      = 42          -- optimistic check
  AND available_qty >= $requested_qty;

-- If 0 rows affected: concurrent modification detected -> retry
-- If 1 row affected: success

Pros:  No lock holding, better throughput for low-contention
Cons:  Retry logic needed, starvation possible under high contention
```

#### Option C: Redis Atomic Counter (for Hot SKUs / Flash Sales)

```lua
-- Lua script executed atomically on Redis
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
Strategy selection:
+------------------+------------------+------------------+
| Scenario         | Strategy         | Reason           |
+------------------+------------------+------------------+
| Normal product   | Optimistic Lock  | Low contention   |
| Popular product  | Redis + async DB | High throughput  |
| Flash sale SKU   | Pre-deduction    | Extreme traffic  |
| Low stock item   | Pessimistic Lock | Accuracy critical|
+------------------+------------------+------------------+
```

### 5.4 Distributed Transactions: Two-Phase Commit Limitations

2PC requires all participants to be available and willing to commit:

```
Coordinator         DB (Orders)       Inventory Service    Payment Service
    |                   |                    |                    |
    |--- PREPARE ------>|--- PREPARE ------->|--- PREPARE ------->|
    |<-- VOTE_YES ------|<-- VOTE_YES -------|<-- VOTE_YES --------|
    |                   |                    |                    |
    |--- COMMIT ------->|--- COMMIT -------->|--- COMMIT -------->|
    |<-- ACK -----------|<-- ACK ------------|<-- ACK ------------|

Problems:
1. Coordinator failure after PREPARE = participants locked indefinitely
2. Network partition after PREPARE = indeterminate state
3. Tight coupling between services = reduced availability
4. Latency: each operation requires 2 round trips minimum
5. Microservice boundaries violated (need shared transaction manager)

Conclusion: 2PC is generally avoided in distributed microservices.
Use Saga pattern instead.
```

### 5.5 Saga Pattern: Choreography vs Orchestration

#### Choreography (Event-Driven)

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

Compensating transactions on failure:
     |-- OrderCreated event ------->|                      |                    |
     |                              |-- InventoryFailed --->|                   |
     |                              |   event (no stock)   |                    |
     |<-- OrderFailed event --------|                      |                    |
     | (auto-cancelled)             |                      |                    |

Pros:  Loose coupling, no single point of failure
Cons:  Hard to track overall saga state, complex debugging
```

#### Orchestration (Centralized Coordinator)

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

On Payment Failure:
         |<-- PaymentFailed -----------------+
         |
         |  Compensate: Release Inventory
         +----------------------------> Inventory Service
         |                                    |
         |<-- InventoryReleased -------------+
         |
         |  Update Order Status -> CANCELLED
         +----------------------------> Order DB

Pros:  Clear ownership, easy to monitor saga state, testable
Cons:  Orchestrator can become bottleneck, single point of failure (mitigated by HA)
```

Saga state persistence:

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

### 5.6 Order State Machine

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

Terminal states: CANCELLED, PAYMENT_FAILED, DELIVERED, RETURNED
```

State transition rules:

```
CREATED          -> PAYMENT_PENDING  (user initiates payment)
CREATED          -> CANCELLED        (user cancels within 15 min)
PAYMENT_PENDING  -> PAID             (payment webhook success)
PAYMENT_PENDING  -> PAYMENT_FAILED   (payment webhook failure)
PAYMENT_FAILED   -> CANCELLED        (auto after 24h or user action)
PAID             -> PICKING          (warehouse system picks up)
PAID             -> CANCELLED        (cancel before picking starts)
PICKING          -> PACKED           (all items picked)
PICKING          -> CANCELLED        (item out of stock at pick time)
PACKED           -> SHIPPED          (carrier picked up)
SHIPPED          -> DELIVERED        (delivery confirmed)
DELIVERED        -> RETURN_REQUESTED (within return window: 30 days)
RETURN_REQUESTED -> RETURNED         (item received + refund issued)
```

### 5.7 Cart Design

#### Persistent Cart Architecture

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

Redis cart structure:

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

#### Cart Merging (Guest to Logged-In)

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
                    Cart Service logic:
                    1. Load guest cart by token
                    2. Load user's existing cart
                    3. Merge strategy (per item):
                       - Item in guest only -> add to user cart
                       - Item in both -> take MAX(qty) or user's qty
                       - Item in user only -> keep as-is
                    4. Update price snapshots to current prices
                    5. Delete guest cart
                    6. Return merged cart
```

#### Abandoned Cart Recovery

```
+-------------+   TTL alert   +--------------+   email    +----------+
| Redis Cart  +-------------->| Notification +----------->| Customer |
| (24h idle   |               | Service      |            |          |
|  trigger)   |               +--------------+            +----------+
+-------------+

Recovery flow:
1. Background job: scan carts with updatedAt > 24h ago, status=ACTIVE
2. Check cart still has items (> 0 items)
3. Enqueue notification job
4. Send "You left items in your cart" email with cart link
5. Offer discount coupon after 48h if still abandoned
6. Mark cart as ABANDONED after 30 days of inactivity
```

### 5.8 Flash Sale / High-Concurrency Inventory

#### Flash Sale Architecture

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

#### Pre-Deduction Strategy

Before sale starts:
```
1. Seller confirms: 10,000 units available for flash sale
2. Load into Redis: SET inventory:flash:{skuId} 10000
3. At sale time: DECRBY atomically (Lua script for atomicity)
4. Periodically sync Redis count back to PostgreSQL
5. When Redis hits 0: broadcast "sold out" via pub/sub
```

#### Token Bucket for Rate Limiting

```
+------------------+
| Token Bucket     |
| Capacity: 500    |
| Refill: 500/sec  |
|                  |
| [|||||||||||   ] |
| Current: 300     |
+------------------+

Each request consumes 1 token.
If bucket empty: request rejected with 429.

Redis implementation:
  EVAL lua_token_bucket_script 1 bucket_key max_tokens refill_rate now
```

#### Redis Counter for Hot Products

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

### 5.9 Multi-Warehouse Inventory Routing

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

Warehouse selection algorithm:

```python
def select_warehouse(sku_id: str, qty: int, customer_location: GeoPoint) -> str:
    warehouses = get_warehouses_with_stock(sku_id, min_qty=qty)

    # Score each warehouse
    scored = []
    for wh in warehouses:
        distance_km = haversine(customer_location, wh.location)
        shipping_cost = estimate_shipping_cost(distance_km)
        stock_buffer = wh.available_qty - qty  # prefer warehouses with more buffer

        score = (
            -0.6 * normalize(shipping_cost) +   # lower cost preferred
            -0.3 * normalize(distance_km) +      # closer preferred
            +0.1 * normalize(stock_buffer)       # more buffer preferred
        )
        scored.append((score, wh.id))

    return max(scored, key=lambda x: x[0])[1]
```

### 5.10 Idempotent Order Creation

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

On network retry (same Idempotency-Key):
  |-- POST /checkout/confirm   |                    |
  |   Idempotency-Key: UUID-1  |                    |
  |                            |-- SELECT order     |
  |                            |   WHERE            |
  |                            |   idempotency_key  |
  |                            |   = UUID-1  ------>|
  |                            |<-- existing order--|
  |<-- 200 { orderId } --------|   (same response)  |

Key: Store idempotency_key -> response mapping
     with TTL of 24 hours in Redis for fast lookup
```

### 5.11 Price Consistency: Snapshotting at Order Time

```
Problem: Product price changes after customer adds to cart.
         Customer expects to pay the price they saw.

Solution: Price snapshot strategy

Timeline:
  T=0:  Customer views product at $29.99
  T=1:  Customer adds to cart
        -> cart_items.price_snapshot = 29.99 (locked)
  T=2:  Seller changes price to $34.99
  T=3:  Customer starts checkout
        -> Show price from cart_items.price_snapshot = 29.99
        -> Show warning: "Price may have changed since you added this"
  T=4:  Customer confirms order
        -> order_items.unit_price = 29.99 (from snapshot)
        -> Total charged = 29.99

Rules:
  1. Always snapshot price at add-to-cart time
  2. Re-validate price at checkout preview (warn if changed)
  3. Charge the price shown at checkout confirmation
  4. Never charge more than what was shown; can charge less (sale price)
```

### 5.12 Tax and Shipping Calculation Pipeline

```
POST /v1/checkout/preview
     |
     v
+----+-----------------------------+
| Input Validation                 |
| - Valid cart items               |
| - Valid shipping address         |
| - Items still available          |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| Warehouse Selection              |
| - Determine fulfillment location |
| - Check stock availability       |
| - Split shipment if needed       |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| Shipping Rate Calculation        |
| - Carrier API (UPS/FedEx/USPS)  |
| - Weight + dimensions + distance |
| - Multiple options: standard,    |
|   express, overnight             |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| Tax Calculation                  |
| - Jurisdiction detection         |
|   (country, state, county, city) |
| - Product tax category           |
| - Integration: TaxJar / Avalara  |
| - Cache result for 1 hour        |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| Discount / Coupon Application    |
| - Validate coupon code           |
| - Apply percentage or fixed      |
| - Check minimum order amount     |
| - Check usage limits             |
+----+-----------------------------+
     |
     v
+----+-----------------------------+
| Final Price Assembly             |
| subtotal = sum(qty * unit_price) |
| discount = coupon_discount       |
| shipping = selected_rate         |
| tax = calculated_tax             |
| total = subtotal - discount      |
|         + shipping + tax         |
+----------------------------------+
```

### 5.13 Returns and Refunds

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

Partial refund example:
  Order: 2x product_A + 1x product_B = $100 total
  Return: 1x product_A ($30)
  Refund: $30 (partial)
  Status: Order moves to PARTIALLY_RETURNED
```

Inventory restock decision:

```
+---------------------------+
| Item Returned             |
+---------------------------+
         |
         v
+--------+--------+
| Inspect Item    |
+--------+--------+
         |
  +------+------+
  |             |
  v             v
Good           Damaged/
Condition      Defective
  |             |
  v             v
Restock      Write-off
available_  (do not add
qty += N    back to stock)
             |
             v
         File claim
         with seller
         or insurer
```

### 5.14 Read Scalability: CQRS for Product Catalog

```
Write Path (Strong Consistency Required):
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
Read Path (Eventual Consistency Acceptable):
+----------+    +---------------+
| Customer +--->| Product API   +---> Read from Elasticsearch / Redis / CDN
|          |    | (read model)  |     (stale by max 30 seconds)
+----------+    +---------------+
```

---

## 6. Scaling Strategy

### Database Sharding

```
Orders DB Sharding by user_id:
  Shard 0: user_id hash % 4 == 0
  Shard 1: user_id hash % 4 == 1
  Shard 2: user_id hash % 4 == 2
  Shard 3: user_id hash % 4 == 3

  Benefit: User can query all their orders from one shard
  Trade-off: Cross-user order analytics require scatter-gather

Inventory DB Sharding by seller_id:
  Benefit: Seller's entire inventory on one shard
  Trade-off: Hot sellers create shard hotspots (add read replicas)

Product DB Sharding by category_id:
  Benefit: Category browsing hits one shard
  Trade-off: Product search still needs scatter-gather (use Elasticsearch)
```

### Caching Layers

```
+------------------+------------------+------------------+
| Layer            | Technology       | TTL / Strategy   |
+------------------+------------------+------------------+
| CDN Edge Cache   | CloudFront/Fastly| 5 min (catalog)  |
| Product Cache    | Redis Cluster    | 1 hour (hot)     |
| Inventory Cache  | Redis Cluster    | 5 sec (accuracy) |
| Cart Cache       | Redis Cluster    | 30 days (session)|
| Session Cache    | Redis Cluster    | 24 hours         |
| Tax/Shipping     | Redis            | 1 hour           |
| Search Results   | Elasticsearch    | 30 sec           |
+------------------+------------------+------------------+

Cache invalidation:
- Product update -> invalidate product:{id} + search index update
- Inventory change -> update inventory:{skuId}:{warehouseId} immediately
- Price change -> invalidate product:{id}, notify active carts
```

### Read Replicas

```
Primary DB (writes)
    |
    +---> Replica 1 (order queries, analytics)
    |
    +---> Replica 2 (product catalog reads)
    |
    +---> Replica 3 (reporting / BI)

Replication lag target: < 100ms
Use connection pooling: PgBouncer
```

### Microservice Scaling

```
Service          Scaling Strategy          Instances (normal/peak)
---------------------------------------------------------------------
Product Service  Horizontal (stateless)    5 / 50
Cart Service     Horizontal (stateless)    3 / 20
Order Service    Horizontal (idempotent)   5 / 30
Inventory Svc    Horizontal + sharded DB   5 / 20
Payment Svc      Horizontal (idempotent)   3 / 10
Notification Svc Horizontal + queue-based  3 / 15
Search Service   Elasticsearch cluster     3 node / 10 node
```

---

## 7. Peak Traffic Handling

### Black Friday / Cyber Monday Preparation

```
Pre-Event (1 week before):
1. Capacity planning: 10x normal traffic
2. Pre-warm caches with popular product data
3. Pre-generate static product pages, push to CDN
4. Load test to 150% of projected peak
5. Enable circuit breakers on all external services
6. Increase DB connection pool limits
7. Pre-scale Kubernetes pods (avoid cold start during spike)

During Event:
+---------+    +-----------+    +------------+    +----------+
| Millions|    | CDN       |    | Rate       |    | Service  |
| of      +--->| (90% hit  +--->| Limiter    +--->| Mesh     |
| Users   |    | rate)     |    | (10% pass) |    | (k8s)    |
+---------+    +-----------+    +------------+    +----------+

Traffic distribution:
  90% served from CDN (product pages, images)
  8% served from application cache (Redis)
  2% hit the database

Feature flags for degradation:
  - Disable product recommendations (reduce DB load)
  - Show cached inventory counts (not real-time)
  - Queue all orders (async processing)
  - Disable non-critical APIs (wish lists, reviews)
```

### Flash Sale Flow (10K orders/sec target)

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

Queue-based ordering ensures first-come-first-served fairness and decouples traffic spike from database writes.

---

## 8. Trade-offs

| Decision | Choice Made | Alternative | Trade-off |
|----------|-------------|-------------|-----------|
| Inventory consistency | Strong (optimistic lock + Redis) | Eventual consistency | Prevents overselling at cost of retry complexity |
| Transaction pattern | Saga (orchestration) | 2PC / single DB tx | Fault tolerant but eventual consistency, complex compensation |
| Cart storage | Redis + PostgreSQL | DB only | Faster reads, risk of Redis data loss (mitigated by persistence) |
| Inventory read | Redis cache (5s stale) | DB read always | Faster but may show stale stock; acceptable UX trade-off |
| Order sharding | By user_id | By order date | User queries efficient; date-range queries need scatter-gather |
| Flash sale inventory | Redis pre-deduction | DB with queue | Higher throughput but Redis-DB sync complexity |
| Product reads | CQRS + Elasticsearch | Single DB | Near-linear read scaling but eventual consistency on writes |
| Duplicate orders | Idempotency key in DB | Request dedup cache | Durable guarantee but adds DB constraint |
| Price at checkout | Snapshot at add-to-cart | Real-time price | Predictable UX; seller loses dynamic pricing control |

---

## 9. Common Interview Follow-ups

### Q: How do you handle the "thundering herd" when a popular item restocks?

```
When inventory goes from 0 -> N (restock):
  Problem: Thousands of watchers all get notification, flood the system

Solutions:
  1. Staggered notifications: send emails in batches over 10 minutes
  2. Virtual queue: first N notify-me users get purchase tokens
  3. Rate limit: max 100 users/sec can start checkout for this SKU
  4. Random jitter: delay each user's notification by random(0, 300) seconds
```

### Q: How do you handle payment service downtime?

```
Order Service              Payment Service
     |                           |
     |--- charge request ------->|
     |                    [DOWN] |
     |<-- timeout (5 sec) -------|
     |
     | Retry with exponential backoff:
     |   - Attempt 1: 5 sec
     |   - Attempt 2: 10 sec
     |   - Attempt 3: 20 sec
     |
     | If all retries fail:
     |   - Order stays in PAYMENT_PENDING
     |   - Background job retries for 24h
     |   - Customer notified to retry payment
     |   - Inventory reservation maintained during retry window
     |
     | Circuit breaker opens after 50% failure rate:
     |   - Fail fast: reject new payment requests
     |   - Show maintenance message to customers
     |   - Alert on-call engineer
```

### Q: How do you ensure exactly-once delivery for order events?

```
Producer (Order Service):
  - Use Kafka transactions: producer.initTransactions()
  - Write to Kafka + mark local DB as "event_sent" in same transaction

Consumer (Inventory Service):
  - Track consumed Kafka offsets in own DB
  - Use idempotent processing: check if event already processed
  - Commit offset only AFTER processing complete

At-least-once + idempotent consumer = effectively exactly-once semantics
```

### Q: What happens if the Saga orchestrator crashes mid-saga?

```
Recovery:
  1. Saga state persisted in DB before each step
  2. On orchestrator restart: load all INCOMPLETE sagas
  3. Resume each saga from last known successful step
  4. Each saga step is idempotent (can re-execute safely)

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

### Q: How would you implement real-time inventory updates on the product page?

```
Options:
  1. Short polling (every 30 sec): simple but high server load
  2. Server-Sent Events (SSE): server pushes updates, one-way, simpler than WS
  3. WebSocket: bidirectional, overkill for inventory updates
  4. Long polling: client holds connection open, server responds on change

Recommended: SSE for live inventory
  Client:
    const es = new EventSource('/v1/products/123/inventory/stream')
    es.onmessage = (e) => updateStockDisplay(JSON.parse(e.data))

  Server:
    Redis pub/sub channel: inventory:updates:{skuId}
    SSE handler subscribes, forwards to client
    Update pushed when inventory changes by > 5% or crosses threshold
```

### Q: How do you handle price changes during an active checkout session?

```
T=0: Customer sees $29.99, starts checkout, reservation created
T=5: Seller changes price to $34.99
T=8: Customer confirms order

Policy options:
  A) Honor original price (customer-friendly)
     - Order charged at $29.99 (price when checkout started)
     - Reservation includes locked price

  B) Use current price (seller-friendly)
     - Warn customer of price change before final confirmation
     - Require customer to re-confirm

  C) Use lower of two prices (market-neutral)
     - Best UX: customer always gets favorable price

Implementation for Option A:
  - inventory_reservations.price_locked = 29.99
  - Order creation uses reservation.price_locked
  - Not affected by subsequent price changes
```

### Q: How would you scale the search functionality?

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

Elasticsearch index settings:
  - Shards: 5 primary (one per 20M products)
  - Replicas: 2 (reads can hit any replica)
  - Analyzers: custom tokenizer for product names
  - Synonyms: "cell phone" = "mobile phone" = "smartphone"

Personalization layer (above ES):
  - User's purchase history -> boost preferred brands/categories
  - A/B test ranking algorithms
  - Cache popular query results in Redis (TTL: 5 min)
```

### Q: How do you handle inventory across multiple currencies?

```
Inventory counts are currency-agnostic (units, not money).
Prices are stored per currency in separate table:

CREATE TABLE sku_prices (
    sku_id     UUID NOT NULL,
    currency   CHAR(3) NOT NULL,
    amount     DECIMAL(12, 4) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sku_id, currency)
);

Exchange rates cached in Redis, updated every 15 minutes from FX API.
Price displayed = sku_prices[currency] OR base_price * exchange_rate.
Order records store currency and amount in that currency.
Refunds issued in same currency as original charge.
```

### Q: Design the notification system for order updates

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

User preferences stored in notification_preferences table.
Notification deduplication: track event_id, don't send twice.
Retry with exponential backoff for failed deliveries.
Template system: localized templates per language/region.
```

---

## Summary: Key Design Decisions

```
+-------------------------------+------------------------------------------+
| Challenge                     | Solution                                 |
+-------------------------------+------------------------------------------+
| Overselling prevention        | Redis atomic decrement + optimistic lock |
| Checkout atomicity            | Saga pattern with compensation           |
| Flash sale throughput         | Pre-deduction + virtual queue            |
| Cart durability               | Redis (fast) + PostgreSQL (durable)      |
| Duplicate orders              | Idempotency key constraint in DB         |
| Price consistency             | Snapshot at add-to-cart time             |
| Inventory reads               | Redis cache with 5-second TTL            |
| Product search                | Elasticsearch with CDC from PostgreSQL   |
| Multi-warehouse routing       | Scoring algorithm: distance + cost       |
| Order state management        | Explicit state machine + history table   |
| Abandoned cart recovery       | Background job + email notification      |
| Return/refund flow            | Saga with inventory restock step         |
| Peak traffic                  | CDN + rate limiter + queue + pre-scale   |
+-------------------------------+------------------------------------------+
```
