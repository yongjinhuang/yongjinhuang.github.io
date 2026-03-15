# Game Design Patterns

## Table of Contents

1. [State Machine (FSM)](#state-machine-fsm)
2. [Entity-Component-System (ECS)](#entity-component-system-ecs)
3. [Object Pooling](#object-pooling)
4. [Observer / Event System](#observer--event-system)
5. [Command Pattern](#command-pattern)
6. [Flyweight Pattern](#flyweight-pattern)
7. [Scene Graph](#scene-graph)
8. [Service Locator](#service-locator)
9. [Game Loop Patterns](#game-loop-patterns)
10. [Spatial Partitioning](#spatial-partitioning)
11. [Interview Questions](#interview-questions)

---

## State Machine (FSM)

A Finite State Machine defines a set of states, the transitions between them, and the actions performed in each state. FSMs are foundational to game development -- they model everything from game screens to character behavior to UI flows.

### Basic FSM

```typescript
type StateId = string;

interface State {
  id: StateId;
  enter?: () => void;
  exit?: () => void;
  update?: (dt: number) => void;
}

class StateMachine {
  private states: Map<StateId, State> = new Map();
  private currentState: State | null = null;

  addState(state: State): void {
    this.states.set(state.id, state);
  }

  transition(stateId: StateId): void {
    const nextState = this.states.get(stateId);
    if (!nextState) {
      throw new Error(`State "${stateId}" not found`);
    }

    if (this.currentState) {
      this.currentState.exit?.();
    }

    this.currentState = nextState;
    this.currentState.enter?.();
  }

  update(dt: number): void {
    this.currentState?.update?.(dt);
  }

  getCurrentStateId(): StateId | null {
    return this.currentState?.id ?? null;
  }
}
```

### Game State Machine

```typescript
// Managing high-level game states: Loading, Menu, Playing, Paused, GameOver
class GameStateMachine {
  private fsm: StateMachine;

  constructor(
    private game: {
      showMenu: () => void;
      hideMenu: () => void;
      startGameplay: () => void;
      pauseGameplay: () => void;
      resumeGameplay: () => void;
      showGameOver: (score: number) => void;
      updateGameplay: (dt: number) => void;
      loadAssets: () => Promise<void>;
    }
  ) {
    this.fsm = new StateMachine();

    this.fsm.addState({
      id: 'loading',
      enter: () => {
        this.game.loadAssets().then(() => {
          this.fsm.transition('menu');
        });
      },
    });

    this.fsm.addState({
      id: 'menu',
      enter: () => this.game.showMenu(),
      exit: () => this.game.hideMenu(),
    });

    this.fsm.addState({
      id: 'playing',
      enter: () => this.game.startGameplay(),
      update: (dt: number) => this.game.updateGameplay(dt),
    });

    this.fsm.addState({
      id: 'paused',
      enter: () => this.game.pauseGameplay(),
      exit: () => this.game.resumeGameplay(),
    });

    this.fsm.addState({
      id: 'gameover',
      enter: () => this.game.showGameOver(0),
    });

    this.fsm.transition('loading');
  }

  play(): void {
    this.fsm.transition('playing');
  }

  pause(): void {
    if (this.fsm.getCurrentStateId() === 'playing') {
      this.fsm.transition('paused');
    }
  }

  resume(): void {
    if (this.fsm.getCurrentStateId() === 'paused') {
      this.fsm.transition('playing');
    }
  }

  gameOver(): void {
    this.fsm.transition('gameover');
  }

  backToMenu(): void {
    this.fsm.transition('menu');
  }

  update(dt: number): void {
    this.fsm.update(dt);
  }
}
```

### Character State Machine

```typescript
interface CharacterContext {
  velocity: { x: number; y: number };
  isGrounded: boolean;
  health: number;
  input: {
    left: boolean;
    right: boolean;
    jump: boolean;
    attack: boolean;
  };
  playAnimation: (name: string) => void;
  applyForce: (x: number, y: number) => void;
}

class CharacterFSM {
  private fsm: StateMachine;
  private ctx: CharacterContext;

  constructor(ctx: CharacterContext) {
    this.ctx = ctx;
    this.fsm = new StateMachine();

    this.fsm.addState({
      id: 'idle',
      enter: () => ctx.playAnimation('idle'),
      update: () => {
        if (!ctx.isGrounded) {
          this.fsm.transition('falling');
        } else if (ctx.input.jump) {
          this.fsm.transition('jumping');
        } else if (ctx.input.left || ctx.input.right) {
          this.fsm.transition('running');
        } else if (ctx.input.attack) {
          this.fsm.transition('attacking');
        }
      },
    });

    this.fsm.addState({
      id: 'running',
      enter: () => ctx.playAnimation('run'),
      update: (dt: number) => {
        const dir = ctx.input.right ? 1 : ctx.input.left ? -1 : 0;
        ctx.applyForce(dir * 500 * dt, 0);

        if (!ctx.isGrounded) {
          this.fsm.transition('falling');
        } else if (ctx.input.jump) {
          this.fsm.transition('jumping');
        } else if (dir === 0) {
          this.fsm.transition('idle');
        } else if (ctx.input.attack) {
          this.fsm.transition('attacking');
        }
      },
    });

    this.fsm.addState({
      id: 'jumping',
      enter: () => {
        ctx.playAnimation('jump');
        ctx.applyForce(0, -800);
      },
      update: () => {
        if (ctx.velocity.y > 0) {
          this.fsm.transition('falling');
        }
      },
    });

    this.fsm.addState({
      id: 'falling',
      enter: () => ctx.playAnimation('fall'),
      update: () => {
        if (ctx.isGrounded) {
          this.fsm.transition('idle');
        }
      },
    });

    this.fsm.addState({
      id: 'attacking',
      enter: () => ctx.playAnimation('attack'),
      update: () => {
        // Transition back to idle after attack animation completes
        // In practice, use animation events or timers
      },
    });

    this.fsm.addState({
      id: 'dead',
      enter: () => ctx.playAnimation('death'),
    });

    this.fsm.transition('idle');
  }

  update(dt: number): void {
    if (this.ctx.health <= 0 && this.fsm.getCurrentStateId() !== 'dead') {
      this.fsm.transition('dead');
      return;
    }
    this.fsm.update(dt);
  }
}
```

### Hierarchical State Machine (HFSM)

A hierarchical FSM allows states to contain sub-states. A "Combat" state might have sub-states like "Melee", "Ranged", "Blocking".

```typescript
interface HierarchicalState {
  id: StateId;
  parent?: StateId;
  enter?: () => void;
  exit?: () => void;
  update?: (dt: number) => void;
}

class HierarchicalStateMachine {
  private states: Map<StateId, HierarchicalState> = new Map();
  private activeStates: StateId[] = []; // Stack: [root, child, grandchild]

  addState(state: HierarchicalState): void {
    this.states.set(state.id, state);
  }

  private getAncestors(stateId: StateId): StateId[] {
    const ancestors: StateId[] = [];
    let current = this.states.get(stateId);
    while (current) {
      ancestors.unshift(current.id);
      current = current.parent
        ? this.states.get(current.parent)
        : undefined;
    }
    return ancestors;
  }

  transition(stateId: StateId): void {
    const targetAncestors = this.getAncestors(stateId);

    // Find common ancestor
    let commonDepth = 0;
    while (
      commonDepth < this.activeStates.length &&
      commonDepth < targetAncestors.length &&
      this.activeStates[commonDepth] === targetAncestors[commonDepth]
    ) {
      commonDepth++;
    }

    // Exit states from current leaf up to common ancestor
    for (let i = this.activeStates.length - 1; i >= commonDepth; i--) {
      this.states.get(this.activeStates[i])?.exit?.();
    }

    // Enter states from common ancestor down to target
    for (let i = commonDepth; i < targetAncestors.length; i++) {
      this.states.get(targetAncestors[i])?.enter?.();
    }

    this.activeStates = targetAncestors;
  }

  update(dt: number): void {
    // Update from leaf to root (most specific first)
    for (let i = this.activeStates.length - 1; i >= 0; i--) {
      this.states.get(this.activeStates[i])?.update?.(dt);
    }
  }

  isInState(stateId: StateId): boolean {
    return this.activeStates.includes(stateId);
  }
}

// Usage: Character with hierarchical states
const hfsm = new HierarchicalStateMachine();

hfsm.addState({ id: 'alive' });
hfsm.addState({ id: 'grounded', parent: 'alive' });
hfsm.addState({ id: 'idle', parent: 'grounded' });
hfsm.addState({ id: 'running', parent: 'grounded' });
hfsm.addState({ id: 'airborne', parent: 'alive' });
hfsm.addState({ id: 'jumping', parent: 'airborne' });
hfsm.addState({ id: 'falling', parent: 'airborne' });
hfsm.addState({ id: 'dead' });

hfsm.transition('idle');
// Active: [alive, grounded, idle]

hfsm.transition('jumping');
// Exits: idle, grounded
// Enters: airborne, jumping
// Active: [alive, airborne, jumping]

hfsm.isInState('alive');    // true
hfsm.isInState('airborne'); // true
hfsm.isInState('jumping');  // true
hfsm.isInState('grounded'); // false
```

---

## Entity-Component-System (ECS)

ECS separates data from behavior and composes entities from reusable components. This is the dominant architecture pattern for non-trivial games.

**Entities** are just unique IDs. **Components** are pure data (no logic). **Systems** contain all the logic and operate on entities that have specific component combinations.

### Why ECS?

| Traditional OOP | ECS |
|----------------|-----|
| Deep inheritance hierarchies | Flat composition |
| "Diamond problem" with multiple inheritance | Mix any components freely |
| Methods scattered across class tree | Logic centralized in systems |
| Hard to add new behaviors | Add a component, done |
| Poor cache performance | Data-oriented, cache-friendly |

### Basic ECS Implementation

```typescript
// Entity is just a number
type Entity = number;

// Component types
interface Position {
  x: number;
  y: number;
}

interface Velocity {
  vx: number;
  vy: number;
}

interface Sprite {
  texture: string;
  width: number;
  height: number;
  rotation: number;
}

interface Health {
  current: number;
  max: number;
}

interface Collider {
  width: number;
  height: number;
  layer: string;
}

interface AIControlled {
  behavior: 'patrol' | 'chase' | 'flee';
  target: Entity | null;
  detectionRange: number;
}

// Component storage
class ComponentStore<T> {
  private data: Map<Entity, T> = new Map();

  set(entity: Entity, component: T): void {
    this.data.set(entity, component);
  }

  get(entity: Entity): T | undefined {
    return this.data.get(entity);
  }

  has(entity: Entity): boolean {
    return this.data.has(entity);
  }

  remove(entity: Entity): void {
    this.data.delete(entity);
  }

  entries(): IterableIterator<[Entity, T]> {
    return this.data.entries();
  }

  entities(): IterableIterator<Entity> {
    return this.data.keys();
  }
}

// World manages entities and components
class World {
  private nextEntity: Entity = 0;
  private alive: Set<Entity> = new Set();

  readonly position = new ComponentStore<Position>();
  readonly velocity = new ComponentStore<Velocity>();
  readonly sprite = new ComponentStore<Sprite>();
  readonly health = new ComponentStore<Health>();
  readonly collider = new ComponentStore<Collider>();
  readonly ai = new ComponentStore<AIControlled>();

  createEntity(): Entity {
    const entity = this.nextEntity++;
    this.alive.add(entity);
    return entity;
  }

  destroyEntity(entity: Entity): void {
    this.alive.delete(entity);
    this.position.remove(entity);
    this.velocity.remove(entity);
    this.sprite.remove(entity);
    this.health.remove(entity);
    this.collider.remove(entity);
    this.ai.remove(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }
}
```

### Systems

```typescript
// System interface
interface System {
  update(world: World, dt: number): void;
}

// Movement system: operates on entities with Position + Velocity
class MovementSystem implements System {
  update(world: World, dt: number): void {
    for (const [entity, vel] of world.velocity.entries()) {
      const pos = world.position.get(entity);
      if (!pos) continue;

      // Create new position (immutable update)
      world.position.set(entity, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });
    }
  }
}

// Gravity system: applies gravity to entities with Velocity
class GravitySystem implements System {
  private gravity: number = 980;

  update(world: World, dt: number): void {
    for (const [entity, vel] of world.velocity.entries()) {
      world.velocity.set(entity, {
        ...vel,
        vy: vel.vy + this.gravity * dt,
      });
    }
  }
}

// Render system: draws entities with Position + Sprite
class RenderSystem implements System {
  private ctx: CanvasRenderingContext2D;
  private textures: Map<string, HTMLImageElement> = new Map();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  update(world: World, _dt: number): void {
    for (const [entity, spr] of world.sprite.entries()) {
      const pos = world.position.get(entity);
      if (!pos) continue;

      const texture = this.textures.get(spr.texture);
      if (!texture) continue;

      this.ctx.save();
      this.ctx.translate(pos.x, pos.y);
      this.ctx.rotate(spr.rotation);
      this.ctx.drawImage(
        texture,
        -spr.width / 2, -spr.height / 2,
        spr.width, spr.height
      );
      this.ctx.restore();
    }
  }
}

// Health system: destroys dead entities
class HealthSystem implements System {
  update(world: World, _dt: number): void {
    const toDestroy: Entity[] = [];

    for (const [entity, hp] of world.health.entries()) {
      if (hp.current <= 0) {
        toDestroy.push(entity);
      }
    }

    toDestroy.forEach(entity => world.destroyEntity(entity));
  }
}

// AI system
class AISystem implements System {
  update(world: World, dt: number): void {
    for (const [entity, ai] of world.ai.entries()) {
      const pos = world.position.get(entity);
      const vel = world.velocity.get(entity);
      if (!pos || !vel) continue;

      switch (ai.behavior) {
        case 'patrol':
          this.patrol(world, entity, pos, vel, dt);
          break;
        case 'chase':
          this.chase(world, entity, pos, vel, ai, dt);
          break;
        case 'flee':
          this.flee(world, entity, pos, vel, ai, dt);
          break;
      }
    }
  }

  private patrol(
    _world: World,
    _entity: Entity,
    _pos: Position,
    vel: Velocity,
    _dt: number
  ): void {
    // Simple back-and-forth patrol
    if (Math.abs(vel.vx) < 0.1) {
      _world.velocity.set(_entity, { ...vel, vx: 100 });
    }
  }

  private chase(
    world: World,
    entity: Entity,
    pos: Position,
    vel: Velocity,
    ai: AIControlled,
    _dt: number
  ): void {
    if (ai.target === null) return;
    const targetPos = world.position.get(ai.target);
    if (!targetPos) return;

    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ai.detectionRange && dist > 0) {
      const speed = 150;
      world.velocity.set(entity, {
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
      });
    }
  }

  private flee(
    world: World,
    entity: Entity,
    pos: Position,
    vel: Velocity,
    ai: AIControlled,
    _dt: number
  ): void {
    if (ai.target === null) return;
    const targetPos = world.position.get(ai.target);
    if (!targetPos) return;

    const dx = pos.x - targetPos.x;
    const dy = pos.y - targetPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ai.detectionRange && dist > 0) {
      const speed = 200;
      world.velocity.set(entity, {
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
      });
    }
  }
}
```

### Game Loop with ECS

```typescript
class Game {
  private world: World;
  private systems: System[];

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World();
    const ctx = canvas.getContext('2d')!;

    this.systems = [
      new GravitySystem(),
      new AISystem(),
      new MovementSystem(),
      new HealthSystem(),
      new RenderSystem(ctx),
    ];

    // Create entities
    this.createPlayer();
    this.createEnemy(400, 200);
    this.createEnemy(600, 100);
  }

  private createPlayer(): Entity {
    const player = this.world.createEntity();
    this.world.position.set(player, { x: 100, y: 300 });
    this.world.velocity.set(player, { vx: 0, vy: 0 });
    this.world.sprite.set(player, {
      texture: 'player',
      width: 32,
      height: 48,
      rotation: 0,
    });
    this.world.health.set(player, { current: 100, max: 100 });
    this.world.collider.set(player, {
      width: 32,
      height: 48,
      layer: 'player',
    });
    return player;
  }

  private createEnemy(x: number, y: number): Entity {
    const enemy = this.world.createEntity();
    this.world.position.set(enemy, { x, y });
    this.world.velocity.set(enemy, { vx: 0, vy: 0 });
    this.world.sprite.set(enemy, {
      texture: 'enemy',
      width: 32,
      height: 32,
      rotation: 0,
    });
    this.world.health.set(enemy, { current: 50, max: 50 });
    this.world.collider.set(enemy, {
      width: 32,
      height: 32,
      layer: 'enemy',
    });
    this.world.ai.set(enemy, {
      behavior: 'patrol',
      target: null,
      detectionRange: 200,
    });
    return enemy;
  }

  update(dt: number): void {
    this.systems.forEach(system => system.update(this.world, dt));
  }
}
```

---

## Object Pooling

Object pooling pre-allocates a fixed number of objects and reuses them instead of creating and destroying objects at runtime. This avoids garbage collection pauses, which cause frame drops.

### Array-Based Object Pool

```typescript
interface Poolable {
  active: boolean;
  reset(): void;
}

class ObjectPool<T extends Poolable> {
  private pool: T[];
  private activeCount: number = 0;

  constructor(
    private factory: () => T,
    initialSize: number
  ) {
    this.pool = Array.from({ length: initialSize }, () => {
      const obj = factory();
      obj.active = false;
      return obj;
    });
  }

  acquire(): T | null {
    // Find first inactive object
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.pool[i].active = true;
        this.pool[i].reset();
        this.activeCount++;
        return this.pool[i];
      }
    }
    return null; // Pool exhausted
  }

  release(obj: T): void {
    if (obj.active) {
      obj.active = false;
      this.activeCount--;
    }
  }

  releaseAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
    }
    this.activeCount = 0;
  }

  forEach(callback: (obj: T) => void): void {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) {
        callback(this.pool[i]);
      }
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getCapacity(): number {
    return this.pool.length;
  }
}
```

### Bullet Pool Example

```typescript
class Bullet implements Poolable {
  active: boolean = false;
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  damage: number = 10;
  lifetime: number = 0;
  maxLifetime: number = 2;

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.damage = 10;
    this.lifetime = 0;
    this.maxLifetime = 2;
  }

  init(x: number, y: number, angle: number, speed: number): void {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.lifetime = 0;
  }
}

class BulletSystem {
  private pool: ObjectPool<Bullet>;

  constructor(poolSize: number = 200) {
    this.pool = new ObjectPool(() => new Bullet(), poolSize);
  }

  fire(x: number, y: number, angle: number, speed: number = 500): void {
    const bullet = this.pool.acquire();
    if (bullet) {
      bullet.init(x, y, angle, speed);
    }
  }

  update(dt: number): void {
    this.pool.forEach(bullet => {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.lifetime += dt;

      // Release if expired or out of bounds
      if (
        bullet.lifetime >= bullet.maxLifetime ||
        bullet.x < -50 || bullet.x > 850 ||
        bullet.y < -50 || bullet.y > 650
      ) {
        this.pool.release(bullet);
      }
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#ff0';
    this.pool.forEach(bullet => {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
```

### Particle Pool

```typescript
class Particle implements Poolable {
  active: boolean = false;
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  life: number = 0;
  maxLife: number = 1;
  size: number = 4;
  color: string = '#fff';
  alpha: number = 1;
  gravity: number = 0;

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 4;
    this.color = '#fff';
    this.alpha = 1;
    this.gravity = 0;
  }
}

class ParticleEmitter {
  private pool: ObjectPool<Particle>;

  constructor(maxParticles: number = 500) {
    this.pool = new ObjectPool(() => new Particle(), maxParticles);
  }

  emit(
    x: number,
    y: number,
    count: number,
    config: {
      speedMin?: number;
      speedMax?: number;
      angleMin?: number;
      angleMax?: number;
      lifeMin?: number;
      lifeMax?: number;
      sizeMin?: number;
      sizeMax?: number;
      color?: string;
      gravity?: number;
    } = {}
  ): void {
    const {
      speedMin = 50,
      speedMax = 200,
      angleMin = 0,
      angleMax = Math.PI * 2,
      lifeMin = 0.3,
      lifeMax = 1.0,
      sizeMin = 2,
      sizeMax = 6,
      color = '#ff0',
      gravity = 200,
    } = config;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = angleMin + Math.random() * (angleMax - angleMin);
      const speed = speedMin + Math.random() * (speedMax - speedMin);

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
      p.color = color;
      p.gravity = gravity;
    }
  }

  update(dt: number): void {
    this.pool.forEach(p => {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.alpha = 1 - (p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        this.pool.release(p);
      }
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.pool.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(
        p.x - p.size / 2,
        p.y - p.size / 2,
        p.size,
        p.size
      );
    });
    ctx.globalAlpha = 1;
  }
}
```

---

## Observer / Event System

The Observer pattern enables decoupled communication between game subsystems. Instead of direct references, systems publish and subscribe to events.

### Typed Event System

```typescript
type EventCallback<T = unknown> = (data: T) => void;

interface GameEvents {
  'player:damaged': { entity: Entity; amount: number; source: Entity };
  'player:died': { entity: Entity };
  'enemy:killed': { entity: Entity; score: number };
  'coin:collected': { entity: Entity; value: number };
  'level:completed': { level: number; time: number };
  'game:paused': undefined;
  'game:resumed': undefined;
  'score:changed': { score: number; delta: number };
  'combo:hit': { count: number; multiplier: number };
}

class EventBus {
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  on<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  once<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): () => void {
    const wrappedCallback: EventCallback<GameEvents[K]> = (data) => {
      callback(data);
      unsubscribe();
    };
    const unsubscribe = this.on(event, wrappedCallback);
    return unsubscribe;
  }

  emit<K extends keyof GameEvents>(
    event: K,
    data: GameEvents[K]
  ): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
  }

  off<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): void {
    this.listeners.get(event)?.delete(callback);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Usage
const events = new EventBus();

// Score system listens for enemy kills
events.on('enemy:killed', ({ score }) => {
  totalScore += score;
  events.emit('score:changed', { score: totalScore, delta: score });
});

// UI listens for score changes
events.on('score:changed', ({ score }) => {
  updateScoreDisplay(score);
});

// Audio listens for various events
events.on('coin:collected', () => playSfx('coin'));
events.on('player:damaged', () => playSfx('hit'));
events.on('enemy:killed', () => playSfx('explosion'));

// Combo system
let comboCount = 0;
let comboTimer = 0;

events.on('enemy:killed', () => {
  comboCount++;
  comboTimer = 2; // Reset timer
  if (comboCount >= 3) {
    events.emit('combo:hit', {
      count: comboCount,
      multiplier: Math.min(comboCount, 10),
    });
  }
});
```

### Event Queue (Deferred Processing)

Sometimes you want to defer event processing to a specific point in the game loop (e.g., process all events at the end of the frame).

```typescript
interface QueuedEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

class EventQueue {
  private queue: QueuedEvent[] = [];
  private handlers: Map<string, Array<EventCallback<any>>> = new Map();

  register(event: string, callback: EventCallback<any>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(callback);
  }

  enqueue(type: string, data: unknown): void {
    this.queue.push({ type, data, timestamp: performance.now() });
  }

  process(): void {
    const currentQueue = [...this.queue];
    this.queue = [];

    for (const event of currentQueue) {
      const handlers = this.handlers.get(event.type);
      if (!handlers) continue;

      for (const handler of handlers) {
        handler(event.data);
      }
    }
  }
}
```

---

## Command Pattern

The Command pattern encapsulates actions as objects. This enables undo/redo, input replay, and tutorial scripting.

### Basic Command Pattern

```typescript
interface Command {
  execute(): void;
  undo(): void;
  describe(): string;
}

class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
  }

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new action

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
    }
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
```

### Game Commands

```typescript
interface GameEntity {
  id: number;
  x: number;
  y: number;
  health: number;
}

class MoveCommand implements Command {
  private prevX: number;
  private prevY: number;

  constructor(
    private entity: GameEntity,
    private newX: number,
    private newY: number
  ) {
    this.prevX = entity.x;
    this.prevY = entity.y;
  }

  execute(): void {
    this.entity.x = this.newX;
    this.entity.y = this.newY;
  }

  undo(): void {
    this.entity.x = this.prevX;
    this.entity.y = this.prevY;
  }

  describe(): string {
    return `Move entity ${this.entity.id} to (${this.newX}, ${this.newY})`;
  }
}

class DamageCommand implements Command {
  private prevHealth: number;

  constructor(
    private entity: GameEntity,
    private amount: number
  ) {
    this.prevHealth = entity.health;
  }

  execute(): void {
    this.entity.health = Math.max(0, this.entity.health - this.amount);
  }

  undo(): void {
    this.entity.health = this.prevHealth;
  }

  describe(): string {
    return `Deal ${this.amount} damage to entity ${this.entity.id}`;
  }
}

// Composite command for complex actions
class CompositeCommand implements Command {
  constructor(private commands: Command[]) {}

  execute(): void {
    this.commands.forEach(cmd => cmd.execute());
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  describe(): string {
    return this.commands.map(cmd => cmd.describe()).join('; ');
  }
}
```

### Input Replay System

```typescript
interface InputFrame {
  frame: number;
  commands: Command[];
}

class InputRecorder {
  private recording: InputFrame[] = [];
  private currentFrame: number = 0;

  startRecording(): void {
    this.recording = [];
    this.currentFrame = 0;
  }

  recordFrame(commands: Command[]): void {
    if (commands.length > 0) {
      this.recording.push({
        frame: this.currentFrame,
        commands: [...commands],
      });
    }
    this.currentFrame++;
  }

  getRecording(): InputFrame[] {
    return [...this.recording];
  }
}

class InputReplayer {
  private recording: InputFrame[];
  private currentIndex: number = 0;
  private currentFrame: number = 0;

  constructor(recording: InputFrame[]) {
    this.recording = recording;
  }

  getFrameCommands(): Command[] {
    if (this.currentIndex >= this.recording.length) {
      return [];
    }

    const frame = this.recording[this.currentIndex];
    if (frame.frame === this.currentFrame) {
      this.currentIndex++;
      this.currentFrame++;
      return frame.commands;
    }

    this.currentFrame++;
    return [];
  }

  isComplete(): boolean {
    return this.currentIndex >= this.recording.length;
  }
}
```

### Tutorial Scripting with Commands

```typescript
interface TutorialStep {
  message: string;
  commands: Command[];
  waitForInput?: string; // Input event to wait for
  delay?: number;        // Auto-advance delay in ms
}

class TutorialRunner {
  private steps: TutorialStep[];
  private currentStep: number = 0;
  private commandHistory: CommandHistory;

  constructor(steps: TutorialStep[], commandHistory: CommandHistory) {
    this.steps = steps;
    this.commandHistory = commandHistory;
  }

  getCurrentMessage(): string | null {
    if (this.currentStep >= this.steps.length) return null;
    return this.steps[this.currentStep].message;
  }

  executeCurrentStep(): void {
    const step = this.steps[this.currentStep];
    if (!step) return;

    step.commands.forEach(cmd => {
      this.commandHistory.execute(cmd);
    });
  }

  advance(): boolean {
    this.currentStep++;
    if (this.currentStep < this.steps.length) {
      this.executeCurrentStep();
      return true;
    }
    return false;
  }

  isComplete(): boolean {
    return this.currentStep >= this.steps.length;
  }
}
```

---

## Flyweight Pattern

The Flyweight pattern shares data that is common across many objects. In games, this means sharing sprite definitions, tile type data, and other read-only configuration.

```typescript
// Flyweight: shared data for tile types
interface TileType {
  readonly id: number;
  readonly name: string;
  readonly textureX: number;
  readonly textureY: number;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly solid: boolean;
  readonly friction: number;
  readonly damage: number;
}

// Registry of all tile types (shared, read-only)
const TILE_TYPES: Record<number, TileType> = {
  0: {
    id: 0, name: 'air',
    textureX: 0, textureY: 0, textureWidth: 0, textureHeight: 0,
    solid: false, friction: 0, damage: 0,
  },
  1: {
    id: 1, name: 'grass',
    textureX: 0, textureY: 0, textureWidth: 32, textureHeight: 32,
    solid: true, friction: 0.8, damage: 0,
  },
  2: {
    id: 2, name: 'stone',
    textureX: 32, textureY: 0, textureWidth: 32, textureHeight: 32,
    solid: true, friction: 0.6, damage: 0,
  },
  3: {
    id: 3, name: 'lava',
    textureX: 64, textureY: 0, textureWidth: 32, textureHeight: 32,
    solid: false, friction: 0.3, damage: 10,
  },
  4: {
    id: 4, name: 'ice',
    textureX: 96, textureY: 0, textureWidth: 32, textureHeight: 32,
    solid: true, friction: 0.1, damage: 0,
  },
};

// Tilemap: stores only tile type IDs (1 byte each)
// vs storing full TileType objects per cell (would waste memory)
class TileMap {
  private tiles: Uint8Array; // Each cell is just a byte (type ID)
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
  }

  getTileType(x: number, y: number): TileType | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const typeId = this.tiles[y * this.width + x];
    return TILE_TYPES[typeId] ?? null;
  }

  setTile(x: number, y: number, typeId: number): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.tiles[y * this.width + x] = typeId;
    }
  }

  isSolid(x: number, y: number): boolean {
    return this.getTileType(x, y)?.solid ?? false;
  }

  // Memory savings:
  // 100x100 map with Flyweight: 10,000 bytes (1 byte per tile)
  // 100x100 map without Flyweight: ~800,000 bytes (80 bytes per TileType * 10,000)
}
```

### Sprite Definition Flyweight

```typescript
interface SpriteDefinition {
  readonly name: string;
  readonly atlas: string;
  readonly frames: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly duration: number;
  }>;
  readonly origin: { readonly x: number; readonly y: number };
}

// Shared sprite definitions (loaded once from JSON)
class SpriteRegistry {
  private definitions: Map<string, SpriteDefinition> = new Map();

  register(def: SpriteDefinition): void {
    this.definitions.set(def.name, def);
  }

  get(name: string): SpriteDefinition | undefined {
    return this.definitions.get(name);
  }
}

// Each game entity only stores a reference to the definition + its own state
interface AnimatedEntity {
  spriteName: string;      // Reference to shared SpriteDefinition
  currentFrame: number;    // Instance-specific state
  frameTimer: number;      // Instance-specific state
  x: number;
  y: number;
  flipX: boolean;
}
```

---

## Scene Graph

A scene graph organizes game objects in a parent-child hierarchy where transforms cascade from parent to child.

```typescript
interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

class SceneNode {
  parent: SceneNode | null = null;
  children: SceneNode[] = [];
  local: Transform;
  worldTransform: Transform;
  dirty: boolean = true;
  visible: boolean = true;
  name: string;

  constructor(name: string) {
    this.name = name;
    this.local = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    this.worldTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  }

  addChild(child: SceneNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    child.markDirty();
  }

  removeChild(child: SceneNode): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  setPosition(x: number, y: number): void {
    this.local.x = x;
    this.local.y = y;
    this.markDirty();
  }

  setRotation(radians: number): void {
    this.local.rotation = radians;
    this.markDirty();
  }

  setScale(sx: number, sy: number): void {
    this.local.scaleX = sx;
    this.local.scaleY = sy;
    this.markDirty();
  }

  markDirty(): void {
    if (this.dirty) return; // Already dirty, children must be too
    this.dirty = true;
    this.children.forEach(child => child.markDirty());
  }

  updateWorldTransform(): void {
    if (!this.dirty) return;

    if (this.parent) {
      const p = this.parent.worldTransform;
      const cos = Math.cos(p.rotation);
      const sin = Math.sin(p.rotation);

      this.worldTransform = {
        x: p.x + (this.local.x * cos - this.local.y * sin) * p.scaleX,
        y: p.y + (this.local.x * sin + this.local.y * cos) * p.scaleY,
        rotation: p.rotation + this.local.rotation,
        scaleX: p.scaleX * this.local.scaleX,
        scaleY: p.scaleY * this.local.scaleY,
      };
    } else {
      this.worldTransform = { ...this.local };
    }

    this.dirty = false;
    this.children.forEach(child => child.updateWorldTransform());
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.updateWorldTransform();

    ctx.save();
    ctx.translate(this.worldTransform.x, this.worldTransform.y);
    ctx.rotate(this.worldTransform.rotation);
    ctx.scale(this.worldTransform.scaleX, this.worldTransform.scaleY);

    this.draw(ctx);

    ctx.restore();

    this.children.forEach(child => child.render(ctx));
  }

  // Override in subclasses
  protected draw(_ctx: CanvasRenderingContext2D): void {}
}

// Concrete scene node examples
class SpriteNode extends SceneNode {
  image: HTMLImageElement | null = null;
  width: number = 0;
  height: number = 0;
  anchorX: number = 0.5;
  anchorY: number = 0.5;

  protected draw(ctx: CanvasRenderingContext2D): void {
    if (!this.image) return;
    ctx.drawImage(
      this.image,
      -this.width * this.anchorX,
      -this.height * this.anchorY,
      this.width,
      this.height
    );
  }
}

// Usage: Tank with turret
const tank = new SceneNode('tank');
tank.setPosition(200, 300);

const body = new SpriteNode('body');
body.image = tankBodyImage;
body.width = 64;
body.height = 48;
tank.addChild(body);

const turret = new SpriteNode('turret');
turret.image = turretImage;
turret.width = 40;
turret.height = 12;
turret.anchorX = 0.2; // Pivot near the back
turret.setPosition(10, 0); // Offset from tank center
tank.addChild(turret);

// Rotating the tank rotates everything
tank.setRotation(Math.PI / 4);

// Turret can rotate independently relative to tank
turret.setRotation(Math.PI / 6);
```

### Dirty Flag Optimization

The dirty flag pattern is crucial for scene graph performance. When a node's local transform changes, we mark it and all descendants as dirty. On the next `updateWorldTransform()` call, only dirty nodes recompute their world transform.

```
Before dirty flags:
  Every node recalculates world transform every frame
  1000 nodes = 1000 matrix multiplications per frame

With dirty flags:
  Only changed nodes recalculate
  Moving 1 node with 5 children = 6 recalculations (not 1000)
```

---

## Service Locator

The Service Locator pattern provides global access to game subsystems (audio, input, physics, rendering) without using singletons or passing dependencies everywhere.

```typescript
interface IAudioService {
  playSfx(name: string): void;
  playMusic(name: string): void;
  stopMusic(): void;
  setVolume(category: string, volume: number): void;
}

interface IInputService {
  isKeyDown(key: string): boolean;
  isKeyPressed(key: string): boolean;
  getMousePosition(): { x: number; y: number };
}

interface IPhysicsService {
  addBody(body: unknown): void;
  removeBody(body: unknown): void;
  step(dt: number): void;
  raycast(from: { x: number; y: number }, to: { x: number; y: number }): unknown[];
}

interface IRenderService {
  drawSprite(texture: string, x: number, y: number, w: number, h: number): void;
  drawText(text: string, x: number, y: number): void;
}

// Null implementations (for testing or when service unavailable)
class NullAudioService implements IAudioService {
  playSfx(_name: string): void {}
  playMusic(_name: string): void {}
  stopMusic(): void {}
  setVolume(_category: string, _volume: number): void {}
}

// Service Locator
class Services {
  private static audio: IAudioService = new NullAudioService();
  private static input: IInputService | null = null;
  private static physics: IPhysicsService | null = null;
  private static render: IRenderService | null = null;

  static provideAudio(service: IAudioService): void {
    Services.audio = service;
  }

  static provideInput(service: IInputService): void {
    Services.input = service;
  }

  static providePhysics(service: IPhysicsService): void {
    Services.physics = service;
  }

  static provideRender(service: IRenderService): void {
    Services.render = service;
  }

  static getAudio(): IAudioService {
    return Services.audio;
  }

  static getInput(): IInputService {
    if (!Services.input) throw new Error('Input service not registered');
    return Services.input;
  }

  static getPhysics(): IPhysicsService {
    if (!Services.physics) throw new Error('Physics service not registered');
    return Services.physics;
  }

  static getRender(): IRenderService {
    if (!Services.render) throw new Error('Render service not registered');
    return Services.render;
  }
}

// Registration at startup
Services.provideAudio(new WebAudioService());
Services.provideInput(new KeyboardMouseInput());

// Usage anywhere in the code, no imports needed
Services.getAudio().playSfx('explosion');
const mousePos = Services.getInput().getMousePosition();
```

### Service Locator vs Dependency Injection

| Aspect | Service Locator | Dependency Injection |
|--------|----------------|---------------------|
| Discovery | Runtime lookup | Compile-time wiring |
| Dependencies | Hidden | Explicit |
| Testing | Swap implementations | Inject mocks |
| Coupling | To the locator | To interfaces |
| Best for | Game subsystems | Business logic |

---

## Game Loop Patterns

### Fixed Timestep with Interpolation

```typescript
class GameLoop {
  private fixedDt: number = 1 / 60; // 60 updates per second
  private accumulator: number = 0;
  private lastTime: number = 0;
  private running: boolean = false;
  private alpha: number = 0; // Interpolation factor

  constructor(
    private updateFn: (dt: number) => void,
    private renderFn: (alpha: number) => void
  ) {}

  start(): void {
    this.running = true;
    this.lastTime = performance.now() / 1000;
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private tick = (timestamp: number): void => {
    if (!this.running) return;

    const currentTime = timestamp / 1000;
    let frameTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Clamp to prevent spiral of death
    if (frameTime > 0.25) {
      frameTime = 0.25;
    }

    this.accumulator += frameTime;

    // Fixed timestep updates
    while (this.accumulator >= this.fixedDt) {
      this.updateFn(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Interpolation factor for smooth rendering
    this.alpha = this.accumulator / this.fixedDt;
    this.renderFn(this.alpha);

    requestAnimationFrame(this.tick);
  };
}

// Usage
const gameLoop = new GameLoop(
  (dt) => {
    // Physics and logic at fixed 60Hz
    physicsWorld.step(dt);
    aiSystem.update(dt);
    gameLogic.update(dt);
  },
  (alpha) => {
    // Render with interpolation for smooth visuals
    renderer.clear();
    entities.forEach(e => {
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;
      renderer.drawSprite(e.sprite, x, y);
    });
  }
);
```

---

## Spatial Partitioning

Spatial partitioning divides the game world into regions to speed up queries like "which entities are near this point?" This turns O(n) brute-force checks into O(log n) or O(1).

### Grid-Based Spatial Hash

```typescript
class SpatialHash<T extends { x: number; y: number }> {
  private cellSize: number;
  private cells: Map<string, Set<T>> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(item: T): void {
    const key = this.getKey(item.x, item.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(item);
  }

  remove(item: T): void {
    const key = this.getKey(item.x, item.y);
    this.cells.get(key)?.delete(item);
  }

  update(item: T, prevX: number, prevY: number): void {
    const oldKey = this.getKey(prevX, prevY);
    const newKey = this.getKey(item.x, item.y);
    if (oldKey !== newKey) {
      this.cells.get(oldKey)?.delete(item);
      if (!this.cells.has(newKey)) {
        this.cells.set(newKey, new Set());
      }
      this.cells.get(newKey)!.add(item);
    }
  }

  queryNearby(x: number, y: number, radius: number): T[] {
    const results: T[] = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const radiusSq = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (!cell) continue;

        cell.forEach(item => {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= radiusSq) {
            results.push(item);
          }
        });
      }
    }

    return results;
  }

  clear(): void {
    this.cells.clear();
  }
}

// Usage: collision detection with spatial hash
const spatialHash = new SpatialHash<Bullet>(64);

function checkBulletEnemyCollisions(
  bullets: Bullet[],
  enemies: Enemy[]
): void {
  // Insert all enemies
  spatialHash.clear();
  enemies.forEach(e => spatialHash.insert(e));

  // For each bullet, only check nearby enemies
  bullets.forEach(bullet => {
    const nearby = spatialHash.queryNearby(bullet.x, bullet.y, 32);
    nearby.forEach(enemy => {
      if (checkCollision(bullet, enemy)) {
        handleHit(bullet, enemy);
      }
    });
  });
}
```

---

## Interview Questions

### Q1: Design the architecture for a bullet hell game. What patterns would you use and why?

**Answer:**

A bullet hell game involves thousands of bullets on screen simultaneously, making performance the primary concern.

**Object Pooling** is critical. Pre-allocate pools for bullets (500-2000), particles (1000-5000), and enemies (50-100). Never use `new` during gameplay. Each pool uses an array with an active flag, avoiding GC pauses.

**Entity-Component-System** for the core architecture. Entities are numeric IDs. Components: Position, Velocity, Sprite, Collider, Health, BulletPattern, Enemy. Systems process in order: InputSystem, BulletPatternSystem (spawns bullets from patterns), MovementSystem, CollisionSystem, RenderSystem, CleanupSystem.

**Flyweight** for bullet patterns. A "spiral" pattern definition is shared by all enemies that use it. Each enemy stores only its current angle and timing state, referencing the shared pattern data.

**Spatial Hash** for collision detection. With 2000 bullets and 1 player, brute-force is 2000 checks per frame. With a spatial hash (cell size ~64px), you only check the cells the player occupies -- typically 5-20 checks.

**State Machine** for game flow (Menu -> Playing -> Paused -> GameOver) and enemy behavior (Entering -> Pattern1 -> Pattern2 -> Dying).

**Object pool arrays should be contiguous** for cache performance. Process all positions, then all velocities, rather than per-entity.

---

### Q2: Explain the Entity-Component-System pattern. How does it differ from traditional OOP? What are the trade-offs?

**Answer:**

In traditional OOP, game entities inherit from a base class, creating deep hierarchies: `GameObject -> Character -> Enemy -> FlyingEnemy`. This leads to the "diamond problem" and rigid hierarchies that are hard to refactor.

ECS separates concerns into three parts:
- **Entities**: Just unique IDs (numbers). No data, no behavior.
- **Components**: Pure data structs. `Position { x, y }`, `Velocity { vx, vy }`, `Health { current, max }`. No methods.
- **Systems**: Contain all logic. Each system queries entities with specific component combinations and processes them.

Advantages:
- **Composition over inheritance**: An entity is defined by which components it has. Want a flying enemy? Add `Position + Velocity + Sprite + Health + AIFlying`. Want a static turret? `Position + Sprite + Health + AITurret`.
- **Cache-friendly**: Components of the same type are stored contiguously. When the MovementSystem iterates all Velocity components, it reads sequential memory.
- **Easy to add behaviors**: Adding a "poisoned" status effect? Create a `Poison { damagePerSecond, duration }` component and a `PoisonSystem`. No existing code changes.
- **Testable**: Systems are pure functions of components. Easy to test in isolation.

Trade-offs:
- **More boilerplate**: Requires component stores, system registration, entity management.
- **Indirection**: Following logic requires looking at systems rather than a single class.
- **Overkill for small games**: A simple 2D platformer with 20 entities does not need ECS.
- **Communication between systems**: Can be tricky. Usually solved with an event bus or shared component flags.

---

### Q3: When would you use the Command pattern in a game? Give three concrete examples.

**Answer:**

**1. Undo/Redo in a puzzle or strategy game.** Each player action (move piece, place building, swap tiles) is a Command with `execute()` and `undo()`. A CommandHistory stack lets the player undo moves. Crucial for puzzle games and level editors.

**2. Input replay and deterministic simulation.** Record all player inputs as Commands with frame numbers. To replay a game (for replays, ghost mode, or anti-cheat validation), feed the same command sequence into a deterministic game loop. This is how racing game ghosts and fighting game replays work.

**3. Tutorial scripting and AI.** The tutorial system executes scripted Commands (move character here, tap this button, select this item) to demonstrate gameplay. The AI controller generates Commands instead of directly manipulating entities, keeping the AI and gameplay systems decoupled.

Bonus: **Network multiplayer.** In a turn-based or lockstep multiplayer game, each player's actions are serialized as Commands and sent to all peers. Each peer executes the same Commands deterministically, keeping game state synchronized.

---

### Q4: What is object pooling? Why is it critical for web games specifically?

**Answer:**

Object pooling pre-allocates a fixed number of objects at initialization and reuses them during gameplay instead of creating new objects with `new` and letting garbage collection (GC) reclaim them.

It is critical for web games because:

1. **JavaScript garbage collection causes frame drops.** When GC runs, it can pause the main thread for 1-10ms. At 60 FPS, a frame is 16.6ms. A single GC pause can cause a visible stutter. In a bullet hell creating/destroying 100 bullets per frame, GC pressure is extreme.

2. **Allocation is not free.** Even without GC, `new Object()` in JavaScript involves memory allocation, prototype chain setup, and initializer execution. For hot paths (particles, bullets), this adds up.

3. **Mobile browsers are more aggressive with GC.** Lower memory devices trigger GC more frequently, making pooling even more important on mobile.

Implementation: Use an array of pre-created objects, each with an `active` flag. `acquire()` finds the first inactive object and activates it. `release()` deactivates it. If the pool is exhausted, either refuse (hard cap) or evict the oldest object.

Common pooling targets: bullets, particles, sound effects, enemy instances, floating damage numbers, tile sprites.

---

### Q5: How does the Flyweight pattern save memory in a tile-based game?

**Answer:**

In a tile-based game, a 100x100 map has 10,000 tiles. Each tile type has properties: texture coordinates, collision flags, friction, damage values, animation frames -- perhaps 80+ bytes of data.

**Without Flyweight:** Each tile cell stores a full TileType object. 10,000 tiles x 80 bytes = 800KB.

**With Flyweight:** Define each tile type once (grass, stone, water, lava -- maybe 20 types). The map stores only a single byte per cell (the type ID). 10,000 tiles x 1 byte = 10KB. Plus 20 type definitions x 80 bytes = 1.6KB. Total: ~12KB.

That is a 65x memory reduction. For a larger 1000x1000 map, the savings are even more dramatic: 80MB vs 1MB.

The Flyweight pattern works because tile type data is **intrinsic** (shared, read-only) while tile position is **extrinsic** (unique per instance, derived from array index).

The same principle applies to: sprite definitions (share frame data, each instance tracks its own current frame), weapon stats (share damage/fire rate, each gun tracks its own ammo count), enemy configurations (share AI parameters, each enemy has its own position/health).

---

### Q6: Describe the Scene Graph pattern. When is it useful vs. a flat entity list?

**Answer:**

A scene graph organizes game objects in a tree where each node has a local transform (position, rotation, scale) relative to its parent. The world transform is computed by concatenating transforms up the tree.

**When useful:**
- **Articulated characters**: A character has a body, arms, legs, and a weapon. Rotating the arm also rotates the hand and weapon attached to it.
- **Vehicles**: A car has wheels that rotate independently while the car moves. A tank has a body and a turret that rotates relative to the body.
- **UI hierarchies**: A dialog box contains buttons and text. Moving the dialog moves all its children.
- **Camera systems**: The camera follows a target. UI elements are children of a screen-space root, unaffected by camera movement.

**Optimization with dirty flags**: When a node's local transform changes, mark it and all descendants as "dirty." Only recompute world transforms for dirty nodes. If 1000 objects exist and only 5 move, only ~5-20 transforms are recomputed (the movers plus their children).

**When a flat list is better:**
- Simple particle systems (no parent-child relationships)
- Bullet hell games (thousands of independent projectiles)
- When cache-friendly iteration is more important than hierarchical transforms
- ECS architectures where transforms are components processed by a system

---

### Q7: Compare the Observer pattern and direct function calls for game communication. When is each appropriate?

**Answer:**

**Direct function calls**: `scoreManager.addScore(100)` called from the collision system. The collision system has a direct reference to the score manager. This creates tight coupling but is simple and type-safe.

**Observer/Event system**: The collision system emits `events.emit('enemy:killed', { score: 100 })`. The score manager subscribes: `events.on('enemy:killed', ({ score }) => addScore(score))`. The collision system does not know or care about scoring.

**Observer advantages:**
- Decoupled: Adding screen shake on enemy death requires zero changes to the collision system. Just subscribe.
- Multiple listeners: Audio, particles, score, achievements can all react to the same event independently.
- Easy to add/remove features without cascading changes.

**Observer disadvantages:**
- Harder to trace execution flow (event handlers are not in the call stack).
- String-based events can have typos (mitigated with TypeScript typed events).
- Performance overhead from event dispatching (negligible in practice).
- Can lead to "event soup" if overused -- hard to understand what triggers what.

**Rule of thumb:** Use direct calls within a system (internal logic). Use events between systems (inter-system communication). Use events for anything that multiple systems might care about.

---

### Q8: How would you implement an undo system for a puzzle game?

**Answer:**

Use the Command pattern with a history stack.

Each player action is a Command object with `execute()` and `undo()` methods. A `CommandHistory` maintains an undo stack and a redo stack.

When the player performs an action: create the Command, call `execute()`, push it onto the undo stack, and clear the redo stack.

When the player undoes: pop from the undo stack, call `undo()`, push onto the redo stack.

When the player redoes: pop from the redo stack, call `execute()`, push onto the undo stack.

For composite actions (e.g., a match-3 swap that triggers cascading matches), use a CompositeCommand that groups multiple atomic commands. Undoing the composite undoes all sub-commands in reverse order.

Important considerations:
- Cap the history size to prevent unbounded memory growth.
- Some actions may be non-undoable (e.g., using a consumable power-up). Mark these and clear the undo stack when they occur.
- For a level editor, save the full state periodically as a snapshot. Undo walks backward through commands until a snapshot, then restores the snapshot and replays commands forward.

---

### Q9: What is the Service Locator pattern and how does it compare to singletons?

**Answer:**

The Service Locator provides a central registry for game subsystems. Instead of `AudioManager.getInstance().playSfx('boom')` (singleton), you use `Services.getAudio().playSfx('boom')` (service locator).

Key differences from singletons:

1. **Swappable implementations**: You can register a `NullAudioService` during testing, a `WebAudioService` in production, or a `DebugAudioService` during development. With singletons, the implementation is hardcoded.

2. **Initialization order**: With a service locator, you explicitly register services in the desired order during startup. Singletons initialize on first access, which can cause subtle ordering bugs.

3. **No global state in the class itself**: The service implementations are stateless from the locator's perspective. They can be created, configured, and registered normally.

**Trade-offs:**
- Dependencies are still hidden (not in constructor signatures). This makes it harder to know what a class depends on.
- Runtime errors if a service is accessed before registration (mitigated with null implementations).
- A step between raw singletons and full dependency injection.

For games, the Service Locator is a pragmatic choice. Full DI frameworks add complexity that is rarely justified in game code. The Service Locator gives you the testability benefits (swap implementations) without the ceremony.

---

### Q10: Design a state machine for a platformer character. What states would you define and what transitions exist?

**Answer:**

States:
- **Idle**: Standing still on ground. Transitions to: Running (move input), Jumping (jump input), Falling (walk off edge), Attacking (attack input), Hurt (hit by enemy), Dead (health <= 0).
- **Running**: Moving on ground. Transitions to: Idle (no input), Jumping (jump input), Falling (walk off edge), Attacking (attack input), Sliding (slide input), Hurt, Dead.
- **Jumping**: Rising upward. Transitions to: Falling (velocity.y becomes positive), DoubleJumping (jump input if double jump available), WallSliding (touching wall), Hurt, Dead.
- **Falling**: Moving downward. Transitions to: Landing/Idle (touch ground), DoubleJumping, WallSliding, Hurt, Dead.
- **WallSliding**: Sliding down a wall. Transitions to: WallJumping (jump input), Falling (move away from wall), Idle (reach ground).
- **Attacking**: Attack animation playing. Transitions to: Idle (animation complete, on ground), Falling (animation complete, in air). Cannot be interrupted except by Hurt/Dead.
- **Hurt**: Hit stun animation. Transitions to: Idle (recovery complete, on ground), Falling (recovery complete, in air), Dead (health <= 0).
- **Dead**: Death animation. No transitions (game over or respawn handled externally).

I would use a hierarchical FSM: `Alive > Grounded > {Idle, Running, Attacking}` and `Alive > Airborne > {Jumping, Falling, WallSliding}`. This lets me define common behavior at the "Grounded" or "Airborne" level (e.g., gravity only applies in the Airborne super-state).
