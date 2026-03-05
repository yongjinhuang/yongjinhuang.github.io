# Chapter 4: CUDA Fundamentals

You understand how GPUs are built -- thousands of simple cores, a deep memory hierarchy, and the SIMT execution model. Now it is time to write code that runs on them. CUDA (Compute Unified Device Architecture) is NVIDIA's programming model for general-purpose GPU computing. This chapter takes you from zero to writing, compiling, and optimizing real CUDA programs.

By the end of this chapter you will be able to:
- Write, compile, and run CUDA kernels
- Manage GPU memory with cudaMalloc, cudaMemcpy, and cudaFree
- Map problem dimensions to thread grids using 1D, 2D, and 3D indexing
- Implement vector addition and matrix multiplication on the GPU
- Use CUDA events for precise timing
- Apply shared memory tiling for matrix multiplication
- Query device properties and select optimal launch configurations
- Avoid the most common CUDA programming mistakes

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

CUDA divides the world into two sides:

```
+---------------------------+         +---------------------------+
|         HOST (CPU)        |         |       DEVICE (GPU)        |
|                           |         |                           |
|  - Runs main()            | PCIe /  |  - Runs kernel functions  |
|  - Sequential C/C++       | NVLink  |  - Thousands of threads   |
|  - Manages GPU memory     |<------->|  - Own memory (VRAM)      |
|  - Launches kernels       |         |  - SIMT execution         |
|  - Controls program flow  |         |  - Massive parallelism    |
|                           |         |                           |
+---------------------------+         +---------------------------+
```

The CPU (host) orchestrates: it allocates GPU memory, copies data to the GPU, launches parallel functions called **kernels**, and copies results back. The GPU (device) executes the kernel across thousands of threads simultaneously.

### 1.2 Function Qualifiers

CUDA extends C/C++ with three function qualifiers that control where a function runs and where it can be called from:

| Qualifier | Executes on | Callable from | Notes |
|-----------|------------|---------------|-------|
| `__global__` | Device (GPU) | Host (CPU) | Kernel entry point. Must return void. |
| `__device__` | Device (GPU) | Device (GPU) | Helper function called from kernels. |
| `__host__` | Host (CPU) | Host (CPU) | Normal CPU function (default if omitted). |

You can combine `__host__` and `__device__` to compile a function for both:

```cuda
// Compiles for BOTH CPU and GPU
__host__ __device__ float square(float x) {
    return x * x;
}
```

### 1.3 Kernel Launch Syntax

Kernels are launched with the triple-chevron syntax:

```cuda
kernel_name<<<numBlocks, threadsPerBlock>>>(arg1, arg2, ...);
```

This creates a **grid** of thread **blocks**:

```
Grid (numBlocks = 4, threadsPerBlock = 8)
+------------------------------------------------------------------+
|                                                                    |
|  Block 0              Block 1              Block 2              Block 3
|  +--------+          +--------+          +--------+          +--------+
|  |T0 T1 T2|          |T0 T1 T2|          |T0 T1 T2|          |T0 T1 T2|
|  |T3 T4 T5|          |T3 T4 T5|          |T3 T4 T5|          |T3 T4 T5|
|  |T6 T7   |          |T6 T7   |          |T6 T7   |          |T6 T7   |
|  +--------+          +--------+          +--------+          +--------+
|                                                                    |
+------------------------------------------------------------------+
Total threads = 4 * 8 = 32
```

Every thread knows its position through built-in variables:
- `threadIdx.x` -- thread index within the block (0 to 7 above)
- `blockIdx.x` -- block index within the grid (0 to 3 above)
- `blockDim.x` -- number of threads per block (8 above)
- `gridDim.x` -- number of blocks in the grid (4 above)

The global unique index of a thread is:

```
int globalIdx = blockIdx.x * blockDim.x + threadIdx.x;
```

### 1.4 The Full Launch Syntax

The triple-chevron actually accepts four parameters:

```cuda
kernel<<<gridDim, blockDim, sharedMemBytes, stream>>>(args...);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `gridDim` | `dim3` or `int` | Number of blocks in the grid |
| `blockDim` | `dim3` or `int` | Number of threads per block |
| `sharedMemBytes` | `size_t` | Dynamic shared memory per block (default 0) |
| `stream` | `cudaStream_t` | CUDA stream for async execution (default 0) |

### 1.5 Execution Flow

A typical CUDA program follows this pattern:

```
1. Allocate host memory (malloc or new)
2. Initialize host data
3. Allocate device memory (cudaMalloc)
4. Copy data from host to device (cudaMemcpy H2D)
5. Launch kernel <<<grid, block>>>
6. Copy results from device to host (cudaMemcpy D2H)
7. Use results on host
8. Free device memory (cudaFree)
9. Free host memory (free or delete)
```

---

## 2. Hello World in CUDA

### 2.1 Minimal Kernel

Let us start with the simplest possible CUDA program -- one that proves code is running on the GPU:

```cuda
// hello_cuda.cu
#include <stdio.h>

// This function runs on the GPU
__global__ void helloKernel() {
    int tid = threadIdx.x + blockIdx.x * blockDim.x;
    printf("Hello from GPU thread %d (block %d, thread %d)\n",
           tid, blockIdx.x, threadIdx.x);
}

int main() {
    // Launch 2 blocks of 4 threads each = 8 threads total
    helloKernel<<<2, 4>>>();

    // Wait for GPU to finish before the program exits
    cudaDeviceSynchronize();

    printf("Hello from CPU!\n");
    return 0;
}
```

Compile and run:

```bash
nvcc -o hello_cuda hello_cuda.cu
./hello_cuda
```

Expected output (thread order may vary -- that is the nature of parallelism):

```
Hello from GPU thread 0 (block 0, thread 0)
Hello from GPU thread 1 (block 0, thread 1)
Hello from GPU thread 2 (block 0, thread 2)
Hello from GPU thread 3 (block 0, thread 3)
Hello from GPU thread 4 (block 1, thread 0)
Hello from GPU thread 5 (block 1, thread 1)
Hello from GPU thread 6 (block 1, thread 2)
Hello from GPU thread 7 (block 1, thread 3)
Hello from CPU!
```

Key observations:
- `printf` works inside GPU kernels (since compute capability 2.0)
- `cudaDeviceSynchronize()` is essential -- without it, the program may exit before the GPU finishes
- Kernel launches are **asynchronous**: the CPU continues immediately after launching

### 2.2 First Real Program: Array Doubling

Now let us do actual computation -- double every element of an array:

```cuda
// double_array.cu
#include <stdio.h>
#include <stdlib.h>

__global__ void doubleArray(float* d_out, const float* d_in, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        d_out[idx] = d_in[idx] * 2.0f;
    }
}

int main() {
    const int N = 1024;
    const size_t bytes = N * sizeof(float);

    // Step 1: Allocate and initialize host memory
    float* h_in  = (float*)malloc(bytes);
    float* h_out = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) {
        h_in[i] = (float)i;
    }

    // Step 2: Allocate device memory
    float *d_in, *d_out;
    cudaMalloc((void**)&d_in,  bytes);
    cudaMalloc((void**)&d_out, bytes);

    // Step 3: Copy input data from host to device
    cudaMemcpy(d_in, h_in, bytes, cudaMemcpyHostToDevice);

    // Step 4: Launch kernel
    int threadsPerBlock = 256;
    int numBlocks = (N + threadsPerBlock - 1) / threadsPerBlock;
    doubleArray<<<numBlocks, threadsPerBlock>>>(d_out, d_in, N);

    // Step 5: Copy results from device to host
    cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost);

    // Step 6: Verify
    int errors = 0;
    for (int i = 0; i < N; i++) {
        if (h_out[i] != h_in[i] * 2.0f) {
            errors++;
        }
    }
    printf("Result: %s (%d errors)\n", errors == 0 ? "PASS" : "FAIL", errors);

    // Step 7: Cleanup
    cudaFree(d_in);
    cudaFree(d_out);
    free(h_in);
    free(h_out);

    return 0;
}
```

The pattern `(N + threadsPerBlock - 1) / threadsPerBlock` is ceiling division. It ensures we launch enough blocks to cover all N elements, even when N is not a multiple of the block size. The `if (idx < n)` guard inside the kernel prevents out-of-bounds threads from writing to invalid memory.

---

## 3. Thread Indexing

### 3.1 The Grid-Block-Thread Hierarchy

CUDA organizes threads into a three-level hierarchy:

```
GRID
+------------------------------------------------------------------+
|                                                                    |
|  BLOCK (0,0)         BLOCK (1,0)         BLOCK (2,0)             |
|  +--------------+    +--------------+    +--------------+         |
|  | Thread(0,0)  |    | Thread(0,0)  |    | Thread(0,0)  |         |
|  | Thread(1,0)  |    | Thread(1,0)  |    | Thread(1,0)  |         |
|  | Thread(0,1)  |    | Thread(0,1)  |    | Thread(0,1)  |         |
|  | Thread(1,1)  |    | Thread(1,1)  |    | Thread(1,1)  |         |
|  +--------------+    +--------------+    +--------------+         |
|                                                                    |
|  BLOCK (0,1)         BLOCK (1,1)         BLOCK (2,1)             |
|  +--------------+    +--------------+    +--------------+         |
|  | Thread(0,0)  |    | Thread(0,0)  |    | Thread(0,0)  |         |
|  | Thread(1,0)  |    | Thread(1,0)  |    | Thread(1,0)  |         |
|  | Thread(0,1)  |    | Thread(0,1)  |    | Thread(0,1)  |         |
|  | Thread(1,1)  |    | Thread(1,1)  |    | Thread(1,1)  |         |
|  +--------------+    +--------------+    +--------------+         |
|                                                                    |
+------------------------------------------------------------------+

gridDim  = (3, 2, 1)   -- 3 blocks in x, 2 in y
blockDim = (2, 2, 1)   -- 2 threads in x, 2 in y per block
Total threads = 3 * 2 * 2 * 2 = 24
```

### 3.2 Built-in Variables

| Variable | Type | Description |
|----------|------|-------------|
| `threadIdx` | `dim3` | Thread index within its block (0-based) |
| `blockIdx` | `dim3` | Block index within the grid (0-based) |
| `blockDim` | `dim3` | Dimensions of each block (threads per block) |
| `gridDim` | `dim3` | Dimensions of the grid (blocks per grid) |
| `warpSize` | `int` | Warp size (always 32 on current hardware) |

Each of these `dim3` variables has `.x`, `.y`, and `.z` components.

### 3.3 One-Dimensional Indexing

For 1D problems (vectors, flat arrays), use a single dimension:

```cuda
// Launch: kernel<<<numBlocks, blockSize>>>(...)
// where numBlocks and blockSize are plain integers

__global__ void kernel1D(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] = data[idx] * 2.0f;
    }
}
```

```
1D Grid with blockDim.x = 4, gridDim.x = 3

Block 0         Block 1         Block 2
[T0 T1 T2 T3]  [T4 T5 T6 T7]  [T8 T9 T10 T11]

Global index:
  T0:  0*4+0 = 0     T4:  1*4+0 = 4     T8:  2*4+0 = 8
  T1:  0*4+1 = 1     T5:  1*4+1 = 5     T9:  2*4+1 = 9
  T2:  0*4+2 = 2     T6:  1*4+2 = 6     T10: 2*4+2 = 10
  T3:  0*4+3 = 3     T7:  1*4+3 = 7     T11: 2*4+3 = 11
```

### 3.4 Two-Dimensional Indexing

For 2D problems (matrices, images), use two dimensions:

```cuda
// Launch configuration:
dim3 blockDim(16, 16);       // 16x16 = 256 threads per block
dim3 gridDim(
    (width  + 15) / 16,
    (height + 15) / 16
);
kernel2D<<<gridDim, blockDim>>>(data, width, height);

__global__ void kernel2D(float* data, int width, int height) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;

    if (col < width && row < height) {
        int idx = row * width + col;  // Row-major linear index
        data[idx] = data[idx] * 2.0f;
    }
}
```

```
2D Grid: gridDim = (3, 2), blockDim = (4, 3)

            blockIdx.x=0     blockIdx.x=1     blockIdx.x=2
          +---------------+---------------+---------------+
blockIdx  | (0,0) (1,0)   | (0,0) (1,0)   | (0,0) (1,0)   |
  .y=0    | (2,0) (3,0)   | (2,0) (3,0)   | (2,0) (3,0)   |  threadIdx
          | (0,1) (1,1)   | (0,1) (1,1)   | (0,1) (1,1)   |  within
          | (2,1) (3,1)   | (2,1) (3,1)   | (2,1) (3,1)   |  each block
          | (0,2) (1,2)   | (0,2) (1,2)   | (0,2) (1,2)   |
          | (2,2) (3,2)   | (2,2) (3,2)   | (2,2) (3,2)   |
          +---------------+---------------+---------------+
blockIdx  | (0,0) (1,0)   | (0,0) (1,0)   | (0,0) (1,0)   |
  .y=1    | (2,0) (3,0)   | (2,0) (3,0)   | (2,0) (3,0)   |
          | (0,1) (1,1)   | (0,1) (1,1)   | (0,1) (1,1)   |
          | (2,1) (3,1)   | (2,1) (3,1)   | (2,1) (3,1)   |
          | (0,2) (1,2)   | (0,2) (1,2)   | (0,2) (1,2)   |
          | (2,2) (3,2)   | (2,2) (3,2)   | (2,2) (3,2)   |
          +---------------+---------------+---------------+

Example: blockIdx=(1,0), threadIdx=(2,1)
  col = 1*4 + 2 = 6
  row = 0*3 + 1 = 1
  linear_idx = 1 * width + 6
```

### 3.5 Three-Dimensional Indexing

For 3D problems (volumes, 3D simulations):

```cuda
dim3 blockDim(8, 8, 8);      // 512 threads per block
dim3 gridDim(
    (dimX + 7) / 8,
    (dimY + 7) / 8,
    (dimZ + 7) / 8
);
kernel3D<<<gridDim, blockDim>>>(data, dimX, dimY, dimZ);

__global__ void kernel3D(float* data, int dimX, int dimY, int dimZ) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    int z = blockIdx.z * blockDim.z + threadIdx.z;

    if (x < dimX && y < dimY && z < dimZ) {
        int idx = z * dimY * dimX + y * dimX + x;
        data[idx] = data[idx] * 2.0f;
    }
}
```

### 3.6 Grid-Stride Loops

When the problem size exceeds the grid size, use a grid-stride loop. Each thread processes multiple elements separated by the total number of threads in the grid:

```cuda
__global__ void gridStrideKernel(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;

    for (int i = idx; i < n; i += stride) {
        data[i] = data[i] * 2.0f;
    }
}

// You can launch with fewer threads than elements:
int blockSize = 256;
int numBlocks = 32;  // Fixed, not dependent on N
gridStrideKernel<<<numBlocks, blockSize>>>(d_data, N);
```

```
Grid-stride loop with 8 threads processing 20 elements:

Thread 0: elements [0, 8, 16]
Thread 1: elements [1, 9, 17]
Thread 2: elements [2, 10, 18]
Thread 3: elements [3, 11, 19]
Thread 4: elements [4, 12]
Thread 5: elements [5, 13]
Thread 6: elements [6, 14]
Thread 7: elements [7, 15]
```

Grid-stride loops are preferred because they decouple the launch configuration from the problem size and naturally handle any input size.

---

## 4. Memory Management

### 4.1 The Memory Landscape

```
HOST MEMORY                              DEVICE MEMORY
+------------------+                     +------------------+
|                  |   cudaMemcpy H2D    |                  |
|   malloc'd       | ------------------> |   cudaMalloc'd   |
|   memory         |                     |   global memory  |
|                  | <------------------ |                  |
|                  |   cudaMemcpy D2H    |                  |
+------------------+                     +------------------+
|                  |                     |                  |
|   Pinned memory  |   cudaMemcpy H2D    |   Shared memory  |
|   (cudaMalloc-   | ==================> |   (per-block,    |
|    Host)         |   (faster DMA)      |    on-chip)      |
|                  |                     |                  |
+------------------+                     +------------------+
```

### 4.2 Core API Functions

**cudaMalloc** -- Allocate device memory:

```cuda
float* d_array;
cudaError_t err = cudaMalloc((void**)&d_array, N * sizeof(float));
// d_array now points to GPU memory -- cannot be dereferenced on the CPU!
```

**cudaFree** -- Free device memory:

```cuda
cudaFree(d_array);
```

**cudaMemcpy** -- Copy data between host and device:

```cuda
// Host to Device
cudaMemcpy(d_dest, h_src, numBytes, cudaMemcpyHostToDevice);

// Device to Host
cudaMemcpy(h_dest, d_src, numBytes, cudaMemcpyDeviceToHost);

// Device to Device
cudaMemcpy(d_dest, d_src, numBytes, cudaMemcpyDeviceToDevice);
```

**cudaMemset** -- Initialize device memory:

```cuda
cudaMemset(d_array, 0, N * sizeof(float));  // Set all bytes to 0
```

### 4.3 Pinned (Page-Locked) Host Memory

Regular `malloc` memory is pageable -- the OS can swap it to disk. `cudaMallocHost` allocates pinned memory that cannot be swapped, enabling faster DMA transfers:

```cuda
float* h_pinned;
cudaMallocHost((void**)&h_pinned, N * sizeof(float));

// Use it like normal host memory
for (int i = 0; i < N; i++) {
    h_pinned[i] = (float)i;
}

// Transfer is faster because no staging buffer is needed
cudaMemcpy(d_array, h_pinned, N * sizeof(float), cudaMemcpyHostToDevice);

// Free with special function (not free()!)
cudaFreeHost(h_pinned);
```

Pinned memory typically doubles transfer bandwidth (6-12 GB/s vs 3-6 GB/s on PCIe 3.0). But do not pin too much -- it reduces memory available for the OS page cache.

### 4.4 Complete Memory Management Example

```cuda
// memory_demo.cu
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

__global__ void saxpy(float a, float* x, float* y, float* out, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        out[idx] = a * x[idx] + y[idx];
    }
}

int main() {
    const int N = 1 << 20;  // ~1 million elements
    const size_t bytes = N * sizeof(float);
    const float A = 2.0f;

    // Host allocation
    float* h_x = (float*)malloc(bytes);
    float* h_y = (float*)malloc(bytes);
    float* h_out = (float*)malloc(bytes);

    // Initialize
    for (int i = 0; i < N; i++) {
        h_x[i] = 1.0f;
        h_y[i] = 2.0f;
    }

    // Device allocation
    float *d_x, *d_y, *d_out;
    CHECK_CUDA(cudaMalloc((void**)&d_x, bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_y, bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_out, bytes));

    // Host to Device
    CHECK_CUDA(cudaMemcpy(d_x, h_x, bytes, cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(d_y, h_y, bytes, cudaMemcpyHostToDevice));

    // Launch
    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    saxpy<<<gridSize, blockSize>>>(A, d_x, d_y, d_out, N);
    CHECK_CUDA(cudaGetLastError());  // Check launch errors

    // Device to Host
    CHECK_CUDA(cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost));

    // Verify: out should be 2*1 + 2 = 4
    int errors = 0;
    for (int i = 0; i < N; i++) {
        if (fabsf(h_out[i] - 4.0f) > 1e-5f) {
            errors++;
        }
    }
    printf("SAXPY: %s (%d errors out of %d)\n",
           errors == 0 ? "PASS" : "FAIL", errors, N);

    // Cleanup
    CHECK_CUDA(cudaFree(d_x));
    CHECK_CUDA(cudaFree(d_y));
    CHECK_CUDA(cudaFree(d_out));
    free(h_x);
    free(h_y);
    free(h_out);

    return 0;
}
```

---

## 5. Error Handling

### 5.1 Why Error Handling Matters

CUDA kernel launches are asynchronous. If you do not check for errors, your program may silently produce garbage results. A kernel might fail because of invalid memory access, too many threads requested, or insufficient resources -- but without error checking you will never know.

### 5.2 The Error Checking Macro

Every CUDA program should use this macro (or something equivalent):

```cuda
#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)
```

Use it around every CUDA API call:

```cuda
CHECK_CUDA(cudaMalloc((void**)&d_ptr, bytes));
CHECK_CUDA(cudaMemcpy(d_ptr, h_ptr, bytes, cudaMemcpyHostToDevice));
```

### 5.3 Checking Kernel Launch Errors

Kernel launches have two failure points:

```cuda
// Error point 1: Launch configuration errors (too many threads, etc.)
myKernel<<<grid, block>>>(args);
CHECK_CUDA(cudaGetLastError());       // Catches launch config errors

// Error point 2: Execution errors (out-of-bounds, illegal instruction)
CHECK_CUDA(cudaDeviceSynchronize());  // Catches runtime errors
```

`cudaGetLastError()` returns the error from the most recent CUDA call and resets the error state. `cudaDeviceSynchronize()` blocks the CPU until all GPU work completes, so any execution error is caught here.

### 5.4 Comprehensive Error Handling Example

```cuda
// error_handling.cu
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

#define CHECK_KERNEL()                                                  \
    do {                                                                \
        CHECK_CUDA(cudaGetLastError());                                 \
        CHECK_CUDA(cudaDeviceSynchronize());                            \
    } while (0)

__global__ void safeKernel(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] = sqrtf(data[idx]);
    }
}

int main() {
    const int N = 1024;
    const size_t bytes = N * sizeof(float);

    float* h_data = (float*)malloc(bytes);
    if (!h_data) {
        fprintf(stderr, "Host malloc failed\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < N; i++) {
        h_data[i] = (float)(i * i);
    }

    float* d_data;
    CHECK_CUDA(cudaMalloc((void**)&d_data, bytes));
    CHECK_CUDA(cudaMemcpy(d_data, h_data, bytes, cudaMemcpyHostToDevice));

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    safeKernel<<<gridSize, blockSize>>>(d_data, N);
    CHECK_KERNEL();

    CHECK_CUDA(cudaMemcpy(h_data, d_data, bytes, cudaMemcpyDeviceToHost));

    // Verify: sqrt(i*i) should be i
    for (int i = 0; i < 10; i++) {
        printf("sqrt(%d) = %.1f\n", i * i, h_data[i]);
    }

    CHECK_CUDA(cudaFree(d_data));
    free(h_data);

    return 0;
}
```

---

## 6. Vector Addition

### 6.1 The Canonical CUDA Example

Vector addition is the "Hello World" of GPU computing because each output element is independent -- perfect parallelism with no communication between threads.

```cuda
// vec_add.cu
// Complete vector addition with timing using CUDA events
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// ---- GPU kernel ----
__global__ void vecAddKernel(const float* a, const float* b,
                             float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

// ---- CPU reference implementation ----
void vecAddCPU(const float* a, const float* b, float* c, int n) {
    for (int i = 0; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}

int main() {
    const int N = 1 << 24;  // ~16 million elements
    const size_t bytes = N * sizeof(float);

    printf("Vector Addition: N = %d (%.1f MB per vector)\n",
           N, (float)bytes / (1 << 20));

    // ---- Allocate host memory ----
    float* h_a   = (float*)malloc(bytes);
    float* h_b   = (float*)malloc(bytes);
    float* h_c   = (float*)malloc(bytes);  // GPU result
    float* h_ref = (float*)malloc(bytes);  // CPU reference

    // ---- Initialize with random data ----
    srand(42);
    for (int i = 0; i < N; i++) {
        h_a[i] = (float)rand() / RAND_MAX;
        h_b[i] = (float)rand() / RAND_MAX;
    }

    // ---- CPU timing ----
    clock_t cpu_start = clock();
    vecAddCPU(h_a, h_b, h_ref, N);
    clock_t cpu_end = clock();
    float cpu_ms = 1000.0f * (cpu_end - cpu_start) / CLOCKS_PER_SEC;

    // ---- Allocate device memory ----
    float *d_a, *d_b, *d_c;
    CHECK_CUDA(cudaMalloc((void**)&d_a, bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_b, bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_c, bytes));

    // ---- Create CUDA events for timing ----
    cudaEvent_t start, stop;
    CHECK_CUDA(cudaEventCreate(&start));
    CHECK_CUDA(cudaEventCreate(&stop));

    // ---- Time the entire GPU pipeline (H2D + kernel + D2H) ----
    CHECK_CUDA(cudaEventRecord(start));

    CHECK_CUDA(cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice));

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    vecAddKernel<<<gridSize, blockSize>>>(d_a, d_b, d_c, N);
    CHECK_CUDA(cudaGetLastError());

    CHECK_CUDA(cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost));

    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));

    float gpu_ms = 0.0f;
    CHECK_CUDA(cudaEventElapsedTime(&gpu_ms, start, stop));

    // ---- Time kernel only ----
    cudaEvent_t k_start, k_stop;
    CHECK_CUDA(cudaEventCreate(&k_start));
    CHECK_CUDA(cudaEventCreate(&k_stop));

    CHECK_CUDA(cudaEventRecord(k_start));
    vecAddKernel<<<gridSize, blockSize>>>(d_a, d_b, d_c, N);
    CHECK_CUDA(cudaEventRecord(k_stop));
    CHECK_CUDA(cudaEventSynchronize(k_stop));

    float kernel_ms = 0.0f;
    CHECK_CUDA(cudaEventElapsedTime(&kernel_ms, k_start, k_stop));

    // ---- Verify results ----
    float maxError = 0.0f;
    for (int i = 0; i < N; i++) {
        float diff = fabsf(h_c[i] - h_ref[i]);
        if (diff > maxError) maxError = diff;
    }

    // ---- Report ----
    printf("\nResults:\n");
    printf("  Max error:              %e\n", maxError);
    printf("  CPU time:               %.2f ms\n", cpu_ms);
    printf("  GPU total (H2D+K+D2H): %.2f ms\n", gpu_ms);
    printf("  GPU kernel only:        %.2f ms\n", kernel_ms);
    printf("  Speedup (kernel):       %.1fx\n", cpu_ms / kernel_ms);
    printf("  Bandwidth (kernel):     %.1f GB/s\n",
           3.0f * bytes / kernel_ms / 1e6);  // 2 reads + 1 write

    // ---- Cleanup ----
    CHECK_CUDA(cudaEventDestroy(start));
    CHECK_CUDA(cudaEventDestroy(stop));
    CHECK_CUDA(cudaEventDestroy(k_start));
    CHECK_CUDA(cudaEventDestroy(k_stop));
    CHECK_CUDA(cudaFree(d_a));
    CHECK_CUDA(cudaFree(d_b));
    CHECK_CUDA(cudaFree(d_c));
    free(h_a);
    free(h_b);
    free(h_c);
    free(h_ref);

    return 0;
}
```

### 6.2 Understanding the Timing Results

Typical output on an RTX 3080:

```
Vector Addition: N = 16777216 (64.0 MB per vector)

Results:
  Max error:              0.000000e+00
  CPU time:               28.45 ms
  GPU total (H2D+K+D2H): 18.32 ms
  GPU kernel only:        0.42 ms
  Speedup (kernel):       67.7x
  Bandwidth (kernel):     480.0 GB/s
```

Key observations:
- The kernel itself is extremely fast because vector addition is **memory-bound** -- limited by how fast data can be read/written, not by compute
- The total GPU time includes PCIe transfers, which dominate for this simple operation
- **Effective bandwidth** of ~480 GB/s is close to the theoretical max (~760 GB/s for RTX 3080), meaning the kernel is well-optimized
- For simple operations, the GPU only wins when data is already on the device or the problem is large enough to amortize transfer costs

### 6.3 CUDA Events Explained

CUDA events are the correct way to time GPU operations:

```cuda
cudaEvent_t start, stop;
cudaEventCreate(&start);
cudaEventCreate(&stop);

cudaEventRecord(start);     // Insert timestamp into GPU stream
// ... GPU work ...
cudaEventRecord(stop);      // Insert second timestamp

cudaEventSynchronize(stop); // Wait for stop event to complete

float ms;
cudaEventElapsedTime(&ms, start, stop);  // Compute elapsed time

cudaEventDestroy(start);
cudaEventDestroy(stop);
```

Why not use `clock()` or `std::chrono`? Because kernel launches are asynchronous. CPU timers would measure the launch overhead, not the actual GPU execution time. CUDA events are recorded on the GPU timeline itself.

---

## 7. Matrix Multiplication

Matrix multiplication is the most important operation in GPU computing. It is the backbone of deep learning, scientific simulation, and linear algebra. It also demonstrates the critical importance of memory access patterns.

### 7.1 The Problem

Compute C = A * B where A is MxK, B is KxN, and C is MxN:

```
         K                    N                    N
    +---------+          +---------+          +---------+
    |         |          |         |          |         |
M   |    A    |    x   K |    B    |    =   M |    C    |
    |         |          |         |          |         |
    +---------+          +---------+          +---------+

C[row][col] = sum(A[row][k] * B[k][col]) for k = 0..K-1
```

### 7.2 Naive Matrix Multiplication

Each thread computes one element of C by iterating over the shared dimension K:

```cuda
// matmul_naive.cu
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// ---- Naive kernel: one thread per output element ----
__global__ void matMulNaive(const float* A, const float* B, float* C,
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

// ---- CPU reference ----
void matMulCPU(const float* A, const float* B, float* C,
               int M, int N, int K) {
    for (int i = 0; i < M; i++) {
        for (int j = 0; j < N; j++) {
            float sum = 0.0f;
            for (int k = 0; k < K; k++) {
                sum += A[i * K + k] * B[k * N + j];
            }
            C[i * N + j] = sum;
        }
    }
}

int main() {
    const int M = 1024, N = 1024, K = 1024;
    const size_t bytesA = M * K * sizeof(float);
    const size_t bytesB = K * N * sizeof(float);
    const size_t bytesC = M * N * sizeof(float);

    printf("Matrix Multiplication: (%d x %d) * (%d x %d)\n", M, K, K, N);

    // Host allocation
    float* h_A   = (float*)malloc(bytesA);
    float* h_B   = (float*)malloc(bytesB);
    float* h_C   = (float*)malloc(bytesC);
    float* h_ref = (float*)malloc(bytesC);

    // Initialize
    srand(42);
    for (int i = 0; i < M * K; i++) h_A[i] = (float)rand() / RAND_MAX;
    for (int i = 0; i < K * N; i++) h_B[i] = (float)rand() / RAND_MAX;

    // CPU reference
    matMulCPU(h_A, h_B, h_ref, M, N, K);

    // Device allocation
    float *d_A, *d_B, *d_C;
    CHECK_CUDA(cudaMalloc((void**)&d_A, bytesA));
    CHECK_CUDA(cudaMalloc((void**)&d_B, bytesB));
    CHECK_CUDA(cudaMalloc((void**)&d_C, bytesC));

    CHECK_CUDA(cudaMemcpy(d_A, h_A, bytesA, cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(d_B, h_B, bytesB, cudaMemcpyHostToDevice));

    // Launch
    dim3 blockDim(16, 16);  // 256 threads per block
    dim3 gridDim((N + 15) / 16, (M + 15) / 16);

    // Warmup
    matMulNaive<<<gridDim, blockDim>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaDeviceSynchronize());

    // Timed run
    cudaEvent_t start, stop;
    CHECK_CUDA(cudaEventCreate(&start));
    CHECK_CUDA(cudaEventCreate(&stop));

    CHECK_CUDA(cudaEventRecord(start));
    matMulNaive<<<gridDim, blockDim>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));

    float ms;
    CHECK_CUDA(cudaEventElapsedTime(&ms, start, stop));

    CHECK_CUDA(cudaMemcpy(h_C, d_C, bytesC, cudaMemcpyDeviceToHost));

    // Verify
    float maxError = 0.0f;
    for (int i = 0; i < M * N; i++) {
        float diff = fabsf(h_C[i] - h_ref[i]);
        if (diff > maxError) maxError = diff;
    }

    // Performance
    double flops = 2.0 * M * N * K;  // multiply-add = 2 ops
    double gflops = flops / (ms / 1000.0) / 1e9;

    printf("  Naive kernel:  %.2f ms, %.1f GFLOPS\n", ms, gflops);
    printf("  Max error:     %e\n", maxError);

    // Cleanup
    CHECK_CUDA(cudaEventDestroy(start));
    CHECK_CUDA(cudaEventDestroy(stop));
    CHECK_CUDA(cudaFree(d_A));
    CHECK_CUDA(cudaFree(d_B));
    CHECK_CUDA(cudaFree(d_C));
    free(h_A);
    free(h_B);
    free(h_C);
    free(h_ref);

    return 0;
}
```

### 7.3 Why the Naive Version is Slow

The problem is memory access. For each element of C, the kernel reads an entire row of A and an entire column of B from global memory:

```
Computing C[row][col]:

     A (row-major in memory)           B (row-major in memory)
     +---+---+---+---+---+            +---+---+---+---+---+
     |   |   |   |   |   |            |   | * |   |   |   |  <- B[0][col]
     +---+---+---+---+---+            +---+---+---+---+---+
 row | * | * | * | * | * | <-- read   |   | * |   |   |   |  <- B[1][col]
     +---+---+---+---+---+  entire    +---+---+---+---+---+
     |   |   |   |   |   |  row       |   | * |   |   |   |  <- B[2][col]
     +---+---+---+---+---+            +---+---+---+---+---+
     |   |   |   |   |   |            |   | * |   |   |   |  <- B[3][col]
     +---+---+---+---+---+            +---+---+---+---+---+
                                       |   | * |   |   |   |  <- B[4][col]
                                       +---+---+---+---+---+
                                            ^
                                       Column access = STRIDE N
                                       = non-coalesced!

Problem: Adjacent threads (same row, different cols) all read the SAME
row of A redundantly. Each thread reads K floats from A and K floats
from B. For a 1024x1024 matrix, that is 8 KB per thread, and there
are 1M threads = 8 TB of global memory traffic (with reuse, actual
is lower because of caching, but still terrible).
```

### 7.4 Tiled Matrix Multiplication with Shared Memory

The solution is **tiling**: load submatrices into fast shared memory and reuse them across threads in the block.

```
TILING STRATEGY:

For each tile position t = 0, 1, ..., K/TILE_SIZE:
  1. All threads cooperatively load A_tile and B_tile into shared memory
  2. __syncthreads()
  3. Each thread computes partial dot product using shared memory
  4. __syncthreads()
  5. Move to next tile

Result: Each element of A and B is loaded from global memory once per tile
and reused TILE_SIZE times from shared memory.

     K dimension -->
  A: +--+--+--+--+           B: +--+--+--+--+
     |T0|T1|T2|T3|              |T0|T0|T0|T0|
  M  |T0|T1|T2|T3|           K  |T1|T1|T1|T1|
     |T0|T1|T2|T3|              |T2|T2|T2|T2|
     |T0|T1|T2|T3|              |T3|T3|T3|T3|
     +--+--+--+--+              +--+--+--+--+
                                 N dimension -->

  Phase 0: Load A(:,T0) and B(T0,:) into shared memory
  Phase 1: Load A(:,T1) and B(T1,:) into shared memory
  ...
  Each phase: TILE_SIZE^2 reads from global, TILE_SIZE^3 FMAs from shared
```

Complete implementation:

```cuda
// matmul_tiled.cu
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

#define TILE_SIZE 16

// ---- Naive kernel (for comparison) ----
__global__ void matMulNaive(const float* A, const float* B, float* C,
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

// ---- Tiled kernel with shared memory ----
__global__ void matMulTiled(const float* A, const float* B, float* C,
                            int M, int N, int K) {
    __shared__ float As[TILE_SIZE][TILE_SIZE];
    __shared__ float Bs[TILE_SIZE][TILE_SIZE];

    int row = blockIdx.y * TILE_SIZE + threadIdx.y;
    int col = blockIdx.x * TILE_SIZE + threadIdx.x;

    float sum = 0.0f;

    // Loop over tiles along K dimension
    for (int t = 0; t < (K + TILE_SIZE - 1) / TILE_SIZE; t++) {
        // Cooperative loading: each thread loads one element of each tile
        int aCol = t * TILE_SIZE + threadIdx.x;
        int bRow = t * TILE_SIZE + threadIdx.y;

        // Load A tile (with bounds check)
        if (row < M && aCol < K) {
            As[threadIdx.y][threadIdx.x] = A[row * K + aCol];
        } else {
            As[threadIdx.y][threadIdx.x] = 0.0f;
        }

        // Load B tile (with bounds check)
        if (bRow < K && col < N) {
            Bs[threadIdx.y][threadIdx.x] = B[bRow * N + col];
        } else {
            Bs[threadIdx.y][threadIdx.x] = 0.0f;
        }

        // Wait for all threads to finish loading
        __syncthreads();

        // Compute partial dot product from this tile
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        }

        // Wait before loading next tile (so no thread overwrites
        // shared memory that another thread is still reading)
        __syncthreads();
    }

    if (row < M && col < N) {
        C[row * N + col] = sum;
    }
}

// ---- CPU reference ----
void matMulCPU(const float* A, const float* B, float* C,
               int M, int N, int K) {
    for (int i = 0; i < M; i++) {
        for (int j = 0; j < N; j++) {
            float sum = 0.0f;
            for (int k = 0; k < K; k++) {
                sum += A[i * K + k] * B[k * N + j];
            }
            C[i * N + j] = sum;
        }
    }
}

int main() {
    const int M = 1024, N = 1024, K = 1024;
    const size_t bytesA = M * K * sizeof(float);
    const size_t bytesB = K * N * sizeof(float);
    const size_t bytesC = M * N * sizeof(float);

    printf("Matrix Multiplication: (%d x %d) * (%d x %d)\n", M, K, K, N);
    printf("TILE_SIZE = %d\n\n", TILE_SIZE);

    // Allocate and initialize host memory
    float* h_A   = (float*)malloc(bytesA);
    float* h_B   = (float*)malloc(bytesB);
    float* h_C   = (float*)malloc(bytesC);
    float* h_ref = (float*)malloc(bytesC);

    srand(42);
    for (int i = 0; i < M * K; i++) h_A[i] = (float)rand() / RAND_MAX;
    for (int i = 0; i < K * N; i++) h_B[i] = (float)rand() / RAND_MAX;

    matMulCPU(h_A, h_B, h_ref, M, N, K);

    // Allocate device memory
    float *d_A, *d_B, *d_C;
    CHECK_CUDA(cudaMalloc((void**)&d_A, bytesA));
    CHECK_CUDA(cudaMalloc((void**)&d_B, bytesB));
    CHECK_CUDA(cudaMalloc((void**)&d_C, bytesC));
    CHECK_CUDA(cudaMemcpy(d_A, h_A, bytesA, cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(d_B, h_B, bytesB, cudaMemcpyHostToDevice));

    dim3 block(TILE_SIZE, TILE_SIZE);
    dim3 grid((N + TILE_SIZE - 1) / TILE_SIZE,
              (M + TILE_SIZE - 1) / TILE_SIZE);

    double flops = 2.0 * M * N * K;

    // ---- Benchmark Naive ----
    // Warmup
    matMulNaive<<<grid, block>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaDeviceSynchronize());

    cudaEvent_t start, stop;
    CHECK_CUDA(cudaEventCreate(&start));
    CHECK_CUDA(cudaEventCreate(&stop));

    CHECK_CUDA(cudaEventRecord(start));
    matMulNaive<<<grid, block>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));

    float naiveMs;
    CHECK_CUDA(cudaEventElapsedTime(&naiveMs, start, stop));

    CHECK_CUDA(cudaMemcpy(h_C, d_C, bytesC, cudaMemcpyDeviceToHost));
    float naiveMaxErr = 0.0f;
    for (int i = 0; i < M * N; i++) {
        float d = fabsf(h_C[i] - h_ref[i]);
        if (d > naiveMaxErr) naiveMaxErr = d;
    }
    double naiveGflops = flops / (naiveMs / 1000.0) / 1e9;

    // ---- Benchmark Tiled ----
    // Warmup
    matMulTiled<<<grid, block>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaDeviceSynchronize());

    CHECK_CUDA(cudaEventRecord(start));
    matMulTiled<<<grid, block>>>(d_A, d_B, d_C, M, N, K);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));

    float tiledMs;
    CHECK_CUDA(cudaEventElapsedTime(&tiledMs, start, stop));

    CHECK_CUDA(cudaMemcpy(h_C, d_C, bytesC, cudaMemcpyDeviceToHost));
    float tiledMaxErr = 0.0f;
    for (int i = 0; i < M * N; i++) {
        float d = fabsf(h_C[i] - h_ref[i]);
        if (d > tiledMaxErr) tiledMaxErr = d;
    }
    double tiledGflops = flops / (tiledMs / 1000.0) / 1e9;

    // ---- Report ----
    printf("Kernel        Time (ms)    GFLOPS    Max Error\n");
    printf("----------    ---------    ------    ---------\n");
    printf("Naive         %9.2f    %6.1f    %e\n",
           naiveMs, naiveGflops, naiveMaxErr);
    printf("Tiled         %9.2f    %6.1f    %e\n",
           tiledMs, tiledGflops, tiledMaxErr);
    printf("\nTiled speedup over naive: %.2fx\n", naiveMs / tiledMs);

    // Cleanup
    CHECK_CUDA(cudaEventDestroy(start));
    CHECK_CUDA(cudaEventDestroy(stop));
    CHECK_CUDA(cudaFree(d_A));
    CHECK_CUDA(cudaFree(d_B));
    CHECK_CUDA(cudaFree(d_C));
    free(h_A);
    free(h_B);
    free(h_C);
    free(h_ref);

    return 0;
}
```

Typical results on an RTX 3080 (1024x1024):

```
Kernel        Time (ms)    GFLOPS    Max Error
----------    ---------    ------    ---------
Naive              3.21     669.2    3.815e-04
Tiled              1.45    1482.0    3.815e-04

Tiled speedup over naive: 2.21x
```

The tiled version is faster because it reduces global memory traffic by a factor of TILE_SIZE. For TILE_SIZE=16, each float is loaded from global memory once instead of 16 times.

### 7.5 Memory Traffic Analysis

```
NAIVE:
  Each thread reads K floats from A and K floats from B.
  Total threads: M * N
  Total reads: M*N*K + M*N*K = 2*M*N*K

  For M=N=K=1024:
    2 * 1024^3 = 2 billion float reads = 8 GB

TILED (TILE_SIZE = T):
  Each tile load: T*T floats from A + T*T floats from B
  Tiles per output block: K/T
  Number of blocks: (M/T) * (N/T)
  Total reads: (M/T)*(N/T) * (K/T) * 2*T*T = 2*M*N*K / T

  For M=N=K=1024, T=16:
    2 * 1024^3 / 16 = 128 million float reads = 512 MB

  Reduction factor: T = 16x less global memory traffic
```

---

## 8. CUDA Compilation

### 8.1 The nvcc Compiler

`nvcc` is the NVIDIA CUDA Compiler. It separates host code and device code, compiles device code to PTX (intermediate representation) or SASS (machine code), and uses the host compiler (gcc, clang, MSVC) for host code.

```
Source (.cu)
     |
     v
+----------+
|   nvcc   |
+----------+
     |
     +--------> Host code (.cpp) -----> Host compiler (gcc) --+
     |                                                         |
     +--------> Device code -----> PTX -----> SASS -----------+
                                                               |
                                                               v
                                                        Executable
```

### 8.2 Essential Compiler Flags

```bash
# Basic compilation
nvcc -o program program.cu

# Specify GPU architecture (REQUIRED for best performance)
nvcc -arch=sm_86 -o program program.cu     # RTX 3080 (Ampere)
nvcc -arch=sm_89 -o program program.cu     # RTX 4090 (Ada Lovelace)
nvcc -arch=sm_90 -o program program.cu     # H100 (Hopper)

# Generate PTX for forward compatibility + SASS for specific arch
nvcc -gencode arch=compute_80,code=sm_80 \
     -gencode arch=compute_86,code=sm_86 \
     -gencode arch=compute_89,code=sm_89 \
     -o program program.cu

# Optimization flags
nvcc -O3 -o program program.cu              # Host optimization level
nvcc --use_fast_math -o program program.cu   # Fast math (less precise)

# Debug flags
nvcc -g -G -o program program.cu             # Host + device debug info
nvcc -lineinfo -o program program.cu         # Line info without debug overhead

# Verbose compilation (shows register and shared memory usage)
nvcc --ptxas-options=-v -o program program.cu

# C++ standard
nvcc -std=c++17 -o program program.cu
```

### 8.3 Compute Capability Reference

| Compute Capability | Architecture | Example GPUs |
|-------------------|-------------|-------------|
| 5.0 / 5.2 | Maxwell | GTX 900 series |
| 6.0 / 6.1 | Pascal | GTX 1000 series, P100 |
| 7.0 | Volta | V100 |
| 7.5 | Turing | RTX 2000 series, T4 |
| 8.0 | Ampere | A100 |
| 8.6 | Ampere | RTX 3000 series |
| 8.9 | Ada Lovelace | RTX 4000 series, L4, L40 |
| 9.0 | Hopper | H100, H200 |
| 10.0 | Blackwell | B100, B200, GB200 |

Use `nvcc --list-gpu-arch` to see supported architectures in your CUDA toolkit version.

### 8.4 Makefile for CUDA Projects

```makefile
# Makefile for CUDA project
NVCC        = nvcc
NVCC_FLAGS  = -O3 -std=c++17
ARCH_FLAGS  = -arch=sm_86

# Detect all .cu files
SOURCES     = $(wildcard *.cu)
TARGETS     = $(SOURCES:.cu=)

all: $(TARGETS)

%: %.cu
	$(NVCC) $(NVCC_FLAGS) $(ARCH_FLAGS) -o $@ $<

clean:
	rm -f $(TARGETS)

.PHONY: all clean
```

### 8.5 CMake Integration

```cmake
cmake_minimum_required(VERSION 3.18)
project(cuda_demo LANGUAGES CXX CUDA)

# Find CUDA (automatically done when CUDA is in LANGUAGES)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_ARCHITECTURES 86)  # Set your target architecture

add_executable(matmul matmul_tiled.cu)

# For mixed C++/CUDA projects:
add_executable(mixed_app
    main.cpp           # C++ file
    kernels.cu         # CUDA file
)
```

---

## 9. Device Properties

### 9.1 Querying GPU Capabilities

Every CUDA program should query the device to make informed decisions about launch configurations:

```cuda
// device_query.cu
#include <stdio.h>
#include <stdlib.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error: %s\n",                         \
                    cudaGetErrorString(err));                            \
            return EXIT_FAILURE;                                        \
        }                                                               \
    } while (0)

int main() {
    int deviceCount;
    CHECK_CUDA(cudaGetDeviceCount(&deviceCount));
    printf("Found %d CUDA device(s)\n\n", deviceCount);

    for (int dev = 0; dev < deviceCount; dev++) {
        cudaDeviceProp prop;
        CHECK_CUDA(cudaGetDeviceProperties(&prop, dev));

        printf("Device %d: %s\n", dev, prop.name);
        printf("  Compute capability:       %d.%d\n",
               prop.major, prop.minor);
        printf("  SM count:                 %d\n",
               prop.multiProcessorCount);
        printf("  Max threads per SM:       %d\n",
               prop.maxThreadsPerMultiProcessor);
        printf("  Max threads per block:    %d\n",
               prop.maxThreadsPerBlock);
        printf("  Max block dimensions:     (%d, %d, %d)\n",
               prop.maxThreadsDim[0],
               prop.maxThreadsDim[1],
               prop.maxThreadsDim[2]);
        printf("  Max grid dimensions:      (%d, %d, %d)\n",
               prop.maxGridSize[0],
               prop.maxGridSize[1],
               prop.maxGridSize[2]);
        printf("  Warp size:                %d\n", prop.warpSize);
        printf("  Global memory:            %.1f GB\n",
               prop.totalGlobalMem / 1e9);
        printf("  Shared memory per block:  %zu KB\n",
               prop.sharedMemPerBlock / 1024);
        printf("  Shared memory per SM:     %zu KB\n",
               prop.sharedMemPerMultiprocessor / 1024);
        printf("  Registers per block:      %d\n",
               prop.regsPerBlock);
        printf("  Registers per SM:         %d\n",
               prop.regsPerMultiprocessor);
        printf("  Memory bus width:         %d bits\n",
               prop.memoryBusWidth);
        printf("  Memory clock rate:        %.0f MHz\n",
               prop.memoryClockRate / 1000.0);
        printf("  L2 cache size:            %d KB\n",
               prop.l2CacheSize / 1024);
        printf("  Clock rate:               %.0f MHz\n",
               prop.clockRate / 1000.0);
        printf("  Concurrent kernels:       %s\n",
               prop.concurrentKernels ? "Yes" : "No");
        printf("  ECC enabled:              %s\n",
               prop.ECCEnabled ? "Yes" : "No");

        // Compute theoretical bandwidth
        // Factor of 2 for DDR (double data rate)
        float bandwidth_gb = 2.0f * prop.memoryClockRate *
                             (prop.memoryBusWidth / 8) / 1.0e6;
        printf("  Theoretical bandwidth:    %.0f GB/s\n", bandwidth_gb);
        printf("\n");
    }

    return 0;
}
```

### 9.2 Important Properties for Optimization

```
KEY LIMITS TO KNOW:
+--------------------------------------------------------------+
| Property                    | Typical Value  | Why It Matters |
+-----------------------------+----------------+----------------|
| maxThreadsPerBlock          | 1024           | Block size cap |
| maxThreadsPerMultiProcessor | 1536-2048      | Occupancy calc |
| warpSize                    | 32             | Divergence     |
| sharedMemPerBlock           | 48-100 KB      | Tile size cap  |
| regsPerBlock                | 65536          | Spill point    |
| multiProcessorCount         | 28-144         | Grid sizing    |
| memoryBusWidth              | 256-5120 bits  | Bandwidth calc |
+--------------------------------------------------------------+
```

### 9.3 Adaptive Launch Configuration

Use device properties to write portable code that auto-tunes itself:

```cuda
// adaptive_launch.cu
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

__global__ void processData(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;
    for (int i = idx; i < n; i += stride) {
        data[i] = sqrtf(data[i]);
    }
}

int main() {
    const int N = 1 << 24;
    const size_t bytes = N * sizeof(float);

    // Query device
    cudaDeviceProp prop;
    CHECK_CUDA(cudaGetDeviceProperties(&prop, 0));

    // Use occupancy API to find optimal block size
    int blockSize;
    int minGridSize;
    CHECK_CUDA(cudaOccupancyMaxPotentialBlockSize(
        &minGridSize, &blockSize, processData, 0, 0));

    int gridSize = (N + blockSize - 1) / blockSize;
    // Cap grid size to avoid diminishing returns
    int maxBlocks = prop.multiProcessorCount * 32;
    if (gridSize > maxBlocks) gridSize = maxBlocks;

    printf("Device: %s\n", prop.name);
    printf("Block size (auto): %d\n", blockSize);
    printf("Grid size: %d\n", gridSize);
    printf("SM count: %d\n", prop.multiProcessorCount);

    float* d_data;
    CHECK_CUDA(cudaMalloc((void**)&d_data, bytes));

    // Initialize to sequential values
    float* h_data = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) h_data[i] = (float)(i + 1);
    CHECK_CUDA(cudaMemcpy(d_data, h_data, bytes, cudaMemcpyHostToDevice));

    // Launch with auto-tuned configuration
    processData<<<gridSize, blockSize>>>(d_data, N);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());

    // Verify first few results
    CHECK_CUDA(cudaMemcpy(h_data, d_data, bytes, cudaMemcpyDeviceToHost));
    for (int i = 0; i < 5; i++) {
        printf("sqrt(%d) = %.4f (expected %.4f)\n",
               i + 1, h_data[i], sqrtf((float)(i + 1)));
    }

    CHECK_CUDA(cudaFree(d_data));
    free(h_data);
    return 0;
}
```

---

## 10. Basic Optimization

### 10.1 Block Size Selection

The block size (threads per block) is the most important launch parameter. Guidelines:

```
BLOCK SIZE DECISION TREE:

                   Is problem 1D?
                    /           \
                  Yes            No (2D or 3D)
                   |              |
              Use 128 or 256    Use 16x16 or 32x32
                   |              (must be <= 1024 total)
                   |              |
          Always a multiple      Always a multiple
          of 32 (warp size)      of 32 total threads
```

Rules of thumb:
- **Always a multiple of 32** (warp size). Using 100 threads wastes 28 out of every 128 SIMD lanes (4 warps allocated, 3.125 warps of useful work)
- **128 or 256** is almost always a good choice for 1D kernels
- **512 or 1024** can reduce occupancy due to register pressure
- Use `cudaOccupancyMaxPotentialBlockSize` for automatic selection

### 10.2 Occupancy

Occupancy is the ratio of active warps to the maximum warps an SM can hold. Higher occupancy helps hide memory latency but is not always necessary for peak performance.

```
OCCUPANCY CALCULATION EXAMPLE:

  Device: RTX 3080 (SM 8.6)
  Max warps per SM: 48
  Max threads per SM: 1536
  Max blocks per SM: 16
  Shared memory per SM: 100 KB
  Registers per SM: 65536

  Kernel uses:
    Block size: 256 threads = 8 warps
    Registers per thread: 32
    Shared memory per block: 4 KB

  Limiting factor analysis:
    By threads: floor(1536 / 256) = 6 blocks = 48 warps  (100%)
    By registers: floor(65536 / (256*32)) = 8 blocks      (no limit)
    By shared mem: floor(100 KB / 4 KB) = 25 blocks        (no limit)
    By blocks: 16 blocks max per SM                        (no limit)

  Active blocks: min(6, 8, 25, 16) = 6
  Active warps: 6 * 8 = 48
  Occupancy: 48 / 48 = 100%
```

What if the kernel uses 64 registers per thread?

```
  By registers: floor(65536 / (256*64)) = 4 blocks = 32 warps
  Occupancy drops to: 32 / 48 = 67%
```

Use `--ptxas-options=-v` during compilation to see register usage:

```bash
nvcc --ptxas-options=-v -o program program.cu
# Output includes: Used 32 registers, 4096 bytes smem, ...
```

### 10.3 Warp Divergence

All 32 threads in a warp execute the same instruction at the same time. When threads in a warp take different branches, the warp must execute **both** paths serially, masking inactive threads:

```
WARP DIVERGENCE:

  if (threadIdx.x < 16) {      // Branch A
      doSomething();
  } else {                      // Branch B
      doSomethingElse();
  }

  Execution timeline for one warp:
  +-----------+-----------+
  |  Branch A |  Branch B |
  |  T0-T15   |  T16-T31  |
  |  active   |  idle     |  <-- Step 1: 50% efficiency
  +-----------+-----------+
  |  Branch A |  Branch B |
  |  T0-T15   |  T16-T31  |
  |  idle     |  active   |  <-- Step 2: 50% efficiency
  +-----------+-----------+

  Total cost: time(A) + time(B) instead of max(time(A), time(B))
```

Strategies to minimize divergence:
- Align branches on warp boundaries (multiples of 32)
- Use predication instead of branching for short conditional code
- Restructure data so adjacent threads follow the same path

```cuda
// DIVERGENT: threads 0-15 and 16-31 take different paths
if (threadIdx.x < 16) { doA(); } else { doB(); }

// NON-DIVERGENT: entire warps take one path
if (threadIdx.x / 32 < 1) { doA(); } else { doB(); }
// Warp 0 (threads 0-31) all take branch A
// Warp 1 (threads 32-63) all take branch B
```

### 10.4 Memory Coalescing

When a warp accesses global memory, the hardware combines (coalesces) individual thread requests into a minimal number of cache-line transactions. Coalesced access is critical for performance:

```
COALESCED ACCESS (good):
  Thread 0 reads addr[0]
  Thread 1 reads addr[1]
  Thread 2 reads addr[2]
  ...
  Thread 31 reads addr[31]

  -> One 128-byte cache line transaction (32 floats * 4 bytes)
  -> Full utilization

STRIDED ACCESS (bad):
  Thread 0 reads addr[0]
  Thread 1 reads addr[128]     // stride = 128
  Thread 2 reads addr[256]
  ...

  -> 32 separate cache line transactions!
  -> 32x more memory traffic

RANDOM ACCESS (worst):
  Thread 0 reads addr[hash(0)]
  Thread 1 reads addr[hash(1)]
  ...

  -> Up to 32 separate cache line transactions
  -> Plus wasted bytes in each cache line
```

### 10.5 Optimization Checklist for Beginners

```
LEVEL 1 -- Correctness first:
  [ ] Use CHECK_CUDA macro on ALL CUDA API calls
  [ ] Bounds checking in every kernel (if idx < n)
  [ ] Verify results against CPU reference
  [ ] Block size is a multiple of 32

LEVEL 2 -- Low-hanging fruit:
  [ ] Global memory accesses are coalesced
  [ ] Minimize host-device data transfers
  [ ] Use grid-stride loops for flexibility
  [ ] Use CUDA events for accurate timing (not CPU timers)
  [ ] Use pinned memory for frequent transfers

LEVEL 3 -- After profiling reveals bottlenecks:
  [ ] Use shared memory for data reuse (tiling)
  [ ] Avoid warp divergence where possible
  [ ] Use occupancy API for block size selection
  [ ] Profile with Nsight Compute (ncu)
  [ ] Consider async memory copies with streams
  [ ] Explore warp-level primitives (__shfl_sync)
```

---

## 11. Common Patterns

### 11.1 Element-wise Operations

The simplest GPU pattern. Each thread processes one (or more via grid-stride) independent element.

```cuda
// elementwise.cu
// Demonstrates multiple element-wise operations
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// Device helper functions usable by any kernel
__device__ float sigmoid(float x) {
    return 1.0f / (1.0f + expf(-x));
}

__device__ float relu(float x) {
    return fmaxf(0.0f, x);
}

// Apply ReLU activation to an array
__global__ void reluKernel(float* out, const float* in, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;
    for (int i = idx; i < n; i += stride) {
        out[i] = relu(in[i]);
    }
}

// Apply sigmoid activation to an array
__global__ void sigmoidKernel(float* out, const float* in, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;
    for (int i = idx; i < n; i += stride) {
        out[i] = sigmoid(in[i]);
    }
}

// Fused multiply-add: out = a * x + b (per element)
__global__ void fmaKernel(float* out, const float* x,
                          float a, float b, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;
    for (int i = idx; i < n; i += stride) {
        out[i] = fmaf(a, x[i], b);  // Hardware fused multiply-add
    }
}

int main() {
    const int N = 1 << 20;
    const size_t bytes = N * sizeof(float);

    float* h_in  = (float*)malloc(bytes);
    float* h_out = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) {
        h_in[i] = (float)(i - N/2) / (float)(N/2);  // Range [-1, 1]
    }

    float *d_in, *d_out;
    CHECK_CUDA(cudaMalloc((void**)&d_in,  bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_out, bytes));
    CHECK_CUDA(cudaMemcpy(d_in, h_in, bytes, cudaMemcpyHostToDevice));

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;

    // ReLU
    reluKernel<<<gridSize, blockSize>>>(d_out, d_in, N);
    CHECK_CUDA(cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost));
    printf("ReLU:    in[0]=%.3f -> out=%.3f, in[N-1]=%.3f -> out=%.3f\n",
           h_in[0], h_out[0], h_in[N-1], h_out[N-1]);

    // Sigmoid
    sigmoidKernel<<<gridSize, blockSize>>>(d_out, d_in, N);
    CHECK_CUDA(cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost));
    printf("Sigmoid: in[0]=%.3f -> out=%.3f, in[N-1]=%.3f -> out=%.3f\n",
           h_in[0], h_out[0], h_in[N-1], h_out[N-1]);

    // FMA: 2*x + 0.5
    fmaKernel<<<gridSize, blockSize>>>(d_out, d_in, 2.0f, 0.5f, N);
    CHECK_CUDA(cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost));
    printf("FMA:     in[0]=%.3f -> out=%.3f, in[N-1]=%.3f -> out=%.3f\n",
           h_in[0], h_out[0], h_in[N-1], h_out[N-1]);

    CHECK_CUDA(cudaFree(d_in));
    CHECK_CUDA(cudaFree(d_out));
    free(h_in);
    free(h_out);
    return 0;
}
```

### 11.2 Parallel Reduction

Reduction computes a single value from an array (sum, max, min). This requires inter-thread communication and is the first non-trivial parallel pattern:

```cuda
// reduction.cu
// Parallel sum reduction with multiple optimization levels
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// ---- Version 1: Naive reduction (interleaved addressing) ----
// Problem: warp divergence at every step
__global__ void reduceV1(const float* input, float* output, int n) {
    extern __shared__ float sdata[];

    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    // Load from global to shared memory
    sdata[tid] = (idx < n) ? input[idx] : 0.0f;
    __syncthreads();

    // Reduction in shared memory
    for (int s = 1; s < blockDim.x; s *= 2) {
        if (tid % (2 * s) == 0) {   // <-- DIVERGENT: modulo causes
            sdata[tid] += sdata[tid + s]; // different threads in a warp
        }                                 // to take different paths
        __syncthreads();
    }

    if (tid == 0) {
        output[blockIdx.x] = sdata[0];
    }
}

// ---- Version 2: Sequential addressing (no divergence) ----
__global__ void reduceV2(const float* input, float* output, int n) {
    extern __shared__ float sdata[];

    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    sdata[tid] = (idx < n) ? input[idx] : 0.0f;
    __syncthreads();

    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {              // <-- No divergence: first s threads
            sdata[tid] += sdata[tid + s]; // are contiguous within warps
        }
        __syncthreads();
    }

    if (tid == 0) {
        output[blockIdx.x] = sdata[0];
    }
}

// ---- Version 3: First add during load (halves the blocks needed) ----
__global__ void reduceV3(const float* input, float* output, int n) {
    extern __shared__ float sdata[];

    int tid = threadIdx.x;
    int idx = blockIdx.x * (blockDim.x * 2) + threadIdx.x;

    // Each thread loads and adds two elements
    float val = 0.0f;
    if (idx < n)              val  = input[idx];
    if (idx + blockDim.x < n) val += input[idx + blockDim.x];
    sdata[tid] = val;
    __syncthreads();

    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) {
        output[blockIdx.x] = sdata[0];
    }
}

int main() {
    const int N = 1 << 22;  // ~4 million
    const size_t bytes = N * sizeof(float);

    // Initialize with 1.0f so expected sum = N
    float* h_data = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) h_data[i] = 1.0f;

    float* d_input;
    CHECK_CUDA(cudaMalloc((void**)&d_input, bytes));
    CHECK_CUDA(cudaMemcpy(d_input, h_data, bytes, cudaMemcpyHostToDevice));

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;

    // ---- Two-pass reduction using V2 ----
    float* d_partial;
    CHECK_CUDA(cudaMalloc((void**)&d_partial, gridSize * sizeof(float)));

    // Pass 1: Reduce each block to one value
    reduceV2<<<gridSize, blockSize, blockSize * sizeof(float)>>>(
        d_input, d_partial, N);
    CHECK_CUDA(cudaGetLastError());

    // Pass 2: Reduce partial sums
    float* d_result;
    CHECK_CUDA(cudaMalloc((void**)&d_result, sizeof(float)));

    int gridSize2 = (gridSize + blockSize - 1) / blockSize;
    if (gridSize <= blockSize) {
        reduceV2<<<1, blockSize, blockSize * sizeof(float)>>>(
            d_partial, d_result, gridSize);
    } else {
        // Need a third pass for very large arrays
        float* d_partial2;
        CHECK_CUDA(cudaMalloc((void**)&d_partial2,
                              gridSize2 * sizeof(float)));
        reduceV2<<<gridSize2, blockSize, blockSize * sizeof(float)>>>(
            d_partial, d_partial2, gridSize);
        reduceV2<<<1, blockSize, blockSize * sizeof(float)>>>(
            d_partial2, d_result, gridSize2);
        CHECK_CUDA(cudaFree(d_partial2));
    }

    CHECK_CUDA(cudaDeviceSynchronize());

    float gpuSum;
    CHECK_CUDA(cudaMemcpy(&gpuSum, d_result, sizeof(float),
                          cudaMemcpyDeviceToHost));

    printf("N = %d\n", N);
    printf("Expected sum: %.0f\n", (float)N);
    printf("GPU sum (V2): %.0f\n", gpuSum);
    printf("Match: %s\n",
           (fabsf(gpuSum - (float)N) < 1.0f) ? "YES" : "NO");

    // ---- Timed comparison of first pass only ----
    cudaEvent_t start, stop;
    CHECK_CUDA(cudaEventCreate(&start));
    CHECK_CUDA(cudaEventCreate(&stop));

    // Time V1
    CHECK_CUDA(cudaEventRecord(start));
    reduceV1<<<gridSize, blockSize, blockSize * sizeof(float)>>>(
        d_input, d_partial, N);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));
    float msV1;
    CHECK_CUDA(cudaEventElapsedTime(&msV1, start, stop));

    // Time V2
    CHECK_CUDA(cudaEventRecord(start));
    reduceV2<<<gridSize, blockSize, blockSize * sizeof(float)>>>(
        d_input, d_partial, N);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));
    float msV2;
    CHECK_CUDA(cudaEventElapsedTime(&msV2, start, stop));

    // Time V3
    int gridV3 = (N + blockSize * 2 - 1) / (blockSize * 2);
    CHECK_CUDA(cudaEventRecord(start));
    reduceV3<<<gridV3, blockSize, blockSize * sizeof(float)>>>(
        d_input, d_partial, N);
    CHECK_CUDA(cudaEventRecord(stop));
    CHECK_CUDA(cudaEventSynchronize(stop));
    float msV3;
    CHECK_CUDA(cudaEventElapsedTime(&msV3, start, stop));

    printf("\nReduction first-pass timing (N=%d):\n", N);
    printf("  V1 (divergent):    %.3f ms\n", msV1);
    printf("  V2 (sequential):   %.3f ms\n", msV2);
    printf("  V3 (first-add):    %.3f ms\n", msV3);
    float bw = bytes / msV2 / 1e6;
    printf("  Effective BW (V2): %.1f GB/s\n", bw);

    CHECK_CUDA(cudaEventDestroy(start));
    CHECK_CUDA(cudaEventDestroy(stop));
    CHECK_CUDA(cudaFree(d_input));
    CHECK_CUDA(cudaFree(d_partial));
    CHECK_CUDA(cudaFree(d_result));
    free(h_data);

    return 0;
}
```

```
REDUCTION VISUALIZATION (V2, sequential addressing, blockSize=8):

Initial: sdata = [a0  a1  a2  a3  a4  a5  a6  a7]

Step 1 (s=4): threads 0-3 active
  sdata[0] += sdata[4]    sdata[1] += sdata[5]
  sdata[2] += sdata[6]    sdata[3] += sdata[7]
  sdata = [a0+a4  a1+a5  a2+a6  a3+a7  a4  a5  a6  a7]

Step 2 (s=2): threads 0-1 active
  sdata[0] += sdata[2]    sdata[1] += sdata[3]
  sdata = [a0..a6  a1..a7  a2+a6  a3+a7  ...]

Step 3 (s=1): thread 0 active
  sdata[0] += sdata[1]
  sdata = [SUM  ...]

log2(blockSize) = 3 steps. Each step halves active threads.
```

### 11.3 Scatter and Gather

**Gather**: Multiple threads read from scattered locations, write to contiguous locations.
**Scatter**: Multiple threads read from contiguous locations, write to scattered locations.

```cuda
// scatter_gather.cu
#include <stdio.h>
#include <stdlib.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// GATHER: out[i] = in[indices[i]]
// Reads are scattered, writes are coalesced (preferred pattern)
__global__ void gather(float* out, const float* in,
                       const int* indices, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        out[idx] = in[indices[idx]];
    }
}

// SCATTER: out[indices[i]] = in[i]
// Reads are coalesced, writes are scattered (potential write conflicts)
__global__ void scatter(float* out, const float* in,
                        const int* indices, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        out[indices[idx]] = in[idx];
    }
}

// HISTOGRAM (scatter with atomics to handle write conflicts)
__global__ void histogram(const int* data, int* bins, int n, int numBins) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int stride = blockDim.x * gridDim.x;
    for (int i = idx; i < n; i += stride) {
        int bin = data[i] % numBins;
        atomicAdd(&bins[bin], 1);
    }
}

int main() {
    const int N = 1024;

    // Setup: create a reverse-permutation index array
    int* h_indices = (int*)malloc(N * sizeof(int));
    float* h_in    = (float*)malloc(N * sizeof(float));
    float* h_out   = (float*)malloc(N * sizeof(float));

    for (int i = 0; i < N; i++) {
        h_in[i] = (float)i;
        h_indices[i] = N - 1 - i;  // Reverse permutation
    }

    int *d_indices;
    float *d_in, *d_out;
    CHECK_CUDA(cudaMalloc((void**)&d_indices, N * sizeof(int)));
    CHECK_CUDA(cudaMalloc((void**)&d_in, N * sizeof(float)));
    CHECK_CUDA(cudaMalloc((void**)&d_out, N * sizeof(float)));

    CHECK_CUDA(cudaMemcpy(d_indices, h_indices, N * sizeof(int),
                          cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(d_in, h_in, N * sizeof(float),
                          cudaMemcpyHostToDevice));

    // Gather: reverse the array via index lookup
    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    gather<<<gridSize, blockSize>>>(d_out, d_in, d_indices, N);

    CHECK_CUDA(cudaMemcpy(h_out, d_out, N * sizeof(float),
                          cudaMemcpyDeviceToHost));

    printf("Gather (reverse):\n");
    printf("  in:  [%.0f, %.0f, %.0f, ... %.0f]\n",
           h_in[0], h_in[1], h_in[2], h_in[N-1]);
    printf("  out: [%.0f, %.0f, %.0f, ... %.0f]\n",
           h_out[0], h_out[1], h_out[2], h_out[N-1]);

    // Histogram example
    const int NUM_BINS = 16;
    int* h_data = (int*)malloc(N * sizeof(int));
    int h_bins[16] = {0};
    for (int i = 0; i < N; i++) h_data[i] = i;

    int *d_data, *d_bins;
    CHECK_CUDA(cudaMalloc((void**)&d_data, N * sizeof(int)));
    CHECK_CUDA(cudaMalloc((void**)&d_bins, NUM_BINS * sizeof(int)));
    CHECK_CUDA(cudaMemcpy(d_data, h_data, N * sizeof(int),
                          cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemset(d_bins, 0, NUM_BINS * sizeof(int)));

    histogram<<<gridSize, blockSize>>>(d_data, d_bins, N, NUM_BINS);

    CHECK_CUDA(cudaMemcpy(h_bins, d_bins, NUM_BINS * sizeof(int),
                          cudaMemcpyDeviceToHost));

    printf("\nHistogram (%d bins for data 0..%d):\n  ", NUM_BINS, N - 1);
    for (int i = 0; i < NUM_BINS; i++) {
        printf("bin[%d]=%d ", i, h_bins[i]);
    }
    printf("\n");

    CHECK_CUDA(cudaFree(d_indices));
    CHECK_CUDA(cudaFree(d_in));
    CHECK_CUDA(cudaFree(d_out));
    CHECK_CUDA(cudaFree(d_data));
    CHECK_CUDA(cudaFree(d_bins));
    free(h_indices);
    free(h_in);
    free(h_out);
    free(h_data);

    return 0;
}
```

```
GATHER vs SCATTER:

  GATHER: out[i] = in[map[i]]
  +-------+     +-------+     +-------+
  | map   |     |  in   |     |  out  |
  +-------+     +-------+     +-------+
  | 3     |---->| in[3] |---->| out[0]|  Contiguous writes (good)
  | 0     |---->| in[0] |---->| out[1]|  Scattered reads   (ok, cached)
  | 5     |---->| in[5] |---->| out[2]|
  | 1     |---->| in[1] |---->| out[3]|
  +-------+     +-------+     +-------+

  SCATTER: out[map[i]] = in[i]
  +-------+     +-------+     +-------+
  | in    |     |  map  |     |  out  |
  +-------+     +-------+     +-------+
  | in[0] |     | 3     |---->| out[3]|  Contiguous reads  (good)
  | in[1] |     | 0     |---->| out[0]|  Scattered writes  (risky:
  | in[2] |     | 5     |---->| out[5]|   write conflicts possible)
  | in[3] |     | 1     |---->| out[1]|
  +-------+     +-------+     +-------+

  PREFER GATHER when possible: scattered reads are handled by the cache,
  but scattered writes can cause race conditions requiring atomics.
```

### 11.4 Prefix Sum (Scan)

Prefix sum is a building block for many parallel algorithms (stream compaction, radix sort, histogram equalization). This is a simplified block-level implementation:

```cuda
// prefix_sum.cu
// Block-level inclusive prefix sum (Hillis-Steele algorithm)
#include <stdio.h>
#include <stdlib.h>

#define CHECK_CUDA(call)                                                \
    do {                                                                \
        cudaError_t err = call;                                         \
        if (err != cudaSuccess) {                                       \
            fprintf(stderr, "CUDA error at %s:%d: %s\n",               \
                    __FILE__, __LINE__, cudaGetErrorString(err));        \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

// Inclusive scan within a single block using double buffering
__global__ void inclusiveScanBlock(const float* input, float* output,
                                    int n) {
    extern __shared__ float temp[];  // Needs 2 * blockDim.x floats

    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    // Load input into shared memory (ping-pong buffers)
    int pout = 0, pin = 1;
    temp[tid] = (idx < n) ? input[idx] : 0.0f;
    __syncthreads();

    // Hillis-Steele: log2(blockDim.x) steps
    for (int offset = 1; offset < blockDim.x; offset <<= 1) {
        pout = 1 - pout;
        pin  = 1 - pin;

        if (tid >= offset) {
            temp[pout * blockDim.x + tid] =
                temp[pin * blockDim.x + tid] +
                temp[pin * blockDim.x + tid - offset];
        } else {
            temp[pout * blockDim.x + tid] =
                temp[pin * blockDim.x + tid];
        }
        __syncthreads();
    }

    if (idx < n) {
        output[idx] = temp[pout * blockDim.x + tid];
    }
}

int main() {
    const int N = 16;
    const size_t bytes = N * sizeof(float);

    float h_in[16], h_out[16];
    for (int i = 0; i < N; i++) h_in[i] = 1.0f;  // All ones

    float *d_in, *d_out;
    CHECK_CUDA(cudaMalloc((void**)&d_in,  bytes));
    CHECK_CUDA(cudaMalloc((void**)&d_out, bytes));
    CHECK_CUDA(cudaMemcpy(d_in, h_in, bytes, cudaMemcpyHostToDevice));

    int blockSize = N;
    int sharedBytes = 2 * blockSize * sizeof(float);
    inclusiveScanBlock<<<1, blockSize, sharedBytes>>>(d_in, d_out, N);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());

    CHECK_CUDA(cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost));

    printf("Inclusive prefix sum of all-ones (N=%d):\n", N);
    printf("  Input:  ");
    for (int i = 0; i < N; i++) printf("%.0f ", h_in[i]);
    printf("\n  Output: ");
    for (int i = 0; i < N; i++) printf("%.0f ", h_out[i]);
    printf("\n");

    // Verify
    int errors = 0;
    for (int i = 0; i < N; i++) {
        if (h_out[i] != (float)(i + 1)) errors++;
    }
    printf("  Result: %s\n", errors == 0 ? "PASS" : "FAIL");

    CHECK_CUDA(cudaFree(d_in));
    CHECK_CUDA(cudaFree(d_out));
    return 0;
}
```

Expected output:

```
Inclusive prefix sum of all-ones (N=16):
  Input:  1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
  Output: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16
  Result: PASS
```

### 11.5 Pattern Summary

```
PATTERN              USE CASE                       KEY CONSIDERATION
-----------          --------                       -----------------
Element-wise         Independent per-element ops    Memory-bound; maximize BW
Map                  Transform each element         Same as element-wise
Reduce               Sum, max, min over array       Shared memory tree reduction
Scan (prefix sum)    Running totals, compaction      Double-buffering in shared mem
Stencil              Image filters, PDE solvers     Halo cells in shared memory
Histogram            Counting, binning              Atomics or privatization
Gather               Permutation, lookup tables     Coalesced writes preferred
Scatter              Inverse permutation            Use atomics if conflicts
Transpose            Matrix layout conversion       Shared mem to avoid bank conflicts
Sort                 Radix sort, bitonic sort       Multiple passes of scan+scatter
```

---

## Exercises

### Beginner

1. **Hello Grid**: Write a kernel that prints the 3D coordinates (blockIdx, threadIdx) of every thread in a 2x2x2 grid of 4x4x1 blocks. Predict the output before running.

2. **Array Scaling**: Write a complete CUDA program that multiplies every element of an array by a scalar. Include error checking on all CUDA calls and verification against a CPU reference. Use N = 10,000,000.

3. **Device Report**: Write a program that queries and prints all device properties in a formatted report. Include computed metrics like theoretical bandwidth and peak GFLOPS (SM count * clock rate * FMA ops per clock per SM).

### Intermediate

4. **Vector Operations Library**: Implement add, subtract, element-wise multiply, dot product, and normalize as separate CUDA kernels. Time each against a CPU implementation for N = 1M, 10M, 100M.

5. **Tiled Transpose**: Write a matrix transpose kernel using shared memory to avoid uncoalesced global memory writes. Compare performance against a naive transpose that directly reads rows and writes columns.

6. **Robust Reduction**: Extend the reduction example to handle arrays of arbitrary size (not just powers of 2, larger than a single block can process). Implement both sum and max reductions. Verify against CPU reference for N = 10,000,007 (a prime number).

7. **Image Brightness**: Represent a grayscale image as a 2D array of unsigned chars. Write a kernel to adjust brightness (add a constant, clamped to 0-255). Use 2D thread indexing matching the image dimensions.

### Advanced

8. **Tile Size Sweep**: Implement matrix multiplication with TILE_SIZE = 8, 16, and 32. Measure GFLOPS for matrix sizes 512, 1024, 2048, and 4096. Explain which tile size wins at each matrix size and why.

9. **Multi-Block Prefix Sum**: Implement a multi-block inclusive prefix sum using the three-phase approach: (a) block-level scans, (b) scan of per-block totals, (c) add block offsets back. Verify for N = 10 million. Compare performance against `thrust::inclusive_scan`.

10. **Stream Compaction**: Given an array of integers and a predicate (is_even), produce a compact output array containing only elements satisfying the predicate, preserving order. Use prefix sum as a building block. Compare against `thrust::copy_if`.

---

## Common Mistakes

### Mistake 1: Forgetting Bounds Checks

```cuda
// WRONG: No bounds check -- threads beyond N write to unallocated memory
__global__ void bad(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    data[idx] = 0.0f;  // CRASH or SILENT CORRUPTION if idx >= n
}

// CORRECT: Always guard with bounds check
__global__ void good(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] = 0.0f;
    }
}
```

### Mistake 2: Dereferencing Device Pointers on the Host

```cuda
float* d_ptr;
cudaMalloc((void**)&d_ptr, sizeof(float));

// WRONG: Segfault -- d_ptr points to GPU memory, not CPU memory
float val = *d_ptr;

// CORRECT: Copy the value back with cudaMemcpy
float val;
cudaMemcpy(&val, d_ptr, sizeof(float), cudaMemcpyDeviceToHost);
```

### Mistake 3: Missing cudaDeviceSynchronize

```cuda
kernel<<<grid, block>>>(d_data, N);

// NOTE: cudaMemcpy IS synchronous -- it waits for prior work.
// So this specific case is actually safe:
cudaMemcpy(h_data, d_data, bytes, cudaMemcpyDeviceToHost);

// BUT: if you want to catch execution errors (e.g., out-of-bounds
// access inside the kernel), cudaGetLastError alone is NOT enough:
kernel<<<grid, block>>>(d_data, N);
cudaError_t err = cudaGetLastError();  // Only catches LAUNCH errors

// CORRECT: Synchronize to also catch execution errors
kernel<<<grid, block>>>(d_data, N);
cudaGetLastError();          // Launch errors
cudaDeviceSynchronize();     // Execution errors
```

### Mistake 4: Ignoring CUDA Errors

```cuda
// WRONG: Silent failure -- allocation might fail, copy might corrupt
cudaMalloc(&d_ptr, bytes);
myKernel<<<grid, block>>>(d_ptr, N);
cudaMemcpy(h_ptr, d_ptr, bytes, cudaMemcpyDeviceToHost);

// CORRECT: Check every CUDA API call
CHECK_CUDA(cudaMalloc(&d_ptr, bytes));
myKernel<<<grid, block>>>(d_ptr, N);
CHECK_CUDA(cudaGetLastError());
CHECK_CUDA(cudaMemcpy(h_ptr, d_ptr, bytes, cudaMemcpyDeviceToHost));
```

### Mistake 5: Race Conditions in Shared Memory

```cuda
// WRONG: Reading shared memory before all threads have written
__global__ void bad(float* data) {
    __shared__ float s[256];
    s[threadIdx.x] = data[threadIdx.x];
    // Missing __syncthreads() here!
    float neighbor = s[threadIdx.x + 1];  // RACE CONDITION
}

// CORRECT: Synchronize between writes and reads
__global__ void good(float* data) {
    __shared__ float s[256];
    s[threadIdx.x] = data[threadIdx.x];
    __syncthreads();  // Barrier: all threads have finished writing
    if (threadIdx.x < 255) {
        float neighbor = s[threadIdx.x + 1];  // Safe to read now
    }
}
```

### Mistake 6: Block Size Not a Multiple of 32

```cuda
// WRONG: Wastes SIMD lanes
kernel<<<N/100, 100>>>(data, N);
// 100 threads = 4 warps, last warp is only 4/32 = 12.5% utilized

// CORRECT: Use multiples of 32
kernel<<<N/128, 128>>>(data, N);  // 128 threads = 4 full warps, 100%
```

### Mistake 7: Not Freeing GPU Memory

```cuda
// WRONG: GPU memory leak -- GPU VRAM is limited (8-80 GB)
void processData(const float* input, int n) {
    float* d_temp;
    cudaMalloc(&d_temp, n * sizeof(float));
    kernel<<<grid, block>>>(d_temp, n);
    // d_temp is leaked! Called repeatedly, this exhausts GPU memory.
}

// CORRECT: Always free device allocations
void processData(const float* input, int n) {
    float* d_temp;
    cudaMalloc(&d_temp, n * sizeof(float));
    kernel<<<grid, block>>>(d_temp, n);
    cudaDeviceSynchronize();
    cudaFree(d_temp);
}
```

### Mistake 8: Using Wrong cudaMemcpy Direction

```cuda
// WRONG: Direction enum is backwards -- copies uninitialized GPU memory
// to the host pointer, then the kernel reads uninitialized data
cudaMemcpy(d_input, h_input, bytes, cudaMemcpyDeviceToHost);

// CORRECT: Host to Device means "source is host, destination is device"
cudaMemcpy(d_input, h_input, bytes, cudaMemcpyHostToDevice);
```

### Mistake 9: Integer Overflow in Index Calculations

```cuda
// WRONG: For arrays larger than ~2 billion elements,
// blockIdx.x * blockDim.x overflows a 32-bit int
__global__ void bad(float* data, long long n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    // idx wraps around and accesses wrong memory!
}

// CORRECT: Use 64-bit arithmetic for large arrays
__global__ void good(float* data, long long n) {
    long long idx = (long long)blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] = 0.0f;
    }
}
```

### Mistake 10: Expecting Deterministic Thread Execution Order

```cuda
// WRONG: Assuming block 0 finishes before block 1
__global__ void bad(int* flag, float* data) {
    if (blockIdx.x == 0) {
        data[0] = 42.0f;
        __threadfence();      // Ensure write is visible
        *flag = 1;            // Signal "data is ready"
    }
    if (blockIdx.x == 1) {
        while (*flag == 0);   // Spin-wait -- DEADLOCK if block 0
        float val = data[0];  // has not been scheduled yet!
    }
}

// Blocks execute in UNDEFINED order. Block 1 might run on an SM
// while block 0 is waiting to be scheduled. This is a deadlock.
// Solution: use multiple kernel launches for inter-block dependencies.
```

---

## Summary

This chapter covered the essential building blocks of CUDA programming:

| Topic | Key Takeaway |
|-------|-------------|
| Programming model | Host orchestrates, device executes in massive parallelism |
| Function qualifiers | `__global__` for kernels, `__device__` for GPU helpers, combine `__host__ __device__` for portable code |
| Thread indexing | `blockIdx * blockDim + threadIdx` for global thread ID; use grid-stride loops for large problems |
| Memory management | cudaMalloc/cudaMemcpy/cudaFree with CHECK_CUDA on every call; pinned memory for faster transfers |
| Error handling | CHECK_CUDA macro on all API calls; cudaGetLastError + cudaDeviceSynchronize after kernels |
| Timing | CUDA events record on the GPU timeline; CPU timers measure the wrong thing for async kernels |
| Tiling | Shared memory tiles reduce global memory traffic by TILE_SIZE factor |
| Compilation | nvcc with `-arch=sm_XX` matching your GPU; use `--ptxas-options=-v` to check resource usage |
| Optimization | Block size must be a multiple of 32; coalesced memory access; minimize divergence |
| Common patterns | Element-wise (trivial), reduction (tree in shared mem), scatter/gather (prefer gather), scan (double-buffer) |

With these fundamentals, you are ready for Chapter 5: Advanced CUDA Programming, where we cover streams for concurrent execution, unified memory for simplified programming, cooperative groups for flexible synchronization, warp-level primitives for maximum performance, and the Thrust library for productive GPU programming.
