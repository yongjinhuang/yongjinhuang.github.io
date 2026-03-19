# Chapter 1: Mathematical Foundations -- Representing the Physical World

> Before a robot can move, plan, or perceive, it must have a precise mathematical
> language for describing where things are, how they are oriented, and how they
> relate to one another in three-dimensional space. This chapter builds that
> language from the ground up.

---

## 1. Coordinate Frames and Why They Matter

Every measurement in robotics is relative. When a sensor reports "the obstacle is
1.5 meters away," the implicit question is: _away from what, and in which
direction?_ A **coordinate frame** (or reference frame) anchors measurements to a
specific origin and set of axes.

```
        Z_world
        ^
        |
        |
        +-------> Y_world
       /
      /
     v
    X_world

        Z_camera
        ^  / Y_camera
        | /
        |/
        +-------> X_camera
```

Common frames in a robotic system:

| Frame        | Attached to     | Typical use                  |
| ------------ | --------------- | ---------------------------- |
| World        | The environment | Global planning, mapping     |
| Base         | Robot base link | Joint-level control          |
| End-effector | Robot tool tip  | Grasping, tool operations    |
| Camera       | Vision sensor   | Perception, object detection |
| IMU          | Inertial sensor | State estimation             |

The core problem: given a point described in one frame, express it in another.
This is the business of **rigid-body transformations**.

---

## 2. Rotation Matrices and SO(3)

### 2.1 What Is a Rotation?

A rotation is a linear map that preserves:

- **Distances** (lengths are unchanged)
- **Orientation** (right-handed frames stay right-handed)
- **The origin** (the zero vector maps to itself)

Mathematically, a 3x3 rotation matrix R satisfies:

```
R^T R = I      (orthogonality)
det(R) = +1    (proper rotation, no reflection)
```

The set of all such matrices forms the **Special Orthogonal Group SO(3)**. It is a
_group_ because:

- The identity I is a rotation (do nothing).
- The product of two rotations is a rotation.
- Every rotation has an inverse (R^{-1} = R^T).

### 2.2 Elementary Rotations

Rotation about the X-axis by angle theta:

```
         [ 1     0         0    ]
Rx(θ) =  [ 0   cos(θ)  -sin(θ) ]
         [ 0   sin(θ)   cos(θ) ]
```

Rotation about the Y-axis:

```
         [  cos(θ)   0   sin(θ) ]
Ry(θ) =  [    0      1     0    ]
         [ -sin(θ)   0   cos(θ) ]
```

Rotation about the Z-axis:

```
         [ cos(θ)  -sin(θ)   0 ]
Rz(θ) =  [ sin(θ)   cos(θ)   0 ]
         [   0        0       1 ]
```

### 2.3 Composing Rotations

Rotations compose by matrix multiplication, but **order matters** (matrix
multiplication is not commutative).

A common source of bugs: rotating first about X then about Z is _not_ the same
as rotating first about Z then about X.

```
Rz(90°) * Rx(90°)  ≠  Rx(90°) * Rz(90°)
```

Convention matters too:

- **Intrinsic** (body-fixed) rotations: multiply right-to-left.
- **Extrinsic** (fixed-frame) rotations: multiply left-to-right.

### 2.4 Python: Building Rotation Matrices

```python
import numpy as np

def rot_x(theta: float) -> np.ndarray:
    """Rotation about X-axis by theta radians."""
    c, s = np.cos(theta), np.sin(theta)
    return np.array([
        [1,  0,  0],
        [0,  c, -s],
        [0,  s,  c],
    ])

def rot_y(theta: float) -> np.ndarray:
    """Rotation about Y-axis by theta radians."""
    c, s = np.cos(theta), np.sin(theta)
    return np.array([
        [ c, 0, s],
        [ 0, 1, 0],
        [-s, 0, c],
    ])

def rot_z(theta: float) -> np.ndarray:
    """Rotation about Z-axis by theta radians."""
    c, s = np.cos(theta), np.sin(theta)
    return np.array([
        [c, -s, 0],
        [s,  c, 0],
        [0,  0, 1],
    ])

# Compose: first rotate 45° about Z, then 30° about X (extrinsic)
R = rot_x(np.radians(30)) @ rot_z(np.radians(45))
print("Composed rotation:\n", R)

# Verify it is still a valid rotation
assert np.allclose(R.T @ R, np.eye(3)), "Not orthogonal!"
assert np.isclose(np.linalg.det(R), 1.0), "Determinant is not +1!"
```

---

## 3. Euler Angles and Gimbal Lock

### 3.1 Euler Angle Conventions

Any rotation can be decomposed into three successive rotations about coordinate
axes. There are 12 valid conventions (e.g., ZYX, ZYZ, XYZ). The most common in
robotics and aerospace:

- **ZYX (Yaw-Pitch-Roll)**: used in aerospace, drones, many URDF files.
- **ZYZ**: used in some industrial robot controllers (e.g., ABB).

Given ZYX convention (yaw=psi, pitch=theta, roll=phi):

```
R = Rz(ψ) * Ry(θ) * Rx(φ)
```

### 3.2 Gimbal Lock

When the middle angle reaches +/-90 degrees, the first and third rotation axes
align, and one degree of freedom is lost. This is **gimbal lock**.

```
   Normal case:              Gimbal lock (pitch = 90°):

   Yaw axis  |               Yaw axis  |
             |                         |
    Pitch ----+---- axis      Pitch ----+---- axis  <- Yaw and Roll
             |                         |               axes align!
    Roll axis |               Roll axis |
```

Concretely, with ZYX and theta = 90 degrees:

```
R = Rz(ψ) * Ry(90°) * Rx(φ)

    [  0    -sin(ψ-φ)   cos(ψ-φ) ]
  = [  0     cos(ψ-φ)   sin(ψ-φ) ]
    [ -1        0           0     ]
```

Only the _difference_ (psi - phi) matters -- the system has lost one independent
parameter. Numerically, this manifests as:

- Rapid oscillation between yaw and roll values.
- Division-by-zero in `atan2` calls when extracting angles.
- Singularity in the Jacobian that maps angular velocity to Euler rate.

### 3.3 Extracting Euler Angles from a Rotation Matrix

```python
def rotation_to_zyx_euler(R: np.ndarray) -> tuple[float, float, float]:
    """
    Extract ZYX Euler angles (yaw, pitch, roll) from rotation matrix.
    Returns (psi, theta, phi) in radians.
    """
    if np.isclose(abs(R[2, 0]), 1.0):
        # Gimbal lock: pitch is +/-90 degrees
        theta = -np.arcsin(R[2, 0])
        psi = np.arctan2(R[0, 1], R[0, 2])
        phi = 0.0  # Arbitrary; only (psi - phi) is defined
    else:
        theta = -np.arcsin(R[2, 0])
        psi = np.arctan2(R[1, 0], R[0, 0])
        phi = np.arctan2(R[2, 1], R[2, 2])
    return psi, theta, phi
```

---

## 4. Quaternions

### 4.1 Why Quaternions?

| Property              | Euler Angles | Rotation Matrix | Quaternion |
| --------------------- | :----------: | :-------------: | :--------: |
| Storage               |   3 floats   |    9 floats     |  4 floats  |
| Gimbal lock           |     Yes      |       No        |     No     |
| Interpolation (SLERP) |     Poor     |      Hard       | Excellent  |
| Composition cost      |  Rebuild R   |    27 mults     |  16 mults  |
| Singularity-free      |      No      |       Yes       |    Yes     |

A **unit quaternion** q = w + xi + yj + zk with ||q|| = 1 encodes a rotation
about axis **n** by angle theta as:

```
q = ( cos(θ/2),  sin(θ/2) * n )
       scalar      vector part
```

### 4.2 Quaternion Operations

**Composition** (Hamilton product):

```
q1 * q2 = (w1*w2 - v1·v2,  w1*v2 + w2*v1 + v1 x v2)
```

where v = (x, y, z) is the vector part.

**Inverse** (for unit quaternions):

```
q^{-1} = conjugate(q) = (w, -x, -y, -z)
```

**Rotating a point** p = (px, py, pz):

```
p' = q * (0, p) * q^{-1}
```

### 4.3 Double Cover

Both q and -q represent the _same_ rotation. This is the **double cover** of
SO(3) by the unit quaternion group S^3. In practice, you must handle this when:

- Interpolating: always pick the shorter arc (check dot product sign).
- Comparing: two quaternions are "equal" if q1 ~ q2 or q1 ~ -q2.

### 4.4 Python: Quaternion Class

```python
import numpy as np

class Quaternion:
    """Unit quaternion for 3D rotation (w, x, y, z) convention."""

    def __init__(self, w: float, x: float, y: float, z: float):
        norm = np.sqrt(w*w + x*x + y*y + z*z)
        self.w = w / norm
        self.x = x / norm
        self.y = y / norm
        self.z = z / norm

    @classmethod
    def from_axis_angle(cls, axis: np.ndarray, theta: float) -> "Quaternion":
        axis = axis / np.linalg.norm(axis)
        half = theta / 2.0
        s = np.sin(half)
        return cls(np.cos(half), s * axis[0], s * axis[1], s * axis[2])

    def to_rotation_matrix(self) -> np.ndarray:
        w, x, y, z = self.w, self.x, self.y, self.z
        return np.array([
            [1 - 2*(y*y + z*z),     2*(x*y - w*z),     2*(x*z + w*y)],
            [    2*(x*y + w*z), 1 - 2*(x*x + z*z),     2*(y*z - w*x)],
            [    2*(x*z - w*y),     2*(y*z + w*x), 1 - 2*(x*x + y*y)],
        ])

    def conjugate(self) -> "Quaternion":
        return Quaternion(self.w, -self.x, -self.y, -self.z)

    def __mul__(self, other: "Quaternion") -> "Quaternion":
        w1, x1, y1, z1 = self.w, self.x, self.y, self.z
        w2, x2, y2, z2 = other.w, other.x, other.y, other.z
        return Quaternion(
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2,
        )

    def rotate_point(self, p: np.ndarray) -> np.ndarray:
        p_quat = Quaternion(0.0, p[0], p[1], p[2])
        result = self * p_quat * self.conjugate()
        return np.array([result.x, result.y, result.z])


# Example: rotate point (1,0,0) by 90° about Z-axis
q = Quaternion.from_axis_angle(np.array([0, 0, 1]), np.radians(90))
p_rotated = q.rotate_point(np.array([1.0, 0.0, 0.0]))
print("Rotated point:", p_rotated)  # Expect approximately (0, 1, 0)
```

### 4.5 SLERP: Smooth Interpolation

Spherical Linear Interpolation produces a constant-speed rotation between two
orientations -- essential for smooth robot trajectories.

```python
def slerp(q1: Quaternion, q2: Quaternion, t: float) -> Quaternion:
    """Interpolate between q1 (t=0) and q2 (t=1)."""
    dot = q1.w*q2.w + q1.x*q2.x + q1.y*q2.y + q1.z*q2.z

    # Ensure shortest path
    if dot < 0:
        q2 = Quaternion(-q2.w, -q2.x, -q2.y, -q2.z)
        dot = -dot

    if dot > 0.9995:
        # Very close -- linear interpolation to avoid numerical issues
        result = Quaternion(
            q1.w + t*(q2.w - q1.w),
            q1.x + t*(q2.x - q1.x),
            q1.y + t*(q2.y - q1.y),
            q1.z + t*(q2.z - q1.z),
        )
        return result

    omega = np.arccos(dot)
    sin_omega = np.sin(omega)
    s1 = np.sin((1 - t) * omega) / sin_omega
    s2 = np.sin(t * omega) / sin_omega

    return Quaternion(
        s1*q1.w + s2*q2.w,
        s1*q1.x + s2*q2.x,
        s1*q1.y + s2*q2.y,
        s1*q1.z + s2*q2.z,
    )
```

---

## 5. Homogeneous Transformations and SE(3)

### 5.1 Combining Rotation and Translation

A rigid-body transformation has two parts: a rotation R and a translation t. We
pack them into a single 4x4 **homogeneous transformation matrix**:

```
    [ R   t ]       R: 3x3 rotation matrix (SO(3))
T = [       ]       t: 3x1 translation vector
    [ 0   1 ]       Bottom row: always [0 0 0 1]
```

The set of all such matrices is **SE(3)** -- the Special Euclidean Group in 3D.

To transform a point p from frame B to frame A:

```
p_A = T_AB * p_B      (using homogeneous coordinates: [p; 1])
```

### 5.2 Composition and Inversion

**Composition**: chain transformations by multiplication.

```
T_AC = T_AB * T_BC

"To go from C to A, first go from C to B, then from B to A."
```

**Inversion**: the inverse of a homogeneous transform is:

```
         [ R^T    -R^T * t ]
T^{-1} = [                 ]
         [  0        1     ]
```

This is cheaper than a general 4x4 inverse.

### 5.3 Kinematic Chain Example

Consider a robot with a base frame, a shoulder frame, and an end-effector frame:

```
    Base (B)          Shoulder (S)        End-effector (E)
       |                  |                     |
       +--- T_BS ---------+------ T_SE ---------+
                  rotate shoulder      translate along link

    T_BE = T_BS * T_SE
```

### 5.4 Python: Homogeneous Transforms

```python
import numpy as np

def make_transform(R: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Create a 4x4 homogeneous transformation matrix."""
    T = np.eye(4)
    T[:3, :3] = R
    T[:3, 3] = t
    return T

def invert_transform(T: np.ndarray) -> np.ndarray:
    """Efficiently invert a homogeneous transform."""
    R = T[:3, :3]
    t = T[:3, 3]
    T_inv = np.eye(4)
    T_inv[:3, :3] = R.T
    T_inv[:3, 3] = -R.T @ t
    return T_inv

def transform_point(T: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Transform a 3D point using a homogeneous transform."""
    p_hom = np.append(p, 1.0)
    result = T @ p_hom
    return result[:3]

# Example: frame B is rotated 90° about Z and translated (1, 0, 0) from A
R_AB = rot_z(np.radians(90))
t_AB = np.array([1.0, 0.0, 0.0])
T_AB = make_transform(R_AB, t_AB)

# A point at the origin of B, expressed in A
p_A = transform_point(T_AB, np.array([0.0, 0.0, 0.0]))
print("Origin of B in A:", p_A)  # (1, 0, 0)
```

---

## 6. Rigid Body Mechanics and Degrees of Freedom

### 6.1 Rigid Body Assumption

A **rigid body** is an idealization: all points maintain fixed distances from one
another regardless of applied forces. This assumption underpins almost all
classical robotics.

A free rigid body in 3D space has **6 degrees of freedom (DOF)**:

- 3 translational (x, y, z position)
- 3 rotational (orientation about three axes)

### 6.2 Degrees of Freedom: Counting and Constraints

**Grubler's formula** for a planar mechanism:

```
DOF = 3(N - 1) - 2*J1 - J2

N  = number of links (including the ground)
J1 = number of full joints (remove 2 DOF each, e.g., revolute, prismatic)
J2 = number of half joints (remove 1 DOF each, e.g., gear pairs)
```

For spatial (3D) mechanisms:

```
DOF = 6(N - 1) - 5*J1 - 4*J2 - 3*J3 - 2*J4 - J5
```

where J_k is the number of joints that remove k DOF.

### 6.3 Common Joint Types

```
  Revolute (R):            Prismatic (P):
  1 DOF -- rotation        1 DOF -- translation

      ^                        |
      |  axis                  |  axis
    --+--                    =[===]=>
      |                        |
    (hinge)                  (slider)

  Spherical (S):           Cylindrical (C):
  3 DOF -- rotation        2 DOF -- rotation + translation

      o (ball joint)           |
     /|\                     --+--
                               |
```

### 6.4 Example: Counting DOF of a 6R Robot Arm

A typical industrial robot arm has 6 revolute joints, 7 links (including the
ground link).

```
DOF = 6(7 - 1) - 5(6) = 36 - 30 = 6
```

Six DOF in task space (3 position + 3 orientation) -- this robot can position and
orient its end-effector arbitrarily (within its workspace).

---

## 7. Axis-Angle and Exponential Coordinates

### 7.1 Rodrigues' Rotation Formula

Any rotation can be expressed as a rotation by angle theta about a unit axis
n = (n1, n2, n3):

```
R = I + sin(θ) * [n]_x + (1 - cos(θ)) * [n]_x^2
```

where `[n]_x` is the **skew-symmetric matrix** of n:

```
         [  0   -n3   n2 ]
[n]_x =  [  n3   0   -n1 ]
         [ -n2   n1   0  ]
```

### 7.2 The Matrix Exponential

The connection between SO(3) (rotations) and so(3) (the Lie algebra of
skew-symmetric matrices) is the matrix exponential:

```
R = exp(θ * [n]_x)
```

This is the theoretical backbone of screw theory and modern geometric mechanics.
For small angles (theta << 1):

```
R ≈ I + θ * [n]_x
```

### 7.3 Python: Rodrigues Formula

```python
def skew(v: np.ndarray) -> np.ndarray:
    """Skew-symmetric matrix from a 3-vector."""
    return np.array([
        [    0, -v[2],  v[1]],
        [ v[2],     0, -v[0]],
        [-v[1],  v[0],     0],
    ])

def rodrigues(axis: np.ndarray, theta: float) -> np.ndarray:
    """Rotation matrix from axis-angle via Rodrigues' formula."""
    n = axis / np.linalg.norm(axis)
    K = skew(n)
    return np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * K @ K

# 90° rotation about Z-axis
R = rodrigues(np.array([0, 0, 1]), np.radians(90))
print("Rodrigues result:\n", R)
```

---

## 8. Twists and Spatial Velocities (Preview)

A **twist** is the 6D velocity of a rigid body, combining linear and angular
velocity:

```
V = [ ω ]    ω: angular velocity (3x1)
    [ v ]    v: linear velocity  (3x1)
```

There are two standard conventions:

- **Spatial twist** (body velocity expressed in the spatial/world frame).
- **Body twist** (velocity expressed in the body frame).

Twists live in se(3), the Lie algebra of SE(3), and relate to exponential
coordinates for rigid-body motions:

```
T = exp([V] * θ)
```

This connects to screw theory: every rigid-body motion is equivalent to a rotation
about some axis combined with a translation along that axis (a **screw motion**).

We will use these extensively in Chapter 2 for kinematics.

---

## 9. Numerical Pitfalls and Best Practices

### 9.1 Rotation Matrix Drift

After many multiplications, a rotation matrix accumulates floating-point error
and may no longer be orthogonal. **Re-orthogonalize** periodically:

```python
def reorthogonalize(R: np.ndarray) -> np.ndarray:
    """Project a near-rotation matrix back onto SO(3) via SVD."""
    U, _, Vt = np.linalg.svd(R)
    # Ensure det = +1 (not a reflection)
    S = np.diag([1, 1, np.linalg.det(U @ Vt)])
    return U @ S @ Vt
```

### 9.2 Quaternion Normalization

Similarly, normalize quaternions after arithmetic to stay on the unit sphere.

### 9.3 Comparing Rotations

Never compare rotation matrices element-wise with a tight tolerance. Instead,
compute the angular distance:

```python
def angular_distance(R1: np.ndarray, R2: np.ndarray) -> float:
    """Geodesic distance between two rotations, in radians."""
    R_diff = R1.T @ R2
    trace_val = np.clip(np.trace(R_diff), -1.0, 3.0)
    return np.arccos((trace_val - 1.0) / 2.0)
```

---

## 10. Putting It All Together: Frame Graph

A real robotic system has dozens of frames. Visualize them as a directed graph:

```
                    world
                   /     \
                map       odom
                 |          |
              base_link ----+
              /    |    \
         lidar  camera  arm_base
                  |       |
               depth    joint_1
                          |
                        joint_2
                          |
                        joint_3
                          |
                       end_effector
```

Each edge carries a transform T (or its inverse). To go from any frame to any
other, compose transforms along the path. In ROS, the `tf2` library maintains
this graph automatically.

**Key insight**: all the math in this chapter -- rotation matrices, quaternions,
homogeneous transforms -- exists to label these edges and compose paths through
this graph efficiently and without singularities.

---

## Interview Questions

**Q1.** What are the defining properties of a rotation matrix? How do you verify
that a given 3x3 matrix is a valid rotation?

> **A:** R^T R = I (orthogonal) and det(R) = +1 (proper, no reflection). Check
> both conditions numerically with appropriate tolerance.

**Q2.** Explain gimbal lock. When does it occur, and why is it problematic?

> **A:** Gimbal lock occurs when the middle Euler angle is +/-90 degrees, causing
> the first and third rotation axes to align. The system loses one degree of
> freedom, making it impossible to distinguish independent rotations about two
> axes. It causes numerical instability and ambiguity in angle extraction.

**Q3.** Why do quaternions avoid gimbal lock while Euler angles do not?

> **A:** Euler angles decompose rotation into three sequential axis rotations,
> creating a parameter singularity. Quaternions use four parameters with a unit
> norm constraint, providing a smooth (though double-covered) parameterization of
> SO(3) without singularities.

**Q4.** What does "double cover" mean for quaternions? What practical issue does
it cause?

> **A:** Both q and -q represent the same rotation. During interpolation (SLERP),
> you must check the sign of the dot product and negate one quaternion if needed
> to ensure interpolation takes the shortest path.

**Q5.** Given two homogeneous transforms T_AB and T_BC, how do you compute the
transform from frame C to frame A?

> **A:** T_AC = T_AB \* T_BC. Matrix multiplication composes the transforms in
> sequence: first from C to B, then from B to A.

**Q6.** How do you efficiently invert a homogeneous transformation matrix?

> **A:** Exploit the structure: R_inv = R^T, t_inv = -R^T \* t. This avoids
> a full 4x4 matrix inversion and is both faster and more numerically stable.

**Q7.** A rotation matrix is drifting due to accumulated floating-point error.
How do you fix it?

> **A:** Use SVD-based re-orthogonalization: compute U, S, V^T = svd(R), then
> set R_corrected = U * diag(1, 1, det(U*V^T)) \* V^T. This projects the matrix
> back onto SO(3).

**Q8.** What is Rodrigues' rotation formula and when would you use it?

> **A:** It computes a rotation matrix from an axis-angle representation:
> R = I + sin(theta)*K + (1-cos(theta))*K^2, where K is the skew-symmetric
> matrix of the unit axis. Use it when you have axis-angle data (common from
> gyroscopes or optimization outputs) and need the full rotation matrix.

**Q9.** Explain the relationship between SO(3), so(3), and the matrix exponential.

> **A:** SO(3) is the group of 3D rotations (3x3 orthogonal matrices with det +1).
> so(3) is its Lie algebra (3x3 skew-symmetric matrices). The matrix exponential
> maps from so(3) to SO(3): R = exp([omega]\_x \* theta). The logarithmic map goes
> the other direction. This is the foundation of screw theory in robotics.

**Q10.** A 6-DOF robot arm has 6 joints. Use Grubler's formula to confirm it has
6 degrees of freedom.

> **A:** N=7 links (including ground), 6 revolute joints (each removes 5 DOF).
> DOF = 6(7-1) - 5(6) = 36 - 30 = 6.

**Q11.** When would you choose Euler angles over quaternions in a robotics system?

> **A:** Euler angles are acceptable for visualization, human-readable output,
> or systems that never approach gimbal lock (e.g., a pan-tilt camera with
> limited range). For anything involving interpolation, control loops, or
> arbitrary orientations, prefer quaternions.

**Q12.** What is SLERP and why is it preferred over linear interpolation for
rotations?

> **A:** SLERP (Spherical Linear Interpolation) interpolates along the great
> circle on the quaternion unit sphere, producing constant angular velocity and
> a valid rotation at every intermediate step. Linear interpolation of Euler
> angles or matrix elements produces non-uniform speed and may leave SO(3).

**Q13.** In ROS, what is the tf2 library and how does it relate to the concepts
in this chapter?

> **A:** tf2 maintains a time-stamped tree of coordinate frame transforms. It
> lets you query the transform between any two frames at any time, automatically
> composing intermediate transforms. Every edge in the tf tree is a homogeneous
> transformation matrix (or equivalently, a translation + quaternion).

**Q14.** How many parameters are needed to represent a rigid-body pose in 3D? Why
does a quaternion + translation use 7 numbers for 6 DOF?

> **A:** A rigid-body pose has 6 DOF (3 translation + 3 rotation). The quaternion
> uses 4 numbers but has a unit-norm constraint, so it has only 3 independent
> parameters. Total independent parameters: 3 + 3 = 6, matching the DOF. The
> extra parameter is absorbed by the constraint ||q|| = 1.
