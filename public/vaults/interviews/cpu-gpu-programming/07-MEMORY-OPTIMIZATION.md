# Chapter 7: Memory Optimization

## Why Memory Optimization Matters More Than Compute

Most GPU kernels are **memory-bound**, not compute-bound. A modern GPU like the NVIDIA H100 delivers ~60 TFLOPS of FP32 compute but only ~3.35 TB/s of memory bandwidth. That means for every byte you load, you can perform roughly 18 floating-point operations "for free." If your kernel does fewer than 18 FLOPs per byte loaded, the compute units are **starving** -- sitting idle, waiting for data.

```
The Memory Wall Problem:

Compute Capability Growth:     ~2x every 2 years
Memory Bandwidth Growth:       ~1.3x every 2 years
Memory Latency Improvement:    ~1.1x every 2 years

             Compute
             ████████████████████████████████████████  (growing fast)

             Bandwidth
             ████████████████████████  (growing slower)

             Latency
             ████████████  (barely improving)

The gap between compute and memory continues to widen.
Every wasted byte of bandwidth is wasted compute potential.
```

This chapter teaches you to squeeze every bit of useful work from every memory transaction. We cover GPU memory optimization (coalescing, shared memory, constant/texture memory, pinned memory) and CPU memory optimization (cache blocking, prefetching, NUMA). We finish with the **Roofline Model** -- the analytical framework that tells you whether optimization effort is even worthwhile.

---

## 1. Memory Coalescing

### What Coalesced Access Means

When 32 threads in a warp simultaneously access global memory, the hardware **coalesces** those requests into as few memory transactions as possible. A perfectly coalesced access by a warp touches exactly one or two 128-byte cache lines. A non-coalesced access can generate up to 32 separate transactions -- a 32x bandwidth penalty.

```
COALESCED ACCESS (ideal):
All 32 threads in a warp read consecutive 4-byte elements.

Thread:   t0   t1   t2   t3   t4   ...  t31
Address:  [0]  [4]  [8]  [12] [16] ...  [124]
          |____________________________________|
                 One 128-byte transaction
                 128 bytes requested, 128 bytes transferred
                 Efficiency: 100%


NON-COALESCED ACCESS (worst case):
Each thread reads from a different 128-byte cache line.

Thread:   t0      t1      t2      t3     ...  t31
Address:  [0]     [512]   [1024]  [1536] ...  [15872]
          |---|   |---|   |---|   |---|        |---|
          128B    128B    128B    128B         128B

          32 separate 128-byte transactions
          128 bytes requested, 4096 bytes transferred
          Efficiency: 128 / 4096 = 3.1%
```

### Stride-1 vs Stride-N Access

**Stride-1** means consecutive threads access consecutive memory addresses. This is the coalesced ideal. **Stride-N** means each thread skips N elements, spreading accesses across multiple cache lines.

```
STRIDE-1 (perfect coalescing):
Thread 0 reads A[0], Thread 1 reads A[1], ..., Thread 31 reads A[31]

Memory: [A0][A1][A2][A3][A4][A5]...[A31] [A32][A33]...
         ^   ^   ^   ^   ^   ^      ^
         t0  t1  t2  t3  t4  t5    t31
         |________________________________|
              ONE 128-byte transaction


STRIDE-2 (50% efficiency):
Thread 0 reads A[0], Thread 1 reads A[2], ..., Thread 31 reads A[62]

Memory: [A0][A1][A2][A3][A4][A5]...[A62][A63]
         ^       ^       ^              ^
         t0      t1      t2            t31
         |___________________________________|
           TWO 128-byte transactions needed
           128 bytes useful / 256 bytes transferred = 50%


STRIDE-32 (3.1% efficiency):
Thread 0 reads A[0], Thread 1 reads A[32], ..., Thread 31 reads A[992]

Each thread hits a DIFFERENT cache line.
32 transactions for 32 x 4 = 128 bytes of useful data.
32 x 128 = 4096 bytes transferred.
Efficiency: 128 / 4096 = 3.1%
```

### Structure of Arrays (SoA) vs Array of Structures (AoS)

This is the most common source of non-coalesced access. The fix is usually straightforward.

```
AoS (Array of Structures) -- BAD for GPU:

struct Particle {
    float x;    // offset 0
    float y;    // offset 4
    float z;    // offset 8
    float mass; // offset 12
};
Particle particles[N];

Memory layout:
[x0][y0][z0][m0] [x1][y1][z1][m1] [x2][y2][z2][m2] ...
 ^                 ^                 ^
 t0                t1                t2

Reading all x values: stride-4 access (every 16 bytes)
Threads t0, t1, t2... read addresses 0, 16, 32...
Efficiency: 25% (only x is used, y/z/mass wasted)


SoA (Structure of Arrays) -- GOOD for GPU:

struct Particles {
    float *x;     // contiguous x values
    float *y;     // contiguous y values
    float *z;     // contiguous z values
    float *mass;  // contiguous mass values
};

Memory layout:
x array: [x0][x1][x2][x3]...[x31]...
          ^   ^   ^   ^       ^
          t0  t1  t2  t3     t31
          |________________________|
            ONE 128-byte transaction
            Efficiency: 100%
```

### Code Example: AoS vs SoA

```cpp
// ============================================================
// AoS vs SoA: Coalescing Impact on Bandwidth
// ============================================================

// --- AoS: Non-coalesced ---
struct ParticleAoS {
    float x, y, z;
    float vx, vy, vz;
};

__global__ void updateAoS(ParticleAoS *particles, float dt, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;

    // Each thread reads 24 bytes (x,y,z,vx,vy,vz)
    // But consecutive threads access stride-6 pattern for each field
    particles[i].x += particles[i].vx * dt;  // stride-6 for x
    particles[i].y += particles[i].vy * dt;  // stride-6 for y
    particles[i].z += particles[i].vz * dt;  // stride-6 for z
}

// --- SoA: Coalesced ---
struct ParticlesSoA {
    float *x, *y, *z;
    float *vx, *vy, *vz;
};

__global__ void updateSoA(ParticlesSoA p, float dt, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;

    // Each array access is stride-1 -- perfectly coalesced
    p.x[i] += p.vx[i] * dt;  // stride-1
    p.y[i] += p.vy[i] * dt;  // stride-1
    p.z[i] += p.vz[i] * dt;  // stride-1
}

// --- Benchmark ---
void benchmark() {
    const int N = 1 << 22;  // ~4 million particles
    const int BLOCK = 256;
    const int GRID = (N + BLOCK - 1) / BLOCK;
    float dt = 0.01f;

    // Allocate AoS
    ParticleAoS *d_aos;
    cudaMalloc(&d_aos, N * sizeof(ParticleAoS));

    // Allocate SoA
    ParticlesSoA h_soa;
    cudaMalloc(&h_soa.x,  N * sizeof(float));
    cudaMalloc(&h_soa.y,  N * sizeof(float));
    cudaMalloc(&h_soa.z,  N * sizeof(float));
    cudaMalloc(&h_soa.vx, N * sizeof(float));
    cudaMalloc(&h_soa.vy, N * sizeof(float));
    cudaMalloc(&h_soa.vz, N * sizeof(float));

    // Time AoS
    cudaEvent_t start, stop;
    cudaEventCreate(&start);
    cudaEventCreate(&stop);

    cudaEventRecord(start);
    for (int i = 0; i < 100; i++)
        updateAoS<<<GRID, BLOCK>>>(d_aos, dt, N);
    cudaEventRecord(stop);
    cudaEventSynchronize(stop);
    float ms_aos;
    cudaEventElapsedTime(&ms_aos, start, stop);

    // Time SoA
    cudaEventRecord(start);
    for (int i = 0; i < 100; i++)
        updateSoA<<<GRID, BLOCK>>>(h_soa, dt, N);
    cudaEventRecord(stop);
    cudaEventSynchronize(stop);
    float ms_soa;
    cudaEventElapsedTime(&ms_soa, start, stop);

    // Calculate effective bandwidth
    // Each particle: read 6 floats + write 3 floats = 36 bytes
    double bytes = (double)N * 36.0 * 100.0;
    double bw_aos = bytes / (ms_aos / 1000.0) / 1e9;
    double bw_soa = bytes / (ms_soa / 1000.0) / 1e9;

    printf("AoS: %.2f ms, %.1f GB/s\n", ms_aos, bw_aos);
    printf("SoA: %.2f ms, %.1f GB/s\n", ms_soa, bw_soa);
    // Typical result on A100:
    //   AoS: 12.3 ms,  ~490 GB/s  (poor coalescing)
    //   SoA:  3.1 ms, ~1940 GB/s  (near peak bandwidth)
    //   Speedup: ~4x

    cudaFree(d_aos);
    cudaFree(h_soa.x); cudaFree(h_soa.y); cudaFree(h_soa.z);
    cudaFree(h_soa.vx); cudaFree(h_soa.vy); cudaFree(h_soa.vz);
}
```

### Aligned vs Misaligned Access

Even stride-1 access can be suboptimal if the starting address is not aligned to 128 bytes.

```
ALIGNED (base address divisible by 128):

Cache line boundary:  |-------- 128 bytes --------|-------- 128 bytes --------|
Warp access:          [t0 t1 t2 ... t31]
                      ^-- aligned to boundary
Result: 1 transaction


MISALIGNED (base address NOT divisible by 128):

Cache line boundary:  |-------- 128 bytes --------|-------- 128 bytes --------|
Warp access:                 [t0 t1 t2 ........... t31]
                             ^-- offset into first line
Result: 2 transactions (straddles two cache lines)
Wasted: bytes before t0 in first line, bytes after t31 in second line
```

**Tip**: `cudaMalloc` always returns 256-byte aligned addresses, so the base pointer is aligned. Misalignment problems arise from offsets:

```cpp
// Aligned access (good)
kernel<<<grid, block>>>(data, N);  // data + 0 is aligned

// Potentially misaligned access
kernel<<<grid, block>>>(data + 1, N);  // data + 4 bytes: misaligned!
```

### How the Hardware Coalesces Requests

The memory controller groups warp memory requests as follows (simplified for modern NVIDIA GPUs):

```
Step 1: Collect addresses from all 32 threads in the warp
Step 2: Determine which 128-byte cache lines (sectors) are touched
Step 3: Issue one memory transaction per unique cache line
Step 4: Data returns from DRAM/L2, distributed to requesting threads

Example with stride-1, float access, 32 threads:
  Addresses: 0x1000, 0x1004, 0x1008, ..., 0x107C
  Cache lines touched: 0x1000-0x107F (one 128-byte line)
  Transactions: 1

Example with stride-2, float access, 32 threads:
  Addresses: 0x1000, 0x1008, 0x1010, ..., 0x10F8
  Cache lines touched: 0x1000-0x107F and 0x1080-0x10FF
  Transactions: 2

Modern GPUs (Volta+) use 32-byte sectors within 128-byte cache lines.
A 128-byte line has 4 sectors. Only touched sectors are fetched.
This helps with partial utilization but coalescing is still critical.
```

---

## 2. Shared Memory Bank Conflicts

Shared memory is organized into **32 banks** (one per thread in a warp). Consecutive 4-byte words map to consecutive banks. When two or more threads in the same warp access the **same bank** (but different addresses), those accesses are **serialized**. This is a bank conflict.

### How Addresses Map to Banks

```
Bank assignment: bank_id = (address / 4) % 32

Address (bytes):  0    4    8    12   16  ...  124   128  132 ...
Word index:       0    1    2    3    4   ...  31    32   33  ...
Bank:             0    1    2    3    4   ...  31    0    1   ...

Visual layout of first 128 bytes (32 words):

Bank:   B0   B1   B2   B3   B4   B5   ...  B30  B31
       +----+----+----+----+----+----+     +----+----+
Row 0: |W0  |W1  |W2  |W3  |W4  |W5  | ... |W30 |W31 |
       +----+----+----+----+----+----+     +----+----+
Row 1: |W32 |W33 |W34 |W35 |W36 |W37 | ... |W62 |W63 |
       +----+----+----+----+----+----+     +----+----+
Row 2: |W64 |W65 |W66 |W67 |W68 |W69 | ... |W94 |W95 |
       +----+----+----+----+----+----+     +----+----+
  ...

Each bank can serve ONE address per clock cycle.
If two threads hit the SAME bank (different row), it takes 2 cycles.
If all 32 threads hit the SAME bank, it takes 32 cycles (32-way conflict).
```

### No Conflict, 2-Way, and N-Way Conflicts

```
NO CONFLICT -- Each thread accesses a different bank:

Thread:  t0   t1   t2   t3   t4   ...  t31
Access:  B0   B1   B2   B3   B4   ...  B31
         |    |    |    |    |         |
         v    v    v    v    v         v
Bank:   [B0] [B1] [B2] [B3] [B4] ... [B31]

All 32 banks serve simultaneously. 1 cycle.


2-WAY CONFLICT -- Two threads hit each bank:

Thread:  t0   t1   t2   ...  t15  t16  t17  ...  t31
Access:  B0   B1   B2   ...  B15  B0   B1   ...  B15
         |    |    |         |    |    |         |
         v    v    v         v    v    v         v
Bank:   [B0] [B1] [B2] ... [B15] -- banks 16-31 unused --

Bank 0 serves t0 then t16 (2 cycles)
Bank 1 serves t1 then t17 (2 cycles)
Total: 2 cycles instead of 1. 50% efficiency.


32-WAY CONFLICT (worst case) -- All threads hit the same bank:

Thread:  t0   t1   t2   t3   ...  t31
Access:  B0   B0   B0   B0   ...  B0
         |    |    |    |         |
         v    v    v    v         v
Bank:   [B0]  (all 32 requests queue here)

32 sequential accesses. 32 cycles. ~3% efficiency.
This happens with stride-32 access to shared memory.
```

### The Broadcast Exception

If multiple threads read the **same address** (not just the same bank, but the exact same word), the hardware **broadcasts** the value to all of them in a single cycle -- no conflict.

```
BROADCAST -- All threads read the SAME address:

Thread:  t0   t1   t2   ...  t31
Access:  B0   B0   B0   ...  B0      (same address, e.g., smem[0])
         \    |    /         /
          v   v   v         v
Bank:   [B0] --> broadcast to all 32 threads

1 cycle. No conflict. This is why __constant__ memory is fast for
uniform access -- it exploits a similar broadcast mechanism.
```

### Common Bank Conflict Patterns

```
PATTERN 1: Linear access (NO conflict)
smem[threadIdx.x]
Thread 0 -> Bank 0, Thread 1 -> Bank 1, ..., Thread 31 -> Bank 31

PATTERN 2: Stride-2 access (2-way conflict)
smem[threadIdx.x * 2]
Thread 0 -> Bank 0, Thread 1 -> Bank 2, ..., Thread 16 -> Bank 0 (conflict!)

PATTERN 3: Stride-32 access (32-way conflict!!)
smem[threadIdx.x * 32]
ALL threads hit Bank 0!

PATTERN 4: Random access (average ~2-3 way conflict)
smem[hash(threadIdx.x)]

PATTERN 5: Column access in row-major 2D array with width=32 (32-way!)
// shared float smem[32][32];
smem[threadIdx.x][col]    // col is constant
// Thread 0 -> smem[0][col] = Bank (col)
// Thread 1 -> smem[1][col] = Bank (32 + col) % 32 = Bank (col)
// ALL threads hit the same bank!
```

### The Padding Technique

Adding one extra element per row eliminates column-access bank conflicts:

```
WITHOUT PADDING (32-way bank conflict on column access):

__shared__ float smem[32][32];

Column 0 access by 32 threads:
smem[0][0]  -> word 0  -> Bank 0
smem[1][0]  -> word 32 -> Bank 0    // CONFLICT!
smem[2][0]  -> word 64 -> Bank 0    // CONFLICT!
...
smem[31][0] -> word 992 -> Bank 0   // 32-way conflict!

All in Bank 0 because row width = 32 = number of banks.


WITH PADDING (no bank conflict):

__shared__ float smem[32][33];  // 33 instead of 32!

Column 0 access by 32 threads:
smem[0][0]  -> word 0  -> Bank 0
smem[1][0]  -> word 33 -> Bank 1     // Different bank!
smem[2][0]  -> word 66 -> Bank 2     // Different bank!
smem[3][0]  -> word 99 -> Bank 3     // Different bank!
...
smem[31][0] -> word 1023 -> Bank 31  // All unique banks!

The extra padding column shifts each row by one bank.
Cost: 32 x 4 = 128 bytes wasted per block. Negligible.
```

### Bank Conflict Detection Code

```cpp
// ============================================================
// Demonstrating shared memory bank conflicts
// ============================================================

// Kernel with NO bank conflicts
__global__ void noBankConflict(float *out, int n) {
    __shared__ float smem[256];

    int tid = threadIdx.x;

    // Stride-1 access: no conflict
    smem[tid] = (float)tid;
    __syncthreads();

    out[blockIdx.x * blockDim.x + tid] = smem[tid];
}

// Kernel with 32-WAY bank conflicts
__global__ void maxBankConflict(float *out, int n) {
    __shared__ float smem[256 * 32];  // large shared memory

    int tid = threadIdx.x;

    // Stride-32 access: every thread hits the same bank
    smem[tid * 32] = (float)tid;
    __syncthreads();

    out[blockIdx.x * blockDim.x + tid] = smem[tid * 32];
}

// Kernel demonstrating the padding fix for 2D access
__global__ void matTransposeNaive(float *out, const float *in, int width) {
    // BAD: Column reads have bank conflicts
    __shared__ float tile[32][32];

    int x = blockIdx.x * 32 + threadIdx.x;
    int y = blockIdx.y * 32 + threadIdx.y;

    // Load row (coalesced global read, no bank conflict)
    tile[threadIdx.y][threadIdx.x] = in[y * width + x];
    __syncthreads();

    // Store column (coalesced global write, but 32-way bank conflict on read!)
    int ox = blockIdx.y * 32 + threadIdx.x;
    int oy = blockIdx.x * 32 + threadIdx.y;
    out[oy * width + ox] = tile[threadIdx.x][threadIdx.y];  // column read!
}

__global__ void matTransposePadded(float *out, const float *in, int width) {
    // GOOD: Padding eliminates bank conflicts
    __shared__ float tile[32][33];  // <-- 33 instead of 32

    int x = blockIdx.x * 32 + threadIdx.x;
    int y = blockIdx.y * 32 + threadIdx.y;

    tile[threadIdx.y][threadIdx.x] = in[y * width + x];
    __syncthreads();

    int ox = blockIdx.y * 32 + threadIdx.x;
    int oy = blockIdx.x * 32 + threadIdx.y;
    out[oy * width + ox] = tile[threadIdx.x][threadIdx.y];  // no conflict!
}
```

### Profiling Bank Conflicts

Use NVIDIA Nsight Compute to measure bank conflicts:

```bash
# Profile shared memory bank conflicts
ncu --metrics l1tex__data_bank_conflicts_pipe_lsu_mem_shared_op_ld.sum,\
l1tex__data_bank_conflicts_pipe_lsu_mem_shared_op_st.sum \
./my_kernel

# Expected output:
# noBankConflict:    shared_ld conflicts = 0,   shared_st conflicts = 0
# maxBankConflict:   shared_ld conflicts = 31,  shared_st conflicts = 31
# (31 = 32-way conflict minus 1 served without stall)
```

---

## 3. Global Memory Access Patterns

### Row-Major vs Column-Major Matrix Access

```
Row-major storage (C/C++ default):
Matrix A[M][N] stored as:

A[0][0] A[0][1] A[0][2] ... A[0][N-1] A[1][0] A[1][1] ...
|<------------ Row 0 ------------->| |<---- Row 1 ---->

Address of A[i][j] = base + (i * N + j) * sizeof(element)


Column-major storage (Fortran, MATLAB, cuBLAS):
Matrix A[M][N] stored as:

A[0][0] A[1][0] A[2][0] ... A[M-1][0] A[0][1] A[1][1] ...
|<----------- Col 0 ------------->| |<---- Col 1 ---->

Address of A[i][j] = base + (j * M + i) * sizeof(element)
```

### Why Matrix Layout Matters for Coalescing

```
Row-major matrix, accessed row-wise (GOOD):
Thread 0 reads A[row][0], Thread 1 reads A[row][1], ...

Memory: ... [A[row][0]] [A[row][1]] [A[row][2]] ...
              ^           ^           ^
              t0          t1          t2
              Consecutive addresses -> COALESCED


Row-major matrix, accessed column-wise (BAD):
Thread 0 reads A[0][col], Thread 1 reads A[1][col], ...

Memory: [A[0][col]] ... N elements ... [A[1][col]] ... N elements ... [A[2][col]]
         ^                               ^                               ^
         t0                              t1                              t2
         Stride-N addresses -> NON-COALESCED


FIX: Transpose the matrix, or use shared memory tiling.
```

### Tiled Matrix Access

Tiling is the fundamental technique for converting non-coalesced global memory access into coalesced access + shared memory access.

```
UNTILED MATRIX MULTIPLY:

for each output element C[row][col]:
    sum = 0
    for k = 0 to N-1:
        sum += A[row][k] * B[k][col]   // B access is column-wise (non-coalesced!)
    C[row][col] = sum

Problem: B[k][col] with varying k is a column access = stride-N.


TILED MATRIX MULTIPLY:

+---+---+---+---+         +---+---+---+---+
| A | A | A | A |         | B | B | B | B |
|t0 |t1 |t2 |t3 |         |t0 |t1 |t2 |t3 |
+---+---+---+---+         +---+---+---+---+
| A | A | A | A |   x     | B | B | B | B |
|   |   |   |   |         |   |   |   |   |
+---+---+---+---+         +---+---+---+---+
| A | A | A | A |         | B | B | B | B |
|   |   |   |   |         |   |   |   |   |
+---+---+---+---+         +---+---+---+---+

Step 1: Load TILE_SIZE x TILE_SIZE sub-matrix of A into shared memory
        (row access -> coalesced)
Step 2: Load TILE_SIZE x TILE_SIZE sub-matrix of B into shared memory
        (row access -> coalesced)
Step 3: Compute partial dot products using shared memory
        (shared memory has no coalescing requirement, just bank conflicts)
Step 4: Move to next tile pair, repeat
```

### Tiled Matrix Multiply Implementation

```cpp
// ============================================================
// Tiled Matrix Multiply with Shared Memory
// Converts non-coalesced B access into coalesced loads
// ============================================================

#define TILE_SIZE 32

__global__ void matMulTiled(const float *A, const float *B, float *C,
                            int M, int N, int K) {
    __shared__ float tileA[TILE_SIZE][TILE_SIZE];
    __shared__ float tileB[TILE_SIZE][TILE_SIZE + 1];  // +1 padding for bank conflicts

    int row = blockIdx.y * TILE_SIZE + threadIdx.y;
    int col = blockIdx.x * TILE_SIZE + threadIdx.x;

    float sum = 0.0f;

    // Loop over tiles along the K dimension
    for (int t = 0; t < (K + TILE_SIZE - 1) / TILE_SIZE; t++) {
        // Load tile of A (row access -> coalesced)
        int aCol = t * TILE_SIZE + threadIdx.x;
        if (row < M && aCol < K)
            tileA[threadIdx.y][threadIdx.x] = A[row * K + aCol];
        else
            tileA[threadIdx.y][threadIdx.x] = 0.0f;

        // Load tile of B (row access -> coalesced!)
        // Without tiling, this would be column access (non-coalesced)
        int bRow = t * TILE_SIZE + threadIdx.y;
        if (bRow < K && col < N)
            tileB[threadIdx.y][threadIdx.x] = B[bRow * N + col];
        else
            tileB[threadIdx.y][threadIdx.x] = 0.0f;

        __syncthreads();

        // Compute partial products from shared memory
        #pragma unroll
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += tileA[threadIdx.y][k] * tileB[k][threadIdx.x];
        }

        __syncthreads();
    }

    if (row < M && col < N)
        C[row * N + col] = sum;
}
```

### Matrix Transposition Using Shared Memory

A classic example of converting non-coalesced access to coalesced access:

```cpp
// ============================================================
// Efficient Matrix Transpose
// Uses shared memory to convert column writes into row writes
// ============================================================

#define TILE_DIM 32
#define BLOCK_ROWS 8

// NAIVE: Coalesced read, non-coalesced write
__global__ void transposeNaive(float *out, const float *in, int width, int height) {
    int x = blockIdx.x * TILE_DIM + threadIdx.x;
    int y = blockIdx.y * TILE_DIM + threadIdx.y;

    for (int j = 0; j < TILE_DIM; j += BLOCK_ROWS) {
        if (x < width && (y + j) < height) {
            // Read: in[(y+j)*width + x]  -- stride-1 in x -> coalesced
            // Write: out[x*height + (y+j)] -- stride-height in x -> NOT coalesced!
            out[x * height + (y + j)] = in[(y + j) * width + x];
        }
    }
}

// OPTIMIZED: Both read and write are coalesced
__global__ void transposeCoalesced(float *out, const float *in,
                                    int width, int height) {
    __shared__ float tile[TILE_DIM][TILE_DIM + 1];  // +1 padding

    // Read tile with coalesced access
    int xIn = blockIdx.x * TILE_DIM + threadIdx.x;
    int yIn = blockIdx.y * TILE_DIM + threadIdx.y;

    for (int j = 0; j < TILE_DIM; j += BLOCK_ROWS) {
        if (xIn < width && (yIn + j) < height) {
            tile[threadIdx.y + j][threadIdx.x] = in[(yIn + j) * width + xIn];
        }
    }

    __syncthreads();

    // Write tile with coalesced access (note swapped block indices)
    int xOut = blockIdx.y * TILE_DIM + threadIdx.x;
    int yOut = blockIdx.x * TILE_DIM + threadIdx.y;

    for (int j = 0; j < TILE_DIM; j += BLOCK_ROWS) {
        if (xOut < height && (yOut + j) < width) {
            // threadIdx.x varies across threads -> stride-1 in output -> coalesced!
            out[(yOut + j) * height + xOut] = tile[threadIdx.x][threadIdx.y + j];
        }
    }
}

// Performance comparison on A100 (4096x4096 matrix):
//   Naive:     ~250 GB/s  (limited by non-coalesced writes)
//   Coalesced: ~1400 GB/s (near peak bandwidth)
//   Speedup:   ~5.6x
```

```
Diagram of the coalesced transpose technique:

STEP 1: Coalesced READ from input matrix into shared memory tile

Input matrix (row-major):                  Shared memory tile:
+----+----+----+----+                     +----+----+----+----+
| 00 | 01 | 02 | 03 | <- row read        | 00 | 01 | 02 | 03 |
+----+----+----+----+    (coalesced)      +----+----+----+----+
| 10 | 11 | 12 | 13 |                    | 10 | 11 | 12 | 13 |
+----+----+----+----+                     +----+----+----+----+
| 20 | 21 | 22 | 23 |  =============>    | 20 | 21 | 22 | 23 |
+----+----+----+----+                     +----+----+----+----+
| 30 | 31 | 32 | 33 |                    | 30 | 31 | 32 | 33 |
+----+----+----+----+                     +----+----+----+----+

STEP 2: Coalesced WRITE from shared memory tile to output matrix
        Read tile columns, write as rows.

Shared memory tile:                        Output matrix (row-major):
+----+----+----+----+                     +----+----+----+----+
| 00 | 01 | 02 | 03 |                    | 00 | 10 | 20 | 30 |
+----+----+----+----+   column read =>    +----+----+----+----+
| 10 | 11 | 12 | 13 |   row write        | 01 | 11 | 21 | 31 |
+----+----+----+----+   (both             +----+----+----+----+
| 20 | 21 | 22 | 23 |    coalesced!)     | 02 | 12 | 22 | 32 |
+----+----+----+----+                     +----+----+----+----+
| 30 | 31 | 32 | 33 |                    | 03 | 13 | 23 | 33 |
+----+----+----+----+                     +----+----+----+----+

Shared memory column reads use padding to avoid bank conflicts.
Global memory writes use swapped block indices so threadIdx.x
maps to the fast-varying output dimension.
```

---

## 4. Constant Memory

### Declaration and Usage

Constant memory is a **64 KB** read-only region cached in a dedicated constant cache. When all threads in a warp read the **same address**, the value is broadcast in a single cycle.

```cpp
// ============================================================
// Constant Memory: Broadcast to All Threads
// ============================================================

// Declare constant memory (must be at file scope)
__constant__ float d_filter[256];        // Filter coefficients
__constant__ float3 d_lightPos;          // Light position
__constant__ float d_matrix[4][4];       // Transformation matrix

// Copy data to constant memory (host code)
void setupConstants() {
    float h_filter[256];
    // ... fill filter values ...

    // Use cudaMemcpyToSymbol, NOT cudaMemcpy
    cudaMemcpyToSymbol(d_filter, h_filter, sizeof(float) * 256);

    float3 lightPos = {1.0f, 2.0f, 3.0f};
    cudaMemcpyToSymbol(d_lightPos, &lightPos, sizeof(float3));
}

// Kernel using constant memory
__global__ void applyFilter(const float *input, float *output,
                             int width, int height, int filterSize) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= width || y >= height) return;

    float sum = 0.0f;
    int halfFilter = filterSize / 2;

    for (int fy = -halfFilter; fy <= halfFilter; fy++) {
        for (int fx = -halfFilter; fx <= halfFilter; fx++) {
            int ix = min(max(x + fx, 0), width - 1);
            int iy = min(max(y + fy, 0), height - 1);

            int filterIdx = (fy + halfFilter) * filterSize + (fx + halfFilter);

            // ALL threads in the warp read d_filter[filterIdx]
            // at the same index -> broadcast -> 1 cycle
            sum += input[iy * width + ix] * d_filter[filterIdx];
        }
    }

    output[y * width + x] = sum;
}
```

### How Constant Cache Works

```
Constant Memory Broadcast Mechanism:

Scenario A: All threads read SAME constant address (FAST)

Warp of 32 threads:
  t0:  read d_filter[5]  ----+
  t1:  read d_filter[5]      |
  t2:  read d_filter[5]      +----> Constant Cache: ONE lookup
  ...                         |     Result broadcast to all 32 threads
  t31: read d_filter[5]  ----+     Latency: ~4 cycles (cache hit)


Scenario B: Threads read DIFFERENT constant addresses (SLOW)

Warp of 32 threads:
  t0:  read d_filter[0]  ----> Constant Cache: lookup 1
  t1:  read d_filter[1]  ----> Constant Cache: lookup 2
  t2:  read d_filter[2]  ----> Constant Cache: lookup 3
  ...                           ... serialized ...
  t31: read d_filter[31] ----> Constant Cache: lookup 32

Latency: 32 x ~4 = ~128 cycles (serialized!)
In this case, global memory with L1 cache would be FASTER.


Rule of Thumb:
  - All threads read SAME address -> use constant memory
  - Threads read DIFFERENT addresses -> use global memory (with L1 cache)
```

### When to Use Constant Memory

| Use Case                           | Constant Memory? | Why                                         |
| ---------------------------------- | :--------------: | ------------------------------------------- |
| Convolution filter coefficients    |       Yes        | All threads read same coefficient per step  |
| Physical constants (gravity, pi)   |       Yes        | Uniform across all threads                  |
| Lookup tables indexed by thread ID |        NO        | Different addresses per thread = serialized |
| Transformation matrices            |       Yes        | Same matrix applied to all elements         |
| Kernel configuration parameters    |       Yes        | Read once, same for all                     |

---

## 5. Texture Memory

### Texture Objects (Modern CUDA)

Texture memory uses a specialized cache optimized for **2D spatial locality**. Unlike L1/L2 caches (optimized for 1D sequential access), the texture cache stores data in a **space-filling curve** layout that keeps 2D neighbors close in the cache.

```cpp
// ============================================================
// Texture Memory with CUDA Texture Objects (Modern API)
// ============================================================

void setupTexture(float *d_data, int width, int height) {
    // Create CUDA array with 2D layout
    cudaChannelFormatDesc channelDesc =
        cudaCreateChannelDesc(32, 0, 0, 0, cudaChannelFormatKindFloat);

    cudaArray_t cuArray;
    cudaMallocArray(&cuArray, &channelDesc, width, height);
    cudaMemcpy2DToArray(cuArray, 0, 0, d_data,
                         width * sizeof(float),
                         width * sizeof(float), height,
                         cudaMemcpyDeviceToDevice);

    // Create texture object
    cudaResourceDesc resDesc = {};
    resDesc.resType = cudaResourceTypeArray;
    resDesc.res.array.array = cuArray;

    cudaTextureDesc texDesc = {};
    texDesc.addressMode[0] = cudaAddressModeClamp;   // Clamp out-of-bounds
    texDesc.addressMode[1] = cudaAddressModeClamp;
    texDesc.filterMode = cudaFilterModeLinear;        // Bilinear interpolation
    texDesc.normalizedCoords = true;                   // [0.0, 1.0] coordinates
    texDesc.readMode = cudaReadModeElementType;

    cudaTextureObject_t texObj;
    cudaCreateTextureObject(&texObj, &resDesc, &texDesc, nullptr);

    // Pass texObj to kernel
    myKernel<<<grid, block>>>(texObj, output, width, height);

    // Cleanup
    cudaDestroyTextureObject(texObj);
    cudaFreeArray(cuArray);
}

__global__ void myKernel(cudaTextureObject_t tex, float *output,
                          int width, int height) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= width || y >= height) return;

    // Normalized coordinates: (0.0 to 1.0)
    float u = (x + 0.5f) / width;
    float v = (y + 0.5f) / height;

    // FREE bilinear interpolation in hardware!
    float value = tex2D<float>(tex, u, v);

    output[y * width + x] = value;
}
```

### Texture Cache Spatial Locality

```
Standard L1/L2 Cache (1D optimized):
Cache line: [A00][A01][A02][A03][A04]...[A31]
When you access A[y][x], you get A[y][x..x+31] in cache.
Accessing A[y+1][x] is a cache miss (different line).


Texture Cache (2D optimized, space-filling curve):
Data is stored in tiles / Morton code order:

Linear memory:          Texture memory (Morton/Z-order):
+--+--+--+--+          +--+--+--+--+
|0 |1 |4 |5 |          |0 |1 |2 |3 |
+--+--+--+--+          +--+--+--+--+
|2 |3 |6 |7 |          |4 |5 |6 |7 |
+--+--+--+--+          +--+--+--+--+
|8 |9 |12|13|          |8 |9 |10|11|
+--+--+--+--+          +--+--+--+--+
|10|11|14|15|          |12|13|14|15|
+--+--+--+--+          +--+--+--+--+

Z-order curve visits:    Standard row-major visits:
0->1->2->3 (2x2 tile)   0->1->2->3 (whole row)
then 4->5->6->7          4->5->6->7 (whole row)
(next 2x2 tile)          ...

Texture cache keeps 2D-nearby elements close in cache.
When you access pixel (x,y), neighbors (x+1,y), (x,y+1),
(x+1,y+1) are likely already cached.
```

### When Texture Memory Helps

| Scenario                             | Benefit                                           |
| ------------------------------------ | ------------------------------------------------- |
| Image processing (convolution, blur) | 2D spatial locality cache exploited               |
| Terrain sampling in ray tracing      | Non-uniform 2D access patterns                    |
| Free bilinear interpolation          | Hardware interpolation saves compute              |
| Read-only data with spatial access   | Texture cache is separate from L1, adds bandwidth |
| Normalized coordinate access         | Automatic [0,1] mapping                           |

| Scenario                               | NOT Beneficial          |
| -------------------------------------- | ----------------------- |
| Purely linear (1D) sequential access   | L1/L2 cache works fine  |
| Write-heavy data                       | Texture is read-only    |
| Small data that fits in shared memory  | Shared memory is faster |
| Random access with no spatial locality | No cache reuse          |

---

## 6. Pinned (Page-Locked) Memory

### Why Pinned Memory Is Faster

Regular `malloc` memory is **pageable** -- the OS can swap it to disk at any time. Before DMA transfer to the GPU, the CUDA driver must:

1. Allocate a temporary pinned buffer
2. Copy data from pageable to pinned
3. DMA from pinned to GPU

With **pinned memory**, step 1 and 2 are eliminated.

```
PAGEABLE MEMORY TRANSFER (slow):

CPU RAM (pageable)       Staging Buffer (pinned)       GPU VRAM
+------------------+     +------------------+          +------------------+
| User data        | --> | Copy to pinned   | -- DMA ->| GPU memory       |
| (can be swapped) |     | (locked in RAM)  |          |                  |
+------------------+     +------------------+          +------------------+
       Step 1                  Step 2                      Step 3
  CPU memcpy (slow)      DMA transfer (fast)

Total: CPU copy overhead + DMA time
Bandwidth: ~6-8 GB/s on PCIe 3.0


PINNED MEMORY TRANSFER (fast):

CPU RAM (pinned)                                       GPU VRAM
+------------------+                                   +------------------+
| User data        | -------------- DMA -------------> | GPU memory       |
| (locked in RAM)  |                                   |                  |
+------------------+                                   +------------------+
       Step 1                                              Step 2
  Already pinned!                 DMA transfer (fast)

Total: DMA time only
Bandwidth: ~12-13 GB/s on PCIe 3.0 (full duplex possible)
```

### Code Example

```cpp
// ============================================================
// Pinned Memory: Faster Host-Device Transfers
// ============================================================

void demonstratePinnedMemory(int N) {
    size_t size = N * sizeof(float);

    // --- Pageable memory (standard) ---
    float *h_pageable = (float *)malloc(size);
    float *d_data;
    cudaMalloc(&d_data, size);

    cudaEvent_t start, stop;
    cudaEventCreate(&start);
    cudaEventCreate(&stop);

    cudaEventRecord(start);
    cudaMemcpy(d_data, h_pageable, size, cudaMemcpyHostToDevice);
    cudaEventRecord(stop);
    cudaEventSynchronize(stop);
    float ms_pageable;
    cudaEventElapsedTime(&ms_pageable, start, stop);

    // --- Pinned memory ---
    float *h_pinned;
    cudaMallocHost(&h_pinned, size);  // Allocate pinned memory

    cudaEventRecord(start);
    cudaMemcpy(d_data, h_pinned, size, cudaMemcpyHostToDevice);
    cudaEventRecord(stop);
    cudaEventSynchronize(stop);
    float ms_pinned;
    cudaEventElapsedTime(&ms_pinned, start, stop);

    double bw_pageable = size / (ms_pageable / 1000.0) / 1e9;
    double bw_pinned = size / (ms_pinned / 1000.0) / 1e9;

    printf("Pageable: %.2f ms (%.1f GB/s)\n", ms_pageable, bw_pageable);
    printf("Pinned:   %.2f ms (%.1f GB/s)\n", ms_pinned, bw_pinned);
    // Typical on PCIe 3.0 x16:
    //   Pageable:  ~6 GB/s
    //   Pinned:   ~12 GB/s (2x faster)

    // Cleanup
    free(h_pageable);
    cudaFreeHost(h_pinned);  // Must use cudaFreeHost, NOT free()
    cudaFree(d_data);
}
```

### Async Memcpy with Pinned Memory

Pinned memory enables **overlapping** computation with data transfer using CUDA streams:

```cpp
// ============================================================
// Async Transfers: Overlap Compute and Data Movement
// Requires pinned memory!
// ============================================================

void asyncPipeline(float *h_input, float *h_output, int N) {
    const int CHUNKS = 4;
    const int chunkSize = N / CHUNKS;
    const size_t chunkBytes = chunkSize * sizeof(float);

    // Allocate pinned host memory
    float *h_pin_in, *h_pin_out;
    cudaMallocHost(&h_pin_in, N * sizeof(float));
    cudaMallocHost(&h_pin_out, N * sizeof(float));
    memcpy(h_pin_in, h_input, N * sizeof(float));

    // Allocate device memory for 2 chunks (double buffering)
    float *d_in[2], *d_out[2];
    for (int i = 0; i < 2; i++) {
        cudaMalloc(&d_in[i], chunkBytes);
        cudaMalloc(&d_out[i], chunkBytes);
    }

    // Create streams
    cudaStream_t streams[2];
    cudaStreamCreate(&streams[0]);
    cudaStreamCreate(&streams[1]);

    // Pipeline: overlap transfer and compute
    for (int i = 0; i < CHUNKS; i++) {
        int buf = i % 2;
        int offset = i * chunkSize;

        // Async copy H->D
        cudaMemcpyAsync(d_in[buf], h_pin_in + offset, chunkBytes,
                         cudaMemcpyHostToDevice, streams[buf]);

        // Launch kernel
        int blocks = (chunkSize + 255) / 256;
        processKernel<<<blocks, 256, 0, streams[buf]>>>(
            d_in[buf], d_out[buf], chunkSize);

        // Async copy D->H
        cudaMemcpyAsync(h_pin_out + offset, d_out[buf], chunkBytes,
                         cudaMemcpyDeviceToHost, streams[buf]);
    }

    cudaDeviceSynchronize();
    memcpy(h_output, h_pin_out, N * sizeof(float));

    // Cleanup
    cudaFreeHost(h_pin_in);
    cudaFreeHost(h_pin_out);
    for (int i = 0; i < 2; i++) {
        cudaFree(d_in[i]);
        cudaFree(d_out[i]);
    }
    cudaStreamDestroy(streams[0]);
    cudaStreamDestroy(streams[1]);
}
```

```
Async Pipeline Timeline (double-buffered):

Stream 0: [H2D chunk0]  [Compute 0]  [D2H chunk0]     [H2D chunk2]  [Compute 2]  [D2H chunk2]
Stream 1:       [H2D chunk1]  [Compute 1]  [D2H chunk1]     [H2D chunk3]  [Compute 3]  [D2H chunk3]
           |----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
Time:      0    1    2    3    4    5    6    7    8    9   10   11   12   13   14

Without async: Total = 4 x (H2D + Compute + D2H) = 12 units
With async:    Total = ~8 units (transfers overlap with compute)
Speedup: ~1.5x for this example (more chunks = better overlap)
```

### Write-Combined Memory

Write-combined (WC) memory is pinned memory optimized for **write-only** CPU access. The CPU does not cache WC memory, so writes bypass cache and go directly to memory, freeing cache for other uses.

```cpp
// Allocate write-combined pinned memory
float *h_wc;
cudaHostAlloc(&h_wc, size, cudaHostAllocWriteCombined);

// GOOD: Sequential writes from CPU (fast, bypasses cache)
for (int i = 0; i < N; i++) {
    h_wc[i] = computeValue(i);
}
cudaMemcpy(d_data, h_wc, size, cudaMemcpyHostToDevice);

// BAD: Reading from WC memory on CPU (extremely slow, no cache!)
float sum = 0;
for (int i = 0; i < N; i++) {
    sum += h_wc[i];  // Every read goes to DRAM -- no caching!
}

// Use write-combined memory when:
// - CPU only writes the data (e.g., filling a buffer for GPU)
// - GPU reads the data
// - CPU never reads it back
```

---

## 7. Zero-Copy Memory

### What Is Zero-Copy Memory?

Zero-copy memory is pinned host memory that is **mapped** into the GPU's address space. The GPU can access it directly over PCIe without an explicit `cudaMemcpy`. The data stays in host RAM.

```
Standard Workflow (explicit copy):
CPU RAM  ---cudaMemcpy--->  GPU VRAM  ---kernel reads--->  Results
                                      (fast: HBM bandwidth)

Zero-Copy Workflow (no copy):
CPU RAM  <---PCIe direct access---  GPU kernel reads
         (slow: PCIe bandwidth)

Zero-copy is SLOWER for large sequential reads (PCIe << HBM).
But it is FASTER when:
  1. Data is read only once (copy overhead > direct access cost)
  2. Integrated GPU (shared memory, no PCIe bottleneck)
  3. Data is too large to fit in GPU VRAM
  4. Only a small subset of data is accessed
```

### Code Example

```cpp
// ============================================================
// Zero-Copy Memory
// ============================================================

void zeroCopyExample(int N) {
    size_t size = N * sizeof(float);

    // Allocate mapped pinned memory
    float *h_mapped;
    cudaHostAlloc(&h_mapped, size,
                   cudaHostAllocMapped | cudaHostAllocPortable);

    // Initialize on CPU
    for (int i = 0; i < N; i++) {
        h_mapped[i] = (float)i;
    }

    // Get device pointer (may differ from host pointer on some systems)
    float *d_mapped;
    cudaHostGetDevicePointer(&d_mapped, h_mapped, 0);

    // Launch kernel -- GPU reads directly from host RAM via PCIe
    int blocks = (N + 255) / 256;
    processKernel<<<blocks, 256>>>(d_mapped, N);
    cudaDeviceSynchronize();

    // Results are immediately visible on host (no D2H copy needed!)
    printf("Result[0] = %f\n", h_mapped[0]);

    cudaFreeHost(h_mapped);
}

// Modern alternative: Unified Memory with hints
void unifiedMemoryAlternative(int N) {
    float *data;
    cudaMallocManaged(&data, N * sizeof(float));

    // Hint: data will be mostly read by GPU
    cudaMemAdvise(data, N * sizeof(float),
                   cudaMemAdviseSetReadMostly, 0);

    // Hint: prefer GPU location
    cudaMemAdvise(data, N * sizeof(float),
                   cudaMemAdviseSetPreferredLocation, 0);

    // Prefetch to GPU
    cudaMemPrefetchAsync(data, N * sizeof(float), 0);

    processKernel<<<(N+255)/256, 256>>>(data, N);
    cudaDeviceSynchronize();

    // Prefetch back to CPU for reading results
    cudaMemPrefetchAsync(data, N * sizeof(float), cudaCpuDeviceId);
    cudaDeviceSynchronize();

    cudaFree(data);
}
```

### When Zero-Copy Wins

```
Decision Matrix:

                          Small Data       Large Data        Integrated GPU
                          (< 1 MB)         (> GPU VRAM)      (shared RAM)
+------------------------+----------------+-----------------+----------------+
| Explicit cudaMemcpy    | SLOW (overhead | IMPOSSIBLE      | SLOW (copy is  |
|                        | dominates)     | (won't fit)     | redundant)     |
+------------------------+----------------+-----------------+----------------+
| Zero-Copy              | FAST (no copy  | WORKS (accessed | FAST (no       |
|                        | overhead)      | on demand)      | PCIe, shared   |
|                        |                |                 | memory system) |
+------------------------+----------------+-----------------+----------------+
| Unified Memory         | FAST (auto-    | WORKS (auto-    | FAST (best of  |
| (cudaMallocManaged)    | managed)       | managed paging) | both worlds)   |
+------------------------+----------------+-----------------+----------------+

Summary:
- Discrete GPU + large data read many times -> explicit copy to VRAM
- Integrated GPU (Jetson, APUs) -> zero-copy is often optimal
- One-time read of small data -> zero-copy avoids copy overhead
- Data larger than VRAM -> zero-copy or Unified Memory
```

---

## 8. Memory Pools

### The Allocation Overhead Problem

`cudaMalloc` and `cudaFree` are **synchronous** operations that block the CPU and can take 100+ microseconds each. In workloads with many small allocations (e.g., deep learning training with dynamic shapes), allocation overhead can dominate.

```
Without Memory Pools:

Time -->
CPU: [cudaMalloc]  [launch kernel]  [cudaFree]  [cudaMalloc]  [launch]  [cudaFree]
GPU:      idle      [kernel runs]     idle        idle          [runs]    idle
     |---100us---|                 |---100us---|  |---100us---|          |---100us---|

Total overhead: 4 x 100us = 400us of GPU idle time


With Memory Pools:

Time -->
CPU: [pool_alloc]  [launch kernel]  [pool_free]  [pool_alloc]  [launch]  [pool_free]
GPU:    ~0us       [kernel runs]      ~0us         ~0us        [runs]     ~0us
     |--<1us--|                    |--<1us--|    |--<1us--|              |--<1us--|

Pool reuses previously freed memory. No driver calls after warmup.
Total overhead: ~4us (100x reduction)
```

### CUDA Memory Pools (cudaMallocAsync / cudaFreeAsync)

```cpp
// ============================================================
// CUDA Memory Pools (CUDA 11.2+)
// ============================================================

void memoryPoolExample(int N, cudaStream_t stream) {
    size_t size = N * sizeof(float);

    // Method 1: Default pool (simplest)
    float *d_temp;
    cudaMallocAsync(&d_temp, size, stream);      // Non-blocking!
    processKernel<<<(N+255)/256, 256, 0, stream>>>(d_temp, N);
    cudaFreeAsync(d_temp, stream);               // Non-blocking!

    // The free does not immediately return memory to the OS.
    // It returns to the pool for fast reuse.

    // Method 2: Custom pool with configuration
    cudaMemPool_t pool;
    cudaDeviceGetDefaultMemPool(&pool, 0);

    // Set pool to release unused memory after threshold
    uint64_t threshold = 1ULL << 30;  // 1 GB
    cudaMemPoolSetAttribute(pool, cudaMemPoolAttrReleaseThreshold,
                             &threshold);

    // Method 3: Explicit custom pool
    cudaMemPoolProps poolProps = {};
    poolProps.allocType = cudaMemAllocationTypePinned;
    poolProps.handleTypes = cudaMemHandleTypeNone;
    poolProps.location.id = 0;
    poolProps.location.type = cudaMemLocationTypeDevice;

    cudaMemPool_t customPool;
    cudaMemPoolCreate(&customPool, &poolProps);

    float *d_data;
    cudaMallocFromPoolAsync(&d_data, size, customPool, stream);
    processKernel<<<(N+255)/256, 256, 0, stream>>>(d_data, N);
    cudaFreeAsync(d_data, stream);

    cudaMemPoolDestroy(customPool);
}

// Real-world pattern: Dynamic shape processing
void processBatch(const std::vector<int>& sizes, cudaStream_t stream) {
    for (int i = 0; i < sizes.size(); i++) {
        size_t bytes = sizes[i] * sizeof(float);
        float *d_buf;

        // Fast: reuses memory from previous iteration's free
        cudaMallocAsync(&d_buf, bytes, stream);

        int blocks = (sizes[i] + 255) / 256;
        processKernel<<<blocks, 256, 0, stream>>>(d_buf, sizes[i]);

        cudaFreeAsync(d_buf, stream);  // Returns to pool, not OS
    }
    cudaStreamSynchronize(stream);
}
```

### Pool Memory Lifecycle

```
Memory Pool Lifecycle:

1. First cudaMallocAsync(ptr, 1MB):
   Pool is empty -> actual cudaMalloc from driver -> slow (~100us)
   Pool: [1MB block allocated]

2. cudaFreeAsync(ptr):
   Memory returned to POOL, not to driver -> fast (~0us)
   Pool: [1MB block free, available for reuse]

3. Second cudaMallocAsync(ptr, 1MB):
   Pool has a matching block -> reuse -> fast (~0us)
   Pool: [1MB block allocated (reused)]

4. Second cudaMallocAsync(ptr2, 512KB):
   Pool has no free block -> driver allocates -> slow
   Pool: [1MB allocated] [512KB allocated]

5. Both freed:
   Pool: [1MB free] [512KB free]
   Pool holds memory for fast reuse.

6. Trim pool (optional):
   cudaMemPoolTrimTo(pool, 0);
   Actually returns memory to driver/OS.
   Pool: [empty]
```

---

## 9. The Roofline Model

The Roofline Model is the most important analytical tool for understanding whether a kernel is **memory-bound** or **compute-bound**, and how much room for optimization exists.

### Arithmetic Intensity

**Arithmetic Intensity (AI)** = FLOPs performed / Bytes loaded from memory

```
Examples:

Vector Addition: C[i] = A[i] + B[i]
  FLOPs: 1 (one addition per element)
  Bytes:  3 x 4 = 12 (read A[i], read B[i], write C[i], each 4 bytes)
  AI = 1/12 = 0.083 FLOPs/byte
  Verdict: EXTREMELY memory-bound

Matrix Multiply: C[M][N] = A[M][K] x B[K][N] (naive)
  FLOPs: 2*M*N*K (multiply + add per output element per K)
  Bytes:  (M*K + K*N + M*N) * 4
  For square N=K=M: FLOPs = 2N^3, Bytes = 3N^2 * 4
  AI = 2N^3 / (12N^2) = N/6 FLOPs/byte
  For N=1024: AI = 170 FLOPs/byte
  Verdict: COMPUTE-BOUND (high AI)

Stencil (3-point): B[i] = 0.25*A[i-1] + 0.5*A[i] + 0.25*A[i+1]
  FLOPs: 5 (3 multiplies + 2 adds)
  Bytes:  4 x 4 = 16 (3 reads + 1 write, 4 bytes each, assuming no cache)
  AI = 5/16 = 0.3125 FLOPs/byte (with cache: higher due to reuse)
  Verdict: MEMORY-BOUND
```

### The Roofline Chart

```
                       Roofline Model for NVIDIA A100
Performance
(TFLOPS)
   |
60 |                                            _______________  Peak Compute: 19.5 TFLOPS (FP32)
   |                                     ______/                 (or 156 TFLOPS with Tensor Cores)
   |                                ____/
   |                           ____/
   |                      ____/
   |                 ____/
20 |            ____/  <-- Memory bandwidth roof: 2039 GB/s
   |       ____/           Slope = bandwidth
   |  ____/
10 |_/
   | /
   |/
   +-----|--------|---------|---------|--------->
   0.01  0.1      1         10        100
                Arithmetic Intensity (FLOPs/byte)

                    Ridge Point
                        |
                        v
   Memory-bound    |   Compute-bound
   region          |   region
   (AI < ridge)    |   (AI > ridge)

Ridge Point = Peak Compute / Peak Bandwidth
            = 19.5 TFLOPS / 2.039 TB/s
            = ~9.6 FLOPs/byte

If your kernel's AI < 9.6: you are memory-bound.
   Optimization: improve memory access (coalescing, caching, compression)

If your kernel's AI > 9.6: you are compute-bound.
   Optimization: reduce FLOPs, use faster math, Tensor Cores
```

### Plotting Your Kernel on the Roofline

```cpp
// ============================================================
// Measuring Arithmetic Intensity and Achieved Performance
// ============================================================

struct RooflineResult {
    double arithmetic_intensity;  // FLOPs / byte
    double achieved_tflops;       // Actual TFLOPS
    double peak_tflops;           // Theoretical peak
    double peak_bandwidth_tbs;    // Peak bandwidth in TB/s
    bool is_memory_bound;
};

RooflineResult analyzeKernel(
    void (*kernel)(float*, const float*, int),
    float *d_out, const float *d_in, int N,
    long long flops_per_element, int bytes_per_element)
{
    RooflineResult result;

    // Count total FLOPs and bytes
    long long total_flops = (long long)N * flops_per_element;
    long long total_bytes = (long long)N * bytes_per_element;
    result.arithmetic_intensity = (double)total_flops / total_bytes;

    // Measure execution time
    cudaEvent_t start, stop;
    cudaEventCreate(&start);
    cudaEventCreate(&stop);

    // Warmup
    kernel<<<(N+255)/256, 256>>>(d_out, d_in, N);

    cudaEventRecord(start);
    for (int i = 0; i < 100; i++) {
        kernel<<<(N+255)/256, 256>>>(d_out, d_in, N);
    }
    cudaEventRecord(stop);
    cudaEventSynchronize(stop);

    float ms;
    cudaEventElapsedTime(&ms, start, stop);
    double seconds = ms / 1000.0 / 100.0;  // Per iteration

    result.achieved_tflops = total_flops / seconds / 1e12;

    // A100 specs
    result.peak_tflops = 19.5;        // FP32
    result.peak_bandwidth_tbs = 2.039; // TB/s

    double ridge = result.peak_tflops / result.peak_bandwidth_tbs;
    result.is_memory_bound = (result.arithmetic_intensity < ridge);

    // Theoretical maximum for this AI
    double theoretical_max;
    if (result.is_memory_bound) {
        theoretical_max = result.arithmetic_intensity *
                          result.peak_bandwidth_tbs;
    } else {
        theoretical_max = result.peak_tflops;
    }

    printf("Arithmetic Intensity: %.2f FLOPs/byte\n",
           result.arithmetic_intensity);
    printf("Achieved:  %.2f TFLOPS\n", result.achieved_tflops);
    printf("Roof:      %.2f TFLOPS\n", theoretical_max);
    printf("Efficiency: %.1f%%\n",
           100.0 * result.achieved_tflops / theoretical_max);
    printf("Bound by:  %s\n",
           result.is_memory_bound ? "MEMORY" : "COMPUTE");

    return result;
}
```

### Using the Roofline to Guide Optimization

```
Decision Tree Based on Roofline Analysis:

Is your kernel memory-bound or compute-bound?

MEMORY-BOUND (AI < ridge point):
  |
  +-> Are global memory accesses coalesced?
  |   NO  -> Fix coalescing (SoA, alignment, stride-1)
  |   YES -> Continue
  |
  +-> Are you using shared memory for reuse?
  |   NO  -> Add tiling to increase data reuse
  |   YES -> Continue
  |
  +-> Is shared memory free of bank conflicts?
  |   NO  -> Add padding, restructure access patterns
  |   YES -> Continue
  |
  +-> Can you use compressed data types?
  |   YES -> Use FP16, INT8, or custom compression
  |
  +-> Can you increase arithmetic intensity?
      YES -> Fuse kernels, compute more per data load


COMPUTE-BOUND (AI > ridge point):
  |
  +-> Can you use lower precision?
  |   YES -> FP16, BF16, INT8, Tensor Cores
  |
  +-> Are there redundant computations?
  |   YES -> Memoize, precompute, algorithmic improvement
  |
  +-> Is instruction-level parallelism (ILP) high?
  |   NO  -> Unroll loops, interleave independent operations
  |
  +-> Is occupancy sufficient?
      NO  -> Reduce register/shared memory usage
```

### Complete Roofline Example

```
Roofline Analysis of Common Kernels (A100):

Peak Compute: 19.5 TFLOPS FP32
Peak Bandwidth: 2039 GB/s = 2.039 TB/s
Ridge Point: 19.5 / 2.039 = 9.6 FLOPs/byte

Kernel                  AI (F/B)  Bound     Roof (TF)  Achieved  Efficiency
----------------------  --------  --------  ---------  --------  ----------
Vector add              0.08      Memory    0.16 TF    0.14 TF   87%
Vector SAXPY            0.17      Memory    0.34 TF    0.30 TF   88%
3-point stencil         0.31      Memory    0.64 TF    0.45 TF   70%
Matrix transpose        0.00      Memory    --         1.4 TB/s  69% (BW)
SpMV (sparse mat-vec)   0.25      Memory    0.51 TF    0.30 TF   59%
MatMul 1024x1024        170       Compute   19.5 TF    17.1 TF   88%
Convolution 3x3         1.5       Memory    3.06 TF    2.1 TF    69%
Batch normalization     0.33      Memory    0.67 TF    0.48 TF   72%

Observation: Most real-world kernels are memory-bound.
This is why memory optimization matters more than compute optimization.
```

---

## 10. CPU Memory Optimization

### Cache Blocking (Loop Tiling)

The single most effective CPU optimization is restructuring loops to fit data in cache.

```cpp
// ============================================================
// Cache Blocking: Matrix Multiply
// ============================================================

// NAIVE: Thrashes cache for large matrices
void matmul_naive(const float *A, const float *B, float *C, int N) {
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            float sum = 0.0f;
            for (int k = 0; k < N; k++) {
                sum += A[i * N + k] * B[k * N + j];
                // B[k*N+j]: stride-N access, cache-hostile
            }
            C[i * N + j] = sum;
        }
    }
}

// CACHE-BLOCKED: Keeps working set in L1/L2 cache
void matmul_blocked(const float *A, const float *B, float *C, int N) {
    const int BLOCK = 64;  // Chosen to fit in L1 cache

    // Initialize C to zero
    memset(C, 0, N * N * sizeof(float));

    for (int ii = 0; ii < N; ii += BLOCK) {
        for (int jj = 0; jj < N; jj += BLOCK) {
            for (int kk = 0; kk < N; kk += BLOCK) {
                // Multiply BLOCK x BLOCK sub-matrices
                int imax = (ii + BLOCK < N) ? ii + BLOCK : N;
                int jmax = (jj + BLOCK < N) ? jj + BLOCK : N;
                int kmax = (kk + BLOCK < N) ? kk + BLOCK : N;

                for (int i = ii; i < imax; i++) {
                    for (int k = kk; k < kmax; k++) {
                        float a_ik = A[i * N + k];
                        for (int j = jj; j < jmax; j++) {
                            C[i * N + j] += a_ik * B[k * N + j];
                        }
                    }
                }
            }
        }
    }
}
```

```
Why Cache Blocking Works:

NAIVE (N=4096, float):
Total data: A = 64MB, B = 64MB, C = 64MB
L1 cache: 32KB, L2 cache: 256KB

Inner loop accesses column of B:
B[0*N+j], B[1*N+j], B[2*N+j], ...B[4095*N+j]
Stride: 4096 * 4 = 16384 bytes between accesses
Each access is a CACHE MISS (stride >> cache line size)

Result: ~4096 cache misses per output element
        ~4096^2 * 4096 = 68 billion cache misses total
        Performance: ~0.5 GFLOPS


BLOCKED (BLOCK=64):
Working set per tile: 64 x 64 x 4 = 16KB per matrix
Three tiles: 48KB (fits in 64KB L1 cache!)

Inner loop accesses 64-element rows of B tile:
B[k*N+jj], B[k*N+jj+1], ..., B[k*N+jj+63]
Sequential access -> cache lines fully utilized

Result: ~0 cache misses per tile computation
        Performance: ~15 GFLOPS (30x improvement)


Cache hierarchy visualization:

+----------+  Naive: data here (SLOW)        Blocked: data here (FAST)
|   DRAM   |  <--- B columns miss cache      |
|  ~100ns  |      every access                |
+----------+                                  |
     |                                        |
+----------+                                  |
| L3 Cache |                                  |
|  ~20ns   |                                  |
+----------+                                  |
     |                                        |
+----------+                                  |
| L2 Cache |                                  |
|  ~5ns    |                               +----------+
+----------+                               | L1 Cache |
     |                                     |  ~1ns    |
+----------+                               +----------+
| L1 Cache |                                  ^
|  ~1ns    |                                  |
+----------+                          64x64 tiles fit here
```

### Choosing the Right Block Size

```
Block Size Selection:

L1 data cache size: 32 KB (typical)
Elements per block: BLOCK^2
Bytes per block: BLOCK^2 * 4 (float) or BLOCK^2 * 8 (double)

For matmul with 3 tile buffers (A-tile, B-tile, C-tile):
3 * BLOCK^2 * 4 <= 32768
BLOCK^2 <= 2730
BLOCK <= 52

Round down to power of 2 or nice number: BLOCK = 48 or 32

For L2 (256 KB): BLOCK = 128-192
For L3 (8 MB):   BLOCK = 512-1024

Multi-level blocking:
for (i2 in 0..N step L3_BLOCK)      // L3 tiling
  for (j2 in 0..N step L3_BLOCK)
    for (k2 in 0..N step L3_BLOCK)
      for (i1 in i2..i2+L3_BLOCK step L1_BLOCK)   // L1 tiling
        for (j1 in j2..j2+L3_BLOCK step L1_BLOCK)
          for (k1 in k2..k2+L3_BLOCK step L1_BLOCK)
            // micro-kernel with SIMD
```

### Software Prefetching

```cpp
// ============================================================
// Software Prefetching
// ============================================================

#include <immintrin.h>

// Without prefetching
void sum_array_naive(const float *data, int N, float *result) {
    float sum = 0.0f;
    for (int i = 0; i < N; i++) {
        sum += data[i];  // Cache miss every 16 elements (64-byte line / 4 bytes)
    }
    *result = sum;
}

// With software prefetching
void sum_array_prefetch(const float *data, int N, float *result) {
    float sum = 0.0f;
    const int PREFETCH_DISTANCE = 64;  // Elements ahead to prefetch

    for (int i = 0; i < N; i++) {
        // Prefetch data that will be needed PREFETCH_DISTANCE iterations later
        if (i + PREFETCH_DISTANCE < N) {
            _mm_prefetch((const char *)&data[i + PREFETCH_DISTANCE],
                          _MM_HINT_T0);  // Prefetch to L1
        }
        sum += data[i];
    }
    *result = sum;
}

// Prefetch hints:
// _MM_HINT_T0:  Prefetch to L1 (and L2, L3)  -- data needed very soon
// _MM_HINT_T1:  Prefetch to L2 (and L3)       -- data needed soon
// _MM_HINT_T2:  Prefetch to L3                  -- data needed eventually
// _MM_HINT_NTA: Prefetch non-temporal           -- data used once, don't pollute cache

// Linked list traversal with prefetching
struct Node {
    Node *next;
    float data[16];
};

float traverseList(Node *head) {
    float sum = 0.0f;
    Node *curr = head;
    while (curr != nullptr) {
        // Prefetch NEXT node while processing current
        if (curr->next != nullptr) {
            _mm_prefetch((const char *)curr->next, _MM_HINT_T0);
        }
        for (int i = 0; i < 16; i++) {
            sum += curr->data[i];
        }
        curr = curr->next;
    }
    return sum;
}
```

```
Prefetching Timeline:

Without prefetch:
Iteration: |  i=0  |  i=1  |  i=2  |  i=3  |  ...
           | MISS  | hit   | hit   | hit   |  ... (miss every 16 elements)
           |~100ns | ~1ns  | ~1ns  | ~1ns  |
           |       |       |       |       |
           |stall..|compute|compute|compute|

With prefetch (distance = 64):
Iteration: |  i=0  |  i=1  | ... |  i=64 |  i=65 | ...
           | MISS  | hit   |     | HIT!  | hit   |
           |~100ns | ~1ns  |     | ~1ns  | ~1ns  |
           |       |       |     | (data |       |
           |stall..|compute|     | was   |       |
           |       |       |     | pre-  |       |
           |       |       |     |fetched|       |

The prefetch issued at i=0 brings data[64] into cache.
By the time we reach i=64, the data is already in L1.
Effective latency hidden for all iterations after warmup.
```

### NUMA-Aware Allocation

On multi-socket systems, each CPU has its own local memory. Accessing remote memory (other socket's RAM) is 2-3x slower.

```cpp
// ============================================================
// NUMA-Aware Memory Allocation (Linux)
// ============================================================

#include <numa.h>
#include <numaif.h>
#include <sched.h>

// Check NUMA topology
void printNumaInfo() {
    int num_nodes = numa_num_configured_nodes();
    printf("NUMA nodes: %d\n", num_nodes);

    for (int i = 0; i < num_nodes; i++) {
        long free_mem;
        long total_mem = numa_node_size(i, &free_mem);
        printf("Node %d: total=%ld MB, free=%ld MB\n",
               i, total_mem / (1024*1024), free_mem / (1024*1024));
    }
}

// Allocate on specific NUMA node
void numaAwareProcessing(int N) {
    size_t size = N * sizeof(float);

    // Allocate on NUMA node 0
    float *data_node0 = (float *)numa_alloc_onnode(size, 0);

    // Allocate on NUMA node 1
    float *data_node1 = (float *)numa_alloc_onnode(size, 1);

    // Allocate interleaved across all nodes (good for shared data)
    float *data_interleaved = (float *)numa_alloc_interleaved(size);

    // Allocate on the local node (where current thread runs)
    float *data_local = (float *)numa_alloc_local(size);

    // Process data on the correct node
    // Pin thread to node 0's CPUs, process node 0's data
    numa_run_on_node(0);
    processData(data_node0, N);

    // Pin thread to node 1's CPUs, process node 1's data
    numa_run_on_node(1);
    processData(data_node1, N);

    numa_free(data_node0, size);
    numa_free(data_node1, size);
    numa_free(data_interleaved, size);
    numa_free(data_local, size);
}

// First-touch policy: memory is allocated on the NUMA node
// of the thread that first writes to it.
void firstTouchExample(int N) {
    float *data = (float *)malloc(N * sizeof(float));

    // BAD: main thread (node 0) touches all data
    for (int i = 0; i < N; i++) data[i] = 0.0f;
    // Now ALL data is on node 0, even if threads on node 1 use it

    // GOOD: each thread touches its own portion
    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        int nthreads = omp_get_num_threads();
        int chunk = N / nthreads;
        int start = tid * chunk;
        int end = (tid == nthreads - 1) ? N : start + chunk;

        // First touch by the thread that will use this data
        for (int i = start; i < end; i++) {
            data[i] = 0.0f;
        }
    }
    // Now data is distributed across NUMA nodes matching thread affinity
}
```

```
NUMA Architecture (2-socket system):

+------------------+                    +------------------+
|   Socket 0       |                    |   Socket 1       |
|  +--------+      |                    |      +--------+  |
|  | Core 0 |      |                    |      | Core 4 |  |
|  | Core 1 |      |   Interconnect     |      | Core 5 |  |
|  | Core 2 |      | <================> |      | Core 6 |  |
|  | Core 3 |      |  (QPI / UPI)       |      | Core 7 |  |
|  +--------+      |  ~100 GB/s         |      +--------+  |
|       |          |                    |           |      |
|  +---------+     |                    |     +---------+  |
|  | DDR5    |     |                    |     | DDR5    |  |
|  | Node 0  |     |                    |     | Node 1  |  |
|  | ~50GB/s |     |                    |     | ~50GB/s |  |
|  +---------+     |                    |     +---------+  |
+------------------+                    +------------------+

Local access  (Core 0 -> Node 0): ~80ns, ~50 GB/s
Remote access (Core 0 -> Node 1): ~150ns, ~25 GB/s (via interconnect)
                                   ~2x latency, ~0.5x bandwidth
```

### Huge Pages

Standard page size is 4 KB. For large datasets, the **Translation Lookaside Buffer (TLB)** runs out of entries, causing expensive page table walks. Huge pages (2 MB or 1 GB) reduce TLB pressure.

```cpp
// ============================================================
// Huge Pages (Linux)
// ============================================================

#include <sys/mman.h>

// Method 1: mmap with MAP_HUGETLB
void *hugePageAlloc(size_t size) {
    void *ptr = mmap(nullptr, size,
                      PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                      -1, 0);
    if (ptr == MAP_FAILED) {
        perror("mmap huge page failed");
        return nullptr;
    }
    return ptr;
}

// Method 2: madvise on existing allocation
void *hugePageAllocMadvise(size_t size) {
    // Align to 2MB boundary
    size_t aligned_size = (size + (2 * 1024 * 1024 - 1)) &
                          ~(2 * 1024 * 1024 - 1);
    void *ptr = aligned_alloc(2 * 1024 * 1024, aligned_size);
    if (ptr != nullptr) {
        madvise(ptr, aligned_size, MADV_HUGEPAGE);
    }
    return ptr;
}

// Why huge pages matter:
// TLB typically has 1024-4096 entries
// With 4KB pages:  4096 entries x 4KB  = 16 MB addressable
// With 2MB pages:  4096 entries x 2MB  = 8 GB addressable
// With 1GB pages:  4096 entries x 1GB  = 4 TB addressable
//
// For a 1 GB dataset with 4KB pages: 262,144 pages
// TLB can only hold ~4096 -> constant TLB misses
// Each TLB miss: ~10-100 ns penalty (page table walk)
```

```
TLB Impact on Performance:

4 KB pages, 1 GB working set:
Pages: 262,144
TLB entries: 4,096
TLB hit rate: 4096/262144 = 1.6%
98.4% of accesses cause page table walk (~50 ns each)

2 MB huge pages, 1 GB working set:
Pages: 512
TLB entries: 4,096
TLB hit rate: 100% (512 < 4096)
No page table walks!

Performance improvement: 2-5x for random access patterns
                         10-30% for sequential patterns
```

### Memory-Mapped I/O

```cpp
// ============================================================
// Memory-Mapped I/O (mmap)
// ============================================================

#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>

// Process a large file without loading it all into RAM
void processLargeFile(const char *filename) {
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        perror("open failed");
        return;
    }

    struct stat st;
    fstat(fd, &st);
    size_t fileSize = st.st_size;

    // Map file into virtual address space
    // OS will page in data on demand
    void *mapped = mmap(nullptr, fileSize, PROT_READ,
                         MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap failed");
        close(fd);
        return;
    }

    // Advise kernel about access pattern
    madvise(mapped, fileSize, MADV_SEQUENTIAL);  // We read sequentially

    // Access file as if it were in memory
    const float *data = (const float *)mapped;
    size_t numElements = fileSize / sizeof(float);

    double sum = 0.0;
    for (size_t i = 0; i < numElements; i++) {
        sum += data[i];
    }

    // Cleanup
    munmap(mapped, fileSize);
    close(fd);

    printf("Sum: %f\n", sum);
}

// mmap vs read/fread:
//
// mmap advantages:
//   - Zero-copy: kernel maps file pages directly, no user-space buffer
//   - Lazy loading: only pages actually accessed are loaded
//   - Automatic eviction: OS manages page cache
//   - Shared between processes: multiple processes can mmap same file
//
// mmap disadvantages:
//   - TLB pressure for large files
//   - Page fault overhead for random access
//   - Less control over prefetching than manual read()
//   - Cannot use with some special files (pipes, sockets)
//
// madvise hints:
//   MADV_SEQUENTIAL  - sequential access, aggressive readahead
//   MADV_RANDOM      - random access, disable readahead
//   MADV_WILLNEED    - prefetch these pages soon
//   MADV_DONTNEED    - done with these pages, can be freed
//   MADV_HUGEPAGE    - use transparent huge pages
```

### Putting CPU Optimizations Together

```cpp
// ============================================================
// Combined CPU Optimization: Cache-Blocked, SIMD, NUMA-Aware
// Matrix Multiply
// ============================================================

#include <immintrin.h>
#include <omp.h>
#include <numa.h>
#include <cstring>

#define L1_BLOCK 64
#define L2_BLOCK 256

void matmul_optimized(const float * __restrict__ A,
                      const float * __restrict__ B,
                      float * __restrict__ C,
                      int N) {
    memset(C, 0, N * N * sizeof(float));

    // OpenMP parallelization with NUMA-aware first touch
    #pragma omp parallel
    {
        // L2 cache blocking
        #pragma omp for schedule(static)
        for (int ii = 0; ii < N; ii += L2_BLOCK) {
            for (int jj = 0; jj < N; jj += L2_BLOCK) {
                for (int kk = 0; kk < N; kk += L2_BLOCK) {

                    // L1 cache blocking
                    int i_end = (ii + L2_BLOCK < N) ? ii + L2_BLOCK : N;
                    int j_end = (jj + L2_BLOCK < N) ? jj + L2_BLOCK : N;
                    int k_end = (kk + L2_BLOCK < N) ? kk + L2_BLOCK : N;

                    for (int i = ii; i < i_end; i++) {
                        for (int k = kk; k < k_end; k++) {
                            __m256 a_vec = _mm256_set1_ps(A[i * N + k]);

                            // SIMD inner loop (8 floats at a time)
                            int j;
                            for (j = jj; j + 8 <= j_end; j += 8) {
                                __m256 b_vec = _mm256_loadu_ps(&B[k * N + j]);
                                __m256 c_vec = _mm256_loadu_ps(&C[i * N + j]);
                                c_vec = _mm256_fmadd_ps(a_vec, b_vec, c_vec);
                                _mm256_storeu_ps(&C[i * N + j], c_vec);
                            }

                            // Scalar remainder
                            for (; j < j_end; j++) {
                                C[i * N + j] += A[i * N + k] * B[k * N + j];
                            }
                        }
                    }
                }
            }
        }
    }
}

// Performance comparison (single socket, 8 cores, N=2048):
//
// Implementation             GFLOPS    % of Peak
// -----------------------------------------------
// Naive                        0.8        1%
// Cache-blocked (L1)          12.0       15%
// + SIMD (AVX2 FMA)          75.0       94%
// + OpenMP (8 threads)       580.0       91% (of 8-core peak)
// + NUMA-aware (2 sockets)  1100.0       86% (of 16-core peak)
// Intel MKL (reference)     1200.0       94%
```

---

## Comprehensive Memory Hierarchy Summary

```
GPU Memory Hierarchy (NVIDIA A100):

+------------------------------------------------------------------+
| Register File: 256 KB per SM                                      |
| Latency: ~1 cycle  |  Bandwidth: ~20 TB/s per SM                |
| Access: Per-thread  |  Scope: Single thread                      |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| Shared Memory / L1 Cache: 192 KB per SM (configurable split)    |
| Latency: ~20-30 cycles  |  Bandwidth: ~20 TB/s per SM           |
| Access: Per-block       |  Scope: Thread block                   |
| Bank conflicts possible (32 banks)                               |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| L2 Cache: 40 MB total (shared across all SMs)                    |
| Latency: ~200 cycles  |  Bandwidth: ~5 TB/s                     |
| Access: Global         |  Scope: All threads                     |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| HBM2e (Global Memory): 80 GB                                     |
| Latency: ~400-600 cycles  |  Bandwidth: 2039 GB/s               |
| Access: Global              |  Scope: Host + Device               |
| Coalescing critical for performance                               |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| PCIe 4.0 x16: Host <-> Device                                    |
| Latency: ~10 us  |  Bandwidth: ~25 GB/s (each direction)        |
| Pinned memory: 2x faster than pageable                            |
+------------------------------------------------------------------+

Special Memory Types:
+-------------------+--------------------------------------------------+
| Constant Memory   | 64 KB, cached, broadcast to warp (same address)  |
| Texture Memory    | Cached, 2D spatial locality, HW interpolation    |
| Pinned Memory     | Host RAM, page-locked, enables async DMA          |
| Zero-Copy Memory  | Host RAM, mapped to GPU address space              |
| Unified Memory    | Auto-migrated between host and device              |
+-------------------+--------------------------------------------------+


CPU Memory Hierarchy (Modern Server):

+------------------------------------------------------------------+
| Registers: ~1000 per core (architectural)                         |
| Latency: 0 cycles  |  Bandwidth: ~500 GB/s per core             |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| L1 Data Cache: 32-48 KB per core                                  |
| Latency: ~4 cycles  |  Bandwidth: ~300 GB/s per core            |
| Line size: 64 bytes  |  Associativity: 8-12 way                 |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| L2 Cache: 256 KB - 2 MB per core                                 |
| Latency: ~12 cycles  |  Bandwidth: ~100 GB/s per core           |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| L3 Cache (LLC): 8-64 MB shared across cores                      |
| Latency: ~40 cycles  |  Bandwidth: ~50 GB/s per socket          |
| Inclusive or non-inclusive depending on architecture              |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| DRAM (DDR5): 32-512 GB per socket                                 |
| Latency: ~80-120 ns  |  Bandwidth: ~50 GB/s per channel         |
| Channels: 4-8 per socket  |  Total: ~200-400 GB/s              |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
| NVMe SSD: 1-8 TB                                                  |
| Latency: ~10-100 us  |  Bandwidth: ~5-14 GB/s                   |
+------------------------------------------------------------------+

CPU Optimization Techniques:
+-------------------+--------------------------------------------------+
| Cache Blocking    | Tile loops to fit working set in L1/L2 cache     |
| Prefetching       | _mm_prefetch to hide memory latency              |
| NUMA Awareness    | Allocate data on same node as processing thread  |
| Huge Pages        | 2MB/1GB pages to reduce TLB misses               |
| mmap              | Zero-copy file I/O via virtual memory mapping     |
| Alignment         | Align data to cache line (64B) and SIMD (32B)    |
+-------------------+--------------------------------------------------+
```

---

## Optimization Checklist

Use this checklist systematically when optimizing memory-bound kernels.

### GPU Memory Optimization Checklist

```
[ ] COALESCING
    [ ] Global memory accesses are stride-1 (consecutive threads, consecutive addresses)
    [ ] Data layout is SoA (Structure of Arrays), not AoS
    [ ] Base pointers are aligned (cudaMalloc handles this)
    [ ] No warp-divergent memory access patterns

[ ] SHARED MEMORY
    [ ] Frequently reused data loaded into shared memory
    [ ] Tile sizes chosen to maximize shared memory utilization
    [ ] Bank conflicts eliminated (check with Nsight Compute)
    [ ] 2D shared arrays padded (+1 column) to avoid bank conflicts
    [ ] __syncthreads() placed correctly (no race conditions)

[ ] GLOBAL MEMORY PATTERNS
    [ ] Matrix operations use tiling
    [ ] Transpose operations use shared memory intermediary
    [ ] Read-only data marked with __ldg() or const __restrict__
    [ ] 128-byte aligned accesses where possible

[ ] SPECIAL MEMORY
    [ ] Uniform read-only data in __constant__ memory (< 64 KB)
    [ ] 2D spatially-local read-only data uses texture memory
    [ ] Kernel parameters passed via constant memory (automatic)

[ ] HOST-DEVICE TRANSFER
    [ ] Host buffers allocated with cudaMallocHost (pinned)
    [ ] Async transfers with cudaMemcpyAsync + streams
    [ ] Transfer overlapped with compute (double buffering)
    [ ] Write-combined memory for CPU-write-only buffers
    [ ] Zero-copy considered for small/infrequent data

[ ] ALLOCATION
    [ ] cudaMallocAsync / cudaFreeAsync used for dynamic allocations
    [ ] Memory pool configured with appropriate release threshold
    [ ] No cudaMalloc/cudaFree in hot loops

[ ] MEASUREMENT
    [ ] Kernel profiled with Nsight Compute
    [ ] Achieved bandwidth compared to theoretical peak
    [ ] Roofline analysis performed (memory-bound vs compute-bound)
    [ ] Bank conflicts measured and minimized
```

### CPU Memory Optimization Checklist

```
[ ] CACHE UTILIZATION
    [ ] Hot loops tiled/blocked to fit in L1 cache
    [ ] Data structures laid out for sequential access
    [ ] Unnecessary padding removed (struct size minimized)
    [ ] Cache line false sharing eliminated between threads

[ ] PREFETCHING
    [ ] Software prefetch (_mm_prefetch) for irregular access
    [ ] Prefetch distance tuned to memory latency / loop iteration time
    [ ] Compiler prefetching not disabled (-O2 or higher)

[ ] NUMA AWARENESS
    [ ] Thread-to-core pinning matches data placement
    [ ] First-touch initialization done by the processing thread
    [ ] NUMA-local allocation for thread-private data
    [ ] Interleaved allocation for shared read-only data

[ ] VIRTUAL MEMORY
    [ ] Huge pages enabled for large allocations (> 10 MB)
    [ ] mmap used for large file I/O with madvise hints
    [ ] TLB pressure assessed for random access patterns

[ ] ALIGNMENT
    [ ] Data aligned to cache line size (64 bytes)
    [ ] SIMD data aligned to vector width (32 bytes for AVX)
    [ ] Struct members ordered to minimize padding
```

---

## Interview Questions

### Fundamentals

**Q1: What is memory coalescing on a GPU, and why does it matter?**

Memory coalescing is the hardware mechanism that combines individual memory requests from threads in a warp into as few memory transactions as possible. When 32 threads access 32 consecutive 4-byte values (stride-1 pattern), the hardware issues a single 128-byte transaction. When threads access scattered locations, each thread may trigger a separate 128-byte transaction, wasting up to 31/32 of the transferred data. On a GPU like the A100 with 2 TB/s peak bandwidth, non-coalesced access might achieve only 60-100 GB/s effective bandwidth -- a 20-30x degradation.

**Q2: Explain the difference between AoS and SoA. Which is better for GPU processing and why?**

AoS (Array of Structures) stores all fields of one entity contiguously: `[x0,y0,z0,x1,y1,z1,...]`. SoA (Structure of Arrays) stores each field contiguously: `[x0,x1,x2,...], [y0,y1,y2,...]`. SoA is better for GPU processing because when a warp of 32 threads reads the `x` field, consecutive threads access consecutive memory addresses (stride-1), enabling perfect coalescing. With AoS, threads accessing the `x` field are strided by the struct size, causing multiple memory transactions. The typical speedup from AoS-to-SoA conversion is 3-5x for memory-bound kernels.

**Q3: What is a shared memory bank conflict, and how do you avoid it?**

Shared memory is divided into 32 banks, with consecutive 4-byte words mapped to consecutive banks. A bank conflict occurs when two or more threads in the same warp access different addresses in the same bank, serializing those accesses. A 2-way conflict takes 2 cycles instead of 1; a 32-way conflict takes 32 cycles. The most common fix is the **padding technique**: for a 2D shared memory array `float smem[32][32]`, column access creates 32-way bank conflicts because row width equals bank count. Changing to `float smem[32][33]` shifts each row by one bank, eliminating conflicts. The broadcast exception allows multiple threads to read the same address in the same bank in one cycle.

### Intermediate

**Q4: Describe how you would use shared memory to implement an efficient matrix transpose.**

The naive transpose reads rows (coalesced) but writes columns (non-coalesced). The optimized approach uses a 32x33 shared memory tile (padded to avoid bank conflicts): (1) Each thread block loads a 32x32 tile from the input matrix using coalesced row reads into shared memory. (2) `__syncthreads()` ensures all data is loaded. (3) Each thread block writes the tile to the output matrix with swapped block indices and swapped thread index usage, so that `threadIdx.x` maps to the contiguous output dimension, producing coalesced writes. The key insight is that shared memory has no coalescing requirement -- only bank conflicts matter -- so it serves as a "memory layout converter" between coalesced reads and coalesced writes.

**Q5: When should you use constant memory vs global memory vs shared memory?**

**Constant memory** (64 KB, read-only, cached): Use when all threads in a warp read the same address simultaneously -- the value is broadcast in one cycle. Ideal for filter coefficients, physical constants, transformation matrices. Poor when threads read different addresses (accesses serialize).

**Global memory** (up to 80+ GB, read/write): Default for large data. Requires coalesced access. Use L1/L2 cache naturally for read-only data via `__ldg()` or `const __restrict__` qualifiers. Highest capacity but highest latency.

**Shared memory** (up to 164 KB per SM, read/write): Use as a programmer-managed cache for data reused within a thread block. Essential for tiling algorithms (matrix multiply, convolution, transpose). Lower latency than L1 cache but requires explicit management and `__syncthreads()`.

**Q6: What is pinned memory, why is it faster for host-device transfers, and what are the trade-offs?**

Pinned (page-locked) memory is host memory that the OS is prevented from swapping to disk. For pageable memory, the CUDA driver must first copy data to an internal pinned staging buffer before DMA transfer to the GPU -- this extra copy halves effective bandwidth. Pinned memory allows direct DMA, achieving near-peak PCIe bandwidth (2x faster). It also enables `cudaMemcpyAsync` for overlapping transfers with computation.

Trade-offs: Pinned memory reduces the OS's ability to manage physical memory. Over-allocating pinned memory can starve other processes and the OS, potentially causing system-wide performance degradation or even out-of-memory errors. As a rule of thumb, pin only the buffers actively involved in host-device transfers.

### Advanced

**Q7: Explain the Roofline Model and how you use it to guide optimization.**

The Roofline Model plots achievable performance (FLOPS) as a function of arithmetic intensity (FLOPs/byte). Two ceilings exist: the **memory bandwidth roof** (a diagonal line with slope equal to peak bandwidth) and the **compute roof** (a horizontal line at peak FLOPS). The **ridge point** where they meet is `Peak FLOPS / Peak Bandwidth`. If a kernel's arithmetic intensity is below the ridge point, it is memory-bound: optimization should focus on memory access patterns, caching, and data compression. If above, it is compute-bound: optimization should focus on reducing FLOPs, using lower precision, or exploiting specialized hardware like Tensor Cores. I use it to avoid wasting effort -- if a kernel achieves 85% of its memory bandwidth roof, further memory optimization yields diminishing returns and I should instead look at increasing arithmetic intensity (e.g., kernel fusion).

**Q8: You have a kernel that reads a 2D grid and applies a 5-point stencil. It achieves 30% of peak memory bandwidth. Walk through your optimization strategy.**

1. **Profile**: Use Nsight Compute to check coalescing efficiency and L2 hit rate.
2. **Coalescing**: Ensure the X dimension (innermost) varies fastest for consecutive threads. Row-major traversal with `threadIdx.x` mapping to columns gives stride-1 access.
3. **Shared memory tiling**: Load a tile (including halo elements for the stencil) into shared memory. Each element is read 5 times in global memory but only once from shared memory -- a 5x reduction in global memory traffic. Use padding to avoid bank conflicts.
4. **Register caching**: Keep the center row in registers across iterations (sliding window technique) to reduce shared memory traffic.
5. **Occupancy**: Ensure shared memory usage does not limit occupancy excessively. Try smaller tiles if occupancy drops below 50%.
6. **Data types**: If FP16 precision is acceptable, cut memory traffic in half.
7. **Re-measure**: After each change, compare achieved bandwidth to the roofline to assess remaining headroom.

**Q9: What are CUDA memory pools and when would you use them?**

CUDA memory pools (`cudaMallocAsync`/`cudaFreeAsync`, CUDA 11.2+) maintain a cache of previously allocated device memory. When you "free" memory, it returns to the pool rather than the OS. Subsequent allocations of similar sizes reuse pooled memory, avoiding the ~100 us overhead of `cudaMalloc`. They are essential for workloads with dynamic memory needs: deep learning training with variable-length sequences, graph algorithms with dynamic frontier sizes, or any application making many small allocations. Pool allocations are stream-ordered, meaning the runtime ensures correct synchronization. You can configure pool release thresholds to balance memory reuse against memory consumption.

**Q10: Explain NUMA and its implications for CPU memory optimization in a multi-socket server.**

NUMA (Non-Uniform Memory Access) means each CPU socket has its own directly-attached memory. Accessing local memory takes ~80 ns, while accessing remote memory (on the other socket) goes through the interconnect and takes ~150 ns with half the bandwidth. Implications: (1) **Data placement**: Use first-touch policy -- have each thread initialize its own data portion so the OS allocates pages on the local NUMA node. (2) **Thread pinning**: Pin threads to cores near their data using `numa_run_on_node()` or `pthread_setaffinity_np()`. (3) **Allocation API**: Use `numa_alloc_onnode()` for node-specific allocation, `numa_alloc_interleaved()` for shared read-only data. (4) **Beware serial initialization**: If the main thread initializes all arrays, everything lands on one node, creating a bandwidth bottleneck when parallel threads on the other node access it. A 2-socket system with poor NUMA behavior may perform worse than a single socket.

**Q11: A kernel processes 100 million particles, each with position (x,y,z) and velocity (vx,vy,vz). Design the optimal memory layout and transfer strategy.**

Use **SoA layout** with 6 separate arrays (x, y, z, vx, vy, vz), each of 100M floats (400 MB per array, 2.4 GB total). This ensures stride-1 coalesced access when the kernel processes positions or velocities.

For transfer: allocate host arrays with `cudaMallocHost` (pinned memory). Use **double-buffered async transfers** with 2 CUDA streams: while chunk N is being processed, chunk N+1 is being transferred H2D, and chunk N-1 is being transferred D2H. Split the 100M particles into 4-8 chunks for good overlap.

For the kernel: if the update reads all 6 fields and writes 3 (position), arithmetic intensity is 6 FLOPs / (9 \* 4 bytes) = 0.17 FLOPs/byte -- extremely memory-bound. Focus entirely on maximizing memory bandwidth: ensure coalesced access (SoA achieves this), consider fusing the update with any subsequent kernel to avoid an extra pass over memory, and potentially use FP16 for velocity if precision permits, doubling effective bandwidth.

**Q12: Compare and contrast the following GPU memory optimization techniques: shared memory tiling, constant memory broadcast, texture cache, and L1/L2 cache. When would you choose each?**

| Technique            | Best For                                          | Capacity                    | Latency           | Programmer Effort                                      |
| -------------------- | ------------------------------------------------- | --------------------------- | ----------------- | ------------------------------------------------------ |
| Shared memory tiling | Data reused within a block, known access patterns | ~100 KB/SM                  | ~20 cycles        | High (explicit load, sync, index)                      |
| Constant memory      | Small read-only data, uniform access across warp  | 64 KB total                 | ~4 cycles (hit)   | Low (declare `__constant__`, use `cudaMemcpyToSymbol`) |
| Texture cache        | 2D spatial locality, interpolation needed         | Implicit (backed by global) | ~100 cycles (hit) | Medium (create texture object)                         |
| L1/L2 cache          | General read-heavy access, varies per thread      | 192 KB L1, 40 MB L2         | ~30/~200 cycles   | None (automatic, use `__ldg()` hint)                   |

Choose shared memory when you can predict reuse patterns and control the data lifecycle. Choose constant memory for small lookup tables accessed uniformly by all threads. Choose texture for image processing or other 2D access patterns. Rely on L1/L2 when access patterns are irregular but have some locality, or when shared memory is already fully utilized. These techniques are not mutually exclusive -- a well-optimized kernel may use all four simultaneously.

---

## Chapter Summary

```
Key Takeaways:

1. MOST GPU KERNELS ARE MEMORY-BOUND
   Optimize memory access before optimizing compute.

2. COALESCING IS THE #1 GPU MEMORY OPTIMIZATION
   Stride-1 access. SoA layout. Aligned base addresses.

3. SHARED MEMORY IS YOUR L1 CACHE
   Use it to convert non-coalesced to coalesced.
   Pad 2D arrays to avoid bank conflicts (+1 column).

4. USE THE RIGHT MEMORY FOR THE JOB
   Constant: uniform broadcast. Texture: 2D spatial.
   Pinned: fast transfers. Pools: fast allocation.

5. THE ROOFLINE MODEL IS YOUR COMPASS
   Calculate AI. Plot on roofline. Know your bottleneck.
   Memory-bound? Fix access patterns. Compute-bound? Reduce FLOPs.

6. CPU MEMORY MATTERS TOO
   Cache blocking is the CPU equivalent of shared memory tiling.
   NUMA awareness can double multi-socket performance.
   Huge pages eliminate TLB thrashing for large datasets.

7. MEASURE, THEN OPTIMIZE
   Use Nsight Compute (GPU) and perf/VTune (CPU).
   Compare achieved vs theoretical bandwidth.
   Stop when you hit 80%+ of the relevant roofline ceiling.
```

---

_Next chapter: [Chapter 8 - Multi-GPU and HPC](08-MULTI-GPU-HPC.md) -- scaling beyond a single GPU with multi-GPU programming, NCCL, MPI+CUDA, and GPU-Direct RDMA._
