# SEO

## What Is It?

SEO (Search Engine Optimization) is making your website findable and rankable by search engines like Google. When someone searches "best project management tool," SEO determines whether your site appears on page 1 or page 50. It covers technical factors (can Google crawl your site?), content factors (does your page answer the query?), and authority factors (do other sites link to you?). As a developer, you own the technical SEO — the code-level decisions that make or break a site's search visibility.

## Why Should You Care?

Organic search traffic is free and often the largest traffic source for websites. A well-optimized site can generate millions of visits without paying for ads. But a single technical mistake — blocking Google's crawler, missing meta tags, slow page loads — can tank a site's rankings overnight. Developers make these mistakes because they don't understand SEO basics. You don't need to be an SEO expert, but you need to know enough to not accidentally break things.

## How It Works (The Business Flow)

### How Search Engines Work

1. **Crawling**: Googlebot visits your site and follows links to discover pages
2. **Indexing**: Google reads the page content and stores it in its index (a massive database)
3. **Ranking**: When a user searches, Google finds relevant pages in the index and ranks them by quality/relevance
4. **Serving**: The ranked results are shown on the search results page (SERP)

### Technical SEO (Developer's Responsibility)

**Crawlability — Can Google find your pages?**

- Your site must be accessible to search engine bots
- `robots.txt` tells crawlers which parts of your site to crawl or skip
- XML sitemap lists all pages you want indexed (submit via Google Search Console)
- Internal linking ensures all important pages are reachable from other pages
- JavaScript-rendered content must be crawlable (SSR/SSG preferred over client-side rendering)

**Indexability — Can Google understand your pages?**

- Each page needs a unique, descriptive `<title>` tag (50-60 characters)
- Each page needs a `<meta name="description">` (150-160 characters)
- Use proper heading hierarchy (`<h1>` once per page, then `<h2>`, `<h3>`)
- Canonical URLs (`<link rel="canonical">`) prevent duplicate content issues
- `noindex` meta tag tells Google not to index a page (use for admin pages, thank-you pages)

**Performance — Is your site fast?**

- **Core Web Vitals**: Google's performance metrics that affect ranking
  - **LCP** (Largest Contentful Paint): Main content loads in < 2.5s
  - **INP** (Interaction to Next Paint): Page responds to interaction in < 200ms
  - **CLS** (Cumulative Layout Shift): Layout doesn't jump around (score < 0.1)
- Fast sites rank better. Optimize images, minimize JavaScript, use CDN

**Mobile-First**

- Google indexes the mobile version of your site first
- Responsive design is a must — not a separate mobile site
- Touch targets must be large enough, text readable without zooming

### Content SEO (Usually Marketing's Responsibility, but Developers Enable It)

- Each page should target a specific search query (keyword)
- Content should be comprehensive, original, and useful
- Heading structure should be logical and include relevant terms
- Images should have descriptive `alt` text

### Structured Data (Schema Markup)

Machine-readable metadata that helps Google understand your content:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Running Shoes",
    "image": "https://example.com/shoes.jpg",
    "description": "Lightweight running shoes",
    "offers": {
      "@type": "Offer",
      "price": "89.99",
      "priceCurrency": "USD"
    }
  }
</script>
```

This enables rich results in Google — star ratings, price info, FAQ dropdowns, recipe cards, etc.

## Key Terms You'll Hear

| Term                 | What It Means                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **SERP**             | Search Engine Results Page — what you see when you Google something                               |
| **Organic Traffic**  | Visitors who find you through search (not ads)                                                    |
| **Keyword**          | The search query you want to rank for ("project management tool")                                 |
| **Backlink**         | A link from another website to yours. More quality backlinks = higher authority                   |
| **Domain Authority** | A score estimating how likely a domain is to rank (not a Google metric, but widely used)          |
| **Crawl Budget**     | How many pages Google will crawl on your site in a given period. Matters for large sites          |
| **Index**            | Google's database of web pages. "Getting indexed" = appearing in Google's database                |
| **Canonical URL**    | The "official" version of a page when duplicate versions exist                                    |
| **301 Redirect**     | Permanent redirect from old URL to new URL. Passes SEO value                                      |
| **404 Page**         | Page not found. Too many 404s = poor user experience = ranking penalty                            |
| **Rich Results**     | Enhanced search results with extra visual info (stars, prices, images) powered by structured data |
| **Core Web Vitals**  | Google's page experience metrics (LCP, INP, CLS)                                                  |
| **Sitemap**          | An XML file listing all URLs on your site, submitted to search engines                            |
| **robots.txt**       | A file telling crawlers which URLs to crawl or skip                                               |

## Common Patterns

### Pattern 1: Server-Side Rendering (SSR) / Static Site Generation (SSG)

HTML is generated on the server so search engines receive complete content.

**When it's used:** Content-heavy sites, e-commerce, blogs. Next.js, Nuxt.js, Astro.

**Trade-off:** Faster for crawlers (they don't need to execute JavaScript). Slightly more complex than pure SPA.

### Pattern 2: Client-Side Rendering with Prerendering

SPA that uses a prerendering service (Prerender.io) to serve HTML snapshots to crawlers.

**When it's used:** SPAs that can't switch to SSR but need SEO.

**Trade-off:** Extra service to maintain. Content might be stale for crawlers.

### Pattern 3: Headless CMS + Static Generator

Content is managed in a CMS, pages are statically generated at build time.

**When it's used:** Blogs, documentation sites, marketing sites.

**Trade-off:** Fastest performance (static HTML on CDN). But content updates require a rebuild.

## Gotchas & Edge Cases

- **SPAs are SEO-hostile by default**: A React SPA that renders everything client-side shows an empty `<div>` to Google. Use SSR/SSG or ensure your content is server-rendered.
- **Changing URLs without redirects**: Moving `/blog/my-post` to `/articles/my-post` without a 301 redirect loses all SEO value that URL accumulated. Always redirect.
- **Blocking JavaScript in robots.txt**: If you block CSS/JS files, Google can't render your page properly and may not index it correctly.
- **Duplicate content**: Same content at multiple URLs (http vs https, www vs non-www, trailing slash vs no trailing slash) splits ranking signals. Set canonical URLs.
- **Slow page loads**: A 5-second page load isn't just bad UX — it directly hurts rankings. Optimize Core Web Vitals.
- **Missing alt text on images**: Google can't "see" images. Alt text describes images for search engines and screen readers. Always include it.
- **Pagination SEO**: For paginated content (product listings, blog archives), use proper pagination markup or load-more patterns. Don't make Google crawl infinite scroll.
- **Localized content**: For multi-language sites, use `hreflang` tags to tell Google which language version to show to which users.
- **Soft 404s**: Returning a 200 status code for a page that says "Not Found." Google gets confused. Return proper 404 status codes.

## Quick Reference

| SEO Factor       | Developer Action                                                     |
| ---------------- | -------------------------------------------------------------------- |
| Page title       | Unique `<title>` per page, 50-60 chars, includes target keyword      |
| Meta description | Unique `<meta description>` per page, 150-160 chars                  |
| Headings         | One `<h1>` per page, logical hierarchy                               |
| URLs             | Clean, descriptive, lowercase (`/blog/seo-guide` not `/page?id=123`) |
| Images           | Compressed, lazy-loaded, with descriptive `alt` text                 |
| Performance      | LCP < 2.5s, INP < 200ms, CLS < 0.1                                   |
| Mobile           | Responsive design, readable text, tappable buttons                   |
| Rendering        | SSR/SSG for content pages, not client-only rendering                 |
| Sitemap          | Auto-generated XML sitemap, submitted to Search Console              |
| Redirects        | 301 for permanent URL changes, never break old URLs                  |
| Structured data  | JSON-LD schema markup for products, articles, FAQs                   |
| Canonical        | `<link rel="canonical">` on every page                               |
