# Web Audio and Video APIs: A Comprehensive Guide for Software Engineers

## Table of Contents

1. [HTML5 Media Elements](#1-html5-media-elements)
2. [Media Source Extensions (MSE)](#2-media-source-extensions-mse)
3. [Encrypted Media Extensions (EME)](#3-encrypted-media-extensions-eme)
4. [Web Audio API](#4-web-audio-api)
5. [AudioWorklet Deep Dive](#5-audioworklet-deep-dive)
6. [Canvas and Video](#6-canvas-and-video)
7. [WebCodecs API](#7-webcodecs-api)
8. [MediaStream API](#8-mediastream-api)
9. [MediaRecorder API](#9-mediarecorder-api)
10. [Picture-in-Picture API](#10-picture-in-picture-api)
11. [WebTransport and WebCodecs for Streaming](#11-webtransport-and-webcodecs-for-streaming)
12. [Complete Code Examples](#12-complete-code-examples)
13. [Common Interview Questions](#13-common-interview-questions)

---

## 1. HTML5 Media Elements

### The `<audio>` and `<video>` Elements

HTML5 introduced native media playback without plugins. Before HTML5, browsers relied on Flash or Silverlight. The `<audio>` and `<video>` elements provide a declarative, standards-based approach.

```html
<video
  id="myVideo"
  src="video.mp4"
  controls
  width="640"
  height="360"
  poster="thumbnail.jpg"
  preload="metadata"
>
  <!-- Fallback sources for format compatibility -->
  <source src="video.webm" type="video/webm" />
  <source src="video.mp4" type="video/mp4" />
  <track kind="subtitles" src="subs_en.vtt" srclang="en" label="English" />
  Your browser does not support the video element.
</video>

<audio id="myAudio" controls preload="auto">
  <source src="audio.opus" type="audio/opus" />
  <source src="audio.mp3" type="audio/mpeg" />
  Your browser does not support the audio element.
</audio>
```

### Key Attributes

| Attribute     | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `src`         | URL of the media resource. Can also be set via `<source>` children.         |
| `controls`    | Boolean. Shows built-in browser playback controls.                          |
| `autoplay`    | Boolean. Begins playback automatically. Most browsers block unmuted auto.   |
| `muted`       | Boolean. Starts with audio muted. Required for autoplay in most browsers.   |
| `loop`        | Boolean. Restarts playback when the media reaches the end.                  |
| `preload`     | Hint: `none`, `metadata`, or `auto`. Controls how much data to fetch early. |
| `poster`      | (Video only) URL of image shown before playback starts.                     |
| `crossorigin` | `anonymous` or `use-credentials`. Required for CORS-restricted resources.   |
| `playsinline` | (Mobile) Allows inline playback instead of forcing fullscreen.              |

### Autoplay Policy

Modern browsers enforce strict autoplay policies. Unmuted autoplay is blocked unless the user has previously interacted with the site. The safest pattern:

```html
<!-- This reliably autoplays across browsers -->
<video autoplay muted playsinline src="background.mp4"></video>
```

To programmatically attempt autoplay with fallback:

```javascript
const video = document.getElementById('myVideo');
video.muted = true;

const playPromise = video.play();
if (playPromise !== undefined) {
  playPromise.catch((error) => {
    // Autoplay was blocked. Show a play button to the user.
    console.warn('Autoplay blocked:', error.message);
    showPlayButton();
  });
}
```

### Media Events

The HTMLMediaElement fires a rich set of events during its lifecycle:

```javascript
const video = document.querySelector('video');

// Metadata has loaded (duration, dimensions available)
video.addEventListener('loadedmetadata', () => {
  console.log(`Duration: ${video.duration}s`);
  console.log(`Dimensions: ${video.videoWidth}x${video.videoHeight}`);
});

// Enough data buffered to begin playback
video.addEventListener('canplay', () => {
  console.log('Ready to play');
});

// Enough data buffered for uninterrupted playback
video.addEventListener('canplaythrough', () => {
  console.log('Can play through without buffering');
});

// Playback started
video.addEventListener('play', () => {
  console.log('Playback started');
});

// Playback paused
video.addEventListener('pause', () => {
  console.log('Playback paused');
});

// Current playback position changed (fires frequently during playback)
video.addEventListener('timeupdate', () => {
  updateProgressBar(video.currentTime / video.duration);
});

// Playback reached the end
video.addEventListener('ended', () => {
  console.log('Playback finished');
  showReplayButton();
});

// User is seeking
video.addEventListener('seeking', () => {
  showLoadingSpinner();
});

// Seeking completed
video.addEventListener('seeked', () => {
  hideLoadingSpinner();
});

// Playback stalled waiting for data
video.addEventListener('waiting', () => {
  showBufferingIndicator();
});

// Error occurred during loading or playback
video.addEventListener('error', () => {
  const error = video.error;
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      console.error('Playback aborted by user');
      break;
    case MediaError.MEDIA_ERR_NETWORK:
      console.error('Network error during download');
      break;
    case MediaError.MEDIA_ERR_DECODE:
      console.error('Decoding error');
      break;
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      console.error('Format not supported');
      break;
  }
});

// Data is being fetched
video.addEventListener('progress', () => {
  if (video.buffered.length > 0) {
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const bufferedPercent = (bufferedEnd / video.duration) * 100;
    updateBufferBar(bufferedPercent);
  }
});
```

### HTMLMediaElement API

The API provides full programmatic control over media playback:

```javascript
const video = document.querySelector('video');

// Playback control
video.play(); // Returns a Promise
video.pause();
video.load(); // Reloads the media resource

// Position and duration
video.currentTime = 30; // Seek to 30 seconds
console.log(video.duration); // Total duration in seconds
console.log(video.paused); // Boolean: is paused?
console.log(video.ended); // Boolean: has ended?

// Playback rate
video.playbackRate = 1.5; // 1.5x speed
video.defaultPlaybackRate = 1.0;

// Volume control
video.volume = 0.8; // 0.0 to 1.0
video.muted = false;

// Network state
console.log(video.networkState); // NETWORK_EMPTY, NETWORK_IDLE, NETWORK_LOADING, NETWORK_NO_SOURCE
console.log(video.readyState); // HAVE_NOTHING through HAVE_ENOUGH_DATA

// Buffered ranges (TimeRanges object)
for (let i = 0; i < video.buffered.length; i++) {
  console.log(
    `Buffered: ${video.buffered.start(i)} - ${video.buffered.end(i)}`
  );
}

// Text tracks (subtitles, captions)
const tracks = video.textTracks;
if (tracks.length > 0) {
  tracks[0].mode = 'showing'; // 'disabled', 'hidden', 'showing'
}
```

---

## 2. Media Source Extensions (MSE)

### Why MSE Exists

The basic `<video>` element works with a single URL. However, modern streaming demands:

- **Adaptive bitrate streaming (ABR)**: Switching quality levels based on network conditions.
- **Live streaming**: Continuously appending new segments.
- **DRM integration**: Feeding encrypted segments to EME.
- **Gapless playback**: Stitching segments without glitches.

MSE provides a JavaScript API to feed raw media segments to the browser's media pipeline, enabling custom player logic that sits between the network layer and the decoder.

### Architecture Overview

```
Network (fetch/XHR)
       |
       v
  JavaScript (MSE logic)
       |
       v
  MediaSource --> SourceBuffer(s)
       |
       v
  <video> element (decoding + rendering)
```

### MediaSource API

```javascript
// Check support
if (
  !('MediaSource' in window) ||
  !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
) {
  console.error('MSE not supported for this codec');
}

const video = document.querySelector('video');
const mediaSource = new MediaSource();

// Create an object URL and assign it to the video element
video.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
  // MediaSource is ready to receive data
  const mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
  const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

  // Fetch and append the initialization segment
  fetchSegment('init.mp4').then((initData) => {
    sourceBuffer.appendBuffer(initData);
  });
});
```

### SourceBuffer Management

SourceBuffer is the core of MSE. It receives raw media data and handles parsing, buffering, and feeding frames to the decoder.

```javascript
const segmentQueue = [];
let isAppending = false;

function appendNextSegment() {
  if (isAppending || segmentQueue.length === 0) return;

  isAppending = true;
  const segment = segmentQueue.shift();
  sourceBuffer.appendBuffer(segment);
}

sourceBuffer.addEventListener('updateend', () => {
  isAppending = false;
  appendNextSegment();
});

sourceBuffer.addEventListener('error', (e) => {
  console.error('SourceBuffer error:', e);
});

// You cannot call appendBuffer while a previous append is in progress.
// The queue pattern above is the standard approach.

async function fetchAndAppendSegments(urls) {
  for (const url of urls) {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    segmentQueue.push(data);
    appendNextSegment();
  }
}
```

### Buffer Management

Browsers have limited buffer memory. You must manage what is buffered:

```javascript
function trimBuffer(sourceBuffer, currentTime) {
  // Keep 30 seconds behind and 60 seconds ahead
  const removeEnd = currentTime - 30;
  if (removeEnd > 0 && !sourceBuffer.updating) {
    sourceBuffer.remove(0, removeEnd);
  }
}

// Monitor buffer health
function getBufferAhead(sourceBuffer, currentTime) {
  const buffered = sourceBuffer.buffered;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
      return buffered.end(i) - currentTime;
    }
  }
  return 0;
}
```

### Adaptive Bitrate Streaming with MSE

ABR is the killer feature of MSE. The player monitors network speed and buffer health to select the appropriate quality level:

```javascript
const qualityLevels = [
  { bitrate: 500000, url: (seg) => `/360p/segment_${seg}.m4s` },
  { bitrate: 1500000, url: (seg) => `/720p/segment_${seg}.m4s` },
  { bitrate: 4000000, url: (seg) => `/1080p/segment_${seg}.m4s` },
];

let currentQuality = 0;
let segmentIndex = 0;

function selectQuality(downloadSpeedBps) {
  // Pick the highest quality that fits within available bandwidth
  // Leave a 20% safety margin
  const safeBandwidth = downloadSpeedBps * 0.8;
  let selected = 0;
  for (let i = qualityLevels.length - 1; i >= 0; i--) {
    if (qualityLevels[i].bitrate <= safeBandwidth) {
      selected = i;
      break;
    }
  }
  return selected;
}

async function fetchNextSegment() {
  const level = qualityLevels[currentQuality];
  const url = level.url(segmentIndex);

  const start = performance.now();
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  const elapsed = (performance.now() - start) / 1000;

  const downloadSpeed = (data.byteLength * 8) / elapsed; // bits per second
  currentQuality = selectQuality(downloadSpeed);

  segmentQueue.push(data);
  appendNextSegment();
  segmentIndex++;
}
```

### Ending the Stream

```javascript
sourceBuffer.addEventListener('updateend', () => {
  if (allSegmentsFetched && segmentQueue.length === 0) {
    // Signal that no more data will be appended
    mediaSource.endOfStream();
  }
});
```

---

## 3. Encrypted Media Extensions (EME)

### DRM in the Browser

EME provides a standard API for browsers to interact with Content Decryption Modules (CDMs). It does not implement DRM itself but defines the handshake between JavaScript, the browser, and the CDM.

Common CDMs:

| CDM       | Browser         | DRM System      |
| --------- | --------------- | --------------- |
| Widevine  | Chrome, Firefox | Google Widevine |
| FairPlay  | Safari          | Apple FairPlay  |
| PlayReady | Edge            | Microsoft       |

### EME Flow Overview

```
1. Encounter encrypted media
2. Browser fires 'encrypted' event with initData
3. JS calls navigator.requestMediaKeySystemAccess(keySystem, configs)
4. Create MediaKeys from the access object
5. Attach MediaKeys to the video element
6. Create a MediaKeySession
7. Generate a license request from initData
8. Send the request to a license server
9. Pass the license response back to the session
10. CDM decrypts; video plays
```

### Implementation

```javascript
const video = document.querySelector('video');
const KEY_SYSTEM = 'com.widevine.alpha';
const LICENSE_SERVER_URL = 'https://license.example.com/acquire';

// Step 1: Detect encrypted content
video.addEventListener('encrypted', async (event) => {
  const { initDataType, initData } = event;
  await setupEME(initDataType, initData);
});

async function setupEME(initDataType, initData) {
  // Step 2: Request access to the key system
  const config = [
    {
      initDataTypes: [initDataType],
      videoCapabilities: [
        {
          contentType: 'video/mp4; codecs="avc1.42E01E"',
        },
      ],
      audioCapabilities: [
        {
          contentType: 'audio/mp4; codecs="mp4a.40.2"',
        },
      ],
    },
  ];

  const keySystemAccess = await navigator.requestMediaKeySystemAccess(
    KEY_SYSTEM,
    config
  );

  // Step 3: Create and attach MediaKeys
  const mediaKeys = await keySystemAccess.createMediaKeys();
  await video.setMediaKeys(mediaKeys);

  // Step 4: Create a session and generate a request
  const session = mediaKeys.createSession();

  session.addEventListener('message', async (event) => {
    // Step 5: Send the license request to the server
    const response = await fetch(LICENSE_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: event.message,
    });
    const license = await response.arrayBuffer();

    // Step 6: Provide the license to the CDM
    await session.update(license);
  });

  session.addEventListener('keystatuseschange', () => {
    for (const [keyId, status] of session.keyStatuses) {
      console.log(`Key ${keyId}: ${status}`);
      // status can be: 'usable', 'expired', 'released', 'output-restricted', etc.
    }
  });

  // Generate the initial request
  await session.generateRequest(initDataType, initData);
}
```

### Key Rotation

For long-lived streams (live TV), keys may rotate. The `encrypted` event fires again with new `initData`, and the process repeats. Persistent sessions can cache licenses for offline playback:

```javascript
const session = mediaKeys.createSession('persistent-license');
// Store session.sessionId for later retrieval
// On revisit: session.load(storedSessionId)
```

---

## 4. Web Audio API

### Overview and AudioContext

The Web Audio API provides a powerful system for controlling audio in web applications. It uses a modular graph-based architecture where audio nodes are connected together to form a processing pipeline.

```javascript
// Create the audio context (one per application is typical)
const audioCtx = new AudioContext();

// AudioContext starts in 'suspended' state due to autoplay policy
// Must be resumed after a user gesture
document.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
});
```

### The Audio Graph Model

Audio processing in the Web Audio API is modeled as a directed graph:

```
Source Node(s) --> Processing Node(s) --> Destination Node
```

Every audio pipeline has:

- **Source nodes**: Generate or inject audio data.
- **Processing nodes**: Transform audio (gain, filter, delay, etc.).
- **Destination node**: The final output (usually speakers).

Nodes are connected via `connect()` and `disconnect()`.

### Source Nodes

#### AudioBufferSourceNode

Plays audio data stored in memory. One-shot: each node can only be started once.

```javascript
async function playAudioBuffer(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = false;
  source.playbackRate.value = 1.0;

  source.connect(audioCtx.destination);
  source.start(0); // Start immediately
  // source.start(audioCtx.currentTime + 1.0); // Start in 1 second
  // source.start(0, 5, 10); // Start at offset 5s, play for 10s

  source.onended = () => {
    console.log('Playback finished');
    source.disconnect();
  };
}
```

#### MediaElementAudioSourceNode

Routes an `<audio>` or `<video>` element through the Web Audio graph:

```javascript
const audioElement = document.querySelector('audio');
const source = audioCtx.createMediaElementSource(audioElement);

// Now the audio element's output goes through the Web Audio graph
// instead of directly to speakers
source.connect(audioCtx.destination);

// You can insert processing nodes in between
const gainNode = audioCtx.createGain();
source.connect(gainNode);
gainNode.connect(audioCtx.destination);
```

#### OscillatorNode

Generates a periodic waveform (sine, square, sawtooth, triangle):

```javascript
const oscillator = audioCtx.createOscillator();
oscillator.type = 'sine'; // 'sine', 'square', 'sawtooth', 'triangle'
oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
oscillator.connect(audioCtx.destination);
oscillator.start();
oscillator.stop(audioCtx.currentTime + 2); // Stop after 2 seconds
```

#### MediaStreamAudioSourceNode

Captures audio from a MediaStream (microphone, screen share):

```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = audioCtx.createMediaStreamSource(stream);
// Now the microphone input flows through the audio graph
source.connect(analyserNode);
```

### Processing Nodes

#### GainNode

Controls volume:

```javascript
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.5; // 50% volume

// Smooth fade-in over 2 seconds
gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 2);

// Exponential fade-out
gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);
```

#### BiquadFilterNode

Implements common audio filters:

```javascript
const filter = audioCtx.createBiquadFilter();
filter.type = 'lowpass'; // 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'
filter.frequency.value = 1000; // Cutoff frequency in Hz
filter.Q.value = 1.0; // Quality factor
filter.gain.value = 0; // Used with shelving and peaking types

source.connect(filter);
filter.connect(audioCtx.destination);
```

#### ConvolverNode

Applies convolution reverb using an impulse response:

```javascript
const convolver = audioCtx.createConvolver();

// Load an impulse response (IR) file
const irResponse = await fetch('impulse-response.wav');
const irBuffer = await irResponse.arrayBuffer();
convolver.buffer = await audioCtx.decodeAudioData(irBuffer);

// Wet/dry mix using parallel paths
const dryGain = audioCtx.createGain();
const wetGain = audioCtx.createGain();
dryGain.gain.value = 0.7;
wetGain.gain.value = 0.3;

source.connect(dryGain);
source.connect(convolver);
convolver.connect(wetGain);
dryGain.connect(audioCtx.destination);
wetGain.connect(audioCtx.destination);
```

#### DynamicsCompressorNode

Reduces the dynamic range of audio (loud parts quieter, quiet parts louder):

```javascript
const compressor = audioCtx.createDynamicsCompressor();
compressor.threshold.value = -24; // dB above which compression starts
compressor.knee.value = 30; // dB range for smooth transition
compressor.ratio.value = 12; // compression ratio
compressor.attack.value = 0.003; // seconds
compressor.release.value = 0.25; // seconds

source.connect(compressor);
compressor.connect(audioCtx.destination);
```

#### AnalyserNode

Provides real-time frequency and time-domain analysis without modifying the signal:

```javascript
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
const bufferLength = analyser.frequencyBinCount; // fftSize / 2
const dataArray = new Uint8Array(bufferLength);

source.connect(analyser);
analyser.connect(audioCtx.destination);

function draw() {
  requestAnimationFrame(draw);

  // Frequency data (spectrum)
  analyser.getByteFrequencyData(dataArray);

  // Time-domain data (waveform)
  // analyser.getByteTimeDomainData(dataArray);

  // Render dataArray to canvas (see Section 12 for full example)
}
draw();
```

#### DelayNode

Delays the audio signal:

```javascript
const delay = audioCtx.createDelay(5.0); // Max delay in seconds
delay.delayTime.value = 0.5; // 500ms delay

// Echo effect with feedback
const feedback = audioCtx.createGain();
feedback.gain.value = 0.4;

source.connect(delay);
delay.connect(feedback);
feedback.connect(delay); // Feedback loop
delay.connect(audioCtx.destination);
source.connect(audioCtx.destination); // Dry signal
```

#### StereoPannerNode

Pans audio left or right:

```javascript
const panner = audioCtx.createStereoPanner();
panner.pan.value = -1; // -1 = full left, 0 = center, 1 = full right

// Automate panning
panner.pan.setValueAtTime(-1, audioCtx.currentTime);
panner.pan.linearRampToValueAtTime(1, audioCtx.currentTime + 4);

source.connect(panner);
panner.connect(audioCtx.destination);
```

### Audio Parameter Scheduling

AudioParam supports precise scheduling, which is critical for music applications:

```javascript
const gain = audioCtx.createGain();

// Set value at exact time
gain.gain.setValueAtTime(0, audioCtx.currentTime);

// Linear ramp to value
gain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.5);

// Exponential ramp (target must be > 0)
gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2);

// Exponential approach to target value
gain.gain.setTargetAtTime(0.5, audioCtx.currentTime, 0.1); // value, startTime, timeConstant

// Arbitrary curve
const curve = new Float32Array([0, 0.5, 1, 0.8, 0.3]);
gain.gain.setValueCurveAtTime(curve, audioCtx.currentTime, 2); // curve, startTime, duration

// Cancel all scheduled changes
gain.gain.cancelScheduledValues(audioCtx.currentTime);
```

---

## 5. AudioWorklet Deep Dive

### Why AudioWorklet?

The deprecated `ScriptProcessorNode` ran on the main thread, causing audio glitches during heavy UI work. AudioWorklet runs custom audio processing code on a dedicated audio rendering thread, ensuring glitch-free processing.

### Architecture

```
Main Thread                    Audio Worklet Thread
-----------                    --------------------
AudioWorkletNode  <--params-->  AudioWorkletProcessor
  (JS object)      messages      (audio processing)
```

### AudioWorkletProcessor

This runs on the audio thread. It must process 128 frames (one render quantum) per call:

```javascript
// processor.js - runs on the audio worklet thread
class GainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'gain',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 2.0,
        automationRate: 'a-rate', // 'a-rate' (per-sample) or 'k-rate' (per-block)
      },
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const gainParam = parameters.gain;

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        // If gain is a-rate, it may have a different value per sample
        const gain = gainParam.length > 1 ? gainParam[i] : gainParam[0];
        outputChannel[i] = inputChannel[i] * gain;
      }
    }

    // Return true to keep the processor alive, false to dispose
    return true;
  }
}

registerProcessor('gain-processor', GainProcessor);
```

### AudioWorkletNode

This lives on the main thread and acts as the node in the audio graph:

```javascript
// Main thread
await audioCtx.audioWorklet.addModule('processor.js');

const gainWorkletNode = new AudioWorkletNode(audioCtx, 'gain-processor');

// Access the parameter
const gainParam = gainWorkletNode.parameters.get('gain');
gainParam.setValueAtTime(0.5, audioCtx.currentTime);

// Connect into the graph
source.connect(gainWorkletNode);
gainWorkletNode.connect(audioCtx.destination);
```

### Communication via MessagePort

For data that does not fit AudioParam (e.g., waveform tables, configuration):

```javascript
// Main thread
gainWorkletNode.port.postMessage({ type: 'setWavetable', data: wavetableArray });

gainWorkletNode.port.onmessage = (event) => {
  console.log('Message from processor:', event.data);
};

// Processor thread (inside the class)
constructor() {
  super();
  this.port.onmessage = (event) => {
    if (event.data.type === 'setWavetable') {
      this.wavetable = event.data.data;
    }
  };
}
```

### SharedArrayBuffer for Real-Time Communication

For high-frequency data exchange (e.g., audio level meters), use SharedArrayBuffer to avoid message copying overhead:

```javascript
// Main thread
const sab = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * 128);
const sharedArray = new Float32Array(sab);

const node = new AudioWorkletNode(audioCtx, 'meter-processor', {
  processorOptions: { sharedBuffer: sab },
});

// Read levels on main thread (no message passing needed)
function updateMeter() {
  const level = Atomics.load(new Int32Array(sab), 0);
  requestAnimationFrame(updateMeter);
}
```

### Real-Time Constraints

Code running in `process()` must be deterministic and fast:

- **No memory allocation**: Pre-allocate all buffers in the constructor.
- **No garbage collection triggers**: Avoid creating objects.
- **No blocking operations**: No fetch, no promises, no locks.
- **No DOM access**: The worklet thread has no access to the DOM.
- **Budget**: ~2.9ms per 128-sample block at 44.1kHz.

---

## 6. Canvas and Video

### Drawing Video Frames to Canvas

Canvas enables pixel-level access to video frames, opening up real-time effects, compositing, and analysis:

```javascript
const video = document.querySelector('video');
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

video.addEventListener('loadedmetadata', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
});

function renderFrame() {
  if (video.paused || video.ended) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  requestAnimationFrame(renderFrame);
}

video.addEventListener('play', () => {
  requestAnimationFrame(renderFrame);
});
```

### Pixel Manipulation with getImageData

```javascript
function applyGrayscale(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data; // Uint8ClampedArray [R, G, B, A, R, G, B, A, ...]

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminance formula
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    // Alpha (data[i + 3]) unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}
```

### Green Screen / Chroma Key Implementation

```javascript
function chromaKey(ctx, width, height, bgImage) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Target green color and tolerance
  const targetR = 0,
    targetG = 255,
    targetB = 0;
  const threshold = 100;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate distance from target green
    const distance = Math.sqrt(
      (r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2
    );

    if (distance < threshold) {
      // Make pixel transparent
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Draw background behind the video
  // Use a second canvas or composite with globalCompositeOperation
}

function renderWithChromaKey() {
  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  chromaKey(ctx, canvas.width, canvas.height);
  requestAnimationFrame(renderWithChromaKey);
}
```

### Generating Video Thumbnails

```javascript
function generateThumbnails(videoUrl, count) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const thumbnails = [];

    video.src = videoUrl;
    video.preload = 'metadata';
    video.muted = true;

    video.addEventListener('loadedmetadata', () => {
      canvas.width = 160;
      canvas.height = 90;
      const interval = video.duration / count;
      let currentIndex = 0;

      function captureFrame() {
        if (currentIndex >= count) {
          resolve(thumbnails);
          return;
        }
        video.currentTime = currentIndex * interval;
      }

      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnails.push({
          time: video.currentTime,
          dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        });
        currentIndex++;
        captureFrame();
      });

      captureFrame();
    });

    video.addEventListener('error', reject);
  });
}
```

---

## 7. WebCodecs API

### Why WebCodecs?

MSE abstracts away codec details behind a container format. WebCodecs provides direct, low-level access to individual video and audio encoders/decoders. This enables:

- Sub-frame latency (no container parsing overhead)
- Custom transport protocols (WebTransport, WebSocket)
- Video editing workflows (frame-by-frame processing)
- Game streaming and cloud gaming
- Non-standard media pipelines

### VideoDecoder

```javascript
const decoder = new VideoDecoder({
  output: (frame) => {
    // frame is a VideoFrame object
    // Draw it to canvas, pass to encoder, etc.
    ctx.drawImage(frame, 0, 0);
    frame.close(); // IMPORTANT: always close frames to free memory
  },
  error: (e) => {
    console.error('Decoder error:', e);
  },
});

decoder.configure({
  codec: 'avc1.42E01E', // H.264 Baseline Profile
  codedWidth: 1920,
  codedHeight: 1080,
  // hardwareAcceleration: 'prefer-hardware',
});

// Feed encoded data
const chunk = new EncodedVideoChunk({
  type: 'key', // 'key' or 'delta'
  timestamp: 0, // microseconds
  data: encodedData, // ArrayBuffer
});

decoder.decode(chunk);
await decoder.flush(); // Wait for all pending decodes to complete
```

### VideoEncoder

```javascript
const encoder = new VideoEncoder({
  output: (chunk, metadata) => {
    // chunk is an EncodedVideoChunk
    // metadata contains decoderConfig for key frames
    if (metadata.decoderConfig) {
      // Send decoder configuration to the receiver
      sendConfig(metadata.decoderConfig);
    }
    sendEncodedChunk(chunk);
  },
  error: (e) => {
    console.error('Encoder error:', e);
  },
});

encoder.configure({
  codec: 'vp8',
  width: 1280,
  height: 720,
  bitrate: 2_000_000,
  framerate: 30,
  latencyMode: 'realtime', // 'quality' or 'realtime'
});

// Create a VideoFrame from canvas
const frame = new VideoFrame(canvas, {
  timestamp: frameCount * (1_000_000 / 30), // microseconds
});

encoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
frame.close();
```

### AudioDecoder and AudioEncoder

```javascript
const audioDecoder = new AudioDecoder({
  output: (audioData) => {
    // audioData is an AudioData object
    // Copy to AudioBuffer, send to Web Audio API, etc.
    const buffer = new Float32Array(audioData.numberOfFrames);
    audioData.copyTo(buffer, { planeIndex: 0 });
    audioData.close();
  },
  error: (e) => console.error('Audio decode error:', e),
});

audioDecoder.configure({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
});

const audioEncoder = new AudioEncoder({
  output: (chunk, metadata) => {
    sendEncodedAudio(chunk);
  },
  error: (e) => console.error('Audio encode error:', e),
});

audioEncoder.configure({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 128000,
});
```

### WebCodecs vs MSE Comparison

| Feature             | MSE                          | WebCodecs                           |
| ------------------- | ---------------------------- | ----------------------------------- |
| Abstraction level   | Container-level (MP4, WebM)  | Codec-level (raw frames/samples)    |
| Latency             | Seconds (buffering required) | Sub-frame (direct decode)           |
| Encoding support    | No                           | Yes                                 |
| Frame access        | No (opaque pipeline)         | Yes (VideoFrame objects)            |
| Browser integration | Feeds `<video>` element      | Canvas, WebGPU, or custom rendering |
| Container support   | Built-in (MP4, WebM, fMP4)   | None (bring your own demuxer)       |
| DRM support         | Yes (via EME)                | No                                  |
| Use case            | Standard VOD/live streaming  | Custom pipelines, ultra-low latency |

---

## 8. MediaStream API

### Overview

A MediaStream represents a stream of media content, consisting of tracks (MediaStreamTrack). Streams are produced by getUserMedia, getDisplayMedia, canvas.captureStream(), or received via WebRTC.

```javascript
// Capture camera and microphone
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: 'user', // 'user' (front) or 'environment' (rear)
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
});

// Capture screen
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    displaySurface: 'monitor', // 'monitor', 'window', 'browser'
    cursor: 'always',
  },
  audio: true, // System audio (browser support varies)
});
```

### MediaStreamTrack

Each track represents a single media channel (one video track, one audio track):

```javascript
const videoTrack = stream.getVideoTracks()[0];
const audioTrack = stream.getAudioTracks()[0];

// Track properties
console.log(videoTrack.kind); // 'video'
console.log(videoTrack.label); // e.g., 'FaceTime HD Camera'
console.log(videoTrack.readyState); // 'live' or 'ended'
console.log(videoTrack.enabled); // true/false (mute without stopping)
console.log(videoTrack.muted); // true if track is not providing data

// Get current settings
const settings = videoTrack.getSettings();
console.log(settings.width, settings.height, settings.frameRate);

// Get supported constraints
const capabilities = videoTrack.getCapabilities();
console.log(capabilities.width); // { min: 1, max: 4096 }

// Apply new constraints
await videoTrack.applyConstraints({
  width: { ideal: 1920 },
  height: { ideal: 1080 },
});

// Stop the track (releases the camera/microphone)
videoTrack.stop();

// Listen for track ending
videoTrack.addEventListener('ended', () => {
  console.log('Track ended (user revoked permission or device disconnected)');
});
```

### Combining and Cloning Streams

```javascript
// Clone a stream (independent lifecycle)
const clonedStream = stream.clone();

// Combine tracks from different sources
const combinedStream = new MediaStream();
combinedStream.addTrack(cameraStream.getVideoTracks()[0]);
combinedStream.addTrack(microphoneStream.getAudioTracks()[0]);

// Remove a track
combinedStream.removeTrack(audioTrack);

// Capture canvas as a stream
const canvas = document.querySelector('canvas');
const canvasStream = canvas.captureStream(30); // 30 FPS

// Replace a track in a stream (useful for switching cameras)
const newVideoTrack = newCameraStream.getVideoTracks()[0];
const oldVideoTrack = combinedStream.getVideoTracks()[0];
combinedStream.removeTrack(oldVideoTrack);
combinedStream.addTrack(newVideoTrack);
oldVideoTrack.stop();
```

### Device Enumeration

```javascript
const devices = await navigator.mediaDevices.enumerateDevices();

const cameras = devices.filter((d) => d.kind === 'videoinput');
const microphones = devices.filter((d) => d.kind === 'audioinput');
const speakers = devices.filter((d) => d.kind === 'audiooutput');

// Listen for device changes (plug/unplug)
navigator.mediaDevices.addEventListener('devicechange', async () => {
  const updatedDevices = await navigator.mediaDevices.enumerateDevices();
  updateDeviceList(updatedDevices);
});

// Select a specific device
const stream = await navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: cameras[1].deviceId } },
  audio: { deviceId: { exact: microphones[0].deviceId } },
});
```

---

## 9. MediaRecorder API

### Recording Media Streams

MediaRecorder provides a simple way to record MediaStream objects:

```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true,
});

// Check supported MIME types
const mimeTypes = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const supportedMimeType = mimeTypes.find((type) =>
  MediaRecorder.isTypeSupported(type)
);

const recorder = new MediaRecorder(stream, {
  mimeType: supportedMimeType,
  videoBitsPerSecond: 2500000, // 2.5 Mbps
  audioBitsPerSecond: 128000, // 128 kbps
});

const chunks = [];

recorder.addEventListener('dataavailable', (event) => {
  if (event.data.size > 0) {
    chunks.push(event.data);
  }
});

recorder.addEventListener('stop', () => {
  const blob = new Blob(chunks, { type: supportedMimeType });
  const url = URL.createObjectURL(blob);

  // Create download link
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.webm';
  a.click();

  // Or assign to a video element for playback
  const playbackVideo = document.querySelector('#playback');
  playbackVideo.src = url;
});

recorder.addEventListener('error', (event) => {
  console.error('Recording error:', event.error);
});

// Start recording (with optional timeslice for periodic dataavailable events)
recorder.start(1000); // Fire dataavailable every 1000ms

// Pause/Resume
recorder.pause();
recorder.resume();

// Stop recording
recorder.stop();
```

### Recording Audio Only

```javascript
const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

const audioRecorder = new MediaRecorder(audioStream, {
  mimeType: 'audio/webm;codecs=opus',
});

const audioChunks = [];

audioRecorder.addEventListener('dataavailable', (e) => {
  audioChunks.push(e.data);
});

audioRecorder.addEventListener('stop', () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const audioUrl = URL.createObjectURL(audioBlob);

  const audio = new Audio(audioUrl);
  audio.play();
});

audioRecorder.start();

// Stop after 5 seconds
setTimeout(() => audioRecorder.stop(), 5000);
```

### Recording Canvas

```javascript
const canvas = document.querySelector('canvas');
const canvasStream = canvas.captureStream(30);

// Optionally add audio
const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioTrack = audioStream.getAudioTracks()[0];
canvasStream.addTrack(audioTrack);

const recorder = new MediaRecorder(canvasStream, {
  mimeType: 'video/webm',
});
// Same pattern as above...
```

---

## 10. Picture-in-Picture API

### Basic Usage

Picture-in-Picture (PiP) allows a video to float in a small window above other windows or tabs:

```javascript
const video = document.querySelector('video');
const pipButton = document.querySelector('#pip-button');

pipButton.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      // Exit PiP if already active
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  } catch (error) {
    console.error('PiP error:', error);
  }
});

// Check if PiP is supported
if (!('pictureInPictureEnabled' in document)) {
  pipButton.disabled = true;
}
```

### Events

```javascript
video.addEventListener('enterpictureinpicture', (event) => {
  const pipWindow = event.pictureInPictureWindow;
  console.log(`PiP window size: ${pipWindow.width}x${pipWindow.height}`);

  pipWindow.addEventListener('resize', () => {
    console.log(`PiP resized: ${pipWindow.width}x${pipWindow.height}`);
  });
});

video.addEventListener('leavepictureinpicture', () => {
  console.log('Exited PiP');
});
```

### Media Session API Integration

Control playback metadata and actions shown in PiP and OS media controls:

```javascript
navigator.mediaSession.metadata = new MediaMetadata({
  title: 'Song Title',
  artist: 'Artist Name',
  album: 'Album Name',
  artwork: [
    { src: 'cover-96.png', sizes: '96x96', type: 'image/png' },
    { src: 'cover-256.png', sizes: '256x256', type: 'image/png' },
  ],
});

navigator.mediaSession.setActionHandler('play', () => video.play());
navigator.mediaSession.setActionHandler('pause', () => video.pause());
navigator.mediaSession.setActionHandler('seekbackward', (details) => {
  video.currentTime = Math.max(
    video.currentTime - (details.seekOffset || 10),
    0
  );
});
navigator.mediaSession.setActionHandler('seekforward', (details) => {
  video.currentTime = Math.min(
    video.currentTime + (details.seekOffset || 10),
    video.duration
  );
});
navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
```

### Document Picture-in-Picture API

The newer Document PiP API allows rendering arbitrary HTML (not just video) in a PiP window:

```javascript
const pipWindow = await documentPictureInPicture.requestWindow({
  width: 400,
  height: 300,
});

// Copy stylesheets
for (const sheet of document.styleSheets) {
  try {
    const cssRules = [...sheet.cssRules].map((rule) => rule.cssText).join('');
    const style = pipWindow.document.createElement('style');
    style.textContent = cssRules;
    pipWindow.document.head.appendChild(style);
  } catch (e) {
    // Cross-origin stylesheets may throw
    const link = pipWindow.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet.href;
    pipWindow.document.head.appendChild(link);
  }
}

// Move elements to PiP window
const player = document.querySelector('#player');
pipWindow.document.body.appendChild(player);

pipWindow.addEventListener('pagehide', () => {
  // Move elements back when PiP closes
  document.querySelector('#container').appendChild(player);
});
```

---

## 11. WebTransport and WebCodecs for Streaming

### The Ultra-Low-Latency Stack

Traditional streaming stacks (HLS, DASH over MSE) introduce 3-30 seconds of latency due to segment buffering. For interactive applications (cloud gaming, live auctions, remote surgery), sub-100ms latency is required. The WebTransport + WebCodecs combination enables this.

```
Camera/Encoder --> WebTransport (QUIC) --> WebCodecs Decoder --> Canvas/WebGPU
```

### WebTransport Basics

WebTransport provides multiplexed, bidirectional transport over QUIC/HTTP3:

```javascript
const transport = new WebTransport('https://media-server.example.com:4433');
await transport.ready;

console.log('Connected via', transport.protocol); // 'h3'

// Unreliable datagrams (UDP-like, best for real-time media)
const writer = transport.datagrams.writable.getWriter();
const reader = transport.datagrams.readable.getReader();

// Reliable streams (TCP-like, for signaling/metadata)
const stream = await transport.createBidirectionalStream();
const streamWriter = stream.writable.getWriter();
const streamReader = stream.readable.getReader();

// Handle connection close
transport.closed
  .then(() => {
    console.log('Connection closed gracefully');
  })
  .catch((error) => {
    console.error('Connection closed with error:', error);
  });
```

### Receiving and Decoding Video via WebTransport + WebCodecs

```javascript
const decoder = new VideoDecoder({
  output: (frame) => {
    renderFrame(frame);
    frame.close();
  },
  error: (e) => console.error('Decode error:', e),
});

// Configure decoder (codec info received via signaling)
decoder.configure({
  codec: 'avc1.42E01E',
  codedWidth: 1920,
  codedHeight: 1080,
});

// Read datagrams (each containing one encoded frame or fragment)
async function receiveFrames() {
  const reader = transport.datagrams.readable.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // Parse the custom framing protocol
    const { timestamp, isKeyFrame, data } = parseFramePacket(value);

    const chunk = new EncodedVideoChunk({
      type: isKeyFrame ? 'key' : 'delta',
      timestamp: timestamp,
      data: data,
    });

    decoder.decode(chunk);
  }
}

function renderFrame(frame) {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frame, 0, 0);
}

receiveFrames();
```

### Sending Encoded Video

```javascript
const encoder = new VideoEncoder({
  output: async (chunk, metadata) => {
    const packet = createFramePacket(chunk, metadata);
    const writer = transport.datagrams.writable.getWriter();
    await writer.write(packet);
    writer.releaseLock();
  },
  error: (e) => console.error('Encode error:', e),
});

encoder.configure({
  codec: 'vp8',
  width: 1280,
  height: 720,
  bitrate: 3_000_000,
  framerate: 30,
  latencyMode: 'realtime',
});

// Capture from camera and encode
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const videoTrack = stream.getVideoTracks()[0];
const trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
const frameReader = trackProcessor.readable.getReader();

let frameCount = 0;
async function encodeFrames() {
  while (true) {
    const { value: frame, done } = await frameReader.read();
    if (done) break;

    encoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
    frame.close();
    frameCount++;
  }
}

encodeFrames();
```

### Latency Comparison

| Stack                    | Typical Latency | Use Case                    |
| ------------------------ | --------------- | --------------------------- |
| HLS/DASH + MSE           | 6-30 seconds    | VOD, live events            |
| Low-Latency HLS/DASH     | 2-5 seconds     | Sports, news                |
| WebRTC                   | 200-500ms       | Video calls, small audience |
| WebTransport + WebCodecs | 50-150ms        | Cloud gaming, interactive   |

---

## 12. Complete Code Examples

### Example 1: Custom Video Player with MSE

```javascript
class CustomMSEPlayer {
  constructor(videoElement, manifestUrl) {
    this.video = videoElement;
    this.manifestUrl = manifestUrl;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.segmentQueue = [];
    this.isAppending = false;
    this.manifest = null;
    this.currentSegment = 0;
    this.currentQuality = 0;
  }

  async init() {
    this.manifest = await this.fetchManifest();
    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);

    return new Promise((resolve) => {
      this.mediaSource.addEventListener('sourceopen', () => {
        this.setupSourceBuffer();
        resolve();
      });
    });
  }

  async fetchManifest() {
    const response = await fetch(this.manifestUrl);
    return response.json();
    // Expected format:
    // {
    //   qualities: [
    //     { bitrate: 500000, segments: ['360p/seg0.m4s', ...] },
    //     { bitrate: 1500000, segments: ['720p/seg0.m4s', ...] },
    //   ],
    //   initSegment: 'init.mp4',
    //   mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    // }
  }

  setupSourceBuffer() {
    this.sourceBuffer = this.mediaSource.addSourceBuffer(
      this.manifest.mimeType
    );

    this.sourceBuffer.addEventListener('updateend', () => {
      this.isAppending = false;
      this.processQueue();
      this.fetchNextSegmentIfNeeded();
    });

    this.sourceBuffer.addEventListener('error', (e) => {
      console.error('SourceBuffer error:', e);
    });

    // Start by fetching the init segment
    this.fetchAndAppend(this.manifest.initSegment);
  }

  async fetchAndAppend(url) {
    const start = performance.now();
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    const elapsed = (performance.now() - start) / 1000;

    // Measure download speed for ABR
    const speedBps = (data.byteLength * 8) / elapsed;
    this.updateQuality(speedBps);

    this.segmentQueue.push(data);
    this.processQueue();
  }

  processQueue() {
    if (this.isAppending || this.segmentQueue.length === 0) return;
    if (this.sourceBuffer.updating) return;

    this.isAppending = true;
    const segment = this.segmentQueue.shift();
    this.sourceBuffer.appendBuffer(segment);
  }

  updateQuality(speedBps) {
    const safeSpeed = speedBps * 0.8;
    const qualities = this.manifest.qualities;

    for (let i = qualities.length - 1; i >= 0; i--) {
      if (qualities[i].bitrate <= safeSpeed) {
        if (this.currentQuality !== i) {
          console.log(
            `Switching quality: ${qualities[this.currentQuality].bitrate} -> ${qualities[i].bitrate}`
          );
          this.currentQuality = i;
        }
        break;
      }
    }
  }

  fetchNextSegmentIfNeeded() {
    const quality = this.manifest.qualities[this.currentQuality];
    if (this.currentSegment >= quality.segments.length) {
      if (!this.sourceBuffer.updating) {
        this.mediaSource.endOfStream();
      }
      return;
    }

    // Fetch next segment if buffer is running low
    const bufferAhead = this.getBufferAhead();
    if (bufferAhead < 10) {
      const segmentUrl = quality.segments[this.currentSegment];
      this.currentSegment++;
      this.fetchAndAppend(segmentUrl);
    }
  }

  getBufferAhead() {
    const buffered = this.sourceBuffer.buffered;
    const currentTime = this.video.currentTime;

    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
        return buffered.end(i) - currentTime;
      }
    }
    return 0;
  }

  play() {
    return this.video.play();
  }

  pause() {
    this.video.pause();
  }

  seek(time) {
    this.video.currentTime = time;
  }
}

// Usage:
// const player = new CustomMSEPlayer(document.querySelector('video'), '/manifest.json');
// await player.init();
// await player.play();
```

### Example 2: Audio Visualizer with Web Audio API

```javascript
class AudioVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
  }

  async initWithMicrophone() {
    this.audioCtx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioCtx.createMediaStreamSource(stream);
    this.setupAnalyser(source);
  }

  initWithAudioElement(audioElement) {
    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaElementSource(audioElement);
    this.setupAnalyser(source);
    source.connect(this.audioCtx.destination); // Still output to speakers
  }

  setupAnalyser(source) {
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    source.connect(this.analyser);
  }

  startBarVisualization() {
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(this.dataArray);

      const { width, height } = this.canvas;
      this.ctx.fillStyle = 'rgb(0, 0, 0)';
      this.ctx.fillRect(0, 0, width, height);

      const barCount = this.dataArray.length;
      const barWidth = (width / barCount) * 2.5;
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        const barHeight = (this.dataArray[i] / 255) * height;

        // Color gradient from green to red based on height
        const r = Math.floor((this.dataArray[i] / 255) * 255);
        const g = Math.floor(255 - (this.dataArray[i] / 255) * 255);

        this.ctx.fillStyle = `rgb(${r}, ${g}, 50)`;
        this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  startWaveformVisualization() {
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(this.dataArray);

      const { width, height } = this.canvas;
      this.ctx.fillStyle = 'rgb(0, 0, 0)';
      this.ctx.fillRect(0, 0, width, height);

      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'rgb(0, 255, 0)';
      this.ctx.beginPath();

      const sliceWidth = width / this.dataArray.length;
      let x = 0;

      for (let i = 0; i < this.dataArray.length; i++) {
        const v = this.dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      this.ctx.lineTo(width, height / 2);
      this.ctx.stroke();
    };

    draw();
  }

  startCircularVisualization() {
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(this.dataArray);

      const { width, height } = this.canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 4;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      this.ctx.fillRect(0, 0, width, height);

      const barCount = this.dataArray.length;
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const barLength = (this.dataArray[i] / 255) * radius;
        const angle = i * angleStep;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barLength);
        const y2 = centerY + Math.sin(angle) * (radius + barLength);

        const hue = (i / barCount) * 360;
        this.ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
    };

    draw();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  async resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }
}

// Usage:
// const visualizer = new AudioVisualizer(document.querySelector('canvas'));
// visualizer.initWithAudioElement(document.querySelector('audio'));
// visualizer.startBarVisualization();
```

### Example 3: Real-Time Audio Effects Chain

```javascript
class AudioEffectsChain {
  constructor() {
    this.audioCtx = new AudioContext();
    this.source = null;
    this.nodes = {};
    this.isActive = {};
  }

  async initWithMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.buildChain();
  }

  buildChain() {
    // Create all effect nodes
    this.nodes.inputGain = this.audioCtx.createGain();
    this.nodes.inputGain.gain.value = 1.0;

    // EQ: Low shelf
    this.nodes.lowShelf = this.audioCtx.createBiquadFilter();
    this.nodes.lowShelf.type = 'lowshelf';
    this.nodes.lowShelf.frequency.value = 320;
    this.nodes.lowShelf.gain.value = 0;

    // EQ: Mid peaking
    this.nodes.midPeak = this.audioCtx.createBiquadFilter();
    this.nodes.midPeak.type = 'peaking';
    this.nodes.midPeak.frequency.value = 1000;
    this.nodes.midPeak.Q.value = 1.0;
    this.nodes.midPeak.gain.value = 0;

    // EQ: High shelf
    this.nodes.highShelf = this.audioCtx.createBiquadFilter();
    this.nodes.highShelf.type = 'highshelf';
    this.nodes.highShelf.frequency.value = 3200;
    this.nodes.highShelf.gain.value = 0;

    // Compressor
    this.nodes.compressor = this.audioCtx.createDynamicsCompressor();
    this.nodes.compressor.threshold.value = -24;
    this.nodes.compressor.ratio.value = 4;
    this.nodes.compressor.attack.value = 0.005;
    this.nodes.compressor.release.value = 0.1;

    // Delay (echo)
    this.nodes.delay = this.audioCtx.createDelay(2.0);
    this.nodes.delay.delayTime.value = 0.3;
    this.nodes.delayFeedback = this.audioCtx.createGain();
    this.nodes.delayFeedback.gain.value = 0.3;
    this.nodes.delayWet = this.audioCtx.createGain();
    this.nodes.delayWet.gain.value = 0;

    // Stereo panner
    this.nodes.panner = this.audioCtx.createStereoPanner();
    this.nodes.panner.pan.value = 0;

    // Output gain
    this.nodes.outputGain = this.audioCtx.createGain();
    this.nodes.outputGain.gain.value = 1.0;

    // Analyser for visualization
    this.nodes.analyser = this.audioCtx.createAnalyser();
    this.nodes.analyser.fftSize = 2048;

    // Connect the chain
    this.source.connect(this.nodes.inputGain);
    this.nodes.inputGain.connect(this.nodes.lowShelf);
    this.nodes.lowShelf.connect(this.nodes.midPeak);
    this.nodes.midPeak.connect(this.nodes.highShelf);
    this.nodes.highShelf.connect(this.nodes.compressor);
    this.nodes.compressor.connect(this.nodes.panner);

    // Delay as parallel send
    this.nodes.compressor.connect(this.nodes.delay);
    this.nodes.delay.connect(this.nodes.delayFeedback);
    this.nodes.delayFeedback.connect(this.nodes.delay);
    this.nodes.delay.connect(this.nodes.delayWet);
    this.nodes.delayWet.connect(this.nodes.outputGain);

    // Main path
    this.nodes.panner.connect(this.nodes.outputGain);
    this.nodes.outputGain.connect(this.nodes.analyser);
    this.nodes.analyser.connect(this.audioCtx.destination);
  }

  setEQ(low, mid, high) {
    this.nodes.lowShelf.gain.setTargetAtTime(
      low,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.midPeak.gain.setTargetAtTime(
      mid,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.highShelf.gain.setTargetAtTime(
      high,
      this.audioCtx.currentTime,
      0.01
    );
  }

  setDelay(time, feedback, mix) {
    this.nodes.delay.delayTime.setTargetAtTime(
      time,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.delayFeedback.gain.setTargetAtTime(
      feedback,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.delayWet.gain.setTargetAtTime(
      mix,
      this.audioCtx.currentTime,
      0.01
    );
  }

  setCompressor(threshold, ratio) {
    this.nodes.compressor.threshold.setTargetAtTime(
      threshold,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.compressor.ratio.setTargetAtTime(
      ratio,
      this.audioCtx.currentTime,
      0.01
    );
  }

  setPan(value) {
    this.nodes.panner.pan.setTargetAtTime(
      value,
      this.audioCtx.currentTime,
      0.01
    );
  }

  setVolume(input, output) {
    this.nodes.inputGain.gain.setTargetAtTime(
      input,
      this.audioCtx.currentTime,
      0.01
    );
    this.nodes.outputGain.gain.setTargetAtTime(
      output,
      this.audioCtx.currentTime,
      0.01
    );
  }

  getAnalyserData() {
    const data = new Uint8Array(this.nodes.analyser.frequencyBinCount);
    this.nodes.analyser.getByteFrequencyData(data);
    return data;
  }
}

// Usage:
// const chain = new AudioEffectsChain();
// await chain.initWithMicrophone();
// chain.setEQ(6, -3, 4);      // Boost lows and highs, cut mids
// chain.setDelay(0.3, 0.4, 0.2); // 300ms delay, 40% feedback, 20% wet
// chain.setPan(-0.5);           // Pan slightly left
```

### Example 4: Video Recording Application

```javascript
class VideoRecordingApp {
  constructor(previewElement, playbackElement) {
    this.preview = previewElement;
    this.playback = playbackElement;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.recordings = [];
  }

  async startCamera(constraints) {
    const defaultConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(
      constraints || defaultConstraints
    );

    this.preview.srcObject = this.stream;
    await this.preview.play();
  }

  startRecording(options) {
    if (!this.stream) {
      throw new Error('Camera not started. Call startCamera() first.');
    }

    const defaultOptions = {
      mimeType: this.getSupportedMimeType(),
      videoBitsPerSecond: 2500000,
    };

    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, {
      ...defaultOptions,
      ...options,
    });

    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.recorder.addEventListener('stop', () => {
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const recording = {
        blob,
        url,
        mimeType: this.recorder.mimeType,
        timestamp: Date.now(),
        duration: this.chunks.length, // Approximate if using timeslice
      };
      this.recordings.push(recording);
      this.onRecordingComplete(recording);
    });

    this.recorder.start(1000); // Chunk every second
  }

  stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  pauseRecording() {
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.pause();
    }
  }

  resumeRecording() {
    if (this.recorder && this.recorder.state === 'paused') {
      this.recorder.resume();
    }
  }

  onRecordingComplete(recording) {
    this.playback.src = recording.url;
  }

  downloadRecording(index) {
    const recording = this.recordings[index || this.recordings.length - 1];
    if (!recording) return;

    const extension = recording.mimeType.includes('webm') ? 'webm' : 'mp4';
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `recording-${recording.timestamp}.${extension}`;
    a.click();
  }

  getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async switchCamera() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');

    if (cameras.length < 2) return;

    const currentTrack = this.stream.getVideoTracks()[0];
    const currentDeviceId = currentTrack.getSettings().deviceId;
    const nextCamera =
      cameras.find((c) => c.deviceId !== currentDeviceId) || cameras[0];

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextCamera.deviceId } },
      audio: true,
    });

    // Replace tracks
    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = this.stream.getVideoTracks()[0];
    this.stream.removeTrack(oldVideoTrack);
    this.stream.addTrack(newVideoTrack);
    oldVideoTrack.stop();

    this.preview.srcObject = this.stream;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.preview.srcObject = null;
  }

  cleanup() {
    this.stopCamera();
    this.recordings.forEach((r) => URL.revokeObjectURL(r.url));
    this.recordings = [];
  }
}

// Usage:
// const app = new VideoRecordingApp(
//   document.querySelector('#preview'),
//   document.querySelector('#playback')
// );
// await app.startCamera();
// app.startRecording();
// // ... some time later ...
// app.stopRecording();
// app.downloadRecording();
```

---

## 13. Common Interview Questions

### Q1: What is the difference between `<video>` with a src and using MSE?

A plain `<video src="...">` loads a single file progressively. The browser handles all buffering and format detection. MSE gives JavaScript control over what data is fed to the video element. This enables adaptive bitrate streaming (switching quality on the fly), live streaming (continuously appending new segments), and custom buffering strategies. MSE requires the developer to handle segment fetching, buffer management, and codec selection.

### Q2: How does adaptive bitrate streaming work?

ABR streaming works by encoding the same content at multiple quality levels and splitting each into short segments (2-10 seconds). The player monitors download speed and buffer health to decide which quality to request next. If bandwidth drops, the player switches to a lower bitrate to prevent rebuffering. If bandwidth is plentiful, it requests higher quality. The key metric is the ratio of segment download time to segment duration. Tools like DASH and HLS define manifest formats that list available qualities and segment URLs.

### Q3: Explain the Web Audio API audio graph model.

The Web Audio API processes audio through a directed graph of nodes. Source nodes generate audio (oscillators, buffers, media elements, microphone). Processing nodes transform audio (gain, filters, delay, compressor). The destination node outputs to speakers. Nodes are connected via `connect()` calls. Audio flows from sources through processing nodes to the destination. This modular approach allows complex audio pipelines to be built by chaining simple nodes. Each node runs on the audio rendering thread for low-latency, glitch-free processing.

### Q4: Why was ScriptProcessorNode deprecated in favor of AudioWorklet?

ScriptProcessorNode ran on the main thread. When the main thread was busy with DOM updates, layout, or JavaScript execution, audio processing would stall, causing audible glitches (clicks, pops, dropouts). AudioWorklet runs on a dedicated audio rendering thread that is decoupled from the main thread. This ensures audio processing meets its real-time deadline regardless of main thread activity. AudioWorklet also provides AudioParam integration, efficient memory sharing via SharedArrayBuffer, and a cleaner API design.

### Q5: How does EME/DRM work in the browser?

EME defines a standard JavaScript API for interacting with Content Decryption Modules (CDMs). The flow is: (1) encrypted media is detected via the `encrypted` event, (2) JavaScript requests access to a key system (Widevine, FairPlay, PlayReady), (3) a MediaKeySession generates a license request, (4) the app sends this request to a license server, (5) the license response is passed back to the session, (6) the CDM decrypts the content. The browser never exposes decrypted content to JavaScript; decryption happens in a trusted environment within the CDM.

### Q6: What are the real-time constraints of AudioWorklet's process() method?

The `process()` method must complete within the time it takes to play one render quantum (128 samples). At 44.1kHz, that is about 2.9ms. Within this time budget, the code must not allocate memory (triggers GC), must not call blocking APIs (no fetch, no locks, no async), must not access the DOM, and must use only pre-allocated buffers. If `process()` takes too long, the browser may output silence or glitches.

### Q7: How would you implement a green screen effect in the browser?

Capture camera via getUserMedia, draw each frame to a canvas using drawImage, read pixel data with getImageData, iterate through pixels comparing each to the target green color using Euclidean distance in RGB space. If a pixel is close enough to green (within a threshold), set its alpha to 0 (transparent). Then composite the modified frame on top of a background image. Use requestAnimationFrame for the render loop. For better performance, consider using WebGL shaders or OffscreenCanvas in a worker.

### Q8: Compare MSE and WebCodecs. When would you use each?

MSE operates at the container level (MP4, WebM) and integrates directly with the `<video>` element. It handles demuxing, buffering, and synchronization automatically but introduces seconds of latency. Use MSE for standard VOD and live streaming (Netflix, YouTube).

WebCodecs operates at the codec level (raw frames and samples). It gives direct access to encoders and decoders but requires you to handle demuxing, synchronization, and rendering yourself. Use WebCodecs for ultra-low-latency applications (cloud gaming, real-time collaboration), video editing (frame-by-frame access), custom transport protocols, and encoding workflows.

### Q9: What is the MediaRecorder API and what are its limitations?

MediaRecorder records MediaStream objects (camera, microphone, screen, canvas) to encoded media chunks. It fires `dataavailable` events with Blob data that can be assembled into a downloadable file. Limitations include: limited codec support (primarily WebM/VP8/VP9/Opus in most browsers), no frame-level control (cannot insert keyframes on demand in all browsers), output format depends on the browser, and there is no ability to mux separate audio and video tracks from different sources without first combining them into a single MediaStream.

### Q10: How does Picture-in-Picture work and what are its constraints?

The PiP API allows a video to float in a small overlay window that stays on top of other content. You call `video.requestPictureInPicture()` (must be triggered by a user gesture). The browser moves the video into a system-level floating window. Events like `enterpictureinpicture` and `leavepictureinpicture` allow the app to respond. Constraints: only one PiP window at a time, requires user gesture to activate, the PiP window size is controlled by the OS, and custom controls require the Media Session API. The newer Document PiP API allows rendering arbitrary HTML, not just video elements.

### Q11: How would you build an ultra-low-latency video streaming system in the browser?

Use WebTransport for the network layer (QUIC-based, supports unreliable datagrams for lowest latency). Use WebCodecs for encoding (sender) and decoding (receiver). On the sender side, capture frames from getUserMedia via MediaStreamTrackProcessor, encode with VideoEncoder in realtime mode, and send encoded chunks over WebTransport datagrams. On the receiver side, read datagrams, construct EncodedVideoChunk objects, decode with VideoDecoder, and render VideoFrame objects to a canvas. Use unreliable datagrams so dropped packets do not cause head-of-line blocking. Request keyframes periodically so the decoder can recover from packet loss.

### Q12: Explain the autoplay policy in modern browsers and how to work around it.

Browsers block unmuted autoplay to prevent unexpected audio. Autoplay is allowed when: (1) the media is muted, (2) the user has previously interacted with the site (click, tap, keypress), or (3) the site has been added to an allowlist (based on Media Engagement Index in Chrome). To work around this: set `muted` and `autoplay` attributes on the element, then unmute after a user gesture. Alternatively, call `video.play()` and handle the rejected promise by showing a play button. For Web Audio, the AudioContext starts suspended and must be resumed after a user gesture.

### Q13: How do you handle seeking in an MSE-based player?

When the user seeks, the player must: (1) determine which segment contains the target time, (2) flush the current buffer if the target is outside buffered ranges by calling `sourceBuffer.abort()` to cancel any pending append, then `sourceBuffer.remove()` to clear old data, (3) fetch and append the initialization segment if switching quality or after a discontinuity, (4) fetch the segment containing the seek target (must start with a keyframe), (5) append it to the SourceBuffer, and (6) set `video.currentTime` to the target time. The `seeking` and `seeked` events on the video element can be used to show loading states.

### Q14: What is the difference between AudioParam automation rates: a-rate and k-rate?

`a-rate` (audio rate) means the parameter value is computed for every single sample in the 128-sample render quantum. This provides sample-accurate automation, essential for smooth envelopes, precise LFO modulation, and click-free parameter changes. `k-rate` (control rate) means the parameter value is computed once per render quantum and held constant for all 128 samples. This is more efficient but can produce audible stepping artifacts for fast-changing parameters. Choose a-rate for parameters that change rapidly (frequency, gain envelopes) and k-rate for parameters that change slowly or rarely (overall volume levels, static filter settings).

### Q15: How do you handle memory management with WebCodecs VideoFrames?

VideoFrame objects hold references to GPU or CPU memory that is not managed by JavaScript's garbage collector. You must explicitly call `frame.close()` when done with a frame. Failure to close frames will cause memory leaks and eventually exhaust the frame pool, causing the decoder to stall. Best practices: close frames immediately after drawing them, close frames if they are skipped (e.g., during fast-forward), use try/finally blocks to ensure close() is called even on errors, and monitor `decoder.decodeQueueSize` to detect backpressure.

### Q16: How would you synchronize audio and video when using WebCodecs?

WebCodecs provides raw decoded frames with timestamps but no built-in sync. You must implement sync yourself: (1) use a shared clock (e.g., `performance.now()` or AudioContext.currentTime), (2) map media timestamps to wall-clock time, (3) schedule video frame rendering based on their timestamps relative to the clock, (4) use requestAnimationFrame or requestVideoFrameCallback for video rendering, (5) feed audio through Web Audio API with scheduled playback times, (6) handle drift by periodically re-synchronizing (dropping or duplicating frames if video falls behind or gets ahead). For the audio clock master approach, use AudioContext.currentTime as the reference clock since audio hardware has the most stable timing.

### Q17: Explain the SourceBuffer modes: "segments" vs "sequence".

SourceBuffer has a `mode` property that controls how timestamps in appended data are interpreted. In `"segments"` mode (default), timestamps embedded in the media segments are used as-is. The browser places frames at the times specified in the container. In `"sequence"` mode, the browser ignores embedded timestamps and places each appended segment immediately after the previous one. Sequence mode is useful for live streaming where segment timestamps may not be continuous or for concatenating media from different sources. Switching modes requires the SourceBuffer to not be updating.

### Q18: How can you measure and improve video playback quality of experience?

Key metrics: (1) Time to first frame (TTFF): from play() to first frame rendered, (2) Rebuffering ratio: percentage of playback time spent buffering, (3) Average bitrate: quality delivered to the user, (4) Bitrate switches: frequency and magnitude of quality changes, (5) Startup time: from user intent to stable playback. Use the video element's `waiting` event to measure rebuffering. Use `timeupdate` and buffer state to calculate buffer health. The `getVideoPlaybackQuality()` method on HTMLVideoElement provides `totalVideoFrames`, `droppedVideoFrames`, and `corruptedVideoFrames`. Improving QoE involves tuning ABR algorithms (buffer-based vs throughput-based vs hybrid), optimizing segment duration, using HTTP/2 or HTTP/3 for faster segment delivery, and preloading initialization segments.

---

## Summary

This guide covered the full spectrum of browser media APIs, from the declarative `<video>` element to the low-level WebCodecs pipeline. The key relationships:

- **HTML5 Media Elements** provide the simplest way to play media.
- **MSE** extends media elements with programmatic buffer control for adaptive streaming.
- **EME** adds DRM on top of MSE for protected content.
- **Web Audio API** provides a powerful graph-based audio processing system.
- **AudioWorklet** enables custom DSP on a real-time audio thread.
- **Canvas + Video** enables pixel-level video manipulation.
- **WebCodecs** provides raw codec access for custom media pipelines.
- **MediaStream** represents live media from cameras, microphones, and screens.
- **MediaRecorder** records streams to files.
- **Picture-in-Picture** enables floating video windows.
- **WebTransport + WebCodecs** form the ultra-low-latency stack for interactive media.

Understanding these APIs and how they compose together is essential for building modern media applications, from simple video players to complex real-time communication systems.
