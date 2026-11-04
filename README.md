# yongjinhuang.github.io

Personal portfolio and multi-vault Markdown documentation viewer built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS**, statically exported and deployed to GitHub Pages at [https://yongjinhuang.github.io](https://yongjinhuang.github.io).

## Features

- **Bilingual i18n (`en` / `zh`)**: Localized routes (`/en`, `/zh`) backed by strongly typed translation dictionaries (`app/i18n/locales/` and `types/translations.ts`).
- **Dual-Layer Theming**: Light/dark mode via `next-themes` combined with 6 dynamic accent color schemes (`amber`, `aurora`, `sunset`, `ocean`, `violet`, `rose`) that rotate hourly by default or persist user overrides in `localStorage`.
- **Multi-Vault Documentation Viewer (`/[lang]/docs`)**: Interactive reader for Markdown vaults in `public/vaults/` featuring multi-tab navigation, resizable split-pane reading, GFM Markdown, syntax-highlighted code blocks with theme selection, Mermaid diagram rendering, table of contents, and browser print-to-PDF export.
- **Static Export Pipeline**: Configured with `output: 'export'` and a post-build script (`scripts/postbuild.js`) that generates `.nojekyll`, injects `/sitemap.xsl` into `sitemap.xml`, and patches locale `<html lang="...">` attributes across generated HTML pages.

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
  [lang]/            # Locale-scoped portfolio and /docs routes
  i18n/              # Locale configuration and translation JSON files
  globals.css        # Theme CSS variables and utility styles
  sitemap.ts         # Static sitemap generator
components/
  interviews/        # Multi-tab, split-pane Markdown vault viewer components
  layout/            # Navbar, Section, and layout wrappers
  sections/          # Portfolio sections (Intro, Details, Experience, Education, Skills)
  ui/                # Shared brutalist UI primitives
lib/                 # Vault ingestion, color schemes, SEO metadata, and URL hooks
public/
  fonts/             # Self-hosted Plus Jakarta Sans & JetBrains Mono font files
  vaults/            # Markdown documentation vaults
scripts/
  postbuild.js       # Static export post-processing for GitHub Pages
```

## Deployment

Pushes to `main` automatically run lint, typecheck, and static export build via GitHub Actions (`.github/workflows/deploy.yml`) and deploy `./out` to the `gh-pages` branch.
