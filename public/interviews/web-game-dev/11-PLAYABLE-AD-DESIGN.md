# Playable Ad Game Design

## Table of Contents

1. [Hook-Play-CTA Framework](#hook-play-cta-framework)
2. [Tutorial Design](#tutorial-design)
3. [Difficulty Curve](#difficulty-curve)
4. [Engagement Psychology](#engagement-psychology)
5. [Popular Genre Breakdown](#popular-genre-breakdown)
6. [End Card Design](#end-card-design)
7. [A/B Testing](#ab-testing)
8. [Common Mistakes](#common-mistakes)
9. [Design Document Template](#design-document-template)
10. [Metrics and Analytics](#metrics-and-analytics)
11. [Interview Questions](#interview-questions)

---

## Hook-Play-CTA Framework

Every playable ad follows a three-act structure. The timing is critical -- users decide within 3 seconds whether to engage, and the entire experience must complete in 15-30 seconds.

### Act 1: Hook (0-3 seconds)

The hook must immediately communicate "what is this?" and "why should I care?" without any text.

```
HOOK STRATEGIES:
─────────────────────────────────────────────────────
Strategy         │ Example                │ When to Use
─────────────────┼────────────────────────┼──────────────
Visual spectacle │ Explosive particle     │ Action games
                 │ effect, satisfying     │
                 │ cascade                │
─────────────────┼────────────────────────┼──────────────
Problem/desire   │ Show a messy room,     │ Puzzle/casual
                 │ unorganized items,     │ games
                 │ unsolved puzzle        │
─────────────────┼────────────────────────┼──────────────
Social proof     │ "50M+ Downloads"       │ Established
                 │ briefly shown          │ titles
─────────────────┼────────────────────────┼──────────────
Challenge        │ "Can you reach         │ Skill-based
                 │ level 5?"             │ games
─────────────────┼────────────────────────┼──────────────
Auto-play demo   │ Show a few seconds     │ Complex
                 │ of gameplay before     │ mechanics
                 │ handing control        │
```

### Act 2: Play (3-25 seconds)

The core gameplay loop. This is where the user experiences the game mechanics.

```typescript
interface PlayPhaseConfig {
  // Gameplay timing
  minPlayTime: number;      // Minimum time before showing end card (seconds)
  maxPlayTime: number;      // Maximum play time before forcing end card
  idealPlayTime: number;    // Target play duration for best conversion

  // Difficulty
  startDifficulty: number;  // 0-1, should be very low (0.1-0.2)
  endDifficulty: number;    // 0-1, should feel challenging but not frustrating
  difficultyRampStart: number; // When to start ramping (seconds)

  // Progression
  numLevels: number;        // 1-3 levels typically
  showProgressBar: boolean; // Visual progress indicator
  rewardFrequency: number;  // How often the player gets a reward (seconds)

  // CTA triggers
  triggerEndCardOn: 'timer' | 'lives' | 'levelComplete' | 'fail';
}

const RECOMMENDED_CONFIG: PlayPhaseConfig = {
  minPlayTime: 8,
  maxPlayTime: 25,
  idealPlayTime: 15,
  startDifficulty: 0.1,
  endDifficulty: 0.6,
  difficultyRampStart: 5,
  numLevels: 2,
  showProgressBar: true,
  rewardFrequency: 3,
  triggerEndCardOn: 'fail',
};
```

### Act 3: CTA (25-30 seconds)

The call-to-action phase converts players into installs. The transition from gameplay to CTA should feel natural, not abrupt.

```
CTA TRANSITION TRIGGERS (in order of effectiveness):
─────────────────────────────────────────────────────
1. "Almost won" moment  → Player fails at the last moment
                          → "So close! Install to keep playing"
                          → Highest conversion rate

2. Level completion      → Player completes a level
                          → "Great job! Play more levels"
                          → Good for puzzle games

3. Timer expiry          → Time runs out mid-gameplay
                          → "Time's up! Install for unlimited play"
                          → Safe fallback

4. Lives exhausted       → Player runs out of lives
                          → "Out of lives! Install for more"
                          → Natural for casual games
```

### Implementation of the Three-Act Structure

```typescript
class PlayableAdDirector {
  private phase: 'hook' | 'play' | 'cta' = 'hook';
  private phaseTimer: number = 0;
  private config: PlayPhaseConfig;
  private hasInteracted: boolean = false;
  private score: number = 0;
  private lives: number = 3;
  private ctaShown: boolean = false;

  constructor(config: PlayPhaseConfig) {
    this.config = config;
  }

  onUserInteraction(): void {
    this.hasInteracted = true;
    if (this.phase === 'hook') {
      this.transitionTo('play');
    }
  }

  update(dt: number): void {
    this.phaseTimer += dt;

    switch (this.phase) {
      case 'hook':
        // Auto-transition to play after 3 seconds
        if (this.phaseTimer > 3) {
          this.transitionTo('play');
        }
        break;

      case 'play':
        // Check end conditions
        if (this.phaseTimer > this.config.maxPlayTime) {
          this.transitionTo('cta');
        }
        break;

      case 'cta':
        // Animate CTA elements
        break;
    }
  }

  onPlayerFail(): void {
    if (this.phase !== 'play') return;

    this.lives--;

    if (this.lives <= 0 && this.phaseTimer >= this.config.minPlayTime) {
      this.transitionTo('cta');
    }
  }

  onLevelComplete(): void {
    if (this.phase !== 'play') return;

    if (this.config.triggerEndCardOn === 'levelComplete') {
      this.transitionTo('cta');
    }
  }

  getDifficulty(): number {
    if (this.phase !== 'play') return this.config.startDifficulty;

    const elapsed = this.phaseTimer - this.config.difficultyRampStart;
    if (elapsed <= 0) return this.config.startDifficulty;

    const rampDuration = this.config.maxPlayTime - this.config.difficultyRampStart;
    const t = Math.min(elapsed / rampDuration, 1);

    // Ease-in curve for natural-feeling difficulty ramp
    const eased = t * t;
    return this.config.startDifficulty +
      (this.config.endDifficulty - this.config.startDifficulty) * eased;
  }

  private transitionTo(phase: 'hook' | 'play' | 'cta'): void {
    this.phase = phase;
    this.phaseTimer = 0;
  }

  getPhase(): string {
    return this.phase;
  }

  shouldShowCTA(): boolean {
    return this.phase === 'cta';
  }
}
```

---

## Tutorial Design

### Principles

1. **No text**: Playable ads run globally. Text requires localization and takes up screen space. Use visual-only tutorials.
2. **Animated hand**: A finger/hand sprite animating the required gesture is universally understood.
3. **Progressive disclosure**: Teach one mechanic at a time. Never show all controls at once.
4. **Auto-play if idle**: If the user does not interact within 3 seconds, play the first move automatically.
5. **Dismiss on interaction**: As soon as the user performs the correct action, remove the tutorial overlay immediately.

### Animated Tutorial Hand

```typescript
interface TutorialStep {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  gesture: 'tap' | 'swipe' | 'drag' | 'hold';
  duration: number;     // Animation duration in seconds
  pauseAfter: number;   // Pause between repetitions
  highlightArea?: { x: number; y: number; w: number; h: number };
}

class TutorialHand {
  private handImage: HTMLImageElement;
  private currentStep: TutorialStep | null = null;
  private timer: number = 0;
  private visible: boolean = false;
  private alpha: number = 1;
  private currentX: number = 0;
  private currentY: number = 0;
  private scale: number = 1;

  constructor(handImage: HTMLImageElement) {
    this.handImage = handImage;
  }

  showStep(step: TutorialStep): void {
    this.currentStep = step;
    this.timer = 0;
    this.visible = true;
    this.currentX = step.startPos.x;
    this.currentY = step.startPos.y;
  }

  hide(): void {
    this.visible = false;
    this.currentStep = null;
  }

  update(dt: number): void {
    if (!this.visible || !this.currentStep) return;

    const step = this.currentStep;
    const totalDuration = step.duration + step.pauseAfter;
    this.timer += dt;

    // Loop the animation
    const cycleTime = this.timer % totalDuration;

    if (cycleTime < step.duration) {
      // Animating
      const t = cycleTime / step.duration;
      const eased = this.easeInOutQuad(t);

      this.currentX = step.startPos.x +
        (step.endPos.x - step.startPos.x) * eased;
      this.currentY = step.startPos.y +
        (step.endPos.y - step.startPos.y) * eased;
      this.alpha = 1;

      // Scale animation for tap gesture
      if (step.gesture === 'tap') {
        if (t < 0.3) {
          this.scale = 1;
        } else if (t < 0.5) {
          this.scale = 1 - (t - 0.3) * 1.5; // Press down
        } else if (t < 0.7) {
          this.scale = 0.7 + (t - 0.5) * 1.5; // Release
        } else {
          this.scale = 1;
        }
      } else {
        this.scale = 1;
      }
    } else {
      // Pause between repetitions
      this.alpha = 0.5;
      this.currentX = step.startPos.x;
      this.currentY = step.startPos.y;
      this.scale = 1;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || !this.currentStep) return;

    // Draw highlight area if specified
    if (this.currentStep.highlightArea) {
      const area = this.currentStep.highlightArea;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(area.x, area.y, area.w, area.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw hand
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.currentX, this.currentY);
    ctx.scale(this.scale, this.scale);

    const handSize = 64;
    ctx.drawImage(
      this.handImage,
      -handSize * 0.3, // Offset so fingertip is at position
      -handSize * 0.1,
      handSize,
      handSize
    );
    ctx.restore();
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}
```

### Auto-Play on Idle

```typescript
class TutorialController {
  private hand: TutorialHand;
  private idleTimer: number = 0;
  private idleThreshold: number = 3; // seconds
  private autoPlayTriggered: boolean = false;
  private steps: TutorialStep[];
  private currentStepIndex: number = 0;
  private onAutoPlay: (step: TutorialStep) => void;

  constructor(
    hand: TutorialHand,
    steps: TutorialStep[],
    onAutoPlay: (step: TutorialStep) => void
  ) {
    this.hand = hand;
    this.steps = steps;
    this.onAutoPlay = onAutoPlay;

    if (steps.length > 0) {
      this.hand.showStep(steps[0]);
    }
  }

  update(dt: number, hasUserInput: boolean): void {
    if (hasUserInput) {
      this.idleTimer = 0;
      this.autoPlayTriggered = false;
    } else {
      this.idleTimer += dt;
    }

    // Auto-play if user is idle
    if (
      this.idleTimer >= this.idleThreshold &&
      !this.autoPlayTriggered &&
      this.currentStepIndex < this.steps.length
    ) {
      this.autoPlayTriggered = true;
      this.onAutoPlay(this.steps[this.currentStepIndex]);
    }

    this.hand.update(dt);
  }

  completeCurrentStep(): void {
    this.currentStepIndex++;
    if (this.currentStepIndex < this.steps.length) {
      this.hand.showStep(this.steps[this.currentStepIndex]);
      this.idleTimer = 0;
      this.autoPlayTriggered = false;
    } else {
      this.hand.hide();
    }
  }

  isComplete(): boolean {
    return this.currentStepIndex >= this.steps.length;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.hand.render(ctx);
  }
}
```

### Tutorial Examples by Genre

```
MATCH-3:
  Step 1: Hand swipes from candy A to candy B (creates a match)
  Step 2: Auto-play resolves the match if user doesn't act within 3s
  Note: Pre-configure the starting board so the match is obvious

RUNNER:
  Step 1: Hand taps screen → character jumps
  Step 2: Hand swipes left/right → character changes lane
  Note: First obstacle is far enough that auto-play can still clear it

PUZZLE (drag items):
  Step 1: Hand drags item from position A to target position B
  Step 2: Auto-play performs the drag if idle
  Note: First item should have an obvious correct placement

MERGE:
  Step 1: Hand drags item A onto identical item B → they merge
  Step 2: Merged item sparkles / celebrates
  Note: Start with two identical items adjacent to each other

IDLE/CLICKER:
  Step 1: Hand taps the money/resource button repeatedly
  Step 2: Numbers go up, satisfying particles
  Note: Idle games are the easiest to tutorial -- just tap
```

---

## Difficulty Curve

### The "Almost Won" Principle

The ideal playable ad difficulty curve makes the player feel they were close to winning but did not quite make it. This creates a desire to install the game and "finish what they started."

```
DIFFICULTY CURVE FOR PLAYABLE ADS:

Difficulty
│
│                              ╱╱╱╱  ← End card triggers here
│                           ╱╱╱       (player fails)
│                        ╱╱╱
│                     ╱╱╱
│                  ╱╱
│               ╱╱
│            ╱╱
│         ╱╱
│      ╱╱
│  ╱╱╱╱
│╱╱╱╱  ← Very easy start
├─────────────────────────────────── Time
0s    5s    10s    15s    20s   25s

Compare with traditional game difficulty:

Difficulty
│
│                                    ╱╱╱
│                              ╱╱╱╱╱
│                        ╱╱╱╱╱
│                  ╱╱╱╱╱
│            ╱╱╱╱╱
│      ╱╱╱╱╱
│╱╱╱╱╱╱  ← Gradual learning curve
├─────────────────────────────────── Time
0     5min   10min   30min   1hr

Playable ads compress the entire experience.
```

### Difficulty Implementation

```typescript
class DifficultyManager {
  private config: {
    startSpeed: number;
    maxSpeed: number;
    startSpawnRate: number;
    maxSpawnRate: number;
    startObstacleCount: number;
    maxObstacleCount: number;
    rampStartTime: number;   // When difficulty starts increasing
    rampEndTime: number;     // When difficulty reaches maximum
  };

  constructor() {
    this.config = {
      startSpeed: 100,
      maxSpeed: 300,
      startSpawnRate: 1,       // Spawns per second
      maxSpawnRate: 4,
      startObstacleCount: 1,
      maxObstacleCount: 5,
      rampStartTime: 3,       // Start ramping at 3 seconds
      rampEndTime: 20,        // Reach max at 20 seconds
    };
  }

  private getRampFactor(elapsedTime: number): number {
    if (elapsedTime < this.config.rampStartTime) return 0;

    const rampDuration = this.config.rampEndTime - this.config.rampStartTime;
    const rampElapsed = elapsedTime - this.config.rampStartTime;
    const t = Math.min(rampElapsed / rampDuration, 1);

    // Quadratic ease-in: slow start, fast ramp at end
    return t * t;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  getSpeed(elapsedTime: number): number {
    const t = this.getRampFactor(elapsedTime);
    return this.lerp(this.config.startSpeed, this.config.maxSpeed, t);
  }

  getSpawnRate(elapsedTime: number): number {
    const t = this.getRampFactor(elapsedTime);
    return this.lerp(
      this.config.startSpawnRate,
      this.config.maxSpawnRate,
      t
    );
  }

  getObstacleCount(elapsedTime: number): number {
    const t = this.getRampFactor(elapsedTime);
    return Math.floor(
      this.lerp(
        this.config.startObstacleCount,
        this.config.maxObstacleCount,
        t
      )
    );
  }

  // Ensure the player can always progress
  // Never make it literally impossible -- just hard
  shouldGuaranteeEasyPattern(elapsedTime: number): boolean {
    // Every 5 seconds, give the player an easy pattern
    // to maintain the "I can do this" feeling
    return (elapsedTime % 5) < 0.5;
  }
}
```

### Level Progression for Multi-Level Playable Ads

```typescript
interface LevelConfig {
  levelNumber: number;
  duration: number;        // Seconds for this level
  targetScore: number;     // Score needed to "complete" the level
  difficulty: number;      // 0-1 base difficulty
  specialMechanic?: string; // Optional new mechanic introduced
  endCondition: 'timer' | 'score' | 'fail';
}

// Typical 2-level playable ad structure:
const LEVELS: LevelConfig[] = [
  {
    levelNumber: 1,
    duration: 12,
    targetScore: 100,
    difficulty: 0.2,
    endCondition: 'score',
    // Level 1: Easy, teaches basic mechanic
    // Player should always complete this level
    // Creates feeling of "I'm good at this!"
  },
  {
    levelNumber: 2,
    duration: 15,
    targetScore: 250,
    difficulty: 0.5,
    specialMechanic: 'obstacle', // Introduce one new element
    endCondition: 'fail',
    // Level 2: Harder, introduces a twist
    // Player fails here → "Almost had it!" → End card
    // Player completes → "Wow, you're great!" → End card
  },
];
```

---

## Engagement Psychology

### Variable Reward (Dopamine Loop)

Unpredictable rewards are more engaging than predictable ones. This is the core psychology behind slot machines and loot boxes.

```typescript
class RewardSystem {
  private baseRewardChance: number = 0.3;   // 30% chance per action
  private streakBonus: number = 0;
  private lastRewardTime: number = 0;
  private rewardDrought: number = 0;

  checkForReward(currentTime: number): {
    shouldReward: boolean;
    rewardType: 'small' | 'medium' | 'big';
    multiplier: number;
  } | null {
    // Increase chance if no reward in a while (pity timer)
    this.rewardDrought++;
    const adjustedChance = Math.min(
      this.baseRewardChance + this.rewardDrought * 0.05,
      0.8
    );

    if (Math.random() > adjustedChance) {
      return null;
    }

    this.rewardDrought = 0;
    this.lastRewardTime = currentTime;

    // Determine reward size (mostly small, occasionally big)
    const roll = Math.random();
    if (roll < 0.6) {
      return { shouldReward: true, rewardType: 'small', multiplier: 1 };
    } else if (roll < 0.9) {
      return { shouldReward: true, rewardType: 'medium', multiplier: 2 };
    } else {
      return { shouldReward: true, rewardType: 'big', multiplier: 5 };
    }
  }
}
```

### Near-Miss Effect

The near-miss creates a stronger drive to try again than either winning or losing clearly.

```typescript
class NearMissController {
  // For a runner game: obstacles appear to barely miss the player
  adjustObstacleForNearMiss(
    obstacle: { x: number; y: number; width: number },
    player: { x: number; y: number; width: number },
    closenessThreshold: number = 5
  ): { x: number; y: number; width: number } {
    // If the player will pass close to the obstacle,
    // make it even closer for dramatic effect
    const gapX = Math.abs(obstacle.x - player.x);
    if (gapX < closenessThreshold * 3 && gapX > closenessThreshold) {
      // Move obstacle slightly closer to player path
      const direction = obstacle.x > player.x ? -1 : 1;
      return {
        ...obstacle,
        x: obstacle.x + direction * (gapX - closenessThreshold),
      };
    }
    return obstacle;
  }

  // For a puzzle game: show how close the player was to the solution
  showNearMissUI(
    ctx: CanvasRenderingContext2D,
    achievedProgress: number,  // 0-1
    canvasWidth: number,
    canvasHeight: number
  ): void {
    // Progress bar showing "you were THIS close"
    const barWidth = canvasWidth * 0.7;
    const barHeight = 20;
    const barX = (canvasWidth - barWidth) / 2;
    const barY = canvasHeight * 0.4;

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Progress (e.g., 85% complete)
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(barX, barY, barWidth * achievedProgress, barHeight);

    // Goal marker
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(barX + barWidth, barY - 5);
    ctx.lineTo(barX + barWidth, barY + barHeight + 5);
    ctx.stroke();

    // "So close!" text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(achievedProgress * 100)}%`,
      canvasWidth / 2,
      barY + barHeight + 30
    );
  }
}
```

### Juicy Feedback

"Juice" makes interactions feel satisfying through exaggerated visual and audio feedback. In playable ads, juice is critical because you have seconds to make the game feel fun.

```typescript
class JuiceEffects {
  private shakeIntensity: number = 0;
  private shakeDecay: number = 10;
  private shakeOffsetX: number = 0;
  private shakeOffsetY: number = 0;

  // Screen shake
  triggerShake(intensity: number = 10): void {
    this.shakeIntensity = intensity;
  }

  updateShake(dt: number): void {
    if (this.shakeIntensity > 0.1) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.pow(0.1, dt * this.shakeDecay);
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  applyShake(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
  }

  // Scale pop (entity briefly grows then shrinks)
  static scalePop(
    currentTime: number,
    triggerTime: number,
    duration: number = 0.3,
    maxScale: number = 1.3
  ): number {
    const elapsed = currentTime - triggerTime;
    if (elapsed < 0 || elapsed > duration) return 1;

    const t = elapsed / duration;
    // Quick grow, slow shrink (overshoot curve)
    const scale = 1 + (maxScale - 1) * Math.sin(t * Math.PI) *
      Math.pow(1 - t, 0.5);
    return scale;
  }

  // Flash white (entity briefly turns white on hit)
  static flashWhite(
    ctx: CanvasRenderingContext2D,
    currentTime: number,
    triggerTime: number,
    duration: number = 0.1
  ): boolean {
    const elapsed = currentTime - triggerTime;
    if (elapsed < 0 || elapsed > duration) return false;

    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255, 255, 255, ${1 - elapsed / duration})`;
    return true;
  }

  // Number pop (floating "+100" text)
  static renderFloatingText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    startY: number,
    currentTime: number,
    triggerTime: number,
    duration: number = 1.0,
    color: string = '#FFD700'
  ): boolean {
    const elapsed = currentTime - triggerTime;
    if (elapsed < 0 || elapsed > duration) return false;

    const t = elapsed / duration;
    const y = startY - 50 * t; // Float upward
    const alpha = 1 - t * t;   // Fade out
    const scale = 1 + t * 0.5; // Grow slightly

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    return true;
  }
}

// Particle burst for satisfying feedback
class ParticleBurst {
  private particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
  }> = [];

  emit(
    x: number,
    y: number,
    count: number,
    colors: string[] = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFF']
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 100 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100, // Slight upward bias
        life: 0,
        maxLife: 0.3 + Math.random() * 0.5,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt; // Gravity
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.particles.forEach(p => {
      const alpha = 1 - (p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}
```

### Completion Desire

Humans have a strong drive to complete things that are almost finished. Use progress indicators to exploit this.

```typescript
// Show progress toward a goal
class ProgressIndicator {
  private current: number = 0;
  private target: number;
  private displayCurrent: number = 0; // Smoothly animated

  constructor(target: number) {
    this.target = target;
  }

  increment(amount: number = 1): void {
    this.current = Math.min(this.current + amount, this.target);
  }

  update(dt: number): void {
    // Smooth animation toward actual value
    this.displayCurrent += (this.current - this.displayCurrent) * dt * 8;
  }

  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const progress = this.displayCurrent / this.target;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();

    // Fill
    const fillWidth = Math.max(height, width * progress);
    const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
    gradient.addColorStop(0, '#4CAF50');
    gradient.addColorStop(1, '#8BC34A');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, fillWidth, height, height / 2);
    ctx.fill();

    // Star markers at milestones
    const milestones = [0.33, 0.66, 1.0];
    milestones.forEach((m, i) => {
      const mx = x + width * m;
      const achieved = progress >= m;
      ctx.fillStyle = achieved ? '#FFD700' : '#666';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(achieved ? '\u2605' : '\u2606', mx, y - 5);
    });

    // Counter text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(this.displayCurrent)}/${this.target}`,
      x + width / 2,
      y + height / 2 + 4
    );
  }

  getProgress(): number {
    return this.current / this.target;
  }

  isComplete(): boolean {
    return this.current >= this.target;
  }
}
```

### Loss Aversion

People feel losses more strongly than equivalent gains. Use this in playable ad design.

```
LOSS AVERSION TECHNIQUES:
─────────────────────────────────────────────────────────
Technique                │ Implementation
─────────────────────────┼───────────────────────────────
Countdown timer          │ Show time running out with
                         │ red flashing when low
─────────────────────────┼───────────────────────────────
Collected items at risk  │ Show items the player earned
                         │ that they'll "lose" if they
                         │ don't install
─────────────────────────┼───────────────────────────────
Progress about to reset  │ "You completed 85%! Install
                         │ to keep your progress"
─────────────────────────┼───────────────────────────────
Lives counting down      │ Visual heart icons breaking
                         │ one by one
─────────────────────────┼───────────────────────────────
Score at risk            │ "Your high score: 1,250"
                         │ shown on end card
```

---

## Popular Genre Breakdown

### Match-3

```
WHY IT WORKS FOR PLAYABLE ADS:
- Universally understood mechanic (swap to match)
- Satisfying cascade effects (dopamine)
- Easy to make "almost won" (one move from clearing board)
- Visually appealing (colorful, animated)

DESIGN:
- Grid: 5x7 or 6x8 (small enough to see on mobile)
- Tutorial: Animated hand swipes one obvious match
- Difficulty: Start with many matches, reduce over time
- End trigger: "Clear X tiles" goal, player gets to 85-95%
- Juice: Cascade animations, score popups, sparkle particles

SIZE BUDGET:
- Tile sprites: 6-8 types, 64x64px each → 50-100KB
- Effects: Procedural particles → 0KB
- Code: Grid logic, match detection → ~20KB minified
- Total: ~200-400KB (very playable-ad friendly)
```

### Runner

```
WHY IT WORKS:
- One-tap mechanic (jump/dodge)
- Instant understanding (avoid obstacles, collect items)
- Natural difficulty ramp (increase speed)
- Exciting near-misses

DESIGN:
- Controls: Tap to jump OR swipe left/right to change lanes
- Tutorial: Hand taps → character jumps over first obstacle
- Difficulty: Speed increases every 3 seconds
- End trigger: Collision with obstacle after 15+ seconds
- Juice: Speed lines, coin trails, dramatic slow-mo on near-miss

SIZE BUDGET:
- Character: 2-4 frame run cycle → 30-60KB
- Obstacles: 3-4 types → 40-80KB
- Background: Procedural or single parallax layer → 50-100KB
- Total: ~300-500KB
```

### Puzzle

```
WHY IT WORKS:
- Clear goal (solve the puzzle)
- Satisfying "aha" moment
- Easy to show "almost solved"
- Highly shareable ("look how clever I am")

DESIGN:
- Mechanic: Drag items to correct positions / connect dots / sort
- Tutorial: Hand drags first piece to correct position
- Difficulty: 2-3 levels, each more complex
- End trigger: Show an unsolvable level (too complex for 30 sec)
- Juice: Snap-into-place animation, completion sparkle

VARIANTS:
- Pin puzzle (pull pins in correct order)
- Merge/sort puzzle (organize by type/color)
- Path drawing (connect A to B)
```

### Merge

```
WHY IT WORKS:
- Deeply satisfying merge animation
- Progression feeling (items get bigger/better)
- Simple mechanic (drag same items together)
- Natural idle loop

DESIGN:
- Tutorial: Hand drags item A onto identical item B → merge!
- Progression: Show 3-4 merge levels (coin → small bag → big bag)
- Board: 3x3 or 4x4 grid
- End trigger: Board fills up (no more space to merge)
- Juice: Merge sparkle, item upgrade animation, coins flying

SIZE BUDGET:
- Items: 8-12 merge stages → 80-150KB (texture atlas)
- Board: Procedural grid → 0KB
- Total: ~200-400KB
```

### Idle/Clicker

```
WHY IT WORKS:
- Zero learning curve (just tap)
- Numbers go up (universally satisfying)
- Fast progression feeling
- Works well with no audio

DESIGN:
- Tutorial: Hand taps the button → money appears
- Core: Tap → earn currency → buy upgrades → earn more
- Show 2-3 upgrade tiers in 30 seconds
- End trigger: Tease next big upgrade that requires install
- Juice: Money particles, number animations, upgrade fanfare

SIZE BUDGET:
- UI elements: Buttons, icons → 50-100KB
- Numbers/text: Canvas rendering → 0KB
- Particles: Procedural → 0KB
- Total: ~150-300KB (lightest genre)
```

### Tower Defense

```
WHY IT WORKS:
- Strategic depth in simple mechanic (place towers)
- Visual satisfaction (towers shooting enemies)
- Clear win/loss (enemies reach base = lose)
- Natural "almost survived" ending

DESIGN:
- Tutorial: Hand places one tower on highlighted spot
- Waves: 3-4 short waves, enemies get harder
- Controls: Drag tower from panel to map position
- End trigger: Enemies overwhelm defenses in wave 3-4
- Juice: Projectile trails, enemy death animations, explosion effects

SIZE BUDGET:
- Towers: 3-4 types → 40-80KB
- Enemies: 3-4 types → 40-80KB
- Map: Procedural grid with path → 50-100KB
- Effects: Procedural particles → 0KB
- Total: ~300-500KB
```

### Dress-Up / Customization

```
WHY IT WORKS:
- Self-expression appeal
- No fail state (relaxing)
- Surprising depth from simple interactions
- Strong appeal for fashion/casual audience

DESIGN:
- Tutorial: Hand taps clothing item → it appears on character
- Options: 3-4 categories (hair, outfit, accessories)
- Progression: Unlock new items by tapping
- End trigger: "See all 1000+ items!" CTA after showing 10-15
- Juice: Sparkle on new item, mirror reflection animation

SIZE BUDGET:
- Character base: 1 sprite → 30-50KB
- Clothing items: 15-20 items → 150-300KB (texture atlas)
- UI: Category buttons → 20-40KB
- Total: ~300-500KB
```

---

## End Card Design

### Layout Structure

```
┌────────────────────────────────┐
│                                │
│     "You scored 1,250!"        │  ← Achievement text
│     ★★★☆☆                      │  ← Star rating (3/5)
│                                │
│    ┌──────────────────────┐    │
│    │                      │    │
│    │   Game Screenshots   │    │  ← App screenshots carousel
│    │   or Gameplay GIF    │    │
│    │                      │    │
│    └──────────────────────┘    │
│                                │
│    ┌──────────────────────┐    │
│    │                      │    │
│    │   INSTALL NOW  ➤     │    │  ← Primary CTA button
│    │                      │    │
│    └──────────────────────┘    │
│                                │
│    ★ 4.8  |  50M+ Downloads   │  ← Social proof
│                                │
│    [Continue Playing]          │  ← Secondary CTA (optional)
│                                │
└────────────────────────────────┘
```

### End Card Implementation

```typescript
interface EndCardConfig {
  title: string;
  score?: number;
  stars?: number;          // 0-5
  appIcon?: HTMLImageElement;
  screenshots?: HTMLImageElement[];
  ctaText: string;
  socialProof?: string;    // "50M+ Downloads"
  rating?: number;         // 4.8
  backgroundColor: string;
  ctaColor: string;
  textColor: string;
}

class EndCard {
  private config: EndCardConfig;
  private animationProgress: number = 0;
  private ctaPulseTimer: number = 0;
  private onCTA: () => void;

  constructor(config: EndCardConfig, onCTA: () => void) {
    this.config = config;
    this.onCTA = onCTA;
  }

  update(dt: number): void {
    // Animate elements appearing
    this.animationProgress = Math.min(this.animationProgress + dt * 2, 1);
    this.ctaPulseTimer += dt;
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    // Background panel
    const panelWidth = width * 0.85;
    const panelHeight = height * 0.75;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;

    // Slide-in animation
    const offsetY = (1 - this.easeOutBack(this.animationProgress)) * 200;

    ctx.save();
    ctx.translate(0, offsetY);

    // Panel background
    ctx.fillStyle = this.config.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
    ctx.fill();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;

    // Title
    const centerX = width / 2;
    ctx.fillStyle = this.config.textColor;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.config.title, centerX, panelY + 50);

    // Score
    if (this.config.score !== undefined) {
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(
        this.config.score.toLocaleString(),
        centerX,
        panelY + 95
      );
    }

    // Stars
    if (this.config.stars !== undefined) {
      const starY = panelY + 120;
      const starSize = 24;
      const totalWidth = 5 * starSize + 4 * 8;
      const startX = centerX - totalWidth / 2;

      for (let i = 0; i < 5; i++) {
        const filled = i < this.config.stars;
        ctx.fillStyle = filled ? '#FFD700' : '#666';
        ctx.font = `${starSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(
          filled ? '\u2605' : '\u2606',
          startX + i * (starSize + 8),
          starY
        );
      }
    }

    // CTA Button
    const ctaY = panelY + panelHeight - 100;
    const ctaWidth = panelWidth * 0.7;
    const ctaHeight = 56;
    const ctaX = centerX - ctaWidth / 2;

    // Pulse animation
    const pulse = 1 + Math.sin(this.ctaPulseTimer * 3) * 0.03;

    ctx.save();
    ctx.translate(centerX, ctaY + ctaHeight / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-centerX, -(ctaY + ctaHeight / 2));

    // Button shadow
    ctx.shadowColor = this.config.ctaColor;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = this.config.ctaColor;
    ctx.beginPath();
    ctx.roundRect(ctaX, ctaY, ctaWidth, ctaHeight, ctaHeight / 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Button text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.config.ctaText,
      centerX,
      ctaY + ctaHeight / 2 + 8
    );

    ctx.restore();

    // Social proof
    if (this.config.socialProof) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.config.socialProof,
        centerX,
        ctaY + ctaHeight + 30
      );
    }

    ctx.restore(); // Undo slide-in translate
  }

  handleTap(x: number, y: number, width: number, height: number): boolean {
    // Check if tap is within CTA button area
    const panelWidth = width * 0.85;
    const panelHeight = height * 0.75;
    const panelY = (height - panelHeight) / 2;
    const ctaY = panelY + panelHeight - 100;
    const ctaWidth = panelWidth * 0.7;
    const ctaHeight = 56;
    const ctaX = (width - ctaWidth) / 2;

    if (
      x >= ctaX && x <= ctaX + ctaWidth &&
      y >= ctaY && y <= ctaY + ctaHeight
    ) {
      this.onCTA();
      return true;
    }

    // Any tap on end card can also trigger CTA (generous hit area)
    this.onCTA();
    return true;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
```

### Multiple CTA Placements

```
BEST PRACTICE: Don't limit CTA to just the end card.
Place CTA triggers throughout the experience:

1. PERSISTENT CTA (small, non-intrusive)
   - Small "Download" button in corner during gameplay
   - Converts engaged users who are ready early

2. CONTEXTUAL CTA (triggered by game events)
   - After a satisfying cascade/combo: "Love this? Get the full game!"
   - After unlocking a feature: "Install for 100+ more levels!"

3. END CARD CTA (primary)
   - Full-screen end card with large CTA button
   - This is where most conversions happen

4. BACKGROUND CTA (entire screen tappable)
   - Make the entire end card background tappable
   - Users who tap anywhere get redirected to store
```

---

## A/B Testing

### What to Test

```
HIGH IMPACT (test these first):
─────────────────────────────────────────────
Element              │ Variants to Test
─────────────────────┼───────────────────────
CTA button text      │ "Install Now" vs "Play Now"
                     │ vs "Download Free"
─────────────────────┼───────────────────────
CTA button color     │ Green vs Orange vs Blue
─────────────────────┼───────────────────────
Game difficulty      │ Easy vs Medium vs Hard
                     │ (affects completion rate)
─────────────────────┼───────────────────────
Game duration        │ 15s vs 20s vs 25s
─────────────────────┼───────────────────────
End trigger          │ Timer vs Lives vs Level
                     │ Complete
─────────────────────┼───────────────────────
Tutorial presence    │ With tutorial vs without
─────────────────────┼───────────────────────

MEDIUM IMPACT:
─────────────────────────────────────────────
Color scheme         │ Match game's real theme
                     │ vs bright/attention-grabbing
─────────────────────┼───────────────────────
Sound effects        │ With audio vs silent
─────────────────────┼───────────────────────
End card design      │ Score-focused vs
                     │ screenshot-focused
─────────────────────┼───────────────────────
Number of levels     │ 1 level vs 2 levels
─────────────────────┼───────────────────────
Persistent CTA       │ Show during gameplay
                     │ vs end only
─────────────────────┼───────────────────────

LOW IMPACT (fine-tune later):
─────────────────────────────────────────────
Particle effects     │ More vs less
UI animations        │ Bouncier vs subtler
Tutorial hand speed  │ Faster vs slower
Background color     │ Various gradients
Score multipliers    │ Bigger numbers vs smaller
```

### How Networks Run Tests

```
AD NETWORK A/B TESTING WORKFLOW:
─────────────────────────────────────────────
1. Upload 2+ variants to the ad network dashboard
2. Network assigns each variant an equal share of impressions
3. After 1000-5000 impressions per variant, compare metrics
4. Statistical significance is reached (p < 0.05)
5. Winning variant gets 100% of traffic
6. Repeat with new variants

FACEBOOK:
  - Upload multiple playable creatives per ad set
  - Facebook's algorithm auto-optimizes for best performer
  - Minimum budget: $50-100/day per variant for meaningful data

IRONSOURCE:
  - Creative management tool with A/B testing
  - Split traffic evenly or use MAB (multi-armed bandit)

GOOGLE:
  - Responsive ads can include multiple playable variants
  - Google's ML selects best performer

UNITY ADS:
  - Upload variants, set traffic split
  - Dashboard shows per-creative metrics
```

### Key Metrics

```typescript
interface PlayableAdMetrics {
  // Impression and engagement
  impressions: number;      // Total times ad was shown
  engagements: number;      // Times user interacted (tapped/swiped)
  engagementRate: number;   // engagements / impressions

  // Conversion
  ctaClicks: number;        // Times CTA button was clicked
  ctr: number;              // Click-Through Rate = ctaClicks / impressions
  installs: number;         // Actual app installs
  ipm: number;              // Installs Per Mille = (installs / impressions) * 1000
  ivr: number;              // Install to View Rate = installs / impressions

  // Quality
  d1Retention: number;      // Day 1 retention rate of acquired users
  d7Retention: number;      // Day 7 retention rate
  ltv: number;              // Lifetime value of acquired users
  roas: number;             // Return on Ad Spend = revenue / adSpend

  // Playable-specific
  completionRate: number;   // % of users who reached end card
  avgPlayDuration: number;  // Average seconds of gameplay
  tutorialSkipRate: number; // % of users who skipped tutorial
}
```

```
METRIC BENCHMARKS:
─────────────────────────────────────────────
Metric          │ Poor     │ Average  │ Good
────────────────┼──────────┼──────────┼──────────
CTR             │ < 1%     │ 1-3%     │ > 3%
IPM             │ < 5      │ 5-20     │ > 20
IVR             │ < 0.5%   │ 0.5-2%   │ > 2%
Engagement Rate │ < 20%    │ 20-50%   │ > 50%
Completion Rate │ < 30%    │ 30-60%   │ > 60%
Avg Play Time   │ < 8s     │ 8-15s    │ 15-25s
D1 Retention    │ < 25%    │ 25-40%   │ > 40%
ROAS (D7)       │ < 30%    │ 30-80%   │ > 80%
```

### Implementing Analytics Events

```typescript
// Tracking events (sent when running in development or
// when ad network provides analytics hooks)
interface AnalyticsEvent {
  eventName: string;
  timestamp: number;
  data?: Record<string, string | number | boolean>;
}

class PlayableAnalytics {
  private events: AnalyticsEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  private track(
    eventName: string,
    data?: Record<string, string | number | boolean>
  ): void {
    this.events.push({
      eventName,
      timestamp: Date.now() - this.startTime,
      data,
    });
  }

  // Standard events
  adLoaded(): void {
    this.track('ad_loaded');
  }

  gameStarted(): void {
    this.track('game_started');
  }

  tutorialShown(): void {
    this.track('tutorial_shown');
  }

  tutorialSkipped(): void {
    this.track('tutorial_skipped');
  }

  tutorialCompleted(): void {
    this.track('tutorial_completed');
  }

  firstInteraction(gesture: string): void {
    this.track('first_interaction', { gesture });
  }

  levelStarted(level: number): void {
    this.track('level_started', { level });
  }

  levelCompleted(level: number, score: number): void {
    this.track('level_completed', { level, score });
  }

  levelFailed(level: number, score: number, progress: number): void {
    this.track('level_failed', { level, score, progress });
  }

  endCardShown(trigger: string): void {
    this.track('endcard_shown', { trigger });
  }

  ctaClicked(placement: string): void {
    this.track('cta_clicked', { placement });
  }

  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  getSummary(): Record<string, unknown> {
    return {
      totalEvents: this.events.length,
      totalDuration: Date.now() - this.startTime,
      events: this.events.map(e => e.eventName),
    };
  }
}
```

---

## Common Mistakes

### 1. Too Complex

```
WRONG: Show 5 mechanics, 10 UI elements, complex rules
RIGHT: One core mechanic, 3-4 UI elements max

The user has 15-30 seconds. Every second spent learning
is a second not spent enjoying. If the user doesn't
understand the game in 3 seconds, they close the ad.

RULE: If a 5-year-old can't understand the mechanic
by watching the tutorial hand, it's too complex.
```

### 2. No Clear CTA

```
WRONG: Small text link at bottom, single tap zone
RIGHT: Large pulsing button, entire screen tappable,
       multiple CTA opportunities throughout

The CTA button should be:
- Minimum 48x48px touch target (ideally larger)
- High contrast color (green or orange on dark background)
- Pulsing/animated to draw attention
- Accompanied by clear action text ("Install Now")
- Shown within 1 second of end card appearing
```

### 3. Poor Performance

```
WRONG: 60fps on desktop, 15fps on mobile
RIGHT: Test on iPhone 8 / Galaxy S8 class devices

Performance killers in playable ads:
- Too many canvas draw calls per frame
- Unoptimized sprite sheets (too large)
- Heavy particle systems
- requestAnimationFrame without frame budget management
- Memory leaks from event listeners not cleaned up
- DOM manipulation during gameplay

SOLUTION: Profile on real devices. Target 30fps minimum.
         Most users won't notice 30fps vs 60fps in a 20-second ad.
```

### 4. Text-Heavy

```
WRONG: "Tap the blue gems to match them in rows of 3 or more"
RIGHT: Animated hand swiping a blue gem → match happens → sparkles

Reasons to avoid text:
1. Requires translation for every market (hundreds of languages)
2. Small screens make text hard to read
3. Users don't read -- they scan
4. Takes precious seconds away from gameplay
5. Adds to file size

When text is acceptable:
- Score numbers ("1,250")
- CTA button ("Install Now")
- Very short labels ("Level 2")
- Universal symbols ("★★★")
```

### 5. Misrepresenting the Game

```
WRONG: Show gameplay mechanics that don't exist in the real game
RIGHT: Show a simplified version of the actual game

Misrepresentation leads to:
- High uninstall rate (user feels tricked)
- Poor Day 1 retention
- Negative reviews
- Ad network may reject or penalize
- Lower ROAS (users who install don't stick)

EXCEPTION: Many successful playable ads show a single
mechanic from a complex game. This is simplification,
not misrepresentation. Showing the match-3 mechanic from
a game that also has RPG elements is fine.
```

### 6. Ignoring Orientation

```
WRONG: Only works in portrait, breaks in landscape
RIGHT: Responsive design that works in both orientations

Many users hold their phone in landscape while playing
other games. If the playable ad appears in landscape
and only works in portrait, it's a wasted impression.

MINIMUM: Design for portrait, add letterboxing for landscape.
IDEAL: Responsive layout that adapts to both orientations.
```

### 7. Loading Screen Too Long

```
WRONG: 5-second loading bar, user leaves before gameplay
RIGHT: Preload critical assets < 1 second, stream the rest

The user's attention span is extremely short in an ad context.
A loading screen longer than 2 seconds loses a significant
percentage of potential players.

SOLUTION:
- Keep total file size small (faster decode)
- Show first frame immediately (even if assets loading)
- Animate the loading screen (progress bar, logo animation)
- Preload only critical assets, defer nice-to-haves
```

### 8. Forgetting the "Almost Won" Feeling

```
WRONG: Player clearly loses → end card. Player feels nothing.
WRONG: Player clearly wins → end card. Player feels satisfied, no need to install.
RIGHT: Player was SO CLOSE → end card. Player feels "I want to try again!"

The end trigger should fire at the moment of maximum
engagement, not maximum frustration.

GOOD END TRIGGERS:
- Progress bar at 85-95% when timer runs out
- Last life lost on a near-miss
- Level complete → show next level's preview → "Install for Level 3"
- Board almost cleared in match-3

BAD END TRIGGERS:
- Player idle for 10 seconds (they're not engaged)
- Player loses immediately (too hard, frustrating)
- Fixed timer regardless of engagement state
```

---

## Design Document Template

```markdown
# Playable Ad Design Document

## Overview
- **Game Title**: [Name of the game being advertised]
- **Genre**: [Match-3 / Runner / Puzzle / Merge / etc.]
- **Target Networks**: [Facebook, Google, Unity, IronSource, etc.]
- **Size Budget**: [5MB / 2MB for TikTok]
- **Target Duration**: [15-25 seconds]

## Core Mechanic
[One sentence describing the single core mechanic]
Example: "Swipe to swap adjacent gems and match 3+ in a row"

## Hook (0-3 seconds)
- **Visual hook**: [What the user sees immediately]
- **Auto-play**: [What happens if user doesn't interact for 3s]
- **Transition to gameplay**: [How do we hand control to the user]

## Tutorial (0-3 seconds, overlapping with hook)
- **Gesture shown**: [Tap / Swipe / Drag]
- **Tutorial hand path**: [Start position → End position]
- **Highlight**: [What element is highlighted]
- **Dismiss condition**: [User performs correct gesture]

## Gameplay (3-25 seconds)
- **Controls**: [Tap / Swipe / Drag, describe exactly]
- **Objective**: [What the player is trying to do]
- **Difficulty ramp**:
  - 0-5s: [Easy settings]
  - 5-15s: [Medium settings]
  - 15-25s: [Hard settings]
- **Rewards**: [What positive feedback does the player get]
- **Progress indicator**: [Progress bar / Score / Level counter]
- **Number of levels**: [1-3]

## End Card Trigger
- **Primary trigger**: [Timer / Lives / Level complete]
- **"Almost won" setup**: [How we create the near-miss feeling]
- **Transition animation**: [How gameplay transitions to end card]

## End Card Layout
- **Title text**: [e.g., "So Close!"]
- **Score display**: [Yes/No, format]
- **CTA button text**: [e.g., "Install Now"]
- **CTA button color**: [e.g., #4CAF50]
- **Social proof**: [e.g., "4.8★ | 50M+ Downloads"]
- **Secondary CTA**: [Optional, e.g., "Continue Playing"]

## Art Style
- **Color palette**: [Primary, secondary, accent colors]
- **Reference**: [Link to game's actual art style]
- **Sprite list**: [List of all sprites needed with sizes]

## Audio
- **Strategy**: [Procedural / Sound sprite / No audio]
- **SFX list**: [List of sound effects if any]
- **Music**: [Yes/No, if yes: loop duration]

## Asset Budget
| Asset Type    | Count | Estimated Size |
|---------------|-------|----------------|
| Sprite atlas  | 1     | ___KB          |
| Background    | 1     | ___KB          |
| UI elements   | ___   | ___KB          |
| Audio         | ___   | ___KB          |
| Code          | -     | ~200KB         |
| **Total**     |       | **___KB**      |

## Success Metrics
- **Target CTR**: >2%
- **Target IPM**: >10
- **Target Completion Rate**: >50%
- **Target Avg Play Time**: 12-18 seconds

## A/B Test Plan
1. [First test: e.g., CTA text "Install Now" vs "Play Now"]
2. [Second test: e.g., difficulty level easy vs medium]
3. [Third test: e.g., 1 level vs 2 levels]
```

---

## Metrics and Analytics

### Funnel Visualization

```
PLAYABLE AD CONVERSION FUNNEL:
═══════════════════════════════════════════════════════

Impressions:     100,000  (100%)
    │
    │  [Engagement Rate: 40%]
    ▼
Engaged:          40,000  (40%)
    │
    │  [Completion Rate: 60%]
    ▼
Completed:        24,000  (24%)
    │
    │  [CTR: 8% of completed]
    ▼
CTA Clicks:        1,920  (1.92%)
    │
    │  [Install Rate: 50% of clicks]
    ▼
Installs:            960  (0.96%)
    │
    │  [D1 Retention: 35%]
    ▼
D1 Active:           336  (0.34%)
    │
    │  [D7 Retention: 15%]
    ▼
D7 Active:           144  (0.14%)

IPM = (960 / 100,000) * 1000 = 9.6
Cost per Install (CPI) = Ad Spend / 960
```

### Revenue Math

```
ROAS CALCULATION:
═══════════════════════════════════════════════════════

Ad Spend:                    $10,000
Impressions (at $5 CPM):   2,000,000
Installs (at 10 IPM):        20,000
CPI:                           $0.50

D7 Revenue per Install:        $0.40
D7 ROAS:                        80%  ← Not profitable yet

D30 Revenue per Install:       $0.80
D30 ROAS:                      160%  ← Profitable!

D180 Revenue per Install:     $1.50
D180 ROAS:                     300%  ← Very profitable

KEY INSIGHT:
A playable ad that costs more per install (higher CPI)
but acquires higher-LTV users can be more profitable
than a cheap video ad that acquires low-LTV users.
```

---

## Interview Questions

### Q1: Walk through how you would design a playable ad for a match-3 game. Cover the full experience from first frame to CTA.

**Answer:**

**Hook (0-3s):** The screen shows a pre-configured 6x8 grid of colorful gems. In the first second, an automated cascade plays -- 3 gems match, explode with particles, more gems fall and trigger a chain reaction. This immediately shows the player "this is satisfying."

**Tutorial (1-3s):** After the cascade settles, a tutorial hand appears, pointing to two adjacent gems. The hand swipes one gem onto the other, showing a swap that creates a match. If the user does not interact within 3 seconds, the hand performs the swap automatically and the tutorial hand moves to the next obvious match.

**Gameplay (3-22s):** The player swipes to swap gems and create matches. The starting board is designed to have many easy matches visible. A progress bar at the top shows "Match 30 gems" as the goal.

Difficulty ramp: In the first 5 seconds, the board has 5-6 obvious matches available at any time. By second 15, the board is harder -- fewer obvious matches, more strategic thinking required. The gems refill after matches with a distribution that creates fewer easy matches as time progresses.

Juice: Every match triggers a sparkle particle burst. Combos (matching during a cascade) show "x2!", "x3!" floating numbers. The progress bar fills with a satisfying animation. At 80% progress, the bar glows gold.

**End Card Trigger (22-25s):** When the progress bar reaches 85-95%, the timer expires. The near-miss is key. The end card message says "So Close!" with the progress bar visually showing how close they were.

**End Card (25-30s):** Full-screen overlay with the player's score, 3 out of 5 stars (implying they could earn more), and a large green "Install Now" button. Below: "4.8 star rating | 50M+ Downloads." The entire screen is tappable for CTA.

---

### Q2: How do you design tutorials for playable ads without using any text?

**Answer:**

I use three techniques:

1. **Animated tutorial hand**: A finger sprite that demonstrates the exact gesture needed. For a swipe game, the hand swipes. For a tap game, the hand taps with a visual "press" animation. The hand moves from the starting position to the ending position with easing, pauses, then repeats until the user mimics the action.

2. **Visual highlighting**: The target element pulses, glows, or has a white border. Everything else dims slightly. This creates an obvious focal point without any words. For example, in a match-3, the two gems that should be swapped pulse while the rest of the grid is at 50% brightness.

3. **Auto-play fallback**: If the user does not interact within 3 seconds, the game performs the first action automatically. The tutorial hand completes the gesture, the game responds (gems match, character jumps), and the player now understands through observation. This also prevents the ad from stalling.

The key principle is: show, don't tell. A 5-year-old who speaks any language should understand what to do within 3 seconds of watching the tutorial hand.

Progressive disclosure is important for multi-mechanic games: show only the first mechanic initially. If a second mechanic is needed (e.g., a special power-up), introduce it with a new tutorial hand moment after the player has mastered the first mechanic.

---

### Q3: What is the "almost won" technique and why is it the most important design principle for playable ads?

**Answer:**

The "almost won" technique designs the end of the playable ad so the player feels they were extremely close to succeeding but did not quite make it. This triggers a strong psychological desire to try again, which translates into installs.

Psychology behind it:

- **Near-miss effect**: Research from gambling studies shows that near-misses activate the same brain reward circuits as actual wins. A near-miss is more motivating than either a clear win or a clear loss.

- **Zeigarnik effect**: People remember and are drawn to incomplete tasks. When the progress bar shows 90% and time runs out, the player feels the task is unfinished.

- **Loss aversion**: The player "earned" 90% progress and does not want to lose it. The end card implies they can continue where they left off by installing.

Implementation:

- Design difficulty so the player naturally reaches 80-95% of the goal when time runs out.
- Show a visual progress indicator so the player is aware of how close they are.
- Trigger the end card at the moment of maximum engagement, not maximum frustration.
- End card text reinforces the near-miss: "So Close!", "You were 2 moves away!", "95% Complete!"
- Avoid making the player feel they failed badly. "So Close" is better than "Game Over."

The reason this is the most important principle: it directly drives the conversion from gameplay to CTA click to install. A player who feels "I almost had it" is 2-3x more likely to install than a player who feels "I lost" or "I won."

---

### Q4: What metrics matter most for evaluating a playable ad's performance?

**Answer:**

In order of importance:

1. **ROAS (Return on Ad Spend)**: The ultimate metric. Revenue generated by acquired users divided by the cost to acquire them. A playable ad with amazing CTR but poor user quality (low LTV) is worthless.

2. **IPM (Installs Per Mille)**: Installs per 1000 impressions. This combines engagement rate, completion rate, CTR, and install rate into one number. Industry average for playable ads is 5-20 IPM. Top performers hit 30-50+.

3. **CTR (Click-Through Rate)**: Percentage of impressions that result in a CTA click. Directly measures how effective the end card and CTA design are. Good: 2-5%.

4. **D1/D7 Retention**: Of users who install, what percentage are still active after 1 day and 7 days. This measures user quality. If playable ad users have higher retention than video ad users, the playable is working as intended -- it filters for users who actually like the game.

5. **Completion Rate**: Percentage of users who reach the end card. Low completion means the game is too hard, too confusing, or too boring. Target: 50-70%.

6. **Engagement Rate**: Percentage of users who interact at all (tap, swipe, etc.). Low engagement means the hook failed. Target: 30-50%.

7. **Average Play Duration**: How long users play before hitting the end card. Too short (< 8s) means the game is not engaging. Too long (> 25s) means the end trigger is not firing soon enough.

The key insight is that optimizing for CTR alone can backfire. A clickbaity end card might get clicks but attract users who churn immediately, resulting in poor ROAS. The best playable ads optimize for user quality (retention and LTV) while maintaining reasonable CTR.

---

### Q5: How do you A/B test playable ads? What do you test first?

**Answer:**

The testing process is iterative and prioritized by expected impact.

**How it works:** Upload 2-4 variants of the playable ad to the ad network. The network serves each variant to an equal share of traffic. After 1000-5000 impressions per variant (enough for statistical significance), compare metrics. Promote the winner and test the next variable.

**Testing order (highest impact first):**

1. **CTA button text and color**: This is the single most impactful element because it directly affects CTR. Test "Install Now" vs "Play Now" vs "Download Free." Test green vs orange vs blue buttons. This can swing CTR by 50-100%.

2. **Game difficulty**: Easy vs medium difficulty affects both completion rate and the "almost won" feeling. Too easy = player feels satisfied and does not install. Too hard = player gives up and does not reach end card.

3. **Game duration**: 15 seconds vs 20 vs 25. Shorter = more impressions, potentially lower engagement. Longer = deeper engagement, but some users drop off.

4. **End card trigger**: Timer-based vs lives-based vs level-complete. Different triggers create different emotional states. Failing (lives) creates urgency. Completing (level) creates satisfaction. Timer creates FOMO.

5. **Tutorial presence**: With tutorial vs without. For very simple mechanics, skipping the tutorial adds 3 more seconds of gameplay. For complex mechanics, the tutorial is essential.

6. **Art style and theme**: If the game has multiple themes or skins, test which visual style attracts more engagement.

**Important**: Only test one variable at a time. If you change both the CTA text and the difficulty simultaneously, you cannot attribute the result to either change.

---

### Q6: Compare match-3, runner, and puzzle genres for playable ads. Which is easiest to build and which performs best?

**Answer:**

**Easiest to build: Idle/Clicker**, followed by **Match-3**.

Idle/Clicker has the simplest mechanics (tap a button, numbers go up) and requires the fewest assets. Match-3 is well-understood with clear grid logic, but requires match detection, cascade logic, and board generation algorithms.

**Runner** is moderately complex. It requires scrolling, obstacle spawning, collision detection, and character animation. But the core loop (avoid obstacles, collect items) is straightforward.

**Puzzle** varies enormously. A simple "drag items to targets" puzzle is easy. A pin-puzzle or path-drawing puzzle requires more complex logic.

**Best performing by genre (industry data):**

Match-3 consistently performs well because the mechanic is universally understood, the cascading matches are inherently satisfying (dopamine), and the "almost cleared the board" near-miss is very effective.

Runners perform well for action-oriented audiences. The near-miss (barely hitting an obstacle) creates strong install intent.

Idle/Clicker has high engagement rate (everyone understands "tap"), but lower conversion because the experience is less emotionally compelling.

Puzzle games have the highest variance. A well-designed puzzle playable can outperform everything else, but a confusing puzzle will have near-zero conversion.

**My recommendation for a new playable ad team**: Start with match-3. It has the best ratio of effort-to-performance, extensive industry data for benchmarking, and is forgiving of design mistakes.

---

### Q7: A playable ad has a 45% engagement rate but only 0.5% CTR. What is likely wrong and how would you fix it?

**Answer:**

The funnel tells a clear story: users are engaging with the game (45% is decent) but not clicking the CTA (0.5% is very low). The problem is between engagement and CTA click. Possible causes:

1. **Weak end card / CTA design**: The CTA button might be too small, poorly positioned, or have unconvincing text. Fix: Make the button larger, use a high-contrast color, add a pulsing animation, and test different CTA text.

2. **No "almost won" feeling**: Users might be clearly winning or clearly losing, neither of which motivates a CTA click. Fix: Tune difficulty so players reach 85-95% of the goal. Show a progress bar that visually communicates "you were so close."

3. **Satisfying completion**: If users feel they have experienced enough of the game (they "got it"), they have no motivation to install. Fix: End the gameplay at a moment of peak engagement, not after the player feels done. Tease content they have not seen ("100+ more levels!").

4. **Abrupt transition**: A jarring jump from gameplay to end card breaks immersion. Fix: Add a smooth transition animation (gameplay slows, dims, end card slides in).

5. **CTA appears too late**: If users have already lost interest by the time the end card appears, they dismiss it. Fix: Show the end card sooner (at 15-18 seconds instead of 25-30), or add a persistent mini-CTA during gameplay.

6. **Missing social proof**: The end card does not convince users the game is worth downloading. Fix: Add star rating, download count, and optionally app screenshots.

I would A/B test end card redesigns first (biggest likely impact), then tune gameplay difficulty and duration.

---

### Q8: What are the key differences in designing for playable ads vs. designing for a full game?

**Answer:**

| Aspect | Playable Ad | Full Game |
|--------|------------|-----------|
| **Goal** | Drive installs | Retain players |
| **Duration** | 15-30 seconds | Hours to years |
| **Onboarding** | 0-3 seconds, no text | 5-30 minutes, guided |
| **Mechanics** | ONE core mechanic | Many interlocking systems |
| **Difficulty** | Start trivial, ramp fast | Gradual learning curve |
| **Failure** | Designed, intentional | Avoidable with skill |
| **Audio** | Often none | Full soundtrack + SFX |
| **Tutorial** | Visual only, 3 seconds | Text + guided levels |
| **End state** | CTA screen | Infinite play / chapters |
| **Success metric** | IPM, ROAS | Retention, revenue |
| **User mindset** | Passive (didn't ask for this) | Active (chose to play) |
| **Forgiveness** | Extremely forgiving | Can challenge the player |

The biggest mindset shift: in a full game, you want the player to improve over time. In a playable ad, you want the player to feel competent immediately but then fail at a prescribed moment. The playable ad designer is choreographing an experience, not building a fair game.

Another key difference: in a full game, you want players to feel accomplished when they succeed. In a playable ad, you paradoxically want players to feel slightly unfulfilled -- "I want more of this." The playable ad should leave the player wanting, not satisfied.

---

### Q9: How do you handle the design for a game that has complex mechanics that cannot be simplified into a 20-second experience?

**Answer:**

Three strategies:

1. **Extract one mechanic**: Most complex games have multiple systems. Pick the single most satisfying one. For an RPG with match-3 combat, just show the match-3. For a strategy game with base building and battles, just show the battles. The playable ad does not need to represent the full game -- it needs to represent the feeling of playing the game.

2. **Create a parallel experience**: Design a mini-game that captures the game's theme and aesthetic but uses simpler mechanics. A complex strategy game might have a playable ad that is a simple tower defense or puzzle. The visual style, characters, and world are the same, but the mechanics are accessible.

3. **Show the aspiration**: Instead of showing early gameplay (which is often the least interesting part), show mid-game or end-game content. A city builder ad might show a beautiful city and let the user place a few buildings, rather than starting from an empty field. A gacha RPG might let the user summon characters and see their flashy abilities, rather than showing the tutorial battle.

The key principle: **sell the feeling, not the feature set.** Users install because they felt something during the playable ad (satisfaction, excitement, curiosity), not because they understood all the game's mechanics.

---

### Q10: Design the engagement flow for a runner playable ad. Describe the exact user experience second by second.

**Answer:**

**0-1s (Hook):** The character is already running. No loading screen, no logo. The camera follows the character as they automatically run forward through a colorful environment. Coins line a straight path. The character auto-collects them with sparkle effects. Score counter increments with satisfying animations.

**1-3s (Tutorial):** A large obstacle appears ahead. A tutorial hand appears, tapping the screen. The word "TAP" fades up briefly (one of the few acceptable text uses). If the user does not tap within 2 seconds, the character auto-jumps. The tutorial hand disappears.

**3-8s (Easy gameplay):** Obstacles are sparse (one every 2-3 seconds). Large gaps between them. Generous hitboxes (easier to avoid). Coin lines guide the player on the correct path. Every successful jump triggers a small particle burst. Score increases rapidly, creating a "big numbers" feeling.

**8-15s (Medium gameplay):** Obstacles appear more frequently (every 1-1.5 seconds). Some require jumping, others require sliding (swipe down). Introduce one new element: a speed boost pickup that makes the character glow and zoom forward. Near-misses trigger slow-motion for 0.3 seconds (dramatic effect).

**15-20s (Hard gameplay):** Obstacles appear every 0.8 seconds. Some in rapid succession requiring precise timing. The character speed increases. The player will likely fail here. This is intentional.

**20-22s (Near-miss fail):** The player hits an obstacle. Screen flashes. Slow-motion shows the collision. The character is knocked back dramatically. The progress bar shows "85% complete." The text "SO CLOSE!" appears briefly.

**22-25s (End card):** The gameplay dims. An end card slides up showing:
- "YOU RAN 850m!" with a distance graphic
- Star rating: 3/5 stars
- Large green "PLAY NOW" button (pulsing)
- "4.8 star | 100M+ Downloads" below the button

The entire end card area is tappable. Tapping anywhere calls `mraid.open()` or `dapi.openStoreUrl()`.

Total asset budget estimate: Character (4-frame run cycle + jump sprite: 60KB), 3 obstacle types (40KB), background (parallax layers or procedural gradient: 50KB), UI (progress bar, score, end card: 40KB), particles (procedural: 0KB), audio (procedural jump/coin SFX: 0KB). Total: ~200KB of images, well under any network limit.
