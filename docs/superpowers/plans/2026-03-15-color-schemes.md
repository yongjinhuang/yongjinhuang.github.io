# Rotating Color Schemes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 rotating color schemes that auto-cycle every hour with smooth CSS transitions and a manual picker in the navbar.

**Architecture:** CSS `@property` registered custom variables drive all accent colors. A `data-color-scheme` attribute on `<html>` selects the active scheme. A React context manages the hourly timer and manual override (persisted to localStorage). A popover picker in the navbar allows manual selection.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, next-themes, CSS @property, localStorage

**Spec:** `docs/superpowers/specs/2026-03-15-color-schemes-design.md`

---

## File Structure

| File                                 | Action | Responsibility                                                                   |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `app/globals.css`                    | Modify | @property declarations, scheme CSS variables, blob variables, transitions        |
| `lib/color-schemes.ts`               | Create | Scheme name constants and type definitions                                       |
| `components/ColorSchemeProvider.tsx` | Create | React context, hourly timer, localStorage persistence, data-attribute management |
| `components/ColorSchemePicker.tsx`   | Create | Navbar popover UI with colored dots + auto option                                |
| `components/AnimatedBackground.tsx`  | Modify | Replace hardcoded amber colors with CSS variable references                      |
| `components/ThemeToggle.tsx`         | Modify | Replace hardcoded hex colors with CSS variable references                        |
| `tailwind.config.ts`                 | Modify | Replace hardcoded amber in glow-accent shadow                                    |
| `components/layout/Navbar.tsx`       | Modify | Add ColorSchemePicker to right-side nav group                                    |
| `app/[lang]/layout.tsx`              | Modify | Wrap content with ColorSchemeProvider                                            |

---

## Chunk 1: CSS Foundation + Constants

### Task 1: Define color scheme constants

**Files:**

- Create: `lib/color-schemes.ts`

- [ ] **Step 1: Create the color scheme constants file**

```typescript
// lib/color-schemes.ts

export const COLOR_SCHEME_NAMES = [
  'amber',
  'aurora',
  'sunset',
  'ocean',
  'violet',
  'rose',
] as const;

export type ColorSchemeName = (typeof COLOR_SCHEME_NAMES)[number];

export const SCHEME_DISPLAY_COLORS: Record<ColorSchemeName, string> = {
  amber: '#d97706',
  aurora: '#059669',
  sunset: '#dc2626',
  ocean: '#2563eb',
  violet: '#7c3aed',
  rose: '#e11d48',
};

export const STORAGE_KEY = 'color-scheme-override';
```

- [ ] **Step 2: Commit**

```bash
git add lib/color-schemes.ts
git commit -m "feat: add color scheme constants and types"
```

---

### Task 2: Add @property declarations and scheme CSS variables to globals.css

**Files:**

- Modify: `app/globals.css:1-39` (top of file, before and including `:root` and `.dark` blocks)

- [ ] **Step 1: Add @property declarations at the top of globals.css (after the imports, before :root)**

Insert after line 5 (`@tailwind utilities;`):

```css
/* ================================
   CSS @property for animated transitions
   ================================ */
@property --accent {
  syntax: '<color>';
  inherits: true;
  initial-value: #d97706;
}

@property --accent-light {
  syntax: '<color>';
  inherits: true;
  initial-value: #f59e0b;
}

@property --accent-dark {
  syntax: '<color>';
  inherits: true;
  initial-value: #b45309;
}

@property --blob-primary {
  syntax: '<color>';
  inherits: true;
  initial-value: #fbbf24;
}

@property --blob-secondary {
  syntax: '<color>';
  inherits: true;
  initial-value: #d97706;
}
```

- [ ] **Step 2: Add blob variables and transition to `:root` block**

Add to the existing `:root` block (after `--accent-dark`):

```css
/* Blob Colors for AnimatedBackground */
--blob-primary: #fbbf24;
--blob-secondary: #d97706;

/* Smooth color scheme transitions */
transition:
  --accent 1s ease,
  --accent-light 1s ease,
  --accent-dark 1s ease,
  --blob-primary 1s ease,
  --blob-secondary 1s ease;
```

- [ ] **Step 3: Add blob variables to `.dark` block**

Add to the existing `.dark` block (after `--accent-dark`):

```css
--blob-primary: #fcd34d;
--blob-secondary: #f59e0b;
```

- [ ] **Step 4: Add all 6 color scheme selector blocks after the `.dark` block**

Insert after the `.dark { ... }` block (after line 39):

```css
/* ================================
   COLOR SCHEMES
   ================================ */

/* Amber (default - values match :root) */
[data-color-scheme='amber'] {
  --accent: #d97706;
  --accent-light: #f59e0b;
  --accent-dark: #b45309;
  --blob-primary: #fbbf24;
  --blob-secondary: #d97706;
}
.dark[data-color-scheme='amber'] {
  --accent: #fbbf24;
  --accent-light: #fcd34d;
  --accent-dark: #f59e0b;
  --blob-primary: #fcd34d;
  --blob-secondary: #f59e0b;
}

/* Aurora - Cool Emerald */
[data-color-scheme='aurora'] {
  --accent: #059669;
  --accent-light: #34d399;
  --accent-dark: #047857;
  --blob-primary: #34d399;
  --blob-secondary: #059669;
}
.dark[data-color-scheme='aurora'] {
  --accent: #34d399;
  --accent-light: #6ee7b7;
  --accent-dark: #10b981;
  --blob-primary: #6ee7b7;
  --blob-secondary: #10b981;
}

/* Sunset - Bold Crimson */
[data-color-scheme='sunset'] {
  --accent: #dc2626;
  --accent-light: #f87171;
  --accent-dark: #b91c1c;
  --blob-primary: #f87171;
  --blob-secondary: #dc2626;
}
.dark[data-color-scheme='sunset'] {
  --accent: #f87171;
  --accent-light: #fca5a5;
  --accent-dark: #ef4444;
  --blob-primary: #fca5a5;
  --blob-secondary: #ef4444;
}

/* Ocean - Deep Blue */
[data-color-scheme='ocean'] {
  --accent: #2563eb;
  --accent-light: #60a5fa;
  --accent-dark: #1d4ed8;
  --blob-primary: #60a5fa;
  --blob-secondary: #2563eb;
}
.dark[data-color-scheme='ocean'] {
  --accent: #60a5fa;
  --accent-light: #93c5fd;
  --accent-dark: #3b82f6;
  --blob-primary: #93c5fd;
  --blob-secondary: #3b82f6;
}

/* Violet - Rich Purple */
[data-color-scheme='violet'] {
  --accent: #7c3aed;
  --accent-light: #a78bfa;
  --accent-dark: #6d28d9;
  --blob-primary: #a78bfa;
  --blob-secondary: #7c3aed;
}
.dark[data-color-scheme='violet'] {
  --accent: #a78bfa;
  --accent-light: #c4b5fd;
  --accent-dark: #8b5cf6;
  --blob-primary: #c4b5fd;
  --blob-secondary: #8b5cf6;
}

/* Rose - Pink-Red Elegance */
[data-color-scheme='rose'] {
  --accent: #e11d48;
  --accent-light: #fb7185;
  --accent-dark: #be123c;
  --blob-primary: #fb7185;
  --blob-secondary: #e11d48;
}
.dark[data-color-scheme='rose'] {
  --accent: #fb7185;
  --accent-light: #fda4af;
  --accent-dark: #f43f5e;
  --blob-primary: #fda4af;
  --blob-secondary: #f43f5e;
}
```

- [ ] **Step 5: Update hardcoded amber references in globals.css**

Replace `.accent-glow` text-shadow (line 104):

```css
/* Before */
text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
/* After */
text-shadow: 0 0 20px color-mix(in srgb, var(--accent) 30%, transparent);
```

Replace `.dark .glass-card:hover` box-shadow (line 293):

```css
/* Before */
box-shadow: var(--shadow-brutal-lg) rgba(251, 191, 36, 0.2);
/* After */
box-shadow: var(--shadow-brutal-lg)
  color-mix(in srgb, var(--accent) 20%, transparent);
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds. No CSS errors.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat: add @property declarations and color scheme CSS variables"
```

---

### Task 3: Replace hardcoded colors in AnimatedBackground

**Files:**

- Modify: `components/AnimatedBackground.tsx:30-58`

- [ ] **Step 1: Update gradient background (lines 31-34)**

Use `color-mix()` to preserve original opacity ratios:

```tsx
// Before
background: `
  radial-gradient(ellipse 80% 50% at 20% 40%, rgba(251, 191, 36, 0.2), transparent),
  radial-gradient(ellipse 60% 40% at 80% 60%, rgba(217, 119, 6, 0.15), transparent)
`,

// After
background: `
  radial-gradient(ellipse 80% 50% at 20% 40%, color-mix(in srgb, var(--blob-primary) 20%, transparent), transparent),
  radial-gradient(ellipse 60% 40% at 80% 60%, color-mix(in srgb, var(--blob-secondary) 15%, transparent), transparent)
`,
```

- [ ] **Step 2: Update top-left blob gradient (line 46)**

```tsx
// Before
background: 'radial-gradient(circle, rgba(251, 191, 36, 0.6) 0%, transparent 70%)',

// After
background: 'radial-gradient(circle, color-mix(in srgb, var(--blob-primary) 60%, transparent) 0%, transparent 70%)',
```

- [ ] **Step 3: Update bottom-right blob gradient (line 57)**

```tsx
// Before
background: 'radial-gradient(circle, rgba(217, 119, 6, 0.5) 0%, transparent 70%)',

// After
background: 'radial-gradient(circle, color-mix(in srgb, var(--blob-secondary) 50%, transparent) 0%, transparent 70%)',
```

- [ ] **Step 4: Commit**

```bash
git add components/AnimatedBackground.tsx
git commit -m "feat: use CSS variables for animated background blob colors"
```

---

### Task 4: Replace hardcoded colors in ThemeToggle and tailwind.config

**Files:**

- Modify: `components/ThemeToggle.tsx:30`
- Modify: `tailwind.config.ts:28`

- [ ] **Step 1: Update ThemeToggle hover shadow classes (line 30)**

Replace the hardcoded hex values in the className:

```tsx
// Before (within className string)
hover:shadow-[3px_3px_0_#d97706] ... dark:hover:shadow-[3px_3px_0_#fbbf24]

// After
hover:shadow-[3px_3px_0_var(--accent)] ... dark:hover:shadow-[3px_3px_0_var(--accent-light)]
```

- [ ] **Step 2: Update tailwind.config glow-accent (line 28)**

```typescript
// Before
'glow-accent': '0 0 20px rgba(251, 191, 36, 0.4)',

// After
'glow-accent': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ThemeToggle.tsx tailwind.config.ts
git commit -m "feat: replace hardcoded amber colors with CSS variable references"
```

---

## Chunk 2: React Context + Picker UI

### Task 5: Create ColorSchemeProvider

**Files:**

- Create: `components/ColorSchemeProvider.tsx`

- [ ] **Step 1: Create the provider component**

```tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  COLOR_SCHEME_NAMES,
  STORAGE_KEY,
  type ColorSchemeName,
} from '@/lib/color-schemes';

interface ColorSchemeContextValue {
  readonly scheme: ColorSchemeName;
  readonly isAuto: boolean;
  readonly setScheme: (scheme: ColorSchemeName) => void;
  readonly setAuto: () => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null);

function getSchemeForHour(): ColorSchemeName {
  const hour = new Date().getHours();
  return COLOR_SCHEME_NAMES[hour % COLOR_SCHEME_NAMES.length];
}

function getMillisUntilNextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function applyScheme(scheme: ColorSchemeName): void {
  document.documentElement.setAttribute('data-color-scheme', scheme);
}

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorSchemeName>('amber');
  const [isAuto, setIsAuto] = useState(true);

  // Initialize from localStorage or hour
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (
      stored &&
      stored !== 'auto' &&
      COLOR_SCHEME_NAMES.includes(stored as ColorSchemeName)
    ) {
      const storedScheme = stored as ColorSchemeName;
      setSchemeState(storedScheme);
      setIsAuto(false);
      applyScheme(storedScheme);
    } else {
      const hourScheme = getSchemeForHour();
      setSchemeState(hourScheme);
      setIsAuto(true);
      applyScheme(hourScheme);
    }
  }, []);

  // Hourly rotation timer (only when auto)
  useEffect(() => {
    if (!isAuto) return;

    const scheduleNext = () => {
      const ms = getMillisUntilNextHour();
      return setTimeout(() => {
        const nextScheme = getSchemeForHour();
        setSchemeState(nextScheme);
        applyScheme(nextScheme);
        // Schedule the next rotation
        timerRef = scheduleNext();
      }, ms);
    };

    let timerRef = scheduleNext();
    return () => clearTimeout(timerRef);
  }, [isAuto]);

  const setScheme = useCallback((newScheme: ColorSchemeName) => {
    setSchemeState(newScheme);
    setIsAuto(false);
    applyScheme(newScheme);
    localStorage.setItem(STORAGE_KEY, newScheme);
  }, []);

  const setAuto = useCallback(() => {
    const hourScheme = getSchemeForHour();
    setSchemeState(hourScheme);
    setIsAuto(true);
    applyScheme(hourScheme);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ColorSchemeContext.Provider value={{ scheme, isAuto, setScheme, setAuto }}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorScheme(): ColorSchemeContextValue {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error('useColorScheme must be used within a ColorSchemeProvider');
  }
  return context;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ColorSchemeProvider.tsx
git commit -m "feat: add ColorSchemeProvider with hourly rotation and manual override"
```

---

### Task 6: Create ColorSchemePicker

**Files:**

- Create: `components/ColorSchemePicker.tsx`

- [ ] **Step 1: Create the picker component**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useColorScheme } from './ColorSchemeProvider';
import {
  COLOR_SCHEME_NAMES,
  SCHEME_DISPLAY_COLORS,
  type ColorSchemeName,
} from '@/lib/color-schemes';

function SchemeOption({
  name,
  color,
  isActive,
  onClick,
}: {
  readonly name: string;
  readonly color: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10"
      aria-label={`Set color scheme to ${name}`}
    >
      <span
        className="w-4 h-4 rounded-full border-2 shrink-0"
        style={{
          backgroundColor: color,
          borderColor: isActive ? 'currentColor' : 'transparent',
          boxShadow: isActive ? `0 0 0 2px ${color}` : 'none',
        }}
      />
      <span className="capitalize">{name}</span>
    </button>
  );
}

export default function ColorSchemePicker() {
  const { scheme, isAuto, setScheme, setAuto } = useColorScheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-surface-dark border-2 border-gray-300 dark:border-white/20 shadow-[2px_2px_0_rgba(0,0,0,0.1)] dark:shadow-[2px_2px_0_rgba(255,255,255,0.05)] hover:border-accent hover:shadow-[3px_3px_0_var(--accent)] transition-all duration-300"
        aria-label="Change color scheme"
      >
        <span
          className="w-5 h-5 rounded-full"
          style={{ backgroundColor: SCHEME_DISPLAY_COLORS[scheme] }}
        />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-12 w-44 rounded-lg border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-surface-dark shadow-[4px_4px_0_rgba(0,0,0,0.1)] dark:shadow-[4px_4px_0_rgba(255,255,255,0.05)] p-2 z-50"
        >
          {/* Auto option */}
          <button
            onClick={() => {
              setAuto();
              setIsOpen(false);
            }}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10 ${
              isAuto ? 'text-accent' : ''
            }`}
          >
            <span className="w-4 h-4 rounded-full shrink-0 border-2 border-dashed border-gray-400 dark:border-white/40" />
            <span>Auto</span>
            {isAuto && (
              <span className="ml-auto text-xs text-accent">&#10003;</span>
            )}
          </button>

          <div className="h-px bg-gray-200 dark:bg-white/10 my-1" />

          {/* Scheme options */}
          {COLOR_SCHEME_NAMES.map((name: ColorSchemeName) => (
            <SchemeOption
              key={name}
              name={name}
              color={SCHEME_DISPLAY_COLORS[name]}
              isActive={!isAuto && scheme === name}
              onClick={() => {
                setScheme(name);
                setIsOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ColorSchemePicker.tsx
git commit -m "feat: add ColorSchemePicker popover component"
```

---

### Task 7: Wire up providers and navbar

**Files:**

- Modify: `app/[lang]/layout.tsx`
- Modify: `components/layout/Navbar.tsx`

- [ ] **Step 1: Add ColorSchemeProvider to layout**

In `app/[lang]/layout.tsx`, add import and wrap content:

```tsx
// Add import
import { ColorSchemeProvider } from '@/components/ColorSchemeProvider';

// In the JSX, wrap inside ThemeProvider:
<ThemeProvider
  attribute="class"
  defaultTheme="dark"
  enableSystem
  disableTransitionOnChange
>
  <ColorSchemeProvider>
    <div className="min-h-screen relative">
      {/* ... existing content unchanged ... */}
    </div>
  </ColorSchemeProvider>
</ThemeProvider>;
```

- [ ] **Step 2: Add ColorSchemePicker to Navbar**

In `components/layout/Navbar.tsx`, add import and render next to ThemeToggle:

```tsx
// Add import
import ColorSchemePicker from '@/components/ColorSchemePicker';

// In the right-side nav group, add before or after ThemeToggle:
<div className="flex items-center gap-4 md:gap-6">
  <NavLink href="#skills">{nav.skills}</NavLink>
  <NavLink href="#experience">{nav.experience}</NavLink>
  <ColorSchemePicker />
  <ThemeToggle />
</div>;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with static export.

- [ ] **Step 4: Manual test**

Run: `npm run dev`

- Verify the site loads with amber scheme (or hour-based scheme)
- Click the color dot in navbar - popover opens with 6 schemes + Auto
- Click each scheme - colors transition smoothly (~1s)
- Click Auto - scheme matches current hour
- Toggle dark/light mode - colors remain correct for the selected scheme
- Refresh page - manual override persists from localStorage
- Set to Auto, wait for an hour boundary (or manually change system clock) - scheme rotates

- [ ] **Step 5: Commit**

```bash
git add app/[lang]/layout.tsx components/layout/Navbar.tsx
git commit -m "feat: wire up color scheme provider and picker in navbar"
```

- [ ] **Step 6: Final build verification**

Run: `npm run build`
Expected: Static export succeeds with no errors.
