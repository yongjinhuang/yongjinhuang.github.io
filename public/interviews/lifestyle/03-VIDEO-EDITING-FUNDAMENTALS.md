# Video Editing Fundamentals

A comprehensive guide to the theory and practice of video editing. This document covers
the principles behind good editing, the standard workflow, essential techniques, and
how to think like an editor — before we get into specific software tools.

---

## Table of Contents

1. [What Is Video Editing?](#1-what-is-video-editing)
2. [The Editing Workflow](#2-the-editing-workflow)
3. [Timeline Anatomy](#3-timeline-anatomy)
4. [Types of Cuts](#4-types-of-cuts)
5. [Transitions](#5-transitions)
6. [Pacing and Rhythm](#6-pacing-and-rhythm)
7. [B-Roll and Cutaways](#7-b-roll-and-cutaways)
8. [The Assembly-to-Final Pipeline](#8-the-assembly-to-final-pipeline)
9. [Audio Editing in the Timeline](#9-audio-editing-in-the-timeline)
10. [Keyboard-First Editing](#10-keyboard-first-editing)
11. [Export Settings](#11-export-settings)
12. [Common Beginner Mistakes](#12-common-beginner-mistakes)

---

## 1. What Is Video Editing?

Video editing is the process of selecting, arranging, and modifying footage to tell a
story. It is the most powerful creative tool in video production — raw footage is just
ingredients; editing is the cooking.

### 1.1 The Editor's Job

```
Raw Footage (hours)         Edited Video (minutes)
┌─────────────────┐         ┌─────────────────┐
│ Take 1 (bad)    │         │ Best parts of    │
│ Take 2 (okay)   │         │ Take 3 + B-roll  │
│ Take 3 (great)  │  ────►  │ + music + SFX    │
│ B-roll clips    │         │ + titles + color  │
│ Failed attempts │         │ = Compelling story│
│ Random shots    │         └─────────────────┘
└─────────────────┘
     10:1 ratio is normal (10 hours shot : 1 hour used)
```

### 1.2 The Six Rules of Editing (Walter Murch)

Film editor Walter Murch (The Godfather, Apocalypse Now) defined six criteria for making
a cut, in order of priority:

| Priority | Criterion | What It Means |
|----------|-----------|---------------|
| 1 (51%) | **Emotion** | Does the cut feel right emotionally? |
| 2 (23%) | **Story** | Does it advance the narrative? |
| 3 (10%) | **Rhythm** | Does it happen at the right moment musically? |
| 4 (7%) | **Eye-trace** | Does it respect where the viewer is looking? |
| 5 (5%) | **Two-dimensional screen** | Does it respect the flat plane of the screen? |
| 6 (4%) | **Three-dimensional space** | Does it maintain spatial continuity? |

> **Key insight**: Emotion and story matter far more than technical perfection. A
> slightly "wrong" cut that feels emotionally right is better than a technically
> perfect cut that feels lifeless.

## 2. The Editing Workflow

### 2.1 Overview

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Import  │──►│ Organize │──►│ Assembly │──►│  Rough   │──►│  Fine    │
│  & Ingest│   │ & Review │   │   Cut    │   │   Cut    │   │   Cut    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────┬───┘
                                                                    │
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐          │
│  Export  │◄──│  Review  │◄──│  Sound   │◄──│  Color   │◄─────────┘
│ & Upload │   │ & Polish │   │  Design  │   │  Grade   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### 2.2 Step-by-Step

| Step | What to Do | Time Spent |
|------|-----------|-----------|
| **Import** | Transfer footage to editing drive, create project | 5% |
| **Organize** | Label clips, create bins/folders, review all footage | 10% |
| **Assembly** | Lay down all usable clips in rough order | 15% |
| **Rough cut** | Trim clips, arrange sequence, basic structure | 25% |
| **Fine cut** | Tighten timing, add B-roll, transitions, titles | 25% |
| **Color grade** | Correct and stylize colors | 10% |
| **Sound design** | Mix music, SFX, clean dialog | 5% |
| **Review & polish** | Watch full video, fix issues, get feedback | 3% |
| **Export** | Render final file for upload | 2% |

## 3. Timeline Anatomy

### 3.1 The Timeline

The timeline is where you arrange your clips in sequence. Think of it as a horizontal
track where time flows from left to right.

```
Timeline:
     ◄────────────────── Time ──────────────────►

V3 │ ▓▓TITLE▓▓▓ │                    │ ▓▓LOWER THIRD▓▓ │
V2 │     │ ████B-ROLL████ │    │ ███B-ROLL███ │         │
V1 │ █████CLIP A██████ │ ████CLIP B████ │ ███CLIP C████ │
───┼─────────────────────────────────────────────────────┤
A1 │ ▒▒▒▒DIALOG A▒▒▒▒ │ ▒▒▒DIALOG B▒▒▒ │ ▒▒DIALOG C▒▒ │
A2 │ ░░░░░░░░░░░░░BACKGROUND MUSIC░░░░░░░░░░░░░░░░░░░░░░│
A3 │         │ ♪ SFX ♪ │           │ ♪ SFX ♪ │          │

V = Video tracks (higher number = on top, like z-index in CSS)
A = Audio tracks
```

### 3.2 Key Timeline Concepts

| Concept | Definition | Analogy |
|---------|-----------|---------|
| **Track** | A horizontal lane for clips | Like a layer in Photoshop |
| **Clip** | A piece of footage on the timeline | A paragraph in a document |
| **Playhead** | The vertical line showing current position | The cursor in a text editor |
| **In/Out points** | Start and end markers for a clip | Selection range |
| **Razor/Blade** | Tool to split a clip into two | Splitting a string in code |
| **Ripple** | Cut that closes the gap automatically | Array splice vs delete |
| **Roll** | Adjusting the edit point between two adjacent clips | Moving a boundary |
| **Slip** | Changing which part of a clip is visible without moving it | Changing offset |
| **Slide** | Moving a clip between two others, adjusting their edges | Reordering |
| **Snap** | Clips magnetically align to other clips/playhead | Snap-to-grid |

### 3.3 Three-Point Editing

Professional editors use three-point editing: set any three of the four possible in/out
points (source in, source out, timeline in, timeline out) and the fourth is calculated.

```
Source Clip:                    Timeline:
┌─────────────────────┐         ┌────────────────────────────────┐
│   │ IN ►████████◄ OUT│         │ ████ │ IN ► ???????? │ ████   │
└─────────────────────┘         └────────────────────────────────┘

Set: Source IN, Source OUT, Timeline IN
Result: Clip is placed at Timeline IN with the selected range
```

## 4. Types of Cuts

### 4.1 The Standard Cut (Hard Cut)

The most common cut. One clip instantly replaces another.

```
Before:  ████████CLIP A████████│████████CLIP B████████
                               │
                          Hard cut
                     (instant transition)
```

**When to use**: Default for nearly everything. When in doubt, use a hard cut.

### 4.2 Jump Cut

A cut within the same shot, removing a section of time. Creates a "jump" in the
subject's position.

```
Before:  ████████TALKING████████████████████TALKING████████
                          │ cut │
                     removed pause

After:   ████████TALKING██████████TALKING████████
                          │
                     visible jump
```

**When to use**: YouTube vlogs (very common), removing "ums" and pauses, creating energy.

> **Jump cuts are the signature of modern YouTube.** They keep pacing tight and energy
> high. Do not be afraid to use them liberally.

### 4.3 J-Cut and L-Cut

Audio from one clip overlaps into the other, creating a smoother transition.

```
J-Cut (hear B before seeing B):
Video:  ████████ A ████████│████████ B ████████
Audio:  ████████ A ████│▒▒▒▒▒▒▒▒ B ▒▒▒▒▒▒▒▒▒▒
                        │
                   Audio leads video
                   (shaped like letter J)

L-Cut (hear A while seeing B):
Video:  ████████ A ████████│████████ B ████████
Audio:  ████████ A ████████████│▒▒▒▒ B ▒▒▒▒▒▒▒
                               │
                    Audio trails video
                    (shaped like letter L)
```

**When to use**: Interviews, conversations, documentary — creates smooth, natural flow.

### 4.4 Cutaway

Cut to a different shot (B-roll) while maintaining the audio from the main shot.

```
Video:  ████ A (person talking) ████│██ CUTAWAY ██│████ A (person) ████
Audio:  ████████████████ A (voice continues through) ████████████████████
                                    │              │
                               B-roll covers talking head
```

**When to use**: Cover jump cuts, illustrate what the speaker is describing, add visual
interest, hide mistakes.

### 4.5 Match Cut

A cut between two visually similar shots — the composition, movement, or shape matches
across the cut.

```
Shot A: Close-up of spinning wheel     Shot B: Close-up of spinning planet
┌──────────────┐                       ┌──────────────┐
│    ╭───╮     │                       │    ╭───╮     │
│    │ ↻ │     │  ──── MATCH CUT ────  │    │ ↻ │     │
│    ╰───╯     │                       │    ╰───╯     │
└──────────────┘                       └──────────────┘
   Same shape, same movement, different subject
```

**When to use**: Creative transitions, showing passage of time, thematic connections.

### 4.6 Smash Cut

An abrupt cut from a calm/quiet scene to a loud/intense scene (or vice versa) for
dramatic or comedic effect.

```
Scene A: "This will be easy..."       Scene B: TOTAL CHAOS
┌──────────────────────┐              ┌──────────────────────┐
│    😌 Peaceful       │   SMASH     │   💥🔥 DISASTER     │
│    Calm music        │   CUT ──►   │   Loud music/screams │
│    Soft lighting     │              │   Flashing lights    │
└──────────────────────┘              └──────────────────────┘
```

**When to use**: Comedy, dramatic irony, shocking reveals.

## 5. Transitions

### 5.1 When to Use Transitions

| Transition | When | When NOT |
|-----------|------|----------|
| Hard cut | 95% of the time | Almost never wrong |
| Dissolve (crossfade) | Passage of time, dream sequence | Between dialogue cuts |
| Fade to black | End of scene/chapter, end of video | Random mid-scene |
| Fade from black | Start of scene/video | Randomly |
| Wipe | Stylistic choice, Star Wars homage | Unless intentional style |
| Zoom/push | Emphasis, energy (YouTube style) | Overuse kills impact |
| Whip pan | Energetic scene change | When it feels forced |

### 5.2 The Rule of Transitions

> **"The best transition is the one the viewer does not notice."**

Fancy transitions draw attention to the editing. Hard cuts are invisible. Use transitions
only when they serve a purpose (showing time passage, changing location, creating energy).

### 5.3 YouTube-Style Transitions

Modern YouTube uses several signature transitions:

```
1. Zoom Cut:    Shot A ──[zoom in]──► Shot B (closer or different angle)
2. Whip Pan:    Shot A ──[blur swipe]──► Shot B
3. Match Cut:   Object A ──[same position]──► Object B
4. J-Cut:       Audio of B starts before visual transition
5. Jump Cut:    Same shot, time removed (most common)
```

## 6. Pacing and Rhythm

### 6.1 What Is Pacing?

Pacing is the speed at which your video moves — how quickly you cut between shots, how
long you linger on a moment, and how the rhythm builds and releases.

```
Fast pacing (2-3 sec clips):
│██│██│██│██│██│██│██│██│██│██│██│██│██│
 Energetic, exciting, overwhelming

Medium pacing (4-8 sec clips):
│██████│████████│██████│████████│██████│
 Natural, conversational, YouTube standard

Slow pacing (10-30+ sec clips):
│██████████████████████│████████████████████████│
 Contemplative, cinematic, emotional
```

### 6.2 Pacing by Content Type

| Content Type | Average Shot Length | Cuts Per Minute |
|-------------|--------------------|-----------------|
| Action/sports highlight | 1-2 seconds | 30-60 |
| YouTube vlog (energetic) | 2-4 seconds | 15-30 |
| Tutorial/educational | 5-15 seconds | 4-12 |
| Interview/podcast | 10-30 seconds | 2-6 |
| Documentary | 5-15 seconds | 4-12 |
| Cinematic/film | 5-30+ seconds | 2-12 |
| ASMR/ambient | 30-60+ seconds | 1-2 |

### 6.3 Rhythm and Music

Edit to the beat of your background music for a polished feel:

```
Music beat:    𝅘𝅥       𝅘𝅥       𝅘𝅥       𝅘𝅥       𝅘𝅥       𝅘𝅥
               │       │       │       │       │       │
Timeline:  ████│███████│██████│████████│█████│█████████│
               │       │       │       │       │       │
           Cut on beat  Cut   Cut      Cut     Cut on beat

Not every cut needs to land on a beat, but major transitions
and B-roll cuts feel great when they sync with the music.
```

### 6.4 The Attention Curve

```
Attention
    ▲
    │    ╱╲
    │   ╱  ╲    ╱╲      ╱╲
    │  ╱    ╲  ╱  ╲    ╱  ╲
    │ ╱      ╲╱    ╲  ╱    ╲    ╱╲
    │╱              ╲╱      ╲  ╱  ╲
    ├────────────────────────╲╱────╲──► Time
    │ Hook  Build  Peak  Valley  Peak  End

    Every 3-5 minutes, you need a new "hook" to retain attention.
    YouTube analytics will show you exactly where viewers drop off.
```

## 7. B-Roll and Cutaways

### 7.1 What Is B-Roll?

**A-Roll**: Your primary footage (talking head, main action, interview)
**B-Roll**: Supplementary footage that illustrates, emphasizes, or adds visual variety

```
A-Roll only (boring):
Video: │ 👤 Talking 👤 Talking 👤 Talking 👤 Talking 👤 Talking │
Audio: │ Voice ─────────────────────────────────────────────────│

With B-Roll (engaging):
Video: │ 👤 Talk │🏙 City│ 👤 Talk │☕ Coffee│ 👤 │💻 Screen│ 👤 Talk│
Audio: │ Voice ──────────────────────────────────────────────────────│

B-Roll makes the video visually interesting while the voice continues.
```

### 7.2 Types of B-Roll

| Type | Examples | When to Shoot |
|------|---------|---------------|
| Establishing | Building exterior, city skyline | Before/after main shoot |
| Process | Hands typing, cooking, making coffee | During activity |
| Detail | Close-up of product, hands, tools | Anytime |
| Reaction | Audience reactions, person listening | During events |
| Atmospheric | Rain on window, traffic, nature | Anytime (stock works too) |
| Screen recording | App demo, website, code | Screen capture software |

### 7.3 How Much B-Roll Do You Need?

| Content Type | B-Roll Percentage | Why |
|-------------|-------------------|-----|
| Vlog | 30-50% | Keeps viewer visually engaged |
| Tutorial | 50-70% | Viewers need to see what you are showing |
| Documentary | 40-60% | Illustrates the narrative |
| Podcast (video) | 10-20% | Mostly talking, occasional cutaways |
| Product review | 50-70% | Viewers want to see the product |

> **Rule of thumb**: For every 1 minute of talking head, shoot 2-3 minutes of B-roll.
> You will not use it all, but having more options makes editing much easier.

### 7.4 B-Roll Shooting Checklist

For any location or topic, grab these shots:

1. **Wide** — Establishing shot of the environment
2. **Medium** — Subject in context
3. **Close-up** — Details, textures, hands
4. **Movement** — Panning, sliding, or gimbal shot
5. **Static** — Tripod shot for stability
6. **Different angles** — Same subject from 3+ angles

## 8. The Assembly-to-Final Pipeline

### 8.1 Assembly Cut

First pass: lay down all usable footage in rough chronological order.

**Goal**: Get everything on the timeline. Do not worry about timing or polish.

```
Timeline: │ Intro attempt 3 │ Main point 1 │ Main point 2 │ B-roll │ Outro │
Duration: Usually 2-3x your target length
```

### 8.2 Rough Cut

Second pass: remove bad takes, tighten dialogue, establish basic structure.

**Goal**: Get the story right. Cut ruthlessly.

```
Actions:
✓ Remove bad takes and false starts
✓ Cut filler words (um, uh, like, so, basically)
✓ Remove long pauses
✓ Rearrange sections for better flow
✓ Basic music placement
```

### 8.3 Fine Cut

Third pass: perfect the timing, add B-roll, transitions, and titles.

**Goal**: Make it watchable and polished.

```
Actions:
✓ Add B-roll over jump cuts and to illustrate points
✓ Add titles, lower thirds, and text overlays
✓ Refine music timing and volume
✓ Add sound effects
✓ Add transitions where appropriate
✓ Tighten every cut (remove frames, not just seconds)
```

### 8.4 Polish

Final pass: color grade, sound mix, final review.

**Goal**: Make it professional.

```
Actions:
✓ Color correction (exposure, white balance)
✓ Color grading (mood, style)
✓ Audio mixing (levels, EQ, compression)
✓ Final review (watch full video at 1x speed)
✓ Fix any remaining issues
✓ Export
```

## 9. Audio Editing in the Timeline

### 9.1 Key Audio Editing Techniques

| Technique | What It Is | When to Use |
|-----------|-----------|-------------|
| Trim silence | Remove dead air between sentences | Jump cut vlogs |
| Crossfade | Brief audio dissolve between clips | Smooth dialogue transitions |
| Ducking | Lower music volume when voice is present | Always with background music |
| Room tone fill | Fill gaps with consistent ambient sound | Prevent jarring silence |
| J/L cut | Offset audio from video cut | Natural conversation flow |

### 9.2 Audio Ducking

```
Without ducking:
Voice:    ████████        ████████        ████████
Music:    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
          (music same volume = voice drowned out)

With ducking:
Voice:    ████████        ████████        ████████
Music:    ░░░░░░░░        ░░░░░░░░        ░░░░░░░░
          ░░░        ░░░░░░░░░░░░░        ░░░░░░░░
          ░░░░░░░░░░░░            ░░░░░░░░░░░░
          (music dips when voice appears)
```

Most editing software can automate ducking based on the voice track.

### 9.3 Removing Filler Words

YouTube-style editing aggressively removes filler words and pauses:

```
Before: "So, um, today I wanted to, uh, talk about, basically, uh, video editing"
After:  "Today I wanted to talk about video editing"

In timeline:
Before: │so│um│today I wanted to│uh│talk about│basically│uh│video editing│
After:  │today I wanted to│talk about│video editing│
         (gaps are closed with jump cuts)
```

## 10. Keyboard-First Editing

### 10.1 Why Keyboard Shortcuts Matter

Professional editors rarely use the mouse for cuts. Learning keyboard shortcuts will
10x your editing speed — similar to learning Vim keybindings for code.

### 10.2 Universal Shortcuts (Most Editors)

| Action | Common Shortcut | What It Does |
|--------|----------------|--------------|
| Play/Pause | Space | Toggle playback |
| Cut/Razor | C or B | Split clip at playhead |
| Ripple delete | Shift+Delete | Delete clip and close gap |
| Undo | Cmd/Ctrl+Z | Undo last action |
| In point | I | Mark start of selection |
| Out point | O | Mark end of selection |
| Next edit | Down arrow | Jump to next cut point |
| Previous edit | Up arrow | Jump to previous cut point |
| Nudge clip | , and . | Move selected clip by one frame |
| Zoom timeline | +/- or scroll | Zoom in/out on timeline |
| Select all after | Shift+click | Select all clips after cursor |
| Delete and ripple | Backspace | Remove and close gap |

### 10.3 Editing Speed Tiers

| Level | Speed | How |
|-------|-------|-----|
| Beginner | 4-8 hours per minute of output | Mouse-based, trial and error |
| Intermediate | 1-3 hours per minute | Keyboard shortcuts, established workflow |
| Advanced | 30-60 min per minute | Templates, presets, keyboard-first |
| Expert | 15-30 min per minute | Muscle memory, proxies, assembly-line |

> **Target**: Aim to get to "Intermediate" level within your first month. The jump from
> mouse-based to keyboard-first editing is the single biggest speed improvement.

## 11. Export Settings

### 11.1 YouTube Recommended Export

| Setting | Value |
|---------|-------|
| Format | H.264 (.mp4) |
| Resolution | 3840×2160 (4K) or 1920×1080 |
| Frame rate | Match source |
| Bitrate mode | VBR (Variable Bit Rate) |
| Target bitrate (1080p) | 10-16 Mbps |
| Target bitrate (4K) | 35-68 Mbps |
| Audio codec | AAC |
| Audio bitrate | 320 kbps |
| Audio sample rate | 48 kHz |

### 11.2 Export for Different Platforms

| Platform | Resolution | Aspect Ratio | Max Duration |
|----------|-----------|--------------|--------------|
| YouTube (standard) | 1080p-4K | 16:9 | 12 hours |
| YouTube Shorts | 1080×1920 | 9:16 | 60 seconds |
| Instagram Reels | 1080×1920 | 9:16 | 90 seconds |
| TikTok | 1080×1920 | 9:16 | 10 minutes |
| Twitter/X | 1080p | 16:9 or 1:1 | 2:20 |
| LinkedIn | 1080p | 16:9 or 1:1 | 10 minutes |

### 11.3 Proxy Workflow

When your computer struggles with 4K footage, use proxies (lower-resolution copies for
editing, then swap back to full-res for export).

```
Original 4K footage (100 Mbps)
         │
         ▼
  Create proxy files (1080p, 20 Mbps)
         │
         ▼
  Edit with proxies (smooth playback)
         │
         ▼
  Export → software automatically uses original 4K files
         │
         ▼
  Full quality 4K output
```

All major NLEs (DaVinci Resolve, Premiere Pro, Final Cut) support proxy workflows.

## 12. Common Beginner Mistakes

| Mistake | Why It Is Bad | Fix |
|---------|--------------|-----|
| Keeping every second of footage | Boring, slow, viewers leave | Cut ruthlessly — if in doubt, cut it out |
| Over-using transitions | Distracting, amateurish | Use hard cuts 95% of the time |
| Music too loud | Cannot hear dialogue | Music should be -18 to -24 dB below voice |
| No B-roll | Visually boring talking head | Shoot 2-3x more B-roll than you think you need |
| Inconsistent volume | Viewer adjusts volume constantly | Normalize audio levels across all clips |
| Too many fonts/colors | Messy, unprofessional | Pick 1-2 fonts and 2-3 colors, stick to them |
| No hook in first 5 seconds | Viewers leave immediately | Start with your most interesting moment |
| Exporting at wrong settings | Blurry or blocky video | Use recommended YouTube settings above |
| Not watching the final export | Miss export artifacts or errors | Always watch the full exported video |
| Editing without a plan | Wasted hours, confused narrative | Outline your video structure before editing |

---

**Previous**: [02 - Audio for Video](02-AUDIO-FOR-VIDEO.md)
**Next**: [04 - Video Editing Tools](04-VIDEO-EDITING-TOOLS.md)
