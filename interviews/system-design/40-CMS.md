# Design a Content Management System (WordPress / Contentful / Strapi)

A Content Management System (CMS) provides a platform for creating, managing, and delivering structured content across multiple channels. Modern headless CMS architectures decouple the content repository from the presentation layer, exposing content via APIs (REST and GraphQL) to websites, mobile apps, IoT devices, and static site generators. The core challenge is designing a flexible content modeling system that supports arbitrary schemas, versioning, editorial workflows, and high-performance content delivery at scale.

## Table of Contents

1. [Requirements Clarification](#requirements-clarification)
2. [API Design](#api-design)
3. [Data Model](#data-model)
4. [High-Level Architecture](#high-level-architecture)
5. [Deep Dive: Content Modeling](#deep-dive-content-modeling)
6. [Deep Dive: Versioning & Publishing](#deep-dive-versioning--publishing)
7. [Deep Dive: Editorial Workflow](#deep-dive-editorial-workflow)
8. [Deep Dive: Media Asset Pipeline](#deep-dive-media-asset-pipeline)
9. [Deep Dive: Content Delivery](#deep-dive-content-delivery)
10. [Deep Dive: Search & Filtering](#deep-dive-search--filtering)
11. [Deep Dive: Localization (i18n)](#deep-dive-localization-i18n)
12. [Scaling Strategy](#scaling-strategy)
13. [Deployment Architecture](#deployment-architecture)
14. [Common Interview Follow-ups](#common-interview-follow-ups)
15. [Summary](#summary)

---

## Requirements Clarification

### Clarifying Questions to Ask

- Is this a headless CMS (API-first) or a traditional CMS with built-in rendering?
- How many content types and fields do we need to support? Are they defined by developers or business users?
- Do we need multi-tenant support (SaaS) or single-tenant (self-hosted)?
- What content delivery channels are in scope? (web, mobile, IoT, digital signage)
- Do we need multi-locale support? How many locales?
- What is the editorial workflow? Simple draft/publish or multi-stage approval?
- What media types need support? (images, video, documents, 3D models)
- Do we need real-time collaboration on content editing?
- What are the integration requirements? (SSG, e-commerce, DAM, analytics)

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Content Modeling | Define custom content types with typed fields (text, rich text, number, date, media, reference, JSON) |
| 2 | CRUD Operations | Create, read, update, delete content entries with validation against content type schema |
| 3 | Content Versioning | Maintain full version history of every entry; compare and rollback to any version |
| 4 | Publishing Workflow | Draft/review/published/archived lifecycle with scheduled publishing and unpublishing |
| 5 | Media Management | Upload, store, transform (resize, crop, format conversion), and deliver media assets via CDN |
| 6 | API Delivery | Serve content via REST and GraphQL APIs; support filtering, pagination, and field selection |
| 7 | Localization | Per-field localization with locale fallback chains; translation workflow support |
| 8 | Webhooks | Notify external systems on content lifecycle events (create, publish, unpublish, delete) |
| 9 | Search | Full-text search across all content with faceted filtering and relevance ranking |
| 10 | Access Control | Role-based permissions (author, editor, admin) with per-content-type and per-field granularity |
| 11 | Preview | Generate preview URLs for unpublished content for editorial review |
| 12 | Audit Trail | Log all content mutations with actor, timestamp, and changeset for compliance |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Content Delivery API latency | < 50ms P99 (CDN cache hit), < 200ms P99 (origin) |
| 2 | Content Management API latency | < 500ms P99 for CRUD operations |
| 3 | Availability | 99.99% for delivery API, 99.9% for management API |
| 4 | Throughput (delivery) | 100K requests/second at peak |
| 5 | Throughput (management) | 1K writes/second at peak |
| 6 | Media upload | Support files up to 500MB; process within 60 seconds |
| 7 | Search latency | < 100ms for full-text queries |
| 8 | Scalability | Support 10K content types, 100M entries, 50M assets |
| 9 | SEO-friendly | Clean URLs, structured data (JSON-LD), sitemap generation |
| 10 | Data consistency | Strong consistency for management API, eventual for delivery API |
| 11 | Multi-locale | Support 50+ locales with per-field localization |
| 12 | Webhook delivery | At-least-once delivery within 30 seconds of event |

### Scale Estimation

```
Content volume:
  Content types:              10,000 (across all tenants in SaaS model)
  Total entries:              100M entries
  Avg entry size:             5KB (JSON payload)
  Total entry storage:        100M x 5KB = 500GB (current versions)
  Version history:            Avg 20 versions/entry = 2B version records
  Version storage:            2B x 5KB = 10TB

Media assets:
  Total assets:               50M files
  Avg file size:              2MB (images), 50MB (video)
  Total media storage:        50M x 5MB avg = 250TB
  Derived assets (thumbnails, 20 x 50M x 200KB = 200TB
    crops, formats):

API traffic:
  Delivery API:
    Peak QPS:                 100,000 req/s
    CDN cache hit rate:       90-95%
    Origin QPS:               5,000-10,000 req/s
    Bandwidth:                100K x 5KB avg = 500MB/s

  Management API:
    Peak writes/s:            1,000
    Peak reads/s:             5,000
    Webhook events/s:         1,000

Search:
  Indexed entries:            100M documents
  Index size:                 100M x 2KB avg = 200GB
  Search QPS:                 5,000 queries/s

Database:
  Primary DB size:            ~500GB entries + 200GB metadata = 700GB
  Read replicas:              3-5 per region
  Write throughput:           1,000 TPS
  Read throughput:            50,000 TPS (across replicas)

Webhook delivery:
  Events/day:                 ~86M (1K/s)
  Avg delivery attempts:      1.2 (20% retry rate)
  Webhook endpoints:          100K registered endpoints
```

---

## API Design

### Content Management API (REST)

```
# Content Type Management
POST   /v1/content-types                           Create content type
GET    /v1/content-types                           List content types
GET    /v1/content-types/{typeId}                  Get content type definition
PUT    /v1/content-types/{typeId}                  Update content type schema
DELETE /v1/content-types/{typeId}                  Delete content type (if no entries)

# Content Type Field Management
POST   /v1/content-types/{typeId}/fields           Add field to content type
PUT    /v1/content-types/{typeId}/fields/{fieldId}  Update field definition
DELETE /v1/content-types/{typeId}/fields/{fieldId}  Remove field

# Entry Management
POST   /v1/entries                                 Create entry
GET    /v1/entries                                 List entries (filter by type, status, locale)
GET    /v1/entries/{entryId}                       Get entry (latest version)
PUT    /v1/entries/{entryId}                       Update entry (creates new version)
DELETE /v1/entries/{entryId}                       Delete entry (soft delete)

# Entry Versions
GET    /v1/entries/{entryId}/versions               List all versions
GET    /v1/entries/{entryId}/versions/{versionNum}  Get specific version
POST   /v1/entries/{entryId}/versions/{versionNum}/restore  Restore to version

# Publishing
POST   /v1/entries/{entryId}/publish               Publish entry
POST   /v1/entries/{entryId}/unpublish             Unpublish entry
POST   /v1/entries/{entryId}/schedule              Schedule publish/unpublish
POST   /v1/entries/{entryId}/archive               Archive entry

# Asset Management
POST   /v1/assets/upload                           Upload asset (multipart)
GET    /v1/assets                                  List assets
GET    /v1/assets/{assetId}                        Get asset metadata
PUT    /v1/assets/{assetId}                        Update asset metadata
DELETE /v1/assets/{assetId}                        Delete asset
POST   /v1/assets/{assetId}/transform              Request transformation

# Workflow
POST   /v1/entries/{entryId}/submit-for-review     Submit to editorial queue
POST   /v1/entries/{entryId}/approve               Approve entry
POST   /v1/entries/{entryId}/reject                Reject with comments
GET    /v1/workflow/queue                           Get editorial review queue

# Webhooks
POST   /v1/webhooks                                Register webhook endpoint
GET    /v1/webhooks                                List webhooks
PUT    /v1/webhooks/{webhookId}                    Update webhook
DELETE /v1/webhooks/{webhookId}                    Remove webhook
GET    /v1/webhooks/{webhookId}/deliveries         View delivery history
```

### Content Management API - Request/Response Examples

```
POST /v1/content-types
Content-Type: application/json

Request:
{
  "name": "Blog Post",
  "api_identifier": "blog_post",
  "description": "Blog articles with rich content",
  "display_field": "title",
  "fields": [
    {
      "name": "title",
      "api_identifier": "title",
      "type": "text",
      "required": true,
      "localized": true,
      "validations": {
        "max_length": 200,
        "unique": true
      }
    },
    {
      "name": "slug",
      "api_identifier": "slug",
      "type": "text",
      "required": true,
      "localized": true,
      "validations": {
        "pattern": "^[a-z0-9-]+$",
        "unique": true
      }
    },
    {
      "name": "body",
      "api_identifier": "body",
      "type": "rich_text",
      "required": true,
      "localized": true
    },
    {
      "name": "featured_image",
      "api_identifier": "featured_image",
      "type": "media",
      "required": false,
      "validations": {
        "mime_types": ["image/jpeg", "image/png", "image/webp"],
        "max_file_size_mb": 10
      }
    },
    {
      "name": "author",
      "api_identifier": "author",
      "type": "reference",
      "reference_type": "author",
      "cardinality": "one"
    },
    {
      "name": "tags",
      "api_identifier": "tags",
      "type": "reference",
      "reference_type": "tag",
      "cardinality": "many"
    },
    {
      "name": "published_date",
      "api_identifier": "published_date",
      "type": "datetime"
    },
    {
      "name": "seo_metadata",
      "api_identifier": "seo_metadata",
      "type": "json",
      "schema": {
        "type": "object",
        "properties": {
          "meta_title": { "type": "string", "maxLength": 70 },
          "meta_description": { "type": "string", "maxLength": 160 },
          "canonical_url": { "type": "string", "format": "uri" }
        }
      }
    }
  ]
}

Response 201:
{
  "id": "ct_blog_post_001",
  "name": "Blog Post",
  "api_identifier": "blog_post",
  "fields": [ ... ],
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-01T10:00:00Z",
  "version": 1
}
```

```
PUT /v1/entries/entry_abc123
Content-Type: application/json

Request:
{
  "content_type": "blog_post",
  "fields": {
    "title": {
      "en": "Understanding Microservices Architecture",
      "zh": "理解微服务架构"
    },
    "slug": {
      "en": "understanding-microservices-architecture",
      "zh": "understanding-microservices-architecture-zh"
    },
    "body": {
      "en": {
        "type": "document",
        "content": [
          {
            "type": "paragraph",
            "content": [
              { "type": "text", "value": "Microservices is an architectural pattern..." }
            ]
          }
        ]
      }
    },
    "featured_image": { "asset_id": "asset_img_001" },
    "author": { "entry_id": "entry_author_042" },
    "tags": [
      { "entry_id": "entry_tag_arch" },
      { "entry_id": "entry_tag_backend" }
    ],
    "published_date": "2026-03-01T08:00:00Z",
    "seo_metadata": {
      "meta_title": "Understanding Microservices Architecture | Tech Blog",
      "meta_description": "A comprehensive guide to microservices..."
    }
  }
}

Response 200:
{
  "id": "entry_abc123",
  "content_type": "blog_post",
  "version": 5,
  "status": "draft",
  "fields": { ... },
  "created_at": "2026-02-15T09:00:00Z",
  "updated_at": "2026-03-01T11:30:00Z",
  "created_by": "user_042",
  "updated_by": "user_042"
}
```

### Content Delivery API (GraphQL)

```graphql
# Auto-generated schema from content type definitions

type BlogPost {
  id: ID!
  title(locale: Locale): String!
  slug(locale: Locale): String!
  body(locale: Locale): RichText!
  featuredImage: Asset
  author: Author!
  tags: [Tag!]!
  publishedDate: DateTime
  seoMetadata: JSON
  sys: SystemMetadata!
}

type Author {
  id: ID!
  name: String!
  bio(locale: Locale): String
  avatar: Asset
  posts(limit: Int, skip: Int): [BlogPost!]!
}

type Asset {
  id: ID!
  url: String!
  title: String
  description: String
  contentType: String!
  width: Int
  height: Int
  size: Int!
  url(transform: ImageTransformInput): String!
}

input ImageTransformInput {
  width: Int
  height: Int
  format: ImageFormat
  quality: Int
  fit: ImageFit
  focus: FocusArea
}

enum ImageFormat { WEBP AVIF JPG PNG }
enum ImageFit { FILL FIT CROP PAD SCALE }
enum Locale { en zh fr de ja es }

type SystemMetadata {
  id: ID!
  contentType: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  publishedAt: DateTime
  version: Int!
  locale: Locale!
}

type Query {
  # Single entry by ID
  blogPost(id: ID!, locale: Locale, preview: Boolean): BlogPost

  # Collection with filtering
  blogPostCollection(
    where: BlogPostFilter
    order: [BlogPostOrder!]
    limit: Int = 20
    skip: Int = 0
    locale: Locale
    preview: Boolean
  ): BlogPostCollection!

  # Generic entry lookup
  entry(id: ID!, locale: Locale, preview: Boolean): Entry

  # Asset lookup
  asset(id: ID!): Asset
  assetCollection(where: AssetFilter, limit: Int, skip: Int): AssetCollection!
}

input BlogPostFilter {
  title: StringFilter
  slug: StringFilter
  publishedDate: DateTimeFilter
  author: EntryFilter
  tags_contains: [ID!]
  AND: [BlogPostFilter!]
  OR: [BlogPostFilter!]
  NOT: BlogPostFilter
}

input StringFilter {
  eq: String
  ne: String
  contains: String
  starts_with: String
  in: [String!]
}

type BlogPostCollection {
  items: [BlogPost!]!
  total: Int!
  skip: Int!
  limit: Int!
}
```

### Content Delivery API (REST)

```
# Published content delivery
GET /v1/delivery/entries?content_type=blog_post&locale=en&limit=10&skip=0
GET /v1/delivery/entries/{entryId}?locale=en
GET /v1/delivery/entries?content_type=blog_post&fields.slug=my-post&locale=en

# Preview (draft content)
GET /v1/preview/entries/{entryId}?locale=en
    Header: Authorization: Bearer <preview_token>

# Asset delivery with on-the-fly transformation
GET /v1/assets/{assetId}/file?w=800&h=600&fit=crop&format=webp&quality=80

Response 200 (delivery):
{
  "items": [
    {
      "sys": {
        "id": "entry_abc123",
        "content_type": "blog_post",
        "created_at": "2026-02-15T09:00:00Z",
        "updated_at": "2026-03-01T11:30:00Z",
        "published_at": "2026-03-01T12:00:00Z",
        "version": 5,
        "locale": "en"
      },
      "fields": {
        "title": "Understanding Microservices Architecture",
        "slug": "understanding-microservices-architecture",
        "body": { ... },
        "featured_image": {
          "sys": { "id": "asset_img_001" },
          "url": "https://cdn.cms.com/assets/asset_img_001/image.webp",
          "width": 1200,
          "height": 630
        },
        "author": {
          "sys": { "id": "entry_author_042" },
          "fields": { "name": "Jane Smith" }
        },
        "tags": [
          { "sys": { "id": "entry_tag_arch" }, "fields": { "name": "Architecture" } },
          { "sys": { "id": "entry_tag_backend" }, "fields": { "name": "Backend" } }
        ]
      }
    }
  ],
  "total": 142,
  "skip": 0,
  "limit": 10
}
```

---

## Data Model

### Schema Design Approaches

Before defining tables, we must choose a schema strategy for storing user-defined content types with arbitrary fields.

```
Approach 1: Entity-Attribute-Value (EAV)
+-----------------------------------------------------------------------+
| Pros                              | Cons                              |
|-----------------------------------|-----------------------------------|
| Fully dynamic, no schema changes  | Complex queries (many JOINs)     |
| Add fields without ALTER TABLE    | No native type enforcement        |
| Works for any content structure   | Poor query performance at scale   |
| Used by: Magento, older CMSs     | Hard to index efficiently         |
+-----------------------------------------------------------------------+

Approach 2: JSON/JSONB Columns
+-----------------------------------------------------------------------+
| Pros                              | Cons                              |
|-----------------------------------|-----------------------------------|
| Flexible schema per entry         | Limited indexing (GIN index helps)|
| Single row per entry              | JSON schema validation in app    |
| Good query performance (JSONB)    | Complex queries with nested JSON |
| Used by: Strapi, many modern CMSs| Storage overhead for repeated keys|
+-----------------------------------------------------------------------+

Approach 3: Document Store (MongoDB)
+-----------------------------------------------------------------------+
| Pros                              | Cons                              |
|-----------------------------------|-----------------------------------|
| Native flexible schemas           | Weaker transaction support       |
| Excellent read performance        | No JOINs for references          |
| Schema validation built in        | Consistency model more complex   |
| Used by: Contentful, Payload CMS | Migration complexity              |
+-----------------------------------------------------------------------+

Approach 4: Hybrid (Metadata in SQL + Content in JSONB)  <-- RECOMMENDED
+-----------------------------------------------------------------------+
| Pros                              | Cons                              |
|-----------------------------------|-----------------------------------|
| System tables are relational      | Still need JSON path queries      |
| Content benefits from JSONB flex  | Schema validation in application  |
| References use FK integrity       | Two query patterns to maintain    |
| Indexing on common query fields   | Slightly higher complexity        |
+-----------------------------------------------------------------------+

Decision: Hybrid approach with PostgreSQL.
  - System metadata (types, users, workflows) in normalized relational tables
  - Content field values stored in JSONB columns
  - GIN indexes on JSONB for content queries
  - Separate reference table for explicit FK enforcement on content links
```

### Core SQL Schema

```sql
-- =============================================
-- SPACE / TENANT
-- =============================================
CREATE TABLE spaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',  -- free, pro, enterprise
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- CONTENT TYPES
-- =============================================
CREATE TABLE content_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    api_identifier  VARCHAR(100) NOT NULL,
    description     TEXT,
    display_field   VARCHAR(100),           -- which field to show as entry title
    version         INT NOT NULL DEFAULT 1,
    is_published    BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, api_identifier)
);

CREATE TABLE content_type_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type_id UUID NOT NULL REFERENCES content_types(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    api_identifier  VARCHAR(100) NOT NULL,
    field_type      VARCHAR(50) NOT NULL,   -- text, rich_text, number, boolean,
                                            -- datetime, media, reference, json,
                                            -- location, color, enum
    position        INT NOT NULL DEFAULT 0, -- field ordering in UI
    required        BOOLEAN NOT NULL DEFAULT false,
    localized       BOOLEAN NOT NULL DEFAULT false,
    disabled        BOOLEAN NOT NULL DEFAULT false,
    omitted         BOOLEAN NOT NULL DEFAULT false,  -- exclude from API response
    validations     JSONB NOT NULL DEFAULT '{}',
    default_value   JSONB,
    appearance      JSONB,                  -- UI widget configuration
    -- Reference-specific fields
    reference_type  VARCHAR(100),           -- target content_type api_identifier
    cardinality     VARCHAR(10),            -- 'one' or 'many'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (content_type_id, api_identifier)
);

CREATE INDEX idx_ct_fields_type ON content_type_fields(content_type_id);

-- =============================================
-- ENTRIES (Content Records)
-- =============================================
CREATE TABLE entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    content_type_id UUID NOT NULL REFERENCES content_types(id),
    -- Current state
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- draft, in_review, published, archived, deleted
    current_version INT NOT NULL DEFAULT 1,
    published_version INT,                  -- NULL if never published
    -- Denormalized content for fast reads (current draft version)
    fields          JSONB NOT NULL DEFAULT '{}',
    -- Published content snapshot (frozen at publish time)
    published_fields JSONB,
    -- Metadata
    created_by      UUID NOT NULL,
    updated_by      UUID NOT NULL,
    published_by    UUID,
    published_at    TIMESTAMPTZ,
    first_published_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ            -- soft delete
);

CREATE INDEX idx_entries_space_type ON entries(space_id, content_type_id);
CREATE INDEX idx_entries_status ON entries(space_id, status);
CREATE INDEX idx_entries_published ON entries(space_id, content_type_id)
    WHERE status = 'published';
CREATE INDEX idx_entries_fields ON entries USING GIN (fields jsonb_path_ops);
CREATE INDEX idx_entries_pub_fields ON entries USING GIN (published_fields jsonb_path_ops);

-- =============================================
-- ENTRY VERSIONS (Full Version History)
-- =============================================
CREATE TABLE entry_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    version_number  INT NOT NULL,
    fields          JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL,   -- status at time of version creation
    change_summary  TEXT,                   -- optional description of changes
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entry_id, version_number)
);

CREATE INDEX idx_versions_entry ON entry_versions(entry_id, version_number DESC);

-- Partition by created_at for efficient cleanup of old versions
-- CREATE TABLE entry_versions_2026_q1 PARTITION OF entry_versions
--     FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

-- =============================================
-- CONTENT REFERENCES (Explicit Link Table)
-- =============================================
CREATE TABLE entry_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    target_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    field_id        UUID NOT NULL REFERENCES content_type_fields(id),
    position        INT NOT NULL DEFAULT 0, -- ordering for many-references
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refs_source ON entry_references(source_entry_id, field_id);
CREATE INDEX idx_refs_target ON entry_references(target_entry_id);
-- Reverse lookup: "where is this entry referenced?"

-- =============================================
-- ASSETS (Media Files)
-- =============================================
CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    title           JSONB NOT NULL DEFAULT '{}',    -- localized: {"en": "Photo", "zh": "照片"}
    description     JSONB NOT NULL DEFAULT '{}',    -- localized
    file_name       VARCHAR(500) NOT NULL,
    content_type    VARCHAR(255) NOT NULL,           -- MIME type
    file_size       BIGINT NOT NULL,                 -- bytes
    storage_key     VARCHAR(1000) NOT NULL,          -- S3/GCS key
    cdn_url         VARCHAR(2000),
    -- Image-specific metadata
    width           INT,
    height          INT,
    -- Processing status
    processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending, processing, ready, failed
    -- Derived assets (thumbnails, transcoded versions)
    variants        JSONB NOT NULL DEFAULT '{}',
    -- Metadata extracted from file (EXIF, duration, etc.)
    file_metadata   JSONB NOT NULL DEFAULT '{}',
    -- Tags for organization
    tags            TEXT[] DEFAULT '{}',
    folder_path     VARCHAR(1000) DEFAULT '/',
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_space ON assets(space_id);
CREATE INDEX idx_assets_content_type ON assets(space_id, content_type);
CREATE INDEX idx_assets_tags ON assets USING GIN (tags);
CREATE INDEX idx_assets_folder ON assets(space_id, folder_path);

-- =============================================
-- WORKFLOW STATES
-- =============================================
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    steps           JSONB NOT NULL,         -- ordered list of workflow steps
    applies_to      UUID[],                 -- content_type IDs this workflow applies to
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_transitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES entries(id),
    from_status     VARCHAR(20) NOT NULL,
    to_status       VARCHAR(20) NOT NULL,
    actor_id        UUID NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wf_transitions_entry ON workflow_transitions(entry_id, created_at DESC);

-- =============================================
-- SCHEDULED ACTIONS
-- =============================================
CREATE TABLE scheduled_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    entry_id        UUID NOT NULL REFERENCES entries(id),
    action          VARCHAR(20) NOT NULL,   -- publish, unpublish, archive
    scheduled_for   TIMESTAMPTZ NOT NULL,
    executed_at     TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending, executed, cancelled, failed
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_pending ON scheduled_actions(scheduled_for)
    WHERE status = 'pending';

-- =============================================
-- WEBHOOKS
-- =============================================
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    url             VARCHAR(2000) NOT NULL,
    events          TEXT[] NOT NULL,        -- entry.publish, entry.unpublish, etc.
    headers         JSONB DEFAULT '{}',     -- custom headers (auth tokens)
    secret          VARCHAR(255),           -- HMAC signing secret
    is_active       BOOLEAN NOT NULL DEFAULT true,
    content_types   UUID[],                 -- filter: only trigger for these types
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES webhooks(id),
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    status_code     INT,
    response_body   TEXT,
    attempt_number  INT NOT NULL DEFAULT 1,
    delivered_at    TIMESTAMPTZ,
    next_retry_at   TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending, delivered, failed, retrying
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_del_pending ON webhook_deliveries(next_retry_at)
    WHERE status IN ('pending', 'retrying');

-- =============================================
-- USERS AND ROLES
-- =============================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    avatar_url      VARCHAR(2000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE space_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            VARCHAR(50) NOT NULL,   -- admin, editor, author, viewer
    permissions     JSONB NOT NULL DEFAULT '{}',
    -- Per content-type overrides:
    -- { "blog_post": { "can_publish": true }, "page": { "can_edit": false } }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, user_id)
);

-- =============================================
-- LOCALES
-- =============================================
CREATE TABLE space_locales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    locale_code     VARCHAR(10) NOT NULL,   -- en, en-US, zh-CN, fr-FR
    name            VARCHAR(100) NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    fallback_locale VARCHAR(10),            -- fallback chain: zh-CN -> zh -> en
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, locale_code)
);

-- =============================================
-- AUDIT LOG
-- =============================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,   -- entry, asset, content_type, webhook
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,   -- create, update, publish, delete, etc.
    actor_id        UUID NOT NULL,
    changes         JSONB,                  -- diff of what changed
    metadata        JSONB DEFAULT '{}',     -- IP, user agent, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_space ON audit_logs(space_id, created_at DESC);
```

### JSONB Field Storage Example

```
Entry fields column stores localized content as nested JSON:

{
  "title": {
    "en": "Understanding Microservices",
    "zh": "理解微服务"
  },
  "slug": {
    "en": "understanding-microservices",
    "zh": "li-jie-wei-fu-wu"
  },
  "body": {
    "en": {
      "type": "document",
      "content": [
        {
          "type": "heading",
          "attrs": { "level": 2 },
          "content": [{ "type": "text", "text": "Introduction" }]
        },
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Microservices is..." }]
        }
      ]
    }
  },
  "published_date": "2026-03-01T08:00:00Z",
  "featured_image": "asset_img_001",
  "author": "entry_author_042",
  "tags": ["entry_tag_arch", "entry_tag_backend"],
  "seo_metadata": {
    "meta_title": "Understanding Microservices | Tech Blog",
    "meta_description": "A comprehensive guide..."
  }
}

Query examples with JSONB:

-- Find all blog posts with title containing "microservices" in English
SELECT * FROM entries
WHERE content_type_id = 'ct_blog_post'
  AND status = 'published'
  AND fields->'title'->>'en' ILIKE '%microservices%';

-- Find entries by reference
SELECT * FROM entries
WHERE fields->'author' = '"entry_author_042"';

-- GIN index query for array contains
SELECT * FROM entries
WHERE fields->'tags' @> '["entry_tag_arch"]'::jsonb;
```

---

## High-Level Architecture

```
+-------------------------------------------------------------------+
|                         CLIENTS                                    |
|  +----------+  +----------+  +--------+  +---------+  +---------+ |
|  | Admin UI |  | Web App  |  | Mobile |  |   SSG   |  |   IoT   | |
|  | (React)  |  | (Next.js)|  |  App   |  | (Gatsby)|  | Device  | |
|  +----+-----+  +----+-----+  +---+----+  +----+----+  +----+----+ |
+-------|-------------|-------------|-------------|-------------|-----+
        |             |             |             |             |
        v             v             v             v             v
+-------+-------------+-------------+-------------+-------------+---+
|                          CDN / Edge Layer                          |
|  (CloudFront / Fastly / Cloudflare)                               |
|  - Cache delivery API responses (TTL-based + surrogate keys)      |
|  - Image transformation at edge (Cloudflare Images / imgproxy)    |
|  - Serve static assets (media files)                              |
+--+------------------------------+--+------------------------------+
   |                              |  |
   | Cache Miss                   |  | Always (no cache for writes)
   v                              |  v
+--+---------------------------+  |  +------------------------------+
|   Content Delivery API       |  |  |   Content Management API     |
|   (Read-only, high-perf)     |  |  |   (CRUD, auth, validation)   |
|                              |  |  |                              |
|   - REST + GraphQL           |  |  |   - REST endpoints           |
|   - Response caching (Redis) |  |  |   - Schema validation        |
|   - Reference resolution     |  |  |   - Versioning               |
|   - Locale negotiation       |  |  |   - Permission enforcement   |
|   - Query optimization       |  |  |   - Audit logging            |
+--+---------------------------+  |  +--+--+--+---------------------+
   |                              |     |  |  |
   |                              |     |  |  +-----> Webhook Service
   |                              |     |  |         (async delivery,
   |                              |     |  |          retry, signing)
   |                              |     |  |
   |  +---------------------------+     |  +-----> Scheduled Action
   |  |                                 |          Worker (cron-based,
   |  |                                 |          publish/unpublish)
   v  v                                 v
+--+--+--+     +------------------+  +--+------------------+
| Read   |     | Search Index     |  | Media Asset         |
| Replicas|<---| (Elasticsearch)  |  | Pipeline            |
| (PG)   |    |                  |  |                     |
+--+-----+    | - Full-text      |  | - Upload service    |
   |          | - Faceted filter |  | - Image processor   |
   |          | - Autocomplete   |  |   (Sharp/imgproxy)  |
   v          +------------------+  | - Video transcoder  |
+--+-----+                         |   (FFmpeg/MediaConvert)
| Primary |                         | - CDN invalidation  |
| DB (PG) |                         +--+------------------+
| - Entries|                            |
| - Types  |                            v
| - Users  |                         +--+------------------+
| - Audit  |                         | Object Storage      |
+----------+                         | (S3 / GCS)          |
                                     | - Original files    |
   +-------------------+             | - Derived variants  |
   | Cache Layer        |             +---------------------+
   | (Redis Cluster)    |
   |                    |
   | - Delivery cache   |            +---------------------+
   | - Session store    |            | Preview Service     |
   | - Rate limiting    |            | - Draft rendering   |
   | - CDN tag mapping  |            | - Token-gated access|
   +-------------------+             +---------------------+
```

### Request Flow: Content Delivery

```
Client requests: GET /v1/delivery/entries?content_type=blog_post&locale=en

1. CDN Layer
   - Check cache: key = hash(path + query + locale)
   - Cache HIT (90%): return cached response (< 10ms)
   - Cache MISS: forward to origin

2. Content Delivery API
   - Parse query parameters (content_type, filters, locale, pagination)
   - Check Redis cache for exact query match
   - Redis HIT: return cached response
   - Redis MISS: query database

3. Database Query
   - Query read replica:
     SELECT id, published_fields, published_at
     FROM entries
     WHERE space_id = $1
       AND content_type_id = $2
       AND status = 'published'
       AND deleted_at IS NULL
     ORDER BY published_at DESC
     LIMIT $3 OFFSET $4
   - Resolve references (batch load referenced entries)
   - Apply locale resolution (fallback chain)

4. Response Assembly
   - Build JSON/GraphQL response
   - Set Cache-Control headers: max-age=60, s-maxage=3600
   - Set Surrogate-Key headers for targeted invalidation
   - Store in Redis (TTL = 5 minutes)
   - Return to CDN (CDN caches for s-maxage duration)
```

### Request Flow: Content Publishing

```
Editor publishes entry via Admin UI: POST /v1/entries/{entryId}/publish

1. Management API
   - Authenticate user (JWT)
   - Authorize: check role has publish permission for this content type
   - Validate entry: all required fields present, references valid

2. Database Transaction
   BEGIN;
     -- Create version snapshot
     INSERT INTO entry_versions (entry_id, version_number, fields, status, created_by)
     VALUES ($1, $2, $3, 'published', $4);

     -- Update entry
     UPDATE entries SET
       status = 'published',
       published_fields = fields,       -- freeze current fields as published
       published_version = current_version,
       published_by = $4,
       published_at = NOW(),
       first_published_at = COALESCE(first_published_at, NOW());

     -- Log audit
     INSERT INTO audit_logs (space_id, entity_type, entity_id, action, actor_id)
     VALUES ($5, 'entry', $1, 'publish', $4);
   COMMIT;

3. Post-Publish Events (async via message queue)
   - Invalidate CDN cache (surrogate key purge)
   - Invalidate Redis cache for affected queries
   - Update Elasticsearch index
   - Trigger webhooks (entry.publish event)
   - Notify SSG rebuild (if configured)

4. Response
   - Return updated entry with status = 'published'
```

---

## Deep Dive: Content Modeling

### Dynamic Schema Definition

Content types are defined at runtime by CMS users (developers or content architects), not hardcoded. The system must validate and enforce these dynamic schemas.

```
Content Type Registration Flow:

1. User defines content type via Admin UI or API
2. System validates field definitions:
   - No duplicate api_identifiers
   - Reference fields point to existing content types
   - Validation rules are valid for field type
   - No circular required references
3. Store content type definition in content_types + content_type_fields tables
4. Generate GraphQL schema fragment (for delivery API)
5. Update Elasticsearch mapping (for search)

Schema Validation at Entry Write Time:

  function validateEntry(entry, contentType):
    for each field in contentType.fields:
      value = entry.fields[field.api_identifier]

      // Required check
      if field.required and value is null/missing:
        error("Field '{field.name}' is required")

      // Type check
      if value is not null:
        validateFieldType(field.field_type, value)

      // Localization check
      if field.localized:
        for each locale in value:
          if locale not in space.active_locales:
            error("Unknown locale '{locale}'")

      // Custom validations
      for each validation in field.validations:
        applyValidation(validation, value)

  function validateFieldType(type, value):
    switch type:
      case 'text':       assert typeof value == 'string' (or object if localized)
      case 'rich_text':  assert valid rich text document structure
      case 'number':     assert typeof value == 'number'
      case 'boolean':    assert typeof value == 'boolean'
      case 'datetime':   assert valid ISO 8601 string
      case 'media':      assert asset exists with given ID
      case 'reference':  assert target entry exists and matches reference_type
      case 'json':       assert valid against field's JSON schema
      case 'location':   assert { lat: number, lon: number }
      case 'enum':       assert value in field.validations.allowed_values
```

### Field Types and Storage

```
+---------------+------------------+------------------------------------+
| Field Type    | JSONB Storage    | Validation Rules                   |
+---------------+------------------+------------------------------------+
| text          | "string value"   | min/max_length, pattern (regex),   |
|               |                  | unique, prohibited_values          |
+---------------+------------------+------------------------------------+
| rich_text     | { document AST } | max_length (text only), allowed    |
|               |                  | node types, embedded entry types   |
+---------------+------------------+------------------------------------+
| number        | 42 or 3.14       | min, max, integer_only             |
+---------------+------------------+------------------------------------+
| boolean       | true/false       | (none)                             |
+---------------+------------------+------------------------------------+
| datetime      | "ISO 8601"       | min_date, max_date                 |
+---------------+------------------+------------------------------------+
| media         | "asset_id"       | mime_types, max_file_size,         |
|               |                  | min/max dimensions                 |
+---------------+------------------+------------------------------------+
| reference     | "entry_id" or    | allowed content types,             |
|               | ["id1", "id2"]   | min/max items (for many)           |
+---------------+------------------+------------------------------------+
| json          | { arbitrary }    | JSON schema validation             |
+---------------+------------------+------------------------------------+
| location      | {lat, lon}       | bounding box                       |
+---------------+------------------+------------------------------------+
| enum          | "value"          | allowed_values list                |
+---------------+------------------+------------------------------------+
| color         | "#FF5733"        | format (hex, rgb, hsl)             |
+---------------+------------------+------------------------------------+
```

### Content Relationships

```
Reference Types:

1. ONE-TO-ONE (cardinality: "one")
   Blog Post -> Author
   Stored as: "author": "entry_author_042"
   + entry_references row for FK integrity

2. ONE-TO-MANY (cardinality: "many")
   Blog Post -> Tags
   Stored as: "tags": ["entry_tag_1", "entry_tag_2"]
   + entry_references rows (one per target, with position)

3. EMBEDDED ENTRY (within rich text)
   Rich text can embed references to other entries inline:
   {
     "type": "embedded-entry",
     "attrs": { "entry_id": "entry_code_block_001", "type": "code_snippet" }
   }

4. BIDIRECTIONAL (virtual)
   Not stored explicitly. Computed via reverse lookup:
   "Find all entries that reference Author X"
   SELECT source_entry_id FROM entry_references
   WHERE target_entry_id = 'entry_author_042';

Reference Integrity on Delete:
+---------------------+---------------------------------------------+
| Strategy            | Behavior                                     |
+---------------------+---------------------------------------------+
| RESTRICT (default)  | Cannot delete entry if referenced elsewhere  |
| SET_NULL            | Set reference field to null in referencing    |
|                     | entries                                       |
| CASCADE             | Delete referencing entries (dangerous)        |
| SOFT_DELETE         | Mark as deleted but keep reference intact     |
+---------------------+---------------------------------------------+

Reference Resolution (Delivery API):
  When returning an entry, resolve references to a configurable depth:
  - include=1 (default): return referenced entries one level deep
  - include=5 (max): resolve up to 5 levels of nested references
  - Circular reference detection: track visited entry IDs, stop if revisited

  Batch resolution to avoid N+1:
    1. Collect all referenced entry IDs from response
    2. Batch load: SELECT * FROM entries WHERE id IN ($1, $2, ...)
    3. Assemble into response tree
```

### Content Type Migrations

```
When a content type schema changes, existing entries may need migration.

Migration Types:

1. ADDITIVE (safe, no migration needed):
   - Add new optional field
   - Increase max_length validation
   - Add new allowed enum value

2. RESTRICTIVE (needs validation pass):
   - Add new required field (must provide default or backfill)
   - Decrease max_length
   - Remove allowed enum value
   - Change field type

3. DESTRUCTIVE (data loss risk):
   - Remove a field
   - Rename a field

Migration Workflow:
+------------------+     +------------------+     +------------------+
| Detect Schema    |---->| Generate         |---->| Apply Migration  |
| Change           |     | Migration Plan   |     | (Background Job) |
+------------------+     +------------------+     +------------------+
                                                         |
                           +-----------------------------+
                           |
                           v
                    +------+-------+
                    | Validate All |
                    | Entries      |
                    +--------------+

Example: Add required field "category" with default value:

  Step 1: Add field as optional (no migration needed)
  Step 2: Background job: UPDATE entries
          SET fields = jsonb_set(fields, '{category}', '"general"')
          WHERE content_type_id = $1
            AND NOT (fields ? 'category');
  Step 3: Mark field as required
  Step 4: Rebuild Elasticsearch index for this content type
```

---

## Deep Dive: Versioning & Publishing

### Entry Lifecycle State Machine

```
                    +---> [in_review] ---+
                    |         |          |
                    |    reject|     approve
                    |         v          |
[new] --create--> [draft] <--+          |
                    |                    |
                    +----publish---------+----> [published]
                    |                              |
                    |                         unpublish
                    |                              |
                    +<-----------------------------+
                    |
                archive
                    |
                    v
               [archived]
                    |
                 delete
                    |
                    v
               [deleted] (soft, recoverable for 30 days)

State Transitions:
+-------------------+-------------------+----------------------+
| From              | To                | Required Role        |
+-------------------+-------------------+----------------------+
| (new)             | draft             | author, editor, admin|
| draft             | in_review         | author, editor, admin|
| draft             | published         | editor, admin        |
| in_review         | draft (rejected)  | editor, admin        |
| in_review         | published         | editor, admin        |
| published         | draft (unpublish) | editor, admin        |
| published         | archived          | admin                |
| draft/published   | archived          | admin                |
| archived          | draft             | admin                |
| any               | deleted           | admin                |
+-------------------+-------------------+----------------------+
```

### Version Management

```
Every mutation to an entry creates a new version:

Entry: "Blog Post about Microservices"
+----------+----------+-----------+------------+------------------+
| Version  | Status   | Actor     | Timestamp  | Change Summary   |
+----------+----------+-----------+------------+------------------+
| v1       | draft    | alice     | Mar 1 9:00 | Created entry    |
| v2       | draft    | alice     | Mar 1 10:00| Updated title    |
| v3       | draft    | alice     | Mar 1 11:00| Added body text  |
| v4       | in_review| alice     | Mar 1 12:00| Submitted review |
| v5       | draft    | bob       | Mar 1 14:00| Rejected: needs  |
|          |          |           |            | more detail      |
| v6       | draft    | alice     | Mar 1 16:00| Revised body     |
| v7       | published| bob       | Mar 2 09:00| Published        |
| v8       | draft    | alice     | Mar 3 10:00| Updated for      |
|          |          |           |            | new info (draft) |
| v9       | published| bob       | Mar 3 14:00| Re-published     |
+----------+----------+-----------+------------+------------------+

Key insight: "published_fields" on the entries table is a frozen snapshot.
When the author edits a published entry, "fields" (draft) diverges from
"published_fields" (live). The published version stays live until the
next explicit publish action.

Version Diff Comparison:

  GET /v1/entries/{entryId}/versions/diff?from=6&to=9

  Response:
  {
    "from_version": 6,
    "to_version": 9,
    "changes": [
      {
        "field": "title",
        "locale": "en",
        "type": "modified",
        "old_value": "Understanding Microservices",
        "new_value": "Understanding Microservices Architecture"
      },
      {
        "field": "body",
        "locale": "en",
        "type": "modified",
        "diff": [
          { "op": "equal", "text": "Microservices is an architectural..." },
          { "op": "insert", "text": "\n\nNew section about service mesh..." },
          { "op": "delete", "text": "Old conclusion paragraph..." }
        ]
      },
      {
        "field": "tags",
        "type": "modified",
        "added": ["entry_tag_service_mesh"],
        "removed": []
      }
    ]
  }
```

### Version Storage Optimization

```
Naive approach: Store full JSONB fields for every version.
  100M entries x 20 versions x 5KB = 10TB (expensive)

Optimization strategies:

1. DELTA COMPRESSION
   Store only the diff between consecutive versions:
   Version 1: full fields (5KB)
   Version 2: diff from v1 (200B) — only changed fields
   Version 3: diff from v2 (150B)
   ...
   Version N: periodic full snapshot (every 10 versions)

   Reconstruct version K:
     Find nearest snapshot <= K
     Apply diffs forward to K

   Storage savings: ~80% for typical edit patterns

2. TIERED STORAGE
   Recent versions (last 30 days):  PostgreSQL (hot, fast access)
   Older versions (30d-1y):         S3 (warm, acceptable latency)
   Archive (> 1 year):              S3 Glacier (cold, rare access)

   Background job migrates versions between tiers.

3. SNAPSHOT STRATEGY
   Keep full snapshots at:
   - Every published version (always stored in full)
   - Every 10th version (for efficient reconstruction)
   - Most recent version (always full for fast reads)
   All other versions: delta-compressed
```

### Scheduled Publishing

```
Scheduled Action Worker:

  Runs every 30 seconds (or triggered by scheduler like pg_cron):

  poll_loop:
    SELECT * FROM scheduled_actions
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED;    -- concurrent-safe with multiple workers

    for each action:
      try:
        if action.action == 'publish':
          publishEntry(action.entry_id, system_user_id)
        elif action.action == 'unpublish':
          unpublishEntry(action.entry_id, system_user_id)

        UPDATE scheduled_actions
        SET status = 'executed', executed_at = NOW()
        WHERE id = action.id;

      catch error:
        UPDATE scheduled_actions
        SET status = 'failed'
        WHERE id = action.id;

        log_error(action, error)

Scheduling API:

  POST /v1/entries/{entryId}/schedule
  {
    "action": "publish",
    "scheduled_for": "2026-03-15T06:00:00Z",  // 6 AM UTC
    "timezone": "America/New_York"              // for display
  }

  Response:
  {
    "id": "sched_001",
    "entry_id": "entry_abc123",
    "action": "publish",
    "scheduled_for": "2026-03-15T06:00:00Z",
    "status": "pending"
  }

Edge Cases:
  - Entry is manually published before schedule fires: cancel scheduled action
  - Entry is deleted before schedule fires: cancel and log
  - Worker crashes mid-execution: FOR UPDATE SKIP LOCKED prevents double processing;
    action remains pending and is picked up on next poll cycle
  - Clock skew between workers: use database time (NOW()), not application time
```

---

## Deep Dive: Editorial Workflow

### Multi-Stage Approval Pipeline

```
Workflow Definition (stored as JSON in workflows table):

{
  "name": "Enterprise Blog Review",
  "steps": [
    {
      "id": "step_draft",
      "name": "Draft",
      "status": "draft",
      "allowed_roles": ["author", "editor", "admin"],
      "transitions": [
        { "to": "step_editorial_review", "action": "submit_for_review" }
      ]
    },
    {
      "id": "step_editorial_review",
      "name": "Editorial Review",
      "status": "in_review",
      "assignee_role": "editor",
      "sla_hours": 24,
      "transitions": [
        { "to": "step_legal_review", "action": "approve" },
        { "to": "step_draft", "action": "reject", "requires_comment": true }
      ]
    },
    {
      "id": "step_legal_review",
      "name": "Legal Review",
      "status": "in_review",
      "assignee_role": "legal_reviewer",
      "sla_hours": 48,
      "transitions": [
        { "to": "step_published", "action": "approve" },
        { "to": "step_draft", "action": "reject", "requires_comment": true }
      ]
    },
    {
      "id": "step_published",
      "name": "Published",
      "status": "published",
      "transitions": [
        { "to": "step_draft", "action": "unpublish" }
      ]
    }
  ]
}

Workflow Visualization:

  [Draft] --submit--> [Editorial Review] --approve--> [Legal Review] --approve--> [Published]
     ^                      |                              |                          |
     |                  reject                          reject                    unpublish
     +----------------------+------------------------------+--------------------------+
```

### Role-Based Access Control

```
Permission Matrix:

+---------------------+--------+--------+--------+-------+---------+
| Action              | Viewer | Author | Editor | Admin | Custom  |
+---------------------+--------+--------+--------+-------+---------+
| View published      |   YES  |  YES   |  YES   |  YES  | config  |
| View drafts         |   NO   |  OWN   |  YES   |  YES  | config  |
| Create entries      |   NO   |  YES   |  YES   |  YES  | config  |
| Edit entries        |   NO   |  OWN   |  YES   |  YES  | config  |
| Submit for review   |   NO   |  OWN   |  YES   |  YES  | config  |
| Approve/reject      |   NO   |  NO    |  YES   |  YES  | config  |
| Publish             |   NO   |  NO    |  YES   |  YES  | config  |
| Delete entries      |   NO   |  NO    |  NO    |  YES  | config  |
| Manage content types|   NO   |  NO    |  NO    |  YES  | config  |
| Manage users        |   NO   |  NO    |  NO    |  YES  | config  |
| Manage webhooks     |   NO   |  NO    |  NO    |  YES  | config  |
| Upload assets       |   NO   |  YES   |  YES   |  YES  | config  |
| Delete assets       |   NO   |  OWN   |  YES   |  YES  | config  |
+---------------------+--------+--------+--------+-------+---------+

"OWN" = only for entries/assets created by this user

Per-Content-Type Overrides (stored in space_memberships.permissions):

  User "alice" has role "author" but with overrides:
  {
    "blog_post": { "can_publish": true },   -- alice can publish blog posts
    "legal_page": { "can_edit": false }      -- alice cannot edit legal pages
  }

Permission Check Algorithm:

  function canPerform(user, action, entry):
    membership = getSpaceMembership(user, entry.space_id)

    // Check per-content-type override first
    override = membership.permissions[entry.content_type.api_identifier]
    if override and override[action] is defined:
      return override[action]

    // Fall back to role-based permission
    return ROLE_PERMISSIONS[membership.role][action]

    // Special case: "OWN" means only for entries created by this user
    if permission == "OWN":
      return entry.created_by == user.id
```

### Comments and Change Requests

```
Comment Model (attached to entries, specific fields, or versions):

CREATE TABLE entry_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES entries(id),
    parent_id       UUID REFERENCES entry_comments(id),  -- threaded replies
    author_id       UUID NOT NULL REFERENCES users(id),
    -- Anchor: where in the entry this comment applies
    field_path      VARCHAR(255),     -- e.g., "body.en" or "title.zh"
    version_number  INT,              -- version this comment was made on
    -- Content
    body            TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
                    -- open, resolved, wont_fix
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

Comment Flow in Workflow:

  1. Editor reviews entry v6
  2. Editor adds comment on "body.en" field:
     "The third paragraph needs a source citation."
  3. Entry is rejected with comment, transitions back to draft
  4. Author sees comments, edits content, marks comment as resolved
  5. Author resubmits for review (creates v7)
  6. Editor sees resolved comments, verifies fix, approves

Notification System:
  Events that trigger notifications:
  - Entry submitted for review -> notify editors
  - Entry approved/rejected -> notify author
  - Comment added -> notify entry author and other commenters
  - Approaching SLA deadline -> notify assigned reviewer
  - Entry published -> notify author

  Delivered via:
  - In-app notification feed
  - Email digest (configurable frequency)
  - Slack/Teams webhook integration
```

---

## Deep Dive: Media Asset Pipeline

### Upload Flow

```
Upload Architecture (Direct-to-Storage):

Client                  API Server             Object Storage (S3)
  |                        |                        |
  |  1. Request upload URL |                        |
  |  POST /v1/assets/upload|                        |
  |  { filename, size,     |                        |
  |    content_type }      |                        |
  |----------------------->|                        |
  |                        |  2. Generate presigned  |
  |                        |     PUT URL             |
  |                        |----------------------->|
  |                        |  3. Return presigned URL|
  |                        |<-----------------------|
  |  4. Presigned URL +    |                        |
  |     asset_id           |                        |
  |<-----------------------|                        |
  |                                                 |
  |  5. Upload file directly to S3                  |
  |  PUT presigned_url     |                        |
  |------------------------------------------------>|
  |                        |                        |
  |  6. Upload complete    |                        |
  |  POST /v1/assets/{id}/ |                        |
  |    confirm             |                        |
  |----------------------->|                        |
  |                        |  7. Verify file exists  |
  |                        |----------------------->|
  |                        |  8. Enqueue processing  |
  |                        |---> [Processing Queue]  |
  |  9. Asset confirmed    |                        |
  |<-----------------------|                        |

Benefits of direct-to-storage:
  - API server never handles large file bytes
  - S3 handles multipart upload for large files (> 100MB)
  - Client shows upload progress bar
  - Reduces API server bandwidth and memory pressure
```

### Image Processing Pipeline

```
Processing Queue Worker:

  On receiving asset processing job:

  1. Download original from S3
  2. Extract metadata (EXIF, dimensions, color profile)
  3. Generate variants based on asset type:

  Image Variants:
  +--------------------+----------+--------+---------+
  | Variant            | Width    | Format | Quality |
  +--------------------+----------+--------+---------+
  | thumbnail          | 150px    | webp   | 80      |
  | small              | 400px    | webp   | 80      |
  | medium             | 800px    | webp   | 85      |
  | large              | 1200px   | webp   | 85      |
  | xlarge             | 2000px   | webp   | 90      |
  | original_webp      | original | webp   | 90      |
  | original_avif      | original | avif   | 80      |
  +--------------------+----------+--------+---------+

  4. Upload variants to S3 with predictable key pattern:
     s3://assets/{space_id}/{asset_id}/original.{ext}
     s3://assets/{space_id}/{asset_id}/thumb_150.webp
     s3://assets/{space_id}/{asset_id}/w800.webp
     s3://assets/{space_id}/{asset_id}/w1200.webp

  5. Update asset record:
     UPDATE assets SET
       processing_status = 'ready',
       width = $1,
       height = $2,
       file_metadata = $3,
       variants = $4
     WHERE id = $5;

  variants JSONB:
  {
    "thumbnail": {
      "url": "https://cdn.cms.com/assets/.../thumb_150.webp",
      "width": 150,
      "height": 100,
      "size": 8420,
      "format": "webp"
    },
    "medium": {
      "url": "https://cdn.cms.com/assets/.../w800.webp",
      "width": 800,
      "height": 533,
      "size": 45200,
      "format": "webp"
    }
    // ... more variants
  }
```

### On-the-Fly Image Transformation

```
For dynamic transformations not covered by pre-generated variants:

URL-based transformation (similar to Contentful Images API):

  https://cdn.cms.com/assets/{assetId}/file?w=600&h=400&fit=crop&format=webp&q=85

Processing:
  1. CDN receives request
  2. CDN checks cache for this exact transformation
  3. Cache MISS: forward to image transformation service (imgproxy / Cloudinary)
  4. Transformation service:
     a. Fetch original from S3
     b. Apply transformations using libvips (via imgproxy) or Sharp
     c. Return transformed image
  5. CDN caches transformed image (TTL = 30 days)

Supported Transformations:
+------------------+------------------------------------------+
| Parameter        | Description                              |
+------------------+------------------------------------------+
| w (width)        | Target width in pixels                   |
| h (height)       | Target height in pixels                  |
| fit              | fill, contain, cover, crop, pad, scale   |
| format           | webp, avif, jpg, png, auto               |
| q (quality)      | 1-100 (default 85)                       |
| focus            | face, center, top, bottom, left, right   |
| blur             | Gaussian blur radius (0-100)             |
| sharpen          | Unsharp mask amount                      |
| bg               | Background color for pad mode            |
+------------------+------------------------------------------+

format=auto: Content negotiation based on Accept header
  If browser supports AVIF -> serve AVIF
  Else if browser supports WebP -> serve WebP
  Else -> serve JPEG

Security:
  - URL signing to prevent abuse: ?w=600&h=400&sig=hmac_sha256(secret, params)
  - Rate limit: max 100 unique transformations per asset per hour
  - Max dimensions: 4096x4096 to prevent resource exhaustion
```

### Video Transcoding

```
Video Processing Pipeline:

  1. Upload video to S3 (via presigned URL, supports multipart)
  2. Enqueue transcoding job to dedicated video queue

  Transcoding Worker (using FFmpeg or AWS MediaConvert):

  Input: original.mp4 (H.264, 1080p, 50MB)

  Output variants:
  +--------------------+----------+---------+----------+---------+
  | Variant            | Resolution| Codec  | Bitrate  | Format  |
  +--------------------+----------+---------+----------+---------+
  | adaptive_hls       | multi    | H.264   | adaptive | HLS     |
  |   - 1080p          | 1920x1080| H.264   | 5 Mbps   | .ts     |
  |   - 720p           | 1280x720 | H.264   | 2.5 Mbps | .ts     |
  |   - 480p           | 854x480  | H.264   | 1 Mbps   | .ts     |
  |   - 360p           | 640x360  | H.264   | 600 Kbps | .ts     |
  | mp4_720p           | 1280x720 | H.264   | 2.5 Mbps | .mp4    |
  | thumbnail          | 400x225  | -       | -        | .webp   |
  | poster             | 1280x720 | -       | -        | .webp   |
  +--------------------+----------+---------+----------+---------+

  3. Generate HLS manifest (.m3u8) for adaptive bitrate streaming
  4. Extract poster frame and thumbnail at multiple timestamps
  5. Upload all variants to S3
  6. Update asset record with variant URLs and metadata
  7. Trigger CDN warmup for frequently accessed variants

  Processing time estimates:
    1080p 60s video: ~2-5 minutes (GPU-accelerated)
    1080p 10min video: ~10-20 minutes
    4K 30min video: ~45-90 minutes
```

---

## Deep Dive: Content Delivery

### Headless API Architecture

```
The CMS exposes two separate APIs with different characteristics:

+---------------------------+---------------------------+
| Content Management API    | Content Delivery API      |
+---------------------------+---------------------------+
| Read-write                | Read-only                 |
| Authenticated (JWT)       | API key or public         |
| Drafts + published        | Published content only    |
| No caching                | Aggressively cached       |
| 99.9% availability        | 99.99% availability       |
| < 500ms P99              | < 50ms P99 (CDN hit)     |
| 1K writes/s              | 100K reads/s             |
| Runs on: 5-10 instances  | Runs on: 20-50 instances |
+---------------------------+---------------------------+

Delivery API is deployed as a separate service with its own:
  - Database read replicas (no writes)
  - Redis cache cluster
  - Auto-scaling group (scale on QPS)
  - CDN configuration
```

### Static Site Generation Integration

```
SSG Integration Pattern (Next.js / Gatsby / Hugo):

Build-time fetching:
  1. SSG build triggers: fetch all published entries from Delivery API
  2. For each page, resolve content + references
  3. Generate static HTML files
  4. Deploy to CDN (Vercel, Netlify, CloudFront)

Webhook-triggered rebuild:
  CMS publishes entry
    -> Webhook fires: POST https://api.vercel.com/v1/deployments
       { "trigger": "cms_publish", "entry_id": "..." }
    -> SSG rebuilds only affected pages (ISR)
    -> New static files deployed

Next.js ISR (Incremental Static Regeneration):

  // pages/blog/[slug].tsx
  export async function getStaticProps({ params }) {
    const entry = await cmsClient.getEntry({
      content_type: 'blog_post',
      'fields.slug': params.slug,
      locale: 'en'
    })
    return {
      props: { post: entry },
      revalidate: 60  // regenerate every 60 seconds
    }
  }

On-Demand Revalidation (triggered by webhook):

  // pages/api/revalidate.ts
  export default async function handler(req, res) {
    const { entry_id, content_type, slug } = req.body

    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Revalidate the specific page
    await res.revalidate(`/blog/${slug}`)
    return res.json({ revalidated: true })
  }

Content Delivery Flow for SSG:

  [CMS Publish] -> [Webhook] -> [SSG Build/Revalidate] -> [CDN Deploy]
                                        |
                                        v
                               [Static HTML on CDN]
                                        |
                                        v
                               [User sees updated page]

  Total latency from publish to user-visible:
    Webhook delivery:        ~5 seconds
    ISR revalidation:        ~10-30 seconds
    CDN propagation:         ~5-30 seconds
    Total:                   ~20-65 seconds
```

### Edge Caching Strategy

```
Cache Hierarchy:

  Layer 1: CDN Edge Cache (Fastly / CloudFront)
    - Cache key: hash(path + query_params + locale + Accept header)
    - TTL: controlled by s-maxage header
    - Invalidation: surrogate key purge on publish/unpublish

  Layer 2: Application Cache (Redis)
    - Cache key: hash(query + filters + locale + version_tag)
    - TTL: 5 minutes
    - Invalidation: explicit on write

  Layer 3: Database Read Replica
    - Replication lag: < 100ms
    - Serves all cache-miss queries

Surrogate Key Strategy (for targeted CDN purge):

  Every delivery API response includes Surrogate-Key header:

  GET /v1/delivery/entries?content_type=blog_post

  Response headers:
    Surrogate-Key: space_abc type_blog_post entry_001 entry_002 entry_003
    Cache-Control: public, max-age=60, s-maxage=3600

  When entry_001 is published/unpublished:
    Purge all CDN objects with surrogate key "entry_001"
    This invalidates:
      - The entry detail page
      - Any collection pages that included this entry
      - Any page that referenced this entry

  CDN purge is fast (Fastly: < 150ms globally)

Cache-Control Headers:
+------------------------+-----------------------------------------+
| Endpoint               | Cache-Control                           |
+------------------------+-----------------------------------------+
| Collection (list)      | public, max-age=60, s-maxage=3600       |
| Single entry           | public, max-age=60, s-maxage=86400      |
| Asset file             | public, max-age=31536000, immutable     |
| Preview API            | private, no-cache, no-store             |
| GraphQL                | public, max-age=60, s-maxage=3600       |
+------------------------+-----------------------------------------+

GraphQL Caching Challenge:
  POST requests are not cached by CDN by default.
  Solutions:
  1. Support GET requests for GraphQL (query in URL param)
     GET /v1/graphql?query={blogPost(id:"123"){title}}&variables={}
  2. Automatic Persisted Queries (APQ):
     Client sends hash of query; server looks up full query from cache.
     GET /v1/graphql?extensions={"persistedQuery":{"sha256Hash":"abc..."}}
  3. CDN-level query normalization and caching
```

---

## Deep Dive: Search & Filtering

### Elasticsearch Integration

```
Index Architecture:

  One Elasticsearch index per space per content type:
    cms_space_abc_blog_post
    cms_space_abc_author
    cms_space_abc_tag

  Mapping generated dynamically from content type definition:

  PUT /cms_space_abc_blog_post
  {
    "mappings": {
      "properties": {
        "entry_id":       { "type": "keyword" },
        "content_type":   { "type": "keyword" },
        "status":         { "type": "keyword" },
        "fields": {
          "properties": {
            "title": {
              "properties": {
                "en": { "type": "text", "analyzer": "english",
                         "fields": { "keyword": { "type": "keyword" } } },
                "zh": { "type": "text", "analyzer": "icu_analyzer" }
              }
            },
            "slug": {
              "properties": {
                "en": { "type": "keyword" },
                "zh": { "type": "keyword" }
              }
            },
            "body": {
              "properties": {
                "en": { "type": "text", "analyzer": "english" },
                "zh": { "type": "text", "analyzer": "icu_analyzer" }
              }
            },
            "published_date": { "type": "date" },
            "author":         { "type": "keyword" },
            "tags":           { "type": "keyword" }
          }
        },
        "sys": {
          "properties": {
            "created_at":   { "type": "date" },
            "updated_at":   { "type": "date" },
            "published_at": { "type": "date" },
            "created_by":   { "type": "keyword" }
          }
        }
      }
    }
  }

Sync Strategy:
  1. On entry create/update/publish/delete:
     Enqueue index update to message queue
  2. Index worker processes updates:
     - Upsert document in Elasticsearch
     - Delete document on entry unpublish/delete
  3. Periodic full re-index job (weekly):
     - Ensures consistency between DB and search index
     - Handles any missed events
  4. Replication lag: typically < 2 seconds
```

### Search API

```
Full-Text Search:

  GET /v1/delivery/entries/search?q=microservices&content_type=blog_post&locale=en

  Elasticsearch query:
  {
    "query": {
      "bool": {
        "must": [
          {
            "multi_match": {
              "query": "microservices",
              "fields": [
                "fields.title.en^3",
                "fields.body.en",
                "fields.tags^2"
              ],
              "type": "best_fields",
              "fuzziness": "AUTO"
            }
          }
        ],
        "filter": [
          { "term": { "content_type": "blog_post" } },
          { "term": { "status": "published" } }
        ]
      }
    },
    "highlight": {
      "fields": {
        "fields.title.en": {},
        "fields.body.en": { "fragment_size": 200 }
      }
    },
    "size": 10,
    "from": 0
  }

Faceted Filtering:

  GET /v1/delivery/entries/search?
    q=architecture&
    content_type=blog_post&
    facets=tags,author,published_date&
    filter[tags]=entry_tag_backend&
    locale=en

  Response:
  {
    "items": [ ... ],
    "total": 42,
    "facets": {
      "tags": [
        { "value": "entry_tag_backend", "count": 42 },
        { "value": "entry_tag_arch", "count": 28 },
        { "value": "entry_tag_cloud", "count": 15 }
      ],
      "author": [
        { "value": "entry_author_042", "display": "Jane Smith", "count": 18 },
        { "value": "entry_author_007", "display": "John Doe", "count": 12 }
      ],
      "published_date": [
        { "range": "2026-03", "count": 8 },
        { "range": "2026-02", "count": 15 },
        { "range": "2026-01", "count": 19 }
      ]
    }
  }

Reference Traversal Search:

  "Find all blog posts by author 'Jane Smith' tagged with 'backend'"

  This requires joining across content types. Two approaches:

  Approach 1: Denormalize at index time
    When indexing a blog post, resolve references and index denormalized data:
    { "author_name": "Jane Smith", "tag_names": ["Backend", "Architecture"] }
    Pros: Fast search, single index query
    Cons: Must re-index referencing entries when referenced entry changes

  Approach 2: Two-phase search
    Phase 1: Find author entry by name -> get author entry_id
    Phase 2: Search blog posts with filter[author]=author_entry_id
    Pros: Always consistent, no reindex cascade
    Cons: Extra round trip, higher latency

  Decision: Denormalize for display fields (name, title). Use entry IDs for
  filtering. Re-index cascade on referenced entry updates (bounded: only
  entries that reference the changed entry).
```

---

## Deep Dive: Localization (i18n)

### Multi-Locale Content Architecture

```
Localization Strategy: Per-Field Localization

Each field in a content type can be independently marked as "localized" or not.

Content Type: "Product Page"
  Fields:
    name:           localized = true    (different per locale)
    slug:           localized = true    (URL slug per language)
    description:    localized = true
    price:          localized = false   (same in all locales)
    sku:            localized = false
    image:          localized = false   (same image everywhere)
    size_chart:     localized = true    (different per region)

Entry fields storage:
{
  "name": {
    "en": "Running Shoes",
    "zh": "跑步鞋",
    "fr": "Chaussures de Course",
    "ja": "ランニングシューズ"
  },
  "slug": {
    "en": "running-shoes",
    "zh": "pao-bu-xie",
    "fr": "chaussures-de-course",
    "ja": "running-shoes-ja"
  },
  "description": {
    "en": "Premium running shoes...",
    "zh": "高端跑步鞋...",
    "fr": "Chaussures de course premium..."
    // ja: not translated yet
  },
  "price": 129.99,           // not localized, single value
  "sku": "RS-001",           // not localized
  "image": "asset_shoe_001"  // not localized
}
```

### Locale Fallback Chain

```
Fallback Configuration per Space:

space_locales table:
  en      (default, no fallback)
  en-US   (fallback: en)
  en-GB   (fallback: en)
  zh-CN   (fallback: zh)
  zh-TW   (fallback: zh)
  zh      (fallback: en)
  fr-FR   (fallback: fr)
  fr      (fallback: en)
  ja      (fallback: en)

Fallback Chain Examples:
  zh-CN -> zh -> en
  fr-FR -> fr -> en
  en-GB -> en
  ja -> en

Resolution Algorithm:

  function resolveLocalizedField(entry, fieldName, requestedLocale, fieldDef):
    if not fieldDef.localized:
      return entry.fields[fieldName]    // non-localized: return as-is

    localeValues = entry.fields[fieldName]

    // Walk the fallback chain
    locale = requestedLocale
    while locale is not null:
      if localeValues[locale] is defined and not empty:
        return localeValues[locale]
      locale = getFallbackLocale(locale)

    // No translation found in any fallback
    return null  // or return default locale value with a "missing" flag

  Example:
    Request locale: ja
    Field "description" has: { "en": "Premium...", "zh": "高端..." }
    Resolution: ja -> (no "ja" value) -> en -> "Premium..."

API Response with Locale Metadata:

  GET /v1/delivery/entries/entry_abc?locale=ja

  Response:
  {
    "fields": {
      "name": "ランニングシューズ",           // resolved: ja (direct)
      "description": "Premium running shoes...",  // resolved: en (fallback)
      "price": 129.99                              // non-localized
    },
    "sys": {
      "locale": "ja",
      "resolved_locales": {
        "name": "ja",
        "description": "en",    // indicates fallback was used
        "price": null            // non-localized field
      }
    }
  }
```

### Translation Workflow

```
Translation Status Tracking:

  For each entry, track translation completeness per locale:

  GET /v1/entries/{entryId}/localization-status

  Response:
  {
    "entry_id": "entry_abc123",
    "content_type": "blog_post",
    "locales": {
      "en": {
        "status": "complete",
        "translated_fields": 8,
        "total_localizable_fields": 8,
        "completion": 100
      },
      "zh": {
        "status": "partial",
        "translated_fields": 5,
        "total_localizable_fields": 8,
        "missing_fields": ["body", "seo_metadata", "excerpt"],
        "completion": 62.5
      },
      "ja": {
        "status": "not_started",
        "translated_fields": 0,
        "total_localizable_fields": 8,
        "completion": 0
      }
    }
  }

Translation Workflow:

  [English Entry Complete] -> [Submit for Translation]
          |
          v
  +-------+--------+--------+
  |        |        |        |
  v        v        v        v
  [zh]    [fr]    [ja]    [de]     (parallel translation tasks)
  |        |        |        |
  v        v        v        v
  [Translation Review per locale]
  |        |        |        |
  v        v        v        v
  [Approved] -> [Publish All Locales]

  Considerations:
  - Allow publishing per locale (en published, zh still in draft)
  - Lock source (en) fields while translations are in progress
  - Show diff when source content changes after translation started
  - Integration with translation management systems (Phrase, Crowdin)
    via webhook or direct API integration
```

---

## Scaling Strategy

### Read-Heavy Optimization

```
CMS workloads are extremely read-heavy:
  Write:Read ratio = 1:100 to 1:1000

Optimization Stack:

Layer 1: CDN (90-95% of delivery traffic)
  - 100K req/s at edge, < 10ms latency
  - Only 5-10K req/s reach origin
  - Cache hit rate target: > 90%

Layer 2: Application Response Cache (Redis)
  - Cache full API responses for common queries
  - Key: hash(content_type + filters + locale + page + include_depth)
  - TTL: 5 minutes (or until invalidated by write)
  - Hit rate: 60-70% of origin traffic

Layer 3: Database Read Replicas
  - 3-5 read replicas per region
  - All delivery API queries go to replicas
  - Replication lag < 100ms (acceptable for eventual consistency)

Layer 4: Connection Pooling
  - PgBouncer in front of PostgreSQL
  - 5000 application connections -> 100 database connections
  - Transaction-level pooling

Effective load on primary database:
  100K req/s (CDN) -> 5K-10K req/s (origin) -> 1.5K-4K req/s (Redis miss)
  -> Split across 5 read replicas = 300-800 req/s per replica
  Primary only handles writes: ~1K TPS
```

### Write Scaling

```
Write path is simpler but still needs attention:

1. Entry Writes (1K TPS)
   - Single primary PostgreSQL handles 1K TPS easily
   - Bottleneck: JSONB validation and index updates
   - Optimization: validate in application, use partial indexes

2. Async Processing (decouple from write path)
   Write Path (synchronous):
     Validate -> Write to DB -> Return response
     Target: < 500ms

   Post-Write (asynchronous via message queue):
     -> Invalidate CDN cache
     -> Invalidate Redis cache
     -> Update Elasticsearch index
     -> Deliver webhooks
     -> Generate asset variants

   Message Queue: Kafka or SQS
     Topics:
       cms.entries.created      (partition by space_id)
       cms.entries.updated      (partition by space_id)
       cms.entries.published    (partition by space_id)
       cms.entries.deleted      (partition by space_id)
       cms.assets.uploaded      (partition by space_id)
       cms.assets.processed     (partition by space_id)
       cms.webhooks.deliver     (partition by webhook_id)

3. Version Table Growth
   2B version records (10TB) is significant.
   Partition by created_at (monthly) for efficient cleanup.
   Archive versions > 1 year to cold storage.

4. Multi-Region Writes
   For global SaaS:
   - Each space is "homed" to a region
   - Writes go to that region's primary
   - Cross-region reads via read replicas
   - No cross-region write conflicts (space-level isolation)
```

### Database Partitioning

```
Partitioning Strategy:

1. Entries Table: Partition by space_id (hash)
   - Even distribution across partitions
   - Queries always include space_id (tenant isolation)
   - 16-64 partitions depending on total entries

   CREATE TABLE entries (
     ...
   ) PARTITION BY HASH (space_id);

   CREATE TABLE entries_p0 PARTITION OF entries
     FOR VALUES WITH (modulus 16, remainder 0);
   -- ... 16 partitions

2. Entry Versions: Partition by created_at (range, monthly)
   - Efficient cleanup: DROP PARTITION for old months
   - Queries always include entry_id (indexed within partition)

3. Audit Logs: Partition by created_at (range, monthly)
   - Write-heavy, append-only
   - Old partitions moved to cold storage
   - Retention: 2 years online, 7 years archived

4. Webhook Deliveries: Partition by created_at (range, weekly)
   - High volume, short retention (30 days)
   - Drop old partitions weekly

5. Assets: No partitioning needed (50M rows is manageable)
   - Indexed by space_id, content_type, tags
```

---

## Deployment Architecture

```
Multi-Region Deployment:

Region: US-East-1 (Primary)
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+    +------------------+                      |
|  | CDN Edge PoPs    |    | CDN Edge PoPs    |  (200+ global PoPs) |
|  +--------+---------+    +--------+---------+                      |
|           |                       |                                |
|           v                       v                                |
|  +--------+-----------------------+--------+                       |
|  |          Load Balancer (ALB)            |                       |
|  +----+----------+----------+----+---------+                       |
|       |          |          |    |                                  |
|       v          v          v    v                                  |
|  +----+---+ +----+---+ +---+----+--+ +----+---+                   |
|  |Delivery| |Delivery| |Management| |Management                   |
|  |API x20 | |API x20 | |API x5   | |API x5  |                    |
|  +--------+ +--------+ +----------+ +---------+                   |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | Redis Cluster    |    | Elasticsearch    |                      |
|  | (6 nodes, 3     |    | Cluster          |                      |
|  |  primary +       |    | (3 data nodes +  |                      |
|  |  3 replica)      |    |  2 coordinator)  |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | PostgreSQL       |    | PostgreSQL       |                      |
|  | Primary          |    | Read Replicas    |                      |
|  | (db.r6g.4xlarge) |    | x5               |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | Kafka Cluster    |    | Worker Nodes     |                      |
|  | (3 brokers)      |    | - Webhook x5     |                      |
|  |                  |    | - Search Index x3|                      |
|  |                  |    | - Asset Proc x10 |                      |
|  |                  |    | - Scheduler x2   |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+                                              |
|  | S3 Bucket        |  (cross-region replication to EU, AP)       |
|  | - Media assets   |                                              |
|  | - Version archive|                                              |
|  +------------------+                                              |
+------------------------------------------------------------------+

Region: EU-West-1 (Read Replica Region)
+------------------------------------------------------------------+
|  +------------------+    +------------------+                      |
|  | CDN Edge PoPs    |    | Load Balancer    |                      |
|  +--------+---------+    +--------+---------+                      |
|           |                       |                                |
|           v                       v                                |
|  +--------+---------+    +-------+---------+                       |
|  | Delivery API x10 |    | Read Replica x3 |                      |
|  +------------------+    +-----------------+                       |
|  +------------------+    +------------------+                      |
|  | Redis Replica    |    | ES Replica       |                      |
|  +------------------+    +------------------+                      |
|  +------------------+                                              |
|  | S3 Replica       |  (replicated from US-East-1)               |
|  +------------------+                                              |
+------------------------------------------------------------------+

Management API writes are proxied to US-East-1 primary for
EU-based users. Added ~80ms latency for writes (acceptable).
Reads are served locally from EU replicas.
```

### Infrastructure Sizing

```
+---------------------------+-------------------+-------------------+
| Component                 | Spec              | Monthly Cost (est)|
+---------------------------+-------------------+-------------------+
| Delivery API (20 pods)    | 2 vCPU, 4GB RAM   | $2,000            |
| Management API (5 pods)   | 2 vCPU, 4GB RAM   | $500              |
| PostgreSQL Primary        | db.r6g.4xlarge     | $3,000            |
| PostgreSQL Replicas (5)   | db.r6g.2xlarge     | $5,000            |
| Redis Cluster (6 nodes)   | cache.r6g.xlarge   | $2,400            |
| Elasticsearch (5 nodes)   | r6g.2xlarge        | $3,500            |
| Kafka (3 brokers)         | kafka.m5.2xlarge   | $2,100            |
| Worker Nodes (20 pods)    | 2 vCPU, 4GB RAM   | $2,000            |
| S3 Storage (250TB)        | Standard + IA      | $5,500            |
| CDN (CloudFront)          | 500TB transfer     | $15,000           |
| Load Balancers (2)        | ALB                | $200              |
+---------------------------+-------------------+-------------------+
| Total (US-East primary)   |                   | ~$41,200/month    |
| EU-West replica region    |                   | ~$12,000/month    |
+---------------------------+-------------------+-------------------+
| Grand Total               |                   | ~$53,200/month    |
+---------------------------+-------------------+-------------------+
```

---

## Common Interview Follow-ups

**Q: How do you handle content type schema migrations without downtime?**

Schema changes must be backward-compatible during rollout. Use a two-phase approach: (1) Additive changes (new optional fields, relaxed validations) apply immediately with no migration needed -- old entries are valid under the new schema; (2) Breaking changes (new required fields, type changes) use a migration pipeline: first deploy the new schema as "draft" (not enforced on writes), run a background job to backfill/transform all existing entries, validate 100% compliance, then activate the new schema. During migration, the delivery API continues serving the old published snapshots. If a field is removed, mark it as "omitted" first (excluded from API responses but still stored), wait 30 days for consumers to update, then physically remove. Version the content type schema itself (content_types.version column) so the API can serve schema-aware responses.

**Q: How would you implement real-time collaborative editing of CMS entries?**

For basic conflict prevention, use optimistic locking: each entry update includes an expected_version field; the server rejects writes where the version has changed (HTTP 409 Conflict). The client then re-fetches and merges. For true real-time collaboration (like Notion), each entry editing session establishes a WebSocket connection. Use Operational Transform or CRDT (Yjs) per field rather than per document, since CMS entries have structured fields. Each localized field value can be an independent collaboration unit. The collaboration server tracks presence (who is editing which field) and broadcasts changes. This is significantly more complex -- most CMS implementations use the simpler lock-based approach where only one user can edit an entry at a time, with a lock that expires after 15 minutes of inactivity.

**Q: How do you handle reference integrity when deleting a published entry that other entries link to?**

Implement a reference graph check before deletion. Query the entry_references table: SELECT COUNT(*) FROM entry_references WHERE target_entry_id = $1. If references exist, return HTTP 409 with a list of referencing entries. Offer the user three options: (1) Cancel deletion; (2) Remove all references first (batch update referencing entries to null out the field); (3) Force delete with cascade (admin only, removes references). For the delivery API, handle dangling references gracefully -- if a referenced entry is not found, return null for that reference field rather than failing the entire response. Run a weekly background job to detect orphaned references and alert content editors.

**Q: How would you design the preview system for unpublished content?**

The preview service serves draft content through a separate API endpoint (/v1/preview/) that requires a short-lived preview token. When an editor clicks "Preview," the management API generates a signed JWT token (expiry: 1 hour) containing the entry_id and space_id. This token is embedded in a preview URL: https://preview.mysite.com/blog/my-post?preview_token=xyz. The preview service fetches draft fields (not published_fields) from the entry and returns them. For SSG-based sites, the preview URL points to the SSG framework's preview mode (Next.js draft mode, Gatsby preview). The preview service must never be cached by CDN -- all responses include Cache-Control: private, no-store. For multi-locale preview, include locale in the preview token to allow previewing specific translations.

**Q: EAV vs JSON columns vs document store -- when would you choose each?**

EAV (Entity-Attribute-Value) is appropriate when you need SQL-native querying across arbitrary fields and your field count per entity is very high (1000+), but it creates terrible join performance and should be avoided for most CMS use cases. JSON/JSONB columns (our choice) work well when content structure varies per type, you need flexible schemas with reasonable query performance, and your database (PostgreSQL) has mature JSON support with GIN indexes. Choose a document store (MongoDB) when your content is deeply nested, you never need cross-document transactions, and read patterns are primarily by ID or simple filters. The hybrid approach (relational metadata + JSONB content) gives the best of both worlds: relational integrity for system data (users, types, references) and schema flexibility for user-defined content fields.

**Q: How do you ensure webhook delivery reliability?**

Use at-least-once delivery with exponential backoff. When a content event occurs, write the webhook delivery record to the webhook_deliveries table and enqueue to Kafka. The webhook worker: (1) Reads the delivery record; (2) Signs the payload with HMAC-SHA256 using the webhook's secret; (3) POSTs to the endpoint with a 10-second timeout; (4) On success (2xx), marks as delivered; (5) On failure, schedules retry with exponential backoff (1min, 5min, 30min, 2h, 12h) up to 5 attempts; (6) After all retries exhausted, marks as failed and notifies the space admin. Include an idempotency key (webhook_delivery_id) in the payload so consumers can deduplicate. Provide a webhook delivery log in the admin UI showing status, response codes, and retry history. Allow manual retry of failed deliveries. Rate limit webhook delivery to prevent overwhelming consumer endpoints (max 50 concurrent deliveries per endpoint).

**Q: How would you design the system to support 50+ locales efficiently?**

The per-field localization model scales well because non-localized fields are stored once regardless of locale count. For localized fields with 50 locales, the JSONB payload grows linearly -- a 200-character title field across 50 locales is only ~10KB additional. Optimization strategies: (1) Sparse storage: only store locale values that have been explicitly set (not all 50 for every field); (2) Delivery API returns only the requested locale (after fallback resolution), not all 50; (3) Elasticsearch: index only active locales with content (skip empty ones); (4) CDN cache: cache per locale (locale is part of cache key), so each locale's cache warms independently; (5) Bulk translation import: support CSV/XLIFF import for batch translation updates rather than per-field API calls. For the management UI, show a locale completion dashboard so editors can prioritize translation efforts.

**Q: How do you implement content delivery for a global audience with low latency?**

Multi-layer caching is the key. Layer 1: CDN with 200+ edge PoPs serves 90%+ of delivery traffic at < 10ms. Layer 2: Regional application caches (Redis) handle CDN misses at < 5ms. Layer 3: Regional read replicas serve database queries at < 50ms. For content that changes rarely (marketing pages, product descriptions), set long CDN TTLs (24h+) and use surrogate key purging for instant invalidation on publish. For frequently updated content (news, pricing), use shorter TTLs (60s) with stale-while-revalidate to serve slightly stale content while refreshing in the background. Deploy delivery API instances in 3+ regions (US, EU, APAC). Use anycast DNS or latency-based routing to direct users to the nearest region. For asset delivery, S3 cross-region replication ensures media files are served from the nearest region's CDN origin.

**Q: How would you add AI-powered features to the CMS?**

Several AI integration points: (1) Content generation: integrate LLM APIs for drafting content, generating SEO metadata, writing alt text for images -- expose as "AI Assist" buttons in the editor UI; (2) Auto-tagging: run image classification on uploaded assets to suggest tags; (3) Translation: use MT APIs (DeepL, Google Translate) as a starting point for human translators; (4) Content quality: score readability (Flesch-Kincaid), check grammar, detect duplicate content across entries; (5) Smart search: use embeddings (OpenAI, Cohere) for semantic search in addition to keyword search -- store embeddings in a vector index (pgvector or Pinecone) alongside Elasticsearch; (6) Personalization: use content embeddings to recommend related entries. All AI features should be asynchronous (queue-based) to avoid blocking the content workflow, and results should be suggestions that editors can accept or modify -- never auto-publish AI-generated content.

---

## Summary

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Content storage | JSONB columns in PostgreSQL | Flexible schema per content type without EAV complexity; GIN indexes for queries |
| Schema definition | Runtime-defined content types | Business users can create and modify content models without code deploys |
| API style | REST (management) + REST/GraphQL (delivery) | REST for CRUD simplicity; GraphQL for flexible content fetching by frontend teams |
| Versioning | Append-only version table with full snapshots | Simple to implement; efficient rollback; delta compression for storage optimization |
| Publishing | Separate draft/published fields on entry | Live content unaffected by draft edits; atomic publish operation |
| Caching | CDN + Redis + Read Replicas (3 layers) | 90%+ CDN hit rate; Redis catches common queries; replicas handle the rest |
| CDN invalidation | Surrogate key purging | Targeted invalidation without TTL waiting; sub-second global purge |
| Search | Elasticsearch with async indexing | Full-text search with facets; decoupled from write path for performance |
| Media processing | Async pipeline with pre-generated + on-the-fly variants | Pre-generate common sizes; on-the-fly for long tail; CDN caches all |
| Localization | Per-field localization with fallback chains | Granular control; only localize what needs it; fallback prevents empty content |
| Webhooks | At-least-once delivery with exponential backoff | Reliable notification; consumers handle idempotency |
| Multi-tenancy | Shared database with space_id partitioning | Cost efficient; row-level isolation; partition by space for performance |
| Workflow | Configurable state machine per content type | Flexible approval pipelines; different workflows for different content |
| Deployment | Multi-region with single write primary | Simplifies consistency; delivery API reads from local replicas |

### Trade-offs

| Trade-off | Our Choice | Alternative | When to Reconsider |
|-----------|-----------|-------------|-------------------|
| JSONB vs normalized tables | JSONB for content fields | Normalized EAV | If complex SQL reporting on individual fields is critical |
| Separate delivery API vs unified | Separate (read-only) | Single API | If operational complexity budget is limited; small-scale CMS |
| Pre-generated vs on-the-fly images | Both (hybrid) | On-the-fly only | If storage cost is a bigger concern than compute cost |
| Strong vs eventual consistency (delivery) | Eventual (via CDN + replicas) | Strong consistency | If content accuracy is life-safety critical (medical, legal) |
| Per-field vs per-entry localization | Per-field | Per-entry (duplicate entry per locale) | If most fields are localized; per-entry simplifies the model |
| GraphQL vs REST-only delivery | Both supported | REST-only | If team lacks GraphQL expertise; REST-only is simpler to cache |
| Single-region vs multi-region writes | Single write region | Multi-region with conflict resolution | If write latency from non-primary regions becomes unacceptable (> 300ms) |
