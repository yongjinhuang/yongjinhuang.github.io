# Playable Ad Architecture

## Table of Contents

1. [What Is a Playable Ad?](#what-is-a-playable-ad)
2. [Ad Network Requirements](#ad-network-requirements)
3. [MRAID Specification](#mraid-specification)
4. [DAPI (IronSource)](#dapi-ironsource)
5. [Single-File Architecture](#single-file-architecture)
6. [Build Pipeline](#build-pipeline)
7. [Project Structure](#project-structure)
8. [Playable Ad Lifecycle](#playable-ad-lifecycle)
9. [Asset Strategy](#asset-strategy)
10. [Cross-Network Compatibility](#cross-network-compatibility)
11. [Debugging and Testing](#debugging-and-testing)
12. [Performance Optimization](#performance-optimization)
13. [Interview Questions](#interview-questions)

---

## What Is a Playable Ad?

A playable ad is an interactive mini-game served as an ad creative. It runs entirely in a WebView within a mobile app (e.g., inside another game or app that shows ads). The user plays a simplified version of the game for 15-30 seconds, then sees a call-to-action (CTA) button that leads to the app store.

### Key Characteristics

- **Self-contained**: Everything (HTML, CSS, JavaScript, images, audio) must be in a single file or small package
- **Tiny file size**: 2-5 MB total depending on the ad network
- **No external requests**: Cannot load assets from CDNs or APIs (all assets inlined as base64)
- **Short experience**: 15-30 seconds of gameplay followed by a CTA
- **Runs in a WebView**: Not a full browser -- limited API support, varied performance
- **Must work everywhere**: iOS and Android, old and new devices, portrait and landscape

### Why Playable Ads Exist

```
Traditional ad funnel:
  Video Ad → User watches → Maybe clicks → App Store → Maybe installs
  Conversion rate: 1-3%

Playable ad funnel:
  Playable Ad → User PLAYS the game → Clicks CTA → App Store → Installs
  Conversion rate: 3-8% (2-4x improvement)

Users who install after playing:
  - Know what the game is like
  - Higher Day 1 retention
  - Higher LTV (lifetime value)
  - Lower uninstall rate
```

### Playable Ad vs. Mini-Game vs. Full Game

| Aspect       | Playable Ad                | Mini-Game        | Full Game          |
| ------------ | -------------------------- | ---------------- | ------------------ |
| Size         | 2-5 MB                     | 10-50 MB         | 50-500 MB          |
| Duration     | 15-30 sec                  | 2-10 min         | Unlimited          |
| Goal         | Drive installs             | Engagement       | Retention          |
| Assets       | Heavily compressed, base64 | Moderate quality | Full quality       |
| Audio        | Often none                 | Basic            | Full soundtrack    |
| Complexity   | Minimal mechanics          | Few mechanics    | Many mechanics     |
| Monetization | Ad revenue (for host app)  | In-app/ads       | In-app/ads/premium |

---

## Ad Network Requirements

### Comparison Table

| Network           | Format      | Max Size | SDK                 | Key Constraints                                            |
| ----------------- | ----------- | -------- | ------------------- | ---------------------------------------------------------- |
| **Facebook/Meta** | Single HTML | 5 MB     | None (FBIG)         | No external requests, no `eval()`, no `document.write()`   |
| **Google Ads**    | Single HTML | 5 MB     | MRAID 2.0           | No external requests, must include `<meta name="ad.size">` |
| **Unity Ads**     | Single HTML | 5 MB     | mraid.js (injected) | SDK injected at runtime, cannot bundle own mraid.js        |
| **IronSource**    | Single HTML | 5 MB     | dapi.js             | Must integrate dapi.js SDK, respect audio volume           |
| **AppLovin**      | ZIP archive | 5 MB     | MRAID               | Can have multiple files in ZIP, index.html entry point     |
| **TikTok**        | Single HTML | **2 MB** | None                | Strictest size limit, no external requests                 |
| **Vungle**        | ZIP archive | 5 MB     | MRAID/Vungle API    | ZIP with index.html, supports separate asset files         |
| **Mintegral**     | Single HTML | 5 MB     | MRAID               | Standard MRAID integration                                 |
| **AdColony**      | ZIP archive | 5 MB     | MRAID               | ZIP format, Aurora Playables SDK                           |

### Facebook/Meta (Instant Games Playable Ads)

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0,
    maximum-scale=1.0, user-scalable=no"
    />
    <style>
      /* All CSS inlined here */
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      canvas {
        display: block;
      }
      #cta-button {
        position: absolute;
        bottom: 20%;
        left: 50%;
        transform: translateX(-50%);
        padding: 16px 48px;
        font-size: 24px;
        font-weight: bold;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        display: none;
        z-index: 100;
      }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <button id="cta-button">INSTALL NOW</button>
    <script>
      // Facebook Playable Ads API
      // FbPlayableAd is injected by the Facebook SDK

      // Initialize when the ad is loaded
      var FbPlayableAd = FbPlayableAd || {};

      FbPlayableAd.onCTAClick = function () {
        // Called when user taps the CTA
        // Facebook handles the redirect to app store
      };

      // CTA button handler
      document
        .getElementById('cta-button')
        .addEventListener('click', function () {
          if (FbPlayableAd && FbPlayableAd.onCTAClick) {
            FbPlayableAd.onCTAClick();
          }
        });

      // All game code inlined here...
    </script>
  </body>
</html>
```

### Google Ads

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="ad.size" content="width=320,height=480" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://tpc.googlesyndication.com/nicfb/niclib.js"></script>
    <style>
      /* Inlined CSS */
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script>
      // Google requires MRAID or Enabler
      // CTA: opens the configured exit URL
      function handleCTA() {
        // For MRAID
        if (typeof mraid !== 'undefined') {
          mraid.open(
            'https://play.google.com/store/apps/details?id=com.example'
          );
        }
        // For Enabler (Google Web Designer)
        else if (typeof Enabler !== 'undefined') {
          Enabler.exit('CTA');
        }
      }

      // Game code...
    </script>
  </body>
</html>
```

### Unity Ads

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0,
    maximum-scale=1.0, user-scalable=no"
    />
    <!-- DO NOT include mraid.js -- Unity injects it -->
    <style>
      /* Inlined */
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script>
      // Unity Ads injects mraid.js into the WebView
      // Wait for MRAID to be ready

      function onMRAIDReady() {
        // Check if viewable
        if (mraid.isViewable()) {
          startGame();
        } else {
          mraid.addEventListener('viewableChange', function (viewable) {
            if (viewable) {
              startGame();
            }
          });
        }
      }

      if (typeof mraid !== 'undefined') {
        if (mraid.getState() === 'loading') {
          mraid.addEventListener('ready', onMRAIDReady);
        } else {
          onMRAIDReady();
        }
      } else {
        // Fallback: start without MRAID (for testing in browser)
        startGame();
      }

      function handleCTA() {
        if (typeof mraid !== 'undefined') {
          mraid.open(
            'https://play.google.com/store/apps/details?id=com.example'
          );
        }
      }

      function startGame() {
        // Initialize and start the game
      }
    </script>
  </body>
</html>
```

### IronSource (DAPI)

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://imasdk.googleapis.com/nicfb/niclib.js"></script>
    <style>
      /* Inlined */
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script>
      // IronSource DAPI integration
      (function () {
        var gameStarted = false;

        function init() {
          if (typeof dapi !== 'undefined') {
            dapi.addEventListener('ready', onDapiReady);
            dapi.addEventListener('viewableChange', onViewableChange);
            dapi.addEventListener('adResized', onAdResized);
            dapi.addEventListener('audioVolumeChange', onAudioVolumeChange);
          } else {
            // Testing fallback
            startGame();
          }
        }

        function onDapiReady() {
          if (dapi.isViewable()) {
            startGame();
          }
        }

        function onViewableChange(event) {
          if (event.isViewable) {
            if (!gameStarted) {
              startGame();
            } else {
              resumeGame();
            }
          } else {
            pauseGame();
          }
        }

        function onAdResized(event) {
          var screenSize = dapi.getScreenSize();
          resizeGame(screenSize.width, screenSize.height);
        }

        function onAudioVolumeChange(volume) {
          setGameVolume(volume);
        }

        function startGame() {
          gameStarted = true;
          var screenSize =
            typeof dapi !== 'undefined'
              ? dapi.getScreenSize()
              : { width: window.innerWidth, height: window.innerHeight };

          var audioVolume =
            typeof dapi !== 'undefined' ? dapi.getAudioVolume() : 0;

          initGame(screenSize.width, screenSize.height, audioVolume);
        }

        function handleCTA() {
          if (typeof dapi !== 'undefined') {
            dapi.openStoreUrl();
          }
        }

        // Expose CTA handler
        window.handleCTA = handleCTA;

        // Initialize
        init();
      })();
    </script>
  </body>
</html>
```

---

## MRAID Specification

MRAID (Mobile Rich Media Ad Interface Definitions) is the IAB standard for interactive mobile ads. It provides a JavaScript API that ad creatives use to communicate with the ad container (SDK).

### Core API

```typescript
// Type declarations for MRAID
declare namespace mraid {
  // State management
  function getState():
    | 'loading'
    | 'default'
    | 'expanded'
    | 'resized'
    | 'hidden';
  function isViewable(): boolean;

  // Navigation
  function open(url: string): void; // Open URL (CTA action)
  function close(): void; // Close the ad

  // Size and position
  function getScreenSize(): { width: number; height: number };
  function getCurrentPosition(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  function getMaxSize(): { width: number; height: number };
  function getDefaultPosition(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Expansion
  function expand(url?: string): void;
  function resize(): void;
  function setExpandProperties(props: {
    width: number;
    height: number;
    useCustomClose?: boolean;
    isModal?: boolean;
  }): void;

  // Events
  function addEventListener(
    event: 'ready' | 'stateChange' | 'viewableChange' | 'sizeChange' | 'error',
    callback: Function
  ): void;
  function removeEventListener(event: string, callback: Function): void;

  // Utility
  function getVersion(): string;
  function supports(feature: string): boolean;
  function useCustomClose(value: boolean): void;
}
```

### MRAID Event Flow

```
1. WebView loads HTML
2. Ad SDK injects mraid.js
3. mraid.getState() === 'loading'
4. Event: 'ready' fires
5. mraid.getState() === 'default'
6. Check mraid.isViewable()
   - If true → start game
   - If false → wait for 'viewableChange'
7. Event: 'viewableChange' (true) → start game
8. User plays game
9. User taps CTA → mraid.open(storeUrl)
10. Event: 'viewableChange' (false) → pause game
```

### MRAID Integration Pattern

```typescript
type MRAIDState = 'loading' | 'default' | 'expanded' | 'resized' | 'hidden';

interface MRAIDIntegration {
  isReady: boolean;
  isViewable: boolean;
  state: MRAIDState;
}

function createMRAIDIntegration(
  onReady: () => void,
  onViewable: () => void,
  onHidden: () => void,
  onResize: (width: number, height: number) => void
): MRAIDIntegration {
  const integration: MRAIDIntegration = {
    isReady: false,
    isViewable: false,
    state: 'loading',
  };

  if (typeof mraid === 'undefined') {
    // Not in an ad container; start immediately (development mode)
    integration.isReady = true;
    integration.isViewable = true;
    integration.state = 'default';
    setTimeout(onReady, 0);
    setTimeout(onViewable, 0);
    return integration;
  }

  function handleReady(): void {
    integration.isReady = true;
    integration.state = mraid.getState();
    onReady();

    if (mraid.isViewable()) {
      integration.isViewable = true;
      onViewable();
    }
  }

  function handleViewableChange(viewable: boolean): void {
    integration.isViewable = viewable;
    if (viewable) {
      onViewable();
    } else {
      onHidden();
    }
  }

  function handleStateChange(state: MRAIDState): void {
    integration.state = state;
  }

  function handleSizeChange(width: number, height: number): void {
    onResize(width, height);
  }

  mraid.addEventListener('ready', handleReady);
  mraid.addEventListener('viewableChange', handleViewableChange);
  mraid.addEventListener('stateChange', handleStateChange);
  mraid.addEventListener('sizeChange', handleSizeChange);

  // Check if already ready
  if (mraid.getState() !== 'loading') {
    handleReady();
  }

  return integration;
}

// CTA helper
function openStore(url: string): void {
  if (typeof mraid !== 'undefined') {
    mraid.open(url);
  } else if (typeof dapi !== 'undefined') {
    dapi.openStoreUrl();
  } else {
    window.open(url, '_blank');
  }
}
```

---

## DAPI (IronSource)

DAPI (Display API) is IronSource's SDK for playable ads. It provides screen size, audio volume, and store URL handling.

### Core API

```typescript
declare namespace dapi {
  function isReady(): boolean;
  function getScreenSize(): { width: number; height: number };
  function getAudioVolume(): number; // 0 to 1
  function openStoreUrl(): void;

  function addEventListener(
    event: 'ready' | 'viewableChange' | 'adResized' | 'audioVolumeChange',
    callback: Function
  ): void;
  function removeEventListener(event: string, callback: Function): void;
}
```

### DAPI vs MRAID

| Feature      | MRAID                  | DAPI                         |
| ------------ | ---------------------- | ---------------------------- |
| Standard     | IAB standard           | IronSource proprietary       |
| Audio volume | Not provided           | `getAudioVolume()`           |
| Store URL    | `mraid.open(url)`      | `dapi.openStoreUrl()` (auto) |
| Screen size  | `getScreenSize()`      | `getScreenSize()`            |
| Viewability  | `isViewable()` + event | `isViewable` via event       |
| Resize event | `sizeChange`           | `adResized`                  |
| Adoption     | Most networks          | IronSource only              |

### Universal SDK Wrapper

```typescript
interface AdSDK {
  isReady(): boolean;
  getScreenSize(): { width: number; height: number };
  getAudioVolume(): number;
  openStore(): void;
  onReady(callback: () => void): void;
  onViewableChange(callback: (viewable: boolean) => void): void;
  onResize(callback: (width: number, height: number) => void): void;
  onAudioChange(callback: (volume: number) => void): void;
}

function createAdSDK(): AdSDK {
  const hasMRAID = typeof mraid !== 'undefined';
  const hasDAPI = typeof dapi !== 'undefined';

  return {
    isReady(): boolean {
      if (hasDAPI) return dapi.isReady();
      if (hasMRAID) return mraid.getState() !== 'loading';
      return true;
    },

    getScreenSize(): { width: number; height: number } {
      if (hasDAPI) return dapi.getScreenSize();
      if (hasMRAID) return mraid.getScreenSize();
      return { width: window.innerWidth, height: window.innerHeight };
    },

    getAudioVolume(): number {
      if (hasDAPI) return dapi.getAudioVolume();
      return 0; // Default muted for other networks
    },

    openStore(): void {
      if (hasDAPI) {
        dapi.openStoreUrl();
      } else if (hasMRAID) {
        mraid.open(STORE_URL);
      } else {
        window.open(STORE_URL, '_blank');
      }
    },

    onReady(callback: () => void): void {
      if (hasDAPI) {
        dapi.addEventListener('ready', callback);
      } else if (hasMRAID) {
        if (mraid.getState() !== 'loading') {
          callback();
        } else {
          mraid.addEventListener('ready', callback);
        }
      } else {
        setTimeout(callback, 0);
      }
    },

    onViewableChange(callback: (viewable: boolean) => void): void {
      if (hasDAPI) {
        dapi.addEventListener('viewableChange', (e: any) => {
          callback(e.isViewable);
        });
      } else if (hasMRAID) {
        mraid.addEventListener('viewableChange', callback);
      }
    },

    onResize(callback: (width: number, height: number) => void): void {
      if (hasDAPI) {
        dapi.addEventListener('adResized', () => {
          const size = dapi.getScreenSize();
          callback(size.width, size.height);
        });
      } else if (hasMRAID) {
        mraid.addEventListener('sizeChange', callback);
      } else {
        window.addEventListener('resize', () => {
          callback(window.innerWidth, window.innerHeight);
        });
      }
    },

    onAudioChange(callback: (volume: number) => void): void {
      if (hasDAPI) {
        dapi.addEventListener('audioVolumeChange', callback);
      }
      // MRAID doesn't provide audio volume events
    },
  };
}

const STORE_URL =
  'https://play.google.com/store/apps/details?id=com.example.game';
```

---

## Single-File Architecture

Most ad networks require a single HTML file with everything inlined. This is the most important architectural constraint.

### What Gets Inlined

```
Single HTML file contains:
├── <!DOCTYPE html>
├── <head>
│   ├── <meta> tags (viewport, charset)
│   └── <style> (all CSS inlined)
├── <body>
│   ├── <canvas> (game viewport)
│   ├── HTML UI elements (CTA button, overlays)
│   └── <script>
│       ├── SDK integration code (MRAID/DAPI)
│       ├── Game engine code (rendering, input, audio)
│       ├── Game logic (levels, mechanics, AI)
│       ├── Asset data (base64 encoded)
│       │   ├── Images: data:image/png;base64,...
│       │   ├── Audio: data:audio/mp3;base64,...
│       │   ├── Spine/skeletal animation JSON
│       │   └── Level data JSON
│       └── UI code (tutorial, end card, CTA)
```

### Inlining Images as Base64

```typescript
// During build: convert image files to base64 data URIs
// file: assets/player.png (5KB) → data:image/png;base64,iVBOR...

// In the bundled HTML, images are embedded as strings:
const ASSETS = {
  player: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  enemy: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  background: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
  spriteSheet: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
};

// Loading base64 images
function loadImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUri;
  });
}

// Preload all assets
async function preloadAssets(): Promise<Map<string, HTMLImageElement>> {
  const loaded = new Map<string, HTMLImageElement>();
  const entries = Object.entries(ASSETS);

  await Promise.all(
    entries.map(async ([name, dataUri]) => {
      const img = await loadImage(dataUri);
      loaded.set(name, img);
    })
  );

  return loaded;
}
```

### Inlining Audio as Base64

```typescript
const AUDIO_ASSETS = {
  bgm: 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAP...',
  sfxSprite: 'data:audio/mp3;base64,//uQxAAAAAANIAAAAAExB...',
};

async function loadAudioFromBase64(
  context: AudioContext,
  base64DataUri: string
): Promise<AudioBuffer> {
  // Extract the base64 data after the comma
  const base64 = base64DataUri.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return context.decodeAudioData(bytes.buffer);
}
```

### Inlining Spine Animations

```typescript
// Spine skeletal animation data (JSON + atlas) inlined as objects
const SPINE_DATA = {
  character: {
    skeleton: {
      /* spine skeleton JSON */
    },
    atlas: `
      character.png
      size: 512,512
      format: RGBA8888
      filter: Linear,Linear
      repeat: none
      head
        rotate: false
        xy: 2, 2
        size: 64, 64
        orig: 64, 64
        offset: 0, 0
        index: -1
    `,
    texture: 'data:image/png;base64,iVBOR...',
  },
};
```

---

## Build Pipeline

### Overview

```
Source Files                    Build Steps                        Output
─────────────                  ───────────                        ──────
src/
├── game.ts          ──→  1. TypeScript compile        ──→
├── engine.ts        ──→  2. Bundle (webpack/rollup)   ──→  index.html
├── ui.ts            ──→  3. Inline assets (base64)    ──→  (single file,
assets/              ──→  4. Inline CSS                ──→   < 5MB)
├── sprites/*.png    ──→  5. Minify + tree-shake       ──→
├── audio/*.mp3      ──→  6. Compress (terser)         ──→
├── spine/*.json     ──→  7. Validate size             ──→
index.html (template)──→  8. Generate per-network      ──→
```

### Webpack Configuration for Playable Ads

```javascript
// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const HTMLInlineCSSWebpackPlugin =
  require('html-inline-css-webpack-plugin').default;
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = (env) => {
  const network = env.network || 'mraid'; // mraid, dapi, facebook, google

  return {
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'game.js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          // Inline images as base64
          test: /\.(png|jpg|jpeg|gif|webp|svg)$/,
          type: 'asset/inline',
        },
        {
          // Inline audio as base64
          test: /\.(mp3|ogg|wav|webm)$/,
          type: 'asset/inline',
        },
        {
          // Inline JSON
          test: /\.json$/,
          type: 'json',
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        // Switch SDK integration based on target network
        '@sdk': path.resolve(__dirname, `src/sdk/${network}.ts`),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: `./src/templates/${network}.html`,
        inject: 'body',
        minify: {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          minifyCSS: true,
          minifyJS: false, // Terser handles JS
        },
      }),
      new HtmlInlineScriptPlugin(), // Inlines <script> tags
      new HTMLInlineCSSWebpackPlugin(), // Inlines <style> tags
    ],
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // Remove console.log
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug'],
              passes: 2,
            },
            mangle: {
              properties: false, // Don't mangle property names
            },
            output: {
              comments: false,
            },
          },
        }),
        new CssMinimizerPlugin(),
      ],
    },
    performance: {
      maxAssetSize: 5 * 1024 * 1024, // 5MB warning
      maxEntrypointSize: 5 * 1024 * 1024,
      hints: 'error', // Fail build if over 5MB
    },
  };
};
```

### Build Scripts

```json
{
  "scripts": {
    "dev": "webpack serve --mode development",
    "build:mraid": "webpack --mode production --env network=mraid",
    "build:dapi": "webpack --mode production --env network=dapi",
    "build:facebook": "webpack --mode production --env network=facebook",
    "build:google": "webpack --mode production --env network=google",
    "build:tiktok": "webpack --mode production --env network=tiktok",
    "build:all": "npm run build:mraid && npm run build:dapi && npm run build:facebook && npm run build:google && npm run build:tiktok",
    "validate": "node scripts/validate-size.js",
    "build:validate": "npm run build:all && npm run validate"
  }
}
```

### Size Validation Script

```javascript
// scripts/validate-size.js
const fs = require('fs');
const path = require('path');

const LIMITS = {
  mraid: 5 * 1024 * 1024,
  dapi: 5 * 1024 * 1024,
  facebook: 5 * 1024 * 1024,
  google: 5 * 1024 * 1024,
  tiktok: 2 * 1024 * 1024, // TikTok has stricter limit
};

const distDir = path.resolve(__dirname, '..', 'dist');
const files = fs.readdirSync(distDir);
let hasError = false;

files.forEach((file) => {
  if (!file.endsWith('.html')) return;

  const network = file.replace('.html', '').replace('index-', '');
  const filePath = path.join(distDir, file);
  const stats = fs.statSync(filePath);
  const limit = LIMITS[network] || 5 * 1024 * 1024;
  const sizeKB = (stats.size / 1024).toFixed(1);
  const limitKB = (limit / 1024).toFixed(0);
  const percent = ((stats.size / limit) * 100).toFixed(1);

  if (stats.size > limit) {
    console.error(
      `FAIL: ${file} is ${sizeKB}KB (limit: ${limitKB}KB, ${percent}%)`
    );
    hasError = true;
  } else {
    console.log(
      `PASS: ${file} is ${sizeKB}KB (limit: ${limitKB}KB, ${percent}%)`
    );
  }
});

if (hasError) {
  process.exit(1);
}
```

---

## Project Structure

```
playable-ad/
├── src/
│   ├── index.ts              # Entry point
│   ├── game.ts               # Main game class
│   ├── config.ts             # Game configuration
│   │
│   ├── engine/
│   │   ├── renderer.ts       # Canvas rendering
│   │   ├── input.ts          # Touch/mouse input
│   │   ├── audio.ts          # Web Audio (procedural SFX)
│   │   ├── loop.ts           # Game loop (requestAnimationFrame)
│   │   ├── tween.ts          # Simple tweening
│   │   └── math.ts           # Vector math, random, easing
│   │
│   ├── sdk/
│   │   ├── mraid.ts          # MRAID integration
│   │   ├── dapi.ts           # IronSource DAPI integration
│   │   ├── facebook.ts       # Facebook playable integration
│   │   ├── google.ts         # Google Ads integration
│   │   └── interface.ts      # Common SDK interface
│   │
│   ├── game/
│   │   ├── states/
│   │   │   ├── preload.ts    # Asset preloading state
│   │   │   ├── tutorial.ts   # Tutorial/intro state
│   │   │   ├── play.ts       # Main gameplay state
│   │   │   └── endcard.ts    # End card with CTA
│   │   ├── entities/
│   │   │   ├── player.ts
│   │   │   ├── enemy.ts
│   │   │   └── collectible.ts
│   │   └── systems/
│   │       ├── physics.ts
│   │       ├── collision.ts
│   │       └── spawner.ts
│   │
│   ├── ui/
│   │   ├── tutorial-hand.ts  # Animated tutorial hand
│   │   ├── cta-button.ts     # CTA button component
│   │   ├── progress-bar.ts   # Level progress indicator
│   │   └── endcard.ts        # End card layout
│   │
│   └── templates/
│       ├── mraid.html        # HTML template for MRAID networks
│       ├── dapi.html          # HTML template for IronSource
│       ├── facebook.html      # HTML template for Facebook
│       ├── google.html        # HTML template for Google
│       └── tiktok.html        # HTML template for TikTok
│
├── assets/
│   ├── sprites/              # PNG sprite sheets (will be base64'd)
│   ├── audio/                # MP3 files (if any)
│   └── spine/                # Spine animation data
│
├── scripts/
│   ├── validate-size.js      # Size validation
│   ├── texture-pack.js       # Sprite sheet generator
│   └── image-optimize.js     # Image compression
│
├── webpack.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## Playable Ad Lifecycle

### Complete Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLAYABLE AD LIFECYCLE                       │
├──────────┬──────────┬──────────────┬──────────┬─────────────────┤
│ SDK Load │ Preload  │  Tutorial    │ Gameplay │    End Card     │
│  0-1s    │  0-2s    │   0-3s       │ 3-25s    │    25-30s       │
│          │          │              │          │                 │
│ mraid.js │ Decode   │ Animated     │ Core     │ CTA button      │
│ injected │ base64   │ hand shows   │ game     │ App screenshots │
│          │ images   │ how to play  │ loop     │ "Install Now"   │
│ Wait for │          │              │          │                 │
│ 'ready'  │ Init     │ Auto-skip    │ Timer    │ mraid.open()   │
│ event    │ audio    │ after 3s     │ or lives │ on tap          │
│          │ context  │ or on tap    │          │                 │
│ Check    │          │              │ Ramp     │ Show on:        │
│ viewable │ Build    │ No text      │ difficulty│ - Timer end    │
│          │ audio    │ (universal)  │          │ - Lives gone   │
│          │ graph    │              │ Juicy    │ - Level done   │
│          │          │              │ feedback │                 │
└──────────┴──────────┴──────────────┴──────────┴─────────────────┘
```

### Implementation

```typescript
type PlayableState = 'loading' | 'preload' | 'tutorial' | 'playing' | 'endcard';

class PlayableAd {
  private state: PlayableState = 'loading';
  private sdk: AdSDK;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private assets: Map<string, HTMLImageElement> = new Map();
  private gameTimer: number = 0;
  private maxGameTime: number = 25; // seconds
  private tutorialTimer: number = 0;
  private tutorialDuration: number = 3; // seconds
  private ctaShown: boolean = false;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.sdk = createAdSDK();

    this.sdk.onReady(() => this.onSDKReady());
    this.sdk.onViewableChange((viewable) => {
      if (viewable && this.state === 'loading') {
        this.startPreload();
      } else if (!viewable) {
        this.pause();
      }
    });
    this.sdk.onResize((w, h) => this.resize(w, h));
  }

  private onSDKReady(): void {
    this.resize(
      this.sdk.getScreenSize().width,
      this.sdk.getScreenSize().height
    );
    this.startPreload();
  }

  private async startPreload(): Promise<void> {
    this.state = 'preload';
    this.assets = await preloadAssets();
    this.startTutorial();
  }

  private startTutorial(): void {
    this.state = 'tutorial';
    this.tutorialTimer = 0;
    // Show animated hand indicating how to play
    // Skip on tap or after tutorialDuration seconds
  }

  private startGameplay(): void {
    this.state = 'playing';
    this.gameTimer = 0;
    this.initGameObjects();
    this.startGameLoop();
  }

  private showEndCard(): void {
    if (this.ctaShown) return;
    this.ctaShown = true;
    this.state = 'endcard';

    // Show CTA button
    const ctaButton = document.getElementById('cta-button');
    if (ctaButton) {
      ctaButton.style.display = 'block';
      ctaButton.addEventListener('click', () => {
        this.sdk.openStore();
      });
    }

    // Animate end card elements
    this.animateEndCard();
  }

  private update(dt: number): void {
    switch (this.state) {
      case 'tutorial':
        this.tutorialTimer += dt;
        this.updateTutorial(dt);
        if (this.tutorialTimer >= this.tutorialDuration) {
          this.startGameplay();
        }
        break;

      case 'playing':
        this.gameTimer += dt;
        this.updateGameplay(dt);
        if (this.gameTimer >= this.maxGameTime) {
          this.showEndCard();
        }
        break;

      case 'endcard':
        this.updateEndCard(dt);
        break;
    }
  }

  private resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    // Recalculate game scaling
  }

  private pause(): void {
    // Pause game loop
  }

  // Placeholder methods
  private initGameObjects(): void {}
  private startGameLoop(): void {}
  private updateTutorial(_dt: number): void {}
  private updateGameplay(_dt: number): void {}
  private updateEndCard(_dt: number): void {}
  private animateEndCard(): void {}
}
```

---

## Asset Strategy

### Image Optimization for Size Budget

```
Size budget breakdown (5MB total):
─────────────────────────────────
JavaScript (minified):     150-300 KB
HTML + CSS:                 10-20 KB
Images (base64):         2,500-4,000 KB
Audio (base64):              0-300 KB
Spine/Animation data:      200-800 KB
─────────────────────────────────
Base64 overhead:           ~33% increase

So if your images total 3MB as files,
they become ~4MB when base64 encoded.
Actual image file budget: ~2.5-3MB
```

### Image Optimization Techniques

```typescript
// 1. Use texture atlases (sprite sheets)
//    - One 1024x1024 atlas instead of 20 individual images
//    - Single base64 string, less overhead

// 2. Use tinypng/pngquant for lossy PNG compression
//    - 50-80% size reduction with minimal quality loss

// 3. Use JPEG for backgrounds (smaller than PNG for photos)
//    - quality 60-70 is sufficient for playable ads

// 4. Use WebP where supported (30% smaller than PNG/JPEG)
//    - Need fallback for older WebViews

// 5. Reduce resolution
//    - Mobile screens are small; 512x512 atlas is often enough
//    - 2x is rarely needed for playable ads

// 6. Reduce color depth
//    - Use indexed PNG (PNG8) for sprites with few colors
//    - 256 colors is sufficient for most game sprites
```

### Procedural Backgrounds (Zero File Size)

```typescript
function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number
): void {
  // Seeded random for consistent star positions
  let s = seed;
  const random = (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  ctx.fillStyle = '#fff';
  for (let i = 0; i < 100; i++) {
    const x = random() * width;
    const y = random() * height;
    const size = random() * 2 + 0.5;
    ctx.globalAlpha = random() * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Procedural tile patterns
function drawCheckeredPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tileSize: number,
  color1: string,
  color2: string
): void {
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const isEven = (x / tileSize + y / tileSize) % 2 === 0;
      ctx.fillStyle = isEven ? color1 : color2;
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }
}
```

---

## Cross-Network Compatibility

### Multi-Network Build Strategy

```typescript
// src/sdk/interface.ts - Common interface all SDK wrappers implement
interface PlayableSDK {
  init(): void;
  getScreenSize(): { width: number; height: number };
  getAudioVolume(): number;
  openStore(): void;
  onReady(cb: () => void): void;
  onViewableChange(cb: (v: boolean) => void): void;
  onResize(cb: (w: number, h: number) => void): void;
  onAudioChange(cb: (v: number) => void): void;
}

// src/sdk/mraid.ts
class MRAIDAdapter implements PlayableSDK {
  init(): void {
    if (typeof mraid === 'undefined') return;
    // MRAID setup
  }
  getScreenSize() {
    return typeof mraid !== 'undefined'
      ? mraid.getScreenSize()
      : { width: window.innerWidth, height: window.innerHeight };
  }
  getAudioVolume() {
    return 0;
  }
  openStore() {
    if (typeof mraid !== 'undefined') mraid.open(STORE_URL);
  }
  onReady(cb: () => void) {
    if (typeof mraid === 'undefined') {
      cb();
      return;
    }
    if (mraid.getState() !== 'loading') cb();
    else mraid.addEventListener('ready', cb);
  }
  onViewableChange(cb: (v: boolean) => void) {
    if (typeof mraid !== 'undefined') {
      mraid.addEventListener('viewableChange', cb);
    }
  }
  onResize(cb: (w: number, h: number) => void) {
    if (typeof mraid !== 'undefined') {
      mraid.addEventListener('sizeChange', cb);
    }
  }
  onAudioChange(_cb: (v: number) => void) {
    // MRAID doesn't support audio volume events
  }
}

// src/sdk/dapi.ts
class DAPIAdapter implements PlayableSDK {
  init(): void {
    if (typeof dapi === 'undefined') return;
  }
  getScreenSize() {
    return typeof dapi !== 'undefined'
      ? dapi.getScreenSize()
      : { width: window.innerWidth, height: window.innerHeight };
  }
  getAudioVolume() {
    return typeof dapi !== 'undefined' ? dapi.getAudioVolume() : 0;
  }
  openStore() {
    if (typeof dapi !== 'undefined') dapi.openStoreUrl();
  }
  onReady(cb: () => void) {
    if (typeof dapi === 'undefined') {
      cb();
      return;
    }
    if (dapi.isReady()) cb();
    else dapi.addEventListener('ready', cb);
  }
  onViewableChange(cb: (v: boolean) => void) {
    if (typeof dapi !== 'undefined') {
      dapi.addEventListener('viewableChange', (e: any) => cb(e.isViewable));
    }
  }
  onResize(cb: (w: number, h: number) => void) {
    if (typeof dapi !== 'undefined') {
      dapi.addEventListener('adResized', () => {
        const s = dapi.getScreenSize();
        cb(s.width, s.height);
      });
    }
  }
  onAudioChange(cb: (v: number) => void) {
    if (typeof dapi !== 'undefined') {
      dapi.addEventListener('audioVolumeChange', cb);
    }
  }
}
```

### Testing Across Networks

```typescript
// Mock SDK for development/testing
class MockSDK implements PlayableSDK {
  private readyCallbacks: Array<() => void> = [];
  private viewableCallbacks: Array<(v: boolean) => void> = [];
  private resizeCallbacks: Array<(w: number, h: number) => void> = [];

  init(): void {
    // Simulate ready after a short delay
    setTimeout(() => {
      this.readyCallbacks.forEach((cb) => cb());
    }, 100);
  }

  getScreenSize() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  getAudioVolume() {
    return 1;
  }

  openStore() {
    console.log('[MockSDK] Store opened');
    window.open('https://example.com', '_blank');
  }

  onReady(cb: () => void) {
    this.readyCallbacks.push(cb);
  }

  onViewableChange(cb: (v: boolean) => void) {
    this.viewableCallbacks.push(cb);
  }

  onResize(cb: (w: number, h: number) => void) {
    this.resizeCallbacks.push(cb);
    window.addEventListener('resize', () => {
      cb(window.innerWidth, window.innerHeight);
    });
  }

  onAudioChange(_cb: (v: number) => void) {}

  // Dev tools
  simulateViewable(v: boolean): void {
    this.viewableCallbacks.forEach((cb) => cb(v));
  }
}
```

---

## Debugging and Testing

### Common Issues and Solutions

| Issue             | Symptom                          | Solution                                                |
| ----------------- | -------------------------------- | ------------------------------------------------------- |
| Blank screen      | White/black screen in ad preview | Check MRAID ready flow; start game after viewable       |
| No interaction    | Taps don't register              | Check `touch-action: none` on canvas; prevent default   |
| CTA not working   | Button click does nothing        | Verify `mraid.open()` or `dapi.openStoreUrl()` called   |
| Wrong size        | Game doesn't fill screen         | Use `getScreenSize()` from SDK, not `window.innerWidth` |
| Audio not playing | No sound                         | Most networks mute by default; check DAPI volume        |
| Over size limit   | Build fails validation           | Compress images more, remove audio, simplify assets     |
| iOS black screen  | Works on Android, blank on iOS   | Check for unsupported APIs (WebGL2, etc.)               |

### Debug Panel for Development

```typescript
class DebugPanel {
  private element: HTMLDivElement;
  private logs: string[] = [];
  private maxLogs: number = 20;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.8); color: #0f0;
      font-family: monospace; font-size: 10px;
      padding: 4px; max-height: 40%;
      overflow-y: auto; z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(this.element);
  }

  log(message: string): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    this.logs.push(`[${timestamp}] ${message}`);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.element.innerHTML = this.logs.join('<br>');
  }

  logSDKState(): void {
    if (typeof mraid !== 'undefined') {
      this.log(`MRAID state: ${mraid.getState()}`);
      this.log(`MRAID viewable: ${mraid.isViewable()}`);
      this.log(`MRAID size: ${JSON.stringify(mraid.getScreenSize())}`);
    } else if (typeof dapi !== 'undefined') {
      this.log(`DAPI ready: ${dapi.isReady()}`);
      this.log(`DAPI size: ${JSON.stringify(dapi.getScreenSize())}`);
      this.log(`DAPI volume: ${dapi.getAudioVolume()}`);
    } else {
      this.log('No ad SDK detected (dev mode)');
    }
  }

  remove(): void {
    this.element.remove();
  }
}

// Enable only in development
const debug = process.env.NODE_ENV === 'development' ? new DebugPanel() : null;
```

### Testing Checklist

```markdown
## Pre-submission Testing Checklist

### Functionality

- [ ] Game loads and starts correctly
- [ ] Tutorial hand appears and is clear
- [ ] Game mechanics work as expected
- [ ] Timer/lives system works
- [ ] End card appears at the right time
- [ ] CTA button is visible and tappable
- [ ] CTA opens app store (test with SDK preview tool)

### Compatibility

- [ ] Works in portrait orientation
- [ ] Works in landscape orientation
- [ ] Works on small screens (320x480)
- [ ] Works on large screens (428x926)
- [ ] Works on iOS Safari WebView
- [ ] Works on Android Chrome WebView
- [ ] Works with MRAID SDK
- [ ] Works with DAPI SDK (if targeting IronSource)

### Performance

- [ ] Steady 30+ FPS on mid-range devices
- [ ] No visible lag or stutter
- [ ] Assets load within 2 seconds
- [ ] No memory leaks (check with dev tools)

### Size

- [ ] Total file size under network limit
- [ ] Validated with network's preview tool
- [ ] No external HTTP requests (check network tab)
```

---

## Performance Optimization

### Rendering Optimization for WebViews

```typescript
// WebViews are slower than full browsers. Key optimizations:

// 1. Minimize canvas state changes
// BAD: changing fillStyle every draw call
function renderBad(ctx: CanvasRenderingContext2D, items: any[]): void {
  items.forEach((item) => {
    ctx.fillStyle = item.color; // State change per item
    ctx.fillRect(item.x, item.y, item.w, item.h);
  });
}

// GOOD: batch by color
function renderGood(ctx: CanvasRenderingContext2D, items: any[]): void {
  // Sort by color, then draw all of each color at once
  const byColor = new Map<string, any[]>();
  items.forEach((item) => {
    const list = byColor.get(item.color) || [];
    list.push(item);
    byColor.set(item.color, list);
  });

  byColor.forEach((list, color) => {
    ctx.fillStyle = color;
    list.forEach((item) => {
      ctx.fillRect(item.x, item.y, item.w, item.h);
    });
  });
}

// 2. Use offscreen canvas for static elements
function createStaticBackground(
  width: number,
  height: number
): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d')!;
  // Draw background once
  drawBackground(offCtx, width, height);
  return offscreen;
}

// Then in game loop: ctx.drawImage(staticBG, 0, 0);

// 3. Reduce canvas resolution on low-end devices
function setupCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
}

// 4. Target 30 FPS instead of 60 FPS
// Many playable ads run fine at 30 FPS, halving CPU usage
let frameSkip = true;
function gameLoop(timestamp: number): void {
  requestAnimationFrame(gameLoop);
  frameSkip = !frameSkip;
  if (frameSkip) return; // Skip every other frame = 30 FPS

  update(1 / 30);
  render();
}
```

### Memory Management

```typescript
// Playable ads run in constrained WebViews with limited memory

// 1. Avoid creating objects in the game loop
// BAD
function updateBad(): void {
  const velocity = { x: 1, y: 0 }; // New object every frame!
  player.x += velocity.x;
}

// GOOD: reuse objects
const tempVec = { x: 0, y: 0 };
function updateGood(): void {
  tempVec.x = 1;
  tempVec.y = 0;
  player.x += tempVec.x;
}

// 2. Pre-allocate arrays
const particles: Particle[] = new Array(100);
for (let i = 0; i < 100; i++) {
  particles[i] = new Particle(); // Pre-allocate
}

// 3. Avoid string concatenation in loops
// BAD: creates new strings every frame
function drawScoreBad(ctx: CanvasRenderingContext2D, score: number): void {
  ctx.fillText('Score: ' + score, 10, 30); // String allocation
}

// GOOD: cache the string
let cachedScoreText = '';
let cachedScore = -1;
function drawScoreGood(ctx: CanvasRenderingContext2D, score: number): void {
  if (score !== cachedScore) {
    cachedScore = score;
    cachedScoreText = `Score: ${score}`;
  }
  ctx.fillText(cachedScoreText, 10, 30);
}
```

---

## Interview Questions

### Q1: What is a playable ad and why are they effective?

**Answer:**

A playable ad is an interactive mini-game served as an ad creative within another app. The user plays a simplified version of the advertised game for 15-30 seconds, then sees a CTA (call-to-action) button leading to the app store.

They are effective because:

1. **Higher conversion rates**: Users who interact with a playable ad convert to installs at 2-4x the rate of video ads (3-8% vs 1-3%) because they have already experienced the gameplay.

2. **Higher quality users**: Users who install after playing have higher Day-1 retention, higher LTV (lifetime value), and lower uninstall rates because they know what they are getting.

3. **Self-selecting audience**: Users who enjoy the mini-game are the ones most likely to enjoy the full game. This is a natural filter that improves user acquisition quality.

4. **Engagement**: Interactive content has higher engagement than passive video. Users spend more time with the ad, increasing brand impression even if they do not install.

The trade-off is significantly higher production cost. A video ad can be produced in days. A playable ad requires engineering a self-contained game that runs in a constrained WebView with strict size limits.

---

### Q2: What are the key constraints when building a playable ad? How do they differ from building a normal web game?

**Answer:**

Key constraints:

1. **File size**: Everything must fit in 2-5 MB (depending on network). A normal web game might be 50+ MB. This means heavily compressed assets, no external CDN requests, and often no audio at all.

2. **Single-file format**: Most networks require a single HTML file with all CSS, JavaScript, and assets (as base64) inlined. No separate files, no lazy loading, no code splitting.

3. **No external requests**: Cannot fetch anything from servers. Every byte must be in the HTML file. This rules out web fonts, CDN-hosted libraries, analytics, and remote configuration.

4. **WebView environment**: Runs in a mobile app's WebView, not a full browser. WebView support varies by OS version and device. WebGL may be unavailable or buggy. Performance is lower than a browser.

5. **15-30 second experience**: The game must be understood in seconds, not minutes. No complex tutorials. The entire gameplay loop must be immediately intuitive.

6. **Multiple SDK integrations**: Different ad networks (Facebook, Google, Unity, IronSource) have different SDKs (MRAID, DAPI, FBIG). You must build adapters for each, and the lifecycle events differ.

7. **Must degrade gracefully**: Old WebViews, low-end devices, and varied screen sizes. Portrait and landscape. The game must work everywhere.

---

### Q3: Explain the MRAID specification. What are the key APIs and events?

**Answer:**

MRAID (Mobile Rich Media Ad Interface Definitions) is the IAB standard for interactive ads in mobile apps. It provides a JavaScript API for ad creatives to communicate with the ad container (SDK).

**Key APIs:**

- `mraid.getState()`: Returns `'loading'`, `'default'`, `'expanded'`, `'resized'`, or `'hidden'`. The ad should not start until state is not `'loading'`.
- `mraid.isViewable()`: Returns whether the ad is currently visible on screen.
- `mraid.open(url)`: Opens a URL, typically the app store URL. This is the CTA action.
- `mraid.close()`: Closes the ad.
- `mraid.getScreenSize()`: Returns `{ width, height }` of the available screen area.

**Key Events:**

- `'ready'`: Fires when MRAID is initialized. After this, you can call `getState()`, `isViewable()`, etc.
- `'viewableChange'`: Fires when the ad becomes visible or hidden. Start the game when viewable, pause when not.
- `'stateChange'`: Fires when the MRAID state changes.
- `'sizeChange'`: Fires when the ad container is resized (orientation change).

**Critical flow:**

1. Wait for `'ready'` event.
2. Check `isViewable()`.
3. If viewable, start game. If not, wait for `'viewableChange'` with `true`.
4. On CTA, call `mraid.open(storeUrl)`.

Important: Do NOT bundle your own `mraid.js`. The SDK injects it. If you include one, it will conflict.

---

### Q4: How do you handle differences between MRAID and DAPI (IronSource)?

**Answer:**

I create a common SDK interface and implement adapters for each network. The game code only interacts with the interface, never directly with MRAID or DAPI.

The interface provides:

- `init()`, `getScreenSize()`, `getAudioVolume()`, `openStore()`
- `onReady()`, `onViewableChange()`, `onResize()`, `onAudioChange()`

Key differences to abstract:

- **CTA**: MRAID uses `mraid.open(url)` where you provide the URL. DAPI uses `dapi.openStoreUrl()` where the URL is configured in the IronSource dashboard.
- **Audio volume**: DAPI provides `getAudioVolume()` and an `audioVolumeChange` event. MRAID does not -- you must default to muted.
- **Readiness check**: MRAID uses `getState() !== 'loading'`. DAPI uses `dapi.isReady()`.
- **Viewability event shape**: MRAID passes a boolean directly. DAPI wraps it in an object `{ isViewable: boolean }`.

At build time, webpack aliases `@sdk` to the correct adapter based on the target network. The build produces one HTML file per network, each with the correct SDK integration.

For development, I use a MockSDK that simulates the ad container with a browser-based UI for triggering viewability changes and store opens.

---

### Q5: Walk through your build pipeline for a playable ad.

**Answer:**

The pipeline transforms a TypeScript project with separate asset files into a single HTML file under 5MB.

1. **TypeScript compilation**: `ts-loader` compiles TypeScript to JavaScript.

2. **Asset inlining**: Webpack's `asset/inline` rule converts all image and audio imports to base64 data URIs embedded in the JavaScript bundle.

3. **Bundling**: Webpack bundles all JavaScript modules into a single file. Tree-shaking removes unused code.

4. **CSS inlining**: `html-inline-css-webpack-plugin` takes any CSS and inlines it into a `<style>` tag in the HTML.

5. **Script inlining**: `html-inline-script-webpack-plugin` takes the bundled JS and inlines it into a `<script>` tag in the HTML.

6. **Minification**: Terser compresses JavaScript (dead code elimination, variable name mangling, whitespace removal). `console.log` calls are stripped.

7. **HTML minification**: HtmlWebpackPlugin minifies the HTML (removes comments, collapses whitespace).

8. **Network-specific templating**: Different HTML templates per network include the appropriate meta tags, SDK script tags, and CTA handling.

9. **Size validation**: A post-build script checks each output file against the network's size limit (5MB for most, 2MB for TikTok). Build fails if over limit.

10. **Multi-network output**: The build runs once per target network, producing `index-mraid.html`, `index-dapi.html`, `index-facebook.html`, etc.

---

### Q6: How do you keep a playable ad under 2MB for TikTok?

**Answer:**

TikTok's 2MB limit is the most aggressive constraint. Strategies:

1. **Minimize images**: Use a single 512x512 texture atlas with PNG8 (indexed colors). Run through tinypng for lossy compression. Target under 500KB total for all images.

2. **No audio files**: Use procedural audio only (oscillator-based SFX) or ship with no audio at all. Audio files are the first to cut.

3. **Procedural backgrounds**: Generate backgrounds with canvas gradients, patterns, and shapes instead of image files.

4. **Aggressive code minification**: Enable all Terser compression options, strip all comments and console statements, use short variable names. Target under 100KB of JavaScript.

5. **Fewer game entities**: Reduce the scope -- fewer enemy types, fewer particle effects, simpler animations.

6. **Use CSS for UI instead of canvas**: CSS buttons, overlays, and text use less code than canvas-rendered UI.

7. **Consider using SVG**: For simple vector graphics, inline SVG is smaller than rasterized images.

8. **Measure base64 overhead**: Remember that base64 encoding adds 33% to file size. A 300KB PNG becomes 400KB when inlined. Budget accordingly.

9. **Remove unused code paths**: If you have a multi-network build, ensure tree-shaking removes code for other networks' SDKs.

---

### Q7: How do you handle orientation changes in a playable ad?

**Answer:**

Playable ads must work in both portrait and landscape since users hold their phones differently and some host apps lock orientation.

1. **Listen for resize events** from the SDK (`mraid.addEventListener('sizeChange', ...)` or `dapi.addEventListener('adResized', ...)`) rather than `window.resize`.

2. **Use the SDK's `getScreenSize()`** to determine the actual available space. `window.innerWidth` may not be accurate in WebViews.

3. **Design the game to work in both orientations**: Either use a responsive layout that adapts (recommended), or design for portrait and add letterboxing in landscape.

4. **Recalculate game scaling** on every resize: set canvas dimensions, recompute game coordinate system, reposition UI elements (CTA button, score display).

5. **Avoid absolute pixel positions**: Use percentage-based or viewport-relative positioning for UI elements.

```typescript
function handleResize(width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;

  const isPortrait = height > width;
  const gameWidth = isPortrait ? 400 : 700;
  const gameHeight = isPortrait ? 700 : 400;

  const scale = Math.min(width / gameWidth, height / gameHeight);
  const offsetX = (width - gameWidth * scale) / 2;
  const offsetY = (height - gameHeight * scale) / 2;

  // Apply to rendering transform
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
}
```

---

### Q8: What is the typical lifecycle of a playable ad from load to install?

**Answer:**

1. **SDK injection (0s)**: The host app's ad SDK injects the MRAID or DAPI JavaScript into the WebView before loading the HTML.

2. **HTML load (0-0.5s)**: The single HTML file loads. JavaScript begins executing.

3. **SDK ready (0.5-1s)**: The `ready` event fires. The playable checks if it is viewable.

4. **Preload (0.5-2s)**: Base64-encoded images are decoded into `Image` objects. Audio context is prepared (but not started until user interaction).

5. **Tutorial (0-3s)**: An animated hand or arrows show the user what to do. No text (must work in all languages). Auto-skips after 3 seconds or on first tap.

6. **Gameplay (3-25s)**: The core game loop runs. Difficulty ramps quickly. The experience is designed to end with the user feeling "I almost had it" (creates desire to install and try again).

7. **End card (25-30s)**: Triggered by timer expiry, lives running out, or level completion. Shows:

   - Large CTA button ("Install Now", "Play Now")
   - Game screenshots or icon
   - Optional: social proof ("50M+ downloads")

8. **CTA click**: User taps the CTA button. `mraid.open()` or `dapi.openStoreUrl()` is called. The SDK opens the app store page.

9. **Install**: The user installs the app from the store.

The critical metric is the conversion from CTA impression to install (IVR -- Install to View Rate, or IPM -- Installs Per Mille impressions).

---

### Q9: How do you test a playable ad before submitting to ad networks?

**Answer:**

Testing happens at multiple levels:

1. **Local browser testing**: Run the playable in a regular browser using the MockSDK. Test gameplay, tutorial flow, CTA behavior, orientation changes. Use Chrome DevTools to simulate mobile viewport sizes and throttle performance.

2. **Ad network preview tools**: Most networks provide preview/testing tools:

   - Facebook: Playable Preview tool in Ads Manager
   - Google: Google Web Designer preview
   - IronSource: IronSource DAPI testing tool
   - Unity: Unity Ads preview

   Upload the HTML and test within the actual SDK environment.

3. **Real device testing**: Sideload the HTML into a WebView on physical iOS and Android devices. Test on old devices (iPhone 8, Galaxy S8 era) for performance validation.

4. **Automated checks**:

   - File size validation against each network's limit
   - No external HTTP requests (parse HTML for fetch/XMLHttpRequest/img src)
   - MRAID/DAPI API calls present
   - No `eval()` or `document.write()` (blocked by some networks)

5. **Performance profiling**: Use Chrome DevTools remote debugging connected to an Android WebView. Check for:

   - Steady 30+ FPS
   - No memory leaks
   - Fast load time (< 2s to interactive)

6. **A/B testing in production**: After passing network review, run small-budget test campaigns to validate metrics (CTR, IPM, IVR, ROAS) before scaling spend.

---

### Q10: What are the most common reasons a playable ad gets rejected by an ad network?

**Answer:**

1. **Over size limit**: The most common rejection. Base64 encoding adds 33%, which catches developers off guard. Always validate after building.

2. **External network requests**: Any fetch, XHR, or resource loaded from a URL will be rejected. Images must be base64-inlined, not loaded from CDNs.

3. **CTA not working**: The CTA must call the correct SDK method (`mraid.open()` or `dapi.openStoreUrl()`). If it opens a hardcoded URL or uses `window.open()`, it may not work in the ad container.

4. **Missing MRAID integration**: The ad must wait for MRAID ready, check viewability, and respond to viewability changes. Starting the game immediately without checking MRAID state will be rejected.

5. **Blank/black screen**: Often caused by incorrect MRAID lifecycle handling or WebGL failures. The ad must gracefully handle missing WebGL support.

6. **No close button or misleading UI**: Some networks require the ad to have a visible close button or not cover the system close button.

7. **Inappropriate content**: Violence, mature themes, or misleading representation of the advertised game.

8. **Performance issues**: Ads that freeze, lag, or crash on common devices may be rejected or will have poor metrics and get deprioritized.

9. **Bundled mraid.js**: Including your own `mraid.js` file conflicts with the SDK's injected version. This causes crashes.

10. **Uses `eval()` or `document.write()`**: Blocked by some networks for security reasons.

---

### Q11: How do you structure the codebase for a team that produces many playable ads?

**Answer:**

Use a shared engine/framework with per-project game logic:

```
playable-engine/          (shared npm package or monorepo)
├── engine/               # Rendering, input, audio, math
├── sdk/                  # MRAID, DAPI, Facebook adapters
├── ui/                   # Tutorial hand, CTA button, end card
├── build/                # Webpack config, validation scripts
└── templates/            # HTML templates per network

playable-match3/          (individual project)
├── src/game/             # Match-3 specific game logic
├── assets/               # Match-3 specific assets
└── config.ts             # Game-specific config (timing, difficulty)

playable-runner/          (individual project)
├── src/game/             # Runner specific game logic
├── assets/               # Runner specific assets
└── config.ts
```

The engine handles everything that is common across all playable ads: SDK integration, build pipeline, canvas rendering, input handling, game loop, tween system, tutorial hand animation, end card layout, CTA button behavior.

Each playable ad project imports the engine and implements only the game-specific logic: entities, mechanics, level design, and assets.

This lets a team produce new playable ads in 2-5 days instead of 2-3 weeks, because they do not re-implement the infrastructure each time.

---

### Q12: Design the architecture for a match-3 playable ad. What components do you need?

**Answer:**

**Core components:**

1. **Grid system**: 2D array of tile types (5x7 or 6x8 grid). Each cell stores a color/type ID (Flyweight pattern). Grid operations: swap, match detection (horizontal/vertical runs of 3+), cascade (gravity fill), and refill.

2. **Input handler**: Touch/mouse drag detection. Track start cell, current cell, and direction. Validate swap (must be adjacent, must create a match). Snap back if invalid.

3. **Match detection**: After each swap, scan the grid for runs of 3+ matching tiles horizontally and vertically. Mark matched tiles for removal. Handle chain reactions (cascades).

4. **Animation system**: Tween tiles for swap animation (200ms), match destruction (shrink + fade, 300ms), and cascade (tiles falling, 200ms per row). Use a simple tween manager, not a full animation library.

5. **Score/progress**: Track matches toward a goal (e.g., "Match 20 tiles"). Show a progress bar. When the goal is reached OR the timer expires, show the end card.

6. **Tutorial**: Animated hand showing a valid swap in the starting grid. The initial grid is pre-configured so there is a guaranteed match in an obvious position.

7. **Difficulty**: Start with many obvious matches. After the first cascade, the refill generates boards with fewer easy matches. Do not make it impossible -- the user should feel "I was getting better, I want to keep playing."

**State machine:** Tutorial -> Playing -> EndCard. The Playing state has sub-states: WaitingForInput -> Swapping -> MatchChecking -> Cascading -> Refilling -> WaitingForInput.

**Assets:** One texture atlas (512x512) with tile sprites, particles, UI elements. Procedural audio for match sounds (ascending tones). Total target: under 1MB.
