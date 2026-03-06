# Chapter 2: Kinematics -- How Robots Move

> Kinematics is the study of motion without regard to the forces that cause it.
> For a robot manipulator, kinematics answers two fundamental questions: "Given
> the joint angles, where is the end-effector?" (forward kinematics) and "Given a
> desired end-effector pose, what joint angles achieve it?" (inverse kinematics).

---

## 1. Forward Kinematics (FK)

### 1.1 The Problem Statement

Given a vector of joint variables q = (q1, q2, ..., qn), compute the position
and orientation of the end-effector in the base frame:

```
T_0n = f(q1, q2, ..., qn)
```

where T_0n is the 4x4 homogeneous transformation from the end-effector frame
(frame n) to the base frame (frame 0).

### 1.2 A 2-DOF Planar Arm: The Simplest Example

```
                 (x, y)
                  *
                 /
           L2  /  q2
              /
    ---------*
        L1    \  q1
               \
    ============O======  base
```

Two revolute joints, two links of length L1 and L2.

Forward kinematics:

```
x = L1 * cos(q1) + L2 * cos(q1 + q2)
y = L1 * sin(q1) + L2 * sin(q1 + q2)
```

```python
import numpy as np

def fk_2dof(q1: float, q2: float, L1: float, L2: float) -> tuple[float, float]:
    """Forward kinematics of a 2-DOF planar arm."""
    x = L1 * np.cos(q1) + L2 * np.cos(q1 + q2)
    y = L1 * np.sin(q1) + L2 * np.sin(q1 + q2)
    return x, y

# Example: both joints at 45°, unit links
x, y = fk_2dof(np.radians(45), np.radians(45), 1.0, 1.0)
print(f"End-effector at ({x:.3f}, {y:.3f})")
```

---

## 2. Denavit-Hartenberg (DH) Parameters

### 2.1 Why a Systematic Convention?

For arms with many joints, deriving FK by hand is error-prone. The
**Denavit-Hartenberg convention** provides a systematic recipe: attach frames to
each link following specific rules, then describe each frame-to-frame transform
with exactly **four parameters**.

### 2.2 The Four DH Parameters

For each joint i:

| Parameter | Symbol | Meaning                                          |
|-----------|--------|--------------------------------------------------|
| Link length    | a_i    | Distance along x_{i} from z_{i-1} to z_i   |
| Link twist     | alpha_i| Angle about x_{i} from z_{i-1} to z_i      |
| Link offset    | d_i    | Distance along z_{i-1} from x_{i-1} to x_i |
| Joint angle    | theta_i| Angle about z_{i-1} from x_{i-1} to x_i    |

For a **revolute** joint, theta_i is the variable. For a **prismatic** joint,
d_i is the variable. The other three parameters are fixed by the robot geometry.

### 2.3 The DH Transformation Matrix

Each joint contributes a transformation:

```
T_{i-1,i} = Rz(θi) * Tz(di) * Tx(ai) * Rx(αi)
```

In matrix form:

```
         [ cos(θ)  -sin(θ)cos(α)   sin(θ)sin(α)   a*cos(θ) ]
T(i-1,i)=[ sin(θ)   cos(θ)cos(α)  -cos(θ)sin(α)   a*sin(θ) ]
         [   0        sin(α)          cos(α)           d     ]
         [   0          0               0              1     ]
```

### 2.4 Building the Full FK

Chain all joint transforms:

```
T_0n = T_01 * T_12 * T_23 * ... * T_{n-1,n}
```

### 2.5 Python: DH-Based Forward Kinematics

```python
import numpy as np

def dh_transform(theta: float, d: float, a: float, alpha: float) -> np.ndarray:
    """Compute the 4x4 DH transformation matrix for one joint."""
    ct, st = np.cos(theta), np.sin(theta)
    ca, sa = np.cos(alpha), np.sin(alpha)
    return np.array([
        [ct, -st*ca,  st*sa, a*ct],
        [st,  ct*ca, -ct*sa, a*st],
        [ 0,    sa,     ca,    d ],
        [ 0,     0,      0,    1 ],
    ])

def forward_kinematics(dh_params: list[dict], joint_values: list[float]) -> np.ndarray:
    """
    Compute FK for an n-DOF serial manipulator.

    dh_params: list of dicts with keys 'a', 'alpha', 'd', 'theta', 'joint_type'
               joint_type is 'revolute' or 'prismatic'
    joint_values: list of joint variable values
    """
    T = np.eye(4)
    for i, (param, q) in enumerate(zip(dh_params, joint_values)):
        theta = q if param['joint_type'] == 'revolute' else param['theta']
        d = q if param['joint_type'] == 'prismatic' else param['d']
        T_i = dh_transform(theta, d, param['a'], param['alpha'])
        T = T @ T_i
    return T
```

### 2.6 Example: DH Table for a PUMA 560-Style 6R Arm

```
Joint | θ_i (var) | d_i   | a_i   | α_i
------+-----------+-------+-------+--------
  1   |   θ1      |  d1   |   0   |  -π/2
  2   |   θ2      |   0   |  a2   |    0
  3   |   θ3      |   0   |  a3   |  -π/2
  4   |   θ4      |  d4   |   0   |   π/2
  5   |   θ5      |   0   |   0   |  -π/2
  6   |   θ6      |  d6   |   0   |    0
```

```
     Joint 1 (base)
         |
         |  d1
         |
    -----+-----  Joint 2
         |
    ============  a2 (shoulder to elbow)
         |
    -----+-----  Joint 3
         |
         | d4
         |
    -----+-----  Joint 4 (wrist center)
         |
    -----+-----  Joint 5
         |
    -----+-----  Joint 6
         |
       [tool]
```

The first three joints (shoulder, elbow, wrist offset) control the **position**
of the wrist center. The last three joints (wrist roll-pitch-roll) form a
**spherical wrist** that controls **orientation** independently.

---

## 3. Inverse Kinematics (IK)

### 3.1 The Problem Statement

Given a desired end-effector pose T_desired (position + orientation), find joint
values q such that:

```
FK(q) = T_desired
```

This is fundamentally harder than FK because:
- The mapping is nonlinear.
- Multiple solutions may exist (or none).
- The solution space can be infinite (redundant robots).

### 3.2 Analytical (Closed-Form) IK

For robots with special geometric structure (e.g., spherical wrist, planar
mechanisms), closed-form solutions exist and are strongly preferred for real-time
control.

**2-DOF Planar Arm IK:**

```
        (x, y)
         *
        / \
   L2 /    \ virtual line r
     /      \
    * q2     \
   / q1       O (base)
  /
 L1
```

Using the law of cosines:

```
r^2 = x^2 + y^2

cos(q2) = (r^2 - L1^2 - L2^2) / (2 * L1 * L2)

q2 = atan2(±sqrt(1 - cos^2(q2)), cos(q2))     # two solutions: elbow up/down

q1 = atan2(y, x) - atan2(L2*sin(q2), L1 + L2*cos(q2))
```

```python
def ik_2dof(
    x: float, y: float, L1: float, L2: float, elbow_up: bool = True
) -> tuple[float, float]:
    """
    Inverse kinematics of a 2-DOF planar arm.
    Returns (q1, q2) in radians.
    Raises ValueError if target is unreachable.
    """
    r_sq = x**2 + y**2
    cos_q2 = (r_sq - L1**2 - L2**2) / (2 * L1 * L2)

    if abs(cos_q2) > 1.0:
        raise ValueError(f"Target ({x}, {y}) is unreachable")

    sin_q2 = np.sqrt(1 - cos_q2**2)
    if not elbow_up:
        sin_q2 = -sin_q2

    q2 = np.arctan2(sin_q2, cos_q2)
    q1 = np.arctan2(y, x) - np.arctan2(L2 * sin_q2, L1 + L2 * cos_q2)
    return q1, q2
```

### 3.3 The 6R Spherical Wrist Decomposition

For a 6-DOF arm with a spherical wrist (joints 4, 5, 6 intersect at a point):

1. **Compute the wrist center position** from the desired tool pose:
   ```
   p_wrist = p_desired - d6 * R_desired * [0, 0, 1]^T
   ```

2. **Solve for joints 1-3** using the wrist center position (geometric/algebraic
   methods -- depends on the specific arm geometry).

3. **Solve for joints 4-6** using the remaining orientation:
   ```
   R_36 = R_03^T * R_desired
   ```
   Extract ZYZ Euler angles from R_36 to get theta_4, theta_5, theta_6.

This decomposition yields up to **8 solutions** (2 for shoulder x 2 for elbow x
2 for wrist flip).

### 3.4 Numerical IK: Newton-Raphson

When no closed-form solution exists (e.g., redundant or non-standard geometry),
use iterative numerical methods.

The core idea: linearize FK around the current guess and solve iteratively.

```
e = x_desired - FK(q_current)          # task-space error
J = Jacobian(q_current)                # see Section 4
Δq = J^{-1} * e                        # or J^† for non-square J
q_current = q_current + α * Δq         # step with damping α
```

Repeat until ||e|| < tolerance.

```python
def numerical_ik(
    target_pos: np.ndarray,
    dh_params: list[dict],
    q_init: np.ndarray,
    max_iter: int = 100,
    tol: float = 1e-6,
    alpha: float = 0.5,
) -> np.ndarray:
    """
    Numerical IK using damped least-squares (Levenberg-Marquardt style).
    Solves for position only (3 DOF task space).
    """
    q = q_init.copy()

    for iteration in range(max_iter):
        T = forward_kinematics(dh_params, q.tolist())
        current_pos = T[:3, 3]
        error = target_pos - current_pos

        if np.linalg.norm(error) < tol:
            return q

        J = compute_jacobian(dh_params, q)  # See Section 4
        J_pos = J[:3, :]  # Position rows only

        # Damped least-squares (avoids singularity explosion)
        lam = 0.01
        Jt = J_pos.T
        q_delta = Jt @ np.linalg.solve(J_pos @ Jt + lam * np.eye(3), error)
        q = q + alpha * q_delta

    raise RuntimeError(f"IK did not converge after {max_iter} iterations")
```

### 3.5 Comparison: Analytical vs. Numerical IK

| Property            | Analytical         | Numerical                |
|--------------------|--------------------|--------------------------|
| Speed              | Very fast (direct) | Slower (iterative)       |
| Completeness       | All solutions      | One solution (depends on init) |
| Generality         | Specific geometry  | Any robot                |
| Singularity handling| Explicit          | Must be damped           |
| Redundancy         | Not applicable     | Handles naturally        |
| Real-time capable  | Always             | Usually (with good init) |

---

## 4. The Jacobian Matrix

### 4.1 What Is the Jacobian?

The Jacobian is the matrix of partial derivatives that relates joint velocities
to end-effector (task-space) velocities:

```
ẋ = J(q) * q̇

where:
  ẋ = [v_x, v_y, v_z, ω_x, ω_y, ω_z]^T   (6x1 task-space velocity)
  q̇ = [q̇1, q̇2, ..., q̇n]^T              (nx1 joint velocities)
  J = 6 x n matrix
```

### 4.2 Geometric Jacobian Construction

For a serial chain of revolute joints, each column of J is:

```
         [ z_{i-1} x (p_n - p_{i-1}) ]    (linear velocity contribution)
J_i   =  [                            ]
         [        z_{i-1}              ]    (angular velocity contribution)
```

where:
- z_{i-1} is the unit vector along joint i's axis (third column of R_{0,i-1}).
- p_{i-1} is the origin of frame i-1 (from T_{0,i-1}).
- p_n is the end-effector position.

For a prismatic joint:

```
         [ z_{i-1} ]    (linear velocity along joint axis)
J_i   =  [         ]
         [    0    ]    (no angular velocity contribution)
```

### 4.3 Python: Computing the Geometric Jacobian

```python
def compute_jacobian(dh_params: list[dict], q: np.ndarray) -> np.ndarray:
    """
    Compute the 6xN geometric Jacobian for a serial manipulator.
    """
    n = len(dh_params)
    J = np.zeros((6, n))

    # Compute all frame transforms
    transforms = [np.eye(4)]
    T = np.eye(4)
    for i, (param, qi) in enumerate(zip(dh_params, q)):
        theta = qi if param['joint_type'] == 'revolute' else param['theta']
        d = qi if param['joint_type'] == 'prismatic' else param['d']
        T_i = dh_transform(theta, d, param['a'], param['alpha'])
        T = T @ T_i
        transforms.append(T.copy())

    p_n = transforms[-1][:3, 3]  # End-effector position

    for i in range(n):
        z = transforms[i][:3, 2]  # z-axis of frame i
        p = transforms[i][:3, 3]  # origin of frame i

        if dh_params[i]['joint_type'] == 'revolute':
            J[:3, i] = np.cross(z, p_n - p)  # linear part
            J[3:, i] = z                       # angular part
        else:  # prismatic
            J[:3, i] = z
            J[3:, i] = 0

    return J
```

### 4.4 The Jacobian in Force/Torque Analysis

The Jacobian also maps task-space forces/torques to joint torques (via the
principle of virtual work):

```
τ = J^T * F

where:
  τ = joint torques (nx1)
  F = task-space wrench (6x1): [f_x, f_y, f_z, τ_x, τ_y, τ_z]^T
```

This is the **static force duality** of the Jacobian.

---

## 5. Singularities

### 5.1 What Is a Singularity?

A configuration q is **singular** when the Jacobian loses rank:

```
rank(J(q)) < min(6, n)
```

At a singularity:
- Some task-space directions become unachievable (zero velocity in that direction
  regardless of joint speeds).
- The inverse/pseudoinverse of J blows up.
- The robot loses one or more degrees of freedom in task space.

### 5.2 Types of Singularities

```
  Workspace boundary:           Internal singularity:
  (arm fully extended)          (two joint axes align)

       *----->                      *
      /                            /|
     /                            / |
    *                            *  |
   /                             |  |
  O                              O  v
  (can't move further out)      (axes 4 & 6 align = wrist lock)
```

1. **Boundary singularities**: the arm is at the edge of its workspace (fully
   extended or fully folded).

2. **Internal singularities**: two or more joint axes align, creating redundancy
   in the joint space for that direction.

### 5.3 Detecting and Handling Singularities

**Detection**: compute the **manipulability index**:

```
w = sqrt(det(J * J^T))
```

When w approaches zero, you are near a singularity.

**Handling**: Use **damped least-squares** (DLS) instead of the raw pseudoinverse:

```
Δq = J^T * (J * J^T + λ^2 * I)^{-1} * e
```

The damping factor lambda trades off accuracy for numerical stability. Larger
lambda means smoother but less accurate motion near singularities.

```python
def damped_pseudoinverse(J: np.ndarray, lam: float = 0.01) -> np.ndarray:
    """Damped least-squares pseudoinverse of J."""
    m = J.shape[0]
    return J.T @ np.linalg.inv(J @ J.T + lam**2 * np.eye(m))
```

---

## 6. Workspace Analysis

### 6.1 Reachable vs. Dexterous Workspace

```
  Dexterous workspace          Reachable workspace
  (can reach with ANY          (can reach with SOME
   orientation)                 orientation)

       +-------+                  +-----------+
       |       |                  |           |
       |  D.W. |                  |   R.W.    |
       |       |                  |           |
       +-------+                  +-----------+
       (smaller)                   (larger)
```

- **Reachable workspace**: the set of all positions the end-effector can reach
  (with at least one orientation).
- **Dexterous workspace**: the set of all positions the end-effector can reach
  with *any* arbitrary orientation.

For a 6-DOF arm, the dexterous workspace is typically a subset of the reachable
workspace. For arms with fewer than 6 DOF, the dexterous workspace may be empty.

### 6.2 Computing Workspace (Monte Carlo Method)

```python
def compute_workspace(
    dh_params: list[dict],
    joint_limits: list[tuple[float, float]],
    num_samples: int = 50000,
) -> np.ndarray:
    """
    Estimate the reachable workspace via random sampling.
    Returns an (N, 3) array of reachable end-effector positions.
    """
    positions = []
    for _ in range(num_samples):
        q = np.array([
            np.random.uniform(lo, hi) for lo, hi in joint_limits
        ])
        T = forward_kinematics(dh_params, q.tolist())
        positions.append(T[:3, 3])
    return np.array(positions)
```

### 6.3 2-DOF Workspace Visualization (ASCII)

For a 2-DOF planar arm with L1 = L2 = 1:

```
                    y
                    ^
               . . .|. . .
            .       |       .
          .    reachable      .
         .    workspace  |     .
        .         |      |      .
   -----.---------|------+-------.-------> x
        .         |   (origin)  .
         .        |            .
          .       |           .
            .     |        .
               . .|. . .

   Inner radius: |L1 - L2| = 0  (can fold back on itself)
   Outer radius:  L1 + L2  = 2
```

---

## 7. Redundancy and Null-Space Motion

### 7.1 Redundant Robots

A robot is **kinematically redundant** when it has more joints than task-space
DOF (n > 6 for a 3D task, n > 3 for a planar task).

Example: a 7-DOF arm performing a 6-DOF task has 1 degree of redundancy.

### 7.2 The Null Space

The pseudoinverse gives the minimum-norm joint velocity:

```
q̇ = J^† * ẋ
```

But any vector in the **null space** of J can be added without affecting the
end-effector:

```
q̇ = J^† * ẋ + (I - J^† * J) * q̇_0
```

where q_0_dot is an arbitrary joint velocity. The projection (I - J^dagger J)
maps it into J's null space.

Applications of null-space motion:
- Joint limit avoidance
- Obstacle avoidance
- Minimizing joint torques
- Maintaining manipulability

```python
def redundancy_resolution(
    J: np.ndarray,
    x_dot: np.ndarray,
    q0_dot: np.ndarray,
    lam: float = 0.01,
) -> np.ndarray:
    """
    Compute joint velocities with null-space optimization.
    J: 6xn Jacobian (n > 6 for redundancy)
    x_dot: desired task-space velocity (6x1)
    q0_dot: secondary objective in joint space (nx1)
    """
    n = J.shape[1]
    J_pinv = damped_pseudoinverse(J, lam)
    null_proj = np.eye(n) - J_pinv @ J
    return J_pinv @ x_dot + null_proj @ q0_dot
```

---

## 8. Velocity Kinematics and Trajectory Generation

### 8.1 Task-Space vs. Joint-Space Trajectories

**Joint-space trajectory**: interpolate directly in joint angles.
- Simple, always feasible if within joint limits.
- End-effector path is not straight in Cartesian space.

**Task-space trajectory**: specify end-effector path in Cartesian space.
- Straight-line or circular motions are easy to specify.
- Requires IK at each time step; may encounter singularities.

```
  Joint-space trajectory:           Task-space trajectory:

     q2                                y
      ^                                ^
      |  ....                          |     *----*
      | .    .                         |    /      \
      |.      .                        |   *        *
      +---------> q1                   +-----------> x
  (straight in joint space)         (straight in Cartesian space)
```

### 8.2 Trapezoidal Velocity Profile

A common motion profile: accelerate, cruise at constant velocity, decelerate.

```
  velocity
     ^
     |     ___________
     |    /           \
     |   /             \
     |  /               \
     | /                 \
     +----+----+----+----+----> time
       t_acc  cruise  t_dec
```

```python
def trapezoidal_profile(
    q_start: float,
    q_end: float,
    v_max: float,
    a_max: float,
    dt: float = 0.001,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate a trapezoidal velocity profile.
    Returns (times, positions, velocities).
    """
    distance = abs(q_end - q_start)
    sign = np.sign(q_end - q_start)

    # Time to accelerate to v_max
    t_acc = v_max / a_max
    d_acc = 0.5 * a_max * t_acc**2

    if 2 * d_acc > distance:
        # Triangular profile (never reaches v_max)
        t_acc = np.sqrt(distance / a_max)
        t_cruise = 0.0
        t_total = 2 * t_acc
    else:
        d_cruise = distance - 2 * d_acc
        t_cruise = d_cruise / v_max
        t_total = 2 * t_acc + t_cruise

    times = np.arange(0, t_total, dt)
    positions = np.zeros_like(times)
    velocities = np.zeros_like(times)

    for i, t in enumerate(times):
        if t < t_acc:
            positions[i] = q_start + sign * 0.5 * a_max * t**2
            velocities[i] = sign * a_max * t
        elif t < t_acc + t_cruise:
            t_c = t - t_acc
            positions[i] = q_start + sign * (d_acc + v_max * t_c)
            velocities[i] = sign * v_max
        else:
            t_d = t - t_acc - t_cruise
            positions[i] = (q_end
                            - sign * 0.5 * a_max * (t_acc - t_d)**2)
            velocities[i] = sign * a_max * (t_acc - t_d)

    return times, positions, velocities
```

---

## 9. Product of Exponentials (PoE) Formulation

### 9.1 An Alternative to DH

The **Product of Exponentials** formulation (from screw theory) avoids the DH
frame assignment rules entirely. Instead, you define:

1. The end-effector pose M when all joints are at zero.
2. A screw axis S_i for each joint (expressed in the base frame at zero config).

The FK is then:

```
T(q) = e^{[S1]*q1} * e^{[S2]*q2} * ... * e^{[Sn]*qn} * M
```

### 9.2 Advantages over DH

- No ambiguity in frame placement (DH has known edge cases for parallel axes).
- Naturally extends to arbitrary joint types (revolute, prismatic, helical).
- Cleaner mathematical formulation for dynamics and control.
- Used in the textbook "Modern Robotics" (Lynch & Park).

### 9.3 Python: PoE Forward Kinematics

```python
from scipy.linalg import expm

def screw_to_matrix(S: np.ndarray) -> np.ndarray:
    """Convert a 6D screw axis to a 4x4 se(3) matrix."""
    omega = S[:3]
    v = S[3:]
    mat = np.zeros((4, 4))
    mat[:3, :3] = skew(omega)
    mat[:3, 3] = v
    return mat

def fk_poe(
    screw_axes: list[np.ndarray],
    joint_values: list[float],
    M: np.ndarray,
) -> np.ndarray:
    """
    Forward kinematics via Product of Exponentials.
    screw_axes: list of 6D screw axes (in base frame at zero config)
    joint_values: current joint values
    M: end-effector pose at zero configuration (4x4)
    """
    T = np.eye(4)
    for S, q in zip(screw_axes, joint_values):
        T = T @ expm(screw_to_matrix(S) * q)
    return T @ M
```

---

## 10. Putting It All Together: A Complete 6-DOF FK/IK Pipeline

The typical pipeline in a robot controller:

```
  Task planner          Motion planner          Joint controller
  +-----------+         +-------------+         +--------------+
  | Desired   |  IK     | Joint-space |  PID    | Motor        |
  | Cartesian |-------->| trajectory  |-------->| commands     |
  | waypoints |         | (q vs time) |         | (torques)    |
  +-----------+         +-------------+         +--------------+
                              |
                              | FK (for monitoring/feedback)
                              v
                        +-------------+
                        | Actual      |
                        | Cartesian   |
                        | pose        |
                        +-------------+
```

1. The task planner generates Cartesian waypoints.
2. IK converts each waypoint to joint angles.
3. A trajectory generator interpolates between joint-angle setpoints.
4. A joint-level controller (PID, see Chapter 3) tracks the trajectory.
5. FK is used to monitor the actual Cartesian pose for feedback.

---

## Interview Questions

**Q1.** Explain the difference between forward and inverse kinematics. Which is
harder and why?

> **A:** FK maps joint angles to end-effector pose -- it is a direct function
> evaluation (unique output). IK maps a desired pose to joint angles -- it is
> harder because the mapping is nonlinear, may have multiple solutions (up to 16
> for a general 6R arm), or no solution if the target is outside the workspace.

**Q2.** What are the four DH parameters, and what does each represent?

> **A:** theta (rotation about z_{i-1}), d (translation along z_{i-1}), a
> (translation along x_i), alpha (rotation about x_i). Together, they define
> the relative transform between consecutive link frames.

**Q3.** A 2-DOF planar arm with L1=L2=1 is asked to reach point (3, 0). What
happens?

> **A:** The maximum reach is L1 + L2 = 2. The point (3, 0) is outside the
> workspace. IK will fail (cos(q2) > 1, no real solution).

**Q4.** What is the Jacobian matrix in robotics, and why is it important?

> **A:** The Jacobian J(q) maps joint velocities to end-effector velocities:
> x_dot = J * q_dot. It is essential for velocity control, force mapping
> (tau = J^T * F), singularity analysis, and numerical IK.

**Q5.** What happens at a kinematic singularity?

> **A:** The Jacobian loses rank, meaning some task-space directions become
> unachievable. The pseudoinverse blows up, causing enormous joint velocities
> for small Cartesian motions. The manipulability ellipsoid degenerates.

**Q6.** How does the damped least-squares (DLS) method handle singularities?

> **A:** DLS adds a damping term: Delta_q = J^T (J J^T + lambda^2 I)^{-1} e.
> The lambda term regularizes the inversion, trading accuracy for stability
> near singular configurations. Larger lambda = smoother but less precise.

**Q7.** What is a redundant robot? Give an example and explain the null space.

> **A:** A robot with more DOF than the task requires (e.g., 7-DOF arm for a
> 6-DOF task). The null space is the set of joint motions that produce zero
> end-effector motion. It can be exploited for secondary objectives like joint
> limit avoidance or obstacle avoidance.

**Q8.** Compare joint-space and task-space trajectory planning.

> **A:** Joint-space: interpolate joint angles directly; always kinematically
> feasible; end-effector path is curved. Task-space: specify Cartesian path
> (straight lines, arcs); requires IK at each step; may encounter singularities
> or workspace limits.

**Q9.** What is the Product of Exponentials (PoE) formulation and how does it
differ from DH?

> **A:** PoE uses screw axes and the matrix exponential to compute FK:
> T = exp(S1*q1) * ... * exp(Sn*qn) * M. Unlike DH, it has no frame assignment
> ambiguity (especially for parallel axes), requires no intermediate frames, and
> generalizes naturally to arbitrary joint types.

**Q10.** Explain the spherical wrist and why it simplifies IK for 6-DOF arms.

> **A:** A spherical wrist has its last three joint axes intersecting at a single
> point (the wrist center). This decouples position and orientation: joints 1-3
> control wrist center position, joints 4-6 control orientation. This reduces IK
> from a coupled 6-variable problem to two simpler 3-variable subproblems.

**Q11.** What is the manipulability index? How is it computed?

> **A:** w = sqrt(det(J * J^T)). It measures how far the robot is from a
> singularity. High w means good dexterity in all directions; w = 0 means
> singular. It is related to the volume of the velocity manipulability ellipsoid.

**Q12.** A 7-DOF arm is following a straight-line Cartesian path. How can you use
the extra DOF?

> **A:** Project a secondary objective (e.g., maximize manipulability, avoid
> joint limits, minimize energy) into the null space:
> q_dot = J^dagger * x_dot + (I - J^dagger * J) * q0_dot. The null-space
> component does not affect the end-effector motion.

**Q13.** Why do industrial robots typically have exactly 6 DOF?

> **A:** 6 DOF is the minimum needed to place the end-effector at any position
> and orientation in 3D space (within the workspace). Fewer DOF limits the set
> of achievable poses; more DOF adds cost, complexity, and control difficulty
> (though 7-DOF arms are increasingly common for their flexibility).

**Q14.** Describe the trapezoidal velocity profile and why it is used.

> **A:** It consists of a constant-acceleration phase, a constant-velocity cruise
> phase, and a constant-deceleration phase. It is simple to compute, respects
> velocity and acceleration limits, and provides smooth (if not smooth-jerk)
> motion. It is the most common industrial motion profile.
