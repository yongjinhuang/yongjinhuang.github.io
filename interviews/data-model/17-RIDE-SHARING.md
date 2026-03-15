# Data Model: Ride-Sharing (Uber/Lyft)

A ride-sharing platform matches riders with nearby drivers in real-time and manages the full trip lifecycle from request to payment. The data model must support sub-second geospatial queries to find available drivers, track driver locations continuously, handle concurrent trip state transitions, and process payments reliably. The key challenge is the real-time matching: every second of delay in finding a driver reduces rider conversion.

## Table Responsibilities

| Table | Purpose | Storage | Key Characteristic |
|-------|---------|---------|-------------------|
| **riders** | Rider accounts and preferences | PostgreSQL | Read-heavy, cached |
| **drivers** | Driver profiles, vehicles, and status | PostgreSQL | Status transitions drive matching eligibility |
| **trips** | Core trip lifecycle and fare information | PostgreSQL | State-machine driven, immutable history |
| **driver_locations** | Real-time driver positions | Redis (GEOADD) | Updated every 3-5 seconds per active driver |
| **driver_location_history** | Historical GPS traces for trips | Cassandra | Append-only, partitioned by driver, high write volume |
| **payments** | Trip payment processing | PostgreSQL | Created at trip completion, idempotent |

## Detailed Field Descriptions

### riders

| Field | Type | Description |
|-------|------|-------------|
| rider_id | BIGINT, PK | Unique rider identifier. |
| name | VARCHAR(255), NOT NULL | Display name shown to matched drivers. |
| phone | VARCHAR(20), UNIQUE | Phone number used for SMS verification and in-trip communication. Unique constraint prevents duplicate accounts. |
| email | VARCHAR(255) | Contact email for receipts and notifications. |
| rating | DECIMAL(2,1) | Average rating from drivers (1.0-5.0). Riders below 4.0 may be deprioritized in matching. Updated asynchronously after each rated trip. |
| default_payment_method_id | BIGINT, FK -> payment_methods | Pre-selected payment method for frictionless checkout. Eliminates payment selection from the ride request flow, reducing request latency. |

**Why store `rating` on the rider?** Drivers see the rider's rating before accepting a trip. Computing it from historical trip ratings at request time would add latency to the time-critical matching flow. A denormalized, asynchronously updated rating enables instant display.

### drivers

| Field | Type | Description |
|-------|------|-------------|
| driver_id | BIGINT, PK | Unique driver identifier. |
| name | VARCHAR(255), NOT NULL | Display name shown to matched riders. |
| phone | VARCHAR(20), UNIQUE | Phone number for verification and rider communication. |
| vehicle_type | ENUM('economy', 'comfort', 'xl', 'premium', 'pool') | Vehicle tier. Determines which ride categories this driver is eligible for. A rider requesting "XL" only matches with XL drivers. |
| vehicle_model | VARCHAR(100) | Car make and model (e.g., "Toyota Camry 2022"). Shown to riders after matching for vehicle identification. |
| license_plate | VARCHAR(20), UNIQUE | License plate number. Shown to riders for vehicle identification at pickup. Unique constraint enforces one-driver-per-vehicle. |
| rating | DECIMAL(2,1) | Average rider-given rating (1.0-5.0). Drivers below 4.6 receive warnings; below 4.2 may be deactivated. |
| status | ENUM('offline', 'available', 'en_route_to_pickup', 'on_trip') | Current driver state. Only `available` drivers appear in matching queries. This is the most frequently updated field in the system. |
| bank_account_id | BIGINT, FK -> bank_accounts | Payout destination. Drivers are paid weekly to this account. |
| documents_verified | BOOLEAN, DEFAULT false | Whether license, insurance, and background check have cleared. Drivers cannot go `available` until this is true. |

**Why `status` on the driver rather than derived from trips?** The matching algorithm must find available drivers in <100ms. Querying all trips to determine which drivers are free would require joins and exclusion logic. A denormalized `status` field enables a simple indexed query: "all drivers where status = 'available'."

### trips

| Field | Type | Description |
|-------|------|-------------|
| trip_id | BIGINT, PK | Unique trip identifier. |
| rider_id | BIGINT, FK -> riders, INDEX | Who requested the ride. Indexed for rider trip history. |
| driver_id | BIGINT, FK -> drivers, INDEX, NULLABLE | Assigned driver. Null until a driver accepts. Indexed for driver trip history and earnings calculation. |
| pickup_lat | DECIMAL(9,6) | Rider's pickup latitude. Stored for matching (find nearest drivers) and post-trip route reconstruction. |
| pickup_lng | DECIMAL(9,6) | Rider's pickup longitude. |
| dropoff_lat | DECIMAL(9,6) | Requested destination latitude. Used for fare estimation before the trip starts. |
| dropoff_lng | DECIMAL(9,6) | Requested destination longitude. |
| status | ENUM('requested', 'matched', 'driver_en_route', 'arrived_at_pickup', 'in_progress', 'completed', 'cancelled') | Trip lifecycle state. Each transition triggers downstream actions (e.g., `completed` triggers fare calculation and payment). State machine ensures valid transitions only. |
| distance_km | DECIMAL(8,2), NULLABLE | Actual trip distance, computed from driver_location_history GPS trace. Null until trip completes. More accurate than straight-line distance because it follows the actual route. |
| duration_min | DECIMAL(6,1), NULLABLE | Actual trip duration. Null until trip completes. Used in fare calculation (time component). |
| fare_amount | BIGINT, NULLABLE | Final fare in cents. Computed at trip completion: `base_fare + (distance_km * per_km_rate) + (duration_min * per_min_rate) * surge_multiplier`. Null until computed. |
| surge_multiplier | DECIMAL(3,1), DEFAULT 1.0 | Demand-based price multiplier. Locked at request time so the rider's quoted price is honored even if surge changes during the trip. |
| payment_id | BIGINT, FK -> payments, NULLABLE | Link to the payment record. Null until payment is processed after trip completion. |

**Why lock `surge_multiplier` at request time?** If surge pricing changed mid-trip (e.g., from 2.0x to 1.0x), the rider would pay a different amount than quoted. Locking at request time provides price transparency and prevents disputes. The platform absorbs the risk of surge changes.

**Why store both requested coordinates and actual distance?** The fare estimate uses straight-line distance between pickup/dropoff coordinates. The actual fare uses GPS-traced distance, which accounts for detours, traffic routing, and driver navigation choices. Storing both enables dispute resolution ("the route was 40% longer than expected").

### driver_locations (Redis GEOADD)

| Field | Type | Description |
|-------|------|-------------|
| driver_id | STRING, member | Redis GEOADD member. The driver's unique identifier in the geo set. |
| lat | FLOAT | Current latitude. Updated every 3-5 seconds while the driver's app is open. |
| lng | FLOAT | Current longitude. |
| heading | FLOAT | Compass heading (0-360 degrees). Used to display the driver's car icon direction on the rider's map. |
| speed | FLOAT | Current speed in km/h. Used for ETA calculation and anomaly detection (stationary driver with "available" status). |
| timestamp | TIMESTAMP | When this location was recorded. Stale locations (>30 seconds old) are filtered from matching. |
| status | STRING | Mirrors driver.status. Stored in Redis to avoid a PostgreSQL lookup during matching. The geo-radius query returns both location and status in one call. |

**Why Redis GEOADD instead of PostgreSQL PostGIS?** The matching query ("find all available drivers within 3km of this pickup point") must complete in <10ms. Redis GEOADD with GEORADIUS provides O(N+log(M)) spatial queries in-memory, where N is the result count and M is the total set size. PostGIS would require disk I/O and is 10-100x slower for this access pattern.

**Why store `status` redundantly in Redis?** Without it, matching would require: (1) GEORADIUS to find nearby drivers, (2) multi-GET from PostgreSQL to filter by status. The round-trip to PostgreSQL adds 5-10ms. Storing status in Redis enables filtering within the GEORADIUS call itself.

### driver_location_history (Cassandra)

| Field | Type | Description |
|-------|------|-------------|
| driver_id | BIGINT, PARTITION KEY | Cassandra partition key. All location history for a driver is co-located for efficient sequential reads. |
| timestamp | TIMESTAMP, CLUSTERING KEY DESC | Descending order so the most recent locations are read first. Enables "last N minutes" queries without scanning old data. |
| lat | FLOAT | Latitude at this point in time. |
| lng | FLOAT | Longitude at this point in time. |
| heading | FLOAT | Direction of travel. |
| speed | FLOAT | Instantaneous speed. Used for trip distance calculation (integrating speed over time) and fraud detection (impossible speeds). |

**Why Cassandra?** Each active driver sends a location update every 3-5 seconds. With 500K concurrent drivers, that is 100K-170K writes/second. Cassandra is optimized for high write throughput with its LSM-tree storage engine and handles this load on modest hardware. The access pattern (all locations for one driver, ordered by time) maps perfectly to Cassandra's partition + clustering key model.

### payments

| Field | Type | Description |
|-------|------|-------------|
| payment_id | BIGINT, PK | Unique payment identifier. |
| trip_id | BIGINT, FK -> trips, UNIQUE | One-to-one with the trip. UNIQUE constraint prevents double-charging for the same trip. |
| amount | BIGINT, NOT NULL | Fare amount in cents. Matches trips.fare_amount. |
| method | VARCHAR(20) | Payment method used (card, wallet, cash). |
| status | ENUM('pending', 'processing', 'succeeded', 'failed') | Payment lifecycle. Failed payments trigger a retry with an alternative payment method or flag the trip for manual resolution. |
| processor_id | VARCHAR(255) | External payment processor transaction ID for reconciliation. |

## ER Diagram

```
┌──────────────────────┐       ┌──────────────────────┐
│      riders           │       │   driver_locations    │
│──────────────────────│       │   (Redis GEOADD)     │
│ rider_id (PK)         │       │──────────────────────│
│ name                  │       │ driver_id             │
│ phone                 │       │ lat, lng              │
│ email                 │       │ heading, speed        │
│ rating                │       │ timestamp             │
│ default_payment_      │       │ status                │
│   method_id           │       └──────────────────────┘
└──────────────────────┘                │
          │                             │ 1
          │ 1                           │
          │                             │ 1
          │ *              ┌──────────────────────┐
          │                │      drivers          │
          │                │──────────────────────│
          │                │ driver_id (PK)        │
          │                │ name                  │
          │                │ phone                 │
          │                │ vehicle_type          │
          │                │ vehicle_model         │
          │                │ license_plate         │
          │                │ rating                │
          │                │ status                │
          │                │ bank_account_id       │
          │                │ documents_verified    │
          │                └──────────────────────┘
          │                         │          │
          │                         │ 1        │ 1
          │                         │          │
          │           ┌─────────────┘          │ *
          │           │ *         ┌──────────────────────┐
          │    ┌──────────────┐   │ driver_location_     │
          │    │    trips      │   │   history (Cassandra)│
          └───►│──────────────│   │──────────────────────│
               │ trip_id (PK)  │   │ driver_id (partition)│
               │ rider_id (FK) │   │ timestamp (cluster)  │
               │ driver_id (FK)│   │ lat, lng             │
               │ pickup/dropoff│   │ heading, speed       │
               │ status        │   └──────────────────────┘
               │ distance_km   │
               │ duration_min  │
               │ fare_amount   │
               │ surge_mult.   │
               │ payment_id────│──► ┌──────────────┐
               └──────────────┘    │   payments    │
                                    │──────────────│
                                    │ payment_id   │
                                    │ trip_id (FK)  │
                                    │ amount        │
                                    │ method        │
                                    │ status        │
                                    │ processor_id  │
                                    └──────────────┘

Relationships:
  riders  1───* trips                  (one rider takes many trips)
  drivers 1───* trips                  (one driver completes many trips)
  drivers 1───1 driver_locations       (one current location per driver)
  drivers 1───* driver_location_history (many historical GPS points)
  trips   1───1 payments               (one payment per trip)
```

## Data Flow

### Ride Matching (Critical Path)

```
1. Rider requests ride: (pickup_lat/lng, dropoff_lat/lng, vehicle_type)
         │
         ▼
2. INSERT trip record (status = 'requested')
         │
         ▼
3. Query driver_locations (Redis GEORADIUS):
   "Find all drivers within 3km of (pickup_lat, pickup_lng)
    where status = 'available' and vehicle_type matches"
         │
         ▼
4. Score candidate drivers:
   - Distance to pickup (closer is better)
   - Driver rating (higher is better)
   - Heading toward pickup (already driving toward rider)
   - Accept rate history (reliable drivers preferred)
         │
         ▼
5. Send trip offer to highest-scored driver
         │
    ┌────┴──────────┐
    │Driver accepts? │
    ├─Yes────────────┤
    │ No / timeout   │──► Try next driver (step 4 loop)
    └────┬───────────┘
         ▼
6. Update trip: status = 'matched', driver_id = assigned
   Update driver: status = 'en_route_to_pickup'
   Update Redis: driver status = 'en_route_to_pickup'
         │
         ▼
7. Notify rider with driver details (name, car, ETA)
```

### Trip Lifecycle

```
8. Driver navigates to pickup
   driver_location_history records GPS trail
         │
         ▼
9. Driver arrives → trip status = 'arrived_at_pickup'
         │
         ▼
10. Rider enters vehicle → trip status = 'in_progress'
    Start recording trip GPS trace
         │
         ▼
11. Trip in progress:
    - driver_locations updated every 3-5 seconds (Redis)
    - driver_location_history appended (Cassandra)
    - ETA continuously recalculated
         │
         ▼
12. Driver ends trip → trip status = 'completed'
         │
         ▼
13. Calculate fare:
    - Compute distance_km from GPS trace (driver_location_history)
    - Compute duration_min from trip start/end timestamps
    - fare = (base + distance * per_km + duration * per_min) * surge
         │
         ▼
14. Process payment:
    - Charge rider's default payment method
    - INSERT payment record
    - Update trip: fare_amount, payment_id
         │
         ▼
15. Both parties rate each other
    Update rider.rating and driver.rating (async)
         │
         ▼
16. Update driver: status = 'available'
    Update Redis: driver status = 'available'
```

**Why offer to one driver at a time instead of broadcasting?** Broadcasting to multiple drivers creates a thundering herd: multiple drivers might accept simultaneously, requiring complex conflict resolution and disappointing rejected drivers. Sequential offers with short timeouts (10-15 seconds) provide a cleaner UX and simpler concurrency model.

**Why compute distance from GPS trace instead of the requested route?** The actual path may differ from the original route due to road closures, driver shortcuts, or rider-requested detours. GPS trace is ground truth. This also protects against fare manipulation (a driver taking a longer route still gets paid for the actual distance, but the rider can dispute if it exceeds the estimate by too much).
