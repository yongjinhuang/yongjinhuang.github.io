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
- **Root Redirect**: Client-side redirect from `/` to `/en` (app/page.tsx)
- **Translation Loading**: Async function `getTranslations(locale)` in app/i18n/settings.ts with fallback to English

Key files:

- `app/page.tsx` - Client-side redirect to default locale (middleware not compatible with static export)
- `app/i18n/settings.ts` - i18n configuration and translation loader
- `app/i18n/locales/` - Translation JSON files
- `app/[lang]/` - Locale-specific pages

### Layout Structure

Two-level layout system:

1. **Root Layout** (`app/layout.tsx`) - Minimal HTML wrapper with suppressHydrationWarning
2. **Locale Layout** (`app/[lang]/layout.tsx`) - Contains theme provider, animated background, custom cursor, and all UI chrome

### Component Organization

The codebase uses a clean component architecture with separation of concerns:

- **UI Components** (`components/ui/`) - Reusable primitives:
  - `Card.tsx` - Glass card with hover effects
  - `Button.tsx` - Brutal-style buttons with variants
  - `IconButton.tsx` - Circular icon buttons for social links
  - `IconContainer.tsx` - Styled icon wrappers
  - `SectionHeader.tsx` - Consistent section headers with tagline/title
  - `Divider.tsx` - Section divider component
  - `SkillTag.tsx` - Animated skill tags

- **Section Components** (`components/sections/`) - Page sections:
  - `Intro.tsx` - Hero/introduction section
  - `Details.tsx` - Personal contact details
  - `Experience.tsx` - Work experience timeline
  - `Education.tsx` - Educational background
  - `Skills.tsx` - Technical skills grid

- **Layout Components** (`components/layout/`) - Layout primitives:
  - `Navbar.tsx` - Navigation bar with theme toggle and language selector

- **Utility Components** (`components/`) - Standalone utilities:
  - `AnimatedBackground.tsx` - CSS-based animated background
  - `CustomCursor.tsx` - Custom cursor with hover effects
  - `ThemeToggle.tsx` - Dark/light mode switcher
  - `LanguageSelector.tsx` - Language switcher (en/zh)
  - `PageTransition.tsx` - Page transition animations
  - `ScrollToTop.tsx` - Scroll-to-top button
  - `Footer.tsx` - Footer component

### Type System

- **Translation Types** (`types/translations.ts`) - Strongly-typed i18n
  - All translation keys are typed, eliminating `any` usage
  - Types are exported from `@/types` for easy import

### Utility Functions

- **Utils** (`lib/utils.ts`) - Shared utilities
  - `cn()` - Class name utility using `clsx` and `tailwind-merge`

### Design System

- **Design Tokens** (`lib/design-system.ts`) - Centralized design tokens
  - Colors, shadows, animations, keyframes, spacing
  - Used by both Tailwind config and components

### Styling System

- **CSS Framework**: Tailwind CSS with custom plugin
- **Design Tokens**: `lib/design-system.ts` defines colors, shadows, animations
- **Custom CSS**: `app/globals.css` defines CSS variables and utility classes
- **Theme Variables**: Supports both light and dark modes with custom color palettes
- **Font**: Poppins (self-hosted in public/fonts/, loaded via app/globals.css)
- **Animation Library**: Framer Motion for animations
- **Class Merging**: Uses `clsx` + `tailwind-merge` via `cn()` utility

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
- **clsx** - Conditional class name construction
- **tailwind-merge** - Merge Tailwind classes without conflicts

## Development Notes

- All content is stored in locale JSON files for easy translation management
- The site uses static site generation (SSG) for all pages
- Custom fonts are downloaded locally to avoid external requests
- ESLint configured with TypeScript, React, and Prettier integration
