# Content Management

## What Is It?

Content management is how non-technical people create, edit, organize, and publish content on a website or app. Blog posts, product descriptions, marketing pages, help articles, news updates — all managed through a CMS (Content Management System). As a developer, you're either building a CMS, integrating one, or building features on top of one. Understanding the business workflows (drafts, approvals, publishing schedules) is as important as the technical implementation.

## Why Should You Care?

Almost every website beyond a personal project needs content management. Marketing teams want to update landing pages without filing a Jira ticket. Support teams want to publish help articles. Product teams want to manage feature announcements. If you build a system where every content change requires a developer, you've created a bottleneck. Understanding CMS business flows helps you build (or choose) the right system that empowers content teams while maintaining quality control.

## How It Works (The Business Flow)

### Content Lifecycle

Every piece of content follows a lifecycle:

```
Draft → In Review → Approved → Scheduled → Published → Archived
                ↓
            Rejected → Draft (revised)
```

1. **Draft**: Author writes content. Saves as they go. Not visible to the public
2. **In Review**: Author submits for review. Editor gets notified
3. **Approved / Rejected**: Editor approves (moves toward publishing) or sends back with feedback
4. **Scheduled**: Set to publish at a future date/time (e.g., product launch at 9am Tuesday)
5. **Published**: Live on the site. Visible to everyone
6. **Archived**: Removed from the site but preserved in the system. Can be restored

### Content Modeling

Content is structured into types with defined fields:

- **Blog Post**: title, author, body, featured image, category, tags, publish date
- **Product**: name, description, price, images, specs, category
- **FAQ**: question, answer, category
- **Landing Page**: headline, hero image, sections (flexible layout)

The content model defines what editors can enter. It enforces consistency and makes content queryable.

### Media Management

1. Editors upload images, videos, documents
2. Media library stores and organizes assets with metadata (alt text, dimensions, tags)
3. Images are automatically resized into multiple versions (thumbnail, medium, large)
4. CDN serves the media for fast global delivery
5. Old unused media can be flagged for cleanup

### Versioning & Revision History

1. Every save creates a new version
2. Editors can view the full history of changes
3. Any previous version can be restored with one click
4. Useful for: "Who changed this? When? Why?" and rollback after mistakes

### Multi-Language Content

1. Each piece of content has a "default" language version
2. Translations are linked to the original (not separate copies)
3. When the original is updated, translations are flagged as "needs update"
4. Translation workflow: original → translate → review → publish

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **CMS** | Content Management System — software for managing digital content |
| **Headless CMS** | CMS that provides content via API. No built-in frontend. You build the presentation layer |
| **Traditional CMS** | CMS with a built-in frontend (WordPress, Drupal). Content and display are coupled |
| **WYSIWYG** | "What You See Is What You Get" — a rich text editor that shows formatted content as you type |
| **Markdown** | A lightweight text format that many technical CMS systems use instead of WYSIWYG |
| **Content Type / Model** | The schema for a kind of content (e.g., a Blog Post has title, body, author) |
| **Slug** | URL-friendly version of a title. "My First Post" → `my-first-post` |
| **Taxonomy** | Classification system — categories, tags, hierarchies for organizing content |
| **Widget / Block / Component** | Reusable content chunks that editors can assemble into pages |
| **Content Preview** | Seeing how content will look on the live site before publishing |
| **Workflow** | The approval process content goes through before publishing |
| **Webhook** | CMS sends a notification to your app when content changes (useful for rebuilding static sites) |
| **CDN** | Content Delivery Network — distributes content globally for fast loading |

## Common Patterns

### Pattern 1: Traditional CMS (WordPress, Drupal)

Content is managed and rendered by the same system. Editors use a built-in admin panel. The CMS generates HTML pages.

**When it's used:** Blogs, corporate websites, media sites with high content volume.

**Trade-off:** Quick to set up but frontend customization is limited. PHP ecosystem. Performance can be an issue at scale.

### Pattern 2: Headless CMS (Contentful, Strapi, Sanity)

CMS provides content via REST or GraphQL API. Frontend is a separate app (React, Next.js, etc.) that fetches content from the API.

**When it's used:** Modern websites, multi-platform content delivery (web + mobile + smart displays).

**Trade-off:** More development effort. But total frontend freedom and better performance with SSG/ISR.

### Pattern 3: Git-Based CMS (Netlify CMS, Tina)

Content is stored as files (Markdown, JSON) in a Git repository. Editors use a web interface that commits changes to Git.

**When it's used:** Developer blogs, documentation sites, JAMstack projects.

**Trade-off:** Great version control. But not suitable for non-technical content teams or high-frequency publishing.

### Pattern 4: Page Builder (Notion-like)

Editors build pages from blocks — text, image, video, columns, buttons. Very flexible. Content structure is defined by the editor, not by developers.

**When it's used:** Landing pages, marketing sites where layout needs to change frequently.

**Trade-off:** Harder to enforce consistency. Editors can create messy layouts. Complex to render.

## Gotchas & Edge Cases

- **Rich text is messy**: WYSIWYG editors produce inconsistent HTML. Sanitize and normalize on save, not just on display.
- **Slug conflicts**: Two posts titled "Introduction" both generate the slug `introduction`. Append numbers or dates to avoid conflicts.
- **Scheduled publishing timezone**: "Publish at 9am" — which timezone? The editor's? The server's? The reader's? Make it explicit.
- **Broken references**: Content A embeds Content B. If B is deleted, A has a broken reference. Check for references before allowing deletion.
- **SEO impact of content changes**: Changing a URL (slug) without a redirect breaks Google rankings. Always create 301 redirects.
- **Large media uploads**: Don't upload through your API server. Use direct-to-S3 uploads with presigned URLs.
- **Content preview in headless CMS**: Since the CMS doesn't render pages, preview requires a special endpoint in your frontend that fetches draft content.
- **Cache invalidation on publish**: When content is published, CDN caches need to be purged. Use webhooks to trigger rebuilds or cache invalidation.

## Quick Reference

| Need | Recommended Approach |
|------|---------------------|
| Simple blog | WordPress or headless CMS + static site generator |
| Corporate website | Headless CMS + Next.js with ISR |
| E-commerce content | Headless CMS integrated with commerce platform |
| Documentation | Git-based CMS with Markdown |
| Marketing landing pages | Page builder / block-based CMS |
| Multi-language | CMS with native localization support (Contentful, Sanity) |
| Editorial workflow | CMS with built-in approval flows and user roles |
| Real-time collaboration | Notion-like or Google Docs-style with operational transforms |
