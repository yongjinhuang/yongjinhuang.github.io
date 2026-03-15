# Game Loop Architecture

## Table of Contents

1. [The Fundamental Game Loop](#the-fundamental-game-loop)
2. [requestAnimationFrame](#requestanimationframe)
3. [Delta Time](#delta-time)
4. [Fixed Timestep vs Variable Timestep](#fixed-timestep-vs-variable-timestep)
5. [Semi-Fixed Timestep](#semi-fixed-timestep)
6. [The Accumulator Pattern](#the-accumulator-pattern)
7. [Time Scaling](#time-scaling)
8. [Frame Rate Independence](#frame-rate-independence)
9. [Performance Budgeting](#performance-budgeting)
10. [Common Pitfalls](#common-pitfalls)
11. [Complete Game Loop Implementation](#complete-game-loop-implementation)
12. [Interview Questions](#interview-questions)

---

## The Fundamental Game Loop

Every game is driven by a loop that repeats continuously: read input, update game state, render the result.

### The Simplest Game Loop

```typescript
// The most basic loop (DO NOT use in production)
while (true) {
    processInput();
    update();
    render();
}
```

This blocks the browser thread entirely. In web games, we never write a `while` loop — instead, we use `requestAnimationFrame` to integrate with the browser's rendering cycle.

### The Three Phases

```
┌─────────────────────────────────────��───────────────┐
│                    GAME LOOP                         │
│                                                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│   │  INPUT   │───>│  UPDATE  │───>│  RENDER  │      │
│   │          │    │          │    │          │       │
│   │ Keyboard │    │ Physics  │    │ Draw     │      │
│   │ Mouse    │    │ AI       │    │ sprites  │      │
│   │ Touch    │    │ Movement │    │ UI       │      │
│   │ Gamepad  │    │ Collision│    │ Effects  │      │
│   └──────────┘    └──────────┘    └──────────┘      │
│        │                                │            │
│        └────────────────────────────────┘            │
│                  Next Frame                          │
└─────────────────────────────────────────────────────┘
```

**Input Phase:**
- Poll keyboard, mouse, touch, gamepad state
- Process event queue (clicks, key presses)
- Convert raw input into game commands (e.g., "move left", "jump", "fire")

**Update Phase:**
- Apply physics (gravity, velocity, acceleration)
- Run AI logic (enemy behavior, pathfinding)
- Process collisions (detection and response)
- Update animations (sprite frames, tweens)
- Update game systems (scoring, timers, spawning)

**Render Phase:**
- Clear the screen
- Draw background layers
- Draw game objects (sorted by depth/z-order)
- Draw particle effects
- Draw UI overlay
- Present the framebuffer (swap buffers)

### Why Order Matters

Input must come first because update logic depends on current input state. Update must come before render because we want to draw the most current game state. If you render before updating, you show stale state for one frame (input lag).

Some advanced architectures separate input processing from the main loop by queuing events asynchronously, but the logical order remains: input before update before render.

---

## requestAnimationFrame

### How It Works

`requestAnimationFrame` (rAF) is the browser API that schedules a callback to run before the next screen repaint. It is the only correct way to drive a game loop in a web browser.

```typescript
function gameLoop(timestamp: number): void {
    // timestamp is a DOMHighResTimeStamp in milliseconds
    // (same as performance.now())

    processInput();
    update(timestamp);
    render();

    requestAnimationFrame(gameLoop);
}

// Start the loop
requestAnimationFrame(gameLoop);
```

### Why requestAnimationFrame Exists

1. **Sync with display refresh**: rAF fires at the display's refresh rate (typically 60Hz = 16.67ms, but 120Hz and 144Hz monitors fire faster)
2. **Automatic throttling**: When the tab is backgrounded, rAF is paused or throttled to ~1fps, saving CPU/GPU/battery
3. **Smooth rendering**: The browser can synchronize your render with the compositor, avoiding tearing
4. **Precise timing**: The `timestamp` parameter provides a high-resolution time value

### The timestamp Parameter

```typescript
let previousTime = 0;

function gameLoop(timestamp: number): void {
    // timestamp is milliseconds since the page loaded (performance.timeOrigin)
    // First call: timestamp is ~0 or a small value

    const deltaTime = timestamp - previousTime;
    previousTime = timestamp;

    // deltaTime is the time in ms since the last frame
    // At 60fps: ~16.67ms
    // At 30fps: ~33.33ms

    update(deltaTime / 1000); // Convert to seconds for physics
    render();

    requestAnimationFrame(gameLoop);
}

// Initialize previousTime before starting
previousTime = performance.now();
requestAnimationFrame(gameLoop);
```

### Canceling the Loop

```typescript
let animationFrameId: number;

function startLoop(): void {
    function gameLoop(timestamp: number): void {
        // ... game logic ...
        animationFrameId = requestAnimationFrame(gameLoop);
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
    cancelAnimationFrame(animationFrameId);
}
```

---

## Delta Time

Delta time (dt) is the elapsed time between the current frame and the previous frame. It is essential for making game behavior independent of frame rate.

### Calculating Delta Time

```typescript
class GameClock {
    private previousTime: number;
    private deltaTime: number;
    private elapsedTime: number;

    constructor() {
        this.previousTime = performance.now();
        this.deltaTime = 0;
        this.elapsedTime = 0;
    }

    tick(currentTime: number): number {
        this.deltaTime = (currentTime - this.previousTime) / 1000; // seconds
        this.previousTime = currentTime;
        this.elapsedTime += this.deltaTime;
        return this.deltaTime;
    }

    getDeltaTime(): number {
        return this.deltaTime;
    }

    getElapsedTime(): number {
        return this.elapsedTime;
    }
}
```

### Why Delta Time Is Necessary

Without delta time, game speed is tied to frame rate:

```typescript
// BAD: Frame-rate dependent movement
function update(): void {
    player.x += 5; // 5 pixels per frame
    // At 60fps: 300 px/sec
    // At 30fps: 150 px/sec  <-- player moves half as fast!
    // At 120fps: 600 px/sec <-- player moves twice as fast!
}

// GOOD: Frame-rate independent movement
function update(dt: number): void {
    player.x += 300 * dt; // 300 pixels per second, regardless of framerate
    // At 60fps: 300 * 0.0167 = 5.0 px/frame
    // At 30fps: 300 * 0.0333 = 10.0 px/frame
    // At 120fps: 300 * 0.0083 = 2.5 px/frame
    // All produce 300 px/sec total
}
```

### Smoothing Delta Time

Raw delta time can spike due to GC pauses, tab switching, or system interrupts. Smoothing prevents sudden jumps.

```typescript
class SmoothedClock {
    private readonly samples: number[];
    private readonly maxSamples: number;
    private previousTime: number;

    constructor(maxSamples: number = 10) {
        this.samples = [];
        this.maxSamples = maxSamples;
        this.previousTime = performance.now();
    }

    tick(currentTime: number): number {
        const rawDt = (currentTime - this.previousTime) / 1000;
        this.previousTime = currentTime;

        this.samples.push(rawDt);
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }

        // Average of recent samples
        const sum = this.samples.reduce((a, b) => a + b, 0);
        return sum / this.samples.length;
    }
}
```

### Capping Delta Time

Large delta time values (from tab switches or pauses) can cause objects to teleport or physics to explode.

```typescript
function tick(currentTime: number): number {
    const rawDt = (currentTime - this.previousTime) / 1000;
    this.previousTime = currentTime;

    // Cap at 250ms (4fps equivalent) to prevent huge jumps
    const MAX_DT = 0.25;
    return Math.min(rawDt, MAX_DT);
}
```

**Why 0.25 seconds?** It's a common choice because:
- Large enough to handle normal frame drops (e.g., 60fps dipping to 15fps)
- Small enough to prevent objects from tunneling through walls
- If the game genuinely runs below 4fps, the simulation slows down (acceptable degradation)

---

## Fixed Timestep vs Variable Timestep

### Variable Timestep

Each frame uses the actual elapsed time as the update step.

```typescript
function gameLoop(timestamp: number): void {
    const dt = (timestamp - previousTime) / 1000;
    previousTime = timestamp;

    update(dt); // Physics uses actual elapsed time
    render();

    requestAnimationFrame(gameLoop);
}

function update(dt: number): void {
    // Variable dt means physics steps are different sizes each frame
    velocity.y += GRAVITY * dt;
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
}
```

**Pros:**
- Simple to implement
- Uses actual time — no wasted computation
- Rendering matches simulation 1:1

**Cons:**
- **Non-deterministic**: Different frame rates produce different results because floating-point multiplication is not associative. `(a * 0.016) + (a * 0.017) !== a * 0.033`
- **Physics instability**: Large dt values (frame drops) can cause tunneling, explosion, or divergent behavior in physics simulations
- **Debugging nightmare**: Bugs may only appear at specific frame rates
- **Multiplayer impossible**: Two clients at different frame rates will diverge

### Fixed Timestep

Every update step uses the same fixed time interval.

```typescript
const FIXED_DT = 1 / 60; // 60 updates per second
let accumulator = 0;

function gameLoop(timestamp: number): void {
    const frameTime = (timestamp - previousTime) / 1000;
    previousTime = timestamp;
    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
        update(FIXED_DT); // Always the same dt
        accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(gameLoop);
}
```

**Pros:**
- **Deterministic**: Same inputs always produce same outputs
- **Stable physics**: Fixed step size prevents explosion/tunneling
- **Reproducible bugs**: Easier to debug since behavior is consistent
- **Multiplayer compatible**: All clients simulate identically

**Cons:**
- If the frame takes longer than FIXED_DT to process, the simulation falls behind (spiral of death)
- Rendering between fixed steps shows the game state from the last completed step, which can look stuttery if the fixed rate doesn't match the display rate

---

## Semi-Fixed Timestep

The gold standard for game loops: fixed update timestep with interpolated rendering. This combines deterministic physics with smooth visual output.

### The Core Idea

1. **Update** at a fixed rate (e.g., 60Hz) using an accumulator
2. **Render** at the display's rate (whatever rAF provides)
3. **Interpolate** between the previous and current game state for rendering

This decouples the simulation rate from the display rate.

```
Display: 144Hz  ──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──
                   │  │  │  │  │  │  │  │  │  │  │  │
Physics: 60Hz   ───┴─────┴─────┴─────┴─────┴─────┴────
                   U     U     U     U     U     U
                   R  R  R  R  R  R  R  R  R  R  R  R

U = Update (fixed step)
R = Render (interpolated)
```

Between physics updates, multiple render frames occur. Each render frame interpolates between the last two physics states based on how far the accumulator has progressed.

### Why Interpolation?

Without interpolation, on a 144Hz monitor with 60Hz physics, you'd see the same physics state for 2-3 render frames, then jump to the next. This creates visible micro-stutter.

With interpolation, each render frame shows a smooth blend between physics states:

```typescript
// alpha = how far between the last update and the next (0.0 to 1.0)
const alpha = accumulator / FIXED_DT;

// Interpolate position for rendering
const renderX = previousState.x * (1 - alpha) + currentState.x * alpha;
const renderY = previousState.y * (1 - alpha) + currentState.y * alpha;
```

---

## The Accumulator Pattern

The accumulator is the mechanism that bridges variable frame times with fixed update steps.

### How It Works

```
Frame 1: frameTime = 18ms, FIXED_DT = 16.67ms
  accumulator = 0 + 18 = 18
  while(18 >= 16.67): update(), accumulator = 18 - 16.67 = 1.33
  while(1.33 >= 16.67): false
  render(alpha = 1.33 / 16.67 = 0.08)  // 8% into next step

Frame 2: frameTime = 15ms
  accumulator = 1.33 + 15 = 16.33
  while(16.33 >= 16.67): false  // NO update this frame!
  render(alpha = 16.33 / 16.67 = 0.98)  // 98% into next step

Frame 3: frameTime = 17ms
  accumulator = 16.33 + 17 = 33.33
  while(33.33 >= 16.67): update(), accumulator = 33.33 - 16.67 = 16.66
  while(16.66 >= 16.67): false  // just barely not enough
  render(alpha = 16.66 / 16.67 = 0.999)
```

### The Spiral of Death

If a single update takes longer than FIXED_DT, the accumulator grows unbounded:

```
Frame 1: frameTime = 50ms (heavy frame)
  accumulator = 50
  while(50 >= 16.67): update() // takes 20ms... oops
  accumulator = 33.33
  while(33.33 >= 16.67): update() // another 20ms
  accumulator = 16.66
  while(16.66 >= 16.67): false
  Total update time: 40ms

Frame 2: actual frameTime is now huge because we spent 40ms updating
  accumulator grows even more...
  More updates needed...
  SPIRAL OF DEATH
```

**Prevention:**

```typescript
function gameLoop(timestamp: number): void {
    let frameTime = (timestamp - previousTime) / 1000;
    previousTime = timestamp;

    // Cap frame time to prevent spiral of death
    // At most, simulate 3 fixed steps per frame
    const MAX_FRAME_TIME = FIXED_DT * 3;
    frameTime = Math.min(frameTime, MAX_FRAME_TIME);

    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
    }

    const alpha = accumulator / FIXED_DT;
    render(alpha);

    requestAnimationFrame(gameLoop);
}
```

### Choosing the Fixed Timestep

| Rate | FIXED_DT | Use Case |
|------|----------|----------|
| 30 Hz | 1/30 = 0.0333s | Simple games, mobile battery saving |
| 60 Hz | 1/60 = 0.0167s | Standard for most games |
| 120 Hz | 1/120 = 0.0083s | Precise physics, fighting games |
| 240 Hz | 1/240 = 0.0042s | Competitive shooters (rare in web) |

**60Hz is the standard choice** for web games. It balances precision with CPU cost. Higher rates are only needed for games where sub-frame physics precision matters (e.g., fast projectiles, precise platformer mechanics).

---

## Time Scaling

Time scaling allows you to slow down, speed up, or pause the game simulation without changing the loop structure.

### Implementation

```typescript
class TimeController {
    private scale: number;
    private paused: boolean;

    constructor() {
        this.scale = 1.0;
        this.paused = false;
    }

    getScaledDt(dt: number): number {
        if (this.paused) return 0;
        return dt * this.scale;
    }

    setTimeScale(scale: number): void {
        this.scale = Math.max(0, scale); // Never negative
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    isPaused(): boolean {
        return this.paused;
    }

    getScale(): number {
        return this.scale;
    }
}
```

### Usage in Game Loop

```typescript
const timeController = new TimeController();

function gameLoop(timestamp: number): void {
    const rawDt = (timestamp - previousTime) / 1000;
    previousTime = timestamp;

    const scaledDt = timeController.getScaledDt(rawDt);

    // Accumulator uses scaled time
    accumulator += scaledDt;

    while (accumulator >= FIXED_DT) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
    }

    // Render always runs (even when paused, to show UI)
    const alpha = accumulator / FIXED_DT;
    render(alpha);

    requestAnimationFrame(gameLoop);
}
```

### Common Time Scale Values

```typescript
// Slow motion (bullet time)
timeController.setTimeScale(0.25); // 25% speed

// Pause
timeController.pause();

// Normal speed
timeController.setTimeScale(1.0);

// Fast forward (replays, skip animations)
timeController.setTimeScale(2.0);

// Gradual slow-motion effect
function enterSlowMotion(duration: number): void {
    const startScale = timeController.getScale();
    const targetScale = 0.2;
    let elapsed = 0;

    function transition(dt: number): void {
        elapsed += dt; // Use real dt, not scaled
        const t = Math.min(elapsed / duration, 1);
        const eased = t * t; // ease-in
        timeController.setTimeScale(startScale + (targetScale - startScale) * eased);
    }

    // Hook into update with real (unscaled) dt
    registerRealTimeCallback(transition);
}
```

### Selective Time Scaling

Some systems should ignore time scaling:
- **UI animations** (menus, buttons) should run at real time
- **Audio** should match time scale (or not, depending on design)
- **Particle effects** can optionally ignore scaling for visual appeal

```typescript
function update(dt: number): void {
    const scaledDt = timeController.getScaledDt(dt);
    const realDt = dt;

    // Game systems use scaled time
    physics.update(scaledDt);
    enemies.update(scaledDt);
    projectiles.update(scaledDt);

    // UI uses real time
    ui.update(realDt);
    menuAnimations.update(realDt);
}
```

---

## Frame Rate Independence

Frame rate independence means the game behaves identically regardless of the frame rate. This is critical for fairness and consistency.

### Position Update

```typescript
// Frame-rate independent position update
function updatePosition(entity: Entity, dt: number): Entity {
    return {
        ...entity,
        x: entity.x + entity.vx * dt,
        y: entity.y + entity.vy * dt,
    };
}
```

### Acceleration and Gravity

```typescript
// Semi-implicit Euler (stable for games)
function updatePhysics(entity: Entity, dt: number): Entity {
    // Update velocity first (semi-implicit Euler)
    const newVy = entity.vy + GRAVITY * dt;

    // Then update position with new velocity
    return {
        ...entity,
        vx: entity.vx,
        vy: newVy,
        x: entity.x + entity.vx * dt,
        y: entity.y + newVy * dt,
    };
}
```

### Framerate-Independent Lerp (Exponential Decay)

Standard lerp with a fixed factor is frame-rate dependent:

```typescript
// BAD: Frame-rate dependent lerp
camera.x = lerp(camera.x, target.x, 0.1);
// At 60fps: converges in ~44 frames = 0.73 seconds
// At 30fps: converges in ~44 frames = 1.47 seconds (WRONG!)

// GOOD: Frame-rate independent lerp using exponential decay
function lerpFrameIndependent(
    current: number,
    target: number,
    halfLife: number,  // Time in seconds for value to move halfway
    dt: number
): number {
    // Derivation: factor = 1 - 0.5^(dt/halfLife) = 1 - 2^(-dt/halfLife)
    const factor = 1 - Math.pow(2, -dt / halfLife);
    return current + (target - current) * factor;
}

// Usage:
camera.x = lerpFrameIndependent(camera.x, target.x, 0.1, dt);
// Now converges at the same real-time rate regardless of frame rate
```

### Timer-Based Events

```typescript
// BAD: Frame-counting
let fireCounter = 0;
function update(): void {
    fireCounter++;
    if (fireCounter >= 30) { // Fires every 30 frames
        fire();              // At 60fps: every 0.5s. At 30fps: every 1.0s!
        fireCounter = 0;
    }
}

// GOOD: Time-based
let fireCooldown = 0;
const FIRE_RATE = 0.5; // seconds between shots

function update(dt: number): void {
    fireCooldown -= dt;
    if (fireCooldown <= 0) {
        fire();
        fireCooldown = FIRE_RATE;
    }
}
```

### Animation Frame Timing

```typescript
class FrameAnimation {
    private readonly frameDuration: number; // seconds per frame
    private elapsed: number;
    private currentFrame: number;
    private readonly totalFrames: number;
    private readonly loop: boolean;

    constructor(fps: number, totalFrames: number, loop: boolean = true) {
        this.frameDuration = 1 / fps;
        this.elapsed = 0;
        this.currentFrame = 0;
        this.totalFrames = totalFrames;
        this.loop = loop;
    }

    update(dt: number): void {
        this.elapsed += dt;

        while (this.elapsed >= this.frameDuration) {
            this.elapsed -= this.frameDuration;
            this.currentFrame++;

            if (this.currentFrame >= this.totalFrames) {
                this.currentFrame = this.loop ? 0 : this.totalFrames - 1;
            }
        }
    }

    getFrame(): number {
        return this.currentFrame;
    }
}
```

---

## Performance Budgeting

### The 16.67ms Budget

At 60fps, each frame has 16.67 milliseconds. Everything — input, update, render, browser overhead — must complete within this window.

```
16.67ms Total Budget
├── ~1-2ms   Browser overhead (event handling, layout, compositing)
├── ~1ms     Input processing
├── ~3-5ms   Game update (physics, AI, collision)
├── ~5-8ms   Render (draw calls, GPU commands)
└── ~2-3ms   Margin for GC, variance
```

### Measuring Frame Time

```typescript
class PerformanceMonitor {
    private readonly frameTimes: number[];
    private readonly maxSamples: number;
    private frameStart: number;

    constructor(maxSamples: number = 120) {
        this.frameTimes = [];
        this.maxSamples = maxSamples;
        this.frameStart = 0;
    }

    beginFrame(): void {
        this.frameStart = performance.now();
    }

    endFrame(): void {
        const frameTime = performance.now() - this.frameStart;
        this.frameTimes.push(frameTime);
        if (this.frameTimes.length > this.maxSamples) {
            this.frameTimes.shift();
        }
    }

    getAverageFrameTime(): number {
        if (this.frameTimes.length === 0) return 0;
        const sum = this.frameTimes.reduce((a, b) => a + b, 0);
        return sum / this.frameTimes.length;
    }

    getAverageFPS(): number {
        const avg = this.getAverageFrameTime();
        return avg > 0 ? 1000 / avg : 0;
    }

    getPercentile(p: number): number {
        if (this.frameTimes.length === 0) return 0;
        const sorted = [...this.frameTimes].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    // 1% low — worst 1% of frames (more meaningful than average)
    get1PercentLow(): number {
        return this.getPercentile(99);
    }
}
```

### Budget Breakdown for Different Game Types

| Game Type | Update Budget | Render Budget | Notes |
|-----------|--------------|---------------|-------|
| Simple casual | 2ms | 3ms | Plenty of headroom |
| Puzzle game | 3ms | 5ms | Animations are the main cost |
| Platformer | 4ms | 6ms | Physics + many sprites |
| Strategy/RTS | 8ms | 6ms | AI-heavy, many units |
| Playable ad | 3ms | 4ms | Must be lightweight |

### When You Exceed Budget

If a frame takes longer than 16.67ms, the browser drops a frame. The user sees a stutter.

Strategies:
1. **Profile first**: Use Chrome DevTools Performance tab to identify bottlenecks
2. **Reduce update scope**: Skip offscreen entities, use spatial partitioning
3. **Amortize work**: Spread heavy computation across multiple frames
4. **Reduce draw calls**: Better batching, fewer texture switches
5. **Lower quality**: Reduce particle count, simplify shaders, lower resolution
6. **Target 30fps**: For mobile, a stable 30fps is better than a stuttery 60fps

```typescript
// Amortizing expensive work across frames
class AmortizedPathfinder {
    private readonly queue: PathRequest[];
    private readonly maxPerFrame: number;

    constructor(maxPerFrame: number = 3) {
        this.queue = [];
        this.maxPerFrame = maxPerFrame;
    }

    requestPath(from: Point, to: Point, callback: (path: Point[]) => void): void {
        this.queue.push({ from, to, callback });
    }

    update(): void {
        const toProcess = Math.min(this.queue.length, this.maxPerFrame);
        for (let i = 0; i < toProcess; i++) {
            const request = this.queue.shift();
            if (request) {
                const path = this.computePath(request.from, request.to);
                request.callback(path);
            }
        }
    }

    private computePath(from: Point, to: Point): Point[] {
        // A* or similar algorithm
        return [];
    }
}
```

---

## Common Pitfalls

### Pitfall 1: Using setTimeout/setInterval Instead of rAF

```typescript
// BAD: setTimeout
function gameLoop(): void {
    update();
    render();
    setTimeout(gameLoop, 1000 / 60); // Aim for 60fps
}

// Problems:
// 1. setTimeout has minimum ~4ms delay (even if you request 0)
// 2. Not synced with display refresh — causes tearing/stuttering
// 3. Continues running in background tabs, wasting battery
// 4. No high-resolution timestamp parameter
// 5. Drift: setTimeout(fn, 16) doesn't guarantee exactly 16ms intervals

// GOOD: requestAnimationFrame
function gameLoop(timestamp: number): void {
    update(timestamp);
    render();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
```

### Pitfall 2: Tab Visibility and Huge Delta Times

When a tab is hidden, rAF is throttled or paused. When the tab becomes visible again, the first frame has a massive delta time.

```typescript
// BAD: No handling of visibility change
function gameLoop(timestamp: number): void {
    const dt = timestamp - previousTime; // Could be SECONDS after tab switch
    previousTime = timestamp;
    update(dt); // Objects teleport, physics explode
}

// GOOD: Handle visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Reset previousTime to prevent huge dt
        previousTime = performance.now();
        // Optionally: pause/resume game
    }
});

// Also cap dt as a safety net
const dt = Math.min(timestamp - previousTime, 250) / 1000;
```

### Pitfall 3: Physics Coupled to Frame Rate

```typescript
// BAD: Jump height depends on frame rate
function jump(): void {
    velocity.y = -JUMP_SPEED;
    // At 60fps with dt=0.0167: reaches height H
    // At 30fps with dt=0.0333: different height due to larger integration steps
}

// GOOD: Use fixed timestep for physics
const FIXED_DT = 1 / 60;
let accumulator = 0;

function gameLoop(timestamp: number): void {
    const frameTime = Math.min((timestamp - previousTime) / 1000, 0.25);
    previousTime = timestamp;
    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
        physicsUpdate(FIXED_DT); // Always same step size
        accumulator -= FIXED_DT;
    }

    render(accumulator / FIXED_DT);
    requestAnimationFrame(gameLoop);
}
```

### Pitfall 4: Rendering Without Interpolation

```typescript
// BAD: Render last physics state directly
function render(): void {
    drawSprite(player.x, player.y);
    // On a 144Hz monitor with 60Hz physics, the player position
    // updates only 60 times/sec but renders 144 times/sec.
    // Same position for 2-3 frames, then jumps — visible micro-stutter.
}

// GOOD: Interpolate for smooth rendering
function render(alpha: number): void {
    const renderX = player.previousX + (player.x - player.previousX) * alpha;
    const renderY = player.previousY + (player.y - player.previousY) * alpha;
    drawSprite(renderX, renderY);
}
```

### Pitfall 5: Forgetting to Handle Different Refresh Rates

```typescript
// Modern monitors run at 60Hz, 75Hz, 90Hz, 120Hz, 144Hz, 240Hz
// Your game must work correctly at ALL of these rates

// BAD: Assuming 60fps
const speed = 5; // pixels per frame — assumes 60fps

// GOOD: Time-based
const speed = 300; // pixels per second — works at any rate
```

### Pitfall 6: Accumulating Floating Point Errors

```typescript
// BAD: Accumulating position over time
let x = 0;
function update(dt: number): void {
    x += velocity * dt;
    // After millions of additions, x drifts due to floating point precision
}

// GOOD: Track time and compute position
let startTime = 0;
let startX = 0;
function update(dt: number, totalTime: number): void {
    // For constant velocity, compute directly
    x = startX + velocity * (totalTime - startTime);
    // No accumulated error
}
```

### Pitfall 7: GC Pressure in the Game Loop

```typescript
// BAD: Creating objects every frame
function update(dt: number): void {
    const velocity = { x: vx * dt, y: vy * dt };     // Allocation!
    const position = { x: px + velocity.x, y: py + velocity.y }; // Allocation!
    const bounds = { x: position.x, y: position.y, w: 32, h: 32 }; // Allocation!
}

// GOOD: Reuse objects or use flat data
// Pre-allocate outside the loop
const tempVec = { x: 0, y: 0 };

function update(dt: number): void {
    // Reuse pre-allocated objects (acceptable mutation in hot paths)
    tempVec.x = vx * dt;
    tempVec.y = vy * dt;
    px += tempVec.x;
    py += tempVec.y;
}

// Or use typed arrays for entity data (data-oriented design)
const positions = new Float32Array(MAX_ENTITIES * 2);
const velocities = new Float32Array(MAX_ENTITIES * 2);

function updateAll(dt: number, count: number): void {
    for (let i = 0; i < count * 2; i += 2) {
        positions[i]     += velocities[i]     * dt;
        positions[i + 1] += velocities[i + 1] * dt;
    }
}
```

---

## Complete Game Loop Implementation

Here is a production-quality game loop with fixed timestep, interpolation, time scaling, performance monitoring, and visibility handling.

```typescript
// ============================================================
// GAME LOOP — Fixed timestep with interpolated rendering
// ============================================================

interface GameState {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly rotation: number;
}

interface RenderableState {
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
}

// --- Configuration ---
const FIXED_DT = 1 / 60;            // 60Hz physics
const MAX_FRAME_TIME = FIXED_DT * 5; // Prevent spiral of death
const DT_SMOOTH_FRAMES = 5;          // Smooth over 5 frames

// --- State ---
let previousTime = 0;
let accumulator = 0;
let animFrameId = 0;
let running = false;

let timeScale = 1.0;
let paused = false;

// Double-buffered game state for interpolation
let currentState: GameState = { x: 100, y: 100, vx: 200, vy: 0, rotation: 0 };
let previousState: GameState = { ...currentState };

// Delta time smoothing
const dtSamples: number[] = [];

// Performance tracking
let frameCount = 0;
let fpsUpdateTime = 0;
let displayFps = 0;
const frameTimes: number[] = [];

// --- Input ---
const inputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
};

function setupInput(): void {
    const keyMap: Record<string, keyof typeof inputState> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        Space: 'jump',
    };

    window.addEventListener('keydown', (e) => {
        const action = keyMap[e.code];
        if (action) {
            inputState[action] = true;
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        const action = keyMap[e.code];
        if (action) {
            inputState[action] = false;
        }
    });
}

// --- Physics Update (fixed timestep) ---
const GRAVITY = 800;    // px/s^2
const MOVE_SPEED = 300; // px/s
const JUMP_SPEED = 500; // px/s
const GROUND_Y = 500;

function fixedUpdate(state: GameState, dt: number): GameState {
    let vx = state.vx;
    let vy = state.vy;

    // Horizontal movement
    if (inputState.left) vx = -MOVE_SPEED;
    else if (inputState.right) vx = MOVE_SPEED;
    else vx = 0;

    // Jump
    if (inputState.jump && state.y >= GROUND_Y) {
        vy = -JUMP_SPEED;
    }

    // Gravity
    vy += GRAVITY * dt;

    // Position
    let x = state.x + vx * dt;
    let y = state.y + vy * dt;

    // Ground collision
    if (y > GROUND_Y) {
        y = GROUND_Y;
        vy = 0;
    }

    // Screen bounds
    x = Math.max(0, Math.min(800, x));

    return { x, y, vx, vy, rotation: state.rotation + dt * 2 };
}

// --- Interpolation ---
function interpolateState(prev: GameState, curr: GameState, alpha: number): RenderableState {
    return {
        x: prev.x + (curr.x - prev.x) * alpha,
        y: prev.y + (curr.y - prev.y) * alpha,
        rotation: prev.rotation + (curr.rotation - prev.rotation) * alpha,
    };
}

// --- Render ---
function render(state: RenderableState, fps: number): void {
    // In a real game, this would issue WebGL draw calls.
    // Here we use canvas 2D for clarity.
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ground
    ctx.fillStyle = '#3a5a3a';
    ctx.fillRect(0, GROUND_Y + 16, canvas.width, canvas.height - GROUND_Y - 16);

    // Player
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.rotation);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(-16, -16, 32, 32);
    ctx.restore();

    // FPS display
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, 10, 20);
    ctx.fillText(`Time Scale: ${timeScale.toFixed(2)}`, 10, 40);
}

// --- Delta Time Smoothing ---
function getSmoothedDt(rawDt: number): number {
    dtSamples.push(rawDt);
    if (dtSamples.length > DT_SMOOTH_FRAMES) {
        dtSamples.shift();
    }
    const sum = dtSamples.reduce((a, b) => a + b, 0);
    return sum / dtSamples.length;
}

// --- Visibility Handling ---
function setupVisibilityHandling(): void {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Reset timing to prevent huge dt on return
            previousTime = performance.now();
            accumulator = 0;
            dtSamples.length = 0;
        } else {
            // Optionally auto-pause
            // paused = true;
        }
    });
}

// --- FPS Counter ---
function updateFpsCounter(timestamp: number): void {
    frameCount++;
    const elapsed = timestamp - fpsUpdateTime;
    if (elapsed >= 1000) {
        displayFps = (frameCount * 1000) / elapsed;
        frameCount = 0;
        fpsUpdateTime = timestamp;
    }
}

// --- Main Loop ---
function gameLoop(timestamp: number): void {
    if (!running) return;

    // --- Calculate frame time ---
    let rawFrameTime = (timestamp - previousTime) / 1000; // seconds
    previousTime = timestamp;

    // Cap to prevent spiral of death
    rawFrameTime = Math.min(rawFrameTime, MAX_FRAME_TIME);

    // Smooth delta time
    const frameTime = getSmoothedDt(rawFrameTime);

    // Apply time scaling
    const scaledFrameTime = paused ? 0 : frameTime * timeScale;

    // --- FPS tracking ---
    updateFpsCounter(timestamp);

    // --- Fixed update with accumulator ---
    accumulator += scaledFrameTime;

    while (accumulator >= FIXED_DT) {
        // Save previous state for interpolation
        previousState = { ...currentState };

        // Run fixed update
        currentState = fixedUpdate(currentState, FIXED_DT);

        accumulator -= FIXED_DT;
    }

    // --- Interpolated render ---
    const alpha = accumulator / FIXED_DT;
    const renderState = interpolateState(previousState, currentState, alpha);
    render(renderState, displayFps);

    // --- Schedule next frame ---
    animFrameId = requestAnimationFrame(gameLoop);
}

// --- Public API ---
function startGame(): void {
    if (running) return;
    running = true;

    setupInput();
    setupVisibilityHandling();

    previousTime = performance.now();
    fpsUpdateTime = previousTime;
    accumulator = 0;

    animFrameId = requestAnimationFrame(gameLoop);
}

function stopGame(): void {
    running = false;
    cancelAnimationFrame(animFrameId);
}

function setTimeScale(scale: number): void {
    timeScale = Math.max(0, Math.min(5, scale));
}

function togglePause(): void {
    paused = !paused;
}

// Start
startGame();
```

### Architecture Notes

1. **Immutable state updates**: `fixedUpdate` returns a new state object rather than mutating — enables easy rollback and state history for replays.

2. **Double buffering**: `previousState` and `currentState` are both maintained for interpolation. The previous state is saved before each `fixedUpdate` call.

3. **Separation of concerns**: Input, update, and render are cleanly separated. The update function is pure — given the same inputs and state, it produces the same output.

4. **Configurable**: `FIXED_DT`, `MAX_FRAME_TIME`, `DT_SMOOTH_FRAMES` are all tunable constants at the top.

5. **No allocations in hot path**: The main loop avoids creating new objects. The `{ ...currentState }` spread is the only allocation, and it's a shallow copy of a small object (acceptable; could use a pool for zero-allocation).

---

## Interview Questions

### Q1: Explain the difference between `setTimeout`, `setInterval`, and `requestAnimationFrame` for driving a game loop. Why is rAF the correct choice?

**A:**

**`setTimeout(fn, delay)`**: Schedules a callback after at least `delay` milliseconds. Problems for games:
- Minimum delay is ~4ms (browsers clamp it), but actual delay can be much longer due to event loop contention
- Not synchronized with display refresh — causes visual tearing and inconsistent frame pacing
- Continues firing in background tabs, wasting CPU/battery
- Accumulates drift over time (if you want 60fps with `setTimeout(fn, 16)`, frames arrive at 16ms, 32ms, 48ms... but actual intervals may be 16.5, 17.1, 15.9... causing uneven timing)

**`setInterval(fn, delay)`**: Like `setTimeout` but repeating. Same problems, plus:
- If a callback takes longer than the interval, callbacks queue up and fire back-to-back when the thread is free
- Can cause a burst of rapid-fire updates after a slow frame

**`requestAnimationFrame(fn)`**: Designed specifically for animation and rendering:
- Fires once per display refresh (60Hz, 120Hz, 144Hz — matches the monitor)
- Browser synchronizes it with the compositor for tear-free rendering
- Automatically paused when the tab is backgrounded (saves battery)
- Provides a high-precision timestamp parameter
- Browser can batch rAF callbacks together for optimal scheduling

rAF is the correct choice because it integrates with the browser's rendering pipeline. Your game frame is guaranteed to run exactly once before each paint, giving you the smoothest possible output with no tearing and no wasted work.

---

### Q2: What is the "spiral of death" in a game loop and how do you prevent it?

**A:** The spiral of death occurs with fixed-timestep loops when the time to process one update exceeds the fixed timestep interval.

**How it happens:**
1. A frame takes 50ms (e.g., due to a GC pause or heavy AI computation)
2. The accumulator receives 50ms, requiring 3 fixed steps at 16.67ms each
3. Processing 3 updates takes even longer (say 60ms)
4. The next frame's accumulator receives 60ms, requiring 4 updates
5. 4 updates take 80ms, next frame needs 5 updates...
6. The game falls further behind each frame until it freezes

**Prevention strategies:**

1. **Cap frame time**: `frameTime = Math.min(frameTime, MAX_FRAME_TIME)`. The game slows down instead of spiraling.

2. **Cap maximum updates per frame**: `for (let i = 0; i < MAX_UPDATES && accumulator >= FIXED_DT; i++)`. Skip excess accumulator time.

3. **Adaptive timestep**: If consistently behind, temporarily increase FIXED_DT (lower simulation quality) to catch up.

4. **Profile and optimize**: The real fix is ensuring updates are fast enough. If a single fixed update takes more than FIXED_DT, the loop can never keep up.

The simplest and most common approach is capping frame time at 3-5x the fixed timestep. This means the game can process at most 3-5 updates per frame. If the game genuinely can't maintain the target frame rate, it slows down gracefully rather than spiraling.

---

### Q3: Why is interpolation necessary in a fixed-timestep game loop? What happens without it?

**A:** Without interpolation, a fixed-timestep loop renders the game state from the last completed physics step. When the display rate doesn't match the physics rate, this causes visible micro-stutter.

**Example: 60Hz physics on a 144Hz display**

Without interpolation:
- Physics runs at 60Hz (16.67ms steps)
- Display renders at 144Hz (6.94ms per frame)
- For every physics step, 2-3 render frames show the identical position
- Then the position jumps to the next physics state
- Result: Character appears to stutter — moves, pauses, moves, pauses

With interpolation:
- Between physics steps, the render frame calculates `alpha = accumulator / FIXED_DT`
- Alpha represents how far we are between the last physics state and the next
- `renderPosition = previousPosition * (1 - alpha) + currentPosition * alpha`
- Each render frame shows a smoothly transitioning position
- Result: Buttery smooth movement at any display rate

The tradeoff is that rendering is always slightly behind the actual physics state (by at most one fixed step). In practice, this ~16ms of latency is imperceptible to players.

**Important note**: Interpolation works between the *previous* and *current* states (looking backward), not between current and *predicted* states (looking forward). Extrapolation (predicting forward) can overshoot and cause visual artifacts.

---

### Q4: How would you implement a pause system that freezes gameplay but keeps UI responsive?

**A:** The key is separating game time from real time. When paused, game updates receive `dt = 0` while UI updates receive the actual delta time.

```typescript
function gameLoop(timestamp: number): void {
    const realDt = (timestamp - previousTime) / 1000;
    previousTime = timestamp;

    const gameDt = paused ? 0 : realDt * timeScale;

    // Accumulator only advances with game time
    accumulator += gameDt;

    while (accumulator >= FIXED_DT) {
        previousState = { ...currentState };
        currentState = fixedUpdate(currentState, FIXED_DT);
        accumulator -= FIXED_DT;
    }

    // UI always updates with real time
    updateUI(realDt);
    updatePauseMenuAnimations(realDt);

    // Render always runs (shows game + UI)
    const alpha = accumulator / FIXED_DT;
    render(interpolateState(previousState, currentState, alpha));
    renderUI();

    requestAnimationFrame(gameLoop);
}
```

Key considerations:
- The render loop must continue running even when paused (to show the pause menu, animate UI elements)
- Audio should be paused/muted
- Particles and visual effects should freeze (use game time, not real time)
- Input handling for the pause menu must still work (read input with real time)
- Network messages (in multiplayer) may need special handling

---

### Q5: Explain the difference between Euler, semi-implicit Euler, and Verlet integration. When would you use each?

**A:** These are methods for numerically integrating equations of motion (turning velocity and acceleration into position changes).

**Explicit Euler (forward Euler):**
```typescript
// Position update uses CURRENT velocity
position += velocity * dt;
velocity += acceleration * dt;
```
- Simple but least accurate
- Energy increases over time (unstable for oscillating systems like springs)
- A ball on a spring would spiral outward
- Almost never used in games

**Semi-implicit Euler (symplectic Euler):**
```typescript
// Update velocity FIRST, then use NEW velocity for position
velocity += acceleration * dt;
position += velocity * dt;
```
- Much more stable than explicit Euler — energy is conserved on average
- Simple to implement
- The standard choice for most 2D games
- A ball on a spring stays stable
- Used by Box2D, Phaser, and most game physics engines

**Verlet Integration:**
```typescript
// Position is derived from previous positions, not velocity
const newPosition = 2 * position - previousPosition + acceleration * dt * dt;
previousPosition = position;
position = newPosition;
// Velocity is implicit: velocity ≈ (position - previousPosition) / dt
```
- Very stable, even with large timesteps
- Excellent for constraint-based physics (ragdolls, rope, cloth)
- Self-correcting — errors don't accumulate
- More complex to add velocity-dependent forces (drag, friction)
- Used by many ragdoll/cloth simulations

**When to use each:**
- **Semi-implicit Euler**: Default choice for 2D game physics. Simple, stable enough, and velocity is explicit (easy to apply forces, set speed limits).
- **Verlet**: When you have lots of constraints (ragdolls, rope physics, cloth, particle chains). The position-based approach makes constraint solving natural.
- **Explicit Euler**: Never in games. Only in educational examples.

---

### Q6: How do you handle game time during a long loading screen or level transition?

**A:** The core issue is that during loading, rAF callbacks may not fire (if the main thread is blocked) or fire with long gaps. When the game resumes, the accumulator receives a massive delta time.

**Solution: Reset the clock after loading**

```typescript
async function loadLevel(levelId: string): Promise<void> {
    // Stop the game loop
    cancelAnimationFrame(animFrameId);

    // Show loading screen (could use a simple rAF loop for spinner)
    showLoadingScreen();

    // Load assets
    await loadAssets(levelId);

    // Reset timing state
    previousTime = performance.now();
    accumulator = 0;
    dtSamples.length = 0;

    // Hide loading screen
    hideLoadingScreen();

    // Resume game loop with fresh timing
    animFrameId = requestAnimationFrame(gameLoop);
}
```

Key principles:
1. **Stop the game loop** during loading — don't let the accumulator build up
2. **Reset `previousTime`** after loading completes — the first frame after loading gets `dt ≈ 0`
3. **Clear smoothing samples** — old frame time data is no longer relevant
4. **Use a separate animation loop** for the loading screen spinner if needed

---

### Q7: What is the performance.now() API and why is it preferred over Date.now() for game timing?

**A:**

**`Date.now()`:**
- Returns milliseconds since Unix epoch (January 1, 1970)
- Integer precision (1ms resolution)
- Affected by system clock changes (NTP sync, user adjusting time, daylight saving)
- If the system clock jumps, your delta time could be negative or enormous

**`performance.now()`:**
- Returns milliseconds since `performance.timeOrigin` (usually page load)
- Sub-millisecond precision (typically microsecond resolution)
- Monotonically increasing — never goes backward
- Not affected by system clock changes
- Same time base used by `requestAnimationFrame` timestamp parameter

For game loops, `performance.now()` is always preferred because:
1. Sub-millisecond precision matters for smooth animation (at 144Hz, each frame is 6.94ms — integer precision loses 14% of the resolution)
2. Monotonic guarantee prevents negative delta times
3. Clock independence prevents sudden jumps when the system syncs time

Note: The rAF callback's `timestamp` parameter uses the same time base as `performance.now()`, so they're interchangeable. Use the rAF timestamp when available to avoid an extra `performance.now()` call.

---

### Q8: How would you implement a replay system using a fixed-timestep game loop?

**A:** A fixed-timestep loop with deterministic updates is ideal for replay systems because the same inputs at the same simulation frame always produce the same result.

**Recording:**
```typescript
interface InputSnapshot {
    readonly frame: number;
    readonly left: boolean;
    readonly right: boolean;
    readonly jump: boolean;
}

const inputLog: InputSnapshot[] = [];
let simulationFrame = 0;

function fixedUpdate(state: GameState, dt: number): GameState {
    // Record input at this simulation frame
    inputLog.push({
        frame: simulationFrame,
        left: inputState.left,
        right: inputState.right,
        jump: inputState.jump,
    });

    simulationFrame++;

    // ... normal physics update using inputState ...
    return newState;
}
```

**Playback:**
```typescript
let replayIndex = 0;

function replayFixedUpdate(state: GameState, dt: number): GameState {
    // Restore input from log
    const snapshot = inputLog[replayIndex];
    if (snapshot && snapshot.frame === simulationFrame) {
        inputState.left = snapshot.left;
        inputState.right = snapshot.right;
        inputState.jump = snapshot.jump;
        replayIndex++;
    }

    simulationFrame++;

    // Same physics code — produces identical results
    return fixedUpdate(state, dt);
}
```

Requirements for deterministic replay:
1. **Fixed timestep** — every simulation step uses the same `dt`
2. **No randomness** (or seeded PRNG with recorded seed)
3. **Deterministic math** — avoid `Math.random()`, be careful with floating-point order
4. **Same initial state** — record the starting conditions
5. **All inputs recorded** — every input that affects game state must be logged

This is also the foundation for **lockstep multiplayer** — instead of sending game state over the network, you only send inputs, and each client simulates identically.

---

### Q9: What happens when a player plays your game on a 240Hz gaming monitor? How does your game loop handle it?

**A:** With a fixed-timestep + interpolation loop:

- **rAF fires 240 times per second** (4.17ms per frame)
- **Physics runs at 60Hz** (FIXED_DT = 16.67ms) — this doesn't change
- **Accumulator**: each frame adds ~4.17ms. After ~4 render frames, accumulator >= 16.67ms and one physics step runs
- **Interpolation alpha**: smoothly transitions between 0.0 and 1.0 across those 4 render frames
- **Result**: The player sees 240 unique (interpolated) positions per second with buttery smooth motion

The physics simulation is unchanged — same determinism, same CPU cost. Only rendering is faster.

**Potential issues to watch for:**
1. **CPU budget**: 240 render calls per second means each frame has only 4.17ms. Rendering must be lightweight.
2. **Input responsiveness**: Input is read 240 times/sec but only affects physics at 60Hz. For competitive games, consider polling input at the physics rate and responding to it immediately (e.g., adjust the render position based on predicted input).
3. **Object allocation**: 240fps means 240x more potential GC pressure from object allocation in the render path.

If the game's render cost exceeds 4.17ms, the browser drops frames down to the next achievable rate (120Hz, 60Hz, etc.). The game still works correctly because of the fixed timestep — only visual smoothness is affected.

---

### Q10: How would you implement frame-rate independent camera smoothing (following a player character)?

**A:** The standard approach is exponential decay (frame-rate independent lerp), not a fixed lerp factor.

```typescript
// BAD: Frame-rate dependent
function updateCamera(camera: Vec2, target: Vec2): Vec2 {
    return {
        x: camera.x + (target.x - camera.x) * 0.1, // 10% per frame
        y: camera.y + (target.y - camera.y) * 0.1,
    };
    // At 60fps: takes ~0.73s to get 90% of the way
    // At 30fps: takes ~1.47s — noticeably slower/laggier
}

// GOOD: Frame-rate independent (exponential decay)
function updateCamera(camera: Vec2, target: Vec2, dt: number): Vec2 {
    const halfLife = 0.1; // seconds — time to cover half the remaining distance
    const factor = 1 - Math.pow(0.5, dt / halfLife);

    return {
        x: camera.x + (target.x - camera.x) * factor,
        y: camera.y + (target.y - camera.y) * factor,
    };
    // At ANY frame rate: takes the same real time to converge
}
```

**The math behind it:**

The naive `lerp(current, target, 0.1)` per frame is actually `current = current * 0.9 + target * 0.1`. After `n` frames, the remaining distance is `(0.9)^n`. This is frame-count dependent.

The correct version uses `(0.5)^(dt/halfLife)`, which produces the same result regardless of how many frames elapse, because the exponential decay is parameterized by real time, not frame count.

**Where this runs:** Camera smoothing can run in either the fixed update or the render phase:
- **Fixed update**: Camera follows physics position. Simple but can stutter on high-refresh displays without interpolation.
- **Render phase**: Camera follows the interpolated render position. Smoothest results. Use `realDt` (not physics dt) for the smoothing calculation.

---

### Q11: How do you handle animation timing in a fixed-timestep game loop?

**A:** There are two approaches depending on whether the animation affects gameplay:

**Gameplay animations (e.g., attack frames, hitbox timing):**
These must run in the fixed update so they're deterministic:

```typescript
interface AnimationState {
    readonly currentFrame: number;
    readonly elapsed: number;
    readonly frameDuration: number;
    readonly totalFrames: number;
}

function updateAnimation(anim: AnimationState, dt: number): AnimationState {
    const newElapsed = anim.elapsed + dt;

    if (newElapsed >= anim.frameDuration) {
        const nextFrame = (anim.currentFrame + 1) % anim.totalFrames;
        return {
            ...anim,
            currentFrame: nextFrame,
            elapsed: newElapsed - anim.frameDuration,
        };
    }

    return { ...anim, elapsed: newElapsed };
}
```

**Visual-only animations (particles, UI, cosmetic effects):**
These can run with the render delta time for smoothness:

```typescript
function renderUpdate(dt: number): void {
    // Particles use render dt for smooth visual motion
    particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.fadeRate * dt;
    });
}
```

The general rule: if it affects game state or collision, it runs in fixed update. If it's purely visual, it can run in the render phase with real delta time.

---

### Q12: Compare running a game at a locked 30fps versus an unlocked variable framerate. When might you choose 30fps?

**A:**

**Locked 30fps:**
- Frame budget: 33.33ms (double the headroom of 60fps)
- Consistent frame pacing — no frame-to-frame stutter
- Lower power consumption (important for mobile/battery)
- More CPU headroom for complex AI, physics, or many entities
- Visually less smooth but predictable

**Unlocked variable framerate:**
- Smoother when hardware can sustain high rates (60fps+)
- Stuttery when frame rate fluctuates (e.g., swinging between 45-55fps is worse than locked 30fps because of uneven frame pacing)
- Higher power draw
- Harder to tune — must work at all frame rates

**When to choose locked 30fps:**
1. **Mobile web games**: Battery life is critical. A solid 30fps looks better than a stuttering 40-50fps.
2. **Complex simulations**: Strategy games with hundreds of units may not sustain 60fps consistently. Locked 30fps is smoother.
3. **Playable ads**: Running on low-end devices, a stable 30fps is more reliable than targeting 60fps and missing it.
4. **When the alternative is variable 40-55fps**: Inconsistent frame pacing is visually worse than lower-but-consistent frame rate.

**Implementation:**
```typescript
// Lock to 30fps by skipping every other rAF callback
let skipFrame = false;

function gameLoop(timestamp: number): void {
    skipFrame = !skipFrame;
    if (skipFrame) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Normal loop with dt calculation
    const dt = (timestamp - previousTime) / 1000;
    previousTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
}
```

---

### Q13: What is "jank" and how do you diagnose it in a web game?

**A:** Jank is the visible stutter or hitch that occurs when a frame takes significantly longer than expected, causing the browser to miss its paint deadline.

At 60fps, each frame has 16.67ms. If a frame takes 25ms, the browser skips a paint and the user sees the same pixels for 33ms instead of 16.67ms. This manifests as a momentary freeze or stutter.

**Common causes:**
1. **Garbage collection pauses**: Creating many objects per frame leads to frequent GC pauses (5-50ms)
2. **Main thread blocking**: Synchronous file reads, long computations
3. **Layout thrashing**: Reading DOM layout properties and then writing styles in a loop
4. **Texture uploads**: Uploading a large texture blocks the GPU pipeline
5. **Shader compilation**: First use of a new shader causes a compile stall
6. **Too many draw calls**: Exceeding the GPU's per-frame capacity

**Diagnosis tools:**
1. **Chrome DevTools Performance tab**: Record a few seconds of gameplay. Look for long tasks (red bars), forced reflow, and long frames.
2. **`performance.measure()`**: Bracket sections of your code:
   ```typescript
   performance.mark('physics-start');
   physicsUpdate();
   performance.mark('physics-end');
   performance.measure('physics', 'physics-start', 'physics-end');
   ```
3. **In-game FPS counter**: Show 1% low frame time — this reveals jank that average FPS hides.
4. **Frame time graph**: Plot frame times over the last 120 frames. Spikes are visible jank.

**Prevention:**
- Pre-allocate and reuse objects (object pooling)
- Use typed arrays for hot data (no GC overhead)
- Warm up shaders and upload textures during loading
- Amortize expensive work across multiple frames
- Profile regularly — jank creeps in gradually
