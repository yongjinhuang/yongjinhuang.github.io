# Video Editing Tools

A comprehensive guide to the major video editing software options. This document covers
free and paid tools, their strengths and weaknesses, and practical workflows so you can
choose the right tool and start editing immediately.

---

## Table of Contents

1. [Choosing Your Editor](#1-choosing-your-editor)
2. [DaVinci Resolve (Free, Recommended)](#2-davinci-resolve-free-recommended)
3. [Adobe Premiere Pro](#3-adobe-premiere-pro)
4. [Final Cut Pro](#4-final-cut-pro)
5. [CapCut (Mobile + Desktop)](#5-capcut-mobile--desktop)
6. [Other Notable Tools](#6-other-notable-tools)
7. [Comparison Matrix](#7-comparison-matrix)
8. [Hardware Requirements](#8-hardware-requirements)
9. [Project Organization](#9-project-organization)
10. [Building Templates and Presets](#10-building-templates-and-presets)

---

## 1. Choosing Your Editor

### 1.1 Decision Flowchart

```
START
  │
  ├─ Do you have $0 budget?
  │   ├─ Yes ──► DaVinci Resolve (Free)
  │   └─ No ──┐
  │            │
  │   ├─ Do you primarily edit on a phone/tablet?
  │   │   ├─ Yes ──► CapCut (Free) or LumaFusion ($30, iPad)
  │   │   └─ No ──┐
  │   │            │
  │   │   ├─ Are you on a Mac?
  │   │   │   ├─ Yes ──► Final Cut Pro ($300 one-time) or DaVinci Resolve
  │   │   │   └─ No ──┐
  │   │   │            │
  │   │   │   ├─ Do you need Adobe ecosystem integration?
  │   │   │   │   ├─ Yes ──► Premiere Pro ($23/mo)
  │   │   │   │   └─ No ──► DaVinci Resolve (Free or Studio $295)
```

### 1.2 The Short Answer

| Situation | Best Choice |
|-----------|------------|
| Beginner, no budget | **DaVinci Resolve** (free, professional-grade) |
| Quick social media edits | **CapCut** (free, fast, templates) |
| Mac user, willing to pay once | **Final Cut Pro** ($300 one-time) |
| Already in Adobe ecosystem | **Premiere Pro** ($23/month) |
| Want the best color grading | **DaVinci Resolve** (industry standard for color) |
| Mobile-first editing | **CapCut** or **LumaFusion** (iPad) |

> **My recommendation**: Start with **DaVinci Resolve** (free version). It is the only
> professional-grade editor that costs nothing, and it includes industry-leading color
> grading tools. If you later find you prefer a different workflow, the skills transfer.

## 2. DaVinci Resolve (Free, Recommended)

### 2.1 Why DaVinci Resolve

- **Free version** includes 95% of features (no watermark, no time limit)
- **Industry standard** for color grading (used on Hollywood films)
- **All-in-one**: Editing, color grading, visual effects, audio mixing, delivery
- **Cross-platform**: macOS, Windows, Linux
- **Professional output**: Same tool used on major productions

### 2.2 The Page System

DaVinci Resolve organizes work into separate "pages," each focused on a specific task.

```
┌──────────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│  Media   │   Cut     │  Edit    │ Fusion   │  Color   │ Fairlight│
│  Page    │   Page    │  Page    │  Page    │  Page    │  Page    │
├──────────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ Import   │ Quick     │ Full     │ Visual   │ Color    │ Audio    │
│ & manage │ assembly  │ timeline │ effects  │ grading  │ mixing   │
│ media    │ editing   │ editing  │ & motion │ & color  │ & sound  │
│          │           │          │ graphics │ correct. │ design   │
└──────────┴───────────┴──────────┴──────────┴──────────┴──────────┘
                                                              │
                                                        ┌─────▼─────┐
                                                        │  Deliver  │
                                                        │  Page     │
                                                        │  (Export) │
                                                        └───────────┘
```

| Page | When to Use | Beginner Priority |
|------|-------------|-------------------|
| **Media** | Import footage, organize clips | Learn first |
| **Cut** | Fast, rough editing (simplified interface) | Great for beginners |
| **Edit** | Full editing control (traditional NLE) | Learn after Cut page |
| **Fusion** | Motion graphics, VFX, compositing | Learn later |
| **Color** | Color correction and grading | Learn after editing basics |
| **Fairlight** | Professional audio post-production | Learn after editing basics |
| **Deliver** | Export your final video | Learn first |

### 2.3 Getting Started Workflow

```
Step 1: Media Page
  └─ Import all footage, audio, and music files
  └─ Create bins (folders) to organize by type

Step 2: Cut Page (or Edit Page)
  └─ Drag clips to timeline in rough order
  └─ Trim beginnings and ends of clips
  └─ Remove bad takes and filler words
  └─ Add B-roll on track above main footage

Step 3: Edit Page
  └─ Fine-tune cuts and timing
  └─ Add titles and lower thirds
  └─ Add transitions (sparingly)
  └─ Add and level background music

Step 4: Color Page
  └─ Fix white balance and exposure
  └─ Apply a basic color grade (LUT or manual)

Step 5: Fairlight Page
  └─ Normalize audio levels
  └─ Apply noise reduction if needed
  └─ Ensure voice is clear above music

Step 6: Deliver Page
  └─ Select YouTube preset
  └─ Choose resolution and quality
  └─ Export
```

### 2.4 Essential DaVinci Resolve Shortcuts

| Action | Mac | Windows |
|--------|-----|---------|
| Play/Stop | Space | Space |
| Split clip | Cmd+B | Ctrl+B |
| Ripple delete | Cmd+Backspace | Ctrl+Backspace |
| Select all forward | Y | Y |
| Trim mode | T | T |
| Zoom to fit | Shift+Z | Shift+Z |
| Mark In | I | I |
| Mark Out | O | O |
| Insert clip | F9 | F9 |
| Overwrite clip | F10 | F10 |
| Undo | Cmd+Z | Ctrl+Z |
| Full screen viewer | Cmd+F | Ctrl+F |

### 2.5 Free vs Studio ($295 One-Time)

| Feature | Free | Studio |
|---------|------|--------|
| Basic editing | Yes | Yes |
| Color grading (nodes, scopes) | Yes | Yes |
| Fairlight audio | Yes | Yes |
| Export up to 4K UHD | Yes | Yes |
| Neural Engine (AI features) | No | Yes |
| Noise reduction | Basic | Advanced (temporal + spatial) |
| HDR grading tools | No | Yes |
| Multi-GPU support | No | Yes |
| Stereoscopic 3D | No | Yes |
| Film grain | No | Yes |
| Motion blur effects | No | Yes |
| 120fps timeline | No | Yes |

> **Start free.** The free version is genuinely professional-grade. Upgrade only if you
> specifically need AI noise reduction, HDR, or advanced GPU acceleration.

## 3. Adobe Premiere Pro

### 3.1 Overview

The industry standard for video editing in broadcast, corporate, and many YouTube
workflows. Part of the Adobe Creative Cloud ecosystem.

**Cost**: $22.99/month (single app) or $59.99/month (all Adobe apps)

### 3.2 Strengths and Weaknesses

| Strengths | Weaknesses |
|-----------|-----------|
| Huge community, countless tutorials | Subscription-only (no one-time purchase) |
| Integration with After Effects, Photoshop, Audition | Can be buggy, especially with updates |
| Best proxy workflow | Color grading less powerful than Resolve |
| Most YouTube tutorials assume Premiere | Resource-heavy |
| Dynamic Link to After Effects | Monthly cost adds up |
| Lumetri color panel is good | |

### 3.3 Premiere Pro Workspace

```
┌─────────────────────────────────────────────────────────────┐
│  Source Monitor          │        Program Monitor            │
│  (preview source clips)  │  (preview timeline)              │
│                          │                                   │
│  ┌──────────────────┐    │  ┌──────────────────────────┐    │
│  │                  │    │  │                          │    │
│  │   Source video   │    │  │    Timeline preview      │    │
│  │                  │    │  │                          │    │
│  └──────────────────┘    │  └──────────────────────────┘    │
├──────────────────────────┼───────────────────────────────────┤
│  Project Panel           │        Timeline                   │
│  (all media files)       │  (arrange clips here)            │
│                          │                                   │
│  📁 Footage              │  V3 │ Title │                    │
│  📁 Music                │  V2 │ B-roll │ B-roll │          │
│  📁 Graphics             │  V1 │ Clip A │ Clip B │ Clip C │ │
│  📁 SFX                  │  A1 │ Dialog │ Dialog │ Dialog │ │
│                          │  A2 │ Music ─────────────────── │ │
└──────────────────────────┴───────────────────────────────────┘
```

### 3.4 Essential Premiere Pro Shortcuts

| Action | Mac | Windows |
|--------|-----|---------|
| Razor tool | C | C |
| Selection tool | V | V |
| Ripple trim (previous) | Q | Q |
| Ripple trim (next) | W | W |
| Add edit | Cmd+K | Ctrl+K |
| Render in to out | Enter | Enter |
| Export | Cmd+M | Ctrl+M |
| Mark In | I | I |
| Mark Out | O | O |
| Nest clips | Cmd+Shift+N | Ctrl+Shift+N |

## 4. Final Cut Pro

### 4.1 Overview

Apple's professional video editor. Known for speed, optimization on Apple hardware,
and a unique "magnetic timeline" that some love and others find confusing.

**Cost**: $299.99 one-time purchase (Mac App Store) or $4.99/month subscription

### 4.2 Strengths and Weaknesses

| Strengths | Weaknesses |
|-----------|-----------|
| Blazingly fast on Apple Silicon (M1-M4) | Mac only |
| One-time purchase | Magnetic timeline has learning curve |
| Magnetic timeline prevents gaps/sync issues | Smaller community than Premiere |
| Excellent proxy workflow | Less common in professional settings |
| Compressor bundled for encoding | Fewer third-party plugins |
| Best performance per dollar on Mac | Non-standard timeline behavior |

### 4.3 The Magnetic Timeline

Unlike traditional track-based timelines, Final Cut Pro uses a "magnetic" timeline
where clips snap together and move as a group.

```
Traditional timeline (Premiere, Resolve):
V2 │     │ B-roll │                    │
V1 │ Clip A │ Clip B │         │ Clip C │     ← gap is possible
A1 │ Audio A │ Audio B │        │ Audio C│

Magnetic timeline (Final Cut Pro):
Primary │ Clip A │ Clip B │ Clip C │     ← no gaps allowed on primary
Connected│   B-roll  │         │         ← clips "connect" to primary
         │ attached  │         │           and move with it
```

**Advantage**: Clips never go out of sync. Moving one clip moves everything attached.
**Disadvantage**: Different mental model from every other editor.

### 4.4 Essential Final Cut Pro Shortcuts

| Action | Shortcut |
|--------|----------|
| Blade (cut) | B |
| Select | A |
| Trim start | [ |
| Trim end | ] |
| Append to timeline | E |
| Insert | W |
| Connect (as B-roll) | Q |
| New compound clip | Option+G |
| Color board | Cmd+6 |
| Play/Stop | Space or L/K |
| Skim (preview without clicking) | S (toggle) |

## 5. CapCut (Mobile + Desktop)

### 5.1 Overview

Free editing app by ByteDance (TikTok parent company). Surprisingly powerful for a
free tool, with an excellent mobile experience and growing desktop app.

**Cost**: Free (with premium features at $8/month)

### 5.2 Why CapCut Is Great for Beginners

- **Zero learning curve** for basic editing
- **Auto-captions** with excellent accuracy
- **Templates** for trending styles
- **Mobile-first** — edit on your phone anywhere
- **Desktop app** is also free and capable
- **Built-in effects**, transitions, music library
- **Export without watermark** (free)

### 5.3 CapCut Workflow

```
Phone Workflow:
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Import  │──►│  Trim &  │──►│  Add     │──►│  Export  │
│  from    │   │  arrange │   │  captions│   │  & share │
│  camera  │   │  clips   │   │  + music │   │  direct  │
│  roll    │   │          │   │  + effects│   │  to app  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
     Total time: 15-30 minutes for a short video
```

### 5.4 Best Use Cases for CapCut

| Use Case | Why CapCut |
|----------|-----------|
| YouTube Shorts | Vertical editing is fast, auto-captions |
| TikTok content | Direct export, trending templates |
| Instagram Reels | Quick turnaround, social-native features |
| Quick edits on the go | Mobile editing is excellent |
| Auto-captioned videos | Best free auto-caption tool |
| Repurposing long-form to short-form | Fast clipping and resizing |

### 5.5 CapCut Limitations

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| Limited color grading | Cannot achieve cinematic grades | Use DaVinci Resolve for color |
| Basic audio editing | No parametric EQ, limited compression | Process audio separately |
| No proxy workflow | Large files may lag | Edit lower-res, re-export |
| Limited track count | Complex projects hit limits | Use DaVinci Resolve for complex edits |
| Template-heavy culture | Videos can look "same-ish" | Customize templates, develop your style |

## 6. Other Notable Tools

### 6.1 Quick Comparison

| Tool | Platform | Price | Best For |
|------|----------|-------|----------|
| iMovie | Mac/iOS | Free | Absolute beginners on Apple |
| LumaFusion | iPad/iPhone | $30 | Serious mobile editing |
| Shotcut | All | Free/open-source | Free alternative, simple needs |
| Kdenlive | Linux/All | Free/open-source | Linux users |
| HitFilm | All | Free tier | VFX on a budget |
| Descript | All | $24/mo | Podcast/interview editing (text-based) |
| Adobe After Effects | All | $23/mo | Motion graphics, VFX (not editing) |

### 6.2 Descript (Text-Based Editing)

Descript deserves special mention — it transcribes your video and lets you edit by
editing the text transcript. Delete a word from the text, and it deletes it from the video.

```
Traditional editing:                    Descript text-based editing:

Timeline view:                          Text view:
│█████│██│████│██│██████│              "So, um, today I wanted to,
     ↑ find "um" visually               uh, talk about video editing"
     ↑ manually cut it out                    ↑
                                        Select "um" and "uh" in text
                                        Press delete
                                        Done.
```

**Best for**: Podcasts, interviews, talking-head videos, removing filler words.

## 7. Comparison Matrix

### 7.1 Feature Comparison

| Feature | DaVinci Resolve | Premiere Pro | Final Cut Pro | CapCut |
|---------|----------------|-------------|---------------|--------|
| Price | Free / $295 | $23/mo | $300 / $5/mo | Free / $8/mo |
| Platform | Mac/Win/Linux | Mac/Win | Mac only | All |
| Color grading | Excellent | Good | Good | Basic |
| Audio editing | Excellent (Fairlight) | Good (or Audition) | Good | Basic |
| Motion graphics | Good (Fusion) | Good (+ AE) | Basic | Templates |
| VFX | Good (Fusion) | Basic (+ AE) | Basic | Filters |
| Auto-captions | Yes (Studio) | Yes (AI) | Yes | Excellent |
| Learning curve | Moderate | Moderate | Moderate | Easy |
| Performance | Good | Variable | Excellent on Mac | Good |
| Community size | Large | Largest | Medium | Large (growing) |
| Proxy workflow | Yes | Yes (best) | Yes | Limited |

### 7.2 Learning Curve Comparison

```
Skill Level
    ▲
    │
    │                                          ╭──── DaVinci Resolve
Expert│                              ╭────────╯
    │                          ╭────╯
    │                    ╭────╯          ╭──── Premiere Pro
    │              ╭────╯          ╭────╯
    │         ╭───╯          ╭────╯
    │    ╭───╯          ╭───╯        ╭──── Final Cut Pro
    │   ╱          ╭───╯        ╭───╯
    │  ╱      ╭───╯        ╭───╯
    │ ╱  ╭───╯        ╭───╯       ╭──── CapCut
    │╱──╯         ╭──╯       ╭───╯
    ├────────────────────────────────────► Time
    0   1 month  3 months  6 months  1 year

    CapCut: Fastest to productive (days)
    Final Cut: Fast on Mac (weeks)
    Premiere Pro: Standard learning curve (weeks-months)
    DaVinci Resolve: Highest ceiling (months to master all pages)
```

## 8. Hardware Requirements

### 8.1 Minimum Specs by Editor

| Component | DaVinci Resolve | Premiere Pro | Final Cut Pro | CapCut Desktop |
|-----------|----------------|-------------|---------------|----------------|
| RAM | 16 GB | 16 GB | 8 GB (16 recommended) | 8 GB |
| GPU | 2 GB VRAM | 2 GB VRAM | Apple Silicon | Integrated OK |
| Storage | SSD (NVMe preferred) | SSD | SSD | SSD |
| CPU | 6+ cores | 6+ cores | Apple Silicon | 4+ cores |

### 8.2 Recommended Editing Computers

| Budget | Mac | Windows |
|--------|-----|---------|
| Budget ($800-1,200) | MacBook Air M2 (16GB) | AMD 5600X + 32GB + RTX 3060 |
| Mid-range ($1,500-2,500) | MacBook Pro M3 Pro (18GB) | AMD 7700X + 32GB + RTX 4070 |
| Professional ($3,000+) | MacBook Pro M4 Max (48GB) | AMD 9800X3D + 64GB + RTX 4080 |

### 8.3 Storage Strategy

```
Fast SSD (NVMe):          External HDD (archive):
┌──────────────┐          ┌──────────────┐
│ Current      │          │ Completed    │
│ project      │          │ projects     │
│ files        │  ────►   │ (raw footage │
│              │  when    │  backups)    │
│ 500GB-2TB   │  done    │ 4TB-8TB     │
└──────────────┘          └──────────────┘

Rule: Keep active project on fast SSD.
      Archive completed projects to cheaper external storage.
      Always keep raw footage backed up somewhere.
```

## 9. Project Organization

### 9.1 Folder Structure Template

```
📁 Project_Name_YYYY-MM-DD/
├── 📁 01_Footage/
│   ├── 📁 A-Roll/           (main camera footage)
│   ├── 📁 B-Roll/           (supplementary footage)
│   └── 📁 Screen_Recordings/ (if applicable)
├── 📁 02_Audio/
│   ├── 📁 Voiceover/
│   ├── 📁 Music/
│   └── 📁 SFX/
├── 📁 03_Graphics/
│   ├── 📁 Thumbnails/
│   ├── 📁 Lower_Thirds/
│   └── 📁 Logos/
├── 📁 04_Project_Files/      (NLE project files)
├── 📁 05_Exports/
│   ├── 📁 Drafts/
│   └── 📁 Final/
└── 📁 06_Proxies/            (if using proxy workflow)
```

### 9.2 File Naming Convention

```
Good: YYYY-MM-DD_ProjectName_ClipType_###.ext
Example: 2026-03-04_CoffeeVlog_ARole_001.mp4
         2026-03-04_CoffeeVlog_BRoll_001.mp4
         2026-03-04_CoffeeVlog_BRoll_002.mp4

Bad: IMG_4521.mp4, final_v2_FINAL_final(1).mp4
```

## 10. Building Templates and Presets

### 10.1 Why Templates Save Hours

Once you establish a video style, create templates for:

| Template | What It Includes | Time Saved |
|----------|-----------------|------------|
| Intro sequence | Animated logo, music sting | 30-60 min per video |
| Lower thirds | Name/title graphic preset | 15-30 min per video |
| End screen | Subscribe button, video links | 20-30 min per video |
| Color grade | Your signature look as a LUT/preset | 30-60 min per video |
| Audio chain | EQ, compression, de-ess presets | 15-20 min per video |
| Project template | Pre-built timeline with tracks, bins | 15 min per video |

### 10.2 Creating a Project Template

```
Template Timeline:
V4 │ [TITLE CARD]  │                                │ [END SCREEN] │
V3 │                │ [LOWER THIRD] │                │              │
V2 │                │ [B-ROLL ZONE] │ [B-ROLL ZONE]  │              │
V1 │ [INTRO]        │ [MAIN CONTENT ZONE]            │ [OUTRO]      │
───┤────────────────────────────────────────────────────────────────│
A1 │ [VOICE ZONE]                                                   │
A2 │ [MUSIC - INTRO] │ [MUSIC - MAIN]               │ [MUSIC-OUTRO]│
A3 │ [SFX ZONE]                                                     │

Save this as your starting point for every new video.
Replace placeholders with actual content.
```

### 10.3 Style Guide for Consistency

Create a document for your channel:

```
Channel Style Guide:
├── Font: Montserrat Bold (titles), Inter (body)
├── Colors: #FF6B35 (accent), #FFFFFF (text), #1A1A2E (background)
├── Lower third: Left-aligned, 3-second duration, slide-in animation
├── Transitions: Hard cuts (90%), zoom cuts (10%)
├── Music style: Lo-fi, chill electronic
├── Color grade: Slightly desaturated, teal shadows, warm highlights
├── Thumbnail style: Big text, expressive face, bright background
└── Pacing: 4-6 second average shot length
```

---

**Previous**: [03 - Video Editing Fundamentals](03-VIDEO-EDITING-FUNDAMENTALS.md)
**Next**: [05 - Color Grading & Correction](05-COLOR-GRADING-CORRECTION.md)
