# Embedded Systems & IoT: From Zero to Expert

## Why This Guide Exists

Embedded systems are everywhere -- your microwave, your car's engine controller, your smartwatch, industrial PLCs, medical devices, satellites. Over 98% of all processors manufactured go into embedded systems, not desktop computers or servers. Yet most software engineers have never written code that runs without an operating system, never debugged a timing issue with an oscilloscope, and never thought about what happens when `malloc` fails and there is no swap space.

This guide takes you from zero embedded experience to understanding and building production-grade embedded and IoT systems. Whether you want to build a smart home sensor network on a Raspberry Pi or write firmware for a medical device, this guide gives you the foundation.

---

## Do I Need Hardware?

**Short answer**: Not to start, but eventually yes.

```mermaid
flowchart TD
    subgraph Starter["LEARNING EMBEDDED SYSTEMS (Simulators &amp; Starter Hardware)"]
        Sim["SIMULATORS / EMULATORS<br/>QEMU (ARM, RISC-V), Renode (multi-node), SimAVR, Keil uVision"]
        Online["ONLINE PLATFORMS<br/>Wokwi (Arduino/ESP32), TinkerCAD Circuits, ARM Mbed Simulator, PlatformIO + CI"]
        HW["RECOMMENDED STARTER HARDWARE (~$50-100)<br/>- Raspberry Pi Pico W ($6, RP2040 bare-metal)<br/>- ESP32-S3 DevKit ($10, WiFi + BLE IoT)<br/>- STM32 Nucleo ($15, ARM Cortex-M)<br/>- Raspberry Pi 4/5 ($35+, Embedded Linux)<br/>- USB Logic Analyzer ($10, SPI/I2C/UART debugging)"]
    end
```

Start with chapters 01-03 using simulators. Buy hardware when you reach chapter 04.

---

## The Embedded & IoT Landscape

```mermaid
flowchart TD
    subgraph Eco["EMBEDDED SYSTEMS &amp; IoT ECOSYSTEM"]
        BM["BARE-METAL / FIRMWARE<br/>Bootloaders, Interrupt handlers, Device drivers, Peripherals, Power mgmt"]
        RTOS["RTOS-BASED SYSTEMS<br/>FreeRTOS, Zephyr, RT-Thread, ThreadX, Deterministic task scheduling"]
        IoT["IoT / CONNECTED DEVICES<br/>MQTT / CoAP, BLE / WiFi / LoRa / Zigbee, Edge computing, OTA, Cloud"]
        Linux["LINUX-BASED EMBEDDED<br/>Yocto / Buildroot, Device Tree, Kernel modules, Drivers"]
        Auto["AUTOMOTIVE / SAFETY-CRITICAL<br/>AUTOSAR, ISO 26262 (ASIL), CAN / LIN / FlexRay, ECU development"]
        Ind["INDUSTRIAL / PLC<br/>Modbus / OPC-UA, PLC (IEC 61131), SCADA, Predictive maintenance"]
    end
```

---

## Learning Path Overview

### Phase 1: Hardware Foundations (Chapters 01-02)

**Goal**: Understand how microcontrollers work and how software interacts with hardware.

```mermaid
flowchart LR
    M1["01-MICROCONTROLLER-FUNDAMENTALS<br/>- CPU architectures (ARM, RISC-V, AVR)<br/>- Memory map (Flash, SRAM)<br/>- Registers, Clock system, Power modes"]
    M2["02-BARE-METAL-PROGRAMMING<br/>- Startup code &amp; Linker scripts<br/>- Memory-mapped I/O &amp; GPIO<br/>- Timers, Interrupts (NVIC), DMA"]
    M1 --> M2
```

### Phase 2: Communication & Protocols (Chapters 03-04)

**Goal**: Master the protocols that connect embedded systems to the world.

```mermaid
flowchart LR
    M3["03-SERIAL-PROTOCOLS<br/>- UART / RS-232 / RS-485<br/>- SPI &amp; I2C<br/>- CAN bus, 1-Wire, PWM, ADC/DAC"]
    M4["04-WIRELESS-AND-NETWORKING<br/>- WiFi (ESP32 STA/AP) &amp; BLE (GATT)<br/>- LoRa / LoRaWAN<br/>- Zigbee / Thread / Matter &amp; lwIP"]
    M3 --> M4
```

### Phase 3: RTOS & Concurrency (Chapter 05)

**Goal**: Write reliable concurrent firmware using real-time operating systems.

```mermaid
flowchart LR
    M5["05-RTOS-FUNDAMENTALS<br/>- Preemptive task scheduling<br/>- Semaphores, Mutexes, Message queues<br/>- Memory pools, Priority inversion, Deadlines"]
```

### Phase 4: IoT Architecture (Chapters 06-07)

**Goal**: Build connected systems that communicate with the cloud.

```mermaid
flowchart LR
    M6["06-IoT-PROTOCOLS-AND-CLOUD<br/>- MQTT (QoS 0/1/2) &amp; CoAP / LwM2M<br/>- AWS IoT Core / Azure IoT Hub<br/>- A/B OTA Firmware Updates"]
    M7["07-EDGE-COMPUTING<br/>- TinyML (TFLite Micro)<br/>- INT8 Quantization &amp; Edge TPUs<br/>- Anomaly detection &amp; Federated learning"]
    M6 --> M7
```

### Phase 5: Embedded Linux (Chapter 08)

**Goal**: Build Linux-based embedded systems (Raspberry Pi and beyond).

```mermaid
flowchart LR
    M8["08-EMBEDDED-LINUX<br/>- Cross-compilation &amp; Boot sequence (ROM -&gt; SPL -&gt; U-Boot -&gt; Kernel)<br/>- Yocto / Buildroot, Device Tree, Kernel modules, systemd"]
```

### Phase 6: Production & Safety (Chapter 09)

**Goal**: Ship embedded products that are reliable, secure, and certifiable.

```mermaid
flowchart LR
    M9["09-PRODUCTION-AND-SAFETY<br/>- HW/SW co-design &amp; EMC/EMI<br/>- Functional safety (IEC 61508 SIL / ISO 26262 ASIL)<br/>- Secure Boot, HIL testing, Manufacturing"]
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
