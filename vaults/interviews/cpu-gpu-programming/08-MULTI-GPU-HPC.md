# Chapter 8: Multi-GPU and High-Performance Computing

A single GPU is fast. Multiple GPUs working together can be transformative. This chapter takes you from programming one GPU to orchestrating entire clusters of them. We cover the CUDA multi-GPU API, NVIDIA's NCCL communication library, MPI integration, GPU-Direct technologies, NVLink/NVSwitch interconnects, SLURM job scheduling, cloud GPU clusters, distributed deep learning frameworks, communication-compute overlap strategies, and topology-aware programming. Every section includes compilable code, ASCII diagrams, and the practical details that separate textbook knowledge from production expertise.

---

## Table of Contents

1. [Multi-GPU Basics](#1-multi-gpu-basics)
2. [NCCL -- NVIDIA Collective Communications Library](#2-nccl----nvidia-collective-communications-library)
3. [MPI + CUDA](#3-mpi--cuda)
4. [GPU-Direct Technologies](#4-gpu-direct-technologies)
5. [NVLink and NVSwitch](#5-nvlink-and-nvswitch)
6. [SLURM -- HPC Job Scheduling for GPUs](#6-slurm----hpc-job-scheduling-for-gpus)
7. [Cloud GPU Clusters](#7-cloud-gpu-clusters)
8. [Distributed Deep Learning](#8-distributed-deep-learning)
9. [Performance -- Communication Overlap and All-Reduce Algorithms](#9-performance----communication-overlap-and-all-reduce-algorithms)
10. [Topology-Aware Programming](#10-topology-aware-programming)
11. [Scaling Checklist](#scaling-checklist)
12. [Interview Questions](#interview-questions)

---

## 1. Multi-GPU Basics

### 1.1 Why Multiple GPUs?

A single NVIDIA H100 delivers ~60 TFLOPS FP32 and 80 GB HBM3. For training a 175-billion-parameter model or running molecular dynamics on millions of atoms, one GPU is not enough. You need to split work across GPUs -- either by splitting data (data parallelism), splitting the model (model parallelism), or both.

```
Single GPU Limits vs Multi-GPU Scaling:

Single GPU:
+--------+
| GPU 0  |  80 GB HBM, 60 TFLOPS
+--------+
   |
   | Memory-bound for large models
   | Compute-bound for large batches
   v
   Bottleneck!

Multi-GPU (8x H100 DGX):
+--------+ +--------+ +--------+ +--------+
| GPU 0  | | GPU 1  | | GPU 2  | | GPU 3  |
+--------+ +--------+ +--------+ +--------+
    |  NVLink  |  NVLink  |  NVLink  |
+--------+ +--------+ +--------+ +--------+
| GPU 4  | | GPU 5  | | GPU 6  | | GPU 7  |
+--------+ +--------+ +--------+ +--------+

Total: 640 GB HBM, 480 TFLOPS
Inter-GPU bandwidth: 900 GB/s per GPU (NVLink 4.0)
```

### 1.2 cudaSetDevice -- Selecting a GPU

Every CUDA call goes to the **current device**. You switch the current device with `cudaSetDevice()`. This is the foundation of all multi-GPU programming.

```cuda
#include <cuda_runtime.h>
#include <cstdio>

int main() {
    int deviceCount = 0;
    cudaGetDeviceCount(&deviceCount);
    printf("Found %d CUDA devices:\n", deviceCount);

    for (int dev = 0; dev < deviceCount; dev++) {
        cudaDeviceProp prop;
        cudaGetDeviceProperties(&prop, dev);
        printf("  Device %d: %s\n", dev, prop.name);
        printf("    Compute capability: %d.%d\n", prop.major, prop.minor);
        printf("    Global memory: %.2f GB\n",
               prop.totalGlobalMem / (1024.0 * 1024.0 * 1024.0));
        printf("    SMs: %d\n", prop.multiProcessorCount);
        printf("    Max threads/block: %d\n", prop.maxThreadsPerBlock);
    }

    // Set device 0 as current
    cudaSetDevice(0);
    float *d_a0;
    cudaMalloc(&d_a0, 1024 * sizeof(float));  // Allocated on GPU 0

    // Switch to device 1
    cudaSetDevice(1);
    float *d_a1;
    cudaMalloc(&d_a1, 1024 * sizeof(float));  // Allocated on GPU 1

    // CRITICAL: You must be on the right device to free memory
    cudaSetDevice(1);
    cudaFree(d_a1);
    cudaSetDevice(0);
    cudaFree(d_a0);

    return 0;
}
```

```
Device context model:

Host Thread
    |
    |--- cudaSetDevice(0) ---> All CUDA calls go to GPU 0
    |       cudaMalloc()  ------> GPU 0 memory
    |       kernel<<<>>>  ------> GPU 0 execution
    |
    |--- cudaSetDevice(1) ---> All CUDA calls go to GPU 1
    |       cudaMalloc()  ------> GPU 1 memory
    |       kernel<<<>>>  ------> GPU 1 execution
    |
    v

WARNING: Memory allocated on GPU 0 cannot be directly
         accessed by a kernel running on GPU 1
         (unless peer access is enabled).
```

### 1.3 Peer-to-Peer (P2P) Access

With P2P access enabled, one GPU can directly read/write memory on another GPU without going through the host. This requires GPUs on the same PCIe root complex or connected via NVLink.

```cuda
void enableP2P(int gpu0, int gpu1) {
    int canAccess;
    cudaDeviceCanAccessPeer(&canAccess, gpu0, gpu1);
    if (canAccess) {
        cudaSetDevice(gpu0);
        cudaDeviceEnablePeerAccess(gpu1, 0);
    }
    cudaDeviceCanAccessPeer(&canAccess, gpu1, gpu0);
    if (canAccess) {
        cudaSetDevice(gpu1);
        cudaDeviceEnablePeerAccess(gpu0, 0);
    }
}

__global__ void readFromPeer(float* dst, const float* src, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) dst[idx] = src[idx];  // src is on a DIFFERENT GPU!
}

int main() {
    const int N = 1 << 20;
    enableP2P(0, 1);

    cudaSetDevice(0); float *d_src; cudaMalloc(&d_src, N * sizeof(float));
    cudaSetDevice(1); float *d_dst; cudaMalloc(&d_dst, N * sizeof(float));

    // Kernel on GPU 1 reads directly from GPU 0 memory
    cudaSetDevice(1);
    readFromPeer<<<(N + 255) / 256, 256>>>(d_dst, d_src, N);
    cudaDeviceSynchronize();

    cudaSetDevice(1); cudaFree(d_dst);
    cudaSetDevice(0); cudaFree(d_src);
    return 0;
}
```

```
P2P Data Flow:

WITHOUT P2P (through host):
GPU 0 ---(PCIe)---> Host RAM ---(PCIe)---> GPU 1
         ~32 GB/s              ~32 GB/s
         Total: ~16 GB/s effective (bidirectional)

WITH P2P over PCIe:
GPU 0 ---(PCIe switch)---> GPU 1
         ~32 GB/s direct

WITH P2P over NVLink:
GPU 0 ---(NVLink)---> GPU 1
         ~900 GB/s (NVLink 4.0, bidirectional)

Speedup from P2P: up to 28x vs host-staged transfer!
```

### 1.4 Distributing Work Across GPUs

The most common pattern is to split data across GPUs, run kernels in parallel, and then synchronize.

```cuda
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

__global__ void vectorAdd(const float* a, const float* b,
                          float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

int main() {
    const int N = 1 << 24;  // 16M elements
    int numGPUs;
    cudaGetDeviceCount(&numGPUs);
    if (numGPUs < 2) numGPUs = 1;

    int chunkSize = N / numGPUs;

    // Host data
    float *h_a, *h_b, *h_c;
    cudaMallocHost(&h_a, N * sizeof(float));  // Pinned memory
    cudaMallocHost(&h_b, N * sizeof(float));
    cudaMallocHost(&h_c, N * sizeof(float));

    for (int i = 0; i < N; i++) {
        h_a[i] = 1.0f;
        h_b[i] = 2.0f;
    }

    // Per-GPU resources
    float *d_a[8], *d_b[8], *d_c[8];
    cudaStream_t streams[8];

    // Allocate and launch on each GPU
    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        cudaStreamCreate(&streams[g]);

        int offset = g * chunkSize;
        int count = (g == numGPUs - 1) ? (N - offset) : chunkSize;

        cudaMalloc(&d_a[g], count * sizeof(float));
        cudaMalloc(&d_b[g], count * sizeof(float));
        cudaMalloc(&d_c[g], count * sizeof(float));

        // Async copy to GPU
        cudaMemcpyAsync(d_a[g], h_a + offset,
                        count * sizeof(float),
                        cudaMemcpyHostToDevice, streams[g]);
        cudaMemcpyAsync(d_b[g], h_b + offset,
                        count * sizeof(float),
                        cudaMemcpyHostToDevice, streams[g]);

        // Launch kernel
        int threads = 256;
        int blocks = (count + threads - 1) / threads;
        vectorAdd<<<blocks, threads, 0, streams[g]>>>(
            d_a[g], d_b[g], d_c[g], count);

        // Async copy results back
        cudaMemcpyAsync(h_c + offset, d_c[g],
                        count * sizeof(float),
                        cudaMemcpyDeviceToHost, streams[g]);
    }

    // Synchronize all GPUs
    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        cudaStreamSynchronize(streams[g]);
    }

    // Verify
    printf("h_c[0] = %f (expected 3.0)\n", h_c[0]);
    printf("h_c[N-1] = %f (expected 3.0)\n", h_c[N - 1]);

    // Cleanup
    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        cudaFree(d_a[g]);
        cudaFree(d_b[g]);
        cudaFree(d_c[g]);
        cudaStreamDestroy(streams[g]);
    }
    cudaFreeHost(h_a);
    cudaFreeHost(h_b);
    cudaFreeHost(h_c);

    return 0;
}
```

```
Multi-GPU Work Distribution (Data Parallelism):

Input Array A[0..N-1]:
+---------------------------+---------------------------+
|      Chunk 0 (GPU 0)      |      Chunk 1 (GPU 1)      |
+---------------------------+---------------------------+
|  A[0]...A[N/2-1]          |  A[N/2]...A[N-1]          |
+---------------------------+---------------------------+
       |                            |
       v                            v
  +---------+                  +---------+
  |  GPU 0  |                  |  GPU 1  |
  | kernel  |                  | kernel  |
  +---------+                  +---------+
       |                            |
       v                            v
+---------------------------+---------------------------+
|      Result 0              |      Result 1              |
+---------------------------+---------------------------+

Timeline:
GPU 0: [H2D copy][  kernel  ][D2H copy]
GPU 1: [H2D copy][  kernel  ][D2H copy]
                                        ^ Both done here
```

### 1.5 cudaMemcpyPeer -- Explicit GPU-to-GPU Copy

When P2P is available, you can copy directly between GPUs without staging through host memory.

```cuda
// Copy from GPU 0 to GPU 1
cudaMemcpyPeer(d_dst,      // destination pointer
               1,           // destination device
               d_src,       // source pointer
               0,           // source device
               N * sizeof(float));

// Async version with stream
cudaMemcpyPeerAsync(d_dst, 1, d_src, 0,
                    N * sizeof(float), stream);
```

---

## 2. NCCL -- NVIDIA Collective Communications Library

### 2.1 Why NCCL?

Writing efficient multi-GPU communication by hand is hard. NCCL (pronounced "Nickel") provides optimized collective operations that automatically exploit NVLink, NVSwitch, PCIe, and InfiniBand. It is the backbone of distributed training in PyTorch, TensorFlow, and JAX.

```
NCCL in the Software Stack:

+-----------------------------------+
| Application (PyTorch / TensorFlow)|
+-----------------------------------+
| torch.distributed / tf.distribute |
+-----------------------------------+
| NCCL                              |  <--- This section
+-----------------------------------+
| NVLink | PCIe | InfiniBand | RoCE |
+-----------------------------------+
| GPU 0  | GPU 1 | GPU 2 | GPU 3   |
+-----------------------------------+
```

### 2.2 NCCL Initialization

```cuda
#include <nccl.h>
#include <cuda_runtime.h>
#include <cstdio>

#define NCCL_CHECK(cmd) do {                            \
    ncclResult_t res = cmd;                              \
    if (res != ncclSuccess) {                            \
        printf("NCCL error: %s at %s:%d\n",             \
               ncclGetErrorString(res),                  \
               __FILE__, __LINE__);                      \
        exit(EXIT_FAILURE);                              \
    }                                                    \
} while(0)

int main() {
    int numGPUs;
    cudaGetDeviceCount(&numGPUs);

    // Create communicator -- all GPUs in one process
    ncclComm_t comms[8];
    int devs[8];
    for (int i = 0; i < numGPUs; i++) devs[i] = i;

    NCCL_CHECK(ncclCommInitAll(comms, numGPUs, devs));

    printf("NCCL communicator created for %d GPUs\n", numGPUs);

    // Use comms for collective operations...

    // Cleanup
    for (int i = 0; i < numGPUs; i++) {
        ncclCommDestroy(comms[i]);
    }
    return 0;
}
```

For multi-process (multi-node) usage, you use a unique ID:

```cuda
ncclUniqueId id;
if (myRank == 0) {
    ncclGetUniqueId(&id);
}
// Broadcast 'id' via MPI or other mechanism
MPI_Bcast(&id, sizeof(id), MPI_BYTE, 0, MPI_COMM_WORLD);

ncclComm_t comm;
ncclCommInitRank(&comm, worldSize, id, myRank);
```

### 2.3 AllReduce

The most important collective for distributed training. Every GPU contributes a buffer; the result (e.g., sum) is placed on every GPU.

```cuda
void ncclAllReduceExample(int numGPUs) {
    const int N = 1 << 20;
    float *sendbuf[8], *recvbuf[8];
    cudaStream_t streams[8];
    ncclComm_t comms[8];
    int devs[8];

    for (int i = 0; i < numGPUs; i++) devs[i] = i;
    ncclCommInitAll(comms, numGPUs, devs);

    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        cudaStreamCreate(&streams[g]);
        cudaMalloc(&sendbuf[g], N * sizeof(float));
        cudaMalloc(&recvbuf[g], N * sizeof(float));
    }

    // NCCL AllReduce -- must be called in a group
    ncclGroupStart();
    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        ncclAllReduce(sendbuf[g], recvbuf[g], N,
                      ncclFloat, ncclSum, comms[g], streams[g]);
    }
    ncclGroupEnd();

    for (int g = 0; g < numGPUs; g++) {
        cudaSetDevice(g);
        cudaStreamSynchronize(streams[g]);
        // recvbuf[g] now contains sum of all GPUs' sendbuf
    }
}
```

```
AllReduce (Sum) with 4 GPUs:

BEFORE:
GPU 0: [1, 1, 1, ...]
GPU 1: [2, 2, 2, ...]
GPU 2: [3, 3, 3, ...]
GPU 3: [4, 4, 4, ...]

AFTER AllReduce(Sum):
GPU 0: [10, 10, 10, ...]   (1+2+3+4)
GPU 1: [10, 10, 10, ...]   (1+2+3+4)
GPU 2: [10, 10, 10, ...]   (1+2+3+4)
GPU 3: [10, 10, 10, ...]   (1+2+3+4)

Every GPU gets the SAME result.
```

### 2.4 AllGather

Each GPU contributes a chunk; the result is the concatenation of all chunks on every GPU.

```cuda
ncclGroupStart();
for (int g = 0; g < numGPUs; g++) {
    cudaSetDevice(g);
    // Each GPU sends chunkSize elements, receives numGPUs*chunkSize
    ncclAllGather(sendbuf[g], recvbuf[g], chunkSize,
                  ncclFloat, comms[g], streams[g]);
}
ncclGroupEnd();
```

```
AllGather with 4 GPUs (chunkSize = 3):

BEFORE:
GPU 0: send=[A, B, C]
GPU 1: send=[D, E, F]
GPU 2: send=[G, H, I]
GPU 3: send=[J, K, L]

AFTER AllGather:
GPU 0: recv=[A,B,C, D,E,F, G,H,I, J,K,L]
GPU 1: recv=[A,B,C, D,E,F, G,H,I, J,K,L]
GPU 2: recv=[A,B,C, D,E,F, G,H,I, J,K,L]
GPU 3: recv=[A,B,C, D,E,F, G,H,I, J,K,L]
```

### 2.5 ReduceScatter

The inverse of AllGather: reduce first, then scatter the result so each GPU gets a different chunk.

```cuda
ncclGroupStart();
for (int g = 0; g < numGPUs; g++) {
    cudaSetDevice(g);
    // Each GPU sends N elements, receives N/numGPUs elements
    ncclReduceScatter(sendbuf[g], recvbuf[g],
                      N / numGPUs, ncclFloat, ncclSum,
                      comms[g], streams[g]);
}
ncclGroupEnd();
```

```
ReduceScatter (Sum) with 4 GPUs:

BEFORE (each GPU has 8 elements):
GPU 0: [a0, a1, a2, a3, a4, a5, a6, a7]
GPU 1: [b0, b1, b2, b3, b4, b5, b6, b7]
GPU 2: [c0, c1, c2, c3, c4, c5, c6, c7]
GPU 3: [d0, d1, d2, d3, d4, d5, d6, d7]

Step 1 -- Reduce (element-wise sum):
         [a0+b0+c0+d0, a1+b1+c1+d1, ..., a7+b7+c7+d7]

Step 2 -- Scatter (divide into 4 chunks):
GPU 0: [sum0, sum1]           (first quarter)
GPU 1: [sum2, sum3]           (second quarter)
GPU 2: [sum4, sum5]           (third quarter)
GPU 3: [sum6, sum7]           (fourth quarter)

Key use: FSDP/ZeRO -- each GPU owns a shard of the gradients.
```

### 2.6 Broadcast

One GPU sends its data to all others.

```cuda
ncclGroupStart();
for (int g = 0; g < numGPUs; g++) {
    cudaSetDevice(g);
    // GPU 0 (root) broadcasts to all
    ncclBroadcast(sendbuf[g], recvbuf[g], N,
                  ncclFloat, 0 /* root */, comms[g], streams[g]);
}
ncclGroupEnd();
```

```
Broadcast (root = GPU 0):

BEFORE:
GPU 0: [X, Y, Z, ...]   <-- root
GPU 1: [?, ?, ?, ...]
GPU 2: [?, ?, ?, ...]
GPU 3: [?, ?, ?, ...]

AFTER:
GPU 0: [X, Y, Z, ...]
GPU 1: [X, Y, Z, ...]
GPU 2: [X, Y, Z, ...]
GPU 3: [X, Y, Z, ...]
```

### 2.7 Compiling with NCCL

```bash
nvcc -o multi_gpu multi_gpu.cu -lnccl            # Single file
mpicxx -o mpi_nccl mpi_nccl.cu -lcudart -lnccl   # With MPI
```

---

## 3. MPI + CUDA

### 3.1 Why Combine MPI and CUDA?

MPI (Message Passing Interface) is the standard for distributed computing across nodes. CUDA handles GPU programming on each node. Together, they enable multi-node, multi-GPU applications.

```
MPI + CUDA Architecture:

Node 0                          Node 1
+-----------------------------+ +-----------------------------+
| MPI Rank 0    MPI Rank 1    | | MPI Rank 2    MPI Rank 3    |
|  +------+     +------+     | |  +------+     +------+     |
|  |GPU 0 |     |GPU 1 |     | |  |GPU 0 |     |GPU 1 |     |
|  +------+     +------+     | |  +------+     +------+     |
|       |            |        | |       |            |        |
|       +-----+------+        | |       +-----+------+        |
|             |                | |             |                |
|         Host RAM             | |         Host RAM             |
+-------------|----------------+ +-------------|----------------+
              |                                |
              +---------- Network -------------+
              (InfiniBand / RoCE / Ethernet)
```

### 3.2 Basic MPI + CUDA Pattern

```cuda
#include <mpi.h>
#include <cuda_runtime.h>

__global__ void scaleKernel(float* data, float factor, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) data[idx] *= factor;
}

int main(int argc, char** argv) {
    MPI_Init(&argc, &argv);
    int rank, worldSize;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &worldSize);

    // Assign GPU based on local rank
    int numGPUs;
    cudaGetDeviceCount(&numGPUs);
    cudaSetDevice(rank % numGPUs);

    const int N = 1 << 20;
    float *h_data, *d_data, *h_result;
    cudaMallocHost(&h_data, N * sizeof(float));
    cudaMallocHost(&h_result, N * sizeof(float));
    cudaMalloc(&d_data, N * sizeof(float));

    for (int i = 0; i < N; i++) h_data[i] = (float)(rank + 1);

    // GPU compute: H2D -> kernel -> D2H
    cudaMemcpy(d_data, h_data, N * sizeof(float), cudaMemcpyHostToDevice);
    scaleKernel<<<(N + 255) / 256, 256>>>(d_data, 2.0f, N);
    cudaMemcpy(h_data, d_data, N * sizeof(float), cudaMemcpyDeviceToHost);

    // MPI AllReduce on host data
    MPI_Allreduce(h_data, h_result, N, MPI_FLOAT, MPI_SUM, MPI_COMM_WORLD);

    cudaFreeHost(h_data); cudaFreeHost(h_result); cudaFree(d_data);
    MPI_Finalize();
    return 0;
}
```

### 3.3 CUDA-Aware MPI

Standard MPI requires data in host memory. **CUDA-aware MPI** (OpenMPI, MVAPICH2) accepts GPU pointers directly, avoiding the GPU-to-host copy.

```cuda
// Standard MPI (requires host staging):
cudaMemcpy(h_buf, d_buf, size, cudaMemcpyDeviceToHost);
MPI_Send(h_buf, count, MPI_FLOAT, dest, tag, comm);

// CUDA-aware MPI (pass GPU pointer directly):
MPI_Send(d_buf, count, MPI_FLOAT, dest, tag, comm);
//       ^^^^^
//       GPU pointer! MPI handles the transfer.
```

```
CUDA-Aware MPI Data Flow:

Standard MPI (3 copies):
GPU 0 --(cudaMemcpy)--> Host 0 --(Network)--> Host 1 --(cudaMemcpy)--> GPU 1

CUDA-Aware MPI (1 logical transfer):
GPU 0 --(MPI_Send/Recv via GPU-Direct RDMA)--> GPU 1

The MPI library detects GPU pointers and uses:
  1. GPU-Direct RDMA if available (GPU -> NIC -> Network -> NIC -> GPU)
  2. GPU-Direct P2P for intra-node (GPU -> NVLink -> GPU)
  3. Host staging as fallback
```

### 3.4 GPU-Direct RDMA with MPI

```cuda
// GPU-Direct RDMA: NIC reads/writes GPU memory directly
float *d_buf;
cudaMalloc(&d_buf, N * sizeof(float));

// Rank 0 sends GPU buffer directly -- no host staging!
MPI_Send(d_buf, N, MPI_FLOAT, 1, 0, MPI_COMM_WORLD);
// Rank 1 receives directly into GPU buffer
MPI_Recv(d_buf, N, MPI_FLOAT, 0, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
```

### 3.5 Building MPI + CUDA Applications

```bash
nvcc -c kernel.cu -o kernel.o && mpicxx -c main.cpp -o main.o
mpicxx kernel.o main.o -o app -lcudart
mpirun -np 4 --hostfile hosts.txt --bind-to none ./app
```

---

## 4. GPU-Direct Technologies

NVIDIA GPU-Direct is a family of technologies that reduce data movement overhead. Understanding them is critical for high-performance multi-GPU systems.

### 4.1 GPU-Direct Overview

```
GPU-Direct Technology Family:

+----------------------------------------------------------+
|                     GPU-Direct                            |
+----------------------------------------------------------+
|                                                          |
|  GPU-Direct Storage    GPU-Direct RDMA    GPU-Direct P2P |
|  (GDS)                 (GDR)              (P2P)          |
|                                                          |
|  NVMe/NVMe-oF         InfiniBand/RoCE    PCIe/NVLink    |
|  -> GPU                NIC <-> GPU        GPU <-> GPU    |
|                                                          |
+----------------------------------------------------------+

Goal: Eliminate unnecessary copies through host memory.
Traditional:  Device -> Host -> Destination
GPU-Direct:   Device -> Destination (bypass host)
```

### 4.2 GPU-Direct P2P (Peer-to-Peer)

Direct memory access between GPUs on the same node. Already covered in section 1.3. Key points:

```
GPU-Direct P2P Data Path:

INTRA-NODE (same PCIe switch):

    GPU 0                GPU 1
    +-----+              +-----+
    | HBM |              | HBM |
    +--+--+              +--+--+
       |                    |
       +----PCIe Switch-----+
            (32 GB/s)

INTRA-NODE (NVLink):

    GPU 0                GPU 1
    +-----+              +-----+
    | HBM | <===========> | HBM |
    +-----+   NVLink      +-----+
              900 GB/s
              (H100)
```

### 4.3 GPU-Direct RDMA (GDR)

Allows network adapters (InfiniBand, RoCE) to read/write GPU memory directly, bypassing host memory and CPU entirely.

```
GPU-Direct RDMA Data Path:

WITHOUT GDR:                          WITH GDR:
+---------+     +---------+           +---------+     +---------+
| GPU     |     | GPU     |           | GPU     |     | GPU     |
| Memory  |     | Memory  |           | Memory  |     | Memory  |
+----+----+     +----+----+           +----+----+     +----+----+
     |               |                     |               |
     v               ^                     |               ^
+----+----+     +----+----+                |               |
| Host    |     | Host    |                |               |
| Memory  |     | Memory  |                |               |
+----+----+     +----+----+                |               |
     |               |                     |               |
     v               ^                     v               |
+----+----+     +----+----+           +----+----+     +----+----+
| NIC     |====>| NIC     |           | NIC     |====>| NIC     |
+---------+     +---------+           +---------+     +---------+
  Node 0          Node 1               Node 0          Node 1

  4 copies: GPU->Host->NIC->NIC->       2 copies: GPU->NIC->
            Host->GPU                              NIC->GPU

  Latency: ~10 us                       Latency: ~2 us
```

### 4.4 GPU-Direct Storage (GDS)

Allows direct data transfer between NVMe storage and GPU memory, bypassing the CPU and host memory. Critical for AI training data pipelines and large-scale analytics.

```
GPU-Direct Storage:

WITHOUT GDS:
  NVMe SSD --> CPU/Host RAM --> GPU Memory
  (filesystem)  (page cache)    (cudaMemcpy)
  2 copies + CPU involvement

WITH GDS:
  NVMe SSD --> GPU Memory
  (cuFile API)
  1 copy, no CPU involvement

  Bandwidth improvement: up to 3x
  CPU utilization: near zero for I/O
```

```cuda
#include <cufile.h>

// GPU-Direct Storage example (simplified)
void gdsReadExample() {
    CUfileDescr_t cfDesc;
    CUfileHandle_t cfHandle;

    // Open file with cuFile
    int fd = open("/data/training_batch.bin", O_RDONLY | O_DIRECT);
    memset(&cfDesc, 0, sizeof(cfDesc));
    cfDesc.handle.fd = fd;
    cfDesc.type = CU_FILE_HANDLE_TYPE_OPAQUE_FD;
    cuFileHandleRegister(&cfHandle, &cfDesc);

    // Allocate GPU buffer
    void *d_buf;
    cudaMalloc(&d_buf, FILE_SIZE);
    cuFileBufRegister(d_buf, FILE_SIZE, 0);

    // Read directly from NVMe to GPU
    ssize_t bytesRead = cuFileRead(cfHandle, d_buf, FILE_SIZE,
                                    0,   // file offset
                                    0);  // device offset

    // d_buf now contains file data -- no host memory touched!

    cuFileBufDeregister(d_buf);
    cuFileHandleDeregister(cfHandle);
    close(fd);
    cudaFree(d_buf);
}
```

---

## 5. NVLink and NVSwitch

### 5.1 NVLink Evolution

NVLink is NVIDIA's high-bandwidth, energy-efficient interconnect between GPUs (and between CPU and GPU on some platforms like Grace Hopper).

```
NVLink Generation Comparison:

Generation  | Year | Per-Link BW  | Links/GPU | Total BW/GPU
------------|------|------------- |-----------|-------------
NVLink 1.0  | 2016 |  40 GB/s    |    4      |  160 GB/s
NVLink 2.0  | 2018 |  50 GB/s    |    6      |  300 GB/s
NVLink 3.0  | 2020 |  50 GB/s    |   12      |  600 GB/s
NVLink 4.0  | 2022 |  50 GB/s    |   18      |  900 GB/s
NVLink 5.0  | 2025 | 100 GB/s    |   18      | 1800 GB/s

For comparison:
PCIe 4.0 x16:   ~32 GB/s (bidirectional)
PCIe 5.0 x16:   ~64 GB/s (bidirectional)

NVLink 4.0 is ~14x faster than PCIe 5.0!
```

### 5.2 NVLink Topology

```
DGX A100 (8x A100, NVLink 3.0):

Each GPU has 12 NVLink connections.
Not all GPUs are directly connected -- topology matters!

Typical 8-GPU NVLink topology (simplified):

         GPU 0 ----NVLink---- GPU 1
         /   \                /   \
       NVL   NVL            NVL   NVL
       /       \            /       \
    GPU 2     GPU 3     GPU 4     GPU 5
       \       /            \       /
       NVL   NVL            NVL   NVL
         \   /                \   /
         GPU 6 ----NVLink---- GPU 7

Note: The actual topology is more complex -- use nvidia-smi topo -m
      to see the real connectivity on your system.
```

### 5.3 NVSwitch

NVSwitch provides **all-to-all** NVLink connectivity between GPUs. Without NVSwitch, GPUs need multi-hop communication. With NVSwitch, every GPU has a direct NVLink path to every other GPU.

```
Without NVSwitch (mesh):           With NVSwitch (full bisection):

  GPU0 --- GPU1                      GPU0  GPU1  GPU2  GPU3
   | \   / |                           |     |     |     |
   |  \ /  |                           +-----+-----+-----+
   |   X   |                           |   NVSwitch 0    |
   |  / \  |                           +-----+-----+-----+
   | /   \ |                           |     |     |     |
  GPU2 --- GPU3                        +-----+-----+-----+
                                       |   NVSwitch 1    |
Multi-hop for non-adjacent             +-----+-----+-----+
GPUs. Limited bisection BW.            |     |     |     |
                                     GPU4  GPU5  GPU6  GPU7

                                     Every GPU can talk to every
                                     other at full NVLink bandwidth.
                                     Full bisection bandwidth.

DGX H100:
  - 4 NVSwitch chips (3rd generation)
  - 8 H100 GPUs
  - 900 GB/s per GPU
  - 7.2 TB/s total bisection bandwidth
```

### 5.4 DGX Architecture

```
NVIDIA DGX H100 System Architecture:

+==================================================================+
|                        DGX H100                                  |
|                                                                  |
|  +------+  +------+  +------+  +------+                         |
|  |H100-0|  |H100-1|  |H100-2|  |H100-3|                         |
|  | 80GB |  | 80GB |  | 80GB |  | 80GB |                         |
|  +--++--+  +--++--+  +--++--+  +--++--+                         |
|     ||        ||        ||        ||                             |
|  +==++========++========++========++==+                          |
|  |           NVSwitch Fabric          |  (4x NVSwitch v3)       |
|  +==++========++========++========++==+                          |
|     ||        ||        ||        ||                             |
|  +--++--+  +--++--+  +--++--+  +--++--+                         |
|  |H100-4|  |H100-5|  |H100-6|  |H100-7|                         |
|  | 80GB |  | 80GB |  | 80GB |  | 80GB |                         |
|  +------+  +------+  +------+  +------+                         |
|                                                                  |
|  Total GPU Memory: 640 GB HBM3                                   |
|  GPU-GPU BW: 900 GB/s per GPU (NVLink 4.0)                      |
|  System bisection: 7.2 TB/s                                      |
|                                                                  |
|  +----------+  +----------+                                      |
|  | 2x Intel |  | 2 TB     |                                      |
|  | Xeon CPUs|  | DDR5 RAM |                                      |
|  +----------+  +----------+                                      |
|                                                                  |
|  +----+ +----+ +----+ +----+ +----+ +----+ +----+ +----+        |
|  |CX-7| |CX-7| |CX-7| |CX-7| |CX-7| |CX-7| |CX-7| |CX-7|    |
|  | NIC| | NIC| | NIC| | NIC| | NIC| | NIC| | NIC| | NIC|        |
|  +----+ +----+ +----+ +----+ +----+ +----+ +----+ +----+        |
|  8x ConnectX-7 (400 Gb/s InfiniBand each)                       |
|  Total network: 3.2 Tb/s = 400 GB/s                             |
+==================================================================+
```

### 5.5 Querying NVLink Topology

```bash
nvidia-smi topo -m      # Show GPU topology (NV18=18 NVLinks, SYS=cross-NUMA)
nvidia-smi nvlink -s    # Show NVLink status
nvidia-smi nvlink -g 0  # Show NVLink counters for GPU 0
```

---

## 6. SLURM -- HPC Job Scheduling for GPUs

### 6.1 What Is SLURM?

SLURM (Simple Linux Utility for Resource Management) is the dominant job scheduler for HPC clusters. It manages compute resources, schedules jobs, and handles multi-node GPU workloads.

```
SLURM Architecture:

+-------------------+
|   slurmctld       |  Central controller (head node)
| (control daemon)  |  Manages jobs, schedules resources
+--------+----------+
         |
    +----+----+----+----+
    |    |    |    |    |
+---v--+ +--v---+ +--v---+ +--v---+
|slurmd| |slurmd| |slurmd| |slurmd|   Compute nodes
|Node 0| |Node 1| |Node 2| |Node 3|   (each runs slurmd)
|4xGPU | |4xGPU | |4xGPU | |4xGPU |
+------+ +------+ +------+ +------+

Users submit jobs via: sbatch, srun, salloc
SLURM assigns nodes, GPUs, CPUs to jobs.
```

### 6.2 Requesting GPU Resources

```bash
#!/bin/bash
#SBATCH --job-name=gpu_training
#SBATCH --partition=gpu
#SBATCH --nodes=2 --ntasks-per-node=4 --gpus-per-node=4
#SBATCH --cpus-per-task=8 --mem=256G --time=24:00:00
#SBATCH --output=train_%j.out --error=train_%j.err

module load cuda/12.4 nccl/2.21 openmpi/5.0

export MASTER_ADDR=$(scontrol show hostname $SLURM_NODELIST | head -n1)
export MASTER_PORT=29500
export WORLD_SIZE=$((SLURM_NNODES * SLURM_GPUS_PER_NODE))

srun python train.py \
    --num_nodes=$SLURM_NNODES \
    --gpus_per_node=$SLURM_GPUS_PER_NODE \
    --master_addr=$MASTER_ADDR \
    --master_port=$MASTER_PORT
```

### 6.3 Common SLURM Commands for GPU Workloads

```bash
sbatch train.sh                       # Submit job
squeue -p gpu -o "%.8i %.20j %.2t %b" # Check GPU queue
sinfo -p gpu -o "%N %G %C %t"         # GPU resource availability
salloc --partition=gpu --gpus=1        # Interactive GPU session
scancel 12345                          # Cancel job
scontrol show job 12345 | grep -i gpu  # Job GPU details
```

### 6.4 SLURM GRES (Generic Resources) Configuration

```bash
# slurm.conf:    GresTypes=gpu  NodeName=gpu[01-08] Gres=gpu:a100:4
# gres.conf:     Name=gpu Type=a100 File=/dev/nvidia[0-3]
# SLURM auto-sets CUDA_VISIBLE_DEVICES per job (e.g., "0,1" for 2 GPUs)
```

### 6.5 Multi-Node GPU Job Example

```bash
#!/bin/bash
#SBATCH --job-name=nccl_test
#SBATCH --nodes=4 --ntasks-per-node=8 --gpus-per-node=8
#SBATCH --exclusive --time=01:00:00

export NCCL_IB_DISABLE=0      # Enable InfiniBand
export NCCL_IB_HCA=mlx5       # Select HCA
export NCCL_DEBUG=INFO         # Show topology detection

srun --mpi=pmix --gpu-bind=closest ./my_multi_gpu_app
```

---

## 7. Cloud GPU Clusters

### 7.1 Cloud GPU Instance Comparison

```
Major Cloud GPU Offerings (2025):

+--------+------------------+--------+--------+------------------+
|Provider| Instance Type    | GPUs   | GPU    | Interconnect     |
+--------+------------------+--------+--------+------------------+
| AWS    | p5.48xlarge      | 8xH100 | 640 GB | EFA (400 Gb/s)   |
| AWS    | p4d.24xlarge     | 8xA100 | 320 GB | EFA (400 Gb/s)   |
| AWS    | p5e.48xlarge     | 8xH200 | 1.1 TB | EFA (3.2 Tb/s)  |
|        |                  |        |        |                  |
| GCP    | a3-highgpu-8g    | 8xH100 | 640 GB | GPUDirect-TCPX  |
| GCP    | a2-ultragpu-8g   | 8xA100 | 640 GB | GPUDirect-TCPX  |
| GCP    | a3-megagpu-8g    | 8xH100 | 640 GB | GPUDirect-TCPXO |
|        |                  |        |        |                  |
| Azure  | ND H100 v5      | 8xH100 | 640 GB | InfiniBand NDR   |
| Azure  | ND A100 v4      | 8xA100 | 640 GB | InfiniBand HDR   |
| Azure  | ND H200 v5      | 8xH200 | 1.1 TB | InfiniBand NDR   |
+--------+------------------+--------+--------+------------------+

Pricing (approximate, on-demand, per hour):
  p5.48xlarge:     ~$98/hr
  a3-highgpu-8g:   ~$98/hr
  ND H100 v5:      ~$96/hr

Spot/preemptible pricing: 60-70% discount (but can be interrupted)
```

### 7.2 AWS Multi-Node GPU Training

```bash
#!/bin/bash
# AWS ParallelCluster + SLURM for 4 p5.48xlarge (32 H100s)
#SBATCH --job-name=llm_training
#SBATCH --nodes=4 --ntasks-per-node=8 --gpus-per-node=8 --exclusive

# EFA (Elastic Fabric Adapter) settings for optimal NCCL
export FI_PROVIDER=efa
export FI_EFA_USE_DEVICE_RDMA=1
export NCCL_ALGO=Ring,Tree
export NCCL_PROTO=Simple

torchrun --nproc_per_node=8 --nnodes=4 \
    --node_rank=$SLURM_NODEID \
    --master_addr=$MASTER_ADDR --master_port=29500 \
    train_llm.py --batch_size=256
```

### 7.3 Cloud GPU Networking

```
Cloud GPU Network Comparison:

AWS EFA:       4x 400 Gb/s NICs = 1.6 Tb/s  (custom transport)
Azure IB NDR:  8x 400 Gb/s NICs = 3.2 Tb/s  (native IB, GPU-Direct RDMA)
GCP GPUDirect: ~400 Gb/s per VM              (TCP-based, custom stack)

Key: Azure has lowest latency (native IB), AWS has good bandwidth
     (custom EFA plugin), GCP is improving rapidly.
```

### 7.4 Cost Optimization Strategies

```
GPU Cloud Cost Optimization:

1. SPOT/PREEMPTIBLE:    60-70% savings (use checkpointing)
2. RESERVED INSTANCES:  30-40% savings for 1-year commit
3. RIGHT-SIZING:        Monitor utilization, downsize if <50%
4. MIXED PRECISION:     FP16/BF16 = 2x throughput, same cost
5. GRADIENT ACCUMULATION: Fewer GPUs, larger effective batch
6. DATA PIPELINE:       SSD storage, prefetch to local NVMe
```

---

## 8. Distributed Deep Learning

### 8.1 Parallelism Strategies Overview

```
Parallelism Taxonomy:

+------------------------------------------------------------------+
|                    Distributed Training                           |
+------------------------------------------------------------------+
|                                                                  |
|  +-------------------+  +-------------------+  +---------------+ |
|  | Data Parallelism  |  | Model Parallelism  |  | Pipeline      | |
|  |                   |  |                   |  | Parallelism   | |
|  | Same model on     |  | Split model       |  | Split model   | |
|  | each GPU, split   |  | across GPUs       |  | into stages   | |
|  | data batches      |  | (tensor parallel) |  | across GPUs   | |
|  +-------------------+  +-------------------+  +---------------+ |
|                                                                  |
|  +-------------------+  +-------------------+                    |
|  | Expert Parallelism|  | Sequence          |                    |
|  | (MoE models)      |  | Parallelism       |                    |
|  |                   |  | (long sequences)  |                    |
|  +-------------------+  +-------------------+                    |
|                                                                  |
|  +-----------------------------------------------------+        |
|  | Hybrid: Combine multiple strategies                  |        |
|  | (e.g., Data + Tensor + Pipeline parallelism)          |        |
|  +-----------------------------------------------------+        |
+------------------------------------------------------------------+
```

### 8.2 Data Parallelism

Each GPU holds a complete copy of the model. Data is split across GPUs. After each forward/backward pass, gradients are synchronized via AllReduce.

```
Data Parallelism Flow:

Step 1: Split batch across GPUs
Batch: [s0, s1, s2, s3, s4, s5, s6, s7]
        |_________|  |_________|
          GPU 0        GPU 1

Step 2: Forward pass (independent)
GPU 0: loss0 = model(s0, s1, s2, s3)
GPU 1: loss1 = model(s4, s5, s6, s7)

Step 3: Backward pass (independent)
GPU 0: grads0 = backward(loss0)
GPU 1: grads1 = backward(loss1)

Step 4: AllReduce gradients
GPU 0: avg_grads = (grads0 + grads1) / 2   <-- NCCL AllReduce
GPU 1: avg_grads = (grads0 + grads1) / 2

Step 5: Update weights (identical on both GPUs)
GPU 0: weights -= lr * avg_grads
GPU 1: weights -= lr * avg_grads
```

```python
# PyTorch DistributedDataParallel (DDP)
import torch
import torch.distributed as dist
import torch.nn as nn
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

def setup(rank, world_size):
    dist.init_process_group(
        backend="nccl",           # Use NCCL for GPU communication
        init_method="env://",
        rank=rank,
        world_size=world_size
    )
    torch.cuda.set_device(rank)

def train(rank, world_size):
    setup(rank, world_size)

    # Model on this GPU
    model = MyModel().to(rank)
    ddp_model = DDP(model, device_ids=[rank])

    # Distributed sampler ensures non-overlapping data splits
    sampler = DistributedSampler(dataset, num_replicas=world_size,
                                 rank=rank, shuffle=True)
    dataloader = DataLoader(dataset, batch_size=64,
                            sampler=sampler, num_workers=4,
                            pin_memory=True)

    optimizer = torch.optim.AdamW(ddp_model.parameters(), lr=1e-4)

    for epoch in range(100):
        sampler.set_epoch(epoch)  # Shuffle differently each epoch
        for batch in dataloader:
            inputs = batch["input"].to(rank)
            targets = batch["target"].to(rank)

            optimizer.zero_grad()
            outputs = ddp_model(inputs)
            loss = nn.functional.cross_entropy(outputs, targets)
            loss.backward()       # Gradients are auto-AllReduced by DDP
            optimizer.step()

    dist.destroy_process_group()

# Launch
# torchrun --nproc_per_node=8 train.py
```

### 8.3 Model Parallelism (Tensor Parallelism)

When a model is too large for one GPU, split individual layers across GPUs. For example, split a large matrix multiplication across 2 GPUs.

```
Tensor Parallelism -- Splitting a Linear Layer:

Single GPU:
  Y = X @ W          W is [4096, 4096]
                      X is [batch, 4096]

2 GPUs (column parallel):
  GPU 0: Y0 = X @ W0    W0 is [4096, 2048] (left half)
  GPU 1: Y1 = X @ W1    W1 is [4096, 2048] (right half)

  Y = [Y0, Y1]          AllGather to combine

2 GPUs (row parallel):
  GPU 0: Y0 = X0 @ W0   W0 is [2048, 4096] (top half)
  GPU 1: Y1 = X1 @ W1   W1 is [2048, 4096] (bottom half)

  Y = Y0 + Y1           AllReduce to combine


Megatron-LM Transformer (column + row parallel):

+------------------+    +------------------+
|     GPU 0        |    |     GPU 1        |
|                  |    |                  |
| X -> Linear_col0 |    | X -> Linear_col1 |
|     (W1_left)    |    |     (W1_right)   |
|       |          |    |       |          |
|     GeLU         |    |     GeLU         |
|       |          |    |       |          |
| Linear_row0      |    | Linear_row1      |
|     (W2_top)     |    |     (W2_bottom)  |
|       |          |    |       |          |
+-------+----------+    +-------+----------+
        |                        |
        +------- AllReduce ------+
        |
      Output

Communication: 1 AllReduce per transformer layer
```

### 8.4 Pipeline Parallelism

Split the model into sequential stages, each on a different GPU. Use micro-batching to keep all GPUs busy.

```
Pipeline Parallelism (4 stages, 4 GPUs):

GPipe (micro-batching):
GPU 0: [F0][F1][F2][F3]          [B3][B2][B1][B0]
GPU 1:    [F0][F1][F2][F3]      [B3][B2][B1][B0]
GPU 2:       [F0][F1][F2][F3]  [B3][B2][B1][B0]
GPU 3:          [F0][F1][F2][F3][B3][B2][B1][B0]

Bubble fraction: (p-1)/(m+p-1),  p=stages, m=micro-batches

1F1B (Interleaved -- best utilization):
GPU 0: [F0][F1][F2][F3][B0][F4][B1][F5][B2]...[B7]
GPU 1:    [F0][F1][F2][B0][F3][B1][F4][B2]...[B7]
GPU 2:       [F0][F1][B0][F2][B1][F3][B2]...[B7]
GPU 3:          [F0][B0][F1][B1][F2][B2]...[B7]

Steady state: 1 Forward + 1 Backward per time step.
```

### 8.5 FSDP (Fully Sharded Data Parallelism)

FSDP (PyTorch) is equivalent to ZeRO Stage 3 (DeepSpeed). It shards model parameters, gradients, and optimizer states across GPUs. Each GPU holds only 1/N of the model at rest.

```
FSDP Memory Savings:

Traditional DDP (Data Parallelism):
Each GPU stores: Full Parameters + Full Gradients + Full Optimizer State
  Model: 7B params x 4 bytes = 28 GB
  Grads: 28 GB
  Adam states (2x): 56 GB
  Total per GPU: 112 GB   <-- Does not fit in 80 GB!

FSDP with 8 GPUs:
Each GPU stores: 1/8 Parameters + 1/8 Gradients + 1/8 Optimizer State
  Per GPU: 112 / 8 = 14 GB   <-- Fits easily!

During forward/backward: AllGather parameters as needed, then discard.

Per layer: AllGather params -> Forward -> Discard -> Backward -> ReduceScatter grads
```

```python
# PyTorch FSDP example
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP, ShardingStrategy, MixedPrecision

def train_fsdp(rank, world_size):
    dist.init_process_group("nccl", rank=rank, world_size=world_size)
    torch.cuda.set_device(rank)

    fsdp_model = FSDP(
        LargeTransformer(),
        sharding_strategy=ShardingStrategy.FULL_SHARD,  # ZeRO-3
        mixed_precision=MixedPrecision(
            param_dtype=torch.bfloat16, reduce_dtype=torch.bfloat16,
        ),
        device_id=rank,
    )
    optimizer = torch.optim.AdamW(fsdp_model.parameters(), lr=1e-4)

    for batch in dataloader:
        optimizer.zero_grad()
        loss = fsdp_model(batch)
        loss.backward()
        optimizer.step()
```

### 8.6 DeepSpeed ZeRO

DeepSpeed provides three stages of memory optimization, plus additional features like offloading to CPU/NVMe.

```
DeepSpeed ZeRO Stages:

Stage   | Shards         | Memory/GPU    | Communication
--------|----------------|---------------|--------------------
ZeRO-1  | Optimizer      | ~60% of DDP   | Same as DDP
ZeRO-2  | Opt + Grads    | ~40% of DDP   | +ReduceScatter
ZeRO-3  | Opt+Grad+Param | ~1/N of DDP   | +AllGather (2x)
ZeRO-∞  | + CPU/NVMe     | Near unlimited| + CPU offload

Memory breakdown for 7B model, 8 GPUs:

                    DDP     ZeRO-1   ZeRO-2   ZeRO-3
Parameters:        28 GB    28 GB    28 GB    3.5 GB
Gradients:         28 GB    28 GB    3.5 GB   3.5 GB
Optimizer (Adam):  56 GB    7 GB     7 GB     7 GB
                  ------   ------   ------   ------
Total per GPU:    112 GB    63 GB    38.5 GB  14 GB
```

```json
// ds_config.json -- DeepSpeed ZeRO-3 with CPU offload
{
  "train_batch_size": 256,
  "fp16": { "enabled": true },
  "zero_optimization": {
    "stage": 3,
    "offload_param": { "device": "cpu", "pin_memory": true },
    "offload_optimizer": { "device": "cpu", "pin_memory": true },
    "overlap_comm": true,
    "reduce_bucket_size": 5e7
  }
}
```

```python
# DeepSpeed training loop
import deepspeed

model_engine, optimizer, _, _ = deepspeed.initialize(
    model=LargeTransformer(),
    config="ds_config.json"
)
for batch in dataloader:
    loss = model_engine(batch)
    model_engine.backward(loss)
    model_engine.step()
```

### 8.7 3D Parallelism

Production LLM training combines all three parallelism strategies. This is called 3D parallelism.

```
3D Parallelism Example (64 GPUs = 8 nodes x 8 GPUs):

Dimension 1: Data Parallelism (DP = 4)
  4 complete copies of the model, each processing different data.

Dimension 2: Tensor Parallelism (TP = 8)
  Each layer is split across 8 GPUs (within one node, via NVLink).

Dimension 3: Pipeline Parallelism (PP = 2)
  Model split into 2 stages, each stage on a different group.

Total GPUs = DP x TP x PP = 4 x 8 x 2 = 64

Layout:
                    DP Group 0              DP Group 1
                +------------------+  +------------------+
  PP Stage 0    | Node 0 (8 GPUs)  |  | Node 2 (8 GPUs)  |
  (Layers 0-15) | TP across 8 GPUs |  | TP across 8 GPUs |
                +------------------+  +------------------+
                        |                      |
  PP Stage 1    +------------------+  +------------------+
  (Layers 16-31)| Node 1 (8 GPUs)  |  | Node 3 (8 GPUs)  |
                | TP across 8 GPUs |  | TP across 8 GPUs |
                +------------------+  +------------------+

                    DP Group 2              DP Group 3
                +------------------+  +------------------+
  PP Stage 0    | Node 4 (8 GPUs)  |  | Node 6 (8 GPUs)  |
                +------------------+  +------------------+
                        |                      |
  PP Stage 1    +------------------+  +------------------+
                | Node 5 (8 GPUs)  |  | Node 7 (8 GPUs)  |
                +------------------+  +------------------+

Communication:
  TP: AllReduce within node (NVLink, ~900 GB/s)
  PP: Point-to-point between stages (NVLink or IB)
  DP: AllReduce across nodes (InfiniBand, ~400 Gb/s)

Rule: Put highest-communication parallelism on fastest interconnect.
  TP on NVLink > PP on NVLink/IB > DP on IB
```

---

## 9. Performance -- Communication Overlap and All-Reduce Algorithms

### 9.1 The Communication Bottleneck

In distributed training, GPUs spend a significant fraction of time communicating gradients. The key to scaling is **overlapping communication with computation**.

```
Scaling Efficiency:

Ideal (linear) scaling:
  1 GPU:  100 samples/sec
  8 GPUs: 800 samples/sec  (8x)

Reality without optimization:
  1 GPU:  100 samples/sec
  8 GPUs: 500 samples/sec  (5x)  <-- 62.5% efficiency

Where does the time go?
+-----+------------------+----------+
| GPU | Computation (70%) | Comm     |
|     | [================]| (30%)    |
|     |                   | [=======]|
+-----+------------------+----------+

With overlap:
+-----+------------------+----------+
| GPU | Computation (70%) | Comm     |
|     | [===========[=======]======] |
|     |              ^overlap^       |
+-----+------------------+----------+
Total time reduced by hiding communication behind compute.
```

### 9.2 Communication-Computation Overlap

The key technique: start communicating gradients for layer N while computing gradients for layer N-1 (backward pass computes gradients from output to input layers).

```
Overlap Strategy in DDP:

Layer:    L4 (output)     L3            L2            L1 (input)

Backward: [Compute grad4] [Compute grad3] [Compute grad2] [Compute grad1]
Comms:                    [AllReduce g4] [AllReduce g3] [AllReduce g2]
                                                        [AllReduce g1]

Timeline:
+------------------------------------------------------------------+
| Compute grad4 |                                                  |
|               | Compute grad3 | AllReduce g4 |                   |
|               |               | Compute grad2 | AllReduce g3 |   |
|               |               |               | Compute grad1 |  |
|               |               |               |  AllReduce g2 |  |
|               |               |               |   AllReduce g1 | |
+------------------------------------------------------------------+

DDP does this automatically using "gradient buckets":
- Groups small gradient tensors into larger buckets
- Starts AllReduce as soon as a bucket is complete
- Default bucket size: 25 MB (tunable via bucket_cap_mb)
```

```python
# PyTorch DDP overlap tuning
ddp_model = DDP(
    model,
    device_ids=[rank],
    bucket_cap_mb=25,        # Size of gradient buckets (MB)
    find_unused_parameters=False,  # Disable if all params used
    gradient_as_bucket_view=True,  # Reduce memory copies
    static_graph=True,       # Enable additional optimizations
)
```

### 9.3 All-Reduce Algorithms

The choice of AllReduce algorithm dramatically affects performance at scale.

```
Ring AllReduce:

GPUs arranged in a logical ring.
Two phases: ReduceScatter + AllGather.
Time: 2 * (N-1)/N * DataSize / Bandwidth
(Bandwidth-optimal for large messages)

Phase 1: ReduceScatter
  Each GPU sends 1/N of data to the next GPU in the ring.
  After N-1 steps, each GPU has the reduced result for its chunk.

  Step 1:      Step 2:      Step 3 (done):
  GPU0->GPU1   GPU1->GPU2   GPU2->GPU3
  GPU1->GPU2   GPU2->GPU3   GPU3->GPU0
  GPU2->GPU3   GPU3->GPU0
  GPU3->GPU0

Phase 2: AllGather
  Each GPU sends its reduced chunk around the ring.
  After N-1 steps, every GPU has the full result.

Ring with 4 GPUs (data split into 4 chunks):

Initial:
GPU 0: [a0] [a1] [a2] [a3]
GPU 1: [b0] [b1] [b2] [b3]
GPU 2: [c0] [c1] [c2] [c3]
GPU 3: [d0] [d1] [d2] [d3]

After ReduceScatter:
GPU 0: [----] [----] [----] [a3+b3+c3+d3]  chunk 3
GPU 1: [a0+b0+c0+d0] [----] [----] [----]  chunk 0
GPU 2: [----] [a1+b1+c1+d1] [----] [----]  chunk 1
GPU 3: [----] [----] [a2+b2+c2+d2] [----]  chunk 2

After AllGather:
GPU 0: [sum0] [sum1] [sum2] [sum3]  (complete result)
GPU 1: [sum0] [sum1] [sum2] [sum3]  (complete result)
GPU 2: [sum0] [sum1] [sum2] [sum3]  (complete result)
GPU 3: [sum0] [sum1] [sum2] [sum3]  (complete result)
```

```
Tree AllReduce (Recursive Halving-Doubling):

Better for small messages and high-latency networks.
Time: 2 * log2(N) * (DataSize/N / Bandwidth + Latency)

        Round 1              Round 2
GPU 0 -----+                GPU 0 ------+
            v                            v
GPU 1 <----+  (reduce)     GPU 1        |
                                         v
GPU 2 -----+                GPU 2 ------+
            v                            |
GPU 3 <----+  (reduce)     GPU 3        |
                                    (reduce)
            Then broadcast back...

Algorithm Selection Guide:
+-----------------+------------------+-------------------+
| Message Size    | Best Algorithm   | Reason            |
+-----------------+------------------+-------------------+
| < 256 KB        | Tree/Recursive   | Latency-bound     |
| 256 KB - 64 MB  | Ring             | BW-optimal        |
| > 64 MB         | Ring + Pipeline  | BW-optimal + hide |
|                 |                  | latency           |
+-----------------+------------------+-------------------+

NCCL automatically selects the best algorithm!
Override with: NCCL_ALGO=Ring or NCCL_ALGO=Tree
```

### 9.4 Double Buffering and Pipelining

```
Double Buffering for Communication Overlap:

Use two buffers: while one is being communicated, the other is
being computed into.

Step 1:  Compute into buf_A     | Send buf_B (from last iter)
Step 2:  Compute into buf_B     | Send buf_A (just computed)
Step 3:  Compute into buf_A     | Send buf_B (just computed)
...

Timeline:
Compute:  [buf_A][buf_B][buf_A][buf_B]...
Send:          [buf_B][buf_A][buf_B][buf_A]...
              ^overlap^

Overlap achieves near-perfect hiding of communication.
```

```cuda
// Double-buffered communication: two streams, two buffers
cudaStream_t computeStream, commStream;
cudaStreamCreate(&computeStream);
cudaStreamCreate(&commStream);

float *d_buf[2];
cudaMalloc(&d_buf[0], bufSize);
cudaMalloc(&d_buf[1], bufSize);

for (int iter = 0; iter < numIters; iter++) {
    int cur = iter % 2, prev = (iter + 1) % 2;

    computeKernel<<<grid, block, 0, computeStream>>>(d_buf[cur], inputData, N);

    // Synchronize compute -> comm via event
    cudaEvent_t done;
    cudaEventCreate(&done);
    cudaEventRecord(done, computeStream);
    cudaStreamWaitEvent(commStream, done, 0);

    if (iter > 0) {  // Send previous buffer (overlapped with next compute)
        ncclAllReduce(d_buf[prev], d_buf[prev], N, ncclFloat, ncclSum, comm, commStream);
    }
    cudaEventDestroy(done);
}
```

### 9.5 Quantized Communication

Reduce communication volume by compressing gradients before sending.

```
Gradient Compression Techniques:

1. FP16/BF16 AllReduce (standard):
   32-bit grads -> 16-bit -> AllReduce -> 16-bit -> 32-bit
   2x reduction in communication volume

2. INT8 Quantization:
   32-bit grads -> 8-bit -> AllReduce -> 8-bit -> 32-bit
   4x reduction, slight accuracy impact

3. Top-K Sparsification:
   Only send the top K% of gradients by magnitude.
   Accumulate the rest locally ("error feedback").
   With K=1%, 100x reduction in communication.

4. PowerSGD (low-rank approximation):
   Approximate gradient matrix with low-rank factorization.
   G ≈ P @ Q^T where P, Q have rank r << min(m, n)
   Communicate P and Q instead of G.

Trade-off:
+------------------+------------+------------------+
| Method           | Compression| Accuracy Impact   |
+------------------+------------+------------------+
| FP16 AllReduce   | 2x         | Negligible        |
| BF16 AllReduce   | 2x         | Negligible        |
| INT8 Quantized   | 4x         | Small (<0.5%)     |
| Top-1% Sparse    | 100x       | Moderate (~1%)    |
| PowerSGD rank 4  | 50-200x    | Small (<0.5%)     |
+------------------+------------+------------------+
```

---

## 10. Topology-Aware Programming

### 10.1 Why Topology Matters

On a multi-GPU system, not all GPU pairs have the same interconnect. A topology-unaware program might route heavy traffic over slow PCIe links when fast NVLink paths exist.

```
Typical 8-GPU Server Topology:

CPU Socket 0                    CPU Socket 1
+-----------+                   +-----------+
| CPU 0     |                   | CPU 1     |
| (NUMA 0)  |                   | (NUMA 1)  |
+-----+-----+                   +-----+-----+
      |                               |
  PCIe Root 0                     PCIe Root 1
  +----+----+                     +----+----+
  |         |                     |         |
GPU 0    GPU 1                  GPU 4    GPU 5
  |  NVLink  |                    |  NVLink  |
GPU 2    GPU 3                  GPU 6    GPU 7
  |         |                     |         |
  +----+----+                     +----+----+

GPU 0<->GPU 1: NVLink (900 GB/s)   FAST
GPU 0<->GPU 4: PCIe (32 GB/s)      SLOW (crosses NUMA)
GPU 0<->GPU 2: NVLink (900 GB/s)   FAST

Wrong: AllReduce ring 0->4->1->5->2->6->3->7 (crosses NUMA twice)
Right: AllReduce ring 0->1->3->2->6->7->5->4 (minimizes NUMA crossings)
```

### 10.2 NVML (NVIDIA Management Library)

NVML provides programmatic access to GPU topology, status, and configuration.

```cuda
#include <nvml.h>
#include <cstdio>

void queryTopology() {
    nvmlInit();
    unsigned int deviceCount;
    nvmlDeviceGetCount(&deviceCount);

    for (unsigned int i = 0; i < deviceCount; i++) {
        nvmlDevice_t dev_i;
        nvmlDeviceGetHandleByIndex(i, &dev_i);

        for (unsigned int j = i + 1; j < deviceCount; j++) {
            nvmlDevice_t dev_j;
            nvmlDeviceGetHandleByIndex(j, &dev_j);

            nvmlGpuTopologyLevel_t level;
            nvmlDeviceGetTopologyCommonAncestor(dev_i, dev_j, &level);
            // level: NVML_TOPOLOGY_SINGLE (NVLink),
            //        NVML_TOPOLOGY_NODE (same NUMA),
            //        NVML_TOPOLOGY_SYSTEM (cross NUMA)
            printf("GPU %u <-> GPU %u: level %d\n", i, j, level);
        }
    }
    nvmlShutdown();
}
```

### 10.3 CPU-GPU Affinity

Binding each GPU process to the NUMA-local CPU cores reduces memory latency and PCIe contention.

```bash
# Check CPU-GPU affinity
nvidia-smi topo -m
# Shows which GPUs are on which NUMA nodes

# Example output:
# GPU0 -> CPU Affinity: 0-15 (NUMA 0)
# GPU1 -> CPU Affinity: 0-15 (NUMA 0)
# GPU2 -> CPU Affinity: 16-31 (NUMA 1)
# GPU3 -> CPU Affinity: 16-31 (NUMA 1)

# Bind process to NUMA-local CPUs
numactl --cpunodebind=0 --membind=0 ./gpu0_process
numactl --cpunodebind=1 --membind=1 ./gpu2_process

# In SLURM:
#SBATCH --gpu-bind=closest
# Automatically binds each task to the CPU cores closest to its GPU

# With MPI:
mpirun -np 4 --bind-to core --map-by slot \
       --report-bindings ./my_app
```

### 10.4 Programmatic Affinity Setting

```cuda
#include <nvml.h>
#include <sched.h>

void setGPUAffinity(int gpuId) {
    nvmlInit();
    nvmlDevice_t device;
    nvmlDeviceGetHandleByIndex(gpuId, &device);

    // Get CPU affinity mask for this GPU from NVML
    unsigned long cpuSet[16];
    nvmlDeviceGetCpuAffinity(device, 16, cpuSet);

    // Apply to current thread via sched_setaffinity
    cpu_set_t mask;
    CPU_ZERO(&mask);
    for (int cpu = 0; cpu < 1024; cpu++) {
        int word = cpu / (8 * sizeof(unsigned long));
        int bit = cpu % (8 * sizeof(unsigned long));
        if (cpuSet[word] & (1UL << bit)) CPU_SET(cpu, &mask);
    }
    sched_setaffinity(0, sizeof(mask), &mask);
    nvmlShutdown();
}
```

### 10.5 NCCL Topology-Aware Communication

NCCL automatically detects system topology and selects optimal communication paths. Key environment variables:

```bash
# Algorithm and protocol
export NCCL_ALGO=Ring              # Ring, Tree, CollnetDirect, CollnetChain
export NCCL_PROTO=Simple           # Simple, LL, LL128

# Network selection
export NCCL_SOCKET_IFNAME=eth0     # TCP/IP interface
export NCCL_IB_HCA=mlx5_0         # InfiniBand adapter
export NCCL_NET_GDR_LEVEL=5       # GPU-Direct RDMA level (0-5)

# P2P and shared memory
export NCCL_P2P_DISABLE=0         # Enable P2P (default)
export NCCL_SHM_DISABLE=0         # Enable shared memory transport

# Debugging
export NCCL_DEBUG=INFO             # Show topology detection
export NCCL_TOPO_DUMP_FILE=/tmp/topo.xml  # Save detected topology
```

### 10.6 GPU-NIC Affinity

For multi-node training, the NIC should be on the same PCIe root as the GPU. Cross-NUMA GPU-NIC routing adds latency and reduces bandwidth.

```
GPU-NIC Affinity:

GOOD: GPU 0 --> PCIe Switch --> NIC 0 --> Network  (local, fast)
BAD:  GPU 0 --> PCIe --> QPI/UPI --> PCIe --> NIC 1 (cross-NUMA, slow)

DGX H100: GPU N <-> NIC N (1:1 mapping, same PCIe root)
NCCL detects this automatically and routes via closest NIC.
```

### 10.7 Multi-Rail and Rail-Optimized Topology

Modern DGX systems use "rail-optimized" topology: each GPU has a dedicated NIC, and inter-node traffic follows per-GPU "rails" with no cross-rail contention.

```
Rail-Optimized Network (DGX H100 SuperPOD):

Node 0:                    Node 1:
GPU0 -> NIC0 --Rail 0--> NIC0 -> GPU0
GPU1 -> NIC1 --Rail 1--> NIC1 -> GPU1
  ...                      ...
GPU7 -> NIC7 --Rail 7--> NIC7 -> GPU7

8 independent 400 Gb/s links = 3.2 Tb/s aggregate.
NCCL auto-detects rail topology and routes accordingly.
```

---

## Scaling Checklist

Use this checklist when designing and deploying multi-GPU and HPC workloads.

### Pre-Development

- [ ] **Profile single-GPU** before going multi-GPU. Fix single-GPU bottlenecks first.
- [ ] **Estimate memory** per GPU: parameters + gradients + optimizer state + activations.
- [ ] **Choose parallelism** strategy: data, tensor, pipeline, or hybrid.
- [ ] **Know your interconnect**: NVLink bandwidth, PCIe bandwidth, network bandwidth.

### Code and Configuration

- [ ] **Use NCCL** for GPU-GPU communication (not hand-rolled P2P).
- [ ] **Use pinned (page-locked) host memory** for all host-device transfers.
- [ ] **Enable P2P** access between GPUs on the same node.
- [ ] **Set correct GPU** for each process: `cudaSetDevice(local_rank)`.
- [ ] **Set CPU affinity** to NUMA-local cores for each GPU process.
- [ ] **Use async operations** (streams, cudaMemcpyAsync, NCCL async calls).
- [ ] **Overlap communication** with computation (gradient bucketing, double buffering).

### NCCL Tuning

- [ ] **Set NCCL_DEBUG=INFO** during initial setup to verify topology detection.
- [ ] **Check NCCL_ALGO** selection (Ring vs Tree) matches your message sizes.
- [ ] **Verify GPU-Direct RDMA** is active for cross-node communication.
- [ ] **Tune NCCL_NTHREADS** and **NCCL_BUFFSIZE** if needed.
- [ ] **Set NCCL_IB_HCA** to select the correct InfiniBand adapter.

### Scaling Verification

- [ ] **Measure scaling efficiency**: throughput_N_GPUs / (N \* throughput_1_GPU).
- [ ] **Profile communication overhead** with NCCL debug or Nsight Systems.
- [ ] **Check GPU utilization** during training (should be >80%).
- [ ] **Monitor memory** usage: `nvidia-smi` or NVML.
- [ ] **Benchmark all-reduce** latency and bandwidth independently.

### Production

- [ ] **Implement checkpointing** for fault tolerance.
- [ ] **Handle SLURM preemption** gracefully (signal handlers).
- [ ] **Use mixed precision** (FP16/BF16) to reduce communication and double throughput.
- [ ] **Monitor for stragglers** (slow GPUs that hold back the whole job).
- [ ] **Set appropriate timeout** for NCCL operations (`NCCL_TIMEOUT`).
- [ ] **Test on small scale** (2-4 GPUs) before scaling to full cluster.

### Cost (Cloud)

- [ ] **Use spot/preemptible** instances with checkpointing for cost savings.
- [ ] **Right-size** GPU instances (do not over-provision).
- [ ] **Monitor GPU utilization** and terminate underutilized instances.
- [ ] **Use gradient accumulation** to simulate larger batches with fewer GPUs.
- [ ] **Profile data pipeline** to ensure GPUs are not waiting for data I/O.

---

## Interview Questions

### Fundamentals

**Q1: How does `cudaSetDevice` work, and what happens if you allocate memory on GPU 0 and try to access it from a kernel running on GPU 1 without P2P?**

A: `cudaSetDevice(id)` sets the current GPU for all subsequent CUDA API calls in that thread. Memory allocated with `cudaMalloc` is associated with the current device. If a kernel on GPU 1 tries to dereference a pointer allocated on GPU 0 without peer access enabled, you get an illegal memory access error (or undefined behavior). Enabling P2P with `cudaDeviceEnablePeerAccess` allows direct cross-GPU memory access, but only if the hardware supports it (same PCIe root complex or NVLink). You can check with `cudaDeviceCanAccessPeer`.

**Q2: Explain the difference between AllReduce, AllGather, ReduceScatter, and Broadcast.**

A: **AllReduce**: every GPU contributes a buffer, they are element-wise reduced (e.g., summed), and every GPU receives the complete result. **AllGather**: each GPU contributes a chunk, and the concatenation of all chunks is placed on every GPU. **ReduceScatter**: the element-wise reduction is performed, but the result is split across GPUs -- each GPU receives only its shard. **Broadcast**: one GPU (the root) sends its data to all others. AllReduce = ReduceScatter + AllGather. In distributed training, AllReduce is used for gradient synchronization in DDP, ReduceScatter is used in FSDP/ZeRO-3 for sharding gradients, and AllGather is used in FSDP for reconstructing parameters.

**Q3: What is the Ring AllReduce algorithm, and why is it bandwidth-optimal?**

A: Ring AllReduce arranges N GPUs in a logical ring. It has two phases: ReduceScatter (N-1 steps, each GPU sends 1/N of data to neighbor, accumulating partial reductions) and AllGather (N-1 steps, distributing the reduced chunks). Total data transferred per GPU: 2*(N-1)/N * DataSize. As N grows, this approaches 2 _ DataSize per GPU regardless of the number of GPUs. This is optimal because every GPU must send its data at least once and receive the result at least once. The limitation is latency: 2_(N-1) sequential steps, which matters for small messages. Tree-based algorithms have better latency (log N steps) but worse bandwidth utilization.

### Architecture and Interconnects

**Q4: Compare NVLink and PCIe for GPU-to-GPU communication. When does the choice matter?**

A: NVLink 4.0 provides ~900 GB/s bidirectional bandwidth between GPUs, compared to ~64 GB/s for PCIe 5.0 x16. NVLink is 14x faster. The choice matters enormously for tensor parallelism, where every layer requires an AllReduce across GPUs. For data parallelism with large models, gradient AllReduce happens less frequently and can be overlapped with computation, making the impact of interconnect bandwidth less critical (but still significant at scale). NVLink also has lower latency than PCIe. NVSwitch makes the difference even more dramatic by providing full bisection bandwidth -- every GPU can communicate with every other GPU at full NVLink speed simultaneously.

**Q5: What is GPU-Direct RDMA, and why does it matter for multi-node GPU computing?**

A: GPU-Direct RDMA allows a network adapter (InfiniBand, RoCE) to read/write GPU memory directly without CPU involvement or host memory staging. Without GDR, a cross-node GPU transfer requires: GPU -> host memory (cudaMemcpy) -> NIC -> network -> NIC -> host memory -> GPU. With GDR: GPU -> NIC -> network -> NIC -> GPU. This eliminates two host-memory copies and removes CPU from the critical path. The result is lower latency (~2 us vs ~10 us) and higher throughput. It is essential for scaling tensor parallelism across nodes and for reducing the communication overhead in data parallelism at scale.

**Q6: Describe the DGX H100 architecture. How many GPUs, what interconnect, what network?**

A: The DGX H100 contains 8 H100 GPUs, each with 80 GB HBM3 (640 GB total). The GPUs are fully connected via 4 third-generation NVSwitch chips, providing 900 GB/s per GPU (7.2 TB/s total bisection bandwidth). The system has 2 Intel Xeon CPUs and 2 TB DDR5 RAM. For networking, it has 8 ConnectX-7 NICs, each providing 400 Gb/s InfiniBand (3.2 Tb/s total). The GPU-NIC mapping is rail-optimized: each GPU has a dedicated NIC on the same PCIe root, so inter-node communication does not cross NUMA boundaries. A DGX SuperPOD connects multiple DGX H100 nodes via a fat-tree InfiniBand fabric.

### Distributed Training

**Q7: Explain FSDP (Fully Sharded Data Parallelism) and how it relates to DeepSpeed ZeRO.**

A: FSDP is PyTorch's implementation of the ZeRO Stage 3 algorithm. In standard DDP, every GPU holds a full copy of the model parameters, gradients, and optimizer states. FSDP shards all three across GPUs. At rest, each GPU holds only 1/N of the model. During forward pass, FSDP calls AllGather to reconstruct the full parameters for each layer, computes, then discards the gathered parameters. During backward pass, it AllGathers again for each layer, computes gradients, then uses ReduceScatter to distribute gradient shards back. This reduces per-GPU memory from O(model_size) to O(model_size/N), enabling training of much larger models. The trade-off is increased communication volume (2x vs DDP), but for memory-constrained workloads, it is essential.

**Q8: What is 3D parallelism? How do you decide the parallelism configuration?**

A: 3D parallelism combines data parallelism (DP), tensor parallelism (TP), and pipeline parallelism (PP). TP splits individual layers across GPUs (requires frequent AllReduce, so place on NVLink within a node). PP splits the model into sequential stages across GPU groups (requires less frequent point-to-point communication). DP replicates the sharded model across groups (requires AllReduce of gradients, can overlap with compute). Configuration rules: (1) TP degree = number of GPUs per node (e.g., 8 for DGX). (2) PP degree = model*layers / layers_per_stage, chosen to balance stage compute times. (3) DP degree = total_GPUs / (TP * PP). Total GPUs = DP \_ TP \* PP. The goal is to maximize throughput while fitting the model in memory, with TP on the fastest interconnect (NVLink) and DP on the slowest (inter-node network).

**Q9: How does communication-computation overlap work in DDP?**

A: DDP overlaps gradient AllReduce with backward-pass computation using a technique called gradient bucketing. During the backward pass, as gradients are computed layer by layer (from output to input), DDP groups gradients into fixed-size buckets (default 25 MB). As soon as a bucket is full, DDP launches an asynchronous NCCL AllReduce for that bucket on a separate CUDA stream. Meanwhile, the backward pass continues computing gradients for earlier layers. By the time the backward pass finishes the first layer, most of the AllReduce operations have already completed or are in progress. This hides most of the communication latency behind useful computation. Tuning bucket size is important: too small = too many AllReduce calls (latency overhead); too large = less overlap opportunity.

### System and Operations

**Q10: How does SLURM manage GPU resources, and what is GRES?**

A: SLURM tracks GPUs as Generic Resources (GRES). The system administrator configures GRES in `slurm.conf` and `gres.conf`, specifying the number and type of GPUs per node (e.g., `gpu:a100:4`). Users request GPUs with `--gpus-per-node`, `--gpus-per-task`, or `--gres=gpu:N`. SLURM assigns specific GPUs to each job and automatically sets `CUDA_VISIBLE_DEVICES` so that each job only sees its allocated GPUs. With `--gpu-bind=closest`, SLURM also pins each task to the CPU cores closest to its assigned GPU (NUMA affinity). This prevents resource contention between jobs and ensures optimal data locality.

**Q11: What is topology-aware programming, and how do you implement it?**

A: Topology-aware programming means structuring communication patterns to match the physical GPU interconnect topology. For example, placing tensor-parallel groups on NVLink-connected GPUs rather than across PCIe. Implementation steps: (1) Use `nvidia-smi topo -m` or NVML to query the topology. (2) Set CPU affinity to NUMA-local cores for each GPU process (`numactl` or `sched_setaffinity`). (3) Configure NCCL to use the correct InfiniBand adapter (`NCCL_IB_HCA`) and network interface (`NCCL_SOCKET_IFNAME`). (4) Structure parallelism groups so that the highest-bandwidth communication (tensor parallelism) uses the fastest interconnect (NVLink). (5) In rail-optimized clusters, ensure each GPU communicates inter-node via its own dedicated NIC.

**Q12: You are scaling from 8 GPUs (one node) to 64 GPUs (8 nodes) and see scaling efficiency drop from 95% to 60%. How do you diagnose and fix this?**

A: Systematic diagnosis: (1) **Profile communication**: use NCCL_DEBUG=INFO and Nsight Systems to identify how much time is spent in AllReduce vs compute. (2) **Check interconnect**: verify GPU-Direct RDMA is active (not falling back to host staging). Run `NCCL_DEBUG_SUBSYS=NET` to confirm. (3) **Check network bandwidth**: run a standalone NCCL benchmark (`nccl-tests`) to measure actual inter-node bandwidth vs theoretical. (4) **Check overlap**: use Nsight Systems to see if AllReduce overlaps with backward computation. If not, tune bucket size. (5) **Check data pipeline**: ensure data loading is not the bottleneck (GPU utilization during data loading should be >0%). (6) **Check NUMA/affinity**: ensure each GPU process is bound to local CPUs and using the closest NIC. Fixes: enable GDR if not active, switch to BF16 AllReduce (2x less communication), increase gradient accumulation steps (reduce AllReduce frequency), enable gradient compression, tune NCCL algorithm (Ring vs Tree), fix NUMA affinity.

**Q13: Compare AWS EFA, Azure InfiniBand, and GCP GPUDirect-TCPX for multi-node GPU training.**

A: AWS EFA (Elastic Fabric Adapter) provides 400 Gb/s per adapter with up to 4 adapters per p5.48xlarge (1.6 Tb/s total). It uses a custom transport layer optimized for collective communications but does not support native InfiniBand verbs or GPU-Direct RDMA in the traditional sense; instead, NCCL uses a special EFA plugin. Azure NDv5 uses standard InfiniBand NDR at 400 Gb/s with 8 ConnectX-7 NICs per node (3.2 Tb/s total), supporting full GPU-Direct RDMA. GCP's GPUDirect-TCPX is a custom network stack that provides ~400 Gb/s per VM with direct GPU-NIC communication but over a custom TCP-based transport. In practice, Azure InfiniBand typically has the lowest latency and best compatibility with standard HPC software. AWS EFA has good bandwidth but slightly higher latency. GCP GPUDirect-TCPX has been improving rapidly.

**Q14: How would you implement fault tolerance for a large-scale distributed training job?**

A: Key strategies: (1) **Periodic checkpointing**: save model state, optimizer state, data loader state, and random number generator state every N steps. Use distributed checkpointing (each rank saves its shard) for speed. (2) **Elastic training**: frameworks like `torchrun` support elastic scaling -- workers can join or leave during training. (3) **Heartbeat monitoring**: detect stale/crashed workers and trigger restart. (4) **SLURM signal handling**: trap SIGTERM (from SLURM preemption) to save a checkpoint before exit. (5) **Redundant communication**: NCCL has built-in timeout detection; configure `NCCL_TIMEOUT` appropriately. (6) **Asynchronous checkpointing**: write checkpoints in a background thread to avoid blocking training. (7) **Gradient accumulation resilience**: if a worker fails mid-step, discard partial gradients and retry from last checkpoint. For cloud, use spot instances with checkpointing to reduce costs by 60-70%.

**Q15: What are the memory and communication trade-offs between DDP, FSDP (ZeRO-3), and pipeline parallelism for training a 70B parameter model on 8 H100 GPUs?**

A: 70B model at FP32: 280 GB parameters + 280 GB gradients + 560 GB Adam states = 1.12 TB. With BF16 mixed precision: ~140 GB params + ~140 GB grads + 560 GB Adam (FP32 master weights) = ~840 GB.

**DDP**: Each GPU stores everything: ~840/1 = 840 GB per GPU. Does not fit in 80 GB. Impossible without offloading.

**FSDP (ZeRO-3)**: Shards everything across 8 GPUs: ~840/8 = 105 GB per GPU. Still tight but feasible with activation checkpointing (recompute activations instead of storing them). Communication: 2x the data volume of DDP (AllGather for forward, AllGather + ReduceScatter for backward). All communication is over NVLink within the node, so the bandwidth cost is manageable.

**Pipeline parallelism**: Split 70B model into 8 stages (8.75B per stage). Each stage uses ~105 GB for its parameters, gradients, and optimizer states. Fits in 80 GB with mixed precision and activation checkpointing. Communication: only activations at stage boundaries, much less volume than FSDP. Drawback: pipeline bubble wastes compute (up to (p-1)/(m+p-1) idle time).

**Best approach for 8 GPUs**: FSDP with BF16 mixed precision and activation checkpointing. For more GPUs across multiple nodes, use 3D parallelism: TP=8 within each node, PP=2 across node pairs, DP across the rest.
