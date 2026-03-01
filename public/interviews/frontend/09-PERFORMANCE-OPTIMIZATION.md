# Frontend Performance Optimization

## Overview

Performance is not a feature -- it is the foundation of user experience. A page that loads in 1 second converts at double the rate of one that loads in 5 seconds. In interviews, performance questions test whether you understand what actually makes applications slow and whether you can measure, diagnose, and fix real bottlenecks rather than applying cargo-cult optimizations. You will be expected to know the Core Web Vitals, the critical rendering path, and a toolbox of practical techniques from lazy loading to virtualization.

## Core Concepts

### Core Web Vitals

Google's Core Web Vitals are the primary metrics for measuring user-perceived performance.

**Largest Contentful Paint (LCP)** - Measures loading performance. The time it takes for the largest visible content element (image, video, text block) to render. Target: under 2.5 seconds.

Causes of poor LCP:
- Slow server response (TTFB)
- Render-blocking CSS/JS
- Slow resource load times
- Client-side rendering delays

Fixes:
- Preload critical resources (`<link rel="preload">`)
- Use a CDN for static assets
- Optimize and compress images
- Server-side render above-the-fold content
- Remove unused CSS

**Interaction to Next Paint (INP)** - Replaced First Input Delay (FID) in March 2024. Measures responsiveness across all interactions during the page lifecycle, not just the first one. Target: under 200 milliseconds.

Causes of poor INP:
- Long JavaScript tasks blocking the main thread
- Excessive re-renders
- Large DOM size
- Heavy event handlers

Fixes:
- Break long tasks with `scheduler.yield()` or `setTimeout`
- Use `startTransition` for non-urgent updates
- Debounce/throttle expensive handlers
- Use web workers for heavy computation

**Cumulative Layout Shift (CLS)** - Measures visual stability. Quantifies unexpected layout shifts during the page lifecycle. Target: under 0.1.

Causes of poor CLS:
- Images without explicit dimensions
- Dynamically injected content above existing content
- Web fonts causing FOIT/FOUT
- Ads or embeds without reserved space

Fixes:
- Always set `width` and `height` on images and videos
- Use `aspect-ratio` CSS property
- Reserve space for dynamic content with skeleton screens
- Use `font-display: swap` with size-adjusted fallback fonts

### Lazy Loading

**Image Lazy Loading** - Only load images when they approach the viewport.

```html
<!-- Native lazy loading -->
<img src="photo.jpg" loading="lazy" width="800" height="600" alt="Photo" />

<!-- Intersection Observer approach -->
<script>
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const img = entry.target
      img.src = img.dataset.src
      img.removeAttribute('data-src')
      observer.unobserve(img)
    }
  })
}, { rootMargin: '200px' })

document.querySelectorAll('img[data-src]').forEach((img) => {
  observer.observe(img)
})
</script>
```

**Component Lazy Loading** - Split code at the component level with React.lazy:

```jsx
import { lazy, Suspense } from 'react'

const HeavyChart = lazy(() => import('./HeavyChart'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))

function Dashboard() {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart />
      </Suspense>

      {showSettings && (
        <Suspense fallback={<Spinner />}>
          <SettingsPanel />
        </Suspense>
      )}
    </div>
  )
}
```

### Code Splitting

Code splitting breaks your bundle into smaller chunks loaded on demand.

**Route-based splitting** - The most impactful approach:

```jsx
import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  )
}
```

**Dynamic imports for heavy libraries**:

```js
// Instead of importing at module level:
// import { PDFDocument } from 'pdf-lib'

// Import only when needed:
async function generatePDF(data) {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  // ... generate PDF
  return doc.save()
}
```

### Bundle Analysis

Use `webpack-bundle-analyzer` or `source-map-explorer` to visualize bundle composition:

```bash
# Webpack
npx webpack-bundle-analyzer dist/stats.json

# Vite
npx vite-bundle-visualizer

# Next.js
# Add @next/bundle-analyzer to next.config.js
ANALYZE=true npm run build
```

Key things to look for:
- Duplicate dependencies (multiple versions of the same library)
- Oversized dependencies (moment.js full locale data, lodash entire library)
- Unused exports that tree shaking missed

### Tree Shaking

Tree shaking eliminates unused code from the final bundle. It relies on ES module static analysis.

```js
// GOOD: Named imports allow tree shaking
import { debounce } from 'lodash-es'

// BAD: Default import pulls in everything
import _ from 'lodash'

// GOOD: Deep import path (for libraries that don't support tree shaking)
import debounce from 'lodash/debounce'
```

Requirements for tree shaking:
- ES modules (`import`/`export`, not `require`/`module.exports`)
- `"sideEffects": false` in package.json (or explicit side-effect files)
- Production mode in the bundler (development preserves everything)

### Virtualization

Render only visible items in long lists. `react-window` and `@tanstack/virtual` are the popular solutions.

```jsx
import { FixedSizeList } from 'react-window'

function VirtualizedList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style} className="list-row">
      <span>{items[index].name}</span>
      <span>{items[index].email}</span>
    </div>
  )

  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  )
}
```

For variable-height items, use `VariableSizeList` and provide an `itemSize` function. For grids, use `FixedSizeGrid`.

### Memoization

Prevent unnecessary recalculations and re-renders.

```jsx
import { memo, useMemo, useCallback } from 'react'

// Memoize a component - skip re-render if props haven't changed
const ExpensiveList = memo(function ExpensiveList({ items, onItemClick }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} onClick={() => onItemClick(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  )
})

function Parent({ rawData }) {
  // Memoize expensive computation
  const processedItems = useMemo(() => {
    return rawData
      .filter((item) => item.active)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
  }, [rawData])

  // Memoize callback to preserve reference
  const handleItemClick = useCallback((id) => {
    console.log('clicked', id)
  }, [])

  return <ExpensiveList items={processedItems} onItemClick={handleItemClick} />
}
```

**When NOT to memoize:**
- Primitive props (strings, numbers, booleans) -- comparison is cheap
- Components that always receive new props anyway
- Lightweight components that render quickly
- Adding `useMemo`/`useCallback` everywhere adds overhead; profile first

### Debouncing and Throttling

**Debounce** - Execute after the user stops triggering the event for a specified delay:

```js
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

// Usage: search input
const handleSearch = debounce((query) => {
  fetchResults(query)
}, 300)
```

**Throttle** - Execute at most once per specified interval:

```js
function throttle(fn, interval) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

// Usage: scroll handler
const handleScroll = throttle(() => {
  updateScrollPosition()
}, 100)
```

### Image Optimization

```html
<!-- Modern formats with fallbacks -->
<picture>
  <source srcset="photo.avif" type="image/avif" />
  <source srcset="photo.webp" type="image/webp" />
  <img src="photo.jpg" alt="Photo" width="800" height="600" loading="lazy" />
</picture>

<!-- Responsive images with srcset -->
<img
  srcset="
    photo-400w.webp 400w,
    photo-800w.webp 800w,
    photo-1200w.webp 1200w
  "
  sizes="(max-width: 600px) 400px, (max-width: 900px) 800px, 1200px"
  src="photo-800w.webp"
  alt="Responsive photo"
  width="800"
  height="600"
  loading="lazy"
  decoding="async"
/>
```

Format comparison:
| Format | Compression | Browser Support | Best For |
|---|---|---|---|
| JPEG | Lossy | Universal | Photos |
| PNG | Lossless | Universal | Graphics, transparency |
| WebP | Both | 97%+ | General replacement for JPEG/PNG |
| AVIF | Both | 92%+ | Best compression, slower encode |
| SVG | N/A | Universal | Icons, illustrations |

### Critical Rendering Path

The browser must complete these steps before displaying content:

1. **Parse HTML** -> Build DOM tree
2. **Parse CSS** -> Build CSSOM tree
3. **Combine** -> Render tree
4. **Layout** -> Calculate geometry
5. **Paint** -> Fill pixels
6. **Composite** -> Layer composition

Optimization strategies:

```html
<!-- Inline critical CSS -->
<head>
  <style>
    /* Only above-the-fold styles */
    body { margin: 0; font-family: sans-serif; }
    .hero { height: 100vh; display: flex; align-items: center; }
  </style>

  <!-- Defer non-critical CSS -->
  <link rel="preload" href="styles.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="styles.css" /></noscript>

  <!-- Preload critical resources -->
  <link rel="preload" href="/fonts/Inter.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/hero-image.webp" as="image" />

  <!-- Prefetch resources for likely next navigation -->
  <link rel="prefetch" href="/about" />

  <!-- DNS prefetch for third-party domains -->
  <link rel="dns-prefetch" href="//api.example.com" />
  <link rel="preconnect" href="https://api.example.com" crossorigin />
</head>

<body>
  <!-- Content -->

  <!-- Defer non-critical JS -->
  <script src="analytics.js" defer></script>
  <script src="app.js" defer></script>
</body>
```

### Font Optimization

```css
/* Self-host fonts to avoid third-party requests */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap; /* Show fallback font while loading */
}

/* Size-adjust fallback to reduce CLS */
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}

body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

`font-display` values:
- `swap` - Show fallback immediately, swap when loaded (best for body text)
- `optional` - Show fallback, only swap if loaded within ~100ms (best for non-critical text)
- `block` - Invisible text for up to 3 seconds (avoid for body text)
- `fallback` - Brief invisible period (~100ms), then fallback, swap within 3s

### Preload vs Prefetch vs Preconnect

| Directive | Priority | When to Use |
|---|---|---|
| `preload` | High | Resources needed for current page (fonts, hero image, critical CSS) |
| `prefetch` | Low | Resources likely needed for next navigation |
| `preconnect` | High | Establish connection to a third-party origin early |
| `dns-prefetch` | Low | Resolve DNS for a third-party domain |
| `modulepreload` | High | Preload ES module scripts |

## Common Interview Questions

### 1. How would you diagnose and fix a slow page load?

Start by measuring with Lighthouse and Chrome DevTools Performance tab. Look at the waterfall chart to identify the longest blocking resource. Check Core Web Vitals in the field with Chrome UX Report (CrUX) or web-vitals library. Common fixes: optimize the critical rendering path (inline critical CSS, defer JS), compress and serve modern image formats, enable gzip/brotli compression, leverage browser caching with appropriate Cache-Control headers, and use a CDN.

### 2. Explain the difference between `defer` and `async` on script tags.

Both load scripts without blocking HTML parsing. `async` executes the script as soon as it downloads, regardless of order -- use it for independent scripts like analytics. `defer` executes scripts in order after HTML parsing completes but before `DOMContentLoaded` -- use it for scripts that depend on the DOM or each other. Without either attribute, the script blocks parsing entirely.

### 3. When would you use React.memo and when would it hurt performance?

Use `React.memo` when a component re-renders frequently with the same props and the render is expensive (large lists, complex DOM, heavy computation). It hurts when the component almost always receives new props (the shallow comparison is wasted work), when the component is cheap to render, or when props are objects/arrays created inline in the parent (they fail shallow comparison every time, requiring custom comparison logic).

### 4. What causes layout shifts and how do you prevent them?

Layout shifts happen when visible elements change position after initial render. Common causes: images without dimensions, dynamically injected content (ads, banners, cookie notices), web font loading causing text reflow, and content loaded above the fold asynchronously. Prevent by always specifying image/video dimensions, reserving space with CSS `aspect-ratio` or min-height, using `font-display: swap` with size-adjusted fallbacks, and adding content to the DOM below the viewport.

### 5. How does virtualization work and when should you use it?

Virtualization renders only the items visible in the viewport plus a small buffer. As the user scrolls, items entering the viewport are rendered and items leaving are unmounted. Use it for lists with more than a few hundred items. The DOM stays small (maybe 20-30 nodes instead of 10,000), making scrolling smooth and memory usage constant. Libraries like `react-window` or `@tanstack/virtual` handle the scroll position math and item recycling.

### 6. Explain how you would implement infinite scrolling with good performance.

Use an Intersection Observer on a sentinel element at the bottom of the list. When it enters the viewport, fetch the next page. Combine with virtualization so that even as the total dataset grows, only visible items are in the DOM. Use React Query's `useInfiniteQuery` for data fetching with automatic caching and deduplication.

```jsx
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'react-intersection-observer'
import { useEffect } from 'react'

function InfiniteList() {
  const { ref, inView } = useInView()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['items'],
    queryFn: ({ pageParam = 0 }) => fetchItems({ offset: pageParam, limit: 20 }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined
  })

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, fetchNextPage])

  const allItems = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      {allItems.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
      <div ref={ref}>
        {isFetchingNextPage ? <Spinner /> : null}
      </div>
    </div>
  )
}
```

### 7. What is the difference between preload, prefetch, and preconnect?

`preload` fetches a resource with high priority for the current page -- use it for fonts, hero images, or critical CSS. `prefetch` fetches with low priority for future navigations -- use it for resources the user is likely to need next. `preconnect` establishes a TCP connection (and TLS handshake) to a third-party origin before any request is made, saving 100-300ms per connection. Use `dns-prefetch` as a lighter alternative when you are less certain the connection will be used.

### 8. How would you reduce bundle size in a React application?

Analyze the bundle first with `webpack-bundle-analyzer`. Replace heavy libraries with lighter alternatives (date-fns instead of moment, lodash-es with cherry-picked imports). Enable code splitting on routes and heavy components. Ensure tree shaking works (ESM imports, `sideEffects: false`). Externalize large dependencies in production. Use dynamic imports for features not needed on initial load. Remove dead code and unused dependencies.

## Code Examples

### Web Vitals Measurement

```js
import { onLCP, onINP, onCLS } from 'web-vitals'

function sendToAnalytics(metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/analytics', body)
  } else {
    fetch('/analytics', { body, method: 'POST', keepalive: true })
  }
}

onLCP(sendToAnalytics)
onINP(sendToAnalytics)
onCLS(sendToAnalytics)
```

### Performance Observer for Long Tasks

```js
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      console.warn('Long task detected:', {
        duration: `${entry.duration}ms`,
        startTime: entry.startTime,
        name: entry.name
      })
    }
  }
})

longTaskObserver.observe({ type: 'longtask', buffered: true })
```

### Yielding to the Main Thread

```js
// Break up long tasks so the browser can respond to user input
async function processLargeDataset(items) {
  const results = []
  const CHUNK_SIZE = 100

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE)

    for (const item of chunk) {
      results.push(transformItem(item))
    }

    // Yield to the main thread between chunks
    if (i + CHUNK_SIZE < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return results
}
```

## Gotchas & Edge Cases

1. **Premature optimization**: Measure before optimizing. `useMemo` on a cheap calculation adds overhead for no benefit. Profile with React DevTools Profiler and Chrome Performance tab.

2. **Lazy loading above-the-fold content**: Never lazy load the hero image or primary content. It delays LCP. Use `loading="eager"` (default) and `fetchpriority="high"` for above-the-fold images.

3. **Over-splitting**: Too many small chunks cause waterfall loading and HTTP overhead. Bundle shared dependencies into a common chunk. Aim for a few strategically split chunks, not hundreds.

4. **Web font preload without crossorigin**: `<link rel="preload" href="font.woff2" as="font">` without `crossorigin` causes a double download. Font preloads always need the `crossorigin` attribute.

5. **Image dimension mismatch**: Setting width/height in HTML that does not match the intrinsic aspect ratio causes either distortion or still causes CLS. Use the actual image aspect ratio.

6. **Debounce losing the last call**: If a user types and immediately clicks away, the debounced function may not fire. Consider using `{ leading: true, trailing: true }` options or flushing on unmount.

7. **Third-party scripts**: A single unoptimized third-party script can block the main thread for seconds. Load them with `async` or `defer`, consider using a web worker (Partytown), or load them after user interaction.

8. **CSS-in-JS runtime cost**: Libraries like styled-components and Emotion compute styles at runtime, which can cause layout shifts and increase INP on re-renders. Consider zero-runtime alternatives like Tailwind CSS, CSS Modules, or vanilla-extract.

## Quick Reference

| Metric | Target | Tool to Measure |
|---|---|---|
| LCP | < 2.5s | Lighthouse, CrUX, web-vitals |
| INP | < 200ms | Chrome DevTools, web-vitals |
| CLS | < 0.1 | Lighthouse, Layout Shift regions in DevTools |
| TTFB | < 800ms | WebPageTest, DevTools Network |
| Total Bundle | < 200KB gzipped (initial) | Bundle analyzer |

| Technique | Impact | Effort | When to Use |
|---|---|---|---|
| Code splitting | High | Low | Always (route-level minimum) |
| Image optimization | High | Low | Any page with images |
| Tree shaking | Medium | Low | Ensure ESM imports |
| Virtualization | High | Medium | Lists > 200 items |
| Memoization | Medium | Low | Profiled expensive renders |
| Font optimization | Medium | Low | Custom web fonts |
| Debounce/Throttle | Medium | Low | Search, scroll, resize handlers |
| Service Worker | High | High | Offline support, caching |
| Web Worker | High | Medium | CPU-intensive operations |
| SSR/SSG | High | Medium-High | SEO, initial load time |
