# Chapter 4: CUDA Fundamentals

CUDA (Compute Unified Device Architecture) is NVIDIA's parallel computing platform. This chapter teaches you to write, compile, and run CUDA programs from scratch. Every code example is complete and compilable.

---

## Table of Contents

1. [The CUDA Programming Model](#1-the-cuda-programming-model)
2. [Hello World in CUDA](#2-hello-world-in-cuda)
3. [Thread Indexing](#3-thread-indexing)
4. [Memory Management](#4-memory-management)
5. [Error Handling](#5-error-handling)
6. [Vector Addition](#6-vector-addition)
7. [Matrix Multiplication](#7-matrix-multiplication)
8. [CUDA Compilation](#8-cuda-compilation)
9. [Device Properties](#9-device-properties)
10. [Basic Optimization](#10-basic-optimization)
11. [Common Patterns](#11-common-patterns)
12. [Exercises](#exercises)
13. [Common Mistakes](#common-mistakes)

---

## 1. The CUDA Programming Model

### 1.1 Host and Device

CUDA divides the world into two domains:

```
+------------------+                    +------------------+
|     HOST (CPU)   |   PCIe / NVLink   |   DEVICE (GPU)   |
|                  | <===============> |                  |
| - Sequential code|   Data transfers   | - Parallel code  |
| - Memory alloc   |                    | - Thousands of   |
| - Kernel launch  |                    |   threads        |
| - System I/O     |                    | - Own memory     |
+------------------+                    +------------------+

Host code: runs on CPU, compiled by regular C++ compiler
Device code: runs on GPU, compiled by nvcc
```

### 1.2 Function Qualifiers

CUDA introduces three function qualifiers:

```cuda
// Runs on GPU, called from CPU (or GPU with dynamic parallelism)
__global__ void myKernel(float* data, int n) {
    // This is a "kernel" - the entry point for GPU execution
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] *= 2.0f;
}

// Runs on GPU, called from GPU only
__device__ float helper(float x) {
    return x * x + 1.0f;
}

// Runs on CPU, called from CPU (default, optional qualifier)
__host__ float cpuFunction(float x) {
    return x * 2.0f;
}

// Can run on BOTH CPU and GPU
__host__ __device__ float sharedFunction(float x) {
    return x + 1.0f;
}
```

### 1.3 Kernel Launch Syntax

Kernels are launched with the triple-angle-bracket syntax:

```cuda
// <<<numBlocks, threadsPerBlock>>>
myKernel<<<256, 128>>>(d_data, n);
//        ^     ^
//        |     +-- 128 threads per block
//        +-------- 256 blocks in the grid
//
// Total threads = 256 * 128 = 32,768
```

The launch is **asynchronous** -- the CPU continues immediately after launching the kernel. The GPU executes independently.

```
CPU Timeline:  [launch kernel]  [do other work]  [synchronize]  [use results]
                     |                                  |
GPU Timeline:        +------[execute kernel]-----------+
```

---

## 2. Hello World in CUDA

### 2.1 Simplest Possible CUDA Program

```cuda
// hello.cu
#include <cstdio>

__global__ void helloKernel() {
    printf("Hello from GPU thread %d in block %d!\n",
           threadIdx.x, blockIdx.x);
}

int main() {
    // Launch 2 blocks of 4 threads each = 8 threads total
    helloKernel<<<2, 4>>>();

    // Wait for GPU to finish before exiting
    cudaDeviceSynchronize();

    printf("Hello from CPU!\n");
    return 0;
}
```

Compile and run:
```bash
nvcc -o hello hello.cu
./hello
```

Output (order may vary -- GPU threads execute in parallel):
```
Hello from GPU thread 0 in block 0!
Hello from GPU thread 1 in block 0!
Hello from GPU thread 2 in block 0!
Hello from GPU thread 3 in block 0!
Hello from GPU thread 0 in block 1!
Hello from GPU thread 1 in block 1!
Hello from GPU thread 2 in block 1!
Hello from GPU thread 3 in block 1!
Hello from CPU!
```

### 2.2 First Real CUDA Program: Array Doubling

This shows the complete workflow: allocate, copy, compute, copy back, free.

```cuda
// double_array.cu
#include <cstdio>
#include <cstdlib>

// Step 1: Define the kernel
__global__ void doubleArray(float* d_arr, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        d_arr[idx] *= 2.0f;
    }
}

int main() {
    const int N = 1024;
    const size_t bytes = N * sizeof(float);

    // Step 2: Allocate and initialize host memory
    float* h_arr = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) {
        h_arr[i] = (float)i;
    }

    // Step 3: Allocate device memory
    float* d_arr;
    cudaMalloc(&d_arr, bytes);

    // Step 4: Copy data from host to device
    cudaMemcpy(d_arr, h_arr, bytes, cudaMemcpyHostToDevice);

    // Step 5: Launch kernel
    int threadsPerBlock = 256;
    int numBlocks = (N + threadsPerBlock - 1) / threadsPerBlock;
    doubleArray<<<numBlocks, threadsPerBlock>>>(d_arr, N);

    // Step 6: Copy results back to host
    cudaMemcpy(h_arr, d_arr, bytes, cudaMemcpyDeviceToHost);

    // Step 7: Verify
    for (int i = 0; i < 5; i++) {
        printf("h_arr[%d] = %.1f (expected %.1f)\n",
               i, h_arr[i], (float)(i * 2));
    }

    // Step 8: Free memory
    cudaFree(d_arr);
    free(h_arr);

    return 0;
}
```

The data flow:

```
CPU Memory                         GPU Memory
+----------+                       +----------+
| h_arr    |  cudaMemcpy H->D     | d_arr    |
| [0,1,2,  | ===================> | [0,1,2,  |
|  3,4...] |                       |  3,4...] |
+----------+                       +----------+
                                        |
                                   doubleArray<<<>>>
                                        |
+----------+                       +----------+
| h_arr    |  cudaMemcpy D->H     | d_arr    |
| [0,2,4,  | <=================== | [0,2,4,  |
|  6,8...] |                       |  6,8...] |
+----------+                       +----------+
```

---

## 3. Thread Indexing

### 3.1 The Thread Hierarchy

```
Grid (launched by <<<numBlocks, threadsPerBlock>>>)
+-------------------------------------------------------+
|                                                       |
|  Block (0,0)      Block (1,0)      Block (2,0)       |
|  +-----------+    +-----------+    +-----------+      |
|  |T0 T1 T2 T3|   |T0 T1 T2 T3|   |T0 T1 T2 T3|     |
|  |T4 T5 T6 T7|   |T4 T5 T6 T7|   |T4 T5 T6 T7|     |
|  +-----------+    +-----------+    +-----------+      |
|                                                       |
+-------------------------------------------------------+

Built-in variables:
  threadIdx.x  = thread index within block (0-7 above)
  blockIdx.x   = block index within grid (0-2 above)
  blockDim.x   = threads per block (8 above)
  gridDim.x    = number of blocks (3 above)

Global thread ID = blockIdx.x * blockDim.x + threadIdx.x
```

### 3.2 1D Indexing

```cuda
__global__ void add1D(float* c, const float* a, const float* b, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        c[i] = a[i] + b[i];
    }
}

// Launch: cover all N elements
int blockSize = 256;
int gridSize = (N + blockSize - 1) / blockSize;  // ceiling division
add1D<<<gridSize, blockSize>>>(d_c, d_a, d_b, N);
```

### 3.3 2D Indexing

For 2D data like images or matrices:

```
Grid (2D blocks)
+-------------------------------------------+
| Block(0,0)  Block(1,0)  Block(2,0)        |
| Block(0,1)  Block(1,1)  Block(2,1)        |
| Block(0,2)  Block(1,2)  Block(2,2)        |
+-------------------------------------------+

Each block has 2D threads:
Block(1,1):
+------------------+
| T(0,0)  T(1,0)  |
| T(0,1)  T(1,1)  |
| T(0,2)  T(1,2)  |
+------------------+
```

```cuda
__global__ void add2D(float* C, const float* A, const float* B,
                      int width, int height) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;

    if (col < width && row < height) {
        int idx = row * width + col;
        C[idx] = A[idx] + B[idx];
    }
}

// Launch with 2D grid and 2D blocks
dim3 blockDim(16, 16);    // 16x16 = 256 threads per block
dim3 gridDim(
    (width  + blockDim.x - 1) / blockDim.x,
    (height + blockDim.y - 1) / blockDim.y
);
add2D<<<gridDim, blockDim>>>(d_C, d_A, d_B, width, height);
```

### 3.4 3D Indexing

```cuda
__global__ void process3D(float* volume, int nx, int ny, int nz) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    int z = blockIdx.z * blockDim.z + threadIdx.z;

    if (x < nx && y < ny && z < nz) {
        int idx = z * ny * nx + y * nx + x;
        volume[idx] = /* computation */;
    }
}

dim3 block(8, 8, 4);   // 8*8*4 = 256 threads
dim3 grid(
    (nx + 7) / 8,
    (ny + 7) / 8,
    (nz + 3) / 4
);
process3D<<<grid, block>>>(d_volume, nx, ny, nz);
```

### 3.5 Grid-Stride Loop

When the data is larger than the grid, use a grid-stride loop so each thread processes multiple elements:

```cuda
__global__ void addGridStride(float* c, const float* a, const float* b,
                              int n) {
    int stride = blockDim.x * gridDim.x;
    for (int i = blockIdx.x * blockDim.x + threadIdx.x;
         i < n;
         i += stride) {
        c[i] = a[i] + b[i];
    }
}

// Can launch with fewer blocks than elements
addGridStride<<<128, 256>>>(d_c, d_a, d_b, 10000000);
```

---

## 4. Memory Management

### 4.1 Device Memory Allocation

```cuda
float* d_data;

// Allocate
cudaMalloc(&d_data, N * sizeof(float));

// Initialize to zero
cudaMemset(d_data, 0, N * sizeof(float));

// Free
cudaFree(d_data);
```

### 4.2 Data Transfer

```cuda
// Host to Device
cudaMemcpy(d_dst, h_src, bytes, cudaMemcpyHostToDevice);

// Device to Host
cudaMemcpy(h_dst, d_src, bytes, cudaMemcpyDeviceToHost);

// Device to Device
cudaMemcpy(d_dst, d_src, bytes, cudaMemcpyDeviceToDevice);
```

### 4.3 Memory Transfer Bandwidth

```
Typical bandwidths:
+-------------------------------------------+
| Transfer Type          | Bandwidth         |
+-------------------------------------------+
| CPU RAM to CPU RAM     | 30-50 GB/s (DDR5) |
| CPU RAM to GPU (PCIe4) | ~25 GB/s          |
| CPU RAM to GPU (PCIe5) | ~50 GB/s          |
| GPU to GPU (NVLink 4)  | ~900 GB/s         |
| GPU DRAM (HBM3)        | ~3 TB/s           |
+-------------------------------------------+

Key insight: PCIe transfer is often the bottleneck.
Minimize data transfers between host and device!
```

---

## 5. Error Handling

### 5.1 The CUDA Error Check Macro

Every CUDA API call returns a `cudaError_t`. You must check it.

```cuda
#include <cstdio>
#include <cstdlib>

#define CUDA_CHECK(call)                                                 \
    do {                                                                 \
        cudaError_t err = (call);                                        \
        if (err != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",                \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                          \
        }                                                                \
    } while (0)

// Usage:
CUDA_CHECK(cudaMalloc(&d_data, bytes));
CUDA_CHECK(cudaMemcpy(d_data, h_data, bytes, cudaMemcpyHostToDevice));
```

### 5.2 Checking Kernel Launch Errors

Kernel launches don't return errors directly. Check after launch:

```cuda
myKernel<<<grid, block>>>(args);

// Check for launch errors (e.g., invalid configuration)
CUDA_CHECK(cudaGetLastError());

// Check for execution errors (requires synchronization)
CUDA_CHECK(cudaDeviceSynchronize());
```

### 5.3 Common Error Codes

| Error | Meaning |
|-------|---------|
| `cudaErrorMemoryAllocation` | Out of GPU memory |
| `cudaErrorInvalidConfiguration` | Bad launch params (too many threads) |
| `cudaErrorInvalidValue` | Bad argument to CUDA API |
| `cudaErrorInvalidDevicePointer` | Pointer not allocated on device |
| `cudaErrorIllegalAddress` | Kernel accessed invalid memory |
| `cudaErrorLaunchTimeout` | Kernel ran too long (display GPU) |

---

## 6. Vector Addition -- Complete Example

```cuda
// vec_add.cu - Complete, compilable vector addition with timing
#include <cstdio>
#include <cstdlib>
#include <cmath>

#define CUDA_CHECK(call)                                                 \
    do {                                                                 \
        cudaError_t err = (call);                                        \
        if (err != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",                \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                          \
        }                                                                \
    } while (0)

__global__ void vecAdd(float* c, const float* a, const float* b, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        c[i] = a[i] + b[i];
    }
}

int main() {
    const int N = 1 << 20;  // ~1 million elements
    const size_t bytes = N * sizeof(float);

    // Allocate host memory
    float* h_a = (float*)malloc(bytes);
    float* h_b = (float*)malloc(bytes);
    float* h_c = (float*)malloc(bytes);

    // Initialize
    for (int i = 0; i < N; i++) {
        h_a[i] = sinf(i) * sinf(i);
        h_b[i] = cosf(i) * cosf(i);
    }

    // Allocate device memory
    float *d_a, *d_b, *d_c;
    CUDA_CHECK(cudaMalloc(&d_a, bytes));
    CUDA_CHECK(cudaMalloc(&d_b, bytes));
    CUDA_CHECK(cudaMalloc(&d_c, bytes));

    // Create CUDA events for timing
    cudaEvent_t start, stop;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));

    // Copy inputs to device
    CUDA_CHECK(cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice));

    // Launch kernel with timing
    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;

    CUDA_CHECK(cudaEventRecord(start));
    vecAdd<<<gridSize, blockSize>>>(d_c, d_a, d_b, N);
    CUDA_CHECK(cudaEventRecord(stop));

    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaEventSynchronize(stop));

    float milliseconds = 0;
    CUDA_CHECK(cudaEventElapsedTime(&milliseconds, start, stop));
    printf("Kernel time: %.4f ms\n", milliseconds);

    // Copy result back
    CUDA_CHECK(cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost));

    // Verify: sin^2(x) + cos^2(x) should equal 1.0
    float maxError = 0.0f;
    for (int i = 0; i < N; i++) {
        maxError = fmaxf(maxError, fabsf(h_c[i] - 1.0f));
    }
    printf("Max error: %e\n", maxError);

    // Cleanup
    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    CUDA_CHECK(cudaFree(d_a));
    CUDA_CHECK(cudaFree(d_b));
    CUDA_CHECK(cudaFree(d_c));
    free(h_a);
    free(h_b);
    free(h_c);

    return 0;
}
```

```bash
nvcc -O2 -o vec_add vec_add.cu
./vec_add
# Output:
# Kernel time: 0.0523 ms
# Max error: 2.384186e-07
```

---

## 7. Matrix Multiplication

### 7.1 Naive Implementation

Each thread computes one element of the output matrix C = A * B.

```
Computing C[row][col]:

A (M x K)            B (K x N)            C (M x N)
+--------+           +--------+           +--------+
|        |  row -->  |  col   |           |        |
|  ------+---------> |  |     |    =      |   *    |
|        |           |  |     |           |        |
|        |           |  v     |           |        |
+--------+           +--------+           +--------+

C[row][col] = sum(A[row][k] * B[k][col]) for k = 0..K-1
```

```cuda
// matmul_naive.cu
#include <cstdio>
#include <cstdlib>

#define CUDA_CHECK(call)                                                 \
    do {                                                                 \
        cudaError_t err = (call);                                        \
        if (err != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",                \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                          \
        }                                                                \
    } while (0)

__global__ void matMulNaive(float* C, const float* A, const float* B,
                            int M, int N, int K) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < M && col < N) {
        float sum = 0.0f;
        for (int k = 0; k < K; k++) {
            sum += A[row * K + k] * B[k * N + col];
        }
        C[row * N + col] = sum;
    }
}

int main() {
    const int M = 1024, N = 1024, K = 1024;

    size_t bytesA = M * K * sizeof(float);
    size_t bytesB = K * N * sizeof(float);
    size_t bytesC = M * N * sizeof(float);

    float *h_A = (float*)malloc(bytesA);
    float *h_B = (float*)malloc(bytesB);
    float *h_C = (float*)malloc(bytesC);

    for (int i = 0; i < M * K; i++) h_A[i] = (float)(rand() % 10) / 10.0f;
    for (int i = 0; i < K * N; i++) h_B[i] = (float)(rand() % 10) / 10.0f;

    float *d_A, *d_B, *d_C;
    CUDA_CHECK(cudaMalloc(&d_A, bytesA));
    CUDA_CHECK(cudaMalloc(&d_B, bytesB));
    CUDA_CHECK(cudaMalloc(&d_C, bytesC));

    CUDA_CHECK(cudaMemcpy(d_A, h_A, bytesA, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_B, h_B, bytesB, cudaMemcpyHostToDevice));

    dim3 block(16, 16);
    dim3 grid((N + 15) / 16, (M + 15) / 16);

    cudaEvent_t start, stop;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));

    CUDA_CHECK(cudaEventRecord(start));
    matMulNaive<<<grid, block>>>(d_C, d_A, d_B, M, N, K);
    CUDA_CHECK(cudaEventRecord(stop));
    CUDA_CHECK(cudaEventSynchronize(stop));

    float ms = 0;
    CUDA_CHECK(cudaEventElapsedTime(&ms, start, stop));
    printf("Naive matmul: %.2f ms\n", ms);

    double gflops = (2.0 * M * N * K) / (ms * 1e6);
    printf("Performance: %.1f GFLOPS\n", gflops);

    CUDA_CHECK(cudaMemcpy(h_C, d_C, bytesC, cudaMemcpyDeviceToHost));

    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    CUDA_CHECK(cudaFree(d_A));
    CUDA_CHECK(cudaFree(d_B));
    CUDA_CHECK(cudaFree(d_C));
    free(h_A); free(h_B); free(h_C);

    return 0;
}
```

### 7.2 Tiled Implementation with Shared Memory

The naive version reads each element of A and B from global memory many times. Tiling loads tiles of A and B into fast shared memory.

```
Tiled Matrix Multiply (TILE_SIZE = 16):

For each tile phase (p = 0, 1, ..., K/TILE-1):

  1. Load A tile [row, p*T .. p*T+T-1] into shared mem
  2. Load B tile [p*T .. p*T+T-1, col] into shared mem
  3. __syncthreads()
  4. Multiply the tiles (T multiply-adds)
  5. __syncthreads()

A                              B
+----+----+----+----+          +----+----+----+----+
|    |tile|    |    |          |    |    |    |    |
|    | A  |    |    |   row    +----+----+----+----+
|    |    |    |    |          |tile|    |    |    |
+----+----+----+----+          | B  |    |    |    |
                               +----+----+----+----+
       phase p                    phase p    col

  Shared A[T][T]  *  Shared B[T][T]  ->  partial sum
```

```cuda
// matmul_tiled.cu
#include <cstdio>
#include <cstdlib>

#define CUDA_CHECK(call)                                                 \
    do {                                                                 \
        cudaError_t err = (call);                                        \
        if (err != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",                \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                          \
        }                                                                \
    } while (0)

#define TILE_SIZE 16

__global__ void matMulTiled(float* C, const float* A, const float* B,
                            int M, int N, int K) {
    __shared__ float tileA[TILE_SIZE][TILE_SIZE];
    __shared__ float tileB[TILE_SIZE][TILE_SIZE];

    int row = blockIdx.y * TILE_SIZE + threadIdx.y;
    int col = blockIdx.x * TILE_SIZE + threadIdx.x;

    float sum = 0.0f;

    // Loop over tiles along the K dimension
    for (int p = 0; p < (K + TILE_SIZE - 1) / TILE_SIZE; p++) {
        // Load tile of A into shared memory
        int aCol = p * TILE_SIZE + threadIdx.x;
        if (row < M && aCol < K)
            tileA[threadIdx.y][threadIdx.x] = A[row * K + aCol];
        else
            tileA[threadIdx.y][threadIdx.x] = 0.0f;

        // Load tile of B into shared memory
        int bRow = p * TILE_SIZE + threadIdx.y;
        if (bRow < K && col < N)
            tileB[threadIdx.y][threadIdx.x] = B[bRow * N + col];
        else
            tileB[threadIdx.y][threadIdx.x] = 0.0f;

        __syncthreads();

        // Multiply the tiles
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += tileA[threadIdx.y][k] * tileB[k][threadIdx.x];
        }

        __syncthreads();
    }

    if (row < M && col < N) {
        C[row * N + col] = sum;
    }
}

int main() {
    const int M = 1024, N = 1024, K = 1024;

    size_t bytesA = M * K * sizeof(float);
    size_t bytesB = K * N * sizeof(float);
    size_t bytesC = M * N * sizeof(float);

    float *h_A = (float*)malloc(bytesA);
    float *h_B = (float*)malloc(bytesB);
    float *h_C = (float*)malloc(bytesC);

    for (int i = 0; i < M * K; i++) h_A[i] = (float)(rand() % 10) / 10.0f;
    for (int i = 0; i < K * N; i++) h_B[i] = (float)(rand() % 10) / 10.0f;

    float *d_A, *d_B, *d_C;
    CUDA_CHECK(cudaMalloc(&d_A, bytesA));
    CUDA_CHECK(cudaMalloc(&d_B, bytesB));
    CUDA_CHECK(cudaMalloc(&d_C, bytesC));

    CUDA_CHECK(cudaMemcpy(d_A, h_A, bytesA, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_B, h_B, bytesB, cudaMemcpyHostToDevice));

    dim3 block(TILE_SIZE, TILE_SIZE);
    dim3 grid((N + TILE_SIZE - 1) / TILE_SIZE,
              (M + TILE_SIZE - 1) / TILE_SIZE);

    cudaEvent_t start, stop;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));

    CUDA_CHECK(cudaEventRecord(start));
    matMulTiled<<<grid, block>>>(d_C, d_A, d_B, M, N, K);
    CUDA_CHECK(cudaEventRecord(stop));
    CUDA_CHECK(cudaEventSynchronize(stop));

    float ms = 0;
    CUDA_CHECK(cudaEventElapsedTime(&ms, start, stop));
    printf("Tiled matmul: %.2f ms\n", ms);

    double gflops = (2.0 * M * N * K) / (ms * 1e6);
    printf("Performance: %.1f GFLOPS\n", gflops);

    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    CUDA_CHECK(cudaFree(d_A));
    CUDA_CHECK(cudaFree(d_B));
    CUDA_CHECK(cudaFree(d_C));
    free(h_A); free(h_B); free(h_C);

    return 0;
}
```

Performance comparison (typical on RTX 3090, 1024x1024):

```
+------------------+--------+------------+
| Implementation   | Time   | GFLOPS     |
+------------------+--------+------------+
| Naive            | 3.2 ms | ~670       |
| Tiled (16x16)    | 1.4 ms | ~1530      |
| cuBLAS           | 0.3 ms | ~7000      |
+------------------+--------+------------+

Tiling gives ~2.3x speedup by reusing data in shared memory.
cuBLAS is still 4-5x faster because it uses register tiling,
warp-level intrinsics, Tensor Cores, and auto-tuning.
```

---

## 8. CUDA Compilation

### 8.1 nvcc Basics

```bash
# Basic compilation
nvcc -o program program.cu

# With optimization
nvcc -O2 -o program program.cu

# Specify compute capability (GPU architecture)
nvcc -arch=sm_86 -o program program.cu    # RTX 3090 (Ampere)
nvcc -arch=sm_89 -o program program.cu    # RTX 4090 (Ada Lovelace)
nvcc -arch=sm_90 -o program program.cu    # H100 (Hopper)

# Generate code for multiple architectures
nvcc -gencode arch=compute_80,code=sm_80 \
     -gencode arch=compute_86,code=sm_86 \
     -gencode arch=compute_90,code=sm_90 \
     -o program program.cu
```

### 8.2 Common Compiler Flags

| Flag | Purpose |
|------|---------|
| `-O2` / `-O3` | Optimization level |
| `-arch=sm_XX` | Target GPU architecture |
| `-G` | Debug mode (disables optimizations) |
| `-lineinfo` | Line info for profiling |
| `--ptxas-options=-v` | Show register and shared memory usage |
| `-Xcompiler` | Pass flags to host compiler |
| `--use_fast_math` | Fast math (reduced precision) |
| `-rdc=true` | Relocatable device code (for separate compilation) |
| `-std=c++17` | C++ standard for host code |

### 8.3 Compute Capabilities

```
Architecture     CC     Example GPUs
+--------------------------------------------+
| Kepler         3.x    GTX 780              |
| Maxwell        5.x    GTX 980              |
| Pascal         6.x    GTX 1080, P100       |
| Volta          7.0    V100                 |
| Turing         7.5    RTX 2080             |
| Ampere         8.0    A100                 |
| Ampere (cons.) 8.6    RTX 3090             |
| Ada Lovelace   8.9    RTX 4090, L40        |
| Hopper         9.0    H100, H200           |
| Blackwell      10.0   B200, GB200          |
+--------------------------------------------+
```

---

## 9. Device Properties

```cuda
// query_device.cu
#include <cstdio>

int main() {
    int deviceCount;
    cudaGetDeviceCount(&deviceCount);

    for (int i = 0; i < deviceCount; i++) {
        cudaDeviceProp prop;
        cudaGetDeviceProperties(&prop, i);

        printf("=== Device %d: %s ===\n", i, prop.name);
        printf("Compute capability:      %d.%d\n",
               prop.major, prop.minor);
        printf("SMs:                     %d\n",
               prop.multiProcessorCount);
        printf("Max threads per SM:      %d\n",
               prop.maxThreadsPerMultiProcessor);
        printf("Max threads per block:   %d\n",
               prop.maxThreadsPerBlock);
        printf("Max block dimensions:    (%d, %d, %d)\n",
               prop.maxThreadsDim[0],
               prop.maxThreadsDim[1],
               prop.maxThreadsDim[2]);
        printf("Max grid dimensions:     (%d, %d, %d)\n",
               prop.maxGridSize[0],
               prop.maxGridSize[1],
               prop.maxGridSize[2]);
        printf("Warp size:               %d\n",
               prop.warpSize);
        printf("Global memory:           %.1f GB\n",
               prop.totalGlobalMem / 1e9);
        printf("Shared mem per block:    %zu KB\n",
               prop.sharedMemPerBlock / 1024);
        printf("Registers per block:     %d\n",
               prop.regsPerBlock);
        printf("Memory clock:            %.0f MHz\n",
               prop.memoryClockRate / 1e3);
        printf("Memory bus width:        %d bits\n",
               prop.memoryBusWidth);
        printf("L2 cache size:           %d KB\n",
               prop.l2CacheSize / 1024);
        printf("Clock rate:              %.0f MHz\n",
               prop.clockRate / 1e3);
        printf("\n");
    }
    return 0;
}
```

---

## 10. Basic Optimization

### 10.1 Choosing Block Size

Block size affects occupancy (how many warps can be active on an SM).

```
Rules of thumb:
- Always a multiple of 32 (warp size)
- 128 or 256 are good defaults
- Use the occupancy calculator for fine-tuning

Common block sizes and their properties:
+------------+---------+---------------------------+
| Block Size | Warps   | Notes                     |
+------------+---------+---------------------------+
| 32         | 1       | Minimum, low occupancy    |
| 64         | 2       | Acceptable for reg-heavy  |
| 128        | 4       | Good default              |
| 256        | 8       | Good default              |
| 512        | 16      | May limit blocks per SM   |
| 1024       | 32      | Maximum, usually too many |
+------------+---------+---------------------------+
```

### 10.2 Occupancy

Occupancy = active warps / maximum warps per SM.

```cuda
// Query maximum potential occupancy
int minGridSize, optBlockSize;
cudaOccupancyMaxPotentialBlockSize(
    &minGridSize, &optBlockSize, myKernel, 0, 0);
printf("Optimal block size: %d\n", optBlockSize);
printf("Minimum grid size for full occupancy: %d\n", minGridSize);
```

Factors that limit occupancy:
- **Registers per thread**: More registers = fewer threads per SM
- **Shared memory per block**: More shared mem = fewer blocks per SM
- **Block size**: Larger blocks = fewer blocks per SM

### 10.3 Avoiding Warp Divergence

All 32 threads in a warp execute the same instruction. If threads diverge on a branch, the warp executes both paths sequentially.

```cuda
// BAD: High divergence within warps
__global__ void divergent(float* data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        if (i % 2 == 0) {  // Half the threads in each warp take this path
            data[i] = expf(data[i]);
        } else {
            data[i] = logf(data[i]);
        }
    }
}

// BETTER: Rearrange data so warps don't diverge
// Put even-indexed elements first, odd-indexed second
// Then each warp processes only one type
```

```
Warp divergence example (warp of 8 threads for simplicity):

if (threadIdx.x % 2 == 0):
   Thread:  T0  T1  T2  T3  T4  T5  T6  T7
   Active:  [Y] [N] [Y] [N] [Y] [N] [Y] [N]  <- execute IF body
   Active:  [N] [Y] [N] [Y] [N] [Y] [N] [Y]  <- execute ELSE body

Both paths run, but half the threads are idle each time = 50% efficiency
```

### 10.4 Memory Coalescing Preview

Adjacent threads should access adjacent memory locations:

```cuda
// GOOD: Coalesced - threads access consecutive addresses
data[threadIdx.x]           // thread 0 -> addr 0, thread 1 -> addr 4, ...

// BAD: Strided - threads access non-consecutive addresses
data[threadIdx.x * stride]  // if stride > 1, not coalesced
```

---

## 11. Common Patterns

### 11.1 Element-wise Operations

Apply the same function to every element:

```cuda
__global__ void sigmoid(float* out, const float* in, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = 1.0f / (1.0f + expf(-in[i]));
    }
}
```

### 11.2 Simple Reduction (Sum)

Sum all elements of an array. Each block reduces its portion, then a second kernel sums the block results.

```cuda
__global__ void blockSum(float* out, const float* in, int n) {
    __shared__ float sdata[256];

    int tid = threadIdx.x;
    int i = blockIdx.x * blockDim.x + threadIdx.x;

    // Load into shared memory
    sdata[tid] = (i < n) ? in[i] : 0.0f;
    __syncthreads();

    // Tree reduction in shared memory
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    // Thread 0 writes block result
    if (tid == 0) {
        out[blockIdx.x] = sdata[0];
    }
}
```

### 11.3 Scatter / Gather

```cuda
// Gather: read from scattered locations
__global__ void gather(float* out, const float* in,
                       const int* indices, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = in[indices[i]];  // read from arbitrary location
    }
}

// Scatter: write to scattered locations
__global__ void scatter(float* out, const float* in,
                        const int* indices, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[indices[i]] = in[i];  // write to arbitrary location
        // WARNING: multiple threads may write to same location!
        // Use atomicAdd if needed
    }
}
```

### 11.4 Predicate-Based Filtering (Stream Compaction Preview)

```cuda
// Count how many elements satisfy a predicate
__global__ void countIf(int* count, const float* data, int n,
                        float threshold) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n && data[i] > threshold) {
        atomicAdd(count, 1);
    }
}
```

---

## Exercises

### Beginner

1. **Array Scale**: Write a kernel that multiplies every element of an array by a constant. Time it with CUDA events and compare with CPU.

2. **Array Reverse**: Write a kernel that reverses an array in-place. Use shared memory within each block, then swap blocks on the host.

3. **Vector Dot Product**: Implement dot product using block-level reduction. Sum the block results on the CPU.

### Intermediate

4. **Matrix Transpose**: Write both a naive transpose kernel and one that uses shared memory to coalesce writes. Measure the bandwidth difference.

5. **2D Convolution**: Implement a 3x3 convolution (image blur) using 2D thread blocks. Handle boundary conditions with clamping.

6. **Histogram**: Count the frequency of values [0-255] in a large array using atomicAdd. Then optimize with privatized histograms in shared memory.

### Advanced

7. **Parallel Prefix Sum**: Implement an inclusive scan (prefix sum) within a single block using shared memory. Then extend to arbitrary-length arrays.

8. **Radix Sort**: Implement a least-significant-bit radix sort using prefix sum as a building block.

9. **cuBLAS Comparison**: Wrap your tiled matrix multiplication and compare with cuBLAS sgemm on various matrix sizes. Graph the results.

---

## Common Mistakes

### 1. Forgetting Bounds Checks

```cuda
// BUG: No bounds check -- threads beyond N access garbage memory
__global__ void bad(float* data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    data[i] = data[i] * 2.0f;  // CRASH if i >= n
}

// FIX: Always check bounds
__global__ void good(float* data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        data[i] = data[i] * 2.0f;
    }
}
```

### 2. Missing __syncthreads()

```cuda
// BUG: Race condition -- some threads may not have written yet
__shared__ float sdata[256];
sdata[threadIdx.x] = input[i];
// Missing __syncthreads() here!
float neighbor = sdata[threadIdx.x + 1];  // May read stale data
```

### 3. Using Host Pointers on Device

```cuda
float* h_data = (float*)malloc(bytes);    // Host pointer
myKernel<<<grid, block>>>(h_data, N);     // BUG: GPU can't access host memory!

// FIX: Use device pointer
float* d_data;
cudaMalloc(&d_data, bytes);
cudaMemcpy(d_data, h_data, bytes, cudaMemcpyHostToDevice);
myKernel<<<grid, block>>>(d_data, N);     // Correct
```

### 4. Not Checking Errors

```cuda
// BAD: Silently fails
cudaMalloc(&d_data, bytes);

// GOOD: Catches errors immediately
CUDA_CHECK(cudaMalloc(&d_data, bytes));
```

### 5. Forgetting cudaDeviceSynchronize

```cuda
myKernel<<<grid, block>>>(d_data, N);
// Kernel is still running asynchronously!
cudaMemcpy(h_data, d_data, bytes, cudaMemcpyDeviceToHost);
// cudaMemcpy is synchronous -- it waits for the kernel.
// But if you try to read d_data from another stream or
// measure time without sync, you'll get wrong results.
```

### 6. Block Size Not a Multiple of 32

```cuda
// BAD: Wasted threads in each warp
myKernel<<<grid, 100>>>(d_data, N);  // 3 warps + 4/32 threads wasted

// GOOD: Full warps
myKernel<<<grid, 128>>>(d_data, N);  // 4 full warps
```

### 7. Integer Overflow in Index Calculation

```cuda
// BUG for large arrays: int overflow at ~2 billion elements
int i = blockIdx.x * blockDim.x + threadIdx.x;

// FIX: Use size_t or long long for large arrays
size_t i = (size_t)blockIdx.x * blockDim.x + threadIdx.x;
```

---

## Quick Reference

```
CUDA API Cheat Sheet:
+----------------------------------------------+
| Memory Management                             |
| cudaMalloc(&ptr, size)                       |
| cudaFree(ptr)                                |
| cudaMemcpy(dst, src, size, direction)        |
| cudaMemset(ptr, value, size)                 |
+----------------------------------------------+
| Kernel Launch                                 |
| kernel<<<gridDim, blockDim>>>(args...)       |
| kernel<<<grid, block, sharedMem, stream>>>   |
+----------------------------------------------+
| Synchronization                               |
| cudaDeviceSynchronize()                       |
| __syncthreads()        (in kernel)           |
+----------------------------------------------+
| Error Handling                                |
| cudaGetLastError()                           |
| cudaGetErrorString(err)                       |
+----------------------------------------------+
| Timing                                        |
| cudaEventCreate(&event)                       |
| cudaEventRecord(event)                        |
| cudaEventSynchronize(event)                  |
| cudaEventElapsedTime(&ms, start, stop)       |
| cudaEventDestroy(event)                       |
+----------------------------------------------+
| Device Query                                  |
| cudaGetDeviceCount(&count)                    |
| cudaGetDeviceProperties(&prop, device)       |
| cudaSetDevice(device)                         |
+----------------------------------------------+
| Built-in Variables (in kernel)                |
| threadIdx.{x,y,z}    blockIdx.{x,y,z}       |
| blockDim.{x,y,z}     gridDim.{x,y,z}        |
+----------------------------------------------+
```
