# CPU/GPU Programming: From Zero to Expert

## Why This Guide Exists

CPU and GPU programming is the foundation of high-performance computing. From video games to AI training, from scientific simulations to cryptocurrency mining, understanding how to write code that fully exploits hardware is one of the most valuable skills in software engineering. This guide takes you from having zero hardware programming experience to understanding and writing production-grade parallel code that squeezes every ounce of performance from modern processors.

---

## The Hardware Programming Landscape

```
+------------------------------------------------------------------------+
|                   CPU/GPU PROGRAMMING ECOSYSTEM                         |
+------------------------------------------------------------------------+
|                                                                        |
|  HIGH-PERFORMANCE COMPUTING        AI / DEEP LEARNING                  |
|  +-------------------------+       +---------------------------+       |
|  | Scientific simulation    |       | Training (PyTorch, TF)    |       |
|  | Weather/climate models   |       | Inference engines          |       |
|  | Molecular dynamics       |       | Custom CUDA kernels        |       |
|  | Computational fluid      |       | Tensor Core programming    |       |
|  | Nuclear/particle physics |       | Model optimization          |       |
|  +-------------------------+       +---------------------------+       |
|                                                                        |
|  GRAPHICS / GAMING                 FINANCE / CRYPTO                    |
|  +-------------------------+       +---------------------------+       |
|  | Real-time rendering      |       | Options pricing (Monte C.) |       |
|  | Ray tracing               |       | Risk simulation            |       |
|  | Shader programming        |       | Crypto mining algorithms   |       |
|  | Compute shaders           |       | High-frequency trading     |       |
|  | Vulkan / DirectX / Metal |       | Blockchain verification    |       |
|  +-------------------------+       +---------------------------+       |
|                                                                        |
|  SYSTEMS / EMBEDDED                DATA ENGINEERING                    |
|  +-------------------------+       +---------------------------+       |
|  | OS kernel development     |       | Database query engines     |       |
|  | Driver development        |       | Apache Arrow / DataFusion  |       |
|  | FPGA programming          |       | GPU-accelerated analytics  |       |
|  | Embedded real-time        |       | RAPIDS / cuDF / cuML       |       |
|  | Signal processing         |       | Video transcoding           |       |
|  +-------------------------+       +---------------------------+       |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## Learning Path Overview

### Phase 1: Hardware Foundations (Chapters 01-02)

**Goal**: Understand how CPUs actually work at the hardware level, and learn to write code that works *with* the hardware instead of against it.

```
01-COMPUTER-ARCHITECTURE          02-CPU-OPTIMIZATION
+---------------------------+     +---------------------------+
| Von Neumann Architecture   |     | SIMD / Vectorization       |
| Instruction Pipeline       |     | Cache-Friendly Code        |
| Cache Hierarchy (L1/L2/L3) |     | Branch Prediction          |
| Branch Prediction           |     | Memory Alignment           |
| Out-of-Order Execution     |     | Compiler Optimizations     |
| Memory Hierarchy            |     | Profiling-Guided Tuning    |
+---------------------------+     +---------------------------+
```

You cannot write fast code without understanding:
- **How** the CPU executes instructions (pipelining, superscalar, out-of-order)
- **Where** data lives (registers, L1/L2/L3 cache, RAM, disk)
- **Why** certain access patterns are 100x faster than others (cache lines, prefetching)
- **What** the compiler does and doesn't optimize for you

### Phase 2: GPU Foundations (Chapters 03-04)

**Goal**: Understand the GPU execution model and write your first CUDA programs.

```
03-GPU-ARCHITECTURE               04-CUDA-FUNDAMENTALS
+---------------------------+     +---------------------------+
| SIMT Execution Model       |     | Kernels, Threads, Blocks   |
| Streaming Multiprocessors  |     | Thread Indexing             |
| Warp Scheduling             |     | Device Memory Management   |
| GPU Memory Hierarchy       |     | Error Handling              |
| CPU vs GPU Tradeoffs       |     | Basic Parallel Patterns    |
| GPU Hardware Generations   |     | Host-Device Data Transfer  |
+---------------------------+     +---------------------------+
```

### Phase 3: Mastering GPU Programming (Chapters 05-07)

**Goal**: Write efficient GPU code by understanding advanced CUDA features, parallel algorithm design, and memory optimization.

```
05-CUDA-ADVANCED                  06-PARALLEL-ALGORITHMS
+---------------------------+     +---------------------------+
| Shared Memory              |     | Parallel Reduction         |
| CUDA Streams & Events     |     | Prefix Sum (Scan)          |
| Unified Memory             |     | Parallel Sort              |
| Cooperative Groups         |     | Histogram                  |
| Dynamic Parallelism        |     | Stencil Computations       |
| Warp-Level Primitives      |     | Map-Reduce on GPU          |
+---------------------------+     +---------------------------+

07-MEMORY-OPTIMIZATION
+---------------------------+
| Memory Coalescing          |
| Shared Memory Bank Conflicts|
| Texture & Constant Memory  |
| Cache Hierarchy Tuning     |
| Zero-Copy & Pinned Memory  |
| Memory Access Patterns     |
+---------------------------+
```

### Phase 4: Scaling & Portability (Chapters 08-09)

**Goal**: Scale GPU programs across multiple GPUs and across different hardware vendors.

```
08-MULTI-GPU-HPC                  09-HETEROGENEOUS-COMPUTING
+---------------------------+     +---------------------------+
| Multi-GPU Programming      |     | OpenCL                     |
| NCCL Collective Comms     |     | Vulkan Compute Shaders     |
| MPI + CUDA                 |     | SYCL / oneAPI              |
| GPU-Direct RDMA            |     | Apple Metal Compute        |
| SLURM & Job Scheduling    |     | WebGPU                     |
| Cloud GPU Clusters         |     | Portability Strategies     |
+---------------------------+     +---------------------------+
```

### Phase 5: Domain Applications (Chapters 10-12)

**Goal**: Apply CPU/GPU programming to real-world domains: AI, performance engineering, and custom hardware.

```
10-DEEP-LEARNING-HARDWARE        11-PROFILING-DEBUGGING
+---------------------------+     +---------------------------+
| Tensor Core Programming    |     | NVIDIA Nsight Systems      |
| Mixed Precision Training   |     | Nsight Compute             |
| Custom CUDA Kernels for DL |     | perf / VTune               |
| FlashAttention Explained   |     | cuda-memcheck              |
| Quantization & Inference   |     | Roofline Model Analysis    |
| Triton Compiler            |     | Flame Graphs               |
+---------------------------+     +---------------------------+

12-FPGA-CUSTOM-HARDWARE
+---------------------------+
| FPGA Architecture          |
| Verilog / VHDL Basics      |
| High-Level Synthesis (HLS) |
| FPGA vs GPU vs ASIC        |
| Custom AI Accelerators     |
| RISC-V & Open Hardware     |
+---------------------------+
```

### Phase 6: Practical Mastery (Chapters 13-14)

**Goal**: Master the toolchain and build portfolio projects.

```
13-TOOLS-LANGUAGES                14-PROJECTS-CAREER
+---------------------------+     +---------------------------+
| C for Systems Programming  |     | Matrix Multiply Optimizer  |
| C++ for Performance        |     | Ray Tracer on GPU          |
| Rust for Safe Parallelism  |     | Neural Network from Scratch|
| Assembly Fundamentals      |     | Particle Simulation        |
| Build Systems & Toolchains |     | Career Paths               |
| Linux Kernel Interfaces    |     | Interview Preparation      |
+---------------------------+     +---------------------------+
```

---

## The CPU vs GPU Mental Model

This is the single most important concept to internalize before diving in:

```
CPU: Few powerful cores, optimized for LATENCY
+-------------------------------------------------------+
|  Core 0          Core 1          Core 2     Core 3    |
|  +----------+    +----------+   +--------+  +------+  |
|  | ALU ALU  |    | ALU ALU  |   |ALU ALU |  |ALU   |  |
|  | ALU ALU  |    | ALU ALU  |   |ALU ALU |  |ALU   |  |
|  | Branch   |    | Branch   |   |Branch  |  |Branch|  |
|  | Predict  |    | Predict  |   |Predict |  |Pred  |  |
|  | Out-of-  |    | Out-of-  |   |Out-of- |  |OoO   |  |
|  | Order    |    | Order    |   |Order   |  |      |  |
|  | L1 Cache |    | L1 Cache |   |L1 Cache|  |L1    |  |
|  +----------+    +----------+   +--------+  +------+  |
|                  Large L2/L3 Cache                     |
|                  Sophisticated Control Logic            |
+-------------------------------------------------------+
   4-64 cores  |  High clock speed  |  Complex per-core

GPU: Thousands of simple cores, optimized for THROUGHPUT
+-------------------------------------------------------+
|  SM 0        SM 1        SM 2        ...    SM N      |
|  +------+   +------+    +------+           +------+   |
|  |■■■■■■|   |■■■■■■|   |■■■■■■|           |■■■■■■|   |
|  |■■■■■■|   |■■■■■■|   |■■■■■■|           |■■■■■■|   |
|  |■■■■■■|   |■■■■■■|   |■■■■■■|    ...    |■■■■■■|   |
|  |■■■■■■|   |■■■■■■|   |■■■■■■|           |■■■■■■|   |
|  |Shared |   |Shared |   |Shared |           |Shared |   |
|  |Memory |   |Memory |   |Memory |           |Memory |   |
|  +------+   +------+    +------+           +------+   |
|              High-Bandwidth Memory (HBM)               |
|              Simple Control, Massive Parallelism       |
+-------------------------------------------------------+
   1000s cores  |  Lower clock speed  |  Simple per-core

■ = one CUDA core (or shader processor)
```

**When to use which:**

| Workload | Best On | Why |
|----------|---------|-----|
| Sequential logic, branching | CPU | Branch prediction, low latency |
| Matrix multiplication | GPU | Embarrassingly parallel |
| OS kernel, file I/O | CPU | Complex control flow |
| Image/video processing | GPU | Same operation on millions of pixels |
| Database queries (OLTP) | CPU | Random access, complex logic |
| Machine learning training | GPU | Massive parallel linear algebra |
| Web server request handling | CPU | I/O-bound, complex routing |
| Scientific simulation | GPU | Regular grid computations |

---

## Key Metrics You'll Learn to Optimize

```
+-------------------------------------------------------------------+
|                    PERFORMANCE METRICS                              |
+-------------------------------------------------------------------+
|                                                                   |
|  LATENCY              THROUGHPUT            BANDWIDTH              |
|  Time for ONE         Operations per        Data moved per        |
|  operation            second                second                |
|                                                                   |
|  CPU L1 hit: ~1ns     CPU: ~100 GFLOPS     DDR5: ~50 GB/s       |
|  CPU L2 hit: ~5ns     GPU: ~30 TFLOPS      HBM3: ~3 TB/s        |
|  CPU L3 hit: ~20ns    (FP32)               PCIe 5: ~64 GB/s      |
|  RAM:       ~100ns                          NVLink: ~900 GB/s     |
|  SSD:       ~100μs                                                |
|  HDD:       ~10ms                                                  |
|                                                                   |
|  OCCUPANCY            ARITHMETIC            CACHE HIT             |
|  % of GPU             INTENSITY             RATE                   |
|  warps active         FLOPs per byte        % data found          |
|                       of memory accessed    in cache               |
|                                                                   |
|  Target: >50%         Compute-bound: >10    L1: >95%              |
|                       Memory-bound: <2      L2: >80%              |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## Recommended Resources

### Books

| Book | Author | Focus |
|------|--------|-------|
| *Computer Organization & Design* | Patterson & Hennessy | CPU architecture fundamentals |
| *Computer Architecture: A Quantitative Approach* | Hennessy & Patterson | Advanced CPU architecture |
| *Programming Massively Parallel Processors* | Kirk & Hwu | CUDA and GPU programming |
| *CUDA by Example* | Sanders & Kandrot | Hands-on CUDA introduction |
| *The Art of Multiprocessor Programming* | Herlihy & Shavit | Concurrent algorithms |
| *Is Parallel Programming Hard?* | Paul McKenney | Linux kernel parallelism |
| *What Every Programmer Should Know About Memory* | Ulrich Drepper | Memory systems deep dive |

### Online Resources

| Resource | Type | Level |
|----------|------|-------|
| NVIDIA CUDA Documentation | Official docs | All |
| GTC (GPU Technology Conference) talks | Video lectures | Intermediate+ |
| Godbolt Compiler Explorer | Tool | All |
| NVIDIA Nsight tutorials | Performance tools | Intermediate |
| MIT 6.172 (Performance Engineering) | Course | Intermediate |
| CMU 15-418 (Parallel Computer Architecture) | Course | Advanced |
| Stanford CS149 (Parallel Computing) | Course | Intermediate |

---

## What Makes This Field Hard

1. **Hardware complexity** - Modern CPUs have 10+ pipeline stages, multiple cache levels, branch predictors, prefetchers, and out-of-order execution units all operating simultaneously
2. **Invisible performance cliffs** - A single misaligned memory access or branch misprediction can cause a 10-100x slowdown that is invisible in the source code
3. **Parallel thinking** - Humans think sequentially; reasoning about thousands of concurrent threads requires rewiring your mental model
4. **Measurement discipline** - "Premature optimization is the root of all evil" - you must profile before optimizing, and micro-benchmarks often lie
5. **Hardware diversity** - Code optimized for one GPU generation may be suboptimal on the next; portability requires abstraction that often costs performance
6. **Debugging difficulty** - Race conditions, deadlocks, and non-deterministic behavior make parallel bugs extraordinarily hard to reproduce and fix
7. **Diminishing returns** - The last 10% of performance often requires 10x the engineering effort
8. **Rapidly evolving landscape** - New hardware (Tensor Cores, TPUs, NPUs) and programming models (Triton, SYCL, WebGPU) emerge constantly

The rest of this guide will teach you how to navigate each of these challenges, starting from the very basics of how a CPU works.
