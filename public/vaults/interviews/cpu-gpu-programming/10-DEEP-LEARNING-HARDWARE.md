# Chapter 10: Deep Learning Hardware — From Tensor Cores to Full-Stack Inference

## Table of Contents

1. [Tensor Cores](#1-tensor-cores)
2. [Mixed Precision Training](#2-mixed-precision-training)
3. [Custom CUDA Kernels for Deep Learning](#3-custom-cuda-kernels-for-deep-learning)
4. [FlashAttention Explained](#4-flashattention-explained)
5. [Quantization](#5-quantization)
6. [Triton Compiler](#6-triton-compiler)
7. [cuDNN and cuBLAS](#7-cudnn-and-cublas)
8. [Custom Hardware for AI](#8-custom-hardware-for-ai)
9. [Inference Optimization](#9-inference-optimization)
10. [The Full Stack](#10-the-full-stack)
11. [DL Hardware Timeline](#dl-hardware-timeline)
12. [Interview Questions](#interview-questions)

---

## 1. Tensor Cores

### What Are Tensor Cores?

Tensor Cores are specialized hardware units inside NVIDIA GPUs designed for one specific operation: **matrix multiply-accumulate (MMA)**. While regular CUDA cores execute scalar floating-point instructions one at a time, a single Tensor Core performs a small matrix multiplication in a single clock cycle.

```
Standard CUDA Core (1 cycle):
  d = a * b + c        // scalar: 1 FMA = 2 FLOP

Tensor Core (1 cycle):
  D[4x4] = A[4x4] * B[4x4] + C[4x4]   // matrix: 128 FMA = 256 FLOP
```

The fundamental Tensor Core operation is:

```
D = A x B + C

Where:
  A is an M x K matrix
  B is a K x N matrix
  C is an M x N matrix (accumulator input)
  D is an M x N matrix (accumulator output)
```

### Tensor Core Generations

```
Generation     | GPU           | Shapes         | Data Types
---------------|---------------|----------------|---------------------------
Volta (2017)   | V100          | 4x4x4          | FP16 -> FP32
Turing (2018)  | RTX 2080      | 4x4x4          | FP16, INT8, INT4
Ampere (2020)  | A100          | Various         | FP16, BF16, TF32, INT8, FP64
Hopper (2022)  | H100          | Various         | FP16, BF16, TF32, FP8, INT8
Blackwell(2024)| B200          | Various         | FP16, BF16, TF32, FP8, FP4
```

### How Tensor Cores Work at the Warp Level

Tensor Cores operate cooperatively across an entire **warp** (32 threads). Each thread in the warp holds a fragment of the input matrices. The hardware combines these fragments, performs the matrix multiply, and distributes the result fragments back to the threads.

```
Warp of 32 threads
  |
  |-- Thread 0 holds fragment of A, B, C
  |-- Thread 1 holds fragment of A, B, C
  |-- ...
  |-- Thread 31 holds fragment of A, B, C
  |
  v
  Tensor Core executes: D = A * B + C
  |
  |-- Thread 0 receives fragment of D
  |-- Thread 1 receives fragment of D
  |-- ...
  |-- Thread 31 receives fragment of D
```

### The WMMA API (Warp Matrix Multiply Accumulate)

NVIDIA provides the `nvcuda::wmma` API to program Tensor Cores from CUDA C++. The API works with **fragments** -- opaque data structures that represent portions of matrices distributed across a warp.

```cpp
#include <mma.h>
using namespace nvcuda;

// Tile dimensions for WMMA
// M, N, K must match supported shapes
// Ampere supports: 16x16x16, 32x8x16, 8x32x16 for FP16
const int WMMA_M = 16;
const int WMMA_N = 16;
const int WMMA_K = 16;

__global__ void wmma_gemm_kernel(
    const half* __restrict__ A,    // M x K matrix in FP16
    const half* __restrict__ B,    // K x N matrix in FP16
    float*      __restrict__ C,    // M x N matrix in FP32
    int M, int N, int K
) {
    // Each warp computes one 16x16 output tile
    int warpM = (blockIdx.x * blockDim.x + threadIdx.x) / warpSize;
    int warpN = blockIdx.y;

    // Bounds check
    if (warpM * WMMA_M >= M || warpN * WMMA_N >= N) return;

    // Declare fragments
    wmma::fragment<wmma::matrix_a, WMMA_M, WMMA_N, WMMA_K, half, wmma::row_major> a_frag;
    wmma::fragment<wmma::matrix_b, WMMA_M, WMMA_N, WMMA_K, half, wmma::row_major> b_frag;
    wmma::fragment<wmma::accumulator, WMMA_M, WMMA_N, WMMA_K, float> c_frag;

    // Initialize accumulator to zero
    wmma::fill_fragment(c_frag, 0.0f);

    // Loop over K dimension in steps of WMMA_K
    for (int k = 0; k < K; k += WMMA_K) {
        int aRow = warpM * WMMA_M;
        int aCol = k;
        int bRow = k;
        int bCol = warpN * WMMA_N;

        // Bounds check for K dimension
        if (aCol + WMMA_K > K || bRow + WMMA_K > K) break;

        // Load matrix fragments from global memory
        // Leading dimension = number of columns for row-major
        wmma::load_matrix_sync(a_frag, A + aRow * K + aCol, K);
        wmma::load_matrix_sync(b_frag, B + bRow * N + bCol, N);

        // Perform the matrix multiply-accumulate: c_frag += a_frag * b_frag
        wmma::mma_sync(c_frag, a_frag, b_frag, c_frag);
    }

    // Store the result back to global memory
    int cRow = warpM * WMMA_M;
    int cCol = warpN * WMMA_N;
    wmma::store_matrix_sync(C + cRow * N + cCol, c_frag, N, wmma::mem_row_major);
}

// Host launcher
void launch_wmma_gemm(const half* A, const half* B, float* C,
                      int M, int N, int K) {
    // Each block has multiple warps, each warp handles one 16x16 tile
    // 128 threads = 4 warps per block
    dim3 block(128);
    dim3 grid(
        (M + WMMA_M * 4 - 1) / (WMMA_M * 4),  // 4 warps per block along M
        (N + WMMA_N - 1) / WMMA_N                // 1 warp per block along N
    );

    wmma_gemm_kernel<<<grid, block>>>(A, B, C, M, N, K);
}
```

### WMMA Fragment Lifecycle

```
1. DECLARE:   wmma::fragment<...> frag;
                 |
2. FILL/LOAD: wmma::fill_fragment(frag, value)
              wmma::load_matrix_sync(frag, ptr, ld)
                 |
3. COMPUTE:   wmma::mma_sync(d_frag, a_frag, b_frag, c_frag)
                 |
4. STORE:     wmma::store_matrix_sync(ptr, frag, ld, layout)
```

### Supported Data Types by Architecture

```
Operation               | Volta | Turing | Ampere | Hopper | Blackwell
------------------------|-------|--------|--------|--------|----------
FP16 x FP16 -> FP16    |  Yes  |  Yes   |  Yes   |  Yes   |   Yes
FP16 x FP16 -> FP32    |  Yes  |  Yes   |  Yes   |  Yes   |   Yes
BF16 x BF16 -> FP32    |       |        |  Yes   |  Yes   |   Yes
TF32 x TF32 -> FP32    |       |        |  Yes   |  Yes   |   Yes
INT8 x INT8 -> INT32   |       |  Yes   |  Yes   |  Yes   |   Yes
INT4 x INT4 -> INT32   |       |  Yes   |  Yes   |  Yes   |   Yes
FP8 x FP8 -> FP16/FP32 |       |        |        |  Yes   |   Yes
FP64 x FP64 -> FP64    |       |        |  Yes   |  Yes   |   Yes
FP4 x FP4 -> FP16/FP32 |       |        |        |        |   Yes
```

### Performance Numbers

On an A100 GPU:

- FP32 (CUDA Cores): **19.5 TFLOPS**
- TF32 (Tensor Cores): **156 TFLOPS** (8x speedup)
- FP16 (Tensor Cores): **312 TFLOPS** (16x speedup)
- INT8 (Tensor Cores): **624 TOPS** (32x speedup)

On an H100 GPU:

- FP32 (CUDA Cores): **67 TFLOPS**
- TF32 (Tensor Cores): **989 TFLOPS**
- FP16 (Tensor Cores): **1979 TFLOPS**
- FP8 (Tensor Cores): **3958 TFLOPS**

### PTX-Level Tensor Core Instructions

Under the hood, WMMA compiles to PTX `mma` instructions:

```
// PTX for 16x16x16 FP16 Tensor Core MMA
mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32
    {%d0, %d1, %d2, %d3},       // D accumulator (FP32)
    {%a0, %a1, %a2, %a3},       // A operand (FP16)
    {%b0, %b1},                  // B operand (FP16)
    {%c0, %c1, %c2, %c3};       // C accumulator (FP32)
```

Hopper introduces the **wgmma** (Warp Group MMA) instruction that operates across an entire **warp group** (4 warps = 128 threads) for even larger tile sizes:

```
// Hopper wgmma: 64x256x16 tile
wgmma.mma_async.sync.aligned.m64n256k16.f32.f16.f16
```

---

## 2. Mixed Precision Training

### The Numerical Format Landscape

Deep learning has driven an explosion of numerical formats optimized for the speed-vs-accuracy tradeoff:

```
Format   | Sign | Exponent | Mantissa | Range           | Precision
---------|------|----------|----------|-----------------|----------
FP32     |  1   |    8     |   23     | ~3.4e38         | ~7 digits
TF32     |  1   |    8     |   10     | ~3.4e38         | ~3 digits
BF16     |  1   |    8     |    7     | ~3.4e38         | ~2 digits
FP16     |  1   |    5     |   10     | ~6.5e4          | ~3 digits
FP8 E4M3 |  1   |    4     |    3     | ~240            | ~1 digit
FP8 E5M2 |  1   |    5     |    2     | ~5.7e4          | ~0.5 digit
INT8     |  1   |    -     |    7     | -128 to 127     | exact
```

### Bit Layout Comparison

```
FP32:  [S][EEEEEEEE][MMMMMMMMMMMMMMMMMMMMMMM]
        1     8                 23              = 32 bits

TF32:  [S][EEEEEEEE][MMMMMMMMMM]
        1     8          10                     = 19 bits (stored in 32-bit)

BF16:  [S][EEEEEEEE][MMMMMMM]
        1     8         7                       = 16 bits

FP16:  [S][EEEEE][MMMMMMMMMM]
        1    5        10                        = 16 bits

Key insight:
  - BF16 has same RANGE as FP32 (8 exponent bits) but less precision
  - FP16 has more PRECISION than BF16 but much smaller range
  - TF32 is the sweet spot: FP32 range + reasonable precision
```

### Why Mixed Precision Works

Neural network training is surprisingly tolerant of reduced precision because:

1. **Gradients are noisy** -- SGD with mini-batches already introduces noise far larger than rounding errors
2. **Weights change slowly** -- small rounding errors wash out over thousands of steps
3. **Activations are bounded** -- normalization layers (BatchNorm, LayerNorm) keep values in a reasonable range

### The Mixed Precision Training Recipe

The standard approach (introduced by Micikevicius et al., 2018):

```
Master Weights (FP32)
       |
       |  copy to FP16
       v
  FP16 Weights -----> Forward Pass (FP16) -----> FP16 Loss
                                                      |
                                                      | loss scaling
                                                      v
                                              Scaled FP16 Loss
                                                      |
                                                      | backward pass (FP16)
                                                      v
                                              FP16 Gradients
                                                      |
                                                      | unscale gradients
                                                      v
                                              FP32 Gradients
                                                      |
                                                      | optimizer step
                                                      v
                                              Updated FP32 Master Weights
```

### Loss Scaling: Why and How

FP16 can represent values down to ~6e-8. Many gradient values are smaller and become zero ("underflow"). Loss scaling shifts the gradient distribution into FP16's representable range.

```
Without loss scaling:
  Gradient histogram:  [many values below 6e-8 -> all become 0.0]

With loss scaling (scale = 1024):
  1. Multiply loss by 1024 before backward pass
  2. All gradients are 1024x larger -> within FP16 range
  3. After backward pass, divide gradients by 1024
  4. Net effect: same gradients, but no underflow
```

**Dynamic loss scaling** adjusts the scale factor automatically:

```python
# Pseudocode for dynamic loss scaling
scale = 65536.0  # initial scale
growth_interval = 2000
growth_factor = 2.0
backoff_factor = 0.5
steps_since_growth = 0

for batch in dataloader:
    optimizer.zero_grad()

    # Forward in FP16
    with autocast():
        output = model(batch)
        loss = criterion(output, target)

    # Backward with scaled loss
    scaled_loss = loss * scale
    scaled_loss.backward()

    # Check for inf/nan in gradients
    if has_inf_or_nan(model.parameters()):
        scale *= backoff_factor       # reduce scale
        steps_since_growth = 0
        continue                      # skip this step

    # Unscale and step
    for param in model.parameters():
        param.grad /= scale

    optimizer.step()

    # Grow scale periodically
    steps_since_growth += 1
    if steps_since_growth >= growth_interval:
        scale *= growth_factor
        steps_since_growth = 0
```

### PyTorch Automatic Mixed Precision (AMP)

PyTorch makes mixed precision trivially easy:

```python
import torch
from torch.cuda.amp import autocast, GradScaler

model = MyModel().cuda()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
scaler = GradScaler()

for epoch in range(num_epochs):
    for inputs, targets in dataloader:
        inputs = inputs.cuda()
        targets = targets.cuda()

        optimizer.zero_grad()

        # Forward pass in mixed precision
        # autocast selects FP16 for safe ops, keeps FP32 for sensitive ops
        with autocast():
            outputs = model(inputs)
            loss = loss_fn(outputs, targets)

        # Backward pass with loss scaling
        scaler.scale(loss).backward()

        # Unscale gradients, then clip and step
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        scaler.step(optimizer)
        scaler.update()
```

### What autocast Does Under the Hood

```
Operation Category     | Precision | Examples
-----------------------|-----------|------------------------------------------
Safe for FP16          | FP16     | Linear, Conv2d, MatMul, BMM
Unsafe (need FP32)     | FP32     | Softmax, LayerNorm, Loss functions
Promotion needed       | Widest   | Add/Cat with mixed FP16/FP32 inputs
```

The categorization ensures numerical stability. Operations like softmax involve exponentiation and summation that can overflow in FP16, so they stay in FP32.

### TF32: Transparent Acceleration on Ampere+

TF32 (TensorFloat-32) is NVIDIA's clever compromise: it uses the range of FP32 with the precision of FP16, and it is **enabled by default** on Ampere+ GPUs for cuBLAS and cuDNN operations.

```python
# TF32 is ON by default on Ampere+ for matmul and convolution
# To disable (e.g., for numerical debugging):
torch.backends.cuda.matmul.allow_tf32 = False
torch.backends.cudnn.allow_tf32 = False

# To explicitly enable:
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
```

What happens transparently:

```
FP32 input A                    FP32 input B
     |                               |
     | truncate mantissa             | truncate mantissa
     | 23 bits -> 10 bits            | 23 bits -> 10 bits
     v                               v
  TF32 A  ---- Tensor Core MMA ---  TF32 B
                    |
                    v
              FP32 output C (full 32-bit accumulation)
```

The key insight: your code stays 100% FP32, but matrix multiplications silently use Tensor Cores at ~8x speed. Most training is unaffected by the reduced mantissa precision.

### BF16 vs FP16: When to Use Which

```
                    BF16                          FP16
Range:          Same as FP32 (~3.4e38)       Limited (~65504)
Precision:      Lower (~2 decimal digits)     Higher (~3 decimal digits)
Loss Scaling:   Usually NOT needed            REQUIRED
Stability:      More stable (wider range)     Can overflow/underflow
Availability:   Ampere+ (A100, H100)          Volta+ (V100, RTX 2080)
Best for:       Training (range matters)      Inference (precision matters)
```

**Recommendation**: Use BF16 for training when available (simpler, no loss scaling needed). Use FP16 for inference when you need maximum throughput and can validate accuracy.

---

## 3. Custom CUDA Kernels for Deep Learning

### Why Write Custom Kernels?

Deep learning frameworks provide optimized implementations for standard operations, but custom kernels become necessary when:

1. **Fusion**: Combining multiple ops to reduce memory traffic
2. **Novel operations**: New research ideas not yet in libraries
3. **Specialized patterns**: Exploiting problem-specific structure
4. **Memory optimization**: Reducing peak memory usage

### Example 1: Fused Bias + GELU Activation

Standard approach (3 kernel launches, 3 memory round-trips):

```python
# PyTorch: 3 separate operations
x = x + bias          # Kernel 1: elementwise add
x = x * 0.5 * (1.0 + torch.erf(x / math.sqrt(2.0)))  # Kernel 2-3: GELU
```

Fused CUDA kernel (1 kernel launch, 1 memory round-trip):

```cpp
#include <cuda_fp16.h>
#include <math_constants.h>

// Fast GELU approximation: x * 0.5 * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
__device__ __forceinline__ float gelu_forward(float x) {
    const float sqrt_2_over_pi = 0.7978845608f;  // sqrt(2/pi)
    const float coeff = 0.044715f;
    float x_cubed = x * x * x;
    float inner = sqrt_2_over_pi * (x + coeff * x_cubed);
    return 0.5f * x * (1.0f + tanhf(inner));
}

// Fused bias + GELU kernel
// Input:  x[batch_size, hidden_dim] in FP16
// Bias:   bias[hidden_dim] in FP16
// Output: out[batch_size, hidden_dim] in FP16
__global__ void fused_bias_gelu_kernel(
    const half* __restrict__ input,
    const half* __restrict__ bias,
    half* __restrict__ output,
    int batch_size,
    int hidden_dim
) {
    // Use vectorized loads for better memory throughput
    // Process 8 FP16 elements (128 bits) per thread
    int idx = (blockIdx.x * blockDim.x + threadIdx.x) * 8;
    int total_elements = batch_size * hidden_dim;

    if (idx + 7 < total_elements) {
        // Vectorized load: 4 half2 = 8 half values
        half2 input_vec[4];
        half2 bias_vec[4];

        // Load 8 elements from input
        *reinterpret_cast<float4*>(input_vec) =
            *reinterpret_cast<const float4*>(input + idx);

        // Load 8 bias elements (use modulo for broadcasting)
        int bias_offset = idx % hidden_dim;
        *reinterpret_cast<float4*>(bias_vec) =
            *reinterpret_cast<const float4*>(bias + bias_offset);

        // Fused bias + GELU for each element
        half2 result[4];
        #pragma unroll
        for (int i = 0; i < 4; i++) {
            float2 in_f2 = __half22float2(input_vec[i]);
            float2 b_f2 = __half22float2(bias_vec[i]);

            float2 out_f2;
            out_f2.x = gelu_forward(in_f2.x + b_f2.x);
            out_f2.y = gelu_forward(in_f2.y + b_f2.y);

            result[i] = __float22half2_rn(out_f2);
        }

        // Store result
        *reinterpret_cast<float4*>(output + idx) =
            *reinterpret_cast<float4*>(result);
    }
}

void launch_fused_bias_gelu(
    const half* input, const half* bias, half* output,
    int batch_size, int hidden_dim, cudaStream_t stream
) {
    int total = batch_size * hidden_dim;
    int threads = 256;
    int blocks = (total / 8 + threads - 1) / threads;

    fused_bias_gelu_kernel<<<blocks, threads, 0, stream>>>(
        input, bias, output, batch_size, hidden_dim
    );
}
```

### Example 2: Fused Residual + LayerNorm

This is one of the most impactful fusions in transformer inference:

```cpp
// Fused: output = LayerNorm(x + residual)
// Instead of: temp = x + residual (Kernel 1)
//             output = LayerNorm(temp) (Kernel 2)
// This saves one full read+write of the tensor

__global__ void fused_residual_layernorm_kernel(
    const float* __restrict__ input,
    const float* __restrict__ residual,
    const float* __restrict__ gamma,     // LN weight
    const float* __restrict__ beta,      // LN bias
    float* __restrict__ output,
    float* __restrict__ residual_out,    // updated residual for next layer
    int hidden_dim,
    float epsilon
) {
    // Each block processes one row (one token)
    int row = blockIdx.x;
    int tid = threadIdx.x;

    // Step 1: Compute residual add and partial sums for mean
    extern __shared__ float shared_data[];
    float* s_sum = shared_data;              // for mean reduction
    float* s_sum_sq = shared_data + blockDim.x;  // for variance reduction

    float local_sum = 0.0f;
    float local_sum_sq = 0.0f;

    // Each thread handles multiple elements (hidden_dim / blockDim.x)
    for (int i = tid; i < hidden_dim; i += blockDim.x) {
        int idx = row * hidden_dim + i;
        float val = input[idx] + residual[idx];

        // Write back fused residual for next layer
        residual_out[idx] = val;

        local_sum += val;
        local_sum_sq += val * val;
    }

    s_sum[tid] = local_sum;
    s_sum_sq[tid] = local_sum_sq;
    __syncthreads();

    // Block-level reduction for mean and variance
    for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {
        if (tid < stride) {
            s_sum[tid] += s_sum[tid + stride];
            s_sum_sq[tid] += s_sum_sq[tid + stride];
        }
        __syncthreads();
    }

    float mean = s_sum[0] / hidden_dim;
    float variance = (s_sum_sq[0] / hidden_dim) - (mean * mean);
    float inv_std = rsqrtf(variance + epsilon);

    // Step 2: Normalize and apply affine transform
    for (int i = tid; i < hidden_dim; i += blockDim.x) {
        int idx = row * hidden_dim + i;
        float val = residual_out[idx];
        output[idx] = gamma[i] * (val - mean) * inv_std + beta[i];
    }
}
```

### Example 3: Custom Attention Mask Kernel

```cpp
// Efficient causal mask application
// Instead of creating a full N x N mask tensor, compute on the fly
__global__ void apply_causal_mask_kernel(
    float* __restrict__ attention_scores,  // [batch, heads, seq_len, seq_len]
    int seq_len,
    float mask_value  // typically -10000.0 or -inf
) {
    int batch_head = blockIdx.x;  // flattened batch * heads
    int row = blockIdx.y;
    int col = threadIdx.x;

    // Process multiple columns per thread
    for (int c = col; c < seq_len; c += blockDim.x) {
        if (c > row) {
            // Future position: mask it out
            int idx = batch_head * seq_len * seq_len + row * seq_len + c;
            attention_scores[idx] = mask_value;
        }
    }
}
```

### Integrating Custom Kernels with PyTorch

```python
import torch
from torch.utils.cpp_extension import load_inline

# Inline CUDA compilation
cuda_source = """
#include <torch/extension.h>
#include <cuda_fp16.h>

__device__ __forceinline__ float gelu_fwd(float x) {
    return 0.5f * x * (1.0f + tanhf(0.7978845608f * (x + 0.044715f * x * x * x)));
}

__global__ void fused_bias_gelu(
    const float* input, const float* bias, float* output,
    int rows, int cols
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < rows * cols) {
        int col = idx % cols;
        output[idx] = gelu_fwd(input[idx] + bias[col]);
    }
}

torch::Tensor fused_bias_gelu_cuda(torch::Tensor input, torch::Tensor bias) {
    auto output = torch::empty_like(input);
    int total = input.numel();
    int threads = 256;
    int blocks = (total + threads - 1) / threads;

    fused_bias_gelu<<<blocks, threads>>>(
        input.data_ptr<float>(),
        bias.data_ptr<float>(),
        output.data_ptr<float>(),
        input.size(0), input.size(1)
    );

    return output;
}

PYBIND11_MODULE(TORCH_EXTENSION_NAME, m) {
    m.def("fused_bias_gelu", &fused_bias_gelu_cuda, "Fused bias + GELU");
}
"""

# Compile and load
module = load_inline(
    name="fused_ops",
    cpp_sources="",
    cuda_sources=cuda_source,
    functions=["fused_bias_gelu"],
    verbose=True
)

# Use it
x = torch.randn(32, 4096, device="cuda")
bias = torch.randn(4096, device="cuda")
result = module.fused_bias_gelu(x, bias)
```

---

## 4. FlashAttention Explained

### The Memory Bottleneck in Standard Attention

Standard self-attention computes:

```
Attention(Q, K, V) = softmax(Q @ K^T / sqrt(d_k)) @ V
```

For sequence length N and head dimension d:

```
Step              | Compute       | Memory Read/Write    | Materialized Tensor
------------------|---------------|---------------------|--------------------
S = Q @ K^T       | O(N^2 * d)   | Read Q,K; Write S   | S: N x N (HUGE)
P = softmax(S)    | O(N^2)       | Read S; Write P      | P: N x N (HUGE)
O = P @ V         | O(N^2 * d)   | Read P,V; Write O    | O: N x d
```

The problem: **S and P are N x N matrices**. For N = 8192 (common in LLMs), that is 8192 x 8192 x 4 bytes = **256 MB per head per layer** just for intermediate storage.

```
Memory hierarchy speed:
  Registers/L1:    ~19 TB/s
  L2 Cache:        ~6 TB/s
  HBM (GPU DRAM):  ~2 TB/s  <-- S and P live here

Standard attention is MEMORY-BOUND because:
  - Arithmetic intensity is low (simple operations on huge tensors)
  - Must write N^2 elements to HBM, then read them back
  - HBM bandwidth is the bottleneck, not compute
```

### The FlashAttention Insight

FlashAttention (Dao et al., 2022) reformulates attention to **never materialize the N x N attention matrix** in HBM. Instead, it computes attention in **tiles** that fit in SRAM (shared memory).

```
Standard Attention                FlashAttention
==================                ================

Q,K,V in HBM                     Q,K,V in HBM
     |                                 |
     v                                 v
S = QK^T  -> HBM (N^2)           For each tile of Q:
     |                              Load Q_tile to SRAM
     v                              For each tile of K,V:
P = softmax(S) -> HBM (N^2)          Load K_tile, V_tile to SRAM
     |                                Compute S_tile = Q_tile @ K_tile^T  (in SRAM)
     v                                Update running softmax  (in SRAM)
O = PV -> HBM (N*d)                  Accumulate O_tile  (in SRAM)
                                    Write O_tile to HBM

HBM I/O: O(N^2 * d)              HBM I/O: O(N^2 * d^2 / SRAM_size)
```

### The Online Softmax Trick

The challenge with tiling: softmax requires knowing the maximum value across the entire row, but we only see one tile at a time.

**Solution**: Maintain running statistics and rescale:

```
Online Softmax Algorithm:

Initialize:
  m_prev = -infinity     (running maximum)
  l_prev = 0             (running sum of exponentials)
  O_prev = 0             (running output)

For each tile j:
  S_j = Q_tile @ K_j^T / sqrt(d)      // local attention scores
  m_j = max(S_j)                        // local maximum
  m_new = max(m_prev, m_j)              // global maximum so far

  // Correction factor for previous statistics
  alpha = exp(m_prev - m_new)
  beta = exp(m_j - m_new)

  // Update running sum
  l_new = alpha * l_prev + beta * sum(exp(S_j - m_j))

  // Update output with rescaling
  P_j = exp(S_j - m_j)                 // local softmax numerator
  O_new = (alpha * l_prev * O_prev + beta * P_j @ V_j) / l_new

  m_prev = m_new
  l_prev = l_new
  O_prev = O_new

Final: O = O_prev  (correct softmax attention output)
```

The mathematical correctness relies on the identity:

```
softmax(x)_i = exp(x_i - m) / sum(exp(x_j - m))

When we see a new tile with a larger maximum m', we can rescale:
  exp(x_i - m) = exp(x_i - m') * exp(m' - m)
```

### Simplified FlashAttention Implementation

```cpp
// Simplified FlashAttention kernel (single-head, forward pass)
// Real implementations handle multi-head, backward pass, masking, etc.

#define Br 64   // Block size for rows (Q tiles)
#define Bc 64   // Block size for cols (K,V tiles)

__global__ void flash_attention_forward(
    const float* __restrict__ Q,   // [N, d]
    const float* __restrict__ K,   // [N, d]
    const float* __restrict__ V,   // [N, d]
    float* __restrict__ O,         // [N, d]
    float* __restrict__ L,         // [N]  (log-sum-exp for backward)
    int N, int d
) {
    // This block handles rows [block_row * Br, (block_row+1) * Br)
    int block_row = blockIdx.x;
    int tid = threadIdx.x;

    // Shared memory for tiles
    extern __shared__ float smem[];
    float* Q_tile = smem;                         // [Br, d]
    float* K_tile = smem + Br * d;                // [Bc, d]
    float* V_tile = smem + Br * d + Bc * d;       // [Bc, d]
    float* S_tile = smem + Br * d + 2 * Bc * d;   // [Br, Bc]

    int row_start = block_row * Br;

    // Load Q tile to shared memory
    for (int i = tid; i < Br * d; i += blockDim.x) {
        int r = i / d;
        int c = i % d;
        if (row_start + r < N) {
            Q_tile[r * d + c] = Q[(row_start + r) * d + c];
        }
    }
    __syncthreads();

    // Per-row running statistics (in registers)
    float m_i[Br];      // running max per row (simplified: per-thread subset)
    float l_i[Br];      // running sum per row
    float o_i[Br * 64]; // running output (assuming d <= 64)

    // Initialize
    for (int r = tid; r < Br; r += blockDim.x) {
        m_i[r] = -INFINITY;
        l_i[r] = 0.0f;
        for (int c = 0; c < d; c++) {
            o_i[r * d + c] = 0.0f;
        }
    }

    // Iterate over K,V tiles
    int num_kv_tiles = (N + Bc - 1) / Bc;
    for (int j = 0; j < num_kv_tiles; j++) {
        int col_start = j * Bc;

        // Load K tile and V tile
        for (int i = tid; i < Bc * d; i += blockDim.x) {
            int r = i / d;
            int c = i % d;
            if (col_start + r < N) {
                K_tile[r * d + c] = K[(col_start + r) * d + c];
                V_tile[r * d + c] = V[(col_start + r) * d + c];
            } else {
                K_tile[r * d + c] = 0.0f;
                V_tile[r * d + c] = 0.0f;
            }
        }
        __syncthreads();

        // Compute S_tile = Q_tile @ K_tile^T / sqrt(d)
        // Then update running softmax statistics
        float scale = 1.0f / sqrtf((float)d);

        for (int r = tid; r < Br; r += blockDim.x) {
            if (row_start + r >= N) continue;

            // Compute row r of S_tile
            float row_max = -INFINITY;
            for (int c = 0; c < Bc && col_start + c < N; c++) {
                float dot = 0.0f;
                for (int k = 0; k < d; k++) {
                    dot += Q_tile[r * d + k] * K_tile[c * d + k];
                }
                S_tile[r * Bc + c] = dot * scale;
                row_max = fmaxf(row_max, S_tile[r * Bc + c]);
            }

            // Update running max
            float m_new = fmaxf(m_i[r], row_max);

            // Rescale previous accumulator
            float alpha = expf(m_i[r] - m_new);
            float l_new = alpha * l_i[r];

            // Compute softmax for this tile and accumulate
            for (int c = 0; c < Bc && col_start + c < N; c++) {
                float p = expf(S_tile[r * Bc + c] - m_new);
                l_new += p;

                // Accumulate P @ V contribution
                for (int k = 0; k < d; k++) {
                    o_i[r * d + k] = alpha * o_i[r * d + k] + p * V_tile[c * d + k];
                }
            }

            m_i[r] = m_new;
            l_i[r] = l_new;
        }
        __syncthreads();
    }

    // Final normalization: O = O_acc / l
    for (int r = tid; r < Br; r += blockDim.x) {
        if (row_start + r >= N) continue;
        float inv_l = 1.0f / l_i[r];
        for (int c = 0; c < d; c++) {
            O[(row_start + r) * d + c] = o_i[r * d + c] * inv_l;
        }
        L[row_start + r] = m_i[r] + logf(l_i[r]);  // for backward pass
    }
}
```

### I/O Complexity Analysis

```
Standard Attention:
  Read Q, K:           O(N * d)      -- for computing S = QK^T
  Write S:             O(N^2)        -- N x N attention matrix to HBM
  Read S:              O(N^2)        -- for softmax
  Write P:             O(N^2)        -- softmax result to HBM
  Read P, V:           O(N^2 + N*d)  -- for computing O = PV
  Write O:             O(N * d)
  ----------------------------------------------------------
  Total HBM I/O:       O(N^2 + N*d)  ~= O(N^2) for large N

FlashAttention:
  For each of (N/Br) Q-tiles:
    For each of (N/Bc) KV-tiles:
      Read Q_tile:     O(Br * d)
      Read K_tile:     O(Bc * d)
      Read V_tile:     O(Bc * d)
      (All compute in SRAM -- no HBM writes for intermediates)
    Write O_tile:      O(Br * d)
  ----------------------------------------------------------
  Total HBM I/O:       O(N^2 * d^2 / M)  where M = SRAM size

  Since M >> d^2 typically, this is O(N^2 * d / M * d) which is
  substantially less than O(N^2) for practical SRAM sizes.
```

### FlashAttention-2 Improvements

FlashAttention-2 (Dao, 2023) further optimizes by:

1. **Reduced non-matmul FLOPs**: Moves rescaling out of the inner loop
2. **Better work partitioning**: Parallelizes over sequence length, not just batch/heads
3. **Better warp-level scheduling**: Avoids warp synchronization in the inner loop

```
FlashAttention-1 achieves: ~60-70% of peak FLOPS
FlashAttention-2 achieves: ~70-80% of peak FLOPS
FlashAttention-3 achieves: ~75-85% of peak FLOPS (Hopper-specific optimizations)
```

### FlashAttention in Practice

```python
# PyTorch 2.0+ has FlashAttention built in
import torch.nn.functional as F

# Automatically uses FlashAttention when possible
output = F.scaled_dot_product_attention(
    query,    # [batch, heads, seq_len, head_dim]
    key,      # [batch, heads, seq_len, head_dim]
    value,    # [batch, heads, seq_len, head_dim]
    attn_mask=None,
    dropout_p=0.0,
    is_causal=True  # enables causal masking without materializing mask
)

# Or use the flash_attn library directly for more control
from flash_attn import flash_attn_func

output = flash_attn_func(
    q, k, v,
    dropout_p=0.0,
    softmax_scale=None,  # defaults to 1/sqrt(d)
    causal=True
)
```

---

## 5. Quantization

### What Is Quantization?

Quantization maps high-precision floating-point values to lower-precision integer or floating-point representations. The goal: **reduce model size and increase inference speed** with minimal accuracy loss.

```
FP32 weight: 3.14159265...
             |
             | quantize to INT8 (scale=0.025, zero_point=126)
             v
INT8 weight: 126 + round(3.14159 / 0.025) = 126 + 126 = 252
             ~= 252 * 0.025 - 126 * 0.025 = 3.15  (close enough!)
```

### Quantization Math

**Affine (asymmetric) quantization**:

```
Quantize:    q = clamp(round(x / scale + zero_point), qmin, qmax)
Dequantize:  x_hat = (q - zero_point) * scale

Where:
  scale = (x_max - x_min) / (qmax - qmin)
  zero_point = round(qmin - x_min / scale)

For INT8: qmin = -128, qmax = 127 (or 0 to 255 for unsigned)
```

**Symmetric quantization** (simpler, more common for weights):

```
Quantize:    q = clamp(round(x / scale), -127, 127)
Dequantize:  x_hat = q * scale

Where:
  scale = max(|x|) / 127
  zero_point = 0 (always)
```

### Quantization Granularity

```
Per-Tensor:     One scale for entire tensor
                 + Simplest, fastest
                 - Least accurate (one outlier affects all)

Per-Channel:    One scale per output channel
                 + Much more accurate for weights
                 - Slightly more bookkeeping

Per-Group:      One scale per group of values (e.g., 128 elements)
                 + Best accuracy, handles outliers well
                 - More overhead, used in INT4 quantization

Per-Token:      One scale per token (for activations)
                 + Handles varying activation ranges
                 - Computed dynamically at runtime
```

### PTQ vs QAT

**Post-Training Quantization (PTQ)**: Quantize a pre-trained model without retraining.

```python
# PyTorch PTQ example (simplified)
import torch

model = load_pretrained_model()
model.eval()

# Calibrate: run representative data through the model
# to collect activation statistics
calibration_data = get_calibration_dataset()

with torch.no_grad():
    for batch in calibration_data:
        model(batch)  # observers collect min/max statistics

# Apply quantization based on collected statistics
quantized_model = torch.quantization.convert(model)
```

**Quantization-Aware Training (QAT)**: Simulate quantization during training so the model learns to be robust.

```python
# PyTorch QAT example (simplified)
import torch.quantization as quant

model = load_pretrained_model()
model.train()

# Insert fake quantization nodes
model.qconfig = quant.get_default_qat_qconfig('fbgemm')
quant.prepare_qat(model, inplace=True)

# Fine-tune with quantization simulation
for epoch in range(num_epochs):
    for batch, target in dataloader:
        output = model(batch)         # fake-quant ops simulate rounding
        loss = criterion(output, target)
        loss.backward()               # STE (Straight-Through Estimator)
        optimizer.step()              # gradients flow through fake-quant

# Convert to actual quantized model
quantized_model = quant.convert(model.eval())
```

### INT8 Quantized Matrix Multiplication Kernel

```cpp
// INT8 GEMM: C(FP32) = dequant(A(INT8) @ B(INT8))
// Uses NVIDIA's INT8 Tensor Cores for the core multiply
// Then dequantizes the INT32 accumulator to FP32

__global__ void int8_gemm_dequantize_kernel(
    const int8_t* __restrict__ A,     // [M, K] quantized activations
    const int8_t* __restrict__ B,     // [K, N] quantized weights
    float* __restrict__ C,             // [M, N] output in FP32
    const float* __restrict__ scale_A, // [M] per-row activation scales
    const float* __restrict__ scale_B, // [N] per-channel weight scales
    int M, int N, int K
) {
    // Tile dimensions
    const int TILE_M = 128;
    const int TILE_N = 128;
    const int TILE_K = 32;

    int row = blockIdx.y * TILE_M + threadIdx.y;
    int col = blockIdx.x * TILE_N + threadIdx.x;

    if (row >= M || col >= N) return;

    // Accumulate in INT32
    int32_t acc = 0;

    for (int k = 0; k < K; k += TILE_K) {
        // In practice, this uses shared memory tiling
        // and calls wmma::mma_sync with INT8 fragments
        for (int kk = 0; kk < TILE_K && k + kk < K; kk++) {
            acc += (int32_t)A[row * K + k + kk] * (int32_t)B[(k + kk) * N + col];
        }
    }

    // Dequantize: multiply INT32 accumulator by combined scale
    C[row * N + col] = (float)acc * scale_A[row] * scale_B[col];
}
```

### GPTQ: Weight-Only INT4 Quantization

GPTQ quantizes weights to INT4 while keeping activations in FP16. The key insight: use the inverse Hessian to optimally distribute quantization error.

```
GPTQ Algorithm (per column group):
  1. Compute Hessian H = X^T @ X  (from calibration data)
  2. For each column of weight matrix:
     a. Quantize the column to INT4
     b. Compute quantization error
     c. Distribute error to remaining columns using H^{-1}
  3. Result: each weight group has scale + zero_point + INT4 weights

Storage: INT4 weight = 4 bits per parameter
         + scale (FP16) per group of 128 weights
         ~= 4.1 bits per parameter average

Inference kernel:
  - Load INT4 weights, dequantize to FP16 on-the-fly
  - Compute FP16 matmul with FP16 activations
  - No separate dequantization pass needed
```

### NVIDIA TensorRT Quantization Pipeline

```
PyTorch Model
     |
     | Export to ONNX
     v
ONNX Model
     |
     | TensorRT Builder
     v
[Layer Fusion] -> [Calibration] -> [Quantization] -> [Kernel Selection]
                       |
                  INT8 Calibration
                  (entropy / minmax / percentile)
                       |
                  Per-tensor or per-channel scales
     |
     v
TensorRT Engine (optimized for target GPU)
```

```python
# TensorRT INT8 calibration example
import tensorrt as trt

logger = trt.Logger(trt.Logger.WARNING)
builder = trt.Builder(logger)
network = builder.create_network(
    1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
)

# Parse ONNX model
parser = trt.OnnxParser(network, logger)
with open("model.onnx", "rb") as f:
    parser.parse(f.read())

# Configure INT8 quantization
config = builder.create_builder_config()
config.set_flag(trt.BuilderFlag.INT8)

# Custom calibrator
class MyCalibrator(trt.IInt8EntropyCalibrator2):
    def __init__(self, dataloader):
        super().__init__()
        self.dataloader = iter(dataloader)
        self.batch_size = 32
        self.device_input = cuda.mem_alloc(self.batch_size * 3 * 224 * 224 * 4)

    def get_batch(self, names):
        try:
            batch = next(self.dataloader)
            cuda.memcpy_htod(self.device_input, batch.numpy())
            return [int(self.device_input)]
        except StopIteration:
            return None

    def get_batch_size(self):
        return self.batch_size

    def read_calibration_cache(self):
        return None

    def write_calibration_cache(self, cache):
        with open("calibration.cache", "wb") as f:
            f.write(cache)

config.int8_calibrator = MyCalibrator(calibration_loader)

# Build engine
engine = builder.build_serialized_network(network, config)
```

### FP8 Quantization (Hopper+)

FP8 is the newest quantization format, natively supported by H100 Tensor Cores:

```
FP8 E4M3 (for weights and activations):
  Sign: 1 bit
  Exponent: 4 bits (range: ~[-240, 240])
  Mantissa: 3 bits
  Best for: forward pass activations and weights

FP8 E5M2 (for gradients):
  Sign: 1 bit
  Exponent: 5 bits (range: ~[-57344, 57344])
  Mantissa: 2 bits
  Best for: backward pass gradients (wider range needed)

Advantage over INT8:
  - No calibration needed (floating-point handles varying ranges naturally)
  - Simpler integration with existing FP16/BF16 training pipelines
  - Hardware-native support on H100/B200
```

---

## 6. Triton Compiler

### What Is Triton?

Triton is an open-source programming language and compiler developed by OpenAI that lets you write GPU kernels in a Python-like syntax. Instead of managing individual threads (CUDA), you program at the **block level** -- operating on tiles of data.

```
CUDA Mental Model:             Triton Mental Model:
  - You manage threads          - You manage blocks/tiles
  - You manage shared memory    - Compiler manages shared memory
  - You write PTX-level logic   - You write numpy-like operations
  - You tune manually           - Auto-tuning finds best config
```

### Triton Programming Model

```python
import triton
import triton.language as tl

@triton.jit
def my_kernel(
    X_ptr,          # pointer to input tensor
    Y_ptr,          # pointer to output tensor
    N,              # number of elements
    BLOCK_SIZE: tl.constexpr  # compile-time constant
):
    # Program ID = which block this is
    pid = tl.program_id(axis=0)

    # Compute pointer offsets for this block
    offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)

    # Create mask for bounds checking
    mask = offsets < N

    # Load a block of data from global memory
    x = tl.load(X_ptr + offsets, mask=mask)

    # Compute (all operations are on the block)
    y = x * x + 2 * x + 1

    # Store results back
    tl.store(Y_ptr + offsets, y, mask=mask)
```

Key concepts:

- **`tl.program_id`**: Equivalent to CUDA blockIdx
- **`tl.arange`**: Creates a range within a block (like threadIdx)
- **`tl.load/tl.store`**: Block-level memory operations with masking
- **`tl.constexpr`**: Compile-time constants for tile sizes

### Example: Fused Softmax in Triton

```python
import torch
import triton
import triton.language as tl

@triton.jit
def softmax_kernel(
    input_ptr,
    output_ptr,
    input_row_stride,
    output_row_stride,
    n_cols,
    BLOCK_SIZE: tl.constexpr
):
    # One program handles one row
    row_idx = tl.program_id(0)

    # Pointer to the start of this row
    row_start = input_ptr + row_idx * input_row_stride

    # Compute offsets for elements in this row
    col_offsets = tl.arange(0, BLOCK_SIZE)
    mask = col_offsets < n_cols

    # Load the row
    row = tl.load(row_start + col_offsets, mask=mask, other=-float('inf'))

    # Compute softmax:
    # Step 1: Subtract max for numerical stability
    row_max = tl.max(row, axis=0)
    numerator = tl.exp(row - row_max)

    # Step 2: Normalize
    denominator = tl.sum(numerator, axis=0)
    softmax_output = numerator / denominator

    # Store result
    output_start = output_ptr + row_idx * output_row_stride
    tl.store(output_start + col_offsets, softmax_output, mask=mask)


def triton_softmax(x: torch.Tensor) -> torch.Tensor:
    n_rows, n_cols = x.shape
    output = torch.empty_like(x)

    # Block size must be power of 2 and >= n_cols
    BLOCK_SIZE = triton.next_power_of_2(n_cols)

    # Launch: one program per row
    softmax_kernel[(n_rows,)](
        x, output,
        x.stride(0), output.stride(0),
        n_cols,
        BLOCK_SIZE=BLOCK_SIZE
    )
    return output

# Usage
x = torch.randn(1024, 512, device='cuda')
y = triton_softmax(x)
```

### Example: Matrix Multiplication in Triton

```python
@triton.jit
def matmul_kernel(
    A_ptr, B_ptr, C_ptr,
    M, N, K,
    stride_am, stride_ak,
    stride_bk, stride_bn,
    stride_cm, stride_cn,
    BLOCK_M: tl.constexpr,
    BLOCK_N: tl.constexpr,
    BLOCK_K: tl.constexpr,
    GROUP_SIZE_M: tl.constexpr
):
    """Compute C = A @ B using block-level tiling."""
    # Program ID
    pid = tl.program_id(axis=0)
    num_pid_m = tl.cdiv(M, BLOCK_M)
    num_pid_n = tl.cdiv(N, BLOCK_N)

    # Swizzle program IDs for better L2 cache locality
    num_pid_in_group = GROUP_SIZE_M * num_pid_n
    group_id = pid // num_pid_in_group
    first_pid_m = group_id * GROUP_SIZE_M
    group_size_m = min(num_pid_m - first_pid_m, GROUP_SIZE_M)
    pid_m = first_pid_m + (pid % group_size_m)
    pid_n = (pid % num_pid_in_group) // group_size_m

    # Block start indices
    offs_am = pid_m * BLOCK_M + tl.arange(0, BLOCK_M)
    offs_bn = pid_n * BLOCK_N + tl.arange(0, BLOCK_N)
    offs_k = tl.arange(0, BLOCK_K)

    # Pointers to first blocks of A and B
    a_ptrs = A_ptr + (offs_am[:, None] * stride_am + offs_k[None, :] * stride_ak)
    b_ptrs = B_ptr + (offs_k[:, None] * stride_bk + offs_bn[None, :] * stride_bn)

    # Accumulator in FP32
    accumulator = tl.zeros((BLOCK_M, BLOCK_N), dtype=tl.float32)

    # Main loop over K dimension
    for k in range(0, tl.cdiv(K, BLOCK_K)):
        # Load tiles with bounds checking
        a = tl.load(a_ptrs, mask=offs_k[None, :] < K - k * BLOCK_K, other=0.0)
        b = tl.load(b_ptrs, mask=offs_k[:, None] < K - k * BLOCK_K, other=0.0)

        # Block-level matrix multiply (uses Tensor Cores automatically!)
        accumulator += tl.dot(a, b)

        # Advance pointers
        a_ptrs += BLOCK_K * stride_ak
        b_ptrs += BLOCK_K * stride_bk

    # Convert to output dtype and store
    c = accumulator.to(tl.float16)

    offs_cm = pid_m * BLOCK_M + tl.arange(0, BLOCK_M)
    offs_cn = pid_n * BLOCK_N + tl.arange(0, BLOCK_N)
    c_ptrs = C_ptr + stride_cm * offs_cm[:, None] + stride_cn * offs_cn[None, :]
    mask = (offs_cm[:, None] < M) & (offs_cn[None, :] < N)
    tl.store(c_ptrs, c, mask=mask)


# Auto-tuning configuration
@triton.autotune(
    configs=[
        triton.Config({'BLOCK_M': 128, 'BLOCK_N': 256, 'BLOCK_K': 64, 'GROUP_SIZE_M': 8}, num_stages=3, num_warps=8),
        triton.Config({'BLOCK_M': 64, 'BLOCK_N': 256, 'BLOCK_K': 32, 'GROUP_SIZE_M': 8}, num_stages=4, num_warps=4),
        triton.Config({'BLOCK_M': 128, 'BLOCK_N': 128, 'BLOCK_K': 32, 'GROUP_SIZE_M': 8}, num_stages=4, num_warps=4),
        triton.Config({'BLOCK_M': 128, 'BLOCK_N': 64, 'BLOCK_K': 32, 'GROUP_SIZE_M': 8}, num_stages=4, num_warps=4),
        triton.Config({'BLOCK_M': 64, 'BLOCK_N': 128, 'BLOCK_K': 32, 'GROUP_SIZE_M': 8}, num_stages=4, num_warps=4),
        triton.Config({'BLOCK_M': 64, 'BLOCK_N': 64, 'BLOCK_K': 32, 'GROUP_SIZE_M': 8}, num_stages=5, num_warps=2),
    ],
    key=['M', 'N', 'K'],
)
@triton.jit
def autotuned_matmul_kernel(
    # same parameters as matmul_kernel above
    ...
):
    # same body as matmul_kernel above
    ...


def triton_matmul(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    assert a.shape[1] == b.shape[0], "Incompatible dimensions"
    M, K = a.shape
    K, N = b.shape
    c = torch.empty((M, N), device=a.device, dtype=torch.float16)

    grid = lambda META: (
        triton.cdiv(M, META['BLOCK_M']) * triton.cdiv(N, META['BLOCK_N']),
    )

    matmul_kernel[grid](
        a, b, c,
        M, N, K,
        a.stride(0), a.stride(1),
        b.stride(0), b.stride(1),
        c.stride(0), c.stride(1),
    )
    return c
```

### Triton Auto-tuning

Triton's auto-tuning feature benchmarks multiple kernel configurations and selects the fastest:

```python
@triton.autotune(
    configs=[
        # Each config specifies tile sizes, pipeline stages, and warp count
        triton.Config(
            {'BLOCK_M': 128, 'BLOCK_N': 128, 'BLOCK_K': 32},
            num_stages=4,   # number of pipeline stages (software pipelining)
            num_warps=4     # number of warps per block
        ),
        triton.Config(
            {'BLOCK_M': 64, 'BLOCK_N': 256, 'BLOCK_K': 64},
            num_stages=3,
            num_warps=8
        ),
        # ... more configs
    ],
    key=['M', 'N', 'K'],  # re-tune when these change
)
@triton.jit
def my_kernel(...):
    ...
```

How it works:

```
First call with new (M, N, K):
  1. Compile kernel for EACH config
  2. Benchmark each variant
  3. Select fastest
  4. Cache the selection

Subsequent calls with same (M, N, K):
  - Use cached best config
  - Zero overhead
```

### Triton vs CUDA Comparison

```
Feature              | CUDA                    | Triton
---------------------|-------------------------|-------------------------
Language             | C/C++ extension         | Python-decorated functions
Abstraction          | Thread-level            | Block/tile-level
Shared memory        | Manual management       | Automatic
Memory coalescing    | Must ensure manually    | Automatic
Tensor Cores         | WMMA API (explicit)     | tl.dot (automatic)
Tuning               | Manual or CuTe          | @triton.autotune
Compilation          | nvcc (ahead of time)    | JIT (first call)
Debug-ability        | printf, cuda-gdb        | Limited
Max performance      | 100% theoretical        | ~80-95% of hand-tuned CUDA
Portability          | NVIDIA only             | AMD ROCm support too
Learning curve       | Steep                   | Moderate
```

---

## 7. cuDNN and cuBLAS

### cuBLAS: The Foundation of Deep Learning Math

cuBLAS (CUDA Basic Linear Algebra Subprograms) provides highly optimized implementations of matrix operations. Almost every deep learning operation reduces to matrix multiplication, making cuBLAS critical.

### Key cuBLAS Operations

```
Operation      | cuBLAS Function      | Deep Learning Use
---------------|----------------------|----------------------------
GEMM           | cublasSgemm          | Linear layers, attention
Batched GEMM   | cublasSgemmBatched   | Multi-head attention
Strided GEMM   | cublasSgemmStridedBatched | Batch processing
GEMV           | cublasSgemv          | Single-sample inference
```

### Calling cuBLAS Directly

```cpp
#include <cublas_v2.h>

void cublas_gemm_example(
    const float* A, const float* B, float* C,
    int M, int N, int K
) {
    cublasHandle_t handle;
    cublasCreate(&handle);

    float alpha = 1.0f;
    float beta = 0.0f;

    // NOTE: cuBLAS uses column-major by default
    // For row-major C = A @ B, we compute C^T = B^T @ A^T
    // Which in cuBLAS (column-major) is:
    cublasSgemm(
        handle,
        CUBLAS_OP_N,     // op(B) = B (no transpose, since column-major B^T = row-major B)
        CUBLAS_OP_N,     // op(A) = A
        N,               // rows of op(B) and C
        M,               // cols of op(A) and C
        K,               // cols of op(B) = rows of op(A)
        &alpha,
        B, N,            // B and its leading dimension
        A, K,            // A and its leading dimension
        &beta,
        C, N             // C and its leading dimension
    );

    cublasDestroy(handle);
}

// Mixed-precision GEMM using Tensor Cores
void cublas_mixed_precision_gemm(
    const half* A, const half* B, float* C,
    int M, int N, int K
) {
    cublasHandle_t handle;
    cublasCreate(&handle);

    // Enable Tensor Core math
    cublasSetMathMode(handle, CUBLAS_TENSOR_OP_MATH);

    float alpha = 1.0f;
    float beta = 0.0f;

    // Use cublasGemmEx for mixed precision
    cublasGemmEx(
        handle,
        CUBLAS_OP_N, CUBLAS_OP_N,
        N, M, K,
        &alpha,
        B, CUDA_R_16F, N,       // B in FP16
        A, CUDA_R_16F, K,       // A in FP16
        &beta,
        C, CUDA_R_32F, N,       // C in FP32
        CUBLAS_COMPUTE_32F,      // compute type
        CUBLAS_GEMM_DEFAULT_TENSOR_OP  // use Tensor Cores
    );

    cublasDestroy(handle);
}
```

### cuDNN: Optimized Deep Learning Primitives

cuDNN provides optimized implementations for:

- Convolutions (forward, backward data, backward filter)
- Pooling (max, average)
- Normalization (batch norm, layer norm, group norm)
- Activation functions (ReLU, sigmoid, tanh, GELU)
- RNNs (LSTM, GRU)
- Softmax
- Attention (multi-head, scaled dot-product)

### cuDNN Convolution Example

```cpp
#include <cudnn.h>

void cudnn_conv2d_example(
    const float* input,   // [N, C_in, H, W]
    const float* filter,  // [C_out, C_in, kH, kW]
    float* output,        // [N, C_out, H_out, W_out]
    int N, int C_in, int H, int W,
    int C_out, int kH, int kW,
    int pad, int stride
) {
    cudnnHandle_t handle;
    cudnnCreate(&handle);

    // Describe input tensor
    cudnnTensorDescriptor_t input_desc;
    cudnnCreateTensorDescriptor(&input_desc);
    cudnnSetTensor4dDescriptor(
        input_desc, CUDNN_TENSOR_NCHW, CUDNN_DATA_FLOAT,
        N, C_in, H, W
    );

    // Describe filter
    cudnnFilterDescriptor_t filter_desc;
    cudnnCreateFilterDescriptor(&filter_desc);
    cudnnSetFilter4dDescriptor(
        filter_desc, CUDNN_DATA_FLOAT, CUDNN_TENSOR_NCHW,
        C_out, C_in, kH, kW
    );

    // Describe convolution operation
    cudnnConvolutionDescriptor_t conv_desc;
    cudnnCreateConvolutionDescriptor(&conv_desc);
    cudnnSetConvolution2dDescriptor(
        conv_desc,
        pad, pad,        // padding
        stride, stride,  // stride
        1, 1,            // dilation
        CUDNN_CROSS_CORRELATION,
        CUDNN_DATA_FLOAT
    );

    // Enable Tensor Cores
    cudnnSetConvolutionMathType(conv_desc, CUDNN_TENSOR_OP_MATH);

    // Compute output dimensions
    int out_N, out_C, out_H, out_W;
    cudnnGetConvolution2dForwardOutputDim(
        conv_desc, input_desc, filter_desc,
        &out_N, &out_C, &out_H, &out_W
    );

    // Describe output tensor
    cudnnTensorDescriptor_t output_desc;
    cudnnCreateTensorDescriptor(&output_desc);
    cudnnSetTensor4dDescriptor(
        output_desc, CUDNN_TENSOR_NCHW, CUDNN_DATA_FLOAT,
        out_N, out_C, out_H, out_W
    );

    // Find the best algorithm
    cudnnConvolutionFwdAlgo_t algo;
    int returnedAlgoCount;
    cudnnConvolutionFwdAlgoPerf_t perfResults;
    cudnnFindConvolutionForwardAlgorithm(
        handle, input_desc, filter_desc, conv_desc, output_desc,
        1, &returnedAlgoCount, &perfResults
    );
    algo = perfResults.algo;

    // Allocate workspace
    size_t workspace_size;
    cudnnGetConvolutionForwardWorkspaceSize(
        handle, input_desc, filter_desc, conv_desc, output_desc,
        algo, &workspace_size
    );
    void* workspace;
    cudaMalloc(&workspace, workspace_size);

    // Execute convolution
    float alpha = 1.0f, beta = 0.0f;
    cudnnConvolutionForward(
        handle, &alpha,
        input_desc, input,
        filter_desc, filter,
        conv_desc, algo, workspace, workspace_size,
        &beta, output_desc, output
    );

    // Cleanup
    cudaFree(workspace);
    cudnnDestroyTensorDescriptor(input_desc);
    cudnnDestroyTensorDescriptor(output_desc);
    cudnnDestroyFilterDescriptor(filter_desc);
    cudnnDestroyConvolutionDescriptor(conv_desc);
    cudnnDestroy(handle);
}
```

### cuDNN Algorithm Selection

cuDNN offers multiple algorithms for convolutions and lets you choose:

```
Algorithm                       | Memory  | Speed    | Best For
--------------------------------|---------|----------|-------------------
IMPLICIT_GEMM                   | Low     | Medium   | Small tensors
IMPLICIT_PRECOMP_GEMM           | Medium  | Fast     | General purpose
GEMM                            | High    | Fast     | Large batch
DIRECT                          | Low     | Varies   | Depthwise conv
FFT                             | High    | Fast     | Large kernels
FFT_TILING                      | Medium  | Fast     | Large kernels
WINOGRAD                        | Medium  | Fastest  | 3x3 kernels
WINOGRAD_NONFUSED               | High    | Fastest  | 3x3 kernels
```

PyTorch's cuDNN benchmark mode tries all algorithms:

```python
torch.backends.cudnn.benchmark = True  # enable auto-tuning
# First forward pass: benchmarks all algorithms
# Subsequent passes: uses the fastest one
```

### How PyTorch Uses cuBLAS and cuDNN

```
PyTorch Operation           ->  Backend Library
-------------------------------------------------
torch.mm(A, B)              ->  cuBLAS GEMM
torch.bmm(A, B)             ->  cuBLAS Batched GEMM
nn.Linear(x)                ->  cuBLAS GEMM (x @ W^T + b)
nn.Conv2d(x)                ->  cuDNN Convolution Forward
nn.BatchNorm2d(x)           ->  cuDNN Batch Normalization
nn.LayerNorm(x)             ->  cuDNN Layer Normalization (or custom)
F.softmax(x)                ->  cuDNN Softmax
F.relu(x)                   ->  cuDNN Activation (or simple CUDA kernel)
nn.LSTM(x)                  ->  cuDNN RNN
F.scaled_dot_product_attention -> cuDNN Attention (or FlashAttention)
```

### cuBLAS LT (Lightweight) for Transformer Workloads

cuBLAS LT provides even more control for deep learning GEMM operations:

```cpp
#include <cublasLt.h>

// cuBLAS LT enables:
// - Epilogue fusion (GEMM + bias + activation in one call)
// - Layout flexibility (row-major, column-major, interleaved)
// - Algorithm heuristics specific to deep learning shapes
// - INT8 GEMM with output scaling

cublasLtMatmulDescCreate(&matmulDesc, CUBLAS_COMPUTE_32F, CUDA_R_32F);

// Fuse bias addition into GEMM
cublasLtMatmulDescSetAttribute(
    matmulDesc,
    CUBLASLT_MATMUL_DESC_BIAS_POINTER,
    &bias_ptr, sizeof(bias_ptr)
);

// Fuse activation function
cublasLtEpilogue_t epilogue = CUBLASLT_EPILOGUE_RELU_BIAS;
cublasLtMatmulDescSetAttribute(
    matmulDesc,
    CUBLASLT_MATMUL_DESC_EPILOGUE,
    &epilogue, sizeof(epilogue)
);
```

---

## 8. Custom Hardware for AI

### The AI Accelerator Landscape

The demand for AI compute has driven an explosion of specialized hardware. Each design makes different tradeoffs between flexibility, efficiency, and programmability.

### NVIDIA GPUs: The Default Platform

```
Architecture  | Chip  | Year | Tensor TFLOPS (FP16) | HBM     | Interconnect
--------------|-------|------|----------------------|---------|-------------
Volta         | V100  | 2017 | 125                  | 32 GB   | NVLink 2
Ampere        | A100  | 2020 | 312                  | 80 GB   | NVLink 3
Hopper        | H100  | 2022 | 1979                 | 80 GB   | NVLink 4
Blackwell     | B200  | 2024 | 4500                 | 192 GB  | NVLink 5

Key advantages:
  - CUDA ecosystem (20+ years of software)
  - cuDNN, cuBLAS, TensorRT, NCCL
  - Massive developer community
  - NVLink/NVSwitch for multi-GPU scaling

Key limitations:
  - Cost ($25K-$40K per GPU for datacenter)
  - Power consumption (300-1000W per chip)
  - Supply constraints
  - General-purpose overhead
```

### Google TPUs (Tensor Processing Units)

TPUs are Google's custom ASICs designed specifically for matrix multiplication workloads.

```
TPU Architecture:

  +------------------------------------------+
  |  TPU Core                                 |
  |  +--------------------------------------+ |
  |  |  Matrix Multiply Unit (MXU)          | |
  |  |  128 x 128 systolic array            | |
  |  |  BF16 multiply, FP32 accumulate      | |
  |  +--------------------------------------+ |
  |  |  Vector Processing Unit (VPU)        | |
  |  |  Activation functions, normalization | |
  |  +--------------------------------------+ |
  |  |  High Bandwidth Memory (HBM)         | |
  |  +--------------------------------------+ |
  +------------------------------------------+

TPU Generations:
  TPU v2 (2017):  46 TFLOPS BF16, 8 GB HBM
  TPU v3 (2018):  123 TFLOPS BF16, 16 GB HBM
  TPU v4 (2021):  275 TFLOPS BF16, 32 GB HBM
  TPU v5e (2023): 197 TFLOPS BF16, 16 GB HBM (cost-optimized)
  TPU v5p (2023): 459 TFLOPS BF16, 95 GB HBM
  TPU v6e (2024): ~900 TFLOPS BF16, HBM3

Systolic Array:
  Data flows through a grid of processing elements:

  a[0] -> [PE] -> [PE] -> [PE] -> ...
            |       |       |
  a[1] -> [PE] -> [PE] -> [PE] -> ...
            |       |       |
  a[2] -> [PE] -> [PE] -> [PE] -> ...

  Each PE: accumulator += a[i] * b[j]
  128x128 = 16,384 multiply-accumulate per cycle
```

Key characteristics:

- **Systolic array** architecture (vs NVIDIA's SIMT + Tensor Core)
- **BF16 native** (Google co-invented BF16)
- **Pod-level scaling**: TPU pods connect thousands of chips via custom interconnect (ICI)
- **Software**: JAX/XLA compiler (not CUDA)
- **Availability**: Google Cloud only

### AWS Trainium and Inferentia

```
Trainium (Training):
  - Custom chip from AWS Annapurna Labs
  - 2x NeuronCores per chip
  - Each NeuronCore: SIMD engines + tensor engines
  - BF16, FP16, FP32, TF32 support
  - 512 GB HBM per Trn1.32xlarge instance
  - NeuronLink for chip-to-chip communication
  - 40% cost savings vs GPU for training (claimed)

Inferentia2 (Inference):
  - Optimized for inference workloads
  - 2x NeuronCores per chip
  - Lower latency, higher throughput per dollar
  - INT8, FP16, BF16 support
  - Ideal for real-time serving

Software Stack:
  PyTorch/JAX -> Neuron SDK -> NeuronCore ISA

  # AWS Neuron integration with PyTorch
  import torch
  import torch_neuronx

  model = MyModel()
  example_input = torch.randn(1, 3, 224, 224)
  traced_model = torch_neuronx.trace(model, example_input)
  output = traced_model(real_input)
```

### Apple Neural Engine (ANE)

```
Apple Silicon Neural Engine:
  M1:  16-core ANE, 11 TOPS
  M2:  16-core ANE, 15.8 TOPS
  M3:  16-core ANE, 18 TOPS
  M4:  16-core ANE, 38 TOPS

Architecture:
  - Fixed-function cores optimized for neural network inference
  - INT8/FP16 compute
  - Runs Core ML models
  - Shares unified memory with CPU and GPU

Usage:
  # Convert to Core ML for ANE execution
  import coremltools as ct

  model = torch.load("model.pt")
  traced = torch.jit.trace(model, example_input)
  coreml_model = ct.convert(
      traced,
      inputs=[ct.TensorType(shape=example_input.shape)],
      compute_units=ct.ComputeUnit.ALL  # CPU + GPU + ANE
  )
  coreml_model.save("model.mlpackage")

Limitations:
  - No direct programming (must go through Core ML)
  - Not all operations map to ANE (fallback to GPU/CPU)
  - Training not supported (inference only)
  - No HBM (relies on unified memory bandwidth)
```

### Cerebras: Wafer-Scale Engine

```
Cerebras WSE-3 (2024):
  - Single chip = entire silicon wafer (46,225 mm^2)
  - 900,000 AI-optimized cores
  - 44 GB on-chip SRAM (no external memory bottleneck)
  - 125 PFLOPS FP16 (per wafer)

Architecture (radical departure from GPU):

  Traditional GPU:              Cerebras WSE:
  +--------+                    +----------------------------------+
  |  GPU   | <-> HBM            | Core Core Core Core Core ...     |
  | Cores  |    (bottleneck)    | Core Core Core Core Core ...     |
  +--------+                    | Core Core Core Core Core ...     |
                                | (all interconnected on-wafer)    |
                                | (44GB SRAM - no HBM needed)     |
                                +----------------------------------+

Key advantage: No memory wall. All data lives in on-chip SRAM.
Key limitation: Single-wafer cost, limited batch size, specialized software.
```

### Groq: Deterministic Execution

```
Groq LPU (Language Processing Unit):
  - TSP (Tensor Streaming Processor) architecture
  - SRAM-only design (no HBM, no caches)
  - Deterministic execution (no cache misses, no branch prediction)
  - Software-scheduled (compiler decides everything)

Key properties:
  - Predictable latency (no variability from cache behavior)
  - Extremely high single-stream performance
  - Ideal for real-time inference
  - 750 TOPS INT8

Architecture:
  +-----------------------------+
  | Functional Slices           |
  | [MXM][MXM][MXM][MXM]       |  MXM = Matrix Multiply
  | [VXM][VXM][VXM][VXM]       |  VXM = Vector Multiply
  | [SXM][SXM][SXM][SXM]       |  SXM = Scalar Execute
  | [MEM][MEM][MEM][MEM]        |  MEM = SRAM banks
  +-----------------------------+

  Data streams through slices in a pipeline.
  Compiler statically schedules all data movement.
```

### SambaNova: Reconfigurable Dataflow

```
SambaNova SN40L:
  - Reconfigurable Dataflow Architecture (RDA)
  - Pattern Compute Units (PCUs) + Pattern Memory Units (PMUs)
  - Three-tier memory: registers -> scratchpad -> HBM
  - Dataflow graph mapped spatially onto hardware

Key differentiator:
  - Spatial computing: operations mapped to physical locations
  - No instruction fetch/decode overhead
  - Efficient for inference of very large models
  - Composition of Experts (CoE) for multi-model serving
```

### Architecture Comparison Matrix

```
                 | NVIDIA GPU | Google TPU | AWS Trainium | Cerebras | Groq
-----------------|------------|------------|--------------|----------|------
Compute Model    | SIMT       | Systolic   | SIMD+Tensor  | Mesh     | Stream
Memory           | HBM+SRAM  | HBM        | HBM          | SRAM     | SRAM
Training         | Excellent  | Excellent  | Good         | Limited  | No
Inference        | Excellent  | Good       | Excellent    | Good     | Excellent
Programmability  | CUDA/PTX   | XLA        | Neuron SDK   | Custom   | Custom
Ecosystem        | Massive    | Large      | Growing      | Small    | Small
Multi-chip Scale | NVLink     | ICI        | NeuronLink   | Limited  | Rack
Cost Efficiency  | Baseline   | ~0.7x      | ~0.6x        | Varies   | Varies
Availability     | Everywhere | GCP        | AWS          | On-prem  | Cloud
```

---

## 9. Inference Optimization

### The Inference Challenge

Training and inference have fundamentally different performance characteristics:

```
Training:                           Inference:
  - Large batches (compute-bound)    - Small batches (memory-bound)
  - Forward + backward               - Forward only
  - FP16/BF16 acceptable             - INT8/INT4 often needed
  - Throughput matters                - Latency matters
  - GPU utilization high              - GPU often underutilized
```

### Operator Fusion

The single most impactful optimization. Instead of launching separate kernels for each operation, fuse them into one.

```
Before fusion (4 kernel launches, 4 HBM round-trips):
  Input -> [Kernel 1: MatMul] -> HBM -> [Kernel 2: Bias] -> HBM
        -> [Kernel 3: GELU] -> HBM -> [Kernel 4: Dropout] -> HBM -> Output

After fusion (1 kernel launch, 1 HBM round-trip):
  Input -> [Fused Kernel: MatMul + Bias + GELU + Dropout] -> Output

Speedup comes from:
  1. Fewer kernel launches (each launch has ~5-10us overhead)
  2. Fewer HBM reads/writes (bandwidth is the bottleneck)
  3. Intermediate values stay in registers/shared memory
```

Common fusion patterns in transformers:

```
Pattern                                    | Savings
-------------------------------------------|-------------------
QKV projection: 3 GEMMs -> 1 GEMM         | 3x fewer launches
Bias + Activation: 2 kernels -> 1          | 2x fewer HBM trips
Residual + LayerNorm: 2 kernels -> 1       | 2x fewer HBM trips
Attention (FlashAttention): 5+ -> 1        | No N^2 materialization
MLP: Linear+GELU+Linear -> fused           | ~3x fewer HBM trips
```

### Graph Optimization

Deep learning compilers optimize the computation graph before generating kernels:

```
Original Graph:
  x -> Transpose -> MatMul -> Add(bias) -> ReLU -> MatMul -> Softmax

Optimized Graph:
  x -> FusedMatMulBiasReLU -> MatMul -> Softmax

Optimizations applied:
  1. Constant folding: pre-compute static operations
  2. Dead code elimination: remove unused branches
  3. Operator fusion: combine adjacent ops
  4. Layout optimization: avoid unnecessary transposes
  5. Memory planning: reuse buffers when possible
```

### Kernel Auto-Tuning

Different input shapes require different kernel configurations:

```python
# TensorRT auto-tunes kernels during engine build
# It tries multiple implementations and picks the fastest

# Example: For a GEMM with M=1, N=4096, K=4096
# Small M -> memory-bound -> use kernel optimized for low batch
#   Option A: Tile 16x128x32, 2 stages (best for M=1)
#   Option B: Tile 128x128x32, 4 stages (best for M=128)

# TensorRT profiles:
builder_config.add_optimization_profile(profile)
profile.set_shape(
    "input",
    min=(1, 4096),      # minimum shape
    opt=(32, 4096),     # optimal shape (most common)
    max=(128, 4096)     # maximum shape
)
# Builds optimized kernels for each shape range
```

### Batching Strategies for LLM Serving

```
Static Batching:
  Wait for B requests, process together.
  Problem: all requests must finish before any can return.

  Request 1: [=========]
  Request 2: [=====]          <- waits for Request 1
  Request 3: [============]   <- everyone waits for this
  Batch completes: [============]  (latency = max)

Continuous Batching (Iteration-Level):
  Process one token at a time. Requests can enter and exit independently.

  Step 1: [R1, R2, R3] -> next token for each
  Step 2: [R1, R2, R3] -> R2 finishes, returns immediately
  Step 3: [R1, R4, R3] -> R4 joins, R2's slot reused
  Step 4: [R1, R4, R3] -> R1 finishes
  ...

  Much better GPU utilization and latency.

PagedAttention (vLLM):
  KV cache managed like OS virtual memory pages.

  Physical KV blocks:  [Block 0][Block 1][Block 2][Block 3]...
  Request 1 page table: 0 -> Block 2, 1 -> Block 5, 2 -> Block 1
  Request 2 page table: 0 -> Block 0, 1 -> Block 3

  Benefits:
    - No fragmentation (blocks allocated on demand)
    - Memory sharing (prompt caching, beam search)
    - Near-zero waste (vs. pre-allocating max sequence length)
```

### Serving Frameworks

**TensorRT (NVIDIA)**:

```python
# TensorRT optimization pipeline
import tensorrt as trt

# 1. Parse model (ONNX, UFF, or Caffe)
# 2. Apply optimizations (layer fusion, precision calibration)
# 3. Select optimal kernels per layer
# 4. Serialize engine for deployment

# TensorRT-LLM for large language models
from tensorrt_llm import LLM, SamplingParams

llm = LLM(model="meta-llama/Llama-3-8B")
outputs = llm.generate(
    ["What is deep learning?"],
    sampling_params=SamplingParams(temperature=0.8, top_p=0.95)
)
```

**ONNX Runtime**:

```python
import onnxruntime as ort

# Load with CUDA execution provider
session = ort.InferenceSession(
    "model.onnx",
    providers=[
        ('CUDAExecutionProvider', {
            'device_id': 0,
            'arena_extend_strategy': 'kNextPowerOfTwo',
            'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB
        }),
        'CPUExecutionProvider'
    ]
)

# Run optimized inference
outputs = session.run(None, {"input": input_array})
```

**vLLM**:

```python
from vllm import LLM, SamplingParams

# vLLM: PagedAttention + Continuous Batching
llm = LLM(
    model="meta-llama/Llama-3-70B",
    tensor_parallel_size=4,     # split across 4 GPUs
    dtype="float16",
    quantization="awq",        # 4-bit quantization
    max_model_len=8192,
    gpu_memory_utilization=0.9
)

sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=256
)

outputs = llm.generate(prompts, sampling_params)
```

### Speculative Decoding

Use a small "draft" model to generate candidate tokens, then verify with the large model in parallel:

```
Standard autoregressive:
  Large model: [tok1] -> [tok2] -> [tok3] -> [tok4] -> [tok5]
  Time:         1x       1x       1x       1x       1x     = 5 steps

Speculative decoding:
  Draft model:   [tok1, tok2, tok3, tok4, tok5]  (fast, all at once)
  Large model:   verify([tok1, tok2, tok3, tok4, tok5])  (1 forward pass)
  Result:        tok1 OK, tok2 OK, tok3 WRONG -> accept tok1, tok2
                 Regenerate from tok3 with large model

  If draft model is ~70% accurate:
    Average tokens per large-model step: ~3-4
    Speedup: ~2-3x
```

### KV Cache Optimization

```
The KV cache is the dominant memory consumer in LLM inference:

  Memory = 2 * num_layers * num_heads * head_dim * seq_len * batch_size * bytes_per_element

  Example: Llama-3 70B, batch=32, seq_len=4096, FP16
  Memory = 2 * 80 * 64 * 128 * 4096 * 32 * 2 bytes = ~336 GB!

Optimization techniques:

  1. Multi-Query Attention (MQA):
     Share K,V across all heads -> 8-64x KV cache reduction

  2. Grouped-Query Attention (GQA):
     Share K,V across groups of heads -> 4-8x reduction

  3. Quantized KV Cache:
     Store KV in INT8 or FP8 -> 2-4x reduction

  4. Sliding Window Attention:
     Only cache last W tokens -> bounded memory

  5. PagedAttention (vLLM):
     No fragmentation -> ~3-5% waste (vs ~60-80% with naive allocation)
```

---

## 10. The Full Stack

### From model.forward() to Tensor Core Instructions

Let us trace a single PyTorch operation through the entire software and hardware stack.

```python
# User code
output = model.linear(input)  # nn.Linear: output = input @ weight.T + bias
```

### Layer 1: Python (PyTorch Frontend)

```python
# nn.Linear.forward() in torch/nn/modules/linear.py
class Linear(Module):
    def forward(self, input: Tensor) -> Tensor:
        return F.linear(input, self.weight, self.bias)

# F.linear dispatches to torch._C._nn.linear
# which is a C++ binding
```

### Layer 2: C++ Dispatcher (ATen)

```cpp
// aten/src/ATen/native/Linear.cpp
Tensor linear(const Tensor& input, const Tensor& weight,
              const c10::optional<Tensor>& bias) {
    // Shape checks
    TORCH_CHECK(input.dim() >= 2, "...");

    if (input.dim() == 2 && bias.has_value()) {
        // Fused path: addmm (matrix multiply + bias add)
        return at::addmm(*bias, input, weight.t());
    }

    // General path: matmul then add
    auto output = at::matmul(input, weight.t());
    if (bias.has_value()) {
        output = output + *bias;
    }
    return output;
}
```

### Layer 3: Backend Selection

```
ATen Dispatcher routes based on:
  - Device: CPU, CUDA, MPS, XLA, etc.
  - Dtype: float32, float16, bfloat16, etc.
  - Autograd: needs gradient tracking?

  at::addmm on CUDA tensor
       |
       v
  aten/src/ATen/native/cuda/Blas.cpp
       |
       v
  Calls cublasSgemm / cublasGemmEx / cublasLtMatmul
  depending on dtype and hardware
```

### Layer 4: cuBLAS Library

```cpp
// Inside cuBLAS (simplified view)
cublasStatus_t cublasGemmEx(
    cublasHandle_t handle,
    cublasOperation_t transa, cublasOperation_t transb,
    int m, int n, int k,
    const void* alpha,
    const void* A, cudaDataType Atype, int lda,
    const void* B, cudaDataType Btype, int ldb,
    const void* beta,
    void* C, cudaDataType Ctype, int ldc,
    cublasComputeType_t computeType,
    cublasGemmAlgo_t algo
) {
    // cuBLAS internally:
    // 1. Selects optimal tiling (e.g., 128x128x32)
    // 2. Chooses kernel based on shape + hardware
    // 3. Launches CUDA kernel with Tensor Core instructions
}
```

### Layer 5: CUDA Kernel (cuBLAS Internal)

```
cuBLAS GEMM kernel structure (conceptual):

__global__ void gemm_kernel(...) {
    // 1. Load tiles of A and B into shared memory
    //    Using cp.async for asynchronous loads (Ampere+)

    // 2. For each K-tile:
    //    a. Load from shared memory to register fragments
    //    b. Execute WMMA / MMA instructions on Tensor Cores
    //    c. Prefetch next K-tile

    // 3. Apply epilogue (alpha * C_acc + beta * C_old)

    // 4. Store result to global memory
}
```

### Layer 6: PTX (Parallel Thread Execution)

```
// PTX is NVIDIA's virtual ISA
// Tensor Core MMA instruction:

.reg .f32 %acc<4>;           // FP32 accumulator registers
.reg .b32 %a<4>, %b<2>;     // FP16 input registers (packed)

// Load inputs from shared memory
ld.shared.b32 %a0, [smem_a + 0];
ld.shared.b32 %a1, [smem_a + 4];
ld.shared.b32 %b0, [smem_b + 0];
ld.shared.b32 %b1, [smem_b + 4];

// Tensor Core matrix multiply-accumulate
// m16n8k16: 16x8x16 tile, FP16 inputs, FP32 accumulate
mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32
    {%acc0, %acc1, %acc2, %acc3},   // D (output accumulator)
    {%a0, %a1, %a2, %a3},           // A operand
    {%b0, %b1},                      // B operand
    {%acc0, %acc1, %acc2, %acc3};   // C (input accumulator)
```

### Layer 7: SASS (Shader Assembly)

```
// SASS is the native GPU machine code
// PTX compiles to SASS via ptxas

// Ampere SASS for Tensor Core MMA:
HMMA.16816.F32    R4, R0, R2, R4 ;
//  |       |       |    |    |
//  |       |       |    |    +-- Accumulator (read and written)
//  |       |       |    +------- B operand register
//  |       |       +------------ A operand register
//  |       +-------------------- Shape: 16x8x16
//  +---------------------------- Half-precision MMA instruction

// This single instruction:
// - Reads 16x16 FP16 elements of A from registers across the warp
// - Reads 16x8 FP16 elements of B from registers across the warp
// - Multiplies them on Tensor Cores
// - Accumulates into FP32 registers
// - Completes in ~1-2 cycles on the Tensor Core pipeline
```

### Layer 8: Hardware Execution

```
SM (Streaming Multiprocessor)
  |
  +-- Warp Scheduler selects a warp with MMA instruction ready
  |
  +-- Dispatches to Tensor Core Unit
  |     |
  |     +-- Tensor Core receives register fragments from 32 threads
  |     +-- Executes 16x8x16 FP16 MMA in hardware
  |     +-- Results written back to register file
  |
  +-- Warp Scheduler selects next ready warp
       (latency hiding: while one warp waits, others execute)

Tensor Core Pipeline:
  Cycle 0: Warp 0 MMA dispatched
  Cycle 1: Warp 1 MMA dispatched (Warp 0 still computing)
  Cycle 2: Warp 2 MMA dispatched
  ...
  Cycle N: Warp 0 MMA completes, results in registers
```

### The Complete Picture

```
Python                  model.linear(x)
  |                          |
  | (Python -> C++ via pybind11)
  v                          v
C++ (ATen)             at::addmm(bias, input, weight.t())
  |                          |
  | (dispatcher -> CUDA backend)
  v                          v
cuBLAS                 cublasGemmEx(handle, ..., CUDA_R_16F, ...)
  |                          |
  | (kernel selection + launch)
  v                          v
CUDA Kernel            gemm_128x128x32_stages4_warps4
  |                          |
  | (compiled to PTX, then SASS)
  v                          v
PTX                    mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32
  |                          |
  | (assembled to native GPU instructions)
  v                          v
SASS                   HMMA.16816.F32 R4, R0, R2, R4
  |                          |
  | (decoded by hardware)
  v                          v
Tensor Core            128 FMA ops in 1 cycle on silicon
```

### Autograd Integration

The story continues for training, where gradients flow backward:

```python
# Forward pass (traced by autograd)
output = model.linear(input)        # records: LinearBackward
loss = criterion(output, target)    # records: LossBackward

# Backward pass (autograd replays in reverse)
loss.backward()
# 1. LossBackward: d_loss/d_output
# 2. LinearBackward:
#    d_loss/d_input = d_loss/d_output @ weight      (cuBLAS GEMM)
#    d_loss/d_weight = input.T @ d_loss/d_output     (cuBLAS GEMM)
#    d_loss/d_bias = d_loss/d_output.sum(dim=0)      (reduction kernel)

# Each backward GEMM goes through the same stack:
#   PyTorch -> ATen -> cuBLAS -> CUDA Kernel -> Tensor Core
```

### torch.compile: The Modern Path

PyTorch 2.0's `torch.compile` adds a compilation step that can optimize the entire graph:

```python
model = torch.compile(model, mode="max-autotune")

# What happens:
# 1. TorchDynamo captures the Python execution as a graph (FX graph)
# 2. TorchInductor (default backend) optimizes the graph:
#    - Operator fusion (e.g., linear + gelu -> fused kernel)
#    - Memory planning (reuse buffers)
#    - Kernel selection (Triton kernels, cuBLAS, custom)
# 3. Generates optimized Triton/CUDA code
# 4. Caches compiled kernels for subsequent calls

# The stack becomes:
# Python -> TorchDynamo -> FX Graph -> TorchInductor ->
#   Triton kernel (for fused ops) or cuBLAS (for GEMM)
```

---

## DL Hardware Timeline

```
2012  AlexNet wins ImageNet using 2x GTX 580 GPUs
      -> Deep learning on GPUs begins

2015  cuDNN v3: optimized convolution algorithms
      -> Training speed jumps 10x

2016  NVIDIA Pascal (P100): first GPU with HBM2
      -> NVLink introduced for multi-GPU

2017  NVIDIA Volta (V100): FIRST Tensor Cores
      -> Mixed precision training becomes viable
      Google TPU v1: inference-only ASIC
      Google TPU v2: training support added

2018  BERT and GPT: transformer era begins
      -> Attention becomes the dominant operation
      NVIDIA Turing: Tensor Cores in consumer GPUs

2019  Mixed precision training widely adopted
      -> 2x training speedup becomes standard

2020  NVIDIA Ampere (A100): TF32, BF16, sparsity, MIG
      -> 20x AI performance vs V100 (with sparsity)
      GPT-3: 175B parameters, trained on 10K GPUs

2021  Google TPU v4: 4096-chip pods
      AWS Trainium launched
      -> Cloud-specific AI chips emerge

2022  NVIDIA Hopper (H100): FP8, Transformer Engine
      -> HBM3, 3x bandwidth vs A100
      FlashAttention paper: memory-efficient attention
      ChatGPT: LLM inference at massive scale

2023  FlashAttention-2: near-optimal GPU utilization
      GPTQ, AWQ: weight-only INT4 quantization
      vLLM: PagedAttention for LLM serving
      Groq LPU: deterministic inference chip
      -> LLM inference optimization becomes critical

2024  NVIDIA Blackwell (B200): FP4, 2x Tensor Core FLOPS
      Google TPU v6e
      OpenAI Triton matures as CUDA alternative
      Apple M4 Neural Engine: 38 TOPS on-device
      -> Multi-chip, multi-vendor landscape

2025  NVIDIA Rubin architecture announced
      FP4 quantization mainstream
      Mixture-of-Experts hardware optimization
      -> Efficiency and cost-per-token drive innovation

2026  Inference dominates compute spend
      Custom silicon for specific model architectures
      Photonic and analog compute prototypes
      -> Hardware specialization accelerates
```

---

## Interview Questions

### Tensor Cores

**Q1: What is a Tensor Core and how does it differ from a regular CUDA core?**

A regular CUDA core performs one fused multiply-add (FMA) per cycle: `d = a * b + c` on scalar values (2 FLOP). A Tensor Core performs a matrix multiply-accumulate on small matrices (e.g., 4x4x4) in a single cycle, yielding hundreds of FMAs. Tensor Cores operate cooperatively across an entire warp (32 threads), where each thread contributes a fragment of the input matrices. The key difference is specialization: CUDA cores are general-purpose, while Tensor Cores are fixed-function units that only do matrix MMA but do it extremely fast.

**Q2: Explain the WMMA API lifecycle. What are the four key operations?**

The WMMA API has four operations: (1) `fill_fragment` initializes a fragment with a scalar value (typically zero for accumulators), (2) `load_matrix_sync` loads a tile from memory into a fragment distributed across the warp, (3) `mma_sync` performs the matrix multiply-accumulate D = A \* B + C using Tensor Cores, and (4) `store_matrix_sync` writes the result fragment back to memory. All operations have `_sync` suffix because they require warp-level synchronization -- all 32 threads must participate.

**Q3: Why must GEMM dimensions be multiples of 16 (or 8) for Tensor Cores?**

Tensor Cores operate on fixed tile sizes (e.g., 16x16x16 for FP16). If matrix dimensions are not multiples of the tile size, the edges require padding with zeros, wasting compute. Libraries like cuBLAS handle this padding internally but performance degrades. For optimal Tensor Core utilization, dimensions should be multiples of 8 (minimum) or ideally 64 or 128 (for better tiling). This is why transformer hidden dimensions are typically powers of 2 or multiples of 64.

---

### Mixed Precision

**Q4: Why does mixed precision training use FP32 master weights instead of keeping everything in FP16?**

FP16 has limited precision (~3.3 decimal digits). When optimizer updates are small relative to the weight magnitude (which is common in later training stages), the update `weight += learning_rate * gradient` can be rounded away entirely in FP16 -- the weight does not change at all. FP32 master weights (~7.2 decimal digits) have enough precision to accumulate tiny updates over thousands of steps. The FP16 copy is only used for the fast forward and backward passes.

**Q5: Explain loss scaling. Why is it needed and how does dynamic loss scaling work?**

FP16 can represent values as small as ~6e-8. Many gradient values in deep networks are smaller than this and become zero (underflow), causing the model to stop learning. Loss scaling multiplies the loss by a large factor (e.g., 1024) before the backward pass, which scales all gradients by the same factor, shifting them into FP16's representable range. After the backward pass, gradients are divided by the scale factor. Dynamic loss scaling starts with a large scale and adjusts automatically: if gradients overflow (produce inf/nan), it halves the scale; if training is stable for N steps, it doubles the scale.

**Q6: Compare BF16 and FP16. When would you choose one over the other?**

BF16 has 8 exponent bits (same range as FP32, up to ~3.4e38) but only 7 mantissa bits. FP16 has 5 exponent bits (range only to ~65504) but 10 mantissa bits. For training, BF16 is preferred because its wider range means gradients rarely overflow and loss scaling is usually unnecessary, simplifying the training pipeline. For inference, FP16 can be preferred because its higher precision preserves model accuracy better, and inference does not have gradient overflow issues. BF16 requires Ampere or newer hardware, while FP16 works on Volta and newer.

---

### FlashAttention

**Q7: What is the key insight behind FlashAttention? Why is it faster than standard attention?**

Standard attention materializes the N x N attention matrix in HBM (GPU global memory), requiring O(N^2) memory reads and writes. Since HBM bandwidth (~2 TB/s) is much slower than compute (~300 TFLOPS), attention is memory-bound. FlashAttention tiles the computation so that Q, K, V tiles are loaded into fast SRAM (shared memory, ~19 TB/s), the attention scores are computed and softmax is applied entirely in SRAM, and only the final output is written to HBM. The N x N matrix is never materialized in HBM. Total HBM I/O drops from O(N^2) to O(N^2 \* d^2 / M) where M is SRAM size, which is significantly less for practical values.

**Q8: Explain the online softmax trick used in FlashAttention.**

Standard softmax requires two passes: one to find the maximum value (for numerical stability), another to compute exponentials and normalize. With tiling, we do not have access to all values at once. The online softmax trick maintains running statistics: a running maximum `m` and a running sum of exponentials `l`. When processing a new tile, if the new tile has a larger maximum `m_new`, all previously accumulated values are rescaled by `exp(m_old - m_new)`. This rescaling is exact and preserves the mathematical equivalence. The key identity is: `exp(x - m_old) = exp(x - m_new) * exp(m_new - m_old)`.

---

### Quantization

**Q9: Compare post-training quantization (PTQ) and quantization-aware training (QAT). When is each appropriate?**

PTQ quantizes a pre-trained model without any retraining. It uses a small calibration dataset to determine the scale and zero-point for each tensor. PTQ is fast (minutes) and requires no training infrastructure, but can lose accuracy, especially at INT4 precision. QAT inserts "fake quantization" nodes during training that simulate the rounding effects of quantization. Gradients flow through these nodes using the Straight-Through Estimator (STE). QAT produces higher-quality quantized models but requires the full training pipeline and typically needs 10-20% of the original training compute. Use PTQ when accuracy requirements are modest or for quick deployment; use QAT when you need maximum accuracy at low bit widths.

**Q10: How does INT8 quantized matrix multiplication work? What is the dequantization step?**

INT8 GEMM computes `C_int32 = A_int8 @ B_int8` where the multiplication happens in INT8 and accumulation in INT32 (to avoid overflow). After the matmul, the INT32 result must be dequantized back to floating point: `C_fp32 = C_int32 * scale_A * scale_B`. For per-channel quantization, `scale_B` varies per output channel: `C_fp32[i,j] = C_int32[i,j] * scale_A[i] * scale_B[j]`. On Tensor Cores, the INT8 multiplication is natively supported (since Turing) and achieves 2x the throughput of FP16, making it highly attractive for inference.

---

### Triton

**Q11: How does Triton's programming model differ from CUDA? What is the "block" abstraction?**

In CUDA, you write code for a single thread and manage thread cooperation explicitly (shared memory, syncthreads, warp shuffles). In Triton, you write code for a "program" that operates on blocks (tiles) of data. A Triton `tl.load` loads an entire tile; `tl.dot` performs a tile-level matrix multiply. The compiler automatically manages shared memory allocation, memory coalescing, thread-to-data mapping, and register allocation. This higher-level abstraction makes it much easier to write efficient GPU kernels while still achieving 80-95% of hand-tuned CUDA performance.

**Q12: What is Triton's auto-tuning and why is it important?**

Triton's `@triton.autotune` decorator allows specifying multiple kernel configurations (block sizes, number of pipeline stages, warps per block). On the first call with a given set of "key" dimensions, Triton compiles and benchmarks every configuration, then caches the best one. This is important because optimal kernel parameters vary significantly with input shapes and hardware. A matmul kernel tuned for M=128 may perform poorly at M=1. Auto-tuning eliminates the need for manual performance engineering, which is one of the hardest parts of CUDA programming.

---

### cuDNN and cuBLAS

**Q13: What does `torch.backends.cudnn.benchmark = True` do?**

When enabled, cuDNN benchmarks all available algorithm implementations (e.g., for convolution: implicit GEMM, Winograd, FFT, direct) the first time a new input shape is encountered. It then caches the fastest algorithm for that shape and uses it for all subsequent calls. This is beneficial when input shapes are consistent across iterations (typical for training). It should be disabled when input shapes change frequently (variable-length sequences, dynamic resolution), as the benchmarking overhead would be incurred repeatedly.

**Q14: Why does cuBLAS use column-major order by default, and how does this affect PyTorch integration?**

cuBLAS follows the BLAS (Basic Linear Algebra Subprograms) convention from Fortran, which uses column-major layout. PyTorch (and most modern frameworks) use row-major (C-style) layout. To compute the row-major operation C = A @ B using cuBLAS, we exploit the identity: since (AB)^T = B^T A^T, and a row-major matrix looks like its transpose in column-major, we call cuBLAS with the arguments transposed: `cublasSgemm(handle, CUBLAS_OP_N, CUBLAS_OP_N, N, M, K, &alpha, B, N, A, K, &beta, C, N)`. This swapping is handled transparently by PyTorch's ATen layer.

---

### Custom Hardware

**Q15: Compare the architectural approaches of NVIDIA GPUs and Google TPUs. What are the tradeoffs?**

NVIDIA GPUs use a SIMT (Single Instruction, Multiple Thread) model with Tensor Cores for matrix operations. The architecture is general-purpose -- Tensor Cores handle matmul, but CUDA cores handle everything else (activations, normalization, custom ops). Google TPUs use a systolic array architecture (128x128 MXU) purpose-built for matrix multiplication, plus a separate vector unit for element-wise operations. TPUs are more efficient for pure matrix workloads (higher FLOPS/watt) but less flexible for custom operations. GPUs have the massive advantage of the CUDA ecosystem. TPUs require the XLA compiler, which imposes constraints on model code.

**Q16: What is the memory wall problem, and how do Cerebras and Groq attempt to solve it?**

The memory wall is the growing gap between compute speed and memory bandwidth. GPUs can perform trillions of operations per second but HBM can only deliver ~2-3 TB/s of data -- many operations are memory-bound, not compute-bound. Cerebras solves this with a wafer-scale chip containing 44 GB of on-chip SRAM, eliminating the need for off-chip memory entirely. All data lives next to the compute. Groq uses an SRAM-only architecture with deterministic, compiler-scheduled data movement -- no caches, no cache misses, perfectly predictable performance. Both approaches trade off capacity (limited SRAM) for bandwidth (SRAM is 10-100x faster than HBM).

---

### Inference Optimization

**Q17: Explain operator fusion and why it matters more for inference than training.**

Operator fusion combines multiple sequential operations into a single GPU kernel. Instead of writing intermediate results to HBM between each operation, the fused kernel keeps data in registers or shared memory. This matters more for inference because: (1) inference uses smaller batch sizes, making operations memory-bound rather than compute-bound, so reducing memory traffic has a larger impact; (2) inference does not need to store intermediate activations for the backward pass; (3) inference latency is user-facing, so even small per-operation improvements compound across the model.

**Q18: What is PagedAttention (vLLM), and why is it important for LLM serving?**

PagedAttention manages the KV cache using a paging mechanism inspired by operating system virtual memory. Instead of pre-allocating a contiguous memory block for the maximum possible sequence length (which wastes 60-80% of GPU memory on average), PagedAttention allocates memory in small fixed-size blocks on demand. A page table maps each request's logical KV positions to physical memory blocks. Benefits include: near-zero memory waste (only ~3-5% internal fragmentation), ability to share KV cache blocks across requests (e.g., shared system prompts), support for complex scheduling (beam search, parallel sampling), and higher throughput because more requests fit in GPU memory simultaneously.

---

### The Full Stack

**Q19: Trace the execution of `y = torch.mm(A, B)` where A and B are FP16 CUDA tensors. What happens at each layer of the stack?**

1. **Python**: `torch.mm` calls into C++ via pybind11.
2. **ATen Dispatcher**: Routes to the CUDA backend based on tensor device and dtype.
3. **CUDA Backend**: Calls `cublasGemmEx` with `CUDA_R_16F` input types and `CUBLAS_COMPUTE_32F` compute type.
4. **cuBLAS**: Selects an optimized GEMM kernel based on matrix dimensions and GPU architecture. For FP16 on Ampere+, this will be a Tensor Core kernel.
5. **CUDA Kernel**: The selected kernel loads tiles of A and B into shared memory, then into register fragments, and issues `mma.sync` PTX instructions.
6. **PTX -> SASS**: The `mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32` PTX instruction is assembled to `HMMA.16816.F32` SASS instruction.
7. **Hardware**: The warp scheduler dispatches the MMA instruction to the Tensor Core unit, which executes a 16x8x16 matrix multiply-accumulate in silicon, producing FP32 accumulator results that are stored back to the register file.

**Q20: How does `torch.compile` change the execution path compared to eager mode?**

In eager mode, each operation executes immediately through the Python -> ATen -> cuBLAS/cuDNN -> CUDA kernel path. There is no cross-operation optimization -- each op is independent. With `torch.compile`, TorchDynamo traces the Python execution and captures an FX graph of operations. TorchInductor then optimizes this graph: it fuses operations (e.g., linear + bias + gelu becomes a single Triton kernel), plans memory reuse, selects between Triton-generated kernels and library calls (cuBLAS for large GEMMs), and generates optimized code. The compiled path reduces kernel launch overhead, eliminates unnecessary memory round-trips through fusion, and can produce kernels tailored to exact tensor shapes.
