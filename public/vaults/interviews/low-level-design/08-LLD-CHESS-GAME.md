# Design a Chess Game

Chess is an excellent LLD interview problem because it requires a clean class hierarchy for pieces,
polymorphic move validation, game state management, and check/checkmate detection. It tests
whether you can decompose a complex domain into well-defined objects. This guide also covers
brief designs for Tic-Tac-Toe and Snake.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Board and Position](#3-board-and-position)
4. [Piece Hierarchy](#4-piece-hierarchy)
5. [Move Validation](#5-move-validation)
6. [Game State Management](#6-game-state-management)
7. [Check and Checkmate Detection](#7-check-and-checkmate-detection)
8. [Bonus: Tic-Tac-Toe](#8-bonus-tic-tac-toe)
9. [Bonus: Snake Game](#9-bonus-snake-game)
10. [Interview Walkthrough](#10-interview-walkthrough)
11. [Common Follow-Up Questions](#11-common-follow-up-questions)
12. [Gotchas](#12-gotchas)
13. [Quick Reference](#13-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement         | Details                                        |
| --- | ------------------- | ---------------------------------------------- |
| F1  | Standard 8x8 board  | Initialize with standard piece positions       |
| F2  | All piece types     | King, Queen, Rook, Bishop, Knight, Pawn        |
| F3  | Move validation     | Each piece type has unique movement rules      |
| F4  | Turn management     | Alternating white/black turns                  |
| F5  | Capture logic       | Moving to opponent's square captures the piece |
| F6  | Check detection     | Detect when a king is threatened               |
| F7  | Checkmate/stalemate | End game conditions                            |
| F8  | Move history        | Track all moves for replay                     |

### Non-Functional Requirements

| #   | Requirement                                                  |
| --- | ------------------------------------------------------------ |
| NF1 | Adding new piece types should not modify existing code (OCP) |
| NF2 | Move validation should be polymorphic                        |
| NF3 | Game state should be immutable-friendly                      |

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   Color (Enum)    |       |   GameStatus (Enum) |
|-------------------|       |---------------------|
| WHITE             |       | ACTIVE              |
| BLACK             |       | WHITE_WINS          |
+-------------------+       | BLACK_WINS          |
                            | STALEMATE           |
+-------------------+       | RESIGNED            |
|   Position        |       +---------------------+
|-------------------|
| row: int (0-7)    |       +---------------------+
| col: int (0-7)    |       |   Move              |
|-------------------|       |---------------------|
| is_valid()        |       | piece               |
| __eq__, __hash__  |       | from_pos            |
+-------------------+       | to_pos              |
                            | captured_piece      |
+-------------------+       +---------------------+
|   Piece (ABC)     |
|-------------------|       +---------------------+
| color             |       |   Board             |
| position          |       |---------------------|
| has_moved         |       | grid[8][8]          |
|-------------------|       |---------------------|
| get_valid_moves() |       | get_piece(pos)      |
| symbol()          |       | move_piece(from,to) |
+-------------------+       | is_under_attack(pos)|
    ^   ^   ^               +---------------------+
    |   |   |
  King Queen Rook           +---------------------+
  Bishop Knight Pawn        |   ChessGame         |
                            |---------------------|
                            | board               |
                            | current_turn        |
                            | status              |
                            | move_history        |
                            |---------------------|
                            | make_move(from, to) |
                            | is_check()          |
                            | is_checkmate()      |
                            +---------------------+
```

---

## 3. Board and Position

```python
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod


class Color(Enum):
    WHITE = "white"
    BLACK = "black"

    @property
    def opponent(self) -> Color:
        return Color.BLACK if self == Color.WHITE else Color.WHITE


class GameStatus(Enum):
    ACTIVE = "active"
    WHITE_WINS = "white_wins"
    BLACK_WINS = "black_wins"
    STALEMATE = "stalemate"
    RESIGNED = "resigned"


@dataclass(frozen=True)
class Position:
    row: int  # 0-7 (0 = rank 1 for white)
    col: int  # 0-7 (0 = file 'a')

    def is_valid(self) -> bool:
        return 0 <= self.row <= 7 and 0 <= self.col <= 7

    def __add__(self, delta: tuple[int, int]) -> Position:
        return Position(self.row + delta[0], self.col + delta[1])

    def to_notation(self) -> str:
        """Convert to chess notation (e.g., 'e4')."""
        return chr(ord('a') + self.col) + str(self.row + 1)


@dataclass
class Move:
    piece: Piece
    from_pos: Position
    to_pos: Position
    captured_piece: Piece | None = None
```

### Board

```python
class Board:
    def __init__(self):
        self._grid: list[list[Piece | None]] = [
            [None for _ in range(8)] for _ in range(8)
        ]

    def get_piece(self, pos: Position) -> Piece | None:
        if not pos.is_valid():
            return None
        return self._grid[pos.row][pos.col]

    def place_piece(self, piece: Piece, pos: Position) -> None:
        self._grid[pos.row][pos.col] = piece
        piece.position = pos

    def remove_piece(self, pos: Position) -> Piece | None:
        piece = self._grid[pos.row][pos.col]
        self._grid[pos.row][pos.col] = None
        return piece

    def move_piece(self, from_pos: Position, to_pos: Position) -> Piece | None:
        """Move piece from one position to another. Returns captured piece."""
        piece = self.remove_piece(from_pos)
        if piece is None:
            raise ValueError(f"No piece at {from_pos.to_notation()}")
        captured = self.remove_piece(to_pos)
        self.place_piece(piece, to_pos)
        piece.has_moved = True
        return captured

    def find_king(self, color: Color) -> Position | None:
        """Find the position of the king of the given color."""
        for row in range(8):
            for col in range(8):
                piece = self._grid[row][col]
                if isinstance(piece, King) and piece.color == color:
                    return Position(row, col)
        return None

    def get_all_pieces(self, color: Color) -> list[Piece]:
        pieces = []
        for row in range(8):
            for col in range(8):
                piece = self._grid[row][col]
                if piece is not None and piece.color == color:
                    pieces.append(piece)
        return pieces

    def is_position_under_attack(self, pos: Position, by_color: Color) -> bool:
        """Check if a position is attacked by any piece of the given color."""
        for piece in self.get_all_pieces(by_color):
            if pos in piece.get_valid_moves(self, ignore_check=True):
                return True
        return False

    def display(self) -> str:
        lines = []
        for row in range(7, -1, -1):
            rank = f"{row + 1} "
            for col in range(8):
                piece = self._grid[row][col]
                rank += piece.symbol() + " " if piece else ". "
            lines.append(rank)
        lines.append("  a b c d e f g h")
        return "\n".join(lines)
```

---

## 4. Piece Hierarchy

### Base Piece

```python
class Piece(ABC):
    def __init__(self, color: Color, position: Position):
        self._color = color
        self._position = position
        self._has_moved = False

    @property
    def color(self) -> Color:
        return self._color

    @property
    def position(self) -> Position:
        return self._position

    @position.setter
    def position(self, pos: Position) -> None:
        self._position = pos

    @property
    def has_moved(self) -> bool:
        return self._has_moved

    @has_moved.setter
    def has_moved(self, value: bool) -> None:
        self._has_moved = value

    @abstractmethod
    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        pass

    @abstractmethod
    def symbol(self) -> str:
        pass

    def _is_valid_target(self, pos: Position, board: Board) -> bool:
        """Check if a position is on the board and not occupied by a friendly piece."""
        if not pos.is_valid():
            return False
        piece = board.get_piece(pos)
        return piece is None or piece.color != self._color

    def _get_sliding_moves(self, board: Board,
                           directions: list[tuple[int, int]]) -> list[Position]:
        """Get moves for sliding pieces (rook, bishop, queen)."""
        moves = []
        for dr, dc in directions:
            current = self._position
            while True:
                next_pos = current + (dr, dc)
                if not next_pos.is_valid():
                    break
                target = board.get_piece(next_pos)
                if target is None:
                    moves.append(next_pos)
                elif target.color != self._color:
                    moves.append(next_pos)  # Can capture
                    break
                else:
                    break  # Blocked by friendly piece
                current = next_pos
        return moves
```

### Concrete Pieces

```python
class King(Piece):
    DELTAS = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        moves = []
        for delta in self.DELTAS:
            pos = self._position + delta
            if self._is_valid_target(pos, board):
                moves.append(pos)
        return moves

    def symbol(self) -> str:
        return "K" if self._color == Color.WHITE else "k"


class Queen(Piece):
    DIRECTIONS = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        return self._get_sliding_moves(board, self.DIRECTIONS)

    def symbol(self) -> str:
        return "Q" if self._color == Color.WHITE else "q"


class Rook(Piece):
    DIRECTIONS = [(-1,0),(1,0),(0,-1),(0,1)]

    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        return self._get_sliding_moves(board, self.DIRECTIONS)

    def symbol(self) -> str:
        return "R" if self._color == Color.WHITE else "r"


class Bishop(Piece):
    DIRECTIONS = [(-1,-1),(-1,1),(1,-1),(1,1)]

    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        return self._get_sliding_moves(board, self.DIRECTIONS)

    def symbol(self) -> str:
        return "B" if self._color == Color.WHITE else "b"


class Knight(Piece):
    DELTAS = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]

    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        moves = []
        for delta in self.DELTAS:
            pos = self._position + delta
            if self._is_valid_target(pos, board):
                moves.append(pos)
        return moves

    def symbol(self) -> str:
        return "N" if self._color == Color.WHITE else "n"


class Pawn(Piece):
    def get_valid_moves(self, board: Board, ignore_check: bool = False) -> list[Position]:
        moves = []
        direction = 1 if self._color == Color.WHITE else -1
        start_row = 1 if self._color == Color.WHITE else 6

        # Forward one
        one_ahead = self._position + (direction, 0)
        if one_ahead.is_valid() and board.get_piece(one_ahead) is None:
            moves.append(one_ahead)

            # Forward two (from starting position)
            if self._position.row == start_row:
                two_ahead = self._position + (2 * direction, 0)
                if two_ahead.is_valid() and board.get_piece(two_ahead) is None:
                    moves.append(two_ahead)

        # Diagonal captures
        for dc in [-1, 1]:
            capture_pos = self._position + (direction, dc)
            if capture_pos.is_valid():
                target = board.get_piece(capture_pos)
                if target is not None and target.color != self._color:
                    moves.append(capture_pos)

        return moves

    def symbol(self) -> str:
        return "P" if self._color == Color.WHITE else "p"
```

---

## 5. Move Validation

```python
class MoveValidator:
    """Validates that a move does not leave the player's own king in check."""

    @staticmethod
    def is_legal_move(board: Board, piece: Piece,
                      from_pos: Position, to_pos: Position) -> bool:
        """A move is legal if: the piece can reach that square AND
        making the move does not leave the player's king in check."""
        if to_pos not in piece.get_valid_moves(board, ignore_check=True):
            return False

        # Simulate the move
        captured = board.get_piece(to_pos)
        board.remove_piece(from_pos)
        if captured:
            board.remove_piece(to_pos)
        board.place_piece(piece, to_pos)

        # Check if own king is in check after the move
        king_pos = board.find_king(piece.color)
        in_check = board.is_position_under_attack(king_pos, piece.color.opponent)

        # Undo the move
        board.remove_piece(to_pos)
        board.place_piece(piece, from_pos)
        if captured:
            board.place_piece(captured, to_pos)

        return not in_check

    @staticmethod
    def get_all_legal_moves(board: Board, color: Color) -> list[tuple[Position, Position]]:
        """Get all legal moves for a color."""
        legal_moves = []
        for piece in board.get_all_pieces(color):
            for target in piece.get_valid_moves(board, ignore_check=True):
                if MoveValidator.is_legal_move(board, piece, piece.position, target):
                    legal_moves.append((piece.position, target))
        return legal_moves
```

---

## 6. Game State Management

```python
class ChessGame:
    def __init__(self):
        self._board = Board()
        self._current_turn = Color.WHITE
        self._status = GameStatus.ACTIVE
        self._move_history: list[Move] = []
        self._setup_board()

    @property
    def status(self) -> GameStatus:
        return self._status

    @property
    def current_turn(self) -> Color:
        return self._current_turn

    def make_move(self, from_pos: Position, to_pos: Position) -> Move:
        """Make a move. Raises ValueError if move is illegal."""
        if self._status != GameStatus.ACTIVE:
            raise ValueError(f"Game is over: {self._status.value}")

        piece = self._board.get_piece(from_pos)
        if piece is None:
            raise ValueError(f"No piece at {from_pos.to_notation()}")
        if piece.color != self._current_turn:
            raise ValueError(f"It is {self._current_turn.value}'s turn")

        if not MoveValidator.is_legal_move(self._board, piece, from_pos, to_pos):
            raise ValueError(
                f"Illegal move: {from_pos.to_notation()} -> {to_pos.to_notation()}"
            )

        captured = self._board.move_piece(from_pos, to_pos)
        move = Move(piece=piece, from_pos=from_pos, to_pos=to_pos,
                    captured_piece=captured)
        self._move_history = [*self._move_history, move]

        # Switch turns
        self._current_turn = self._current_turn.opponent

        # Check game status
        self._update_status()
        return move

    def resign(self) -> None:
        self._status = GameStatus.RESIGNED

    def display(self) -> str:
        return self._board.display()

    def _update_status(self) -> None:
        legal_moves = MoveValidator.get_all_legal_moves(self._board, self._current_turn)

        if not legal_moves:
            king_pos = self._board.find_king(self._current_turn)
            if king_pos and self._board.is_position_under_attack(
                king_pos, self._current_turn.opponent
            ):
                # Checkmate
                winner = self._current_turn.opponent
                self._status = (
                    GameStatus.WHITE_WINS if winner == Color.WHITE
                    else GameStatus.BLACK_WINS
                )
            else:
                # Stalemate
                self._status = GameStatus.STALEMATE

    def _setup_board(self) -> None:
        """Place all pieces in standard starting positions."""
        piece_order = [Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook]

        for col, piece_class in enumerate(piece_order):
            self._board.place_piece(piece_class(Color.WHITE, Position(0, col)), Position(0, col))
            self._board.place_piece(piece_class(Color.BLACK, Position(7, col)), Position(7, col))

        for col in range(8):
            self._board.place_piece(Pawn(Color.WHITE, Position(1, col)), Position(1, col))
            self._board.place_piece(Pawn(Color.BLACK, Position(6, col)), Position(6, col))
```

---

## 7. Check and Checkmate Detection

The logic is integrated into `_update_status()` above. Here is the algorithm explained:

```
IS IN CHECK?
  1. Find the current player's king position
  2. For each opponent piece, check if king's position is in its valid moves
  3. If any opponent piece can reach the king -> CHECK

IS CHECKMATE?
  1. Current player is in check (from above)
  2. Try every legal move for every piece of the current player
  3. If NO legal move gets out of check -> CHECKMATE
  4. If at least one move exists -> just check, not checkmate

IS STALEMATE?
  1. Current player is NOT in check
  2. Current player has NO legal moves
  3. -> STALEMATE (draw)
```

---

## 8. Bonus: Tic-Tac-Toe

A simplified game to show the same patterns at a smaller scale.

```python
class TicTacToe:
    def __init__(self, size: int = 3):
        self._size = size
        self._board = [["." for _ in range(size)] for _ in range(size)]
        self._current = "X"
        self._winner: str | None = None
        self._moves = 0

    def make_move(self, row: int, col: int) -> str:
        if self._winner:
            return f"Game over! {self._winner} wins."
        if not (0 <= row < self._size and 0 <= col < self._size):
            raise ValueError("Position out of bounds")
        if self._board[row][col] != ".":
            raise ValueError("Position already taken")

        self._board[row][col] = self._current
        self._moves += 1

        if self._check_winner(row, col):
            self._winner = self._current
            return f"{self._current} wins!"

        if self._moves == self._size * self._size:
            return "Draw!"

        self._current = "O" if self._current == "X" else "X"
        return f"{self._current}'s turn"

    def _check_winner(self, row: int, col: int) -> bool:
        s = self._size
        player = self._board[row][col]

        # Check row
        if all(self._board[row][c] == player for c in range(s)):
            return True
        # Check column
        if all(self._board[r][col] == player for r in range(s)):
            return True
        # Check diagonals
        if row == col and all(self._board[i][i] == player for i in range(s)):
            return True
        if row + col == s - 1 and all(self._board[i][s-1-i] == player for i in range(s)):
            return True
        return False

    def display(self) -> str:
        return "\n".join(" ".join(row) for row in self._board)
```

---

## 9. Bonus: Snake Game

A grid-based game using the State pattern for direction and a deque for the snake body.

```python
from collections import deque
import random


class SnakeGame:
    def __init__(self, width: int = 20, height: int = 10):
        self._width = width
        self._height = height
        self._snake = deque([(height // 2, width // 2)])
        self._direction = (0, 1)  # Moving right
        self._food: tuple[int, int] | None = None
        self._score = 0
        self._game_over = False
        self._place_food()

    def change_direction(self, direction: str) -> None:
        directions = {
            "UP": (-1, 0), "DOWN": (1, 0),
            "LEFT": (0, -1), "RIGHT": (0, 1),
        }
        new_dir = directions.get(direction.upper())
        if new_dir is None:
            return
        # Prevent 180-degree turns
        if (new_dir[0] + self._direction[0] == 0 and
                new_dir[1] + self._direction[1] == 0):
            return
        self._direction = new_dir

    def step(self) -> str:
        if self._game_over:
            return f"Game Over! Score: {self._score}"

        head_r, head_c = self._snake[0]
        new_head = (head_r + self._direction[0], head_c + self._direction[1])

        # Wall collision
        if not (0 <= new_head[0] < self._height and 0 <= new_head[1] < self._width):
            self._game_over = True
            return f"Game Over! Hit wall. Score: {self._score}"

        # Self collision
        if new_head in self._snake:
            self._game_over = True
            return f"Game Over! Hit self. Score: {self._score}"

        self._snake.appendleft(new_head)

        if new_head == self._food:
            self._score += 1
            self._place_food()
        else:
            self._snake.pop()

        return f"Score: {self._score}"

    def _place_food(self) -> None:
        empty = [
            (r, c) for r in range(self._height) for c in range(self._width)
            if (r, c) not in self._snake
        ]
        if empty:
            self._food = random.choice(empty)
```

---

## 10. Interview Walkthrough

### Step 1: Clarify (3 min)

- "Full chess with all rules, or simplified?" (Start with basic moves, add castling/en passant as extensions)
- "Do I need to render the board?" (ASCII display is fine)
- "Should I implement an AI opponent?" (No, just the rules engine)

### Step 2: Design Classes (5 min)

Draw the hierarchy: Piece (ABC) -> King, Queen, Rook, Bishop, Knight, Pawn. Board holds
the grid. ChessGame manages turns and state.

### Step 3: Implement (25 min)

Start with Position, Board, and the Piece ABC. Then implement 2-3 piece types (King, Rook, Knight
cover most patterns). Add ChessGame for turn management.

### Step 4: Discuss (5 min)

How to add castling, en passant, pawn promotion, 50-move rule.

---

## 11. Common Follow-Up Questions

### "How would you add castling?"

Check: king has not moved, rook has not moved, no pieces between them, king does not pass
through check. Implement as a special case in King's `get_valid_moves`.

### "How would you add pawn promotion?"

When a pawn reaches the last rank, prompt the player to choose a piece type (Queen, Rook,
Bishop, Knight). Replace the pawn with the chosen piece on the board.

### "How would you implement an AI?"

Minimax algorithm with alpha-beta pruning. Evaluate board positions using a scoring function
(material count, piece position tables, king safety). This is a separate concern from the
game rules -- use the Strategy pattern for `Player` (HumanPlayer vs AIPlayer).

### "How would you add a move timer?"

Each player gets a total time budget (e.g., 10 minutes). Start a timer on turn start,
pause on turn end. If time runs out, the player loses.

---

## 12. Gotchas

- **The king cannot move into check.** Filter the king's valid moves through
  `is_position_under_attack`. This is the trickiest part of the implementation.

- **Infinite recursion in check detection.** When computing if a king is in check, you call
  `get_valid_moves` on opponent pieces. If those pieces also check for check, you get infinite
  recursion. The `ignore_check` parameter breaks this cycle.

- **Pawn direction is color-dependent.** White pawns move up (row+1), black pawns move down
  (row-1). Forgetting this is a common bug.

- **Knight is the only piece that jumps.** All other pieces are blocked by pieces in their path.
  The sliding move helper handles this, but do not forget Knight is different.

- **Board coordinates vs chess notation.** Decide early whether row 0 is rank 1 (white's side)
  or rank 8. Be consistent. Off-by-one errors here are extremely common.

---

## 13. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Position (frozen)          | Immutable (row, col) with validation   |
| Piece (ABC)                | Color, position, get_valid_moves()     |
| Board                      | 8x8 grid, piece placement, attack check|
| ChessGame                  | Turn management, check/checkmate, state|
| MoveValidator              | Legal move check (no self-check)       |
| Move                       | Record of from, to, captured piece     |
+----------------------------+----------------------------------------+

Piece Movement Patterns:
+---------+---------------------------------------------+
| Piece   | Movement                                    |
+---------+---------------------------------------------+
| King    | 1 square any direction                      |
| Queen   | Any distance: horizontal, vertical, diagonal|
| Rook    | Any distance: horizontal, vertical          |
| Bishop  | Any distance: diagonal                      |
| Knight  | L-shape: 2+1, jumps over pieces             |
| Pawn    | Forward 1 (2 from start), diagonal capture  |
+---------+---------------------------------------------+

Patterns used:
- Inheritance     -> Piece hierarchy with polymorphic moves
- Template Method -> _get_sliding_moves() shared by Queen, Rook, Bishop
- Composition     -> Board has Pieces, Game has Board
- Immutability    -> Position is frozen dataclass
- Strategy        -> MoveValidator separable from Game logic
```
