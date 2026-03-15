# Web Game Development & Playable Ads

Interview preparation for web game development roles, with a focus on **playable ads** -- the interactive mini-games served inside mobile app advertisements.

## What Are Playable Ads?

Playable ads are HTML5 mini-games embedded in mobile ad creatives. Users play for 15-30 seconds, then see a call-to-action to install the advertised app. They outperform traditional video ads with 2-8% CTR (vs ~1% for video) and higher-quality users who self-select by playing.

**Key constraints**: single HTML file, 2-5MB total size, no external network requests, must run on low-end mobile WebViews.

## Study Guide

### Foundation (Week 1-2)

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 00 | Framework | Industry overview, terminology (CPI, MRAID, CTR), interview formats |
| 01 | HTML5 Canvas | Canvas API, drawing, transforms, pixel manipulation, off-screen canvas |
| 02 | WebGL Basics | GPU pipeline, shaders, textures, Three.js/PixiJS, sprite batching |
| 03 | Game Loop | requestAnimationFrame, delta time, fixed timestep, interpolation |

### Core Skills (Week 3-4)

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 04 | Game Engines | Phaser, PixiJS, PlayCanvas, Cocos, Three.js -- comparison and selection |
| 05 | Sprites & Animation | Sprite sheets, skeletal animation, tweening, easing, particle systems |
| 06 | Physics & Collision | AABB, circle, SAT, quadtree, Verlet integration, Matter.js |
| 07 | Input Handling | Touch/pointer events, gestures (swipe, pinch, drag), virtual controls |
| 08 | Audio | Web Audio API, autoplay restrictions, sound sprites, procedural audio |

### Architecture & Design (Week 5-6)

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 09 | Design Patterns | FSM, ECS, object pooling, observer, command, flyweight, scene graph |
| 10 | Playable Ad Architecture | MRAID/DAPI specs, ad network requirements, single-file builds, lifecycle |
| 11 | Playable Ad Design | Hook-Play-CTA framework, difficulty curves, engagement psychology |

### Production & Business (Week 7-8)

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 12 | Asset Optimization | Texture compression, audio compression, base64, build pipeline |
| 13 | Performance | 60fps targeting, draw call batching, GC avoidance, mobile profiling |
| 14 | Monetization & Metrics | CPM, CPI, ROAS, LTV, A/B testing, creative optimization |
| 15 | Testing & Deployment | Cross-device QA, MRAID testing, CI/CD, ad network submission |

### Applied Knowledge (Week 9-10)

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 16 | Popular Game Genres | Match-3, runner, puzzle, merge, idle, tower defense -- mechanics & code |
| 17 | Hands-On Project | Build a complete Match-3 playable ad from scratch, end to end |

## Key Technologies

| Category | Technologies |
|----------|-------------|
| **Rendering** | Canvas 2D, WebGL, WebGL2, WebGPU (emerging) |
| **Engines** | Phaser 3, PixiJS, PlayCanvas, Cocos Creator, Three.js |
| **Physics** | Matter.js, Box2D.js, Planck.js, custom AABB/circle |
| **Audio** | Web Audio API, Howler.js |
| **Build** | esbuild, webpack, Rollup (single-file output) |
| **Ad SDKs** | MRAID 2.0/3.0, DAPI (IronSource), VPAID |
| **Testing** | Jest/Vitest, BrowserStack, MRAID polyfill |

## Ad Network Comparison

| Network | Max Size | Format | SDK |
|---------|----------|--------|-----|
| Facebook/Meta | 5MB | Single HTML | MRAID |
| Google Ads | 5MB | Single HTML | MRAID 2.0 |
| Unity Ads | 5MB | Single HTML | mraid.js (injected) |
| IronSource | 5MB | Single HTML | dapi.js |
| AppLovin | 5MB | ZIP | MRAID |
| TikTok | 2MB | Single HTML | MRAID |

## Career Paths

- **Playable ad developer** at game studios (Voodoo, Zynga, King)
- **Creative technologist** at ad platforms (Unity, IronSource, AppLovin)
- **Playable ad agency** developer (Mintegral Mindworks, Luna)
- **Freelance** playable ad creator ($1K-5K per creative)
- **HTML5 game developer** for web portals (CrazyGames, Poki, itch.io)
