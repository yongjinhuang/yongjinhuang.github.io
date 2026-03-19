# 设计外卖配送系统 (DoorDash / Uber Eats / Deliveroo)

---

## 1. 需求澄清

### 功能需求

| 类别              | 需求                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **顾客**          | 按位置/菜系浏览餐厅、查看菜单、下单、实时订单追踪、支付、订单历史、对餐厅和骑手评分            |
| **餐厅**          | 接收和管理订单、更新菜品和可用状态、设置营业时间、管理备餐时间、标记订单已备好可取             |
| **骑手**          | 上线/下线、接收配送请求、接受/拒绝、导航至餐厅和顾客、标记订单已取货和已送达、查看收入         |
| **订单管理**      | 完整订单生命周期：已下单 → 已接单 → 备餐中 → 已备好 → 已取货 → 配送中 → 已送达，支持取消和退款 |
| **Dispatch**      | 将可用骑手匹配到订单，考虑距离、负载均衡、订单 batching 以提高效率                             |
| **ETA**           | 实时 ETA（备餐时间 + 骑手行驶时间），每次状态转换时更新                                        |
| **支付**          | 顾客支付扣款、平台暂扣、餐厅结算、骑手结算（扣除佣金）                                         |
| **促销**          | 优惠码、免运费门槛、买一送一 (BOGO)、首单优惠                                                  |
| **Surge Pricing** | 基于每个地理区域供需失衡的动态配送费                                                           |

### 非功能需求

| 需求               | 目标                                        |
| ------------------ | ------------------------------------------- |
| 下单延迟           | < 500ms (p99)                               |
| ETA 准确度         | 90% 的情况下与实际送达时间相差不超过 5 分钟 |
| 骑手��置新鲜度     | < 3 秒延迟                                  |
| 可用性             | 99.99%（每年停机 < 53 分钟）                |
| 订单持久性         | 零丢单（at-least-once，幂等处理）           |
| 订单追踪更新延迟   | 端到端 < 2 秒到达顾客                       |
| 骑手 dispatch 延迟 | < 30 秒分配骑手                             |
| 一致性             | 订单状态转换强一致性；分析数据最终一致性    |

### 规模估算

```
每日订单量：              10,000,000 单/天
活跃餐厅数：              200,000 家餐厅
活跃骑手数：              500,000 名骑手（峰值在线）
并发用户数：              1,000,000（峰值）
峰值订单量：              50,000 单/小时 ~ 14 单/秒
订单接受峰值：            ~1,000 次订单状态转换/秒
骑手位置更新：            500,000 名骑手 * 1 次更新/4 秒 = 125,000 次更新/秒
```

### 粗略计算

**订单写入吞吐量：**

```
10M 单/天 / 86,400 秒 = ~116 单/秒（基线）
峰值系数：4x = ~464 单/秒
每个订单：~5 次状态转换 = 峰值 ~2,320 次写入/秒
```

**骑手位置更新：**

```
500K 活跃骑手 * 每 3-4 秒 1 次更新 = ~140K 次写入/秒
每条位置记录：lat(8) + lng(8) + timestamp(8) + driverId(16) = ~40 字节
存储速率：140K * 40 字节 = ~5.6 MB/秒
1 小时数据量：~20 GB（保存在缓存中，不全部持久化）
```

**存储估算：**

```
订单记录：            ~2 KB（含商品）
10M 单/天：           10M * 2KB = 20 GB/天
1 年：                ~7 TB（热存储 90 天 = 1.8 TB）
菜单数据：            200K 餐厅 * 50 项 * 500 字节 = ~5 GB
骑手位置：            仅存储最新位置：500K * 100 字节 = 50 MB
```

**带宽：**

```
订单追踪 WebSocket：  1M 连接 * 200 字节/更新 * 0.3 次更新/秒 = ~60 MB/秒
地图瓦片请求：        1M 用户 * 10 KB/分钟 = ~167 MB/秒（经 CDN）
```

---

## 2. API 设计

### 顾客端 API

```
GET    /v1/restaurants?lat=&lng=&radius=&cuisine=&page=&limit=
       Response: { restaurants: [{ id, name, rating, deliveryEtaMin, deliveryFee, isOpen }] }

GET    /v1/restaurants/{restaurantId}
       Response: { id, name, address, hours, categories, estimatedPrepTime }

GET    /v1/restaurants/{restaurantId}/menu
       Response: { categories: [{ name, items: [{ id, name, price, description, available }] }] }

POST   /v1/orders
       Body: { restaurantId, items: [{ itemId, quantity, customizations }], deliveryAddress, paymentMethodId, promoCode? }
       Response: { orderId, status, estimatedDelivery, totalAmount, breakdown }

GET    /v1/orders/{orderId}
       Response: { orderId, status, items, driver?, eta, trackingToken }

GET    /v1/orders/{orderId}/tracking
       Response: { driverLocation: { lat, lng }, status, eta, lastUpdated }
       (also available via WebSocket: wss://api/v1/orders/{orderId}/track?token=)

POST   /v1/orders/{orderId}/cancel
       Body: { reason }
       Response: { success, refundAmount, refundEta }

POST   /v1/orders/{orderId}/rate
       Body: { restaurantRating, driverRating, comment }
```

### 骑手 API

```
POST   /v1/drivers/location
       Body: { lat, lng, heading, speed }
       Response: { received: true }

PUT    /v1/drivers/status
       Body: { status: "online" | "offline" | "busy" }

GET    /v1/drivers/deliveries/current
       Response: { delivery?, nextPickup?, batched: [] }

POST   /v1/drivers/deliveries/{deliveryId}/accept
POST   /v1/drivers/deliveries/{deliveryId}/reject
       Body: { reason }

POST   /v1/drivers/deliveries/{deliveryId}/picked-up
       Body: { timestamp, proofPhoto? }

POST   /v1/drivers/deliveries/{deliveryId}/delivered
       Body: { timestamp, proofPhoto, signatureUrl? }

GET    /v1/drivers/earnings?period=week
       Response: { totalEarnings, deliveries, tips, bonuses, breakdown: [] }
```

### 餐厅 API

```
GET    /v1/restaurant/orders?status=&limit=
       Response: { orders: [{ orderId, items, placedAt, estimatedPickup }] }

POST   /v1/restaurant/orders/{orderId}/accept
       Body: { estimatedPrepMinutes }

POST   /v1/restaurant/orders/{orderId}/ready
       Body: { timestamp }

POST   /v1/restaurant/orders/{orderId}/reject
       Body: { reason }

PUT    /v1/restaurant/menu/items/{itemId}
       Body: { available, price, description }

PUT    /v1/restaurant/status
       Body: { isOpen, acceptingOrders, maxConcurrentOrders }

GET    /v1/restaurant/analytics?period=day
       Response: { ordersCompleted, revenue, avgPrepTime, cancelRate }
```

### 促销 API

```
POST   /v1/promotions/validate
       Body: { promoCode, restaurantId, cartValue, userId }
       Response: { valid, discountType, discountValue, minOrderValue, message }

GET    /v1/promotions/available?lat=&lng=&restaurantId=
       Response: { promotions: [{ code, description, discountType, validUntil }] }
```

---

## 3. 数据模型

### 订单表 (PostgreSQL)

```sql
CREATE TABLE orders (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES users(id),
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id),
    driver_id       UUID        REFERENCES drivers(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'placed',
    -- placed, accepted, preparing, ready, picked_up, en_route, delivered, cancelled
    delivery_address JSONB      NOT NULL,  -- { street, city, lat, lng, unit }
    subtotal        BIGINT      NOT NULL,  -- in cents
    delivery_fee    BIGINT      NOT NULL,
    tax             BIGINT      NOT NULL,
    tip             BIGINT      NOT NULL DEFAULT 0,
    discount        BIGINT      NOT NULL DEFAULT 0,
    total           BIGINT      NOT NULL,
    promo_code      VARCHAR(50),
    payment_intent_id VARCHAR(100),
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    ready_at        TIMESTAMPTZ,
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    estimated_prep_minutes INT,
    estimated_delivery_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX idx_orders_driver_id ON orders(driver_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_placed_at ON orders(placed_at);
```

### 订单商品表

```sql
CREATE TABLE order_items (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id    UUID    NOT NULL REFERENCES menu_items(id),
    name            VARCHAR(200) NOT NULL,  -- 下单时的快照
    price           BIGINT  NOT NULL,       -- 快照，单位为分
    quantity        INT     NOT NULL CHECK (quantity > 0),
    customizations  JSONB,                  -- [{ option, choice, priceDelta }]
    subtotal        BIGINT  NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

### 餐厅表

```sql
CREATE TABLE restaurants (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    address         JSONB       NOT NULL,
    location        GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS
    cuisine_types   TEXT[]      NOT NULL DEFAULT '{}',
    rating          NUMERIC(3,2),
    review_count    INT         NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    is_open         BOOLEAN     NOT NULL DEFAULT false,
    accepting_orders BOOLEAN    NOT NULL DEFAULT false,
    max_concurrent_orders INT   NOT NULL DEFAULT 20,
    avg_prep_minutes INT        NOT NULL DEFAULT 20,
    commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.30,  -- 30%
    operating_hours JSONB,
    -- { mon: [{open:"09:00", close:"22:00"}], tue: [...], ... }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_restaurants_location ON restaurants USING GIST(location);
CREATE INDEX idx_restaurants_cuisine ON restaurants USING GIN(cuisine_types);
CREATE INDEX idx_restaurants_is_open ON restaurants(is_open, is_active);
```

### 菜品表

```sql
CREATE TABLE menu_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id),
    category_id     UUID        REFERENCES menu_categories(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           BIGINT      NOT NULL,  -- 单位为分
    image_url       TEXT,
    is_available    BOOLEAN     NOT NULL DEFAULT true,
    dietary_tags    TEXT[]      DEFAULT '{}',  -- vegan, gluten-free 等
    customization_groups JSONB, -- 选项组及选项
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_available ON menu_items(restaurant_id, is_available);
```

### 骑手表

```sql
CREATE TABLE drivers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES users(id),
    vehicle_type    VARCHAR(30) NOT NULL,  -- bike, car, scooter
    license_plate   VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'offline',
    -- offline, online, assigned, picking_up, delivering
    rating          NUMERIC(3,2) NOT NULL DEFAULT 5.0,
    rating_count    INT          NOT NULL DEFAULT 0,
    acceptance_rate NUMERIC(5,4),
    completion_rate NUMERIC(5,4),
    total_deliveries INT         NOT NULL DEFAULT 0,
    is_verified     BOOLEAN      NOT NULL DEFAULT false,
    background_check_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 骑手位置表（Redis 热数据，定期刷入）

```sql
-- 仅用于审计/回放；实时数据保存在 Redis 中
CREATE TABLE driver_location_history (
    driver_id   UUID        NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    heading     SMALLINT,
    speed       NUMERIC(6,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);
-- 按天分区，保留 30 天

CREATE INDEX idx_dlh_driver_time ON driver_location_history(driver_id, recorded_at DESC);
```

### 配送表

```sql
CREATE TABLE deliveries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL UNIQUE REFERENCES orders(id),
    driver_id       UUID        REFERENCES drivers(id),
    batch_id        UUID        REFERENCES delivery_batches(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending, assigned, en_route_pickup, at_restaurant, picked_up, en_route_dropoff, delivered
    restaurant_location JSONB   NOT NULL,
    dropoff_location JSONB      NOT NULL,
    distance_km     NUMERIC(8,3),
    assigned_at     TIMESTAMPTZ,
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    driver_payout   BIGINT,     -- 单位为分
    proof_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 支付表

```sql
CREATE TABLE payments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL REFERENCES orders(id),
    customer_id     UUID        NOT NULL REFERENCES users(id),
    amount          BIGINT      NOT NULL,  -- 单位为分
    currency        CHAR(3)     NOT NULL DEFAULT 'USD',
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending, authorized, captured, refunded, failed
    payment_method  VARCHAR(30) NOT NULL,  -- card, wallet 等
    processor_id    VARCHAR(100),          -- Stripe payment intent ID
    captured_at     TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    refund_amount   BIGINT      DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payouts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type  VARCHAR(20) NOT NULL,  -- restaurant, driver
    recipient_id    UUID        NOT NULL,
    order_id        UUID        NOT NULL REFERENCES orders(id),
    amount          BIGINT      NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, processing, paid, failed
    payout_method   VARCHAR(30),
    processor_ref   VARCHAR(100),
    scheduled_for   TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 评分表

```sql
CREATE TABLE ratings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL REFERENCES orders(id),
    rater_id        UUID        NOT NULL REFERENCES users(id),
    rater_type      VARCHAR(20) NOT NULL,  -- customer, driver
    target_id       UUID        NOT NULL,
    target_type     VARCHAR(20) NOT NULL,  -- restaurant, driver, customer
    rating          SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, rater_type, target_type)
);
```

### 促销表

```sql
CREATE TABLE promotions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE,
    type            VARCHAR(30) NOT NULL,  -- percent_off, flat_off, free_delivery, bogo
    discount_value  BIGINT,     -- 分或基点
    min_order_value BIGINT      NOT NULL DEFAULT 0,
    max_discount    BIGINT,
    restaurant_id   UUID        REFERENCES restaurants(id),  -- NULL = 全平台
    is_first_order  BOOLEAN     NOT NULL DEFAULT false,
    max_uses        INT,
    used_count      INT         NOT NULL DEFAULT 0,
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_until     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. 高层架构

```
+------------------------------------------------------------------------------------+
|                              客户端                                                 |
|  +------------------+   +--------------------+   +--------------------+            |
|  |  顾客 App        |   |  骑手 App          |   |  餐厅 KDS          |            |
|  |  (iOS/Android/   |   |  (iOS/Android)     |   |  (平板/POS)        |            |
|  |   Web)           |   |                    |   |                    |            |
|  +--------+---------+   +----------+---------+   +---------+----------+            |
+-----------|------------------------|------------------------|----------------------+
            |                        |                        |
            |         HTTPS + WSS    |                        |
            v                        v                        v
+------------------------------------------------------------------------------------+
|                           API Gateway / 负载均衡器                                   |
|            (限流、认证、SSL 终止、路由)                                               |
+---+----------------------------+---------------------------+------------------------+
    |                            |                           |
    v                            v                           v
+----------+            +------------------+         +------------------+
| Order    |            | Driver Location  |         | Restaurant       |
| Service  |            | Service          |         | Service          |
+----+-----+            +--------+---------+         +--------+---------+
     |                           |                            |
     |                     +-----+-----+                      |
     |                     | Redis Geo |                      |
     v                     | (H3 Grid) |                      v
+----------+               +-----------+            +------------------+
| Dispatch |<-拉取骑手                   推送       | Menu Service     |
| Service  |  位置                      事件       +------------------+
+----+-----+                                                  |
     |                                                        v
     |                    +------------------+     +------------------+
     +------------------->| ETA Service      |     | Search / Browse  |
     |                    | (ML 模型)        |     | Service          |
     |                    +------------------+     | (Elasticsearch)  |
     v                                             +------------------+
+----------+
| Payment  |
| Service  |
+----------+
     |
     v
+----------+    +------------------+    +------------------+
| Stripe / |    | Notification     |    | Promotions       |
| Processor|    | Service          |    | Engine           |
+----------+    | (推送/SMS/邮件)  |    +------------------+
                +------------------+

+------------------------------------------------------------------------------------+
|                           消息总线 (Kafka)                                           |
|  Topics: order.events | driver.location | payment.events | notification.events     |
+------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------+
|                            数据存储                                                  |
|  +-------------+  +-------------+  +------------------+  +--------------------+   |
|  | PostgreSQL  |  | Redis        |  | Elasticsearch    |  | ClickHouse         |   |
|  | (订单、     |  | (会话、      |  | (餐厅/           |  | (分析、            |   |
|  |  支付、     |  |  骑手位置、  |  |  菜单搜索)       |  |  报表)             |   |
|  |  评分)      |  |  订单缓存)   |  |                  |  |                    |   |
|  +-------------+  +-------------+  +------------------+  +--------------------+   |
+------------------------------------------------------------------------------------+
```

---

## 5. 深入探讨：三方 Marketplace

外卖配送平台必须平衡三个具有不同利益诉求的参与方：

```
+----------------------+       +---------------------+       +--------------------+
|     顾客             |       |     平台            |       |    餐厅            |
|                      |       |                     |       |                    |
| 诉求：               |       | 平衡：              |       | 诉求：             |
| - 快速配送           +<----->| - 供给（骑手）      +<----->| - 稳定订单量       |
| - 准确 ETA           |       | - 需求（订单）      |       | - 可控的订单流量   |
| - 低配送费           |       | - 餐厅容量          |       | - 合理佣金         |
| - 热腾腾的食物       |       | - 质量指标          |       | - 准确的取餐时间   |
+----------------------+       +---------------------+       +--------------------+
                                        ^
                                        |
                               +--------+--------+
                               |     骑手        |
                               |                 |
                               | 诉求：          |
                               | - 更多订单      |
                               | - 更少等待      |
                               | - 合理报酬      |
                               | - 灵活时间      |
                               +-----------------+
```

**关键矛盾点与解决方案：**

| 矛盾                           | 解决方案                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| 顾客想要快速 ETA；餐厅出餐慢   | 显示包含备餐时间的真实 ETA；优先展示出餐快的餐厅                |
| 骑手在餐厅等待过久             | 安排骑手在餐厅接近出餐完成时到达，而非下单后立即 dispatch       |
| 餐厅在高峰期不堪重负           | 订单限流：通过 `max_concurrent_orders` 控制订单量，溢出订单排队 |
| 顾客期望低费用；骑手需要高收入 | 高需求区域 surge pricing，平台出资补贴骑手激励                  |
| 骑手拒单过多                   | 追踪接单率；减少向低接单率骑手 dispatch 或给予处罚              |

---

## 6. 深入探讨：订单生命周期状态机

```
                       +----------+
              顾客     |  PLACED  |
              下单     +----+-----+
                            |
                            | 餐厅接单（或自动接单）
                            v
                      +-----------+
                      | ACCEPTED  |
                      +-----+-----+
                            |
                            | 餐厅开始烹饪
                            v
                      +-----------+
                      | PREPARING |
                      +-----+-----+
                            |
                            | 餐厅标记已备好
                            v
                        +-------+
                        | READY |  <--- KDS 屏幕更新
                        +---+---+
                            |
                            | 骑手到达并取餐
                            v
                      +----------+
                      | PICKED UP|
                      +----+-----+
                            |
                            | 骑手开始配送到顾客
                            v
                       +----------+
                       | EN ROUTE |
                       +----+-----+
                            |
                            | 骑手标记已送达（拍照凭证）
                            v
                      +-----------+
                      | DELIVERED |
                      +-----------+

  异常流程：
  PLACED ------> CANCELLED（顾客在接单前取消，全额退款）
  ACCEPTED ----> CANCELLED（餐厅取消，全额退款 + 致歉优惠券）
  PREPARING ---> CANCELLED（罕见，部分或全额退款，由平台裁定）
```

**状态转换规则：**

```
每次转换必须：
1. 原子性地持久化到 PostgreSQL（单行更新并检查预期状态）
2. 发布到 Kafka `order.events` topic
3. 消费方：Notification Service、ETA Service、骑手 App、KDS

幂等性：每次转换通过以下方式保护：
  UPDATE orders SET status = $new, updated_at = NOW()
  WHERE id = $id AND status = $expected
  RETURNING id;
  -- 0 行受影响 = 并发更新已完成，丢弃当前操作
```

---

## 7. 深入探讨：餐厅管理

### 菜单同步

```
餐厅 POS / 管理后台
        |
        | PUT /v1/restaurant/menu/items/{id}
        v
+-------------------+
| Menu Service      |
+-------------------+
        |
        +---> 更新 PostgreSQL（数据源）
        |
        +---> 失效 Redis 缓存键：menu:{restaurantId}
        |
        +---> 更新 Elasticsearch 索引（用于搜索）
        |
        +---> 发布到 Kafka：menu.updated
              （触发 CDN 边缘缓存清除，如菜单已被 CDN 缓存）
```

**菜品可用性切换（高频操作）：**

- 存储在 Redis 中并设置 TTL：`menu:avail:{restaurantId}:{itemId}` = 0/1
- 下单创建时检查覆盖值；每 60 秒异步同步到 PostgreSQL

### 营业时间和订单限流

```python
# 伪代码：订单接受控制
def can_accept_order(restaurant_id):
    restaurant = get_restaurant(restaurant_id)

    # 检查营业时间
    if not is_within_hours(restaurant.operating_hours, now()):
        return False, "Restaurant is closed"

    # 检查订单限流（Redis 计数器）
    active_orders = redis.get(f"active_orders:{restaurant_id}") or 0
    if active_orders >= restaurant.max_concurrent_orders:
        return False, "Restaurant at capacity"

    return True, None
```

**备餐时间预估：**

- 基础备餐时间由餐厅设置（可按菜品类别配置）
- ML 模型根据以下因素调整：
  - 时段（午餐/晚餐高峰）
  - 餐厅当前活跃订单数
  - 该餐厅的历史偏差
  - 天气（步行流量减少 = 备餐更快）
- 直接影响骑手 dispatch 时机

---

## 8. 深入探讨：骑手 Dispatch 和匹配

### Dispatch 算法

```
+---------------------+          +------------------------+
|  Order Service      |          |  Driver Location Store |
|  (新订单下达)       |          |  Redis GEO ZADD        |
+----------+----------+          +----------+-------------+
           |                                |
           | 发布 order.created             | GEORADIUS 查询
           v                                v
+----------+------------------------------+----------+
|                  Dispatch Service                  |
+----------------------------------------------------+
           |
           | 1. 在半径范围内查找可用骑手（H3 cells）
           | 2. 对候选人评分：
           |    score = alpha * proximity + beta * acceptance_rate
           |             + gamma * (1 - current_load)
           | 3. 向排名前 N 的候选人发送 dispatch 请求
           | 4. 先接受者得（顺序或并行）
           | 5. 如果 30 秒内无人接受，扩大搜索半径
           v
+----------+----------+
|  骑手 App           |
|  (接受/拒绝)        |
+---------------------+
```

**骑手选择评分：**

```
Score = w1 * (1 / distance_km)
      + w2 * acceptance_rate
      + w3 * completion_rate
      + w4 * vehicle_suitability（自行车适合小单，汽车适合大单）

权重（可调）：
  w1 = 0.5   # 距离最重要
  w2 = 0.2
  w3 = 0.2
  w4 = 0.1
```

**接单率管理：**

- 接单率 < 70% 的骑手收到更少的 dispatch 请求
- 接单率以最近 100 次 dispatch 的指数移动平均值追踪
- 接单率极低 → 临时暂停

### 订单 Batching（多点配送）

```
场景：同一餐厅的两个订单，送达地点相距 0.5 km 以内

订单 A：餐厅 X -> 顾客在 123 Main St
订单 B：餐厅 X -> 顾客在 125 Oak Ave（距 123 Main 0.4 km）

Batching 决策：
  - 同一餐厅取餐 = 无额外取餐行程
  - 送达绕行 < 2 km 且增加 < 10 分钟 = 符合 batching 条件
  - 骑手获得额外 batching 奖励
  - 两位顾客显示"合并配送"及更新后的 ETA

路线：骑手 -> 餐厅 X（取 A+B）-> 123 Main St -> 125 Oak Ave
```

---

## 9. 深入探讨：ETA 预测

### ETA 模型输入

```
+---------------------------+
|      ETA Service          |
|  (ML 模型 + 规则)         |
+---------------------------+
| 输入：                     |
|  - 餐厅备餐时间            |  <-- 餐厅的 estimated_prep_minutes
|  - 当前备餐工作量          |  <-- 餐厅的 active_orders 数量
|  - 骑手到餐厅的距离        |  <-- 来自 Redis GEO
|  - 餐厅到顾客的距离        |  <-- 路径规划 API（道路距离，非直线距离）
|  - 历史交通数据            |  <-- 时段 + 星期几模式
|  - 实时交通数据            |  <-- Google Maps / HERE Traffic API
|  - 骑手历史速度            |  <-- 该骑手过去配送的平均速度
|  - 天气状况                |  <-- 天气 API（下雨使配送减慢约 15%）
|  - 订单复杂度              |  <-- 商品数量（复杂订单 = 更多备餐时间）
+---------------------------+
         |
         v
+---------------------------+
| ETA = max(prep_eta,       |
|   driver_to_restaurant)   |
|   + customer_delivery_eta |
|   + buffer_factor         |
+---------------------------+
```

**ETA 更新触发条件：**

1. 餐厅接单（根据实际开始备餐修正）
2. 订单标记已备好（骑手在途 ETA 成为主要指标）
3. 骑手在途期间每 60 秒更新（实时交通重新路由）
4. 骑手显著偏离预期路线
5. 预期路线上检测到交通事件

**ETA 准确度目标：p90 在 5 分钟以内**

- 按餐厅和区域监控
- 持续自报备餐时间不准确的餐厅将被标记审查

---

## 10. 深入探讨：地理空间索引

### H3 六边形网格（Uber 的方案）

```
世界被划分为多种分辨率的六边形单元格：

Resolution 7：~5.16 km 平均边长（城市区域）
Resolution 9：~0.17 km 平均边长（社区区域，用于 surge pricing）
Resolution 11：~25 m 平均边长（骑手级精度，用于 dispatch）

骑手位置 -> H3 Cell ID

相比 geohash 的优势：
  - 等面积单元格（geohash 矩形在极地附近面积差异大）
  - 边界处无形状失真
  - 层级化：resolution 7 包含 49 个 resolution 9 单元格
  - 快速邻居查找以扩展搜索范围
```

**Redis 地理空间存储：**

```
Key: drivers:geo
Type: Redis Sorted Set（内部通过 geohash score 实现 ZADD）

命令：
  GEOADD drivers:geo -122.4194 37.7749 "driver:abc123"
  GEORADIUS drivers:geo -122.41 37.77 3 km ASC COUNT 20

每个骑手的附加状态：
  HSET driver:abc123 status online orderId "" lastSeen 1709301234
  EXPIRE driver:abc123 30  -- 30 秒内无心跳则过期
```

**位置更新管道：**

```
骑手 App（每 3-4 秒）
    |
    | POST /v1/drivers/location
    v
+------------------+
| Location Service |
+------------------+
    |
    +---> GEOADD 到 Redis（主存储）
    |
    +---> 发布到 Kafka：driver.location（按 driver_id 分区）
    |
    +---> 消费方：
          - Dispatch Service（直接从 Redis 读取以获得低延迟）
          - Order Tracking Service（扇出到活跃顾客的 WebSocket）
          - Driver Location History（异步批量写入 ClickHouse）
          - Fraud Detection（GPS spoofing 检测）
```

---

## 11. 深入探讨：Surge Pricing 和配送费

### 动态费用计算

```
+----------------------------+
|   Surge Pricing Engine     |
+----------------------------+
| 每个 H3 区域 (r=9) 的输入：|
|  - demand：订单/分钟       |
|  - supply：在线骑手数      |
|  - fulfillment_rate：%     |
|    5 分钟内完成的订单占比   |
+----------------------------+
         |
         v
demand_supply_ratio = demand / max(supply, 1)

surge_multiplier：
  ratio < 1.0  -> 1.0x（正常）
  ratio 1.0-1.5 -> 1.1x
  ratio 1.5-2.0 -> 1.3x
  ratio 2.0-3.0 -> 1.5x
  ratio > 3.0  -> 2.0x（封顶）

delivery_fee = base_fee * surge_multiplier + distance_component

base_fee：$1.99 - $2.99（取决于城市）
distance_component：超过 2km 阈值后 $0.30/km

每 60 秒按区域重新计算。
存储在 Redis 中：surge:zone:{h3CellId} -> multiplier（TTL 90s）
```

**Surge 期间的骑手激励：**

- 加价收入：平台在高 surge 区域每单额外补贴 $1-3
- 在骑手收入地图上以热力图叠加显示
- 激励区域每 5 分钟重新计算

---

## 12. 深入探讨：实时订单追踪

### 架构

```
骑手 App                     Order Tracking Service         顾客 App
    |                                |                            |
    | POST /drivers/location         |                            |
    |------------------------------> |                            |
    |                                | 1. 更新 Redis GEO          |
    |                                | 2. 检查该骑手的             |
    |                                |    活跃订单                |
    |                                | 3. 将位置扇出到            |
    |                                |    订单的 tracking topic   |
    |                                |                            |
    |                                | Kafka: order.tracking      |
    |                                | 按 orderId 分区            |
    |                                |                            |
    |                                | Tracking WebSocket Server  |
    |                                | （按 orderId 粘性路由）    |
    |                                |<---------------------------|
    |                                | wss://.../orders/{id}/track|
    |                                |                            |
    |                                | 推送位置更新               |
    |                                |--------------------------->|
    |                                | { lat, lng, eta, status }  |
```

**WebSocket 连接管理：**

- 顾客在订单详情页连接
- 每个 WebSocket 服务器处理约 50K 并发连接
- 粘性会话：orderId 通过一致性哈希映射到特定服务器
- 每 30 秒心跳；骑手下线则断开连接
- 降级方案：SSE（Server-Sent Events）用于不支持 WS 的浏览器
- 移动端：长轮询降级用于受限网络

**地图渲染：**

- 骑手位置在更新间通过线性插值平滑（避免跳动）
- 餐厅和顾客标记预加载；仅骑手位置实时传输
- 地图瓦片通过 CDN 提供（非实时流式传输）

---

## 13. 深入探讨：厨房显示系统 (KDS)

```
+------------------+         +------------------+         +------------------+
|  Order Service   |         |  餐厅 App        |         | 骑手 App         |
|                  |         |  (KDS 平板)      |         |                  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         | order.created              |                            |
         | (Kafka 事件)               |                            |
         v                            v                            |
+--------+----------------------------+                            |
|     KDS WebSocket / SSE Stream      |                            |
+--------+----------------------------+                            |
         |                                                         |
         | 新订单出现在厨房屏幕上                                    |
         | 餐厅点击"接单"并设置备餐时间                              |
         |                                                         |
         | order.accepted 事件                                     |
         +-------> Dispatch Service 计算骑手到达时间                |
         |         （骑手应在约 prep_time 分钟后到达）               |
         |                                                         |
         | 厨师准备食物...                                          |
         |                                                         |
         | 餐厅点击"已备好"                                         |
         |                                                         |
         | order.ready 事件 -------> 通知骑手：                     |
         |                            "餐品已备好可取！"            |
         |                                                         |
         | order.picked_up 事件 <--- 骑手点击"已取餐"               |
         |                                                         |
         | KDS 将订单从活跃队列中移除                                |
```

**KDS 功能：**

- 订单按预计取餐时间排序（最早的排在前面）
- 颜色编码：绿色 = 时间充裕，黄色 = 即将取餐，红色 = 骑手已在等待
- 每个订单实时显示备餐倒计时
- 自动接单模式：餐厅可启用固定备餐时间的自动接受
- 队列深度预警：接近 `max_concurrent_orders` 时发出警告

---

## 14. 深入探讨：支付流程

```
                    顾客支付流程
+----------------------------------------------------------------+
|                                                                |
|  1. 下单                                                       |
|     顾客提交订单                                                |
|     -> Payment Service 创建 PaymentIntent (Stripe)             |
|     -> 在银行卡上授权（冻结）全额金额                            |
|     -> 订单创建，状态：authorized                               |
|                                                                |
|  2. 订单送达                                                    |
|     骑手标记已送达                                              |
|     -> Payment Service 扣款 PaymentIntent                      |
|     -> 金额：小计 + 配送费 + 税 + 小费                          |
|     -> 向顾客收费                                               |
|                                                                |
|  3. 餐厅结算                                                    |
|     定时任务运行（T+1 个工作日或每周）：                          |
|     结算金额 = 小计 - 平台佣金 (30%)                            |
|     -> 通过 Stripe Connect 转账至餐厅银行账户                    |
|                                                                |
|  4. 骑手结算                                                    |
|     每日或按需：                                                |
|     骑手报酬 = 配送费分成 + 每公里费率 + 小费                    |
|     -> 通过 Stripe Connect 转账至骑手银行账户                    |
|                                                                |
+----------------------------------------------------------------+

     支付状态图

  [pending] -> [authorized] -> [captured] -> [paid_out]
       |                           |
       v                           v
   [failed]                   [refunded]

  退款场景：
  - 餐厅拒单：全额退款
  - 取餐前取消订单：全额退款
  - 配送问题：部分或全额退款（客服决定）
  - 送错商品：商品信用额度或退款
```

**幂等性：**

- 所有支付操作使用幂等键：`payment:{orderId}:{action}`
- 防止重试时重复收费

---

## 15. 深入探讨：评分和评价系统

### 双向评分流程

```
配送完成后：
+------------------------+
|  顾客评分：             |
|  - 餐厅 (1-5)          |
|  - 骑手 (1-5)          |
|  - 可选评论            |
+------------------------+
         |
         v
+------------------------+         +------------------------+
|  餐厅评分              |         |  骑手评分              |
|  汇总                  |         |  汇总                  |
|  (移动平均，最少 10 条) |         |  (移动平均，最少 5 条) |
+------------------------+         +------------------------+

配送完成后：
+------------------------+
|  骑手评分：             |
|  - 顾客 (1-5)          |
|  - 小费质量（隐含）     |
+------------------------+
         |
         v
+------------------------+
|  顾客评分              |
|  (影响未来              |
|   骑手接单意愿)         |
+------------------------+
```

**评分影响规则：**

- 餐厅评分 < 3.5 持续 30 天：审核团队收到通知，可能下架
- 骑手评分 < 4.0 持续 50 单：需要额外培训
- 骑手评分 < 3.5：账户停用审查
- 顾客评分 < 3.0：在骑手 dispatch 队列中优先级降低

**评价审核：**

- 文字评价通过内容审核（脏话过滤、仇恨言论检测）
- 图片评价（食物照片）存储在 S3，通过 CDN 提供
- 餐厅可回复评价（公开回复，需审核）

---

## 16. 深入探讨：欺诈检测

### 欺诈类型及应对措施

```
+--------------------+----------------------------+---------------------------+
| 欺诈类型           | 检测信号                    | 应对措施                  |
+--------------------+----------------------------+---------------------------+
| 虚假订单           | - 新账号 + 高金额           | 人工审核关卡              |
| (拒付欺诈)         | - 检测到 VPN/代理           | 设备指纹识别              |
|                    | - 地址不匹配               | 频次检查                  |
+--------------------+----------------------------+---------------------------+
| 优惠券滥用         | - 同设备，新账号            | 设备 ID 关联              |
|                    | - 同地址，新邮箱            | 手机验证                  |
|                    | - 优惠券使用频率异常        | 每设备限用一次优惠         |
+--------------------+----------------------------+---------------------------+
| GPS spoofing       | - 位置跳跃 > 200 mph       | 基于物理规律的校验         |
| (骑手欺诈)         | - 骑手"已送达"但            | 蓝牙/NFC 确认             |
|                    |   顾客未收到               | 加速度计交叉检查          |
|                    | - 位置在家中而非           | 行为模式分析              |
|                    |   送达地址                 |                           |
+--------------------+----------------------------+---------------------------+
| 餐厅欺诈           | - 过多取消                  | 取消率监控                |
|                    | - 送错商品                 | 退款模式分析              |
|                    | - 备餐时间虚报             | 实际 vs 自报时间对比      |
+--------------------+----------------------------+---------------------------+
```

**GPS Spoofing 检测：**

```python
def detect_gps_spoofing(driver_id, new_location, new_timestamp):
    last = get_last_location(driver_id)
    if not last:
        return False

    distance_km = haversine(last.location, new_location)
    time_elapsed_hours = (new_timestamp - last.timestamp).seconds / 3600
    speed_kmh = distance_km / max(time_elapsed_hours, 0.001)

    if speed_kmh > 200:  # 道路车辆不可能达到的速度
        flag_for_review(driver_id, "IMPOSSIBLE_SPEED", speed_kmh)
        return True

    return False
```

**优惠券滥用检测：**

- Redis HyperLogLog 追踪每个设备 ID 的不同手机号数量
- 规则：同设备 → 同手机号 → 最多 1 次"首单"优惠
- ML 模型对优惠券兑换进行异常评分（基于已标注的滥用案例训练）

---

## 17. 深入探讨：高峰时段处理

### 基于队列的订单接入

```
正常流量：
顾客 -> API -> Order Service -> PostgreSQL（直接写入）

高峰流量（>80% 容量）：
顾客 -> API -> Order Queue (Kafka/SQS) -> Order Workers -> PostgreSQL

+------------------+
| Order Intake API |
| (始终快速)       |  <- 返回"订单已收到，处理中..."
+--------+---------+
         |
         | 入队到 Kafka：orders.incoming
         v
+------------------+
| Order Worker Pool|
| (自动扩缩)       |
+--------+---------+
         |
         | 出队并处理
         v
+------------------+
| PostgreSQL       |
| (写入容量        |
|  已扩展)         |
+------------------+
```

**餐厅容量管理：**

```
当餐厅达到 max_concurrent_orders 时：

1. Order Service 检测到容量已满
2. 该餐厅的新订单进入"等待"队列
3. 向顾客显示："餐厅繁忙，您的订单已排队。"
4. 当餐厅的某个订单送达后，释放容量位
5. 下一个排队订单发送到餐厅
6. 通知顾客实际接单情况

Redis key：restaurant:capacity:{restaurantId}
  -> 当前计数（接单时 INCR，送达/取消时 DECR）
  -> 最大值来自餐厅设置

Queue key：restaurant:order_queue:{restaurantId}
  -> LPUSH orderId
  -> 有空位时 RPOP
```

**高峰期骑手激励：**

- Surge 区域在骑手地图上以热力叠加显示
- 区域特定奖励："下午 5-8 点市中心每单额外 $2"
- 保底收入："在此区域至少赚 $25/小时"
- 激励资金来源于顾客增加的配送费

---

## 18. 深入探讨：促销引擎

### 优惠码验证流程

```
+------------------+          +---------------------+
| 顾客提交         |          | Promotions Service  |
| 优惠码           +--------> |                     |
+------------------+          | 1. 查找优惠码       |
                              |    (Redis 缓存)     |
                              | 2. 验证规则：       |
                              |    - 是否过期       |
                              |    - 是否满足最低   |
                              |      消费           |
                              |    - 使用次数限制   |
                              |    - 是否首单？     |
                              |    - 指定餐厅？     |
                              | 3. 检查用户         |
                              |    资格             |
                              |    (之前用过？)     |
                              | 4. 返回折扣         |
                              |    计算结果         |
                              +---------------------+
```

**促销类型：**

| 类型            | 示例         | 逻辑                                        |
| --------------- | ------------ | ------------------------------------------- |
| `percent_off`   | 八折         | `discount = cart_subtotal * 0.20`           |
| `flat_off`      | 满 $20 减 $5 | `if subtotal >= min: discount = flat_value` |
| `free_delivery` | 免配送费     | `discount = delivery_fee`                   |
| `bogo`          | 买一送一     | `discount = cheapest_item_price`            |
| `first_order`   | 首单五折     | `check user.total_orders == 0`              |

**原子性使用次数递增：**

```lua
-- Redis Lua 脚本实现原子性促销使用
local current = redis.call('HINCRBY', KEYS[1], 'used_count', 1)
local max = tonumber(redis.call('HGET', KEYS[1], 'max_uses'))
if max and current > max then
    redis.call('HINCRBY', KEYS[1], 'used_count', -1)
    return 0  -- 优惠已用尽
end
return 1  -- 成功
```

---

## 19. 扩展策略

### 数据库扩展

```
PostgreSQL 扩展：
+---------------------------------------------+
| Primary（写入）                              |
|   - 订单、支付、评分                          |
+--------+------------------------------------+
         |
         | 流复制
         v
+--------+--------+  +--------+--------+
| Read Replica 1  |  | Read Replica 2  |
| (订单查询)      |  | (分析)          |
+-----------------+  +-----------------+

订单表分片策略：
  - 按 customer_id 分片（哈希分区）
  - 16 个逻辑分片，4 台物理服务器（每台 4 个分片）
  - 应用层路由表进行分片路由
  - 跨分片查询（如餐厅分析）通过 ClickHouse

餐厅 + 菜单数据：
  - 读多写少；在 Redis 中积极缓存（TTL 5 分钟）
  - CDN 缓存公开菜单页面（TTL 1 分钟，更新时失效）
```

### 骑手位置扩展

```
500K 骑手更新/秒的挑战：
  - 将骑手 ID 分到 64 个 Redis 分片
  - 每个分片处理约 2K 名骑手
  - 位置写入：GEOADD（O(log N)）
  - 地理查询：GEORADIUS 限定在基于区域的 1-3 个分片

极端规模的替代方案：
  - 专用时序数据库（Apache Druid、InfluxDB）用于位置历史
  - 内存网格（自建或 Redis Cluster）用于实时位置
```

### 服务扩展

```
Order Service：
  - 无状态；水平扩展
  - 正常 10 个 pod，高峰自动扩展到 50 个
  - 基于 CPU 的 HPA（Kubernetes）

Dispatch Service：
  - 仅对进行中的 dispatch 追踪有状态（Redis）
  - 水平扩展；按地理区域分区
  - 每个实例处理分配的 H3 区域集

WebSocket（Tracking）Service：
  - 通过 orderId 一致性哈希实现粘性会话
  - 每个 pod：最多 50K 连接
  - 1M 并发用户 -> 最少 20 个 pod
  - 连接元数据（orderId -> pod）存储在 Redis 中
```

### 缓存策略

| 数据                        | 缓存      | TTL     | 失效方式         |
| --------------------------- | --------- | ------- | ---------------- |
| 按区域的餐厅列表            | Redis     | 60 秒   | 餐厅状态变更时   |
| 餐厅菜单                    | Redis     | 5 分钟  | 菜品更新时       |
| 骑手位置                    | Redis GEO | 10 秒   | 持续 GEOADD      |
| 每个区域的 surge multiplier | Redis     | 90 秒   | 每 60 秒重新计算 |
| 优惠码详情                  | Redis     | 5 分钟  | 优惠更新时       |
| 用户会话                    | Redis     | 24 小时 | 登出时           |
| ETA 预测                    | Redis     | 30 秒   | 状态变更时       |

---

## 20. 权衡取舍

| 决策                              | 选择                            | 权衡                                             |
| --------------------------------- | ------------------------------- | ------------------------------------------------ |
| **一致性 vs. 可用性**（订单状态） | 强一致性（PostgreSQL + 乐观锁） | 延迟略高；零状态转换丢失                         |
| **骑手位置存储**                  | Redis GEO（非 PostgreSQL）      | 失去 ACID 保证；获得 10 倍吞吐量                 |
| **ETA 计算**                      | 混合方案（规则 + ML）vs. 纯 ML  | 规则可解释且快速；ML 更准确但不透明              |
| **Dispatch：顺序 vs. 并行**       | 并行向前 3 名骑手发送           | 更可靠的接单率；先到先得避免等待                 |
| **高峰订单队列**                  | 异步队列 vs. 直接写入           | 确认略有延迟；防止数据库过载                     |
| **支付扣款时机**                  | 送达时扣款（非下单时）          | 保护顾客；增加拒付风险窗口                       |
| **配送 batching**                 | 基于路线效率的可选 batching     | 提高骑手经济效益；增加顾客配送时间               |
| **地理空间系统**                  | H3（Uber）vs. Geohash           | H3 等面积更适合 surge 区域；geohash 实现更简单   |
| **WebSocket vs. 轮询**            | 用 WebSocket 做追踪             | 更低延迟，更高基础设施成本；轮询在低规模时更简单 |
| **餐厅结算时机**                  | T+1 或每周批量结算              | 每周减少交易成本；每日改善餐厅现金流             |

---

## 21. 常见面试追问

**问：如果餐厅在订单过程中突然关闭（火灾、紧急情况），如何处理？**

答：餐厅 App 触发 `PUT /restaurant/status { isOpen: false, acceptingOrders: false }`。处于 `placed` 或 `accepted` 状态的活跃订单自动取消并全额退款。处于 `preparing` 或 `ready` 状态的订单触发顾客通知和客服升级 — 平台可能提供全额退款加信用额度补偿。Kafka 事件 `restaurant.emergency_close` 触发下游通知流程。

**问：如果骑手在配送途中失联（手机没电、GPS 丢失），怎么办？**

答：通过心跳超时检测 — 如果活跃配送中超过 60 秒没有位置更新，则通知运营团队。3 分钟无响应后，系统尝试重新 dispatch 新骑手到餐厅（如果食物尚未取走）或将配送标记为异常交由客服处理。骑手账户被标记审查。

**问：如何防止两个顾客同时被分配同一个骑手？**

答：Dispatch Service 使用原子 Redis 操作 `SET driver:{driverId}:assigned orderId NX EX 60`（不存在时设置）。只有一次分配能成功。失败的分配触发排名列表中的下一个候选人。锁在 60 秒后过期，如果没有确认到达（如骑手拒绝请求），则释放骑手。

**问：如何确保餐厅将商品标记为不可用时，正在进行的订单中的商品不受影响？**

答：下单时检查商品可用性，并将价格/名称的快照存储在 `order_items` 中。下单后，存储的快照是权威数据 — 即使餐厅将商品标记为不可用，进行中的订单不受影响。不可用状态仅阻止新订单包含该商品。

**问：如何处理大规模被滥用的促销活动（闪电滥用）？**

答：按用户 ID + 设备指纹限流。Redis 中的 Lua 脚本原子计数器防止竞态条件。ML 模型评分对高风险兑换进行人工审核。设备指纹将新账号与已知滥用者设备关联。频次规则：每用户每小时最多 3 次优惠码验证。

**问：当交通突然恶化时，ETA 如何更新？**

答：ETA Service 订阅第三方 API（Google Maps Directions API 或 HERE Traffic）的实时交通事件。当路线发生重大变化（行驶时间增加 >10%）时，重新计算 ETA 并发布 `order.eta_updated` 事件到 Kafka。Tracking WebSocket Service 在 2 秒内将新 ETA 推送到顾客 App。ETA 历史记录用于 ML 模型再训练。

**问：如何扩展到当前负载的 10 倍？**

答：水平扩展 Order Service 和 Dispatch Service 的 pod。Redis 集群骑手位置分片从 16 扩展到 64 个节点。PostgreSQL 订单表从 4 台物理服务器分片到 16 台。ETA 计算迁移到支持 GPU 的专用集群进行 ML 推理。增加区域部署（读操作多区域主主，写操作主备）。部署更靠近顾客的 CDN 节点以减少 API Gateway 延迟。

**问：在浏览页面（下单前），如何计算餐厅的 ETA？**

答：在浏览/发现阶段，ETA 使用以下方式近似计算：

1. 餐厅的 `avg_prep_minutes`
2. 顾客到餐厅的直线距离（乘以道路系数 road_factor = 1.3）
3. 基于区域骑手供给量估算的骑手取餐延迟
4. 该近似 ETA 按区域（非按用户）缓存在 Redis 中（TTL 2 分钟）
5. 其精度不如下单后使用实际分配骑手计算的 ETA

**问：如何处理部分订单退款（缺少一件商品）？**

答：顾客通过 App 报告 → 客服或自动化流程检查索赔合理性（可选图片证据）。退款金额 = 缺失商品价格 + 对应比例的税。通过 Stripe 退款 API 在 24 小时内处理。餐厅的表现指标更新：`missing_item_rate`。高比率触发质量审查。除非怀疑配送篡改（GPS 显示与配送不一致的走走停停），否则不对骑手处罚。

**问：分布式组件之间的一致性保证是什么？**

答：订单状态机使用强一致性（PostgreSQL + 乐观锁）。骑手位置是最终一致的 — Redis 可能延迟最多 3 秒。支付使用 Stripe 的外部强一致性。菜单可用性是最终一致的 — Redis 覆盖在 PostgreSQL 同步前可能延迟最多 60 秒。系统对读操作（浏览、菜单）优先保证可用性和分区容错性，对写操作（下单、支付、状态转换）优先保证一致性。

---

## 22. 系统架构 — 详细组件视图

```
+-------------------------------------------------------------------------------------------+
|                                   顾客旅程                                                 |
|                                                                                           |
|  浏览 -> 加入购物车 -> 结账 -> 追踪 -> 收餐 -> 评价                                        |
+-------------------------------------------------------------------------------------------+

+------------------+    +-------------------+    +------------------+    +------------------+
|  Browse &        |    |  Order Service    |    |  Dispatch        |    |  Tracking        |
|  Search          |    |                  |    |  Service         |    |  Service         |
|  Service         |    |  - Order CRUD    |    |                  |    |                  |
|                  |    |  - 状态机        |    |  - 骑手匹配      |    |  - WebSocket hub |
|  - Elasticsearch |    |  - 容量控制      |    |  - 订单 batch    |    |  - 位置扇出      |
|  - 地理查询      |    |  - Kafka 发布    |    |  - H3 地理查询   |    |  - SSE 降级      |
|  - Redis 缓存    |    |                  |    |  - Surge 感知    |    |                  |
+------+-----------+    +--------+---------+    +--------+---------+    +--------+---------+
       |                         |                       |                       |
       |                         v                       v                       v
       |              +----------+--------+   +----------+--------+   +----------+--------+
       |              |  PostgreSQL       |   |  Redis Cluster    |   |  Kafka             |
       |              |  (订单、用户、    |   |  - Driver GEO     |   |  - order.events    |
       |              |   支付、         |   |  - 会话           |   |  - driver.location |
       |              |   餐厅)          |   |  - 菜单缓存       |   |  - notifications   |
       |              |  Replica Set +    |   |  - Surge mults    |   |  - payment.events  |
       |              |  Read Replicas    |   |  - 优惠缓存       |   +--------------------+
       |              +-------------------+   +-------------------+
       |
       v
+------------------+
|  CDN             |
|  (菜单页面、     |
|   地图瓦片、     |
|   餐厅           |
|   图片)          |
+------------------+

+------------------+    +-------------------+    +------------------+    +------------------+
|  ETA Service     |    |  Payment Service  |    |  Promotions      |    |  Notification    |
|                  |    |                  |    |  Engine          |    |  Service         |
|  - ML 模型       |    |  - Stripe API    |    |                  |    |                  |
|  - Traffic API   |    |  - 授权/扣款     |    |  - 优惠码验证    |    |  - 推送 (FCM)    |
|  - 备餐预估      |    |  - 结算队列      |    |  - 滥用检测      |    |  - SMS (Twilio)  |
|  - 实时          |    |  - 幂等性        |    |  - 使用次数      |    |  - 邮件 (SES)    |
|    重新路由      |    |  - 退款流程      |    |    原子计数器    |    |  - 应用内        |
+------------------+    +-------------------+    +------------------+    +------------------+

+------------------+    +-------------------+    +------------------+
|  Fraud Detection |    |  Restaurant KDS   |    |  Analytics       |
|  Service         |    |  Gateway          |    |  (ClickHouse)    |
|                  |    |                  |    |                  |
|  - GPS spoof     |    |  - WebSocket/SSE |    |  - 订单漏斗      |
|  - 优惠滥用      |    |  - 订单队列      |    |  - 骑手表现      |
|  - 虚假订单      |    |  - 备餐计时器    |    |  - ETA 准确度    |
|  - ML 评分       |    |  - 容量管理      |    |  - 营收          |
+------------------+    +-------------------+    +------------------+
```

---

## 23. 监控与可观测性

### 关键指标

**业务指标（实时仪表盘）：**

- 每分钟订单量，区域分布
- 订单履约率（成功送达百分比）
- 平均配送时间 vs. ETA
- 骑手利用率（骑手忙碌时间百分比）
- 餐厅接单率
- 顾客满意度评分（CSAT，来自评分）

**基础设施指标：**

- 下单 p50/p95/p99 延迟
- 骑手位置更新延迟（新鲜度）
- Dispatch 延迟（从下单到分配骑手的时间）
- WebSocket 连接数和断连率
- Kafka 每个 topic/partition 的消费者延迟
- Redis 内存利用率和淘汰率

**告警规则：**

```
- 订单履约率 < 95% 持续 5 分钟 -> PagerDuty 告警
- 骑手分配 p99 > 60 秒 -> 自动扩展 Dispatch Service
- Kafka 消费者延迟 > 10K 消息 -> 扩展消费者组
- Redis 淘汰率 > 0 -> 扩展 Redis 集群
- 支付失败率 > 1% -> 通知支付团队
- 任何订单在某状态停留 > 30 分钟 -> 进入客服升级队列
```

### 分布式追踪

- 每个订单请求打上 `traceId`，跨所有服务传播
- 使用 Jaeger 或 Datadog APM 进行跨服务追踪可视化
- 追踪采样：错误 100%，成功请求 5%
- 支持根因分析："为什么这个特定订单很慢？"
