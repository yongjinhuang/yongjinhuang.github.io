# Chapter 13: Tools, Languages & Ecosystem

## Why This Chapter Matters

You can understand every algorithm in this guide, but if you cannot wield the tools effectively, you will be slow. This chapter covers the programming languages, build systems, debuggers, and ecosystem knowledge that separate productive GPU/HPC engineers from everyone else.

The right tool for the job matters enormously in performance programming. A single compiler flag can mean 2x performance. A single sanitizer run can catch a bug that would otherwise take days to track down. Knowing how to read assembly output can reveal why your "optimized" code is actually slower.

```
+------------------------------------------------------------------------+
|                     THE HPC/GPU TOOLCHAIN                               |
+------------------------------------------------------------------------+
|                                                                        |
|  LANGUAGES            COMPILERS           BUILD SYSTEMS                |
|  +----------------+   +----------------+  +------------------+         |
|  | C (systems)    |   | gcc / clang    |  | CMake            |         |
|  | C++ (perf)     |   | nvcc (CUDA)    |  | Makefiles        |         |
|  | Rust (safety)  |   | nvc++ (NVC)    |  | Bazel            |         |
|  | Assembly (opt) |   | icx (Intel)    |  | Meson            |         |
|  | Python (glue)  |   | hipcc (ROCm)   |  | Ninja             |         |
|  +----------------+   +----------------+  +------------------+         |
|                                                                        |
|  DEBUGGERS            PROFILERS           ANALYSIS                     |
|  +----------------+   +----------------+  +------------------+         |
|  | GDB / LLDB     |   | perf           |  | Godbolt          |         |
|  | cuda-gdb       |   | Nsight Compute |  | Sanitizers       |         |
|  | rr (record)    |   | VTune          |  | Valgrind         |         |
|  | Valgrind       |   | Nsight Systems |  | cppcheck         |         |
|  | strace/ltrace  |   | Tracy          |  | clang-tidy       |         |
|  +----------------+   +----------------+  +------------------+         |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 13.1 C for Systems Programming

### Why C Is Still Essential

C is the lingua franca of systems programming. The Linux kernel, CUDA runtime, OpenCL drivers, and virtually every hardware interface is written in C. Even if you write application code in C++ or Rust, you will call C libraries, read C headers, and debug C code.

Key reasons C remains critical:
- **Hardware proximity**: C maps almost directly to machine instructions
- **ABI stability**: The C calling convention is the universal FFI
- **Kernel programming**: Linux kernel is written in C (with recent Rust additions)
- **CUDA runtime API**: Written in C, callable from C
- **Embedded systems**: Most firmware is C

### Pointers and Memory

Pointers are the foundation of all systems programming. Every GPU buffer, every memory-mapped register, every DMA transfer ultimately involves pointer manipulation.

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

/* ---- Pointer Fundamentals ---- */

void pointer_basics(void) {
    int value = 42;
    int *ptr = &value;          /* ptr holds the ADDRESS of value */

    printf("Value: %d\n", *ptr);           /* dereference: read value at address */
    printf("Address: %p\n", (void *)ptr);  /* print the address itself */

    /* Pointer arithmetic: moves by sizeof(pointed-to type) */
    int arr[5] = {10, 20, 30, 40, 50};
    int *p = arr;               /* array decays to pointer to first element */

    for (int i = 0; i < 5; i++) {
        printf("arr[%d] = %d (at %p)\n", i, *(p + i), (void *)(p + i));
        /* p + i advances by i * sizeof(int) bytes */
    }
}

/* ---- Pointer Arithmetic for Buffer Processing ---- */

/* Process a buffer of floats in chunks, common in GPU staging */
void process_buffer_chunks(float *buffer, size_t total_floats, size_t chunk_size) {
    float *end = buffer + total_floats;
    float *chunk_ptr = buffer;

    while (chunk_ptr < end) {
        size_t remaining = (size_t)(end - chunk_ptr);
        size_t this_chunk = (remaining < chunk_size) ? remaining : chunk_size;

        /* Process this chunk */
        float sum = 0.0f;
        for (size_t i = 0; i < this_chunk; i++) {
            sum += chunk_ptr[i];    /* equivalent to *(chunk_ptr + i) */
        }

        printf("Chunk at offset %td: sum = %f\n",
               chunk_ptr - buffer, sum);

        chunk_ptr += this_chunk;    /* advance to next chunk */
    }
}

/* ---- Void Pointers and Type Punning ---- */

/* Generic memory copy - this is essentially what memcpy does */
void my_memcpy(void *dst, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dst;
    const unsigned char *s = (const unsigned char *)src;

    /* Copy word-sized chunks for performance */
    size_t words = n / sizeof(size_t);
    size_t *dw = (size_t *)d;
    const size_t *sw = (const size_t *)s;

    for (size_t i = 0; i < words; i++) {
        dw[i] = sw[i];
    }

    /* Copy remaining bytes */
    size_t copied = words * sizeof(size_t);
    for (size_t i = copied; i < n; i++) {
        d[i] = s[i];
    }
}
```

### Manual Memory Management

Understanding manual memory management is essential because GPU programming requires explicit allocation, transfer, and deallocation.

```c
#include <stdlib.h>
#include <string.h>
#include <errno.h>

/* ---- Aligned Allocation for SIMD and DMA ---- */

/* Allocate memory aligned to a power-of-two boundary.
   Required for SIMD (SSE needs 16, AVX needs 32, AVX-512 needs 64).
   Required for GPU DMA transfers (typically 256-byte aligned). */
void *aligned_alloc_portable(size_t alignment, size_t size) {
    void *ptr = NULL;

#if defined(_WIN32)
    ptr = _aligned_malloc(size, alignment);
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
    /* C11 aligned_alloc: size must be multiple of alignment */
    size_t adjusted_size = (size + alignment - 1) & ~(alignment - 1);
    ptr = aligned_alloc(alignment, adjusted_size);
#else
    if (posix_memalign(&ptr, alignment, size) != 0) {
        ptr = NULL;
    }
#endif

    return ptr;
}

/* ---- Arena Allocator ---- */
/* Extremely fast allocation pattern used in game engines and HPC.
   Allocate linearly from a pre-allocated block. Free everything at once. */

typedef struct {
    unsigned char *base;
    size_t capacity;
    size_t offset;
} Arena;

Arena arena_create(size_t capacity) {
    Arena a;
    a.base = (unsigned char *)malloc(capacity);
    a.capacity = capacity;
    a.offset = 0;
    return a;
}

void *arena_alloc(Arena *a, size_t size, size_t alignment) {
    /* Align the current offset */
    size_t aligned_offset = (a->offset + alignment - 1) & ~(alignment - 1);

    if (aligned_offset + size > a->capacity) {
        return NULL;    /* out of memory */
    }

    void *ptr = a->base + aligned_offset;
    a->offset = aligned_offset + size;
    return ptr;
}

void arena_reset(Arena *a) {
    a->offset = 0;     /* "free" everything instantly */
}

void arena_destroy(Arena *a) {
    free(a->base);
    a->base = NULL;
    a->capacity = 0;
    a->offset = 0;
}

/* Usage: allocate a batch of work items for GPU dispatch */
void example_arena_usage(void) {
    Arena arena = arena_create(1024 * 1024);  /* 1 MB arena */

    /* Allocate rapidly without individual free calls */
    float *positions = (float *)arena_alloc(&arena, 1000 * 3 * sizeof(float), 64);
    float *velocities = (float *)arena_alloc(&arena, 1000 * 3 * sizeof(float), 64);
    int *indices = (int *)arena_alloc(&arena, 1000 * sizeof(int), 64);

    /* ... do work, upload to GPU, etc. ... */

    arena_reset(&arena);    /* instant "free" of all allocations */
    arena_destroy(&arena);
}
```

### The volatile Keyword

`volatile` tells the compiler that a variable can change outside the program's control. This is critical for memory-mapped hardware registers.

```c
#include <stdint.h>

/* ---- Memory-Mapped I/O ---- */

/* Hardware registers are accessed through memory addresses.
   Without volatile, the compiler may optimize away reads/writes
   that it thinks are redundant. */

/* Example: reading a GPU status register */
#define GPU_STATUS_REG   ((volatile uint32_t *)0xFE200000)
#define GPU_COMMAND_REG  ((volatile uint32_t *)0xFE200004)
#define GPU_DATA_REG     ((volatile uint32_t *)0xFE200008)

#define GPU_STATUS_BUSY  (1u << 0)
#define GPU_STATUS_DONE  (1u << 1)
#define GPU_STATUS_ERROR (1u << 2)

/* Wait for GPU to become idle */
void gpu_wait_idle(void) {
    /* Without volatile, compiler might read status once and loop forever
       because it "knows" the value cannot change.
       With volatile, compiler generates a load instruction every iteration. */
    while (*GPU_STATUS_REG & GPU_STATUS_BUSY) {
        /* spin - in real code you would yield or use interrupts */
    }
}

/* Send a command to the GPU */
void gpu_send_command(uint32_t cmd, uint32_t data) {
    gpu_wait_idle();

    /* These writes MUST happen in this order and MUST actually
       reach the hardware. volatile guarantees both. */
    *GPU_DATA_REG = data;
    *GPU_COMMAND_REG = cmd;
}

/* ---- volatile for Signal Handlers ---- */

#include <signal.h>

static volatile sig_atomic_t shutdown_requested = 0;

void signal_handler(int sig) {
    (void)sig;
    shutdown_requested = 1;     /* must be volatile: modified by signal handler */
}

void main_loop(void) {
    signal(SIGINT, signal_handler);

    while (!shutdown_requested) {
        /* do work */
    }
}
```

### The restrict Keyword

`restrict` tells the compiler that a pointer is the *only* way to access the memory it points to. This enables crucial optimizations, especially auto-vectorization.

```c
/* Without restrict: compiler assumes a and b might overlap (alias),
   so it cannot vectorize or reorder loads/stores freely. */
void add_vectors_slow(float *a, const float *b, int n) {
    for (int i = 0; i < n; i++) {
        a[i] += b[i];
    }
}

/* With restrict: compiler KNOWS a and b do not overlap.
   It can now use SIMD instructions and pipeline loads/stores. */
void add_vectors_fast(float *restrict a, const float *restrict b, int n) {
    for (int i = 0; i < n; i++) {
        a[i] += b[i];
    }
}

/* This matters hugely for inner loops. On modern CPUs,
   the restrict version can be 2-4x faster because the compiler
   generates AVX/SSE vector instructions instead of scalar ones. */

/* Real-world example: matrix multiply helper */
void matmul_inner(float *restrict C,
                  const float *restrict A,
                  const float *restrict B,
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
```

### Inline Assembly

Sometimes you need exact control over what instructions execute. GCC/Clang support inline assembly with constraints.

```c
#include <stdint.h>

/* ---- Read the CPU timestamp counter ---- */
static inline uint64_t rdtsc(void) {
    uint32_t lo, hi;
    __asm__ __volatile__(
        "rdtsc"
        : "=a"(lo), "=d"(hi)   /* outputs: lo in eax, hi in edx */
        :                        /* no inputs */
        : "memory"               /* clobber: acts as memory barrier */
    );
    return ((uint64_t)hi << 32) | lo;
}

/* ---- CPU pause instruction for spin loops ---- */
static inline void cpu_pause(void) {
    __asm__ __volatile__("pause" ::: "memory");
}

/* ---- Cache line flush ---- */
static inline void clflush(const void *addr) {
    __asm__ __volatile__(
        "clflush (%0)"
        :                       /* no outputs */
        : "r"(addr)             /* input: address in any register */
        : "memory"
    );
}

/* ---- Prefetch data into cache ---- */
static inline void prefetch_l1(const void *addr) {
    __asm__ __volatile__(
        "prefetcht0 (%0)"
        :
        : "r"(addr)
    );
}

/* ---- Memory fence (full barrier) ---- */
static inline void memory_fence(void) {
    __asm__ __volatile__("mfence" ::: "memory");
}

/* ---- Spinlock using atomic compare-and-swap ---- */
typedef struct { volatile int locked; } spinlock_t;

void spin_lock(spinlock_t *lock) {
    while (1) {
        int expected = 0;
        int desired = 1;
        int result;

        __asm__ __volatile__(
            "lock cmpxchgl %2, %1"
            : "=a"(result), "+m"(lock->locked)
            : "r"(desired), "0"(expected)
            : "memory", "cc"
        );

        if (result == expected) break;
        cpu_pause();
    }
}

void spin_unlock(spinlock_t *lock) {
    __asm__ __volatile__(
        "movl $0, %0"
        : "=m"(lock->locked)
        :
        : "memory"
    );
}
```

### C11 Features Relevant to Performance

```c
#include <stdatomic.h>
#include <stdalign.h>
#include <threads.h>

/* ---- C11 Atomics ---- */
/* Portable lock-free programming without inline assembly */

typedef struct {
    _Atomic int count;
    _Atomic _Bool flag;
} AtomicCounter;

void atomic_increment(AtomicCounter *c) {
    atomic_fetch_add_explicit(&c->count, 1, memory_order_relaxed);
}

int atomic_load_count(const AtomicCounter *c) {
    return atomic_load_explicit(&c->count, memory_order_acquire);
}

/* ---- C11 Alignment ---- */
/* Control alignment for SIMD and cache-line optimization */

typedef struct {
    alignas(64) float data[16];     /* cache-line aligned */
} CacheAlignedBlock;

/* ---- C11 Static Assertions ---- */
_Static_assert(sizeof(float) == 4, "float must be 4 bytes");
_Static_assert(alignof(CacheAlignedBlock) == 64, "must be cache-line aligned");

/* ---- C11 Generic Selections ---- */
/* Type-generic math without C++ templates */
#define abs_val(x) _Generic((x),   \
    int:    abs,                     \
    float:  fabsf,                   \
    double: fabs                     \
)(x)
```

---

## 13.2 C++ for Performance

### Why C++ for HPC

C++ is the dominant language for performance-critical applications: game engines, trading systems, scientific computing, and GPU programming. Modern C++ (17/20/23) provides zero-cost abstractions that let you write safe, readable code without sacrificing performance.

### constexpr: Compile-Time Computation

Move computation from runtime to compile time. The result is baked into the binary as a constant.

```cpp
#include <array>
#include <cstddef>

// ---- Basic constexpr ----
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) {
        result *= i;
    }
    return result;
}

// This is computed at compile time. Zero runtime cost.
constexpr int fact10 = factorial(10);  // 3628800

// ---- constexpr Lookup Tables ----
// Generate lookup tables at compile time for fast runtime access.
// Common in DSP, graphics, and physics code.

constexpr size_t TABLE_SIZE = 256;

constexpr std::array<float, TABLE_SIZE> generate_sin_table() {
    std::array<float, TABLE_SIZE> table{};
    for (size_t i = 0; i < TABLE_SIZE; ++i) {
        double angle = (2.0 * 3.14159265358979323846 * i) / TABLE_SIZE;
        // Taylor series approximation (constexpr-friendly)
        double x = angle;
        double x2 = x * x;
        double x3 = x2 * x;
        double x5 = x3 * x2;
        double x7 = x5 * x2;
        table[i] = static_cast<float>(x - x3 / 6.0 + x5 / 120.0 - x7 / 5040.0);
    }
    return table;
}

constexpr auto SIN_TABLE = generate_sin_table();

// At runtime, looking up sin is just an array access:
float fast_sin(unsigned char index) {
    return SIN_TABLE[index];
}

// ---- C++20 consteval: guaranteed compile-time ----
consteval int must_be_compiletime(int x) {
    return x * x + 1;
}
```

### Templates and CRTP

Templates generate specialized code at compile time. The Curiously Recurring Template Pattern (CRTP) provides static polymorphism -- virtual-function-like behavior with zero overhead.

```cpp
#include <cstddef>
#include <cstring>

// ---- CRTP for Static Polymorphism ----
// Instead of virtual functions (vtable lookup = cache miss),
// CRTP resolves the call at compile time.

template <typename Derived>
class KernelBase {
public:
    void execute(float* data, size_t n) {
        // Static dispatch: no virtual function call
        static_cast<Derived*>(this)->process(data, n);
    }

    float benchmark(float* data, size_t n, int iterations) {
        for (int i = 0; i < iterations; ++i) {
            static_cast<Derived*>(this)->process(data, n);
        }
        return 0.0f;  // placeholder for timing
    }
};

class SaxpyKernel : public KernelBase<SaxpyKernel> {
public:
    float alpha = 2.0f;

    void process(float* data, size_t n) {
        for (size_t i = 0; i < n; ++i) {
            data[i] = alpha * data[i] + data[i];
        }
    }
};

class ScaleKernel : public KernelBase<ScaleKernel> {
public:
    float factor = 0.5f;

    void process(float* data, size_t n) {
        for (size_t i = 0; i < n; ++i) {
            data[i] *= factor;
        }
    }
};

// ---- Expression Templates ----
// Avoid temporary allocations in math expressions.
// Instead of:  result = a + b + c  (creates 2 temporaries)
// Expression templates fuse the operations into one loop.

template <typename E>
class VecExpr {
public:
    float operator[](size_t i) const {
        return static_cast<const E&>(*this)[i];
    }
    size_t size() const {
        return static_cast<const E&>(*this).size();
    }
};

class Vec : public VecExpr<Vec> {
    float* data_;
    size_t size_;
public:
    Vec(size_t n) : data_(new float[n]()), size_(n) {}
    ~Vec() { delete[] data_; }

    float  operator[](size_t i) const { return data_[i]; }
    float& operator[](size_t i)       { return data_[i]; }
    size_t size() const { return size_; }

    // Assign from any expression -- this is where the magic happens.
    // The entire expression tree is evaluated element-by-element
    // in a SINGLE loop with ZERO temporaries.
    template <typename E>
    Vec& operator=(const VecExpr<E>& expr) {
        for (size_t i = 0; i < size_; ++i) {
            data_[i] = expr[i];
        }
        return *this;
    }
};

template <typename L, typename R>
class VecAdd : public VecExpr<VecAdd<L, R>> {
    const L& lhs_;
    const R& rhs_;
public:
    VecAdd(const L& l, const R& r) : lhs_(l), rhs_(r) {}
    float operator[](size_t i) const { return lhs_[i] + rhs_[i]; }
    size_t size() const { return lhs_.size(); }
};

template <typename L, typename R>
VecAdd<L, R> operator+(const VecExpr<L>& l, const VecExpr<R>& r) {
    return VecAdd<L, R>(static_cast<const L&>(l), static_cast<const R&>(r));
}

// Usage: result = a + b + c
// This compiles to a SINGLE loop: result[i] = a[i] + b[i] + c[i]
// No temporary vectors allocated.
```

### Move Semantics and RAII

```cpp
#include <cstddef>
#include <utility>
#include <cstdlib>
#include <cstring>
#include <stdexcept>

// ---- RAII wrapper for GPU-like buffer ----
// Demonstrates move semantics for zero-copy transfers

class DeviceBuffer {
    float* data_ = nullptr;
    size_t size_ = 0;

public:
    // Constructor: allocate
    explicit DeviceBuffer(size_t n)
        : data_(static_cast<float*>(std::aligned_alloc(64, n * sizeof(float))))
        , size_(n)
    {
        if (!data_) throw std::bad_alloc();
        std::memset(data_, 0, n * sizeof(float));
    }

    // Destructor: free
    ~DeviceBuffer() {
        std::free(data_);
    }

    // Delete copy (expensive, disallowed)
    DeviceBuffer(const DeviceBuffer&) = delete;
    DeviceBuffer& operator=(const DeviceBuffer&) = delete;

    // Move constructor: transfer ownership, zero cost
    DeviceBuffer(DeviceBuffer&& other) noexcept
        : data_(other.data_), size_(other.size_)
    {
        other.data_ = nullptr;
        other.size_ = 0;
    }

    // Move assignment
    DeviceBuffer& operator=(DeviceBuffer&& other) noexcept {
        if (this != &other) {
            std::free(data_);
            data_ = other.data_;
            size_ = other.size_;
            other.data_ = nullptr;
            other.size_ = 0;
        }
        return *this;
    }

    float* data() { return data_; }
    const float* data() const { return data_; }
    size_t size() const { return size_; }
};

// Factory function: move semantics mean NO copy on return
DeviceBuffer create_buffer(size_t n, float initial_value) {
    DeviceBuffer buf(n);
    for (size_t i = 0; i < n; ++i) {
        buf.data()[i] = initial_value;
    }
    return buf;  // moved, not copied
}
```

### std::span and std::mdspan (C++20/23)

```cpp
#include <span>
#include <numeric>
#include <cstddef>
#include <cassert>

// ---- std::span: non-owning view of contiguous memory ----
// Perfect for functions that operate on buffers without owning them.

float sum_elements(std::span<const float> data) {
    float total = 0.0f;
    for (float v : data) {
        total += v;
    }
    return total;
}

// Works with any contiguous container:
void span_example() {
    float raw_array[100];
    std::vector<float> vec(100);
    std::array<float, 100> arr;

    sum_elements(raw_array);   // works
    sum_elements(vec);         // works
    sum_elements(arr);         // works

    // Sub-spans for chunked processing
    std::span<float> full(raw_array);
    std::span<float> first_half = full.subspan(0, 50);
    std::span<float> second_half = full.subspan(50);
}

// ---- std::mdspan (C++23): multi-dimensional view ----
// Non-owning view of multi-dimensional data.
// Critical for matrix operations without pointer arithmetic.

#if __cplusplus >= 202302L
#include <mdspan>

void matrix_multiply_mdspan(
    std::mdspan<const float, std::dextents<size_t, 2>> A,
    std::mdspan<const float, std::dextents<size_t, 2>> B,
    std::mdspan<float, std::dextents<size_t, 2>> C)
{
    assert(A.extent(1) == B.extent(0));
    assert(C.extent(0) == A.extent(0));
    assert(C.extent(1) == B.extent(1));

    for (size_t i = 0; i < A.extent(0); ++i) {
        for (size_t j = 0; j < B.extent(1); ++j) {
            float sum = 0.0f;
            for (size_t k = 0; k < A.extent(1); ++k) {
                sum += A[i, k] * B[k, j];
            }
            C[i, j] = sum;
        }
    }
}
#endif
```

### Parallel Algorithms (C++17)

```cpp
#include <algorithm>
#include <execution>
#include <numeric>
#include <vector>

void parallel_algorithms_examples() {
    std::vector<float> data(10'000'000);

    // ---- Parallel sort ----
    // Uses all available CPU cores automatically
    std::sort(std::execution::par_unseq, data.begin(), data.end());

    // ---- Parallel transform ----
    std::transform(std::execution::par_unseq,
                   data.begin(), data.end(),
                   data.begin(),
                   [](float x) { return x * x + 1.0f; });

    // ---- Parallel reduce ----
    float total = std::reduce(std::execution::par_unseq,
                              data.begin(), data.end(),
                              0.0f, std::plus<>());

    // ---- Parallel transform_reduce (fused map-reduce) ----
    // Compute dot product without temporary vector
    std::vector<float> weights(10'000'000);
    float dot = std::transform_reduce(
        std::execution::par_unseq,
        data.begin(), data.end(),
        weights.begin(),
        0.0f,
        std::plus<>(),
        std::multiplies<>()
    );

    // ---- Parallel for_each ----
    std::for_each(std::execution::par,
                  data.begin(), data.end(),
                  [](float& x) { x = std::sqrt(x); });
}

// Execution policies:
// std::execution::seq       - sequential (single thread)
// std::execution::par       - parallel (multiple threads)
// std::execution::par_unseq - parallel + vectorized (threads + SIMD)
// std::execution::unseq     - vectorized only (C++20)
```

---

## 13.3 Rust for Safe Parallelism

### The Ownership Model Prevents Data Races

Rust's type system guarantees at compile time that data races cannot occur. This is not a runtime check -- the program simply will not compile if it contains potential data races.

```rust
use std::thread;

// ---- The Ownership Rule ----
// Each value has exactly ONE owner. When the owner goes out of scope,
// the value is dropped (freed). This prevents double-free and use-after-free.

fn ownership_example() {
    let data = vec![1, 2, 3, 4, 5];

    // Move data into the thread. The main thread can no longer access it.
    let handle = thread::spawn(move || {
        let sum: i32 = data.iter().sum();
        println!("Sum: {}", sum);
    });

    // data is no longer accessible here -- compiler error if you try
    // println!("{:?}", data);  // ERROR: value used after move

    handle.join().unwrap();
}

// ---- Shared References (&T) vs Mutable References (&mut T) ----
// Rule: You can have EITHER multiple shared refs OR one mutable ref.
// This is enforced at compile time and prevents data races.

fn reference_rules() {
    let mut data = vec![1, 2, 3];

    // Multiple shared references: OK
    let r1 = &data;
    let r2 = &data;
    println!("{:?} {:?}", r1, r2);

    // Mutable reference: only one allowed, and no shared refs at the same time
    let r3 = &mut data;
    r3.push(4);
    // println!("{:?}", r1);  // ERROR: cannot use shared ref while mutable ref exists
}

// ---- Thread-Safe Shared State with Arc<Mutex<T>> ----
use std::sync::{Arc, Mutex};

fn shared_state_example() {
    let counter = Arc::new(Mutex::new(0i64));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter_clone = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            for _ in 0..1000 {
                let mut num = counter_clone.lock().unwrap();
                *num += 1;
                // Mutex is automatically released when `num` goes out of scope (RAII)
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Final count: {}", *counter.lock().unwrap());
    // Always prints 10000 -- no data race possible
}

// ---- Lock-Free Atomics ----
use std::sync::atomic::{AtomicU64, Ordering};

fn atomic_example() {
    let counter = Arc::new(AtomicU64::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                c.fetch_add(1, Ordering::Relaxed);
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    println!("Atomic count: {}", counter.load(Ordering::SeqCst));
}
```

### Rayon for Parallel Iterators

Rayon transforms sequential iterators into parallel ones with a single method call.

```rust
use rayon::prelude::*;

fn rayon_examples() {
    let data: Vec<f64> = (0..10_000_000).map(|i| i as f64).collect();

    // ---- Parallel map ----
    let squares: Vec<f64> = data.par_iter()
        .map(|&x| x * x)
        .collect();

    // ---- Parallel reduce ----
    let sum: f64 = data.par_iter()
        .sum();

    // ---- Parallel filter + map + reduce (fused) ----
    let result: f64 = data.par_iter()
        .filter(|&&x| x > 1000.0)
        .map(|&x| x.sqrt())
        .sum();

    // ---- Parallel sort ----
    let mut sortable: Vec<f64> = data.clone();
    sortable.par_sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

    // ---- Parallel chunks ----
    let chunk_sums: Vec<f64> = data.par_chunks(1024)
        .map(|chunk| chunk.iter().sum())
        .collect();

    // ---- Parallel matrix multiply ----
    let n = 1000;
    let a: Vec<f64> = vec![1.0; n * n];
    let b: Vec<f64> = vec![1.0; n * n];
    let mut c: Vec<f64> = vec![0.0; n * n];

    c.par_chunks_mut(n)
        .enumerate()
        .for_each(|(i, row)| {
            for j in 0..n {
                let mut sum = 0.0;
                for k in 0..n {
                    sum += a[i * n + k] * b[k * n + j];
                }
                row[j] = sum;
            }
        });
}
```

### Unsafe Blocks for FFI

When calling C libraries or CUDA runtime, Rust requires `unsafe` blocks to explicitly mark where safety guarantees are the programmer's responsibility.

```rust
// ---- Calling C functions via FFI ----

// Declare the external C functions
extern "C" {
    fn malloc(size: usize) -> *mut std::ffi::c_void;
    fn free(ptr: *mut std::ffi::c_void);
    fn memcpy(
        dst: *mut std::ffi::c_void,
        src: *const std::ffi::c_void,
        n: usize,
    ) -> *mut std::ffi::c_void;
}

// Safe wrapper around unsafe C allocation
struct CBuffer {
    ptr: *mut f32,
    len: usize,
}

impl CBuffer {
    fn new(len: usize) -> Self {
        let ptr = unsafe {
            let raw = malloc(len * std::mem::size_of::<f32>());
            if raw.is_null() {
                panic!("allocation failed");
            }
            raw as *mut f32
        };
        CBuffer { ptr, len }
    }

    fn as_slice(&self) -> &[f32] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }

    fn as_mut_slice(&mut self) -> &mut [f32] {
        unsafe { std::slice::from_raw_parts_mut(self.ptr, self.len) }
    }
}

impl Drop for CBuffer {
    fn drop(&mut self) {
        unsafe { free(self.ptr as *mut std::ffi::c_void) };
    }
}

// ---- Example: Calling a CUDA-like runtime ----
// In real code, these would link to libcudart

#[repr(C)]
enum CudaError {
    Success = 0,
    ErrorMemoryAllocation = 2,
}

extern "C" {
    fn cudaMalloc(devPtr: *mut *mut std::ffi::c_void, size: usize) -> i32;
    fn cudaFree(devPtr: *mut std::ffi::c_void) -> i32;
    fn cudaMemcpy(
        dst: *mut std::ffi::c_void,
        src: *const std::ffi::c_void,
        count: usize,
        kind: i32,
    ) -> i32;
}

// Safe Rust wrapper
struct GpuBuffer {
    ptr: *mut std::ffi::c_void,
    size_bytes: usize,
}

impl GpuBuffer {
    fn new(size_bytes: usize) -> Result<Self, String> {
        let mut ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let err = unsafe { cudaMalloc(&mut ptr, size_bytes) };
        if err != 0 {
            return Err(format!("cudaMalloc failed with error {}", err));
        }
        Ok(GpuBuffer { ptr, size_bytes })
    }
}

impl Drop for GpuBuffer {
    fn drop(&mut self) {
        unsafe { cudaFree(self.ptr) };
    }
}
```

### Rust GPU Projects

```rust
// ---- wgpu: Cross-platform GPU compute (Vulkan/Metal/DX12/WebGPU) ----
// wgpu is Rust's primary way to access GPU compute.

// Cargo.toml:
// [dependencies]
// wgpu = "0.19"
// pollster = "0.3"   # for block_on

// Example: dispatch a compute shader
async fn gpu_compute_example() {
    // Request GPU adapter
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .unwrap();

    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default(), None)
        .await
        .unwrap();

    // Create shader module (WGSL shader language)
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("compute shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
            @group(0) @binding(0) var<storage, read_write> data: array<f32>;

            @compute @workgroup_size(256)
            fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                let i = id.x;
                if (i < arrayLength(&data)) {
                    data[i] = data[i] * data[i];
                }
            }
        "#)),
    });

    // From here: create bind group layout, pipeline, buffers,
    // encode commands, submit to queue, read back results.
    // See wgpu documentation for complete examples.
}
```

---

## 13.4 Assembly Fundamentals

### Why Learn Assembly

You will rarely *write* assembly, but you must be able to *read* it to:
- Verify the compiler is vectorizing your hot loops
- Understand why a seemingly simple change caused a 2x performance regression
- Debug subtle issues in lock-free code
- Write the occasional hand-optimized intrinsic

### x86-64 Registers

```
+-------------------------------------------------------------------+
|  x86-64 GENERAL PURPOSE REGISTERS                                  |
+-------------------------------------------------------------------+
|                                                                   |
|  64-bit    32-bit   16-bit   8-bit(hi)  8-bit(lo)                |
|  -------   ------   ------   --------   --------                  |
|  RAX       EAX      AX       AH         AL        (accumulator)  |
|  RBX       EBX      BX       BH         BL        (base)         |
|  RCX       ECX      CX       CH         CL        (counter)      |
|  RDX       EDX      DX       DH         DL        (data)         |
|  RSI       ESI      SI       -          SIL       (source index) |
|  RDI       EDI      DI       -          DIL       (dest index)   |
|  RSP       ESP      SP       -          SPL       (stack ptr)    |
|  RBP       EBP      BP       -          BPL       (base ptr)     |
|  R8-R15    R8D-R15D R8W-R15W -          R8B-R15B  (extended)     |
|                                                                   |
+-------------------------------------------------------------------+
|  SIMD REGISTERS                                                    |
+-------------------------------------------------------------------+
|  XMM0-XMM15   128-bit  (SSE: 4 floats or 2 doubles)             |
|  YMM0-YMM15   256-bit  (AVX: 8 floats or 4 doubles)             |
|  ZMM0-ZMM31   512-bit  (AVX-512: 16 floats or 8 doubles)        |
+-------------------------------------------------------------------+
|  SYSTEM V AMD64 CALLING CONVENTION (Linux, macOS)                  |
+-------------------------------------------------------------------+
|  Arguments:  RDI, RSI, RDX, RCX, R8, R9  (integer/pointer)      |
|              XMM0-XMM7                    (floating point)        |
|  Return:     RAX (integer), XMM0 (float)                          |
|  Callee-saved: RBX, RBP, R12-R15                                 |
|  Caller-saved: everything else                                    |
+-------------------------------------------------------------------+
```

### Reading Compiler Output

Here is what a simple function looks like in assembly. This is what you see on Godbolt.

```c
// C source:
float dot_product(const float *a, const float *b, int n) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}
```

```asm
; Compiler output (gcc -O2, scalar version):
; Arguments: rdi = a, rsi = b, edx = n
dot_product:
        xorps   xmm0, xmm0          ; sum = 0.0 (clear xmm0)
        test    edx, edx             ; if n <= 0
        jle     .done                ;   return 0.0
        movsxd  rdx, edx             ; sign-extend n to 64-bit
        xor     eax, eax             ; i = 0
.loop:
        movss   xmm1, [rdi+rax*4]   ; load a[i] into xmm1
        mulss   xmm1, [rsi+rax*4]   ; xmm1 *= b[i]
        addss   xmm0, xmm1          ; sum += xmm1
        inc     rax                  ; i++
        cmp     rax, rdx             ; if i < n
        jl      .loop                ;   continue
.done:
        ret                          ; return sum in xmm0
```

```asm
; With AVX auto-vectorization (gcc -O3 -mavx2):
; Processes 8 floats per iteration instead of 1
dot_product:
        test    edx, edx
        jle     .return_zero
        vxorps  ymm0, ymm0, ymm0    ; sum = {0,0,0,0,0,0,0,0}
        lea     ecx, [rdx-1]
        shr     ecx, 3               ; ecx = n / 8 (number of vector iterations)
        je      .scalar_tail
        xor     eax, eax
.vec_loop:
        vmovups ymm1, [rdi+rax]      ; load 8 floats from a
        vmulps  ymm1, ymm1, [rsi+rax] ; multiply by 8 floats from b
        vaddps  ymm0, ymm0, ymm1     ; accumulate
        add     rax, 32              ; advance by 32 bytes (8 floats)
        dec     ecx
        jne     .vec_loop
        ; Horizontal sum of ymm0 (8 partial sums -> 1 result)
        vextractf128 xmm1, ymm0, 1
        vaddps  xmm0, xmm0, xmm1
        vhaddps xmm0, xmm0, xmm0
        vhaddps xmm0, xmm0, xmm0
.scalar_tail:
        ; Handle remaining elements (n % 8)
        ; ... scalar cleanup loop ...
        ret
```

### Hand-Optimized Inner Loop Example

When the compiler cannot vectorize (complex control flow, non-obvious aliasing), you may need to write SIMD by hand using intrinsics.

```c
#include <immintrin.h>  /* AVX/AVX2 intrinsics */

/* Hand-optimized dot product with AVX2 */
float dot_product_avx2(const float *a, const float *b, int n) {
    __m256 sum0 = _mm256_setzero_ps();  /* 8-wide accumulator 0 */
    __m256 sum1 = _mm256_setzero_ps();  /* 8-wide accumulator 1 */
    __m256 sum2 = _mm256_setzero_ps();  /* 8-wide accumulator 2 */
    __m256 sum3 = _mm256_setzero_ps();  /* 8-wide accumulator 3 */

    int i = 0;

    /* Process 32 floats per iteration (4 x 8-wide) */
    /* Using 4 accumulators hides FMA latency (4 cycles on modern CPUs) */
    for (; i + 31 < n; i += 32) {
        __m256 a0 = _mm256_loadu_ps(a + i);
        __m256 b0 = _mm256_loadu_ps(b + i);
        sum0 = _mm256_fmadd_ps(a0, b0, sum0);  /* sum0 += a0 * b0 */

        __m256 a1 = _mm256_loadu_ps(a + i + 8);
        __m256 b1 = _mm256_loadu_ps(b + i + 8);
        sum1 = _mm256_fmadd_ps(a1, b1, sum1);

        __m256 a2 = _mm256_loadu_ps(a + i + 16);
        __m256 b2 = _mm256_loadu_ps(b + i + 16);
        sum2 = _mm256_fmadd_ps(a2, b2, sum2);

        __m256 a3 = _mm256_loadu_ps(a + i + 24);
        __m256 b3 = _mm256_loadu_ps(b + i + 24);
        sum3 = _mm256_fmadd_ps(a3, b3, sum3);
    }

    /* Combine the 4 accumulators */
    sum0 = _mm256_add_ps(sum0, sum1);
    sum2 = _mm256_add_ps(sum2, sum3);
    sum0 = _mm256_add_ps(sum0, sum2);

    /* Horizontal sum: reduce 8 floats to 1 */
    __m128 hi = _mm256_extractf128_ps(sum0, 1);
    __m128 lo = _mm256_castps256_ps128(sum0);
    __m128 s = _mm_add_ps(lo, hi);
    s = _mm_hadd_ps(s, s);
    s = _mm_hadd_ps(s, s);
    float result = _mm_cvtss_f32(s);

    /* Scalar cleanup for remaining elements */
    for (; i < n; i++) {
        result += a[i] * b[i];
    }

    return result;
}
```

---

## 13.5 Python in the GPU Ecosystem

### Python's Role

Python is the **glue language** of GPU computing. It is used for:
- Orchestrating GPU workflows (launch kernels, manage memory)
- Data preprocessing and postprocessing
- Prototyping algorithms before porting to C++/CUDA
- Machine learning frameworks (PyTorch, TensorFlow, JAX)

Python is **not** used for the hot inner loops. The actual computation runs in C/C++/CUDA underneath.

### NumPy: The Foundation

```python
import numpy as np

# NumPy operations run in optimized C/Fortran (BLAS/LAPACK)
# These are NOT slow Python loops

a = np.random.randn(10_000_000).astype(np.float32)
b = np.random.randn(10_000_000).astype(np.float32)

# Vectorized operations (fast: runs in C)
c = a + b                    # element-wise add
d = a * b                    # element-wise multiply
dot = np.dot(a, b)           # dot product (calls BLAS)

# Matrix multiply (calls optimized BLAS: MKL, OpenBLAS, etc.)
A = np.random.randn(1000, 1000).astype(np.float32)
B = np.random.randn(1000, 1000).astype(np.float32)
C = A @ B                   # ~1 TFLOP/s on modern CPU via BLAS

# Memory layout matters for performance
row_major = np.array([[1,2,3],[4,5,6]], order='C')   # C-contiguous
col_major = np.array([[1,2,3],[4,5,6]], order='F')   # Fortran-contiguous

# Accessing the underlying buffer for FFI
ptr = a.ctypes.data                   # raw pointer (int)
nbytes = a.nbytes                     # total bytes
print(f"Buffer at {hex(ptr)}, {nbytes} bytes")
```

### CuPy: NumPy on the GPU

```python
import cupy as cp

# CuPy has the SAME API as NumPy, but runs on the GPU
a_gpu = cp.random.randn(10_000_000, dtype=cp.float32)
b_gpu = cp.random.randn(10_000_000, dtype=cp.float32)

# These run CUDA kernels under the hood
c_gpu = a_gpu + b_gpu
dot_gpu = cp.dot(a_gpu, b_gpu)

# Matrix multiply on GPU (calls cuBLAS)
A_gpu = cp.random.randn(4096, 4096, dtype=cp.float32)
B_gpu = cp.random.randn(4096, 4096, dtype=cp.float32)
C_gpu = A_gpu @ B_gpu    # runs cuBLAS sgemm

# Transfer between CPU and GPU
a_cpu = cp.asnumpy(a_gpu)   # GPU -> CPU
a_gpu2 = cp.asarray(a_cpu)  # CPU -> GPU

# Custom CUDA kernels in CuPy
saxpy_kernel = cp.RawKernel(r'''
extern "C" __global__
void saxpy(float a, const float* x, float* y, int n) {
    int i = blockDim.x * blockIdx.x + threadIdx.x;
    if (i < n) {
        y[i] = a * x[i] + y[i];
    }
}
''', 'saxpy')

n = 1_000_000
x_gpu = cp.ones(n, dtype=cp.float32)
y_gpu = cp.ones(n, dtype=cp.float32)
threads = 256
blocks = (n + threads - 1) // threads
saxpy_kernel((blocks,), (threads,), (cp.float32(2.0), x_gpu, y_gpu, n))
```

### Numba: JIT-Compiled CUDA from Python

```python
from numba import cuda, float32
import numpy as np
import math

# ---- Simple CUDA kernel ----
@cuda.jit
def vector_add(a, b, c):
    i = cuda.grid(1)               # global thread index
    if i < a.shape[0]:
        c[i] = a[i] + b[i]

n = 1_000_000
a = np.ones(n, dtype=np.float32)
b = np.ones(n, dtype=np.float32)
c = np.zeros(n, dtype=np.float32)

# Transfer to GPU
d_a = cuda.to_device(a)
d_b = cuda.to_device(b)
d_c = cuda.to_device(c)

threads_per_block = 256
blocks_per_grid = (n + threads_per_block - 1) // threads_per_block
vector_add[blocks_per_grid, threads_per_block](d_a, d_b, d_c)

result = d_c.copy_to_host()

# ---- Matrix multiply with shared memory ----
TPB = 16  # threads per block

@cuda.jit
def matmul_shared(A, B, C):
    sA = cuda.shared.array(shape=(TPB, TPB), dtype=float32)
    sB = cuda.shared.array(shape=(TPB, TPB), dtype=float32)

    tx = cuda.threadIdx.x
    ty = cuda.threadIdx.y
    row = cuda.blockIdx.y * TPB + ty
    col = cuda.blockIdx.x * TPB + tx

    tmp = 0.0
    for phase in range(math.ceil(A.shape[1] / TPB)):
        # Load tile into shared memory
        a_col = phase * TPB + tx
        b_row = phase * TPB + ty

        if row < A.shape[0] and a_col < A.shape[1]:
            sA[ty, tx] = A[row, a_col]
        else:
            sA[ty, tx] = 0.0

        if b_row < B.shape[0] and col < B.shape[1]:
            sB[ty, tx] = B[b_row, col]
        else:
            sB[ty, tx] = 0.0

        cuda.syncthreads()

        for k in range(TPB):
            tmp += sA[ty, k] * sB[k, tx]

        cuda.syncthreads()

    if row < C.shape[0] and col < C.shape[1]:
        C[row, col] = tmp
```

### ctypes/cffi for Calling C

```python
import ctypes
import numpy as np

# ---- ctypes: call compiled C functions ----

# Load the shared library
lib = ctypes.CDLL('./libcompute.so')

# Declare function signature
# void process_buffer(float* data, int n, float scale);
lib.process_buffer.argtypes = [
    ctypes.POINTER(ctypes.c_float),  # float*
    ctypes.c_int,                     # int
    ctypes.c_float                    # float
]
lib.process_buffer.restype = None

# Call it with a NumPy array
data = np.ones(1000, dtype=np.float32)
lib.process_buffer(
    data.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
    len(data),
    2.5
)

# ---- cffi: more ergonomic C FFI ----
from cffi import FFI

ffi = FFI()

# Declare the C interface
ffi.cdef("""
    float dot_product(const float *a, const float *b, int n);
    void saxpy(float alpha, const float *x, float *y, int n);
""")

# Load the library
lib = ffi.dlopen('./libvector.so')

# Create buffers that cffi can pass to C
n = 10000
a = ffi.new("float[]", n)
b = ffi.new("float[]", n)

for i in range(n):
    a[i] = float(i)
    b[i] = float(i)

result = lib.dot_product(a, b, n)
print(f"Dot product: {result}")

# Using NumPy arrays with cffi
arr = np.ones(1000, dtype=np.float32)
arr_ptr = ffi.cast("float *", arr.ctypes.data)
lib.saxpy(2.0, arr_ptr, arr_ptr, len(arr))
```

### When Python Is Fine vs. When It Is the Bottleneck

```
+-------------------------------------------------------------------+
|  WHEN PYTHON IS FINE                                               |
+-------------------------------------------------------------------+
|  - Data loading and preprocessing (Pandas, NumPy)                 |
|  - Orchestrating GPU kernels (launching, synchronizing)           |
|  - Machine learning training loops (PyTorch handles the hot path) |
|  - Visualization (matplotlib, plotly)                             |
|  - Configuration and experiment management                        |
|  - Post-processing and analysis of results                        |
|  - Any code that is NOT in the hot loop                           |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|  WHEN PYTHON IS THE BOTTLENECK                                     |
+-------------------------------------------------------------------+
|  - Element-wise loops over large arrays (use NumPy/CuPy instead)  |
|  - Custom data augmentation per-sample (use C++ DataLoader)       |
|  - Real-time inference serving with latency requirements          |
|  - Many small kernel launches (Python overhead per launch ~10us)  |
|  - Complex preprocessing between GPU steps (use CUDA graphs)     |
|  - Any "for x in big_list: compute(x)" pattern                   |
+-------------------------------------------------------------------+
```

---

## 13.6 Build Systems

### CMake for CUDA Projects

CMake is the standard build system for C++/CUDA projects. Since CMake 3.18, CUDA is a first-class language.

```cmake
# CMakeLists.txt for a CUDA project
cmake_minimum_required(VERSION 3.18)

# Enable CUDA as a language
project(MyGPUProject LANGUAGES CXX CUDA)

# Set C++ and CUDA standards
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

# ---- Compute capability targets ----
# This controls which GPU architectures to compile for.
# Newer = better performance, but won't run on older GPUs.
#
#   50 = Maxwell (GTX 900)
#   60 = Pascal  (GTX 1000)
#   70 = Volta   (V100)
#   75 = Turing  (RTX 2000)
#   80 = Ampere  (A100, RTX 3000)
#   86 = Ampere  (RTX 3060-3090)
#   89 = Ada     (RTX 4000)
#   90 = Hopper  (H100)
set(CMAKE_CUDA_ARCHITECTURES "70;80;89;90")

# ---- Build the library ----
add_library(gpu_kernels
    src/kernels/matmul.cu
    src/kernels/reduction.cu
    src/kernels/scan.cu
)

# Compiler flags for CUDA
target_compile_options(gpu_kernels PRIVATE
    $<$<COMPILE_LANGUAGE:CUDA>:
        --use_fast_math          # fast but less precise math
        -lineinfo                # source line info for profiling
        --ptxas-options=-v       # print register usage
        --expt-relaxed-constexpr # allow constexpr in device code
    >
)

# ---- Build the executable ----
add_executable(main src/main.cpp)
target_link_libraries(main PRIVATE gpu_kernels)

# ---- Find and link external libraries ----
# cuBLAS
find_package(CUDAToolkit REQUIRED)
target_link_libraries(gpu_kernels PRIVATE
    CUDA::cublas
    CUDA::curand
    CUDA::cufft
)

# ---- Optimization flags ----
target_compile_options(main PRIVATE
    $<$<COMPILE_LANGUAGE:CXX>:
        -O3 -march=native -ffast-math
    >
)

# ---- Testing ----
enable_testing()
add_executable(test_kernels tests/test_kernels.cu tests/test_main.cpp)
target_link_libraries(test_kernels PRIVATE gpu_kernels)
add_test(NAME gpu_tests COMMAND test_kernels)
```

### Makefile for CUDA

For simpler projects or when you need more control:

```makefile
# Makefile for CUDA project

# Compilers
NVCC      := nvcc
CXX       := g++
LINKER    := $(NVCC)

# Compute capability
GPU_ARCH  := -gencode arch=compute_80,code=sm_80 \
             -gencode arch=compute_89,code=sm_89 \
             -gencode arch=compute_90,code=sm_90

# Flags
NVCCFLAGS := -std=c++17 $(GPU_ARCH) --use_fast_math -lineinfo
CXXFLAGS  := -std=c++17 -O3 -march=native -ffast-math -Wall -Wextra
LDFLAGS   := -lcublas -lcurand -lcudart

# Debug flags
ifdef DEBUG
    NVCCFLAGS += -G -g -DDEBUG    # -G disables GPU optimizations for debugging
    CXXFLAGS  += -g -O0 -DDEBUG -fsanitize=address
    LDFLAGS   += -fsanitize=address
endif

# Directories
SRC_DIR   := src
OBJ_DIR   := build
BIN_DIR   := bin

# Source files
CU_SRCS   := $(wildcard $(SRC_DIR)/*.cu)
CXX_SRCS  := $(wildcard $(SRC_DIR)/*.cpp)
CU_OBJS   := $(CU_SRCS:$(SRC_DIR)/%.cu=$(OBJ_DIR)/%.cu.o)
CXX_OBJS  := $(CXX_SRCS:$(SRC_DIR)/%.cpp=$(OBJ_DIR)/%.cpp.o)
TARGET    := $(BIN_DIR)/gpu_app

# Rules
all: dirs $(TARGET)

dirs:
	@mkdir -p $(OBJ_DIR) $(BIN_DIR)

$(TARGET): $(CU_OBJS) $(CXX_OBJS)
	$(LINKER) $^ -o $@ $(LDFLAGS)

$(OBJ_DIR)/%.cu.o: $(SRC_DIR)/%.cu
	$(NVCC) $(NVCCFLAGS) -c $< -o $@

$(OBJ_DIR)/%.cpp.o: $(SRC_DIR)/%.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -rf $(OBJ_DIR) $(BIN_DIR)

# Generate PTX for inspection
ptx: $(CU_SRCS)
	$(NVCC) $(NVCCFLAGS) --ptx $^ -o $(OBJ_DIR)/kernels.ptx

# Profile-ready build
profile: NVCCFLAGS += -lineinfo --generate-line-info
profile: all

.PHONY: all clean dirs ptx profile
```

### nvcc Flags Reference

```
+-------------------------------------------------------------------+
|  ESSENTIAL nvcc FLAGS                                              |
+-------------------------------------------------------------------+
|                                                                   |
|  OPTIMIZATION:                                                    |
|    -O0              No optimization (for debugging)               |
|    -O2              Standard optimization (default)               |
|    -O3              Aggressive optimization                       |
|    --use_fast_math  Fast math (less precise, faster)              |
|    -Xptxas -O3      Optimize PTX assembly                        |
|                                                                   |
|  ARCHITECTURE:                                                    |
|    -arch=sm_80       Target specific SM version                   |
|    -gencode arch=compute_80,code=sm_80   JIT + native             |
|    -gencode arch=compute_90,code=compute_90  PTX only (JIT)      |
|                                                                   |
|  DEBUGGING:                                                       |
|    -G                Device debug info (SLOW: disables optim.)    |
|    -g                Host debug info                              |
|    -lineinfo         Source correlation for profilers             |
|    --ptxas-options=-v  Print register/smem usage per kernel       |
|                                                                   |
|  CODE GENERATION:                                                 |
|    --ptx             Output PTX instead of binary                |
|    -rdc=true         Relocatable device code (for linking)        |
|    -dlto             Device link-time optimization                |
|    -maxrregcount=N   Limit registers per thread                  |
|                                                                   |
|  FEATURES:                                                        |
|    --expt-relaxed-constexpr  Allow constexpr in device code      |
|    --expt-extended-lambda    Allow __device__ lambdas             |
|    --extended-lambda         Same as above (newer nvcc)           |
|    --std=c++17               C++ standard                        |
|                                                                   |
|  HOST COMPILER:                                                   |
|    -ccbin=/usr/bin/g++-12    Specify host compiler               |
|    -Xcompiler "-O3 -march=native"  Pass flags to host compiler   |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 13.7 Compiler Explorer (Godbolt)

### What Is Godbolt

[Compiler Explorer](https://godbolt.org) is an online tool that shows you the assembly output of your code in real time. It supports hundreds of compilers (GCC, Clang, MSVC, nvcc, ICX) and dozens of languages.

### How to Use It Effectively

```
+-------------------------------------------------------------------+
|  GODBOLT WORKFLOW                                                  |
+-------------------------------------------------------------------+
|                                                                   |
|  1. Write your function (not a whole program, just the hot loop)  |
|  2. Select compiler and flags (e.g., gcc 13.2, -O3 -mavx2)       |
|  3. Read the assembly output                                      |
|  4. Look for:                                                     |
|     - vmulps/vaddps/vfmadd231ps = vectorized (GOOD)              |
|     - mulss/addss = scalar only (BAD for hot loops)              |
|     - call __memcpy / call __stack_chk_fail = overhead           |
|     - cmp/jne in tight loop = branch (potential stall)           |
|     - vbroadcastss = scalar broadcast to vector (OK)             |
|                                                                   |
|  5. Compare with different:                                       |
|     - Optimization levels (-O1 vs -O2 vs -O3)                    |
|     - Compilers (GCC vs Clang vs ICC)                             |
|     - Target architectures (-march=haswell vs -march=znver3)     |
|     - Code variations (restrict, alignment hints, pragmas)       |
|                                                                   |
+-------------------------------------------------------------------+
```

### Example: Understanding Auto-Vectorization

```c
/* Put this in Godbolt with gcc -O3 -mavx2 -ffast-math */

/* VERSION 1: Compiler CAN vectorize (simple data-parallel loop) */
void scale_array(float *restrict out,
                 const float *restrict in,
                 float factor, int n) {
    for (int i = 0; i < n; i++) {
        out[i] = in[i] * factor;
    }
}
/* Expected output: vbroadcastss + vmulps (processing 8 floats/iteration) */

/* VERSION 2: Compiler CANNOT vectorize (loop-carried dependency) */
void running_sum(float *out, const float *in, int n) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) {
        sum += in[i];
        out[i] = sum;    /* Each iteration depends on the previous */
    }
}
/* Expected output: addss (scalar), no vmulps/vaddps */

/* VERSION 3: Compiler MIGHT vectorize (depends on flags/compiler) */
void conditional_scale(float *out, const float *in, int n) {
    for (int i = 0; i < n; i++) {
        if (in[i] > 0.0f) {
            out[i] = in[i] * 2.0f;
        } else {
            out[i] = in[i] * 0.5f;
        }
    }
}
/* With -O3: may use masked vector instructions (vblendvps or mask registers) */

/* VERSION 4: Helping the compiler with pragmas */
void scale_with_hint(float *restrict out,
                     const float *restrict in,
                     float factor, int n) {
#pragma GCC ivdep          /* assert: no loop-carried dependencies */
    for (int i = 0; i < n; i++) {
        out[i] = in[i] * factor;
    }
}
```

### Godbolt Tips

```
+-------------------------------------------------------------------+
|  GODBOLT POWER TIPS                                                |
+-------------------------------------------------------------------+
|                                                                   |
|  1. Use "Diff View" to compare assembly between two versions      |
|     of the same function. Invaluable for understanding the        |
|     impact of a single code change.                               |
|                                                                   |
|  2. Add -S -fverbose-asm to see compiler comments in assembly.    |
|                                                                   |
|  3. Use __attribute__((noinline)) on functions you want to        |
|     inspect, otherwise the compiler may inline them away.         |
|                                                                   |
|  4. Hover over assembly instructions to see which source line     |
|     they correspond to (color-coded).                             |
|                                                                   |
|  5. Use the "Analysis" tool (opt-viewer, LLVM MCA) to see         |
|     throughput estimates for your loop.                            |
|                                                                   |
|  6. For CUDA: select nvcc as compiler. You can see PTX output.    |
|     Look for ld.global, st.global, fma.rn.f32, bar.sync.         |
|                                                                   |
|  7. Short links: save and share your Godbolt sessions.            |
|     Every performance PR should include a Godbolt link.           |
|                                                                   |
|  8. LLVM MCA (Machine Code Analyzer):                             |
|     Shows cycles per iteration, bottleneck analysis,              |
|     resource pressure per functional unit.                        |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 13.8 Version Control for HPC

### Git LFS for Large Files

GPU/HPC projects often have large binary files: model weights, datasets, test fixtures. Git LFS stores them outside the main repository.

```bash
# ---- Setup ----
git lfs install

# Track large file types
git lfs track "*.bin"         # model weights
git lfs track "*.npy"         # NumPy arrays
git lfs track "*.h5"          # HDF5 datasets
git lfs track "*.onnx"        # ONNX models
git lfs track "*.pth"         # PyTorch checkpoints
git lfs track "*.safetensors" # Safe model format

# The tracking rules are stored in .gitattributes
cat .gitattributes
# *.bin filter=lfs diff=lfs merge=lfs -text
# *.npy filter=lfs diff=lfs merge=lfs -text

# Add, commit, push as usual
git add model.bin
git commit -m "feat: add trained model checkpoint"
git push

# ---- Useful commands ----
git lfs ls-files            # list LFS-tracked files
git lfs env                 # show LFS configuration
git lfs fetch --all         # download all LFS objects
git lfs prune               # remove old local LFS objects
```

### Managing Binary Artifacts

```bash
# .gitignore for GPU/HPC projects
# Build artifacts
build/
*.o
*.cu.o
*.ptx
*.cubin
*.fatbin

# Large generated data
data/raw/
data/processed/
*.npy
*.npz
*.h5
*.hdf5

# Model checkpoints (tracked by LFS if needed)
checkpoints/
*.pth
*.onnx

# Profiling output
*.nsys-rep
*.ncu-rep
*.sqlite

# Editor/IDE
.vscode/
.idea/
*.swp
*~

# OS
.DS_Store
Thumbs.db
```

### CI/CD for GPU Code

```yaml
# .github/workflows/gpu-ci.yml
name: GPU CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ---- CPU-only tests (run on every PR) ----
  cpu-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y cmake g++ libgtest-dev

      - name: Build (CPU-only tests)
        run: |
          mkdir build && cd build
          cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_GPU=OFF
          make -j$(nproc)

      - name: Run CPU tests
        run: cd build && ctest --output-on-failure

      - name: Run sanitizers
        run: |
          cd build
          cmake .. -DCMAKE_BUILD_TYPE=Debug \
                   -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined"
          make -j$(nproc)
          ctest --output-on-failure

  # ---- GPU tests (run on self-hosted GPU runner) ----
  gpu-tests:
    runs-on: [self-hosted, gpu]  # requires self-hosted runner with GPU
    needs: cpu-tests             # only run if CPU tests pass
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true              # fetch LFS objects for test data

      - name: Check GPU
        run: nvidia-smi

      - name: Build with CUDA
        run: |
          mkdir build && cd build
          cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_GPU=ON
          make -j$(nproc)

      - name: Run GPU tests
        run: cd build && ctest --output-on-failure

      - name: Run compute-sanitizer
        run: |
          cd build
          compute-sanitizer --tool memcheck ./test_kernels
          compute-sanitizer --tool racecheck ./test_kernels

  # ---- Lint and format check ----
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check formatting
        run: |
          find src -name '*.cu' -o -name '*.cuh' -o -name '*.cpp' -o -name '*.h' \
            | xargs clang-format --dry-run --Werror

      - name: Static analysis
        run: |
          find src -name '*.cpp' -o -name '*.h' \
            | xargs clang-tidy -p build/
```

---

## 13.9 Linux Kernel Interfaces

### Hardware Information via sysfs and /proc

```bash
# ---- CPU Information ----
# Number of physical CPUs, cores, threads
lscpu

# Detailed per-core info
cat /proc/cpuinfo | head -30

# Cache sizes
lscpu -C
# or:
ls /sys/devices/system/cpu/cpu0/cache/
cat /sys/devices/system/cpu/cpu0/cache/index0/size     # L1 data cache
cat /sys/devices/system/cpu/cpu0/cache/index1/size     # L1 instruction cache
cat /sys/devices/system/cpu/cpu0/cache/index2/size     # L2 cache
cat /sys/devices/system/cpu/cpu0/cache/index3/size     # L3 cache

# CPU frequency
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq

# NUMA topology
numactl --hardware
cat /sys/devices/system/node/node0/meminfo

# ---- GPU Information ----
nvidia-smi                                    # GPU status and utilization
nvidia-smi -q                                 # detailed GPU info
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv

# GPU sysfs entries
ls /sys/class/drm/card0/device/
cat /sys/class/drm/card0/device/vendor        # PCI vendor ID
cat /sys/class/drm/card0/device/device        # PCI device ID

# ---- Memory Information ----
cat /proc/meminfo
# Key fields: MemTotal, MemFree, MemAvailable, HugePages_Total

# Transparent Huge Pages status
cat /sys/kernel/mm/transparent_hugepage/enabled

# IOMMU groups (relevant for GPU passthrough)
find /sys/kernel/iommu_groups/ -type l
```

### mmap: Memory-Mapped Files and Devices

```c
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>

/* ---- Memory-map a file for fast I/O ---- */
/* This is how databases and high-performance I/O systems work.
   The kernel handles paging data in and out. No read()/write() syscalls
   needed after the initial mmap. */

void process_large_file(const char *path) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        perror("open");
        return;
    }

    struct stat st;
    fstat(fd, &st);
    size_t file_size = (size_t)st.st_size;

    /* Map the entire file into our address space */
    void *mapped = mmap(NULL, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap");
        close(fd);
        return;
    }

    /* Advise the kernel about our access pattern */
    madvise(mapped, file_size, MADV_SEQUENTIAL);  /* we will read sequentially */

    /* Access the file as if it were memory */
    const float *data = (const float *)mapped;
    size_t n_floats = file_size / sizeof(float);

    double sum = 0.0;
    for (size_t i = 0; i < n_floats; i++) {
        sum += data[i];
    }

    printf("Sum of %zu floats: %f\n", n_floats, sum);

    /* Clean up */
    munmap(mapped, file_size);
    close(fd);
}

/* ---- Shared memory between processes ---- */
/* Used for inter-process communication in HPC, e.g., sharing
   GPU results between a compute process and a visualization process. */

void create_shared_buffer(const char *name, size_t size) {
    int fd = shm_open(name, O_CREAT | O_RDWR, 0666);
    ftruncate(fd, (off_t)size);

    void *ptr = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);

    /* Write data that other processes can read */
    float *buffer = (float *)ptr;
    for (size_t i = 0; i < size / sizeof(float); i++) {
        buffer[i] = (float)i;
    }

    /* When done: */
    munmap(ptr, size);
    shm_unlink(name);
}

/* ---- Huge pages for reduced TLB misses ---- */
/* Critical for large buffer allocations in HPC */

void *alloc_huge_pages(size_t size) {
    void *ptr = mmap(NULL, size,
                     PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);
    if (ptr == MAP_FAILED) {
        perror("mmap with huge pages");
        return NULL;
    }
    return ptr;
}
```

### CPU Affinity

```c
#define _GNU_SOURCE
#include <sched.h>
#include <pthread.h>
#include <stdio.h>

/* Pin the current thread to a specific CPU core.
   Critical for consistent performance benchmarking
   and for NUMA-aware programming. */

void pin_to_core(int core_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(core_id, &cpuset);

    int result = sched_setaffinity(0, sizeof(cpuset), &cpuset);
    if (result != 0) {
        perror("sched_setaffinity");
    }
}

/* Pin pthread to a specific core */
void pin_thread_to_core(pthread_t thread, int core_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(core_id, &cpuset);
    pthread_setaffinity_np(thread, sizeof(cpuset), &cpuset);
}

/* NUMA-aware thread placement:
   Pin compute threads to cores near the GPU's NUMA node.
   Pin memory allocation to the same NUMA node.

   Example: GPU on NUMA node 1, cores 16-31
   Pin GPU-feeding threads to cores 16-31
   Allocate staging buffers on NUMA node 1 */

void numa_aware_setup(void) {
    /* Check which NUMA node the GPU is on */
    /* cat /sys/bus/pci/devices/0000:xx:00.0/numa_node */

    /* Pin to cores on that NUMA node */
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    for (int i = 16; i <= 31; i++) {
        CPU_SET(i, &cpuset);
    }
    sched_setaffinity(0, sizeof(cpuset), &cpuset);
}
```

### io_uring for Async I/O

```c
/* io_uring provides the highest-performance I/O interface on Linux.
   It uses shared ring buffers between user space and kernel,
   minimizing syscalls. Essential for data loading pipelines that
   feed GPUs. */

#include <liburing.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define QUEUE_DEPTH 64
#define BLOCK_SIZE  (4 * 1024)  /* 4 KB blocks */

struct io_request {
    int fd;
    off_t offset;
    size_t length;
    char *buffer;
};

void read_file_io_uring(const char *path) {
    struct io_uring ring;

    /* Initialize the io_uring with QUEUE_DEPTH entries */
    if (io_uring_queue_init(QUEUE_DEPTH, &ring, 0) < 0) {
        perror("io_uring_queue_init");
        return;
    }

    int fd = open(path, O_RDONLY | O_DIRECT);
    if (fd < 0) {
        perror("open");
        io_uring_queue_exit(&ring);
        return;
    }

    /* Submit multiple read requests at once */
    for (int i = 0; i < QUEUE_DEPTH; i++) {
        struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);

        /* Allocate aligned buffer (required for O_DIRECT) */
        char *buf = NULL;
        posix_memalign((void **)&buf, 4096, BLOCK_SIZE);

        io_uring_prep_read(sqe, fd, buf, BLOCK_SIZE, i * BLOCK_SIZE);
        io_uring_sqe_set_data(sqe, buf);
    }

    /* Submit all requests to kernel in one syscall */
    io_uring_submit(&ring);

    /* Reap completions */
    for (int i = 0; i < QUEUE_DEPTH; i++) {
        struct io_uring_cqe *cqe;
        io_uring_wait_cqe(&ring, &cqe);

        if (cqe->res < 0) {
            fprintf(stderr, "Read failed: %s\n", strerror(-cqe->res));
        } else {
            char *buf = io_uring_cqe_get_data(cqe);
            /* Process the data in buf... */
            free(buf);
        }

        io_uring_cqe_seen(&ring, cqe);
    }

    close(fd);
    io_uring_queue_exit(&ring);
}
```

### cgroups for Resource Isolation

```bash
# cgroups v2: isolate CPU, memory, and device access for GPU workloads

# ---- Create a cgroup for a GPU training job ----
sudo mkdir -p /sys/fs/cgroup/gpu-training

# Limit to CPUs 0-15 (one NUMA node)
echo "0-15" | sudo tee /sys/fs/cgroup/gpu-training/cpuset.cpus

# Limit memory to 64 GB
echo $((64 * 1024 * 1024 * 1024)) | sudo tee /sys/fs/cgroup/gpu-training/memory.max

# Limit CPU to 80% (800000 out of 1000000)
echo "800000 1000000" | sudo tee /sys/fs/cgroup/gpu-training/cpu.max

# Run a process inside the cgroup
sudo sh -c 'echo $$ > /sys/fs/cgroup/gpu-training/cgroup.procs'

# ---- Monitor resource usage ----
cat /sys/fs/cgroup/gpu-training/cpu.stat
cat /sys/fs/cgroup/gpu-training/memory.current
cat /sys/fs/cgroup/gpu-training/memory.peak

# ---- NVIDIA GPU isolation via cgroups ----
# Use nvidia-container-runtime or set CUDA_VISIBLE_DEVICES
export CUDA_VISIBLE_DEVICES=0,1   # only see GPUs 0 and 1

# For Docker:
# docker run --gpus '"device=0,1"' --cpuset-cpus 0-15 --memory 64g my-training-image
```

---

## 13.10 Debugging and Sanitizers

### AddressSanitizer (ASan)

Detects buffer overflows, use-after-free, double-free, memory leaks. Approximately 2x slowdown.

```bash
# Compile with ASan
gcc -O1 -g -fsanitize=address -fno-omit-frame-pointer mycode.c -o mycode
# Or with CMake:
# cmake .. -DCMAKE_CXX_FLAGS="-fsanitize=address -fno-omit-frame-pointer"

# Run - ASan will print detailed error reports on violations
./mycode
```

```c
/* Example: ASan catches this buffer overflow */
#include <stdlib.h>

void asan_demo(void) {
    int *arr = (int *)malloc(10 * sizeof(int));

    /* Heap buffer overflow: ASan reports:
       ERROR: AddressSanitizer: heap-buffer-overflow on address 0x...
       WRITE of size 4 at 0x... thread T0
       #0 asan_demo mycode.c:7
       allocated by thread T0 here:
       #0 malloc ...
       #1 asan_demo mycode.c:5 */
    arr[10] = 42;   /* off by one! */

    free(arr);

    /* Use after free: ASan reports:
       ERROR: AddressSanitizer: heap-use-after-free */
    /* arr[0] = 1;  // would be caught */
}
```

### ThreadSanitizer (TSan)

Detects data races in multi-threaded code. Approximately 5-15x slowdown.

```bash
# Compile with TSan
gcc -O1 -g -fsanitize=thread mycode.c -lpthread -o mycode
./mycode
```

```c
/* Example: TSan catches this data race */
#include <pthread.h>

int shared_counter = 0;  /* unprotected shared state */

void *increment(void *arg) {
    (void)arg;
    for (int i = 0; i < 100000; i++) {
        shared_counter++;  /* DATA RACE: no synchronization */
    }
    return NULL;
}

/* TSan output:
   WARNING: ThreadSanitizer: data race (pid=12345)
     Write of size 4 at 0x... by thread T2:
       #0 increment mycode.c:9
     Previous write of size 4 at 0x... by thread T1:
       #0 increment mycode.c:9 */
```

### UndefinedBehaviorSanitizer (UBSan)

Catches undefined behavior: signed overflow, null dereference, alignment violations, shift errors.

```bash
gcc -O1 -g -fsanitize=undefined mycode.c -o mycode
./mycode
```

```c
/* Examples of UB that UBSan catches */
#include <limits.h>

void ubsan_demo(void) {
    /* Signed integer overflow (undefined in C!) */
    int x = INT_MAX;
    int y = x + 1;  /* UBSan: signed integer overflow: 2147483647 + 1 */

    /* Shift by too many bits */
    int z = 1 << 33;  /* UBSan: shift exponent 33 is too large for 32-bit type */

    /* Division by zero */
    int a = 42;
    int b = 0;
    /* int c = a / b; */  /* UBSan: division by zero */

    /* Null dereference */
    int *p = NULL;
    /* int v = *p; */  /* UBSan: null pointer dereference */

    (void)y; (void)z;
}
```

### MemorySanitizer (MSan)

Detects reads of uninitialized memory. Only available with Clang.

```bash
clang -O1 -g -fsanitize=memory -fno-omit-frame-pointer mycode.c -o mycode
./mycode
```

```c
#include <stdlib.h>

void msan_demo(void) {
    int *arr = (int *)malloc(10 * sizeof(int));
    /* arr is allocated but NOT initialized */

    /* MSan catches the use of uninitialized memory:
       WARNING: MemorySanitizer: use-of-uninitialized-value */
    if (arr[5] > 0) {
        /* This branch depends on uninitialized data */
    }

    free(arr);
}
```

### GDB and LLDB for GPU Debugging

```bash
# ---- GDB basics ----
gdb ./myprogram

# Common commands:
# break main           - set breakpoint at main
# break myfile.c:42    - set breakpoint at line 42
# run                  - start the program
# next (n)             - step over
# step (s)             - step into
# continue (c)         - continue to next breakpoint
# print var            - print variable value
# print *array@10      - print first 10 elements of array
# info threads         - list all threads
# thread 3             - switch to thread 3
# bt                   - backtrace (call stack)
# watch var            - break when var changes (hardware watchpoint)

# ---- CUDA debugging ----
# Use cuda-gdb for debugging GPU kernels
cuda-gdb ./my_cuda_program

# CUDA-specific commands:
# info cuda threads    - list CUDA threads
# info cuda blocks     - list CUDA blocks
# cuda thread (0,0,0)  - switch to specific thread
# cuda block (2,0,0)   - switch to specific block
# print threadIdx.x    - print thread index
# print blockIdx.x     - print block index
# print @shared        - print shared memory
# print @local         - print local memory

# ---- CUDA compute-sanitizer (replaces cuda-memcheck) ----
# Detect memory errors in CUDA kernels
compute-sanitizer --tool memcheck ./my_cuda_program

# Detect race conditions in CUDA kernels
compute-sanitizer --tool racecheck ./my_cuda_program

# Detect synchronization errors
compute-sanitizer --tool synccheck ./my_cuda_program

# Detect uninitialized memory access
compute-sanitizer --tool initcheck ./my_cuda_program
```

### strace and ltrace

```bash
# ---- strace: trace system calls ----
# See every syscall your program makes (I/O, memory, signals)

# Basic usage
strace ./myprogram

# Filter to specific syscalls
strace -e trace=read,write,mmap,munmap ./myprogram

# Count syscalls (performance analysis)
strace -c ./myprogram

# Trace a running process
strace -p 12345

# Follow child processes
strace -f ./myprogram

# Example output for a program that loads data:
# mmap(NULL, 1073741824, PROT_READ, MAP_PRIVATE, 3, 0) = 0x7f4000000000
# read(4, "\x00\x00\x80\x3f\x00\x00\x00\x40"..., 4096) = 4096

# ---- ltrace: trace library calls ----
# See calls to shared libraries (libc, CUDA runtime, etc.)
ltrace ./myprogram

# Filter to specific libraries
ltrace -e "cudaMalloc+cudaMemcpy+cudaFree" ./my_cuda_program

# Example output:
# cudaMalloc(0x7ffc1234, 4194304) = 0
# cudaMemcpy(0x7f0001000000, 0x55ab1234, 4194304, 1) = 0
# cudaFree(0x7f0001000000) = 0
```

### Combining Sanitizers: A Practical Workflow

```bash
# Step 1: Build with ASan + UBSan (can be combined)
gcc -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer \
    src/*.c -o build/debug_asan -lm

# Step 2: Run tests - fix all ASan/UBSan errors
./build/debug_asan

# Step 3: Build with TSan (cannot combine with ASan)
gcc -O1 -g -fsanitize=thread -fno-omit-frame-pointer \
    src/*.c -o build/debug_tsan -lpthread -lm

# Step 4: Run multi-threaded tests - fix all data races
./build/debug_tsan

# Step 5: Build with MSan (Clang only, cannot combine with others)
clang -O1 -g -fsanitize=memory -fno-omit-frame-pointer \
    src/*.c -o build/debug_msan -lm

# Step 6: Run tests - fix all uninitialized memory reads
./build/debug_msan

# Step 7: Run Valgrind for extra coverage
valgrind --tool=memcheck --leak-check=full ./build/release

# Step 8: GPU-specific checking
compute-sanitizer --tool memcheck ./build/gpu_program
compute-sanitizer --tool racecheck ./build/gpu_program

# NOTE: Always fix sanitizer errors before optimizing.
# An "optimized" program with undefined behavior is broken, not fast.
```

---

## 13.11 Documentation and Learning Resources

### NVIDIA Documentation

```
+-------------------------------------------------------------------+
|  NVIDIA DOCUMENTATION HIERARCHY                                    |
+-------------------------------------------------------------------+
|                                                                   |
|  CUDA Programming Guide (START HERE)                              |
|    https://docs.nvidia.com/cuda/cuda-c-programming-guide/         |
|    - Thread hierarchy, memory model, synchronization              |
|    - Hardware architecture details                                |
|    - Performance guidelines                                       |
|                                                                   |
|  CUDA Best Practices Guide                                        |
|    https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/      |
|    - Memory optimization                                          |
|    - Execution configuration                                      |
|    - Instruction optimization                                     |
|                                                                   |
|  PTX ISA Reference                                                |
|    https://docs.nvidia.com/cuda/parallel-thread-execution/        |
|    - The "assembly language" of NVIDIA GPUs                       |
|    - Every instruction documented                                 |
|                                                                   |
|  Nsight Compute Documentation                                     |
|    https://docs.nvidia.com/nsight-compute/                        |
|    - Kernel profiling and analysis                                |
|    - Performance metrics explained                                |
|                                                                   |
|  cuBLAS / cuDNN / cuFFT / cuSPARSE                               |
|    https://docs.nvidia.com/cuda/cublas/                           |
|    - Library-specific API references                              |
|    - Performance tuning guides                                    |
|                                                                   |
|  CUDA Samples                                                     |
|    https://github.com/NVIDIA/cuda-samples                        |
|    - Official code examples for every CUDA feature                |
|                                                                   |
+-------------------------------------------------------------------+
```

### Intel Documentation

```
+-------------------------------------------------------------------+
|  INTEL RESOURCES                                                   |
+-------------------------------------------------------------------+
|                                                                   |
|  Intel Intrinsics Guide (ESSENTIAL)                               |
|    https://www.intel.com/content/www/us/en/docs/                  |
|           intrinsics-guide/                                       |
|    - Every SSE/AVX/AVX-512 intrinsic documented                  |
|    - Searchable, filterable, with latency/throughput data         |
|    - This is the #1 reference for SIMD programming               |
|                                                                   |
|  Intel 64 and IA-32 Architectures Optimization Manual             |
|    - Micro-architecture details                                   |
|    - Cache behavior, branch prediction                            |
|    - Code optimization techniques                                 |
|                                                                   |
|  Intel oneAPI Documentation                                       |
|    - DPC++ (SYCL) programming guide                              |
|    - oneMKL, oneDNN                                               |
|    - VTune Profiler user guide                                    |
|                                                                   |
+-------------------------------------------------------------------+
```

### Agner Fog's Optimization Manuals

```
+-------------------------------------------------------------------+
|  AGNER FOG'S MANUALS (https://www.agner.org/optimize/)            |
+-------------------------------------------------------------------+
|                                                                   |
|  These are the definitive references for x86 optimization.        |
|  Free PDFs, updated regularly.                                    |
|                                                                   |
|  1. "Optimizing software in C++"                                  |
|     - General optimization techniques                             |
|     - Cache optimization, branch prediction                       |
|     - Multi-threading considerations                              |
|     - 170+ pages of practical advice                              |
|                                                                   |
|  2. "Optimizing subroutines in assembly language"                 |
|     - x86-64 assembly optimization                                |
|     - Register usage, instruction scheduling                      |
|     - SIMD programming                                            |
|                                                                   |
|  3. "The microarchitecture of Intel, AMD and VIA CPUs"           |
|     - Pipeline details for every CPU generation                   |
|     - Execution unit throughput and latency                       |
|     - Branch prediction algorithms                                |
|     - Covers: Alder Lake, Zen 4, Gracemont, etc.                 |
|                                                                   |
|  4. "Instruction tables"                                          |
|     - Latency and throughput for EVERY x86 instruction           |
|     - For EVERY CPU micro-architecture                            |
|     - The definitive reference for instruction scheduling         |
|                                                                   |
|  5. "Calling conventions"                                         |
|     - How functions are called on different platforms             |
|     - Register usage, stack layout, parameter passing             |
|                                                                   |
+-------------------------------------------------------------------+
```

### Compiler Documentation

```
+-------------------------------------------------------------------+
|  COMPILER REFERENCES                                               |
+-------------------------------------------------------------------+
|                                                                   |
|  GCC Optimization Options                                         |
|    https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html       |
|    - Every -O flag explained                                      |
|    - -ftree-vectorize, -funroll-loops, -ffast-math                |
|    - Architecture-specific: -march, -mtune, -mavx2               |
|                                                                   |
|  Clang/LLVM Documentation                                         |
|    https://clang.llvm.org/docs/                                   |
|    - Sanitizer documentation                                      |
|    - Optimization reports (-Rpass, -Rpass-missed)                 |
|    - Auto-vectorization guide                                     |
|                                                                   |
|  NVCC Documentation                                               |
|    https://docs.nvidia.com/cuda/cuda-compiler-driver-nvcc/        |
|    - All nvcc flags                                               |
|    - Separate compilation model                                   |
|    - PTX and cubin generation                                     |
|                                                                   |
|  Clang Vectorization Report:                                      |
|    clang -O3 -Rpass=loop-vectorize \                              |
|          -Rpass-missed=loop-vectorize \                            |
|          -Rpass-analysis=loop-vectorize mycode.c                  |
|                                                                   |
|  GCC Vectorization Report:                                        |
|    gcc -O3 -fopt-info-vec-optimized -fopt-info-vec-missed mycode.c|
|                                                                   |
+-------------------------------------------------------------------+
```

### Essential Books

```
+-------------------------------------------------------------------+
|  RECOMMENDED READING                                               |
+-------------------------------------------------------------------+
|                                                                   |
|  CPU / Systems:                                                   |
|  - "Computer Architecture: A Quantitative Approach"              |
|    (Hennessy & Patterson) - the definitive architecture text      |
|  - "Computer Systems: A Programmer's Perspective" (CS:APP)        |
|    (Bryant & O'Hallaron) - systems programming bible              |
|  - "The Art of Multiprocessor Programming"                        |
|    (Herlihy & Shavit) - concurrent data structures               |
|                                                                   |
|  GPU:                                                             |
|  - "Programming Massively Parallel Processors"                    |
|    (Hwu, Kirk, El Hajj) - the standard CUDA textbook             |
|  - "CUDA by Example" (Sanders & Kandrot) - beginner friendly      |
|  - "Professional CUDA C Programming" (Cheng, Grossman, McKercher)|
|                                                                   |
|  Performance:                                                     |
|  - "Performance Analysis and Tuning on Modern CPUs"              |
|    (Denis Bakhvalov) - modern CPU performance engineering         |
|  - "Algorithms for Modern Hardware" (Sergey Slotin)              |
|    https://en.algorithmica.org/hpc/ - free online                 |
|  - "What Every Programmer Should Know About Memory"              |
|    (Ulrich Drepper) - the memory hierarchy paper                  |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## Recommended Setup

This section describes a practical development environment for CPU/GPU programming.

### Hardware

```
+-------------------------------------------------------------------+
|  RECOMMENDED DEVELOPMENT HARDWARE                                  |
+-------------------------------------------------------------------+
|                                                                   |
|  MINIMUM:                                                         |
|  - CPU: 8+ core modern x86-64 (Ryzen 5000+ or Intel 12th gen+)  |
|  - RAM: 32 GB                                                     |
|  - GPU: NVIDIA RTX 3060+ (8 GB VRAM, compute capability 8.6)    |
|  - Storage: NVMe SSD (1 TB+)                                     |
|                                                                   |
|  RECOMMENDED:                                                     |
|  - CPU: 16+ core (Ryzen 9 or Intel i9)                           |
|  - RAM: 64 GB                                                     |
|  - GPU: NVIDIA RTX 4080/4090 (16 GB VRAM, compute cap 8.9)      |
|  - Storage: 2 TB NVMe                                             |
|                                                                   |
|  CLOUD ALTERNATIVE:                                                |
|  - Lambda Labs: A100/H100 instances                               |
|  - AWS: p4d.24xlarge (8x A100)                                   |
|  - Google Cloud: a2-highgpu-1g (1x A100)                         |
|  - Vast.ai: cheap spot instances with various GPUs               |
|                                                                   |
+-------------------------------------------------------------------+
```

### Software Stack

```bash
# ---- Operating System ----
# Ubuntu 22.04 LTS or 24.04 LTS (best NVIDIA driver support)
# Alternatively: Fedora, Arch Linux, or WSL2 on Windows

# ---- NVIDIA Driver + CUDA Toolkit ----
# Install via the official NVIDIA package repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get install cuda-toolkit-12-4

# Verify installation
nvcc --version
nvidia-smi

# ---- Compilers ----
sudo apt-get install gcc-13 g++-13 clang-18 lldb-18

# ---- Build Tools ----
sudo apt-get install cmake ninja-build ccache

# ---- Debugging and Analysis ----
sudo apt-get install gdb valgrind linux-tools-generic  # perf
pip install gpustat   # quick GPU monitoring

# ---- Python GPU Stack ----
pip install numpy cupy-cuda12x numba pycuda
pip install torch torchvision torchaudio  # PyTorch

# ---- Rust (for safe parallelism) ----
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install rayon

# ---- Profiling ----
# Nsight Systems and Nsight Compute come with CUDA Toolkit
nsys --version
ncu --version
```

### Editor Configuration

```bash
# ---- VS Code Extensions for GPU Development ----
# - C/C++ (Microsoft)
# - CUDA C++ (NVIDIA) - syntax highlighting for .cu files
# - CMake Tools
# - clangd - fast C++ language server
# - CodeLLDB - LLDB debugger integration
# - Nsight Visual Studio Code Edition (NVIDIA)

# ---- .clangd configuration for CUDA ----
# Create .clangd in project root:
cat > .clangd << 'CLANGD_EOF'
CompileFlags:
  Add:
    - --cuda-gpu-arch=sm_86
    - -x
    - cuda
  Remove:
    - -forward-unknown-to-host-compiler
    - --generate-code*

Diagnostics:
  Suppress:
    - pp_including_mainfile_in_preamble
CLANGD_EOF

# ---- compile_commands.json for IDE integration ----
# Generate with CMake:
cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
ln -s build/compile_commands.json .
```

### Project Template

```bash
# ---- Recommended project structure ----
my-gpu-project/
├── CMakeLists.txt            # top-level build configuration
├── .clangd                   # clangd configuration
├── .clang-format             # code formatting rules
├── .gitignore                # ignore build artifacts
├── .gitattributes            # LFS tracking rules
├── src/
│   ├── main.cpp              # entry point
│   ├── kernels/
│   │   ├── matmul.cu         # CUDA kernel implementations
│   │   ├── matmul.cuh        # kernel declarations
│   │   ├── reduction.cu
│   │   └── reduction.cuh
│   ├── host/
│   │   ├── benchmark.cpp     # benchmarking harness
│   │   ├── benchmark.h
│   │   ├── utils.cpp         # host utility functions
│   │   └── utils.h
│   └── common/
│       ├── cuda_check.cuh    # CUDA error checking macros
│       └── types.h           # shared type definitions
├── tests/
│   ├── test_matmul.cu        # kernel unit tests
│   ├── test_reduction.cu
│   └── test_main.cpp         # test runner
├── benchmarks/
│   ├── bench_matmul.cu       # performance benchmarks
│   └── bench_reduction.cu
├── scripts/
│   ├── profile.sh            # profiling automation
│   └── benchmark.sh          # benchmark runner
└── third_party/              # external dependencies
    └── googletest/
```

### Essential Shell Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc

# GPU monitoring
alias gstat='nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv,noheader'
alias gwatch='watch -n1 nvidia-smi'

# Quick build
alias cmk='cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON && cmake --build build -j$(nproc)'
alias cmkd='cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON && cmake --build build -j$(nproc)'

# Sanitizer builds
alias asan-build='cmake -B build-asan -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer" && cmake --build build-asan -j$(nproc)'
alias tsan-build='cmake -B build-tsan -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="-fsanitize=thread" && cmake --build build-tsan -j$(nproc)'

# Profiling
alias nsys-profile='nsys profile --stats=true -o report'
alias ncu-profile='ncu --set full -o report'

# Perf
alias perf-stat='perf stat -e cycles,instructions,cache-misses,cache-references,branches,branch-misses'
alias perf-record='perf record -g'

# Assembly output
alias godbolt='gcc -O3 -march=native -S -fverbose-asm'
```

---

## Essential Bookmarks

Save these links. You will reference them constantly.

```
+===================================================================+
|                    ESSENTIAL BOOKMARKS                             |
+===================================================================+

DAILY USE:
  Compiler Explorer (Godbolt)     https://godbolt.org
  Intel Intrinsics Guide          https://www.intel.com/content/www/us/en/docs/intrinsics-guide/
  CUDA Programming Guide          https://docs.nvidia.com/cuda/cuda-c-programming-guide/
  cppreference.com                https://en.cppreference.com/
  Rust std docs                   https://doc.rust-lang.org/std/

OPTIMIZATION:
  Agner Fog's manuals             https://www.agner.org/optimize/
  Algorithmica (free HPC book)    https://en.algorithmica.org/hpc/
  What Every Programmer Should    https://people.freebsd.org/~lstewart/articles/cpumemory.pdf
    Know About Memory
  CUDA Best Practices             https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/
  Performance Analysis (Bakhvalov) https://book.easyperf.net/perf_book

REFERENCES:
  x86-64 instruction set          https://www.felixcloutier.com/x86/
  NVIDIA PTX ISA                  https://docs.nvidia.com/cuda/parallel-thread-execution/
  System V ABI (calling conv.)    https://wiki.osdev.org/System_V_ABI
  Linux kernel docs               https://www.kernel.org/doc/html/latest/

PROFILING:
  Nsight Compute docs             https://docs.nvidia.com/nsight-compute/
  Nsight Systems docs             https://docs.nvidia.com/nsight-systems/
  Linux perf wiki                 https://perf.wiki.kernel.org/
  Tracy profiler                  https://github.com/wolfpld/tracy

CODE & EXAMPLES:
  CUDA Samples                    https://github.com/NVIDIA/cuda-samples
  CUB library                     https://github.com/NVIDIA/cub
  Thrust library                  https://github.com/NVIDIA/thrust
  CUTLASS (GEMM templates)        https://github.com/NVIDIA/cutlass

COMMUNITY:
  NVIDIA Developer Forums         https://forums.developer.nvidia.com/
  r/CUDA                          https://reddit.com/r/CUDA
  r/HPC                           https://reddit.com/r/HPC
  GPU Mode Discord                https://discord.gg/gpumode

+===================================================================+
```

---

## Summary

This chapter covered the essential tools and languages for CPU/GPU programming:

| Topic | Key Takeaway |
|---|---|
| **C** | Still the foundation. Master pointers, volatile, restrict, aligned allocation. |
| **C++** | Use modern features (constexpr, move semantics, parallel algorithms) for zero-cost abstractions. |
| **Rust** | Ownership model eliminates data races at compile time. Rayon makes parallelism trivial. |
| **Assembly** | Read it, rarely write it. Use Godbolt to verify compiler output. |
| **Python** | Glue language. NumPy/CuPy/Numba for rapid prototyping. Never write hot loops in Python. |
| **Build Systems** | CMake is standard. Know your nvcc flags and compute capability targets. |
| **Godbolt** | Your best friend for understanding what the compiler does. Use it daily. |
| **Git/CI** | Git LFS for large files. Run sanitizers and GPU tests in CI. |
| **Linux Interfaces** | mmap, CPU affinity, io_uring, cgroups -- the kernel is your partner. |
| **Sanitizers** | ASan, TSan, UBSan, MSan. Run them before optimizing. Fix UB first. |
| **Documentation** | NVIDIA docs, Intel Intrinsics Guide, Agner Fog. Bookmark them now. |

The tools do not make you productive by themselves. Consistent practice does. Set up your environment, write code, profile it, read the assembly, fix the bugs, and repeat.

---

*Next chapter: [Chapter 14 - Real-World Case Studies](./14-CASE-STUDIES.md) -- Putting everything together with production GPU code.*