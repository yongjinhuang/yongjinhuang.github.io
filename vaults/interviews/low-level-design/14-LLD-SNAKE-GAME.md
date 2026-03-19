# Design a Snake Game

The Snake game is a popular LLD interview question that tests your ability to model a game loop,
use efficient data structures (deque for the snake body), implement collision detection, and
apply the State and Command patterns. It is deceptively simple -- the core is small, but there
are many edge cases around direction handling, food placement, and game state transitions.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [State Machine](#3-state-machine)
4. [Core Implementation](#4-core-implementation)
5. [Food and Scoring](#5-food-and-scoring)
6. [Command Pattern for Replay](#6-command-pattern-for-replay)
7. [Terminal UI with Curses](#7-terminal-ui-with-curses)
8. [Interview Walkthrough](#8-interview-walkthrough)
9. [Common Follow-Up Questions](#9-common-follow-up-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement         | Details                                             |
| --- | ------------------- | --------------------------------------------------- |
| F1  | Game board          | Grid of configurable width and height               |
| F2  | Snake movement      | Moves one cell per tick in the current direction    |
| F3  | Direction control   | Up, down, left, right; prevent 180-degree turns     |
| F4  | Food spawning       | Random placement on empty cells (not on snake body) |
| F5  | Growth              | Snake grows by one segment when eating food         |
| F6  | Collision detection | Game over on wall hit or self-intersection          |
| F7  | Score tracking      | Points per food eaten, speed increases with score   |
| F8  | Game states         | Playing, Paused, GameOver                           |
| F9  | Move history        | Record all moves for replay                         |

### Non-Functional Requirements

| #   | Requirement                                        |
| --- | -------------------------------------------------- |
| NF1 | O(1) snake movement (deque: add head, remove tail) |
| NF2 | O(1) self-collision check (set of body positions)  |
| NF3 | Extensible for new food types and power-ups        |

### Clarifying Questions to Ask

- "What happens at the board edges?" (Game over -- wall collision)
- "Does the snake speed up over time?" (Yes, speed increases every N points)
- "Can there be multiple food items at once?" (Start with one, extend to multiple)
- "Is there a pause feature?" (Yes)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   Direction       |       |   GameState (Enum)  |
|   (Enum)          |       |---------------------|
|-------------------|       | PLAYING             |
| UP    (-1, 0)     |       | PAUSED              |
| DOWN  ( 1, 0)     |       | GAME_OVER           |
| LEFT  ( 0,-1)     |       +---------------------+
| RIGHT ( 0, 1)     |
+-------------------+       +---------------------+
                            |   Position          |
+-------------------+       |   (frozen)          |
|   Food            |       |---------------------|
|-------------------|       | row: int            |
| position          |       | col: int            |
| points            |       +---------------------+
+-------------------+
                            +---------------------+
+-------------------+       |   Snake             |
|   MoveCommand     |       |---------------------|
|   (frozen)        |       | body: deque[Position]|
|-------------------|       | body_set: set        |
| direction         |       | direction            |
| timestamp         |       |---------------------|
+-------------------+       | head()              |
                            | move(grew)          |
+-------------------+       | change_direction()  |
|   GameEngine      |       | collides_with_self()|
|-------------------|       +---------------------+
| board_width       |
| board_height      |       +---------------------+
| snake             |       |   FoodSpawner       |
| food              |       |---------------------|
| score             |       | spawn(board, snake) |
| state             |       +---------------------+
| move_history      |
|-------------------|
| tick()            |
| change_direction()|
| pause() / resume()|
| replay()          |
+-------------------+
```

---

## 3. State Machine

```
                +------------------+
      +-------->|    PLAYING       |<--------+
      |         +------------------+         |
      |           |            |             |
      |       pause        collision         |
      |           |        (wall/self)       |
      |           v            |             |
      |   +------------------+ |             |
      +---| PAUSED           | |             |
  resume  +------------------+ |             |
                               v             |
                        +------------------+ |
                        | GAME_OVER        | |
                        +------------------+ |
                               |             |
                           restart           |
                               |             |
                               +-------------+
```

**Transitions:**

| From      | Event               | To        | Action                 |
| --------- | ------------------- | --------- | ---------------------- |
| PLAYING   | Tick (no collision) | PLAYING   | Move snake, check food |
| PLAYING   | Tick (collision)    | GAME_OVER | Record final score     |
| PLAYING   | Pause               | PAUSED    | Freeze game loop       |
| PAUSED    | Resume              | PLAYING   | Continue game loop     |
| GAME_OVER | Restart             | PLAYING   | Reset board and snake  |

---

## 4. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from collections import deque
import random
import time


class Direction(Enum):
    UP = (-1, 0)
    DOWN = (1, 0)
    LEFT = (0, -1)
    RIGHT = (0, 1)

    @property
    def opposite(self) -> "Direction":
        opposites = {
            Direction.UP: Direction.DOWN,
            Direction.DOWN: Direction.UP,
            Direction.LEFT: Direction.RIGHT,
            Direction.RIGHT: Direction.LEFT,
        }
        return opposites[self]


class GameState(Enum):
    PLAYING = "playing"
    PAUSED = "paused"
    GAME_OVER = "game_over"


@dataclass(frozen=True)
class Position:
    row: int
    col: int

    def move(self, direction: Direction) -> "Position":
        dr, dc = direction.value
        return Position(self.row + dr, self.col + dc)

    def __str__(self) -> str:
        return f"({self.row}, {self.col})"


@dataclass(frozen=True)
class MoveCommand:
    """Records a single move for replay."""
    direction: Direction
    timestamp: float
    ate_food: bool = False
```

### Snake

```python
class Snake:
    """The snake is a deque of positions.

    The head is at the front (index 0). Moving appends a new head and
    removes the tail -- both O(1) operations on a deque. A set mirrors
    the body for O(1) collision checks.
    """

    def __init__(self, start: Position, length: int = 3,
                 direction: Direction = Direction.RIGHT):
        self._direction = direction
        self._body: deque[Position] = deque()
        self._body_set: set[Position] = set()

        # Build initial snake going left from start position
        for i in range(length):
            pos = Position(start.row, start.col - i)
            self._body.append(pos)
            self._body_set.add(pos)

    @property
    def head(self) -> Position:
        return self._body[0]

    @property
    def body(self) -> deque[Position]:
        return self._body

    @property
    def body_set(self) -> set[Position]:
        return self._body_set

    @property
    def direction(self) -> Direction:
        return self._direction

    @property
    def length(self) -> int:
        return len(self._body)

    def change_direction(self, new_direction: Direction) -> bool:
        """Change direction. Returns False if the turn is a 180-degree reversal."""
        if new_direction == self._direction.opposite:
            return False
        self._direction = new_direction
        return True

    def next_head_position(self) -> Position:
        return self.head.move(self._direction)

    def move(self, grew: bool = False) -> None:
        """Move one step. If grew is True, do not remove the tail."""
        new_head = self.next_head_position()
        self._body.appendleft(new_head)
        self._body_set.add(new_head)

        if not grew:
            removed_tail = self._body.pop()
            self._body_set.discard(removed_tail)

    def collides_with_self(self) -> bool:
        """Check if the head occupies the same cell as any body segment.

        Note: call this AFTER move(). The head is already in the set,
        so self-collision is detected by checking the set size.
        """
        return len(self._body_set) < len(self._body)

    def occupies(self, pos: Position) -> bool:
        return pos in self._body_set

    def reset(self, start: Position, length: int = 3,
              direction: Direction = Direction.RIGHT) -> None:
        self._direction = direction
        self._body.clear()
        self._body_set.clear()
        for i in range(length):
            pos = Position(start.row, start.col - i)
            self._body.append(pos)
            self._body_set.add(pos)
```

### Food and Spawner

```python
@dataclass(frozen=True)
class Food:
    position: Position
    points: int = 10

    def __str__(self) -> str:
        return f"Food({self.position}, {self.points}pts)"


class FoodSpawner:
    """Spawns food on a random empty cell."""

    def __init__(self, board_width: int, board_height: int):
        self._width = board_width
        self._height = board_height

    def spawn(self, snake: Snake) -> Food | None:
        """Place food on a random cell not occupied by the snake.

        Returns None if the board is completely full (snake wins).
        """
        empty_cells = [
            Position(r, c)
            for r in range(self._height)
            for c in range(self._width)
            if not snake.occupies(Position(r, c))
        ]
        if not empty_cells:
            return None

        position = random.choice(empty_cells)
        return Food(position=position, points=10)
```

### Game Engine

```python
class GameEngine:
    """Main game orchestrator. Manages the game loop, state transitions,
    collision detection, and move history."""

    BASE_SPEED = 0.3          # Seconds per tick at score 0
    SPEED_INCREMENT = 0.02    # Seconds faster per food eaten
    MIN_SPEED = 0.05          # Fastest possible tick

    def __init__(self, width: int = 20, height: int = 15):
        self._width = width
        self._height = height
        self._spawner = FoodSpawner(width, height)
        self._snake = Snake(Position(height // 2, width // 2))
        self._food: Food | None = None
        self._score = 0
        self._state = GameState.PLAYING
        self._move_history: list[MoveCommand] = []
        self._tick_count = 0

        self._food = self._spawner.spawn(self._snake)

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    @property
    def snake(self) -> Snake:
        return self._snake

    @property
    def food(self) -> Food | None:
        return self._food

    @property
    def score(self) -> int:
        return self._score

    @property
    def state(self) -> GameState:
        return self._state

    @property
    def tick_speed(self) -> float:
        """Current tick interval in seconds. Gets faster as score increases."""
        speed = self.BASE_SPEED - (self._score // 10) * self.SPEED_INCREMENT
        return max(speed, self.MIN_SPEED)

    @property
    def move_history(self) -> list[MoveCommand]:
        return list(self._move_history)

    def change_direction(self, direction: Direction) -> bool:
        """Change snake direction. Only valid in PLAYING state."""
        if self._state != GameState.PLAYING:
            return False
        return self._snake.change_direction(direction)

    def tick(self) -> str:
        """Advance the game by one step. Returns a status message."""
        if self._state != GameState.PLAYING:
            return f"Game is {self._state.value}. Score: {self._score}"

        self._tick_count += 1
        next_head = self._snake.next_head_position()

        # Check wall collision
        if not self._is_within_bounds(next_head):
            self._state = GameState.GAME_OVER
            self._record_move(ate_food=False)
            return f"Game Over! Hit wall at {next_head}. Score: {self._score}"

        # Check if food is at the next position (before moving)
        ate_food = self._food is not None and next_head == self._food.position

        # Move snake
        self._snake.move(grew=ate_food)

        # Check self collision (after moving)
        if self._snake.collides_with_self():
            self._state = GameState.GAME_OVER
            self._record_move(ate_food=False)
            return f"Game Over! Hit self at {next_head}. Score: {self._score}"

        # Handle food
        if ate_food:
            self._score += self._food.points
            self._food = self._spawner.spawn(self._snake)
            if self._food is None:
                self._state = GameState.GAME_OVER
                return f"You Win! Board full. Score: {self._score}"

        self._record_move(ate_food=ate_food)
        return f"Tick {self._tick_count}. Score: {self._score}"

    def pause(self) -> str:
        if self._state == GameState.PLAYING:
            self._state = GameState.PAUSED
            return "Game paused."
        return f"Cannot pause from state: {self._state.value}"

    def resume(self) -> str:
        if self._state == GameState.PAUSED:
            self._state = GameState.PLAYING
            return "Game resumed."
        return f"Cannot resume from state: {self._state.value}"

    def restart(self) -> str:
        self._snake.reset(Position(self._height // 2, self._width // 2))
        self._score = 0
        self._state = GameState.PLAYING
        self._move_history = []
        self._tick_count = 0
        self._food = self._spawner.spawn(self._snake)
        return "Game restarted."

    def render(self) -> str:
        """Render the board as an ASCII string."""
        # Build empty grid
        grid = [["." for _ in range(self._width)] for _ in range(self._height)]

        # Place food
        if self._food is not None:
            fp = self._food.position
            grid[fp.row][fp.col] = "*"

        # Place snake body
        for pos in self._snake.body:
            grid[pos.row][pos.col] = "#"

        # Place snake head
        head = self._snake.head
        grid[head.row][head.col] = "@"

        # Build border
        border = "+" + "-" * self._width + "+"
        lines = [border]
        for row in grid:
            lines.append("|" + "".join(row) + "|")
        lines.append(border)
        lines.append(f"Score: {self._score}  State: {self._state.value}  "
                     f"Speed: {self.tick_speed:.2f}s")
        return "\n".join(lines)

    def _is_within_bounds(self, pos: Position) -> bool:
        return 0 <= pos.row < self._height and 0 <= pos.col < self._width

    def _record_move(self, ate_food: bool) -> None:
        command = MoveCommand(
            direction=self._snake.direction,
            timestamp=time.time(),
            ate_food=ate_food,
        )
        self._move_history = [*self._move_history, command]
```

---

## 5. Food and Scoring

The food spawner avoids placing food on the snake body by building a list of empty cells
and choosing randomly. The scoring system awards 10 points per food item.

```
Speed Progression:

Score    Tick Speed (seconds)
  0      0.30s
 10      0.28s
 20      0.26s
 50      0.20s
100      0.10s
150      0.05s (minimum)

Formula: speed = max(0.05, 0.30 - (score // 10) * 0.02)
```

**Food placement efficiency:** Building the empty cell list is O(W \* H) per spawn. For a
typical 20x15 board (300 cells), this is negligible. For very large boards, you could
maintain a running set of occupied cells and sample randomly until hitting an empty cell.

---

## 6. Command Pattern for Replay

The `MoveCommand` records each direction + timestamp + whether food was eaten. This enables
full game replay by re-executing the command sequence.

```python
class GameReplay:
    """Replays a recorded game from move history."""

    def __init__(self, width: int, height: int, commands: list[MoveCommand]):
        self._engine = GameEngine(width, height)
        self._commands = commands
        self._current_index = 0

    def step(self) -> str | None:
        """Execute the next recorded command. Returns render or None if done."""
        if self._current_index >= len(self._commands):
            return None

        command = self._commands[self._current_index]
        self._engine.change_direction(command.direction)
        result = self._engine.tick()
        self._current_index += 1
        return self._engine.render()

    def replay_all(self) -> list[str]:
        """Execute all commands and return all frames."""
        frames = []
        while True:
            frame = self.step()
            if frame is None:
                break
            frames.append(frame)
        return frames

    @property
    def is_complete(self) -> bool:
        return self._current_index >= len(self._commands)
```

### Usage

```python
# Play a game
engine = GameEngine(20, 15)
engine.change_direction(Direction.DOWN)
for _ in range(5):
    engine.tick()
engine.change_direction(Direction.RIGHT)
for _ in range(3):
    engine.tick()

# Save history and replay
history = engine.move_history
replay = GameReplay(20, 15, history)
frames = replay.replay_all()
for frame in frames:
    print(frame)
    print()
```

---

## 7. Terminal UI with Curses

A bonus implementation using Python's `curses` library for a playable terminal version.

```python
import curses


def run_snake_game(stdscr) -> None:
    """Run the Snake game in a terminal using curses."""
    curses.curs_set(0)          # Hide cursor
    stdscr.nodelay(True)        # Non-blocking input
    stdscr.timeout(300)         # Initial refresh rate (ms)

    max_y, max_x = stdscr.getmaxyx()
    board_w = min(40, max_x - 2)
    board_h = min(20, max_y - 4)
    engine = GameEngine(board_w, board_h)

    key_map = {
        curses.KEY_UP: Direction.UP,
        curses.KEY_DOWN: Direction.DOWN,
        curses.KEY_LEFT: Direction.LEFT,
        curses.KEY_RIGHT: Direction.RIGHT,
        ord("w"): Direction.UP,
        ord("s"): Direction.DOWN,
        ord("a"): Direction.LEFT,
        ord("d"): Direction.RIGHT,
    }

    while True:
        # Handle input
        key = stdscr.getch()

        if key == ord("q"):
            break
        elif key == ord("p"):
            if engine.state == GameState.PLAYING:
                engine.pause()
            elif engine.state == GameState.PAUSED:
                engine.resume()
        elif key == ord("r") and engine.state == GameState.GAME_OVER:
            engine.restart()
        elif key in key_map and engine.state == GameState.PLAYING:
            engine.change_direction(key_map[key])

        # Tick the game
        if engine.state == GameState.PLAYING:
            engine.tick()

        # Render
        stdscr.clear()
        render_output = engine.render()
        for i, line in enumerate(render_output.split("\n")):
            if i < max_y - 1:
                stdscr.addstr(i, 0, line[:max_x - 1])

        # Controls help
        help_y = board_h + 3
        if help_y < max_y - 1:
            stdscr.addstr(help_y, 0,
                          "Controls: WASD/Arrows=Move  P=Pause  R=Restart  Q=Quit")

        stdscr.refresh()

        # Adjust speed based on score
        timeout_ms = int(engine.tick_speed * 1000)
        stdscr.timeout(timeout_ms)


# To run: curses.wrapper(run_snake_game)
```

**How the curses UI works:**

1. `stdscr.nodelay(True)` makes `getch()` non-blocking so the game loop runs continuously.
2. `stdscr.timeout(ms)` controls the tick rate, which decreases as the score increases.
3. The key map translates both arrow keys and WASD to `Direction` enums.
4. The game engine is completely decoupled from rendering -- `engine.render()` returns a plain
   string that curses displays.

---

## 8. Interview Walkthrough

### Step 1: Clarify (3 min)

- "Grid size?" (Configurable, default 20x15)
- "Wall collision behavior?" (Game over, not wrap-around)
- "Speed progression?" (Faster every 10 points)
- "Need a UI or just the engine?" (Engine + ASCII render, mention curses as bonus)

### Step 2: Design (5 min)

Draw the class diagram. Key insight: the Snake is a deque (O(1) head/tail operations) paired
with a set (O(1) collision checks). Separate the GameEngine from rendering.

### Step 3: Implement (25 min)

Start with Position, Direction, Snake. Add GameEngine with tick(). Then food spawning and
collision detection. Render last.

### Step 4: Discuss (5 min)

Command pattern for replay. Curses UI. Power-ups and obstacles as extensions.

---

## 9. Common Follow-Up Questions

### "How would you add obstacles?"

Add a `set[Position]` for obstacles in `GameEngine`. Collision with an obstacle is treated
the same as a wall. Obstacles are avoided during food placement.

### "How would you add power-ups?"

Create a `PowerUp` base class with subclasses like `SpeedBoost`, `ScoreMultiplier`, and
`Shrink`. Each power-up has a duration and an `apply(engine)` method. Spawn power-ups
alongside food with lower probability.

### "How would you add multiplayer?"

Two snakes on the same board. Each snake has its own direction and move input. Collision
with the other snake is game over for the collider. Use separate input handlers (e.g.,
WASD for player 1, arrows for player 2).

### "How would you handle wrap-around walls?"

Instead of returning GAME_OVER on wall collision, wrap the position: `new_row % height`,
`new_col % width`. This is a one-line change in `_is_within_bounds` or in `next_head_position`.

### "How would you implement an AI snake?"

Use BFS/A\* to find the shortest path from the snake head to the food, avoiding the body
and walls. For a smarter AI, also consider trapping (ensure a path to the tail exists after
eating the food).

---

## 10. Gotchas

- **180-degree turn kills instantly.** If the snake is moving RIGHT and the player presses
  LEFT, the head reverses into the body. The `change_direction` method blocks opposite
  directions. This is the most common bug in naive implementations.

- **Self-collision detection timing.** Check self-collision _after_ moving the snake, not
  before. The body set may temporarily have duplicate entries during `move()`. The
  `collides_with_self` method checks `len(set) < len(deque)`.

- **Food on snake body.** The spawner must exclude all cells occupied by the snake. Without
  this, food can appear under the snake and be "eaten" without the player seeing it.

- **Deque vs list for the body.** Using a list requires O(n) to prepend the head or remove
  the tail. A deque provides O(1) for both `appendleft` and `pop`. This matters as the snake
  grows long.

- **Speed increases are subtle.** The tick speed formula must have a minimum bound. Without
  `MIN_SPEED`, the game becomes unplayable at high scores.

- **Replay requires seeded randomness.** The `GameReplay` creates a new engine with different
  random food placement. For exact replay, either record food positions in the command log or
  seed the random generator. The `ate_food` flag in `MoveCommand` helps, but the food position
  itself is not recorded in this simplified version.

---

## 11. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Position (frozen)          | Immutable (row, col) coordinate        |
| Direction (Enum)           | Movement delta + opposite detection    |
| Snake                      | Deque body + set for O(1) operations   |
| Food (frozen)              | Position + point value                 |
| FoodSpawner                | Random placement avoiding snake body   |
| MoveCommand (frozen)       | Recorded direction + timestamp         |
| GameEngine                 | Orchestrator: tick, state, collisions  |
| GameReplay                 | Replay from recorded commands          |
+----------------------------+----------------------------------------+

Data Structure Choices:
+-----------+---------------------+---------------------------+
| Structure | Used For            | Why                       |
+-----------+---------------------+---------------------------+
| deque     | Snake body          | O(1) head add, tail pop   |
| set       | Body positions      | O(1) collision check      |
| list      | Move history        | Append-only command log   |
+-----------+---------------------+---------------------------+

Patterns used:
- State          -> GameState (Playing, Paused, GameOver)
- Command        -> MoveCommand for replay / undo
- Composition    -> GameEngine has Snake, FoodSpawner
- Immutability   -> Position, Food, MoveCommand are frozen
- Strategy       -> FoodSpawner (swappable spawning logic)
- MVC separation -> Engine (model) decoupled from curses (view)
```
