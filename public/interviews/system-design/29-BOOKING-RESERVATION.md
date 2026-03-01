# Design a Booking & Reservation System (Airbnb / OpenTable / Calendly)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Listing Management | Hosts create/update listings with availability calendars, pricing rules, and amenities |
| 2 | Availability Search | Guests search by date range, location, capacity, amenities, and price range |
| 3 | Booking Creation | Guest selects time slot, places hold (TTL), completes payment to confirm |
| 4 | Temporary Hold | System holds slot for 15 minutes while guest completes checkout |
| 5 | Booking Management | View, modify, or cancel a booking; apply refund policy at cancellation |
| 6 | Waitlist | Join waitlist when slot is full; auto-promote on cancellation |
| 7 | Recurring Bookings | Create repeating bookings (weekly, monthly) with exception handling |
| 8 | Notifications | Confirmation, 24h reminder, post-stay review request |
| 9 | Calendar Sync | Export/import iCal; two-way sync with Google Calendar |
| 10 | Dynamic Pricing | Yield management: peak/off-peak, early-bird, last-minute pricing |
| 11 | Multi-Resource Booking | Book room + equipment + catering in single atomic transaction |
| 12 | Reviews & Ratings | Post-stay reviews for both guest and host |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Booking creation latency | < 500ms (p99) |
| 2 | Double-booking rate | Zero (strong consistency) |
| 3 | Availability | 99.99% (< 53 min downtime/year) |
| 4 | Search latency | < 200ms (p95) |
| 5 | Calendar sync delay | < 30 seconds end-to-end |
| 6 | Hold TTL accuracy | +/- 1 second (expired holds released within 1s) |
| 7 | Durability | Zero booking loss (at-least-once processing, idempotent confirmation) |
| 8 | Consistency | Serializable isolation for booking writes; eventual consistency for search reads |

### Scale Estimates

```
Listings:              50M active listings
Bookings per day:      5M bookings/day
Concurrent searches:   500K concurrent search requests
Peak bookings/min:     10K bookings/minute (holiday seasons)
Active holds (TTL):    ~250K at any point (10K/min * 15-min TTL)
Cancellations/day:     ~500K (10% of bookings)
Calendar sync events:  ~50M/day (external calendar updates)
```

### Back-of-Envelope Calculations

**Booking Write Throughput:**
```
Bookings per day:         5M
Peak bookings/sec:        10,000/min = ~167/sec (steady),
                          burst to 500/sec during holidays
Holds per sec:            ~2x bookings = 334 holds/sec (many holds → partial converts)
Hold timeout events/sec:  334 holds/sec * 70% abandon rate = 234 releases/sec
```

**Availability Read Throughput:**
```
Concurrent searches:      500K
Avg search duration:      3 seconds
Requests/sec:             500K / 3 = ~167K search QPS
Cache hit ratio target:   90%
DB read QPS:              167K * 10% = 16,700 QPS
```

**Data Storage:**
```
Per listing:
  Availability calendar: 365 days * ~4 bytes/day = 1.46 KB/year
  50M listings * 1.46 KB = 73 GB/year availability data

Per booking record:
  ~2 KB (metadata + guest info + pricing snapshot)
  5M/day * 365 * 2 KB = 3.65 TB/year booking history

Blocked slots index:
  50M listings * 365 days = 18.25B slot-days
  At 1 byte/slot-day (bitmap): 18.25 GB (very compact)
```

**Notification Volume:**
```
Confirmations:        5M/day
24h reminders:        5M/day (for next day's check-ins)
Review requests:      4M/day (80% complete stays)
Total notifications:  ~14M/day = ~162/sec average
Peak:                 ~500/sec
```

---

## 2. High-Level Architecture

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

## 3. API Design

### Search Availability

```
GET /v1/search/availability

Query Parameters:
  checkin_date: "2026-07-01"       (required)
  checkout_date: "2026-07-07"      (required)
  location: "San Francisco, CA"    (required)
  guests: 2                        (required)
  min_price: 50                    (optional, USD/night)
  max_price: 300                   (optional)
  amenities: ["wifi","parking"]    (optional)
  property_type: "entire_home"     (optional)
  instant_book: true               (optional)
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

### Create Hold (Temporary Reservation)

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
  "expires_at": "2026-03-01T14:15:00Z",   (15 minutes from now)
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

### Confirm Booking

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

### Cancel Booking

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

### Manage Listing Availability

```
PUT /v1/listings/{listing_id}/availability

Request:
{
  "blocked_dates": ["2026-08-01", "2026-08-02"],
  "available_dates": ["2026-07-15", "2026-07-16"],
  "recurring_availability": {
    "type": "weekly",
    "days_of_week": [1, 2, 3, 4, 5],   (Mon-Fri)
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

### Join Waitlist

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

## 4. Data Model

### Core Tables (PostgreSQL)

```sql
-- Listings
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
  amenities       TEXT[],          -- postgres array for fast contains query
  base_price      DECIMAL(10,2) NOT NULL,  -- price per night in USD
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

-- Availability Calendar (one row per listing per date)
CREATE TABLE availability (
  listing_id      UUID NOT NULL REFERENCES listings(id),
  date            DATE NOT NULL,
  status          VARCHAR(20) NOT NULL,  -- AVAILABLE, BLOCKED, BOOKED, HELD
  booking_id      UUID,                 -- set when BOOKED
  hold_id         UUID,                 -- set when HELD
  price_override  DECIMAL(10,2),        -- NULL = use listing base_price
  min_nights_override SMALLINT,
  calendar_version INT NOT NULL DEFAULT 1,  -- optimistic locking
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (listing_id, date)
);

CREATE INDEX idx_avail_status_date ON availability(status, date) WHERE status = 'AVAILABLE';
CREATE INDEX idx_avail_booking ON availability(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_avail_hold ON availability(hold_id) WHERE hold_id IS NOT NULL;

-- Bookings (immutable audit log style)
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
  price_per_night DECIMAL(10,2) NOT NULL,  -- snapshot at booking time
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

-- Holds (temporary reservations with TTL)
CREATE TABLE holds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  guest_id        UUID NOT NULL REFERENCES users(id),
  checkin_date    DATE NOT NULL,
  checkout_date   DATE NOT NULL,
  guest_count     SMALLINT NOT NULL,
  price_snapshot  JSONB NOT NULL,      -- full pricing locked at hold time
  status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, CONVERTED, EXPIRED, RELEASED
  expires_at      TIMESTAMPTZ NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_holds_listing ON holds(listing_id);
CREATE INDEX idx_holds_expires ON holds(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_holds_guest ON holds(guest_id, status);

-- Pricing Rules (dynamic pricing overlay)
CREATE TABLE pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  rule_type       VARCHAR(30) NOT NULL,  -- seasonal, weekend, early_bird, last_minute, event
  start_date      DATE,
  end_date        DATE,
  days_of_week    SMALLINT[],
  price_modifier  DECIMAL(5,4),  -- e.g., 1.50 = 50% increase, 0.80 = 20% discount
  price_override  DECIMAL(10,2), -- absolute override (overrides modifier)
  min_advance_days SMALLINT,     -- for early_bird / last_minute rules
  max_advance_days SMALLINT,
  priority        SMALLINT DEFAULT 0,   -- higher wins on conflict
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
  priority_score  INT NOT NULL DEFAULT 0,   -- higher = promoted first
  status          VARCHAR(20) DEFAULT 'WAITING',  -- WAITING, NOTIFIED, CONVERTED, EXPIRED
  notified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (listing_id, guest_id, checkin_date, checkout_date)
);

CREATE INDEX idx_waitlist_listing ON waitlist_entries(listing_id, checkin_date, status);

-- Recurring Booking Templates
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
  exception_dates DATE[],                  -- skipped occurrences
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Sync Subscriptions
CREATE TABLE calendar_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id),
  provider        VARCHAR(30) NOT NULL,  -- ical, google_calendar
  external_cal_id VARCHAR(255),
  ical_url        TEXT,
  sync_direction  VARCHAR(10),           -- import, export, bidirectional
  last_synced_at  TIMESTAMPTZ,
  sync_token      TEXT,                  -- for incremental Google sync
  etag            TEXT,                  -- for iCal conditional fetch
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Availability Calendar Design

### Time Slot Representation

A date-based model (one row per listing per date) works for Airbnb-style nightly bookings. For OpenTable-style hourly slots, we shift to a time-slot model:

```
Date-based (Airbnb):
  availability(listing_id, date)  -- 1 row per night

Time-slot based (OpenTable):
  time_slots(listing_id, slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, capacity, booked)
```

**Bitmap representation for fast range queries:**

```
For a listing, pack 366 bits (one per day of year) into ~46 bytes:

Bit 0 = Jan 1, Bit 1 = Jan 2, ..., Bit 365 = Dec 31
  1 = available, 0 = blocked/booked

For a date range [checkin, checkout], we do bitwise AND:
  avail_bitmap & range_mask == range_mask  →  fully available

Storage: 50M listings * 46 bytes = 2.3 GB (fits in Redis)
Update: set_bit(listing_id, day_of_year, 0) on booking
Query:  bitcount(listing_id, checkin_day, checkout_day) == requested_nights
```

### Redis Availability Bitmap

```
Key:   avail:{listing_id}:{year}
Type:  Redis BITFIELD (366 bits per year)
TTL:   48 hours (refresh from DB on miss)

Commands:
  SETBIT avail:lst_abc123:2026 181 0    # Block July 1 (day 181)
  BITPOS avail:lst_abc123:2026 1 181 187  # Find first available in range
  BITCOUNT avail:lst_abc123:2026 181 187  # Count available days Jul 1-7

Multi-year booking (Dec 28 - Jan 3):
  Check avail:{id}:2026 from day 362 and avail:{id}:2027 from day 0
```

### Timezone Handling

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

Rules:
1. checkin_date / checkout_date are always stored as DATE (not TIMESTAMPTZ)
2. "Jul 1" means midnight at the LISTING'S timezone
3. Guests see dates converted to listing's local timezone in UI
4. Reminders fire at listing_timezone midnight-relative times
5. iCal exports use DTSTART;TZID=America/New_York:20260701T000000
```

---

## 6. Double-Booking Prevention

### Optimistic Locking with Version Number

```sql
-- Check availability + increment version atomically
UPDATE availability
SET    status = 'HELD',
       hold_id = $hold_id,
       calendar_version = calendar_version + 1
WHERE  listing_id = $listing_id
  AND  date BETWEEN $checkin AND $checkout - 1
  AND  status = 'AVAILABLE'
  AND  calendar_version = $expected_version
RETURNING date;

-- If rows_affected < nights_requested → conflict → rollback
```

### Pessimistic Locking with SELECT FOR UPDATE

```sql
BEGIN;

-- Lock the rows for the date range
SELECT date, status, hold_id
FROM   availability
WHERE  listing_id = $listing_id
  AND  date BETWEEN $checkin AND $checkout - 1
FOR UPDATE NOWAIT;   -- NOWAIT: fail fast if locked by another tx

-- Verify all are AVAILABLE
-- If any row is not AVAILABLE: ROLLBACK + return 409 Conflict

-- If all available: update
UPDATE availability
SET status = 'HELD', hold_id = $hold_id
WHERE listing_id = $listing_id
  AND date BETWEEN $checkin AND $checkout - 1
  AND status = 'AVAILABLE';

COMMIT;
```

### Strategy Comparison

```
+---------------------------+------------------+------------------+
|  Aspect                   | Pessimistic      | Optimistic       |
+---------------------------+------------------+------------------+
| Lock granularity          | Row-level (DB)   | Application-level|
| Contention behavior       | Block & wait     | Retry on conflict|
| Best for                  | High-conflict    | Low-conflict     |
|                           | popular listings | normal listings  |
| Deadlock risk             | Yes (order rows) | No               |
| Throughput under load     | Lower            | Higher           |
| Implementation complexity | Lower            | Moderate         |
+---------------------------+------------------+------------------+

Recommendation:
- Use SELECT FOR UPDATE NOWAIT for booking confirmation
- Order row locks by (listing_id, date ASC) to avoid deadlock
- Use Redis SETNX for fast pre-check before hitting DB:
    SETNX hold:{listing_id}:{checkin}:{checkout} {hold_id}  EX 900
    If 0 (key exists) → fast-fail without DB query
```

### Distributed Lock Flow

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

Guest B (concurrent, same dates):
  |-- SETNX hold:lst:d1:d7 ->|                            |
  |<- 0 (key exists) --------|                            |
  |   → return 409 Conflict immediately (no DB hit)       |
```

---

## 7. Reservation State Machine

```
                        +-------------+
                        |  AVAILABLE  |
                        +------+------+
                               |
                    [Guest places hold]
                               |
                        +------v------+
                        |    HELD     |<---------+
                        +--+----+----+           |
                           |    |                |
                 [TTL exp]  |    | [Guest confirms]|
                           |    |                |
              +------------v+  +v------------+   |
              |  AVAILABLE  |  |  CONFIRMED  |   |
              | (released)  |  +--+--+--+---+   |
              +-------------+     |  |  |       |
                                   |  |  |       |
               [Guest arrives] ----+  |  |       |
                                      |  |       |
                  +-------------------+  |       |
                  |  CHECKED_IN          |       |
                  +---+---------+        |       |
                      |         |        |       |
          [Stay ends] |         | [Early |       |
                      |         |  depart]       |
               +------v------+  |               |
               | COMPLETED   |  |               |
               +------+------+  |               |
                      |         |               |
               [Review requested]               |
                                                |
               [Guest cancels] ----------------+
               (at CONFIRMED state)
               +-------------+
               |  CANCELLED  |
               +------+------+
                      |
               [Refund applied per policy]
                      |
               +------v------+
               |  REFUNDED   |
               +-------------+

               [Guest no-show]
               +-------------+
               |   NO_SHOW   |  ← triggered by host after check-in window
               +-------------+
```

### State Transition Events (Kafka Topics)

```
booking.hold.created      → start TTL timer, lock availability, send hold email
booking.hold.expired      → release availability, notify guest, check waitlist
booking.confirmed         → capture payment, send confirmation, update calendar sync
booking.checked_in        → trigger welcome message, start damage protection window
booking.completed         → release payment to host, send review request
booking.cancelled         → apply refund policy, release slots, notify waitlist
booking.no_show           → notify host, release payment per no-show policy
```

---

## 8. Temporary Hold Pattern

### Hold Lifecycle with TTL

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
       |                        |   (mirrors DB expires_at)|                  |
       |                        |                        |                    |
       |<-- 201 hold_id, expires_at --|                  |                    |
       |    (15 min countdown)  |                        |                    |
       |                        |                        |                    |
  [14 min later: guest still filling payment form]       |                    |
       |                        |-- TTL expiry event ----|                    |
       |                        |   (Redis keyspace notification)             |
       |                        |                        |                    |
       |                        |-- BEGIN TX --------------------------------->|
       |                        |   UPDATE holds SET status='EXPIRED'         |
       |                        |   UPDATE availability SET status='AVAILABLE'|
       |                        |-- COMMIT ----------------------------------->|
       |                        |                        |                    |
       |                        |-- Publish hold.expired event (Kafka) ------->|
       |<-- WebSocket: "Hold expired, please re-search" -|                    |
```

### TTL Expiry Handling

```python
# Hold expiry worker (consumes Redis keyspace notifications)
# Redis config: notify-keyspace-events "Ex"

def on_hold_expired(hold_id: str):
    with db.transaction():
        hold = db.query(
            "UPDATE holds SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' RETURNING *",
            hold_id
        )
        if not hold:
            return  # already converted or released

        # Release availability
        db.execute(
            """UPDATE availability
               SET status='AVAILABLE', hold_id=NULL
               WHERE hold_id=$1 AND status='HELD'""",
            hold_id
        )

    # Async: notify waitlist
    kafka.produce('hold.expired', {'hold_id': hold_id, 'listing_id': hold.listing_id,
                                    'checkin': hold.checkin_date, 'checkout': hold.checkout_date})

    # Async: notify guest via WebSocket / push
    notify_guest_hold_expired(hold.guest_id, hold_id)
```

---

## 9. Overbooking Strategy

Used by airlines/hotels to maximize revenue when cancellation rate is predictable.

### Overbooking Formula

```
Target occupancy: 100%
Historical cancellation rate: C (e.g., 12%)
No-show rate: N (e.g., 3%)
Overbooking factor: 1 / (1 - C - N) = 1 / (1 - 0.12 - 0.03) = 1.176

For a 100-seat flight: accept 118 bookings (overbook by 18%)

Expected actual show-ups: 118 * (1 - 0.15) = 100.3  ≈ 100 ✓
```

### Overbooking Architecture

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
                  | 1. Offer compensation     |
                  |    to flexible guests     |
                  | 2. Auto-select if no      |
                  |    volunteers             |
                  | 3. Rebook at comp hotel   |
                  | 4. Issue voucher/refund   |
                  +---------------------------+
```

---

## 10. Conflict Resolution for Concurrent Bookings

```
Scenario: Two guests A and B simultaneously try to book listing L, Jul 1-7.

+---------------------------+---------------------------+
| Guest A (t=0ms)           | Guest B (t=5ms)           |
+---------------------------+---------------------------+
| BEGIN TX                  | BEGIN TX                  |
| SETNX hold:L:d1:d7 → OK  | SETNX hold:L:d1:d7 → 0   |
|                           | → FAIL FAST: 409          |
| SELECT FOR UPDATE         |                           |
| (avail rows, all AVAIL)   |                           |
| UPDATE → HELD             |                           |
| COMMIT                    |                           |
+---------------------------+---------------------------+

First-write-wins strategy (implemented):
- Redis SETNX is the tie-breaker
- Whichever request reaches Redis first wins
- All others receive 409 Conflict immediately
- No waiting, no deadlocks

Last-write-wins (NOT used for bookings):
- Dangerous: leads to double-bookings
- Suitable only for non-exclusive resources
  (e.g., "last profile update wins")
```

---

## 11. Calendar Search and Availability Query Optimization

### Naive Approach (problematic at scale)

```sql
-- Naive: full table scan per search
SELECT listing_id
FROM availability
WHERE date BETWEEN '2026-07-01' AND '2026-07-06'
  AND status = 'AVAILABLE'
GROUP BY listing_id
HAVING COUNT(*) = 6;   -- 6 nights

-- Problem: 50M listings * 365 days = 18.25B rows, slow even with index
```

### Optimized: Bitmap-Based Approach

```
Per-listing Redis bitmap (as described in section 5):

Search Algorithm:
  1. Load availability bitmap for each candidate listing (from Redis)
  2. AND with date-range mask: O(1) per listing
  3. Filter listings where AND result == range mask (all bits set)
  4. Apply additional filters (price, amenities) on passing set

For 500K concurrent searches:
  - Elasticsearch pre-filters by geo, amenities, capacity: ~10K candidates
  - Redis bitmap check on 10K candidates: ~10ms
  - Total: < 200ms with caching
```

### Interval Tree for Booked Ranges

```
Instead of storing individual dates, store booking intervals:
  Interval(start=Jul1, end=Jul7)

Interval Tree operations:
  Insert: O(log n)
  Query "is Jul 3-5 free?": O(log n + k) where k = overlapping bookings
  Delete: O(log n)

Stored in-memory per listing (Redis sorted set):
  ZADD bookings:{listing_id} {checkout_epoch} "{checkin_epoch},{checkout_epoch}"

  Overlap query:
    ZRANGEBYSCORE bookings:{listing_id} {checkin_epoch} +inf LIMIT 0 1
    → if result's checkin < requested_checkout → conflict
```

### Elasticsearch Availability Index

```json
// Listing document in ES (denormalized for fast search)
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
  ],  // updated on every booking/cancellation via Kafka consumer
  "instant_book": true,
  "property_type": "entire_home",
  "updated_at": "2026-03-01T12:00:00Z"
}
```

```json
// ES Query for available listings
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

## 12. Multi-Resource Booking

For conference rooms requiring equipment + catering in one atomic transaction:

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
                   | 1. Sort resources   |
                   |    by ID (prevent   |
                   |    deadlock)        |
                   | 2. BEGIN TX         |
                   | 3. Lock each in     |
                   |    sorted order     |
                   | 4. Check all avail  |
                   | 5. Update all       |
                   | 6. COMMIT           |
                   +---------------------+

Saga Pattern (for distributed resources across services):
  Step 1: Hold Room   → success → Step 2
  Step 2: Hold Equip  → fail    → Compensate: Release Room → return error
  Step 3: Hold Catering → success
  Step 4: Confirm all → success → DONE

  If step 4 payment fails:
    Compensate step 3: Release Catering
    Compensate step 2: Release Equipment
    Compensate step 1: Release Room
```

```sql
-- Multi-resource booking transaction
BEGIN;

-- Lock all resource availability in deterministic order
SELECT resource_id, date, status
FROM resource_availability
WHERE (resource_id, date) IN (
  ('room_101', '2026-07-01'), ('room_101', '2026-07-02'),
  ('projector_3', '2026-07-01'), ('projector_3', '2026-07-02'),
  ('catering_svc', '2026-07-01')
)
ORDER BY resource_id, date   -- deterministic order prevents deadlock
FOR UPDATE NOWAIT;

-- Verify all AVAILABLE, then update all
UPDATE resource_availability
SET status = 'HELD', hold_id = $hold_id
WHERE (resource_id, date) IN (...)
  AND status = 'AVAILABLE';

-- Insert composite booking record
INSERT INTO multi_resource_bookings (id, hold_id, resource_ids, ...)
VALUES ($booking_id, $hold_id, ARRAY['room_101','projector_3','catering_svc'], ...);

COMMIT;
```

---

## 13. Waitlist Management

### Priority Queue Design

```
Waitlist Priority Score = base_score + time_bonus + loyalty_bonus

base_score:    0 (everyone starts equal)
time_bonus:    +1 per hour waiting (FIFO within same priority tier)
loyalty_bonus: +10 for Superhost guests, +5 for verified guests
price_flex:    listings filter by max_price <= current_price

+------------------+      Kafka: booking.cancelled       +------------------+
|  Waitlist Table  |<------------------------------------|  Booking Service  |
|  (Priority Q)    |                                     +------------------+
|                  |
| Sorted by        |      +---------------------------+
| priority_score   |----->|  Waitlist Promotion Job   |
|                  |      |                           |
| entry_1: score=47|      | 1. Query top-N waitlist   |
| entry_2: score=39|      |    entries for listing    |
| entry_3: score=31|      | 2. Filter by max_price    |
+------------------+      | 3. Attempt hold for top   |
                          |    candidate              |
                          | 4. If hold success:       |
                          |    - Notify guest (email, |
                          |      SMS, push)            |
                          |    - Give 30min to confirm|
                          |    - If no confirm: next  |
                          | 5. Mark entry NOTIFIED    |
                          +---------------------------+
```

```sql
-- Auto-promote on cancellation
-- Triggered via Kafka consumer when booking.cancelled fires

SELECT we.*, l.base_price
FROM waitlist_entries we
JOIN listings l ON l.id = we.listing_id
WHERE we.listing_id = $listing_id
  AND we.checkin_date = $checkin
  AND we.checkout_date = $checkout
  AND we.status = 'WAITING'
  AND (we.max_price IS NULL OR we.max_price >= l.base_price)
ORDER BY we.priority_score DESC, we.created_at ASC
LIMIT 5;   -- promote top 5, first to confirm wins
```

---

## 14. Dynamic Pricing and Yield Management

### Pricing Engine

```
Base Price
    |
    + Seasonal Multiplier (1.5x July 4th week)
    |
    + Demand Multiplier (based on search-to-book ratio)
    |       demand_score = searches_last_7d / avg_weekly_searches
    |       if demand_score > 1.5: apply 1.0 + (demand_score - 1.0) * 0.3
    |
    + Lead-time Discount
    |       > 90 days: -10% (early bird)
    |       < 7 days:  -15% (last minute, if not high demand)
    |       < 2 days:  -25% (very last minute)
    |
    + Occupancy Multiplier (for hotel-style)
    |       occupancy 0-60%:  base
    |       occupancy 60-80%: +20%
    |       occupancy 80-90%: +40%
    |       occupancy 90%+:   +60%
    |
    = Final Price (floor: 50% of base, ceiling: 300% of base)
```

```python
def calculate_price(listing_id: str, date: date) -> Decimal:
    listing = get_listing(listing_id)
    base = listing.base_price

    # Fetch all applicable rules, sorted by priority DESC
    rules = get_pricing_rules(listing_id, date)

    price = base
    for rule in rules:
        if rule.price_override:
            price = rule.price_override
            break  # override wins, stop applying further rules
        elif rule.price_modifier:
            price *= rule.price_modifier

    # Dynamic demand adjustment (ML model output, cached 1h)
    demand_multiplier = demand_model.predict(listing_id, date)
    price *= demand_multiplier

    # Apply floor and ceiling
    price = max(price, base * Decimal('0.5'))
    price = min(price, base * Decimal('3.0'))

    return price.quantize(Decimal('0.01'))
```

---

## 15. Cancellation and Refund Policies

### Policy State Machine

```
Cancellation Policies:

FLEXIBLE:
  > 24h before checkin  →  100% refund
  < 24h before checkin  →  0% refund (first night kept)

MODERATE:
  > 5 days before checkin → 100% refund
  1-5 days before checkin → 50% refund
  < 24h before checkin    → 0% refund

STRICT:
  > 14 days before checkin → 50% refund
  < 14 days before checkin → 0% refund
  Non-refundable option    → 0% refund always (lower price shown)

SUPER STRICT (luxury/events):
  > 30 days before checkin → 50% refund
  < 30 days before checkin → 0% refund
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

    # Only refund guest-paid portion (exclude host service fee if non-refundable)
    refundable_amount = booking.subtotal + booking.cleaning_fee + booking.service_fee * pct
    return (refundable_amount * pct).quantize(Decimal('0.01'))
```

---

## 16. Notification Pipeline

```
+------------------+    Kafka Topics:         +------------------+
|  Booking Service |----booking.confirmed---->|                  |
|  Hold Service    |----hold.expired--------->|  Notification    |
|  Check-in Service|----booking.checked_in--->|  Orchestrator    |
|  Scheduler       |----reminder.24h_before-->|                  |
|  Review Requester|----booking.completed---->|  (Stateful FSM   |
+------------------+    review.requested      |   per booking)   |
                                              +--------+---------+
                                                       |
                  +------------------------------------+
                  |                |                   |
          +-------v-----+  +-------v------+  +---------v----+
          |   Email     |  |     SMS      |  |  Push Notif  |
          |  Service    |  |   Service    |  |   Service    |
          | (SendGrid)  |  | (Twilio)     |  | (FCM / APNs) |
          +-------------+  +--------------+  +--------------+

Notification Templates:
  BOOKING_CONFIRMED:
    - Subject: "Booking confirmed! {confirmation_code}"
    - Body: dates, address, host contact, check-in instructions
    - Send: immediately after payment captured

  REMINDER_24H:
    - Subject: "Your stay begins tomorrow"
    - Body: check-in time, door code, parking, wifi password
    - Send: 24h before checkin_date at listing's timezone 10am

  REVIEW_REQUEST:
    - Subject: "How was your stay at {listing_title}?"
    - Body: 5-star rating link, review form deep link
    - Send: 2h after checkout_date in listing's timezone

  HOST_BOOKING_REQUEST (non-instant-book):
    - Subject: "New booking request from {guest_name}"
    - Body: dates, guest profile, approve/decline links
    - Send: immediately, with 24h expiry
```

---

## 17. Recurring Bookings

### Recurrence Engine

```
Template: Weekly standup, every Monday 9am-10am, Apr 1 - Dec 31

Generation strategy: Lazy expansion
  - Store template, not individual bookings
  - Expand N weeks ahead (rolling window: always 4 weeks pre-expanded)
  - When exception added: mark specific occurrence as SKIPPED

+------------------+       +---------------------+
|  Recurring       |       |  Occurrence         |
|  Template        |       |  Expander (cron)    |
|                  |       |                     |
| recurrence_type  |       | Runs daily at 2am   |
| days_of_week     |------>| Generates bookings  |
| series_start     |       | for next 4 weeks    |
| series_end       |       | that don't exist yet|
| exception_dates  |       |                     |
+------------------+       +----------+----------+
                                      |
                           +----------v----------+
                           |  Individual Booking  |
                           |  Records created     |
                           |  with template_id ref|
                           +---------------------+
```

```sql
-- Generate recurring occurrences
-- Called by cron job: daily, look-ahead 28 days

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

## 18. Calendar Sync (iCal / Google Calendar)

### iCal Import (blocking external calendars)

```
+------------------+    HTTP GET (polling every 15min)   +------------------+
|  Calendar Sync   |------------------------------------>|  External iCal   |
|  Worker          |<-----------------------------------|  (Airbnb, VRBO,   |
|                  |    .ics file                        |   Booking.com)   |
|  - Parse VEVENT  |                                     +------------------+
|  - Extract       |
|    DTSTART,DTEND |
|  - Compare with  |
|    known events  |
|  - Block dates   |
|    for new events|
|  - Unblock for   |
|    deleted events|
+--------+---------+
         |
         | Kafka: availability.changed
         |
+--------v---------+
|  Availability    |
|  Service         |
|  (block dates)   |
+------------------+
```

```
iCal Export (guests can subscribe):

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

### Google Calendar Two-Way Sync

```
Export (push):
  On booking.confirmed → Google Calendar API: events.insert() to host's calendar
  On booking.cancelled → Google Calendar API: events.delete()
  Use incremental sync with syncToken for efficiency

Import (pull via Push Notifications):
  Host blocks a date in Google Calendar
  → Google sends push notification to our webhook
  → We parse event, block date in listing availability
  → Prevents double-booking across platforms
```

---

## 19. Scaling Strategy

### Database Scaling

```
+---------------------------+         +---------------------------+
|  Write Leader (Primary)   |-------->|  Read Replica 1           |
|  (PostgreSQL, us-east-1)  |         |  (Sync replica, us-east-1)|
|                           |-------->|                           |
|  - All booking writes     |         |  Read Replica 2           |
|  - Availability updates   |         |  (us-west-2, async)       |
|  - Strong consistency     |         |                           |
+---------------------------+         +---------------------------+
              |
              | Kafka CDC (Debezium)
              |
+-------------v-------------+         +---------------------------+
|  OLAP Replica             |         |  Elasticsearch            |
|  (read-only analytics)    |         |  (search index)           |
|                           |         |  - Updated via Kafka      |
|  - Revenue reports        |         |    consumer               |
|  - Occupancy dashboards   |         |  - Eventual consistency   |
+---------------------------+         |    (~5s lag acceptable)   |
                                      +---------------------------+

Sharding Strategy (if single DB becomes bottleneck):
  Shard by listing_id (consistent hashing)
  - Co-locate listing + availability + bookings for same listing_id
  - 64 shards initially (easy to double)
  - Waitlist, pricing rules: same shard as listing

Cross-shard queries (e.g., guest's booking history):
  - Maintain secondary index: guest_id → [booking_ids] in Redis
  - Fan-out read for guest history (acceptable: rare, low QPS)
```

### Cache Architecture

```
+------------------+   L1 Cache (in-process)   +------------------+
|  Search Service  |   LRU, 10K entries,        |  Booking Service |
|                  |   TTL 30s                  |                  |
+--------+---------+                            +--------+---------+
         |                                               |
         |              +------------------+             |
         +------------->|   Redis Cluster  |<------------+
                        |                  |
                        |  Avail bitmaps   |  TTL 48h
                        |  Hold locks      |  TTL 15min
                        |  Price cache     |  TTL 1h
                        |  Session tokens  |  TTL 24h
                        |  Idempotency     |  TTL 24h
                        |  Rate limits     |  TTL 1min sliding
                        +------------------+

Redis Cluster: 6 nodes (3 primary + 3 replica)
  Partition: 16384 hash slots across 3 primaries
  Failover: automatic sentinel, < 30s RTO
  Memory: 64 GB per node = 384 GB total cluster memory
```

### Search Service Scaling

```
                    +------------------+
  Search Request -->|  Search Gateway  |
                    |  (query router)  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +-------v----+  +------v-----+
     | ES Shard 1 |  | ES Shard 2 |  | ES Shard 3 |
     | (Americas) |  | (Europe)   |  | (Asia)     |
     +------------+  +------------+  +------------+

Geo-partitioned Elasticsearch:
  - Shard by geographic region (city prefix → shard)
  - Cross-shard query only if user spans regions
  - Replicas: 2 per shard for HA
  - 500M listing documents, ~1 KB each = 500 GB index
  - With replicas: 1.5 TB ES storage
```

---

## 20. Trade-offs

| Decision | Choice Made | Alternative | Reason |
|----------|-------------|-------------|--------|
| Availability storage | Per-date rows (PostgreSQL) | Interval ranges | Simpler queries, easier lock granularity |
| Double-booking prevention | Redis SETNX + SELECT FOR UPDATE | Pure optimistic locking | Fail-fast without DB roundtrip for conflicts |
| Hold mechanism | Redis TTL + DB record | DB-only scheduled cleanup | Sub-second expiry accuracy vs 1-min cron lag |
| Search index | Elasticsearch | PostgreSQL full-text | ES scales horizontally; better geo + faceted search |
| Availability cache | Redis bitmap | Materialized view | 46 bytes/year vs 365 rows, 1000x smaller |
| Consistency model | Strong for writes, eventual for reads | Full strong consistency | Performance: read replicas/ES lag is acceptable |
| Overbooking | Configurable per property type | Always exact capacity | Revenue optimization for hotels; off for Airbnb |
| Calendar sync | iCal polling + Google push | Push-only | iCal standard doesn't support push; polling is necessary |

---

## 21. Common Interview Follow-ups

**Q: How do you guarantee zero double-bookings at 10K bookings/min peak?**

A: Three-layer defense:
1. Redis SETNX as fast pre-check (< 1ms, no DB hit for clear conflicts)
2. PostgreSQL SELECT FOR UPDATE NOWAIT at the DB layer (serializable write)
3. Unique constraint on `(listing_id, date)` with `status='BOOKED'` as DB safety net

At 10K bookings/min = 167/sec, with 99% being non-conflicting, only ~1-2/sec even attempt the lock contention path. PostgreSQL handles this comfortably with connection pooling (PgBouncer).

**Q: What if a guest's payment fails after the hold is confirmed?**

A: The hold remains active. We retry payment up to 3 times with exponential backoff (1s, 4s, 16s) within the 15-minute TTL. If all retries fail before expiry, the hold expires automatically and availability is released. The guest receives a payment-failed notification with a link to retry with a new payment method (which creates a new hold).

**Q: How does your search handle 500K concurrent users?**

A: Horizontally scaled Elasticsearch (geo-partitioned) handles the search query itself. A 90% cache hit rate on popular searches (Redis with 5-minute TTL on common city+date combinations) means only ~50K QPS reach ES. ES is sized to handle 100K QPS across shards. Availability freshness in ES lags up to 5 seconds (via Kafka consumer), which is acceptable since the booking confirmation step performs the authoritative real-time check.

**Q: How do you handle the thundering herd when a popular listing becomes available (e.g., celebrity home cancellation)?**

A: Three mechanisms:
1. Waitlist promotion is serialized - only 1 person is notified at a time, with a 30-minute response window
2. For non-waitlisted guests, availability updates propagate to Elasticsearch within 5 seconds, but Redis SETNX ensures only one hold succeeds
3. Rate-limit hold creation for the same listing: max 1 successful hold per (listing_id, date_range) at any time

**Q: How do you handle timezone edge cases where a guest in Tokyo books a NY listing for "July 1"?**

A: Booking dates are stored as DATE type (timezone-agnostic). "July 1" always means midnight at the listing's timezone (America/New_York). The UI converts and displays: "Check-in: July 1, 2026 at 3pm (Eastern Time / July 2 at 4am Tokyo time)". The guest explicitly sees both timezones. Reminder notifications fire at listing-local time (e.g., 10am Eastern, regardless of guest's timezone).

**Q: How do you prevent a guest from gaming the hold system to block a popular listing?**

A: Rate limiting on hold creation:
- Max 3 active holds per guest at any time
- Max 1 active hold per (guest_id, listing_id) at any time
- Hold frequency: max 5 holds/hour per guest
- IP-based: max 10 holds/hour per IP
- Abuse detection: guest who creates and abandons > 80% of holds over 7 days gets reduced hold TTL (5 min) or manual review requirement

**Q: How does your system handle a recurring weekly booking when the host blocks one specific occurrence?**

A: The recurring template stores an `exception_dates` array. When the host blocks a specific occurrence:
1. Cancel the pre-generated individual booking for that date (refund applied)
2. Add the date to `exception_dates` in the template
3. Future occurrence generation skips exception_dates
4. The guest is notified and can book an alternative date

The template itself continues generating all other occurrences normally.

**Q: Walk me through the data flow when a guest cancels a booking that has waitlisted guests.**

A:
```
Guest cancels → POST /v1/bookings/{id} (DELETE)
  ↓
Booking Service:
  1. Validate cancellation eligibility and policy
  2. BEGIN TX:
     - Update bookings.status = 'CANCELLED'
     - Update availability rows: status = 'AVAILABLE'
     - Calculate refund amount
     - Record refund_id
  3. COMMIT
  4. Publish to Kafka: booking.cancelled, availability.released
  ↓
Waitlist Service (consumes booking.cancelled):
  1. Query waitlist for (listing_id, checkin, checkout), sorted by priority_score DESC
  2. Filter by max_price
  3. For top candidate: attempt to place hold (full hold flow)
  4. If hold succeeds: send "Good news! Your waitlisted dates are available" notification
     - Guest has 30 minutes to confirm
     - If no confirmation: release hold, try next waitlist candidate
  ↓
Notification Service (consumes booking.cancelled):
  1. Send cancellation confirmation to guest (with refund details)
  2. Send host notification: "Booking cancelled, dates now open"
  ↓
Payment Service (consumes booking.cancelled):
  1. Issue refund via Stripe refund API
  2. Publish payment.refunded event
  3. Notification Service sends "Refund issued" to guest
```

**Q: How do you size your database connection pool for peak booking load?**

A:
```
Peak load: 167 booking confirmations/sec
Each booking: ~50ms DB time (hold + confirm = 2 transactions)
Concurrent DB connections needed: 167 * 0.05 = ~8-9 active
With 2x headroom: 20 connections
PgBouncer (transaction-mode pooling): 20 server connections serves hundreds of app connections
App server pool: 100 connections to PgBouncer
PgBouncer → PostgreSQL: 20 connections max

This is deliberately small - most booking latency is payment API (external), not DB.
```

---

*Last updated: 2026-03-01*
