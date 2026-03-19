# Data Model: Content Management System (Contentful/WordPress)

A headless CMS provides content infrastructure that decouples content creation from presentation. The data model must support user-defined content structures (content types with custom fields), locale-aware content for internationalization, a full version history for every entry, editorial workflows with approval stages, and webhook-driven integrations. The central design challenge is storing structured content whose schema is defined by users, not by developers.

---

## Table Responsibilities

| Table                   | Purpose                                      | Why It Exists                                                                                                      |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **spaces**              | Top-level content container (like a project) | Isolates content for different sites/apps; each space has its own content types, entries, and settings             |
| **content_types**       | User-defined content schemas                 | Enables non-developers to define structured content (e.g., "Blog Post", "Product") without code changes            |
| **content_type_fields** | Field definitions within a content type      | Describes each field's type, validation, and localization settings; separated from content_types for normalization |
| **entries**             | Individual content records                   | The actual content (a specific blog post, product, etc.); stores field values as locale-aware JSON                 |
| **entry_versions**      | Version history for every entry              | Enables rollback, audit trail, and diff comparison; every save creates a new version                               |
| **entry_references**    | Tracks relationships between entries         | Enables linked content (e.g., a blog post referencing an author entry); supports referential integrity checks      |
| **assets**              | Media files (images, documents, videos)      | Manages binary content separately from structured content; includes CDN integration                                |
| **workflows**           | Editorial approval pipelines                 | Enforces review processes before publishing; configurable per space                                                |
| **webhooks**            | Event-driven integrations                    | Enables downstream systems (CDN, search index, static site builders) to react to content changes                   |

---

## Detailed Field Descriptions

### spaces

| Field          | Type     | Description                                                                             |
| -------------- | -------- | --------------------------------------------------------------------------------------- |
| space_id       | PK, UUID | Unique space identifier                                                                 |
| name           | VARCHAR  | Space display name                                                                      |
| plan_tier      | ENUM     | free, pro, enterprise; determines storage limits, API rate limits, and feature access   |
| default_locale | VARCHAR  | Default language for content (e.g., "en-US"); used as fallback when a locale is missing |
| settings_json  | JSONB    | Space-level settings (enabled locales, default workflow, preview URLs)                  |

### content_types

| Field           | Type        | Description                                                                                                        |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| content_type_id | PK, UUID    | Unique content type identifier                                                                                     |
| space_id        | FK → spaces | Which space this content type belongs to                                                                           |
| name            | VARCHAR     | Display name (e.g., "Blog Post", "Product", "Author")                                                              |
| description     | TEXT        | What this content type represents                                                                                  |
| api_identifier  | VARCHAR     | Machine-readable name used in API queries (e.g., "blogPost"); immutable after creation to avoid breaking consumers |
| version         | INT         | Schema version; incremented on field changes to track content type evolution                                       |

### content_type_fields

| Field            | Type                  | Description                                                                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| content_type_id  | FK, composite PK      | Which content type this field belongs to                                                                          |
| field_id         | VARCHAR, composite PK | Machine-readable field identifier (e.g., "title", "body", "price")                                                |
| name             | VARCHAR               | Human-readable field name shown in the editor UI                                                                  |
| field_type       | ENUM                  | text, rich_text, number, date, boolean, media, reference, json, location; determines editor widget and validation |
| required         | BOOLEAN               | Whether this field must have a value before publishing                                                            |
| localized        | BOOLEAN               | Whether this field has per-locale values; title is typically localized, price typically is not                    |
| validations_json | JSONB                 | Field-specific validation rules (min/max length, regex pattern, allowed content types for references)             |
| default_value    | JSONB                 | Default value for new entries; locale-aware if the field is localized                                             |

### entries

| Field             | Type               | Description                                                                                              |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| entry_id          | PK, UUID           | Unique entry identifier                                                                                  |
| space_id          | FK → spaces        | Which space this entry belongs to                                                                        |
| content_type_id   | FK → content_types | Which content type this entry conforms to                                                                |
| fields_json       | JSONB              | All field values, stored locale-aware: `{"title": {"en": "Hello", "zh": "..."}, "price": {"en": 29.99}}` |
| status            | ENUM               | draft, in_review, published, archived; drives visibility in the delivery API                             |
| published_version | INT                | Which version number is currently live; null if never published                                          |
| created_by        | FK → users         | Who created this entry                                                                                   |
| published_at      | TIMESTAMP          | When the current published version went live; null if unpublished                                        |

### entry_versions

| Field          | Type         | Description                                                                              |
| -------------- | ------------ | ---------------------------------------------------------------------------------------- |
| version_id     | PK, UUID     | Unique version identifier                                                                |
| entry_id       | FK → entries | Which entry this version belongs to                                                      |
| version_number | INT          | Monotonically increasing version number within this entry                                |
| fields_json    | JSONB        | Complete snapshot of all field values at this version; enables point-in-time restoration |
| changed_by     | FK → users   | Who made this change                                                                     |
| created_at     | TIMESTAMP    | When this version was created                                                            |

### entry_references

| Field           | Type                  | Description                                                            |
| --------------- | --------------------- | ---------------------------------------------------------------------- |
| source_entry_id | FK, composite PK      | The entry containing the reference (e.g., a blog post)                 |
| target_entry_id | FK, composite PK      | The entry being referenced (e.g., an author)                           |
| field_id        | VARCHAR, composite PK | Which field in the source entry holds the reference                    |
| reference_type  | VARCHAR               | Type of reference (link, embed); determines how the target is rendered |

### assets

| Field        | Type        | Description                                                                    |
| ------------ | ----------- | ------------------------------------------------------------------------------ |
| asset_id     | PK, UUID    | Unique asset identifier                                                        |
| space_id     | FK → spaces | Which space this asset belongs to                                              |
| title_json   | JSONB       | Locale-aware title: `{"en": "Hero Image", "zh": "..."}`                        |
| file_name    | VARCHAR     | Original uploaded file name                                                    |
| content_type | VARCHAR     | MIME type (image/png, application/pdf, video/mp4)                              |
| file_size    | BIGINT      | File size in bytes; used for storage quota enforcement                         |
| storage_key  | VARCHAR     | S3 object key; the actual file lives in object storage, not the database       |
| cdn_url      | VARCHAR     | Public CDN URL for serving the asset; includes image transformation parameters |
| width        | INT         | Image/video width in pixels; null for non-visual assets                        |
| height       | INT         | Image/video height in pixels; null for non-visual assets                       |

### workflows

| Field         | Type        | Description                                                                                             |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| workflow_id   | PK, UUID    | Unique workflow identifier                                                                              |
| space_id      | FK → spaces | Which space this workflow applies to                                                                    |
| name          | VARCHAR     | Workflow name (e.g., "Standard Review", "Legal Approval")                                               |
| stages_json   | JSONB       | Ordered list of stages with required approvers (e.g., draft → editor_review → legal_review → published) |
| current_stage | VARCHAR     | The active stage for entries in this workflow                                                           |

### webhooks

| Field        | Type        | Description                                                                                 |
| ------------ | ----------- | ------------------------------------------------------------------------------------------- |
| webhook_id   | PK, UUID    | Unique webhook identifier                                                                   |
| space_id     | FK → spaces | Which space this webhook monitors                                                           |
| name         | VARCHAR     | Human-readable webhook name                                                                 |
| url          | VARCHAR     | HTTPS endpoint to receive webhook payloads                                                  |
| events       | ARRAY       | Which events trigger this webhook (entry.publish, entry.update, entry.delete, asset.upload) |
| headers_json | JSONB       | Custom HTTP headers sent with webhook requests (e.g., authentication tokens)                |
| is_active    | BOOLEAN     | Kill switch to disable without deleting configuration                                       |

---

## ER Diagram

```
+------------------+
|      spaces      |
|------------------|
| space_id (PK)    |
| name             |
| plan_tier        |
| default_locale   |
| settings_json    |
+------------------+
   |    |    |    |
   |    |    |    +───* webhooks
   |    |    |
   |    |    +────────* assets
   |    |
   |    +─────────────* workflows
   |
   +──────────────────* content_types
                          |
                          | 1
                          |
              +-----------+-----------+
              |                       |
              +───* content_type_     +───* entries
              |    fields             |
              |                       |
+-------------+-------+    +---------+----------+
| content_type_fields  |    |      entries       |
|-----------------------|    |--------------------|
| content_type_id(FK,PK)|    | entry_id (PK)      |
| field_id (PK)         |    | space_id (FK)       |
| name                  |    | content_type_id(FK) |
| field_type            |    | fields_json         |
| required              |    | status              |
| localized             |    | published_version   |
| validations_json      |    | created_by          |
| default_value         |    | published_at        |
+-----------------------+    +--------------------+
                                |           |
                                | 1         | (source)
                                |           |
                     +----------+---+    +--+-----------------+
                     |entry_versions|    | entry_references   |
                     |--------------|    |--------------------|
                     |version_id(PK)|    |source_entry_id(PK) |
                     |entry_id (FK) |    |target_entry_id(PK) |
                     |version_number|    |field_id (PK)       |
                     |fields_json   |    |reference_type      |
                     |changed_by    |    +--------------------+
                     |created_at    |         |
                     +--------------+         | target_entry_id
                                              | references
                                              | entries.entry_id
+------------------+    +------------------+
|    webhooks      |    |      assets      |
|------------------|    |------------------|
| webhook_id (PK)  |    | asset_id (PK)    |
| space_id (FK)    |    | space_id (FK)    |
| name             |    | title_json       |
| url              |    | file_name        |
| events           |    | content_type     |
| headers_json     |    | file_size        |
| is_active        |    | storage_key      |
+------------------+    | cdn_url          |
                        | width            |
+------------------+    | height           |
|    workflows     |    +------------------+
|------------------|
| workflow_id (PK) |
| space_id (FK)    |
| name             |
| stages_json      |
| current_stage    |
+------------------+

Relationships:
  spaces 1───* content_types
  spaces 1───* entries
  spaces 1───* assets
  spaces 1───* workflows
  spaces 1───* webhooks
  content_types 1───* content_type_fields
  content_types 1───* entries
  entries 1───* entry_versions
  entries *───* entries  (via entry_references, self-referential)
```

---

## Data Flow

1. **Define Content Structure**: Admin creates `content_types` with `content_type_fields`. For example, a "Blog Post" content type with fields: title (text, localized, required), body (rich_text, localized), author (reference to Author content type), hero_image (media), publish_date (date).

2. **Create Entry**: Editor creates an `entries` record. The `fields_json` stores values in a locale-aware format: each localized field has nested locale keys. A new `entry_versions` row is created with version_number = 1.

3. **Edit and Version**: Every save creates a new `entry_versions` row with the complete `fields_json` snapshot. The entry's working copy is updated. Previous versions are preserved indefinitely for rollback.

4. **Reference Tracking**: When an entry references another entry (e.g., blog post links to author), an `entry_references` row is created. This enables: validating that referenced entries exist before publishing, finding all entries that reference a given entry (reverse lookup), and preventing deletion of entries that are still referenced.

5. **Editorial Workflow**: If a workflow is configured, the entry moves through `workflows.stages_json` stages (e.g., draft → editor_review → published). Each stage may require specific approver roles. The entry's `status` reflects its current workflow position.

6. **Publish**: When the entry is published, `status` changes to `published`, `published_version` is set to the current version_number, and `published_at` is set. Only published entries are visible through the delivery API.

7. **Webhook Notification**: Publishing triggers any active `webhooks` configured for the `entry.publish` event. The webhook payload includes the entry data, enabling downstream systems to react.

8. **CDN Cache Invalidation**: Webhook consumers (or the CMS itself) invalidate CDN cache for the affected entry. This ensures the delivery API serves fresh content immediately after publishing.

9. **Content Delivery**: The delivery API serves only published entries. Queries filter by `status = published` and return `fields_json` for the requested locale, falling back to `default_locale` for missing translations.

10. **Rollback**: If a published entry has issues, editors can revert to any previous `entry_versions` by copying its `fields_json` back to the entry and creating a new version (preserving the rollback action in history).

---

## Key Design Decisions for Interviews

- **Why fields_json instead of a normalized field-value table?** Content types are user-defined and vary widely. A normalized approach (EAV pattern) would require one row per field per locale, creating massive join complexity for reading a single entry. JSONB stores the entire entry as one document, enabling single-read retrieval. The content_type_fields table provides the schema for validation, while fields_json provides the storage.

- **Why locale-aware JSON structure?** Storing `{"title": {"en": "Hello", "zh": "..."}}` keeps all locales in one row rather than duplicating the entire entry per locale. This makes it efficient to publish in one locale while another is still in draft, and to fall back to the default locale for untranslated fields.

- **Why full snapshots in entry_versions instead of diffs?** Diffs are smaller but require reconstructing state by replaying changes from the beginning. Full snapshots enable instant rollback and point-in-time retrieval without computation. Storage is cheap; engineering time for diff reconstruction is expensive.

- **Why entry_references as a separate table?** References are embedded in fields_json, but extracting them into a normalized table enables: referential integrity checks (cannot delete a referenced entry), reverse lookups (find all blog posts by this author), and cascade operations. This is a controlled denormalization for query efficiency.

- **Why api_identifier on content_types is immutable?** External consumers (websites, mobile apps) query by api_identifier (e.g., `GET /entries?content_type=blogPost`). Changing it would break all consumers. The name can be renamed freely in the UI, but the api_identifier is permanent.

- **Why webhooks instead of direct integration?** The CMS should not know about its consumers. Webhooks enable any number of downstream systems (static site generators, search indexes, CDN invalidators) to react to content changes without modifying the CMS. This is the publish-subscribe pattern over HTTP.

- **Why separate assets from entries?** Media files have fundamentally different storage characteristics (binary, large, CDN-served) compared to structured content (JSON, small, database-served). Separating them enables independent scaling, CDN optimization, and image transformation pipelines.
