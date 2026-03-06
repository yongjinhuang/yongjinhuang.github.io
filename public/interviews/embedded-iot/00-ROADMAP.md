# Embedded Systems & IoT: From Zero to Expert

## Why This Guide Exists

Embedded systems are everywhere -- your microwave, your car's engine controller, your smartwatch, industrial PLCs, medical devices, satellites. Over 98% of all processors manufactured go into embedded systems, not desktop computers or servers. Yet most software engineers have never written code that runs without an operating system, never debugged a timing issue with an oscilloscope, and never thought about what happens when `malloc` fails and there is no swap space.

This guide takes you from zero embedded experience to understanding and building production-grade embedded and IoT systems. Whether you want to build a smart home sensor network on a Raspberry Pi or write firmware for a medical device, this guide gives you the foundation.

---

## Do I Need Hardware?

**Short answer**: Not to start, but eventually yes.

```
+------------------------------------------------------------------------+
|                     LEARNING WITHOUT HARDWARE                           |
+------------------------------------------------------------------------+
|                                                                        |
|  SIMULATORS / EMULATORS              ONLINE PLATFORMS                  |
|  +-------------------------+         +---------------------------+     |
|  | QEMU (ARM, RISC-V)       |         | Wokwi (Arduino/ESP32)     |     |
|  | Renode (multi-node)       |         | TinkerCAD Circuits         |     |
|  | SimAVR (AVR family)       |         | ARM Mbed Simulator         |     |
|  | Keil uVision simulator   |         | PlatformIO + CI            |     |
|  +-------------------------+         +---------------------------+     |
|                                                                        |
|  RECOMMENDED STARTER HARDWARE (Budget: ~$50-100)                       |
|  +------------------------------------------------------------------+ |
|  | Raspberry Pi Pico W  ($6)   -- RP2040, great for bare-metal       | |
|  | ESP32-S3 DevKit      ($10)  -- WiFi + BLE, perfect for IoT        | |
|  | STM32 Nucleo board   ($15)  -- Industry-standard ARM Cortex-M     | |
|  | Raspberry Pi 4/5     ($35+) -- Full Linux, good for IoT gateway   | |
|  | Logic analyzer       ($10)  -- Essential for debugging protocols  | |
|  | Breadboard + LEDs    ($10)  -- For hands-on experiments           | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

Start with chapters 01-03 using simulators. Buy hardware when you reach chapter 04.

---

## The Embedded & IoT Landscape

```
+------------------------------------------------------------------------+
|                   EMBEDDED SYSTEMS & IoT ECOSYSTEM                      |
+------------------------------------------------------------------------+
|                                                                        |
|  BARE-METAL / FIRMWARE              RTOS-BASED SYSTEMS                 |
|  +-------------------------+        +---------------------------+      |
|  | Bootloaders              |        | FreeRTOS                   |      |
|  | Interrupt handlers        |        | Zephyr                     |      |
|  | Device drivers            |        | RT-Thread                  |      |
|  | Peripheral programming   |        | ThreadX (Azure RTOS)       |      |
|  | Power management          |        | Task scheduling            |      |
|  +-------------------------+        +---------------------------+      |
|                                                                        |
|  IoT / CONNECTED DEVICES            LINUX-BASED EMBEDDED              |
|  +-------------------------+        +---------------------------+      |
|  | MQTT / CoAP protocols     |        | Yocto / Buildroot          |      |
|  | BLE / WiFi / LoRa / Zigbee|        | Device tree                |      |
|  | Edge computing            |        | Kernel modules             |      |
|  | OTA firmware updates      |        | Embedded Linux drivers     |      |
|  | Cloud integration         |        | Raspberry Pi ecosystem     |      |
|  +-------------------------+        +---------------------------+      |
|                                                                        |
|  AUTOMOTIVE / SAFETY-CRITICAL       INDUSTRIAL / PLC                   |
|  +-------------------------+        +---------------------------+      |
|  | AUTOSAR                   |        | Modbus / OPC-UA            |      |
|  | ISO 26262 (ASIL)          |        | PLC programming (IEC 61131)|      |
|  | CAN bus / LIN / FlexRay   |        | SCADA systems              |      |
|  | ECU development           |        | Industrial protocols        |      |
|  | Functional safety          |        | Predictive maintenance     |      |
|  +-------------------------+        +---------------------------+      |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## Learning Path Overview

### Phase 1: Hardware Foundations (Chapters 01-02)

**Goal**: Understand how microcontrollers work and how software interacts with hardware.

```
01-MICROCONTROLLER-FUNDAMENTALS     02-BARE-METAL-PROGRAMMING
+---------------------------+       +---------------------------+
| CPU architectures (ARM,    |       | Startup code & linker      |
|   RISC-V, AVR)             |       | Memory-mapped I/O          |
| Memory map (Flash, SRAM)   |       | GPIO programming           |
| Registers & peripherals    |       | Timers & counters          |
| Clock system               |       | Interrupts & NVIC          |
| Power modes                |       | DMA transfers              |
+---------------------------+       +---------------------------+
```

### Phase 2: Communication & Protocols (Chapters 03-04)

**Goal**: Master the protocols that connect embedded systems to the world.

```
03-SERIAL-PROTOCOLS                 04-WIRELESS-AND-NETWORKING
+---------------------------+       +---------------------------+
| UART / RS-232 / RS-485     |       | WiFi (ESP32, station/AP)   |
| SPI (master/slave)          |       | BLE (GATT, advertising)    |
| I2C (multi-device bus)      |       | LoRa / LoRaWAN             |
| CAN bus                     |       | Zigbee / Thread / Matter   |
| 1-Wire, PWM, ADC/DAC       |       | TCP/IP on embedded          |
+---------------------------+       +---------------------------+
```

### Phase 3: RTOS & Concurrency (Chapter 05)

**Goal**: Write reliable concurrent firmware using real-time operating systems.

```
05-RTOS-FUNDAMENTALS
+---------------------------+
| Task scheduling             |
| Semaphores & mutexes        |
| Message queues              |
| Memory management           |
| Priority inversion          |
| Deadline guarantees         |
+---------------------------+
```

### Phase 4: IoT Architecture (Chapters 06-07)

**Goal**: Build connected systems that communicate with the cloud.

```
06-IoT-PROTOCOLS-AND-CLOUD         07-EDGE-COMPUTING
+---------------------------+       +---------------------------+
| MQTT (QoS levels)           |       | TinyML (TensorFlow Lite)   |
| CoAP / LwM2M               |       | Edge inference              |
| HTTP/REST on constrained    |       | Anomaly detection           |
|   devices                   |       | Federated learning          |
| AWS IoT / Azure IoT Hub    |       | Model optimization          |
| OTA firmware updates        |       | Hardware accelerators       |
+---------------------------+       +---------------------------+
```

### Phase 5: Embedded Linux (Chapter 08)

**Goal**: Build Linux-based embedded systems (Raspberry Pi and beyond).

```
08-EMBEDDED-LINUX
+---------------------------+
| Cross-compilation           |
| Yocto / Buildroot           |
| Device tree                 |
| Kernel modules              |
| Root filesystem              |
| systemd & init systems      |
+---------------------------+
```

### Phase 6: Production & Safety (Chapter 09)

**Goal**: Ship embedded products that are reliable, secure, and certifiable.

```
09-PRODUCTION-AND-SAFETY
+---------------------------+
| Hardware-software co-design |
| EMC / EMI considerations    |
| Functional safety (IEC 61508)|
| Security (secure boot, TLS) |
| Testing (HIL, SIL)          |
| Manufacturing & deployment   |
+---------------------------+
```

---

## How to Use This Guide

Each chapter follows a consistent structure:

1. **Conceptual Foundation** -- What is it and why does it matter?
2. **Hardware Context** -- What physical components are involved?
3. **Implementation** -- Working code in C / MicroPython / Rust
4. **Hands-On Lab** -- Practical exercises (with simulator alternatives)
5. **Interview Questions** -- What you will be asked about this topic

The guide targets software engineers with strong programming skills but zero embedded experience. C is the dominant language in embedded (used in ~70% of firmware), so most code examples are in C, with MicroPython alternatives for rapid prototyping on Raspberry Pi Pico and ESP32.
