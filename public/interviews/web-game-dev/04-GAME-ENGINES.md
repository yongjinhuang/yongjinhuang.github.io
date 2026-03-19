# Game Engines & Frameworks

## Table of Contents

1. [Phaser 3](#phaser-3)
2. [PixiJS](#pixijs)
3. [PlayCanvas](#playcanvas)
4. [Cocos Creator](#cocos-creator)
5. [Three.js](#threejs)
6. [Babylon.js](#babylonjs)
7. [Custom Engine](#custom-engine)
8. [Comparison Table](#comparison-table)
9. [Choosing for Playable Ads](#choosing-for-playable-ads)
10. [Interview Questions](#interview-questions)

---

## Phaser 3

### Overview

Phaser 3 is the most popular open-source HTML5 game framework. It's a complete 2D game engine with rendering (WebGL + Canvas fallback), physics, audio, input, and scene management built in.

**Best for:** 2D games (platformers, puzzles, casual games), prototyping, game jams, learning game development.

### Architecture

Phaser follows a **Scene-based architecture**. Each scene is an independent game state (menu, gameplay, game over) with its own lifecycle.

```
Phaser.Game
├── Scene Manager
│   ├── BootScene
│   ├── PreloadScene
│   ├── MenuScene
│   ├── GameScene
│   └── GameOverScene
├── Renderer (WebGL / Canvas)
├── Input Manager
├── Sound Manager
├── Physics (Arcade / Matter.js)
├── Tween Manager
├── Timer Manager
└── Cache (textures, audio, data)
```

### Scene System

```typescript
class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score: number = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  // Load assets
  preload(): void {
    this.load.spritesheet('player', 'assets/player.png', {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.image('platform', 'assets/platform.png');
    this.load.image('coin', 'assets/coin.png');
  }

  // Create game objects
  create(): void {
    // Physics-enabled sprite
    this.player = this.physics.add.sprite(100, 300, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.2);

    // Static physics group (platforms)
    const platforms = this.physics.add.staticGroup();
    platforms.create(400, 568, 'platform').setScale(2).refreshBody();
    platforms.create(600, 400, 'platform');
    platforms.create(50, 250, 'platform');

    // Collisions
    this.physics.add.collider(this.player, platforms);

    // Collectibles
    const coins = this.physics.add.group({
      key: 'coin',
      repeat: 11,
      setXY: { x: 12, y: 0, stepX: 70 },
    });

    this.physics.add.collider(coins, platforms);
    this.physics.add.overlap(
      this.player,
      coins,
      this.collectCoin,
      undefined,
      this
    );

    // Animations
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });

    this.anims.create({
      key: 'idle',
      frames: [{ key: 'player', frame: 4 }],
      frameRate: 20,
    });

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  // Game loop (runs every frame)
  update(): void {
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-160);
      this.player.anims.play('walk', true);
      this.player.flipX = true;
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(160);
      this.player.anims.play('walk', true);
      this.player.flipX = false;
    } else {
      this.player.setVelocityX(0);
      this.player.anims.play('idle', true);
    }

    if (this.cursors.up.isDown && this.player.body!.touching.down) {
      this.player.setVelocityY(-330);
    }
  }

  private collectCoin(
    player: Phaser.GameObjects.GameObject,
    coin: Phaser.GameObjects.GameObject
  ): void {
    (coin as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
    this.score += 10;
  }
}

// Game configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL with Canvas fallback
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
```

### Game Objects

Phaser provides many built-in game objects:

| Object       | Use                                       |
| ------------ | ----------------------------------------- |
| `Sprite`     | Textured object with animation support    |
| `Image`      | Static sprite (no animation, lighter)     |
| `Text`       | Dynamic text rendering                    |
| `BitmapText` | GPU-rendered text from font atlas         |
| `Graphics`   | Procedural shapes (lines, circles, rects) |
| `Container`  | Groups objects, applies shared transform  |
| `TileSprite` | Scrolling/repeating texture (parallax)    |
| `Particles`  | Particle emitter system                   |
| `Video`      | Video playback in game                    |

### Physics: Arcade vs Matter

**Arcade Physics** (built-in, lightweight):

- AABB collision only (rectangles and circles)
- No rotation physics, no polygon colliders
- Very fast — suitable for hundreds of bodies
- Perfect for platformers, top-down games, casual games

**Matter.js** (integrated):

- Full rigid body physics with polygon colliders
- Joints, constraints, compound bodies
- Rotation, friction, restitution
- Heavier but more realistic
- Good for physics puzzles, Angry Birds-style games

### Tweens

```typescript
// Phaser tween system
this.tweens.add({
  targets: sprite,
  x: 400,
  y: 300,
  scaleX: 2,
  scaleY: 2,
  alpha: 0.5,
  duration: 1000,
  ease: 'Power2', // easeInOut by default
  yoyo: true, // reverse back to start
  repeat: -1, // infinite
  delay: 500,
  onComplete: () => {
    // Tween finished
  },
});

// Timeline (sequential tweens)
const timeline = this.tweens.createTimeline();
timeline.add({ targets: sprite, x: 200, duration: 500 });
timeline.add({ targets: sprite, y: 400, duration: 500 });
timeline.add({ targets: sprite, alpha: 0, duration: 300 });
timeline.play();
```

### Pros and Cons

**Pros:**

- Feature-complete: everything a 2D game needs out of the box
- Excellent documentation and large community
- Huge plugin ecosystem
- Built-in scene management, asset loading, audio, input
- TypeScript definitions included

**Cons:**

- Large bundle size (~1MB minified, ~300KB gzipped) — too heavy for playable ads
- Opinionated architecture — hard to use only parts of it
- Performance ceiling: not ideal for 10,000+ entities (Arcade physics overhead)
- WebGL renderer is less optimized than PixiJS for pure rendering tasks

---

## PixiJS

### Overview

PixiJS is a 2D WebGL rendering engine — not a game engine. It provides extremely fast sprite rendering with a display tree (scene graph) but does not include physics, audio, or scene management. You add those yourself or use libraries.

**Best for:** High-performance 2D rendering, custom game engines, playable ads (can tree-shake to small size), interactive visualizations.

### Architecture

```
PIXI.Application
├── Stage (root Container)
│   ├── Container (game world)
│   │   ├── Sprite (player)
│   │   ├── AnimatedSprite (enemy)
│   │   ├── Graphics (shapes)
│   │   └── Container (UI layer)
│   └── Container (HUD)
├── Renderer (WebGL / WebGPU)
│   ├── BatchRenderer
│   ├── Filter System
│   └── Render Texture System
├── Ticker (game loop)
├── Assets (loader)
└── Events (interaction)
```

### Display Tree

```typescript
import * as PIXI from 'pixi.js';

const app = new PIXI.Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x222222,
  antialias: true,
});
document.body.appendChild(app.canvas);

// Containers for layering
const gameWorld = new PIXI.Container();
const uiLayer = new PIXI.Container();
app.stage.addChild(gameWorld);
app.stage.addChild(uiLayer); // UI renders on top

// Sprite
const texture = await PIXI.Assets.load('hero.png');
const hero = new PIXI.Sprite(texture);
hero.anchor.set(0.5, 1.0); // bottom center
hero.x = 400;
hero.y = 500;
hero.scale.set(2);
gameWorld.addChild(hero);

// Graphics (procedural shapes)
const healthBar = new PIXI.Graphics();
healthBar.rect(0, 0, 200, 20);
healthBar.fill(0xff0000);
healthBar.x = 10;
healthBar.y = 10;
uiLayer.addChild(healthBar);
```

### Sprites and Sprite Sheets

```typescript
// Load spritesheet
const sheet = await PIXI.Assets.load('characters.json');

// Individual sprite from atlas
const enemy = new PIXI.Sprite(sheet.textures['goblin_idle_01.png']);
gameWorld.addChild(enemy);

// Animated sprite
const explosionFrames: PIXI.Texture[] = [];
for (let i = 0; i < 16; i++) {
  const frameName = `explosion_${String(i).padStart(4, '0')}.png`;
  explosionFrames.push(sheet.textures[frameName]);
}

const explosion = new PIXI.AnimatedSprite(explosionFrames);
explosion.animationSpeed = 0.4;
explosion.loop = false;
explosion.onComplete = () => {
  explosion.destroy();
};
explosion.play();
gameWorld.addChild(explosion);
```

### Filters

PixiJS filters apply GPU shaders to any display object:

```typescript
// Built-in filters
const blur = new PIXI.BlurFilter({ strength: 8 });
const glow = new PIXI.GlowFilter({
  distance: 15,
  outerStrength: 2,
  color: 0xffff00,
});

hero.filters = [blur];

// Custom filter
class WaveFilter extends PIXI.Filter {
  constructor() {
    const fragmentSrc = `
            precision mediump float;
            varying vec2 vTextureCoord;
            uniform sampler2D uTexture;
            uniform float uTime;
            uniform float uAmplitude;

            void main() {
                vec2 uv = vTextureCoord;
                uv.x += sin(uv.y * 20.0 + uTime * 3.0) * uAmplitude;
                gl_FragColor = texture2D(uTexture, uv);
            }
        `;

    super({
      glProgram: new PIXI.GlProgram({ fragment: fragmentSrc }),
      resources: {
        waveUniforms: {
          uTime: { value: 0, type: 'f32' },
          uAmplitude: { value: 0.02, type: 'f32' },
        },
      },
    });
  }

  get time(): number {
    return this.resources.waveUniforms.uniforms.uTime;
  }

  set time(value: number) {
    this.resources.waveUniforms.uniforms.uTime = value;
  }
}
```

### Ticker (Game Loop)

```typescript
// PixiJS provides a Ticker for the game loop
app.ticker.add((ticker) => {
  const dt = ticker.deltaTime; // 1.0 at 60fps, 2.0 at 30fps (normalized)
  const deltaMS = ticker.deltaMS; // actual ms since last frame
  const deltaSec = ticker.deltaMS / 1000; // seconds

  hero.x += speed * deltaSec;
  hero.rotation += 0.01 * ticker.deltaTime;
});

// Or use your own loop
app.ticker.stop();
function customLoop(timestamp: number): void {
  // ... your game loop ...
  app.renderer.render(app.stage);
  requestAnimationFrame(customLoop);
}
requestAnimationFrame(customLoop);
```

### Pros and Cons

**Pros:**

- Fastest 2D WebGL renderer available
- Excellent sprite batching (thousands of sprites in one draw call)
- Small footprint when tree-shaken (~100KB for core rendering)
- Very flexible — bring your own game logic
- Great for playable ads (small size, fast rendering)
- PixiJS v8 supports WebGPU
- Can be used as a rendering backend for custom engines

**Cons:**

- Not a game engine — no physics, scene management, or audio
- Must build or integrate game systems yourself
- Steeper initial setup for a complete game
- Documentation can be sparse for advanced features

---

## PlayCanvas

### Overview

PlayCanvas is an open-source 3D game engine with a cloud-based visual editor. It uses an Entity-Component System (ECS) architecture and supports WebGL2 and WebGPU.

**Best for:** 3D web games, playable ads (3D), interactive product configurators, architectural visualization.

### Architecture: Entity-Component System

```
PlayCanvas Application
├── Scene (root Entity)
│   ├── Entity: Camera
│   │   └── Component: Camera
│   ├── Entity: Light
│   │   └── Component: Light
│   ├── Entity: Player
│   │   ├── Component: Model
│   │   ├── Component: RigidBody
│   │   ├── Component: Collision
│   │   └── Component: Script (PlayerController)
│   └── Entity: Ground
│       ├── Component: Model
│       ├── Component: RigidBody
│       └── Component: Collision
├── Systems
│   ├── RenderSystem
│   ├── PhysicsSystem
│   ├── ScriptSystem
│   └── AnimationSystem
└── Asset Registry
```

### Code Example

```typescript
// PlayCanvas script component
const PlayerController = pc.createScript('playerController');

PlayerController.attributes.add('speed', { type: 'number', default: 5 });
PlayerController.attributes.add('jumpForce', { type: 'number', default: 400 });

PlayerController.prototype.initialize = function () {
  this.force = new pc.Vec3();
  this.onGround = false;

  // Collision events
  this.entity.collision.on('collisionstart', this.onCollisionStart, this);
  this.entity.collision.on('collisionend', this.onCollisionEnd, this);

  // Keyboard input
  this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
};

PlayerController.prototype.update = function (dt: number) {
  this.force.set(0, 0, 0);

  // Movement
  if (this.app.keyboard.isPressed(pc.KEY_LEFT)) {
    this.force.x -= this.speed;
  }
  if (this.app.keyboard.isPressed(pc.KEY_RIGHT)) {
    this.force.x += this.speed;
  }
  if (this.app.keyboard.isPressed(pc.KEY_UP)) {
    this.force.z -= this.speed;
  }
  if (this.app.keyboard.isPressed(pc.KEY_DOWN)) {
    this.force.z += this.speed;
  }

  // Apply force via rigid body
  if (this.entity.rigidbody) {
    this.entity.rigidbody.applyForce(this.force);
  }
};

PlayerController.prototype.onKeyDown = function (event: { key: number }) {
  if (event.key === pc.KEY_SPACE && this.onGround) {
    this.entity.rigidbody.applyImpulse(0, this.jumpForce, 0);
  }
};

PlayerController.prototype.onCollisionStart = function (result: {
  other: pc.Entity;
}) {
  if (result.other.tags.has('ground')) {
    this.onGround = true;
  }
};

PlayerController.prototype.onCollisionEnd = function (result: {
  other: pc.Entity;
}) {
  if (result.other.tags.has('ground')) {
    this.onGround = false;
  }
};
```

### Programmatic Setup (No Editor)

```typescript
const canvas = document.getElementById('application') as HTMLCanvasElement;
const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
});

app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);

// Create camera
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.1, 0.1, 0.15),
});
camera.setPosition(0, 5, 10);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

// Create light
const light = new pc.Entity('light');
light.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 1, 1),
  intensity: 1,
});
light.setEulerAngles(45, 30, 0);
app.root.addChild(light);

// Create box
const box = new pc.Entity('box');
box.addComponent('model', { type: 'box' });
box.addComponent('rigidbody', { type: 'dynamic', mass: 1 });
box.addComponent('collision', { type: 'box' });
box.setPosition(0, 5, 0);
app.root.addChild(box);

app.start();
```

### Pros and Cons

**Pros:**

- Cloud-based visual editor (collaborative, no install)
- True ECS architecture — clean separation of data and behavior
- Built-in physics (ammo.js), audio, and animation
- Good for 3D playable ads (can produce small builds)
- Active development, solid documentation
- WebGPU support

**Cons:**

- Primarily 3D — limited 2D tooling
- Editor requires cloud account (engine itself is open source)
- Smaller community than Three.js or Phaser
- Script system uses prototype-based patterns (less modern than class-based)

---

## Cocos Creator

### Overview

Cocos Creator is a cross-platform game engine with a desktop editor. It supports 2D and 3D games, with strong adoption in Asia (especially China). The engine is open source; the editor is free.

**Best for:** Mobile games, games targeting Asian markets, 2D/3D hybrid games.

### Architecture: Node-Component System

Cocos uses a node hierarchy where each node can have components attached:

```
Scene
├── Canvas (UI root)
│   ├── Node: StartButton
│   │   ├── Component: Sprite
│   │   └── Component: Button
│   └── Node: ScoreLabel
│       └── Component: Label
├── Node: GameWorld
│   ├── Node: Player
│   │   ├── Component: Sprite
│   │   ├── Component: RigidBody2D
│   │   ├── Component: BoxCollider2D
│   │   └── Component: PlayerController (custom)
│   ├── Node: Background
│   │   └── Component: TiledMap
│   └── Node: Enemies
│       └── Node: Enemy (prefab instances)
└── Node: Camera
    └── Component: Camera
```

### Code Example

```typescript
import {
  _decorator,
  Component,
  Node,
  Vec3,
  input,
  Input,
  KeyCode,
  RigidBody2D,
  PhysicsSystem2D,
  Contact2DType,
  Collider2D,
  IPhysics2DContact,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
  @property({ type: Number })
  speed: number = 300;

  @property({ type: Number })
  jumpForce: number = 600;

  private rigidBody: RigidBody2D | null = null;
  private moveDir: number = 0;
  private canJump: boolean = false;

  onLoad(): void {
    this.rigidBody = this.getComponent(RigidBody2D);

    // Register input
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);

    // Collision detection
    const collider = this.getComponent(Collider2D);
    if (collider) {
      collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
      collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
    }
  }

  update(dt: number): void {
    if (!this.rigidBody) return;

    // Apply horizontal velocity
    const velocity = this.rigidBody.linearVelocity;
    velocity.x = this.moveDir * this.speed;
    this.rigidBody.linearVelocity = velocity;
  }

  private onKeyDown(event: { keyCode: KeyCode }): void {
    switch (event.keyCode) {
      case KeyCode.ARROW_LEFT:
        this.moveDir = -1;
        break;
      case KeyCode.ARROW_RIGHT:
        this.moveDir = 1;
        break;
      case KeyCode.SPACE:
        if (this.canJump) {
          this.jump();
        }
        break;
    }
  }

  private onKeyUp(event: { keyCode: KeyCode }): void {
    if (event.keyCode === KeyCode.ARROW_LEFT && this.moveDir === -1) {
      this.moveDir = 0;
    }
    if (event.keyCode === KeyCode.ARROW_RIGHT && this.moveDir === 1) {
      this.moveDir = 0;
    }
  }

  private jump(): void {
    if (!this.rigidBody) return;
    const velocity = this.rigidBody.linearVelocity;
    velocity.y = this.jumpForce;
    this.rigidBody.linearVelocity = velocity;
    this.canJump = false;
  }

  private onBeginContact(
    selfCollider: Collider2D,
    otherCollider: Collider2D,
    contact: IPhysics2DContact | null
  ): void {
    if (otherCollider.node.name === 'Ground') {
      this.canJump = true;
    }
  }

  private onEndContact(
    selfCollider: Collider2D,
    otherCollider: Collider2D,
    contact: IPhysics2DContact | null
  ): void {
    if (otherCollider.node.name === 'Ground') {
      this.canJump = false;
    }
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
  }
}
```

### Animation System

Cocos Creator has a powerful built-in animation editor supporting keyframe animation, skeletal animation (Spine/DragonBones), and the Animation Graph (state machine).

```typescript
import { _decorator, Component, Animation, AnimationClip } from 'cc';

const { ccclass } = _decorator;

@ccclass('AnimController')
export class AnimController extends Component {
  private anim: Animation | null = null;

  onLoad(): void {
    this.anim = this.getComponent(Animation);
  }

  playIdle(): void {
    this.anim?.play('idle');
  }

  playRun(): void {
    this.anim?.crossFade('run', 0.2); // Blend over 0.2s
  }

  playAttack(): void {
    this.anim?.play('attack');
    this.anim?.once(Animation.EventType.FINISHED, () => {
      this.playIdle();
    });
  }
}
```

### Pros and Cons

**Pros:**

- Full-featured visual editor with scene, animation, and UI editors
- Strong 2D and 3D support in one engine
- TypeScript-first with decorators for editor integration
- Built-in UI system (Canvas, Labels, Buttons, Layout)
- Prefab system for reusable game objects
- Good mobile performance
- Large community in Asia, many tutorials in Chinese

**Cons:**

- Smaller Western community and English documentation
- Web builds can be large (~2-5MB+) — not ideal for playable ads
- Editor has a learning curve
- Desktop editor required (not cloud-based like PlayCanvas)
- Some features feel more oriented toward native mobile than web

---

## Three.js

### Overview

Three.js is the most widely-used 3D rendering library for the web. It abstracts WebGL into a high-level scene graph API. Like PixiJS, it's a rendering library, not a game engine — you must add game logic, physics, and audio yourself.

**Best for:** 3D web experiences, product configurators, data visualization, 3D games where you want full control.

### Architecture

```
THREE.Scene (scene graph root)
├── THREE.Mesh
│   ├── THREE.BufferGeometry (vertex data)
│   └── THREE.Material (surface appearance)
├── THREE.Group (transform hierarchy)
│   ├── THREE.Mesh
│   └── THREE.Mesh
├── THREE.PointLight
├── THREE.AmbientLight
└── THREE.Sprite

THREE.WebGLRenderer
THREE.PerspectiveCamera / THREE.OrthographicCamera
```

### Code Example: 3D Game Setup

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// --- Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// --- Ground ---
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x228b22,
  roughness: 0.8,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Load 3D Model ---
const loader = new GLTFLoader();
let playerModel: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;

loader.load('models/character.glb', (gltf) => {
  playerModel = gltf.scene;
  playerModel.scale.set(2, 2, 2);
  playerModel.castShadow = true;

  // Traverse to enable shadows on all meshes
  playerModel.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(playerModel);

  // Animation
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(playerModel);
    const idleAction = mixer.clipAction(gltf.animations[0]);
    idleAction.play();
  }
});

// --- Raycaster for click detection ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    const clickedObject = intersects[0].object;
    // Handle click on game object
  }
});

// --- Game Loop ---
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // Update animation mixer
  if (mixer) {
    mixer.update(dt);
  }

  // Update game logic
  if (playerModel) {
    // Move player based on input
  }

  renderer.render(scene, camera);
}

animate();

// --- Resize handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

### Key Concepts for Games

| Concept            | Details                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Geometry**       | `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, or custom `BufferGeometry`         |
| **Materials**      | `MeshBasicMaterial` (unlit), `MeshStandardMaterial` (PBR), `ShaderMaterial` (custom) |
| **Raycaster**      | GPU-accurate click/hover detection through the camera                                |
| **AnimationMixer** | Plays skeletal animations from GLTF/FBX models                                       |
| **InstancedMesh**  | Draw thousands of identical meshes in one draw call                                  |
| **EffectComposer** | Post-processing pipeline (bloom, SSAO, outline, etc.)                                |
| **Texture**        | Supports images, canvas, video, render targets                                       |
| **Group**          | Transform hierarchy — children inherit parent transform                              |

### Pros and Cons

**Pros:**

- Largest 3D web community and ecosystem
- Extensive examples (hundreds of official examples)
- Flexible — no assumptions about your game architecture
- Supports GLTF, FBX, OBJ, Collada, and many other formats
- Post-processing support via EffectComposer
- WebGPU renderer available (`THREE.WebGPURenderer`)
- Lightweight for a 3D library (~150KB gzipped)

**Cons:**

- Not a game engine — no physics, audio, UI, scene management
- Must integrate external libraries (cannon-es, rapier, howler.js)
- API surface is large and sometimes inconsistent
- Performance tuning requires WebGL knowledge
- No visual editor (use Blender/external tools for 3D content)

---

## Babylon.js

### Overview

Babylon.js is a complete 3D game engine for the web, developed by Microsoft. Unlike Three.js, it includes physics, audio, GUI, animation state machines, and a web-based inspector/debugger.

**Best for:** 3D games, XR/VR experiences, complex 3D applications, teams that want batteries-included.

### Architecture

```
BABYLON.Engine
├── BABYLON.Scene
│   ├── Meshes
│   │   ├── BABYLON.MeshBuilder.Create*()
│   │   └── BABYLON.SceneLoader (GLTF, GLB, Babylon)
│   ├── Cameras
│   │   ├── FreeCamera
│   │   ├── ArcRotateCamera
│   │   └── FollowCamera
│   ├── Lights
│   │   ├── DirectionalLight
│   │   ├── PointLight
│   │   └── SpotLight
│   ├── Materials
│   │   ├── StandardMaterial
│   │   ├── PBRMaterial
│   │   └── NodeMaterial (shader graph)
│   ├── Physics (Havok / Cannon / Ammo / Oimo)
│   ├── Animation System
│   │   ├── Keyframe animations
│   │   └── Animation Groups
│   ├── Particle System
│   ├── GUI (BABYLON.GUI)
│   └── Sound
└── Inspector (debugging tool)
```

### Code Example

```typescript
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { AdvancedDynamicTexture, TextBlock, Button } from '@babylonjs/gui';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new BABYLON.Engine(canvas, true);

const createScene = async (): Promise<BABYLON.Scene> => {
  const scene = new BABYLON.Scene(engine);

  // Camera
  const camera = new BABYLON.ArcRotateCamera(
    'camera',
    Math.PI / 4,
    Math.PI / 3,
    15,
    BABYLON.Vector3.Zero(),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 30;

  // Lighting
  const hemisphericLight = new BABYLON.HemisphericLight(
    'light',
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  hemisphericLight.intensity = 0.7;

  const directionalLight = new BABYLON.DirectionalLight(
    'dirLight',
    new BABYLON.Vector3(-1, -2, -1),
    scene
  );
  directionalLight.position = new BABYLON.Vector3(10, 20, 10);

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround(
    'ground',
    {
      width: 50,
      height: 50,
    },
    scene
  );

  const groundMat = new BABYLON.PBRMaterial('groundMat', scene);
  groundMat.albedoColor = new BABYLON.Color3(0.2, 0.5, 0.2);
  groundMat.roughness = 0.8;
  ground.material = groundMat;

  // Physics
  const havokInstance = await BABYLON.HavokPlugin.InitializeAsync();
  scene.enablePhysics(
    new BABYLON.Vector3(0, -9.81, 0),
    new BABYLON.HavokPlugin(true, havokInstance)
  );

  // Ground physics
  const groundAggregate = new BABYLON.PhysicsAggregate(
    ground,
    BABYLON.PhysicsShapeType.BOX,
    { mass: 0 },
    scene
  );

  // Spawn boxes
  for (let i = 0; i < 20; i++) {
    const box = BABYLON.MeshBuilder.CreateBox(`box${i}`, { size: 1 }, scene);
    box.position = new BABYLON.Vector3(
      Math.random() * 10 - 5,
      5 + Math.random() * 10,
      Math.random() * 10 - 5
    );

    const boxMat = new BABYLON.PBRMaterial(`boxMat${i}`, scene);
    boxMat.albedoColor = new BABYLON.Color3(
      Math.random(),
      Math.random(),
      Math.random()
    );
    box.material = boxMat;

    const boxAggregate = new BABYLON.PhysicsAggregate(
      box,
      BABYLON.PhysicsShapeType.BOX,
      { mass: 1, restitution: 0.5 },
      scene
    );
  }

  // GUI
  const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI');

  const scoreText = new TextBlock();
  scoreText.text = 'Score: 0';
  scoreText.color = 'white';
  scoreText.fontSize = 24;
  scoreText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
  scoreText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;
  scoreText.left = '20px';
  scoreText.top = '20px';
  advancedTexture.addControl(scoreText);

  const resetButton = Button.CreateSimpleButton('reset', 'Reset');
  resetButton.width = '150px';
  resetButton.height = '40px';
  resetButton.color = 'white';
  resetButton.background = 'green';
  resetButton.top = '-20px';
  resetButton.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM;
  resetButton.onPointerClickObservable.add(() => {
    // Reset game
  });
  advancedTexture.addControl(resetButton);

  // Inspector (debugging — remove in production)
  // scene.debugLayer.show();

  return scene;
};

createScene().then((scene) => {
  engine.runRenderLoop(() => {
    scene.render();
  });
});

window.addEventListener('resize', () => {
  engine.resize();
});
```

### Inspector

Babylon.js includes a powerful in-browser Inspector (debugger) accessible at runtime:

```typescript
// Toggle inspector
scene.debugLayer.show({
  embedMode: true,
  overlay: true,
});
```

The Inspector allows you to:

- Browse the scene graph
- Modify material properties in real time
- Inspect and edit meshes, lights, cameras
- Profile rendering performance
- Debug physics bodies and collisions
- Preview animations

### Node Material Editor

Babylon.js includes a visual shader editor (Node Material Editor) accessible at https://nme.babylonjs.com. You can create complex shaders by connecting nodes, then export them as JSON or code.

### Pros and Cons

**Pros:**

- Complete game engine: physics, audio, GUI, animation, particles, all built in
- Inspector/debugger is exceptional — best debugging experience in web 3D
- PBR materials out of the box (physically accurate rendering)
- Node Material Editor for visual shader creation
- Built-in GUI system (BABYLON.GUI)
- TypeScript-first (written in TypeScript)
- Excellent documentation and playground (live code examples)
- WebGPU support
- Backed by Microsoft

**Cons:**

- Large bundle size (~500KB+ gzipped for full engine)
- Heavier runtime than Three.js
- Smaller community than Three.js (though growing)
- Opinionated — harder to use just the renderer without the full engine
- Not suitable for playable ads (too large)

---

## Custom Engine

### When to Build Custom

Building a custom game engine makes sense when:

1. **Extreme size constraints**: Playable ads often require total assets under 2-5MB, with code under 200KB. No off-the-shelf engine fits this.
2. **Specific performance requirements**: You need optimizations that general engines can't provide (e.g., custom sprite batching with specific blend modes).
3. **Minimal feature set**: Your game only needs sprites, tweens, and input. Why ship 300KB+ of unused features?
4. **Learning**: Building an engine teaches you more about game development than any framework.

### Minimal Custom Engine Architecture

```typescript
// Minimal game engine for a playable ad
// Total: ~5-15KB minified

// === Renderer ===
class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly batcher: SpriteBatcher;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.batcher = new SpriteBatcher(gl, 1000);
  }

  begin(): void {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  drawSprite(
    texture: WebGLTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    tint: number = 0xffffff,
    alpha: number = 1
  ): void {
    this.batcher.add(texture, x, y, w, h, u0, v0, u1, v1, tint, alpha);
  }

  end(): void {
    this.batcher.flush();
  }
}

// === Tween System ===
interface Tween {
  readonly target: Record<string, number>;
  readonly property: string;
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  elapsed: number;
  readonly ease: (t: number) => number;
  readonly onComplete?: () => void;
}

class TweenManager {
  private tweens: Tween[] = [];

  to(
    target: Record<string, number>,
    property: string,
    to: number,
    duration: number,
    ease: (t: number) => number = (t) => t,
    onComplete?: () => void
  ): void {
    this.tweens.push({
      target,
      property,
      from: target[property],
      to,
      duration,
      elapsed: 0,
      ease,
      onComplete,
    });
  }

  update(dt: number): void {
    const completed: number[] = [];

    this.tweens.forEach((tween, index) => {
      tween.elapsed += dt;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      const easedT = tween.ease(t);

      tween.target[tween.property] =
        tween.from + (tween.to - tween.from) * easedT;

      if (t >= 1) {
        completed.push(index);
        tween.onComplete?.();
      }
    });

    // Remove completed tweens (iterate in reverse to maintain indices)
    for (let i = completed.length - 1; i >= 0; i--) {
      this.tweens.splice(completed[i], 1);
    }
  }
}

// === Input ===
class InputManager {
  private readonly keys: Set<string> = new Set();
  private touches: Array<{ x: number; y: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touches = Array.from(e.touches).map((t) => ({
        x: t.clientX,
        y: t.clientY,
      }));
    });

    canvas.addEventListener('touchend', (e) => {
      this.touches = Array.from(e.touches).map((t) => ({
        x: t.clientX,
        y: t.clientY,
      }));
    });
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  getTouches(): ReadonlyArray<{ x: number; y: number }> {
    return this.touches;
  }
}

// === Game Class ===
class Game {
  private readonly renderer: Renderer;
  private readonly tweens: TweenManager;
  private readonly input: InputManager;
  private readonly canvas: HTMLCanvasElement;
  private previousTime: number = 0;
  private running: boolean = false;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas);
    this.tweens = new TweenManager();
    this.input = new InputManager(this.canvas);
  }

  start(): void {
    this.running = true;
    this.previousTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    if (!this.running) return;

    const dt = Math.min((timestamp - this.previousTime) / 1000, 0.1);
    this.previousTime = timestamp;

    this.tweens.update(dt);
    this.update(dt);

    this.renderer.begin();
    this.render();
    this.renderer.end();

    requestAnimationFrame((t) => this.loop(t));
  }

  // Override in subclass
  protected update(dt: number): void {}
  protected render(): void {}
}
```

### Playable Ad Size Targets

| Component   | Budget          |
| ----------- | --------------- |
| Engine code | 10-30KB         |
| Game logic  | 5-20KB          |
| Textures    | 100-500KB       |
| Audio       | 50-200KB        |
| **Total**   | **200KB - 1MB** |

Major ad networks enforce strict size limits:

- Facebook: 2MB (single HTML file)
- Google Ads: 1MB (multi-file) or 150KB (single file)
- Unity Ads: 5MB
- ironSource: 5MB
- AppLovin: 5MB

### Pros and Cons

**Pros:**

- Smallest possible bundle size
- Exactly the features you need, nothing more
- Maximum performance (no abstraction overhead)
- Complete control over rendering pipeline
- No dependency on external project's roadmap or bugs

**Cons:**

- Significant development time
- Must solve common problems that engines already solved
- Testing burden — every feature must be tested from scratch
- Documentation burden — new team members must learn your engine
- Maintenance — you own all the bugs

---

## Comparison Table

| Feature                | Phaser 3                 | PixiJS            | PlayCanvas      | Cocos Creator    | Three.js       | Babylon.js       | Custom    |
| ---------------------- | ------------------------ | ----------------- | --------------- | ---------------- | -------------- | ---------------- | --------- |
| **Type**               | 2D Engine                | 2D Renderer       | 3D Engine       | 2D/3D Engine     | 3D Library     | 3D Engine        | Varies    |
| **Bundle Size** (gzip) | ~300KB                   | ~100KB (core)     | ~300KB          | ~500KB+          | ~150KB         | ~500KB+          | 5-30KB    |
| **2D Support**         | Excellent                | Excellent         | Limited         | Good             | Basic          | Basic            | Custom    |
| **3D Support**         | None                     | None              | Excellent       | Good             | Excellent      | Excellent        | Custom    |
| **Physics**            | Built-in (Arcade/Matter) | None              | Built-in (Ammo) | Built-in (Box2D) | None           | Built-in (Havok) | None      |
| **Audio**              | Built-in                 | None              | Built-in        | Built-in         | None           | Built-in         | None      |
| **Visual Editor**      | None                     | None              | Cloud-based     | Desktop          | None           | Inspector        | None      |
| **Shader Support**     | Limited                  | Filters           | Node-based      | Shader graph     | ShaderMaterial | Node Material    | Raw GLSL  |
| **Learning Curve**     | Low                      | Low-Medium        | Medium          | Medium           | Medium         | Medium-High      | High      |
| **Community**          | Very Large               | Large             | Medium          | Large (Asia)     | Very Large     | Medium-Large     | N/A       |
| **TypeScript**         | Types included           | Written in TS     | Types included  | First-class      | Types included | Written in TS    | Custom    |
| **Playable Ad Fit**    | Poor (too large)         | Good (tree-shake) | Good (3D)       | Poor (too large) | Possible       | Poor (too large) | Excellent |
| **License**            | MIT                      | MIT               | MIT (engine)    | MIT (engine)     | MIT            | Apache 2.0       | N/A       |

---

## Choosing for Playable Ads

Playable ads have unique constraints that make engine selection critical:

### The Size Constraint Is King

Most ad networks require the entire ad (code + assets) under 2-5MB. Some require everything in a single HTML file. The engine's gzipped bundle size directly impacts your asset budget.

### Decision Framework

```
Is it 3D?
├── Yes → Is size critical (< 2MB)?
│         ├── Yes → PlayCanvas (stripped) or Custom WebGL
│         └── No  → PlayCanvas or Babylon.js
└── No (2D) → Is size critical (< 2MB)?
              ├── Yes → Custom engine or PixiJS (tree-shaken)
              └── No  → PixiJS or Phaser (if under 5MB)
```

### Playable Ad Engine Recommendations

1. **Custom engine (best for size)**: 10-30KB engine code. Maximum control. Used by agencies that ship hundreds of playable ads.

2. **PixiJS (best balance)**: ~100KB core renderer. Tree-shakeable. Fast sprite rendering. Add only what you need (tween library, sound). Most popular choice for 2D playable ads.

3. **PlayCanvas (best for 3D)**: The engine has a build system that strips unused features. Can produce small 3D builds. Good for showcasing 3D game assets.

4. **Phaser/Cocos/Babylon (generally too large)**: These engines include too many features to strip below 2MB total budget. Possible for 5MB networks but rarely worth the overhead.

### Optimization Techniques for Playable Ads

```typescript
// 1. Inline everything into a single HTML file
// All JS, CSS, and assets (base64-encoded images) in one file

// 2. Use minimal texture formats
// - Tiny PNG/JPEG sprites (manually optimized)
// - SVG for simple graphics
// - Procedural graphics where possible

// 3. Minify aggressively
// - Terser with maximum compression
// - Remove all dead code paths
// - Short variable names (mangle)

// 4. Audio: Use tiny MP3 snippets or synthesize sounds
// Web Audio API oscillators for simple effects:
function playBeep(frequency: number, duration: number): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.value = 0.3;

  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

// 5. Texture atlas — one texture, many sprites
// Reduces HTTP requests and draw calls simultaneously
```

---

## Interview Questions

### Q1: You need to build a 2D playable ad that must be under 2MB total (single HTML file). Which engine would you choose and why?

**A:** I would choose either a **custom minimal engine** or **PixiJS** (tree-shaken), depending on complexity.

**For simple games** (match-3, tap games, merge games): A custom engine is ideal. A minimal sprite batcher + tween system + input handler can be 10-20KB. This leaves ~1.9MB for textures, audio, and game code. I'd write a tiny WebGL sprite renderer (1KB), a tween system (500B), and basic input handling (300B).

**For complex games** (many sprites, filters, complex rendering): PixiJS core rendering is ~100KB gzipped. It provides battle-tested sprite batching, texture management, and a display tree. The remaining ~1.8MB is still generous for assets.

**Why not Phaser?** At ~300KB gzipped just for the framework, it consumes 15% of the total budget before any game code or assets. For a 2MB limit, that's too much.

**Why not Three.js/Babylon.js?** These are 3D engines. For a 2D playable ad, they bring unnecessary complexity and size.

The key optimizations:

1. Inline everything into one HTML file (JS, CSS, base64-encoded images)
2. Use a single texture atlas for all sprites
3. Synthesize sound effects with Web Audio API oscillators instead of MP3 files
4. Minify with Terser (mangle, dead code elimination)
5. Compress textures aggressively (TinyPNG, reduce resolution)

---

### Q2: Compare Phaser's Arcade Physics and Matter.js Physics. When would you use each?

**A:**

**Arcade Physics:**

- AABB-only collision (axis-aligned rectangles and circles)
- No rotation, no polygon colliders
- Very fast: handles hundreds of bodies at 60fps
- Simple API: `setVelocity`, `setGravity`, `body.touching`, `body.blocked`
- Collision groups via `collider()` and `overlap()`
- Separation is basic — bodies are pushed apart along overlap axis

**Use for:** Platformers, top-down shooters, casual games, match-3, puzzle games — any game where precise polygon collision isn't needed.

**Matter.js Physics:**

- Full rigid body simulation: polygon colliders, rotation, friction, restitution
- Joints and constraints (springs, hinges, distance joints)
- Compound bodies (multiple shapes attached to one body)
- Continuous collision detection (CCD) for fast objects
- Heavier: handles tens of bodies comfortably, hundreds with care

**Use for:** Physics puzzles (Angry Birds-style), ragdolls, vehicles, anything requiring realistic physical behavior.

**Decision rule:** Start with Arcade Physics. Only switch to Matter.js when you need one of: polygon colliders, rotation physics, joints/constraints, or compound bodies. The performance difference is significant — Arcade can handle 5-10x more bodies.

---

### Q3: Explain the Entity-Component System (ECS) pattern. How does it differ from traditional OOP game object hierarchies?

**A:**

**Traditional OOP (inheritance):**

```
GameObject
├── Character (has health, inventory)
│   ├── Player (has input)
│   └── NPC (has AI)
├── Projectile (has velocity, damage)
└── Pickup (has effect)
```

Problems:

- **Diamond inheritance**: What if a "PossessedEnemy" needs both Player input and NPC AI?
- **Rigid hierarchy**: Adding a new combination of behaviors requires new classes
- **Bloated base class**: Common functionality gets pushed up into `GameObject`, making it huge

**ECS (composition):**

```
Entity: just an ID (e.g., number)

Components: pure data (no behavior)
- PositionComponent { x, y }
- VelocityComponent { vx, vy }
- SpriteComponent { texture, width, height }
- HealthComponent { current, max }
- InputComponent { left, right, jump }
- AIComponent { state, target }

Systems: pure behavior (no state)
- MovementSystem: queries entities with Position + Velocity, updates positions
- RenderSystem: queries entities with Position + Sprite, draws them
- InputSystem: queries entities with Input, reads keyboard/touch
- AISystem: queries entities with AI + Position, runs AI logic
- HealthSystem: queries entities with Health, handles death
```

**Key advantages of ECS:**

1. **Composition over inheritance**: Any combination of components creates a new entity type without new classes
2. **Data-oriented design**: Components are stored in contiguous arrays — cache-friendly, fast iteration
3. **Decoupled systems**: Systems don't depend on each other, can be added/removed independently
4. **Easy serialization**: Components are plain data — trivial to save/load/network

**Real example:** PlayCanvas uses ECS. You create an Entity, add components (`model`, `rigidbody`, `collision`, `script`), and systems process them automatically. This is why PlayCanvas is a "data-driven" engine.

---

### Q4: How does PixiJS differ from Phaser? When would you choose one over the other?

**A:**

**PixiJS is a rendering engine.** It draws things on screen — sprites, graphics, text, filters — and does it extremely well. It provides a display tree (scene graph), event system, and asset loader. It does NOT provide:

- Physics
- Audio management
- Scene/state management
- Game object lifecycle
- Tween system (separate library needed)
- Collision detection
- Input abstraction beyond pointer events

**Phaser is a game framework.** It includes PixiJS-level rendering (Phaser has its own renderer now, historically used PixiJS) PLUS all the game systems listed above.

**Choose PixiJS when:**

- Building a custom game engine (you want rendering + your own architecture)
- Size matters (playable ads, lightweight games)
- You only need rendering and will add other systems yourself
- You want maximum rendering performance and flexibility
- You're building an interactive visualization, not a traditional game

**Choose Phaser when:**

- You want to build a complete game quickly
- You need built-in physics, audio, tweens, and scene management
- Bundle size isn't critical (> 5MB budget)
- You're learning game development (Phaser's API is well-documented)
- You need a large community for support

**An analogy:** PixiJS is like React (a rendering library — you choose your state management, routing, etc.). Phaser is like Next.js (a complete framework with opinions about everything).

---

### Q5: What is a scene graph? How does it relate to game rendering?

**A:** A scene graph is a tree data structure that organizes all visual objects in a scene. Each node has a transform (position, rotation, scale) that is inherited by its children.

```
Stage (root)
├── GameWorld (x: 100, y: 50)
│   ├── Player (x: 200, y: 300)
│   │   ├── Weapon (x: 30, y: -10)   → world position: 330, 340
│   │   └── HealthBar (x: 0, y: -20) → world position: 300, 330
│   └── Enemy (x: 500, y: 300)
└── UILayer
    ├── ScoreText
    └── MenuButton
```

**How transforms compose:**
The Player's world position is `(100+200, 50+300) = (300, 350)`. The Weapon's world position is `(300+30, 350-10) = (330, 340)`. If the GameWorld moves (e.g., camera scrolling), all children move with it.

**Rendering order:**
The scene graph is traversed depth-first. Children render on top of parents. Siblings render in order (first added = drawn first = behind later siblings).

**Game-specific usage:**

- **Camera**: Instead of moving every object, move the GameWorld container in the opposite direction. `gameWorld.x = -cameraX`.
- **Layers**: Create Container nodes for background, game objects, particles, UI. Each layer can be independently sorted, filtered, or transformed.
- **Parenting**: Attach a weapon to a character — when the character moves/rotates, the weapon follows automatically.
- **Culling**: Skip rendering entire sub-trees that are offscreen by checking the parent container's bounds.

PixiJS, Three.js, Phaser, Cocos, and Babylon all use scene graphs. PlayCanvas also uses a scene graph but with ECS — the entity hierarchy serves as the scene graph, and the render component determines what gets drawn.

---

### Q6: How would you implement a camera system for a 2D game using PixiJS?

**A:** In PixiJS (and most 2D scene-graph engines), there's no dedicated camera object. Instead, you simulate a camera by transforming the game world container.

```typescript
class Camera2D {
  private readonly world: PIXI.Container;
  private readonly screenWidth: number;
  private readonly screenHeight: number;

  // Camera state
  private x: number = 0;
  private y: number = 0;
  private zoom: number = 1;
  private rotation: number = 0;

  // Bounds (optional — restrict camera to level area)
  private bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null = null;

  constructor(
    world: PIXI.Container,
    screenWidth: number,
    screenHeight: number
  ) {
    this.world = world;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.bounds = { minX, minY, maxX, maxY };
  }

  follow(targetX: number, targetY: number, dt: number): void {
    // Smooth follow using frame-rate independent lerp
    const halfLife = 0.15; // seconds
    const factor = 1 - Math.pow(0.5, dt / halfLife);

    this.x += (targetX - this.x) * factor;
    this.y += (targetY - this.y) * factor;

    // Clamp to bounds
    if (this.bounds) {
      const halfW = this.screenWidth / 2 / this.zoom;
      const halfH = this.screenHeight / 2 / this.zoom;

      this.x = Math.max(
        this.bounds.minX + halfW,
        Math.min(this.bounds.maxX - halfW, this.x)
      );
      this.y = Math.max(
        this.bounds.minY + halfH,
        Math.min(this.bounds.maxY - halfH, this.y)
      );
    }
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.1, Math.min(5, zoom));
  }

  apply(): void {
    // Transform the world container to simulate camera
    this.world.x = this.screenWidth / 2 - this.x * this.zoom;
    this.world.y = this.screenHeight / 2 - this.y * this.zoom;
    this.world.scale.set(this.zoom);
    this.world.rotation = -this.rotation;
  }

  // Convert screen coordinates to world coordinates (for click handling)
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.world.x) / this.zoom,
      y: (screenY - this.world.y) / this.zoom,
    };
  }
}

// Usage
const camera = new Camera2D(gameWorld, 800, 600);
camera.setBounds(0, 0, levelWidth, levelHeight);

app.ticker.add((ticker) => {
  const dt = ticker.deltaMS / 1000;
  camera.follow(player.x, player.y, dt);
  camera.apply();
});
```

The key insight is that moving the camera left is the same as moving the entire world right. The camera never moves — the world moves in the opposite direction.

---

### Q7: Describe the trade-offs between using Three.js and Babylon.js for a 3D web game.

**A:**

| Aspect                | Three.js                                          | Babylon.js                        |
| --------------------- | ------------------------------------------------- | --------------------------------- |
| **Philosophy**        | Library — minimal, flexible                       | Engine — batteries-included       |
| **Bundle size**       | ~150KB gzip                                       | ~500KB+ gzip                      |
| **Physics**           | External (cannon-es, rapier)                      | Built-in (Havok, Cannon, Ammo)    |
| **Audio**             | External (howler.js, Web Audio)                   | Built-in                          |
| **GUI/UI**            | External or HTML overlay                          | Built-in (BABYLON.GUI)            |
| **Debugging**         | Chrome DevTools, Spector.js                       | Built-in Inspector (excellent)    |
| **Shader authoring**  | `ShaderMaterial` (GLSL)                           | Node Material Editor (visual)     |
| **Animation**         | AnimationMixer (basic state)                      | Animation Groups + state machine  |
| **Community size**    | Larger (more GitHub stars, examples)              | Smaller but very active           |
| **Documentation**     | Good but scattered                                | Excellent (Playground, docs site) |
| **Corporate backing** | Community-driven (Ricardo Cabello + contributors) | Microsoft                         |
| **XR/VR support**     | WebXR API integration                             | First-class XR support            |

**Choose Three.js when:**

- You want a lightweight foundation and will build/integrate your own systems
- You need maximum control over the rendering pipeline
- Bundle size matters
- You prefer choosing your own physics/audio/UI libraries
- Your project is more visualization than game

**Choose Babylon.js when:**

- You want everything in one package (physics, audio, GUI, particles)
- You need a debugging Inspector (Babylon's is unmatched)
- You're building a complete 3D game, not just a 3D scene
- You want visual shader editing (Node Material Editor)
- Your team prefers TypeScript (Babylon is written in TypeScript)
- XR/VR is a requirement

**My recommendation:** For a game that needs physics, audio, and UI, Babylon.js saves significant integration time. For a 3D visualization or experience where you need rendering flexibility, Three.js is more appropriate.

---

### Q8: How does PlayCanvas's ECS differ from Unity's component system?

**A:** They share the same high-level concept (entities with attached components processed by systems) but differ in implementation:

**PlayCanvas:**

- Components are engine-provided types (`model`, `rigidbody`, `collision`, `camera`, `light`, `script`, `animation`)
- Custom behavior is added via "Script" components — JavaScript/TypeScript classes with `initialize()`, `update()`, `postUpdate()`
- Entity hierarchy doubles as the scene graph
- No custom component types — everything custom goes through Script
- Data is stored on components directly (not in separate data stores)

**Unity:**

- Components can be any C# class extending `MonoBehaviour`
- Each component has its own `Start()`, `Update()`, `FixedUpdate()`
- Transforms are implicit (every GameObject has a Transform)
- Full custom component support — create any component type
- Unity DOTS (Data-Oriented Technology Stack) adds a "pure ECS" with separate data stores, burst compilation, and job system for high performance

**Key difference:** PlayCanvas is closer to "Entity-Component" than full "Entity-Component-System." Behavior lives on script components rather than in separate systems. Unity's traditional `MonoBehaviour` pattern is similar — behavior is on the component, not in a system.

True ECS (as in Unity DOTS or libraries like bitecs for JavaScript) separates:

- **Entities**: just IDs
- **Components**: pure data, no behavior, stored in contiguous arrays
- **Systems**: functions that operate on sets of entities matching component queries

PlayCanvas and Unity-classic both blur the line between components and systems by putting behavior on components.

---

### Q9: You're building a web-based strategy game with hundreds of units on screen. Which engine/approach would you take?

**A:** For a strategy game with hundreds of units, the key challenges are:

1. **Rendering hundreds of sprites efficiently** — need good batching
2. **Updating hundreds of AI agents** — CPU budget for pathfinding, decision-making
3. **Handling click/hover on many units** — efficient spatial queries

**My approach:**

**Rendering:** PixiJS with a custom game layer. PixiJS's batch renderer handles thousands of sprites in minimal draw calls. Use a single texture atlas for all unit types. For 3D strategy, Three.js with `InstancedMesh` draws hundreds of identical meshes in one draw call.

**Game logic:** Custom ECS architecture (not an engine's built-in one). Use a library like `bitecs` for cache-friendly, data-oriented entity storage. Components stored in typed arrays:

```typescript
// Data-oriented storage for 1000 units
const positions = new Float32Array(1000 * 2); // x, y
const velocities = new Float32Array(1000 * 2); // vx, vy
const healths = new Float32Array(1000); // current health
const unitTypes = new Uint8Array(1000); // type enum
const aiStates = new Uint8Array(1000); // state enum

// Movement system — processes all units in a tight loop
function movementSystem(count: number, dt: number): void {
  for (let i = 0; i < count; i++) {
    const idx = i * 2;
    positions[idx] += velocities[idx] * dt;
    positions[idx + 1] += velocities[idx + 1] * dt;
  }
}
```

**Spatial partitioning:** Use a grid or quadtree for collision detection and mouse picking. Without spatial partitioning, checking 500 units against each other is O(n^2) = 250,000 checks per frame.

**AI amortization:** Don't update all AI every frame. Update 50 units' AI per frame across a 10-frame cycle (all 500 updated once every 10 frames = ~167ms). Fast reactions use a simple per-frame check; complex pathfinding is amortized.

I would NOT use Phaser (too heavy, Arcade physics isn't designed for this), Babylon/PlayCanvas (3D overhead not needed for 2D strategy), or Cocos (too opinionated for this use case).

---

### Q10: What is a "ticker" in the context of PixiJS, and how does it relate to the game loop?

**A:** The PixiJS `Ticker` is a lightweight game loop manager. It wraps `requestAnimationFrame` and provides timing information to registered callbacks.

```typescript
// PixiJS Ticker usage
app.ticker.add((ticker) => {
  const deltaTime = ticker.deltaTime; // Normalized: 1.0 at target FPS (default 60)
  const deltaMS = ticker.deltaMS; // Actual milliseconds since last frame
  const elapsedMS = ticker.elapsedMS; // Total elapsed time
  const FPS = ticker.FPS; // Current frames per second

  // Game logic here
  sprite.x += speed * (deltaMS / 1000);
});
```

**How it works internally:**

1. `Ticker` calls `requestAnimationFrame` in a loop
2. On each frame, it calculates delta time from the previous frame
3. It iterates through all registered callbacks (listeners) in priority order
4. Each callback receives the `Ticker` instance with timing data

**Key properties:**

- `ticker.speed`: Time scale multiplier (default 1.0). Set to 0 for pause, 0.5 for slow motion.
- `ticker.maxFPS`: Cap the frame rate (e.g., 30 for mobile).
- `ticker.minFPS`: Set minimum FPS for delta time capping (prevents huge dt values).
- Priority: `ticker.add(fn, context, priority)` — lower priority runs first.

**Relation to game loop:**
The Ticker IS the game loop in a PixiJS-only project. If you have your own game loop (fixed timestep with accumulator), you should stop the PixiJS ticker and call `app.renderer.render(app.stage)` manually:

```typescript
app.ticker.stop();

function myGameLoop(timestamp: number): void {
  // Your custom timing, physics, etc.
  myUpdate(dt);
  app.renderer.render(app.stage); // Tell PixiJS to render
  requestAnimationFrame(myGameLoop);
}
```

This gives you full control over timing while still using PixiJS for rendering.

---

### Q11: How does Phaser's Scene system work? What are the lifecycle methods?

**A:** Phaser organizes gameplay into Scenes. Each Scene is an independent game state with its own lifecycle, game objects, physics world, and update loop. Scenes can run in parallel (e.g., game scene + HUD scene overlay).

**Lifecycle methods (in execution order):**

```typescript
class MyScene extends Phaser.Scene {
  // 1. init() — Runs first. Receives data passed from previous scene.
  init(data: { level: number }): void {
    this.level = data.level;
  }

  // 2. preload() — Load assets. Runs before create.
  preload(): void {
    this.load.image('player', 'assets/player.png');
    this.load.audio('bgm', 'assets/music.mp3');
  }

  // 3. create() — Set up game objects. Runs once after preload.
  create(): void {
    this.player = this.add.sprite(100, 100, 'player');
    this.physics.add.existing(this.player);
  }

  // 4. update(time, delta) — Runs every frame during gameplay.
  update(time: number, delta: number): void {
    // time: total elapsed ms since game start
    // delta: ms since last frame
    this.player.x += this.speed * (delta / 1000);
  }
}
```

**Scene transitions:**

```typescript
// Switch to another scene (stops current, starts new)
this.scene.start('GameOverScene', { score: this.score });

// Launch a scene in parallel (both run simultaneously)
this.scene.launch('HUDScene');

// Pause/resume
this.scene.pause('GameScene');
this.scene.resume('GameScene');

// Stop (destroys scene state)
this.scene.stop('MenuScene');

// Restart current scene
this.scene.restart();
```

Scenes running in parallel share the same game canvas. The rendering order follows the scene list order — later scenes render on top. This is how you implement HUD overlays, pause menus, and dialog boxes without stopping the game scene.

---

### Q12: What considerations are important when choosing a game engine for a project that needs to support both desktop and mobile browsers?

**A:**

1. **Performance on low-end mobile devices:**

   - Test on real devices, not just Chrome DevTools mobile emulation
   - Mobile GPUs are 5-10x weaker than desktop — reduce draw calls, texture sizes, particle counts
   - Consider targeting 30fps on mobile, 60fps on desktop
   - Avoid heavy shaders (blur, glow) on mobile or provide fallbacks

2. **Input abstraction:**

   - Desktop: keyboard + mouse (hover, right-click, scroll wheel)
   - Mobile: touch (multi-touch, gestures, no hover)
   - The engine must support both or have good input abstraction
   - Phaser, PlayCanvas, Cocos all handle this well. PixiJS/Three.js require more manual work.

3. **Screen resolution and aspect ratio:**

   - Mobile screens vary wildly (4:3 iPads, 19.5:9 phones, landscape/portrait)
   - The engine needs responsive layout support or you must implement it
   - Common approach: design for a reference resolution, scale to fit with letterboxing

4. **Memory constraints:**

   - Mobile Safari limits web content to ~1.5GB memory
   - Texture memory is especially limited — use smaller atlases, compressed textures
   - Monitor `performance.memory` (Chrome only) or watch for context loss

5. **Audio differences:**

   - Mobile browsers require user gesture to start audio (autoplay policy)
   - iOS Safari has specific WebAudio quirks (must resume AudioContext on touch)
   - The engine should handle these platform differences

6. **Bundle size:**

   - Mobile users may be on slow networks
   - Smaller engine + assets = faster load time = lower bounce rate
   - Consider lazy loading non-essential assets

7. **WebGL support:**
   - WebGL2 support on mobile: ~90%+ (good but not universal)
   - Always have a WebGL1 fallback or test WebGL2 availability
   - Some older Android WebViews have buggy WebGL

Phaser and Cocos Creator handle most of these automatically. PixiJS and Three.js require more manual work but give more control. Custom engines require solving all of these yourself.
