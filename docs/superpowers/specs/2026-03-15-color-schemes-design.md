# Rotating Color Schemes Design

## Overview

Add 6 fancy color schemes that automatically rotate every hour, with manual override via a navbar picker. Colors transition smoothly via CSS crossfade using `@property` registered custom properties.

## Color Schemes

| # | Name | Accent | Light | Dark | Vibe |
|---|------|--------|-------|------|------|
| 1 | Amber (default) | `#d97706` | `#f59e0b` | `#b45309` | Warm golden |
| 2 | Aurora | `#059669` | `#34d399` | `#047857` | Cool emerald |
| 3 | Sunset | `#dc2626` | `#f87171` | `#b91c1c` | Bold crimson |
| 4 | Ocean | `#2563eb` | `#60a5fa` | `#1d4ed8` | Deep blue |
| 5 | Violet | `#7c3aed` | `#a78bfa` | `#6d28d9` | Rich purple |
| 6 | Rose | `#e11d48` | `#fb7185` | `#be123c` | Pink-red elegance |

Each scheme also defines `--blob-primary` and `--blob-secondary` CSS variables (full-opacity colors) for AnimatedBackground gradient blobs. Opacity is applied inline via CSS `opacity` property on the blob elements, not in the color value itself.

## Architecture

### Approach: CSS Variables + Data Attribute

A `data-color-scheme` attribute on `<html>` drives all color changes. CSS selectors like `[data-color-scheme="aurora"]` override the accent CSS variables.

Smooth transitions require `@property` declarations to register each custom property as `<color>` type, since standard CSS `transition` cannot animate unregistered custom properties. Browser support: all modern browsers (Chrome 85+, Safari 15.4+, Firefox 128+). Acceptable for a portfolio site.

This approach was chosen over React Context-only or Tailwind plugin alternatives for:
- Zero JS runtime cost for color application
- Works with static export
- Smooth transitions via CSS `@property`
- Trivially serializable to localStorage

### New Files

#### `components/ColorSchemeProvider.tsx`
Client component wrapping the app. Responsibilities:
- On mount: read `localStorage('color-scheme-override')` for manual override, or calculate scheme from `new Date().getHours() % 6`
- Set `data-color-scheme` attribute on `document.documentElement`
- Calculate milliseconds until the next hour boundary and use `setTimeout` for precise rotation, then set a new timeout for the next hour. This avoids up to 60s delay from polling.
- When manual override is active, no timer runs.
- Expose React context with `{ scheme, setScheme, isAuto, setAuto }` via `useColorScheme()` hook

#### `components/ColorSchemePicker.tsx`
Navbar UI component:
- Small palette icon button (consistent with ThemeToggle styling)
- On click: show popover with 6 colored dots (one per scheme) + "Auto" option
- Clicking a dot: sets manual override via context, persists to localStorage
- Clicking "Auto": clears override, resumes hourly rotation
- Current scheme indicated with a ring/border highlight

### Modified Files

#### `app/globals.css`
- Add `@property` declarations for `--accent`, `--accent-light`, `--accent-dark`, `--blob-primary`, `--blob-secondary` (each with `syntax: '<color>'`, `inherits: true`, and appropriate initial value)
- Add `transition` for the 5 registered properties on `:root` (~1s ease)
- Add `--blob-primary` and `--blob-secondary` variables to `:root` and `.dark`
- Add 6 `[data-color-scheme="X"]` blocks (both light and dark variants) defining all 5 color variables
- Update `.accent-glow` text-shadow to use `var(--accent)` instead of hardcoded `rgba(251, 191, 36, 0.3)`
- Update `.dark .glass-card:hover` box-shadow to use `var(--accent)` instead of hardcoded `rgba(251, 191, 36, 0.2)`

#### `components/AnimatedBackground.tsx`
- Replace hardcoded `rgba(251, 191, 36, ...)` gradient strings with `var(--blob-primary)`
- Replace hardcoded `rgba(217, 119, 6, ...)` gradient strings with `var(--blob-secondary)`
- Opacity is controlled via the existing inline `opacity` style property on each blob element, so the CSS variables hold full-opacity colors
- The `radial-gradient()` in inline styles will use template literals with `var(--blob-primary)` etc.

#### `tailwind.config.ts`
- Update `glow-accent` box-shadow to use `var(--accent)` instead of hardcoded `rgba(251, 191, 36, 0.4)`

#### `components/ThemeToggle.tsx`
- Replace hardcoded `#d97706` and `#fbbf24` hover shadow/color values with `var(--accent)` / `var(--accent-light)` references via Tailwind arbitrary values

#### `components/layout/Navbar.tsx`
- Import and render `<ColorSchemePicker />` next to `<ThemeToggle />` in the right-side nav group

#### `app/[lang]/layout.tsx`
- Add `<ColorSchemeProvider>` as a child of the existing `<ThemeProvider>`, wrapping the rest of the content. The layout file remains a server component; `ColorSchemeProvider` is imported as a client component.

### FOUC Prevention

On initial page load, the `data-color-scheme` attribute is not set until `ColorSchemeProvider` mounts. The default amber scheme in `:root` serves as the fallback, so the worst case is a brief amber flash before the correct scheme applies. This is acceptable since amber is a valid scheme and the transition is smooth. No inline `<script>` is needed.

### `disableTransitionOnChange` Compatibility

The existing `ThemeProvider` uses `disableTransitionOnChange`, which temporarily disables all CSS transitions when toggling dark/light mode. This is independent of color scheme transitions since dark/light toggles are user-initiated discrete actions while color scheme transitions happen on a separate cadence. If both happen simultaneously (unlikely), the dark/light toggle takes visual priority, which is the correct behavior.

## Behavior

- **Hourly rotation**: Scheme index = `new Date().getHours() % 6`. Timer set to fire at the next hour boundary.
- **Manual override**: Persisted in `localStorage('color-scheme-override')`. Survives page refresh.
- **Auto mode**: No localStorage key set (or value is `'auto'`). Hourly rotation active.
- **Dark/light mode**: Orthogonal to color scheme. Each scheme defines both light and dark variants.
- **Smooth transition**: `@property`-registered CSS variables with `transition` provide ~1s crossfade.

## Non-Goals

- No server-side scheme detection (static export)
- No per-page color schemes
- No custom user-defined colors (fixed 6 schemes)
- No Firefox < 128 support for smooth transitions (colors will snap instead)
