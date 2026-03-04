# Chapter 5: Advanced CUDA Programming

You know how to launch kernels, manage device memory, and think in grids of threads. Now it is time to unlock the features that separate toy CUDA programs from production-grade GPU code. This chapter covers shared memory, streams, events, unified memory, cooperative groups, warp-level primitives, dynamic parallelism, atomic operations, the Thrust library, and CUDA Graphs. Each section includes complete, compilable code and ASCII diagrams that make the hardware behavior concrete.

---

## Table of Contents

1. [Shared Memory](#1-shared-memory)
2. [CUDA Streams](#2-cuda-streams)
3. [CUDA Events](#3-cuda-events)
4. [Unified Memory](#4-unified-memory)
5. [Cooperative Groups](#5-cooperative-groups)
6. [Warp-Level Primitives](#6-warp-level-primitives)
7. [Dynamic Parallelism](#7-dynamic-parallelism)
8. [Atomic Operations](#8-atomic-operations)
9. [Thrust Library](#9-thrust-library)
10. [CUDA Graphs](#10-cuda-graphs)
11. [Advanced Exercises](#advanced-exercises)
12. [Performance Tips](#performance-tips)

---

## 1. Shared Memory

### 1.1 What Is Shared Memory?

Shared memory is an on-chip SRAM that is private to each Streaming Multiprocessor (SM). It sits between registers (fastest, most limited) and global memory (slowest, largest). Every thread in a block can read and write to the same shared memory space, making it ideal for inter-thread communication and as a user-managed cache.

```
Memory Hierarchy (latency in clock cycles)
+-------------------------------------------------------------------+
|                                                                   |
|  Registers         ~1 cycle      Per-thread, compiler-managed     |
|  +-----------+                                                    |
|  | R0 R1 ... |                                                    |
|  +-----------+                                                    |
|       |                                                           |
|       v                                                           |
|  Shared Memory     ~5 cycles     Per-block, programmer-managed    |
|  +---------------------+                                          |
|  | 48-164 KB per SM     |   <--- THIS CHAPTER'S STAR              |
|  +---------------------+                                          |
|       |                                                           |
|       v                                                           |
|  L1 Cache           ~30 cycles   Per-SM, hardware-managed         |
|  L2 Cache           ~200 cycles  Shared across all SMs            |
|       |                                                           |
|       v                                                           |
|  Global Memory      ~400 cycles  Off-chip DRAM / HBM              |
|  +---------------------+                                          |
|  | 8-80 GB              |                                          |
|  +---------------------+                                          |
|                                                                   |
+-------------------------------------------------------------------+
```

### 1.2 Declaring Shared Memory

There are two ways to allocate shared memory: **static** (size known at compile time) and **dynamic** (size passed at kernel launch).

```cuda
// --------------- Static Shared Memory ---------------
__global__ void staticSharedKernel(float* out, const float* in, int n) {
    // Size fixed at compile time
    __shared__ float tile[256];

    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        tile[threadIdx.x] = in[idx];
    }
    __syncthreads();

    // Every thread in the block can now read any element of tile[]
    if (idx < n) {
        // Example: reverse within the block
        out[idx] = tile[blockDim.x - 1 - threadIdx.x];
    }
}

// --------------- Dynamic Shared Memory ---------------
// Use "extern __shared__" with NO size
extern __shared__ float dynamicTile[];

__global__ void dynamicSharedKernel(float* out, const float* in, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        dynamicTile[threadIdx.x] = in[idx];
    }
    __syncthreads();

    if (idx < n) {
        out[idx] = dynamicTile[blockDim.x - 1 - threadIdx.x];
    }
}

// Launch with dynamic shared memory size (third kernel config param)
// dynamicSharedKernel<<<grid, block, block.x * sizeof(float)>>>(out, in, n);
```

**When to use dynamic**: When tile size depends on a runtime parameter (e.g., block size chosen at launch time), or when you need multiple dynamic arrays.

Multiple dynamic arrays require manual pointer arithmetic:

```cuda
extern __shared__ char sharedBuf[];

__global__ void multiDynamic(float* a, int* b, int n) {
    // Partition the raw byte buffer manually
    float* sharedA = (float*)sharedBuf;
    int*   sharedB = (int*)(sharedBuf + blockDim.x * sizeof(float));

    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        sharedA[threadIdx.x] = a[idx];
        sharedB[threadIdx.x] = (int)a[idx];
    }
    __syncthreads();

    // ... use sharedA and sharedB ...
}

// Launch: total dynamic shared = blockDim.x * (sizeof(float) + sizeof(int))
```

### 1.3 Bank Conflicts

Shared memory is divided into **32 banks** (matching the warp size of 32 threads). Consecutive 4-byte words map to consecutive banks.

```
Shared Memory Banks (32 banks, 4 bytes per bank per row)
+------+------+------+------+------+------+     +------+
|Bank 0|Bank 1|Bank 2|Bank 3|Bank 4|Bank 5| ... |Bank31|
+------+------+------+------+------+------+     +------+
|Addr 0|Addr 1|Addr 2|Addr 3|Addr 4|Addr 5| ... |Addr31|   Row 0
|Addr32|Addr33|Addr34|Addr35|Addr36|Addr37| ... |Addr63|   Row 1
|Addr64|Addr65|Addr66|Addr67|Addr68|Addr69| ... |Addr95|   Row 2
|  ... |  ... |  ... |  ... |  ... |  ... | ... |  ... |
+------+------+------+------+------+------+     +------+

Bank assignment: bank = (address / 4) % 32
```

A **bank conflict** occurs when two or more threads in the same warp access different rows of the same bank in the same cycle. The hardware serializes the accesses.

```
NO CONFLICT: Each thread accesses a different bank
Thread: T0    T1    T2    T3   ...  T31
         |     |     |     |         |
         v     v     v     v         v
Bank:  [B0]  [B1]  [B2]  [B3] ... [B31]
         => 1 cycle (fully parallel)

2-WAY BANK CONFLICT: Two threads hit the same bank, different rows
Thread: T0    T1    T2    T3   ...
         |     |     |           |
         v     v     v           v
Bank:  [B0]  [B1]  [B0]  [B3] ...
         ^           ^
         |           |
       Row 0       Row 1    => 2 cycles (serialized)

BROADCAST (NO CONFLICT): Multiple threads read the SAME address
Thread: T0    T1    T2    T3   ...
         \     |     /    |
          v    v    v     v
Bank:    [B0] [B1]       [B3] ...
         (all read same address in B0 => broadcast, 1 cycle)
```

**Common patterns that cause conflicts:**

```cuda
// STRIDE-1 access: NO conflicts (ideal)
__shared__ float s[256];
float val = s[threadIdx.x];           // T0->B0, T1->B1, ... T31->B31

// STRIDE-2 access: 2-way bank conflict
float val = s[2 * threadIdx.x];      // T0->B0, T1->B2, ..., T16->B0 CONFLICT!

// STRIDE-32 access: 32-way bank conflict (worst case)
float val = s[32 * threadIdx.x];     // All threads hit Bank 0!
```

**How to avoid bank conflicts:**

1. Use stride-1 access patterns whenever possible.
2. Pad arrays to break stride patterns: `__shared__ float s[32][33];` instead of `s[32][32]`.
3. Rearrange data layout so threads in a warp access consecutive addresses.

```cuda
// PROBLEM: Column access in a 32x32 matrix causes 32-way bank conflict
__shared__ float matrix[32][32];
float val = matrix[threadIdx.x][col];  // stride-32 across rows => all same bank

// SOLUTION: Pad each row by 1 element
__shared__ float matrix[32][33];       // 33 columns, not 32
float val = matrix[threadIdx.x][col];  // stride-33 => different banks!
```

```
Without padding (32 columns):
         Col 0    Col 1    ...  Col 31
Row 0:   Bank 0   Bank 1   ...  Bank 31
Row 1:   Bank 0   Bank 1   ...  Bank 31   <-- Column access = same bank!
Row 2:   Bank 0   Bank 1   ...  Bank 31
  ...

With padding (33 columns):
         Col 0    Col 1    ...  Col 31   [PAD]
Row 0:   Bank 0   Bank 1   ...  Bank 31  Bank 0
Row 1:   Bank 1   Bank 2   ...  Bank 0   Bank 1   <-- Shifted by 1!
Row 2:   Bank 2   Bank 3   ...  Bank 1   Bank 2   <-- Shifted by 2!
  ...
Column access now hits DIFFERENT banks per row => no conflict
```

### 1.4 Matrix Multiply with Shared Memory Tiling

This is the canonical example of shared memory usage. Without shared memory, each element of the output matrix requires reading an entire row and column from global memory. With tiling, we load small tiles into shared memory and reuse them across threads.

**The problem**: Multiply two NxN matrices A and B, storing the result in C.

```
C[row][col] = sum over k of A[row][k] * B[k][col]

Naive approach: Each thread computes one element of C
  - Reads N elements from A (one row)
  - Reads N elements from B (one column)
  - Total global memory reads per thread: 2N
  - Total across all N^2 threads: 2N^3 reads from global memory
```

**The tiling idea**: Break the computation into TILE_SIZE x TILE_SIZE tiles. Load one tile of A and one tile of B into shared memory. All threads in the block reuse these tiles.

```
Matrix multiplication tiling (TILE_SIZE = 4 for illustration)

Matrix A (8x8)              Matrix B (8x8)
+----+----+                 +----+----+
| A0 | A1 |                 | B0 | B1 |
+----+----+                 +----+----+
| A2 | A3 |                 | B2 | B3 |
+----+----+                 +----+----+

To compute the top-left 4x4 tile of C:
  C_tile = A0 * B0 + A1 * B2

Step 1: Load A0 and B0 into shared memory, multiply, accumulate
Step 2: Load A1 and B2 into shared memory, multiply, accumulate

Each tile is loaded ONCE from global memory but used by ALL threads in the block.

Memory savings:
  - Without tiling: Each thread reads 2*N values from global mem
  - With tiling:    Each thread reads 2*N/TILE_SIZE values from global mem
  - Speedup factor: TILE_SIZE (e.g., 32x fewer global reads)
```

**Step-by-step execution for one block:**

```
Block (0,0) computes C[0..TILE-1][0..TILE-1]

Phase 0 (m=0):
  1. Each thread loads: tileA[ty][tx] = A[row][tx + 0*TILE]
                        tileB[ty][tx] = B[ty + 0*TILE][col]
  2. __syncthreads()   // All threads done loading
  3. For k=0..TILE-1:  sum += tileA[ty][k] * tileB[k][tx]
  4. __syncthreads()   // Safe to overwrite tiles

Phase 1 (m=1):
  1. Each thread loads: tileA[ty][tx] = A[row][tx + 1*TILE]
                        tileB[ty][tx] = B[ty + 1*TILE][col]
  2. __syncthreads()
  3. For k=0..TILE-1:  sum += tileA[ty][k] * tileB[k][tx]
  4. __syncthreads()

... repeat for all phases ...

Final: C[row][col] = sum
```

**Complete implementation:**

```cuda
#include <cuda_runtime.h>
#include <cstdio>

#define TILE_SIZE 32

__global__ void matMulShared(const float* A, const float* B, float* C,
                              int M, int N, int K) {
    // A is MxK, B is KxN, C is MxN
    __shared__ float tileA[TILE_SIZE][TILE_SIZE];
    __shared__ float tileB[TILE_SIZE][TILE_SIZE];

    int row = blockIdx.y * TILE_SIZE + threadIdx.y;
    int col = blockIdx.x * TILE_SIZE + threadIdx.x;

    float sum = 0.0f;

    // Loop over tiles along the K dimension
    int numTiles = (K + TILE_SIZE - 1) / TILE_SIZE;
    for (int m = 0; m < numTiles; m++) {
        // Collaborative loading: each thread loads one element of each tile
        int aCol = m * TILE_SIZE + threadIdx.x;
        int bRow = m * TILE_SIZE + threadIdx.y;

        // Bounds checking for non-square / non-tile-aligned matrices
        tileA[threadIdx.y][threadIdx.x] =
            (row < M && aCol < K) ? A[row * K + aCol] : 0.0f;
        tileB[threadIdx.y][threadIdx.x] =
            (bRow < N && col < N) ? B[bRow * N + col] : 0.0f;

        __syncthreads();  // Wait for all threads to finish loading

        // Compute partial dot product for this tile
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += tileA[threadIdx.y][k] * tileB[k][threadIdx.x];
        }

        __syncthreads();  // Wait before loading next tile
    }

    // Write result
    if (row < M && col < N) {
        C[row * N + col] = sum;
    }
}

int main() {
    const int M = 1024, N = 1024, K = 1024;
    size_t sizeA = M * K * sizeof(float);
    size_t sizeB = K * N * sizeof(float);
    size_t sizeC = M * N * sizeof(float);

    // Allocate host memory
    float *h_A = (float*)malloc(sizeA);
    float *h_B = (float*)malloc(sizeB);
    float *h_C = (float*)malloc(sizeC);

    // Initialize with test data
    for (int i = 0; i < M * K; i++) h_A[i] = 1.0f;
    for (int i = 0; i < K * N; i++) h_B[i] = 1.0f;

    // Allocate device memory
    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, sizeA);
    cudaMalloc(&d_B, sizeB);
    cudaMalloc(&d_C, sizeC);

    // Copy to device
    cudaMemcpy(d_A, h_A, sizeA, cudaMemcpyHostToDevice);
    cudaMemcpy(d_B, h_B, sizeB, cudaMemcpyHostToDevice);

    // Launch kernel
    dim3 block(TILE_SIZE, TILE_SIZE);
    dim3 grid((N + TILE_SIZE - 1) / TILE_SIZE,
              (M + TILE_SIZE - 1) / TILE_SIZE);
    matMulShared<<<grid, block>>>(d_A, d_B, d_C, M, N, K);

    // Copy result back
    cudaMemcpy(h_C, d_C, sizeC, cudaMemcpyDeviceToHost);

    // Verify: each element should be K (= 1024)
    printf("C[0][0] = %f (expected %f)\n", h_C[0], (float)K);
    printf("C[511][511] = %f (expected %f)\n", h_C[511 * N + 511], (float)K);

    // Cleanup
    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    free(h_A); free(h_B); free(h_C);
    return 0;
}
```

**Why the two `__syncthreads()` calls are critical:**

```
Thread 0 loads tileA[0][0]         Thread 15 loads tileA[0][15]
        |                                     |
        v                                     v
  __syncthreads()  <--- BARRIER: ensures ALL loading is complete
        |
        v
Thread 0 reads tileA[0][0..31]    // Safe: all elements loaded
Thread 0 reads tileB[0..31][0]    // Safe: all elements loaded
        |
        v
  __syncthreads()  <--- BARRIER: ensures ALL computation done
        |                         before we overwrite tiles in next phase
        v
Thread 0 loads tileA[0][0] = NEW DATA  // Safe: no one still reading old data
```

---

## 2. CUDA Streams

### 2.1 What Are Streams?

A CUDA **stream** is a sequence of operations (kernel launches, memory copies, etc.) that execute in order. Operations in different streams can execute concurrently, enabling overlap of computation and data transfer.

```
Default behavior (single stream): Everything is sequential

Time --->
+------------------+------------------+------------------+
| H2D Copy         | Kernel Execution | D2H Copy         |
+------------------+------------------+------------------+
         GPU is idle      GPU is busy       GPU is idle

With streams: Operations overlap

Stream 1: |--H2D--|---------Kernel---------|--D2H--|
Stream 2:         |--H2D--|---------Kernel---------|--D2H--|
Stream 3:                  |--H2D--|---------Kernel---------|--D2H--|
                  ^^^^^^^^^                         ^^^^^^^^
                  Overlap: H2D of stream 2 runs     Overlap: D2H of stream 1
                  while Kernel of stream 1 runs     while Kernel of stream 2 runs
```

### 2.2 The Default Stream

When you do not specify a stream, operations go into the **default stream** (also called the NULL stream or stream 0). The default stream has special synchronization behavior: it waits for all other streams to complete and blocks all other streams until it finishes.

```cuda
// These all use the default stream (sequential)
cudaMemcpy(d_a, h_a, size, cudaMemcpyHostToDevice);  // Blocks until done
myKernel<<<grid, block>>>(d_a, d_b, n);               // Waits for memcpy
cudaMemcpy(h_b, d_b, size, cudaMemcpyDeviceToHost);   // Waits for kernel
```

### 2.3 Creating and Using Non-Default Streams

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void processChunk(float* out, const float* in, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        // Simulate work: some expensive computation
        float val = in[idx];
        for (int i = 0; i < 100; i++) {
            val = sinf(val) * cosf(val) + val;
        }
        out[idx] = val;
    }
}

int main() {
    const int N = 1 << 22;          // 4M elements
    const int NUM_STREAMS = 4;
    const int CHUNK = N / NUM_STREAMS;
    size_t chunkBytes = CHUNK * sizeof(float);

    // Allocate PINNED host memory (required for async transfers!)
    float *h_in, *h_out;
    cudaMallocHost(&h_in,  N * sizeof(float));
    cudaMallocHost(&h_out, N * sizeof(float));

    // Initialize input
    for (int i = 0; i < N; i++) h_in[i] = (float)i;

    // Allocate device memory
    float *d_in, *d_out;
    cudaMalloc(&d_in,  N * sizeof(float));
    cudaMalloc(&d_out, N * sizeof(float));

    // Create streams
    cudaStream_t streams[NUM_STREAMS];
    for (int i = 0; i < NUM_STREAMS; i++) {
        cudaStreamCreate(&streams[i]);
    }

    // Launch overlapping work in each stream
    int threadsPerBlock = 256;
    int blocksPerGrid = (CHUNK + threadsPerBlock - 1) / threadsPerBlock;

    for (int i = 0; i < NUM_STREAMS; i++) {
        int offset = i * CHUNK;

        // Async H2D copy in stream i
        cudaMemcpyAsync(d_in + offset, h_in + offset, chunkBytes,
                        cudaMemcpyHostToDevice, streams[i]);

        // Kernel launch in stream i
        processChunk<<<blocksPerGrid, threadsPerBlock, 0, streams[i]>>>(
            d_out + offset, d_in + offset, CHUNK);

        // Async D2H copy in stream i
        cudaMemcpyAsync(h_out + offset, d_out + offset, chunkBytes,
                        cudaMemcpyDeviceToHost, streams[i]);
    }

    // Wait for all streams to complete
    cudaDeviceSynchronize();

    printf("Output[0] = %f, Output[%d] = %f\n", h_out[0], N - 1, h_out[N - 1]);

    // Cleanup
    for (int i = 0; i < NUM_STREAMS; i++) {
        cudaStreamDestroy(streams[i]);
    }
    cudaFree(d_in);
    cudaFree(d_out);
    cudaFreeHost(h_in);
    cudaFreeHost(h_out);

    return 0;
}
```

**Critical requirement**: Async memory copies require **pinned (page-locked) host memory** allocated with `cudaMallocHost()` or `cudaHostAlloc()`. Regular `malloc()` memory will silently fall back to synchronous behavior.

### 2.4 Execution Timeline with Streams

```
4-stream pipeline on a GPU with 1 copy engine + 1 compute engine:

Time --->

Copy Engine:  |H2D_0|H2D_1|H2D_2|H2D_3|      |D2H_0|D2H_1|D2H_2|D2H_3|
              +-----+-----+-----+-----+      +-----+-----+-----+-----+
Compute:            |  K0  |  K1  |  K2  | K3  |
                    +------+------+------+-----+

With 2 copy engines (modern GPUs support bidirectional DMA):

Copy H2D:    |H2D_0|H2D_1|H2D_2|H2D_3|
             +-----+-----+-----+-----+
Compute:           |  K0  |  K1  |  K2  | K3  |
                   +------+------+------+-----+
Copy D2H:                 |D2H_0|D2H_1|D2H_2|D2H_3|
                          +-----+-----+-----+-----+

Maximum overlap: H2D, Compute, and D2H all happen simultaneously!
```

### 2.5 Stream Synchronization

```cuda
// Wait for a specific stream
cudaStreamSynchronize(stream1);   // Block host until stream1 is done

// Wait for all streams on the device
cudaDeviceSynchronize();          // Block host until ALL device work is done

// Non-blocking query: has the stream finished?
cudaError_t status = cudaStreamQuery(stream1);
if (status == cudaSuccess) {
    // Stream is done
} else if (status == cudaErrorNotReady) {
    // Stream still has pending work
}
```

### 2.6 Stream Callbacks

Stream callbacks let you execute a host function when all preceding work in a stream completes.

```cuda
void CUDART_CB myCallback(cudaStream_t stream, cudaError_t status, void* userData) {
    int chunkId = *(int*)userData;
    printf("Stream callback: Chunk %d processing complete (status: %d)\n",
           chunkId, status);
}

// Usage:
int chunkIds[4] = {0, 1, 2, 3};
for (int i = 0; i < 4; i++) {
    cudaMemcpyAsync(/* ... */, streams[i]);
    myKernel<<<grid, block, 0, streams[i]>>>(/* ... */);
    cudaStreamAddCallback(streams[i], myCallback, &chunkIds[i], 0);
}
```

**Note**: As of CUDA 12, `cudaLaunchHostFunc` is the preferred replacement for `cudaStreamAddCallback`. It has cleaner semantics and works with CUDA Graphs.

```cuda
void myHostFunc(void* userData) {
    int chunkId = *(int*)userData;
    printf("Chunk %d done!\n", chunkId);
}

cudaLaunchHostFunc(stream, myHostFunc, &chunkId);
```

### 2.7 Stream Priorities

Streams can have priorities, allowing important work to preempt less important work.

```cuda
int leastPriority, greatestPriority;
cudaDeviceGetStreamPriorityRange(&leastPriority, &greatestPriority);
// leastPriority is the lowest priority (highest number)
// greatestPriority is the highest priority (lowest number, often 0 or negative)

cudaStream_t highPriorityStream, lowPriorityStream;
cudaStreamCreateWithPriority(&highPriorityStream, cudaStreamNonBlocking,
                              greatestPriority);
cudaStreamCreateWithPriority(&lowPriorityStream, cudaStreamNonBlocking,
                              leastPriority);
```

---

## 3. CUDA Events

### 3.1 Events for Timing

CUDA events are lightweight markers placed in streams. Their primary uses are precise GPU timing and inter-stream synchronization.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void heavyKernel(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        float val = data[idx];
        for (int i = 0; i < 1000; i++) {
            val = sqrtf(val * val + 1.0f);
        }
        data[idx] = val;
    }
}

int main() {
    const int N = 1 << 20;
    float *d_data;
    cudaMalloc(&d_data, N * sizeof(float));

    // Create events
    cudaEvent_t start, stop;
    cudaEventCreate(&start);
    cudaEventCreate(&stop);

    // Record start event in the default stream
    cudaEventRecord(start, 0);

    // Launch kernel
    heavyKernel<<<(N + 255) / 256, 256>>>(d_data, N);

    // Record stop event
    cudaEventRecord(stop, 0);

    // Wait for stop event to complete
    cudaEventSynchronize(stop);

    // Calculate elapsed time in milliseconds
    float milliseconds = 0.0f;
    cudaEventElapsedTime(&milliseconds, start, stop);

    printf("Kernel execution time: %.3f ms\n", milliseconds);

    // Cleanup
    cudaEventDestroy(start);
    cudaEventDestroy(stop);
    cudaFree(d_data);
    return 0;
}
```

```
Event timing diagram:

Stream: |----[start]----kernel execution----[stop]----|
                |                              |
                +--- cudaEventElapsedTime() ---+
                         = X.XXX ms
```

**Why not use `clock()` or `std::chrono`?** Host-side timers include kernel launch overhead and are unreliable for measuring GPU work. CUDA events measure time on the GPU clock itself.

### 3.2 Inter-Stream Synchronization with Events

Events enable fine-grained dependencies between streams without synchronizing the entire device.

```cuda
cudaStream_t streamA, streamB;
cudaStreamCreate(&streamA);
cudaStreamCreate(&streamB);

cudaEvent_t dataReady;
cudaEventCreate(&dataReady);

// Stream A: produce data
kernelProducer<<<grid, block, 0, streamA>>>(d_output);
cudaEventRecord(dataReady, streamA);  // Mark when producer is done

// Stream B: wait for data, then consume it
cudaStreamWaitEvent(streamB, dataReady, 0);  // B waits for A's event
kernelConsumer<<<grid, block, 0, streamB>>>(d_output);
```

```
Dependency diagram:

Stream A: |--producer--|--[dataReady]--...other work A...|
                              |
                              v  (dependency)
Stream B: |...independent B...|----consumer----|

Stream B's consumer kernel will NOT start until the dataReady event
in Stream A has been recorded (i.e., producer is done).
Stream B's independent work before the wait can still proceed freely.
```

### 3.3 Event Flags

```cuda
// Default: timing enabled, blocking synchronization
cudaEventCreate(&event);

// Disable timing (slightly faster to record/query)
cudaEventCreateWithFlags(&event, cudaEventDisableTiming);

// Blocking sync: host thread yields CPU while waiting (saves power)
cudaEventCreateWithFlags(&event, cudaEventBlockingSync);

// Interprocess: event can be shared across processes (multi-GPU)
cudaEventCreateWithFlags(&event, cudaEventInterprocess);
```

### 3.4 Complete Example: Pipeline with Events

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void stepA(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] = data[idx] * 2.0f;
}

__global__ void stepB(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] = data[idx] + 1.0f;
}

__global__ void combine(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) c[idx] = a[idx] + b[idx];
}

int main() {
    const int N = 1 << 20;
    size_t bytes = N * sizeof(float);

    float *d_a, *d_b, *d_c;
    cudaMalloc(&d_a, bytes);
    cudaMalloc(&d_b, bytes);
    cudaMalloc(&d_c, bytes);

    cudaStream_t s1, s2, s3;
    cudaStreamCreate(&s1);
    cudaStreamCreate(&s2);
    cudaStreamCreate(&s3);

    cudaEvent_t aDone, bDone;
    cudaEventCreate(&aDone);
    cudaEventCreate(&bDone);

    dim3 block(256);
    dim3 grid((N + 255) / 256);

    // Stream 1: Process path A
    stepA<<<grid, block, 0, s1>>>(d_a, N);
    cudaEventRecord(aDone, s1);

    // Stream 2: Process path B (independent of A)
    stepB<<<grid, block, 0, s2>>>(d_b, N);
    cudaEventRecord(bDone, s2);

    // Stream 3: Wait for BOTH, then combine
    cudaStreamWaitEvent(s3, aDone, 0);
    cudaStreamWaitEvent(s3, bDone, 0);
    combine<<<grid, block, 0, s3>>>(d_a, d_b, d_c, N);

    cudaDeviceSynchronize();

    // Cleanup
    cudaEventDestroy(aDone);
    cudaEventDestroy(bDone);
    cudaStreamDestroy(s1);
    cudaStreamDestroy(s2);
    cudaStreamDestroy(s3);
    cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
    return 0;
}
```

```
Execution DAG:

   stepA (Stream 1)       stepB (Stream 2)
        \                     /
    [aDone]              [bDone]
          \               /
           v             v
        combine (Stream 3)

stepA and stepB run in parallel.
combine waits for both to finish.
```

---

## 4. Unified Memory

### 4.1 What Is Unified Memory?

Unified Memory creates a single address space that is accessible from both CPU and GPU. The CUDA runtime automatically migrates pages between host and device memory on demand.

```
Traditional explicit memory management:
+----------+          cudaMemcpy          +----------+
| Host Mem |  ========================>  | Dev Mem  |
| (h_data) |  <========================  | (d_data) |
+----------+   Programmer manages both   +----------+
                  and all transfers

Unified Memory:
+---------------------------------------------------+
|              Unified Address Space                  |
|                                                   |
|  +------+    Page Migration (automatic)  +------+ |
|  | CPU  | <============================> | GPU  | |
|  | Pages|    (demand-paged by driver)    |Pages | |
|  +------+                                +------+ |
|                                                   |
|  Both CPU and GPU use the SAME pointer!           |
+---------------------------------------------------+
```

### 4.2 Basic Usage

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void addOne(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] += 1.0f;
    }
}

int main() {
    const int N = 1 << 20;
    float* data;

    // Allocate unified memory -- accessible from both host and device
    cudaMallocManaged(&data, N * sizeof(float));

    // Initialize on the CPU (no cudaMemcpy needed!)
    for (int i = 0; i < N; i++) {
        data[i] = (float)i;
    }

    // Launch kernel -- pages automatically migrate to GPU
    addOne<<<(N + 255) / 256, 256>>>(data, N);

    // Wait for kernel to finish
    cudaDeviceSynchronize();

    // Access on CPU -- pages automatically migrate back
    printf("data[0] = %f (expected 1.0)\n", data[0]);
    printf("data[42] = %f (expected 43.0)\n", data[42]);

    cudaFree(data);
    return 0;
}
```

### 4.3 Page Migration Under the Hood

```
Page fault-driven migration:

1. CPU writes to data[0]:
   Page is on host -> direct write, no fault

2. GPU kernel reads data[0]:
   Page is NOT on GPU -> PAGE FAULT
   -> Driver migrates page from host to device
   -> Kernel retries the access -> success

3. CPU reads data[0] after cudaDeviceSynchronize():
   Page is NOT on host -> PAGE FAULT
   -> Driver migrates page from device to host
   -> CPU retries the access -> success

Page migration granularity: typically 4 KB or 64 KB (GPU page size)
```

### 4.4 Prefetching: Avoiding Page Fault Overhead

Page faults are expensive. Prefetching moves data proactively, eliminating faults during kernel execution.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void process(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        data[idx] = sqrtf(data[idx]);
    }
}

int main() {
    const int N = 1 << 22;
    size_t bytes = N * sizeof(float);
    float* data;

    cudaMallocManaged(&data, bytes);

    // Initialize on CPU
    for (int i = 0; i < N; i++) data[i] = (float)(i + 1);

    int device = 0;
    cudaGetDevice(&device);

    // Prefetch data to GPU BEFORE kernel launch
    cudaMemPrefetchAsync(data, bytes, device, 0);

    process<<<(N + 255) / 256, 256>>>(data, N);

    // Prefetch back to CPU BEFORE host access
    cudaMemPrefetchAsync(data, bytes, cudaCpuDeviceId, 0);

    cudaDeviceSynchronize();

    printf("data[0] = %f (expected 1.0)\n", data[0]);

    cudaFree(data);
    return 0;
}
```

```
Without prefetching:
GPU Kernel: |--fault--compute--fault--compute--fault--compute--|
            Stalls on every new page => SLOW

With prefetching:
Prefetch:   |========= all pages migrated =========|
GPU Kernel:                                         |--compute--compute--compute--|
            No faults => FAST
```

### 4.5 Memory Advise

`cudaMemAdvise` gives the runtime hints about access patterns, enabling smarter page placement.

```cuda
int device;
cudaGetDevice(&device);

// Hint: data will be mostly read by GPU, rarely written
// The driver will keep a read-only copy on the GPU
cudaMemAdvise(data, bytes, cudaMemAdviseSetReadMostly, device);

// Hint: data will be accessed primarily by this device
// Pages prefer to reside on the specified device
cudaMemAdvise(data, bytes, cudaMemAdviseSetPreferredLocation, device);

// Hint: this device will access the data (creates direct mapping if possible)
// Avoids migration by mapping remote memory directly
cudaMemAdvise(data, bytes, cudaMemAdviseSetAccessedBy, device);

// Remove hints
cudaMemAdvise(data, bytes, cudaMemAdviseUnsetReadMostly, device);
```

### 4.6 When to Use Unified Memory vs. Explicit Management

```
+-----------------------------+--------------------------------+
| Use Unified Memory When     | Use Explicit Management When   |
+-----------------------------+--------------------------------+
| Prototyping / rapid dev     | Maximum performance required   |
| Complex data structures     | Data transfer patterns known   |
|   (linked lists, trees)     |   and can be optimized         |
| Irregular access patterns   | Latency-critical applications  |
| Data shared between CPU/GPU | Large, predictable bulk xfers  |
|   with unclear ownership    | Multi-GPU without NVLink       |
| First-pass GPU porting      | Production HPC code            |
+-----------------------------+--------------------------------+

Performance comparison (typical):
  Explicit cudaMemcpy:    ~12 GB/s (PCIe 4.0 x16)
  Unified mem + prefetch: ~11 GB/s (nearly identical)
  Unified mem (faulting): ~2-5 GB/s (page fault overhead)
```

---

## 5. Cooperative Groups

### 5.1 Why Cooperative Groups?

Traditional CUDA gives you exactly two synchronization scopes: `__syncthreads()` for a block and `cudaDeviceSynchronize()` for the entire device (from the host). Cooperative Groups, introduced in CUDA 9, provide flexible, composable thread groups at any granularity.

```
Traditional synchronization scopes:
+---------------------------------------------------------------+
|                         Grid                                    |
|  +------------------+  +------------------+                    |
|  |     Block 0       |  |     Block 1       |                    |
|  | __syncthreads()   |  | __syncthreads()   |   No way to      |
|  | works here        |  | works here        |   sync ACROSS     |
|  +------------------+  +------------------+   blocks on GPU!   |
+---------------------------------------------------------------+

Cooperative Groups scopes:
+---------------------------------------------------------------+
|  grid_group g = this_grid();     <-- grid-level sync!          |
|  g.sync();                                                     |
|  +------------------+  +------------------+                    |
|  | thread_block tb;  |  | thread_block tb;  |                    |
|  | tb.sync();        |  | tb.sync();        |                    |
|  |  +------+------+  |  |  +------+------+  |                    |
|  |  |tile_0|tile_1|  |  |  |tile_0|tile_1|  |                    |
|  |  |.sync |.sync |  |  |  |.sync |.sync |  |                    |
|  |  +------+------+  |  |  +------+------+  |                    |
|  +------------------+  +------------------+                    |
+---------------------------------------------------------------+
```

### 5.2 Thread Group Types

```cuda
#include <cooperative_groups.h>
namespace cg = cooperative_groups;

__global__ void cooperativeDemo(float* data, int n) {
    // 1. This thread block (equivalent to using __syncthreads)
    cg::thread_block block = cg::this_thread_block();
    block.sync();  // Same as __syncthreads()

    // 2. Tiled partition: split block into fixed-size groups
    cg::thread_block_tile<32> warp = cg::tiled_partition<32>(block);
    // warp.size() == 32
    // warp.thread_rank() == lane ID within the warp
    warp.sync();  // Sync just this warp

    cg::thread_block_tile<16> halfWarp = cg::tiled_partition<16>(block);
    halfWarp.sync();  // Sync just 16 threads

    // 3. Coalesced group: threads that are active after a divergent branch
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx % 3 == 0) {
        // Only 1/3 of threads enter here
        cg::coalesced_group active = cg::coalesced_threads();
        // active.size() == number of active threads
        // active.thread_rank() == rank within the active set
        active.sync();
    }
}
```

### 5.3 Grid-Level Synchronization

Grid-level sync lets all blocks on the GPU synchronize, enabling algorithms that were previously impossible in a single kernel launch.

```cuda
#include <cooperative_groups.h>
namespace cg = cooperative_groups;

__global__ void gridSyncKernel(float* data, int n, int numIterations) {
    cg::grid_group grid = cg::this_grid();

    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    for (int iter = 0; iter < numIterations; iter++) {
        // Phase 1: Each thread updates its element
        if (idx < n) {
            data[idx] = data[idx] * 0.5f + 1.0f;
        }

        // Grid-wide barrier: ALL blocks wait here
        grid.sync();

        // Phase 2: Read neighbors (safe because all updates are visible)
        if (idx > 0 && idx < n - 1) {
            float left  = data[idx - 1];
            float right = data[idx + 1];
            data[idx] = (left + data[idx] + right) / 3.0f;
        }

        grid.sync();  // Ensure phase 2 complete before next iteration
    }
}
```

**Launching cooperative kernels** requires a special launch API:

```cuda
#include <cuda_runtime.h>
#include <cooperative_groups.h>

int main() {
    const int N = 1 << 20;
    float* d_data;
    cudaMalloc(&d_data, N * sizeof(float));

    // Query max blocks for cooperative launch
    int blockSize = 256;
    int numBlocksPerSM;
    cudaOccupancyMaxActiveBlocksPerMultiprocessor(
        &numBlocksPerSM, gridSyncKernel, blockSize, 0);

    int deviceId;
    cudaGetDevice(&deviceId);
    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, deviceId);

    int numBlocks = numBlocksPerSM * prop.multiProcessorCount;
    // Ensure we don't launch more blocks than needed
    numBlocks = min(numBlocks, (N + blockSize - 1) / blockSize);

    int numIterations = 10;
    void* args[] = { &d_data, &N, &numIterations };

    // Cooperative launch: all blocks MUST be resident simultaneously
    cudaLaunchCooperativeKernel(
        (void*)gridSyncKernel,
        dim3(numBlocks), dim3(blockSize),
        args
    );

    cudaDeviceSynchronize();
    cudaFree(d_data);
    return 0;
}
```

### 5.4 Flexible Reduction with Cooperative Groups

```cuda
#include <cooperative_groups.h>
namespace cg = cooperative_groups;

// Generic reduction that works at any group granularity
template <typename Group>
__device__ float groupReduce(Group g, float val) {
    // Shared memory for this block
    extern __shared__ float shmem[];

    int lane = g.thread_rank();
    int size = g.size();

    // Store each thread's value
    shmem[lane] = val;
    g.sync();

    // Tree reduction
    for (int stride = size / 2; stride > 0; stride >>= 1) {
        if (lane < stride) {
            shmem[lane] += shmem[lane + stride];
        }
        g.sync();
    }

    // Thread 0 of the group has the result
    return shmem[0];
}

// Warp-level reduction using tiled partition (no shared memory needed)
__device__ float warpReduce(cg::thread_block_tile<32> warp, float val) {
    for (int offset = warp.size() / 2; offset > 0; offset >>= 1) {
        val += warp.shfl_down(val, offset);
    }
    return val;  // Result is in lane 0
}

__global__ void flexibleReduction(const float* input, float* output, int n) {
    cg::thread_block block = cg::this_thread_block();
    cg::thread_block_tile<32> warp = cg::tiled_partition<32>(block);

    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    float val = (idx < n) ? input[idx] : 0.0f;

    // Step 1: Warp-level reduction (no shared memory, no sync needed)
    float warpSum = warpReduce(warp, val);

    // Step 2: First thread of each warp writes to shared memory
    __shared__ float warpSums[32];  // Max 32 warps per block (1024 threads)
    if (warp.thread_rank() == 0) {
        warpSums[threadIdx.x / 32] = warpSum;
    }
    block.sync();

    // Step 3: First warp reduces the warp sums
    if (threadIdx.x < 32) {
        int numWarps = blockDim.x / 32;
        float val2 = (threadIdx.x < numWarps) ? warpSums[threadIdx.x] : 0.0f;
        float blockSum = warpReduce(warp, val2);

        if (threadIdx.x == 0) {
            atomicAdd(output, blockSum);
        }
    }
}
```

---

## 6. Warp-Level Primitives

### 6.1 The Warp: CUDA's True Unit of Execution

A warp is 32 threads that execute in lockstep. Warp-level primitives allow threads within a warp to exchange data directly through registers, without using shared memory.

```
Warp shuffle: Direct register-to-register communication
+-------------------------------------------------------------------+
| Warp (32 threads, each with registers)                             |
|                                                                   |
| Lane: 0    1    2    3    4    5    6    7   ... 30   31          |
| Reg:  [A]  [B]  [C]  [D]  [E]  [F]  [G]  [H]  ... [?]  [?]     |
|                                                                   |
| __shfl_sync: any lane can read any other lane's register          |
| __shfl_down_sync: each lane reads from lane + delta               |
| __shfl_up_sync:   each lane reads from lane - delta               |
| __shfl_xor_sync:  each lane reads from lane XOR mask              |
|                                                                   |
| No shared memory. No synchronization barrier needed.              |
| Just a single instruction.                                         |
+-------------------------------------------------------------------+
```

### 6.2 The Mask Parameter

All warp-level intrinsics take a `mask` parameter that specifies which threads participate. The full warp mask is `0xFFFFFFFF` (all 32 threads). Using the correct mask is essential for correctness.

```
Mask: 0xFFFFFFFF = 1111 1111 1111 1111 1111 1111 1111 1111
                   Lane 31                            Lane 0

Mask: 0x0000FFFF = 0000 0000 0000 0000 1111 1111 1111 1111
                   Lanes 16-31 excluded   Lanes 0-15 included
```

### 6.3 Shuffle Operations

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void shuffleDemo() {
    int lane = threadIdx.x % 32;
    float myVal = (float)lane;
    unsigned mask = 0xFFFFFFFF;

    // __shfl_sync: Read from a specific lane
    // Every thread gets the value from lane 0
    float fromLane0 = __shfl_sync(mask, myVal, 0);
    // fromLane0 == 0.0f for all threads

    // __shfl_down_sync: Read from lane + delta
    float fromBelow = __shfl_down_sync(mask, myVal, 4);
    // Lane 0 gets value from Lane 4 (= 4.0)
    // Lane 1 gets value from Lane 5 (= 5.0)
    // Lane 28-31: undefined (source lane >= 32)

    // __shfl_up_sync: Read from lane - delta
    float fromAbove = __shfl_up_sync(mask, myVal, 2);
    // Lane 2 gets value from Lane 0 (= 0.0)
    // Lane 3 gets value from Lane 1 (= 1.0)
    // Lane 0-1: undefined (source lane < 0)

    // __shfl_xor_sync: Read from lane XOR mask
    float fromXor = __shfl_xor_sync(mask, myVal, 1);
    // Lane 0 (000) reads from Lane 1 (001)
    // Lane 1 (001) reads from Lane 0 (000)
    // Lane 2 (010) reads from Lane 3 (011)
    // Lane 3 (011) reads from Lane 2 (010)
    // => Swaps adjacent pairs!

    float fromXor4 = __shfl_xor_sync(mask, myVal, 0b100);
    // Lane 0 (000) reads from Lane 4 (100)
    // Lane 4 (100) reads from Lane 0 (000)
    // => Swaps elements 4 apart

    if (lane == 0) {
        printf("Lane 0: myVal=%f, fromLane0=%f, fromBelow=%f, fromXor=%f\n",
               myVal, fromLane0, fromBelow, fromXor);
    }
}
```

```
Visual: __shfl_down_sync(mask, val, 2)

Before:  Lane: [0] [1] [2] [3] [4] [5] [6] [7] ...
         Val:   A   B   C   D   E   F   G   H  ...

After:   Lane: [0] [1] [2] [3] [4] [5] [6] [7] ...
         Val:   C   D   E   F   G   H   I   J  ...
                ^   ^
               Got values from 2 lanes down

Visual: __shfl_xor_sync(mask, val, 1)  (butterfly swap)

Before:  [0] [1] [2] [3] [4] [5] [6] [7]
          A   B   C   D   E   F   G   H

After:   [0] [1] [2] [3] [4] [5] [6] [7]
          B   A   D   C   F   E   H   G
         ^^^ ^^^ swap   ^^^ ^^^ swap
```

### 6.4 Warp Vote Functions

```cuda
__global__ void voteDemo(int* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    unsigned mask = 0xFFFFFFFF;

    bool predicate = (idx < n) && (data[idx] > 0);

    // __ballot_sync: Returns a 32-bit mask where bit i is set if
    // thread i's predicate is true
    unsigned ballot = __ballot_sync(mask, predicate);
    // ballot == 0b...1010 means lanes 1 and 3 had predicate==true

    // __any_sync: Returns non-zero if ANY thread's predicate is true
    int anyTrue = __any_sync(mask, predicate);

    // __all_sync: Returns non-zero if ALL threads' predicate is true
    int allTrue = __all_sync(mask, predicate);

    // Count positive elements using ballot + __popc (popcount)
    int count = __popc(ballot);

    if (threadIdx.x % 32 == 0) {
        printf("Warp starting at thread %d: %d positive elements\n",
               idx, count);
    }
}
```

### 6.5 Warp-Level Reduction (Complete Example)

This is the fastest possible reduction for 32 elements, using no shared memory.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

// Warp-level sum reduction using shuffle down
__device__ float warpReduceSum(float val) {
    unsigned mask = 0xFFFFFFFF;
    val += __shfl_down_sync(mask, val, 16);  // Reduce 32 -> 16
    val += __shfl_down_sync(mask, val, 8);   // Reduce 16 -> 8
    val += __shfl_down_sync(mask, val, 4);   // Reduce  8 -> 4
    val += __shfl_down_sync(mask, val, 2);   // Reduce  4 -> 2
    val += __shfl_down_sync(mask, val, 1);   // Reduce  2 -> 1
    return val;  // Only lane 0 has the correct result
}

// Warp-level max reduction
__device__ float warpReduceMax(float val) {
    unsigned mask = 0xFFFFFFFF;
    val = fmaxf(val, __shfl_down_sync(mask, val, 16));
    val = fmaxf(val, __shfl_down_sync(mask, val, 8));
    val = fmaxf(val, __shfl_down_sync(mask, val, 4));
    val = fmaxf(val, __shfl_down_sync(mask, val, 2));
    val = fmaxf(val, __shfl_down_sync(mask, val, 1));
    return val;
}

// Block-level reduction using warp shuffles + shared memory
__global__ void blockReduceSum(const float* input, float* output, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    float val = (idx < n) ? input[idx] : 0.0f;

    // Step 1: Reduce within each warp
    val = warpReduceSum(val);

    // Step 2: First thread of each warp stores result
    __shared__ float warpSums[32];
    int warpId = threadIdx.x / 32;
    int lane = threadIdx.x % 32;

    if (lane == 0) {
        warpSums[warpId] = val;
    }
    __syncthreads();

    // Step 3: First warp reduces the warp sums
    int numWarps = blockDim.x / 32;
    val = (threadIdx.x < numWarps) ? warpSums[threadIdx.x] : 0.0f;
    val = warpReduceSum(val);

    // Step 4: Block leader writes the block result
    if (threadIdx.x == 0) {
        atomicAdd(output, val);
    }
}

int main() {
    const int N = 1 << 20;
    float* h_input = (float*)malloc(N * sizeof(float));
    for (int i = 0; i < N; i++) h_input[i] = 1.0f;

    float *d_input, *d_output;
    cudaMalloc(&d_input, N * sizeof(float));
    cudaMalloc(&d_output, sizeof(float));
    cudaMemcpy(d_input, h_input, N * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemset(d_output, 0, sizeof(float));

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    blockReduceSum<<<gridSize, blockSize>>>(d_input, d_output, N);

    float result;
    cudaMemcpy(&result, d_output, sizeof(float), cudaMemcpyDeviceToHost);
    printf("Sum = %f (expected %f)\n", result, (float)N);

    free(h_input);
    cudaFree(d_input);
    cudaFree(d_output);
    return 0;
}
```

```
Warp reduce visualization (8 threads shown for simplicity):

Step 1: shfl_down by 4
  Lane:  [0]  [1]  [2]  [3]  [4]  [5]  [6]  [7]
  Val:    1    2    3    4    5    6    7    8
          +    +    +    +
          |    |    |    |
  val += [4]  [5]  [6]  [7]
  Val:    6    8   10   12    5    6    7    8

Step 2: shfl_down by 2
  Lane:  [0]  [1]  [2]  [3]
  Val:    6    8   10   12
          +    +
          |    |
  val += [2]  [3]
  Val:   16   20   10   12

Step 3: shfl_down by 1
  Lane:  [0]  [1]
  Val:   16   20
          +
          |
  val += [1]
  Val:   36   20

Lane 0 has the sum: 1+2+3+4+5+6+7+8 = 36
```

### 6.6 Warp-Level Prefix Sum (Inclusive Scan)

```cuda
__device__ float warpInclusiveScan(float val) {
    unsigned mask = 0xFFFFFFFF;
    float tmp;

    tmp = __shfl_up_sync(mask, val, 1);
    if (threadIdx.x % 32 >= 1)  val += tmp;

    tmp = __shfl_up_sync(mask, val, 2);
    if (threadIdx.x % 32 >= 2)  val += tmp;

    tmp = __shfl_up_sync(mask, val, 4);
    if (threadIdx.x % 32 >= 4)  val += tmp;

    tmp = __shfl_up_sync(mask, val, 8);
    if (threadIdx.x % 32 >= 8)  val += tmp;

    tmp = __shfl_up_sync(mask, val, 16);
    if (threadIdx.x % 32 >= 16) val += tmp;

    return val;
}

// Input:  [1, 1, 1, 1, 1, 1, 1, 1, ...]
// Output: [1, 2, 3, 4, 5, 6, 7, 8, ...]
```

---

## 7. Dynamic Parallelism

### 7.1 Launching Kernels from Kernels

Dynamic Parallelism allows a GPU kernel to launch child kernels without returning to the host. This enables adaptive, recursive, and hierarchical algorithms.

```
Traditional (host-driven):
  CPU: launch_A() -> wait -> launch_B() -> wait -> launch_C() -> wait
       |                      |                      |
       v                      v                      v
  GPU: [====A====]           [====B====]           [====C====]
       Round-trip to host between each kernel

Dynamic Parallelism (device-driven):
  CPU: launch_parent() -> wait
       |
       v
  GPU: [==parent==]
         |     |     |
         v     v     v
       [=A=] [=B=] [=C=]    <- Child kernels launched from GPU
         |
         v
       [=D=]                 <- Grandchild kernel
       No host round-trip!
```

### 7.2 Basic Example

```cuda
// Compile with: nvcc -rdc=true -arch=sm_70 dynamic_parallelism.cu -lcudadevrt

#include <cuda_runtime.h>
#include <cstdio>

__global__ void childKernel(int parentBlockId) {
    printf("  Child kernel: parent block %d, child thread %d\n",
           parentBlockId, threadIdx.x);
}

__global__ void parentKernel() {
    printf("Parent kernel: block %d, thread %d\n",
           blockIdx.x, threadIdx.x);

    // Only one thread per block launches child kernels
    if (threadIdx.x == 0) {
        // Launch a child kernel from the GPU
        childKernel<<<1, 4>>>(blockIdx.x);

        // IMPORTANT: Must synchronize to ensure children complete
        cudaDeviceSynchronize();
    }
}

int main() {
    parentKernel<<<2, 1>>>();
    cudaDeviceSynchronize();
    return 0;
}
```

### 7.3 Adaptive Grid Refinement

The classic use case for dynamic parallelism: refine computation only where needed.

```cuda
__device__ bool needsRefinement(float* data, int start, int end) {
    // Check if this region has high variance / needs more detail
    float minVal = data[start], maxVal = data[start];
    for (int i = start + 1; i < end; i++) {
        minVal = fminf(minVal, data[i]);
        maxVal = fmaxf(maxVal, data[i]);
    }
    return (maxVal - minVal) > 0.1f;  // Threshold
}

__global__ void adaptiveProcess(float* data, int start, int end, int depth) {
    if (depth > 5) return;  // Max recursion depth

    int n = end - start;
    int idx = start + blockIdx.x * blockDim.x + threadIdx.x;

    if (idx < end) {
        // Coarse processing
        data[idx] = data[idx] * 0.99f + 0.01f;
    }

    __syncthreads();

    // Only one thread checks if refinement is needed
    if (threadIdx.x == 0 && blockIdx.x == 0) {
        if (needsRefinement(data, start, end) && n > 32) {
            int mid = start + n / 2;

            // Launch child kernels for each half
            int blockSize = 32;
            adaptiveProcess<<<(mid - start + blockSize - 1) / blockSize,
                              blockSize>>>(data, start, mid, depth + 1);
            adaptiveProcess<<<(end - mid + blockSize - 1) / blockSize,
                              blockSize>>>(data, mid, end, depth + 1);

            cudaDeviceSynchronize();
        }
    }
}
```

```
Adaptive refinement visualization:

Level 0:  [=================entire array=================]
                          |
          Check: needs refinement? YES
                    /              \
Level 1:  [====left half====]   [====right half====]
               |                        |
          Needs refinement?        Needs refinement?
          YES                      NO (done!)
           /        \
Level 2: [left]    [right]
          Done!     Done!

Only regions that need more work get finer processing.
```

### 7.4 Recursive Quicksort

```cuda
__global__ void quicksort(int* data, int left, int right, int depth) {
    if (left >= right) return;
    if (depth > 16) {
        // Fallback to insertion sort at small sizes
        if (threadIdx.x == 0) {
            for (int i = left + 1; i <= right; i++) {
                int key = data[i];
                int j = i - 1;
                while (j >= left && data[j] > key) {
                    data[j + 1] = data[j];
                    j--;
                }
                data[j + 1] = key;
            }
        }
        return;
    }

    // Partition (simplified, single-thread for clarity)
    if (threadIdx.x == 0) {
        int pivot = data[right];
        int i = left - 1;
        for (int j = left; j < right; j++) {
            if (data[j] <= pivot) {
                i++;
                int tmp = data[i]; data[i] = data[j]; data[j] = tmp;
            }
        }
        int tmp = data[i + 1]; data[i + 1] = data[right]; data[right] = tmp;
        int pivotIdx = i + 1;

        // Launch child kernels for each partition
        if (pivotIdx - 1 > left) {
            quicksort<<<1, 1>>>(data, left, pivotIdx - 1, depth + 1);
        }
        if (pivotIdx + 1 < right) {
            quicksort<<<1, 1>>>(data, pivotIdx + 1, right, depth + 1);
        }
        cudaDeviceSynchronize();
    }
}
```

### 7.5 Overhead Considerations

```
Dynamic Parallelism costs:
+----------------------------------------------------------------+
| Operation                        | Approximate Overhead          |
+----------------------------------------------------------------+
| Child kernel launch              | ~5-10 microseconds            |
|   (vs. host launch: ~5-20 us)   | (not significantly cheaper!)  |
+----------------------------------------------------------------+
| Device-side cudaDeviceSynchronize| Blocks parent until children  |
|                                  | complete, wastes SM resources |
+----------------------------------------------------------------+
| Memory for child grids           | Each child needs control      |
|                                  | structures in device memory   |
+----------------------------------------------------------------+

When to use:
  + Irregular, data-dependent parallelism
  + Recursive algorithms (tree traversal, AMR)
  + Avoiding CPU round-trips in deep pipelines

When to avoid:
  - Regular, predictable grid structures
  - Performance-critical inner loops
  - Simple kernel sequences (use streams instead)
```

---

## 8. Atomic Operations

### 8.1 The Race Condition Problem

When multiple threads write to the same memory location, the result is undefined without synchronization.

```
Without atomics (RACE CONDITION):
Thread 0: read counter (=5) -> add 1 -> write 6
Thread 1: read counter (=5) -> add 1 -> write 6   <-- Both read 5!
Result: counter = 6 (should be 7!)

With atomicAdd:
Thread 0: atomicAdd(&counter, 1)  -> reads 5, writes 6 (atomic)
Thread 1: atomicAdd(&counter, 1)  -> reads 6, writes 7 (waits for T0)
Result: counter = 7 (correct!)
```

### 8.2 Built-In Atomic Functions

```cuda
__global__ void atomicDemo(int* data, float* fdata) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    // Integer atomics
    atomicAdd(&data[0], 1);           // data[0] += 1
    atomicSub(&data[1], 1);           // data[1] -= 1
    atomicMin(&data[2], idx);         // data[2] = min(data[2], idx)
    atomicMax(&data[3], idx);         // data[3] = max(data[3], idx)
    atomicAnd(&data[4], 0xFF);        // data[4] &= 0xFF
    atomicOr(&data[5], (1 << (idx % 32)));  // Set bit
    atomicXor(&data[6], 1);           // Toggle bit 0
    atomicExch(&data[7], idx);        // data[7] = idx (returns old value)

    // Float atomics (available since different compute capabilities)
    atomicAdd(&fdata[0], 1.0f);       // Float add (CC 2.0+)
    // atomicAdd for double: CC 6.0+

    // Compare-and-swap (CAS): the foundation of all atomics
    // atomicCAS(&data[8], expected, desired)
    // If data[8] == expected, set data[8] = desired
    // Returns the old value of data[8]
    int old = atomicCAS(&data[8], 0, 42);
    // If data[8] was 0, it's now 42. old == 0.
    // If data[8] was not 0, nothing changed. old == whatever it was.
}
```

### 8.3 Custom Atomics with CAS Loop

For operations not natively supported (e.g., atomicMul, float atomicMin), use a compare-and-swap loop.

```cuda
// Atomic multiply for integers (not natively supported)
__device__ int atomicMul(int* address, int val) {
    int old = *address;
    int assumed;
    do {
        assumed = old;
        int desired = assumed * val;
        old = atomicCAS(address, assumed, desired);
        // If old == assumed, the CAS succeeded and we're done.
        // If old != assumed, another thread changed the value;
        // re-read and try again.
    } while (old != assumed);
    return old;
}

// Atomic min for float (not natively supported on all architectures)
__device__ float atomicMinFloat(float* address, float val) {
    int* addr_as_int = (int*)address;
    int old = *addr_as_int;
    int assumed;
    do {
        assumed = old;
        float old_float = __int_as_float(assumed);
        float new_float = fminf(old_float, val);
        old = atomicCAS(addr_as_int, assumed, __float_as_int(new_float));
    } while (assumed != old);
    return __int_as_float(old);
}

// Atomic add for double (for GPUs before CC 6.0)
__device__ double atomicAddDouble(double* address, double val) {
    unsigned long long int* addr_as_ull = (unsigned long long int*)address;
    unsigned long long int old = *addr_as_ull;
    unsigned long long int assumed;
    do {
        assumed = old;
        old = atomicCAS(addr_as_ull, assumed,
                        __double_as_longlong(
                            __longlong_as_double(assumed) + val));
    } while (assumed != old);
    return __longlong_as_double(old);
}
```

### 8.4 Histogram Example

A classic use case for atomics: counting occurrences.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

// Naive histogram using global atomics (slow due to contention)
__global__ void histogramGlobal(const unsigned char* data,
                                 int* histogram, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        atomicAdd(&histogram[data[idx]], 1);
    }
}

// Optimized: privatized histogram using shared memory atomics
__global__ void histogramShared(const unsigned char* data,
                                 int* histogram, int n) {
    // Per-block private histogram in shared memory
    __shared__ int localHist[256];

    // Initialize shared histogram
    if (threadIdx.x < 256) {
        localHist[threadIdx.x] = 0;
    }
    __syncthreads();

    // Accumulate in shared memory (much less contention)
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        atomicAdd(&localHist[data[idx]], 1);
    }
    __syncthreads();

    // Merge local histogram into global histogram
    if (threadIdx.x < 256) {
        atomicAdd(&histogram[threadIdx.x], localHist[threadIdx.x]);
    }
}

int main() {
    const int N = 1 << 24;  // 16M elements
    size_t dataBytes = N * sizeof(unsigned char);
    size_t histBytes = 256 * sizeof(int);

    unsigned char* h_data = (unsigned char*)malloc(dataBytes);
    int* h_hist = (int*)malloc(histBytes);
    for (int i = 0; i < N; i++) h_data[i] = i % 256;

    unsigned char* d_data;
    int* d_hist;
    cudaMalloc(&d_data, dataBytes);
    cudaMalloc(&d_hist, histBytes);
    cudaMemcpy(d_data, h_data, dataBytes, cudaMemcpyHostToDevice);
    cudaMemset(d_hist, 0, histBytes);

    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;
    histogramShared<<<gridSize, blockSize>>>(d_data, d_hist, N);

    cudaMemcpy(h_hist, d_hist, histBytes, cudaMemcpyDeviceToHost);

    // Each value 0-255 should appear N/256 times
    printf("hist[0] = %d (expected %d)\n", h_hist[0], N / 256);
    printf("hist[255] = %d (expected %d)\n", h_hist[255], N / 256);

    free(h_data); free(h_hist);
    cudaFree(d_data); cudaFree(d_hist);
    return 0;
}
```

### 8.5 Performance Implications

```
Atomic operation performance hierarchy:
+----------------------------------------------------------------+
| Location          | Latency    | Contention Impact              |
+----------------------------------------------------------------+
| Shared memory     | ~5 cycles  | Low (only within block)        |
| L2 cache          | ~100 cyc   | Medium (across SMs)            |
| Global memory     | ~400 cyc   | HIGH (all threads compete)     |
+----------------------------------------------------------------+

Strategies to reduce atomic contention:
1. Privatization: Use shared memory for per-block accumulation,
   then merge to global (histogram example above)
2. Warp-level pre-reduction: Use warp shuffles to reduce 32 values
   to 1 before the atomic (fewer atomics = less contention)
3. Hierarchical atomics: Block-level -> SM-level -> Global-level

Example: Reducing atomic pressure with warp pre-reduction
  Without:  1024 threads -> 1024 atomicAdd to global  (bad!)
  With warp reduction: 1024 -> 32 warp sums -> 32 atomicAdd  (32x fewer)
  With block reduction: 1024 -> 1 block sum -> 1 atomicAdd   (1024x fewer)
```

---

## 9. Thrust Library

### 9.1 What Is Thrust?

Thrust is a C++ parallel algorithms library bundled with the CUDA Toolkit. It provides high-level abstractions similar to the C++ Standard Template Library (STL) but executing on the GPU. Think of it as `std::sort` and `std::reduce` for GPUs.

```
Thrust layer diagram:
+--------------------------------------------------+
|                  Your Application                  |
+--------------------------------------------------+
|               Thrust C++ Algorithms                |
|   sort, reduce, transform, scan, merge, ...       |
+--------------------------------------------------+
|         Execution Policies                         |
|   thrust::device  |  thrust::host  |  thrust::seq |
+--------------------------------------------------+
|     CUDA Runtime   |    OpenMP     |   Sequential  |
+--------------------------------------------------+
|     GPU            |    CPU        |   CPU         |
+--------------------------------------------------+
```

### 9.2 Device Vectors

```cuda
#include <thrust/device_vector.h>
#include <thrust/host_vector.h>
#include <thrust/sort.h>
#include <thrust/reduce.h>
#include <cstdio>

int main() {
    // Host vector (lives on CPU, similar to std::vector)
    thrust::host_vector<int> h_vec(1000);
    for (int i = 0; i < 1000; i++) {
        h_vec[i] = 1000 - i;  // Reverse order
    }

    // Device vector (lives on GPU, auto-manages cudaMalloc/cudaFree)
    thrust::device_vector<int> d_vec = h_vec;  // Auto-copies H2D!

    // Sort on GPU
    thrust::sort(d_vec.begin(), d_vec.end());

    // Copy back to host (automatic)
    h_vec = d_vec;

    printf("After sort: [%d, %d, %d, ..., %d]\n",
           h_vec[0], h_vec[1], h_vec[2], h_vec[999]);

    // Get raw CUDA pointer for use in custom kernels
    int* raw_ptr = thrust::raw_pointer_cast(d_vec.data());
    // Can pass raw_ptr to your own <<<>>> kernels

    return 0;
}
```

### 9.3 Core Algorithms

```cuda
#include <thrust/device_vector.h>
#include <thrust/transform.h>
#include <thrust/reduce.h>
#include <thrust/scan.h>
#include <thrust/sort.h>
#include <thrust/count.h>
#include <thrust/functional.h>
#include <thrust/iterator/counting_iterator.h>
#include <cstdio>

// Custom functor for transform
struct square {
    __host__ __device__
    float operator()(const float x) const {
        return x * x;
    }
};

struct saxpy_functor {
    const float a;
    saxpy_functor(float _a) : a(_a) {}
    __host__ __device__
    float operator()(const float x, const float y) const {
        return a * x + y;
    }
};

int main() {
    const int N = 1 << 20;

    // ========== TRANSFORM ==========
    // Apply a function to every element
    thrust::device_vector<float> d_x(N, 3.0f);
    thrust::device_vector<float> d_y(N);

    // Unary transform: y[i] = x[i]^2
    thrust::transform(d_x.begin(), d_x.end(), d_y.begin(), square());
    printf("transform: y[0] = %f (expected 9.0)\n",
           (float)d_y[0]);

    // Binary transform: SAXPY y = a*x + y
    thrust::device_vector<float> d_a(N, 2.0f);
    thrust::device_vector<float> d_b(N, 1.0f);
    thrust::device_vector<float> d_c(N);
    thrust::transform(d_a.begin(), d_a.end(), d_b.begin(),
                      d_c.begin(), saxpy_functor(3.0f));
    printf("SAXPY: c[0] = %f (expected 7.0 = 3*2+1)\n",
           (float)d_c[0]);

    // ========== REDUCE ==========
    // Sum all elements
    thrust::device_vector<float> d_vals(N, 1.0f);
    float sum = thrust::reduce(d_vals.begin(), d_vals.end(),
                                0.0f, thrust::plus<float>());
    printf("reduce sum: %f (expected %f)\n", sum, (float)N);

    // Min/max
    float minVal = thrust::reduce(d_vals.begin(), d_vals.end(),
                                   FLT_MAX, thrust::minimum<float>());

    // ========== SCAN (PREFIX SUM) ==========
    thrust::device_vector<int> d_in(8, 1);
    thrust::device_vector<int> d_out(8);

    // Inclusive scan: [1,1,1,1,1,1,1,1] -> [1,2,3,4,5,6,7,8]
    thrust::inclusive_scan(d_in.begin(), d_in.end(), d_out.begin());
    printf("inclusive scan: [%d,%d,%d,...,%d]\n",
           (int)d_out[0], (int)d_out[1], (int)d_out[2], (int)d_out[7]);

    // Exclusive scan: [1,1,1,1,1,1,1,1] -> [0,1,2,3,4,5,6,7]
    thrust::exclusive_scan(d_in.begin(), d_in.end(), d_out.begin());
    printf("exclusive scan: [%d,%d,%d,...,%d]\n",
           (int)d_out[0], (int)d_out[1], (int)d_out[2], (int)d_out[7]);

    // ========== SORT ==========
    thrust::device_vector<int> d_keys(N);
    // Fill with descending values
    thrust::sequence(d_keys.begin(), d_keys.end(), N, -1);

    thrust::sort(d_keys.begin(), d_keys.end());
    printf("sort: [%d, %d, %d, ..., %d]\n",
           (int)d_keys[0], (int)d_keys[1], (int)d_keys[2], (int)d_keys[N-1]);

    // Sort by key (sort keys and rearrange values accordingly)
    thrust::device_vector<int> d_sortKeys = {3, 1, 4, 1, 5, 9};
    thrust::device_vector<char> d_sortVals = {'c', 'a', 'd', 'a', 'e', 'i'};
    thrust::sort_by_key(d_sortKeys.begin(), d_sortKeys.end(),
                        d_sortVals.begin());

    // ========== COUNT ==========
    thrust::device_vector<int> d_data = {1, 2, 3, 2, 2, 4, 2};
    int count = thrust::count(d_data.begin(), d_data.end(), 2);
    printf("count of 2: %d (expected 3)\n", count);

    return 0;
}
```

### 9.4 Execution Policies

```cuda
#include <thrust/sort.h>
#include <thrust/execution_policy.h>

void executionPolicies(thrust::device_vector<int>& d_vec,
                       thrust::host_vector<int>& h_vec) {
    // Execute on GPU (default for device_vector)
    thrust::sort(thrust::device, d_vec.begin(), d_vec.end());

    // Execute on CPU (uses OpenMP or TBB)
    thrust::sort(thrust::host, h_vec.begin(), h_vec.end());

    // Execute sequentially on CPU (no parallelism)
    thrust::sort(thrust::seq, h_vec.begin(), h_vec.end());

    // Execute on a specific CUDA stream
    cudaStream_t stream;
    cudaStreamCreate(&stream);
    thrust::sort(thrust::cuda::par.on(stream),
                 d_vec.begin(), d_vec.end());
    cudaStreamDestroy(stream);
}
```

### 9.5 Fancy Iterators

Thrust provides powerful iterator types that generate or transform data on-the-fly without allocating memory.

```cuda
#include <thrust/device_vector.h>
#include <thrust/transform_reduce.h>
#include <thrust/iterator/counting_iterator.h>
#include <thrust/iterator/constant_iterator.h>
#include <thrust/iterator/transform_iterator.h>
#include <thrust/iterator/zip_iterator.h>
#include <thrust/functional.h>
#include <cstdio>

struct absoluteValue {
    __host__ __device__
    float operator()(float x) const { return fabsf(x); }
};

int main() {
    // Counting iterator: generates 0, 1, 2, 3, ...
    // No memory allocation!
    thrust::counting_iterator<int> first(0);
    thrust::counting_iterator<int> last(100);
    // Sum of 0+1+2+...+99
    int sum = thrust::reduce(first, last, 0);
    printf("Sum 0..99 = %d (expected 4950)\n", sum);

    // Constant iterator: generates the same value forever
    thrust::constant_iterator<float> ones(1.0f);
    float sumOnes = thrust::reduce(ones, ones + 1000, 0.0f);
    printf("1000 ones = %f\n", sumOnes);

    // Transform iterator: applies a function on-the-fly
    thrust::device_vector<float> d_data = {-1.0f, 2.0f, -3.0f, 4.0f};
    auto absBegin = thrust::make_transform_iterator(d_data.begin(),
                                                     absoluteValue());
    auto absEnd = thrust::make_transform_iterator(d_data.end(),
                                                   absoluteValue());
    // Sum of absolute values without creating a new array
    float absSum = thrust::reduce(absBegin, absEnd, 0.0f);
    printf("Sum of |values| = %f (expected 10.0)\n", absSum);

    // Zip iterator: bundles multiple iterators into tuples
    thrust::device_vector<float> d_x = {1, 2, 3, 4};
    thrust::device_vector<float> d_y = {10, 20, 30, 40};
    auto zipBegin = thrust::make_zip_iterator(
        thrust::make_tuple(d_x.begin(), d_y.begin()));
    // Each element is a tuple<float, float>

    return 0;
}
```

---

## 10. CUDA Graphs

### 10.1 The Problem: Launch Overhead

Every kernel launch, memory copy, and stream operation has overhead from the CPU-side driver. For workloads with many small operations, this overhead can dominate.

```
Traditional launch model:
CPU: |setup|launch K1|setup|launch K2|setup|launch K3|setup|launch K4|
GPU:       |---K1---|      |---K2---|      |---K3---|      |---K4---|
           ^        ^      ^
           |   idle |  idle|   <- GPU stalls waiting for CPU
           Launch overhead accumulates

CUDA Graph model:
CPU: |==build graph==|launch graph|          |launch graph| (replay)
GPU:                  |K1->K2->K3->K4|       |K1->K2->K3->K4|
                      No per-op overhead     Replay is near-zero cost
```

### 10.2 Creating Graphs with Stream Capture

The easiest way to create a graph: record a sequence of operations, then replay it.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void kernelA(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] *= 2.0f;
}

__global__ void kernelB(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] += 1.0f;
}

__global__ void kernelC(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) c[idx] = a[idx] + b[idx];
}

int main() {
    const int N = 1 << 20;
    size_t bytes = N * sizeof(float);

    float *d_a, *d_b, *d_c;
    cudaMalloc(&d_a, bytes);
    cudaMalloc(&d_b, bytes);
    cudaMalloc(&d_c, bytes);

    dim3 block(256);
    dim3 grid((N + 255) / 256);

    cudaStream_t stream;
    cudaStreamCreate(&stream);

    // ===== STEP 1: Capture the graph =====
    cudaGraph_t graph;
    cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);

    // These operations are NOT executed -- they are recorded!
    kernelA<<<grid, block, 0, stream>>>(d_a, N);
    kernelB<<<grid, block, 0, stream>>>(d_b, N);
    kernelC<<<grid, block, 0, stream>>>(d_a, d_b, d_c, N);

    cudaStreamEndCapture(stream, &graph);

    // ===== STEP 2: Instantiate the graph (optimize + validate) =====
    cudaGraphExec_t graphExec;
    cudaGraphInstantiate(&graphExec, graph, nullptr, nullptr, 0);

    // ===== STEP 3: Launch the graph (replay many times) =====
    for (int iter = 0; iter < 100; iter++) {
        cudaGraphLaunch(graphExec, stream);
    }
    cudaStreamSynchronize(stream);

    printf("Executed graph 100 times\n");

    // Cleanup
    cudaGraphExecDestroy(graphExec);
    cudaGraphDestroy(graph);
    cudaStreamDestroy(stream);
    cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
    return 0;
}
```

### 10.3 Creating Graphs with the Explicit API

For more control over the graph structure, build it node by node.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

__global__ void scaleKernel(float* data, float factor, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] *= factor;
}

__global__ void addKernel(float* data, float addend, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] += addend;
}

int main() {
    const int N = 1 << 20;
    size_t bytes = N * sizeof(float);

    float *h_data, *d_data;
    cudaMallocHost(&h_data, bytes);
    cudaMalloc(&d_data, bytes);
    for (int i = 0; i < N; i++) h_data[i] = (float)i;

    dim3 block(256);
    dim3 grid((N + 255) / 256);

    // Build graph explicitly
    cudaGraph_t graph;
    cudaGraphCreate(&graph, 0);

    // Node 1: H2D copy
    cudaGraphNode_t copyH2DNode;
    cudaMemcpy3DParms copyParams = {0};
    copyParams.srcPtr = make_cudaPitchedPtr(h_data, bytes, N, 1);
    copyParams.dstPtr = make_cudaPitchedPtr(d_data, bytes, N, 1);
    copyParams.extent = make_cudaExtent(bytes, 1, 1);
    copyParams.kind = cudaMemcpyHostToDevice;
    cudaGraphAddMemcpyNode(&copyH2DNode, graph, nullptr, 0, &copyParams);

    // Node 2: Scale kernel (depends on H2D copy)
    cudaGraphNode_t scaleNode;
    float scaleFactor = 2.0f;
    void* scaleArgs[] = { &d_data, &scaleFactor, (void*)&N };
    cudaKernelNodeParams scaleParams = {};
    scaleParams.func = (void*)scaleKernel;
    scaleParams.gridDim = grid;
    scaleParams.blockDim = block;
    scaleParams.kernelParams = scaleArgs;
    cudaGraphAddKernelNode(&scaleNode, graph, &copyH2DNode, 1, &scaleParams);

    // Node 3: Add kernel (depends on scale kernel)
    cudaGraphNode_t addNode;
    float addValue = 10.0f;
    void* addArgs[] = { &d_data, &addValue, (void*)&N };
    cudaKernelNodeParams addParams = {};
    addParams.func = (void*)addKernel;
    addParams.gridDim = grid;
    addParams.blockDim = block;
    addParams.kernelParams = addArgs;
    cudaGraphAddKernelNode(&addNode, graph, &scaleNode, 1, &addParams);

    // Node 4: D2H copy (depends on add kernel)
    cudaGraphNode_t copyD2HNode;
    cudaMemcpy3DParms copyBackParams = {0};
    copyBackParams.srcPtr = make_cudaPitchedPtr(d_data, bytes, N, 1);
    copyBackParams.dstPtr = make_cudaPitchedPtr(h_data, bytes, N, 1);
    copyBackParams.extent = make_cudaExtent(bytes, 1, 1);
    copyBackParams.kind = cudaMemcpyDeviceToHost;
    cudaGraphAddMemcpyNode(&copyD2HNode, graph, &addNode, 1, &copyBackParams);

    // Instantiate and launch
    cudaGraphExec_t graphExec;
    cudaGraphInstantiate(&graphExec, graph, nullptr, nullptr, 0);

    cudaStream_t stream;
    cudaStreamCreate(&stream);
    cudaGraphLaunch(graphExec, stream);
    cudaStreamSynchronize(stream);

    // Verify: data[i] = i * 2 + 10
    printf("data[0] = %f (expected 10.0)\n", h_data[0]);
    printf("data[1] = %f (expected 12.0)\n", h_data[1]);
    printf("data[100] = %f (expected 210.0)\n", h_data[100]);

    // Cleanup
    cudaGraphExecDestroy(graphExec);
    cudaGraphDestroy(graph);
    cudaStreamDestroy(stream);
    cudaFree(d_data);
    cudaFreeHost(h_data);
    return 0;
}
```

```
Graph structure (explicit API example):

  [H2D Copy] --> [Scale Kernel] --> [Add Kernel] --> [D2H Copy]

More complex graphs can have branches and joins:

  [H2D Copy A] --> [Kernel A] --\
                                 +--> [Combine Kernel] --> [D2H Copy]
  [H2D Copy B] --> [Kernel B] --/

CUDA Graphs encode the ENTIRE dependency structure, allowing
the driver to optimize scheduling, memory, and launch overhead.
```

### 10.4 Updating Graph Parameters

When only parameters change (e.g., input pointer, scalar value) but the structure remains the same, you can update the graph without rebuilding it.

```cuda
// Update kernel node parameters
cudaKernelNodeParams newParams = scaleParams;
float newFactor = 3.0f;
void* newArgs[] = { &d_data, &newFactor, (void*)&N };
newParams.kernelParams = newArgs;

cudaGraphExecKernelNodeSetParams(graphExec, scaleNode, &newParams);

// Re-launch with updated parameters
cudaGraphLaunch(graphExec, stream);
```

### 10.5 When to Use CUDA Graphs

```
+-------------------------------------------------------+
| GOOD use cases for CUDA Graphs                         |
+-------------------------------------------------------+
| Iterative algorithms (same ops repeated many times)    |
| Deep learning inference (fixed model architecture)     |
| Signal processing pipelines (fixed pipeline stages)    |
| Simulation time-stepping (same kernels per step)       |
| Any workload with many small kernels launched in       |
|   a fixed pattern                                       |
+-------------------------------------------------------+

+-------------------------------------------------------+
| POOR use cases for CUDA Graphs                         |
+-------------------------------------------------------+
| Dynamic / data-dependent kernel launches               |
| One-shot computations (graph build cost > savings)     |
| Frequently changing graph structure                     |
| Kernels that change grid size every iteration          |
+-------------------------------------------------------+

Performance impact:
  - 100 small kernels without graph: ~2ms launch overhead
  - Same 100 kernels with graph:    ~0.01ms launch overhead
  - Speedup for launch-bound workloads: 10-100x
```

---

## Advanced Exercises

### Exercise 1: Tiled Matrix Multiply with Bank Conflict Avoidance

Modify the shared memory matrix multiply from Section 1.4 to use padding (`__shared__ float tileA[TILE_SIZE][TILE_SIZE + 1]`) and measure the performance difference. Use CUDA events for timing. Vary `TILE_SIZE` from 8 to 32 and plot performance.

### Exercise 2: Pipelined Stream Processing

Create a 4-stream pipeline that processes an image (1D array of pixels):
1. Stream i copies chunk i to the device (async)
2. Stream i applies a blur kernel to chunk i
3. Stream i applies an edge detection kernel to chunk i
4. Stream i copies chunk i back to the host (async)

Ensure proper dependencies using events. Time the total execution and compare against single-stream execution. Use pinned memory for the host buffers.

### Exercise 3: Multi-Level Reduction

Implement a complete reduction pipeline:
1. Use warp-level `__shfl_down_sync` for intra-warp reduction
2. Use shared memory for inter-warp reduction within a block
3. Use `atomicAdd` for inter-block accumulation
4. Compare performance against a Thrust `reduce` call

Test with arrays of 1M, 10M, and 100M float elements.

### Exercise 4: Cooperative Groups Jacobi Solver

Implement a 1D Jacobi iterative solver using cooperative groups for grid-level synchronization. The update rule is:

```
u_new[i] = 0.5 * (u[i-1] + u[i+1])
```

Run for 1000 iterations in a single kernel launch (using `grid.sync()` between iterations). Compare performance and correctness against a host-driven version that launches the kernel 1000 times.

### Exercise 5: Build-Your-Own Thrust

Implement a simplified version of `thrust::reduce` and `thrust::exclusive_scan` using raw CUDA kernels. Use all the techniques from this chapter:
- Shared memory tiling
- Warp-level shuffles for intra-warp operations
- Proper `__syncthreads()` placement
- Atomic operations for inter-block aggregation

Benchmark against Thrust and CUB implementations.

### Exercise 6: CUDA Graph Pipeline

Build a CUDA Graph for a multi-step image processing pipeline:
1. H2D copy
2. Gaussian blur (3x3 stencil)
3. Threshold (binarize)
4. D2H copy

Capture the graph, then replay it 1000 times with different input images. Measure the launch overhead savings compared to launching each kernel individually.

### Exercise 7: Dynamic Parallelism Mandelbrot

Implement a Mandelbrot set renderer that uses dynamic parallelism for adaptive refinement:
- Coarse pass: evaluate every 16th pixel
- Where the set boundary is detected (rapid change), launch child kernels for finer 4x4 blocks
- Where the region is uniform (all inside or all outside), skip fine evaluation

Compare total pixel evaluations against a brute-force approach.

### Exercise 8: Lock-Free Stack with Atomics

Implement a lock-free stack on the GPU using `atomicCAS`:
- `push(value)`: atomically updates the top-of-stack pointer
- `pop()`: atomically reads and removes the top element

Test with 1024 threads pushing simultaneously, then 1024 threads popping. Verify all values are preserved (no lost updates).

---

## Performance Tips

### Shared Memory

1. **Always prefer stride-1 access** to shared memory within a warp. If your algorithm requires column access on a 2D shared memory array, add padding (`[N][N+1]`) to eliminate bank conflicts.
2. **Size your tiles to fill shared memory**. On Ampere GPUs, you have up to 164 KB of shared memory per SM. Larger tiles mean more data reuse and fewer global memory accesses.
3. **Use `__syncthreads()` sparingly but correctly**. Every missing barrier is a potential race condition. Every unnecessary barrier is wasted cycles. Place them precisely where producer-consumer dependencies exist.
4. **Use dynamic shared memory** when tile sizes are determined at runtime. This avoids over-allocating with worst-case static sizes.

### Streams

5. **Always use pinned memory** (`cudaMallocHost`) with async operations. Non-pinned memory silently falls back to synchronous behavior, eliminating all overlap.
6. **Use enough streams** to saturate the hardware. Most GPUs have 2 copy engines (1 H2D, 1 D2H) and many compute engines. 3-4 streams is typically sufficient; more than 8 rarely helps.
7. **Avoid the default stream** in performance-critical code. It serializes with all other streams.

### Warp Primitives

8. **Prefer warp shuffles over shared memory** for intra-warp communication. Shuffles use registers (no memory access) and need no synchronization.
9. **Always specify the correct mask**. Using `0xFFFFFFFF` when not all threads are active is undefined behavior. Use `__activemask()` cautiously, or better yet, use cooperative groups.

### Atomics

10. **Minimize the number of atomic operations**. Use hierarchical reduction (warp-level, then block-level, then grid-level) before hitting global atomics.
11. **Use shared memory atomics** when contention is within a block. They are roughly 10x faster than global memory atomics.
12. **Consider CAS loops** for custom operations, but be aware they can spin under high contention.

### Unified Memory

13. **Always prefetch** (`cudaMemPrefetchAsync`) before kernel launches. Demand paging is 2-5x slower than bulk prefetch.
14. **Use `cudaMemAdvise`** to hint access patterns. `SetReadMostly` is particularly effective for lookup tables accessed by both CPU and GPU.
15. **Profile migration overhead** with Nsight Systems. Look for page fault stalls in the kernel timeline.

### CUDA Graphs

16. **Use stream capture** for the first version. It is simpler and less error-prone than the explicit API.
17. **Graph instantiation is expensive**. Build and instantiate once, then launch many times. If you only launch once, the overhead of graph creation exceeds the savings.
18. **Update parameters** (`cudaGraphExecKernelNodeSetParams`) instead of rebuilding graphs when only scalar values change.

### General

19. **Profile before optimizing**. Use Nsight Compute to identify whether your kernel is compute-bound, memory-bound, or latency-bound before applying any technique from this chapter.
20. **Measure everything with CUDA events**, not host-side timers. Host timers include launch overhead and are unreliable for GPU timing.
21. **Check error codes** from every CUDA API call. Silent failures are the most common source of "it compiles and runs but gives wrong results" bugs in CUDA.
22. **Read the CUDA C++ Programming Guide**. This chapter covers the most important features, but the official documentation contains details on every edge case, hardware limit, and architectural nuance.

---

## What Comes Next

Chapter 6 will apply these advanced features to parallel algorithm design: reduction, prefix scan, parallel sort, histogram, stencil computations, and map-reduce on the GPU. Every algorithm in Chapter 6 will rely on the shared memory, warp primitives, and stream techniques you learned here.
