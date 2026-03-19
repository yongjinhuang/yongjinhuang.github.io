# 设计网约车系统 (Uber/Lyft)

## 1. 需求澄清

### 功能需求

| 类别     | 需求                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| **乘客** | 发起叫车请求（上车点/下车点）、查看附近司机、实时追踪、行程历史、为司机评分、分摊车费 |
| **司机** | 上线/下线、接受/拒绝叫车请求、导航至上车点和下车点、收入仪表盘、为乘客评分            |
| **匹配** | 为乘客匹配最优附近司机、拒绝/超时后重新匹配、支持拼车                                 |
| **定价** | 预估车费、surge/动态定价、费用明细、优惠码                                            |
| **支付** | 预授权支付、完成后扣费、小费、司机提现、退款                                          |
| **安全** | SOS 按钮、与联系人分享行程、司机/乘客验证、行程录音                                   |

### 非功能需求

| 需求         | 目标                                   |
| ------------ | -------------------------------------- |
| 匹配延迟     | < 1 分钟找到司机 (p99)                 |
| 位置更新频率 | 活跃司机每 3-5 秒一次                  |
| 可用性       | 99.99% 正常运行时间 (< 52 分钟停机/年) |
| 位置精度     | < 10 米精度                            |
| 实时追踪延迟 | < 2 秒端到端                           |
| 峰值需求处理 | 活动/恶劣天气时 3-5 倍正常流量         |

### 规模估算

```
Riders:              100M registered, 30M monthly active
Drivers:             5M registered, 2M weekly active
Rides per day:       20M trips/day
Concurrent rides:    ~1M at peak (20M / 24hr * peak factor)
Peak rides/sec:      ~500 ride requests/sec (20M / 86400 * 2x peak)
```

### 粗略计算

**位置更新：**

```
Active drivers at peak:    2M
Update frequency:          1 update / 4 seconds
Location updates/sec:      2,000,000 / 4 = 500,000 updates/sec
Payload per update:         ~100 bytes (driver_id, lat, lng, timestamp, heading, speed)
Bandwidth (ingest):        500,000 * 100 = 50 MB/sec = 400 Mbps
```

**位置存储（热数据，最近 24 小时）：**

```
Updates per driver per day: 86,400 / 4 = 21,600 (if online 24h, ~8h avg = 7,200)
Total updates/day:          2M * 7,200 = 14.4B updates/day
Storage per update:         100 bytes
Daily storage:              14.4B * 100 = 1.44 TB/day
```

**匹配 QPS：**

```
Ride requests/sec:          500 (peak)
Matching operations/sec:    500 (each triggers geospatial query)
Geospatial queries/sec:     500 (find nearby drivers)
Average candidates/query:   10-50 drivers evaluated
```

**行程数据存储：**

```
Trips per day:              20M
Average trip record:        2 KB (metadata + route summary)
Daily trip storage:         20M * 2 KB = 40 GB/day
Annual trip storage:        40 * 365 = 14.6 TB/year
```

---

## 2. 高层架构

```
                        +------------------+
                        |   Rider Mobile   |
                        |      App         |
                        +--------+---------+
                                 |
                          HTTPS / WebSocket
                                 |
                        +--------v---------+
                        |   API Gateway    |
                        |  (Auth, Rate     |
                        |   Limit, Route)  |
                        +--------+---------+
                                 |
         +-----------+-----------+-----------+-----------+
         |           |           |           |           |
+--------v---+ +-----v------+ +-v--------+ +v--------+ +v-----------+
|   Ride     | |  Location  | | Matching | | Pricing | | Payment    |
|  Service   | |  Service   | | Service  | | Service | | Service    |
|            | |            | |          | |         | |            |
| Trip CRUD  | | Geo Index  | | Driver   | | Surge   | | Pre-auth   |
| State Mgmt | | Proximity  | | Selection| | Dynamic | | Charge     |
| History    | | Tracking   | | Batching | | Upfront | | Payouts    |
+-----+------+ +-----+------+ +----+-----+ +----+----+ +-----+------+
      |               |             |            |             |
      |         +-----v------+     |            |             |
      |         | Geospatial |     |            |             |
      |         |   Index    |     |            |             |
      |         | (Redis /   |     |            |             |
      |         |  In-Memory)|     |            |             |
      |         +------------+     |            |             |
      |                            |            |             |
+-----v----------------------------v------------v-------------v------+
|                        Apache Kafka                                |
|            (Event Streaming / Inter-Service Communication)         |
+----+----------+----------+----------+----------+------------------+
     |          |          |          |          |
+----v---+ +---v----+ +---v----+ +---v----+ +---v--------+
|Trip DB | |Location| |Driver  | |Pricing | |Payment DB  |
|Postgres| |  DB    | |  DB    | |  DB    | |  Postgres  |
|        | |TimeSer.| |Postgres| |Redis   | |            |
+--------+ +--------+ +--------+ +--------+ +------------+

                        +------------------+
                        |  Driver Mobile   |
                        |      App         |
                        +--------+---------+
                                 |
                     WebSocket (continuous)
                                 |
                        +--------v---------+
                        |  Location Service|
                        |  (Driver Gateway)|
                        +------------------+

Supporting Services:
+----------------+  +------------------+  +------------------+
| Notification   |  |   ETA Service    |  |  Supply/Demand   |
| Service        |  |  (Routing +      |  |  Forecasting     |
| (Push/SMS)     |  |   ML Prediction) |  |  Service         |
+----------------+  +------------------+  +------------------+
```

### 服务职责

| 服务                     | 职责                          | 协议                            |
| ------------------------ | ----------------------------- | ------------------------------- |
| **API Gateway**          | 认证、限流、请求路由          | HTTPS, WebSocket                |
| **Ride Service**         | 行程生命周期管理、状态机      | gRPC                            |
| **Location Service**     | 接收司机位置、geospatial 查询 | WebSocket（接收）, gRPC（查询） |
| **Matching Service**     | 为叫车请求寻找最优司机        | gRPC                            |
| **Pricing Service**      | 车费计算、surge pricing       | gRPC                            |
| **Payment Service**      | 预授权、扣费、提现            | gRPC                            |
| **ETA Service**          | 路线计算、时间预估            | gRPC                            |
| **Notification Service** | 推送通知、短信                | Kafka consumer                  |

---

## 3. 行程生命周期

### 状态机

```
                                    TIMEOUT / NO_DRIVERS
                                   +-------------------+
                                   |                   |
                                   v                   |
+----------+     +---------+   +---+------+     +------+------+
|          | --> |         |-->|          | --> |             |
| REQUESTED|    | MATCHING |   | DRIVER   |    |DRIVER       |
|          |    |         |   | ASSIGNED |    |EN_ROUTE     |
+----+-----+    +----+----+   +----+-----+    +------+------+
     |               |              |                 |
     |  CANCEL       |  CANCEL      |  CANCEL         |
     +---+           +---+          +---+             |
         |               |              |             |
         v               v              v             |
    +---------+    +---------+    +---------+         |
    |CANCELLED|    |CANCELLED|    |CANCELLED|         |
    |_BY_RIDER|    |_NO_MATCH|    |_BY_RIDER|         |
    +---------+    +---------+    |_BY_DRIVR|         |
                                  +---------+         |
                                                      |
                                              +-------v------+
                                              |              |
                                              |   ARRIVED    |
                                              | (at pickup)  |
                                              +-------+------+
                                                      |
                                          RIDER       |  START
                                          NO_SHOW     |  TRIP
                                          +---+       |
                                              |       |
                                              v       v
                                        +-----+-+ +--+----------+
                                        |NO_SHOW| | IN_PROGRESS  |
                                        +-------+ +------+------+
                                                         |
                                                         | ARRIVE
                                                         | AT DEST
                                                         v
                                                  +------+------+
                                                  |             |
                                                  |  COMPLETED  |
                                                  |             |
                                                  +------+------+
                                                         |
                                                         v
                                                  +------+------+
                                                  |             |
                                                  |   RATED     |
                                                  |             |
                                                  +-------------+
```

### 状态转换

| 从              | 到                  | 触发条件       | 副作用                             |
| --------------- | ------------------- | -------------- | ---------------------------------- |
| REQUESTED       | MATCHING            | 系统           | 启动匹配计时器，计算预估价格       |
| MATCHING        | DRIVER_ASSIGNED     | 匹配成功       | 通知司机，启动接受计时器（15秒）   |
| MATCHING        | CANCELLED_NO_MATCH  | 超时（2 分钟） | 通知乘客，不收费                   |
| DRIVER_ASSIGNED | DRIVER_EN_ROUTE     | 司机接受       | 通知乘客，开始 ETA 追踪            |
| DRIVER_ASSIGNED | MATCHING            | 司机拒绝/超时  | 重新进入匹配池，排除该司机         |
| DRIVER_EN_ROUTE | ARRIVED             | 司机到达上车点 | 通知乘客，启动等待计时器（5 分钟） |
| ARRIVED         | IN_PROGRESS         | 乘客上车       | 开始计价，开始路线追踪             |
| ARRIVED         | NO_SHOW             | 等待计时器到期 | 收取取消费，释放司机               |
| IN_PROGRESS     | COMPLETED           | 到达目的地     | 计算最终车费，向乘客扣费           |
| COMPLETED       | RATED               | 提交评分       | 更新司机/乘客评分                  |
| 任何行程前状态  | CANCELLED_BY_RIDER  | 乘客取消       | 可能收取取消费                     |
| DRIVER_ASSIGNED | CANCELLED_BY_DRIVER | 司机取消       | 对司机处罚，重新匹配               |

### 超时处理

```
State               Timeout    Action
---------           -------    ------
MATCHING            120s       Cancel ride, notify rider
DRIVER_ASSIGNED     15s        Skip driver, try next candidate
DRIVER_EN_ROUTE     15min      Alert ops, check on driver
ARRIVED             5min       Mark NO_SHOW, charge cancel fee
IN_PROGRESS         None       (trip continues until completion)
COMPLETED           24h        Auto-rate 5 stars if no rating
```

### 取消补偿

```
Cancellation Stage          Rider Charged?     Driver Compensated?
------------------          --------------     -------------------
Before matching             No                 N/A
During matching             No                 N/A
After driver assigned       Maybe ($5 fee)     No
Driver en route (< 2min)    No                 No
Driver en route (> 2min)    Yes ($5 fee)       Yes (partial)
Driver arrived + waiting    Yes ($5-10 fee)    Yes (wait time)
```

---

## 4. 位置服务

### 司机位置更新流程

```
+-------------+                    +------------------+
| Driver App  | -- WebSocket ----> | Location Gateway |
| (every 4s)  |                    | (Connection Mgr) |
+-------------+                    +--------+---------+
                                            |
                              +-------------+-------------+
                              |                           |
                     +--------v--------+        +---------v--------+
                     | In-Memory       |        | Kafka Topic      |
                     | Geospatial      |        | "driver-location"|
                     | Index           |        +--------+---------+
                     | (Redis GEOADD)  |                 |
                     +--------+--------+        +--------v---------+
                              |                 | Location History  |
                         Proximity              | (TimescaleDB /    |
                         Queries                |  InfluxDB)        |
                              |                 +------------------+
                     +--------v--------+
                     | Matching Service|
                     | "Find nearby    |
                     |  drivers"       |
                     +-----------------+
```

### 位置更新载荷

```json
{
  "driver_id": "d_abc123",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "heading": 270,
  "speed": 35.5,
  "accuracy": 5.0,
  "timestamp": 1709308800000,
  "trip_id": "t_xyz789",
  "status": "ON_TRIP"
}
```

### 协议选择：WebSocket vs UDP

| 因素     | WebSocket          | UDP          |
| -------- | ------------------ | ------------ |
| 可靠性   | 保证送达           | 可能丢包     |
| 开销     | TCP + WS 帧开销    | 极小         |
| 双向通信 | 是（服务端可推送） | 需要单独通道 |
| 防火墙   | 可穿透 NAT         | 可能被阻止   |
| 电池消耗 | 需要心跳保活       | 无持久连接   |
| **结论** | **移动端首选**     | 适合内部服务 |

WebSocket 是首选，因为：

- 移动网络对 TCP 支持良好，UDP 可能被封锁
- 双向通信：服务端可将行程分配推送给司机
- 连接状态有助于检测司机离线

### Geospatial 索引方案

#### 方案 1：Geohash

```
Geohash encodes lat/lng into a string where shared prefixes
indicate spatial proximity.

World divided into grid cells:
+---------+---------+---------+---------+
|  9q8y   |  9q8z   |  9q9p   |  9q9r   |
+---------+---------+---------+---------+
|  9q8v   |  9q8w   |  9q9n   |  9q9q   |
+---------+---------+---------+---------+    Precision 4: ~39km x 19km
|  9q8t   |  9q8x   |  9q9j   |  9q9m   |    Precision 5: ~5km x 5km
+---------+---------+---------+---------+    Precision 6: ~1.2km x 0.6km
|  9q8s   |  9q8u   |  9q9h   |  9q9k   |    Precision 7: ~150m x 150m
+---------+---------+---------+---------+

Query "find drivers within 2km":
1. Compute geohash of rider location at precision 6
2. Get 8 neighboring geohashes (handles edge cases)
3. Query all 9 cells for driver locations
4. Filter by exact distance
```

#### 方案 2：Google S2 Cells

```
S2 projects Earth onto a cube, then uses Hilbert curve for indexing.

Level 12: ~3.3km x 3.3km  (city blocks)
Level 14: ~800m x 800m    (neighborhood)
Level 16: ~200m x 200m    (block)
Level 18: ~50m x 50m      (intersection)

Advantages:
- No edge effects (unlike geohash)
- Hierarchical covering of arbitrary regions
- Uniform cell sizes at each level
```

#### 方案 3：Quadtree

```
Recursively divide space into 4 quadrants:

+-------------------+-------------------+
|                   |                   |
|     NW            |      NE          |
|                   |    +------+------+|
|                   |    |  NE  | NE   ||
|                   |    |  NW  | NE   ||
+---------+---------+    +------+------+|
|         |         |    |  NE  | NE   ||
|   SW    |   SE    |    |  SW  | SE   ||
|         |         |    +------+------+|
|         |         |                   |
+---------+---------+-------------------+

Split when cell contains > MAX_DRIVERS (e.g., 500)
Dense areas get finer granularity automatically
```

#### 对比

| 方案         | 优点                           | 缺点               | 最适用于               |
| ------------ | ------------------------------ | ------------------ | ---------------------- |
| **Geohash**  | 简单、Redis 内置支持、前缀搜索 | 边界效应、不均匀   | MVP、基于 Redis 的方案 |
| **S2 Cells** | 无���界效应、均匀、层级化      | 需要复杂的库       | 大规模生产环境         |
| **Quadtree** | 自适应密度、内存高效           | 重平衡复杂、仅内存 | 自定义内存索引         |

### Redis Geospatial 实现

```
# Add/update driver location
GEOADD drivers:active -122.4194 37.7749 driver_abc123

# Find drivers within 3km radius
GEOSEARCH drivers:active
  FROMLONLAT -122.4194 37.7749
  BYRADIUS 3 km
  ASC
  COUNT 20
  WITHCOORD
  WITHDIST

# Result:
# 1) driver_abc123, 0.5km, (-122.4180, 37.7760)
# 2) driver_def456, 1.2km, (-122.4210, 37.7700)
# ...

# Remove driver when going offline
ZREM drivers:active driver_abc123

# Shard by city for scalability
GEOADD drivers:sf -122.4194 37.7749 driver_abc123
GEOADD drivers:nyc -73.9857 40.7484 driver_xyz789
```

### 位置历史存储 (TimescaleDB)

```sql
CREATE TABLE driver_locations (
    driver_id    UUID NOT NULL,
    timestamp    TIMESTAMPTZ NOT NULL,
    location     GEOGRAPHY(Point, 4326),
    heading      SMALLINT,
    speed        REAL,
    accuracy     REAL,
    trip_id      UUID,
    status       VARCHAR(20)
);

-- Convert to TimescaleDB hypertable (auto-partition by time)
SELECT create_hypertable('driver_locations', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour');

-- Compression policy: compress chunks older than 1 day
SELECT add_compression_policy('driver_locations', INTERVAL '1 day');

-- Retention policy: drop data older than 30 days
SELECT add_retention_policy('driver_locations', INTERVAL '30 days');

-- Index for trip replay
CREATE INDEX idx_driver_trip ON driver_locations (trip_id, timestamp);
```

---

## 5. 司机匹配算法

### 简单最近司机匹配

```
Input:  Rider location (lat, lng), desired vehicle type
Output: Best driver to assign

Algorithm:
1. Query geospatial index for drivers within radius R
   - Start with R = 2km
   - Expand to 5km, then 10km if too few candidates
2. Filter candidates:
   - Status = AVAILABLE (not on trip, not matching)
   - Vehicle type matches request
   - Not in "cooldown" (recently rejected this rider)
3. For each candidate, compute:
   - ETA to pickup (via routing engine, not straight-line)
4. Sort by ETA ascending
5. Offer ride to closest driver (lowest ETA)
6. If driver rejects/times out (15s), offer to next
```

**问题：** 贪心最近匹配可能在全局上不是最优的。

```
Example of suboptimality:

    R1 ---- 2km ---- D1 ---- 1km ---- R2

Greedy: Assign D1 to R1 (closest to R1)
Result: R2 has no nearby driver, waits much longer

Optimal: Assign D1 to R2 (1km), find D2 for R1
Result: Both riders served faster overall
```

### 批量匹配（生产环境方案）

```
+-------------------+     +---------------------+     +------------------+
| Ride Requests     | --> | Batch Collector     | --> | Bipartite        |
| (incoming stream) |     | (2-5 second window) |     | Matching Engine  |
+-------------------+     +---------------------+     +--------+---------+
                                                               |
+-------------------+     +---------------------+              |
| Available Drivers | --> | Candidate Generator | -------------+
| (from geo index)  |     | (find nearby for    |
+-------------------+     |  each request)      |     +--------v---------+
                          +---------------------+     | Optimal          |
                                                      | Assignments      |
                                                      | (minimize total  |
                                                      |  wait time)      |
                                                      +------------------+
```

#### 二部图匹配公式

```
Riders:  {R1, R2, R3, R4}
Drivers: {D1, D2, D3, D4, D5}

Cost matrix (ETA in minutes):
         D1    D2    D3    D4    D5
    R1 [ 3     7     INF   5     INF ]
    R2 [ 5     2     8     INF   4   ]
    R3 [ INF   6     3     4     INF ]
    R4 [ 4     INF   INF   7     2   ]

INF = driver too far (> radius threshold)

Goal: Find assignment minimizing total ETA
      Subject to: each rider gets at most 1 driver
                  each driver gets at most 1 rider

Solution (Hungarian Algorithm):
    R1 -> D1 (3 min)
    R2 -> D2 (2 min)
    R3 -> D3 (3 min)
    R4 -> D5 (2 min)
    Total: 10 minutes

Greedy would give:
    R2 -> D2 (2 min)  -- D2 closest to R2
    R3 -> D3 (3 min)  -- D3 closest to R3
    R1 -> D1 (3 min)  -- D1 closest to R1
    R4 -> D5 (2 min)
    Total: 10 minutes  (same here, but differs in complex cases)
```

#### Hungarian Algorithm

```
Time complexity: O(n^3) for n x n matrix
For our scale:  batch of 50-100 requests
                50-500 candidate drivers per batch
                Runs in < 10ms

Steps:
1. Subtract row minimums from cost matrix
2. Subtract column minimums
3. Cover all zeros with minimum number of lines
4. If lines == n, optimal assignment found
5. Otherwise, adjust matrix and repeat
```

### 匹配标准（加权评分）

```
Score(rider, driver) = w1 * ETA_score
                     + w2 * Rating_score
                     + w3 * AcceptRate_score
                     + w4 * VehicleMatch_score

Where:
  w1 = 0.50  (ETA is most important)
  w2 = 0.15  (driver rating: 4.5+ preferred)
  w3 = 0.15  (high acceptance rate preferred)
  w4 = 0.20  (exact vehicle match)

  ETA_score = 1 - (ETA / MAX_ETA)   [normalized 0-1]
  Rating_score = (rating - 3.0) / 2.0
  AcceptRate_score = acceptance_rate  [already 0-1]
  VehicleMatch_score = 1.0 if exact match, 0.5 if upgrade, 0.0 if no match
```

### 拒绝后重新匹配

```
Driver rejects ride request:

1. Remove driver from candidate pool
2. Add "cooldown" for this (rider, driver) pair (30 min)
3. Check if batch window still open:
   a. Yes -> Add request back to batch, re-run matching
   b. No  -> Fall back to greedy next-best driver
4. If 3 consecutive rejections:
   - Expand search radius by 2x
   - Re-compute surge (demand clearly high)
5. If no driver found within 2 minutes:
   - Notify rider "No drivers available"
   - Offer to keep searching or cancel
```

---

## 6. 定价与 Surge Pricing

### 基础车费计算

```
fare = base_fare
     + (per_mile_rate * distance_miles)
     + (per_minute_rate * duration_minutes)
     + booking_fee
     + tolls
     + surge_multiplier_adjustment

Example (UberX in San Francisco):
  base_fare       = $2.55
  per_mile_rate   = $1.75
  per_minute_rate = $0.35
  booking_fee     = $2.75
  minimum_fare    = $7.20

  Trip: 5.2 miles, 18 minutes, no surge, $3.50 toll

  fare = $2.55 + (1.75 * 5.2) + (0.35 * 18) + $2.75 + $3.50
       = $2.55 + $9.10 + $6.30 + $2.75 + $3.50
       = $24.20
```

### Surge Pricing 流水线

```
+------------------+    +--------------------+    +------------------+
| Location Updates | -> | Supply Counter     | -> | Supply/Demand    |
| (driver stream)  |    | per Geohash Cell   |    | Ratio Calculator |
+------------------+    +--------------------+    +--------+---------+
                                                           |
+------------------+    +--------------------+             |
| Ride Requests    | -> | Demand Counter     | ------------+
| (rider stream)   |    | per Geohash Cell   |
+------------------+    +--------------------+    +--------v---------+
                                                  | Surge Multiplier |
                                                  | Engine           |
                                                  +--------+---------+
                                                           |
                                                  +--------v---------+
                                                  | Smoothing &      |
                                                  | Cap Logic        |
                                                  +--------+---------+
                                                           |
                                                  +--------v---------+
                                                  | Pricing Service  |
                                                  | Cache (Redis)    |
                                                  +------------------+
```

### Surge 倍率计算

```
For each geohash cell (precision 6, ~1km x 1km):

  supply = count of available drivers in cell
  demand = count of ride requests in last 5 minutes

  ratio = demand / max(supply, 1)

  Surge multiplier table:
  ratio < 1.0   -> multiplier = 1.0x  (no surge)
  ratio 1.0-1.5 -> multiplier = 1.2x
  ratio 1.5-2.0 -> multiplier = 1.5x
  ratio 2.0-3.0 -> multiplier = 1.8x
  ratio 3.0-4.0 -> multiplier = 2.2x
  ratio 4.0-5.0 -> multiplier = 2.8x
  ratio > 5.0   -> multiplier = 3.5x  (capped)

Smoothing (prevent price cliff):
  new_multiplier = 0.7 * current_multiplier + 0.3 * calculated_multiplier
  (Exponential moving average, updates every 2 minutes)

  This prevents:
  - Sudden 1.0x -> 3.0x jumps
  - Rapid oscillation between surge levels
```

### Surge 价格上限与透明度

```
Rules:
1. Maximum surge multiplier: 3.5x (configurable per city)
2. Rider must confirm surge before requesting
3. Display estimated fare range prominently
4. Surge notification: "Prices are higher due to increased demand"
5. No surge for trips from hospitals or disaster zones

Anti-abuse:
- Drivers cannot see surge map (prevents artificial supply reduction)
- Surge based on actual ride requests, not app opens
- Minimum duration for surge (prevent flash surges)
```

### 预估定价

```
Instead of metered fare, show fixed price before trip:

1. Rider enters pickup + destination
2. System calculates:
   a. Route via routing engine
   b. Estimated distance + time
   c. Current surge multiplier
   d. Tolls on route
3. Display: "Your trip will cost $24.20"
4. Price is locked at request time

Adjustment scenarios:
- Rider changes destination mid-trip -> recalculate
- Major route deviation (road closure) -> recalculate
- Long stop requested by rider -> add wait charges
- Toll differences -> adjust at completion
```

---

## 7. ETA 预估

### ETA 组成部分

```
Two types of ETA:

1. Pickup ETA: Time for driver to reach rider
   - Computed by routing engine
   - Uses real-time traffic data
   - Updated every 30 seconds while driver en route

2. Trip ETA: Estimated duration of the trip
   - Pre-computed for upfront pricing
   - Updated during trip based on actual progress
   - Shown to rider as "arrival at destination"
```

### 路由引擎

```
+-------------------+      +------------------+
| Map Data          | ---> | Road Graph       |
| (OpenStreetMap /  |      | (Weighted Edges) |
| Licensed Maps)    |      +--------+---------+
+-------------------+               |
                                    v
+-------------------+      +--------+---------+
| Real-Time Traffic | ---> | Edge Weight      |
| (speed data from  |      | Adjustment       |
| driver locations) |      +--------+---------+
+-------------------+               |
                                    v
                            +-------+--------+
                            | Shortest Path  |
                            | (Dijkstra /    |
                            |  A* / CH)      |
                            +-------+--------+
                                    |
                                    v
                            +-------+--------+
                            | Route + ETA    |
                            +----------------+

Algorithms:
- Dijkstra: O(V log V), exact, slow for large graphs
- A*: Faster with heuristic, good for point-to-point
- Contraction Hierarchies (CH): Pre-processed, < 1ms query
  (Used by OSRM, Google Maps)
```

### 基于 ML 的 ETA 预测

```
Features:
- Route distance
- Number of turns
- Time of day (rush hour vs off-peak)
- Day of week
- Weather conditions
- Historical speed on route segments
- Current traffic congestion level
- Special events nearby
- Construction zones

Model: Gradient Boosted Trees or Neural Network
Training data: Millions of completed trips with actual duration
Output: Predicted trip duration (with confidence interval)

Example prediction:
  Routing engine ETA: 22 minutes
  ML model adjustment: +3 minutes (rush hour pattern)
  Final ETA: 25 minutes
  Confidence: 80% chance between 22-28 minutes
```

### 持续 ETA 更新

```
During trip:
1. Every 30 seconds, recalculate remaining ETA
2. Compare with original estimate
3. If deviation > 20%, notify rider
4. Factors for update:
   - Actual position on route
   - Current speed vs expected speed
   - Updated traffic ahead
   - Remaining distance

During driver en route to pickup:
1. Every 15 seconds, update pickup ETA
2. Show live countdown to rider
3. Detect if driver is going wrong way
4. Alert if ETA increases significantly
```

---

## 8. 数据模型

### 核心表

```sql
-- Users (riders and drivers share a base)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    profile_photo   VARCHAR(500),
    user_type       VARCHAR(10) NOT NULL,  -- 'rider', 'driver', 'both'
    rating          DECIMAL(3,2) DEFAULT 5.00,
    total_ratings   INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Driver-specific details
CREATE TABLE driver_profiles (
    driver_id           UUID PRIMARY KEY REFERENCES users(id),
    license_number      VARCHAR(50) NOT NULL,
    license_expiry      DATE NOT NULL,
    background_check    VARCHAR(20) DEFAULT 'pending',
    onboarding_status   VARCHAR(20) DEFAULT 'incomplete',
    is_online           BOOLEAN DEFAULT FALSE,
    current_location    GEOGRAPHY(Point, 4326),
    current_city_id     UUID REFERENCES cities(id),
    acceptance_rate     DECIMAL(5,2) DEFAULT 100.00,
    cancellation_rate   DECIMAL(5,2) DEFAULT 0.00,
    total_trips         INTEGER DEFAULT 0,
    verified_at         TIMESTAMPTZ
);

-- Vehicles
CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES users(id),
    make            VARCHAR(50) NOT NULL,
    model           VARCHAR(50) NOT NULL,
    year            SMALLINT NOT NULL,
    color           VARCHAR(30) NOT NULL,
    license_plate   VARCHAR(20) NOT NULL,
    vehicle_type    VARCHAR(20) NOT NULL,  -- 'economy', 'comfort', 'xl', 'luxury'
    capacity        SMALLINT NOT NULL DEFAULT 4,
    is_active       BOOLEAN DEFAULT TRUE,
    insurance_expiry DATE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Trips (core entity with state machine)
CREATE TABLE trips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id            UUID NOT NULL REFERENCES users(id),
    driver_id           UUID REFERENCES users(id),
    vehicle_id          UUID REFERENCES vehicles(id),
    status              VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    vehicle_type        VARCHAR(20) NOT NULL,

    -- Locations
    pickup_location     GEOGRAPHY(Point, 4326) NOT NULL,
    pickup_address      VARCHAR(500),
    dropoff_location    GEOGRAPHY(Point, 4326) NOT NULL,
    dropoff_address     VARCHAR(500),

    -- Route
    estimated_distance  DECIMAL(10,2),     -- km
    actual_distance     DECIMAL(10,2),
    estimated_duration  INTEGER,           -- seconds
    actual_duration     INTEGER,
    route_polyline      TEXT,              -- encoded polyline

    -- Timing
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at          TIMESTAMPTZ,
    driver_accepted_at  TIMESTAMPTZ,
    driver_arrived_at   TIMESTAMPTZ,
    trip_started_at     TIMESTAMPTZ,
    trip_completed_at   TIMESTAMPTZ,

    -- Pricing
    base_fare           DECIMAL(10,2),
    distance_fare       DECIMAL(10,2),
    time_fare           DECIMAL(10,2),
    surge_multiplier    DECIMAL(4,2) DEFAULT 1.00,
    tolls               DECIMAL(10,2) DEFAULT 0.00,
    booking_fee         DECIMAL(10,2),
    estimated_fare      DECIMAL(10,2),
    actual_fare         DECIMAL(10,2),
    tip_amount          DECIMAL(10,2) DEFAULT 0.00,

    -- Cancellation
    cancelled_at        TIMESTAMPTZ,
    cancelled_by        VARCHAR(10),       -- 'rider', 'driver', 'system'
    cancellation_reason VARCHAR(200),
    cancellation_fee    DECIMAL(10,2) DEFAULT 0.00,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trips_rider ON trips(rider_id, created_at DESC);
CREATE INDEX idx_trips_driver ON trips(driver_id, created_at DESC);
CREATE INDEX idx_trips_status ON trips(status) WHERE status NOT IN ('COMPLETED', 'RATED', 'CANCELLED_BY_RIDER');

-- Payments
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id),
    rider_id        UUID NOT NULL REFERENCES users(id),
    amount          DECIMAL(10,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    payment_method  VARCHAR(20) NOT NULL,  -- 'credit_card', 'debit', 'wallet'
    payment_type    VARCHAR(20) NOT NULL,  -- 'pre_auth', 'charge', 'refund', 'tip'
    status          VARCHAR(20) NOT NULL,  -- 'pending', 'authorized', 'captured', 'failed', 'refunded'
    stripe_id       VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings
CREATE TABLE ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id),
    rater_id        UUID NOT NULL REFERENCES users(id),
    rated_id        UUID NOT NULL REFERENCES users(id),
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    tags            VARCHAR(50)[],  -- ['clean_car', 'good_music', 'safe_driving']
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(trip_id, rater_id)
);

-- Driver availability / shift tracking
CREATE TABLE driver_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES users(id),
    city_id         UUID NOT NULL REFERENCES cities(id),
    went_online_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    went_offline_at TIMESTAMPTZ,
    total_online    INTEGER,  -- seconds
    trips_completed INTEGER DEFAULT 0,
    earnings        DECIMAL(10,2) DEFAULT 0.00
);

-- Cities / Regions
CREATE TABLE cities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    country         VARCHAR(2) NOT NULL,
    timezone        VARCHAR(50) NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    center_location GEOGRAPHY(Point, 4326),
    bounding_box    GEOGRAPHY(Polygon, 4326),
    is_active       BOOLEAN DEFAULT TRUE
);

-- Pricing configuration per city
CREATE TABLE pricing_configs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id             UUID NOT NULL REFERENCES cities(id),
    vehicle_type        VARCHAR(20) NOT NULL,
    base_fare           DECIMAL(10,2) NOT NULL,
    per_mile_rate       DECIMAL(10,4) NOT NULL,
    per_minute_rate     DECIMAL(10,4) NOT NULL,
    booking_fee         DECIMAL(10,2) NOT NULL,
    minimum_fare        DECIMAL(10,2) NOT NULL,
    cancellation_fee    DECIMAL(10,2) NOT NULL,
    max_surge           DECIMAL(4,2) DEFAULT 3.50,
    effective_from      TIMESTAMPTZ NOT NULL,
    effective_to        TIMESTAMPTZ,
    UNIQUE(city_id, vehicle_type, effective_from)
);
```

---

## 9. 实时通信

### WebSocket 架构

```
+-------------+         +-------------------+         +-------------+
| Rider App   | <--WS-->| WebSocket Gateway | <--WS-->| Driver App  |
+-------------+         +--------+----------+         +-------------+
                                 |
                    +------------+------------+
                    |                         |
             +------v------+          +------v------+
             | Connection  |          | Message     |
             | Manager     |          | Router      |
             | (user->conn |          | (topic-based|
             |  mapping)   |          |  pub/sub)   |
             +------+------+          +------+------+
                    |                         |
                    v                         v
             +------+------+          +------+------+
             | Redis        |          | Kafka       |
             | (connection  |          | (event      |
             |  registry)   |          |  source)    |
             +--------------+          +-------------+
```

### WebSocket 消息类型

```json
// Driver -> Server: Location update
{
  "type": "LOCATION_UPDATE",
  "data": {
    "lat": 37.7749,
    "lng": -122.4194,
    "heading": 270,
    "speed": 35.5
  }
}

// Server -> Rider: Driver location (during trip)
{
  "type": "DRIVER_LOCATION",
  "data": {
    "trip_id": "t_xyz789",
    "lat": 37.7749,
    "lng": -122.4194,
    "heading": 270,
    "eta_seconds": 180
  }
}

// Server -> Driver: New ride request
{
  "type": "RIDE_REQUEST",
  "data": {
    "trip_id": "t_abc123",
    "pickup": { "lat": 37.77, "lng": -122.42, "address": "123 Market St" },
    "dropoff": { "lat": 37.78, "lng": -122.40, "address": "456 Mission St" },
    "estimated_fare": 24.20,
    "estimated_distance_km": 3.2,
    "surge_multiplier": 1.5,
    "accept_timeout_seconds": 15
  }
}

// Server -> Rider: Trip status change
{
  "type": "TRIP_STATUS",
  "data": {
    "trip_id": "t_abc123",
    "status": "DRIVER_EN_ROUTE",
    "driver": {
      "name": "John",
      "rating": 4.85,
      "vehicle": "Black Toyota Camry",
      "plate": "ABC1234",
      "photo_url": "..."
    },
    "eta_seconds": 300
  }
}

// Driver -> Server: Accept/reject ride
{
  "type": "RIDE_RESPONSE",
  "data": {
    "trip_id": "t_abc123",
    "action": "ACCEPT"
  }
}
```

### 实时事件流

```
Rider requests ride:

Rider App         API Gateway       Ride Service       Matching        Driver App
    |                  |                 |                |                |
    |-- Request Ride ->|                 |                |                |
    |                  |-- Create Trip ->|                |                |
    |                  |                 |-- Find Match ->|                |
    |                  |                 |                |-- Query Geo -->|
    |                  |                 |                |   Index        |
    |                  |                 |                |                |
    |                  |                 |<-- Best Driver-|                |
    |<-- WS: Matching -|<-- Status ------|                |                |
    |                  |                 |                                 |
    |                  |                 |-- WS: Ride Request ----------->|
    |                  |                 |                                 |
    |                  |                 |<-- WS: Accept ------------------|
    |                  |                 |                                 |
    |<-- WS: Driver ---|<-- Status ------|                                |
    |    Assigned      |                 |                                 |
    |                  |                 |                                 |
    |<-- WS: Location--|<-- Location ----|<-- WS: Location Update --------|
    |    (every 3-5s)  |  (forwarded)    |                                |
    |                  |                 |                                 |
```

### 推送通知（降级方案）

```
When WebSocket is disconnected (app in background):

Trip Events -> Notification Service -> APNs (iOS) / FCM (Android)

Notification triggers:
- Driver found (high priority)
- Driver arriving (high priority)
- Trip completed (normal priority)
- Receipt ready (normal priority)
- Surge pricing alert (normal priority)
- Promo code available (low priority)
```

---

## 10. 支付集成

### 支付流程

```
+-------------------------------------------------------------------+
|                        PAYMENT LIFECYCLE                          |
+-------------------------------------------------------------------+

1. RIDE REQUESTED
   +----------+     +-----------+     +----------+
   | Rider    | --> | Payment   | --> | Stripe   |
   | requests |     | Service   |     | Pre-Auth |
   | ride     |     | pre-auth  |     | $50 hold |
   +----------+     +-----------+     +----------+

2. TRIP IN PROGRESS
   (No payment action, meter running)

3. TRIP COMPLETED
   +-----------+     +-----------+     +----------+
   | Ride Svc  | --> | Payment   | --> | Stripe   |
   | sends     |     | Service   |     | Capture  |
   | final fare|     | capture   |     | $24.20   |
   +-----------+     +-----------+     +----------+

   Release remaining hold: $50 - $24.20 = $25.80

4. TIP (within 24 hours)
   +----------+     +-----------+     +----------+
   | Rider    | --> | Payment   | --> | Stripe   |
   | adds tip |     | Service   |     | Charge   |
   | $5.00    |     | new charge|     | $5.00    |
   +----------+     +-----------+     +----------+

5. DRIVER PAYOUT (weekly batch)
   +----------+     +-----------+     +-----------+
   | Payout   | --> | Calculate | --> | Stripe    |
   | Scheduler|     | earnings  |     | Connect   |
   | (weekly) |     | - fees    |     | Transfer  |
   +----------+     +-----------+     +-----------+
```

### 支付失败处理

```
Scenario: Payment fails mid-trip

1. Pre-auth fails at ride request:
   -> Block ride request
   -> Prompt rider to update payment method
   -> Retry with new method

2. Capture fails at trip completion:
   -> Trip still marked COMPLETED
   -> Retry capture 3 times with exponential backoff
   -> If all fail: mark payment as PENDING
   -> Add to "failed payment" queue
   -> Send rider notification to update payment
   -> Block future rides until resolved
   -> After 7 days: send to collections

3. Mid-trip card declined:
   -> Not possible (pre-authorized)
   -> Pre-auth covers estimated fare + buffer

Buffer strategy:
  pre_auth_amount = estimated_fare * 1.5 + $20
  (covers surge increase, route deviation, tips)
```

### 费用分摊

```
Rider requests split with 2 friends:

1. Rider shares trip invite link
2. Friends accept and add payment method
3. At completion:
   Total fare: $30.00
   Split: $10.00 each to 3 riders
4. Three separate charges processed
5. If one payment fails:
   -> Charge remaining to primary rider
   -> Create debt record for failed payer
```

### 司机提现计算

```
Weekly earnings example:

  Gross fares:           $1,500.00
  Platform commission:   -$375.00   (25%)
  Tips:                  +$120.00
  Surge bonus:           +$45.00
  Quest bonus:           +$50.00    (complete 80 trips)
  Tolls reimbursed:      +$32.00
  --------------------------------
  Net payout:            $1,372.00

  Payout via: Stripe Connect (instant or weekly)
```

---

## 11. 安全功能

### SOS 按钮

```
+----------+     +-----------+     +------------------+
| SOS      | --> | Safety    | --> | Emergency        |
| Button   |     | Service   |     | Services (911)   |
| pressed  |     |           |     +------------------+
+----------+     |           |
                 |           | --> +------------------+
                 |           |     | Emergency        |
                 |           |     | Contacts         |
                 |           |     | (SMS + Location) |
                 |           |     +------------------+
                 |           |
                 |           | --> +------------------+
                 |           |     | Ops Dashboard    |
                 |           |     | (real-time alert)|
                 +-----------+     +------------------+

SOS triggers:
1. Call local emergency number (911)
2. Send current GPS location to designated contacts
3. Start audio recording
4. Alert Uber safety team
5. Share live trip details with responders
```

### 行程分享

```
Rider shares trip with 3 contacts:

Shared information:
- Driver name, photo, vehicle details, license plate
- Real-time GPS location on map
- ETA to destination
- Route being taken
- Link expires after trip ends + 30 minutes

Implementation:
- Generate unique sharing URL
- WebSocket feed for real-time tracking
- No authentication needed for viewers
- Rate limit: 10 viewers per trip
```

### 身份验证

```
Driver verification:
  - Government ID check
  - Background check (criminal, driving record)
  - Vehicle inspection
  - Insurance verification
  - Selfie match with profile photo (periodic)
  - Real-time face check before going online

Rider verification:
  - Phone number verification (OTP)
  - Payment method verification
  - Email verification
  - Photo ID for certain ride types
```

---

## 12. 供给定位（需求预测）

### 需求预测系统

```
+-------------------+     +---------------------+     +------------------+
| Historical Data   | --> | Feature Engineering | --> | ML Model         |
| - Past rides      |     | - Time features     |     | (Gradient Boost  |
| - Events calendar |     | - Location features |     |  / LSTM)         |
| - Weather data    |     | - Weather features  |     +--------+---------+
| - Holiday data    |     | - Event features    |              |
+-------------------+     +---------------------+     +--------v---------+
                                                      | Demand Heatmap   |
                                                      | per Geohash Cell |
                                                      | per 15-min Slot  |
                                                      +--------+---------+
                                                               |
                          +---------------------+     +--------v---------+
                          | Driver Incentive    | <-- | Supply Gap       |
                          | Engine              |     | Analysis         |
                          | (Surge zones,       |     | (Demand - Supply |
                          |  Quest bonuses)     |     |  per cell)       |
                          +---------------------+     +------------------+
```

### 需求热力图

```
San Francisco at 5:00 PM Friday:

            Financial    SoMa    Mission    Castro    Sunset
            District
  Demand:   [  HIGH  ] [ HIGH ] [ MEDIUM ] [  LOW  ] [  LOW  ]
  Supply:   [ MEDIUM ] [  LOW ] [ MEDIUM ] [ MEDIUM] [ HIGH ]
  Gap:      [  +40%  ] [ +80% ] [   0%   ] [ -30%  ] [ -60% ]
  Action:   [  Surge ] [SURGE!] [  None  ] [Repos. ] [Repos. ]

  +--------+--------+--------+--------+--------+
  |  1.5x  |  2.2x  |  1.0x  |  1.0x  |  1.0x  |
  | $$ 23  | $$$ 18 |    15  |    12  |     8  | (available drivers)
  |    38  |    45  |    15  |     5  |     2  | (pending requests)
  +--------+--------+--------+--------+--------+
  |  1.2x  |  1.8x  |  1.0x  |  1.0x  |  1.0x  |
  |    18  |    12  |    20  |     8  |     5  |
  |    22  |    30  |    18  |     6  |     3  |
  +--------+--------+--------+--------+--------+

  Legend: Top = surge multiplier
          Middle = available drivers
          Bottom = pending requests in last 5 min
```

### 司机重新定位激励

```
Shown on driver app:

  "Drive to SoMa district for higher earnings!"
  - Current surge: 2.2x
  - Predicted demand: High for next 2 hours
  - Estimated additional earnings: +$15/hour

Incentive types:
1. Surge pricing (natural market signal)
2. Boost zones ($3-$10 extra per trip in target area)
3. Quest bonuses (complete X trips in Y hours)
4. Consecutive trip bonuses
5. Guaranteed hourly minimum in target area
```

### 需求预测的 ML 特征

```
Temporal features:
  - Hour of day (0-23)
  - Day of week (0-6)
  - Month (1-12)
  - Is holiday (bool)
  - Minutes since last major event ended

Spatial features:
  - Geohash cell ID
  - Proximity to POIs (airports, stadiums, bars)
  - Neighborhood type (residential, commercial, entertainment)
  - Historical avg demand for this cell + time

External features:
  - Weather (rain, snow, temperature)
  - Scheduled events (concerts, sports)
  - Public transit disruptions
  - School/university schedule

Lag features:
  - Demand in this cell 15min ago
  - Demand in this cell same time yesterday
  - Demand in this cell same time last week
```

---

## 13. 可扩展性

### Location Service 扩展

```
Challenge: 500,000 location updates/sec

Strategy: Shard by geographic region

+-------------------+     +--------------------+
| Driver Location   | --> | Geohash Router     |
| Update (lat, lng) |     | (extract prefix)   |
+-------------------+     +---------+----------+
                                    |
              +---------------------+---------------------+
              |                     |                     |
     +--------v--------+  +--------v--------+  +---------v-------+
     | Shard: West US   |  | Shard: East US   |  | Shard: Europe   |
     | (geohash 9q*)    |  | (geohash dr*)    |  | (geohash gc*)   |
     |                  |  |                  |  |                 |
     | Redis Cluster    |  | Redis Cluster    |  | Redis Cluster   |
     | 100K updates/s   |  | 200K updates/s   |  | 150K updates/s  |
     +-----------------+  +-----------------+  +-----------------+

Each shard:
  - 3 Redis nodes (1 primary, 2 replicas)
  - Handles GEOADD + GEOSEARCH for its region
  - Independent scaling based on driver density

Cross-region queries (rare):
  - Scatter-gather across relevant shards
  - Merge results by distance
  - Only needed for border areas
```

### Matching Service 分区

```
Partition by city (natural isolation):

+-------------+     +---+     +-----------------+
| SF Requests | --> |   | --> | SF Matcher      |
+-------------+    |   |    | (batched matching|
                    | K |    | per 2s window)  |
+-------------+    | a |    +-----------------+
| NYC Requests| --> | f |
+-------------+    | k | --> +-----------------+
                    | a |    | NYC Matcher     |
+-------------+    |   |    +-----------------+
| LA Requests | --> |   |
+-------------+    +---+ --> +-----------------+
                              | LA Matcher      |
                              +-----------------+

Benefits:
- City-level isolation (one city's spike doesn't affect others)
- Independent scaling per city
- Local optimization (different surge, pricing per city)
- Data locality (drivers rarely cross city boundaries)
```

### Kafka 事件流

```
Topics:
  driver-location-updates    (500K msgs/sec, partitioned by geohash)
  ride-requests              (500 msgs/sec, partitioned by city)
  ride-status-changes        (2K msgs/sec, partitioned by trip_id)
  payment-events             (500 msgs/sec, partitioned by trip_id)
  driver-availability        (10K msgs/sec, partitioned by driver_id)
  surge-updates              (100 msgs/sec, partitioned by geohash)
  analytics-events           (50K msgs/sec, partitioned by event_type)

Partition strategy:
  driver-location-updates: 256 partitions (by geohash prefix)
    - Consumer groups: location-indexer, analytics, ETA-service
  ride-requests: 64 partitions (by city_id)
    - Consumer groups: matcher, pricing, notification
```

### 数据库分片策略

```
Trips table: Shard by rider_id (hash-based)
  - Most queries are "my trip history" (by rider)
  - Driver queries use secondary index or separate read replica

  Shard 0: rider_id hash % 16 == 0
  Shard 1: rider_id hash % 16 == 1
  ...
  Shard 15: rider_id hash % 16 == 15

Driver profiles: Shard by city_id (range-based)
  - Most queries are within a city
  - Driver search is always city-scoped

Location history: Partitioned by time (TimescaleDB)
  - Automatic hourly chunks
  - Old chunks compressed then dropped
  - No explicit sharding needed (time is natural partition)

Payments: Shard by trip_id
  - Payment always queried in context of a trip
  - Consistent with trip sharding
```

### 城市级隔离

```
Each city operates as a semi-independent unit:

+------------------------------------------------------------------+
|                        GLOBAL LAYER                               |
| User accounts, payment methods, global config                     |
+------------------------------------------------------------------+
         |              |              |              |
+--------v---+  +-------v----+  +-----v------+  +---v--------+
| San        |  | New York   |  | London     |  | Tokyo      |
| Francisco  |  | City       |  |            |  |            |
+------------+  +------------+  +------------+  +------------+
| Location   |  | Location   |  | Location   |  | Location   |
| Matching   |  | Matching   |  | Matching   |  | Matching   |
| Pricing    |  | Pricing    |  | Pricing    |  | Pricing    |
| Surge      |  | Surge      |  | Surge      |  | Surge      |
| ETA        |  | ETA        |  | ETA        |  | ETA        |
+------------+  +------------+  +------------+  +------------+

Benefits:
- Fault isolation (SF outage doesn't affect NYC)
- Independent deployment and configuration
- Regulatory compliance (EU data stays in EU)
- Local optimization (currency, language, pricing)
```

---

## 14. 部署架构

### 多区域部署

```
                          +------------------+
                          |   Global DNS     |
                          |   (Route 53)     |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |                              |
           +--------v--------+           +--------v--------+
           |  US-West Region |           |  US-East Region |
           |  (Primary)      |           |  (Secondary)    |
           +-----------------+           +-----------------+
           |                 |           |                 |
           | +-------------+ |           | +-------------+ |
           | | K8s Cluster | |           | | K8s Cluster | |
           | |             | |           | |             | |
           | | API Gateway | |           | | API Gateway | |
           | | Ride Svc    | |           | | Ride Svc    | |
           | | Location Svc| |           | | Location Svc| |
           | | Match Svc   | |           | | Match Svc   | |
           | | Pricing Svc | |           | | Pricing Svc | |
           | | Payment Svc | |           | | Payment Svc | |
           | +-------------+ |           | +-------------+ |
           |                 |           |                 |
           | +-------------+ |           | +-------------+ |
           | | Data Layer  | |           | | Data Layer  | |
           | | PostgreSQL  | |  <-sync-> | | PostgreSQL  | |
           | | Redis       | |           | | Redis       | |
           | | Kafka       | |           | | Kafka       | |
           | | TimescaleDB | |           | | TimescaleDB | |
           | +-------------+ |           | +-------------+ |
           +-----------------+           +-----------------+
                    |                              |
                    +--------------+---------------+
                                   |
                          +--------v--------+
                          |  EU Region      |
                          |  (GDPR Zone)    |
                          +-----------------+
                          | Separate data   |
                          | sovereignty     |
                          +-----------------+

Routing logic:
  - US riders: US-West or US-East (latency-based)
  - EU riders: EU region (data sovereignty)
  - Failover: US-West -> US-East (automatic)
```

### 城市级服务部署

```
Within each region, services are deployed per city group:

US-West Region K8s Cluster:
+--------------------------------------------------+
| Namespace: sf-metro                              |
| +------------------------------------------+    |
| | Location Service  (8 pods, autoscale)    |    |
| | Matching Service  (4 pods, autoscale)    |    |
| | Redis Geo Index   (6-node cluster)       |    |
| +------------------------------------------+    |
|                                                  |
| Namespace: la-metro                              |
| +------------------------------------------+    |
| | Location Service  (12 pods, autoscale)   |    |
| | Matching Service  (6 pods, autoscale)    |    |
| | Redis Geo Index   (6-node cluster)       |    |
| +------------------------------------------+    |
|                                                  |
| Namespace: shared-services                       |
| +------------------------------------------+    |
| | API Gateway       (20 pods, autoscale)   |    |
| | Payment Service   (8 pods)               |    |
| | Notification Svc  (6 pods)               |    |
| | ETA Service       (10 pods)              |    |
| +------------------------------------------+    |
+--------------------------------------------------+

Autoscaling rules:
  Location Service:  scale on CPU > 60% OR connections > 50K/pod
  Matching Service:  scale on queue depth > 100 pending matches
  API Gateway:       scale on requests > 10K RPS/pod
```

### 灾难恢复

```
RPO (Recovery Point Objective): < 1 minute
RTO (Recovery Time Objective): < 5 minutes

Strategy:
1. Active-Active across 2 US regions
2. Synchronous replication for trip state (PostgreSQL)
3. Asynchronous replication for analytics data
4. Redis geo-index rebuilt from Kafka replay on failover
5. WebSocket reconnection with automatic region failover

Failover sequence:
  1. Health check fails for US-West (3 consecutive, 10s each)
  2. DNS updated: US traffic -> US-East (30s TTL)
  3. US-East Location Service replays last 30s of Kafka events
  4. US-East Redis geo-index catches up (< 10s)
  5. Active trips continue (state in PostgreSQL, already replicated)
  6. Drivers reconnect WebSocket to US-East (automatic)
  7. Total disruption: ~30-60 seconds
```

---

## 15. 常见面试追问

### 如何处理拼车（共享乘车）？

```
Ride pooling matches multiple riders going in similar directions:

Matching algorithm changes:
1. When rider requests pool ride:
   a. Check existing in-progress pool trips nearby
   b. Calculate detour for each candidate pool:
      - Additional pickup time
      - Additional dropoff time
      - Route deviation percentage
   c. If detour < threshold (e.g., < 25% extra time):
      -> Add rider to existing pool
   d. Otherwise:
      -> Create new pool trip, match with driver
      -> Keep pool "open" for 2-3 min for additional riders

Pool capacity:
  - UberPool/Lyft Shared: max 2-3 riders (separate groups)
  - Each rider has own pickup and dropoff
  - Fare split based on individual distance + shared savings

Routing for pool trips:
  - TSP (Traveling Salesman) for optimal pickup/dropoff order
  - Constraint: no rider's trip more than 50% longer than direct route
  - Re-optimize route when new rider added

Pricing for pool:
  base_fare = regular_fare * pool_discount (0.4-0.6)
  Each rider pays their discounted share
  Driver receives full fare equivalent
  Platform subsidizes if needed to incentivize pooling
```

### 如何实现预约用车？

```
Scheduled ride (e.g., "Airport pickup at 6 AM tomorrow"):

1. BOOKING:
   - Rider sets pickup time, location, destination
   - System calculates fare at current rates (no surge guarantee)
   - Payment pre-authorized

2. PRE-MATCHING (T - 30 minutes):
   - Enter matching queue with higher priority
   - Search radius wider than on-demand
   - Offer higher incentive to drivers

3. DRIVER ASSIGNMENT (T - 15 minutes):
   - Confirm driver assignment
   - Notify rider of driver details
   - Driver starts navigation to pickup

4. EXECUTION (T - 0):
   - Standard trip flow from DRIVER_EN_ROUTE
   - Grace period: +/- 5 minutes

Challenges:
- Driver cancellation: immediate re-match with priority queue
- No-show driver: alert ops team, assign backup
- Overbooking: maintain 1.2x driver pool for scheduled rides
- Price guarantee: honor booked price even if current surge is higher
```

### 如何处理跨城市行程？

```
Example: San Francisco to San Jose (50 miles)

Challenges:
1. Driver may not want to be 50 miles from home base
2. Pricing spans two city pricing zones
3. Driver needs to get back (empty return trip)

Solutions:
1. Long-trip notification to driver before accepting:
   "This trip goes to San Jose (50 miles, ~1 hour)"
   Driver can decline without penalty

2. Pricing:
   - Use origin city pricing for first 10 miles
   - Use blended rate for remainder
   - Include long-distance surcharge if applicable

3. Return incentive:
   - Automatically offer driver boost in destination city
   - "Complete 1 trip in San Jose for $10 bonus"
   - Or: allow driver to set "return to home city" mode
     (only matched for trips heading back)

4. System design:
   - Trip created in origin city's partition
   - Driver transferred to destination city's geo-index on arrival
   - Trip state managed by origin city (no handoff mid-trip)
```

### 如何防止欺诈（虚假行程 / GPS Spoofing）？

```
Fraud types and detection:

1. GPS Spoofing (fake location):
   Detection:
   - Cross-reference with cell tower triangulation
   - Check location jumps (impossible speed between updates)
   - Compare with accelerometer/gyroscope data
   - ML model: location vs speed vs sensor data consistency
   Action: Flag account, require in-person verification

2. Fake rides (driver and rider collude):
   Detection:
   - Same rider-driver pair > 5 times in 30 days
   - Very short trips in surge zones
   - Trip starts and ends at same location
   - Unusual rating patterns (always 5 stars)
   Action: Withhold payment, investigate accounts

3. Promo code abuse:
   Detection:
   - Multiple accounts from same device ID
   - Same payment method across accounts
   - Same pickup/dropoff patterns
   - New account creation rate from same IP
   Action: Block promo, flag device fingerprint

4. Fare manipulation (driver takes long route):
   Detection:
   - Actual route vs optimal route comparison
   - Trip duration vs estimated duration (> 1.5x)
   - Frequent deviations from suggested route
   Action: Auto-adjust fare to optimal route price, warn driver

Fraud scoring system:
  Each account has fraud_score (0-100)
  Score updated by ML model based on:
  - Trip patterns, device signals, payment patterns
  - Score > 70: flag for review
  - Score > 90: temporary suspension
```

### 如何应对司机供给短缺？

```
Strategies ordered by priority:

1. Surge pricing (automatic):
   - Higher prices reduce demand
   - Higher earnings attract more drivers online
   - Natural market equilibrium

2. Driver incentives (proactive):
   - Push notifications to offline drivers: "High demand in your area!"
   - Guaranteed hourly minimum: "$35/hr guaranteed for next 2 hours"
   - Quest bonuses: "Complete 10 trips tonight, earn $50 extra"

3. Demand management:
   - Suggest alternative pickup points with shorter wait
   - Offer scheduled ride for later time slot
   - Recommend alternative vehicle types with more supply
   - Partner with public transit (suggest bus/train + ride combo)

4. Supply expansion (strategic):
   - Rental car program for new drivers
   - Flexible work: allow part-time, peak-only drivers
   - Cross-train: allow delivery drivers to do ride-sharing
   - Partnerships with fleet operators

5. Predictive positioning:
   - Forecast demand 30 min ahead
   - Reposition drivers to predicted hotspots
   - Pre-stage drivers near event venues before events end
```

### 如何实现取消政策？

```
Cancellation policy engine:

Input: trip state, elapsed time, city config
Output: cancellation_allowed, fee_amount, driver_compensation

Rules:

Before matching:
  - Always free cancellation
  - No penalty to anyone

During matching:
  - Free cancellation
  - Request removed from matching queue

After driver assigned (within 2 min):
  - Free cancellation for rider
  - Free cancellation for driver
  - No penalty

After driver assigned (2+ min):
  - Rider cancels: $5 fee (compensate driver for time/gas)
  - Driver cancels: warning (3 cancels = timeout)
  - Exception: driver taking unusually long (> 2x ETA)

After driver arrived:
  - Rider cancels: $5-10 fee
  - Rider no-show (5 min timer): $10 fee
  - Driver cancels: $0 to rider, driver penalized

During trip:
  - Rider cancels: charged for distance traveled + cancellation fee
  - Driver cancels: no charge to rider, driver severely penalized
  - Emergency: no penalty to either party

Driver penalty system:
  Cancel 1-2 in a week:  Warning
  Cancel 3-4 in a week:  15-minute timeout
  Cancel 5+ in a week:   24-hour deactivation
  Consistent pattern:    Account review
```

---

## 总结：关键设计决策

| 决策            | 选择                       | 理由                               |
| --------------- | -------------------------- | ---------------------------------- |
| 位置协议        | WebSocket                  | 双向通信、移动端友好、连接状态感知 |
| Geospatial 索引 | Redis GEOSEARCH + S2 Cells | 内置支持、速度快、水平可扩展       |
| 匹配方案        | 批量二部图匹配             | 全局最优、亚秒级延迟               |
| 事件流          | Apache Kafka               | 持久化、高吞吐、可回放             |
| 行程状态数据库  | PostgreSQL                 | 金融数据需要 ACID、强一致性        |
| 位置历史        | TimescaleDB                | 时序优化、自动分区                 |
| 定价缓存        | Redis                      | 亚毫秒读取 surge 倍率              |
| 服务间通信      | gRPC + Kafka               | 低延迟同步 + 异步事件驱动          |
| 部署            | K8s 按城市 namespace       | 故障隔离、独立扩展                 |
| 分片键          | 基于城市（大部分服务）     | 天然分区、数据本地性               |
