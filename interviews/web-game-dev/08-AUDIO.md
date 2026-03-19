# Web Audio for Games

## Table of Contents

1. [Web Audio API Fundamentals](#web-audio-api-fundamentals)
2. [Audio Graph Architecture](#audio-graph-architecture)
3. [Autoplay Restrictions](#autoplay-restrictions)
4. [Sound Effects](#sound-effects)
5. [Music Systems](#music-systems)
6. [Audio Effects and Processing](#audio-effects-and-processing)
7. [Audio for Playable Ads](#audio-for-playable-ads)
8. [Howler.js Library](#howlerjs-library)
9. [File Formats and Browser Support](#file-formats-and-browser-support)
10. [Performance and Memory](#performance-and-memory)
11. [Interview Questions](#interview-questions)

---

## Web Audio API Fundamentals

### AudioContext

The `AudioContext` is the central object of the Web Audio API. It represents an audio-processing graph built from audio modules (nodes) linked together.

```typescript
// Creating an AudioContext
const audioContext = new AudioContext();

// AudioContext states: 'suspended', 'running', 'closed'
console.log(audioContext.state); // 'suspended' (before user interaction)

// Key properties
console.log(audioContext.sampleRate); // e.g., 44100 or 48000
console.log(audioContext.currentTime); // High-precision time in seconds
console.log(audioContext.destination); // Final output node (speakers)
```

**Important**: There is a limit on the number of AudioContexts per page (typically 6-8). For games, you should use a single AudioContext and route all audio through it.

```typescript
class AudioManager {
  private static instance: AudioManager;
  private context: AudioContext;

  private constructor() {
    this.context = new AudioContext();
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  getContext(): AudioContext {
    return this.context;
  }
}
```

### AudioBuffer

An `AudioBuffer` represents an in-memory audio asset. It stores decoded audio data that can be played back instantly with no latency.

```typescript
async function loadAudioBuffer(
  context: AudioContext,
  url: string
): Promise<AudioBuffer> {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    throw new Error(`Failed to load audio from ${url}: ${error}`);
  }
}

// AudioBuffer properties
function inspectBuffer(buffer: AudioBuffer): void {
  console.log(`Duration: ${buffer.duration}s`);
  console.log(`Sample rate: ${buffer.sampleRate}Hz`);
  console.log(`Channels: ${buffer.numberOfChannels}`);
  console.log(`Length: ${buffer.length} samples`);
}
```

### AudioBufferSourceNode

A source node that plays back an `AudioBuffer`. Each source node is **one-shot** -- once it finishes playing, it cannot be restarted. You must create a new source node each time you want to play a sound.

```typescript
function playSound(
  context: AudioContext,
  buffer: AudioBuffer,
  options: {
    volume?: number;
    loop?: boolean;
    playbackRate?: number;
    startOffset?: number;
    duration?: number;
  } = {}
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = options.loop ?? false;
  source.playbackRate.value = options.playbackRate ?? 1.0;

  // Create a gain node for volume control
  const gainNode = context.createGain();
  gainNode.gain.value = options.volume ?? 1.0;

  // Connect: source -> gain -> destination
  source.connect(gainNode);
  gainNode.connect(context.destination);

  // Start playback
  const offset = options.startOffset ?? 0;
  if (options.duration !== undefined) {
    source.start(0, offset, options.duration);
  } else {
    source.start(0, offset);
  }

  return source;
}

// One-shot nature: must create new source each time
const buffer = await loadAudioBuffer(ctx, 'explosion.mp3');
const source1 = playSound(ctx, buffer); // plays once
// source1.start() again would throw an error
const source2 = playSound(ctx, buffer); // create new source to replay
```

---

## Audio Graph Architecture

The Web Audio API uses a modular routing architecture. Audio nodes are connected in a directed graph from sources through processing nodes to the destination.

```
Source Nodes          Processing Nodes         Destination
+-----------+       +------------+           +-----------+
| Buffer    |------>| Gain       |---------->|           |
| Source    |       +------------+           |           |
+-----------+                                | context.  |
                    +------------+           | destination|
+-----------+       | Biquad     |---------->|           |
| Oscillator|------>| Filter     |           |           |
+-----------+       +------------+           +-----------+
```

### Building a Complete Audio Graph for Games

```typescript
interface AudioBus {
  gainNode: GainNode;
  name: string;
}

class GameAudioGraph {
  private context: AudioContext;
  private masterGain: GainNode;
  private sfxBus: AudioBus;
  private musicBus: AudioBus;
  private uiBus: AudioBus;

  constructor(context: AudioContext) {
    this.context = context;

    // Master gain (controls overall volume)
    this.masterGain = context.createGain();
    this.masterGain.connect(context.destination);

    // Create separate buses for different audio categories
    this.sfxBus = this.createBus('sfx');
    this.musicBus = this.createBus('music');
    this.uiBus = this.createBus('ui');
  }

  private createBus(name: string): AudioBus {
    const gainNode = this.context.createGain();
    gainNode.connect(this.masterGain);
    return { gainNode, name };
  }

  setMasterVolume(volume: number): void {
    this.masterGain.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.context.currentTime
    );
  }

  setSFXVolume(volume: number): void {
    this.sfxBus.gainNode.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.context.currentTime
    );
  }

  setMusicVolume(volume: number): void {
    this.musicBus.gainNode.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.context.currentTime
    );
  }

  getSFXOutput(): GainNode {
    return this.sfxBus.gainNode;
  }

  getMusicOutput(): GainNode {
    return this.musicBus.gainNode;
  }

  getUIOutput(): GainNode {
    return this.uiBus.gainNode;
  }
}
```

### Node Types Summary

| Node Type                     | Category    | Purpose                                  |
| ----------------------------- | ----------- | ---------------------------------------- |
| `AudioBufferSourceNode`       | Source      | Play pre-loaded audio buffers            |
| `OscillatorNode`              | Source      | Generate waveforms (sine, square, etc.)  |
| `MediaElementAudioSourceNode` | Source      | Stream from `<audio>`/`<video>` elements |
| `GainNode`                    | Processing  | Volume control                           |
| `BiquadFilterNode`            | Processing  | Filtering (lowpass, highpass, etc.)      |
| `ConvolverNode`               | Processing  | Reverb via impulse response              |
| `DelayNode`                   | Processing  | Time delay                               |
| `DynamicsCompressorNode`      | Processing  | Dynamic range compression                |
| `StereoPannerNode`            | Processing  | Left/right panning                       |
| `PannerNode`                  | Processing  | 3D spatial audio                         |
| `AnalyserNode`                | Analysis    | FFT data for visualization               |
| `AudioDestinationNode`        | Destination | Output to speakers                       |

---

## Autoplay Restrictions

### Browser Policies

Modern browsers block audio playback until the user has interacted with the page. This is a critical consideration for game audio.

```typescript
// AudioContext starts in 'suspended' state
const ctx = new AudioContext();
console.log(ctx.state); // 'suspended'

// Attempting to play audio before user interaction will silently fail
// The audio will be queued and play after the context is resumed
```

### Handling Autoplay Restrictions

```typescript
class AudioContextManager {
  private context: AudioContext;
  private resumeHandlerBound: () => void;
  private isResumed: boolean = false;

  constructor() {
    this.context = new AudioContext();
    this.resumeHandlerBound = this.handleUserInteraction.bind(this);

    if (this.context.state === 'suspended') {
      this.addResumeListeners();
    } else {
      this.isResumed = true;
    }
  }

  private addResumeListeners(): void {
    const events = ['click', 'touchstart', 'touchend', 'keydown'];
    events.forEach((event) => {
      document.addEventListener(event, this.resumeHandlerBound, {
        once: false,
        passive: true,
      });
    });
  }

  private async handleUserInteraction(): Promise<void> {
    if (this.isResumed) return;

    try {
      await this.context.resume();
      if (this.context.state === 'running') {
        this.isResumed = true;
        this.removeResumeListeners();
        console.log('AudioContext resumed successfully');
      }
    } catch (error) {
      console.error('Failed to resume AudioContext:', error);
    }
  }

  private removeResumeListeners(): void {
    const events = ['click', 'touchstart', 'touchend', 'keydown'];
    events.forEach((event) => {
      document.removeEventListener(event, this.resumeHandlerBound);
    });
  }

  getContext(): AudioContext {
    return this.context;
  }

  getIsResumed(): boolean {
    return this.isResumed;
  }
}
```

### Best Practices for Autoplay

```typescript
// Strategy 1: Show a "tap to start" screen
function createStartScreen(onStart: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.innerHTML = '<h1>Tap to Play</h1>';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.8); color: white; cursor: pointer; z-index: 9999;
  `;
  overlay.addEventListener(
    'click',
    () => {
      onStart();
      overlay.remove();
    },
    { once: true }
  );
  return overlay;
}

// Strategy 2: Play silent buffer to "unlock" audio
async function unlockAudio(context: AudioContext): Promise<void> {
  if (context.state === 'suspended') {
    await context.resume();
  }
  // Play a silent buffer to fully unlock on iOS
  const silentBuffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = silentBuffer;
  source.connect(context.destination);
  source.start(0);
}

// Strategy 3: Detect autoplay support
async function canAutoplay(): Promise<boolean> {
  const ctx = new AudioContext();
  const canPlay = ctx.state === 'running';
  await ctx.close();
  return canPlay;
}
```

### iOS-Specific Quirks

```typescript
// iOS Safari requires audio to be triggered from a user gesture handler
// AND the AudioContext must be created/resumed in the same call stack

function setupIOSAudio(): void {
  let audioContext: AudioContext | null = null;

  const handler = (): void => {
    if (!audioContext) {
      // Create context in the gesture handler
      audioContext = new AudioContext();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Play a silent buffer
    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
  };

  document.addEventListener('touchend', handler, { once: true });
}
```

---

## Sound Effects

### Sound Effect Pooling

Creating `AudioBufferSourceNode` instances is cheap, but managing many simultaneous sounds requires a pooling strategy.

```typescript
interface ActiveSound {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number;
  id: number;
}

class SFXPool {
  private context: AudioContext;
  private output: GainNode;
  private activeSounds: Map<number, ActiveSound> = new Map();
  private maxConcurrent: number;
  private nextId: number = 0;

  constructor(
    context: AudioContext,
    output: GainNode,
    maxConcurrent: number = 16
  ) {
    this.context = context;
    this.output = output;
    this.maxConcurrent = maxConcurrent;
  }

  play(
    buffer: AudioBuffer,
    options: {
      volume?: number;
      playbackRate?: number;
      loop?: boolean;
    } = {}
  ): number {
    // Evict oldest sound if pool is full
    if (this.activeSounds.size >= this.maxConcurrent) {
      this.evictOldest();
    }

    const id = this.nextId++;
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();

    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = options.playbackRate ?? 1.0;
    gainNode.gain.value = options.volume ?? 1.0;

    source.connect(gainNode);
    gainNode.connect(this.output);

    const activeSound: ActiveSound = {
      source,
      gainNode,
      startTime: this.context.currentTime,
      id,
    };

    this.activeSounds.set(id, activeSound);

    source.onended = () => {
      this.activeSounds.delete(id);
    };

    source.start(0);
    return id;
  }

  stop(id: number, fadeTime: number = 0.05): void {
    const sound = this.activeSounds.get(id);
    if (!sound) return;

    if (fadeTime > 0) {
      sound.gainNode.gain.setValueAtTime(
        sound.gainNode.gain.value,
        this.context.currentTime
      );
      sound.gainNode.gain.linearRampToValueAtTime(
        0,
        this.context.currentTime + fadeTime
      );
      sound.source.stop(this.context.currentTime + fadeTime);
    } else {
      sound.source.stop();
    }

    this.activeSounds.delete(id);
  }

  stopAll(fadeTime: number = 0.1): void {
    const ids = Array.from(this.activeSounds.keys());
    ids.forEach((id) => this.stop(id, fadeTime));
  }

  private evictOldest(): void {
    let oldestId: number | null = null;
    let oldestTime = Infinity;

    this.activeSounds.forEach((sound, id) => {
      if (sound.startTime < oldestTime) {
        oldestTime = sound.startTime;
        oldestId = id;
      }
    });

    if (oldestId !== null) {
      this.stop(oldestId, 0.01);
    }
  }

  getActiveCount(): number {
    return this.activeSounds.size;
  }
}
```

### Sound Sprites

A sound sprite is a single audio file containing multiple sound effects at known time offsets. This reduces HTTP requests and is critical for playable ads.

```typescript
interface SpriteDefinition {
  offset: number; // Start time in seconds
  duration: number; // Duration in seconds
}

interface SpriteSheet {
  buffer: AudioBuffer;
  sprites: Record<string, SpriteDefinition>;
}

class SoundSprite {
  private context: AudioContext;
  private output: GainNode;
  private spriteSheet: SpriteSheet;

  constructor(
    context: AudioContext,
    output: GainNode,
    spriteSheet: SpriteSheet
  ) {
    this.context = context;
    this.output = output;
    this.spriteSheet = spriteSheet;
  }

  play(spriteName: string, volume: number = 1.0): AudioBufferSourceNode | null {
    const sprite = this.spriteSheet.sprites[spriteName];
    if (!sprite) {
      console.error(`Sprite "${spriteName}" not found`);
      return null;
    }

    const source = this.context.createBufferSource();
    source.buffer = this.spriteSheet.buffer;

    const gainNode = this.context.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(this.output);

    // Play only the sprite segment
    source.start(0, sprite.offset, sprite.duration);

    return source;
  }
}

// Example sprite definition
const spriteSheet: SpriteSheet = {
  buffer: null!, // loaded AudioBuffer
  sprites: {
    jump: { offset: 0.0, duration: 0.3 },
    coin: { offset: 0.5, duration: 0.2 },
    explosion: { offset: 1.0, duration: 0.8 },
    powerup: { offset: 2.0, duration: 0.5 },
    hit: { offset: 3.0, duration: 0.15 },
    menu_click: { offset: 3.5, duration: 0.1 },
  },
};
```

### 3D Positional Audio

The `PannerNode` provides 3D spatial audio, making sounds appear to come from specific positions in the game world.

```typescript
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

class SpatialAudioManager {
  private context: AudioContext;
  private listener: AudioListener;

  constructor(context: AudioContext) {
    this.context = context;
    this.listener = context.listener;
  }

  // Update listener position (typically the camera/player position)
  setListenerPosition(position: Vec3, forward: Vec3, up: Vec3): void {
    const t = this.context.currentTime;

    if (this.listener.positionX) {
      // Modern API (AudioParam-based)
      this.listener.positionX.setValueAtTime(position.x, t);
      this.listener.positionY.setValueAtTime(position.y, t);
      this.listener.positionZ.setValueAtTime(position.z, t);
      this.listener.forwardX.setValueAtTime(forward.x, t);
      this.listener.forwardY.setValueAtTime(forward.y, t);
      this.listener.forwardZ.setValueAtTime(forward.z, t);
      this.listener.upX.setValueAtTime(up.x, t);
      this.listener.upY.setValueAtTime(up.y, t);
      this.listener.upZ.setValueAtTime(up.z, t);
    } else {
      // Legacy API
      this.listener.setPosition(position.x, position.y, position.z);
      this.listener.setOrientation(
        forward.x,
        forward.y,
        forward.z,
        up.x,
        up.y,
        up.z
      );
    }
  }

  createSpatialSource(
    buffer: AudioBuffer,
    position: Vec3,
    options: {
      refDistance?: number;
      maxDistance?: number;
      rolloffFactor?: number;
      coneInnerAngle?: number;
      coneOuterAngle?: number;
      coneOuterGain?: number;
      distanceModel?: DistanceModelType;
      panningModel?: PanningModelType;
    } = {}
  ): { source: AudioBufferSourceNode; panner: PannerNode } {
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const panner = this.context.createPanner();
    panner.panningModel = options.panningModel ?? 'HRTF';
    panner.distanceModel = options.distanceModel ?? 'inverse';
    panner.refDistance = options.refDistance ?? 1;
    panner.maxDistance = options.maxDistance ?? 100;
    panner.rolloffFactor = options.rolloffFactor ?? 1;
    panner.coneInnerAngle = options.coneInnerAngle ?? 360;
    panner.coneOuterAngle = options.coneOuterAngle ?? 360;
    panner.coneOuterGain = options.coneOuterGain ?? 0;

    panner.positionX.setValueAtTime(position.x, this.context.currentTime);
    panner.positionY.setValueAtTime(position.y, this.context.currentTime);
    panner.positionZ.setValueAtTime(position.z, this.context.currentTime);

    source.connect(panner);
    panner.connect(this.context.destination);

    return { source, panner };
  }
}

// Usage: explosion at world position (10, 0, 5)
const spatial = new SpatialAudioManager(audioContext);
spatial.setListenerPosition(
  { x: 0, y: 0, z: 0 }, // player at origin
  { x: 0, y: 0, z: -1 }, // looking forward
  { x: 0, y: 1, z: 0 } // up is Y
);

const { source, panner } = spatial.createSpatialSource(
  explosionBuffer,
  { x: 10, y: 0, z: 5 },
  { refDistance: 2, maxDistance: 50, rolloffFactor: 1.5 }
);
source.start(0);
```

### Distance Models

| Model         | Formula                                    | Use Case          |
| ------------- | ------------------------------------------ | ----------------- |
| `linear`      | `1 - rolloff * (dist - ref) / (max - ref)` | Simple 2D games   |
| `inverse`     | `ref / (ref + rolloff * (dist - ref))`     | Realistic falloff |
| `exponential` | `(dist / ref) ^ -rolloff`                  | Dramatic falloff  |

---

## Music Systems

### Background Music with Looping

```typescript
class MusicPlayer {
  private context: AudioContext;
  private output: GainNode;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private isPlaying: boolean = false;

  constructor(context: AudioContext, output: GainNode) {
    this.context = context;
    this.output = output;
  }

  play(buffer: AudioBuffer, volume: number = 0.5): void {
    this.stop();

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Set loop points for seamless looping
    // These should match the musical phrase boundaries
    source.loopStart = 0;
    source.loopEnd = buffer.duration;

    const gainNode = this.context.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(this.output);

    source.start(0);

    this.currentSource = source;
    this.currentGain = gainNode;
    this.isPlaying = true;
  }

  stop(fadeTime: number = 0.5): void {
    if (!this.currentSource || !this.currentGain) return;

    const now = this.context.currentTime;
    this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
    this.currentGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    this.currentSource.stop(now + fadeTime);

    this.currentSource = null;
    this.currentGain = null;
    this.isPlaying = false;
  }

  setVolume(volume: number): void {
    if (!this.currentGain) return;
    this.currentGain.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.context.currentTime
    );
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
```

### Crossfading Between Tracks

```typescript
class MusicCrossfader {
  private context: AudioContext;
  private output: GainNode;
  private trackA: { source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  private trackB: { source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  private activeTrack: 'A' | 'B' = 'A';

  constructor(context: AudioContext, output: GainNode) {
    this.context = context;
    this.output = output;
  }

  private createTrack(buffer: AudioBuffer): {
    source: AudioBufferSourceNode;
    gain: GainNode;
  } {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.context.createGain();
    gain.gain.value = 0;

    source.connect(gain);
    gain.connect(this.output);

    source.start(0);
    return { source, gain };
  }

  crossfadeTo(buffer: AudioBuffer, duration: number = 2.0): void {
    const now = this.context.currentTime;

    if (this.activeTrack === 'A') {
      // Fade out A, fade in B
      this.trackB = this.createTrack(buffer);
      this.trackB.gain.gain.setValueAtTime(0, now);
      this.trackB.gain.gain.linearRampToValueAtTime(1, now + duration);

      if (this.trackA) {
        this.trackA.gain.gain.setValueAtTime(this.trackA.gain.gain.value, now);
        this.trackA.gain.gain.linearRampToValueAtTime(0, now + duration);
        const oldSource = this.trackA.source;
        setTimeout(() => oldSource.stop(), duration * 1000 + 100);
      }

      this.activeTrack = 'B';
    } else {
      // Fade out B, fade in A
      this.trackA = this.createTrack(buffer);
      this.trackA.gain.gain.setValueAtTime(0, now);
      this.trackA.gain.gain.linearRampToValueAtTime(1, now + duration);

      if (this.trackB) {
        this.trackB.gain.gain.setValueAtTime(this.trackB.gain.gain.value, now);
        this.trackB.gain.gain.linearRampToValueAtTime(0, now + duration);
        const oldSource = this.trackB.source;
        setTimeout(() => oldSource.stop(), duration * 1000 + 100);
      }

      this.activeTrack = 'A';
    }
  }

  stop(fadeTime: number = 1.0): void {
    const now = this.context.currentTime;
    const active = this.activeTrack === 'A' ? this.trackA : this.trackB;
    if (active) {
      active.gain.gain.setValueAtTime(active.gain.gain.value, now);
      active.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
      active.source.stop(now + fadeTime);
    }
  }
}
```

### Adaptive Music System

Adaptive music changes based on game state -- intensity increases during combat, softens during exploration.

```typescript
interface MusicLayer {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  targetVolume: number;
  category: 'ambient' | 'percussion' | 'melody' | 'intensity';
}

class AdaptiveMusicSystem {
  private context: AudioContext;
  private output: GainNode;
  private layers: Map<string, MusicLayer> = new Map();
  private intensity: number = 0; // 0 to 1
  private bpm: number = 120;
  private beatDuration: number;

  constructor(context: AudioContext, output: GainNode, bpm: number = 120) {
    this.context = context;
    this.output = output;
    this.bpm = bpm;
    this.beatDuration = 60 / bpm;
  }

  addLayer(
    name: string,
    buffer: AudioBuffer,
    category: MusicLayer['category'],
    targetVolume: number = 1.0
  ): void {
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.connect(this.output);

    this.layers.set(name, {
      buffer,
      source: null,
      gain,
      targetVolume,
      category,
    });
  }

  startAll(): void {
    const now = this.context.currentTime;
    // Quantize start to next beat
    const nextBeat = Math.ceil(now / this.beatDuration) * this.beatDuration;

    this.layers.forEach((layer) => {
      const source = this.context.createBufferSource();
      source.buffer = layer.buffer;
      source.loop = true;
      source.connect(layer.gain);
      source.start(nextBeat);
      layer.source = source;
    });

    this.updateLayerVolumes();
  }

  setIntensity(value: number, transitionTime: number = 1.0): void {
    this.intensity = Math.max(0, Math.min(1, value));
    this.updateLayerVolumes(transitionTime);
  }

  private updateLayerVolumes(transitionTime: number = 0.5): void {
    const now = this.context.currentTime;

    this.layers.forEach((layer) => {
      let volume = 0;

      switch (layer.category) {
        case 'ambient':
          // Always playing, slightly quieter at high intensity
          volume = layer.targetVolume * (1 - this.intensity * 0.3);
          break;
        case 'percussion':
          // Fades in at 30% intensity
          volume =
            layer.targetVolume * Math.max(0, (this.intensity - 0.3) / 0.7);
          break;
        case 'melody':
          // Fades in at 50% intensity
          volume =
            layer.targetVolume * Math.max(0, (this.intensity - 0.5) / 0.5);
          break;
        case 'intensity':
          // Only at high intensity (70%+)
          volume =
            layer.targetVolume * Math.max(0, (this.intensity - 0.7) / 0.3);
          break;
      }

      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(volume, now + transitionTime);
    });
  }

  stopAll(fadeTime: number = 2.0): void {
    const now = this.context.currentTime;
    this.layers.forEach((layer) => {
      if (layer.source) {
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
        layer.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
        layer.source.stop(now + fadeTime);
        layer.source = null;
      }
    });
  }
}

// Usage
const adaptiveMusic = new AdaptiveMusicSystem(ctx, musicOutput, 120);
adaptiveMusic.addLayer('pad', ambientBuffer, 'ambient', 0.6);
adaptiveMusic.addLayer('drums', drumsBuffer, 'percussion', 0.8);
adaptiveMusic.addLayer('lead', leadBuffer, 'melody', 0.7);
adaptiveMusic.addLayer('stinger', stingerBuffer, 'intensity', 1.0);
adaptiveMusic.startAll();

// During gameplay
adaptiveMusic.setIntensity(0.2); // calm exploration
adaptiveMusic.setIntensity(0.8); // intense combat
adaptiveMusic.setIntensity(1.0); // boss fight
```

---

## Audio Effects and Processing

### GainNode (Volume Control)

```typescript
// Basic volume control
const gain = context.createGain();
gain.gain.value = 0.5; // 50% volume

// Smooth volume transitions using AudioParam methods
const now = context.currentTime;

// Linear ramp
gain.gain.setValueAtTime(0, now);
gain.gain.linearRampToValueAtTime(1, now + 0.5); // Fade in over 0.5s

// Exponential ramp (more natural-sounding fades)
gain.gain.setValueAtTime(1, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 1); // Fade out (can't go to 0)

// Scheduled value changes
gain.gain.setValueAtTime(1, now);
gain.gain.setValueAtTime(0.5, now + 1); // Drop to 50% at 1 second
gain.gain.setValueAtTime(1, now + 2); // Back to 100% at 2 seconds

// Smooth curve
gain.gain.setTargetAtTime(0.5, now, 0.3); // Exponential approach, time constant 0.3
```

### BiquadFilterNode (Filtering)

```typescript
// Low-pass filter (muffle effect -- underwater, behind walls)
function createMuffleEffect(context: AudioContext): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500; // Cut frequencies above 500Hz
  filter.Q.value = 1; // Resonance
  return filter;
}

// High-pass filter (tinny/phone effect)
function createPhoneEffect(context: AudioContext): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  filter.Q.value = 0.5;
  return filter;
}

// Bandpass filter (walkie-talkie effect)
function createRadioEffect(context: AudioContext): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 5;
  return filter;
}

// Animated filter sweep
function filterSweep(
  filter: BiquadFilterNode,
  context: AudioContext,
  fromFreq: number,
  toFreq: number,
  duration: number
): void {
  const now = context.currentTime;
  filter.frequency.setValueAtTime(fromFreq, now);
  filter.frequency.exponentialRampToValueAtTime(toFreq, now + duration);
}
```

### ConvolverNode (Reverb)

```typescript
// Load impulse response for convolution reverb
async function createReverb(
  context: AudioContext,
  impulseResponseUrl: string
): Promise<ConvolverNode> {
  const convolver = context.createConvolver();
  const response = await fetch(impulseResponseUrl);
  const arrayBuffer = await response.arrayBuffer();
  convolver.buffer = await context.decodeAudioData(arrayBuffer);
  return convolver;
}

// Procedural reverb (no file needed -- great for playable ads)
function createProceduralReverb(
  context: AudioContext,
  duration: number = 2,
  decay: number = 2
): ConvolverNode {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      channelData[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

// Wet/dry mix for reverb
function createReverbWithMix(
  context: AudioContext,
  convolver: ConvolverNode,
  wetAmount: number = 0.3
): { input: GainNode; output: GainNode } {
  const input = context.createGain();
  const output = context.createGain();
  const wetGain = context.createGain();
  const dryGain = context.createGain();

  wetGain.gain.value = wetAmount;
  dryGain.gain.value = 1 - wetAmount;

  input.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  input.connect(dryGain);
  dryGain.connect(output);

  return { input, output };
}
```

### DelayNode

```typescript
// Simple echo effect
function createEcho(
  context: AudioContext,
  delayTime: number = 0.3,
  feedback: number = 0.4
): { input: GainNode; output: GainNode } {
  const input = context.createGain();
  const output = context.createGain();
  const delay = context.createDelay(5); // max 5 seconds
  const feedbackGain = context.createGain();

  delay.delayTime.value = delayTime;
  feedbackGain.gain.value = feedback;

  // Direct path
  input.connect(output);

  // Feedback loop: input -> delay -> feedback -> delay -> ...
  input.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay); // feedback loop
  delay.connect(output);

  return { input, output };
}

// Stereo ping-pong delay
function createPingPongDelay(
  context: AudioContext,
  delayTime: number = 0.25,
  feedback: number = 0.3
): { input: GainNode; output: GainNode } {
  const input = context.createGain();
  const output = context.createGain();
  const delayL = context.createDelay(5);
  const delayR = context.createDelay(5);
  const feedbackGain = context.createGain();
  const panL = context.createStereoPanner();
  const panR = context.createStereoPanner();

  delayL.delayTime.value = delayTime;
  delayR.delayTime.value = delayTime;
  feedbackGain.gain.value = feedback;
  panL.pan.value = -1;
  panR.pan.value = 1;

  input.connect(output); // dry signal
  input.connect(delayL);
  delayL.connect(panL);
  panL.connect(output);
  delayL.connect(delayR);
  delayR.connect(panR);
  panR.connect(output);
  delayR.connect(feedbackGain);
  feedbackGain.connect(delayL);

  return { input, output };
}
```

---

## Audio for Playable Ads

### Size Constraints and Trade-offs

Playable ads have strict file size limits (2-5 MB for everything including code, assets, and audio). Audio files are often the first thing cut.

```
Typical budget breakdown for a 5MB playable ad:
- Code (JS/HTML/CSS):  200-400 KB
- Textures/Images:     2-3 MB (base64 encoded)
- Audio:               0-500 KB (often 0!)
- Spine/Animations:    500 KB - 1 MB
```

**Many playable ads ship with NO audio at all.** This is a legitimate design decision when every kilobyte matters.

### Procedural Audio with Oscillators (Zero File Size)

When you cannot afford audio files, you can generate sounds procedurally using oscillators. This costs zero bytes of file size.

```typescript
class ProceduralSFX {
  private context: AudioContext;
  private output: GainNode;

  constructor(context: AudioContext, output: GainNode) {
    this.context = context;
    this.output = output;
  }

  // Coin collect sound
  coin(): void {
    const now = this.context.currentTime;

    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const gain = this.context.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.1); // E6

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(987.77, now);
    osc2.frequency.setValueAtTime(1318.51, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.output);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  }

  // Jump sound (pitch sweep up)
  jump(): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(this.output);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Hit/impact sound
  hit(): void {
    const now = this.context.currentTime;

    // White noise burst
    const bufferSize = this.context.sampleRate * 0.1;
    const noiseBuffer = this.context.createBuffer(
      1,
      bufferSize,
      this.context.sampleRate
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.1);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    noise.start(now);
    noise.stop(now + 0.1);
  }

  // Explosion sound
  explosion(): void {
    const now = this.context.currentTime;

    // Low rumble oscillator
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

    // Noise burst
    const bufferSize = this.context.sampleRate * 0.5;
    const noiseBuffer = this.context.createBuffer(
      1,
      bufferSize,
      this.context.sampleRate
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(50, now + 0.5);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.output);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.5);
    noise.stop(now + 0.5);
  }

  // Button click
  click(): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.output);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Success/win jingle
  success(): void {
    const now = this.context.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const duration = 0.15;

    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, now + i * duration);
      gain.gain.linearRampToValueAtTime(0.2, now + i * duration + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        now + i * duration + duration
      );

      osc.connect(gain);
      gain.connect(this.output);

      osc.start(now + i * duration);
      osc.stop(now + i * duration + duration);
    });
  }

  // Failure/lose sound
  failure(): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.5);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    osc.start(now);
    osc.stop(now + 0.5);
  }
}
```

### Audio Volume from Ad SDKs

Some ad network SDKs provide volume information:

```typescript
// IronSource DAPI
function getAdAudioVolume(): number {
  if (typeof dapi !== 'undefined' && dapi.getAudioVolume) {
    return dapi.getAudioVolume(); // 0 to 1
  }
  return 0; // Default to muted if SDK not available
}

// Respect user's device volume setting
function initAudioForPlayableAd(context: AudioContext): GainNode {
  const masterGain = context.createGain();
  masterGain.connect(context.destination);

  const volume = getAdAudioVolume();
  masterGain.gain.value = volume;

  // Listen for volume changes
  if (typeof dapi !== 'undefined') {
    dapi.addEventListener('audioVolumeChange', (vol: number) => {
      masterGain.gain.setValueAtTime(vol, context.currentTime);
    });
  }

  return masterGain;
}
```

---

## Howler.js Library

Howler.js is the most popular audio library for web games. It abstracts Web Audio API and `<audio>` element differences, handles codec detection, and provides a simple API.

### Basic Usage

```typescript
import { Howl, Howler } from 'howler';

// Simple sound effect
const jumpSound = new Howl({
  src: ['jump.webm', 'jump.mp3'], // fallback chain
  volume: 0.5,
  rate: 1.0,
});

jumpSound.play();

// Sound sprite (multiple sounds in one file)
const sfx = new Howl({
  src: ['sfx-sprite.webm', 'sfx-sprite.mp3'],
  sprite: {
    coin: [0, 200], // [offset ms, duration ms]
    jump: [500, 300],
    explosion: [1000, 800],
    powerup: [2000, 500],
    hit: [3000, 150],
  },
});

sfx.play('coin');
sfx.play('explosion');

// Background music with looping
const bgMusic = new Howl({
  src: ['music.webm', 'music.mp3'],
  loop: true,
  volume: 0.3,
  html5: true, // Stream from disk instead of loading into memory
});

bgMusic.play();
```

### Advanced Howler.js Features

```typescript
// Spatial audio with Howler
const spatialSound = new Howl({
  src: ['footstep.mp3'],
  volume: 0.8,
});

const id = spatialSound.play();
spatialSound.pos(5, 0, -2, id); // x, y, z position
spatialSound.orient(0, 0, -1, id); // direction

// Set listener position
Howler.pos(0, 0, 0);
Howler.orientation(0, 0, -1, 0, 1, 0);

// Fade effects
const music = new Howl({ src: ['music.mp3'], loop: true, volume: 0 });
const musicId = music.play();
music.fade(0, 0.5, 2000, musicId); // Fade in over 2 seconds

// Rate (pitch) changes
const engine = new Howl({ src: ['engine.mp3'], loop: true });
const engineId = engine.play();
engine.rate(0.5, engineId); // Half speed
engine.rate(2.0, engineId); // Double speed

// Global controls
Howler.volume(0.5); // Global volume
Howler.mute(true); // Mute all
Howler.stop(); // Stop all
```

### Howler.js vs Raw Web Audio API

| Feature         | Howler.js       | Raw Web Audio API          |
| --------------- | --------------- | -------------------------- |
| File size       | ~10KB gzipped   | 0 (built-in)               |
| Codec fallback  | Automatic       | Manual                     |
| Sprite support  | Built-in        | Manual                     |
| Spatial audio   | Simplified API  | Full PannerNode control    |
| HTML5 streaming | Built-in toggle | Manual MediaElementSource  |
| Mobile unlock   | Automatic       | Manual                     |
| Pool management | Automatic       | Manual                     |
| Best for        | Most games      | Playable ads, custom needs |

**For playable ads**, Howler.js is usually too large. Use the raw Web Audio API or procedural audio instead.

---

## File Formats and Browser Support

### Format Comparison

| Format          | Compression  | Quality   | Size       | License                    | Browser Support                   |
| --------------- | ------------ | --------- | ---------- | -------------------------- | --------------------------------- |
| **MP3**         | Lossy        | Good      | Small      | Patented (free since 2017) | Universal                         |
| **OGG Vorbis**  | Lossy        | Good      | Small      | Free                       | Chrome, Firefox, Edge (no Safari) |
| **AAC**         | Lossy        | Better    | Small      | Patented                   | Safari, Chrome, Edge, Firefox     |
| **WAV**         | Uncompressed | Perfect   | Very Large | Free                       | Universal                         |
| **WebM (Opus)** | Lossy        | Excellent | Smallest   | Free                       | Chrome, Firefox, Edge (no Safari) |
| **FLAC**        | Lossless     | Perfect   | Large      | Free                       | Most modern browsers              |

### Codec Detection and Fallback

```typescript
function detectAudioSupport(): Record<string, boolean> {
  const audio = document.createElement('audio');

  return {
    mp3: audio.canPlayType('audio/mpeg') !== '',
    ogg: audio.canPlayType('audio/ogg; codecs="vorbis"') !== '',
    wav: audio.canPlayType('audio/wav') !== '',
    aac: audio.canPlayType('audio/aac') !== '',
    webm: audio.canPlayType('audio/webm; codecs="opus"') !== '',
    flac: audio.canPlayType('audio/flac') !== '',
  };
}

function getBestFormat(): string {
  const support = detectAudioSupport();
  // Prefer smallest format with good quality
  if (support.webm) return 'webm';
  if (support.ogg) return 'ogg';
  if (support.aac) return 'aac';
  if (support.mp3) return 'mp3';
  return 'wav'; // Last resort
}
```

### Recommended Strategy for Games

```typescript
// Provide multiple formats with fallback
async function loadSoundWithFallback(
  context: AudioContext,
  baseName: string,
  formats: string[] = ['webm', 'ogg', 'mp3']
): Promise<AudioBuffer> {
  for (const format of formats) {
    try {
      const url = `sounds/${baseName}.${format}`;
      const response = await fetch(url);
      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      return await context.decodeAudioData(arrayBuffer);
    } catch {
      continue; // Try next format
    }
  }
  throw new Error(`No supported audio format for: ${baseName}`);
}
```

### Size Considerations

```
1 second of audio at different qualities:
- WAV 16-bit 44.1kHz stereo:  ~176 KB
- MP3 128kbps:                 ~16 KB
- MP3 64kbps:                  ~8 KB
- OGG 96kbps:                  ~12 KB
- WebM Opus 64kbps:            ~8 KB

For playable ads (5MB total budget):
- Use mono (halves size)
- Use lowest acceptable bitrate (32-64kbps)
- Use short loops (2-4 seconds)
- Consider procedural audio (0 bytes)
```

---

## Performance and Memory

### Audio Pool Management

```typescript
class AudioResourceManager {
  private context: AudioContext;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private maxActiveSources: number;

  constructor(context: AudioContext, maxActiveSources: number = 32) {
    this.context = context;
    this.maxActiveSources = maxActiveSources;
  }

  async preload(name: string, url: string): Promise<void> {
    if (this.bufferCache.has(name)) return;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    this.bufferCache.set(name, audioBuffer);
  }

  async preloadAll(
    assets: Array<{ name: string; url: string }>
  ): Promise<void> {
    await Promise.all(
      assets.map((asset) => this.preload(asset.name, asset.url))
    );
  }

  play(name: string, output: AudioNode): AudioBufferSourceNode | null {
    const buffer = this.bufferCache.get(name);
    if (!buffer) {
      console.error(`Audio buffer "${name}" not loaded`);
      return null;
    }

    // Enforce pool limit
    if (this.activeSources.size >= this.maxActiveSources) {
      // Find and stop the oldest source
      const oldest = this.activeSources.values().next().value;
      if (oldest) {
        oldest.stop();
        this.activeSources.delete(oldest);
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);

    source.onended = () => {
      this.activeSources.delete(source);
    };

    this.activeSources.add(source);
    source.start(0);
    return source;
  }

  unload(name: string): void {
    this.bufferCache.delete(name);
  }

  unloadAll(): void {
    this.stopAll();
    this.bufferCache.clear();
  }

  stopAll(): void {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may have already stopped
      }
    });
    this.activeSources.clear();
  }

  getMemoryUsage(): { buffers: number; totalBytes: number } {
    let totalBytes = 0;
    this.bufferCache.forEach((buffer) => {
      // Each sample is 4 bytes (Float32)
      totalBytes += buffer.length * buffer.numberOfChannels * 4;
    });
    return {
      buffers: this.bufferCache.size,
      totalBytes,
    };
  }

  getActiveSourceCount(): number {
    return this.activeSources.size;
  }
}
```

### GC and Memory Best Practices

```typescript
// 1. Reuse AudioBuffers -- never decode the same file twice
// BAD: Decoding every time
async function playBad(url: string): Promise<void> {
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(data); // wasteful!
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

// GOOD: Cache decoded buffers
const bufferCache = new Map<string, AudioBuffer>();

async function playGood(url: string): Promise<void> {
  let buffer = bufferCache.get(url);
  if (!buffer) {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(data);
    bufferCache.set(url, buffer);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

// 2. Disconnect nodes when done to allow GC
// Nodes are GC'd when disconnected and not referenced

// 3. Limit concurrent sounds
// Mobile devices struggle with more than 16-32 simultaneous sounds

// 4. Use mono for SFX (halves memory)
// Stereo is only needed for music and ambient audio

// 5. Reduce sample rate for SFX
// 22050 Hz is sufficient for most sound effects (half the memory of 44100)
```

### Performance Tips Summary

| Tip                          | Impact | Details                            |
| ---------------------------- | ------ | ---------------------------------- |
| Cache AudioBuffers           | High   | Decode once, reuse many times      |
| Limit concurrent sounds      | High   | 16-32 max on mobile                |
| Use mono for SFX             | Medium | 50% memory reduction               |
| Lower sample rate for SFX    | Medium | 22050 Hz sufficient                |
| Disconnect unused nodes      | Medium | Allows garbage collection          |
| Use sound sprites            | Medium | Fewer HTTP requests, less overhead |
| Avoid creating AudioContexts | High   | Max 6-8 per page; use one          |
| Pre-decode during loading    | Medium | Avoid decode lag during gameplay   |

---

## Interview Questions

### Q1: How does the Web Audio API differ from the `<audio>` HTML element? When would you use each?

**Answer:**

The `<audio>` element is a high-level API for simple playback: play, pause, seek, volume. It streams audio from a URL and is suitable for background music or simple media players.

The Web Audio API is a low-level, graph-based audio processing system. Key differences:

- **Latency**: Web Audio API provides near-zero latency playback from decoded buffers. `<audio>` has unpredictable latency due to streaming and buffering.
- **Multiple simultaneous sounds**: Web Audio API can play hundreds of overlapping sounds. `<audio>` elements must each be created individually.
- **Processing**: Web Audio API offers filters, spatialization, effects, mixing. `<audio>` has only volume and playback rate.
- **Timing precision**: Web Audio API uses `AudioContext.currentTime` (high-precision hardware clock). `<audio>` relies on `setTimeout`/`setInterval`.
- **Memory model**: Web Audio API decodes entire files into memory (AudioBuffer). `<audio>` streams progressively.

Use `<audio>` for: long music tracks where streaming is preferred, simple podcast/media players, fallback when Web Audio is unavailable.

Use Web Audio API for: sound effects requiring precise timing, spatial audio, real-time audio processing, games.

Hybrid approach: Use `MediaElementAudioSourceNode` to stream via `<audio>` but process through the Web Audio graph.

---

### Q2: Explain autoplay restrictions and how you handle them in a game.

**Answer:**

Modern browsers require user interaction (click, tap, key press) before allowing audio playback. An `AudioContext` is created in a `suspended` state and must be explicitly resumed within a user gesture event handler.

Strategies:

1. **Start screen**: Show a "Tap to Play" overlay. Resume AudioContext in the click handler. This is the most reliable approach.
2. **Silent buffer trick**: On the first user interaction, play a tiny silent buffer to unlock audio on iOS Safari.
3. **Listen for multiple gesture types**: Attach resume logic to `click`, `touchstart`, `touchend`, and `keydown` to catch any interaction.
4. **Degrade gracefully**: If audio cannot be unlocked, the game should still be fully playable without sound.

iOS has additional requirements: the AudioContext must be created or resumed in the same synchronous call stack as the user gesture.

---

### Q3: How would you implement audio for a playable ad with a 5MB total size limit?

**Answer:**

Given the extreme size constraints:

1. **Consider shipping with no audio.** Many successful playable ads have no sound at all. This frees the entire audio budget for visual assets.

2. **Procedural audio using OscillatorNode.** Generate sound effects in code using oscillators and noise buffers. This adds zero bytes to the file size. You can create convincing coin, jump, hit, explosion, and click sounds procedurally.

3. **If file-based audio is required:**

   - Use a single sound sprite file containing all SFX
   - Encode as MP3 mono at 32-64kbps (the lowest acceptable quality)
   - Keep total audio under 50-100KB
   - Use base64 encoding to inline the audio data in the HTML file (required by most ad networks)

4. **Respect the ad SDK's audio volume:** IronSource's DAPI provides `getAudioVolume()`. Some users have their device muted, and the ad should respect that.

5. **Autoplay handling:** The ad container (MRAID/DAPI) may or may not allow auto-playing audio. Always gate audio behind a user interaction or SDK readiness callback.

---

### Q4: What is a sound sprite and why is it useful?

**Answer:**

A sound sprite is a single audio file containing multiple short sound effects concatenated together, with a metadata map defining each effect's start offset and duration. It is the audio equivalent of a texture atlas/sprite sheet.

Benefits:

- **Fewer HTTP requests**: One file instead of many, important for load time
- **Required for playable ads**: Many ad networks require a single HTML file with all assets inlined
- **Simpler caching**: One file to cache instead of many
- **Reduced overhead**: One decode operation for all sounds

Implementation: Load the full AudioBuffer, then use `source.start(when, offset, duration)` to play specific segments.

Drawbacks:

- Editing individual sounds requires regenerating the sprite
- Slight overhead from loading sounds you may not use
- Cannot independently adjust sample rate per sound

---

### Q5: Describe the audio graph concept and how you would set up audio routing for a game.

**Answer:**

The Web Audio API uses a directed graph of audio nodes. Audio flows from source nodes through processing nodes to the destination (speakers). Nodes are connected via `node.connect(destination)`.

For a game, I set up a hierarchical bus structure:

```
Sources -> [SFX Bus (GainNode)] -> [Master Bus (GainNode)] -> Destination
Sources -> [Music Bus (GainNode)] ->
Sources -> [UI Bus (GainNode)] ->
```

Each bus is a `GainNode` that controls the volume of its category. The master bus controls overall volume. This lets the player independently adjust SFX, music, and UI volumes from a settings menu.

For more complex games, I add processing nodes per bus:

- Music bus might have a `DynamicsCompressorNode` for normalization
- SFX bus might have a `ConvolverNode` for environment reverb
- A `BiquadFilterNode` on the master bus for effects like underwater muffling

The key principle is that `AudioBufferSourceNode` instances are cheap and disposable (one per play), but the routing graph (gain nodes, filters) should be persistent and reused.

---

### Q6: How do you implement crossfading between two music tracks?

**Answer:**

Crossfading requires two active sources playing simultaneously during the transition period. The outgoing track fades out while the incoming track fades in.

Implementation:

1. Create a new `AudioBufferSourceNode` for the incoming track.
2. Connect it through a `GainNode` set to 0.
3. Start playback of the new source.
4. Use `linearRampToValueAtTime` or `exponentialRampToValueAtTime` to ramp the new track's gain up to the target volume over the crossfade duration.
5. Simultaneously ramp the old track's gain down to 0 over the same duration.
6. After the transition completes, stop and disconnect the old source.

An important consideration is using equal-power crossfading (cosine curve) rather than linear crossfading. Linear crossfading causes a perceived volume dip in the middle of the transition because human perception of loudness is logarithmic. With `exponentialRampToValueAtTime`, you get a more natural-sounding transition.

---

### Q7: What are the performance considerations for audio in mobile web games?

**Answer:**

Key considerations:

1. **Concurrent sound limit**: Mobile devices handle 16-32 simultaneous sounds well. Beyond that, audio quality degrades or sounds are silently dropped. Implement a sound pool with eviction of oldest/quietest sounds.

2. **Memory**: `AudioBuffer` stores decoded PCM data in memory. A 10-second stereo 44.1kHz sound uses ~3.4MB of RAM. Use mono for SFX, lower sample rates (22050Hz) where quality permits, and unload unused buffers.

3. **Decoding cost**: `decodeAudioData()` is expensive. Decode during loading screens, not during gameplay. Cache decoded buffers.

4. **AudioContext creation**: Limited to 6-8 per page. Use a single context for the entire game.

5. **Garbage collection**: Disconnected audio nodes are eligible for GC. Explicitly disconnect nodes and null references when done. Avoid creating GC pressure during gameplay.

6. **iOS specifics**: Audio must be unlocked via user gesture. Only one `AudioContext` is reliable. Web Audio resumes after phone calls/interruptions only if properly handled.

7. **Battery**: Continuous audio processing drains battery. Suspend the AudioContext when the game is paused or backgrounded. Use `document.visibilitychange` to detect.

---

### Q8: Explain how 3D positional audio works in the Web Audio API.

**Answer:**

3D positional audio is implemented using the `PannerNode` and `AudioListener`.

The `AudioListener` (accessed via `context.listener`) represents the player's ears. You set its position, forward direction, and up direction in world space.

The `PannerNode` is attached to each sound source and set to a position in the same world space. The Web Audio API calculates the relative position, applies distance attenuation, and pans the stereo output accordingly.

Key `PannerNode` properties:

- **`panningModel`**: `'equalpower'` (simple stereo panning) or `'HRTF'` (head-related transfer function for realistic 3D with headphones).
- **`distanceModel`**: `'linear'`, `'inverse'`, or `'exponential'` -- controls how volume decreases with distance.
- **`refDistance`**: Distance at which volume begins to attenuate.
- **`maxDistance`**: Maximum distance (linear model caps here).
- **`rolloffFactor`**: Controls how quickly volume drops off.
- **`coneInnerAngle`/`coneOuterAngle`/`coneOuterGain`**: Directional sound cone.

For a 2D game, you can simplify by using `StereoPannerNode` (just left/right panning) instead of the full 3D `PannerNode`.

---

### Q9: How would you generate a procedural "coin collect" sound effect using only the Web Audio API?

**Answer:**

A coin collect sound consists of two quick ascending tones:

1. Create two `OscillatorNode` instances with `'square'` waveform (chip-tune character).
2. Set the first note (e.g., B5 at 987 Hz) for the first 100ms.
3. Jump to the second note (e.g., E6 at 1318 Hz) for the next 100ms.
4. Apply a `GainNode` with a quick exponential decay envelope.
5. Connect through the audio graph and schedule with `start()`/`stop()`.

The slight detune between the two oscillators creates a richer "shimmer" effect. The square wave gives it that retro game feel. The ascending pitch gives the positive "collected!" feeling.

This technique uses zero bytes of audio file data, making it ideal for playable ads.

---

### Q10: What happens if you call `source.start()` twice on the same `AudioBufferSourceNode`?

**Answer:**

It throws an `InvalidStateError`. `AudioBufferSourceNode` instances are **one-shot** -- they can only be started once. This is by design in the Web Audio API specification.

To play the same sound again, you must create a new `AudioBufferSourceNode`, set its `buffer` property to the same `AudioBuffer`, connect it to the graph, and call `start()`.

This is why audio pooling and resource management are important: you frequently create source nodes. However, creating a source node is very cheap -- the expensive part is decoding the audio data into the `AudioBuffer`, which you do only once and reuse.

The `AudioBuffer` itself is completely reusable and can be shared across any number of source nodes simultaneously.

---

### Q11: How do you handle audio when the browser tab becomes hidden?

**Answer:**

When a tab is hidden, browsers may throttle or suspend audio. Games should explicitly manage this:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Suspend audio context to save resources
    audioContext.suspend();
  } else {
    // Resume when tab is visible again
    audioContext.resume();
  }
});
```

This prevents audio from continuing to play in the background (which wastes battery and annoys users) and ensures clean resumption when the tab is visible again.

For games specifically, this should be coupled with pausing the game loop. You should not let game audio and game state get out of sync.

---

### Q12: Compare the tradeoffs between using Howler.js and the raw Web Audio API for a game project.

**Answer:**

**Howler.js advantages:**

- Automatic codec detection and fallback
- Built-in sound sprite support
- Automatic mobile audio unlock
- Simple API for common tasks
- Handles edge cases across browsers
- Sound pooling built-in

**Raw Web Audio API advantages:**

- Zero additional file size (critical for playable ads)
- Full control over the audio graph
- Custom effects chains
- Procedural audio generation
- No dependency to maintain
- Better TypeScript support (native types)

**Decision framework:**

- **Standard web game** (no strict size limits): Use Howler.js. The 10KB cost is negligible.
- **Playable ad** (2-5MB total): Use raw Web Audio API. Every kilobyte matters.
- **Complex audio requirements** (adaptive music, custom DSP): Use raw Web Audio API for the control it provides.
- **Quick prototype**: Use Howler.js for speed of development.
