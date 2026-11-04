# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and technical documentation viewer built with Next.js 16 (App Router) and React 19, statically exported and deployed to GitHub Pages (`https://yongjinhuang.github.io`). Supports English (`en`) and Chinese (`zh`) locales, dark/light themes, dynamic accent color schemes, and a multi-vault Markdown documentation viewer.

## Common Commands

### Development & Build

```bash
npm run dev          # Start Next.js development server
npm run build        # Build static export to ./out ( automatically runs scripts/postbuild.js)
npm start            # Start Next.js server
```

_Note: There is no test suite configured in this repository._

### Code Quality

```bash
npm run lint         # Run ESLint across the project
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Format TypeScript, JSON, and Markdown files with Prettier
```

### Deployment & Assets

```bash
npm run deploy                      # Manually publish ./out to gh-pages branch
./download-fonts.sh                 # Download self-hosted Poppins fonts to public/fonts/
python3 scripts/generate-og-image.py # Regenerate public/og-image.png (requires Pillow)
```

Production deployments run automatically via GitHub Actions (`.github/workflows/deploy.yml`) on pushes to `main`.

## Architecture

### Static Export & Post-Build Pipeline

- **Static Export**: `next.config.ts` sets `output: 'export'` and `images: { unoptimized: true }`. Server features (middleware, dynamic API routes, ISR) are incompatible with this build mode.
- **Post-Build (`scripts/postbuild.js`)**: Triggered automatically via the `postbuild` npm lifecycle script after `next build`. It:
  1. Creates `out/.nojekyll` so GitHub Pages serves `_next/` assets.
  2. Injects the `/sitemap.xsl` stylesheet reference into `out/sitemap.xml`.
  3. Rewrites `<html lang="en">` to the matching locale attribute in generated non-English HTML files (e.g., `out/zh.html`, `out/zh/*.html`) because RootLayout is shared across all static routes.

### Routing & Internationalization (i18n)

- **Locales**: Configured in `app/i18n/settings.ts` (`en` default, `zh`).
- **Translation Data**: Stored in `app/i18n/locales/{en,zh}.json` and strictly typed via `types/translations.ts` (`Translations` interface). Always update both locale JSON files and `types/translations.ts` when adding or changing portfolio copy.
- **Root Redirect (`app/page.tsx`)**: Because static export does not support Next.js middleware redirects, `/` renders a `noindex` server page with a crawlable `<a href="/en">` link and a client-side router redirect (`components/ClientRedirect.tsx`).
- **Locale Routes (`app/[lang]/`)**: Pages use `generateStaticParams()` to pre-render for every locale in `i18n.locales`.
  - `app/[lang]/page.tsx` — Portfolio home page (Intro, Details, Experience, Education, Skills sections).
  - `app/[lang]/docs/page.tsx` — Markdown vault viewer (marked `noindex, nofollow`).

### Markdown Vaults & Docs Viewer (`/[lang]/docs`)

- **Build-Time Ingestion (`lib/vaults.ts`)**: Reads Markdown files from `public/vaults/<vault-name>/` (supporting top-level `.md` files and up to two levels of category subdirectories) at build time during static generation.
- **Client Viewer (`components/interviews/`)**: Renders a multi-tab, split-pane documentation reader (`InterviewViewer`, `SplitPaneViewer`, `TabBar`, `Sidebar`, `TableOfContents`) with GFM Markdown (`react-markdown` + `remark-gfm`), syntax highlighting (`rehype-highlight` with selectable themes in `CodeThemePicker`), client-side Mermaid diagram rendering (`MermaidDiagram`), and PDF export (`html2pdf.js`).
- **URL State (`lib/useFileSelection.ts`)**: Synchronizes selected vault and open file tabs with URL query parameters.

### Theming & Styling System

- **Dual Theme Layers**:
  1. **Light/Dark Mode**: Managed by `next-themes` (`attribute="class"`, default `dark`) in `app/[lang]/layout.tsx`.
  2. **Accent Color Schemes**: Managed by `components/ColorSchemeProvider.tsx` and `lib/color-schemes.ts` (`amber`, `aurora`, `sunset`, `ocean`, `violet`, `rose`). By default, the accent scheme rotates hourly based on the user's local clock unless overridden in `localStorage` (`color-scheme-override`). Sets `data-color-scheme` on `<html>`.
- **CSS Variables (`app/globals.css`)**: Uses CSS `@property` declarations (`--accent`, `--accent-light`, `--accent-dark`, `--blob-primary`, `--blob-secondary`) for smooth 1s color transitions across schemes, alongside brutalist shadow/border utility classes and Tailwind CSS (`tailwind.config.ts`).

### SEO Architecture

- Centralized constants and localized metadata live in `lib/seo.ts`.
- `app/[lang]/page.tsx` generates per-locale Open Graph tags, `hreflang` alternates, and a JSON-LD `Person` schema (`components/JsonLd.tsx`).
- `app/sitemap.ts` statically generates `sitemap.xml` for portfolio pages while excluding `/[lang]/docs`.
