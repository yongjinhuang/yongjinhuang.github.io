# Popular Playable Ad Game Genres

## Table of Contents

1. [Match-3](#1-match-3)
2. [Endless Runner](#2-endless-runner)
3. [Puzzle (Pull the Pin)](#3-puzzle-pull-the-pin)
4. [Merge](#4-merge)
5. [Idle/Clicker](#5-idleclicker)
6. [Tower Defense](#6-tower-defense)
7. [Dress-up/Makeover](#7-dress-upmakeover)
8. [Solitaire/Card Games](#8-solitairecard-games)
9. [Interview Questions](#interview-questions)

---

## 1. Match-3

### Why It Works as a Playable Ad

- **Universally understood**: Nearly everyone has played Candy Crush or similar
- **Satisfying mechanics**: Cascading matches feel rewarding
- **Easy to hook**: Start the player near a big combo
- **Quick sessions**: One board can be played in 10-15 seconds
- **Visual appeal**: Colorful gems/candies are eye-catching in ad feeds

### Core Mechanics

The game grid is a 2D array where players swap adjacent pieces to create matches of 3+ of the same type.

### Data Structures

```typescript
interface Cell {
  type: number; // Gem type (0-5 for 6 colors)
  special: SpecialType;
  x: number; // Grid column
  y: number; // Grid row
  screenX: number; // Render position X
  screenY: number; // Render position Y
  scale: number; // For animations
  alpha: number; // For fade effects
}

type SpecialType = 'none' | 'lineH' | 'lineV' | 'bomb' | 'color';

type Grid = Cell[][];

interface Match {
  readonly cells: ReadonlyArray<{ row: number; col: number }>;
  readonly type: number;
  readonly length: number;
  readonly orientation: 'horizontal' | 'vertical';
}

interface GameState {
  readonly grid: Grid;
  readonly score: number;
  readonly combo: number;
  readonly timeRemaining: number;
  readonly phase: 'idle' | 'swapping' | 'matching' | 'falling' | 'refilling';
}
```

### Match Detection Algorithm

```typescript
function findAllMatches(grid: Grid): readonly Match[] {
  const matches: Match[] = [];
  const rows = grid.length;
  const cols = grid[0].length;

  // Horizontal scan
  for (let row = 0; row < rows; row++) {
    let matchStart = 0;

    for (let col = 1; col <= cols; col++) {
      const sameType =
        col < cols &&
        grid[row][col].type === grid[row][matchStart].type &&
        grid[row][col].type >= 0;

      if (!sameType) {
        const length = col - matchStart;
        if (length >= 3) {
          const cells = [];
          for (let c = matchStart; c < col; c++) {
            cells.push({ row, col: c });
          }
          matches.push({
            cells,
            type: grid[row][matchStart].type,
            length,
            orientation: 'horizontal',
          });
        }
        matchStart = col;
      }
    }
  }

  // Vertical scan
  for (let col = 0; col < cols; col++) {
    let matchStart = 0;

    for (let row = 1; row <= rows; row++) {
      const sameType =
        row < rows &&
        grid[row][col].type === grid[matchStart][col].type &&
        grid[row][col].type >= 0;

      if (!sameType) {
        const length = row - matchStart;
        if (length >= 3) {
          const cells = [];
          for (let r = matchStart; r < row; r++) {
            cells.push({ row: r, col });
          }
          matches.push({
            cells,
            type: grid[matchStart][col].type,
            length,
            orientation: 'vertical',
          });
        }
        matchStart = row;
      }
    }
  }

  return matches;
}
```

### Cascade System (Remove -> Gravity -> Refill -> Recheck)

```typescript
class CascadeEngine {
  private grid: Grid;
  private readonly cols: number;
  private readonly rows: number;
  private readonly typeCount: number;

  constructor(grid: Grid, typeCount: number) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.typeCount = typeCount;
  }

  // Full cascade cycle - returns all steps for animation
  executeCascade(): CascadeStep[] {
    const steps: CascadeStep[] = [];
    let combo = 0;

    while (true) {
      // Step 1: Find matches
      const matches = findAllMatches(this.grid);
      if (matches.length === 0) break;

      combo++;

      // Step 2: Remove matched cells
      const removedCells = this.removeMatches(matches);
      steps.push({
        type: 'remove',
        cells: removedCells,
        combo,
        score: this.calculateScore(matches, combo),
      });

      // Step 3: Apply gravity
      const fallenCells = this.applyGravity();
      if (fallenCells.length > 0) {
        steps.push({
          type: 'gravity',
          cells: fallenCells,
          combo,
          score: 0,
        });
      }

      // Step 4: Refill empty cells
      const newCells = this.refillGrid();
      steps.push({
        type: 'refill',
        cells: newCells,
        combo,
        score: 0,
      });

      // Loop back to step 1 (recheck for new matches)
    }

    return steps;
  }

  private removeMatches(
    matches: readonly Match[]
  ): Array<{ row: number; col: number }> {
    const removed: Array<{ row: number; col: number }> = [];

    for (const match of matches) {
      // Check for special piece creation
      if (match.length === 4) {
        // Keep one cell, make it a line clear
        const midIdx = Math.floor(match.cells.length / 2);
        const specialCell = match.cells[midIdx];
        this.grid[specialCell.row][specialCell.col].special =
          match.orientation === 'horizontal' ? 'lineV' : 'lineH';

        for (let i = 0; i < match.cells.length; i++) {
          if (i !== midIdx) {
            const cell = match.cells[i];
            this.grid[cell.row][cell.col].type = -1; // Mark as empty
            removed.push(cell);
          }
        }
      } else if (match.length >= 5) {
        // Keep one cell, make it a bomb
        const midIdx = Math.floor(match.cells.length / 2);
        const specialCell = match.cells[midIdx];
        this.grid[specialCell.row][specialCell.col].special = 'bomb';

        for (let i = 0; i < match.cells.length; i++) {
          if (i !== midIdx) {
            const cell = match.cells[i];
            this.grid[cell.row][cell.col].type = -1;
            removed.push(cell);
          }
        }
      } else {
        // Standard match of 3
        for (const cell of match.cells) {
          this.grid[cell.row][cell.col].type = -1;
          removed.push(cell);
        }
      }
    }

    return removed;
  }

  private applyGravity(): Array<{ row: number; col: number; fromRow: number }> {
    const fallen: Array<{ row: number; col: number; fromRow: number }> = [];

    for (let col = 0; col < this.cols; col++) {
      let writeRow = this.rows - 1;

      for (let readRow = this.rows - 1; readRow >= 0; readRow--) {
        if (this.grid[readRow][col].type >= 0) {
          if (readRow !== writeRow) {
            // Move cell down
            this.grid[writeRow][col] = {
              ...this.grid[readRow][col],
              y: writeRow,
            };
            this.grid[readRow][col] = {
              ...this.grid[readRow][col],
              type: -1,
              y: readRow,
            };
            fallen.push({ row: writeRow, col, fromRow: readRow });
          }
          writeRow--;
        }
      }
    }

    return fallen;
  }

  private refillGrid(): Array<{ row: number; col: number; type: number }> {
    const newCells: Array<{ row: number; col: number; type: number }> = [];

    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        if (this.grid[row][col].type < 0) {
          const newType = Math.floor(Math.random() * this.typeCount);
          this.grid[row][col] = {
            ...this.grid[row][col],
            type: newType,
            special: 'none',
          };
          newCells.push({ row, col, type: newType });
        }
      }
    }

    return newCells;
  }

  private calculateScore(matches: readonly Match[], combo: number): number {
    let score = 0;
    for (const match of matches) {
      const baseScore = match.length === 3 ? 30 : match.length === 4 ? 50 : 100;
      score += baseScore * combo;
    }
    return score;
  }
}

interface CascadeStep {
  readonly type: 'remove' | 'gravity' | 'refill';
  readonly cells: ReadonlyArray<Record<string, number>>;
  readonly combo: number;
  readonly score: number;
}
```

### Playable Ad Hook: Start Near Big Combo

```typescript
function createRiggedBoard(
  cols: number,
  rows: number,
  typeCount: number
): Grid {
  // Generate a board where one swap creates a spectacular cascade
  const grid: Grid = createRandomGrid(cols, rows, typeCount);

  // Rig row 5: place gems so swapping col 3 and 4 creates a match
  grid[5][2].type = 1;
  grid[5][3].type = 1;
  grid[5][4].type = 0; // This will be swapped
  grid[4][4].type = 1; // After swap, creates match of 3 in column

  // Also set up a chain above
  grid[3][2].type = 2;
  grid[3][3].type = 2;
  grid[3][4].type = 2; // After gravity, this creates another match

  // Ensure the initial board has NO existing matches
  // (would auto-resolve before player gets to play)
  removePreexistingMatches(grid, typeCount);

  return grid;
}

function removePreexistingMatches(grid: Grid, typeCount: number): void {
  let matches = findAllMatches(grid);

  while (matches.length > 0) {
    for (const match of matches) {
      // Change one cell in each match to break it
      const cell = match.cells[0];
      let newType: number;
      do {
        newType = Math.floor(Math.random() * typeCount);
      } while (newType === grid[cell.row][cell.col].type);
      grid[cell.row][cell.col].type = newType;
    }
    matches = findAllMatches(grid);
  }
}

function createRandomGrid(cols: number, rows: number, typeCount: number): Grid {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      type: Math.floor(Math.random() * typeCount),
      special: 'none' as SpecialType,
      x: col,
      y: row,
      screenX: 0,
      screenY: 0,
      scale: 1,
      alpha: 1,
    }))
  );
}
```

---

## 2. Endless Runner

### Why It Works as a Playable Ad

- **Instant understanding**: Run, dodge, collect — universal
- **Escalating excitement**: Speed increases create tension
- **Easy hook**: Let them run successfully then present an obstacle they can't avoid
- **Action-packed**: Movement and particle effects are eye-catching in feed
- **Quick to play**: 10-15 seconds of running is satisfying

### Core Mechanics

3-lane runner with obstacles and collectibles. Player swipes to change lanes.

### Data Structures

```typescript
interface RunnerState {
  readonly playerLane: number; // 0 = left, 1 = center, 2 = right
  readonly playerY: number; // Vertical position (for jumps)
  readonly speed: number; // Current speed (increases over time)
  readonly distance: number; // Distance traveled
  readonly coins: number; // Collected coins
  readonly isAlive: boolean;
  readonly isJumping: boolean;
}

interface Obstacle {
  type: 'barrier' | 'gap' | 'low';
  lane: number;
  z: number; // Distance along track (decreases toward player)
  width: number;
  height: number;
  passed: boolean;
}

interface Collectible {
  type: 'coin' | 'powerup';
  lane: number;
  z: number;
  collected: boolean;
}

const LANE_POSITIONS = [-100, 0, 100] as const;
const LANE_COUNT = 3;
```

### Obstacle Spawning with Constraints

```typescript
class ObstacleSpawner {
  private readonly minGap: number = 200; // Minimum distance between obstacles
  private readonly spawnDistance: number = 1000; // How far ahead to spawn
  private lastSpawnZ: number = 0;

  spawn(currentDistance: number, speed: number): Obstacle | null {
    const nextSpawnZ = currentDistance + this.spawnDistance;

    // Don't spawn too close to last obstacle
    if (nextSpawnZ - this.lastSpawnZ < this.minGap * (speed / 5)) {
      return null;
    }

    // Ensure at least one lane is open
    const blockedLanes = this.selectBlockedLanes();

    const obstacle: Obstacle = {
      type: this.selectType(speed),
      lane: blockedLanes[Math.floor(Math.random() * blockedLanes.length)],
      z: nextSpawnZ,
      width: 80,
      height: 100,
      passed: false,
    };

    this.lastSpawnZ = nextSpawnZ;
    return obstacle;
  }

  private selectBlockedLanes(): number[] {
    // Never block all 3 lanes
    const count = Math.random() < 0.3 ? 2 : 1; // 30% chance of 2 obstacles

    const lanes = [0, 1, 2];
    const selected: number[] = [];

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * lanes.length);
      selected.push(lanes[idx]);
      lanes.splice(idx, 1);
    }

    return selected;
  }

  private selectType(speed: number): 'barrier' | 'gap' | 'low' {
    // More variety at higher speeds
    if (speed < 8) return 'barrier';

    const roll = Math.random();
    if (roll < 0.6) return 'barrier';
    if (roll < 0.85) return 'low'; // Must jump
    return 'gap'; // Must slide
  }
}
```

### Parallax Scrolling Background

```typescript
interface ParallaxLayer {
  readonly image: HTMLImageElement;
  readonly speed: number; // 0 = static, 1 = same as player
  offset: number;
  readonly y: number;
  readonly height: number;
}

class ParallaxBackground {
  private readonly layers: ParallaxLayer[];

  constructor(layers: ParallaxLayer[]) {
    this.layers = layers;
  }

  update(playerSpeed: number, dt: number): void {
    for (const layer of this.layers) {
      layer.offset -= playerSpeed * layer.speed * dt;

      // Wrap around
      if (layer.offset <= -layer.image.width) {
        layer.offset += layer.image.width;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
    for (const layer of this.layers) {
      const imgWidth = layer.image.width;

      // Draw enough copies to fill screen
      let x = layer.offset % imgWidth;
      if (x > 0) x -= imgWidth;

      while (x < canvasWidth) {
        ctx.drawImage(layer.image, x, layer.y, imgWidth, layer.height);
        x += imgWidth;
      }
    }
  }
}

// Programmatic parallax (no images, zero file size)
function drawProceduralBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offset: number
): void {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
  skyGrad.addColorStop(0, '#1a1a2e');
  skyGrad.addColorStop(1, '#16213e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height * 0.6);

  // Far mountains (slow parallax)
  ctx.fillStyle = '#0f3460';
  drawMountains(ctx, width, height * 0.5, offset * 0.1, 60);

  // Near mountains (faster parallax)
  ctx.fillStyle = '#1a1a4e';
  drawMountains(ctx, width, height * 0.55, offset * 0.3, 80);

  // Ground
  ctx.fillStyle = '#533483';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);

  // Road lines (fastest parallax)
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 3;
  ctx.setLineDash([30, 20]);
  ctx.lineDashOffset = offset * 2;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.85);
  ctx.lineTo(width, height * 0.85);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseY: number,
  offset: number,
  amplitude: number
): void {
  ctx.beginPath();
  ctx.moveTo(0, baseY + amplitude);

  for (let x = 0; x <= width; x += 5) {
    const y =
      baseY +
      Math.sin((x + offset) * 0.01) * amplitude * 0.5 +
      Math.sin((x + offset) * 0.003) * amplitude;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, baseY + amplitude * 2);
  ctx.lineTo(0, baseY + amplitude * 2);
  ctx.closePath();
  ctx.fill();
}
```

### Speed Increase

```typescript
class SpeedController {
  private readonly baseSpeed: number = 5;
  private readonly maxSpeed: number = 15;
  private readonly accelerationRate: number = 0.1; // Units per second
  private currentSpeed: number;

  constructor() {
    this.currentSpeed = this.baseSpeed;
  }

  update(dt: number): number {
    this.currentSpeed = Math.min(
      this.maxSpeed,
      this.currentSpeed + this.accelerationRate * dt
    );
    return this.currentSpeed;
  }

  getSpeed(): number {
    return this.currentSpeed;
  }

  // For playable ad: boost speed at certain points for excitement
  boost(multiplier: number, duration: number): void {
    const boostedSpeed = this.currentSpeed * multiplier;
    this.currentSpeed = Math.min(this.maxSpeed, boostedSpeed);
    // Duration would be handled by tween system
  }
}
```

### Playable Ad Hook: About to Crash

```typescript
class RunnerPlayableHook {
  private readonly crashDistance: number;
  private hasShownEndCard: boolean = false;

  constructor(crashAfterSeconds: number = 12) {
    // Calculate how far they'll get at average speed
    this.crashDistance = crashAfterSeconds * 8; // Rough estimate
  }

  update(state: RunnerState, showEndCard: () => void): void {
    if (this.hasShownEndCard) return;

    // Option 1: Spawn unavoidable obstacle
    if (state.distance >= this.crashDistance) {
      // Create obstacles in ALL lanes
      this.hasShownEndCard = true;

      // Brief moment of "oh no!" before end card
      setTimeout(() => {
        showEndCard();
      }, 500);
    }
  }

  // Option 2: Slow-mo near-miss then end card
  createDramaticEnding(state: RunnerState): {
    slowMo: boolean;
    showEndCard: boolean;
  } {
    const distanceToEnd = this.crashDistance - state.distance;

    if (distanceToEnd < 50 && distanceToEnd > 0) {
      return { slowMo: true, showEndCard: false };
    }

    if (distanceToEnd <= 0) {
      return { slowMo: false, showEndCard: true };
    }

    return { slowMo: false, showEndCard: false };
  }
}
```

---

## 3. Puzzle (Pull the Pin)

### Why It Works as a Playable Ad

- **Obvious solution**: Players feel smart solving it
- **Physics-based satisfaction**: Watching liquids/balls flow is satisfying
- **Low barrier**: No time pressure, just figure out the order
- **Curiosity hook**: "Can I solve this?" is a powerful motivator
- **Viral format**: These puzzles are inherently shareable

### Core Mechanics

Remove pins in the correct order to guide objects (balls, liquid) to a goal while avoiding hazards.

### Data Structures

```typescript
interface PinPuzzle {
  readonly pins: readonly Pin[];
  readonly objects: readonly PhysicsObject[];
  readonly goal: Goal;
  readonly hazards: readonly Hazard[];
}

interface Pin {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly length: number;
  removed: boolean;
}

interface PhysicsObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'ball' | 'liquid';
  color: string;
  active: boolean;
}

interface Goal {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  filled: number; // 0-100%
}

interface Hazard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly type: 'spikes' | 'fire' | 'void';
}
```

### Level State Machine

```typescript
type PuzzleState = 'idle' | 'pulling' | 'simulating' | 'success' | 'fail';

class PullThePinGame {
  private state: PuzzleState = 'idle';
  private readonly puzzle: PinPuzzle;
  private pinBeingPulled: Pin | null = null;

  constructor(puzzle: PinPuzzle) {
    this.puzzle = puzzle;
  }

  handleTap(x: number, y: number): void {
    if (this.state !== 'idle') return;

    // Find tapped pin
    const pin = this.findPinAt(x, y);
    if (!pin || pin.removed) return;

    this.state = 'pulling';
    this.pinBeingPulled = pin;

    // Animate pin removal
    this.animatePinRemoval(pin, () => {
      pin.removed = true;
      this.pinBeingPulled = null;
      this.state = 'simulating';

      // Run physics simulation
      this.simulatePhysics();
    });
  }

  private simulatePhysics(): void {
    const simulate = (): void => {
      if (this.state !== 'simulating') return;

      // Update physics for all objects
      for (const obj of this.puzzle.objects) {
        if (!obj.active) continue;

        // Gravity
        obj.vy += 9.8 * 0.016; // Gravity * dt

        // Update position
        obj.x += obj.vx * 0.016;
        obj.y += obj.vy * 0.016;

        // Collision with remaining pins
        for (const pin of this.puzzle.pins) {
          if (!pin.removed) {
            this.collideWithPin(obj, pin);
          }
        }

        // Check goal
        if (this.isInGoal(obj)) {
          obj.active = false;
          this.puzzle.goal.filled += 10;

          if (this.puzzle.goal.filled >= 100) {
            this.state = 'success';
            return;
          }
        }

        // Check hazards
        for (const hazard of this.puzzle.hazards) {
          if (this.isInHazard(obj, hazard)) {
            obj.active = false;
            this.state = 'fail';
            return;
          }
        }
      }

      // Check if all objects are settled or gone
      const allSettled = this.puzzle.objects.every(
        (o) => !o.active || (Math.abs(o.vx) < 0.1 && Math.abs(o.vy) < 0.1)
      );

      if (allSettled) {
        this.state = 'idle'; // Ready for next pin pull
      } else {
        requestAnimationFrame(simulate);
      }
    };

    requestAnimationFrame(simulate);
  }

  private findPinAt(x: number, y: number): Pin | null {
    for (const pin of this.puzzle.pins) {
      if (pin.removed) continue;
      // Simple hit test
      const dx = x - pin.x;
      const dy = y - pin.y;
      if (Math.abs(dx) < pin.length / 2 + 20 && Math.abs(dy) < 20) {
        return pin;
      }
    }
    return null;
  }

  private animatePinRemoval(pin: Pin, onComplete: () => void): void {
    // Slide pin out to the side
    setTimeout(onComplete, 300);
  }

  private collideWithPin(obj: PhysicsObject, pin: Pin): void {
    // Simple line-circle collision
    // Bounce off pin surface
  }

  private isInGoal(obj: PhysicsObject): boolean {
    const g = this.puzzle.goal;
    return (
      obj.x > g.x &&
      obj.x < g.x + g.width &&
      obj.y > g.y &&
      obj.y < g.y + g.height
    );
  }

  private isInHazard(obj: PhysicsObject, hazard: Hazard): boolean {
    return (
      obj.x > hazard.x &&
      obj.x < hazard.x + hazard.width &&
      obj.y > hazard.y &&
      obj.y < hazard.y + hazard.height
    );
  }
}
```

### Hook: Obvious First Solution

```typescript
// Design the first level so the solution is immediately obvious
function createTutorialLevel(): PinPuzzle {
  return {
    pins: [
      {
        id: 'pin1',
        x: 200,
        y: 300,
        orientation: 'horizontal',
        length: 100,
        removed: false,
      },
      // Only one pin — remove it and the ball falls into the goal
    ],
    objects: [
      {
        x: 200,
        y: 250,
        vx: 0,
        vy: 0,
        radius: 20,
        type: 'ball',
        color: '#ff6b6b',
        active: true,
      },
    ],
    goal: {
      x: 170,
      y: 400,
      width: 60,
      height: 60,
      filled: 0,
    },
    hazards: [], // No hazards on first level
  };
}
```

---

## 4. Merge

### Why It Works as a Playable Ad

- **Discovery mechanic**: "What happens when I merge?" creates curiosity
- **Satisfying animations**: Items combining and upgrading feels rewarding
- **Simple input**: Just drag and drop
- **Progression visible**: Watching items evolve from basic to advanced
- **FOMO hook**: Show a high-tier item they haven't unlocked yet

### Core Mechanics

Drag items onto identical items to merge them into a higher-tier version. Grid-based placement with merge rules.

### Data Structures

```typescript
interface MergeItem {
  type: string; // e.g., "sword", "flower", "gem"
  tier: number; // 1 = basic, 2 = improved, etc.
  gridX: number;
  gridY: number;
  renderX: number; // For smooth animation
  renderY: number;
  isDragging: boolean;
}

interface MergeGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: Array<MergeItem | null>;
}

// Merge rules: what each tier produces
interface MergeRules {
  readonly mergeCount: number; // Items needed to merge (usually 3)
  readonly maxTier: number;
  readonly tierNames: readonly string[];
}

const SWORD_RULES: MergeRules = {
  mergeCount: 3,
  maxTier: 8,
  tierNames: [
    '', // tier 0 doesn't exist
    'Wooden Stick',
    'Stone Knife',
    'Iron Dagger',
    'Steel Sword',
    'Silver Blade',
    'Gold Saber',
    'Diamond Edge',
    'Legendary Excalibur',
  ],
};
```

### Merge Logic

```typescript
class MergeGame {
  private grid: MergeGrid;
  private readonly rules: MergeRules;

  constructor(width: number, height: number, rules: MergeRules) {
    this.rules = rules;
    this.grid = {
      width,
      height,
      cells: new Array(width * height).fill(null),
    };
  }

  // Try to merge item at (x,y) with items around it
  tryMerge(x: number, y: number): MergeResult {
    const item = this.getCell(x, y);
    if (!item) return { merged: false, newTier: 0, cellsMerged: [] };

    // Find adjacent cells with same type and tier
    const mergeable = this.findMergeableNeighbors(x, y, item);

    if (mergeable.length + 1 >= this.rules.mergeCount) {
      // Take exactly mergeCount - 1 neighbors
      const toMerge = mergeable.slice(0, this.rules.mergeCount - 1);

      // Remove merged items
      for (const pos of toMerge) {
        this.setCell(pos.x, pos.y, null);
      }

      // Upgrade the original item
      const newTier = Math.min(item.tier + 1, this.rules.maxTier);
      const upgradedItem: MergeItem = {
        ...item,
        tier: newTier,
      };
      this.setCell(x, y, upgradedItem);

      return {
        merged: true,
        newTier,
        cellsMerged: toMerge,
      };
    }

    return { merged: false, newTier: 0, cellsMerged: [] };
  }

  private findMergeableNeighbors(
    x: number,
    y: number,
    item: MergeItem
  ): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [{ x, y }];
    visited.add(`${x},${y}`);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        visited.add(key);

        if (nx < 0 || nx >= this.grid.width || ny < 0 || ny >= this.grid.height)
          continue;

        const neighbor = this.getCell(nx, ny);
        if (
          neighbor &&
          neighbor.type === item.type &&
          neighbor.tier === item.tier
        ) {
          neighbors.push({ x: nx, y: ny });
          queue.push({ x: nx, y: ny });
        }
      }
    }

    return neighbors;
  }

  // Drag and drop handling
  handleDrop(dragItem: MergeItem, targetX: number, targetY: number): void {
    const targetItem = this.getCell(targetX, targetY);

    if (targetItem === null) {
      // Empty cell - just place it
      this.setCell(dragItem.gridX, dragItem.gridY, null);
      const movedItem = { ...dragItem, gridX: targetX, gridY: targetY };
      this.setCell(targetX, targetY, movedItem);
    } else if (
      targetItem.type === dragItem.type &&
      targetItem.tier === dragItem.tier &&
      targetItem.tier < this.rules.maxTier
    ) {
      // Merge!
      this.setCell(dragItem.gridX, dragItem.gridY, null);
      const mergedItem: MergeItem = {
        ...targetItem,
        tier: targetItem.tier + 1,
      };
      this.setCell(targetX, targetY, mergedItem);
    } else {
      // Swap positions
      this.setCell(dragItem.gridX, dragItem.gridY, {
        ...targetItem,
        gridX: dragItem.gridX,
        gridY: dragItem.gridY,
      });
      this.setCell(targetX, targetY, {
        ...dragItem,
        gridX: targetX,
        gridY: targetY,
      });
    }
  }

  private getCell(x: number, y: number): MergeItem | null {
    return this.grid.cells[y * this.grid.width + x];
  }

  private setCell(x: number, y: number, item: MergeItem | null): void {
    this.grid.cells[y * this.grid.width + x] = item;
  }
}

interface MergeResult {
  readonly merged: boolean;
  readonly newTier: number;
  readonly cellsMerged: ReadonlyArray<{ x: number; y: number }>;
}
```

### Hook: Satisfying Chain

```typescript
// Pre-arrange board so first merge triggers a chain reaction
function createRiggedMergeBoard(game: MergeGame): void {
  // Place items that will cascade when first merge happens
  // Tier 1: three swords adjacent (player merges these)
  // Result creates tier 2 next to two existing tier 2s → auto-merge!
  // That creates tier 3 next to two tier 3s → another auto-merge!
  // Player sees items evolve rapidly with minimal input
}
```

---

## 5. Idle/Clicker

### Why It Works as a Playable Ad

- **Instant gratification**: Numbers go up immediately
- **Fast progression illusion**: Compress hours of gameplay into 15 seconds
- **FOMO**: Show what they could achieve with more time
- **Low effort**: Just tap
- **Dopamine loop**: Each tap gives feedback

### Big Number System

```typescript
class BigNumber {
  private mantissa: number;
  private exponent: number;

  constructor(value: number = 0) {
    if (value === 0) {
      this.mantissa = 0;
      this.exponent = 0;
    } else {
      this.exponent = Math.floor(Math.log10(Math.abs(value)));
      this.mantissa = value / Math.pow(10, this.exponent);
    }
  }

  add(other: BigNumber): BigNumber {
    if (this.mantissa === 0) return other.clone();
    if (other.mantissa === 0) return this.clone();

    const expDiff = this.exponent - other.exponent;

    if (expDiff > 15) return this.clone(); // Other is negligible
    if (expDiff < -15) return other.clone();

    const result = new BigNumber();

    if (expDiff >= 0) {
      result.mantissa = this.mantissa + other.mantissa / Math.pow(10, expDiff);
      result.exponent = this.exponent;
    } else {
      result.mantissa = this.mantissa / Math.pow(10, -expDiff) + other.mantissa;
      result.exponent = other.exponent;
    }

    result.normalize();
    return result;
  }

  multiply(other: BigNumber): BigNumber {
    const result = new BigNumber();
    result.mantissa = this.mantissa * other.mantissa;
    result.exponent = this.exponent + other.exponent;
    result.normalize();
    return result;
  }

  private normalize(): void {
    if (this.mantissa === 0) {
      this.exponent = 0;
      return;
    }

    while (Math.abs(this.mantissa) >= 10) {
      this.mantissa /= 10;
      this.exponent++;
    }

    while (Math.abs(this.mantissa) < 1 && this.mantissa !== 0) {
      this.mantissa *= 10;
      this.exponent--;
    }
  }

  format(): string {
    if (this.exponent < 3) {
      return Math.floor(this.mantissa * Math.pow(10, this.exponent)).toString();
    }

    const suffixes = [
      '',
      'K',
      'M',
      'B',
      'T',
      'Qa',
      'Qi',
      'Sx',
      'Sp',
      'Oc',
      'No',
      'Dc',
    ];

    const suffixIndex = Math.floor(this.exponent / 3);

    if (suffixIndex < suffixes.length) {
      const displayMantissa = this.mantissa * Math.pow(10, this.exponent % 3);
      return `${displayMantissa.toFixed(2)}${suffixes[suffixIndex]}`;
    }

    return `${this.mantissa.toFixed(2)}e${this.exponent}`;
  }

  isGreaterThan(other: BigNumber): boolean {
    if (this.exponent !== other.exponent) {
      return this.exponent > other.exponent;
    }
    return this.mantissa > other.mantissa;
  }

  clone(): BigNumber {
    const result = new BigNumber();
    result.mantissa = this.mantissa;
    result.exponent = this.exponent;
    return result;
  }
}
```

### Upgrade Tree

```typescript
interface Upgrade {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly baseCost: BigNumber;
  readonly costMultiplier: number;
  readonly baseEffect: BigNumber;
  level: number;
  maxLevel: number;
}

class IdleGame {
  private currency: BigNumber;
  private clickPower: BigNumber;
  private autoIncome: BigNumber; // Per second
  private readonly upgrades: Upgrade[];

  constructor() {
    this.currency = new BigNumber(0);
    this.clickPower = new BigNumber(1);
    this.autoIncome = new BigNumber(0);
    this.upgrades = this.createUpgrades();
  }

  private createUpgrades(): Upgrade[] {
    return [
      {
        id: 'click1',
        name: 'Better Pickaxe',
        description: '+1 per click',
        baseCost: new BigNumber(10),
        costMultiplier: 1.5,
        baseEffect: new BigNumber(1),
        level: 0,
        maxLevel: 50,
      },
      {
        id: 'auto1',
        name: 'Hire Worker',
        description: '+1 per second',
        baseCost: new BigNumber(50),
        costMultiplier: 1.8,
        baseEffect: new BigNumber(1),
        level: 0,
        maxLevel: 100,
      },
      {
        id: 'auto2',
        name: 'Mining Drill',
        description: '+10 per second',
        baseCost: new BigNumber(500),
        costMultiplier: 2.0,
        baseEffect: new BigNumber(10),
        level: 0,
        maxLevel: 50,
      },
      {
        id: 'multiplier',
        name: 'Golden Touch',
        description: 'x2 all income',
        baseCost: new BigNumber(10000),
        costMultiplier: 3.0,
        baseEffect: new BigNumber(2),
        level: 0,
        maxLevel: 10,
      },
    ];
  }

  click(): BigNumber {
    this.currency = this.currency.add(this.clickPower);
    return this.clickPower;
  }

  update(dt: number): void {
    // Auto income
    const income = this.autoIncome.multiply(new BigNumber(dt));
    this.currency = this.currency.add(income);
  }

  getUpgradeCost(upgrade: Upgrade): BigNumber {
    return upgrade.baseCost.multiply(
      new BigNumber(Math.pow(upgrade.costMultiplier, upgrade.level))
    );
  }

  canAfford(upgrade: Upgrade): boolean {
    return this.currency.isGreaterThan(this.getUpgradeCost(upgrade));
  }

  buyUpgrade(upgradeId: string): boolean {
    const upgrade = this.upgrades.find((u) => u.id === upgradeId);
    if (!upgrade || upgrade.level >= upgrade.maxLevel) return false;

    const cost = this.getUpgradeCost(upgrade);
    if (!this.currency.isGreaterThan(cost)) return false;

    // Deduct cost (would need subtract method on BigNumber)
    upgrade.level++;

    // Apply effect
    this.recalculateIncome();
    return true;
  }

  private recalculateIncome(): void {
    this.clickPower = new BigNumber(1);
    this.autoIncome = new BigNumber(0);

    for (const upgrade of this.upgrades) {
      if (upgrade.level === 0) continue;

      if (upgrade.id.startsWith('click')) {
        this.clickPower = this.clickPower.add(
          upgrade.baseEffect.multiply(new BigNumber(upgrade.level))
        );
      } else if (upgrade.id.startsWith('auto')) {
        this.autoIncome = this.autoIncome.add(
          upgrade.baseEffect.multiply(new BigNumber(upgrade.level))
        );
      } else if (upgrade.id === 'multiplier') {
        const multiplier = new BigNumber(Math.pow(2, upgrade.level));
        this.clickPower = this.clickPower.multiply(multiplier);
        this.autoIncome = this.autoIncome.multiply(multiplier);
      }
    }
  }
}
```

### Hook: Fast Progression

```typescript
// In playable ad: compress 1 hour of gameplay into 15 seconds
class PlayableIdleHook {
  // Massively boost all rates for the ad
  private readonly adSpeedMultiplier = 100;

  // Auto-buy upgrades to show progression
  update(game: IdleGame, elapsed: number): void {
    // Every 2 seconds, auto-buy the cheapest affordable upgrade
    if (elapsed % 2 < 0.016) {
      // Find and buy cheapest affordable upgrade
      // This shows the player "look how fast you progress!"
    }

    // At 12 seconds, show "prestige" opportunity
    if (elapsed >= 12) {
      // Show "Reset and earn 10x faster!"
      // Then show end card: "Download to keep playing"
    }
  }
}
```

---

## 6. Tower Defense

### Why It Works as a Playable Ad

- **Strategic satisfaction**: Placing towers feels meaningful
- **Visual spectacle**: Enemies dying, explosions, projectiles
- **Easy hook**: Overwhelming wave that needs just one more tower
- **Clear objective**: Protect the base
- **"Just one more" feeling**: Players want to try their strategy

### Core Mechanics

```typescript
interface Tower {
  readonly id: string;
  type: 'archer' | 'cannon' | 'ice' | 'laser';
  gridX: number;
  gridY: number;
  range: number;
  damage: number;
  fireRate: number; // Attacks per second
  lastFired: number;
  target: Enemy | null;
  level: number;
}

interface Enemy {
  readonly id: string;
  type: 'basic' | 'fast' | 'tank' | 'boss';
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  pathIndex: number; // Current position on path
  pathProgress: number; // 0-1 progress to next waypoint
  alive: boolean;
  frozen: boolean;
  frozenTimer: number;
}

interface Projectile {
  x: number;
  y: number;
  targetId: string;
  damage: number;
  speed: number;
  type: 'arrow' | 'cannonball' | 'icebolt' | 'beam';
}

interface Wave {
  readonly enemies: readonly WaveEntry[];
  readonly delayBetween: number; // Seconds between spawns
}

interface WaveEntry {
  readonly type: Enemy['type'];
  readonly count: number;
}
```

### Enemy Pathing (A\*)

```typescript
interface PathNode {
  readonly x: number;
  readonly y: number;
}

function findPath(
  grid: readonly boolean[][],
  start: PathNode,
  end: PathNode
): readonly PathNode[] {
  const rows = grid.length;
  const cols = grid[0].length;

  interface AStarNode {
    x: number;
    y: number;
    g: number; // Cost from start
    h: number; // Heuristic (Manhattan distance)
    f: number; // Total cost
    parent: AStarNode | null;
  }

  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>();

  const heuristic = (a: PathNode, b: PathNode): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openSet.push(startNode);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (openSet.length > 0) {
    // Find node with lowest f score
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openSet[lowestIdx];

    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: PathNode[] = [];
      let node: AStarNode | null = current;
      while (node !== null) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    openSet.splice(lowestIdx, 1);
    closedSet.add(`${current.x},${current.y}`);

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (grid[ny][nx]) continue; // Blocked
      if (closedSet.has(`${nx},${ny}`)) continue;

      const g = current.g + 1;
      const h = heuristic({ x: nx, y: ny }, end);
      const f = g + h;

      const existing = openSet.find((n) => n.x === nx && n.y === ny);
      if (existing && g >= existing.g) continue;

      if (existing) {
        existing.g = g;
        existing.f = f;
        existing.parent = current;
      } else {
        openSet.push({ x: nx, y: ny, g, h, f, parent: current });
      }
    }
  }

  return []; // No path found
}
```

### Hook: Overwhelming Wave

```typescript
// Let player place 2-3 towers, then send a huge wave
function createPlayableTDLevel(): {
  path: readonly PathNode[];
  waves: readonly Wave[];
} {
  return {
    path: [
      { x: 0, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 1 },
      { x: 6, y: 1 },
      { x: 6, y: 4 },
      { x: 9, y: 4 },
    ],
    waves: [
      // Wave 1: Easy, player succeeds
      {
        enemies: [{ type: 'basic', count: 3 }],
        delayBetween: 1,
      },
      // Wave 2: Harder, player barely survives
      {
        enemies: [
          { type: 'basic', count: 5 },
          { type: 'fast', count: 2 },
        ],
        delayBetween: 0.8,
      },
      // Wave 3: Overwhelming — triggers end card
      {
        enemies: [
          { type: 'basic', count: 10 },
          { type: 'tank', count: 3 },
          { type: 'boss', count: 1 },
        ],
        delayBetween: 0.5,
      },
    ],
  };
}
```

---

## 7. Dress-up/Makeover

### Why It Works as a Playable Ad

- **Self-expression**: Players love customizing characters
- **Before/after satisfaction**: Dramatic transformations are rewarding
- **Low cognitive load**: No puzzle solving, just aesthetic choices
- **Broad appeal**: Especially effective for casual game audiences
- **Social sharing**: "Look what I created" drives engagement

### Core Mechanics

```typescript
interface DressUpItem {
  readonly id: string;
  readonly category:
    | 'hair'
    | 'top'
    | 'bottom'
    | 'shoes'
    | 'accessory'
    | 'makeup';
  readonly spriteKey: string;
  readonly layer: number; // Z-order for rendering
  readonly anchorX: number;
  readonly anchorY: number;
  readonly colorizable: boolean;
}

interface CharacterState {
  readonly items: Map<string, DressUpItem>; // category -> equipped item
  readonly skinTone: string;
  readonly backgroundColor: string;
}

class DressUpGame {
  private character: CharacterState;
  private readonly availableItems: Map<string, readonly DressUpItem[]>;

  constructor() {
    this.character = {
      items: new Map(),
      skinTone: '#F4C8A0',
      backgroundColor: '#FFE4E1',
    };

    this.availableItems = new Map([
      [
        'hair',
        [
          {
            id: 'hair1',
            category: 'hair',
            spriteKey: 'hair_long',
            layer: 5,
            anchorX: 0,
            anchorY: -20,
            colorizable: true,
          },
          {
            id: 'hair2',
            category: 'hair',
            spriteKey: 'hair_short',
            layer: 5,
            anchorX: 0,
            anchorY: -15,
            colorizable: true,
          },
          {
            id: 'hair3',
            category: 'hair',
            spriteKey: 'hair_ponytail',
            layer: 5,
            anchorX: 5,
            anchorY: -18,
            colorizable: true,
          },
        ],
      ],
      [
        'top',
        [
          {
            id: 'top1',
            category: 'top',
            spriteKey: 'top_tshirt',
            layer: 3,
            anchorX: 0,
            anchorY: 80,
            colorizable: true,
          },
          {
            id: 'top2',
            category: 'top',
            spriteKey: 'top_dress',
            layer: 3,
            anchorX: 0,
            anchorY: 80,
            colorizable: true,
          },
        ],
      ],
      // ... more categories
    ]);
  }

  equipItem(item: DressUpItem): CharacterState {
    const newItems = new Map(this.character.items);
    newItems.set(item.category, item);

    this.character = {
      ...this.character,
      items: newItems,
    };

    return this.character;
  }

  // Layer-sorted rendering
  getLayeredItems(): DressUpItem[] {
    const items = Array.from(this.character.items.values());
    return items.sort((a, b) => a.layer - b.layer);
  }

  renderCharacter(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number
  ): void {
    // Draw body base
    this.drawBody(ctx, centerX, centerY);

    // Draw equipped items in layer order
    const layeredItems = this.getLayeredItems();
    for (const item of layeredItems) {
      this.drawItem(ctx, item, centerX + item.anchorX, centerY + item.anchorY);
    }
  }

  private drawBody(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = this.character.skinTone;
    // Draw body outline
    ctx.beginPath();
    ctx.ellipse(x, y, 30, 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: DressUpItem,
    x: number,
    y: number
  ): void {
    // Draw sprite from atlas at position
    // In production: ctx.drawImage(atlas, srcX, srcY, srcW, srcH, x, y, w, h)
    ctx.fillStyle = '#ccc';
    ctx.fillRect(x - 25, y, 50, 50);
  }
}
```

### Hook: Dramatic Transformation

```typescript
// Before/after reveal creates the hook
class MakeoverHook {
  private phase: 'before' | 'dressing' | 'reveal' = 'before';

  showBeforeState(ctx: CanvasRenderingContext2D): void {
    // Show "plain" character with messy hair, old clothes
    // Exaggerate the "before" to make transformation dramatic
  }

  showReveal(ctx: CanvasRenderingContext2D): void {
    // Animated transition: curtain wipe, sparkle effects
    // Show the dressed-up character
    // Big "WOW!" effect
    // Then end card: "Create YOUR character!"
  }
}
```

---

## 8. Solitaire/Card Games

### Why It Works as a Playable Ad

- **Familiar mechanics**: Most people know solitaire
- **Satisfying completion**: Moving cards into place feels rewarding
- **Low stress**: No time pressure (or optional timer)
- **Easy hook**: Pre-arrange a winning hand
- **Older demographic**: Reaches audiences other genres miss

### Core Mechanics

```typescript
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
  faceUp: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

interface Deck {
  readonly cards: Card[];
}

function createDeck(): Deck {
  const suits: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const cards: Card[] = [];

  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({
        suit,
        rank: rank as Rank,
        faceUp: false,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
      });
    }
  }

  return { cards };
}

function shuffleDeck(deck: Deck): Deck {
  const shuffled = [...deck.cards];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return { cards: shuffled };
}
```

### Drag and Snap System

```typescript
interface DragState {
  isDragging: boolean;
  card: Card | null;
  offsetX: number;
  offsetY: number;
  sourceStack: string;
}

interface SnapTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly accepts: (card: Card) => boolean;
}

class CardDragSystem {
  private dragState: DragState = {
    isDragging: false,
    card: null,
    offsetX: 0,
    offsetY: 0,
    sourceStack: '',
  };

  private readonly snapTargets: SnapTarget[] = [];

  beginDrag(
    card: Card,
    touchX: number,
    touchY: number,
    sourceStack: string
  ): void {
    this.dragState = {
      isDragging: true,
      card,
      offsetX: touchX - card.x,
      offsetY: touchY - card.y,
      sourceStack,
    };
  }

  updateDrag(touchX: number, touchY: number): void {
    if (!this.dragState.isDragging || !this.dragState.card) return;

    this.dragState.card.x = touchX - this.dragState.offsetX;
    this.dragState.card.y = touchY - this.dragState.offsetY;
  }

  endDrag(): SnapResult {
    if (!this.dragState.isDragging || !this.dragState.card) {
      return { snapped: false, targetId: '' };
    }

    const card = this.dragState.card;

    // Find closest valid snap target
    let bestTarget: SnapTarget | null = null;
    let bestDistance = Infinity;

    for (const target of this.snapTargets) {
      if (!target.accepts(card)) continue;

      const dx = card.x - target.x;
      const dy = card.y - target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 80 && distance < bestDistance) {
        // Snap radius
        bestTarget = target;
        bestDistance = distance;
      }
    }

    if (bestTarget) {
      // Animate card to snap position
      card.targetX = bestTarget.x;
      card.targetY = bestTarget.y;

      this.dragState = {
        isDragging: false,
        card: null,
        offsetX: 0,
        offsetY: 0,
        sourceStack: '',
      };

      return { snapped: true, targetId: bestTarget.id };
    }

    // Return to original position
    // (would animate back to source stack position)
    this.dragState = {
      isDragging: false,
      card: null,
      offsetX: 0,
      offsetY: 0,
      sourceStack: '',
    };

    return { snapped: false, targetId: '' };
  }
}

interface SnapResult {
  readonly snapped: boolean;
  readonly targetId: string;
}
```

### Valid Move Detection

```typescript
class SolitaireRules {
  // Klondike solitaire rules

  canPlaceOnTableau(card: Card, targetCard: Card | null): boolean {
    if (targetCard === null) {
      // Only kings on empty tableau
      return card.rank === 13;
    }

    // Must be opposite color and one rank lower
    return (
      this.isOppositeColor(card, targetCard) &&
      card.rank === targetCard.rank - 1
    );
  }

  canPlaceOnFoundation(card: Card, topCard: Card | null): boolean {
    if (topCard === null) {
      // Only aces on empty foundation
      return card.rank === 1;
    }

    // Same suit, one rank higher
    return card.suit === topCard.suit && card.rank === topCard.rank + 1;
  }

  isOppositeColor(a: Card, b: Card): boolean {
    const redSuits: readonly Suit[] = ['hearts', 'diamonds'];
    const aIsRed = redSuits.includes(a.suit);
    const bIsRed = redSuits.includes(b.suit);
    return aIsRed !== bIsRed;
  }

  findValidMoves(
    tableauPiles: Card[][],
    foundationPiles: Card[][],
    stock: Card[]
  ): Array<{ from: string; to: string; card: Card }> {
    const moves: Array<{ from: string; to: string; card: Card }> = [];

    // Check tableau to foundation moves
    for (let i = 0; i < tableauPiles.length; i++) {
      const pile = tableauPiles[i];
      if (pile.length === 0) continue;
      const topCard = pile[pile.length - 1];

      for (let f = 0; f < foundationPiles.length; f++) {
        const foundTop =
          foundationPiles[f].length > 0
            ? foundationPiles[f][foundationPiles[f].length - 1]
            : null;
        if (this.canPlaceOnFoundation(topCard, foundTop)) {
          moves.push({
            from: `tableau-${i}`,
            to: `foundation-${f}`,
            card: topCard,
          });
        }
      }
    }

    // Check tableau to tableau moves
    for (let i = 0; i < tableauPiles.length; i++) {
      const pile = tableauPiles[i];
      if (pile.length === 0) continue;

      // Find first face-up card in pile
      for (let cardIdx = 0; cardIdx < pile.length; cardIdx++) {
        if (!pile[cardIdx].faceUp) continue;
        const card = pile[cardIdx];

        for (let j = 0; j < tableauPiles.length; j++) {
          if (i === j) continue;
          const targetPile = tableauPiles[j];
          const targetTop =
            targetPile.length > 0 ? targetPile[targetPile.length - 1] : null;

          if (this.canPlaceOnTableau(card, targetTop)) {
            moves.push({
              from: `tableau-${i}`,
              to: `tableau-${j}`,
              card,
            });
          }
        }
      }
    }

    return moves;
  }
}
```

### Hook: Pre-Arranged Winning Hand

```typescript
function createWinnableLayout(): {
  tableauPiles: Card[][];
  stock: Card[];
  foundationPiles: Card[][];
} {
  // Instead of random shuffle, arrange cards so that:
  // 1. First few moves are obvious (face-up cards that can go to foundation)
  // 2. Aces are accessible early
  // 3. The game is solvable in ~10 moves (15 seconds)
  // 4. After 3-4 successful moves, show end card

  const deck = createDeck();
  const tableauPiles: Card[][] = Array.from({ length: 7 }, () => []);
  const foundationPiles: Card[][] = [[], [], [], []];

  // Place Ace of Hearts face-up on first tableau pile
  const aceHearts = deck.cards.find(
    (c) => c.suit === 'hearts' && c.rank === 1
  )!;
  aceHearts.faceUp = true;
  tableauPiles[0].push(aceHearts);

  // Place 2 of Hearts face-up on second pile
  const twoHearts = deck.cards.find(
    (c) => c.suit === 'hearts' && c.rank === 2
  )!;
  twoHearts.faceUp = true;
  tableauPiles[1].push(twoHearts);

  // ... arrange remaining cards for a satisfying sequence

  return {
    tableauPiles,
    stock: [], // Minimal stock needed
    foundationPiles,
  };
}
```

---

## Interview Questions

### Q1: "If you had to build a playable ad for a Match-3 game from scratch, what would your first 3 hours look like?"

**Strong Answer:**

"I'd divide the first 3 hours into setup, core mechanics, and game flow.

**Hour 1: Project Setup + Grid**

- TypeScript + esbuild config for single-file output
- Canvas setup with responsive sizing
- Grid data structure (2D array of cell types)
- Render the grid with colored rectangles (no sprites yet)
- Basic touch input to select cells

**Hour 2: Match + Cascade**

- Swap two adjacent cells on touch
- Match detection (horizontal + vertical scan for 3+)
- Remove matched cells (mark as empty)
- Gravity (cells fall to fill gaps)
- Refill (new random cells from top)
- Loop: match → remove → gravity → refill → recheck

**Hour 3: Game Flow**

- Tutorial screen with animated hand showing first swap
- Timer (25 seconds)
- Score display with combo multiplier
- End card with CTA button
- MRAID bridge for CTA click

At the 3-hour mark, I'd have a playable prototype with placeholder art. The next day would be polish: sprite atlas, particles, sound effects, and optimization."

---

### Q2: "How would you implement a big number system for an idle game? Why can't you just use JavaScript numbers?"

**Strong Answer:**

"JavaScript numbers are IEEE 754 doubles, which have precision up to about 2^53 (approximately 9 × 10^15 or 9 quadrillion). Idle games regularly reach numbers like 10^300 or higher.

Beyond 2^53, you lose integer precision:

```typescript
console.log(9007199254740992 + 1); // 9007199254740992 (same!)
```

And beyond ~1.8 × 10^308, you get Infinity.

**My implementation uses mantissa + exponent:**

- Store numbers as `mantissa × 10^exponent`
- Mantissa is always between 1.0 and 9.999...
- Exponent can be any integer

**Key operations:**

- Addition: Align exponents, add mantissas, renormalize
- Multiplication: Multiply mantissas, add exponents, renormalize
- Comparison: Compare exponents first, then mantissas
- Display: Map exponents to suffixes (K, M, B, T, Qa, Qi, ...)

**For a playable ad specifically**, I might just cap numbers at 10^15 and use regular numbers, since the ad only runs for 15-30 seconds. But if the real game uses big numbers, the ad should too for authenticity."

---

### Q3: "Compare two genres for playable ad effectiveness: Match-3 vs Tower Defense. Which would you recommend and why?"

**Strong Answer:**

"Both can work, but Match-3 is generally more effective for playable ads. Here's my analysis:

**Match-3 advantages for playable ads:**

- Universal recognition (nearly zero learning curve)
- Single mechanic to demonstrate (swap to match)
- Satisfying feedback in 5 seconds (cascade combo)
- Works perfectly in 15s window
- Simple touch input (tap/swipe)
- Small scope = faster production = more variants to test

**Tower Defense challenges as playable ad:**

- More complex concept (place towers, enemies path, damage)
- Needs 5-10 seconds just to explain the mechanic
- Strategic depth requires more time than 15-30 seconds allows
- Multiple interaction types (select tower type, place on grid)
- Harder to create a satisfying arc in short time

**When Tower Defense works:**

- If the advertised game IS a tower defense game
- If you simplify to 'place 2 towers, watch the action'
- If you focus on the visual spectacle (explosions, effects)

**My recommendation:**
For a generic casual game ad, Match-3 wins. It has the highest engagement-to-time ratio.

For advertising a specific tower defense game, I'd build a TD playable but simplify heavily: pre-place most towers, let the player place 1-2, then overwhelm them with a boss wave. The hook is 'you need more towers to beat this!' which drives the install.

The key insight: the best genre for the playable ad is the one that creates the strongest emotional hook in 10 seconds, not necessarily the one that's most faithful to the real game."

---

### Q4: "Walk me through implementing cascade logic in a Match-3 game."

**Strong Answer:**

"The cascade is the core satisfaction loop in Match-3. It runs in a cycle until no more matches are found.

**The cascade cycle:**

```
1. MATCH DETECTION
   Scan every row horizontally and every column vertically
   Find sequences of 3+ same-type cells
   Mark all matched cells

2. REMOVAL
   Delete matched cells (set type to -1/empty)
   Calculate score: base × combo multiplier
   Increment combo counter
   Check for special piece creation:
   - 4 in a row → creates line clear piece
   - 5 in a row → creates bomb piece
   Spawn particle effects at removed cells

3. GRAVITY
   For each column, from bottom to top:
   Compact non-empty cells downward
   Empty cells bubble to top
   This is like removing gaps from an array

4. REFILL
   Fill empty cells at top with new random types
   New cells should 'fall in' from above (animated)

5. RECHECK
   Go back to step 1
   This creates cascading chains!
   Each cascade increments the combo multiplier

6. DONE
   When step 1 finds no matches, cascade is complete
   Reset combo multiplier
   Return control to player
```

**Implementation detail:** I separate the logic from the animation. The cascade engine runs all steps synchronously and produces a list of 'CascadeStep' objects. The renderer then plays back each step with appropriate timing (0.3s for removal, 0.3s for gravity, 0.2s for refill, then repeat).

**Common bug to watch for:** After refill, the new random cells might themselves create matches. This is intentional -- it creates the cascading effect players love. But you must loop until truly no matches remain, or the board will be in an inconsistent state."

---

### Q5: "How do you design the 'hook' moment in different game genres?"

**Strong Answer:**

"The hook is the moment that creates the strongest emotional response, making the player want more. It should occur in the first 5-10 seconds.

**My framework for designing hooks:**

1. **Match-3: The Pre-Loaded Combo**

   - Rig the board so the first swap the tutorial guides them to creates a 4-5 chain cascade
   - The screen fills with points, effects, and satisfying sounds
   - Emotion: 'I'm SO good at this game!'

2. **Endless Runner: The Near-Miss Crash**

   - Let them run successfully, collecting coins, feeling fast
   - Speed increases gradually
   - At 10-12 seconds, spawn an unavoidable wall
   - Slow-mo as they approach it
   - Emotion: 'I was doing so well! I want to try again!'

3. **Puzzle (Pull the Pin): The Obvious Solution**

   - Show a puzzle where the solution is immediately visible
   - When they solve it, balls cascade satisfyingly into the goal
   - Then show a harder puzzle they can't quite solve
   - Emotion: 'I can figure this out, let me keep going!'

4. **Idle/Clicker: The Exponential Ramp**

   - Compress 30 minutes of progression into 10 seconds
   - Numbers go from 1 → 100 → 10K → 1M visually
   - Auto-unlock upgrades in rapid succession
   - Emotion: 'Look how fast I'm progressing!'

5. **Tower Defense: The Overwhelming Wave**
   - Let them place 2-3 towers and beat wave 1 easily
   - Wave 2 sends enemies they can barely handle
   - Wave 3 sends a boss with massive health bar
   - Emotion: 'I need more towers! Let me try again!'

**The universal principle:** Give the player a taste of success, then show them something JUST beyond reach. The gap between 'what I achieved' and 'what's possible' drives the install."
