# 设计预订与预约系统 (Airbnb / OpenTable / Calendly)

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 房源管理 | 房东创建/更新房源，包括可用日历、定价规则和设施 |
| 2 | 可用性搜索 | 房客按日期范围、位置、容量、设施和价格范围搜索 |
| 3 | 预订创建 | 房客选择时间段，下单锁定（TTL），完成支付以确认 |
| 4 | 临时锁定 | 系统在房客完成结账时锁定时间段 15 分钟 |
| 5 | 预订管理 | 查看、修改或取消预订；取消时应用退款政策 |
| 6 | Waitlist | 时间段已满时加入 waitlist；取消时自动晋升 |
| 7 | 周期性预订 | 创建重复预订（每周、每月），支持异常处理 |
| 8 | 通知 | 确认通知、24小时提醒、入住后评价请求 |
| 9 | 日历同步 | 导出/导入 iCal；与 Google Calendar 双向同步 |
| 10 | 动态定价 | 收益管理：高峰/非高峰、早鸟价、临时降价 |
| 11 | 多资源预订 | 在单个原子事务中预订房间 + 设备 + 餐饮 |
| 12 | 评价与评分 | 入住后房客和房东互评 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 预订创建延迟 | < 500ms (p99) |
| 2 | Double-booking 率 | 零（强一致性） |
| 3 | 可用性 | 99.99%（< 53 分钟停机/年） |
| 4 | 搜索延迟 | < 200ms (p95) |
| 5 | 日历同步延迟 | < 30 秒端到端 |
| 6 | 锁定 TTL 精度 | +/- 1 秒（过期锁定在 1 秒内释放） |
| 7 | 持久性 | 零预订丢失（至少一次处理，幂等确认） |
| 8 | 一致性 | 预订写入使用可串行化隔离级别；搜索读取使用最终一致性 |

### 规模估算

```
活跃房源:              50M 个活跃房源
每日预订:              5M 次预订/天
并发搜索:              500K 个并发搜索请求
高峰预订/分钟:          10K 次预订/分钟（节假日旺季）
活跃锁定 (TTL):        ~250K 个在任意时刻（10K/分钟 * 15分钟 TTL）
每日取消:              ~500K（预订的 10%）
日历同步事件:           ~50M/天（外部日历更新）
```

### 粗略估算

**预订写入吞吐量：**
```
每日预订:                 5M
高峰预订/秒:              10,000/分钟 = ~167/秒（稳态），
                          节假日突发可达 500/秒
锁定/秒:                  ~2x 预订 = 334 次锁定/秒（许多锁定 → 部分转化）
锁定超时事件/秒:          334 次锁定/秒 * 70% 放弃率 = 234 次释放/秒
```

**可用性读取吞吐量：**
```
并发搜索:                 500K
平均搜索时长:             3 秒
请求/秒:                  500K / 3 = ~167K 搜索 QPS
缓存命中率目标:           90%
数据库读取 QPS:           167K * 10% = 16,700 QPS
```

**数据存储：**
```
每个房源:
  可用日历: 365 天 * ~4 字节/天 = 1.46 KB/年
  50M 房源 * 1.46 KB = 73 GB/年 可用性数据

每条预订记录:
  ~2 KB（元数据 + 房客信息 + 价格快照）
  5M/天 * 365 * 2 KB = 3.65 TB/年 预订历史

已封锁时间段索引:
  50M 房源 * 365 天 = 18.25B 时间段-天
  按 1 字节/时间段-天（位图）：18.25 GB（非常紧凑）
```

**通知量：**
```
确认通知:        5M/天
24小时提醒:      5M/天（针对次日入住）
评价请求:        4M/天（80% 完成入住）
总通知:          ~14M/天 = ~162/秒 平均
高峰:            ~500/秒
```

---

## 2. 高层架构

```
+------------------+     +------------------+     +------------------+
|   Guest Web/App  |     |   Host Web/App   |     |  Admin Dashboard |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                         |
         +------------------------+-------------------------+
                                  |
                          HTTPS / WebSocket
                                  |
                    +-------------v--------------+
                    |        API Gateway         |
                    |  (Auth, Rate Limit, Route, |
                    |   SSL Termination, CORS)   |
                    +-------------+--------------+
                                  |
      +-----------+---------------+---------------+-----------+
      |           |               |               |           |
+-----v-----+ +---v--------+ +---v--------+ +----v-----+ +---v-------+
|  Search   | |  Listing   | |  Booking   | |  Pricing | | Calendar  |
|  Service  | |  Service   | |  Service   | |  Service | |  Service  |
|           | |            | |            | |          | |           |
| Avail.    | | CRUD       | | Hold/TTL   | | Dynamic  | | iCal sync |
| Filter    | | Calendar   | | Confirm    | | Pricing  | | GCal sync |
| Ranking   | | Mgmt       | | State Mach | | Yield    | | Webhooks  |
+-----+-----+ +-----+------+ +-----+------+ +----+-----+ +-----+-----+
      |               |             |             |              |
      |        +------+------+      |             |              |
      |        |  Inventory  |      |             |              |
      |        |  (Avail DB) |<-----+             |              |
      |        +------+------+      |             |              |
      |               |            |             |              |
+-----v---------------v------------v-------------v--------------v-----+
|                            Event Bus (Kafka)                        |
|  Topics: booking.created, booking.cancelled, hold.expired,         |
|          availability.changed, payment.captured, review.requested  |
+----+------------------+------------------+------------------+-------+
     |                  |                  |                  |
+----v----+      +-------v------+   +------v-----+   +-------v------+
| Notif.  |      |  Waitlist    |   |  Analytics |   |  Calendar    |
| Service |      |  Service     |   |  Service   |   |  Sync Worker |
|         |      |              |   |            |   |              |
| Email   |      | Priority Q   |   | Metrics    |   | iCal export  |
| SMS     |      | Auto-promote |   | Reports    |   | GCal push    |
| Push    |      | Expiry mgmt  |   | Revenue    |   | Conflict det.|
+---------+      +--------------+   +------------+   +--------------+

+--------------------+    +--------------------+    +------------------+
|  Primary DB        |    |  Cache Layer       |    |  Search Engine   |
|  (PostgreSQL       |    |  (Redis Cluster)   |    |  (Elasticsearch) |
|   Multi-region     |    |                    |    |                  |
|   write leader)    |    |  - Avail bitmaps   |    |  - Listing index |
|                    |    |  - Hold TTL keys   |    |  - Geo search    |
|  - Listings        |    |  - Session cache   |    |  - Faceted filter|
|  - Bookings        |    |  - Price cache     |    |  - Full-text     |
|  - Availability    |    |  - Rate limits     |    |    search        |
|  - Users           |    |  - Idempotency keys|    +------------------+
+--------------------+    +--------------------+
```

---

## 3. API 设计

### 搜索可用性

```
GET /v1/search/availability

Query Parameters:
  checkin_date: "2026-07-01"       (必填)
  checkout_date: "2026-07-07"      (必填)
  location: "San Francisco, CA"    (必填)
  guests: 2                        (必填)
  min_price: 50                    (可选，美元/晚)
  max_price: 300                   (可选)
  amenities: ["wifi","parking"]    (可选)
  property_type: "entire_home"     (可选)
  instant_book: true               (可选)
  page: 1
  page_size: 20

Response 200:
{
  "results": [
    {
      "listing_id": "lst_abc123",
      "title": "Cozy Studio in SOMA",
      "location": { "lat": 37.7749, "lng": -122.4194, "city": "San Francisco" },
      "price_per_night": 120,
      "total_price": 720,
      "cleaning_fee": 60,
      "service_fee": 90,
      "available": true,
      "instant_book": true,
      "rating": 4.87,
      "review_count": 142,
      "images": ["https://cdn.example.com/img/abc123/1.jpg"],
      "amenities": ["wifi", "parking", "kitchen"],
      "max_guests": 4
    }
  ],
  "meta": {
    "total": 1247,
    "page": 1,
    "page_size": 20,
    "search_id": "srch_xyz789"
  }
}
```

### 创建锁定（临时预留）

```
POST /v1/bookings/hold

Request:
{
  "listing_id": "lst_abc123",
  "checkin_date": "2026-07-01",
  "checkout_date": "2026-07-07",
  "guest_count": 2,
  "idempotency_key": "idem_guest123_lst_abc123_20260701"
}

Response 201:
{
  "hold_id": "hold_def456",
  "listing_id": "lst_abc123",
  "checkin_date": "2026-07-01",
  "checkout_date": "2026-07-07",
  "status": "HELD",
  "expires_at": "2026-03-01T14:15:00Z",   (从现在起 15 分钟)
  "pricing": {
    "nights": 6,
    "price_per_night": 120,
    "subtotal": 720,
    "cleaning_fee": 60,
    "service_fee": 90,
    "taxes": 87.75,
    "total": 957.75,
    "currency": "USD"
  },
  "price_locked_until": "2026-03-01T14:15:00Z"
}
```

### 确认预订

```
POST /v1/bookings/confirm

Request:
{
  "hold_id": "hold_def456",
  "payment_method_id": "pm_stripe_xxx",
  "special_requests": "Late check-in around 10pm",
  "idempotency_key": "idem_confirm_hold_def456"
}

Response 201:
{
  "booking_id": "bkg_ghi789",
  "hold_id": "hold_def456",
  "listing_id": "lst_abc123",
  "host_id": "usr_host111",
  "guest_id": "usr_guest222",
  "checkin_date": "2026-07-01",
  "checkout_date": "2026-07-07",
  "status": "CONFIRMED",
  "total_price": 957.75,
  "payment_status": "CAPTURED",
  "confirmation_code": "HMXK7A",
  "created_at": "2026-03-01T14:02:33Z"
}
```

### 取消预订

```
DELETE /v1/bookings/{booking_id}

Request:
{
  "reason": "change_of_plans",
  "idempotency_key": "idem_cancel_bkg_ghi789"
}

Response 200:
{
  "booking_id": "bkg_ghi789",
  "status": "CANCELLED",
  "refund": {
    "amount": 766.20,
    "policy_applied": "moderate",
    "refund_percentage": 80,
    "refund_id": "ref_jkl012",
    "estimated_arrival": "2026-03-06"
  },
  "cancelled_at": "2026-03-01T14:05:00Z"
}
```

### 管理房源可用性

```
PUT /v1/listings/{listing_id}/availability

Request:
{
  "blocked_dates": ["2026-08-01", "2026-08-02"],
  "available_dates": ["2026-07-15", "2026-07-16"],
  "recurring_availability": {
    "type": "weekly",
    "days_of_week": [1, 2, 3, 4, 5],   (周一至周五)
    "start_date": "2026-04-01",
    "end_date": "2026-12-31",
    "exceptions": ["2026-07-04"]
  },
  "idempotency_key": "idem_avail_lst_abc123_v5"
}

Response 200:
{
  "listing_id": "lst_abc123",
  "updated_dates": 47,
  "calendar_version": 6,
  "sync_triggered": true
}
```

### 加入 Waitlist

```
POST /v1/bookings/waitlist

Request:
{
  "listing_id": "lst_abc123",
  "checkin_date": "2026-07-01",
  "checkout_date": "2026-07-07",
  "guest_count": 2,
  "max_price": 1100
}

Response 201:
{
  "waitlist_id": "wl_mno345",
  "position": 3,
  "estimated_availability": "low",
  "notification_preference": "email+sms"
}
```

---

## 4. 数据模型

### 核心表 (PostgreSQL)

```sql
-- 房源
CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID NOT NULL REFERENCES users(id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  property_type   VARCHAR(50),     -- entire_home, private_room, shared_room
  address         TEXT,
  city            VARCHAR(100),
  country         CHAR(2),
  lat             DECIMAL(9,6),
  lng             DECIMAL(9,6),
  max_guests      SMALLINT NOT NULL,
  bedrooms        SMALLINT,
  bathrooms       DECIMAL(3,1),
  amenities       TEXT[],          -- postgres 数组用于快速包含查询
  base_price      DECIMAL(10,2) NOT NULL,  -- 每晚价格（美元）
  cleaning_fee    DECIMAL(10,2),
  min_nights      SMALLINT DEFAULT 1,
  max_nights      SMALLINT DEFAULT 365,
  instant_book    BOOLEAN DEFAULT FALSE,
  rating          DECIMAL(3,2),
  review_count    INT DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'active',  -- active, inactive, deleted
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listings_host ON listings(host_id);
CREATE INDEX idx_listings_city ON listings(city);
CREATE INDEX idx_listings_geo ON listings USING GIST(point(lng, lat));
CREATE INDEX idx_listings_status ON listings(status) WHERE status = 'active';

-- 可用性日历（每个房源每天一行）
CREATE TABLE availability (
  listing_id      UUID NOT NULL REFERENCES listings(id),
  date            DATE NOT NULL,
  status          VARCHAR(20) NOT NULL,  -- AVAILABLE, BLOCKED, BOOKED, HELD
  booking_id      UUID,                 -- 在 BOOKED 时设置
  hold_id         UUID,                 -- 在 HELD 时设置
  price_override  DECIMAL(10,2),        -- NULL = 使用房源基准价格
  min_nights_override SMALLINT,
  calendar_version INT NOT NULL DEFAULT 1,  -- 乐观锁
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (listing_id, date)
);

CREATE INDEX idx_avail_status_date ON availability(status, date) WHERE status = 'AVAILABLE';
CREATE INDEX idx_avail_booking ON availability(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_avail_hold ON availability(hold_id) WHERE hold_id IS NOT NULL;

-- 预订（不可变审计日志风格）
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  host_id         UUID NOT NULL,
  guest_id        UUID NOT NULL REFERENCES users(id),
  hold_id         UUID,
  checkin_date    DATE NOT NULL,
  checkout_date   DATE NOT NULL,
  guest_count     SMALLINT NOT NULL,
  nights          SMALLINT GENERATED ALWAYS AS (checkout_date - checkin_date) STORED,
  status          VARCHAR(30) NOT NULL,  -- CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW
  price_per_night DECIMAL(10,2) NOT NULL,  -- 预订时的价格快照
  subtotal        DECIMAL(10,2) NOT NULL,
  cleaning_fee    DECIMAL(10,2),
  service_fee     DECIMAL(10,2),
  taxes           DECIMAL(10,2),
  total_price     DECIMAL(10,2) NOT NULL,
  currency        CHAR(3) DEFAULT 'USD',
  payment_id      UUID,
  special_requests TEXT,
  cancellation_policy VARCHAR(30),     -- flexible, moderate, strict
  cancelled_at    TIMESTAMPTZ,
  cancellation_reason VARCHAR(100),
  refund_amount   DECIMAL(10,2),
  confirmation_code VARCHAR(10) UNIQUE NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_listing ON bookings(listing_id);
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_host ON bookings(host_id);
CREATE INDEX idx_bookings_dates ON bookings(listing_id, checkin_date, checkout_date);
CREATE INDEX idx_bookings_status ON bookings(status, checkin_date);

-- 锁定（带 TTL 的临时预留）
CREATE TABLE holds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  guest_id        UUID NOT NULL REFERENCES users(id),
  checkin_date    DATE NOT NULL,
  checkout_date   DATE NOT NULL,
  guest_count     SMALLINT NOT NULL,
  price_snapshot  JSONB NOT NULL,      -- 锁定时锁定的完整价格信息
  status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, CONVERTED, EXPIRED, RELEASED
  expires_at      TIMESTAMPTZ NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_holds_listing ON holds(listing_id);
CREATE INDEX idx_holds_expires ON holds(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_holds_guest ON holds(guest_id, status);

-- 定价规则（动态定价叠加层）
CREATE TABLE pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  rule_type       VARCHAR(30) NOT NULL,  -- seasonal, weekend, early_bird, last_minute, event
  start_date      DATE,
  end_date        DATE,
  days_of_week    SMALLINT[],
  price_modifier  DECIMAL(5,4),  -- 例如 1.50 = 涨价 50%，0.80 = 折扣 20%
  price_override  DECIMAL(10,2), -- 绝对覆盖价（覆盖 modifier）
  min_advance_days SMALLINT,     -- 用于 early_bird / last_minute 规则
  max_advance_days SMALLINT,
  priority        SMALLINT DEFAULT 0,   -- 值越高冲突时优先级越高
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_listing ON pricing_rules(listing_id);

-- Waitlist
CREATE TABLE waitlist_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  guest_id        UUID NOT NULL REFERENCES users(id),
  checkin_date    DATE NOT NULL,
  checkout_date   DATE NOT NULL,
  guest_count     SMALLINT NOT NULL,
  max_price       DECIMAL(10,2),
  priority_score  INT NOT NULL DEFAULT 0,   -- 值越高越先晋升
  status          VARCHAR(20) DEFAULT 'WAITING',  -- WAITING, NOTIFIED, CONVERTED, EXPIRED
  notified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (listing_id, guest_id, checkin_date, checkout_date)
);

CREATE INDEX idx_waitlist_listing ON waitlist_entries(listing_id, checkin_date, status);

-- 周期性预订模板
CREATE TABLE recurring_booking_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  guest_id        UUID NOT NULL REFERENCES users(id),
  recurrence_type VARCHAR(20) NOT NULL,    -- weekly, biweekly, monthly
  days_of_week    SMALLINT[],
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  series_start    DATE NOT NULL,
  series_end      DATE,
  exception_dates DATE[],                  -- 跳过的日期
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 日历同步订阅
CREATE TABLE calendar_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  provider        VARCHAR(30) NOT NULL,  -- ical, google_calendar
  external_cal_id VARCHAR(255),
  ical_url        TEXT,
  sync_direction  VARCHAR(10),           -- import, export, bidirectional
  last_synced_at  TIMESTAMPTZ,
  sync_token      TEXT,                  -- 用于 Google 增量同步
  etag            TEXT,                  -- 用于 iCal 条件获取
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. 可用性日历设计

### 时间段表示

基于日期的模型（每个房源每天一行）适用于 Airbnb 风格的按夜预订。对于 OpenTable 风格的按小时时间段，则转换为时间段模型：

```
基于日期 (Airbnb):
  availability(listing_id, date)  -- 每晚 1 行

基于时间段 (OpenTable):
  time_slots(listing_id, slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, capacity, booked)
```

**位图表示用于快速范围查询：**

```
对于一个房源，将 366 位（一年中每天一位）打包为 ~46 字节：

位 0 = 1月1日，位 1 = 1月2日，...，位 365 = 12月31日
  1 = 可用，0 = 已封锁/已预订

对于日期范围 [checkin, checkout]，执行位与操作：
  avail_bitmap & range_mask == range_mask  →  完全可用

存储：50M 房源 * 46 字节 = 2.3 GB（可放入 Redis）
更新：set_bit(listing_id, day_of_year, 0)（预订时）
查询：bitcount(listing_id, checkin_day, checkout_day) == requested_nights
```

### Redis 可用性位图

```
Key:   avail:{listing_id}:{year}
Type:  Redis BITFIELD（每年 366 位）
TTL:   48 小时（缓存未命中时从数据库刷新）

Commands:
  SETBIT avail:lst_abc123:2026 181 0    # 封锁 7月1日（第 181 天）
  BITPOS avail:lst_abc123:2026 1 181 187  # 查找范围内第一个可用日
  BITCOUNT avail:lst_abc123:2026 181 187  # 统计 7月1-7日可用天数

跨年预订（12月28日 - 1月3日）：
  检查 avail:{id}:2026 从第 362 天起，以及 avail:{id}:2027 从第 0 天起
```

### 时区处理

```
+------------------+       +--------------------+       +------------------+
|  Guest Client    |       |   Booking Service  |       |   Database       |
|                  |       |                    |       |                  |
| "Book Jul 1"     |------>| - Store as DATE    |------>| checkin_date     |
| (in local tz)    |       |   not TIMESTAMPTZ  |       |   DATE (no tz)   |
|                  |       | - Listing timezone |       |                  |
|                  |       |   stored on listing|       | listing_timezone |
|                  |       | - Communicate to   |       |   VARCHAR(50)    |
|                  |       |   guest in local   |       |   e.g.           |
|                  |       |   tz at display    |       |   America/NY     |
+------------------+       +--------------------+       +------------------+

规则：
1. checkin_date / checkout_date 始终存储为 DATE（而非 TIMESTAMPTZ）
2. "7月1日"表示房源所在时区的午夜
3. 房客在界面上看到的日期已转换为房源所在时区
4. 提醒通知基于房源时区午夜的相对时间触发
5. iCal 导出使用 DTSTART;TZID=America/New_York:20260701T000000
```

---

## 6. Double-Booking 防护

### 使用版本号的乐观锁

```sql
-- 原子性地检查可用性并递增版本号
UPDATE availability
SET    status = 'HELD',
       hold_id = $hold_id,
       calendar_version = calendar_version + 1
WHERE  listing_id = $listing_id
  AND  date BETWEEN $checkin AND $checkout - 1
  AND  status = 'AVAILABLE'
  AND  calendar_version = $expected_version
RETURNING date;

-- 如果 rows_affected < nights_requested → 冲突 → 回滚
```

### 使用 SELECT FOR UPDATE 的悲观锁

```sql
BEGIN;

-- 锁定日期范围的行
SELECT date, status, hold_id
FROM   availability
WHERE  listing_id = $listing_id
  AND  date BETWEEN $checkin AND $checkout - 1
FOR UPDATE NOWAIT;   -- NOWAIT：如果被其他事务锁定则快速失败

-- 验证所有行都为 AVAILABLE
-- 如果任何行不是 AVAILABLE：ROLLBACK + 返回 409 Conflict

-- 如果全部可用：更新
UPDATE availability
SET status = 'HELD', hold_id = $hold_id
WHERE listing_id = $listing_id
  AND date BETWEEN $checkin AND $checkout - 1
  AND status = 'AVAILABLE';

COMMIT;
```

### 策略对比

```
+---------------------------+------------------+------------------+
|  方面                     | 悲观锁           | 乐观锁           |
+---------------------------+------------------+------------------+
| 锁粒度                    | 行级（数据库）    | 应用级           |
| 竞争行为                   | 阻塞等待         | 冲突时重试        |
| 适用场景                   | 高竞争           | 低竞争           |
|                           | 热门房源         | 普通房源          |
| 死锁风险                   | 有（需排序行）    | 无               |
| 高负载下的吞吐量            | 较低             | 较高             |
| 实现复杂度                  | 较低             | 中等             |
+---------------------------+------------------+------------------+

建议：
- 预订确认使用 SELECT FOR UPDATE NOWAIT
- 按 (listing_id, date ASC) 排序行锁以避免死锁
- 使用 Redis SETNX 在访问数据���前进行快速预检查：
    SETNX hold:{listing_id}:{checkin}:{checkout} {hold_id}  EX 900
    如果返回 0（key 已存在）→ 无需数据库查询即可快速失败
```

### 分布式锁流程

```
Guest A                    Redis                     PostgreSQL
  |                          |                            |
  |-- SETNX hold:lst:d1:d7 ->|                            |
  |   (EX 900 seconds)       |                            |
  |<- OK (acquired) ---------|                            |
  |                          |                            |
  |--------------- BEGIN TRANSACTION ------------------>  |
  |                          |            SELECT ... FOR UPDATE NOWAIT
  |                          |            UPDATE availability ...
  |                          |            INSERT INTO holds ...
  |--------------- COMMIT ----------------------------->  |
  |                          |                            |
  |-- DEL hold:lst:d1:d7 --->|                            |
  |                          |                            |

Guest B（并发，相同日期）：
  |-- SETNX hold:lst:d1:d7 ->|                            |
  |<- 0 (key exists) --------|                            |
  |   → 立即返回 409 Conflict（无需数据库访问）              |
```

---

## 7. 预订状态机

```
                        +-------------+
                        |  AVAILABLE  |
                        +------+------+
                               |
                    [房客下单锁定]
                               |
                        +------v------+
                        |    HELD     |<---------+
                        +--+----+----+           |
                           |    |                |
                 [TTL 过期] |    | [房客确认]      |
                           |    |                |
              +------------v+  +v------------+   |
              |  AVAILABLE  |  |  CONFIRMED  |   |
              | (已释放)     |  +--+--+--+---+   |
              +-------------+     |  |  |       |
                                   |  |  |       |
               [房客到达] ---------+  |  |       |
                                      |  |       |
                  +-------------------+  |       |
                  |  CHECKED_IN          |       |
                  +---+---------+        |       |
                      |         |        |       |
          [入住结束]   |         | [提前   |       |
                      |         |  离开]          |
               +------v------+  |               |
               | COMPLETED   |  |               |
               +------+------+  |               |
                      |         |               |
               [请求评价]                        |
                                                |
               [房客取消] ---------------------+
               (在 CONFIRMED 状态时)
               +-------------+
               |  CANCELLED  |
               +------+------+
                      |
               [按政策执行退款]
                      |
               +------v------+
               |  REFUNDED   |
               +-------------+

               [房客未到]
               +-------------+
               |   NO_SHOW   |  ← 入住窗口过后由房东触发
               +-------------+
```

### 状态转换事件 (Kafka Topics)

```
booking.hold.created      → 启动 TTL 计时器，锁定可用性，发送锁定确认邮件
booking.hold.expired      → 释放可用性，通知房客，检查 waitlist
booking.confirmed         → 扣款，发送确认通知，更新日历同步
booking.checked_in        → 触发欢迎消息，启动损坏保护窗口
booking.completed         → 向房东释放付款，发送评价请求
booking.cancelled         → 应用退款政策，释放时间段，通知 waitlist
booking.no_show           → 通知房东，按未到政策释放付款
```

---

## 8. 临时锁定模式

### 锁定生命周期与 TTL

```
     Guest                Booking Service              Redis             PostgreSQL
       |                        |                        |                    |
       |-- POST /hold ---------->|                        |                    |
       |                        |-- SETNX hold_lock ---->|                    |
       |                        |<- OK ------------------|                    |
       |                        |                        |                    |
       |                        |-- BEGIN TX --------------------------------->|
       |                        |   SELECT FOR UPDATE (avail rows)            |
       |                        |   INSERT holds(id, expires_at=+15min)       |
       |                        |   UPDATE availability SET status='HELD'     |
       |                        |-- COMMIT ----------------------------------->|
       |                        |                        |                    |
       |                        |-- SET hold:{id} EX 900 ->|                  |
       |                        |   (与数据库 expires_at 镜像)|                  |
       |                        |                        |                    |
       |<-- 201 hold_id, expires_at --|                  |                    |
       |    (15 分钟倒计时)       |                        |                    |
       |                        |                        |                    |
  [14 分钟后：房客仍在填写支付表单]                          |                    |
       |                        |-- TTL 过期事件 ---------|                    |
       |                        |   (Redis keyspace notification)             |
       |                        |                        |                    |
       |                        |-- BEGIN TX --------------------------------->|
       |                        |   UPDATE holds SET status='EXPIRED'         |
       |                        |   UPDATE availability SET status='AVAILABLE'|
       |                        |-- COMMIT ----------------------------------->|
       |                        |                        |                    |
       |                        |-- 发布 hold.expired 事件 (Kafka) ----------->|
       |<-- WebSocket: "锁定已过期，请重新搜索" ------------|                    |
```

### TTL 过期处理

```python
# 锁定过期 worker（消费 Redis keyspace notifications）
# Redis 配置：notify-keyspace-events "Ex"

def on_hold_expired(hold_id: str):
    with db.transaction():
        hold = db.query(
            "UPDATE holds SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' RETURNING *",
            hold_id
        )
        if not hold:
            return  # 已转换或已释放

        # 释放可用性
        db.execute(
            """UPDATE availability
               SET status='AVAILABLE', hold_id=NULL
               WHERE hold_id=$1 AND status='HELD'""",
            hold_id
        )

    # 异步：通知 waitlist
    kafka.produce('hold.expired', {'hold_id': hold_id, 'listing_id': hold.listing_id,
                                    'checkin': hold.checkin_date, 'checkout': hold.checkout_date})

    # 异步：通过 WebSocket / 推送通知房客
    notify_guest_hold_expired(hold.guest_id, hold_id)
```

---

## 9. Overbooking 策略

航空公司/酒店在取消率可预测时使用此策略来最大化收入。

### Overbooking 公式

```
目标入住率：100%
历史取消率：C（例如 12%）
未到率：N（例如 3%）
Overbooking 系数：1 / (1 - C - N) = 1 / (1 - 0.12 - 0.03) = 1.176

对于 100 座航班：接受 118 个预订（超售 18%）

预期实际到达人数：118 * (1 - 0.15) = 100.3  ≈ 100 ✓
```

### Overbooking 架构

```
                  +---------------------------+
                  |  Overbooking Config Store |
                  |                           |
                  | property_type → C, N, max |
                  | seasonal adjustments      |
                  | cancellation ML model     |
                  +-------------+-------------+
                                |
                  +-------------v-------------+
                  |    Booking Service        |
                  |                           |
                  |  available_slots =        |
                  |    physical_capacity *    |
                  |    overbooking_factor     |
                  |                           |
                  |  if bookings >            |
                  |     physical_capacity:    |
                  |       flag as "overbooked"|
                  +-------------+-------------+
                                |
                  +-------------v-------------+
                  |   Voluntary Bump Service  |
                  |                           |
                  | 1. 向灵活的房客提供补偿     |
                  | 2. 如无志愿者则自动选择     |
                  | 3. 重新预订到补偿酒店      |
                  | 4. 发放代金券/退款         |
                  +---------------------------+
```

---

## 10. 并发预订的冲突解决

```
场景：两位房客 A 和 B 同时尝试预订房源 L，7月1-7日。

+---------------------------+---------------------------+
| Guest A (t=0ms)           | Guest B (t=5ms)           |
+---------------------------+---------------------------+
| BEGIN TX                  | BEGIN TX                  |
| SETNX hold:L:d1:d7 → OK  | SETNX hold:L:d1:d7 → 0   |
|                           | → 快速失败：409            |
| SELECT FOR UPDATE         |                           |
| (avail rows, all AVAIL)   |                           |
| UPDATE → HELD             |                           |
| COMMIT                    |                           |
+---------------------------+---------------------------+

先写入者获胜策略（已实现）：
- Redis SETNX 是决胜者
- 先到达 Redis 的请求获胜
- 其他所有请求立即收到 409 Conflict
- 无等待，无死锁

后写入者获胜（预订场景不使用）：
- 危险：会导致 double-booking
- 仅适用于非排他性资源
  （例如 "最后一次个人资料更新获胜"）
```

---

## 11. 日历搜索和可用性查询优化

### 简单方法（在大规模下存在问题）

```sql
-- 简单方式：每次搜索全表扫描
SELECT listing_id
FROM availability
WHERE date BETWEEN '2026-07-01' AND '2026-07-06'
  AND status = 'AVAILABLE'
GROUP BY listing_id
HAVING COUNT(*) = 6;   -- 6 晚

-- 问题：50M 房源 * 365 天 = 18.25B 行，即使有索引也很慢
```

### 优化：基于位图的方法

```
每房源 Redis 位图（如第 5 节所述）：

搜索算法：
  1. 为每个候选房源加载可用性位图（从 Redis）
  2. 与日期范围掩码做 AND 操作：每个房源 O(1)
  3. 筛选 AND 结果 == 范围掩码的房源（所有位都设置）
  4. 对通过的集合应用额外过滤器（价格、设施）

对于 500K 并发搜索：
  - Elasticsearch 按地理位置、设施、容量预过滤：~10K 候选
  - Redis 位图检查 10K 候选：~10ms
  - 总计：使用缓存 < 200ms
```

### 用于已预订范围的区间树

```
不存储单独的日期，而是存储预订区间：
  Interval(start=Jul1, end=Jul7)

区间树操作：
  插入：O(log n)
  查询 "7月3-5日是否空闲？"：O(log n + k)，其中 k = 重叠的预订数
  删除：O(log n)

以内存方式存储每个房源（Redis sorted set）：
  ZADD bookings:{listing_id} {checkout_epoch} "{checkin_epoch},{checkout_epoch}"

  重叠查询：
    ZRANGEBYSCORE bookings:{listing_id} {checkin_epoch} +inf LIMIT 0 1
    → 如果结果的 checkin < requested_checkout → 冲突
```

### Elasticsearch 可用性索引

```json
// ES 中的房源文档（为快速搜索反规范化）
{
  "listing_id": "lst_abc123",
  "city": "San Francisco",
  "geo": { "lat": 37.7749, "lon": -122.4194 },
  "max_guests": 4,
  "amenities": ["wifi", "parking", "kitchen"],
  "base_price": 120,
  "rating": 4.87,
  "review_count": 142,
  "available_ranges": [
    {"gte": "2026-07-01", "lte": "2026-07-31"},
    {"gte": "2026-09-01", "lte": "2026-09-30"}
  ],  // 通过 Kafka 消费者在每次预订/取消时更新
  "instant_book": true,
  "property_type": "entire_home",
  "updated_at": "2026-03-01T12:00:00Z"
}
```

```json
// ES 查询可用房源
{
  "query": {
    "bool": {
      "filter": [
        { "geo_distance": { "distance": "50km", "geo": { "lat": 37.78, "lon": -122.41 } } },
        { "range": { "base_price": { "gte": 50, "lte": 300 } } },
        { "terms": { "amenities": ["wifi", "parking"] } },
        { "range": { "max_guests": { "gte": 2 } } },
        {
          "nested": {
            "path": "available_ranges",
            "query": {
              "bool": {
                "filter": [
                  { "range": { "available_ranges.gte": { "lte": "2026-07-01" } } },
                  { "range": { "available_ranges.lte": { "gte": "2026-07-07" } } }
                ]
              }
            }
          }
        }
      ]
    }
  },
  "sort": [{ "_score": "desc" }, { "rating": "desc" }]
}
```

---

## 12. 多资源预订

对于需要设备 + 餐饮的会议室在一个原子事务中预订：

```
+---------------+     +---------------+     +---------------+
| Resource A    |     | Resource B    |     | Resource C    |
| (Room 101)    |     | (Projector 3) |     | (Catering)    |
+-------+-------+     +-------+-------+     +-------+-------+
        |                     |                     |
        +----------+----------+----------+----------+
                              |
                   +----------v----------+
                   |  Multi-Resource     |
                   |  Booking Service    |
                   |                     |
                   | 1. 按 ID 排序资源    |
                   |    （防止死锁）       |
                   | 2. BEGIN TX         |
                   | 3. 按排序顺序       |
                   |    锁定每个资源      |
                   | 4. 检查全部可用      |
                   | 5. 全部更新         |
                   | 6. COMMIT           |
                   +---------------------+

Saga 模式（用于跨服务的分布式资源）：
  步骤 1：锁定房间    → 成功 → 步骤 2
  步骤 2：锁定设备    → 失败 → 补偿：释放房间 → 返回错误
  步骤 3：锁定餐饮    → 成功
  步骤 4：全部确认    → 成功 → 完成

  如果步骤 4 支付失败：
    补偿步骤 3：释放餐饮
    补偿步骤 2：释放设备
    补偿步骤 1：释放房间
```

```sql
-- 多资源预订事务
BEGIN;

-- 按确定性顺序锁定所有资源可用性
SELECT resource_id, date, status
FROM resource_availability
WHERE (resource_id, date) IN (
  ('room_101', '2026-07-01'), ('room_101', '2026-07-02'),
  ('projector_3', '2026-07-01'), ('projector_3', '2026-07-02'),
  ('catering_svc', '2026-07-01')
)
ORDER BY resource_id, date   -- 确定性顺序防止死锁
FOR UPDATE NOWAIT;

-- 验证全部 AVAILABLE，然后全部更新
UPDATE resource_availability
SET status = 'HELD', hold_id = $hold_id
WHERE (resource_id, date) IN (...)
  AND status = 'AVAILABLE';

-- 插入组合预订记录
INSERT INTO multi_resource_bookings (id, hold_id, resource_ids, ...)
VALUES ($booking_id, $hold_id, ARRAY['room_101','projector_3','catering_svc'], ...);

COMMIT;
```

---

## 13. Waitlist 管理

### 优先队列设计

```
Waitlist 优先级分数 = base_score + time_bonus + loyalty_bonus

base_score:    0（所有人起点相同）
time_bonus:    每等待 1 小时 +1（同优先级层级内 FIFO）
loyalty_bonus: 超级房东房客 +10，已验证房客 +5
price_flex:    房源按 max_price <= current_price 过滤

+------------------+      Kafka: booking.cancelled       +------------------+
|  Waitlist Table  |<------------------------------------|  Booking Service  |
|  (Priority Q)    |                                     +------------------+
|                  |
| 按               |      +---------------------------+
| priority_score   |----->|  Waitlist Promotion Job   |
| 排序             |      |                           |
|                  |      | 1. 查询房源的前 N 个       |
| entry_1: score=47|      |    waitlist 条目          |
| entry_2: score=39|      | 2. 按 max_price 过滤      |
| entry_3: score=31|      | 3. 为排名最高的候选人      |
+------------------+      |    尝试锁定               |
                          | 4. 如锁定成功：            |
                          |    - 通知房客（邮件、      |
                          |      短信、推送）          |
                          |    - 给予 30 分钟确认      |
                          |    - 如未确认：下一位      |
                          | 5. 标记条目为 NOTIFIED     |
                          +---------------------------+
```

```sql
-- 取消时自动晋升
-- 通过 Kafka 消费者在 booking.cancelled 触发时执行

SELECT we.*, l.base_price
FROM waitlist_entries we
JOIN listings l ON l.id = we.listing_id
WHERE we.listing_id = $listing_id
  AND we.checkin_date = $checkin
  AND we.checkout_date = $checkout
  AND we.status = 'WAITING'
  AND (we.max_price IS NULL OR we.max_price >= l.base_price)
ORDER BY we.priority_score DESC, we.created_at ASC
LIMIT 5;   -- 晋升前 5 名，先确认者获胜
```

---

## 14. 动态定价与收益管理

### 定价引擎

```
基准价格
    |
    + 季节性乘数（7月4日周 1.5x）
    |
    + 需求乘数（基于搜索转化率）
    |       demand_score = searches_last_7d / avg_weekly_searches
    |       如果 demand_score > 1.5：应用 1.0 + (demand_score - 1.0) * 0.3
    |
    + 提前期折扣
    |       > 90 天：-10%（早鸟价）
    |       < 7 天：-15%（临时降价，如非高需求）
    |       < 2 天：-25%（超临时降价）
    |
    + 入住率乘数（酒店模式）
    |       入住率 0-60%：基准
    |       入住率 60-80%：+20%
    |       入住率 80-90%：+40%
    |       入住率 90%+：  +60%
    |
    = 最终价格（下限：基准的 50%，上限：基准的 300%）
```

```python
def calculate_price(listing_id: str, date: date) -> Decimal:
    listing = get_listing(listing_id)
    base = listing.base_price

    # 获取所有适用的规则，按优先级降序排列
    rules = get_pricing_rules(listing_id, date)

    price = base
    for rule in rules:
        if rule.price_override:
            price = rule.price_override
            break  # 覆盖价优先，停止应用后续规则
        elif rule.price_modifier:
            price *= rule.price_modifier

    # 动态需求调整（ML 模型输出，缓存 1 小时）
    demand_multiplier = demand_model.predict(listing_id, date)
    price *= demand_multiplier

    # 应用上下限
    price = max(price, base * Decimal('0.5'))
    price = min(price, base * Decimal('3.0'))

    return price.quantize(Decimal('0.01'))
```

---

## 15. 取消与退款政策

### 政策状态机

```
取消政策：

FLEXIBLE（灵活）：
  > 入住前 24 小时  →  100% 退款
  < 入住前 24 小时  →  0% 退款（保留第一晚费用）

MODERATE（适中）：
  > 入住前 5 天 → 100% 退款
  入住前 1-5 天 → 50% 退款
  < 入住前 24 小时 → 0% 退款

STRICT（严格）：
  > 入住前 14 天 → 50% 退款
  < 入住前 14 �� → 0% 退款
  不可退款选项    → 始终 0% 退款（显示更低价格）

SUPER STRICT（超严格，豪华/活动）：
  > 入住前 30 天 → 50% 退款
  < 入住前 30 天 → 0% 退款
```

```python
def calculate_refund(booking: Booking, cancelled_at: datetime) -> Decimal:
    days_before = (booking.checkin_date - cancelled_at.date()).days
    policy = booking.cancellation_policy

    if policy == 'flexible':
        pct = Decimal('1.0') if days_before > 1 else Decimal('0')
    elif policy == 'moderate':
        if days_before > 5:
            pct = Decimal('1.0')
        elif days_before >= 1:
            pct = Decimal('0.5')
        else:
            pct = Decimal('0')
    elif policy == 'strict':
        pct = Decimal('0.5') if days_before > 14 else Decimal('0')
    else:
        pct = Decimal('0')

    # 仅退还房客支付的部分（如不可退还则排除房东服务费）
    refundable_amount = booking.subtotal + booking.cleaning_fee + booking.service_fee * pct
    return (refundable_amount * pct).quantize(Decimal('0.01'))
```

---

## 16. 通知管道

```
+------------------+    Kafka Topics:         +------------------+
|  Booking Service |----booking.confirmed---->|                  |
|  Hold Service    |----hold.expired--------->|  Notification    |
|  Check-in Service|----booking.checked_in--->|  Orchestrator    |
|  Scheduler       |----reminder.24h_before-->|                  |
|  Review Requester|----booking.completed---->|  (有状态 FSM      |
+------------------+    review.requested      |   按预订管理)     |
                                              +--------+---------+
                                                       |
                  +------------------------------------+
                  |                |                   |
          +-------v-----+  +-------v------+  +---------v----+
          |   Email     |  |     SMS      |  |  Push Notif  |
          |  Service    |  |   Service    |  |   Service    |
          | (SendGrid)  |  | (Twilio)     |  | (FCM / APNs) |
          +-------------+  +--------------+  +--------------+

通知模板：
  BOOKING_CONFIRMED:
    - 主题："预订已确认！{confirmation_code}"
    - 内容：日期、地址、房东联系方式、入住说明
    - 发送：支付扣款后立即发送

  REMINDER_24H:
    - 主题："您的入住明天开始"
    - 内容：入住时间、门禁密码、停车位、WiFi 密码
    - 发送：入住日期前 24 小时，按房源时区上午 10 点

  REVIEW_REQUEST:
    - 主题："您在 {listing_title} 的入住体验如何？"
    - 内容：5 星评分链接、评价表单深度链接
    - 发送：退房日期后 2 小时，按房源时区

  HOST_BOOKING_REQUEST（非即时预订）：
    - 主题："{guest_name} 的新预订请求"
    - 内容：日期、房客资料、批准/拒绝链接
    - 发送：立即发送，24 小时过期
```

---

## 17. 周期性预订

### 循环引擎

```
模板：每周一 9am-10am 站会，4月1日 - 12月31日

生成策略：延迟展开
  - 存储模板，而非单独的预订
  - 提前展开 N 周（滚动窗口：始终预展开 4 周）
  - 当添加异常时：将特定日期标记为 SKIPPED

+------------------+       +---------------------+
|  Recurring       |       |  Occurrence         |
|  Template        |       |  Expander (cron)    |
|                  |       |                     |
| recurrence_type  |       | 每天凌晨 2 点运行    |
| days_of_week     |------>| 为接下来 4 周        |
| series_start     |       | 生成尚不存在的预订    |
| series_end       |       |                     |
| exception_dates  |       |                     |
+------------------+       +----------+----------+
                                      |
                           +----------v----------+
                           |  创建单独的预订记录   |
                           |  带 template_id 引用  |
                           +---------------------+
```

```sql
-- 生成周期性实例
-- 由 cron 任务调用：每天执行，前瞻 28 天

INSERT INTO bookings (
  listing_id, guest_id, host_id, checkin_date, checkout_date,
  status, price_per_night, ..., recurring_template_id
)
SELECT
  t.listing_id, t.guest_id, l.host_id,
  d::DATE AS checkin_date,
  (d + INTERVAL '1 day')::DATE AS checkout_date,
  'CONFIRMED', l.base_price, ..., t.id
FROM recurring_booking_templates t
JOIN listings l ON l.id = t.listing_id
CROSS JOIN generate_series(
  GREATEST(t.series_start, CURRENT_DATE),
  LEAST(t.series_end, CURRENT_DATE + INTERVAL '28 days'),
  INTERVAL '1 week'
) AS d
WHERE EXTRACT(DOW FROM d) = ANY(t.days_of_week)
  AND d != ALL(t.exception_dates)
  AND t.status = 'active'
ON CONFLICT (recurring_template_id, checkin_date) DO NOTHING;
```

---

## 18. 日历同步 (iCal / Google Calendar)

### iCal 导入（封锁外部日历）

```
+------------------+    HTTP GET（每 15 分钟轮询）    +------------------+
|  Calendar Sync   |------------------------------------>|  External iCal   |
|  Worker          |<-----------------------------------|  (Airbnb, VRBO,   |
|                  |    .ics 文件                        |   Booking.com)   |
|  - 解析 VEVENT   |                                     +------------------+
|  - 提取          |
|    DTSTART,DTEND |
|  - 与已知事件    |
|    对比          |
|  - 为新事件封锁  |
|    日期          |
|  - 为已删除事件  |
|    解封日期      |
+--------+---------+
         |
         | Kafka: availability.changed
         |
+--------v---------+
|  Availability    |
|  Service         |
|  (封锁日期)      |
+------------------+
```

```
iCal 导出（房客可订阅）：

URL: https://api.example.com/v1/listings/{listing_id}/calendar.ics?token={secret}

BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BookingSystem//EN
X-WR-CALNAME:Cozy Studio - Booked Dates
BEGIN:VEVENT
UID:bkg_ghi789@bookingsystem.example.com
DTSTART;VALUE=DATE:20260701
DTEND;VALUE=DATE:20260708
SUMMARY:BLOCKED
DESCRIPTION:Booking confirmed
STATUS:CONFIRMED
LAST-MODIFIED:20260301T140233Z
END:VEVENT
END:VCALENDAR
```

### Google Calendar 双向同步

```
导出（推送）：
  预订确认时 → Google Calendar API: events.insert() 到房东日历
  预订取消时 → Google Calendar API: events.delete()
  使用 syncToken 进行增量同步以提高效率

导入（通过推送通知拉取）：
  房东在 Google Calendar 中封锁一个日期
  → Google 向我们的 webhook 发送推送通知
  → 我们解析事件，封锁房源可用性中的日期
  → 防止跨平台 double-booking
```

---

## 19. 扩展策略

### 数据库扩展

```
+---------------------------+         +---------------------------+
|  Write Leader（主节点）    |-------->|  Read Replica 1           |
|  (PostgreSQL, us-east-1)  |         |  (同步副本, us-east-1)     |
|                           |-------->|                           |
|  - 所有预订写入            |         |  Read Replica 2           |
|  - 可用性更新              |         |  (us-west-2, 异步)        |
|  - 强一致性               |         |                           |
+---------------------------+         +---------------------------+
              |
              | Kafka CDC (Debezium)
              |
+-------------v-------------+         +---------------------------+
|  OLAP 副本                |         |  Elasticsearch            |
|  (只读分析)               |         |  (搜索索引)               |
|                           |         |  - 通过 Kafka 消费者更新   |
|  - 收入报表               |         |                           |
|  - 入住率仪表板            |         |  - 最终一致性             |
+---------------------------+         |    (~5秒延迟可接受)        |
                                      +---------------------------+

分片策略（当单个数据库成为瓶颈时）：
  按 listing_id 分片（一致性哈希）
  - 将同一 listing_id 的房源 + 可用性 + 预订共同定位
  - 初始 64 个分片（便于加倍）
  - Waitlist、定价规则：与房源在同一分片

跨分片查询（例如房客的预订历史）：
  - 在 Redis 中维护二级索引：guest_id → [booking_ids]
  - 扇出读取房客历史（可接受：稀少，低 QPS）
```

### 缓存架构

```
+------------------+   L1 缓存（进程内）        +------------------+
|  Search Service  |   LRU, 10K 条目,           |  Booking Service |
|                  |   TTL 30 秒                |                  |
+--------+---------+                            +--------+---------+
         |                                               |
         |              +------------------+             |
         +------------->|   Redis Cluster  |<------------+
                        |                  |
                        |  Avail bitmaps   |  TTL 48 小时
                        |  Hold locks      |  TTL 15 分钟
                        |  Price cache     |  TTL 1 小时
                        |  Session tokens  |  TTL 24 小时
                        |  Idempotency     |  TTL 24 小时
                        |  Rate limits     |  TTL 1 分钟滑动窗口
                        +------------------+

Redis Cluster：6 个节点（3 主 + 3 副本）
  分区：16384 个哈希槽分布在 3 个主节点上
  故障转移：自动 sentinel，< 30 秒 RTO
  内存：每节点 64 GB = 集群总共 384 GB 内存
```

### 搜索服务扩展

```
                    +------------------+
  搜索请求 -------->|  Search Gateway  |
                    |  (查询路由器)     |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +-------v----+  +------v-----+
     | ES Shard 1 |  | ES Shard 2 |  | ES Shard 3 |
     | (美洲)      |  | (欧洲)     |  | (亚洲)      |
     +------------+  +------------+  +------------+

按地理分区的 Elasticsearch：
  - 按地理区域分片（城市前缀 → 分片）
  - 仅当用户跨区域时才跨分片查询
  - 每个分片 2 个副本用于高可用
  - 500M 房源文档，每个约 1 KB = 500 GB 索引
  - 包含副本：1.5 TB ES 存储
```

---

## 20. 权衡取舍

| 决策 | 选择 | 替代方案 | 原因 |
|------|------|----------|------|
| 可用性存储 | 按日期行（PostgreSQL） | 区间范围 | 查询更简单，锁粒度更容易控制 |
| Double-booking 防护 | Redis SETNX + SELECT FOR UPDATE | 纯乐观锁 | 冲突时无需数据库往返即可快速失败 |
| 锁定机制 | Redis TTL + 数据库记录 | 仅数据库定时清理 | 亚秒级过期精度 vs 1 分钟 cron 延迟 |
| 搜索索引 | Elasticsearch | PostgreSQL 全文搜索 | ES 水平扩展；更好的地理 + 分面搜索 |
| 可用性缓存 | Redis 位图 | 物化视图 | 46 字节/年 vs 365 行，小 1000 倍 |
| 一致性模型 | 写入强一致、读取最终一致 | 完全强一致 | 性能：读副本/ES 延迟可接受 |
| Overbooking | 按物业类型可配置 | 始终精确容量 | 酒店的收入优化；Airbnb 关闭 |
| 日历同步 | iCal 轮询 + Google 推送 | 仅推送 | iCal 标准不支持推送；轮询是必要的 |

---

## 21. 常见面试追问

**问：如何在高峰期 10K 预订/分钟时保证零 double-booking？**

答：三层防御：
1. Redis SETNX 作为快速预检查（< 1ms，明确冲突时无需数据库访问）
2. PostgreSQL SELECT FOR UPDATE NOWAIT 在数据库层（可串行化写入）
3. `(listing_id, date)` 上带 `status='BOOKED'` 的唯一约束作为数据库安全网

在 10K 预订/分钟 = 167/秒时，99% 是非冲突的，只有约 1-2/秒甚至会尝试锁竞争路径。PostgreSQL 通过连接池（PgBouncer）可以轻松应对。

**问：如果房客在锁定确认后支付失败怎么办？**

答：锁定保持有效。我们在 15 分钟 TTL 内以指数退避重试支付最多 3 次（1秒、4秒、16秒）。如果所有重试在过期前都失败，锁定会自动过期并释放可用性。房客收��支付失败通知，附带使用新支付方式重试的链接（这会创建新的锁定）。

**问：你的搜索如何处理 500K 并发用户？**

答：水平扩展的 Elasticsearch（按地理分区）处理搜索查询本身。热门搜索的 90% 缓存命中率（Redis 对常见城市+日期组合设置 5 分钟 TTL）意味着只有约 50K QPS 到达 ES。ES 配置为跨分片处理 100K QPS。ES 中的可用性新鲜度延迟最多 5 秒（通过 Kafka 消费者），这是可接受的，因为预订确认步骤执行的是权威的实时检查。

**问：当热门房源变得可用时（例如名人住所取消），如何处理惊群效应？**

答：三种机制：
1. Waitlist 晋升是串行化的 - 一次只通知 1 人，有 30 分钟响应窗口
2. 对于非 waitlist 房客，可用性更新在 5 秒内传播到 Elasticsearch，但 Redis SETNX 确保只有一个锁定成功
3. 对同一房源的锁定创建进行限流：每个 (listing_id, date_range) 在任何时刻最多 1 个成功锁定

**问：如何处理东京房客预订纽约房源的"7月1日"时区边界情况？**

答：预订日期存储为 DATE 类型（与时区无关）。"7月1日"始终表示房源时区（America/New_York）的午夜。界面转换并显示："入住：2026年7月1日下午3点（东部时间 / 东京时间7月2日凌晨4点）"。房客明确看到两个时区。提醒通知按房源当地时间触发（例如东部时间上午10点，不论房客时区）。

**问：如何防止房客利用锁定系统恶意封锁热门房源？**

答：锁定创建的限流：
- 每位房客任何时刻最多 3 个活跃锁定
- 每个 (guest_id, listing_id) 任何时刻最多 1 个活跃锁定
- 锁定频率：每位房客每小时最多 5 次锁定
- 基于 IP：每个 IP 每小时最多 10 次锁定
- 滥用检测：7 天内创建并放弃超过 80% 锁定的房客将获得缩短的锁定 TTL（5 分钟）或需要人工审核

**问：当房东封锁周期性预订的某个特定日期时，你的系统如何处理？**

答：周期性模板存储一个 `exception_dates` 数组。当房东封锁特定日期时：
1. 取消该日期已预生成的单独预订（执行退款）
2. 将日期添加到模板的 `exception_dates`
3. 未来的实例生成跳过 exception_dates
4. 房客收到通知并可预订替代日期

模板本身继续正常生成所有其他实例。

**问：请描述房客取消有 waitlist 房客的预订时的数据流。**

答：
```
房客取消 → POST /v1/bookings/{id} (DELETE)
  ↓
Booking Service:
  1. 验证取消资格和政策
  2. BEGIN TX:
     - 更新 bookings.status = 'CANCELLED'
     - 更新 availability 行：status = 'AVAILABLE'
     - 计算退款金额
     - 记录 refund_id
  3. COMMIT
  4. 发布到 Kafka：booking.cancelled, availability.released
  ↓
Waitlist Service（消费 booking.cancelled）：
  1. 查询 (listing_id, checkin, checkout) 的 waitlist，按 priority_score DESC 排序
  2. 按 max_price 过滤
  3. 为排名最高的候选人：尝试锁定（完整锁定流程）
  4. 如锁定成功：发送 "好消息！您等候的日期现已可用" 通知
     - 房客有 30 分钟确认
     - 如未确认：释放锁定，尝试下一位 waitlist 候选人
  ↓
Notification Service（消费 booking.cancelled）：
  1. 向房客发送取消确认（含退款详情）
  2. 向房东发送通知："预订已取消，日期现已开放"
  ↓
Payment Service（消费 booking.cancelled）：
  1. 通过 Stripe refund API 发起退款
  2. 发布 payment.refunded 事件
  3. Notification Service 向房客发送 "退款已发起"
```

**问：如何为高峰预订负载确定数据库连接池大小？**

答：
```
高峰负载：167 次预订确认/秒
每次预订：~50ms 数据库时间（锁定 + 确认 = 2 个事务）
所需并发数据库连接：167 * 0.05 = ~8-9 个活跃连接
2x 余量：20 个连接
PgBouncer（事务模式池化）：20 个服务器连接服务数百个应用连接
应用服务器连接池：100 个连接到 PgBouncer
PgBouncer → PostgreSQL：最多 20 个连接

这个数字刻意较小 —— 大部分预订延迟来自支付 API（外部），而非数据库。
```

---

*最后更新：2026-03-01*
