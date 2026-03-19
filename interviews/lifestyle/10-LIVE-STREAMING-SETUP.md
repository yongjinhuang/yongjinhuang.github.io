# Live Streaming Setup

A comprehensive guide to live streaming — from setting up OBS Studio to going live on
YouTube, Twitch, or other platforms. Live streaming is a powerful way to build community,
create content in real-time, and develop your on-camera skills.

---

## Table of Contents

1. [Why Live Streaming?](#1-why-live-streaming)
2. [Streaming Platforms](#2-streaming-platforms)
3. [OBS Studio (Free, Open-Source)](#3-obs-studio-free-open-source)
4. [Hardware Setup](#4-hardware-setup)
5. [Audio for Streaming](#5-audio-for-streaming)
6. [Scene Design and Overlays](#6-scene-design-and-overlays)
7. [Stream Quality Settings](#7-stream-quality-settings)
8. [Interactive Streaming](#8-interactive-streaming)
9. [Types of Live Streams](#9-types-of-live-streams)
10. [Going Live Checklist](#10-going-live-checklist)

---

## 1. Why Live Streaming?

### 1.1 Benefits of Live Streaming

```
Live Streaming Benefits for Creators:

┌───────────────────────────────────────────────────────┐
│  💬 COMMUNITY            │  📈 GROWTH                │
│  Real-time interaction   │  YouTube favors live       │
│  Deepest viewer bond     │  Notifications to subs     │
│  Instant feedback        │  Longer watch time         │
│                          │  Archive becomes a video   │
├──────────────────────────┼───────────────────────────┤
│  🎯 SKILLS               │  💰 REVENUE               │
│  On-camera confidence    │  Super Chats / donations   │
│  Improvisational skills  │  Memberships               │
│  No editing needed       │  Sponsorship opportunities │
│  Think on your feet      │  Lower production cost     │
└──────────────────────────┴───────────────────────────┘
```

### 1.2 Live vs Pre-Recorded

| Aspect              | Live Stream                         | Pre-Recorded Video           |
| ------------------- | ----------------------------------- | ---------------------------- |
| Editing             | None (real-time)                    | Heavy (hours per minute)     |
| Viewer interaction  | Real-time chat, Super Chats         | Comments (delayed)           |
| Production pressure | Must perform live                   | Can redo takes               |
| Content length      | 30 min - 4+ hours typical           | 5-30 minutes typical         |
| Mistakes            | Visible, adds authenticity          | Edited out                   |
| Watch time          | Very high per viewer                | Lower per viewer, more total |
| Archive value       | Can be edited into highlight videos | Already polished             |

## 2. Streaming Platforms

### 2.1 Platform Comparison

| Platform           | Audience                | Best For                                        | Monetization                            |
| ------------------ | ----------------------- | ----------------------------------------------- | --------------------------------------- |
| **YouTube Live**   | Broad, all ages         | Existing YouTube channels, tutorials, vlogs     | Super Chat, memberships, ads            |
| **Twitch**         | Younger, gaming-focused | Gaming, creative, IRL, just chatting            | Subscriptions, bits, ads                |
| **TikTok Live**    | Young, mobile-first     | Short casual streams, building TikTok following | Gifts                                   |
| **Instagram Live** | Social, visual-first    | Casual, collaborations, interviews              | Badges                                  |
| **LinkedIn Live**  | Professional            | Business, tech talks, career content            | Brand building (no direct monetization) |
| **Kick**           | Young, gaming           | Gaming, less restrictive than Twitch            | Subscriptions                           |

### 2.2 YouTube Live Specifics

| Requirement                      | Details                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| Minimum subs for mobile live     | 50 subscribers                                             |
| Minimum subs for desktop live    | 0 (anyone can)                                             |
| DVR (viewers rewind during live) | Available                                                  |
| Auto-archive                     | Streams automatically saved as videos                      |
| Super Chat                       | Viewers pay to highlight messages                          |
| Memberships                      | Monthly paid membership with perks                         |
| Scheduling                       | Can schedule streams in advance (generates link/thumbnail) |
| Stream key                       | Found in YouTube Studio > Go Live                          |

### 2.3 Multi-Platform Streaming

You can stream to multiple platforms simultaneously using tools like:

| Tool                | Price                       | Platforms                                  | Limitations                    |
| ------------------- | --------------------------- | ------------------------------------------ | ------------------------------ |
| Restream            | Free (2 platforms) / $16/mo | YouTube, Twitch, Facebook, LinkedIn + more | Free tier has watermark        |
| Streamyard          | Free / $20/mo               | YouTube, Twitch, Facebook, LinkedIn        | Free tier limited              |
| OBS + multiple RTMP | Free                        | Unlimited                                  | Requires more upload bandwidth |

> **Recommendation**: Start with **one platform** (YouTube if you already have a channel).
> Multi-streaming splits your chat and makes interaction harder. Focus on one community first.

## 3. OBS Studio (Free, Open-Source)

### 3.1 Why OBS

OBS (Open Broadcaster Software) is the industry standard for live streaming and screen
recording. It is free, open-source, and extremely powerful.

- **Free forever** (open-source, no watermark)
- **Cross-platform** (Windows, Mac, Linux)
- **Highly customizable** scenes, sources, and filters
- **Plugin ecosystem** for extended functionality
- **Used by professionals** and beginners alike

### 3.2 OBS Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    PREVIEW WINDOW                           │
│              (what your stream looks like)                  │
│                                                             │
│    ┌──────────────────────────────────────────────────┐     │
│    │                                                  │     │
│    │         Your stream output preview               │     │
│    │                                                  │     │
│    └──────────────────────────────────────────────────┘     │
│                                                             │
├─────────────┬───────────────┬──────────────┬────────────────┤
│  SCENES     │  SOURCES      │  AUDIO MIXER │  CONTROLS      │
│             │               │              │                │
│ □ Desktop   │ 🖥 Screen     │ Mic ▬▬▬▬▬▬░░│ [Start Stream] │
│ ■ Webcam    │ 📷 Webcam     │ Desktop ▬▬▬░│ [Start Record] │
│ □ BRB       │ 🖼 Overlay    │ Music ▬▬░░░░│ [Settings]     │
│ □ End       │ 📝 Text       │              │ [Exit]         │
│             │               │              │                │
└─────────────┴───────────────┴──────────────┴────────────────┘
```

### 3.3 Key OBS Concepts

| Concept         | What It Is                            | Example                                         |
| --------------- | ------------------------------------- | ----------------------------------------------- |
| **Scene**       | A saved layout/arrangement            | "Gaming Scene", "Webcam Only", "BRB Screen"     |
| **Source**      | An element within a scene             | Camera feed, screen capture, image, text        |
| **Filter**      | Processing applied to a source        | Noise suppression, color correction, chroma key |
| **Transition**  | Effect when switching scenes          | Fade, cut, stinger                              |
| **Audio mixer** | Volume controls for all audio sources | Mic, desktop audio, music                       |

### 3.4 Essential OBS Scenes

```
Scene 1: STARTING SOON              Scene 2: MAIN (webcam + content)
┌──────────────────────────┐        ┌──────────────────────────┐
│                          │        │                          │
│    STARTING SOON         │        │     Screen/Game          │
│                          │        │     Content              │
│    ⏱ Countdown           │        │                  ┌─────┐ │
│                          │        │                  │ Cam │ │
│    🎵 Background music   │        │                  └─────┘ │
│                          │        │                          │
└──────────────────────────┘        └──────────────────────────┘

Scene 3: FULL WEBCAM                 Scene 4: BRB
┌──────────────────────────┐        ┌──────────────────────────┐
│                          │        │                          │
│       ┌────────────┐     │        │    BE RIGHT BACK         │
│       │            │     │        │                          │
│       │   Webcam   │     │        │    🎵 Music playing      │
│       │   (full)   │     │        │                          │
│       │            │     │        │    Back in a few minutes │
│       └────────────┘     │        │                          │
└──────────────────────────┘        └──────────────────────────┘

Scene 5: END SCREEN
┌──────────────────────────┐
│                          │
│    THANKS FOR WATCHING   │
│                          │
│    Follow: @channel      │
│    Next stream: [date]   │
│                          │
└──────────────────────────┘
```

### 3.5 Essential OBS Shortcuts

| Action               | Default Shortcut                      |
| -------------------- | ------------------------------------- |
| Start/Stop streaming | No default (set your own)             |
| Start/Stop recording | No default (set your own)             |
| Switch to Scene 1    | Numpad 1 (custom)                     |
| Switch to Scene 2    | Numpad 2 (custom)                     |
| Mute/Unmute mic      | Custom (very important to set!)       |
| Push to mute         | Custom (hold key to temporarily mute) |

> **Critical**: Set a **mute/unmute hotkey** for your microphone. You will need this
> constantly during streams (coughing, doorbell, talking to someone off-camera).

## 4. Hardware Setup

### 4.1 Minimum Streaming Setup

```
Basic Setup:
┌───────────────────────────────────────────┐
│                                           │
│  Computer ──► OBS ──► Internet ──► Platform│
│     │                                     │
│     ├── Webcam (built-in or external)     │
│     ├── Microphone (USB or headset)       │
│     └── Internet (upload speed matters)   │
│                                           │
│  Total cost: $0 if you have a computer    │
│  with built-in webcam and a headset       │
└───────────────────────────────────────────┘
```

### 4.2 Recommended Hardware by Budget

**Webcam / Camera Options:**

| Budget    | Recommendation             | Resolution   | Price  |
| --------- | -------------------------- | ------------ | ------ |
| Free      | Built-in laptop webcam     | 720p-1080p   | $0     |
| Budget    | Logitech C920/C922         | 1080p 30fps  | $60-80 |
| Mid-range | Elgato Facecam MK.2        | 1080p 60fps  | $130   |
| High-end  | Sony ZV-E10 + capture card | 4K → 1080p60 | $700+  |

**Capture Card (for using a real camera):**

| Card                      | Input | Output | Price |
| ------------------------- | ----- | ------ | ----- |
| Elgato Cam Link 4K        | HDMI  | USB-A  | $100  |
| Elgato HD60 X             | HDMI  | USB-C  | $150  |
| AVerMedia Live Gamer Mini | HDMI  | USB    | $80   |

**Lighting for Streams:**

| Budget    | Recommendation        | Price     |
| --------- | --------------------- | --------- |
| Free      | Sit facing a window   | $0        |
| Budget    | Ring light (18-inch)  | $25-40    |
| Mid-range | Elgato Key Light Mini | $80       |
| High-end  | 2x Elgato Key Light   | $200 each |

### 4.3 Internet Requirements

| Stream Quality     | Upload Speed Needed | Minimum Recommended |
| ------------------ | ------------------- | ------------------- |
| 720p 30fps         | 3-4 Mbps            | 5+ Mbps             |
| 1080p 30fps        | 4.5-6 Mbps          | 8+ Mbps             |
| 1080p 60fps        | 6-9 Mbps            | 12+ Mbps            |
| 4K 30fps (YouTube) | 20-25 Mbps          | 30+ Mbps            |

**Stability matters more than speed.** A stable 10 Mbps connection is better than a
fluctuating 50 Mbps connection. Use ethernet (wired) instead of WiFi when possible.

```
Testing your internet:
1. Go to speedtest.net
2. Note your UPLOAD speed (not download)
3. Your stream bitrate should be ~75% of your upload speed
4. Example: 10 Mbps upload → stream at ~6-7 Mbps max
```

## 5. Audio for Streaming

### 5.1 Audio is More Important Than Video

Viewers will tolerate a 720p webcam image but will leave immediately if your audio
echoes, clips, or has background noise.

### 5.2 OBS Audio Filters

Apply these filters to your microphone source in OBS (in this order):

```
Microphone Input
      │
      ▼
┌─────────────────┐
│ 1. Noise Gate   │   Silences mic when you are not talking
│    Close: -32dB │   (prevents breathing, keyboard noise)
│    Open: -26dB  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Noise        │   Removes constant background noise
│    Suppression  │   (AC hum, fan noise, room tone)
│    RNNoise      │   Use "RNNoise" method for AI-based removal
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Compressor   │   Evens out volume (quiet and loud parts)
│    Ratio: 4:1   │
│    Threshold:   │
│    -18 dB       │
│    Attack: 6ms  │
│    Release: 60ms│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Limiter      │   Prevents clipping on loud sounds
│    Threshold:   │   (laughing, shouting)
│    -3 dB        │
└─────────────────┘
```

### 5.3 Audio Monitoring

| Tip                                | Why                                          |
| ---------------------------------- | -------------------------------------------- |
| Use **headphones** while streaming | Prevents echo from speakers feeding into mic |
| Test audio before going live       | Record a 30-second test clip in OBS          |
| Set mic to correct input in OBS    | OBS may default to wrong microphone          |
| Monitor audio levels in OBS mixer  | Voice should peak at -12 to -6 dB            |

### 5.4 Common Audio Problems in Streams

| Problem               | Cause                            | Fix                                  |
| --------------------- | -------------------------------- | ------------------------------------ |
| Echo                  | Speakers playing into mic        | Use headphones                       |
| Background noise      | Fan, AC, keyboard                | Use noise suppression filter + gate  |
| Too quiet             | Low mic gain or distance         | Increase gain, move mic closer       |
| Clipping / distortion | Too loud, gain too high          | Lower gain, add compressor + limiter |
| Robotic / choppy      | Too aggressive noise suppression | Reduce suppression level             |
| Delayed audio         | Processing latency               | Reduce filters or adjust sync offset |

## 6. Scene Design and Overlays

### 6.1 Overlay Elements

```
Full stream overlay:
┌──────────────────────────────────────────────────────┐
│  ┌─────────┐                              ┌────────┐ │
│  │ Channel │     STREAM TITLE             │ Recent │ │
│  │  Logo   │                              │ Events │ │
│  └─────────┘                              │ Follow │ │
│                                           │ Sub    │ │
│          ┌────────────────────┐            └────────┘ │
│          │                    │                       │
│          │   Main Content     │     ┌──────────────┐ │
│          │   (game/screen)    │     │    Chat       │ │
│          │                    │     │    Overlay    │ │
│          └────────────────────┘     │    (optional) │ │
│                                     └──────────────┘ │
│  ┌────────────────────────────────────────────────┐   │
│  │  Ticker / Alert Bar / Now Playing              │   │
│  └────────────────────────────────────────────────┘   │
│                            ┌──────┐                   │
│                            │ Cam  │                   │
│                            └──────┘                   │
└──────────────────────────────────────────────────────┘
```

### 6.2 Keep It Clean

| Design Rule                          | Why                                           |
| ------------------------------------ | --------------------------------------------- |
| Do not cover too much of the content | Viewers came for the content, not the overlay |
| Consistent color scheme              | Professional, branded look                    |
| Readable text sizes                  | Chat and alerts must be readable              |
| Animated elements should be subtle   | Distracting animations annoy viewers          |
| Webcam border is optional            | Clean webcam looks more professional          |

### 6.3 Free Overlay Resources

| Source         | What They Offer                                          |
| -------------- | -------------------------------------------------------- |
| StreamElements | Free overlays, alerts, chat widgets                      |
| Streamlabs     | Free themes and overlay packages                         |
| Nerd or Die    | Free + premium overlay packages                          |
| OWN3D          | Free + premium streaming graphics                        |
| Canva          | Design custom overlays (export as PNG with transparency) |

### 6.4 Alert Setup

Alerts notify you and viewers when events happen (new follower, subscriber, donation).

```
Alert types:
┌──────────────────────────────────────┐
│  🔔 New Follower/Subscriber          │
│  💰 Donation / Super Chat            │
│  ⭐ New Member / Tier upgrade        │
│  🔁 Raid (incoming viewers)          │
│  🎯 Goal reached (sub count, etc)   │
└──────────────────────────────────────┘

Setup: StreamElements or Streamlabs → Copy alert URL → Add as Browser Source in OBS
```

## 7. Stream Quality Settings

### 7.1 OBS Output Settings

| Setting           | YouTube Live              | Twitch                            |
| ----------------- | ------------------------- | --------------------------------- |
| Encoder           | x264 (CPU) or NVENC (GPU) | x264 or NVENC                     |
| Rate control      | CBR                       | CBR                               |
| Bitrate (1080p30) | 4,500-6,000 kbps          | 4,500-6,000 kbps                  |
| Bitrate (1080p60) | 6,000-9,000 kbps          | 6,000 kbps (max for non-partners) |
| Bitrate (720p30)  | 2,500-4,000 kbps          | 2,500-4,000 kbps                  |
| Keyframe interval | 2 seconds                 | 2 seconds                         |
| Preset (x264)     | veryfast or faster        | veryfast                          |
| Preset (NVENC)    | Quality or Max Quality    | Quality                           |
| Audio bitrate     | 160 kbps (stereo)         | 160 kbps                          |
| Audio sample rate | 48 kHz                    | 48 kHz                            |

### 7.2 Video Settings

| Setting                    | Recommendation                       |
| -------------------------- | ------------------------------------ |
| Base (canvas) resolution   | Match your monitor (e.g., 1920×1080) |
| Output (scaled) resolution | 1920×1080 (1080p)                    |
| Downscale filter           | Lanczos (best quality)               |
| FPS                        | 30 (most streams) or 60 (gaming)     |

### 7.3 Choosing Your Encoder

```
x264 (CPU encoder):                   NVENC/AMF (GPU encoder):
┌────────────────────────┐            ┌────────────────────────┐
│ + Better quality per   │            │ + Minimal CPU usage    │
│   bitrate              │            │ + Better for gaming    │
│ + Works on all PCs     │            │ + Modern GPUs are great│
│                        │            │                        │
│ - Heavy CPU usage      │            │ - Needs NVIDIA/AMD GPU │
│ - May affect gaming    │            │ - Slightly lower       │
│   performance          │            │   quality per bitrate  │
└────────────────────────┘            └────────────────────────┘

Recommendation:
- If streaming games: Use NVENC (GPU) to keep CPU free for the game
- If streaming webcam/screen only: Either works fine
- If on Mac: Apple VT H264 encoder
```

### 7.4 Testing Your Stream

Before going live for real:

```
1. In OBS: Start Recording (not streaming)
   Watch the preview for 2-3 minutes
   Check: webcam quality, audio levels, overlay layout

2. YouTube Studio → Go Live → select "Unlisted"
   Stream for 5 minutes to an unlisted test stream
   Watch the playback: check quality, audio sync, buffering

3. Check OBS status bar:
   ┌─────────────────────────────────────────┐
   │  CPU: 8%  │  FPS: 30/30  │  kb/s: 4500 │
   │  ✓ Good   │  ✓ No drops  │  ✓ Stable   │
   └─────────────────────────────────────────┘

   If CPU > 30%: Lower encoder preset or resolution
   If FPS dropping: Lower resolution or game settings
   If kb/s fluctuating: Internet unstable, lower bitrate
```

## 8. Interactive Streaming

### 8.1 Chat Interaction

| Technique            | How                                       |
| -------------------- | ----------------------------------------- |
| Read chat regularly  | Glance at chat every 30-60 seconds        |
| Say viewer names     | "Thanks for joining, [name]!"             |
| Answer questions     | Dedicated Q&A segments work great         |
| Use a second monitor | Chat on one screen, content on the other  |
| Mod your chat        | Assign moderators to handle spam/toxicity |

### 8.2 Stream-Specific Tools

| Tool               | What It Does                               | Price         |
| ------------------ | ------------------------------------------ | ------------- |
| StreamElements     | Alerts, overlays, chat bot, loyalty points | Free          |
| Streamlabs         | Alerts, overlays, all-in-one dashboard     | Free / $19/mo |
| Nightbot           | Chat bot, commands, moderation             | Free          |
| TouchPortal        | Stream deck alternative (phone app)        | Free / $5     |
| Elgato Stream Deck | Physical button controller for OBS         | $80-250       |

### 8.3 Chat Bot Commands

Set up automated chat responses for common questions:

```
!socials    → "Follow me on Twitter @handle and Instagram @handle"
!camera     → "I'm using a Sony ZV-E10 with a Sigma 16mm lens"
!mic        → "Rode PodMic USB on a PSA1+ boom arm"
!schedule   → "I stream every Tuesday and Thursday at 7PM EST"
!discord    → "Join the community: discord.gg/link"
!commands   → "Available commands: !socials !camera !mic !schedule"
```

## 9. Types of Live Streams

### 9.1 Stream Formats

| Format                        | Description                          | Best For                  |
| ----------------------------- | ------------------------------------ | ------------------------- |
| **Just Chatting**             | Casual conversation with viewers     | Community building        |
| **Tutorial / Workshop**       | Teaching live, viewers follow along  | Educational channels      |
| **Coworking / Study With Me** | Working live, ambient productivity   | Productivity niche        |
| **Q&A**                       | Answering viewer questions           | After publishing a video  |
| **Live Editing**              | Edit a video live, explain decisions | Creative/editing channels |
| **Gaming**                    | Play games, commentate               | Gaming channels           |
| **IRL (In Real Life)**        | Stream from outside, events          | Travel, events            |
| **Podcast / Interview**       | Live conversation with a guest       | Multiple personalities    |
| **Product Launch / Reveal**   | Build hype, reveal something new     | Announcements             |
| **Charity Stream**            | Stream for a cause                   | Community events          |

### 9.2 Stream Structure Template

```
Pre-stream (5-10 minutes):
  "Starting Soon" screen with countdown + music
  Chat builds up, early viewers arrive
       │
       ▼
Introduction (2-5 minutes):
  Welcome viewers, state today's plan
  "Hey everyone! Today we're going to..."
       │
       ▼
Main Content (60-180 minutes):
  The actual stream content
  Regular chat interaction breaks
  Every 30 min: recap for new joiners
       │
       ▼
Wind Down (5-10 minutes):
  Summarize what happened
  Thank viewers, raid another stream
       │
       ▼
End Screen:
  "Thanks for watching" screen
  End stream
```

### 9.3 Raiding and Hosting

When you end your stream, "raid" another streamer to send your viewers to them:

```
Benefits of raiding:
- Builds relationships with other creators
- Your viewers discover new content
- The raided streamer may raid you back
- Community building across channels

YouTube: Use "Go Live Together" or direct viewers via chat
Twitch: /raid [channel name]
```

## 10. Going Live Checklist

### 10.1 Before Stream

```
Hardware:
□ Computer plugged in (not on battery)
□ Camera positioned and focused
□ Microphone connected and levels tested
□ Headphones on (prevent echo)
□ Lighting turned on and positioned
□ Second monitor showing chat (if available)
□ Phone on silent / Do Not Disturb
□ Close unnecessary applications (save CPU/RAM)
□ Disable system notifications (Windows Focus Assist / Mac Focus)

Software:
□ OBS open with correct scene selected
□ Audio levels checked (record 15-sec test)
□ Stream key entered and correct platform selected
□ Alerts working (test with StreamElements/Streamlabs)
□ Chat bot online and commands working
□ Background music ready (if using)
□ Overlays displaying correctly

Content:
□ Stream title and description set on platform
□ Stream thumbnail uploaded (YouTube)
□ Category/tags set on platform
□ Outline or talking points prepared
□ Any links or resources ready to share
```

### 10.2 During Stream

```
□ Greet viewers as they join
□ Check audio in first 2 minutes (ask chat "can you hear me ok?")
□ Monitor OBS stats (CPU, FPS, bitrate)
□ Read and respond to chat regularly
□ Take breaks every 60-90 minutes for long streams
□ Remind about subscribing / liking (once per hour max)
□ Stay hydrated (water nearby)
□ If technical issues: stay calm, "one second everyone, working on it"
```

### 10.3 After Stream

```
□ End stream properly (end screen, not abrupt)
□ Raid another stream (if on Twitch) or direct to another video (YouTube)
□ Save the VOD (Video On Demand) — usually automatic
□ Review stream highlights for potential YouTube clips
□ Check stream analytics (peak viewers, chat engagement)
□ Thank community in Discord/social media
□ Note what worked and what to improve for next stream
```

---

**Previous**: [09 - YouTube Channel Strategy](09-YOUTUBE-CHANNEL-STRATEGY.md)
**Next**: [11 - Content Strategy & Storytelling](11-CONTENT-STRATEGY-STORYTELLING.md)
