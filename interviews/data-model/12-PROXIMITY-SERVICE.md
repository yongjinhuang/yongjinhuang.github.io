# Data Model: Proximity Service (Yelp)

A proximity service lets users find nearby businesses by location. The data model must support fast geospatial queries ("restaurants within 2km"), scale to millions of businesses, and handle skewed density (Manhattan has far more businesses per square km than rural Montana). Geohash-based indexing replaces traditional B-tree indexes for spatial lookups.

## Table Responsibilities

| Table             | Purpose                                   | Storage                                 | Key Characteristic                            |
| ----------------- | ----------------------------------------- | --------------------------------------- | --------------------------------------------- |
| **businesses**    | Core business information and coordinates | PostgreSQL                              | Geohash-indexed for spatial queries           |
| **categories**    | Hierarchical business taxonomy            | PostgreSQL                              | Self-referencing tree (parent_id)             |
| **reviews**       | User ratings and review text              | PostgreSQL (partitioned by business_id) | High write volume, drives rating aggregation  |
| **geohash_index** | Pre-computed geohash-to-business mapping  | Redis / DynamoDB                        | Enables O(1) spatial lookups without scanning |

## Detailed Field Descriptions

### businesses

| Field        | Type                   | Description                                                                                                                                                         |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| business_id  | BIGINT, PK             | Unique business identifier. Auto-generated.                                                                                                                         |
| name         | VARCHAR(255), NOT NULL | Business display name. Full-text indexed for search-by-name queries.                                                                                                |
| latitude     | DECIMAL(9,6)           | Latitude coordinate (6 decimal places gives ~11cm precision). Stored alongside geohash for exact distance post-filtering.                                           |
| longitude    | DECIMAL(9,6)           | Longitude coordinate. Together with latitude, used for Haversine distance calculation after geohash pre-filtering.                                                  |
| geohash      | VARCHAR(12), INDEX     | Geohash encoding of (lat, lng). Length determines precision: 6 chars = ~1.2km cell. Indexed with prefix matching for variable-radius searches.                      |
| category     | VARCHAR(100), INDEX    | Primary business category (e.g., "restaurant", "gym"). Indexed for filtered proximity queries ("restaurants near me").                                              |
| address      | TEXT                   | Human-readable street address for display purposes.                                                                                                                 |
| city         | VARCHAR(100), INDEX    | City name. Indexed for city-level filtering and analytics.                                                                                                          |
| country      | VARCHAR(2)             | ISO country code. Used for locale-specific formatting and legal compliance.                                                                                         |
| rating       | DECIMAL(2,1)           | Average rating (1.0-5.0). Pre-computed aggregate, updated asynchronously when new reviews are added. Avoids computing AVG() over millions of reviews at query time. |
| review_count | INT                    | Total number of reviews. Displayed alongside rating for credibility signal. Also updated asynchronously.                                                            |
| price_range  | SMALLINT               | Price tier (1-4, mapping to $-$$$$). Simple integer enables range filtering.                                                                                        |
| is_active    | BOOLEAN, DEFAULT true  | Whether the business is currently operating. Soft delete preserves historical reviews and data.                                                                     |
| hours_json   | JSONB                  | Operating hours per day of week. JSONB because hours structure varies (some businesses have holiday hours, split shifts, etc.).                                     |

**Why pre-compute `rating` instead of joining reviews?** A popular business might have 50,000 reviews. Computing AVG(rating) at query time for every result in a proximity search would be prohibitively expensive. Updating a denormalized `rating` field asynchronously (via a trigger or background job) trades slight staleness for massive query performance gains.

**Why geohash over PostGIS/R-tree?** Geohashes are strings, which means they work with standard B-tree indexes, standard caching (Redis), and standard sharding (range-partition on geohash prefix). PostGIS R-trees are powerful but harder to cache and shard across distributed systems.

### categories

| Field       | Type                                           | Description                                                                                                                  |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| category_id | BIGINT, PK                                     | Unique category identifier.                                                                                                  |
| name        | VARCHAR(100), NOT NULL                         | Category display name (e.g., "Italian Restaurant").                                                                          |
| parent_id   | BIGINT, FK -> categories.category_id, NULLABLE | Self-referential FK for hierarchy (e.g., "Italian Restaurant" -> "Restaurant" -> "Food & Dining"). Null for root categories. |
| icon_url    | VARCHAR(512)                                   | URL to category icon for UI display. Stored as URL rather than blob for CDN serving.                                         |

**Why a self-referencing hierarchy?** Users search at different levels of specificity. "Find restaurants" should include "Italian", "Chinese", "Fast Food" subcategories. A tree structure lets us traverse up or down the taxonomy with a recursive query.

### reviews

| Field       | Type                            | Description                                                                                                      |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| review_id   | BIGINT, PK                      | Unique review identifier.                                                                                        |
| business_id | BIGINT, FK -> businesses, INDEX | Which business this review is for. Indexed for fetching all reviews of a business.                               |
| user_id     | BIGINT, FK -> users, INDEX      | Who wrote the review. Indexed to show a user's review history.                                                   |
| rating      | SMALLINT, NOT NULL              | Rating value (1-5). Stored as integer for efficient aggregation. Constrained with CHECK(rating BETWEEN 1 AND 5). |
| text        | TEXT                            | Review body. Optional (some users only leave a star rating).                                                     |
| photos      | TEXT[]                          | Array of photo URLs attached to the review. Stored as URLs pointing to object storage (S3).                      |
| created_at  | TIMESTAMP, INDEX                | When the review was written. Indexed for "most recent" sorting and time-range queries.                           |

**Why partition reviews by business_id?** The most common access pattern is "show all reviews for this business." Partitioning by business_id ensures all reviews for a business are co-located on disk, making this query a single partition scan.

### geohash_index

| Field          | Type            | Description                                                                                                                   |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| geohash_prefix | VARCHAR(12), PK | Geohash prefix at a chosen precision level. The prefix length determines the cell size (e.g., 6 chars = ~1.2km x 0.6km cell). |
| business_ids   | BIGINT[]        | List of business IDs within this geohash cell. Stored as an array for single-read retrieval of all businesses in a cell.      |
| updated_at     | TIMESTAMP       | When this entry was last updated. Used for cache invalidation and consistency checks.                                         |

**Why a separate geohash_index table?** While we could query businesses by geohash prefix directly, a pre-computed index in Redis allows O(1) lookups. When a user searches "restaurants within 2km," we compute the geohash prefixes covering that radius (typically 4-9 cells), fetch business_ids for each cell from Redis, then batch-fetch business details. This avoids scanning the full businesses table.

## ER Diagram

```
┌──────────────────────┐
│     categories        │
│──────────────────────│
│ category_id (PK)      │
│ name                  │
│ parent_id (FK) ───────│──┐ self-referencing
│ icon_url              │  │ (parent category)
└──────────────────────┘  │
          │                │
          │ 1              │
          │                │
          │ *              │
┌──────────────────────┐  │
│     businesses        │  │
│──────────────────────│  │
│ business_id (PK)      │  │
│ name                  │  │
│ latitude              │  │
│ longitude             │  │
│ geohash ──────────────│──│──► geohash_index (lookup)
│ category              │  │
│ address               │  │
│ city                  │  │
│ country               │  │
│ rating                │
│ review_count          │
│ price_range           │
│ is_active             │
│ hours_json            │
└──────────────────────┘
          │
          │ 1
          │
          │ *
┌──────────────────────┐       ┌──────────────────────┐
│      reviews          │       │   geohash_index       │
│──────────────────────│       │──────────────────────│
│ review_id (PK)        │       │ geohash_prefix (PK)   │
│ business_id (FK)      │       │ business_ids          │
│ user_id (FK)          │       │ updated_at            │
│ rating                │       └──────────────────────┘
│ text                  │
│ photos                │
│ created_at            │
└──────────────────────┘

Relationships:
  categories  1───* businesses   (one category has many businesses)
  categories  1───* categories   (self-ref: parent has many children)
  businesses  1───* reviews      (one business has many reviews)
  geohash_index ───► businesses  (index maps to business IDs)
```

## Data Flow

### Nearby Search (Read Path)

```
1. User sends search request: (latitude, longitude, radius_km, filters)
         │
         ▼
2. Compute geohash of user's location at appropriate precision
   (e.g., 6-char for ~1km radius, 5-char for ~5km radius)
         │
         ▼
3. Calculate neighboring geohash prefixes that cover the search radius
   (typically the center cell + 8 surrounding cells)
         │
         ▼
4. Query geohash_index for each prefix → collect business_ids
         │
         ▼
5. Batch-fetch business details from businesses table
         │
         ▼
6. Post-filter by exact Haversine distance
   (geohash cells are rectangular, so corner businesses
    may be outside the circular radius)
         │
         ▼
7. Apply additional filters (category, price_range, is_active, hours)
         │
         ▼
8. Sort by relevance (distance, rating, review_count weighted)
         │
         ▼
9. Return paginated results with distance from user
```

**Why post-filter by exact distance?** Geohash cells are rectangles, not circles. A business in the corner of a neighboring cell might be 1.5km away when the user requested a 1km radius. The Haversine formula on (lat, lng) provides exact distance for the final filter.

### Adding a Business (Write Path)

```
1. Business owner submits business details
         │
         ▼
2. Validate and normalize address, compute (latitude, longitude)
   via geocoding API
         │
         ▼
3. Compute geohash from (latitude, longitude)
         │
         ▼
4. INSERT into businesses table
         │
         ▼
5. Update geohash_index: append business_id to the
   matching geohash_prefix entry (or create new entry)
         │
         ▼
6. Invalidate any cached search results for affected geohash cells
```

**Why not use a database-level geospatial index directly?** Database geospatial indexes (R-trees, quad-trees) work well for single-node databases but are difficult to shard and cache. Geohash-based indexing maps naturally to key-value stores (Redis, DynamoDB), enabling horizontal scaling. The trade-off is slightly more application-level complexity for the neighbor-cell calculation.
