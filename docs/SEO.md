# SEO Improvements

## Problem

The site was invisible to search engines:

- Root page (`/`) rendered a blank page via client-side JS redirect — crawlers saw nothing
- No `robots.txt` or `sitemap.xml`
- No Open Graph or Twitter Card tags — social shares showed no preview
- No per-locale metadata — both `/en` and `/zh` shared the same generic title
- No `hreflang` tags — search engines didn't know about the Chinese version
- No structured data (JSON-LD)

## What Changed

### Files Created

| File | Purpose |
|------|---------|
| `lib/seo.ts` | Shared SEO constants (`BASE_URL`, `SITE_NAME`, `OG_IMAGE`, per-locale meta strings) |
| `components/ClientRedirect.tsx` | Client component that handles browser redirect via `useRouter` |
| `components/JsonLd.tsx` | Renders `<script type="application/ld+json">` for structured data |
| `app/sitemap.ts` | Generates `sitemap.xml` at build time with hreflang alternates |
| `public/robots.txt` | Crawl directives — allows `/`, disallows `/interviews` |
| `public/manifest.json` | Web app manifest for PWA support |

### Files Modified

| File | What Changed |
|------|-------------|
| `app/layout.tsx` | Added `metadataBase`, Open Graph defaults, Twitter Card, title template, manifest link |
| `app/page.tsx` | Converted from blank JS redirect to server component with crawlable `<a>` link + `noindex` |
| `app/[lang]/page.tsx` | Added `generateMetadata` (per-locale title/description/OG/hreflang) + JSON-LD Person schema |
| `app/[lang]/interviews/page.tsx` | Added `robots: { index: false, follow: false }` to hide from search engines |

## How It Works

### Root Redirect Fix

**Before:** `app/page.tsx` was a `'use client'` component that returned `null` and called `router.replace('/en')` inside `useEffect`. Crawlers saw an empty page.

**After:** Server component that renders a visible `<a href="/en">` link (crawlers can follow it), plus a `ClientRedirect` component for browser UX. Metadata marks the root as `noindex` with `canonical` pointing to `/en`.

### Per-Locale Metadata

`app/[lang]/page.tsx` exports `generateMetadata()` which reads the current locale from params and returns localized title, description, canonical URL, hreflang alternates, and Open Graph tags. Meta strings are centralized in `lib/seo.ts`.

### Structured Data (JSON-LD)

The home page renders a `Person` schema using data from the translation files:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Yongjin Huang",
  "jobTitle": "Software Engineer",
  "url": "https://yongjinhuang.github.io/en",
  "sameAs": ["github-url", "linkedin-url"],
  "knowsAbout": ["Golang", "Python", "TypeScript", ...]
}
```

### Sitemap

`app/sitemap.ts` generates a static `sitemap.xml` at build time containing only the home pages (`/en`, `/zh`) with hreflang alternates. Interview pages are excluded.

### Interviews Hidden

Interview pages are blocked from indexing via:
- `robots: { index: false, follow: false }` in page metadata
- `Disallow` rules in `robots.txt`
- Excluded from `sitemap.xml`

## Post-Deploy Steps

1. **Google Search Console** — Add property, verify ownership, submit `sitemap.xml`
2. **Bing Webmaster Tools** — Import from Google or add manually
3. **Baidu Webmaster** — Add site at `ziyuan.baidu.com` (note: Baidu may have trouble crawling GitHub Pages)
4. **LinkedIn / GitHub profiles** — Add website URL for backlinks
5. **Validate** — Use [Google Rich Results Test](https://search.google.com/test/rich-results) and [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)

## Architecture

```
lib/seo.ts                        <-- Shared constants (BASE_URL, META, OG_IMAGE)
  |
  +-- app/layout.tsx              <-- Global defaults (metadataBase, OG, Twitter)
  |
  +-- app/page.tsx                <-- Root redirect (noindex, canonical -> /en)
  |     +-- components/ClientRedirect.tsx
  |
  +-- app/[lang]/page.tsx         <-- Per-locale metadata + JSON-LD Person schema
  |     +-- components/JsonLd.tsx
  |
  +-- app/[lang]/interviews/      <-- noindex, nofollow
  |
  +-- app/sitemap.ts              <-- Static sitemap with hreflang
  |
  +-- public/robots.txt           <-- Crawl rules + sitemap pointer
  +-- public/manifest.json        <-- Web app manifest
```
