# Low-Level Design (LLD) / Object-Oriented Design Interview Preparation Guide

## Overview

This directory contains comprehensive preparation materials for **Low-Level Design (LLD)** interviews,
also known as Object-Oriented Design (OOD) or Machine Coding interviews. These interviews test your
ability to design the internal structure of a system -- classes, interfaces, relationships, and
working code -- as opposed to the distributed infrastructure focus of system design interviews.

---

## LLD vs. System Design: What is the Difference?

```
+------------------------------------------------------------------+
|              SYSTEM DESIGN (HLD)          |    LOW-LEVEL DESIGN   |
|              High-Level Design            |    (LLD / OOD)        |
+-------------------------------------------+-----------------------+
| Focus: Distributed architecture           | Focus: Classes, code  |
| Scope: Entire system at 10,000 ft         | Scope: One component  |
| Output: Architecture diagrams, APIs       | Output: Class diagrams|
|         data models, infra choices        |         working code  |
| Asks: "How do services talk?"             | Asks: "How do objects |
|       "How does data flow?"               |        collaborate?"  |
| Tools: Load balancers, caches, queues,    | Tools: OOP, patterns, |
|        databases, CDNs                    |        SOLID, DI      |
| Time:  45-60 min whiteboard               | Time: 45-90 min code  |
+-------------------------------------------+-----------------------+
```

**Key distinction:** System design interviews ask you to decide _which_ services and databases to use.
LLD interviews ask you to write the _classes and methods_ inside one of those services.

---

## The LLD Interview Framework

Every LLD interview can be approached with this 4-step method:

```
+---------------------------------------------------------------+
|               LLD INTERVIEW (45-90 minutes)                   |
+---------------------------------------------------------------+
|                                                                |
|  STEP 1: Clarify Requirements            [5 min]     ~10%     |
|  +-----------------------------------------------------------+|
|  | Functional scope, edge cases, constraints, scale hints     ||
|  +-----------------------------------------------------------+|
|                                                                |
|  STEP 2: Identify Core Entities          [5-10 min]  ~15%     |
|  +-----------------------------------------------------------+|
|  | Nouns = classes, Verbs = methods, Adjectives = attributes  ||
|  | Draw class diagram, define relationships                   ||
|  +-----------------------------------------------------------+|
|                                                                |
|  STEP 3: Implement Code                  [25-50 min]  ~60%    |
|  +-----------------------------------------------------------+|
|  | Write clean, working code with proper OOP patterns         ||
|  | Handle edge cases, use design patterns where appropriate   ||
|  +-----------------------------------------------------------+|
|                                                                |
|  STEP 4: Discuss & Extend               [5-10 min]   ~15%     |
|  +-----------------------------------------------------------+|
|  | Trade-offs, extensibility, testing strategy, improvements  ||
|  +-----------------------------------------------------------+|
|                                                                |
+---------------------------------------------------------------+
```

---

## How to Use This Guide

1. **Start with Foundations** -- Read `01-OOP-PRINCIPLES.md` and `02-DESIGN-PATTERNS.md` first.
   These give you the vocabulary and tools you will use in every LLD interview.

2. **Practice the Classic Problems** -- Files `03` through `08` are the most frequently asked
   LLD interview questions. Work through them in order.

3. **Study Architecture** -- `09-CLEAN-ARCHITECTURE.md` teaches you how to structure large codebases,
   a skill that separates senior candidates from junior ones.

4. **Master Concurrency** -- `10-CONCURRENCY-PATTERNS.md` covers thread safety and async patterns,
   commonly asked as follow-up questions in LLD interviews.

5. **Code everything** -- Unlike system design, LLD interviews expect working code. Type out every
   example, do not just read them.

---

## Table of Contents

### Foundations

| #   | File                                           | Topic           | Key Concepts                                            |
| --- | ---------------------------------------------- | --------------- | ------------------------------------------------------- |
| 0   | [00-README.md](00-README.md)                   | This guide      | LLD vs HLD, interview framework                         |
| 1   | [01-OOP-PRINCIPLES.md](01-OOP-PRINCIPLES.md)   | OOP Principles  | SOLID, DRY, KISS, YAGNI, composition vs inheritance, DI |
| 2   | [02-DESIGN-PATTERNS.md](02-DESIGN-PATTERNS.md) | Design Patterns | Creational, Structural, Behavioral patterns with code   |

### Classic LLD Problems (Most Frequently Asked)

| #   | File                                                   | Topic                 | Key Concepts                                    |
| --- | ------------------------------------------------------ | --------------------- | ----------------------------------------------- |
| 3   | [03-LLD-PARKING-LOT.md](03-LLD-PARKING-LOT.md)         | Parking Lot System    | Inheritance, strategy, capacity tracking        |
| 4   | [04-LLD-LRU-CACHE.md](04-LLD-LRU-CACHE.md)             | LRU Cache             | Hash map + linked list, O(1) operations, TTL    |
| 5   | [05-LLD-ELEVATOR-SYSTEM.md](05-LLD-ELEVATOR-SYSTEM.md) | Elevator System       | State machine, scheduling algorithms, observer  |
| 6   | [06-LLD-TASK-SCHEDULER.md](06-LLD-TASK-SCHEDULER.md)   | Task Scheduler        | Priority queue, DAG dependencies, retry logic   |
| 7   | [07-LLD-FILE-SYSTEM.md](07-LLD-FILE-SYSTEM.md)         | In-Memory File System | Composite pattern, command pattern, permissions |
| 8   | [08-LLD-CHESS-GAME.md](08-LLD-CHESS-GAME.md)           | Chess Game            | Piece hierarchy, move validation, game state    |

### More LLD Problems (Commonly Asked)

| #   | File                                                   | Topic                       | Key Concepts                                                   |
| --- | ------------------------------------------------------ | --------------------------- | -------------------------------------------------------------- |
| 11  | [11-LLD-VENDING-MACHINE.md](11-LLD-VENDING-MACHINE.md) | Vending Machine             | State pattern, change calculation, inventory                   |
| 12  | [12-LLD-HOTEL-BOOKING.md](12-LLD-HOTEL-BOOKING.md)     | Hotel Reservation System    | Reservation lifecycle, pricing strategy, availability          |
| 13  | [13-LLD-LIBRARY-SYSTEM.md](13-LLD-LIBRARY-SYSTEM.md)   | Library Management          | Catalog, borrow/return, fines, reservations, observer          |
| 14  | [14-LLD-SNAKE-GAME.md](14-LLD-SNAKE-GAME.md)           | Snake Game                  | Deque body, collision detection, game loop, command            |
| 15  | [15-LLD-SPLITWISE.md](15-LLD-SPLITWISE.md)             | Expense Sharing (Splitwise) | Debt simplification, split strategies, graph-based settlement  |
| 16  | [16-LLD-MOVIE-TICKET.md](16-LLD-MOVIE-TICKET.md)       | Movie Ticket Booking        | Seat locking, concurrency, booking workflow, discounts         |
| 17  | [17-LLD-ATM.md](17-LLD-ATM.md)                         | ATM Machine                 | State pattern, denomination algorithm, chain of responsibility |
| 18  | [18-LLD-LOGGER.md](18-LLD-LOGGER.md)                   | Logging Framework           | Logger hierarchy, handlers, formatters, async logging          |

### Advanced Topics

| #   | File                                                     | Topic                | Key Concepts                                |
| --- | -------------------------------------------------------- | -------------------- | ------------------------------------------- |
| 9   | [09-CLEAN-ARCHITECTURE.md](09-CLEAN-ARCHITECTURE.md)     | Clean Architecture   | Layered, hexagonal, DDD, repository pattern |
| 10  | [10-CONCURRENCY-PATTERNS.md](10-CONCURRENCY-PATTERNS.md) | Concurrency Patterns | Locks, producer-consumer, async/await, GIL  |

---

## What Interviewers Look For

LLD interviews are evaluated on these dimensions:

```
+---------------------+------+------------------------------------------+
| Dimension           | Wt.  | What They Evaluate                       |
+---------------------+------+------------------------------------------+
| Problem Breakdown   | 20%  | Can you decompose a vague problem into   |
|                     |      | concrete classes and interfaces?          |
+---------------------+------+------------------------------------------+
| OOP & Patterns      | 25%  | Do you use inheritance, composition,     |
|                     |      | and design patterns appropriately?        |
+---------------------+------+------------------------------------------+
| Code Quality        | 25%  | Is the code clean, modular, and testable?|
|                     |      | Good naming, small functions, no duplication|
+---------------------+------+------------------------------------------+
| Extensibility       | 15%  | Can the design handle new requirements   |
|                     |      | without major rewrites?                  |
+---------------------+------+------------------------------------------+
| Communication       | 15%  | Do you explain trade-offs and justify    |
|                     |      | your choices clearly?                    |
+---------------------+------+------------------------------------------+
```

---

## Common Mistakes to Avoid

1. **Starting to code immediately** -- Always spend 5-10 minutes on requirements and class design first.
2. **Over-engineering** -- Do not add patterns just to show you know them. Every pattern should solve a real problem.
3. **God classes** -- If one class has 15 methods, it is doing too much. Break it down.
4. **Ignoring edge cases** -- The interviewer will ask about them. Handle nulls, empty inputs, concurrent access.
5. **No interfaces/abstractions** -- If you hardcode concrete classes everywhere, you cannot extend the design.
6. **Skipping the class diagram** -- Even a rough ASCII diagram helps you organize your thoughts before coding.

---

## Quick Reference: Top LLD Interview Questions

| #   | Problem                     | Patterns Used                       | Difficulty | File                            |
| --- | --------------------------- | ----------------------------------- | ---------- | ------------------------------- |
| 1   | Parking Lot                 | Strategy, Factory                   | Medium     | [03](03-LLD-PARKING-LOT.md)     |
| 2   | LRU Cache                   | Hash Map + Linked List              | Medium     | [04](04-LLD-LRU-CACHE.md)       |
| 3   | Elevator System             | State, Observer, Strategy           | Hard       | [05](05-LLD-ELEVATOR-SYSTEM.md) |
| 4   | Task/Job Scheduler          | Priority Queue, DAG                 | Hard       | [06](06-LLD-TASK-SCHEDULER.md)  |
| 5   | In-Memory File System       | Composite, Command                  | Medium     | [07](07-LLD-FILE-SYSTEM.md)     |
| 6   | Chess / Tic-Tac-Toe         | Inheritance, Strategy               | Medium     | [08](08-LLD-CHESS-GAME.md)      |
| 7   | Vending Machine             | State, Strategy                     | Medium     | [11](11-LLD-VENDING-MACHINE.md) |
| 8   | Hotel Booking System        | Strategy, State, Observer           | Medium     | [12](12-LLD-HOTEL-BOOKING.md)   |
| 9   | Library Management          | Repository, Observer, Strategy      | Medium     | [13](13-LLD-LIBRARY-SYSTEM.md)  |
| 10  | Snake Game                  | State, Command, Deque               | Medium     | [14](14-LLD-SNAKE-GAME.md)      |
| 11  | Splitwise / Expense Sharing | Strategy, Graph, Observer           | Hard       | [15](15-LLD-SPLITWISE.md)       |
| 12  | Movie Ticket Booking        | State, Strategy, Locking            | Hard       | [16](16-LLD-MOVIE-TICKET.md)    |
| 13  | ATM Machine                 | State, Command, Chain of Resp.      | Hard       | [17](17-LLD-ATM.md)             |
| 14  | Logging Framework           | Singleton, Chain of Resp., Strategy | Hard       | [18](18-LLD-LOGGER.md)          |
