# Chapter 2: CPU Performance Optimization

> **Prerequisites**: Chapter 1 (Computer Architecture basics -- caches, pipelines, out-of-order execution).
> **Goal**: Transform naive C/C++ code into high-performance code by understanding *why* hardware behaves the way it does and *how* to exploit it.

---

## Table of Contents

1. [Cache-Friendly Programming](#1-cache-friendly-programming)
2. [SIMD / Vectorization](#2-simd--vectorization)
3. [Memory Alignment](#3-memory-alignment)
4. [Branch Prediction Optimization](#4-branch-prediction-optimization)
5. [Compiler Optimizations](#5-compiler-optimizations)
6. [Memory Prefetching](#6-memory-prefetching)
7. [Lock-Free Programming](#7-lock-free-programming)
8. [NUMA Awareness](#8-numa-awareness)
9. [Practical Optimization Workflow](#9-practical-optimization-workflow)
10. [Practice Exercises](#practice-exercises)
11. [Interview Questions](#interview-questions)

---

## 1. Cache-Friendly Programming

The single largest performance gain you can achieve on a modern CPU is making your memory access
patterns cache-friendly. A cache miss to main memory costs **~100 ns** while an L1 hit costs **~1 ns**.
That is a 100x difference. No amount of clever arithmetic can compensate for a poor access pattern.

### 1.1 How Caches Work (Quick Recap)

```
  CPU Core
  +--------+
  | Regs   |  ~0.3 ns    (a few KB)
  +--------+
       |
  +--------+
  |  L1d   |  ~1 ns      (32-48 KB)
  +--------+
       |
  +--------+
  |   L2   |  ~4-7 ns    (256 KB - 1 MB)
  +--------+
       |
  +--------+
  |   L3   |  ~10-20 ns  (8-64 MB, shared)
  +--------+
       |
  +--------+
  |  DRAM  |  ~60-120 ns (GBs)
  +--------+
```

Key facts:
- **Cache line**: The unit of transfer is 64 bytes (on x86). When you read one byte, the
  hardware fetches all 64 bytes surrounding it.
- **Spatial locality**: Accessing addresses near each other is fast because they share a cache line.
- **Temporal locality**: Accessing the same address repeatedly is fast because it stays in cache.

### 1.2 Row-Major vs. Column-Major Traversal

C and C++ store 2D arrays in **row-major** order. This means `a[0][0], a[0][1], ..., a[0][N-1]`
are contiguous in memory, followed by `a[1][0], a[1][1], ...` and so on.

```
Memory layout for int a[3][4] (row-major):

Address:  0    4    8   12   16   20   24   28   32   36   40   44
        +----+----+----+----+----+----+----+----+----+----+----+----+
        |0,0 |0,1 |0,2 |0,3 |1,0 |1,1 |1,2 |1,3 |2,0 |2,1 |2,2 |2,3 |
        +----+----+----+----+----+----+----+----+----+----+----+----+
        <--- row 0 --->     <--- row 1 --->     <--- row 2 --->
```

**Row-major traversal** (cache-friendly):

```c
// GOOD: Sequential memory access -- one cache miss per 16 ints (64 bytes / 4 bytes)
void sum_row_major(int a[N][N]) {
    long sum = 0;
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            sum += a[i][j];  // stride-1 access
        }
    }
}
```

**Column-major traversal** (cache-hostile):

```c
// BAD: Stride-N access -- one cache miss PER element for large N
void sum_col_major(int a[N][N]) {
    long sum = 0;
    for (int j = 0; j < N; j++) {
        for (int i = 0; i < N; i++) {
            sum += a[i][j];  // stride-N access
        }
    }
}
```

```
Access pattern visualization for a[4][4]:

Row-major order:          Column-major order:
a[0][0] -> a[0][1] ->    a[0][0] -> a[1][0] ->
a[0][2] -> a[0][3] ->    a[2][0] -> a[3][0] ->
a[1][0] -> a[1][1] ->    a[0][1] -> a[1][1] ->
...                       ...

Memory jumps:             Memory jumps:
+4 bytes each time        +N*4 bytes each time
= sequential              = skipping entire rows
```

**Benchmark results** (N=4096, int matrix, Intel i7-12700K):

| Traversal     | Time (ms) | L1 Miss Rate | Speedup |
|---------------|-----------|--------------|---------|
| Row-major     | 12        | 0.8%         | 1.0x    |
| Column-major  | 85        | 23.4%        | 0.14x   |

That is a **7x** slowdown just from changing the loop order.

**Benchmark code**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define N 4096

static int matrix[N][N];

double time_row_major(void) {
    struct timespec start, end;
    long sum = 0;

    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            sum += matrix[i][j];
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    // Prevent dead-code elimination
    volatile long sink = sum;
    (void)sink;

    return (end.tv_sec - start.tv_sec) + (end.tv_nsec - start.tv_nsec) / 1e9;
}

double time_col_major(void) {
    struct timespec start, end;
    long sum = 0;

    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int j = 0; j < N; j++) {
        for (int i = 0; i < N; i++) {
            sum += matrix[i][j];
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    volatile long sink = sum;
    (void)sink;

    return (end.tv_sec - start.tv_sec) + (end.tv_nsec - start.tv_nsec) / 1e9;
}

int main(void) {
    // Initialize with random data
    srand(42);
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            matrix[i][j] = rand() % 100;

    printf("Row-major:    %.4f s\n", time_row_major());
    printf("Column-major: %.4f s\n", time_col_major());
    return 0;
}
// Compile: gcc -O2 -o cache_bench cache_bench.c
```

### 1.3 Loop Tiling (Blocking)

When you cannot avoid non-sequential access (e.g., matrix multiply), **loop tiling** partitions
the iteration space into small blocks that fit in cache.

**Naive matrix multiply**:

```c
// O(N^3) with terrible cache behavior for B
void matmul_naive(const float *A, const float *B, float *C, int n) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            float sum = 0.0f;
            for (int k = 0; k < n; k++) {
                sum += A[i * n + k] * B[k * n + j];
                //                      ^^^^^^^^^ stride-n access!
            }
            C[i * n + j] = sum;
        }
    }
}
```

The access to `B[k*n + j]` jumps by `n` floats each iteration of `k`, destroying spatial locality.

**Tiled matrix multiply**:

```c
#define BLOCK 64  // Chosen to fit in L1 cache

void matmul_tiled(const float *A, const float *B, float *C, int n) {
    // Zero-initialize C
    for (int i = 0; i < n * n; i++) C[i] = 0.0f;

    for (int ii = 0; ii < n; ii += BLOCK) {
        for (int jj = 0; jj < n; jj += BLOCK) {
            for (int kk = 0; kk < n; kk += BLOCK) {
                // Multiply the block
                int i_end = (ii + BLOCK < n) ? ii + BLOCK : n;
                int j_end = (jj + BLOCK < n) ? jj + BLOCK : n;
                int k_end = (kk + BLOCK < n) ? kk + BLOCK : n;

                for (int i = ii; i < i_end; i++) {
                    for (int k = kk; k < k_end; k++) {
                        float a_ik = A[i * n + k];
                        for (int j = jj; j < j_end; j++) {
                            C[i * n + j] += a_ik * B[k * n + j];
                        }
                    }
                }
            }
        }
    }
}
```

```
Tiling visualization (BLOCK=2 for simplicity):

Instead of processing the entire matrix at once:

  +-------+       +-------+       +-------+
  | A     |   x   | B     |   =   | C     |
  |       |       |       |       |       |
  +-------+       +-------+       +-------+

We process small tiles that fit in L1 cache:

  +--+--+--+     +--+--+--+     +--+--+--+
  |T1|T2|T3|     |T1|T2|T3|     |  |  |  |
  +--+--+--+  x  +--+--+--+  =  +--+--+--+
  |T4|T5|T6|     |T4|T5|T6|     |  |  |  |
  +--+--+--+     +--+--+--+     +--+--+--+

  C_tile(i,j) += A_tile(i,k) * B_tile(k,j)
  Each tile fits in ~L1 cache (BLOCK*BLOCK*4 bytes)
```

**Why BLOCK=64?** With `float` (4 bytes), a 64x64 tile is `64*64*4 = 16 KB`. Three such tiles
(A, B, C) fit in a 48 KB L1 data cache.

**Benchmark results** (N=2048, float, Intel i7-12700K):

| Version       | Time (ms) | GFLOPS | L1 Miss Rate |
|---------------|-----------|--------|--------------|
| Naive         | 4200      | 4.1    | 24.1%        |
| Tiled (B=32)  | 820       | 21.0   | 3.2%         |
| Tiled (B=64)  | 680       | 25.3   | 1.8%         |

Over **6x** speedup from tiling alone.

### 1.4 Struct of Arrays (SoA) vs. Array of Structs (AoS)

When processing many objects but only using a few fields, **SoA** is cache-friendly because
the accessed fields are contiguous.

**Array of Structs (AoS)** -- traditional OOP layout:

```c
// AoS: All fields of one particle are together
struct Particle_AoS {
    float x, y, z;       // position
    float vx, vy, vz;    // velocity
    float mass;           // mass
    int   type;           // particle type
};  // 32 bytes total

struct Particle_AoS particles[1000000];

// If you only need positions, you still load velocity, mass, type
// into cache lines -- wasting 20/32 = 62.5% of cache bandwidth!
```

```
AoS memory layout:

|x|y|z|vx|vy|vz|mass|type|x|y|z|vx|vy|vz|mass|type|...
|<--- particle 0 --->|    |<--- particle 1 --->|
          ^^^ wasted bandwidth when only reading x,y,z
```

**Struct of Arrays (SoA)** -- data-oriented layout:

```c
// SoA: Same field across all particles is together
struct Particles_SoA {
    float *x, *y, *z;       // all x's together, all y's together...
    float *vx, *vy, *vz;
    float *mass;
    int   *type;
};

// Now accessing all x's is a sequential scan -- perfect spatial locality
```

```
SoA memory layout:

x:    |x0|x1|x2|x3|x4|x5|x6|x7|...   <- sequential, cache-friendly
y:    |y0|y1|y2|y3|y4|y5|y6|y7|...
z:    |z0|z1|z2|z3|z4|z5|z6|z7|...
vx:   |vx0|vx1|vx2|vx3|...
...
```

**Example -- computing kinetic energy**:

```c
// AoS version: loads 32 bytes per particle, uses only 16 (vx, vy, vz, mass)
float total_kinetic_aos(const struct Particle_AoS *p, int n) {
    float total = 0.0f;
    for (int i = 0; i < n; i++) {
        float v2 = p[i].vx * p[i].vx +
                    p[i].vy * p[i].vy +
                    p[i].vz * p[i].vz;
        total += 0.5f * p[i].mass * v2;
    }
    return total;
}

// SoA version: loads exactly what is needed, sequential access
float total_kinetic_soa(const struct Particles_SoA *p, int n) {
    float total = 0.0f;
    for (int i = 0; i < n; i++) {
        float v2 = p->vx[i] * p->vx[i] +
                    p->vy[i] * p->vy[i] +
                    p->vz[i] * p->vz[i];
        total += 0.5f * p->mass[i] * v2;
    }
    return total;
}
```

**Benchmark** (N=10,000,000 particles):

| Layout | Time (ms) | Bandwidth Used | Speedup |
|--------|-----------|----------------|---------|
| AoS    | 38        | 50% wasted     | 1.0x    |
| SoA    | 14        | ~100% useful   | 2.7x    |

**When to use which**:
- **SoA**: Batch processing many items, accessing few fields. Ideal for SIMD.
- **AoS**: Individual item access, all fields used together. Simpler code.
- **AoSoA** (hybrid): Groups of SoA tiles, balancing both. Used in game engines.

### 1.5 False Sharing and Cache Line Padding

**False sharing** occurs when two threads write to different variables that happen to reside
on the same cache line. The hardware cache coherence protocol (MESI/MOESI) forces the line
to bounce between cores, destroying performance.

```
False sharing scenario:

  Core 0                    Core 1
  +--------+                +--------+
  | writes |                | writes |
  | counter[0]              | counter[1]
  +--------+                +--------+
       \                     /
        +-------------------+
        | Cache Line (64B)  |
        | [cnt0] [cnt1] ... |
        +-------------------+
        ^                   ^
   Core 0 invalidates    Core 1 invalidates
   line on Core 1        line on Core 0
   EVERY write           EVERY write

   Result: ~100 ns per write instead of ~1 ns
```

**Demonstrating false sharing**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <time.h>

#define NUM_THREADS 4
#define ITERATIONS 100000000

// BAD: All counters on the same (or adjacent) cache lines
struct BadCounters {
    long counter[NUM_THREADS];  // 4 * 8 = 32 bytes, fits in ONE cache line
};

// GOOD: Each counter on its own cache line
struct GoodCounters {
    struct {
        long counter;
        char padding[64 - sizeof(long)];  // pad to 64 bytes
    } per_thread[NUM_THREADS];
};

// In C++17 / C11 with extensions:
// struct alignas(64) PaddedCounter { long value; };

static struct BadCounters bad;
static struct GoodCounters good;

void *increment_bad(void *arg) {
    int id = *(int *)arg;
    for (long i = 0; i < ITERATIONS; i++) {
        bad.counter[id]++;
    }
    return NULL;
}

void *increment_good(void *arg) {
    int id = *(int *)arg;
    for (long i = 0; i < ITERATIONS; i++) {
        good.per_thread[id].counter++;
    }
    return NULL;
}

double benchmark(void *(*func)(void *)) {
    pthread_t threads[NUM_THREADS];
    int ids[NUM_THREADS];
    struct timespec start, end;

    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < NUM_THREADS; i++) {
        ids[i] = i;
        pthread_create(&threads[i], NULL, func, &ids[i]);
    }
    for (int i = 0; i < NUM_THREADS; i++) {
        pthread_join(threads[i], NULL);
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    return (end.tv_sec - start.tv_sec) + (end.tv_nsec - start.tv_nsec) / 1e9;
}

int main(void) {
    printf("False sharing (bad):  %.3f s\n", benchmark(increment_bad));
    printf("Padded (good):        %.3f s\n", benchmark(increment_good));
    return 0;
}
// Compile: gcc -O2 -pthread -o false_sharing false_sharing.c
```

**Typical results** (4 cores):

| Version          | Time (s) | Throughput    |
|------------------|----------|---------------|
| False sharing    | 2.8      | 143M ops/s    |
| Cache-line padded| 0.3      | 1333M ops/s   |

**~9x** slowdown from false sharing.

**C++17 provides `std::hardware_destructive_interference_size`**:

```cpp
#include <new>  // std::hardware_destructive_interference_size

struct alignas(std::hardware_destructive_interference_size) AlignedCounter {
    long value = 0;
};
```

---

## 2. SIMD / Vectorization

**SIMD** (Single Instruction, Multiple Data) processes multiple data elements with a single
instruction. Instead of adding two numbers, you add 4, 8, or 16 numbers simultaneously.

### 2.1 SIMD Instruction Sets on x86

```
Evolution of x86 SIMD:

  SSE (1999)      SSE2 (2001)     AVX (2011)      AVX-512 (2017)
  128-bit          128-bit         256-bit          512-bit
  4x float        + 2x double     8x float         16x float
                  + 16x byte      4x double        8x double
                  + 8x short      + 32x byte       + 64x byte
                  + 4x int

  +------+        +------+        +-------------+  +-----------------------------+
  |128b  |        |128b  |        |   256 bit   |  |          512 bit            |
  +------+        +------+        +-------------+  +-----------------------------+

  XMM regs         XMM regs        YMM regs         ZMM regs
  (xmm0-xmm15)                    (ymm0-ymm15)     (zmm0-zmm31)
```

### 2.2 SIMD Data Types and Intrinsics

Intel provides **intrinsics** -- C functions that map directly to SIMD instructions:

```c
#include <immintrin.h>  // All Intel SIMD intrinsics

// SSE types (128-bit):
__m128   // 4 x float
__m128d  // 2 x double
__m128i  // 4 x int32, 8 x int16, 16 x int8, etc.

// AVX types (256-bit):
__m256   // 8 x float
__m256d  // 4 x double
__m256i  // 8 x int32, 16 x int16, 32 x int8, etc.

// AVX-512 types (512-bit):
__m512   // 16 x float
__m512d  // 8 x double
__m512i  // 16 x int32, etc.
```

**Naming convention**: `_mm<width>_<operation>_<type>`

```
_mm256_add_ps   =>  256-bit, add, packed single-precision (float)
_mm_mul_pd      =>  128-bit, multiply, packed double-precision
_mm512_load_si512 => 512-bit, load, signed integer
```

Type suffixes:
- `ps` = packed single (float)
- `pd` = packed double
- `epi32` = packed 32-bit integers
- `epi8` = packed 8-bit integers
- `si128/si256/si512` = generic integer

### 2.3 Example: Vector Addition

**Scalar version**:

```c
void add_scalar(const float *a, const float *b, float *c, int n) {
    for (int i = 0; i < n; i++) {
        c[i] = a[i] + b[i];  // One addition per iteration
    }
}
```

**SSE version (4 floats at a time)**:

```c
#include <immintrin.h>

void add_sse(const float *a, const float *b, float *c, int n) {
    int i = 0;
    // Process 4 floats per iteration
    for (; i + 3 < n; i += 4) {
        __m128 va = _mm_loadu_ps(&a[i]);   // Load 4 floats from a
        __m128 vb = _mm_loadu_ps(&b[i]);   // Load 4 floats from b
        __m128 vc = _mm_add_ps(va, vb);    // Add 4 pairs simultaneously
        _mm_storeu_ps(&c[i], vc);          // Store 4 results
    }
    // Handle remaining elements
    for (; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
```

**AVX version (8 floats at a time)**:

```c
void add_avx(const float *a, const float *b, float *c, int n) {
    int i = 0;
    for (; i + 7 < n; i += 8) {
        __m256 va = _mm256_loadu_ps(&a[i]);   // Load 8 floats
        __m256 vb = _mm256_loadu_ps(&b[i]);
        __m256 vc = _mm256_add_ps(va, vb);    // Add 8 pairs
        _mm256_storeu_ps(&c[i], vc);
    }
    for (; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
// Compile: gcc -O2 -mavx2 -o vec_add vec_add.c
```

**AVX-512 version (16 floats at a time)**:

```c
void add_avx512(const float *a, const float *b, float *c, int n) {
    int i = 0;
    for (; i + 15 < n; i += 16) {
        __m512 va = _mm512_loadu_ps(&a[i]);
        __m512 vb = _mm512_loadu_ps(&b[i]);
        __m512 vc = _mm512_add_ps(va, vb);
        _mm512_storeu_ps(&c[i], vc);
    }
    for (; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
// Compile: gcc -O2 -mavx512f -o vec_add vec_add.c
```

**Benchmark** (N=100,000,000 floats):

| Version   | Time (ms) | Throughput (GB/s) | Speedup |
|-----------|-----------|-------------------|---------|
| Scalar    | 180       | 2.2               | 1.0x    |
| SSE       | 48        | 8.3               | 3.75x   |
| AVX       | 25        | 16.0              | 7.2x    |
| AVX-512   | 14        | 28.6              | 12.9x   |

### 2.4 Example: Dot Product

```c
#include <immintrin.h>

// Scalar dot product
float dot_scalar(const float *a, const float *b, int n) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

// AVX dot product
float dot_avx(const float *a, const float *b, int n) {
    __m256 sum_vec = _mm256_setzero_ps();  // [0,0,0,0,0,0,0,0]
    int i = 0;

    for (; i + 7 < n; i += 8) {
        __m256 va = _mm256_loadu_ps(&a[i]);
        __m256 vb = _mm256_loadu_ps(&b[i]);
        // Fused multiply-add: sum_vec += va * vb
        sum_vec = _mm256_fmadd_ps(va, vb, sum_vec);
    }

    // Horizontal sum of the 8 accumulators
    // sum_vec = [s0, s1, s2, s3, s4, s5, s6, s7]
    __m128 hi = _mm256_extractf128_ps(sum_vec, 1);  // [s4, s5, s6, s7]
    __m128 lo = _mm256_castps256_ps128(sum_vec);     // [s0, s1, s2, s3]
    __m128 sum128 = _mm_add_ps(lo, hi);              // [s0+s4, s1+s5, s2+s6, s3+s7]
    sum128 = _mm_hadd_ps(sum128, sum128);            // [s0+s4+s1+s5, s2+s6+s3+s7, ...]
    sum128 = _mm_hadd_ps(sum128, sum128);            // [total, total, total, total]

    float result = _mm_cvtss_f32(sum128);

    // Handle remaining elements
    for (; i < n; i++) {
        result += a[i] * b[i];
    }

    return result;
}
// Compile: gcc -O2 -mavx2 -mfma -o dot dot.c
```

```
Horizontal sum visualization:

  sum_vec (256-bit) = [s0, s1, s2, s3, s4, s5, s6, s7]

  Step 1: Split into two 128-bit halves and add
    lo  = [s0,   s1,   s2,   s3  ]
    hi  = [s4,   s5,   s6,   s7  ]
    add = [s0+s4, s1+s5, s2+s6, s3+s7]

  Step 2: Horizontal add (adjacent pairs)
    hadd = [s0+s4+s1+s5, s2+s6+s3+s7, ...]

  Step 3: Another horizontal add
    hadd = [s0+s1+s2+s3+s4+s5+s6+s7, ...]

  Step 4: Extract scalar
    result = total sum
```

### 2.5 Example: SIMD String Search (memchr-style)

```c
#include <immintrin.h>
#include <stddef.h>

// Find first occurrence of byte 'c' in buffer, using SSE2
const char *find_byte_sse2(const char *buf, char c, size_t len) {
    __m128i needle = _mm_set1_epi8(c);  // Broadcast c to all 16 lanes
    size_t i = 0;

    // Process 16 bytes at a time
    for (; i + 15 < len; i += 16) {
        __m128i chunk = _mm_loadu_si128((const __m128i *)(buf + i));
        __m128i cmp = _mm_cmpeq_epi8(chunk, needle);  // Compare 16 bytes
        int mask = _mm_movemask_epi8(cmp);             // Extract comparison bits

        if (mask != 0) {
            // Found it! __builtin_ctz gives index of first set bit
            return buf + i + __builtin_ctz(mask);
        }
    }

    // Scalar fallback
    for (; i < len; i++) {
        if (buf[i] == c) return buf + i;
    }
    return NULL;
}
```

```
How _mm_cmpeq_epi8 + _mm_movemask_epi8 works:

  chunk  = ['H','e','l','l','o',' ','W','o','r','l','d','!',0,0,0,0]
  needle = ['l','l','l','l','l','l','l','l','l','l','l','l','l','l','l','l']

  cmpeq  = [00, 00, FF, FF, 00, 00, 00, 00, 00, FF, 00, 00, 00, 00, 00, 00]
              0   0   1   1   0   0   0   0   0   1   0   0   0   0   0   0

  movemask = 0b0000_0010_0000_1100  (bit per byte, high bit of each byte)
           = 0x020C

  __builtin_ctz(0x020C) = 2  =>  found 'l' at index 2
```

### 2.6 Auto-Vectorization

Modern compilers can automatically vectorize simple loops. To help the compiler:

```c
// Hint that pointers don't alias (C99 restrict)
void add_auto(float * restrict c, const float * restrict a,
              const float * restrict b, int n) {
    for (int i = 0; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
// Compile: gcc -O3 -march=native -ftree-vectorize -fopt-info-vec
```

**Check vectorization reports**:

```bash
# GCC: Shows which loops were vectorized
gcc -O3 -march=native -fopt-info-vec-optimized source.c

# Clang: Detailed vectorization analysis
clang -O3 -Rpass=loop-vectorize -Rpass-missed=loop-vectorize source.c
```

**Things that prevent auto-vectorization**:
- Pointer aliasing (fix with `restrict`)
- Complex control flow in loops
- Function calls inside loops (fix with inlining)
- Loop-carried dependencies (reduction is OK, general deps are not)
- Non-contiguous memory access patterns

---

## 3. Memory Alignment

### 3.1 Why Alignment Matters

SIMD instructions require or prefer aligned memory. An **aligned** address is one that is a
multiple of the vector width:

```
16-byte aligned (SSE):  address % 16 == 0
32-byte aligned (AVX):  address % 32 == 0
64-byte aligned (AVX-512): address % 64 == 0

Aligned load (_mm256_load_ps):
  Memory: |----32 bytes----|----32 bytes----|
  Access: ^^^^^^^^^^^^^^^^^
  = One cache line access, fast

Misaligned load (_mm256_loadu_ps):
  Memory: |----32 bytes----|----32 bytes----|
  Access:      ^^^^^^^^^^^^^^^^^
  = May cross cache line boundary, potentially slower
```

On modern x86 CPUs, misaligned access to cacheable memory incurs a **5-20% penalty** on average.
However, crossing a cache line boundary (64-byte) or a page boundary (4096-byte) is much worse:

| Scenario                  | Penalty     |
|---------------------------|-------------|
| Aligned access            | 0%          |
| Misaligned, same line     | 0-5%        |
| Misaligned, crosses line  | 10-30%      |
| Misaligned, crosses page  | 100-300%    |

### 3.2 Allocating Aligned Memory

**C11 `aligned_alloc`**:

```c
#include <stdlib.h>

// Allocate 1024 floats aligned to 64 bytes
float *data = aligned_alloc(64, 1024 * sizeof(float));
// Note: total size must be a multiple of alignment

if (!data) {
    perror("aligned_alloc failed");
    return 1;
}

// Use aligned SIMD loads
__m512 v = _mm512_load_ps(data);  // Requires 64-byte alignment

free(data);  // Normal free works
```

**C++17 `alignas` and `new`**:

```cpp
#include <cstdlib>
#include <new>

// Stack allocation with alignment
alignas(64) float stack_data[1024];

// Heap allocation with alignment (C++17)
float *heap_data = static_cast<float *>(
    ::operator new(1024 * sizeof(float), std::align_val_t{64})
);

// Don't forget to deallocate with matching alignment
::operator delete(heap_data, std::align_val_t{64});
```

**POSIX `posix_memalign`** (for older systems):

```c
#include <stdlib.h>

float *data;
int ret = posix_memalign((void **)&data, 64, 1024 * sizeof(float));
if (ret != 0) {
    // handle error
}

free(data);
```

### 3.3 Struct Alignment and Padding

Compilers add padding to ensure alignment:

```c
struct BadLayout {
    char a;      // 1 byte
    // 7 bytes padding (to align double)
    double b;    // 8 bytes
    char c;      // 1 byte
    // 3 bytes padding (to align int)
    int d;       // 4 bytes
};  // Total: 24 bytes (but only 14 bytes of data!)

struct GoodLayout {
    double b;    // 8 bytes
    int d;       // 4 bytes
    char a;      // 1 byte
    char c;      // 1 byte
    // 2 bytes padding (to reach 8-byte alignment of struct)
};  // Total: 16 bytes (14 bytes of data)
```

```
BadLayout memory map:
Offset: 0    1    8        16   17   20   24
       [a][pad..][b       ][c][pad][d   ]

GoodLayout memory map:
Offset: 0        8    12  13  14  16
       [b       ][d   ][a][c][pad]

Savings: 8 bytes per struct = 33% less memory
```

**Rule**: Sort struct members from largest to smallest alignment requirement.

### 3.4 Alignment for SIMD Data Structures

```c
#include <immintrin.h>
#include <stdlib.h>

// Particle system with guaranteed alignment
typedef struct {
    float *x, *y, *z;
    float *vx, *vy, *vz;
    int count;
} ParticleSystem;

ParticleSystem create_particles(int n) {
    // Round up to multiple of 16 for AVX-512 (16 floats)
    int padded = (n + 15) & ~15;

    ParticleSystem ps;
    ps.count = n;

    // All arrays aligned to 64 bytes for AVX-512
    ps.x  = (float *)aligned_alloc(64, padded * sizeof(float));
    ps.y  = (float *)aligned_alloc(64, padded * sizeof(float));
    ps.z  = (float *)aligned_alloc(64, padded * sizeof(float));
    ps.vx = (float *)aligned_alloc(64, padded * sizeof(float));
    ps.vy = (float *)aligned_alloc(64, padded * sizeof(float));
    ps.vz = (float *)aligned_alloc(64, padded * sizeof(float));

    // Zero-initialize padding to avoid garbage in SIMD tail
    for (int i = n; i < padded; i++) {
        ps.x[i] = ps.y[i] = ps.z[i] = 0.0f;
        ps.vx[i] = ps.vy[i] = ps.vz[i] = 0.0f;
    }

    return ps;
}

void update_positions(ParticleSystem *ps, float dt) {
    int n = ps->count;
    __m256 vdt = _mm256_set1_ps(dt);

    for (int i = 0; i < n; i += 8) {
        // Aligned loads since arrays are 64-byte aligned
        __m256 px = _mm256_load_ps(&ps->x[i]);
        __m256 pvx = _mm256_load_ps(&ps->vx[i]);
        px = _mm256_fmadd_ps(pvx, vdt, px);  // x += vx * dt
        _mm256_store_ps(&ps->x[i], px);

        __m256 py = _mm256_load_ps(&ps->y[i]);
        __m256 pvy = _mm256_load_ps(&ps->vy[i]);
        py = _mm256_fmadd_ps(pvy, vdt, py);
        _mm256_store_ps(&ps->y[i], py);

        __m256 pz = _mm256_load_ps(&ps->z[i]);
        __m256 pvz = _mm256_load_ps(&ps->vz[i]);
        pz = _mm256_fmadd_ps(pvz, vdt, pz);
        _mm256_store_ps(&ps->z[i], pz);
    }
}
```

---

## 4. Branch Prediction Optimization

Modern CPUs predict branch outcomes to keep the pipeline full. A misprediction costs
**~15-20 cycles** as the pipeline must be flushed and refilled.

### 4.1 How Branch Prediction Works

```
Pipeline without prediction:

  Fetch -> Decode -> Execute -> Memory -> Writeback
  [if]     [???]    [wait...]

  The CPU cannot fetch the next instruction until
  the branch condition is evaluated in Execute stage.
  = Pipeline stall of ~4 stages

Pipeline with prediction:

  Fetch -> Decode -> Execute -> Memory -> Writeback
  [if]
  [predicted next] -> Decode -> Execute   (speculative)
  [next+1]         -> Decode              (speculative)
  [next+2]                                (speculative)

  If prediction is CORRECT: no penalty, full speed
  If prediction is WRONG:   flush pipeline, ~15-20 cycle penalty
```

**Branch predictor accuracy**:
- Simple loops: >99%
- Sorted data: >95%
- Random data: ~50% (worst case for 50/50 branches)

### 4.2 The Famous Sorted vs. Unsorted Branch Example

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

#define N 32768

int cmp_int(const void *a, const void *b) {
    return (*(int *)a - *(int *)b);
}

int main(void) {
    int data[N];
    srand(42);
    for (int i = 0; i < N; i++) {
        data[i] = rand() % 256;
    }

    // Test with unsorted data
    long sum = 0;
    struct timespec start, end;

    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int iter = 0; iter < 100000; iter++) {
        for (int i = 0; i < N; i++) {
            if (data[i] >= 128) {  // Branch: ~50% taken
                sum += data[i];
            }
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    double unsorted_time = (end.tv_sec - start.tv_sec) +
                           (end.tv_nsec - start.tv_nsec) / 1e9;

    // Now sort the data and repeat
    qsort(data, N, sizeof(int), cmp_int);

    sum = 0;
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int iter = 0; iter < 100000; iter++) {
        for (int i = 0; i < N; i++) {
            if (data[i] >= 128) {  // Branch: first half never taken, second half always taken
                sum += data[i];
            }
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    double sorted_time = (end.tv_sec - start.tv_sec) +
                         (end.tv_nsec - start.tv_nsec) / 1e9;

    printf("Unsorted: %.3f s\n", unsorted_time);
    printf("Sorted:   %.3f s\n", sorted_time);
    printf("Speedup:  %.2fx\n", unsorted_time / sorted_time);

    return 0;
}
```

**Typical results**:

| Data      | Time (s) | Branch Mispredict Rate |
|-----------|----------|------------------------|
| Unsorted  | 8.5      | ~25%                   |
| Sorted    | 2.1      | ~0.1%                  |

**~4x** speedup just from sorting.

### 4.3 Branchless Programming

Replace branches with arithmetic:

```c
// BRANCHY: conditional add
long sum_branchy(const int *data, int n) {
    long sum = 0;
    for (int i = 0; i < n; i++) {
        if (data[i] >= 128) {
            sum += data[i];
        }
    }
    return sum;
}

// BRANCHLESS: use arithmetic mask
long sum_branchless(const int *data, int n) {
    long sum = 0;
    for (int i = 0; i < n; i++) {
        // (data[i] >= 128) evaluates to 0 or 1
        // Multiply by 0 cancels the value, multiply by 1 keeps it
        sum += (data[i] >= 128) * data[i];

        // Alternative: bit manipulation
        // int mask = -(data[i] >= 128);  // 0 or 0xFFFFFFFF
        // sum += data[i] & mask;
    }
    return sum;
}
```

**CMOV -- Conditional Move**:

Compilers can generate `cmov` instructions that avoid branches entirely:

```c
// The compiler may generate CMOV for this:
int branchless_min(int a, int b) {
    return (a < b) ? a : b;
    // Generates: cmp eax, ebx; cmovl eax, ebx
    // No branch, no misprediction possible
}

// Branchless absolute value
int branchless_abs(int x) {
    int mask = x >> 31;       // All 0s if positive, all 1s if negative
    return (x ^ mask) - mask; // Flip bits and add 1 if negative
}

// Branchless clamp
int branchless_clamp(int x, int lo, int hi) {
    x = x < lo ? lo : x;  // cmov
    x = x > hi ? hi : x;  // cmov
    return x;
}
```

### 4.4 likely/unlikely Hints

When a branch IS necessary, tell the compiler which path is more common:

```c
// GCC/Clang built-in
#define likely(x)   __builtin_expect(!!(x), 1)
#define unlikely(x) __builtin_expect(!!(x), 0)

void process(int *data, int n) {
    for (int i = 0; i < n; i++) {
        if (unlikely(data[i] < 0)) {
            // Error handling path -- rarely taken
            handle_error(data[i]);
            continue;
        }
        // Hot path -- usually taken
        process_value(data[i]);
    }
}
```

```cpp
// C++20 has [[likely]] and [[unlikely]] attributes
void process_cpp20(int *data, int n) {
    for (int i = 0; i < n; i++) {
        if (data[i] < 0) [[unlikely]] {
            handle_error(data[i]);
        } else [[likely]] {
            process_value(data[i]);
        }
    }
}
```

The compiler uses these hints to:
1. Place the likely path as fall-through (no jump needed)
2. Move the unlikely path to a cold section of code
3. Optimize instruction cache usage

### 4.5 Profile-Guided Optimization (PGO)

PGO lets the compiler observe real branch behavior and optimize accordingly:

```bash
# Step 1: Build with instrumentation
gcc -O2 -fprofile-generate -o myapp_instrumented myapp.c

# Step 2: Run with representative workload (creates .gcda files)
./myapp_instrumented < typical_input.txt

# Step 3: Rebuild using collected profile data
gcc -O2 -fprofile-use -o myapp_optimized myapp.c
```

PGO typically provides a **10-20%** improvement by:
- Accurate branch prediction hints
- Optimal function layout (hot functions together)
- Better inlining decisions
- Loop unrolling tuned to actual iteration counts

---

## 5. Compiler Optimizations

### 5.1 Optimization Levels

```
  -O0       -O1         -O2          -O3          -Ofast
  |         |           |            |            |
  No opt    Basic       Standard     Aggressive   O3 + unsafe
  Debug     -fthread    Everything   + vectorize  -ffast-math
  Fast      -jumps      in O1 plus:  + unroll     (breaks IEEE
  compile   -defer-pop  -finline     + tree-      float rules)
            -fguess     -fcse        vectorize
            branch-prob -fschedule   -fpeel-loops
                        insns
                        -freorder-
                        blocks

  Speed:   1x          1.5-2x       2-3x         3-5x         3-6x
  Safety:  full        full         full         full         reduced*
```

`*` `-Ofast` includes `-ffast-math` which can change floating-point results.

**What `-ffast-math` does**:

```c
// With -ffast-math, the compiler assumes:
// 1. No NaN or Inf values
// 2. Floating-point operations are associative: (a+b)+c == a+(b+c)
// 3. x * 0.0 == 0.0 (not true if x is NaN)
// 4. Reciprocal is safe: a/b => a * (1/b)

// This ENABLES powerful optimizations:
for (int i = 0; i < n; i++) {
    sum += a[i];  // Without -ffast-math, must be sequential (not associative)
}
// With -ffast-math, compiler can use multiple accumulators and SIMD reduction
```

### 5.2 Loop Unrolling

The compiler can replicate loop bodies to reduce branch overhead:

```c
// Original loop:
for (int i = 0; i < n; i++) {
    sum += data[i];
}

// Unrolled by 4 (compiler does this at -O2/-O3):
int i = 0;
for (; i + 3 < n; i += 4) {
    sum += data[i];
    sum += data[i + 1];
    sum += data[i + 2];
    sum += data[i + 3];
}
for (; i < n; i++) {
    sum += data[i];
}
```

**Manual unrolling with multiple accumulators** (breaks dependency chain):

```c
// Even better: break the dependency chain
float sum_unrolled(const float *data, int n) {
    float sum0 = 0.0f, sum1 = 0.0f, sum2 = 0.0f, sum3 = 0.0f;
    int i = 0;

    for (; i + 3 < n; i += 4) {
        sum0 += data[i];      // Independent additions
        sum1 += data[i + 1];  // Can execute in parallel
        sum2 += data[i + 2];  // on superscalar CPUs
        sum3 += data[i + 3];
    }
    for (; i < n; i++) {
        sum0 += data[i];
    }

    return sum0 + sum1 + sum2 + sum3;
}
```

```
Dependency chain analysis:

Single accumulator (latency-bound):
  sum += data[0]  (3 cycle latency)
     \-> sum += data[1]  (must wait)
            \-> sum += data[2]  (must wait)
                   \-> sum += data[3]  (must wait)
  Total: 4 * 3 = 12 cycles for 4 elements

Four accumulators (throughput-bound):
  sum0 += data[0]   sum1 += data[1]   sum2 += data[2]   sum3 += data[3]
  (all independent, can execute simultaneously on different execution ports)
  Total: 3 cycles for 4 elements (4x speedup)
```

### 5.3 Function Inlining

```c
// Without inlining: function call overhead (~5 cycles)
static int square(int x) {
    return x * x;
}

for (int i = 0; i < n; i++) {
    result[i] = square(data[i]);  // call + return overhead per iteration
}

// With inlining (compiler replaces call with body):
for (int i = 0; i < n; i++) {
    result[i] = data[i] * data[i];  // No call overhead, enables further opts
}
```

**Force or suggest inlining**:

```c
// GCC/Clang: Suggest inlining
static inline int square(int x) { return x * x; }

// GCC: Force inlining (even at -O0)
__attribute__((always_inline)) static inline int square(int x) { return x * x; }

// Prevent inlining (useful for debugging or code size)
__attribute__((noinline)) void debug_func(void) { /* ... */ }
```

### 5.4 Link-Time Optimization (LTO)

Without LTO, the compiler optimizes each translation unit (`.c` file) independently.
With LTO, the compiler sees the **entire program** and can:
- Inline functions across files
- Remove dead code globally
- Optimize virtual call dispatch
- Propagate constants across modules

```bash
# Enable LTO
gcc -O2 -flto -o myapp file1.c file2.c file3.c

# Thin LTO (Clang) -- faster compilation, nearly same quality
clang -O2 -flto=thin -o myapp file1.c file2.c file3.c
```

**Benchmark** (medium-size project, ~50 .c files):

| Optimization  | Build Time | Runtime  | Binary Size |
|---------------|------------|----------|-------------|
| -O2           | 5 s        | 1.00x    | 240 KB      |
| -O2 -flto     | 8 s        | 0.88x    | 210 KB      |
| -O3 -flto     | 10 s       | 0.82x    | 260 KB      |

### 5.5 Checking What the Compiler Did

**Use Godbolt (compiler-explorer.com)** to see generated assembly.

```c
// Example: Does the compiler vectorize this?
void scale(float * restrict out, const float * restrict in, float factor, int n) {
    for (int i = 0; i < n; i++) {
        out[i] = in[i] * factor;
    }
}

// With -O3 -mavx2 -mfma, GCC generates:
//   vbroadcastss ymm0, xmm0      ; broadcast factor to all 8 lanes
//   .L3:
//   vmulps       ymm1, ymm0, [rdi+rax]  ; multiply 8 floats
//   vmovups      [rsi+rax], ymm1         ; store 8 floats
//   add          rax, 32
//   cmp          rax, rcx
//   jne          .L3
```

**Auto-vectorization reports**:

```bash
# GCC: Show what was and wasn't vectorized
gcc -O3 -march=native -fopt-info-vec-all source.c 2>&1

# Example output:
# source.c:10: optimized: loop vectorized using 32 byte vectors
# source.c:20: missed: not vectorized: unsupported data-ref
# source.c:30: missed: not vectorized: complex access pattern

# Clang: Detailed reports
clang -O3 -Rpass=loop-vectorize \
      -Rpass-missed=loop-vectorize \
      -Rpass-analysis=loop-vectorize source.c
```

### 5.6 Useful Compiler Flags Reference

```bash
# Performance flags (GCC/Clang):
-O2                     # Standard optimization
-O3                     # Aggressive (may increase code size)
-march=native           # Use all CPU features available
-mtune=native           # Tune for current CPU
-mavx2 -mfma            # Enable specific instruction sets
-funroll-loops          # Unroll loops more aggressively
-ffast-math             # Unsafe float opts (breaks IEEE)
-flto                   # Link-time optimization

# Diagnostic flags:
-fopt-info-vec          # Vectorization report (GCC)
-fsave-optimization-record  # Optimization record (Clang)
-S -fverbose-asm        # Generate commented assembly

# Security flags (keep in production):
-fstack-protector-strong  # Stack smashing detection
-D_FORTIFY_SOURCE=2       # Buffer overflow detection
-fPIE -pie                # Position-independent executable
```

---

## 6. Memory Prefetching

### 6.1 Hardware Prefetcher

Modern CPUs detect sequential and strided access patterns and prefetch cache lines automatically:

```
Hardware prefetcher behavior:

Sequential access (detected and prefetched automatically):
  Access: [line 0] [line 1] [line 2] [line 3] ...
  Prefetch:                                [line 4] [line 5]
                                           ^^^^^^ prefetched ahead

Strided access (detected for small strides):
  Access: [line 0]    [line 4]    [line 8]    [line 12]
  Stride = 4 lines
  Prefetch:                                    [line 16] [line 20]

Random access (NOT detected, hardware prefetcher gives up):
  Access: [line 7] [line 91] [line 3] [line 55] ...
  Prefetch: ???  (no pattern to detect)
```

The hardware prefetcher works well for:
- Array traversal (stride-1 or small fixed stride)
- Matrix operations with tiling
- Linked-list traversal with spatial locality

### 6.2 Software Prefetch Intrinsics

When the hardware prefetcher cannot predict the pattern, use software prefetch:

```c
#include <xmmintrin.h>  // for _mm_prefetch

// __builtin_prefetch(address, rw, locality)
//   rw: 0 = read, 1 = write
//   locality: 0 = non-temporal (don't cache), 1 = L3, 2 = L2, 3 = L1
//
// _mm_prefetch(address, hint)
//   _MM_HINT_T0  = prefetch to L1, L2, L3
//   _MM_HINT_T1  = prefetch to L2, L3
//   _MM_HINT_T2  = prefetch to L3
//   _MM_HINT_NTA = non-temporal (minimize cache pollution)

// Example: Hash table lookup with prefetching
struct Entry {
    uint64_t key;
    uint64_t value;
    // 16 bytes per entry
};

uint64_t lookup_batch(struct Entry *table, size_t table_size,
                      const uint64_t *keys, int n) {
    uint64_t sum = 0;
    const int PREFETCH_DIST = 8;  // Look ahead 8 iterations

    for (int i = 0; i < n; i++) {
        // Prefetch the entry we'll need PREFETCH_DIST iterations from now
        if (i + PREFETCH_DIST < n) {
            size_t future_idx = keys[i + PREFETCH_DIST] % table_size;
            __builtin_prefetch(&table[future_idx], 0, 1);
        }

        // Process current entry
        size_t idx = keys[i] % table_size;
        if (table[idx].key == keys[i]) {
            sum += table[idx].value;
        }
    }
    return sum;
}
```

```
Prefetch timing visualization:

Without prefetch:
  iter 0: [MISS ~100ns] process entry 0
  iter 1: [MISS ~100ns] process entry 1
  iter 2: [MISS ~100ns] process entry 2

With prefetch (distance = 3):
  iter 0: prefetch(entry 3), [MISS ~100ns] process entry 0
  iter 1: prefetch(entry 4), [MISS ~100ns] process entry 1
  iter 2: prefetch(entry 5), [MISS ~100ns] process entry 2
  iter 3: prefetch(entry 6), [HIT!  ~1ns] process entry 3  <- prefetched earlier
  iter 4: prefetch(entry 7), [HIT!  ~1ns] process entry 4
  ...

  The latency of the miss is hidden by overlapping it with computation.
```

### 6.3 Pointer-Chasing and Linked List Prefetch

```c
// Linked list traversal -- terrible for cache performance
struct Node {
    int value;
    struct Node *next;
};

// Simple traversal: one cache miss per node
long sum_list(struct Node *head) {
    long sum = 0;
    for (struct Node *p = head; p != NULL; p = p->next) {
        sum += p->value;
    }
    return sum;
}

// With prefetch: overlap misses with computation
long sum_list_prefetch(struct Node *head) {
    long sum = 0;
    struct Node *p = head;

    while (p != NULL) {
        // Prefetch the NEXT node while processing current
        if (p->next != NULL) {
            __builtin_prefetch(p->next, 0, 1);
        }
        sum += p->value;
        p = p->next;
    }
    return sum;
}

// Even better: double prefetch for longer chains
long sum_list_double_prefetch(struct Node *head) {
    long sum = 0;
    struct Node *p = head;
    // Get ahead by 2 nodes
    struct Node *ahead = (p && p->next) ? p->next->next : NULL;

    while (p != NULL) {
        if (ahead != NULL) {
            __builtin_prefetch(ahead, 0, 1);
            ahead = ahead->next;
        }
        sum += p->value;
        p = p->next;
    }
    return sum;
}
```

### 6.4 Non-Temporal Stores (Streaming Writes)

When writing data that will not be read again soon, use non-temporal stores to avoid
polluting the cache:

```c
#include <immintrin.h>

// Normal store: Read line into cache, modify, write back
// Non-temporal: Write directly to memory, bypass cache

void memset_nt(float *dest, float value, size_t n) {
    __m256 v = _mm256_set1_ps(value);
    size_t i = 0;

    for (; i + 7 < n; i += 8) {
        // _mm256_stream_ps: Non-temporal store, bypasses cache
        _mm256_stream_ps(&dest[i], v);
    }

    // Memory fence ensures all streaming stores are visible
    _mm_sfence();

    // Scalar remainder
    for (; i < n; i++) {
        dest[i] = value;
    }
}

// When to use non-temporal stores:
// - Writing large arrays that won't be read soon
// - Copy/init operations on data larger than cache
// - Avoid evicting useful data from cache
```

### 6.5 When NOT to Prefetch

Software prefetch can hurt performance:

```
Do NOT use software prefetch when:

1. Data fits in cache (already there)
   - Prefetch adds instruction overhead with no benefit

2. Hardware prefetcher already handles it
   - Sequential access is auto-detected
   - Adding manual prefetch creates redundant work

3. Prefetch distance is wrong
   - Too early: data evicted before use
   - Too late: data not arrived in time
   - Must be tuned per workload

4. Too many prefetches
   - Each prefetch consumes memory bandwidth
   - Can saturate memory subsystem
   - Rule of thumb: max 1 prefetch per ~100 instructions

5. Branchy code paths
   - Prefetching data for a path not taken wastes bandwidth
```

---

## 7. Lock-Free Programming

Lock-free data structures use atomic operations instead of mutexes, avoiding thread blocking
and priority inversion. They are essential in latency-critical systems (trading, audio, networking).

### 7.1 Atomic Operations

```c
#include <stdatomic.h>  // C11 atomics

// Basic atomic types
_Atomic int counter = 0;
// or: atomic_int counter = 0;

// Atomic operations
atomic_fetch_add(&counter, 1);    // counter++ (atomic)
atomic_fetch_sub(&counter, 1);    // counter-- (atomic)
atomic_store(&counter, 42);       // counter = 42 (atomic)
int val = atomic_load(&counter);  // val = counter (atomic)
```

```cpp
#include <atomic>  // C++ atomics

std::atomic<int> counter{0};

counter.fetch_add(1);              // Atomic increment
counter.fetch_sub(1);              // Atomic decrement
counter.store(42);                 // Atomic store
int val = counter.load();          // Atomic load
```

### 7.2 Memory Ordering

The CPU and compiler can **reorder** memory operations for performance. Memory ordering
controls what reorderings are allowed:

```
Memory ordering spectrum (weakest to strongest):

  relaxed          acquire          release          acq_rel          seq_cst
  |                |                |                |                |
  No ordering      Read barrier     Write barrier    Both barriers    Total order
  Fastest          Medium           Medium           Slower           Slowest

  Use when:        Use when:        Use when:        Use when:        Use when:
  Just need        Loading a        Storing a        Both load        You need
  atomicity        flag/lock        flag/lock        and store        everything
  (counter)        (consumer)       (producer)       (read-modify-    in order
                                                     write)           (default)
```

**Detailed explanation**:

```c
// RELAXED: No ordering guarantees, just atomicity
// Good for: counters, statistics
atomic_fetch_add_explicit(&counter, 1, memory_order_relaxed);

// ACQUIRE: No loads/stores can move BEFORE this load
// Good for: reading a flag that signals data is ready
int flag = atomic_load_explicit(&ready, memory_order_acquire);
// All subsequent reads see data written before the release store

// RELEASE: No loads/stores can move AFTER this store
// Good for: writing a flag that signals data is ready
atomic_store_explicit(&ready, 1, memory_order_release);
// All previous writes are visible to the thread that acquires

// SEQ_CST: Sequential consistency -- total global order
// Good for: when you need correctness and don't want to think hard
// Performance cost: full memory fence on x86 (mfence or lock instruction)
atomic_store_explicit(&x, 1, memory_order_seq_cst);
```

**Producer-consumer example**:

```c
#include <stdatomic.h>
#include <pthread.h>

_Atomic int ready = 0;
int data = 0;  // NOT atomic, protected by the ready flag

void *producer(void *arg) {
    data = 42;  // Write data FIRST

    // Release store: guarantees 'data = 42' is visible
    // to any thread that reads ready == 1 with acquire
    atomic_store_explicit(&ready, 1, memory_order_release);
    return NULL;
}

void *consumer(void *arg) {
    // Acquire load: if we see ready == 1, we are guaranteed
    // to see data == 42
    while (atomic_load_explicit(&ready, memory_order_acquire) == 0) {
        // Spin-wait (in practice, use _mm_pause() or sched_yield())
    }

    // Safe to read data here
    assert(data == 42);  // GUARANTEED to succeed
    return NULL;
}
```

```
Memory ordering visualization:

Thread 1 (Producer)        Thread 2 (Consumer)
--------------------       --------------------
data = 42          |
    |              |
    v              |
ready = 1 [RELEASE] -----> ready? [ACQUIRE]
                            |
                            v
                            read data  (sees 42, guaranteed)

The release-acquire pair creates a "happens-before" relationship:
Everything before the release store is visible after the acquire load.
```

### 7.3 Compare-And-Swap (CAS)

CAS is the fundamental building block of lock-free algorithms:

```c
// CAS: if *ptr == expected, set *ptr = desired and return true
//       otherwise, set expected = *ptr and return false

// C11
_Atomic int value = 0;
int expected = 0;
int desired = 1;
bool success = atomic_compare_exchange_strong(&value, &expected, desired);

// C++
std::atomic<int> value{0};
int expected = 0;
bool success = value.compare_exchange_strong(expected, 1);
// If value was 0: value is now 1, returns true
// If value was not 0: expected is updated to current value, returns false
```

**Lock-free stack using CAS**:

```c
#include <stdatomic.h>
#include <stdlib.h>
#include <stdbool.h>

typedef struct Node {
    int data;
    struct Node *next;
} Node;

typedef struct {
    _Atomic(Node *) head;
} LockFreeStack;

void stack_init(LockFreeStack *s) {
    atomic_store(&s->head, NULL);
}

void stack_push(LockFreeStack *s, int value) {
    Node *new_node = (Node *)malloc(sizeof(Node));
    new_node->data = value;

    Node *old_head = atomic_load_explicit(&s->head, memory_order_relaxed);
    do {
        new_node->next = old_head;
        // Try to swing head from old_head to new_node
        // If another thread changed head, old_head is updated and we retry
    } while (!atomic_compare_exchange_weak_explicit(
        &s->head, &old_head, new_node,
        memory_order_release,   // success: release (publish new_node)
        memory_order_relaxed    // failure: relaxed (just retry)
    ));
}

bool stack_pop(LockFreeStack *s, int *result) {
    Node *old_head = atomic_load_explicit(&s->head, memory_order_acquire);
    do {
        if (old_head == NULL) {
            return false;  // Stack is empty
        }
        // Try to swing head from old_head to old_head->next
    } while (!atomic_compare_exchange_weak_explicit(
        &s->head, &old_head, old_head->next,
        memory_order_acquire,
        memory_order_relaxed
    ));

    *result = old_head->data;
    free(old_head);  // WARNING: ABA problem! See note below.
    return true;
}
```

```
CAS-based push visualization:

Initial:  head -> [A] -> [B] -> NULL

Thread 1: push(C)              Thread 2: push(D)
new_node = [C]                 new_node = [D]
old_head = [A]                 old_head = [A]
[C]->next = [A]                [D]->next = [A]

CAS(head, [A], [C])           CAS(head, [A], [D])
   |                              |
   v (succeeds first)             v (fails, old_head = [C])
head -> [C] -> [A] -> [B]     [D]->next = [C]
                                CAS(head, [C], [D])  (retry, succeeds)
                                head -> [D] -> [C] -> [A] -> [B]
```

### 7.4 Lock-Free Single-Producer Single-Consumer Queue

```c
#include <stdatomic.h>
#include <stdbool.h>
#include <string.h>

#define QUEUE_SIZE 1024  // Must be power of 2

typedef struct {
    int buffer[QUEUE_SIZE];

    // Pad to separate cache lines (avoid false sharing)
    alignas(64) _Atomic size_t head;  // Written by consumer
    alignas(64) _Atomic size_t tail;  // Written by producer
} SPSCQueue;

void spsc_init(SPSCQueue *q) {
    memset(q->buffer, 0, sizeof(q->buffer));
    atomic_store(&q->head, 0);
    atomic_store(&q->tail, 0);
}

bool spsc_push(SPSCQueue *q, int value) {
    size_t tail = atomic_load_explicit(&q->tail, memory_order_relaxed);
    size_t next_tail = (tail + 1) & (QUEUE_SIZE - 1);

    // Check if full
    if (next_tail == atomic_load_explicit(&q->head, memory_order_acquire)) {
        return false;  // Queue is full
    }

    q->buffer[tail] = value;

    // Release store: ensures buffer write is visible before tail update
    atomic_store_explicit(&q->tail, next_tail, memory_order_release);
    return true;
}

bool spsc_pop(SPSCQueue *q, int *value) {
    size_t head = atomic_load_explicit(&q->head, memory_order_relaxed);

    // Check if empty
    if (head == atomic_load_explicit(&q->tail, memory_order_acquire)) {
        return false;  // Queue is empty
    }

    *value = q->buffer[head];
    size_t next_head = (head + 1) & (QUEUE_SIZE - 1);

    // Release store: ensures buffer read completes before head update
    atomic_store_explicit(&q->head, next_head, memory_order_release);
    return true;
}
```

```
SPSC Ring Buffer layout:

  buffer[QUEUE_SIZE]:
  +---+---+---+---+---+---+---+---+---+---+
  |   | D | E | F |   |   |   |   | A | B |
  +---+---+---+---+---+---+---+---+---+---+
        ^               ^               ^
        tail            (empty)         head

  Producer writes at tail, advances tail
  Consumer reads at head, advances head
  When head == tail: empty
  When (tail+1) % SIZE == head: full

  No locks needed! Only one thread writes each index.
```

### 7.5 The ABA Problem

```
ABA problem in lock-free pop:

1. Thread 1: reads head = A, prepares to CAS(head, A, B)
2. Thread 1: gets preempted
3. Thread 2: pops A, pops B, pushes A back (with A at different address or recycled)
4. Thread 1: resumes, CAS(head, A, A) succeeds
   BUT the stack has changed! B might be freed/corrupted.

Solution: Tagged pointers
  Combine pointer with a version counter.
  CAS on the combined (pointer + version) value.
  Even if pointer is the same, version will differ.
```

```c
#include <stdatomic.h>
#include <stdint.h>

// Tagged pointer: upper 16 bits = tag, lower 48 bits = pointer
// (x86_64 only uses 48 bits for virtual addresses)
typedef struct {
    _Atomic uint64_t tagged_ptr;
} TaggedPointer;

static inline uint64_t make_tagged(void *ptr, uint16_t tag) {
    return ((uint64_t)tag << 48) | ((uint64_t)ptr & 0xFFFFFFFFFFFFULL);
}

static inline void *get_ptr(uint64_t tagged) {
    // Sign-extend bit 47 for canonical addresses
    uint64_t addr = tagged & 0xFFFFFFFFFFFFULL;
    if (addr & (1ULL << 47)) {
        addr |= 0xFFFF000000000000ULL;
    }
    return (void *)addr;
}

static inline uint16_t get_tag(uint64_t tagged) {
    return (uint16_t)(tagged >> 48);
}

// CAS now compares both pointer AND tag
// Even if pointer matches, tag will differ (ABA detected)
```

---

## 8. NUMA Awareness

### 8.1 What is NUMA?

**NUMA** (Non-Uniform Memory Access) means different memory regions have different access
latencies depending on which CPU socket they are closest to.

```
Dual-Socket NUMA System:

  Socket 0                          Socket 1
  +---------+                       +---------+
  | Core 0  |                       | Core 8  |
  | Core 1  |                       | Core 9  |
  | ...     |                       | ...     |
  | Core 7  |                       | Core 15 |
  +---------+                       +---------+
       |                                 |
  +---------+                       +---------+
  | Memory  |<---- QPI/UPI Link --->| Memory  |
  | Node 0  |      (~40 ns extra)   | Node 1  |
  | (64 GB) |                       | (64 GB) |
  +---------+                       +---------+

  Core 0 accessing Node 0 memory: ~80 ns  (local)
  Core 0 accessing Node 1 memory: ~120 ns (remote, +50%)
```

### 8.2 Checking NUMA Topology

```bash
# Show NUMA topology
numactl --hardware

# Example output:
# available: 2 nodes (0-1)
# node 0 cpus: 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
# node 0 size: 65536 MB
# node 0 free: 32000 MB
# node 1 cpus: 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
# node 1 size: 65536 MB
# node 1 free: 48000 MB
# node distances:
# node   0   1
#   0:  10  21
#   1:  21  10
# ^^^ distance 21 = ~2x latency for remote access

# Show detailed topology
lstopo  # (from hwloc package)

# Check which NUMA node a process is on
numactl --show
```

### 8.3 Controlling NUMA Placement

```bash
# Run process on specific NUMA node (CPU + memory)
numactl --cpunodebind=0 --membind=0 ./myapp

# Interleave memory across all nodes (good for shared data)
numactl --interleave=all ./myapp

# Preferred node (allows fallback to other nodes)
numactl --preferred=0 ./myapp
```

### 8.4 NUMA-Aware Programming

**First-touch policy**: Memory is allocated on the NUMA node of the thread that first
writes to it, not when `malloc` is called.

```c
#define _GNU_SOURCE
#include <sched.h>
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <numa.h>      // Link with -lnuma
#include <numaif.h>

#define N 100000000  // 100M elements

// BAD: Single thread initializes everything -- all on one NUMA node
void bad_init(float *data) {
    for (int i = 0; i < N; i++) {
        data[i] = 0.0f;  // First touch by main thread
    }
    // All memory is on main thread's NUMA node
    // Other threads accessing this data pay remote penalty
}

// GOOD: Each thread initializes its own portion (first-touch)
typedef struct {
    float *data;
    int start;
    int end;
    int numa_node;
} ThreadWork;

void *init_worker(void *arg) {
    ThreadWork *work = (ThreadWork *)arg;

    // Bind this thread to specific NUMA node
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    // Use a CPU on the target NUMA node
    struct bitmask *cpumask = numa_allocate_cpumask();
    numa_node_to_cpus(work->numa_node, cpumask);
    // Set affinity to first available CPU on this node
    for (int i = 0; i < numa_num_possible_cpus(); i++) {
        if (numa_bitmask_isbitset(cpumask, i)) {
            CPU_SET(i, &cpuset);
            break;
        }
    }
    numa_free_cpumask(cpumask);
    pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);

    // First-touch: this memory will be local to this NUMA node
    for (int i = work->start; i < work->end; i++) {
        work->data[i] = 0.0f;
    }

    return NULL;
}

void good_init(float *data, int num_nodes) {
    pthread_t threads[num_nodes];
    ThreadWork work[num_nodes];
    int chunk = N / num_nodes;

    for (int i = 0; i < num_nodes; i++) {
        work[i].data = data;
        work[i].start = i * chunk;
        work[i].end = (i == num_nodes - 1) ? N : (i + 1) * chunk;
        work[i].numa_node = i;
        pthread_create(&threads[i], NULL, init_worker, &work[i]);
    }

    for (int i = 0; i < num_nodes; i++) {
        pthread_join(threads[i], NULL);
    }
}
```

### 8.5 NUMA-Aware Memory Allocation

```c
#include <numa.h>

// Allocate on specific NUMA node
void *data = numa_alloc_onnode(size, node_id);

// Allocate interleaved across all nodes
void *data = numa_alloc_interleaved(size);

// Allocate local to current thread
void *data = numa_alloc_local(size);

// Move existing pages to a different node
unsigned long nodemask = 1UL << target_node;
mbind(data, size, MPOL_BIND, &nodemask, max_nodes, MPOL_MF_MOVE);

// Check where pages actually reside
int actual_node;
get_mempolicy(&actual_node, NULL, 0, data, MPOL_F_NODE | MPOL_F_ADDR);
printf("Data is on NUMA node %d\n", actual_node);
```

### 8.6 Thread Affinity

Pin threads to specific cores to ensure NUMA-local access:

```c
#define _GNU_SOURCE
#include <pthread.h>
#include <sched.h>

void pin_to_core(int core_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(core_id, &cpuset);

    int ret = pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);
    if (ret != 0) {
        perror("pthread_setaffinity_np");
    }
}

// Pin to a set of cores (e.g., all cores on NUMA node 0)
void pin_to_numa_node(int node) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);

    // Get CPUs on this NUMA node
    struct bitmask *mask = numa_allocate_cpumask();
    numa_node_to_cpus(node, mask);

    for (int i = 0; i < numa_num_possible_cpus(); i++) {
        if (numa_bitmask_isbitset(mask, i)) {
            CPU_SET(i, &cpuset);
        }
    }
    numa_free_cpumask(mask);

    pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);
}
```

**Benchmark -- NUMA local vs remote access** (dual-socket system):

| Access Pattern     | Bandwidth (GB/s) | Latency (ns) |
|--------------------|-------------------|---------------|
| Local memory       | 45                | 80            |
| Remote memory      | 22                | 130           |
| Interleaved        | 60 (aggregate)   | 105 (avg)     |

Remote memory access is **~2x** slower in bandwidth and **~1.6x** higher latency.

---

## 9. Practical Optimization Workflow

### 9.1 The Golden Rule

> **"Premature optimization is the root of all evil"** -- Donald Knuth
>
> But also: **"We should not pass up opportunities in the critical 3%"**

The workflow:

```
1. Write correct, clean code first
       |
       v
2. MEASURE performance (don't guess!)
       |
       v
3. PROFILE to find the bottleneck
       |
       v
4. Optimize ONLY the bottleneck
       |
       v
5. Re-MEASURE to verify improvement
       |
       v
6. Go to step 2 if needed
```

### 9.2 Profiling with perf (Linux)

`perf` is the standard Linux profiling tool:

```bash
# Record a profile (sampling every 10ms by default)
perf record -g ./myapp

# View the profile
perf report

# Quick stats (IPC, cache misses, branch mispredicts)
perf stat ./myapp

# Example output:
# Performance counter stats for './myapp':
#
#     12,345.67 msec  task-clock
#      3,456,789,012  instructions   #  2.31 IPC
#      1,496,012,345  cycles
#        123,456,789  cache-misses   #  3.21% of all cache refs
#         45,678,901  branch-misses  #  1.23% of all branches
#
# 12.345 seconds time elapsed

# Detailed cache analysis
perf stat -e cache-references,cache-misses,\
  L1-dcache-loads,L1-dcache-load-misses,\
  LLC-loads,LLC-load-misses \
  ./myapp

# Record specific events
perf record -e cache-misses -c 1000 -g ./myapp

# Annotate source code with performance data
perf annotate -s my_function
```

**Reading perf output**:

```
Target metrics:

  IPC (Instructions Per Cycle):
    < 1.0: Memory-bound or branch-bound
    1.0 - 2.0: Reasonable
    > 2.0: Good utilization
    > 3.0: Excellent (rare)

  L1 cache miss rate:
    < 1%: Excellent
    1-5%: Acceptable
    > 5%: Investigate access patterns

  Branch misprediction rate:
    < 1%: Excellent
    1-5%: Acceptable
    > 5%: Consider branchless code

  LLC (Last Level Cache) miss rate:
    < 1%: Working set fits in cache
    > 5%: Memory-bound, consider tiling/prefetching
```

### 9.3 Profiling with Cachegrind (Valgrind)

Cachegrind simulates the cache hierarchy and counts every hit/miss:

```bash
# Run under cachegrind
valgrind --tool=cachegrind ./myapp

# View results
cg_annotate cachegrind.out.<pid>

# Example annotated output:
#        Ir   I1mr   ILmr         Dr     D1mr     DLmr
# 1,234,567      0      0    456,789   12,345      567  for (i=0; i<n; i++)
# 1,234,567      0      0    456,789      123       45    sum += a[i][j];
#                                          ^^^            L1 data cache misses
```

**Key metrics**:
- `Dr` = Data reads
- `D1mr` = L1 data cache read misses
- `DLmr` = Last-level cache read misses
- `Dw` = Data writes
- `D1mw` = L1 data cache write misses

### 9.4 Intel VTune Profiler

VTune provides the most detailed CPU analysis:

```bash
# Hotspot analysis (find slow functions)
vtune -collect hotspots ./myapp

# Microarchitecture analysis (find pipeline bottlenecks)
vtune -collect uarch-exploration ./myapp

# Memory access analysis
vtune -collect memory-access ./myapp

# Threading analysis (find lock contention)
vtune -collect threading ./myapp

# View results in GUI
vtune-gui result_dir/
```

VTune classifies bottlenecks into:

```
Top-Down Microarchitecture Analysis:

  Pipeline Slots
       |
  +----+----+
  |         |
Retiring  Not Retiring
(good!)        |
          +----+----+
          |         |
     Front-End   Back-End
     Bound       Bound
     (decode)    (execution)
          |         |
     +----+----+  +----+----+
     |         |  |         |
  Latency  Bandwidth  Core    Memory
  (cache   (fetch     Bound   Bound
  misses)  width)
```

### 9.5 Quick Diagnostic Checklist

```
Symptom                    -> Likely Cause              -> Fix
--------------------------------------------------------------------
Low IPC (<1.0)             -> Memory-bound              -> Cache tiling,
                                                           prefetch, SoA

High L1 miss rate (>5%)    -> Bad access pattern         -> Row-major order,
                                                           loop tiling

High branch miss rate      -> Unpredictable branches     -> Branchless code,
(>5%)                                                      sorting, PGO

High LLC miss rate         -> Working set too large      -> Tiling, streaming
                                                           stores, reduce data

Low vectorization          -> Scalar code in hot loop    -> SIMD intrinsics,
                                                           auto-vectorization

High lock contention       -> Over-synchronization       -> Lock-free, reduce
                                                           critical section

NUMA remote access         -> Memory not local           -> First-touch init,
                                                           thread pinning
```

### 9.6 Complete Optimization Example

Let us optimize a real function step by step.

**Original -- naive particle distance computation**:

```c
// Version 0: Naive implementation
struct Particle {
    float x, y, z;
    float vx, vy, vz;
    float mass;
    int type;
};

// Find all pairs within distance 'radius'
int count_neighbors_v0(struct Particle *particles, int n, float radius) {
    int count = 0;
    float r2 = radius * radius;

    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            float dx = particles[i].x - particles[j].x;
            float dy = particles[i].y - particles[j].y;
            float dz = particles[i].z - particles[j].z;
            float dist2 = dx * dx + dy * dy + dz * dz;
            if (dist2 < r2) {
                count++;
            }
        }
    }
    return count;
}
```

**Step 1: Profile and identify bottleneck**

```bash
$ perf stat ./particle_v0
# IPC: 0.8  (memory-bound)
# L1 miss rate: 12% (bad access pattern)
# Branch miss rate: 8% (unpredictable distance comparison)
```

**Step 2: Switch to SoA layout**

```c
// Version 1: SoA layout (fix cache issue)
struct ParticlesSoA {
    float *x, *y, *z;
    float *vx, *vy, *vz;
    float *mass;
    int *type;
    int n;
};

int count_neighbors_v1(struct ParticlesSoA *p, float radius) {
    int count = 0;
    float r2 = radius * radius;
    int n = p->n;

    for (int i = 0; i < n; i++) {
        float xi = p->x[i], yi = p->y[i], zi = p->z[i];
        for (int j = i + 1; j < n; j++) {
            float dx = xi - p->x[j];
            float dy = yi - p->y[j];
            float dz = zi - p->z[j];
            float dist2 = dx * dx + dy * dy + dz * dz;
            if (dist2 < r2) {
                count++;
            }
        }
    }
    return count;
}
// perf stat: IPC 1.4 (better!), L1 miss rate 2% (fixed!)
// But branch miss rate still 8%
```

**Step 3: Branchless inner loop**

```c
// Version 2: Branchless distance comparison
int count_neighbors_v2(struct ParticlesSoA *p, float radius) {
    int count = 0;
    float r2 = radius * radius;
    int n = p->n;

    for (int i = 0; i < n; i++) {
        float xi = p->x[i], yi = p->y[i], zi = p->z[i];
        for (int j = i + 1; j < n; j++) {
            float dx = xi - p->x[j];
            float dy = yi - p->y[j];
            float dz = zi - p->z[j];
            float dist2 = dx * dx + dy * dy + dz * dz;
            count += (dist2 < r2);  // Branchless: 0 or 1
        }
    }
    return count;
}
// perf stat: IPC 2.1, branch miss rate 0.1% (fixed!)
```

**Step 4: SIMD vectorization**

```c
// Version 3: AVX2 SIMD
#include <immintrin.h>

int count_neighbors_v3(struct ParticlesSoA *p, float radius) {
    __m256 vr2 = _mm256_set1_ps(radius * radius);
    int total = 0;
    int n = p->n;

    for (int i = 0; i < n; i++) {
        __m256 vxi = _mm256_set1_ps(p->x[i]);
        __m256 vyi = _mm256_set1_ps(p->y[i]);
        __m256 vzi = _mm256_set1_ps(p->z[i]);
        __m256i vcount = _mm256_setzero_si256();

        int j = i + 1;
        for (; j + 7 < n; j += 8) {
            __m256 dx = _mm256_sub_ps(vxi, _mm256_loadu_ps(&p->x[j]));
            __m256 dy = _mm256_sub_ps(vyi, _mm256_loadu_ps(&p->y[j]));
            __m256 dz = _mm256_sub_ps(vzi, _mm256_loadu_ps(&p->z[j]));

            __m256 dist2 = _mm256_fmadd_ps(dx, dx,
                           _mm256_fmadd_ps(dy, dy,
                           _mm256_mul_ps(dz, dz)));

            // Compare: result is 0xFFFFFFFF (-1 as int) or 0
            __m256 mask = _mm256_cmp_ps(dist2, vr2, _CMP_LT_OQ);
            // Subtract -1 (i.e., add 1 for each match)
            vcount = _mm256_sub_epi32(vcount, _mm256_castps_si256(mask));
        }

        // Horizontal sum of vcount
        __m128i lo = _mm256_castsi256_si128(vcount);
        __m128i hi = _mm256_extracti128_si256(vcount, 1);
        __m128i sum128 = _mm_add_epi32(lo, hi);
        sum128 = _mm_add_epi32(sum128, _mm_shuffle_epi32(sum128, 0x4E));
        sum128 = _mm_add_epi32(sum128, _mm_shuffle_epi32(sum128, 0xB1));
        total += _mm_cvtsi128_si32(sum128);

        // Scalar remainder
        for (; j < n; j++) {
            float dx = p->x[i] - p->x[j];
            float dy = p->y[i] - p->y[j];
            float dz = p->z[i] - p->z[j];
            float dist2 = dx * dx + dy * dy + dz * dz;
            total += (dist2 < radius * radius);
        }
    }
    return total;
}
```

**Final benchmark** (N=10,000 particles):

| Version | Description              | Time (ms) | Speedup |
|---------|--------------------------|-----------|---------|
| v0      | Naive AoS                | 850       | 1.0x    |
| v1      | SoA layout               | 320       | 2.7x    |
| v2      | + Branchless             | 210       | 4.0x    |
| v3      | + AVX2 SIMD              | 35        | 24.3x   |

**24x** total speedup from systematic optimization.

### 9.7 Profiling Tools Summary

| Tool       | Platform | Overhead | Detail Level | Cost  |
|------------|----------|----------|--------------|-------|
| `perf`     | Linux    | Low      | Hardware PMU | Free  |
| `VTune`    | Lin/Win  | Low      | Very High    | Free* |
| `cachegrind`| Linux   | High     | Cache sim    | Free  |
| `gprof`    | Linux    | Medium   | Function-level| Free |
| `Instruments`| macOS  | Low      | High         | Free  |
| `Tracy`    | Any      | Very Low | Frame-level  | Free  |
| `AMD uProf`| Linux   | Low      | High         | Free  |

`*` Intel VTune is free for all users (previously commercial).

---

## Practice Exercises

### Exercise 1: Cache Performance
Write two versions of a function that computes the sum of all elements in a 1000x1000 matrix:
one traversing row-major, one traversing column-major. Measure the time difference and use
`perf stat` to compare L1 cache miss rates. Explain the results.

### Exercise 2: SIMD Dot Product
Implement a dot product of two `float` arrays using:
a) Scalar code
b) SSE intrinsics (4-wide)
c) AVX intrinsics (8-wide)
d) AVX + FMA (`_mm256_fmadd_ps`)
Benchmark all four with N=10,000,000. Verify they produce the same results (within
floating-point tolerance).

### Exercise 3: False Sharing Detection
Write a program where 4 threads increment adjacent counters in a shared array. Use `perf`
to measure cache-line transfers. Then add padding and remeasure. Calculate the theoretical
vs. actual speedup.

### Exercise 4: Branchless Min/Max
Implement a function that finds the minimum of an array without using any branches
(no `if`, no ternary that compiles to a branch). Verify with `objdump -d` that no branch
instructions are generated. Compare performance against `if`-based version with random data.

### Exercise 5: Loop Tiling
Implement matrix multiplication with and without loop tiling. Experiment with tile sizes
(16, 32, 64, 128) and plot performance vs. tile size. Determine the optimal tile size for
your L1 cache and explain why.

### Exercise 6: Memory Alignment
Write a benchmark that compares:
a) Aligned loads (`_mm256_load_ps` with 32-byte aligned data)
b) Unaligned loads (`_mm256_loadu_ps` with deliberately misaligned data)
c) Loads crossing a cache line boundary
d) Loads crossing a page boundary
Measure throughput for each case.

### Exercise 7: Lock-Free Stack
Implement a lock-free stack using CAS. Test it with multiple producer and consumer threads.
Compare throughput against a mutex-based stack. Measure with 1, 2, 4, and 8 threads.

### Exercise 8: NUMA Optimization
On a multi-socket system (or using `numactl --hardware` to simulate):
a) Allocate a large array and initialize it from one thread
b) Access it from threads on a different NUMA node
c) Compare against NUMA-aware initialization (first-touch)
d) Measure the bandwidth difference

### Exercise 9: Complete Optimization Pipeline
Take this function and optimize it step by step, measuring after each change:

```c
struct Record {
    char name[64];
    double value;
    int category;
    char description[256];
};

double sum_category(struct Record *records, int n, int target_cat) {
    double sum = 0.0;
    for (int i = 0; i < n; i++) {
        if (records[i].category == target_cat) {
            sum += records[i].value;
        }
    }
    return sum;
}
```

Apply: SoA conversion, branchless techniques, SIMD, and prefetching. Document each step's
improvement with measurements.

### Exercise 10: PGO Comparison
Take a non-trivial program (e.g., a JSON parser, compression utility, or sorting algorithm).
Build it with `-O2`, then with `-O2 -fprofile-generate` / `-fprofile-use`. Measure the
speedup from PGO. Identify which optimizations PGO enabled using `-fopt-info`.

---

## Interview Questions

### Beginner Level

**Q1: What is a cache line, and why does it matter for performance?**

A cache line is the minimum unit of data transfer between cache levels (typically 64 bytes on x86). When you read a single byte, the CPU loads the entire 64-byte cache line. This matters because accessing data near recently accessed data (spatial locality) is essentially free since it is already in the cache line. Poor access patterns that skip around memory waste cache bandwidth by loading data that is never used.

**Q2: Why is iterating over a 2D array in column-major order slow in C?**

C stores arrays in row-major order, meaning elements in the same row are contiguous in memory. Column-major traversal accesses elements that are separated by an entire row width in memory, causing a cache miss for nearly every access when the array is large. Each access loads a 64-byte cache line, but only 4 bytes (one `int`) are used before jumping to the next row.

**Q3: What is SIMD and how does it improve performance?**

SIMD (Single Instruction, Multiple Data) processes multiple data elements with a single CPU instruction. For example, AVX can add 8 floats in one instruction instead of doing 8 separate scalar additions. This provides up to 8x throughput improvement for data-parallel operations. On x86, the main SIMD instruction sets are SSE (128-bit), AVX/AVX2 (256-bit), and AVX-512 (512-bit).

**Q4: What is false sharing and how do you prevent it?**

False sharing occurs when two threads write to different variables that share the same cache line. The cache coherence protocol forces the line to bounce between cores on every write, causing severe performance degradation. Prevent it by padding data structures so each thread's data occupies its own cache line (align to 64 bytes). In C++17, use `alignas(std::hardware_destructive_interference_size)`.

### Intermediate Level

**Q5: Explain the difference between `memory_order_acquire` and `memory_order_release` in C++ atomics.**

`memory_order_release` on a store ensures that all prior writes by this thread are visible to any other thread that performs an `acquire` load of the same variable and sees the stored value. `memory_order_acquire` on a load ensures that subsequent reads by this thread see all writes that happened before the matching `release` store. Together they form a "synchronizes-with" relationship that establishes a happens-before ordering between threads without using a full sequential consistency fence.

**Q6: How does loop tiling improve matrix multiplication performance?**

Naive matrix multiplication has poor locality for one of the input matrices (column access of B). Loop tiling partitions the computation into small blocks that fit in L1 cache. When a tile of B is loaded, it is reused many times before being evicted, dramatically reducing cache misses. The optimal tile size is chosen so that tiles of A, B, and C together fit in L1 cache (typically 32-64 for single-precision floats with a 32KB L1d cache).

**Q7: What is the ABA problem in lock-free programming?**

The ABA problem occurs with CAS-based algorithms when a value changes from A to B and back to A. A thread reads A, gets preempted, another thread changes the value to B then back to A. The first thread's CAS succeeds because it sees A, but the data structure may have changed in ways that make the operation incorrect. Solutions include tagged pointers (combining a version counter with the pointer), hazard pointers, or epoch-based reclamation.

**Q8: When would you use `-Ofast` instead of `-O3`?**

`-Ofast` adds `-ffast-math` on top of `-O3`, which breaks strict IEEE 754 floating-point compliance. Use it when you need maximum performance and can tolerate slightly different floating-point results (no NaN checks needed, associative reordering of FP operations is acceptable). Common use cases: scientific simulations where small FP differences are within error tolerance, game physics, audio processing. Never use it in financial calculations, safety-critical code, or when exact FP reproducibility is required.

### Advanced Level

**Q9: Describe a complete workflow for optimizing a CPU-bound application from initial profiling to final verification.**

1. Establish a baseline: measure execution time with representative input, recording multiple runs for statistical significance.
2. Profile with `perf stat` to get high-level metrics: IPC, cache miss rates, branch misprediction rates. This identifies the class of bottleneck (memory-bound vs. compute-bound vs. branch-bound).
3. Use `perf record` + `perf report` to find the hottest functions.
4. Annotate the hot functions with `perf annotate` to find the specific hot instructions.
5. Based on the bottleneck class:
   - Memory-bound: improve data layout (SoA), add tiling, use prefetching
   - Compute-bound: use SIMD, reduce instruction count, use FMA
   - Branch-bound: use branchless techniques, sort data, use PGO
6. Apply ONE optimization at a time. Re-measure after each change.
7. Verify correctness after each change (compare outputs).
8. Stop when you reach the theoretical hardware limit (memory bandwidth, FLOP/s).

**Q10: You have a hash table with 100M entries. Random lookups are slow. Walk through your optimization strategy.**

First, `perf stat` will likely show high LLC miss rates since random access defeats the prefetcher. Strategy:
1. Batch lookups and use software prefetching: prefetch the next N entries while processing current ones. Typical prefetch distance is 8-16 entries to hide DRAM latency.
2. Use a cache-friendly hash table design: open addressing with linear probing keeps related entries on the same cache line. Separate chaining scatters nodes across memory.
3. Minimize entry size: store only the hash and key/value (no pointers to next entry). Smaller entries = more entries per cache line.
4. Consider a two-level design: a small "hot" hash table that fits in L2/L3 for frequently accessed keys, backed by the full table for cold keys.
5. On NUMA systems, replicate the hash table on each NUMA node to ensure local access.
6. Use hugepages (2MB or 1GB pages) to reduce TLB misses, which are significant for large random-access data structures.

**Q11: Explain why multiple accumulators in a reduction loop improves performance, even though it does the same total work.**

Modern CPUs are superscalar: they can execute multiple independent instructions per cycle. A single-accumulator reduction like `sum += a[i]` creates a loop-carried dependency: each addition must wait for the previous one to complete (3-5 cycle latency for FP add). The CPU can fetch and decode subsequent iterations, but the addition cannot execute until the prior one finishes, leaving execution ports idle. With 4 accumulators (`sum0 += a[i]; sum1 += a[i+1]; ...`), each addition is independent of the others, allowing the CPU to execute up to 4 additions per cycle (throughput of 1 per cycle per port). This converts a latency-bound loop to a throughput-bound loop, typically yielding a 3-4x speedup for floating-point reductions.

**Q12: A colleague proposes using `volatile` instead of atomics for a shared flag between threads. Explain why this is incorrect.**

`volatile` only prevents the compiler from optimizing away or reordering reads/writes to the variable. It does NOT prevent CPU reordering (no memory fences), does NOT guarantee atomic access (a 64-bit write might tear on some platforms), and does NOT establish happens-before relationships between threads. On x86, stores have release semantics and loads have acquire semantics by default (TSO), so `volatile` might appear to work, but this is not portable and the compiler may still reorder non-volatile accesses around the volatile access. Use `std::atomic` with appropriate memory ordering: it provides both atomicity and the necessary memory ordering guarantees.

**Q13: You are writing a high-frequency trading system. The hot path processes market data messages. What CPU optimizations are most critical?**

In HFT, latency matters more than throughput:
1. **Cache warming**: Pre-touch all data structures during initialization so they are in L1/L2 when a message arrives. Pin the hot path thread to a dedicated core with CPU isolation (`isolcpus`).
2. **Lock-free messaging**: Use SPSC lock-free queues between threads. No system calls on the hot path.
3. **Branch elimination**: Profile the hot path and eliminate all unpredictable branches. Use branchless comparisons and lookup tables.
4. **NUMA pinning**: Ensure the NIC, its memory buffers, and the processing thread are all on the same NUMA node. Use `numactl` or `set_mempolicy`.
5. **Huge pages**: Map all hot data with 2MB or 1GB huge pages to eliminate TLB misses.
6. **Kernel bypass**: Use DPDK or Solarflare OpenOnload to avoid kernel network stack overhead.
7. **Disable power management**: Turn off C-states and frequency scaling (`performance` governor) to avoid latency spikes from core wake-up.
8. **Avoid allocation**: Pre-allocate all memory. No `malloc`/`free` on the hot path (they may take locks).

**Q14: Compare and contrast SoA and AoS. When would you choose each?**

**AoS** (Array of Structs): Each object's fields are contiguous. Advantages: natural OOP mapping, good when all fields are accessed together, simpler memory management (one allocation per object), cache-friendly for single-object access. Disadvantages: wastes cache bandwidth when processing one field across many objects, harder to vectorize.

**SoA** (Struct of Arrays): Each field across all objects is contiguous. Advantages: excellent cache utilization when processing one field across many objects, trivially vectorizable with SIMD (data is already packed), enables compression of individual arrays. Disadvantages: accessing all fields of one object requires loading from many arrays, more complex memory management, poor for random single-object access.

Choose AoS when: objects are accessed individually (game entity lookup), all fields are needed together, code clarity matters, number of objects is small.

Choose SoA when: processing large batches, only a few fields are needed per operation, SIMD vectorization is important, hot loops dominate runtime.

Hybrid AoSoA: Group objects into small SoA tiles (e.g., 8 or 16). This balances single-object access with vectorization and fits tiles in cache lines.

---

## Summary

```
Optimization Technique     | Typical Speedup | Effort | When to Use
---------------------------+-----------------+--------+---------------------------
Cache-friendly traversal   | 2-10x           | Low    | Any array/matrix code
Loop tiling                | 3-8x            | Medium | Matrix operations
SoA layout                 | 2-4x            | Medium | Batch processing
False sharing avoidance    | 5-20x           | Low    | Multi-threaded counters
SIMD intrinsics            | 4-16x           | High   | Compute-heavy hot loops
Branchless programming     | 2-5x            | Low    | Unpredictable branches
Compiler flags (-O3, LTO)  | 2-3x            | None   | Everything (always use)
PGO                        | 10-20%          | Low    | Production builds
Memory alignment           | 5-20%           | Low    | SIMD code
Software prefetching       | 20-60%          | Medium | Random access patterns
Lock-free data structures  | 2-10x           | High   | Lock-contended paths
NUMA awareness             | 30-100%         | Medium | Multi-socket systems
```

**Key takeaways**:
1. Always profile before optimizing. The bottleneck is rarely where you think it is.
2. Data layout (SoA, tiling) often matters more than algorithm cleverness.
3. The compiler is your ally: use `-O3 -march=native -flto` and check its vectorization reports.
4. SIMD provides the largest per-core speedup but requires the most effort.
5. On multi-core systems, false sharing and NUMA effects can silently destroy performance.

> **Next**: [Chapter 3 - GPU Architecture and CUDA Basics](./03-GPU-ARCHITECTURE.md)
