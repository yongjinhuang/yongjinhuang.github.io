# Camera & Shooting Basics

A comprehensive guide for software engineers learning video production from scratch. This
document covers how cameras work, the exposure triangle, composition, lighting, and
practical shooting techniques you will use every day.

---

## Table of Contents

1. [How a Digital Camera Works](#1-how-a-digital-camera-works)
2. [The Exposure Triangle](#2-the-exposure-triangle)
3. [Focus and Depth of Field](#3-focus-and-depth-of-field)
4. [White Balance and Color Temperature](#4-white-balance-and-color-temperature)
5. [Composition Rules](#5-composition-rules)
6. [Camera Movement](#6-camera-movement)
7. [Lighting Fundamentals](#7-lighting-fundamentals)
8. [Resolution, Frame Rate, and Codec Settings](#8-resolution-frame-rate-and-codec-settings)
9. [Shooting with a Smartphone](#9-shooting-with-a-smartphone)
10. [Common Mistakes and How to Fix Them](#10-common-mistakes-and-how-to-fix-them)

---

## 1. How a Digital Camera Works

### 1.1 The Light Path

```
                                         Image Sensor
    Scene                                (CMOS/CCD)
      │                                      │
      │    Light rays                        │
      │  ──────────►  ┌──────┐   ──────►   ┌─┤
      │               │      │              │ │  ──► ADC ──► Image Processor ──► File
      │  ──────────►  │ Lens │   ──────►   │ │
      │               │      │              └─┤
      │  ──────────►  └──────┘   ──────►     │
      │                  │                    │
                    Aperture              Shutter
                    (iris)            (mechanical or
                                      electronic)
```

Light from the scene passes through the **lens**, which focuses it. The **aperture** (a
variable opening in the lens) controls how much light enters. The **shutter** controls how
long the sensor is exposed. The **image sensor** converts photons to electrical signals,
which are then digitized and processed into an image or video frame.

### 1.2 Sensor Size Matters

Sensor size directly affects image quality, depth of field, and low-light performance.

```
┌─────────────────────────────────────────┐
│                                         │
│          Full Frame (36×24mm)           │
│    ┌───────────────────────────┐        │
│    │                           │        │
│    │     APS-C (23×15mm)       │        │
│    │   ┌───────────────┐       │        │
│    │   │               │       │        │
│    │   │  M4/3 (17×13) │       │        │
│    │   │  ┌────────┐   │       │        │
│    │   │  │1" Sensor│   │       │        │
│    │   │  │(13×8.8) │   │       │        │
│    │   │  │ ┌────┐  │   │       │        │
│    │   │  │ │Phone│  │   │       │        │
│    │   │  │ │1/1.7│  │   │       │        │
│    │   │  │ └────┘  │   │       │        │
│    │   │  └────────┘   │       │        │
│    │   └───────────────┘       │        │
│    └───────────────────────────┘        │
└─────────────────────────────────────────┘
```

| Sensor Size | Typical Use | Low Light | Depth of Field |
|-------------|-------------|-----------|----------------|
| Full Frame | Professional photo/video | Excellent | Very shallow possible |
| APS-C | Enthusiast/prosumer cameras | Very good | Shallow possible |
| Micro 4/3 | Mirrorless cameras (Panasonic, OM) | Good | Moderate |
| 1-inch | Premium compacts, drones | Decent | Moderate |
| 1/1.7" - 1/1.3" | Flagship phones (iPhone, Pixel) | Decent | Mostly deep |

> **For beginners**: A modern flagship phone sensor (1/1.3" on iPhone Pro) is more than
> enough. You will not need a dedicated camera until you want shallow depth of field or
> better low-light performance.

### 1.3 Lens Focal Length

Focal length determines how "zoomed in" your image appears and affects perspective.

```
                Wide Angle              Normal             Telephoto
                (16-35mm)             (35-70mm)            (70-200mm)

            ┌───────────────┐     ┌───────────┐       ┌────────┐
            │               │     │           │       │        │
            │   Wide view   │     │  Natural  │       │ Narrow │
            │   Distortion  │     │  Perspec- │       │  view  │
            │   at edges    │     │   tive    │       │ Compre-│
            │               │     │           │       │ ssion  │
            └───────────────┘     └───────────┘       └────────┘

            Best for:              Best for:           Best for:
            - Landscapes           - Vlogs             - Portraits
            - Room tours           - Street            - Product shots
            - Establishing         - Documentary       - Cinematic
              shots                                      compression
```

| Focal Length | Field of View | Common Use in Video |
|-------------|---------------|---------------------|
| 16mm | ~107° | Establishing shots, action cams |
| 24mm | ~84° | Wide vlogs, environmental shots |
| 35mm | ~63° | Standard vlog, documentary |
| 50mm | ~47° | Interviews, talking head |
| 85mm | ~28° | Portrait close-ups, beauty |
| 100-200mm | ~12-24° | Product shots, event coverage |

## 2. The Exposure Triangle

The three settings that control how bright your image is. Changing one requires
compensating with the others.

```
                         APERTURE (f-stop)
                        Controls light amount
                        + depth of field
                              ▲
                             / \
                            /   \
                           /     \
                          / IMAGE \
                         / BRIGHT- \
                        /   NESS    \
                       /             \
                      /               \
          SHUTTER ◄──────────────────────► ISO
          SPEED                            Controls sensor
          Controls                         sensitivity
          motion blur                      + noise
          + exposure time
```

### 2.1 Aperture (f-stop)

The aperture is the opening in the lens that lets light in. It is measured in f-stops.

**Counter-intuitive**: Smaller f-number = larger opening = more light.

```
    f/1.4         f/2.8          f/5.6          f/11          f/22
   ┌─────┐      ┌─────┐       ┌─────┐       ┌─────┐      ┌─────┐
   │     │      │     │       │     │       │     │      │     │
   │ (●) │      │ (◉) │       │ (⊙) │       │ (·) │      │ (.) │
   │     │      │     │       │     │       │     │      │     │
   └─────┘      └─────┘       └─────┘       └─────┘      └─────┘
   Most light   More light    Moderate      Less light   Least light
   Shallowest   Shallow DOF   Medium DOF    Deep DOF     Deepest DOF
   DOF
```

| f-stop | Light | Depth of Field | Best For |
|--------|-------|----------------|----------|
| f/1.4 - f/2 | Maximum | Very shallow (blurry background) | Low light, cinematic look |
| f/2.8 - f/4 | Good | Shallow | Interviews, portraits |
| f/5.6 - f/8 | Moderate | Medium | General video, vlogs |
| f/11 - f/16 | Low | Deep (everything sharp) | Landscapes, architecture |
| f/22 | Minimum | Maximum | Rarely used (diffraction) |

### 2.2 Shutter Speed

How long the sensor is exposed to light per frame. In video, this is related to your
frame rate by the **180-degree shutter rule**.

**The 180-Degree Rule**: Set shutter speed to **double your frame rate** for natural-looking
motion blur.

| Frame Rate | Ideal Shutter Speed | Result |
|-----------|-------------------|--------|
| 24 fps | 1/48 (use 1/50) | Cinematic, natural motion blur |
| 30 fps | 1/60 | Standard, slightly crisper |
| 60 fps | 1/120 | Smooth, for slow-motion |
| 120 fps | 1/240 | Very smooth slow-motion |

```
Slow shutter (1/30):      Fast shutter (1/500):      180° rule (1/50 @ 24fps):
┌──────────┐               ┌──────────┐               ┌──────────┐
│  ~~~~~~  │               │   ──►    │               │  ~~~►    │
│  Motion  │               │  Frozen  │               │ Natural  │
│  Blur    │               │  Sharp   │               │ Cinematic│
└──────────┘               └──────────┘               └──────────┘
Dreamy/blurry              Too crisp for video         Just right
```

> **ND Filters**: When shooting outside, the sun may be too bright for a wide aperture +
> slow shutter speed. An ND (Neutral Density) filter is like sunglasses for your camera —
> it reduces light without affecting color. This lets you maintain the 180-degree rule.

### 2.3 ISO (Sensitivity)

ISO controls how much the sensor amplifies the light signal. Higher ISO = brighter image
but more noise (grain).

| ISO | Use Case | Noise Level |
|-----|----------|-------------|
| 100-400 | Bright daylight, studio lighting | Clean |
| 400-1600 | Overcast, indoors with good lighting | Slight grain |
| 1600-6400 | Dim indoors, evening | Noticeable grain |
| 6400+ | Very low light, night | Heavy grain |

**Rule of thumb**: Keep ISO as low as possible. Increase aperture or add light before
raising ISO.

### 2.4 Putting It All Together

**Scenario: Indoor talking head video**

```
Step 1: Set frame rate        → 24 fps (cinematic) or 30 fps (YouTube standard)
Step 2: Set shutter speed     → 1/50 (for 24fps) or 1/60 (for 30fps)
Step 3: Set aperture          → f/2.8 (nice background blur for interviews)
Step 4: Check exposure        → If too dark, raise ISO gradually
Step 5: If still too dark     → Add a light source (LED panel, window)
```

## 3. Focus and Depth of Field

### 3.1 What Is Depth of Field?

Depth of Field (DOF) is the range of distance in your scene that appears acceptably sharp.

```
Shallow DOF (f/1.8):                Deep DOF (f/11):

     Blurry   │ SHARP │  Blurry         SHARP │ SHARP │ SHARP
   background │Subject│foreground    background│Subject│foreground
   ░░░░░░░░░░ │███████│ ░░░░░░░     ██████████│███████│██████████
```

Three factors control DOF:

| Factor | Shallower DOF | Deeper DOF |
|--------|---------------|------------|
| Aperture | Wider (f/1.4) | Narrower (f/11) |
| Distance to subject | Closer | Farther |
| Focal length | Longer (85mm) | Shorter (16mm) |

### 3.2 Autofocus Modes for Video

| Mode | How It Works | Best For |
|------|-------------|----------|
| Continuous AF (AF-C) | Constantly adjusts focus | Moving subjects, vlogs |
| Single AF (AF-S) | Locks focus once | Static interviews |
| Face/Eye AF | Tracks faces/eyes | Talking head, vlogs |
| Manual Focus | You control focus ring | Cinematic pulls, precise control |

> **For vlogging**: Always use **Face/Eye AF** with continuous tracking. Modern cameras
> (Sony, Canon, Fuji) have excellent face tracking that rarely misses.

### 3.3 Focus Pull (Rack Focus)

A deliberate shift of focus from one subject to another within a shot. This is a
powerful storytelling technique.

```
Frame 1: Focus on foreground          Frame 2: Focus shifts to background

  ████████    ░░░░░░░░                 ░░░░░░░░    ████████
  ██ Cup ██   ░Person░                 ░░ Cup ░░   █Person█
  ████████    ░░░░░░░░                 ░░░░░░░░    ████████
  (sharp)     (blurry)                 (blurry)    (sharp)
```

## 4. White Balance and Color Temperature

### 4.1 What Is Color Temperature?

Light has color. Our eyes adapt automatically, but cameras need to be told what "white"
looks like under different lighting conditions.

Color temperature is measured in **Kelvin (K)**.

```
    1,000K      2,700K      4,000K      5,500K      6,500K      10,000K
      │           │           │           │           │            │
      ▼           ▼           ▼           ▼           ▼            ▼
   Candle    Warm bulb    Fluorescent  Daylight   Overcast     Blue sky
   ██████    ██████████   ████████████ █████████  █████████    ████████
   Very      Warm         Neutral      Natural    Cool         Very
   warm      orange       white        white      blue         blue
   (orange)
```

### 4.2 White Balance Settings

| Setting | Kelvin | When to Use |
|---------|--------|-------------|
| Tungsten | ~3,200K | Indoor warm bulbs |
| Fluorescent | ~4,000K | Office lighting |
| Daylight | ~5,500K | Outdoor sun |
| Cloudy | ~6,500K | Overcast skies |
| Shade | ~7,500K | Open shade outdoors |
| Auto (AWB) | Varies | When lighting changes frequently |
| Custom | You set | Mixed lighting, precise control |

> **For video**: Set white balance **manually** or use a preset. Auto white balance can
> shift mid-shot, creating color inconsistency. If shooting in a controlled environment,
> use a grey card to set custom white balance.

## 5. Composition Rules

### 5.1 Rule of Thirds

Divide your frame into a 3x3 grid. Place important elements along the lines or at
their intersections.

```
┌──────────┬──────────┬──────────┐
│          │          │          │
│          │    ●     │          │   ● = subject's eye
│          │  Subject │          │     placed at upper-right
├──────────┼──────────┼──────────┤     intersection
│          │          │          │
│          │          │          │
│          │          │          │
├──────────┼──────────┼──────────┤
│          │          │          │
│          │          │          │
│          │          │          │
└──────────┴──────────┴──────────┘
```

### 5.2 Headroom and Lead Room

```
   ✗ Too much headroom       ✓ Good headroom          ✗ No headroom
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│                   │   │                   │   │ ┌───────────────┐ │
│                   │   │    ┌─────────┐    │   │ │               │ │
│                   │   │    │         │    │   │ │   ┌─────┐     │ │
│    ┌─────────┐    │   │    │  Face   │    │   │ │   │Face │     │ │
│    │         │    │   │    │         │    │   │ │   │     │     │ │
│    │  Face   │    │   │    └─────────┘    │   │ │   └─────┘     │ │
│    │         │    │   │    │ Shoulders│    │   │ └───────────────┘ │
│    └─────────┘    │   │    └─────────┘    │   │                   │
└───────────────────┘   └───────────────────┘   └───────────────────┘

   ✗ No lead room            ✓ Good lead room
┌───────────────────┐   ┌───────────────────┐
│                   │   │                   │
│           ──►     │   │    ──►            │
│         Person    │   │  Person           │
│                   │   │                   │
└───────────────────┘   └───────────────────┘
(looking into frame edge) (space in direction of gaze)
```

### 5.3 Shot Types

| Shot Type | Framing | Emotion/Use |
|-----------|---------|-------------|
| Extreme Wide Shot (EWS) | Entire environment | Establishing location |
| Wide Shot (WS) | Full body + environment | Context, walking shots |
| Medium Shot (MS) | Waist up | Conversation, tutorials |
| Medium Close-Up (MCU) | Chest up | Standard talking head |
| Close-Up (CU) | Face only | Emotion, emphasis |
| Extreme Close-Up (ECU) | Eyes or detail | Dramatic tension |
| Over-the-Shoulder (OTS) | Behind one person | Interviews, dialogue |

```
   EWS              WS              MS             MCU             CU
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│ ▄ ▄     │   │         │   │ ┌─────┐ │   │ ┌─────┐ │   │ ┌─────┐ │
│ █ █ ▄▄  │   │  ┌───┐  │   │ │     │ │   │ │     │ │   │ │ o o │ │
│ ▀ ▀ ██  │   │  │   │  │   │ │     │ │   │ │     │ │   │ │  ▽  │ │
│ tiny    │   │  │   │  │   │ │     │ │   │ └─────┘ │   │ │ --- │ │
│ figures │   │  └───┘  │   │ └─────┘ │   │         │   │ └─────┘ │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

### 5.4 The 180-Degree Rule (Spatial Continuity)

When filming two people talking, keep the camera on one side of an imaginary line
between them. Crossing this line disorients the viewer.

```
                    ─ ─ ─ ─ The Line ─ ─ ─ ─

    Person A ●                              ● Person B
              \                            /
               \    Camera positions      /
                \   that maintain        /
                 \  spatial continuity  /
                  \                   /
                   📷    📷    📷
               OK zone (same side)

                   ─ ─ ─ ─ ─ ─ ─ ─ ─

               📷  ← Crossing the line = confusing jump
```

## 6. Camera Movement

### 6.1 Types of Movement

| Movement | Description | Feeling/Use |
|----------|-------------|-------------|
| Static | Tripod, no movement | Stable, professional, interviews |
| Pan | Horizontal rotation | Reveal, follow action |
| Tilt | Vertical rotation | Reveal height, dramatic |
| Dolly | Camera moves forward/back | Intimacy, revelation |
| Truck | Camera moves left/right | Follow alongside subject |
| Pedestal | Camera moves up/down | Dramatic reveal |
| Handheld | Camera in hand | Energy, urgency, documentary feel |
| Gimbal | Stabilized handheld | Smooth movement, professional walk-and-talk |

### 6.2 Motivation for Movement

Every camera movement should have a **reason**:

- **Following a subject** — Pan/truck to keep them in frame
- **Revealing information** — Pan to show something new
- **Creating energy** — Handheld for excitement
- **Building tension** — Slow dolly in for dramatic moments
- **Establishing space** — Wide pan to show environment

> **Beginner mistake**: Moving the camera just because you can. If you do not have a
> reason for the movement, keep it static on a tripod.

### 6.3 Gimbal vs Tripod vs Handheld

| Method | Stability | Energy | Best For | Cost |
|--------|-----------|--------|----------|------|
| Tripod | Maximum | Low (stable, calm) | Interviews, tutorials | $20-200 |
| Gimbal | High | Medium (smooth, dynamic) | Walking vlogs, B-roll | $100-500 |
| Handheld | Low | High (raw, energetic) | Documentary, action | Free |
| Monopod | Medium | Medium | Events, quick setup | $30-100 |

## 7. Lighting Fundamentals

### 7.1 Why Lighting Matters More Than Camera

A $500 camera with great lighting will always look better than a $5,000 camera with
bad lighting. Light is the single most impactful thing you can control.

### 7.2 Three-Point Lighting

The classic setup used in interviews, tutorials, and talking head videos.

```
                    (top-down view)

                    Back Light
                        💡
                        │
                        │
                   ┌────┴────┐
                   │ Subject │
                   │    👤    │
                   └────┬────┘
                  ╱           ╲
                ╱               ╲
              ╱                   ╲
         💡                         💡
      Key Light                  Fill Light
    (Main, brightest)        (Softer, dimmer)
    45° to one side          Opposite side
                                reduces shadows

                        📷
                      Camera
```

| Light | Purpose | Intensity | Position |
|-------|---------|-----------|----------|
| Key Light | Main illumination | Brightest (100%) | 45° to one side, slightly above |
| Fill Light | Soften shadows from key | Dimmer (50-75%) | Opposite side of key |
| Back Light | Separate subject from background | Variable (50-100%) | Behind subject, above |

### 7.3 Natural Light Techniques

| Technique | How | When |
|-----------|-----|------|
| Window light | Sit facing a large window | Daytime, any weather |
| Golden hour | Shoot 1hr after sunrise / before sunset | Warm, flattering outdoor light |
| Blue hour | 20-30min after sunset / before sunrise | Moody, cinematic |
| Overcast | Clouds act as giant softbox | Even, flattering, any time |
| Open shade | Stand in shade with open sky in front | Avoid harsh shadows |

> **Best free lighting**: Sit facing a large window. The window acts as a giant softbox.
> If one side of your face is too dark, place a white poster board on that side to
> bounce light back (this is your free fill light).

### 7.4 Hard Light vs Soft Light

```
Hard Light (direct, small source):      Soft Light (diffused, large source):

    💡                                      ┌─────────────┐
    │                                       │  Softbox /   │
    │                                       │  Window      │
    ▼                                       └──────┬──────┘
  ┌─────┐                                         │
  │Sharp│                                    ┌────▼────┐
  │Dark │                                    │ Gentle  │
  │Sha- │                                    │ Gradual │
  │dows │                                    │ Shadow  │
  └─────┘                                    └────────┘

Dramatic, contrasty                     Flattering, soft, forgiving
```

| Property | Hard Light | Soft Light |
|----------|-----------|------------|
| Source | Small, direct (bare bulb, sun) | Large, diffused (softbox, window) |
| Shadows | Sharp-edged, dark | Soft-edged, gradual |
| Mood | Dramatic, intense | Natural, flattering |
| Best for | Dramatic scenes, product shots | Interviews, vlogs, beauty |

## 8. Resolution, Frame Rate, and Codec Settings

### 8.1 Resolution

| Resolution | Pixels | Common Name | Use |
|-----------|--------|-------------|-----|
| 1920×1080 | 2.1M | Full HD (1080p) | Standard YouTube, good enough |
| 2560×1440 | 3.7M | QHD (1440p) | Sweet spot for YouTube quality |
| 3840×2160 | 8.3M | 4K (UHD) | Future-proof, crop flexibility |
| 7680×4320 | 33.2M | 8K | Overkill for most creators |

> **Recommendation**: Shoot in **4K**, deliver in **1080p or 1440p**. This gives you room
> to crop, stabilize, and reframe in post. YouTube also gives 4K uploads a higher
> quality bitrate even when viewed at 1080p.

### 8.2 Frame Rate

| Frame Rate | Feel | Best For |
|-----------|------|----------|
| 24 fps | Cinematic, dreamy | Films, narrative vlogs |
| 25 fps | PAL standard (Europe) | European broadcast |
| 30 fps | Smooth, standard | YouTube, general content |
| 60 fps | Very smooth | Gaming, sports, slow-mo (50%) |
| 120 fps | Ultra smooth | Dramatic slow-motion (20-25%) |
| 240 fps | Extremely slow | Extreme slow-motion |

> **For YouTube**: Shoot main footage at **24 or 30 fps**. Shoot B-roll at **60 fps** so
> you can slow it down to 50% speed for smooth slow-motion.

### 8.3 Codec and Bitrate Basics

| Codec | Quality | File Size | Editing Performance |
|-------|---------|-----------|-------------------|
| H.264 | Good | Small | Fast to edit, widely supported |
| H.265 (HEVC) | Better | Smaller | Slower to edit, newer hardware needed |
| ProRes | Excellent | Very large | Fastest editing, Mac-friendly |
| ProRes LT | Very good | Large | Good balance for editing |
| BRAW / R3D | Maximum | Huge | Professional, needs powerful hardware |

> **Practical advice**: Shoot in **H.264 or H.265** unless you need maximum color grading
> flexibility. ProRes is great if you have the storage space. For YouTube delivery,
> H.264 at high bitrate is the standard.

### 8.4 YouTube Recommended Upload Settings

| Setting | Recommended |
|---------|-------------|
| Container | .mp4 |
| Codec | H.264 |
| Frame rate | Match source (24/30/60) |
| Resolution | 3840×2160 (4K) or 1920×1080 |
| Bitrate (1080p 30fps) | 10-15 Mbps |
| Bitrate (4K 30fps) | 35-68 Mbps |
| Audio codec | AAC-LC |
| Audio bitrate | 384 kbps (stereo) |
| Audio sample rate | 48 kHz |

## 9. Shooting with a Smartphone

### 9.1 Why Phones Are Enough

Modern flagship phones have:
- Multiple focal lengths (ultra-wide, wide, telephoto)
- Computational photography (HDR, noise reduction)
- 4K 60fps recording
- Optical image stabilization
- Cinematic mode (simulated depth of field)

Many professional YouTubers shoot entirely on phones.

### 9.2 Phone Camera Settings for Video

| Setting | Recommendation |
|---------|---------------|
| Resolution | 4K |
| Frame rate | 30fps (main), 60fps (B-roll) |
| Exposure lock | Tap and hold to lock (prevents auto-adjust) |
| Grid overlay | Enable (for composition) |
| HDR video | Disable for editing flexibility; enable for quick social posts |
| Orientation | Always landscape (horizontal) for YouTube; vertical for Shorts/TikTok |

### 9.3 Recommended Phone Apps

| App | Platform | Key Feature | Price |
|-----|----------|-------------|-------|
| Filmic Pro | iOS/Android | Manual controls, log profiles | $15-30 |
| Blackmagic Camera | iOS | Free, Blackmagic color science | Free |
| ProTake | iOS | Professional manual controls | $5 |
| Open Camera | Android | Free, manual controls | Free |
| iPhone Camera (native) | iOS | Cinematic mode, action mode | Free |

### 9.4 Phone Stabilization Tips

1. **Hold with two hands** and tuck elbows into body
2. **Walk heel-to-toe** (ninja walk) for smooth movement
3. **Use a gimbal** (DJI OM SE, ~$100) for walking shots
4. **Lean against walls** or surfaces for extra stability
5. **Use a tripod mount** ($10-20) for static shots

## 10. Common Mistakes and How to Fix Them

### 10.1 Exposure Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Overexposed | Blown-out whites, no detail in highlights | Lower ISO, narrow aperture, add ND filter |
| Underexposed | Dark, noisy shadows | Raise ISO, wider aperture, add light |
| Auto exposure hunting | Brightness changes mid-shot | Lock exposure manually |

### 10.2 Focus Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missed focus | Subject is blurry, background is sharp | Use face/eye AF, wider aperture = less margin |
| Focus breathing | Image zooms slightly when refocusing | Use a lens with minimal focus breathing |
| AF hunting | Camera searches back and forth | Lock focus, switch to manual, improve contrast |

### 10.3 Composition Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Centering everything | Boring, amateur look | Use rule of thirds |
| Too much headroom | Subject looks tiny | Frame tighter, lower tripod |
| Cluttered background | Distracting elements | Simplify background, use wider aperture |
| Dutch angle (unintentional) | Horizon is tilted | Use grid lines, level your tripod |
| Shooting up nostrils | Unflattering angle | Raise camera to eye level or slightly above |

### 10.4 Lighting Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Backlighting (accidental) | Subject is a dark silhouette | Face subject toward light source |
| Mixed color temps | Skin looks orange on one side, blue on other | Use same-temperature lights |
| Overhead lighting only | Harsh shadows under eyes and nose | Add frontal fill light |
| No separation from background | Subject blends into background | Add back light or rim light |

### 10.5 Audio Mistakes (Preview — Full Coverage in 02)

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Using built-in camera mic | Echoey, distant, noisy | Use external microphone close to mouth |
| Wind noise | Rumbling, whooshing | Use windscreen/deadcat, or film indoors |
| Room echo | Hollow, reverb sound | Add soft furnishings, or use lapel mic |
| Audio clipping | Distorted, crunchy peaks | Lower recording levels, leave headroom |

---

**Previous**: [00 - Framework](00-FRAMEWORK.md)
**Next**: [02 - Audio for Video](02-AUDIO-FOR-VIDEO.md)
