# Chapter 6: IoT Protocols & Cloud Integration -- From Device to Dashboard

An embedded device that reads a sensor is useful. An embedded device that reads a sensor, publishes the data to a cloud platform, triggers alerts, and displays trends on a dashboard is a product. This chapter covers the protocols and infrastructure that connect constrained devices to the cloud: MQTT, CoAP, HTTP, data serialization formats, cloud platforms, OTA firmware updates, and time-series data storage. By the end, you will understand the full data path from silicon to screen.

---

## 1. MQTT Deep Dive

### 1.1 Overview

MQTT (Message Queuing Telemetry Transport) is the dominant IoT messaging protocol. Designed by IBM in 1999 for satellite links, it is lightweight, publish-subscribe, and built for unreliable networks. MQTT runs over TCP (typically port 1883, or 8883 for TLS).

### 1.2 Architecture: Broker and Clients

```
  MQTT Architecture
  =================

  +----------+   publish    +----------+   forward    +----------+
  | Device A | -----------> |          | -----------> | Backend  |
  | (pub)    |  topic:      |  MQTT    |  topic:      | (sub)    |
  +----------+  sensor/temp |  BROKER  |  sensor/temp +----------+
                             |          |
  +----------+   subscribe  | (Mosquitto,              +----------+
  | Device B | <----------- |  EMQX,    | -----------> | Dashboard|
  | (sub)    |  topic:      |  HiveMQ)  |  topic:      | (sub)    |
  +----------+  cmd/relay   |          |  sensor/#    +----------+
                             +----------+
```

Key concepts:

- **Broker**: Central server that receives all published messages and forwards them to subscribers. Devices never communicate directly.
- **Publisher**: Sends messages to a topic.
- **Subscriber**: Receives messages from topics it has subscribed to.
- **Topics**: Hierarchical strings (e.g., `home/livingroom/temperature`). Wildcards: `+` (single level), `#` (multi-level).

### 1.3 QoS Levels

MQTT defines three Quality of Service levels for message delivery:

**QoS 0: At Most Once (Fire and Forget)**

```
  QoS 0 Flow
  ===========

  Publisher ---PUBLISH---> Broker ---PUBLISH---> Subscriber
                (no acknowledgment)

  - Fastest, lowest overhead
  - Message may be lost
  - Use for: frequent sensor data where losing one reading is OK
```

**QoS 1: At Least Once**

```
  QoS 1 Flow
  ===========

  Publisher ---PUBLISH---> Broker
  Publisher <--PUBACK----- Broker ---PUBLISH---> Subscriber
                                   Subscriber ---PUBACK---> Broker

  - Message delivered at least once
  - May be delivered multiple times (duplicates possible)
  - Use for: important data where duplicates can be handled
```

**QoS 2: Exactly Once**

```
  QoS 2 Flow
  ===========

  Publisher ---PUBLISH---> Broker
  Publisher <--PUBREC----- Broker
  Publisher ---PUBREL----> Broker
  Publisher <--PUBCOMP---- Broker ---PUBLISH---> Subscriber
                                   (same 4-step with subscriber)

  - Guaranteed exactly once delivery
  - 4-step handshake = highest overhead
  - Use for: billing, critical commands where duplicates are harmful
```

### 1.4 Retained Messages

A retained message is stored by the broker and delivered immediately to any new subscriber. Only the last retained message per topic is kept.

```
// Publisher sets retain flag
mosquitto_pub -t "device/status" -m "online" -r

// Any future subscriber to "device/status" immediately
// receives "online" without waiting for the next publish
```

Use cases: device status (online/offline), last known sensor value, configuration.

### 1.5 Last Will and Testament (LWT)

When a client connects, it can register a "last will" message. If the client disconnects unexpectedly (no DISCONNECT packet, TCP timeout), the broker publishes the LWT:

```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.will_set(
    topic="device/esp32-001/status",
    payload="offline",
    qos=1,
    retain=True
)
client.connect("broker.example.com", 1883)
```

Combined with a retained "online" message published on connect, this gives subscribers real-time device availability.

### 1.6 MQTT 5.0 Features

MQTT 5.0 (released 2019) adds significant capabilities:

- **User properties**: Key-value metadata on any packet
- **Shared subscriptions**: Load balancing across multiple subscribers (`$share/group/topic`)
- **Message expiry**: TTL on published messages
- **Topic aliases**: Reduce overhead for frequently used topics
- **Request/response pattern**: Correlation data + response topic
- **Reason codes**: Detailed error information on all acknowledgments
- **Flow control**: Receive maximum limits to prevent overload

### 1.7 Mosquitto

Eclipse Mosquitto is the most popular open-source MQTT broker. It is lightweight (runs on a Raspberry Pi), supports MQTT 3.1.1 and 5.0, TLS, WebSocket, and bridging between brokers.

```bash
# Install and start Mosquitto
sudo apt install mosquitto mosquitto-clients

# Subscribe in one terminal
mosquitto_sub -h localhost -t "sensor/#" -v

# Publish in another terminal
mosquitto_pub -h localhost -t "sensor/temp" -m "23.5"
```

---

## 2. MQTT on Embedded Devices

### 2.1 MicroPython MQTT Client

```python
from umqtt.simple import MQTTClient
import network
import json
import time

# Connect WiFi first (omitted for brevity)

def on_message(topic, msg):
    topic_str = topic.decode('utf-8')
    payload = json.loads(msg.decode('utf-8'))
    print('Received:', topic_str, payload)

    if topic_str == 'device/esp32/cmd':
        if payload.get('action') == 'reboot':
            import machine
            machine.reset()

client = MQTTClient(
    client_id='esp32-001',
    server='broker.example.com',
    port=1883,
    keepalive=60,
)

# Set Last Will
client.set_last_will(
    topic='device/esp32-001/status',
    msg=b'offline',
    retain=True,
    qos=1,
)

client.set_callback(on_message)
client.connect()

# Publish online status
client.publish(
    'device/esp32-001/status',
    b'online',
    retain=True,
    qos=1,
)

# Subscribe to commands
client.subscribe('device/esp32/cmd', qos=1)

# Main loop
while True:
    client.check_msg()  # Non-blocking check for incoming messages

    reading = json.dumps({
        "temperature": 23.5,
        "humidity": 61.2,
        "timestamp": time.time(),
    })
    client.publish('sensor/esp32-001/env', reading.encode(), qos=0)

    time.sleep(10)
```

### 2.2 C MQTT Client (ESP-IDF)

```c
#include "mqtt_client.h"
#include "esp_log.h"
#include "cJSON.h"

static const char *TAG = "MQTT";

static void mqtt_event_handler(void *args,
                                esp_event_base_t base,
                                int32_t event_id,
                                void *event_data) {
    esp_mqtt_event_handle_t event = event_data;
    esp_mqtt_client_handle_t client = event->client;

    switch (event->event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "Connected to broker");
        esp_mqtt_client_subscribe(client, "device/esp32/cmd", 1);
        esp_mqtt_client_publish(client,
            "device/esp32-001/status", "online", 0, 1, 1);
        break;

    case MQTT_EVENT_DATA:
        ESP_LOGI(TAG, "Topic=%.*s", event->topic_len, event->topic);
        ESP_LOGI(TAG, "Data=%.*s", event->data_len, event->data);

        cJSON *json = cJSON_ParseWithLength(
            event->data, event->data_len);
        if (json != NULL) {
            cJSON *action = cJSON_GetObjectItem(json, "action");
            if (cJSON_IsString(action)) {
                ESP_LOGI(TAG, "Action: %s", action->valuestring);
            }
            cJSON_Delete(json);
        }
        break;

    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "Disconnected from broker");
        break;

    default:
        break;
    }
}

void mqtt_app_start(void) {
    esp_mqtt_client_config_t config = {
        .broker.address.uri = "mqtt://broker.example.com:1883",
        .credentials.client_id = "esp32-001",
        .session.last_will = {
            .topic = "device/esp32-001/status",
            .msg = "offline",
            .msg_len = 7,
            .qos = 1,
            .retain = 1,
        },
        .session.keepalive = 60,
    };

    esp_mqtt_client_handle_t client = esp_mqtt_client_init(&config);
    esp_mqtt_client_register_event(client, ESP_EVENT_ANY_ID,
                                    mqtt_event_handler, NULL);
    esp_mqtt_client_start(client);
}
```

---

## 3. CoAP: Constrained Application Protocol

### 3.1 Overview

CoAP is a lightweight RESTful protocol designed for constrained devices. Unlike MQTT (which uses TCP), CoAP runs over UDP, reducing overhead and memory requirements.

| Feature     | MQTT        | CoAP                    |
| ----------- | ----------- | ----------------------- |
| Transport   | TCP         | UDP                     |
| Pattern     | Pub/Sub     | Request/Response (REST) |
| Header size | 2 bytes min | 4 bytes fixed           |
| Reliability | TCP + QoS   | Confirmable messages    |
| Encryption  | TLS         | DTLS                    |
| Discovery   | No          | Yes (/.well-known/core) |
| Observe     | Subscribe   | Observe option          |

### 3.2 CoAP Message Types

- **Confirmable (CON)**: Requires acknowledgment (reliable)
- **Non-confirmable (NON)**: No acknowledgment (best-effort)
- **Acknowledgment (ACK)**: Response to CON
- **Reset (RST)**: Indicates an error

### 3.3 Observe

The CoAP Observe option allows a client to register for notifications, similar to MQTT subscribe. The server sends updates when the resource changes:

```
  CoAP Observe Flow
  =================

  Client ---GET /temperature (Observe=0)---> Server
  Client <--2.05 Content (Observe=1)-------- Server  (initial value)
  Client <--2.05 Content (Observe=2)-------- Server  (value changed)
  Client <--2.05 Content (Observe=3)-------- Server  (value changed)
  ...

  Client ---GET /temperature (Observe=1)---> Server  (cancel)
```

### 3.4 Block Transfer

CoAP payloads are limited by UDP datagram size. Block transfer options (Block1, Block2) enable transfer of large payloads in chunks, useful for firmware updates over CoAP.

---

## 4. HTTP/REST on Constrained Devices

### 4.1 When to Use HTTP

HTTP is universally understood and requires no broker infrastructure. For devices that report data infrequently (every few minutes or hours) and have sufficient memory, HTTP POST to a REST API is the simplest approach.

### 4.2 Trade-offs vs MQTT

| Factor              | HTTP                                               | MQTT                               |
| ------------------- | -------------------------------------------------- | ---------------------------------- |
| Connection overhead | New TCP connection per request (unless keep-alive) | Persistent connection              |
| Server push         | Polling or SSE/WebSocket                           | Native (subscribe)                 |
| Bandwidth           | Large headers (~700 bytes)                         | Tiny headers (2-5 bytes)           |
| Infrastructure      | Any web server                                     | Requires MQTT broker               |
| Bidirectional       | Client-initiated only                              | Both directions                    |
| Ideal for           | Cloud APIs, infrequent reporting                   | Real-time, frequent data, commands |

For most IoT applications with bidirectional communication, MQTT is preferred. HTTP is acceptable for simple, infrequent uploads.

---

## 5. Data Serialization

### 5.1 Choosing a Format

On constrained devices, every byte matters. The serialization format affects bandwidth, parsing complexity, and memory usage.

```
  Format Comparison (encoding {"temp":23.5,"humid":61})
  =====================================================

  JSON:        {"temp":23.5,"humid":61}        (24 bytes)
  CBOR:        A2 64 74656D70 FB ... 65 ...    (~16 bytes)
  MessagePack: 82 A4 74656D70 CB ... A5 ...    (~17 bytes)
  Protobuf:    09 00 00 BC 41 10 3D            (7 bytes, with schema)

  JSON:        Human-readable, universal, verbose
  CBOR:        Binary JSON, self-describing, IETF standard
  MessagePack: Binary JSON, very fast, compact
  Protobuf:    Schema-required, smallest, fastest, not self-describing
```

### 5.2 JSON

The default choice for interoperability. Every language and cloud platform supports JSON. Use it unless bandwidth or parsing overhead is a genuine constraint.

MicroPython:

```python
import json

payload = json.dumps({"temp": 23.5, "humid": 61})
# '{"temp": 23.5, "humid": 61}'
```

C (using cJSON on ESP32):

```c
cJSON *root = cJSON_CreateObject();
cJSON_AddNumberToObject(root, "temp", 23.5);
cJSON_AddNumberToObject(root, "humid", 61);
char *json_str = cJSON_PrintUnformatted(root);
// json_str = '{"temp":23.5,"humid":61}'
// Publish json_str via MQTT
cJSON_Delete(root);
free(json_str);
```

### 5.3 CBOR

CBOR (Concise Binary Object Representation, RFC 8949) is binary JSON. It is self-describing (no schema needed), compact, and fast to parse. CoAP uses CBOR as its preferred payload format.

### 5.4 Protocol Buffers (Protobuf)

Protobuf requires a schema (`.proto` file) shared between sender and receiver. It produces the smallest payloads and fastest parsing but requires code generation and is not self-describing. Ideal for high-volume, bandwidth-constrained applications where both endpoints are under your control.

```protobuf
// sensor.proto
syntax = "proto3";

message SensorReading {
    float temperature = 1;
    int32 humidity = 2;
    uint64 timestamp = 3;
}
```

### 5.5 MessagePack

MessagePack is similar to CBOR: binary, self-describing, compact. It has strong library support across languages and is popular in the Node.js and Ruby ecosystems. For embedded, CBOR is more common due to its IETF standardization and CoAP alignment.

---

## 6. AWS IoT Core

### 6.1 Overview

AWS IoT Core is a managed cloud service that lets IoT devices connect securely and interact with AWS services. It supports MQTT, HTTPS, and MQTT over WebSocket.

```
  AWS IoT Core Architecture
  =========================

  +----------+                  +-------------------+
  | ESP32    |---MQTT (TLS)---> | AWS IoT Core      |
  | Device   |                  |                   |
  +----------+                  | +---------------+ |
                                | | Message Broker| |    +-----------+
                                | +-------+-------+ |    | DynamoDB  |
                                |         |         |--->| S3        |
                                | +-------v-------+ |    | Lambda    |
                                | | Rules Engine  | |    | Kinesis   |
                                | +---------------+ |    +-----------+
                                |                   |
                                | +---------------+ |
                                | | Device Shadow | |
                                | +---------------+ |
                                +-------------------+
```

### 6.2 Device Shadow

A device shadow is a JSON document that stores the desired and reported state of a device. It acts as a virtual representation, available even when the device is offline.

```json
{
    "state": {
        "desired": {
            "led": "on",
            "threshold": 25.0
        },
        "reported": {
            "led": "off",
            "threshold": 22.0,
            "temperature": 23.5
        },
        "delta": {
            "led": "on",
            "threshold": 25.0
        }
    },
    "metadata": { ... },
    "version": 42
}
```

The **delta** is automatically computed: it contains fields where desired differs from reported. The device subscribes to delta updates and reconciles state.

### 6.3 Rules Engine

The rules engine uses SQL-like syntax to filter, transform, and route MQTT messages to other AWS services:

```sql
SELECT temperature, humidity, timestamp()
FROM 'sensor/+/env'
WHERE temperature > 30.0
```

This rule triggers when any sensor reports temperature above 30, forwarding the data to a Lambda function, DynamoDB table, or SNS topic for alerting.

### 6.4 X.509 Certificates

AWS IoT Core uses mutual TLS authentication with X.509 certificates. Each device has:

- A unique certificate (public key)
- A private key (stored securely on device)
- A CA certificate (to verify the broker)

Certificates are associated with an IoT policy that controls which topics the device can publish/subscribe to.

---

## 7. Azure IoT Hub

Azure IoT Hub provides similar capabilities:

- **Device twins**: Equivalent to AWS device shadows
- **Direct methods**: RPC-style calls from cloud to device
- **Message routing**: Filter and route device telemetry to storage, service bus, etc.
- **Device Provisioning Service (DPS)**: Zero-touch provisioning at scale
- **IoT Edge**: Run cloud workloads on gateway devices

The choice between AWS and Azure often depends on existing cloud infrastructure rather than technical merit for IoT specifically.

---

## 8. Device Provisioning

### 8.1 The Provisioning Challenge

Each device needs unique credentials (certificates, keys, tokens) and configuration (endpoint URLs, topics). Manually configuring thousands of devices is not scalable.

### 8.2 Approaches

| Method              | Description                                            | Scale  |
| ------------------- | ------------------------------------------------------ | ------ |
| Manual              | Flash credentials per device in factory                | Small  |
| Just-in-Time (JITR) | Device presents a CA-signed cert, cloud auto-registers | Medium |
| Fleet provisioning  | Claim certificate + template creates unique identity   | Large  |
| Token-based         | Short-lived tokens from a provisioning service         | Large  |

### 8.3 Secure Element Integration

For production devices, store private keys in a hardware secure element (ATECC608A, SE050) rather than in flash. The private key never leaves the secure element, preventing extraction even with physical access to the device.

---

## 9. OTA Firmware Updates

### 9.1 Why OTA Matters

Devices deployed in the field will have bugs, security vulnerabilities, and feature requests. Without OTA (Over-the-Air) updates, fixing these requires physical access -- often impossible or prohibitively expensive.

### 9.2 A/B Partitioning

```
  A/B Partition Layout
  ====================

  Flash Memory Map:
  +-------------------+
  | Bootloader        |  (verifies signature, selects partition)
  +-------------------+
  | Partition Table   |  (describes layout)
  +-------------------+
  | App Partition A   |  <-- Currently running (v1.2.0)
  | (OTA_0)           |
  +-------------------+
  | App Partition B   |  <-- OTA target (v1.3.0 being written)
  | (OTA_1)           |
  +-------------------+
  | NVS (config)      |
  +-------------------+
  | Data partitions   |
  +-------------------+
```

The update process:

1. Device downloads new firmware to the inactive partition (B)
2. Device verifies the signature and checksum
3. Bootloader is updated to boot from partition B
4. Device reboots into new firmware
5. New firmware validates itself (self-test)
6. If self-test passes, mark partition B as "confirmed"
7. If self-test fails, bootloader rolls back to partition A

### 9.3 Rollback

Rollback is critical for reliability. If the new firmware crashes during boot, the watchdog timer triggers a reset. The bootloader detects that partition B was never confirmed and reverts to partition A. The device remains functional with the previous firmware.

### 9.4 Delta Updates

Full firmware images can be large (1-4 MB). Delta updates transmit only the differences between the current and new firmware, reducing download size by 80-95%. Tools like `bsdiff`/`bspatch` or Espressif's compressed OTA support this.

### 9.5 Secure Boot Chain

```
  Secure Boot Chain
  =================

  +------------------+
  | ROM Bootloader   |  (burned into silicon, immutable)
  | Verifies: -------|---+
  +------------------+   |
                          v
  +------------------+   Signature OK?
  | 2nd Stage Boot   |   Yes -> continue
  | Verifies: -------|---+
  +------------------+   |
                          v
  +------------------+   Signature OK?
  | Application FW   |   Yes -> run
  +------------------+   No  -> refuse to boot
```

Each stage verifies the cryptographic signature of the next stage using a public key fused into hardware (eFuse). An attacker cannot flash malicious firmware because it would lack a valid signature.

### 9.6 OTA Architecture

```
  OTA Update Architecture
  =======================

  +----------+     1. Check for update     +------------------+
  | Device   | --------------------------> | OTA Server /     |
  |          | <-------------------------- | Cloud Platform   |
  |          |     2. New version avail    |                  |
  |          |                              +--------+---------+
  |          |     3. Download firmware              |
  |          | <-------------------------------------+
  |          |        (HTTPS / MQTT / CoAP)          |
  |          |                                       |
  |          |     4. Report success/failure         |
  |          | ------------------------------------->|
  +----------+                              +------------------+
       |                                    | Firmware Storage |
       |  5. Reboot into new FW             | (S3, Blob, etc.) |
       v                                    +------------------+
  [New firmware running]
```

---

## 10. Time-Series Databases

### 10.1 Why Time-Series?

IoT devices generate timestamped data at regular intervals. Traditional relational databases handle this poorly at scale. Time-series databases are optimized for:

- High write throughput (millions of points per second)
- Time-range queries (last hour, last week)
- Downsampling and aggregation (average per hour)
- Automatic data retention policies (delete data older than 90 days)

### 10.2 InfluxDB

InfluxDB is the most popular open-source time-series database. Data is organized as:

```
  InfluxDB Data Model
  ===================

  measurement: "environment"
  tags:        device_id=esp32-001, location=office
  fields:      temperature=23.5, humidity=61.2
  timestamp:   2026-03-06T10:30:00Z

  Line Protocol:
  environment,device_id=esp32-001,location=office temperature=23.5,humidity=61.2 1709721000000000000
```

Tags are indexed (for filtering), fields are not (for values). InfluxDB uses Flux or InfluxQL query languages:

```flux
from(bucket: "iot_data")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "environment")
    |> filter(fn: (r) => r.device_id == "esp32-001")
    |> mean()
```

### 10.3 TimescaleDB

TimescaleDB is a PostgreSQL extension that adds time-series capabilities. It uses "hypertables" -- partitioned tables optimized for time-range queries. The advantage over InfluxDB is full SQL compatibility, making it easier to join IoT data with relational data (device metadata, user accounts).

```sql
-- Create a hypertable
CREATE TABLE sensor_data (
    time        TIMESTAMPTZ NOT NULL,
    device_id   TEXT NOT NULL,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
);

SELECT create_hypertable('sensor_data', 'time');

-- Query: average temperature per hour for the last day
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    AVG(temperature) AS avg_temp
FROM sensor_data
WHERE time > NOW() - INTERVAL '1 day'
GROUP BY bucket, device_id
ORDER BY bucket DESC;
```

---

## 11. Dashboard Tools

### 11.1 Grafana

Grafana is the standard open-source dashboard tool for time-series data. It supports InfluxDB, TimescaleDB, Prometheus, and dozens of other data sources.

Key features for IoT:

- Real-time updating dashboards
- Alerting rules (email, Slack, PagerDuty)
- Template variables for device selection
- Annotation of events (firmware updates, incidents)
- Mobile-friendly responsive layouts

A typical IoT Grafana dashboard shows:

```
  +-----------------------------------------------+
  |  IoT Device Dashboard            [Last 24h v] |
  +-----------------------------------------------+
  |                                                |
  |  Temperature (line chart)                      |
  |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  |
  |                                                |
  +------------------------+-----------------------+
  |  Humidity (gauge)      |  Battery (gauge)      |
  |     61.2%              |     87%               |
  +------------------------+-----------------------+
  |                                                |
  |  Device Status Table                           |
  |  esp32-001  online   23.5C   61.2%  3.7V      |
  |  esp32-002  offline  --      --     --         |
  |  esp32-003  online   22.1C   58.9%  3.9V      |
  |                                                |
  +-----------------------------------------------+
```

---

## 12. End-to-End IoT Architecture

Putting it all together:

```
  Complete IoT Data Pipeline
  ==========================

  [Sensors] --> [MCU] --> [WiFi/LoRa/Cell]
                             |
                             v
                 +----------------------+
                 | MQTT Broker /        |
                 | Cloud IoT Gateway    |
                 | (AWS IoT / Azure)    |
                 +----------+-----------+
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        +---------+   +---------+   +---------+
        | Rules / |   | Device  |   | OTA     |
        | Lambda  |   | Shadow  |   | Manager |
        +---------+   +---------+   +---------+
              |
              v
        +-----------+
        | Time-     |
        | Series DB |
        | (Influx)  |
        +-----+-----+
              |
              v
        +-----------+
        | Grafana   |
        | Dashboard |
        +-----------+
              |
              v
        +-----------+
        | Alerts    |
        | (Email,   |
        |  Slack)   |
        +-----------+
```

Design principles:

1. **Decouple ingestion from processing**: Use a message broker to buffer data
2. **Store raw data**: Transform and aggregate later, never lose originals
3. **Idempotent processing**: Handle duplicate messages gracefully (QoS 1)
4. **Monitor the monitors**: Alert on device offline, high error rates, low battery
5. **Automate updates**: OTA pipeline with staged rollouts (10% -> 50% -> 100%)

---

## 13. Security Best Practices

### 13.1 Transport Security

- Use TLS 1.2+ for MQTT and HTTP
- Use DTLS for CoAP
- Pin certificates or use a hardware root of trust

### 13.2 Authentication

- Mutual TLS with per-device X.509 certificates (preferred)
- Token-based (SAS tokens, JWT) for constrained devices
- Never use shared secrets across devices

### 13.3 Authorization

- Principle of least privilege: each device can only publish/subscribe to its own topics
- AWS IoT policies, Azure IoT Hub shared access policies

### 13.4 Data Integrity

- Sign firmware images
- Verify checksums on OTA downloads
- Use CBOR with COSE for signed payloads

---

## Interview Questions

**Q1: Explain the three MQTT QoS levels and when you would use each.**
QoS 0 (at most once): Fire and forget, no acknowledgment. Use for frequent, non-critical sensor data. QoS 1 (at least once): Acknowledged delivery, possible duplicates. Use for important data where the consumer handles duplicates. QoS 2 (exactly once): Four-step handshake guarantees single delivery. Use for billing or critical commands where duplicates are harmful. The higher the QoS, the more overhead.

**Q2: What is a retained message in MQTT?**
A retained message is stored by the broker and delivered immediately to any new subscriber on that topic. Only the last retained message per topic is kept. Common use: device status ("online"/"offline") so new subscribers immediately know the current state without waiting for the next publish.

**Q3: How does the MQTT Last Will and Testament work?**
When a client connects, it registers a will message (topic, payload, QoS, retain). If the client disconnects unexpectedly (no DISCONNECT packet, TCP timeout, keepalive missed), the broker publishes the will message. This is typically used to publish "offline" status when a device loses connection.

**Q4: Compare MQTT and CoAP. When would you choose CoAP?**
MQTT uses TCP, pub/sub, and requires a broker. CoAP uses UDP, request/response (REST), and is peer-to-peer. Choose CoAP for very constrained devices where TCP overhead is too high, when you need RESTful semantics (GET/PUT/POST/DELETE), or when working with 6LoWPAN/Thread networks where UDP is natural. MQTT is better for bidirectional, event-driven communication.

**Q5: What are the advantages of Protobuf over JSON for IoT data?**
Protobuf produces much smaller payloads (often 3-5x smaller), parses faster, and is strongly typed. The disadvantages are that it requires a schema (.proto file) shared between sender and receiver, is not human-readable, and requires code generation. Use Protobuf when bandwidth is constrained and both endpoints are under your control.

**Q6: Describe the A/B partitioning scheme for OTA updates.**
The flash is divided into two app partitions (A and B). The running firmware is on one partition; the OTA update is written to the other. After download and signature verification, the bootloader is configured to boot from the new partition. If the new firmware fails self-test, the bootloader rolls back to the previous partition automatically.

**Q7: Why is secure boot important for IoT devices?**
Without secure boot, an attacker with physical access can flash malicious firmware. Secure boot creates a chain of trust: each boot stage verifies the cryptographic signature of the next stage using keys fused into hardware. Only firmware signed with the manufacturer's private key will execute.

**Q8: What is an AWS IoT Device Shadow and what problem does it solve?**
A device shadow is a JSON document in the cloud that represents a device's desired and reported state. It solves the problem of communicating with devices that are intermittently connected. The cloud can update the desired state at any time; when the device reconnects, it receives the delta and reconciles. The shadow also provides last-known state to applications when the device is offline.

**Q9: How would you design an OTA update system that minimizes the risk of bricking devices?**
Use A/B partitioning with automatic rollback. Verify firmware signature before flashing. Implement a self-test routine that must confirm the new firmware within a timeout. If confirmation fails, the watchdog triggers a reset and the bootloader reverts. Use delta updates to reduce download time and failure window. Stage rollouts (10% of fleet first). Maintain a "golden" recovery partition that cannot be overwritten.

**Q10: What is the difference between InfluxDB and TimescaleDB for IoT data?**
InfluxDB is a purpose-built time-series database with its own query language (Flux) and data model (measurements, tags, fields). TimescaleDB is a PostgreSQL extension that adds time-series optimizations (hypertables, continuous aggregates) while retaining full SQL. Choose TimescaleDB when you need to join IoT data with relational data or prefer SQL. Choose InfluxDB for simplicity and the Telegraf/InfluxDB/Grafana (TIG) stack.

**Q11: An IoT device sends temperature readings every 5 seconds over MQTT. What QoS level would you recommend?**
QoS 0. At 5-second intervals, losing an occasional reading is acceptable and will be replaced by the next one. QoS 0 minimizes bandwidth and processing overhead. If the data is aggregated (e.g., hourly averages), individual losses have negligible impact.

**Q12: How does MQTT 5.0's shared subscription feature work?**
Shared subscriptions allow multiple subscribers to load-balance messages on a topic. The topic filter uses the prefix `$share/group-name/actual-topic`. The broker distributes each message to only one subscriber in the group (round-robin or similar). This enables horizontal scaling of message consumers.

**Q13: What is the role of certificates in AWS IoT Core authentication?**
AWS IoT Core uses mutual TLS. Each device has a unique X.509 certificate and private key. The device presents its certificate during TLS handshake; AWS verifies it against a registered CA. The certificate is attached to an IoT policy that defines allowed MQTT operations (publish, subscribe, connect). This provides per-device authentication and fine-grained authorization.

**Q14: Describe the trade-offs of using HTTP vs MQTT for a battery-powered sensor that reports data every hour.**
HTTP requires a new TCP connection (and TLS handshake) for each report, which consumes more power and bandwidth. MQTT maintains a persistent connection, but keeping it alive for an hour wastes power on keepalive packets. For hourly reporting, HTTP may actually be simpler since there is no need for a persistent connection. Alternatively, use MQTT with a long keepalive (e.g., 3600 seconds) or NB-IoT PSM to sleep between reports.

**Q15: How would you handle data serialization for a fleet of 10,000 sensors each sending 100-byte readings every 10 seconds?**
At 10,000 devices x 100 bytes x 6/min = 6 MB/min = 360 MB/hour. JSON is fine at this scale if bandwidth is available. If bandwidth is constrained, CBOR or MessagePack reduce payloads by 30-40% with no schema. For maximum compression, Protobuf with a shared schema reduces payloads by 60-80% but requires schema management across the fleet. Use Protobuf for high-volume, bandwidth-constrained deployments and JSON for simplicity and debuggability.
