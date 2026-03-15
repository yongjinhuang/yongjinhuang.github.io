# Testing & Deployment

## Table of Contents

1. [Cross-Device Testing](#cross-device-testing)
2. [Ad Network Testing Tools](#ad-network-testing-tools)
3. [MRAID Testing](#mraid-testing)
4. [Automated Testing](#automated-testing)
5. [Performance Testing](#performance-testing)
6. [QA Checklist](#qa-checklist)
7. [Deployment Pipeline](#deployment-pipeline)
8. [CI/CD with GitHub Actions](#cicd-with-github-actions)
9. [Interview Questions](#interview-questions)

---

## Cross-Device Testing

### The Device Fragmentation Problem

```
Android fragmentation (2024):
├── 24,000+ distinct device models
├── 15+ active Android versions (8.0 - 15)
├── 8+ GPU families (Adreno, Mali, PowerVR, etc.)
├── Screen sizes: 4" to 10" (phones + tablets)
├── DPI: 160 (mdpi) to 640 (xxxhdpi)
├── RAM: 1GB to 16GB
└── WebView implementations vary by OEM

iOS fragmentation (simpler but still exists):
├── ~20 active device models
├── 4-5 active iOS versions
├── 3 GPU families (Apple A-series)
├── Screen sizes: 4.7" to 6.7" (phones) + iPads
├── DPI: 2x and 3x
└── WKWebView is consistent
```

### Key Test Devices

```
MUST-TEST (minimum viable device lab):
┌──────────────────────┬──────────────┬───────────────────────────────┐
│ Device               │ Tier         │ Why It's Important            │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ Samsung Galaxy A10/A12│ Low-end     │ Huge market share in emerging │
│                      │ Android      │ markets. If it works here,    │
│                      │              │ it works everywhere.          │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ Samsung Galaxy S21/S22│ Mid-range   │ Popular flagship from         │
│                      │ Android      │ previous years. Strong        │
│                      │              │ representation.               │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ Google Pixel 5/6     │ Stock        │ Reference Android device.     │
│                      │ Android      │ Clean WebView implementation. │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ iPhone SE (2nd/3rd)  │ Low-end iOS  │ Smallest modern iPhone.       │
│                      │              │ Tests compact layout + perf.  │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ iPhone 12/13         │ Mid-range iOS│ High adoption rate.           │
│                      │              │ Notch layout testing.         │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ iPhone 14/15 Pro     │ High-end iOS │ Latest features, Dynamic      │
│                      │              │ Island, ProMotion.            │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ iPad (9th gen)       │ Tablet       │ Tests landscape + large       │
│                      │              │ screen layout.                │
├──────────────────────┼──────────────┼───────────────────────────────┤
│ Xiaomi Redmi Note 10 │ Budget       │ Massive market share in       │
│                      │ Android      │ Asia/India. MIUI WebView.     │
└──────────────────────┴──────────────┴───────────────────────────────┘
```

### BrowserStack and Cloud Device Labs

```typescript
// BrowserStack Automate configuration for playable ad testing
interface BrowserStackConfig {
  readonly devices: readonly DeviceConfig[];
  readonly project: string;
  readonly build: string;
  readonly local: boolean;
}

interface DeviceConfig {
  readonly device: string;
  readonly os_version: string;
  readonly real_mobile: boolean;
  readonly browserName: string;
}

const testDevices: readonly DeviceConfig[] = [
  {
    device: 'Samsung Galaxy A12',
    os_version: '11.0',
    real_mobile: true,
    browserName: 'chrome',
  },
  {
    device: 'Samsung Galaxy S22',
    os_version: '13.0',
    real_mobile: true,
    browserName: 'chrome',
  },
  {
    device: 'iPhone SE 2022',
    os_version: '16',
    real_mobile: true,
    browserName: 'safari',
  },
  {
    device: 'iPhone 14',
    os_version: '16',
    real_mobile: true,
    browserName: 'safari',
  },
  {
    device: 'Google Pixel 6',
    os_version: '13.0',
    real_mobile: true,
    browserName: 'chrome',
  },
];
```

### Why Real Devices Matter

```
Cloud testing (BrowserStack, Sauce Labs) is good for:
✓ Layout validation across many devices
✓ Basic functionality testing
✓ Regression testing
✓ Screenshot comparison
✓ Cost-effective access to 3000+ devices

Real device testing is REQUIRED for:
✗ Accurate performance profiling (cloud devices are shared)
✗ Touch responsiveness feel
✗ GPU-specific rendering bugs
✗ Thermal throttling behavior
✗ Battery impact measurement
✗ WebView behavior in actual ad SDKs
✗ Sound playback on different hardware
✗ Haptic feedback testing

Recommendation:
- BrowserStack for broad compatibility (10+ devices)
- 3-5 real devices for performance + UX validation
- Focus real devices on low-end (Galaxy A10) and primary targets
```

### Device-Specific Gotchas

```typescript
// Common device-specific issues and workarounds

class DeviceQuirks {
  static apply(canvas: HTMLCanvasElement): void {
    const ua = navigator.userAgent;

    // Samsung Internet browser has different touch handling
    if (ua.includes('SamsungBrowser')) {
      canvas.style.touchAction = 'none';
    }

    // iOS 15+ has weird 100vh calculation with address bar
    if (/iPhone|iPad/.test(ua)) {
      const setHeight = (): void => {
        canvas.style.height = `${window.innerHeight}px`;
      };
      setHeight();
      window.addEventListener('resize', setHeight);
    }

    // Some Android WebViews don't support OffscreenCanvas
    if (!('OffscreenCanvas' in window)) {
      // Fallback to regular canvas for off-screen rendering
    }

    // Xiaomi MIUI browser may block Web Audio
    // Always wrap AudioContext creation in try/catch
  }

  static getMaxTextureSize(): number {
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl');
      if (gl) {
        return gl.getParameter(gl.MAX_TEXTURE_SIZE);
      }
    } catch {
      // WebGL not available
    }
    return 2048; // Safe default
  }

  static supportsWebGL2(): boolean {
    try {
      const testCanvas = document.createElement('canvas');
      return testCanvas.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  }

  static getDeviceTier(): 'low' | 'mid' | 'high' {
    // Heuristic based on available info
    const cores = navigator.hardwareConcurrency || 2;
    const memory = (navigator as any).deviceMemory || 2;

    if (cores <= 4 && memory <= 2) return 'low';
    if (cores <= 6 && memory <= 4) return 'mid';
    return 'high';
  }
}
```

---

## Ad Network Testing Tools

### Facebook Ad Preview Tool

```
Location: Facebook Ads Manager → Creative Hub → Mockup → Preview

Features:
- Preview playable ad on mobile device
- Test in different placements (Feed, Stories, Interstitial)
- Share preview links with team
- Check MRAID compliance

Testing steps:
1. Upload HTML file (single file, self-contained)
2. Select placement type
3. Generate preview link
4. Open on real device via Facebook app
5. Verify:
   - Loads within 2 seconds
   - Touch input works
   - CTA redirects correctly
   - Sound plays/mutes properly
   - Orientation changes handled
   - End card displays correctly

Common Facebook rejections:
- File > 5MB (or 2MB for some placements)
- External network requests
- Auto-playing audio
- Misleading CTA
- Adult content
- Doesn't include mraid.js reference
```

### Google Web Designer

```
Google Web Designer preview features:
- Built-in MRAID simulator
- Preview in different screen sizes
- Test click-through URLs
- Validate HTML5 ad compliance

For Google Ads (AdMob):
- Upload as .zip containing HTML + assets
- Maximum 5MB total
- Must include clickTag implementation
- Test with Google's creative preview tool
```

### IronSource DAPI Emulator

```typescript
// ironSource uses DAPI (Dynamic API) instead of standard MRAID
// DAPI Desktop Emulator for testing

interface DapiInterface {
  isReady(): boolean;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
  getScreenSize(): { width: number; height: number };
  getAudioVolume(): number;
  openStoreUrl(url: string): void;
}

// Desktop fallback for DAPI
class DapiEmulator implements DapiInterface {
  private ready: boolean = false;
  private listeners: Map<string, Array<() => void>> = new Map();

  constructor() {
    // Simulate ready event after brief delay
    setTimeout(() => {
      this.ready = true;
      this.fireEvent('ready');
    }, 100);
  }

  isReady(): boolean {
    return this.ready;
  }

  addEventListener(event: string, callback: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: () => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  getScreenSize(): { width: number; height: number } {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  getAudioVolume(): number {
    return 1.0; // Full volume in emulator
  }

  openStoreUrl(url: string): void {
    window.open(url, '_blank');
  }

  private fireEvent(event: string): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const callback of eventListeners) {
        callback();
      }
    }
  }
}

// Universal bridge that works with both DAPI and MRAID
class AdBridge {
  private isDapi: boolean = false;
  private isMraid: boolean = false;
  private dapi: DapiInterface | null = null;

  constructor() {
    if (typeof (window as any).dapi !== 'undefined') {
      this.isDapi = true;
      this.dapi = (window as any).dapi;
    } else if (typeof (window as any).mraid !== 'undefined') {
      this.isMraid = true;
    } else {
      // Desktop: install emulator
      this.isDapi = true;
      this.dapi = new DapiEmulator();
      (window as any).dapi = this.dapi;
    }
  }

  onReady(callback: () => void): void {
    if (this.isDapi && this.dapi) {
      if (this.dapi.isReady()) {
        callback();
      } else {
        this.dapi.addEventListener('ready', callback);
      }
    } else if (this.isMraid) {
      const mraid = (window as any).mraid;
      if (mraid.getState() === 'ready') {
        callback();
      } else {
        mraid.addEventListener('ready', callback);
      }
    } else {
      callback(); // Desktop, ready immediately
    }
  }

  openStore(): void {
    const storeUrl = 'https://play.google.com/store/apps/details?id=com.example.game';

    if (this.isDapi && this.dapi) {
      this.dapi.openStoreUrl(storeUrl);
    } else if (this.isMraid) {
      (window as any).mraid.open(storeUrl);
    } else {
      window.open(storeUrl, '_blank');
    }
  }

  getScreenSize(): { width: number; height: number } {
    if (this.isDapi && this.dapi) {
      return this.dapi.getScreenSize();
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  getVolume(): number {
    if (this.isDapi && this.dapi) {
      return this.dapi.getAudioVolume();
    }
    return 1.0;
  }
}
```

### Unity Creative Tester

```
Unity Ads creative testing:
1. Upload .html file to Unity Dashboard → Creatives
2. Use Unity Ad Tester app (available on iOS/Android)
3. Enter your Game ID
4. Test ad shows in actual Unity Ads SDK environment
5. Verify MRAID compliance

Unity-specific requirements:
- Single HTML file (all assets inline)
- Max 5MB
- Must call mraid.open() for CTA
- Must handle mraid viewableChange events
- Portrait and landscape support required
- No external requests (except for MRAID/SDK calls)
```

---

## MRAID Testing

### MRAID Compliance Checker

```typescript
// MRAID compliance validation utility

interface MraidComplianceResult {
  readonly passed: boolean;
  readonly checks: readonly ComplianceCheck[];
}

interface ComplianceCheck {
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'warn';
  readonly message: string;
}

function checkMraidCompliance(): MraidComplianceResult {
  const checks: ComplianceCheck[] = [];

  // Check 1: mraid.js is referenced
  const scripts = document.querySelectorAll('script');
  let mraidFound = false;
  scripts.forEach((script) => {
    if (script.src && script.src.includes('mraid.js')) {
      mraidFound = true;
    }
  });
  checks.push({
    name: 'MRAID Script Reference',
    status: mraidFound ? 'pass' : 'fail',
    message: mraidFound
      ? 'mraid.js script tag found'
      : 'Missing <script src="mraid.js"></script> in HTML',
  });

  // Check 2: mraid object available
  const mraidExists = typeof (window as any).mraid !== 'undefined';
  checks.push({
    name: 'MRAID Object',
    status: mraidExists ? 'pass' : 'warn',
    message: mraidExists
      ? 'mraid object is available'
      : 'mraid object not found (expected in ad environment)',
  });

  // Check 3: Ready event handling
  checks.push({
    name: 'Ready Event Handler',
    status: 'warn',
    message: 'Manual check: ensure game waits for mraid ready/viewableChange',
  });

  // Check 4: No external requests
  const hasExternalRequests = checkForExternalRequests();
  checks.push({
    name: 'No External Requests',
    status: hasExternalRequests ? 'fail' : 'pass',
    message: hasExternalRequests
      ? 'External network requests detected!'
      : 'No external requests found in static analysis',
  });

  // Check 5: CTA uses mraid.open()
  checks.push({
    name: 'CTA Implementation',
    status: 'warn',
    message: 'Manual check: ensure CTA button calls mraid.open(url)',
  });

  // Check 6: File size
  const htmlSize = new Blob([document.documentElement.outerHTML]).size;
  const sizeMB = htmlSize / (1024 * 1024);
  checks.push({
    name: 'File Size',
    status: sizeMB < 3 ? 'pass' : sizeMB < 5 ? 'warn' : 'fail',
    message: `Estimated size: ${sizeMB.toFixed(2)}MB (limit varies by network: 2-5MB)`,
  });

  // Check 7: Viewport meta tag
  const viewport = document.querySelector('meta[name="viewport"]');
  checks.push({
    name: 'Viewport Meta',
    status: viewport ? 'pass' : 'fail',
    message: viewport
      ? 'Viewport meta tag present'
      : 'Missing viewport meta tag',
  });

  const allPassed = checks.every(
    (c) => c.status === 'pass' || c.status === 'warn'
  );

  return { passed: allPassed, checks };
}

function checkForExternalRequests(): boolean {
  // Check for fetch, XMLHttpRequest, Image src with external URLs
  const html = document.documentElement.outerHTML;
  const patterns = [
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /new\s+Image\(\)/,
    /https?:\/\/(?!mraid)/i,
  ];

  return patterns.some((p) => p.test(html));
}
```

### Desktop MRAID Polyfill

```typescript
// Full MRAID 2.0 desktop polyfill for development

interface MraidState {
  state: 'loading' | 'default' | 'expanded' | 'resized' | 'hidden';
  viewable: boolean;
  placementType: 'inline' | 'interstitial';
}

class MraidPolyfill {
  private mraidState: MraidState = {
    state: 'loading',
    viewable: false,
    placementType: 'interstitial',
  };

  private readonly listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
  private readonly logDiv: HTMLDivElement;

  constructor() {
    // Create visual debug overlay
    this.logDiv = document.createElement('div');
    this.logDiv.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 250px;
      max-height: 200px;
      overflow-y: auto;
      background: rgba(0,0,0,0.85);
      color: #0f0;
      font: 11px monospace;
      padding: 8px;
      z-index: 99999;
      pointer-events: none;
    `;
    document.body.appendChild(this.logDiv);

    this.log('MRAID Polyfill loaded');

    // Simulate ready after DOM is ready
    if (document.readyState === 'complete') {
      this.simulateReady();
    } else {
      window.addEventListener('load', () => this.simulateReady());
    }
  }

  private simulateReady(): void {
    setTimeout(() => {
      this.mraidState = { ...this.mraidState, state: 'default' };
      this.fireEvent('ready');
      this.log('State: default (ready)');

      setTimeout(() => {
        this.mraidState = { ...this.mraidState, viewable: true };
        this.fireEvent('viewableChange', true);
        this.log('Viewable: true');
      }, 200);
    }, 100);
  }

  getState(): string {
    return this.mraidState.state;
  }

  getPlacementType(): string {
    return this.mraidState.placementType;
  }

  isViewable(): boolean {
    return this.mraidState.viewable;
  }

  addEventListener(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    this.log(`Listener added: ${event}`);
  }

  removeEventListener(event: string, callback: (...args: unknown[]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const idx = eventListeners.indexOf(callback);
      if (idx > -1) {
        eventListeners.splice(idx, 1);
      }
    }
  }

  open(url: string): void {
    this.log(`OPEN: ${url}`);
    window.open(url, '_blank');
  }

  close(): void {
    this.log('CLOSE called');
    this.mraidState = { ...this.mraidState, state: 'hidden' };
    this.fireEvent('stateChange', 'hidden');
  }

  getVersion(): string {
    return '2.0';
  }

  private fireEvent(event: string, ...args: unknown[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const callback of eventListeners) {
        try {
          callback(...args);
        } catch (e) {
          this.log(`Error in ${event} handler: ${e}`);
        }
      }
    }
  }

  private log(msg: string): void {
    const line = document.createElement('div');
    line.textContent = `[MRAID] ${msg}`;
    this.logDiv.appendChild(line);
    this.logDiv.scrollTop = this.logDiv.scrollHeight;
  }
}

// Install polyfill if not in ad environment
if (typeof (window as any).mraid === 'undefined') {
  (window as any).mraid = new MraidPolyfill();
}
```

### Viewability Events Testing

```typescript
// Test viewability event handling

class ViewabilityTester {
  private viewableTime: number = 0;
  private lastViewableChange: number = 0;
  private isCurrentlyViewable: boolean = false;

  setupTests(): void {
    const mraid = (window as any).mraid;
    if (!mraid) return;

    mraid.addEventListener('viewableChange', (viewable: boolean) => {
      this.isCurrentlyViewable = viewable;

      if (viewable) {
        this.lastViewableChange = performance.now();
        this.log('Ad became viewable - game should START');
      } else {
        if (this.lastViewableChange > 0) {
          this.viewableTime += performance.now() - this.lastViewableChange;
        }
        this.log('Ad became not viewable - game should PAUSE');
      }
    });

    mraid.addEventListener('stateChange', (state: string) => {
      this.log(`State changed to: ${state}`);

      if (state === 'hidden') {
        this.log('Ad hidden - cleanup resources');
      }
    });
  }

  // Test scenarios to verify manually
  getTestScenarios(): string[] {
    return [
      '1. App backgrounded → game pauses, audio stops',
      '2. App foregrounded → game resumes, audio resumes (if user unmuted)',
      '3. Ad closed → cleanup, no errors in console',
      '4. Orientation change → layout adjusts, game continues',
      '5. Phone call interruption → game pauses gracefully',
      '6. Low memory warning → no crash',
      '7. Network disconnected → no errors (offline-only)',
      '8. Volume buttons → game respects system volume',
    ];
  }

  private log(msg: string): void {
    // Log to console in development
    if (typeof console !== 'undefined') {
      console.log(`[Viewability] ${msg}`);
    }
  }

  getTotalViewableTimeMs(): number {
    let total = this.viewableTime;
    if (this.isCurrentlyViewable && this.lastViewableChange > 0) {
      total += performance.now() - this.lastViewableChange;
    }
    return total;
  }
}
```

### Orientation Change Testing

```typescript
class OrientationTester {
  private readonly canvas: HTMLCanvasElement;
  private currentOrientation: 'portrait' | 'landscape';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.currentOrientation = this.detectOrientation();

    // Listen for orientation changes
    window.addEventListener('resize', () => this.handleResize());

    // Also listen for orientation change event (mobile)
    window.addEventListener('orientationchange', () => {
      // Delay to let browser finish rotation
      setTimeout(() => this.handleResize(), 100);
    });
  }

  private detectOrientation(): 'portrait' | 'landscape' {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  private handleResize(): void {
    const newOrientation = this.detectOrientation();

    if (newOrientation !== this.currentOrientation) {
      this.currentOrientation = newOrientation;
      this.onOrientationChange(newOrientation);
    }

    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    // Fit canvas to viewport
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Notify game to re-layout
    if (typeof (this as any).onResize === 'function') {
      (this as any).onResize(this.canvas.width, this.canvas.height);
    }
  }

  private onOrientationChange(orientation: 'portrait' | 'landscape'): void {
    // Log for testing
    console.log(`Orientation changed to: ${orientation}`);

    // Test checklist:
    // - [ ] UI elements repositioned correctly
    // - [ ] Game grid resized/reflowed
    // - [ ] No elements cut off
    // - [ ] Touch targets still accessible
    // - [ ] Animations continue smoothly
    // - [ ] Score/timer repositioned
    // - [ ] CTA button visible and tappable
  }

  getCurrentOrientation(): 'portrait' | 'landscape' {
    return this.currentOrientation;
  }
}
```

---

## Automated Testing

### Unit Testing Game Logic with Jest/Vitest

```typescript
// grid.ts - Game logic (pure functions, easy to test)
interface Cell {
  readonly type: number;
  readonly special: 'none' | 'line' | 'bomb';
}

type Grid = ReadonlyArray<ReadonlyArray<Cell>>;

function createCell(type: number): Cell {
  return { type, special: 'none' };
}

function createGrid(cols: number, rows: number, typeCount: number): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () =>
      createCell(Math.floor(Math.random() * typeCount))
    )
  );
}

function findHorizontalMatches(grid: Grid): Array<{ row: number; col: number; length: number }> {
  const matches: Array<{ row: number; col: number; length: number }> = [];

  for (let row = 0; row < grid.length; row++) {
    let matchStart = 0;
    let matchLength = 1;

    for (let col = 1; col <= grid[row].length; col++) {
      if (col < grid[row].length && grid[row][col].type === grid[row][matchStart].type) {
        matchLength++;
      } else {
        if (matchLength >= 3) {
          matches.push({ row, col: matchStart, length: matchLength });
        }
        matchStart = col;
        matchLength = 1;
      }
    }
  }

  return matches;
}

function swapCells(grid: Grid, r1: number, c1: number, r2: number, c2: number): Grid {
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (r === r1 && c === c1) return grid[r2][c2];
      if (r === r2 && c === c2) return grid[r1][c1];
      return cell;
    })
  );
}

// grid.test.ts
// Tests using Vitest syntax (also compatible with Jest)

/*
import { describe, it, expect } from 'vitest';
import { createGrid, findHorizontalMatches, swapCells, createCell } from './grid';

describe('Grid', () => {
  describe('createGrid', () => {
    it('creates grid with correct dimensions', () => {
      const grid = createGrid(7, 8, 5);
      expect(grid.length).toBe(8);        // rows
      expect(grid[0].length).toBe(7);     // cols
    });

    it('creates cells with valid types', () => {
      const grid = createGrid(5, 5, 3);
      for (const row of grid) {
        for (const cell of row) {
          expect(cell.type).toBeGreaterThanOrEqual(0);
          expect(cell.type).toBeLessThan(3);
          expect(cell.special).toBe('none');
        }
      }
    });
  });

  describe('findHorizontalMatches', () => {
    it('finds a horizontal match of 3', () => {
      const grid = [
        [createCell(1), createCell(1), createCell(1), createCell(2), createCell(3)],
        [createCell(0), createCell(2), createCell(3), createCell(4), createCell(1)],
      ];

      const matches = findHorizontalMatches(grid);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({ row: 0, col: 0, length: 3 });
    });

    it('finds a horizontal match of 4', () => {
      const grid = [
        [createCell(2), createCell(2), createCell(2), createCell(2), createCell(3)],
      ];

      const matches = findHorizontalMatches(grid);
      expect(matches).toHaveLength(1);
      expect(matches[0].length).toBe(4);
    });

    it('finds multiple matches in same row', () => {
      const grid = [
        [createCell(1), createCell(1), createCell(1), createCell(2), createCell(3), createCell(3), createCell(3)],
      ];

      const matches = findHorizontalMatches(grid);
      expect(matches).toHaveLength(2);
    });

    it('returns empty array when no matches', () => {
      const grid = [
        [createCell(1), createCell(2), createCell(3), createCell(4), createCell(5)],
      ];

      const matches = findHorizontalMatches(grid);
      expect(matches).toHaveLength(0);
    });
  });

  describe('swapCells', () => {
    it('swaps two adjacent cells', () => {
      const grid = [
        [createCell(1), createCell(2), createCell(3)],
        [createCell(4), createCell(5), createCell(6)],
      ];

      const swapped = swapCells(grid, 0, 0, 0, 1);
      expect(swapped[0][0].type).toBe(2);
      expect(swapped[0][1].type).toBe(1);
    });

    it('does not mutate original grid', () => {
      const grid = [
        [createCell(1), createCell(2)],
        [createCell(3), createCell(4)],
      ];

      const swapped = swapCells(grid, 0, 0, 0, 1);
      expect(grid[0][0].type).toBe(1); // Original unchanged
      expect(swapped[0][0].type).toBe(2); // New grid has swap
    });
  });
});
*/
```

### Visual Regression Testing

```typescript
// Visual regression testing using canvas.toDataURL()

interface VisualSnapshot {
  readonly name: string;
  readonly dataUrl: string;
  readonly timestamp: number;
  readonly dimensions: { width: number; height: number };
}

class VisualRegressionTester {
  private readonly referenceSnapshots: Map<string, string> = new Map();

  // Capture a snapshot of the current canvas state
  captureSnapshot(
    canvas: HTMLCanvasElement,
    name: string
  ): VisualSnapshot {
    return {
      name,
      dataUrl: canvas.toDataURL('image/png'),
      timestamp: Date.now(),
      dimensions: {
        width: canvas.width,
        height: canvas.height,
      },
    };
  }

  // Compare two snapshots pixel by pixel
  async compareSnapshots(
    actual: VisualSnapshot,
    expected: VisualSnapshot,
    threshold: number = 0.01 // 1% difference allowed
  ): Promise<{
    match: boolean;
    diffPercent: number;
    diffCanvas: HTMLCanvasElement | null;
  }> {
    const imgActual = await this.loadImage(actual.dataUrl);
    const imgExpected = await this.loadImage(expected.dataUrl);

    const width = Math.max(imgActual.width, imgExpected.width);
    const height = Math.max(imgActual.height, imgExpected.height);

    const canvasA = this.imageToCanvas(imgActual, width, height);
    const canvasB = this.imageToCanvas(imgExpected, width, height);

    const ctxA = canvasA.getContext('2d')!;
    const ctxB = canvasB.getContext('2d')!;

    const dataA = ctxA.getImageData(0, 0, width, height);
    const dataB = ctxB.getImageData(0, 0, width, height);

    // Create diff canvas
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d')!;
    const diffData = diffCtx.createImageData(width, height);

    let diffPixels = 0;
    const totalPixels = width * height;

    for (let i = 0; i < dataA.data.length; i += 4) {
      const rDiff = Math.abs(dataA.data[i] - dataB.data[i]);
      const gDiff = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
      const bDiff = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);

      if (rDiff > 10 || gDiff > 10 || bDiff > 10) {
        diffPixels++;
        // Highlight difference in red
        diffData.data[i] = 255;
        diffData.data[i + 1] = 0;
        diffData.data[i + 2] = 0;
        diffData.data[i + 3] = 255;
      } else {
        // Show original in grayscale
        const gray = (dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2]) / 3;
        diffData.data[i] = gray;
        diffData.data[i + 1] = gray;
        diffData.data[i + 2] = gray;
        diffData.data[i + 3] = 128;
      }
    }

    diffCtx.putImageData(diffData, 0, 0);

    const diffPercent = diffPixels / totalPixels;

    return {
      match: diffPercent <= threshold,
      diffPercent,
      diffCanvas: diffPercent > 0 ? diffCanvas : null,
    };
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  private imageToCanvas(
    img: HTMLImageElement,
    width: number,
    height: number
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }
}

/*
// Test usage with Vitest
describe('Visual Regression', () => {
  it('game board renders consistently', async () => {
    const tester = new VisualRegressionTester();
    const canvas = setupTestCanvas(320, 480);

    // Render game state
    const game = createGame(canvas);
    game.setDeterministicSeed(12345);
    game.renderFrame();

    const snapshot = tester.captureSnapshot(canvas, 'game-board');
    const reference = loadReferenceSnapshot('game-board');

    const result = await tester.compareSnapshots(snapshot, reference);
    expect(result.match).toBe(true);
    expect(result.diffPercent).toBeLessThan(0.01);
  });
});
*/
```

### Input Recording and Replay

```typescript
interface InputEvent {
  readonly type: 'touchstart' | 'touchmove' | 'touchend' | 'click';
  readonly x: number;
  readonly y: number;
  readonly timestamp: number;
}

class InputRecorder {
  private recording: InputEvent[] = [];
  private startTime: number = 0;
  private isRecording: boolean = false;

  startRecording(canvas: HTMLCanvasElement): void {
    this.recording = [];
    this.startTime = performance.now();
    this.isRecording = true;

    const recordEvent = (type: InputEvent['type'], e: MouseEvent | TouchEvent): void => {
      if (!this.isRecording) return;

      let x: number;
      let y: number;

      if ('touches' in e) {
        const touch = e.type === 'touchend'
          ? (e as TouchEvent).changedTouches[0]
          : (e as TouchEvent).touches[0];
        const rect = canvas.getBoundingClientRect();
        x = touch.clientX - rect.left;
        y = touch.clientY - rect.top;
      } else {
        const rect = canvas.getBoundingClientRect();
        x = (e as MouseEvent).clientX - rect.left;
        y = (e as MouseEvent).clientY - rect.top;
      }

      this.recording.push({
        type,
        x,
        y,
        timestamp: performance.now() - this.startTime,
      });
    };

    canvas.addEventListener('touchstart', (e) => recordEvent('touchstart', e));
    canvas.addEventListener('touchmove', (e) => recordEvent('touchmove', e));
    canvas.addEventListener('touchend', (e) => recordEvent('touchend', e));
    canvas.addEventListener('click', (e) => recordEvent('click', e));
  }

  stopRecording(): readonly InputEvent[] {
    this.isRecording = false;
    return [...this.recording];
  }

  exportRecording(): string {
    return JSON.stringify(this.recording, null, 2);
  }
}

class InputReplayer {
  private events: readonly InputEvent[] = [];
  private currentIndex: number = 0;
  private startTime: number = 0;
  private onEvent: ((event: InputEvent) => void) | null = null;

  loadRecording(events: readonly InputEvent[]): void {
    this.events = events;
    this.currentIndex = 0;
  }

  startReplay(onEvent: (event: InputEvent) => void): void {
    this.onEvent = onEvent;
    this.startTime = performance.now();
    this.currentIndex = 0;
    this.tick();
  }

  private tick(): void {
    if (this.currentIndex >= this.events.length) return;

    const elapsed = performance.now() - this.startTime;
    const event = this.events[this.currentIndex];

    if (elapsed >= event.timestamp) {
      if (this.onEvent) {
        this.onEvent(event);
      }
      this.currentIndex++;
    }

    if (this.currentIndex < this.events.length) {
      requestAnimationFrame(() => this.tick());
    }
  }
}

/*
// Test with recording replay
describe('Game Replay Test', () => {
  it('replaying recorded input produces same final state', () => {
    const recording = JSON.parse(loadFixture('match3-win-recording.json'));
    const game = createDeterministicGame(12345);

    const replayer = new InputReplayer();
    replayer.loadRecording(recording);

    replayer.startReplay((event) => {
      game.handleInput(event.type, event.x, event.y);
    });

    // Wait for replay to finish
    // Verify final game state matches expected
    expect(game.getScore()).toBe(1250);
    expect(game.getState()).toBe('endCard');
  });
});
*/
```

---

## Performance Testing

### Automated Frame Timing

```typescript
class FrameTimingProfiler {
  private readonly frameTimes: Float64Array;
  private frameIndex: number = 0;
  private readonly maxFrames: number;
  private lastTimestamp: number = 0;

  constructor(maxFrames: number = 600) { // 10 seconds at 60fps
    this.maxFrames = maxFrames;
    this.frameTimes = new Float64Array(maxFrames);
  }

  recordFrame(timestamp: number): void {
    if (this.lastTimestamp > 0 && this.frameIndex < this.maxFrames) {
      this.frameTimes[this.frameIndex] = timestamp - this.lastTimestamp;
      this.frameIndex++;
    }
    this.lastTimestamp = timestamp;
  }

  getReport(): FrameTimingReport {
    const frames = this.frameTimes.slice(0, this.frameIndex);
    const sorted = Float64Array.from(frames).sort();

    const sum = frames.reduce((a, b) => a + b, 0);
    const avg = sum / frames.length;

    let droppedFrames = 0;
    let jankyFrames = 0;

    for (let i = 0; i < frames.length; i++) {
      if (frames[i] > 33.33) droppedFrames++;   // Below 30fps
      else if (frames[i] > 18) jankyFrames++;    // Below 55fps
    }

    return {
      totalFrames: frames.length,
      avgFrameTime: avg,
      avgFps: 1000 / avg,
      minFrameTime: sorted[0],
      maxFrameTime: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      droppedFrames,
      jankyFrames,
      droppedFramePercent: (droppedFrames / frames.length) * 100,
      smoothnessScore: ((frames.length - jankyFrames - droppedFrames) / frames.length) * 100,
    };
  }
}

interface FrameTimingReport {
  readonly totalFrames: number;
  readonly avgFrameTime: number;
  readonly avgFps: number;
  readonly minFrameTime: number;
  readonly maxFrameTime: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly droppedFrames: number;
  readonly jankyFrames: number;
  readonly droppedFramePercent: number;
  readonly smoothnessScore: number; // 0-100, higher is better
}

/*
// Performance test
describe('Performance', () => {
  it('maintains 60fps during gameplay', () => {
    const profiler = new FrameTimingProfiler(300);
    const game = createGame();

    // Run 5 seconds of gameplay
    for (let frame = 0; frame < 300; frame++) {
      const timestamp = frame * 16.67;
      profiler.recordFrame(timestamp);
      game.update(16.67);
      game.render();
    }

    const report = profiler.getReport();
    expect(report.avgFps).toBeGreaterThan(55);
    expect(report.droppedFramePercent).toBeLessThan(5);
    expect(report.p95).toBeLessThan(20); // 95th percentile under 20ms
    expect(report.smoothnessScore).toBeGreaterThan(90);
  });
});
*/
```

### Memory Profiling

```typescript
class MemoryProfiler {
  private readonly snapshots: Array<{
    timestamp: number;
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  }> = [];

  sample(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.snapshots.push({
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
      });
    }
  }

  getReport(): MemoryReport {
    if (this.snapshots.length < 2) {
      return {
        startMB: 0,
        endMB: 0,
        peakMB: 0,
        growthMB: 0,
        growthRateMBPerSecond: 0,
        hasLeak: false,
      };
    }

    const toMB = (bytes: number): number => bytes / (1024 * 1024);

    const start = toMB(this.snapshots[0].usedJSHeapSize);
    const end = toMB(this.snapshots[this.snapshots.length - 1].usedJSHeapSize);
    const peak = Math.max(...this.snapshots.map((s) => toMB(s.usedJSHeapSize)));

    const elapsedSeconds =
      (this.snapshots[this.snapshots.length - 1].timestamp -
        this.snapshots[0].timestamp) /
      1000;

    const growthRate = elapsedSeconds > 0 ? (end - start) / elapsedSeconds : 0;

    return {
      startMB: start,
      endMB: end,
      peakMB: peak,
      growthMB: end - start,
      growthRateMBPerSecond: growthRate,
      hasLeak: growthRate > 0.1, // More than 100KB/s is suspicious
    };
  }
}

interface MemoryReport {
  readonly startMB: number;
  readonly endMB: number;
  readonly peakMB: number;
  readonly growthMB: number;
  readonly growthRateMBPerSecond: number;
  readonly hasLeak: boolean;
}
```

### Lighthouse for Web Games

```
Lighthouse audits relevant to playable ads:

Performance:
├── First Contentful Paint (FCP) → target < 1s
├── Largest Contentful Paint (LCP) → target < 1.5s
├── Time to Interactive (TTI) → target < 2s
├── Total Blocking Time (TBT) → target < 200ms
├── Cumulative Layout Shift (CLS) → target < 0.1
└── Speed Index → target < 2s

Specific checks:
├── JavaScript execution time
├── Main thread work breakdown
├── Unused JavaScript (dead code)
├── Image optimization
├── Render-blocking resources
└── DOM size

Running Lighthouse for playable ads:
  # CLI
  npx lighthouse ./dist/index.html --output=json --output-path=./lighthouse-report.json

  # Important: test with CPU throttling
  npx lighthouse ./dist/index.html --throttling.cpuSlowdownMultiplier=4

Note: Lighthouse is designed for web pages, not games.
Use its results as a starting point, but rely more on
custom frame timing and memory profiling for game-specific metrics.
```

---

## QA Checklist

### Comprehensive QA Checklist

```markdown
## Pre-Release QA Checklist for Playable Ads

### Layout & Orientation
- [ ] Portrait mode displays correctly on phone
- [ ] Landscape mode displays correctly on phone
- [ ] Portrait mode displays correctly on tablet
- [ ] Landscape mode displays correctly on tablet
- [ ] Orientation change during gameplay handled gracefully
- [ ] No elements cut off by notch/Dynamic Island
- [ ] No elements hidden behind system UI (status bar, nav bar)
- [ ] Safe area insets respected on all devices

### Touch Input
- [ ] Tap targets are minimum 44x44px
- [ ] Touch input is responsive (<100ms perceived delay)
- [ ] Multi-touch doesn't cause issues
- [ ] Drag/swipe gestures work as expected
- [ ] Touch doesn't interfere with system gestures (swipe to go back)
- [ ] No accidental touches registered during animations
- [ ] Touch works correctly after orientation change

### CTA (Call to Action)
- [ ] CTA button is clearly visible
- [ ] CTA is tappable (not obscured by other elements)
- [ ] CTA redirects to correct app store URL
- [ ] CTA works on both iOS and Android
- [ ] CTA triggers correctly via mraid.open()
- [ ] End card CTA is prominently displayed
- [ ] CTA text is appropriate and not misleading

### Audio
- [ ] Audio respects device volume setting
- [ ] Audio respects mute/silent switch on iOS
- [ ] No audio plays before user interaction (browser policy)
- [ ] Audio pauses when ad is not viewable
- [ ] Audio resumes correctly when ad becomes viewable again
- [ ] Audio quality acceptable on device speakers
- [ ] Sound effects don't overlap awkwardly

### Error Handling
- [ ] No JavaScript errors in console
- [ ] No unhandled promise rejections
- [ ] Graceful fallback if WebGL unavailable
- [ ] Handles canvas context loss
- [ ] No errors on rapid orientation changes
- [ ] No errors when ad is quickly closed and reopened

### Size & Loading
- [ ] Total file size under network limit (2-5MB depending on network)
- [ ] First frame renders in <1 second
- [ ] Game is playable within 2 seconds
- [ ] No external network requests (all assets inline)
- [ ] No loading spinner visible for more than 1 second

### Gameplay
- [ ] Game is completable in 15-30 seconds
- [ ] Tutorial is clear without text (icon/animation based)
- [ ] Difficulty is appropriate (user should succeed)
- [ ] Game auto-advances after 3 seconds of idle
- [ ] Score/progress is visible and updates correctly
- [ ] Win/loss conditions trigger correctly
- [ ] End card appears at appropriate time

### Performance
- [ ] Maintains 60fps on target low-end device
- [ ] No visible frame drops during gameplay
- [ ] No GC pauses causing stutters
- [ ] Memory usage under 50MB
- [ ] No memory leaks during 30-second session
- [ ] Battery usage is reasonable

### MRAID Compliance
- [ ] mraid.js script tag present in HTML
- [ ] Game waits for mraid ready event
- [ ] Game respects viewableChange events
- [ ] mraid.open() used for all external links
- [ ] No window.open() calls (must use mraid.open)
- [ ] close() / stateChange handled correctly

### Cross-Platform
- [ ] Chrome on Android
- [ ] Samsung Browser on Android
- [ ] Safari on iOS
- [ ] WebView in Facebook app (Android)
- [ ] WebView in Facebook app (iOS)
- [ ] WebView in Unity Ads SDK
- [ ] WebView in ironSource SDK
```

### Automated QA Script

```typescript
interface QAResult {
  readonly category: string;
  readonly check: string;
  readonly status: 'pass' | 'fail' | 'warn' | 'manual';
  readonly details: string;
}

async function runAutomatedQA(htmlFilePath: string): Promise<readonly QAResult[]> {
  const results: QAResult[] = [];

  // Size check
  const response = await fetch(htmlFilePath);
  const text = await response.text();
  const sizeBytes = new Blob([text]).size;
  const sizeMB = sizeBytes / (1024 * 1024);

  results.push({
    category: 'Size',
    check: 'File size under 5MB',
    status: sizeMB < 5 ? 'pass' : 'fail',
    details: `${sizeMB.toFixed(2)}MB`,
  });

  results.push({
    category: 'Size',
    check: 'File size under 3MB (recommended)',
    status: sizeMB < 3 ? 'pass' : sizeMB < 5 ? 'warn' : 'fail',
    details: `${sizeMB.toFixed(2)}MB`,
  });

  // MRAID check
  results.push({
    category: 'MRAID',
    check: 'mraid.js reference',
    status: text.includes('mraid.js') ? 'pass' : 'fail',
    details: text.includes('mraid.js') ? 'Found' : 'Missing mraid.js script tag',
  });

  // External request check
  const urlPattern = /https?:\/\/[^\s"'<>]+/g;
  const urls = text.match(urlPattern) || [];
  const externalUrls = urls.filter(
    (url) => !url.includes('mraid') && !url.includes('data:')
  );

  results.push({
    category: 'Network',
    check: 'No external requests',
    status: externalUrls.length === 0 ? 'pass' : 'fail',
    details:
      externalUrls.length === 0
        ? 'No external URLs found'
        : `Found ${externalUrls.length} external URLs: ${externalUrls.slice(0, 3).join(', ')}`,
  });

  // Viewport meta
  results.push({
    category: 'Layout',
    check: 'Viewport meta tag',
    status: text.includes('viewport') ? 'pass' : 'fail',
    details: text.includes('viewport') ? 'Found' : 'Missing viewport meta',
  });

  // Console.log check
  const consoleLogCount = (text.match(/console\.(log|warn|error)/g) || []).length;
  results.push({
    category: 'Code Quality',
    check: 'No console.log statements',
    status: consoleLogCount === 0 ? 'pass' : 'warn',
    details: `Found ${consoleLogCount} console statements`,
  });

  // Single file check
  const hasStylesheetLinks = /<link[^>]+stylesheet/i.test(text);
  const hasScriptSrcs = /<script[^>]+src[^>]*(?!mraid)/i.test(text);

  results.push({
    category: 'Bundle',
    check: 'Self-contained (no external CSS/JS)',
    status: !hasStylesheetLinks && !hasScriptSrcs ? 'pass' : 'warn',
    details: hasStylesheetLinks
      ? 'Has external stylesheets'
      : hasScriptSrcs
      ? 'Has external scripts (other than mraid)'
      : 'All assets inline',
  });

  return results;
}
```

---

## Deployment Pipeline

### Build to Deployment Flow

```
Build → Validate → Upload → Review → Live

Detailed flow:
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: BUILD                                               │
│                                                             │
│ npm run build                                               │
│   ├── TypeScript → JavaScript (esbuild)                     │
│   ├── Inline all assets (images → base64)                   │
│   ├── Inline CSS into HTML                                  │
│   ├── Minify JavaScript (terser)                            │
│   ├── Generate single index.html file                       │
│   └── Output: dist/index.html                               │
├─────────────────────────────────────────────────────────────┤
│ STEP 2: VALIDATE                                            │
│                                                             │
│ npm run validate                                            │
│   ├── Check file size (< target limit)                      │
│   ├── Verify no external requests                           │
│   ├── Check MRAID references                                │
│   ├── Run unit tests                                        │
│   ├── Run automated QA checks                               │
│   └── Generate validation report                            │
├─────────────────────────────────────────────────────────────┤
│ STEP 3: UPLOAD TO NETWORKS                                  │
│                                                             │
│ Network-specific upload processes:                           │
│   ├── Facebook: Ads Manager → Create Ad → Playable          │
│   ├── Unity: Dashboard → Creatives → Upload HTML             │
│   ├── ironSource: Platform → Creatives → Upload              │
│   ├── AppLovin: Dashboard → Creatives → Upload               │
│   ├── Google: Campaign → Assets → Upload HTML5               │
│   └── Mintegral: Dashboard → Creative → Upload               │
├─────────────────────────────────────────────────────────────┤
│ STEP 4: CREATIVE REVIEW (1-3 days)                          │
│                                                             │
│ Network reviews for:                                        │
│   ├── Policy compliance (no misleading content)             │
│   ├── Technical requirements (size, MRAID, etc.)            │
│   ├── User experience quality                               │
│   ├── Performance on reference devices                       │
│   └── Content appropriateness                                │
├─────────────────────────────────────────────────────────────┤
│ STEP 5: LIVE                                                │
│                                                             │
│   ├── Creative approved → starts serving                     │
│   ├── Monitor initial metrics (first 24-48 hours)            │
│   ├── Check for anomalies                                    │
│   └── Scale if metrics are good                              │
└─────────────────────────────────────────────────────────────┘
```

### Common Rejection Reasons

```
FACEBOOK:
1. File exceeds 5MB (playable) or 2MB (instant experience)
2. External network requests detected
3. Audio auto-plays without user interaction
4. CTA doesn't lead to correct store listing
5. Game content doesn't match advertised app
6. Contains prohibited content categories
7. Load time exceeds 4 seconds
8. Missing mraid.js reference

UNITY ADS:
1. File exceeds 5MB
2. External resources loaded
3. Game doesn't respond to MRAID events
4. Portrait/landscape not both supported
5. CTA not using mraid.open()
6. Performance issues on test devices
7. Game crashes or hangs

IRONSOURCE:
1. DAPI integration issues
2. File too large
3. Audio doesn't respect volume
4. Game doesn't pause on viewableChange false
5. End card missing or unclear CTA
6. Close button interfered with

GOOGLE ADS:
1. clickTag not implemented correctly
2. File exceeds size limit (varies by format)
3. External requests
4. Non-standard HTML5 practices
5. Performance issues
```

### Build Pipeline Implementation

```typescript
// build.ts - Production build script

interface BuildConfig {
  readonly entryPoint: string;
  readonly outputFile: string;
  readonly maxSizeBytes: number;
  readonly targetNetworks: readonly string[];
  readonly inlineAssets: boolean;
  readonly minify: boolean;
}

const config: BuildConfig = {
  entryPoint: 'src/main.ts',
  outputFile: 'dist/index.html',
  maxSizeBytes: 3 * 1024 * 1024, // 3MB target
  targetNetworks: ['facebook', 'unity', 'ironsource'],
  inlineAssets: true,
  minify: true,
};

// Build steps (conceptual - actual implementation uses esbuild/webpack)
async function build(buildConfig: BuildConfig): Promise<BuildResult> {
  const steps: string[] = [];

  // Step 1: Compile TypeScript
  steps.push('Compiling TypeScript...');
  // esbuild --bundle --minify --target=es2015

  // Step 2: Inline assets
  if (buildConfig.inlineAssets) {
    steps.push('Inlining assets as base64...');
    // Convert images to data URLs
    // Inline CSS
    // Inline JavaScript
  }

  // Step 3: Generate HTML
  steps.push('Generating single HTML file...');
  // Wrap everything in index.html template

  // Step 4: Measure size
  steps.push('Measuring output size...');

  // Step 5: Validate
  steps.push('Running validation...');

  return {
    success: true,
    outputPath: buildConfig.outputFile,
    sizeBytes: 0, // actual size
    steps,
  };
}

interface BuildResult {
  readonly success: boolean;
  readonly outputPath: string;
  readonly sizeBytes: number;
  readonly steps: readonly string[];
}

// Network-specific build variants
function getNetworkConfig(network: string): Partial<BuildConfig> {
  switch (network) {
    case 'facebook':
      return { maxSizeBytes: 5 * 1024 * 1024 };
    case 'unity':
      return { maxSizeBytes: 5 * 1024 * 1024 };
    case 'ironsource':
      return { maxSizeBytes: 5 * 1024 * 1024 };
    case 'google':
      return { maxSizeBytes: 2.5 * 1024 * 1024 };
    default:
      return { maxSizeBytes: 3 * 1024 * 1024 };
  }
}
```

---

## CI/CD with GitHub Actions

### Complete GitHub Actions Pipeline

```yaml
# .github/workflows/playable-ad.yml

name: Playable Ad CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: TypeScript type check
        run: npx tsc --noEmit

      - name: ESLint
        run: npm run lint

      - name: Prettier check
        run: npx prettier --check src/

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Run tests
        run: npm test -- --coverage

      - name: Check coverage
        run: |
          COVERAGE=$(npx c8 report --reporter=text-summary | grep 'Lines' | awk '{print $3}' | sed 's/%//')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage below 80% threshold"
            exit 1
          fi

  build:
    name: Build & Validate
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Build production bundle
        run: npm run build

      - name: Check file size
        run: |
          SIZE=$(wc -c < dist/index.html)
          SIZE_KB=$((SIZE / 1024))
          SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
          echo "Bundle size: ${SIZE_KB}KB (${SIZE_MB}MB)"

          # Fail if over 3MB (warning at 2MB)
          if [ $SIZE -gt 3145728 ]; then
            echo "::error::Bundle size ${SIZE_MB}MB exceeds 3MB limit!"
            exit 1
          elif [ $SIZE -gt 2097152 ]; then
            echo "::warning::Bundle size ${SIZE_MB}MB is above 2MB"
          fi

      - name: Validate HTML
        run: |
          # Check for mraid.js reference
          if ! grep -q "mraid.js" dist/index.html; then
            echo "::error::Missing mraid.js reference"
            exit 1
          fi

          # Check for external URLs (excluding mraid and data URLs)
          EXTERNAL=$(grep -oP 'https?://[^\s"'"'"'<>]+' dist/index.html | grep -v 'mraid' | grep -v 'data:' || true)
          if [ -n "$EXTERNAL" ]; then
            echo "::error::External URLs found: $EXTERNAL"
            exit 1
          fi

          # Check for console.log
          if grep -q 'console.log' dist/index.html; then
            echo "::warning::console.log statements found in production build"
          fi

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: playable-ad-${{ github.sha }}
          path: dist/index.html

  size-report:
    name: Size Report
    runs-on: ubuntu-latest
    needs: [build]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: playable-ad-${{ github.sha }}
          path: dist/

      - name: Generate size report
        run: |
          SIZE=$(wc -c < dist/index.html)
          SIZE_KB=$((SIZE / 1024))

          # Create comment body
          cat << EOF > comment.md
          ## Playable Ad Build Report

          | Metric | Value |
          |--------|-------|
          | Bundle Size | ${SIZE_KB}KB |
          | Under 3MB limit | $([ $SIZE -lt 3145728 ] && echo "Yes" || echo "No") |
          | Under 2MB target | $([ $SIZE -lt 2097152 ] && echo "Yes" || echo "No") |
          EOF

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('comment.md', 'utf-8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body,
            });
```

### Size Tracking Over Time

```typescript
// Track bundle size across builds

interface SizeEntry {
  readonly commitHash: string;
  readonly timestamp: string;
  readonly sizeBytes: number;
  readonly branch: string;
}

function generateSizeBadge(sizeBytes: number, limitBytes: number): string {
  const percentage = (sizeBytes / limitBytes) * 100;
  const sizeKB = Math.round(sizeBytes / 1024);
  const color =
    percentage < 50 ? 'green' :
    percentage < 75 ? 'yellow' :
    percentage < 100 ? 'orange' : 'red';

  return `https://img.shields.io/badge/bundle_size-${sizeKB}KB-${color}`;
}
```

---

## Interview Questions

### Q1: "How do you test a playable ad across 100+ device configurations?"

**Strong Answer:**

"Testing 100+ configurations doesn't mean testing each one manually. I use a tiered approach:

**Tier 1 - Real device testing (5-8 devices):**
These are the devices I keep on my desk or in the office. I test every build on these:
- Galaxy A10/A12 (low-end Android, the true stress test)
- Galaxy S21 (mid-range Android)
- Pixel 6 (stock Android, reference WebView)
- iPhone SE (smallest iOS viewport)
- iPhone 13 (mainstream iOS)
- iPad 9th gen (tablet layout)

On these I check: performance (frame timing), touch feel, orientation, audio, CTA redirect.

**Tier 2 - Cloud device testing (20-30 devices via BrowserStack):**
I run automated scripts that:
1. Load the playable ad
2. Take screenshots at key moments (loading, gameplay, end card)
3. Verify canvas renders (non-blank screenshot)
4. Check for JavaScript errors
5. Measure load time

This covers Samsung Internet, MIUI browser, various Android versions, different iOS versions.

**Tier 3 - Network preview tools (per network):**
- Facebook Ad Preview (tests in actual FB WebView)
- Unity Creative Tester app
- ironSource testing dashboard

Each network has its own WebView quirks, so testing in their environment catches network-specific issues.

**Tier 4 - In-field monitoring:**
After launch, monitor crash reports and error logs for the first 48 hours. If a specific device model reports issues, add it to Tier 1 for that creative."

---

### Q2: "What's your CI/CD pipeline for playable ads?"

**Strong Answer:**

"My pipeline has four stages, triggered on every push:

**Stage 1: Lint + Type Check (30 seconds)**
- ESLint for code quality
- TypeScript compiler for type safety
- Prettier for formatting consistency
- Runs on every commit

**Stage 2: Test (1 minute)**
- Unit tests for game logic (match detection, scoring, grid operations)
- 80%+ code coverage requirement
- Deterministic tests (fixed random seeds)
- No canvas rendering in tests (pure logic only)

**Stage 3: Build + Validate (1 minute)**
- esbuild bundles TypeScript to single JS file
- Asset inliner converts images to base64
- HTML template generates self-contained file
- Automated checks:
  - File size under limit (fail CI if exceeded)
  - No external URLs (fail if found)
  - MRAID reference present
  - No console.log in production
  - Valid HTML structure

**Stage 4: Size Report (PR only)**
- Comments on the PR with bundle size
- Shows delta from main branch
- Warns if approaching size limit

The entire pipeline runs in under 3 minutes. On merge to main, the artifact is automatically uploaded to our asset storage where the UA team can access it for network uploads.

I don't automate network uploads because each network has its own dashboard and creative review process. But I do automate everything up to producing the final validated HTML file."

---

### Q3: "A playable ad works perfectly in Chrome but fails in a Facebook in-app WebView. How do you debug?"

**Strong Answer:**

"This is a very common scenario. The Facebook in-app browser (WebView) has different capabilities than Chrome.

**Immediate debugging steps:**

1. **Remote debugging:**
   - Android: Enable USB debugging, connect device, `chrome://inspect` to see the WebView
   - iOS: Safari → Develop → Device → the WebView page

2. **Common WebView issues:**

   - **Missing APIs:** WebView might not support `OffscreenCanvas`, `ResizeObserver`, or newer JS APIs. Check with feature detection:
   ```typescript
   if (typeof ResizeObserver === 'undefined') {
     // Fallback to window resize event
   }
   ```

   - **Audio restrictions:** Facebook WebView has stricter audio autoplay policies. Audio must be triggered by explicit user interaction (not just touch anywhere).

   - **Touch events:** The Facebook app may intercept certain touch gestures (swipe to go back). Use `{ passive: false }` and `preventDefault()` on your game canvas.

   - **Canvas context:** Some WebViews have WebGL issues. Always have a Canvas2D fallback:
   ```typescript
   const gl = canvas.getContext('webgl');
   if (!gl) {
     const ctx = canvas.getContext('2d');
     // Use 2D renderer
   }
   ```

   - **Performance:** WebViews run in the host app's process, competing for resources. The game that runs at 60fps in Chrome might only get 30fps in a WebView.

3. **Systematic fix process:**
   - Reproduce the exact issue in the WebView
   - Check console for errors via remote debugging
   - Identify which API or behavior differs
   - Add feature detection and fallback
   - Test fix in the same WebView
   - Verify no regression in Chrome

4. **Prevention:** I maintain a `WebViewCompat` module that wraps all potentially incompatible APIs with feature detection and fallbacks. This gets applied during initialization."

---

### Q4: "How do you ensure MRAID compliance across multiple ad networks?"

**Strong Answer:**

"I build a universal ad bridge that abstracts the differences between networks.

**The core challenge:** Different networks implement MRAID slightly differently, and some (like ironSource) use their own API (DAPI) instead.

**My approach:**

1. **Universal bridge pattern:**
   I create an `AdBridge` class that detects the environment and provides a consistent API:

   - Detects MRAID, DAPI, or desktop
   - Normalizes `ready` event across all APIs
   - Normalizes `viewableChange`
   - Normalizes `openStore` / `open`
   - Falls back to desktop behavior for development

2. **MRAID compliance essentials:**
   - Always include `<script src="mraid.js"></script>` (even though the file doesn't exist - the SDK injects it)
   - Never start the game until `ready` event fires
   - Never play audio until `viewableChange` says `true`
   - Always use `mraid.open()` for CTA, never `window.open()`
   - Handle `stateChange` to pause/resume

3. **Testing matrix:**
   For each network, I test:
   - Does the game load and become interactive?
   - Does the CTA redirect to the correct store?
   - Does audio respect the system volume?
   - Does the game pause when not viewable?
   - Does orientation change work?

4. **Automated compliance check:**
   Part of my CI pipeline validates:
   - mraid.js reference exists
   - No `window.open()` calls
   - No external network requests
   - Viewport meta tag present

Most rejection issues come from forgetting to use `mraid.open()` or having external resource requests. The automated checks catch these before submission."

---

### Q5: "Describe your QA process for a new playable ad. How long does it take?"

**Strong Answer:**

"My QA process takes about 4-6 hours for a thorough pass, plus ongoing monitoring after launch.

**Phase 1: Automated checks (15 minutes)**
- CI pipeline runs: lint, tests, build, size check
- Automated QA script validates MRAID, no external requests, size limits
- Fix any failures before manual testing

**Phase 2: Developer self-test (1 hour)**
- Play through entire flow 5+ times on my development device
- Test both orientations
- Test with volume on and off
- Test idle behavior (wait 5 seconds without touching)
- Test rapid tapping / unusual input patterns
- Check performance with Chrome DevTools

**Phase 3: Device lab testing (2-3 hours)**
- Test on 5-8 real devices (see my device matrix)
- Focus on low-end Android (Galaxy A10) for performance
- Focus on iOS for layout/safe areas
- Check tablet layout
- Record any issues with screenshots/screen recordings

**Phase 4: Network-specific testing (1-2 hours)**
- Upload to each target network's preview/testing tool
- Facebook Ad Preview
- Unity Creative Tester
- ironSource test panel
- Verify CTA works in each network's environment
- Check that viewability events are handled

**Phase 5: Stakeholder review (30 minutes)**
- Send preview links to the UA manager and game team
- Collect feedback on gameplay feel and end card messaging
- Make final adjustments

**Phase 6: Post-launch monitoring (ongoing)**
- First 24 hours: monitor crash reports, error rates
- First 48 hours: check initial CTR and engagement metrics
- First week: compare performance against previous creatives

The most common issues found during QA are:
1. Layout problems on specific screen sizes (30% of issues)
2. Audio not pausing/resuming correctly (20%)
3. Performance issues on low-end devices (20%)
4. CTA not working in specific network's WebView (15%)
5. Orientation change bugs (15%)"

---

### Q6: "How do you handle creative review rejections from ad networks?"

**Strong Answer:**

"Rejections happen. The key is to have a fast turnaround process.

**Prevention (reduce rejections):**
1. Maintain a checklist per network with their specific requirements
2. Run automated checks before submission
3. Review the network's policy documentation quarterly for changes
4. Keep a log of all past rejections and their fixes

**When rejected:**

1. **Read the rejection reason carefully.** Networks usually provide a specific category:
   - Technical issue (size, loading, crash)
   - Policy violation (misleading, inappropriate content)
   - Quality issue (low quality, poor UX)

2. **Common fixes by rejection type:**

   *Size exceeds limit:*
   - Compress images further (TinyPNG)
   - Remove unused sprites
   - Switch audio to Web Audio synthesis
   - Split atlas into smaller textures

   *External requests:*
   - Check for analytics scripts accidentally left in
   - Verify no CDN font loading
   - Check for tracking pixels
   - Ensure all images are base64 inline

   *Misleading content:*
   - Ensure gameplay in ad matches actual app
   - Remove exaggerated effects not in the real game
   - Update end card to accurately represent the app

   *Performance issues:*
   - Test on the specific device the reviewer used (if reported)
   - Reduce canvas resolution for mobile
   - Simplify animations
   - Add loading screen if first frame is slow

3. **Fix → Re-test → Re-submit:**
   - Usually a same-day fix
   - Run through the full QA checklist again (don't just fix the one thing)
   - Re-submit with a note explaining the fix
   - Second review is usually faster (1-2 days instead of 3)

4. **Escalation:**
   - If rejected unfairly, contact the network's creative support team
   - Provide screenshots/recordings showing compliance
   - Ask for specific feedback on what needs to change"

---

### Q7: "How would you set up visual regression testing for a canvas-based game?"

**Strong Answer:**

"Visual regression testing for canvas games is tricky because renders can vary across GPUs and platforms. Here's my approach:

**Core method:** Use `canvas.toDataURL()` to capture screenshots and compare them pixel-by-pixel.

**Making it deterministic:**
1. **Fixed random seed:** All game randomness must use a seeded PRNG, not `Math.random()`
2. **Fixed timestamp:** Pass explicit timestamps to the game loop, not `Date.now()`
3. **Fixed viewport:** Always render to the same canvas dimensions in tests
4. **No async rendering:** Tests wait for all animations to complete before capturing

**Implementation:**
- Capture reference screenshots for key game states (loading, gameplay, end card)
- On each build, render the same states with the same seed
- Compare pixel-by-pixel with a threshold (1-2% difference allowed for anti-aliasing)
- Generate a visual diff image highlighting changes in red
- Fail the test if diff exceeds threshold

**Practical limitations:**
- Different GPUs render text slightly differently, so I avoid testing text-heavy screens
- Anti-aliasing produces different results across platforms, so I use a tolerance
- I run visual tests only on the CI server (consistent GPU) and not on developer machines
- I test game LOGIC with unit tests (no rendering) and only use visual regression for critical visual states

**When it's worth it:**
- Catching unintended visual changes during refactoring
- Verifying sprite atlas changes don't break layouts
- Ensuring animation keyframes produce expected results
- Protecting against rendering regressions in the engine"

---

### Q8: "What automated tests would you write for a Match-3 playable ad?"

**Strong Answer:**

"I'd write tests at three levels: game logic, game flow, and integration.

**Level 1: Game logic unit tests (highest priority)**

```
Grid tests:
- createGrid generates correct dimensions
- findMatches detects horizontal/vertical matches of 3, 4, 5
- findMatches returns empty when no matches exist
- gravity drops pieces correctly after removal
- refill generates valid new pieces
- cascadeCycle correctly chains: remove → gravity → refill → recheck
- swapCells creates new grid without mutating original
- isValidSwap returns true only for adjacent cells
- isValidSwap returns false for diagonal/distant cells

Scoring tests:
- basic match = 30 points
- 4-match = 50 points + creates line clear piece
- 5-match = 100 points + creates bomb piece
- combo multiplier increases correctly per cascade
- score never goes negative

Special pieces tests:
- line clear removes entire row/column
- bomb removes 3x3 area
- combining specials triggers correct behavior
```

**Level 2: Game flow tests**

```
Scene transitions:
- starts in loading state
- transitions to tutorial after assets loaded
- tutorial shows animated hand on target cells
- transitions to gameplay after tutorial completed
- end card appears when timer reaches 0
- end card appears when player reaches score threshold
- CTA button click calls mraid.open()

Idle behavior:
- auto-advances after 3 seconds of no input
- idle hint shows after 2 seconds

Timer:
- 25-second countdown updates every second
- timer pauses when ad not viewable
- timer resumes when ad becomes viewable
```

**Level 3: Integration tests**

```
Full playthrough:
- Replay a recorded input sequence → verify final score
- Deterministic seed produces same game board every time
- Complete game in under 25 seconds
- End card renders after game completion
```

I skip visual/rendering tests for the most part and focus on logic correctness. A correct game loop with wrong colors is a minor bug; correct colors with wrong match detection is a game-breaking bug."
