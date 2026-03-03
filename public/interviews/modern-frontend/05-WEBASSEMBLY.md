# WebAssembly for Frontend Developers

## Overview

WebAssembly (WASM) is a binary instruction format that runs in the browser alongside JavaScript. It executes at near-native speed, making it practical to run compute-heavy workloads that JavaScript cannot handle efficiently: image processing, video codecs, cryptography, physics simulations, database engines, and entire applications ported from C/C++/Rust.

For frontend developers, WASM is not a JavaScript replacement -- it is a complement. You still use JavaScript for DOM manipulation, event handling, and application logic. WASM handles the hot paths where performance matters: the image filter that processes 4K pixels, the SQLite engine running in the browser, or the compression algorithm that needs to be fast.

Senior frontend interviews test whether you understand what WASM is, when it makes sense, and when JavaScript is perfectly fine. This guide covers the fundamentals, the Rust-to-WASM toolchain, practical integration patterns, and real production use cases.

---

## Core Concepts

### What Is WebAssembly?

WebAssembly is a low-level, binary format designed as a compilation target for high-level languages. It runs in a sandboxed virtual machine inside the browser (or server, via WASI).

```
Source Code (Rust, C, C++, Go, etc.)
        |
        v
    Compiler (e.g., rustc, emscripten)
        |
        v
    .wasm binary (compact, fast to decode)
        |
        v
    Browser WASM engine (V8, SpiderMonkey, JavaScriptCore)
        |
        v
    Near-native execution speed
```

**Key properties:**
- **Binary format:** Compact encoding, fast to decode and compile (10-100x faster than parsing JS)
- **Sandboxed:** Runs in the same security sandbox as JavaScript. No direct OS access
- **Portable:** Same `.wasm` file runs in any browser, any OS, any architecture
- **Interoperable:** WASM modules export functions callable from JavaScript
- **Deterministic:** No garbage collector pauses, predictable performance

### When to Use WASM (and When Not To)

**Use WASM when:**
- CPU-intensive computation: image processing, audio synthesis, physics, cryptography
- Porting existing native code: C/C++ libraries, Rust crates, game engines
- Consistent performance: no GC pauses, no JIT warmup, predictable latency
- Large computation on binary data: compression, encoding, parsing binary formats

**Do NOT use WASM when:**
- DOM manipulation: WASM cannot touch the DOM directly. Every DOM call goes through JS
- Simple application logic: the overhead of JS-WASM interop negates performance gains
- Network-heavy code: fetch, WebSocket, and other I/O are JavaScript's strength
- Small computations: the cost of calling into WASM exceeds the computation itself
- You need fast startup: WASM modules must be downloaded, compiled, and instantiated

```
Performance sweet spot:

  JS faster  |  Roughly equal  |  WASM faster
  <----------|-----------------|------------>
  DOM ops    |  Medium compute |  Heavy compute
  I/O        |  String ops     |  Binary data
  Glue code  |  JSON parsing   |  Image processing
  Events     |  Small arrays   |  Large arrays
  Async I/O  |  Regex          |  Crypto/hashing
```

### The Rust-to-WASM Pipeline

Rust is the most popular language for frontend WASM because of its small runtime (no GC), excellent tooling (`wasm-pack`), and strong community support.

**Setup:**

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack (builds Rust to WASM + generates JS bindings)
cargo install wasm-pack
```

**Example: Image processing in Rust compiled to WASM**

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

// Expose function to JavaScript
#[wasm_bindgen]
pub fn grayscale(pixels: &mut [u8]) {
    // pixels is RGBA data (4 bytes per pixel)
    for chunk in pixels.chunks_exact_mut(4) {
        let r = chunk[0] as f32;
        let g = chunk[1] as f32;
        let b = chunk[2] as f32;

        // Luminance formula
        let gray = (0.299 * r + 0.587 * g + 0.114 * b) as u8;

        chunk[0] = gray;
        chunk[1] = gray;
        chunk[2] = gray;
        // chunk[3] (alpha) unchanged
    }
}

#[wasm_bindgen]
pub fn blur(pixels: &mut [u8], width: u32, height: u32, radius: u32) {
    // Box blur implementation
    let len = (width * height * 4) as usize;
    let mut output = vec![0u8; len];

    for y in 0..height {
        for x in 0..width {
            let mut r_sum: u32 = 0;
            let mut g_sum: u32 = 0;
            let mut b_sum: u32 = 0;
            let mut count: u32 = 0;

            let y_start = y.saturating_sub(radius);
            let y_end = (y + radius + 1).min(height);
            let x_start = x.saturating_sub(radius);
            let x_end = (x + radius + 1).min(width);

            for ky in y_start..y_end {
                for kx in x_start..x_end {
                    let idx = ((ky * width + kx) * 4) as usize;
                    r_sum += pixels[idx] as u32;
                    g_sum += pixels[idx + 1] as u32;
                    b_sum += pixels[idx + 2] as u32;
                    count += 1;
                }
            }

            let idx = ((y * width + x) * 4) as usize;
            output[idx] = (r_sum / count) as u8;
            output[idx + 1] = (g_sum / count) as u8;
            output[idx + 2] = (b_sum / count) as u8;
            output[idx + 3] = pixels[idx + 3];
        }
    }

    pixels.copy_from_slice(&output);
}
```

```toml
# Cargo.toml
[package]
name = "image-filters"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = "s"      # Optimize for size
lto = true           # Link-time optimization
```

```bash
# Build the WASM module
wasm-pack build --target web --release
# Output: pkg/image_filters_bg.wasm + pkg/image_filters.js
```

### Using WASM Modules from JavaScript/TypeScript

```typescript
// Using the wasm-pack generated module
import init, { grayscale, blur } from "./pkg/image_filters";

async function processImage(canvas: HTMLCanvasElement) {
  // Initialize WASM module (downloads and compiles the .wasm file)
  await init();

  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Pass pixel data to WASM -- zero-copy via shared memory
  grayscale(imageData.data);

  // Or apply blur
  // blur(imageData.data, canvas.width, canvas.height, 3);

  // Write processed pixels back
  ctx.putImageData(imageData, 0, 0);
}
```

### Loading WASM: Three Approaches

```typescript
// Approach 1: wasm-pack generated loader (recommended)
import init, { myFunction } from "./pkg/my_module";
await init();  // Fetches and compiles .wasm

// Approach 2: Manual instantiation
const response = await fetch("/my_module.wasm");
const bytes = await response.arrayBuffer();
const { instance } = await WebAssembly.instantiate(bytes, importObject);
instance.exports.myFunction();

// Approach 3: Streaming compilation (most efficient)
const { instance } = await WebAssembly.instantiateStreaming(
  fetch("/my_module.wasm"),
  importObject,
);
instance.exports.myFunction();
```

**`instantiateStreaming` is preferred** because it compiles the WASM while downloading, avoiding the need to buffer the entire file in memory first.

### Memory Model and Data Exchange

WASM and JavaScript share a linear memory buffer. Understanding this is critical for performance.

```typescript
// WASM memory is a WebAssembly.Memory object (resizable ArrayBuffer)
const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });

// JavaScript can read/write WASM memory directly
const buffer = new Uint8Array(memory.buffer);

// Passing data to WASM:
// Option 1: Pass typed array directly (wasm-bindgen handles this)
grayscale(imageData.data);  // wasm-bindgen copies data to WASM memory

// Option 2: Write to shared memory manually
const ptr = wasmModule.alloc(data.length);
const wasmBuffer = new Uint8Array(wasmModule.memory.buffer, ptr, data.length);
wasmBuffer.set(data);
wasmModule.process(ptr, data.length);
```

```
+-----------------------------------+
|          Browser Process          |
|                                   |
|  JavaScript          WebAssembly  |
|  +----------+       +----------+  |
|  |          |       |          |  |
|  | JS Heap  |       | Linear   |  |
|  | (GC'd)   |  <->  | Memory   |  |
|  |          |       | (manual) |  |
|  +----------+       +----------+  |
|       |                  |        |
|       +------ shared ----+        |
|              memory               |
+-----------------------------------+
```

### Performance: WASM vs JavaScript

| Operation | JavaScript | WASM (Rust) | Speedup |
|-----------|-----------|-------------|---------|
| Image grayscale (4K) | ~45ms | ~8ms | 5-6x |
| SHA-256 hash (1MB) | ~12ms | ~3ms | 4x |
| JSON parse (1MB) | ~5ms | ~15ms | 0.3x (JS wins) |
| Matrix multiply (1000x1000) | ~800ms | ~50ms | 16x |
| Fibonacci(45) | ~7000ms | ~4000ms | 1.75x |
| DOM manipulation | ~1ms | N/A | JS only |
| Regex matching | ~2ms | ~3ms | ~1x (similar) |
| Sorting 1M integers | ~250ms | ~80ms | 3x |
| LZ4 compression (1MB) | ~30ms | ~5ms | 6x |

**Key takeaway:** WASM shines for compute-heavy operations on numeric and binary data. JavaScript is faster for string operations, JSON, DOM, and I/O. The crossover point is roughly when computation takes more than 1ms -- below that, the JS-WASM call overhead dominates.

### Real Production Use Cases

**1. SQLite in the Browser (sql.js / wa-sqlite)**

```typescript
import initSqlJs from "sql.js";

async function setupDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) => `/wasm/${file}`,
  });

  const db = new SQL.Database();

  db.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
    INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
    INSERT INTO users VALUES (2, 'Bob', 'bob@example.com');
  `);

  const results = db.exec("SELECT * FROM users WHERE name LIKE '%li%'");
  // Full SQL engine running in the browser via WASM
  return results;
}
```

**2. Image/Video Processing (Photon, FFmpeg.wasm)**

```typescript
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

async function convertVideo(inputFile: File): Promise<Blob> {
  const ffmpeg = createFFmpeg({ log: true });
  await ffmpeg.load();

  ffmpeg.FS("writeFile", "input.mp4", await fetchFile(inputFile));

  await ffmpeg.run(
    "-i", "input.mp4",
    "-vf", "scale=640:480",
    "-c:v", "libx264",
    "output.mp4",
  );

  const data = ffmpeg.FS("readFile", "output.mp4");
  return new Blob([data.buffer], { type: "video/mp4" });
}
```

**3. PDF Rendering (pdf.js uses WASM internally)**

**4. Figma** (uses a C++ rendering engine compiled to WASM)

**5. Google Earth** (geospatial rendering via WASM)

**6. AutoCAD Web** (CAD engine ported from C++ to WASM)

**7. Game Engines** (Unity WebGL, Unreal Engine for web)

### WASI: WebAssembly System Interface

WASI extends WASM beyond the browser, providing a standardized system interface for file I/O, networking, and other OS capabilities.

```rust
// WASI program -- runs outside the browser
use std::fs;
use std::io::Write;

fn main() {
    // WASI provides sandboxed filesystem access
    let contents = fs::read_to_string("/input/data.txt")
        .expect("Failed to read file");

    let processed = contents.to_uppercase();

    let mut output = fs::File::create("/output/result.txt")
        .expect("Failed to create file");
    output.write_all(processed.as_bytes())
        .expect("Failed to write");
}
```

```bash
# Compile to WASI target
rustc --target wasm32-wasip1 -o program.wasm src/main.rs

# Run with a WASM runtime
wasmtime run --dir /input --dir /output program.wasm

# Or with Deno
deno run --allow-read --allow-write program.wasm
```

**WASI use cases:**
- Serverless functions (Cloudflare Workers use WASM internally)
- Plugin systems (extensible applications with sandboxed WASM plugins)
- Edge computing (lightweight, fast-starting WASM containers)
- Universal binaries (write once, run anywhere -- truly)

### WASM and Web Workers

For compute-heavy tasks, run WASM in a Web Worker to avoid blocking the main thread:

```typescript
// worker.ts
import init, { processImage } from "./pkg/image_processor";

let initialized = false;

self.onmessage = async (event) => {
  if (!initialized) {
    await init();
    initialized = true;
  }

  const { imageData, width, height, filter } = event.data;

  // Heavy computation runs in the worker thread
  const result = processImage(imageData, width, height, filter);

  // Transfer the result back (zero-copy with Transferable)
  self.postMessage({ result }, [result.buffer]);
};
```

```typescript
// main.ts
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

function processImageInBackground(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  filter: string,
): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    worker.onmessage = (event) => resolve(event.data.result);
    worker.postMessage(
      { imageData, width, height, filter },
      [imageData.buffer],  // Transfer ownership (zero-copy)
    );
  });
}
```

---

## Common Interview Questions

### Q1: What is WebAssembly and why would a frontend developer use it?

**Answer:** WebAssembly is a binary instruction format that runs in browsers at near-native speed. It is designed as a compilation target for languages like Rust, C, and C++, allowing developers to run high-performance code alongside JavaScript.

A frontend developer would use it for computationally intensive tasks that JavaScript handles too slowly: image and video processing, cryptographic operations, data compression, running database engines (like SQLite) in the browser, and porting existing native applications to the web.

The key mental model is that WASM complements JavaScript rather than replacing it. JavaScript handles DOM manipulation, event handling, network requests, and application logic. WASM handles the CPU-intensive hot paths. The two communicate through a shared memory model, with JavaScript calling WASM functions and reading results from shared buffers.

### Q2: What are the limitations of WebAssembly?

**Answer:** WASM has several important limitations:

No direct DOM access. WASM cannot manipulate the DOM or call browser APIs directly. Every DOM operation must go through JavaScript, which adds overhead. This makes WASM unsuitable for UI-heavy code.

No built-in async I/O. WASM is synchronous by nature. Async operations (fetch, timers, promises) must be coordinated through JavaScript. The JSPI (JavaScript Promise Integration) proposal aims to address this, but it is not yet widely available.

Bundle size. A WASM module adds to the download size. A minimal Rust-to-WASM module is ~20-30KB; complex modules can be several megabytes. This must be weighed against performance gains.

Startup cost. The WASM module must be downloaded, compiled, and instantiated before it can execute. Streaming compilation (`instantiateStreaming`) helps, but the initial load is slower than running JavaScript directly.

Garbage collection. Languages with GC (Go, Java, C#) must ship their runtime with the WASM module, increasing bundle size significantly. Rust and C/C++ avoid this because they use manual memory management.

Debugging. WASM debugging is less mature than JavaScript debugging. Source maps exist for Rust-to-WASM, but stepping through code in browser DevTools is not as smooth as JavaScript debugging.

### Q3: Explain the memory model for JavaScript-WASM interop.

**Answer:** WASM uses a linear memory model -- a contiguous, resizable array of bytes (`WebAssembly.Memory`). Both JavaScript and WASM can read from and write to this memory.

To pass data from JavaScript to WASM, you write it into the shared memory buffer and pass a pointer (byte offset) to the WASM function. For simple types (numbers), wasm-bindgen handles this automatically. For complex data (arrays, strings), the data is copied into WASM memory.

The critical nuance is that when WASM memory grows (via `memory.grow()`), the underlying `ArrayBuffer` is detached and replaced. Any JavaScript `TypedArray` views into WASM memory become invalid. You must recreate views after any operation that might grow memory.

For performance-critical code, you want to minimize data copying between JavaScript and WASM. Strategies include: writing data directly into WASM memory before calling the function, using `SharedArrayBuffer` for zero-copy access from Web Workers, and batching operations to amortize the interop overhead.

### Q4: When would you choose WASM over optimized JavaScript?

**Answer:** I would choose WASM when the computation involves heavy numeric or binary data processing that takes more than a few milliseconds in JavaScript. Specific scenarios: image filters processing millions of pixels, cryptographic hashing of large data, physics simulations with many objects, encoding/decoding binary formats, and running existing C/C++/Rust codebases in the browser.

I would stick with JavaScript when: the operation involves DOM manipulation (WASM has no direct DOM access), the computation is lightweight (under ~1ms, where interop overhead dominates), the operation is I/O-bound (network requests, file reading), or when string processing and JSON operations dominate (V8 is highly optimized for these).

The practical test: profile the JavaScript implementation first. If a hot path takes more than 16ms (one frame at 60fps) and involves numeric computation, WASM is likely to help. If the bottleneck is DOM layout, rendering, or I/O, WASM will not help.

### Q5: What is WASI and why does it matter for frontend developers?

**Answer:** WASI (WebAssembly System Interface) is a standard set of system APIs for WASM, enabling it to run outside the browser with access to files, networking, and other OS capabilities -- all within a security sandbox.

For frontend developers, WASI matters because it powers the edge computing revolution. Cloudflare Workers, Fastly Compute, and other edge platforms use WASM/WASI internally. When you deploy a Next.js or Remix application to the edge, your code may be running in a WASM sandbox.

WASI also enables universal plugin systems: a WASM module built with WASI can run identically in the browser, on the server, and at the edge. This is useful for applications like Figma (plugins run in WASM sandbox), database engines (SQLite compiled to WASM), and build tools (SWC, the Rust-based JavaScript compiler, uses WASM for browser-based compilation).

The long-term vision is "write once, run anywhere" at the binary level -- not just "any browser" but any runtime that supports WASM.

---

## Gotchas & Edge Cases

1. **WASM is not always faster than JavaScript.** V8 optimizes JavaScript aggressively. For code with simple patterns (looping over arrays, basic math), optimized JS can match or beat WASM due to interop overhead and V8's JIT compilation. Always benchmark before committing to WASM.

2. **String passing is expensive.** Strings must be encoded to UTF-8 bytes, copied into WASM memory, and decoded back. If your WASM function processes strings, the encoding/decoding cost may dominate. Consider keeping string-heavy logic in JavaScript.

3. **WASM memory never shrinks.** Once WASM memory is grown, it cannot be reduced. Long-running applications with variable memory needs can accumulate waste. Design your WASM allocator carefully and consider reusing memory regions.

4. **Bundle size matters on mobile.** A 500KB WASM module adds ~500KB to the download (WASM does not compress as well as JavaScript). On slow mobile connections, the download time may offset the performance gain. Use code splitting to load WASM only when needed.

5. **Thread support is limited.** WASM threads require `SharedArrayBuffer`, which requires specific HTTP headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`). Many hosting setups do not enable these headers, breaking WASM threading.

6. **Source maps for WASM are immature.** While DWARF debug info and source maps work in Chrome DevTools for Rust WASM, the experience is not as polished as JavaScript debugging. Logging from WASM (via `console.log` bindings) is often the most practical debugging approach.

7. **WASM and CSP (Content Security Policy).** Compiling WASM with `WebAssembly.compile()` or `WebAssembly.instantiate()` requires `'wasm-eval'` or `'wasm-unsafe-eval'` in the CSP `script-src` directive. Strict CSP policies may block WASM compilation.

8. **Memory growth invalidates views.** When WASM grows its memory, all existing `TypedArray` views (`Uint8Array`, `Float64Array`, etc.) into that memory become detached. Always recreate views after calls that might trigger memory growth.

9. **WASM modules are cached aggressively.** Browsers cache compiled WASM modules in the HTTP cache and sometimes in a special "code cache." Ensure proper cache-busting (content hashing in filenames) when deploying WASM updates.

10. **Not all Rust crates compile to WASM.** Crates that use system calls, filesystem access, networking, or native C libraries will not compile to `wasm32-unknown-unknown`. Check crate compatibility before committing to a WASM architecture.

---

## Quick Reference

| Language | WASM Bundle Size (minimal) | GC Included | Tooling Maturity | Best For |
|----------|--------------------------|-------------|-----------------|----------|
| Rust | ~20-30KB | No | Excellent (wasm-pack) | Performance-critical frontend |
| C/C++ | ~20-50KB | No | Good (Emscripten) | Porting existing code |
| Go | ~2-5MB | Yes (full runtime) | Moderate (TinyGo: ~200KB) | Go developers targeting web |
| C# | ~5-10MB | Yes (.NET runtime) | Good (Blazor) | .NET ecosystem |
| AssemblyScript | ~5-20KB | No (manual) | Good | TypeScript developers |
| Zig | ~10-30KB | No | Growing | Systems programming |

| API | Purpose |
|-----|---------|
| `WebAssembly.compile(bytes)` | Compile WASM bytes to a Module |
| `WebAssembly.instantiate(bytes, imports)` | Compile + instantiate in one step |
| `WebAssembly.instantiateStreaming(fetch, imports)` | Stream-compile (most efficient) |
| `WebAssembly.Memory({ initial, maximum })` | Create shared memory |
| `WebAssembly.Table({ initial, element })` | Create function table |
| `instance.exports.functionName()` | Call WASM function from JS |

| Tool | Purpose |
|------|---------|
| wasm-pack | Build Rust to WASM + JS bindings |
| wasm-bindgen | Rust-JS interop layer |
| wasm-opt (binaryen) | Optimize WASM binary size |
| wasm-strip | Remove debug info from WASM |
| Emscripten | Compile C/C++ to WASM |
| wasm-tools | WASM binary inspection tools |
| Wasmtime | Server-side WASM runtime |
| Wasmer | Universal WASM runtime |

| Use Case | Example Project | Why WASM |
|----------|----------------|----------|
| In-browser database | sql.js, wa-sqlite | Full SQL engine, ~1MB |
| Image editing | Photon, Squoosh | Pixel-level processing |
| Video processing | FFmpeg.wasm | Codec support |
| CAD/Design tools | Figma, AutoCAD Web | Complex rendering |
| PDF rendering | pdf.js (partial) | Font/rendering engine |
| Game engines | Unity WebGL, Bevy | Physics, rendering |
| Compression | Brotli, zstd in browser | CPU-intensive encoding |
| Crypto | Ring (Rust), libsodium | Constant-time operations |
| Code editing | tree-sitter (parsing) | Fast syntax analysis |
