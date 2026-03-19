# Data Model: URL Shortener (TinyURL)

A URL shortener maps short keys (e.g., `abc123`) to long URLs, enabling compact sharing. The data model must support fast redirects (read-heavy), analytics tracking, and duplicate detection via hashing. The system is read-heavy (~100:1 read-to-write ratio), so caching and efficient key lookups are critical.

## Table Responsibilities

| Table      | Purpose                                 | Storage                          | Key Characteristic                        |
| ---------- | --------------------------------------- | -------------------------------- | ----------------------------------------- |
| **urls**   | Core mapping from short key to long URL | PostgreSQL                       | Read-heavy, cached in Redis               |
| **users**  | Account management and API access       | PostgreSQL                       | Ties URLs to owners, enforces rate limits |
| **clicks** | Analytics for each redirect event       | PostgreSQL (partitioned by date) | Append-only, high write volume            |

## Detailed Field Descriptions

### urls

| Field         | Type                  | Description                                                                                                                                           |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| short_key     | VARCHAR(10), PK       | Base62-encoded short key (e.g., `a9Xk3m`). Serves as the primary lookup key for redirects. Using the short key as PK avoids a secondary index lookup. |
| long_url      | TEXT, NOT NULL        | The original destination URL. Stored as-is to preserve query params and fragments.                                                                    |
| long_url_hash | VARCHAR(64), INDEX    | SHA-256 hash of the long URL. Enables O(1) duplicate detection without scanning full URLs. Indexed for fast lookups.                                  |
| user_id       | BIGINT, FK → users.id | Owner of this short URL. Nullable for anonymous shortening.                                                                                           |
| created_at    | TIMESTAMP             | Creation time. Used for TTL enforcement and analytics.                                                                                                |
| expires_at    | TIMESTAMP, NULLABLE   | Optional expiration. Null means the link never expires. A background job cleans up expired links.                                                     |
| is_active     | BOOLEAN, DEFAULT true | Soft-delete flag. Allows deactivation without losing analytics data.                                                                                  |

**Why `long_url_hash`?** Comparing full URLs (potentially thousands of chars) is expensive. Hashing lets us quickly check if a URL was already shortened. The hash is indexed, so duplicate detection is a single index scan.

### users

| Field      | Type                            | Description                                                                             |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| id         | BIGINT, PK                      | Auto-incrementing user identifier.                                                      |
| email      | VARCHAR(255), UNIQUE            | Login credential and contact info. Unique constraint prevents duplicate accounts.       |
| api_key    | VARCHAR(64), UNIQUE             | API authentication token. Generated on account creation, rotatable.                     |
| tier       | ENUM('free','pro','enterprise') | Determines rate limits and feature access. Free users get lower limits.                 |
| rate_limit | INT                             | Max requests per minute. Derived from tier but overridable for custom enterprise deals. |

**Why store `rate_limit` separately from `tier`?** Enterprise clients often negotiate custom limits. Storing it explicitly avoids hardcoding tier-to-limit mappings and allows per-user overrides.

### clicks

| Field       | Type                             | Description                                                                                                                       |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| short_key   | VARCHAR(10), FK → urls.short_key | Which short URL was clicked. Partitioned by time, so this is not a traditional FK constraint.                                     |
| clicked_at  | TIMESTAMP, NOT NULL              | When the click occurred. Used as the partition key for time-range queries.                                                        |
| ip_address  | VARCHAR(45)                      | Client IP (supports IPv6). Used for geo-lookup and fraud detection.                                                               |
| user_agent  | TEXT                             | Browser/device info. Parsed for device_type analytics.                                                                            |
| referrer    | TEXT                             | HTTP Referer header. Shows where traffic comes from.                                                                              |
| country     | VARCHAR(2)                       | ISO country code, derived from IP via GeoIP lookup at write time. Pre-computed to avoid runtime lookups during analytics queries. |
| device_type | VARCHAR(20)                      | Derived from user_agent (mobile/desktop/tablet/bot). Pre-computed for fast aggregation.                                           |

**Why pre-compute `country` and `device_type`?** Analytics queries aggregate by these dimensions constantly. Computing them at write time (once) is far cheaper than parsing user_agent and doing GeoIP lookups at query time (many times).

## ER Diagram

```
┌──────────────────┐         ┌──────────────────┐
│     users         │         │     clicks        │
│──────────────────│         │──────────────────│
│ id (PK)           │         │ short_key (FK)    │
│ email             │         │ clicked_at        │
│ api_key           │         │ ip_address        │
│ tier              │         │ user_agent        │
│ rate_limit        │         │ referrer          │
└──────────────────┘         │ country           │
         │                    │ device_type       │
         │ 1                  └──────────────────┘
         │                             *
         │                             │
         │                             │
         │         ┌──────────────────┐│
         │         │     urls          ││
         │        *│──────────────────││
         └────────│ short_key (PK)    │┘
                   │ long_url          │ 1
                   │ long_url_hash     │────────┘
                   │ user_id (FK)      │
                   │ created_at        │
                   │ expires_at        │
                   │ is_active         │
                   └──────────────────┘

Relationships:
  users 1───* urls      (one user creates many short URLs)
  urls  1───* clicks    (one short URL receives many clicks)
```

## Data Flow

### Shortening a URL (Write Path)

```
1. User submits long URL via API
         │
         ▼
2. Compute SHA-256 hash of long_url
         │
         ▼
3. Check urls table for existing long_url_hash
         │
    ┌────┴────┐
    │ Found?  │
    ├─Yes─────┤──► Return existing short_key (dedup)
    │ No      │
    └────┬────┘
         ▼
4. Generate short_key (Base62 counter or random + collision check)
         │
         ▼
5. INSERT into urls table (short_key, long_url, hash, user_id, timestamps)
         │
         ▼
6. SET in Redis cache: short_key → long_url (with TTL matching expires_at)
         │
         ▼
7. Return short URL to user
```

### Redirecting (Read Path)

```
1. User visits short URL (e.g., tiny.url/a9Xk3m)
         │
         ▼
2. Check Redis cache for short_key
         │
    ┌────┴────┐
    │ Cache   │
    │ Hit?    │
    ├─Yes─────┤──► Get long_url from cache
    │ No      │
    └────┬────┘
         ▼
3. Query urls table by short_key (PK lookup, very fast)
         │
         ▼
4. Populate Redis cache for future requests
         │
         ▼
5. Async: INSERT click event into clicks table
   (fire-and-forget via Kafka to avoid slowing redirect)
         │
         ▼
6. Return HTTP 301/302 redirect to long_url
```

**Why 301 vs 302?** Use 302 (temporary) if you want to track every click. Use 301 (permanent) for better performance since browsers cache it, but you lose analytics visibility.

**Why Kafka for click logging?** The redirect must be fast (<50ms). Writing to the clicks table synchronously would add latency. Kafka buffers click events and a consumer batch-inserts them, decoupling the redirect latency from analytics writes.
