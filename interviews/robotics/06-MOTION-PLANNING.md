# Chapter 6: Motion Planning -- Finding a Path

Motion planning answers the question: "How does the robot get from here to there without hitting anything?" This problem is deceptively deep. A 6-DOF robot arm in a cluttered environment must search a six-dimensional space, avoid collisions with every obstacle, respect joint limits and velocity constraints, and ideally do so quickly and smoothly. This chapter builds from foundational concepts to modern planning algorithms.

---

## 1. Configuration Space

### 1.1 Workspace vs. Configuration Space

The **workspace** is the physical space the robot occupies (typically 2D or 3D). The **configuration space** (C-space) is the space of all possible robot configurations, where each axis represents one degree of freedom.

```
  Workspace (2D)              Configuration Space
  ┌─────────────────┐         ┌─────────────────┐
  │                 │         │    C-obstacle    │
  │  ┌───┐         │         │   ┌─────────┐   │
  │  │obs│  robot   │         │   │/////////│   │
  │  │   │  (disk)  │         │   │/////////│   │
  │  └───┘    O     │         │   └─────────┘   │
  │         start   │         │  *start         │
  │                 │         │                 │
  │           * goal│         │           *goal │
  │                 │         │                 │
  └─────────────────┘         └─────────────────┘
   x, y coordinates            robot x, y (for point robot)
```

For a point robot in 2D, C-space equals workspace. For a robot with shape, obstacles "grow" in C-space by the Minkowski sum of the obstacle and the robot's shape.

### 1.2 C-Space Dimension Examples

| Robot                    | DOF | C-space Dimension |
|--------------------------|-----|-------------------|
| Point robot in 2D        | 2   | 2 (x, y)         |
| Rigid body in 2D         | 3   | 3 (x, y, theta)  |
| Rigid body in 3D         | 6   | 6 (x,y,z,r,p,y)  |
| 6-DOF robot arm          | 6   | 6 (joint angles)  |
| Humanoid robot (30 joints)| 30+ | 30+               |
| Two 6-DOF arms           | 12  | 12                |

**Key insight:** Planning in C-space reduces the problem to moving a point through a space with obstacles, regardless of the robot's actual geometry. The price is that C-space obstacles are complex shapes that are expensive to compute explicitly.

### 1.3 C-Space Topology

Not all C-spaces are simple Euclidean spaces:
- Rotational joints have topology S^1 (a circle): 0 and 2*pi are the same configuration
- SO(3) (3D rotation) is not Euclidean; it requires quaternions or rotation matrices
- A planar rigid body has C-space R^2 x S^1 (a cylinder)

Ignoring topology leads to bugs: a planner might take the long way around instead of crossing the 0/2pi boundary.

---

## 2. Classical Planning Methods

### 2.1 Bug Algorithms

The simplest complete motion planners. They require no map -- only a sensor to detect the obstacle boundary and knowledge of the goal direction.

**Bug 1:**
1. Move toward the goal
2. If you hit an obstacle, circumnavigate it completely
3. Find the point on the boundary closest to the goal
4. Go to that point, then resume moving toward the goal

**Bug 2:**
1. Move toward the goal along the line from start to goal (the M-line)
2. If you hit an obstacle, follow the boundary until you hit the M-line again at a point closer to the goal
3. Resume toward the goal

```
  Bug 2 Example:

  Start ─────────────────────── M-line ───────── Goal
        ╲                                    ╱
         ╲    ┌──────────┐                  ╱
          ╲   │          │                 ╱
           ╲──┤ obstacle │────────────────╱
              │          │
              └──────────┘
```

**Completeness:** Bug algorithms are complete (they will find a path if one exists) but produce highly suboptimal paths.

### 2.2 Potential Fields

Model the robot as a particle in an artificial potential field:

- **Attractive potential** pulls toward the goal: `U_att(q) = 0.5 * k_att * ||q - q_goal||^2`
- **Repulsive potential** pushes away from obstacles: `U_rep(q) = 0.5 * k_rep * (1/d(q) - 1/d_0)^2` when `d(q) < d_0`

The robot follows the negative gradient: `F = -grad(U_att + U_rep)`

```
  Potential Field Visualization (top view):

                    Goal (minimum)
                       *
                      ╱│╲
                    ╱  │  ╲
                  ╱    │    ╲
                ╱      │      ╲
  ────────────╱────────│────────╲───────
              ╲     Obstacle    ╱
                ╲    peak     ╱
                  ╲  ╱│╲   ╱
                    ╲╱ │ ╲╱
                       │
                    repulsion
```

**Pros:** Simple, real-time, produces smooth motion.

**Cons:** Local minima! The robot can get stuck where attractive and repulsive forces balance. This is a fundamental limitation that makes potential fields incomplete.

**Mitigation:** Random walks, navigation functions (provably no local minima for sphere worlds), harmonic potential functions.

---

## 3. Sampling-Based Planners

### 3.1 Why Sampling?

Explicit C-space construction is intractable in high dimensions. Sampling-based planners avoid this by:
1. Sampling random configurations
2. Checking only those configurations for collision
3. Building a graph or tree connecting collision-free samples
4. Searching the graph for a path

They are **probabilistically complete**: the probability of finding a path (if one exists) approaches 1 as the number of samples approaches infinity. They are not optimal in general, but variants can be asymptotically optimal.

### 3.2 Rapidly-exploring Random Tree (RRT)

RRT grows a tree from the start configuration by repeatedly:
1. Sample a random configuration q_rand in C-space
2. Find the nearest node q_near in the tree
3. Extend from q_near toward q_rand by a step size delta to get q_new
4. If the path from q_near to q_new is collision-free, add q_new to the tree
5. If q_new is close to the goal, connect to the goal

```
  RRT Growth:

  Step 1:     Step 2:       Step 3:        Step 4:
  S           S             S──*           S──*
              │                │              │
              *q_new           *q_new2        *──*
                                                 │
                                                 *──── G
  S = start,  G = goal,  * = tree nodes
```

**Voronoi bias:** Because we find the nearest node, new samples tend to extend the tree into unexplored regions (regions with large Voronoi cells). This gives RRT its characteristic rapid exploration of the space.

### 3.3 RRT Python Implementation

```python
import numpy as np

class RRT:
    def __init__(self, start, goal, bounds, step_size=0.5,
                 max_iter=5000, goal_threshold=0.5):
        """
        Simple 2D RRT planner.

        Args:
            start: start configuration (2D)
            goal: goal configuration (2D)
            bounds: [[x_min, x_max], [y_min, y_max]]
            step_size: maximum extension distance
            max_iter: maximum iterations
            goal_threshold: distance to consider goal reached
        """
        self.start = np.array(start, dtype=float)
        self.goal = np.array(goal, dtype=float)
        self.bounds = np.array(bounds, dtype=float)
        self.step_size = step_size
        self.max_iter = max_iter
        self.goal_threshold = goal_threshold

        # Tree storage: nodes[i] = configuration, parents[i] = parent index
        self.nodes = [self.start.copy()]
        self.parents = [-1]

    def sample_random(self, goal_bias=0.05):
        """Sample a random configuration with goal bias."""
        if np.random.random() < goal_bias:
            return self.goal.copy()
        return np.array([
            np.random.uniform(self.bounds[0, 0], self.bounds[0, 1]),
            np.random.uniform(self.bounds[1, 0], self.bounds[1, 1])
        ])

    def nearest(self, q):
        """Find index of nearest node to q."""
        dists = [np.linalg.norm(node - q) for node in self.nodes]
        return int(np.argmin(dists))

    def steer(self, q_near, q_rand):
        """Steer from q_near toward q_rand by at most step_size."""
        direction = q_rand - q_near
        dist = np.linalg.norm(direction)
        if dist <= self.step_size:
            return q_rand.copy()
        return q_near + (direction / dist) * self.step_size

    def is_collision_free(self, q_from, q_to, obstacles):
        """
        Check if straight-line path is collision-free.
        Obstacles are circles: [(cx, cy, radius), ...]
        """
        n_checks = max(int(np.linalg.norm(q_to - q_from) / 0.1), 2)
        for i in range(n_checks + 1):
            t = i / n_checks
            q = q_from + t * (q_to - q_from)
            for ox, oy, r in obstacles:
                if np.linalg.norm(q - np.array([ox, oy])) < r:
                    return False
        return True

    def plan(self, obstacles):
        """
        Run RRT and return path (list of configurations) or None.
        """
        for iteration in range(self.max_iter):
            q_rand = self.sample_random()
            near_idx = self.nearest(q_rand)
            q_near = self.nodes[near_idx]
            q_new = self.steer(q_near, q_rand)

            if self.is_collision_free(q_near, q_new, obstacles):
                self.nodes.append(q_new)
                self.parents.append(near_idx)
                new_idx = len(self.nodes) - 1

                # Check if we reached the goal
                if np.linalg.norm(q_new - self.goal) < self.goal_threshold:
                    if self.is_collision_free(q_new, self.goal, obstacles):
                        self.nodes.append(self.goal.copy())
                        self.parents.append(new_idx)
                        return self._extract_path(len(self.nodes) - 1)

        return None  # failed to find path

    def _extract_path(self, goal_idx):
        """Trace back from goal to start."""
        path = []
        idx = goal_idx
        while idx != -1:
            path.append(self.nodes[idx])
            idx = self.parents[idx]
        path.reverse()
        return path

# Example usage
rrt = RRT(
    start=[1.0, 1.0],
    goal=[9.0, 9.0],
    bounds=np.array([[0, 10], [0, 10]]),
    step_size=0.5,
    max_iter=5000
)

obstacles = [(5.0, 5.0, 2.0), (3.0, 7.0, 1.0), (7.0, 3.0, 1.5)]
path = rrt.plan(obstacles)

if path is not None:
    print(f"Path found with {len(path)} waypoints")
    for i, wp in enumerate(path):
        print(f"  Waypoint {i}: ({wp[0]:.2f}, {wp[1]:.2f})")
else:
    print("No path found")
```

### 3.4 RRT* (Asymptotically Optimal)

Standard RRT finds *a* path but not the *best* path. RRT* adds two operations to converge toward the optimal path:

1. **Near-neighbor search:** Instead of just the nearest node, find all nodes within a radius r_n (that shrinks as the tree grows)
2. **Rewiring:** After adding q_new, check if any nearby nodes would have a shorter path through q_new. If so, rewire them.

```
  RRT* Rewiring:

  Before:                    After:
      A──────B                   A──────B
      │                          │
      │   q_new                  │   q_new
      │  ╱                       │  ╱  ╲
      C─╱                        C─╱    D  (rewired: D's parent
      │                                     changed from C to q_new
      D                                     because path is shorter)
```

RRT* is **asymptotically optimal**: as the number of samples approaches infinity, the path converges to the true optimal path. In practice, it produces significantly better paths than RRT after sufficient iterations.

### 3.5 Probabilistic Roadmap (PRM)

PRM is a multi-query planner. Unlike RRT (which plans for a single start-goal pair), PRM builds a reusable roadmap of the free C-space:

**Learning phase:**
1. Sample N random collision-free configurations
2. For each sample, connect to its k nearest neighbors if the edge is collision-free
3. Store the resulting graph

**Query phase:**
1. Connect start and goal to the graph
2. Search the graph (A*, Dijkstra) for the shortest path

```
  PRM Roadmap:

  ┌────────────────────────────────────┐
  │  *───*───*     ┌──────┐    *──*   │
  │  │   │   │     │ obs  │    │  │   │
  │  *───*   *─────│      │────*  *   │
  │      │         └──────┘    │  │   │
  │  *───*───*─────────────────*──*   │
  │  │       │                 │      │
  │  *───*───*─────────────────*──*   │
  │                                   │
  └────────────────────────────────────┘
  * = sampled configurations (nodes)
  ─ = collision-free connections (edges)
```

**When to use PRM vs. RRT:**
- PRM: multiple queries in the same environment (e.g., a robot arm in a fixed workcell)
- RRT: single query, dynamic environments

---

## 4. Lattice Planners

### 4.1 State Lattice

A lattice planner discretizes the C-space into a regular grid and connects grid points with motion primitives -- precomputed dynamically feasible local trajectories.

```
  State Lattice (for a car-like robot):

       ╱──*──╲       ╱──*──╲
      *    │   *     *    │   *
       ╲   │  ╱       ╲   │  ╱
        ╲──*─╱         ╲──*─╱
           │              │
       ╱──*──╲        ╱──*──╲
      *    │   *      *    │   *
       ╲   │  ╱        ╲   │  ╱
        ╲──*─╱          ╲──*─╱

  Each * is a discretized state (x, y, heading)
  Lines are motion primitives (arcs, straights, turns)
```

**Advantages:**
- Guarantees kinematic/dynamic feasibility by construction
- Systematic coverage of the state space
- Can use graph search (A* with admissible heuristic) for optimality

**Disadvantages:**
- Resolution limited by discretization
- Exponential growth with dimension
- Motion primitive library must be carefully designed

### 4.2 Applications

Lattice planners are widely used in autonomous driving (Pivtoraiko, Knepper, Kelly at CMU) and agricultural robots. The Darpa Urban Challenge winning vehicles used variants of lattice planners.

---

## 5. Trajectory Optimization

### 5.1 From Path to Trajectory

A **path** is a geometric curve in C-space with no timing information. A **trajectory** is a path parameterized by time: q(t), with velocity and acceleration profiles. Trajectory optimization directly finds an optimal trajectory, typically smoother and better than post-processing a geometric path.

### 5.2 Problem Formulation

```
  minimize    integral of L(q(t), q_dot(t), q_ddot(t)) dt

  subject to  dynamics constraints
              collision avoidance
              joint limits
              velocity/acceleration limits
              boundary conditions: q(0) = q_start, q(T) = q_goal
```

### 5.3 CHOMP (Covariant Hamiltonian Optimization for Motion Planning)

CHOMP starts with an initial trajectory (e.g., a straight line in C-space) and iteratively improves it using gradient descent:

1. Compute the cost of the current trajectory (smoothness + obstacle cost)
2. Compute the gradient of the cost with respect to the trajectory waypoints
3. Update the trajectory: `xi_new = xi - eta * A^(-1) * grad_cost`

The matrix A^(-1) is a smoothing metric that ensures updates are smooth (not jagged).

```
  CHOMP Iteration:

  Iteration 0:        Iteration 3:        Converged:
  S─────────G         S──╲    ╱──G        S──╲      ╱──G
       │                   ╲╱                   ╲──╱
    [obstacle]          [obstacle]           [obstacle]
```

### 5.4 TrajOpt (Sequential Convex Optimization)

TrajOpt formulates collision avoidance as constraints (not costs) and uses sequential convex optimization:

1. Linearize the collision constraints around the current trajectory
2. Solve the resulting convex subproblem (QP)
3. Update the trajectory
4. Repeat until convergence

**Advantage over CHOMP:** Handles constraints (joint limits, collisions) explicitly rather than as penalty terms. Converges faster for constrained problems.

### 5.5 When to Use Trajectory Optimization

- Smooth, high-quality trajectories are needed
- The problem is highly constrained (joint limits, obstacles close to the path)
- Real-time re-planning in slowly changing environments
- Initial guess is available (from a sampling-based planner or previous solution)

**Limitation:** Trajectory optimization is local -- it converges to the nearest local minimum from the initial guess. It cannot discover fundamentally different routes. Best used in combination with a global planner.

---

## 6. Time-Optimal Planning

### 6.1 The Problem

Given a geometric path q(s) parameterized by arc length s, find the fastest timing s(t) that respects velocity and acceleration constraints:

```
  maximize    ds/dt  (move along the path as fast as possible)

  subject to  |q_dot_i| <= v_max_i      (velocity limits per joint)
              |q_ddot_i| <= a_max_i     (acceleration limits per joint)
              |tau_i| <= tau_max_i       (torque limits per joint)
```

### 6.2 Time-Optimal Path Parameterization (TOPP)

The classic approach (Bobrow, Dubowsky, Gibson 1985) reduces the problem to a 2D phase plane analysis in (s, s_dot) space. The optimal trajectory follows the maximum velocity curve and switches between maximum acceleration and maximum deceleration.

```
  Phase Plane (s, s_dot):

  s_dot
    ▲
    │        ╱╲    maximum velocity curve
    │       ╱  ╲
    │      ╱    ╲
    │     ╱      ╲──╲
    │    ╱ accel   decel ╲
    │   ╱                  ╲
    │  ╱                    ╲
    │ ╱                      ╲
    └──────────────────────────► s
    s=0                      s=L
    (start)                  (goal)
```

Modern libraries: TOPP-RA (Pham, 2018) solves this efficiently using reachability analysis and handles torque limits, friction, and other nonlinear constraints.

---

## 7. Dynamic Window Approach (DWA)

### 7.1 Overview

DWA is a local reactive planner for mobile robots. At each time step, it:

1. Computes the set of velocities (v, omega) reachable within one time step given acceleration limits (the "dynamic window")
2. Simulates short trajectories for each candidate velocity
3. Scores each trajectory based on: heading toward goal, clearance from obstacles, velocity (prefer faster)
4. Selects the best-scoring velocity

```
  Dynamic Window in Velocity Space:

  omega (angular velocity)
    ▲
    │   ┌───────────────┐
    │   │ dynamic       │
    │   │ window        │
    │   │    *best      │
    │   │               │
    │   └───────────────┘
    │          ▲
    │          │ current velocity
    └──────────┼────────────────► v (linear velocity)
               │
```

### 7.2 Scoring Function

```
  score(v, omega) = alpha * heading(v, omega)
                  + beta  * clearance(v, omega)
                  + gamma * velocity(v, omega)
```

- **heading:** Angular distance between the simulated endpoint heading and the goal direction (prefer heading toward goal)
- **clearance:** Distance to the nearest obstacle along the simulated trajectory (prefer clearance)
- **velocity:** Forward speed (prefer faster, but constrained by obstacles)

### 7.3 Strengths and Limitations

**Strengths:** Real-time (runs at 10-50 Hz), handles dynamic constraints, good for reactive obstacle avoidance.

**Limitations:** Local planner (can get stuck in U-shaped obstacles), short planning horizon, no global optimality. Must be combined with a global planner (A* on an occupancy grid, or a topological planner).

---

## 8. Collision Checking

### 8.1 Why It Matters

Collision checking dominates the runtime of sampling-based planners. A typical RRT run performs thousands of collision checks, each involving the robot geometry against all obstacles.

### 8.2 Methods

**Bounding volume hierarchies (BVH):** Wrap objects in simple bounding volumes (spheres, axis-aligned bounding boxes, oriented bounding boxes). Test bounding volumes first; only test detailed geometry if bounding volumes overlap.

```
  BVH Tree:

            [AABB_root]
           /            \
     [AABB_left]     [AABB_right]
      /      \          /      \
  [sphere] [sphere] [sphere] [sphere]
     |        |        |        |
  triangle triangle triangle triangle
```

**GJK (Gilbert-Johnson-Keerthi):** Determines if two convex shapes overlap by searching for the origin in the Minkowski difference. Works for any convex shape.

**FCL (Flexible Collision Library):** Open-source library used in MoveIt! (ROS) that combines BVH, GJK, and broad-phase algorithms.

### 8.3 Signed Distance Fields

Precompute a 3D grid where each cell stores the distance to the nearest obstacle surface (positive outside, negative inside). Collision checking becomes a simple lookup.

```
  Signed Distance Field (2D cross-section):

  +3  +2  +1  +1  +2  +3
  +2  +1   0   0  +1  +2
  +1   0  -1  -1   0  +1
  +1   0  -1  -1   0  +1
  +2  +1   0   0  +1  +2
  +3  +2  +1  +1  +2  +3

  0 = surface, negative = inside obstacle
```

**Uses:** Trajectory optimization (CHOMP, TrajOpt use SDF gradients), real-time collision checking, grasp planning.

---

## 9. Planning Under Uncertainty

### 9.1 Sources of Uncertainty

- **Localization uncertainty:** The robot does not know its exact position
- **Map uncertainty:** The map may be incomplete or inaccurate
- **Actuation uncertainty:** The robot may not execute commands perfectly
- **Dynamic obstacles:** Other agents (people, cars) have uncertain future trajectories

### 9.2 Belief Space Planning

Instead of planning in state space, plan in **belief space** -- the space of probability distributions over states. The belief is typically a Gaussian N(mu, Sigma), and the planner must account for how the belief evolves.

```
  State Space Planning:         Belief Space Planning:

  Robot is at point x           Robot believes it is around x
       *                             ╱╲
       │                            ╱  ╲
       │                           ╱ mu ╲
       │                          ╱      ╲
       ▼                          ╲ Sigma╱
     goal                          ╲    ╱
                                    ╲  ╱
                                     ╲╱
```

The planner must choose actions that both reach the goal and reduce uncertainty (e.g., take paths that pass by landmarks for better localization).

### 9.3 Chance Constraints

Instead of requiring zero collision probability, specify a maximum acceptable probability:

```
  P(collision) <= epsilon     (e.g., epsilon = 0.01)
```

This is converted to a deterministic constraint by inflating obstacles based on the position uncertainty. For Gaussian uncertainty with covariance Sigma, the inflation depends on the Mahalanobis distance corresponding to the desired confidence level.

### 9.4 Approaches

- **Stochastic RRT:** Sample uncertainty realizations during tree growth
- **LQG-MP:** Use LQG (Linear Quadratic Gaussian) to predict future belief and evaluate collision probability along candidate paths
- **POMDP (Partially Observable Markov Decision Process):** The most general framework, but computationally intractable for continuous high-dimensional systems. Practical for discrete or low-dimensional problems.

---

## 10. Planning Pipeline for a Robot Arm

A complete planning pipeline for a 6-DOF robot arm in a pick-and-place task:

```
  ┌────────────────────────────────────────────────┐
  │              Motion Planning Pipeline           │
  │                                                │
  │  1. Perception: detect objects, build scene    │
  │         │                                      │
  │         ▼                                      │
  │  2. Grasp planning: compute grasp pose         │
  │         │                                      │
  │         ▼                                      │
  │  3. IK solver: convert grasp pose to joint     │
  │     angles (may have multiple solutions)       │
  │         │                                      │
  │         ▼                                      │
  │  4. Motion planner: find collision-free path   │
  │     from current joints to grasp joints        │
  │     (RRT-Connect + shortcutting, or BiRRT)     │
  │         │                                      │
  │         ▼                                      │
  │  5. Trajectory optimization: smooth the path,  │
  │     add time parameterization (TOPP-RA)        │
  │         │                                      │
  │         ▼                                      │
  │  6. Execution: send trajectory to controller   │
  │     with collision monitoring                  │
  └────────────────────────────────────────────────┘
```

**MoveIt! (ROS)** implements this pipeline with configurable planners (OMPL for sampling-based, CHOMP/TrajOpt for optimization), collision checking (FCL), and IK solvers (KDL, IKFast, TracIK).

---

## 11. Comparison of Planning Methods

```
  ┌────────────────────┬────────────┬──────────┬────────────┬───────────┐
  │ Method             │ Completeness│ Optimal │ Dimension  │ Speed     │
  ├────────────────────┼────────────┼──────────┼────────────┼───────────┤
  │ Bug algorithms     │ Complete    │ No      │ 2D only    │ Fast      │
  │ Potential fields   │ Incomplete  │ No      │ Any        │ Very fast │
  │ A* (grid)          │ Complete    │ Yes*    │ Low (<4D)  │ Slow >4D  │
  │ RRT                │ Prob. comp. │ No      │ Any        │ Fast      │
  │ RRT*               │ Prob. comp. │ Asymp.  │ Any        │ Moderate  │
  │ PRM                │ Prob. comp. │ No      │ Any        │ Fast**    │
  │ Lattice + A*       │ Complete†   │ Yes*    │ Low-Med    │ Moderate  │
  │ CHOMP              │ Local only  │ Local   │ Any        │ Moderate  │
  │ TrajOpt            │ Local only  │ Local   │ Any        │ Moderate  │
  │ DWA                │ Local only  │ No      │ Low        │ Very fast │
  └────────────────────┴────────────┴──────────┴────────────┴───────────┘

  * Within the discretization resolution
  ** After roadmap construction (query phase is fast)
  † Within the lattice resolution
```

---

## 12. Practical Tips

### 12.1 Planner Selection

- **Known static environment, single query:** RRT-Connect (bidirectional RRT)
- **Known static environment, many queries:** PRM
- **Smooth trajectories needed:** RRT + trajectory optimization
- **Real-time reactive avoidance:** DWA or potential fields + global planner
- **Autonomous driving:** Lattice planner or sampling-based + trajectory optimization
- **High-DOF arms:** RRT-Connect (OMPL) + TOPP-RA

### 12.2 Common Pitfalls

- **Narrow passages:** Sampling-based planners struggle when the free space has narrow passages. Solutions: bridge test sampling, Gaussian sampling near obstacles, or retraction-based sampling.
- **Goal bias too high:** Setting goal bias too high in RRT causes the tree to grow toward the goal and miss exploring around obstacles. Typical value: 5-10%.
- **Step size:** Too large causes missed collisions; too small causes slow exploration. Adaptive step sizes help.
- **Post-processing:** Always smooth and shortcut RRT paths. Raw RRT paths are jagged and suboptimal.

---

## Interview Questions

**Q1: What is configuration space and why is it useful for motion planning?**

Configuration space (C-space) maps every possible robot configuration to a single point. Obstacles in workspace become C-space obstacles. Planning in C-space reduces the problem to finding a path for a point, regardless of robot geometry. For a 6-DOF arm, C-space is 6-dimensional with each axis representing a joint angle.

**Q2: Explain the fundamental limitation of potential field methods.**

Potential fields can have local minima where attractive and repulsive forces cancel out. The robot gets stuck and cannot reach the goal even though a path exists. This makes the method incomplete. Navigation functions can eliminate local minima for specific obstacle shapes, but the general problem remains.

**Q3: Describe the RRT algorithm. Why does it explore the space rapidly?**

RRT grows a tree by sampling random configurations, finding the nearest tree node, and extending toward the sample. It explores rapidly due to Voronoi bias: nodes in sparsely explored regions have large Voronoi cells, making them more likely to be selected as the nearest node. This naturally drives exploration toward unexplored areas.

**Q4: What is the difference between RRT and RRT*?**

RRT finds any feasible path. RRT* adds two operations: (1) near-neighbor search to find potentially better parent nodes for new nodes, and (2) rewiring to update the tree when a shorter path through the new node is discovered. RRT* is asymptotically optimal -- the path converges to the true optimum as samples increase. The cost is slower per-iteration computation.

**Q5: Compare PRM and RRT. When would you use each?**

PRM builds a reusable roadmap (graph) of the free space during a learning phase, then answers queries quickly by connecting start/goal to the graph. RRT builds a single-use tree for one start-goal pair. Use PRM when you have many queries in the same environment (e.g., manufacturing workcell). Use RRT when the environment changes frequently or you need a single path quickly.

**Q6: What is trajectory optimization and how does CHOMP work?**

Trajectory optimization directly optimizes a trajectory (path + timing) to minimize a cost function (smoothness + obstacle avoidance) subject to constraints. CHOMP starts with an initial trajectory (e.g., straight line), computes the gradient of the cost, and iteratively updates the trajectory using a covariant gradient descent that ensures smooth updates. It converges to a local optimum.

**Q7: Explain the Dynamic Window Approach. What are its limitations?**

DWA is a local reactive planner that selects the best velocity command by: (1) computing reachable velocities within one time step (the dynamic window), (2) simulating short trajectories for each candidate, (3) scoring based on heading, clearance, and speed. Limitations: it is purely local (no global optimality), has a short planning horizon, and can get stuck in U-shaped obstacles or dead ends.

**Q8: How does collision checking work in practice? Why is it a bottleneck?**

Collision checking tests whether a robot configuration or a path segment intersects any obstacle. It uses bounding volume hierarchies (test simple shapes first, then detailed geometry) and algorithms like GJK for convex shapes. It is a bottleneck because sampling-based planners call it thousands of times, and each call involves geometric intersection tests for the full robot against all obstacles.

**Q9: What is the significance of C-space topology? Give an example.**

C-space topology determines how distances and paths work. For rotational joints, the topology is S^1 (a circle), meaning angles 0 and 2*pi are identical. A planner unaware of this topology might compute a 350-degree rotation instead of a 10-degree rotation in the opposite direction. Similarly, SO(3) is not Euclidean, requiring proper distance metrics (e.g., quaternion distance).

**Q10: Explain planning under uncertainty. What is belief space planning?**

Real robots have uncertain positions, imperfect maps, and noisy actuation. Planning under uncertainty accounts for this by planning in belief space -- the space of probability distributions over states rather than individual states. The planner must choose actions that reach the goal while managing uncertainty, sometimes preferring longer paths that pass by informative landmarks for better localization.

**Q11: What is time-optimal path parameterization (TOPP)?**

Given a geometric path, TOPP finds the fastest timing profile that respects velocity, acceleration, and torque limits. It reduces to a 2D phase plane analysis in (path parameter s, speed s_dot). The optimal solution follows the maximum velocity curve and switches between maximum acceleration and deceleration. TOPP-RA is the modern efficient algorithm for this.

**Q12: How would you handle narrow passages in sampling-based planning?**

Narrow passages have very small volumes in C-space, making random sampling unlikely to find configurations inside them. Solutions: (1) Bridge test -- sample pairs of points in collision and check if the midpoint is free. (2) Gaussian sampling -- sample near obstacle surfaces. (3) Retraction -- project random samples onto the medial axis of free space. (4) Increase sampling density adaptively in difficult regions.

**Q13: Describe a complete motion planning pipeline for a robot arm performing pick-and-place.**

(1) Perceive the scene and build a collision model. (2) Compute a grasp pose for the target object. (3) Solve inverse kinematics to convert the grasp pose to joint angles. (4) Use a sampling-based planner (RRT-Connect) to find a collision-free path from current to grasp configuration. (5) Smooth the path with shortcutting and trajectory optimization. (6) Apply time-optimal parameterization (TOPP-RA). (7) Execute with real-time collision monitoring.

**Q14: What is a lattice planner and why is it useful for autonomous vehicles?**

A lattice planner discretizes the state space into a regular grid and connects states with precomputed motion primitives (arcs, lane changes, turns). Graph search (A*) finds the optimal path through the lattice. It is useful for vehicles because: motion primitives guarantee kinematic feasibility, the lattice structure enables efficient search, and the precomputed primitives capture vehicle dynamics accurately.

**Q15: Compare local and global planning. Why are both needed?**

Global planners (RRT, PRM, A*) find paths considering the entire environment but are too slow for real-time replanning. Local planners (DWA, potential fields) react quickly to immediate obstacles but can get stuck in local traps. A typical architecture uses a global planner to compute a coarse path and a local planner for real-time execution and obstacle avoidance, re-invoking the global planner when the local planner fails.
