# Chapter 4: Wireless & Networking -- Connecting to the World

Modern embedded systems rarely operate in isolation. Whether it is a smart thermostat reporting temperature to the cloud or a fleet of agricultural sensors spanning thousands of hectares, wireless connectivity is the bridge between the physical and digital worlds. This chapter surveys the dominant wireless technologies an embedded engineer must understand, from WiFi and Bluetooth Low Energy to long-range protocols like LoRa and cellular IoT. We then discuss how to choose the right technology for a given application.

---

## 1. WiFi on Embedded Systems

### 1.1 Why WiFi?

WiFi (IEEE 802.11) is ubiquitous. Nearly every home and office has a WiFi access point. For IoT devices that operate within range of existing infrastructure, WiFi offers high throughput (tens of Mbps), mature security (WPA2/WPA3), and direct IP connectivity -- meaning your device can speak HTTP, WebSocket, or MQTT without a gateway.

The trade-off is power consumption. A typical WiFi radio draws 100-300 mA during transmission, making it unsuitable for battery-powered devices expected to last years. For mains-powered or frequently-recharged devices, WiFi is often the simplest path to connectivity.

### 1.2 The ESP32: A WiFi Workhorse

The ESP32 from Espressif has become the de facto WiFi-capable microcontroller for prototyping and production alike. Key specs:

- Dual-core Xtensa LX6 at 240 MHz (or single-core variants)
- 520 KB SRAM, external flash up to 16 MB
- WiFi 802.11 b/g/n, Bluetooth 4.2 / BLE
- Rich peripheral set: SPI, I2C, UART, ADC, DAC, PWM

### 1.3 Station Mode vs Access Point Mode

An ESP32 can operate in two WiFi modes:

```
Station (STA) Mode             Access Point (AP) Mode
==================             ======================

  [ESP32] ---WiFi---> [Router] ---> Internet
  (client)            (AP)

  [Phone/Laptop] ---WiFi---> [ESP32]
                              (acts as AP)
```

**Station mode**: The ESP32 joins an existing WiFi network, receives an IP via DHCP, and can reach the internet. This is the most common mode for cloud-connected IoT devices.

**AP mode**: The ESP32 creates its own WiFi network. Other devices connect to it. Useful for initial configuration (captive portal) or local-only communication when no router is available.

**STA+AP mode**: Both simultaneously. The ESP32 connects to a router while also hosting its own network -- useful for mesh-like topologies or bridging.

### 1.4 HTTP Client on ESP32 (MicroPython)

```python
import network
import urequests

# Connect to WiFi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect('MyNetwork', 'MyPassword')

while not wlan.isconnected():
    pass

print('IP:', wlan.ifconfig()[0])

# Make an HTTP GET request
response = urequests.get('http://api.example.com/sensor')
print('Status:', response.status_code)
print('Body:', response.json())
response.close()
```

### 1.5 HTTP Server on ESP32 (MicroPython)

```python
import network
import socket
import json

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect('MyNetwork', 'MyPassword')
while not wlan.isconnected():
    pass

addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(addr)
s.listen(5)

print('Listening on', addr)

while True:
    cl, addr = s.accept()
    request = cl.recv(1024).decode('utf-8')

    # Parse request line
    method_line = request.split('\r\n')[0]

    body = json.dumps({"temperature": 23.5, "humidity": 61.2})
    response = (
        'HTTP/1.1 200 OK\r\n'
        'Content-Type: application/json\r\n'
        'Content-Length: {}\r\n'
        '\r\n'
        '{}'
    ).format(len(body), body)

    cl.send(response.encode('utf-8'))
    cl.close()
```

### 1.6 HTTP Client on ESP32 (C / ESP-IDF)

```c
#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "HTTP_CLIENT";

esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA) {
        ESP_LOGI(TAG, "Received %d bytes", evt->data_len);
    }
    return ESP_OK;
}

void fetch_data(void) {
    esp_http_client_config_t config = {
        .url = "http://api.example.com/sensor",
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        int length = esp_http_client_get_content_length(client);
        ESP_LOGI(TAG, "Status=%d, Content-Length=%d", status, length);
    }

    esp_http_client_cleanup(client);
}
```

### 1.7 WebSocket on Embedded

WebSocket provides full-duplex communication over a single TCP connection. Unlike HTTP request-response, WebSocket lets the server push data to the client at any time. This is ideal for real-time dashboards or remote control interfaces.

```
HTTP Upgrade Handshake:
  Client: GET /ws HTTP/1.1
          Upgrade: websocket
          Connection: Upgrade
          Sec-WebSocket-Key: ...

  Server: HTTP/1.1 101 Switching Protocols
          Upgrade: websocket

  --- Full-duplex frames flow in both directions ---
```

ESP-IDF provides `esp_websocket_client` for outbound WebSocket connections. For hosting a WebSocket server on the ESP32, libraries like `esp_http_server` support WebSocket endpoints.

---

## 2. Bluetooth Low Energy (BLE)

### 2.1 BLE vs Classic Bluetooth

Classic Bluetooth (BR/EDR) was designed for continuous streaming (audio, file transfer). BLE (Bluetooth Low Energy), introduced in Bluetooth 4.0, is optimized for intermittent, low-bandwidth data exchange. A BLE device can run for months or years on a coin cell battery.

| Feature           | Classic Bluetooth    | BLE                          |
| ----------------- | -------------------- | ---------------------------- |
| Data rate         | 1-3 Mbps             | 1-2 Mbps (125 Kbps coded)    |
| Range             | ~10-100 m            | ~10-100 m (up to 1 km coded) |
| Power consumption | High                 | Very low                     |
| Connection setup  | Seconds              | Milliseconds                 |
| Use cases         | Audio, file transfer | Sensors, beacons, wearables  |

### 2.2 GAP: Generic Access Profile

GAP controls how devices discover each other and establish connections. It defines roles:

- **Broadcaster**: Sends advertising packets only (e.g., a beacon)
- **Observer**: Scans for advertising packets only
- **Peripheral**: Advertises and accepts connections (e.g., a heart rate sensor)
- **Central**: Scans and initiates connections (e.g., a smartphone)

```
  Advertising (GAP)
  =================

  [Peripheral]  --- ADV_IND (advertising packet) --->  [Central]
  [Peripheral]  <-- SCAN_REQ -----------------------  [Central]
  [Peripheral]  --- SCAN_RSP (more data) ---------->  [Central]
  [Peripheral]  <-- CONNECT_REQ -------------------  [Central]

  --- Connection established ---
```

### 2.3 GATT: Generic Attribute Profile

Once connected, data exchange follows the GATT model. GATT organizes data into a hierarchy:

```
  GATT Server Structure
  =====================

  +--------------------------------------------+
  |  GATT Server (Peripheral)                  |
  |                                            |
  |  +--------------------------------------+  |
  |  |  Service: Heart Rate (UUID: 0x180D)  |  |
  |  |                                      |  |
  |  |  +--------------------------------+  |  |
  |  |  | Characteristic: HR Measurement  |  |  |
  |  |  | UUID: 0x2A37                    |  |  |
  |  |  | Properties: Notify              |  |  |
  |  |  | Value: [0x06, 72]  (72 bpm)     |  |  |
  |  |  |                                 |  |  |
  |  |  | Descriptor: CCCD (0x2902)       |  |  |
  |  |  | Value: [0x01, 0x00] (notify on) |  |  |
  |  |  +--------------------------------+  |  |
  |  |                                      |  |
  |  |  +--------------------------------+  |  |
  |  |  | Characteristic: Body Sensor Loc |  |  |
  |  |  | UUID: 0x2A38                    |  |  |
  |  |  | Properties: Read                |  |  |
  |  |  | Value: [0x01] (Chest)           |  |  |
  |  |  +--------------------------------+  |  |
  |  +--------------------------------------+  |
  |                                            |
  |  +--------------------------------------+  |
  |  |  Service: Battery (UUID: 0x180F)     |  |
  |  |  ...                                 |  |
  |  +--------------------------------------+  |
  +--------------------------------------------+
```

Key concepts:

- **Service**: A collection of related characteristics (identified by UUID)
- **Characteristic**: A single data point with properties (Read, Write, Notify, Indicate)
- **Descriptor**: Metadata about a characteristic (e.g., CCCD for enabling notifications)

### 2.4 Advertising and Pairing

Advertising packets are broadcast on three dedicated channels (37, 38, 39) to minimize collision with data channels. The advertising payload is limited to 31 bytes (extended to 255 bytes in Bluetooth 5.0).

Pairing establishes a secure bond between devices. BLE supports several pairing methods:

- **Just Works**: No user interaction (vulnerable to MITM)
- **Passkey Entry**: User enters a 6-digit code
- **Numeric Comparison**: Both devices display a code, user confirms match
- **Out-of-Band (OOB)**: Uses NFC or QR code

### 2.5 BLE on ESP32 (MicroPython)

```python
import bluetooth
import struct
from micropython import const

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

_TEMP_SERVICE_UUID = bluetooth.UUID(0x181A)  # Environmental Sensing
_TEMP_CHAR_UUID = bluetooth.UUID(0x2A6E)     # Temperature

_TEMP_CHAR = (
    _TEMP_CHAR_UUID,
    bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY,
)
_TEMP_SERVICE = (
    _TEMP_SERVICE_UUID,
    (_TEMP_CHAR,),
)

class BLETemperature:
    def __init__(self):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.irq(self._irq)
        ((self._handle,),) = self._ble.gatts_register_services(
            (_TEMP_SERVICE,)
        )
        self._connections = set()
        self._advertise()

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self._connections.add(conn_handle)
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self._connections.discard(conn_handle)
            self._advertise()

    def _advertise(self):
        name = b'ESP32-Temp'
        adv_data = bytearray(b'\x02\x01\x06')  # Flags
        adv_data += bytearray([len(name) + 1, 0x09]) + name
        self._ble.gap_advertise(100_000, adv_data)

    def update_temperature(self, temp_c):
        # BLE temperature is in 0.01 degree C units
        value = struct.pack('<h', int(temp_c * 100))
        self._ble.gatts_write(self._handle, value)
        for conn in self._connections:
            self._ble.gatts_notify(conn, self._handle, value)

sensor = BLETemperature()
sensor.update_temperature(23.45)
```

### 2.6 Nordic nRF Series

While the ESP32 includes BLE as one of many features, Nordic Semiconductor's nRF series (nRF52840, nRF5340) is purpose-built for BLE and low-power wireless. Key advantages:

- Ultra-low-power radio with advanced power management
- Support for BLE, Thread, Zigbee, and proprietary protocols
- Excellent SDK (nRF Connect SDK based on Zephyr RTOS)
- Hardware crypto acceleration
- USB, NFC tag support on some variants

Nordic chips dominate the wearable and medical device markets where every microamp counts.

---

## 3. LoRa and LoRaWAN

### 3.1 Chirp Spread Spectrum

LoRa (Long Range) uses Chirp Spread Spectrum (CSS) modulation. Unlike FSK or OOK, CSS spreads each symbol across a wide bandwidth using frequency sweeps ("chirps"). This allows signal recovery well below the noise floor.

```
  Chirp Spread Spectrum
  =====================

  Frequency
  ^
  |     /|    /|    /|
  |    / |   / |   / |    "Up-chirp"
  |   /  |  /  |  /  |
  |  /   | /   | /   |
  | /    |/    |/    |
  +------------------------> Time

  Each chirp encodes a symbol.
  Spreading factor (SF7-SF12) controls
  chirps per symbol:
    SF7  = fastest, shortest range
    SF12 = slowest, longest range
```

### 3.2 Range vs Data Rate

LoRa achieves remarkable range at the expense of data rate:

| Spreading Factor | Bit Rate  | Approx Range (urban) | Approx Range (rural) |
| ---------------- | --------- | -------------------- | -------------------- |
| SF7              | 5.5 kbps  | 2 km                 | 10 km                |
| SF12             | 0.29 kbps | 5 km                 | 15+ km               |

Maximum payload per message is typically 51-222 bytes depending on SF and region. This makes LoRa ideal for small sensor readings (temperature, GPS coordinates, soil moisture) sent infrequently.

### 3.3 LoRaWAN Architecture

LoRaWAN adds a MAC layer and network architecture on top of LoRa modulation:

```
  LoRaWAN Network Architecture
  ============================

  +--------+     +--------+     +--------+
  | End    |     | End    |     | End    |
  | Device | ... | Device | ... | Device |
  +---+----+     +---+----+     +---+----+
      |  LoRa        |  LoRa        |  LoRa
      v              v              v
  +--------+     +--------+
  |Gateway |     |Gateway |    (multiple gateways
  |(+ GPS) |     |(+ GPS) |     hear same packet)
  +---+----+     +---+----+
      |  IP           |  IP
      v              v
  +---------------------------+
  |    Network Server         |
  |  (TTN / Chirpstack /      |
  |   AWS IoT Core for LoRa)  |
  +------------+--------------+
               |
               v
  +---------------------------+
  |    Application Server     |
  |  (your backend / cloud)   |
  +---------------------------+
```

Key LoRaWAN concepts:

- **Device classes**: A (lowest power, receives only after transmit), B (scheduled receive windows), C (always listening)
- **Adaptive Data Rate (ADR)**: Network server optimizes SF per device
- **OTAA**: Over-the-air activation (preferred, uses AppKey for session key derivation)
- **ABP**: Activation by personalization (pre-provisioned keys, simpler but less secure)

### 3.4 TTN and ChirpStack

**The Things Network (TTN)** is a global, community-driven LoRaWAN network. Free tier allows testing. **ChirpStack** is an open-source LoRaWAN network server you can self-host.

---

## 4. Zigbee and Thread

### 4.1 IEEE 802.15.4

Both Zigbee and Thread are built on the IEEE 802.15.4 physical and MAC layer standard, which operates in the 2.4 GHz band at 250 kbps. The key feature of 802.15.4 is low power consumption with support for mesh networking.

### 4.2 Zigbee Mesh Networking

```
  Zigbee Mesh Topology
  ====================

  [C] = Coordinator (1 per network, forms the PAN)
  [R] = Router (extends range, routes packets)
  [E] = End Device (sleeps, low power)

       [E]         [E]
        \         /
         [R]---[R]
        / |     | \
      [E] |     |  [E]
           \   /
            [C]        <-- Trust Center
           / | \
         [R] | [R]
        /    |    \
      [E]   [E]   [E]
```

Zigbee supports up to 65,000 nodes per network. Zigbee 3.0 unified the previously fragmented application profiles (Home Automation, Light Link, etc.) into a single standard.

### 4.3 Thread

Thread is a newer mesh protocol also based on 802.15.4 but uses IPv6 natively (6LoWPAN). Key advantages over Zigbee:

- No single point of failure (no coordinator)
- IP-based (integrable with existing IP infrastructure)
- Border Router connects Thread mesh to WiFi/Ethernet
- Designed for reliability and security from the ground up

Thread does not define an application layer -- that role is filled by Matter.

---

## 5. Matter Protocol

### 5.1 Smart Home Unification

Matter (formerly Project CHIP) is an application-layer protocol backed by Apple, Google, Amazon, and Samsung. It runs over WiFi, Thread, and Ethernet, providing a single standard for smart home devices.

```
  Matter Protocol Stack
  =====================

  +---------------------------+
  |     Matter Application    |
  |  (Device types: light,    |
  |   lock, thermostat, etc.) |
  +---------------------------+
  |     Matter Data Model     |
  |  (Clusters, Attributes,   |
  |   Commands, Events)       |
  +---------------------------+
  |  Matter Interaction Model |
  |  (Read, Write, Subscribe, |
  |   Invoke)                 |
  +---------------------------+
  |     Matter Security       |
  |  (CASE, PASE, certs)      |
  +---------------------------+
  |     Transport (TCP/UDP)   |
  +---------------------------+
  |  WiFi | Thread | Ethernet |
  +---------------------------+
```

Matter commissioning uses BLE for initial device setup, then hands off to the operational network (WiFi or Thread).

---

## 6. TCP/IP Stack on Embedded

### 6.1 lwIP: Lightweight IP

Most embedded WiFi stacks use lwIP (lightweight IP), an open-source TCP/IP implementation designed for systems with limited RAM (tens of KB). lwIP provides:

- Full TCP, UDP, ICMP, IGMP
- DHCP client and server
- DNS resolver
- Socket API (BSD-like) and raw API (callback-based)
- IPv4 and IPv6

The ESP-IDF WiFi stack uses lwIP internally. When you open a socket on an ESP32, you are using lwIP.

### 6.2 Minimal Socket Example (C / ESP-IDF)

```c
#include <sys/socket.h>
#include <netdb.h>
#include "esp_log.h"

static const char *TAG = "TCP_CLIENT";

void tcp_client_task(void *pvParameters) {
    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = inet_addr("192.168.1.100");
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(8080);

    int sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock < 0) {
        ESP_LOGE(TAG, "Socket creation failed");
        vTaskDelete(NULL);
        return;
    }

    int err = connect(sock, (struct sockaddr *)&dest_addr,
                      sizeof(dest_addr));
    if (err != 0) {
        ESP_LOGE(TAG, "Connection failed: errno %d", errno);
        close(sock);
        vTaskDelete(NULL);
        return;
    }

    const char *payload = "Hello from ESP32";
    send(sock, payload, strlen(payload), 0);

    char rx_buffer[128];
    int len = recv(sock, rx_buffer, sizeof(rx_buffer) - 1, 0);
    if (len > 0) {
        rx_buffer[len] = '\0';
        ESP_LOGI(TAG, "Received: %s", rx_buffer);
    }

    close(sock);
    vTaskDelete(NULL);
}
```

---

## 7. Cellular IoT

### 7.1 NB-IoT and LTE-M

For devices deployed far from WiFi or where LoRa gateways are not available, cellular IoT provides wide-area connectivity using existing mobile networks.

| Feature        | NB-IoT                 | LTE-M (Cat-M1)            |
| -------------- | ---------------------- | ------------------------- |
| Bandwidth      | 180 kHz                | 1.4 MHz                   |
| Peak data rate | ~60 kbps DL            | ~1 Mbps DL                |
| Latency        | 1.5-10 s               | 50-100 ms                 |
| Mobility       | Limited                | Full handover support     |
| Voice          | No                     | VoLTE support             |
| Power saving   | PSM, eDRX              | PSM, eDRX                 |
| Use cases      | Static sensors, meters | Asset tracking, wearables |

**PSM (Power Save Mode)**: Device enters deep sleep, unreachable by network, wakes on schedule.
**eDRX (Extended Discontinuous Reception)**: Device listens periodically (seconds to minutes), balances reachability and power.

### 7.2 Modules and Modems

Common cellular IoT modules:

- **Quectel BG96**: NB-IoT + Cat-M1 + GNSS, widely used
- **SIMCom SIM7080G**: NB-IoT + Cat-M1, compact
- **Nordic nRF9160**: Integrated LTE-M/NB-IoT modem + application MCU

These modules typically communicate with the host MCU via AT commands over UART:

```
AT+CGDCONT=1,"IP","iot.provider.com"     // Set APN
AT+COPS=1,2,"310410"                      // Select operator
AT+QMTOPEN=0,"broker.hivemq.com",1883    // Open MQTT connection
AT+QMTPUB=0,0,0,0,"sensor/temp"          // Publish MQTT message
```

---

## 8. Choosing the Right Wireless Technology

### 8.1 Decision Matrix

```
  Wireless Technology Decision Matrix
  ====================================

                Range       Power     Data Rate    Cost    Mesh   IP-Native
  WiFi         Short       High      High         Low     No     Yes
               (50m)       (mA)      (Mbps)

  BLE          Short       Very Low  Low          Low     Yes*   No
               (100m)      (uA avg)  (1 Mbps)

  LoRa/WAN     Very Long   Low       Very Low     Med     No     No
               (15 km)     (uA avg)  (0.3-50 kbps)

  Zigbee       Medium      Low       Low          Med     Yes    No
               (100m)      (uA avg)  (250 kbps)

  Thread       Medium      Low       Low          Med     Yes    Yes
               (100m)      (uA avg)  (250 kbps)

  NB-IoT       Very Long   Low       Low          High    No     Yes
               (cellular)  (uA avg)  (60 kbps)

  LTE-M        Very Long   Medium    Medium       High    No     Yes
               (cellular)  (mA avg)  (1 Mbps)

  * BLE Mesh is an overlay, not native to BLE specification
```

### 8.2 Decision Flowchart

```
  Start
    |
    v
  Need >1 Mbps data rate? --Yes--> WiFi
    |
    No
    v
  Range >1 km needed? --Yes--> Existing cellular? --Yes--> NB-IoT / LTE-M
    |                                |
    No                               No --> LoRa / LoRaWAN
    v
  Battery life >1 year? --Yes--> Mesh needed? --Yes--> Thread / Zigbee
    |                                |
    No                               No --> BLE
    v
  Real-time control? --Yes--> WiFi or Thread
    |
    No
    v
  Default: BLE (simplest, lowest power for short range)
```

### 8.3 Practical Considerations

Beyond the technical matrix, consider:

- **Ecosystem**: WiFi and BLE have the largest developer ecosystems
- **Certification**: Each radio technology requires regulatory certification (FCC, CE, etc.)
- **Coexistence**: 2.4 GHz is crowded (WiFi, BLE, Zigbee, Thread all share it)
- **Gateway requirements**: LoRa and Zigbee require dedicated gateways
- **Recurring costs**: Cellular IoT requires SIM cards and data plans
- **Security**: All protocols support encryption, but implementation quality varies

---

## 9. WiFi and BLE Combined: ESP32 Example (C)

A common pattern is using BLE for provisioning (sending WiFi credentials) and WiFi for data transfer:

```c
// Simplified BLE WiFi provisioning flow (ESP-IDF)
#include "wifi_provisioning/manager.h"
#include "wifi_provisioning/scheme_ble.h"

void app_main(void) {
    // Initialize NVS, WiFi, and event loop (omitted for brevity)

    wifi_prov_mgr_config_t config = {
        .scheme = wifi_prov_scheme_ble,
        .scheme_event_handler =
            WIFI_PROV_SCHEME_BLE_EVENT_HANDLER_FREE_BTDM,
    };

    wifi_prov_mgr_init(config);

    bool provisioned = false;
    wifi_prov_mgr_is_provisioned(&provisioned);

    if (!provisioned) {
        // Start BLE provisioning
        // User sends WiFi SSID/password via BLE
        wifi_prov_mgr_start_provisioning(
            WIFI_PROV_SECURITY_1,
            "proof_of_possession",
            "ESP32_PROV",
            NULL
        );
    } else {
        // Already provisioned, connect to WiFi directly
        wifi_prov_mgr_deinit();
        // Connect using stored credentials
    }
}
```

---

## 10. Security Considerations for Wireless

Wireless communication is inherently vulnerable to eavesdropping and injection. Key security practices:

1. **Always use encryption**: WPA2/WPA3 for WiFi, AES-CCM for BLE, AES-128 for LoRaWAN
2. **Mutual authentication**: Both device and server verify each other (TLS with client certificates)
3. **Secure key storage**: Use hardware secure elements or flash encryption
4. **OTA update verification**: Sign firmware images, verify before flashing
5. **Minimize attack surface**: Disable unused radios, close unused ports
6. **Rotate keys**: Session keys should expire, support re-keying

---

## Interview Questions

**Q1: What is the fundamental trade-off between WiFi and BLE for IoT applications?**
WiFi offers high throughput and direct IP connectivity but consumes significantly more power (100-300 mA TX). BLE provides very low average power consumption (micro-amps with duty cycling) but lower data rates. Choose WiFi for mains-powered, high-bandwidth devices; BLE for battery-powered, low-bandwidth sensors.

**Q2: Explain the difference between a GATT server and a GATT client in BLE.**
The GATT server holds the data (characteristics organized into services) and responds to read/write requests. The GATT client discovers services and reads/writes characteristic values. Typically, the peripheral (sensor) is the GATT server and the central (phone) is the GATT client.

**Q3: What is the CCCD in BLE and why is it important?**
The Client Characteristic Configuration Descriptor (UUID 0x2902) is a descriptor that the client writes to enable notifications (0x0001) or indications (0x0002) from a characteristic. Without writing the CCCD, the server will not push updates even if the characteristic supports Notify.

**Q4: How does LoRa achieve long range at low power?**
LoRa uses Chirp Spread Spectrum (CSS) modulation, which spreads the signal across a wide bandwidth. This allows the receiver to decode signals up to 20 dB below the noise floor. Higher spreading factors (SF12) trade data rate for range, achieving 15+ km in rural environments.

**Q5: What are the three LoRaWAN device classes and when would you use each?**
Class A: Lowest power, receives only in two short windows after each uplink. Best for battery sensors. Class B: Adds scheduled receive windows using beacons for predictable downlink latency. Class C: Always listening, lowest latency but highest power. Suitable for mains-powered actuators.

**Q6: Compare Zigbee and Thread. Why might you choose Thread for a new design?**
Both use IEEE 802.15.4 at the physical layer. Thread uses IPv6 natively (6LoWPAN), has no single point of failure (no coordinator), and is the transport layer for Matter. Zigbee has a larger installed base but requires protocol translation for IP integration. For new designs targeting the Matter ecosystem, Thread is preferred.

**Q7: What is Matter and what problem does it solve?**
Matter is an application-layer protocol for smart home devices, backed by Apple, Google, Amazon, and Samsung. It solves the fragmentation problem where devices from different ecosystems cannot interoperate. Matter provides a unified device model running over WiFi, Thread, or Ethernet.

**Q8: What is lwIP and why is it used in embedded systems?**
lwIP (lightweight IP) is an open-source TCP/IP stack designed for systems with limited RAM (tens of KB). It provides full TCP/UDP/IP support with a small footprint. Most embedded WiFi platforms (ESP32, STM32 with WiFi) use lwIP internally.

**Q9: Explain PSM and eDRX in cellular IoT.**
PSM (Power Save Mode) lets the device enter deep sleep where it is unreachable by the network, waking only on a timer or external trigger. eDRX (Extended Discontinuous Reception) extends the interval between listening windows from milliseconds to seconds or minutes. Both dramatically reduce power consumption for infrequent-reporting sensors.

**Q10: An ESP32 needs to be configured with WiFi credentials in the field. Describe a common approach.**
Use BLE provisioning: the ESP32 starts in BLE mode, a companion app connects via BLE, the user selects a WiFi network and enters the password, the app sends credentials over BLE, the ESP32 stores them in NVS and connects to WiFi. ESP-IDF provides a complete BLE provisioning library for this flow.

**Q11: What are the security implications of BLE "Just Works" pairing?**
Just Works pairing provides encryption but no MITM protection. An attacker within range during the pairing process can intercept the key exchange. For devices handling sensitive data, use Passkey Entry, Numeric Comparison, or OOB pairing methods.

**Q12: You need to monitor 500 sensors across a 10 km farm. Each sensor reports soil moisture every 15 minutes. Which wireless technology would you choose and why?**
LoRaWAN is ideal: long range (10+ km with line of sight), very low power (Class A devices sleep between transmissions), low data rate is sufficient (a few bytes per reading), and the star-of-stars topology with a few gateways can cover the entire farm. Cost per node is low since LoRa modules are inexpensive.

**Q13: What is the maximum advertising payload size in BLE 4.2 vs BLE 5.0?**
BLE 4.2 allows 31 bytes in the advertising payload (plus 31 bytes in the scan response). BLE 5.0 introduced extended advertising with payloads up to 255 bytes, enabling richer data broadcast without requiring a connection.

**Q14: How does a Thread Border Router work?**
A Thread Border Router bridges the Thread mesh network (IEEE 802.15.4, IPv6) to a WiFi or Ethernet network. It performs address translation, routing, and service discovery (mDNS/DNS-SD) so that devices on the Thread mesh are reachable from the IP network and vice versa.

**Q15: What factors affect WiFi range and reliability on an embedded device?**
Antenna design and placement, PCB ground plane, enclosure material (metal attenuates), TX power settings, channel congestion in the 2.4 GHz band, obstacle density, and the access point's capabilities. On the software side, proper power management (modem sleep, light sleep) and reconnection logic affect reliability.
