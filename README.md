# yongjinhuang.github.io

Personal portfolio and multi-vault Markdown documentation viewer built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS v4**, statically exported and deployed to GitHub Pages at [https://yongjinhuang.github.io](https://yongjinhuang.github.io).

## Features

- **Bilingual i18n (`en` / `zh`)**: Localized portfolio routes (`/en`, `/zh`) backed by strongly typed translation dictionaries (`app/i18n/locales/` and `types/translations.ts`).
- **Dual-Layer Theming**: Light/dark mode (`components/theme/ThemeProvider.tsx`) combined with 12 dynamic accent color schemes (`lib/color-schemes.ts`) that rotate hourly by default or persist user overrides in `localStorage`.
- **In-Browser Vector Resume PDF (`lib/pdf/`)**: Generates a 1-page A4 vector PDF (`@react-pdf/renderer`) on demand in the currently selected locale and accent color theme.
- **Standalone Documentation IDE (`/docs`)**: Full-viewport 3-pane reader (`components/docs/` & `lib/docs/`) for Markdown vaults in `public/vaults/` featuring collapsible folder trees, full-text search (`⌘K`), multi-tab navigation, resizable split-pane reading, GFM Markdown, syntax-highlighted code blocks with copy headers, Mermaid diagrams, and active-heading table of contents.
- **Static Export Pipeline**: Configured with `output: 'export'` and a post-build script (`scripts/postbuild.js`) that generates `.nojekyll`, injects `/sitemap.xsl` into `sitemap.xml`, and patches locale `<html lang="...">` attributes.

## Development & Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Next.js development server at http://localhost:3000
npm run build        # Build static export to ./out (runs scripts/postbuild.js)
npm run lint         # Run ESLint across the project
npm run lint:fix     # Auto-fix ESLint issues
npm run typecheck    # Run TypeScript compiler checks (tsc --noEmit)
npm run format       # Format TypeScript, JSON, and Markdown files with Prettier
npm run format:check # Verify Prettier formatting without modifying files
npm run deploy       # Publish ./out to the gh-pages branch
```

## Project Structure

```text
app/
  [lang]/            # Locale-scoped portfolio routes (/en, /zh)
  docs/              # Standalone full-viewport Docs IDE route (/docs)
  fonts/             # Self-hosted @font-face declarations
  i18n/              # Locale configuration and translation JSON files
  globals.css        # Tailwind v4 @theme tokens and color scheme variables
  sitemap.ts         # Static sitemap generator
components/
  docs/              # Standalone multi-tab, split-pane Markdown vault viewer
  layout/            # Navbar, Footer, LanguageSelector, AnimatedBackground, ScrollToTop, PageTransition, JsonLd
  sections/          # Portfolio sections (Intro, ContactLedger, Experience, Skills)
  theme/             # ThemeProvider, ThemeToggle, ColorSchemeProvider, ColorSchemePicker
  ui/                # Shared UI primitives (Card, CopyButton, IconButton, SectionHeader, SkillTag)
lib/
  docs/              # Vault ingestion, URL tab sync hook, Markdown slug/TOC helpers, and print helper
  pdf/               # In-browser @react-pdf/renderer resume generator
  color-schemes.ts   # 12 accent color schemes
  seo.ts             # SEO metadata constants
  skills.ts          # Shared technology skill icon map
  utils.ts           # Shared class and CJK formatting utilities
types/
  docs.ts            # Documentation vault types
  translations.ts    # Strongly typed translation schema
```

## Deployment

Pushes to `main` automatically run lint, typecheck, and static export build via GitHub Actions (`.github/workflows/deploy.yml`) and deploy `./out` to the `gh-pages` branch.
