# JavaScript Core Concepts

## Overview

JavaScript is the foundation of every frontend interview. Even if the role is "React Developer," interviewers will probe your understanding of the language itself -- closures, the event loop, prototypal inheritance, asynchronous patterns, and the `this` keyword. These concepts are tested because they reveal whether you truly understand the code you write or merely copy patterns from documentation.

This guide covers the topics that appear most frequently in interviews, with emphasis on the *why* behind each concept, not just the *what*. Understanding these fundamentals will make you more effective at debugging, optimizing, and architecting JavaScript applications.

---

## Core Concepts

### Closures

A closure is a function that retains access to its lexical scope even when executed outside that scope. Every function in JavaScript creates a closure.

```javascript
function createCounter(initialValue) {
  let count = initialValue;

  return {
    increment() { return ++count; },
    decrement() { return --count; },
    getCount()  { return count; }
  };
}

const counter = createCounter(0);
counter.increment();  // 1
counter.increment();  // 2
counter.getCount();   // 2

// 'count' is not accessible directly -- it is enclosed
// The returned methods "close over" the variable
```

#### Practical Uses of Closures

```javascript
// 1. Data privacy (module pattern)
function createWallet(balance) {
  // 'balance' is private, only accessible through the returned interface
  return {
    deposit(amount) {
      if (amount <= 0) throw new Error("Amount must be positive");
      balance += amount;
      return balance;
    },
    getBalance() {
      return balance;
    }
  };
}

// 2. Function factories
function createMultiplier(factor) {
  return (number) => number * factor;
}
const double = createMultiplier(2);
const triple = createMultiplier(3);
double(5);   // 10
triple(5);   // 15

// 3. Memoization
function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

const expensiveCalc = memoize((n) => {
  // Simulate expensive computation
  let result = 0;
  for (let i = 0; i < n; i++) result += Math.sqrt(i);
  return result;
});
```

#### The Classic Closure Trap

```javascript
// PROBLEM: All callbacks share the same 'i'
for (var i = 0; i < 5; i++) {
  setTimeout(() => {
    // When this runs, the loop is done. i = 5 for all callbacks.
  }, 100);
}
// Logs: 5, 5, 5, 5, 5

// FIX 1: Use let (block scoping)
for (let i = 0; i < 5; i++) {
  setTimeout(() => {
    // Each iteration gets its own 'i'
  }, 100);
}
// Logs: 0, 1, 2, 3, 4

// FIX 2: IIFE (pre-ES6)
for (var i = 0; i < 5; i++) {
  (function (j) {
    setTimeout(() => {
      // 'j' is a new variable per iteration
    }, 100);
  })(i);
}
```

### Scope Chain and Hoisting

JavaScript has three types of scope: global, function, and block. When a variable is referenced, the engine searches up the scope chain from the current scope to the global scope.

#### Hoisting

Hoisting is JavaScript's behavior of moving declarations to the top of their scope during compilation.

```javascript
// What you write:
greet("Alice");

function greet(name) {
  return `Hello, ${name}`;
}

// What the engine sees (conceptually):
function greet(name) {
  return `Hello, ${name}`;
}
greet("Alice");   // Works: function declarations are fully hoisted
```

```javascript
// var is hoisted (declaration only, not initialization)
console.log(x);   // undefined (not ReferenceError)
var x = 10;

// let and const are hoisted but NOT initialized (Temporal Dead Zone)
console.log(y);   // ReferenceError: Cannot access 'y' before initialization
let y = 20;

// The TDZ exists from the start of the block until the declaration
{
  // TDZ for 'z' starts here
  const fn = () => z;  // OK: not called yet
  // TDZ continues...
  let z = 30;          // TDZ ends
  fn();                // 30: works now
}
```

#### Scope Types

```javascript
// Global scope
var globalVar = "global";

function outer() {
  // Function scope
  var functionVar = "function";

  if (true) {
    // Block scope (let and const only)
    let blockLet = "block-let";
    const blockConst = "block-const";
    var blockVar = "still-function-scoped";   // var ignores block scope
  }

  console.log(blockVar);    // "still-function-scoped"
  console.log(blockLet);    // ReferenceError
}
```

### Prototypal Inheritance

JavaScript uses prototypal inheritance, not classical inheritance. Every object has an internal `[[Prototype]]` link to another object, forming a prototype chain.

```javascript
// Object.create: explicit prototype chain
const animal = {
  speak() {
    return `${this.name} makes a sound.`;
  }
};

const dog = Object.create(animal);
dog.name = "Rex";
dog.bark = function () {
  return `${this.name} barks!`;
};

dog.speak();   // "Rex makes a sound." (inherited from animal)
dog.bark();    // "Rex barks!" (own method)

// Prototype chain: dog -> animal -> Object.prototype -> null
```

#### ES6 Classes (Syntactic Sugar)

```javascript
class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    return `${this.name} makes a sound.`;
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name);     // MUST call super before using 'this'
    this.breed = breed;
  }

  bark() {
    return `${this.name} barks!`;
  }

  // Override parent method
  speak() {
    return `${this.name} barks loudly!`;
  }
}

const rex = new Dog("Rex", "Labrador");
rex.speak();   // "Rex barks loudly!"
rex.bark();    // "Rex barks!"

// Under the hood, this is still prototypal:
// rex -> Dog.prototype -> Animal.prototype -> Object.prototype -> null
rex instanceof Dog;      // true
rex instanceof Animal;   // true
```

#### Prototype Chain Lookup

```javascript
const obj = { a: 1 };

// Property lookup walks the chain
obj.a;             // 1 (found on obj itself)
obj.toString();    // "[object Object]" (found on Object.prototype)
obj.nonExistent;   // undefined (reached null, not found)

// hasOwnProperty vs. in
obj.hasOwnProperty("a");          // true
obj.hasOwnProperty("toString");   // false
"a" in obj;                        // true
"toString" in obj;                 // true (checks prototype chain)
```

### The `this` Keyword

`this` in JavaScript is determined by *how a function is called*, not where it is defined (with one exception: arrow functions).

#### Rules of `this` (in order of precedence)

```javascript
// 1. new binding: this = new object
function Person(name) {
  this.name = name;    // this = newly created object
}
const alice = new Person("Alice");

// 2. Explicit binding: call, apply, bind
function greet() {
  return `Hello, ${this.name}`;
}
const user = { name: "Bob" };
greet.call(user);       // "Hello, Bob"
greet.apply(user);      // "Hello, Bob"
const bound = greet.bind(user);
bound();                // "Hello, Bob"

// 3. Implicit binding: method call (dot notation)
const obj = {
  name: "Charlie",
  greet() { return `Hello, ${this.name}`; }
};
obj.greet();            // "Hello, Charlie"

// 4. Default binding: standalone function call
function standalone() {
  return this;          // global object (or undefined in strict mode)
}
standalone();

// 5. Arrow functions: lexical this (inherits from enclosing scope)
const team = {
  name: "Engineering",
  members: ["Alice", "Bob"],
  listMembers() {
    // Arrow function inherits 'this' from listMembers()
    return this.members.map((member) => `${member} from ${this.name}`);
  }
};
team.listMembers();   // ["Alice from Engineering", "Bob from Engineering"]
```

#### Common `this` Pitfalls

```javascript
// PROBLEM: Lost context when extracting a method
const obj = {
  name: "Dave",
  greet() { return `Hello, ${this.name}`; }
};
const fn = obj.greet;
fn();                // "Hello, undefined" (default binding)

// FIX: bind the method
const boundFn = obj.greet.bind(obj);
boundFn();           // "Hello, Dave"

// PROBLEM: this in event handlers
class Button {
  constructor(label) {
    this.label = label;
  }
  handleClick() {
    // 'this' is the DOM element, not the Button instance
  }
}
const btn = new Button("Submit");
// element.addEventListener("click", btn.handleClick);  // wrong this

// FIX 1: Arrow function in class field
class ButtonFixed {
  constructor(label) {
    this.label = label;
  }
  handleClick = () => {
    // Arrow function: 'this' is always the instance
  };
}

// FIX 2: Bind in constructor
class ButtonFixed2 {
  constructor(label) {
    this.label = label;
    this.handleClick = this.handleClick.bind(this);
  }
  handleClick() {
    // Now 'this' is the instance
  }
}
```

### The Event Loop

JavaScript is single-threaded. The event loop is the mechanism that allows asynchronous operations by coordinating the call stack, the task queues, and the microtask queue.

```
+---------------------------------------------------+
|                    Call Stack                       |
|  (Executes synchronous code, one frame at a time)  |
+---------------------------------------------------+
            |                        ^
            v                        |
+---------------------------------------------------+
|                    Event Loop                      |
|  1. Execute all code on the call stack             |
|  2. Drain the entire microtask queue               |
|  3. Render (if needed)                             |
|  4. Pick ONE task from the macrotask queue         |
|  5. Go to step 1                                   |
+---------------------------------------------------+
            |                        ^
            v                        |
+----------------------+   +----------------------+
|   Microtask Queue    |   |   Macrotask Queue    |
| - Promise.then/catch |   | - setTimeout         |
| - queueMicrotask()   |   | - setInterval        |
| - MutationObserver   |   | - I/O callbacks      |
| - process.nextTick() |   | - requestAnimationFrame* |
+----------------------+   | - UI rendering events|
                           +----------------------+
```

*Note: `requestAnimationFrame` runs before the next repaint, which is between macrotask cycles.*

#### Microtasks vs. Macrotasks

```javascript
console.log("1: synchronous");

setTimeout(() => {
  console.log("2: macrotask (setTimeout)");
}, 0);

Promise.resolve().then(() => {
  console.log("3: microtask (Promise.then)");
});

queueMicrotask(() => {
  console.log("4: microtask (queueMicrotask)");
});

console.log("5: synchronous");

// Output order:
// 1: synchronous
// 5: synchronous
// 3: microtask (Promise.then)
// 4: microtask (queueMicrotask)
// 2: macrotask (setTimeout)
```

#### Why This Matters

```javascript
// Microtasks can starve the event loop
function badIdea() {
  Promise.resolve().then(badIdea);
  // This creates an infinite microtask loop
  // The browser NEVER gets to render or process macrotasks
  // The page freezes
}

// Use macrotasks for non-urgent work
function processLargeArray(items) {
  let index = 0;
  function processChunk() {
    const end = Math.min(index + 100, items.length);
    for (; index < end; index++) {
      // Process item
    }
    if (index < items.length) {
      setTimeout(processChunk, 0);  // Yield to the event loop
    }
  }
  processChunk();
}
```

### Promises and Async/Await

#### Promise States

A Promise is in one of three states:
- **Pending**: Initial state, not yet resolved or rejected
- **Fulfilled**: Operation completed successfully
- **Rejected**: Operation failed

```javascript
// Creating a Promise
const fetchUser = (id) => {
  return new Promise((resolve, reject) => {
    if (!id) {
      reject(new Error("User ID is required"));
      return;
    }
    // Simulate async operation
    setTimeout(() => {
      resolve({ id, name: "Alice" });
    }, 1000);
  });
};

// Consuming with .then/.catch
fetchUser(1)
  .then((user) => {
    return fetchProfile(user.id);  // Returns another Promise
  })
  .then((profile) => {
    // Handle profile
  })
  .catch((error) => {
    // Handles errors from ANY step in the chain
  })
  .finally(() => {
    // Always runs, regardless of success or failure
  });
```

#### Async/Await

```javascript
// Async/await is syntactic sugar over Promises
async function getUserProfile(id) {
  try {
    const user = await fetchUser(id);
    const profile = await fetchProfile(user.id);
    return { ...user, ...profile };
  } catch (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }
}

// Parallel execution
async function loadDashboard(userId) {
  // WRONG: Sequential (slow)
  const user = await fetchUser(userId);
  const posts = await fetchPosts(userId);
  const notifications = await fetchNotifications(userId);
  // Total time: sum of all three

  // CORRECT: Parallel (fast)
  const [user2, posts2, notifications2] = await Promise.all([
    fetchUser(userId),
    fetchPosts(userId),
    fetchNotifications(userId)
  ]);
  // Total time: max of the three
}
```

#### Promise Combinators

```javascript
// Promise.all: resolves when ALL resolve, rejects if ANY rejects
const results = await Promise.all([p1, p2, p3]);

// Promise.allSettled: waits for ALL to settle (resolve or reject)
const outcomes = await Promise.allSettled([p1, p2, p3]);
// outcomes: [
//   { status: "fulfilled", value: ... },
//   { status: "rejected", reason: ... },
//   { status: "fulfilled", value: ... }
// ]

// Promise.race: resolves/rejects with the FIRST to settle
const fastest = await Promise.race([p1, p2, p3]);

// Promise.any: resolves with the FIRST to fulfill (ignores rejections)
const firstSuccess = await Promise.any([p1, p2, p3]);
// Throws AggregateError only if ALL reject
```

### Generators

Generators are functions that can pause execution and resume later, yielding multiple values over time.

```javascript
function* range(start, end, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}

const gen = range(0, 10, 2);
gen.next();   // { value: 0, done: false }
gen.next();   // { value: 2, done: false }
gen.next();   // { value: 4, done: false }

// Iterate with for...of
for (const num of range(0, 5)) {
  // 0, 1, 2, 3, 4
}

// Spread into array
const numbers = [...range(0, 5)];   // [0, 1, 2, 3, 4]
```

#### Generators for Lazy Evaluation

```javascript
// Infinite sequence (only generates values on demand)
function* fibonacci() {
  let a = 0;
  let b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

// Take first N values
function take(n, iterable) {
  const result = [];
  for (const item of iterable) {
    result.push(item);
    if (result.length === n) break;
  }
  return result;
}

take(8, fibonacci());   // [0, 1, 1, 2, 3, 5, 8, 13]
```

#### Async Generators

```javascript
async function* fetchPages(url) {
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(`${url}?page=${page}`);
    const data = await response.json();
    yield data.items;
    hasMore = data.hasNextPage;
    page++;
  }
}

// Consume with for-await-of
async function getAllItems(url) {
  const allItems = [];
  for await (const items of fetchPages(url)) {
    allItems.push(...items);
  }
  return allItems;
}
```

### WeakMap and WeakSet

`WeakMap` and `WeakSet` hold *weak* references to their keys/values, allowing garbage collection when there are no other references.

```javascript
// WeakMap: keys must be objects, keys are weakly held
const metadata = new WeakMap();

function processElement(element) {
  // Store metadata about a DOM element
  metadata.set(element, {
    clickCount: 0,
    lastInteraction: Date.now()
  });
}

// When the DOM element is removed and no other references exist,
// the WeakMap entry is automatically garbage collected.
// This prevents memory leaks.

// WeakSet: values must be objects, weakly held
const visited = new WeakSet();

function trackVisit(user) {
  if (visited.has(user)) return;
  visited.add(user);
  // Process first visit
}
```

#### Key Differences from Map/Set

| Feature | Map/Set | WeakMap/WeakSet |
|---------|---------|-----------------|
| Keys/Values | Any type | Objects only |
| Enumerable | Yes (iterable) | No (not iterable) |
| `.size` | Yes | No |
| Garbage collection | Prevents GC | Allows GC |
| Use case | General storage | Metadata, caching |

### Proxy and Reflect

`Proxy` creates a wrapper around an object that intercepts fundamental operations. `Reflect` provides methods that correspond 1:1 with Proxy traps.

```javascript
const handler = {
  get(target, property, receiver) {
    if (property in target) {
      return Reflect.get(target, property, receiver);
    }
    throw new Error(`Property "${String(property)}" does not exist`);
  },

  set(target, property, value, receiver) {
    if (typeof value !== "number") {
      throw new TypeError(`Expected number, got ${typeof value}`);
    }
    return Reflect.set(target, property, value, receiver);
  },

  deleteProperty(target, property) {
    if (property.startsWith("_")) {
      throw new Error("Cannot delete private properties");
    }
    return Reflect.deleteProperty(target, property);
  }
};

const scores = new Proxy({}, handler);
scores.math = 95;        // OK
scores.math;             // 95
scores.english = "A";    // TypeError: Expected number
scores.physics;          // Error: Property "physics" does not exist
```

#### Practical Proxy Use Cases

```javascript
// 1. Observable objects (reactive systems)
function makeObservable(target, onChange) {
  return new Proxy(target, {
    set(obj, prop, value, receiver) {
      const oldValue = obj[prop];
      const result = Reflect.set(obj, prop, value, receiver);
      if (oldValue !== value) {
        onChange(prop, value, oldValue);
      }
      return result;
    }
  });
}

const state = makeObservable({ count: 0 }, (prop, newVal, oldVal) => {
  // Re-render or notify subscribers
});

// 2. Validation
function withValidation(target, schema) {
  return new Proxy(target, {
    set(obj, prop, value) {
      if (schema[prop]) {
        const isValid = schema[prop](value);
        if (!isValid) throw new Error(`Invalid value for ${String(prop)}`);
      }
      return Reflect.set(obj, prop, value);
    }
  });
}
```

### Modules: ESM vs. CommonJS

```javascript
// ===== ES Modules (ESM) =====
// Static imports (hoisted, analyzed at compile time)
import { useState, useEffect } from "react";
import defaultExport from "./module.js";
import * as utils from "./utils.js";

// Named exports
export function add(a, b) { return a + b; }
export const PI = 3.14159;

// Default export
export default class Calculator { }

// Dynamic import (lazy loading)
const module = await import("./heavy-module.js");

// ===== CommonJS (CJS) =====
// Dynamic requires (evaluated at runtime)
const fs = require("fs");
const { join } = require("path");

// Exports
module.exports = function add(a, b) { return a + b; };
module.exports = { add, subtract };
exports.helper = function () { };
```

#### Key Differences

| Feature | ESM | CommonJS |
|---------|-----|----------|
| Syntax | `import` / `export` | `require()` / `module.exports` |
| Loading | Static (compile-time) | Dynamic (runtime) |
| Binding | Live bindings (reference) | Value copy (snapshot) |
| Top-level `this` | `undefined` | `module.exports` |
| Tree-shakeable | Yes | No (dynamic, hard to analyze) |
| Async | Supports top-level `await` | Synchronous only |
| Circular deps | Handled (live bindings) | Partial (snapshot at require time) |
| Browser support | Native | Needs bundler |

---

## Common Interview Questions

### 1. "Explain closures and give a practical use case."

**Answer**: A closure is formed when a function retains access to variables from its outer (enclosing) scope, even after the outer function has returned. This happens because JavaScript functions carry a reference to their lexical environment.

Practical example -- a rate limiter:

```javascript
function createRateLimiter(maxCalls, windowMs) {
  const calls = [];

  return function rateLimited(fn) {
    const now = Date.now();
    // Remove calls outside the time window
    while (calls.length > 0 && calls[0] <= now - windowMs) {
      calls.shift();
    }
    if (calls.length >= maxCalls) {
      throw new Error("Rate limit exceeded");
    }
    calls.push(now);
    return fn();
  };
}

const limiter = createRateLimiter(5, 1000); // 5 calls per second
```

### 2. "What is the output of this code and why?"

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```

**Answer**: It logs `3, 3, 3`. Because `var` is function-scoped (not block-scoped), there is only one `i` variable shared across all iterations. By the time the setTimeout callbacks execute (after the loop completes), `i` is `3`. Using `let` instead of `var` would create a new `i` for each iteration, logging `0, 1, 2`.

### 3. "Explain the difference between `==` and `===`."

**Answer**: `===` (strict equality) compares value and type without coercion. `==` (loose equality) performs type coercion before comparison using a complex set of rules.

```javascript
0 == ""          // true  (both coerce to 0)
0 === ""         // false (number vs string)
null == undefined // true  (special case in the spec)
null === undefined // false (different types)
NaN == NaN       // false (NaN is not equal to anything)
NaN === NaN      // false

// Always use === unless you specifically need coercion
// The one acceptable use of == is checking for null/undefined:
if (value == null) {
  // Matches both null and undefined (and nothing else)
}
```

### 4. "What is the event loop? Explain the execution order."

```javascript
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve()
  .then(() => console.log("C"))
  .then(() => console.log("D"));

console.log("E");
```

**Answer**: Output is `A, E, C, D, B`.

1. `A` logs immediately (synchronous)
2. `setTimeout` callback is added to the macrotask queue
3. `Promise.then` callbacks are added to the microtask queue
4. `E` logs immediately (synchronous)
5. Call stack is empty; event loop drains microtask queue: `C` then `D`
6. Event loop picks next macrotask: `B`

### 5. "How does `this` work in arrow functions vs. regular functions?"

**Answer**: Regular functions determine `this` based on how they are called (dynamic binding). Arrow functions capture `this` from their enclosing lexical scope at the time they are defined (lexical binding). Arrow functions cannot have their `this` changed with `call`, `apply`, or `bind`.

```javascript
const obj = {
  value: 42,
  regular() {
    return this.value;          // this = obj (implicit binding)
  },
  arrow: () => {
    return this.value;          // this = enclosing scope (likely global/undefined)
  },
  delayed() {
    setTimeout(function () {
      // this = global (default binding in setTimeout)
    }, 100);
    setTimeout(() => {
      // this = obj (lexical, inherited from delayed())
    }, 100);
  }
};
```

### 6. "Implement Promise.all from scratch."

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let settledCount = 0;
    const promiseArray = Array.from(promises);

    if (promiseArray.length === 0) {
      resolve([]);
      return;
    }

    promiseArray.forEach((promise, index) => {
      Promise.resolve(promise)
        .then((value) => {
          results[index] = value;
          settledCount++;
          if (settledCount === promiseArray.length) {
            resolve(results);
          }
        })
        .catch(reject);   // First rejection rejects the whole Promise
    });
  });
}
```

### 7. "What is the Temporal Dead Zone?"

**Answer**: The Temporal Dead Zone (TDZ) is the period between entering a scope and the point where a `let` or `const` variable is declared. During this period, accessing the variable throws a `ReferenceError`. This prevents the confusing behavior of `var` hoisting where variables are `undefined` before their declaration.

```javascript
{
  // TDZ starts
  typeof myVar;    // ReferenceError (not undefined!)
  // TDZ continues...
  let myVar = 10;  // TDZ ends
  typeof myVar;    // "number"
}

// Compare with var:
{
  typeof myVar;    // "undefined" (hoisted, no TDZ)
  var myVar = 10;
}
```

### 8. "Explain prototypal inheritance. How is it different from classical inheritance?"

**Answer**: In classical inheritance (Java, C++), classes are blueprints that create instances. Inheritance creates a copy of the parent class structure. In JavaScript's prototypal inheritance, objects inherit directly from other objects via the prototype chain. There is no copying -- objects delegate to their prototype at runtime.

Key differences:
- **No classes**: ES6 `class` is syntactic sugar over prototypes
- **Dynamic**: You can modify prototypes at runtime and all instances reflect the change
- **Delegation, not copying**: Property lookups walk the chain until found or `null`
- **Multiple inheritance**: Not supported natively (but achievable via mixins)

---

## Code Examples

### Implementing Debounce with Leading/Trailing Options

```javascript
function debounce(fn, delay, options = {}) {
  const { leading = false, trailing = true } = options;
  let timeoutId = null;
  let lastArgs = null;

  function debounced(...args) {
    const isFirstCall = timeoutId === null;

    lastArgs = args;
    clearTimeout(timeoutId);

    if (leading && isFirstCall) {
      fn.apply(this, args);
    }

    timeoutId = setTimeout(() => {
      if (trailing && lastArgs) {
        fn.apply(this, lastArgs);
      }
      timeoutId = null;
      lastArgs = null;
    }, delay);
  }

  debounced.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
    lastArgs = null;
  };

  return debounced;
}

// Usage
const search = debounce(
  (query) => fetch(`/api/search?q=${query}`),
  300,
  { leading: false, trailing: true }
);
```

### Event Emitter (Pub/Sub Pattern)

```javascript
function createEventEmitter() {
  const listeners = new Map();

  return {
    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(callback);

      // Return unsubscribe function
      return () => {
        listeners.get(event).delete(callback);
      };
    },

    once(event, callback) {
      const unsubscribe = this.on(event, (...args) => {
        unsubscribe();
        callback(...args);
      });
      return unsubscribe;
    },

    emit(event, ...args) {
      const eventListeners = listeners.get(event);
      if (!eventListeners) return;
      for (const callback of eventListeners) {
        callback(...args);
      }
    },

    off(event, callback) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
      }
    }
  };
}

const emitter = createEventEmitter();
const unsub = emitter.on("data", (payload) => {
  // Handle data
});
emitter.emit("data", { id: 1, name: "test" });
unsub();   // Clean up
```

### Deep Equality Check

```javascript
function deepEqual(a, b) {
  // Same reference or both primitives with same value
  if (a === b) return true;

  // If either is null/undefined or not an object
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // Handle Date
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Handle Arrays
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
  );
}
```

### Async Retry with Exponential Backoff

```javascript
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = () => true
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );
      // Add jitter to prevent thundering herd
      const jitter = delay * 0.1 * Math.random();

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError;
}

// Usage
const data = await retry(
  () => fetch("/api/data").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }),
  {
    maxAttempts: 3,
    baseDelay: 1000,
    shouldRetry: (error) => !error.message.includes("401")
  }
);
```

---

## Gotchas & Edge Cases

### 1. typeof Quirks

```javascript
typeof null          // "object"    (historical bug, never fixed)
typeof undefined     // "undefined"
typeof NaN           // "number"    (NaN is a numeric type)
typeof []            // "object"    (arrays are objects)
typeof function(){}  // "function"  (special case)

// Use these for reliable type checking:
Array.isArray([]);                        // true
Number.isNaN(NaN);                        // true
Object.prototype.toString.call(null);     // "[object Null]"
```

### 2. Floating Point Precision

```javascript
0.1 + 0.2 === 0.3           // false (0.30000000000000004)

// Fix: compare with epsilon
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON;   // true

// Or use integer arithmetic
(0.1 * 10 + 0.2 * 10) / 10 === 0.3;           // true
```

### 3. Implicit Coercion Surprises

```javascript
[] + []              // ""       (both coerce to empty string)
[] + {}              // "[object Object]"
{} + []              // 0        ({} is parsed as empty block, +[] = 0)
true + true          // 2
"5" - 3              // 2        (- only works with numbers)
"5" + 3              // "53"     (+ prefers string concatenation)
```

### 4. Arguments Object vs. Rest Parameters

```javascript
function classic() {
  // arguments is array-like, NOT an array
  arguments.forEach;    // undefined
  const arr = Array.from(arguments);  // convert to real array
}

// Prefer rest parameters
function modern(...args) {
  // args is a real array
  args.forEach((arg) => { /* works */ });
}

// Arrow functions do NOT have their own arguments
const arrow = () => {
  arguments;   // refers to enclosing function's arguments (or ReferenceError)
};
```

### 5. Object Property Order

```javascript
const obj = { 2: "b", 1: "a", c: "c", a: "a" };
Object.keys(obj);
// ["1", "2", "c", "a"]
// Integer-like keys are sorted numerically FIRST,
// then string keys in insertion order
```

### 6. Promise Error Handling Gaps

```javascript
// PROBLEM: Unhandled rejection
async function fetchData() {
  const data = await fetch("/api");  // If this throws, nothing catches it
  return data.json();
}
fetchData();  // No .catch(), no try/catch around the call

// PROBLEM: Swallowed errors in Promise.all
const results = await Promise.all([
  fetch("/api/a"),
  fetch("/api/b"),   // If this rejects, we lose the result of /api/a
]);

// FIX: Use Promise.allSettled when you need all results
const outcomes = await Promise.allSettled([
  fetch("/api/a"),
  fetch("/api/b"),
]);
const successes = outcomes
  .filter((o) => o.status === "fulfilled")
  .map((o) => o.value);
```

### 7. Symbols Are Not Enumerable by Default

```javascript
const sym = Symbol("id");
const obj = { [sym]: 123, name: "Alice" };

Object.keys(obj);              // ["name"]     (no symbol)
JSON.stringify(obj);           // '{"name":"Alice"}'  (no symbol)
Object.getOwnPropertySymbols(obj);  // [Symbol(id)]
Reflect.ownKeys(obj);         // ["name", Symbol(id)]  (everything)
```

---

## Quick Reference

### Equality Comparison Table

| Expression | `==` | `===` | `Object.is()` |
|-----------|------|-------|---------------|
| `NaN` vs `NaN` | false | false | **true** |
| `+0` vs `-0` | true | true | **false** |
| `null` vs `undefined` | true | false | false |
| `""` vs `false` | true | false | false |
| `""` vs `0` | true | false | false |
| `"0"` vs `false` | true | false | false |

### Array Method Cheat Sheet

| Method | Returns | Mutates? | Purpose |
|--------|---------|----------|---------|
| `map()` | New array | No | Transform each element |
| `filter()` | New array | No | Select elements by condition |
| `reduce()` | Single value | No | Accumulate to one value |
| `forEach()` | undefined | No | Side effects only |
| `find()` | Element or undefined | No | First match |
| `findIndex()` | Index or -1 | No | Index of first match |
| `some()` | boolean | No | At least one matches |
| `every()` | boolean | No | All match |
| `flat()` | New array | No | Flatten nested arrays |
| `flatMap()` | New array | No | Map then flatten (1 level) |
| `sort()` | Same array | **Yes** | Sort in place |
| `splice()` | Removed items | **Yes** | Add/remove elements |
| `push()/pop()` | Length/element | **Yes** | Add/remove from end |
| `shift()/unshift()` | Element/length | **Yes** | Add/remove from start |
| `toSorted()` | New array | No | Sort without mutation (ES2023) |
| `toSpliced()` | New array | No | Splice without mutation (ES2023) |
| `with()` | New array | No | Replace at index without mutation (ES2023) |

### `this` Binding Rules (Precedence Order)

| Rule | Example | `this` Value |
|------|---------|-------------|
| 1. `new` | `new Foo()` | New object |
| 2. Explicit | `fn.call(obj)` | `obj` |
| 3. Implicit | `obj.fn()` | `obj` |
| 4. Default | `fn()` | `globalThis` (or `undefined` in strict) |
| 5. Arrow | `() => {}` | Enclosing scope's `this` |

### Promise Combinator Reference

| Combinator | Resolves When | Rejects When | Use Case |
|-----------|---------------|-------------|----------|
| `Promise.all` | All fulfill | Any rejects | All-or-nothing |
| `Promise.allSettled` | All settle | Never | Get all outcomes |
| `Promise.race` | First settles | First settles | Timeout pattern |
| `Promise.any` | First fulfills | All reject | First success |

### ES6+ Feature Reference

| Feature | Version | Example |
|---------|---------|---------|
| Arrow functions | ES6 | `(x) => x * 2` |
| Template literals | ES6 | `` `Hello ${name}` `` |
| Destructuring | ES6 | `const { a, b } = obj` |
| Spread/Rest | ES6 | `[...arr]`, `(...args)` |
| Promises | ES6 | `new Promise((resolve) => {})` |
| Classes | ES6 | `class Foo extends Bar {}` |
| Modules | ES6 | `import / export` |
| `let`/`const` | ES6 | Block-scoped variables |
| Symbols | ES6 | `Symbol("id")` |
| async/await | ES2017 | `async function() { await p }` |
| Optional chaining | ES2020 | `obj?.prop?.method?.()` |
| Nullish coalescing | ES2020 | `value ?? fallback` |
| Logical assignment | ES2021 | `a ??= b`, `a ||= b` |
| Top-level await | ES2022 | `await import("./mod.js")` |
| `structuredClone` | ES2022 | `structuredClone(obj)` |
| Array grouping | ES2024 | `Object.groupBy(arr, fn)` |
| `toSorted/toSpliced/with` | ES2023 | Immutable array methods |
