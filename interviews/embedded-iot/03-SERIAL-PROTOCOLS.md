# Chapter 3: Serial Communication Protocols -- Talking to Peripherals

Embedded systems rarely operate in isolation. They communicate with sensors, actuators,
displays, other MCUs, and cloud services. This chapter covers the serial protocols that
form the backbone of embedded communication, along with analog/digital conversion
fundamentals that bridge the physical and digital worlds.

---

## 1. UART (Universal Asynchronous Receiver/Transmitter)

UART is the simplest serial protocol. Two devices communicate over two wires (TX and RX)
with no shared clock -- hence "asynchronous." Both sides must agree on the baud rate
before communication begins.

### 1.1 UART Frame Format

```
  UART Frame: 8N1 (8 data bits, No parity, 1 stop bit)
  ======================================================

  Idle    Start                          Stop   Idle
  (HIGH)  Bit    D0  D1  D2  D3  D4  D5  D6  D7  Bit   (HIGH)
  ____     _    ___  ___      ___  ___      ___  ___    ________
      |   | |  |   ||   |    |   ||   |    |   ||   |  |
      |___| |__|   ||   |____|   ||   |____|   ||   |__|
            ^                                      ^
            |                                      |
        Start bit = 0                          Stop bit = 1
        (falling edge)                         (returns to idle)

  Bit time = 1 / baud_rate
  Example: 115200 baud --> bit time = 8.68 us
  Frame time (10 bits) = 86.8 us --> max ~11,520 bytes/sec
```

### 1.2 Baud Rate and Timing

| Baud Rate | Bit Time   | Byte Rate   | Common Use                    |
|-----------|------------|-------------|-------------------------------|
| 9600      | 104.2 us   | 960 B/s     | GPS, legacy sensors           |
| 115200    | 8.68 us    | 11.52 KB/s  | Debug console, general use    |
| 921600    | 1.09 us    | 92.16 KB/s  | High-speed logging            |
| 1000000   | 1.00 us    | 100 KB/s    | ESP32 default monitor         |

**Clock accuracy matters**: UART has no clock wire. Both sides sample the data line
based on their own clocks. If the clocks differ by more than about 3-5%, bits will be
sampled at the wrong time, causing framing errors.

### 1.3 Parity Bit

An optional error-detection bit appended after the data bits:

- **Even parity**: Total number of 1-bits (data + parity) is even.
- **Odd parity**: Total number of 1-bits is odd.
- **None**: No parity bit (most common for MCU-to-MCU).

Parity detects single-bit errors but cannot correct them. For robust communication, use
checksums or CRC in the application protocol.

### 1.4 Voltage Levels

```
  Signal Level Comparison
  ========================

  TTL (3.3V logic)    RS-232              RS-485 (Differential)
  ================    ================    ==========================

  3.3V  ___           +12V               A: ___     B: ___
       |   |               |   |              |   |       |   |
       |   |          0V   |   |         GND  |   | GND   |   |
  0V   |   |___      -12V  |   |___           |   |___    |   |___
       HIGH LOW            HIGH  LOW          Mark         Space
                                              (A>B)        (B>A)

  TTL:    0-10 cm, MCU-to-MCU on same board
  RS-232: 0-15 m, PC serial port (legacy)
  RS-485: 0-1200 m, industrial bus, multi-drop, differential (noise immune)
```

### 1.5 UART Code (STM32F4, USART2)

```c
void uart2_init(uint32_t baudrate) {
    // Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB1ENR |= RCC_APB1ENR_USART2EN;

    // PA2 = USART2_TX (AF7), PA3 = USART2_RX (AF7)
    GPIOA->MODER  &= ~((3U << 4) | (3U << 6));
    GPIOA->MODER  |=  ((2U << 4) | (2U << 6));   // Alt function
    GPIOA->AFR[0] &= ~((0xFU << 8) | (0xFU << 12));
    GPIOA->AFR[0] |=  ((7U << 8) | (7U << 12));  // AF7

    // Configure USART2: 8N1
    USART2->BRR = 42000000 / baudrate;  // APB1 = 42 MHz
    USART2->CR1 = USART_CR1_TE          // TX enable
                | USART_CR1_RE          // RX enable
                | USART_CR1_UE;         // USART enable
}

void uart2_putc(char c) {
    while (!(USART2->SR & USART_SR_TXE));  // Wait for TX empty
    USART2->DR = c;
}

char uart2_getc(void) {
    while (!(USART2->SR & USART_SR_RXNE));  // Wait for RX not empty
    return (char)(USART2->DR & 0xFF);
}

void uart2_puts(const char *str) {
    while (*str) {
        uart2_putc(*str++);
    }
}
```

### 1.6 MicroPython UART (ESP32)

```python
from machine import UART, Pin

# UART2 on ESP32: TX=GPIO17, RX=GPIO16
uart = UART(2, baudrate=115200, tx=Pin(17), rx=Pin(16))

# Send data
uart.write("Hello sensor\r\n")

# Receive data (non-blocking)
if uart.any():
    data = uart.read()
    print("Received:", data)

# Receive with timeout
data = uart.read(10)  # Read up to 10 bytes, returns None on timeout
```

---

## 2. SPI (Serial Peripheral Interface)

SPI is a synchronous, full-duplex, master-slave protocol. It is the fastest common
serial protocol on MCUs, often used for displays, SD cards, Flash memory, and high-speed
sensors.

### 2.1 SPI Bus Topology

```
  SPI Bus: One Master, Multiple Slaves
  ======================================

                          +----------+
                   MOSI-->| Slave 0  |
                   MISO<--|          |
                   SCLK-->|          |
              CS0-------->|  (ADC)   |
              |           +----------+
              |
  +--------+  |           +----------+
  | Master |--+    MOSI-->| Slave 1  |
  |  (MCU) |-------MISO<--|          |
  |        |-------SCLK-->|          |
  |        |--CS1-------->| (Flash)  |
  |        |  |           +----------+
  |        |  |
  |        |--CS2-------->+----------+
  +--------+       MOSI-->| Slave 2  |
                   MISO<--|          |
                   SCLK-->| (Display)|
                          +----------+

  Signals:
    MOSI (Master Out Slave In) - Data from master to slave
    MISO (Master In Slave Out) - Data from slave to master
    SCLK (Serial Clock)        - Clock generated by master
    CS/SS (Chip Select)        - Active LOW, selects one slave
```

### 2.2 SPI Clock Modes (CPOL / CPHA)

The clock polarity (CPOL) and phase (CPHA) define when data is sampled and shifted.
Both master and slave must use the same mode.

```
  SPI Mode 0: CPOL=0, CPHA=0  (most common)
  ============================================
  Clock idles LOW. Data sampled on RISING edge, shifted on FALLING edge.

  SCLK:    __    __    __    __    __    __    __    __
          |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
  ________|  |__|  |__|  |__|  |__|  |__|  |__|  |__|  |__

  MOSI: --<D7>---<D6>---<D5>---<D4>---<D3>---<D2>---<D1>---<D0>--
            ^      ^      ^      ^      ^      ^      ^      ^
            |      |      |      |      |      |      |      |
         Sample Sample Sample Sample Sample Sample Sample Sample
         (rising edges)


  SPI Mode 3: CPOL=1, CPHA=1
  ============================
  Clock idles HIGH. Data sampled on RISING edge, shifted on FALLING edge.

          __    __    __    __    __    __    __    __
  SCLK: |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
        |  |__|  |__|  |__|  |__|  |__|  |__|  |__|  |______

  MOSI: --<D7>---<D6>---<D5>---<D4>---<D3>---<D2>---<D1>---<D0>--
               ^      ^      ^      ^      ^      ^      ^      ^
            Sample  Sample (on rising edges)
```

| Mode | CPOL | CPHA | Clock Idle | Sample Edge | Shift Edge |
|------|------|------|------------|-------------|------------|
| 0    | 0    | 0    | LOW        | Rising      | Falling    |
| 1    | 0    | 1    | LOW        | Falling     | Rising     |
| 2    | 1    | 0    | HIGH       | Falling     | Rising     |
| 3    | 1    | 1    | HIGH       | Rising      | Falling    |

### 2.3 SPI Full-Duplex Transfer

SPI is inherently full-duplex: the master sends one byte on MOSI while simultaneously
receiving one byte on MISO. To read from a slave, the master sends a dummy byte.

```c
uint8_t spi_transfer(uint8_t tx_byte) {
    while (!(SPI1->SR & SPI_SR_TXE));   // Wait TX buffer empty
    SPI1->DR = tx_byte;                  // Send byte
    while (!(SPI1->SR & SPI_SR_RXNE));   // Wait RX buffer not empty
    return (uint8_t)SPI1->DR;            // Read received byte
}

// Read sensor register via SPI
uint8_t read_register(uint8_t reg_addr) {
    GPIOA->BSRR = (1U << (4 + 16));  // CS LOW (PA4)

    spi_transfer(reg_addr | 0x80);     // Send address with read bit
    uint8_t value = spi_transfer(0x00); // Send dummy, receive data

    GPIOA->BSRR = (1U << 4);          // CS HIGH
    return value;
}
```

### 2.4 SPI Initialization (STM32F4)

```c
void spi1_init(void) {
    // Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB2ENR |= RCC_APB2ENR_SPI1EN;

    // PA5=SCLK, PA6=MISO, PA7=MOSI -> AF5 (SPI1)
    GPIOA->MODER &= ~((3U << 10) | (3U << 12) | (3U << 14));
    GPIOA->MODER |=  ((2U << 10) | (2U << 12) | (2U << 14));
    GPIOA->AFR[0] &= ~((0xFU << 20) | (0xFU << 24) | (0xFU << 28));
    GPIOA->AFR[0] |=  ((5U << 20) | (5U << 24) | (5U << 28));

    // PA4 = CS (manual GPIO, not SPI-managed)
    GPIOA->MODER &= ~(3U << 8);
    GPIOA->MODER |=  (1U << 8);   // Output
    GPIOA->BSRR = (1U << 4);      // CS HIGH (deselect)

    // SPI1 config: Master, CPOL=0, CPHA=0, 8-bit, APB2/16 baud
    SPI1->CR1 = SPI_CR1_MSTR       // Master mode
              | (3U << 3)           // BR = APB2/16 = 5.25 MHz
              | SPI_CR1_SSM         // Software slave management
              | SPI_CR1_SSI         // Internal slave select HIGH
              | SPI_CR1_SPE;        // SPI enable
}
```

### 2.5 MicroPython SPI (RP2040)

```python
from machine import Pin, SPI

# Hardware SPI on RP2040
spi = SPI(0, baudrate=1_000_000, polarity=0, phase=0,
          sck=Pin(18), mosi=Pin(19), miso=Pin(16))
cs = Pin(17, Pin.OUT, value=1)  # CS high = deselected

def read_register(addr):
    cs.value(0)
    spi.write(bytes([addr | 0x80]))
    result = spi.read(1)
    cs.value(1)
    return result[0]

def write_register(addr, value):
    cs.value(0)
    spi.write(bytes([addr & 0x7F, value]))
    cs.value(1)
```

---

## 3. I2C (Inter-Integrated Circuit)

I2C is a two-wire, synchronous, half-duplex, multi-master bus. It uses only two lines
(SDA and SCL) with pull-up resistors, making it ideal for connecting many low-speed
peripherals with minimal wiring.

### 3.1 I2C Bus Topology

```
  I2C Bus: Shared SDA and SCL with Pull-Ups
  ===========================================

  VDD ----+--------+--------+--------+--------+
          |        |        |        |        |
         [Rp]     [Rp]     |        |        |
          |        |        |        |        |
  SDA ----+--------+--------+--------+--------+----
          |        |        |        |        |
  SCL ----+--------+--------+--------+--------+----
          |        |        |        |
     +--------+ +--------+ +--------+ +--------+
     | Master | | Slave  | | Slave  | | Slave  |
     |  (MCU) | | 0x48   | | 0x68   | | 0x50   |
     |        | | (Temp) | | (Accel)| | (EEPROM)|
     +--------+ +--------+ +--------+ +--------+

  Rp = Pull-up resistor (typically 2.2k - 10k ohm)
  SDA = Serial Data (bidirectional, open-drain)
  SCL = Serial Clock (driven by master, open-drain)
```

### 3.2 I2C Protocol: Start, Address, Data, Stop

```
  I2C Write Transaction (Master writes 1 byte to slave 0x48)
  ===========================================================

  SDA: ----+  +--+--+--+--+--+--+--+--+  +--+--+--+--+--+--+--+--+  +-----
       IDLE|  |A6|A5|A4|A3|A2|A1|A0|W |  |D7|D6|D5|D4|D3|D2|D1|D0|  |IDLE
           +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
                   ADDRESS + R/W         ACK       DATA BYTE         ACK

  SCL: ----+  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+-----
           |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
           +--+  +  +  +  +  +  +  +  +  +  +  +  +  +  +  +  +  +  +
            S                          A                          A  P
            |                          |                          |  |
          START                   ACK (slave                  ACK  STOP
          (SDA falls               pulls SDA                       (SDA rises
           while SCL               LOW)                             while SCL
           HIGH)                                                    HIGH)

  Address byte: 0x48 = 1001000, W=0 --> 0x90 on bus
```

### 3.3 I2C Key Concepts

**7-bit vs 10-bit addressing**: Standard I2C uses 7-bit addresses (128 devices, but
some are reserved). 10-bit addressing extends to 1024 addresses using a two-byte header.

**Clock stretching**: A slow slave can hold SCL LOW to pause the master. The master
must detect this and wait. This is why SCL must be open-drain with pull-ups.

**Multi-master arbitration**: If two masters transmit simultaneously, they monitor SDA.
The master that sends a HIGH but reads a LOW (another master is pulling it down) loses
arbitration and backs off.

**ACK/NACK**: After every byte, the receiver pulls SDA LOW (ACK) or leaves it HIGH
(NACK). NACK signals an error or the end of a read transaction.

| Speed Mode   | Clock Rate  | Use Case                     |
|-------------|-------------|-------------------------------|
| Standard     | 100 kHz     | Most sensors, EEPROMs         |
| Fast         | 400 kHz     | Accelerometers, displays      |
| Fast+        | 1 MHz       | Touch controllers             |
| High-Speed   | 3.4 MHz     | Specialized devices           |

### 3.4 Pull-Up Resistor Selection

Too high resistance (e.g., 100k) causes slow rise times and communication errors. Too
low resistance (e.g., 100 ohm) draws excessive current and the open-drain drivers cannot
pull the line LOW.

Rule of thumb:
- **Standard mode (100 kHz)**: 4.7k - 10k ohm
- **Fast mode (400 kHz)**: 2.2k - 4.7k ohm
- **Bus capacitance**: Must be below 400 pF (limits cable length and device count)

### 3.5 I2C Code (STM32F4, Bit-Bang for Clarity)

```c
// Simplified software I2C (bit-bang) for educational purposes
// Production code should use the hardware I2C peripheral

#define SDA_PIN  7
#define SCL_PIN  6
#define I2C_PORT GPIOB

static void sda_high(void) { I2C_PORT->BSRR = (1U << SDA_PIN); }
static void sda_low(void)  { I2C_PORT->BSRR = (1U << (SDA_PIN + 16)); }
static void scl_high(void) { I2C_PORT->BSRR = (1U << SCL_PIN); }
static void scl_low(void)  { I2C_PORT->BSRR = (1U << (SCL_PIN + 16)); }

static uint8_t sda_read(void) {
    return (I2C_PORT->IDR >> SDA_PIN) & 1U;
}

static void i2c_delay(void) {
    for (volatile int i = 0; i < 10; i++);  // ~5 us at 84 MHz
}

void i2c_start(void) {
    sda_high(); scl_high(); i2c_delay();
    sda_low();  i2c_delay();   // SDA falls while SCL HIGH = START
    scl_low();  i2c_delay();
}

void i2c_stop(void) {
    sda_low();  scl_high(); i2c_delay();
    sda_high(); i2c_delay();   // SDA rises while SCL HIGH = STOP
}

uint8_t i2c_write_byte(uint8_t byte) {
    for (int i = 7; i >= 0; i--) {
        if (byte & (1U << i)) sda_high();
        else                  sda_low();
        scl_high(); i2c_delay();
        scl_low();  i2c_delay();
    }
    // Read ACK
    sda_high();  // Release SDA for slave
    scl_high(); i2c_delay();
    uint8_t ack = !sda_read();  // ACK = SDA LOW
    scl_low();  i2c_delay();
    return ack;
}

uint8_t i2c_read_byte(uint8_t send_ack) {
    uint8_t byte = 0;
    sda_high();  // Release SDA
    for (int i = 7; i >= 0; i--) {
        scl_high(); i2c_delay();
        if (sda_read()) byte |= (1U << i);
        scl_low();  i2c_delay();
    }
    // Send ACK or NACK
    if (send_ack) sda_low();
    else          sda_high();
    scl_high(); i2c_delay();
    scl_low();  i2c_delay();
    sda_high();
    return byte;
}

// Read temperature from LM75 (address 0x48)
int16_t read_temperature(void) {
    i2c_start();
    i2c_write_byte(0x48 << 1 | 0);  // Write: select register 0
    i2c_write_byte(0x00);             // Temperature register
    i2c_start();                       // Repeated start
    i2c_write_byte(0x48 << 1 | 1);   // Read mode
    uint8_t msb = i2c_read_byte(1);   // ACK
    uint8_t lsb = i2c_read_byte(0);   // NACK (last byte)
    i2c_stop();

    int16_t raw = (msb << 8) | lsb;
    return raw >> 5;  // 11-bit resolution, 0.125 deg C per LSB
}
```

### 3.6 MicroPython I2C Scan

```python
from machine import Pin, I2C

i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400_000)

# Scan for devices
devices = i2c.scan()
print("I2C devices found:", [hex(d) for d in devices])

# Read temperature from LM75 at 0x48
data = i2c.readfrom_mem(0x48, 0x00, 2)
raw = (data[0] << 8) | data[1]
temp_c = (raw >> 5) * 0.125
print(f"Temperature: {temp_c:.1f} C")
```

---

## 4. CAN Bus (Controller Area Network)

CAN is a robust, multi-master serial bus designed for automotive and industrial
environments. It uses differential signaling for noise immunity and provides built-in
error detection, arbitration, and fault confinement.

### 4.1 CAN Bus Topology

```
  CAN Bus: Linear Topology with Terminators
  ==========================================

  120 ohm                                       120 ohm
  terminator                                    terminator
  [===]----+--------+--------+--------+--------[===]
           |        |        |        |
      +--------+ +--------+ +--------+ +--------+
      | Node A | | Node B | | Node C | | Node D |
      | Engine | | Trans. | | ABS    | | Dash   |
      | ECU    | | ECU    | |        | | board  |
      +--------+ +--------+ +--------+ +--------+

  Two wires: CAN_H and CAN_L (differential pair)
  Max speed: 1 Mbps (CAN 2.0), 5 Mbps (CAN FD)
  Max bus length: ~40m at 1 Mbps, ~1000m at lower rates
```

### 4.2 CAN Frame Format

```
  CAN 2.0A Standard Frame (11-bit ID)
  =====================================

  SOF  Identifier  RTR IDE r0  DLC  Data (0-8 bytes)  CRC   ACK  EOF  IFS
  |    (11 bits)   |   |   |  (4b) (0-64 bits)       (15b)  |   (7b) (3b)
  v    v           v   v   v  v    v                  v      v   v    v
  +--+-----------+---+---+--+----+----...----+-------+----+------+---+
  |0 |  Msg ID   | 0 | 0 |0 |Len|  Payload  |  CRC  |Slot| 1..1 |1.1|
  +--+-----------+---+---+--+----+----...----+-------+----+------+---+

  SOF: Start of Frame (single dominant bit)
  RTR: Remote Transmission Request (0=data, 1=remote)
  IDE: Identifier Extension (0=standard 11-bit)
  DLC: Data Length Code (0-8 bytes)
  CRC: 15-bit CRC for error detection
  ACK: Receiving node pulls dominant to acknowledge
  EOF: 7 recessive bits
```

### 4.3 CAN Arbitration

CAN uses non-destructive bitwise arbitration. All nodes can transmit simultaneously.
Dominant bits (0) override recessive bits (1). The node with the lowest ID wins.

```
  Arbitration Example: Node A (ID=0x123), Node B (ID=0x125)
  ===========================================================

  Bit position:    10   9   8   7   6   5   4   3   2   1   0

  Node A (0x123):   0   0   1   0   0   1   0   0   0   1   1
  Node B (0x125):   0   0   1   0   0   1   0   0   1   0   1
                                                     ^
  Bus result:       0   0   1   0   0   1   0   0   0   -   -
                                                     |
                                              Node B reads 0 but
                                              sent 1 (recessive).
                                              Node B loses, backs off.
                                              Node A wins (lower ID).
```

### 4.4 CAN Error Handling

CAN has five error detection mechanisms:

1. **Bit error**: Transmitter monitors the bus; if the bit read differs from what was
   sent (outside arbitration), it is an error.
2. **Stuff error**: After 5 consecutive identical bits, a stuff bit of opposite polarity
   is inserted. Missing stuff bit = error.
3. **CRC error**: CRC mismatch on received frame.
4. **Form error**: Fixed-format fields (EOF, ACK delimiter) have wrong value.
5. **ACK error**: Transmitter does not see a dominant ACK bit.

Each node maintains error counters (TEC and REC). A node transitions through states:

```
  Error Active  --(errors)-->  Error Passive  --(errors)-->  Bus Off
  (normal)                     (can still send,              (disconnected,
                                but with penalty)             must recover)
  TEC/REC < 128               TEC/REC >= 128                TEC >= 256
```

### 4.5 CAN Code Example (STM32F4, bxCAN)

```c
void can1_init(void) {
    // Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOBEN;
    RCC->APB1ENR |= RCC_APB1ENR_CAN1EN;

    // PB8=CAN_RX, PB9=CAN_TX -> AF9
    GPIOB->MODER  &= ~((3U << 16) | (3U << 18));
    GPIOB->MODER  |=  ((2U << 16) | (2U << 18));
    GPIOB->AFR[1] &= ~((0xFU << 0) | (0xFU << 4));
    GPIOB->AFR[1] |=  ((9U << 0) | (9U << 4));

    // Enter initialization mode
    CAN1->MCR |= CAN_MCR_INRQ;
    while (!(CAN1->MSR & CAN_MSR_INAK));

    // Bit timing: 42 MHz APB1 / (1+BS1+BS2) / Prescaler = 500 kbps
    // Prescaler=6, BS1=5, BS2=1 --> 42M / 7 / 6 = 1 Mbps
    CAN1->BTR = (5U << 16)    // BS1 = 6 tq
              | (0U << 20)    // BS2 = 1 tq
              | (5U << 0);    // Prescaler = 6

    // Leave initialization mode
    CAN1->MCR &= ~CAN_MCR_INRQ;
    while (CAN1->MSR & CAN_MSR_INAK);

    // Accept all messages (no filter)
    CAN1->FMR  |= CAN_FMR_FINIT;   // Filter init mode
    CAN1->FA1R |= (1U << 0);        // Activate filter 0
    CAN1->sFilterRegister[0].FR1 = 0;
    CAN1->sFilterRegister[0].FR2 = 0;
    CAN1->FMR  &= ~CAN_FMR_FINIT;
}

void can1_send(uint32_t id, const uint8_t *data, uint8_t len) {
    // Find empty mailbox
    uint8_t mailbox = (CAN1->TSR & CAN_TSR_CODE) >> 24;

    CAN1->sTxMailBox[mailbox].TIR  = (id << 21);  // Standard ID
    CAN1->sTxMailBox[mailbox].TDTR = len & 0x0F;
    CAN1->sTxMailBox[mailbox].TDLR =
        (uint32_t)data[0]        | ((uint32_t)data[1] << 8)
      | ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
    CAN1->sTxMailBox[mailbox].TDHR =
        (uint32_t)data[4]        | ((uint32_t)data[5] << 8)
      | ((uint32_t)data[6] << 16) | ((uint32_t)data[7] << 24);

    CAN1->sTxMailBox[mailbox].TIR |= CAN_TI0R_TXRQ;  // Request transmit
}
```

---

## 5. 1-Wire Protocol

1-Wire (Dallas/Maxim) uses a single data wire plus ground. The bus master provides
power through a pull-up resistor. Each device has a unique 64-bit ROM ID, allowing
multiple devices on one wire.

```
  1-Wire Bus
  ===========

  VDD ---[4.7k]---+--------+--------+
                   |        |        |
  DQ (Data) ------+--------+--------+-------> MCU GPIO
                   |        |        |
              +--------+ +--------+ +--------+
              | DS18B20| | DS18B20| | DS18B20|
              | Temp #1| | Temp #2| | Temp #3|
              +--------+ +--------+ +--------+
                   |        |        |
  GND -------------+--------+--------+

  Timing slots (standard speed):
    Write 0: Pull LOW for 60-120 us
    Write 1: Pull LOW for 1-15 us, release
    Read:    Pull LOW for 1-15 us, sample at ~15 us
    Reset:   Pull LOW for 480 us, release, detect presence pulse
```

### 5.1 1-Wire MicroPython (DS18B20 Temperature)

```python
import onewire
import ds18x20
from machine import Pin
from time import sleep_ms

ow = onewire.OneWire(Pin(4))
ds = ds18x20.DS18X20(ow)

roms = ds.scan()
print("Found sensors:", roms)

ds.convert_temp()
sleep_ms(750)  # Conversion takes up to 750 ms at 12-bit

for rom in roms:
    temp = ds.read_temp(rom)
    print(f"Sensor {rom.hex()}: {temp:.1f} C")
```

---

## 6. ADC (Analog-to-Digital Converter)

ADCs convert continuous analog voltages to discrete digital values. Most MCUs include
one or more ADCs for reading sensors, battery voltage, and analog signals.

### 6.1 ADC Fundamentals

```
  ADC Conversion
  ===============

  Analog input (0 - 3.3V)          Digital output (12-bit: 0-4095)

  3.3V |         ___               4095 |          ___
       |        /                       |         /
       |      _/                        |       _/
       |    _/                          |     _/
       |  _/                            |   _/
       | /                              |  /
  0V   |/___________________           0  |/___________________
        time                              time

  Resolution = Vref / 2^N
  12-bit: 3.3V / 4096 = 0.806 mV per count (LSB)
  10-bit: 3.3V / 1024 = 3.223 mV per count
```

### 6.2 Nyquist Theorem

To accurately reconstruct an analog signal, the sampling rate must be at least twice
the highest frequency component in the signal.

```
  Sampling Rate vs Signal Frequency
  ===================================

  Proper sampling (Fs > 2 * Fsignal):
  Signal:   /\    /\    /\    /\
           /  \  /  \  /  \  /  \
  Samples: *  *  *  *  *  *  *  *  (captures waveform)

  Aliasing (Fs < 2 * Fsignal):
  Signal:   /\/\/\/\/\/\/\/\/\/\
  Samples:  *     *     *     *    (misses cycles, wrong frequency!)
```

### 6.3 ADC Architectures

| Type           | Speed          | Resolution | Use Case                    |
|----------------|----------------|------------|------------------------------|
| SAR            | 1-10 MSPS      | 8-16 bit   | General MCU ADC, fast scans  |
| Sigma-Delta    | 10-1000 SPS    | 16-24 bit  | Precision measurement, audio |
| Flash (Parallel)| 100+ MSPS    | 6-10 bit   | RF, oscilloscopes            |
| Pipelined      | 10-100 MSPS   | 10-14 bit  | Video, communications        |

**SAR (Successive Approximation Register)**: Most common in MCUs. Uses a binary search
algorithm: compare input to Vref/2, then Vref/4, and so on. Completes in N clock cycles
for N-bit resolution.

**Sigma-Delta**: Oversamples at very high rate, then uses a digital filter to achieve
high resolution. Slow but extremely precise. Used for load cells, thermocouples,
precision instruments.

### 6.4 ADC Code (STM32F4, Single Conversion)

```c
void adc1_init(void) {
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB2ENR |= RCC_APB2ENR_ADC1EN;

    // PA0 = ADC1_IN0 (analog mode)
    GPIOA->MODER |= (3U << 0);  // Analog mode = 11

    // ADC configuration
    ADC1->CR1  = 0;                // 12-bit, no scan
    ADC1->CR2  = ADC_CR2_ADON;    // Enable ADC
    ADC1->SQR3 = 0;               // Channel 0 as first conversion
    ADC1->SMPR2 = (3U << 0);      // 56 cycles sample time
}

uint16_t adc1_read(void) {
    ADC1->CR2 |= ADC_CR2_SWSTART;            // Start conversion
    while (!(ADC1->SR & ADC_SR_EOC));         // Wait for completion
    return (uint16_t)ADC1->DR;                // Read 12-bit result
}

float adc_to_voltage(uint16_t adc_value) {
    return (float)adc_value * 3.3f / 4096.0f;
}
```

### 6.5 MicroPython ADC

```python
from machine import ADC, Pin

# ESP32: ADC on GPIO 34 (input-only pin)
adc = ADC(Pin(34))
adc.atten(ADC.ATTN_11DB)    # Full range: 0 - 3.3V
adc.width(ADC.WIDTH_12BIT)  # 12-bit resolution

raw = adc.read()
voltage = raw * 3.3 / 4095
print(f"ADC raw: {raw}, Voltage: {voltage:.3f} V")
```

---

## 7. DAC (Digital-to-Analog Converter)

DACs convert digital values to analog voltages. Common uses: audio output, waveform
generation, setting reference voltages, and driving analog actuators.

```c
// STM32F4 DAC Channel 1 (PA4)
void dac1_init(void) {
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB1ENR |= RCC_APB1ENR_DACEN;

    GPIOA->MODER |= (3U << 8);  // PA4 analog mode

    DAC->CR |= DAC_CR_EN1;       // Enable DAC channel 1
}

void dac1_write(uint16_t value) {
    // 12-bit right-aligned: 0 = 0V, 4095 = Vref (3.3V)
    DAC->DHR12R1 = value & 0x0FFF;
}

// Generate 1 kHz sine wave (with timer DMA in production)
void generate_sine(void) {
    static const uint16_t sine_table[32] = {
        2048, 2447, 2831, 3185, 3495, 3750, 3939, 4056,
        4095, 4056, 3939, 3750, 3495, 3185, 2831, 2447,
        2048, 1648, 1264,  910,  600,  345,  156,   39,
           0,   39,  156,  345,  600,  910, 1264, 1648
    };
    uint8_t idx = 0;
    while (1) {
        dac1_write(sine_table[idx]);
        idx = (idx + 1) & 0x1F;  // Wrap at 32
        delay_us(31);  // 32 samples * 31.25 us = 1 ms period = 1 kHz
    }
}
```

---

## 8. PWM (Pulse Width Modulation)

PWM encodes information in the duty cycle of a square wave. It is the standard technique
for controlling motors, dimming LEDs, and generating analog-like outputs from digital
pins.

### 8.1 PWM Applications

```
  PWM for LED Dimming
  ====================

  25% Duty:  _    _    _    _         LED appears dim
            | |  | |  | |  | |
  _________| |__| |__| |__| |__

  50% Duty:  ____    ____    ____     LED appears medium
            |    |  |    |  |    |
  __________|    |__|    |__|    |__

  75% Duty:  ______  ______  ______   LED appears bright
            |      ||      ||      |
  __________|      ||      ||      |

  100% Duty: ______________________   LED fully on (constant HIGH)

  The human eye averages the brightness. At >1 kHz, no flicker is visible.
```

### 8.2 PWM for Motor Control (H-Bridge)

```
  H-Bridge Motor Driver
  ======================

       VDD
        |
    +---+---+
    |       |
  [Q1]   [Q3]       PWM on Q1/Q4: motor forward
    |       |        PWM on Q2/Q3: motor reverse
    +--[M]--+        Duty cycle = speed
    |       |
  [Q2]   [Q4]       Never turn on Q1+Q2 or Q3+Q4
    |       |        simultaneously (shoot-through!)
    +---+---+
        |
       GND

  Typical PWM frequency for DC motors: 20-25 kHz
  (above audible range to avoid motor whine)
```

### 8.3 Servo Motor Control

Standard hobby servos expect a PWM signal at 50 Hz (20 ms period). The pulse width
encodes the angle:

```
  Servo PWM (50 Hz / 20 ms period)
  ==================================

  0 degrees:     1.0 ms pulse
  _              ________________________
  | |
  |1|
  | |____________|<------ 20 ms ------->|

  90 degrees:    1.5 ms pulse
  __             ________________________
  |  |
  |1.5|
  |  |___________|

  180 degrees:   2.0 ms pulse
  ___            ________________________
  |   |
  | 2 |
  |   |__________|
```

```python
# MicroPython servo control (ESP32)
from machine import Pin, PWM

servo = PWM(Pin(15), freq=50)

def set_angle(angle):
    # Map 0-180 degrees to 1.0-2.0 ms pulse
    # At 50 Hz, period = 20 ms = 20000 us
    # duty_u16 range: 0-65535
    min_duty = int(65535 * 1.0 / 20.0)   # 1.0 ms
    max_duty = int(65535 * 2.0 / 20.0)   # 2.0 ms
    duty = min_duty + (max_duty - min_duty) * angle // 180
    servo.duty_u16(duty)

set_angle(0)    # 0 degrees
set_angle(90)   # 90 degrees
set_angle(180)  # 180 degrees
```

---

## 9. Logic Analyzer Traces (ASCII Art)

When debugging serial protocols, a logic analyzer is indispensable. Here is what common
protocol activity looks like.

### 9.1 UART Transmission of 'A' (0x41) at 115200 baud

```
  Logic Analyzer: UART TX sending 'A' (0x41 = 0100 0001)
  ========================================================
  Time (us):  0    8.7  17.4 26.0 34.7 43.4 52.1 60.8 69.4 78.1 86.8
              |     |     |     |     |     |     |     |     |     |
  TX:  _______       ___         ___                    ___   ________
             |     |   |       |   |                  |   | |
             |_____|   |_______|   |__________________|   |_|
             Start  1     0     1     0    0    0    0   1  Stop
             Bit   D0    D1    D2    D3   D4   D5   D6  D7  Bit

  Data bits (LSB first): 1 0 0 0 0 0 1 0 = 0x41 = 'A'
```

### 9.2 SPI Transfer of 0xA5

```
  Logic Analyzer: SPI Mode 0, 1 MHz, transmitting 0xA5
  =====================================================

  CS:   ____                                              ____
            |____________________________________________|

  SCLK: ____   _   _   _   _   _   _   _   _   _________
            |_| |_| |_| |_| |_| |_| |_| |_| |_|

  MOSI: ____     ___         ___         ___     ________
            |___|   |_______|   |_______|   |___|
             1   0   1   0   0   1   0   1
             D7  D6  D5  D4  D3  D2  D1  D0 = 0xA5
```

### 9.3 I2C Write to Address 0x48, Data 0x01

```
  Logic Analyzer: I2C write 0x01 to device 0x48
  ==============================================

  SDA: ____     ___         ___                    ___   _____     ___
           |___|   |_______|   |__________________|   |_|     |___|
            1   0   0   1   0   0   0   0  (W=0)  ACK  0  0  ...
            A6  A5  A4  A3  A2  A1  A0  R/W       (slave) D7 D6

  SCL: ____   _   _   _   _   _   _   _   _   _   _   _   _   _
           |_| |_| |_| |_| |_| |_| |_| |_| |_| |_| |_| |_| |_|

       START                               ACK            ACK  STOP
```

---

## 10. Protocol Selection Guide

| Criterion          | UART    | SPI     | I2C     | CAN      |
|--------------------|---------|---------|---------|----------|
| Wires              | 2 (TX/RX)| 4+CS  | 2 (SDA/SCL)| 2 (diff) |
| Speed              | 115k-1M | 1-80 MHz| 100k-3.4M| 1M-5M   |
| Duplex             | Full    | Full    | Half    | Half     |
| Multi-device       | No (P2P)| Yes (CS)| Yes (addr)| Yes (bus)|
| Error detection    | Parity  | None*   | ACK/NACK| CRC+more |
| Distance           | Short   | Short   | Short   | Long     |
| Typical use        | Debug   | Display | Sensors | Automotive|

*SPI relies on higher-level protocol for error detection.

**When to use which**:
- **UART**: Debug console, GPS, BLE modules, simple point-to-point.
- **SPI**: High-speed peripherals (display, Flash, SD card, high-rate sensors).
- **I2C**: Low-speed sensors, EEPROMs, RTCs -- when you need many devices on few pins.
- **CAN**: Automotive, industrial, robotics -- when noise immunity and reliability matter.

---

## Interview Questions

**Q1: What determines the baud rate accuracy requirement for UART communication?**
A: Both transmitter and receiver must agree on baud rate within about 3-5%. Since UART
is asynchronous (no shared clock), each side times bit sampling from its own clock. If
the clocks drift apart by more than half a bit time over a frame, bits will be mis-
sampled, causing framing errors.

**Q2: Explain CPOL and CPHA in SPI. What happens if master and slave use different modes?**
A: CPOL sets the idle state of the clock (0=LOW, 1=HIGH). CPHA sets whether data is
sampled on the first or second clock edge. If they differ, the slave samples data at
the wrong time, reading incorrect bit values. Communication fails silently -- there is
no error detection in SPI itself.

**Q3: Why does I2C need pull-up resistors but SPI does not?**
A: I2C uses open-drain drivers -- devices can only pull the bus LOW, not drive it HIGH.
Pull-up resistors provide the HIGH state. This allows multiple devices to share the bus
and enables clock stretching and multi-master arbitration. SPI uses push-pull drivers
that actively drive both HIGH and LOW.

**Q4: How does CAN bus arbitration work? Why is it non-destructive?**
A: All nodes transmit simultaneously. CAN uses dominant (0) and recessive (1) bits. If
a node sends recessive but reads dominant, another node is transmitting a higher-priority
(lower ID) message. The losing node stops transmitting and retries later. No data is
corrupted because the winning frame continues uninterrupted.

**Q5: What is the Nyquist theorem and why does it matter for ADC?**
A: The Nyquist theorem states the sampling rate must be at least twice the highest
frequency component in the signal. If violated, high-frequency components alias to lower
frequencies, producing incorrect readings. In practice, an anti-aliasing low-pass filter
is placed before the ADC to remove frequencies above Fs/2.

**Q6: Compare SAR and Sigma-Delta ADCs. When would you choose each?**
A: SAR ADCs are fast (MSPS range) with moderate resolution (12-16 bit) -- ideal for
general MCU measurements and fast scanning. Sigma-Delta ADCs are slow (SPS range) but
achieve very high resolution (24 bit) through oversampling and noise shaping -- ideal
for precision measurements like load cells, thermocouples, and audio.

**Q7: An I2C device is not responding. What are the most common causes?**
A: (1) Wrong address -- check the datasheet for the 7-bit address vs. the 8-bit shifted
value. (2) Missing or wrong pull-up resistor values. (3) Forgot to enable the I2C
peripheral clock. (4) SDA or SCL pin not configured for open-drain/alternate function.
(5) Bus stuck LOW from a previous failed transaction (need bus recovery: toggle SCL
9 times).

**Q8: What is RS-485 and why is it preferred over RS-232 for long distances?**
A: RS-485 uses differential signaling (voltage difference between two wires) which
rejects common-mode noise. It supports multi-drop (up to 32 nodes) and distances up to
1200 meters. RS-232 is single-ended (voltage relative to ground), making it susceptible
to noise, limited to about 15 meters, and supports only point-to-point.

**Q9: Why is PWM frequency important for motor control?**
A: If the PWM frequency is too low (below ~15 kHz), the motor produces audible whine.
If too high, switching losses in the H-bridge driver increase. The inductance of the
motor windings also acts as a low-pass filter -- higher frequencies are smoothed into
a more constant current. Typical frequencies are 20-25 kHz (above human hearing).

**Q10: Explain the concept of clock stretching in I2C.**
A: When a slave device needs more time to process data (e.g., an EEPROM performing a
write cycle), it holds the SCL line LOW after the master releases it. The master must
detect this and wait until SCL goes HIGH before proceeding. This requires the master's
SCL driver to be open-drain and the master firmware to check SCL state.

**Q11: How do you connect 4 SPI devices with only 3 available CS pins?**
A: Options: (1) Use a 2-to-4 decoder (74HC139) to generate 4 CS signals from 2 GPIO
pins. (2) Daisy-chain SPI devices (shift data through all devices). (3) Use GPIO
expander for additional CS pins. (4) Use analog multiplexer on CS lines.

**Q12: What is bit stuffing in CAN and why is it needed?**
A: After 5 consecutive bits of the same value, a "stuff bit" of opposite polarity is
inserted. This ensures enough signal transitions for clock synchronization (CAN nodes
resynchronize on edges). The receiver automatically removes stuff bits. A violation
(6 consecutive same bits) is detected as a stuff error.

**Q13: You read 2048 from a 12-bit ADC with 3.3V reference. What is the input voltage?**
A: Voltage = (ADC_value / 2^N) * Vref = (2048 / 4096) * 3.3V = 1.65V (exactly half
of the reference voltage, which makes sense since 2048 is exactly half of 4096).

**Q14: How would you implement a UART-based command parser for an embedded system?**
A: Use a ring buffer filled by the UART RX interrupt. In the main loop, check the buffer
for a line terminator (\r\n). When found, extract the line, tokenize it (command +
arguments), and dispatch to a handler function via a command table (array of struct with
command string and function pointer). Never parse inside the ISR.

**Q15: A sensor on I2C works alone but fails when other devices are added. What is wrong?**
A: Most likely the pull-up resistors are too weak for the increased bus capacitance.
Each device adds parasitic capacitance. Reduce the pull-up resistance (e.g., from 10k
to 2.2k) to increase the drive strength. Also check for address conflicts (two devices
with the same address). Verify total bus capacitance is under 400 pF.
