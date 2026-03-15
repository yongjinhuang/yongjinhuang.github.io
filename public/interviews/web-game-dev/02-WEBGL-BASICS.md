# WebGL & GPU Rendering Basics

## Table of Contents

1. [WebGL Rendering Pipeline](#webgl-rendering-pipeline)
2. [Shader Language (GLSL)](#shader-language-glsl)
3. [Vertex Buffers and Index Buffers](#vertex-buffers-and-index-buffers)
4. [Texture Handling](#texture-handling)
5. [Blend Modes and Transparency](#blend-modes-and-transparency)
6. [WebGL2 Improvements](#webgl2-improvements)
7. [Common 2D Game Techniques in WebGL](#common-2d-game-techniques-in-webgl)
8. [Three.js Overview](#threejs-overview)
9. [PixiJS Overview](#pixijs-overview)
10. [WebGPU Preview](#webgpu-preview)
11. [Performance: Draw Call Batching](#performance-draw-call-batching)
12. [Memory Management](#memory-management)
13. [Interview Questions](#interview-questions)

---

## WebGL Rendering Pipeline

WebGL is a JavaScript API that exposes the GPU's rendering capabilities through a pipeline modeled on OpenGL ES 2.0 (WebGL1) and OpenGL ES 3.0 (WebGL2). Understanding the pipeline is fundamental to writing performant rendering code for web games.

### Pipeline Stages

```
Vertex Data (CPU)
    │
    ▼
Vertex Shader (GPU, programmable)
    │
    ▼
Primitive Assembly
    │
    ▼
Rasterization
    │
    ▼
Fragment Shader (GPU, programmable)
    │
    ▼
Per-Fragment Operations (depth test, stencil test, blending)
    │
    ▼
Framebuffer (screen or render texture)
```

### Stage 1: Vertex Data (CPU Side)

Before anything reaches the GPU, the CPU must prepare vertex data and upload it to GPU memory via buffers.

```typescript
// Create and bind a buffer
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

// Upload vertex positions (a simple triangle)
const positions = new Float32Array([
  // x,    y
   0.0,  0.5,   // top
  -0.5, -0.5,   // bottom-left
   0.5, -0.5,   // bottom-right
]);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
```

Key concepts:
- **Vertex**: A point with associated data (position, color, UV, normal, etc.)
- **Attribute**: A per-vertex input to the vertex shader
- **Buffer Object**: GPU memory that stores vertex data
- **`gl.STATIC_DRAW`**: Hints the driver that data won't change often
- **`gl.DYNAMIC_DRAW`**: Hints that data will change frequently (e.g., sprite batching)

### Stage 2: Vertex Shader (Programmable)

The vertex shader runs once per vertex. Its primary job is to transform vertex positions from model/world space into clip space.

```glsl
// Vertex shader
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_projection;
uniform mat3 u_model;

varying vec2 v_texCoord;

void main() {
    vec3 projected = u_projection * u_model * vec3(a_position, 1.0);
    gl_Position = vec4(projected.xy, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
```

The vertex shader outputs:
- `gl_Position`: The clip-space position (mandatory)
- `varying` variables: Data interpolated and passed to the fragment shader

### Stage 3: Primitive Assembly

After vertex processing, the GPU groups vertices into primitives:
- `gl.TRIANGLES` — every 3 vertices form a triangle
- `gl.TRIANGLE_STRIP` — each new vertex forms a triangle with the previous two
- `gl.TRIANGLE_FAN` — all triangles share the first vertex
- `gl.LINES`, `gl.LINE_STRIP`, `gl.POINTS`

For 2D games, almost everything uses `gl.TRIANGLES` (two triangles per quad/sprite).

### Stage 4: Rasterization

The rasterizer determines which pixels (fragments) are covered by each primitive. For each fragment, it interpolates the `varying` values from the triangle's vertices using barycentric coordinates.

This is a fixed-function stage — you cannot program it, but you can influence it:
- `gl.viewport(x, y, width, height)` — defines the screen region
- `gl.scissor(x, y, width, height)` — clips rendering to a rectangle
- Face culling: `gl.enable(gl.CULL_FACE)` — skips back-facing triangles

### Stage 5: Fragment Shader (Programmable)

The fragment shader runs once per fragment (potential pixel). It determines the color of each pixel.

```glsl
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec4 u_tint;

void main() {
    vec4 texColor = texture2D(u_texture, v_texCoord);
    gl_FragColor = texColor * u_tint;
}
```

The fragment shader outputs:
- `gl_FragColor`: The RGBA color of the fragment (WebGL1)
- In WebGL2, you use `out vec4 fragColor` instead

### Stage 6: Per-Fragment Operations

After the fragment shader, several fixed-function tests and operations occur:
- **Scissor Test**: Discard fragments outside the scissor rectangle
- **Depth Test**: Compare fragment depth to the depth buffer
- **Stencil Test**: Compare against the stencil buffer
- **Blending**: Combine fragment color with existing framebuffer color

### Stage 7: Framebuffer

The final pixel colors are written to the framebuffer. This can be:
- The **default framebuffer** (the canvas on screen)
- A **Framebuffer Object (FBO)**: renders to a texture for post-processing

```typescript
// Render to texture (FBO)
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

const targetTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, targetTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);
```

---

## Shader Language (GLSL)

GLSL (OpenGL Shading Language) is the C-like language used to write vertex and fragment shaders for WebGL.

### Variable Qualifiers

```glsl
// ATTRIBUTES — per-vertex input (vertex shader only)
attribute vec2 a_position;    // position of each vertex
attribute vec2 a_texCoord;    // UV coordinates of each vertex
attribute vec4 a_color;       // per-vertex color

// UNIFORMS — constant across all vertices/fragments in a draw call
uniform mat4 u_projection;   // camera projection matrix
uniform sampler2D u_texture;  // texture sampler
uniform float u_time;         // elapsed time for animation
uniform vec4 u_tint;          // color tint applied to all fragments

// VARYINGS — interpolated from vertex shader to fragment shader
varying vec2 v_texCoord;      // interpolated UV
varying vec4 v_color;         // interpolated color
```

**WebGL2 / GLSL ES 3.0 equivalents:**

```glsl
#version 300 es

// 'attribute' becomes 'in'
in vec2 a_position;

// 'varying' in vertex shader becomes 'out'
out vec2 v_texCoord;

// 'varying' in fragment shader becomes 'in'
in vec2 v_texCoord;

// gl_FragColor is replaced with a declared output
out vec4 fragColor;
```

### Data Types

```glsl
// Scalars
float f = 1.0;
int i = 42;
bool b = true;

// Vectors
vec2 pos = vec2(1.0, 2.0);
vec3 color = vec3(1.0, 0.0, 0.0);  // red
vec4 rgba = vec4(1.0, 0.5, 0.0, 1.0);

// Swizzling
vec3 rgb = rgba.rgb;          // extract first 3 components
vec2 yx = pos.yx;             // reverse x and y
float r = color.r;            // same as color.x

// Matrices
mat2 m2;
mat3 m3;
mat4 m4;

// Samplers (textures)
sampler2D tex;
samplerCube cubeTex;
```

### Built-in Variables

```glsl
// Vertex shader outputs
gl_Position    // vec4 — clip-space position (REQUIRED)
gl_PointSize   // float — size of point primitives

// Fragment shader inputs
gl_FragCoord   // vec4 — window-space position of the fragment
gl_FrontFacing // bool — whether the fragment is front-facing

// Fragment shader outputs
gl_FragColor   // vec4 — output color (WebGL1)
gl_FragData[n] // vec4 — multiple render targets (MRT)
```

### Built-in Functions (Most Useful for Games)

```glsl
// Math
float a = abs(x);
float c = clamp(x, 0.0, 1.0);
float m = mix(a, b, t);         // linear interpolation: a*(1-t) + b*t
float s = smoothstep(0.0, 1.0, x);  // smooth Hermite interpolation
float s = step(edge, x);        // returns 0.0 if x < edge, else 1.0
float f = fract(x);             // fractional part
float d = distance(p1, p2);
float l = length(v);
vec3 n = normalize(v);
float dp = dot(a, b);

// Texture sampling
vec4 color = texture2D(sampler, uv);       // WebGL1
vec4 color = texture(sampler, uv);          // WebGL2
```

### Example: Complete Sprite Shader

```glsl
// === VERTEX SHADER ===
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec4 a_color;

uniform mat3 u_projection;

varying vec2 v_texCoord;
varying vec4 v_color;

void main() {
    vec3 pos = u_projection * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
    v_texCoord = a_texCoord;
    v_color = a_color;
}

// === FRAGMENT SHADER ===
precision mediump float;

varying vec2 v_texCoord;
varying vec4 v_color;

uniform sampler2D u_texture;

void main() {
    vec4 texColor = texture2D(u_texture, v_texCoord);
    gl_FragColor = texColor * v_color;

    // Discard fully transparent fragments to avoid depth/blend issues
    if (gl_FragColor.a < 0.01) {
        discard;
    }
}
```

---

## Vertex Buffers and Index Buffers

### Vertex Buffers (VBOs)

A Vertex Buffer Object stores vertex attribute data in GPU memory.

```typescript
// A quad (two triangles) without index buffer = 6 vertices
const vertices = new Float32Array([
    // Triangle 1           // Triangle 2
    // x,    y,   u,   v     x,    y,   u,   v
    -0.5,  0.5, 0.0, 0.0,   -0.5, -0.5, 0.0, 1.0,
     0.5,  0.5, 1.0, 0.0,    0.5, -0.5, 1.0, 1.0,
     0.5, -0.5, 1.0, 1.0,   -0.5, -0.5, 0.0, 1.0,
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
```

### Setting Up Vertex Attributes

```typescript
const FLOAT_SIZE = 4; // bytes
const STRIDE = 4 * FLOAT_SIZE; // 4 floats per vertex (x, y, u, v)

// Position attribute (2 floats, offset 0)
const posLoc = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);

// TexCoord attribute (2 floats, offset 8 bytes)
const uvLoc = gl.getAttribLocation(program, 'a_texCoord');
gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * FLOAT_SIZE);
```

### Index Buffers (EBOs/IBOs)

Index buffers let you reuse vertices, reducing memory usage and bandwidth.

```typescript
// A quad with 4 unique vertices + 6 indices (instead of 6 vertices)
const vertices = new Float32Array([
    // x,    y,   u,   v
    -0.5,  0.5, 0.0, 0.0,  // 0: top-left
     0.5,  0.5, 1.0, 0.0,  // 1: top-right
     0.5, -0.5, 1.0, 1.0,  // 2: bottom-right
    -0.5, -0.5, 0.0, 1.0,  // 3: bottom-left
]);

const indices = new Uint16Array([
    0, 1, 2,  // first triangle
    0, 2, 3,  // second triangle
]);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

// Draw with index buffer
gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
```

**Memory savings for a sprite batcher:**
- Without indices: 1000 sprites x 6 vertices = 6000 vertices
- With indices: 1000 sprites x 4 vertices + 6000 indices = 4000 vertices + 6000 shorts
- Savings grow as vertex size (stride) increases

---

## Texture Handling

### Loading Textures

```typescript
function loadTexture(gl: WebGLRenderingContext, url: string): Promise<WebGLTexture> {
    return new Promise((resolve, reject) => {
        const texture = gl.createTexture();
        if (!texture) {
            reject(new Error('Failed to create texture'));
            return;
        }

        const image = new Image();
        image.crossOrigin = 'anonymous';

        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);

            // Upload pixel data
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,              // mip level
                gl.RGBA,        // internal format
                gl.RGBA,        // source format
                gl.UNSIGNED_BYTE,
                image
            );

            // Set filtering
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            // Clamp to edge (important for NPOT textures and sprite atlases)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            resolve(texture);
        };

        image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        image.src = url;
    });
}
```

### UV Mapping

UV coordinates map texture pixels to vertices. Range is 0.0 to 1.0:
- (0, 0) = top-left of texture
- (1, 1) = bottom-right of texture

For sprite atlas sub-regions:

```typescript
function getAtlasUVs(
    atlasWidth: number,
    atlasHeight: number,
    spriteX: number,
    spriteY: number,
    spriteW: number,
    spriteH: number
): { u0: number; v0: number; u1: number; v1: number } {
    return {
        u0: spriteX / atlasWidth,
        v0: spriteY / atlasHeight,
        u1: (spriteX + spriteW) / atlasWidth,
        v1: (spriteY + spriteH) / atlasHeight,
    };
}
```

### Texture Filtering

| Filter | `TEXTURE_MIN_FILTER` | `TEXTURE_MAG_FILTER` | Use Case |
|--------|---------------------|---------------------|----------|
| `NEAREST` | Pixelated when small | Pixelated when big | Pixel art games |
| `LINEAR` | Blurred when small | Smoothed when big | Most 2D games |
| `NEAREST_MIPMAP_NEAREST` | Pixelated + mips | N/A | Pixel art at distance |
| `LINEAR_MIPMAP_LINEAR` | Trilinear | N/A | Highest quality 3D |

**Pixel art games should always use `NEAREST` filtering** to preserve crisp edges.

### Mipmaps

Mipmaps are pre-computed downscaled versions of a texture (1/2, 1/4, 1/8, etc.). They improve quality when textures are viewed at small sizes and improve cache performance.

```typescript
// Generate mipmaps (texture must be power-of-two in WebGL1)
gl.generateMipmap(gl.TEXTURE_2D);

// Use mipmap filtering
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
```

**Important**: In WebGL1, mipmaps require power-of-two textures (256, 512, 1024, etc.). WebGL2 removes this restriction.

### Texture Atlases

A texture atlas combines multiple sprites into a single texture. Benefits:
1. **Fewer texture binds** — switching textures is expensive
2. **Fewer draw calls** — sprites sharing an atlas can be batched
3. **Fewer HTTP requests** — one image file instead of hundreds

```typescript
// Atlas JSON format (TexturePacker style)
interface AtlasFrame {
    frame: { x: number; y: number; w: number; h: number };
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
}

interface AtlasData {
    frames: Record<string, AtlasFrame>;
    meta: {
        image: string;
        size: { w: number; h: number };
        scale: string;
    };
}
```

---

## Blend Modes and Transparency

### Alpha Blending Setup

```typescript
gl.enable(gl.BLEND);

// Standard alpha blending (pre-multiplied alpha is preferred for games)
// Normal alpha: gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
// Pre-multiplied alpha:
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
```

### Pre-multiplied Alpha

In pre-multiplied alpha, RGB values are already multiplied by the alpha channel:
- Standard: `(R, G, B, A)` = `(1.0, 0.0, 0.0, 0.5)` (50% red)
- Pre-multiplied: `(R*A, G*A, B*A, A)` = `(0.5, 0.0, 0.0, 0.5)`

Advantages of pre-multiplied alpha:
1. Correct filtering when texture edges blend with transparent pixels
2. Simpler blend equation: `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`
3. Supports both transparency and additive blending in the same image

### Common Blend Modes

```typescript
// Normal (pre-multiplied)
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

// Additive (glow effects, fire, particles)
gl.blendFunc(gl.ONE, gl.ONE);

// Multiply
gl.blendFunc(gl.DST_COLOR, gl.ZERO);

// Screen
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
```

### Sort Order for Transparency

Transparent objects must be drawn back-to-front for correct blending. Opaque objects should be drawn front-to-back to benefit from early depth rejection.

```typescript
// Typical render order for 2D games:
// 1. Background layers (furthest)
// 2. Game objects sorted by Y or Z position
// 3. Particle effects (often additive, order doesn't matter as much)
// 4. UI overlay (closest)
```

---

## WebGL2 Improvements

WebGL2 is based on OpenGL ES 3.0 and adds significant features relevant to game development.

### Vertex Array Objects (VAOs)

VAOs encapsulate vertex attribute state so you don't have to re-bind and re-configure attributes each frame.

```typescript
// WebGL2 — VAOs are core
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

// Set up all attributes once
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

gl.bindVertexArray(null);

// In render loop — single call to bind all state
gl.bindVertexArray(vao);
gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
```

### Instanced Rendering

Draw many copies of the same geometry with per-instance data (position, scale, color, etc.) in a single draw call.

```typescript
// Instance data buffer — one entry per sprite
const instanceData = new Float32Array(MAX_SPRITES * 8);
// Each instance: x, y, scaleX, scaleY, rotation, u0, v0, u1, v1...

const instanceBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

// Set up instance attributes
const offsetLoc = gl.getAttribLocation(program, 'a_offset');
gl.enableVertexAttribArray(offsetLoc);
gl.vertexAttribPointer(offsetLoc, 2, gl.FLOAT, false, INSTANCE_STRIDE, 0);
gl.vertexAttribDivisor(offsetLoc, 1);  // advance once per instance

const scaleLoc = gl.getAttribLocation(program, 'a_scale');
gl.enableVertexAttribArray(scaleLoc);
gl.vertexAttribPointer(scaleLoc, 2, gl.FLOAT, false, INSTANCE_STRIDE, 8);
gl.vertexAttribDivisor(scaleLoc, 1);

// Draw 1000 sprites with one draw call
gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, 1000);
```

### Other Key WebGL2 Features

| Feature | Game Dev Use |
|---------|-------------|
| **3D Textures** (`TEXTURE_3D`) | Volume effects, lookup tables |
| **Texture arrays** (`TEXTURE_2D_ARRAY`) | Multiple texture layers without atlas |
| **Non-power-of-two textures** | Any texture size works fully |
| **Multiple Render Targets (MRT)** | Deferred rendering, G-buffers |
| **Transform Feedback** | GPU-side particle simulation |
| **Uniform Buffer Objects (UBOs)** | Shared uniforms across shaders |
| **Integer attributes** | Pass int data to shaders |
| **`gl.fenceSync`** | Async GPU queries |

---

## Common 2D Game Techniques in WebGL

### Sprite Batching

The most important optimization for 2D WebGL games. Instead of one draw call per sprite, batch many sprites into a single draw call.

```typescript
class SpriteBatcher {
    private readonly maxSprites: number;
    private readonly vertexData: Float32Array;
    private readonly indexData: Uint16Array;
    private spriteCount: number;
    private currentTexture: WebGLTexture | null;

    constructor(gl: WebGL2RenderingContext, maxSprites: number = 2000) {
        this.maxSprites = maxSprites;
        this.spriteCount = 0;
        this.currentTexture = null;

        // 4 vertices per sprite, each vertex has: x, y, u, v, r, g, b, a
        const FLOATS_PER_VERTEX = 8;
        const VERTICES_PER_SPRITE = 4;
        this.vertexData = new Float32Array(maxSprites * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);

        // 6 indices per sprite (two triangles)
        this.indexData = new Uint16Array(maxSprites * 6);
        for (let i = 0; i < maxSprites; i++) {
            const vi = i * 4;
            const ii = i * 6;
            this.indexData[ii + 0] = vi + 0;
            this.indexData[ii + 1] = vi + 1;
            this.indexData[ii + 2] = vi + 2;
            this.indexData[ii + 3] = vi + 0;
            this.indexData[ii + 4] = vi + 2;
            this.indexData[ii + 5] = vi + 3;
        }
    }

    drawSprite(
        texture: WebGLTexture,
        x: number, y: number,
        width: number, height: number,
        u0: number, v0: number,
        u1: number, v1: number,
        r: number, g: number, b: number, a: number
    ): void {
        // Flush if texture changes or batch is full
        if (this.currentTexture !== null &&
            this.currentTexture !== texture) {
            this.flush();
        }
        if (this.spriteCount >= this.maxSprites) {
            this.flush();
        }

        this.currentTexture = texture;

        const offset = this.spriteCount * 4 * 8; // 4 verts, 8 floats each
        const d = this.vertexData;

        // Top-left
        d[offset +  0] = x;         d[offset +  1] = y;
        d[offset +  2] = u0;        d[offset +  3] = v0;
        d[offset +  4] = r;         d[offset +  5] = g;
        d[offset +  6] = b;         d[offset +  7] = a;

        // Top-right
        d[offset +  8] = x + width; d[offset +  9] = y;
        d[offset + 10] = u1;        d[offset + 11] = v0;
        d[offset + 12] = r;         d[offset + 13] = g;
        d[offset + 14] = b;         d[offset + 15] = a;

        // Bottom-right
        d[offset + 16] = x + width; d[offset + 17] = y + height;
        d[offset + 18] = u1;        d[offset + 19] = v1;
        d[offset + 20] = r;         d[offset + 21] = g;
        d[offset + 22] = b;         d[offset + 23] = a;

        // Bottom-left
        d[offset + 24] = x;         d[offset + 25] = y + height;
        d[offset + 26] = u0;        d[offset + 27] = v1;
        d[offset + 28] = r;         d[offset + 29] = g;
        d[offset + 30] = b;         d[offset + 31] = a;

        this.spriteCount++;
    }

    flush(): void {
        if (this.spriteCount === 0) return;

        // Bind texture, upload vertex data, draw, reset count
        // ... (gl calls omitted for brevity)
        this.spriteCount = 0;
    }
}
```

### Instanced Quads

An alternative to sprite batching: use instanced rendering where a single unit quad is drawn many times with per-instance transforms.

```glsl
// Vertex shader for instanced sprites
#version 300 es

// Per-vertex (unit quad)
in vec2 a_quadVertex;  // (0,0), (1,0), (1,1), (0,1)

// Per-instance
in vec2 a_position;
in vec2 a_size;
in vec4 a_uvRect;      // u0, v0, u1, v1
in vec4 a_color;

uniform mat3 u_projection;

out vec2 v_texCoord;
out vec4 v_color;

void main() {
    // Scale and position the unit quad
    vec2 worldPos = a_position + a_quadVertex * a_size;
    vec3 projected = u_projection * vec3(worldPos, 1.0);
    gl_Position = vec4(projected.xy, 0.0, 1.0);

    // Interpolate UV within the atlas region
    v_texCoord = mix(a_uvRect.xy, a_uvRect.zw, a_quadVertex);
    v_color = a_color;
}
```

**Batching vs Instancing comparison:**

| Aspect | Sprite Batching | Instanced Quads |
|--------|----------------|-----------------|
| Draw calls | 1 per batch | 1 per batch |
| CPU overhead | Must fill vertex buffer | Must fill instance buffer |
| Vertex count | 4 per sprite | 4 total (shared) |
| Rotation support | CPU transform per vertex | Shader transform |
| Compatibility | WebGL1 | WebGL2 (or extension) |

---

## Three.js Overview

Three.js is the most popular 3D rendering library for the web. While primarily for 3D, it's also used for 2D games with 3D effects.

### Scene Graph

```typescript
import * as THREE from 'three';

// Scene — the root container
const scene = new THREE.Scene();

// Camera — defines what we see
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 5;

// For 2D games, use OrthographicCamera
const camera2D = new THREE.OrthographicCamera(
    -width / 2, width / 2,      // left, right
    height / 2, -height / 2,    // top, bottom
    0.1, 100                     // near, far
);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);
```

### Materials and Meshes

```typescript
// Geometry + Material = Mesh
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    metalness: 0.3,
    roughness: 0.7,
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Sprite (always faces camera, common for 2D in 3D scenes)
const spriteTexture = new THREE.TextureLoader().load('character.png');
const spriteMaterial = new THREE.SpriteMaterial({ map: spriteTexture });
const sprite = new THREE.Sprite(spriteMaterial);
sprite.scale.set(2, 2, 1);
scene.add(sprite);
```

### Render Loop

```typescript
function animate(): void {
    requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
}
animate();
```

### Key Three.js Concepts for Games

| Concept | Description |
|---------|-------------|
| **Scene Graph** | Tree of objects; transforms are inherited (parent affects children) |
| **Geometry** | Vertex data (BufferGeometry for custom, BoxGeometry, PlaneGeometry for built-in) |
| **Material** | Surface appearance (MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial) |
| **Raycaster** | Click/hover detection by casting rays from camera through mouse position |
| **Texture Loader** | Async image loading with caching |
| **Post-processing** | EffectComposer with render passes (bloom, SSAO, etc.) |

---

## PixiJS Overview

PixiJS is the premier 2D WebGL rendering engine. It's not a game engine — it handles rendering, and you add game logic yourself (or use a framework like Phaser, which used to use PixiJS internally).

### Display Objects

PixiJS uses a display tree (like the DOM but for GPU rendering):

```typescript
import * as PIXI from 'pixi.js';

const app = new PIXI.Application();
await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x1099bb,
});
document.body.appendChild(app.canvas);

// Container — groups display objects
const gameWorld = new PIXI.Container();
app.stage.addChild(gameWorld);

// Sprite — textured quad
const texture = await PIXI.Assets.load('bunny.png');
const bunny = new PIXI.Sprite(texture);
bunny.anchor.set(0.5);  // center the anchor
bunny.x = 400;
bunny.y = 300;
gameWorld.addChild(bunny);
```

### Sprite Sheets

```typescript
// Load a spritesheet
const sheet = await PIXI.Assets.load('spritesheet.json');

// Access individual frames
const frame1 = new PIXI.Sprite(sheet.textures['walk_01.png']);
const frame2 = new PIXI.Sprite(sheet.textures['walk_02.png']);

// Animated sprite from spritesheet
const walkFrames = [];
for (let i = 1; i <= 8; i++) {
    walkFrames.push(sheet.textures[`walk_${String(i).padStart(2, '0')}.png`]);
}

const animatedSprite = new PIXI.AnimatedSprite(walkFrames);
animatedSprite.animationSpeed = 0.15;
animatedSprite.play();
app.stage.addChild(animatedSprite);
```

### Filters (Shaders)

PixiJS filters apply WebGL shaders to display objects:

```typescript
// Built-in filters
const blur = new PIXI.BlurFilter({ strength: 4 });
const colorMatrix = new PIXI.ColorMatrixFilter();
colorMatrix.brightness(1.5);

sprite.filters = [blur, colorMatrix];

// Custom filter (fragment shader)
const customFilter = new PIXI.Filter({
    glProgram: new PIXI.GlProgram({
        fragment: `
            in vec2 vTextureCoord;
            uniform sampler2D uTexture;
            uniform float uTime;

            void main() {
                vec2 uv = vTextureCoord;
                uv.x += sin(uv.y * 10.0 + uTime) * 0.02;
                gl_FragColor = texture2D(uTexture, uv);
            }
        `,
    }),
    resources: {
        customUniforms: { uTime: { value: 0, type: 'f32' } },
    },
});
```

### PixiJS Renderer Internals

PixiJS automatically batches sprites that share the same texture into a single draw call. The `BatchRenderer` is its core optimization. Key numbers:
- Default batch size: ~4096 sprites per draw call
- Batch break triggers: texture change, blend mode change, filter, mask
- Typical 2D game: 5-20 draw calls per frame (with good atlas usage)

---

## WebGPU Preview

WebGPU is the successor to WebGL, providing a modern, low-level GPU API modeled after Vulkan, Metal, and Direct3D 12.

### Key Differences from WebGL

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| API Model | OpenGL ES (stateful) | Modern (descriptor-based) |
| Shader Language | GLSL | WGSL |
| Command Submission | Immediate | Command buffers |
| Compute Shaders | No (WebGL2 has limited transform feedback) | Yes, first-class |
| Multi-threaded | No | Yes (command encoding on workers) |
| Pipeline State | Mutable global state | Immutable pipeline objects |
| Validation | Runtime (slow) | Creation time (fast at runtime) |

### Basic WebGPU Setup

```typescript
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU not supported');

const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format });

// Create a render pipeline (immutable — no state mutation!)
const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: device.createShaderModule({ code: vertexWGSL }),
        entryPoint: 'main',
    },
    fragment: {
        module: device.createShaderModule({ code: fragmentWGSL }),
        entryPoint: 'main',
        targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
});
```

### WGSL Shader Example

```wgsl
// Vertex shader
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
};

@vertex
fn vertexMain(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(pos, 0.0, 1.0);
    output.texCoord = uv;
    return output;
}

// Fragment shader
@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
    return textureSample(myTexture, mySampler, uv);
}
```

### WebGPU Compute Shaders for Games

Compute shaders unlock GPU-accelerated game logic:
- **Particle simulation**: Update millions of particles on the GPU
- **Pathfinding**: Parallel BFS/Dijkstra on grid maps
- **Physics**: Broad-phase collision detection
- **Procedural generation**: Noise functions, terrain generation

```wgsl
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn updateParticles(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;
    if (i >= arrayLength(&particles)) { return; }

    particles[i].velocity += particles[i].acceleration * deltaTime;
    particles[i].position += particles[i].velocity * deltaTime;
    particles[i].life -= deltaTime;
}
```

### Current Status (2025-2026)

- Supported in Chrome, Edge, Firefox (behind flag), Safari (partial)
- Three.js has a WebGPU renderer (`THREE.WebGPURenderer`)
- PixiJS v8 has WebGPU support
- Babylon.js has WebGPU support
- For production games targeting broad audiences, WebGL2 is still the safe choice
- WebGPU is ideal for new projects that can tolerate narrower browser support

---

## Performance: Draw Call Batching

### Why Draw Calls Matter

Each draw call (`gl.drawArrays` / `gl.drawElements`) has overhead:
1. CPU-side: driver validation, state checking, command buffer building
2. GPU-side: pipeline state changes, cache flushes

**Rule of thumb**: Keep draw calls under 100-200 per frame for mobile, under 500 for desktop.

### Texture Atlas Packing

Packing sprites into atlases is the single most impactful optimization for draw call reduction.

```typescript
// Tools for atlas packing:
// - TexturePacker (commercial, excellent)
// - free-tex-packer (open source)
// - Shoebox (free)
// - Custom MaxRects packer (see sprite chapter)

// Atlas size limits:
// Mobile WebGL: 2048x2048 (safe), 4096x4096 (most devices)
// Desktop WebGL: 4096x4096 (safe), 8192x8192 (most GPUs)
// Check: gl.getParameter(gl.MAX_TEXTURE_SIZE)
```

### Reducing Draw Calls Checklist

1. **Use texture atlases** — sprites sharing a texture can be batched
2. **Sort by texture** — render all sprites of atlas A, then atlas B
3. **Use sprite batching** — combine multiple sprites into one draw call
4. **Minimize blend mode changes** — group by blend mode
5. **Avoid per-object shaders** — use uber-shaders with uniforms
6. **Use instanced rendering** (WebGL2) — one draw call for many identical meshes
7. **Reduce filter/mask usage** — each PixiJS filter is an extra draw call + FBO

### Profiling GPU Performance

```typescript
// WebGL extension for GPU timing
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
if (ext) {
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    // ... render ...
    gl.endQuery(ext.TIME_ELAPSED_EXT);

    // Check result later (async)
    const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
    if (available) {
        const elapsed = gl.getQueryParameter(query, gl.QUERY_RESULT);
        const ms = elapsed / 1_000_000; // nanoseconds to milliseconds
    }
}

// Browser tools:
// - Chrome DevTools > Performance > GPU
// - Spector.js — WebGL call inspector (browser extension)
// - RenderDoc — GPU frame debugger (desktop, not browser)
```

---

## Memory Management

### Texture Memory

```typescript
// Estimate texture memory:
// RGBA (4 bytes/pixel) at 2048x2048 = 16 MB
// With mipmaps: ~21.3 MB (4/3 ratio)

function estimateTextureMemory(width: number, height: number, withMipmaps: boolean): number {
    const baseSize = width * height * 4; // RGBA
    return withMipmaps ? Math.ceil(baseSize * (4 / 3)) : baseSize;
}

// Mobile budget: 50-100 MB total texture memory
// Desktop budget: 200-500 MB
```

### Cleaning Up Resources

WebGL resources are not garbage collected — you must manually delete them.

```typescript
function destroySpriteBatcher(gl: WebGLRenderingContext, batcher: {
    vertexBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    vao: WebGLVertexArrayObject | null;
    program: WebGLProgram;
    textures: WebGLTexture[];
}): void {
    gl.deleteBuffer(batcher.vertexBuffer);
    gl.deleteBuffer(batcher.indexBuffer);
    if (batcher.vao) gl.deleteVertexArray(batcher.vao);
    gl.deleteProgram(batcher.program);
    batcher.textures.forEach(tex => gl.deleteTexture(tex));
}
```

### Context Loss Handling

The browser can destroy the WebGL context at any time (GPU reset, memory pressure, tab backgrounding). Your game must handle this gracefully.

```typescript
const canvas = document.getElementById('game') as HTMLCanvasElement;

canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // Prevents default behavior (allows restoration)
    // Stop the game loop
    cancelAnimationFrame(animationFrameId);
    // Show "reconnecting" UI
});

canvas.addEventListener('webglcontextrestored', () => {
    // Recreate ALL GPU resources:
    // - Shaders and programs
    // - Buffers
    // - Textures
    // - Framebuffers
    // - VAOs
    initWebGL();
    // Resume game loop
    requestAnimationFrame(gameLoop);
});
```

**Key points about context loss:**
- All GPU resources (textures, buffers, shaders) are destroyed
- JavaScript objects (references to WebGL objects) become invalid
- You must recreate everything from scratch
- Use a resource manager that can reload all assets
- `event.preventDefault()` tells the browser you want to restore the context

---

## Interview Questions

### Q1: Walk me through what happens when you draw a textured sprite in WebGL, from JavaScript to pixels on screen.

**A:** The process involves several stages:

1. **CPU Setup (JavaScript):**
   - Bind the shader program containing the vertex and fragment shaders
   - Bind the vertex buffer containing quad vertices (position + UV coordinates)
   - Bind the index buffer (6 indices for 2 triangles making a quad)
   - Set uniforms: projection matrix, model transform, texture sampler unit
   - Bind the texture to a texture unit (`gl.activeTexture`, `gl.bindTexture`)
   - Issue `gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)`

2. **Vertex Shader (GPU):**
   - Runs 4 times (once per vertex of the quad)
   - Multiplies each vertex position by the model and projection matrices
   - Outputs clip-space position (`gl_Position`) and passes UV coordinates as a varying

3. **Primitive Assembly:**
   - Groups the 4 vertices into 2 triangles using the index buffer

4. **Rasterization:**
   - Determines which screen pixels each triangle covers
   - Interpolates the varying UV coordinates across each triangle using barycentric interpolation

5. **Fragment Shader (GPU):**
   - Runs once per covered pixel
   - Samples the texture at the interpolated UV coordinate (`texture2D(sampler, uv)`)
   - Outputs the sampled color, potentially tinted by a uniform color

6. **Per-Fragment Operations:**
   - Alpha blending combines the fragment color with whatever is already in the framebuffer
   - The result is written to the framebuffer (screen)

---

### Q2: What is the difference between `gl.STATIC_DRAW`, `gl.DYNAMIC_DRAW`, and `gl.STREAM_DRAW`? When would you use each?

**A:** These are usage hints that tell the GPU driver how to allocate memory:

- **`gl.STATIC_DRAW`**: Data is set once and used many times. The driver may place it in fast GPU memory. Use for: level geometry, index buffers, unit quad vertices — anything that doesn't change.

- **`gl.DYNAMIC_DRAW`**: Data is changed occasionally and used many times. Use for: sprite batch vertex data that updates every frame, particle position buffers.

- **`gl.STREAM_DRAW`**: Data is set once and used at most a few times before being replaced. Use for: immediate-mode style rendering, one-shot vertex uploads.

In practice, sprite batchers typically use `gl.DYNAMIC_DRAW` because the vertex data changes every frame. The index buffer can be `gl.STATIC_DRAW` because the pattern (0,1,2,0,2,3, 4,5,6,4,6,7, ...) never changes.

Note: These are *hints* — the driver may ignore them. But correct hints can improve performance, especially on mobile GPUs.

---

### Q3: Explain pre-multiplied alpha. Why is it preferred for game rendering?

**A:** In standard (straight) alpha, the RGB channels store the full color and alpha is separate: `(R, G, B, A)`. A 50% transparent red pixel is `(1.0, 0.0, 0.0, 0.5)`.

In pre-multiplied alpha, RGB is already multiplied by alpha: `(R*A, G*A, B*A, A)`. That same pixel becomes `(0.5, 0.0, 0.0, 0.5)`.

Pre-multiplied alpha is preferred because:

1. **Correct texture filtering**: When the GPU interpolates between a colored texel and a transparent texel (e.g., at sprite edges), straight alpha produces dark halos. Pre-multiplied alpha interpolates correctly because the color contribution is already scaled by opacity.

2. **Simpler blend equation**: The blend function is just `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)` — no need to multiply source color by alpha in the blend stage.

3. **Additive + transparent in one texture**: Pre-multiplied alpha can represent both transparency (where RGB < A) and additive glow (where RGB > 0 but A = 0). This is impossible with straight alpha.

4. **Associative compositing**: Pre-multiplied alpha compositing is associative — `A over (B over C) = (A over B) over C`. This matters for render-to-texture and multi-pass effects.

---

### Q4: You have 500 different sprites on screen. How do you minimize draw calls?

**A:** The key strategies are:

1. **Texture atlases**: Pack all 500 sprites into as few atlas textures as possible (ideally one). Sprites sharing a texture can be batched into a single draw call.

2. **Sprite batching**: Use a sprite batcher that accumulates quad vertices into a large vertex buffer and issues one `drawElements` call per texture. With one atlas, that's one draw call for all 500 sprites.

3. **Sort by texture**: If multiple atlases are needed, sort sprites by texture before rendering. This minimizes texture switches. Each texture switch forces a batch flush.

4. **Minimize state changes**: Beyond textures, avoid unnecessary blend mode changes, shader switches, or uniform updates mid-batch.

5. **Instanced rendering** (WebGL2): Instead of building a vertex buffer, use a unit quad with per-instance attributes (position, size, UV rect). This can be faster for very large sprite counts because you upload less data.

With a single atlas and a good batcher, 500 sprites can be drawn in 1 draw call. Without batching, you'd have 500 draw calls, which would be a severe bottleneck on mobile.

---

### Q5: What happens during a WebGL context loss? How should a game handle it?

**A:** WebGL context loss occurs when the browser destroys the GPU context. Common triggers:
- GPU driver crash or reset
- System memory pressure
- Too many contexts open (browsers limit to ~16)
- Tab backgrounded for too long (mobile browsers)
- Device sleep/wake

When context is lost:
- **All GPU resources are destroyed**: textures, buffers, shaders, programs, framebuffers, VAOs — everything
- JavaScript references to these objects become invalid stubs
- Any `gl` calls return errors or no-ops
- The `webglcontextlost` event fires on the canvas

To handle it properly:

1. Listen for `webglcontextlost` and call `event.preventDefault()` (this signals you want restoration)
2. Stop the game loop and show a loading/reconnecting overlay
3. Listen for `webglcontextrestored`
4. On restoration, recreate **all** GPU resources from scratch: recompile shaders, re-upload textures, rebuild buffers
5. Resume the game loop

The critical architectural pattern is to maintain a resource manager that can recreate everything. Never store GPU resource handles as the sole reference to an asset — always keep the source data (image elements, shader source strings, vertex arrays) so you can re-upload.

---

### Q6: Compare WebGL1 and WebGL2 for a 2D game engine. What does WebGL2 give you?

**A:** For a 2D game engine, the most impactful WebGL2 additions are:

1. **Vertex Array Objects (VAOs)**: Core in WebGL2 (extension in WebGL1). Encapsulate vertex attribute state, reducing per-frame setup overhead. Instead of calling `enableVertexAttribArray` and `vertexAttribPointer` every frame, bind a VAO once.

2. **Instanced rendering**: `drawElementsInstanced` + `vertexAttribDivisor` enable drawing thousands of sprites with one draw call and minimal CPU work. Instead of filling a vertex buffer, you fill a compact instance buffer.

3. **Non-power-of-two textures**: WebGL1 requires POT textures for mipmaps and repeating wrap modes. WebGL2 removes this restriction, simplifying atlas management.

4. **Multiple Render Targets**: Render to multiple textures simultaneously — useful for effects like bloom (render bright pixels to a separate target).

5. **Transform Feedback**: Write vertex shader outputs to a buffer — enables GPU-side particle simulation without compute shaders.

6. **`TEXTURE_2D_ARRAY`**: Layer multiple textures without an atlas. Each layer is a separate sprite sheet. Avoids atlas packing complexity.

For most 2D games, VAOs and instanced rendering are the biggest wins. WebGL2 support is now at 97%+ on desktop and 90%+ on mobile (2025), so there's little reason to target WebGL1 unless you need very old device support.

---

### Q7: What is a framebuffer object (FBO) and how is it used in 2D game rendering?

**A:** A Framebuffer Object (FBO) lets you render to a texture instead of the screen. This is called "render-to-texture" or "offscreen rendering."

Common uses in 2D games:

1. **Post-processing effects**: Render the entire scene to an FBO, then draw a full-screen quad with a shader that applies bloom, vignette, color grading, CRT scanlines, etc.

2. **Filters/Masks**: PixiJS uses FBOs internally for every filter. The display object is rendered to an FBO, the filter shader processes it, and the result is drawn back.

3. **Screen transitions**: Capture the current frame to a texture, then animate a transition (dissolve, wipe, pixelate) between the old and new scenes.

4. **Minimap**: Render the game world from a zoomed-out camera to an FBO, display it as a UI element.

5. **Light maps**: Render lights to an FBO, then multiply or blend it with the scene.

Performance consideration: Each FBO switch is a state change that can break batching. Minimize FBO switches by ordering render passes carefully.

---

### Q8: How does PixiJS achieve sprite batching internally?

**A:** PixiJS v7/v8 uses a `BatchRenderer` that automatically batches sprites:

1. **Traversal**: PixiJS walks the display tree (scene graph) in order
2. **Batch accumulation**: For each sprite, it checks if it can be added to the current batch. A sprite is compatible if it uses the same texture, blend mode, and shader as the current batch
3. **Vertex writing**: Compatible sprites have their quad vertices written into a shared Float32Array
4. **Flush**: When a batch break occurs (texture change, blend mode change, filter, mask, or batch full), the accumulated vertices are uploaded to a GPU buffer and drawn in one `drawElements` call
5. **Multi-texture batching** (v7+): PixiJS can bind up to `MAX_TEXTURE_IMAGE_UNITS` textures simultaneously (typically 8-16). Sprites using different textures can still be in the same batch — the shader uses a texture ID attribute to select which texture unit to sample from

This means with 8 texture units, you could have 8 different atlases and still batch everything into one draw call — as long as blend mode and shader don't change.

---

### Q9: What is WebGPU and why does it matter for game development?

**A:** WebGPU is the next-generation GPU API for the web, designed to replace WebGL. It matters for games because:

1. **Compute shaders**: First-class compute support enables GPU-accelerated particles, physics, pathfinding, and procedural generation — all running on the GPU in parallel.

2. **Reduced CPU overhead**: WebGPU uses command buffers and immutable pipeline state objects. State validation happens at creation time, not at draw time. This means less CPU work per frame.

3. **Multi-threaded command recording**: Command encoders can be created on Web Workers, enabling parallel scene preparation.

4. **Modern shader language (WGSL)**: Purpose-built for the web, with better tooling and safety guarantees than GLSL.

5. **Better GPU utilization**: Explicit resource binding and pipeline management give developers more control, similar to Vulkan/Metal/DX12.

6. **Indirect drawing**: `drawIndirect` / `drawIndexedIndirect` let the GPU decide how many instances to draw, enabling GPU-driven rendering.

For practical adoption (as of 2025-2026): WebGL2 is still the safe choice for broad compatibility. WebGPU is available in Chrome and Edge, partially in Safari, and behind flags in Firefox. Three.js, PixiJS v8, and Babylon.js all support WebGPU renderers.

---

### Q10: How would you implement a glow effect for a sprite in WebGL?

**A:** A glow effect is typically implemented with a multi-pass approach:

1. **Render the sprite to an FBO** (render-to-texture)
2. **Downsample**: Render the FBO texture to a smaller FBO (e.g., 1/4 resolution)
3. **Horizontal blur pass**: Render the downsampled texture through a Gaussian blur shader (horizontal only) to another FBO
4. **Vertical blur pass**: Render the horizontally-blurred texture through a vertical Gaussian blur shader to another FBO
5. **Composite**: Draw the original sprite normally, then draw the blurred texture on top with additive blending

Separating the blur into horizontal and vertical passes is critical — it reduces the complexity from O(n^2) to O(2n) samples per pixel.

```glsl
// Simple Gaussian blur fragment shader (one direction)
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_direction;  // (1/width, 0) for horizontal, (0, 1/height) for vertical
uniform float u_weights[5]; // pre-computed Gaussian weights

void main() {
    vec4 color = texture2D(u_texture, v_texCoord) * u_weights[0];

    for (int i = 1; i < 5; i++) {
        float offset = float(i);
        color += texture2D(u_texture, v_texCoord + u_direction * offset) * u_weights[i];
        color += texture2D(u_texture, v_texCoord - u_direction * offset) * u_weights[i];
    }

    gl_FragColor = color;
}
```

In PixiJS, you can achieve this with `new PIXI.BlurFilter()` applied to a sprite — it handles the multi-pass internally. For custom glow, use `PIXI.Filter` with a custom shader.

---

### Q11: What are the key differences between a vertex buffer and an index buffer?

**A:**

| Aspect | Vertex Buffer (VBO) | Index Buffer (EBO/IBO) |
|--------|---------------------|------------------------|
| **Contains** | Vertex attribute data (position, UV, color, normal) | Integer indices into the vertex buffer |
| **Data type** | Usually `Float32Array` | `Uint16Array` or `Uint32Array` |
| **Bind target** | `gl.ARRAY_BUFFER` | `gl.ELEMENT_ARRAY_BUFFER` |
| **Purpose** | Define unique vertex data | Reuse vertices by referencing them by index |
| **Draw call** | `gl.drawArrays(mode, offset, count)` | `gl.drawElements(mode, count, type, offset)` |

Without index buffers, a quad requires 6 vertices (3 per triangle, 2 triangles). Two vertices are duplicated. With index buffers, you store only 4 unique vertices and 6 indices pointing to them. For a sprite batcher with 1000 quads, this saves 2000 vertex copies — significant when each vertex has 8+ floats.

---

### Q12: You need to render a tiled background with thousands of tiles. What approach would you take?

**A:** For a tiled background, there are several approaches ranked by performance:

**Best: Single-draw tilemap shader**
- Upload the tile map as a data texture (each pixel = tile ID)
- Render a single full-screen quad
- In the fragment shader, compute which tile the pixel belongs to, look up the tile ID from the data texture, and sample the tile atlas

```glsl
uniform sampler2D u_tileMap;     // tile indices
uniform sampler2D u_tileAtlas;   // tile graphics
uniform vec2 u_mapSize;          // map dimensions in tiles
uniform vec2 u_tileSize;         // tile size in pixels
uniform vec2 u_atlasSize;        // atlas dimensions in tiles

void main() {
    vec2 tileCoord = floor(gl_FragCoord.xy / u_tileSize);
    vec4 tileData = texture2D(u_tileMap, tileCoord / u_mapSize);
    float tileId = tileData.r * 255.0; // decode tile ID

    // Calculate UV in the atlas
    vec2 tileOffset = vec2(mod(tileId, u_atlasSize.x), floor(tileId / u_atlasSize.x));
    vec2 withinTile = fract(gl_FragCoord.xy / u_tileSize);
    vec2 atlasUV = (tileOffset + withinTile) / u_atlasSize;

    gl_FragColor = texture2D(u_tileAtlas, atlasUV);
}
```

**Good: Instanced quads (WebGL2)**
- Use instanced rendering with per-instance tile position and atlas UV
- One draw call for all visible tiles

**Acceptable: Sprite batch**
- Add each visible tile to a sprite batcher
- Use frustum culling to only render on-screen tiles
- Still one draw call if all tiles share one atlas

The key optimization regardless of approach: **only render visible tiles**. If the map is 1000x1000 but only 20x15 tiles are visible, calculate the visible range and skip the rest.

---

### Q13: What is `gl.getParameter(gl.MAX_TEXTURE_SIZE)` and why does it matter?

**A:** `gl.MAX_TEXTURE_SIZE` returns the maximum dimension (width or height) of a 2D texture that the GPU supports. Common values:

| Platform | Typical Max |
|----------|-------------|
| Low-end mobile | 2048 |
| Mid-range mobile | 4096 |
| Desktop | 8192 or 16384 |

This matters for games because:
1. **Atlas size planning**: Your texture atlases must not exceed this limit. If you pack sprites into a 4096x4096 atlas but the device supports only 2048x2048, the texture upload will fail silently or produce a black texture.
2. **Multi-resolution assets**: Ship 2048 atlases for mobile and 4096 for desktop, or check the limit at runtime and load appropriate assets.
3. **Memory budget**: A 4096x4096 RGBA texture = 64 MB. On mobile, you might only have 100-200 MB total for textures. Planning atlas sizes relative to the memory budget is critical.

Always query this value at initialization and use it to inform your asset loading strategy.

---

### Q14: Explain the difference between `gl.texParameteri` options: NEAREST vs LINEAR, and CLAMP_TO_EDGE vs REPEAT.

**A:**

**Filtering (how to sample between texels):**
- `gl.NEAREST`: Returns the color of the nearest texel. Produces sharp, pixelated edges. Required for pixel art games to maintain crisp pixels.
- `gl.LINEAR`: Blends the 4 nearest texels using bilinear interpolation. Produces smooth results. Best for photographic or high-res art.

**Wrapping (what happens at UV coordinates outside 0-1):**
- `gl.CLAMP_TO_EDGE`: UVs outside 0-1 are clamped. The edge pixel is stretched. Essential for sprite atlases — prevents adjacent sprites from bleeding into each other.
- `gl.REPEAT`: UVs wrap around. UV 1.5 becomes 0.5. Used for tiling textures (backgrounds, terrain).
- `gl.MIRRORED_REPEAT`: Like REPEAT but alternates direction. UV 1.5 maps to 0.5 reversed.

For sprite atlases, always use `CLAMP_TO_EDGE`. Even with a single sprite texture, `CLAMP_TO_EDGE` is safest. Only use `REPEAT` for dedicated tiling textures.

For sprite atlases, there's an additional concern: half-pixel offsets. When using `LINEAR` filtering with an atlas, texels at the edge of a sprite's UV region can blend with adjacent sprites. The fix is to add 0.5-1px padding between sprites in the atlas and/or inset UVs by half a texel.
