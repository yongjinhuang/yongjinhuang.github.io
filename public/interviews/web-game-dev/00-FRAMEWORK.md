# Web Game Development Interview Framework

## Table of Contents

1. [Industry Landscape](#industry-landscape)
2. [Market Size & Key Players](#market-size--key-players)
3. [Core Technical Areas](#core-technical-areas)
4. [Playable Ad Interviews vs General Game Dev](#playable-ad-interviews-vs-general-game-dev)
5. [Common Interview Formats](#common-interview-formats)
6. [Evaluation Criteria](#evaluation-criteria)
7. [Study Plan Recommendation](#study-plan-recommendation)
8. [Key Terminology Glossary](#key-terminology-glossary)
9. [Interview Questions & Answers](#interview-questions--answers)

---

## Industry Landscape

### What is Web Game Development?

Web game development encompasses creating interactive games that run in web browsers using HTML5, JavaScript, WebGL, and related technologies. The field spans several distinct sub-domains:

```
Web Game Development
├── Playable Ads
│   ├── Interactive end cards
│   ├── Rewarded playables
│   └── Interstitial playables
├── Hyper-Casual Games
│   ├── Instant games (Facebook, Snapchat)
│   ├── Progressive Web App (PWA) games
│   └── HTML5 portal games
├── Mid-Core Browser Games
│   ├── Multiplayer browser games
│   ├── Strategy/RPG games
│   └── Social casino games
├── Advergames & Branded Content
│   ├── Marketing campaign games
│   ├── Product launch interactives
│   └── Gamified landing pages
└── Educational Games
    ├── EdTech platforms
    ├── Training simulations
    └── Interactive learning modules
```

### Playable Ads: The Fastest-Growing Segment

Playable ads are interactive mini-games served as advertisements. Users play a 15-60 second game experience that showcases core gameplay, then see a call-to-action (CTA) to install the full app.

**Why playable ads matter:**

1. **Higher conversion rates**: 3-8x higher install rates than static or video ads
2. **Better user quality**: Users who engage with playables have 30-40% higher Day 7 retention
3. **Lower CPI**: More efficient user acquisition spending
4. **Fraud resistance**: Harder to fake engagement with interactive content
5. **Platform preference**: Ad networks increasingly favor playable formats

**Typical playable ad constraints:**

```
┌─────────────────────────────────────────┐
│         Playable Ad Constraints         │
├─────────────────────────────────────────┤
│ File Size:    2MB - 5MB (varies by      │
│               network, some allow 10MB)  │
│                                         │
│ Duration:     15s - 60s average play    │
│                                         │
│ Format:       Single HTML file (MRAID)  │
│               or small bundle           │
│                                         │
│ Performance:  Must run on low-end       │
│               devices at 30fps+         │
│                                         │
│ Loading:      < 3 seconds to first      │
│               interaction               │
│                                         │
│ Compatibility:All mobile browsers,      │
│               in-app webviews           │
│                                         │
│ End Screen:   Must include CTA button   │
│               and app store redirect    │
└─────────────────────────────────────────┘
```

### Hyper-Casual Games

Hyper-casual games are simple, instantly playable games with minimal onboarding. They are often developed for mobile platforms but increasingly built with HTML5 for cross-platform reach.

**Characteristics:**
- Simple one-touch or two-touch mechanics
- No tutorial needed (intuitive gameplay)
- Session length: 30 seconds to 2 minutes
- Monetized primarily through ads (interstitial, rewarded, banners)
- Rapid prototyping: concept to prototype in 1-3 days
- Data-driven iteration based on CPI tests

### HTML5 Games for Portals & Instant Games

HTML5 games distributed through portals (Poki, CrazyGames, Newgrounds) or instant game platforms (Facebook Instant Games, Snapchat Games, LINE).

**Key considerations:**
- No app store approval process
- Instant loading (progressive loading techniques)
- Cross-platform by default
- Revenue through ads and sometimes in-app purchases
- SDK integration requirements vary by platform

---

## Market Size & Key Players

### Market Overview

```
┌──────────────────────────────────────────────────┐
│           Web Game Market Segments (2024)         │
├──────────────────────────────────────────────────┤
│                                                  │
│  Playable Ads Market:        ~$5-8B annually     │
│  HTML5 Gaming Market:        ~$10-15B annually   │
│  Hyper-Casual Market:        ~$3-5B annually     │
│  Social Casino (HTML5):      ~$6-8B annually     │
│                                                  │
│  Combined Web Game Market:   ~$25-35B+           │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Key Players by Category

#### Ad Tech & Playable Platforms

| Company | Role | Notable Products |
|---------|------|-----------------|
| **Unity (IronSource/Supersonic)** | Ad network + playable creation tools | Luna, Supersonic Studio |
| **AppLovin** | Ad network + game publishing | MAX mediation, SparkLabs |
| **Meta (Facebook)** | Major ad network | Playable Ads in Ads Manager |
| **Google** | Ad network | Interactive ads in Google Ads |
| **Mintegral** | Ad network (strong in Asia) | Playturbo playable ad platform |
| **Mindworks** | Playable ad creative studio | Playturbo |
| **Digital Turbine** | Ad tech | AdColony playables |

#### Game Publishers (Hyper-Casual)

| Company | Role | Notable Titles |
|---------|------|---------------|
| **Voodoo** | Leading hyper-casual publisher | Helix Jump, Hole.io |
| **Supersonic (Unity)** | Publisher + monetization | Bridge Race, Join Clash |
| **CrazyLabs** | Top hyper-casual publisher | Phone Case DIY, Tie Dye |
| **SayGames** | Publisher | Sand Balls, Johnny Trigger |
| **Ketchapp (Ubisoft)** | Publisher | 2048, Rider |

#### HTML5 Game Portals

| Platform | Model | Developer Revenue |
|----------|-------|-------------------|
| **Poki** | Ad-supported portal | Revenue share |
| **CrazyGames** | Ad-supported portal | Revenue share |
| **Kongregate** | Ad + IAP portal | Revenue share |
| **itch.io** | Indie marketplace | Pay what you want |
| **Newgrounds** | Community portal | Ad revenue share |

#### Instant Game Platforms

| Platform | SDK | Max Size |
|----------|-----|----------|
| **Facebook Instant Games** | FBInstant SDK | 200MB (initial 1MB) |
| **Snapchat Games** | Snap Games SDK | Varies |
| **LINE Quick Games** | LIFF SDK | Varies |
| **WeChat Mini Games** | WeChat SDK | 20MB |

#### Engine & Tool Companies

| Company | Product | Focus |
|---------|---------|-------|
| **Cocos** | Cocos Creator | 2D/3D (strong in China) |
| **PlayCanvas** | PlayCanvas Engine | 3D, playable ads |
| **Phaser** | Phaser CE/3 | 2D web games |
| **PixiJS** | PixiJS | 2D rendering |
| **GDevelop** | GDevelop | No-code game maker |

---

## Core Technical Areas

### Technical Skills Matrix

```
┌──────────────────────────────────────────────────┐
│         Core Technical Areas to Master           │
├───────────────────────────────────���──────────────┤
│                                                  │
│  1. Rendering                                    │
│     ├── Canvas 2D API                            │
│     ├── WebGL / WebGL2                           │
│     ├── Sprite systems & texture atlases         │
│     ├── Particle systems                         │
│     └── Shader programming (GLSL)                │
│                                                  │
│  2. Game Loop                                    │
│     ├── requestAnimationFrame                    │
│     ├── Delta time & fixed timestep              │
│     ├── State management                         │
│     └── Performance budgeting                    │
│                                                  │
│  3. Physics                                      │
│     ├── AABB & circle collision detection        │
│     ├── SAT (Separating Axis Theorem)            │
│     ├── Rigid body dynamics                      │
│     ├── Physics engines (Matter.js, Box2D)       │
│     └── Raycasting                               │
│                                                  │
│  4. Audio                                        │
│     ├── Web Audio API                            │
│     ├── Audio sprites                            │
│     ├── Spatial audio                            │
│     └── Audio compression (Howler.js)            │
│                                                  │
│  5. Input Handling                               │
│     ├── Touch events (touchstart/move/end)       │
│     ├── Pointer events (unified input)           │
│     ├── Gesture recognition                      │
│     ├── Keyboard input                           │
│     └── Gamepad API                              │
│                                                  │
│  6. Optimization                                 │
│     ├── Memory management & object pooling       │
│     ├── Draw call batching                       │
│     ├── Asset compression & lazy loading         │
│     ├── Code splitting & tree shaking            │
│     └── Profiling (Chrome DevTools, Spector.js)  │
│                                                  │
│  7. Architecture                                 │
│     ├── Entity-Component-System (ECS)            │
│     ├── Scene management                         │
│     ├── Event systems                            │
│     ├── State machines                           │
│     └── Asset pipeline                           │
│                                                  │
│  8. Playable-Ad Specific                         │
│     ├── MRAID API compliance                     │
│     ├── Single-file bundling                     │
│     ├── Size optimization                        │
│     ├── CTA integration                          │
│     ├── Analytics & event tracking               │
│     └── A/B testing frameworks                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Skill Prioritization for Playable Ads

```
Priority 1 (Must Have):
  - JavaScript/TypeScript proficiency
  - Canvas 2D rendering
  - Game loop fundamentals
  - Touch input handling
  - Asset optimization / file size management
  - MRAID basics

Priority 2 (Strong Advantage):
  - WebGL / PixiJS / Phaser
  - Sprite animation systems
  - Tween / easing libraries
  - Physics (basic collision detection)
  - Particle systems

Priority 3 (Nice to Have):
  - 3D rendering (Three.js / PlayCanvas)
  - Shader programming
  - Skeletal animation (Spine)
  - Web Audio API
  - ECS architecture
```

---

## Playable Ad Interviews vs General Game Dev

### Key Differences

| Aspect | Playable Ad Interview | General Game Dev Interview |
|--------|----------------------|---------------------------|
| **Primary focus** | Size optimization, fast loading | Gameplay depth, features |
| **File size** | 2-5MB hard limit | Not typically a concern |
| **Performance target** | Low-end mobile (30fps) | Target platform specific |
| **Duration** | 15-60 second experience | Full game sessions |
| **Architecture** | Simple, often procedural | Complex, scalable systems |
| **Code style** | Compact, inline, single-file | Modular, maintainable |
| **Art pipeline** | Compressed sprites, generated art | Full asset pipeline |
| **Audio** | Minimal, often generated | Full sound design |
| **Testing** | Cross-webview compatibility | Platform-specific QA |
| **Metrics** | CPI, IPM, CTR, engagement | FPS, load time, crashes |
| **Design sense** | UX compression, instant hook | Full game design |

### What Playable Ad Interviewers Look For

```javascript
// They want to see you can:

// 1. Work within extreme constraints
function createGame() {
  // Entire game in < 2MB
  // Load in < 3 seconds
  // Fun in < 30 seconds
  // Works on all devices
}

// 2. Optimize aggressively
function optimizeAssets() {
  // Inline base64 images to avoid HTTP requests
  // Use CSS for simple shapes instead of images
  // Generate textures procedurally when possible
  // Compress and quantize everything
}

// 3. Ship fast with quality
function developmentVelocity() {
  // Prototype in hours, not days
  // Iterate based on data
  // Handle edge cases (orientation, back button, etc.)
  // Support all ad network requirements
}

// 4. Understand the business
function businessAwareness() {
  // Know what makes a good CPI
  // Understand how IPM affects revenue
  // Think about user quality, not just installs
  // A/B test creative variations
}
```

### What General Game Dev Interviewers Look For

```javascript
// They want to see you can:

// 1. Build scalable systems
class EntityComponentSystem {
  // Clean separation of data and behavior
  // Efficient queries and updates
  // Memory-friendly data layouts
}

// 2. Solve complex technical problems
class PhysicsEngine {
  // Broad phase collision detection
  // Narrow phase resolution
  // Constraint solvers
  // Continuous collision detection
}

// 3. Write maintainable code
class SceneManager {
  // Clear lifecycle management
  // Resource loading/unloading
  // State transitions
  // Error recovery
}

// 4. Optimize for performance
class RenderPipeline {
  // Draw call batching
  // Spatial partitioning
  // LOD systems
  // GPU profiling
}
```

---

## Common Interview Formats

### Format 1: Take-Home Game Project (Most Common for Playable Ads)

**Typical prompt:**
> "Create a playable ad for [genre: match-3/runner/puzzle]. The ad should be a single HTML file under 3MB. The player should understand the core mechanic and reach the CTA within 30 seconds."

**Time given:** 2-5 days

**Evaluation criteria:**
- Does it work on mobile?
- Is it under the size limit?
- Is the game fun and intuitive?
- Does it drive the user to the CTA?
- Code quality and organization
- Performance on low-end devices

**Tips for take-home projects:**

```javascript
// Structure your single-file game like this:
/*
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* All CSS inline */
    * { margin: 0; padding: 0; }
    canvas { display: block; }
    #cta { /* CTA button styles */ }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="cta" style="display:none">
    <button onclick="installGame()">INSTALL NOW</button>
  </div>
  <script>
    // All game code inline
    // Base64 encoded assets
    // Minified libraries if needed

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // ... game implementation
  </script>
</body>
</html>
*/
```

### Format 2: Live Coding Session

**Duration:** 45-90 minutes

**Typical tasks:**
1. Implement a basic game mechanic (e.g., drag and drop, projectile motion)
2. Optimize a rendering pipeline
3. Debug a performance issue in existing code
4. Add a feature to a simple game

**Example live coding prompt:**
> "Implement a simple 'tap to collect falling items' game. Items fall from the top, player moves a basket at the bottom by touch/mouse. Track score and end after 30 seconds."

```javascript
// What they want to see in live coding:

// 1. You start with architecture, not code
// "First, let me outline the game objects and loop..."

// 2. You write clean code even under pressure
class FallingItemsGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.items = [];
    this.basket = { x: canvas.width / 2, y: canvas.height - 50, width: 80, height: 40 };
    this.score = 0;
    this.timeRemaining = 30;
    this.lastTime = 0;
    this.spawnTimer = 0;
  }

  update(deltaTime) {
    this.timeRemaining -= deltaTime;
    if (this.timeRemaining <= 0) {
      this.endGame();
      return;
    }

    this.spawnTimer += deltaTime;
    if (this.spawnTimer > 0.5) {
      this.spawnItem();
      this.spawnTimer = 0;
    }

    this.items = this.items
      .map(item => ({ ...item, y: item.y + item.speed * deltaTime }))
      .filter(item => {
        if (this.checkCollision(item, this.basket)) {
          this.score++;
          return false;
        }
        return item.y < this.canvas.height;
      });
  }

  // 3. You handle edge cases
  checkCollision(item, basket) {
    return (
      item.x + item.width > basket.x &&
      item.x < basket.x + basket.width &&
      item.y + item.height > basket.y &&
      item.y < basket.y + basket.height
    );
  }

  spawnItem() {
    const newItem = {
      x: Math.random() * (this.canvas.width - 30),
      y: -30,
      width: 30,
      height: 30,
      speed: 100 + Math.random() * 200,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };
    this.items = [...this.items, newItem]; // Immutable
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw basket
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(this.basket.x, this.basket.y, this.basket.width, this.basket.height);

    // Draw items
    this.items.forEach(item => {
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.width, item.height);
    });

    // Draw HUD
    ctx.fillStyle = '#FFF';
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${this.score}`, 10, 30);
    ctx.fillText(`Time: ${Math.ceil(this.timeRemaining)}s`, 10, 55);
  }
}
```

### Format 3: System Design

**Duration:** 45-60 minutes

**Typical prompts:**
- "Design the architecture for a playable ad creation platform"
- "Design a system to serve and track playable ads across multiple networks"
- "Design the architecture for a real-time multiplayer HTML5 game"
- "How would you build an A/B testing pipeline for playable ad creatives?"

```
Example System Design: Playable Ad Creation Platform

┌─────────────────────────────────────────────────────────┐
│                    Creator Dashboard                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Template  │  │  Asset   │  │ Preview  │              │
│  │ Library   │  │ Manager  │  │ & Test   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│       └──────────────┼──────────────┘                    │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │  Build Engine │                           │
│              │  - Bundle     │                           │
│              │  - Minify     │                           │
│              │  - Inline     │                           │
│              │  - Optimize   │                           │
│              └───────┬───────┘                           │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │  Export Engine │                           │
│              │  - MRAID wrap │                           │
│              │  - Size check │                           │
│              │  - QA tests   │                           │
│              └───────┬───────┘                           │
│                      │                                   │
└──────────────────────┼──────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │ Unity  │   │ Meta   │   │ Google │
    │ Ads    │   │ Ads    │   │ Ads    │
    └────────┘   └────────┘   └────────┘
```

### Format 4: Technical Deep Dive / Whiteboard

**Duration:** 30-45 minutes

**Topics:**
- Walk through how a rendering pipeline works
- Explain your optimization process for a playable ad
- Discuss trade-offs between different physics approaches
- Explain how you'd implement a specific visual effect

### Format 5: Portfolio Review

**Duration:** 30-60 minutes

**What to prepare:**
- 3-5 playable ad examples with metrics (CPI, IPM)
- Before/after optimization stories
- Technical challenges and solutions
- A/B testing results and learnings

---

## Evaluation Criteria

### Technical Evaluation Matrix

```
┌────────────────────────────────────────────────────────────┐
│              Evaluation Criteria & Weights                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Code Quality (25%)                                        │
│  ├── Clean, readable code                                  │
│  ├── Appropriate abstractions                              │
│  ├── Error handling                                        │
│  ├── No memory leaks                                       │
│  └── Consistent style                                      │
│                                                            │
│  Performance Awareness (25%)                               │
│  ├── Understands rendering pipeline                        │
│  ├── Knows optimization techniques                         │
│  ├── Can profile and measure                               │
│  ├── Makes informed trade-offs                             │
│  └── Targets appropriate metrics                           │
│                                                            │
│  Creative Problem-Solving (20%)                            │
│  ├── Novel approaches to constraints                       │
│  ├── Good game feel / juice                                │
│  ├── Effective UX design                                   │
│  ├── Visual polish                                         │
│  └── Fun factor                                            │
│                                                            │
│  Technical Depth (15%)                                     │
│  ├── Understands underlying systems                        │
│  ├── Can explain trade-offs                                │
│  ├── Knows multiple approaches                             │
│  ├── Debugging skills                                      │
│  └── Architecture knowledge                                │
│                                                            │
│  Communication (15%)                                       │
│  ├── Explains thinking clearly                             │
│  ├── Asks good questions                                   │
│  ├── Collaborates effectively                              │
│  ├── Handles feedback well                                 │
│  └── Business awareness                                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Red Flags (What Gets You Rejected)

```javascript
// 1. Not understanding the constraints
"I'd use a 50MB 3D model for the playable ad"  // No!

// 2. Poor performance awareness
function render() {
  // Creating new objects every frame
  const gradient = ctx.createLinearGradient(0, 0, 100, 100);  // Allocate once!
  // Using getImageData in the game loop
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);  // Never!
}

// 3. Not handling mobile
document.addEventListener('click', handler);  // What about touch?
// No viewport meta tag
// No orientation handling
// Fixed pixel sizes instead of responsive

// 4. Memory leaks
function spawnParticle() {
  particles.push(new Particle());  // Never cleaned up!
  // Event listeners added but never removed
  // Textures loaded but never disposed
}

// 5. No understanding of the business
"What's CPI?" // You need to know the metrics
"Why does file size matter?" // This is fundamental
```

### Green Flags (What Gets You Hired)

```javascript
// 1. Size-conscious asset management
const ASSETS = {
  // Base64 inline for small assets (saves HTTP request)
  coinSound: 'data:audio/mp3;base64,...',
  // Procedural generation for backgrounds
  drawBackground(ctx) { /* generate programmatically */ },
  // Sprite atlas for multiple sprites in one image
  atlas: 'data:image/png;base64,...',
  atlasMap: { coin: [0,0,32,32], gem: [32,0,32,32] }
};

// 2. Performance-first rendering
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Pre-allocate off-screen canvases
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCtx = this.bufferCanvas.getContext('2d');
  }

  // Batch similar draw calls
  renderSprites(sprites) {
    const sorted = [...sprites].sort((a, b) => a.textureId - b.textureId);
    let currentTexture = null;
    for (const sprite of sorted) {
      if (sprite.textureId !== currentTexture) {
        currentTexture = sprite.textureId;
        // Texture switch
      }
      this.drawSprite(sprite);
    }
  }
}

// 3. Responsive design
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio, 2); // Cap at 2x
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  // Recalculate game coordinates
  gameWidth = rect.width;
  gameHeight = rect.height;
}

// 4. Clean game architecture
const GameState = Object.freeze({
  LOADING: 'loading',
  TUTORIAL: 'tutorial',
  PLAYING: 'playing',
  WIN: 'win',
  END_CARD: 'end_card'
});
```

---

## Study Plan Recommendation

### Week 1-2: Foundations

```
Day 1-3:   Canvas 2D API fundamentals
            - Drawing primitives, images, text
            - Transformations and state management
            - Practice: Draw a simple scene

Day 4-5:   Game loop basics
            - requestAnimationFrame
            - Delta time
            - Input handling (touch + mouse)
            - Practice: Moving character with input

Day 6-7:   Sprite systems
            - Sprite sheets and texture atlases
            - Frame-based animation
            - Practice: Animated character sprite

Day 8-10:  Basic collision detection
            - AABB collision
            - Circle collision
            - Point-in-rect / point-in-circle
            - Practice: Simple collection game

Day 11-14: First complete mini-game
            - Combine all above
            - Add score, timer, game over
            - Add basic particle effects
            - Practice: Complete a "catch falling items" game
```

### Week 3-4: Intermediate Topics

```
Day 15-17: Tweening and easing
            - Easing functions
            - Tween library (or build your own)
            - UI animations
            - Practice: Animated menus and transitions

Day 18-20: WebGL basics (or PixiJS)
            - Why WebGL? When to use it?
            - PixiJS: sprites, containers, filters
            - Practice: Port canvas game to PixiJS

Day 21-23: Optimization techniques
            - Object pooling
            - Spatial partitioning (grid)
            - Draw call reduction
            - Memory profiling
            - Practice: Optimize a particle system

Day 24-28: Playable ad specifics
            - MRAID API
            - Single-file bundling
            - Size optimization
            - CTA implementation
            - Practice: Create a complete playable ad
```

### Week 5-6: Advanced & Interview Prep

```
Day 29-31: Advanced rendering
            - Shader effects (if targeting WebGL)
            - Particle systems (advanced)
            - Screen shake, juice effects
            - Practice: Add polish to your playable ad

Day 32-34: Game engine deep dive
            - Pick one: Phaser 3 or PixiJS + custom
            - Learn the architecture deeply
            - Practice: Build a game with the engine

Day 35-38: Interview-specific practice
            - Live coding practice (time yourself)
            - System design practice
            - Portfolio preparation
            - Practice: Solve 2-3 take-home style challenges

Day 39-42: Review and polish
            - Review all code examples
            - Prepare talking points for each project
            - Practice explaining technical decisions
            - Mock interviews with peers
```

### Continuous Learning Resources

```
Online Resources:
├── MDN Web Docs (Canvas, WebGL, Web Audio API)
├── WebGL Fundamentals (webglfundamentals.org)
├── The Book of Shaders (thebookofshaders.com)
├── Game Programming Patterns (gameprogrammingpatterns.com)
├── Red Blob Games (redblobgames.com) - algorithms visualized
├── Phaser Examples (phaser.io/examples)
└── PixiJS Examples (pixijs.io/examples)

Books:
├── "Game Programming Patterns" by Robert Nystrom
├── "The Nature of Code" by Daniel Shiffman
├── "Real-Time Rendering" by Akenine-Moller et al.
└── "HTML5 Game Development" by various authors

YouTube Channels:
├── The Coding Train (Daniel Shiffman)
├── Javidx9 (OneLoneCoder)
├── Sebastian Lague
└── GDC Talks (vault.gdconf.com)

Community:
├── r/gamedev on Reddit
├── HTML5 Game Devs Forum
├── Phaser Discord
├── PixiJS Discord
└── JS GameDev Discord
```

---

## Key Terminology Glossary

### Advertising & Monetization Terms

| Term | Full Name | Definition |
|------|-----------|------------|
| **CPI** | Cost Per Install | Amount advertiser pays for each app install. Lower is better for advertiser. Typical range: $0.50-$5.00 |
| **CPM** | Cost Per Mille | Cost per 1,000 ad impressions. Measures how much advertisers pay per 1k views |
| **eCPM** | Effective CPM | Revenue earned per 1,000 impressions (publisher perspective). Higher is better for publisher |
| **IPM** | Installs Per Mille | Number of installs per 1,000 impressions. Measures ad creative effectiveness. IPM = (Installs / Impressions) x 1000 |
| **CTR** | Click-Through Rate | Percentage of users who click the CTA. CTR = (Clicks / Impressions) x 100% |
| **CVR** | Conversion Rate | Percentage of users who install after clicking. CVR = (Installs / Clicks) x 100% |
| **ROAS** | Return on Ad Spend | Revenue generated per dollar spent on ads. ROAS = Revenue / Ad Spend |
| **LTV** | Lifetime Value | Total revenue a user generates over their lifetime. Critical for profitability calculation |
| **ARPU** | Average Revenue Per User | Average revenue generated per user in a time period |
| **ARPDAU** | Average Revenue Per Daily Active User | Revenue per DAU, key daily metric |
| **DAU** | Daily Active Users | Number of unique users who engage per day |
| **MAU** | Monthly Active Users | Number of unique users per month |
| **D1/D7/D30** | Day 1/7/30 Retention | Percentage of users who return after 1/7/30 days |
| **CTA** | Call To Action | Button/prompt that directs user to app store |

### Technical & Ad Format Terms

| Term | Full Name | Definition |
|------|-----------|------------|
| **MRAID** | Mobile Rich Media Ad Interface Definitions | IAB standard API for rich media ads in mobile apps. Provides methods for ad behavior (expand, resize, close) |
| **VPAID** | Video Player Ad Interface Definition | Standard for interactive video ads. Being replaced by SIMID |
| **SIMID** | Secure Interactive Media Interface Definition | Successor to VPAID for interactive ads |
| **VAST** | Video Ad Serving Template | XML-based protocol for serving video ads |
| **SDK** | Software Development Kit | Tools/libraries for integrating with a platform |
| **Mediation** | Ad Mediation | System that manages multiple ad networks to maximize revenue |
| **Waterfall** | Waterfall Mediation | Sequential ad network prioritization. Being replaced by bidding |
| **Bidding** | In-App Bidding/Header Bidding | Real-time auction for ad impressions among networks |
| **Fill Rate** | - | Percentage of ad requests that result in a displayed ad |
| **Interstitial** | - | Full-screen ad displayed at natural transition points |
| **Rewarded** | Rewarded Ad | Ad that gives users in-game rewards for engaging (watching video, playing playable) |
| **Banner** | Banner Ad | Small rectangular ad, usually at top or bottom of screen |
| **Native** | Native Ad | Ad designed to match the look and feel of the app content |

### Game Development Terms

| Term | Definition |
|------|------------|
| **Game Loop** | Core cycle: input processing → game state update → rendering |
| **Delta Time** | Time elapsed between frames, used for frame-rate independent movement |
| **Sprite** | 2D image or animation used in a game |
| **Sprite Sheet** | Single image containing multiple sprites arranged in a grid |
| **Texture Atlas** | Optimized sprite sheet with arbitrary sprite positions (JSON metadata) |
| **Tween** | Smooth interpolation between two values over time |
| **Easing** | Function that controls the acceleration curve of a tween |
| **Particle System** | System for generating and managing many small sprites (effects) |
| **Object Pooling** | Reusing objects instead of creating/destroying them (performance) |
| **Draw Call** | Single GPU rendering command. Fewer is better for performance |
| **Batching** | Combining multiple draw calls into one for performance |
| **ECS** | Entity-Component-System architecture pattern |
| **FSM** | Finite State Machine for managing game/entity states |
| **AABB** | Axis-Aligned Bounding Box for collision detection |
| **SAT** | Separating Axis Theorem for convex polygon collision |
| **FBO** | Framebuffer Object for render-to-texture in WebGL |
| **Shader** | GPU program (vertex shader + fragment shader) |
| **GLSL** | OpenGL Shading Language, used to write WebGL shaders |
| **IK** | Inverse Kinematics, calculating joint angles for skeletal animation |
| **LOD** | Level of Detail, reducing complexity for distant objects |
| **Quad Tree** | Spatial partitioning structure for efficient collision checks |
| **DPR** | Device Pixel Ratio, ratio of physical to CSS pixels |

### Relationship Between Key Metrics

```
                    Impressions
                         │
                    ┌────▼────┐
                    │   CTR   │ = Clicks / Impressions
                    └────┬────┘
                         │
                      Clicks
                         │
                    ┌────▼────┐
                    │   CVR   │ = Installs / Clicks
                    └────┬────┘
                         │
                      Installs
                    ┌────▼────┐
                    │   CPI   │ = Ad Spend / Installs
                    └────┬────┘
                         │
                 Active Users (DAU)
                    ┌────▼────┐
                    │  ARPU   │ = Revenue / Users
                    └────┬────┘
                         │
                 Lifetime Revenue
                    ┌────▼────┐
                    │   LTV   │ = Total Revenue from User
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  ROAS   │ = LTV / CPI
                    └─────────┘

Profitable when: LTV > CPI
IPM = CTR × CVR × 1000
```

---

## Interview Questions & Answers

### Q1: What is a playable ad and why are they effective?

**Answer:**
A playable ad is an interactive advertisement that lets users experience a mini version of a game before installing it. They are typically 15-60 seconds long and end with a call-to-action (CTA) directing users to the app store.

They are effective because:
1. **Self-selection**: Users who enjoy the playable are more likely to enjoy the full game, leading to better retention (30-40% higher D7)
2. **Higher engagement**: Interactive content has 3-8x higher conversion than static ads
3. **Better quality users**: Users arrive with realistic expectations, reducing churn
4. **Lower CPI**: Higher IPM means each impression is more valuable, reducing effective CPI
5. **Fraud resistance**: Bot traffic struggles to simulate meaningful interaction

### Q2: Walk me through the lifecycle of a playable ad from creation to measurement.

**Answer:**

```
1. Creative Concept
   └── Identify core game mechanic to showcase
   └── Design 15-30 second experience arc:
       Hook (3s) → Tutorial (5s) → Gameplay (15s) → Fail/Win (3s) → CTA

2. Development
   └── Build as single HTML file (MRAID compliant)
   └── Inline all assets (base64 images, audio sprites)
   └── Implement touch controls
   └── Add analytics events (start, engage, complete, cta_click)
   └── Size optimization (target < 3MB)

3. QA & Testing
   └── Test on iOS Safari, Android Chrome, in-app webviews
   └── Test portrait and landscape orientations
   └── Test on low-end devices (< 2GB RAM)
   └── Verify MRAID compliance (open, close, expand)
   └── Verify CTA deep link or app store redirect

4. Deployment
   └── Upload to ad networks (Unity, AppLovin, Meta, etc.)
   └── Configure targeting (geo, demographic, device)
   └── Set up A/B test variants (if applicable)
   └── Set budget and bid strategy

5. Measurement & Iteration
   └── Monitor IPM, CTR, CPI, ROAS
   └── Compare against video ad baseline
   └── Analyze engagement funnel (start → complete → CTA)
   └── Identify drop-off points
   └── A/B test variations (difficulty, timing, CTA placement)
   └── Iterate on creative based on data
```

### Q3: How would you reduce a playable ad from 8MB to under 3MB?

**Answer:**

```javascript
// Step 1: Audit assets (usually the biggest wins)
// Images: Convert PNG → WebP, reduce dimensions, use tinypng.com
// Audio: Convert WAV → MP3/AAC, reduce bitrate (64kbps mono)
// Fonts: Subset to only used characters, or use system fonts

// Step 2: Replace images with procedural generation
function drawCloud(ctx, x, y, scale) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(x, y, 25 * scale, 0, Math.PI * 2);
  ctx.arc(x + 20 * scale, y - 10 * scale, 20 * scale, 0, Math.PI * 2);
  ctx.arc(x + 40 * scale, y, 25 * scale, 0, Math.PI * 2);
  ctx.fill();
  // 0 bytes instead of a cloud PNG
}

// Step 3: Use CSS for UI elements instead of images
// Buttons, panels, and simple shapes via CSS
// Gradients via CSS instead of gradient images

// Step 4: Optimize sprite sheets
// Remove duplicate frames
// Pack sprites tightly (TexturePacker)
// Use power-of-2 textures for GPU efficiency
// Reduce color depth if possible

// Step 5: Code optimization
// Tree-shake unused library code
// Use Terser/UglifyJS for minification
// Remove console.log and debug code
// Inline small functions

// Step 6: Compress the final bundle
// gzip/brotli (if network supports compressed delivery)
// Use data URIs only for small assets (< 10KB)
// For larger assets, consider progressive loading

// Step 7: Measure and verify
function getFileSize(htmlString) {
  const blob = new Blob([htmlString], { type: 'text/html' });
  const sizeMB = blob.size / (1024 * 1024);
  return sizeMB; // Must be < 3
}
```

### Q4: Explain the difference between MRAID 1.0, 2.0, and 3.0.

**Answer:**

| Feature | MRAID 1.0 | MRAID 2.0 | MRAID 3.0 |
|---------|-----------|-----------|-----------|
| **Basic operations** | open, close, expand | + resize, storePicture | + all MRAID 2.0 |
| **Two-part creative** | No | Yes | Yes |
| **Viewability** | No | isViewable() | Exposure change events |
| **Audio** | No | No | Volume control |
| **Location** | No | getLocation() | Enhanced |
| **Video** | No | createCalendarEvent, playVideo | Enhanced |
| **Unload** | No | No | unload() for cleanup |
| **Resize** | expand() only | resize() + expand() | Same |

```javascript
// MRAID integration example
function initMRAID() {
  if (typeof mraid === 'undefined') {
    // Not in MRAID environment, handle gracefully
    startGame();
    return;
  }

  function onReady() {
    if (mraid.isViewable()) {
      startGame();
    } else {
      mraid.addEventListener('viewableChange', (viewable) => {
        if (viewable) {
          mraid.removeEventListener('viewableChange', arguments.callee);
          startGame();
        }
      });
    }
  }

  if (mraid.getState() === 'loading') {
    mraid.addEventListener('ready', onReady);
  } else {
    onReady();
  }
}

// CTA implementation
function onCTAClick() {
  const storeURL = 'https://play.google.com/store/apps/details?id=com.example.game';
  if (typeof mraid !== 'undefined') {
    mraid.open(storeURL);
  } else {
    window.open(storeURL, '_blank');
  }
}
```

### Q5: How do you ensure a playable ad runs well on low-end devices?

**Answer:**

```javascript
// 1. Detect device capabilities
function getDeviceTier() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');

  const tier = {
    memory: navigator.deviceMemory || 2, // GB
    cores: navigator.hardwareConcurrency || 2,
    gpu: gl ? gl.getParameter(gl.RENDERER) : 'unknown',
    dpr: Math.min(window.devicePixelRatio, 2),
    isLowEnd: false
  };

  tier.isLowEnd = tier.memory <= 2 || tier.cores <= 2;
  return tier;
}

// 2. Scale quality based on device
function configureQuality(tier) {
  if (tier.isLowEnd) {
    return {
      maxParticles: 20,
      renderScale: 0.75,  // Render at 75% resolution
      enableShadows: false,
      maxFPS: 30,
      useSimpleShaders: true,
      reducedAnimations: true
    };
  }
  return {
    maxParticles: 100,
    renderScale: 1.0,
    enableShadows: true,
    maxFPS: 60,
    useSimpleShaders: false,
    reducedAnimations: false
  };
}

// 3. Object pooling to avoid GC pauses
class ObjectPool {
  constructor(factory, reset, initialSize = 20) {
    this.factory = factory;
    this.reset = reset;
    this.pool = Array.from({ length: initialSize }, () => factory());
  }

  acquire() {
    const obj = this.pool.length > 0 ? this.pool.pop() : this.factory();
    return this.reset(obj);
  }

  release(obj) {
    this.pool.push(obj);
  }
}

// 4. Adaptive frame rate
class AdaptiveLoop {
  constructor() {
    this.targetFPS = 60;
    this.frameTimes = [];
    this.adaptTimer = 0;
  }

  checkPerformance(deltaTime) {
    this.frameTimes.push(deltaTime);
    this.adaptTimer += deltaTime;

    if (this.adaptTimer > 2) { // Check every 2 seconds
      const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0)
                          / this.frameTimes.length;
      const avgFPS = 1 / avgFrameTime;

      if (avgFPS < this.targetFPS * 0.8) {
        this.reduceQuality();
      }

      this.frameTimes = [];
      this.adaptTimer = 0;
    }
  }

  reduceQuality() {
    // Progressive quality reduction
    // 1. Reduce particles
    // 2. Lower render resolution
    // 3. Disable effects
    // 4. Simplify physics
  }
}

// 5. Minimize garbage collection
// Pre-allocate vectors
const tempVec = { x: 0, y: 0 };

function getDirection(from, to) {
  // Reuse object instead of creating new one
  tempVec.x = to.x - from.x;
  tempVec.y = to.y - from.y;
  const len = Math.sqrt(tempVec.x * tempVec.x + tempVec.y * tempVec.y);
  if (len > 0) {
    tempVec.x /= len;
    tempVec.y /= len;
  }
  return tempVec;
}
```

### Q6: What metrics would you track in a playable ad, and how?

**Answer:**

```javascript
// Analytics events to track
const AnalyticsEvents = {
  // Lifecycle events
  AD_LOADED: 'ad_loaded',           // Playable finished loading
  AD_STARTED: 'ad_started',         // User first interaction
  AD_COMPLETED: 'ad_completed',     // User reached end screen

  // Engagement events
  TUTORIAL_COMPLETE: 'tutorial_complete',
  LEVEL_START: 'level_start',
  LEVEL_COMPLETE: 'level_complete',
  LEVEL_FAIL: 'level_fail',

  // Interaction events
  FIRST_TOUCH: 'first_touch',
  CTA_SHOWN: 'cta_shown',
  CTA_CLICKED: 'cta_clicked',

  // Quality events
  FPS_DROP: 'fps_drop',             // Performance issues
  ERROR: 'error'                    // JavaScript errors
};

class PlayableAnalytics {
  constructor() {
    this.events = [];
    this.startTime = Date.now();
    this.sessionId = this.generateId();
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  track(eventName, data = {}) {
    const event = {
      ...data,
      event: eventName,
      timestamp: Date.now() - this.startTime,
      sessionId: this.sessionId
    };

    this.events = [...this.events, event];

    // Send to ad network if available
    if (typeof mraid !== 'undefined' && mraid.sendAnalytics) {
      mraid.sendAnalytics(event);
    }

    // Also send to own analytics endpoint
    this.sendBeacon(event);
  }

  sendBeacon(event) {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/analytics', JSON.stringify(event));
      }
    } catch (e) {
      // Silently fail - analytics should never break the game
    }
  }

  getEngagementMetrics() {
    return {
      totalTime: Date.now() - this.startTime,
      eventCount: this.events.length,
      reachedCTA: this.events.some(e => e.event === 'cta_shown'),
      clickedCTA: this.events.some(e => e.event === 'cta_clicked'),
      completionRate: this.calculateCompletionRate()
    };
  }

  calculateCompletionRate() {
    const started = this.events.some(e => e.event === 'ad_started');
    const completed = this.events.some(e => e.event === 'ad_completed');
    if (!started) return 0;
    return completed ? 1 : 0;
  }
}
```

### Q7: Compare Canvas 2D vs WebGL for playable ads. When would you use each?

**Answer:**

| Factor | Canvas 2D | WebGL |
|--------|-----------|-------|
| **Setup complexity** | Very simple | Complex (shaders, buffers) |
| **Bundle size** | Minimal | Larger (library needed) |
| **Draw calls** | Each draw is a call | Can batch thousands |
| **Sprite count** | Good up to ~200 | Good up to ~10,000+ |
| **Effects** | Limited (composite ops) | Unlimited (shaders) |
| **Text rendering** | Built-in | Requires SDF/bitmap fonts |
| **Learning curve** | Low | High |
| **Device support** | Universal | 97%+ (WebGL 1.0) |
| **Best for** | Simple 2D games | Complex 2D / any 3D |

**Use Canvas 2D when:**
- Game has < 200 sprites
- Simple visual effects needed
- File size is critical (no rendering library)
- Development time is very short
- Target includes very old devices

**Use WebGL (via PixiJS/Phaser) when:**
- Many sprites or particles
- Complex visual effects (shaders, filters)
- Smooth animations at scale
- 3D elements needed
- Performance is critical

---

## Final Tips

1. **Always prototype first**: Get the core mechanic working before polishing
2. **Think mobile-first**: Touch input, small screens, low memory
3. **Know your metrics**: Be able to discuss CPI, IPM, ROAS intelligently
4. **Practice under constraints**: Build games with size limits and time limits
5. **Study successful playable ads**: Install popular games and note the playable ads you see
6. **Build a portfolio**: Have 3-5 playable ads ready to show
7. **Stay current**: Follow industry blogs (PocketGamer, GameAnalytics, Singular)
8. **Network**: Join game dev communities and attend GDC/Casual Connect talks
