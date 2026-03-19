# Audio for Video

A comprehensive guide to recording, processing, and mixing audio for video content.
Audio quality is the single biggest factor in whether viewers stay or leave — bad video
is tolerable, bad audio is not.

---

## Table of Contents

1. [Why Audio Matters More Than Video](#1-why-audio-matters-more-than-video)
2. [Sound Fundamentals for Creators](#2-sound-fundamentals-for-creators)
3. [Microphone Types](#3-microphone-types)
4. [Microphone Polar Patterns](#4-microphone-polar-patterns)
5. [Recording Setup Scenarios](#5-recording-setup-scenarios)
6. [Recording Levels and Monitoring](#6-recording-levels-and-monitoring)
7. [Room Acoustics and Treatment](#7-room-acoustics-and-treatment)
8. [Audio Post-Processing](#8-audio-post-processing)
9. [Music and Sound Effects](#9-music-and-sound-effects)
10. [Recommended Gear by Budget](#10-recommended-gear-by-budget)

---

## 1. Why Audio Matters More Than Video

Studies consistently show that viewers will watch a video with poor image quality but
good audio, but will **not** watch a video with great image quality and poor audio.

```
Viewer Tolerance Test:

    Good Video + Bad Audio  ──►  ❌ Viewers leave in seconds
    Bad Video + Good Audio  ──►  ✓  Viewers stay and listen
    Good Video + Good Audio ──►  ✓✓ Viewers stay and enjoy

Conclusion: Fix your audio FIRST, then worry about video quality.
```

### The 70/30 Rule

Spend **70% of your initial effort** on getting audio right. You can color correct
mediocre footage, but you cannot fix terrible audio in post.

## 2. Sound Fundamentals for Creators

### 2.1 Key Audio Properties

| Property                    | What It Means for You                                         |
| --------------------------- | ------------------------------------------------------------- |
| Volume (Amplitude)          | How loud the recording is — aim for -12 to -6 dB peaks        |
| Frequency                   | Pitch of the sound — human voice is 85-255 Hz fundamental     |
| Dynamic range               | Difference between quietest and loudest parts                 |
| Signal-to-noise ratio (SNR) | Your voice vs background noise — higher is better             |
| Sample rate                 | How often audio is captured per second — use 48 kHz for video |
| Bit depth                   | Precision of each sample — use 24-bit for recording           |

### 2.2 Decibels (dB) — The Volume Scale

Decibels use a logarithmic scale. In digital audio, 0 dBFS (Full Scale) is the
absolute maximum — anything above clips and distorts.

```
     0 dBFS  ──────── MAXIMUM (clipping = distortion) ██████████████
    -3 dBFS  ──────── Too loud, risk of clipping       ████████████
    -6 dBFS  ──────── Peak target for voice             ██████████
   -12 dBFS  ──────── Average target for voice          ████████
   -20 dBFS  ──────── Quiet speech                      █████
   -40 dBFS  ──────── Room tone / ambient noise          ██
   -60 dBFS  ──────── Very quiet noise floor              █
   -96 dBFS  ──────── Silence (16-bit limit)              .

   Sweet spot for recording: peaks at -6 dB, average at -12 to -18 dB
```

### 2.3 Sample Rate and Bit Depth

| Setting     | Standard   | Why                                                                 |
| ----------- | ---------- | ------------------------------------------------------------------- |
| Sample rate | **48 kHz** | Industry standard for video (not 44.1 kHz, that is for music CDs)   |
| Bit depth   | **24-bit** | More headroom for quiet recordings; 16-bit is fine for final export |

> **Important**: Always record at **48 kHz / 24-bit**. This matches video industry
> standards and gives you maximum flexibility in post-production.

## 3. Microphone Types

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MICROPHONE TYPES FOR CREATORS                     │
├────────────────┬────────────────┬────────────────┬─────────────────┤
│   LAVALIER     │   SHOTGUN      │   USB DESKTOP  │   HANDHELD      │
│   (Lapel)      │   (Boom)       │   (Condenser)  │   (Dynamic)     │
│                │                │                │                 │
│   ┌──┐         │   ╔══╗         │   ┌────────┐   │   ┌──────┐     │
│   │●│← tiny   │   ║  ║← long  │   │        │   │   │  ●   │     │
│   └┬┘          │   ║  ║  barrel │   │   ●    │   │   │  │   │     │
│    │ wire      │   ╠══╣         │   │        │   │   │  │   │     │
│    │           │   ║  ║         │   └───┬────┘   │   └──┴───┘     │
│    │           │   ╚══╝         │       │        │                 │
│                │                │    USB cable   │                 │
│ Clips to       │ Mounted on     │ Sits on desk   │ Held in hand   │
│ clothing      │ camera or boom │                │ or stand        │
│                │                │                │                 │
│ Best for:      │ Best for:      │ Best for:      │ Best for:       │
│ - Vlogs        │ - Film sets    │ - Podcasts     │ - Dynamic       │
│ - Interviews   │ - On-camera    │ - Voiceover    │   environments  │
│ - Weddings     │ - Documentary  │ - Desktop      │ - Noisy rooms   │
│ - Stealth      │                │   recording    │ - Interviews    │
└────────────────┴────────────────┴────────────────┴─────────────────┘
```

### 3.2 Detailed Comparison

| Type                | Proximity               | Background Rejection | Visibility         | Price Range |
| ------------------- | ----------------------- | -------------------- | ------------------ | ----------- |
| Lavalier (wired)    | Excellent (on body)     | Moderate             | Hidden on clothing | $20-300     |
| Lavalier (wireless) | Excellent               | Moderate             | Small transmitter  | $50-600     |
| Shotgun (on-camera) | Good (2-4 feet)         | Good                 | On camera top      | $50-500     |
| Shotgun (boom)      | Excellent (overhead)    | Excellent            | Off-camera         | $200-1,000  |
| USB condenser       | Excellent (6-12 inches) | Poor-moderate        | Visible on desk    | $50-300     |
| Dynamic (XLR/USB)   | Excellent (2-6 inches)  | Excellent            | Visible            | $50-400     |

### 3.3 Condenser vs Dynamic

| Property              | Condenser                         | Dynamic                             |
| --------------------- | --------------------------------- | ----------------------------------- |
| Sensitivity           | High (picks up everything)        | Low (rejects background)            |
| Detail                | Very detailed, crisp              | Warm, smooth                        |
| Background noise      | Picks up room noise, keyboard, AC | Rejects most background noise       |
| Proximity needed      | 6-12 inches                       | 2-6 inches (close)                  |
| Power needed          | Phantom power (48V) or USB        | None (or USB)                       |
| Room treatment needed | Yes, critical                     | Less critical                       |
| Best for              | Treated rooms, voiceover          | Untreated rooms, noisy environments |

> **For home offices without acoustic treatment**: Use a **dynamic microphone** (like
> Shure SM7B, Rode PodMic, or Samson Q2U). It will reject keyboard noise, AC hum,
> and room echo much better than a condenser.

## 4. Microphone Polar Patterns

The polar pattern describes which directions a microphone picks up sound from.

```
Cardioid (most common):          Omnidirectional:            Figure-8:

        ┌───┐                        ┌───┐                    ┌───┐
      ╱│     │╲                   ╱ │     │ ╲                 │     │
    ╱  │     │  ╲               ╱   │     │   ╲            ╱ │     │ ╲
   │   │     │   │             │    │     │    │          │  │     │  │
   │   │ MIC │   │             │    │ MIC │    │          │  │ MIC │  │
   │   │     │   │             │    │     │    │          │  │     │  │
    ╲  │     │  ╱               ╲   │     │   ╱            ╲ │     │ ╱
      ╲│     │╱                   ╲ │     │ ╱                 │     │
        └───┘                        └───┘                    └───┘
   Picks up FRONT              Picks up ALL              Picks up FRONT
   Rejects BACK                directions equally        and BACK only

   Best for:                   Best for:                 Best for:
   - Solo talking head         - Ambient recording       - Two-person
   - Podcasts (solo)           - Lapel mics              - Face-to-face
   - Voiceover                 - Group round-table         interview
```

| Pattern                  | Picks Up       | Rejects           | Best Use              |
| ------------------------ | -------------- | ----------------- | --------------------- |
| Cardioid                 | Front          | Back and sides    | Solo recording, vlogs |
| Supercardioid            | Narrow front   | Sides (some back) | Noisy environments    |
| Omnidirectional          | All directions | Nothing           | Ambient, lavalier     |
| Figure-8 (Bidirectional) | Front and back | Sides             | Two-person interview  |

## 5. Recording Setup Scenarios

### 5.1 Solo Talking Head (Desk Setup)

```
                    ┌──────────┐
                    │  Camera  │
                    │  (phone/ │
                    │  webcam) │
                    └────┬─────┘
                         │
    ┌────────────────────┼──────────────────────┐
    │                    │                      │
    │     ┌──────────┐   │   ┌──────────────┐   │
    │     │ Monitor  │   │   │  USB Mic on   │   │
    │     │          │   │   │  boom arm     │   │
    │     └──────────┘   │   │  ┌───┐        │   │
    │                    │   │  │ ● │ ← 6-10"│   │
    │              👤 ◄──┤───┤  └───┘  from   │   │
    │           (You)    │   │    mouth       │   │
    │                    │   └──────────────┘   │
    └────────────────────┴──────────────────────┘
                      DESK
```

**Equipment needed**: USB microphone + boom arm ($30-80 total for budget options)

### 5.2 Vlog (Walking and Talking)

```
Option A: Wireless Lav          Option B: On-Camera Shotgun

      TX ─ ─ ─ ─ ► RX               Shotgun mic
   (on you)     (on camera)          ┌═══╗
   ┌──┐         ┌──┐                 ║   ║
   │TX│         │RX│                 ╠═══╣
   └┬─┘         └┬─┘                 ║   ║
    │             │                   ╚═══╝
   ●lav          camera               │
   mic           hotshoe              camera
                 mount                mount

   Sound quality: Excellent        Sound quality: Good (if within 3 feet)
   Freedom: Full movement          Freedom: Must stay near camera
   Cost: $50-600                   Cost: $50-200
```

### 5.3 Interview (Two People)

```
                    Camera
                      📷
                     /   \
                    /     \
                   /       \
          Person A 👤     👤 Person B
          Lav mic ●       ● Lav mic
                   \     /
                    \   /
                   Recorder
                   (or camera
                    dual input)
```

**Best approach**: Two wireless lavalier mics, each on a separate audio channel.
This gives you independent volume control in post.

### 5.4 Podcast (Desktop)

```
        ┌──────────────────────────────────────┐
        │                                      │
        │   ┌───┐               ┌───┐          │
        │   │Mic│  👤  ◄────►  👤  │Mic│          │
        │   │ A │ Host         Guest│ B │          │
        │   └─┬─┘               └─┬─┘          │
        │     │                   │            │
        │     └───────┬───────────┘            │
        │             │                        │
        │         Audio Interface              │
        │         (2+ channels)                │
        │             │                        │
        │          Computer                    │
        │        (DAW recording)               │
        └──────────────────────────────────────┘
```

**Best approach**: Two dynamic microphones into an audio interface. Record each mic
on a separate track.

## 6. Recording Levels and Monitoring

### 6.1 Setting Levels

```
    Level Meter
    ┌───────────────────────────────────────┐
    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░│  -6 dB peak ✓ Good
    └─────────────��─────────────────────────┘

    ┌───────────────────────────────────────┐
    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  0 dB = CLIPPING ✗
    └───────────────────────────────────────┘

    ┌───────────────────────────────────────┐
    │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░│  -20 dB = too quiet ✗
    └───────────────────────────────────────┘

    Target: Normal speech peaks at -12 to -6 dB
            Loud speech/laughing stays below -3 dB
            Average level around -18 to -12 dB
```

### 6.2 Headphone Monitoring

**Always monitor your audio with headphones while recording.**

| What to Listen For    | What It Means                         |
| --------------------- | ------------------------------------- |
| Hiss / white noise    | Gain too high, or noisy preamp        |
| Rumble / low hum      | AC interference, handling noise       |
| Plosives (P/B pops)   | Too close, need pop filter            |
| Sibilance (harsh S)   | Mic too bright, angle mic off-axis    |
| Room echo             | Need acoustic treatment or closer mic |
| Clipping / distortion | Level too high, reduce gain           |

### 6.3 The Clap Sync

When recording audio separately from video (dual system), use a hand clap or clapboard
at the start of each take. The spike in the waveform and the visual of hands meeting
give you a sync point in post.

```
Video:  ... ... ... 👏 ... talking ...
                     │
Audio:  ─────────────┤╱╲╱────────────
                     │ spike
                     │
              Sync point
```

## 7. Room Acoustics and Treatment

### 7.1 Why Rooms Sound Bad

Sound bounces off hard, flat surfaces (walls, desks, monitors). These reflections
arrive at the microphone milliseconds after the direct sound, creating echo and
a "roomy" quality.

```
Direct sound:                    With reflections:

    Source ──────► Mic               Source ──────────► Mic
                                        │    ╱          ▲
    Clean, clear                        │   ╱           │
                                        ▼  ╱         ╱  │
                                      Wall ╱    Wall    │
                                           ╱  bounce    │
                                                        │
                                    Multiple delayed copies = echo/reverb
```

### 7.2 Budget Room Treatment

| Treatment            | Cost     | Effectiveness | How                                      |
| -------------------- | -------- | ------------- | ---------------------------------------- |
| Closet recording     | Free     | Excellent     | Record in a closet full of clothes       |
| Blanket fort         | Free     | Good          | Hang blankets around your recording area |
| Bookshelf diffusion  | Free     | Moderate      | Place bookshelves on walls behind you    |
| Moving blankets      | $20-40   | Very good     | Hang thick blankets on stands or walls   |
| Acoustic foam panels | $30-80   | Good          | Place at reflection points on walls      |
| Professional panels  | $100-400 | Excellent     | Rockwool/fiberglass panels in frames     |

### 7.3 Quick Fixes

1. **Close the door and windows** — Reduce outside noise
2. **Turn off AC/fans** during recording — Remove mechanical noise
3. **Put your phone on silent** — Eliminate notification sounds
4. **Carpet/rug on the floor** — Reduce floor reflections
5. **Thick curtains** — Dampen window reflections
6. **Microphone closer to mouth** — Better signal-to-noise ratio

> **The #1 cheapest improvement**: Move the microphone closer to your mouth. Going from
> 24 inches to 6 inches away can improve your audio quality more than any $500 acoustic
> treatment.

## 8. Audio Post-Processing

### 8.1 The Processing Chain

Apply these effects in this order for voice recording:

```
Raw Recording
      │
      ▼
┌─────────────┐
│ 1. Noise    │   Remove background hiss, hum, AC noise
│    Removal  │   Tools: Audacity noise reduction, Adobe Podcast AI
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 2. EQ       │   Shape the tone of the voice
│ (Equalizer) │   Cut lows < 80Hz, boost presence 2-5 kHz
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 3. Compress │   Reduce dynamic range (make quiet parts louder,
│             │   loud parts quieter). Ratio: 3:1 to 4:1
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 4. De-ess   │   Tame harsh "S" and "SH" sounds
│             │   Target 5-8 kHz range
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 5. Limiter  │   Catch any remaining peaks before they clip
│             │   Set ceiling to -1 dBFS
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 6. Normalize│   Bring overall level to target loudness
│             │   Target: -16 LUFS for YouTube
└─────────────┘
```

### 8.2 EQ for Voice

```
Frequency Guide for Human Voice:

    20 Hz     80 Hz    250 Hz    1 kHz    2-5 kHz   8-12 kHz   20 kHz
      │         │        │        │         │          │         │
      │    Cut  │        │   Mud  │  Body   │ Presence │  Air    │
      │  ◄────► │        │◄─────►│◄───────►│◄────────►│◄──────►│
      │  Rumble │        │ Boxey  │ Warmth  │ Clarity  │Sparkle │
      │         │        │       │         │          │         │
    ╱  ╲                ╱ ╲              ╱     ╲
   ╱    ╲  ← CUT      ╱   ╲  ← CUT    ╱       ╲  ← BOOST
  ╱      ╲           ╱     ╲         ╱         ╲
```

| Frequency   | Action                     | Why                                      |
| ----------- | -------------------------- | ---------------------------------------- |
| Below 80 Hz | High-pass filter (cut)     | Remove rumble, handling noise, room boom |
| 200-400 Hz  | Slight cut if needed       | Reduce "muddiness" or "boxiness"         |
| 1-2 kHz     | Leave flat or slight boost | Natural body of the voice                |
| 2-5 kHz     | Gentle boost (+2-3 dB)     | Adds clarity and presence                |
| 8-12 kHz    | Subtle boost (+1-2 dB)     | Adds "air" and openness                  |

### 8.3 Compression Settings for Voice

| Parameter   | Setting                   | What It Does                              |
| ----------- | ------------------------- | ----------------------------------------- |
| Threshold   | -18 to -12 dB             | Level where compression starts            |
| Ratio       | 3:1 to 4:1                | How much to reduce signal above threshold |
| Attack      | 5-10 ms                   | How fast compression kicks in             |
| Release     | 50-100 ms                 | How fast compression stops                |
| Makeup gain | +3-6 dB (adjust to taste) | Boost overall level after compression     |

### 8.4 Loudness Standards

| Platform           | Target Loudness | Peak Level |
| ------------------ | --------------- | ---------- |
| YouTube            | -14 to -16 LUFS | -1 dBTP    |
| Podcasts (Apple)   | -16 LUFS        | -1 dBTP    |
| Podcasts (Spotify) | -14 LUFS        | -1 dBTP    |
| Broadcast TV       | -24 LUFS        | -2 dBTP    |
| Streaming (music)  | -14 LUFS        | -1 dBTP    |

> **LUFS** (Loudness Units Full Scale) measures perceived loudness over time, unlike
> dB which measures instantaneous level. YouTube will turn down loud audio and boost
> quiet audio to normalize around -14 LUFS.

### 8.5 AI-Powered Audio Tools

| Tool                           | What It Does                          | Price             |
| ------------------------------ | ------------------------------------- | ----------------- |
| Adobe Podcast (Enhance Speech) | AI noise removal, room echo removal   | Free (web)        |
| Descript                       | AI transcription, filler word removal | $24/mo            |
| Krisp                          | Real-time AI noise cancellation       | Free tier / $8/mo |
| LALAL.AI                       | Separate voice from music/noise       | Free tier / $15   |
| Audacity + noise reduction     | Manual noise profile removal          | Free              |

> **Quick win**: Upload your audio to Adobe Podcast's "Enhance Speech" feature. It will
> remove background noise, reduce echo, and improve clarity in seconds — for free.

## 9. Music and Sound Effects

### 9.1 Why Background Music Matters

Background music:

- Sets the **emotional tone** of your video
- Smooths over **awkward silences** and transitions
- Makes your content feel **more professional**
- Helps **maintain attention** during slower segments

### 9.2 Music Volume Guidelines

```
Dialogue/Voice:     ████████████████████  (0 dB, full volume)
Background Music:   ████░░░░░░░░░░░░░░░░  (-18 to -24 dB below voice)
Sound Effects:      ██████████░░░░░░░░░░  (-6 to -12 dB below voice)

Rule: Viewers should NEVER have to strain to hear your voice over music.
Music should be felt, not consciously heard.
```

### 9.3 Royalty-Free Music Sources

| Source                | Quality   | Price             | License              |
| --------------------- | --------- | ----------------- | -------------------- |
| YouTube Audio Library | Good      | Free              | Free for YouTube     |
| Epidemic Sound        | Excellent | $13/mo (personal) | Full clearance       |
| Artlist               | Excellent | $10/mo            | Universal license    |
| Musicbed              | Premium   | $10/mo+           | Cinematic quality    |
| Free Music Archive    | Variable  | Free              | Various CC licenses  |
| Uppbeat               | Good      | Free tier / $7/mo | Cleared for YouTube  |
| Pixabay Music         | Good      | Free              | CC0 (no attribution) |

> **Warning**: Never use copyrighted music without a license. YouTube's Content ID system
> will detect it and either mute your video, demonetize it, or give the revenue to the
> music rights holder.

### 9.4 Sound Effects

Sound effects add polish and emphasis:

| Effect Type | When to Use                           | Example                   |
| ----------- | ------------------------------------- | ------------------------- |
| Whoosh      | Transitions, text appearing           | Swipe between scenes      |
| Pop/Click   | Highlighting points, subscribe button | Click sound on text popup |
| Ambient     | Establishing atmosphere               | Coffee shop, city, nature |
| Impact      | Emphasizing key moments               | Bass drop on reveal       |
| Typing/UI   | Tech tutorials, overlays              | Keyboard clicks           |

**Free SFX sources**: Freesound.org, Pixabay Sound Effects, YouTube Audio Library

## 10. Recommended Gear by Budget

### Budget: Free (What You Already Have)

| Item               | Solution                                          |
| ------------------ | ------------------------------------------------- |
| Microphone         | Wired earbuds (surprisingly decent proximity mic) |
| Monitoring         | Same earbuds                                      |
| Recording software | GarageBand (Mac), Audacity (all platforms)        |
| Noise removal      | Adobe Podcast Enhance (free web tool)             |

### Budget: $50-100

| Item         | Product                       | Price  |
| ------------ | ----------------------------- | ------ |
| Lavalier mic | Boya BY-M1 (wired, 3.5mm)     | $20    |
| USB mic      | Fifine K669 or Maono AU-PM421 | $30-50 |
| Boom arm     | Generic desk arm              | $15-25 |
| Pop filter   | Generic foam/mesh             | $5-10  |

### Budget: $200-400

| Item               | Product                       | Price    |
| ------------------ | ----------------------------- | -------- |
| Wireless lav       | Rode Wireless GO II           | $200-250 |
| OR USB dynamic mic | Rode PodMic USB or Samson Q2U | $100-130 |
| Boom arm           | Rode PSA1+                    | $100     |
| Headphones         | Audio-Technica ATH-M50x       | $130     |

### Budget: $500-1,000

| Item            | Product                           | Price    |
| --------------- | --------------------------------- | -------- |
| Wireless lav    | Rode Wireless PRO or DJI Mic 2    | $250-380 |
| Desktop dynamic | Shure SM7dB (built-in preamp)     | $400     |
| Audio interface | Focusrite Scarlett Solo (4th gen) | $110     |
| Boom arm        | Rode PSA1+                        | $100     |
| Headphones      | Beyerdynamic DT 700 Pro X         | $180     |

### Recommended Progression

```
Start here:          First upgrade:        Full setup:
Wired earbuds   ──►  Wireless lav    ──►   Wireless lav (field)
                      (Rode GO II)          + Desktop dynamic (studio)
                                            + Audio interface
```

---

**Previous**: [01 - Camera & Shooting Basics](01-CAMERA-SHOOTING-BASICS.md)
**Next**: [03 - Video Editing Fundamentals](03-VIDEO-EDITING-FUNDAMENTALS.md)
