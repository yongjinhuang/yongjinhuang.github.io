# HTML5 Canvas Fundamentals

## Table of Contents

1. [Canvas Element Setup & Sizing](#canvas-element-setup--sizing)
2. [2D Context API: Drawing Primitives](#2d-context-api-drawing-primitives)
3. [Fill & Stroke Styles, Gradients, Patterns](#fill--stroke-styles-gradients-patterns)
4. [Text Rendering](#text-rendering)
5. [Image Drawing & Sprite Extraction](#image-drawing--sprite-extraction)
6. [Pixel Manipulation](#pixel-manipulation)
7. [Canvas State & Transformations](#canvas-state--transformations)
8. [Compositing & Blending](#compositing--blending)
9. [Off-Screen Canvas & Double Buffering](#off-screen-canvas--double-buffering)
10. [OffscreenCanvas & Web Workers](#offscreencanvas--web-workers)
11. [Canvas vs SVG vs DOM Animation](#canvas-vs-svg-vs-dom-animation)
12. [Performance Tips](#performance-tips)
13. [Interview Questions & Answers](#interview-questions--answers)

---

## Canvas Element Setup & Sizing

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0,
        maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none; /* Prevent browser gestures */
    }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
  </script>
</body>
</html>
```

### CSS Dimensions vs Attribute Dimensions

This is one of the most common sources of confusion and bugs. The canvas has TWO independent size concepts:

```
┌──────────────────────────────────────────────┐
│                Canvas Sizing                  │
├──────────────────────────────────────────────┤
│                                              │
│  CSS Size (display size):                    │
│  canvas { width: 400px; height: 300px; }     │
│  → How large the canvas APPEARS on screen    │
│  → Set via CSS or style attribute            │
│                                              │
│  Attribute Size (drawing buffer size):       │
│  canvas.width = 800; canvas.height = 600;    │
│  → How many PIXELS the canvas actually has   │
│  → Set via HTML attributes or JS properties  │
│                                              │
│  If they differ → image gets stretched/      │
│  squished to fit the CSS dimensions          │
│                                              │
└──────────────────────────────────────────────┘
```

```javascript
// WRONG: Only setting CSS size
// This creates a 300x150 buffer (default) displayed at 800x600
canvas.style.width = '800px';
canvas.style.height = '600px';
// Result: blurry, stretched rendering

// CORRECT: Setting both
canvas.width = 800;   // Drawing buffer
canvas.height = 600;
canvas.style.width = '800px';  // Display size
canvas.style.height = '600px';
```

### Retina / HiDPI Display Support

Modern devices have a Device Pixel Ratio (DPR) > 1. Without handling this, canvas content appears blurry on retina displays.

```javascript
function setupCanvas(canvas) {
  // Get the DPR, cap at 2 for performance on playable ads
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Get the CSS display size
  const rect = canvas.getBoundingClientRect();

  // Set the drawing buffer to match physical pixels
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  // Scale the CSS display size
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  // Scale the context so drawing operations use CSS pixel coordinates
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return {
    ctx,
    width: rect.width,    // Use these for game coordinates
    height: rect.height,
    dpr
  };
}
```

**Why cap DPR at 2?**

```
DPR 1: 400x300 = 120,000 pixels
DPR 2: 800x600 = 480,000 pixels (4x work)
DPR 3: 1200x900 = 1,080,000 pixels (9x work)

For playable ads on mobile, DPR 3 is rarely worth the
performance cost. DPR 2 provides sharp enough rendering
while keeping GPU load manageable.
```

### Responsive Canvas Resizing

```javascript
function createResponsiveCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');

  let gameWidth = 0;
  let gameHeight = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(dpr, dpr);

    gameWidth = width;
    gameHeight = height;
  }

  // Resize on window resize and orientation change
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    // Delay to let the browser settle
    setTimeout(resize, 100);
  });

  // Initial setup
  resize();

  return { canvas, ctx, getWidth: () => gameWidth, getHeight: () => gameHeight };
}
```

### Handling Orientation in Playable Ads

```javascript
function handleOrientation(canvas, ctx) {
  const isPortrait = window.innerHeight > window.innerWidth;

  if (isPortrait) {
    // Design for portrait mode (most common for mobile ads)
    return {
      gameWidth: 360,
      gameHeight: 640,
      orientation: 'portrait'
    };
  }

  // For landscape: either rotate content or adapt layout
  return {
    gameWidth: 640,
    gameHeight: 360,
    orientation: 'landscape'
  };
}

// Alternative: Force portrait by rotating canvas in landscape
function forcePortrait(canvas, ctx) {
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isLandscape) {
    // Rotate the entire canvas context 90 degrees
    canvas.width = window.innerHeight * 2;  // Swapped
    canvas.height = window.innerWidth * 2;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-canvas.height / 2, -canvas.width / 2);
  }
}
```

---

## 2D Context API: Drawing Primitives

### Rectangles

```javascript
// Three rectangle methods (the only shape primitives built in)
ctx.fillRect(x, y, width, height);      // Filled rectangle
ctx.strokeRect(x, y, width, height);    // Outlined rectangle
ctx.clearRect(x, y, width, height);     // Clear (erase) rectangular area

// Example: Draw a filled rectangle with border
function drawBox(ctx, x, y, w, h, fillColor, strokeColor, lineWidth) {
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, w, h);

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth || 1;
    ctx.strokeRect(x, y, w, h);
  }
}

// Rounded rectangle (not natively supported until roundRect())
function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Modern browsers support roundRect() natively
// ctx.roundRect(x, y, w, h, [radius]);
```

### Arcs and Circles

```javascript
// Arc syntax
ctx.arc(centerX, centerY, radius, startAngle, endAngle, counterclockwise);

// Full circle
function drawCircle(ctx, x, y, radius, fillColor, strokeColor) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }
}

// Pie chart slice
function drawPieSlice(ctx, cx, cy, radius, startAngle, endAngle, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Ring / donut shape
function drawRing(ctx, cx, cy, innerRadius, outerRadius, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);        // Outer circle
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);   // Inner circle (counter-clockwise)
  ctx.fillStyle = color;
  ctx.fill();
}
```

### Paths and Lines

```javascript
// Path-based drawing
ctx.beginPath();          // Start a new path
ctx.moveTo(x, y);        // Move pen without drawing
ctx.lineTo(x, y);        // Draw line to point
ctx.closePath();          // Close the path (line back to start)
ctx.stroke();             // Draw the outline
ctx.fill();               // Fill the shape

// Line styling
ctx.lineWidth = 2;
ctx.lineCap = 'round';     // 'butt' (default), 'round', 'square'
ctx.lineJoin = 'round';    // 'miter' (default), 'round', 'bevel'
ctx.setLineDash([5, 3]);   // Dashed line: 5px dash, 3px gap
ctx.lineDashOffset = 0;    // Offset for dash pattern (animate for marching ants)

// Draw a triangle
function drawTriangle(ctx, x1, y1, x2, y2, x3, y3, color) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Draw a star
function drawStar(ctx, cx, cy, outerRadius, innerRadius, points, color) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Draw arrow
function drawArrow(ctx, fromX, fromY, toX, toY, headLen = 10) {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}
```

### Bezier Curves

```javascript
// Quadratic Bezier curve (1 control point)
ctx.quadraticCurveTo(cpx, cpy, endX, endY);

// Cubic Bezier curve (2 control points)
ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);

// Example: Smooth curved path
function drawSmoothCurve(ctx, points) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }

  // Connect to the last point
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

// Heart shape using Bezier curves
function drawHeart(ctx, x, y, size, color) {
  ctx.beginPath();
  ctx.moveTo(x, y + size / 4);

  // Left side
  ctx.bezierCurveTo(
    x, y,
    x - size / 2, y,
    x - size / 2, y + size / 4
  );
  ctx.bezierCurveTo(
    x - size / 2, y + size / 2,
    x, y + size * 0.75,
    x, y + size
  );

  // Right side
  ctx.bezierCurveTo(
    x, y + size * 0.75,
    x + size / 2, y + size / 2,
    x + size / 2, y + size / 4
  );
  ctx.bezierCurveTo(
    x + size / 2, y,
    x, y,
    x, y + size / 4
  );

  ctx.fillStyle = color;
  ctx.fill();
}
```

### Path2D Objects

```javascript
// Path2D allows you to cache and reuse paths
const starPath = new Path2D();
for (let i = 0; i < 10; i++) {
  const radius = i % 2 === 0 ? 30 : 15;
  const angle = (i * Math.PI) / 5 - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (i === 0) starPath.moveTo(x, y);
  else starPath.lineTo(x, y);
}
starPath.closePath();

// Reuse the path many times
function drawStars(ctx, positions) {
  ctx.fillStyle = '#FFD700';
  positions.forEach(pos => {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fill(starPath);
    ctx.restore();
  });
}

// Path2D also supports SVG path strings
const svgPath = new Path2D('M10 10 h 80 v 80 h -80 Z');
ctx.stroke(svgPath);

// Hit testing with isPointInPath
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (ctx.isPointInPath(starPath, x, y)) {
    // Star was clicked!
  }
});
```

---

## Fill & Stroke Styles, Gradients, Patterns

### Solid Colors

```javascript
// Color formats
ctx.fillStyle = '#FF6600';             // Hex
ctx.fillStyle = '#F60';                // Short hex
ctx.fillStyle = 'rgb(255, 102, 0)';   // RGB
ctx.fillStyle = 'rgba(255, 102, 0, 0.5)'; // RGBA (with alpha)
ctx.fillStyle = 'hsl(24, 100%, 50%)'; // HSL
ctx.fillStyle = 'orange';             // Named color

// Note: Setting fillStyle/strokeStyle is relatively expensive
// Batch draws with the same style together
```

### Linear Gradients

```javascript
// createLinearGradient(x0, y0, x1, y1)
// (x0,y0) = start point, (x1,y1) = end point

// Horizontal gradient
const hGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
hGrad.addColorStop(0, '#FF0000');
hGrad.addColorStop(0.5, '#00FF00');
hGrad.addColorStop(1, '#0000FF');

// Vertical gradient (top to bottom)
const vGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
vGrad.addColorStop(0, '#87CEEB');  // Sky blue
vGrad.addColorStop(1, '#228B22');  // Forest green

// Diagonal gradient
const dGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);

// Use gradient as fillStyle
ctx.fillStyle = vGrad;
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Sky gradient for a game background
function drawSky(ctx, width, height) {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  skyGradient.addColorStop(0, '#1a1a2e');
  skyGradient.addColorStop(0.3, '#16213e');
  skyGradient.addColorStop(0.6, '#0f3460');
  skyGradient.addColorStop(1, '#e94560');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height * 0.7);
}
```

### Radial Gradients

```javascript
// createRadialGradient(x0, y0, r0, x1, y1, r1)
// Inner circle: (x0, y0, r0)
// Outer circle: (x1, y1, r1)

// Simple radial glow
const glow = ctx.createRadialGradient(200, 200, 0, 200, 200, 100);
glow.addColorStop(0, 'rgba(255, 255, 0, 1)');
glow.addColorStop(0.5, 'rgba(255, 255, 0, 0.3)');
glow.addColorStop(1, 'rgba(255, 255, 0, 0)');

ctx.fillStyle = glow;
ctx.fillRect(100, 100, 200, 200);

// Light source effect
function drawLight(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Vignette effect (darkened corners)
function drawVignette(ctx, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(width, height) * 0.7;

  const vignette = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
```

### Patterns

```javascript
// Create a pattern from an image
const img = new Image();
img.onload = () => {
  // 'repeat', 'repeat-x', 'repeat-y', 'no-repeat'
  const pattern = ctx.createPattern(img, 'repeat');
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};
img.src = 'tile.png';

// Pattern from another canvas (procedural)
function createCheckerPattern(size, color1, color2) {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = size * 2;
  patternCanvas.height = size * 2;
  const pCtx = patternCanvas.getContext('2d');

  pCtx.fillStyle = color1;
  pCtx.fillRect(0, 0, size, size);
  pCtx.fillRect(size, size, size, size);

  pCtx.fillStyle = color2;
  pCtx.fillRect(size, 0, size, size);
  pCtx.fillRect(0, size, size, size);

  return ctx.createPattern(patternCanvas, 'repeat');
}

// Stripe pattern
function createStripePattern(width, color1, color2, angle) {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = width * 2;
  patternCanvas.height = width * 2;
  const pCtx = patternCanvas.getContext('2d');

  pCtx.fillStyle = color1;
  pCtx.fillRect(0, 0, width * 2, width * 2);

  pCtx.fillStyle = color2;
  pCtx.fillRect(0, 0, width, width * 2);

  return ctx.createPattern(patternCanvas, 'repeat');
}
```

---

## Text Rendering

### Font Setup & Rendering

```javascript
// Font property (CSS font shorthand)
ctx.font = '16px Arial';
ctx.font = 'bold 24px "Helvetica Neue", sans-serif';
ctx.font = 'italic bold 32px serif';
ctx.font = '48px "Custom Font", sans-serif';

// Text alignment
ctx.textAlign = 'left';     // 'left', 'right', 'center', 'start', 'end'
ctx.textBaseline = 'top';   // 'top', 'hanging', 'middle', 'alphabetic' (default), 'ideographic', 'bottom'

// Draw text
ctx.fillStyle = '#FFFFFF';
ctx.fillText('Hello World', x, y);              // Filled text
ctx.fillText('Hello World', x, y, maxWidth);    // With max width constraint

ctx.strokeStyle = '#000000';
ctx.lineWidth = 2;
ctx.strokeText('Outlined Text', x, y);          // Outlined text
```

### Text Measurement

```javascript
// measureText returns a TextMetrics object
const metrics = ctx.measureText('Hello World');

// Width is the most commonly used
const textWidth = metrics.width;

// Modern browsers also provide:
// metrics.actualBoundingBoxLeft
// metrics.actualBoundingBoxRight
// metrics.actualBoundingBoxAscent
// metrics.actualBoundingBoxDescent
// metrics.fontBoundingBoxAscent
// metrics.fontBoundingBoxDescent

// Center text horizontally
function drawCenteredText(ctx, text, y, canvasWidth) {
  ctx.textAlign = 'center';
  ctx.fillText(text, canvasWidth / 2, y);
}

// Center text both horizontally and vertically
function drawCenteredTextBoth(ctx, text, canvasWidth, canvasHeight) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);
}

// Get text height (approximate)
function getTextHeight(fontSize) {
  return fontSize * 1.2; // Rough approximation
}

// More accurate text height
function measureTextHeight(ctx, text) {
  const metrics = ctx.measureText(text);
  return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
}
```

### Custom Font Loading

```javascript
// Method 1: CSS @font-face (recommended for playable ads)
// Inline the font as base64 in a style tag
const fontStyle = document.createElement('style');
fontStyle.textContent = `
  @font-face {
    font-family: 'GameFont';
    src: url(data:font/woff2;base64,/* base64 encoded font */) format('woff2');
    font-weight: normal;
    font-style: normal;
  }
`;
document.head.appendChild(fontStyle);

// Method 2: FontFace API
async function loadFont(name, url) {
  const font = new FontFace(name, `url(${url})`);
  const loadedFont = await font.load();
  document.fonts.add(loadedFont);
  return loadedFont;
}

// Method 3: Wait for fonts to be ready
document.fonts.ready.then(() => {
  // All fonts are loaded, safe to render text
  startGame();
});

// Method 4: Check if specific font is loaded
async function waitForFont(fontName) {
  await document.fonts.load(`16px "${fontName}"`);
  // Font is ready to use
}

// For playable ads, consider bitmap fonts instead
// They load faster and render consistently across devices
```

### Word Wrapping

```javascript
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  lines.forEach((l, i) => {
    ctx.fillText(l, x, y + i * lineHeight);
  });

  return lines.length; // Return number of lines drawn
}

// Text with shadow
function drawTextWithShadow(ctx, text, x, y, color, shadowColor, shadowOffset) {
  ctx.fillStyle = shadowColor;
  ctx.fillText(text, x + shadowOffset, y + shadowOffset);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Outlined text (common in games)
function drawOutlinedText(ctx, text, x, y, fillColor, outlineColor, outlineWidth) {
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);

  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}
```

---

## Image Drawing & Sprite Extraction

### Basic Image Drawing

```javascript
// Load an image
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Load multiple images
async function loadImages(sources) {
  const entries = Object.entries(sources);
  const loaded = await Promise.all(
    entries.map(([key, src]) =>
      loadImage(src).then(img => [key, img])
    )
  );
  return Object.fromEntries(loaded);
}

// Three forms of drawImage:

// 1. Basic: draw entire image at position
ctx.drawImage(img, dx, dy);

// 2. Scaled: draw entire image at position with size
ctx.drawImage(img, dx, dy, dWidth, dHeight);

// 3. Cropped: draw a portion of the image (sprite extraction)
ctx.drawImage(img,
  sx, sy, sWidth, sHeight,    // Source rectangle (from image)
  dx, dy, dWidth, dHeight     // Destination rectangle (on canvas)
);
```

### Sprite Extraction from Sprite Sheets

```javascript
// Sprite sheet with fixed-size frames
// Example: 8 frames of 64x64 pixels each, in a row
class SpriteSheet {
  constructor(image, frameWidth, frameHeight, columns) {
    this.image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.columns = columns;
  }

  drawFrame(ctx, frameIndex, x, y, scale = 1) {
    const col = frameIndex % this.columns;
    const row = Math.floor(frameIndex / this.columns);

    ctx.drawImage(
      this.image,
      col * this.frameWidth,          // Source X
      row * this.frameHeight,         // Source Y
      this.frameWidth,                // Source Width
      this.frameHeight,               // Source Height
      x,                              // Dest X
      y,                              // Dest Y
      this.frameWidth * scale,        // Dest Width
      this.frameHeight * scale        // Dest Height
    );
  }
}

// Usage:
// const sheet = new SpriteSheet(playerImage, 64, 64, 8);
// sheet.drawFrame(ctx, currentFrame, player.x, player.y);
```

### Texture Atlas (JSON Hash Format)

```javascript
// TexturePacker JSON Hash format:
/*
{
  "frames": {
    "coin_0.png": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": true,
      "spriteSourceSize": { "x": 2, "y": 1, "w": 28, "h": 30 },
      "sourceSize": { "w": 32, "h": 32 }
    },
    "player_idle.png": {
      "frame": { "x": 32, "y": 0, "w": 48, "h": 64 },
      ...
    }
  },
  "meta": {
    "image": "atlas.png",
    "size": { "w": 512, "h": 512 }
  }
}
*/

class TextureAtlas {
  constructor(image, atlasData) {
    this.image = image;
    this.frames = atlasData.frames;
  }

  drawSprite(ctx, spriteName, x, y, scale = 1) {
    const data = this.frames[spriteName];
    if (!data) {
      throw new Error(`Sprite "${spriteName}" not found in atlas`);
    }

    const frame = data.frame;
    const source = data.spriteSourceSize;
    const original = data.sourceSize;

    if (data.trimmed) {
      // Account for trimmed transparent pixels
      ctx.drawImage(
        this.image,
        frame.x, frame.y, frame.w, frame.h,
        x + source.x * scale,
        y + source.y * scale,
        frame.w * scale,
        frame.h * scale
      );
    } else {
      ctx.drawImage(
        this.image,
        frame.x, frame.y, frame.w, frame.h,
        x, y,
        frame.w * scale, frame.h * scale
      );
    }
  }

  getFrame(spriteName) {
    return this.frames[spriteName];
  }
}
```

### Base64 Inline Images (Playable Ads)

```javascript
// For playable ads, images are often base64 encoded inline
const ASSETS = {
  player: 'data:image/png;base64,iVBORw0KGgoAAAANSU...',
  coin: 'data:image/png;base64,iVBORw0KGgoAAAANSU...',
  background: 'data:image/png;base64,iVBORw0KGgoAAAANSU...',
};

// Load all base64 assets
function loadBase64Assets(assetMap) {
  return Promise.all(
    Object.entries(assetMap).map(([key, base64]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve([key, img]);
        img.src = base64;
      });
    })
  ).then(entries => Object.fromEntries(entries));
}

// Usage in a playable ad
async function initGame() {
  const images = await loadBase64Assets(ASSETS);
  // images.player, images.coin, images.background are ready
  startGame(images);
}
```

---

## Pixel Manipulation

### getImageData / putImageData

```javascript
// Get pixel data from canvas
const imageData = ctx.getImageData(x, y, width, height);
// imageData.data is a Uint8ClampedArray
// Format: [R, G, B, A, R, G, B, A, ...]
// Each value is 0-255

// Access a specific pixel
function getPixel(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3]
  };
}

// Set a specific pixel
function setPixel(imageData, x, y, r, g, b, a) {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = r;
  imageData.data[index + 1] = g;
  imageData.data[index + 2] = b;
  imageData.data[index + 3] = a;
}

// Put modified pixel data back
ctx.putImageData(imageData, x, y);
```

### Per-Pixel Effects

```javascript
// Grayscale filter
function grayscale(ctx, x, y, width, height) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;       // R
    data[i + 1] = avg;   // G
    data[i + 2] = avg;   // B
    // data[i + 3] unchanged (alpha)
  }

  ctx.putImageData(imageData, x, y);
}

// Brightness adjustment
function adjustBrightness(ctx, x, y, width, height, amount) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + amount));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount));
  }

  ctx.putImageData(imageData, x, y);
}

// Color replacement (palette swap)
function paletteSwap(ctx, x, y, width, height, colorMap) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    const replacement = colorMap[key];
    if (replacement) {
      data[i] = replacement[0];
      data[i + 1] = replacement[1];
      data[i + 2] = replacement[2];
    }
  }

  ctx.putImageData(imageData, x, y);
}

// Pixelation effect
function pixelate(ctx, x, y, width, height, pixelSize) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;

  for (let py = 0; py < height; py += pixelSize) {
    for (let px = 0; px < width; px += pixelSize) {
      // Sample the center pixel of each block
      const centerIdx = ((py + Math.floor(pixelSize / 2)) * width + (px + Math.floor(pixelSize / 2))) * 4;
      const r = data[centerIdx];
      const g = data[centerIdx + 1];
      const b = data[centerIdx + 2];

      // Fill the entire block with that color
      for (let dy = 0; dy < pixelSize && py + dy < height; dy++) {
        for (let dx = 0; dx < pixelSize && px + dx < width; dx++) {
          const idx = ((py + dy) * width + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
      }
    }
  }

  ctx.putImageData(imageData, x, y);
}
```

**Performance warning:** `getImageData()` and `putImageData()` are expensive operations. They force a GPU-to-CPU readback. Never use them in a game loop if you can avoid it. Use them for one-time effects during loading or level transitions.

---

## Canvas State & Transformations

### Save and Restore

```javascript
// The canvas state stack saves:
// - Transformation matrix
// - Clipping region
// - fillStyle, strokeStyle
// - lineWidth, lineCap, lineJoin, miterLimit
// - globalAlpha
// - globalCompositeOperation
// - font, textAlign, textBaseline
// - shadowBlur, shadowColor, shadowOffsetX, shadowOffsetY
// - imageSmoothingEnabled

ctx.save();    // Push current state onto the stack
// ... modify state, draw things ...
ctx.restore(); // Pop state from the stack (restoring previous state)

// IMPORTANT: Always pair save() with restore()
// Common pattern:
function drawRotatedSprite(ctx, img, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
```

### Transformation Matrix

```javascript
// Transformations are cumulative and applied in reverse order

// Translate: Move the origin point
ctx.translate(dx, dy);

// Rotate: Rotate around the current origin (in radians)
ctx.rotate(angle); // angle in radians
// Degrees to radians: radians = degrees * Math.PI / 180

// Scale: Scale future drawing operations
ctx.scale(sx, sy); // 1.0 = normal, 2.0 = double, -1.0 = flip

// The full transformation matrix (6 values):
// [a  c  e]
// [b  d  f]
// [0  0  1]
ctx.setTransform(a, b, c, d, e, f);
ctx.transform(a, b, c, d, e, f);    // Multiply with current matrix
ctx.resetTransform();                 // Reset to identity

// Common transformation patterns:

// 1. Draw rotated around center
function drawRotated(ctx, x, y, width, height, angle, drawFn) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(angle);
  ctx.translate(-width / 2, -height / 2);
  drawFn(ctx, 0, 0, width, height);
  ctx.restore();
}

// 2. Flip horizontally (mirror)
function drawFlippedH(ctx, img, x, y) {
  ctx.save();
  ctx.translate(x + img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// 3. Zoom/camera system
class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  apply(ctx) {
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  unapply(ctx) {
    ctx.restore();
  }

  // Convert screen coordinates to world coordinates
  screenToWorld(screenX, screenY) {
    return {
      x: screenX / this.zoom + this.x,
      y: screenY / this.zoom + this.y
    };
  }

  // Convert world coordinates to screen coordinates
  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom,
      y: (worldY - this.y) * this.zoom
    };
  }
}
```

### Clipping

```javascript
// Clipping restricts drawing to a region
ctx.save();
ctx.beginPath();
ctx.arc(200, 200, 100, 0, Math.PI * 2);
ctx.clip();
// Everything drawn now is clipped to the circle
ctx.drawImage(photo, 0, 0, 400, 400);
ctx.restore();

// Rounded rectangle clip (for UI panels)
function clipRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

// Spotlight / reveal effect
function drawSpotlight(ctx, canvas, lightX, lightY, radius) {
  ctx.save();

  // Draw the scene normally first
  drawScene(ctx);

  // Create a dark overlay with a circular cutout
  ctx.globalCompositeOperation = 'destination-in';
  const gradient = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();
}
```

---

## Compositing & Blending

### globalCompositeOperation

```javascript
// Controls how new drawings combine with existing content
ctx.globalCompositeOperation = 'source-over'; // Default

// Common modes for games:
/*
┌───────────────────────────────────────────────────────────────���─┐
│                  Composite Operations                            │
├───────────────┬─────────────────────────────────────────────────┤
│ Mode          │ Effect                                          │
├───────────────┼─────────────────────────────────────────────────┤
│ source-over   │ New on top of old (default)                     │
│ source-atop   │ New only where old already exists               │
│ source-in     │ New only where both overlap, old removed        │
│ source-out    │ New only where old doesn't exist                │
│ destination-  │ Same as above but keeping destination instead   │
│   over/atop/  │                                                 │
│   in/out      │                                                 │
│ lighter       │ Colors added (additive blending - great for     │
│               │ particles, glows, fire)                         │
│ multiply      │ Colors multiplied (darkens - shadows, tinting)  │
│ screen        │ Inverse multiply (lightens - glows, highlights) │
│ overlay       │ Multiply or screen based on destination         │
│ darken        │ Keep darkest value                              │
│ lighten       │ Keep lightest value                             │
│ xor           │ Transparent where both overlap                  │
│ copy          │ Only new drawing, old completely replaced        │
│ difference    │ Absolute difference (psychedelic effects)        │
└───────────────┴─────────────────────────────────────────────────┘
*/
```

### Practical Compositing Examples

```javascript
// Additive blending for particles (fire, glow, laser)
function drawGlowParticles(ctx, particles) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  particles.forEach(p => {
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    gradient.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha})`);
    gradient.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
  });

  ctx.restore();
}

// Multiply for shadows
function drawShadow(ctx, shape) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  // Draw offset shadow shape
  ctx.translate(5, 5);
  shape(ctx);
  ctx.fill();
  ctx.restore();
}

// Screen for highlights
function drawHighlight(ctx, x, y, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

// Masking with source-in
function drawMaskedImage(ctx, image, maskShape) {
  // Create a temporary canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = ctx.canvas.width;
  tempCanvas.height = ctx.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  // Draw the mask shape
  maskShape(tempCtx);
  tempCtx.fill();

  // Draw the image, keeping only the masked area
  tempCtx.globalCompositeOperation = 'source-in';
  tempCtx.drawImage(image, 0, 0);

  // Draw the result onto the main canvas
  ctx.drawImage(tempCanvas, 0, 0);
}
```

### globalAlpha

```javascript
// Set transparency for all subsequent drawing operations
ctx.globalAlpha = 0.5; // 50% transparent

// Better to use rgba colors when possible (more granular control)
// But globalAlpha is useful for fading entire groups of draws

// Fade transition
function drawFadeTransition(ctx, canvas, progress) {
  // Draw the scene
  drawScene(ctx);

  // Overlay with fade
  ctx.save();
  ctx.globalAlpha = progress; // 0 = transparent, 1 = fully opaque
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
```

---

## Off-Screen Canvas & Double Buffering

### Off-Screen Canvas for Pre-Rendering

```javascript
// Create a canvas not attached to the DOM
function createOffscreenBuffer(width, height) {
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  return {
    canvas: buffer,
    ctx: buffer.getContext('2d')
  };
}

// Pre-render complex static content
function preRenderBackground(width, height) {
  const { canvas, ctx } = createOffscreenBuffer(width, height);

  // Draw complex background once
  drawSky(ctx, width, height);
  drawMountains(ctx, width, height);
  drawTrees(ctx, width, height);
  drawGrass(ctx, width, height);

  return canvas; // Return as an image source
}

// Usage in game loop (extremely fast - single drawImage call)
const backgroundBuffer = preRenderBackground(800, 600);
function render() {
  ctx.drawImage(backgroundBuffer, 0, 0);
  // Draw dynamic elements on top
}
```

### Double Buffering

```javascript
// Canvas already uses double buffering internally.
// But you can add a third buffer for complex scenes:

class DoubleBuffer {
  constructor(width, height) {
    this.front = document.getElementById('game');
    this.frontCtx = this.front.getContext('2d');

    this.back = document.createElement('canvas');
    this.back.width = width;
    this.back.height = height;
    this.backCtx = this.back.getContext('2d');
  }

  getDrawContext() {
    return this.backCtx;
  }

  flip() {
    // Copy back buffer to front (visible canvas)
    this.frontCtx.clearRect(0, 0, this.front.width, this.front.height);
    this.frontCtx.drawImage(this.back, 0, 0);
  }
}

// Practical use: pre-render tile maps
class TileMapRenderer {
  constructor(tileWidth, tileHeight, mapWidth, mapHeight, tilesheet) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = mapWidth * tileWidth;
    this.buffer.height = mapHeight * tileHeight;
    this.bufferCtx = this.buffer.getContext('2d');
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.tilesheet = tilesheet;
    this.dirty = true;
  }

  setTile(x, y, tileIndex) {
    this.dirty = true;
    // ... store tile data
  }

  preRender(tileData) {
    if (!this.dirty) return;

    const { bufferCtx, tileWidth, tileHeight, tilesheet } = this;

    for (let y = 0; y < tileData.length; y++) {
      for (let x = 0; x < tileData[y].length; x++) {
        const tile = tileData[y][x];
        const srcX = (tile % 16) * tileWidth;
        const srcY = Math.floor(tile / 16) * tileHeight;

        bufferCtx.drawImage(
          tilesheet,
          srcX, srcY, tileWidth, tileHeight,
          x * tileWidth, y * tileHeight, tileWidth, tileHeight
        );
      }
    }

    this.dirty = false;
  }

  draw(ctx, cameraX, cameraY, viewWidth, viewHeight) {
    // Draw only the visible portion
    ctx.drawImage(
      this.buffer,
      cameraX, cameraY, viewWidth, viewHeight,
      0, 0, viewWidth, viewHeight
    );
  }
}
```

---

## OffscreenCanvas & Web Workers

### OffscreenCanvas API

```javascript
// OffscreenCanvas can be used in Web Workers for background rendering
// This keeps the main thread free for input handling and game logic

// Main thread
const canvas = document.getElementById('game');
const offscreen = canvas.transferControlToOffscreen();

const worker = new Worker('render-worker.js');
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);

// render-worker.js
self.onmessage = function(e) {
  if (e.data.type === 'init') {
    const canvas = e.data.canvas;
    const ctx = canvas.getContext('2d');

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ... render game
      requestAnimationFrame(render);
    }
    render();
  }
};
```

### OffscreenCanvas for Texture Generation

```javascript
// Generate textures in a Web Worker
// worker-texture-gen.js
self.onmessage = function(e) {
  const { width, height, type } = e.data;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  switch (type) {
    case 'noise':
      generateNoiseTexture(ctx, width, height);
      break;
    case 'gradient':
      generateGradientTexture(ctx, width, height);
      break;
  }

  // Convert to ImageBitmap for efficient transfer
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ bitmap }, [bitmap]);
};

function generateNoiseTexture(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const value = Math.random() * 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}
```

### Browser Support Note

```
OffscreenCanvas Browser Support (2024):
├── Chrome: Full support (since Chrome 69)
├── Firefox: Full support (since Firefox 105)
├── Safari: Partial support (since Safari 16.4)
├── Edge: Full support (Chromium-based)
└── Mobile: Good support on modern devices

For playable ads: Don't rely on OffscreenCanvas
- Many in-app webviews have limited Worker support
- The overhead of setting up workers is not worth it for
  30-second playable ads
- Use it only for HTML5 portal games or complex projects
```

---

## Canvas vs SVG vs DOM Animation

### Comparison Table

```
┌──────────────┬────────────────┬────────────────┬────────────────┐
│ Factor       │ Canvas         │ SVG            │ DOM + CSS      │
├──────────────┼────────────────┼────────────────┼────────────────┤
│ Rendering    │ Immediate mode │ Retained mode  │ Retained mode  │
│              │ (pixel buffer) │ (DOM tree)     │ (DOM tree)     │
│              │                │                │                │
│ Best for     │ Many objects,  │ Few complex    │ UI, simple     │
│              │ particles,     │ shapes, charts │ animations,    │
│              │ pixel effects  │ icons, logos   │ text-heavy     │
│              │                │                │                │
│ Performance  │ Scales with    │ Scales with    │ Scales with    │
│ bottleneck   │ pixel count    │ DOM node count │ DOM node count │
│              │                │                │                │
│ Objects:     │ Excellent      │ Slow (>1000)   │ Slow (>100     │
│ 10-100       │                │                │ animated)      │
│ 100-1000     │ Excellent      │ OK             │ Slow           │
│ 1000-10000   │ Good           │ Very slow      │ Unusable       │
│ 10000+       │ OK (WebGL)     │ Unusable       │ Unusable       │
│              │                │                │                │
│ Resolution   │ Fixed pixels   │ Infinite       │ Infinite       │
│ independence │ (need DPR)     │ (vector)       │ (text/CSS)     │
│              │                │                │                │
│ Hit testing  │ Manual (math)  │ Built-in       │ Built-in       │
│              │ or per-pixel   │ (DOM events)   │ (DOM events)   │
│              │                │                │                │
│ Animation    │ Manual (rAF)   │ SMIL or CSS    │ CSS or WAAPI   │
│              │                │                │                │
│ Accessibility│ None (bitmap)  │ Good (ARIA)    │ Best (semantic) │
│              │                │                │                │
│ SEO          │ None           │ Good           │ Best           │
│              │                │                │                │
│ Memory       │ Fixed (buffer  │ Grows with     │ Grows with     │
│              │ size)          │ complexity     │ complexity     │
│              │                │                │                │
│ File size    │ Small (JS)     │ Can be large   │ Small (CSS)    │
│              │                │ (SVG files)    │                │
│              │                │                │                │
│ Use in       │ Primary choice │ For UI/icons   │ For UI, end    │
│ playable ads │ for gameplay   │                │ cards, CTA     │
└──────────────┴────────────────┴────────────────┴────────────────┘
```

### When to Use Each

```javascript
// CANVAS: Use for the game itself
// - Real-time rendering of sprites, particles, backgrounds
// - Per-pixel effects and custom rendering
// - When you have hundreds+ of moving objects

// SVG: Use for
// - Game UI elements (health bars, icons)
// - Resolution-independent graphics
// - Charts/data visualization in game
// - When you need built-in hit testing

// DOM + CSS: Use for
// - Menus, overlays, HUD text
// - CTA buttons and end cards
// - Anything text-heavy
// - Animations that can be expressed with CSS transforms

// Hybrid approach (common in playable ads):
// Canvas for game rendering
// DOM overlay for UI, text, CTA button
```

```html
<!-- Hybrid approach example -->
<div id="game-container" style="position: relative;">
  <!-- Game renders here -->
  <canvas id="game" style="position: absolute; top: 0; left: 0;"></canvas>

  <!-- UI overlay on top of canvas -->
  <div id="ui-overlay" style="position: absolute; top: 0; left: 0; pointer-events: none;">
    <div id="score" style="font-size: 24px; color: white;">Score: 0</div>
    <div id="tutorial-hand" style="/* CSS animation */"></div>
  </div>

  <!-- CTA overlay (shown at end) -->
  <div id="cta-overlay" style="display: none; position: absolute; top: 0; left: 0;">
    <button id="install-btn" onclick="installGame()">PLAY NOW!</button>
  </div>
</div>
```

---

## Performance Tips

### General Principles

```
┌──────────────────────────────────────────────────────────────┐
│              Canvas Performance Principles                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Minimize state changes                                   │
│     - Batch draws with same fillStyle together               │
│     - Group similar operations                               │
│     - Reduce save()/restore() calls where possible           │
│                                                              │
│  2. Avoid expensive operations in the loop                   │
│     - No getImageData() per frame                            │
│     - No canvas.toDataURL() per frame                        │
│     - No DOM reads (getBoundingClientRect) per frame         │
│     - Pre-create gradients, patterns outside the loop        │
│                                                              │
│  3. Draw only what changed                                   │
│     - Track dirty rectangles                                 │
│     - Clear and redraw only changed regions                  │
│     - Skip off-screen objects                                │
│                                                              │
│  4. Pre-render static content                                │
│     - Use off-screen canvases for backgrounds                │
│     - Cache complex shapes as images                         │
│     - Pre-render text that doesn't change                    │
│                                                              │
│  5. Reduce canvas size when possible                         │
│     - Cap DPR at 2                                           │
│     - Use smaller canvas + CSS scaling for low-end devices   │
│     - Consider rendering at half resolution                  │
│                                                              │
│  6. Use integer coordinates                                  │
│     - Non-integer values cause sub-pixel rendering           │
│     - Math.round() your positions                            │
│     - Especially important for pixel art                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Specific Optimizations

```javascript
// BAD: Changing fillStyle for every draw
function renderBad(ctx, objects) {
  objects.forEach(obj => {
    ctx.fillStyle = obj.color;  // State change every iteration
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
  });
}

// GOOD: Group by color
function renderGood(ctx, objects) {
  const grouped = {};
  objects.forEach(obj => {
    if (!grouped[obj.color]) grouped[obj.color] = [];
    grouped[obj.color] = [...grouped[obj.color], obj];
  });

  Object.entries(grouped).forEach(([color, objs]) => {
    ctx.fillStyle = color; // State change once per color
    objs.forEach(obj => ctx.fillRect(obj.x, obj.y, obj.w, obj.h));
  });
}

// BAD: Creating objects every frame
function updateBad(particles) {
  return particles.map(p => {
    return { ...p, x: p.x + p.vx, y: p.y + p.vy }; // New object every frame
  });
}

// GOOD: Object pooling for hot paths
class ParticlePool {
  constructor(maxSize) {
    this.particles = Array.from({ length: maxSize }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, active: false
    }));
    this.activeCount = 0;
  }

  spawn(x, y, vx, vy) {
    for (const p of this.particles) {
      if (!p.active) {
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.active = true;
        this.activeCount++;
        return p;
      }
    }
    return null; // Pool exhausted
  }

  update() {
    for (const p of this.particles) {
      if (p.active) {
        p.x += p.vx;
        p.y += p.vy;
      }
    }
  }

  render(ctx) {
    ctx.fillStyle = '#FFD700';
    for (const p of this.particles) {
      if (p.active) {
        ctx.fillRect(p.x | 0, p.y | 0, 4, 4); // |0 for integer rounding
      }
    }
  }
}

// Cache expensive text rendering
function createTextCache(text, font, color) {
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = font;
  const metrics = measureCtx.measureText(text);

  const width = Math.ceil(metrics.width) + 4;
  const height = Math.ceil(parseInt(font) * 1.5);

  measureCanvas.width = width;
  measureCanvas.height = height;
  measureCtx.font = font;
  measureCtx.fillStyle = color;
  measureCtx.textBaseline = 'top';
  measureCtx.fillText(text, 0, 0);

  return measureCanvas; // Use as image source
}

// Dirty rectangle optimization
class DirtyRectRenderer {
  constructor(width, height) {
    this.dirtyRects = [];
    this.width = width;
    this.height = height;
  }

  markDirty(x, y, w, h) {
    this.dirtyRects = [...this.dirtyRects, { x, y, w, h }];
  }

  render(ctx, drawFn) {
    if (this.dirtyRects.length === 0) return;

    // Merge overlapping rects for efficiency
    const merged = this.mergeRects(this.dirtyRects);

    merged.forEach(rect => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      drawFn(ctx);
      ctx.restore();
    });

    this.dirtyRects = [];
  }

  mergeRects(rects) {
    // Simple bounding box merge (more sophisticated algorithms exist)
    if (rects.length <= 1) return rects;
    // ... implement merge logic
    return rects;
  }
}
```

### Profiling Canvas Performance

```javascript
// Use the Performance API
function profileFrame(label, fn) {
  performance.mark(`${label}-start`);
  fn();
  performance.mark(`${label}-end`);
  performance.measure(label, `${label}-start`, `${label}-end`);
}

// In your game loop:
function gameLoop(timestamp) {
  profileFrame('update', () => update(deltaTime));
  profileFrame('render', () => render(ctx));

  requestAnimationFrame(gameLoop);
}

// Read results:
const measures = performance.getEntriesByType('measure');
measures.forEach(m => {
  if (m.duration > 16) {
    // Frame took longer than 16ms (below 60fps target)
  }
});

// FPS counter
class FPSCounter {
  constructor() {
    this.frames = 0;
    this.lastTime = performance.now();
    this.fps = 0;
  }

  update() {
    this.frames++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.lastTime = now;
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.fps < 30 ? '#FF0000' : '#00FF00';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${this.fps}`, 10, 20);
  }
}
```

---

## Interview Questions & Answers

### Q1: What is the difference between canvas.width and canvas.style.width?

**Answer:**
`canvas.width` (the HTML attribute) sets the drawing buffer size - the actual number of pixels the canvas has to work with. `canvas.style.width` (the CSS property) sets the display size - how large the canvas appears on screen.

If these differ, the browser stretches or compresses the canvas buffer to fit the CSS size. For crisp rendering, you want the buffer size to match the physical pixel count. On a 2x DPR device, if the canvas displays at 400x300 CSS pixels, you'd set `canvas.width = 800; canvas.height = 600` to match the 800x600 physical pixels, then scale the context by DPR.

If you only set CSS dimensions without adjusting the buffer, the default 300x150 buffer gets stretched, resulting in blurry, pixelated output.

### Q2: How would you implement a sprite animation system using Canvas?

**Answer:**

```javascript
class SpriteAnimation {
  constructor(spriteSheet, frameWidth, frameHeight, config) {
    this.sheet = spriteSheet;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.animations = {};
    this.currentAnimation = null;
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.isPlaying = true;
    this.onComplete = null;

    // Register animations from config
    Object.entries(config).forEach(([name, anim]) => {
      this.animations[name] = {
        frames: anim.frames,       // Array of frame indices
        fps: anim.fps || 12,       // Playback speed
        loop: anim.loop !== false,  // Default to looping
        row: anim.row || 0         // Row in sprite sheet
      };
    });
  }

  play(animationName, onComplete = null) {
    if (this.currentAnimation === animationName) return this;

    this.currentAnimation = animationName;
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.isPlaying = true;
    this.onComplete = onComplete;
    return this;
  }

  update(deltaTime) {
    if (!this.isPlaying || !this.currentAnimation) return;

    const anim = this.animations[this.currentAnimation];
    if (!anim) return;

    this.frameTimer += deltaTime;
    const frameDuration = 1 / anim.fps;

    if (this.frameTimer >= frameDuration) {
      this.frameTimer -= frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= anim.frames.length) {
        if (anim.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = anim.frames.length - 1;
          this.isPlaying = false;
          if (this.onComplete) this.onComplete();
        }
      }
    }
  }

  draw(ctx, x, y, flipH = false, scale = 1) {
    const anim = this.animations[this.currentAnimation];
    if (!anim) return;

    const frameIndex = anim.frames[this.currentFrame];
    const sx = frameIndex * this.frameWidth;
    const sy = anim.row * this.frameHeight;

    ctx.save();

    if (flipH) {
      ctx.translate(x + this.frameWidth * scale, y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.sheet,
        sx, sy, this.frameWidth, this.frameHeight,
        0, 0, this.frameWidth * scale, this.frameHeight * scale
      );
    } else {
      ctx.drawImage(
        this.sheet,
        sx, sy, this.frameWidth, this.frameHeight,
        x, y, this.frameWidth * scale, this.frameHeight * scale
      );
    }

    ctx.restore();
  }
}

// Usage:
const playerAnim = new SpriteAnimation(playerSheet, 64, 64, {
  idle: { frames: [0, 1, 2, 3], fps: 8, row: 0, loop: true },
  run: { frames: [0, 1, 2, 3, 4, 5], fps: 12, row: 1, loop: true },
  jump: { frames: [0, 1, 2], fps: 10, row: 2, loop: false },
  attack: { frames: [0, 1, 2, 3, 4], fps: 15, row: 3, loop: false }
});

playerAnim.play('idle');
```

### Q3: Explain globalCompositeOperation and give a game use case.

**Answer:**
`globalCompositeOperation` determines how newly drawn pixels combine with existing pixels on the canvas. The default is `source-over`, which simply draws new content on top.

**Game use case: Lighting system with additive blending**

By setting `globalCompositeOperation = 'lighter'`, drawn colors are added together. This is perfect for light sources, fire particles, and glow effects:

1. Render the game scene normally to a buffer
2. Create a dark overlay canvas filled with near-black
3. For each light source, draw a radial gradient (bright center fading to transparent) onto the dark canvas using `'lighter'` mode - lights stack and brighten naturally
4. Composite the lighting canvas onto the game scene using `'multiply'` mode - dark areas stay dark, lit areas show through

Another common use: `'destination-out'` to cut holes in a canvas, useful for fog-of-war or scratch-off reveals.

### Q4: How do you handle touch input on canvas for a playable ad?

**Answer:**

```javascript
class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.touches = [];
    this.mousePos = null;
    this.isDown = false;

    // Unified pointer events (preferred - works for both touch and mouse)
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));

    // Prevent default touch behavior (scrolling, zooming)
    canvas.style.touchAction = 'none';

    // Fallback for older webviews
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  getCanvasPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onDown(e) {
    this.isDown = true;
    this.mousePos = this.getCanvasPosition(e);
  }

  onMove(e) {
    if (this.isDown) {
      this.mousePos = this.getCanvasPosition(e);
    }
  }

  onUp(e) {
    this.isDown = false;
    this.mousePos = null;
  }
}
```

Key considerations for playable ads:
- Always use `pointer` events (unified touch/mouse) with `touch` event fallback
- Set `touch-action: none` on the canvas to prevent browser gestures
- Convert screen coordinates to canvas coordinates using `getBoundingClientRect()`
- Account for DPR scaling in coordinate conversion
- Handle `pointercancel` for when the OS interrupts (notification, etc.)
- Test in actual in-app webviews, not just mobile browsers

### Q5: How would you optimize a canvas game that runs at 20fps on a low-end phone?

**Answer:**

I would take a systematic approach:

1. **Profile first**: Use Chrome DevTools Performance panel to identify where time is spent (JS execution, rendering, GC pauses)

2. **Reduce pixel count**: Cap DPR at 1 or render at half resolution with CSS upscaling - this can double frame rate instantly

3. **Reduce draw calls**: Batch sprites by texture, pre-render static elements to off-screen canvases, minimize state changes

4. **Reduce object count**: Lower particle counts, simplify backgrounds, remove non-essential visual elements

5. **Fix GC pressure**: Implement object pooling for frequently created/destroyed objects (particles, projectiles), avoid spread operators and `Array.map` in hot loops, pre-allocate vectors and reuse them

6. **Optimize update logic**: Use spatial partitioning for collision detection, skip updates for off-screen objects, reduce physics iterations

7. **Consider an adaptive quality system**: Measure actual FPS and progressively disable effects if below 30fps target

### Q6: What is the purpose of `imageSmoothingEnabled` and when would you disable it?

**Answer:**
`ctx.imageSmoothingEnabled` controls whether the browser applies bilinear filtering when scaling images. When `true` (default), scaled images are smoothed/anti-aliased. When `false`, nearest-neighbor interpolation is used, preserving sharp pixel edges.

**Disable it when:**
- Rendering pixel art that should look crisp when scaled up
- Drawing sprite sheets where sub-pixel bleeding between frames is an issue
- Creating a retro/pixelated visual style

```javascript
// Pixel art rendering
ctx.imageSmoothingEnabled = false;
// Also set for cross-browser compatibility
ctx.mozImageSmoothingEnabled = false;
ctx.webkitImageSmoothingEnabled = false;
ctx.msImageSmoothingEnabled = false;

// Now scaling a 16x16 sprite to 64x64 will show crisp pixels
ctx.drawImage(pixelArtSprite, 0, 0, 64, 64);
```

### Q7: Explain the purpose and behavior of `requestAnimationFrame`.

**Answer:**
`requestAnimationFrame(callback)` tells the browser to call your function before the next repaint. Key characteristics:

1. **Synced to display refresh**: Typically 60Hz (16.67ms), but adapts to the display's actual refresh rate (120Hz on newer devices)
2. **Automatic throttling**: Pauses when the tab is hidden (saves battery/CPU)
3. **Single callback per frame**: The browser batches all rAF callbacks for a given frame
4. **Returns an ID**: Can be cancelled with `cancelAnimationFrame(id)`

It differs from `setTimeout`/`setInterval` in that:
- `setTimeout(fn, 16)` is not synced to display refresh and can drift
- `setInterval` can queue up callbacks if a frame takes too long
- `rAF` is guaranteed to fire at most once before each repaint
- `rAF` provides a high-resolution timestamp as argument

```javascript
let animId;

function gameLoop(timestamp) {
  update(timestamp);
  render();
  animId = requestAnimationFrame(gameLoop);
}

// Start
animId = requestAnimationFrame(gameLoop);

// Stop
cancelAnimationFrame(animId);
```

### Q8: How do you handle canvas rendering when the browser tab is hidden?

**Answer:**

When a tab is hidden, `requestAnimationFrame` stops firing. This is by design and is actually desirable for playable ads (saves battery). However, you need to handle the resume correctly:

```javascript
let lastTimestamp = 0;
const MAX_DELTA = 1 / 30; // Cap at ~33ms to prevent spiral of death

function gameLoop(timestamp) {
  let delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  // Cap delta time to prevent huge jumps when tab becomes visible again
  delta = Math.min(delta, MAX_DELTA);

  update(delta);
  render();
  requestAnimationFrame(gameLoop);
}

// Also listen for visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
    pauseAudio();
  } else {
    // Reset lastTimestamp to prevent time jump
    lastTimestamp = performance.now();
    resumeGame();
    resumeAudio();
  }
});
```

For playable ads specifically, some ad networks pause the playable when it's not visible (MRAID `viewableChange` event), so you should handle that as well.

### Q9: What are the pros and cons of using Canvas 2D vs DOM manipulation for a simple playable ad?

**Answer:**

**Canvas 2D Pros:**
- Full control over rendering
- Better performance with many moving objects
- Consistent rendering across browsers/webviews
- Easy sprite animation and particle effects
- Single-file approach (everything in one HTML)

**Canvas 2D Cons:**
- No built-in hit testing (must implement manually)
- Text rendering is less flexible than HTML
- No accessibility (screen readers can't read canvas)
- Must handle responsive sizing manually

**DOM Manipulation Pros:**
- Built-in event handling and hit testing
- Superior text rendering (fonts, wrapping, RTL)
- CSS animations are GPU-accelerated
- Accessibility features
- Easier responsive layout
- Developer tools inspection

**DOM Manipulation Cons:**
- Poor performance with many animated elements (reflows/repaints)
- Limited visual effects compared to canvas
- Harder to create smooth pixel-level animations
- Browser rendering inconsistencies across webviews

**Recommendation:** For playable ads with simple mechanics (tap targets, drag-drop, swipe), DOM can work well and is faster to develop. For anything with particles, physics, continuous movement, or complex rendering, use Canvas. Most professional playable ads use Canvas for gameplay with DOM overlays for UI and CTA.

### Q10: How would you implement a simple particle system on Canvas?

**Answer:**

```javascript
class SimpleParticleSystem {
  constructor(maxParticles = 100) {
    this.pool = Array.from({ length: maxParticles }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0,
      size: 0, color: '',
      active: false
    }));
  }

  emit(x, y, count, config) {
    for (let i = 0; i < count; i++) {
      const particle = this.pool.find(p => !p.active);
      if (!particle) break;

      const angle = config.angle + (Math.random() - 0.5) * config.spread;
      const speed = config.speed + (Math.random() - 0.5) * config.speedVariance;

      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.life = 0;
      particle.maxLife = config.lifetime + Math.random() * config.lifetimeVariance;
      particle.size = config.size + Math.random() * config.sizeVariance;
      particle.color = config.color;
      particle.active = true;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // Gravity
    }
  }

  render(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;

      const alpha = 1 - (p.life / p.maxLife);
      const size = p.size * alpha;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(
        (p.x - size / 2) | 0,
        (p.y - size / 2) | 0,
        size | 0,
        size | 0
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Usage:
const particles = new SimpleParticleSystem(200);

// Explosion effect
particles.emit(100, 100, 30, {
  angle: 0,
  spread: Math.PI * 2,
  speed: 200,
  speedVariance: 100,
  lifetime: 0.5,
  lifetimeVariance: 0.3,
  size: 8,
  sizeVariance: 4,
  color: '#FF6600'
});
```
