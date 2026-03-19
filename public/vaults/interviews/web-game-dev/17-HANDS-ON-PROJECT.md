# Hands-On Project: Build a Complete Playable Ad

## Table of Contents

1. [Project Overview](#project-overview)
2. [Phase 1: Project Setup](#phase-1-project-setup)
3. [Phase 2: Core Engine](#phase-2-core-engine)
4. [Phase 3: Match-3 Logic](#phase-3-match-3-logic)
5. [Phase 4: Game Flow](#phase-4-game-flow)
6. [Phase 5: Visual Polish](#phase-5-visual-polish)
7. [Phase 6: Optimization & Deployment](#phase-6-optimization--deployment)
8. [Complete Architecture](#complete-architecture)
9. [Size Budget](#size-budget)
10. [Performance Targets](#performance-targets)
11. [Interview Discussion](#interview-discussion)

---

## Project Overview

We are building a **Match-3 playable ad** from scratch. The final deliverable is a single HTML file under 3MB that runs at 60fps on low-end Android devices, implements MRAID for ad network compatibility, and guides the player through a satisfying 20-second gameplay experience ending with a call-to-action.

### What We Are Building

```
Flow:
  Loading (0-500ms) → Tutorial (3s) → Gameplay (15-20s) → End Card (until CTA)

Features:
  - 7×8 grid of colored gems
  - Swipe to swap adjacent gems
  - Match-3 detection (horizontal + vertical)
  - Cascade: remove → gravity → refill → recheck
  - Combo scoring multiplier
  - Special pieces (4-match line clear, 5-match bomb)
  - Animated tutorial hand
  - 25-second timer
  - Particle effects on matches
  - Screen shake on combos
  - Web Audio sound effects (zero file size)
  - End card with CTA button
  - MRAID bridge with desktop fallback
  - Single-file HTML output under 3MB
```

---

## Phase 1: Project Setup

### Project Structure

```
match3-playable/
├── src/
│   ├── main.ts            # Entry point
│   ├── Game.ts            # Main game class
│   ├── Grid.ts            # Match-3 grid logic
│   ├── Renderer.ts        # Canvas rendering
│   ├── Input.ts           # Touch/mouse input
│   ├── Tween.ts           # Animation system
│   ├── Particles.ts       # Particle effects
│   ├── SceneManager.ts    # Scene state machine
│   ├── MraidBridge.ts     # MRAID/DAPI adapter
│   ├── Audio.ts           # Web Audio sound synthesis
│   ├── ObjectPool.ts      # Generic object pool
│   └── types.ts           # Shared type definitions
├── assets/
│   ├── atlas.png          # Sprite atlas
│   └── atlas.json         # Atlas frame data
├── template.html          # HTML template
├── build.ts               # Build script
├── esbuild.config.ts      # esbuild configuration
├── tsconfig.json
└── package.json
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "declaration": false,
    "sourceMap": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Build Pipeline (esbuild)

```typescript
// esbuild.config.ts
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

interface BuildOptions {
  readonly minify: boolean;
  readonly sourcemap: boolean;
}

async function build(options: BuildOptions): Promise<void> {
  // Step 1: Bundle TypeScript into single JS
  const result = await esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: options.minify,
    sourcemap: options.sourcemap,
    target: 'es2015',
    format: 'iife',
    write: false,
  });

  const jsCode = result.outputFiles[0].text;

  // Step 2: Read and inline assets
  const atlasImage = fs.readFileSync('assets/atlas.png');
  const atlasBase64 = atlasImage.toString('base64');
  const atlasJson = fs.readFileSync('assets/atlas.json', 'utf-8');

  // Step 3: Generate HTML
  const html = generateHTML(jsCode, atlasBase64, atlasJson);

  // Step 4: Write output
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);

  // Step 5: Report size
  const sizeBytes = Buffer.byteLength(html);
  const sizeKB = (sizeBytes / 1024).toFixed(1);
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

  console.log(`Build complete: ${sizeKB}KB (${sizeMB}MB)`);

  if (sizeBytes > 3 * 1024 * 1024) {
    console.error('WARNING: Bundle exceeds 3MB target!');
    process.exit(1);
  }
}

function generateHTML(
  js: string,
  atlasBase64: string,
  atlasJson: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Play Now</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#1a1a2e;touch-action:none;user-select:none;-webkit-user-select:none}
canvas{display:block;width:100%;height:100%}
</style>
<script src="mraid.js"></script>
</head>
<body>
<canvas id="game"></canvas>
<script>
window.__ATLAS_BASE64__="${atlasBase64}";
window.__ATLAS_JSON__=${atlasJson};
</script>
<script>${js}</script>
</body>
</html>`;
}

// Run build
const isProd = process.argv.includes('--prod');
build({
  minify: isProd,
  sourcemap: !isProd,
}).catch(console.error);
```

### MRAID Bridge with Desktop Fallback

```typescript
// src/MraidBridge.ts

type MraidEventCallback = (...args: unknown[]) => void;

interface MraidAPI {
  getState(): string;
  isViewable(): boolean;
  addEventListener(event: string, callback: MraidEventCallback): void;
  removeEventListener(event: string, callback: MraidEventCallback): void;
  open(url: string): void;
  getVersion(): string;
}

interface DapiAPI {
  isReady(): boolean;
  addEventListener(event: string, callback: MraidEventCallback): void;
  removeEventListener(event: string, callback: MraidEventCallback): void;
  getScreenSize(): { width: number; height: number };
  getAudioVolume(): number;
  openStoreUrl(url: string): void;
}

type AdEnvironment = 'mraid' | 'dapi' | 'desktop';

export class MraidBridge {
  private readonly environment: AdEnvironment;
  private readonly storeUrl: string;
  private readonly onReadyCallbacks: Array<() => void> = [];
  private readonly onViewableCallbacks: Array<(viewable: boolean) => void> = [];
  private isReady: boolean = false;
  private isViewable: boolean = false;

  constructor(storeUrl: string) {
    this.storeUrl = storeUrl;
    this.environment = this.detectEnvironment();
    this.initialize();
  }

  private detectEnvironment(): AdEnvironment {
    if (typeof (window as any).dapi !== 'undefined') return 'dapi';
    if (typeof (window as any).mraid !== 'undefined') return 'mraid';
    return 'desktop';
  }

  private initialize(): void {
    switch (this.environment) {
      case 'mraid':
        this.initMraid();
        break;
      case 'dapi':
        this.initDapi();
        break;
      case 'desktop':
        this.initDesktop();
        break;
    }
  }

  private initMraid(): void {
    const mraid = (window as any).mraid as MraidAPI;

    const onReady = (): void => {
      mraid.removeEventListener('ready', onReady);

      const onViewable = (viewable: boolean): void => {
        this.isViewable = viewable;
        for (const cb of this.onViewableCallbacks) {
          cb(viewable);
        }

        if (viewable && !this.isReady) {
          this.isReady = true;
          for (const cb of this.onReadyCallbacks) {
            cb();
          }
        }
      };

      mraid.addEventListener('viewableChange', onViewable);

      // Check if already viewable
      if (mraid.isViewable()) {
        onViewable(true);
      }
    };

    if (mraid.getState() === 'ready') {
      onReady();
    } else {
      mraid.addEventListener('ready', onReady);
    }
  }

  private initDapi(): void {
    const dapi = (window as any).dapi as DapiAPI;

    const onReady = (): void => {
      dapi.removeEventListener('ready', onReady);

      this.isReady = true;
      this.isViewable = true;

      for (const cb of this.onReadyCallbacks) {
        cb();
      }
      for (const cb of this.onViewableCallbacks) {
        cb(true);
      }

      dapi.addEventListener('viewableChange', (event: any) => {
        const viewable = event.isViewable;
        this.isViewable = viewable;
        for (const cb of this.onViewableCallbacks) {
          cb(viewable);
        }
      });
    };

    if (dapi.isReady()) {
      onReady();
    } else {
      dapi.addEventListener('ready', onReady);
    }
  }

  private initDesktop(): void {
    // Desktop: ready immediately
    setTimeout(() => {
      this.isReady = true;
      this.isViewable = true;

      for (const cb of this.onReadyCallbacks) {
        cb();
      }
      for (const cb of this.onViewableCallbacks) {
        cb(true);
      }
    }, 50);
  }

  onReady(callback: () => void): void {
    if (this.isReady) {
      callback();
    } else {
      this.onReadyCallbacks.push(callback);
    }
  }

  onViewableChange(callback: (viewable: boolean) => void): void {
    this.onViewableCallbacks.push(callback);
  }

  openStore(): void {
    switch (this.environment) {
      case 'mraid':
        (window as any).mraid.open(this.storeUrl);
        break;
      case 'dapi':
        (window as any).dapi.openStoreUrl(this.storeUrl);
        break;
      case 'desktop':
        window.open(this.storeUrl, '_blank');
        break;
    }
  }

  getVolume(): number {
    if (this.environment === 'dapi') {
      return (window as any).dapi.getAudioVolume();
    }
    return 1.0;
  }

  getEnvironment(): AdEnvironment {
    return this.environment;
  }

  getIsViewable(): boolean {
    return this.isViewable;
  }
}
```

---

## Phase 2: Core Engine

### Game Loop with Fixed Timestep

```typescript
// src/Game.ts

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bridge: MraidBridge;

  private lastTime: number = 0;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1 / 60; // 60 updates per second
  private readonly maxAccumulator: number = 0.1; // Prevent spiral of death
  private rafId: number = 0;
  private isPaused: boolean = false;

  private sceneManager: SceneManager;
  private input: InputHandler;
  private renderer: Renderer;
  private tweenManager: TweenManager;
  private particleSystem: ParticleSystem;
  private audio: AudioManager;

  constructor(canvas: HTMLCanvasElement, bridge: MraidBridge) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bridge = bridge;

    this.input = new InputHandler(canvas);
    this.tweenManager = new TweenManager();
    this.particleSystem = new ParticleSystem(500);
    this.audio = new AudioManager();
    this.renderer = new Renderer(this.ctx);
    this.sceneManager = new SceneManager(this);

    // Pause when ad not viewable
    bridge.onViewableChange((viewable) => {
      this.isPaused = !viewable;
      if (viewable) {
        this.lastTime = performance.now();
      }
    });
  }

  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.sceneManager.switchTo('loading');
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private loop(timestamp: number): void {
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    if (this.isPaused) {
      this.lastTime = timestamp;
      return;
    }

    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Clamp delta time to prevent huge jumps
    if (dt > this.maxAccumulator) {
      dt = this.maxAccumulator;
    }

    this.accumulator += dt;

    // Fixed timestep updates
    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Render with interpolation
    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);
  }

  private update(dt: number): void {
    this.input.update();
    this.tweenManager.update(dt);
    this.particleSystem.update(dt);
    this.sceneManager.update(dt);
  }

  private render(alpha: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.sceneManager.render(ctx, alpha);
    this.particleSystem.render(ctx);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  // Accessors for subsystems
  getInput(): InputHandler {
    return this.input;
  }
  getTweens(): TweenManager {
    return this.tweenManager;
  }
  getParticles(): ParticleSystem {
    return this.particleSystem;
  }
  getAudio(): AudioManager {
    return this.audio;
  }
  getRenderer(): Renderer {
    return this.renderer;
  }
  getBridge(): MraidBridge {
    return this.bridge;
  }
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
```

### Touch Input Handler

```typescript
// src/Input.ts

interface InputState {
  readonly x: number;
  readonly y: number;
  readonly isDown: boolean;
  readonly justPressed: boolean;
  readonly justReleased: boolean;
  readonly swipeDir: SwipeDirection | null;
}

type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export class InputHandler {
  private current: InputState;
  private startX: number = 0;
  private startY: number = 0;
  private isPressed: boolean = false;
  private wasPressed: boolean = false;
  private released: boolean = false;
  private swipe: SwipeDirection | null = null;

  private readonly swipeThreshold: number = 30;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.current = {
      x: 0,
      y: 0,
      isDown: false,
      justPressed: false,
      justReleased: false,
      swipeDir: null,
    };

    this.bindEvents();
  }

  private bindEvents(): void {
    const canvas = this.canvas;

    // Touch events
    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        this.onPointerDown(touch.clientX, touch.clientY);
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        this.onPointerMove(touch.clientX, touch.clientY);
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchend',
      (e) => {
        e.preventDefault();
        this.onPointerUp();
      },
      { passive: false }
    );

    // Mouse events (for desktop testing)
    canvas.addEventListener('mousedown', (e) => {
      this.onPointerDown(e.clientX, e.clientY);
    });

    canvas.addEventListener('mousemove', (e) => {
      this.onPointerMove(e.clientX, e.clientY);
    });

    canvas.addEventListener('mouseup', () => {
      this.onPointerUp();
    });
  }

  private onPointerDown(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.startX = clientX - rect.left;
    this.startY = clientY - rect.top;
    this.isPressed = true;
    this.swipe = null;
  }

  private onPointerMove(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    this.current = { ...this.current, x, y };

    // Detect swipe during drag
    if (this.isPressed && this.swipe === null) {
      const dx = x - this.startX;
      const dy = y - this.startY;

      if (
        Math.abs(dx) > this.swipeThreshold ||
        Math.abs(dy) > this.swipeThreshold
      ) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.swipe = dx > 0 ? 'right' : 'left';
        } else {
          this.swipe = dy > 0 ? 'down' : 'up';
        }
      }
    }
  }

  private onPointerUp(): void {
    this.isPressed = false;
    this.released = true;
  }

  update(): void {
    this.current = {
      x: this.current.x,
      y: this.current.y,
      isDown: this.isPressed,
      justPressed: this.isPressed && !this.wasPressed,
      justReleased: this.released,
      swipeDir: this.swipe,
    };

    this.wasPressed = this.isPressed;
    this.released = false;

    // Reset swipe after it's been read
    if (this.swipe !== null && !this.isPressed) {
      this.swipe = null;
    }
  }

  getState(): InputState {
    return this.current;
  }

  getStartPosition(): { x: number; y: number } {
    return { x: this.startX, y: this.startY };
  }
}
```

### Tween System

```typescript
// src/Tween.ts

type EasingFunction = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,

  easeInQuad: (t: number): number => t * t,

  easeOutQuad: (t: number): number => t * (2 - t),

  easeInOutQuad: (t: number): number =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },

  easeOutElastic: (t: number): number => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
} as const;

interface TweenConfig {
  readonly target: Record<string, number>;
  readonly property: string;
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly easing: EasingFunction;
  readonly delay: number;
  readonly onComplete?: () => void;
  readonly onUpdate?: (value: number) => void;
}

interface ActiveTween {
  readonly config: TweenConfig;
  elapsed: number;
  started: boolean;
  completed: boolean;
}

export class TweenManager {
  private readonly tweens: ActiveTween[] = [];

  create(
    config: Partial<TweenConfig> & {
      target: Record<string, number>;
      property: string;
      to: number;
      duration: number;
    }
  ): ActiveTween {
    const fullConfig: TweenConfig = {
      from: config.target[config.property],
      easing: Easing.easeOutQuad,
      delay: 0,
      ...config,
    };

    const tween: ActiveTween = {
      config: fullConfig,
      elapsed: 0,
      started: false,
      completed: false,
    };

    this.tweens.push(tween);
    return tween;
  }

  // Convenience: tween multiple properties
  animate(
    target: Record<string, number>,
    properties: Record<string, number>,
    duration: number,
    easing: EasingFunction = Easing.easeOutQuad,
    onComplete?: () => void
  ): void {
    const keys = Object.keys(properties);

    for (let i = 0; i < keys.length; i++) {
      const prop = keys[i];
      this.create({
        target,
        property: prop,
        to: properties[prop],
        duration,
        easing,
        onComplete: i === keys.length - 1 ? onComplete : undefined,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];

      if (tween.completed) {
        this.tweens.splice(i, 1);
        continue;
      }

      tween.elapsed += dt;

      // Handle delay
      if (tween.elapsed < tween.config.delay) continue;

      if (!tween.started) {
        tween.started = true;
      }

      const activeTime = tween.elapsed - tween.config.delay;
      const progress = Math.min(1, activeTime / tween.config.duration);
      const easedProgress = tween.config.easing(progress);

      const value =
        tween.config.from +
        (tween.config.to - tween.config.from) * easedProgress;

      tween.config.target[tween.config.property] = value;

      if (tween.config.onUpdate) {
        tween.config.onUpdate(value);
      }

      if (progress >= 1) {
        tween.completed = true;
        tween.config.target[tween.config.property] = tween.config.to;
        if (tween.config.onComplete) {
          tween.config.onComplete();
        }
      }
    }
  }

  cancelAll(): void {
    this.tweens.length = 0;
  }

  getActiveCount(): number {
    return this.tweens.length;
  }
}
```

### Object Pool

```typescript
// src/ObjectPool.ts

export class ObjectPool<T> {
  private readonly pool: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn: (obj: T) => void;

  constructor(
    factory: () => T,
    resetFn: (obj: T) => void,
    initialSize: number
  ) {
    this.factory = factory;
    this.resetFn = resetFn;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }
}
```

---

## Phase 3: Match-3 Logic

### Grid System

```typescript
// src/Grid.ts

export interface Cell {
  type: number; // -1 = empty, 0-5 = gem types
  special: SpecialType;
  row: number;
  col: number;
  // Render state (mutable for tweens)
  screenX: number;
  screenY: number;
  scale: number;
  alpha: number;
  angle: number; // For spin effects
}

export type SpecialType = 'none' | 'lineH' | 'lineV' | 'bomb';

export interface MatchResult {
  readonly cells: ReadonlyArray<{ row: number; col: number }>;
  readonly length: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly type: number;
}

export interface CascadeStep {
  readonly type: 'remove' | 'gravity' | 'refill';
  readonly affectedCells: ReadonlyArray<{
    row: number;
    col: number;
    fromRow?: number;
    newType?: number;
  }>;
  readonly matches?: readonly MatchResult[];
  readonly combo: number;
  readonly score: number;
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly typeCount: number;
  private cells: Cell[][];

  constructor(cols: number, rows: number, typeCount: number = 6) {
    this.cols = cols;
    this.rows = rows;
    this.typeCount = typeCount;
    this.cells = this.createGrid();
    this.ensureNoInitialMatches();
  }

  private createGrid(): Cell[][] {
    return Array.from({ length: this.rows }, (_, row) =>
      Array.from({ length: this.cols }, (_, col) => ({
        type: Math.floor(Math.random() * this.typeCount),
        special: 'none' as SpecialType,
        row,
        col,
        screenX: 0,
        screenY: 0,
        scale: 1,
        alpha: 1,
        angle: 0,
      }))
    );
  }

  private ensureNoInitialMatches(): void {
    let matches = this.findMatches();

    while (matches.length > 0) {
      for (const match of matches) {
        const cell = match.cells[0];
        let newType: number;
        do {
          newType = Math.floor(Math.random() * this.typeCount);
        } while (newType === this.cells[cell.row][cell.col].type);
        this.cells[cell.row][cell.col].type = newType;
      }
      matches = this.findMatches();
    }
  }

  getCell(row: number, col: number): Cell | null {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  swap(r1: number, c1: number, r2: number, c2: number): void {
    const temp = this.cells[r1][c1];
    this.cells[r1][c1] = this.cells[r2][c2];
    this.cells[r2][c2] = temp;

    // Update cell positions
    this.cells[r1][c1].row = r1;
    this.cells[r1][c1].col = c1;
    this.cells[r2][c2].row = r2;
    this.cells[r2][c2].col = c2;
  }

  isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
    return (
      (Math.abs(r1 - r2) === 1 && c1 === c2) ||
      (Math.abs(c1 - c2) === 1 && r1 === r2)
    );
  }

  findMatches(): readonly MatchResult[] {
    const matches: MatchResult[] = [];

    // Horizontal
    for (let row = 0; row < this.rows; row++) {
      let start = 0;
      for (let col = 1; col <= this.cols; col++) {
        const same =
          col < this.cols &&
          this.cells[row][col].type >= 0 &&
          this.cells[row][col].type === this.cells[row][start].type;

        if (!same) {
          if (col - start >= 3) {
            const cells = [];
            for (let c = start; c < col; c++) {
              cells.push({ row, col: c });
            }
            matches.push({
              cells,
              length: col - start,
              orientation: 'horizontal',
              type: this.cells[row][start].type,
            });
          }
          start = col;
        }
      }
    }

    // Vertical
    for (let col = 0; col < this.cols; col++) {
      let start = 0;
      for (let row = 1; row <= this.rows; row++) {
        const same =
          row < this.rows &&
          this.cells[row][col].type >= 0 &&
          this.cells[row][col].type === this.cells[start][col].type;

        if (!same) {
          if (row - start >= 3) {
            const cells = [];
            for (let r = start; r < row; r++) {
              cells.push({ row: r, col });
            }
            matches.push({
              cells,
              length: row - start,
              orientation: 'vertical',
              type: this.cells[start][col].type,
            });
          }
          start = row;
        }
      }
    }

    return matches;
  }

  removeMatches(matches: readonly MatchResult[]): void {
    const removedSet = new Set<string>();

    for (const match of matches) {
      // Handle special piece creation
      if (match.length === 4) {
        const mid = Math.floor(match.cells.length / 2);
        const specialCell = match.cells[mid];
        this.cells[specialCell.row][specialCell.col].special =
          match.orientation === 'horizontal' ? 'lineV' : 'lineH';

        for (let i = 0; i < match.cells.length; i++) {
          if (i !== mid) {
            const key = `${match.cells[i].row},${match.cells[i].col}`;
            removedSet.add(key);
          }
        }
      } else if (match.length >= 5) {
        const mid = Math.floor(match.cells.length / 2);
        this.cells[match.cells[mid].row][match.cells[mid].col].special = 'bomb';

        for (let i = 0; i < match.cells.length; i++) {
          if (i !== mid) {
            const key = `${match.cells[i].row},${match.cells[i].col}`;
            removedSet.add(key);
          }
        }
      } else {
        for (const cell of match.cells) {
          const key = `${cell.row},${cell.col}`;
          removedSet.add(key);
        }
      }
    }

    for (const key of removedSet) {
      const [row, col] = key.split(',').map(Number);
      this.cells[row][col].type = -1;
      this.cells[row][col].special = 'none';
    }
  }

  applyGravity(): Array<{ row: number; col: number; fromRow: number }> {
    const movements: Array<{ row: number; col: number; fromRow: number }> = [];

    for (let col = 0; col < this.cols; col++) {
      let writeRow = this.rows - 1;

      for (let readRow = this.rows - 1; readRow >= 0; readRow--) {
        if (this.cells[readRow][col].type >= 0) {
          if (readRow !== writeRow) {
            // Swap cells
            const temp = this.cells[writeRow][col];
            this.cells[writeRow][col] = this.cells[readRow][col];
            this.cells[readRow][col] = temp;

            // Update positions
            this.cells[writeRow][col].row = writeRow;
            this.cells[writeRow][col].col = col;
            this.cells[readRow][col].row = readRow;
            this.cells[readRow][col].col = col;

            movements.push({ row: writeRow, col, fromRow: readRow });
          }
          writeRow--;
        }
      }
    }

    return movements;
  }

  refill(): Array<{ row: number; col: number; type: number }> {
    const newCells: Array<{ row: number; col: number; type: number }> = [];

    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        if (this.cells[row][col].type < 0) {
          const newType = Math.floor(Math.random() * this.typeCount);
          this.cells[row][col].type = newType;
          this.cells[row][col].special = 'none';
          this.cells[row][col].scale = 0; // Start small for pop-in animation
          newCells.push({ row, col, type: newType });
        }
      }
    }

    return newCells;
  }

  calculateScore(matches: readonly MatchResult[], combo: number): number {
    let score = 0;
    for (const match of matches) {
      const baseScore = match.length === 3 ? 30 : match.length === 4 ? 50 : 100;
      score += baseScore * combo;
    }
    return score;
  }

  // Run full cascade, returning steps for animation
  executeCascade(): readonly CascadeStep[] {
    const steps: CascadeStep[] = [];
    let combo = 0;

    while (true) {
      const matches = this.findMatches();
      if (matches.length === 0) break;

      combo++;

      const score = this.calculateScore(matches, combo);

      // Remove
      this.removeMatches(matches);
      steps.push({
        type: 'remove',
        affectedCells: matches.flatMap((m) => m.cells),
        matches,
        combo,
        score,
      });

      // Gravity
      const fallen = this.applyGravity();
      if (fallen.length > 0) {
        steps.push({
          type: 'gravity',
          affectedCells: fallen,
          combo,
          score: 0,
        });
      }

      // Refill
      const newCells = this.refill();
      steps.push({
        type: 'refill',
        affectedCells: newCells.map((c) => ({
          row: c.row,
          col: c.col,
          newType: c.type,
        })),
        combo,
        score: 0,
      });
    }

    return steps;
  }

  getAllCells(): readonly Cell[] {
    return this.cells.flat();
  }
}
```

---

## Phase 4: Game Flow

### Scene Manager

```typescript
// src/SceneManager.ts

type SceneName = 'loading' | 'tutorial' | 'game' | 'endCard';

interface Scene {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
}

export class SceneManager {
  private readonly scenes: Map<SceneName, Scene> = new Map();
  private currentScene: Scene | null = null;
  private currentName: SceneName | null = null;

  constructor(game: Game) {
    this.scenes.set('loading', new LoadingScene(game, this));
    this.scenes.set('tutorial', new TutorialScene(game, this));
    this.scenes.set('game', new GameScene(game, this));
    this.scenes.set('endCard', new EndCardScene(game, this));
  }

  switchTo(name: SceneName): void {
    if (this.currentScene) {
      this.currentScene.exit();
    }

    this.currentName = name;
    this.currentScene = this.scenes.get(name) ?? null;

    if (this.currentScene) {
      this.currentScene.enter();
    }
  }

  update(dt: number): void {
    if (this.currentScene) {
      this.currentScene.update(dt);
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (this.currentScene) {
      this.currentScene.render(ctx, alpha);
    }
  }

  getCurrentScene(): SceneName | null {
    return this.currentName;
  }
}
```

### Loading Scene

```typescript
class LoadingScene implements Scene {
  private readonly game: Game;
  private readonly sceneManager: SceneManager;

  constructor(game: Game, sceneManager: SceneManager) {
    this.game = game;
    this.sceneManager = sceneManager;
  }

  enter(): void {
    // Load assets (already inlined as base64)
    this.loadAtlas().then(() => {
      this.sceneManager.switchTo('tutorial');
    });
  }

  exit(): void {}

  private async loadAtlas(): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Store atlas reference
        resolve();
      };
      img.src = `data:image/png;base64,${(window as any).__ATLAS_BASE64__}`;
    });
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', w / 2, h / 2);
  }
}
```

### Tutorial Scene

```typescript
class TutorialScene implements Scene {
  private readonly game: Game;
  private readonly sceneManager: SceneManager;
  private elapsed: number = 0;
  private handX: number = 0;
  private handY: number = 0;
  private readonly tutorialDuration: number = 3; // seconds

  constructor(game: Game, sceneManager: SceneManager) {
    this.game = game;
    this.sceneManager = sceneManager;
  }

  enter(): void {
    this.elapsed = 0;
    // Position animated hand on the target swap location
    this.handX = 180;
    this.handY = 350;
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;

    // Check for user interaction to skip tutorial
    const input = this.game.getInput().getState();
    if (input.justPressed && this.elapsed > 0.5) {
      this.sceneManager.switchTo('game');
      return;
    }

    // Auto-advance after tutorial duration
    if (this.elapsed >= this.tutorialDuration) {
      this.sceneManager.switchTo('game');
    }
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Draw game board in background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, h);

    // Animated hand
    const bobOffset = Math.sin(this.elapsed * 3) * 10;
    const swipeProgress = (this.elapsed % 2) / 2; // 0-1 every 2 seconds

    const currentHandX = this.handX + swipeProgress * 60;
    const currentHandY = this.handY + bobOffset;

    // Draw hand icon (simple finger shape)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(currentHandX, currentHandY, 15, 0, Math.PI * 2);
    ctx.fill();

    // Hand "tail" (finger)
    ctx.beginPath();
    ctx.moveTo(currentHandX - 8, currentHandY + 10);
    ctx.lineTo(currentHandX + 8, currentHandY + 10);
    ctx.lineTo(currentHandX + 5, currentHandY + 35);
    ctx.lineTo(currentHandX - 5, currentHandY + 35);
    ctx.closePath();
    ctx.fill();

    // "Swipe to match!" text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Swipe to match!', w / 2, h * 0.2);
  }
}
```

### Game Scene

```typescript
class GameScene implements Scene {
  private readonly game: Game;
  private readonly sceneManager: SceneManager;
  private grid!: Grid;
  private score: number = 0;
  private timeRemaining: number = 25;
  private readonly totalTime: number = 25;
  private idleTimer: number = 0;
  private isAnimating: boolean = false;

  // Layout
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private cellSize: number = 40;

  // Selected cell for swap
  private selectedRow: number = -1;
  private selectedCol: number = -1;

  constructor(game: Game, sceneManager: SceneManager) {
    this.game = game;
    this.sceneManager = sceneManager;
  }

  enter(): void {
    this.grid = new Grid(7, 8, 6);
    this.score = 0;
    this.timeRemaining = this.totalTime;
    this.idleTimer = 0;

    // Calculate layout
    const canvas = this.game.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    this.cellSize = Math.min(
      Math.floor((w * 0.85) / this.grid.cols),
      Math.floor((h * 0.6) / this.grid.rows)
    );

    this.gridOffsetX = (w - this.grid.cols * this.cellSize) / 2;
    this.gridOffsetY = h * 0.2;

    // Position all cells
    for (const cell of this.grid.getAllCells()) {
      cell.screenX =
        this.gridOffsetX + cell.col * this.cellSize + this.cellSize / 2;
      cell.screenY =
        this.gridOffsetY + cell.row * this.cellSize + this.cellSize / 2;
    }
  }

  exit(): void {}

  update(dt: number): void {
    // Timer
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.sceneManager.switchTo('endCard');
      return;
    }

    // Idle detection
    const input = this.game.getInput().getState();
    if (input.isDown) {
      this.idleTimer = 0;
    } else {
      this.idleTimer += dt;
      if (this.idleTimer >= 3) {
        // Auto-advance after 3s idle
        this.sceneManager.switchTo('endCard');
        return;
      }
    }

    // Handle input
    if (!this.isAnimating) {
      this.handleInput();
    }
  }

  private handleInput(): void {
    const input = this.game.getInput();
    const state = input.getState();

    if (state.justPressed) {
      const startPos = input.getStartPosition();
      const col = Math.floor((startPos.x - this.gridOffsetX) / this.cellSize);
      const row = Math.floor((startPos.y - this.gridOffsetY) / this.cellSize);

      if (
        row >= 0 &&
        row < this.grid.rows &&
        col >= 0 &&
        col < this.grid.cols
      ) {
        this.selectedRow = row;
        this.selectedCol = col;
      }
    }

    if (state.swipeDir && this.selectedRow >= 0) {
      let targetRow = this.selectedRow;
      let targetCol = this.selectedCol;

      switch (state.swipeDir) {
        case 'up':
          targetRow--;
          break;
        case 'down':
          targetRow++;
          break;
        case 'left':
          targetCol--;
          break;
        case 'right':
          targetCol++;
          break;
      }

      if (this.grid.getCell(targetRow, targetCol)) {
        this.performSwap(
          this.selectedRow,
          this.selectedCol,
          targetRow,
          targetCol
        );
      }

      this.selectedRow = -1;
      this.selectedCol = -1;
    }
  }

  private performSwap(r1: number, c1: number, r2: number, c2: number): void {
    this.isAnimating = true;

    // Swap cells
    this.grid.swap(r1, c1, r2, c2);

    // Check for matches
    const matches = this.grid.findMatches();

    if (matches.length === 0) {
      // No match - swap back
      this.grid.swap(r1, c1, r2, c2);
      this.isAnimating = false;
      return;
    }

    // Execute cascade
    const steps = this.grid.executeCascade();

    // Calculate total score from cascade
    let totalScore = 0;
    for (const step of steps) {
      totalScore += step.score;
    }
    this.score += totalScore;

    // Animate cascade steps
    this.animateCascade(steps, () => {
      this.isAnimating = false;
    });
  }

  private animateCascade(
    steps: readonly CascadeStep[],
    onComplete: () => void
  ): void {
    // Simplified: in production, animate each step with delays
    // For now, just update cell positions and call complete
    for (const cell of this.grid.getAllCells()) {
      cell.screenX =
        this.gridOffsetX + cell.col * this.cellSize + this.cellSize / 2;
      cell.screenY =
        this.gridOffsetY + cell.row * this.cellSize + this.cellSize / 2;
      cell.scale = 1;
    }

    // Play sound effects
    const audio = this.game.getAudio();
    for (const step of steps) {
      if (step.type === 'remove' && step.combo > 0) {
        audio.playMatch(step.combo);
      }
    }

    // Spawn particles at matched cells
    for (const step of steps) {
      if (step.type === 'remove') {
        for (const cell of step.affectedCells) {
          const x =
            this.gridOffsetX + cell.col * this.cellSize + this.cellSize / 2;
          const y =
            this.gridOffsetY + cell.row * this.cellSize + this.cellSize / 2;
          this.game.getParticles().emit(x, y, 10);
        }
      }
    }

    // In production: use TweenManager to animate each step with 300ms delays
    setTimeout(onComplete, 300 * steps.length);
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Score: ${this.score}`, w / 2, 40);

    // Timer bar
    const timerWidth = (this.timeRemaining / this.totalTime) * (w * 0.8);
    const timerColor =
      this.timeRemaining > 10
        ? '#4ecdc4'
        : this.timeRemaining > 5
          ? '#ffd93d'
          : '#ff6b6b';
    ctx.fillStyle = '#333';
    ctx.fillRect(w * 0.1, 60, w * 0.8, 8);
    ctx.fillStyle = timerColor;
    ctx.fillRect(w * 0.1, 60, timerWidth, 8);

    // Grid
    const GEM_COLORS = [
      '#ff6b6b',
      '#ffd93d',
      '#6bcb77',
      '#4d96ff',
      '#9b59b6',
      '#ff9f43',
    ];

    for (const cell of this.grid.getAllCells()) {
      if (cell.type < 0) continue;

      const x = cell.screenX;
      const y = cell.screenY;
      const size = (this.cellSize - 4) * cell.scale;

      ctx.globalAlpha = cell.alpha;
      ctx.fillStyle = GEM_COLORS[cell.type % GEM_COLORS.length];

      // Draw gem as rounded rectangle
      const halfSize = size / 2;
      ctx.beginPath();
      ctx.roundRect(x - halfSize, y - halfSize, size, size, 6);
      ctx.fill();

      // Special piece indicator
      if (cell.special === 'lineH' || cell.special === 'lineV') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (cell.special === 'lineH') {
          ctx.moveTo(x - halfSize + 5, y);
          ctx.lineTo(x + halfSize - 5, y);
        } else {
          ctx.moveTo(x, y - halfSize + 5);
          ctx.lineTo(x, y + halfSize - 5);
        }
        ctx.stroke();
      } else if (cell.special === 'bomb') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, halfSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // Selected cell highlight
    if (this.selectedRow >= 0) {
      const selX = this.gridOffsetX + this.selectedCol * this.cellSize;
      const selY = this.gridOffsetY + this.selectedRow * this.cellSize;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(selX, selY, this.cellSize, this.cellSize);
    }
  }
}
```

### End Card Scene

```typescript
class EndCardScene implements Scene {
  private readonly game: Game;
  private readonly sceneManager: SceneManager;
  private elapsed: number = 0;
  private ctaScale: number = 0;

  constructor(game: Game, sceneManager: SceneManager) {
    this.game = game;
    this.sceneManager = sceneManager;
  }

  enter(): void {
    this.elapsed = 0;

    // Animate CTA button entrance
    const ctaAnim = { scale: 0 };
    this.game.getTweens().create({
      target: ctaAnim,
      property: 'scale',
      to: 1,
      duration: 0.5,
      easing: Easing.easeOutBack,
      delay: 0.3,
      onUpdate: (value) => {
        this.ctaScale = value;
      },
    });
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;

    // Check for CTA tap
    const input = this.game.getInput().getState();
    if (input.justPressed && this.elapsed > 0.5) {
      // Check if tap is on CTA button
      const canvas = this.game.getCanvas();
      const ctaX = canvas.clientWidth / 2;
      const ctaY = canvas.clientHeight * 0.65;

      const dx = input.x - ctaX;
      const dy = input.y - ctaY;

      if (Math.abs(dx) < 120 && Math.abs(dy) < 30) {
        this.game.getBridge().openStore();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Dark overlay
    ctx.fillStyle = 'rgba(26, 26, 46, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // "Great Job!" text
    ctx.fillStyle = '#ffd93d';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Great Job!', w / 2, h * 0.25);

    // Score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('Score: 1,250', w / 2, h * 0.38);

    // "Download to continue" text
    ctx.fillStyle = '#aaa';
    ctx.font = '20px sans-serif';
    ctx.fillText('Download to continue playing!', w / 2, h * 0.5);

    // CTA Button
    if (this.ctaScale > 0) {
      const ctaW = 240 * this.ctaScale;
      const ctaH = 56 * this.ctaScale;
      const ctaX = w / 2 - ctaW / 2;
      const ctaY = h * 0.65 - ctaH / 2;

      // Button background with pulse
      const pulse = 1 + Math.sin(this.elapsed * 4) * 0.05;
      const scaledW = ctaW * pulse;
      const scaledH = ctaH * pulse;
      const scaledX = w / 2 - scaledW / 2;
      const scaledY = h * 0.65 - scaledH / 2;

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.roundRect(scaledX + 3, scaledY + 3, scaledW, scaledH, 28);
      ctx.fill();

      // Button
      const gradient = ctx.createLinearGradient(
        scaledX,
        scaledY,
        scaledX,
        scaledY + scaledH
      );
      gradient.addColorStop(0, '#4ecdc4');
      gradient.addColorStop(1, '#45b7aa');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(scaledX, scaledY, scaledW, scaledH, 28);
      ctx.fill();

      // Button text
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${20 * this.ctaScale}px sans-serif`;
      ctx.fillText('PLAY NOW', w / 2, h * 0.65 + 7);
    }

    // App icon placeholder
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 30, h * 0.8, 60, 60, 12);
    ctx.fill();
  }
}
```

---

## Phase 5: Visual Polish

### Particle Effects

```typescript
// src/Particles.ts

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  active: boolean;
}

export class ParticleSystem {
  private readonly particles: Particle[];
  private readonly maxParticles: number;

  private static readonly COLORS = [
    '#ff6b6b',
    '#ffd93d',
    '#6bcb77',
    '#4d96ff',
    '#9b59b6',
    '#ff9f43',
    '#ffffff',
    '#ffaaaa',
  ];

  constructor(maxParticles: number) {
    this.maxParticles = maxParticles;
    this.particles = [];

    // Pre-allocate
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 0,
        color: '#fff',
        active: false,
      });
    }
  }

  emit(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.findInactive();
      if (!particle) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;

      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - 50; // Slight upward bias
      particle.life = 0.3 + Math.random() * 0.5;
      particle.maxLife = particle.life;
      particle.size = 2 + Math.random() * 4;
      particle.color =
        ParticleSystem.COLORS[
          Math.floor(Math.random() * ParticleSystem.COLORS.length)
        ];
      particle.active = true;
    }
  }

  private findInactive(): Particle | null {
    for (const p of this.particles) {
      if (!p.active) return p;
    }
    return null;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // Gravity
      p.vx *= 0.98; // Drag
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;

      const alpha = p.life / p.maxLife;
      const size = p.size * alpha;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
```

### Screen Shake

```typescript
class ScreenShake {
  private intensity: number = 0;
  private duration: number = 0;
  private elapsed: number = 0;
  offsetX: number = 0;
  offsetY: number = 0;

  trigger(intensity: number, duration: number): void {
    this.intensity = intensity;
    this.duration = duration;
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (this.elapsed >= this.duration) {
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    this.elapsed += dt;
    const decay = 1 - this.elapsed / this.duration;
    const currentIntensity = this.intensity * decay;

    this.offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
    this.offsetY = (Math.random() - 0.5) * 2 * currentIntensity;
  }

  applyToContext(ctx: CanvasRenderingContext2D): void {
    if (this.offsetX !== 0 || this.offsetY !== 0) {
      ctx.translate(this.offsetX, this.offsetY);
    }
  }
}

// Usage: shake.trigger(8, 0.3) on combo of 3+
```

### Sound Effects with Web Audio (Zero File Size)

```typescript
// src/Audio.ts

export class AudioManager {
  private ctx: AudioContext | null = null;
  private initialized: boolean = false;
  private volume: number = 1;

  // Lazy init: AudioContext requires user interaction
  private ensureContext(): AudioContext | null {
    if (!this.initialized) {
      try {
        this.ctx = new AudioContext();
        this.initialized = true;
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  playMatch(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Higher pitch for higher combos
    const baseFreq = 440 + combo * 100;
    this.playTone(ctx, baseFreq, 0.1, 'sine');

    // Bonus chime for combo > 2
    if (combo > 2) {
      setTimeout(() => {
        this.playTone(ctx, baseFreq * 1.5, 0.08, 'sine');
      }, 80);
    }
  }

  playSwap(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playTone(ctx, 300, 0.05, 'triangle');
  }

  playInvalidSwap(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playTone(ctx, 150, 0.1, 'sawtooth');
  }

  playCTA(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Ascending arpeggio
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(ctx, freq, 0.15, 'sine');
      }, i * 100);
    });
  }

  private playTone(
    ctx: AudioContext,
    frequency: number,
    duration: number,
    type: OscillatorType
  ): void {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration
      );

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch {
      // Silently fail if audio context is suspended
    }
  }
}
```

---

## Phase 6: Optimization & Deployment

### Sprite Optimization

```
Before optimization:
├── gem_red.png      32KB
├── gem_yellow.png   32KB
├── gem_green.png    32KB
├── gem_blue.png     32KB
├── gem_purple.png   32KB
├── gem_orange.png   32KB
├── hand.png         8KB
├── button.png       12KB
├── icon.png         24KB
└── Total:           236KB

After optimization:
├── atlas.png        ~150KB (packed, TinyPNG compressed)
├── atlas.json       ~2KB (frame data)
└── Total:           ~152KB (36% smaller)

Further optimization:
├── Use CSS/Canvas shapes for gems: 0KB
├── Generate hand with canvas: 0KB
├── Generate button with canvas: 0KB
└── Only need icon.png: ~15KB
    Total with procedural rendering: ~15KB
```

### Minification and Inlining

```
Build output analysis:

JavaScript (pre-minify):   ~45KB
JavaScript (minified):     ~18KB
JavaScript (gzipped):      ~6KB (but we use inline, not gzip)

Inline assets:
├── Atlas PNG base64:      ~200KB (150KB × 1.33 base64 overhead)
├── Atlas JSON:            ~2KB
├── HTML template:         ~1KB
└── CSS:                   ~0.5KB

Total index.html:          ~221.5KB

Well under 3MB limit! Room for better art.
```

### Size Check Script

```typescript
// scripts/check-size.ts
import * as fs from 'fs';

function checkSize(filePath: string, limits: Record<string, number>): void {
  const stats = fs.statSync(filePath);
  const sizeKB = stats.size / 1024;
  const sizeMB = sizeKB / 1024;

  console.log(`\nBundle: ${filePath}`);
  console.log(`Size: ${sizeKB.toFixed(1)}KB (${sizeMB.toFixed(2)}MB)\n`);

  const results: Array<{ network: string; limit: string; status: string }> = [];

  for (const [network, limitMB] of Object.entries(limits)) {
    const limitKB = limitMB * 1024;
    const status = sizeKB <= limitKB ? 'PASS' : 'FAIL';
    const icon = status === 'PASS' ? 'OK' : 'OVER';
    results.push({
      network,
      limit: `${limitMB}MB`,
      status: `${icon} (${((sizeKB / limitKB) * 100).toFixed(0)}%)`,
    });
  }

  console.table(results);
}

checkSize('dist/index.html', {
  Facebook: 5,
  Unity: 5,
  ironSource: 5,
  Google: 2.5,
  Target: 3,
});
```

---

## Complete Architecture

```
src/
├── main.ts              Entry point, creates Game instance
│                        ~30 lines
│
├── Game.ts              Main game class, owns all subsystems
│                        Game loop, fixed timestep, pause/resume
│                        ~120 lines
│
├── Grid.ts              Match-3 grid logic (pure logic)
│                        Cell types, match detection, cascade
│                        ~250 lines
│
├── Renderer.ts          Canvas2D rendering utilities
│                        Draw gems, UI, backgrounds
│                        ~150 lines
│
├── Input.ts             Touch/mouse input with swipe detection
│                        Unified pointer events
│                        ~100 lines
│
├── Tween.ts             Animation/easing system
│                        Easing functions, tween manager
│                        ~120 lines
│
├── Particles.ts         Pooled particle system
│                        Emit, update, render
│                        ~80 lines
│
├── SceneManager.ts      Scene state machine
│                        Loading, Tutorial, Game, EndCard
│                        ~400 lines (all scenes)
│
├── MraidBridge.ts       MRAID/DAPI/desktop adapter
│                        Ready, viewable, open store
│                        ~120 lines
│
├── Audio.ts             Web Audio sound synthesis
│                        Match sounds, UI feedback
│                        ~80 lines
│
├── ObjectPool.ts        Generic object pool
│                        Acquire, release, pre-allocate
│                        ~30 lines
│
└── types.ts             Shared type definitions
                         ~40 lines

Total: ~1,520 lines of TypeScript
```

### Module Dependency Graph

```
main.ts
  └── Game.ts
        ├── Grid.ts          (no dependencies)
        ├── Renderer.ts      (no dependencies)
        ├── Input.ts         (no dependencies)
        ├── Tween.ts         (no dependencies)
        ├── Particles.ts     (uses ObjectPool)
        │     └── ObjectPool.ts
        ├── Audio.ts         (no dependencies)
        ├── SceneManager.ts  (uses Grid, Tween, Particles, Audio)
        └── MraidBridge.ts   (no dependencies)

Key principle: All modules depend on Game.ts,
but don't depend on each other (low coupling).
Grid.ts is pure logic with zero rendering code.
```

---

## Size Budget

```
Component           Raw      Base64    Notes
─────────────────��───────────────────────────────
TypeScript (min)    18KB     18KB      No base64 needed
Sprite atlas        150KB    200KB     33% base64 overhead
Audio               0KB      0KB      Web Audio synthesis
HTML + CSS          2KB      2KB      Template
Atlas JSON          2KB      2KB      Frame definitions
─────────────────────────────────────────────────
TOTAL                                  ~222KB

Budget allocation for 3MB limit:
├── Code:           ~80KB   (3%)
├── Sprites:        ~400KB  (13%)    Room for much better art
├── Audio files:    ~100KB  (3%)     Optional, oscillators are free
├── Base64 overhead: ~170KB (6%)     33% of binary assets
├── UNUSED BUDGET:  ~2.25MB (75%)    Massive headroom
└── Total:          ~3MB    (100%)

For a 5MB limit (most networks):
Even more room for high-quality art, animations, video thumbnails.
```

---

## Performance Targets

```
Metric                  Target          Measurement Method
────────────────────────────────────────────────────────────
FPS (low-end)           60fps           Frame timing profiler
FPS (worst case)        45fps+          P95 frame time < 22ms
First frame             <500ms          performance.now() delta
Interactive             <1s             Time to first input
Memory (peak)           <50MB           Chrome DevTools Memory
Memory (steady)         <30MB           Heap snapshot
Draw calls/frame        <20             Canvas API calls count
GC pauses               <5ms            Performance timeline
Touch latency           <100ms          Input→visual response
Bundle size             <3MB            File size check

Target test devices:
├── Samsung Galaxy A10:  Must hit 60fps
├── iPhone SE 2020:      Must hit 60fps
├── Galaxy S21:          Must hit 60fps
└── Chrome Desktop:      Must hit 60fps (with 4x CPU throttle)
```

---

## Interview Discussion

### Q: "Walk me through how you built this playable ad."

**Strong Answer:**

"I built a Match-3 playable ad as a single-file HTML deliverable. Let me walk through my approach in six phases.

**Phase 1 - Setup:** I chose TypeScript for type safety and esbuild for bundling because it produces the smallest output and builds in under 100ms. The build pipeline compiles TypeScript, base64-encodes all assets, and inlines everything into a single HTML file. I included an MRAID bridge that detects whether we're in an MRAID environment, ironSource's DAPI, or desktop, and provides a unified API.

**Phase 2 - Core Engine:** I built a game loop with fixed timestep (1/60th second) for deterministic physics. The engine has five subsystems: input handler (unified touch/mouse with swipe detection), tween manager (for smooth animations with easing functions), particle system (pre-allocated pool of 500 particles for zero GC pressure), audio manager (Web Audio oscillator synthesis for zero-filesize sound effects), and a scene manager for game flow.

**Phase 3 - Game Logic:** The Grid class is pure logic with no rendering code. It handles match detection via horizontal and vertical scans, cascade execution (remove matched cells, apply gravity, refill from top, recheck for new matches), and special piece creation (4-match creates line clear, 5-match creates bomb). The cascade produces a list of steps that the renderer can animate independently.

**Phase 4 - Game Flow:** Four scenes: Loading (decode base64 atlas, < 500ms), Tutorial (3-second animated hand showing the first swap), Game (25-second timer with match-3 gameplay, auto-advances on 3s idle), and End Card (CTA button with pulse animation, calls mraid.open). The board is rigged so the tutorial's suggested swap triggers a satisfying cascade.

**Phase 5 - Polish:** Particle effects on matches, screen shake on combos, smooth cell movement with easeOutBack easing for the 'pop' feel. Sound effects are generated with Web Audio oscillators -- higher combos play higher-pitched chimes. All of this adds zero file size since it's procedural.

**Phase 6 - Optimization:** The final bundle is ~222KB, well under the 3MB target. I tested on a Galaxy A10 and achieved consistent 60fps. Key optimizations: pre-allocated particle pool (no GC pauses), typed arrays for particle positions, procedural rendering for gems instead of sprite images, and resolution scaling on low-end devices.

The architecture follows high cohesion / low coupling: Grid.ts knows nothing about rendering, Renderer.ts knows nothing about game logic, and the SceneManager orchestrates everything through the Game class. This makes it easy to test Grid.ts with pure unit tests and to swap out the renderer without touching game logic."

---

### Q: "What was the hardest technical challenge?"

**Strong Answer:**

"The cascade animation timing. The game logic runs the entire cascade synchronously -- it's pure computation. But the player needs to SEE each step: cells disappearing, pieces falling, new pieces appearing, then new matches triggering.

I solved this by having the cascade engine return a list of `CascadeStep` objects (remove, gravity, refill) with all the data needed for animation. Then the scene manager plays them back sequentially using the tween system. Each step gets 200-300ms of animation time.

The tricky part was that during cascade animation, the logical grid state is already final (all cascades resolved), but the visual state is playing catch-up. I had to track both the 'real' cell positions and the 'rendered' cell positions, using tweens to smoothly interpolate between them. If the player somehow triggers input during a cascade, I reject it -- the `isAnimating` flag prevents any swaps until the cascade animation completes."

---

### Q: "How would you approach A/B testing this creative?"

**Strong Answer:**

"I'd test along three axes: hook, difficulty, and CTA.

For the **hook**: variant A starts with the rigged board (guaranteed big cascade on first swap), variant B starts with a normal board. I'd measure CTR and completion rate. My hypothesis is the rigged board increases engagement but I'd validate with data.

For **difficulty**: variant A has 6 gem types (harder to match), variant B has 5 (easier). More matches = more satisfaction = potentially higher engagement. But too easy might not create the 'I need more' feeling that drives installs.

For the **CTA**: test 'Play Now' vs 'Download Free' vs 'Install' button text. Test timing -- CTA after win state vs. after timer expires vs. both. Test end card complexity -- simple text + button vs. elaborate with score summary and app screenshots.

Each test runs for 50K impressions per variant minimum, and I'd use the primary metric relevant to the test (CTR for engagement tests, IVR for CTA tests). I'd run one variable at a time, not multiple, to isolate which change drove the improvement."
