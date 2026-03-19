# 06 - Physics & Collision Detection

## Table of Contents

1. [Why Physics Matters in Playable Ads](#why-physics-matters-in-playable-ads)
2. [Collision Detection Algorithms](#collision-detection-algorithms)
3. [Broad Phase: Spatial Partitioning](#broad-phase-spatial-partitioning)
4. [Narrow Phase: Detailed Collision Response](#narrow-phase-detailed-collision-response)
5. [Physics Simulation](#physics-simulation)
6. [Constraints and Joints](#constraints-and-joints)
7. [Physics Engines](#physics-engines)
8. [Trigger Zones vs Physical Colliders](#trigger-zones-vs-physical-colliders)
9. [Common Game Physics Patterns](#common-game-physics-patterns)
10. [Performance Optimization](#performance-optimization)
11. [Interview Questions](#interview-questions)

---

## Why Physics Matters in Playable Ads

Physics in playable ads serves a different purpose than in full games. The goal is not
simulation accuracy but **satisfying interactions** that make the player feel something
in under 30 seconds.

### The "Juice" Factor

"Juice" refers to the exaggerated, satisfying feedback that makes interactions feel great:

- **Bouncy collisions**: Objects bouncing off walls with slight exaggeration
- **Screen shake**: Camera shake on impact
- **Particle bursts**: Explosions of particles on collision
- **Squash and stretch**: Objects deforming on impact
- **Momentum transfer**: Objects pushing each other convincingly

### Physics Budget in Playable Ads

In a playable ad you typically have:

- 10-100 active physics objects (not thousands)
- Simple shapes (circles, rectangles, not complex polygons)
- 2D only (3D physics is rare in playable ads)
- 15-30 fps minimum requirement on low-end devices
- Custom lightweight physics preferred over heavy engines

---

## Collision Detection Algorithms

### Point-in-AABB

The simplest test: is a point inside an axis-aligned bounding box?

```typescript
interface AABB {
  x: number; // left edge
  y: number; // top edge
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function pointInAABB(point: Point, box: AABB): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}
```

**Use case**: Hit testing for tap/click on rectangular UI elements or game objects.

### AABB vs AABB

Two axis-aligned rectangles overlap if and only if they overlap on both axes:

```typescript
function aabbVsAabb(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
```

With **overlap vector** (minimum translation vector for separation):

```typescript
interface CollisionResult {
  colliding: boolean;
  overlapX: number;
  overlapY: number;
  normalX: number;
  normalY: number;
}

function aabbVsAabbDetailed(a: AABB, b: AABB): CollisionResult {
  const halfWidthA = a.width / 2;
  const halfWidthB = b.width / 2;
  const halfHeightA = a.height / 2;
  const halfHeightB = b.height / 2;

  const centerAX = a.x + halfWidthA;
  const centerAY = a.y + halfHeightA;
  const centerBX = b.x + halfWidthB;
  const centerBY = b.y + halfHeightB;

  const dx = centerBX - centerAX;
  const dy = centerBY - centerAY;

  const overlapX = halfWidthA + halfWidthB - Math.abs(dx);
  const overlapY = halfHeightA + halfHeightB - Math.abs(dy);

  if (overlapX <= 0 || overlapY <= 0) {
    return {
      colliding: false,
      overlapX: 0,
      overlapY: 0,
      normalX: 0,
      normalY: 0,
    };
  }

  // Resolve along the axis of least penetration
  if (overlapX < overlapY) {
    const normalX = dx < 0 ? -1 : 1;
    return { colliding: true, overlapX, overlapY: 0, normalX, normalY: 0 };
  } else {
    const normalY = dy < 0 ? -1 : 1;
    return { colliding: true, overlapX: 0, overlapY, normalX: 0, normalY };
  }
}
```

### Circle vs Circle

Two circles collide when the distance between centers is less than the sum of radii:

```typescript
interface Circle {
  x: number;
  y: number;
  radius: number;
}

function circleVsCircle(a: Circle, b: Circle): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;
  return distSq <= radiusSum * radiusSum;
}
```

**Key optimization**: Compare squared distances to avoid the expensive `Math.sqrt` call.

With collision response data:

```typescript
interface CircleCollision {
  colliding: boolean;
  depth: number;
  normalX: number;
  normalY: number;
  contactX: number;
  contactY: number;
}

function circleVsCircleDetailed(a: Circle, b: Circle): CircleCollision {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;

  if (distSq > radiusSum * radiusSum) {
    return {
      colliding: false,
      depth: 0,
      normalX: 0,
      normalY: 0,
      contactX: 0,
      contactY: 0,
    };
  }

  const dist = Math.sqrt(distSq);
  const depth = radiusSum - dist;

  // Handle overlapping centers
  const nx = dist === 0 ? 1 : dx / dist;
  const ny = dist === 0 ? 0 : dy / dist;

  return {
    colliding: true,
    depth,
    normalX: nx,
    normalY: ny,
    contactX: a.x + nx * a.radius,
    contactY: a.y + ny * a.radius,
  };
}
```

### Circle vs AABB

Find the closest point on the AABB to the circle center, then check distance:

```typescript
function circleVsAABB(circle: Circle, box: AABB): boolean {
  // Find closest point on AABB to circle center
  const closestX = Math.max(box.x, Math.min(circle.x, box.x + box.width));
  const closestY = Math.max(box.y, Math.min(circle.y, box.y + box.height));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;

  return dx * dx + dy * dy <= circle.radius * circle.radius;
}
```

### Separating Axis Theorem (SAT)

SAT works for any convex polygons. Two convex shapes do NOT overlap if and only if
there exists a separating axis between them.

For polygons, the candidate separating axes are the normals of each edge.

```typescript
interface Vector2 {
  x: number;
  y: number;
}

interface Polygon {
  vertices: Vector2[];
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function perpendicular(v: Vector2): Vector2 {
  return { x: -v.y, y: v.x };
}

function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  return { x: v.x / len, y: v.y / len };
}

// Project polygon onto axis and return min/max
function projectPolygon(
  polygon: Polygon,
  axis: Vector2
): { min: number; max: number } {
  let min = dot(polygon.vertices[0], axis);
  let max = min;

  for (let i = 1; i < polygon.vertices.length; i++) {
    const proj = dot(polygon.vertices[i], axis);
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }

  return { min, max };
}

function getAxes(polygon: Polygon): Vector2[] {
  const axes: Vector2[] = [];
  const verts = polygon.vertices;

  for (let i = 0; i < verts.length; i++) {
    const next = (i + 1) % verts.length;
    const edge = subtract(verts[next], verts[i]);
    axes.push(normalize(perpendicular(edge)));
  }

  return axes;
}

function satCollision(a: Polygon, b: Polygon): boolean {
  const axesA = getAxes(a);
  const axesB = getAxes(b);
  const allAxes = [...axesA, ...axesB];

  for (const axis of allAxes) {
    const projA = projectPolygon(a, axis);
    const projB = projectPolygon(b, axis);

    // Check for gap
    if (projA.max < projB.min || projB.max < projA.min) {
      return false; // Separating axis found - no collision
    }
  }

  return true; // No separating axis found - collision!
}
```

**When to use SAT**: Rotated rectangles, triangles, convex shapes. Avoid for circles
(use dedicated circle tests) or concave shapes (decompose into convex parts first).

### Line / Ray Casting

Essential for projectiles, line-of-sight, and laser effects:

```typescript
interface Ray {
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
}

interface RaycastHit {
  hit: boolean;
  t: number; // Parameter along ray (0 = origin, 1 = origin + dir)
  pointX: number;
  pointY: number;
  normalX: number;
  normalY: number;
}

// Ray vs AABB using slab method
function rayVsAABB(ray: Ray, box: AABB): RaycastHit {
  const invDirX = 1 / ray.dirX;
  const invDirY = 1 / ray.dirY;

  const t1 = (box.x - ray.originX) * invDirX;
  const t2 = (box.x + box.width - ray.originX) * invDirX;
  const t3 = (box.y - ray.originY) * invDirY;
  const t4 = (box.y + box.height - ray.originY) * invDirY;

  const tMin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tMax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

  if (tMax < 0 || tMin > tMax) {
    return { hit: false, t: 0, pointX: 0, pointY: 0, normalX: 0, normalY: 0 };
  }

  const t = tMin >= 0 ? tMin : tMax;

  // Determine hit normal
  let normalX = 0;
  let normalY = 0;
  if (t === t1) normalX = -1;
  else if (t === t2) normalX = 1;
  else if (t === t3) normalY = -1;
  else if (t === t4) normalY = 1;

  return {
    hit: true,
    t,
    pointX: ray.originX + ray.dirX * t,
    pointY: ray.originY + ray.dirY * t,
    normalX,
    normalY,
  };
}

// Ray vs Circle
function rayVsCircle(ray: Ray, circle: Circle): RaycastHit {
  const ocX = ray.originX - circle.x;
  const ocY = ray.originY - circle.y;

  const a = ray.dirX * ray.dirX + ray.dirY * ray.dirY;
  const b = 2 * (ocX * ray.dirX + ocY * ray.dirY);
  const c = ocX * ocX + ocY * ocY - circle.radius * circle.radius;

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return { hit: false, t: 0, pointX: 0, pointY: 0, normalX: 0, normalY: 0 };
  }

  const t = (-b - Math.sqrt(discriminant)) / (2 * a);

  if (t < 0) {
    return { hit: false, t: 0, pointX: 0, pointY: 0, normalX: 0, normalY: 0 };
  }

  const hitX = ray.originX + ray.dirX * t;
  const hitY = ray.originY + ray.dirY * t;
  const nx = (hitX - circle.x) / circle.radius;
  const ny = (hitY - circle.y) / circle.radius;

  return { hit: true, t, pointX: hitX, pointY: hitY, normalX: nx, normalY: ny };
}
```

---

## Broad Phase: Spatial Partitioning

Broad phase reduces the number of collision pairs to test. Without it, checking
N objects against each other is O(N^2). Spatial partitioning structures reduce
this dramatically.

### Uniform Grid

Divide the world into equal-sized cells. Each cell contains a list of objects.
Only test objects in the same cell (or neighboring cells).

```typescript
class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<number>>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  private getKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private getCellCoords(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  clear(): void {
    this.cells.clear();
  }

  insert(
    id: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const minCell = this.getCellCoords(x, y);
    const maxCell = this.getCellCoords(x + width, y + height);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = this.getKey(cx, cy);
        if (!this.cells.has(key)) {
          this.cells.set(key, new Set());
        }
        this.cells.get(key)!.add(id);
      }
    }
  }

  // Get potential collision pairs (no duplicates)
  getPotentialPairs(): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];
    const checked = new Set<string>();

    for (const [, ids] of this.cells) {
      const arr = Array.from(ids);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const pairKey =
            arr[i] < arr[j] ? `${arr[i]},${arr[j]}` : `${arr[j]},${arr[i]}`;
          if (!checked.has(pairKey)) {
            checked.add(pairKey);
            pairs.push([arr[i], arr[j]]);
          }
        }
      }
    }

    return pairs;
  }

  // Query: find all objects near a point/area
  query(x: number, y: number, width: number, height: number): Set<number> {
    const result = new Set<number>();
    const minCell = this.getCellCoords(x, y);
    const maxCell = this.getCellCoords(x + width, y + height);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = this.getKey(cx, cy);
        const cell = this.cells.get(key);
        if (cell) {
          for (const id of cell) {
            result.add(id);
          }
        }
      }
    }

    return result;
  }
}
```

**When to use a uniform grid**:

- Objects are roughly the same size
- Objects are distributed somewhat uniformly
- Cell size should be ~2x the largest object size

### Quadtree

A quadtree recursively subdivides 2D space into four quadrants. Ideal when objects
cluster in certain areas.

```typescript
interface QuadRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QuadItem {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

class Quadtree {
  private bounds: QuadRect;
  private maxItems: number;
  private maxDepth: number;
  private depth: number;
  private items: QuadItem[];
  private children: Quadtree[] | null;

  constructor(bounds: QuadRect, maxItems = 8, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.items = [];
    this.children = null;
  }

  clear(): void {
    this.items = [];
    if (this.children) {
      for (const child of this.children) {
        child.clear();
      }
      this.children = null;
    }
  }

  private subdivide(): void {
    const { x, y, width, height } = this.bounds;
    const hw = width / 2;
    const hh = height / 2;

    this.children = [
      new Quadtree(
        { x: x + hw, y, width: hw, height: hh },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ), // NE
      new Quadtree(
        { x, y, width: hw, height: hh },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ), // NW
      new Quadtree(
        { x, y: y + hh, width: hw, height: hh },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ), // SW
      new Quadtree(
        { x: x + hw, y: y + hh, width: hw, height: hh },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ), // SE
    ];

    // Re-insert items into children
    const oldItems = this.items;
    this.items = [];
    for (const item of oldItems) {
      this.insertIntoChildren(item);
    }
  }

  private insertIntoChildren(item: QuadItem): void {
    if (!this.children) return;

    for (const child of this.children) {
      if (intersectsRect(item, child.bounds)) {
        child.insert(item);
      }
    }
  }

  insert(item: QuadItem): void {
    if (!intersectsRect(item, this.bounds)) return;

    if (this.children) {
      this.insertIntoChildren(item);
      return;
    }

    this.items.push(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.subdivide();
    }
  }

  query(range: QuadRect): QuadItem[] {
    const result: QuadItem[] = [];

    if (!intersectsRect(range, this.bounds)) {
      return result;
    }

    for (const item of this.items) {
      if (intersectsRect(item, range)) {
        result.push(item);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        result.push(...child.query(range));
      }
    }

    return result;
  }
}

function intersectsRect(a: QuadRect, b: QuadRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
```

**When to use a quadtree**:

- Objects vary in size
- Objects cluster in certain regions
- You need efficient range queries
- Dynamic objects that move each frame (rebuild tree each frame)

### Spatial Hashing

Similar to a grid but uses a hash function. Objects are hashed into buckets.
More memory-efficient than a grid when the world is large but sparsely populated.

```typescript
class SpatialHash {
  private cellSize: number;
  private buckets: Map<number, Set<number>>;
  private tableSize: number;

  constructor(cellSize: number, tableSize = 1024) {
    this.cellSize = cellSize;
    this.buckets = new Map();
    this.tableSize = tableSize;
  }

  private hash(cx: number, cy: number): number {
    // Large primes for good distribution
    return ((cx * 73856093) ^ (cy * 19349663)) % this.tableSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(
    id: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const minCX = Math.floor(x / this.cellSize);
    const minCY = Math.floor(y / this.cellSize);
    const maxCX = Math.floor((x + width) / this.cellSize);
    const maxCY = Math.floor((y + height) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const h = this.hash(cx, cy);
        if (!this.buckets.has(h)) {
          this.buckets.set(h, new Set());
        }
        this.buckets.get(h)!.add(id);
      }
    }
  }

  query(x: number, y: number, width: number, height: number): Set<number> {
    const result = new Set<number>();
    const minCX = Math.floor(x / this.cellSize);
    const minCY = Math.floor(y / this.cellSize);
    const maxCX = Math.floor((x + width) / this.cellSize);
    const maxCY = Math.floor((y + height) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const h = this.hash(cx, cy);
        const bucket = this.buckets.get(h);
        if (bucket) {
          for (const id of bucket) {
            result.add(id);
          }
        }
      }
    }

    return result;
  }
}
```

**Comparison of broad-phase structures**:

```
Structure       | Best For                    | Rebuild Cost | Query Cost
----------------|-----------------------------|--------------|-----------
Uniform Grid    | Same-size objects, uniform  | O(N)         | O(1) per cell
Quadtree        | Varied sizes, clustered     | O(N log N)   | O(log N)
Spatial Hash    | Large sparse worlds         | O(N)         | O(1) amortized
```

---

## Narrow Phase: Detailed Collision Response

After broad phase identifies potential pairs, narrow phase determines exact
collision details and resolves them.

### Contact Point Calculation

For AABB vs AABB, the contact point is along the axis of minimum penetration:

```typescript
function resolveAABBCollision(
  a: {
    x: number;
    y: number;
    width: number;
    height: number;
    vx: number;
    vy: number;
    mass: number;
  },
  b: {
    x: number;
    y: number;
    width: number;
    height: number;
    vx: number;
    vy: number;
    mass: number;
  },
  restitution = 0.5
): void {
  const collision = aabbVsAabbDetailed(a, b);

  if (!collision.colliding) return;

  // Separate objects based on mass ratio
  const totalMass = a.mass + b.mass;
  const ratioA = b.mass / totalMass;
  const ratioB = a.mass / totalMass;

  if (collision.normalX !== 0) {
    a.x -= collision.overlapX * ratioA * collision.normalX;
    b.x += collision.overlapX * ratioB * collision.normalX;

    // Elastic collision along collision normal
    const relVel = a.vx - b.vx;
    const impulse = (-(1 + restitution) * relVel) / totalMass;
    a.vx += impulse * b.mass * collision.normalX;
    b.vx -= impulse * a.mass * collision.normalX;
  }

  if (collision.normalY !== 0) {
    a.y -= collision.overlapY * ratioA * collision.normalY;
    b.y += collision.overlapY * ratioB * collision.normalY;

    const relVel = a.vy - b.vy;
    const impulse = (-(1 + restitution) * relVel) / totalMass;
    a.vy += impulse * b.mass * collision.normalY;
    b.vy -= impulse * a.mass * collision.normalY;
  }
}
```

### Penetration Depth and Resolution

When objects overlap, we need to push them apart. The minimum translation vector (MTV)
is the smallest displacement that separates them:

```typescript
function resolvePenetration(
  posA: Vector2,
  posB: Vector2,
  normal: Vector2,
  depth: number,
  massA: number,
  massB: number
): { newPosA: Vector2; newPosB: Vector2 } {
  const totalMass = massA + massB;
  const ratioA = massB / totalMass;
  const ratioB = massA / totalMass;

  return {
    newPosA: {
      x: posA.x - normal.x * depth * ratioA,
      y: posA.y - normal.y * depth * ratioA,
    },
    newPosB: {
      x: posB.x + normal.x * depth * ratioB,
      y: posB.y + normal.y * depth * ratioB,
    },
  };
}
```

### Collision Response with Impulse

Full impulse-based collision response for circles:

```typescript
function resolveCircleCollision(
  a: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
  },
  b: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
  },
  restitution = 0.8
): { a: typeof a; b: typeof b } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0 || dist > a.radius + b.radius) {
    return { a, b };
  }

  // Collision normal
  const nx = dx / dist;
  const ny = dy / dist;

  // Relative velocity along normal
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const relVelNormal = dvx * nx + dvy * ny;

  // Don't resolve if objects are separating
  if (relVelNormal < 0) {
    return { a, b };
  }

  // Impulse scalar
  const j = (-(1 + restitution) * relVelNormal) / (1 / a.mass + 1 / b.mass);

  // Separate objects
  const overlap = a.radius + b.radius - dist;
  const totalMass = a.mass + b.mass;

  return {
    a: {
      ...a,
      x: a.x - nx * overlap * (b.mass / totalMass),
      y: a.y - ny * overlap * (b.mass / totalMass),
      vx: a.vx + (j / a.mass) * nx,
      vy: a.vy + (j / a.mass) * ny,
    },
    b: {
      ...b,
      x: b.x + nx * overlap * (a.mass / totalMass),
      y: b.y + ny * overlap * (a.mass / totalMass),
      vx: b.vx - (j / b.mass) * nx,
      vy: b.vy - (j / b.mass) * ny,
    },
  };
}
```

---

## Physics Simulation

### Euler Integration

The simplest integration method. Two variants:

**Explicit (Forward) Euler** - simple but unstable at large time steps:

```typescript
function explicitEuler(
  body: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ax: number;
    ay: number;
  },
  dt: number
): { x: number; y: number; vx: number; vy: number; ax: number; ay: number } {
  // Position updated with OLD velocity
  return {
    ...body,
    x: body.x + body.vx * dt,
    y: body.y + body.vy * dt,
    vx: body.vx + body.ax * dt,
    vy: body.vy + body.ay * dt,
  };
}
```

**Semi-Implicit (Symplectic) Euler** - much more stable, recommended:

```typescript
function semiImplicitEuler(
  body: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ax: number;
    ay: number;
  },
  dt: number
): { x: number; y: number; vx: number; vy: number; ax: number; ay: number } {
  // Velocity updated FIRST, then position uses NEW velocity
  const newVx = body.vx + body.ax * dt;
  const newVy = body.vy + body.ay * dt;
  return {
    ...body,
    vx: newVx,
    vy: newVy,
    x: body.x + newVx * dt,
    y: body.y + newVy * dt,
  };
}
```

### Verlet Integration

Position-based, excellent for constraints (ropes, cloth, ragdolls).
Velocity is implicit (derived from position change).

```typescript
interface VerletBody {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  ax: number;
  ay: number;
}

function verletIntegrate(body: VerletBody, dt: number): VerletBody {
  const newX = 2 * body.x - body.prevX + body.ax * dt * dt;
  const newY = 2 * body.y - body.prevY + body.ay * dt * dt;

  return {
    ...body,
    prevX: body.x,
    prevY: body.y,
    x: newX,
    y: newY,
  };
}

// Derive velocity from Verlet positions
function getVerletVelocity(body: VerletBody, dt: number): Vector2 {
  return {
    x: (body.x - body.prevX) / dt,
    y: (body.y - body.prevY) / dt,
  };
}
```

### Forces

Applying common forces to physics bodies:

```typescript
interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  forceX: number;
  forceY: number;
}

// Accumulate forces, then integrate
function applyGravity(body: PhysicsBody, g = 980): PhysicsBody {
  return { ...body, forceY: body.forceY + body.mass * g };
}

function applyDrag(body: PhysicsBody, dragCoeff = 0.01): PhysicsBody {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
  if (speed === 0) return body;

  const dragX = -dragCoeff * speed * body.vx;
  const dragY = -dragCoeff * speed * body.vy;

  return {
    ...body,
    forceX: body.forceX + dragX,
    forceY: body.forceY + dragY,
  };
}

function applyFriction(
  body: PhysicsBody,
  frictionCoeff = 0.3,
  normalForce = 980
): PhysicsBody {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
  if (speed === 0) return body;

  const frictionMag = frictionCoeff * normalForce;
  const fx = -(body.vx / speed) * frictionMag;
  const fy = -(body.vy / speed) * frictionMag;

  return {
    ...body,
    forceX: body.forceX + fx,
    forceY: body.forceY + fy,
  };
}

function integrateBody(body: PhysicsBody, dt: number): PhysicsBody {
  const ax = body.forceX / body.mass;
  const ay = body.forceY / body.mass;

  // Semi-implicit Euler
  const newVx = body.vx + ax * dt;
  const newVy = body.vy + ay * dt;

  return {
    ...body,
    vx: newVx,
    vy: newVy,
    x: body.x + newVx * dt,
    y: body.y + newVy * dt,
    forceX: 0, // Reset forces for next frame
    forceY: 0,
  };
}
```

### Angular Velocity and Torque

For rotating objects:

```typescript
interface RotatingBody extends PhysicsBody {
  angle: number; // Rotation in radians
  angularVelocity: number;
  torque: number;
  inertia: number; // Moment of inertia
}

function integrateRotation(body: RotatingBody, dt: number): RotatingBody {
  const angularAccel = body.torque / body.inertia;
  const newAngVel = body.angularVelocity + angularAccel * dt;

  return {
    ...body,
    angularVelocity: newAngVel,
    angle: body.angle + newAngVel * dt,
    torque: 0,
  };
}

// Moment of inertia for common shapes
function circleInertia(mass: number, radius: number): number {
  return 0.5 * mass * radius * radius;
}

function rectangleInertia(mass: number, width: number, height: number): number {
  return (mass * (width * width + height * height)) / 12;
}
```

---

## Constraints and Joints

Constraints restrict the movement of bodies. Used for ropes, chains, ragdolls.

### Distance Constraint

Keep two points at a fixed distance (like a rigid rod or rope segment):

```typescript
interface Constraint {
  bodyA: VerletBody;
  bodyB: VerletBody;
  restLength: number;
  stiffness: number; // 0 to 1, where 1 = rigid
}

function solveDistanceConstraint(constraint: Constraint): {
  bodyA: VerletBody;
  bodyB: VerletBody;
} {
  const dx = constraint.bodyB.x - constraint.bodyA.x;
  const dy = constraint.bodyB.y - constraint.bodyA.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return { bodyA: constraint.bodyA, bodyB: constraint.bodyB };

  const diff = (dist - constraint.restLength) / dist;
  const offsetX = dx * diff * 0.5 * constraint.stiffness;
  const offsetY = dy * diff * 0.5 * constraint.stiffness;

  return {
    bodyA: {
      ...constraint.bodyA,
      x: constraint.bodyA.x + offsetX,
      y: constraint.bodyA.y + offsetY,
    },
    bodyB: {
      ...constraint.bodyB,
      x: constraint.bodyB.x - offsetX,
      y: constraint.bodyB.y - offsetY,
    },
  };
}
```

### Rope / Chain Simulation

A rope is a series of Verlet particles connected by distance constraints:

```typescript
interface Rope {
  particles: VerletBody[];
  constraints: Constraint[];
  pinned: Set<number>; // Indices of pinned (fixed) particles
}

function createRope(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  segments: number
): Rope {
  const particles: VerletBody[] = [];
  const constraints: Constraint[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    particles.push({ x, y, prevX: x, prevY: y, ax: 0, ay: 980 });
  }

  const segmentLength =
    Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2) / segments;

  for (let i = 0; i < segments; i++) {
    constraints.push({
      bodyA: particles[i],
      bodyB: particles[i + 1],
      restLength: segmentLength,
      stiffness: 1,
    });
  }

  return { particles, constraints, pinned: new Set([0]) };
}

function updateRope(rope: Rope, dt: number, iterations = 5): Rope {
  // Integrate particles
  const newParticles = rope.particles.map((p, i) => {
    if (rope.pinned.has(i)) return p;
    return verletIntegrate(p, dt);
  });

  // Solve constraints multiple times for stability
  for (let iter = 0; iter < iterations; iter++) {
    for (const constraint of rope.constraints) {
      const resolved = solveDistanceConstraint(constraint);
      // Apply resolved positions back (skipping pinned)
      // In practice, update the particle positions in the array
    }
  }

  return { ...rope, particles: newParticles };
}
```

---

## Physics Engines

### Matter.js

The most popular 2D physics engine for JavaScript. Good for playable ads
due to its ease of use, though file size (~100KB minified) may be a concern.

```typescript
import Matter from 'matter-js';

// Create engine and world
const engine = Matter.Engine.create();
const world = engine.world;

// Adjust gravity
engine.world.gravity.y = 1;

// Create bodies
const ground = Matter.Bodies.rectangle(400, 580, 800, 40, { isStatic: true });
const ball = Matter.Bodies.circle(400, 200, 30, {
  restitution: 0.8, // Bounciness
  friction: 0.1,
  density: 0.001,
});
const box = Matter.Bodies.rectangle(450, 50, 60, 60, {
  chamfer: { radius: 5 }, // Rounded corners
});

Matter.Composite.add(world, [ground, ball, box]);

// Collision events
Matter.Events.on(engine, 'collisionStart', (event) => {
  for (const pair of event.pairs) {
    // pair.bodyA, pair.bodyB, pair.collision.normal, pair.collision.depth
  }
});

// Apply forces
Matter.Body.applyForce(ball, ball.position, { x: 0.05, y: -0.1 });

// Constraints (spring between two bodies)
const spring = Matter.Constraint.create({
  bodyA: ball,
  bodyB: box,
  stiffness: 0.01,
  damping: 0.1,
});
Matter.Composite.add(world, spring);

// Update loop
function update() {
  Matter.Engine.update(engine, 1000 / 60);
  requestAnimationFrame(update);
}
update();
```

### Planck.js

Lightweight Box2D port for JavaScript (~45KB minified). Good balance of
features and size for playable ads.

```typescript
import { World, Vec2, Box, Circle, Edge, RevoluteJoint } from 'planck';

const world = new World({ gravity: Vec2(0, -10) });

// Ground
const ground = world.createBody();
ground.createFixture(Edge(Vec2(-20, 0), Vec2(20, 0)));

// Dynamic body
const ball = world.createDynamicBody({ position: Vec2(0, 10) });
ball.createFixture(Circle(0.5), {
  density: 1.0,
  friction: 0.3,
  restitution: 0.6,
});

// Apply impulse
ball.applyLinearImpulse(Vec2(2, 5), ball.getWorldCenter());

// Revolute joint (hinge)
const bodyA = world.createDynamicBody({ position: Vec2(-2, 5) });
bodyA.createFixture(Box(0.5, 2), { density: 1.0 });

const joint = world.createJoint(
  RevoluteJoint({
    bodyA: ground,
    bodyB: bodyA,
    localAnchorA: Vec2(-2, 7),
    localAnchorB: Vec2(0, 2),
    enableMotor: true,
    motorSpeed: 2.0,
    maxMotorTorque: 100,
  })
);

// Step simulation
const timeStep = 1 / 60;
const velocityIterations = 8;
const positionIterations = 3;

function step() {
  world.step(timeStep, velocityIterations, positionIterations);

  // Iterate over bodies
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    const pos = body.getPosition();
    const angle = body.getAngle();
    // Render at pos.x, pos.y, angle
  }
}
```

### p2.js

Very lightweight (~30KB minified), good for simple physics in playable ads:

```typescript
import p2 from 'p2';

const world = new p2.World({ gravity: [0, -9.82] });

const circleBody = new p2.Body({
  mass: 1,
  position: [0, 5],
});
circleBody.addShape(new p2.Circle({ radius: 0.5 }));
world.addBody(circleBody);

const groundBody = new p2.Body({ mass: 0, position: [0, 0] });
groundBody.addShape(new p2.Plane());
world.addBody(groundBody);

// Collision events
world.on('beginContact', (event: { bodyA: p2.Body; bodyB: p2.Body }) => {
  // Handle collision start
});

// Step
world.step(1 / 60);
```

---

## Trigger Zones vs Physical Colliders

A critical distinction in game physics:

```
Physical Collider:
- Solid - objects bounce off
- Has collision response (forces, impulses)
- Example: walls, ground, balls

Trigger Zone:
- Non-solid - objects pass through
- Only fires events (enter/exit/stay)
- Example: coin pickup area, checkpoint, damage zone
```

Implementation:

```typescript
interface ColliderComponent {
  type: 'physical' | 'trigger';
  shape: AABB | Circle;
  layer: number; // Collision layer bitmask
  mask: number; // Which layers to collide with
  onEnter?: (other: number) => void;
  onExit?: (other: number) => void;
}

function shouldCollide(a: ColliderComponent, b: ColliderComponent): boolean {
  return (a.layer & b.mask) !== 0 && (b.layer & a.mask) !== 0;
}

// Example collision layers
const LAYERS = {
  PLAYER: 1 << 0, // 0001
  ENEMY: 1 << 1, // 0010
  BULLET: 1 << 2, // 0100
  PICKUP: 1 << 3, // 1000
  WALL: 1 << 4, // 10000
} as const;

// Player collides with enemies, walls, pickups
const playerCollider: ColliderComponent = {
  type: 'physical',
  shape: { x: 0, y: 0, width: 32, height: 48 },
  layer: LAYERS.PLAYER,
  mask: LAYERS.ENEMY | LAYERS.WALL | LAYERS.PICKUP,
};

// Pickup is a trigger
const coinCollider: ColliderComponent = {
  type: 'trigger',
  shape: { x: 0, y: 0, radius: 16 } as Circle,
  layer: LAYERS.PICKUP,
  mask: LAYERS.PLAYER,
  onEnter: (playerId) => {
    collectCoin(playerId);
  },
};
```

---

## Common Game Physics Patterns

### Platformer Physics

```typescript
interface PlatformerPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  jumpBuffer: number;
  coyoteTime: number;
}

const PHYSICS = {
  GRAVITY: 980,
  MAX_FALL_SPEED: 600,
  JUMP_FORCE: -400,
  MOVE_SPEED: 200,
  ACCELERATION: 1500,
  DECELERATION: 2000,
  AIR_ACCELERATION: 800,
  JUMP_BUFFER_TIME: 0.1, // seconds
  COYOTE_TIME: 0.08, // seconds
} as const;

function updatePlatformer(
  player: PlatformerPlayer,
  input: { left: boolean; right: boolean; jump: boolean },
  dt: number
): PlatformerPlayer {
  let { vx, vy, x, y, grounded, jumpBuffer, coyoteTime } = player;

  // Horizontal movement with acceleration
  const accel = grounded ? PHYSICS.ACCELERATION : PHYSICS.AIR_ACCELERATION;
  const targetVx = input.left
    ? -PHYSICS.MOVE_SPEED
    : input.right
      ? PHYSICS.MOVE_SPEED
      : 0;

  if (Math.abs(targetVx) > 0) {
    vx += Math.sign(targetVx - vx) * accel * dt;
    vx = Math.sign(targetVx) * Math.min(Math.abs(vx), PHYSICS.MOVE_SPEED);
  } else {
    const decel = PHYSICS.DECELERATION * dt;
    vx = Math.abs(vx) < decel ? 0 : vx - Math.sign(vx) * decel;
  }

  // Coyote time (allow jump briefly after leaving platform)
  if (grounded) {
    coyoteTime = PHYSICS.COYOTE_TIME;
  } else {
    coyoteTime -= dt;
  }

  // Jump buffering
  if (input.jump) {
    jumpBuffer = PHYSICS.JUMP_BUFFER_TIME;
  } else {
    jumpBuffer -= dt;
  }

  // Jump
  if (jumpBuffer > 0 && coyoteTime > 0) {
    vy = PHYSICS.JUMP_FORCE;
    jumpBuffer = 0;
    coyoteTime = 0;
    grounded = false;
  }

  // Gravity
  vy += PHYSICS.GRAVITY * dt;
  vy = Math.min(vy, PHYSICS.MAX_FALL_SPEED);

  // Apply velocity
  x += vx * dt;
  y += vy * dt;

  return { ...player, x, y, vx, vy, grounded, jumpBuffer, coyoteTime };
}
```

### Ball Physics (Pool/Billiards)

```typescript
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  angularVelocity: number;
}

function updateBalls(
  balls: readonly Ball[],
  dt: number,
  friction = 0.98
): readonly Ball[] {
  // Apply friction
  let updated = balls.map((ball) => ({
    ...ball,
    vx: ball.vx * friction,
    vy: ball.vy * friction,
    x: ball.x + ball.vx * dt,
    y: ball.y + ball.vy * dt,
  }));

  // Check collisions between all pairs
  for (let i = 0; i < updated.length; i++) {
    for (let j = i + 1; j < updated.length; j++) {
      const resolved = resolveCircleCollision(updated[i], updated[j], 0.95);
      updated = updated.map((b, idx) =>
        idx === i ? resolved.a : idx === j ? resolved.b : b
      );
    }
  }

  // Stop very slow balls
  return updated.map((ball) => {
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed < 0.5) {
      return { ...ball, vx: 0, vy: 0 };
    }
    return ball;
  });
}
```

### Ragdoll

A ragdoll is a set of Verlet particles connected by distance constraints
representing body parts:

```
    Head (O)
      |
   Torso (|)
    / \
  L-Arm R-Arm
    / \
  L-Leg R-Leg
```

```typescript
function createSimpleRagdoll(x: number, y: number): Rope {
  const particles: VerletBody[] = [
    { x, y: y - 30, prevX: x, prevY: y - 30, ax: 0, ay: 980 }, // 0: head
    { x, y, prevX: x, prevY: y, ax: 0, ay: 980 }, // 1: torso top
    { x, y: y + 30, prevX: x, prevY: y + 30, ax: 0, ay: 980 }, // 2: torso bottom
    { x: x - 20, y: y + 5, prevX: x - 20, prevY: y + 5, ax: 0, ay: 980 }, // 3: left hand
    { x: x + 20, y: y + 5, prevX: x + 20, prevY: y + 5, ax: 0, ay: 980 }, // 4: right hand
    { x: x - 10, y: y + 60, prevX: x - 10, prevY: y + 60, ax: 0, ay: 980 }, // 5: left foot
    { x: x + 10, y: y + 60, prevX: x + 10, prevY: y + 60, ax: 0, ay: 980 }, // 6: right foot
  ];

  const constraints: Constraint[] = [
    { bodyA: particles[0], bodyB: particles[1], restLength: 30, stiffness: 1 }, // head-torso
    { bodyA: particles[1], bodyB: particles[2], restLength: 30, stiffness: 1 }, // torso
    {
      bodyA: particles[1],
      bodyB: particles[3],
      restLength: 25,
      stiffness: 0.8,
    }, // left arm
    {
      bodyA: particles[1],
      bodyB: particles[4],
      restLength: 25,
      stiffness: 0.8,
    }, // right arm
    {
      bodyA: particles[2],
      bodyB: particles[5],
      restLength: 35,
      stiffness: 0.9,
    }, // left leg
    {
      bodyA: particles[2],
      bodyB: particles[6],
      restLength: 35,
      stiffness: 0.9,
    }, // right leg
  ];

  return { particles, constraints, pinned: new Set() };
}
```

---

## Performance Optimization

### Sleeping Bodies

Bodies at rest should stop being simulated:

```typescript
interface SleepableBody extends PhysicsBody {
  sleeping: boolean;
  sleepTimer: number;
  sleepThreshold: number; // Minimum velocity to stay awake
  sleepTimeRequired: number; // Seconds of low velocity before sleeping
}

function updateSleep(body: SleepableBody, dt: number): SleepableBody {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);

  if (speed < body.sleepThreshold) {
    const newTimer = body.sleepTimer + dt;
    if (newTimer >= body.sleepTimeRequired) {
      return { ...body, sleeping: true, sleepTimer: newTimer, vx: 0, vy: 0 };
    }
    return { ...body, sleepTimer: newTimer };
  }

  return { ...body, sleeping: false, sleepTimer: 0 };
}

function wakeBody(body: SleepableBody): SleepableBody {
  return { ...body, sleeping: false, sleepTimer: 0 };
}
```

### Collision Layers and Masks

Use bitmasks to avoid unnecessary collision checks:

```typescript
// Only check collisions between layers that can interact
function broadPhaseFilter(
  bodyA: ColliderComponent,
  bodyB: ColliderComponent
): boolean {
  return (bodyA.layer & bodyB.mask) !== 0 && (bodyB.layer & bodyA.mask) !== 0;
}
```

### Simplified Shapes

Use simple collision shapes even for complex visual sprites:

```
Visual:  Complex character sprite (100+ vertices)
Physics: Simple capsule (rectangle + 2 circles) or just a rectangle

Visual:  Detailed car sprite
Physics: Single rectangle
```

### Fixed Time Step

Always use a fixed time step for physics to avoid instability:

```typescript
class PhysicsWorld {
  private accumulator = 0;
  private fixedDt = 1 / 60; // 60Hz physics

  update(dt: number): void {
    this.accumulator += dt;

    // Cap accumulated time to prevent spiral of death
    if (this.accumulator > 0.2) {
      this.accumulator = 0.2;
    }

    while (this.accumulator >= this.fixedDt) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Remaining fraction can be used for interpolation
    const alpha = this.accumulator / this.fixedDt;
    this.interpolate(alpha);
  }

  private step(dt: number): void {
    // Physics update at fixed interval
  }

  private interpolate(alpha: number): void {
    // Interpolate render positions between previous and current physics state
    // renderPos = prevPos * (1 - alpha) + currentPos * alpha
  }
}
```

---

## Interview Questions

### Q1: Explain the difference between broad phase and narrow phase collision detection.

**Answer**: Broad phase is a fast, approximate step that identifies which pairs of objects
_might_ be colliding. It uses spatial data structures (grids, quadtrees, spatial hashing)
to quickly eliminate pairs that are clearly too far apart. The result is a list of
"potential collision pairs."

Narrow phase then takes each potential pair and performs exact collision tests
(AABB vs AABB, circle vs circle, SAT, etc.) to determine if they actually collide
and compute collision details (contact point, normal, penetration depth).

This two-phase approach is essential because narrow phase tests are expensive,
and testing every object against every other object is O(N^2). Broad phase typically
reduces this to O(N log N) or better.

### Q2: Why use semi-implicit Euler instead of explicit Euler for game physics?

**Answer**: Explicit Euler updates position using the _old_ velocity, then updates
velocity. This can cause energy to increase over time (instability), especially at
larger time steps or with springs/constraints.

Semi-implicit Euler updates velocity first, then uses the _new_ velocity to update
position. This simple change makes the integration symplectic, meaning it approximately
conserves energy. For game physics, this means objects won't explode or gain energy
from nowhere.

The difference is one line of code but dramatically improves stability. For most games,
semi-implicit Euler provides a good balance of simplicity, performance, and accuracy.

### Q3: What is Verlet integration and when would you use it over Euler?

**Answer**: Verlet integration stores the current and previous position instead of
position and velocity. The new position is calculated as:

`newPos = 2 * currentPos - prevPos + acceleration * dt^2`

Velocity is implicit in the difference between current and previous positions.

**Advantages over Euler**:

- Naturally stable for constraints (ropes, cloth, ragdolls)
- Easy to implement distance constraints by directly adjusting positions
- Iterative constraint solving converges well
- No need to store/manage velocity separately

**When to use**:

- Rope/chain simulations
- Cloth/soft body
- Ragdoll physics
- Particle systems with constraints

**When Euler is better**:

- When you need precise velocity control (player character)
- When applying forces directly (platformer movement)
- Simple projectile motion

### Q4: How would you implement collision detection for a game with 100+ moving objects?

**Answer**: For 100+ objects:

1. **Broad phase with spatial hashing or grid**: Choose cell size ~2x the largest
   object. Each frame, clear the grid and re-insert all objects. This gives O(N)
   insertion and O(1) neighbor lookups.

2. **Collision layer filtering**: Use bitmasks so bullets don't check against other
   bullets, etc. This eliminates many pairs before any geometric tests.

3. **Narrow phase with appropriate tests**: Use the simplest shape that fits each object.
   Circles are cheapest (one distance check). AABBs are next. Only use SAT for
   rotated convex shapes.

4. **Sleeping**: Bodies that haven't moved significantly for several frames are put to
   sleep and excluded from collision checks entirely.

5. **Fixed time step**: Physics at 30-60Hz, rendering can be faster. Prevents
   tunneling and ensures deterministic behavior.

### Q5: What is the "tunneling" problem and how do you solve it?

**Answer**: Tunneling occurs when a fast-moving object passes completely through
a thin object in a single frame. If a bullet moves 100 pixels/frame and a wall
is 5 pixels thick, the bullet can teleport through it.

Solutions:

- **CCD (Continuous Collision Detection)**: Instead of testing positions, sweep the
  object along its trajectory and find the first collision point. More expensive but exact.
- **Increase collision shape sizes**: Make the bullet's collision shape extend along
  its velocity direction.
- **Limit maximum velocity**: Cap speed so objects can't move more than their own
  size per frame.
- **Smaller time steps**: More physics sub-steps per frame (e.g., 4 steps at 1/240s
  instead of 1 step at 1/60s).
- **Ray casting**: Cast a ray from the object's previous position to current position
  and check for intersections.

For playable ads, limiting velocity or using ray casting for projectiles is usually sufficient.

### Q6: Design a physics system for a "ball bounce" playable ad.

**Answer**: A "ball bounce" ad (common for idle games) needs:

1. **World setup**: Gravity pointing down, rectangular boundary walls (screen edges).

2. **Ball objects**: Circles with position, velocity, radius, restitution (0.7-0.9
   for bouncy feel). Maybe 5-20 balls.

3. **Collision**: Circle-vs-circle for ball-ball, circle-vs-AABB for ball-wall.
   With 20 balls, no broad phase needed (20\*19/2 = 190 pairs is fine).

4. **Bounce response**: On collision with walls, reflect velocity and multiply by
   restitution. On ball-ball collision, use impulse-based elastic collision.

5. **User interaction**: Tap to spawn balls, swipe to launch, or tilt for gravity
   (device orientation API).

6. **Juice**: Screen shake on hard impacts, squash/stretch animation, particle
   trails, satisfying bounce sounds.

7. **Performance**: Semi-implicit Euler integration, fixed time step at 60Hz.
   No physics engine needed; custom implementation is ~200 lines.

### Q7: Compare Matter.js, Planck.js, and p2.js for playable ad development.

**Answer**:

| Feature     | Matter.js | Planck.js  | p2.js      |
| ----------- | --------- | ---------- | ---------- |
| Size        | ~100KB    | ~45KB      | ~30KB      |
| API         | Easy      | Box2D-like | Simple     |
| Features    | Rich      | Full       | Basic      |
| Performance | Good      | Very Good  | Good       |
| Docs        | Excellent | Good       | Fair       |
| Active      | Yes       | Yes        | Maintained |

**Recommendation for playable ads**:

- **Under 2MB budget (TikTok)**: Custom physics or p2.js. Every KB counts.
- **Under 5MB budget**: Planck.js is the best balance. Full-featured at half
  the size of Matter.js.
- **Prototyping**: Matter.js for fastest development. Consider replacing with
  custom physics if size is an issue.
- **Custom**: For simple needs (just bouncing balls, basic platformer), writing
  custom physics in ~300 lines saves 30-100KB and gives full control.

### Q8: How would you implement a simple rope in a game?

**Answer**: Use Verlet integration with distance constraints:

1. Create N particles along the rope path, evenly spaced.
2. Pin the top particle (or wherever the rope is attached).
3. Each frame: integrate all unpinned particles with gravity, then iteratively
   solve distance constraints (5-10 iterations for stability).
4. Render by drawing lines between consecutive particles.

The key insight is that Verlet's position-based approach makes constraints trivial:
just move particles toward their desired distance. Multiple iterations make the
rope rigid-looking; fewer iterations make it stretchy.

This is ~50 lines of code and very cheap to simulate for a single rope with
10-20 segments, making it perfect for playable ads.

### Q9: What is the Separating Axis Theorem and when would you use it?

**Answer**: SAT states that two convex shapes do not overlap if and only if there
exists an axis along which their projections do not overlap. For polygons, you only
need to test the edge normals of both shapes as potential separating axes.

**Algorithm**:

1. Get all edge normals from both polygons.
2. For each normal, project both polygons onto that axis.
3. If projections don't overlap on any axis, the shapes don't collide.
4. If projections overlap on ALL axes, the shapes collide.

**When to use**: Rotated rectangles, triangles, hexagons, or any convex polygon.
The cost is O(n+m) where n and m are the vertex counts.

**When NOT to use**: Circles (use dedicated circle tests), concave shapes
(decompose into convex parts first), or axis-aligned rectangles (AABB test is
simpler and faster).

### Q10: How do you ensure physics stability at variable frame rates?

**Answer**: Use a fixed time step with an accumulator:

1. Each frame, add the elapsed `dt` to an accumulator.
2. While the accumulator >= fixed step (e.g., 1/60), run one physics step and subtract.
3. Cap the accumulator to prevent "spiral of death" (e.g., max 0.2 seconds).
4. Use the remaining fraction for render interpolation between the last two physics states.

This ensures physics runs at exactly the same rate regardless of render frame rate.
At 30fps, physics runs 2 steps per frame. At 120fps, physics runs every other frame.
The behavior is deterministic and stable.

For playable ads, this is especially important because performance varies wildly
across mobile devices. A fixed physics step prevents the game from breaking on
slow devices.
