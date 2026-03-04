# Chapter 3: GPU Architecture

## From Pixels to Petaflops

If CPUs are Swiss Army knives -- versatile tools that handle any task competently -- then GPUs are industrial stamping presses: specialized machines that perform one narrow class of operation at staggering speed. This chapter explains why GPUs were built, how they work at the hardware level, and how to reason about when they are the right tool for a problem.

By the end of this chapter you will understand:
- Why the graphics pipeline demanded a fundamentally different processor design
- The internal structure of a modern GPU down to the warp scheduler level
- How the SIMT execution model works and where it breaks down
- The complete GPU memory hierarchy with real latency and bandwidth numbers
- How to decide whether a workload belongs on a CPU or GPU
- The evolution of GPU hardware from Fermi to Blackwell
- How AMD and Intel GPUs compare to NVIDIA architectures
- How data moves between CPU and GPU over PCIe and NVLink

---

## 3.1 Why GPUs Exist

### 3.1.1 The Graphics Pipeline Origins

In the early 1990s, 3D graphics were computed entirely on the CPU. Every triangle in a scene had to be transformed, lit, rasterized, and shaded by the same general-purpose processor that was also running the operating system and game logic. The problem was simple arithmetic: a scene with 100,000 triangles at 30 frames per second requires processing 3 million triangles per second. Each triangle requires dozens of floating-point operations for transformation and lighting. CPUs of that era could not keep up.

The insight that led to the GPU was this: **every pixel on the screen can be computed independently**. If you are shading a 640x480 image, you have 307,200 pixels that need the exact same computation applied with different input data. This is the textbook definition of data parallelism.

```
THE GRAPHICS PIPELINE (simplified)
==================================

       Application (CPU)
             |
             v
   +-------------------+
   | Vertex Processing  |  Transform each vertex by model/view/projection
   | (per-vertex)       |  matrices. SAME operation on EVERY vertex.
   +-------------------+
             |
             v
   +-------------------+
   | Primitive Assembly |  Group vertices into triangles.
   +-------------------+
             |
             v
   +-------------------+
   | Rasterization      |  Determine which pixels each triangle covers.
   +-------------------+  Generate "fragments" for each covered pixel.
             |
             v
   +-------------------+
   | Fragment Shading   |  Compute color for each fragment. Texture
   | (per-pixel)        |  lookups, lighting, blending. SAME operation
   +-------------------+  on EVERY fragment.
             |
             v
   +-------------------+
   | Output Merger      |  Depth testing, blending, write to framebuffer.
   +-------------------+
             |
             v
        Framebuffer (screen)
```

Notice the pattern: vertex processing applies the same math to every vertex, and fragment shading applies the same math to every pixel. This is **embarrassingly parallel**. A processor designed specifically for this pattern can be radically simpler than a CPU, because it does not need:

- Branch prediction (shaders are mostly branchless)
- Out-of-order execution (all threads run the same instructions)
- Large caches (data is streamed, not reused heavily)
- Complex control logic (one instruction stream controls many threads)

By removing all of that complexity, you free up transistor budget for more execution units.

### 3.1.2 The Transistor Budget Argument

This is the fundamental hardware design tradeoff:

```
CPU DIE AREA ALLOCATION
+------------------------------------------------------------------+
|                                                                  |
|  +--------+  +--------+  +--------+  +--------+                 |
|  | Core 0 |  | Core 1 |  | Core 2 |  | Core 3 |    ~30% ALUs   |
|  |        |  |        |  |        |  |        |                 |
|  | Branch |  | Branch |  | Branch |  | Branch |                 |
|  | Pred.  |  | Pred.  |  | Pred.  |  | Pred.  |    ~30% Control |
|  | OoO    |  | OoO    |  | OoO    |  | OoO    |                 |
|  | Sched  |  | Sched  |  | Sched  |  | Sched  |                 |
|  +--------+  +--------+  +--------+  +--------+                 |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |              Large Shared L3 Cache (~30 MB)               |   |
|  +----------------------------------------------------------+   |
|  ~40% Cache                                                      |
+------------------------------------------------------------------+

GPU DIE AREA ALLOCATION
+------------------------------------------------------------------+
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM|   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM|   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM|   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |  ~80% ALUs
|  |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM| |SM|   |
|  +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   |
|                                                                  |
|  +------+  +------+  +------+  +------+  +------+  +------+     |
|  | Mem  |  | Mem  |  | Mem  |  | Mem  |  | Mem  |  | Mem  |     |  ~15% Memory
|  | Ctrl |  | Ctrl |  | Ctrl |  | Ctrl |  | Ctrl |  | Ctrl |     |  Controllers
|  +------+  +------+  +------+  +------+  +------+  +------+     |
|                                                                  |
|  +------+ +------+                                     ~5%       |
|  |Sched | |L2    |                                     Control   |
|  +------+ +------+                                               |
+------------------------------------------------------------------+
```

A CPU dedicates roughly 30% of its die to actual computation (ALUs), with the rest going to caches and control logic that make individual threads run fast. A GPU flips this ratio: ~80% of the die is execution units, with minimal control logic and smaller caches. The result is thousands of simple cores instead of a handful of complex ones.

### 3.1.3 From Graphics to General-Purpose Computing (GPGPU)

The transition from fixed-function graphics hardware to general-purpose GPU computing happened in stages:

```
TIMELINE: GRAPHICS TO GPGPU
============================

1999: Fixed-function pipeline
      Hardware does ONLY graphics transformations.
      No programmability.

2001: Vertex & Pixel Shaders (DirectX 8 / OpenGL ARB)
      Small programs run PER vertex and PER pixel.
      Still limited: no loops, no branching, no integers.

2003: Shader Model 2.0 (DirectX 9)
      Loops and conditionals added to shaders.
      Researchers begin encoding scientific computations
      as "rendering passes" -- store data in textures,
      compute results via pixel shaders. Extremely awkward.

2006: NVIDIA G80 / GeForce 8800 GTX
      First UNIFIED SHADER architecture.
      Vertex and pixel shaders use same hardware.
      CUDA 1.0 released: C-like language for GPU computing.
      No more pretending data is "textures."

2007-present: GPGPU becomes mainstream
      CUDA ecosystem grows. OpenCL provides vendor-neutral API.
      Deep learning (2012 AlexNet) drives massive GPU adoption.
      GPUs become the default for training neural networks.
```

The key innovation was **unified shaders**: instead of having separate hardware for vertex and pixel processing, a single pool of programmable cores could be assigned to any stage of the pipeline -- or to general-purpose computation. This was the birth of the modern GPU as we know it.

### 3.1.4 Why CPUs Alone Are Not Enough

Consider multiplying two 4096x4096 matrices. This requires approximately 2 * 4096^3 = 137 billion floating-point operations (FLOPs).

```
MATRIX MULTIPLY: CPU vs GPU
============================

Operation: C = A * B, where A, B are 4096 x 4096 (FP32)
Total FLOPs: ~137 billion

CPU (Intel i9-13900K, 24 cores):
  Peak FP32: ~1.3 TFLOPS
  Time: 137 / 1,300 = ~0.105 seconds
  Actual (with cache effects): ~0.3-0.5 seconds

GPU (NVIDIA H100):
  Peak FP32: ~67 TFLOPS
  Time: 137 / 67,000 = ~0.002 seconds
  Actual (with memory effects): ~0.005 seconds

GPU (using Tensor Cores, FP16):
  Peak FP16: ~1,979 TFLOPS
  Time: negligible for this size

Speedup: 50-100x (FP32), 1000x+ (Tensor Cores)
```

For workloads with high arithmetic intensity and data parallelism, GPUs are not merely "faster" -- they represent an entirely different performance class. This is why every major AI training run, every weather simulation, and every real-time ray tracer uses GPUs.

---

## 3.2 GPU Hardware Overview

### 3.2.1 Die Layout

A modern NVIDIA GPU die is organized around a central interconnect that connects many Streaming Multiprocessors (SMs) to a shared L2 cache and memory controllers. Here is a simplified die layout for a high-end GPU (inspired by the NVIDIA A100/H100 generation):

```
+===========================================================================+
||                        GPU DIE (simplified)                             ||
||                                                                         ||
||  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+     ||
||  | GPC 0 |  | GPC 1 |  | GPC 2 |  | GPC 3 |  | GPC 4 |  | GPC 5 |     ||
||  |       |  |       |  |       |  |       |  |       |  |       |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |  | SM SM |     ||
||  |       |  |       |  |       |  |       |  |       |  |       |     ||
||  | Rast. |  | Rast. |  | Rast. |  | Rast. |  | Rast. |  | Rast. |     ||
||  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+     ||
||                                                                         ||
||  +===================================================================+ ||
||  |                     GigaThread Engine                              | ||
||  |            (Global thread scheduler / work distributor)            | ||
||  +===================================================================+ ||
||                                                                         ||
||  +===================================================================+ ||
||  |                        L2 Cache (40-60 MB)                         | ||
||  +===================================================================+ ||
||                                                                         ||
||  +------+ +------+ +------+ +------+ +------+ +------+ +------+       ||
||  |MemCtl| |MemCtl| |MemCtl| |MemCtl| |MemCtl| |MemCtl| |MemCtl|       ||
||  | HBM  | | HBM  | | HBM  | | HBM  | | HBM  | | HBM  | | HBM  |       ||
||  |Stack 0| |Stack 1| |Stack 2| |Stack 3| |Stack 4| |Stack 5| |Stack 6|   ||
||  +------+ +------+ +------+ +------+ +------+ +------+ +------+       ||
||                                                                         ||
||  +--------+  +--------+  +--------+  +--------+                        ||
||  | NVLink |  | NVLink |  | NVLink |  | PCIe   |                        ||
||  | Port 0 |  | Port 1 |  | Port 2 |  | Gen5   |                        ||
||  +--------+  +--------+  +--------+  +--------+                        ||
||                                                                         ||
+===========================================================================+

Legend:
  GPC  = Graphics Processing Cluster (groups of SMs)
  SM   = Streaming Multiprocessor (the fundamental compute unit)
  Rast.= Rasterizer (for graphics workloads)
  MemCtl = Memory Controller
  HBM  = High Bandwidth Memory stack
```

Key organizational levels from top to bottom:

| Level | Description | Count (H100) |
|-------|-------------|--------------|
| **GPU** | The entire chip | 1 |
| **GPC** | Graphics Processing Cluster, groups SMs with a rasterizer | 8 |
| **TPC** | Texture Processing Cluster, groups 2 SMs | 66 |
| **SM** | Streaming Multiprocessor, the fundamental compute unit | 132 |

### 3.2.2 The Streaming Multiprocessor (SM)

The SM is the most important unit to understand. It is the building block of every NVIDIA GPU. Each SM is a self-contained processor with its own instruction schedulers, register file, execution units, and local memory. Here is a detailed view (based on the Ampere/Hopper generation):

```
+=========================================================================+
||                    STREAMING MULTIPROCESSOR (SM)                       ||
||                    (Ampere / Hopper generation)                        ||
||                                                                       ||
||  +-------------------+           +-------------------+                ||
||  | Warp Scheduler 0  |           | Warp Scheduler 1  |                ||
||  | Dispatch Unit 0   |           | Dispatch Unit 1   |                ||
||  +-------------------+           +-------------------+                ||
||  +-------------------+           +-------------------+                ||
||  | Warp Scheduler 2  |           | Warp Scheduler 3  |                ||
||  | Dispatch Unit 2   |           | Dispatch Unit 3   |                ||
||  +-------------------+           +-------------------+                ||
||                                                                       ||
||  +---------------------------------------------------------------+   ||
||  |              Register File (256 KB per SM)                     |   ||
||  |      65,536 x 32-bit registers, partitioned across warps       |   ||
||  +---------------------------------------------------------------+   ||
||                                                                       ||
||  +-----------+ +-----------+ +-----------+ +-----------+             ||
||  |Processing | |Processing | |Processing | |Processing |             ||
||  | Block 0   | | Block 1   | | Block 2   | | Block 3   |             ||
||  |           | |           | |           | |           |             ||
||  | 16 FP32   | | 16 FP32   | | 16 FP32   | | 16 FP32   |             ||
||  | 16 FP32/  | | 16 FP32/  | | 16 FP32/  | | 16 FP32/  |             ||
||  |   INT32   | |   INT32   | |   INT32   | |   INT32   |             ||
||  | 8 FP64    | | 8 FP64    | | 8 FP64    | | 8 FP64    |             ||
||  | 1 Tensor  | | 1 Tensor  | | 1 Tensor  | | 1 Tensor  |             ||
||  |   Core    | |   Core    | |   Core    |  |  Core    |             ||
||  | 4 SFUs    | | 4 SFUs    | | 4 SFUs    | | 4 SFUs    |             ||
||  | 4 LD/ST   | | 4 LD/ST   | | 4 LD/ST   | | 4 LD/ST   |             ||
||  |   Units   | |   Units   | |   Units   | |   Units   |             ||
||  +-----------+ +-----------+ +-----------+ +-----------+             ||
||                                                                       ||
||  +---------------------------------------------------------------+   ||
||  |              Shared Memory / L1 Cache (configurable)           |   ||
||  |         Typically 128-228 KB combined per SM                   |   ||
||  +---------------------------------------------------------------+   ||
||                                                                       ||
||  +----------------------------+  +----------------------------+      ||
||  | Texture Units (4 per SM)   |  | RT Core (for ray tracing)  |      ||
||  +----------------------------+  +----------------------------+      ||
||                                                                       ||
+=========================================================================+
```

Let us examine each component:

**Warp Schedulers (4 per SM)**
Each SM has 4 warp schedulers, each capable of issuing one or more instructions per clock cycle to a group of 32 threads (a "warp"). The schedulers operate independently, meaning up to 4 different warps can be executing instructions simultaneously within a single SM.

**Register File (256 KB per SM)**
This is enormous compared to a CPU register file (which is typically ~1 KB per core). GPU threads are lightweight precisely because their state is held entirely in registers. With 65,536 32-bit registers per SM, a warp of 32 threads using 64 registers each consumes 32 * 64 = 2,048 registers, allowing 32 concurrent warps per SM.

**CUDA Cores (FP32 units)**
Each processing block contains 16 dedicated FP32 units and 16 units that can handle either FP32 or INT32 operations. An SM with 4 processing blocks therefore has 128 CUDA cores. These execute basic arithmetic: add, multiply, fused multiply-add (FMA).

**FP64 Units**
Double-precision floating-point units. Consumer GPUs typically have very few (1:32 ratio to FP32). Data center GPUs like the A100 have a 1:2 ratio, critical for scientific computing.

**Special Function Units (SFUs)**
Execute transcendental functions: sin, cos, exp, log, reciprocal, square root. These take multiple cycles but free the main ALUs for other work. There are 4 per processing block, 16 per SM.

**Load/Store (LD/ST) Units**
Handle memory read and write requests. Each processing block has 4 LD/ST units, for 16 per SM. These calculate memory addresses and issue requests to the memory hierarchy.

**Tensor Cores**
Specialized matrix multiply-accumulate units that compute small matrix operations (e.g., 4x4 or 8x8) in a single clock cycle. Introduced in Volta (2017), these are the backbone of modern AI training and inference. Each Tensor Core can perform 64 FMA operations per clock in FP16.

**Shared Memory / L1 Cache**
A fast, on-chip SRAM that is shared among all threads in a thread block. It serves as both a user-managed scratchpad and an automatic L1 cache. The allocation between shared memory and L1 is configurable.

**Texture Units**
Specialized hardware for sampling textures with filtering (bilinear, trilinear, anisotropic). Also useful for general-purpose computing when you need hardware-accelerated interpolation.

**RT Cores (Turing and later)**
Dedicated hardware for ray-triangle intersection and bounding volume hierarchy (BVH) traversal. These accelerate ray tracing by 10x compared to software implementations.

### 3.2.3 CUDA Core Detail

A single CUDA core is much simpler than a CPU core. It is essentially a pipelined floating-point unit:

```
CUDA CORE (FP32)
+-----------------------------------------+
|                                         |
|  +----------+   +----------+            |
|  | Operand  |-->| FP32     |            |
|  | Fetch    |   | FMA Unit |---> Result |
|  +----------+   | (Fused   |            |
|       ^         |  Multiply|            |
|       |         |  Add)    |            |
|  From Register  +----------+            |
|  File                                   |
+-----------------------------------------+

A single CUDA core:
- Executes ONE floating-point operation per clock
- Has NO branch predictor
- Has NO out-of-order logic
- Has NO instruction cache (shared at SM level)
- Cannot independently fetch instructions

It is NOT a "core" in the CPU sense.
A better name would be "floating-point lane."
```

**Important misconception to avoid**: When NVIDIA says a GPU has "16,384 CUDA cores," do not compare this directly to a CPU's "24 cores." A CUDA core is a single-precision floating-point execution lane. A CPU core is an entire processor with branch prediction, OoO execution, and private caches. A fairer comparison is: "128 SMs, each roughly comparable in capability to a simple in-order CPU core with very wide SIMD."

---

## 3.3 SIMT Execution Model

### 3.3.1 SIMD vs SIMT

CPUs use **SIMD** (Single Instruction, Multiple Data): a single instruction explicitly operates on a wide vector register. The programmer (or compiler) must pack data into 128-bit, 256-bit, or 512-bit vectors:

```
CPU SIMD (AVX-256, 8-wide FP32)
================================

Instruction: VADDPS ymm0, ymm1, ymm2

  ymm1: [a0] [a1] [a2] [a3] [a4] [a5] [a6] [a7]
         +    +    +    +    +    +    +    +
  ymm2: [b0] [b1] [b2] [b3] [b4] [b5] [b6] [b7]
         =    =    =    =    =    =    =    =
  ymm0: [c0] [c1] [c2] [c3] [c4] [c5] [c6] [c7]

- Programmer or compiler explicitly packs data into vectors
- If you have 7 elements, the 8th lane is wasted
- Branch handling requires masks: all lanes execute both paths
- Registers are "wide" (256 bits)
```

GPUs use **SIMT** (Single Instruction, Multiple Threads): each thread has its own program counter, registers, and can follow its own execution path, but threads are grouped into **warps** of 32 that execute the same instruction in lockstep:

```
GPU SIMT (Warp of 32 threads)
==============================

Instruction: FADD R1, R2, R3

  Thread  0: R2= 1.0, R3= 2.0  --> R1= 3.0
  Thread  1: R2= 4.0, R3= 5.0  --> R1= 9.0
  Thread  2: R2= 7.0, R3= 8.0  --> R1=15.0
  ...
  Thread 31: R2= 0.5, R3= 0.3  --> R1= 0.8

- Each thread has its OWN registers (R1, R2, R3 are per-thread)
- All 32 threads execute the SAME instruction simultaneously
- Threads CAN diverge (if/else), but at a performance cost
- Programming model: you write scalar code for ONE thread
```

The key differences:

| Feature | SIMD (CPU) | SIMT (GPU) |
|---------|-----------|-----------|
| Programming model | Explicit vector operations | Scalar code per thread |
| Divergence handling | Programmer manages masks | Hardware handles it (with cost) |
| Register model | Wide shared registers | Per-thread private registers |
| Width | 4-16 elements (ISA-defined) | 32 threads (warp, hardware-defined) |
| Flexibility | Fixed-width, compile-time | Dynamic warp formation |
| Branching | Requires manual masking | Hardware predication |

### 3.3.2 Warp Execution

A **warp** is a group of 32 threads that execute in lockstep on a single SM. The warp is the fundamental unit of execution scheduling:

```
WARP EXECUTION: STEP BY STEP
==============================

Given kernel code:
    float x = input[threadIdx.x];
    float y = x * x + 3.0f;
    output[threadIdx.x] = y;

Compiles to (simplified):
    LD   R0, [addr + tid*4]     // Load input[tid]
    FMUL R1, R0, R0             // R1 = x * x
    FADD R1, R1, 3.0            // R1 = x*x + 3.0
    ST   [addr + tid*4], R1     // Store output[tid]

Execution on a warp (32 threads):

Clock 1: Warp Scheduler issues LD instruction
  +----+----+----+----+----+----+----+  ...  +----+
  | T0 | T1 | T2 | T3 | T4 | T5 | T6 |      | T31|
  | LD | LD | LD | LD | LD | LD | LD |      | LD |  <-- ALL load simultaneously
  +----+----+----+----+----+----+----+  ...  +----+

(Memory latency: ~200-400 cycles. Scheduler switches to ANOTHER warp.)

Clock ~300: Data arrives. Scheduler resumes this warp.

Clock ~301: Warp Scheduler issues FMUL instruction
  +----+----+----+----+----+----+----+  ...  +----+
  | T0 | T1 | T2 | T3 | T4 | T5 | T6 |      | T31|
  |FMUL|FMUL|FMUL|FMUL|FMUL|FMUL|FMUL|      |FMUL|  <-- ALL multiply
  +----+----+----+----+----+----+----+  ...  +----+

Clock ~302: Warp Scheduler issues FADD instruction
  +----+----+----+----+----+----+----+  ...  +----+
  | T0 | T1 | T2 | T3 | T4 | T5 | T6 |      | T31|
  |FADD|FADD|FADD|FADD|FADD|FADD|FADD|      |FADD|  <-- ALL add
  +----+----+----+----+----+----+----+  ...  +----+

Clock ~303: Warp Scheduler issues ST instruction
  +----+----+----+----+----+----+----+  ...  +----+
  | T0 | T1 | T2 | T3 | T4 | T5 | T6 |      | T31|
  | ST | ST | ST | ST | ST | ST | ST |      | ST |  <-- ALL store
  +----+----+----+----+----+----+----+  ...  +----+
```

The critical insight: while one warp is stalled waiting for memory, the scheduler switches to another ready warp **with zero overhead**. This is possible because each warp's state (registers, program counter) is always resident on the SM -- there is no context switch cost. This is called **latency hiding through occupancy**.

```
LATENCY HIDING: MULTIPLE WARPS ON ONE SM
==========================================

Time -->

SM with 4 warp schedulers, many resident warps:

Scheduler 0: [Warp A: compute][Warp A: mem stall............][Warp A: compute]
              [Warp E: waiting][Warp E: compute][Warp E: mem stall......][E:comp]

Scheduler 1: [Warp B: compute][Warp B: mem stall............][Warp B: compute]
              [Warp F: waiting][Warp F: compute][Warp F: mem stall......][F:comp]

Scheduler 2: [Warp C: compute][Warp C: mem stall............][Warp C: compute]
              [Warp G: waiting][Warp G: compute][Warp G: mem stall......][G:comp]

Scheduler 3: [Warp D: compute][Warp D: mem stall............][Warp D: compute]
              [Warp H: waiting][Warp H: compute][Warp H: mem stall......][H:comp]

With enough warps, the execution units are ALWAYS busy.
Memory latency is HIDDEN, not reduced.
```

### 3.3.3 Warp Divergence

When threads in a warp encounter a conditional branch, different threads may need to take different paths. Since all threads in a warp must execute the same instruction, the warp must execute **both paths** sequentially, with threads disabled on the path they should not take. This is called **warp divergence**:

```
WARP DIVERGENCE EXAMPLE
========================

Kernel code:
    if (threadIdx.x < 16) {
        a[threadIdx.x] = expensive_function_A();  // Path A
    } else {
        a[threadIdx.x] = expensive_function_B();  // Path B
    }

Warp execution (32 threads, threads 0-15 take Path A, 16-31 take Path B):

Step 1: Evaluate condition (threadIdx.x < 16)
  T0  T1  T2  ... T15 T16 T17 ... T31
  [T] [T] [T] ... [T] [F] [F] ... [F]     T=true, F=false

Step 2: Execute Path A (threads 16-31 are MASKED OFF -- idle but still present)
  T0  T1  T2  ... T15 T16 T17 ... T31
  [A] [A] [A] ... [A] [--][--]... [--]     -- = disabled (predicated off)
  ^^^^^^^^^^^^^^^^^                         Only 16/32 lanes active = 50% efficiency

Step 3: Execute Path B (threads 0-15 are MASKED OFF)
  T0  T1  T2  ... T15 T16 T17 ... T31
  [--][--][--]... [--][B] [B] ... [B]
                       ^^^^^^^^^^^^^^^^^   Only 16/32 lanes active = 50% efficiency

Step 4: Reconverge -- all threads active again

Total time: Time(A) + Time(B)   (NOT max(A,B) as you might hope)
Without divergence: max(Time(A), Time(B))
Performance loss: up to 2x for a 50/50 split
```

**Worst case**: every thread in a warp takes a different path in a switch statement with 32 cases. The warp must execute all 32 paths sequentially. This is a 32x slowdown compared to no divergence.

**Best case**: all threads in a warp take the same path. Zero divergence, full efficiency. This is why GPU-friendly algorithms often ensure that neighboring threads (same warp) follow the same control flow.

```
DIVERGENCE: GOOD vs BAD PATTERNS
==================================

BAD: Divergence within a warp
    if (threadIdx.x % 2 == 0) {    // Even and odd threads split
        // Path A                   // within EVERY warp
    } else {                        // = always divergent
        // Path B
    }

GOOD: Divergence at warp boundaries
    if (threadIdx.x / 32 < N) {    // Entire warps take one path
        // Path A                   // No intra-warp divergence
    } else {
        // Path B
    }

GOOD: Short divergent sections
    float result = (x > 0) ? x : 0;  // Hardware predication,
                                       // very cheap divergence
```

### 3.3.4 Predicated Execution

For simple conditional assignments (like the ternary operator), the GPU uses **predicated execution** rather than actual branching. Both paths are computed, and the hardware selects the correct result:

```
PREDICATED EXECUTION
=====================

Source code:
    float y = (x > 0.0f) ? x * 2.0f : x * 0.5f;

Compiled (simplified):
    FMUL R2, R0, 2.0       // Compute x * 2.0 (always)
    FMUL R3, R0, 0.5       // Compute x * 0.5 (always)
    SETP P0, R0, 0.0, GT   // Set predicate P0 = (x > 0)
    @P0  MOV R1, R2         // If P0: y = x * 2.0
    @!P0 MOV R1, R3         // If !P0: y = x * 0.5

Both multiplications execute for ALL threads.
Only the final MOV is predicated.
Cost: 2 multiplies instead of 1, but NO warp serialization.
For short divergent code, this is cheaper than actual branching.
```

---

## 3.4 Thread Hierarchy

### 3.4.1 The Four Levels

GPU programs organize threads into a strict hierarchy:

```
GPU THREAD HIERARCHY
=====================

+================================================================+
|                          GRID                                   |
|  (All threads launched by a single kernel call)                 |
|                                                                 |
|  +---------------------------+  +---------------------------+   |
|  |        BLOCK (0,0)        |  |        BLOCK (1,0)        |   |
|  |                           |  |                           |   |
|  |  +------+ +------+       |  |  +------+ +------+       |   |
|  |  |Warp 0| |Warp 1|       |  |  |Warp 0| |Warp 1|       |   |
|  |  |T0-T31| |T32-63|       |  |  |T0-T31| |T32-63|       |   |
|  |  +------+ +------+       |  |  +------+ +------+       |   |
|  |  +------+ +------+       |  |  +------+ +------+       |   |
|  |  |Warp 2| |Warp 3|       |  |  |Warp 2| |Warp 3|       |   |
|  |  |T64-95| |T96-127|      |  |  |T64-95| |T96-127|      |   |
|  |  +------+ +------+       |  |  +------+ +------+       |   |
|  |                           |  |                           |   |
|  |  Threads in a block can:  |  |  Threads in a block can:  |   |
|  |  - Share memory            |  |  - Share memory            |   |
|  |  - Synchronize            |  |  - Synchronize            |   |
|  |  - Cooperate              |  |  - Cooperate              |   |
|  +---------------------------+  +---------------------------+   |
|                                                                 |
|  +---------------------------+  +---------------------------+   |
|  |        BLOCK (0,1)        |  |        BLOCK (1,1)        |   |
|  |  ...                      |  |  ...                      |   |
|  +---------------------------+  +---------------------------+   |
|                                                                 |
|  Blocks are INDEPENDENT:                                        |
|  - Can execute in ANY order                                     |
|  - Cannot communicate (except via global memory + atomics)      |
|  - Can run on ANY SM                                            |
+================================================================+
```

| Level | Size | Scope | Communication |
|-------|------|-------|---------------|
| **Thread** | 1 thread | Has its own registers and local memory | Via registers only |
| **Warp** | 32 threads | Executes in lockstep on one SM | Warp shuffle instructions |
| **Block** | Up to 1024 threads (32 warps) | Runs on a single SM | Shared memory, `__syncthreads()` |
| **Grid** | Up to 2^31 blocks | Spans the entire GPU | Global memory, atomics |

### 3.4.2 How Blocks Map to SMs

The GPU's **GigaThread Engine** (global scheduler) assigns blocks to SMs. Multiple blocks can run concurrently on a single SM, limited by the SM's resources (registers, shared memory, warp slots):

```
BLOCK-TO-SM MAPPING
=====================

Grid: 12 blocks, GPU: 4 SMs

GigaThread Engine assigns blocks:

    SM 0          SM 1          SM 2          SM 3
  +----------+  +----------+  +----------+  +----------+
  | Block 0  |  | Block 1  |  | Block 2  |  | Block 3  |
  | Block 4  |  | Block 5  |  | Block 6  |  | Block 7  |
  | Block 8  |  | Block 9  |  | Block 10 |  | Block 11 |
  +----------+  +----------+  +----------+  +----------+

Rules:
1. A block runs ENTIRELY on one SM (never split across SMs)
2. Multiple blocks can share one SM (if resources allow)
3. Blocks can execute in ANY order (no ordering guarantees)
4. Once a block finishes, its SM slot is freed for a new block

Resource limits (example, Ampere A100):
  - Max 32 blocks per SM
  - Max 64 warps (2048 threads) per SM
  - 256 KB registers per SM
  - 164 KB shared memory per SM

If each block uses:
  - 4 warps (128 threads) and 32 KB shared memory
  - Then SM can fit: min(32, 2048/128, 164/32) = min(32, 16, 5) = 5 blocks
```

### 3.4.3 Multidimensional Indexing

Blocks and grids can be 1D, 2D, or 3D. This is purely for programmer convenience (the hardware only sees flat thread indices), but it maps naturally to problem domains:

```
2D GRID OF 2D BLOCKS (for image processing)
=============================================

Grid: 4x3 blocks       Each Block: 16x16 threads = 256 threads

     Block    Block    Block    Block
     (0,0)    (1,0)    (2,0)    (3,0)
    +--------+--------+--------+--------+
    |16x16   |16x16   |16x16   |16x16   |
    |threads  |threads  |threads  |threads  |
    +--------+--------+--------+--------+
     Block    Block    Block    Block
     (0,1)    (1,1)    (2,1)    (3,1)
    +--------+--------+--------+--------+
    |16x16   |16x16   |16x16   |16x16   |
    |threads  |threads  |threads  |threads  |
    +--------+--------+--------+--------+
     Block    Block    Block    Block
     (0,2)    (1,2)    (2,2)    (3,2)
    +--------+--------+--------+--------+
    |16x16   |16x16   |16x16   |16x16   |
    |threads  |threads  |threads  |threads  |
    +--------+--------+--------+--------+

Global thread ID for thread (tx, ty) in block (bx, by):
  globalX = bx * blockDim.x + tx     // = bx * 16 + tx
  globalY = by * blockDim.y + ty     // = by * 16 + ty

This naturally maps to a 64x48 pixel image region.
```

### 3.4.4 Why the Hierarchy Exists

The hierarchy is not arbitrary. It reflects hardware constraints and enables scalability:

```
WHY THE HIERARCHY?
===================

THREAD:  Finest granularity. Maps to one lane of a CUDA core.
         Has private registers. Cheapest unit to create.

WARP:    Hardware execution unit. 32 threads in lockstep.
         Enables SIMT: one instruction fetch for 32 threads.
         Warp shuffle for fast intra-warp communication.

BLOCK:   Cooperative unit. Maps to one SM.
         Shared memory enables fast inter-thread communication.
         __syncthreads() enables coordination.
         Limited to 1024 threads (SM resource constraints).

GRID:    Scalability unit. Spans the entire GPU.
         Blocks are independent --> GPU can schedule them
         across ANY number of SMs.

         Same program runs on:
         - GTX 1650 (14 SMs):   blocks queue up, run 14 at a time
         - RTX 4090 (128 SMs):  blocks spread across all SMs
         - H100 (132 SMs):      even more parallelism

         THIS is how GPU programs scale automatically across
         different GPU models without recompilation.
```

---

## 3.5 GPU Memory Hierarchy

### 3.5.1 Overview

The GPU memory hierarchy is deeper and wider than a CPU's, optimized for throughput rather than latency:

```
GPU MEMORY HIERARCHY
=====================

    Thread Private
    +------------------+
    | Registers        |  <-- Fastest: 0 cycles latency, ~20 TB/s bandwidth
    | (up to 255 per   |      Per thread, compiler-managed
    |  thread)         |      256 KB per SM
    +------------------+
            |
            v
    +------------------+
    | Local Memory     |  <-- Spills from registers go here
    | (per thread)     |      Actually in global memory (SLOW), cached in L1/L2
    +------------------+      Up to 512 KB per thread
            |
            v
    Block Shared
    +------------------+
    | Shared Memory    |  <-- Fast: ~20-30 cycles, ~10-19 TB/s bandwidth
    | (per block)      |      User-managed scratchpad
    +------------------+      Up to 228 KB per SM (Hopper)
            |
            v
    SM-Level Cache
    +------------------+
    | L1 Cache / SMEM  |  <-- ~30 cycles, configurable split with shared memory
    | (per SM)         |      128-256 KB per SM
    +------------------+
            |
            v
    GPU-Wide Cache
    +------------------+
    | L2 Cache         |  <-- ~200 cycles, ~4-12 TB/s bandwidth
    | (shared by all   |      40-60 MB (H100)
    |  SMs)            |
    +------------------+
            |
            v
    Device Memory
    +------------------+
    | Global Memory    |  <-- Slow: ~400-600 cycles, 1.5-3.35 TB/s (HBM3)
    | (HBM / GDDR)    |      Up to 80 GB (H100)
    +------------------+      Accessible by all threads in all blocks
            |
            v
    Host Memory
    +------------------+
    | System RAM       |  <-- Very slow from GPU perspective: PCIe limited
    | (CPU side)       |      ~64 GB/s (PCIe 5.0 x16)
    +------------------+
```

### 3.5.2 Detailed Memory Characteristics

```
+==================================================================================+
|                      GPU MEMORY HIERARCHY DETAILED                                |
+==================================================================================+
| Memory       | Scope     | Lifetime  | Latency    | Bandwidth  | Size             |
|              |           |           | (cycles)   | (approx)   | (typical)        |
+==================================================================================+
| Registers    | Thread    | Thread    | 0 (1 for   | ~20 TB/s   | 255 regs/thread  |
|              |           |           |  RAW dep)  | aggregate  | 256 KB / SM      |
+--------------+-----------+-----------+------------+------------+------------------+
| Shared Mem   | Block     | Block     | 20-30      | ~10-19     | 48-228 KB / SM   |
|              |           |           |            | TB/s       |                  |
+--------------+-----------+-----------+------------+------------+------------------+
| L1 Cache     | SM        | Automatic | 30-40      | ~10 TB/s   | 128-256 KB / SM  |
|              |           |           |            |            | (shared w/ SMEM) |
+--------------+-----------+-----------+------------+------------+------------------+
| L2 Cache     | GPU       | Automatic | 200-300    | ~4-12      | 6-60 MB          |
|              |           |           |            | TB/s       |                  |
+--------------+-----------+-----------+------------+------------+------------------+
| Constant Mem | GPU       | App       | 4-8 (hit)  | ~8 TB/s    | 64 KB (cached)   |
|              | (read-    |           | 400+ (miss)| (cache)    | Backed by global |
|              |  only)    |           |            |            |                  |
+--------------+-----------+-----------+------------+------------+------------------+
| Texture Mem  | GPU       | App       | ~300-600   | Varies     | Backed by global |
|              | (read-    |           | (cached)   |            | with HW filter   |
|              |  only)    |           |            |            |                  |
+--------------+-----------+-----------+------------+------------+------------------+
| Global Mem   | GPU       | App       | 400-800    | 1.5-3.35   | 8-80 GB          |
| (HBM/GDDR)  |           |           |            | TB/s       |                  |
+--------------+-----------+-----------+------------+------------+------------------+
| System RAM   | Host      | App       | 10,000+    | ~64 GB/s   | 16-2048 GB       |
| (via PCIe)   | (CPU)     |           |            | (PCIe 5)   |                  |
+==================================================================================+
```

### 3.5.3 Registers

GPU registers are the fastest memory, but they have critical implications:

```
REGISTER PRESSURE AND OCCUPANCY
=================================

SM has 65,536 registers (256 KB) and supports up to 64 warps (2048 threads).

Scenario A: Kernel uses 32 registers per thread
  Registers per warp: 32 * 32 = 1,024
  Max warps: 65,536 / 1,024 = 64 warps    <-- Full occupancy

Scenario B: Kernel uses 64 registers per thread
  Registers per warp: 64 * 32 = 2,048
  Max warps: 65,536 / 2,048 = 32 warps    <-- 50% occupancy

Scenario C: Kernel uses 128 registers per thread
  Registers per warp: 128 * 32 = 4,096
  Max warps: 65,536 / 4,096 = 16 warps    <-- 25% occupancy

Scenario D: Kernel uses 255 registers per thread (max)
  Registers per warp: 255 * 32 = 8,160
  Max warps: 65,536 / 8,160 = 8 warps     <-- 12.5% occupancy

Lower occupancy = fewer warps to hide memory latency
                = potential performance cliff
```

When a kernel uses more registers than available, the compiler **spills** excess registers to local memory (which lives in global memory, cached in L1/L2). Register spills are extremely expensive because they convert register-speed access (~0 cycles) into cache/memory-speed access (30-800 cycles).

### 3.5.4 Shared Memory

Shared memory is a fast, on-chip scratchpad visible to all threads in a block. It is organized into **banks** to enable parallel access:

```
SHARED MEMORY BANK STRUCTURE
==============================

32 banks, each 4 bytes wide, cycling through addresses:

Address:  0    4    8   12   16  ...  124  128  132  ...
Bank:     0    1    2    3    4  ...   31    0    1  ...

PARALLEL ACCESS (no conflict):
  Thread 0 --> Bank 0  (addr 0)
  Thread 1 --> Bank 1  (addr 4)
  Thread 2 --> Bank 2  (addr 8)
  ...
  Thread 31 -> Bank 31 (addr 124)
  All 32 accesses served simultaneously = 1 cycle

BANK CONFLICT (serialized):
  Thread 0 --> Bank 0  (addr 0)
  Thread 1 --> Bank 0  (addr 128)    <-- CONFLICT! Same bank as Thread 0
  Thread 2 --> Bank 0  (addr 256)    <-- CONFLICT!
  ...
  These must be serialized: 32 threads hitting same bank = 32 cycles

BROADCAST (no conflict):
  Thread 0 --> Bank 5  (addr 20)
  Thread 1 --> Bank 5  (addr 20)     <-- Same address = BROADCAST
  Thread 2 --> Bank 5  (addr 20)
  ...
  All reading same address: hardware broadcasts = 1 cycle
```

### 3.5.5 Constant Memory

Constant memory is a 64 KB read-only region optimized for uniform access (when all threads in a warp read the same address):

```
CONSTANT MEMORY ACCESS PATTERNS
=================================

OPTIMAL: All threads read SAME address (broadcast)
  Thread 0-31: read const_data[0]
  --> One cache read, broadcast to all 32 threads
  --> Effectively register-speed: ~4-8 cycles

SUBOPTIMAL: Threads read DIFFERENT addresses
  Thread 0: read const_data[0]
  Thread 1: read const_data[1]
  Thread 2: read const_data[2]
  --> Serialized! 32 separate reads from constant cache
  --> Up to 32x slower than broadcast case

Use constant memory for:
  - Kernel parameters (automatically by CUDA)
  - Lookup tables accessed uniformly
  - Physical constants (pi, speed of light)
  - Configuration values

DO NOT use for:
  - Per-thread different data
  - Large arrays with varied access patterns
```

### 3.5.6 Texture Memory

Texture memory provides hardware-accelerated features that are useful beyond graphics:

```
TEXTURE MEMORY FEATURES
=========================

1. SPATIAL CACHING
   Texture cache is optimized for 2D locality.
   If thread (x,y) reads pixel (x,y), nearby threads
   reading (x+1,y) or (x,y+1) get cache hits.

   +--+--+--+--+
   |  |  |  |  |   Texture cache stores 2D TILES,
   +--+--+--+--+   not linear cache lines.
   |  |XX|XX|  |   Good for image processing,
   +--+--+--+--+   stencil computations.
   |  |XX|XX|  |
   +--+--+--+--+
   |  |  |  |  |
   +--+--+--+--+

2. HARDWARE INTERPOLATION
   Free bilinear/trilinear filtering:
   tex2D(x, y) with fractional coordinates
   returns interpolated value at zero extra cost.

3. BOUNDARY HANDLING
   Automatic clamp or wrap at array boundaries.
   No bounds-checking code needed.

4. FORMAT CONVERSION
   Automatic int8 -> float conversion on read.
```

---

## 3.6 Memory Bandwidth

### 3.6.1 GDDR vs HBM

GPU memory comes in two main types, each with distinct characteristics:

```
GDDR6X (Consumer GPUs: RTX 3090, RTX 4090)
=============================================

   GPU Die
   +------------+
   |            |--bus-->[GDDR6X chip]  <- Separate package
   |            |--bus-->[GDDR6X chip]     on the PCB
   |            |--bus-->[GDDR6X chip]
   |    GPU     |--bus-->[GDDR6X chip]  Wide bus (256-384 bit)
   |            |--bus-->[GDDR6X chip]  High clock speed (21 Gbps/pin)
   |            |--bus-->[GDDR6X chip]
   |            |--bus-->[GDDR6X chip]
   |            |--bus-->[GDDR6X chip]
   +------------+

   Bandwidth: 384-bit bus * 21 Gbps = ~1 TB/s (RTX 4090)
   Capacity: 12-24 GB
   Cost: Low (consumer market)
   Power: ~30-50W for memory subsystem


HBM3 / HBM3e (Data Center: A100, H100, H200)
===============================================

           +------+
           | HBM  |   HBM = stacked DRAM dies
           | Stack|   connected via through-silicon vias (TSVs)
           | 8-12 |   mounted on silicon interposer NEXT to GPU
           | DRAM |
           | dies |     Thousands of tiny wires per stack
           +------+     (1024-bit interface per stack)
              ||
   ====[silicon interposer]====
              ||
           +------+
           | GPU  |
           | Die  |
           +------+

   Bandwidth: 6 stacks * 1024-bit * 6.4 Gbps = ~3.35 TB/s (H100)
   Capacity: 80 GB (H100), 141 GB (H200)
   Cost: Very high (enterprise)
   Power: ~60-90W for memory subsystem
```

Comparison:

| Feature | GDDR6X | HBM3 | HBM3e |
|---------|--------|------|-------|
| Bandwidth | ~1 TB/s | ~3.35 TB/s | ~4.8 TB/s |
| Capacity | 12-24 GB | 80 GB | 141 GB |
| Bus width | 256-384 bit | 6144+ bit | 8192+ bit |
| Power per GB/s | ~0.05 W | ~0.02 W | ~0.015 W |
| Cost per GB | ~$2-4 | ~$10-20 | ~$15-30 |
| Use case | Gaming, workstation | Data center, AI | AI, large models |

### 3.6.2 Effective Bandwidth Calculation

The theoretical peak bandwidth is rarely achieved. Here is how to calculate effective bandwidth and understand where the gaps come from:

```
EFFECTIVE BANDWIDTH CALCULATION
================================

Theoretical Peak (H100 HBM3):
  Bus width: 5120 bits (across all stacks)
  Clock: 2.619 GHz (effective, with PAM3 signaling)
  Peak = 5120 / 8 * 2.619 * 2 = 3,352 GB/s

Measuring Effective Bandwidth:
  For a kernel that reads N bytes and writes M bytes:

  Effective BW = (N + M) / kernel_time

  Example: Vector add (C = A + B), 1 billion FP32 elements:
    Reads: 2 * 4 * 10^9 = 8 GB  (read A and B)
    Writes: 1 * 4 * 10^9 = 4 GB (write C)
    Total: 12 GB

    If kernel takes 4.5 ms:
    Effective BW = 12 / 0.0045 = 2,667 GB/s  (~80% of peak)

    80% of peak is very good for a memory-bound kernel.
    Reasons for not hitting 100%:
    - Memory controller overhead
    - ECC (Error-Correcting Code) overhead (~6%)
    - Non-coalesced access patterns
    - TLB misses
    - Memory page alignment
```

### 3.6.3 Bandwidth-Bound vs Compute-Bound

Understanding whether your kernel is limited by memory bandwidth or compute throughput is essential for optimization:

```
ARITHMETIC INTENSITY AND THE ROOFLINE MODEL
=============================================

Arithmetic Intensity (AI) = FLOPs performed / Bytes accessed

                       Roofline Model
Performance
(TFLOPS)  |          _____________________________ Peak Compute
          |         /
          |        /
          |       /    Compute-Bound Region
          |      /     (limited by ALU throughput)
          |     /
          |    /
          |   /  <-- Ridge Point (AI = Peak FLOPS / Peak BW)
          |  /
          | / Memory-Bound Region
          |/  (limited by memory bandwidth)
          +----------------------------------------
                Arithmetic Intensity (FLOPs/Byte)

H100 Example:
  Peak FP32: 67 TFLOPS
  Peak BW: 3.35 TB/s
  Ridge Point: 67,000 / 3,350 = 20 FLOPs/Byte

  If AI < 20: memory-bound --> optimize memory access patterns
  If AI > 20: compute-bound --> optimize arithmetic, use Tensor Cores

Common Operations:
  Vector add (C=A+B):  AI = 1 FLOP / 12 bytes = 0.08   --> heavily memory-bound
  Dot product:         AI = 2N / 8N = 0.25              --> memory-bound
  Matrix multiply:     AI = 2N^3 / (3*4*N^2) ~ N/6     --> compute-bound for large N
    N=4096:            AI = 683                          --> VERY compute-bound
  Convolution:         AI = 2*K^2*C_in / (K^2+1)       --> depends on filter size
```

### 3.6.4 Memory Coalescing

Global memory access efficiency depends critically on **coalescing** -- combining multiple thread requests into fewer, wider memory transactions:

```
MEMORY COALESCING
==================

GPU memory is accessed in 32-byte or 128-byte transactions (cache line sized).

COALESCED ACCESS (ideal):
  Warp threads access consecutive addresses:

  Thread:  T0   T1   T2   T3   T4  ...  T31
  Address: 0    4    8    12   16  ...  124

  +---+---+---+---+---+---+---+---+---+---+
  | 0 | 4 | 8 |12 |16 |20 |24 |28 |...|124|  <-- 1 x 128-byte transaction
  +---+---+---+---+---+---+---+---+---+---+

  128 bytes transferred, 128 bytes needed = 100% efficiency

STRIDED ACCESS (wasteful):
  Thread:  T0   T1    T2    T3    ...
  Address: 0    128   256   384   ...   (stride = 128 bytes)

  T0: [0..127]   --> 128 bytes transferred, 4 bytes used
  T1: [128..255] --> 128 bytes transferred, 4 bytes used
  ...

  32 * 128 = 4,096 bytes transferred, 128 bytes needed = 3.1% efficiency
  ~32x bandwidth waste!

RANDOM ACCESS (worst case):
  Thread:  T0     T1      T2      T3
  Address: 47892  102340  8       500716

  Each thread may hit a different cache line.
  Up to 32 separate 128-byte transactions.
  4,096 bytes transferred, 128 bytes needed = 3.1% efficiency
```

---

## 3.7 GPU Generations: NVIDIA Architecture Evolution

### 3.7.1 Timeline Overview

```
NVIDIA GPU ARCHITECTURE EVOLUTION
===================================

2010  Fermi          First "true" compute GPU. L1/L2 cache, ECC.
  |
2012  Kepler         Dynamic parallelism, Hyper-Q. Energy efficient.
  |
2014  Maxwell        Power efficiency breakthrough. Doubled perf/watt.
  |
2016  Pascal         HBM2, NVLink v1, unified memory. GP100 = first DL GPU.
  |
2017  Volta          TENSOR CORES. Independent thread scheduling. V100.
  |
2018  Turing         RT Cores (ray tracing). First hybrid rendering GPU.
  |
2020  Ampere         3rd gen Tensor Cores. Sparsity. A100 dominates AI.
  |
2022  Hopper         4th gen Tensor Cores. FP8. Transformer Engine. H100.
  |
2022  Ada Lovelace   3rd gen RT Cores. DLSS 3. Consumer Turing successor.
  |
2024  Blackwell      5th gen Tensor Cores. FP4. Dual-die. 2x H100.
  |
  v   (future)
```

### 3.7.2 Generation Details

**Fermi (2010) -- GF100**
The first GPU architecture designed with general-purpose computing as a primary goal, not an afterthought.

```
FERMI KEY INNOVATIONS
======================
- TRUE L1/L2 cache hierarchy (not just texture cache)
- ECC memory support (enterprise reliability)
- 512 CUDA cores (16 SMs * 32 cores)
- Dual warp scheduler per SM
- 64 KB shared memory / L1 per SM (configurable 48/16 or 16/48)
- Unified address space (pointers work across memory types)
- C++ support in CUDA

Peak FP32: ~1.0 TFLOPS
Memory: GDDR5, ~150 GB/s
Process: 40nm
TDP: ~250W
```

**Kepler (2012) -- GK110**

```
KEPLER KEY INNOVATIONS
=======================
- Dynamic Parallelism: kernels launch kernels (no CPU round-trip)
- Hyper-Q: 32 simultaneous hardware work queues
  (Fermi had 1, causing serialization)
- GPU Boost: dynamic clock scaling
- Shuffle instructions: intra-warp data exchange without shared memory
- 2880 CUDA cores (15 SMX * 192 cores)
- More energy efficient: performance/watt breakthrough

Peak FP32: ~5.0 TFLOPS (K80 dual-GPU)
Memory: GDDR5, ~288 GB/s
Process: 28nm
TDP: ~235W
```

**Maxwell (2014) -- GM200**

```
MAXWELL KEY INNOVATIONS
========================
- Massive power efficiency improvement (2x perf/watt over Kepler)
- Redesigned SM ("SMM") with simpler, more efficient scheduling
- Better shared memory arbitration
- 3072 CUDA cores (24 SMM * 128 cores)
- Reduced SM partition from 192 to 128 cores (better occupancy)
- First CUDA GPU for machine learning at scale
  (before Tensor Cores, GEMM was pure FP32)

Peak FP32: ~6.1 TFLOPS (Titan X)
Memory: GDDR5, ~336 GB/s
Process: 28nm
TDP: ~250W
```

**Pascal (2016) -- GP100 / GP102**

```
PASCAL KEY INNOVATIONS
=======================
- HBM2 memory (GP100): 720 GB/s bandwidth, 16 GB
- NVLink v1: 160 GB/s GPU-to-GPU interconnect (5x PCIe 3.0)
- Unified Memory with page migration engine
  (CPU and GPU share same virtual address space)
- Compute Preemption: instruction-level preemption
- FP16 compute: 2x FP32 throughput for half precision
- 3840 CUDA cores (60 SMs * 64 cores) on GP100

GP100 (Tesla P100):
  Peak FP32: ~10.6 TFLOPS
  Peak FP16: ~21.2 TFLOPS
  Memory: 16 GB HBM2, 720 GB/s
  Process: 16nm FinFET
  TDP: ~300W

The P100 was the go-to GPU for deep learning from 2016-2017.
```

**Volta (2017) -- GV100**

```
VOLTA KEY INNOVATIONS (REVOLUTIONARY)
=======================================
- TENSOR CORES: 640 Tensor Cores (8 per SM)
  Each performs 4x4 FP16 matrix multiply-accumulate per clock
  Enabled mixed-precision training: 120 TFLOPS in FP16 Tensor

- Independent Thread Scheduling:
  Pre-Volta: all threads in a warp share one program counter
  Volta: each thread has its OWN program counter and call stack
  Enables fine-grained synchronization (cooperative groups)

- NVLink v2: 300 GB/s (6 links * 50 GB/s)
- Combined L1 cache + shared memory: 128 KB unified, configurable
- 5120 CUDA cores (80 SMs * 64 cores)

V100:
  Peak FP32: ~15.7 TFLOPS
  Peak FP16 Tensor: ~125 TFLOPS
  Memory: 32 GB HBM2, 900 GB/s
  Process: 12nm
  TDP: ~300W

The V100 defined the AI training era. Tensor Cores were the key.
```

**Turing (2018) -- TU102**

```
TURING KEY INNOVATIONS
========================
- RT CORES: dedicated ray-triangle intersection hardware
  10 GigaRays/second (10x software ray tracing)

- 2nd gen Tensor Cores: INT8 and INT4 inference support
  Variable-rate shading

- Deep Learning Super Sampling (DLSS):
  AI-powered upscaling using Tensor Cores
  Render at lower resolution, upscale to 4K

- Mesh Shaders: new programmable geometry pipeline
- 4608 CUDA cores (72 SMs * 64 cores)
- Concurrent FP32 + INT32 execution within SM

RTX 2080 Ti:
  Peak FP32: ~13.4 TFLOPS
  Peak FP16 Tensor: ~107 TFLOPS
  Memory: 11 GB GDDR6, 616 GB/s
  Process: 12nm
  TDP: ~260W

Turing bridged gaming (RT Cores) and AI (Tensor Cores).
```

**Ampere (2020) -- GA100 / GA102**

```
AMPERE KEY INNOVATIONS
========================
- 3rd gen Tensor Cores: TF32 (TensorFloat-32) format
  "Drop-in" FP32 training at 8x speed
  BF16 support for better dynamic range
  FP64 Tensor Cores (for HPC, A100 only)

- Structural Sparsity (2:4):
  Hardware exploits 50% sparsity in neural networks
  2x effective Tensor Core throughput for sparse models
  Fine-grained structured sparsity: 2 zeros per 4 elements

- 3rd gen NVLink: 600 GB/s (12 links * 50 GB/s)
- Multi-Instance GPU (MIG): partition one GPU into 7 independent instances
- Async copy: direct shared memory loads from global memory
- 6912 CUDA cores (108 SMs * 64 cores) on GA100

A100:
  Peak FP32: ~19.5 TFLOPS
  Peak TF32 Tensor: ~156 TFLOPS
  Peak FP16 Tensor: ~312 TFLOPS
  Peak INT8 Tensor: ~624 TOPS
  Memory: 80 GB HBM2e, 2,039 GB/s
  Process: 7nm
  TDP: ~400W

The A100 dominated AI training and inference for 3+ years.
```

**Hopper (2022) -- GH100**

```
HOPPER KEY INNOVATIONS
========================
- 4th gen Tensor Cores: FP8 (E4M3, E5M2) support
  Enables FP8 training with minimal accuracy loss

- TRANSFORMER ENGINE:
  Automatic mixed precision for transformer models
  Dynamically selects FP8 vs FP16 per-layer

- DPX Instructions: dynamic programming acceleration
  Smith-Waterman, Floyd-Warshall, Viterbi at HW speed
  Up to 7x faster than A100 for genomics

- Thread Block Clusters: new hierarchy level
  Multiple blocks cooperate across SMs
  Distributed shared memory across cluster

- NVLink v4: 900 GB/s (18 links)
- NVSwitch 3.0: all-to-all GPU communication in a node
- PCIe Gen5 support
- Confidential Computing (hardware encryption)

H100 (SXM5):
  Peak FP32: ~67 TFLOPS
  Peak TF32 Tensor: ~989 TFLOPS
  Peak FP16 Tensor: ~1,979 TFLOPS
  Peak FP8 Tensor: ~3,958 TFLOPS
  Memory: 80 GB HBM3, 3,350 GB/s
  Process: 4nm
  TDP: ~700W

H100 is 3-6x faster than A100 for LLM training.
```

**Blackwell (2024) -- GB100**

```
BLACKWELL KEY INNOVATIONS
===========================
- 5th gen Tensor Cores: FP4 support
  Further reduced precision for inference

- DUAL-DIE DESIGN:
  Two compute dies on one package
  Connected by 10 TB/s chip-to-chip link
  Acts as single GPU to software

  +----------+  10 TB/s  +----------+
  |  Die 0   |<=======+>|  Die 1   |
  | (half of |  chip-   | (half of |
  |  the SMs)|  to-chip |  the SMs)|
  +----------+          +----------+

- 2nd gen Transformer Engine
- NVLink 5: 1,800 GB/s
- 192 GB HBM3e at 8 TB/s
- Decompression engine (for compressed data)
- RAS (Reliability) improvements

B200:
  Peak FP4 Tensor: ~18,000 TOPS (estimated)
  Peak FP8 Tensor: ~9,000 TFLOPS
  Peak FP16 Tensor: ~4,500 TFLOPS
  Memory: 192 GB HBM3e, ~8 TB/s
  Process: 4nm (TSMC N4P)
  TDP: ~1000W (liquid cooled)

~2-2.5x H100 for LLM training, ~5x for inference.
```

### 3.7.3 Generational Comparison Table

```
+=========================================================================+
|              NVIDIA GPU GENERATION COMPARISON                            |
+=========================================================================+
| Gen       | Year | SMs  | Cores | Tensor | FP32     | Mem BW   | Node  |
|           |      |      | /SM   | TFLOPS | TFLOPS   | (GB/s)   |       |
+=========================================================================+
| Fermi     | 2010 | 16   | 32    | --     | 1.0      | 150      | 40nm  |
| Kepler    | 2012 | 15   | 192   | --     | 5.0      | 288      | 28nm  |
| Maxwell   | 2014 | 24   | 128   | --     | 6.1      | 336      | 28nm  |
| Pascal    | 2016 | 60   | 64    | --     | 10.6     | 720      | 16nm  |
| Volta     | 2017 | 80   | 64    | 125    | 15.7     | 900      | 12nm  |
| Turing    | 2018 | 72   | 64    | 107    | 13.4     | 616      | 12nm  |
| Ampere    | 2020 | 108  | 64    | 312    | 19.5     | 2,039    | 7nm   |
| Hopper    | 2022 | 132  | 128   | 1,979  | 67.0     | 3,350    | 4nm   |
| Blackwell | 2024 | 192* | 128   | 4,500  | ~120*    | 8,000    | 4nm   |
+=========================================================================+
* Blackwell uses dual-die design; numbers are for the full package

Note: Tensor TFLOPS are for FP16 with accumulate. Consumer variants
(GeForce) have different specs than data center (Tesla/Ampere/Hopper).
```

---

## 3.8 AMD and Intel GPUs

### 3.8.1 AMD RDNA and CDNA

AMD maintains two distinct GPU architectures:

- **RDNA** (Radeon DNA): Gaming and consumer graphics
- **CDNA** (Compute DNA): Data center and HPC compute

```
AMD GPU ARCHITECTURE OVERVIEW
==============================

RDNA 3 (Radeon RX 7900 XTX) -- Consumer/Gaming
+--------------------------------------------------+
|                                                  |
|  Shader Engine 0        Shader Engine 1          |
|  +------------------+  +------------------+      |
|  | WGP  WGP  WGP    |  | WGP  WGP  WGP    |      |
|  | WGP  WGP  WGP    |  | WGP  WGP  WGP    |      |
|  +------------------+  +------------------+      |
|                                                  |
|  Shader Engine 2        Shader Engine 3          |
|  +------------------+  +------------------+      |
|  | WGP  WGP  WGP    |  | WGP  WGP  WGP    |      |
|  | WGP  WGP  WGP    |  | WGP  WGP  WGP    |      |
|  +------------------+  +------------------+      |
|                                                  |
|  +----------------------------------------------+|
|  |              Infinity Cache (96 MB)           ||
|  +----------------------------------------------+|
|  GDDR6: 384-bit, 960 GB/s                        |
+--------------------------------------------------+

WGP = Work Group Processor (AMD's equivalent of NVIDIA's SM)
Each WGP contains:
  - 2 Compute Units (CUs)
  - Each CU: 64 stream processors (ALUs), 1 scalar unit
  - Shared LDS (Local Data Share) = shared memory

Total: 96 CUs, 6,144 stream processors (at 64 per CU)

Key difference from NVIDIA:
  - AMD wavefront = 32 or 64 threads (vs NVIDIA warp = 32)
  - RDNA 3 uses "wave32" as native width (wave64 emulated as 2x wave32)
  - Chiplet design: compute die + memory controller die (MCDs)


CDNA 3 (MI300X) -- Data Center
+--------------------------------------------------+
|                                                  |
|  XCD 0        XCD 1       ... XCD 7             |
|  +-------+   +-------+       +-------+          |
|  |40 CUs |   |40 CUs |       |40 CUs |          |
|  +-------+   +-------+       +-------+          |
|                                                  |
|  8 XCDs total = 304 active CUs                   |
|  19,456 stream processors                        |
|                                                  |
|  +----------------------------------------------+|
|  |     HBM3: 192 GB, 5.3 TB/s bandwidth         ||
|  +----------------------------------------------+|
|                                                  |
|  Matrix Cores: AMD's answer to Tensor Cores      |
|  FP16: ~1,307 TFLOPS (matrix)                    |
|  FP8: ~2,615 TFLOPS (matrix)                     |
+--------------------------------------------------+

XCD = Accelerated Compute Die (chiplet)
MI300X uses 8 compute chiplets + 4 I/O dies on one package
```

AMD terminology vs NVIDIA terminology:

| AMD Term | NVIDIA Equivalent | Description |
|----------|-------------------|-------------|
| Compute Unit (CU) | Streaming Multiprocessor (SM) | Basic compute building block |
| Work Group Processor (WGP) | ~2 SMs | Groups 2 CUs with shared resources |
| Stream Processor | CUDA Core | Single ALU execution unit |
| Wavefront (wave32/wave64) | Warp (32 threads) | Group of threads in lockstep |
| Local Data Share (LDS) | Shared Memory | Per-block fast scratchpad |
| Matrix Core | Tensor Core | Matrix multiply-accumulate unit |
| Infinity Cache | L2 Cache (conceptually) | Large on-die cache (RDNA) |
| Infinity Fabric | NVLink (loosely) | Die-to-die interconnect |
| ROCm | CUDA | GPU programming platform |
| HIP | CUDA (API-compatible) | ROCm's CUDA-like programming API |

### 3.8.2 Intel Xe / Arc

Intel entered the discrete GPU market with the Xe architecture:

```
INTEL GPU ARCHITECTURE
=======================

Intel Xe-HPG (Arc A770) -- Consumer
+--------------------------------------------------+
|                                                  |
|  Render Slice 0    Render Slice 1                |
|  +------------+   +------------+                 |
|  |Xe Core x8  |   |Xe Core x8  |                 |
|  +------------+   +------------+                 |
|  Render Slice 2    Render Slice 3                |
|  +------------+   +------------+                 |
|  |Xe Core x8  |   |Xe Core x8  |                 |
|  +------------+   +------------+                 |
|                                                  |
|  32 Xe Cores total                               |
|  Each Xe Core: 16 256-bit vector engines         |
|                + 16 1024-bit XMX (matrix) engines|
|  GDDR6: 256-bit, 560 GB/s                        |
+--------------------------------------------------+

Intel Xe-HPC (Ponte Vecchio / Max 1550) -- Data Center
+--------------------------------------------------+
|                                                  |
|  128 Xe-HPC Cores                                |
|  Each: 8 512-bit vector engines                  |
|        8 4096-bit XMX engines                    |
|                                                  |
|  HBM2e: 128 GB, 3.2 TB/s                        |
|  FP32: ~52 TFLOPS                                |
|  FP16 XMX: ~839 TFLOPS                           |
+--------------------------------------------------+

Intel terminology:
  Xe Core = SM equivalent
  Execution Unit (EU) = group of ALUs within Xe Core
  XMX engine = Tensor Core equivalent
  Subslice = groups of EUs
  oneAPI / SYCL = programming model (not CUDA-compatible)
```

### 3.8.3 Cross-Vendor Comparison

```
DATA CENTER GPU COMPARISON (as of 2024)
=========================================

+-------------------------------------------------------------------+
|              | NVIDIA H100 | AMD MI300X  | Intel Max 1550         |
+-------------------------------------------------------------------+
| Architecture | Hopper      | CDNA 3      | Xe-HPC                 |
| Process      | 4nm         | 5/6nm       | Intel 7 (10nm ESL)     |
| Compute Units| 132 SMs     | 304 CUs     | 128 Xe-HPC Cores      |
| FP32         | 67 TFLOPS   | 163 TFLOPS  | 52 TFLOPS              |
| FP16 Matrix  | 1,979 TFLOP | 1,307 TFLOP | 839 TFLOPS             |
| FP8 Matrix   | 3,958 TFLOP | 2,615 TFLOP | N/A                    |
| Memory       | 80 GB HBM3  | 192 GB HBM3 | 128 GB HBM2e           |
| Mem BW       | 3,350 GB/s  | 5,300 GB/s  | 3,276 GB/s             |
| Interconnect | NVLink 4    | Inf. Fabric | Xe Link                |
| Inter-GPU BW | 900 GB/s    | 896 GB/s    | 318 GB/s               |
| TDP          | 700W        | 750W        | 600W                   |
| SW Ecosystem | CUDA        | ROCm/HIP    | oneAPI/SYCL            |
+-------------------------------------------------------------------+

Key takeaways:
1. AMD MI300X has MORE memory (192 GB) and bandwidth (5.3 TB/s)
   --> critical for large language models that are memory-bound
2. NVIDIA H100 has higher Tensor Core throughput and better SW ecosystem
3. Intel Max is competitive on specs but lags in software maturity
4. Software ecosystem matters as much as hardware:
   CUDA >> ROCm > oneAPI in library/tool availability
```

---

## 3.9 CPU vs GPU Decision Matrix

### 3.9.1 Workload Characteristics

Not every workload benefits from GPU acceleration. The key factors are:

```
GPU SUITABILITY ANALYSIS
=========================

                     High Parallelism
                           ^
                           |
     GPU IDEAL             |           GPU GOOD
     (matrix multiply,     |           (graph traversal,
      image processing,    |            sparse linear algebra,
      FFT, deep learning)  |            database analytics)
                           |
   <-----------------------+----------------------->
   Low Arithmetic          |         High Arithmetic
   Intensity               |         Intensity
                           |
     CPU BETTER            |           CPU IDEAL
     (linked list walk,    |           (recursive tree search,
      OS kernel tasks,     |            complex control flow,
      serial algorithms)   |            small data sets)
                           |
                           v
                     Low Parallelism
```

### 3.9.2 Decision Matrix

| Factor | Favors GPU | Favors CPU |
|--------|-----------|-----------|
| **Data parallelism** | Millions of independent elements | Few elements or dependencies |
| **Arithmetic intensity** | High FLOP/byte ratio (>5-10) | Low FLOP/byte ratio (<1) |
| **Control flow** | Uniform (all threads same path) | Highly divergent, complex branching |
| **Data size** | Large (fills GPU parallelism) | Small (overhead > compute) |
| **Memory access** | Regular, coalesced patterns | Random, pointer-chasing |
| **Precision** | FP16/FP32 sufficient | FP64 required (scientific) |
| **Latency** | Throughput matters more | Single-operation latency critical |
| **Data transfer** | Data stays on GPU across kernels | Frequent CPU-GPU transfers |
| **Algorithm** | Well-known parallel algorithms exist | Inherently sequential |
| **Development time** | Performance justifies effort | Rapid iteration needed |

### 3.9.3 Cost-Benefit Analysis

```
DATA TRANSFER OVERHEAD
========================

Problem: GPU is fast, but moving data to/from GPU is slow.

PCIe 4.0 x16: ~25 GB/s each direction
PCIe 5.0 x16: ~64 GB/s each direction

For a computation that takes T_compute on GPU:

  Total_GPU_time = T_transfer_to_GPU + T_compute + T_transfer_from_GPU

If data size is D bytes:
  T_transfer = 2 * D / PCIe_bandwidth  (round trip)

Break-even: GPU is only worth it if:
  T_CPU > T_transfer + T_compute_GPU

Example: Process 100 MB of data
  T_transfer = 2 * 100 MB / 25 GB/s = 8 ms  (PCIe 4.0)
  T_compute_GPU = 0.5 ms  (GPU is 100x faster than CPU)
  Total_GPU = 8.5 ms

  T_CPU = 50 ms  (CPU time)

  GPU wins: 50 ms vs 8.5 ms

  But if data is only 1 MB:
  T_transfer = 2 * 1 MB / 25 GB/s = 0.08 ms
  T_compute_GPU = 0.005 ms
  Total_GPU = 0.085 ms + kernel launch overhead (~0.01 ms)

  T_CPU = 0.5 ms

  GPU still wins, but margin is slim.
  For tiny data (<10 KB), CPU is faster due to kernel launch overhead.
```

### 3.9.4 Real-World Decision Examples

```
DECISION EXAMPLES
==================

1. MATRIX MULTIPLICATION (1024x1024, FP32)
   Parallelism:   1 billion independent MADs     --> HIGH
   Arith. Intensity: ~170 FLOPs/byte             --> HIGH
   Control flow:  None (uniform)                   --> UNIFORM
   Data size:     12 MB                           --> MODERATE
   VERDICT: GPU (100x+ speedup)

2. BINARY SEARCH IN SORTED ARRAY (1M elements)
   Parallelism:   log(N) = 20 steps, sequential  --> LOW
   Arith. Intensity: 1 compare per 8 bytes        --> LOW
   Control flow:  Every step branches             --> DIVERGENT
   Data size:     4 MB                            --> SMALL
   VERDICT: CPU (GPU would be slower)

3. IMAGE CONVOLUTION (4K image, 5x5 kernel)
   Parallelism:   8.3M pixels, independent       --> HIGH
   Arith. Intensity: 50 FLOPs per pixel / ~20B   --> MODERATE
   Control flow:  None (uniform)                   --> UNIFORM
   Data size:     ~100 MB (4K RGBA + output)      --> MODERATE
   VERDICT: GPU (50-200x speedup)

4. WEB SERVER REQUEST ROUTING
   Parallelism:   Each request independent        --> HIGH
   Arith. Intensity: Mostly I/O, string ops       --> LOW
   Control flow:  Complex routing logic            --> DIVERGENT
   Data size:     Small per request               --> SMALL
   VERDICT: CPU (I/O-bound, complex branching)

5. LARGE LANGUAGE MODEL INFERENCE (7B params)
   Parallelism:   Matrix ops on billions of params--> VERY HIGH
   Arith. Intensity: Variable (attention vs FFN)  --> MODERATE-HIGH
   Control flow:  Mostly uniform                   --> UNIFORM
   Data size:     14 GB (FP16 weights)            --> LARGE
   VERDICT: GPU (no practical CPU alternative)

6. LINKED LIST TRAVERSAL
   Parallelism:   None (pointer chasing)          --> NONE
   Arith. Intensity: 1 op per 8-byte pointer read --> VERY LOW
   Control flow:  Sequential by nature             --> SEQUENTIAL
   Data size:     Scattered in memory             --> CACHE-HOSTILE
   VERDICT: CPU (GPU would be catastrophically slow)
```

---

## 3.10 PCIe and NVLink

### 3.10.1 Host-Device Communication

The CPU (host) and GPU (device) are separate processors with separate memories, connected by a bus:

```
HOST-DEVICE ARCHITECTURE
==========================

+------------------+                    +------------------+
|     CPU (Host)   |                    |   GPU (Device)   |
|                  |                    |                  |
| +------+ +----+ |                    | +------+         |
| | Core | | L3 | |    PCIe 5.0 x16    | | SMs  |         |
| | Core | |    | |<==================>| | SMs  |         |
| | Core | |    | |    64 GB/s bidir    | | SMs  |         |
| | Core | |    | |                    | +------+         |
| +------+ +----+ |                    |                  |
|                  |                    | +------+         |
| +------+        |                    | | HBM  |         |
| | DDR5 |        |                    | | 80GB |         |
| | RAM  |        |                    | |3.3TB/s|        |
| | 128GB|        |                    | +------+         |
| +------+        |                    |                  |
+------------------+                    +------------------+

Key observation:
  GPU internal memory bandwidth: 3,350 GB/s (H100 HBM3)
  CPU-GPU link bandwidth:           64 GB/s (PCIe 5.0 x16)

  Ratio: 52:1

  The PCIe link is a massive bottleneck.
  Moving 1 GB of data to the GPU takes ~16 ms over PCIe 5.0.
  Processing that 1 GB on the GPU might take <1 ms.

  CONCLUSION: Keep data on the GPU. Minimize transfers.
```

### 3.10.2 PCIe Generations

```
PCIe BANDWIDTH EVOLUTION
=========================

+-------+----------+---------+----------+----------+
| Gen   | Per Lane | x16     | Encoding | Year     |
+-------+----------+---------+----------+----------+
| 1.0   | 250 MB/s | 4 GB/s  | 8b/10b   | 2003     |
| 2.0   | 500 MB/s | 8 GB/s  | 8b/10b   | 2007     |
| 3.0   | 1 GB/s   | 16 GB/s | 128b/130b| 2010     |
| 4.0   | 2 GB/s   | 32 GB/s | 128b/130b| 2017     |
| 5.0   | 4 GB/s   | 64 GB/s | 128b/130b| 2019     |
| 6.0   | 8 GB/s   | 128 GB/s| PAM4     | 2022     |
+-------+----------+---------+----------+----------+

Notes:
- Bandwidth doubles each generation
- x16 means 16 lanes (standard for GPUs)
- Encoding overhead: 8b/10b = 20% overhead, 128b/130b = ~1.5%
- Most current GPUs: PCIe 4.0 or 5.0
- Bidirectional: full bandwidth in each direction simultaneously
```

### 3.10.3 NVLink

NVLink provides much higher bandwidth for GPU-to-GPU communication, bypassing the CPU entirely:

```
NVLink TOPOLOGY: DGX H100 (8x H100 GPUs)
===========================================

Each H100 has 18 NVLink 4.0 links (900 GB/s total bidirectional)

             NVSwitch Layer (3rd gen)
    +===========================================+
    |  NVSwitch  NVSwitch  NVSwitch  NVSwitch   |
    |     0         1         2         3       |
    +===========================================+
       ||||      ||||      ||||      ||||
    +------+ +------+ +------+ +------+
    | H100 | | H100 | | H100 | | H100 |
    |  #0  | |  #1  | |  #2  | |  #3  |
    +------+ +------+ +------+ +------+
       ||||      ||||      ||||      ||||
    +===========================================+
    |  NVSwitch  NVSwitch  NVSwitch  NVSwitch   |
    |     4         5         6         7       |
    +===========================================+
       ||||      ||||      ||||      ||||
    +------+ +------+ +------+ +------+
    | H100 | | H100 | | H100 | | H100 |
    |  #4  | |  #5  | |  #6  | |  #7  |
    +------+ +------+ +------+ +------+

NVSwitch enables ALL-TO-ALL communication:
  - Any GPU can talk to any other GPU at full 900 GB/s
  - Total bisection bandwidth: 3.6 TB/s
  - No CPU involvement needed (GPU-Direct)

Compare to PCIe topology:
  GPU-to-GPU via PCIe: must go through CPU
  GPU0 --> PCIe --> CPU --> PCIe --> GPU1
  Bandwidth: limited to ~32-64 GB/s, double the latency

NVLink advantage: 14-28x more bandwidth than PCIe 5.0
```

### 3.10.4 NVLink Generation Comparison

```
+=========================================================+
| NVLink   | Year | Links/GPU | BW/Link | Total BW (bidir)|
+=========================================================+
| NVLink 1 | 2016 | 4         | 40 GB/s | 160 GB/s        |
| NVLink 2 | 2017 | 6         | 50 GB/s | 300 GB/s        |
| NVLink 3 | 2020 | 12        | 50 GB/s | 600 GB/s        |
| NVLink 4 | 2022 | 18        | 50 GB/s | 900 GB/s        |
| NVLink 5 | 2024 | 18        | 100 GB/s| 1,800 GB/s      |
+=========================================================+
```

### 3.10.5 GPU-Direct Technologies

GPU-Direct allows data to move between GPUs, network cards, and storage devices without going through the CPU:

```
GPU-DIRECT TECHNOLOGIES
=========================

1. GPU-Direct Peer-to-Peer (P2P)
   GPU-to-GPU transfer without CPU copy:

   Before:  GPU0 -> CPU RAM -> GPU1  (2 copies, CPU involved)
   After:   GPU0 ---------> GPU1    (1 copy over NVLink/PCIe)

2. GPU-Direct RDMA (Remote Direct Memory Access)
   Network card reads/writes GPU memory directly:

   Before:  GPU -> CPU RAM -> NIC -> Network
   After:   GPU -----------> NIC -> Network

   Critical for multi-node training (e.g., distributed LLM training)
   Reduces latency by ~50%, frees CPU for other work

3. GPU-Direct Storage
   GPU reads from NVMe SSD without CPU involvement:

   Before:  SSD -> CPU RAM -> GPU    (CPU bottleneck)
   After:   SSD -----------> GPU    (direct DMA)

   Important for loading massive datasets into GPU memory

4. GPU-Direct Video (Mellanox ConnectX)
   Video capture directly into GPU memory:

   Before:  Camera -> CPU RAM -> GPU  (adds latency)
   After:   Camera -----------> GPU  (real-time processing)


DATA PATH COMPARISON
=====================

Traditional:
  +-----+   copy   +-----+   copy   +-----+
  | SSD |--------->| CPU |--------->| GPU |
  +-----+          | RAM |          +-----+
                   +-----+
  Latency: ~100 us + ~50 us = 150 us
  Limited by: CPU memory bandwidth (~50 GB/s)

GPU-Direct Storage:
  +-----+   DMA    +-----+
  | SSD |--------->| GPU |
  +-----+          +-----+
  Latency: ~100 us
  Limited by: NVMe bandwidth (~7 GB/s per drive)

Multi-node GPU-Direct RDMA:
  +------+  NVLink  +------+  InfiniBand  +------+  NVLink  +------+
  | GPU0 |<=======>| GPU1 |<===========>| GPU2 |<=======>| GPU3 |
  +------+  900GB/s +------+   400GB/s    +------+  900GB/s +------+
  Node 0                                   Node 1
```

### 3.10.6 Pinned (Page-Locked) Memory

Regular CPU memory can be swapped to disk by the operating system. GPU DMA transfers require page-locked ("pinned") memory to guarantee the physical address does not change during transfer:

```
PINNED vs PAGEABLE MEMORY TRANSFER
=====================================

Pageable (default malloc):
  CPU RAM (pageable)                    GPU Memory
  +------------------+                  +------------------+
  | data (pageable)  |                  |                  |
  +--------+---------+                  +------------------+
           |                                    ^
           | 1. Copy to pinned staging buffer   |
           v                                    |
  +------------------+                          |
  | staging (pinned) |--- 2. DMA transfer ----->|
  +------------------+

  TWO copies: pageable->pinned, then pinned->GPU
  ~50% bandwidth loss

Pinned (cudaMallocHost):
  CPU RAM (pinned)                      GPU Memory
  +------------------+                  +------------------+
  | data (pinned)    |--- DMA transfer->|                  |
  +------------------+                  +------------------+

  ONE copy: direct DMA
  Full PCIe bandwidth achieved

Trade-off:
  Pinned memory is not swappable.
  Allocating too much can starve the OS.
  Use pinned memory for frequently transferred buffers.
  Use pageable for everything else.
```

---

## 3.11 Putting It All Together

Let us trace the execution of a simple GPU program from launch to completion:

```
COMPLETE EXECUTION TRACE: VECTOR ADD KERNEL
=============================================

Host code:
  float *d_A, *d_B, *d_C;
  cudaMalloc(&d_A, N * sizeof(float));
  cudaMalloc(&d_B, N * sizeof(float));
  cudaMalloc(&d_C, N * sizeof(float));
  cudaMemcpy(d_A, h_A, N * sizeof(float), cudaMemcpyHostToDevice);
  cudaMemcpy(d_B, h_B, N * sizeof(float), cudaMemcpyHostToDevice);
  vectorAdd<<<numBlocks, 256>>>(d_A, d_B, d_C, N);
  cudaMemcpy(h_C, d_C, N * sizeof(float), cudaMemcpyDeviceToHost);

Kernel:
  __global__ void vectorAdd(float *A, float *B, float *C, int N) {
      int i = blockIdx.x * blockDim.x + threadIdx.x;
      if (i < N) C[i] = A[i] + B[i];
  }

EXECUTION STEPS:

1. cudaMalloc: GPU driver allocates memory in HBM
   +--------------------------------------------------+
   | GPU HBM                                           |
   | [d_A: N*4 bytes] [d_B: N*4 bytes] [d_C: N*4 bytes]|
   +--------------------------------------------------+

2. cudaMemcpy (Host -> Device): Data travels over PCIe
   CPU RAM ====PCIe 5.0 (64 GB/s)====> GPU HBM

3. Kernel launch: CPU sends launch command to GPU
   - GigaThread Engine receives grid configuration
   - Grid: numBlocks blocks, each with 256 threads (8 warps)

4. Block scheduling: GigaThread Engine assigns blocks to SMs
   +--------+  +--------+  +--------+       +--------+
   | SM 0   |  | SM 1   |  | SM 2   |  ...  | SM 131 |
   | Blk 0  |  | Blk 1  |  | Blk 2  |       | Blk 131|
   | Blk 132|  | Blk 133|  | Blk 134|       | Blk 263|
   | ...    |  | ...    |  | ...    |       | ...    |
   +--------+  +--------+  +--------+       +--------+

5. Warp execution (inside one SM, one warp):
   a. Warp scheduler selects Warp 0 (threads 0-31)
   b. Issues: calculate i = blockIdx.x * 256 + threadIdx.x
      Thread 0: i=0, Thread 1: i=1, ... Thread 31: i=31
   c. Issues: if (i < N) -- all threads pass (no divergence)
   d. Issues: LD A[i] and LD B[i]
      - 32 consecutive float reads = 128 bytes
      - Coalesced into 1x128-byte transaction
      - Sent to L1 cache, then L2, then HBM if miss
   e. Scheduler switches to another warp while waiting (~400 cycles)
   f. Data arrives. Scheduler resumes this warp.
   g. Issues: FADD -- 32 additions in one cycle
   h. Issues: ST C[i] -- 32 coalesced writes

6. Block completion: All warps in block finish. SM slot freed.

7. cudaMemcpy (Device -> Host): Results travel back over PCIe
   GPU HBM ====PCIe 5.0 (64 GB/s)====> CPU RAM
```

---

## Key Concepts Summary

```
+=====================================================================+
|                    CHAPTER 3: KEY CONCEPTS                           |
+=====================================================================+
|                                                                     |
|  1. WHY GPUs EXIST                                                  |
|     - Graphics pipeline requires same operation on millions of      |
|       pixels (embarrassingly parallel)                              |
|     - GPUs dedicate ~80% of die to ALUs (vs ~30% for CPUs)         |
|     - Optimized for THROUGHPUT, not latency                         |
|     - GPGPU emerged when shaders became programmable (2006+)        |
|                                                                     |
|  2. HARDWARE STRUCTURE                                              |
|     - GPU = many SMs connected by L2 cache and memory controllers   |
|     - SM = warp schedulers + register file + CUDA cores +           |
|            shared memory + SFUs + Tensor Cores                      |
|     - CUDA core = simple FP32 execution lane (not a "CPU core")     |
|                                                                     |
|  3. SIMT EXECUTION                                                  |
|     - 32 threads execute in lockstep as a "warp"                    |
|     - Write scalar code; hardware parallelizes across warp          |
|     - Divergence: both paths execute, inactive threads masked       |
|     - Latency hiding: switch warps during memory stalls             |
|                                                                     |
|  4. THREAD HIERARCHY                                                |
|     - Thread -> Warp (32) -> Block (up to 1024) -> Grid             |
|     - Blocks map to SMs; blocks are independent                     |
|     - Independence enables automatic scaling across GPU sizes       |
|                                                                     |
|  5. MEMORY HIERARCHY                                                |
|     - Registers: 0 cycles, per-thread, 256 KB/SM                   |
|     - Shared memory: ~20-30 cycles, per-block, user-managed         |
|     - L1/L2 cache: 30-300 cycles, automatic                        |
|     - Global memory (HBM): 400-800 cycles, 1.5-3.35 TB/s           |
|     - Coalesced access is critical for bandwidth efficiency         |
|                                                                     |
|  6. BANDWIDTH                                                       |
|     - HBM >> GDDR in bandwidth and power efficiency                 |
|     - Arithmetic Intensity determines memory-bound vs compute-bound |
|     - Roofline model: performance limited by min(compute, bandwidth)|
|                                                                     |
|  7. GPU GENERATIONS                                                 |
|     - Volta (2017): Tensor Cores (revolution for AI)                |
|     - Turing (2018): RT Cores (revolution for ray tracing)          |
|     - Ampere (2020): Sparsity, TF32, MIG                           |
|     - Hopper (2022): FP8, Transformer Engine                        |
|     - Blackwell (2024): Dual-die, FP4, 2x perf/watt               |
|                                                                     |
|  8. AMD and INTEL                                                   |
|     - AMD CDNA: competitive hardware, ROCm/HIP ecosystem            |
|     - Intel Xe-HPC: competitive specs, oneAPI/SYCL ecosystem         |
|     - NVIDIA CUDA ecosystem remains dominant                         |
|                                                                     |
|  9. CPU vs GPU DECISION                                             |
|     - GPU: high parallelism + high arithmetic intensity + uniform   |
|       control flow + large data                                     |
|     - CPU: sequential logic + complex branching + small data +      |
|       I/O-bound + pointer-chasing                                   |
|     - Data transfer cost (PCIe) can negate GPU speedup              |
|                                                                     |
| 10. INTERCONNECTS                                                   |
|     - PCIe 5.0: 64 GB/s (CPU-GPU link)                             |
|     - NVLink 4: 900 GB/s (GPU-GPU, 14x PCIe)                       |
|     - GPU-Direct: bypass CPU for GPU-GPU, GPU-NIC, GPU-SSD          |
|     - Pinned memory: enables full PCIe DMA bandwidth                |
|                                                                     |
+=====================================================================+
```

---

## Interview Questions

### Conceptual Questions

**Q1: Why are GPUs faster than CPUs for matrix multiplication?**

Matrix multiplication is embarrassingly parallel: each element of the output matrix can be computed independently. A 4096x4096 matrix multiply involves ~137 billion FMA operations with high arithmetic intensity (~170 FLOPs/byte), which perfectly suits the GPU's thousands of cores and high memory bandwidth. The computation is uniform (all threads do the same operations), so there is no warp divergence. CPUs cannot match this because they have only ~4-64 cores, and even with AVX-512 SIMD, they achieve 1-2 TFLOPS vs the GPU's 67+ TFLOPS (FP32) or 1,979 TFLOPS (FP16 Tensor Core).

**Q2: Explain warp divergence. When does it occur and why is it costly?**

Warp divergence occurs when threads within a 32-thread warp take different paths at a conditional branch. Since all threads in a warp must execute the same instruction in lockstep (SIMT model), the warp must execute both the "if" and "else" paths sequentially, masking off threads that should not execute each path. This effectively serializes the divergent code. For a simple if/else with a 50/50 split, execution takes 2x longer than the non-divergent case. For a switch with N cases where each thread hits a different case, performance degrades by up to Nx. Divergence is costly because it wastes execution lanes: during each path, half (or more) of the warp's CUDA cores sit idle.

**Q3: What is the difference between shared memory and L1 cache on a GPU?**

Both reside in the same on-chip SRAM on the SM, but they serve different purposes. Shared memory is explicitly managed by the programmer: you declare `__shared__` arrays, load data into them, and use `__syncthreads()` to synchronize. It enables fast inter-thread communication within a block and acts as a user-controlled scratchpad. L1 cache is hardware-managed and transparent to the programmer: it automatically caches global memory accesses based on locality. On modern NVIDIA GPUs (Volta+), the shared memory and L1 cache partition is configurable, typically from the same 128-228 KB pool. The key difference is control: shared memory gives you guaranteed low-latency access to specific data, while L1 cache relies on hardware heuristics.

**Q4: Why does occupancy matter, and is higher occupancy always better?**

Occupancy is the ratio of active warps to the maximum warps an SM can support. Higher occupancy means more warps are available to hide memory latency through warp switching. When one warp stalls on a memory access (~400 cycles), the scheduler can immediately switch to another ready warp at zero cost. However, higher occupancy is not always better. If a kernel is compute-bound (high arithmetic intensity), even a few warps can keep the execution units busy. Reducing occupancy by using more registers per thread can actually improve performance if it eliminates register spills to slower local memory. The optimal occupancy depends on the kernel's compute-to-memory ratio. Generally, 50% occupancy is a good target, but profiling with Nsight Compute is the only reliable way to determine the sweet spot.

**Q5: Explain the GPU memory hierarchy from fastest to slowest.**

From fastest to slowest: (1) Registers -- zero-cycle latency, per-thread, up to 255 per thread, compiler-managed. (2) Shared memory -- ~20-30 cycles, per-block, user-managed scratchpad, organized in 32 banks. (3) L1 cache -- ~30-40 cycles, per-SM, hardware-managed, shares physical SRAM with shared memory. (4) L2 cache -- ~200-300 cycles, GPU-wide, 40-60 MB on modern GPUs. (5) Global memory (HBM/GDDR) -- 400-800 cycles, accessible by all threads, 1.5-3.35 TB/s bandwidth. (6) Host memory (system RAM) -- 10,000+ cycles from GPU perspective, limited by PCIe bandwidth (~64 GB/s). The key principle: keep frequently accessed data as close to the compute units as possible.

### Technical Questions

**Q6: A kernel uses 96 registers per thread and 48 KB of shared memory per block, with block size 256. On an SM with 65,536 registers, 256 KB shared memory (configurable), and max 32 blocks / 64 warps, how many blocks can run concurrently on one SM?**

Step by step:
- Register limit: 256 threads/block * 96 registers/thread = 24,576 registers per block. 65,536 / 24,576 = 2.67, so 2 blocks.
- Shared memory limit: 48 KB per block. If we configure 192 KB for shared memory: 192 / 48 = 4 blocks.
- Warp limit: 256 threads/block = 8 warps/block. 64 max warps / 8 = 8 blocks.
- Block limit: 32 blocks max.
- Answer: min(2, 4, 8, 32) = **2 blocks** per SM. The limiter is register usage. This gives 2 * 8 = 16 active warps out of 64 max = 25% occupancy. Consider reducing register usage (e.g., compiler flag `--maxrregcount=64`) to improve occupancy if the kernel is memory-bound.

**Q7: You have a kernel that processes a 4096x4096 FP32 matrix. Each thread reads one element, performs 100 FLOPs, and writes one element. Is this kernel compute-bound or memory-bound on an H100?**

Arithmetic Intensity = 100 FLOPs / (4 bytes read + 4 bytes written) = 100 / 8 = 12.5 FLOPs/byte.
H100 ridge point = 67,000 GFLOPS / 3,350 GB/s = 20 FLOPs/byte.
Since 12.5 < 20, this kernel is **memory-bound**. The optimization strategy should focus on memory access patterns (coalescing, caching) rather than reducing arithmetic operations. To become compute-bound, each thread would need to perform at least 160 FLOPs per 8 bytes accessed.

**Q8: Why is NVLink important for multi-GPU training of large language models?**

Large language models like GPT-4 exceed the memory of a single GPU, requiring model parallelism (splitting the model across GPUs) and data parallelism (splitting batches). Both require frequent inter-GPU communication: tensor parallelism requires all-reduce operations after every layer, and pipeline parallelism requires activations to be passed between GPUs. Over PCIe 5.0 (64 GB/s), this communication becomes the bottleneck, as GPUs spend more time transferring data than computing. NVLink 4 provides 900 GB/s (14x PCIe 5.0), and with NVSwitch, all 8 GPUs in a DGX system can communicate simultaneously at full bandwidth. For a transformer layer with 100 MB of activations to synchronize, PCIe takes ~3.1 ms round-trip while NVLink takes ~0.22 ms. At hundreds of layers and thousands of training steps, this difference compounds to hours or days of training time saved.

**Q9: What is memory coalescing and why does it matter?**

Memory coalescing is the hardware's ability to combine multiple thread memory requests into fewer, wider memory transactions. GPU global memory is accessed in 32-byte or 128-byte segments. When 32 threads in a warp access 32 consecutive 4-byte values (addresses 0, 4, 8, ..., 124), the hardware coalesces these into a single 128-byte transaction. But if threads access addresses with a stride (e.g., thread 0 at address 0, thread 1 at address 512), each thread may trigger a separate 128-byte transaction, wasting 31 out of 32 fetched bytes. This can reduce effective memory bandwidth by up to 32x. Coalescing matters because most GPU kernels are memory-bound, and poor access patterns can reduce a 3.35 TB/s memory system to an effective 100 GB/s. The fix: organize data in Struct-of-Arrays (SoA) layout rather than Array-of-Structs (AoS), and ensure threads access contiguous memory addresses.

**Q10: Compare NVIDIA CUDA, AMD ROCm/HIP, and Intel oneAPI/SYCL for GPU programming.**

CUDA is NVIDIA's proprietary framework, with 15+ years of ecosystem development, extensive libraries (cuBLAS, cuDNN, cuFFT, NCCL), mature tooling (Nsight Systems, Nsight Compute), and the widest adoption in AI/HPC. Nearly all deep learning frameworks use CUDA as their primary GPU backend.

ROCm/HIP is AMD's response. HIP is syntactically nearly identical to CUDA (many programs require only search-and-replace to port), and AMD provides ROCm libraries (rocBLAS, MIOpen, RCCL) that mirror CUDA equivalents. However, ROCm has historically lagged in stability, documentation, and library completeness. The MI300X has improved AMD's competitive position significantly.

oneAPI/SYCL is Intel's cross-vendor approach based on C++ standards. SYCL is an open standard that works across Intel, NVIDIA, and AMD GPUs (via adaptors). oneAPI includes MKL, oneDNN, and other libraries. The advantage is portability; the disadvantage is smaller ecosystem and less optimization for any single vendor's hardware.

For production AI: CUDA is the safe choice. For multi-vendor deployments: HIP (CUDA-compatible) or SYCL (truly vendor-neutral). For Intel hardware specifically: oneAPI.

### System Design Questions

**Q11: Design the data flow for a distributed training system using 8 GPUs across 2 nodes.**

```
NODE 0                                    NODE 1
+-----------------------------------+    +-----------------------------------+
|  GPU 0 <==NVLink==> GPU 1         |    |  GPU 4 <==NVLink==> GPU 5         |
|    ||                  ||          |    |    ||                  ||          |
|  GPU 2 <==NVLink==> GPU 3         |    |  GPU 6 <==NVLink==> GPU 7         |
|    |   NVSwitch (900 GB/s each)   |    |    |   NVSwitch (900 GB/s each)   |
|    +-------------------------------+    +-------------------------------+   |
|              |                                          |                  |
|         InfiniBand NDR (400 Gb/s)                       |                  |
|              +==========================================+                  |
+---------------------------------+    +-------------------------------------+

Data flow for one training step:
1. Each GPU holds a shard of the mini-batch (data parallelism)
2. Forward pass: each GPU computes independently
3. Backward pass: each GPU computes gradients independently
4. All-Reduce: sum gradients across all 8 GPUs
   a. Intra-node: NVLink (900 GB/s) -- ring or tree all-reduce via NCCL
   b. Inter-node: InfiniBand (50 GB/s) via GPU-Direct RDMA
   c. Total time dominated by inter-node link
5. Each GPU updates its copy of the model with averaged gradients
6. Repeat

For a 7B parameter model (14 GB in FP16):
  Gradient size: 14 GB
  Intra-node all-reduce: 14 GB / 900 GB/s = ~16 ms
  Inter-node all-reduce: 14 GB / 50 GB/s = ~280 ms

  Optimization: overlap communication with computation
  (start all-reduce for layer N while computing layer N+1)
```

**Q12: You are asked to evaluate whether to move a data analytics workload from CPU to GPU. What questions do you ask?**

1. **What is the data size?** If it fits in GPU memory (80 GB for H100), great. If not, you need multi-GPU or out-of-core processing, which adds complexity.

2. **What are the core operations?** Aggregations, sorts, and joins on columnar data are GPU-friendly (see RAPIDS/cuDF). Complex string processing or recursive queries are not.

3. **What is the arithmetic intensity?** Simple scans and filters are memory-bound on both CPU and GPU. The GPU advantage comes from higher memory bandwidth (3.35 TB/s vs ~50 GB/s), giving a ~50-60x theoretical speedup for bandwidth-limited operations.

4. **How much branching is involved?** SQL CASE statements with many branches cause warp divergence. Simple filters (WHERE x > 10) are fine.

5. **What is the query latency requirement?** GPU kernel launch overhead is ~5-20 microseconds. For sub-millisecond queries on tiny data, the CPU may be faster.

6. **How frequently does data change?** If data is loaded once and queried many times, the PCIe transfer cost is amortized. If data changes every query, the transfer cost may dominate.

7. **What is the software stack?** RAPIDS/cuDF provides a pandas-like API for GPU DataFrames. BlazingSQL provides GPU-accelerated SQL. If your workload fits these tools, migration is relatively easy. Custom analytics may require writing CUDA kernels.

8. **What is the cost model?** An H100 costs ~$30,000, while a high-end CPU costs ~$5,000. The GPU needs to provide 6x+ speedup to justify the hardware cost, or enable workloads that are simply impossible on CPU within the time budget.

---

## What Comes Next

Chapter 4 (CUDA Fundamentals) will teach you to write actual GPU programs. You will learn the CUDA programming model, kernel syntax, thread indexing, memory management, error handling, and basic parallel patterns. The architectural knowledge from this chapter will inform every optimization decision you make.

```
CHAPTER 3 (you are here)          CHAPTER 4 (next)
+---------------------------+     +---------------------------+
| GPU Architecture           | --> | CUDA Programming           |
|                           |     |                           |
| WHY: the hardware exists  |     | HOW: write code for it    |
| WHAT: SMs, warps, memory  |     | Kernel <<<grid, block>>>  |
| WHEN: CPU vs GPU          |     | threadIdx, blockIdx       |
| WHERE: data lives          |     | cudaMalloc, cudaMemcpy    |
+---------------------------+     +---------------------------+
```
