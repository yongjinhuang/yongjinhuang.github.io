# Chapter 1: Computer Architecture -- How CPUs Actually Work

Every line of code you write eventually becomes a sequence of electrical signals racing through
billions of transistors etched onto a sliver of silicon. Before you can write fast code -- code
that squeezes every ounce of performance from modern hardware -- you need to understand what
happens between pressing "Enter" and seeing a result on screen. This chapter builds that
understanding from the ground up.

We assume zero prior knowledge of hardware. By the end, you will understand the execution model
of a modern CPU well enough to reason about why one piece of code runs 100x faster than another
that produces the identical output.

---

## 1. Von Neumann Architecture

### 1.1 The Big Idea

In 1945, John von Neumann described a computer architecture where **instructions and data share
the same memory**. This single idea shapes virtually every general-purpose computer built since.
Before von Neumann, computers like ENIAC were "programmed" by physically rewiring cables. The
stored-program concept meant you could change what the computer does simply by changing what is
in memory.

A von Neumann machine has four core components:

```
+================================================================+
|                     VON NEUMANN ARCHITECTURE                    |
+================================================================+
|                                                                 |
|                   +---------------------------+                 |
|                   |      CONTROL UNIT (CU)     |                |
|                   |                             |                |
|                   | - Fetches instructions      |                |
|                   | - Decodes opcodes           |                |
|                   | - Sequences execution        |                |
|                   | - Manages pipeline           |                |
|                   +------------+----------------+                |
|                                |                                 |
|                   +------------v----------------+                |
|                   |   ARITHMETIC LOGIC UNIT      |                |
|                   |          (ALU)               |                |
|                   |                             |                |
|                   | - Integer add/sub/mul/div   |                |
|                   | - Bitwise AND/OR/XOR/NOT    |                |
|                   | - Comparisons (==, <, >)    |                |
|                   | - Floating-point math (FPU) |                |
|                   +------------+----------------+                |
|                                |                                 |
|         +----------+     +----v-----+     +----------+          |
|         |          |     |          |     |          |          |
|         | REGISTER |<--->| DATA BUS |<--->|  MEMORY  |          |
|         |   FILE   |     |          |     |  (RAM)   |          |
|         |          |     +----+-----+     |          |          |
|         | R0..R15  |          |           | Instruc- |          |
|         | SP, PC   |     +----+-----+     | tions &  |          |
|         | FLAGS    |     | ADDRESS  |     | Data     |          |
|         |          |     |   BUS    |     | live     |          |
|         +----------+     +----------+     | together |          |
|                                           +----------+          |
|                                                                 |
|    +------------------------------------------------------+     |
|    |                    I/O SUBSYSTEM                      |     |
|    |   Keyboard, Display, Disk, Network, GPU, USB, ...    |     |
|    +------------------------------------------------------+     |
|                                                                 |
+================================================================+
```

### 1.2 Component-by-Component Breakdown

**Control Unit (CU):**
The "conductor" of the CPU orchestra. It reads the next instruction from memory (using the
Program Counter register), figures out what that instruction means (decoding), and tells every
other component what to do. It does not perform computation itself.

**Arithmetic Logic Unit (ALU):**
The workhorse that performs all computation. It takes two inputs, performs an operation, and
produces an output plus status flags (was the result zero? negative? did it overflow?). Modern
CPUs have multiple ALUs that can work in parallel.

**Registers:**
Tiny, ultra-fast storage locations inside the CPU. A typical x86-64 CPU has 16 general-purpose
registers (RAX, RBX, RCX, RDX, RSI, RDI, RSP, RBP, R8-R15), each holding 64 bits. Accessing
a register takes ~0.3 nanoseconds -- roughly 100x faster than accessing L1 cache and 300x
faster than main memory.

**Memory (RAM):**
The main storage for both instructions and data. Capacities are measured in gigabytes (GB).
Access time is ~100 nanoseconds -- an eternity in CPU time. This gap between CPU speed and
memory speed is called the "memory wall" and is the #1 performance bottleneck in modern
computing.

**Buses:**
The "highways" connecting components. The address bus specifies _where_ to read/write, the
data bus carries _what_ to read/write, and the control bus carries signals like "read" or
"write." Bus width determines how much data can move per cycle.

### 1.3 The Fetch-Decode-Execute Cycle

Every CPU runs an infinite loop:

```
                    THE FETCH-DECODE-EXECUTE CYCLE
                    ===============================

    +-------+       +--------+       +---------+       +----------+
    |       |       |        |       |         |       |          |
    | FETCH |------>| DECODE |------>| EXECUTE |------>| WRITE    |---+
    |       |       |        |       |         |       | BACK     |   |
    +-------+       +--------+       +---------+       +----------+   |
        ^                                                             |
        |                                                             |
        +-------------------------------------------------------------+
                         (repeat forever)

    FETCH:      Read instruction at address in Program Counter (PC)
                PC = PC + instruction_size (advance to next)

    DECODE:     Break instruction into opcode + operands
                Example: ADD R1, R2, R3
                opcode = ADD, dest = R1, src1 = R2, src2 = R3

    EXECUTE:    Send operands to ALU, perform operation
                Result = R2 + R3

    WRITE BACK: Store result in destination register
                R1 = Result
```

**A concrete example -- adding two numbers in memory:**

Suppose memory looks like this:

```
Address  |  Contents
---------|--------------------
0x1000   |  ADD R1, [0x2000], [0x2004]    <-- instruction
...
0x2000   |  42                             <-- first number
0x2004   |  58                             <-- second number
```

Step by step:

1. **FETCH**: PC = 0x1000. CPU reads the ADD instruction from memory.
2. **DECODE**: CPU recognizes ADD opcode. It needs values from addresses 0x2000 and 0x2004.
3. **EXECUTE**: CPU reads 42 and 58 from memory, sends to ALU. ALU computes 42 + 58 = 100.
4. **WRITE BACK**: Result 100 is stored in register R1. PC advances to next instruction.

### 1.4 The Von Neumann Bottleneck

Because instructions and data share the same memory bus, the CPU cannot fetch an instruction
and load/store data at the same time. This creates a traffic jam called the **von Neumann
bottleneck**. Modern CPUs mitigate this with:

- **Harvard-style split caches**: Separate L1 instruction cache and L1 data cache
- **Prefetching**: Predicting future memory accesses and loading data early
- **Deep pipelines**: Overlapping multiple instructions at different stages
- **Multiple memory channels**: More lanes on the highway

```
    VON NEUMANN BOTTLENECK: One bus, two purposes

    +--------+                   +-----------+
    |  CPU   |<====== BUS =====>|  MEMORY   |
    |        |   Instructions   |           |
    |        |   AND data must  | Instruc-  |
    |        |   share this     | tions &   |
    |        |   single path    | Data      |
    +--------+                   +-----------+

    MODERN MITIGATION: Split L1 cache (Modified Harvard)

    +--------+   +----------+   +-----------+
    |  CPU   |<->| L1-I $   |<--|           |
    |        |   | (instrs) |   |  UNIFIED  |
    |        |   +----------+   |  L2/L3    |<-->  MAIN
    |        |   +----------+   |  CACHE    |      MEMORY
    |        |<->| L1-D $   |<--|           |
    |        |   | (data)   |   |           |
    +--------+   +----------+   +-----------+
```

> **Key Takeaway**
> The von Neumann architecture is simple but creates a fundamental bottleneck: the CPU can
> process data far faster than memory can deliver it. Every optimization technique in this
> chapter -- caching, pipelining, prefetching, out-of-order execution -- exists to hide or
> reduce this memory latency gap.

---

## 2. Instruction Pipeline

### 2.1 Why Pipeline?

Without pipelining, the CPU must finish one instruction completely before starting the next.
If each instruction takes 5 stages and each stage takes 1 clock cycle, a single instruction
takes 5 cycles. Processing 1000 instructions takes 5000 cycles.

With pipelining, the CPU works like an assembly line: while instruction N is in the Execute
stage, instruction N+1 is being Decoded, and instruction N+2 is being Fetched. After the
pipeline is full, one instruction completes every cycle. Those 1000 instructions now take
only ~1004 cycles (5 to fill + 999 more completions).

### 2.2 The Classic 5-Stage Pipeline

```
    THE CLASSIC 5-STAGE RISC PIPELINE
    ==================================

    Stage:    IF        ID        EX       MEM       WB
              (Fetch)   (Decode)  (Exec)   (Memory)  (Write
                                                      Back)

    Cycle 1:  [Instr 1]
    Cycle 2:  [Instr 2] [Instr 1]
    Cycle 3:  [Instr 3] [Instr 2] [Instr 1]
    Cycle 4:  [Instr 4] [Instr 3] [Instr 2] [Instr 1]
    Cycle 5:  [Instr 5] [Instr 4] [Instr 3] [Instr 2] [Instr 1] <-- pipeline full
    Cycle 6:  [Instr 6] [Instr 5] [Instr 4] [Instr 3] [Instr 2]
    Cycle 7:  [Instr 7] [Instr 6] [Instr 5] [Instr 4] [Instr 3]
    ...

    After the pipeline fills (cycle 5), ONE instruction completes EVERY cycle.

    Throughput improvement: 5x (for a 5-stage pipeline)
```

**Stage Details:**

| Stage              | Abbreviation | What Happens                                                       |
| ------------------ | ------------ | ------------------------------------------------------------------ |
| Instruction Fetch  | IF           | Read instruction from I-cache at address in PC. Increment PC.      |
| Instruction Decode | ID           | Decode opcode. Read source registers from register file.           |
| Execute            | EX           | ALU performs the operation (add, subtract, compare, address calc). |
| Memory Access      | MEM          | Load: read data from D-cache. Store: write data to D-cache.        |
| Write Back         | WB           | Write result back to destination register.                         |

### 2.3 Pipeline Hazards

Pipelines do not always flow smoothly. Three types of problems -- called **hazards** -- can
force the pipeline to stall (insert "bubbles") or flush (throw away work).

#### 2.3.1 Data Hazards (Read-After-Write)

When an instruction needs a result that has not yet been written back:

```
    DATA HAZARD: Read-After-Write (RAW)
    ====================================

    Instruction 1:   ADD  R1, R2, R3      ; R1 = R2 + R3
    Instruction 2:   SUB  R4, R1, R5      ; R4 = R1 - R5  (needs R1!)

    Pipeline view (NO forwarding):

              IF    ID    EX    MEM   WB
    ADD R1:   [IF]  [ID]  [EX]  [MEM] [WB]  <-- R1 written here (cycle 5)
    SUB R4:         [IF]  [ID]  ????         <-- needs R1 in cycle 3!
                                ^
                                |
                           STALL: R1 not ready yet
                           Must insert 2 bubble cycles

    With FORWARDING (data bypassing):

              IF    ID    EX    MEM   WB
    ADD R1:   [IF]  [ID]  [EX]  [MEM] [WB]
    SUB R4:         [IF]  [ID]  [EX]  [MEM] [WB]
                                 ^
                                 |
                    Result forwarded directly from ADD's EX
                    output to SUB's EX input -- NO stall!
```

**Forwarding (bypassing)** adds extra wiring that routes results from one stage's output
directly to another stage's input, skipping the write-back and read stages. This eliminates
most data hazards.

**Load-use hazard** -- one case forwarding cannot fully solve:

```
    LOAD-USE HAZARD (requires 1-cycle stall even with forwarding)
    ==============================================================

    LDR  R1, [R2]       ; R1 = Memory[R2]  (result available after MEM)
    ADD  R3, R1, R4     ; R3 = R1 + R4     (needs R1 in EX stage)

              IF    ID    EX    MEM   WB
    LDR R1:   [IF]  [ID]  [EX]  [MEM] [WB]
    ADD R3:         [IF]  [ID]  STALL [EX]  [MEM] [WB]
                                  ^
                                  |
                    Data not available until end of MEM stage
                    Must stall 1 cycle, then forward from MEM
```

The compiler can help by reordering instructions to fill that 1-cycle "load delay slot" with
a useful instruction that does not depend on the loaded value.

#### 2.3.2 Control Hazards (Branches)

When the CPU encounters a branch (if/else, loop, function call), it does not know the next
instruction address until the branch condition is evaluated:

```
    CONTROL HAZARD: Branch causes pipeline flush
    =============================================

    100:  CMP  R1, R2          ; compare R1 and R2
    104:  BEQ  target          ; branch to 'target' if equal
    108:  ADD  R3, R4, R5      ; next sequential instruction
    10C:  SUB  R6, R7, R8
    ...
    200:  target: MUL R9, R10, R11

              IF     ID     EX     MEM    WB
    CMP:      [IF]   [ID]   [EX]   [MEM]  [WB]
    BEQ:             [IF]   [ID]   [EX]         <-- branch resolved here
    ADD:                    [IF]   [FLUSH]       <-- wrong path! discard
    SUB:                           [FLUSH]       <-- wrong path! discard
    MUL (target):                  [IF]   [ID]   [EX]  ...

    Branch penalty: 2 wasted cycles (fetched wrong instructions)
    In a 20-stage pipeline: penalty can be 15+ cycles!
```

Solutions:

- **Branch prediction**: Guess which way the branch goes (see Section 5)
- **Delayed branching**: Fill the delay slot with a useful instruction (MIPS approach)
- **Predicated execution**: Execute both paths, discard wrong one (ARM conditional execution)

#### 2.3.3 Structural Hazards

When two instructions need the same hardware unit at the same time:

```
    STRUCTURAL HAZARD
    =================

    Example: Single-ported memory (can do only 1 access per cycle)

    Instruction 1 is in MEM stage (loading data from memory)
    Instruction 4 is in IF stage  (fetching instruction from memory)
    Both need memory access in the same cycle!

              IF    ID    EX    MEM   WB
    Instr 1:                    [MEM]        <-- accessing memory
    Instr 4:  [IF]                           <-- also needs memory!
              ^                   ^
              |                   |
              +---- CONFLICT -----+

    Solution: Separate instruction cache and data cache (Modified Harvard)
              Multiple execution units (integer ALU, FP ALU, load/store unit)
```

### 2.4 Pipeline Depth in Modern CPUs

Modern CPUs use much deeper pipelines than the classic 5 stages:

```
    PIPELINE DEPTH EVOLUTION
    ========================

    Processor            Year    Pipeline Stages
    -----------------------------------------------
    MIPS R2000           1985          5
    Intel Pentium        1993          5
    Intel Pentium III    1999         10
    Intel Pentium 4      2000         20
    Intel Pentium 4 (Prescott) 2004   31  <-- too deep! misprediction costly
    Intel Core (Conroe)  2006         14
    Intel Skylake        2015         14-19
    Apple M1             2020         ~16
    AMD Zen 4            2022         ~19
```

Deeper pipelines allow higher clock speeds (each stage does less work, so it completes
faster) but increase the penalty for mispredictions and stalls. Modern designs settle on
14-20 stages as a sweet spot.

> **Key Takeaway**
> Pipelining is the single most important technique for CPU throughput. A 5-stage pipeline
> can achieve up to 5x speedup over unpipelined execution. But pipeline hazards -- data
> dependencies, branches, and resource conflicts -- are real performance killers that the
> CPU must constantly work around. Understanding these hazards explains why seemingly
> innocent code changes can have dramatic performance effects.

---

## 3. Superscalar and Out-of-Order Execution

### 3.1 Superscalar: Multiple Instructions Per Cycle

A pipelined CPU still processes at most one instruction per clock cycle per pipeline. A
**superscalar** CPU has multiple execution units and can issue _several_ instructions per
cycle, achieving an Instructions Per Cycle (IPC) greater than 1.

```
    SCALAR vs. SUPERSCALAR EXECUTION
    =================================

    SCALAR (1 instruction/cycle):

    Cycle:    1     2     3     4     5     6     7     8
    Pipe A:  [I1]  [I2]  [I3]  [I4]  [I5]  [I6]  [I7]  [I8]

    8 instructions in 8 cycles  -->  IPC = 1.0

    SUPERSCALAR (4-wide):

    Cycle:    1         2         3         4
    Pipe A:  [I1]      [I5]
    Pipe B:  [I2]      [I6]
    Pipe C:  [I3]      [I7]
    Pipe D:  [I4]      [I8]

    8 instructions in 2 cycles  -->  IPC = 4.0 (theoretical max)
    Real-world IPC: 2-6 for modern CPUs (limited by dependencies)
```

**Modern CPU execution width:**

| CPU                          | Issue Width       | Peak IPC |
| ---------------------------- | ----------------- | -------- |
| Intel Skylake                | 4 micro-ops/cycle | ~4       |
| Intel Golden Cove (12th gen) | 6 micro-ops/cycle | ~6       |
| AMD Zen 4                    | 6 micro-ops/cycle | ~6       |
| Apple M1 (Firestorm)         | 8 micro-ops/cycle | ~8       |
| Apple M3 (Performance)       | 9 micro-ops/cycle | ~9       |

### 3.2 In-Order vs. Out-of-Order Execution

In-order CPUs execute instructions in the exact sequence the programmer wrote them. If
instruction 3 is stalled waiting for data, instructions 4, 5, 6... all wait too, even if
they are independent and could execute immediately.

Out-of-order (OoO) CPUs detect which instructions are independent and execute them as soon
as their inputs are ready, regardless of program order. This dramatically increases IPC.

```
    IN-ORDER vs. OUT-OF-ORDER EXECUTION
    =====================================

    Program:
        I1:  LOAD  R1, [addr1]      ; cache miss! ~100 cycles
        I2:  ADD   R2, R1, R3       ; depends on I1
        I3:  MUL   R4, R5, R6       ; independent of I1, I2
        I4:  ADD   R7, R5, R8       ; independent of I1, I2
        I5:  SUB   R9, R4, R7       ; depends on I3, I4

    IN-ORDER:
    Cycle 1:     I1 starts (cache miss, stalls ~100 cycles)
    Cycle 2-100: STALL STALL STALL... waiting for I1
    Cycle 101:   I2 executes (R1 now available)
    Cycle 102:   I3 executes
    Cycle 103:   I4 executes
    Cycle 104:   I5 executes
    Total: ~104 cycles

    OUT-OF-ORDER:
    Cycle 1:     I1 starts (cache miss)
    Cycle 2:     I3 executes (independent! why wait?)
    Cycle 3:     I4 executes (also independent!)
    ...
    Cycle 100:   I1 completes (data arrives from memory)
    Cycle 101:   I2 executes (R1 now ready)
    Cycle 102:   I5 executes (R4, R7 already ready)
    Total: ~102 cycles  (I3, I4 executed "for free" during the stall)
```

### 3.3 The Out-of-Order Engine: How It Works

The OoO execution engine is one of the most complex pieces of hardware ever built. Here is
a simplified view of its major components:

```
    OUT-OF-ORDER EXECUTION ENGINE
    ==============================

                    +-------------------+
                    |   INSTRUCTION     |
                    |   FETCH & DECODE  |
                    +--------+----------+
                             |
                             v
                    +--------+----------+
                    |   REGISTER        |
                    |   RENAME          |   Maps architectural registers
                    |   (RAT)           |   to physical registers to
                    +--------+----------+   eliminate false dependencies
                             |
                             v
                    +--------+----------+
                    |   REORDER BUFFER  |   Tracks all in-flight
                    |   (ROB)           |   instructions, ensures
                    |                   |   results commit in order
                    +--------+----------+
                             |
                    +--------+----------+
                    |   RESERVATION     |   Instructions wait here
                    |   STATIONS (RS)   |   until operands are ready
                    +--------+----------+
                             |
             +-------+-------+-------+-------+
             |       |       |       |       |
             v       v       v       v       v
          +-----+ +-----+ +-----+ +-----+ +-----+
          | ALU | | ALU | | FPU | |LOAD | |STORE|
          |  1  | |  2  | |     | |UNIT | |UNIT |
          +-----+ +-----+ +-----+ +-----+ +-----+
             |       |       |       |       |
             v       v       v       v       v
                    +--------+----------+
                    |   COMMON DATA BUS |   Results broadcast
                    |   (CDB)           |   to all waiting RS
                    +--------+----------+
                             |
                             v
                    +--------+----------+
                    |   RETIRE / COMMIT |   Write results to
                    |   (in order!)     |   architectural state
                    +-------------------+
```

### 3.4 Register Renaming

Consider this code:

```asm
    I1:  ADD  R1, R2, R3      ; R1 = R2 + R3
    I2:  SUB  R4, R1, R5      ; R4 = R1 - R5  (true dependency on I1)
    I3:  MUL  R1, R6, R7      ; R1 = R6 * R7  (reuses R1 -- false dependency!)
    I4:  ADD  R8, R1, R9      ; R8 = R1 + R9  (depends on I3's R1)
```

Without renaming, I3 cannot execute until I2 reads R1 (otherwise I3 would overwrite I1's
result before I2 uses it). This is a **Write-After-Read (WAR)** hazard -- a _false_
dependency because I3 is using R1 for a completely unrelated purpose.

```
    REGISTER RENAMING ELIMINATES FALSE DEPENDENCIES
    ================================================

    Architectural registers:  R1, R2, R3, ...  (what the programmer sees)
    Physical registers:       P1, P2, P3, ...  (what the hardware has, many more)

    Before renaming:
        I1:  ADD  R1, R2, R3      WAR
        I2:  SUB  R4, R1, R5      ^---- I3 must wait for I2 to read R1
        I3:  MUL  R1, R6, R7      |
        I4:  ADD  R8, R1, R9      true dep on I3

    After renaming (R1 -> P10 for I1, R1 -> P17 for I3):
        I1:  ADD  P10, P2, P3     \
        I2:  SUB  P4, P10, P5      |-- I1/I2 chain
        I3:  MUL  P17, P6, P7     \
        I4:  ADD  P8, P17, P9      |-- I3/I4 chain (INDEPENDENT!)

    Now I3 can execute IN PARALLEL with I1 because they write different
    physical registers. The false dependency is gone.

    Modern CPUs have 180-300+ physical registers mapped to 16 architectural ones.
```

### 3.5 Reservation Stations and the Reorder Buffer

**Reservation Stations (RS):**
Each execution unit has a queue of waiting instructions. An instruction enters a reservation
station after decode/rename. It waits there, watching the Common Data Bus (CDB) for its
missing operands. The moment all operands arrive, the instruction is dispatched to the
execution unit. This is called **Tomasulo's algorithm** (first implemented in IBM System/360
Model 91, 1967).

**Reorder Buffer (ROB):**
Even though instructions execute out of order, they must _retire_ (commit their results) in
program order. Why? Because of exceptions and interrupts. If instruction 50 causes a page
fault, the CPU must be able to say "everything before 50 completed, nothing after 50 has
taken effect." The ROB is a circular buffer that tracks every in-flight instruction and
commits them in order.

```
    REORDER BUFFER (ROB) - Circular queue
    ======================================

    Head (next to retire)                    Tail (newest entry)
      |                                         |
      v                                         v
    +------+------+------+------+------+------+------+
    | I12  | I13  | I14  | I15  | I16  | I17  | I18  |
    | DONE | DONE | EXEC | WAIT | DONE | EXEC | WAIT |
    +------+------+------+------+------+------+------+
      ^                           ^
      |                           |
      Can retire I12, I13         I16 is done but CANNOT retire yet
      (both complete, in order)   because I14, I15 haven't finished.
                                  Must wait for in-order retirement.

    ROB sizes in modern CPUs:
    - Intel Skylake:     224 entries
    - Intel Golden Cove: 512 entries
    - AMD Zen 4:         320 entries
    - Apple M1:          630 entries (!)
```

### 3.6 Instruction-Level Parallelism (ILP)

ILP is the degree to which instructions in a program can execute simultaneously. It is
limited by:

1. **True data dependencies** (RAW): Instruction B needs the result of instruction A
2. **Control dependencies**: Branches that have not been resolved
3. **Memory dependencies**: Loads/stores to the same address
4. **Resource limitations**: Finite execution units, ROB entries, RS entries

Compilers and CPUs work together to maximize ILP:

- **Compiler**: Instruction scheduling, loop unrolling, software pipelining
- **CPU hardware**: Register renaming, OoO execution, speculative execution

The theoretical ILP in most programs is 2-5 instructions per cycle. Achieving more requires
techniques like VLIW (Very Long Instruction Word) or SIMD (discussed in Section 7).

> **Key Takeaway**
> Modern CPUs do not execute your code in the order you wrote it. The out-of-order engine
> identifies independent instructions and executes them in parallel across multiple execution
> units. Register renaming eliminates false dependencies, reservation stations handle
> scheduling, and the reorder buffer ensures correct program behavior despite out-of-order
> execution. Understanding this machinery explains why instruction mix and data dependencies
> have such a profound impact on performance.

---

## 4. Cache Hierarchy

### 4.1 The Memory Speed Gap

The CPU processes data at ~4 GHz (one operation every 0.25 nanoseconds). Main memory (DRAM)
responds in ~100 nanoseconds. That is a 400x speed gap. Without caches, the CPU would spend
99.75% of its time waiting for memory. Caches bridge this gap.

```
    MEMORY HIERARCHY: Speed vs. Size Tradeoff
    ==========================================

    +----------+     ~0.3 ns     ~1 KB
    | REGISTERS|     (1 cycle)   (per core)
    +----+-----+
         |
    +----v-----+     ~1 ns       ~64 KB      (32 KB I$ + 32 KB D$)
    |  L1 CACHE|     (4 cycles)  (per core)
    +----+-----+
         |
    +----v-----+     ~3-5 ns     ~256 KB - 1 MB
    |  L2 CACHE|     (12 cycles) (per core)
    +----+-----+
         |
    +----v-----+     ~10-30 ns   ~8-64 MB
    |  L3 CACHE|     (40 cycles) (shared across cores)
    +----+-----+
         |
    +----v-----+     ~100 ns     ~16-128 GB
    | MAIN MEM |     (400 cyc)   (shared across all)
    | (DRAM)   |
    +----+-----+
         |
    +----v-----+     ~100 us     ~1-8 TB
    | SSD/NVMe |     (400K cyc)
    +----+-----+
         |
    +----v-----+     ~10 ms      ~1-20 TB
    | HARD DISK|     (40M cyc)
    +----------+

    Rule of thumb: each level is ~3-10x slower and ~10-100x larger
```

### 4.2 Latency Numbers Every Programmer Should Know

```
    LATENCY NUMBERS (approximate, modern hardware ~2024)
    =====================================================

    Operation                          Time        CPU Cycles
    -------------------------------------------------------
    Register access                    0.3 ns           1
    L1 cache hit                       1 ns             4
    L2 cache hit                       3-5 ns          12-20
    L3 cache hit                       10-30 ns        40-120
    Main memory (DRAM)                 80-120 ns       300-500
    NVMe SSD random read               20-100 us       80K-400K
    SATA SSD random read               50-200 us       200K-800K
    HDD random seek                    5-10 ms         20M-40M
    Network (same datacenter)          0.5 ms          2M
    Network (cross-continent)          50-150 ms       200M-600M

    TO PUT THIS IN PERSPECTIVE (1 cycle = 1 second):
    Register access           =  1 second
    L1 cache hit              =  4 seconds
    L2 cache hit              =  15 seconds
    L3 cache hit              =  1 minute
    Main memory               =  6 minutes
    SSD read                  =  3-5 days
    HDD seek                  =  3-6 months
    Network (same DC)         =  23 days
    Network (cross-continent) =  5-20 years
```

### 4.3 Cache Lines: The Unit of Transfer

Caches do not operate on individual bytes. They operate on **cache lines** (also called
cache blocks), typically 64 bytes on x86.

```
    CACHE LINE (64 bytes on x86)
    ============================

    When you access byte at address 0x1000, the cache loads the
    ENTIRE 64-byte block containing that address:

    Loaded cache line:
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |  bytes at addresses 0x0FC0 through 0x0FFF       |
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    (64 bytes = 16 integers or 8 doubles)

    This is why SEQUENTIAL access is fast (spatial locality):

    int array[1000];
    for (int i = 0; i < 1000; i++)
        sum += array[i];   // First access loads 16 ints into cache
                            // Next 15 accesses are FREE (already in cache line)

    And RANDOM access is slow:

    for (int i = 0; i < 1000; i++)
        sum += array[random()];  // Each access likely loads a NEW cache line
                                  // 63 of the 64 loaded bytes are wasted!
```

### 4.4 Cache Associativity

When a cache line is loaded, where does it go in the cache? There are three strategies:

```
    CACHE ASSOCIATIVITY
    ===================

    DIRECT-MAPPED CACHE (1-way associative):
    Each memory address maps to exactly ONE cache location.
    Fast to look up, but causes "conflict misses."

    Memory addresses:     Cache (8 slots):
    0x0000  ----+         +--------+
    0x0800  ----|-------> | Slot 0 |   0x0000 and 0x0800 BOTH map
    0x1000  ----+    +--> | Slot 1 |   to slot 0! If you alternate
    0x1800  ---------|    | Slot 2 |   between them, every access
                     |    | Slot 3 |   is a miss (thrashing).
                     |    | Slot 4 |
                     |    | Slot 5 |
                     |    | Slot 6 |
                     +--> | Slot 7 |
                          +--------+

    FULLY-ASSOCIATIVE CACHE:
    A cache line can go ANYWHERE in the cache.
    No conflict misses, but slow to search (must check every slot).

    Memory address 0x1234 --> can go in ANY of the 8 slots
    Must search all 8 slots on every access (parallel comparators needed)

    SET-ASSOCIATIVE CACHE (N-way):
    Compromise. Cache is divided into sets. Each address maps to one SET,
    but can go in any of the N WAYS within that set.

    4-way set-associative cache (4 sets, 4 ways):

                    Way 0    Way 1    Way 2    Way 3
                  +--------+--------+--------+--------+
    Set 0:        | line   | line   | line   | line   |
                  +--------+--------+--------+--------+
    Set 1:        | line   | line   | line   | line   |
                  +--------+--------+--------+--------+
    Set 2:        | line   | line   | line   | line   |
                  +--------+--------+--------+--------+
    Set 3:        | line   | line   | line   | line   |
                  +--------+--------+--------+--------+

    Address 0x1234 maps to Set (0x1234 / 64) % 4 = Set X
    Within Set X, it can go in any of the 4 ways.
    On lookup, only 4 comparisons needed (not the whole cache).
```

**Modern CPU cache associativity:**

| Cache Level         | Typical Size  | Associativity | Line Size |
| ------------------- | ------------- | ------------- | --------- |
| L1-I (instructions) | 32-64 KB      | 8-way         | 64 B      |
| L1-D (data)         | 32-64 KB      | 8-12 way      | 64 B      |
| L2                  | 256 KB - 2 MB | 4-16 way      | 64 B      |
| L3                  | 8-64 MB       | 12-16 way     | 64 B      |

### 4.5 Cache Replacement Policies

When a cache set is full and a new line must be loaded, which existing line gets evicted?

- **LRU (Least Recently Used)**: Evict the line that has not been accessed for the longest
  time. Most common for L1/L2. Expensive to implement exactly for high associativity.
- **Pseudo-LRU**: Approximation of LRU using a tree of bits. Used in many real designs.
- **Random**: Surprisingly competitive with LRU for large caches.
- **RRIP (Re-Reference Interval Prediction)**: Predicts how far in the future a line will
  be reused. Used in Intel L3 caches.

### 4.6 Inclusion and Exclusion Policies

How do the cache levels relate to each other?

```
    CACHE INCLUSION POLICIES
    ========================

    INCLUSIVE (Intel traditional):
    Everything in L1 is also in L2 is also in L3.
    + Simpler coherence (snoop only L3 for external requests)
    - Wastes space (duplicate copies eat capacity)

    +--------+
    |  L1    |  All L1 data also present in L2 and L3
    +---+----+
        |
    +---v----+
    |  L2    |  All L2 data also present in L3
    +---+----+
        |
    +---v----+
    |  L3    |  Superset of L1 + L2
    +--------+

    EXCLUSIVE (AMD traditional):
    A cache line exists in ONLY ONE level at a time.
    + Maximum effective capacity (L1 + L2 + L3, no duplication)
    - More complex coherence and data movement

    +--------+
    |  L1    |  Data here is NOT in L2 or L3
    +---+----+
        |
    +---v----+
    |  L2    |  Data here is NOT in L1 or L3
    +---+----+
        |
    +---v----+
    |  L3    |  Data here is NOT in L1 or L2
    +--------+

    NON-INCLUSIVE, NON-EXCLUSIVE (NINE) -- Modern Intel:
    No strict policy. A line may or may not exist in multiple levels.
    Practical compromise used in recent Intel server chips.
```

### 4.7 Cache Coherence: The MESI Protocol

In a multicore CPU, each core has its own L1/L2 caches. When core 0 writes to address X,
core 1's cached copy of X becomes stale. Cache coherence protocols ensure all cores see a
consistent view of memory.

**MESI** is the most common protocol. Each cache line is in one of four states:

```
    MESI PROTOCOL: Four States Per Cache Line
    ==========================================

    +------------+--------------------------------------------------+
    | State      | Meaning                                          |
    +------------+--------------------------------------------------+
    | Modified   | Line is dirty (written to). Only copy.           |
    |   (M)      | Must write back to memory before sharing.        |
    +------------+--------------------------------------------------+
    | Exclusive  | Line is clean (matches memory). Only copy.       |
    |   (E)      | Can transition to Modified without bus traffic.  |
    +------------+--------------------------------------------------+
    | Shared     | Line is clean. May exist in other caches too.    |
    |   (S)      | Must invalidate others before writing.           |
    +------------+--------------------------------------------------+
    | Invalid    | Line is not valid. Must fetch from memory/other  |
    |   (I)      | cache on next access.                            |
    +------------+--------------------------------------------------+

    STATE TRANSITIONS:

              +-------- BusRd (other core reads) --------+
              |                                           |
              v                                           |
    +----+   read    +----+  write   +----+              |
    | I  |---------->| E  |--------->| M  |              |
    +----+           +----+          +----+              |
      ^                |               |                  |
      |                | BusRd         | BusRd            |
      |                v               v                  |
      |              +----+          +----+              |
      +--BusRdX------| S  |<--------| S  |<-- (writeback|
         (other      +----+          +----+    + share)  |
          writes)      |                                  |
                       | write (BusRdX = invalidate      |
                       | other copies, transition to M)  |
                       +----------------------------------+
```

**MESI in action -- two cores sharing data:**

```
    SCENARIO: Core 0 and Core 1 both work with variable X
    ======================================================

    Step 1: Core 0 reads X (cache miss)
    Core 0: [X = 42, state = E]    Core 1: [-, state = I]
    (Exclusive because no other core has it)

    Step 2: Core 1 reads X (snoop hit in Core 0)
    Core 0: [X = 42, state = S]    Core 1: [X = 42, state = S]
    (Both Shared now)

    Step 3: Core 0 writes X = 99
    Core 0: [X = 99, state = M]    Core 1: [X = 42, state = I]
    (Core 0 sends invalidation, Core 1's copy is now Invalid)

    Step 4: Core 1 reads X (miss, must get from Core 0)
    Core 0: [X = 99, state = S]    Core 1: [X = 99, state = S]
    (Core 0 writes back to memory and transitions to Shared)
```

**False sharing** -- a critical performance pitfall:

```
    FALSE SHARING
    =============

    Two variables on the SAME cache line, accessed by DIFFERENT cores:

    struct Counters {
        int core0_count;   // offset 0   \
        int core1_count;   // offset 4    |-- same 64-byte cache line!
    };                                   /

    Core 0 increments core0_count  --> invalidates Core 1's cache line
    Core 1 increments core1_count  --> invalidates Core 0's cache line
    Back and forth, every single increment causes a cache miss!

    FIX: Pad to separate cache lines (64 bytes apart):

    struct Counters {
        alignas(64) int core0_count;   // own cache line
        alignas(64) int core1_count;   // own cache line
    };
```

### 4.8 Cache Performance Metrics

Three types of cache misses (the "Three Cs"):

| Miss Type             | Cause                              | Mitigation                      |
| --------------------- | ---------------------------------- | ------------------------------- |
| **Compulsory** (cold) | First access to a block            | Prefetching                     |
| **Capacity**          | Cache too small for working set    | Larger cache, better algorithms |
| **Conflict**          | Multiple addresses map to same set | Higher associativity            |

A fourth "C" for multicore:
| **Coherence** | Another core invalidated the line | Reduce sharing, padding |

> **Key Takeaway**
> The cache hierarchy is the most important hardware feature for software performance.
> Sequential memory access patterns, compact data structures, and avoiding false sharing
> can yield 10-100x performance improvements. Memorize the latency numbers -- they are the
> foundation of all performance reasoning.

---

## 5. Branch Prediction

### 5.1 Why Branch Prediction Matters

Modern CPUs have 14-20 pipeline stages. A branch instruction (if/else, loop condition,
switch, virtual function call) creates uncertainty about the next instruction to fetch.
Without prediction, the CPU must stall until the branch is resolved, wasting 15+ cycles
every time. Since roughly 20% of all instructions are branches, that would be catastrophic.

```
    THE BRANCH PREDICTION PROBLEM
    ==============================

    Code:
        if (x > 0) {
            a = b + c;    // path A (taken)
        } else {
            a = b - c;    // path B (not taken)
        }

    The CPU must decide: fetch path A or path B?
    It does not KNOW the answer until the comparison executes,
    which is many pipeline stages away.

    Without prediction:
    Cycles: [CMP] [STALL] [STALL] ... [STALL] [RESOLVED] [FETCH correct path]
            |<--------- 15+ wasted cycles --------->|

    With prediction (correct guess):
    Cycles: [CMP] [FETCH predicted path] [EXEC] [VERIFY: correct!]
            |<-- no penalty, full speed! -->|

    With prediction (wrong guess):
    Cycles: [CMP] [FETCH wrong] [EXEC wrong] ... [RESOLVE: WRONG! FLUSH!]
            |<-------- ~15 cycle penalty ------->| [FETCH correct path]
```

### 5.2 Static Branch Prediction

The simplest strategies, requiring no runtime information:

```
    STATIC PREDICTION STRATEGIES
    ============================

    1. ALWAYS PREDICT NOT TAKEN
       Simplest hardware. Fetch the next sequential instruction.
       ~60% accuracy (branches are taken ~60% of the time).

    2. ALWAYS PREDICT TAKEN
       ~60% accuracy for general code.

    3. BACKWARD TAKEN, FORWARD NOT TAKEN (BTFNT)
       - Backward branches (loops) --> predict TAKEN (loop continues)
       - Forward branches (if/else) --> predict NOT TAKEN
       ~65% accuracy. Used in early MIPS and SPARC processors.

       for (int i = 0; i < N; i++) {
           // backward branch at bottom of loop --> predict TAKEN
           // correct for all iterations except the last one
       }

       if (rare_error) {
           // forward branch --> predict NOT TAKEN
           // correct if errors are rare
           handle_error();
       }
```

### 5.3 Dynamic Branch Prediction

Modern CPUs use hardware tables that learn from past behavior:

#### 5.3.1 1-Bit Predictor

```
    1-BIT PREDICTOR
    ================

    For each branch, store 1 bit: was it taken last time?
    Predict: same as last time.

    Problem with loops: WRONG twice per loop execution

    Loop: for (i = 0; i < 4; i++) { ... }

    Iteration:  1    2    3    4    exit
    Actual:     T    T    T    T    NT
    Predict:    NT   T    T    T    T
    Result:     MISS HIT  HIT  HIT  MISS

    2 misses per loop invocation. For short loops, this is terrible.
```

#### 5.3.2 2-Bit Saturating Counter

```
    2-BIT SATURATING COUNTER
    =========================

    Uses 2 bits = 4 states. Must mispredict TWICE to change prediction.

    +-----+         +-----+         +-----+         +-----+
    |  00 |--Taken->|  01 |--Taken->|  10 |--Taken->|  11 |
    |Str. |         |Weak |         |Weak |         |Str. |
    |Not  |<-!Taken-|Not  |<-!Taken-|Taken|<-!Taken-|Taken|
    |Taken|         |Taken|         |     |         |     |
    +-----+         +-----+         +-----+         +-----+

    Predict NOT TAKEN              Predict TAKEN
    if state = 00 or 01           if state = 10 or 11

    Loop example (loop of 4):
    Iteration:  1    2    3    4    exit | 1    2    3    4    exit
    Actual:     T    T    T    T    NT  | T    T    T    T    NT
    State:      00   01   10   11   10  | 11   11   11   11   10
    Predict:    NT   NT   T    T    T   | T    T    T    T    T
    Result:     MISS MISS HIT  HIT  MISS| HIT  HIT  HIT  HIT  MISS

    After warmup: only 1 miss per loop (the exit), not 2!
```

#### 5.3.3 Two-Level Adaptive Predictor

```
    TWO-LEVEL ADAPTIVE PREDICTOR (correlated branches)
    ===================================================

    Key insight: Branch behavior often CORRELATES with recent history.

    Example:
        if (x == 0)           // Branch A
            ...
        if (x > 0)            // Branch B  (if A was taken, B is NOT taken!)

    GLOBAL HISTORY REGISTER (GHR): Shift register of last N branch outcomes
    PATTERN HISTORY TABLE (PHT): Array of 2-bit counters indexed by history

    GHR: [T, NT, T, T, NT, T, T, NT]  (last 8 branch outcomes)
         = binary 10110110 = index 182

    PHT[182] = 2-bit counter --> predicts next branch

    +--------+         +---------+
    |  GHR   |-------->|  PHT    |
    | (8-bit |  index  |  [256]  |-------> Prediction
    | shift  |         | 2-bit   |         (T or NT)
    | reg.)  |         | counters|
    +--------+         +---------+

    Modern CPUs use TAGE (TAgged GEometric history length) predictors
    that combine multiple history lengths to capture both short and
    long-range patterns. Accuracy: 95-97%.
```

### 5.4 Branch Target Buffer (BTB)

Prediction accuracy is not enough -- the CPU also needs to know _where_ a taken branch goes.
The Branch Target Buffer stores the target address of recently taken branches.

```
    BRANCH TARGET BUFFER (BTB)
    ===========================

    +-------------------+-------------------+-------------------+
    | Branch PC (tag)   | Target Address    | Prediction Bits   |
    +-------------------+-------------------+-------------------+
    | 0x00401230        | 0x00401300        | 11 (Strong Taken) |
    | 0x00401280        | 0x00401100        | 10 (Weak Taken)   |
    | 0x004012F0        | 0x00401400        | 11 (Strong Taken) |
    | ...               | ...               | ...               |
    +-------------------+-------------------+-------------------+

    Flow:
    1. PC enters BTB lookup (in IF stage, before decode!)
    2. If HIT and prediction = Taken:
       Next PC = Target Address (start fetching from target)
    3. If MISS or prediction = Not Taken:
       Next PC = PC + instruction_size (continue sequentially)
    4. When branch resolves (EX stage), update BTB entry
```

### 5.5 Speculative Execution

When the branch predictor says "this branch is taken, jump to address X," the CPU does not
just start fetching -- it actually _executes_ the predicted instructions, modifying registers
(via the rename table) and issuing memory operations. This is **speculative execution**.

If the prediction was correct, the speculative results are committed (retired from the ROB)
and no time was wasted. If wrong, all speculative results are thrown away -- the ROB is
flushed back to the branch point, and execution restarts on the correct path.

```
    SPECULATIVE EXECUTION
    =====================

    Timeline (correct prediction):

    Branch predicted TAKEN at cycle 5
    Cycle 5-20:  Execute 15 instructions speculatively on taken path
    Cycle 20:    Branch resolves --> prediction was CORRECT
    Cycle 20+:   Speculative instructions retired normally
    Penalty: 0 cycles

    Timeline (misprediction):

    Branch predicted TAKEN at cycle 5
    Cycle 5-20:  Execute 15 instructions speculatively on taken path
    Cycle 20:    Branch resolves --> prediction was WRONG!
    Cycle 20:    FLUSH pipeline. Discard all 15 speculative instructions.
    Cycle 21:    Start fetching from correct path
    Penalty: ~15-20 cycles (all speculative work wasted)
```

### 5.6 Writing Branch-Prediction-Friendly Code

```c
// BAD: Unpredictable branches (random pattern)
for (int i = 0; i < N; i++) {
    if (data[i] < threshold)    // 50/50 random --> ~50% misprediction
        sum += data[i];
}

// BETTER: Sort the data first (makes branch predictable)
std::sort(data, data + N);
for (int i = 0; i < N; i++) {
    if (data[i] < threshold)    // first half: always true, second half: always false
        sum += data[i];         // predictor learns pattern --> ~0% misprediction
}

// BEST: Eliminate the branch entirely (branchless code)
for (int i = 0; i < N; i++) {
    sum += (data[i] < threshold) ? data[i] : 0;  // conditional move, no branch
}
// Compiler may use CMOV instruction (branchless)
```

> **Key Takeaway**
> Branch prediction accuracy on modern CPUs exceeds 95%, but the remaining 5% of
> mispredictions can dominate execution time because each misprediction wastes 15-20 cycles.
> Predictable patterns (loops, sorted data) are fast. Random patterns (hash lookups,
> pointer chasing through random data) are slow. Eliminating branches entirely via
> branchless code is sometimes the best optimization.

---

## 6. Virtual Memory

### 6.1 What Problem Does Virtual Memory Solve?

Without virtual memory, every program would need to manage physical memory addresses directly.
Program A might use addresses 0x0000-0xFFFF, and Program B might need the same range --
crash! Virtual memory gives each process its own private address space, mapped by hardware
to physical RAM.

```
    VIRTUAL MEMORY: Each process sees its own private address space
    ================================================================

    Process A's view:           Physical RAM:         Process B's view:
    +----------------+                                +----------------+
    | 0xFFFF...      |          +-----------+         | 0xFFFF...      |
    | Stack          |---+      |           |    +--->| Stack          |
    +----------------+   |      |  Frame 7  |<---+    +----------------+
    |                |   +----->|  Frame 6  |         |                |
    | Heap           |---+      |  Frame 5  |<--+     | Heap           |---+
    +----------------+   |      |  Frame 4  |   |     +----------------+   |
    | .data          |   +----->|  Frame 3  |   |     | .data          |   |
    +----------------+          |  Frame 2  |<--+     +----------------+   |
    | .text (code)   |------+   |  Frame 1  |         | .text (code)   |   |
    +----------------+      +-->|  Frame 0  |<--------+----------------+   |
    | 0x0000...      |          +-----------+         | 0x0000...      |   |
    +----------------+          (scattered!)          +----------------+   |
                                                                           |
    Note: Process A's contiguous heap maps to scattered physical frames.   |
    Process B's heap maps to completely different frames. --------<--------+
    Neither process can see the other's memory.
```

### 6.2 Pages and Page Tables

Virtual memory divides the address space into fixed-size **pages** (typically 4 KB on x86).
Physical memory is divided into **frames** of the same size. A **page table** maps virtual
page numbers to physical frame numbers.

```
    PAGE TABLE TRANSLATION
    ======================

    Virtual Address: 0x00007F3A B004 2ABC
                     |         |         |
                     +----+----+----+----+
                          |              |
                    Virtual Page    Page Offset
                    Number (VPN)    (12 bits for 4KB pages)

    Page Table Entry (PTE):
    +-------+---+---+---+---+---+-------+---------------------------+
    | NX    | G | D | A | U | W | Rsvd  | Physical Frame Number     |
    | (1b)  |(1)|(1)|(1)|(1)|(1)| (6b)  | (40 bits)                 |
    +-------+---+---+---+---+---+-------+---------------------------+

    Bits:
    NX = No-Execute (prevents code execution from data pages)
    G  = Global (shared across all processes, e.g., kernel pages)
    D  = Dirty (page has been written to)
    A  = Accessed (page has been read or written)
    U  = User (accessible from user mode, not just kernel)
    W  = Writable (0 = read-only)
    PFN = Physical Frame Number (the translation)
```

### 6.3 Multi-Level Page Tables

A single flat page table for a 48-bit virtual address space would require 512 GB of memory
just for the table itself. The solution is a multi-level (hierarchical) page table where
large unused regions do not need table entries at all.

```
    x86-64 FOUR-LEVEL PAGE TABLE (48-bit virtual address)
    =====================================================

    Virtual Address (48 bits used, 64-bit canonical):
    +--------+--------+--------+--------+----------+
    | PML4   | PDPT   | PD     | PT     | Offset   |
    | (9 bit)| (9 bit)| (9 bit)| (9 bit)| (12 bit) |
    +---+----+---+----+---+----+---+----+-----+----+
        |        |        |        |          |
        v        v        v        v          v
    +------+ +------+ +------+ +------+  Physical
    | PML4 | | PDPT | | Page | | Page |  Frame +
    |Table |-|Table |-| Dir  |-|Table |-  Offset
    | (512 | | (512 | | (512 | | (512 |  = Physical
    |entry)| |entry)| |entry)| |entry)|  Address
    +------+ +------+ +------+ +------+

    CR3 register points to the base of the PML4 table.

    Each table has 512 entries (9 bits of index).
    9 + 9 + 9 + 9 + 12 = 48 bits of virtual address.

    Walking the page table requires 4 memory accesses!
    (This is why the TLB exists -- see next section)

    x86-64 5-LEVEL PAGING (Intel Ice Lake+):
    Adds a 5th level (PML5) for 57-bit virtual address space (128 PB).
    Used by servers with very large memory configurations.
```

### 6.4 The Translation Lookaside Buffer (TLB)

Walking a 4-level page table for every memory access would add ~400 ns of latency (4 memory
accesses at 100 ns each). The TLB is a small, very fast cache of recent virtual-to-physical
translations.

```
    TLB (Translation Lookaside Buffer)
    ===================================

    +-------------------+-------------------+---+---+---+
    | Virtual Page Num  | Physical Frame Num| V | D | A |
    +-------------------+-------------------+---+---+---+
    | 0x7F3AB004        | 0x1A3F00          | 1 | 0 | 1 |
    | 0x7F3AB005        | 0x002300          | 1 | 1 | 1 |
    | 0x55AA10C2        | 0x8F1200          | 1 | 0 | 1 |
    | ...               | ...               |   |   |   |
    +-------------------+-------------------+---+---+---+

    TLB HIT (1-2 cycles):
    Virtual addr --> TLB lookup --> Physical frame found --> Access memory

    TLB MISS (hundreds of cycles):
    Virtual addr --> TLB lookup --> MISS! --> Walk page table (4 memory
    accesses) --> Load translation into TLB --> Retry access

    Typical TLB sizes:
    +----------+--------+---------+--------------+
    | Level    | Entries| Assoc.  | Page Sizes   |
    +----------+--------+---------+--------------+
    | L1 ITLB  | 64-128 | 4-8 way| 4KB          |
    | L1 DTLB  | 64-96  | 4-way  | 4KB          |
    | L2 TLB   | 1024-  | 6-12   | 4KB, 2MB     |
    |           | 2048   | way    |              |
    +----------+--------+---------+--------------+

    Coverage (L1 DTLB, 64 entries, 4KB pages):
    64 * 4KB = 256 KB of memory addressable without TLB miss
    With 2MB huge pages: 64 * 2MB = 128 MB !
```

### 6.5 Page Faults

A page fault occurs when the CPU accesses a virtual page that is not currently in physical
memory. The OS must handle it:

```
    PAGE FAULT HANDLING
    ===================

    1. CPU accesses virtual address 0x1234000
    2. Page table entry found: Present bit = 0 (not in RAM!)
    3. CPU raises PAGE FAULT exception
    4. OS page fault handler runs:

       +--------------------+
       | Is the address     |--NO--> Segmentation Fault (SIGSEGV)
       | valid for this     |        Process killed
       | process?           |
       +--------+-----------+
                | YES
                v
       +--------+-----------+
       | Is a free physical |--NO--> Evict a page (LRU/Clock algorithm)
       | frame available?   |        Write to swap if dirty
       +--------+-----------+
                | YES
                v
       +--------+-----------+
       | Load page from     |  Sources:
       | backing store      |  - Swap partition (previously evicted)
       |                    |  - Executable file (code pages)
       |                    |  - Zero-fill (new heap/stack pages)
       +--------+-----------+
                |
                v
       +--------+-----------+
       | Update page table  |  Set present bit = 1
       | entry              |  Set frame number
       +--------+-----------+
                |
                v
       Restart the faulting instruction (CPU re-executes it)
```

### 6.6 Huge Pages (Large Pages)

Standard 4 KB pages mean a 1 GB working set needs 262,144 page table entries. TLB coverage
is limited. **Huge pages** (2 MB or 1 GB on x86) dramatically reduce TLB pressure:

```
    HUGE PAGES: Fewer TLB entries, more coverage
    =============================================

    4 KB pages:    1 GB working set = 262,144 pages = 262,144 TLB entries needed
    2 MB pages:    1 GB working set = 512 pages     = 512 TLB entries needed
    1 GB pages:    1 GB working set = 1 page        = 1 TLB entry needed!

    Linux usage:
    // Transparent Huge Pages (THP) -- automatic
    // The kernel merges contiguous 4KB pages into 2MB pages when possible

    // Explicit huge pages via mmap:
    void *ptr = mmap(NULL, size,
                     PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);

    // Or via madvise:
    madvise(ptr, size, MADV_HUGEPAGE);

    Tradeoffs:
    + Fewer TLB misses (huge performance win for large datasets)
    + Less page table memory
    - Internal fragmentation (allocating 2MB even if you need 8KB)
    - Harder to find contiguous physical memory
    - Longer page fault handling time
```

### 6.7 NUMA (Non-Uniform Memory Access)

In multi-socket servers, each CPU socket has its own local memory. Accessing another
socket's memory is slower (takes a hop across the interconnect).

```
    NUMA ARCHITECTURE (2-socket server)
    ====================================

    +----------------------------------+     +----------------------------------+
    |          SOCKET 0                |     |          SOCKET 1                |
    |                                  |     |                                  |
    |  +------+  +------+  +------+   |     |  +------+  +------+  +------+   |
    |  |Core 0|  |Core 1|  |Core 2|   |     |  |Core 4|  |Core 5|  |Core 6|   |
    |  +------+  +------+  +------+   |     |  +------+  +------+  +------+   |
    |  +------+  +------+  +------+   |     |  +------+  +------+  +------+   |
    |  |Core 3|  |  IMC |  |  L3  |   |     |  |Core 7|  |  IMC |  |  L3  |   |
    |  +------+  +------+  +------+   |     |  +------+  +------+  +------+   |
    |               |                  |     |               |                  |
    |          +----+-----+            |     |          +----+-----+            |
    |          | LOCAL     |            |     |          | LOCAL     |            |
    |          | MEMORY    |            |     |          | MEMORY    |            |
    |          | (32 GB)   |            |     |          | (32 GB)   |            |
    |          +-----------+            |     |          +-----------+            |
    |                                  |     |                                  |
    +----------------+-----------------+     +----------------+-----------------+
                     |          INTERCONNECT (QPI/UPI)        |
                     +========================================+

    Access latencies:
    +----------------------------+------------+
    | Access Type                | Latency    |
    +----------------------------+------------+
    | Local memory (same socket) | ~80 ns     |
    | Remote memory (other sock) | ~140 ns    |
    +----------------------------+------------+

    Remote access is ~1.5-2x slower!

    NUMA-aware programming:
    // Linux: pin thread to a specific NUMA node
    numactl --cpunodebind=0 --membind=0 ./my_program

    // In code:
    #include <numa.h>
    void *ptr = numa_alloc_onnode(size, node_id);
```

> **Key Takeaway**
> Virtual memory provides process isolation and the illusion of a large contiguous address
> space, but at a cost: every memory access requires an address translation. The TLB caches
> translations to keep this fast. For large working sets, huge pages are essential to avoid
> TLB thrashing. On multi-socket systems, NUMA awareness can mean the difference between
> 80 ns and 140 ns memory access -- a 75% penalty for getting it wrong.

---

## 7. Modern CPU Features

### 7.1 Simultaneous Multithreading (SMT) / Hyper-Threading

A single CPU core has many execution units, but one thread rarely keeps them all busy (due
to cache misses, dependencies, branch mispredictions). SMT runs two (or more) hardware
threads on one core, sharing execution units.

```
    SIMULTANEOUS MULTITHREADING (SMT / Hyper-Threading)
    ====================================================

    WITHOUT SMT (single thread per core):

    Execution Units:  ALU1  ALU2  FPU   LOAD  STORE
    Cycle 1:          [I1]  [  ]  [  ]  [I2]  [  ]    <-- 2/5 units busy
    Cycle 2:          [  ]  [  ]  [I3]  [  ]  [  ]    <-- 1/5 units busy
    Cycle 3:          [I4]  [I5]  [  ]  [  ]  [  ]    <-- 2/5 units busy
    Average utilization: ~33%

    WITH SMT (2 threads per core):

    Execution Units:  ALU1  ALU2  FPU   LOAD  STORE
    Cycle 1:          [A1]  [B1]  [B2]  [A2]  [B3]    <-- 5/5 busy!
    Cycle 2:          [B4]  [A3]  [A4]  [B5]  [A5]    <-- 5/5 busy!
    Cycle 3:          [A6]  [A7]  [B6]  [B7]  [A8]    <-- 5/5 busy!
    Average utilization: ~80-90%

    Thread A and Thread B SHARE:
    - Execution units (ALU, FPU, load/store)
    - Caches (L1, L2)
    - Branch predictor entries
    - TLB entries

    Thread A and Thread B have SEPARATE:
    - Architectural register sets
    - Program counters
    - Return address stacks
    - Some predictor state

    Typical SMT performance gain: 20-30% total throughput increase
    (NOT 2x, because threads compete for shared resources)

    SMT implementations:
    +---------------------+-------------------+
    | Vendor              | Threads per core  |
    +---------------------+-------------------+
    | Intel (Hyper-Thread)| 2 (most models)   |
    | AMD (SMT)           | 2                 |
    | IBM POWER10         | 4 or 8            |
    | Sun/Oracle SPARC T5 | 8                 |
    | Apple M-series      | 0 (no SMT!)       |
    +---------------------+-------------------+
```

### 7.2 SIMD: Single Instruction, Multiple Data

Instead of operating on one number at a time, SIMD instructions operate on a _vector_ of
numbers simultaneously.

```
    SCALAR vs. SIMD ADDITION
    ========================

    SCALAR (one add at a time):
    A[0] + B[0] = C[0]    cycle 1
    A[1] + B[1] = C[1]    cycle 2
    A[2] + B[2] = C[2]    cycle 3
    A[3] + B[3] = C[3]    cycle 4

    SIMD (four adds at once, SSE with 128-bit registers):
    +--------+--------+--------+--------+
    | A[0]   | A[1]   | A[2]   | A[3]   |   128-bit register
    +--------+--------+--------+--------+
        +        +        +        +
    +--------+--------+--------+--------+
    | B[0]   | B[1]   | B[2]   | B[3]   |   128-bit register
    +--------+--------+--------+--------+
        =        =        =        =
    +--------+--------+--------+--------+
    | C[0]   | C[1]   | C[2]   | C[3]   |   128-bit register
    +--------+--------+--------+--------+

    One instruction, one cycle, FOUR results!
```

**x86 SIMD instruction set evolution:**

```
    SIMD EVOLUTION ON x86
    =====================

    +----------+------+-------------+----------------------------------+
    | Name     | Year | Width       | Key Features                     |
    +----------+------+-------------+----------------------------------+
    | MMX      | 1997 | 64-bit      | Integer only, shared FP regs     |
    | SSE      | 1999 | 128-bit     | 4x float, new XMM registers      |
    | SSE2     | 2001 | 128-bit     | 2x double, integer on XMM        |
    | SSE3     | 2004 | 128-bit     | Horizontal ops, complex math     |
    | SSE4     | 2006 | 128-bit     | String ops, dot product           |
    | AVX      | 2011 | 256-bit     | 8x float, 4x double, YMM regs   |
    | AVX2     | 2013 | 256-bit     | Integer on 256-bit, FMA, gather  |
    | AVX-512  | 2017 | 512-bit     | 16x float, 8x double, mask regs |
    | AMX      | 2023 | Tile-based  | Matrix multiply (AI workloads)   |
    +----------+------+-------------+----------------------------------+

    Register widths:
    XMM0-XMM15:   128-bit  (SSE)
    YMM0-YMM15:   256-bit  (AVX, lower 128 = XMM)
    ZMM0-ZMM31:   512-bit  (AVX-512, lower 256 = YMM)

    +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+
    |                              ZMM0 (512-bit)                                   |
    |                   +----+----+----+----+----+----+----+----+                    |
    |                   |         YMM0 (256-bit)             |                      |
    |                   |    +----+----+----+----+           |                      |
    |                   |    |  XMM0 (128-bit)  |           |                      |
    +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+
```

**SIMD code example (C with intrinsics):**

```c
#include <immintrin.h>

// Add two arrays of 8 floats using AVX
void add_arrays_avx(float *a, float *b, float *c, int n) {
    for (int i = 0; i < n; i += 8) {
        __m256 va = _mm256_load_ps(&a[i]);   // load 8 floats from a
        __m256 vb = _mm256_load_ps(&b[i]);   // load 8 floats from b
        __m256 vc = _mm256_add_ps(va, vb);   // add 8 pairs at once
        _mm256_store_ps(&c[i], vc);          // store 8 results to c
    }
}

// Without SIMD (scalar):
void add_arrays_scalar(float *a, float *b, float *c, int n) {
    for (int i = 0; i < n; i++) {
        c[i] = a[i] + b[i];                 // one at a time
    }
}

// AVX version: ~8x throughput improvement for this operation
```

### 7.3 Hardware Prefetching

The CPU automatically detects sequential and strided access patterns and fetches cache lines
before they are needed:

```
    HARDWARE PREFETCHING
    ====================

    Sequential access pattern detected:
    Access: [Line 0] [Line 1] [Line 2] [Line 3] ...
    Prefetch:                           ^-- Hardware starts prefetching
                                            Line 4, 5, 6 ahead of time

    Stride pattern detected:
    Access: [Line 0] [Line 8] [Line 16] [Line 24] ...
    Prefetch:                            ^-- Detects stride of 8 lines
                                             Prefetches Line 32, 40, etc.

    Prefetchers in a modern CPU (Intel):
    +---------------------+----------------------------------+
    | Prefetcher          | What it detects                  |
    +---------------------+----------------------------------+
    | L1 Streamer         | Sequential/strided in L1-D       |
    | L1 IP-based         | Per-instruction access patterns  |
    | L2 Streamer         | Sequential streams into L2       |
    | L2 Adjacent Line    | Prefetches next cache line       |
    +---------------------+----------------------------------+

    Software prefetch hints:
    __builtin_prefetch(&data[i + 64], 0, 3);  // GCC
    _mm_prefetch(&data[i + 64], _MM_HINT_T0); // SSE intrinsic

    // Arguments: address, read(0)/write(1), temporal locality (0=none, 3=high)
```

### 7.4 Memory Ordering and Barriers

Modern CPUs reorder memory operations for performance. On x86, the model is relatively
strong (Total Store Ordering), but other architectures (ARM, RISC-V) have weaker models.

```
    MEMORY ORDERING MODELS
    ======================

    What the programmer wrote:     What the CPU might actually do:

    Store A = 1                    Store B = 2   (reordered!)
    Store B = 2                    Store A = 1
    Load  X = C                    Load  X = C
    Load  Y = D                    Load  Y = D   (loads not reordered on x86)

    x86 (TSO - Total Store Ordering):
    - Loads are NOT reordered with other loads     (Load-Load: ordered)
    - Stores are NOT reordered with other stores   (Store-Store: ordered)
    - Loads are NOT reordered with older stores     (Load after Store: ordered)
    - Stores CAN be reordered with older loads     (Store after Load: may reorder!)
    - Summary: Only Store-Load reordering is allowed

    ARM / RISC-V (Weak ordering):
    - ALL reorderings are possible unless you use explicit barriers
    - Load-Load, Load-Store, Store-Load, Store-Store all can reorder

    MEMORY BARRIERS (FENCES):

    x86:
    MFENCE  -- full fence (prevents all reordering across the fence)
    SFENCE  -- store fence (orders stores only)
    LFENCE  -- load fence (orders loads only, also serializes execution)

    ARM:
    DMB     -- data memory barrier
    DSB     -- data synchronization barrier
    ISB     -- instruction synchronization barrier

    C/C++ atomic operations:
    std::atomic<int> x;
    x.store(42, std::memory_order_release);    // all prior writes visible
    int val = x.load(std::memory_order_acquire); // all subsequent reads see latest
    std::atomic_thread_fence(std::memory_order_seq_cst); // full fence
```

### 7.5 Modern CPU Core: Putting It All Together

```
    MODERN CPU CORE (simplified block diagram)
    ===========================================

    +------------------------------------------------------------------+
    |                         FRONT END                                 |
    |  +------------+   +------------+   +-------------+               |
    |  | Branch     |-->| Instruction|-->| Instruction  |              |
    |  | Predictor  |   | Fetch Unit |   | Decode       |              |
    |  | (TAGE+)    |   | (L1-I $)   |   | (4-6 wide)   |              |
    |  +------------+   +------------+   +------+-------+              |
    |                                           |                      |
    |                                    +------v-------+              |
    |                                    | Micro-op     |              |
    |                                    | Queue/Cache  |              |
    |                                    +------+-------+              |
    +------------------------------------------------------------------+
                                                |
    +------------------------------------------------------------------+
    |                       EXECUTION ENGINE                            |
    |  +-------------+   +------------------+                          |
    |  | Register    |-->| Reorder Buffer   |                          |
    |  | Rename (RAT)|   | (224-630 entries)|                          |
    |  +-------------+   +--------+---------+                          |
    |                             |                                    |
    |  +----------+----------+----------+----------+----------+        |
    |  |   RS 0   |   RS 1   |   RS 2   |   RS 3   |   RS 4   |       |
    |  +----+-----+----+-----+----+-----+----+-----+----+-----+       |
    |       |          |          |          |          |               |
    |  +----v---+ +----v---+ +----v---+ +----v---+ +----v---+          |
    |  | INT    | | INT    | | FP/VEC | | LOAD   | | STORE  |          |
    |  | ALU 0  | | ALU 1  | | UNIT   | | UNIT   | | UNIT   |          |
    |  | +MUL   | | +DIV   | | +SIMD  | | (2-3   | | (1-2   |          |
    |  +--------+ +--------+ +--------+ | ports)  | | ports) |          |
    |                                   +--------+ +--------+          |
    +------------------------------------------------------------------+
                                                |
    +------------------------------------------------------------------+
    |                        MEMORY SUBSYSTEM                           |
    |  +--------+     +--------+     +---------+                       |
    |  | L1-D $ |---->| L2 $   |---->| L3 $    |----> DRAM             |
    |  | 32-48KB|     |256KB-  |     | 8-64 MB |     (Memory           |
    |  | 4-5 cyc|     | 2MB    |     | 30-50   |      Controller)      |
    |  |        |     |12 cyc  |     | cyc     |                       |
    |  +--------+     +--------+     +---------+                       |
    |  +--------+     +--------+                                       |
    |  | L1 DTLB|     | L2 TLB |                                       |
    |  | 64-96  |     | 1024-  |                                       |
    |  | entries|     | 2048   |                                       |
    |  +--------+     +--------+                                       |
    +------------------------------------------------------------------+
```

> **Key Takeaway**
> Modern CPUs are massively parallel machines at the instruction level. SMT squeezes more
> utilization from execution units. SIMD processes 4-16 data elements per instruction.
> Hardware prefetching hides memory latency for predictable patterns. Memory ordering rules
> ensure correct multithreaded behavior but vary dramatically between x86 and ARM -- code
> that works on x86 may break on ARM due to weaker ordering guarantees.

---

## 8. x86 vs. ARM vs. RISC-V: ISA Comparison

### 8.1 CISC vs. RISC Philosophy

The two fundamental approaches to instruction set design:

```
    CISC vs. RISC PHILOSOPHY
    ========================

    CISC (Complex Instruction Set Computer):
    "Give the programmer powerful, complex instructions"

    + Fewer instructions needed per program (higher code density)
    + Complex operations in a single instruction (e.g., REP MOVSB)
    - Variable-length instructions (hard to decode in parallel)
    - Complex instructions take many cycles
    - Modern CISC CPUs decode to micro-ops internally (RISC-like core)

    Example: x86 "REP MOVSB" -- copies a block of memory in one instruction
    (internally, the CPU breaks this into many micro-operations)

    RISC (Reduced Instruction Set Computer):
    "Keep instructions simple and uniform"

    + Fixed-length instructions (easy to decode in parallel)
    + Simple instructions complete in 1 cycle
    + Easier to pipeline and optimize
    - More instructions needed per program (lower code density)
    - Load/store architecture (cannot operate directly on memory)

    Example: ARM -- to add a value in memory to a register:
    LDR  R1, [R2]      ; load from memory into register
    ADD  R0, R0, R1    ; add registers
    (Two simple instructions instead of one complex one)
```

### 8.2 x86 / x86-64 (Intel, AMD)

```
    x86-64 ARCHITECTURE OVERVIEW
    ============================

    History:
    1978: Intel 8086 (16-bit)
    1985: Intel 80386 (32-bit, "IA-32")
    2003: AMD64 / x86-64 (64-bit, by AMD!)
    2024: Intel APX (extended registers, new features)

    Key characteristics:
    - CISC design (variable-length instructions, 1-15 bytes)
    - Internally decoded to micro-ops (RISC-like execution)
    - 16 general-purpose registers (RAX-R15), 64-bit
    - Rich SIMD: SSE, AVX, AVX2, AVX-512
    - Backward compatible back to 1978 (can still run 8086 code!)
    - Complex addressing modes: [base + index*scale + displacement]

    Registers:
    +--------+--------+--------+--------+
    | 64-bit | 32-bit | 16-bit | 8-bit  |
    +--------+--------+--------+--------+
    | RAX    | EAX    | AX     | AL, AH |
    | RBX    | EBX    | BX     | BL, BH |
    | RCX    | ECX    | CX     | CL, CH |
    | RDX    | EDX    | DX     | DL, DH |
    | RSI    | ESI    | SI     | SIL    |
    | RDI    | EDI    | DI     | DIL    |
    | RSP    | ESP    | SP     | SPL    |
    | RBP    | EBP    | BP     | BPL    |
    | R8-R15 | R8D..  | R8W..  | R8B..  |
    +--------+--------+--------+--------+

    Instruction encoding (variable length, 1-15 bytes):
    +--------+--------+--------+--------+-----+-----+----------+
    | Prefix | REX    | Opcode | ModR/M | SIB | Disp| Immediate|
    | (opt)  | (opt)  | 1-3B   | (opt)  |(opt)|(opt)| (opt)    |
    +--------+--------+--------+--------+-----+-----+----------+

    Strengths:
    - Massive software ecosystem (Windows, Linux, most server software)
    - Highest single-thread performance (Intel/AMD compete fiercely)
    - Richest SIMD support (AVX-512)
    - Excellent backward compatibility

    Weaknesses:
    - High power consumption (complex decoder, compatibility baggage)
    - Variable-length instructions complicate parallel decode
    - Patent/licensing complexity
```

### 8.3 ARM (Arm Holdings)

```
    ARM ARCHITECTURE OVERVIEW
    =========================

    History:
    1985: ARM1 (Acorn RISC Machine)
    1990: ARM Ltd. founded (licensing model)
    2011: ARMv8-A (64-bit, "AArch64")
    2021: ARMv9 (SVE2, security extensions)
    2020: Apple M1 proves ARM can match/beat x86 performance

    Key characteristics:
    - RISC design (fixed 32-bit instructions in AArch64)
    - Load/store architecture (no memory operands in ALU instructions)
    - 31 general-purpose registers (X0-X30), 64-bit
    - Conditional execution (predicated instructions)
    - NEON (128-bit SIMD) + SVE/SVE2 (scalable vector, 128-2048 bit)
    - Licensing model: Arm designs, others manufacture

    Registers:
    +--------+--------+----------------------------------+
    | 64-bit | 32-bit | Purpose                          |
    +--------+--------+----------------------------------+
    | X0-X7  | W0-W7  | Arguments and return values      |
    | X8     | W8     | Indirect result location          |
    | X9-X15 | W9-W15 | Temporary (caller-saved)          |
    | X16-X17|W16-W17 | Intra-procedure call scratch     |
    | X18    | W18    | Platform register                 |
    | X19-X28|W19-W28 | Callee-saved                     |
    | X29    | W29    | Frame pointer                     |
    | X30    | W30    | Link register (return address)    |
    | SP     | WSP    | Stack pointer                     |
    | XZR    | WZR    | Zero register (reads as 0)        |
    | PC     | --     | Program counter (not GP register) |
    +--------+--------+----------------------------------+

    Instruction encoding (fixed 32-bit):
    +--------+--------+--------+--------+
    |  31-28 |  27-25 |  24-21 |  20-0  |
    | Cond   | Op     | Opcode | Operands|
    +--------+--------+--------+--------+
    Every instruction is exactly 4 bytes. Easy to decode in parallel.

    Strengths:
    - Excellent performance per watt (dominates mobile, growing in servers)
    - Clean ISA design (no legacy baggage)
    - Fixed-length instructions enable wide decode
    - SVE: vector-length-agnostic SIMD (code works on any vector width)
    - Apple Silicon: M1/M2/M3/M4 prove desktop/laptop viability

    Weaknesses:
    - Smaller server software ecosystem (growing rapidly)
    - Lower code density than x86 for some workloads
    - Weak memory ordering (harder to write correct concurrent code)
    - Licensing fragmentation (many different implementations)
```

### 8.4 RISC-V (Open Standard)

```
    RISC-V ARCHITECTURE OVERVIEW
    ============================

    History:
    2010: Created at UC Berkeley
    2015: RISC-V Foundation established
    2019: Ratified base ISA specifications
    2024: Growing commercial adoption (SiFive, StarFive, Qualcomm)

    Key characteristics:
    - Open-source ISA (no licensing fees, anyone can implement)
    - Modular design: base ISA + optional extensions
    - Clean-slate RISC design (no backward compatibility burden)
    - 32 general-purpose registers (x0-x31), x0 hardwired to 0
    - Fixed 32-bit base instructions + 16-bit compressed extension (C)
    - Vector extension (V): similar to ARM SVE, length-agnostic

    Base ISA variants:
    +--------+----------------------------------+
    | Name   | Description                      |
    +--------+----------------------------------+
    | RV32I  | 32-bit base integer              |
    | RV64I  | 64-bit base integer              |
    | RV128I | 128-bit base integer (draft)     |
    +--------+----------------------------------+

    Standard extensions:
    +------+----------------------------------+
    | Ext  | Description                      |
    +------+----------------------------------+
    | M    | Integer multiply/divide          |
    | A    | Atomic operations                |
    | F    | Single-precision floating point  |
    | D    | Double-precision floating point  |
    | C    | Compressed (16-bit) instructions |
    | V    | Vector (scalable SIMD)           |
    | B    | Bit manipulation                 |
    | H    | Hypervisor                       |
    +------+----------------------------------+

    "RV64GC" = RV64I + M + A + F + D + C (General purpose + Compressed)
    This is the "standard" configuration for Linux-capable RISC-V chips.

    Registers:
    +--------+--------+----------------------------------+
    | Name   | ABI    | Purpose                          |
    +--------+--------+----------------------------------+
    | x0     | zero   | Hardwired zero                   |
    | x1     | ra     | Return address                   |
    | x2     | sp     | Stack pointer                    |
    | x3     | gp     | Global pointer                   |
    | x4     | tp     | Thread pointer                   |
    | x5-x7  | t0-t2  | Temporaries                      |
    | x8     | s0/fp  | Saved register / Frame pointer   |
    | x9     | s1     | Saved register                   |
    | x10-x11| a0-a1  | Arguments / Return values        |
    | x12-x17| a2-a7  | Arguments                        |
    | x18-x27| s2-s11 | Saved registers                  |
    | x28-x31| t3-t6  | Temporaries                      |
    +--------+--------+----------------------------------+

    Strengths:
    - Completely open (no patents, no licensing fees)
    - Clean, modern design (learned from 40 years of ISA history)
    - Highly modular (customize for your use case)
    - Growing ecosystem (Linux, GCC, LLVM, QEMU all support it)
    - Ideal for embedded, IoT, education, and custom accelerators

    Weaknesses:
    - No high-performance implementations yet matching Apple/Intel/AMD
    - Fragmentation risk (too many optional extensions)
    - Immature software ecosystem compared to x86/ARM
    - Specification still evolving in some areas
```

### 8.5 Head-to-Head Comparison

```
    ISA COMPARISON TABLE
    ====================

    +---------------------+-----------------+-----------------+-----------------+
    | Feature             | x86-64          | ARM (AArch64)   | RISC-V (RV64)   |
    +---------------------+-----------------+-----------------+-----------------+
    | Type                | CISC            | RISC            | RISC            |
    | Instruction length  | 1-15 bytes      | 4 bytes (fixed) | 4B (+ 2B compr.)|
    | GP Registers        | 16              | 31              | 31 (+ zero reg)  |
    | SIMD Registers      | 32 (ZMM 512b)  | 32 (128b NEON)  | 32 (V ext, var.) |
    | Addressing modes    | Complex         | Simple          | Simple          |
    | Condition codes     | FLAGS register  | NZCV flags      | No flags!       |
    | Branch approach     | Compare + Jump  | Compare + Jump  | Compare + Branch|
    | Licensing           | Intel/AMD only  | Arm licenses    | Open (free!)    |
    | Decode complexity   | Very High       | Low             | Low             |
    | Code density        | Good            | Good            | Good (with C)   |
    | Memory ordering     | Strong (TSO)    | Weak            | Weak (RVWMO)    |
    | Endianness          | Little          | Bi (usually LE) | Little          |
    | Peak perf (2024)    | Very High       | Very High       | Moderate        |
    | Power efficiency    | Moderate        | Excellent       | Good            |
    +---------------------+-----------------+-----------------+-----------------+
```

### 8.6 The Current Landscape (2024-2025)

```
    WHERE EACH ISA DOMINATES
    ========================

    +------------------+----------------------------------------------------+
    | Segment          | Dominant ISA | Notes                               |
    +------------------+--------------+-------------------------------------+
    | Smartphones      | ARM          | 99%+ share, Snapdragon/Exynos/etc. |
    | Tablets           | ARM          | Apple iPad, Android tablets         |
    | Laptops          | x86 + ARM    | x86 still leads, Apple M-series    |
    |                  |              | growing, Snapdragon X Elite         |
    | Desktops         | x86          | Gaming, workstations               |
    | Servers          | x86 + ARM    | x86 dominates, ARM growing fast    |
    |                  |              | (AWS Graviton, Ampere, NVIDIA Grace)|
    | Supercomputers   | x86 + ARM    | Fugaku (ARM), most others x86+GPU |
    | Embedded/IoT     | ARM + RISC-V | ARM dominates, RISC-V growing fast |
    | AI Accelerators  | Custom       | Custom ISAs (TPU, etc.) + ARM host |
    | Networking       | ARM + RISC-V | RISC-V gaining in SmartNICs        |
    | Automotive       | ARM + RISC-V | RISC-V mandated by some OEMs       |
    +------------------+--------------+-------------------------------------+

    Key trends:
    1. ARM is eating into x86 server market (AWS Graviton offers 40% better
       price-performance for many workloads)
    2. Apple proved ARM can match x86 at the high end with M-series chips
    3. RISC-V is the fastest-growing ISA in embedded/IoT
    4. x86 remains king for legacy software compatibility and peak ST perf
    5. Heterogeneous computing (CPU+GPU+accelerator) matters more than ISA
```

> **Key Takeaway**
> The CISC vs. RISC debate is largely academic in 2025. Modern x86 CPUs decode CISC
> instructions into RISC-like micro-ops internally, so both approaches converge at the
> execution level. What matters in practice is the implementation quality (Apple M-series,
> Intel, AMD), the software ecosystem, and power efficiency requirements. RISC-V is the
> exciting newcomer -- open-source, modular, and growing fast, but not yet competitive
> at the high-performance end. For CPU/GPU programming, understanding the memory model
> differences (strong x86 TSO vs. weak ARM/RISC-V ordering) is more important than the
> ISA itself.

---

## Summary: The Full Picture

```
    HOW A MODERN CPU EXECUTES YOUR CODE
    ====================================

    Your C/C++ code
         |
         v
    [Compiler] --> Machine code (x86/ARM/RISC-V instructions)
         |
         v
    +----+----------------------------------------------------+
    |              FRONT END                                   |
    |  Branch Predictor --> Instruction Fetch --> Decode        |
    |  (TAGE predictor)    (L1-I cache)         (to micro-ops) |
    +---------------------------+------------------------------+
                                |
    +---------------------------v------------------------------+
    |              OUT-OF-ORDER ENGINE                          |
    |  Register Rename --> Reservation Stations --> Execute     |
    |  (eliminate false   (wait for operands)    (ALU, FPU,    |
    |   dependencies)                             SIMD, Load,  |
    |                                             Store units) |
    |  Reorder Buffer (commit results in program order)        |
    +---------------------------+------------------------------+
                                |
    +---------------------------v------------------------------+
    |              MEMORY HIERARCHY                             |
    |  L1 Cache (1ns) --> L2 (5ns) --> L3 (20ns) --> DRAM     |
    |  TLB (virtual to physical translation)          (100ns)  |
    |  Prefetchers (detect patterns, fetch ahead)              |
    +----------------------------------------------------------+
```

Every optimization technique we will study in the rest of this guide -- SIMD vectorization,
cache-friendly data layouts, lock-free programming, GPU offloading -- exploits one or more
of these architectural features. The hardware _wants_ to run your code fast; you just need
to write code that works _with_ the architecture instead of against it.

---

## Common Interview Questions

### Fundamentals

**Q1: Explain the fetch-decode-execute cycle.**
A: The CPU repeatedly (1) fetches the instruction at the address in the Program Counter from
memory, (2) decodes the instruction to determine the operation and operands, (3) executes
the operation in the ALU, and (4) writes the result back to a register or memory. The PC
is then advanced to the next instruction and the cycle repeats.

**Q2: What is the von Neumann bottleneck? How do modern CPUs mitigate it?**
A: Instructions and data share the same memory bus, so the CPU cannot fetch an instruction
and access data simultaneously. Modern CPUs mitigate this with separate L1 instruction and
data caches (Modified Harvard architecture), multi-level cache hierarchies, hardware
prefetching, and out-of-order execution to overlap computation with memory access.

### Pipelining

**Q3: What is a pipeline hazard? Name all three types and one solution for each.**
A: (1) Data hazard (RAW dependency): solved by forwarding/bypassing. (2) Control hazard
(branch): solved by branch prediction. (3) Structural hazard (resource conflict): solved by
duplicating hardware resources (e.g., separate I-cache and D-cache).

**Q4: Why did Intel reduce pipeline depth from 31 stages (Prescott) to 14 stages (Core)?**
A: Deeper pipelines increase branch misprediction penalty (more stages to flush) and power
consumption (more pipeline registers). The 31-stage Pentium 4 Prescott suffered from both,
making it power-hungry with poor real-world performance despite high clock speeds. The
shorter pipeline of Intel Core traded clock speed for better IPC and power efficiency.

### Caches

**Q5: A programmer reports that their array processing code runs 10x slower when they change**
**the array stride from 1 to 16. Explain why.**
A: With stride 1, sequential access exploits spatial locality -- one cache line load (64
bytes) provides 16 consecutive int accesses. With stride 16, each access lands on a different
cache line, wasting 60 of the 64 bytes loaded. Additionally, the hardware prefetcher detects
sequential patterns easily but may struggle with large strides, causing more cache misses.

**Q6: What is false sharing? How do you fix it?**
A: False sharing occurs when two threads on different cores modify different variables that
happen to reside on the same cache line. Each write invalidates the other core's cache line,
causing constant cache misses despite no true data sharing. Fix by padding variables to
separate cache lines (use `alignas(64)` in C++ or `__attribute__((aligned(64)))` in GCC).

**Q7: Explain the MESI protocol. What happens when Core 0 writes to a cache line that Core 1**
**has in Shared state?**
A: MESI has four states: Modified, Exclusive, Shared, Invalid. When Core 0 writes to a
Shared line, it sends an invalidation message on the bus. Core 1's copy transitions to
Invalid. Core 0's copy transitions to Modified. If Core 1 later reads the line, it must
obtain the updated data from Core 0 (which writes back and both transition to Shared).

### Branch Prediction

**Q8: Why is sorted data faster to process than unsorted data when using conditional branches?**
A: With sorted data, branch outcomes form a predictable pattern (e.g., all true then all
false). The 2-bit saturating counter branch predictor learns this pattern and achieves nearly
100% accuracy. With unsorted data, branch outcomes appear random, and the predictor
achieves only ~50% accuracy. Each misprediction costs 15-20 cycles of pipeline flush and
restart, devastating throughput.

**Q9: What is speculative execution? What security implications does it have?**
A: The CPU executes instructions along the predicted branch path before knowing if the
prediction is correct. If wrong, results are discarded. Security implication: Spectre and
Meltdown attacks exploit speculative execution to leak data through cache side channels.
Speculated memory reads leave traces in the cache that can be measured even after the
speculation is rolled back, allowing attackers to read memory they should not have access to.

### Virtual Memory

**Q10: Why are huge pages beneficial for database workloads?**
A: Databases typically have large working sets (tens of GB). With 4 KB pages, a 10 GB
working set requires 2.6 million TLB entries, far exceeding TLB capacity (typically
1024-2048 entries at L2 TLB), causing frequent TLB misses. Each TLB miss requires a 4-level
page table walk (~400 ns). With 2 MB huge pages, the same working set needs only 5120 TLB
entries, dramatically reducing misses. With 1 GB huge pages, only 10 entries are needed.

**Q11: What is NUMA? Why does it matter for performance?**
A: NUMA (Non-Uniform Memory Access) means that in multi-socket systems, memory access time
depends on which socket the memory is physically attached to. Local memory access (~80 ns)
is ~1.7x faster than remote access (~140 ns). NUMA-aware programs allocate memory on the
same node as the thread that will access it, using APIs like `numactl` or `numa_alloc_onnode`.

### Architecture Comparison

**Q12: What is the key difference between x86 and ARM memory ordering models?**
A: x86 uses TSO (Total Store Ordering), which only allows Store-Load reordering. This means
most single-threaded lock-free algorithms "just work" on x86. ARM uses a weak memory model
where all four types of reordering (Load-Load, Load-Store, Store-Load, Store-Store) are
possible. Code that is correct on x86 may have race conditions on ARM unless explicit memory
barriers (DMB/DSB) or C++ atomic operations with appropriate memory orderings are used.

**Q13: How does a CISC (x86) CPU achieve comparable pipeline efficiency to a RISC (ARM) CPU**
**despite having variable-length instructions?**
A: Modern x86 CPUs use a "crack" or "decode" stage that translates variable-length CISC
instructions into fixed-length micro-ops (uops) internally. These micro-ops are then
processed by a RISC-like out-of-order execution engine. Additionally, x86 CPUs use a
micro-op cache (Intel DSQ/uop cache) that stores previously decoded micro-ops, bypassing
the complex decode stage on repeated execution (loops). This makes the steady-state execution
efficiency comparable to RISC designs.

---

## What is Next?

In **Chapter 02: CPU Optimization**, we will apply everything from this chapter to write
code that exploits the hardware. You will learn to:

- Use SIMD intrinsics for 4-16x throughput on data-parallel operations
- Structure data for cache-friendly access patterns
- Write branchless code that avoids misprediction penalties
- Align memory for optimal cache line and SIMD usage
- Use compiler flags and profile-guided optimization
- Measure and reason about performance with hardware counters

The architecture knowledge from this chapter is not abstract trivia -- it is the foundation
for every performance decision you will make as a CPU/GPU programmer.
