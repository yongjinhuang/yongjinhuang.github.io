# Design a Food Delivery System (DoorDash / Uber Eats / Deliveroo)

---

## 1. Requirements Clarification

### Functional Requirements

| Category | Requirements |
|----------|-------------|
| **Customer** | Browse restaurants by location/cuisine, view menus, place orders, real-time order tracking, payment, order history, rate restaurant and driver |
| **Restaurant** | Receive and manage incoming orders, update menu items and availability, set operating hours, manage prep time, mark orders ready for pickup |
| **Driver** | Go online/offline, receive delivery requests, accept/reject, navigation to restaurant and customer, mark order picked up and delivered, view earnings |
| **Order Management** | Full order lifecycle: Placed → Accepted → Preparing → Ready → Picked Up → En Route → Delivered, support cancellations and refunds |
| **Dispatch** | Match available driver to order, consider proximity, load balancing, order batching for efficiency |
| **ETA** | Real-time ETA for food prep + driver travel, updates on every state transition |
| **Payments** | Customer payment capture, platform hold, restaurant payout, driver payout with commission deduction |
| **Promotions** | Promo codes, free delivery thresholds, BOGO, first-order discounts |
| **Surge Pricing** | Dynamic delivery fee based on demand/supply imbalance per geographic zone |

### Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Order placement latency | < 500ms (p99) |
| ETA accuracy | Within 5 minutes of actual delivery time, 90% of the time |
| Driver location freshness | < 3 seconds stale |
| Availability | 99.99% (< 53 minutes downtime/year) |
| Order durability | Zero lost orders (at-least-once, idempotent processing) |
| Order tracking update latency | < 2 seconds end-to-end to customer |
| Driver dispatch latency | < 30 seconds to assign a driver |
| Consistency | Strong consistency for order state transitions; eventual for analytics |

### Scale Estimates

```
Daily orders:              10,000,000 orders/day
Active restaurants:        200,000 restaurants
Active drivers:            500,000 drivers online at peak
Concurrent users:          1,000,000 at peak
Peak orders:               50,000 orders/hour ~ 14 orders/sec
Order acceptance peak:     ~1,000 order state transitions/sec
Driver location updates:   500,000 drivers * 1 update/4 sec = 125,000 updates/sec
```

### Back-of-Envelope Calculations

**Order Write Throughput:**
```
10M orders/day / 86,400 sec = ~116 orders/sec baseline
Peak factor: 4x = ~464 orders/sec
Each order: ~5 state transitions = ~2,320 writes/sec at peak
```

**Driver Location Updates:**
```
500K active drivers * 1 update every 3-4 seconds = ~140K writes/sec
Each location record: lat(8) + lng(8) + timestamp(8) + driverId(16) = ~40 bytes
Storage rate: 140K * 40 bytes = ~5.6 MB/sec
1 hour of data: ~20 GB (kept in cache, not all persisted)
```

**Storage Estimates:**
```
Order record:         ~2 KB (with items)
10M orders/day:       10M * 2KB = 20 GB/day
1 year:               ~7 TB (hot storage 90 days = 1.8 TB)
Menu data:            200K restaurants * 50 items * 500 bytes = ~5 GB
Driver location:      Only last-known stored: 500K * 100 bytes = 50 MB
```

**Bandwidth:**
```
Order tracking WebSocket:  1M connections * 200 bytes/update * 0.3 update/sec = ~60 MB/sec
Map tile requests:         1M users * 10 KB/min = ~167 MB/sec (via CDN)
```

---

## 2. API Design

### Customer-Facing API

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

### Driver API

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

### Restaurant API

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

### Promotions API

```
POST   /v1/promotions/validate
       Body: { promoCode, restaurantId, cartValue, userId }
       Response: { valid, discountType, discountValue, minOrderValue, message }

GET    /v1/promotions/available?lat=&lng=&restaurantId=
       Response: { promotions: [{ code, description, discountType, validUntil }] }
```

---

## 3. Data Model

### Orders Table (PostgreSQL)

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

### Order Items Table

```sql
CREATE TABLE order_items (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id    UUID    NOT NULL REFERENCES menu_items(id),
    name            VARCHAR(200) NOT NULL,  -- snapshot at time of order
    price           BIGINT  NOT NULL,       -- snapshot in cents
    quantity        INT     NOT NULL CHECK (quantity > 0),
    customizations  JSONB,                  -- [{ option, choice, priceDelta }]
    subtotal        BIGINT  NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

### Restaurants Table

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

### Menu Items Table

```sql
CREATE TABLE menu_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id),
    category_id     UUID        REFERENCES menu_categories(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           BIGINT      NOT NULL,  -- in cents
    image_url       TEXT,
    is_available    BOOLEAN     NOT NULL DEFAULT true,
    dietary_tags    TEXT[]      DEFAULT '{}',  -- vegan, gluten-free, etc.
    customization_groups JSONB, -- option groups with choices
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_available ON menu_items(restaurant_id, is_available);
```

### Drivers Table

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

### Driver Locations Table (Hot in Redis, periodically flushed)

```sql
-- Only used for audit/replay; real-time data lives in Redis
CREATE TABLE driver_location_history (
    driver_id   UUID        NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    heading     SMALLINT,
    speed       NUMERIC(6,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);
-- Partitioned by day, retained 30 days

CREATE INDEX idx_dlh_driver_time ON driver_location_history(driver_id, recorded_at DESC);
```

### Deliveries Table

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
    driver_payout   BIGINT,     -- in cents
    proof_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Payments Table

```sql
CREATE TABLE payments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL REFERENCES orders(id),
    customer_id     UUID        NOT NULL REFERENCES users(id),
    amount          BIGINT      NOT NULL,  -- in cents
    currency        CHAR(3)     NOT NULL DEFAULT 'USD',
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending, authorized, captured, refunded, failed
    payment_method  VARCHAR(30) NOT NULL,  -- card, wallet, etc.
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

### Ratings Table

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

### Promotions Table

```sql
CREATE TABLE promotions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE,
    type            VARCHAR(30) NOT NULL,  -- percent_off, flat_off, free_delivery, bogo
    discount_value  BIGINT,     -- cents or basis points
    min_order_value BIGINT      NOT NULL DEFAULT 0,
    max_discount    BIGINT,
    restaurant_id   UUID        REFERENCES restaurants(id),  -- NULL = platform-wide
    is_first_order  BOOLEAN     NOT NULL DEFAULT false,
    max_uses        INT,
    used_count      INT         NOT NULL DEFAULT 0,
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_until     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. High-Level Architecture

```
+------------------------------------------------------------------------------------+
|                              CLIENTS                                               |
|  +------------------+   +--------------------+   +--------------------+            |
|  |  Customer App    |   |  Driver App        |   |  Restaurant KDS    |            |
|  |  (iOS/Android/   |   |  (iOS/Android)     |   |  (Tablet/POS)      |            |
|  |   Web)           |   |                    |   |                    |            |
|  +--------+---------+   +----------+---------+   +---------+----------+            |
+-----------|------------------------|------------------------|----------------------+
            |                        |                        |
            |         HTTPS + WSS    |                        |
            v                        v                        v
+------------------------------------------------------------------------------------+
|                           API GATEWAY / LOAD BALANCER                              |
|            (Rate Limiting, Auth, SSL Termination, Routing)                         |
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
| Dispatch |<-pulls driver               push      | Menu Service     |
| Service  |  locations                 events     +------------------+
+----+-----+                                                  |
     |                                                        v
     |                    +------------------+     +------------------+
     +------------------->| ETA Service      |     | Search / Browse  |
     |                    | (ML model)       |     | Service          |
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
+----------+    | (Push/SMS/Email) |    +------------------+
                +------------------+

+------------------------------------------------------------------------------------+
|                           MESSAGE BUS (Kafka)                                      |
|  Topics: order.events | driver.location | payment.events | notification.events     |
+------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------+
|                            DATA STORES                                             |
|  +-------------+  +-------------+  +------------------+  +--------------------+   |
|  | PostgreSQL  |  | Redis        |  | Elasticsearch    |  | ClickHouse         |   |
|  | (Orders,    |  | (Sessions,   |  | (Restaurant /    |  | (Analytics,        |   |
|  |  Payments,  |  |  Driver Loc, |  |  Menu Search)    |  |  Reporting)        |   |
|  |  Ratings)   |  |  Order Cache)|  |                  |  |                    |   |
|  +-------------+  +-------------+  +------------------+  +--------------------+   |
+------------------------------------------------------------------------------------+
```

---

## 5. Deep Dive: Three-Sided Marketplace

The food delivery platform must balance three distinct parties with conflicting incentives:

```
+----------------------+       +---------------------+       +--------------------+
|     CUSTOMER         |       |     PLATFORM        |       |    RESTAURANT      |
|                      |       |                     |       |                    |
| Wants:               |       | Balances:           |       | Wants:             |
| - Fast delivery      +<----->| - Supply (drivers)  +<----->| - Steady orders    |
| - Accurate ETA       |       | - Demand (orders)   |       | - Manageable flow  |
| - Low delivery fee   |       | - Restaurant cap    |       | - Fair commission  |
| - Hot fresh food     |       | - Quality metrics   |       | - Accurate pickup  |
+----------------------+       +---------------------+       +--------------------+
                                        ^
                                        |
                               +--------+--------+
                               |     DRIVER      |
                               |                 |
                               | Wants:          |
                               | - More orders   |
                               | - Less wait     |
                               | - Fair pay      |
                               | - Flexible hrs  |
                               +-----------------+
```

**Key Tension Points and Resolutions:**

| Tension | Resolution |
|---------|------------|
| Customer wants fast ETA; restaurant is slow | Show realistic ETA with prep time factored in; surface restaurants with fast prep |
| Driver waits at restaurant too long | Dispatch driver to arrive near restaurant-ready time, not immediately after order placed |
| Restaurant overwhelmed at peak | Order throttling: gate orders via `max_concurrent_orders`, queue overflow orders |
| Customer expects low fee; driver needs high pay | Surge pricing in high-demand zones, driver incentives funded by platform |
| Driver rejects too many orders | Track acceptance rate; reduce dispatches or penalize low-acceptance drivers |

---

## 6. Deep Dive: Order Lifecycle State Machine

```
                       +----------+
              Customer |  PLACED  |
              places   +----+-----+
              order         |
                            | Restaurant accepts (or auto-accepts)
                            v
                      +-----------+
                      | ACCEPTED  |
                      +-----+-----+
                            |
                            | Restaurant starts cooking
                            v
                      +-----------+
                      | PREPARING |
                      +-----+-----+
                            |
                            | Restaurant marks ready
                            v
                        +-------+
                        | READY |  <--- KDS screen update
                        +---+---+
                            |
                            | Driver arrives and picks up
                            v
                      +----------+
                      | PICKED UP|
                      +----+-----+
                            |
                            | Driver starts driving to customer
                            v
                       +----------+
                       | EN ROUTE |
                       +----+-----+
                            |
                            | Driver marks delivered (proof photo)
                            v
                      +-----------+
                      | DELIVERED |
                      +-----------+

  Exception flows:
  PLACED ------> CANCELLED (by customer before acceptance, full refund)
  ACCEPTED ----> CANCELLED (by restaurant, full refund + apology credit)
  PREPARING ---> CANCELLED (rare, partial or full refund, platform discretion)
```

**State Transition Rules:**

```
Each transition must be:
1. Persisted atomically to PostgreSQL (single row update with expected status check)
2. Published to Kafka `order.events` topic
3. Consumed by: Notification Service, ETA Service, Driver App, KDS

Idempotency: Each transition guarded by:
  UPDATE orders SET status = $new, updated_at = NOW()
  WHERE id = $id AND status = $expected
  RETURNING id;
  -- 0 rows affected = concurrent update won, discard
```

---

## 7. Deep Dive: Restaurant Management

### Menu Synchronization

```
Restaurant POS / Admin Portal
        |
        | PUT /v1/restaurant/menu/items/{id}
        v
+-------------------+
| Menu Service      |
+-------------------+
        |
        +---> Update PostgreSQL (source of truth)
        |
        +---> Invalidate Redis cache key: menu:{restaurantId}
        |
        +---> Update Elasticsearch index (for search)
        |
        +---> Publish to Kafka: menu.updated
              (triggers CDN edge cache purge if menu is CDN-cached)
```

**Item Availability Toggle (High Frequency):**
- Stored in Redis with TTL: `menu:avail:{restaurantId}:{itemId}` = 0/1
- Override checked at order creation; async synced to PostgreSQL every 60 seconds

### Operating Hours & Order Throttling

```python
# Pseudocode: Order acceptance gate
def can_accept_order(restaurant_id):
    restaurant = get_restaurant(restaurant_id)

    # Check operating hours
    if not is_within_hours(restaurant.operating_hours, now()):
        return False, "Restaurant is closed"

    # Check order throttling (Redis counter)
    active_orders = redis.get(f"active_orders:{restaurant_id}") or 0
    if active_orders >= restaurant.max_concurrent_orders:
        return False, "Restaurant at capacity"

    return True, None
```

**Prep Time Estimation:**
- Base prep time set by restaurant (configurable per item category)
- ML model adjusts based on:
  - Time of day (lunch/dinner rush)
  - Current active order count at restaurant
  - Historical variance for this restaurant
  - Weather (slower foot traffic = faster prep)
- Feeds directly into driver dispatch timing

---

## 8. Deep Dive: Driver Dispatch and Matching

### Dispatch Algorithm

```
+---------------------+          +------------------------+
|  Order Service      |          |  Driver Location Store |
|  (new order placed) |          |  Redis GEO ZADD        |
+----------+----------+          +----------+-------------+
           |                                |
           | Publish order.created          | GEORADIUS query
           v                                v
+----------+------------------------------+----------+
|                  Dispatch Service                  |
+----------------------------------------------------+
           |
           | 1. Find available drivers within radius (H3 cells)
           | 2. Score candidates:
           |    score = alpha * proximity + beta * acceptance_rate
           |             + gamma * (1 - current_load)
           | 3. Send dispatch request to top N candidates
           | 4. First to accept wins (sequential or parallel)
           | 5. If no acceptance in 30s, expand search radius
           v
+----------+----------+
|  Driver App         |
|  (accepts/rejects)  |
+---------------------+
```

**Driver Selection Scoring:**

```
Score = w1 * (1 / distance_km)
      + w2 * acceptance_rate
      + w3 * completion_rate
      + w4 * vehicle_suitability (bike for small orders, car for large)

Weights (tunable):
  w1 = 0.5   # proximity most important
  w2 = 0.2
  w3 = 0.2
  w4 = 0.1
```

**Acceptance Rate Management:**
- Drivers with acceptance rate < 70% receive fewer dispatch requests
- Rate tracked as exponential moving average over last 100 dispatches
- Very low acceptance rate → temporary suspension

### Order Batching (Multi-Drop)

```
Scenario: Two orders from same restaurant, dropped within 0.5 km of each other

Order A: Restaurant X -> Customer at 123 Main St
Order B: Restaurant X -> Customer at 125 Oak Ave (0.4 km from 123 Main)

Batching Decision:
  - Same restaurant pickup = zero extra travel to pickup
  - Drop-off detour < 2 km AND adds < 10 min = eligible to batch
  - Driver earns extra per-batch bonus
  - Both customers shown "batched delivery" with updated ETA

Route: Driver -> Restaurant X (pick up A+B) -> 123 Main St -> 125 Oak Ave
```

---

## 9. Deep Dive: ETA Prediction

### ETA Model Inputs

```
+---------------------------+
|      ETA Service          |
|  (ML Model + Rules)       |
+---------------------------+
| Inputs:                   |
|  - Restaurant prep time   |  <-- estimated_prep_minutes from restaurant
|  - Current prep workload  |  <-- active_orders count at restaurant
|  - Driver distance to     |  <-- from Redis GEO
|    restaurant             |
|  - Customer distance from |  <-- routing API (road distance, not crow-flies)
|    restaurant             |
|  - Historical traffic     |  <-- time-of-day + day-of-week patterns
|  - Real-time traffic      |  <-- Google Maps / HERE Traffic API
|  - Driver speed history   |  <-- avg speed from past deliveries by this driver
|  - Weather conditions     |  <-- weather API (rain slows delivery ~15%)
|  - Order complexity       |  <-- number of items (complex orders = more prep)
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

**ETA Update Triggers:**
1. Order accepted by restaurant (revise based on actual prep start)
2. Order marked ready (driver en route ETA becomes primary)
3. Every 60 seconds while driver en route (real-time traffic rerouting)
4. Driver deviates significantly from expected route
5. Traffic event detected on expected route

**ETA Accuracy Target: p90 within 5 minutes**
- Monitored per restaurant and per zone
- Restaurants with consistently inaccurate prep time self-reporting flagged for review

---

## 10. Deep Dive: Geospatial Indexing

### H3 Hexagonal Grid (Uber's approach)

```
World divided into hexagonal cells at multiple resolutions:

Resolution 7:  ~5.16 km avg edge length  (city zones)
Resolution 9:  ~0.17 km avg edge length  (neighborhood zones, used for surge pricing)
Resolution 11: ~25 m avg edge length     (driver-level precision, used for dispatch)

Driver Location -> H3 Cell ID

Benefits over geohash:
  - Equal-area cells (geohash rectangles vary in area near poles)
  - No shape distortion at boundaries
  - Hierarchical: resolution 7 contains 49 resolution 9 cells
  - Fast neighbor lookup for search expansion
```

**Redis Geospatial Storage:**

```
Key: drivers:geo
Type: Redis Sorted Set (ZADD with geohash score internally)

Commands:
  GEOADD drivers:geo -122.4194 37.7749 "driver:abc123"
  GEORADIUS drivers:geo -122.41 37.77 3 km ASC COUNT 20

Additional per-driver state:
  HSET driver:abc123 status online orderId "" lastSeen 1709301234
  EXPIRE driver:abc123 30  -- expire if no heartbeat in 30 seconds
```

**Location Update Pipeline:**

```
Driver App (every 3-4 sec)
    |
    | POST /v1/drivers/location
    v
+------------------+
| Location Service |
+------------------+
    |
    +---> GEOADD to Redis (primary)
    |
    +---> Publish to Kafka: driver.location (partitioned by driver_id)
    |
    +---> Consumers:
          - Dispatch Service (reads from Redis directly for low latency)
          - Order Tracking Service (fan-out to active customer WebSockets)
          - Driver Location History (async batch write to ClickHouse)
          - Fraud Detection (GPS spoofing check)
```

---

## 11. Deep Dive: Surge Pricing and Delivery Fee

### Dynamic Fee Calculation

```
+----------------------------+
|   Surge Pricing Engine     |
+----------------------------+
| Inputs per H3 zone (r=9):  |
|  - demand: orders/min      |
|  - supply: online drivers  |
|  - fulfillment_rate: %     |
|    orders fulfilled <5 min |
+----------------------------+
         |
         v
demand_supply_ratio = demand / max(supply, 1)

surge_multiplier:
  ratio < 1.0  -> 1.0x  (normal)
  ratio 1.0-1.5 -> 1.1x
  ratio 1.5-2.0 -> 1.3x
  ratio 2.0-3.0 -> 1.5x
  ratio > 3.0  -> 2.0x  (capped)

delivery_fee = base_fee * surge_multiplier + distance_component

base_fee: $1.99 - $2.99 depending on city
distance_component: $0.30/km over 2km threshold

Recalculated every 60 seconds per zone.
Stored in Redis: surge:zone:{h3CellId} -> multiplier (TTL 90s)
```

**Driver Incentives During Surge:**
- Boost pay: platform adds $1-3 per delivery in high-surge zones
- Shown to drivers on earnings map heat overlay
- Incentive zones recalculated every 5 minutes

---

## 12. Deep Dive: Real-Time Order Tracking

### Architecture

```
Driver App                   Order Tracking Service         Customer App
    |                                |                            |
    | POST /drivers/location         |                            |
    |------------------------------> |                            |
    |                                | 1. Update Redis GEO        |
    |                                | 2. Check active orders     |
    |                                |    for this driver         |
    |                                | 3. Fan-out location to     |
    |                                |    order's tracking topic  |
    |                                |                            |
    |                                | Kafka: order.tracking      |
    |                                | partition by orderId       |
    |                                |                            |
    |                                | Tracking WebSocket Server  |
    |                                | (sticky routing by orderId)|
    |                                |<---------------------------|
    |                                | wss://.../orders/{id}/track|
    |                                |                            |
    |                                | Push location update       |
    |                                |--------------------------->|
    |                                | { lat, lng, eta, status }  |
```

**WebSocket Connection Management:**
- Customer connects on order detail page
- Each WebSocket server handles ~50K concurrent connections
- Sticky sessions: orderId hashed to specific server via consistent hashing
- Heartbeat every 30 seconds; connection dropped if driver goes offline
- Fallback: SSE (Server-Sent Events) for browsers without WS support
- Mobile: long-polling fallback for restrictive networks

**Map Rendering:**
- Driver location smoothed with linear interpolation between updates (no jerky movement)
- Restaurant and customer pins pre-loaded; only driver position streams
- Map tiles served from CDN (not real-time streamed)

---

## 13. Deep Dive: Kitchen Display System (KDS)

```
+------------------+         +------------------+         +------------------+
|  Order Service   |         |  Restaurant App  |         | Driver App       |
|                  |         |  (KDS Tablet)    |         |                  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         | order.created              |                            |
         | (Kafka event)              |                            |
         v                            v                            |
+--------+----------------------------+                            |
|     KDS WebSocket / SSE Stream      |                            |
+--------+----------------------------+                            |
         |                                                         |
         | New order appears on kitchen screen                     |
         | Restaurant taps "Accept" + sets prep time               |
         |                                                         |
         | order.accepted event                                    |
         +-------> Dispatch service calculates driver arrival time |
         |         (driver should arrive ~prep_time minutes later) |
         |                                                         |
         | Chef prepares food...                                   |
         |                                                         |
         | Restaurant taps "Ready"                                 |
         |                                                         |
         | order.ready event -------> Driver notified:            |
         |                            "Food ready for pickup!"     |
         |                                                         |
         | order.picked_up event <--- Driver taps "Picked Up"      |
         |                                                         |
         | KDS removes order from active queue                     |
```

**KDS Features:**
- Orders sorted by estimated pickup time (earliest first)
- Color coding: green = ample time, yellow = pickup soon, red = driver waiting
- Prep timer shown in real-time per order
- Auto-accept mode: restaurant can enable auto-acceptance with fixed prep time
- Queue depth warning: alert when approaching `max_concurrent_orders`

---

## 14. Deep Dive: Payment Flow

```
                    CUSTOMER PAYMENT FLOW
+----------------------------------------------------------------+
|                                                                |
|  1. ORDER PLACEMENT                                            |
|     Customer submits order                                     |
|     -> Payment Service creates PaymentIntent (Stripe)          |
|     -> Authorize (hold) full amount on card                    |
|     -> Order created with status: authorized                   |
|                                                                |
|  2. ORDER DELIVERY                                             |
|     Driver marks delivered                                     |
|     -> Payment Service captures PaymentIntent                  |
|     -> Amount: subtotal + delivery_fee + tax + tip             |
|     -> Customer charged                                        |
|                                                                |
|  3. RESTAURANT PAYOUT                                          |
|     Scheduled job runs (T+1 business day or weekly):           |
|     payout = subtotal - platform_commission (30%)              |
|     -> Transfer to restaurant's bank via Stripe Connect        |
|                                                                |
|  4. DRIVER PAYOUT                                             |
|     Daily or on-demand:                                        |
|     driver_pay = delivery_fee_portion + per_km_rate + tip      |
|     -> Transfer to driver's bank via Stripe Connect            |
|                                                                |
+----------------------------------------------------------------+

     PAYMENT STATE DIAGRAM

  [pending] -> [authorized] -> [captured] -> [paid_out]
       |                           |
       v                           v
   [failed]                   [refunded]

  Refund cases:
  - Restaurant rejects order: full refund
  - Order cancelled pre-pickup: full refund
  - Delivery issue: partial or full refund (CS decision)
  - Wrong item delivered: item credit or refund
```

**Idempotency:**
- All payment operations use idempotency keys: `payment:{orderId}:{action}`
- Prevents duplicate charges on retries

---

## 15. Deep Dive: Rating and Review System

### Two-Way Rating Flow

```
After delivery:
+------------------------+
|  Customer rates:       |
|  - Restaurant (1-5)    |
|  - Driver (1-5)        |
|  - Optional comment    |
+------------------------+
         |
         v
+------------------------+         +------------------------+
|  Restaurant Rating     |         |  Driver Rating         |
|  Aggregation           |         |  Aggregation           |
|  (moving avg, min 10)  |         |  (moving avg, min 5)   |
+------------------------+         +------------------------+

After delivery:
+------------------------+
|  Driver rates:         |
|  - Customer (1-5)      |
|  - Tip quality (impl.) |
+------------------------+
         |
         v
+------------------------+
|  Customer Rating       |
|  (affects future       |
|   driver willingness   |
|   to accept orders)    |
+------------------------+
```

**Rating Impact Rules:**
- Restaurant rating < 3.5 for 30 days: review team notified, potential delisting
- Driver rating < 4.0 for 50 deliveries: additional training required
- Driver rating < 3.5: account deactivation review
- Customer rating < 3.0: low-priority in driver dispatch queue

**Review Moderation:**
- Text reviews pass through content moderation (profanity filter, hate speech detector)
- Photo reviews (food photos) stored in S3, served via CDN
- Restaurants can respond to reviews (public response, moderated)

---

## 16. Deep Dive: Fraud Detection

### Fraud Vectors and Mitigations

```
+--------------------+----------------------------+---------------------------+
| Fraud Type         | Detection Signal           | Mitigation                |
+--------------------+----------------------------+---------------------------+
| Fake orders        | - New account + high value | Manual review gate        |
| (chargeback fraud) | - VPN/proxy detected       | Device fingerprinting     |
|                    | - Address mismatch         | Velocity check            |
+--------------------+----------------------------+---------------------------+
| Promo abuse        | - Same device, new account | Device ID linking         |
|                    | - Same address, new email  | Phone verification        |
|                    | - Promo usage velocity     | One promo per device      |
+--------------------+----------------------------+---------------------------+
| GPS spoofing       | - Location jumps > 200 mph | Physics-based validation  |
| (driver fraud)     | - Driver "delivers" but    | Bluetooth/NFC confirmation|
|                    |   customer never received  | Accelerometer cross-check |
|                    | - Location at home not     | Pattern analysis          |
|                    |   delivery address         |                           |
+--------------------+----------------------------+---------------------------+
| Restaurant fraud   | - Excessive cancellations  | Cancel rate monitoring    |
|                    | - Wrong items sent         | Refund pattern analysis   |
|                    | - Prep time inflation      | Actual vs reported timing |
+--------------------+----------------------------+---------------------------+
```

**GPS Spoofing Detection:**
```python
def detect_gps_spoofing(driver_id, new_location, new_timestamp):
    last = get_last_location(driver_id)
    if not last:
        return False

    distance_km = haversine(last.location, new_location)
    time_elapsed_hours = (new_timestamp - last.timestamp).seconds / 3600
    speed_kmh = distance_km / max(time_elapsed_hours, 0.001)

    if speed_kmh > 200:  # Impossible by road vehicle
        flag_for_review(driver_id, "IMPOSSIBLE_SPEED", speed_kmh)
        return True

    return False
```

**Promo Abuse Detection:**
- Redis HyperLogLog tracks distinct phone numbers per device ID
- Rule: same device → same phone → max 1 "first order" promo
- ML model scores promo redemption for anomaly (trained on labeled abuse cases)

---

## 17. Deep Dive: Peak Hour Handling

### Queue-Based Order Ingestion

```
Normal Traffic:
Customer -> API -> Order Service -> PostgreSQL (direct write)

Peak Traffic (>80% capacity):
Customer -> API -> Order Queue (Kafka/SQS) -> Order Workers -> PostgreSQL

+------------------+
| Order Intake API |
| (always fast)    |  <- Returns "Order received, processing..."
+--------+---------+
         |
         | Enqueue to Kafka: orders.incoming
         v
+------------------+
| Order Worker Pool|
| (auto-scaling)   |
+--------+---------+
         |
         | Dequeue and process
         v
+------------------+
| PostgreSQL       |
| (write capacity  |
|  scaled up)      |
+------------------+
```

**Restaurant Capacity Management:**

```
When a restaurant hits max_concurrent_orders:

1. Order Service detects capacity = full
2. New orders for this restaurant enter a "pending" queue
3. Show customer: "Restaurant is busy. Your order is queued."
4. When a restaurant order is delivered, capacity slot freed
5. Next queued order dispatched to restaurant
6. Customer notified of actual acceptance

Redis key: restaurant:capacity:{restaurantId}
  -> Current count (INCR on accept, DECR on delivered/cancelled)
  -> Max from restaurant settings

Queue key: restaurant:order_queue:{restaurantId}
  -> LPUSH orderId
  -> RPOP when slot available
```

**Driver Incentives During Peak:**
- Surge zone shown on driver map as heat overlay
- Zone-specific bonuses: "$2 extra per delivery in Downtown 5-8pm"
- Guaranteed minimum earnings: "Earn at least $25/hr in this zone"
- Incentives funded by increased delivery fees from customers

---

## 18. Deep Dive: Promotions Engine

### Promo Validation Flow

```
+------------------+          +---------------------+
| Customer submits |          | Promotions Service  |
| promo code       +--------> |                     |
+------------------+          | 1. Lookup code      |
                              |    (Redis cache)    |
                              | 2. Validate rules:  |
                              |    - Not expired    |
                              |    - Min order met  |
                              |    - Usage limit    |
                              |    - First order?   |
                              |    - Restaurant?    |
                              | 3. Check user       |
                              |    eligibility      |
                              |    (used before?)   |
                              | 4. Return discount  |
                              |    calculation      |
                              +---------------------+
```

**Promo Types:**

| Type | Example | Logic |
|------|---------|-------|
| `percent_off` | 20% off | `discount = cart_subtotal * 0.20` |
| `flat_off` | $5 off $20+ | `if subtotal >= min: discount = flat_value` |
| `free_delivery` | Free delivery | `discount = delivery_fee` |
| `bogo` | Buy 1 get 1 free | `discount = cheapest_item_price` |
| `first_order` | 50% off first order | `check user.total_orders == 0` |

**Atomic Usage Increment:**
```lua
-- Redis Lua script for atomic promo use
local current = redis.call('HINCRBY', KEYS[1], 'used_count', 1)
local max = tonumber(redis.call('HGET', KEYS[1], 'max_uses'))
if max and current > max then
    redis.call('HINCRBY', KEYS[1], 'used_count', -1)
    return 0  -- promo exhausted
end
return 1  -- success
```

---

## 19. Scaling Strategy

### Database Scaling

```
PostgreSQL Scaling:
+---------------------------------------------+
| Primary (writes)                             |
|   - Orders, payments, ratings                |
+--------+------------------------------------+
         |
         | Streaming replication
         v
+--------+--------+  +--------+--------+
| Read Replica 1  |  | Read Replica 2  |
| (order queries) |  | (analytics)     |
+-----------------+  +-----------------+

Sharding strategy for orders table:
  - Shard by customer_id (hash partitioning)
  - 16 logical shards, 4 physical servers (4 shards each)
  - Shard routing via application-level lookup table
  - Cross-shard queries (e.g. restaurant analytics) via ClickHouse

Restaurant + menu data:
  - Read-heavy; aggressive caching in Redis (TTL 5 min)
  - CDN cache for public menu pages (TTL 1 min, invalidated on update)
```

### Driver Location Scaling

```
500K driver updates/sec challenge:
  - Partition driver IDs into 64 Redis shards
  - Each shard handles ~2K drivers
  - Location writes: GEOADD (O(log N))
  - Geo query: GEORADIUS scoped to 1-3 shards based on area

Alternative for extreme scale:
  - Dedicated time-series DB (Apache Druid, InfluxDB) for location history
  - In-memory grid (custom or Redis Cluster) for real-time positions
```

### Service Scaling

```
Order Service:
  - Stateless; scale horizontally
  - 10 pods normally, auto-scale to 50 at peak
  - CPU-based HPA (Kubernetes)

Dispatch Service:
  - Stateful only for in-flight dispatch tracking (Redis)
  - Scale horizontally; partition by geo region
  - Each instance handles assigned set of H3 zones

WebSocket (Tracking) Service:
  - Sticky sessions via consistent hashing on orderId
  - Each pod: 50K connections max
  - 1M concurrent users -> 20 pods minimum
  - Connection metadata (orderId -> pod) stored in Redis
```

### Caching Strategy

| Data | Cache | TTL | Invalidation |
|------|-------|-----|-------------|
| Restaurant list by area | Redis | 60 sec | On restaurant status change |
| Menu for restaurant | Redis | 5 min | On menu item update |
| Driver locations | Redis GEO | 10 sec | Continuous GEOADD |
| Surge multiplier per zone | Redis | 90 sec | Recalculated every 60s |
| Promo code details | Redis | 5 min | On promo update |
| User session | Redis | 24 hrs | On logout |
| ETA prediction | Redis | 30 sec | On state change |

---

## 20. Trade-offs

| Decision | Choice | Trade-off |
|----------|--------|-----------|
| **Consistency vs. Availability** for order state | Strong consistency (PostgreSQL + optimistic locking) | Slightly higher latency; zero lost state transitions |
| **Driver location storage** | Redis GEO (not PostgreSQL) | Lose ACID guarantees; gain 10x throughput |
| **ETA calculation** | Hybrid (rules + ML) vs. pure ML | Rules are explainable and fast; ML more accurate but opaque |
| **Dispatch: sequential vs. parallel** | Parallel offer to top 3 drivers | More reliable acceptance; first-mover advantage avoids wait |
| **Order queue at peak** | Async queue vs. direct write | Slightly delayed confirmation; prevents database overload |
| **Payment capture timing** | On delivery (not on placement) | Protects customer; increases chargeback risk window |
| **Batching deliveries** | Opt-in batching based on route efficiency | Improves driver economics; increases customer delivery time |
| **Geospatial system** | H3 (Uber) vs. Geohash | H3 equal-area better for surge zones; geohash simpler to implement |
| **WebSocket vs. polling** | WebSocket for tracking | Lower latency, higher infra cost; polling simpler for low-scale |
| **Restaurant payout timing** | T+1 or weekly batch | Weekly reduces transaction costs; daily improves restaurant cash flow |

---

## 21. Common Interview Follow-ups

**Q: How do you handle a restaurant that suddenly closes mid-order (fire, emergency)?**

A: The restaurant app triggers `PUT /restaurant/status { isOpen: false, acceptingOrders: false }`. Active orders in `placed` or `accepted` state are automatically cancelled with full refunds. Orders in `preparing` or `ready` state trigger a customer notification and CS escalation — the platform may offer a full refund plus a credit. Kafka event `restaurant.emergency_close` triggers downstream notification flows.

**Q: What happens if a driver disappears mid-delivery (phone dies, GPS lost)?**

A: We detect via heartbeat timeout — if no location update for > 60 seconds on an active delivery, we alert operations. After 3 minutes with no response, the system attempts re-dispatch of a new driver to the restaurant (if food not yet picked up) or marks the delivery as an exception for CS resolution. Driver account flagged for review.

**Q: How do you prevent two customers from getting the same driver assigned simultaneously?**

A: The dispatch service uses an atomic Redis `SET driver:{driverId}:assigned orderId NX EX 60` (set if not exists). Only one assignment succeeds. Failed assignments trigger the next candidate in the ranked list. The lock expires in 60 seconds, releasing the driver if no confirmation arrives (e.g., driver rejected the request).

**Q: How do you ensure order items aren't sold when a restaurant marks them unavailable mid-order?**

A: At order placement time, item availability is checked and a snapshot of price/name is stored in `order_items`. After order placement, the stored snapshot is canonical — even if the restaurant marks the item unavailable, the in-progress order is not affected. The unavailability only gates new orders from including that item.

**Q: How do you handle promotions that are being abused at massive scale (flash abuse)?**

A: Rate limiting per user ID + per device fingerprint. Lua script atomic counter in Redis prevents race conditions. ML model score gates high-risk redemptions for manual review. Device fingerprinting ties new accounts to existing abuser devices. Velocity rules: max 3 promo code validations per user per hour.

**Q: How does the ETA update when traffic suddenly worsens?**

A: The ETA Service subscribes to real-time traffic events from a third-party API (Google Maps Directions API or HERE Traffic). On significant route change (travel time increase >10%), it recomputes ETA and publishes an `order.eta_updated` event to Kafka. The tracking WebSocket service pushes the new ETA to the customer app within 2 seconds. ETA history is logged for ML model retraining.

**Q: How would you scale to 10x the current load?**

A: Horizontally scale Order Service and Dispatch Service pods. Shard Redis cluster for driver locations from 16 to 64 nodes. Shard PostgreSQL orders table from 4 to 16 physical servers. Move ETA computation to a dedicated cluster with GPU support for ML inference. Add regional deployments (multi-region active-active for reads, active-passive for writes). Deploy CDN pop closer to customers to reduce API gateway latency.

**Q: How do you compute restaurant ETAs for the browse page (before an order is placed)?**

A: For the browse/discovery phase, ETAs are approximated using:
1. Restaurant's `avg_prep_minutes`
2. Crow-flies distance from customer to restaurant (adjusted by road_factor = 1.3)
3. Estimated driver pickup delay based on zone driver supply
4. This approximate ETA is cached per zone (not per user) in Redis (TTL 2 minutes)
5. It is not the same precision as the post-order ETA computed with an actual assigned driver

**Q: How do you handle refunds for a partial order (one item missing)?**

A: Customer reports via app → CS or automated flow checks claim plausibility (photo evidence optional). Refund amount = missing item price + proportional tax. Issued via Stripe refund API within 24 hours. Restaurant's performance metrics updated: `missing_item_rate`. High rates trigger quality review. Driver not penalized unless delivery tampering is suspected (GPS shows stop-and-go inconsistent with delivery).

**Q: What are the consistency guarantees across the distributed components?**

A: Order state machine uses strong consistency (PostgreSQL with optimistic locking). Driver location is eventually consistent — Redis may lag up to 3 seconds. Payment uses external strong consistency from Stripe. Menu availability is eventually consistent — Redis overrides lag up to 60 seconds before PostgreSQL sync. The system prioritizes availability and partition tolerance for reads (browse, menu) and consistency for writes (order placement, payment, state transitions).

---

## 22. System Architecture — Detailed Component View

```
+-------------------------------------------------------------------------------------------+
|                                   CUSTOMER JOURNEY                                        |
|                                                                                           |
|  Browse -> Add to Cart -> Checkout -> Track -> Receive -> Rate                            |
+-------------------------------------------------------------------------------------------+

+------------------+    +-------------------+    +------------------+    +------------------+
|  Browse &        |    |  Order Service    |    |  Dispatch        |    |  Tracking        |
|  Search          |    |                  |    |  Service         |    |  Service         |
|  Service         |    |  - Order CRUD    |    |                  |    |                  |
|                  |    |  - State machine |    |  - Driver match  |    |  - WebSocket hub |
|  - Elasticsearch |    |  - Capacity gate |    |  - Batch orders  |    |  - Location fan  |
|  - Geo query     |    |  - Kafka publish |    |  - H3 geo query  |    |    -out          |
|  - Redis cache   |    |                  |    |  - Surge aware   |    |  - SSE fallback  |
+------+-----------+    +--------+---------+    +--------+---------+    +--------+---------+
       |                         |                       |                       |
       |                         v                       v                       v
       |              +----------+--------+   +----------+--------+   +----------+--------+
       |              |  PostgreSQL       |   |  Redis Cluster    |   |  Kafka             |
       |              |  (Orders, Users,  |   |  - Driver GEO     |   |  - order.events    |
       |              |   Payments,       |   |  - Sessions       |   |  - driver.location |
       |              |   Restaurants)    |   |  - Menu cache     |   |  - notifications   |
       |              |  Replica Set +    |   |  - Surge mults    |   |  - payment.events  |
       |              |  Read Replicas    |   |  - Promo cache    |   +--------------------+
       |              +-------------------+   +-------------------+
       |
       v
+------------------+
|  CDN             |
|  (Menu pages,    |
|   Map tiles,     |
|   Restaurant     |
|   images)        |
+------------------+

+------------------+    +-------------------+    +------------------+    +------------------+
|  ETA Service     |    |  Payment Service  |    |  Promotions      |    |  Notification    |
|                  |    |                  |    |  Engine          |    |  Service         |
|  - ML model      |    |  - Stripe API    |    |                  |    |                  |
|  - Traffic API   |    |  - Auth/capture  |    |  - Code validate |    |  - Push (FCM)    |
|  - Prep estimate |    |  - Payout queue  |    |  - Abuse detect  |    |  - SMS (Twilio)  |
|  - Real-time     |    |  - Idempotency   |    |  - Usage atomic  |    |  - Email (SES)   |
|    reroute       |    |  - Refund flow   |    |    counter       |    |  - In-app        |
+------------------+    +-------------------+    +------------------+    +------------------+

+------------------+    +-------------------+    +------------------+
|  Fraud Detection |    |  Restaurant KDS   |    |  Analytics       |
|  Service         |    |  Gateway          |    |  (ClickHouse)    |
|                  |    |                  |    |                  |
|  - GPS spoof     |    |  - WebSocket/SSE |    |  - Order funnel  |
|  - Promo abuse   |    |  - Order queue   |    |  - Driver perf   |
|  - Fake orders   |    |  - Prep timer    |    |  - ETA accuracy  |
|  - ML scoring    |    |  - Capacity mgmt |    |  - Revenue       |
+------------------+    +-------------------+    +------------------+
```

---

## 23. Monitoring and Observability

### Key Metrics

**Business Metrics (real-time dashboards):**
- Orders per minute, region breakdown
- Order fulfillment rate (% successfully delivered)
- Average delivery time vs. ETA
- Driver utilization rate (% time drivers are busy)
- Restaurant acceptance rate
- Customer satisfaction score (CSAT from ratings)

**Infrastructure Metrics:**
- Order placement p50/p95/p99 latency
- Driver location update lag (freshness)
- Dispatch latency (time from order placed to driver assigned)
- WebSocket connection count and drop rate
- Kafka consumer lag per topic/partition
- Redis memory utilization and eviction rate

**Alerting Rules:**

```
- Order fulfillment rate < 95% for 5 minutes -> PagerDuty alert
- Driver assignment p99 > 60 seconds -> Auto-scale dispatch service
- Kafka consumer lag > 10K messages -> Scale consumer group
- Redis eviction rate > 0 -> Scale Redis cluster
- Payment failure rate > 1% -> Alert payment team
- Any order stuck in state > 30 minutes -> CS escalation queue
```

### Distributed Tracing

- Every order request tagged with `traceId` propagated across all services
- Jaeger or Datadog APM for cross-service trace visualization
- Trace sampling: 100% for errors, 5% for successful requests
- Enables root cause analysis: "Why was this specific order slow?"
