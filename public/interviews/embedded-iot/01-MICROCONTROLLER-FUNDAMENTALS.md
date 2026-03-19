# Chapter 1: Microcontroller Fundamentals -- Understanding the Hardware

Modern embedded systems power everything from pacemakers to industrial robots. At their
core sits a microcontroller -- a complete computer on a single chip. This chapter provides
a rigorous tour of microcontroller architecture, giving you the mental model needed to
reason about firmware behavior, debug hard faults, and choose the right silicon for a
product.

---

## 1. Microcontroller vs. Microprocessor

A common source of confusion. The distinction matters because it drives board design,
cost, and software architecture.

| Feature           | Microprocessor (MPU)     | Microcontroller (MCU)           |
| ----------------- | ------------------------ | ------------------------------- |
| Memory            | External (DDR4/5 SDRAM)  | On-chip Flash + SRAM            |
| Peripherals       | Requires external ICs    | Built-in (ADC, UART, SPI, etc.) |
| Operating system  | Usually Linux / RTOS     | Bare-metal or lightweight RTOS  |
| Clock speed       | 1-3+ GHz                 | 8 MHz - 480 MHz typical         |
| Power consumption | 2-15 W                   | 10 uA - 200 mA                  |
| Boot time         | Seconds                  | Microseconds to milliseconds    |
| Typical use       | Phones, SBCs, servers    | Sensors, motor control, IoT     |
| Example           | ARM Cortex-A, Intel Core | ARM Cortex-M, AVR, RISC-V       |

**Key insight**: A microcontroller is a microprocessor plus memory plus peripherals, all
on one die. This integration trades raw performance for lower power, lower cost, and
deterministic real-time behavior.

```
  Microprocessor (MPU) System              Microcontroller (MCU)
  ========================               =========================
  +-------+  +---------+                +---------------------------+
  |  CPU  |--| DDR RAM |                |  +-----+  +-------+      |
  +-------+  +---------+                |  | CPU |  | Flash |      |
      |                                  |  +-----+  +-------+      |
  +-------+  +---------+                |     |      | SRAM  |      |
  | GPU   |--| Storage |                |  +-----+  +-------+      |
  +-------+  +---------+                |  | NVIC|                  |
      |                                  |  +-----+  +-----------+  |
  +-----------+                          |  | DMA |  |Peripherals|  |
  |Peripherals|                          |  +-----+  | UART,SPI  |  |
  | (external)|                          |           | I2C,ADC.. |  |
  +-----------+                          |           +-----------+  |
                                         +---------------------------+
                                              Single Chip
```

---

## 2. CPU Architectures

### 2.1 ARM Cortex-M Series

ARM does not manufacture chips. ARM licenses Intellectual Property (IP) cores to silicon
vendors (ST, NXP, Nordic, TI) who add their own peripherals and memory. The Cortex-M
family dominates the 32-bit MCU market.

| Core       | Pipeline | Features                          | Typical Use              |
| ---------- | -------- | --------------------------------- | ------------------------ |
| Cortex-M0  | 2-stage  | Thumb subset, lowest gate count   | Simple sensors, toys     |
| Cortex-M0+ | 2-stage  | M0 + single-cycle I/O, MTB        | Wearables, low-power IoT |
| Cortex-M3  | 3-stage  | Full Thumb-2, HW divide, bit-band | General-purpose MCU      |
| Cortex-M4  | 3-stage  | M3 + DSP + optional FPU (M4F)     | Motor control, audio     |
| Cortex-M7  | 6-stage  | Dual-issue, cache, TCM            | High-perf real-time      |
| Cortex-M33 | 3-stage  | TrustZone security, M4 features   | Secure IoT, payment      |
| Cortex-M55 | 4-stage  | Helium (M-Profile Vector Ext.)    | TinyML, edge AI          |

```
  ARM Cortex-M4 Core (Simplified)
  ================================

  +--------------------------------------------------+
  |                  Cortex-M4 Core                   |
  |                                                    |
  |  +--------+   +--------+   +------+   +-------+  |
  |  | Fetch  |-->| Decode |-->| Exec |-->| Write |  |
  |  | Stage  |   | Stage  |   | ALU  |   | Back  |  |
  |  +--------+   +--------+   | FPU  |   +-------+  |
  |       |                     | DSP  |              |
  |  +--------+                 +------+              |
  |  | Branch |                                        |
  |  | Predict|   +------+   +------+                 |
  |  +--------+   | MPU  |   | NVIC |                 |
  |               +------+   +------+                 |
  +------------|---------|----------|-----------------+
               |         |          |
          +---------+ +------+ +---------+
          |  I-Bus  | | S-Bus| |  D-Bus  |
          | (Code)  | |(Sys) | | (Data)  |
          +---------+ +------+ +---------+
               |         |          |
          +------------------------------------+
          |        Bus Matrix (AHB)            |
          +------------------------------------+
               |              |          |
          +---------+   +---------+ +----------+
          |  Flash  |   |  SRAM   | |Peripherals|
          +---------+   +---------+ +----------+
```

### 2.2 RISC-V

An open-source Instruction Set Architecture (ISA). Unlike ARM, there are no license fees.
The ISA is modular -- you pick extensions:

- **RV32I**: Base 32-bit integer instructions
- **M**: Multiply/divide
- **A**: Atomic operations
- **F/D**: Single/double-precision floating point
- **C**: Compressed (16-bit) instructions

Popular RISC-V MCUs: ESP32-C3 (Espressif), GD32VF103 (GigaDevice), CH32V (WCH).

### 2.3 AVR (Atmel/Microchip)

8-bit Harvard architecture, made famous by Arduino. The ATmega328P runs at 16 MHz with
32 KB Flash and 2 KB SRAM. Still relevant for education and ultra-low-cost designs.

### 2.4 Xtensa (ESP32)

Espressif's ESP32 uses a dual-core Xtensa LX6 at 240 MHz. It is notable for integrating
Wi-Fi and Bluetooth on-chip, making it the go-to choice for hobbyist and commercial IoT.
The newer ESP32-S3 adds vector instructions for edge AI.

---

## 3. Memory Architecture

Microcontrollers use a mix of volatile and non-volatile memories, each with different
speeds, sizes, and endurance characteristics.

### 3.1 Flash (Code Storage)

- Non-volatile; retains data without power.
- Stores program code and constant data.
- Write endurance: typically 10,000 cycles per sector.
- Erase must happen in sectors (e.g., 2 KB or 4 KB at a time).
- Read speed: 0-2 wait states depending on clock speed.
- Typical sizes: 64 KB to 2 MB.

### 3.2 SRAM (Data Storage)

- Volatile; contents lost on power-off.
- Stores stack, heap, global variables, and buffers.
- Single-cycle access at CPU clock speed.
- Typical sizes: 8 KB to 512 KB.
- No write endurance limit.

### 3.3 EEPROM / Flash Emulated EEPROM

- Non-volatile storage for configuration data (calibration, serial numbers).
- Byte-addressable (unlike Flash, which requires sector erase).
- Higher endurance than Flash: ~100,000 to 1,000,000 cycles.
- Some MCUs emulate EEPROM using Flash with wear-leveling.

### 3.4 Tightly Coupled Memory (TCM)

Found on Cortex-M7: ITCM for instructions, DTCM for data. Zero wait-state access,
bypasses cache. Critical for deterministic real-time code.

---

## 4. Memory Map and Memory-Mapped I/O

ARM Cortex-M defines a standardized 4 GB address space. Every peripheral register,
memory block, and system resource has a unique address.

```
  ARM Cortex-M Memory Map (4 GB Address Space)
  =============================================

  0xFFFFFFFF +----------------------------+
             |   Vendor-Specific          |
  0xE0100000 +----------------------------+
             |   Private Peripheral Bus   |
             |   (NVIC, SysTick, SCB,     |
             |    Debug components)        |
  0xE0000000 +----------------------------+
             |   External Device          |
             |   (external peripherals)   |
  0xA0000000 +----------------------------+
             |   External RAM             |
             |   (SDRAM, PSRAM if present)|
  0x60000000 +----------------------------+
             |   Peripheral              |
             |   (GPIO, UART, SPI, I2C,  |
             |    TIM, ADC, DMA, etc.)   |
  0x40000000 +----------------------------+
             |   SRAM                     |
             |   (stack, heap, .bss,     |
             |    .data variables)        |
  0x20000000 +----------------------------+
             |   Code (Flash)            |
             |   (.text, .rodata,        |
             |    vector table)          |
  0x00000000 +----------------------------+
```

**Memory-mapped I/O** means that to toggle a GPIO pin, you write to a specific memory
address. There is no special I/O instruction -- you use the same `load` and `store`
instructions used for RAM.

```c
// Example: Toggle LED on STM32 (GPIOA Pin 5)
// GPIOA base address: 0x40020000
// ODR offset: 0x14

#define GPIOA_ODR  (*(volatile uint32_t *)0x40020014)

void toggle_led(void) {
    GPIOA_ODR ^= (1U << 5);  // XOR bit 5
}
```

The `volatile` keyword is essential -- it tells the compiler the value at this address
can change outside the program's control (hardware can modify it). Without `volatile`,
the compiler may optimize away reads/writes.

---

## 5. Registers

### 5.1 General-Purpose Registers (CPU Core)

ARM Cortex-M has 16 core registers (R0-R15):

```
  R0  - R3   : Function arguments / return values
  R4  - R11  : Callee-saved (preserved across calls)
  R12         : Intra-procedure scratch register (IP)
  R13 (SP)    : Stack Pointer (MSP or PSP)
  R14 (LR)    : Link Register (return address)
  R15 (PC)    : Program Counter

  Special Registers:
  xPSR        : Program Status Register (N, Z, C, V flags + ISR number)
  PRIMASK     : 1-bit; set to disable all interrupts except NMI
  BASEPRI     : Set to mask interrupts below a priority level
  CONTROL     : Selects MSP/PSP and privilege level
```

### 5.2 Special Function Registers (SFRs)

These are peripheral registers at fixed memory addresses. Each peripheral (GPIO, UART,
Timer) has a block of SFRs controlling its behavior.

Example -- STM32 GPIO register block:

| Offset | Register | Purpose                            |
| ------ | -------- | ---------------------------------- |
| 0x00   | MODER    | Pin mode (input/output/AF/analog)  |
| 0x04   | OTYPER   | Output type (push-pull/open-drain) |
| 0x08   | OSPEEDR  | Output speed                       |
| 0x0C   | PUPDR    | Pull-up / pull-down                |
| 0x10   | IDR      | Input data (read-only)             |
| 0x14   | ODR      | Output data                        |
| 0x18   | BSRR     | Bit set/reset (atomic)             |
| 0x1C   | LCKR     | Configuration lock                 |
| 0x20   | AFRL     | Alternate function low             |
| 0x24   | AFRH     | Alternate function high            |

### 5.3 Why BSRR Instead of ODR?

Writing to ODR is a read-modify-write operation: read current value, change one bit,
write back. If an interrupt fires between the read and write, it can corrupt the output
state (a race condition). BSRR is a write-only register that atomically sets or resets
individual bits -- no read-modify-write needed.

```c
// Non-atomic (dangerous in ISR context)
GPIOA->ODR |= (1U << 5);   // Read-modify-write

// Atomic (safe)
GPIOA->BSRR = (1U << 5);   // Set pin 5
GPIOA->BSRR = (1U << 21);  // Reset pin 5 (bits 16-31 reset)
```

---

## 6. Clock System

The clock system is the heartbeat of the MCU. Every peripheral, the CPU, and the buses
derive their clock from this tree.

### 6.1 Clock Sources

| Source | Name                | Typical Freq | Notes                          |
| ------ | ------------------- | ------------ | ------------------------------ |
| HSI    | High-Speed Internal | 8-16 MHz     | RC oscillator, fast startup    |
| HSE    | High-Speed External | 4-25 MHz     | Crystal/ceramic, high accuracy |
| LSI    | Low-Speed Internal  | 32-40 kHz    | For watchdog and RTC           |
| LSE    | Low-Speed External  | 32.768 kHz   | Crystal, precise RTC timing    |

### 6.2 PLL (Phase-Locked Loop)

The PLL multiplies a source clock to produce higher frequencies. On STM32F4, a typical
configuration:

```
  HSE (8 MHz) --> /M (divide by 8) --> 1 MHz VCO input
              --> *N (multiply by 336) --> 336 MHz VCO output
              --> /P (divide by 2) --> 168 MHz SYSCLK
              --> /Q (divide by 7) --> 48 MHz USB clock
```

### 6.3 Clock Tree

```
  Clock Tree (STM32F4 Simplified)
  ================================

  +-----+       +-----+
  | HSI |--+--->| MUX |---> System Clock (SYSCLK)
  | 16M |  |   |     |        |
  +-----+  |   +-----+        |
            |     ^            v
  +-----+  |     |      +----------+
  | HSE |--+-----+      | AHB Prescaler |---> HCLK (CPU, DMA, memory)
  | 8M  |--+            |  /1,2,..,512  |       |
  +-----+  |            +----------+       |
            v                              v
  +-----+ +-----+                  +-------------+
  | /M  |>| PLL |>-----+          | APB1 Prescaler|---> PCLK1 (42 MHz max)
  +-----+ | *N  |      |          |  /1,2,4,8,16  |     (UART, I2C, TIM2-7)
           | /P  |------+          +-------------+
           | /Q  |----> USB 48M          |
           +-----+                 +-------------+
                                   | APB2 Prescaler|---> PCLK2 (84 MHz max)
  +-----+                         |  /1,2,4,8,16  |     (SPI1, USART1, TIM1)
  | LSI |---> IWDG                +-------------+
  | 32k |
  +-----+

  +-----+
  | LSE |---> RTC
  |32768|
  +-----+
```

### 6.4 Clock Configuration in Code

```c
// STM32F4: Configure HSE + PLL for 168 MHz SYSCLK
void SystemClock_Config(void) {
    // Enable HSE
    RCC->CR |= RCC_CR_HSEON;
    while (!(RCC->CR & RCC_CR_HSERDY));  // Wait for HSE ready

    // Configure PLL: HSE/8 * 336 / 2 = 168 MHz
    RCC->PLLCFGR = (8U << 0)     // PLLM = 8
                  | (336U << 6)   // PLLN = 336
                  | (0U << 16)    // PLLP = 2 (0 means /2)
                  | (1U << 22)    // PLL source = HSE
                  | (7U << 24);   // PLLQ = 7

    RCC->CR |= RCC_CR_PLLON;
    while (!(RCC->CR & RCC_CR_PLLRDY));  // Wait for PLL lock

    // Set Flash wait states for 168 MHz (5 WS)
    FLASH->ACR = FLASH_ACR_LATENCY_5WS
               | FLASH_ACR_ICEN
               | FLASH_ACR_DCEN
               | FLASH_ACR_PRFTEN;

    // AHB=168, APB1=42, APB2=84
    RCC->CFGR = RCC_CFGR_HPRE_DIV1
              | RCC_CFGR_PPRE1_DIV4
              | RCC_CFGR_PPRE2_DIV2
              | RCC_CFGR_SW_PLL;

    while ((RCC->CFGR & RCC_CFGR_SWS) != RCC_CFGR_SWS_PLL);
}
```

---

## 7. Power Modes

Battery-powered devices spend most of their time asleep. Understanding power modes is
critical for achieving multi-year battery life.

### 7.1 Power Mode Comparison

| Mode      | CPU | SRAM | Peripherals | Wake Sources         | Current (typ) |
| --------- | --- | ---- | ----------- | -------------------- | ------------- |
| Run       | ON  | ON   | ON          | N/A                  | 20-100 mA     |
| Sleep     | OFF | ON   | ON          | Any interrupt        | 1-10 mA       |
| Stop/Deep | OFF | ON   | Most OFF    | EXTI, RTC, watchdog  | 1-50 uA       |
| Standby   | OFF | OFF  | OFF         | WKUP pin, RTC, reset | 0.3-3 uA      |
| Shutdown  | OFF | OFF  | OFF         | WKUP pin only        | 20-100 nA     |

### 7.2 Power Mode Flow

```
                     +--------+
                     |  RUN   |  CPU executing instructions
                     +--------+
                      |      ^
               WFI/WFE    Interrupt
                      v      |
                     +--------+
                     | SLEEP  |  CPU halted, peripherals running
                     +--------+
                      |      ^
               SLEEPDEEP  EXTI/RTC
                      v      |
                     +--------+
                     |  STOP  |  Most clocks off, SRAM retained
                     +--------+
                      |      ^
               PDDS bit   WKUP/RTC
                      v      |
                     +--------+
                     |STANDBY |  Only wakeup logic powered
                     +--------+  (SRAM content lost!)
```

### 7.3 MicroPython Deep Sleep Example (ESP32)

```python
import machine
import esp32
from time import sleep

# Configure wake-up source: external pin (GPIO 33) or timer
wake_pin = machine.Pin(33, machine.Pin.IN, machine.Pin.PULL_UP)
esp32.wake_on_ext0(pin=wake_pin, level=esp32.WAKEUP_ALL_LOW)

# Or wake on timer (10 seconds)
# machine.deepsleep(10000)  # milliseconds

print("Going to deep sleep...")
sleep(0.1)  # Allow UART to flush
machine.deepsleep()  # Wake only on pin 33 going LOW
```

---

## 8. Reset Sources

Understanding why your MCU reset is essential for debugging field failures.

| Reset Source         | Cause                                   | Detection Register |
| -------------------- | --------------------------------------- | ------------------ |
| Power-on Reset (POR) | VDD rises above threshold               | RCC_CSR: PORRSTF   |
| External Reset       | NRST pin pulled low                     | RCC_CSR: PINRSTF   |
| Watchdog Reset       | IWDG or WWDG timeout (firmware hung)    | RCC_CSR: IWDGRSTF  |
| Software Reset       | NVIC_SystemReset() called               | RCC_CSR: SFTRSTF   |
| Brown-out Reset      | VDD drops below threshold temporarily   | RCC_CSR: BORRSTF   |
| Low-power Reset      | Entering Stop/Standby with wrong config | RCC_CSR: LPWRRSTF  |

Best practice: Read and log the reset cause register at startup, then clear it.

```c
void check_reset_source(void) {
    uint32_t csr = RCC->CSR;

    if (csr & RCC_CSR_IWDGRSTF) {
        // Log: watchdog reset -- firmware hung!
        log_event(RESET_WATCHDOG);
    } else if (csr & RCC_CSR_SFTRSTF) {
        log_event(RESET_SOFTWARE);
    } else if (csr & RCC_CSR_PORRSTF) {
        log_event(RESET_POWER_ON);
    } else if (csr & RCC_CSR_BORRSTF) {
        log_event(RESET_BROWNOUT);
    }

    RCC->CSR |= RCC_CSR_RMVF;  // Clear reset flags
}
```

---

## 9. Silicon Vendor Ecosystem

Choosing a microcontroller family is a long-term commitment. You are buying into an
ecosystem: toolchains, HAL libraries, documentation, community, and supply chain.

### 9.1 Major Vendors

| Vendor       | Family        | Core           | Strengths                      |
| ------------ | ------------- | -------------- | ------------------------------ |
| STMicro      | STM32         | Cortex-M0..M7  | Widest portfolio, CubeMX tools |
| NXP          | LPC, i.MX RT  | Cortex-M0..M7  | Industrial, automotive         |
| Nordic Semi  | nRF52/53      | Cortex-M4/M33  | BLE leader, low power          |
| Texas Inst.  | MSP430, C2000 | MSP430, Cortex | Ultra-low power (MSP430)       |
| Espressif    | ESP32         | Xtensa, RISC-V | Wi-Fi + BLE, hobbyist favorite |
| Microchip    | PIC, SAM      | PIC, Cortex-M  | Legacy PIC, AVR (Arduino)      |
| Raspberry Pi | RP2040/2350   | Cortex-M0+     | Low cost, PIO state machines   |

### 9.2 Selection Criteria

When choosing an MCU for a product, evaluate:

1. **Peripherals**: Does it have the interfaces you need (CAN, USB, Ethernet)?
2. **Memory**: Enough Flash for firmware + OTA staging? Enough SRAM for buffers?
3. **Power consumption**: Critical for battery applications.
4. **Ecosystem**: SDK quality, IDE support, community forums, example code.
5. **Supply chain**: Availability, second sources, long-term production commitment.
6. **Security**: TrustZone, secure boot, hardware crypto engine.
7. **Cost**: At volume (10k+ units), even $0.10 per unit matters.
8. **Package**: QFN, LQFP, BGA -- affects PCB design and assembly cost.

### 9.3 Development Boards

| Board               | MCU             | Price | Notable Features         |
| ------------------- | --------------- | ----- | ------------------------ |
| STM32 Nucleo-F446RE | STM32F446RE     | ~$15  | Arduino headers, ST-Link |
| nRF52840 DK         | nRF52840        | ~$40  | BLE 5, USB, NFC          |
| ESP32-DevKitC       | ESP32-WROOM-32  | ~$8   | Wi-Fi, BLE, breadboard   |
| Raspberry Pi Pico   | RP2040          | ~$4   | Dual M0+, PIO, USB       |
| Arduino Uno R4      | RA4M1 (Renesas) | ~$27  | Arduino ecosystem, BLE   |

---

## 10. Putting It All Together: MCU Startup Sequence

When you power on an MCU, here is what happens before your `main()` runs:

```
  MCU Power-On Sequence
  =====================

  1. Power applied, voltage ramps up
         |
  2. POR circuit detects VDD > threshold
         |
  3. Internal RC oscillator (HSI) starts
         |
  4. CPU released from reset
         |
  5. CPU reads address 0x00000000 --> Initial Stack Pointer (MSP)
         |
  6. CPU reads address 0x00000004 --> Reset Handler address
         |
  7. CPU jumps to Reset Handler
         |
  8. Reset Handler:
     a) Copy .data section from Flash to SRAM
     b) Zero-fill .bss section in SRAM
     c) Initialize C runtime (libc_init_array)
     d) Call SystemInit() -- configure clocks
     e) Call main()
         |
  9. main() begins executing your application
```

This sequence is explored in depth in Chapter 2 (Bare-Metal Programming).

---

## 11. Practical Example: Blink LED in C (STM32F4)

A complete bare-metal blink without any HAL or library -- just register access.

```c
#include <stdint.h>

// Register definitions (STM32F411, GPIOA Pin 5 = Nucleo LED)
#define RCC_AHB1ENR    (*(volatile uint32_t *)0x40023830)
#define GPIOA_MODER    (*(volatile uint32_t *)0x40020000)
#define GPIOA_ODR      (*(volatile uint32_t *)0x40020014)

int main(void) {
    // 1. Enable GPIOA clock
    RCC_AHB1ENR |= (1U << 0);  // Bit 0 = GPIOAEN

    // 2. Set PA5 as output (MODER bits [11:10] = 01)
    GPIOA_MODER &= ~(3U << 10);  // Clear bits
    GPIOA_MODER |=  (1U << 10);  // Set as output

    // 3. Toggle LED in a loop
    while (1) {
        GPIOA_ODR ^= (1U << 5);  // Toggle PA5

        // Crude delay (not accurate, depends on clock)
        for (volatile uint32_t i = 0; i < 500000; i++);
    }
}
```

### MicroPython Equivalent (ESP32 or RP2040)

```python
from machine import Pin
from time import sleep

led = Pin(25, Pin.OUT)  # GPIO 25 on Pico, GPIO 2 on ESP32

while True:
    led.toggle()
    sleep(0.5)
```

---

## 12. Debugging Tools and Techniques

| Tool / Method      | Use Case                                      |
| ------------------ | --------------------------------------------- |
| SWD / JTAG         | Step debugging, breakpoints, register inspect |
| OpenOCD            | Open-source debug server for SWD/JTAG         |
| GDB                | Command-line debugger, used with OpenOCD      |
| Logic Analyzer     | Capture digital signals (SPI, I2C, UART)      |
| Oscilloscope       | Analog signal measurement, power analysis     |
| printf via SWO/ITM | Lightweight trace output through debug port   |
| Segger RTT         | Real-time transfer, faster than UART printf   |
| Hard Fault Handler | Decode fault address from stacked registers   |

### Reading a Hard Fault

When a Cortex-M hits a hard fault (null pointer dereference, misaligned access, etc.),
the CPU stacks R0-R3, R12, LR, PC, and xPSR onto the current stack. A fault handler
can read these to find exactly which instruction caused the crash.

```c
void HardFault_Handler(void) {
    __asm volatile (
        "TST LR, #4       \n"   // Check which stack was used
        "ITE EQ            \n"
        "MRSEQ R0, MSP     \n"  // Main Stack Pointer
        "MRSNE R0, PSP     \n"  // Process Stack Pointer
        "B hard_fault_info  \n"
    );
}

void hard_fault_info(uint32_t *stack_frame) {
    volatile uint32_t r0  = stack_frame[0];
    volatile uint32_t r1  = stack_frame[1];
    volatile uint32_t r2  = stack_frame[2];
    volatile uint32_t r3  = stack_frame[3];
    volatile uint32_t r12 = stack_frame[4];
    volatile uint32_t lr  = stack_frame[5];
    volatile uint32_t pc  = stack_frame[6];  // <-- Faulting instruction
    volatile uint32_t psr = stack_frame[7];

    // Log or breakpoint here: pc tells you WHERE the fault happened
    while (1);
}
```

---

## Interview Questions

**Q1: What is the fundamental difference between a microcontroller and a microprocessor?**
A: A microcontroller integrates CPU, memory (Flash + SRAM), and peripherals on a single
chip. A microprocessor is just the CPU core and requires external memory and peripheral
chips. MCUs trade raw performance for integration, lower power, and lower cost.

**Q2: Why must peripheral registers be declared as `volatile` in C?**
A: The `volatile` keyword prevents the compiler from optimizing away reads or writes to
hardware registers. Without it, the compiler may cache a register value in a CPU register
and never re-read the actual hardware, missing state changes made by the peripheral.

**Q3: Explain the ARM Cortex-M memory map. Why is it standardized?**
A: The 4 GB address space is divided into fixed regions: Code (0x0000_0000), SRAM
(0x2000_0000), Peripherals (0x4000_0000), External RAM (0x6000_0000), External Device
(0xA000_0000), and Private Peripheral Bus (0xE000_0000). Standardization lets tools,
debuggers, and RTOS kernels work across different vendors without modification.

**Q4: What is the advantage of BSRR over ODR for GPIO control?**
A: BSRR provides atomic bit set/reset without read-modify-write. ODR requires reading
the current value, modifying it, and writing it back -- which creates a race condition
if an interrupt modifies the same register between the read and write.

**Q5: Describe the PLL and its role in the clock system.**
A: A Phase-Locked Loop multiplies a reference clock (HSI or HSE) to produce a higher
frequency. Configurable dividers (M, N, P, Q) allow generating multiple output clocks
from one source. It enables running the CPU at high speeds (e.g., 168 MHz) from an
8 MHz crystal.

**Q6: What happens at address 0x00000000 and 0x00000004 on Cortex-M after reset?**
A: Address 0x0000_0000 contains the initial value of the Main Stack Pointer (MSP).
Address 0x0000_0004 contains the address of the Reset Handler. The CPU loads MSP first,
then jumps to the Reset Handler to begin execution.

**Q7: Why does an MCU need both Flash and SRAM?**
A: Flash is non-volatile and stores the program code and constants -- it persists
without power. SRAM is volatile but fast (single-cycle access) and stores runtime data:
stack, heap, and global variables. Flash has limited write endurance, making it unsuitable
for frequently changing data.

**Q8: What is a brown-out reset and why is it important?**
A: A brown-out reset occurs when VDD drops below a configured threshold but does not
go all the way to zero. Without a BOR, the MCU might continue running at an
insufficient voltage, causing erratic behavior or Flash corruption. The BOR circuit
holds the MCU in reset until the voltage is stable.

**Q9: Compare ARM Cortex-M4 and Cortex-M7. When would you choose each?**
A: The M4 has a 3-stage pipeline with optional FPU and DSP instructions -- suitable for
motor control, audio processing, and general embedded use. The M7 has a 6-stage
superscalar pipeline with instruction/data caches and TCM, delivering 2x+ performance.
Choose M7 when you need high throughput (e.g., real-time signal processing at high
sample rates) and can justify the higher cost and power.

**Q10: How do you choose between HSI and HSE as a clock source?**
A: HSI is an internal RC oscillator -- fast startup, no external components, but less
accurate (typically 1-2% tolerance). HSE uses an external crystal with 10-50 ppm
accuracy. Use HSE when you need precise timing (UART baud rates, USB, CAN). Use HSI
for quick prototyping or when board space and cost are constrained.

**Q11: What is the purpose of the NVIC in ARM Cortex-M?**
A: The Nested Vectored Interrupt Controller manages interrupt prioritization and
dispatching. It supports configurable priority levels, automatic context saving/
restoring, tail-chaining (back-to-back ISRs without full context switch), and late
arrival (higher-priority ISR preempts during stacking). It eliminates the need for
software interrupt prioritization.

**Q12: Explain deep sleep vs. standby mode. What is the tradeoff?**
A: In deep sleep (Stop mode), the CPU and most clocks are off but SRAM is retained --
the MCU wakes quickly and resumes where it left off. In Standby, SRAM content is lost
and the MCU effectively reboots on wake. Standby draws much less current (sub-uA) but
has a longer wake time and loses state.

**Q13: What is RISC-V and why is it gaining traction in embedded?**
A: RISC-V is an open-source ISA with no license fees. Silicon vendors can implement it
without paying ARM royalties. Its modular extension system (I, M, A, F, C) lets
designers include only what they need, reducing die area and cost. Espressif's ESP32-C3
and C6 demonstrate commercial RISC-V MCU viability.

**Q14: How would you debug a hard fault on a Cortex-M device?**
A: Implement a HardFault_Handler that reads the stacked PC (program counter) from the
exception frame. The PC tells you the exact instruction that faulted. Check the
Configurable Fault Status Register (CFSR) to determine the fault type (bus fault,
usage fault, memory management fault). Use the PC value with the .map file or
addr2line to find the source code line.

**Q15: A device works on the bench but resets randomly in the field. What do you check?**
A: (1) Read the reset cause register at boot to determine if it is watchdog, brown-out,
or external reset. (2) Check power supply stability -- use an oscilloscope to look for
voltage dips or noise. (3) Verify decoupling capacitors are present and properly placed.
(4) Check for EMI susceptibility if near motors or RF transmitters. (5) Ensure the
watchdog is being fed on all code paths, including error handlers.
