# Chapter 7: Edge Computing & TinyML -- Intelligence at the Edge

Modern IoT devices are no longer dumb sensors that ship raw data to the cloud. Edge computing pushes intelligence closer to the data source, and TinyML takes this a step further by running machine learning models directly on microcontrollers with as little as 256 KB of Flash and 64 KB of RAM. This chapter explores why, how, and what it takes to deploy inference at the very edge of the network.

---

## 1. Why Edge Computing?

### 1.1 The Case Against Cloud-Only Architectures

Sending every sensor reading to the cloud works for prototypes, but production IoT systems hit several walls:

| Concern      | Cloud-Only                 | Edge                   |
| ------------ | -------------------------- | ---------------------- |
| Latency      | 50-500 ms round-trip       | < 1 ms local inference |
| Bandwidth    | Continuous upload cost     | Only anomalies sent    |
| Privacy      | Raw data leaves device     | Data stays on-device   |
| Availability | Fails without connectivity | Works offline          |
| Cost         | Per-message cloud bills    | One-time silicon cost  |

### 1.2 Edge vs. Fog vs. Cloud

```
+------------------------------------------------------------------+
|                        ARCHITECTURE TIERS                         |
+------------------------------------------------------------------+
|                                                                    |
|  CLOUD         +---------------------+                             |
|  (Data Center) | GPU Clusters        |  Full models, training,    |
|                | Unlimited Storage   |  dashboards, analytics     |
|                +---------------------+                             |
|                         ^                                          |
|                         | Aggregated / filtered data               |
|                         |                                          |
|  FOG           +---------------------+                             |
|  (Gateway)     | Raspberry Pi / Jetson|  Medium models, local      |
|                | 1-8 GB RAM          |  aggregation, caching      |
|                +---------------------+                             |
|                         ^                                          |
|                         | Pre-processed features                   |
|                         |                                          |
|  EDGE          +---------------------+                             |
|  (MCU/Sensor)  | ESP32 / STM32      |  TinyML inference,         |
|                | 256KB Flash/64KB RAM|  wake-word, anomaly det.   |
|                +---------------------+                             |
|                         ^                                          |
|                         | Raw sensor signals                       |
|                     [Microphone / Accelerometer / Camera]           |
+------------------------------------------------------------------+
```

### 1.3 When to Use Each Tier

- **Edge (MCU):** Always-on detection, keyword spotting, vibration anomaly, gesture classification. Latency-critical or power-critical.
- **Fog (Gateway):** Object detection with small YOLO models, local dashboards, protocol translation.
- **Cloud:** Model training, fleet-wide analytics, historical trend analysis, OTA update orchestration.

---

## 2. TinyML Overview

### 2.1 What Is TinyML?

TinyML refers to running machine learning inference on microcontrollers operating at milliwatt power budgets. The "tiny" refers to both the model size (tens of kilobytes) and the target hardware (Cortex-M class processors).

Key constraints:

| Resource                    | Typical Budget |
| --------------------------- | -------------- |
| Flash (model + code)        | 256 KB - 2 MB  |
| RAM (activations + buffers) | 64 KB - 512 KB |
| Clock speed                 | 64 - 240 MHz   |
| Power                       | 1 - 50 mW      |
| Floating-point unit         | Often absent   |

### 2.2 The TinyML Workflow

```
+---------------------------------------------------------------+
|                     TinyML PIPELINE                            |
+---------------------------------------------------------------+
|                                                                 |
|  1. COLLECT       2. TRAIN          3. CONVERT                  |
|  +----------+    +----------+    +----------------+             |
|  | Sensor   |--->| TF/PyTorch|--->| TFLite Micro  |             |
|  | Data     |    | Model    |    | Converter +    |             |
|  +----------+    +----------+    | Quantization   |             |
|                                  +----------------+             |
|                                         |                       |
|                                         v                       |
|  5. DEPLOY        4. VALIDATE    +----------------+             |
|  +----------+    +----------+    | INT8 .tflite   |             |
|  | Flash to |<---| Test on  |<---| model (e.g.    |             |
|  | MCU      |    | Dev Board|    | 48 KB)         |             |
|  +----------+    +----------+    +----------------+             |
|                                                                 |
+---------------------------------------------------------------+
```

---

## 3. TensorFlow Lite for Microcontrollers

### 3.1 Model Conversion and Quantization

The standard path from a trained TensorFlow/Keras model to an MCU-deployable artifact:

```python
import tensorflow as tf
import numpy as np

# Step 1: Train a small model (keyword spotting example)
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(49, 40, 1)),       # MFCC spectrogram
    tf.keras.layers.Conv2D(8, (3, 3), activation='relu'),
    tf.keras.layers.MaxPooling2D((2, 2)),
    tf.keras.layers.Conv2D(16, (3, 3), activation='relu'),
    tf.keras.layers.MaxPooling2D((2, 2)),
    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(32, activation='relu'),
    tf.keras.layers.Dense(4, activation='softmax')   # 4 keywords
])

model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])

# model.fit(train_ds, epochs=50, validation_data=val_ds)

# Step 2: Post-training quantization to INT8
def representative_dataset():
    """Provide ~100-500 samples for calibration."""
    for sample in calibration_data:
        yield [sample.astype(np.float32)]

converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = representative_dataset
converter.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS_INT8
]
converter.inference_input_type = tf.int8
converter.inference_output_type = tf.int8

tflite_model = converter.convert()

# Step 3: Save the quantized model
with open('keyword_model_int8.tflite', 'wb') as f:
    f.write(tflite_model)

print(f"Model size: {len(tflite_model)} bytes")
# Typical output: Model size: 48320 bytes
```

### 3.2 Converting to a C Array

The `.tflite` file must be embedded in firmware as a C array:

```bash
xxd -i keyword_model_int8.tflite > model_data.cc
```

This produces:

```c
// model_data.cc (auto-generated, then cleaned up)
#include "model_data.h"

alignas(8) const unsigned char g_model_data[] = {
    0x20, 0x00, 0x00, 0x00, 0x54, 0x46, 0x4c, 0x33,
    // ... thousands of bytes ...
};
const unsigned int g_model_data_len = 48320;
```

### 3.3 Running Inference on an MCU

```c
/* main.c -- TFLite Micro inference on STM32/ESP32 */
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "model_data.h"

/* Arena size must cover tensors + scratch buffers */
constexpr int kTensorArenaSize = 24 * 1024;  /* 24 KB */
alignas(16) static uint8_t tensor_arena[kTensorArenaSize];

void run_inference(const int8_t *input_features, int input_len) {
    /* Load model */
    const tflite::Model *model = tflite::GetModel(g_model_data);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        printf("Model schema mismatch!\n");
        return;
    }

    /* Register only the ops this model actually uses */
    static tflite::MicroMutableOpResolver<5> resolver;
    resolver.AddConv2D();
    resolver.AddMaxPool2D();
    resolver.AddFullyConnected();
    resolver.AddReshape();
    resolver.AddSoftmax();

    /* Build interpreter */
    static tflite::MicroInterpreter interpreter(
        model, resolver, tensor_arena, kTensorArenaSize);
    interpreter.AllocateTensors();

    /* Copy input features */
    TfLiteTensor *input = interpreter.input(0);
    memcpy(input->data.int8, input_features, input_len);

    /* Run inference */
    TfLiteStatus status = interpreter.Invoke();
    if (status != kTfLiteOk) {
        printf("Inference failed\n");
        return;
    }

    /* Read output */
    TfLiteTensor *output = interpreter.output(0);
    int8_t max_score = -128;
    int predicted_class = 0;
    for (int i = 0; i < output->dims->data[1]; i++) {
        if (output->data.int8[i] > max_score) {
            max_score = output->data.int8[i];
            predicted_class = i;
        }
    }

    printf("Predicted class: %d (score: %d)\n",
           predicted_class, max_score);
}
```

### 3.4 Memory Budget Breakdown

```
+-----------------------------------------------+
|          FLASH (256 KB total)                  |
+-----------------------------------------------+
| Firmware code          |  80 KB               |
| TFLite Micro runtime   |  50 KB               |
| Model weights (INT8)   |  48 KB               |
| Lookup tables / consts  |  20 KB               |
| Free                   |  58 KB               |
+-----------------------------------------------+

+-----------------------------------------------+
|          RAM (64 KB total)                     |
+-----------------------------------------------+
| Stack                  |   4 KB               |
| Heap / globals         |   8 KB               |
| Tensor arena           |  24 KB               |
| Audio ring buffer      |  16 KB               |
| Feature extraction buf |   8 KB               |
| Free                   |   4 KB               |
+-----------------------------------------------+
```

---

## 4. Edge Impulse Platform

Edge Impulse is a cloud-based development platform that simplifies the TinyML workflow for practitioners who are not ML specialists.

### 4.1 Workflow

1. **Data Collection** -- Upload sensor data (CSV, WAV, images) or collect directly from a connected device.
2. **Impulse Design** -- Define a signal processing block (e.g., MFCC for audio, spectral analysis for vibration) and a learning block (neural network, K-NN, anomaly detection).
3. **Training** -- Train in the browser. Platform shows RAM/Flash estimates for target MCU.
4. **Deployment** -- Export as a C++ library, Arduino library, or pre-built firmware binary.

### 4.2 Supported Targets

Edge Impulse generates optimized code for:

- Arduino Nano 33 BLE Sense (Cortex-M4, 256 KB RAM)
- ESP32-S3 (Xtensa LX7, PSRAM option)
- STM32 family (various Cortex-M4/M7)
- Raspberry Pi Pico (RP2040, Cortex-M0+)
- Sony Spresense (Cortex-M4F, GPS built-in)
- Linux boards (Raspberry Pi, Jetson Nano)

---

## 5. Common TinyML Applications

### 5.1 Keyword Spotting (Wake Word Detection)

Detect a small vocabulary of spoken commands ("yes", "no", "stop", "go") using a ~20 KB model processing MFCC features from a PDM microphone.

**Pipeline:**

```
Microphone -> PDM->PCM -> Windowing -> MFCC (40 coefficients)
           -> Neural Network (Conv1D or DS-CNN) -> Keyword ID
```

**Typical specs:**

- Accuracy: ~93% on Speech Commands dataset
- Latency: 20-50 ms per inference
- Model size: 18-50 KB (INT8)
- Power: ~1 mW continuous listening

### 5.2 Anomaly Detection (Predictive Maintenance)

Detect abnormal vibration patterns in industrial motors using accelerometer data.

```python
# Training an autoencoder for anomaly detection
import tensorflow as tf

# Input: 3-axis accelerometer features (spectral power in 32 bins)
input_dim = 96  # 32 bins * 3 axes

model = tf.keras.Sequential([
    tf.keras.layers.Dense(48, activation='relu', input_shape=(input_dim,)),
    tf.keras.layers.Dense(16, activation='relu'),   # Bottleneck
    tf.keras.layers.Dense(48, activation='relu'),
    tf.keras.layers.Dense(input_dim, activation='linear')
])

model.compile(optimizer='adam', loss='mse')

# Train on NORMAL data only
# model.fit(normal_data, normal_data, epochs=100)

# At inference time, high reconstruction error = anomaly
# threshold = np.percentile(train_errors, 99)
```

### 5.3 Gesture Recognition

Classify hand gestures using a 6-axis IMU (accelerometer + gyroscope). Common in wearables and game controllers.

- Collect 1-2 seconds of IMU data per gesture
- Extract features: peak acceleration, RMS, zero-crossings
- Classify with a small fully-connected network (~5 KB)

### 5.4 Predictive Maintenance with Vibration Analysis

```
+--------------------------------------------------+
|   PREDICTIVE MAINTENANCE PIPELINE                 |
+--------------------------------------------------+
|                                                    |
|  Motor          Accelerometer      MCU             |
|  +------+       +----------+     +-----------+     |
|  |      |------>| ADXL345  |---->| STM32L4   |     |
|  | Pump |       | 3-axis   | I2C | TinyML    |     |
|  |      |       | 13-bit   |     | Inference |     |
|  +------+       +----------+     +-----------+     |
|                                       |             |
|                          Normal: LED green          |
|                          Warning: LED yellow        |
|                          Fault: Alert via LoRa      |
|                                                    |
+--------------------------------------------------+
```

---

## 6. Model Optimization Techniques

### 6.1 Quantization

Convert floating-point weights (32-bit) to lower precision:

| Precision | Weight Size | Relative Accuracy | Speedup (Cortex-M) |
| --------- | ----------- | ----------------- | ------------------ |
| FP32      | 4 bytes     | Baseline          | 1x                 |
| FP16      | 2 bytes     | ~0.1% loss        | 1.5-2x             |
| INT8      | 1 byte      | ~1% loss          | 2-4x               |
| INT4      | 0.5 bytes   | ~3-5% loss        | 3-6x               |

```
+----------------------------------------------------------+
|              QUANTIZATION PIPELINE                        |
+----------------------------------------------------------+
|                                                            |
|  FP32 Model     Calibration       INT8 Model              |
|  (400 KB)       Dataset           (100 KB)                |
|  +--------+    +---------+       +---------+              |
|  | W: 0.73|    | 500     |       | W: 93   |              |
|  | W:-0.21|--->| samples |------>| W:-27   |              |
|  | W: 1.05|    | from    |       | W: 134  |              |
|  | (float)|    | train   |       | (int8)  |              |
|  +--------+    +---------+       +---------+              |
|                                                            |
|  Scale: (max-min) / 255                                    |
|  Zero-point: -min / scale                                  |
|  Quantized = round(float_val / scale) + zero_point         |
+----------------------------------------------------------+
```

### 6.2 Pruning

Remove weights that contribute little to accuracy:

```python
import tensorflow_model_optimization as tfmot

# Apply magnitude-based pruning
pruning_params = {
    'pruning_schedule': tfmot.sparsity.keras.PolynomialDecay(
        initial_sparsity=0.30,
        final_sparsity=0.80,      # Remove 80% of weights
        begin_step=1000,
        end_step=5000
    )
}

pruned_model = tfmot.sparsity.keras.prune_low_magnitude(
    model, **pruning_params
)

pruned_model.compile(optimizer='adam',
                     loss='sparse_categorical_crossentropy',
                     metrics=['accuracy'])

# Fine-tune with pruning callbacks
callbacks = [tfmot.sparsity.keras.UpdatePruningStep()]
# pruned_model.fit(train_ds, epochs=10, callbacks=callbacks)

# Strip pruning wrappers for export
final_model = tfmot.sparsity.keras.strip_pruning(pruned_model)
```

### 6.3 Knowledge Distillation

Train a small "student" network to mimic a large "teacher" network:

```python
import tensorflow as tf

def distillation_loss(y_true, y_pred, teacher_logits,
                      temperature=3.0, alpha=0.7):
    """Combine hard label loss with soft teacher loss."""
    hard_loss = tf.keras.losses.sparse_categorical_crossentropy(
        y_true, y_pred)

    soft_pred = tf.nn.softmax(y_pred / temperature)
    soft_teacher = tf.nn.softmax(teacher_logits / temperature)
    soft_loss = tf.keras.losses.categorical_crossentropy(
        soft_teacher, soft_pred)

    return alpha * soft_loss * (temperature ** 2) + (1 - alpha) * hard_loss
```

### 6.4 Architecture Search

Use neural architecture search (NAS) constrained by target hardware:

- **MCUNet** -- Jointly designs the model architecture and inference engine for Cortex-M devices.
- **MicroNets** -- Google's approach to sub-100 KB models.
- **Once-for-All (OFA)** -- Train a single large model, then extract sub-networks for different hardware budgets.

---

## 7. Hardware Accelerators

### 7.1 Neural Processing Units (NPUs)

Dedicated silicon for matrix multiply-accumulate (MAC) operations:

| Accelerator    | TOPS | Power  | Target               |
| -------------- | ---- | ------ | -------------------- |
| Arm Ethos-U55  | 0.5  | 5 mW   | Cortex-M55 MCUs      |
| Arm Ethos-U85  | 4.0  | 50 mW  | Cortex-M85 MCUs      |
| Coral Edge TPU | 4.0  | 2 W    | Linux SBCs           |
| Intel Movidius | 1.0  | 1 W    | USB stick / M.2      |
| Kendryte K210  | 0.8  | 300 mW | RISC-V + KPU         |
| ESP32-S3       | --   | 50 mW  | Xtensa + vector ext. |

### 7.2 Google Coral Edge TPU

```
+--------------------------------------------------+
|       CORAL EDGE TPU INFERENCE FLOW               |
+--------------------------------------------------+
|                                                    |
|  Host CPU (ARM/x86)        Edge TPU               |
|  +------------------+    +-----------------+       |
|  | Python app       |    | INT8 Model      |       |
|  | - Load model     |--->| - Conv layers   |       |
|  | - Pre-process    | USB| - Depthwise     |       |
|  |   input image    | or | - Pooling       |       |
|  | - Post-process   | PCIe - FC layers    |       |
|  |   results        |<---| - 4 TOPS INT8   |       |
|  +------------------+    +-----------------+       |
|                                                    |
|  Requirements:                                     |
|  - Model must be fully INT8 quantized              |
|  - All ops must be Edge TPU compatible             |
|  - Compiled with edgetpu_compiler                  |
+--------------------------------------------------+
```

### 7.3 Intel Movidius (OpenVINO)

The Movidius Myriad X VPU offers a USB-stick form factor for adding neural inference to any Linux device. Models are compiled to IR format via OpenVINO toolkit.

---

## 8. Inference Performance Benchmarks

### 8.1 Keyword Spotting (DS-CNN, Speech Commands)

| Platform                        | Model Size | Inference Time | Accuracy | Power |
| ------------------------------- | ---------- | -------------- | -------- | ----- |
| STM32L4 (Cortex-M4 @ 80 MHz)    | 26 KB      | 40 ms          | 92.3%    | 8 mW  |
| nRF5340 (Cortex-M33 @ 128 MHz)  | 26 KB      | 22 ms          | 92.3%    | 5 mW  |
| ESP32-S3 (Xtensa @ 240 MHz)     | 26 KB      | 12 ms          | 92.3%    | 45 mW |
| RPi Pico (Cortex-M0+ @ 133 MHz) | 26 KB      | 90 ms          | 92.3%    | 15 mW |

### 8.2 Person Detection (MobileNet v1 0.25, 96x96)

| Platform                      | Model Size | Inference Time | Accuracy | Power  |
| ----------------------------- | ---------- | -------------- | -------- | ------ |
| STM32H7 (Cortex-M7 @ 480 MHz) | 300 KB     | 180 ms         | 84.5%    | 120 mW |
| ESP32-S3 + PSRAM              | 300 KB     | 250 ms         | 84.5%    | 150 mW |
| Coral USB Accelerator         | 300 KB     | 3 ms           | 84.5%    | 2 W    |
| Jetson Nano (GPU)             | 300 KB     | 5 ms           | 84.5%    | 5 W    |

---

## 9. Federated Learning for IoT

### 9.1 Concept

Instead of centralizing raw data, each device trains locally and shares only model updates (gradients) with a central server.

```
+----------------------------------------------------------+
|              FEDERATED LEARNING                           |
+----------------------------------------------------------+
|                                                            |
|              Central Server                                |
|              +----------+                                  |
|              | Aggregate|                                  |
|              | Gradients|                                  |
|              +----+-----+                                  |
|                   |                                        |
|        +----------+----------+                             |
|        |          |          |                              |
|   +----v---+ +---v----+ +---v----+                         |
|   |Device A| |Device B| |Device C|                         |
|   |Local   | |Local   | |Local   |                         |
|   |Training| |Training| |Training|                         |
|   |Data    | |Data    | |Data    |                         |
|   |stays   | |stays   | |stays   |                         |
|   |local   | |local   | |local   |                         |
|   +--------+ +--------+ +--------+                         |
|                                                            |
|  Benefits:                                                 |
|  - Privacy: raw data never leaves device                   |
|  - Bandwidth: only gradients transmitted                   |
|  - Personalization: local fine-tuning possible              |
|                                                            |
|  Challenges:                                               |
|  - Non-IID data across devices                             |
|  - Communication overhead for gradient sync                |
|  - Constrained compute on edge devices                     |
+----------------------------------------------------------+
```

### 9.2 Practical Considerations for IoT

- **Communication rounds:** Minimize over-the-air gradient exchanges (compress gradients, use federated averaging).
- **Heterogeneous devices:** Different MCUs train at different speeds; the server must handle stragglers.
- **Security:** Gradients can leak information; differential privacy or secure aggregation is needed.

---

## 10. Computer Vision at the Edge

### 10.1 Person Detection on ESP32-S3

The ESP32-S3 with an OV2640 camera module can run a quantized MobileNet model for person detection at ~2-4 FPS (96x96 grayscale input).

```c
/* Simplified ESP32-S3 camera + TinyML inference */
#include "esp_camera.h"
#include "person_detect_model.h"
#include "tensorflow/lite/micro/micro_interpreter.h"

#define IMG_WIDTH  96
#define IMG_HEIGHT 96

static uint8_t tensor_arena[96 * 1024];  /* 96 KB with PSRAM */

void detect_person(void) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        return;
    }

    /* Resize and convert to grayscale */
    uint8_t resized[IMG_WIDTH * IMG_HEIGHT];
    resize_and_grayscale(fb->buf, fb->width, fb->height,
                         resized, IMG_WIDTH, IMG_HEIGHT);
    esp_camera_fb_return(fb);

    /* Quantize input: float_val = (int8_val - zero_point) * scale */
    int8_t input_quantized[IMG_WIDTH * IMG_HEIGHT];
    for (int i = 0; i < IMG_WIDTH * IMG_HEIGHT; i++) {
        input_quantized[i] = (int8_t)(resized[i] - 128);
    }

    /* Run inference (interpreter setup omitted for brevity) */
    memcpy(interpreter->input(0)->data.int8,
           input_quantized, sizeof(input_quantized));
    interpreter->Invoke();

    int8_t person_score = interpreter->output(0)->data.int8[1];
    if (person_score > 30) {
        gpio_set_level(LED_PIN, 1);  /* Person detected */
    } else {
        gpio_set_level(LED_PIN, 0);
    }
}
```

### 10.2 OpenMV Camera

OpenMV is a MicroPython-based camera module (STM32H7 + OV7725/OV5640) designed for machine vision:

```python
# OpenMV -- simple object detection with TFLite
import sensor, image, tf

sensor.reset()
sensor.set_pixformat(sensor.GRAYSCALE)
sensor.set_framesize(sensor.QVGA)  # 320x240
sensor.skip_frames(time=2000)

# Load a pre-trained TFLite model
net = tf.load("person_detection.tflite")

while True:
    img = sensor.snapshot()
    results = net.classify(img)
    for r in results:
        label = r.output()
        confidence = max(label)
        idx = label.index(confidence)
        if idx == 1 and confidence > 0.7:
            img.draw_string(10, 10, "Person: %.1f%%" % (confidence * 100))
```

---

## 11. Audio Processing: Wake Word Detection

### 11.1 Feature Extraction Pipeline

```
+----------------------------------------------------------+
|           AUDIO FEATURE EXTRACTION                        |
+----------------------------------------------------------+
|                                                            |
|  PDM Mic    PCM 16kHz    Framing     FFT      MFCC        |
|  +-----+   +--------+   +------+   +-----+  +--------+   |
|  |     |-->| 16-bit |-->| 30ms |-->| 512 |->| 40 Mel |   |
|  | I2S |   | mono   |   | win  |   | pt  |  | coeff  |   |
|  +-----+   +--------+   | 50%  |   +-----+  +--------+   |
|                          | overlap          |              |
|                          +------+           v              |
|                                     +-------------+        |
|                                     | 49 x 40     |        |
|                                     | spectrogram |        |
|                                     | (1 second)  |        |
|                                     +-------------+        |
|                                            |               |
|                                            v               |
|                                     +-------------+        |
|                                     | DS-CNN      |        |
|                                     | Classifier  |        |
|                                     +-------------+        |
|                                            |               |
|                                     "Hey Device" detected  |
+----------------------------------------------------------+
```

### 11.2 Streaming Inference

Wake word detection must run continuously with overlapping windows:

```c
/* Ring buffer approach for streaming audio inference */
#define AUDIO_BUFFER_SIZE   16000  /* 1 second at 16 kHz */
#define SLICE_SIZE          480    /* 30 ms */
#define SLICE_STRIDE        320    /* 20 ms stride = 10 ms overlap */

static int16_t audio_ring[AUDIO_BUFFER_SIZE];
static int ring_write_idx = 0;

void audio_isr_callback(int16_t *samples, int count) {
    for (int i = 0; i < count; i++) {
        audio_ring[ring_write_idx] = samples[i];
        ring_write_idx = (ring_write_idx + 1) % AUDIO_BUFFER_SIZE;
    }
}

void inference_task(void *arg) {
    int8_t features[49 * 40];  /* MFCC spectrogram */

    while (1) {
        /* Extract MFCC features from ring buffer */
        extract_mfcc_features(audio_ring, ring_write_idx, features);

        /* Run classifier */
        int keyword_id = run_tflite_inference(features, sizeof(features));

        if (keyword_id == KEYWORD_HEY_DEVICE) {
            trigger_wake_event();
        }

        vTaskDelay(pdMS_TO_TICKS(100));  /* Infer every 100 ms */
    }
}
```

---

## 12. Memory Constraints: Fitting Models in 256 KB Flash / 64 KB RAM

### 12.1 Strategies for Reducing Model Size

1. **Use depthwise separable convolutions** -- 8-9x fewer parameters than standard convolutions.
2. **Reduce input resolution** -- 96x96 instead of 224x224 cuts memory by 5.4x.
3. **Use INT8 quantization** -- 4x reduction in weight storage.
4. **Operator fusion** -- Fuse Conv + BN + ReLU into a single operator.
5. **Selective op registration** -- Only include the TFLite ops your model uses (saves ~50 KB Flash).

### 12.2 Activation Memory Optimization

The tensor arena holds intermediate activation tensors. The interpreter reuses memory across layers:

```
Layer 1 output:  [========]
Layer 2 output:  [====]          (Layer 1 buffer freed)
Layer 3 output:  [======]        (Layer 2 buffer freed)
Layer 4 output:  [==]            (Layer 3 buffer freed)

Peak usage = max(individual layer outputs + inputs)
```

Use `interpreter.arena_used_bytes()` to measure actual usage after `AllocateTensors()`.

### 12.3 When 64 KB RAM Is Not Enough

- **Patch-based inference:** Process the image in tiles.
- **Layer-by-layer execution:** Load one layer's weights from Flash, compute, store result, repeat.
- **External PSRAM:** ESP32-S3 supports up to 8 MB of SPI PSRAM (slower, but usable for large activations).

---

## 13. End-to-End Example: Vibration Anomaly Detector

### 13.1 Training Script (Python)

```python
import numpy as np
import tensorflow as tf

# Simulated 3-axis accelerometer data (100 Hz, 1-second windows)
WINDOW_SIZE = 100
NUM_AXES = 3
NUM_FEATURES = 33  # Spectral features per axis

def extract_features(raw_window):
    """Extract spectral features from a time-domain window."""
    features = []
    for axis in range(NUM_AXES):
        signal = raw_window[:, axis]
        fft_vals = np.abs(np.fft.rfft(signal))[:NUM_FEATURES // NUM_AXES]
        rms = np.sqrt(np.mean(signal ** 2))
        features.extend(fft_vals.tolist())
        features.append(rms)
    return np.array(features, dtype=np.float32)

# Build a simple anomaly detection model (autoencoder)
input_dim = NUM_FEATURES
encoder = tf.keras.Sequential([
    tf.keras.layers.Dense(24, activation='relu',
                          input_shape=(input_dim,)),
    tf.keras.layers.Dense(8, activation='relu'),
])

decoder = tf.keras.Sequential([
    tf.keras.layers.Dense(24, activation='relu',
                          input_shape=(8,)),
    tf.keras.layers.Dense(input_dim, activation='linear'),
])

autoencoder = tf.keras.Sequential([encoder, decoder])
autoencoder.compile(optimizer='adam', loss='mse')

# Train on normal data only
# autoencoder.fit(normal_features, normal_features, epochs=200)

# Convert to TFLite INT8
converter = tf.lite.TFLiteConverter.from_keras_model(autoencoder)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
# ... (representative dataset, INT8 target as shown earlier)
tflite_model = converter.convert()

print(f"Anomaly model size: {len(tflite_model)} bytes")
# Expected: ~3-5 KB
```

### 13.2 Firmware Inference (C)

```c
/* anomaly_detector.c */
#include "anomaly_model_data.h"
#include "tflite_inference.h"
#include "accelerometer.h"

#define ANOMALY_THRESHOLD  25  /* Calibrated on normal data */

typedef enum {
    MOTOR_NORMAL,
    MOTOR_WARNING,
    MOTOR_FAULT
} motor_state_t;

motor_state_t check_motor_health(void) {
    float raw_window[100][3];
    accel_read_window(raw_window, 100);

    int8_t features[33];
    extract_spectral_features(raw_window, features);

    /* Run autoencoder inference */
    int8_t reconstructed[33];
    tflite_run(features, reconstructed, sizeof(features));

    /* Compute reconstruction error */
    int32_t error = 0;
    for (int i = 0; i < 33; i++) {
        int diff = (int)features[i] - (int)reconstructed[i];
        error += diff * diff;
    }
    error /= 33;  /* Mean squared error */

    if (error > ANOMALY_THRESHOLD * 2) {
        return MOTOR_FAULT;
    } else if (error > ANOMALY_THRESHOLD) {
        return MOTOR_WARNING;
    }
    return MOTOR_NORMAL;
}
```

---

## 14. Tools and Frameworks Summary

| Tool                          | Purpose                        | Output                |
| ----------------------------- | ------------------------------ | --------------------- |
| TensorFlow Lite Micro         | On-MCU inference runtime       | C++ library           |
| Edge Impulse                  | End-to-end TinyML platform     | C++ library / binary  |
| TF Model Optimization Toolkit | Pruning, quantization          | Optimized model       |
| CMSIS-NN                      | ARM Cortex-M optimized kernels | Accelerated ops       |
| OpenMV                        | MicroPython vision platform    | Python scripts        |
| Edge TPU Compiler             | Compile for Coral              | .tflite (Edge TPU)    |
| Apache TVM                    | Compiler for diverse targets   | Optimized runtime     |
| MCUNet                        | NAS for microcontrollers       | Architecture + engine |

---

## Interview Questions

**Q1: Why would you run ML inference on a microcontroller instead of in the cloud?**
Reduced latency (sub-millisecond vs. hundreds of milliseconds), elimination of network dependency (works offline), lower bandwidth costs (only anomalies are transmitted), better privacy (raw data never leaves the device), and lower per-unit cloud compute costs at scale.

**Q2: What is post-training quantization and how does it reduce model size?**
Post-training quantization converts 32-bit floating-point weights to lower precision (typically INT8) after training is complete. It uses a representative calibration dataset to determine the scale and zero-point for each tensor. This reduces model size by 4x (FP32 to INT8) and speeds up inference on hardware without FPU.

**Q3: Explain the difference between post-training quantization and quantization-aware training.**
Post-training quantization applies quantization after training and may lose 1-3% accuracy. Quantization-aware training (QAT) inserts fake quantization nodes during training so the model learns to be robust to quantization errors. QAT typically preserves accuracy better but requires retraining.

**Q4: What is the tensor arena in TFLite Micro, and how do you size it?**
The tensor arena is a statically allocated memory region used for input/output tensors, intermediate activation buffers, and scratch memory. Size it by calling `interpreter.arena_used_bytes()` after `AllocateTensors()` on the target, then add 10-20% margin. Undersizing causes allocation failure; oversizing wastes RAM.

**Q5: How does a depthwise separable convolution save memory compared to a standard convolution?**
A standard convolution applies a K x K x C*in filter for each of C_out output channels (K^2 * C*in * C*out params). Depthwise separable splits this into a depthwise step (K^2 * C*in params, one filter per input channel) and a pointwise step (C_in * C*out params). Total params: K^2 * C*in + C_in * C_out, which is ~8-9x fewer for typical values.

**Q6: Describe the MFCC feature extraction pipeline for keyword spotting.**
Audio is sampled at 16 kHz, divided into overlapping 30 ms frames, windowed (Hann), transformed via FFT, passed through a Mel-scale filter bank (typically 40 filters), log-compressed, and then a DCT is applied. The result is a 49x40 spectrogram for a 1-second audio clip, which serves as input to the neural network.

**Q7: What is federated learning and why is it relevant to IoT?**
Federated learning trains a shared model by having each device compute gradient updates on its local data, then sending only those updates to a central server for aggregation. Raw data never leaves the device. This preserves privacy, reduces bandwidth, and enables personalization -- all critical for IoT deployments with sensitive or high-volume data.

**Q8: How would you implement continuous wake word detection on a resource-constrained MCU?**
Use a ring buffer to continuously capture audio from a PDM microphone via DMA. Every 100-200 ms, extract MFCC features from the most recent 1-second window and run inference with a small DS-CNN model. This streaming approach overlaps data capture and inference, and the ring buffer avoids memory allocation.

**Q9: What is the Coral Edge TPU, and what are its constraints?**
The Coral Edge TPU is Google's ASIC for accelerating TFLite INT8 inference at 4 TOPS. Constraints: the model must be fully INT8 quantized, all operations must be Edge TPU-compatible (unsupported ops fall back to CPU), and the model must be compiled with the Edge TPU compiler before deployment.

**Q10: Explain knowledge distillation and when you would use it for TinyML.**
Knowledge distillation trains a small "student" model to match the softened output probabilities of a large "teacher" model. The temperature parameter controls how much information the soft targets carry. Use it when a direct small model training underperforms and you have a high-accuracy large model available as the teacher.

**Q11: What strategies would you use to fit a model into 256 KB Flash and 64 KB RAM?**
Use INT8 quantization (4x weight reduction), depthwise separable convolutions, reduced input resolution (96x96 or 64x64), pruning (remove 50-80% of weights), selective op registration (only include needed TFLite ops), and operator fusion (Conv+BN+ReLU). For RAM, optimize tensor arena by analyzing peak activation memory.

**Q12: What is the difference between an NPU, a GPU, and a CPU for inference?**
CPUs are general-purpose and flexible but slow for matrix operations. GPUs excel at parallel floating-point math but consume watts of power. NPUs are custom silicon optimized specifically for multiply-accumulate operations at low power, often supporting only INT8 and specific layer types. NPUs offer the best performance-per-watt for inference.

**Q13: How would you validate that a quantized model's accuracy is acceptable?**
Run the quantized model and the original float model on the same test dataset and compare accuracy metrics. Examine per-class precision/recall to catch classes disproportionately affected by quantization. Use visualization tools to compare layer-by-layer output distributions. If accuracy drops more than 1-2%, consider quantization-aware training.

**Q14: Describe the anomaly detection approach for predictive maintenance on an MCU.**
Train an autoencoder on normal operating data only. At inference time, feed sensor features through the autoencoder and compute reconstruction error (MSE). Normal data reconstructs well (low error); anomalous data reconstructs poorly (high error). Set a threshold based on the 99th percentile of training errors. This approach needs only ~3-5 KB for the model.

**Q15: What are the tradeoffs between Edge Impulse and building a custom TinyML pipeline?**
Edge Impulse provides a complete workflow (data collection, feature design, training, deployment) with minimal ML expertise required, but limits model architecture choices and may not support all MCUs or custom ops. A custom pipeline (TF/PyTorch + TFLite Micro) offers full control over architecture, quantization strategy, and hardware-specific optimizations, but requires ML engineering expertise and more development time.
