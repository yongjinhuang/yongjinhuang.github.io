# Chapter 11: Profiling & Debugging --- Performance Engineering in Practice

## Table of Contents

1. [Why Profile First](#1-why-profile-first)
2. [NVIDIA Nsight Systems](#2-nvidia-nsight-systems)
3. [NVIDIA Nsight Compute](#3-nvidia-nsight-compute)
4. [nvprof / ncu Command-Line Tools](#4-nvprof--ncu-command-line-tools)
5. [Linux perf](#5-linux-perf)
6. [Intel VTune Profiler](#6-intel-vtune-profiler)
7. [Valgrind / Cachegrind](#7-valgrind--cachegrind)
8. [CUDA Debugging](#8-cuda-debugging)
9. [Roofline Model in Practice](#9-roofline-model-in-practice)
10. [Optimization Case Studies](#10-optimization-case-studies)
11. [Flame Graphs](#11-flame-graphs)
12. [Profiling Checklist](#profiling-checklist)
13. [Tool Selection Guide](#tool-selection-guide)

---

## 1. Why Profile First

### The Cardinal Rule

There is one absolute rule in performance engineering that separates professionals from amateurs:

**Never optimize without profiling data.**

This is not a suggestion. It is a hard constraint. Every minute you spend "optimizing" code without profiling data has a high probability of being wasted. Worse, it may actively degrade the codebase by adding complexity with no performance benefit.

```
+-----------------------------------------------------------------------+
|                    THE OPTIMIZATION ANTI-PATTERN                       |
+-----------------------------------------------------------------------+
|                                                                       |
|   Developer thinks:  "This loop looks slow, let me unroll it"         |
|   Reality:           Loop takes 0.3% of total runtime                 |
|   Actual bottleneck: Memory allocation in a completely different file  |
|                                                                       |
|   Result: Hours wasted, code made harder to read, no speedup          |
|                                                                       |
+-----------------------------------------------------------------------+
|                                                                       |
|   Developer profiles: "90% of time is in cudaMemcpy"                  |
|   Action:             Overlap transfers with computation using streams |
|   Result:             2.3x speedup in 30 minutes of work              |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Amdahl's Law Applied to Optimization

Amdahl's Law is not just about parallelism. It directly governs optimization ROI:

```
                    1
Speedup = ----------------------
          (1 - f) + f / S_local

Where:
  f       = fraction of execution time in the optimized section
  S_local = speedup achieved in that section
```

**Practical implications:**

```
+----------------------------------------------------------------------+
|  SCENARIO: Total runtime = 100 seconds                               |
+----------------------------------------------------------------------+
|                                                                      |
|  Component A:  5% of runtime  (5 seconds)                           |
|  Component B: 80% of runtime  (80 seconds)                          |
|  Component C: 15% of runtime  (15 seconds)                          |
|                                                                      |
|  If you make Component A infinitely fast (f=0.05, S=infinity):      |
|    Speedup = 1 / (1 - 0.05) = 1.053x  (saved 5 seconds)            |
|                                                                      |
|  If you make Component B just 2x faster (f=0.80, S=2):             |
|    Speedup = 1 / (0.20 + 0.40) = 1.67x  (saved 40 seconds)        |
|                                                                      |
|  LESSON: A modest improvement to the dominant component              |
|  outperforms a miraculous improvement to a minor component.          |
|                                                                      |
+----------------------------------------------------------------------+
```

### Common Misconceptions About Bottlenecks

**Misconception 1: "The computation is the bottleneck."**

In GPU programming, developers obsess over kernel arithmetic but the actual bottleneck is frequently data transfer:

```
Typical GPU application time breakdown (before optimization):

|============================================| Host-to-Device transfer (45%)
|===================|                          Kernel execution (22%)
|=================|                            Device-to-Host transfer (20%)
|=====|                                        Kernel launch overhead (6%)
|====|                                         Memory allocation (5%)
|=|                                            Synchronization (2%)
```

**Misconception 2: "I know where my code is slow."**

Studies consistently show that developer intuition about bottlenecks is wrong 70-90% of the time. The human brain is poorly calibrated for reasoning about cache hierarchies, branch prediction, and memory access patterns.

**Misconception 3: "Micro-benchmarks tell the truth."**

Isolated benchmarks often measure the wrong thing:

- The CPU cache is warm (unrealistic for real workloads)
- Branch predictors have learned the pattern (unrealistic)
- Memory allocator is in a favorable state (unrealistic)
- No contention from other threads or processes (unrealistic)

**Misconception 4: "Algorithmic complexity is all that matters."**

An O(n log n) algorithm with terrible cache behavior can be slower than an O(n^2) algorithm with perfect cache locality for realistic input sizes. Constants matter. Cache misses matter. Branch mispredictions matter.

```
Example: Matrix traversal (1024x1024 float matrix)

Row-major traversal (cache-friendly):     ~0.5 ms
Column-major traversal (cache-hostile):    ~8.0 ms
                                           ^^^^^^^^
                                           16x slower, same O(n^2) complexity
```

### The Profiling Mindset

```
+-----------------------------------------------------------------------+
|                    THE PROFILING WORKFLOW                              |
+-----------------------------------------------------------------------+
|                                                                       |
|  1. ESTABLISH BASELINE                                                |
|     - Measure total runtime reproducibly                              |
|     - Record environment: hardware, OS, compiler flags, input data    |
|     - Run 5+ times, report median and variance                        |
|                                                                       |
|  2. IDENTIFY THE BOTTLENECK                                           |
|     - Use system-level profiler (Nsight Systems, perf, VTune)         |
|     - Find the function/kernel consuming the most time                |
|     - Classify: compute-bound? memory-bound? latency-bound?           |
|                                                                       |
|  3. ANALYZE THE BOTTLENECK                                            |
|     - Use detailed profiler (Nsight Compute, Cachegrind, VTune)       |
|     - Understand WHY it is slow                                       |
|     - Form a hypothesis for how to fix it                             |
|                                                                       |
|  4. OPTIMIZE AND MEASURE                                              |
|     - Make ONE change at a time                                       |
|     - Re-measure against the baseline                                 |
|     - If no improvement, revert and try a different hypothesis        |
|                                                                       |
|  5. REPEAT                                                            |
|     - After fixing one bottleneck, the next largest emerges           |
|     - Continue until performance target is met or ROI drops           |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## 2. NVIDIA Nsight Systems

Nsight Systems is the **system-level** profiler for GPU applications. It shows you the big picture: where time is spent across the entire CPU+GPU system, how CPU and GPU work overlap, and where idle gaps exist.

### When to Use Nsight Systems

Use Nsight Systems **first**, before any other GPU profiling tool. It answers:

- What percentage of time is spent in GPU kernels vs. CPU code vs. data transfers?
- Are GPU kernels overlapping with data transfers (using streams correctly)?
- What is the kernel launch overhead?
- Are there idle gaps where neither CPU nor GPU is doing useful work?

### Command-Line Usage

#### Basic profiling

```bash
# Profile an application and generate a .nsys-rep report file
nsys profile --stats=true ./my_cuda_app

# Profile with a specific output name
nsys profile -o my_report ./my_cuda_app

# Profile with CUDA API tracing and kernel tracing
nsys profile --trace=cuda,nvtx,osrt ./my_cuda_app

# Profile only a specific time range (skip first 5 seconds, capture 10 seconds)
nsys profile --delay=5 --duration=10 ./my_cuda_app

# Limit the trace buffer to avoid enormous files
nsys profile --trace-fork-before-exec=true \
             --cuda-memory-usage=true \
             -o detailed_report ./my_cuda_app
```

#### Profiling with NVTX markers

NVTX (NVIDIA Tools Extension) markers let you annotate your code so the profiler shows meaningful names instead of raw addresses.

```cpp
#include <nvtx3/nvToolsExt.h>

void train_epoch(Model& model, DataLoader& loader) {
    nvtxRangePushA("Training Epoch");

    for (auto& batch : loader) {
        nvtxRangePushA("Forward Pass");
        auto output = model.forward(batch.input);
        nvtxRangePop();

        nvtxRangePushA("Loss Computation");
        auto loss = compute_loss(output, batch.target);
        nvtxRangePop();

        nvtxRangePushA("Backward Pass");
        loss.backward();
        nvtxRangePop();

        nvtxRangePushA("Optimizer Step");
        optimizer.step();
        nvtxRangePop();
    }

    nvtxRangePop();  // Training Epoch
}
```

Compile with NVTX:

```bash
nvcc -o train train.cu -lnvToolsExt
nsys profile --trace=cuda,nvtx -o training_report ./train
```

#### Generating summary statistics

```bash
# Print summary statistics to the terminal
nsys stats my_report.nsys-rep

# Export to SQLite for custom analysis
nsys export --type=sqlite my_report.nsys-rep

# Export specific tables
nsys stats --report cuda_gpu_kern_sum my_report.nsys-rep
nsys stats --report cuda_api_sum my_report.nsys-rep
nsys stats --report nvtx_sum my_report.nsys-rep
```

### Interpreting the Nsight Systems Timeline

The timeline view (opened in the Nsight Systems GUI) shows multiple rows:

```
+-----------------------------------------------------------------------+
|  NSIGHT SYSTEMS TIMELINE VIEW                                         |
+-----------------------------------------------------------------------+
|                                                                       |
|  CPU Thread 0:                                                        |
|  |===cudaMemcpy===|  |=cudaLaunch=| |===cudaMemcpy===|              |
|                                                                       |
|  CPU Thread 1:                                                        |
|  |====data_prep====|     |====data_prep====|                         |
|                                                                       |
|  CUDA API:                                                            |
|  |cudaMemcpyAsync| |cudaLaunchKernel|  |cudaMemcpyAsync|            |
|                                                                       |
|  GPU - Stream 0:                                                      |
|        |==HtoD==|  |===kernel_A===|  |==DtoH==|                      |
|                                                                       |
|  GPU - Stream 1:                                                      |
|                |==HtoD==|  |===kernel_B===|  |==DtoH==|              |
|                                                                       |
|  NVTX Markers:                                                        |
|  |====Forward Pass====|  |==Loss==|  |====Backward====|              |
|                                                                       |
|  Time -->                                                             |
+-----------------------------------------------------------------------+
```

**Key things to look for:**

1. **GPU idle gaps**: Large white spaces on the GPU rows mean the GPU is waiting. This usually means the CPU is not feeding work fast enough (CPU-bound) or you are not using streams to overlap work.

2. **Serial data transfers**: If HtoD and DtoH transfers happen sequentially with kernel execution, you need streams and double-buffering.

3. **Tiny kernels with long gaps**: If kernel bars are thin with large spaces between them, kernel launch overhead dominates. Consider kernel fusion or persistent kernels.

4. **cudaMemcpy dominance**: If the majority of time is in cudaMemcpy calls, consider:

   - Unified Memory to eliminate explicit transfers
   - Pinned memory for faster transfers
   - Overlapping transfers with computation

5. **NVTX region imbalance**: If one NVTX region dominates, that is your optimization target.

### Key Metrics from Nsight Systems

```
+-------------------------------------------+---------------------------+
| Metric                                    | What It Tells You         |
+-------------------------------------------+---------------------------+
| CUDA API time (total)                     | CPU overhead of CUDA calls|
| GPU kernel time (total)                   | Actual GPU compute time   |
| Memory transfer time (HtoD + DtoH)        | Data movement cost        |
| GPU utilization %                         | % of time GPU is active   |
| Kernel launch count                       | Overhead from many small  |
|                                           | kernel launches           |
| Average kernel duration                   | Whether kernels are too   |
|                                           | short (launch overhead)   |
| Stream concurrency                        | Whether streams overlap   |
+-------------------------------------------+---------------------------+
```

### Example: Identifying a Data Transfer Bottleneck

```bash
$ nsys stats --report cuda_gpu_kern_sum my_report.nsys-rep

 Time (%)  Total Time (ns)  Instances  Avg (ns)   Kernel Name
 --------  ---------------  ---------  ---------  ---------------------
    12.4       1,240,000          50    24,800    matrix_multiply_kernel
     8.1         810,000         100     8,100    vector_add_kernel
     2.3         230,000          50     4,600    reduce_kernel

$ nsys stats --report cuda_api_sum my_report.nsys-rep

 Time (%)  Total Time (ns)  Num Calls  Avg (ns)    Name
 --------  ---------------  ---------  ----------  ----------------------
    62.1      15,525,000         200     77,625    cudaMemcpy
    18.4       4,600,000         200     23,000    cudaLaunchKernel
    11.2       2,800,000           4    700,000    cudaMalloc
     5.8       1,450,000         200      7,250    cudaMemcpyAsync
     2.5         625,000           4    156,250    cudaFree
```

**Analysis**: 62% of total CUDA API time is in `cudaMemcpy`. The GPU kernels themselves are fast. The fix: switch to `cudaMemcpyAsync` with streams, use pinned memory, and overlap transfers with kernel execution.

---

## 3. NVIDIA Nsight Compute

Nsight Compute is the **kernel-level** profiler. After Nsight Systems tells you which kernel is the bottleneck, Nsight Compute tells you **why** that kernel is slow and **how** to fix it.

### When to Use Nsight Compute

Use Nsight Compute **after** Nsight Systems has identified a specific kernel as the bottleneck. It answers:

- Is the kernel compute-bound or memory-bound?
- What is the occupancy and what limits it?
- Are memory accesses coalesced?
- What are the warp stall reasons?
- Where does the kernel sit on the roofline?

### Command-Line Usage

```bash
# Profile all kernels (full metrics set)
ncu ./my_cuda_app

# Profile a specific kernel by name
ncu --kernel-name "matrix_multiply" ./my_cuda_app

# Profile with the full metric set (slower but comprehensive)
ncu --set full -o kernel_report ./my_cuda_app

# Profile specific metrics
ncu --metrics \
    sm__throughput.avg.pct_of_peak_sustained_elapsed,\
    gpu__compute_memory_throughput.avg.pct_of_peak_sustained_elapsed,\
    l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum,\
    l1tex__t_sectors_pipe_lsu_mem_global_op_st.sum \
    ./my_cuda_app

# Profile only the 3rd invocation of a kernel (skip warmup)
ncu --kernel-name "my_kernel" --launch-skip 2 --launch-count 1 ./my_cuda_app

# Profile with roofline analysis
ncu --set roofline -o roofline_report ./my_cuda_app

# Profile with source-level analysis
ncu --set source -o source_report ./my_cuda_app

# Compare two kernel implementations
ncu --set full -o baseline ./my_cuda_app_v1
ncu --set full -o optimized ./my_cuda_app_v2
# Then open both in the GUI and use the "Compare" feature
```

### Understanding the Nsight Compute Report

#### Speed-of-Light (SOL) Analysis

The SOL section shows how close your kernel is to the theoretical hardware limits:

```
+-----------------------------------------------------------------------+
|  SPEED OF LIGHT ANALYSIS                                              |
+-----------------------------------------------------------------------+
|                                                                       |
|  Compute (SM) Throughput:    35.2%  of peak                          |
|  Memory Throughput:          87.4%  of peak                          |
|                                                                       |
|  INTERPRETATION:                                                      |
|  Memory throughput >> Compute throughput                              |
|  --> This kernel is MEMORY-BOUND                                     |
|                                                                       |
|  If both are low (<25%):                                             |
|  --> Kernel is LATENCY-BOUND (stalls, low occupancy, etc.)           |
|                                                                       |
|  If Compute >> Memory:                                               |
|  --> Kernel is COMPUTE-BOUND                                         |
|                                                                       |
+-----------------------------------------------------------------------+
```

#### Occupancy Analysis

```
+-----------------------------------------------------------------------+
|  OCCUPANCY ANALYSIS                                                   |
+-----------------------------------------------------------------------+
|                                                                       |
|  Achieved Occupancy:     62.5%   (40 out of 64 max warps per SM)     |
|  Theoretical Occupancy:  75.0%   (48 out of 64 max warps per SM)     |
|                                                                       |
|  LIMITERS (what prevents 100% occupancy):                            |
|                                                                       |
|  Registers per thread:   48      (limits blocks per SM)              |
|  Shared memory per block: 16 KB  (limits blocks per SM)              |
|  Block size:             256     (not a limiter)                     |
|                                                                       |
|  OCCUPANCY LIMITER BREAKDOWN:                                        |
|  +----+----+----+----+----+----+----+----+----+----+                 |
|  |    |    |    |XXXX|XXXX|XXXX|    |    |    |    |  Registers      |
|  +----+----+----+----+----+----+----+----+----+----+                 |
|  0%                  50%                        100%                  |
|                                                                       |
|  Registers are the primary occupancy limiter.                        |
|  Consider using __launch_bounds__ or reducing register usage.        |
|                                                                       |
+-----------------------------------------------------------------------+
```

#### Warp Stall Reasons

This is one of the most valuable pieces of information in Nsight Compute:

```
+-----------------------------------------------------------------------+
|  WARP STALL REASONS                                                   |
+-----------------------------------------------------------------------+
|                                                                       |
|  stall_long_scoreboard:    42.3%   Memory dependency (global/local)  |
|  stall_mio_throttle:      18.7%   Memory instruction queue full      |
|  stall_short_scoreboard:  12.1%   Math pipeline dependency           |
|  stall_not_selected:       9.8%   Warp was eligible but not chosen   |
|  stall_wait:               8.2%   Waiting for barrier/sync           |
|  stall_tex_throttle:       4.6%   Texture unit busy                  |
|  stall_math_pipe_throttle: 3.1%   Math pipeline backpressure         |
|  stall_misc:               1.2%   Other                              |
|                                                                       |
|  INTERPRETATION:                                                      |
|  42.3% long_scoreboard = warps waiting for global memory loads       |
|  --> Memory latency is the dominant bottleneck                       |
|  --> Fix: improve coalescing, use shared memory, increase occupancy  |
|                                                                       |
+-----------------------------------------------------------------------+
```

**Common stall reasons and what they mean:**

| Stall Reason         | Cause                             | Fix                                                 |
| -------------------- | --------------------------------- | --------------------------------------------------- |
| `long_scoreboard`    | Waiting for global memory         | Better coalescing, shared memory cache, prefetching |
| `short_scoreboard`   | Waiting for math pipeline         | Reduce instruction-level dependencies, ILP          |
| `mio_throttle`       | Memory instruction queue full     | Fewer memory instructions per thread                |
| `wait`               | `__syncthreads()` barrier         | Reduce synchronization, algorithmic change          |
| `not_selected`       | Low priority among eligible warps | More warps (higher occupancy)                       |
| `math_pipe_throttle` | Compute pipeline saturated        | Already compute-bound, good sign                    |
| `tex_throttle`       | Texture unit saturated            | Reduce texture fetches                              |
| `lg_throttle`        | Local/global memory throttle      | Reduce memory traffic                               |

#### Memory Workload Analysis

```
+-----------------------------------------------------------------------+
|  MEMORY WORKLOAD ANALYSIS                                             |
+-----------------------------------------------------------------------+
|                                                                       |
|  Global Load Transactions:                                            |
|    Requested:    1,048,576 sectors                                   |
|    Executed:     4,194,304 sectors                                   |
|    Ratio:        4.0x  <-- BAD: 4x more data loaded than needed      |
|                                                                       |
|  This means global loads are NOT coalesced.                          |
|  Each 32-byte sector fetch brings only 8 bytes of useful data.       |
|                                                                       |
|  Global Store Transactions:                                           |
|    Requested:    524,288 sectors                                     |
|    Executed:     524,288 sectors                                     |
|    Ratio:        1.0x  <-- GOOD: stores are perfectly coalesced      |
|                                                                       |
|  Shared Memory:                                                       |
|    Bank Conflicts: 0   <-- GOOD: no bank conflicts                   |
|    Throughput:     78% of peak                                       |
|                                                                       |
|  L2 Cache:                                                            |
|    Hit Rate:  34%  <-- LOW: most accesses miss L2                    |
|    Throughput: 65% of peak                                           |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Roofline Analysis

Nsight Compute can generate a roofline chart:

```bash
ncu --set roofline -o roofline_report ./my_cuda_app
```

```
+-----------------------------------------------------------------------+
|  ROOFLINE CHART (Nsight Compute)                                      |
+-----------------------------------------------------------------------+
|                                                                       |
|  Performance     ^                                                    |
|  (GFLOP/s)      |                    ........ Peak Compute            |
|                  |                ...                                  |
|                  |            ...     /                                |
|  1000 -          |        ...        /                                |
|                  |      ..          /   * Kernel B (compute-bound)    |
|                  |    ..           /                                   |
|                  |  ..            /                                    |
|   100 -          | .          * Kernel A (memory-bound)               |
|                  |.          /                                         |
|                  |          /                                          |
|                  |         / Memory bandwidth ceiling                  |
|    10 -          |        /                                           |
|                  |       /                                             |
|                  |      /                                              |
|                  +------+--------+---------+--------->                |
|                  0.1    1        10        100                        |
|                        Arithmetic Intensity (FLOP/Byte)               |
|                                                                       |
|  Kernel A: AI = 0.8, far below the roofline                         |
|  --> Memory-bound, optimize memory accesses                          |
|                                                                       |
|  Kernel B: AI = 25, near the compute ceiling                         |
|  --> Compute-bound, optimize arithmetic (or accept current perf)     |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## 4. nvprof / ncu Command-Line Tools

### nvprof (Legacy, pre-Volta)

`nvprof` is the older command-line profiler, deprecated for Volta+ GPUs but still useful for older hardware and as a quick reference.

```bash
# Basic profiling with summary
nvprof ./my_cuda_app

# Detailed GPU trace
nvprof --print-gpu-trace ./my_cuda_app

# Specific metrics
nvprof --metrics achieved_occupancy,gld_throughput,gst_throughput ./my_cuda_app

# Specific events
nvprof --events l2_subp0_read_sector_misses,l2_subp0_write_sector_misses ./my_cuda_app

# Export to CSV for analysis
nvprof --csv --log-file output.csv ./my_cuda_app

# Profile specific kernels
nvprof --kernels "matrix_multiply" --metrics all ./my_cuda_app

# Memory transfer analysis
nvprof --print-gpu-trace --print-api-trace ./my_cuda_app
```

**Example nvprof output:**

```
==12345== Profiling result:
            Type  Time(%)      Time     Calls       Avg       Min       Max  Name
 GPU activities:   45.21%  2.105ms        10  210.5us  208.1us  215.3us  matrix_multiply_kernel
                   32.15%  1.497ms        20   74.8us   72.1us   78.4us  [CUDA memcpy HtoD]
                   18.42%  857.6us        10   85.7us   83.2us   89.1us  [CUDA memcpy DtoH]
                    4.22%  196.5us        10   19.6us   18.9us   20.8us  vector_add_kernel
      API calls:   68.32%  45.12ms         1  45.12ms  45.12ms  45.12ms  cudaMalloc
                   15.67%  10.35ms        30  345.0us   12.4us   2.15ms  cudaMemcpy
                   12.88%   8.51ms        20  425.5us   15.2us   1.87ms  cudaLaunchKernel
                    3.13%   2.07ms         1   2.07ms   2.07ms   2.07ms  cudaFree
```

### ncu (NVIDIA Compute Profiler CLI)

`ncu` is the modern command-line equivalent of Nsight Compute.

```bash
# Quick summary of all kernels
ncu --target-processes all ./my_cuda_app

# Detailed analysis with sections
ncu --section ComputeWorkloadAnalysis \
    --section MemoryWorkloadAnalysis \
    --section Occupancy \
    --section LaunchStats \
    ./my_cuda_app

# Collect specific metrics
ncu --metrics \
    sm__warps_active.avg.pct_of_peak_sustained_elapsed,\
    dram__bytes_read.sum,\
    dram__bytes_write.sum,\
    smsp__sass_thread_inst_executed_op_fadd_pred_on.sum,\
    smsp__sass_thread_inst_executed_op_fmul_pred_on.sum,\
    smsp__sass_thread_inst_executed_op_ffma_pred_on.sum \
    ./my_cuda_app

# Compare two runs
ncu --set full -o run_A ./my_cuda_app_v1
ncu --set full -o run_B ./my_cuda_app_v2
ncu --diff run_A.ncu-rep run_B.ncu-rep

# Profile with page-by-page output for long reports
ncu --page raw --set full ./my_cuda_app
```

### Key Metrics to Collect

```
+-----------------------------------------------------------------------+
|  ESSENTIAL METRICS REFERENCE                                          |
+-----------------------------------------------------------------------+
|                                                                       |
|  THROUGHPUT METRICS:                                                  |
|    sm__throughput.avg.pct_of_peak_sustained_elapsed                   |
|      --> Compute utilization (% of peak)                             |
|    gpu__compute_memory_throughput.avg.pct_of_peak_sustained_elapsed   |
|      --> Memory utilization (% of peak)                              |
|    dram__throughput.avg.pct_of_peak_sustained_elapsed                 |
|      --> DRAM bandwidth utilization                                  |
|                                                                       |
|  OCCUPANCY METRICS:                                                   |
|    sm__warps_active.avg.pct_of_peak_sustained_elapsed                 |
|      --> Achieved occupancy                                          |
|    launch__occupancy_limit_warps                                      |
|      --> Theoretical max warps per SM                                |
|    launch__occupancy_limit_registers                                  |
|      --> Register-limited occupancy                                  |
|    launch__occupancy_limit_shared_mem                                 |
|      --> Shared memory-limited occupancy                             |
|                                                                       |
|  MEMORY METRICS:                                                      |
|    dram__bytes_read.sum + dram__bytes_write.sum                       |
|      --> Total DRAM traffic (for arithmetic intensity calc)          |
|    l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum                     |
|      --> L1 sectors requested for global loads                       |
|    l2__read_throughput.avg.pct_of_peak_sustained_elapsed              |
|      --> L2 cache read throughput                                    |
|                                                                       |
|  INSTRUCTION METRICS:                                                 |
|    smsp__inst_executed.sum                                            |
|      --> Total instructions executed                                 |
|    smsp__sass_thread_inst_executed_op_ffma_pred_on.sum                |
|      --> FMA operations (for FLOP count)                             |
|                                                                       |
+-----------------------------------------------------------------------+
```

### nvprof vs ncu Comparison

| Feature            | nvprof                              | ncu                                |
| ------------------ | ----------------------------------- | ---------------------------------- |
| GPU Support        | Pre-Volta (Kepler, Maxwell, Pascal) | Volta and newer                    |
| Kernel profiling   | Basic metrics                       | Full sections with analysis        |
| Roofline           | Not built-in                        | Built-in roofline chart            |
| Source correlation | Limited                             | Full SASS/PTX source mapping       |
| Comparison mode    | Not built-in                        | Built-in diff mode                 |
| Speed              | Faster (fewer metrics)              | Slower (replays kernel per metric) |
| Status             | Deprecated                          | Actively maintained                |

---

## 5. Linux perf

`perf` is the Swiss Army knife of CPU profiling on Linux. It provides access to hardware performance counters, software events, and can generate data for flame graphs.

### Hardware Performance Counters

Modern CPUs have dedicated hardware counters that count events like cache misses, branch mispredictions, and instructions retired --- with zero overhead (the counters are always running).

### perf stat: Counting Events

```bash
# Basic statistics for a program
perf stat ./my_app

# Output:
#  Performance counter stats for './my_app':
#
#      3,245.67 msec  task-clock                 #    0.998 CPUs utilized
#            12       context-switches           #    3.697 /sec
#             2       cpu-migrations             #    0.616 /sec
#        12,456       page-faults                #    3.837 K/sec
#  9,734,567,890      cycles                     #    2.999 GHz
#  7,821,234,567      instructions               #    0.80  insn per cycle
#  1,234,567,890      branches                   #  380.321 M/sec
#     45,678,901      branch-misses              #    3.70% of all branches
#
#       3.252 seconds time elapsed

# Detailed cache statistics
perf stat -e cache-references,cache-misses,\
L1-dcache-loads,L1-dcache-load-misses,\
L1-icache-load-misses,\
LLC-loads,LLC-load-misses \
./my_app

# Example output:
#     234,567,890  cache-references
#      45,678,901  cache-misses              #   19.47% of all cache refs
#   1,234,567,890  L1-dcache-loads
#      12,345,678  L1-dcache-load-misses     #    1.00% of all L1-dcache hits
#       2,345,678  L1-icache-load-misses
#      34,567,890  LLC-loads
#      23,456,789  LLC-load-misses           #   67.86% of all LL-cache hits

# Branch prediction statistics
perf stat -e branches,branch-misses,\
branch-loads,branch-load-misses \
./my_app

# Specific PMU events (hardware-specific)
perf stat -e r04C1,r01C1 ./my_app   # Raw PMU events

# Compare two implementations
perf stat -r 5 ./my_app_v1   # Run 5 times, report stats with std deviation
perf stat -r 5 ./my_app_v2
```

### Interpreting perf stat Output

```
+-----------------------------------------------------------------------+
|  KEY PERF STAT METRICS AND WHAT THEY MEAN                            |
+-----------------------------------------------------------------------+
|                                                                       |
|  Instructions per Cycle (IPC):                                        |
|    > 2.0     EXCELLENT: CPU is well-utilized                         |
|    1.0 - 2.0 GOOD: room for improvement                             |
|    < 1.0     POOR: likely memory-bound or branch-heavy               |
|    Modern CPUs can retire 4-6 instructions/cycle theoretically       |
|                                                                       |
|  Branch Miss Rate:                                                    |
|    < 1%      EXCELLENT: predictable branches                         |
|    1% - 5%   NORMAL: some unpredictable branches                     |
|    > 5%      POOR: consider branchless alternatives                  |
|    Each miss costs ~15-20 cycles (pipeline flush)                    |
|                                                                       |
|  L1 Cache Miss Rate:                                                  |
|    < 3%      EXCELLENT: data fits in L1                              |
|    3% - 10%  NORMAL: some capacity/conflict misses                   |
|    > 10%     POOR: bad locality, consider restructuring              |
|                                                                       |
|  LLC (Last-Level Cache) Miss Rate:                                    |
|    < 10%     GOOD: working set fits in cache                         |
|    > 50%     BAD: streaming through memory, memory-bound             |
|                                                                       |
+-----------------------------------------------------------------------+
```

### perf record + perf report: Sampling Profiling

```bash
# Record samples (default: cycles event)
perf record -g ./my_app
# -g enables call graph recording (for flame graphs)

# Record with specific frequency (99 Hz to avoid lockstep with timer)
perf record -F 99 -g ./my_app

# Record specific events
perf record -e cache-misses -g ./my_app

# Record with DWARF unwinding (better call stacks for optimized code)
perf record --call-graph dwarf -F 99 ./my_app

# View the report interactively
perf report

# View the report with specific sort order
perf report --sort=dso,symbol

# View annotated assembly for a specific function
perf annotate my_hot_function
```

**Example perf report output:**

```
# perf report
#
# Overhead  Command    Shared Object     Symbol
# ........  .........  ................  ...........................
#
    42.31%  my_app     my_app            [.] matrix_multiply
    18.76%  my_app     libc-2.31.so      [.] __memmove_avx_unaligned
    12.45%  my_app     my_app            [.] compute_distances
     8.92%  my_app     libm-2.31.so      [.] __exp_finite
     6.23%  my_app     my_app            [.] sort_results
     4.87%  my_app     libc-2.31.so      [.] malloc
     3.21%  my_app     my_app            [.] parse_input
     2.15%  my_app     [kernel]          [k] copy_page
     1.10%  my_app     my_app            [.] write_output
```

**Reading perf annotate output:**

```bash
perf annotate matrix_multiply

# Output shows source lines mixed with assembly,
# with percentage of samples on each instruction:
#
#  Percent |  Source:Assembly
# ---------+-------------------------------------------
#          |  for (int i = 0; i < N; i++) {
#          |    for (int j = 0; j < N; j++) {
#          |      float sum = 0.0f;
#          |      for (int k = 0; k < N; k++) {
#   42.31% |        movss  (%rax,%rcx,4), %xmm0     <-- cache miss here
#    8.12% |        mulss  (%rdx,%rcx,4), %xmm0
#   12.45% |        addss  %xmm0, %xmm1
#          |        inc    %rcx
#    2.03% |        cmp    %r8, %rcx
#          |        jne    loop_start
```

The 42.31% on the `movss` load instruction tells you: nearly half of all CPU cycles are spent waiting for this memory load. This is a classic sign of cache misses due to strided access in matrix B.

### perf for Specific Scenarios

```bash
# Find cache-miss hotspots
perf record -e LLC-load-misses -g ./my_app
perf report

# Find branch misprediction hotspots
perf record -e branch-misses -g ./my_app
perf report

# System-wide profiling (all processes)
sudo perf record -a -g sleep 10
sudo perf report

# Profile a running process
perf record -p <PID> -g sleep 30

# Count page faults to find memory allocation hotspots
perf record -e page-faults -g ./my_app
perf report

# Use perf with CPU frequency information
perf stat -e cycles,instructions,cpu-clock,task-clock ./my_app
```

### Generating Flame Graphs from perf

```bash
# Step 1: Record samples with call graphs
perf record -F 99 -g ./my_app

# Step 2: Generate the folded stack format
perf script | stackcollapse-perf.pl > out.folded

# Step 3: Generate the SVG flame graph
flamegraph.pl out.folded > flamegraph.svg

# Or as a one-liner using Brendan Gregg's FlameGraph tools:
perf record -F 99 -g ./my_app && \
perf script | \
  ~/FlameGraph/stackcollapse-perf.pl | \
  ~/FlameGraph/flamegraph.pl > flamegraph.svg
```

(See Section 11 for a full treatment of flame graphs.)

---

## 6. Intel VTune Profiler

Intel VTune is the gold standard for CPU profiling on Intel hardware (and increasingly on AMD). It provides deeper microarchitecture insight than perf.

### Installation and Setup

```bash
# VTune is free as part of Intel oneAPI Base Toolkit
# Install from: https://www.intel.com/content/www/us/en/developer/tools/oneapi/vtune-profiler.html

# Source the environment (after installation)
source /opt/intel/oneapi/setvars.sh

# Verify installation
vtune --version
```

### Analysis Types

```
+-----------------------------------------------------------------------+
|  VTUNE ANALYSIS TYPES                                                 |
+-----------------------------------------------------------------------+
|                                                                       |
|  hotspots              Most common. Find functions consuming          |
|                        the most CPU time.                             |
|                                                                       |
|  microarchitecture     Deep dive into pipeline stalls, cache          |
|  (uarch-exploration)   misses, front-end/back-end bottlenecks.       |
|                                                                       |
|  memory-access         Memory hierarchy analysis: NUMA, cache         |
|                        utilization, bandwidth.                        |
|                                                                       |
|  threading             Thread contention, locks, load imbalance,      |
|                        serial vs. parallel regions.                   |
|                                                                       |
|  hpc-performance       Combined analysis for HPC workloads:          |
|                        vectorization, memory, compute.               |
|                                                                       |
|  io                    I/O wait analysis: disk, network,              |
|                        synchronization primitives.                    |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Command-Line Usage

```bash
# Hotspot analysis (most common starting point)
vtune -collect hotspots -result-dir hotspot_results ./my_app

# Microarchitecture exploration (the deepest CPU analysis)
vtune -collect uarch-exploration -result-dir uarch_results ./my_app

# Memory access analysis
vtune -collect memory-access -result-dir memory_results ./my_app

# Threading analysis
vtune -collect threading -result-dir thread_results ./my_app

# HPC-specific analysis (vectorization, memory, compute)
vtune -collect hpc-performance -result-dir hpc_results ./my_app

# Generate a text report
vtune -report summary -result-dir hotspot_results

# Generate a hotspots report sorted by CPU time
vtune -report hotspots -result-dir hotspot_results

# Generate a report for a specific function
vtune -report hotspots -result-dir hotspot_results \
      -filter "Function=matrix_multiply"

# Open GUI with results
vtune-gui hotspot_results &
```

### Interpreting VTune Results

#### Hotspot Analysis Output

```
vtune -report summary -result-dir hotspot_results

Elapsed Time:         3.245 s
CPU Time:            12.890 s   (4 threads)
Clockticks:     38,670,000,000
Instructions Retired: 31,234,567,890
CPI Rate:              1.238     <-- Cycles Per Instruction

Top Hotspots:
Function                Module        CPU Time  % of CPU Time
----------------------  -----------  ---------  -------------
matrix_multiply         my_app         5.456 s       42.3%
compute_distances       my_app         2.421 s       18.8%
__memmove_avx_unaligned libc.so        1.612 s       12.5%
__exp_finite            libm.so        1.149 s        8.9%
sort_results            my_app         0.803 s        6.2%
[Other]                                1.449 s       11.3%
```

#### Microarchitecture Exploration Output

```
vtune -report summary -result-dir uarch_results

Pipeline Analysis:
+-----------------------------------------------+
|                                               |
|  Front-End Bound:    8.2%                     |
|    |-- Front-End Latency:  5.1%               |
|    |-- Front-End Bandwidth: 3.1%              |
|                                               |
|  Back-End Bound:    72.4%    <-- MAIN ISSUE   |
|    |-- Memory Bound:       58.3%              |
|    |   |-- L1 Bound:       12.1%              |
|    |   |-- L2 Bound:        8.4%              |
|    |   |-- L3 Bound:       15.7%              |
|    |   |-- DRAM Bound:     22.1%   <-- KEY    |
|    |-- Core Bound:         14.1%              |
|                                               |
|  Retiring:          15.2%                     |
|  Bad Speculation:    4.2%                     |
|    |-- Branch Mispredict:   3.8%              |
|    |-- Machine Clears:      0.4%              |
|                                               |
+-----------------------------------------------+
|                                               |
|  INTERPRETATION:                              |
|  72.4% Back-End Bound, of which 58.3%        |
|  is Memory Bound, primarily DRAM Bound.       |
|  The application is memory-bandwidth-limited. |
|                                               |
|  Only 15.2% of pipeline slots are used        |
|  for useful work (Retiring).                  |
|                                               |
+-----------------------------------------------+
```

#### Threading Analysis Output

```
vtune -report summary -result-dir thread_results

CPU Utilization:        75.2%  (3.01 out of 4 logical CPUs)
Effective Physical Core Utilization: 81.3%

Thread Concurrency:
  0 threads active:     5.1%
  1 thread active:     18.7%
  2 threads active:    12.3%
  3 threads active:     8.9%
  4 threads active:    55.0%

Top Wait/Contention Objects:
Object                   Wait Time  Contention
---------------------   ---------  ----------
pthread_mutex (0x7f..)     245 ms    1,234 events
pthread_cond (0x7f..)      123 ms      567 events
futex (0x7f..)              89 ms      234 events

Imbalance or Serial Spinning: 18.7% of wall time
  --> Significant serial section exists
  --> Consider reducing critical section scope or using lock-free algorithms
```

### VTune Tips

1. **Compile with debug info** (`-g`) but keep optimizations on (`-O2`). VTune needs symbols for source correlation but you want real-world performance behavior.

2. **Disable turbo boost** for reproducible results:

   ```bash
   echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo
   ```

3. **Pin threads to cores** to avoid migration noise:

   ```bash
   taskset -c 0-3 ./my_app
   ```

4. **Use ITT API** for custom annotations (like NVTX for GPU):

   ```cpp
   #include <ittnotify.h>
   __itt_domain* domain = __itt_domain_create("MyDomain");
   __itt_string_handle* task = __itt_string_handle_create("ComputePhase");

   __itt_task_begin(domain, __itt_null, __itt_null, task);
   compute();
   __itt_task_end(domain);
   ```

---

## 7. Valgrind / Cachegrind

Valgrind is a dynamic instrumentation framework. It does not use hardware counters --- instead, it simulates the CPU and memory system in software. This makes it slow (10-50x) but extremely accurate and portable.

### Memcheck: Memory Error Detection

```bash
# Detect memory errors (buffer overflows, use-after-free, leaks)
valgrind --tool=memcheck --leak-check=full ./my_app

# With more detail
valgrind --tool=memcheck \
         --leak-check=full \
         --show-reachable=yes \
         --track-origins=yes \
         --verbose \
         ./my_app
```

**Example Memcheck output:**

```
==12345== Invalid read of size 4
==12345==    at 0x4012AB: process_data (main.c:42)
==12345==    by 0x401345: main (main.c:67)
==12345==  Address 0x5204048 is 0 bytes after a block of size 40 alloc'd
==12345==    at 0x4C2FB55: malloc (vg_replace_malloc.c:299)
==12345==    by 0x401289: process_data (main.c:38)

==12345== LEAK SUMMARY:
==12345==    definitely lost: 1,024 bytes in 4 blocks
==12345==    indirectly lost: 2,048 bytes in 8 blocks
==12345==      possibly lost: 0 bytes in 0 blocks
==12345==    still reachable: 512 bytes in 1 blocks
==12345==         suppressed: 0 bytes in 0 blocks
```

### Cachegrind: Cache Simulation

Cachegrind simulates the L1 instruction cache, L1 data cache, and last-level cache (LL/L2). It counts cache hits and misses for every line of code.

```bash
# Run Cachegrind
valgrind --tool=cachegrind ./my_app

# Output goes to a file: cachegrind.out.<PID>
# Annotate the results
cg_annotate cachegrind.out.12345

# Annotate a specific source file
cg_annotate cachegrind.out.12345 main.c

# Compare two runs (e.g., before/after optimization)
cg_diff cachegrind.out.before cachegrind.out.after
cg_annotate cachegrind.out.diff
```

**Example Cachegrind output:**

```
$ cg_annotate cachegrind.out.12345

--------------------------------------------------------------------------------
I   refs:      4,567,890,123
I1  misses:          234,567
LLi misses:           45,678
I1  miss rate:          0.01%
LLi miss rate:          0.00%

D   refs:      2,345,678,901  (1,567,890,123 rd   + 777,788,778 wr)
D1  misses:       89,012,345  (   78,901,234 rd   +  10,111,111 wr)
LL  misses:       45,678,901  (   40,123,456 rd   +   5,555,445 wr)
D1  miss rate:           3.8% (          5.0% rd   +        1.3% wr)
LL  miss rate:           1.9% (          2.6% rd   +        0.7% wr)

--------------------------------------------------------------------------------
         Ir         I1mr       ILmr         Dr         D1mr       DLmr  ...
--------------------------------------------------------------------------------
4,567,890,123  234,567  45,678  2,345,678,901  89,012,345  45,678,901  PROGRAM TOTALS

--------------------------------------------------------------------------------
-- line-by-line data for matrix_multiply (from main.c) --
         Ir    I1mr  ILmr           Dr       D1mr     DLmr
          .       .     .            .          .        .  for (int i = 0; i < N; i++) {
          .       .     .            .          .        .    for (int j = 0; j < N; j++) {
          .       .     .            .          .        .      float sum = 0.0f;
  1,073,741,824  0   0   1,073,741,824   67,108,864  33,554,432  for (int k = 0; k < N; k++) {
                                                                    sum += A[i*N+k] * B[k*N+j];
                                              ^^^^^^^^^^^^^^^^^^^
                                              B[k*N+j] has stride-N access
                                              causing massive D1 and LL misses
```

### Callgrind: Call Graph Profiling

```bash
# Run Callgrind (instruction-level profiling with call graph)
valgrind --tool=callgrind ./my_app

# Visualize with KCachegrind (GUI)
kcachegrind callgrind.out.12345

# Or use callgrind_annotate for text output
callgrind_annotate callgrind.out.12345
```

**Callgrind output includes:**

- Instruction counts per function (not time, but proportional to time)
- Call counts per function
- Inclusive vs. exclusive cost (with/without callees)
- Call graph with annotated edges

### DHAT: Dynamic Heap Analysis Tool

```bash
# Analyze heap allocations: which allocations are hot, short-lived, etc.
valgrind --tool=dhat ./my_app

# Output: dhat.out.<PID>
# View in browser (DHAT viewer)
# Open: https://valgrind.org/docs/manual/dh-manual.html
```

### Massif: Heap Profiler

```bash
# Profile heap memory usage over time
valgrind --tool=massif ./my_app

# Visualize
ms_print massif.out.12345

# Example output: shows memory usage over time as an ASCII chart
# Useful for finding memory leaks and peak memory usage
```

### Practical Tips for Valgrind

1. **Compile with `-g -O1`**: Debug symbols for line numbers, light optimization to stay realistic. `-O0` changes behavior too much; `-O2` can confuse source mapping.

2. **Use suppression files** to filter known false positives:

   ```bash
   valgrind --suppressions=my_suppressions.supp ./my_app
   ```

3. **Cachegrind cache parameters** can be set to match your actual hardware:

   ```bash
   valgrind --tool=cachegrind \
            --D1=32768,8,64 \
            --LL=8388608,16,64 \
            ./my_app
   # Format: size,associativity,line_size (in bytes)
   ```

4. **Speed**: Cachegrind is about 20-50x slower than native execution. For large applications, reduce the problem size while preserving the memory access pattern.

---

## 8. CUDA Debugging

Debugging GPU code is notoriously difficult because thousands of threads execute simultaneously, bugs may only manifest in specific thread/block combinations, and traditional debugging tools do not work on device code.

### compute-sanitizer (replaces cuda-memcheck)

`compute-sanitizer` is the modern CUDA memory and synchronization error detector.

```bash
# Detect out-of-bounds memory access
compute-sanitizer --tool memcheck ./my_cuda_app

# Detect race conditions in shared memory
compute-sanitizer --tool racecheck ./my_cuda_app

# Detect uninitialized memory access
compute-sanitizer --tool initcheck ./my_cuda_app

# Synchronization error detection
compute-sanitizer --tool synccheck ./my_cuda_app

# All checks combined (slowest but most thorough)
compute-sanitizer --tool memcheck \
                  --leak-check full \
                  --show-backtrace yes \
                  ./my_cuda_app
```

**Example memcheck output:**

```
========= COMPUTE-SANITIZER
========= Invalid __global__ read of size 4 bytes
=========     at 0x00000148 in matrix_multiply(float*, float*, float*, int)
=========     by thread (32,0,0) in block (7,3,0)
=========     Address 0x7f1234567890 is out of bounds
=========     Saved host backtrace up to driver entry point at kernel launch time
=========     Host Frame: /usr/lib/libcuda.so (cuLaunchKernel + 0x2c5)
=========     Host Frame: ./my_cuda_app (main + 0x234) [main.cu:87]
=========
========= ERROR SUMMARY: 1 error
```

**Example racecheck output:**

```
========= COMPUTE-SANITIZER
========= Error: Race condition detected between:
=========   Write by thread (4,0,0) in block (0,0,0) at 0x000000a8
=========     in shared_mem_kernel(float*, float*, int)
=========   and
=========   Read by thread (12,0,0) in block (0,0,0) at 0x000000b4
=========     in shared_mem_kernel(float*, float*, int)
=========   on shared memory address 0x00000010
=========   Missing __syncthreads() between write and read
=========
========= ERROR SUMMARY: 1 error
```

### cuda-gdb: GPU Debugger

```bash
# Compile with debug flags
nvcc -g -G -o my_app_debug my_app.cu
# -g: host debug info
# -G: device debug info (disables optimizations, significant slowdown)

# Launch cuda-gdb
cuda-gdb ./my_app_debug

# Basic commands inside cuda-gdb:
(cuda-gdb) break matrix_multiply        # Breakpoint on kernel
(cuda-gdb) run                           # Start execution
(cuda-gdb) cuda thread                   # Show current CUDA thread
(cuda-gdb) cuda block                    # Show current CUDA block
(cuda-gdb) cuda kernel                   # Show current kernel

# Switch between GPU threads
(cuda-gdb) cuda thread (0,0,0)           # Switch to thread (0,0,0)
(cuda-gdb) cuda block (3,0,0)            # Switch to block (3,0,0)

# Inspect variables
(cuda-gdb) print threadIdx.x             # Print thread index
(cuda-gdb) print shared_data[threadIdx.x]  # Print shared memory value
(cuda-gdb) print @global float *ptr      # Inspect global memory

# Examine all threads in a warp
(cuda-gdb) info cuda threads             # List all active CUDA threads
(cuda-gdb) info cuda lanes               # Show lanes (threads) in current warp

# Conditional breakpoints
(cuda-gdb) break my_kernel if threadIdx.x == 31 && blockIdx.x == 0

# Watch for a value change in a specific thread
(cuda-gdb) cuda thread (5,0,0) block (0,0,0)
(cuda-gdb) watch shared_mem[5]

# Step through device code
(cuda-gdb) next                          # Step over
(cuda-gdb) step                          # Step into
(cuda-gdb) continue                      # Continue execution
```

### printf Debugging in CUDA Kernels

Sometimes the simplest approach works. CUDA supports `printf` in device code (Compute Capability 2.0+):

```cpp
__global__ void debug_kernel(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    // Only print from specific threads to avoid overwhelming output
    if (idx == 0 || idx == 255 || idx == n - 1) {
        printf("Thread %d: data[%d] = %f\n", idx, idx, data[idx]);
    }

    // Print only when something unexpected happens
    if (isnan(data[idx]) || isinf(data[idx])) {
        printf("ERROR: Thread %d has NaN/Inf at index %d, "
               "block=(%d,%d,%d), thread=(%d,%d,%d)\n",
               idx, idx,
               blockIdx.x, blockIdx.y, blockIdx.z,
               threadIdx.x, threadIdx.y, threadIdx.z);
    }
}
```

**Important printf limitations:**

- Output buffer is limited (default 1 MB). Set it larger if needed:
  ```cpp
  cudaDeviceSetLimit(cudaLimitPrintfFifoSize, 10 * 1024 * 1024); // 10 MB
  ```
- Printf is serialized, so it massively changes timing behavior.
- Output appears only after kernel completion or `cudaDeviceSynchronize()`.
- Do NOT leave printf in production code.

### Debugging Race Conditions

Race conditions in CUDA are subtle because they may only manifest on certain hardware or under certain occupancy conditions.

**Common patterns that cause races:**

```cpp
// RACE CONDITION 1: Missing __syncthreads()
__global__ void bad_kernel(float* data) {
    __shared__ float tile[256];

    tile[threadIdx.x] = data[threadIdx.x];
    // BUG: Missing __syncthreads() here!
    float val = tile[255 - threadIdx.x];  // May read stale data
}

// FIXED:
__global__ void good_kernel(float* data) {
    __shared__ float tile[256];

    tile[threadIdx.x] = data[threadIdx.x];
    __syncthreads();  // Ensure all writes complete before reads
    float val = tile[255 - threadIdx.x];
}
```

```cpp
// RACE CONDITION 2: Non-atomic read-modify-write to global memory
__global__ void bad_histogram(int* hist, int* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        int bin = data[idx];
        hist[bin] += 1;  // BUG: multiple threads read, increment, write
    }
}

// FIXED:
__global__ void good_histogram(int* hist, int* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        int bin = data[idx];
        atomicAdd(&hist[bin], 1);
    }
}
```

```cpp
// RACE CONDITION 3: Divergent __syncthreads()
__global__ void bad_sync(float* data) {
    __shared__ float s[256];

    if (threadIdx.x < 128) {
        s[threadIdx.x] = data[threadIdx.x];
        __syncthreads();  // BUG: only half the warp reaches this
    }
    // Undefined behavior: some threads in the warp hit the barrier, others skip
}

// FIXED: All threads must reach __syncthreads()
__global__ void good_sync(float* data) {
    __shared__ float s[256];

    if (threadIdx.x < 128) {
        s[threadIdx.x] = data[threadIdx.x];
    }
    __syncthreads();  // All threads in the block reach this

    // Now safe to read from s[]
}
```

### Debugging Workflow for CUDA

```
+-----------------------------------------------------------------------+
|  CUDA DEBUGGING DECISION TREE                                         |
+-----------------------------------------------------------------------+
|                                                                       |
|  Kernel produces wrong results?                                       |
|  |                                                                    |
|  +-- Run compute-sanitizer --tool memcheck                            |
|  |   |-- Out-of-bounds? --> Fix indexing math                        |
|  |   |-- No errors? --> Continue below                               |
|  |                                                                    |
|  +-- Run compute-sanitizer --tool racecheck                           |
|  |   |-- Race detected? --> Add __syncthreads() or atomics           |
|  |   |-- No races? --> Continue below                                |
|  |                                                                    |
|  +-- Run compute-sanitizer --tool initcheck                           |
|  |   |-- Uninitialized read? --> Initialize shared/local memory      |
|  |   |-- No errors? --> Continue below                               |
|  |                                                                    |
|  +-- Add printf to specific threads (0, last, boundary cases)         |
|  |   |-- Trace the logic manually for those threads                  |
|  |   |-- Check boundary conditions: last thread in block, etc.       |
|  |                                                                    |
|  +-- Reduce problem to 1 block, 1 warp (32 threads)                  |
|  |   |-- If bug disappears --> race condition or occupancy-dependent |
|  |   |-- If bug persists --> algorithmic error                       |
|  |                                                                    |
|  +-- Compare CPU reference implementation                             |
|      |-- Run kernel on tiny input, compare every element              |
|      |-- Binary search for the first diverging element                |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## 9. Roofline Model in Practice

The roofline model is the single most important conceptual framework for understanding whether a kernel is limited by compute or memory bandwidth, and how much room for improvement exists.

### The Core Idea

```
+-----------------------------------------------------------------------+
|  THE ROOFLINE MODEL                                                   |
+-----------------------------------------------------------------------+
|                                                                       |
|  Performance is limited by either:                                    |
|  1. Peak compute throughput (GFLOP/s)                                |
|  2. Peak memory bandwidth (GB/s) * arithmetic intensity (FLOP/byte)  |
|                                                                       |
|  Attainable Performance = min(Peak_Compute,                          |
|                               Peak_Bandwidth * AI)                    |
|                                                                       |
|  Where AI = Arithmetic Intensity = FLOP / Bytes_transferred          |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Constructing a Roofline Chart

#### Step 1: Determine Hardware Ceilings

```
Example: NVIDIA A100 (SXM4, 80GB)

Peak FP32 Compute:    19,500 GFLOP/s (19.5 TFLOP/s)
Peak FP16 Compute:   312,000 GFLOP/s (312 TFLOP/s, with Tensor Cores)
Peak FP64 Compute:     9,700 GFLOP/s (9.7 TFLOP/s)
HBM2e Bandwidth:       2,039 GB/s

Ridge Point (FP32) = Peak_Compute / Peak_Bandwidth
                   = 19,500 / 2,039
                   = 9.56 FLOP/byte

This means:
  - Kernels with AI < 9.56 are memory-bound
  - Kernels with AI > 9.56 are compute-bound
```

#### Step 2: Plot the Roofline

```
Performance    |
(GFLOP/s)     |
              |                         =================== 19,500 GFLOP/s
 10,000  --   |                    ====                     (FP32 peak)
              |                ===
              |            ===
  1,000  --   |         ==          Ridge point: AI = 9.56
              |      ==
              |    ==
    100  --   |  ==
              | =
              |=     Memory BW ceiling
     10  --   |      (slope = 2,039 GB/s)
              |
              +------+-------+--------+--------+--------->
              0.01   0.1      1        10       100
                     Arithmetic Intensity (FLOP/byte)
```

#### Step 3: Measure Your Kernel

To place a kernel on the roofline, you need two measurements:

1. **FLOP count**: Total floating-point operations performed
2. **Bytes transferred**: Total bytes read from and written to DRAM

```bash
# Measure with ncu
ncu --metrics \
    smsp__sass_thread_inst_executed_op_fadd_pred_on.sum,\
    smsp__sass_thread_inst_executed_op_fmul_pred_on.sum,\
    smsp__sass_thread_inst_executed_op_ffma_pred_on.sum,\
    dram__bytes_read.sum,\
    dram__bytes_write.sum \
    ./my_cuda_app
```

**Computing FLOP count from metrics:**

```
FLOP = fadd_count + fmul_count + 2 * ffma_count
(FMA counts as 2 FLOP: one multiply + one add)
```

**Computing arithmetic intensity:**

```
AI = FLOP / (dram_bytes_read + dram_bytes_write)
```

#### Step 4: Analyze the Result

```
+-----------------------------------------------------------------------+
|  ROOFLINE INTERPRETATION                                              |
+-----------------------------------------------------------------------+
|                                                                       |
|  CASE 1: Kernel is far below the memory bandwidth ceiling             |
|    Diagnosis: Memory access pattern is inefficient                    |
|    Actions:                                                           |
|      - Check for uncoalesced global memory accesses                  |
|      - Use shared memory tiling                                      |
|      - Improve data reuse                                            |
|      - Check for L2 cache thrashing                                  |
|                                                                       |
|  CASE 2: Kernel is on the memory bandwidth ceiling                    |
|    Diagnosis: Memory-bound, achieving good bandwidth utilization      |
|    Actions:                                                           |
|      - Increase arithmetic intensity (more compute per byte loaded)  |
|      - Use mixed precision to halve memory traffic                   |
|      - Kernel fusion to avoid round-trips through DRAM               |
|      - Accept current performance as near-optimal for this algorithm |
|                                                                       |
|  CASE 3: Kernel is far below the compute ceiling                      |
|    Diagnosis: Compute-inefficient or latency-bound                   |
|    Actions:                                                           |
|      - Increase occupancy                                            |
|      - Reduce instruction-level dependencies (ILP)                   |
|      - Use vectorized loads/stores                                   |
|      - Check for warp divergence                                     |
|                                                                       |
|  CASE 4: Kernel is on the compute ceiling                             |
|    Diagnosis: Compute-bound, achieving good utilization              |
|    Actions:                                                           |
|      - Use Tensor Cores for matrix operations                        |
|      - Use reduced precision (FP16, INT8)                            |
|      - Algorithmic optimization to reduce total FLOP                 |
|      - Accept current performance as near-optimal                    |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Empirical Roofline Toolkit (ERT)

The ERT measures actual achievable bandwidth and compute throughput on your specific hardware, accounting for caching effects:

```bash
# Install ERT
git clone https://bitbucket.org/berkeleylab/cs-roofline-toolkit.git
cd cs-roofline-toolkit/Empirical_Roofline_Tool-1.1.0

# Configure for your GPU
# Edit Config/config.gpu for your CUDA installation

# Run the benchmark
python3 ert --config Config/config.gpu

# Output: measured roofline parameters for your specific GPU
# This gives you L1, L2, and DRAM ceilings
```

### Hierarchical Roofline

The basic roofline uses DRAM bandwidth, but a more detailed model includes caches:

```
Performance    |
(GFLOP/s)     |
              |                         =================== Peak Compute
 10,000  --   |                    ====
              |                ===
              |            ===
  1,000  --   |     ======            L1 cache BW ceiling
              |   ==                  (much steeper slope)
              | ==
    100  --   |=     ====             L2 cache BW ceiling
              |   ==                  (steeper than DRAM)
              | ==
     10  --   |=                      DRAM BW ceiling
              |                       (shallowest slope)
              +------+-------+--------+--------+-------->
              0.01   0.1      1        10       100
                     Arithmetic Intensity (FLOP/byte)

Key insight: A kernel may be memory-bound at the DRAM level but could
be improved by better cache utilization to operate at the L2 or L1
bandwidth ceiling.
```

### Worked Example: Matrix Multiply Roofline

```
Matrix multiply: C[M,N] = A[M,K] * B[K,N]

Naive implementation:
  FLOP = 2 * M * N * K    (one multiply + one add per output element per K)
  Bytes = 4 * (M*K + K*N + M*N)   (read A, read B, write C, float32)

For M=N=K=4096:
  FLOP = 2 * 4096^3 = 137,438,953,472
  Bytes = 4 * (3 * 4096^2) = 201,326,592

  AI = 137,438,953,472 / 201,326,592 = 682.7 FLOP/byte

This is FAR above the ridge point (9.56 for A100). Matrix multiply is
inherently compute-bound for large matrices. This is why it benefits
enormously from Tensor Cores.

But a NAIVE implementation may still be memory-bound because it re-reads
data from DRAM due to poor cache utilization. The tiled implementation
(using shared memory) achieves the high AI by reusing data in cache.
```

---

## 10. Optimization Case Studies

### Case Study A: Memory-Bound Kernel --- Vector Scaling

**Problem**: Scaling a large vector `y[i] = alpha * x[i]` is surprisingly slow.

**Step 1: Profile with Nsight Systems**

```bash
nsys profile -o vecscale ./vector_scale
nsys stats --report cuda_gpu_kern_sum vecscale.nsys-rep
```

```
 Time(%)  Total Time  Instances  Avg         Name
 100.0%   1.234 ms    1          1.234 ms    vector_scale_kernel
```

Only one kernel, so all time is in the kernel. Let's go deeper.

**Step 2: Profile with Nsight Compute**

```bash
ncu --set full -o vecscale_detail ./vector_scale
```

```
Speed of Light:
  Compute Throughput:    8.2%   of peak
  Memory Throughput:    42.3%   of peak

Memory Workload:
  Global Load Transactions:
    Requested:  1,048,576 sectors
    Executed:   4,194,304 sectors     <-- 4x over-fetch!
  Global Load Efficiency: 25%

Warp Stall Reasons:
  stall_long_scoreboard:  68.4%       <-- Waiting for memory
```

**Analysis**: Memory throughput is only 42% of peak, and global load efficiency is 25%. This means every load fetches 128 bytes but only uses 32 bytes. The access pattern is strided or uncoalesced.

**Step 3: Examine the code**

```cpp
// PROBLEMATIC: Struct-of-Arrays stored as Array-of-Structs
struct Particle {
    float x, y, z, w;  // 16 bytes per particle
};

__global__ void scale_x(Particle* particles, float alpha, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        particles[idx].x *= alpha;  // Stride-4 access (every 16 bytes)
    }
}
```

Thread 0 reads `particles[0].x` at byte 0, thread 1 reads `particles[1].x` at byte 16, thread 2 reads `particles[2].x` at byte 32, etc. This creates a stride-4 access pattern across a 128-byte cache line, wasting 75% of bandwidth.

**Step 4: Fix --- Use Structure of Arrays**

```cpp
struct ParticlesSoA {
    float* x;
    float* y;
    float* z;
    float* w;
};

__global__ void scale_x(float* x, float alpha, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        x[idx] *= alpha;  // Perfectly coalesced: consecutive threads
                           // access consecutive memory addresses
    }
}
```

**Step 5: Re-profile**

```
Speed of Light (after fix):
  Compute Throughput:    6.1%   of peak
  Memory Throughput:    91.7%   of peak    <-- Up from 42.3%

Global Load Efficiency: 100%               <-- Up from 25%
Kernel time: 0.318 ms                      <-- Down from 1.234 ms (3.9x faster)
```

The kernel is now truly memory-bound (91.7% bandwidth utilization), and there is little room for further improvement since vector scaling has an arithmetic intensity of 0.25 FLOP/byte (one multiply, 8 bytes read+write).

---

### Case Study B: Compute-Bound Kernel --- Mandelbrot Set

**Problem**: A Mandelbrot set kernel is slow despite good memory access patterns.

**Step 1: Profile with Nsight Compute**

```bash
ncu --set full -o mandelbrot_detail ./mandelbrot
```

```
Speed of Light:
  Compute Throughput:   78.4%   of peak
  Memory Throughput:    12.1%   of peak

Occupancy:
  Achieved:      31.2%
  Theoretical:   50.0%  (limited by registers)
  Registers per thread: 64

Warp Stall Reasons:
  stall_short_scoreboard:   38.2%   <-- Math pipeline dependency
  stall_not_selected:       28.4%   <-- Low occupancy
  stall_long_scoreboard:     8.1%
```

**Analysis**: The kernel is compute-bound (78.4% compute vs 12.1% memory). Occupancy is only 31.2% because each thread uses 64 registers (limiting blocks per SM). Low occupancy means fewer warps available to hide latency, so 28.4% of stalls are due to no eligible warps.

**Step 2: Examine the code**

```cpp
__global__ void mandelbrot(int* output, int width, int height,
                           float x_min, float x_max,
                           float y_min, float y_max, int max_iter) {
    int px = blockIdx.x * blockDim.x + threadIdx.x;
    int py = blockIdx.y * blockDim.y + threadIdx.y;

    if (px >= width || py >= height) return;

    float cx = x_min + (x_max - x_min) * px / width;
    float cy = y_min + (y_max - y_min) * py / height;
    float zx = 0.0f, zy = 0.0f;
    int iter = 0;

    // Many local variables --> high register usage
    float zx2, zy2, zx_new;

    while (iter < max_iter) {
        zx2 = zx * zx;
        zy2 = zy * zy;
        if (zx2 + zy2 > 4.0f) break;
        zx_new = zx2 - zy2 + cx;
        zy = 2.0f * zx * zy + cy;
        zx = zx_new;
        iter++;
    }

    output[py * width + px] = iter;
}
```

**Step 3: Fix --- Limit registers and increase occupancy**

```cpp
// Limit to 32 registers per thread, allowing more blocks per SM
__global__ __launch_bounds__(256, 4)  // 256 threads/block, min 4 blocks/SM
void mandelbrot_optimized(int* output, int width, int height,
                          float x_min, float x_max,
                          float y_min, float y_max, int max_iter) {
    int px = blockIdx.x * blockDim.x + threadIdx.x;
    int py = blockIdx.y * blockDim.y + threadIdx.y;

    if (px >= width || py >= height) return;

    float cx = x_min + (x_max - x_min) * px / width;
    float cy = y_min + (y_max - y_min) * py / height;
    float zx = 0.0f, zy = 0.0f;
    int iter = 0;

    // Compiler now has register budget to optimize within
    while (iter < max_iter && (zx * zx + zy * zy) <= 4.0f) {
        float temp = zx * zx - zy * zy + cx;
        zy = 2.0f * zx * zy + cy;
        zx = temp;
        iter++;
    }

    output[py * width + px] = iter;
}
```

**Step 4: Re-profile**

```
Speed of Light (after fix):
  Compute Throughput:   89.1%   of peak    <-- Up from 78.4%
  Memory Throughput:    11.8%   of peak

Occupancy:
  Achieved:      62.5%                     <-- Up from 31.2%
  Registers per thread: 32                 <-- Down from 64

Kernel time: 2.1 ms                        <-- Down from 3.4 ms (1.6x faster)
```

The kernel is now closer to the compute ceiling. Further optimization would require algorithmic changes (e.g., perturbation theory, period detection) or using FP16 on hardware that supports it.

---

### Case Study C: Latency-Bound Application --- Iterative Solver

**Problem**: A Jacobi iterative solver launches thousands of small kernels. Total GPU time is high but GPU utilization is low.

**Step 1: Profile with Nsight Systems**

```bash
nsys profile -o jacobi ./jacobi_solver
nsys stats --report cuda_gpu_kern_sum jacobi.nsys-rep
```

```
 Time(%)  Total Time    Instances  Avg         Name
  62.1%   124.2 ms      10,000    12.4 us     jacobi_step_kernel
  21.3%    42.6 ms      10,000     4.3 us     residual_kernel
  16.6%    33.2 ms      10,000     3.3 us     [CUDA memcpy DtoH]

GPU Utilization: 31.2%
```

**Analysis**: The Nsight Systems timeline shows a pattern of tiny kernel launches separated by gaps:

```
CPU:   |launch| |sync| |check| |launch| |sync| |check| ...
GPU:   |=====|           |=====|           |=====|
       ^^   ^^           ^^   ^^
       12us kernel       12us kernel
            ~30us gap         ~30us gap

Each iteration:
  Kernel:     12.4 us
  Launch overhead + sync + host logic: ~30 us
  Effective GPU utilization: 12.4 / 42.4 = 29.2%
```

The GPU is idle 70% of the time, waiting for the CPU to launch the next kernel.

**Step 2: Fix --- Use CUDA Graphs**

```cpp
// Before: Launch-per-iteration (high overhead)
for (int iter = 0; iter < max_iter; iter++) {
    jacobi_step<<<grid, block>>>(d_new, d_old, n);
    cudaMemcpy(&residual, d_residual, sizeof(float), cudaMemcpyDeviceToHost);
    if (residual < tolerance) break;
    std::swap(d_new, d_old);
}

// After: CUDA Graph captures the iteration pattern
cudaGraph_t graph;
cudaGraphExec_t graphExec;

// Capture a batch of iterations
cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);
for (int i = 0; i < BATCH_SIZE; i++) {
    jacobi_step<<<grid, block, 0, stream>>>(d_new, d_old, n);
    residual_kernel<<<grid2, block2, 0, stream>>>(d_residual, d_new, d_old, n);
    std::swap(d_new, d_old);
}
cudaStreamEndCapture(stream, &graph);
cudaGraphInstantiate(&graphExec, graph, nullptr, nullptr, 0);

// Execute the graph repeatedly
for (int batch = 0; batch < max_iter / BATCH_SIZE; batch++) {
    cudaGraphLaunch(graphExec, stream);
    cudaStreamSynchronize(stream);

    // Check convergence every BATCH_SIZE iterations
    cudaMemcpy(&residual, d_residual, sizeof(float), cudaMemcpyDeviceToHost);
    if (residual < tolerance) break;
}
```

**Alternative fix --- Use persistent kernel:**

```cpp
__global__ void jacobi_persistent(float* data, float* residual,
                                   int n, int max_iter, float tolerance) {
    // Each block handles a portion of the grid
    // Kernel stays alive for all iterations
    for (int iter = 0; iter < max_iter; iter++) {
        // Compute Jacobi step for this block's portion
        jacobi_step_local(data, n);

        // Grid-level synchronization (cooperative groups)
        cooperative_groups::this_grid().sync();

        // Check convergence (one thread computes residual)
        if (threadIdx.x == 0 && blockIdx.x == 0) {
            // Simplified: actual implementation uses parallel reduction
            *residual = compute_residual(data, n);
        }
        cooperative_groups::this_grid().sync();

        if (*residual < tolerance) break;
    }
}

// Launch with cooperative launch API
void* args[] = {&d_data, &d_residual, &n, &max_iter, &tolerance};
cudaLaunchCooperativeKernel((void*)jacobi_persistent,
                            grid, block, args, shared_mem, stream);
```

**Step 3: Re-profile**

```
After CUDA Graph optimization:

GPU Utilization: 87.3%    <-- Up from 31.2%
Total time:      68 ms    <-- Down from 200 ms (2.9x faster)

The timeline now shows densely packed kernels with minimal gaps:
GPU: |==|==|==|==|==|==|==|==|==|==|==|==|==|==|==|==|
     Nearly continuous execution within each graph launch
```

---

## 11. Flame Graphs

Flame graphs are a visualization technique for profiling data, invented by Brendan Gregg. They provide an intuitive way to see which code paths consume the most resources.

### Anatomy of a Flame Graph

```
+-----------------------------------------------------------------------+
|  HOW TO READ A FLAME GRAPH                                            |
+-----------------------------------------------------------------------+
|                                                                       |
|  +===============================================================+   |
|  |                         main()                                 |   |
|  +==========================+====================================+   |
|  |     process_data()       |          train_model()              |   |
|  +==========+===============+=========+=============+============+   |
|  | parse()  | compute()     | forward()| backward() | update()   |   |
|  +==========+====+==========+===+======+==+=====+===+============+   |
|  |          |sort | gemm()  |fft|      |  |gemm |                |   |
|  |          +====+==========+===+      +==+=====+                |   |
|                                                                       |
|  READING RULES:                                                       |
|                                                                       |
|  1. The X-AXIS is NOT time. It is the total number of samples         |
|     (proportional to CPU time). Wider = more time spent.              |
|                                                                       |
|  2. The Y-AXIS is stack depth. Bottom = entry point (main),           |
|     top = leaf functions (where CPU actually spends time).            |
|                                                                       |
|  3. COLOR is arbitrary (often random) or can encode a category         |
|     (user code vs. kernel, language runtime, etc.)                    |
|                                                                       |
|  4. LEFT-TO-RIGHT order is alphabetical (not chronological).          |
|                                                                       |
|  5. LOOK FOR WIDE TOWERS: A wide box at the top means that            |
|     function is a hotspot (lots of samples directly in it).           |
|                                                                       |
|  6. LOOK FOR WIDE PLATEAUS: A function that is wide but has           |
|     children means it is on the call path to many hotspots.           |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Generating CPU Flame Graphs

```bash
# Prerequisites: Install Brendan Gregg's FlameGraph tools
git clone https://github.com/brendangregg/FlameGraph.git

# Step 1: Record with perf
perf record -F 99 -g --call-graph dwarf ./my_app

# Step 2: Convert perf data to folded stacks
perf script | ./FlameGraph/stackcollapse-perf.pl > out.folded

# Step 3: Generate the SVG
./FlameGraph/flamegraph.pl out.folded > flamegraph.svg

# Open in a browser (SVGs are interactive: click to zoom)
open flamegraph.svg   # macOS
xdg-open flamegraph.svg   # Linux
```

**Advanced flame graph options:**

```bash
# Filter to specific functions
grep 'matrix_multiply' out.folded | \
    ./FlameGraph/flamegraph.pl > matrix_flame.svg

# Differential flame graph (compare before/after)
# Red = regression (slower), blue = improvement (faster)
./FlameGraph/difffolded.pl out_before.folded out_after.folded | \
    ./FlameGraph/flamegraph.pl > diff_flame.svg

# Inverted flame graph (icicle graph) -- callers on top
./FlameGraph/flamegraph.pl --inverted out.folded > icicle.svg

# With custom title and width
./FlameGraph/flamegraph.pl \
    --title "My Application CPU Profile" \
    --width 1800 \
    --minwidth 0.5 \
    out.folded > flamegraph.svg
```

### GPU Flame Graphs with Nsight Systems

Nsight Systems provides a timeline view, but you can also export data for flame-graph-style visualization:

```bash
# Export Nsight Systems data to SQLite
nsys export --type=sqlite my_report.nsys-rep

# Query kernel call stacks from the SQLite database
sqlite3 my_report.sqlite \
    "SELECT DISTINCT(demangledName), sum(end-start) as total_ns
     FROM CUPTI_ACTIVITY_KIND_KERNEL
     GROUP BY demangledName
     ORDER BY total_ns DESC;"

# For GPU-aware flame graphs, use NVTX annotations which appear
# as nested ranges in the Nsight Systems timeline (effectively
# serving as a flame graph when viewed horizontally)
```

### Common Flame Graph Patterns

```
+-----------------------------------------------------------------------+
|  PATTERN 1: SINGLE HOT FUNCTION (one wide tower)                     |
+-----------------------------------------------------------------------+
|                                                                       |
|  +==============================================================+    |
|  |                          main()                               |    |
|  +==============+==============================================+    |
|  | init()       |                process()                      |    |
|  +==============+===+==========================================+    |
|                 |   |              hot_function()                |    |
|                 +===+==========================================+    |
|                                                                       |
|  Diagnosis: Single function dominates. Optimize THAT function.       |
|             Check if it is memory-bound, compute-bound, etc.         |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  PATTERN 2: FLAT PROFILE (many small towers, no dominant hotspot)     |
+-----------------------------------------------------------------------+
|                                                                       |
|  +==============================================================+    |
|  |                          main()                               |    |
|  +=======+=======+=======+=======+=======+=======+==============+    |
|  | func1 | func2 | func3 | func4 | func5 | func6|    ...       |    |
|  +=======+=======+=======+=======+=======+=======+==============+    |
|                                                                       |
|  Diagnosis: No single bottleneck. Either the application is well     |
|  balanced (good) or you need algorithmic-level optimization.         |
|  Consider: is this the right algorithm for the problem?              |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  PATTERN 3: DEEP NARROW TOWER (excessive recursion or abstraction)    |
+-----------------------------------------------------------------------+
|                                                                       |
|  +==============================================================+    |
|  |                          main()                               |    |
|  +=========+====================================================+    |
|  | handler |                                                     |    |
|  +===+=====+                                                     |    |
|  |dec|                                                           |    |
|  +=+=+                                                           |    |
|  |p|                                                             |    |
|  +=+                                                             |    |
|  |f|                                                             |    |
|  +=+                                                             |    |
|                                                                       |
|  Diagnosis: Deep call chains suggest excessive abstraction, virtual  |
|  dispatch, or recursion. Consider flattening, inlining, or           |
|  converting recursion to iteration.                                  |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  PATTERN 4: WIDE PLATEAU WITH LIBRARY CODE ON TOP                    |
+-----------------------------------------------------------------------+
|                                                                       |
|  +==============================================================+    |
|  |                          main()                               |    |
|  +===================+==========================================+    |
|  |    my_function()  |                                           |    |
|  +======+============+                                           |    |
|  |malloc| memcpy     |                                           |    |
|  +======+============+                                           |    |
|                                                                       |
|  Diagnosis: Your code spends most of its time in memory              |
|  allocation (malloc) and copying (memcpy). Fix: use memory pools,    |
|  pre-allocate, avoid unnecessary copies, use move semantics.         |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  PATTERN 5: LOCK CONTENTION (threads spending time in futex/mutex)   |
+-----------------------------------------------------------------------+
|                                                                       |
|  +==============================================================+    |
|  |                       worker_thread()                         |    |
|  +========================+=====================================+    |
|  | useful_work()          |  pthread_mutex_lock()                |    |
|  |                        +=============+======================+    |
|  |                        | futex_wait  | __lll_lock_wait       |    |
|  +========================+=============+======================+    |
|                                                                       |
|  Diagnosis: Threads are blocked on locks. The right half of the      |
|  flame graph is wasted time. Fix: reduce critical section scope,     |
|  use lock-free data structures, reduce contention.                   |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Off-CPU Flame Graphs

Standard flame graphs show on-CPU time. Off-CPU flame graphs show what threads are waiting on (I/O, locks, sleep):

```bash
# Record off-CPU events (requires root or appropriate permissions)
sudo perf record -e sched:sched_switch -a -g sleep 10

# Generate off-CPU flame graph
sudo perf script | \
    ./FlameGraph/stackcollapse-perf.pl > offcpu.folded
./FlameGraph/flamegraph.pl \
    --title "Off-CPU Flame Graph" \
    --color=io \
    offcpu.folded > offcpu_flame.svg
```

### Flame Graph Tips

1. **Sample at 99 Hz** (not 100) to avoid lockstep with system timers.
2. **Use DWARF unwinding** (`--call-graph dwarf`) for accurate call stacks with optimized code.
3. **Run long enough** to collect at least 1000 samples for statistical significance.
4. **Interactive SVGs**: Click on a frame to zoom in; the search function (Ctrl+F in browser) highlights matching frames.
5. **Differential flame graphs** are powerful for regression analysis: compare before/after a change to see exactly what got slower or faster.

---

## Profiling Checklist

Use this checklist for every optimization effort:

```
+-----------------------------------------------------------------------+
|  PROFILING CHECKLIST                                                  |
+-----------------------------------------------------------------------+
|                                                                       |
|  BEFORE PROFILING:                                                    |
|  [ ] Established a reproducible baseline measurement                 |
|  [ ] Recorded hardware specs (CPU model, GPU model, memory)          |
|  [ ] Recorded software specs (OS, driver, compiler, flags)           |
|  [ ] Defined a clear performance target                              |
|  [ ] Using a representative input (not toy data)                     |
|  [ ] Running median of 5+ iterations to account for variance         |
|  [ ] Disabled frequency scaling / turbo boost for consistency        |
|  [ ] Closed unnecessary background processes                         |
|                                                                       |
|  SYSTEM-LEVEL PROFILING:                                              |
|  [ ] Ran Nsight Systems (GPU) or perf stat (CPU) first               |
|  [ ] Identified whether bottleneck is CPU, GPU, or data transfer     |
|  [ ] Identified the top 3 time-consuming functions/kernels           |
|  [ ] Checked GPU utilization percentage                              |
|  [ ] Checked for idle gaps in the GPU timeline                       |
|  [ ] Verified stream concurrency (if using multiple streams)         |
|                                                                       |
|  DETAILED PROFILING:                                                  |
|  [ ] Ran Nsight Compute (GPU kernel) or VTune/perf (CPU function)    |
|  [ ] Classified bottleneck: compute-bound vs memory-bound            |
|  [ ] Checked occupancy and its limiters (GPU)                        |
|  [ ] Checked memory coalescing / cache hit rates                     |
|  [ ] Examined warp stall reasons (GPU) or pipeline stalls (CPU)      |
|  [ ] Placed the kernel on the roofline chart                         |
|  [ ] Identified the specific cause of the bottleneck                 |
|                                                                       |
|  DURING OPTIMIZATION:                                                 |
|  [ ] Made exactly ONE change at a time                               |
|  [ ] Re-measured after each change                                   |
|  [ ] Compared against the baseline (not the previous iteration)      |
|  [ ] Reverted changes that did not improve performance               |
|  [ ] Verified correctness after each optimization                    |
|  [ ] Documented what was tried and what the result was               |
|                                                                       |
|  AFTER OPTIMIZATION:                                                  |
|  [ ] Final measurement shows improvement against the baseline        |
|  [ ] Ran correctness tests (unit tests, regression tests)            |
|  [ ] Profiled again to verify the bottleneck shifted                 |
|  [ ] Documented the final performance numbers                        |
|  [ ] Code is still readable and maintainable                         |
|  [ ] Committed both the optimization and the profiling evidence      |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Tool Selection Guide

```
+-----------------------------------------------------------------------+
|  TOOL SELECTION GUIDE                                                 |
+-----------------------------------------------------------------------+
|                                                                       |
|  "Where is time being spent in my application?"                       |
|  --> Nsight Systems (GPU)                                            |
|  --> perf stat / perf record (CPU)                                   |
|  --> VTune hotspots (CPU, Intel)                                     |
|                                                                       |
|  "Why is this GPU kernel slow?"                                       |
|  --> Nsight Compute (ncu)                                            |
|  --> ncu roofline analysis                                           |
|                                                                       |
|  "Is my kernel compute-bound or memory-bound?"                        |
|  --> Nsight Compute Speed-of-Light                                   |
|  --> Roofline chart (manual or ncu --set roofline)                   |
|                                                                       |
|  "Why is my CPU code slow?"                                           |
|  --> VTune uarch-exploration (Intel)                                 |
|  --> perf stat (IPC, cache misses, branch misses)                    |
|  --> perf annotate (instruction-level hotspots)                      |
|                                                                       |
|  "Are my cache access patterns efficient?"                            |
|  --> Cachegrind (simulation, portable, slow)                         |
|  --> perf stat with cache events (hardware counters, fast)           |
|  --> VTune memory-access analysis                                    |
|                                                                       |
|  "Do I have memory bugs in my CUDA code?"                             |
|  --> compute-sanitizer --tool memcheck                               |
|                                                                       |
|  "Do I have race conditions in my CUDA code?"                         |
|  --> compute-sanitizer --tool racecheck                              |
|                                                                       |
|  "Do I have memory bugs in my CPU code?"                              |
|  --> Valgrind memcheck                                               |
|  --> AddressSanitizer (faster: compile with -fsanitize=address)      |
|                                                                       |
|  "Do I have threading bugs in my CPU code?"                           |
|  --> ThreadSanitizer (-fsanitize=thread)                             |
|  --> VTune threading analysis                                        |
|  --> Helgrind (Valgrind)                                             |
|                                                                       |
|  "I want a visual overview of where time is spent."                   |
|  --> Flame graph (from perf data)                                    |
|  --> Nsight Systems timeline (GPU)                                   |
|  --> VTune GUI (CPU)                                                 |
|                                                                       |
|  "I want to compare before/after optimization."                       |
|  --> Differential flame graph                                        |
|  --> ncu --diff (GPU kernels)                                        |
|  --> perf stat side-by-side comparison                               |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  TOOL COMPARISON MATRIX                                               |
+-----------------------------------------------------------------------+
|                                                                       |
|  Tool              | Target | Overhead  | Detail    | Cost           |
|  ------------------+--------+-----------+-----------+----------      |
|  Nsight Systems    | GPU+CPU| Low (<5%) | System    | Free           |
|  Nsight Compute    | GPU    | High*     | Kernel    | Free           |
|  ncu (CLI)         | GPU    | High*     | Kernel    | Free           |
|  nvprof            | GPU    | Medium    | Kernel    | Free (legacy)  |
|  perf              | CPU    | Very low  | Function+ | Free (Linux)   |
|  VTune             | CPU    | Low       | uArch     | Free           |
|  Valgrind/memcheck | CPU    | 10-50x    | Byte-level| Free           |
|  Cachegrind        | CPU    | 20-100x   | Cache sim | Free           |
|  compute-sanitizer | GPU    | 2-10x     | Memory    | Free           |
|  cuda-gdb          | GPU    | Requires  | Instruction| Free          |
|                    |        | -G flag   |           |                |
|  AddressSanitizer  | CPU    | 2x        | Byte-level| Free (compiler)|
|  ThreadSanitizer   | CPU    | 5-15x     | Race cond.| Free (compiler)|
|                                                                       |
|  * Nsight Compute replays kernels to collect metrics,                |
|    so wall-clock time is much longer than normal execution.          |
|                                                                       |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  RECOMMENDED WORKFLOW BY SCENARIO                                     |
+-----------------------------------------------------------------------+
|                                                                       |
|  SCENARIO: "My CUDA application is slow"                              |
|                                                                       |
|    1. nsys profile ./app              (system-level overview)         |
|    2. Identify top kernel             (from nsys stats)              |
|    3. ncu --set full ./app            (kernel-level detail)          |
|    4. Classify: compute or memory     (speed-of-light)              |
|    5. Fix, measure, iterate                                          |
|                                                                       |
|  SCENARIO: "My CPU application is slow"                               |
|                                                                       |
|    1. perf stat ./app                 (overall health check)         |
|    2. perf record -g ./app            (sampling profile)             |
|    3. Generate flame graph            (visual overview)              |
|    4. perf annotate hot_function      (instruction-level)            |
|    5. Fix, measure, iterate                                          |
|                                                                       |
|  SCENARIO: "My application crashes or produces wrong results"         |
|                                                                       |
|    GPU: compute-sanitizer --tool memcheck ./app                      |
|    GPU: compute-sanitizer --tool racecheck ./app                     |
|    CPU: valgrind --tool=memcheck ./app                               |
|    CPU: compile with -fsanitize=address ./app                        |
|                                                                       |
|  SCENARIO: "My multi-threaded CPU app does not scale"                 |
|                                                                       |
|    1. VTune threading analysis         (or perf + off-CPU flame)     |
|    2. Identify contention points       (locks, load imbalance)       |
|    3. Reduce critical section scope                                  |
|    4. Consider lock-free alternatives                                |
|    5. Verify with perf stat across thread counts                     |
|                                                                       |
|  SCENARIO: "I need to optimize for a specific CPU microarchitecture"  |
|                                                                       |
|    1. VTune uarch-exploration          (Intel)                       |
|    2. Identify pipeline bottleneck     (front-end? back-end?)        |
|    3. perf stat with raw PMU events    (specific counters)           |
|    4. Consider SIMD, loop unrolling, data layout changes             |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Summary

Performance profiling is not optional. It is the foundation of all effective optimization work. The tools covered in this chapter form a comprehensive toolkit:

```
+-----------------------------------------------------------------------+
|  THE PROFILING PYRAMID                                                |
+-----------------------------------------------------------------------+
|                                                                       |
|                        /\                                             |
|                       /  \        Source-level analysis               |
|                      / ncu \      (SASS correlation, perf annotate)   |
|                     /________\                                        |
|                    /          \    Kernel / function profiling         |
|                   / Nsight     \   (Nsight Compute, VTune uarch)      |
|                  / Compute,     \                                     |
|                 / VTune, perf    \                                    |
|                /________________  \                                   |
|               /                    \  System-level profiling          |
|              / Nsight Systems,      \ (timeline, utilization, I/O)    |
|             / perf stat, top, htop   \                                |
|            /__________________________\                               |
|           /                            \  Correctness checking        |
|          / compute-sanitizer, Valgrind, \ (memory, races, undefined)  |
|         / AddressSanitizer, ThreadSan    \                            |
|        /_________________________________ \                           |
|                                                                       |
|  START AT THE BOTTOM. Work your way up only as needed.               |
|  Most performance problems are visible at the system level.          |
|  Only dive deeper when you need to understand WHY something is slow. |
|                                                                       |
+-----------------------------------------------------------------------+
```

The key principles to carry forward:

1. **Always profile before optimizing.** Your intuition about bottlenecks is almost certainly wrong.
2. **Start with the system-level view.** Nsight Systems or `perf stat` first, always.
3. **Classify the bottleneck.** Compute-bound, memory-bound, or latency-bound requires completely different fixes.
4. **One change at a time.** Never make multiple optimizations without measuring between them.
5. **Use the roofline model** to understand how close you are to the hardware limits and whether further optimization is possible.
6. **Automate your benchmarking.** Create scripts that run your benchmarks, record metrics, and detect regressions automatically.
7. **Profile in production-like conditions.** Micro-benchmarks lie. Use real inputs, real data sizes, and real concurrency levels.

The next chapter covers FPGA and custom hardware, where profiling becomes even more critical because hardware iteration cycles are measured in hours, not seconds.
