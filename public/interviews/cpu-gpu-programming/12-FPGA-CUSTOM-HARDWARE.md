# Chapter 12: FPGA Programming & Custom Hardware Accelerators

## Beyond CPUs and GPUs

We have spent the previous eleven chapters mastering CPUs and GPUs -- general-purpose processors that execute software instructions. Now we cross a fundamental boundary: **programming hardware itself**. FPGAs let you design custom circuits that execute your algorithm directly in silicon fabric, with no instruction fetch, no decode, no overhead. ASICs take this further by burning your design into permanent custom chips. This chapter covers the full spectrum from reconfigurable logic to custom silicon.

```
+------------------------------------------------------------------------+
|              THE COMPUTE SPECTRUM                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  FLEXIBILITY                                                           |
|  ^                                                                     |
|  |   CPU          GPU          FPGA           ASIC                     |
|  |   +------+     +------+     +------+       +------+                 |
|  |   |General|     |Massiv|     |Custom|       |Fixed |                 |
|  |   |Purpose|     |Parall|     |Reconf|       |Funct.|                 |
|  |   |ISA    |     |SIMT  |     |Logic |       |Design|                 |
|  |   +------+     +------+     +------+       +------+                 |
|  |                                                                     |
|  |   Most                                      Least                   |
|  |   Flexible                                  Flexible                |
|  |                                                                     |
|  +-----------------------------------------------------------> PERF/W  |
|      Lowest                                    Highest                  |
|      Perf/Watt                                 Perf/Watt               |
+------------------------------------------------------------------------+
```

---

## 12.1 What is an FPGA?

An **FPGA** (Field-Programmable Gate Array) is an integrated circuit designed to be configured by the user after manufacturing. Unlike a CPU that executes instructions sequentially, or a GPU that runs thousands of threads, an FPGA implements your algorithm as **actual digital circuits** -- custom datapaths wired together in reconfigurable fabric.

### 12.1.1 FPGA Architecture

```
+=====================================================================+
|                        FPGA CHIP ARCHITECTURE                        |
+=====================================================================+
|                                                                     |
|  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+  |
|  | I/O   |  | I/O   |  | I/O   |  | I/O   |  | I/O   |  | I/O   |  |
|  | Block  |  | Block  |  | Block  |  | Block  |  | Block  |  | Block  |  |
|  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+  |
|                                                                     |
|  +------+  +------+  +------+  +------+  +------+  +------+        |
|  | CLB  |--| CLB  |--| CLB  |--| CLB  |--| CLB  |--| CLB  |        |
|  |      |  |      |  |      |  |      |  |      |  |      |        |
|  +--||--+  +--||--+  +--||--+  +--||--+  +--||--+  +--||--+        |
|     ||        ||        ||        ||        ||        ||            |
|  +--||--+  +--||--+  +=========+  +--||--+  +--||--+  +--||--+     |
|  | CLB  |--| CLB  |--| Block   |--| CLB  |--| CLB  |--| CLB  |     |
|  |      |  |      |  | RAM     |  |      |  |      |  |      |     |
|  +--||--+  +--||--+  | (BRAM)  |  +--||--+  +--||--+  +--||--+     |
|     ||        ||     +=========+     ||        ||        ||         |
|  +--||--+  +--||--+  +--||--+  +--||--+  +--||--+  +--||--+        |
|  | CLB  |--| CLB  |--| CLB  |--| DSP  |--| CLB  |--| CLB  |        |
|  |      |  |      |  |      |  | Slice|  |      |  |      |        |
|  +--||--+  +--||--+  +--||--+  +------+  +--||--+  +--||--+        |
|     ||        ||        ||        ||        ||        ||            |
|  +--||--+  +--||--+  +--||--+  +--||--+  +=========+  +--||--+     |
|  | CLB  |--| CLB  |--| CLB  |--| CLB  |--| Block   |--| CLB  |     |
|  |      |  |      |  |      |  |      |  | RAM     |  |      |     |
|  +------+  +------+  +------+  +------+  | (BRAM)  |  +------+     |
|                                           +=========+               |
|  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+  |
|  | I/O   |  | I/O   |  | I/O   |  | I/O   |  | I/O   |  | I/O   |  |
|  | Block  |  | Block  |  | Block  |  | Block  |  | Block  |  | Block  |  |
|  +-------+  +-------+  +-------+  +-------+  +-------+  +-------+  |
|                                                                     |
|  Legend:  CLB = Configurable Logic Block                             |
|           BRAM = Block RAM     DSP = DSP Slice                      |
|           || = Programmable Routing Interconnect                     |
+=====================================================================+
```

### 12.1.2 Configurable Logic Blocks (CLBs)

The CLB is the fundamental building block of an FPGA. Each CLB contains multiple **slices**, and each slice contains:

```
CLB (Configurable Logic Block)
+-------------------+    +-------------------+
|     SLICE 0       |    |     SLICE 1       |
|  +------+  +--+   |    |  +------+  +--+   |
|  | LUT6 |->|FF|   |    |  | LUT6 |->|FF|   |
|  +------+  +--+   |    |  +------+  +--+   |
|  +------+  +--+   |    |  +------+  +--+   |
|  | LUT6 |->|FF|   |    |  | LUT6 |->|FF|   |
|  +------+  +--+   |    |  +------+  +--+   |
|  +------+  +--+   |    |  +------+  +--+   |
|  | LUT6 |->|FF|   |    |  | LUT6 |->|FF|   |
|  +------+  +--+   |    |  +------+  +--+   |
|  +------+  +--+   |    |  +------+  +--+   |
|  | LUT6 |->|FF|   |    |  | LUT6 |->|FF|   |
|  +------+  +--+   |    |  +------+  +--+   |
|  + Carry Chain     |    |  + Carry Chain     |
|  + MUX logic       |    |  + MUX logic       |
+-------------------+    +-------------------+

LUT = Look-Up Table (implements any Boolean function of 6 inputs)
FF  = Flip-Flop (stores 1 bit of state, clocked)
```

**Look-Up Tables (LUTs)**: A 6-input LUT can implement **any** Boolean function of 6 variables. It is essentially a 64-bit memory that maps every possible 6-bit input combination to a 1-bit output. Two 6-LUTs can be combined to make a 7-input function, or split into two 5-input LUTs with shared inputs.

```
6-Input LUT Truth Table (conceptual):

  Input[5:0]  |  Output
  ------------|--------
  000000      |   0
  000001      |   1
  000010      |   1
  000011      |   0
  ...         |  ...
  111111      |   1

  Any Boolean function of 6 inputs = just 64 bits of configuration
```

**Flip-Flops (FFs)**: Each LUT output can optionally pass through a flip-flop for sequential (clocked) logic. The FF captures data on the rising edge of a clock, enabling pipelines and state machines.

**Carry Chains**: Dedicated fast carry logic within each CLB for efficient arithmetic (addition, subtraction, counting) without consuming general routing resources.

### 12.1.3 Block RAM (BRAM)

Distributed throughout the FPGA fabric, Block RAMs are dedicated 36 Kbit dual-port SRAM blocks:

```
Block RAM (BRAM) - 36 Kbit Dual-Port SRAM

  Port A                    Port B
  +------+                 +------+
  | Addr |    36 Kbit      | Addr |
  | Data |    SRAM         | Data |
  | WE   |    Array        | WE   |
  | CLK  |                 | CLK  |
  +------+                 +------+

  Configurations: 32Kx1, 16Kx2, 4Kx9, 2Kx18, 1Kx36, 512x72
  Features: True dual-port, cascadable, FIFO mode, ECC
```

Modern high-end FPGAs (like AMD/Xilinx Versal or Intel Agilex) have 50+ MB of total on-chip BRAM, plus UltraRAM blocks of 288 Kbit each.

### 12.1.4 DSP Slices

DSP slices are hardened multiply-accumulate blocks:

```
DSP48E2 Slice (Xilinx):

  A[29:0] --+
             |   +---------+
             +-->| 27x18   |
  B[17:0] ----->| Multiply |--+
             +-->|         |  |   +--------+
  D[26:0] --+   +---------+  +-->|  ALU   |
                              +-->| 48-bit |-->P[47:0]
  C[47:0] -------------------+-->|        |
                              |   +--------+
  P(feedback)----------------+

  Features: Pre-adder, 27x18 multiplier, 48-bit accumulator,
  pattern detector, 700+ MHz, carry cascade
```

A single large FPGA can have 10,000+ DSP slices, delivering massive throughput for signal processing and neural network inference.

### 12.1.5 Routing Interconnects

The programmable routing network consumes roughly 50-60% of the FPGA die area. It consists of:

- **Switch Boxes**: Programmable crossbar switches at CLB intersections
- **Connection Boxes**: Connect CLB I/O to routing channels
- **Routing Channels**: Horizontal and vertical wires of varying lengths (short, medium, long)
- **Global Clock Networks**: Low-skew clock distribution trees

```
+-------+          +-------+          +-------+
| CLB   |===wire===| CLB   |===wire===| CLB   |
|       |    ||    |       |    ||    |       |
+---+---+    ||    +---+---+    ||    +---+---+
    ||    +--++--+     ||    +--++--+     ||
    ||    |Switch|     ||    |Switch|     ||
    ||    | Box  |     ||    | Box  |     ||
    ||    +--++--+     ||    +--++--+     ||
+---+---+    ||    +---+---+    ||    +---+---+
| CLB   |===wire===| CLB   |===wire===| CLB   |
|       |    ||    |       |    ||    |       |
+-------+          +-------+          +-------+

  === Horizontal routing channel
  ||  Vertical routing channel
```

### 12.1.6 FPGA vs CPU vs GPU vs ASIC

| Feature         | CPU             | GPU              | FPGA              | ASIC              |
|-----------------|-----------------|------------------|--------------------|-------------------|
| Architecture    | Sequential +    | SIMT, thousands  | Reconfigurable     | Fixed-function    |
|                 | superscalar     | of cores         | logic fabric       | custom circuit    |
| Programming     | C/C++, Rust     | CUDA, OpenCL     | Verilog/VHDL, HLS  | Verilog/VHDL      |
| Clock Speed     | 3-6 GHz         | 1-2.5 GHz        | 200-900 MHz        | Up to 5+ GHz     |
| Parallelism     | 8-128 cores     | 1000s SMs        | Fully custom        | Fully custom      |
| Reconfigurable  | Yes (software)  | Yes (software)   | Yes (bitstream)     | No (fixed)        |
| Time to Market  | Days            | Days-Weeks       | Weeks-Months        | 1-3 years         |
| Power Eff.      | Low-Medium      | Medium            | High                | Highest           |
| Unit Cost       | $50-$10K        | $200-$40K        | $20-$50K            | $1-$100 (volume)  |
| NRE Cost        | ~$0             | ~$0              | ~$0                 | $5M-$500M         |

---

## 12.2 Why FPGAs?

### 12.2.1 Custom Data Paths

A CPU must fetch, decode, and execute every instruction. A GPU must schedule warps and manage thread divergence. An FPGA lets you build **exactly the circuit you need**:

```
CPU executing a = (b * c) + (d * e):
  +---------+  +---------+  +---------+  +---------+
  | FETCH   |->| DECODE  |->| MUL b*c |->| STORE   |
  | MUL inst|  |         |  | EXECUTE |  | temp1   |
  +---------+  +---------+  +---------+  +---------+
  +---------+  +---------+  +---------+  +---------+
  | FETCH   |->| DECODE  |->| MUL d*e |->| STORE   |
  | MUL inst|  |         |  | EXECUTE |  | temp2   |
  +---------+  +---------+  +---------+  +---------+
  +---------+  +---------+  +---------+  +---------+
  | FETCH   |->| DECODE  |->| ADD     |->| STORE   |
  | ADD inst|  |         |  | t1 + t2 |  | result  |
  +---------+  +---------+  +---------+  +---------+
  Total: ~15+ clock cycles

FPGA custom circuit for a = (b * c) + (d * e):

  b ---+
       |  +-------+
       +->| MUL   |---+
  c ---+->|       |   |   +-------+
          +-------+   +-->| ADD   |---> a
  d ---+              +-->|       |
       |  +-------+   |   +-------+
       +->| MUL   |---+
  e ---+->|       |
          +-------+

  Total: 1 clock cycle (fully pipelined)
```

### 12.2.2 Deterministic Latency

FPGAs provide **cycle-accurate, deterministic latency** -- critical for:

- **High-Frequency Trading (HFT)**: FPGAs process market data and generate orders in < 1 microsecond, compared to 5-50 us for optimized software
- **5G Base Stations**: Strict timing requirements for OFDM symbol processing
- **Motor Control**: Real-time feedback loops with zero jitter
- **Safety-Critical Systems**: Avionics, medical devices, automotive ADAS

```
Latency Comparison: Network Packet Processing

Software (CPU):
  NIC → PCIe → CPU Cache → OS Kernel → User Space → Decision → Back
  Total: 10-100 microseconds (non-deterministic)

FPGA (Direct):
  NIC → FPGA Logic → Decision → NIC
  Total: 0.5-2 microseconds (deterministic, ±1 clock cycle)
```

### 12.2.3 Power Efficiency

Because FPGAs only instantiate the logic you need (no instruction fetch, no branch prediction, no speculative execution), they achieve much better performance per watt for specific workloads:

```
Example: Video Transcoding (H.265 4K)

  CPU (Xeon 8380):    50 fps    @ 270W  = 0.19 fps/W
  GPU (A100):         200 fps   @ 300W  = 0.67 fps/W
  FPGA (Alveo U30):   128 fps   @  35W  = 3.66 fps/W
  ASIC (dedicated):   240 fps   @  15W  = 16.0 fps/W
```

### 12.2.4 Key Use Cases

| Domain | Applications |
|--------|-------------|
| **Networking & Telecom** | SmartNICs, 5G baseband, packet processing, protocol offload, firewall/DPI |
| **Finance** | Ultra-low latency trading, risk computation, market data parsing, tick-to-trade < 1us |
| **Signal Processing** | Radar/sonar, SDR, image processing, audio/video codec, medical imaging |
| **AI/ML Inference** | INT8/INT4 inference, custom neural networks, transformer acceleration, edge AI |
| **Data Center** | Database acceleration, compression/crypto, search, Microsoft Catapult |
| **Embedded/Automotive** | ADAS sensor fusion, motor control, industrial automation, robotics, aerospace |

---

## 12.3 Verilog Basics

Verilog is the most widely used **Hardware Description Language (HDL)**. Unlike software programming languages, Verilog describes circuits -- everything runs in parallel by default.

### 12.3.1 Modules, Wires, and Registers

The fundamental concepts:

```verilog
// A module is like a "component" or "chip"
module basic_example(
    input  wire        clk,      // Clock signal
    input  wire        reset,    // Reset signal
    input  wire [7:0]  data_in,  // 8-bit input bus
    output wire [7:0]  data_out, // 8-bit output (combinational)
    output reg  [7:0]  data_reg  // 8-bit output (registered)
);

// Wire: continuous assignment (combinational logic)
// Think of it as physical wires connecting components
assign data_out = data_in + 8'd1;  // Always adds 1, no clock needed

// Reg: updated in always blocks (sequential logic)
// Think of it as flip-flops that capture data on clock edges
always @(posedge clk) begin
    if (reset)
        data_reg <= 8'd0;        // Synchronous reset
    else
        data_reg <= data_in;     // Capture data_in on rising clock edge
end

endmodule
```

Key distinctions:
- **wire**: Represents physical connections. Cannot store state. Driven by `assign` statements or module outputs.
- **reg**: Represents storage elements. Updated inside `always` blocks. Does NOT necessarily synthesize to a register -- the synthesis tool decides.
- **assign**: Continuous assignment for combinational logic.
- **always @(posedge clk)**: Sequential logic triggered on rising clock edge.
- **<= (non-blocking)**: Used in sequential blocks. All assignments happen simultaneously at end of time step.
- **= (blocking)**: Used in combinational blocks. Assignments happen in order.

### 12.3.2 Example: 8-Bit Counter

```verilog
module counter_8bit(
    input  wire       clk,
    input  wire       reset,
    input  wire       enable,
    output reg  [7:0] count,
    output wire       overflow
);

// Sequential logic: counter increments on each clock edge
always @(posedge clk) begin
    if (reset)
        count <= 8'd0;
    else if (enable)
        count <= count + 8'd1;
    // else: count retains its value (implicit latch-free)
end

// Combinational logic: overflow flag
assign overflow = (count == 8'hFF) & enable;

endmodule
```

```
Timing diagram:

  clk:    _|~|_|~|_|~|_|~|_|~|_|~|_|~|_|~|_
  reset:  ~~~|_________________________________
  enable: ____|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  count:  XX  00  01  02  03  04  05  06  ...
```

### 12.3.3 Example: Parameterized Adder

```verilog
module adder #(
    parameter WIDTH = 32     // Parameterized bit width
)(
    input  wire [WIDTH-1:0]  a,
    input  wire [WIDTH-1:0]  b,
    input  wire              cin,    // Carry in
    output wire [WIDTH-1:0]  sum,
    output wire              cout    // Carry out
);

// Full adder: purely combinational
assign {cout, sum} = a + b + cin;

endmodule

// Instantiation with different widths:
// adder #(.WIDTH(16)) add16 (.a(x), .b(y), .cin(1'b0), .sum(result), .cout(carry));
// adder #(.WIDTH(64)) add64 (.a(x), .b(y), .cin(1'b0), .sum(result), .cout(carry));
```

### 12.3.4 Combinational vs Sequential Logic

```verilog
// COMBINATIONAL: output depends ONLY on current inputs
// Synthesizes to: gates, muxes, LUTs
always @(*) begin      // Sensitivity list: all inputs (*)
    case (sel)
        2'b00: out = a;
        2'b01: out = b;
        2'b10: out = c;
        2'b11: out = d;
        default: out = 4'b0;
    endcase
end

// SEQUENTIAL: output depends on current inputs AND previous state
// Synthesizes to: flip-flops + combinational logic
always @(posedge clk) begin
    if (reset) begin
        state <= IDLE;
    end else begin
        case (state)
            IDLE:    if (start) state <= RUNNING;
            RUNNING: if (done)  state <= COMPLETE;
            COMPLETE:           state <= IDLE;
            default:            state <= IDLE;
        endcase
    end
end
```

### 12.3.5 Example: Finite State Machine (FSM)

A traffic light controller demonstrating a classic Mealy/Moore FSM:

```verilog
module traffic_light(
    input  wire       clk,
    input  wire       reset,
    input  wire       sensor,    // Car sensor on side road
    output reg  [2:0] main_light, // {Red, Yellow, Green}
    output reg  [2:0] side_light
);

// State encoding
localparam MAIN_GREEN  = 3'd0;
localparam MAIN_YELLOW = 3'd1;
localparam SIDE_GREEN  = 3'd2;
localparam SIDE_YELLOW = 3'd3;

reg [2:0] state, next_state;
reg [7:0] timer, next_timer;

// Sequential: state register
always @(posedge clk) begin
    if (reset) begin
        state <= MAIN_GREEN;
        timer <= 8'd0;
    end else begin
        state <= next_state;
        timer <= next_timer;
    end
end

// Combinational: next state logic
always @(*) begin
    next_state = state;
    next_timer = timer + 8'd1;

    case (state)
        MAIN_GREEN: begin
            if (sensor && timer > 8'd60) begin
                next_state = MAIN_YELLOW;
                next_timer = 8'd0;
            end
        end
        MAIN_YELLOW: begin
            if (timer > 8'd10) begin
                next_state = SIDE_GREEN;
                next_timer = 8'd0;
            end
        end
        SIDE_GREEN: begin
            if (timer > 8'd30) begin
                next_state = SIDE_YELLOW;
                next_timer = 8'd0;
            end
        end
        SIDE_YELLOW: begin
            if (timer > 8'd10) begin
                next_state = MAIN_GREEN;
                next_timer = 8'd0;
            end
        end
        default: begin
            next_state = MAIN_GREEN;
            next_timer = 8'd0;
        end
    endcase
end

// Combinational: output logic (Moore machine)
always @(*) begin
    case (state)
        MAIN_GREEN:  begin main_light = 3'b001; side_light = 3'b100; end
        MAIN_YELLOW: begin main_light = 3'b010; side_light = 3'b100; end
        SIDE_GREEN:  begin main_light = 3'b100; side_light = 3'b001; end
        SIDE_YELLOW: begin main_light = 3'b100; side_light = 3'b010; end
        default:     begin main_light = 3'b100; side_light = 3'b100; end
    endcase
end

endmodule
```

### 12.3.6 Testbench

Testbenches are simulation-only code that drives inputs and checks outputs:

```verilog
`timescale 1ns / 1ps

module counter_8bit_tb;
    reg clk, reset, enable;
    wire [7:0] count;
    wire overflow;

    counter_8bit dut (.clk(clk), .reset(reset), .enable(enable),
                      .count(count), .overflow(overflow));

    initial clk = 0;
    always #5 clk = ~clk;   // 100 MHz clock

    initial begin
        reset = 1; enable = 0;
        #20; reset = 0;
        #10; enable = 1;
        #2560;  // Count through 256 values
        if (overflow) $display("PASS: Overflow detected");
        else          $display("FAIL: No overflow");
        enable = 0; #50;
        $display("Final count: %d", count);
        $finish;
    end
endmodule
```

---

## 12.4 VHDL Overview

VHDL (VHSIC Hardware Description Language) is the other major HDL. It is more verbose but strongly typed, favored in aerospace, defense, and European industry.

### 12.4.1 Entity and Architecture

```vhdl
-- VHDL: Entity declares the interface (like a module port list)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter_8bit is
    port (
        clk      : in  std_logic;
        reset    : in  std_logic;
        enable   : in  std_logic;
        count    : out std_logic_vector(7 downto 0);
        overflow : out std_logic
    );
end entity counter_8bit;

-- Architecture defines the behavior
architecture rtl of counter_8bit is
    signal count_reg : unsigned(7 downto 0);
begin

    -- Sequential process
    process(clk)
    begin
        if rising_edge(clk) then
            if reset = '1' then
                count_reg <= (others => '0');
            elsif enable = '1' then
                count_reg <= count_reg + 1;
            end if;
        end if;
    end process;

    -- Concurrent assignments
    count    <= std_logic_vector(count_reg);
    overflow <= '1' when (count_reg = X"FF") and (enable = '1') else '0';

end architecture rtl;
```

### 12.4.2 VHDL vs Verilog Comparison

| Feature | Verilog | VHDL |
|---------|---------|------|
| Origin | Gateway Design, 1984 | US DoD, 1983 |
| Typing | Weakly typed | Strongly typed |
| Verbosity | Concise (C-like) | Verbose (Ada/Pascal-like) |
| Case Sensitive | Yes | No |
| Industry | ASIC, consumer | Aerospace, defense |
| Modern Version | SystemVerilog | VHDL-2019 |

**SystemVerilog** is the modern evolution of Verilog, adding classes, interfaces, assertions, constrained random verification, and coverage -- it is now the industry standard for ASIC verification.

---

## 12.5 High-Level Synthesis (HLS)

HLS tools compile **C/C++ code into hardware circuits**. This dramatically lowers the barrier to FPGA programming: instead of writing Verilog/VHDL, you write C++ with special pragmas to guide the synthesis tool.

### 12.5.1 How HLS Works

```
+================================================================+
|                    HLS COMPILATION FLOW                          |
+================================================================+
|                                                                |
|  C/C++ Source Code (with pragmas)                               |
|          |                                                      |
|          v                                                      |
|  +------------------+                                           |
|  | HLS Compiler     |  1. Parse C/C++                           |
|  | (Vitis HLS /     |  2. Build CDFG (Control-Data Flow Graph)  |
|  |  Intel HLS)      |  3. Schedule operations to clock cycles   |
|  |                  |  4. Bind operations to hardware resources  |
|  |                  |  5. Generate RTL (Verilog/VHDL)           |
|  +------------------+                                           |
|          |                                                      |
|          v                                                      |
|  RTL (Verilog / VHDL)                                           |
|          |                                                      |
|          v                                                      |
|  Standard FPGA Flow (Synthesis -> P&R -> Bitstream)              |
+================================================================+
```

### 12.5.2 HLS Pragmas for Optimization

The key to HLS performance is **pragmas** that tell the compiler how to map software constructs to hardware:

```cpp
// PIPELINE: Execute loop iterations every N clock cycles (Initiation Interval)
#pragma HLS PIPELINE II=1
// Each iteration starts 1 cycle after the previous one
// Without this: iterations are sequential (one at a time)

// UNROLL: Replicate loop body to create parallel hardware
#pragma HLS UNROLL factor=4
// Creates 4 copies of the loop body running simultaneously
// Trades area (more LUTs/DSPs) for throughput

// ARRAY_PARTITION: Split arrays into multiple memory banks
#pragma HLS ARRAY_PARTITION variable=arr type=cyclic factor=4
// Allows 4 simultaneous reads/writes (vs 2 for dual-port BRAM)
// Types: complete (all elements), cyclic, block

// DATAFLOW: Enable task-level pipelining between functions
#pragma HLS DATAFLOW
// Functions execute concurrently with FIFO channels between them

// INTERFACE: Specify the hardware interface protocol
#pragma HLS INTERFACE m_axi port=input offset=slave
#pragma HLS INTERFACE s_axilite port=return
```

### 12.5.3 HLS Matrix Multiply Example

```cpp
#include <stdint.h>

// HLS Matrix Multiply: C = A * B
// Optimized with pragmas for high throughput

#define N 64  // Matrix dimension

void matmul_hls(
    const int16_t A[N][N],   // Input matrix A
    const int16_t B[N][N],   // Input matrix B
    int32_t       C[N][N]    // Output matrix C
) {
    // Partition arrays for parallel access
    #pragma HLS ARRAY_PARTITION variable=A type=cyclic factor=16 dim=2
    #pragma HLS ARRAY_PARTITION variable=B type=cyclic factor=16 dim=1
    #pragma HLS ARRAY_PARTITION variable=C type=cyclic factor=16 dim=2

    // Outer loops
    ROW_LOOP: for (int i = 0; i < N; i++) {
        COL_LOOP: for (int j = 0; j < N; j++) {
            #pragma HLS PIPELINE II=1

            int32_t sum = 0;

            ACC_LOOP: for (int k = 0; k < N; k++) {
                #pragma HLS UNROLL factor=16
                sum += (int32_t)A[i][k] * (int32_t)B[k][j];
            }

            C[i][j] = sum;
        }
    }
}
```

Approximate synthesis result (Alveo U250 @ 300 MHz): ~262K cycles latency, 9.4 GOPS throughput, using 12K LUTs (0.9%), 128 DSPs (1.0%), 48 BRAMs (1.8%).

### 12.5.4 HLS Dataflow Example

Dataflow enables **task-level parallelism** -- multiple functions run concurrently, connected by streams:

```cpp
#include "hls_stream.h"

// Stage 1: Read input data
void read_input(const int* input, hls::stream<int>& out_stream, int size) {
    for (int i = 0; i < size; i++) {
        #pragma HLS PIPELINE II=1
        out_stream.write(input[i]);
    }
}

// Stage 2: Process data
void compute(hls::stream<int>& in_stream, hls::stream<int>& out_stream, int size) {
    for (int i = 0; i < size; i++) {
        #pragma HLS PIPELINE II=1
        int val = in_stream.read();
        out_stream.write(val * val + 3 * val + 7);  // Polynomial evaluation
    }
}

// Stage 3: Write output data
void write_output(hls::stream<int>& in_stream, int* output, int size) {
    for (int i = 0; i < size; i++) {
        #pragma HLS PIPELINE II=1
        output[i] = in_stream.read();
    }
}

// Top-level function with dataflow
void pipeline_top(const int* input, int* output, int size) {
    #pragma HLS INTERFACE m_axi port=input  offset=slave bundle=gmem0
    #pragma HLS INTERFACE m_axi port=output offset=slave bundle=gmem1
    #pragma HLS INTERFACE s_axilite port=size
    #pragma HLS INTERFACE s_axilite port=return

    #pragma HLS DATAFLOW

    hls::stream<int> stream_1("input_stream");
    hls::stream<int> stream_2("compute_stream");

    read_input(input, stream_1, size);
    compute(stream_1, stream_2, size);
    write_output(stream_2, output, size);
}
```

```
Execution timeline with DATAFLOW:

  Time -->

  Without DATAFLOW (sequential):
  |-- read_input --|-- compute --|-- write_output --|
                                                    Total: 3T

  With DATAFLOW (pipelined):
  |-- read_input --|
       |-- compute --|
            |-- write_output --|
                               Total: T + small overhead

  Speedup: ~3x for long streams
```

---

## 12.6 FPGA Development Flow

### 12.6.1 Complete Development Pipeline

```
FPGA Development Flow:

  Design Entry (Verilog/VHDL/HLS)
       |
       v
  Simulation (ModelSim, Verilator) -- Verify logic correctness
       |
       v
  Synthesis (Vivado/Quartus) -- Map HDL to LUTs, FFs, BRAMs, DSPs
       |
       v
  Place & Route -- Assign logic to physical locations, route wires
       |              (Can take hours for large designs!)
       v
  Static Timing Analysis -- Verify all paths meet clock period
       |
       v
  Bitstream Generation -- Binary file (10-200 MB) to configure FPGA
       |
       v
  Program Device -- Load via JTAG, PCIe, or Flash memory
```

### 12.6.2 Synthesis Deep Dive

Synthesis translates HDL into a **netlist** of device primitives:

```
Your Verilog:                    Synthesized Result:

  assign y = (a & b) | c;       +-----+
                                 | LUT3|    (3-input lookup table)
  a ----+                        | a-->|
  b ----+---> y                  | b-->|--> y
  c ----+                        | c-->|
                                 +-----+

                                 LUT contents: 8'b11101010
                                 (truth table for (a & b) | c)
```

### 12.6.3 Place and Route

After synthesis, the tool must:
1. **Place**: Assign each logic element to a physical CLB location on the chip
2. **Route**: Connect the placed elements using the programmable routing network
3. **Optimize**: Iterate to meet timing, area, and power constraints

```
Before Place & Route:          After Place & Route:
(logical netlist)              (physical layout)

  A ---> B ---> C              +---+---+---+---+
  |             |              | A |   | B |   |
  +----> D ----+              +---+---+---+---+
                               |   |   | | |   |
                               +---+---+-+-+---+
                               |   | D |   | C |
                               +---+---+---+---+
                               Wires routed through channels
```

### 12.6.4 Timing Closure

The most challenging part of FPGA development. Every signal must propagate from one flip-flop to the next within a single clock period:

```
Setup time constraint:
  T_clk >= T_clk_to_q + T_logic + T_routing + T_setup

Example at 300 MHz (3.33 ns period):
  T_clk_to_q = 0.2 ns  (FF output delay)
  T_logic    = 1.5 ns  (3 levels of LUTs)
  T_routing  = 1.2 ns  (wire delay)
  T_setup    = 0.1 ns  (destination FF requirement)
  Total      = 3.0 ns  < 3.33 ns  --> PASS (0.33 ns slack)

If total > T_clk --> TIMING VIOLATION (negative slack)
Fix: add pipeline stages, reduce logic levels, constrain placement,
     or lower clock frequency
```

### 12.6.5 Simulation Tools

| Tool        | Type        | Speed     | Accuracy   | Free?  |
|-------------|-------------|-----------|------------|--------|
| Verilator   | Open source | Very fast | Cycle-acc. | Yes    |
| Icarus      | Open source | Moderate  | Event-sim  | Yes    |
| ModelSim    | Commercial  | Moderate  | Full HDL   | Free*  |
| Vivado Sim  | Bundled     | Moderate  | Full HDL   | Free** |
| VCS         | Commercial  | Fast      | Full HDL   | No     |
| Xcelium     | Commercial  | Fast      | Full HDL   | No     |

(*) Intel/Altera Starter Edition
(**) With Vivado WebPACK

---

## 12.7 FPGA vs GPU vs ASIC: Detailed Comparison

### 12.7.1 The Full Comparison Matrix

| Metric | GPU | FPGA | ASIC |
|--------|-----|------|------|
| Peak TOPS (INT8) | 1000+ | 100-400 | 500-2000+ |
| Power (typical) | 200-700W | 25-225W | 5-200W |
| TOPS/Watt (INT8) | 2-5 | 5-20 | 20-100 |
| Latency | us-ms | ns-us | ns |
| Deterministic | No | Yes | Yes |
| Reconfigurable | Software only | Full hardware | No |
| Dev Time | Days-Weeks | Months | 1-3 years |
| NRE Cost | ~$0 | ~$0 | $5M-$500M |
| Unit Cost (1K) | $200-$40K | $50-$50K | $1-$100 |
| Memory Bandwidth | 1-3 TB/s | 10-100 GB/s | Custom |
| Ecosystem | Excellent | Moderate | Limited |

### 12.7.2 When to Use Each

```
Decision Tree:

  Start Here
      |
      v
  Is latency critical (< 10 us)?
      |
      +-- Yes --> Is volume > 100K units?
      |               |
      |               +-- Yes --> ASIC
      |               +-- No  --> FPGA
      |
      +-- No  --> Need massive parallelism?
                      |
                      +-- Yes --> GPU
                      +-- No  --> Need custom data types/precision?
                                      |
                                      +-- Yes --> FPGA or ASIC
                                      +-- No  --> CPU (simplest)
```

### 12.7.3 Concrete Examples

| Workload | Best Choice | Reasoning |
|----------|-------------|-----------|
| Training GPT-4 scale model | GPU | Massive parallelism + ecosystem |
| HFT order execution | FPGA | Sub-us latency |
| Bitcoin mining | ASIC | Single hash function, massive volume |
| 5G baseband processing | ASIC/FPGA | Real-time + volume |
| Edge camera AI inference | FPGA | Power + latency |
| Datacenter AI inference | GPU/ASIC | Throughput |
| Network packet inspection | FPGA | Line-rate + flexibility |
| Prototyping new chip design | FPGA | Reconfigurability |

---

## 12.8 FPGA for AI

### 12.8.1 Why FPGAs for AI Inference

**GPU Approach**: Load weights into GPU memory, execute layers as CUDA kernel launches with general compute units (FP32/FP16/INT8 tensor cores). High throughput but higher latency and power (200-700W).

**FPGA Approach**: Compile model into custom hardware circuit where each layer is a dedicated pipeline stage with exact per-layer precision (2-bit, 4-bit, 8-bit, mixed). Low deterministic latency and low power (25-75W).

**FPGA advantages**: Custom quantization (not limited to INT8/FP16), sparse model acceleration (skip zero weights in hardware), streaming pipeline (no kernel launch overhead), deterministic latency, 3-10x better performance per watt.

### 12.8.2 Xilinx/AMD Vitis AI

Vitis AI is AMD's development environment for AI inference on FPGA and adaptive SoC platforms:

```
Vitis AI Flow:

  Trained Model (TF / PyTorch / ONNX)
       |
       v
  Vitis AI Quantizer -- FP32 -> INT8, calibrate, fine-tune
       |
       v
  Vitis AI Compiler -- Compile for target DPU
       |
       v
  DPU on FPGA (xmodel) -- Runs on Alveo / Versal / Zynq

DPU Architecture:
  +----------------------------------------------------+
  |  Instruction Scheduler                              |
  |  +------+ +------+ +--------+ +--------+           |
  |  | Conv | | Pool | | Eltwise| | Concat |           |
  |  |(DSP) | |(LUT) | | (DSP)  | | (BRAM) |           |
  |  +------+ +------+ +--------+ +--------+           |
  |              |                                      |
  |        On-chip Buffer (BRAM/URAM)                   |
  +----------------------------------------------------+
```

### 12.8.3 Building a Systolic Array on FPGA

A systolic array is a grid of processing elements (PEs) that rhythmically pass data between neighbors, perfect for matrix multiplication:

```
Systolic Array for Matrix Multiply (4x4):

  Weight Matrix B elements loaded into PEs
  Input Matrix A rows stream from the left
  Results accumulate and stream out the bottom

         b00     b01     b02     b03
          |       |       |       |
          v       v       v       v
  a00 -> [PE] -> [PE] -> [PE] -> [PE]
          |       |       |       |
          v       v       v       v
  a10 -> [PE] -> [PE] -> [PE] -> [PE]
          |       |       |       |
          v       v       v       v
  a20 -> [PE] -> [PE] -> [PE] -> [PE]
          |       |       |       |
          v       v       v       v
  a30 -> [PE] -> [PE] -> [PE] -> [PE]
          |       |       |       |
          v       v       v       v
         c00     c01     c02     c03
```

Verilog implementation of one processing element:

```verilog
module systolic_pe #(
    parameter DATA_WIDTH = 8,
    parameter ACC_WIDTH  = 32
)(
    input  wire                    clk,
    input  wire                    reset,
    input  wire                    enable,
    input  wire [DATA_WIDTH-1:0]   a_in,       // From left neighbor
    input  wire [DATA_WIDTH-1:0]   b_in,       // From top neighbor
    input  wire [ACC_WIDTH-1:0]    c_in,       // Partial sum from top
    output reg  [DATA_WIDTH-1:0]   a_out,      // To right neighbor
    output reg  [DATA_WIDTH-1:0]   b_out,      // To bottom neighbor
    output reg  [ACC_WIDTH-1:0]    c_out       // Partial sum to bottom
);

wire signed [DATA_WIDTH-1:0]   a_signed;
wire signed [DATA_WIDTH-1:0]   b_signed;
wire signed [2*DATA_WIDTH-1:0] product;

assign a_signed = a_in;
assign b_signed = b_in;
assign product  = a_signed * b_signed;

always @(posedge clk) begin
    if (reset) begin
        a_out <= {DATA_WIDTH{1'b0}};
        b_out <= {DATA_WIDTH{1'b0}};
        c_out <= {ACC_WIDTH{1'b0}};
    end else if (enable) begin
        a_out <= a_in;                     // Pass A to the right
        b_out <= b_in;                     // Pass B downward
        c_out <= c_in + {{(ACC_WIDTH-2*DATA_WIDTH){product[2*DATA_WIDTH-1]}}, product};
    end
end

endmodule
```

A 4x4 systolic array instantiation:

```verilog
module systolic_array_4x4 #(
    parameter DATA_WIDTH = 8,
    parameter ACC_WIDTH  = 32
)(
    input  wire                   clk,
    input  wire                   reset,
    input  wire                   enable,
    input  wire [4*DATA_WIDTH-1:0] a_row,    // 4 input values from A
    input  wire [4*DATA_WIDTH-1:0] b_col,    // 4 input values from B
    output wire [4*ACC_WIDTH-1:0]  c_result  // 4 output accumulations
);

// Internal wires connecting PEs
wire [DATA_WIDTH-1:0] a_wire [0:3][0:4];  // Horizontal A flow
wire [DATA_WIDTH-1:0] b_wire [0:4][0:3];  // Vertical B flow
wire [ACC_WIDTH-1:0]  c_wire [0:4][0:3];  // Vertical accumulation

genvar i, j;
generate
    for (i = 0; i < 4; i = i + 1) begin : ROW
        for (j = 0; j < 4; j = j + 1) begin : COL
            systolic_pe #(
                .DATA_WIDTH(DATA_WIDTH),
                .ACC_WIDTH(ACC_WIDTH)
            ) pe_inst (
                .clk(clk),
                .reset(reset),
                .enable(enable),
                .a_in(a_wire[i][j]),
                .b_in(b_wire[i][j]),
                .c_in(c_wire[i][j]),
                .a_out(a_wire[i][j+1]),
                .b_out(b_wire[i+1][j]),
                .c_out(c_wire[i+1][j])
            );
        end
    end
endgenerate

// Connect inputs
generate
    for (i = 0; i < 4; i = i + 1) begin : INPUT_CONNECT
        assign a_wire[i][0] = a_row[i*DATA_WIDTH +: DATA_WIDTH];
        assign b_wire[0][i] = b_col[i*DATA_WIDTH +: DATA_WIDTH];
        assign c_wire[0][i] = {ACC_WIDTH{1'b0}};  // Zero initial accumulation
        assign c_result[i*ACC_WIDTH +: ACC_WIDTH] = c_wire[4][i];
    end
endgenerate

endmodule
```

### 12.8.4 Quantized Inference on FPGA

FPGAs excel at custom precision -- you can implement 2-bit, 3-bit, 4-bit, or any mixed-precision inference:

```
Precision vs Resources on FPGA:

  Precision  | DSPs per MAC | LUTs per MAC | Relative Throughput
  -----------|--------------|--------------|--------------------
  FP32       | 3 DSPs       | ~200         | 1x (baseline)
  FP16       | 1 DSP        | ~50          | 3x
  INT8       | 0.25 DSP*    | ~20          | 12x
  INT4       | 0 DSP        | ~8 (LUT)     | 48x
  INT2       | 0 DSP        | ~3 (LUT)     | 128x
  Binary     | 0 DSP        | 1 (XNOR+pop) | 1000x+

  * 4 INT8 MACs packed into 1 DSP48E2 slice
```

---

## 12.9 FPGA in the Cloud

### 12.9.1 AWS F1 Instances

Amazon's EC2 F1 instances provide Xilinx VU9P FPGAs on demand:

| Instance | FPGAs | vCPUs | RAM |
|----------|-------|-------|-----|
| f1.2xlarge | 1x VU9P | 8 | 122 GB |
| f1.4xlarge | 2x VU9P | 16 | 244 GB |
| f1.16xlarge | 8x VU9P | 64 | 976 GB |

Each VU9P: 2.6M LUTs, 5.2M FFs, 6,840 DSPs, 75.9 Mb BRAM, 270 Mb UltraRAM, 4x DDR4 (64 GB), PCIe Gen3 x16.

### 12.9.2 AWS F1 Development Workflow

```
AWS FPGA Development Flow:

  Developer Machine:
    1. Write RTL or HLS code
    2. Simulate locally (Verilator / Vivado Sim)
    3. Clone aws-fpga GitHub repo

  AWS Build Instance (z1d.xlarge):
    4. Run Vivado synthesis + P&R (4-12 hours for large designs)
    5. Generate Design Checkpoint (DCP)
    6. $ aws ec2 create-fpga-image --name "my-accelerator" ...
       (wait 30-60 min for AFI generation)

  AWS F1 Runtime Instance:
    7. $ sudo fpga-load-local-image -S 0 -I agfi-xxx
    8. Run host application (communicates via PCIe / DMA)
```

### 12.9.3 Simple AWS F1 Host Code

```cpp
// Host-side C code to interact with FPGA on AWS F1

#include <stdio.h>
#include <fcntl.h>
#include <sys/mman.h>

#define FPGA_BAR0_ADDR  0x00000000  // PCIe BAR0 base
#define FPGA_REG_STATUS 0x00
#define FPGA_REG_INPUT  0x04
#define FPGA_REG_OUTPUT 0x08
#define FPGA_REG_START  0x0C

int main() {
    // Open FPGA device
    int fd = open("/dev/xdma0_user", O_RDWR);
    if (fd < 0) {
        perror("Failed to open FPGA device");
        return 1;
    }

    // Memory-map the FPGA registers
    volatile uint32_t* fpga_regs = (volatile uint32_t*)mmap(
        NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0
    );

    if (fpga_regs == MAP_FAILED) {
        perror("mmap failed");
        close(fd);
        return 1;
    }

    // Write input data
    fpga_regs[FPGA_REG_INPUT / 4] = 42;

    // Start computation
    fpga_regs[FPGA_REG_START / 4] = 1;

    // Poll for completion
    while ((fpga_regs[FPGA_REG_STATUS / 4] & 0x1) == 0) {
        // Busy wait (in production, use interrupts)
    }

    // Read result
    uint32_t result = fpga_regs[FPGA_REG_OUTPUT / 4];
    printf("FPGA returned: %u\n", result);

    munmap((void*)fpga_regs, 4096);
    close(fd);
    return 0;
}
```

### 12.9.4 Azure and Other Cloud FPGAs

| Provider | Service | FPGA | Notes |
|----------|---------|------|-------|
| AWS | EC2 F1 | Xilinx VU9P | Most mature offering |
| Azure | Project Catapult | Intel Stratix 10 | Internal use (Bing, networking, AI) |
| Alibaba | F3 instances | Xilinx VU9P | Available in China regions |
| Nimbix | FPGA Cloud | Various | HPC-focused |

Microsoft uses FPGAs internally (Catapult/Brainwave) for Bing search ranking, Azure networking (SmartNIC), and AI inference, but public Azure FPGA instances have been limited.

---

## 12.10 RISC-V and Open Hardware

### 12.10.1 RISC-V ISA Basics

RISC-V is a free, open-source instruction set architecture (ISA) that has revolutionized processor design:

```
+================================================================+
|                    RISC-V ISA OVERVIEW                            |
+================================================================+
|                                                                |
|  Design Philosophy:                                             |
|  - Clean-slate RISC design (no legacy baggage)                  |
|  - Modular: base ISA + optional extensions                      |
|  - Free and open (no licensing fees, unlike ARM)                |
|  - Frozen base ISA (RV32I/RV64I won't change)                   |
|                                                                |
|  Base ISA + Extensions:                                         |
|                                                                |
|  RV32I / RV64I  - Integer base (47 instructions)               |
|  +M  - Integer Multiply/Divide                                  |
|  +A  - Atomic operations                                        |
|  +F  - Single-precision floating point                          |
|  +D  - Double-precision floating point                          |
|  +C  - Compressed instructions (16-bit)                         |
|  +V  - Vector extension (SIMD)                                  |
|  +B  - Bit manipulation                                         |
|  +H  - Hypervisor                                               |
|                                                                |
|  Common configs:                                                |
|  RV32IMAC  - Embedded microcontrollers                          |
|  RV64GC    - General-purpose (G = IMAFD)                        |
|  RV64GCV   - With vector (for AI/HPC)                           |
+================================================================+
```

### 12.10.2 RISC-V Instruction Format

```
RISC-V Instruction Formats (32-bit):

  R-type:  [funct7 ][rs2  ][rs1  ][funct3][rd   ][opcode]
           31    25 24  20 19  15 14   12 11   7  6     0

  I-type:  [imm[11:0]     ][rs1  ][funct3][rd   ][opcode]
           31           20 19  15 14   12 11   7  6     0

  S-type:  [imm[11:5]][rs2  ][rs1  ][funct3][imm[4:0]][opcode]
           31      25 24  20 19  15 14   12 11      7  6     0

  B-type:  [imm   ][rs2  ][rs1  ][funct3][imm  ][opcode]
           (branch offset encoding)

  Examples:
    add  x3, x1, x2     # R-type: x3 = x1 + x2
    addi x3, x1, 10     # I-type: x3 = x1 + 10
    lw   x3, 0(x1)      # I-type: x3 = Memory[x1 + 0]
    sw   x2, 4(x1)      # S-type: Memory[x1 + 4] = x2
    beq  x1, x2, label  # B-type: if (x1 == x2) goto label
```

### 12.10.3 Soft Cores on FPGA

A **soft core** is a CPU implemented in FPGA fabric (as opposed to a **hard core** etched in silicon). RISC-V's simplicity makes it ideal for FPGA soft cores:

```
Popular RISC-V Soft Cores for FPGA:

  +--------------------------------------------------------------+
  | Core         | Pipeline | Target      | Size     | MHz       |
  |--------------|----------|-------------|----------|-----------|
  | PicoRV32     | Single   | Minimal     | ~750 LUT | 250-400  |
  | SERV         | Serial   | Smallest    | ~200 LUT | 200-300  |
  | VexRiscv     | 2-5 stage| Configurable| 1-5K LUT | 200-400  |
  | Rocket       | 5-stage  | Linux-cap.  | ~20K LUT | 100-200  |
  | BOOM         | OoO      | High-perf   | ~80K LUT | 50-100   |
  | CVA6 (Ariane)| 6-stage  | Linux-cap.  | ~30K LUT | 100-150  |
  +--------------------------------------------------------------+
```

### 12.10.4 Building a Simple CPU on FPGA

Here is a minimal 5-stage pipelined RISC-V core concept in Verilog (simplified for clarity):

```verilog
module riscv_simple_core(
    input  wire        clk,
    input  wire        reset,
    // Instruction memory interface
    output wire [31:0] imem_addr,
    input  wire [31:0] imem_data,
    // Data memory interface
    output wire [31:0] dmem_addr,
    output wire [31:0] dmem_wdata,
    input  wire [31:0] dmem_rdata,
    output wire        dmem_wen,
    output wire [3:0]  dmem_byte_en
);

// Pipeline registers
reg [31:0] pc, pc_next;
reg [31:0] if_id_pc, if_id_instr;
reg [31:0] id_ex_pc, id_ex_rs1_data, id_ex_rs2_data, id_ex_imm;
reg [4:0]  id_ex_rd, id_ex_rs1, id_ex_rs2;
reg [6:0]  id_ex_opcode;
reg [2:0]  id_ex_funct3;
reg [6:0]  id_ex_funct7;
reg [31:0] ex_mem_alu_result, ex_mem_rs2_data;
reg [4:0]  ex_mem_rd;
reg        ex_mem_reg_write, ex_mem_mem_read, ex_mem_mem_write;
reg [31:0] mem_wb_result;
reg [4:0]  mem_wb_rd;
reg        mem_wb_reg_write;

// Register file (32 x 32-bit registers, x0 hardwired to 0)
reg [31:0] regfile [0:31];

// === STAGE 1: Instruction Fetch ===
assign imem_addr = pc;

always @(posedge clk) begin
    if (reset) begin
        pc <= 32'h0000_0000;
    end else begin
        pc <= pc_next;
        if_id_pc    <= pc;
        if_id_instr <= imem_data;
    end
end

// === STAGE 2: Instruction Decode ===
wire [6:0] opcode  = if_id_instr[6:0];
wire [4:0] rd      = if_id_instr[11:7];
wire [2:0] funct3  = if_id_instr[14:12];
wire [4:0] rs1     = if_id_instr[19:15];
wire [4:0] rs2     = if_id_instr[24:20];
wire [6:0] funct7  = if_id_instr[31:25];

// Immediate generation (I-type shown)
wire [31:0] imm_i = {{20{if_id_instr[31]}}, if_id_instr[31:20]};

always @(posedge clk) begin
    if (!reset) begin
        id_ex_pc       <= if_id_pc;
        id_ex_rs1_data <= (rs1 == 5'd0) ? 32'd0 : regfile[rs1];
        id_ex_rs2_data <= (rs2 == 5'd0) ? 32'd0 : regfile[rs2];
        id_ex_imm      <= imm_i;
        id_ex_rd       <= rd;
        id_ex_opcode   <= opcode;
        id_ex_funct3   <= funct3;
        id_ex_funct7   <= funct7;
    end
end

// === STAGE 3: Execute (ALU) ===
reg [31:0] alu_result;

always @(*) begin
    case (id_ex_opcode)
        7'b0110011: begin  // R-type
            case (id_ex_funct3)
                3'b000: alu_result = (id_ex_funct7[5]) ?
                            (id_ex_rs1_data - id_ex_rs2_data) :  // SUB
                            (id_ex_rs1_data + id_ex_rs2_data);   // ADD
                3'b111: alu_result = id_ex_rs1_data & id_ex_rs2_data; // AND
                3'b110: alu_result = id_ex_rs1_data | id_ex_rs2_data; // OR
                3'b100: alu_result = id_ex_rs1_data ^ id_ex_rs2_data; // XOR
                default: alu_result = 32'd0;
            endcase
        end
        7'b0010011: begin  // I-type (ADDI, etc.)
            case (id_ex_funct3)
                3'b000: alu_result = id_ex_rs1_data + id_ex_imm;     // ADDI
                default: alu_result = 32'd0;
            endcase
        end
        default: alu_result = 32'd0;
    endcase
end

// (Stages 4 and 5: Memory and Writeback follow similar pattern)
// Omitted for brevity -- full implementation would handle
// loads, stores, branches, jumps, hazard detection, and forwarding

// PC update (simplified -- no branches shown)
always @(*) begin
    pc_next = pc + 32'd4;
end

// Writeback to register file
always @(posedge clk) begin
    if (mem_wb_reg_write && mem_wb_rd != 5'd0) begin
        regfile[mem_wb_rd] <= mem_wb_result;
    end
end

endmodule
```

### 12.10.5 The Open Hardware Movement

```
+================================================================+
|              OPEN HARDWARE ECOSYSTEM                              |
+================================================================+
|                                                                |
|  ISA Layer:                                                     |
|  +------------------+                                           |
|  | RISC-V Foundation|  Free ISA specification                    |
|  | (now RISC-V Intl)|  No licensing fees                         |
|  +------------------+                                           |
|                                                                |
|  Core Designs:                                                  |
|  +------------------+  +------------------+                     |
|  | CHIPS Alliance   |  | OpenHW Group     |                     |
|  | (Google, Intel,  |  | (CVA6, CV32E40P) |                     |
|  |  Western Digital)|  | Verified cores   |                     |
|  +------------------+  +------------------+                     |
|                                                                |
|  EDA Tools:                                                     |
|  +------------------+  +------------------+                     |
|  | Yosys            |  | OpenROAD         |                     |
|  | Open synthesis   |  | Open P&R for     |                     |
|  | for FPGAs        |  | ASICs            |                     |
|  +------------------+  +------------------+                     |
|                                                                |
|  +------------------+  +------------------+                     |
|  | Verilator        |  | cocotb           |                     |
|  | Fast Verilog sim |  | Python-based     |                     |
|  | (open source)    |  | verification     |                     |
|  +------------------+  +------------------+                     |
|                                                                |
|  PDKs (Process Design Kits):                                    |
|  +------------------+                                           |
|  | SkyWater 130nm   |  Google-sponsored open PDK                |
|  | GF 180nm         |  GlobalFoundries open PDK                 |
|  | IHP 130nm SiGe   |  Open-source BiCMOS                      |
|  +------------------+                                           |
|                                                                |
|  Full Flow: Design -> Simulate -> Synthesize -> Fabricate       |
|  All with open-source tools! (Tiny Tapeout, eFabless)           |
+================================================================+
```

---

## 12.11 ASICs and Custom Accelerators

### 12.11.1 ASIC Design Flow

An ASIC (Application-Specific Integrated Circuit) is a chip designed for a single purpose. Once fabricated, it cannot be changed.

```
ASIC Design Flow:

  1. Specification -- Performance, power, area targets; microarchitecture
  2. RTL Design -- Verilog/SystemVerilog; integrate vendor IP blocks
  3. Verification (50-70% of total effort!)
     - UVM testbenches, constrained random verification
     - Formal verification (mathematical proof of properties)
     - Emulation on FPGA at near-real speed
  4. Synthesis -- Map to standard cell library (5nm, 7nm, etc.)
  5. Physical Design
     - Floorplanning, place & route, clock tree synthesis
     - DRC / LVS checks (Design Rule / Layout vs Schematic)
  6. Signoff -- Static timing analysis, power analysis, signal integrity
  7. Tapeout -- GDSII generation -> foundry (mask cost ~$100M at 5nm)
  8. Test & Package -- Wafer test, packaging, speed binning, burn-in

  Total Timeline: 18-36 months | Total Cost: $50M - $500M+ (at 5nm)
```

### 12.11.2 Google TPU Architecture

Google's Tensor Processing Unit (TPU) is the most successful custom AI accelerator:

```
Google TPU v4 Architecture:

  +--------------------------------------------------+
  |  Matrix Multiply Unit (MXU)                       |
  |  128x128 systolic array, BF16/INT8, ~275 TFLOPS  |
  +--------------------------------------------------+
  |  Vector Processing Unit (VPU)                     |
  |  Activations, normalization, softmax              |
  +--------------------------------------------------+
  |  Scalar Processing Unit                           |
  |  Control flow, address generation                 |
  +--------------------------------------------------+
  |  HBM2e Memory (32 GB, ~1.2 TB/s)                 |
  +--------------------------------------------------+
  |  Inter-Chip Interconnect (ICI)                    |
  |  3D torus topology, 4096 chips per pod            |
  +--------------------------------------------------+

  TPU v4 Pod: 4,096 chips, ~1.1 EFLOPS (BF16) aggregate
  Used for training PaLM, Gemini, etc.
```

### 12.11.3 TPU Evolution

```
TPU Generations:

  Version | Year | TOPS (INT8) | HBM      | Process | Use Case
  --------|------|-------------|----------|---------|----------
  TPU v1  | 2016 | 92          | N/A      | 28nm    | Inference
  TPU v2  | 2017 | 45 TFLOPS*  | 16 GB    | 16nm    | Training
  TPU v3  | 2018 | 90 TFLOPS*  | 32 GB    | 16nm    | Training
  TPU v4  | 2021 | 275 TFLOPS* | 32 GB    | 7nm     | Training
  TPU v5e | 2023 | 197 TFLOPS* | 16 GB    | (unk)   | Inference
  TPU v5p | 2023 | 459 TFLOPS* | 95 GB    | (unk)   | Training
  TPU v6e | 2024 | (improved)  | (impr.)  | (unk)   | Training

  * BF16 TFLOPS for training versions
```

### 12.11.4 Apple Neural Engine (ANE)

Apple's approach to custom AI acceleration, integrated into their SoC:

```
Apple M4 SoC:
  +----------+  +----------+  +----------+  +---------+
  | P-Cores  |  | E-Cores  |  | GPU      |  | Neural  |
  | 4 cores  |  | 6 cores  |  | 10 cores |  | Engine  |
  +----------+  +----------+  +----------+  | 16-core |
  +----------+  +----------+  +----------+  +---------+
  | Media    |  | Image SP |  | Unified Memory (LPDDR5)|
  +----------+  +----------+  +------------------------+
```

**Neural Engine (M4)**: 16 neural cores, 38 TOPS (INT8), dedicated matrix multiply + convolution hardware, shared unified memory (no copy overhead), ~5W for AI workloads. Programmed via Core ML framework -- the compiler automatically maps operations to ANE, GPU, or CPU.

### 12.11.5 Other Notable Custom Accelerators

| Company | Chip | Focus | Notable Feature |
|---------|------|-------|-----------------|
| NVIDIA | H100/B200 | AI Training | Transformer Engine |
| Google | TPU v5p | AI Training | 3D Torus ICI |
| Tesla | Dojo D1 | Video training | Custom mesh network |
| Cerebras | WSE-3 | AI Training | Wafer-scale chip |
| Groq | LPU | AI Inference | Deterministic execution |
| AWS | Trainium2/Inferentia2 | AI Training/Inference | Cloud-native |

---

## 12.12 Emerging: Chiplets & 3D Stacking

### 12.12.1 The End of Monolithic Scaling

Moore's Law is slowing. Building ever-larger monolithic chips becomes prohibitively expensive and yields drop. The industry's answer: **chiplets** -- smaller, reusable die assembled together in advanced packages.

```
Monolithic: Single large die (800mm^2), all same process, low yield, expensive

Chiplet:    Multiple small dies on interposer/substrate
            +------+ +------+ +------+
            | CPU  | | CPU  | | I/O  |   Small dies = high yield
            | 5nm  | | 5nm  | | 12nm |   Mix process nodes
            +------+ +------+ +------+   Reusable IP dies
            +------+ +------+            Lower total cost
            | GPU  | | HBM  |
            | 5nm  | |      |
            +------+ +------+
```

### 12.12.2 High Bandwidth Memory (HBM)

HBM is a 3D-stacked DRAM technology that provides massive bandwidth in a compact footprint:

```
+================================================================+
|                HBM3 ARCHITECTURE                                  |
+================================================================+
|                                                                |
|  Single HBM3 Stack:                                             |
|                                                                |
|      +------------------+                                       |
|      |   DRAM Die 3     |  Each die: multiple banks             |
|      +------------------+                                       |
|      |   DRAM Die 2     |  8-12 dies stacked                    |
|      +------------------+  using Through-Silicon Vias (TSVs)    |
|      |   DRAM Die 1     |                                       |
|      +------------------+                                       |
|      |   DRAM Die 0     |                                       |
|      +------------------+                                       |
|      |   Logic/Base Die |  Interface logic, ECC, repair         |
|      +-----|--------|---+                                       |
|            |TSVs    |                                            |
|            v        v                                            |
|      Micro-bumps to interposer / package                        |
|                                                                |
|  HBM Generations:                                               |
|  +----------------------------------------------------------+  |
|  | Gen  | Year | BW/Stack | Capacity | Pins  | Stacks (typ) |  |
|  |------|------|----------|----------|-------|--------------|  |
|  | HBM  | 2013 | 128 GB/s | 1 GB     | 1024  | 4            |  |
|  | HBM2 | 2016 | 256 GB/s | 8 GB     | 1024  | 4-6          |  |
|  | HBM2e| 2018 | 460 GB/s | 16 GB    | 1024  | 4-6          |  |
|  | HBM3 | 2022 | 819 GB/s | 24 GB    | 1024  | 6-8          |  |
|  | HBM3e| 2024 | 1.2 TB/s | 36 GB    | 1024  | 8-12         |  |
|  +----------------------------------------------------------+  |
|                                                                |
|  NVIDIA H100: 5 HBM3 stacks = 80 GB, 3.35 TB/s                |
|  NVIDIA B200: 8 HBM3e stacks = 192 GB, 8 TB/s                  |
|  AMD MI300X: 8 HBM3 stacks = 192 GB, 5.3 TB/s                  |
+================================================================+
```

### 12.12.3 Advanced Packaging Technologies

| Technology | Bandwidth | Latency | Example Users |
|-----------|-----------|---------|---------------|
| **2D Side-by-Side** | 10-100 GB/s | ~10-20 ns | Traditional multi-chip |
| **2.5D Interposer** | 100+ GB/s | ~2-5 ns | AMD MI300, NVIDIA H100 |
| **3D Stacking (TSV)** | 1+ TB/s | ~1 ns | AMD 3D V-Cache, HBM |
| **EMIB (Intel)** | ~100 GB/s | ~5 ns | Intel Ponte Vecchio |

2.5D uses a silicon interposer to connect dies at high bandwidth. 3D stacking places dies directly on top of each other using through-silicon vias (TSVs) but has thermal challenges. Intel's EMIB embeds small silicon bridges in the substrate, avoiding a full interposer.

### 12.12.4 AMD's Infinity Fabric & Chiplet Architecture

AMD pioneered the chiplet approach for mainstream processors:

```
+================================================================+
|           AMD CHIPLET ARCHITECTURE                                |
+================================================================+
|                                                                |
|  AMD EPYC (Genoa / Turin) - Server CPU:                         |
|                                                                |
|  +----------------------------------------------------------+ |
|  |                  Package                                    | |
|  |                                                            | |
|  |  +------+ +------+ +------+ +------+                      | |
|  |  | CCD  | | CCD  | | CCD  | | CCD  |                      | |
|  |  | 8 Zen| | 8 Zen| | 8 Zen| | 8 Zen|  CCD = Core Complex | |
|  |  | cores| | cores| | cores| | cores|  Die (5nm TSMC)      | |
|  |  +------+ +------+ +------+ +------+                      | |
|  |                                                            | |
|  |  +------+ +------+ +------+ +------+                      | |
|  |  | CCD  | | CCD  | | CCD  | | CCD  |                      | |
|  |  | 8 Zen| | 8 Zen| | 8 Zen| | 8 Zen|  Up to 12 CCDs      | |
|  |  | cores| | cores| | cores| | cores|  = 96-128 cores      | |
|  |  +------+ +------+ +------+ +------+                      | |
|  |                                                            | |
|  |         +----------------------+                           | |
|  |         |     IOD (I/O Die)    |   IOD: 6nm TSMC           | |
|  |         |  DDR5, PCIe, CXL    |   Handles all I/O          | |
|  |         |  Infinity Fabric     |   Connects CCDs            | |
|  |         +----------------------+                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  Infinity Fabric:                                               |
|  - Coherent interconnect linking all CCDs through IOD           |
|  - Scalable: same CCD works in Ryzen (1 CCD) and EPYC (12)    |
|  - Bandwidth: ~100+ GB/s per link                               |
|  - Latency: ~40-80 ns cross-CCD                                |
|                                                                |
|  AMD MI300X (AI Accelerator):                                    |
|  - 8 XCDs (GPU dies) on a single package                        |
|  - 4 IODs                                                       |
|  - 8 HBM3 stacks (192 GB)                                       |
|  - 5.3 TB/s memory bandwidth                                    |
|  - 2.5D packaging with silicon interposer                       |
|  - 153 billion transistors total                                |
+================================================================+
```

### 12.12.5 AMD 3D V-Cache

```
+================================================================+
|           AMD 3D V-CACHE TECHNOLOGY                               |
+================================================================+
|                                                                |
|  Standard CCD:           3D V-Cache CCD:                        |
|                                                                |
|  +----------------+      +----------------+                     |
|  |  32 MB L3      |      |  64 MB SRAM    |  <-- Stacked cache  |
|  +----------------+      +-----TSVs-------+      die            |
|  |  8 Zen Cores   |      |  32 MB L3      |                     |
|  |  + L1/L2 cache |      +----------------+                     |
|  +----------------+      |  8 Zen Cores   |                     |
|                          |  + L1/L2 cache |                     |
|  Total L3: 32 MB         +----------------+                     |
|                                                                |
|                          Total L3: 96 MB                        |
|                          (3x more cache!)                       |
|                                                                |
|  Impact on Gaming:                                              |
|  - 15-30% faster in cache-sensitive games                       |
|  - Near-zero extra power consumption                            |
|  - Same core count and clock speed                              |
|                                                                |
|  Technical Details:                                             |
|  - TSMC SoIC (System on Integrated Chips) technology            |
|  - Hybrid bonding: ~10 um bump pitch (vs 150 um for flip-chip)  |
|  - TSV density: ~200,000 per mm^2                               |
|  - Thermal solution: thinned cache die + copper heat spreader   |
+================================================================+
```

### 12.12.6 The Future: UCIe and Standardization

```
+================================================================+
|        UCIe (Universal Chiplet Interconnect Express)              |
+================================================================+
|                                                                |
|  The Problem:                                                   |
|  - Each company has proprietary chiplet interconnects            |
|  - AMD Infinity Fabric, Intel EMIB, TSMC CoWoS...              |
|  - Chiplets from different vendors can't mix and match           |
|                                                                |
|  UCIe Standard (backed by AMD, Intel, ARM, TSMC, Samsung):      |
|  - Open standard for die-to-die interconnect                    |
|  - Physical layer: bump pitch, signaling                        |
|  - Protocol layer: CXL, PCIe, or streaming protocols            |
|  - Target: mix chiplets from any vendor in one package           |
|                                                                |
|  UCIe Specs:                                                    |
|  +----------------------------------------------------------+  |
|  | Variant      | Bump Pitch | BW/mm edge | Reach           |  |
|  |--------------|------------|------------|-----------------|  |
|  | Standard     | 100 um     | 28 GB/s    | Package-level   |  |
|  | Advanced     | 25 um      | 165 GB/s   | Die-to-die      |  |
|  +----------------------------------------------------------+  |
|                                                                |
|  Vision: A future where you can buy compute chiplets from       |
|  AMD, memory chiplets from Samsung, I/O chiplets from Intel,    |
|  and AI chiplets from a startup -- all in one package.           |
+================================================================+
```

---

## FPGA Learning Path

### Beginner (Months 1-3)

```
+================================================================+
|  PHASE 1: DIGITAL LOGIC FOUNDATIONS                               |
+================================================================+
|                                                                |
|  Month 1: Digital Logic Basics                                  |
|  - Boolean algebra, truth tables, Karnaugh maps                 |
|  - Combinational circuits: gates, muxes, decoders, adders       |
|  - Sequential circuits: flip-flops, counters, shift registers   |
|  - Finite state machines (FSMs)                                 |
|  - Resource: "Digital Design" by Morris Mano                    |
|  - Resource: Nand2Tetris (free online course)                   |
|                                                                |
|  Month 2: Verilog / SystemVerilog                               |
|  - Module syntax, wire vs reg, assign vs always                 |
|  - Combinational and sequential always blocks                   |
|  - Parameterized modules, generate blocks                       |
|  - Testbenches and simulation                                   |
|  - Resource: "Verilog by Example" by Blaine Readler             |
|  - Tool: Verilator (free, fast simulator)                       |
|                                                                |
|  Month 3: First FPGA Project                                    |
|  - Buy a dev board: Digilent Basys 3 (~$150)                    |
|    or Terasic DE10-Nano (~$130)                                 |
|  - LED blinker (hello world of FPGAs)                           |
|  - 7-segment display counter                                    |
|  - UART transmitter/receiver                                    |
|  - Simple VGA display controller                                |
|  - Tool: AMD Vivado WebPACK (free) or Intel Quartus Lite (free) |
+================================================================+
```

### Intermediate (Months 4-8)

```
+================================================================+
|  PHASE 2: PRACTICAL FPGA DEVELOPMENT                              |
+================================================================+
|                                                                |
|  Month 4-5: Complex Digital Systems                             |
|  - AXI bus protocol (AXI4, AXI4-Lite, AXI4-Stream)             |
|  - Memory controllers (DDR interface concepts)                  |
|  - DMA engines                                                  |
|  - Build a RISC-V soft core from scratch                        |
|  - FIFO design and clock domain crossing                        |
|                                                                |
|  Month 6-7: HLS and Acceleration                               |
|  - Vitis HLS: C/C++ to hardware                                |
|  - Optimization pragmas (pipeline, unroll, partition)           |
|  - Dataflow optimization for streaming architectures            |
|  - Build an image processing pipeline (resize, filter)          |
|  - Build a matrix multiply accelerator                          |
|  - Benchmark against CPU/GPU                                    |
|                                                                |
|  Month 8: System Integration                                    |
|  - Zynq SoC: ARM cores + FPGA fabric                           |
|  - Linux on FPGA (PetaLinux)                                    |
|  - PCIe-based accelerator card development                      |
|  - Profiling and optimization                                   |
|  - Timing closure techniques                                    |
+================================================================+
```

### Advanced (Months 9-12+)

```
+================================================================+
|  PHASE 3: SPECIALIZATION                                          |
+================================================================+
|                                                                |
|  Choose a domain:                                               |
|                                                                |
|  Path A: AI/ML Acceleration                                     |
|  - INT8/INT4 inference engine design                            |
|  - Systolic array implementation                                |
|  - Vitis AI for model deployment                                |
|  - Custom quantization schemes                                  |
|  - Transformer acceleration                                     |
|                                                                |
|  Path B: High-Frequency Trading                                 |
|  - Network protocol parsing (Ethernet, UDP, market data)        |
|  - Sub-microsecond tick-to-trade pipelines                      |
|  - Order book management in hardware                            |
|  - Time synchronization (PTP/IEEE 1588)                         |
|                                                                |
|  Path C: Networking / SmartNIC                                  |
|  - 100G/400G Ethernet                                           |
|  - Packet classification and filtering                          |
|  - P4 programmable data planes                                  |
|  - RDMA offload engines                                         |
|  - Network function virtualization                              |
|                                                                |
|  Path D: Signal Processing / SDR                                |
|  - FFT implementation                                           |
|  - FIR/IIR filter design                                        |
|  - Software-defined radio                                       |
|  - Radar/sonar processing                                       |
|  - Digital up/down conversion                                   |
|                                                                |
|  Path E: ASIC Design / Chip Architecture                         |
|  - Standard cell library and synthesis                          |
|  - Physical design with OpenROAD                                |
|  - RISC-V core design and verification                          |
|  - UVM verification methodology                                |
|  - Tape out via Tiny Tapeout or eFabless                        |
+================================================================+
```

### Recommended FPGA Development Boards

```
+----------------------------------------------------------------+
| Level      | Board                | FPGA           | Price      |
|------------|----------------------|----------------|------------|
| Beginner   | Digilent Basys 3     | Xilinx Artix-7 | ~$150      |
| Beginner   | Digilent Arty A7     | Xilinx Artix-7 | ~$130      |
| Beginner   | Terasic DE10-Lite    | Intel MAX 10   | ~$85       |
| Beginner   | iCEBreaker           | Lattice iCE40  | ~$70       |
| Intermed.  | Digilent Nexys A7    | Xilinx Artix-7 | ~$270      |
| Intermed.  | Terasic DE10-Nano    | Intel Cyclone V | ~$130      |
| Intermed.  | Digilent Zybo Z7     | Xilinx Zynq    | ~$270      |
| Advanced   | Xilinx KV260         | Zynq UltraScale| ~$250      |
| Advanced   | Digilent Genesys 2   | Xilinx Kintex-7| ~$1000     |
| Cloud      | AWS F1 Instance      | Xilinx VU9P    | ~$1.65/hr  |
+----------------------------------------------------------------+
```

---

## Career in Hardware Design

### 12.C.1 Role Landscape

```
+================================================================+
|            HARDWARE DESIGN CAREER PATHS                           |
+================================================================+
|                                                                |
|  RTL / FPGA Engineer                                            |
|  +----------------------------------------------------------+ |
|  | - Design digital circuits in Verilog/VHDL/SystemVerilog    | |
|  | - FPGA implementation and optimization                     | |
|  | - Timing closure, resource optimization                    | |
|  | - Industries: defense, telecom, finance, data centers      | |
|  | - Salary: $120K-$250K (US, 2025)                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  ASIC Design Engineer                                           |
|  +----------------------------------------------------------+ |
|  | - Front-end: RTL design for silicon                         | |
|  | - Microarchitecture definition                              | |
|  | - Power/performance/area (PPA) optimization                | |
|  | - Industries: semiconductor (NVIDIA, AMD, Intel, Apple)    | |
|  | - Salary: $150K-$350K (US, 2025)                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  ASIC Verification Engineer                                     |
|  +----------------------------------------------------------+ |
|  | - UVM testbenches, constrained random verification          | |
|  | - Formal verification                                       | |
|  | - Coverage-driven methodology                               | |
|  | - Highest demand role in chip design                        | |
|  | - Salary: $140K-$300K (US, 2025)                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  Physical Design Engineer                                       |
|  +----------------------------------------------------------+ |
|  | - Floor planning, place and route                           | |
|  | - Clock tree synthesis, timing closure                      | |
|  | - DRC/LVS signoff                                           | |
|  | - Deep knowledge of process technology                      | |
|  | - Salary: $130K-$280K (US, 2025)                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  Computer Architect                                             |
|  +----------------------------------------------------------+ |
|  | - Define ISA extensions and microarchitecture               | |
|  | - Performance modeling and simulation                       | |
|  | - Cache hierarchy, memory subsystem design                  | |
|  | - Senior role requiring 7-15+ years experience              | |
|  | - Salary: $200K-$500K+ (US, 2025)                           | |
|  +----------------------------------------------------------+ |
|                                                                |
|  HLS / FPGA Application Engineer                                |
|  +----------------------------------------------------------+ |
|  | - Develop HLS-based accelerators                            | |
|  | - Bridge software and hardware teams                        | |
|  | - Optimize algorithms for FPGA deployment                   | |
|  | - Growing role as HLS tools improve                         | |
|  | - Salary: $130K-$250K (US, 2025)                           | |
|  +----------------------------------------------------------+ |
+================================================================+
```

### 12.C.2 Skills Matrix

```
+----------------------------------------------------------------+
| Skill                      | FPGA Eng | ASIC Des | Verif Eng  |
|----------------------------|----------|----------|------------|
| Verilog / SystemVerilog    | Required | Required | Required   |
| VHDL                       | Helpful  | Rare     | Rare       |
| HLS (C/C++ to hardware)   | Common   | Rare     | Rare       |
| UVM / Verification         | Basic    | Basic    | Expert     |
| Timing Analysis / STA      | Required | Required | Basic      |
| Scripting (Python/TCL)     | Required | Required | Required   |
| Digital Signal Processing  | Common   | Niche    | Niche      |
| Computer Architecture      | Helpful  | Required | Required   |
| Analog / Mixed-Signal      | Rare     | Niche    | Niche      |
| Physical Design (P&R)      | Basic    | Helpful  | Rare       |
| Linux / Embedded Systems   | Common   | Rare     | Rare       |
| PCB / Board Design         | Helpful  | Rare     | Rare       |
+----------------------------------------------------------------+
```

### 12.C.3 Top Employers

```
+----------------------------------------------------------------+
| Company      | Focus Area            | FPGA/ASIC Roles          |
|--------------|-----------------------|--------------------------|
| NVIDIA       | GPU / AI chips        | ASIC design, arch, verif |
| AMD          | CPU / GPU / FPGA      | Full spectrum            |
| Intel        | CPU / FPGA / foundry  | Full spectrum            |
| Apple        | SoC design            | ASIC design, arch        |
| Qualcomm     | Mobile SoC            | ASIC design, modem       |
| Broadcom     | Networking / storage   | ASIC design, verif       |
| Marvell      | Data infrastructure   | ASIC design, verif       |
| Google       | TPU / custom silicon  | ASIC design, arch        |
| Amazon (AWS) | Graviton / Trainium   | ASIC design, FPGA        |
| Microsoft    | FPGA (Catapult)       | FPGA application eng.    |
| Meta         | MTIA (custom AI)      | ASIC design, arch        |
| Jane Street  | HFT                   | FPGA application eng.    |
| Citadel      | HFT                   | FPGA application eng.    |
| Jump Trading | HFT                   | FPGA application eng.    |
| Xilinx/AMD   | FPGA silicon + tools  | Full spectrum            |
| Lattice Semi | Low-power FPGA        | FPGA design              |
+----------------------------------------------------------------+
```

### 12.C.4 Key Takeaways

```
+================================================================+
|          CHAPTER 12 SUMMARY                                       |
+================================================================+
|                                                                |
|  1. FPGAs let you design CUSTOM CIRCUITS that execute your      |
|     algorithm directly -- no instruction overhead, deterministic |
|     latency, excellent power efficiency.                        |
|                                                                |
|  2. HDLs (Verilog/VHDL) describe hardware, not software.        |
|     Everything is parallel by default. Think circuits, not code. |
|                                                                |
|  3. HLS dramatically lowers the FPGA barrier by letting you     |
|     write C/C++ with pragmas. Not as optimal as hand-written    |
|     RTL, but 10x faster development.                            |
|                                                                |
|  4. The compute spectrum: CPU (flexible) -> GPU (parallel) ->   |
|     FPGA (custom+reconfig) -> ASIC (custom+fixed). Choose       |
|     based on latency, volume, power, and development time.      |
|                                                                |
|  5. RISC-V and open hardware are democratizing chip design.     |
|     You can design, simulate, and even fabricate your own       |
|     processor using entirely open-source tools.                 |
|                                                                |
|  6. Chiplets and 3D stacking are the future of scaling.         |
|     Instead of bigger monolithic dies, the industry is          |
|     assembling smaller dies into powerful packages.             |
|                                                                |
|  7. Custom silicon (TPU, ANE, etc.) delivers the best           |
|     perf/watt for specific workloads but requires enormous     |
|     investment. FPGAs are the sweet spot for prototyping and    |
|     low-to-medium volume deployment.                           |
+================================================================+
```

---

**Next Chapter**: [Chapter 13: Performance Engineering Culture](./13-PERF-ENGINEERING-CULTURE.md) -- Building performance-aware teams, benchmarking methodologies, production profiling, and the art of optimization.
