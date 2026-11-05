# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and standalone technical documentation viewer built with Next.js 16 (App Router), React 19, and Tailwind CSS v4, statically exported and deployed to GitHub Pages (`https://yongjinhuang.github.io`). Supports English (`en`) and Chinese (`zh`) locales, dark/light themes, 12 dynamic accent color schemes, in-browser vector PDF resume generation (`@react-pdf/renderer`), and a multi-vault Markdown documentation IDE (`/docs`).

## Common Commands

### Development & Build

```bash
npm run dev          # Start Next.js development server
npm run build        # Build static export to ./out (automatically runs scripts/postbuild.js)
npm start            # Start Next.js server
```

_Note: There is no test suite configured in this repository._

### Code Quality

```bash
npm run lint         # Run ESLint across the project
npm run lint:fix     # Auto-fix ESLint issues
npm run typecheck    # Run TypeScript type checking (tsc --noEmit)
npm run format       # Format TypeScript, JSON, and Markdown files with Prettier
npm run format:check # Check Prettier formatting across project files
```

### Deployment & Assets

```bash
npm run deploy                      # Manually publish ./out to gh-pages branch
./download-fonts.sh                 # Download self-hosted Plus Jakarta Sans, JetBrains Mono & Noto Sans SC fonts to public/fonts/
python3 scripts/generate-og-image.py # Regenerate public/og-image.png (requires Pillow)
```

Production deployments run automatically via GitHub Actions (`.github/workflows/deploy.yml`) on pushes to `main`.

## Architecture

### Directory Structure

```text
app/
  [lang]/            # Locale-scoped portfolio routes (/en, /zh)
  docs/              # Standalone full-viewport Docs IDE route (/docs)
  fonts/             # @font-face declarations (fonts.css)
  i18n/              # Locale settings and translation JSON files (en.json, zh.json)
components/
  docs/              # Standalone Docs IDE components (DocsViewer, DocsHeader, Sidebar, TabBar, SplitPaneViewer, MarkdownContent, CodeBlock, TableOfContents, MermaidDiagram, CodeThemePicker)
  layout/            # Page layout chrome (Navbar, Footer, LanguageSelector, AnimatedBackground, ScrollToTop, PageTransition, JsonLd)
  sections/          # Portfolio sections (Intro, ContactLedger, Experience, Skills)
  theme/             # Theme & color-scheme providers and pickers (ThemeProvider, ThemeToggle, ColorSchemeProvider, ColorSchemePicker)
  ui/                # Reusable design-system primitives (Card, CopyButton, IconButton, SectionHeader, SkillTag)
lib/
  docs/              # Docs ingestion & viewer utilities (vaults.ts [server], useFileSelection.ts, markdown-utils.ts, print-doc.ts)
  pdf/               # In-browser @react-pdf/renderer resume engine (ResumePdfDocument.tsx, export-resume-pdf.ts, config.ts, helpers.tsx, styles.ts)
  color-schemes.ts   # 12 accent color scheme definitions
  seo.ts             # Centralized SEO constants and localized metadata
  skills.ts          # Single source of truth for technology skill icon mappings
  utils.ts           # Shared class merging (cn) and CJK formatting utilities
types/
  docs.ts            # Vault and document interfaces
  translations.ts    # Strictly typed i18n translation schema
```

### Static Export & Post-Build Pipeline

- **Static Export**: `next.config.ts` sets `output: 'export'` and `images: { unoptimized: true }`. Server features (middleware, dynamic API routes, ISR) are incompatible with this build mode.
- **Post-Build (`scripts/postbuild.js`)**: Triggered automatically via the `postbuild` npm lifecycle script after `next build`. It:
  1. Creates `out/.nojekyll` so GitHub Pages serves `_next/` assets.
  2. Injects the `/sitemap.xsl` stylesheet reference into `out/sitemap.xml`.
  3. Recursively rewrites `<html lang="en">` to the matching locale attribute in generated non-English HTML files (`out/zh.html`, `out/zh/**/*.html`).

### Routing & Internationalization (i18n)

- **Locales**: Configured in `app/i18n/settings.ts` (`en` default, `zh`).
- **Translation Data**: Stored in `app/i18n/locales/{en,zh}.json` and strictly typed via `types/translations.ts` (`Translations` interface). Always update both locale JSON files and `types/translations.ts` when adding or changing portfolio copy.
- **Locale Routes (`app/[lang]/page.tsx`)**: Pre-rendered for every locale in `i18n.locales` via `generateStaticParams()`.
- **Standalone Docs Route (`app/docs/page.tsx`)**: Top-level `/docs` route outside `[lang]` with its own full-viewport IDE shell.

### Markdown Vaults & Docs Viewer (`/docs`)

- **Build-Time Ingestion (`lib/docs/vaults.ts`)**: Server-only module that reads Markdown files from `public/vaults/<vault-name>/` at build time during static generation.
- **Client Viewer (`components/docs/` & `lib/docs/`)**: Renders a 3-pane IDE documentation reader (`DocsViewer`, `DocsHeader`, `SplitPaneViewer`, `TabBar`, `Sidebar`, `TableOfContents`, `MarkdownContent`, `CodeBlock`) with GFM Markdown, syntax highlighting, Mermaid diagrams, and URL query synchronization (`lib/docs/useFileSelection.ts`).

### In-Browser Vector Resume PDF (`lib/pdf/`)

- Clicking "View Resume" dynamically loads `@react-pdf/renderer` via `lib/pdf/export-resume-pdf.ts` and renders `lib/pdf/ResumePdfDocument.tsx` into a 1-page A4 vector PDF styled in the user's currently active color scheme (`lib/pdf/config.ts`, `lib/pdf/styles.ts`, `lib/pdf/helpers.tsx`).

### Theming & Styling System

- **Dual Theme Layers (`components/theme/`)**:
  1. **Light/Dark Mode**: Managed by `components/theme/ThemeProvider.tsx`.
  2. **Accent Color Schemes**: Managed by `components/theme/ColorSchemeProvider.tsx` and `lib/color-schemes.ts` (12 schemes, rotating hourly by default unless overridden in `localStorage`).
- **Tailwind CSS v4 (`app/globals.css`)**: Uses `@import 'tailwindcss'`, `@custom-variant dark`, `@theme inline`, and CSS `@property` declarations for smooth 1s color transitions.
