# 07 - Input Handling & User Interaction

## Table of Contents

1. [Touch Events](#touch-events)
2. [Pointer Events (Recommended)](#pointer-events)
3. [Mouse Events](#mouse-events)
4. [Coordinate Conversion](#coordinate-conversion)
5. [Gesture Recognition](#gesture-recognition)
6. [Keyboard Input](#keyboard-input)
7. [Gamepad API](#gamepad-api)
8. [Virtual Controls](#virtual-controls)
9. [Input Buffering](#input-buffering)
10. [Input Prediction and Smoothing](#input-prediction-and-smoothing)
11. [Accessibility](#accessibility)
12. [Cross-Device Considerations](#cross-device-considerations)
13. [Preventing Default Browser Behaviors](#preventing-default-browser-behaviors)
14. [Playable Ad Input Specifics](#playable-ad-input-specifics)
15. [Interview Questions](#interview-questions)

---

## Touch Events

Touch events are the native mobile input API. They fire on touch screens
and provide information about each finger touching the screen.

### Basic Touch Events

```typescript
const canvas = document.getElementById('game') as HTMLCanvasElement;

canvas.addEventListener('touchstart', (e: TouchEvent) => {
  e.preventDefault(); // Prevent scrolling
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    handleTouchStart(touch.identifier, touch.clientX, touch.clientY);
  }
});

canvas.addEventListener('touchmove', (e: TouchEvent) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    handleTouchMove(touch.identifier, touch.clientX, touch.clientY);
  }
});

canvas.addEventListener('touchend', (e: TouchEvent) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    handleTouchEnd(touch.identifier, touch.clientX, touch.clientY);
  }
});

canvas.addEventListener('touchcancel', (e: TouchEvent) => {
  // Treat cancel as end - happens when system takes over (notification, etc.)
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    handleTouchEnd(touch.identifier, touch.clientX, touch.clientY);
  }
});
```

### TouchEvent Properties

```
TouchEvent
  ├── touches        - ALL current touches on screen
  ├── targetTouches  - Touches on THIS element
  ├── changedTouches - Touches that CHANGED in this event
  └── Each Touch:
      ├── identifier  - Unique ID for this finger (persists across move/end)
      ├── clientX/Y   - Position relative to viewport
      ├── pageX/Y     - Position relative to document
      ├── screenX/Y   - Position relative to screen
      ├── target       - Element that received the initial touchstart
      ├── radiusX/Y    - Touch contact area
      └── force        - Pressure (0-1, if supported)
```

### Multi-Touch Tracking

```typescript
interface TrackedTouch {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
}

class MultiTouchTracker {
  private activeTouches: Map<number, TrackedTouch> = new Map();

  onTouchStart(id: number, x: number, y: number): void {
    this.activeTouches.set(id, {
      id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      startTime: performance.now(),
    });
  }

  onTouchMove(id: number, x: number, y: number): void {
    const touch = this.activeTouches.get(id);
    if (touch) {
      // Return new object instead of mutating
      this.activeTouches.set(id, {
        ...touch,
        currentX: x,
        currentY: y,
      });
    }
  }

  onTouchEnd(id: number): TrackedTouch | undefined {
    const touch = this.activeTouches.get(id);
    this.activeTouches.delete(id);
    return touch;
  }

  getTouchCount(): number {
    return this.activeTouches.size;
  }

  getTouch(id: number): TrackedTouch | undefined {
    return this.activeTouches.get(id);
  }

  getAllTouches(): readonly TrackedTouch[] {
    return Array.from(this.activeTouches.values());
  }
}
```

---

## Pointer Events (Recommended)

PointerEvent is the **recommended** unified input API. It handles mouse, touch,
and stylus with a single set of event listeners.

### Why Pointer Events Are Better

```
Touch Events:  touchstart, touchmove, touchend      → Mobile only
Mouse Events:  mousedown, mousemove, mouseup         → Desktop only
Pointer Events: pointerdown, pointermove, pointerup  → BOTH + stylus + pen
```

### Basic Pointer Event Handling

```typescript
const canvas = document.getElementById('game') as HTMLCanvasElement;

// Capture pointer to receive events even when cursor leaves element
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);

  handleInputStart(e.pointerId, e.clientX, e.clientY, e.pointerType);
});

canvas.addEventListener('pointermove', (e: PointerEvent) => {
  handleInputMove(e.pointerId, e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e: PointerEvent) => {
  canvas.releasePointerCapture(e.pointerId);
  handleInputEnd(e.pointerId, e.clientX, e.clientY);
});

canvas.addEventListener('pointercancel', (e: PointerEvent) => {
  canvas.releasePointerCapture(e.pointerId);
  handleInputEnd(e.pointerId, e.clientX, e.clientY);
});
```

### PointerEvent Properties

```typescript
interface PointerEventInfo {
  pointerId: number; // Unique identifier (like touch.identifier)
  pointerType: string; // "mouse", "touch", "pen"
  clientX: number;
  clientY: number;
  pressure: number; // 0-1 (0.5 for mouse buttons, variable for touch/pen)
  tiltX: number; // Pen tilt (-90 to 90)
  tiltY: number;
  width: number; // Contact area width
  height: number; // Contact area height
  isPrimary: boolean; // Is this the primary pointer?
}
```

### Unified Input Manager

```typescript
interface InputState {
  readonly isDown: boolean;
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  readonly pointerId: number;
  readonly pointerType: string;
}

class InputManager {
  private canvas: HTMLCanvasElement;
  private pointers: Map<number, InputState> = new Map();
  private callbacks: {
    onStart?: (state: InputState) => void;
    onMove?: (state: InputState) => void;
    onEnd?: (state: InputState) => void;
  } = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupListeners();
  }

  on(
    event: 'start' | 'move' | 'end',
    callback: (state: InputState) => void
  ): void {
    if (event === 'start') this.callbacks.onStart = callback;
    if (event === 'move') this.callbacks.onMove = callback;
    if (event === 'end') this.callbacks.onEnd = callback;
  }

  private setupListeners(): void {
    // Disable touch actions on canvas (prevents browser gestures)
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    // Prevent context menu on long press
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);

    const state: InputState = {
      isDown: true,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };

    this.pointers.set(e.pointerId, state);
    this.callbacks.onStart?.(state);
  }

  private onPointerMove(e: PointerEvent): void {
    const existing = this.pointers.get(e.pointerId);
    if (!existing) return;

    const state: InputState = {
      ...existing,
      x: e.clientX,
      y: e.clientY,
    };

    this.pointers.set(e.pointerId, state);
    this.callbacks.onMove?.(state);
  }

  private onPointerUp(e: PointerEvent): void {
    const existing = this.pointers.get(e.pointerId);
    if (!existing) return;

    this.canvas.releasePointerCapture(e.pointerId);

    const state: InputState = {
      ...existing,
      isDown: false,
      x: e.clientX,
      y: e.clientY,
    };

    this.pointers.delete(e.pointerId);
    this.callbacks.onEnd?.(state);
  }

  getPrimaryPointer(): InputState | undefined {
    for (const [, state] of this.pointers) {
      return state; // Return first active pointer
    }
    return undefined;
  }

  getPointerCount(): number {
    return this.pointers.size;
  }

  getAllPointers(): readonly InputState[] {
    return Array.from(this.pointers.values());
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }
}
```

---

## Mouse Events

For desktop-only games or when you need mouse-specific features:

```typescript
canvas.addEventListener('mousedown', (e: MouseEvent) => {
  // e.button: 0=left, 1=middle, 2=right
  // e.buttons: bitmask of all pressed buttons
  handleMouseDown(e.clientX, e.clientY, e.button);
});

canvas.addEventListener('mousemove', (e: MouseEvent) => {
  // e.movementX/Y: delta since last move (useful for FPS camera)
  handleMouseMove(e.clientX, e.clientY, e.movementX, e.movementY);
});

canvas.addEventListener('mouseup', (e: MouseEvent) => {
  handleMouseUp(e.clientX, e.clientY, e.button);
});

// Mouse wheel for zoom
canvas.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    // e.deltaY: positive = scroll down, negative = scroll up
    // e.deltaMode: 0=pixels, 1=lines, 2=pages
    handleZoom(e.deltaY, e.clientX, e.clientY);
  },
  { passive: false }
);
```

---

## Coordinate Conversion

One of the most common sources of bugs. You need to convert between three
coordinate systems:

```
Screen Space:  (e.clientX, e.clientY) — relative to browser viewport
Canvas Space:  Position on the canvas element (accounting for CSS scaling)
World Space:   Position in the game world (accounting for camera/scroll)
```

### Screen to Canvas

```typescript
function screenToCanvas(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();

  // Account for CSS scaling (canvas.width may differ from rect.width)
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (screenX - rect.left) * scaleX,
    y: (screenY - rect.top) * scaleY,
  };
}
```

### Canvas to World

```typescript
interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

function canvasToWorld(
  canvasX: number,
  canvasY: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  // Center of canvas
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // Offset from center
  let dx = canvasX - cx;
  let dy = canvasY - cy;

  // Undo zoom
  dx /= camera.zoom;
  dy /= camera.zoom;

  // Undo rotation
  if (camera.rotation !== 0) {
    const cos = Math.cos(-camera.rotation);
    const sin = Math.sin(-camera.rotation);
    const rdx = dx * cos - dy * sin;
    const rdy = dx * sin + dy * cos;
    dx = rdx;
    dy = rdy;
  }

  // Translate by camera position
  return {
    x: dx + camera.x,
    y: dy + camera.y,
  };
}

// Combined: screen event → world position
function screenToWorld(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement,
  camera: Camera
): { x: number; y: number } {
  const canvasPos = screenToCanvas(screenX, screenY, canvas);
  return canvasToWorld(
    canvasPos.x,
    canvasPos.y,
    camera,
    canvas.width,
    canvas.height
  );
}
```

### DPR (Device Pixel Ratio) Handling

High-DPI screens require special handling:

```typescript
function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  const dpr = window.devicePixelRatio || 1;

  // Set display size (CSS pixels)
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  // Set actual size in memory (physical pixels)
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  // Scale context to match
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}
```

When converting coordinates with DPR:

```typescript
function screenToCanvasHiDPI(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  return {
    x: (screenX - rect.left) * dpr,
    y: (screenY - rect.top) * dpr,
  };
}
```

---

## Gesture Recognition

### Gesture State Machine

```typescript
type GestureType =
  | 'none'
  | 'tap'
  | 'doubletap'
  | 'longpress'
  | 'swipe'
  | 'drag'
  | 'pinch'
  | 'rotate';

interface GestureState {
  type: GestureType;
  startTime: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pointers: Map<
    number,
    { x: number; y: number; startX: number; startY: number }
  >;
}

const GESTURE_CONFIG = {
  TAP_MAX_DURATION: 300, // ms
  TAP_MAX_DISTANCE: 10, // pixels
  DOUBLE_TAP_GAP: 300, // ms between taps
  LONG_PRESS_DURATION: 500, // ms
  SWIPE_MIN_DISTANCE: 50, // pixels
  SWIPE_MIN_VELOCITY: 0.3, // pixels/ms
  DRAG_MIN_DISTANCE: 10, // pixels before drag starts
} as const;
```

### Tap Detection

```typescript
interface TapDetector {
  lastTapTime: number;
  lastTapX: number;
  lastTapY: number;
}

function detectTap(
  detector: TapDetector,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startTime: number,
  endTime: number
): { type: 'tap' | 'doubletap' | 'none'; detector: TapDetector } {
  const duration = endTime - startTime;
  const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

  if (
    duration > GESTURE_CONFIG.TAP_MAX_DURATION ||
    distance > GESTURE_CONFIG.TAP_MAX_DISTANCE
  ) {
    return { type: 'none', detector };
  }

  // Check for double tap
  const timeSinceLastTap = startTime - detector.lastTapTime;
  const distFromLastTap = Math.sqrt(
    (startX - detector.lastTapX) ** 2 + (startY - detector.lastTapY) ** 2
  );

  if (
    timeSinceLastTap < GESTURE_CONFIG.DOUBLE_TAP_GAP &&
    distFromLastTap < 30
  ) {
    return {
      type: 'doubletap',
      detector: { ...detector, lastTapTime: 0, lastTapX: 0, lastTapY: 0 },
    };
  }

  return {
    type: 'tap',
    detector: {
      ...detector,
      lastTapTime: endTime,
      lastTapX: endX,
      lastTapY: endY,
    },
  };
}
```

### Swipe Detection

```typescript
type SwipeDirection = 'left' | 'right' | 'up' | 'down';

interface SwipeResult {
  detected: boolean;
  direction: SwipeDirection | null;
  velocity: number;
  distance: number;
}

function detectSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startTime: number,
  endTime: number
): SwipeResult {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const duration = endTime - startTime;
  const velocity = distance / duration;

  if (
    distance < GESTURE_CONFIG.SWIPE_MIN_DISTANCE ||
    velocity < GESTURE_CONFIG.SWIPE_MIN_VELOCITY
  ) {
    return { detected: false, direction: null, velocity: 0, distance: 0 };
  }

  // Determine direction by dominant axis
  let direction: SwipeDirection;
  if (Math.abs(dx) > Math.abs(dy)) {
    direction = dx > 0 ? 'right' : 'left';
  } else {
    direction = dy > 0 ? 'down' : 'up';
  }

  return { detected: true, direction, velocity, distance };
}
```

### Long Press Detection

```typescript
class LongPressDetector {
  private timer: number | null = null;
  private callback: ((x: number, y: number) => void) | null = null;

  start(
    x: number,
    y: number,
    onLongPress: (x: number, y: number) => void
  ): void {
    this.cancel();
    this.callback = onLongPress;
    this.timer = window.setTimeout(() => {
      onLongPress(x, y);
      this.timer = null;
    }, GESTURE_CONFIG.LONG_PRESS_DURATION);
  }

  moved(x: number, y: number, startX: number, startY: number): void {
    const distance = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2);
    if (distance > GESTURE_CONFIG.TAP_MAX_DISTANCE) {
      this.cancel();
    }
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

### Pinch-to-Zoom

Requires tracking two fingers and measuring distance changes:

```typescript
interface PinchState {
  active: boolean;
  initialDistance: number;
  currentDistance: number;
  centerX: number;
  centerY: number;
  scale: number;
}

function calculatePinch(
  pointer1: { x: number; y: number },
  pointer2: { x: number; y: number },
  initialDistance: number
): PinchState {
  const dx = pointer2.x - pointer1.x;
  const dy = pointer2.y - pointer1.y;
  const currentDistance = Math.sqrt(dx * dx + dy * dy);

  return {
    active: true,
    initialDistance,
    currentDistance,
    centerX: (pointer1.x + pointer2.x) / 2,
    centerY: (pointer1.y + pointer2.y) / 2,
    scale: currentDistance / initialDistance,
  };
}
```

### Two-Finger Rotation

```typescript
interface RotationState {
  active: boolean;
  initialAngle: number;
  currentAngle: number;
  deltaAngle: number;
}

function calculateRotation(
  pointer1: { x: number; y: number },
  pointer2: { x: number; y: number },
  initialAngle: number
): RotationState {
  const currentAngle = Math.atan2(
    pointer2.y - pointer1.y,
    pointer2.x - pointer1.x
  );

  return {
    active: true,
    initialAngle,
    currentAngle,
    deltaAngle: currentAngle - initialAngle,
  };
}
```

### Drag and Drop

```typescript
interface DragState {
  active: boolean;
  targetId: string | null;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

class DragHandler {
  private state: DragState = {
    active: false,
    targetId: null,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  };

  private hitTest: (
    x: number,
    y: number
  ) => { id: string; x: number; y: number } | null;

  constructor(
    hitTest: (
      x: number,
      y: number
    ) => { id: string; x: number; y: number } | null
  ) {
    this.hitTest = hitTest;
  }

  onStart(x: number, y: number): DragState {
    const target = this.hitTest(x, y);
    if (!target) {
      return this.state;
    }

    this.state = {
      active: true,
      targetId: target.id,
      offsetX: x - target.x,
      offsetY: y - target.y,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };

    return this.state;
  }

  onMove(x: number, y: number): DragState {
    if (!this.state.active) return this.state;

    this.state = {
      ...this.state,
      currentX: x,
      currentY: y,
    };

    return this.state;
  }

  onEnd(): DragState {
    const finalState = { ...this.state, active: false };
    this.state = {
      active: false,
      targetId: null,
      offsetX: 0,
      offsetY: 0,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };
    return finalState;
  }

  getTargetPosition(): { x: number; y: number } | null {
    if (!this.state.active) return null;
    return {
      x: this.state.currentX - this.state.offsetX,
      y: this.state.currentY - this.state.offsetY,
    };
  }
}
```

### Complete Gesture Recognizer

```typescript
type GestureCallback = {
  onTap?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onSwipe?: (direction: SwipeDirection, velocity: number) => void;
  onDragStart?: (x: number, y: number) => void;
  onDragMove?: (x: number, y: number, dx: number, dy: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onPinch?: (scale: number, centerX: number, centerY: number) => void;
  onRotate?: (angle: number, centerX: number, centerY: number) => void;
};

class GestureRecognizer {
  private canvas: HTMLCanvasElement;
  private callbacks: GestureCallback;
  private pointers: Map<
    number,
    { x: number; y: number; startX: number; startY: number; startTime: number }
  > = new Map();
  private longPressTimer: number | null = null;
  private lastTapTime = 0;
  private isDragging = false;
  private initialPinchDistance = 0;
  private initialRotationAngle = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GestureCallback) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);

    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
    });

    if (this.pointers.size === 1) {
      // Single finger: start long press timer
      this.longPressTimer = window.setTimeout(() => {
        this.callbacks.onLongPress?.(e.clientX, e.clientY);
        this.longPressTimer = null;
      }, GESTURE_CONFIG.LONG_PRESS_DURATION);
    }

    if (this.pointers.size === 2) {
      // Two fingers: start pinch/rotate
      this.cancelLongPress();
      const pts = Array.from(this.pointers.values());
      this.initialPinchDistance = Math.sqrt(
        (pts[1].x - pts[0].x) ** 2 + (pts[1].y - pts[0].y) ** 2
      );
      this.initialRotationAngle = Math.atan2(
        pts[1].y - pts[0].y,
        pts[1].x - pts[0].x
      );
    }
  }

  private onMove(e: PointerEvent): void {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    this.pointers.set(e.pointerId, { ...pointer, x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1) {
      const dist = Math.sqrt(
        (e.clientX - pointer.startX) ** 2 + (e.clientY - pointer.startY) ** 2
      );

      if (dist > GESTURE_CONFIG.DRAG_MIN_DISTANCE) {
        this.cancelLongPress();

        if (!this.isDragging) {
          this.isDragging = true;
          this.callbacks.onDragStart?.(pointer.startX, pointer.startY);
        }

        this.callbacks.onDragMove?.(
          e.clientX,
          e.clientY,
          e.clientX - pointer.startX,
          e.clientY - pointer.startY
        );
      }
    }

    if (this.pointers.size === 2) {
      const pts = Array.from(this.pointers.values());
      const currentDist = Math.sqrt(
        (pts[1].x - pts[0].x) ** 2 + (pts[1].y - pts[0].y) ** 2
      );
      const currentAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const centerX = (pts[0].x + pts[1].x) / 2;
      const centerY = (pts[0].y + pts[1].y) / 2;

      this.callbacks.onPinch?.(
        currentDist / this.initialPinchDistance,
        centerX,
        centerY
      );
      this.callbacks.onRotate?.(
        currentAngle - this.initialRotationAngle,
        centerX,
        centerY
      );
    }
  }

  private onUp(e: PointerEvent): void {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    this.canvas.releasePointerCapture(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();

    if (this.isDragging) {
      this.isDragging = false;
      this.callbacks.onDragEnd?.(e.clientX, e.clientY);
      return;
    }

    // Check for tap
    const duration = performance.now() - pointer.startTime;
    const distance = Math.sqrt(
      (e.clientX - pointer.startX) ** 2 + (e.clientY - pointer.startY) ** 2
    );

    if (
      duration < GESTURE_CONFIG.TAP_MAX_DURATION &&
      distance < GESTURE_CONFIG.TAP_MAX_DISTANCE
    ) {
      const timeSinceLastTap = performance.now() - this.lastTapTime;
      if (timeSinceLastTap < GESTURE_CONFIG.DOUBLE_TAP_GAP) {
        this.callbacks.onDoubleTap?.(e.clientX, e.clientY);
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = performance.now();
        // Delay tap to allow double-tap detection
        setTimeout(() => {
          if (this.lastTapTime > 0) {
            this.callbacks.onTap?.(e.clientX, e.clientY);
          }
        }, GESTURE_CONFIG.DOUBLE_TAP_GAP);
      }
      return;
    }

    // Check for swipe
    const swipe = detectSwipe(
      pointer.startX,
      pointer.startY,
      e.clientX,
      e.clientY,
      pointer.startTime,
      performance.now()
    );

    if (swipe.detected && swipe.direction) {
      this.callbacks.onSwipe?.(swipe.direction, swipe.velocity);
    }
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
```

---

## Keyboard Input

Primarily for desktop/web games, not playable ads:

```typescript
class KeyboardManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set(); // Just pressed this frame
  private keysReleased: Set<string> = new Set(); // Just released this frame

  constructor() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);

      // Prevent default for game keys
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });

    // Handle tab/window focus loss
    window.addEventListener('blur', () => {
      this.keysDown.clear();
    });
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  // Call at end of each frame to clear one-frame states
  endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }
}
```

### key vs code

```
e.key  = "a"        → character produced (locale-dependent)
e.code = "KeyA"     → physical key on keyboard (locale-independent)

Use e.code for game controls (WASD works on any keyboard layout).
Use e.key for text input.
```

---

## Gamepad API

For games that support controllers:

```typescript
class GamepadManager {
  private gamepads: Map<number, Gamepad> = new Map();
  private deadZone = 0.15;

  constructor() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.gamepads.set(e.gamepad.index, e.gamepad);
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      this.gamepads.delete(e.gamepad.index);
    });
  }

  update(): void {
    // Must poll gamepads each frame (they don't fire events for buttons/axes)
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (pad) {
        this.gamepads.set(pad.index, pad);
      }
    }
  }

  getAxis(padIndex: number, axisIndex: number): number {
    const pad = this.gamepads.get(padIndex);
    if (!pad || axisIndex >= pad.axes.length) return 0;

    const value = pad.axes[axisIndex];
    // Apply dead zone
    return Math.abs(value) < this.deadZone ? 0 : value;
  }

  isButtonDown(padIndex: number, buttonIndex: number): boolean {
    const pad = this.gamepads.get(padIndex);
    if (!pad || buttonIndex >= pad.buttons.length) return false;
    return pad.buttons[buttonIndex].pressed;
  }

  getLeftStick(padIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(padIndex, 0),
      y: this.getAxis(padIndex, 1),
    };
  }

  getRightStick(padIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(padIndex, 2),
      y: this.getAxis(padIndex, 3),
    };
  }

  // Vibration (if supported)
  vibrate(
    padIndex: number,
    duration: number,
    weakMag: number,
    strongMag: number
  ): void {
    const pad = this.gamepads.get(padIndex);
    if (pad?.vibrationActuator) {
      pad.vibrationActuator.playEffect('dual-rumble', {
        duration,
        weakMagnitude: weakMag,
        strongMagnitude: strongMag,
      });
    }
  }
}
```

### Standard Gamepad Button Mapping

```
Index | Button
------|--------
0     | A / Cross
1     | B / Circle
2     | X / Square
3     | Y / Triangle
4     | Left Bumper (LB)
5     | Right Bumper (RB)
6     | Left Trigger (LT)
7     | Right Trigger (RT)
8     | Back / Select
9     | Start
10    | Left Stick Click
11    | Right Stick Click
12    | D-pad Up
13    | D-pad Down
14    | D-pad Left
15    | D-pad Right
16    | Home / Guide
```

---

## Virtual Controls

### On-Screen Joystick

Essential for mobile games that need analog directional input:

```typescript
interface JoystickState {
  active: boolean;
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
  dirX: number; // Normalized -1 to 1
  dirY: number; // Normalized -1 to 1
  magnitude: number; // 0 to 1
  angle: number; // Radians
}

class VirtualJoystick {
  private state: JoystickState;
  private maxRadius: number;
  private deadZone: number;
  private pointerId: number | null = null;

  constructor(
    private baseX: number,
    private baseY: number,
    maxRadius = 50,
    deadZone = 0.1
  ) {
    this.maxRadius = maxRadius;
    this.deadZone = deadZone;
    this.state = this.createIdleState();
  }

  private createIdleState(): JoystickState {
    return {
      active: false,
      baseX: this.baseX,
      baseY: this.baseY,
      knobX: this.baseX,
      knobY: this.baseY,
      dirX: 0,
      dirY: 0,
      magnitude: 0,
      angle: 0,
    };
  }

  onPointerDown(pointerId: number, x: number, y: number): boolean {
    // Check if touch is in joystick area
    const dx = x - this.baseX;
    const dy = y - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.maxRadius * 2) return false; // Too far from base

    this.pointerId = pointerId;
    this.updatePosition(x, y);
    return true;
  }

  onPointerMove(pointerId: number, x: number, y: number): void {
    if (this.pointerId !== pointerId) return;
    this.updatePosition(x, y);
  }

  onPointerUp(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.pointerId = null;
    this.state = this.createIdleState();
  }

  private updatePosition(x: number, y: number): void {
    const dx = x - this.baseX;
    const dy = y - this.baseY;
    let dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to max radius
    const clampedDist = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = this.baseX + Math.cos(angle) * clampedDist;
    const knobY = this.baseY + Math.sin(angle) * clampedDist;

    // Normalize magnitude (0 to 1)
    let magnitude = clampedDist / this.maxRadius;

    // Apply dead zone
    if (magnitude < this.deadZone) {
      magnitude = 0;
    } else {
      // Remap so dead zone edge maps to 0
      magnitude = (magnitude - this.deadZone) / (1 - this.deadZone);
    }

    this.state = {
      active: true,
      baseX: this.baseX,
      baseY: this.baseY,
      knobX,
      knobY,
      dirX: magnitude > 0 ? Math.cos(angle) : 0,
      dirY: magnitude > 0 ? Math.sin(angle) : 0,
      magnitude,
      angle,
    };
  }

  getState(): JoystickState {
    return this.state;
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Base circle
    ctx.beginPath();
    ctx.arc(this.state.baseX, this.state.baseY, this.maxRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();

    // Knob
    ctx.beginPath();
    ctx.arc(
      this.state.knobX,
      this.state.knobY,
      this.maxRadius * 0.4,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = this.state.active
      ? 'rgba(255, 255, 255, 0.6)'
      : 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
  }
}
```

### Dynamic Joystick (Appears at Touch Point)

A common pattern where the joystick base moves to wherever the user first touches:

```typescript
class DynamicJoystick extends VirtualJoystick {
  private zone: { x: number; y: number; width: number; height: number };

  constructor(
    zone: { x: number; y: number; width: number; height: number },
    maxRadius = 50
  ) {
    super(0, 0, maxRadius);
    this.zone = zone;
  }

  onPointerDown(pointerId: number, x: number, y: number): boolean {
    // Check if touch is in the joystick zone (e.g., left half of screen)
    if (
      x >= this.zone.x &&
      x <= this.zone.x + this.zone.width &&
      y >= this.zone.y &&
      y <= this.zone.y + this.zone.height
    ) {
      // Move base to touch point
      this.baseX = x;
      this.baseY = y;
      return super.onPointerDown(pointerId, x, y);
    }
    return false;
  }
}
```

### Virtual D-Pad

```typescript
type DPadDirection = 'up' | 'down' | 'left' | 'right' | 'none';

class VirtualDPad {
  private centerX: number;
  private centerY: number;
  private size: number;
  private pressed: Set<DPadDirection> = new Set();

  constructor(centerX: number, centerY: number, size = 80) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.size = size;
  }

  getDirection(x: number, y: number): DPadDirection {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.size * 0.2) return 'none'; // Dead zone in center

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Four-directional
    if (angle >= -45 && angle < 45) return 'right';
    if (angle >= 45 && angle < 135) return 'down';
    if (angle >= -135 && angle < -45) return 'up';
    return 'left';
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.size;
    const cx = this.centerX;
    const cy = this.centerY;

    // Draw D-pad shape (cross)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';

    // Horizontal bar
    ctx.fillRect(cx - s, cy - s / 3, s * 2, (s * 2) / 3);
    // Vertical bar
    ctx.fillRect(cx - s / 3, cy - s, (s * 2) / 3, s * 2);

    // Highlight pressed directions
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    if (this.pressed.has('up'))
      ctx.fillRect(cx - s / 3, cy - s, (s * 2) / 3, (s * 2) / 3);
    if (this.pressed.has('down'))
      ctx.fillRect(cx - s / 3, cy + s / 3, (s * 2) / 3, (s * 2) / 3);
    if (this.pressed.has('left'))
      ctx.fillRect(cx - s, cy - s / 3, (s * 2) / 3, (s * 2) / 3);
    if (this.pressed.has('right'))
      ctx.fillRect(cx + s / 3, cy - s / 3, (s * 2) / 3, (s * 2) / 3);
  }
}
```

---

## Input Buffering

### Command Queue for Fighting Games

Input buffering allows players to queue inputs slightly before they're valid:

```typescript
interface InputCommand {
  type: string;
  timestamp: number;
}

class InputBuffer {
  private buffer: InputCommand[] = [];
  private bufferWindow: number; // milliseconds

  constructor(bufferWindow = 150) {
    this.bufferWindow = bufferWindow;
  }

  push(command: InputCommand): void {
    this.buffer = [...this.buffer, command];
  }

  // Check if a specific command was buffered within the window
  consume(type: string, currentTime: number): InputCommand | null {
    const index = this.buffer.findIndex(
      (cmd) =>
        cmd.type === type && currentTime - cmd.timestamp < this.bufferWindow
    );

    if (index === -1) return null;

    const command = this.buffer[index];
    this.buffer = [
      ...this.buffer.slice(0, index),
      ...this.buffer.slice(index + 1),
    ];
    return command;
  }

  // Remove expired commands
  cleanup(currentTime: number): void {
    this.buffer = this.buffer.filter(
      (cmd) => currentTime - cmd.timestamp < this.bufferWindow
    );
  }
}

// Usage in a platformer
class PlayerController {
  private inputBuffer = new InputBuffer(100);

  handleInput(action: string): void {
    this.inputBuffer.push({ type: action, timestamp: performance.now() });
  }

  update(): void {
    const now = performance.now();

    // Player just landed - check if jump was buffered
    if (this.justLanded) {
      const jumpCmd = this.inputBuffer.consume('jump', now);
      if (jumpCmd) {
        this.jump(); // Execute buffered jump
      }
    }

    this.inputBuffer.cleanup(now);
  }

  private justLanded = false;
  private jump(): void {
    /* jump logic */
  }
}
```

---

## Input Prediction and Smoothing

### Touch Smoothing

Raw touch input is noisy. Smooth it for drawing games or precise aiming:

```typescript
class InputSmoother {
  private history: Array<{ x: number; y: number; time: number }> = [];
  private maxHistorySize = 5;

  addSample(x: number, y: number): { x: number; y: number } {
    this.history = [
      ...this.history.slice(-(this.maxHistorySize - 1)),
      { x, y, time: performance.now() },
    ];

    // Weighted average - recent samples have more weight
    let totalWeight = 0;
    let smoothX = 0;
    let smoothY = 0;

    for (let i = 0; i < this.history.length; i++) {
      const weight = i + 1; // Linear weighting (newer = heavier)
      smoothX += this.history[i].x * weight;
      smoothY += this.history[i].y * weight;
      totalWeight += weight;
    }

    return {
      x: smoothX / totalWeight,
      y: smoothY / totalWeight,
    };
  }

  // Exponential moving average - simpler alternative
  static ema(
    current: { x: number; y: number },
    target: { x: number; y: number },
    factor = 0.3
  ): { x: number; y: number } {
    return {
      x: current.x + (target.x - current.x) * factor,
      y: current.y + (target.y - current.y) * factor,
    };
  }
}
```

---

## Accessibility

### Multiple Input Method Support

```typescript
class AccessibleInput {
  private inputManager: InputManager;
  private keyboardManager: KeyboardManager;
  private gamepadManager: GamepadManager;

  // Abstract game actions away from specific input methods
  getMovement(): { x: number; y: number } {
    // Try gamepad first
    const stick = this.gamepadManager.getLeftStick(0);
    if (Math.abs(stick.x) > 0.1 || Math.abs(stick.y) > 0.1) {
      return stick;
    }

    // Try keyboard
    let kx = 0;
    let ky = 0;
    if (
      this.keyboardManager.isDown('ArrowLeft') ||
      this.keyboardManager.isDown('KeyA')
    )
      kx -= 1;
    if (
      this.keyboardManager.isDown('ArrowRight') ||
      this.keyboardManager.isDown('KeyD')
    )
      kx += 1;
    if (
      this.keyboardManager.isDown('ArrowUp') ||
      this.keyboardManager.isDown('KeyW')
    )
      ky -= 1;
    if (
      this.keyboardManager.isDown('ArrowDown') ||
      this.keyboardManager.isDown('KeyS')
    )
      ky += 1;

    if (kx !== 0 || ky !== 0) {
      // Normalize diagonal movement
      const len = Math.sqrt(kx * kx + ky * ky);
      return { x: kx / len, y: ky / len };
    }

    // Try touch/pointer
    const pointer = this.inputManager.getPrimaryPointer();
    if (pointer) {
      // Could be a virtual joystick or direct touch
      return { x: 0, y: 0 }; // Placeholder
    }

    return { x: 0, y: 0 };
  }
}
```

### Reduced Motion Support

```typescript
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Use to disable screen shake, reduce particle effects, etc.
if (!prefersReducedMotion()) {
  applyScreenShake(intensity);
}
```

---

## Cross-Device Considerations

### Hover States on Mobile

Mobile devices don't have hover. CSS `:hover` can "stick" on mobile after tap:

```typescript
// Detect if device supports hover
function supportsHover(): boolean {
  return window.matchMedia('(hover: hover)').matches;
}

// Only add hover effects on devices that support it
if (supportsHover()) {
  element.addEventListener('mouseenter', showTooltip);
  element.addEventListener('mouseleave', hideTooltip);
}
```

### Force Touch / 3D Touch (iOS)

```typescript
canvas.addEventListener('touchforcechange', (e: TouchEvent) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const force = touch.force; // 0 to 1
    handlePressure(touch.identifier, force);
  }
});
```

### Device Orientation (Tilt Controls)

```typescript
interface TiltInput {
  x: number; // Left/right tilt (-1 to 1)
  y: number; // Forward/back tilt (-1 to 1)
}

class TiltController {
  private enabled = false;
  private tilt: TiltInput = { x: 0, y: 0 };
  private calibration = { beta: 0, gamma: 0 };

  async enable(): Promise<boolean> {
    // iOS 13+ requires permission
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      'requestPermission' in DeviceOrientationEvent
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as any
        ).requestPermission();
        if (permission !== 'granted') return false;
      } catch {
        return false;
      }
    }

    window.addEventListener(
      'deviceorientation',
      (e: DeviceOrientationEvent) => {
        if (e.beta === null || e.gamma === null) return;

        if (!this.enabled) {
          // Calibrate on first reading
          this.calibration = { beta: e.beta, gamma: e.gamma };
          this.enabled = true;
        }

        // Normalize to -1 to 1 (assuming ~30 degree max tilt)
        this.tilt = {
          x: Math.max(-1, Math.min(1, (e.gamma - this.calibration.gamma) / 30)),
          y: Math.max(-1, Math.min(1, (e.beta - this.calibration.beta) / 30)),
        };
      }
    );

    return true;
  }

  getTilt(): TiltInput {
    return this.tilt;
  }

  recalibrate(): void {
    this.enabled = false; // Will recalibrate on next reading
  }
}
```

---

## Preventing Default Browser Behaviors

Critical for games, especially in playable ads running in webviews:

```typescript
function preventDefaultBehaviors(element: HTMLElement): void {
  // Prevent scroll
  element.style.touchAction = 'none';
  element.style.overscrollBehavior = 'none';

  // Prevent text selection
  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';

  // Prevent callout (long press popup on iOS)
  (element.style as any).webkitTouchCallout = 'none';

  // Prevent magnifying glass on iOS
  (element.style as any).webkitUserSelect = 'none';

  // Prevent pull-to-refresh
  document.body.style.overscrollBehavior = 'none';

  // Prevent context menu
  element.addEventListener('contextmenu', (e) => e.preventDefault());

  // Prevent double-tap zoom
  element.addEventListener('touchend', (e) => {
    e.preventDefault();
  });

  // Prevent pinch zoom on the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());

  // Prevent scroll on touch move
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.target === element || element.contains(e.target as Node)) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}
```

### Meta Tags for Mobile

```html
<!-- Prevent zoom and scaling -->
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
/>

<!-- iOS specific -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta
  name="apple-mobile-web-app-status-bar-style"
  content="black-translucent"
/>

<!-- Android specific -->
<meta name="mobile-web-app-capable" content="yes" />
```

---

## Playable Ad Input Specifics

### No Keyboard Assumption

Playable ads run on mobile devices. Never rely on keyboard input.

```typescript
// WRONG: Keyboard-based game controls
window.addEventListener('keydown', handleKeyboard);

// CORRECT: Touch/pointer-based controls only
canvas.addEventListener('pointerdown', handleTouch);
canvas.addEventListener('pointermove', handleTouch);
canvas.addEventListener('pointerup', handleTouch);
```

### Limited Screen Real Estate

Mobile screens are small. Input areas must be large and forgiving:

```typescript
const TOUCH_CONFIG = {
  // Minimum touch target size (Apple HIG: 44pt, Google MD: 48dp)
  MIN_TARGET_SIZE: 44,

  // Extra hit area around interactive elements
  HIT_AREA_PADDING: 12,

  // Maximum distance from target center that still counts as a hit
  FORGIVENESS_RADIUS: 30,
} as const;

function isHit(
  touchX: number,
  touchY: number,
  target: { x: number; y: number; width: number; height: number }
): boolean {
  // Expand target by padding for easier tapping
  const expanded = {
    x: target.x - TOUCH_CONFIG.HIT_AREA_PADDING,
    y: target.y - TOUCH_CONFIG.HIT_AREA_PADDING,
    width: target.width + TOUCH_CONFIG.HIT_AREA_PADDING * 2,
    height: target.height + TOUCH_CONFIG.HIT_AREA_PADDING * 2,
  };

  return (
    touchX >= expanded.x &&
    touchX <= expanded.x + expanded.width &&
    touchY >= expanded.y &&
    touchY <= expanded.y + expanded.height
  );
}
```

### Tutorial Hand Animation

Most playable ads show an animated hand/finger to teach the first interaction:

```typescript
interface TutorialHand {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  visible: boolean;
  animationPhase: 'idle' | 'move' | 'tap' | 'swipe';
  timer: number;
}

function updateTutorialHand(hand: TutorialHand, dt: number): TutorialHand {
  const newTimer = hand.timer + dt;

  switch (hand.animationPhase) {
    case 'idle': {
      // Pulse/bounce animation at start position
      if (newTimer > 1.0) {
        return { ...hand, animationPhase: 'tap', timer: 0 };
      }
      return { ...hand, timer: newTimer };
    }

    case 'tap': {
      // Scale down (press) then scale up (release)
      if (newTimer > 0.5) {
        return { ...hand, animationPhase: 'idle', timer: 0 };
      }
      return { ...hand, timer: newTimer };
    }

    case 'swipe': {
      // Move from start to target
      const progress = Math.min(newTimer / 0.8, 1);
      const eased = easeOutCubic(progress);
      return {
        ...hand,
        x: hand.x + (hand.targetX - hand.x) * eased,
        y: hand.y + (hand.targetY - hand.y) * eased,
        timer: newTimer,
        animationPhase: progress >= 1 ? 'idle' : 'swipe',
      };
    }

    default:
      return { ...hand, timer: newTimer };
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
```

### Auto-Play on Idle

If the user doesn't interact within ~3 seconds, auto-play to show them what to do:

```typescript
class IdleDetector {
  private lastInteractionTime: number;
  private idleThreshold: number;
  private autoPlayStarted: boolean;

  constructor(idleThreshold = 3000) {
    this.lastInteractionTime = performance.now();
    this.idleThreshold = idleThreshold;
    this.autoPlayStarted = false;
  }

  recordInteraction(): void {
    this.lastInteractionTime = performance.now();
    this.autoPlayStarted = false;
  }

  update(): boolean {
    if (this.autoPlayStarted) return false;

    const idleTime = performance.now() - this.lastInteractionTime;
    if (idleTime > this.idleThreshold) {
      this.autoPlayStarted = true;
      return true; // Trigger auto-play
    }

    return false;
  }
}
```

---

## Interview Questions

### Q1: Why should you prefer Pointer Events over Touch Events for game input?

**Answer**: Pointer Events unify mouse, touch, and pen input into a single API.
Benefits include:

1. **One codebase**: A single set of event listeners handles mouse (desktop),
   touch (mobile), and pen (tablet) input.
2. **Pointer capture**: `setPointerCapture()` ensures you receive events even when
   the pointer leaves the element, which is crucial for drag operations.
3. **Extra data**: Pressure, tilt, width/height of contact area.
4. **Better browser support**: Supported in all modern browsers. Touch Events
   are not supported in IE/Edge legacy.
5. **Simpler multi-pointer tracking**: Each pointer has a unique `pointerId` that
   persists across events, making multi-touch tracking straightforward.

The only reason to also listen for touch events is if you need `touchcancel`
behavior that differs from `pointercancel`, or if targeting very old browsers.

### Q2: How do you convert screen coordinates to game world coordinates?

**Answer**: Three-step conversion:

1. **Screen to Canvas**: Subtract the canvas element's bounding rectangle offset,
   then scale by the ratio of `canvas.width / rect.width` (to account for CSS scaling
   and device pixel ratio).

2. **Canvas to World**: Apply the inverse of the camera transform. If the camera
   has position (cx, cy), zoom z, and rotation r, then:

   - Subtract canvas center to get offset from center
   - Divide by zoom
   - Rotate by -r
   - Add camera position

3. **DPR consideration**: On high-DPI screens, the canvas backing store may be
   2x or 3x the CSS size. Multiply by `devicePixelRatio` when converting.

This is one of the most common sources of input bugs, especially when the canvas
is resized, scaled with CSS, or when a camera/viewport system is involved.

### Q3: Implement swipe detection. What parameters matter?

**Answer**: Swipe detection requires:

1. Record start position and time on `pointerdown`
2. Record end position and time on `pointerup`
3. Calculate distance and velocity (distance / time)
4. Thresholds:
   - **Minimum distance**: ~50px (distinguish swipe from tap)
   - **Minimum velocity**: ~0.3 px/ms (distinguish swipe from slow drag)
   - **Maximum duration**: ~500ms (optional, prevents slow gestures counting)
5. Direction: Compare `|dx|` vs `|dy|`. Dominant axis determines direction.
   Use `Math.atan2` for more nuanced angle-based detection.

Edge cases to handle:

- Very fast flicks (short distance but high velocity)
- Diagonal swipes (do you want 4-directional or 8-directional?)
- Swipes that change direction mid-gesture

### Q4: How do you prevent all default browser behaviors in a game canvas?

**Answer**: Multiple techniques are needed:

1. **CSS `touch-action: none`** on the canvas: prevents browser handling of touch
   gestures (scroll, zoom, swipe navigation).
2. **`e.preventDefault()`** in touch/pointer handlers.
3. **`contextmenu` event prevention**: prevents right-click/long-press menu.
4. **`overscroll-behavior: none`** on body: prevents pull-to-refresh.
5. **Viewport meta tag**: `user-scalable=no, maximum-scale=1.0` prevents pinch zoom.
6. **`-webkit-touch-callout: none`** (iOS): prevents the callout on long press.
7. **`user-select: none`**: prevents text selection.
8. **`gesturestart/gesturechange/gestureend` prevention** (Safari): prevents Safari's
   gesture recognition.

In playable ads, this is especially important because the ad runs inside a webview
that may have its own gesture handling. All default behaviors must be disabled to
prevent the game from being interrupted.

### Q5: Design an input system for a "match-3" playable ad.

**Answer**: Match-3 (like Candy Crush) needs:

1. **Input type**: Pointer events (unified mouse + touch).
2. **Gesture**: Swipe on a grid cell. Detect swipe direction (up/down/left/right)
   to determine which adjacent cell to swap with.
3. **Hit detection**: Convert touch position to grid coordinates
   (`col = Math.floor(x / cellSize)`, `row = Math.floor(y / cellSize)`).
4. **State machine**:
   - `idle`: waiting for touch
   - `selecting`: finger is down on a cell
   - `swiping`: finger has moved enough to determine direction
   - `animating`: swap animation playing (input blocked)
   - `resolving`: matches being cleared (input blocked)
5. **Feedback**: Highlight selected cell on touch. Show visual indicator of swipe direction.
6. **Forgiveness**: If swipe is ambiguous (diagonal), snap to the closest cardinal direction.
   If swipe is too short, treat as a tap (select/deselect).
7. **Tutorial**: Animated hand showing a swipe on the first obvious match.

### Q6: What is input buffering and why is it important?

**Answer**: Input buffering stores player inputs in a queue so they can be executed
when the game state allows, even if the input arrived slightly early.

**Example**: In a platformer, the player presses jump 50ms before landing. Without
buffering, the jump is lost because the player wasn't grounded when they pressed it.
With a 100ms input buffer, the jump command is stored and executed the moment the
player lands.

**Implementation**: Maintain a list of recent inputs with timestamps. When checking
for input, look for matching commands within the buffer window (typically 50-150ms).
Consumed commands are removed from the buffer. Expired commands are cleaned up.

**Why it matters**: Without input buffering, games feel "unresponsive" even though
they run at 60fps. Players press buttons slightly before the action is valid, and
if those presses are ignored, the game feels like it's dropping inputs.

### Q7: How would you implement a virtual joystick for a mobile game?

**Answer**: A virtual joystick has a base (static circle) and a knob (movable dot):

1. On `pointerdown` within the joystick zone, record the touch as the base center.
2. On `pointermove`, calculate the vector from base to current touch position.
3. Clamp the knob position to a maximum radius from the base.
4. Normalize the direction vector to get a -1 to 1 range for x and y.
5. Apply a dead zone (typically 10-15%) so small accidental movements are ignored.
6. On `pointerup`, return knob to center and set direction to (0, 0).

**Dynamic variant**: Base appears at wherever the player first touches (instead of
being fixed), which is more intuitive for most players.

**Key considerations**:

- Use `setPointerCapture` to keep receiving events if finger slides off the joystick
- Show clear visual feedback (base opacity, knob position)
- Return smooth normalized values (not pixel distances)
- Handle edge case where another finger is already on screen

### Q8: How do you handle coordinate conversion with a camera system?

**Answer**: The camera defines a view transform. To convert input coordinates
to world space:

1. Get canvas-relative position (accounting for CSS scaling and DPR)
2. Subtract canvas center to get position relative to viewport center
3. Apply inverse camera transforms in reverse order:
   - Divide by zoom to undo scaling
   - Rotate by negative camera angle to undo rotation
   - Add camera world position to undo translation

For rendering, the forward transform is applied in order: translate, rotate, scale.
For input, the inverse transform is applied in reverse: unscale, unrotate, untranslate.

Cache the camera inverse matrix if computing it every frame. In WebGL, this is
the inverse of the view-projection matrix. In Canvas2D, it's the inverse of the
cumulative `ctx.transform()`.

### Q9: What special input considerations exist for playable ads?

**Answer**:

1. **Touch only**: No keyboard, no gamepad. All input must be touch/pointer-based.
2. **One finger**: Most playable ads use single-finger input. Multi-touch adds
   complexity that isn't worth it for a 30-second experience.
3. **Large touch targets**: Minimum 44x44 points (Apple HIG). Ads run on all
   phone sizes, including small screens.
4. **No text instructions**: Use animated hand/finger to teach the interaction.
   The audience is global; don't rely on language.
5. **Instant feedback**: First touch must produce visible feedback immediately.
   Any delay and the user abandons the ad.
6. **Prevent all defaults**: Disable scroll, zoom, context menu, text selection.
   The ad must own all input within its webview.
7. **CTA button**: The "Install" / "Play Now" button must be easy to tap and
   should use `mraid.open(url)` or `dapi.openStoreUrl()`, not a regular link.
8. **Idle detection**: If user doesn't interact within 3 seconds, show auto-play
   or re-show the tutorial hint.

### Q10: How do you handle input in a game running at variable frame rates?

**Answer**: Input events fire independently of the game loop (they're browser events).
The challenge is synchronizing them with the game update:

1. **Event queue**: Store input events in a queue as they arrive. During each
   game update, process the entire queue.
2. **State polling**: Maintain a "current frame input state" object. Events update
   this state. The game loop reads the state each frame.
3. **Delta-based movement**: Never move based on "event fired" alone. Use the
   elapsed `dt` to scale movement. A touch drag that moves 100px in 16ms should
   produce the same game result as 100px in 33ms.
4. **Input timestamps**: Use `event.timeStamp` or `performance.now()` to timestamp
   inputs. This helps with gesture detection (swipe velocity) regardless of frame rate.
5. **One-frame flags**: For "just pressed" / "just released" detection, set flags
   in event handlers and clear them at the end of each game frame.
