# Chapter 6: Parallel Algorithms

## Why Parallel Algorithms Matter

Launching thousands of GPU threads is only half the battle. The real challenge is organizing those threads to cooperate on a single result. You cannot simply port sequential algorithms to the GPU -- you need fundamentally different algorithmic patterns designed for massive parallelism.

This chapter covers the core building blocks that appear everywhere in GPU programming: reduction, scan, sort, histogram, stencil, and compaction. Every serious CUDA programmer must internalize these patterns because they compose into nearly every real-world GPU application.

---

## 1. Parallel Reduction

### The Problem

Given an array of N elements, compute a single aggregate value (sum, max, min, product, etc.).

```
Input:  [3, 1, 7, 0, 4, 1, 6, 3]
Output: 25  (sum)
```

### Sequential Reduction

```c
int sum = 0;
for (int i = 0; i < N; i++) {
    sum += data[i];
}
// Work: O(N), Span: O(N) -- fully sequential
```

### Tree-Based Parallel Reduction

The key insight: addition is associative. We can pair up elements and reduce in a tree.

```
Step 0 (input):  [3]  [1]  [7]  [0]  [4]  [1]  [6]  [3]
                  \  /      \  /      \  /      \  /
Step 1:          [ 4 ]    [ 7 ]    [ 5 ]    [ 9 ]
                    \      /          \      /
Step 2:            [ 11 ]            [ 14 ]
                       \            /
Step 3:              [   25   ]

Work:  O(N)        -- N-1 additions total
Span:  O(log N)    -- log2(8) = 3 steps
```

### Naive CUDA Reduction (Has Divergence Problems)

```cuda
// NAIVE: Interleaved addressing with divergent branching
__global__ void reduceNaive(int *g_data, int *g_out, int n) {
    extern __shared__ int sdata[];
    unsigned int tid = threadIdx.x;
    unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;

    // Load from global to shared memory
    sdata[tid] = (i < n) ? g_data[i] : 0;
    __syncthreads();

    // Reduction in shared memory
    for (unsigned int s = 1; s < blockDim.x; s *= 2) {
        if (tid % (2 * s) == 0) {       // <-- DIVERGENT BRANCH!
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) g_out[blockIdx.x] = sdata[0];
}
```

**Problem**: The `tid % (2*s)` check causes warp divergence. In step 1, only even-numbered threads are active. In step 2, only every 4th thread is active. Half the threads in each warp are idle but still occupy execution resources.

```
Step 1: Thread 0  Thread 1  Thread 2  Thread 3  Thread 4  Thread 5  ...
        ACTIVE    idle      ACTIVE    idle      ACTIVE    idle
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        Warp 0 has divergent threads -- both paths serialized

Step 2: Thread 0  Thread 1  Thread 2  Thread 3  Thread 4  ...
        ACTIVE    idle      idle      idle      ACTIVE
```

### Improved: Sequential Addressing (No Divergence in Early Steps)

```cuda
// BETTER: Sequential addressing -- no divergence until threads drop off
__global__ void reduceSequential(int *g_data, int *g_out, int n) {
    extern __shared__ int sdata[];
    unsigned int tid = threadIdx.x;
    unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;

    sdata[tid] = (i < n) ? g_data[i] : 0;
    __syncthreads();

    // Reversed loop: start with large stride
    for (unsigned int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {                   // <-- Contiguous threads active
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) g_out[blockIdx.x] = sdata[0];
}
```

```
blockDim.x = 8, data = [3, 1, 7, 0, 4, 1, 6, 3]

Step 1 (s=4):  tid < 4 active
  sdata: [3+4, 1+1, 7+6, 0+3,  4,  1,  6,  3]
       = [  7,   2,  13,   3,   4,  1,  6,  3]

Step 2 (s=2):  tid < 2 active
  sdata: [7+13, 2+3,  13,   3,   4,  1,  6,  3]
       = [ 20,   5,   13,   3,   4,  1,  6,  3]

Step 3 (s=1):  tid < 1 active
  sdata: [20+5,  5,   13,   3,   4,  1,  6,  3]
       = [ 25,   5,   13,   3,   4,  1,  6,  3]

Result: sdata[0] = 25
```

**Why this is better**: In step 1, threads 0-3 are all in the same warp and all active. No divergence until the active count drops below 32.

### First-Add-During-Load Optimization

Half the threads do nothing in the first step. We can halve the block count and have each thread load two elements:

```cuda
__global__ void reduceFirstAdd(int *g_data, int *g_out, int n) {
    extern __shared__ int sdata[];
    unsigned int tid = threadIdx.x;
    unsigned int i = blockIdx.x * (blockDim.x * 2) + threadIdx.x;

    // Each thread loads and adds TWO elements
    int val = 0;
    if (i < n)                val  = g_data[i];
    if (i + blockDim.x < n)  val += g_data[i + blockDim.x];
    sdata[tid] = val;
    __syncthreads();

    for (unsigned int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) g_out[blockIdx.x] = sdata[0];
}

// Launch: reduceFirstAdd<<<N/(2*BLOCK), BLOCK, BLOCK*sizeof(int)>>>(...)
```

This cuts the number of blocks in half and eliminates the idle first step.

### Warp-Level Reduction with Shuffle

Once we are down to 32 or fewer active threads (one warp), we do not need `__syncthreads()` at all. Warps execute in lockstep (SIMT), so we use warp shuffle instructions:

```cuda
// Warp-level reduction using __shfl_down_sync
__device__ int warpReduce(int val) {
    // Full warp mask
    for (int offset = warpSize / 2; offset > 0; offset >>= 1) {
        val += __shfl_down_sync(0xFFFFFFFF, val, offset);
    }
    return val;  // Only lane 0 has the final result
}
```

```
Warp shuffle reduction (warpSize = 32, showing lanes 0-7 for brevity):

Lane:          0     1     2     3     4     5     6     7
Initial:      [a0]  [a1]  [a2]  [a3]  [a4]  [a5]  [a6]  [a7]

offset=4:     Each lane gets value from lane+4
              [a0+a4] [a1+a5] [a2+a6] [a3+a7] [a4] [a5] [a6] [a7]

offset=2:     Each lane gets value from lane+2
              [a0+a4+a2+a6] [a1+a5+a3+a7] [...] [...] ...

offset=1:     Each lane gets value from lane+1
              [a0+a1+a2+a3+a4+a5+a6+a7]  [...]  ...

Lane 0 now has the sum of all 8 elements.
```

**`__shfl_down_sync` is fast**: It moves data directly between registers within a warp -- no shared memory needed, no synchronization needed.

### Complete Optimized Reduction

Putting all optimizations together:

```cuda
__device__ int warpReduce(int val) {
    for (int offset = warpSize / 2; offset > 0; offset >>= 1) {
        val += __shfl_down_sync(0xFFFFFFFF, val, offset);
    }
    return val;
}

__global__ void reduceOptimized(const int *__restrict__ g_in,
                                int *__restrict__ g_out, int n) {
    extern __shared__ int sdata[];
    unsigned int tid = threadIdx.x;
    unsigned int i = blockIdx.x * (blockDim.x * 2) + threadIdx.x;

    // First add during load (each thread processes 2 elements)
    int val = 0;
    if (i < n)                val  = g_in[i];
    if (i + blockDim.x < n)  val += g_in[i + blockDim.x];
    sdata[tid] = val;
    __syncthreads();

    // Tree reduction in shared memory down to 32 threads
    for (unsigned int s = blockDim.x / 2; s > 32; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    // Final warp reduction -- no syncthreads needed
    if (tid < 32) {
        val = sdata[tid];
        val = warpReduce(val);
    }

    if (tid == 0) g_out[blockIdx.x] = val;
}
```

### Multi-Block Reduction (Two-Pass)

A single block can only reduce `2 * blockDim.x` elements. For large arrays we need multiple blocks, producing one partial sum per block. Then we reduce the partial sums.

```
Pass 1:  N elements --> ceil(N / (2*B)) partial sums
         [==========|==========|==========|==========]
          Block 0     Block 1     Block 2     Block 3
            |           |           |           |
         [sum0]      [sum1]      [sum2]      [sum3]

Pass 2:  4 partial sums --> 1 final sum
         [sum0, sum1, sum2, sum3]
          Block 0
            |
         [total]
```

```cuda
void reduceArray(int *d_in, int *d_out, int n) {
    int blockSize = 256;
    int gridSize = (n + blockSize * 2 - 1) / (blockSize * 2);

    // Allocate temporary storage for partial sums
    int *d_partial;
    cudaMalloc(&d_partial, gridSize * sizeof(int));

    // Pass 1: Reduce N elements to gridSize partial sums
    reduceOptimized<<<gridSize, blockSize, blockSize * sizeof(int)>>>(
        d_in, d_partial, n);

    // Pass 2: Reduce partial sums to single value
    reduceOptimized<<<1, blockSize, blockSize * sizeof(int)>>>(
        d_partial, d_out, gridSize);

    cudaFree(d_partial);
}
```

### Complexity Summary

| Variant | Work | Span | Notes |
|---------|------|------|-------|
| Sequential (CPU) | O(N) | O(N) | Baseline |
| Naive parallel | O(N) | O(log N) | Warp divergence |
| Sequential addressing | O(N) | O(log N) | No early divergence |
| First-add-during-load | O(N) | O(log N) | Half the blocks |
| Warp shuffle final | O(N) | O(log N) | No shared mem for last 5 steps |

---

## 2. Prefix Sum (Scan)

### The Problem

Given an array, compute running totals.

**Exclusive scan**: Each output element is the sum of all preceding elements (but not itself).

```
Input:     [3, 1, 7, 0, 4, 1, 6, 3]
Exclusive: [0, 3, 4, 11, 11, 15, 16, 22]
           ^                             ^
           always 0                      does NOT include last input
```

**Inclusive scan**: Each output element is the sum of all preceding elements plus itself.

```
Input:     [3, 1, 7, 0, 4, 1, 6, 3]
Inclusive:  [3, 4, 11, 11, 15, 16, 22, 25]
            ^                              ^
            = input[0]                     = total sum
```

Scan is arguably the most important primitive in parallel computing. It is used in: stream compaction, radix sort, sparse matrix operations, polynomial evaluation, solving recurrences, and hundreds of other algorithms.

### Hillis-Steele Algorithm (Step-Efficient)

This is the simpler algorithm. Each step, element i adds the value from element i - 2^d.

```
Input:     [3,  1,  7,  0,  4,  1,  6,  3]

Step d=0:  Each element adds element at distance 1 to the left
           [ 3, 1+3, 7+1, 0+7, 4+0, 1+4, 6+1, 3+6]
         = [ 3,  4,   8,   7,   4,   5,   7,   9 ]

Step d=1:  Each element adds element at distance 2 to the left
           [ 3,  4, 8+3, 7+4, 4+8, 5+7, 7+4, 9+5]
         = [ 3,  4,  11,  11,  12,  12,  11,  14 ]

Step d=2:  Each element adds element at distance 4 to the left
           [ 3,  4,  11,  11, 12+3, 12+4, 11+11, 14+11]
         = [ 3,  4,  11,  11,  15,   16,   22,    25  ]

Result (inclusive scan): [3, 4, 11, 11, 15, 16, 22, 25]
```

**Detailed ASCII diagram of data flow:**

```
Index:    0    1    2    3    4    5    6    7

Input:   [3]  [1]  [7]  [0]  [4]  [1]  [6]  [3]
          |    |    |    |    |    |    |    |
d=0:      |   +|    |   +|    |   +|    |   +|
          |  / |    |  / |    |  / |    |  / |
          | /  |    | /  |    | /  |    | /  |
         [3]  [4]  [8]  [7]  [4]  [5]  [7]  [9]
          |    |    |    |    |    |    |    |
d=1:      |    |   +|   +|    |    |   +|   +|
          |    |  / |  / |    |    |  / |  / |
          |    | /  | /  |    |    | /  | /  |
         [3]  [4] [11] [11]  [4]  [5] [11] [14]
          |    |    |    |    |    |    |    |
d=2:      |    |    |    |   +|   +|   +|   +|
          |    |    |    |  / |  / |  / |  / |
          |    |    |    | /  | /  | /  | /  |
         [3]  [4] [11] [11] [15] [16] [22] [25]
```

**Complexity:**
- Work: O(N log N) -- more work than sequential!
- Span: O(log N)
- Not work-efficient, but simple and has few steps

```cuda
// Hillis-Steele inclusive scan (single block)
__global__ void hillisSteeleScan(int *g_data, int n) {
    extern __shared__ int temp[];
    int tid = threadIdx.x;

    // Double-buffered shared memory
    int pout = 0, pin = 1;

    temp[tid] = (tid < n) ? g_data[tid] : 0;
    __syncthreads();

    for (int offset = 1; offset < n; offset <<= 1) {
        // Swap buffers
        pout = 1 - pout;
        pin  = 1 - pin;

        if (tid >= offset) {
            temp[pout * n + tid] = temp[pin * n + tid]
                                 + temp[pin * n + tid - offset];
        } else {
            temp[pout * n + tid] = temp[pin * n + tid];
        }
        __syncthreads();
    }

    if (tid < n) {
        g_data[tid] = temp[pout * n + tid];
    }
}
```

### Blelloch Algorithm (Work-Efficient)

Two phases: **up-sweep** (reduce) and **down-sweep** (distribute). Total work is O(N), matching sequential.

**Phase 1: Up-Sweep (Reduce)**

Build partial sums bottom-up, exactly like a reduction:

```
Input:     [3,  1,  7,  0,  4,  1,  6,  3]
            0   1   2   3   4   5   6   7

d=0: Add pairs at distance 1 (write to odd indices)
     [3,  4,  7,  7,  4,  5,  6,  9]
          ^       ^       ^       ^
         1+3    0+7     1+4     3+6

d=1: Add pairs at distance 2 (write to indices 3,7)
     [3,  4,  7, 11,  4,  5,  6, 14]
                  ^               ^
                7+4             9+5

d=2: Add pairs at distance 4 (write to index 7)
     [3,  4,  7, 11,  4,  5,  6, 25]
                                  ^
                               11+14
```

```
ASCII diagram of up-sweep:

Index:  0    1    2    3    4    5    6    7
       [3]  [1]  [7]  [0]  [4]  [1]  [6]  [3]
        \  /      \  /      \  /      \  /
d=0:     +         +         +         +
       [3] [4]  [7]  [7]  [4]  [5]  [6]  [9]
             \      /              \      /
d=1:          +----+                +----+
       [3] [4]  [7] [11]  [4]  [5]  [6] [14]
                      \                  /
d=2:                   +--------+-------+
       [3] [4]  [7] [11]  [4]  [5]  [6] [25]
                                          ^
                                     total sum
```

**Phase 2: Down-Sweep (Distribute)**

Set last element to 0 (identity for addition), then propagate partial sums downward:

```
Start: Set last element to 0
     [3,  4,  7, 11,  4,  5,  6,  0]
                                  ^
                                 was 25, set to 0

d=2: For index 7: left child gets parent, right child gets parent + left
     Index 3 and 7:
       save = arr[3] = 11
       arr[3] = arr[7] = 0           (parent goes left)
       arr[7] = 0 + 11 = 11          (parent + old_left goes right)
     [3,  4,  7,  0,  4,  5,  6, 11]

d=1: Index 1,3 and 5,7:
     save = arr[1] = 4
       arr[1] = arr[3] = 0
       arr[3] = 0 + 4 = 4
     save = arr[5] = 5
       arr[5] = arr[7] = 11
       arr[7] = 11 + 5 = 16
     [3,  0,  7,  4,  4, 11,  6, 16]

d=0: Index 0,1 and 2,3 and 4,5 and 6,7:
     save=3, arr[0]=arr[1]=0,     arr[1]=0+3=3
     save=7, arr[2]=arr[3]=4,     arr[3]=4+7=11
     save=4, arr[4]=arr[5]=11,    arr[5]=11+4=15
     save=6, arr[6]=arr[7]=16,    arr[7]=16+6=22
     [0,  3,  4, 11, 11, 15, 16, 22]
```

```
ASCII diagram of down-sweep:

Index:  0    1    2    3    4    5    6    7

Start: [3]  [4]  [7] [11]  [4]  [5]  [6]  [0]  (set last=0)
                       |                     |
d=2:                   +----------swap------+
                      / \                  / \
                    =0   =0+11          (from parent)
       [3]  [4]  [7]  [0]  [4]  [5]  [6] [11]
              |    |    |    |    |    |    |
d=1:         +--swap--+          +--swap--+
            / \      / \        / \      / \
          =0  =0+4  (p)      =11 =11+5  (p)
       [3]  [0]  [7]  [4]  [4] [11]  [6] [16]
        |    |    |    |    |    |    |    |
d=0:   swap  |  swap   |  swap   |  swap   |
      / \   / \  / \  / \  / \  / \  / \  / \
       [0]  [3]  [4] [11] [11] [15] [16] [22]

Result (exclusive scan): [0, 3, 4, 11, 11, 15, 16, 22]
```

**Complexity:**
- Up-sweep: N - 1 additions (same as reduction)
- Down-sweep: N - 1 additions
- Total work: O(N) -- work-efficient!
- Span: O(log N)

### Complete Blelloch Scan Implementation

```cuda
// Blelloch work-efficient exclusive scan (single block)
__global__ void blellochScan(int *g_data, int n) {
    extern __shared__ int sdata[];
    int tid = threadIdx.x;

    // Load input into shared memory
    sdata[2 * tid]     = g_data[2 * tid];
    sdata[2 * tid + 1] = g_data[2 * tid + 1];

    // === UP-SWEEP (Reduce) ===
    int offset = 1;
    for (int d = n >> 1; d > 0; d >>= 1) {
        __syncthreads();
        if (tid < d) {
            int ai = offset * (2 * tid + 1) - 1;
            int bi = offset * (2 * tid + 2) - 1;
            sdata[bi] += sdata[ai];
        }
        offset <<= 1;
    }

    // Set last element to identity (0 for addition)
    if (tid == 0) {
        sdata[n - 1] = 0;
    }

    // === DOWN-SWEEP ===
    for (int d = 1; d < n; d <<= 1) {
        offset >>= 1;
        __syncthreads();
        if (tid < d) {
            int ai = offset * (2 * tid + 1) - 1;
            int bi = offset * (2 * tid + 2) - 1;

            int temp = sdata[ai];
            sdata[ai] = sdata[bi];        // Left child = parent
            sdata[bi] += temp;             // Right child = parent + old left
        }
    }
    __syncthreads();

    // Write results back to global memory
    g_data[2 * tid]     = sdata[2 * tid];
    g_data[2 * tid + 1] = sdata[2 * tid + 1];
}
```

### Handling Arbitrary-Length Arrays

A single block can scan at most ~2048 elements (limited by shared memory and threads per block). For larger arrays, we use a three-phase approach:

```
Phase 1: Scan each block independently, save block totals
+--------+--------+--------+--------+
| Scan   | Scan   | Scan   | Scan   |
| Block0 | Block1 | Block2 | Block3 |
+--------+--------+--------+--------+
  total=T0  total=T1  total=T2  total=T3

Phase 2: Scan the block totals
[T0, T1, T2, T3]  -->  [0, T0, T0+T1, T0+T1+T2]

Phase 3: Add scanned totals back into each block
Block 0: add 0           (no change)
Block 1: add T0          (every element)
Block 2: add T0+T1       (every element)
Block 3: add T0+T1+T2    (every element)
```

```cuda
// Phase 1: Scan blocks, store block sums
__global__ void scanBlocks(int *g_data, int *g_blockSums, int n) {
    extern __shared__ int sdata[];
    int tid = threadIdx.x;
    int blockOffset = blockIdx.x * blockDim.x * 2;
    int ai = blockOffset + 2 * tid;
    int bi = blockOffset + 2 * tid + 1;

    sdata[2 * tid]     = (ai < n) ? g_data[ai] : 0;
    sdata[2 * tid + 1] = (bi < n) ? g_data[bi] : 0;

    int blockN = blockDim.x * 2;

    // Up-sweep
    int offset = 1;
    for (int d = blockN >> 1; d > 0; d >>= 1) {
        __syncthreads();
        if (tid < d) {
            int a = offset * (2 * tid + 1) - 1;
            int b = offset * (2 * tid + 2) - 1;
            sdata[b] += sdata[a];
        }
        offset <<= 1;
    }

    // Save block sum and set last to 0
    if (tid == 0) {
        g_blockSums[blockIdx.x] = sdata[blockN - 1];
        sdata[blockN - 1] = 0;
    }

    // Down-sweep
    for (int d = 1; d < blockN; d <<= 1) {
        offset >>= 1;
        __syncthreads();
        if (tid < d) {
            int a = offset * (2 * tid + 1) - 1;
            int b = offset * (2 * tid + 2) - 1;
            int temp = sdata[a];
            sdata[a] = sdata[b];
            sdata[b] += temp;
        }
    }
    __syncthreads();

    if (ai < n) g_data[ai] = sdata[2 * tid];
    if (bi < n) g_data[bi] = sdata[2 * tid + 1];
}

// Phase 3: Add block offsets
__global__ void addBlockOffsets(int *g_data, int *g_blockOffsets, int n) {
    int i = blockIdx.x * blockDim.x * 2 + threadIdx.x;
    int offset = g_blockOffsets[blockIdx.x];

    if (i < n)                      g_data[i] += offset;
    if (i + blockDim.x < n)        g_data[i + blockDim.x] += offset;
}

// Host orchestration
void scanLargeArray(int *d_data, int n) {
    int blockSize = 256;
    int elemsPerBlock = blockSize * 2;
    int gridSize = (n + elemsPerBlock - 1) / elemsPerBlock;

    int *d_blockSums;
    cudaMalloc(&d_blockSums, gridSize * sizeof(int));

    // Phase 1: Scan blocks
    scanBlocks<<<gridSize, blockSize, elemsPerBlock * sizeof(int)>>>(
        d_data, d_blockSums, n);

    // Phase 2: Scan block sums (recursively for very large arrays)
    if (gridSize > 1) {
        scanLargeArray(d_blockSums, gridSize);  // Recursive!
    }

    // Phase 3: Propagate
    if (gridSize > 1) {
        addBlockOffsets<<<gridSize, blockSize>>>(d_data, d_blockSums, n);
    }

    cudaFree(d_blockSums);
}
```

### Applications of Scan

| Application | How Scan is Used |
|-------------|------------------|
| Stream compaction | Scan predicate flags to get output positions |
| Radix sort | Scan digit histograms for scatter addresses |
| Sparse matrix ops | Scan row pointers for CSR format |
| Polynomial evaluation | Scan with multiply operator |
| Run-length encoding | Scan to find run boundaries |
| Quicksort partition | Scan predicate to split elements |
| Histogram equalization | Scan to compute CDF |

---

## 3. Parallel Sort

### Bitonic Sort

Bitonic sort is a sorting network -- the comparison-swap pattern is fixed regardless of input data. This makes it ideal for GPUs where all threads must follow the same control flow.

**Key concept**: A **bitonic sequence** is one that first monotonically increases and then monotonically decreases (or can be rotated to have this property).

```
Bitonic:      [1, 3, 5, 7, 6, 4, 2, 0]    -- up then down
Also bitonic: [5, 7, 6, 4, 2, 0, 1, 3]    -- rotation of a bitonic seq
NOT bitonic:  [1, 3, 2, 5, 4, 6, 7, 0]    -- multiple direction changes
```

**Bitonic merge**: Given a bitonic sequence, compare-and-swap elements at distance N/2 to produce two half-sized bitonic sequences, each smaller than the other. Repeat recursively.

**Full bitonic sort** for 8 elements:

```
Input:   [5] [3] [8] [1] [7] [2] [6] [4]
          0   1   2   3   4   5   6   7

=== Phase 1: Build length-2 bitonic sequences ===
Step 1.1: Compare-swap pairs (distance=1), alternating directions
  (0,1)asc  (2,3)desc  (4,5)asc  (6,7)desc
  [3] [5] | [8] [1] | [2] [7] | [6] [4]
   asc ^     desc ^     asc ^     desc ^
  Result: [3,5,8,1,2,7,6,4]
          +-up-+down+  +-up-+down+
          Bitonic(4)   Bitonic(4)

=== Phase 2: Build length-4 bitonic sequences ===
Step 2.1: Compare-swap at distance=2, alternating directions
  (0,2)asc (1,3)asc (4,6)desc (5,7)desc
  [3,5,8,1]  -->  compare (3,8) and (5,1):
                   min/max: [3,1,8,5]
  [2,7,6,4]  -->  compare (2,6) and (7,4):
                   max/min: [6,7,2,4]
  Result: [3,1,8,5,6,7,2,4]

Step 2.2: Compare-swap at distance=1
  (0,1)asc (2,3)asc (4,5)desc (6,7)desc
  [1,3,5,8,7,6,4,2]
   +--sorted up--+  +--sorted down--+
   Bitonic sequence of length 8!

=== Phase 3: Sort the full bitonic sequence ===
Step 3.1: Compare-swap at distance=4 (ascending)
  (0,4) (1,5) (2,6) (3,7) -- all ascending
  Compare: (1,7)(3,6)(5,4)(8,2) --> [1,3,4,2,7,6,5,8]

Step 3.2: Compare-swap at distance=2 (ascending)
  (0,2)(1,3) and (4,6)(5,7) -- all ascending
  [1,2,4,3,5,6,7,8]

Step 3.3: Compare-swap at distance=1 (ascending)
  (0,1)(2,3)(4,5)(6,7) -- all ascending
  [1,2,3,4,5,6,7,8]  -- SORTED!
```

**Full sorting network diagram for N=8:**

```
Index:  0    1    2    3    4    5    6    7
        |    |    |    |    |    |    |    |
Phase1: |<-->|    |<-->|    |<-->|    |<-->|   dist=1
        | a  |    | d  |    | a  |    | d  |
        |    |    |    |    |    |    |    |
Phase2: |----+--->|    |    |----+--->|    |   dist=2
        |    |----+--->|    |    |----+--->|
        |<-->|    |<-->|    |<-->|    |<-->|   dist=1
        | a  |    | a  |    | d  |    | d  |
        |    |    |    |    |    |    |    |
Phase3: |---------+----+--->|--->|    |    |   dist=4
        |    |---------+----+--->|--->|    |
        |    |    |---------+----+--->|--->|
        |    |    |    |---------+----+--->|
        |----+--->|    |    |----+--->|    |   dist=2
        |    |----+--->|    |    |----+--->|
        |<-->|    |<-->|    |<-->|    |<-->|   dist=1
        | a  |    | a  |    | a  |    | a  |
        |    |    |    |    |    |    |    |
Result: sorted ascending

a = ascending compare-swap
d = descending compare-swap
<--> or ---+--> = compare-swap connection
```

**Complexity:**
- Phases: log(N) phases
- Steps per phase p: p compare-swap rounds
- Total steps: log(N) * (log(N)+1) / 2 = O(log^2 N)
- Work: O(N log^2 N)
- Each step is fully parallel (N/2 independent compare-swaps)

```cuda
// Bitonic sort kernel -- each step is one kernel launch
__global__ void bitonicSortStep(int *data, int j, int k) {
    unsigned int i = threadIdx.x + blockDim.x * blockIdx.x;
    unsigned int ixj = i ^ j;  // XOR gives the partner index

    // Only one thread in each pair does the swap
    if (ixj > i) {
        if ((i & k) == 0) {
            // Ascending: swap if out of order
            if (data[i] > data[ixj]) {
                int temp = data[i];
                data[i] = data[ixj];
                data[ixj] = temp;
            }
        } else {
            // Descending: swap if out of order
            if (data[i] < data[ixj]) {
                int temp = data[i];
                data[i] = data[ixj];
                data[ixj] = temp;
            }
        }
    }
}

// Host-side driver
void bitonicSort(int *d_data, int n) {
    int threads = 256;
    int blocks = n / threads;

    // k = size of bitonic sequences being merged
    for (int k = 2; k <= n; k <<= 1) {
        // j = distance of compare-swap partners
        for (int j = k >> 1; j > 0; j >>= 1) {
            bitonicSortStep<<<blocks, threads>>>(d_data, j, k);
            cudaDeviceSynchronize();
        }
    }
}
```

### Radix Sort on GPU

Radix sort processes one bit (or a few bits) at a time, from least significant to most significant. Each pass uses scan to compute output positions.

```
Sort 4 numbers by 2-bit digits (base 4):

Input:  [6, 3, 5, 1]  in binary: [110, 011, 101, 001]

Pass 1: Sort by bits [1:0]
  Extract digit: [2, 3, 1, 1]   (last 2 bits of each)
  Stable sort by digit:
    digit=1: [5, 1]  (original positions 2,3)
    digit=2: [6]     (original position 0)
    digit=3: [3]     (original position 1)
  Result: [5, 1, 6, 3]

Pass 2: Sort by bits [3:2]
  Extract digit: [1, 0, 1, 0]   (upper 2 bits)
  Stable sort by digit:
    digit=0: [1, 3]  (positions 1,3 -- stable order preserved!)
    digit=1: [5, 6]  (positions 0,2 -- stable order preserved!)
  Result: [1, 3, 5, 6]  -- SORTED!
```

**Each pass for 1-bit radix sort uses scan:**

```
Input:       [6, 3, 5, 1]   bit 0: [0, 1, 1, 1]

Step 1: Count 0-bits (NOT of bit):  [1, 0, 0, 0]
Step 2: Exclusive scan of 0-flags:  [0, 1, 1, 1]  -> positions for 0-bit elements
Step 3: Count total zeros = 1
Step 4: For 1-bit elements, position = totalZeros + scan(1-flags)
        1-flags:                     [0, 1, 1, 1]
        Exclusive scan:              [0, 0, 1, 2]
        Position = 1 + scan:         [1, 1, 2, 3]
Step 5: Scatter to output positions:
        Element 6 (bit=0): goes to position 0
        Element 3 (bit=1): goes to position 1
        Element 5 (bit=1): goes to position 2
        Element 1 (bit=1): goes to position 3
Output: [6, 3, 5, 1]  (for this bit, already placed)
```

```cuda
// Single-bit radix sort pass
__global__ void radixSortPass(int *d_in, int *d_out, int *d_predicates,
                              int *d_scanned, int n, int bit) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid >= n) return;

    int val = d_in[tid];
    int bitVal = (val >> bit) & 1;

    // Store predicate (is bit 0?)
    d_predicates[tid] = (bitVal == 0) ? 1 : 0;
}

__global__ void scatter(int *d_in, int *d_out, int *d_predicates,
                        int *d_scanned, int totalFalses, int n, int bit) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid >= n) return;

    int val = d_in[tid];
    int bitVal = (val >> bit) & 1;

    int dest;
    if (bitVal == 0) {
        dest = d_scanned[tid];              // Position among 0-bit elements
    } else {
        dest = totalFalses + tid - d_scanned[tid];  // Position among 1-bit elements
    }

    d_out[dest] = val;
}
```

### Merge Sort on GPU

Merge sort is naturally parallelizable: independent sub-arrays can be merged in parallel.

```
Level 0: N individual elements (trivially sorted)
         [5][3][8][1][7][2][6][4]

Level 1: N/2 merges of pairs (all independent, all parallel)
         [3,5] [1,8] [2,7] [4,6]

Level 2: N/4 merges of quads (all independent, all parallel)
         [1,3,5,8] [2,4,6,7]

Level 3: 1 merge of the two halves
         [1,2,3,4,5,6,7,8]
```

GPU merge sort typically uses bitonic sort for small sub-arrays (fits in shared memory), then parallel merge for larger ones.

### When GPU Sort Wins

| Scenario | Winner | Why |
|----------|--------|-----|
| N < 100K | CPU | Transfer overhead dominates |
| N > 1M, uniform keys | GPU | Radix sort shines |
| N > 1M, comparison-based | GPU | Bitonic/merge parallelism |
| Repeated sorts (data on GPU) | GPU | No transfer cost |
| Sort as part of GPU pipeline | GPU | Avoids GPU-CPU round trip |
| Complex comparison function | CPU | GPU branching is expensive |
| Already nearly sorted | CPU | Adaptive algorithms (Timsort) |

---

## 4. Histogram

### The Problem

Count occurrences of each value in a dataset.

```
Input:  [3, 1, 0, 3, 2, 1, 3, 0, 2, 1]
Bins:    0  1  2  3
Output: [2, 3, 2, 3]
```

### Naive Histogram with Global Atomics

```cuda
// Simple but slow -- heavy atomic contention on global memory
__global__ void histogramNaive(const int *data, int *hist, int n) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < n) {
        atomicAdd(&hist[data[tid]], 1);
    }
}
```

**Problem**: When many threads hit the same bin, atomic operations serialize. If the data distribution is skewed (many elements map to the same bin), this becomes a severe bottleneck.

```
Thread 0: atomicAdd(&hist[3], 1)  --+
Thread 1: atomicAdd(&hist[3], 1)  --+-- All serialize on hist[3]!
Thread 2: atomicAdd(&hist[3], 1)  --+
Thread 3: atomicAdd(&hist[1], 1)  ---- Independent, no contention
```

### Privatized Histogram with Shared Memory

Each block builds a private histogram in shared memory (fast atomics), then adds block histograms into the global result.

```
Strategy:

Block 0:  data=[3,1,0,3]     Block 1:  data=[2,1,3,0]
  private_hist=[1,1,0,2]       private_hist=[1,1,1,1]

          \                        /
           +--- atomicAdd to global ---+
                hist = [2, 3, 2, 3]
```

```cuda
#define NUM_BINS 256

__global__ void histogramShared(const int *data, int *hist, int n) {
    __shared__ int shist[NUM_BINS];

    int tid = threadIdx.x;
    int gid = blockIdx.x * blockDim.x + threadIdx.x;

    // Initialize shared histogram to zero
    // (multiple threads cooperate if NUM_BINS > blockDim.x)
    for (int i = tid; i < NUM_BINS; i += blockDim.x) {
        shist[i] = 0;
    }
    __syncthreads();

    // Accumulate into shared memory (fast atomics)
    if (gid < n) {
        atomicAdd(&shist[data[gid]], 1);
    }
    __syncthreads();

    // Write shared histogram to global memory
    for (int i = tid; i < NUM_BINS; i += blockDim.x) {
        if (shist[i] > 0) {
            atomicAdd(&hist[i], shist[i]);
        }
    }
}
```

**Why shared memory atomics are faster:**
- Shared memory atomic operations are resolved within the SM (streaming multiprocessor)
- Global memory atomics must travel through the memory hierarchy
- Shared memory atomics: ~5-10 cycles
- Global memory atomics: ~hundreds of cycles

### Multi-Pass Approach for Large Bin Counts

When the number of bins is large (e.g., 64K bins), the private histogram does not fit in shared memory (~48 KB). Solutions:

**Approach 1: Process a subset of bits per pass**

```
Pass 1: Histogram of lower 8 bits (256 bins, fits in shared memory)
Pass 2: Histogram of upper 8 bits (256 bins)
Combine passes to get full 16-bit histogram
```

**Approach 2: Multiple sub-histograms per block**

```cuda
// Process data in chunks, each chunk uses a shared-memory histogram
__global__ void histogramLargeBins(const int *data, int *hist,
                                   int n, int numBins) {
    extern __shared__ int shist[];
    int tid = threadIdx.x;
    int stride = blockDim.x * gridDim.x;

    // Process data in tiles, each tile covers a range of bins
    int binsPerTile = blockDim.x;  // Fit in shared memory

    for (int binStart = 0; binStart < numBins; binStart += binsPerTile) {
        // Clear shared histogram for this tile
        if (tid < binsPerTile) shist[tid] = 0;
        __syncthreads();

        // Scan all data, only count elements in this bin range
        for (int i = blockIdx.x * blockDim.x + tid; i < n; i += stride) {
            int bin = data[i];
            if (bin >= binStart && bin < binStart + binsPerTile) {
                atomicAdd(&shist[bin - binStart], 1);
            }
        }
        __syncthreads();

        // Flush to global
        if (tid < binsPerTile && binStart + tid < numBins) {
            atomicAdd(&hist[binStart + tid], shist[tid]);
        }
        __syncthreads();
    }
}
```

### Performance Comparison

```
                Naive        Shared Mem     Multi-Pass
              (global       (privatized)   (large bins)
               atomics)
  Small bins    Slow          FAST           N/A
  (256)
  Uniform       OK            FAST           N/A
  distribution
  Skewed        VERY SLOW     Good           N/A
  distribution  (contention)
  Large bins    Slow          Won't fit      Moderate
  (64K+)                     in shmem
```

---

## 5. Stencil Computations

### The Pattern

Each output element is computed from a fixed neighborhood of input elements.

```
1D Stencil (radius=1):
  output[i] = c0*input[i-1] + c1*input[i] + c2*input[i+1]

2D Stencil (radius=1, 5-point):
                    input[y-1][x]
                         |
  input[y][x-1] -- input[y][x] -- input[y][x+1]
                         |
                    input[y+1][x]

  output[y][x] = c0*input[y][x]   + c1*input[y-1][x]
               + c2*input[y+1][x]  + c3*input[y][x-1]
               + c4*input[y][x+1]
```

### Applications

- Image blur (box filter, Gaussian blur)
- Edge detection (Sobel, Laplacian)
- Heat equation simulation
- Convolution in CNNs
- Jacobi / Gauss-Seidel iterative solvers
- Cellular automata (Game of Life)

### Naive 1D Stencil

```cuda
// Each thread reads from global memory -- redundant reads!
__global__ void stencil1D_naive(const float *in, float *out,
                                int n, int radius) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        float result = 0.0f;
        for (int offset = -radius; offset <= radius; offset++) {
            int idx = i + offset;
            if (idx >= 0 && idx < n) {
                result += in[idx];  // Each element read by 2*radius+1 threads!
            }
        }
        out[i] = result / (2 * radius + 1);
    }
}
```

**Problem**: Element `in[i]` is read by threads computing `out[i-radius]` through `out[i+radius]`. That is `2*radius+1` redundant global memory reads per element.

### Halo Regions and Shared Memory Optimization

The key optimization: load a tile plus its halo (boundary elements needed by the stencil) into shared memory once, then compute from shared memory.

```
Block covers elements [blockStart, blockStart+blockDim):
But needs to READ elements [blockStart-radius, blockStart+blockDim+radius):

|<--halo-->|<---------- block data ---------->|<--halo-->|
  radius              blockDim.x                 radius

Global:  [.....HHHH|DDDDDDDDDDDDDDDDDDDDDDDDDD|HHHH.....]
                    ^                            ^
               blockStart              blockStart+blockDim

Shared:  [HHHH|DDDDDDDDDDDDDDDDDDDDDDDDDDDD|HHHH]
          halo          block data              halo
```

```cuda
#define BLOCK_SIZE 256
#define RADIUS 3

__global__ void stencil1D_shared(const float *in, float *out, int n) {
    // Shared memory: block data + left halo + right halo
    __shared__ float smem[BLOCK_SIZE + 2 * RADIUS];

    int gid = blockIdx.x * blockDim.x + threadIdx.x;
    int lid = threadIdx.x + RADIUS;  // Offset by RADIUS for halo

    // Load main data
    if (gid < n) {
        smem[lid] = in[gid];
    } else {
        smem[lid] = 0.0f;
    }

    // Load left halo
    if (threadIdx.x < RADIUS) {
        int haloIdx = gid - RADIUS;
        smem[lid - RADIUS] = (haloIdx >= 0) ? in[haloIdx] : 0.0f;
    }

    // Load right halo
    if (threadIdx.x >= blockDim.x - RADIUS) {
        int haloIdx = gid + RADIUS;
        smem[lid + RADIUS] = (haloIdx < n) ? in[haloIdx] : 0.0f;
    }

    __syncthreads();

    // Compute stencil from shared memory (no global reads!)
    if (gid < n) {
        float result = 0.0f;
        for (int offset = -RADIUS; offset <= RADIUS; offset++) {
            result += smem[lid + offset];
        }
        out[gid] = result / (2 * RADIUS + 1);
    }
}
```

### 2D Stencil with Shared Memory

```
2D tile with halo:

+---+-------------------+---+
| H |     top halo      | H |  H = corner halo
+---+-------------------+---+
|   |                   |   |
| l |                   | r |
| e |    tile data      | i |
| f |    (TILE_W x      | g |
| t |     TILE_H)       | h |
|   |                   | t |
| h |                   |   |
| a |                   | h |
| l |                   | a |
| o |                   | l |
|   |                   | o |
+---+-------------------+---+
| H |   bottom halo     | H |
+---+-------------------+---+
```

```cuda
#define TILE_W 16
#define TILE_H 16
#define STENCIL_RADIUS 1
#define SHARED_W (TILE_W + 2 * STENCIL_RADIUS)
#define SHARED_H (TILE_H + 2 * STENCIL_RADIUS)

__global__ void stencil2D(const float *in, float *out,
                          int width, int height) {
    __shared__ float smem[SHARED_H][SHARED_W];

    int tx = threadIdx.x;
    int ty = threadIdx.y;
    int gx = blockIdx.x * TILE_W + tx;
    int gy = blockIdx.y * TILE_H + ty;

    // Local indices in shared memory (offset by radius)
    int sx = tx + STENCIL_RADIUS;
    int sy = ty + STENCIL_RADIUS;

    // Load center tile
    if (gx < width && gy < height) {
        smem[sy][sx] = in[gy * width + gx];
    } else {
        smem[sy][sx] = 0.0f;
    }

    // Load halos -- boundary threads load extra elements
    // Left halo
    if (tx < STENCIL_RADIUS) {
        int hx = gx - STENCIL_RADIUS;
        smem[sy][sx - STENCIL_RADIUS] =
            (hx >= 0 && gy < height) ? in[gy * width + hx] : 0.0f;
    }
    // Right halo
    if (tx >= TILE_W - STENCIL_RADIUS) {
        int hx = gx + STENCIL_RADIUS;
        smem[sy][sx + STENCIL_RADIUS] =
            (hx < width && gy < height) ? in[gy * width + hx] : 0.0f;
    }
    // Top halo
    if (ty < STENCIL_RADIUS) {
        int hy = gy - STENCIL_RADIUS;
        smem[sy - STENCIL_RADIUS][sx] =
            (hy >= 0 && gx < width) ? in[hy * width + gx] : 0.0f;
    }
    // Bottom halo
    if (ty >= TILE_H - STENCIL_RADIUS) {
        int hy = gy + STENCIL_RADIUS;
        smem[sy + STENCIL_RADIUS][sx] =
            (hy < height && gx < width) ? in[hy * width + gx] : 0.0f;
    }
    // Corner halos (handled by corner threads)
    if (tx < STENCIL_RADIUS && ty < STENCIL_RADIUS) {
        int hx = gx - STENCIL_RADIUS;
        int hy = gy - STENCIL_RADIUS;
        smem[sy - STENCIL_RADIUS][sx - STENCIL_RADIUS] =
            (hx >= 0 && hy >= 0) ? in[hy * width + hx] : 0.0f;
    }
    // (Similar for other 3 corners -- omitted for brevity)

    __syncthreads();

    // Compute 5-point stencil
    if (gx < width && gy < height) {
        float result = 4.0f * smem[sy][sx]
                     - smem[sy - 1][sx]
                     - smem[sy + 1][sx]
                     - smem[sy][sx - 1]
                     - smem[sy][sx + 1];
        out[gy * width + gx] = result;
    }
}
```

### Heat Equation Example

The 2D heat equation with explicit Euler:

```
T_new[y][x] = T[y][x] + alpha * dt * (
    T[y-1][x] + T[y+1][x] + T[y][x-1] + T[y][x+1] - 4*T[y][x]
)
```

This is exactly a 2D 5-point stencil iterated over time steps. Each time step reads the current temperature grid and writes the next one. The stencil kernel above (with appropriate coefficients) computes one time step.

### Boundary Handling Strategies

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| Zero padding | Treat out-of-bounds as 0 | Signal processing |
| Clamped | Replicate edge values | Image processing |
| Periodic (wrap) | Wrap around to opposite edge | Physics simulations |
| Reflected | Mirror at boundary | Image filtering |
| Ghost cells | Extra rows/columns with boundary values | PDE solvers |

---

## 6. Compact / Stream Compaction

### The Problem

Given an array and a predicate, extract only the elements that satisfy the predicate, packed contiguously.

```
Input:      [5, 2, 8, 1, 9, 3, 7, 4]
Predicate:  is_even? -> [0, 1, 1, 0, 0, 0, 0, 1]
                         F  T  T  F  F  F  F  T

Output:     [2, 8, 4]   (only even numbers, packed)
```

This appears everywhere: removing dead particles in simulations, filtering search results, sparse matrix operations, removing empty cells.

### Algorithm Using Scan

```
Step 1: Evaluate predicate
  Input:     [5,  2,  8,  1,  9,  3,  7,  4]
  Flags:     [0,  1,  1,  0,  0,  0,  0,  1]

Step 2: Exclusive scan of flags (gives output positions)
  Scanned:   [0,  0,  1,  2,  2,  2,  2,  2]
              ^   ^   ^       ^               ^
              |   |   |       |               |
              |   pos=0  pos=1  (skipped)    pos=2
              (skipped)

Step 3: Scatter -- if flag[i]==1, write input[i] to output[scanned[i]]
  output[0] = input[1] = 2   (flag[1]=1, scanned[1]=0)
  output[1] = input[2] = 8   (flag[2]=1, scanned[2]=1)
  output[2] = input[7] = 4   (flag[7]=1, scanned[7]=2)

Step 4: Total output count = scanned[N-1] + flags[N-1] = 2 + 1 = 3
```

```
ASCII diagram:

Input:   [5]  [2]  [8]  [1]  [9]  [3]  [7]  [4]
          |    |    |    |    |    |    |    |
Pred:    [0]  [1]  [1]  [0]  [0]  [0]  [0]  [1]
          |    |    |    |    |    |    |    |
Scan:    [0]  [0]  [1]  [2]  [2]  [2]  [2]  [2]
               |    |                        |
               v    v                        v
Output: [ 2 ][ 8 ][ 4 ]
         [0]  [1]  [2]
```

### CUDA Implementation

```cuda
// Step 1: Compute predicate flags
__global__ void computeFlags(const int *input, int *flags, int n) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < n) {
        flags[tid] = (input[tid] % 2 == 0) ? 1 : 0;
    }
}

// Step 2: Exclusive scan of flags (use scanLargeArray from Section 2)

// Step 3: Scatter
__global__ void scatter(const int *input, const int *flags,
                        const int *scanned, int *output, int n) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < n && flags[tid] == 1) {
        output[scanned[tid]] = input[tid];
    }
}

// Host orchestration
void compact(int *d_input, int *d_output, int *d_count, int n) {
    int *d_flags, *d_scanned;
    cudaMalloc(&d_flags, n * sizeof(int));
    cudaMalloc(&d_scanned, n * sizeof(int));

    int threads = 256;
    int blocks = (n + threads - 1) / threads;

    // Step 1: Evaluate predicate
    computeFlags<<<blocks, threads>>>(d_input, d_flags, n);

    // Step 2: Exclusive scan
    cudaMemcpy(d_scanned, d_flags, n * sizeof(int), cudaMemcpyDeviceToDevice);
    scanLargeArray(d_scanned, n);  // From Section 2

    // Step 3: Scatter
    scatter<<<blocks, threads>>>(d_input, d_flags, d_scanned, d_output, n);

    // Step 4: Count = scanned[N-1] + flags[N-1]
    int lastScan, lastFlag;
    cudaMemcpy(&lastScan, &d_scanned[n - 1], sizeof(int),
               cudaMemcpyDeviceToHost);
    cudaMemcpy(&lastFlag, &d_flags[n - 1], sizeof(int),
               cudaMemcpyDeviceToHost);
    int count = lastScan + lastFlag;
    cudaMemcpy(d_count, &count, sizeof(int), cudaMemcpyHostToDevice);

    cudaFree(d_flags);
    cudaFree(d_scanned);
}
```

### Practical Applications

| Application | Predicate | Purpose |
|-------------|-----------|---------|
| Particle simulation | `is_alive(particle)` | Remove dead particles |
| Collision detection | `has_collision(pair)` | Extract colliding pairs |
| Ray tracing | `ray_hit(ray)` | Keep only rays that hit geometry |
| Database query | `matches_where(row)` | Filter rows |
| Sparse matrix | `value != 0` | Convert dense to sparse |
| Mesh processing | `is_visible(triangle)` | Frustum culling |

---

## 7. Map, Scatter, Gather

These are the simplest parallel primitives but understanding their performance characteristics is critical.

### Map

Apply a function to every element independently. This is the "embarrassingly parallel" pattern.

```
Map f over [a, b, c, d]:
  [f(a), f(b), f(c), f(d)]

All operations are independent -- perfect parallelism.
```

```cuda
// Map: element-wise square
__global__ void mapSquare(const float *in, float *out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = in[i] * in[i];
    }
}
```

Map has perfect memory access: coalesced reads and coalesced writes. Every thread accesses a unique location. No synchronization needed.

### Gather (Indexed Reads)

Each output element reads from an input-dependent location.

```
Input:   [A, B, C, D, E]
Indices: [3, 0, 4, 1, 2]

output[0] = input[indices[0]] = input[3] = D
output[1] = input[indices[1]] = input[0] = A
output[2] = input[indices[2]] = input[4] = E
output[3] = input[indices[3]] = input[1] = B
output[4] = input[indices[4]] = input[2] = C

Output:  [D, A, E, B, C]
```

```cuda
// Gather: rearrange elements according to index map
__global__ void gather(const float *in, const int *indices,
                       float *out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = in[indices[i]];  // Random READ, coalesced WRITE
    }
}
```

**Performance**: Writes are coalesced (sequential output positions), but reads are random (determined by indices). Random reads may cause many cache misses but are generally tolerable because the GPU memory system is optimized for throughput.

### Scatter (Indexed Writes)

Each input element writes to an output-dependent location.

```
Input:    [A, B, C, D, E]
Indices:  [3, 0, 4, 1, 2]

output[indices[0]] = input[0]  -->  output[3] = A
output[indices[1]] = input[1]  -->  output[0] = B
output[indices[2]] = input[2]  -->  output[4] = C
output[indices[3]] = input[3]  -->  output[1] = D
output[indices[4]] = input[4]  -->  output[2] = E

Output:  [B, D, E, A, C]
```

```cuda
// Scatter: write each element to its target position
__global__ void scatterKernel(const float *in, const int *indices,
                              float *out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[indices[i]] = in[i];  // Coalesced READ, random WRITE
    }
}
```

**Performance**: Reads are coalesced, but writes are random. Random writes are more problematic than random reads because:
1. Write conflicts: Two threads may write to the same location (race condition)
2. Write coalescing is harder for the hardware to optimize
3. Partial cache line writes waste bandwidth

### Performance Comparison

```
Pattern     Reads          Writes          Preferred?
--------    ----------     ----------      ----------
Map         Coalesced      Coalesced       Best
Gather      Random         Coalesced       Good
Scatter     Coalesced      Random          Acceptable
Both rand.  Random         Random          Avoid!

Rule of thumb: PREFER GATHER OVER SCATTER

Reason: Random reads can be absorbed by the cache hierarchy and
memory system better than random writes. Gather also avoids
write conflicts entirely.
```

### Scatter-to-Gather Transformation

Many algorithms can be restructured from scatter to gather by inverting the perspective:

```
Scatter (output-centric):
  "Where does input[i] go?"
  for each input element:
    output[dest(i)] = input[i]

Gather (input-centric -- preferred):
  "Where does output[i] come from?"
  for each output element:
    output[i] = input[src(i)]
```

If you can compute `src(i)` from `i` (the inverse of `dest`), always prefer the gather form.

---

## 8. SpMV (Sparse Matrix-Vector Multiply)

### The Problem

Compute y = A * x, where A is a sparse matrix (mostly zeros).

```
A = | 1  0  2  0 |      x = | 1 |      y = | 1*1 + 2*3 |   | 7  |
    | 0  3  0  0 |          | 2 |          | 3*2       |   | 6  |
    | 4  0  5  6 |          | 3 |          | 4*1+5*3+6*4| = | 43 |
    | 0  0  0  7 |          | 4 |          | 7*4       |   | 28 |

Only 7 nonzeros out of 16 elements (56% sparse).
Real matrices: often >99% sparse.
```

Dense storage wastes memory and compute on zeros. Sparse formats store only the nonzero values.

### CSR (Compressed Sparse Row) Format

The most common sparse format. Stores nonzeros row by row.

```
Matrix A:
  Row 0: (col=0, val=1), (col=2, val=2)
  Row 1: (col=1, val=3)
  Row 2: (col=0, val=4), (col=2, val=5), (col=3, val=6)
  Row 3: (col=3, val=7)

CSR arrays:
  values:     [1, 2, 3, 4, 5, 6, 7]    (all nonzeros, row by row)
  col_idx:    [0, 2, 1, 0, 2, 3, 3]    (column of each nonzero)
  row_ptr:    [0, 2, 3, 6, 7]          (start of each row in values[])
              ^  ^  ^  ^  ^
              |  |  |  |  +-- end sentinel (= total nnz)
              |  |  |  +-- row 3 starts at index 6
              |  |  +-- row 2 starts at index 3
              |  +-- row 1 starts at index 2
              +-- row 0 starts at index 0
```

**One-thread-per-row CSR SpMV:**

```cuda
// Simple CSR SpMV: one thread per row
__global__ void spmv_csr(int numRows,
                         const int *row_ptr, const int *col_idx,
                         const float *values, const float *x,
                         float *y) {
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < numRows) {
        float sum = 0.0f;
        int rowStart = row_ptr[row];
        int rowEnd   = row_ptr[row + 1];
        for (int j = rowStart; j < rowEnd; j++) {
            sum += values[j] * x[col_idx[j]];
        }
        y[row] = sum;
    }
}
```

**Problem**: Rows may have very different lengths. If row 0 has 2 nonzeros and row 2 has 1000, thread 0 finishes quickly while thread 2 does 500x more work. Warp threads idle waiting for the slowest thread.

```
Warp threads processing rows with different nnz counts:

Thread 0 (nnz=2):    ##|idle idle idle idle idle idle ...
Thread 1 (nnz=1):    #|idle idle idle idle idle idle idle ...
Thread 2 (nnz=1000): ########################################
Thread 3 (nnz=5):    #####|idle idle idle idle idle ...
...
Thread 31(nnz=3):    ###|idle idle idle idle idle idle ...

Most threads are idle, waiting for thread 2!
```

**One-warp-per-row CSR SpMV (better load balance for long rows):**

```cuda
// CSR SpMV: one warp per row
__global__ void spmv_csr_warp(int numRows,
                              const int *row_ptr, const int *col_idx,
                              const float *values, const float *x,
                              float *y) {
    int warpId = (blockIdx.x * blockDim.x + threadIdx.x) / warpSize;
    int lane = threadIdx.x % warpSize;

    if (warpId < numRows) {
        float sum = 0.0f;
        int rowStart = row_ptr[warpId];
        int rowEnd   = row_ptr[warpId + 1];

        // Each lane processes a subset of the row's nonzeros
        for (int j = rowStart + lane; j < rowEnd; j += warpSize) {
            sum += values[j] * x[col_idx[j]];
        }

        // Warp reduction to combine partial sums
        for (int offset = warpSize / 2; offset > 0; offset >>= 1) {
            sum += __shfl_down_sync(0xFFFFFFFF, sum, offset);
        }

        if (lane == 0) {
            y[warpId] = sum;
        }
    }
}
```

### CSC (Compressed Sparse Column) Format

Same as CSR, but compressed by columns instead of rows.

```
CSC arrays (same matrix A):
  values:     [1, 4, 3, 2, 5, 6, 7]    (all nonzeros, column by column)
  row_idx:    [0, 2, 1, 0, 2, 2, 3]    (row of each nonzero)
  col_ptr:    [0, 2, 3, 5, 7]          (start of each column)
```

CSC is rarely used for SpMV on GPUs because computing `y[row]` requires scanning all columns, leading to scattered writes. CSC is more useful for sparse matrix-transpose-vector or for column-oriented operations.

### ELL (ELLPACK) Format

Pad all rows to the same length (the maximum row length), storing in a column-major 2D array.

```
Matrix A rows:
  Row 0: (0,1) (2,2)          -- length 2
  Row 1: (1,3)                 -- length 1
  Row 2: (0,4) (2,5) (3,6)    -- length 3 (max!)
  Row 3: (3,7)                 -- length 1

Max row length = 3. Pad shorter rows with (*, 0):

ELL indices (4 rows x 3 cols, column-major):
  col 0: [0, 1, 0, 3]    (first nonzero of each row)
  col 1: [2, *, 2, *]    (second nonzero, * = padding)
  col 2: [*, *, 3, *]    (third nonzero)

ELL values (4 rows x 3 cols, column-major):
  col 0: [1, 3, 4, 7]
  col 1: [2, 0, 5, 0]    (0 = padding value)
  col 2: [0, 0, 6, 0]
```

**Why column-major**: Threads in a warp process consecutive rows. Column-major layout means thread i accesses `values[col * numRows + i]`, and consecutive threads access consecutive memory addresses -- perfect coalescing.

```cuda
// ELL SpMV: excellent memory coalescing
__global__ void spmv_ell(int numRows, int maxRowLen,
                         const int *indices, const float *values,
                         const float *x, float *y) {
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < numRows) {
        float sum = 0.0f;
        for (int j = 0; j < maxRowLen; j++) {
            int idx = j * numRows + row;   // Column-major access
            int col = indices[idx];
            float val = values[idx];
            if (val != 0.0f) {             // Skip padding
                sum += val * x[col];
            }
        }
        y[row] = sum;
    }
}
```

### Format Comparison

```
Format   Memory         Coalescing    Load Balance    Best For
------   ------         ----------    ------------    --------
CSR      O(nnz + N)     Poor          Poor            General purpose
CSR+warp O(nnz + N)     Moderate      Better          Long rows
ELL      O(N * maxLen)  Excellent     Perfect         Uniform row length
COO      O(3 * nnz)     Poor          Perfect         Very irregular
HYB      O(varies)      Good          Good            Mixed workloads

COO = Coordinate format: store (row, col, val) triples
HYB = Hybrid: ELL for regular part + COO for overflow
```

```
When each format wins:

Row length distribution:

Uniform (all rows ~same length):
  [====] [====] [====] [====]    --> ELL wins (no padding waste)

Moderate variation:
  [==] [====] [===] [=====]      --> CSR with warp-per-row

Highly skewed (power-law):
  [=] [==] [=] [========================]  --> HYB or COO
  (ELL wastes space padding to max length)
```

---

## 9. Work Complexity vs Span

### Definitions

For a parallel algorithm:
- **Work (W)**: Total number of operations across all processors. This is what a sequential execution would do.
- **Span (S)** (also called "depth" or "critical path"): The longest chain of sequential dependencies. This is the runtime on an infinite number of processors.

```
Example: Tree reduction of 8 elements

     a0  a1  a2  a3  a4  a5  a6  a7
      \  /    \  /    \  /    \  /      Step 1: 4 ops (parallel)
       +       +       +       +
        \    /           \    /         Step 2: 2 ops (parallel)
          +                +
            \            /              Step 3: 1 op
               +------+

Work = 4 + 2 + 1 = 7 = O(N)
Span = 3 steps = O(log N)
```

### Brent's Theorem

**Brent's theorem** gives the runtime T_p on p processors:

```
T_p <= W/p + S

where:
  T_p = runtime on p processors
  W   = total work
  S   = span (critical path length)
  p   = number of processors
```

**Intuition**: You cannot do better than W/p (dividing work evenly) and you cannot do better than S (sequential dependency chain). The actual runtime is bounded by their sum.

**Example**: Reduction of N = 1,000,000 elements on p = 1000 processors.

```
W = N = 1,000,000
S = log2(N) ~ 20

T_1000 <= 1,000,000/1000 + 20 = 1000 + 20 = 1020

Compare to sequential: T_1 = 1,000,000
Speedup ~ 1,000,000/1020 ~ 980x on 1000 processors

Near-linear speedup because W/p >> S.
```

### Work-Efficient vs Step-Efficient

Two categories of parallel algorithms:

| Property | Work-Efficient | Step-Efficient |
|----------|----------------|----------------|
| Work | O(same as sequential) | O(more than sequential) |
| Span | O(log N) or O(log^2 N) | O(log N) |
| Example | Blelloch scan | Hillis-Steele scan |
| Work | O(N) | O(N log N) |
| Processors needed | O(N / log N) | O(N) |

**When does it matter?**

For GPUs with thousands of cores, both can be fast for moderate N. But for very large N:

```
Hillis-Steele (step-efficient):
  W = O(N log N), S = O(log N)
  T_p = N*log(N)/p + log(N)

Blelloch (work-efficient):
  W = O(N), S = O(log N)
  T_p = N/p + log(N)

For N = 10^8, p = 10^4:
  Hillis-Steele: T ~ 10^8 * 27 / 10^4 + 27 = 270,000 + 27 ~ 270,027
  Blelloch:      T ~ 10^8 / 10^4 + 27       = 10,000 + 27  ~ 10,027

Blelloch is 27x faster! Work-efficiency dominates at large N.
```

### Analyzing Common Algorithms

```
Algorithm              Work         Span         Work-Efficient?
---------              ----         ----         ---------------
Parallel reduction     O(N)         O(log N)     Yes
Hillis-Steele scan     O(N log N)   O(log N)     No
Blelloch scan          O(N)         O(log N)     Yes
Bitonic sort           O(N log^2 N) O(log^2 N)   No (vs O(N log N))
Parallel merge sort    O(N log N)   O(log^2 N)   Yes
Radix sort             O(N * k)     O(k * log N) Yes (k = key bits)
SpMV (CSR)             O(nnz)       O(maxRowLen) Yes
Matrix multiply        O(N^3)       O(log N)     Yes
```

### Parallelism and Scalability

**Available parallelism** = W / S. This is the maximum number of processors that can be usefully employed.

```
Algorithm          W / S             Available Parallelism
---------          -----             ---------------------
Reduction          N / log N         For N=10^6: ~50,000
Blelloch scan      N / log N         For N=10^6: ~50,000
Bitonic sort       N log N / log N   N = 10^6
Merge sort         N log N / log^2 N For N=10^6: ~50,000
Matrix multiply    N^3 / log N       For N=1000: ~50,000,000
```

If available parallelism >> p (number of processors), the algorithm scales well on your hardware.

### Practical Implications for GPU Programming

```
Decision tree for choosing algorithms:

Is N large relative to GPU cores?
  |
  +-- Yes (N >> num_cores * 10)
  |     |
  |     +-- Prefer WORK-EFFICIENT algorithms
  |         (Blelloch scan, merge sort)
  |         Reason: W/p dominates T_p
  |
  +-- No (N ~ num_cores)
        |
        +-- Prefer STEP-EFFICIENT algorithms
            (Hillis-Steele scan, bitonic sort)
            Reason: S dominates T_p, and simpler code
                    with fewer synchronization points
```

### Work-Span Analysis Checklist

When analyzing a parallel algorithm:

1. **Count total operations (Work)**: Add up all operations across all processors and all steps. Compare to the best sequential algorithm.
2. **Find the critical path (Span)**: Identify the longest chain of operations where each depends on the previous.
3. **Compute parallelism (W/S)**: Does it exceed your hardware parallelism? If not, the algorithm will underutilize the GPU.
4. **Apply Brent's theorem**: T_p <= W/p + S. Is the predicted runtime acceptable?
5. **Consider constants**: Big-O hides constants. Hillis-Steele with simpler per-step logic may beat Blelloch for small N despite worse asymptotic work.

---

## Summary: The Parallel Algorithm Toolkit

```
+------------------------------------------------------------------------+
|                    PARALLEL ALGORITHM CHEAT SHEET                        |
+------------------------------------------------------------------------+
|                                                                        |
|  REDUCTION          SCAN               SORT                            |
|  +-----------+      +-----------+      +------------------+            |
|  | Sum/Max/  |      | Prefix    |      | Bitonic: Simple, |            |
|  | Min of N  |      | sums for  |      |   O(N log^2 N)  |            |
|  | elements  |      | scatter   |      | Radix: Fast for  |            |
|  | O(N) work |      | addresses |      |   integers       |            |
|  | O(logN)   |      | O(N) work |      | Merge: General   |            |
|  | span      |      | O(logN)   |      |   purpose        |            |
|  +-----------+      | span      |      +------------------+            |
|                     +-----------+                                      |
|  HISTOGRAM          STENCIL            COMPACTION                      |
|  +-----------+      +-----------+      +------------------+            |
|  | Privatize |      | Shared mem|      | Predicate + Scan |            |
|  | in shared |      | with halo |      | + Scatter =      |            |
|  | memory    |      | regions   |      | filtered output  |            |
|  | to reduce |      | for data  |      | O(N) work        |            |
|  | atomic    |      | reuse     |      | O(logN) span     |            |
|  | contention|      |           |      |                  |            |
|  +-----------+      +-----------+      +------------------+            |
|                                                                        |
|  MAP/SCATTER/       SpMV               COMPLEXITY                      |
|  GATHER             +-----------+      +------------------+            |
|  +-----------+      | CSR: Gen  |      | Work = total ops |            |
|  | Map: best |      |   purpose |      | Span = critical  |            |
|  | Gather:   |      | ELL: Reg  |      |   path length    |            |
|  |   random  |      |   rows    |      | T_p <= W/p + S   |            |
|  |   reads OK|      | HYB: Mix  |      | Prefer work-eff  |            |
|  | Scatter:  |      |   of both |      |   for large N    |            |
|  |   avoid   |      |           |      |                  |            |
|  +-----------+      +-----------+      +------------------+            |
|                                                                        |
+------------------------------------------------------------------------+
```

### Key Takeaways

1. **Reduction** is the most fundamental pattern. Master the progression from naive to warp-shuffle-optimized. The techniques (sequential addressing, first-add-during-load, warp shuffle) apply to many other algorithms.

2. **Scan (prefix sum)** is the workhorse of parallel computing. It turns sequential dependencies into parallel scatter addresses. Blelloch's algorithm is work-efficient; Hillis-Steele is simpler but does more work.

3. **Bitonic sort** is the go-to GPU sort because its fixed comparison pattern maps perfectly to SIMT execution. No divergent branches. Radix sort is faster for integer keys when combined with scan.

4. **Privatized histograms** in shared memory dramatically reduce atomic contention. This pattern of "local accumulation then global merge" appears in many algorithms beyond histograms.

5. **Stencil computations** benefit enormously from shared memory tiling with halo regions. The ratio of halo to tile size determines the benefit -- larger tiles have better ratios.

6. **Stream compaction** = predicate + scan + scatter. This three-step pattern compresses sparse data and appears in ray tracing, particle simulation, and database operations.

7. **Prefer gather over scatter**. Random reads are cheaper than random writes on GPUs. Restructure algorithms to have coalesced writes whenever possible.

8. **Choose SpMV format based on row length distribution**. ELL for uniform rows, CSR for moderate variation, HYB for power-law distributions.

9. **Work complexity determines performance at scale**. Use Brent's theorem to analyze whether a "faster" parallel algorithm actually improves runtime on your specific hardware with your specific problem size.

---

## Practice Problems

1. **Reduction variants**: Implement a parallel max-reduction. Then implement argmax (return both the max value and its index). What changes in the warp shuffle phase?

2. **Segmented scan**: Implement a scan that resets at segment boundaries. Given flags `[1,0,0,1,0,0,0,1]` and values `[3,1,4,1,5,9,2,6]`, compute `[3,4,8,1,6,15,17,6]`.

3. **Radix sort**: Implement a complete 32-bit integer radix sort that processes 4 bits per pass (8 passes total). Compare performance against `thrust::sort`.

4. **2D convolution**: Implement a 2D convolution kernel that uses shared memory with halo regions and constant memory for the filter coefficients.

5. **Stream compaction benchmark**: Compare the performance of scan-based compaction versus using `atomicAdd` to a global counter for the output index. At what data size and selectivity ratio does scan win?

6. **SpMV format comparison**: Generate random sparse matrices with (a) uniform row lengths, (b) power-law row lengths. Benchmark CSR, ELL, and HYB formats on each. Verify the predictions from Section 8.

7. **Work-span analysis**: Analyze the work and span of your segmented scan implementation. Is it work-efficient?

---

*Next chapter: [07-MEMORY-OPTIMIZATION](07-MEMORY-OPTIMIZATION.md) -- Deep dive into memory coalescing, bank conflicts, and the full GPU memory hierarchy.*
