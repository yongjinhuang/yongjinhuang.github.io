# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio website built with Next.js 15, deployed to GitHub Pages. Features internationalization (i18n) support for English and Chinese, with custom animations and theming.

## Common Commands

### Development

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Build static export for production
npm start            # Start production server
```

### Code Quality

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
```

### Deployment

```bash
npm run deploy       # Deploy to GitHub Pages (builds and pushes to gh-pages branch)
```

### Font Management

```bash
./download-fonts.sh  # Download Poppins font files to public/fonts/
```

## Architecture

### Static Export Configuration

- **Output Mode**: Static export (`output: 'export'` in next.config.ts)
- **Deployment Target**: GitHub Pages at https://yongjinhuang.github.io
- **Image Optimization**: Disabled (required for static exports)
- **Post-build**: Automatically creates `.nojekyll` file in output directory

### Internationalization (i18n)

The app uses a custom i18n implementation with locale-based routing:

- **Supported Locales**: English (`en`), Chinese (`zh`)
- **Default Locale**: `en`
- **Translation Files**: `app/i18n/locales/{locale}.json`
- **Route Structure**: `/[lang]/...` - all pages are nested under language parameter
- **Middleware**: Redirects root requests to default locale (middleware.ts:5-20)
- **Translation Loading**: Async function `getTranslations(locale)` in app/i18n/settings.ts with fallback to English

Key files:

- `middleware.ts` - Handles locale detection and redirection
- `app/i18n/settings.ts` - i18n configuration and translation loader
- `app/i18n/locales/` - Translation JSON files
- `app/[lang]/` - Locale-specific pages

### Layout Structure

Two-level layout system:

1. **Root Layout** (`app/layout.tsx`) - Minimal HTML wrapper with suppressHydrationWarning
2. **Locale Layout** (`app/[lang]/layout.tsx`) - Contains theme provider, animated background, custom cursor, and all UI chrome

### Component Organization

- **Profile Components** (`components/Profile/`) - Modular sections:

  - `Intro.tsx` - Hero/introduction section
  - `Details.tsx` - Personal details
  - `Experience.tsx` - Work experience
  - `Education.tsx` - Educational background
  - `Skills.tsx` - Technical skills

- **UI Components** (`components/`) - Standalone utilities:
  - `AnimatedBackground.tsx` - Canvas-based particle animation
  - `CustomCursor.tsx` - Custom cursor with hover effects
  - `ThemeToggle.tsx` - Dark/light mode switcher
  - `LanguageSelector.tsx` - Language switcher (en/zh)
  - `PageTransition.tsx` - Page transition animations
  - `ScrollToTop.tsx` - Scroll-to-top button
  - `Footer.tsx` - Footer component

### Styling System

- **CSS Framework**: Tailwind CSS
- **Custom CSS**: `app/globals.css` defines CSS variables for gradients, colors, shadows
- **Theme Variables**: Supports both light and dark modes with custom color palettes
- **Font**: Poppins (self-hosted in public/fonts/, loaded via app/globals.css)
- **Animation Library**: Framer Motion for animations

### Docker Support

Multi-stage Dockerfile for production deployment:

- Stage 1: Install dependencies
- Stage 2: Build application
- Stage 3: Run with node:22-alpine, non-root user, exposes port 3000

Note: The Dockerfile appears to be for standard Next.js server deployment, but this project uses static export for GitHub Pages.

## Key Dependencies

- **next-themes** - Theme management (dark/light mode)
- **framer-motion** - Animation library
- **react-icons** - Icon library
- **@heroicons/react** - Hero icons
- **react-markdown** - Markdown rendering
- **gh-pages** - GitHub Pages deployment utility

## Development Notes

- All content is stored in locale JSON files for easy translation management
- The site uses static site generation (SSG) for all pages
- Custom fonts are downloaded locally to avoid external requests
- ESLint configured with TypeScript, React, and Prettier integration
