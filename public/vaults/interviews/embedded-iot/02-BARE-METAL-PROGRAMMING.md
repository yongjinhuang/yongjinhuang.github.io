# Chapter 2: Bare-Metal Programming -- Code Without an OS

Bare-metal programming means writing firmware that runs directly on hardware with no
operating system. You control everything: the startup sequence, memory layout, interrupt
handling, and peripheral access. This chapter equips you with the knowledge to write,
link, and debug firmware from the reset vector to a running application.

---

## 1. The Startup Sequence

When power is applied to a Cortex-M microcontroller, the hardware performs a fixed
sequence before any of your code runs. Understanding this sequence is non-negotiable
for embedded engineers.

### 1.1 What Happens Before main()

```
  Power On
     |
     v
  +---------------------------+
  | Power-On Reset (POR)      |  Hardware holds CPU in reset until VDD stable
  +---------------------------+
     |
     v
  +---------------------------+
  | Load MSP from 0x00000000  |  CPU loads initial stack pointer
  +---------------------------+
     |
     v
  +---------------------------+
  | Load PC from 0x00000004   |  CPU loads Reset_Handler address
  +---------------------------+
     |
     v
  +---------------------------+
  | Reset_Handler()           |  Your startup code begins
  |   1. Copy .data to SRAM   |  (initialized globals)
  |   2. Zero-fill .bss       |  (uninitialized globals)
  |   3. Call SystemInit()     |  (clock configuration)
  |   4. Call __libc_init()    |  (C runtime, constructors)
  |   5. Call main()           |
  +---------------------------+
     |
     v
  +---------------------------+
  | main() executes           |  Your application code
  | (should never return)     |
  +---------------------------+
```

### 1.2 Reset Handler in Assembly (Cortex-M)

```asm
    .syntax unified
    .cpu cortex-m4
    .thumb

    .section .text.Reset_Handler
    .global Reset_Handler
    .type Reset_Handler, %function

Reset_Handler:
    /* Copy .data from Flash to SRAM */
    ldr     r0, =_sdata          /* Destination: start of .data in SRAM */
    ldr     r1, =_edata          /* End of .data in SRAM */
    ldr     r2, =_sidata         /* Source: .data load address in Flash */

copy_data:
    cmp     r0, r1
    bge     zero_bss
    ldr     r3, [r2], #4         /* Load word from Flash, post-increment */
    str     r3, [r0], #4         /* Store word to SRAM, post-increment */
    b       copy_data

zero_bss:
    /* Zero-fill .bss section */
    ldr     r0, =_sbss           /* Start of .bss */
    ldr     r1, =_ebss           /* End of .bss */
    movs    r2, #0

fill_bss:
    cmp     r0, r1
    bge     call_main
    str     r2, [r0], #4         /* Store zero, post-increment */
    b       fill_bss

call_main:
    bl      SystemInit            /* Configure clocks */
    bl      __libc_init_array     /* C++ constructors, init functions */
    bl      main                  /* Enter application */

    /* main() should never return; trap if it does */
hang:
    b       hang

    .size Reset_Handler, .-Reset_Handler
```

### 1.3 Why .data Needs Copying

Initialized global variables (e.g., `int count = 42;`) have their initial values stored
in Flash (non-volatile). But at runtime, the variable must live in SRAM (read-write).
The startup code copies these initial values from Flash to their SRAM addresses.

### 1.4 Why .bss Needs Zeroing

The C standard guarantees that uninitialized global and static variables are zero. The
startup code must zero-fill the .bss section in SRAM to satisfy this guarantee. The .bss
section is not stored in Flash (no point storing zeros), saving Flash space.

---

## 2. The Vector Table

The vector table is an array of function pointers stored at the beginning of Flash. It
tells the CPU where to jump for each exception and interrupt.

```
  Vector Table (Cortex-M, starting at 0x00000000)
  ================================================

  Offset  | Entry               | Description
  --------|---------------------|----------------------------------
  0x0000  | Initial MSP value   | Stack pointer loaded at reset
  0x0004  | Reset_Handler       | Entry point after reset
  0x0008  | NMI_Handler         | Non-Maskable Interrupt
  0x000C  | HardFault_Handler   | All fault types (if not configured)
  0x0010  | MemManage_Handler   | Memory protection fault
  0x0014  | BusFault_Handler    | Bus error during access
  0x0018  | UsageFault_Handler  | Undefined instruction, alignment
  0x001C  | Reserved            |
  ...     | ...                 |
  0x002C  | SVC_Handler         | Supervisor Call (used by RTOS)
  0x0030  | DebugMon_Handler    | Debug Monitor
  0x0034  | Reserved            |
  0x0038  | PendSV_Handler      | Pendable Service (RTOS context switch)
  0x003C  | SysTick_Handler     | System Timer tick
  0x0040  | IRQ0_Handler        | First external interrupt (vendor)
  0x0044  | IRQ1_Handler        | Second external interrupt
  ...     | ...                 | (up to 240 external interrupts)
```

### Vector Table Implementation in C

```c
#include <stdint.h>

// Forward declarations
extern uint32_t _estack;       // Defined by linker script
void Reset_Handler(void);
void Default_Handler(void);
void NMI_Handler(void)        __attribute__((weak, alias("Default_Handler")));
void HardFault_Handler(void)  __attribute__((weak, alias("Default_Handler")));
void SysTick_Handler(void)    __attribute__((weak, alias("Default_Handler")));
// ... more handlers ...

// Vector table placed in .isr_vector section
__attribute__((section(".isr_vector")))
const uint32_t vector_table[] = {
    (uint32_t)&_estack,           // Initial stack pointer
    (uint32_t)&Reset_Handler,     // Reset
    (uint32_t)&NMI_Handler,       // NMI
    (uint32_t)&HardFault_Handler, // Hard Fault
    // ... more entries ...
    (uint32_t)&SysTick_Handler,   // SysTick
    // External interrupts (IRQ0, IRQ1, ...)
};

void Default_Handler(void) {
    while (1);  // Trap unhandled interrupts
}
```

The `weak` and `alias` attributes allow application code to override any handler by
simply defining a function with the same name. If no override exists, the
`Default_Handler` traps execution.

---

## 3. Linker Scripts

The linker script is the blueprint that tells the linker where to place each section of
your program in the MCU's memory. Without it, the linker has no idea how much Flash or
SRAM you have, or where they are located.

### 3.1 Memory Regions

```ld
/* STM32F411 Linker Script (simplified) */
MEMORY
{
    FLASH  (rx)  : ORIGIN = 0x08000000, LENGTH = 512K
    SRAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}
```

### 3.2 Section Placement

```ld
SECTIONS
{
    /* Vector table and code go in Flash */
    .isr_vector :
    {
        . = ALIGN(4);
        KEEP(*(.isr_vector))
        . = ALIGN(4);
    } > FLASH

    .text :
    {
        . = ALIGN(4);
        *(.text)           /* Code */
        *(.text*)
        *(.rodata)         /* Read-only data (const, strings) */
        *(.rodata*)
        . = ALIGN(4);
        _etext = .;        /* End of text marker */
    } > FLASH

    /* Initialized data: stored in Flash, copied to SRAM at startup */
    _sidata = LOADADDR(.data);

    .data :
    {
        . = ALIGN(4);
        _sdata = .;        /* Start of .data in SRAM */
        *(.data)
        *(.data*)
        . = ALIGN(4);
        _edata = .;        /* End of .data in SRAM */
    } > SRAM AT> FLASH     /* VMA in SRAM, LMA in Flash */

    /* Uninitialized data: zero-filled at startup */
    .bss :
    {
        . = ALIGN(4);
        _sbss = .;
        *(.bss)
        *(.bss*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
    } > SRAM

    /* Heap grows up from end of .bss */
    . = ALIGN(8);
    _heap_start = .;

    /* Stack at top of SRAM, grows downward */
    _estack = ORIGIN(SRAM) + LENGTH(SRAM);
}
```

### 3.3 Memory Layout Diagram

```
  Flash (0x08000000 - 0x0807FFFF)    SRAM (0x20000000 - 0x2001FFFF)
  ================================    ================================

  0x08000000 +------------------+    0x20000000 +------------------+
             | .isr_vector      |               | .data            |
             | (vector table)   |               | (copied from     |
             +------------------+               |  Flash at boot)  |
             | .text            |               +------------------+
             | (program code)   |               | .bss             |
             |                  |               | (zeroed at boot) |
             +------------------+               +------------------+
             | .rodata          |               | Heap -->         |
             | (const data,     |               |                  |
             |  string literals)|               |   (grows up)     |
             +------------------+               |                  |
             | .data init values|               |                  |
             | (load address)   |               |   (grows down)   |
             +------------------+               |                  |
             |                  |               |          <-- Stack|
             | (unused Flash)   |    0x2001FFFF +------------------+
  0x0807FFFF +------------------+               _estack
```

### 3.4 VMA vs. LMA

- **VMA** (Virtual Memory Address): The address the code uses at runtime.
- **LMA** (Load Memory Address): The address where the data is physically stored.

For `.data`, VMA is in SRAM (where the code reads/writes the variable) and LMA is in
Flash (where the initial value is stored). The startup code copies from LMA to VMA.

---

## 4. Memory-Mapped I/O and the `volatile` Keyword

### 4.1 Why `volatile` Is Non-Negotiable

Consider reading a GPIO input register in a polling loop:

```c
// WITHOUT volatile -- BROKEN
uint32_t *gpio_idr = (uint32_t *)0x40020010;

while (*gpio_idr & (1U << 0)) {
    // Wait for pin 0 to go low
}
```

The compiler sees that `*gpio_idr` is never modified inside the loop. With
optimizations enabled, it reads the value once, caches it in a CPU register, and checks
the cached value forever -- an infinite loop even if the pin changes.

```c
// WITH volatile -- CORRECT
volatile uint32_t *gpio_idr = (volatile uint32_t *)0x40020010;

while (*gpio_idr & (1U << 0)) {
    // Compiler re-reads from hardware address every iteration
}
```

### 4.2 Common `volatile` Pitfalls

```c
// Pitfall 1: Forgetting volatile on a DMA buffer
uint8_t dma_buffer[256];  // BUG: compiler may not re-read after DMA completes
volatile uint8_t dma_buffer[256];  // Correct

// Pitfall 2: Volatile does NOT guarantee atomicity
volatile uint32_t counter;
counter++;  // This is still a read-modify-write (not atomic on all values)

// Pitfall 3: Pointer to volatile vs. volatile pointer
volatile uint32_t *p;  // Pointer to volatile data (what you usually want)
uint32_t *volatile p;  // Volatile pointer (rare, for DMA scatter-gather)
```

### 4.3 Register Access Patterns

Professional firmware uses structs for register blocks:

```c
typedef struct {
    volatile uint32_t MODER;    // Offset 0x00
    volatile uint32_t OTYPER;   // Offset 0x04
    volatile uint32_t OSPEEDR;  // Offset 0x08
    volatile uint32_t PUPDR;    // Offset 0x0C
    volatile uint32_t IDR;      // Offset 0x10
    volatile uint32_t ODR;      // Offset 0x14
    volatile uint32_t BSRR;     // Offset 0x18
    volatile uint32_t LCKR;     // Offset 0x1C
    volatile uint32_t AFR[2];   // Offset 0x20, 0x24
} GPIO_TypeDef;

#define GPIOA  ((GPIO_TypeDef *)0x40020000)
#define GPIOB  ((GPIO_TypeDef *)0x40020400)

// Usage: clean, type-safe, self-documenting
GPIOA->BSRR = (1U << 5);  // Set PA5
```

---

## 5. GPIO Programming

General-Purpose Input/Output is the most fundamental peripheral. Every MCU has GPIO.

### 5.1 Pin Modes

```
  GPIO Pin Modes (STM32)
  =======================

  +-------------------+
  | Input Mode        |  Read external signal
  |  - Floating       |  (no pull, susceptible to noise)
  |  - Pull-up        |  (internal resistor to VDD)
  |  - Pull-down      |  (internal resistor to GND)
  +-------------------+

  +-------------------+
  | Output Mode       |  Drive external signal
  |  - Push-Pull      |  (drives HIGH and LOW actively)
  |  - Open-Drain     |  (drives LOW, floats HIGH)
  +-------------------+

  +-------------------+
  | Alternate Function|  Connect pin to peripheral
  |  (UART TX, SPI    |  (pin controlled by peripheral,
  |   CLK, I2C SDA)   |   not GPIO registers)
  +-------------------+

  +-------------------+
  | Analog Mode       |  Connect pin to ADC/DAC
  |  (disables digital|  (lowest power consumption)
  |   input buffer)   |
  +-------------------+
```

### 5.2 Push-Pull vs. Open-Drain

```
  Push-Pull Output                Open-Drain Output
  ================                ==================

  VDD ----+                       VDD ---[R_pullup]---+
          |                                           |
     [P-FET]                                     +----+---- Output
          |                                      |
     +----+---- Output                      [N-FET]
          |                                      |
     [N-FET]                                    GND
          |
         GND

  - Drives HIGH and LOW             - Drives LOW only
  - Cannot wire-OR                   - Can wire-OR (I2C, 1-Wire)
  - Higher current drive             - Needs external pull-up
  - Most common mode                 - Allows level shifting
```

### 5.3 GPIO Configuration Example (STM32)

```c
void gpio_init(void) {
    // Enable GPIOA and GPIOC clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN | RCC_AHB1ENR_GPIOCEN;

    // PA5: Output, push-pull, medium speed (LED)
    GPIOA->MODER  &= ~(3U << 10);
    GPIOA->MODER  |=  (1U << 10);   // Output mode
    GPIOA->OTYPER &= ~(1U << 5);    // Push-pull
    GPIOA->OSPEEDR |= (1U << 10);   // Medium speed

    // PC13: Input with pull-up (user button, active LOW)
    GPIOC->MODER  &= ~(3U << 26);   // Input mode (00)
    GPIOC->PUPDR  &= ~(3U << 26);
    GPIOC->PUPDR  |=  (1U << 26);   // Pull-up

    // PA9: Alternate function 7 (USART1_TX)
    GPIOA->MODER  &= ~(3U << 18);
    GPIOA->MODER  |=  (2U << 18);   // Alternate function (10)
    GPIOA->AFR[1] &= ~(0xFU << 4);
    GPIOA->AFR[1] |=  (7U << 4);    // AF7 = USART1
}
```

### 5.4 MicroPython GPIO (RP2040)

```python
from machine import Pin

# Output: onboard LED
led = Pin(25, Pin.OUT)
led.value(1)  # ON
led.value(0)  # OFF

# Input with pull-up (button)
button = Pin(14, Pin.IN, Pin.PULL_UP)
if button.value() == 0:
    print("Button pressed (active LOW)")

# Input with IRQ
def button_isr(pin):
    led.toggle()

button.irq(trigger=Pin.IRQ_FALLING, handler=button_isr)
```

---

## 6. Timers and Counters

Timers are among the most versatile peripherals. They count clock cycles and can
generate signals, measure signals, or trigger events at precise intervals.

### 6.1 Timer Modes

| Mode           | Description                                   | Use Case              |
| -------------- | --------------------------------------------- | --------------------- |
| Basic counting | Count up/down, generate interrupt on overflow | Periodic tasks        |
| PWM generation | Output Compare toggles pin at match value     | Motor control, LEDs   |
| Input capture  | Record counter value on external edge         | Frequency measurement |
| One-pulse      | Generate single pulse of precise width        | Trigger signals       |
| Encoder mode   | Count quadrature encoder signals              | Rotary position       |

### 6.2 PWM Generation

```
  PWM Signal (Timer Output Compare)
  ===================================

  Counter value (ARR = 999, CCR = 300)

  999 |                         /|                         /|
      |                       /  |                       /  |
      |                     /    |                     /    |
  300 |---+               /      |---+               /      |
      |   |             /        |   |             /        |
      |   |           /          |   |           /          |
      |   |         /            |   |         /            |
    0 |   |       /              |   |       /              |
      +---+-----+---------------+---+-----+-----------------> time
      |<->|                      |<->|
       30%       70%              30%       70%
      |<---- Period (ARR) ----->|
       Duty = CCR / ARR = 30%

  Output pin:
      ___                        ___
  ___|   |______________________|   |______________________
     HIGH        LOW             HIGH        LOW
```

### 6.3 PWM Code (STM32 TIM2, PA5)

```c
void pwm_init(void) {
    // Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB1ENR |= RCC_APB1ENR_TIM2EN;

    // PA5 -> AF1 (TIM2_CH1)
    GPIOA->MODER  &= ~(3U << 10);
    GPIOA->MODER  |=  (2U << 10);  // Alternate function
    GPIOA->AFR[0] &= ~(0xFU << 20);
    GPIOA->AFR[0] |=  (1U << 20);  // AF1

    // Configure TIM2
    TIM2->PSC = 83;      // Prescaler: 84 MHz / 84 = 1 MHz tick
    TIM2->ARR = 999;     // Auto-reload: 1 MHz / 1000 = 1 kHz PWM
    TIM2->CCR1 = 300;    // 30% duty cycle (300/1000)
    TIM2->CCMR1 = (6U << 4)   // OC1M = PWM Mode 1
                | (1U << 3);   // OC1PE = preload enable
    TIM2->CCER  = TIM_CCER_CC1E;  // Enable CH1 output
    TIM2->CR1   = TIM_CR1_CEN;    // Start timer
}

void set_duty_cycle(uint16_t duty_permille) {
    // duty_permille: 0-1000 (0.0% - 100.0%)
    TIM2->CCR1 = (uint32_t)duty_permille * TIM2->ARR / 1000;
}
```

### 6.4 Timer Interrupt (Periodic Task)

```c
void timer_interrupt_init(void) {
    RCC->APB1ENR |= RCC_APB1ENR_TIM3EN;

    TIM3->PSC = 8399;    // 84 MHz / 8400 = 10 kHz
    TIM3->ARR = 9999;    // 10 kHz / 10000 = 1 Hz (1 second)
    TIM3->DIER = TIM_DIER_UIE;  // Update interrupt enable
    TIM3->CR1  = TIM_CR1_CEN;

    NVIC_SetPriority(TIM3_IRQn, 3);
    NVIC_EnableIRQ(TIM3_IRQn);
}

void TIM3_IRQHandler(void) {
    if (TIM3->SR & TIM_SR_UIF) {
        TIM3->SR &= ~TIM_SR_UIF;  // Clear interrupt flag
        // Toggle LED every second
        GPIOA->ODR ^= (1U << 5);
    }
}
```

### 6.5 MicroPython PWM (ESP32)

```python
from machine import Pin, PWM

# Create PWM on GPIO 2 (onboard LED on many ESP32 boards)
pwm = PWM(Pin(2))
pwm.freq(1000)       # 1 kHz
pwm.duty_u16(32768)  # 50% duty (0-65535 range)

# LED breathing effect
import time
for i in range(0, 65535, 256):
    pwm.duty_u16(i)
    time.sleep_ms(5)
```

---

## 7. Interrupt Handling

Interrupts are the mechanism that allows hardware events to preempt the main program.
They are essential for responsive, low-power firmware.

### 7.1 Interrupt Flow (Cortex-M)

```
  Interrupt Processing (Cortex-M)
  ================================

  Main code executing
         |
  [Hardware event: e.g., UART byte received]
         |
         v
  +-------------------------------+
  | 1. NVIC detects pending IRQ   |
  | 2. Check priority vs current  |
  +-------------------------------+
         |  (priority high enough)
         v
  +-------------------------------+
  | 3. Hardware stacks context:   |
  |    R0-R3, R12, LR, PC, xPSR  |
  |    (pushed to current stack)  |
  +-------------------------------+
         |
         v
  +-------------------------------+
  | 4. Load ISR address from      |
  |    vector table               |
  +-------------------------------+
         |
         v
  +-------------------------------+
  | 5. Execute ISR                |
  |    - Clear interrupt flag     |
  |    - Handle event             |
  |    - Set flag / write buffer  |
  +-------------------------------+
         |
         v
  +-------------------------------+
  | 6. ISR returns (BX LR with   |
  |    EXC_RETURN magic value)    |
  +-------------------------------+
         |
         v
  +-------------------------------+
  | 7. Hardware unstacks context  |
  |    Resumes main code          |
  +-------------------------------+
```

### 7.2 NVIC Priority System

Cortex-M supports preemptive priority-based interrupts. The NVIC uses a priority
register for each IRQ (typically 4-8 bits, vendor-configurable).

```
  Priority Grouping (STM32: 4 bits = 16 levels)
  =============================================

  NVIC_PriorityGroup_4:  [4 bits preempt : 0 bits sub]
    - 16 preemption levels, no sub-priority
    - Higher preempt level can interrupt lower

  NVIC_PriorityGroup_3:  [3 bits preempt : 1 bit sub]
    - 8 preemption levels, 2 sub-priority levels
    - Sub-priority only affects order when same preempt level pending

  Lower number = Higher priority  (0 is highest)

  Example scenario:
    IRQ_A priority = 1  (high)
    IRQ_B priority = 3  (low)

    IRQ_B is executing
         |
    IRQ_A fires --> preempts IRQ_B (nested interrupt)
         |
    IRQ_A completes --> IRQ_B resumes
```

### 7.3 ISR Best Practices

1. **Keep ISRs short**: Set a flag, copy data to a buffer, return. Do heavy processing
   in main loop.

2. **Clear the interrupt flag first**: Prevents the ISR from re-firing immediately.

3. **Use `volatile` for shared variables**: The compiler must re-read variables modified
   in ISRs.

4. **Avoid blocking calls**: No `delay()`, no `printf()`, no `malloc()` in ISRs.

5. **Be aware of reentrancy**: ISRs can preempt main code or lower-priority ISRs.
   Shared data needs protection.

```c
// Shared variable pattern
volatile uint8_t uart_rx_flag = 0;
volatile uint8_t uart_rx_data;

void USART1_IRQHandler(void) {
    if (USART1->SR & USART_SR_RXNE) {
        uart_rx_data = (uint8_t)USART1->DR;  // Read clears RXNE flag
        uart_rx_flag = 1;
    }
}

int main(void) {
    // ... init ...
    while (1) {
        if (uart_rx_flag) {
            uart_rx_flag = 0;
            process_byte(uart_rx_data);  // Heavy processing in main loop
        }
        // ... other tasks ...
    }
}
```

### 7.4 Memory Barriers

On Cortex-M7 and higher cores with caches or write buffers, a memory barrier may be
needed after clearing an interrupt flag to ensure the write completes before the ISR
returns:

```c
void TIM3_IRQHandler(void) {
    TIM3->SR &= ~TIM_SR_UIF;
    __DSB();  // Data Synchronization Barrier -- ensures write completes
    // ... handle interrupt ...
}
```

Without the `__DSB()`, the NVIC might see the flag still set (due to write buffering)
and re-enter the ISR spuriously.

---

## 8. DMA (Direct Memory Access)

DMA allows peripherals to transfer data to/from memory without CPU intervention. This
is essential for high-throughput data transfers (ADC sampling, UART bulk transfer,
SPI communication).

### 8.1 DMA Data Flow

```
  DMA Transfer: ADC -> Memory (No CPU Involvement)
  ==================================================

  +-------+                           +---------+
  |  ADC  |---[data]----> DMA Ch. --> |  SRAM   |
  |       |              Controller   | Buffer  |
  +-------+              +--------+   +---------+
                          | Ch. 0  |
  +-------+              | Ch. 1  |   +---------+
  | UART  |<--[data]---- | Ch. 2  |<--| SRAM    |
  |  TX   |              | ...    |   | TX Buf  |
  +-------+              | Ch. 7  |   +---------+
                          +--------+
                              |
                          [Transfer Complete IRQ]
                              |
                              v
                          CPU notified
                          (process data)
```

### 8.2 DMA Modes

| Mode          | Description                                           |
| ------------- | ----------------------------------------------------- |
| Normal        | Transfer N words, then stop. CPU must restart.        |
| Circular      | Auto-restart after N words. Continuous streaming.     |
| Double Buffer | Two buffers; DMA fills one while CPU processes other. |
| Memory-to-Mem | Copy data between SRAM regions (memcpy via DMA).      |

### 8.3 Circular DMA with Double Buffering

```
  Double-Buffer DMA (ADC Continuous Sampling)
  =============================================

  Time -->

  DMA fills Buffer A          DMA fills Buffer B
  +------------------+        +------------------+
  | Buffer A         |        | Buffer B         |
  | [sample][sample] |        | [sample][sample] |
  +------------------+        +------------------+
         |                           |
  CPU processes Buffer B      CPU processes Buffer A
  (from previous cycle)       (from previous cycle)

  Half-Transfer IRQ    Transfer-Complete IRQ
  (Buffer A full)      (Buffer B full)
```

### 8.4 DMA Configuration Example (STM32, UART TX)

```c
void dma_uart_tx_init(void) {
    // Enable DMA1 clock
    RCC->AHB1ENR |= RCC_AHB1ENR_DMA1EN;

    // DMA1 Stream 6, Channel 4 = USART2_TX on STM32F4

    // Disable stream before configuration
    DMA1_Stream6->CR &= ~DMA_SxCR_EN;
    while (DMA1_Stream6->CR & DMA_SxCR_EN);  // Wait until disabled

    DMA1_Stream6->CR = (4U << 25)        // Channel 4
                     | DMA_SxCR_MINC     // Memory increment
                     | (1U << 6)         // Memory-to-peripheral
                     | DMA_SxCR_TCIE;    // Transfer complete interrupt

    DMA1_Stream6->PAR  = (uint32_t)&USART2->DR;   // Peripheral address
    // Memory address and count set per transfer

    NVIC_EnableIRQ(DMA1_Stream6_IRQn);
}

void dma_uart_send(const uint8_t *data, uint16_t length) {
    DMA1_Stream6->M0AR = (uint32_t)data;   // Source buffer
    DMA1_Stream6->NDTR = length;            // Number of bytes
    DMA1->HIFCR = 0x3FU << 16;             // Clear all Stream 6 flags
    DMA1_Stream6->CR |= DMA_SxCR_EN;       // Start transfer

    USART2->CR3 |= USART_CR3_DMAT;         // Enable UART DMA TX
}

void DMA1_Stream6_IRQHandler(void) {
    if (DMA1->HISR & DMA_HISR_TCIF6) {
        DMA1->HIFCR = DMA_HIFCR_CTCIF6;   // Clear flag
        USART2->CR3 &= ~USART_CR3_DMAT;    // Disable DMA TX
        // Signal main loop: transfer complete
    }
}
```

---

## 9. Watchdog Timers

A watchdog timer resets the MCU if the firmware fails to "feed" (refresh) it within a
configured time window. This is a critical safety mechanism for deployed systems.

### 9.1 Types of Watchdog

| Type                   | Description                                         |
| ---------------------- | --------------------------------------------------- |
| Independent Watchdog   | Clocked by LSI, runs independently of main clock.   |
| (IWDG)                 | Cannot be stopped once started. Simple countdown.   |
| Window Watchdog (WWDG) | Must be fed within a time window (not too early,    |
|                        | not too late). Detects both stuck and runaway code. |

### 9.2 Watchdog Usage Pattern

```
  IWDG Timeline
  ==============

  Feed     Feed     Feed     ??? (firmware hung)
   |        |        |        |
   v        v        v        v
  [====]   [====]   [====]   [====]   [RESET!]
   ^                                    ^
   |                                    |
  Counter                          Counter reached 0
  reloaded                         --> System reset
  (e.g., 1s)
```

```c
void iwdg_init(uint32_t timeout_ms) {
    IWDG->KR  = 0x5555;     // Unlock registers
    IWDG->PR  = 4;          // Prescaler /64 (LSI ~32kHz -> 500 Hz)
    IWDG->RLR = (timeout_ms * 500) / 1000;  // Reload value
    IWDG->KR  = 0xAAAA;     // Reload counter
    IWDG->KR  = 0xCCCC;     // Start watchdog (cannot be stopped!)
}

void iwdg_feed(void) {
    IWDG->KR = 0xAAAA;      // Reload counter
}

int main(void) {
    iwdg_init(2000);  // 2 second timeout

    while (1) {
        do_task_a();
        do_task_b();
        do_task_c();
        iwdg_feed();  // Feed only after ALL tasks complete
    }
}
```

**Important**: Feed the watchdog only at the end of the main loop, after all critical
tasks complete. If you feed it at the beginning, a hung task will not trigger a reset.

### 9.3 MicroPython Watchdog (ESP32)

```python
from machine import WDT

# Initialize watchdog with 5 second timeout
wdt = WDT(timeout=5000)

while True:
    do_sensor_reading()
    do_wifi_upload()
    wdt.feed()  # Must be called within 5 seconds
```

---

## 10. Practical Example: Complete Bare-Metal UART (RP2040)

This example configures UART0 on the RP2040 (Raspberry Pi Pico) at the register level.

```c
#include <stdint.h>

// RP2040 register base addresses
#define RESETS_BASE      0x4000C000
#define IO_BANK0_BASE    0x40014000
#define UART0_BASE       0x40034000
#define PADS_BANK0_BASE  0x4001C000

#define RESETS_RESET     (*(volatile uint32_t *)(RESETS_BASE + 0x00))
#define RESETS_DONE      (*(volatile uint32_t *)(RESETS_BASE + 0x08))

typedef struct {
    volatile uint32_t DR;
    volatile uint32_t RSR;
    uint32_t _pad0[4];
    volatile uint32_t FR;
    uint32_t _pad1;
    volatile uint32_t ILPR;
    volatile uint32_t IBRD;
    volatile uint32_t FBRD;
    volatile uint32_t LCR_H;
    volatile uint32_t CR;
    volatile uint32_t IFLS;
    volatile uint32_t IMSC;
    volatile uint32_t RIS;
    volatile uint32_t MIS;
    volatile uint32_t ICR;
} UART_TypeDef;

#define UART0 ((UART_TypeDef *)UART0_BASE)

void uart_init(uint32_t baudrate) {
    // 1. Deassert reset for UART0 and IO_BANK0
    RESETS_RESET &= ~((1U << 22) | (1U << 5));  // UART0, IO_BANK0
    while (!(RESETS_DONE & ((1U << 22) | (1U << 5))));

    // 2. Set GPIO 0 and 1 to UART function (funcsel = 2)
    *(volatile uint32_t *)(IO_BANK0_BASE + 0x004) = 2;  // GPIO0_CTRL = UART0_TX
    *(volatile uint32_t *)(IO_BANK0_BASE + 0x00C) = 2;  // GPIO1_CTRL = UART0_RX

    // 3. Configure baud rate (assuming 125 MHz peripheral clock)
    // BAUDDIV = 125000000 / (16 * baudrate)
    uint32_t baud_div = (125000000 * 4) / baudrate;  // 6.4 fixed point
    uint32_t ibrd = baud_div >> 6;    // Integer part
    uint32_t fbrd = baud_div & 0x3F;  // Fractional part

    UART0->IBRD = ibrd;
    UART0->FBRD = fbrd;

    // 4. Set 8N1 format (8 data, no parity, 1 stop) + enable FIFO
    UART0->LCR_H = (3U << 5)   // WLEN = 8 bits
                  | (1U << 4);  // FEN = FIFO enable

    // 5. Enable UART (TX and RX)
    UART0->CR = (1U << 0)    // UARTEN
              | (1U << 8)    // TXE
              | (1U << 9);   // RXE
}

void uart_putc(char c) {
    while (UART0->FR & (1U << 5));  // Wait while TX FIFO full
    UART0->DR = c;
}

void uart_puts(const char *s) {
    while (*s) {
        uart_putc(*s++);
    }
}

char uart_getc(void) {
    while (UART0->FR & (1U << 4));  // Wait while RX FIFO empty
    return (char)(UART0->DR & 0xFF);
}

int main(void) {
    uart_init(115200);
    uart_puts("Hello, bare metal!\r\n");

    while (1) {
        char c = uart_getc();
        uart_putc(c);  // Echo
    }
}
```

---

## 11. Common Bare-Metal Debugging Patterns

### 11.1 Toggling a Pin for Timing

```c
// Measure ISR execution time with oscilloscope
void TIM3_IRQHandler(void) {
    GPIOB->BSRR = (1U << 0);     // Set PB0 HIGH (scope trigger)

    TIM3->SR &= ~TIM_SR_UIF;
    process_data();

    GPIOB->BSRR = (1U << 16);    // Set PB0 LOW
}
// Measure the HIGH pulse width on your scope = ISR duration
```

### 11.2 Stack Overflow Detection

```c
// Paint the stack with a known pattern at startup
#define STACK_CANARY  0xDEADBEEF

void stack_paint(void) {
    extern uint32_t _heap_start;
    extern uint32_t _estack;
    uint32_t *p = &_heap_start;

    while (p < &_estack - 64) {  // Leave some headroom
        *p++ = STACK_CANARY;
    }
}

uint32_t stack_usage(void) {
    extern uint32_t _heap_start;
    uint32_t *p = &_heap_start;
    uint32_t unused = 0;

    while (*p == STACK_CANARY) {
        p++;
        unused += 4;
    }
    return unused;  // Bytes of stack never used
}
```

---

## Interview Questions

**Q1: What does the startup code do before main() is called?**
A: It copies the .data section from Flash (LMA) to SRAM (VMA) to initialize global
variables with their compile-time values. It zero-fills the .bss section to satisfy the
C standard that uninitialized globals are zero. It then calls SystemInit (clock config)
and C runtime initialization before jumping to main().

**Q2: What is the vector table and why can it be relocated?**
A: The vector table is an array of function pointers at address 0x0000_0000 that maps
exceptions and interrupts to their handlers. It can be relocated by writing a new base
address to the VTOR (Vector Table Offset Register). This is used for bootloaders that
redirect interrupts to application code at a different Flash address.

**Q3: Explain the difference between VMA and LMA in a linker script.**
A: VMA (Virtual Memory Address) is where the section appears at runtime -- the addresses
the code uses. LMA (Load Memory Address) is where the section is physically stored. For
.data, VMA is in SRAM and LMA is in Flash. The startup code copies from LMA to VMA.

**Q4: Why is the `volatile` keyword essential in embedded C?**
A: Volatile tells the compiler that a variable's value can change outside the current
code's control (hardware registers, ISR-modified variables, DMA buffers). Without it,
the compiler may optimize away reads/writes, caching values in CPU registers and missing
hardware changes.

**Q5: What is the difference between push-pull and open-drain GPIO?**
A: Push-pull actively drives both HIGH and LOW states using complementary FETs. Open-
drain can only drive LOW (N-FET to ground) and floats when HIGH, requiring an external
pull-up resistor. Open-drain allows wired-OR connections (I2C, 1-Wire) and voltage level
shifting.

**Q6: How does DMA improve system performance?**
A: DMA transfers data between peripherals and memory without CPU intervention. The CPU
is free to execute other code while the DMA controller handles the transfer. For
continuous ADC sampling or bulk UART communication, DMA can reduce CPU utilization from
near 100% (polling) to nearly 0%.

**Q7: What is the difference between IWDG and WWDG?**
A: IWDG is a simple countdown timer -- if not refreshed before reaching zero, it resets.
WWDG must be refreshed within a time window: not too early and not too late. WWDG catches
both stuck firmware (too late) and runaway code that refreshes too quickly (too early).

**Q8: Why should you feed the watchdog at the end of the main loop, not the beginning?**
A: Feeding at the end ensures all critical tasks have completed. If you feed at the
beginning, the watchdog resets its counter before verifying that the loop body executed
correctly. A hung task in the middle of the loop would still get the watchdog fed at
the start of the next iteration.

**Q9: What happens if main() returns in a bare-metal system?**
A: The startup code typically has an infinite loop after the call to main() (a "hang"
loop). If main returns, execution falls into this trap. Without it, the CPU would
execute whatever happens to be in Flash after the startup code, causing undefined
behavior.

**Q10: Explain the purpose of each section: .text, .data, .bss, .rodata.**
A: `.text` contains executable machine code. `.rodata` contains read-only data (const
variables, string literals). Both reside in Flash. `.data` contains initialized global/
static variables (stored in Flash, copied to SRAM). `.bss` contains uninitialized global/
static variables (zeroed in SRAM, not stored in Flash).

**Q11: How do you measure ISR execution time on a bare-metal system?**
A: Toggle a GPIO pin HIGH at ISR entry and LOW at ISR exit, then measure the pulse
width with an oscilloscope or logic analyzer. Alternatively, read a free-running timer
(like SysTick or DWT cycle counter) at entry and exit and compute the difference.

**Q12: What is a memory barrier and when is it needed in embedded code?**
A: A memory barrier (DSB, DMB, ISB) ensures that memory operations complete in order.
On Cortex-M7 and cores with write buffers, clearing an interrupt flag might be buffered
and not yet written to the peripheral when the ISR returns. The NVIC could re-enter the
ISR. A DSB after clearing the flag ensures the write completes.

**Q13: How would you implement a bootloader that jumps to application code?**
A: The bootloader lives in the first portion of Flash. The application starts at a known
offset (e.g., 0x0800_8000). To jump: (1) Disable all interrupts. (2) Set VTOR to the
application's vector table. (3) Load the application's MSP from its vector table entry
at offset 0. (4) Load the Reset_Handler address from offset 4. (5) Jump to it via a
function pointer.

**Q14: What is the stack canary technique and how does it detect overflow?**
A: At startup, fill the stack region with a known pattern (e.g., 0xDEADBEEF). Periodically
or at runtime, scan from the bottom of the stack upward. The first address that does not
contain the pattern marks the deepest stack usage. If the pattern is overwritten near the
stack boundary, a stack overflow has occurred.

**Q15: A peripheral is not working after reset. What is the most common mistake?**
A: The most common mistake is forgetting to enable the peripheral's clock in the RCC
(Reset and Clock Control) register. On STM32, every peripheral's clock is gated by
default to save power. You must set the appropriate bit in RCC_AHBxENR or RCC_APBxENR
before accessing any of the peripheral's registers.
