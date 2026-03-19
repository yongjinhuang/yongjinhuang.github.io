# Performance Optimization for Web Games & Playable Ads

## Table of Contents

1. [Performance Targets & Budgets](#performance-targets--budgets)
2. [Profiling Tools & Techniques](#profiling-tools--techniques)
3. [Rendering Optimization](#rendering-optimization)
4. [JavaScript Performance](#javascript-performance)
5. [Memory Management](#memory-management)
6. [Physics Optimization](#physics-optimization)
7. [Mobile-Specific Optimization](#mobile-specific-optimization)
8. [Playable Ad Specific Performance](#playable-ad-specific-performance)
9. [Interview Questions](#interview-questions)

---

## Performance Targets & Budgets

### The 60fps Mandate

For smooth gameplay, you need to hit 60 frames per second consistently. This gives you a strict **16.67ms budget per frame**.

```
1 second / 60 frames = 16.67ms per frame

Within that 16.67ms:
├── JavaScript execution:  ~6ms
├── Layout/Style:          ~2ms
├── Paint/Composite:       ~2ms
├── GPU work:              ~3ms
└── Buffer/overhead:       ~3.67ms
```

### Target Device Matrix

| Tier      | Example Device     | CPU Budget | GPU Budget | Memory |
| --------- | ------------------ | ---------- | ---------- | ------ |
| Low-end   | Samsung Galaxy A10 | 8ms JS     | 4ms GPU    | 512MB  |
| Mid-range | iPhone SE 2020     | 10ms JS    | 6ms GPU    | 1GB    |
| High-end  | iPhone 14          | 14ms JS    | 10ms GPU   | 2GB+   |

**Key principle**: Always develop and test on the lowest-tier device you plan to support. If it runs well on a Galaxy A10, it will fly on an iPhone 14.

### Frame Budget Breakdown

```typescript
interface FrameBudget {
  readonly total: number; // 16.67ms
  readonly input: number; // ~1ms
  readonly gameLogic: number; // ~3ms
  readonly physics: number; // ~2ms
  readonly rendering: number; // ~6ms
  readonly audio: number; // ~0.5ms
  readonly gc_buffer: number; // ~4.17ms (critical safety margin)
}

const BUDGET: FrameBudget = {
  total: 16.67,
  input: 1,
  gameLogic: 3,
  physics: 2,
  rendering: 6,
  audio: 0.5,
  gc_buffer: 4.17,
};
```

### When 60fps Is Not Required

Not every screen needs 60fps:

- **Menu screens**: 30fps is fine, saves battery
- **End cards**: Can drop to 24fps for simple animations
- **Loading screens**: Minimal rendering needed
- **Idle states**: Reduce to 15-30fps when nothing moves

```typescript
class AdaptiveFrameRate {
  private targetFps: number = 60;
  private readonly fpsLevels = {
    gameplay: 60,
    menu: 30,
    endCard: 24,
    idle: 15,
  } as const;

  setScene(scene: keyof typeof this.fpsLevels): void {
    this.targetFps = this.fpsLevels[scene];
  }

  getInterval(): number {
    return 1000 / this.targetFps;
  }

  shouldRender(elapsed: number): boolean {
    return elapsed >= this.getInterval();
  }
}
```

---

## Profiling Tools & Techniques

### Chrome DevTools Performance Tab

The Performance tab is your primary profiling tool.

**How to profile effectively:**

1. Open DevTools → Performance tab
2. Click the gear icon → Set CPU throttling to 4x or 6x slowdown
3. Click Record
4. Play through the problematic section for 3-5 seconds
5. Stop recording
6. Analyze the flame chart

**What to look for:**

| Issue            | Indicator                                      | Typical Cause                     |
| ---------------- | ---------------------------------------------- | --------------------------------- |
| Long frames      | Red bars above the frame timeline              | Heavy computation in single frame |
| GC pauses        | Purple blocks labeled "Minor GC" or "Major GC" | Object allocation churn           |
| Layout thrashing | Forced reflow warnings                         | Reading layout after writing DOM  |
| Long tasks       | Any task >50ms blocks the main thread          | Unoptimized game logic            |

### Performance.now() for Custom Timing

```typescript
class PerformanceTracker {
  private readonly samples: Map<string, number[]> = new Map();
  private readonly maxSamples: number = 120;

  beginMeasure(label: string): number {
    return performance.now();
  }

  endMeasure(label: string, startTime: number): number {
    const duration = performance.now() - startTime;

    if (!this.samples.has(label)) {
      this.samples.set(label, []);
    }

    const labelSamples = this.samples.get(label)!;
    labelSamples.push(duration);

    if (labelSamples.length > this.maxSamples) {
      labelSamples.shift();
    }

    return duration;
  }

  getStats(label: string): {
    avg: number;
    min: number;
    max: number;
    p95: number;
  } | null {
    const labelSamples = this.samples.get(label);
    if (!labelSamples || labelSamples.length === 0) return null;

    const sorted = [...labelSamples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  }

  report(): void {
    for (const [label] of this.samples) {
      const stats = this.getStats(label);
      if (stats) {
        console.table({
          [label]: {
            avg: `${stats.avg.toFixed(2)}ms`,
            min: `${stats.min.toFixed(2)}ms`,
            max: `${stats.max.toFixed(2)}ms`,
            p95: `${stats.p95.toFixed(2)}ms`,
          },
        });
      }
    }
  }
}

// Usage in game loop
const tracker = new PerformanceTracker();

function gameLoop(): void {
  const physicsStart = tracker.beginMeasure('physics');
  updatePhysics();
  tracker.endMeasure('physics', physicsStart);

  const renderStart = tracker.beginMeasure('render');
  render();
  tracker.endMeasure('render', renderStart);
}
```

### Stats.js for Real-Time FPS Monitoring

```typescript
// Lightweight custom stats display for playable ads
// (Stats.js adds file size, so roll your own in production)

class FPSCounter {
  private frames: number = 0;
  private lastTime: number = 0;
  private currentFps: number = 60;

  update(timestamp: number): number {
    this.frames++;

    if (timestamp - this.lastTime >= 1000) {
      this.currentFps = this.frames;
      this.frames = 0;
      this.lastTime = timestamp;
    }

    return this.currentFps;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const fps = this.currentFps;
    const color = fps >= 55 ? '#0f0' : fps >= 30 ? '#ff0' : '#f00';

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, 80, 30);
    ctx.fillStyle = color;
    ctx.font = '16px monospace';
    ctx.fillText(`FPS: ${fps}`, 5, 22);
    ctx.restore();
  }
}
```

### Spector.js for WebGL Profiling

Spector.js captures WebGL frames and shows every draw call, state change, and texture binding.

**What Spector.js reveals:**

- Number of draw calls per frame
- Texture switches (expensive on mobile)
- Shader program changes
- Unnecessary state changes
- Overdraw visualization

```typescript
// Enable Spector.js capture in development
function initSpector(): void {
  if (process.env.NODE_ENV !== 'production') {
    const script = document.createElement('script');
    script.src = 'https://spectorcdn.babylonjs.com/spector.bundle.js';
    script.onload = () => {
      const spector = new (window as any).SPECTOR.Spector();
      spector.displayUI();
    };
    document.head.appendChild(script);
  }
}
```

### Custom Performance Dashboard

```typescript
interface FrameMetrics {
  readonly timestamp: number;
  readonly totalMs: number;
  readonly updateMs: number;
  readonly renderMs: number;
  readonly drawCalls: number;
  readonly objectCount: number;
  readonly memoryMB: number;
}

class PerformanceDashboard {
  private readonly history: FrameMetrics[] = [];
  private readonly maxHistory: number = 300; // 5 seconds at 60fps
  private drawCallCount: number = 0;

  recordFrame(metrics: FrameMetrics): void {
    const updatedHistory = [
      ...(this.history.length >= this.maxHistory
        ? this.history.slice(1)
        : this.history),
      metrics,
    ];
    // Clear and push to avoid creating new array each frame in production
    this.history.length = 0;
    this.history.push(...updatedHistory);
  }

  getAverageFps(): number {
    if (this.history.length < 2) return 60;

    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const elapsed = last.timestamp - first.timestamp;

    return elapsed > 0 ? (this.history.length / elapsed) * 1000 : 60;
  }

  getBottleneck(): string {
    if (this.history.length === 0) return 'unknown';

    const recent = this.history.slice(-60);
    const avgUpdate =
      recent.reduce((sum, m) => sum + m.updateMs, 0) / recent.length;
    const avgRender =
      recent.reduce((sum, m) => sum + m.renderMs, 0) / recent.length;

    if (avgUpdate > 8) return 'CPU (game logic)';
    if (avgRender > 8) return 'GPU (rendering)';
    return 'OK';
  }

  getMemoryTrend(): 'stable' | 'growing' | 'shrinking' {
    if (this.history.length < 60) return 'stable';

    const first30 = this.history.slice(0, 30);
    const last30 = this.history.slice(-30);

    const avgFirst =
      first30.reduce((sum, m) => sum + m.memoryMB, 0) / first30.length;
    const avgLast =
      last30.reduce((sum, m) => sum + m.memoryMB, 0) / last30.length;

    const delta = avgLast - avgFirst;

    if (delta > 5) return 'growing'; // possible leak
    if (delta < -5) return 'shrinking';
    return 'stable';
  }
}
```

---

## Rendering Optimization

### Draw Call Batching

Every draw call has overhead from CPU-GPU communication. On mobile, keep draw calls under 50 per frame, ideally under 20.

```typescript
// BAD: One draw call per sprite
function renderBad(
  ctx: CanvasRenderingContext2D,
  sprites: readonly Sprite[]
): void {
  for (const sprite of sprites) {
    ctx.save();
    ctx.translate(sprite.x, sprite.y);
    ctx.rotate(sprite.rotation);
    ctx.drawImage(sprite.image, 0, 0); // Each is a separate draw call
    ctx.restore();
  }
}

// GOOD: Batch by texture, minimize state changes
function renderBatched(
  ctx: CanvasRenderingContext2D,
  sprites: readonly Sprite[],
  atlas: HTMLImageElement
): void {
  ctx.save();
  // Single texture, multiple drawImage calls from same source
  for (const sprite of sprites) {
    ctx.drawImage(
      atlas,
      sprite.srcX,
      sprite.srcY,
      sprite.srcW,
      sprite.srcH,
      sprite.x,
      sprite.y,
      sprite.w,
      sprite.h
    );
  }
  ctx.restore();
}
```

### Sprite Batching with WebGL

```typescript
interface SpriteBatchVertex {
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly v: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

class SpriteBatch {
  private readonly maxSprites: number;
  private readonly vertexData: Float32Array;
  private readonly indexData: Uint16Array;
  private spriteCount: number = 0;
  private readonly gl: WebGLRenderingContext;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private currentTexture: WebGLTexture | null = null;

  // 8 floats per vertex (x, y, u, v, r, g, b, a)
  // 4 vertices per sprite
  // 6 indices per sprite (2 triangles)
  private static readonly FLOATS_PER_VERTEX = 8;
  private static readonly VERTICES_PER_SPRITE = 4;
  private static readonly INDICES_PER_SPRITE = 6;

  constructor(gl: WebGLRenderingContext, maxSprites: number = 1000) {
    this.gl = gl;
    this.maxSprites = maxSprites;

    const vertexCount = maxSprites * SpriteBatch.VERTICES_PER_SPRITE;
    const indexCount = maxSprites * SpriteBatch.INDICES_PER_SPRITE;

    this.vertexData = new Float32Array(
      vertexCount * SpriteBatch.FLOATS_PER_VERTEX
    );
    this.indexData = new Uint16Array(indexCount);

    // Pre-fill index buffer (never changes)
    for (let i = 0; i < maxSprites; i++) {
      const vertexOffset = i * 4;
      const indexOffset = i * 6;
      this.indexData[indexOffset + 0] = vertexOffset + 0;
      this.indexData[indexOffset + 1] = vertexOffset + 1;
      this.indexData[indexOffset + 2] = vertexOffset + 2;
      this.indexData[indexOffset + 3] = vertexOffset + 2;
      this.indexData[indexOffset + 4] = vertexOffset + 3;
      this.indexData[indexOffset + 5] = vertexOffset + 0;
    }

    this.vertexBuffer = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData, gl.STATIC_DRAW);
  }

  begin(): void {
    this.spriteCount = 0;
    this.currentTexture = null;
  }

  draw(
    texture: WebGLTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number
  ): void {
    // Flush if texture changes or batch is full
    if (this.currentTexture !== null && this.currentTexture !== texture) {
      this.flush();
    }
    if (this.spriteCount >= this.maxSprites) {
      this.flush();
    }

    this.currentTexture = texture;

    const offset =
      this.spriteCount *
      SpriteBatch.VERTICES_PER_SPRITE *
      SpriteBatch.FLOATS_PER_VERTEX;

    // Top-left
    this.vertexData[offset + 0] = x;
    this.vertexData[offset + 1] = y;
    this.vertexData[offset + 2] = u0;
    this.vertexData[offset + 3] = v0;
    this.vertexData[offset + 4] = 1;
    this.vertexData[offset + 5] = 1;
    this.vertexData[offset + 6] = 1;
    this.vertexData[offset + 7] = 1;

    // Top-right
    this.vertexData[offset + 8] = x + w;
    this.vertexData[offset + 9] = y;
    this.vertexData[offset + 10] = u1;
    this.vertexData[offset + 11] = v0;
    this.vertexData[offset + 12] = 1;
    this.vertexData[offset + 13] = 1;
    this.vertexData[offset + 14] = 1;
    this.vertexData[offset + 15] = 1;

    // Bottom-right
    this.vertexData[offset + 16] = x + w;
    this.vertexData[offset + 17] = y + h;
    this.vertexData[offset + 18] = u1;
    this.vertexData[offset + 19] = v1;
    this.vertexData[offset + 20] = 1;
    this.vertexData[offset + 21] = 1;
    this.vertexData[offset + 22] = 1;
    this.vertexData[offset + 23] = 1;

    // Bottom-left
    this.vertexData[offset + 24] = x;
    this.vertexData[offset + 25] = y + h;
    this.vertexData[offset + 26] = u0;
    this.vertexData[offset + 27] = v1;
    this.vertexData[offset + 28] = 1;
    this.vertexData[offset + 29] = 1;
    this.vertexData[offset + 30] = 1;
    this.vertexData[offset + 31] = 1;

    this.spriteCount++;
  }

  flush(): void {
    if (this.spriteCount === 0) return;

    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(
      gl.TRIANGLES,
      this.spriteCount * SpriteBatch.INDICES_PER_SPRITE,
      gl.UNSIGNED_SHORT,
      0
    );

    this.spriteCount = 0;
  }

  end(): void {
    this.flush();
  }
}
```

### Texture Atlas

A texture atlas packs multiple sprites into a single image, dramatically reducing draw calls and texture switches.

```typescript
interface AtlasFrame {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotated: boolean;
}

interface AtlasData {
  readonly frames: readonly AtlasFrame[];
  readonly width: number;
  readonly height: number;
}

class TextureAtlas {
  private readonly frames: Map<string, AtlasFrame>;
  private readonly image: HTMLImageElement;
  private readonly invWidth: number;
  private readonly invHeight: number;

  constructor(image: HTMLImageElement, data: AtlasData) {
    this.image = image;
    this.invWidth = 1 / data.width;
    this.invHeight = 1 / data.height;

    this.frames = new Map();
    for (const frame of data.frames) {
      this.frames.set(frame.name, frame);
    }
  }

  getFrame(name: string): AtlasFrame | undefined {
    return this.frames.get(name);
  }

  getUVs(name: string): {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
  } | null {
    const frame = this.frames.get(name);
    if (!frame) return null;

    return {
      u0: frame.x * this.invWidth,
      v0: frame.y * this.invHeight,
      u1: (frame.x + frame.width) * this.invWidth,
      v1: (frame.y + frame.height) * this.invHeight,
    };
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    w?: number,
    h?: number
  ): void {
    const frame = this.frames.get(name);
    if (!frame) return;

    ctx.drawImage(
      this.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      x,
      y,
      w ?? frame.width,
      h ?? frame.height
    );
  }
}
```

### Off-Screen Canvas for Static Content

```typescript
class CachedBackground {
  private readonly offscreen: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private isDirty: boolean = true;

  constructor(
    private readonly width: number,
    private readonly height: number
  ) {
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = width;
    this.offscreen.height = height;
    this.offCtx = this.offscreen.getContext('2d')!;
  }

  invalidate(): void {
    this.isDirty = true;
  }

  private renderBackground(): void {
    const ctx = this.offCtx;
    // Expensive rendering done once
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw complex static elements
    for (let i = 0; i < 100; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * this.width,
        Math.random() * this.height,
        Math.random() * 3,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5})`;
      ctx.fill();
    }

    this.isDirty = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.isDirty) {
      this.renderBackground();
    }
    // Single drawImage call for entire background
    ctx.drawImage(this.offscreen, 0, 0);
  }
}
```

### Resolution Scaling

Rendering at lower resolution and upscaling is one of the most impactful optimizations for mobile.

```typescript
class ResolutionScaler {
  private readonly canvas: HTMLCanvasElement;
  private scale: number = 1;
  private readonly minScale: number = 0.5;
  private readonly targetFps: number = 55;
  private readonly fpsHistory: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  adaptResolution(currentFps: number): number {
    this.fpsHistory.push(currentFps);
    if (this.fpsHistory.length > 60) {
      this.fpsHistory.shift();
    }

    if (this.fpsHistory.length < 30) return this.scale;

    const avgFps =
      this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

    if (avgFps < this.targetFps && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale - 0.05);
      this.applyScale();
    } else if (avgFps > 58 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.02);
      this.applyScale();
    }

    return this.scale;
  }

  private applyScale(): void {
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;

    this.canvas.width = Math.floor(displayWidth * this.scale);
    this.canvas.height = Math.floor(displayHeight * this.scale);
  }

  getScale(): number {
    return this.scale;
  }
}
```

### Dirty Rectangles

Only redraw parts of the screen that changed.

```typescript
interface DirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

class DirtyRectManager {
  private dirtyRects: DirtyRect[] = [];
  private fullRedraw: boolean = true;

  markDirty(rect: DirtyRect): void {
    this.dirtyRects.push(rect);
  }

  markFullRedraw(): void {
    this.fullRedraw = true;
  }

  getDirtyRegion(): DirtyRect | null {
    if (this.fullRedraw) return null; // null means redraw everything

    if (this.dirtyRects.length === 0)
      return { x: 0, y: 0, width: 0, height: 0 };

    // Compute bounding box of all dirty rects
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const rect of this.dirtyRects) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  clear(): void {
    this.dirtyRects = [];
    this.fullRedraw = false;
  }

  render(
    ctx: CanvasRenderingContext2D,
    renderFn: (ctx: CanvasRenderingContext2D) => void
  ): void {
    const dirty = this.getDirtyRegion();

    if (dirty !== null && dirty.width === 0 && dirty.height === 0) {
      return; // Nothing to redraw
    }

    ctx.save();

    if (dirty !== null) {
      // Clip to dirty region
      ctx.beginPath();
      ctx.rect(dirty.x, dirty.y, dirty.width, dirty.height);
      ctx.clip();

      // Clear only dirty region
      ctx.clearRect(dirty.x, dirty.y, dirty.width, dirty.height);
    } else {
      // Full redraw
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    renderFn(ctx);
    ctx.restore();

    this.clear();
  }
}
```

### Frustum/Viewport Culling

Don't draw what's not visible.

```typescript
interface AABB {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Camera {
  readonly x: number;
  readonly y: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
}

function isVisible(entity: AABB, camera: Camera): boolean {
  return (
    entity.x + entity.width > camera.x &&
    entity.x < camera.x + camera.viewWidth &&
    entity.y + entity.height > camera.y &&
    entity.y < camera.y + camera.viewHeight
  );
}

function cullAndRender(
  entities: readonly AABB[],
  camera: Camera,
  ctx: CanvasRenderingContext2D
): number {
  let rendered = 0;

  for (const entity of entities) {
    if (isVisible(entity, camera)) {
      renderEntity(ctx, entity);
      rendered++;
    }
  }

  return rendered;
}

function renderEntity(ctx: CanvasRenderingContext2D, entity: AABB): void {
  ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
}
```

---

## JavaScript Performance

### Avoiding GC Pauses with Object Pooling

Garbage collection pauses are the #1 enemy of smooth frame rates. Every `new` creates an object that GC must eventually collect.

```typescript
class ObjectPool<T> {
  private readonly pool: T[] = [];
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private activeCount: number = 0;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;

    // Pre-allocate
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    this.activeCount++;

    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    return this.factory();
  }

  release(obj: T): void {
    this.activeCount--;
    this.reset(obj);
    this.pool.push(obj);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getPoolSize(): number {
    return this.pool.length;
  }
}

// Example: Particle pool
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

const particlePool = new ObjectPool<Particle>(
  () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    size: 0,
    color: '#fff',
    active: false,
  }),
  (p) => {
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.maxLife = 0;
    p.size = 0;
    p.active = false;
  },
  200
);
```

### Typed Arrays for Numeric Data

Typed arrays are faster than regular arrays for numeric operations and produce no GC pressure.

```typescript
// BAD: Regular array of objects
interface BadParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
const badParticles: BadParticle[] = []; // GC pressure!

// GOOD: Struct of Arrays with typed arrays
class ParticleSystem {
  private readonly maxParticles: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private count: number = 0;

  constructor(maxParticles: number) {
    this.maxParticles = maxParticles;
    this.x = new Float32Array(maxParticles);
    this.y = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.life = new Float32Array(maxParticles);
  }

  emit(x: number, y: number, vx: number, vy: number, life: number): void {
    if (this.count >= this.maxParticles) return;

    const i = this.count;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.count++;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;

      if (this.life[i] <= 0) {
        // Swap with last active particle (no splice!)
        this.count--;
        this.x[i] = this.x[this.count];
        this.y[i] = this.y[this.count];
        this.vx[i] = this.vx[this.count];
        this.vy[i] = this.vy[this.count];
        this.life[i] = this.life[this.count];
        continue;
      }

      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#ffcc00';
    for (let i = 0; i < this.count; i++) {
      const alpha = this.life[i] / 2; // Fade out
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillRect(this.x[i] - 2, this.y[i] - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}
```

### V8 Hidden Classes and Monomorphism

V8 creates "hidden classes" to optimize property access. Changing object shapes kills this optimization.

```typescript
// BAD: Different object shapes
function createEntityBad(type: string): Record<string, unknown> {
  const entity: Record<string, unknown> = { x: 0, y: 0 };

  if (type === 'enemy') {
    entity.health = 100; // different shape!
  }
  if (type === 'collectible') {
    entity.value = 10; // different shape!
  }

  return entity;
}

// GOOD: Consistent object shapes
interface Entity {
  readonly type: string;
  x: number;
  y: number;
  health: number;
  value: number;
  active: boolean;
}

function createEntity(type: string): Entity {
  return {
    type,
    x: 0,
    y: 0,
    health: type === 'enemy' ? 100 : 0,
    value: type === 'collectible' ? 10 : 0,
    active: true,
  };
}
```

### Avoid the `delete` Operator

```typescript
// BAD: delete changes the hidden class, deoptimizes
function removePropertyBad(obj: Record<string, unknown>, key: string): void {
  delete obj[key]; // Triggers hidden class transition, megamorphic IC
}

// GOOD: Set to undefined or null
function removePropertyGood(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  return {
    ...obj,
    [key]: undefined,
  };
}

// BEST: Use a Map for dynamic keys
class DynamicProperties {
  private readonly properties = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.properties.set(key, value);
  }

  get(key: string): unknown {
    return this.properties.get(key);
  }

  remove(key: string): boolean {
    return this.properties.delete(key);
  }
}
```

### Hot Loop Optimization

```typescript
// BAD: Slow hot loop patterns
function updateEntitiesBad(entities: Entity[]): void {
  entities
    .filter((e) => e.active) // Creates new array
    .forEach((e) => {
      // Callback overhead
      e.x += Math.cos(e.health) * 2; // Math.cos is expensive
    });
}

// GOOD: Fast hot loop
function updateEntitiesGood(
  entities: readonly Entity[],
  cosLookup: Float32Array
): void {
  const len = entities.length; // Cache length

  for (let i = 0; i < len; i++) {
    const entity = entities[i];
    if (!entity.active) continue;

    // Use pre-computed lookup table for trig
    const angle = entity.health & 0xff; // Clamp to table size
    entity.x += cosLookup[angle] * 2;
  }
}

// Pre-compute trigonometry lookup tables
function createCosLookup(size: number = 256): Float32Array {
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    table[i] = Math.cos((i / size) * Math.PI * 2);
  }
  return table;
}
```

---

## Memory Management

### Memory Leak Prevention

```typescript
class MemoryLeakPreventer {
  private readonly disposables: Array<() => void> = [];

  // Track event listeners for cleanup
  addEventListener(
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(event, handler, options);
    this.disposables.push(() => target.removeEventListener(event, handler));
  }

  // Track timers
  setInterval(callback: () => void, ms: number): number {
    const id = window.setInterval(callback, ms);
    this.disposables.push(() => window.clearInterval(id));
    return id;
  }

  setTimeout(callback: () => void, ms: number): number {
    const id = window.setTimeout(callback, ms);
    this.disposables.push(() => window.clearTimeout(id));
    return id;
  }

  // Track animation frames
  requestAnimationFrame(callback: FrameRequestCallback): number {
    const id = window.requestAnimationFrame(callback);
    this.disposables.push(() => window.cancelAnimationFrame(id));
    return id;
  }

  // Dispose everything
  dispose(): void {
    for (const cleanup of this.disposables) {
      try {
        cleanup();
      } catch {
        // Silently handle cleanup errors
      }
    }
    this.disposables.length = 0;
  }
}
```

### Texture Memory Budgets

```
Mobile texture memory guidelines:
├── Low-end Android:   ~50MB VRAM
├── Mid-range:         ~100MB VRAM
├── High-end:          ~200MB+ VRAM
└── Playable ads:      ~20MB (target, since shared with host app)

Texture sizes:
├── 256x256 RGBA:   256KB
├── 512x512 RGBA:   1MB
├── 1024x1024 RGBA: 4MB
├── 2048x2048 RGBA: 16MB
└── 4096x4096 RGBA: 64MB (AVOID on mobile!)
```

```typescript
class TextureMemoryTracker {
  private totalBytes: number = 0;
  private readonly textures = new Map<string, number>();
  private readonly budgetBytes: number;

  constructor(budgetMB: number = 20) {
    this.budgetBytes = budgetMB * 1024 * 1024;
  }

  register(
    name: string,
    width: number,
    height: number,
    bpp: number = 4
  ): boolean {
    const bytes = width * height * bpp;

    if (this.totalBytes + bytes > this.budgetBytes) {
      console.warn(
        `Texture "${name}" (${(bytes / 1024 / 1024).toFixed(2)}MB) ` +
          `would exceed budget. Current: ${(this.totalBytes / 1024 / 1024).toFixed(2)}MB / ` +
          `${(this.budgetBytes / 1024 / 1024).toFixed(2)}MB`
      );
      return false;
    }

    this.textures.set(name, bytes);
    this.totalBytes += bytes;
    return true;
  }

  unregister(name: string): void {
    const bytes = this.textures.get(name);
    if (bytes !== undefined) {
      this.totalBytes -= bytes;
      this.textures.delete(name);
    }
  }

  getUsage(): { usedMB: number; budgetMB: number; percentage: number } {
    return {
      usedMB: this.totalBytes / 1024 / 1024,
      budgetMB: this.budgetBytes / 1024 / 1024,
      percentage: (this.totalBytes / this.budgetBytes) * 100,
    };
  }
}
```

### ArrayBuffer Reuse

```typescript
class BufferPool {
  private readonly pools = new Map<number, ArrayBuffer[]>();

  acquire(size: number): ArrayBuffer {
    // Round up to nearest power of 2 for better reuse
    const bucket = this.nextPowerOf2(size);
    const pool = this.pools.get(bucket);

    if (pool && pool.length > 0) {
      return pool.pop()!;
    }

    return new ArrayBuffer(bucket);
  }

  release(buffer: ArrayBuffer): void {
    const bucket = buffer.byteLength;

    if (!this.pools.has(bucket)) {
      this.pools.set(bucket, []);
    }

    const pool = this.pools.get(bucket)!;
    if (pool.length < 10) {
      // Cap pool size
      pool.push(buffer);
    }
  }

  private nextPowerOf2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }
}
```

### Heap Snapshot Analysis

**How to take and analyze heap snapshots:**

1. Chrome DevTools → Memory tab
2. Select "Heap snapshot"
3. Click "Take snapshot"
4. Play your game for 30 seconds
5. Take another snapshot
6. Compare snapshots using "Comparison" view

**What to look for:**

| Red Flag                   | Meaning                         |
| -------------------------- | ------------------------------- |
| Growing # of arrays        | Allocating arrays each frame    |
| Growing # of objects       | Not reusing objects             |
| Detached DOM trees         | Elements removed but referenced |
| Growing closure count      | Event handlers accumulating     |
| Large retained size growth | Memory leak confirmed           |

```typescript
// Memory diagnostic utility (development only)
class MemoryDiagnostics {
  private snapshots: Array<{ timestamp: number; usedJSHeapSize: number }> = [];

  sample(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.snapshots.push({
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
      });

      // Keep last 60 samples
      if (this.snapshots.length > 60) {
        this.snapshots = this.snapshots.slice(-60);
      }
    }
  }

  getGrowthRate(): number {
    if (this.snapshots.length < 2) return 0;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const elapsedSeconds = (last.timestamp - first.timestamp) / 1000;

    if (elapsedSeconds === 0) return 0;

    const bytesGrown = last.usedJSHeapSize - first.usedJSHeapSize;
    return bytesGrown / elapsedSeconds; // bytes per second
  }

  hasLeak(): boolean {
    const growthRate = this.getGrowthRate();
    // More than 100KB/s growth suggests a leak
    return growthRate > 100 * 1024;
  }
}
```

---

## Physics Optimization

### Broad Phase: Spatial Grid

```typescript
class SpatialGrid<T extends AABB> {
  private readonly cells = new Map<number, T[]>();
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly width: number;

  constructor(worldWidth: number, worldHeight: number, cellSize: number) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.width = Math.ceil(worldWidth / cellSize);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(entity: T): void {
    const startX = Math.floor(entity.x * this.invCellSize);
    const startY = Math.floor(entity.y * this.invCellSize);
    const endX = Math.floor((entity.x + entity.width) * this.invCellSize);
    const endY = Math.floor((entity.y + entity.height) * this.invCellSize);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const key = y * this.width + x;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(entity);
      }
    }
  }

  query(region: AABB): T[] {
    const results = new Set<T>();

    const startX = Math.floor(region.x * this.invCellSize);
    const startY = Math.floor(region.y * this.invCellSize);
    const endX = Math.floor((region.x + region.width) * this.invCellSize);
    const endY = Math.floor((region.y + region.height) * this.invCellSize);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const key = y * this.width + x;
        const cell = this.cells.get(key);
        if (cell) {
          for (const entity of cell) {
            results.add(entity);
          }
        }
      }
    }

    return Array.from(results);
  }

  getPotentialCollisions(): Array<[T, T]> {
    const pairs: Array<[T, T]> = [];
    const checked = new Set<string>();

    for (const [, cell] of this.cells) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i];
          const b = cell[j];
          // Use object references to create unique pair key
          const key = `${(a as any).id}-${(b as any).id}`;
          if (!checked.has(key)) {
            checked.add(key);
            pairs.push([a, b]);
          }
        }
      }
    }

    return pairs;
  }
}
```

### Broad Phase: Quadtree

```typescript
class QuadTree<T extends AABB> {
  private readonly objects: T[] = [];
  private readonly children: Array<QuadTree<T> | null> = [
    null,
    null,
    null,
    null,
  ];
  private readonly maxObjects: number = 10;
  private readonly maxLevels: number = 5;
  private readonly level: number;
  private readonly bounds: AABB;

  constructor(bounds: AABB, level: number = 0) {
    this.bounds = bounds;
    this.level = level;
  }

  clear(): void {
    this.objects.length = 0;
    for (let i = 0; i < 4; i++) {
      if (this.children[i] !== null) {
        this.children[i]!.clear();
        this.children[i] = null;
      }
    }
  }

  private split(): void {
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;
    const nextLevel = this.level + 1;

    this.children[0] = new QuadTree(
      { x: x + halfW, y, width: halfW, height: halfH },
      nextLevel
    );
    this.children[1] = new QuadTree(
      { x, y, width: halfW, height: halfH },
      nextLevel
    );
    this.children[2] = new QuadTree(
      { x, y: y + halfH, width: halfW, height: halfH },
      nextLevel
    );
    this.children[3] = new QuadTree(
      { x: x + halfW, y: y + halfH, width: halfW, height: halfH },
      nextLevel
    );
  }

  private getIndex(rect: AABB): number {
    const midX = this.bounds.x + this.bounds.width / 2;
    const midY = this.bounds.y + this.bounds.height / 2;

    const fitsTop = rect.y + rect.height < midY;
    const fitsBottom = rect.y > midY;
    const fitsLeft = rect.x + rect.width < midX;
    const fitsRight = rect.x > midX;

    if (fitsTop) {
      if (fitsRight) return 0;
      if (fitsLeft) return 1;
    } else if (fitsBottom) {
      if (fitsLeft) return 2;
      if (fitsRight) return 3;
    }

    return -1; // Doesn't fit cleanly in any quadrant
  }

  insert(entity: T): void {
    if (this.children[0] !== null) {
      const index = this.getIndex(entity);
      if (index !== -1) {
        this.children[index]!.insert(entity);
        return;
      }
    }

    this.objects.push(entity);

    if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
      if (this.children[0] === null) {
        this.split();
      }

      let i = 0;
      while (i < this.objects.length) {
        const index = this.getIndex(this.objects[i]);
        if (index !== -1) {
          const obj = this.objects.splice(i, 1)[0];
          this.children[index]!.insert(obj);
        } else {
          i++;
        }
      }
    }
  }

  retrieve(rect: AABB): T[] {
    const results: T[] = [];

    const index = this.getIndex(rect);
    if (index !== -1 && this.children[0] !== null) {
      results.push(...this.children[index]!.retrieve(rect));
    } else if (this.children[0] !== null) {
      for (const child of this.children) {
        if (child !== null) {
          results.push(...child.retrieve(rect));
        }
      }
    }

    results.push(...this.objects);
    return results;
  }
}
```

### Collision Layers

```typescript
const CollisionLayer = {
  NONE: 0b00000000,
  PLAYER: 0b00000001,
  ENEMY: 0b00000010,
  PLAYER_BULLET: 0b00000100,
  ENEMY_BULLET: 0b00001000,
  WALL: 0b00010000,
  COLLECTIBLE: 0b00100000,
  TRIGGER: 0b01000000,
} as const;

// Define what collides with what using bitmasks
const CollisionMatrix: Record<number, number> = {
  [CollisionLayer.PLAYER]:
    CollisionLayer.ENEMY |
    CollisionLayer.ENEMY_BULLET |
    CollisionLayer.WALL |
    CollisionLayer.COLLECTIBLE |
    CollisionLayer.TRIGGER,
  [CollisionLayer.ENEMY]:
    CollisionLayer.PLAYER | CollisionLayer.PLAYER_BULLET | CollisionLayer.WALL,
  [CollisionLayer.PLAYER_BULLET]: CollisionLayer.ENEMY | CollisionLayer.WALL,
  [CollisionLayer.ENEMY_BULLET]: CollisionLayer.PLAYER | CollisionLayer.WALL,
  [CollisionLayer.COLLECTIBLE]: CollisionLayer.PLAYER,
};

function shouldCollide(layerA: number, layerB: number): boolean {
  const maskA = CollisionMatrix[layerA];
  if (maskA === undefined) return false;
  return (maskA & layerB) !== 0;
}

// Usage: skip 90% of collision checks
function checkCollisions(entities: readonly Entity[]): void {
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];

      // Early out based on collision layers
      if (!shouldCollide((a as any).layer, (b as any).layer)) continue;

      // Only do expensive AABB check if layers match
      if (aabbOverlap(a, b)) {
        handleCollision(a, b);
      }
    }
  }
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function handleCollision(a: AABB, b: AABB): void {
  // Handle collision response
}
```

### Sleeping Bodies

```typescript
interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sleeping: boolean;
  sleepTimer: number;
}

const SLEEP_VELOCITY_THRESHOLD = 0.01;
const SLEEP_TIME_THRESHOLD = 1.0; // seconds

function updateSleepState(body: PhysicsBody, dt: number): void {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);

  if (speed < SLEEP_VELOCITY_THRESHOLD) {
    body.sleepTimer += dt;
    if (body.sleepTimer >= SLEEP_TIME_THRESHOLD) {
      body.sleeping = true;
      body.vx = 0;
      body.vy = 0;
    }
  } else {
    body.sleepTimer = 0;
    body.sleeping = false;
  }
}

function wakeBody(body: PhysicsBody): void {
  body.sleeping = false;
  body.sleepTimer = 0;
}

function updatePhysics(bodies: PhysicsBody[], dt: number): void {
  for (const body of bodies) {
    if (body.sleeping) continue; // Skip sleeping bodies entirely

    body.x += body.vx * dt;
    body.y += body.vy * dt;

    updateSleepState(body, dt);
  }
}
```

### Simplified Collision Shapes

```typescript
// Use circles instead of polygons when possible
function circleOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const distSq = dx * dx + dy * dy; // Avoid sqrt!
  const radiiSum = ar + br;
  return distSq < radiiSum * radiiSum;
}

// For complex shapes, use a simpler bounding shape first
function narrowPhaseCheck(a: ComplexShape, b: ComplexShape): boolean {
  // 1. Circle broad phase (cheapest)
  if (
    !circleOverlap(
      a.centerX,
      a.centerY,
      a.boundingRadius,
      b.centerX,
      b.centerY,
      b.boundingRadius
    )
  ) {
    return false;
  }

  // 2. AABB middle phase
  if (!aabbOverlap(a.bounds, b.bounds)) {
    return false;
  }

  // 3. Precise polygon check (expensive, rarely reached)
  return polygonOverlap(a.vertices, b.vertices);
}

interface ComplexShape {
  centerX: number;
  centerY: number;
  boundingRadius: number;
  bounds: AABB;
  vertices: Array<{ x: number; y: number }>;
}

function polygonOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>
): boolean {
  // SAT (Separating Axis Theorem) implementation
  // ... (expensive, should rarely be called)
  return true;
}
```

---

## Mobile-Specific Optimization

### Passive Touch Listeners

```typescript
// BAD: Blocks scrolling, causes jank
canvas.addEventListener('touchstart', handleTouch);
// Chrome will warn: "Added non-passive event listener"

// GOOD: Passive for scroll, non-passive only when you need preventDefault
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

function handleTouchStart(e: TouchEvent): void {
  e.preventDefault(); // Prevent scroll/zoom in game area
  const touch = e.touches[0];
  handleInput(touch.clientX, touch.clientY);
}

function handleTouchMove(e: TouchEvent): void {
  e.preventDefault();
  const touch = e.touches[0];
  handleDrag(touch.clientX, touch.clientY);
}

function handleTouchEnd(_e: TouchEvent): void {
  handleRelease();
}

function handleInput(x: number, y: number): void {
  // Process input
}

function handleDrag(x: number, y: number): void {
  // Process drag
}

function handleRelease(): void {
  // Process release
}
```

### Battery-Aware Performance

```typescript
class BatteryAwareGameLoop {
  private lowPowerMode: boolean = false;
  private rafId: number = 0;

  async init(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();

        this.updatePowerMode(battery);

        battery.addEventListener('levelchange', () => {
          this.updatePowerMode(battery);
        });
        battery.addEventListener('chargingchange', () => {
          this.updatePowerMode(battery);
        });
      } catch {
        // Battery API not available
      }
    }
  }

  private updatePowerMode(battery: any): void {
    // Enter low power mode below 20% and not charging
    this.lowPowerMode = battery.level < 0.2 && !battery.charging;
  }

  getTargetFps(): number {
    if (this.lowPowerMode) return 30;
    return 60;
  }

  getParticleMultiplier(): number {
    if (this.lowPowerMode) return 0.3;
    return 1;
  }

  shouldShowEffects(): boolean {
    return !this.lowPowerMode;
  }
}
```

### Thermal Throttling Detection

```typescript
class ThermalThrottleDetector {
  private readonly fpsHistory: number[] = [];
  private isThrottled: boolean = false;
  private readonly sampleSize = 120;

  sample(fps: number): void {
    this.fpsHistory.push(fps);

    if (this.fpsHistory.length > this.sampleSize) {
      this.fpsHistory.shift();
    }

    if (this.fpsHistory.length >= this.sampleSize) {
      this.detectThrottling();
    }
  }

  private detectThrottling(): void {
    const firstHalf = this.fpsHistory.slice(0, this.sampleSize / 2);
    const secondHalf = this.fpsHistory.slice(this.sampleSize / 2);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    // If FPS dropped by more than 20% in the second half,
    // the device is likely thermally throttling
    this.isThrottled = avgSecond < avgFirst * 0.8;
  }

  getIsThrottled(): boolean {
    return this.isThrottled;
  }

  getRecommendedActions(): string[] {
    if (!this.isThrottled) return [];

    return [
      'Reduce particle count',
      'Lower resolution scale',
      'Disable post-processing',
      'Reduce draw distance',
      'Lower target FPS to 30',
    ];
  }
}
```

### WebView Performance Considerations

```typescript
// WebView-specific optimizations (playable ads run in WebViews)

class WebViewOptimizer {
  static apply(canvas: HTMLCanvasElement): void {
    // 1. Disable long-press context menu
    canvas.style.webkitTouchCallout = 'none';
    canvas.style.userSelect = 'none';
    (canvas.style as any).webkitUserSelect = 'none';

    // 2. Disable text selection
    document.body.style.userSelect = 'none';

    // 3. Prevent elastic scrolling on iOS
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // 4. Force hardware acceleration
    canvas.style.transform = 'translateZ(0)';
    (canvas.style as any).webkitTransform = 'translateZ(0)';

    // 5. Prevent double-tap zoom
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content =
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.head.appendChild(meta);
  }

  static detectWebView(): boolean {
    const ua = navigator.userAgent;
    // Common WebView indicators
    return (
      ua.includes('wv') || // Android WebView
      ua.includes('WebView') ||
      (ua.includes('iPhone') && !ua.includes('Safari')) || // iOS WKWebView
      ua.includes('FB_IAB') || // Facebook in-app browser
      ua.includes('FBAN')
    );
  }
}
```

---

## Playable Ad Specific Performance

### First Frame Under 1 Second

```typescript
class FastStartup {
  private startTime: number = 0;

  constructor() {
    this.startTime = performance.now();
  }

  // Phase 1: Show something immediately
  static renderLoadingFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    // Solid color background - renders in <1ms
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Simple loading indicator with no external assets
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', w / 2, h / 2);
  }

  // Phase 2: Load critical assets only
  static async loadCriticalAssets(): Promise<Map<string, HTMLImageElement>> {
    const assets = new Map<string, HTMLImageElement>();

    // Only load what's needed for the first screen
    const criticalUrls = [
      ['atlas', 'data:image/png;base64,...'], // Inline base64 for instant load
    ];

    const promises = criticalUrls.map(([name, url]) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          assets.set(name, img);
          resolve();
        };
        img.onerror = () => resolve(); // Don't block on failure
        img.src = url;
      });
    });

    await Promise.all(promises);
    return assets;
  }

  // Phase 3: Load remaining assets in background
  static loadDeferredAssets(): void {
    // Load after first frame is visible
    requestAnimationFrame(() => {
      // Load sound effects, additional sprites, etc.
    });
  }

  logStartupTime(phase: string): void {
    const elapsed = performance.now() - this.startTime;
    if (elapsed > 1000) {
      console.warn(`Slow startup: ${phase} at ${elapsed.toFixed(0)}ms`);
    }
  }
}

// Startup sequence
async function init(): Promise<void> {
  const startup = new FastStartup();

  // Immediately show something
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  FastStartup.renderLoadingFrame(ctx, canvas.width, canvas.height);
  startup.logStartupTime('first-paint');

  // Load critical assets
  const assets = await FastStartup.loadCriticalAssets();
  startup.logStartupTime('critical-assets');

  // Start game loop
  startGameLoop(ctx, assets);
  startup.logStartupTime('game-start');

  // Load the rest in background
  FastStartup.loadDeferredAssets();
}
```

### Lazy Initialization

```typescript
class LazyInitGame {
  private particleSystem: ParticleSystem | null = null;
  private soundManager: SoundManager | null = null;
  private postProcessing: PostProcessing | null = null;

  // Only create systems when first needed
  getParticles(): ParticleSystem {
    if (this.particleSystem === null) {
      this.particleSystem = new ParticleSystem(500);
    }
    return this.particleSystem;
  }

  getSoundManager(): SoundManager {
    if (this.soundManager === null) {
      this.soundManager = new SoundManager();
    }
    return this.soundManager;
  }

  getPostProcessing(): PostProcessing {
    if (this.postProcessing === null) {
      this.postProcessing = new PostProcessing();
    }
    return this.postProcessing;
  }
}

// Placeholder types
class SoundManager {
  play(name: string): void {
    // Play sound
  }
}

class PostProcessing {
  apply(ctx: CanvasRenderingContext2D): void {
    // Apply effects
  }
}
```

### Pre-warm WebGL Context

```typescript
function preWarmWebGL(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const gl = canvas.getContext('webgl', {
    alpha: false, // No transparency needed = faster
    antialias: false, // Disable AA for performance
    depth: false, // 2D game, no depth buffer
    stencil: false, // No stencil needed
    preserveDrawingBuffer: false, // Don't preserve buffer
    powerPreference: 'high-performance', // Request GPU
    failIfMajorPerformanceCaveat: false,
  });

  if (!gl) return null;

  // Force GPU initialization by doing a tiny draw
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Create a simple shader to warm the shader compiler
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, 'attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}');
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, 'void main(){gl_FragColor=vec4(1);}');
  gl.compileShader(fs);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  // Warm texture unit
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );

  // Clean up warm-up resources
  gl.deleteTexture(tex);
  gl.deleteProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return gl;
}
```

### Size-Aware Asset Loading

```typescript
interface AssetManifest {
  readonly critical: readonly AssetEntry[];
  readonly deferred: readonly AssetEntry[];
  readonly optional: readonly AssetEntry[];
}

interface AssetEntry {
  readonly name: string;
  readonly url: string;
  readonly sizeKB: number;
}

class SizeAwareLoader {
  private readonly sizeBudgetKB: number;
  private loadedKB: number = 0;

  constructor(sizeBudgetKB: number = 2048) {
    // 2MB default
    this.sizeBudgetKB = sizeBudgetKB;
  }

  async loadManifest(manifest: AssetManifest): Promise<Map<string, unknown>> {
    const assets = new Map<string, unknown>();

    // Always load critical
    for (const asset of manifest.critical) {
      const loaded = await this.loadAsset(asset);
      if (loaded !== null) {
        assets.set(asset.name, loaded);
      }
    }

    // Load deferred if budget allows
    for (const asset of manifest.deferred) {
      if (this.loadedKB + asset.sizeKB > this.sizeBudgetKB) {
        break;
      }
      const loaded = await this.loadAsset(asset);
      if (loaded !== null) {
        assets.set(asset.name, loaded);
      }
    }

    // Optional only if plenty of budget left
    if (this.loadedKB < this.sizeBudgetKB * 0.7) {
      for (const asset of manifest.optional) {
        if (this.loadedKB + asset.sizeKB > this.sizeBudgetKB) break;
        const loaded = await this.loadAsset(asset);
        if (loaded !== null) {
          assets.set(asset.name, loaded);
        }
      }
    }

    return assets;
  }

  private async loadAsset(asset: AssetEntry): Promise<unknown> {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = asset.url;
      });
      this.loadedKB += asset.sizeKB;
      return img;
    } catch {
      return null;
    }
  }

  getRemainingBudgetKB(): number {
    return this.sizeBudgetKB - this.loadedKB;
  }
}
```

---

## Interview Questions

### Q1: "Your playable ad runs at 30fps on a Galaxy A10. How do you diagnose and fix this?"

**Strong Answer:**

"I'd follow a systematic approach:

**1. Profile first, optimize second:**

- Connect Chrome DevTools via USB debugging
- Record a Performance trace with 4x CPU throttle
- Look at the flame chart for long frames

**2. Identify the bottleneck category:**

- **CPU-bound**: Game logic takes >8ms (yellow in flame chart)
- **GPU-bound**: Rendering takes too long (green areas)
- **GC pauses**: Purple blocks labeled 'Minor GC' or 'Major GC'

**3. Common fixes by category:**

For CPU-bound:

- Object pool all allocations (particles, vectors, temp objects)
- Use typed arrays for numeric data (Float32Array)
- Replace forEach/map with for loops in hot paths
- Use lookup tables for Math.sin/cos

For GPU-bound:

- Reduce canvas resolution to 0.5x or 0.75x device pixels
- Batch draw calls (under 20 per frame)
- Use a texture atlas instead of individual images
- Implement viewport culling

For GC pauses:

- Heap snapshot comparison to find allocations
- Pool all temporary objects
- Pre-allocate arrays at fixed sizes
- Avoid string concatenation in loops

**4. Adaptive quality:**
As a last resort, implement dynamic resolution scaling that drops resolution when FPS falls below 50, and recovers when it's stable above 58."

---

### Q2: "Explain object pooling. When is it essential and when is it overkill?"

**Strong Answer:**

"Object pooling pre-allocates a fixed number of objects and reuses them instead of creating and garbage-collecting new ones.

**Essential when:**

- High-frequency allocation: particles, bullets, effects (created/destroyed 100+ per second)
- Consistent object shapes: all pooled objects have the same properties
- Noticeable GC pauses: measured stutters correlating with minor GC events
- Mobile targets: where GC is slower and more disruptive

**Overkill when:**

- Objects are created rarely (menu buttons, UI panels)
- Objects are long-lived (game state, managers)
- The pool would be larger than actual usage (pooling 1000 objects to use 5)

**Key implementation details:**

- Pre-allocate to expected peak count
- Reset method must clear ALL state (common bug source)
- Use swap-with-last removal, not splice
- Monitor pool stats: active count, peak, misses (had to grow)

The real cost isn't the allocation itself (fast on V8), it's the GC pause when hundreds of short-lived objects get collected simultaneously during gameplay."

---

### Q3: "How do you get a playable ad's first frame under 1 second?"

**Strong Answer:**

"The goal is to show meaningful content within 1 second of the ad being loaded. Here's my approach:

**1. Inline everything** - No external HTTP requests. Base64 encode sprites directly in the JavaScript bundle. Use CSS for simple shapes. Generate sounds with Web Audio oscillators.

**2. Three-phase startup:**

- Phase 1 (0-50ms): Show solid background + loading text using pure canvas calls. No assets needed.
- Phase 2 (50-300ms): Decode the base64 sprite atlas and create the WebGL context.
- Phase 3 (300-500ms): Initialize game state, render first gameplay frame.

**3. Defer non-critical work:**

- Particle system: lazy-init on first explosion
- Sound system: create AudioContext on first user interaction (required by browsers anyway)
- Post-processing: skip entirely on low-end devices

**4. Pre-warm the GPU:**

- Create WebGL context with optimal flags (no alpha, no antialias, no depth)
- Do a dummy draw call to force GPU initialization
- Compile shaders during Phase 2

**5. Measure and enforce:**

- Add performance.now() markers at each phase
- Set a hard budget: if Phase 2 exceeds 200ms, skip optional features
- Test on actual low-end devices, not just desktop with CPU throttling"

---

### Q4: "What's the difference between spatial grid and quadtree? When would you use each?"

**Strong Answer:**

"Both are spatial partitioning structures for broad-phase collision detection.

**Spatial Grid:**

- Fixed-size cells covering the world
- O(1) insert and query per cell
- Best when objects are uniformly distributed
- Memory is proportional to world size (can be wasteful for large, sparse worlds)
- Simpler to implement, fewer cache misses
- Use for: playable ads, small/medium worlds, uniform object sizes

**Quadtree:**

- Recursively subdivides space into quadrants
- Adapts to object density (sparse areas have large nodes)
- Better for non-uniform distribution (e.g., objects clustered in one area)
- O(log n) insert, O(log n + k) query
- More complex, potentially more cache misses due to pointer chasing
- Use for: large worlds, variable density, objects of very different sizes

For playable ads, I almost always use a **spatial grid** because:

- The game area is small and fixed
- Object counts are low (<100)
- The simplicity means fewer bugs and smaller code size
- Rebuilding the grid each frame is cheap with few objects

I'd only use a quadtree if I had a large scrolling world with vastly different object densities."

---

### Q5: "How do you handle thermal throttling on mobile devices?"

**Strong Answer:**

"Thermal throttling is when the device reduces CPU/GPU clock speed to prevent overheating. It's a major issue for games because performance degrades over time, not immediately.

**Detection:**
I compare the average FPS of the first 2 seconds of gameplay against the most recent 2 seconds. If the recent average is 20%+ lower, the device is likely throttling.

**Mitigation strategy:**

1. **Prevention first:**

   - Don't target max GPU utilization. Leave 30% headroom.
   - Use requestAnimationFrame, never setInterval at high rates.
   - Reduce particles and effects on mobile by default.

2. **When throttling is detected:**

   - Lower resolution to 0.5x
   - Reduce particle count by 70%
   - Disable screen shake and post-effects
   - Drop to 30fps target (saves a lot of thermal budget)

3. **For playable ads specifically:**

   - The ad is 15-30 seconds, so thermal throttling is less of an issue than for full games
   - But the HOST app may have already heated the device
   - Start conservative and only increase quality if FPS is consistently high

4. **Battery API integration:**
   - Check battery level and charging state
   - Below 20% battery (not charging): enter low-power mode immediately
   - This respects the user's device state"

---

### Q6: "Describe your approach to reducing draw calls in a Canvas2D game."

**Strong Answer:**

"In Canvas2D, each drawImage call has overhead, but far less than WebGL state changes. My approach:

**1. Texture atlas**: Pack all sprites into a single large image. Every drawImage reads from the same source image, which is friendly to the browser's internal batching.

**2. Minimize context state changes:**

- Sort sprites by style (fillStyle, globalAlpha, etc.) before drawing
- Group all operations that share the same state
- Avoid save/restore when possible; manually track and restore only what changed

**3. Layer with off-screen canvases:**

- Static background → render once to off-screen canvas, drawImage once per frame
- Semi-static layer (UI, score) → redraw only when values change
- Dynamic layer (gameplay) → redraw every frame

**4. Dirty rectangles for partial scenes:**

- Track which regions changed
- Clip to bounding box of dirty regions
- Clear and redraw only those areas

**5. Resolution reduction:**

- Render the game canvas at 50-75% of display resolution
- Use CSS transform to scale up
- Save 2-4x pixel fill cost

For most playable ads, a texture atlas + off-screen canvas for background + resolution scaling gets you to 60fps on mobile without needing WebGL at all."

---

### Q7: "Your game has periodic stutters every few seconds. How do you identify and fix GC pauses?"

**Strong Answer:**

"Periodic stutters that correlate with no specific game event are the classic GC pause symptom.

**Identification:**

1. Record a Performance trace in Chrome DevTools
2. Look for purple 'Minor GC' or 'Major GC' events
3. Correlate their timing with frame drops
4. Check the Memory timeline for sawtooth patterns (allocate, allocate, GC, repeat)

**Root cause analysis:**

1. Take two heap snapshots 10 seconds apart
2. Use the 'Comparison' view to see what was allocated between snapshots
3. Common culprits:
   - Array.map/filter/slice creating new arrays each frame
   - String concatenation for scores/labels
   - Temporary {x, y} vector objects
   - Callback closures in forEach
   - Spread operator creating new objects

**Fix pattern:**

```typescript
// Pre-allocate a reusable vector
const tempVec = { x: 0, y: 0 };

// Pre-allocate score string buffer
let scoreText = '';

function update(): void {
  // Reuse tempVec instead of creating { x: ..., y: ... }
  tempVec.x = player.x + Math.cos(angle) * speed;
  tempVec.y = player.y + Math.sin(angle) * speed;

  // Cache string only when score changes
  if (scoreChanged) {
    scoreText = `Score: ${score}`;
    scoreChanged = false;
  }

  // Use for loop instead of array methods
  for (let i = 0; i < entities.length; i++) {
    if (!entities[i].active) continue;
    updateEntity(entities[i]);
  }
}
```

The goal is zero allocations per frame in hot paths. I verify by taking heap snapshots before and after 100 frames — the delta should be near zero."

---

### Q8: "How do you optimize a WebGL sprite batch for mobile?"

**Strong Answer:**

"The key principles are: minimize state changes, maximize data throughput, and respect mobile GPU architecture.

**1. Single draw call per batch:**

- Pack all sprites into one vertex buffer
- Use a texture atlas so all sprites share one texture bind
- Flush the batch only when texture changes or buffer is full

**2. Vertex buffer management:**

- Pre-allocate the maximum buffer size (e.g., 1000 sprites _ 4 verts _ 8 floats)
- Use Float32Array and write directly — no intermediate objects
- Use `gl.bufferData` with `DYNAMIC_DRAW` since data changes each frame
- Pre-compute the index buffer once (it never changes)

**3. Minimize GPU state changes:**

- Sort sprites by texture before batching
- Set blend mode once at batch start
- Avoid switching shaders mid-frame
- Keep uniform uploads to a minimum

**4. Mobile-specific concerns:**

- Tile-based GPUs (Mali, Adreno, PowerVR) penalize overdraw heavily
- Draw opaque sprites front-to-back, transparent back-to-front
- Keep vertex shader simple — mobile GPUs have limited vertex throughput
- Use `lowp`/`mediump` precision in shaders where possible

**5. Batch size:**

- Target 500-1000 sprites per batch max
- On low-end mobile, smaller batches (200-300) may perform better due to buffer upload costs
- Profile to find the sweet spot for target devices

A well-optimized sprite batch can render 1000+ sprites in 2-3 draw calls at 60fps on a Galaxy A10."

---

### Q9: "What is resolution scaling and how do you implement it adaptively?"

**Strong Answer:**

"Resolution scaling means rendering the game at a lower pixel resolution than the display, then upscaling via CSS or drawImage. It's the single most impactful optimization for mobile GPU performance.

**Implementation:**

1. Set canvas.width/height to a fraction of clientWidth/clientHeight
2. CSS scales the canvas to fill the screen
3. The GPU renders fewer pixels, dramatically reducing fill rate

**Adaptive approach:**

- Start at 1.0x scale
- Monitor FPS over a rolling window of 30-60 frames
- If average FPS drops below 50, reduce scale by 0.05 (minimum 0.5)
- If average FPS stays above 58 for 2 seconds, increase scale by 0.02
- Use hysteresis: different thresholds for scaling down vs up to prevent oscillation

**Quality considerations:**

- 0.75x is usually imperceptible on mobile screens
- 0.5x is noticeable but acceptable for fast-paced games
- Below 0.5x, rendering artifacts become too visible
- Render UI elements at full resolution on a separate canvas

**Cost savings:**

- 0.75x = 56% of the pixels (1.8x faster)
- 0.5x = 25% of the pixels (4x faster)

This is often the difference between 30fps and 60fps on low-end devices."

---

### Q10: "Walk me through optimizing a playable ad that's over the 5MB size limit."

**Strong Answer:**

"This is a very practical problem. Here's my systematic approach:

**1. Measure first:**
Run the build and analyze what's consuming space:

- JavaScript (minified + gzipped)
- Images (usually the biggest offender)
- Audio files
- Fonts

**2. Image optimization (biggest wins):**

- Use TinyPNG/ImageOptim to compress PNGs
- Consider JPEG for photographic content (much smaller)
- Reduce sprite dimensions (do they really need to be 512x512?)
- Use a sprite packer to eliminate whitespace in atlas
- Generate simple shapes programmatically instead of images
- Consider SVG for simple icons

**3. Audio optimization:**

- Replace audio files with Web Audio oscillator synthesis (zero file size)
- If audio files are needed, use low bitrate (32kbps mono is fine for sound effects)
- Limit to 2-3 critical sound effects

**4. Code optimization:**

- Terser with aggressive minification
- Remove dead code (tree shaking)
- Remove development-only code (profiling, logging)
- Use shorter variable names (terser's mangle)
- Inline all modules into a single file (no module loader overhead)

**5. Final tricks:**

- Base64 encoding adds 33% overhead — if over budget, consider loading one small external file
- Use gzip/brotli if the ad network supports it (most do)
- Remove unused CSS, HTML comments, whitespace

**Target budget for a 3MB limit:**

- Code: ~80KB (minified)
- Sprites: ~400KB (compressed PNG atlas)
- Audio: ~100KB (or 0KB with oscillators)
- Base64 overhead: +33%
- Final: ~770KB — well under limit

**Target for 5MB limit:**

- More room for higher quality sprites
- Can include a small audio sprite
- Consider video thumbnail if needed"
