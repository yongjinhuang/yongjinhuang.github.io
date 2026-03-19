# Digital Audio Fundamentals

A comprehensive guide for software engineers starting from zero. This document covers the
physics of sound, digital representation of audio, formats, processing, latency, and the
key libraries you will encounter in professional audio/video/RTC work.

---

## Table of Contents

1. [Physics of Sound](#1-physics-of-sound)
2. [Analog to Digital Conversion](#2-analog-to-digital-conversion)
3. [PCM Audio](#3-pcm-audio)
4. [Audio Channels](#4-audio-channels)
5. [Audio Formats](#5-audio-formats)
6. [Audio Processing Concepts](#6-audio-processing-concepts)
7. [Audio Latency](#7-audio-latency)
8. [Key Libraries and APIs](#8-key-libraries-and-apis)
9. [Code Examples](#9-code-examples)
10. [Common Interview Questions](#10-common-interview-questions)

---

## 1. Physics of Sound

### 1.1 What Is Sound?

Sound is a mechanical wave: a pressure disturbance that propagates through a medium
(air, water, steel, etc.). Unlike electromagnetic waves, sound **cannot travel through
a vacuum**. When you speak, your vocal cords push air molecules together (compression)
and pull them apart (rarefaction). Those alternating pressure changes travel outward
from the source.

```
Compression   Rarefaction   Compression   Rarefaction
   |||||||      |  |  |       |||||||      |  |  |
   |||||||      |  |  |       |||||||      |  |  |
   |||||||      |  |  |       |||||||      |  |  |
   High P       Low P         High P       Low P
```

### 1.2 Key Properties of a Sound Wave

```
        Amplitude (A)
            ^
            |      .  .
            |    .      .
            |  .          .                     one cycle
            |.              .              |<------------>|
  ----------+-----------------.-----------.--+-------------> Time
            |                   .        .
            |                     .    .
            |                       .
            v
```

| Property       | Symbol | Unit              | Definition                                               |
| -------------- | ------ | ----------------- | -------------------------------------------------------- |
| Frequency      | f      | Hertz (Hz)        | Number of complete cycles per second                     |
| Period         | T      | Seconds (s)       | Duration of one cycle; T = 1/f                           |
| Amplitude      | A      | Pascals (Pa)      | Maximum displacement from equilibrium (perceived volume) |
| Wavelength     | lambda | Meters (m)        | Physical length of one cycle; lambda = v/f               |
| Speed of sound | v      | m/s               | ~343 m/s in air at 20 C                                  |
| Phase          | phi    | Radians / Degrees | Position within one cycle at a given time                |

### 1.3 Frequency and Pitch

Frequency determines what humans perceive as **pitch**.

| Frequency | Approximate Pitch            |
| --------- | ---------------------------- |
| 27.5 Hz   | Lowest note on a piano (A0)  |
| 261.6 Hz  | Middle C (C4)                |
| 440 Hz    | Concert A (A4) - tuning ref  |
| 4,186 Hz  | Highest note on a piano (C8) |
| 20,000 Hz | Upper limit of human hearing |

**Human hearing range: 20 Hz to 20 kHz.** In practice, adults lose sensitivity above
~15-16 kHz due to natural aging (presbycusis). Infrasound (< 20 Hz) and ultrasound
(> 20 kHz) are inaudible but can still have physical effects.

### 1.4 Amplitude and Loudness

Amplitude maps to perceived loudness but the relationship is **logarithmic**, not linear.
This is why we measure loudness in decibels (dB):

```
dB SPL = 20 * log10(P / P_ref)
```

where `P_ref = 20 micropascals` (threshold of human hearing).

| dB SPL | Example                       |
| ------ | ----------------------------- |
| 0      | Threshold of hearing          |
| 30     | Quiet whisper                 |
| 60     | Normal conversation           |
| 85     | Heavy traffic (damage begins) |
| 110    | Rock concert                  |
| 130    | Threshold of pain             |
| 140    | Jet engine at 30 m            |

### 1.5 Speed of Sound in Different Media

| Medium       | Speed (m/s) |
| ------------ | ----------- |
| Air (20 C)   | 343         |
| Water (25 C) | 1,497       |
| Steel        | 5,960       |
| Vacuum       | 0 (N/A)     |

The speed of sound in air varies with temperature:

```
v = 331.3 + 0.606 * T_celsius   (m/s)
```

### 1.6 Psychoacoustics Basics

Psychoacoustics studies how humans **perceive** sound, which often differs from the
raw physical measurements.

**Key concepts:**

- **Equal-loudness contours (Fletcher-Munson curves):** Humans are most sensitive to
  frequencies between 2-5 kHz. A 50 Hz tone must be significantly louder (in dB SPL)
  than a 3 kHz tone to be perceived at the same loudness.

- **Masking:** A loud sound can make a quieter sound inaudible. This has two forms:

  - **Simultaneous masking:** Both sounds at the same time. A loud 1 kHz tone masks
    quiet tones near 1 kHz.
  - **Temporal masking:** A loud sound masks quiet sounds slightly before (pre-masking,
    ~5 ms) and after (post-masking, ~100-200 ms) it occurs.

- **Critical bands:** The cochlea divides frequencies into roughly 24 critical bands
  (Bark scale). Masking is strongest within the same critical band.

- **Cocktail party effect:** The brain can isolate a single voice from a noisy
  environment using binaural cues, spectral differences, and attention.

**Why engineers care:** Lossy audio codecs (MP3, AAC, Opus) exploit psychoacoustic
masking to discard inaudible data, dramatically reducing file size with minimal
perceptual quality loss.

---

## 2. Analog to Digital Conversion

### 2.1 The ADC/DAC Pipeline

```
                         DIGITAL DOMAIN
                    +-----------------------+
                    |                       |
  Microphone        |   Storage / Process   |        Speaker
  (Analog) -------->| ADC ---> DSP ---> DAC |------> (Analog)
                    |                       |
                    +-----------------------+

  ADC = Analog-to-Digital Converter
  DAC = Digital-to-Audio Converter
  DSP = Digital Signal Processing
```

The real-world audio signal is continuous in both time and amplitude. To store and
process it digitally, we must **discretize** it in two dimensions:

1. **Time** -- Sampling (choosing discrete time points)
2. **Amplitude** -- Quantization (choosing discrete amplitude levels)

### 2.2 Sampling

**Sampling** is the process of measuring the amplitude of the analog signal at regular
intervals.

```
  Analog Signal               Sampled Signal

  ^                           ^
  |    .                      |    *
  |  .   .                    |  *   *
  | .     .   .               | *     *   *
  |.       . . .              |*       * * *
  +-----------.---> t         +-----------*---> t
               .                           *
```

**Sample rate (fs):** The number of samples captured per second, measured in Hertz.

| Sample Rate | Common Use                                    |
| ----------- | --------------------------------------------- |
| 8,000 Hz    | Telephone, narrow-band VoIP                   |
| 16,000 Hz   | Wideband VoIP, speech recognition             |
| 22,050 Hz   | AM radio quality                              |
| 44,100 Hz   | CD audio (Red Book standard)                  |
| 48,000 Hz   | Professional audio, video production, Blu-ray |
| 88,200 Hz   | High-resolution audio (2x CD)                 |
| 96,000 Hz   | High-resolution audio, studio recording       |
| 192,000 Hz  | Ultra high-resolution (diminishing returns)   |

### 2.3 The Nyquist-Shannon Sampling Theorem

> To perfectly reconstruct a continuous band-limited signal, the sampling rate must be
> **at least twice** the highest frequency present in the signal.
>
> **fs >= 2 \* f_max**

The frequency `fs/2` is called the **Nyquist frequency**.

**Why 44.1 kHz for CDs?**

```
Human hearing limit = 20,000 Hz
Nyquist requirement = 2 * 20,000 = 40,000 Hz
Add guard band for anti-aliasing filter roll-off = ~44,100 Hz
```

The extra 4,100 Hz above 40,000 provides room for a practical low-pass filter to
attenuate frequencies above 20 kHz before they cause aliasing.

### 2.4 Aliasing

When the sampling rate is too low, high-frequency components are misrepresented as
lower frequencies. This is called **aliasing**.

```
  Original: 15 kHz sine wave
  Sample rate: 10 kHz (Nyquist = 5 kHz)

  The 15 kHz wave "folds back" and appears as a 5 kHz signal.

  Aliased frequency = |f_signal - n * fs|
  where n is chosen so the result is in [0, fs/2]

  |15000 - 1 * 10000| = 5000 Hz   <-- alias!
```

**Anti-aliasing filter:** A low-pass filter applied BEFORE the ADC to remove all
frequencies above the Nyquist frequency. Without it, those frequencies fold down
and corrupt the digital signal irreversibly.

```
  Analog Signal ---> [Anti-Aliasing LPF] ---> [Sampler] ---> Digital Samples
```

### 2.5 Quantization

Each sample must be stored as a finite number. **Quantization** maps the continuous
amplitude range to a finite set of discrete levels.

**Bit depth** determines how many levels are available:

| Bit Depth    | Levels      | Dynamic Range (approx) | Common Use             |
| ------------ | ----------- | ---------------------- | ---------------------- |
| 8-bit        | 256         | ~48 dB                 | Telephony, retro games |
| 16-bit       | 65,536      | ~96 dB                 | CD audio               |
| 24-bit       | 16,777,216  | ~144 dB                | Professional recording |
| 32-bit float | ~infinite\* | ~1528 dB (theoretical) | Internal processing    |

\*32-bit float uses IEEE 754 floating point, which provides enormous headroom.

**Quantization error (noise):** The difference between the actual analog value and the
nearest quantization level. This is an unavoidable artifact. Its theoretical maximum
for uniform quantization is:

```
SNR_quantization = 6.02 * N + 1.76  (dB)

where N = number of bits

16-bit: SNR = 6.02 * 16 + 1.76 = 98.08 dB
24-bit: SNR = 6.02 * 24 + 1.76 = 146.24 dB
```

**Dithering:** Adding a small amount of noise BEFORE quantization to randomize the
quantization error. This converts the correlated distortion into uncorrelated noise,
which is perceptually less objectionable. Dithering is standard practice when reducing
bit depth (e.g., 24-bit master to 16-bit CD).

### 2.6 Signal-to-Noise Ratio (SNR)

SNR measures the ratio of desired signal power to noise power:

```
SNR (dB) = 10 * log10(P_signal / P_noise)
         = 20 * log10(A_signal / A_noise)
```

Higher SNR = cleaner audio. Professional equipment targets SNR > 90 dB.

### 2.7 Reconstruction (DAC)

The DAC converts digital samples back to an analog signal. A **reconstruction filter**
(low-pass) smooths the staircase output into a continuous waveform.

```
  Digital Samples ---> [DAC / Zero-Order Hold] ---> [Reconstruction LPF] ---> Analog
```

---

## 3. PCM Audio

### 3.1 What Is PCM?

**Pulse Code Modulation (PCM)** is the standard method for representing sampled audio
digitally. Each sample is a numerical value representing the amplitude of the audio
signal at that point in time.

PCM is **uncompressed** -- every sample is stored explicitly. It is the raw format that
ADCs produce and DACs consume.

### 3.2 PCM Parameters

A PCM stream is fully described by:

| Parameter      | Description                          | Example       |
| -------------- | ------------------------------------ | ------------- |
| Sample rate    | Samples per second per channel       | 48000 Hz      |
| Bit depth      | Bits per sample                      | 16            |
| Channels       | Number of audio channels             | 2 (stereo)    |
| Sample format  | Integer or float, signed or unsigned | Signed 16-bit |
| Byte order     | Little-endian or big-endian          | Little-endian |
| Channel layout | Interleaved or planar                | Interleaved   |

### 3.3 Interleaved vs. Planar

**Interleaved (packed):** Samples for all channels alternate in memory.

```
Interleaved stereo:
  [L0][R0][L1][R1][L2][R2][L3][R3]...

  Memory layout for 16-bit stereo:
  Byte:  0  1  2  3  4  5  6  7  8  9  10 11 ...
         |L0  ||R0  ||L1  ||R1  ||L2  ||R2  |
```

**Planar (non-interleaved):** All samples for one channel are contiguous, followed by
the next channel.

```
Planar stereo:
  [L0][L1][L2][L3]...[R0][R1][R2][R3]...

  Or in separate buffers:
  Buffer 0: [L0][L1][L2][L3]...
  Buffer 1: [R0][R1][R2][R3]...
```

**Trade-offs:**

| Aspect            | Interleaved                 | Planar                          |
| ----------------- | --------------------------- | ------------------------------- |
| Hardware I/O      | Native format for most DACs | Requires interleaving for I/O   |
| SIMD processing   | Harder (data is mixed)      | Easier (contiguous per channel) |
| File formats      | WAV, AIFF (standard)        | FFmpeg internal, some APIs      |
| Memory access     | Good locality for playback  | Good locality for DSP           |
| Mixing/processing | Must skip stride            | Direct sequential access        |

### 3.4 Signed vs. Unsigned

- **Signed integers:** Center at 0. Range for 16-bit: -32768 to +32767.
  Silence = 0. This is the standard for >= 16-bit audio.

- **Unsigned integers:** Center at mid-point. Range for 8-bit: 0 to 255.
  Silence = 128. Used primarily for 8-bit PCM (historical reasons).

```
  Signed 16-bit:       -32768 -------- 0 -------- +32767
  Unsigned 8-bit:       0 ----------- 128 ---------- 255
                        ^              ^               ^
                     max neg       silence          max pos
```

### 3.5 Integer vs. Floating Point

- **Integer PCM:** Fixed-point. The range is bounded by the bit depth. Clipping occurs
  if the signal exceeds the range.

- **Floating-point PCM:** Typically 32-bit (float) or 64-bit (double). Nominal range
  is -1.0 to +1.0, but values can exceed this without immediate clipping. This provides
  enormous headroom during processing.

```
  Integer 16-bit:    [-32768, +32767]     clipping at boundaries
  Float 32-bit:      [-1.0, +1.0] nominal, but can exceed (e.g., 1.5)
                     Clipping deferred to final output stage
```

**Best practice in DSP pipelines:** Convert to float early, process in float, convert
to integer only at the final output stage.

### 3.6 Endianness

Multi-byte samples can be stored in:

- **Little-endian (LE):** Least significant byte first (x86, ARM default)
- **Big-endian (BE):** Most significant byte first (network byte order, some AIFF files)

```
  Value: 0x1234 (decimal 4660)

  Little-endian: [0x34][0x12]    (byte 0 = 0x34, byte 1 = 0x12)
  Big-endian:    [0x12][0x34]    (byte 0 = 0x12, byte 1 = 0x34)
```

### 3.7 Common PCM Format Identifiers

These short codes are used by FFmpeg, GStreamer, ALSA, PulseAudio, and other tools:

| Code  | Description                          | Bytes/Sample | Range                 |
| ----- | ------------------------------------ | ------------ | --------------------- |
| U8    | Unsigned 8-bit integer               | 1            | 0 to 255              |
| S16LE | Signed 16-bit integer, little-endian | 2            | -32768 to 32767       |
| S16BE | Signed 16-bit integer, big-endian    | 2            | -32768 to 32767       |
| S24LE | Signed 24-bit integer, little-endian | 3            | -8388608 to 8388607   |
| S32LE | Signed 32-bit integer, little-endian | 4            | -2^31 to 2^31 - 1     |
| F32LE | 32-bit IEEE float, little-endian     | 4            | nominally -1.0 to 1.0 |
| F64LE | 64-bit IEEE float, little-endian     | 8            | nominally -1.0 to 1.0 |

### 3.8 Calculating PCM Data Size

```
Bytes per second = sample_rate * channels * (bit_depth / 8)

Example: CD audio (44100 Hz, 16-bit, stereo)
  = 44100 * 2 * (16/8)
  = 44100 * 2 * 2
  = 176,400 bytes/sec
  = ~10.1 MB/min
  = ~605 MB/hour
```

| Format                       | Bytes/sec | MB/min | MB/hour |
| ---------------------------- | --------- | ------ | ------- |
| 8 kHz, 8-bit, mono           | 8,000     | 0.46   | 27.5    |
| 16 kHz, 16-bit, mono         | 32,000    | 1.83   | 110     |
| 44.1 kHz, 16-bit, stereo     | 176,400   | 10.1   | 605     |
| 48 kHz, 24-bit, stereo       | 288,000   | 16.5   | 989     |
| 48 kHz, 32-bit float, stereo | 384,000   | 22.0   | 1,318   |
| 96 kHz, 24-bit, stereo       | 576,000   | 33.0   | 1,978   |

---

## 4. Audio Channels

### 4.1 Channel Configurations

| Configuration   | Channels | Common Use                      |
| --------------- | -------- | ------------------------------- |
| Mono            | 1        | Phone calls, AM radio, podcasts |
| Stereo          | 2        | Music, most media               |
| 2.1             | 3        | Stereo + subwoofer              |
| 5.1 Surround    | 6        | Home theater, Blu-ray, cinema   |
| 7.1 Surround    | 8        | Premium home theater, cinema    |
| Ambisonic (FOA) | 4        | VR/360 audio (First Order)      |
| Ambisonic (HOA) | 9-64     | VR/360 audio (Higher Order)     |

### 4.2 Standard 5.1 and 7.1 Channel Layout

**5.1 Surround:**

```
                     C (Center)
                       *
                      / \
                     /   \
          FL (Front Left)   FR (Front Right)
            *                 *
            |                 |
            |    [Listener]   |
            |       (*)       |
            |                 |
          SL (Surround Left)  SR (Surround Right)
            *                 *

          LFE (Low Frequency Effects / Subwoofer) = the ".1"
          (position independent -- non-directional bass)
```

**Standard 5.1 channel order (SMPTE/ITU):**

```
Index:  0    1    2    3     4    5
        FL   FR   C    LFE   SL   SR
```

**7.1 Surround adds:**

```
Index:  0    1    2    3     4    5    6    7
        FL   FR   C    LFE   SL   SR   BL   BR

  BL = Back Left
  BR = Back Right
```

### 4.3 Channel Layout in Code

Different frameworks use different channel orderings. Always check the documentation.

| Framework                | 5.1 Order                            |
| ------------------------ | ------------------------------------ |
| WAV/WAVEFORMATEXTENSIBLE | FL, FR, C, LFE, SL, SR               |
| AAC                      | C, FL, FR, SL, SR, LFE               |
| Vorbis                   | FL, C, FR, SL, SR, LFE               |
| FLAC                     | FL, FR, C, LFE, SL, SR (same as WAV) |

**This inconsistency is a common source of bugs.** Always verify channel mapping when
transcoding between formats.

### 4.4 Spatial Audio Basics

Modern spatial audio goes beyond fixed speaker layouts:

- **HRTF (Head-Related Transfer Function):** Models how the shape of the human head
  and ears affects sound arriving from different directions. Used to simulate 3D audio
  over headphones.

- **Binaural audio:** Two-channel audio processed with HRTF to create 3D spatial
  perception over headphones.

- **Ambisonics:** A scene-based format that captures a full-sphere sound field. Can be
  rendered to any speaker layout or binaural headphones. Common in VR/AR.

- **Object-based audio (Dolby Atmos, MPEG-H):** Each sound source is an independent
  "object" with metadata (position, size, trajectory). The renderer places objects in
  the listener's actual speaker configuration.

```
  Channel-based:  Fixed assignment to speakers
  Scene-based:    Full sound field (Ambisonics)
  Object-based:   Individual sources + metadata
```

---

## 5. Audio Formats

### 5.1 Format Categories

```
  Audio Formats
  |
  +-- Container formats (file wrapper)
  |   WAV, AIFF, MKV, MP4, OGG, WebM
  |
  +-- Codec (encoder/decoder algorithm)
      |
      +-- Uncompressed: PCM
      +-- Lossless: FLAC, ALAC, WavPack, APE
      +-- Lossy: MP3, AAC, Opus, Vorbis, AC-3
```

A **container** wraps one or more streams (audio, video, subtitles, metadata).
A **codec** defines how the audio data itself is encoded/decoded.

### 5.2 Uncompressed Formats

#### WAV (Waveform Audio File Format)

- **Container:** RIFF (Resource Interchange File Format)
- **Codec:** PCM (uncompressed) or others
- **Max file size:** 4 GB (RIFF limitation; RF64 removes this)
- **Platform:** Universal, origin Windows
- **Typical use:** Recording, archiving, interchange

WAV file structure:

```
+---------------------------------------------------+
| RIFF Header                                       |
|   "RIFF" | File Size | "WAVE"                    |
+---------------------------------------------------+
| fmt  Chunk                                        |
|   Audio format (1=PCM) | Channels | Sample Rate   |
|   Byte Rate | Block Align | Bits per Sample       |
+---------------------------------------------------+
| data Chunk                                        |
|   Raw PCM samples...                              |
+---------------------------------------------------+
```

#### AIFF (Audio Interchange File Format)

- **Container:** IFF (Interchange File Format)
- **Codec:** PCM (uncompressed) by default
- **Platform:** Origin Apple/Mac
- **Note:** Big-endian byte order (unlike WAV which is little-endian)

### 5.3 Lossless Compressed Formats

These formats reduce file size (typically 50-70% of original) without losing any data.
The decoded output is bit-for-bit identical to the original PCM.

#### FLAC (Free Lossless Audio Codec)

- **Compression:** ~50-60% of original
- **License:** Open source, royalty-free
- **Max:** 8 channels, 32-bit, 655,350 Hz
- **Streaming:** Yes (seekable)
- **Metadata:** Vorbis comments, embedded artwork

#### ALAC (Apple Lossless Audio Codec)

- **Compression:** ~50-60% of original
- **License:** Open source (since 2011), royalty-free
- **Container:** MP4/M4A
- **Ecosystem:** Native Apple support (iTunes, iPhone, etc.)

#### Comparison of Lossless Codecs

| Feature          | FLAC   | ALAC       | WavPack | APE     |
| ---------------- | ------ | ---------- | ------- | ------- |
| Compression      | 50-60% | 50-60%     | 50-70%  | 45-55%  |
| Decode speed     | Fast   | Fast       | Fast    | Slow    |
| Streaming        | Yes    | Yes        | Yes     | Limited |
| Open source      | Yes    | Yes        | Yes     | Yes     |
| Hardware support | Wide   | Apple only | Rare    | Rare    |
| Metadata         | Vorbis | MP4/iTunes | APEv2   | APEv2   |

### 5.4 Lossy Compressed Formats

Lossy codecs discard information deemed inaudible by psychoacoustic models.
The decoded output differs from the original, but the difference should be
imperceptible at sufficient bitrates.

#### MP3 (MPEG-1 Audio Layer III)

- **Release:** 1993
- **Patent status:** All patents expired (as of 2017)
- **Bitrates:** 8-320 kbps (CBR), or VBR
- **Max sample rate:** 48 kHz
- **Channels:** Up to 2 (stereo)
- **Quality:** Good at 192+ kbps; transparent at 320 kbps V0 VBR for most listeners
- **Latency:** High (~100 ms codec delay) -- poor for real-time

#### AAC (Advanced Audio Coding)

- **Release:** 1997 (part of MPEG-2/MPEG-4)
- **Profiles:** LC (Low Complexity), HE-AAC (v1 with SBR, v2 with PS)
- **Bitrates:** 8-529 kbps
- **Quality:** Better than MP3 at equivalent bitrates
- **Container:** MP4/M4A, ADTS
- **Use:** iTunes, YouTube, streaming services, broadcasting

#### Opus

- **Release:** 2012 (IETF RFC 6716)
- **License:** Royalty-free, open standard
- **Bitrates:** 6-510 kbps
- **Sample rates:** 8-48 kHz
- **Channels:** Up to 255
- **Latency:** As low as 2.5 ms (algorithmic delay) -- excellent for real-time
- **Quality:** Best-in-class at nearly all bitrates
- **Use:** WebRTC (mandatory codec), Discord, WhatsApp, Zoom

#### Vorbis

- **Release:** 2000
- **License:** Royalty-free, open source (Xiph.org)
- **Container:** OGG
- **Quality:** Comparable to AAC-LC; better than MP3 at same bitrate
- **Use:** Games, open-source projects, Spotify (legacy)
- **Note:** Largely superseded by Opus for new projects

### 5.5 Comprehensive Format Comparison

| Feature             | MP3       | AAC-LC    | Opus      | Vorbis    | FLAC      |
| ------------------- | --------- | --------- | --------- | --------- | --------- |
| Type                | Lossy     | Lossy     | Lossy     | Lossy     | Lossless  |
| Year                | 1993      | 1997      | 2012      | 2000      | 2001      |
| Royalty-free        | Yes\*     | No        | Yes       | Yes       | Yes       |
| Typical bitrate     | 128-320   | 96-256    | 64-256    | 96-320    | ~800-1200 |
| Transparent quality | ~192 kbps | ~128 kbps | ~96 kbps  | ~160 kbps | Lossless  |
| Max channels        | 2         | 48        | 255       | 255       | 8         |
| Codec latency       | ~100 ms   | ~20-90 ms | 2.5-60 ms | ~10 ms    | ~4-46 ms  |
| Streaming friendly  | Yes       | Yes       | Yes       | Yes       | Yes       |
| Hardware support    | Universal | Wide      | Growing   | Limited   | Moderate  |
| VoIP/RTC suitable   | No        | Marginal  | Excellent | No        | No        |
| Music quality       | Good      | Very Good | Excellent | Very Good | Perfect   |
| Speech quality      | Fair      | Good      | Excellent | Fair      | Perfect   |
| Browser support     | Universal | Wide      | Wide      | Some      | Limited   |
| Container           | MP3       | MP4/ADTS  | OGG/WebM  | OGG       | FLAC/OGG  |

\*MP3 patents expired; was previously royalty-encumbered.

**Recommendation for new projects:**

- **Real-time communication:** Opus (mandatory for WebRTC)
- **Music streaming:** AAC or Opus
- **Archival/mastering:** FLAC
- **Maximum compatibility:** MP3 (legacy) or AAC

---

## 6. Audio Processing Concepts

### 6.1 Gain

**Gain** adjusts the amplitude (volume) of an audio signal. In digital audio:

```
output_sample = input_sample * gain_factor

gain_factor = 1.0    ->  no change
gain_factor = 2.0    ->  +6 dB (doubled amplitude)
gain_factor = 0.5    ->  -6 dB (halved amplitude)
gain_factor = 0.0    ->  silence
```

Converting between linear gain and decibels:

```
gain_dB = 20 * log10(gain_linear)
gain_linear = 10 ^ (gain_dB / 20)
```

**Clipping** occurs when the output exceeds the representable range. In integer PCM,
this causes harsh distortion. In floating-point, values exceed +/- 1.0 and must be
clipped or limited at the output stage.

### 6.2 Equalization (EQ)

EQ adjusts the gain of specific frequency ranges. It is implemented using filters.

```
  Frequency Response of a 3-Band EQ:

  Gain (dB)
    +6 |          ____
    +3 |         /    \
     0 |--------/------\---------/--------
    -3 |                \       /
    -6 |                 \_____/
       +---+----+----+----+----+----+----> Freq
          100  300  1k   3k   10k  20k

       [  Bass  ] [ Mid ] [  Treble  ]
```

Common EQ types:

| Type         | Description                                     |
| ------------ | ----------------------------------------------- |
| Low shelf    | Boost/cut all frequencies below a threshold     |
| High shelf   | Boost/cut all frequencies above a threshold     |
| Peaking/Bell | Boost/cut around a center frequency (with Q)    |
| Low-pass     | Pass frequencies below cutoff, attenuate above  |
| High-pass    | Pass frequencies above cutoff, attenuate below  |
| Band-pass    | Pass a range, attenuate above and below         |
| Notch        | Attenuate a narrow band (opposite of band-pass) |

### 6.3 Filters

Filters are the fundamental building blocks of audio processing.

**Low-pass filter (LPF):**

```
  Gain
  1.0 |--------\
      |         \
      |          \
  0.0 |           \________
      +----+----+----+----> Freq
           fc
           (cutoff)
```

**High-pass filter (HPF):**

```
  Gain
  1.0 |           /--------
      |          /
      |         /
  0.0 |________/
      +----+----+----+----> Freq
           fc
```

**Band-pass filter (BPF):**

```
  Gain
  1.0 |      /----\
      |     /      \
      |    /        \
  0.0 |___/          \____
      +----+----+----+----> Freq
          f1   fc   f2
```

**Key parameters:**

- **Cutoff frequency (fc):** The -3 dB point where the filter transitions
- **Q factor (resonance):** Controls the steepness of the transition
- **Order:** Higher order = steeper roll-off (6 dB/octave per order for Butterworth)

**Common filter implementations:**

- **Biquad filter:** 2nd-order IIR filter. The workhorse of audio DSP. Configurable
  as LPF, HPF, BPF, notch, shelf, or peaking EQ.
- **FIR filter:** Finite Impulse Response. Linear phase, higher latency, often used
  for precise filtering.
- **IIR filter:** Infinite Impulse Response. Lower latency, but can have phase
  distortion. Biquad is a special case of IIR.

### 6.4 Mixing

Combining multiple audio sources into a single output.

```
  Source A:  [...samples_a...]
  Source B:  [...samples_b...]
  Source C:  [...samples_c...]

  Mixed = (samples_a + samples_b + samples_c)
```

**Key considerations:**

- **Summation:** Simply add corresponding samples. The result can exceed the
  representable range (clipping).
- **Attenuation:** Reduce each source by a factor before summing to prevent clipping.
  A common rule of thumb: divide each source by sqrt(N) where N = number of sources.
- **Panning:** Adjusting the relative gain of left/right channels to position a
  source in the stereo field.

```
  Constant-power panning law:
    left_gain  = cos(theta)
    right_gain = sin(theta)

  where theta = 0 (full left) to pi/2 (full right)
```

### 6.5 Resampling (Sample Rate Conversion)

Converting audio from one sample rate to another. This is nontrivial and requires
interpolation.

```
  44100 Hz  ----[Resampler]---->  48000 Hz
```

**Methods (increasing quality and cost):**

| Method               | Quality   | CPU Cost  | Description                                |
| -------------------- | --------- | --------- | ------------------------------------------ |
| Nearest-neighbor     | Poor      | Low       | Pick closest sample                        |
| Linear interpolation | Fair      | Low       | Straight line between samples              |
| Cubic interpolation  | Good      | Medium    | Smooth curve through 4 points              |
| Polyphase FIR        | Excellent | High      | Band-limited interpolation (libsamplerate) |
| Sinc interpolation   | Ideal     | Very high | Theoretically perfect reconstruction       |

**Libraries:**

- **libsamplerate (Secret Rabbit Code):** High-quality resampling in C
- **SoX resampler:** Very high quality
- **speex_resampler:** Good quality, low latency, used in WebRTC

### 6.6 Normalization

Adjusting the overall level of audio to a target.

- **Peak normalization:** Scale so the loudest sample hits a target (e.g., 0 dBFS).
  Simple but does not account for perceived loudness.

- **Loudness normalization (EBU R128 / ITU-R BS.1770):** Scale to a target integrated
  loudness, typically -14 LUFS (streaming) or -23 LUFS (broadcast). This accounts
  for human perception and is the modern standard.

```
  LUFS = Loudness Units Full Scale
  -14 LUFS = Spotify, YouTube target
  -23 LUFS = EBU R128 broadcast target
```

### 6.7 Dynamic Range Compression

Not to be confused with data compression. Dynamic range compression reduces the
difference between the loudest and quietest parts of a signal.

```
  Input/Output Transfer Function:

  Output (dB)
       ^
       |         /
       |        / <- 1:1 (no compression)
       |       /
       |      / _____ <- compressed (e.g., 4:1 ratio)
       |     / /
       |    //
       |   //
       |  //
       +--+-----------> Input (dB)
       Threshold
```

**Parameters:**

| Parameter   | Description                                                |
| ----------- | ---------------------------------------------------------- |
| Threshold   | Level above which compression begins                       |
| Ratio       | Amount of compression (e.g., 4:1 means 4 dB in = 1 dB out) |
| Attack      | How quickly compression engages (ms)                       |
| Release     | How quickly compression disengages (ms)                    |
| Makeup gain | Boost applied after compression to restore level           |
| Knee        | Hard (abrupt) or soft (gradual) transition                 |

**Special cases:**

- **Limiter:** Compressor with infinite (or very high) ratio. Prevents signal from
  exceeding a ceiling.
- **Noise gate:** Opposite of compressor. Silences signal below a threshold.
- **Expander:** Reduces gain below threshold (opposite of compression).

---

## 7. Audio Latency

### 7.1 What Is Audio Latency?

Latency is the delay between an audio event occurring and being heard (or processed).
In real-time applications (VoIP, gaming, live performance), low latency is critical.

### 7.2 Sources of Latency

```
  [Microphone] -> [ADC] -> [OS Buffer] -> [App Buffer] -> [Processing]
       |            |          |              |               |
       v            v          v              v               v
     ~0 ms       ~1 ms     1-20 ms        1-50 ms         0-50 ms

  -> [App Buffer] -> [OS Buffer] -> [DAC] -> [Speaker] -> [Air] -> [Ear]
         |              |            |          |            |
         v              v            v          v            v
       1-50 ms       1-20 ms      ~1 ms      ~0 ms      ~3 ms/m
```

**Total round-trip latency budget for real-time communication:**

| Latency    | Perception                                |
| ---------- | ----------------------------------------- |
| < 20 ms    | Imperceptible, ideal for music monitoring |
| 20-50 ms   | Acceptable for live performance           |
| 50-150 ms  | Noticeable, acceptable for VoIP           |
| 150-300 ms | Distracting, marginal for conversation    |
| > 300 ms   | Unacceptable for real-time interaction    |

### 7.3 Buffer Sizes

Audio I/O works with buffers (blocks of samples). The buffer size directly determines
the minimum latency:

```
  Latency (seconds) = buffer_size (samples) / sample_rate (Hz)
```

| Buffer Size (samples) | Latency at 48 kHz | Latency at 44.1 kHz |
| --------------------- | ----------------- | ------------------- |
| 32                    | 0.67 ms           | 0.73 ms             |
| 64                    | 1.33 ms           | 1.45 ms             |
| 128                   | 2.67 ms           | 2.90 ms             |
| 256                   | 5.33 ms           | 5.80 ms             |
| 512                   | 10.67 ms          | 11.61 ms            |
| 1024                  | 21.33 ms          | 23.22 ms            |
| 2048                  | 42.67 ms          | 46.44 ms            |
| 4096                  | 85.33 ms          | 92.88 ms            |

**The fundamental trade-off:**

```
  Smaller buffers = Lower latency, higher CPU load, risk of underruns (glitches)
  Larger buffers  = Higher latency, lower CPU load, more stable
```

### 7.4 Buffer Underruns and Overruns

- **Underrun (xrun):** The output buffer empties before the application writes new
  data. The audio hardware has nothing to play, resulting in clicks, pops, or silence.

- **Overrun:** The input buffer fills up before the application reads data. Samples
  are lost.

Both cause audible artifacts and must be avoided in real-time audio.

### 7.5 Ring Buffers (Circular Buffers)

Ring buffers are the fundamental data structure for real-time audio I/O. A producer
(e.g., the audio driver) writes to one end, and a consumer (e.g., the application)
reads from the other, without locks in the single-producer, single-consumer case.

```
  Ring Buffer (capacity = 8):

  Write pointer (producer)
       |
       v
  +---+---+---+---+---+---+---+---+
  | 5 | 6 | 7 |   |   | 2 | 3 | 4 |
  +---+---+---+---+---+---+---+---+
                           ^
                           |
                   Read pointer (consumer)

  Data available: 6 samples (from read to write)
  Free space: 2 samples (from write to read)
```

**Properties:**

- Fixed-size buffer, wraps around
- Lock-free in single-producer, single-consumer (SPSC) scenario using atomic
  read/write pointers
- O(1) read and write
- Used by JACK, PortAudio, and virtually all real-time audio systems

**Implementation considerations:**

- Power-of-2 buffer sizes enable efficient modular arithmetic (bitwise AND instead
  of modulo)
- Memory barrier / atomic operations are needed for cross-thread safety
- The buffer should be pre-allocated -- no dynamic allocation in the audio thread

### 7.6 Real-Time Audio Constraints

The audio callback (the function called by the audio driver to request/deliver samples)
runs on a high-priority, deadline-driven thread. Violating these constraints causes
audible glitches:

**NEVER do these in the audio callback:**

- Allocate or free memory (malloc/free, new/delete)
- Lock a mutex (risk of priority inversion)
- File I/O or network I/O
- System calls that may block
- Log to console (may block on I/O)

**ALWAYS:**

- Pre-allocate all buffers before the stream starts
- Use lock-free data structures for cross-thread communication
- Keep processing deterministic and bounded in time
- Process exactly the requested number of samples

---

## 8. Key Libraries and APIs

### 8.1 Platform Audio APIs

```
  +------------------+     +------------------+     +------------------+
  |   Application    |     |   Application    |     |   Application    |
  +--------+---------+     +--------+---------+     +--------+---------+
           |                        |                        |
  +--------v---------+     +--------v---------+     +--------v---------+
  | PortAudio / SDL  |     | PortAudio / SDL  |     | PortAudio / SDL  |
  | (Cross-Platform) |     | (Cross-Platform) |     | (Cross-Platform) |
  +--------+---------+     +--------+---------+     +--------+---------+
           |                        |                        |
  +--------v---------+     +--------v---------+     +--------v---------+
  |   CoreAudio      |     |   PipeWire       |     |   WASAPI         |
  |   (macOS/iOS)    |     |   (Linux)        |     |   (Windows)      |
  +------------------+     +------------------+     +------------------+
```

### 8.2 Linux Audio Stack

```
  Application
       |
       v
  +----------+     +----------+
  | PipeWire | <-> | PulseAudio|  (PipeWire provides PulseAudio compat)
  +----+-----+     +----------+
       |
       v
  +----------+
  |   ALSA   |  (Advanced Linux Sound Architecture)
  +----+-----+
       |
       v
  [ Kernel Driver / Hardware ]
```

| Layer      | Purpose                                    | Latency  |
| ---------- | ------------------------------------------ | -------- |
| ALSA       | Kernel-level audio; direct hardware access | Very low |
| PulseAudio | Desktop audio server; mixing, routing      | Moderate |
| PipeWire   | Modern replacement for PulseAudio + JACK   | Low      |
| JACK       | Pro audio server; low-latency, routing     | Very low |

### 8.3 macOS / iOS: CoreAudio

```
  Application
       |
       v
  +-----------+
  | Audio Unit|  (plugin/processing framework)
  +-----+-----+
        |
        v
  +-----------+
  | AudioQueue|  (high-level playback/recording)
  | or AVAudio|  (Swift/ObjC high-level API)
  +-----+-----+
        |
        v
  +-----------+
  | CoreAudio |  (HAL - Hardware Abstraction Layer)
  +-----------+
```

- **AudioToolbox:** Codec support, file I/O
- **AVFoundation:** High-level media framework
- **Audio Units (AU):** Plugin format and real-time processing nodes

### 8.4 Windows: WASAPI

```
  Application
       |
       +--------> WASAPI Shared Mode (mixing with other apps, ~10-30 ms)
       |
       +--------> WASAPI Exclusive Mode (direct hardware, ~3-10 ms)
       |
       v
  [ Windows Audio Session API ]
       |
       v
  [ Kernel Streaming / Hardware ]
```

- **WASAPI Shared Mode:** Audio is mixed by Windows with other applications.
  Higher latency but cooperative.
- **WASAPI Exclusive Mode:** Application gets exclusive access to the audio device.
  Lower latency but no other app can use the device.
- **ASIO:** Third-party low-latency protocol (Steinberg). Bypasses Windows audio
  stack entirely. Used in professional DAWs.

### 8.5 Cross-Platform Libraries

| Library    | Language | License               | Notes                                       |
| ---------- | -------- | --------------------- | ------------------------------------------- |
| PortAudio  | C        | MIT                   | Mature, widely used, callback-based         |
| SDL Audio  | C        | zlib                  | Part of SDL; simple, good for games         |
| RtAudio    | C++      | MIT                   | C++ alternative to PortAudio                |
| miniaudio  | C        | MIT/Public            | Single-header, excellent for small projects |
| libsoundio | C        | MIT                   | Modern design, supports PipeWire            |
| JUCE       | C++      | Dual (GPL/commercial) | Full audio app framework                    |
| Oboe       | C++      | Apache 2.0            | Android-specific, low-latency               |

### 8.6 Web Audio API (Brief)

The Web Audio API provides audio processing in the browser via JavaScript.

```javascript
// Create audio context
const audioCtx = new AudioContext({ sampleRate: 48000 });

// Create oscillator
const oscillator = audioCtx.createOscillator();
oscillator.type = 'sine';
oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);

// Connect to output
oscillator.connect(audioCtx.destination);
oscillator.start();
```

**Key concepts:**

- **AudioContext:** The main entry point; manages all audio operations
- **AudioNode:** Processing nodes connected in a graph (source -> effects -> destination)
- **AudioWorklet:** Custom processing in a dedicated audio thread (replaces
  deprecated ScriptProcessorNode)
- **MediaStream:** Integration with WebRTC for real-time communication

The Web Audio API will be covered in detail in a dedicated document.

### 8.7 FFmpeg (Command-Line Reference)

FFmpeg is the Swiss Army knife of audio/video processing.

```bash
# Convert WAV to FLAC
ffmpeg -i input.wav -codec:a flac output.flac

# Convert to Opus at 128 kbps
ffmpeg -i input.wav -codec:a libopus -b:a 128k output.opus

# Resample from 44.1 kHz to 48 kHz
ffmpeg -i input.wav -ar 48000 output.wav

# Extract audio from video
ffmpeg -i video.mp4 -vn -codec:a copy output.aac

# Generate a 440 Hz sine wave (5 seconds, 48 kHz, 16-bit)
ffmpeg -f lavfi -i "sine=frequency=440:duration=5:sample_rate=48000" \
       -codec:a pcm_s16le output.wav

# Show audio stream info
ffprobe -show_streams -select_streams a input.wav
```

---

## 9. Code Examples

### 9.1 Python: Generate a Sine Wave and Write to WAV

```python
"""
Generate a pure sine wave tone and write it to a WAV file.
No external dependencies required -- uses only the Python standard library.
"""

import struct
import wave
import math


def generate_sine_wav(
    filename: str,
    frequency: float = 440.0,
    duration: float = 3.0,
    sample_rate: int = 44100,
    amplitude: float = 0.8,
    bit_depth: int = 16,
) -> None:
    """
    Generate a sine wave and write it to a WAV file.

    Args:
        filename:    Output WAV file path.
        frequency:   Tone frequency in Hz.
        duration:    Duration in seconds.
        sample_rate: Samples per second.
        amplitude:   Peak amplitude (0.0 to 1.0).
        bit_depth:   Bits per sample (8 or 16).
    """
    num_samples = int(sample_rate * duration)
    num_channels = 1  # Mono

    # Calculate max integer value for the bit depth
    if bit_depth == 16:
        max_val = 32767
        struct_format = "<h"  # signed 16-bit little-endian
        sample_width = 2
    elif bit_depth == 8:
        max_val = 127
        struct_format = "B"  # unsigned 8-bit
        sample_width = 1
    else:
        raise ValueError(f"Unsupported bit depth: {bit_depth}")

    # Generate samples
    samples = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        value = amplitude * math.sin(2.0 * math.pi * frequency * t)

        if bit_depth == 16:
            int_value = int(value * max_val)
            int_value = max(-32768, min(32767, int_value))
            samples.extend(struct.pack(struct_format, int_value))
        else:
            # 8-bit WAV is unsigned, centered at 128
            int_value = int(value * max_val) + 128
            int_value = max(0, min(255, int_value))
            samples.extend(struct.pack(struct_format, int_value))

    # Write WAV file
    with wave.open(filename, "wb") as wav_file:
        wav_file.setnchannels(num_channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(bytes(samples))

    file_size = len(samples) + 44  # 44 bytes for WAV header
    print(f"Written: {filename}")
    print(f"  Frequency:   {frequency} Hz")
    print(f"  Duration:    {duration} s")
    print(f"  Sample rate: {sample_rate} Hz")
    print(f"  Bit depth:   {bit_depth}")
    print(f"  Samples:     {num_samples}")
    print(f"  File size:   {file_size} bytes ({file_size / 1024:.1f} KB)")


# Generate a 440 Hz tone (concert A)
generate_sine_wav("tone_440hz.wav", frequency=440.0, duration=3.0)

# Generate a 1 kHz test tone at 48 kHz sample rate
generate_sine_wav(
    "tone_1khz_48k.wav",
    frequency=1000.0,
    duration=2.0,
    sample_rate=48000,
)
```

### 9.2 Python: Read and Analyze a WAV File

```python
"""
Read a WAV file and print its properties and basic statistics.
"""

import wave
import struct
import math


def analyze_wav(filename: str) -> None:
    """Read a WAV file and print detailed information."""
    with wave.open(filename, "rb") as wav_file:
        num_channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        num_frames = wav_file.getnframes()
        compression = wav_file.getcomptype()

        raw_data = wav_file.readframes(num_frames)

    bit_depth = sample_width * 8
    duration = num_frames / sample_rate
    total_samples = num_frames * num_channels
    data_size = total_samples * sample_width

    print(f"File: {filename}")
    print(f"  Channels:     {num_channels} ({'mono' if num_channels == 1 else 'stereo'})")
    print(f"  Sample rate:  {sample_rate} Hz")
    print(f"  Bit depth:    {bit_depth}-bit")
    print(f"  Frames:       {num_frames}")
    print(f"  Duration:     {duration:.3f} seconds")
    print(f"  Data size:    {data_size} bytes ({data_size / 1024:.1f} KB)")
    print(f"  Compression:  {compression}")

    # Decode samples based on bit depth
    if bit_depth == 16:
        fmt = f"<{total_samples}h"  # signed 16-bit little-endian
        samples = struct.unpack(fmt, raw_data)
        max_possible = 32767.0
    elif bit_depth == 8:
        samples = [b - 128 for b in raw_data]  # convert unsigned to signed
        max_possible = 127.0
    else:
        print(f"  (Analysis not supported for {bit_depth}-bit)")
        return

    # Calculate statistics
    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))

    peak_db = 20 * math.log10(peak / max_possible) if peak > 0 else float("-inf")
    rms_db = 20 * math.log10(rms / max_possible) if rms > 0 else float("-inf")

    print(f"  Peak level:   {peak} ({peak_db:.1f} dBFS)")
    print(f"  RMS level:    {rms:.1f} ({rms_db:.1f} dBFS)")
    print(f"  Crest factor: {peak_db - rms_db:.1f} dB")


analyze_wav("tone_440hz.wav")
```

### 9.3 Python: Mix Two Audio Signals

```python
"""
Mix two sine waves at different frequencies into a single WAV file.
Demonstrates basic audio mixing with gain control.
"""

import math
import struct
import wave


def generate_samples(
    frequency: float,
    duration: float,
    sample_rate: int,
    amplitude: float,
) -> list[float]:
    """Generate floating-point samples for a sine wave."""
    num_samples = int(sample_rate * duration)
    return [
        amplitude * math.sin(2.0 * math.pi * frequency * (i / sample_rate))
        for i in range(num_samples)
    ]


def mix_and_write(
    filename: str,
    sources: list[list[float]],
    sample_rate: int = 44100,
) -> None:
    """Mix multiple float sample lists and write to 16-bit WAV."""
    if not sources:
        return

    length = min(len(s) for s in sources)
    num_sources = len(sources)

    # Mix with equal gain, normalized to prevent clipping
    gain = 1.0 / math.sqrt(num_sources)

    samples = bytearray()
    for i in range(length):
        mixed = sum(s[i] for s in sources) * gain
        int_val = int(mixed * 32767)
        int_val = max(-32768, min(32767, int_val))
        samples.extend(struct.pack("<h", int_val))

    with wave.open(filename, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(bytes(samples))

    print(f"Mixed {num_sources} sources -> {filename}")


# Create a chord: A4 (440 Hz) + C#5 (554.37 Hz) + E5 (659.25 Hz)
sample_rate = 44100
duration = 3.0

sources = [
    generate_samples(440.00, duration, sample_rate, 0.8),   # A4
    generate_samples(554.37, duration, sample_rate, 0.8),   # C#5
    generate_samples(659.25, duration, sample_rate, 0.8),   # E5
]

mix_and_write("chord_a_major.wav", sources, sample_rate)
```

### 9.4 C: Reading and Processing PCM Audio Samples

```c
/*
 * read_wav.c -- Read a 16-bit PCM WAV file and print sample statistics.
 *
 * Compile: gcc -o read_wav read_wav.c -lm
 * Usage:   ./read_wav input.wav
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

/* WAV file header (44 bytes for standard PCM) */
typedef struct {
    char     riff_tag[4];       /* "RIFF"                 */
    uint32_t file_size;         /* File size - 8           */
    char     wave_tag[4];       /* "WAVE"                 */
    char     fmt_tag[4];        /* "fmt "                 */
    uint32_t fmt_size;          /* Format chunk size (16)  */
    uint16_t audio_format;      /* 1 = PCM                */
    uint16_t num_channels;      /* 1 = mono, 2 = stereo   */
    uint32_t sample_rate;       /* e.g., 44100            */
    uint32_t byte_rate;         /* sample_rate * channels * bps/8 */
    uint16_t block_align;       /* channels * bps/8       */
    uint16_t bits_per_sample;   /* 8, 16, 24, 32          */
    char     data_tag[4];       /* "data"                 */
    uint32_t data_size;         /* Size of audio data      */
} wav_header_t;

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <input.wav>\n", argv[0]);
        return 1;
    }

    FILE *fp = fopen(argv[1], "rb");
    if (!fp) {
        perror("Failed to open file");
        return 1;
    }

    /* Read header */
    wav_header_t header;
    if (fread(&header, sizeof(wav_header_t), 1, fp) != 1) {
        fprintf(stderr, "Failed to read WAV header\n");
        fclose(fp);
        return 1;
    }

    /* Validate */
    if (memcmp(header.riff_tag, "RIFF", 4) != 0 ||
        memcmp(header.wave_tag, "WAVE", 4) != 0) {
        fprintf(stderr, "Not a valid WAV file\n");
        fclose(fp);
        return 1;
    }

    if (header.audio_format != 1) {
        fprintf(stderr, "Not PCM format (format=%u)\n", header.audio_format);
        fclose(fp);
        return 1;
    }

    if (header.bits_per_sample != 16) {
        fprintf(stderr, "Only 16-bit supported (got %u-bit)\n",
                header.bits_per_sample);
        fclose(fp);
        return 1;
    }

    /* Print info */
    uint32_t num_samples = header.data_size / (header.bits_per_sample / 8);
    uint32_t num_frames  = num_samples / header.num_channels;
    double   duration    = (double)num_frames / header.sample_rate;

    printf("File:        %s\n", argv[1]);
    printf("Channels:    %u\n", header.num_channels);
    printf("Sample rate: %u Hz\n", header.sample_rate);
    printf("Bit depth:   %u\n", header.bits_per_sample);
    printf("Frames:      %u\n", num_frames);
    printf("Duration:    %.3f seconds\n", duration);

    /* Read samples */
    int16_t *samples = malloc(num_samples * sizeof(int16_t));
    if (!samples) {
        fprintf(stderr, "Memory allocation failed\n");
        fclose(fp);
        return 1;
    }

    size_t read_count = fread(samples, sizeof(int16_t), num_samples, fp);
    fclose(fp);

    if (read_count != num_samples) {
        fprintf(stderr, "Warning: expected %u samples, read %zu\n",
                num_samples, read_count);
    }

    /* Calculate statistics */
    int32_t peak = 0;
    double  sum_sq = 0.0;

    for (uint32_t i = 0; i < (uint32_t)read_count; i++) {
        int32_t abs_val = abs((int32_t)samples[i]);
        if (abs_val > peak) {
            peak = abs_val;
        }
        sum_sq += (double)samples[i] * (double)samples[i];
    }

    double rms = sqrt(sum_sq / read_count);
    double peak_db = (peak > 0) ? 20.0 * log10((double)peak / 32767.0) : -INFINITY;
    double rms_db  = (rms > 0)  ? 20.0 * log10(rms / 32767.0) : -INFINITY;

    printf("Peak:        %d (%.1f dBFS)\n", peak, peak_db);
    printf("RMS:         %.1f (%.1f dBFS)\n", rms, rms_db);

    free(samples);
    return 0;
}
```

### 9.5 C: Simple Ring Buffer for Audio

```c
/*
 * ring_buffer.h -- Lock-free single-producer single-consumer ring buffer
 *                  for real-time audio applications.
 */

#ifndef RING_BUFFER_H
#define RING_BUFFER_H

#include <stdint.h>
#include <stdatomic.h>
#include <string.h>
#include <stdlib.h>

typedef struct {
    float          *buffer;
    uint32_t        capacity;    /* Must be power of 2 */
    uint32_t        mask;        /* capacity - 1       */
    atomic_uint_fast32_t write_pos;
    atomic_uint_fast32_t read_pos;
} ring_buffer_t;

static inline ring_buffer_t *ring_buffer_create(uint32_t capacity) {
    /* Ensure power of 2 */
    if (capacity == 0 || (capacity & (capacity - 1)) != 0) {
        return NULL;
    }

    ring_buffer_t *rb = calloc(1, sizeof(ring_buffer_t));
    if (!rb) return NULL;

    rb->buffer   = calloc(capacity, sizeof(float));
    if (!rb->buffer) {
        free(rb);
        return NULL;
    }

    rb->capacity  = capacity;
    rb->mask      = capacity - 1;
    atomic_store(&rb->write_pos, 0);
    atomic_store(&rb->read_pos, 0);

    return rb;
}

static inline void ring_buffer_destroy(ring_buffer_t *rb) {
    if (rb) {
        free(rb->buffer);
        free(rb);
    }
}

static inline uint32_t ring_buffer_available_read(const ring_buffer_t *rb) {
    uint32_t w = atomic_load(&rb->write_pos);
    uint32_t r = atomic_load(&rb->read_pos);
    return (w - r) & rb->mask;
}

static inline uint32_t ring_buffer_available_write(const ring_buffer_t *rb) {
    return rb->capacity - 1 - ring_buffer_available_read(rb);
}

/* Write samples (producer side) */
static inline uint32_t ring_buffer_write(ring_buffer_t *rb,
                                         const float *data,
                                         uint32_t count) {
    uint32_t avail = ring_buffer_available_write(rb);
    if (count > avail) count = avail;

    uint32_t w = atomic_load(&rb->write_pos);

    for (uint32_t i = 0; i < count; i++) {
        rb->buffer[(w + i) & rb->mask] = data[i];
    }

    atomic_store(&rb->write_pos, (w + count) & rb->mask);
    return count;
}

/* Read samples (consumer side) */
static inline uint32_t ring_buffer_read(ring_buffer_t *rb,
                                        float *data,
                                        uint32_t count) {
    uint32_t avail = ring_buffer_available_read(rb);
    if (count > avail) count = avail;

    uint32_t r = atomic_load(&rb->read_pos);

    for (uint32_t i = 0; i < count; i++) {
        data[i] = rb->buffer[(r + i) & rb->mask];
    }

    atomic_store(&rb->read_pos, (r + count) & rb->mask);
    return count;
}

#endif /* RING_BUFFER_H */
```

---

## 10. Common Interview Questions

### Q1: What is the Nyquist theorem and why does it matter?

**A:** The Nyquist-Shannon sampling theorem states that to perfectly reconstruct a
band-limited analog signal from its digital samples, the sampling rate must be at
least twice the highest frequency component in the signal (fs >= 2 \* f_max).
The frequency fs/2 is called the Nyquist frequency.

This matters because:

- It determines the minimum sample rate for faithful digitization
- Violating it causes aliasing (high frequencies masquerading as low frequencies)
- It explains why CD audio uses 44.1 kHz (just above 2 \* 20 kHz human hearing limit)
- Anti-aliasing filters are required before the ADC to enforce this constraint

---

### Q2: Why is CD audio sampled at 44.1 kHz specifically, not 40 kHz?

**A:** The theoretical minimum is 40 kHz (2 \* 20 kHz). However, real anti-aliasing
filters cannot have an infinitely sharp cutoff. The extra 4.1 kHz provides a
transition band for the filter to roll off from passband to stopband. The specific
value of 44,100 Hz was also influenced by its compatibility with video frame rates
used in early digital recording systems (both NTSC and PAL).

---

### Q3: What is quantization noise and how is it different from analog noise?

**A:** Quantization noise is the error introduced when mapping a continuous-amplitude
signal to discrete levels during digitization. For each sample, the actual value is
rounded to the nearest quantization level, creating a small error.

Unlike analog noise (thermal, electromagnetic), quantization noise is deterministic
and correlated with the signal, which can make it sound like distortion rather than
random hiss. Dithering (adding small random noise before quantization) breaks this
correlation, converting the distortion into uncorrelated noise that is perceptually
less objectionable.

The SNR from quantization is approximately 6.02 \* N + 1.76 dB, where N is the bit
depth. So 16-bit gives ~96 dB SNR and 24-bit gives ~144 dB SNR.

---

### Q4: Explain the difference between interleaved and planar audio formats.

**A:** In **interleaved** format, samples for all channels alternate in memory:
`[L0][R0][L1][R1][L2][R2]...`. This is the native format for most audio hardware
and file formats like WAV.

In **planar** format, all samples for each channel are stored contiguously:
`[L0][L1][L2]...[R0][R1][R2]...`. This is better for SIMD processing since you
can operate on all samples of one channel without stride.

Interleaved is standard for I/O; planar is often preferred for internal DSP
processing. Many audio frameworks (FFmpeg, Web Audio) convert between them.

---

### Q5: What is the difference between lossy and lossless audio compression?

**A:** **Lossless** compression (FLAC, ALAC) reduces file size without losing any
information. The decompressed output is bit-for-bit identical to the original PCM.
Typical compression ratio is 50-70% of original size.

**Lossy** compression (MP3, AAC, Opus) permanently discards information deemed
inaudible by psychoacoustic models (masking, hearing sensitivity curves). The
decoded output differs from the original but should be perceptually transparent
at sufficient bitrates. Typical compression ratio is 5-20% of original size.

---

### Q6: Why is Opus preferred over MP3 for real-time communication?

**A:** Several reasons:

1. **Latency:** Opus has algorithmic delay as low as 2.5 ms vs ~100 ms for MP3.
2. **Bitrate efficiency:** Opus achieves transparent quality at lower bitrates.
3. **Adaptability:** Opus seamlessly transitions between SILK (speech) and CELT
   (music) engines depending on content.
4. **Bandwidth flexibility:** Supports 6-510 kbps and 8-48 kHz sample rates.
5. **Packet loss resilience:** Built-in forward error correction for lossy networks.
6. **WebRTC mandate:** Opus is the mandatory-to-implement codec in WebRTC.

---

### Q7: What happens during a buffer underrun?

**A:** A buffer underrun occurs when the audio output device needs more samples to
play, but the application has not provided them in time. The device's playback
buffer runs empty.

The result is an audible artifact -- a click, pop, or brief silence. The audio
hardware may repeat the last sample, output zeros, or produce an undefined value.

Underruns are typically caused by: too-small buffer sizes, excessive processing
in the audio callback, blocking operations (I/O, locking, memory allocation) in
the audio thread, or the system being under heavy load.

The fix is to increase buffer sizes (at the cost of latency), optimize processing,
and strictly avoid blocking operations in the audio callback.

---

### Q8: Why should you never allocate memory in an audio callback?

**A:** Memory allocation (malloc/new) is not real-time safe because:

1. **Non-deterministic timing:** The allocator may need to search free lists, coalesce
   blocks, or request memory from the OS, all of which take unpredictable time.
2. **System calls:** Allocation may trigger system calls (mmap, sbrk) that can block.
3. **Lock contention:** The heap allocator uses a mutex that may be held by another
   thread, causing priority inversion.
4. **Page faults:** Newly allocated memory may not be physically mapped yet, causing
   a page fault that stalls the thread.

Any of these can cause the audio callback to miss its deadline, resulting in a
buffer underrun and audible glitch. Instead, pre-allocate all buffers before
starting the audio stream and use lock-free data structures for communication
between threads.

---

### Q9: How does psychoacoustic masking help audio compression?

**A:** Psychoacoustic masking means that the presence of one sound can make another
sound inaudible to human listeners. Lossy codecs exploit this in two ways:

1. **Simultaneous masking:** A loud tone masks quieter tones at nearby frequencies.
   The codec can discard or coarsely quantize masked frequency components since
   they are inaudible.

2. **Temporal masking:** A loud sound masks quieter sounds that occur slightly before
   (pre-masking, ~5 ms) and after (post-masking, ~100-200 ms) it.

The codec analyzes each frame using a psychoacoustic model, calculates the masking
threshold at each frequency, and allocates bits only to components above the
threshold. This allows MP3, AAC, and Opus to achieve 10-20x compression while
maintaining perceptual transparency.

---

### Q10: What is the difference between sample rate and bit rate?

**A:** **Sample rate** (measured in Hz) is the number of audio samples captured per
second per channel. It determines the maximum frequency that can be represented
(Nyquist frequency = sample_rate / 2).

**Bit rate** (measured in bits per second, bps) is the total number of bits used
to represent the audio per second, across all channels. For uncompressed PCM:

```
bit_rate = sample_rate * channels * bit_depth
```

For compressed formats, bit rate is the output rate of the codec, which is much
lower than the equivalent PCM bit rate. For example:

- CD audio (44.1 kHz, 16-bit, stereo): 1,411,200 bps (~1,411 kbps)
- MP3 at 128 kbps: 128,000 bps (about 11x compression)

---

### Q11: Explain dithering and when you would use it.

**A:** Dithering is the intentional addition of low-level noise to an audio signal
before quantization (reducing bit depth). Without dithering, quantization error is
correlated with the signal, producing harmonic distortion that is audible,
especially on quiet passages and fade-outs.

By adding a small random signal (typically triangular probability density function,
TPDF), the quantization error becomes uncorrelated random noise, which is
perceptually much less objectionable than distortion.

**When to use dithering:**

- Converting from 24-bit to 16-bit for CD mastering
- Converting from 32-bit float to any integer format for final output
- Any time you reduce bit depth in the signal chain

**When NOT to use dithering:**

- If more processing will follow (dither only at the final stage)
- If the signal is already at the target bit depth

---

### Q12: A WAV file is 10 MB. How long is the audio if it is 44.1 kHz, 16-bit, stereo?

**A:**

```
Data size ~= 10 MB - 44 bytes header = ~10,485,716 bytes (approx 10 MB)

Bytes per second = sample_rate * channels * (bit_depth / 8)
                 = 44100 * 2 * 2
                 = 176,400 bytes/sec

Duration = data_size / bytes_per_sec
         = 10,485,716 / 176,400
         ~= 59.4 seconds (about 1 minute)
```

---

### Q13: What is a biquad filter and why is it so commonly used in audio?

**A:** A biquad filter is a second-order IIR (Infinite Impulse Response) filter
defined by 5 coefficients (b0, b1, b2, a1, a2). Its transfer function is:

```
H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
```

It is ubiquitous in audio because:

1. **Versatility:** By changing coefficients, the same structure implements low-pass,
   high-pass, band-pass, notch, peaking EQ, and shelf filters.
2. **Efficiency:** Only 5 multiplications and 4 additions per sample.
3. **Low latency:** Processes one sample at a time with minimal delay.
4. **Cascadability:** Higher-order filters are built by cascading multiple biquads.
5. **Numerical stability:** Well-understood stability criteria.

Robert Bristow-Johnson's "Audio EQ Cookbook" provides the standard coefficient
formulas used throughout the industry.

---

### Q14: How would you detect silence in an audio stream?

**A:** Calculate the RMS (Root Mean Square) energy of each audio frame and compare
it against a threshold:

```python
import math

def is_silence(samples: list[float], threshold_db: float = -40.0) -> bool:
    """Check if a frame of audio samples is silence."""
    if not samples:
        return True

    rms = math.sqrt(sum(s * s for s in samples) / len(samples))

    if rms == 0:
        return True

    rms_db = 20 * math.log10(rms)
    return rms_db < threshold_db
```

Considerations:

- The threshold depends on the application (~-40 dBFS for speech detection,
  ~-60 dBFS for noise gate)
- Use a hold time to avoid rapid toggling (e.g., require 200+ ms of silence)
- Consider frequency weighting (A-weighting) to match human perception
- WebRTC's Voice Activity Detection (VAD) uses more sophisticated methods

---

### Q15: What are the key differences between PulseAudio and PipeWire?

**A:**

| Aspect           | PulseAudio           | PipeWire                         |
| ---------------- | -------------------- | -------------------------------- |
| Purpose          | Desktop audio server | Unified audio/video server       |
| Latency          | ~20-50 ms typical    | ~5-10 ms typical                 |
| Pro audio        | Not suitable         | Replaces JACK for pro audio      |
| Video            | Audio only           | Audio and video (screen sharing) |
| Compatibility    | PulseAudio API only  | PulseAudio + JACK compat layers  |
| Session handling | Per-user daemon      | Per-user daemon                  |
| Sandbox support  | Limited              | First-class (Flatpak, portals)   |
| Status           | Maintenance mode     | Active development, default in   |
|                  |                      | Fedora, Ubuntu 22.10+            |

PipeWire is the modern replacement that unifies PulseAudio (desktop audio),
JACK (pro audio), and video handling into a single low-latency framework.

---

## Summary

This document covered the foundational concepts of digital audio:

1. **Sound** is a pressure wave with frequency, amplitude, wavelength, and speed
2. **ADC/DAC** convert between analog and digital using sampling and quantization
3. **PCM** is the standard uncompressed digital representation with defined sample
   format, rate, channels, and byte order
4. **Channel layouts** range from mono to immersive spatial audio
5. **Audio formats** span uncompressed (WAV), lossless (FLAC), and lossy (Opus, AAC)
6. **Processing** includes gain, filtering, EQ, mixing, resampling, and compression
7. **Latency** is the critical constraint for real-time audio, governed by buffer sizes
8. **Platform APIs** and cross-platform libraries provide the interface to audio hardware

These fundamentals underpin everything in audio/video engineering, from WebRTC calls
to music production to game audio engines. Master them before moving on to codec
internals, WebRTC, or audio DSP.

---

_Next: 02-DIGITAL-VIDEO-FUNDAMENTALS.md_
