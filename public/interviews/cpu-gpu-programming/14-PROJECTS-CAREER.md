# Chapter 14: Projects & Career Guide

This final chapter provides hands-on projects at every skill level and maps out career paths in CPU/GPU programming. Building projects is the single best way to internalize the concepts from the previous 13 chapters.

---

## Table of Contents

1. [Beginner Projects](#1-beginner-projects)
2. [Intermediate Projects](#2-intermediate-projects)
3. [Advanced Projects](#3-advanced-projects)
4. [Expert Projects](#4-expert-projects)
5. [Career Paths](#5-career-paths)
6. [Interview Preparation](#6-interview-preparation)
7. [Building Your Portfolio](#7-building-your-portfolio)
8. [Salary & Market](#8-salary--market)

---

## 1. Beginner Projects

### Project 1: Matrix Multiplication Optimizer

**Goal**: Implement matrix multiplication four different ways and measure the speedup at each stage.

```
Performance Progression Target (1024x1024 matrices):

Implementation          Time        Speedup    GFLOPS
+---------------------------------------------------------+
| 1. Naive C (ijk)      | ~2000 ms  | 1x       | ~1      |
| 2. Cache-blocked      | ~400 ms   | 5x       | ~5      |
| 3. SIMD (AVX2)        | ~100 ms   | 20x      | ~20     |
| 4. CUDA (tiled)       | ~2 ms     | 1000x    | ~1000   |
| 5. cuBLAS (reference) | ~0.3 ms   | 6000x    | ~7000   |
+---------------------------------------------------------+
```

**Stage 1: Naive C**
```c
// Triple nested loop, row-major storage
void matmul_naive(float* C, const float* A, const float* B,
                  int M, int N, int K) {
    for (int i = 0; i < M; i++)
        for (int j = 0; j < N; j++) {
            float sum = 0.0f;
            for (int k = 0; k < K; k++)
                sum += A[i*K + k] * B[k*N + j];
            C[i*N + j] = sum;
        }
}
```

**Stage 2: Cache-blocked**
- Tile the i, j, k loops with tile size 32-64
- Reorder loops to ikj for better B access pattern
- Measure cache miss rate with `perf stat`

**Stage 3: SIMD**
- Use AVX2 `_mm256_fmadd_ps` for 8 FMAs per instruction
- Process 8 columns of C simultaneously
- Align memory with `aligned_alloc(32, ...)`

**Stage 4: CUDA tiled**
- Port to CUDA with shared memory tiling (chapter 7 technique)
- Compare tile sizes: 16x16 vs 32x32
- Add CUDA event timing

**Deliverables**:
- Single C file with all implementations behind `#ifdef`
- Benchmark script that runs all versions and outputs a table
- Graph (using Python/matplotlib) showing GFLOPS vs matrix size

---

### Project 2: Image Processing Pipeline

**Goal**: Build a GPU-accelerated image processing tool that loads an image, applies filters, and saves the result.

```
Pipeline:
Input (PNG/JPG) -> Decode (CPU) -> Upload to GPU ->
  -> Grayscale Conversion
  -> Gaussian Blur (5x5)
  -> Sobel Edge Detection
  -> Threshold
-> Download to CPU -> Encode (CPU) -> Output (PNG)
```

**Specifications**:

```
Kernel 1: RGB to Grayscale
  gray = 0.299*R + 0.587*G + 0.114*B
  Each thread processes one pixel
  Input: unsigned char[H][W][3]
  Output: float[H][W]

Kernel 2: Gaussian Blur (5x5)
  Use shared memory to load tile + halo
  Halo = 2 pixels on each side (for 5x5 kernel)
  Separable: horizontal pass then vertical pass for efficiency
  Block size: 16x16 threads, shared mem: 20x20

Kernel 3: Sobel Edge Detection
  Gx = [[-1,0,1],[-2,0,2],[-1,0,1]] convolved with image
  Gy = [[-1,-2,-1],[0,0,0],[1,2,1]] convolved with image
  magnitude = sqrt(Gx^2 + Gy^2)
  Use shared memory for the 3x3 stencil
```

**Libraries needed**:
- stb_image.h / stb_image_write.h for PNG/JPG I/O (header-only)
- CUDA toolkit

**Benchmarks to collect**:
- CPU vs GPU time per kernel
- Total pipeline throughput (images/second)
- Memory transfer overhead as % of total time

---

### Project 3: Parallel Word Count

**Goal**: Count word frequencies in a large text file using GPU parallelism.

**Approach**:
1. Load text file into pinned host memory
2. Upload to GPU
3. Kernel 1: Parallel character classification (is_alpha, is_space)
4. Kernel 2: Mark word boundaries (transition from space to alpha)
5. Kernel 3: Prefix sum to assign word IDs
6. Kernel 4: Hash each word and build histogram with atomicAdd
7. Download histogram, resolve collisions on CPU

**Key techniques**: prefix sum (scan), atomic operations, hash functions on GPU.

---

## 2. Intermediate Projects

### Project 4: Ray Tracer on GPU

**Goal**: Render a scene with spheres, planes, and reflections using CUDA.

```
Architecture:
+--------------------------------------------------+
|  Scene Description (host)                         |
|  - Array of spheres (center, radius, color, mat)  |
|  - Array of planes                                |
|  - Point lights                                   |
|  - Camera (position, direction, FOV)              |
+--------------------------------------------------+
         | cudaMemcpy
         v
+--------------------------------------------------+
|  GPU Kernel: one thread per pixel                 |
|  For each pixel:                                  |
|    1. Generate primary ray from camera             |
|    2. Intersect ray with all objects              |
|    3. Find closest intersection                   |
|    4. Compute lighting (Phong shading)            |
|    5. If reflective: generate reflected ray       |
|    6. Recurse (up to max_bounces)                 |
|    7. Write pixel color to framebuffer            |
+--------------------------------------------------+
         | cudaMemcpy
         v
+--------------------------------------------------+
|  Write framebuffer to PNG (host)                  |
+--------------------------------------------------+
```

**Data structures**:
```cuda
struct Sphere {
    float3 center;
    float radius;
    float3 color;
    float reflectivity;  // 0.0 = matte, 1.0 = mirror
};

struct Ray {
    float3 origin;
    float3 direction;
};

struct HitRecord {
    float t;            // distance along ray
    float3 point;       // intersection point
    float3 normal;      // surface normal
    float3 color;
    float reflectivity;
};
```

**Optimizations to implement**:
- Bounding Volume Hierarchy (BVH) for >100 objects
- Stackless BVH traversal on GPU
- Anti-aliasing via multiple samples per pixel
- Texture mapping with CUDA texture objects

**Target**: 1920x1080 image with 100 spheres, 4 bounces, rendered in <50ms.

---

### Project 5: N-Body Gravitational Simulation

**Goal**: Simulate N gravitational bodies with real-time visualization.

```
Physics:
  F_ij = G * m_i * m_j / |r_ij|^2     (Newton's law of gravitation)
  a_i = sum(F_ij) / m_i                 (acceleration from all other bodies)
  v_i += a_i * dt                        (velocity integration)
  x_i += v_i * dt                        (position integration)

Naive: O(N^2) -- every body interacts with every other
GPU advantage: embarrassingly parallel across bodies
```

**Implementation stages**:

1. **Naive O(N^2) on CPU** -- Baseline
2. **Naive O(N^2) on GPU** -- One thread per body, each reads all N bodies from global memory
3. **Tiled O(N^2) on GPU** -- Load tile of bodies into shared memory, reduce global memory reads by factor of tile size
4. **(Optional) Barnes-Hut O(N log N)** -- Octree on GPU for >100K bodies

**Tiled kernel pseudocode**:
```cuda
__global__ void nbody_tiled(float4* pos, float4* vel, float dt, int N) {
    __shared__ float4 tile[BLOCK_SIZE];

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    float4 my_pos = pos[i];
    float3 acc = {0, 0, 0};

    for (int tile_start = 0; tile_start < N; tile_start += BLOCK_SIZE) {
        // Collaboratively load tile
        tile[threadIdx.x] = pos[tile_start + threadIdx.x];
        __syncthreads();

        // Compute interactions with tile
        for (int j = 0; j < BLOCK_SIZE; j++) {
            float3 r = {tile[j].x - my_pos.x,
                        tile[j].y - my_pos.y,
                        tile[j].z - my_pos.z};
            float dist = sqrtf(r.x*r.x + r.y*r.y + r.z*r.z + 1e-10f);
            float inv_dist3 = 1.0f / (dist * dist * dist);
            acc.x += r.x * inv_dist3 * tile[j].w;  // .w = mass
            acc.y += r.y * inv_dist3 * tile[j].w;
            acc.z += r.z * inv_dist3 * tile[j].w;
        }
        __syncthreads();
    }

    // Update velocity and position
    vel[i].x += acc.x * dt;
    vel[i].y += acc.y * dt;
    vel[i].z += acc.z * dt;
    pos[i].x += vel[i].x * dt;
    pos[i].y += vel[i].y * dt;
    pos[i].z += vel[i].z * dt;
}
```

**Targets**:
- 16K bodies at 60 FPS (naive GPU)
- 65K bodies at 60 FPS (tiled GPU)
- Visualization with OpenGL interop (cudaGraphicsMapResources)

---

### Project 6: Neural Network from Scratch in CUDA

**Goal**: Train a multi-layer perceptron on MNIST without any framework.

```
Architecture:
  Input:  784 (28x28 images)
  Hidden: 256 (ReLU activation)
  Hidden: 128 (ReLU activation)
  Output: 10  (Softmax + Cross-entropy loss)

Components to implement in CUDA:
  1. Matrix multiply (forward: Y = X @ W + b)
  2. ReLU activation (element-wise)
  3. Softmax + cross-entropy loss
  4. Backpropagation (chain rule through each layer)
  5. SGD optimizer (W -= lr * dW)
  6. Mini-batch data loading
```

**Key kernels**:
```
Forward pass:
  Input [batch, 784] @ W1 [784, 256] + b1 [256] -> Z1 [batch, 256]
  ReLU(Z1) -> A1
  A1 [batch, 256] @ W2 [256, 128] + b2 [128] -> Z2 [batch, 128]
  ReLU(Z2) -> A2
  A2 [batch, 128] @ W3 [128, 10] + b3 [10] -> Z3 [batch, 10]
  Softmax(Z3) -> predictions

Backward pass:
  dZ3 = predictions - one_hot_labels
  dW3 = A2^T @ dZ3
  db3 = sum(dZ3, axis=0)
  dA2 = dZ3 @ W3^T
  dZ2 = dA2 * (Z2 > 0)   (ReLU derivative)
  ... (continue for each layer)
```

**Target**: >95% accuracy on MNIST test set after 10 epochs.

---

## 3. Advanced Projects

### Project 7: FlashAttention-Style Tiled Attention

**Goal**: Implement memory-efficient attention (the core of transformer models).

```
Standard Attention:
  Q, K, V are [N, d] matrices (N = sequence length, d = head dim)
  S = Q @ K^T           [N, N]  -- HUGE for large N
  P = softmax(S / sqrt(d))      -- Stored in memory: O(N^2)
  O = P @ V             [N, d]

Problem: N=4096 means S is 4096x4096 = 64MB per head.
         With 32 heads and batch 16, that's 32GB just for S!

FlashAttention insight:
  Tile the computation so S never fully materializes.
  Use online softmax to compute softmax incrementally.
  Memory: O(N) instead of O(N^2)
```

**Tiling strategy**:
```
For each tile of Q (size Br x d):
  Initialize: O = 0, l = 0, m = -inf  (running softmax stats)

  For each tile of K, V (size Bc x d):
    S_tile = Q_tile @ K_tile^T    [Br x Bc]  -- fits in SRAM
    m_new = max(m, rowmax(S_tile))
    P_tile = exp(S_tile - m_new)
    l_new = exp(m - m_new) * l + rowsum(P_tile)
    O = exp(m - m_new) * O + P_tile @ V_tile
    m = m_new, l = l_new

  O = O / l  (normalize)
```

**Implementation**: Use shared memory for S_tile, P_tile. Each thread block handles one tile of Q.

---

### Project 8: GPU Database Query Engine

**Goal**: Implement core SQL operations on GPU using parallel primitives.

```
Operations to implement:
+-----------------------------------------------------------+
| Operation   | GPU Technique                                |
+-----------------------------------------------------------+
| SELECT      | Element-wise copy                           |
| WHERE       | Stream compaction (scan + scatter)           |
| GROUP BY    | Sort + segmented reduction                  |
| JOIN        | Hash join (build hash table, probe in parallel)|
| ORDER BY    | Parallel radix sort                          |
| AGGREGATE   | Parallel reduction (SUM, COUNT, AVG, MIN, MAX)|
+-----------------------------------------------------------+
```

**Column-store format** (SoA layout for GPU):
```
Table "orders":
  Column: order_id    [int32]   -> contiguous GPU array
  Column: customer_id [int32]   -> contiguous GPU array
  Column: amount      [float32] -> contiguous GPU array
  Column: date        [int32]   -> contiguous GPU array
```

**Target**: Benchmark against DuckDB on TPC-H queries at scale factor 1.

---

### Project 9: Real-Time Fluid Simulation

**Goal**: Solve 2D Navier-Stokes equations on GPU with interactive visualization.

```
Navier-Stokes (incompressible):
  ∂u/∂t + (u·∇)u = -∇p/ρ + ν∇²u + f
  ∇·u = 0 (incompressibility)

Simplified (Stable Fluids, Jos Stam 1999):
  1. Add forces       (user interaction)
  2. Advect           (move fluid quantities along velocity field)
  3. Diffuse          (viscosity via Jacobi iteration)
  4. Project          (pressure solve to enforce incompressibility)

Each step is a GPU kernel operating on a 2D grid.
```

**Grid**: 512x512 or 1024x1024 cells. Each cell stores velocity (u, v) and pressure (p).

**Key kernels**:
- Jacobi iterative solver (stencil computation)
- Bilinear interpolation for advection
- Divergence and gradient computation

**Target**: 1024x1024 grid at 60 FPS with interactive mouse input.

---

## 4. Expert Projects

### Project 10: GPU Compiler Backend

Write a simple compiler that generates GPU code using LLVM's NVPTX backend.

**Scope**: Compile a simple expression language (arithmetic + parallel-for) to PTX assembly, then to CUDA fatbin.

**Pipeline**:
```
Source code -> Lexer -> Parser -> AST -> LLVM IR -> NVPTX Backend -> PTX -> cubin
```

### Project 11: Distributed Training Framework

Implement a simplified version of PyTorch's DistributedDataParallel (DDP).

**Components**:
- Parameter server or all-reduce ring
- Gradient bucketing (group small tensors for efficient all-reduce)
- Communication-computation overlap
- Use NCCL for GPU-to-GPU communication

### Project 12: Custom Inference Engine

Build an inference engine that loads ONNX models and runs them on GPU with operator fusion.

**Operator fusion examples**:
- Conv + BatchNorm + ReLU -> single fused kernel
- MatMul + Bias + GELU -> single fused kernel
- Reduce memory traffic by keeping intermediate results in registers

---

## 5. Career Paths

### 5.1 GPU / Systems Engineer

```
Companies: NVIDIA, AMD, Intel, Apple, Qualcomm
Role:      GPU driver development, compiler optimization,
           hardware/software co-design
Skills:    C/C++, assembly, GPU architecture, compiler theory
Entry:     BS/MS in CS or EE, strong systems programming
Growth:    Junior -> Senior -> Staff -> Principal
```

### 5.2 HPC Engineer

```
Companies: National labs (LLNL, ORNL, Argonne, Sandia),
           weather agencies, pharma (MD simulations)
Role:      Scientific application optimization, scaling
           codes to thousands of GPUs
Skills:    MPI, CUDA, Fortran/C++, domain science
Entry:     MS/PhD in computational science
Growth:    Postdoc -> Scientist -> Senior Scientist -> Group Lead
```

### 5.3 ML Infrastructure Engineer

```
Companies: Google, Meta, Microsoft, NVIDIA, OpenAI,
           Anthropic, xAI, startups
Role:      Training infrastructure, custom kernels,
           model serving, GPU cluster management
Skills:    CUDA, PyTorch internals, distributed systems,
           Triton, profiling
Entry:     BS/MS in CS, strong Python + C++
Growth:    Junior -> Senior -> Staff -> Distinguished
```

### 5.4 Quant Developer

```
Companies: Citadel, Two Sigma, Jane Street, Jump Trading,
           DE Shaw, Hudson River Trading
Role:      Low-latency trading systems, GPU-accelerated
           risk calculation, options pricing
Skills:    C++, CUDA, networking, financial math
Entry:     BS/MS in CS/Math/Physics, competitive programming
Growth:    Junior -> Senior -> Lead -> VP
```

### 5.5 Graphics / Game Engine Developer

```
Companies: Epic (Unreal), Unity, Activision, EA, Rockstar,
           Disney (rendering), Pixar
Role:      Shader programming, rendering pipeline,
           compute shader optimization
Skills:    Vulkan/DirectX/Metal, HLSL/GLSL, C++
Entry:     BS in CS + strong graphics portfolio
Growth:    Junior -> Senior -> Lead -> Tech Director
```

### 5.6 Embedded / FPGA Engineer

```
Companies: Xilinx/AMD, Intel/Altera, defense contractors,
           telecommunications, automotive (ADAS)
Role:      FPGA design, hardware acceleration,
           real-time systems
Skills:    Verilog/VHDL, HLS, embedded C, signal processing
Entry:     BS/MS in EE or CE
Growth:    Junior -> Senior -> Architect -> Fellow
```

---

## 6. Interview Preparation

### 6.1 Common Technical Questions

**Architecture & Fundamentals**:

1. **Q: Explain the difference between CPU and GPU architecture.**
   A: CPUs have few complex cores (4-64) optimized for latency with large caches, branch predictors, and out-of-order execution. GPUs have thousands of simple cores optimized for throughput with small caches and SIMT execution. CPUs excel at sequential tasks; GPUs excel at data-parallel tasks.

2. **Q: What is a warp? What is warp divergence?**
   A: A warp is a group of 32 threads that execute the same instruction in lockstep (SIMT). Warp divergence occurs when threads in a warp take different branch paths; the warp must serialize both paths, reducing efficiency.

3. **Q: Explain the GPU memory hierarchy.**
   A: Registers (~1 cycle) -> Shared memory (~5 cycles, per-block) -> L1 cache (~30 cycles, per-SM) -> L2 cache (~200 cycles, shared) -> Global memory/HBM (~400 cycles). Optimization means keeping data as close to registers as possible.

4. **Q: What is memory coalescing?**
   A: When adjacent threads in a warp access adjacent memory addresses, the hardware combines (coalesces) the requests into fewer, wider memory transactions. Non-coalesced access can be 10-30x slower.

5. **Q: Explain the difference between shared memory and L1 cache.**
   A: Both are on-chip SRAM on the SM. Shared memory is explicitly managed by the programmer, while L1 cache is hardware-managed. Shared memory allows threads in a block to communicate; L1 cache does not. On modern GPUs, they often share the same physical memory and the split is configurable.

**Coding Challenges**:

6. **Q: Implement parallel reduction (sum) in CUDA.**
   Key points: Tree-based reduction in shared memory, avoid warp divergence by using sequential addressing, warp-level reduction with `__shfl_down_sync` for the last warp.

7. **Q: Optimize a matrix transpose kernel.**
   Key points: Naive transpose has non-coalesced writes. Use shared memory: coalesced read into shared mem, __syncthreads(), coalesced write from shared mem (transposed indices). Pad shared memory to avoid bank conflicts.

8. **Q: What is the roofline model?**
   A: A visual model that plots achievable performance (FLOPS) vs arithmetic intensity (FLOPS/byte). A kernel's peak performance is bounded by min(peak compute, peak bandwidth * arithmetic intensity). Identifies whether a kernel is compute-bound or memory-bound.

**System Design**:

9. **Q: Design a distributed training system for a 70B parameter LLM.**
   Key topics: Data parallelism (DDP), model parallelism (tensor + pipeline), FSDP for memory efficiency, gradient checkpointing, mixed precision (BF16), NCCL for communication, NVLink/IB topology awareness.

10. **Q: Design a GPU job scheduler for a shared cluster.**
    Key topics: Resource allocation (GPU memory, compute), preemption, gang scheduling, topology-aware placement, fair-share scheduling, memory oversubscription with MIG.

### 6.2 Brain Teasers

1. **You have N=1M elements. Your kernel uses 256 threads/block with 32 registers/thread and 4KB shared memory/block. Your GPU has 64 SMs, 64K registers/SM, 48KB shared memory/SM, max 2048 threads/SM. What is the occupancy?**

   Answer: Registers: 256 threads * 32 regs = 8192 regs/block. 64K/8192 = 8 blocks per SM from register limit. Shared mem: 48KB/4KB = 12 blocks per SM. Threads: 2048/256 = 8 blocks per SM. Limiting factor: registers and threads (8 blocks). Occupancy: 8 * 256 / 2048 = 100%.

2. **A kernel processes 1 billion floats. Each float is read once and written once. The GPU has 2 TB/s bandwidth. What is the minimum kernel time?**

   Answer: Data moved = 1B * 4 bytes * 2 (read + write) = 8 GB. Time = 8 GB / 2 TB/s = 4 ms. This is the memory bandwidth floor.

---

## 7. Building Your Portfolio

### 7.1 GitHub Profile

Structure your GPU programming portfolio:

```
github.com/yourname/
├── cuda-matmul/              # Matrix multiply optimizer
│   ├── naive.cu
│   ├── tiled.cu
│   ├── benchmarks/
│   └── README.md (with performance graphs)
├── gpu-raytracer/            # Ray tracer
├── cuda-neural-network/      # NN from scratch
├── flash-attention-cuda/     # Custom attention kernel
└── gpu-fluid-sim/            # Fluid simulation
```

**Each project should have**:
- Clear README with architecture diagram
- Performance benchmarks with graphs
- Comparison against baseline/reference implementation
- Build instructions that work on fresh machine

### 7.2 Open Source Contributions

| Project | What to Contribute |
|---------|-------------------|
| PyTorch | Custom CUDA kernels, operator optimization |
| Triton | New autotuning configs, operator implementations |
| CUTLASS | Gemm kernel variants, new data types |
| RAPIDS (cuDF/cuML) | GPU-accelerated data science operators |
| Vulkan samples | Compute shader examples |
| llvm-project | NVPTX backend improvements |

### 7.3 Technical Blog Posts

Write about:
- "How I achieved X% of peak bandwidth on [kernel]"
- "Understanding [specific GPU architecture feature]"
- "Profiling deep dive: optimizing [real workload]"
- "Comparing CUDA vs [OpenCL/Vulkan/SYCL] for [workload]"

**Platforms**: Personal blog, Medium, dev.to, or company engineering blog.

### 7.4 Conference Talks

| Conference | Focus |
|-----------|-------|
| GTC (NVIDIA) | GPU computing, CUDA, AI |
| SC (Supercomputing) | HPC, distributed computing |
| SIGGRAPH | Graphics, rendering, GPU |
| CppCon | C++ performance, SIMD |
| EuroSys / OSDI / SOSP | Systems, scheduling |
| MLSys | ML infrastructure |

---

## 8. Salary & Market

### 8.1 Compensation Ranges (US, 2024-2026)

```
+-------------------------------------------+------------------+
| Role & Level                              | Total Comp (USD) |
+-------------------------------------------+------------------+
| Junior GPU Engineer (0-2 yrs)             | $120K - $180K    |
| Senior GPU/CUDA Engineer (3-5 yrs)        | $200K - $350K    |
| Staff GPU Engineer (6-10 yrs)             | $350K - $550K    |
| Principal/Distinguished (10+ yrs)         | $500K - $1M+     |
+-------------------------------------------+------------------+
| ML Infra Engineer (Mid-level)             | $200K - $400K    |
| ML Infra Engineer (Senior/Staff)          | $400K - $700K    |
+-------------------------------------------+------------------+
| Quant Developer (Junior)                  | $200K - $400K    |
| Quant Developer (Senior)                  | $400K - $800K+   |
+-------------------------------------------+------------------+
| HPC Engineer (National Lab)               | $100K - $200K    |
| HPC Engineer (Industry)                   | $150K - $300K    |
+-------------------------------------------+------------------+
| FPGA Engineer (Junior)                    | $100K - $160K    |
| FPGA Engineer (Senior)                    | $160K - $280K    |
+-------------------------------------------+------------------+

Note: Ranges include base + bonus + equity. Top-of-range
numbers are for FAANG/top-tier companies and quantitative
trading firms in high-cost-of-living areas.
```

### 8.2 Hot Companies Hiring GPU Engineers (2025-2026)

**AI/ML**:
- NVIDIA (GPU architecture, CUDA, Triton, cuDNN)
- OpenAI / Anthropic / Google DeepMind (training infrastructure)
- Meta FAIR (PyTorch, custom kernels)
- xAI, Mistral, Cohere (inference optimization)

**Cloud**:
- AWS (Trainium/Inferentia, custom silicon)
- Google (TPU team, JAX)
- Microsoft (Azure GPU, DeepSpeed)
- CoreWeave, Lambda, Together AI (GPU cloud)

**Hardware**:
- AMD (ROCm, CDNA)
- Intel (Xe GPUs, oneAPI)
- Apple (Metal, Neural Engine)
- Cerebras, Groq, SambaNova (AI accelerators)

**Finance**:
- Citadel / Two Sigma / DE Shaw (GPU risk engines)
- Jump Trading / HRT (FPGA + GPU low-latency)

### 8.3 Remote vs On-Site

```
+---------------------+-------------------------------------------+
| Category            | Remote Availability                        |
+---------------------+-------------------------------------------+
| ML Infra            | High (many remote roles)                  |
| GPU Software        | Medium (some companies require on-site)    |
| Hardware/Driver     | Low (usually requires lab access)          |
| HPC (National Lab)  | Low-Medium (lab-specific)                 |
| Quant Finance       | Low (almost always on-site)               |
| FPGA                | Low (hardware access needed)              |
+---------------------+-------------------------------------------+
```

---

## Getting Started Checklist

For someone starting from zero, here is the recommended order:

```
Week 1-2:   Read chapters 01-02, do Project 1 (Stage 1-2 only)
Week 3-4:   Read chapters 03-04, do Project 1 (Stage 3-4)
Week 5-6:   Read chapter 05, do Project 2
Week 7-8:   Read chapters 06-07, do Project 3
Week 9-10:  Read chapters 08-09, do Project 4 or 5
Week 11-12: Read chapters 10-11, do Project 6
Week 13-16: Read chapters 12-13, do one Advanced Project
Week 17+:   Pick an Expert Project, start contributing to open source

Total: ~4 months to solid intermediate level
       ~8-12 months to job-ready for GPU engineering roles
```

**Hardware requirements**:
- Minimum: Any NVIDIA GPU (even GTX 1060 works for learning)
- Recommended: RTX 3060 or newer (good price/performance for learning)
- Cloud alternative: Google Colab (free T4), Lambda Cloud, AWS p3/g4

**Software setup**:
```bash
# Install CUDA toolkit
# https://developer.nvidia.com/cuda-downloads

# Verify installation
nvcc --version
nvidia-smi

# Install nsight tools
# Included with CUDA toolkit

# Set up development environment
sudo apt install build-essential cmake git
```

---

## Final Words

CPU/GPU programming is a field where practice matters more than theory. Reading about cache lines and warps gives you vocabulary, but writing and optimizing real kernels gives you intuition. Every experienced GPU programmer has a collection of "aha moments" where profiling revealed something surprising about their code.

Start building. Start profiling. Start optimizing. The hardware is waiting.
