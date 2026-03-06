# Chapter 9: Production & Safety -- Shipping Embedded Products

Building a working prototype is half the battle. Shipping a reliable, safe, certifiable embedded product requires mastery of hardware-software co-design, regulatory compliance, security hardening, manufacturing processes, and functional safety standards. This chapter bridges the gap between "it works on my bench" and "it ships to 100,000 customers."

---

## 1. Hardware-Software Co-Design

### 1.1 Selecting an MCU

The firmware engineer should be involved in MCU selection from day one. Key decision factors:

| Factor | Questions to Ask |
|--------|-----------------|
| **Core** | Cortex-M0+ (low power) vs. M4 (DSP) vs. M7 (performance)? |
| **Flash / RAM** | Does the firmware + TinyML model + OTA staging fit? |
| **Peripherals** | How many UARTs, SPI, I2C, ADC channels needed? |
| **Connectivity** | Built-in WiFi/BLE (ESP32, nRF) or external module? |
| **Power modes** | Stop/standby current? Wake-up sources? |
| **Security** | TrustZone, secure boot ROM, crypto accelerator? |
| **Ecosystem** | SDK maturity, community support, RTOS ports? |
| **Supply chain** | Second-source available? Lead time? NRND risk? |
| **Cost** | BOM target at volume (1K, 100K, 1M units)? |
| **Package** | QFN, BGA, LQFP? PCB assembly capability? |

### 1.2 BOM Cost Optimization

```
+----------------------------------------------------------+
|         BOM COST BREAKDOWN (typical IoT sensor node)      |
+----------------------------------------------------------+
|                                                            |
|  Component               Unit Cost (10K qty)               |
|  -------------------------------------------------------- |
|  MCU (STM32L4)           $2.50                             |
|  Radio module (SX1276)   $3.00                             |
|  Sensors (accel + temp)  $1.20                             |
|  Power management (LDO)  $0.15                             |
|  Crystal (32 MHz)        $0.10                             |
|  Passives (caps, res)    $0.30                             |
|  Connector (USB-C)       $0.25                             |
|  PCB (4-layer, 25x25mm)  $0.40                             |
|  Antenna (chip)          $0.20                             |
|  Enclosure (injection)   $0.80                             |
|  Battery (LiPo 500mAh)  $1.50                             |
|  Assembly (SMT + test)   $1.60                             |
|  -------------------------------------------------------- |
|  TOTAL                   ~$12.00                           |
|                                                            |
|  Rules of thumb:                                           |
|  - Retail price >= 3x BOM cost                             |
|  - Every $0.01 saved = $1,000 at 100K units               |
|  - Consolidate functions (MCU with built-in radio)         |
+----------------------------------------------------------+
```

### 1.3 Design for Manufacturability (DFM)

- **Component placement:** Keep decoupling caps close to MCU power pins. Group components by function.
- **Test points:** Add test points for power rails, UART TX/RX, SWD/JTAG, reset, and key signals.
- **Fiducials:** Include PCB fiducials for pick-and-place machine alignment.
- **Panelization:** Design PCB panels for efficient SMT assembly (V-score or routed tabs).
- **Minimum footprint sizes:** Use 0402 or larger for hand-rework capability. 0201 requires automated-only.

---

## 2. PCB Design Basics for Firmware Engineers

### 2.1 Decoupling Capacitors

Every IC power pin needs a 100 nF ceramic capacitor placed as close as possible to the pin. Add bulk capacitance (10 uF) near power entry points.

```
+----------------------------------------------------------+
|         DECOUPLING CAPACITOR PLACEMENT                     |
+----------------------------------------------------------+
|                                                            |
|   WRONG:                        RIGHT:                     |
|                                                            |
|   VCC ---[long trace]--- MCU    VCC ----+---- MCU          |
|                   |                     |  |               |
|                  100nF                 100nF               |
|                   |                     |  |               |
|   GND ---[long trace]--- MCU    GND ----+---- MCU          |
|                                                            |
|   Long traces add inductance,   Short, direct connection   |
|   defeating the purpose         provides clean bypass      |
+----------------------------------------------------------+
```

### 2.2 Ground Planes

- Use a solid, unbroken ground plane on one layer (typically layer 2 of a 4-layer PCB).
- Do not route signal traces across gaps in the ground plane.
- Use the 4-layer stack: Signal / Ground / Power / Signal.

### 2.3 Signal Integrity

- **Controlled impedance:** For high-speed signals (USB, Ethernet, RF), match trace impedance to 50 ohms (single-ended) or 90 ohms (differential).
- **Length matching:** Differential pairs (USB D+/D-) must be equal length within 5 mils.
- **Guard traces:** Surround sensitive analog traces with grounded guard traces.
- **Via placement:** Avoid vias in high-frequency signal paths; they add parasitic capacitance and inductance.

---

## 3. EMC/EMI

### 3.1 What Is EMC?

Electromagnetic Compatibility (EMC) requires that a device:
- **Does not emit** excessive electromagnetic interference (EMI) -- emission limits.
- **Is immune to** external electromagnetic interference -- susceptibility/immunity.

### 3.2 Regulatory Standards

| Region | Standard | Authority | Test Types |
|--------|----------|-----------|------------|
| Europe | EN 55032 (emissions), EN 55035 (immunity) | CE marking | Radiated, conducted |
| USA | FCC Part 15 (Class A/B) | FCC | Radiated, conducted |
| International | CISPR 32/35 | IEC | Harmonized standards |

### 3.3 Common EMI Problems and Fixes

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Radiated emissions at clock frequency | Unshielded clock traces | Add series ferrite bead, shorten trace |
| Conducted emissions on power cable | Switching regulator noise | Add input filter (LC), use spread-spectrum clocking |
| Susceptibility to ESD | Exposed connectors | Add TVS diodes to all external interfaces |
| Harmonics from digital I/O | Fast edge rates | Slow down drive strength, add RC snubber |
| Antenna port spurious emissions | Harmonics of MCU clock | Add band-pass filter on antenna path |

### 3.4 Pre-Compliance Testing

Before paying for a full test lab ($5,000-$15,000 per session):

```bash
# Use a near-field EMI probe + spectrum analyzer
# or a low-cost SDR (RTL-SDR) for rough radiated scan

# Key frequencies to check:
#   MCU clock and harmonics (e.g., 48 MHz -> 96, 144, 192 MHz)
#   Switching regulator frequency (e.g., 1.2 MHz)
#   Communication frequencies (BLE: 2.4 GHz, LoRa: 868/915 MHz)
```

---

## 4. Power Management

### 4.1 Battery Life Estimation

```
+----------------------------------------------------------+
|         BATTERY LIFE CALCULATION                           |
+----------------------------------------------------------+
|                                                            |
|  Battery capacity:  500 mAh (LiPo)                        |
|                                                            |
|  Operating profile:                                        |
|    Sleep mode:     5 uA  x  59.9 seconds  =  0.083 mAs    |
|    Wake + sample:  15 mA x  0.05 seconds  =  0.750 mAs    |
|    Transmit:       80 mA x  0.05 seconds  =  4.000 mAs    |
|    Total per cycle (60 sec):               =  4.833 mAs    |
|                                                            |
|  Average current:  4.833 / 60 = 0.0806 mA = 80.6 uA       |
|                                                            |
|  Battery life = 500 mAh / 0.0806 mA = 6,203 hours         |
|               = ~258 days                                  |
|                                                            |
|  Derate by 20% for self-discharge + aging:                 |
|  Practical life = ~206 days                                |
+----------------------------------------------------------+
```

### 4.2 Sleep Current Budget

```c
/* Power mode configuration for STM32L4 */
#include "stm32l4xx_hal.h"

typedef struct {
    const char *mode;
    float current_ua;
    float wake_time_us;
} power_mode_t;

/*
 * STM32L476 power modes:
 *
 * Mode          Current    Wake Time   RAM Retained
 * ------------------------------------------------
 * Run (80 MHz)  6.5 mA    -           All
 * Low-Power Run 33 uA     -           All
 * Sleep         1.1 mA    1 us        All
 * LP Sleep      28 uA     5 us        All
 * Stop 0        1.3 uA    5 us        All
 * Stop 1        0.8 uA    5 us        All
 * Stop 2        0.3 uA    5 us        Partial
 * Standby       0.03 uA   50 us       Backup regs
 * Shutdown      0.01 uA   200 us      None
 */

void enter_stop2_mode(void)
{
    /* Disable unused peripherals */
    __HAL_RCC_GPIOB_CLK_DISABLE();
    __HAL_RCC_GPIOC_CLK_DISABLE();
    __HAL_RCC_SPI1_CLK_DISABLE();

    /* Configure wake-up source (RTC alarm or GPIO) */
    HAL_RTCEx_SetWakeUpTimer_IT(&hrtc,
        60 * 2048,                    /* 60-second wake interval */
        RTC_WAKEUPCLOCK_RTCCLK_DIV16);

    /* Enter Stop 2 mode */
    HAL_SuspendTick();
    HAL_PWREx_EnterSTOP2Mode(PWR_STOPENTRY_WFI);

    /* Execution resumes here after wake-up */
    HAL_ResumeTick();
    SystemClock_Config();  /* Reconfigure clocks */
}
```

### 4.3 Energy Harvesting

For perpetual operation without batteries:

| Source | Power Density | Typical Output | Best For |
|--------|--------------|---------------|----------|
| Indoor solar | 10-100 uW/cm^2 | 50-500 uW | Sensors with display |
| Outdoor solar | 10-100 mW/cm^2 | 10-500 mW | Outdoor IoT |
| Thermoelectric | 20-60 uW/cm^2 | 1-10 mW | Industrial monitoring |
| Vibration (piezo) | 10-800 uW/cm^3 | 10-200 uW | Motor monitoring |
| RF harvesting | 0.1-1 uW/cm^2 | 1-100 uW | NFC/RFID tags |

---

## 5. Security in Embedded Systems

### 5.1 Secure Boot Chain

```
+----------------------------------------------------------+
|              SECURE BOOT CHAIN                             |
+----------------------------------------------------------+
|                                                            |
|  ROM Bootloader (immutable, in silicon)                    |
|  +----------------------------------------------------+   |
|  | Contains Root of Trust public key (OTP fuses)       |   |
|  | Verifies signature of Stage 1 bootloader            |   |
|  +----------------------------------------------------+   |
|                         | Signature OK?                    |
|                         v                                  |
|  Stage 1 Bootloader (signed)                               |
|  +----------------------------------------------------+   |
|  | Verifies signature of main firmware image           |   |
|  +----------------------------------------------------+   |
|                         | Signature OK?                    |
|                         v                                  |
|  Main Firmware (signed)                                    |
|  +----------------------------------------------------+   |
|  | Application runs with verified integrity            |   |
|  | Can verify additional assets (config, ML models)    |   |
|  +----------------------------------------------------+   |
|                                                            |
|  If ANY signature fails:                                   |
|  -> Device enters recovery mode or halts                   |
|  -> Prevents execution of tampered firmware                |
+----------------------------------------------------------+
```

### 5.2 Hardware Root of Trust

A hardware root of trust provides tamper-resistant key storage and cryptographic operations:

- **Arm TrustZone:** Partitions MCU into Secure and Non-Secure worlds. Secure world holds keys and crypto.
- **Trusted Platform Module (TPM):** Dedicated IC for key storage, attestation, and measured boot.
- **Secure Elements (SE):** ATECC608A, STSAFE-A110 -- store keys in tamper-proof silicon.
- **eFuses:** One-time programmable bits for storing root public key hashes.

### 5.3 TLS on Constrained Devices

```c
/* Using mbedTLS on a Cortex-M4 */
#include "mbedtls/ssl.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/x509_crt.h"

typedef struct {
    mbedtls_ssl_context ssl;
    mbedtls_ssl_config  conf;
    mbedtls_entropy_context entropy;
    mbedtls_ctr_drbg_context ctr_drbg;
    mbedtls_x509_crt ca_cert;
} tls_context_t;

int tls_connect(tls_context_t *ctx, const char *hostname,
                const unsigned char *ca_pem, size_t ca_pem_len)
{
    int ret;

    mbedtls_ssl_init(&ctx->ssl);
    mbedtls_ssl_config_init(&ctx->conf);
    mbedtls_entropy_init(&ctx->entropy);
    mbedtls_ctr_drbg_init(&ctx->ctr_drbg);
    mbedtls_x509_crt_init(&ctx->ca_cert);

    /* Seed the random number generator */
    ret = mbedtls_ctr_drbg_seed(&ctx->ctr_drbg,
                                 mbedtls_entropy_func,
                                 &ctx->entropy,
                                 NULL, 0);
    if (ret != 0) return ret;

    /* Parse CA certificate */
    ret = mbedtls_x509_crt_parse(&ctx->ca_cert, ca_pem, ca_pem_len);
    if (ret != 0) return ret;

    /* Configure TLS */
    ret = mbedtls_ssl_config_defaults(&ctx->conf,
                                       MBEDTLS_SSL_IS_CLIENT,
                                       MBEDTLS_SSL_TRANSPORT_STREAM,
                                       MBEDTLS_SSL_PRESET_DEFAULT);
    if (ret != 0) return ret;

    mbedtls_ssl_conf_ca_chain(&ctx->conf, &ctx->ca_cert, NULL);
    mbedtls_ssl_conf_rng(&ctx->conf,
                          mbedtls_ctr_drbg_random,
                          &ctx->ctr_drbg);

    /* Memory optimization: limit cipher suites */
    static const int ciphersuites[] = {
        MBEDTLS_TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
        0
    };
    mbedtls_ssl_conf_ciphersuites(&ctx->conf, ciphersuites);

    ret = mbedtls_ssl_setup(&ctx->ssl, &ctx->conf);
    if (ret != 0) return ret;

    mbedtls_ssl_set_hostname(&ctx->ssl, hostname);

    /* TLS handshake (requires network send/recv callbacks) */
    ret = mbedtls_ssl_handshake(&ctx->ssl);
    return ret;
}

/*
 * Memory footprint of mbedTLS on Cortex-M4:
 *   Flash: ~60-100 KB (depends on enabled features)
 *   RAM:   ~20-40 KB (per connection)
 *   Handshake time: 1-3 seconds (ECC-256)
 */
```

### 5.4 Firmware Encryption

Protect intellectual property and prevent cloning:

```c
/*
 * Encrypted firmware update flow:
 *
 * 1. Build server encrypts firmware with AES-128-GCM
 *    - Key derived from device-specific secret + firmware version
 *    - Authentication tag prevents tampering
 *
 * 2. Device receives encrypted blob over OTA
 *
 * 3. Bootloader decrypts using key stored in secure element
 *    - Verifies authentication tag
 *    - Writes decrypted firmware to internal Flash
 *    - Erases any temporary copies
 */

typedef struct {
    uint32_t magic;           /* 0x46574558 "FWEX" */
    uint32_t version;
    uint32_t payload_size;
    uint8_t  iv[12];          /* AES-GCM initialization vector */
    uint8_t  tag[16];         /* AES-GCM authentication tag */
    uint8_t  payload[];       /* Encrypted firmware */
} encrypted_firmware_t;
```

### 5.5 Common Embedded Vulnerabilities

| Vulnerability | Description | Mitigation |
|--------------|-------------|------------|
| Unprotected debug port | JTAG/SWD left enabled | Disable in production fuses |
| Plaintext firmware | OTA updates not encrypted | AES-GCM encryption |
| No secure boot | Arbitrary code execution | Signature verification chain |
| Buffer overflow | Stack/heap corruption | MPU, stack canaries, bounds checking |
| Hardcoded keys | Keys in source code | Secure element, key provisioning |
| Unencrypted communication | Sniffable data | TLS/DTLS for all network traffic |
| Rollback attack | Downgrade to vulnerable FW | Anti-rollback counter in OTP |

---

## 6. Functional Safety Standards

### 6.1 Overview of Safety Standards

```
+----------------------------------------------------------+
|          FUNCTIONAL SAFETY STANDARDS                       |
+----------------------------------------------------------+
|                                                            |
|  Standard       Domain          Safety Levels              |
|  -------------------------------------------------------- |
|  IEC 61508      General         SIL 1-4                    |
|  ISO 26262      Automotive      ASIL A-D                   |
|  IEC 62304      Medical devices Class A, B, C              |
|  DO-178C        Avionics        DAL A-E                    |
|  IEC 61511      Process industry SIL 1-3                   |
|  EN 50128       Railway          SIL 0-4                   |
|                                                            |
+----------------------------------------------------------+
```

### 6.2 IEC 61508: SIL Levels

Safety Integrity Level (SIL) defines the target probability of dangerous failure per hour:

```
+----------------------------------------------------------+
|          SAFETY INTEGRITY LEVELS (IEC 61508)               |
+----------------------------------------------------------+
|                                                            |
|  SIL | PFH (per hour)       | Example                     |
|  ----|----------------------|-----------------------------|
|   4  | 10^-9 to 10^-8       | Nuclear reactor shutdown    |
|   3  | 10^-8 to 10^-7       | Railway signaling           |
|   2  | 10^-7 to 10^-6       | Industrial burner control   |
|   1  | 10^-6 to 10^-5       | HVAC safety interlock       |
|                                                            |
|  Higher SIL = Stricter development process:                |
|  - SIL 1: Semi-formal methods, basic testing               |
|  - SIL 2: Structured testing, code review                  |
|  - SIL 3: Formal verification, MC/DC coverage              |
|  - SIL 4: Formal methods, independent verification         |
+----------------------------------------------------------+
```

### 6.3 ISO 26262: Automotive ASIL

```
+----------------------------------------------------------+
|         ASIL DETERMINATION (ISO 26262)                     |
+----------------------------------------------------------+
|                                                            |
|  ASIL = f(Severity, Exposure, Controllability)             |
|                                                            |
|  Severity (S):                                             |
|    S0: No injuries                                         |
|    S1: Light injuries                                      |
|    S2: Severe injuries (survival probable)                  |
|    S3: Life-threatening / fatal                             |
|                                                            |
|  Exposure (E):                                             |
|    E1: Very low probability                                |
|    E2: Low probability                                     |
|    E3: Medium probability                                  |
|    E4: High probability                                    |
|                                                            |
|  Controllability (C):                                      |
|    C1: Simply controllable                                 |
|    C2: Normally controllable                               |
|    C3: Difficult to control                                |
|                                                            |
|  Example: Electric power steering failure                  |
|    S3 (fatal) x E4 (every drive) x C3 (hard to control)   |
|    = ASIL D (highest level)                                |
|                                                            |
|  ASIL A < ASIL B < ASIL C < ASIL D                        |
+----------------------------------------------------------+
```

### 6.4 IEC 62304: Medical Device Software

Software safety classification:

| Class | Hazard | Requirements |
|-------|--------|-------------|
| A | No injury possible | Basic development process |
| B | Non-serious injury possible | Requirements traceability, architecture, testing |
| C | Death or serious injury possible | Detailed design, unit testing, full traceability |

### 6.5 DO-178C: Avionics Software

Design Assurance Levels (DAL):

| Level | Failure Condition | Example |
|-------|-------------------|---------|
| A | Catastrophic | Flight control computer |
| B | Hazardous | Engine control |
| C | Major | Autopilot disconnect |
| D | Minor | Cabin lighting |
| E | No effect | Entertainment system |

### 6.6 What Safety Certification Means for Firmware

- **Traceability:** Every requirement maps to design, code, and test cases.
- **Coding standards:** MISRA C (automotive), CERT C (general safety).
- **Static analysis:** Tools like Polyspace, PC-lint, or Coverity.
- **Code coverage:** Statement, branch, MC/DC coverage depending on SIL/ASIL level.
- **Configuration management:** Every artifact versioned and change-controlled.
- **Review:** Independent verification of design and code.

---

## 7. Testing Strategies

### 7.1 Unit Testing on Host with CMock/Unity

```c
/* test_temperature.c -- Unity + CMock example */
#include "unity.h"
#include "mock_i2c_driver.h"
#include "temperature_sensor.h"

void setUp(void) { /* Runs before each test */ }
void tearDown(void) { /* Runs after each test */ }

void test_read_temperature_returns_25_degrees(void)
{
    /* Arrange: mock the I2C read to return raw value for 25.0 C */
    uint8_t raw_data[] = {0x01, 0x90};  /* TMP102: 25.0 C */
    i2c_read_ExpectAndReturn(0x48, raw_data, 2, 0);
    i2c_read_ReturnArrayThruPtr_data(raw_data, 2);

    /* Act */
    float temp = temperature_read();

    /* Assert */
    TEST_ASSERT_FLOAT_WITHIN(0.1f, 25.0f, temp);
}

void test_read_temperature_handles_i2c_error(void)
{
    /* Arrange: mock I2C failure */
    i2c_read_ExpectAnyArgsAndReturn(-1);

    /* Act */
    float temp = temperature_read();

    /* Assert: should return error sentinel */
    TEST_ASSERT_FLOAT_WITHIN(0.1f, -999.0f, temp);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_read_temperature_returns_25_degrees);
    RUN_TEST(test_read_temperature_handles_i2c_error);
    return UNITY_END();
}
```

```makefile
# Makefile for host-based unit testing
CC = gcc
CFLAGS = -I../src -I../test/mocks -DTEST

SRCS = test_temperature.c \
       ../src/temperature_sensor.c \
       mock_i2c_driver.c \
       unity.c

test: $(SRCS)
	$(CC) $(CFLAGS) -o test_runner $(SRCS)
	./test_runner
```

### 7.2 Hardware-in-the-Loop (HIL)

```
+----------------------------------------------------------+
|         HARDWARE-IN-THE-LOOP TEST SETUP                    |
+----------------------------------------------------------+
|                                                            |
|  Test Host (PC)                                            |
|  +----------------------------+                            |
|  | pytest / Robot Framework   |                            |
|  | - Send commands via serial |                            |
|  | - Verify GPIO states       |                            |
|  | - Measure power consumption|                            |
|  | - Inject sensor stimuli    |                            |
|  +----------------------------+                            |
|         |  USB/Serial  |  GPIO  |  Power                   |
|         v              v        v                          |
|  +----------------------------+                            |
|  | Device Under Test (DUT)   |                            |
|  | - Runs production firmware |                            |
|  | - Connected to real HW     |                            |
|  +----------------------------+                            |
|         |                                                  |
|  +----------------------------+                            |
|  | Signal Generator / DAQ     |                            |
|  | - Simulate sensor inputs   |                            |
|  | - Capture analog outputs   |                            |
|  +----------------------------+                            |
|                                                            |
+----------------------------------------------------------+
```

### 7.3 Software-in-the-Loop (SIL)

Run firmware logic on the host PC by abstracting the hardware abstraction layer (HAL):

- Replace HAL functions with stubs/mocks.
- Run the same application logic on x86.
- Useful for testing state machines, protocol parsers, and algorithms.
- Does not catch timing-dependent bugs or hardware interaction issues.

### 7.4 Fuzz Testing

```bash
# Using AFL++ to fuzz a firmware parser
# 1. Compile the parser for the host with AFL instrumentation
afl-gcc -o parser_fuzz parser.c protocol_handler.c -DFUZZ_TARGET

# 2. Create seed inputs
mkdir seeds
echo -ne '\x01\x00\x10Hello World' > seeds/valid_packet

# 3. Run fuzzer
afl-fuzz -i seeds -o findings ./parser_fuzz @@

# 4. Analyze crashes
ls findings/crashes/
# Reproduce: ./parser_fuzz findings/crashes/id:000000,...
```

---

## 8. Manufacturing

### 8.1 Production Pipeline

```
+----------------------------------------------------------+
|         MANUFACTURING PIPELINE                             |
+----------------------------------------------------------+
|                                                            |
|  1. PCB Fabrication                                        |
|  +--------------------------------------------------+     |
|  | Gerber files -> PCB factory -> bare boards         |     |
|  +--------------------------------------------------+     |
|                         |                                  |
|  2. SMT Assembly                                           |
|  +--------------------------------------------------+     |
|  | Solder paste -> Pick & place -> Reflow oven        |     |
|  | Through-hole components -> Wave solder             |     |
|  +--------------------------------------------------+     |
|                         |                                  |
|  3. Programming                                            |
|  +--------------------------------------------------+     |
|  | Bed-of-nails jig -> Flash bootloader + firmware    |     |
|  | Provision unique ID, keys, certificates            |     |
|  +--------------------------------------------------+     |
|                         |                                  |
|  4. Factory Test                                           |
|  +--------------------------------------------------+     |
|  | Run factory test firmware                          |     |
|  | Test all interfaces (LED, buttons, sensors, radio) |     |
|  | Record test results with serial number             |     |
|  | PASS -> label & package  |  FAIL -> rework bin     |     |
|  +--------------------------------------------------+     |
|                         |                                  |
|  5. Final QC & Packaging                                   |
|  +--------------------------------------------------+     |
|  | Visual inspection, label, barcode, box             |     |
|  +--------------------------------------------------+     |
|                                                            |
+----------------------------------------------------------+
```

### 8.2 Programming Jigs

```c
/*
 * Bed-of-nails programming jig:
 *
 * - Spring-loaded pogo pins contact test points on PCB
 * - Connected to SWD/JTAG programmer (J-Link, ST-Link)
 * - Automated script flashes bootloader + firmware
 * - Takes 5-15 seconds per unit
 *
 * Jig interface:
 *   Pin 1: VCC (3.3V)
 *   Pin 2: GND
 *   Pin 3: SWDIO
 *   Pin 4: SWCLK
 *   Pin 5: RESET
 *   Pin 6: UART TX (test output)
 */
```

```bash
# Automated programming script using OpenOCD
#!/bin/bash
SERIAL=$(date +%s%N | sha256sum | head -c 12)

openocd -f interface/jlink.cfg \
        -f target/stm32l4x.cfg \
        -c "program bootloader.bin 0x08000000 verify" \
        -c "program firmware.bin 0x08010000 verify" \
        -c "program provisioning.bin 0x080F0000 verify" \
        -c "reset run" \
        -c "exit"

echo "Programmed device: $SERIAL"
echo "$SERIAL,$(date -u +%Y-%m-%dT%H:%M:%SZ),PASS" >> production_log.csv
```

### 8.3 Factory Test Firmware

A separate firmware image designed to exercise all hardware:

```c
/* factory_test.c -- production test sequence */
#include <stdio.h>
#include <stdbool.h>

typedef struct {
    const char *name;
    bool (*test_func)(void);
} test_case_t;

static bool test_led(void)
{
    led_set(LED_RED, true);
    delay_ms(200);
    led_set(LED_RED, false);
    led_set(LED_GREEN, true);
    delay_ms(200);
    led_set(LED_GREEN, false);
    return true;  /* Operator visually confirms */
}

static bool test_accelerometer(void)
{
    int16_t x, y, z;
    if (accel_read(&x, &y, &z) != 0) {
        return false;
    }
    /* Device should be flat: Z ~ 1g, X/Y ~ 0 */
    if (abs(z) < 900 || abs(z) > 1100) return false;
    if (abs(x) > 200 || abs(y) > 200) return false;
    return true;
}

static bool test_radio(void)
{
    /* Transmit a test packet and check for ACK */
    uint8_t payload[] = "FACTORY_TEST";
    return radio_send_and_wait_ack(payload, sizeof(payload), 1000);
}

static bool test_flash_storage(void)
{
    uint8_t test_data[256];
    uint8_t read_back[256];
    for (int i = 0; i < 256; i++) test_data[i] = (uint8_t)i;

    flash_erase_sector(TEST_SECTOR);
    flash_write(TEST_SECTOR_ADDR, test_data, 256);
    flash_read(TEST_SECTOR_ADDR, read_back, 256);

    return memcmp(test_data, read_back, 256) == 0;
}

static const test_case_t tests[] = {
    {"LED",           test_led},
    {"Accelerometer", test_accelerometer},
    {"Radio",         test_radio},
    {"Flash Storage", test_flash_storage},
};

void run_factory_tests(void)
{
    int passed = 0;
    int total = sizeof(tests) / sizeof(tests[0]);

    printf("=== FACTORY TEST START ===\n");
    for (int i = 0; i < total; i++) {
        bool result = tests[i].test_func();
        printf("[%s] %s\n",
               result ? "PASS" : "FAIL", tests[i].name);
        if (result) passed++;
    }
    printf("=== RESULT: %d/%d PASSED ===\n", passed, total);

    if (passed == total) {
        led_set(LED_GREEN, true);   /* All pass */
    } else {
        led_set(LED_RED, true);     /* Some failed */
    }
}
```

### 8.4 Provisioning and Serial Number Management

```c
/*
 * Provisioning data stored in dedicated Flash page:
 *
 * Offset  Field                 Size
 * 0x00    Magic (0xPROV)        4 bytes
 * 0x04    Serial number         12 bytes (ASCII)
 * 0x10    Hardware revision     2 bytes
 * 0x12    Manufacturing date    4 bytes (Unix timestamp)
 * 0x16    Device certificate    512 bytes (X.509 DER)
 * 0x216   Private key (encrypted) 256 bytes
 * 0x316   Provisioning CRC      4 bytes
 */

typedef struct __attribute__((packed)) {
    uint32_t magic;
    char     serial[12];
    uint16_t hw_revision;
    uint32_t mfg_date;
    uint8_t  certificate[512];
    uint8_t  encrypted_key[256];
    uint32_t crc;
} provisioning_data_t;

bool is_provisioned(void)
{
    const provisioning_data_t *prov =
        (const provisioning_data_t *)PROVISIONING_FLASH_ADDR;
    return (prov->magic == 0x50524F56);  /* "PROV" */
}
```

---

## 9. Fleet Management and Monitoring

### 9.1 Key Metrics to Monitor

| Metric | Purpose | Alert Threshold |
|--------|---------|----------------|
| Battery voltage | Predict replacements | < 3.3V |
| RSSI / SNR | Connectivity health | RSSI < -120 dBm |
| Uptime / reboot count | Stability indicator | > 3 reboots/day |
| Firmware version | Track rollout progress | != target version |
| Free Flash / RAM | Detect memory leaks | < 10% free |
| Error counters | Detect systematic issues | > 10 errors/hour |
| Temperature | Operating range compliance | > 85 C |

### 9.2 OTA Update Strategy

- **A/B partitioning:** Two firmware slots; boot into whichever was last verified. Failed update rolls back automatically.
- **Delta updates:** Send only the binary diff (e.g., using bsdiff/bspatch). Reduces OTA size by 60-90%.
- **Staged rollout:** Update 1% of fleet, monitor for 24 hours, then 10%, then 100%.
- **Anti-rollback:** Monotonic version counter in OTP/secure storage prevents downgrade attacks.

---

## 10. Regulatory Landscape

### 10.1 Common Certifications

| Certification | Region | Scope |
|---------------|--------|-------|
| CE | Europe (EU/EEA) | EMC, safety, radio (RED directive) |
| FCC | United States | Radio emissions, intentional radiators |
| IC | Canada | Radio equipment |
| MIC/TELEC | Japan | Radio equipment |
| UL/IEC 62368 | Global | Product safety (electrical/fire) |
| RoHS | EU | Restriction of hazardous substances |
| REACH | EU | Chemical substance registration |
| WEEE | EU | Waste electronics recycling |
| IP rating | Global | Ingress protection (dust/water) |
| UN 38.3 | Global | Lithium battery transport safety |

### 10.2 CE Marking Process

```
+----------------------------------------------------------+
|         CE MARKING PROCESS                                 |
+----------------------------------------------------------+
|                                                            |
|  1. Identify applicable directives                         |
|     - EMC Directive (2014/30/EU)                           |
|     - Low Voltage Directive (2014/35/EU)                   |
|     - Radio Equipment Directive (2014/53/EU) if wireless   |
|     - RoHS Directive (2011/65/EU)                          |
|                                                            |
|  2. Apply harmonized standards                             |
|     - EN 55032 (emissions)                                 |
|     - EN 55035 (immunity)                                  |
|     - EN 62368-1 (safety)                                  |
|     - EN 300 328 (2.4 GHz radio)                           |
|                                                            |
|  3. Test at accredited lab                                  |
|     - EMC chamber testing                                  |
|     - Safety evaluation                                    |
|     - Radio measurements                                   |
|                                                            |
|  4. Prepare technical documentation                         |
|     - Test reports                                         |
|     - Declaration of Conformity (DoC)                      |
|     - User manual with safety warnings                     |
|     - Circuit schematics and BOM                           |
|                                                            |
|  5. Affix CE mark and ship                                  |
+----------------------------------------------------------+
```

---

## 11. Reliability Engineering

### 11.1 MTBF (Mean Time Between Failures)

```
MTBF = Total operating hours / Number of failures

Example:
  1,000 devices running for 8,760 hours (1 year)
  12 failures observed
  MTBF = (1,000 * 8,760) / 12 = 730,000 hours (~83 years)

Component-level MTBF (MIL-HDBK-217):
  Resistor:     500,000,000 hours
  Ceramic cap:  200,000,000 hours
  MCU:           50,000,000 hours
  Electrolytic:   5,000,000 hours  <-- weakest link
  Connector:      1,000,000 hours  <-- if frequently mated
```

### 11.2 Burn-In Testing

Run devices at elevated temperature (85 C) and voltage (10% over-voltage) for 24-168 hours to screen out infant mortality failures. Devices that survive burn-in are statistically more reliable.

```
+----------------------------------------------------------+
|         BATHTUB CURVE (Failure Rate vs. Time)              |
+----------------------------------------------------------+
|                                                            |
|  Failure                                                   |
|  Rate    |\                                        /|      |
|          | \       Useful Life                    / |      |
|          |  \     (constant rate)               /  |      |
|          |   \                                /   |      |
|          |    \______________________________/    |      |
|          |                                        |      |
|          | Infant    |                    | Wear  |      |
|          | Mortality |                    | Out   |      |
|          +---------+-+--------------------+-------+      |
|                                                            |
|          Burn-in screens out early failures                 |
|          (left side of curve)                              |
+----------------------------------------------------------+
```

### 11.3 Accelerated Life Testing (ALT)

Apply stress conditions (temperature, humidity, vibration) beyond normal operating range to predict long-term reliability in a short time:

- **HALT (Highly Accelerated Life Testing):** Find design weaknesses by pushing beyond specification limits.
- **HASS (Highly Accelerated Stress Screening):** Production screening to catch manufacturing defects.
- **Arrhenius model:** Every 10 C increase doubles the failure rate. Testing at 85 C for 1000 hours approximates 10+ years at 25 C.

### 11.4 Watchdog Strategies

```c
/* Multi-level watchdog strategy */

/* Level 1: Hardware watchdog (IWDG -- cannot be disabled) */
void watchdog_init(void)
{
    IWDG->KR = 0x5555;         /* Enable register access */
    IWDG->PR = IWDG_PR_DIV256; /* ~32 second timeout */
    IWDG->RLR = 0xFFF;
    IWDG->KR = 0xCCCC;         /* Start watchdog */
}

void watchdog_feed(void)
{
    IWDG->KR = 0xAAAA;         /* Reload counter */
}

/* Level 2: Software watchdog (task monitoring) */
typedef struct {
    uint32_t last_check_in;
    uint32_t timeout_ms;
    const char *task_name;
} task_monitor_t;

static task_monitor_t monitors[] = {
    {0, 5000,  "sensor_task"},
    {0, 10000, "radio_task"},
    {0, 30000, "cloud_task"},
};

void task_check_in(int task_id)
{
    monitors[task_id].last_check_in = HAL_GetTick();
}

void watchdog_supervisor_task(void *arg)
{
    while (1) {
        bool all_healthy = true;
        uint32_t now = HAL_GetTick();

        for (int i = 0; i < NUM_MONITORS; i++) {
            if (now - monitors[i].last_check_in >
                monitors[i].timeout_ms) {
                printf("WATCHDOG: %s timed out!\n",
                       monitors[i].task_name);
                all_healthy = false;
            }
        }

        if (all_healthy) {
            watchdog_feed();  /* Only feed HW WDG if all tasks healthy */
        }
        /* If any task is stuck, HW watchdog will reset the system */

        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
```

---

## 12. Putting It All Together: Production Checklist

```
Pre-Production:
  [ ] MCU selected with adequate Flash/RAM/peripherals
  [ ] BOM cost within target at production volume
  [ ] Second-source components identified for critical parts
  [ ] PCB designed with proper decoupling, ground plane, test points
  [ ] Pre-compliance EMC scan passed
  [ ] Secure boot chain implemented and tested
  [ ] OTA update mechanism tested (including rollback)
  [ ] Factory test firmware written and validated

Certification:
  [ ] EMC testing passed (CE/FCC)
  [ ] Safety testing passed (UL/IEC 62368)
  [ ] Radio certification obtained (if wireless)
  [ ] RoHS/REACH compliance documented
  [ ] Battery transport certification (UN 38.3 if lithium)
  [ ] Functional safety assessment (if applicable)

Manufacturing:
  [ ] Programming jig designed and tested
  [ ] Factory test yield > 95%
  [ ] Provisioning system operational (serial numbers, keys)
  [ ] Production log database set up
  [ ] Burn-in test protocol defined

Post-Launch:
  [ ] Fleet monitoring dashboard operational
  [ ] OTA update pipeline tested end-to-end
  [ ] Customer support procedures documented
  [ ] Field failure analysis process defined
  [ ] MTBF tracking initiated
```

---

## Interview Questions

**Q1: What factors do you consider when selecting an MCU for a new product?**
Core architecture and performance, Flash/RAM for firmware and OTA, required peripherals (UART, SPI, I2C, ADC), built-in connectivity (WiFi, BLE), low-power modes and sleep current, security features (TrustZone, crypto), ecosystem maturity (SDK, RTOS ports, community), supply chain (availability, second sources, lead time), unit cost at volume, and package options for PCB assembly.

**Q2: How do you estimate battery life for an IoT device?**
Create a power profile by measuring current draw in each operating mode (sleep, active, transmit). Calculate average current using the duty cycle: sum of (current * time) for each mode divided by total cycle time. Divide battery capacity (mAh) by average current (mA) to get hours. Derate by 15-20% for battery aging and self-discharge.

**Q3: What is secure boot and why is it important for embedded devices?**
Secure boot is a chain of trust where each boot stage cryptographically verifies the signature of the next stage before executing it. The root of trust is anchored in immutable ROM or OTP fuses. It prevents execution of tampered or unauthorized firmware, protecting against malware injection, IP theft, and counterfeit devices.

**Q4: Explain the difference between SIL and ASIL.**
SIL (Safety Integrity Level, IEC 61508) is a general functional safety standard with levels 1-4 based on target probability of dangerous failure per hour. ASIL (Automotive Safety Integrity Level, ISO 26262) is automotive-specific with levels A-D, determined by severity, exposure, and controllability of hazards. ASIL D roughly maps to SIL 3 in terms of rigor.

**Q5: How do you handle EMC compliance in a product design?**
Design the PCB with proper ground planes, decoupling capacitors close to IC power pins, controlled impedance for high-speed traces, and ferrite beads on clock lines. Use spread-spectrum clocking to reduce peak emissions. Add TVS diodes on external interfaces for ESD protection. Perform pre-compliance testing with near-field probes before expensive lab testing. Shield sensitive circuits if needed.

**Q6: Describe a hardware-in-the-loop (HIL) test setup for embedded firmware.**
A test host (PC running pytest or Robot Framework) connects to the DUT via serial/USB. The host sends commands, reads responses, and optionally controls signal generators to simulate sensor inputs. GPIO monitoring verifies output states. A power analyzer measures consumption. The test suite exercises all firmware features against real hardware, catching timing and peripheral interaction bugs that unit tests miss.

**Q7: What is the purpose of factory test firmware?**
Factory test firmware is a separate image flashed during manufacturing that exercises every hardware component: LEDs, buttons, sensors, radio, Flash storage, and interfaces. It runs automated tests and reports pass/fail via serial or LED indication. It screens out assembly defects (cold solder joints, missing components) before shipping. Results are logged with the device serial number for traceability.

**Q8: How would you implement an A/B firmware update scheme?**
Partition Flash into two equal firmware slots (A and B) plus a boot metadata sector. The bootloader reads metadata to determine which slot is active. During OTA, write the new firmware to the inactive slot, update metadata to mark it as pending, and reboot. The bootloader starts the new firmware; if it reports success, the slot is confirmed. If the new firmware fails to boot (watchdog reset), the bootloader reverts to the previous slot.

**Q9: What is MISRA C and why is it used in safety-critical firmware?**
MISRA C is a set of coding guidelines for the C language that restrict language features prone to causing defects: undefined behavior, pointer arithmetic, implicit type conversions, dynamic memory allocation, and recursion. It is required or recommended by IEC 61508, ISO 26262, and other safety standards to produce more predictable, analyzable, and testable code.

**Q10: How do you protect firmware intellectual property on a shipped device?**
Disable JTAG/SWD debug ports via option bytes or fuses. Enable Flash read-out protection (RDP Level 2 on STM32). Encrypt firmware updates with AES-GCM using keys stored in a secure element. Use secure boot to prevent running unauthorized code. Consider code obfuscation for interpreted code. Store sensitive algorithms in a secure enclave (TrustZone).

**Q11: What is burn-in testing and what does it catch?**
Burn-in testing operates devices at elevated temperature (typically 85 C) and voltage for 24-168 hours to accelerate infant mortality failures. It catches early-life defects: marginal solder joints, weak semiconductor junctions, contamination-related failures, and components with manufacturing defects that would fail within the first few weeks of normal use.

**Q12: Describe the key differences between CE and FCC certification.**
CE (Conformite Europeenne) is self-declared: the manufacturer assesses conformity against EU directives, creates a Declaration of Conformity, and affixes the CE mark. FCC requires equipment authorization: either Supplier's Declaration of Conformity (SDoC) for unintentional radiators or Certification by an accredited lab for intentional radiators (WiFi, BLE). CE covers EMC + safety + radio, while FCC focuses primarily on radio emissions.

**Q13: How do you approach power management in a battery-powered IoT device?**
Identify the lowest sleep mode that retains necessary state (RTC, RAM, wake sources). Minimize active time by pre-computing and batching operations. Disable all unused peripherals and clock gates. Use DMA instead of CPU polling. Choose efficient voltage regulators (switching for high current, LDO for low noise). Schedule transmissions to minimize radio-on time. Measure actual current with a micro-ammeter to validate estimates.

**Q14: What is the role of a watchdog timer in production firmware?**
The hardware watchdog timer resets the MCU if firmware stops feeding it within the timeout period, recovering from infinite loops, deadlocks, and hard faults. In production firmware, implement a multi-level watchdog: the hardware watchdog is fed only by a supervisor task, and the supervisor only feeds it when all monitored application tasks have checked in within their deadlines. This catches both whole-system hangs and individual task failures.

**Q15: How do you manage device provisioning at scale (100K+ units)?**
Use a provisioning server that generates unique identities: serial numbers, X.509 device certificates, and encrypted private keys. The programming jig flashes the provisioning data into a dedicated Flash page during manufacturing. Each device's identity is registered in a cloud device registry (AWS IoT Core, Azure IoT Hub). Use a secure element to store private keys, preventing extraction. Log every provisioned device with timestamp and test results for traceability and warranty tracking.
