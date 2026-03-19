# 设计内容管理系统 (WordPress / Contentful / Strapi)

内容管理系统 (CMS) 提供了一个用于创建、管理和分发结构化内容到多个渠道的平台。现代 headless CMS 架构将内容存储库与表示层解耦，通过 API（REST 和 GraphQL）向网站、移动应用、IoT 设备和静态站点生成器提供内容。核心挑战在于设计一个灵活的内容建模系统，支持任意 schema、版本控制、编辑工作流以及大规模高性能内容分发。

## 目录

1. [需求澄清](#需求澄清)
2. [API 设计](#api-设计)
3. [数据模型](#数据模型)
4. [高层架构](#高层架构)
5. [深入探讨：内容建模](#深入探讨内容建模)
6. [深入探讨：版本控制与发布](#深入探讨版本控制与发布)
7. [深入探讨：编辑工作流](#深入探讨编辑工作流)
8. [深入探讨：媒体资产管道](#深入探讨媒体资产管道)
9. [深入探讨：内容分发](#深入探讨内容分发)
10. [深入探讨：搜索与过滤](#深入探讨搜索与过滤)
11. [深入探讨：本地化 (i18n)](#深入探讨本地化-i18n)
12. [扩展策略](#扩展策略)
13. [部署架构](#部署架构)
14. [常见面试追问](#常见面试追问)
15. [总结](#总结)

---

## 需求澄清

### 需要提出的澄清问题

- 这是一个 headless CMS（API 优先）还是带有内置渲染的传统 CMS？
- 我们需要支持多少种内容类型和字段？它们是由开发人员还是业务用户定义的？
- 我们需要多租户支持（SaaS）还是单租户（自托管）？
- 哪些内容分发渠道在范围内？（web、移动端、IoT、数字标牌）
- 我们需要多语言环境支持吗？需要多少种语言？
- 编辑工作流是什么样的？简单的草稿/发布还是多阶段审批？
- 需要支持哪些媒体类型？（图片、视频、文档、3D 模型）
- 我们是否需要实时协作编辑内容？
- 集成需求是什么？（SSG、电商、DAM、分析）

### 功能需求

| #   | 需求         | 描述                                                                             |
| --- | ------------ | -------------------------------------------------------------------------------- |
| 1   | 内容建模     | 定义具有类型化字段（文本、富文本、数字、日期、媒体、引用、JSON）的自定义内容类型 |
| 2   | CRUD 操作    | 创建、读取、更新、删除内容条目，并根据内容类型 schema 进行验证                   |
| 3   | 内容版本控制 | 维护每个条目的完整版本历史；比较和回滚到任何版本                                 |
| 4   | 发布工作流   | 草稿/审核/已发布/已归档的生命周期，支持定时发布和取消发布                        |
| 5   | 媒体管理     | 上传、存储、转换（调整大小、裁剪、格式转换）并通过 CDN 分发媒体资产              |
| 6   | API 分发     | 通过 REST 和 GraphQL API 提供内容；支持过滤、分页和字段选择                      |
| 7   | 本地化       | 按字段本地化，支持语言回退链；翻译工作流支持                                     |
| 8   | Webhooks     | 在内容生命周期事件（创建、发布、取消发布、删除）时通知外部系统                   |
| 9   | 搜索         | 跨所有内容的全文搜索，支持分面过滤和相关性排序                                   |
| 10  | 访问控制     | 基于角色的权限（作者、编辑、管理员），具有按内容类型和按字段的粒度               |
| 11  | 预览         | 为未发布的内容生成预览 URL，供编辑审核                                           |
| 12  | 审计追踪     | 记录所有内容变更，包括操作者、时间戳和变更集，用于合规                           |

### 非功能需求

| #   | 需求              | 目标                                            |
| --- | ----------------- | ----------------------------------------------- |
| 1   | 内容分发 API 延迟 | < 50ms P99（CDN 缓存命中），< 200ms P99（源站） |
| 2   | 内容管理 API 延迟 | < 500ms P99（CRUD 操作）                        |
| 3   | 可用性            | 分发 API 99.99%，管理 API 99.9%                 |
| 4   | 吞吐量（分发）    | 峰值 100K 请求/秒                               |
| 5   | 吞吐量（管理）    | 峰值 1K 写入/秒                                 |
| 6   | 媒体上传          | 支持最大 500MB 的文件；60 秒内处理完成          |
| 7   | 搜索延迟          | < 100ms（全文查询）                             |
| 8   | 可扩展性          | 支持 10K 内容类型、100M 条目、50M 资产          |
| 9   | SEO 友好          | 清晰的 URL、结构化数据（JSON-LD）、站点地图生成 |
| 10  | 数据一致性        | 管理 API 强一致性，分发 API 最终一致性          |
| 11  | 多语言            | 支持 50+ 语言环境，按字段本地化                 |
| 12  | Webhook 投递      | 事件发生后 30 秒内至少一次投递                  |

### 规模估算

```
内容量:
  内容类型:              10,000（跨 SaaS 模型中的所有租户）
  总条目数:              100M 条目
  平均条目大小:           5KB（JSON 负载）
  总条目存储:            100M x 5KB = 500GB（当前版本）
  版本历史:              平均 20 个版本/条目 = 2B 版本记录
  版本存储:              2B x 5KB = 10TB

媒体资产:
  总资产数:              50M 文件
  平均文件大小:           2MB（图片），50MB（视频）
  总媒体存储:            50M x 5MB 平均 = 250TB
  派生资产（缩略图、      20 x 50M x 200KB = 200TB
    裁剪、格式）:

API 流量:
  分发 API:
    峰值 QPS:                 100,000 req/s
    CDN 缓存命中率:           90-95%
    源站 QPS:                 5,000-10,000 req/s
    带宽:                     100K x 5KB 平均 = 500MB/s

  管理 API:
    峰值写入/s:               1,000
    峰值读取/s:               5,000
    Webhook 事件/s:           1,000

搜索:
  索引条目:                   100M 文档
  索引大小:                   100M x 2KB 平均 = 200GB
  搜索 QPS:                   5,000 查询/s

数据库:
  主数据库大小:               ~500GB 条目 + 200GB 元数据 = 700GB
  只读副本:                   每个区域 3-5 个
  写入吞吐量:                 1,000 TPS
  读取吞吐量:                 50,000 TPS（跨副本）

Webhook 投递:
  事件/天:                    ~86M（1K/s）
  平均投递尝试次数:            1.2（20% 重试率）
  Webhook 端点:               100K 注册端点
```

---

## API 设计

### 内容管理 API (REST)

```
# 内容类型管理
POST   /v1/content-types                           创建内容类型
GET    /v1/content-types                           列出内容类型
GET    /v1/content-types/{typeId}                  获取内容类型定义
PUT    /v1/content-types/{typeId}                  更新内容类型 schema
DELETE /v1/content-types/{typeId}                  删除内容类型（如果没有条目）

# 内容类型字段管理
POST   /v1/content-types/{typeId}/fields           添加字段到内容类型
PUT    /v1/content-types/{typeId}/fields/{fieldId}  更新字段定义
DELETE /v1/content-types/{typeId}/fields/{fieldId}  删除字段

# 条目管理
POST   /v1/entries                                 创建条目
GET    /v1/entries                                 列出条目（按类型、状态、语言过滤）
GET    /v1/entries/{entryId}                       获取条目（最新版本）
PUT    /v1/entries/{entryId}                       更新条目（创建新版本）
DELETE /v1/entries/{entryId}                       删除条目（软删除）

# 条目版本
GET    /v1/entries/{entryId}/versions               列出所有版本
GET    /v1/entries/{entryId}/versions/{versionNum}  获取特定版本
POST   /v1/entries/{entryId}/versions/{versionNum}/restore  恢复到该版本

# 发布
POST   /v1/entries/{entryId}/publish               发布条目
POST   /v1/entries/{entryId}/unpublish             取消发布条目
POST   /v1/entries/{entryId}/schedule              定时发布/取消发布
POST   /v1/entries/{entryId}/archive               归档条目

# 资产管理
POST   /v1/assets/upload                           上传资产（multipart）
GET    /v1/assets                                  列出资产
GET    /v1/assets/{assetId}                        获取资产元数据
PUT    /v1/assets/{assetId}                        更新资产元数据
DELETE /v1/assets/{assetId}                        删除资产
POST   /v1/assets/{assetId}/transform              请求转换

# 工作流
POST   /v1/entries/{entryId}/submit-for-review     提交到编辑队列
POST   /v1/entries/{entryId}/approve               批准条目
POST   /v1/entries/{entryId}/reject                拒绝并附带评论
GET    /v1/workflow/queue                           获取编辑审核队列

# Webhooks
POST   /v1/webhooks                                注册 webhook 端点
GET    /v1/webhooks                                列出 webhooks
PUT    /v1/webhooks/{webhookId}                    更新 webhook
DELETE /v1/webhooks/{webhookId}                    删除 webhook
GET    /v1/webhooks/{webhookId}/deliveries         查看投递历史
```

### 内容管理 API - 请求/响应示例

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

### 内容分发 API (GraphQL)

```graphql
# 根据内容类型定义自动生成的 schema

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

enum ImageFormat {
  WEBP
  AVIF
  JPG
  PNG
}
enum ImageFit {
  FILL
  FIT
  CROP
  PAD
  SCALE
}
enum Locale {
  en
  zh
  fr
  de
  ja
  es
}

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
  # 按 ID 查询单个条目
  blogPost(id: ID!, locale: Locale, preview: Boolean): BlogPost

  # 带过滤的集合查询
  blogPostCollection(
    where: BlogPostFilter
    order: [BlogPostOrder!]
    limit: Int = 20
    skip: Int = 0
    locale: Locale
    preview: Boolean
  ): BlogPostCollection!

  # 通用条目查询
  entry(id: ID!, locale: Locale, preview: Boolean): Entry

  # 资产查询
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

### 内容分发 API (REST)

```
# 已发布内容分发
GET /v1/delivery/entries?content_type=blog_post&locale=en&limit=10&skip=0
GET /v1/delivery/entries/{entryId}?locale=en
GET /v1/delivery/entries?content_type=blog_post&fields.slug=my-post&locale=en

# 预览（草稿内容）
GET /v1/preview/entries/{entryId}?locale=en
    Header: Authorization: Bearer <preview_token>

# 带实时转换的资产分发
GET /v1/assets/{assetId}/file?w=800&h=600&fit=crop&format=webp&quality=80

Response 200（分发）:
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

## 数据模型

### Schema 设计方法

在定义表之前，我们必须选择一种 schema 策略来存储用户定义的具有任意字段的内容类型。

```
方法 1：Entity-Attribute-Value (EAV)
+-----------------------------------------------------------------------+
| 优点                              | 缺点                              |
|-----------------------------------|-----------------------------------|
| 完全动态，无需 schema 变更        | 查询复杂（大量 JOIN）             |
| 添加字段无需 ALTER TABLE          | 无原生类型强制                    |
| 适用于任何内容结构                | 大规模查询性能差                  |
| 使用者：Magento、较老的 CMS      | 难以高效索引                      |
+-----------------------------------------------------------------------+

方法 2：JSON/JSONB 列
+-----------------------------------------------------------------------+
| 优点                              | 缺点                              |
|-----------------------------------|-----------------------------------|
| 每个条目灵活的 schema             | 索引有限（GIN 索引有帮助）        |
| 每个条目单行存储                  | JSON schema 验证在应用层          |
| 良好的查询性能（JSONB）           | 嵌套 JSON 查询复杂                |
| 使用者：Strapi、许多现代 CMS     | 重复键的存储开销                  |
+-----------------------------------------------------------------------+

方法 3：文档存储 (MongoDB)
+-----------------------------------------------------------------------+
| 优点                              | 缺点                              |
|-----------------------------------|-----------------------------------|
| 原生灵活 schema                   | 事务支持较弱                      |
| 出色的读取性能                    | 引用无 JOIN 支持                  |
| 内置 schema 验证                  | 一致性模型更复杂                  |
| 使用者：Contentful、Payload CMS  | 迁移复杂度高                      |
+-----------------------------------------------------------------------+

方法 4：混合方式（SQL 元数据 + JSONB 内容）  <-- 推荐
+-----------------------------------------------------------------------+
| 优点                              | 缺点                              |
|-----------------------------------|-----------------------------------|
| 系统表为关系型                    | 仍需 JSON 路径查询                |
| 内容受益于 JSONB 的灵活性        | Schema 验证在应用层               |
| 引用使用外键完整性               | 需维护两种查询模式                |
| 常用查询字段可索引               | 复杂度略高                        |
+-----------------------------------------------------------------------+

决策：采用 PostgreSQL 的混合方式。
  - 系统元数据（类型、用户、工作流）存储在规范化的关系表中
  - 内容字段值存储在 JSONB 列中
  - 在 JSONB 上建立 GIN 索引用于内容查询
  - 使用单独的引用表对内容链接实施显式外键约束
```

### 核心 SQL Schema

```sql
-- =============================================
-- 空间 / 租户
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
-- 内容类型
-- =============================================
CREATE TABLE content_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    api_identifier  VARCHAR(100) NOT NULL,
    description     TEXT,
    display_field   VARCHAR(100),           -- 作为条目标题显示的字段
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
    position        INT NOT NULL DEFAULT 0, -- UI 中的字段排序
    required        BOOLEAN NOT NULL DEFAULT false,
    localized       BOOLEAN NOT NULL DEFAULT false,
    disabled        BOOLEAN NOT NULL DEFAULT false,
    omitted         BOOLEAN NOT NULL DEFAULT false,  -- 从 API 响应中排除
    validations     JSONB NOT NULL DEFAULT '{}',
    default_value   JSONB,
    appearance      JSONB,                  -- UI 组件配置
    -- 引用特定字段
    reference_type  VARCHAR(100),           -- 目标 content_type 的 api_identifier
    cardinality     VARCHAR(10),            -- 'one' 或 'many'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (content_type_id, api_identifier)
);

CREATE INDEX idx_ct_fields_type ON content_type_fields(content_type_id);

-- =============================================
-- 条目（内容记录）
-- =============================================
CREATE TABLE entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    content_type_id UUID NOT NULL REFERENCES content_types(id),
    -- 当前状态
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- draft, in_review, published, archived, deleted
    current_version INT NOT NULL DEFAULT 1,
    published_version INT,                  -- 如果从未发布则为 NULL
    -- 反规范化内容用于快速读取（当前草稿版本）
    fields          JSONB NOT NULL DEFAULT '{}',
    -- 已发布内容快照（在发布时冻结）
    published_fields JSONB,
    -- 元数据
    created_by      UUID NOT NULL,
    updated_by      UUID NOT NULL,
    published_by    UUID,
    published_at    TIMESTAMPTZ,
    first_published_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ            -- 软删除
);

CREATE INDEX idx_entries_space_type ON entries(space_id, content_type_id);
CREATE INDEX idx_entries_status ON entries(space_id, status);
CREATE INDEX idx_entries_published ON entries(space_id, content_type_id)
    WHERE status = 'published';
CREATE INDEX idx_entries_fields ON entries USING GIN (fields jsonb_path_ops);
CREATE INDEX idx_entries_pub_fields ON entries USING GIN (published_fields jsonb_path_ops);

-- =============================================
-- 条目版本（完整版本历史）
-- =============================================
CREATE TABLE entry_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    version_number  INT NOT NULL,
    fields          JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL,   -- 版本创建时的状态
    change_summary  TEXT,                   -- 变更的可选描述
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entry_id, version_number)
);

CREATE INDEX idx_versions_entry ON entry_versions(entry_id, version_number DESC);

-- 按 created_at 分区以高效清理旧版本
-- CREATE TABLE entry_versions_2026_q1 PARTITION OF entry_versions
--     FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

-- =============================================
-- 内容引用（显式链接表）
-- =============================================
CREATE TABLE entry_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    target_entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    field_id        UUID NOT NULL REFERENCES content_type_fields(id),
    position        INT NOT NULL DEFAULT 0, -- 多引用的排序
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refs_source ON entry_references(source_entry_id, field_id);
CREATE INDEX idx_refs_target ON entry_references(target_entry_id);
-- 反向查询："这个条目在哪里被引用？"

-- =============================================
-- 资产（媒体文件）
-- =============================================
CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    title           JSONB NOT NULL DEFAULT '{}',    -- 本地化: {"en": "Photo", "zh": "照片"}
    description     JSONB NOT NULL DEFAULT '{}',    -- 本地化
    file_name       VARCHAR(500) NOT NULL,
    content_type    VARCHAR(255) NOT NULL,           -- MIME 类型
    file_size       BIGINT NOT NULL,                 -- 字节
    storage_key     VARCHAR(1000) NOT NULL,          -- S3/GCS 键
    cdn_url         VARCHAR(2000),
    -- 图片特定元数据
    width           INT,
    height          INT,
    -- 处理状态
    processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending, processing, ready, failed
    -- 派生资产（缩略图、转码版本）
    variants        JSONB NOT NULL DEFAULT '{}',
    -- 从文件提取的元数据（EXIF、时长等）
    file_metadata   JSONB NOT NULL DEFAULT '{}',
    -- 用于组织的标签
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
-- 工作流状态
-- =============================================
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    steps           JSONB NOT NULL,         -- 工作流步骤的有序列表
    applies_to      UUID[],                 -- 此工作流适用的 content_type ID
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
-- 定时操作
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
-- Webhooks
-- =============================================
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    name            VARCHAR(255) NOT NULL,
    url             VARCHAR(2000) NOT NULL,
    events          TEXT[] NOT NULL,        -- entry.publish, entry.unpublish 等
    headers         JSONB DEFAULT '{}',     -- 自定义头（认证令牌）
    secret          VARCHAR(255),           -- HMAC 签名密钥
    is_active       BOOLEAN NOT NULL DEFAULT true,
    content_types   UUID[],                 -- 过滤：仅对这些类型触发
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
-- 用户和角色
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
    -- 按内容类型的覆盖：
    -- { "blog_post": { "can_publish": true }, "page": { "can_edit": false } }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, user_id)
);

-- =============================================
-- 语言环境
-- =============================================
CREATE TABLE space_locales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL REFERENCES spaces(id),
    locale_code     VARCHAR(10) NOT NULL,   -- en, en-US, zh-CN, fr-FR
    name            VARCHAR(100) NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    fallback_locale VARCHAR(10),            -- 回退链：zh-CN -> zh -> en
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, locale_code)
);

-- =============================================
-- 审计日志
-- =============================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        UUID NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,   -- entry, asset, content_type, webhook
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,   -- create, update, publish, delete 等
    actor_id        UUID NOT NULL,
    changes         JSONB,                  -- 变更差异
    metadata        JSONB DEFAULT '{}',     -- IP、User Agent 等
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_space ON audit_logs(space_id, created_at DESC);
```

### JSONB 字段存储示例

```
条目 fields 列将本地化内容存储为嵌套 JSON：

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

使用 JSONB 的查询示例：

-- 查找所有英文标题包含 "microservices" 的博客文章
SELECT * FROM entries
WHERE content_type_id = 'ct_blog_post'
  AND status = 'published'
  AND fields->'title'->>'en' ILIKE '%microservices%';

-- 按引用查找条目
SELECT * FROM entries
WHERE fields->'author' = '"entry_author_042"';

-- GIN 索引查询数组包含
SELECT * FROM entries
WHERE fields->'tags' @> '["entry_tag_arch"]'::jsonb;
```

---

## 高层架构

```
+-------------------------------------------------------------------+
|                         客户端                                      |
|  +----------+  +----------+  +--------+  +---------+  +---------+ |
|  | 管理 UI  |  | Web 应用  |  | 移动   |  |   SSG   |  |   IoT   | |
|  | (React)  |  | (Next.js)|  |  应用   |  | (Gatsby)|  |  设备   | |
|  +----+-----+  +----+-----+  +---+----+  +----+----+  +----+----+ |
+-------|-------------|-------------|-------------|-------------|-----+
        |             |             |             |             |
        v             v             v             v             v
+-------+-------------+-------------+-------------+-------------+---+
|                          CDN / 边缘层                               |
|  (CloudFront / Fastly / Cloudflare)                               |
|  - 缓存分发 API 响应（基于 TTL + surrogate keys）                  |
|  - 边缘图片转换（Cloudflare Images / imgproxy）                    |
|  - 提供静态资产（媒体文件）                                        |
+--+------------------------------+--+------------------------------+
   |                              |  |
   | 缓存未命中                   |  | 始终（写入不缓存）
   v                              |  v
+--+---------------------------+  |  +------------------------------+
|   内容分发 API               |  |  |   内容管理 API               |
|   （只读，高性能）            |  |  |   （CRUD、认证、验证）        |
|                              |  |  |                              |
|   - REST + GraphQL           |  |  |   - REST 端点                |
|   - 响应缓存 (Redis)         |  |  |   - Schema 验证              |
|   - 引用解析                 |  |  |   - 版本控制                 |
|   - 语言环境协商             |  |  |   - 权限执行                 |
|   - 查询优化                 |  |  |   - 审计日志                 |
+--+---------------------------+  |  +--+--+--+---------------------+
   |                              |     |  |  |
   |                              |     |  |  +-----> Webhook 服务
   |                              |     |  |         （异步投递、
   |                              |     |  |          重试、签名）
   |                              |     |  |
   |  +---------------------------+     |  +-----> 定时操作
   |  |                                 |          Worker（基于 cron、
   |  |                                 |          发布/取消发布）
   v  v                                 v
+--+--+--+     +------------------+  +--+------------------+
| 只读   |     | 搜索索引         |  | 媒体资产            |
| 副本   |<---| (Elasticsearch)  |  | 管道                |
| (PG)   |    |                  |  |                     |
+--+-----+    | - 全文搜索       |  | - 上传服务          |
   |          | - 分面过滤       |  | - 图片处理器        |
   |          | - 自动补全       |  |   (Sharp/imgproxy)  |
   v          +------------------+  | - 视频转码器        |
+--+-----+                         |   (FFmpeg/MediaConvert)
| 主数据库|                         | - CDN 失效          |
| (PG)   |                         +--+------------------+
| - 条目  |                            |
| - 类型  |                            v
| - 用户  |                         +--+------------------+
| - 审计  |                         | 对象存储            |
+----------+                         | (S3 / GCS)          |
                                     | - 原始文件          |
   +-------------------+             | - 派生变体          |
   | 缓存层            |             +---------------------+
   | (Redis Cluster)    |
   |                    |
   | - 分发缓存         |            +---------------------+
   | - 会话存储         |            | 预览服务            |
   | - 速率限制         |            | - 草稿渲染          |
   | - CDN 标签映射     |            | - 令牌门控访问      |
   +-------------------+             +---------------------+
```

### 请求流程：内容分发

```
客户端请求：GET /v1/delivery/entries?content_type=blog_post&locale=en

1. CDN 层
   - 检查缓存：key = hash(path + query + locale)
   - 缓存命中 (90%)：返回缓存响应 (< 10ms)
   - 缓存未命中：转发到源站

2. 内容分发 API
   - 解析查询参数（content_type、过滤器、locale、分页）
   - 检查 Redis 缓存是否有精确查询匹配
   - Redis 命中：返回缓存响应
   - Redis 未命中：查询数据库

3. 数据库查询
   - 查询只读副本：
     SELECT id, published_fields, published_at
     FROM entries
     WHERE space_id = $1
       AND content_type_id = $2
       AND status = 'published'
       AND deleted_at IS NULL
     ORDER BY published_at DESC
     LIMIT $3 OFFSET $4
   - 解析引用（批量加载被引用的条目）
   - 应用语言环境解析（回退链）

4. 响应组装
   - 构建 JSON/GraphQL 响应
   - 设置 Cache-Control 头：max-age=60, s-maxage=3600
   - 设置 Surrogate-Key 头用于定向失效
   - 存储到 Redis（TTL = 5 分钟）
   - 返回给 CDN（CDN 缓存 s-maxage 时长）
```

### 请求流程：内容发布

```
编辑通过管理 UI 发布条目：POST /v1/entries/{entryId}/publish

1. 管理 API
   - 认证用户 (JWT)
   - 授权：检查角色是否拥有此内容类型的发布权限
   - 验证条目：所有必填字段存在，引用有效

2. 数据库事务
   BEGIN;
     -- 创建版本快照
     INSERT INTO entry_versions (entry_id, version_number, fields, status, created_by)
     VALUES ($1, $2, $3, 'published', $4);

     -- 更新条目
     UPDATE entries SET
       status = 'published',
       published_fields = fields,       -- 将当前字段冻结为已发布
       published_version = current_version,
       published_by = $4,
       published_at = NOW(),
       first_published_at = COALESCE(first_published_at, NOW());

     -- 记录审计
     INSERT INTO audit_logs (space_id, entity_type, entity_id, action, actor_id)
     VALUES ($5, 'entry', $1, 'publish', $4);
   COMMIT;

3. 发布后事件（通过消息队列异步执行）
   - 失效 CDN 缓存（surrogate key 清除）
   - 失效 Redis 缓存中受影响的查询
   - 更新 Elasticsearch 索引
   - 触发 webhooks（entry.publish 事件）
   - 通知 SSG 重建（如已配置）

4. 响应
   - 返回状态为 'published' 的更新后条目
```

---

## 深入探讨：内容建模

### 动态 Schema 定义

内容类型由 CMS 用户（开发人员或内容架构师）在运行时定义，而非硬编码。系统必须验证并执行这些动态 schema。

```
内容类型注册流程：

1. 用户通过管理 UI 或 API 定义内容类型
2. 系统验证字段定义：
   - 无重复的 api_identifier
   - 引用字段指向已存在的内容类型
   - 验证规则对字段类型有效
   - 无循环必需引用
3. 将内容类型定义存储到 content_types + content_type_fields 表中
4. 生成 GraphQL schema 片段（用于分发 API）
5. 更新 Elasticsearch mapping（用于搜索）

条目写入时的 Schema 验证：

  function validateEntry(entry, contentType):
    for each field in contentType.fields:
      value = entry.fields[field.api_identifier]

      // 必填检查
      if field.required and value is null/missing:
        error("Field '{field.name}' is required")

      // 类型检查
      if value is not null:
        validateFieldType(field.field_type, value)

      // 本地化检查
      if field.localized:
        for each locale in value:
          if locale not in space.active_locales:
            error("Unknown locale '{locale}'")

      // 自定义验证
      for each validation in field.validations:
        applyValidation(validation, value)

  function validateFieldType(type, value):
    switch type:
      case 'text':       assert typeof value == 'string'（或如果本地化则为 object）
      case 'rich_text':  assert 有效的富文本文档结构
      case 'number':     assert typeof value == 'number'
      case 'boolean':    assert typeof value == 'boolean'
      case 'datetime':   assert 有效的 ISO 8601 字符串
      case 'media':      assert 给定 ID 的资产存在
      case 'reference':  assert 目标条目存在且匹配 reference_type
      case 'json':       assert 根据字段的 JSON schema 验证有效
      case 'location':   assert { lat: number, lon: number }
      case 'enum':       assert value in field.validations.allowed_values
```

### 字段类型与存储

```
+---------------+------------------+------------------------------------+
| 字段类型      | JSONB 存储       | 验证规则                           |
+---------------+------------------+------------------------------------+
| text          | "string value"   | min/max_length、pattern (regex)、  |
|               |                  | unique、prohibited_values          |
+---------------+------------------+------------------------------------+
| rich_text     | { document AST } | max_length（仅文本）、允许的       |
|               |                  | 节点类型、嵌入条目类型             |
+---------------+------------------+------------------------------------+
| number        | 42 or 3.14       | min、max、integer_only             |
+---------------+------------------+------------------------------------+
| boolean       | true/false       | （无）                             |
+---------------+------------------+------------------------------------+
| datetime      | "ISO 8601"       | min_date、max_date                 |
+---------------+------------------+------------------------------------+
| media         | "asset_id"       | mime_types、max_file_size、        |
|               |                  | min/max dimensions                 |
+---------------+------------------+------------------------------------+
| reference     | "entry_id" or    | 允许的内容类型、                   |
|               | ["id1", "id2"]   | min/max items（用于 many）         |
+---------------+------------------+------------------------------------+
| json          | { arbitrary }    | JSON schema 验证                   |
+---------------+------------------+------------------------------------+
| location      | {lat, lon}       | 边界框                             |
+---------------+------------------+------------------------------------+
| enum          | "value"          | allowed_values 列表                |
+---------------+------------------+------------------------------------+
| color         | "#FF5733"        | format（hex、rgb、hsl）            |
+---------------+------------------+------------------------------------+
```

### 内容关系

```
引用类型：

1. 一对一 (cardinality: "one")
   Blog Post -> Author
   存储为："author": "entry_author_042"
   + entry_references 行用于外键完整性

2. 一对多 (cardinality: "many")
   Blog Post -> Tags
   存储为："tags": ["entry_tag_1", "entry_tag_2"]
   + entry_references 行（每个目标一行，带 position）

3. 嵌入条目（在富文本中）
   富文本可以内联嵌入对其他条目的引用：
   {
     "type": "embedded-entry",
     "attrs": { "entry_id": "entry_code_block_001", "type": "code_snippet" }
   }

4. 双向（虚拟）
   不显式存储。通过反向查询计算：
   "查找所有引用 Author X 的条目"
   SELECT source_entry_id FROM entry_references
   WHERE target_entry_id = 'entry_author_042';

删除时的引用完整性：
+---------------------+---------------------------------------------+
| 策略                | 行为                                         |
+---------------------+---------------------------------------------+
| RESTRICT（默认）    | 如果被其他地方引用则不能删除条目             |
| SET_NULL            | 在引用条目中将引用字段设为 null              |
|                     |                                               |
| CASCADE             | 删除引用条目（危险）                         |
| SOFT_DELETE         | 标记为已删除但保持引用完整                   |
+---------------------+---------------------------------------------+

引用解析（分发 API）：
  返回条目时，将引用解析到可配置的深度：
  - include=1（默认）：返回一层深的被引用条目
  - include=5（最大）：解析最多 5 层嵌套引用
  - 循环引用检测：跟踪已访问的条目 ID，如果重访则停止

  批量解析以避免 N+1：
    1. 从响应中收集所有被引用的条目 ID
    2. 批量加载：SELECT * FROM entries WHERE id IN ($1, $2, ...)
    3. 组装成响应树
```

### 内容类型迁移

```
当内容类型 schema 变更时，现有条目可能需要迁移。

迁移类型：

1. 增量型（安全，无需迁移）：
   - 添加新的可选字段
   - 增加 max_length 验证
   - 添加新的允许枚举值

2. 限制型（需要验证通过）：
   - 添加新的必填字段（必须提供默认值或回填）
   - 减少 max_length
   - 移除允许的枚举值
   - 更改字段类型

3. 破坏型（数据丢失风险）：
   - 移除字段
   - 重命名字段

迁移工作流：
+------------------+     +------------------+     +------------------+
| 检测 Schema      |---->| 生成             |---->| 应用迁移         |
| 变更             |     | 迁移计划         |     | （后台任务）     |
+------------------+     +------------------+     +------------------+
                                                         |
                           +-----------------------------+
                           |
                           v
                    +------+-------+
                    | 验证所有     |
                    | 条目         |
                    +--------------+

示例：添加带默认值的必填字段 "category"：

  步骤 1：将字段添加为可选（无需迁移）
  步骤 2：后台任务：UPDATE entries
          SET fields = jsonb_set(fields, '{category}', '"general"')
          WHERE content_type_id = $1
            AND NOT (fields ? 'category');
  步骤 3：将字段标记为必填
  步骤 4：重建此内容类型的 Elasticsearch 索引
```

---

## 深入探讨：版本控制与发布

### 条目生命周期状态机

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
               [deleted]（软删除，30 天内可恢复）

状态转换：
+-------------------+-------------------+----------------------+
| 从                | 到                | 所需角色             |
+-------------------+-------------------+----------------------+
| （新建）          | draft             | author, editor, admin|
| draft             | in_review         | author, editor, admin|
| draft             | published         | editor, admin        |
| in_review         | draft（拒绝）     | editor, admin        |
| in_review         | published         | editor, admin        |
| published         | draft（取消发布） | editor, admin        |
| published         | archived          | admin                |
| draft/published   | archived          | admin                |
| archived          | draft             | admin                |
| any               | deleted           | admin                |
+-------------------+-------------------+----------------------+
```

### 版本管理

```
对条目的每次变更都会创建新版本：

条目："关于微服务的博客文章"
+----------+----------+-----------+------------+------------------+
| 版本     | 状态     | 操作者    | 时间戳     | 变更摘要         |
+----------+----------+-----------+------------+------------------+
| v1       | draft    | alice     | Mar 1 9:00 | 创建条目         |
| v2       | draft    | alice     | Mar 1 10:00| 更新标题         |
| v3       | draft    | alice     | Mar 1 11:00| 添加正文         |
| v4       | in_review| alice     | Mar 1 12:00| 提交审核         |
| v5       | draft    | bob       | Mar 1 14:00| 拒绝：需要       |
|          |          |           |            | 更多细节         |
| v6       | draft    | alice     | Mar 1 16:00| 修改正文         |
| v7       | published| bob       | Mar 2 09:00| 已发布           |
| v8       | draft    | alice     | Mar 3 10:00| 更新新信息       |
|          |          |           |            | （草稿）         |
| v9       | published| bob       | Mar 3 14:00| 重新发布         |
+----------+----------+-----------+------------+------------------+

关键洞察："published_fields" 在 entries 表上是一个冻结快照。
当作者编辑已发布的条目时，"fields"（草稿）与
"published_fields"（线上版本）发生分歧。已发布版本保持线上运行
直到下一次显式发布操作。

版本差异比较：

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

### 版本存储优化

```
朴素方法：为每个版本存储完整的 JSONB 字段。
  100M 条目 x 20 个版本 x 5KB = 10TB（昂贵）

优化策略：

1. 增量压缩
   仅存储连续版本之间的差异：
   Version 1：完整字段 (5KB)
   Version 2：与 v1 的差异 (200B) — 仅变更的字段
   Version 3：与 v2 的差异 (150B)
   ...
   Version N：定期完整快照（每 10 个版本）

   重建版本 K：
     找到 <= K 的最近快照
     向前应用差异到 K

   存储节省：对于典型编辑模式约 80%

2. 分层存储
   最近版本（最近 30 天）：PostgreSQL（热存储，快速访问）
   较旧版本（30 天-1 年）：S3（温存储，可接受延迟）
   归档（> 1 年）：         S3 Glacier（冷存储，很少访问）

   后台任务在层级之间迁移版本。

3. 快照策略
   在以下时间点保留完整快照：
   - 每个已发布的版本（始终完整存储）
   - 每第 10 个版本（用于高效重建）
   - 最新版本（始终完整以便快速读取）
   所有其他版本：增量压缩
```

### 定时发布

```
定时操作 Worker：

  每 30 秒运行一次（或由 pg_cron 等调度器触发）：

  poll_loop:
    SELECT * FROM scheduled_actions
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED;    -- 多 worker 并发安全

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

定时 API：

  POST /v1/entries/{entryId}/schedule
  {
    "action": "publish",
    "scheduled_for": "2026-03-15T06:00:00Z",  // UTC 上午 6 点
    "timezone": "America/New_York"              // 用于显示
  }

  Response:
  {
    "id": "sched_001",
    "entry_id": "entry_abc123",
    "action": "publish",
    "scheduled_for": "2026-03-15T06:00:00Z",
    "status": "pending"
  }

边缘情况：
  - 条目在定时触发前被手动发布：取消定时操作
  - 条目在定时触发前被删除：取消并记录
  - Worker 执行中崩溃：FOR UPDATE SKIP LOCKED 防止重复处理；
    操作保持 pending 状态并在下一个轮询周期中被拾取
  - Worker 之间的时钟偏差：使用数据库时间 (NOW())，而非应用时间
```

---

## 深入探讨：编辑工作流

### 多阶段审批管道

```
工作流定义（以 JSON 形式存储在 workflows 表中）：

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

工作流可视化：

  [草稿] --提交--> [编辑审核] --批准--> [法务审核] --批准--> [已发布]
     ^                      |                              |                          |
     |                  拒绝                            拒绝                      取消发布
     +----------------------+------------------------------+--------------------------+
```

### 基于角色的访问控制

```
权限矩阵：

+---------------------+--------+--------+--------+-------+---------+
| 操作                | 查看者 | 作者   | 编辑   | 管理员| 自定义  |
+---------------------+--------+--------+--------+-------+---------+
| 查看已发布内容      |   是   |  是    |  是    |  是   | 可配置  |
| 查看草稿            |   否   |  自己  |  是    |  是   | 可配置  |
| 创建条目            |   否   |  是    |  是    |  是   | 可配置  |
| 编辑条目            |   否   |  自己  |  是    |  是   | 可配置  |
| 提交审核            |   否   |  自己  |  是    |  是   | 可配置  |
| 批准/拒绝           |   否   |  否    |  是    |  是   | 可配置  |
| 发布                |   否   |  否    |  是    |  是   | 可配置  |
| 删除条目            |   否   |  否    |  否    |  是   | 可配置  |
| 管理内容类型        |   否   |  否    |  否    |  是   | 可配置  |
| 管理用户            |   否   |  否    |  否    |  是   | 可配置  |
| 管理 webhooks       |   否   |  否    |  否    |  是   | 可配置  |
| 上传资产            |   否   |  是    |  是    |  是   | 可配置  |
| 删除资产            |   否   |  自己  |  是    |  是   | 可配置  |
+---------------------+--------+--------+--------+-------+---------+

"自己" = 仅限此用户创建的条目/资产

按内容类型的覆盖（存储在 space_memberships.permissions 中）：

  用户 "alice" 角色为 "author"，但有覆盖：
  {
    "blog_post": { "can_publish": true },   -- alice 可以发布博客文章
    "legal_page": { "can_edit": false }      -- alice 不能编辑法律页面
  }

权限检查算法：

  function canPerform(user, action, entry):
    membership = getSpaceMembership(user, entry.space_id)

    // 首先检查按内容类型的覆盖
    override = membership.permissions[entry.content_type.api_identifier]
    if override and override[action] is defined:
      return override[action]

    // 回退到基于角色的权限
    return ROLE_PERMISSIONS[membership.role][action]

    // 特殊情况："自己" 意味着仅限此用户创建的条目
    if permission == "OWN":
      return entry.created_by == user.id
```

### 评论和变更请求

```
评论模型（附加到条目、特定字段或版本）：

CREATE TABLE entry_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES entries(id),
    parent_id       UUID REFERENCES entry_comments(id),  -- 线程回复
    author_id       UUID NOT NULL REFERENCES users(id),
    -- 锚点：此评论适用于条目中的位置
    field_path      VARCHAR(255),     -- 例如 "body.en" 或 "title.zh"
    version_number  INT,              -- 发表此评论时的版本
    -- 内容
    body            TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
                    -- open, resolved, wont_fix
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

工作流中的评论流程：

  1. 编辑审核条目 v6
  2. 编辑在 "body.en" 字段添加评论：
     "第三段需要添加来源引用。"
  3. 条目被附带评论拒绝，转回草稿状态
  4. 作者看到评论，编辑内容，将评论标记为已解决
  5. 作者重新提交审核（创建 v7）
  6. 编辑看到已解决的评论，验证修复，批准

通知系统：
  触发通知的事件：
  - 条目提交审核 -> 通知编辑
  - 条目被批准/拒绝 -> 通知作者
  - 添加评论 -> 通知条目作者和其他评论者
  - 接近 SLA 截止时间 -> 通知指定审核者
  - 条目已发布 -> 通知作者

  投递方式：
  - 应用内通知源
  - 邮件摘要（可配置频率）
  - Slack/Teams webhook 集成
```

---

## 深入探讨：媒体资产管道

### 上传流程

```
上传架构（直传存储）：

Client                  API Server             Object Storage (S3)
  |                        |                        |
  |  1. 请求上传 URL       |                        |
  |  POST /v1/assets/upload|                        |
  |  { filename, size,     |                        |
  |    content_type }      |                        |
  |----------------------->|                        |
  |                        |  2. 生成预签名          |
  |                        |     PUT URL             |
  |                        |----------------------->|
  |                        |  3. 返回预签名 URL      |
  |                        |<-----------------------|
  |  4. 预签名 URL +       |                        |
  |     asset_id           |                        |
  |<-----------------------|                        |
  |                                                 |
  |  5. 直接上传文件到 S3                            |
  |  PUT presigned_url     |                        |
  |------------------------------------------------>|
  |                        |                        |
  |  6. 上传完成           |                        |
  |  POST /v1/assets/{id}/ |                        |
  |    confirm             |                        |
  |----------------------->|                        |
  |                        |  7. 验证文件存在        |
  |                        |----------------------->|
  |                        |  8. 加入处理队列        |
  |                        |---> [Processing Queue]  |
  |  9. 资产已确认         |                        |
  |<-----------------------|                        |

直传存储的优势：
  - API 服务器永远不处理大文件字节
  - S3 处理大文件（> 100MB）的分片上传
  - 客户端可显示上传进度条
  - 减少 API 服务器的带宽和内存压力
```

### 图片处理管道

```
处理队列 Worker：

  收到资产处理任务时：

  1. 从 S3 下载原始文件
  2. 提取元数据（EXIF、尺寸、色彩配置文件）
  3. 根据资产类型生成变体：

  图片变体：
  +--------------------+----------+--------+---------+
  | 变体               | 宽度     | 格式   | 质量    |
  +--------------------+----------+--------+---------+
  | thumbnail          | 150px    | webp   | 80      |
  | small              | 400px    | webp   | 80      |
  | medium             | 800px    | webp   | 85      |
  | large              | 1200px   | webp   | 85      |
  | xlarge             | 2000px   | webp   | 90      |
  | original_webp      | original | webp   | 90      |
  | original_avif      | original | avif   | 80      |
  +--------------------+----------+--------+---------+

  4. 以可预测的键模式上传变体到 S3：
     s3://assets/{space_id}/{asset_id}/original.{ext}
     s3://assets/{space_id}/{asset_id}/thumb_150.webp
     s3://assets/{space_id}/{asset_id}/w800.webp
     s3://assets/{space_id}/{asset_id}/w1200.webp

  5. 更新资产记录：
     UPDATE assets SET
       processing_status = 'ready',
       width = $1,
       height = $2,
       file_metadata = $3,
       variants = $4
     WHERE id = $5;

  variants JSONB：
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
    // ... 更多变体
  }
```

### 实时图片转换

```
对于预生成变体未覆盖的动态转换：

基于 URL 的转换（类似 Contentful Images API）：

  https://cdn.cms.com/assets/{assetId}/file?w=600&h=400&fit=crop&format=webp&q=85

处理流程：
  1. CDN 收到请求
  2. CDN 检查此精确转换的缓存
  3. 缓存未命中：转发到图片转换服务（imgproxy / Cloudinary）
  4. 转换服务：
     a. 从 S3 获取原始文件
     b. 使用 libvips（通过 imgproxy）或 Sharp 应用转换
     c. 返回转换后的图片
  5. CDN 缓存转换后的图片（TTL = 30 天）

支持的转换：
+------------------+------------------------------------------+
| 参数             | 描述                                     |
+------------------+------------------------------------------+
| w (width)        | 目标宽度（像素）                         |
| h (height)       | 目标高度（像素）                         |
| fit              | fill, contain, cover, crop, pad, scale   |
| format           | webp, avif, jpg, png, auto               |
| q (quality)      | 1-100（默认 85）                         |
| focus            | face, center, top, bottom, left, right   |
| blur             | 高斯模糊半径（0-100）                   |
| sharpen          | USM 锐化量                               |
| bg               | pad 模式的背景颜色                       |
+------------------+------------------------------------------+

format=auto：基于 Accept 头的内容协商
  如果浏览器支持 AVIF -> 提供 AVIF
  否则如果浏览器支持 WebP -> 提供 WebP
  否则 -> 提供 JPEG

安全性：
  - URL 签名防止滥用：?w=600&h=400&sig=hmac_sha256(secret, params)
  - 速率限制：每个资产每小时最多 100 个唯一转换
  - 最大尺寸：4096x4096 防止资源耗尽
```

### 视频转码

```
视频处理管道：

  1. 上传视频到 S3（通过预签名 URL，支持分片上传）
  2. 将转码任务加入专用视频队列

  转码 Worker（使用 FFmpeg 或 AWS MediaConvert）：

  输入：original.mp4 (H.264, 1080p, 50MB)

  输出变体：
  +--------------------+----------+---------+----------+---------+
  | 变体               | 分辨率   | 编码    | 比特率   | 格式    |
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

  3. 生成 HLS manifest (.m3u8) 用于自适应比特率流
  4. 在多个时间戳提取海报帧和缩略图
  5. 将所有变体上传到 S3
  6. 用变体 URL 和元数据更新资产记录
  7. 为频繁访问的变体触发 CDN 预热

  处理时间估算：
    1080p 60s 视频：~2-5 分钟（GPU 加速）
    1080p 10 分钟视频：~10-20 分钟
    4K 30 分钟视频：~45-90 分钟
```

---

## 深入探讨：内容分发

### Headless API 架构

```
CMS 暴露两个具有不同特征的独立 API：

+---------------------------+---------------------------+
| 内容管理 API              | 内容分发 API              |
+---------------------------+---------------------------+
| 读写                      | 只读                      |
| 认证（JWT）               | API 密钥或公开            |
| 草稿 + 已发布             | 仅已发布内容              |
| 不缓存                    | 积极缓存                  |
| 99.9% 可用性              | 99.99% 可用性             |
| < 500ms P99              | < 50ms P99（CDN 命中）   |
| 1K 写入/s                | 100K 读取/s              |
| 运行在：5-10 个实例       | 运行在：20-50 个实例      |
+---------------------------+---------------------------+

分发 API 作为独立服务部署，拥有自己的：
  - 数据库只读副本（无写入）
  - Redis 缓存集群
  - 自动伸缩组（基于 QPS 伸缩）
  - CDN 配置
```

### 静态站点生成集成

```
SSG 集成模式（Next.js / Gatsby / Hugo）：

构建时获取：
  1. SSG 构建触发：从分发 API 获取所有已发布条目
  2. 对每个页面，解析内容 + 引用
  3. 生成静态 HTML 文件
  4. 部署到 CDN（Vercel、Netlify、CloudFront）

Webhook 触发的重建：
  CMS 发布条目
    -> Webhook 触发：POST https://api.vercel.com/v1/deployments
       { "trigger": "cms_publish", "entry_id": "..." }
    -> SSG 仅重建受影响的页面 (ISR)
    -> 新静态文件部署

Next.js ISR（增量静态再生）：

  // pages/blog/[slug].tsx
  export async function getStaticProps({ params }) {
    const entry = await cmsClient.getEntry({
      content_type: 'blog_post',
      'fields.slug': params.slug,
      locale: 'en'
    })
    return {
      props: { post: entry },
      revalidate: 60  // 每 60 秒重新生成
    }
  }

按需重新验证（由 webhook 触发）：

  // pages/api/revalidate.ts
  export default async function handler(req, res) {
    const { entry_id, content_type, slug } = req.body

    // 验证 webhook 签名
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // 重新验证特定页面
    await res.revalidate(`/blog/${slug}`)
    return res.json({ revalidated: true })
  }

SSG 的内容分发流程：

  [CMS 发布] -> [Webhook] -> [SSG 构建/重新验证] -> [CDN 部署]
                                        |
                                        v
                               [CDN 上的静态 HTML]
                                        |
                                        v
                               [用户看到更新后的页面]

  从发布到用户可见的总延迟：
    Webhook 投递：        ~5 秒
    ISR 重新验证：        ~10-30 秒
    CDN 传播：            ~5-30 秒
    总计：                ~20-65 秒
```

### 边缘缓存策略

```
缓存层级：

  第 1 层：CDN 边缘缓存（Fastly / CloudFront）
    - 缓存键：hash(path + query_params + locale + Accept header)
    - TTL：由 s-maxage 头控制
    - 失效：发布/取消发布时 surrogate key 清除

  第 2 层：应用缓存 (Redis)
    - 缓存键：hash(query + filters + locale + version_tag)
    - TTL：5 分钟
    - 失效：写入时显式失效

  第 3 层：数据库只读副本
    - 复制延迟：< 100ms
    - 服务所有缓存未命中的查询

Surrogate Key 策略（用于定向 CDN 清除）：

  每个分发 API 响应包含 Surrogate-Key 头：

  GET /v1/delivery/entries?content_type=blog_post

  响应头：
    Surrogate-Key: space_abc type_blog_post entry_001 entry_002 entry_003
    Cache-Control: public, max-age=60, s-maxage=3600

  当 entry_001 被发布/取消发布时：
    清除所有带有 surrogate key "entry_001" 的 CDN 对象
    这将失效：
      - 条目详情页面
      - 包含此条目的任何集合页面
      - 引用此条目的任何页面

  CDN 清除速度快（Fastly：全球 < 150ms）

Cache-Control 头：
+------------------------+-----------------------------------------+
| 端点                   | Cache-Control                           |
+------------------------+-----------------------------------------+
| 集合（列表）           | public, max-age=60, s-maxage=3600       |
| 单个条目               | public, max-age=60, s-maxage=86400      |
| 资产文件               | public, max-age=31536000, immutable     |
| 预览 API               | private, no-cache, no-store             |
| GraphQL                | public, max-age=60, s-maxage=3600       |
+------------------------+-----------------------------------------+

GraphQL 缓存挑战：
  POST 请求默认不被 CDN 缓存。
  解决方案：
  1. 支持 GraphQL 的 GET 请求（查询放在 URL 参数中）
     GET /v1/graphql?query={blogPost(id:"123"){title}}&variables={}
  2. 自动持久化查询 (APQ)：
     客户端发送查询的哈希；服务器从缓存中查找完整查询。
     GET /v1/graphql?extensions={"persistedQuery":{"sha256Hash":"abc..."}}
  3. CDN 级别的查询规范化和缓存
```

---

## 深入探讨：搜索与过滤

### Elasticsearch 集成

```
索引架构：

  每个空间每个内容类型一个 Elasticsearch 索引：
    cms_space_abc_blog_post
    cms_space_abc_author
    cms_space_abc_tag

  从内容类型定义动态生成 mapping：

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

同步策略：
  1. 在条目创建/更新/发布/删除时：
     将索引更新加入消息队列
  2. 索引 worker 处理更新：
     - 在 Elasticsearch 中 upsert 文档
     - 在条目取消发布/删除时删除文档
  3. 定期全量重建索引任务（每周）：
     - 确保数据库和搜索索引之间的一致性
     - 处理任何遗漏的事件
  4. 复制延迟：通常 < 2 秒
```

### 搜索 API

```
全文搜索：

  GET /v1/delivery/entries/search?q=microservices&content_type=blog_post&locale=en

  Elasticsearch 查询：
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

分面过滤：

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

引用遍历搜索：

  "查找作者为 'Jane Smith' 且标签为 'backend' 的所有博客文章"

  这需要跨内容类型联接。两种方法：

  方法 1：索引时反规范化
    索引博客文章时，解析引用并索引反规范化数据：
    { "author_name": "Jane Smith", "tag_names": ["Backend", "Architecture"] }
    优点：搜索快，单次索引查询
    缺点：被引用条目变更时必须重新索引引用条目

  方法 2：两阶段搜索
    阶段 1：按名称查找作者条目 -> 获取作者 entry_id
    阶段 2：搜索带 filter[author]=author_entry_id 的博客文章
    优点：始终一致，无重新索引级联
    缺点：额外往返，延迟更高

  决策：对显示字段（名称、标题）反规范化。使用条目 ID 进行
  过滤。在被引用条目更新时进行重新索引级联（有界：仅引用
  被变更条目的条目）。
```

---

## 深入探讨：本地化 (i18n)

### 多语言内容架构

```
本地化策略：按字段本地化

内容类型中的每个字段可以独立标记为"本地化"或非本地化。

内容类型："Product Page"
  字段：
    name:           localized = true    （每个语言环境不同）
    slug:           localized = true    （每种语言的 URL slug）
    description:    localized = true
    price:          localized = false   （所有语言环境相同）
    sku:            localized = false
    image:          localized = false   （所有地方使用相同图片）
    size_chart:     localized = true    （每个区域不同）

条目字段存储：
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
    // ja: 尚未翻译
  },
  "price": 129.99,           // 非本地化，单值
  "sku": "RS-001",           // 非本地化
  "image": "asset_shoe_001"  // 非本地化
}
```

### 语言环境回退链

```
每个空间的回退配置：

space_locales 表：
  en      （默认，无回退）
  en-US   （回退：en）
  en-GB   （回退：en）
  zh-CN   （回退：zh）
  zh-TW   （回退：zh）
  zh      （回退：en）
  fr-FR   （回退：fr）
  fr      （回退：en）
  ja      （回退：en）

回退链示例：
  zh-CN -> zh -> en
  fr-FR -> fr -> en
  en-GB -> en
  ja -> en

解析算法：

  function resolveLocalizedField(entry, fieldName, requestedLocale, fieldDef):
    if not fieldDef.localized:
      return entry.fields[fieldName]    // 非本地化：原样返回

    localeValues = entry.fields[fieldName]

    // 遍历回退链
    locale = requestedLocale
    while locale is not null:
      if localeValues[locale] is defined and not empty:
        return localeValues[locale]
      locale = getFallbackLocale(locale)

    // 在任何回退中未找到翻译
    return null  // 或返回默认语言环境值并带"缺失"标记

  示例：
    请求语言环境：ja
    字段 "description" 包含：{ "en": "Premium...", "zh": "高端..." }
    解析：ja ->（无 "ja" 值）-> en -> "Premium..."

带语言环境元数据的 API 响应：

  GET /v1/delivery/entries/entry_abc?locale=ja

  Response:
  {
    "fields": {
      "name": "ランニングシューズ",           // 解析：ja（直接）
      "description": "Premium running shoes...",  // 解析：en（回退）
      "price": 129.99                              // 非本地化
    },
    "sys": {
      "locale": "ja",
      "resolved_locales": {
        "name": "ja",
        "description": "en",    // 表示使用了回退
        "price": null            // 非本地化字段
      }
    }
  }
```

### 翻译工作流

```
翻译状态跟踪：

  对每个条目，跟踪每个语言环境的翻译完成度：

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

翻译工作流：

  [英文条目完成] -> [提交翻译]
          |
          v
  +-------+--------+--------+
  |        |        |        |
  v        v        v        v
  [zh]    [fr]    [ja]    [de]     （并行翻译任务）
  |        |        |        |
  v        v        v        v
  [每个语言环境的翻译审核]
  |        |        |        |
  v        v        v        v
  [已批准] -> [发布所有语言环境]

  注意事项：
  - 允许按语言环境发布（en 已发布，zh 仍为草稿）
  - 在翻译进行期间锁定源（en）字段
  - 翻译开始后源内容变更时显示差异
  - 与翻译管理系统集成（Phrase、Crowdin）
    通过 webhook 或直接 API 集成
```

---

## 扩展策略

### 读密集型优化

```
CMS 工作负载极度偏读：
  写:读比 = 1:100 到 1:1000

优化堆栈：

第 1 层：CDN（90-95% 的分发流量）
  - 边缘 100K req/s，延迟 < 10ms
  - 仅 5-10K req/s 到达源站
  - 缓存命中率目标：> 90%

第 2 层：应用响应缓存 (Redis)
  - 缓存常见查询的完整 API 响应
  - 键：hash(content_type + filters + locale + page + include_depth)
  - TTL：5 分钟（或直到被写入失效）
  - 命中率：源站流量的 60-70%

第 3 层：数据库只读副本
  - 每个区域 3-5 个只读副本
  - 所有分发 API 查询走副本
  - 复制延迟 < 100ms（对最终一致性可接受）

第 4 层：连接池
  - PostgreSQL 前面的 PgBouncer
  - 5000 个应用连接 -> 100 个数据库连接
  - 事务级连接池

主数据库的有效负载：
  100K req/s (CDN) -> 5K-10K req/s（源站）-> 1.5K-4K req/s（Redis 未命中）
  -> 分配到 5 个只读副本 = 300-800 req/s 每个副本
  主库仅处理写入：~1K TPS
```

### 写入扩展

```
写入路径更简单但仍需关注：

1. 条目写入 (1K TPS)
   - 单个 PostgreSQL 主库轻松处理 1K TPS
   - 瓶颈：JSONB 验证和索引更新
   - 优化：在应用中验证，使用部分索引

2. 异步处理（从写入路径解耦）
   写入路径（同步）：
     验证 -> 写入数据库 -> 返回响应
     目标：< 500ms

   写入后（通过消息队列异步）：
     -> 失效 CDN 缓存
     -> 失效 Redis 缓存
     -> 更新 Elasticsearch 索引
     -> 投递 webhooks
     -> 生成资产变体

   消息队列：Kafka 或 SQS
     主题：
       cms.entries.created      （按 space_id 分区）
       cms.entries.updated      （按 space_id 分区）
       cms.entries.published    （按 space_id 分区）
       cms.entries.deleted      （按 space_id 分区）
       cms.assets.uploaded      （按 space_id 分区）
       cms.assets.processed     （按 space_id 分区）
       cms.webhooks.deliver     （按 webhook_id 分区）

3. 版本表增长
   2B 版本记录 (10TB) 是显著的。
   按 created_at 分区（按月）以高效清理。
   归档 > 1 年的版本到冷存储。

4. 多区域写入
   对于全球 SaaS：
   - 每个空间"归属"到一个区域
   - 写入进入该区域的主库
   - 跨区域读取通过只读副本
   - 无跨区域写入冲突（空间级隔离）
```

### 数据库分区

```
分区策略：

1. Entries 表：按 space_id 分区（hash）
   - 跨分区均匀分布
   - 查询始终包含 space_id（租户隔离）
   - 根据总条目数使用 16-64 个分区

   CREATE TABLE entries (
     ...
   ) PARTITION BY HASH (space_id);

   CREATE TABLE entries_p0 PARTITION OF entries
     FOR VALUES WITH (modulus 16, remainder 0);
   -- ... 16 个分区

2. Entry Versions：按 created_at 分区（range，按月）
   - 高效清理：DROP PARTITION 删除旧月份
   - 查询始终包含 entry_id（在分区内索引）

3. Audit Logs：按 created_at 分区（range，按月）
   - 写密集型，仅追加
   - 旧分区移至冷存储
   - 保留：在线 2 年，归档 7 年

4. Webhook Deliveries：按 created_at 分区（range，按周）
   - 高容量，短保留（30 天）
   - 每周删除旧分区

5. Assets：不需要分区（50M 行是可管理的）
   - 按 space_id、content_type、tags 索引
```

---

## 部署架构

```
多区域部署：

区域：US-East-1（主要）
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+    +------------------+                      |
|  | CDN 边缘 PoP    |    | CDN 边缘 PoP    |  （200+ 全球 PoP）   |
|  +--------+---------+    +--------+---------+                      |
|           |                       |                                |
|           v                       v                                |
|  +--------+-----------------------+--------+                       |
|  |          负载均衡器 (ALB)              |                       |
|  +----+----------+----------+----+---------+                       |
|       |          |          |    |                                  |
|       v          v          v    v                                  |
|  +----+---+ +----+---+ +---+----+--+ +----+---+                   |
|  |分发    | |分发    | |管理      | |管理                         |
|  |API x20 | |API x20 | |API x5   | |API x5  |                    |
|  +--------+ +--------+ +----------+ +---------+                   |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | Redis Cluster    |    | Elasticsearch    |                      |
|  | （6 节点，3      |    | 集群             |                      |
|  |  主 +             |    | （3 数据节点 +   |                      |
|  |  3 副本）         |    |  2 协调器）      |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | PostgreSQL       |    | PostgreSQL       |                      |
|  | 主库             |    | 只读副本         |                      |
|  | (db.r6g.4xlarge) |    | x5               |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+    +------------------+                      |
|  | Kafka 集群       |    | Worker 节点      |                      |
|  | （3 brokers）    |    | - Webhook x5     |                      |
|  |                  |    | - 搜索索引 x3    |                      |
|  |                  |    | - 资产处理 x10   |                      |
|  |                  |    | - 调度器 x2      |                      |
|  +------------------+    +------------------+                      |
|                                                                    |
|  +------------------+                                              |
|  | S3 存储桶        |  （跨区域复制到 EU、AP）                     |
|  | - 媒体资产       |                                              |
|  | - 版本归档       |                                              |
|  +------------------+                                              |
+------------------------------------------------------------------+

区域：EU-West-1（只读副本区域）
+------------------------------------------------------------------+
|  +------------------+    +------------------+                      |
|  | CDN 边缘 PoP    |    | 负载均衡器       |                      |
|  +--------+---------+    +--------+---------+                      |
|           |                       |                                |
|           v                       v                                |
|  +--------+---------+    +-------+---------+                       |
|  | 分发 API x10     |    | 只读副本 x3     |                      |
|  +------------------+    +-----------------+                       |
|  +------------------+    +------------------+                      |
|  | Redis 副本       |    | ES 副本          |                      |
|  +------------------+    +------------------+                      |
|  +------------------+                                              |
|  | S3 副本          |  （从 US-East-1 复制）                      |
|  +------------------+                                              |
+------------------------------------------------------------------+

管理 API 写入通过代理转发到 US-East-1 主库，
针对欧洲用户。写入增加 ~80ms 延迟（可接受）。
读取从欧洲本地副本提供。
```

### 基础设施规格

```
+---------------------------+-------------------+-------------------+
| 组件                      | 规格              | 月费用（估算）    |
+---------------------------+-------------------+-------------------+
| 分发 API（20 pods）       | 2 vCPU, 4GB RAM   | $2,000            |
| 管理 API（5 pods）        | 2 vCPU, 4GB RAM   | $500              |
| PostgreSQL 主库           | db.r6g.4xlarge     | $3,000            |
| PostgreSQL 副本（5）      | db.r6g.2xlarge     | $5,000            |
| Redis Cluster（6 节点）   | cache.r6g.xlarge   | $2,400            |
| Elasticsearch（5 节点）   | r6g.2xlarge        | $3,500            |
| Kafka（3 brokers）        | kafka.m5.2xlarge   | $2,100            |
| Worker 节点（20 pods）    | 2 vCPU, 4GB RAM   | $2,000            |
| S3 存储 (250TB)           | Standard + IA      | $5,500            |
| CDN (CloudFront)          | 500TB 传输         | $15,000           |
| 负载均衡器（2）           | ALB                | $200              |
+---------------------------+-------------------+-------------------+
| 合计（US-East 主区域）    |                   | ~$41,200/月       |
| EU-West 副本区域          |                   | ~$12,000/月       |
+---------------------------+-------------------+-------------------+
| 总计                      |                   | ~$53,200/月       |
+---------------------------+-------------------+-------------------+
```

---

## 常见面试追问

**问：如何在不停机的情况下处理内容类型 schema 迁移？**

Schema 变更在上线期间必须向后兼容。使用两阶段方法：(1) 增量变更（新的可选字段、放宽的验证）立即应用，无需迁移 -- 旧条目在新 schema 下仍然有效；(2) 破坏性变更（新的必填字段、类型更改）使用迁移管道：首先将新 schema 部署为"草稿"（不在写入时强制执行），运行后台任务回填/转换所有现有条目，验证 100% 合规，然后激活新 schema。在迁移期间，分发 API 继续提供旧的已发布快照。如果要移除字段，先将其标记为"omitted"（从 API 响应中排除但仍然存储），等待 30 天让消费者更新，然后物理删除。对内容类型 schema 本身进行版本控制（content_types.version 列），以便 API 可以提供 schema 感知的响应。

**问：如何实现 CMS 条目的实时协作编辑？**

对于基本的冲突预防，使用乐观锁：每次条目更新包含 expected_version 字段；服务器在版本已更改时拒绝写入（HTTP 409 Conflict）。客户端然后重新获取并合并。对于真正的实时协作（如 Notion），每个条目编辑会话建立 WebSocket 连接。使用 Operational Transform 或 CRDT (Yjs) 按字段而非按文档进行，因为 CMS 条目具有结构化字段。每个本地化字段值可以是独立的协作单元。协作服务器跟踪存在状态（谁在编辑哪个字段）并广播变更。这要复杂得多 -- 大多数 CMS 实现使用更简单的基于锁的方法，一次只允许一个用户编辑条目，锁在 15 分钟不活动后过期。

**问：删除其他条目链接到的已发布条目时如何处理引用完整性？**

在删除前实施引用图检查。查询 entry_references 表：SELECT COUNT(\*) FROM entry_references WHERE target_entry_id = $1。如果存在引用，返回 HTTP 409 并附带引用条目列表。为用户提供三个选项：(1) 取消删除；(2) 先移除所有引用（批量更新引用条目将字段置空）；(3) 强制级联删除（仅管理员，移除引用）。对于分发 API，优雅处理悬空引用 -- 如果找不到被引用的条目，对该引用字段返回 null 而不是整个响应失败。运行每周后台任务检测孤立引用并提醒内容编辑。

**问：如何设计未发布内容的预览系统？**

预览服务通过单独的 API 端点 (/v1/preview/) 提供草稿内容，该端点需要短期预览令牌。当编辑点击"预览"时，管理 API 生成签名的 JWT 令牌（过期：1 小时），包含 entry_id 和 space_id。此令牌嵌入预览 URL：https://preview.mysite.com/blog/my-post?preview_token=xyz。预览服务获取草稿字段（而非 published_fields）并返回。对于基于 SSG 的站点，预览 URL 指向 SSG 框架的预览模式（Next.js draft mode、Gatsby preview）。预览服务绝不能被 CDN 缓存 -- 所有响应包含 Cache-Control: private, no-store。对于多语言预览，在预览令牌中包含 locale 以允许预览特定翻译。

**问：EAV vs JSON 列 vs 文档存储 -- 何时选择哪种？**

EAV (Entity-Attribute-Value) 适用于需要跨任意字段进行原生 SQL 查询且每个实体的字段数量非常多（1000+）的场景，但它会产生糟糕的联接性能，对于大多数 CMS 用例应该避免。JSON/JSONB 列（我们的选择）在内容结构因类型而异、需要灵活 schema 和合理的查询性能、且数据库（PostgreSQL）具有成熟的 JSON 支持和 GIN 索引时效果良好。当内容深度嵌套、永远不需要跨文档事务、且读取模式主要是按 ID 或简单过滤器时，选择文档存储（MongoDB）。混合方法（关系型元数据 + JSONB 内容）兼具两者优势：系统数据（用户、类型、引用）的关系完整性和用户定义内容字段的 schema 灵活性。

**问：如何确保 webhook 投递的可靠性？**

使用带指数退避的至少一次投递。当内容事件发生时，将 webhook 投递记录写入 webhook_deliveries 表并加入 Kafka 队列。Webhook worker：(1) 读取投递记录；(2) 使用 HMAC-SHA256 和 webhook 的密钥签名负载；(3) 以 10 秒超时 POST 到端点；(4) 成功（2xx）时标记为已投递；(5) 失败时使用指数退避安排重试（1 分钟、5 分钟、30 分钟、2 小时、12 小时），最多 5 次尝试；(6) 所有重试耗尽后标记为失败并通知空间管理员。在负载中包含幂等键（webhook_delivery_id）以便消费者去重。在管理 UI 中提供 webhook 投递日志，显示状态、响应码和重试历史。允许手动重试失败的投递。限制 webhook 投递速率以防止压垮消费者端点（每个端点最多 50 个并发投递）。

**问：如何设计系统以高效支持 50+ 种语言环境？**

按字段本地化模型可以很好地扩展，因为非本地化字段无论语言环境数量如何都只存储一次。对于具有 50 种语言环境的本地化字段，JSONB 负载线性增长 -- 200 字符的标题字段跨 50 种语言环境仅增加约 10KB。优化策略：(1) 稀疏存储：仅存储已显式设置的语言环境值（不是每个字段都存所有 50 种）；(2) 分发 API 仅返回请求的语言环境（经过回退解析后），而非所有 50 种；(3) Elasticsearch：仅索引有内容的活跃语言环境（跳过空的）；(4) CDN 缓存：按语言环境缓存（locale 是缓存键的一部分），因此每个语言环境的缓存独立预热；(5) 批量翻译导入：支持 CSV/XLIFF 导入用于批量翻译更新，而非逐字段 API 调用。对于管理 UI，显示语言环境完成度仪表板，以便编辑可以优先安排翻译工作。

**问：如何为全球受众实现低延迟的内容分发？**

多层缓存是关键。第 1 层：拥有 200+ 边缘 PoP 的 CDN 以 < 10ms 服务 90%+ 的分发流量。第 2 层：区域应用缓存（Redis）以 < 5ms 处理 CDN 未命中。第 3 层：区域只读副本以 < 50ms 服务数据库查询。对于变化不频繁的内容（营销页面、产品描述），设置较长的 CDN TTL（24 小时+）并使用 surrogate key 清除进行即时失��。对于频繁更新的内容（新闻、价格），使用较短的 TTL（60 秒）配合 stale-while-revalidate 在后台刷新时提供略微过时的内容。在 3+ 个区域（US、EU、APAC）部署分发 API 实例。使用 anycast DNS 或基于延迟的路由将用户引导到最近的区域。对于资产分发，S3 跨区域复制确保媒体文件从最近区域的 CDN 源站提供。

**问：如何向 CMS 添加 AI 驱动的功能？**

多个 AI 集成点：(1) 内容生成：集成 LLM API 用于起草内容、生成 SEO 元数据、为图片编写替代文本 -- 在编辑器 UI 中作为"AI 助手"按钮暴露；(2) 自动标注：对上传的资产运行图片分类以建议标签；(3) 翻译：使用 MT API（DeepL、Google Translate）作为人工翻译人员的起点；(4) 内容质量：评估可读性（Flesch-Kincaid）、检查语法、检测条目间的重复内容；(5) 智能搜索：使用嵌入（OpenAI、Cohere）进行语义搜索，作为关键词搜索的补充 -- 将嵌入存储在向量索引（pgvector 或 Pinecone）中与 Elasticsearch 并用；(6) 个性化：使用内容嵌入推荐相关条目。所有 AI 功能应该是异步的（基于队列），以避免阻塞内容工作流，结果应该是编辑可以接受或修改的建议 -- 永远不要自动发布 AI 生成的内容。

---

## 总结

### 关键架构决策

| 决策        | 选择                               | 理由                                                      |
| ----------- | ---------------------------------- | --------------------------------------------------------- |
| 内容存储    | PostgreSQL 中的 JSONB 列           | 灵活的 schema 无需 EAV 复杂性；GIN 索引用于查询           |
| Schema 定义 | 运行时定义的内容类型               | 业务用户可以在无需代码部署的情况下创建和修改内容模型      |
| API 风格    | REST（管理）+ REST/GraphQL（分发） | REST 用于 CRUD 简单性；GraphQL 用于前端团队灵活的内容获取 |
| 版本控制    | 带完整快照的追加式版本表           | 实现简单；高效回滚；增量压缩优化存储                      |
| 发布        | 条目上的独立草稿/已发布字段        | 草稿编辑不影响线上内容；原子发布操作                      |
| 缓存        | CDN + Redis + 只读副本（3 层）     | 90%+ CDN 命中率；Redis 捕获常见查询；副本处理其余部分     |
| CDN 失效    | Surrogate key 清除                 | 无需等待 TTL 的定向失效；亚秒级全球清除                   |
| 搜索        | Elasticsearch 异步索引             | 带分面的全文搜索；与写入路径解耦提升性能                  |
| 媒体处理    | 预生成 + 实时变体的异步管道        | 预生成常用尺寸；实时处理长尾；CDN 缓存所有                |
| 本地化      | 带回退链的按字段本地化             | 粒度控制；仅本地化需要的内容；回退防止空内容              |
| Webhooks    | 带指数退避的至少一次投递           | 可靠通知；消费者处理幂等性                                |
| 多租户      | 带 space_id 分区的共享数据库       | 成本高效；行级隔离；按空间分区提升性能                    |
| 工作流      | 按内容类型可配置的状态机           | 灵活的审批管道；不同内容不同工作流                        |
| 部署        | 单写入主库的多区域                 | 简化一致性；分发 API 从本地副本读取                       |

### 权衡

| 权衡                           | 我们的选择              | 替代方案                       | 何时重新考虑                                  |
| ------------------------------ | ----------------------- | ------------------------------ | --------------------------------------------- |
| JSONB vs 规范化表              | 内容字段使用 JSONB      | 规范化 EAV                     | 如果对单个字段的复杂 SQL 报告至关重要         |
| 独立分发 API vs 统一           | 独立（只读）            | 单一 API                       | 如果运维复杂度预算有限；小规模 CMS            |
| 预生成 vs 实时图片             | 两者兼用（混合）        | 仅实时                         | 如果存储成本比计算成本更受关注                |
| 强一致性 vs 最终一致性（分发） | 最终（通过 CDN + 副本） | 强一致性                       | 如果内容准确性攸关生命安全（医疗、法律）      |
| 按字段 vs 按条目本地化         | 按字段                  | 按条目（每个语言环境复制条目） | 如果大多数字段都需本地化；按条目简化模型      |
| GraphQL vs 仅 REST 分发        | 两者支持                | 仅 REST                        | 如果团队缺乏 GraphQL 经验；仅 REST 更容易缓存 |
| 单区域 vs 多区域写入           | 单写入区域              | 多区域带冲突解决               | 如果非主区域的写入延迟变得不可接受（> 300ms） |
