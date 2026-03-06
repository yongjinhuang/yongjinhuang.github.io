# Chapter 5: Sensors & Perception -- Seeing the World

A robot without sensors is blind. No amount of control sophistication matters if the robot cannot perceive its own state and its environment. This chapter covers the major sensor modalities used in robotics, the mathematical foundations of sensor fusion, and the landmark problem of simultaneous localization and mapping (SLAM).

---

## 1. Proprioceptive Sensors

Proprioceptive sensors measure the robot's own internal state -- joint positions, velocities, forces. They are the robot's sense of its own body.

### 1.1 Encoders

Encoders measure rotational position of a shaft. They are the most fundamental sensor in robotics.

**Incremental encoders** produce pulses as the shaft rotates. Two channels (A and B) in quadrature allow direction detection:

```
  Channel A:  ┌──┐  ┌──┐  ┌──┐  ┌──┐
              │  │  │  │  │  │  │  │
  ────────────┘  └──┘  └──┘  └──┘  └──

  Channel B:     ┌──┐  ┌──┐  ┌──┐  ┌──┐
                 │  │  │  │  │  │  │  │
  ───────────────┘  └──┘  └──┘  └──┘  └──

  Forward:  A leads B
  Reverse:  B leads A
```

**Resolution:** Measured in counts per revolution (CPR). A 1024 CPR encoder with quadrature decoding gives 4096 counts/rev, or ~0.088 degrees per count.

**Absolute encoders** output a unique binary code for each position. They know their position immediately on power-up, unlike incremental encoders which require homing.

### 1.2 Force/Torque Sensors

Six-axis force/torque (F/T) sensors measure forces and torques in all three directions. They use strain gauges on a compliant structure.

```
         Fz
         ▲
         │    Tz (torque about z)
         │   ↻
         │
  Fy ◄───┼──────► Fx
        ╱ ╲
       ╱   ╲
      Ty    Tx
```

**Applications:** Compliant manipulation (feel contact forces), force control (maintain desired contact force), collision detection, weight estimation.

**Key spec:** Measurement range vs. resolution. A sensor designed for 100N range cannot reliably measure 0.1N forces.

---

## 2. Inertial Measurement Unit (IMU)

An IMU combines accelerometers, gyroscopes, and optionally magnetometers to measure motion.

### 2.1 Accelerometer

Measures specific force (acceleration minus gravity). A MEMS accelerometer is essentially a tiny mass on a spring:

```
  ┌──────────────────────┐
  │  Fixed frame         │
  │  ┌──┐                │
  │  │  │  ◄── spring    │
  │  │  ├────/\/\/──┤    │
  │  │  │           │    │
  │  └──┘     ┌─────┤    │
  │           │proof│    │
  │           │mass │    │
  │           └─────┘    │
  │    capacitive plates │
  │    measure displacement│
  └──────────────────────┘
```

When the device accelerates, the proof mass lags behind. The displacement is proportional to acceleration.

**Critical subtlety:** An accelerometer at rest on a table reads +9.81 m/s^2 upward (it measures the normal force, not gravity). You cannot distinguish acceleration from gravity using accelerometers alone -- this is the equivalence principle.

### 2.2 Gyroscope

Measures angular velocity. MEMS gyroscopes use the Coriolis effect on a vibrating structure.

**Bias drift** is the main challenge: even when stationary, a gyroscope reports a small nonzero rate that accumulates when integrated. A typical MEMS gyro drifts 1-10 deg/hour. Tactical-grade gyros drift 0.01 deg/hour. Navigation-grade fiber optic gyros drift < 0.001 deg/hour.

### 2.3 Magnetometer

Measures the local magnetic field vector. When combined with the accelerometer, it provides a full 3D orientation (heading from magnetometer, pitch/roll from accelerometer).

**Problem:** Magnetic disturbances from motors, wires, and metal structures corrupt readings. Calibration (hard-iron and soft-iron correction) is essential.

### 2.4 IMU Error Model

```
  measured = true_value + bias + noise

  Bias model:  b[k+1] = b[k] + w_b     (random walk)
  Noise:       n ~ N(0, sigma^2)
```

| Error Source       | Accelerometer        | Gyroscope           |
|--------------------|----------------------|---------------------|
| Bias instability   | 0.01-1 mg           | 0.1-10 deg/hr      |
| Random walk        | 0.01-0.1 m/s/sqrt(hr)| 0.01-1 deg/sqrt(hr)|
| Scale factor error | 0.01-1%             | 0.01-1%             |
| Cross-axis coupling| 0.01-1%             | 0.01-1%             |

### 2.5 Attitude Estimation from IMU

Integrating gyroscope rates gives orientation but drifts. Accelerometer gives a noisy but drift-free gravity reference (for pitch and roll). Magnetometer gives heading. Sensor fusion combines them:

- **Complementary filter:** Simple, lightweight: `angle = alpha * (angle + gyro*dt) + (1-alpha) * accel_angle`
- **Kalman filter:** Optimal for Gaussian noise (see Section 6)
- **Madgwick/Mahony filters:** Popular gradient-descent-based algorithms optimized for embedded systems

---

## 3. LiDAR

### 3.1 How LiDAR Works

LiDAR (Light Detection And Ranging) emits laser pulses and measures the time of flight to compute distance:

```
  distance = (speed_of_light * time_of_flight) / 2
```

```
  LiDAR Sensor
  ┌─────┐
  │ TX ─┼──── laser pulse ──────►  ┌────┐
  │     │                          │    │
  │ RX ◄┼──── reflected pulse ◄──  │obj │
  │     │                          │    │
  └─────┘                          └────┘
  │◄───────── distance d ─────────►│
```

### 3.2 Types of LiDAR

**2D LiDAR (planar scanner):** A single laser spins mechanically (e.g., SICK LMS, Hokuyo). Produces a 2D scan of distances at angular intervals. Typical: 270-degree field of view, 0.25-1 degree resolution, 10-30m range.

**3D LiDAR (spinning multi-beam):** Multiple lasers stacked vertically on a spinning platform (e.g., Velodyne VLP-16 with 16 channels, Ouster OS1 with 64/128 channels). Produces a 3D point cloud at 10-20 Hz.

**Solid-state LiDAR:** No moving parts. Uses MEMS mirrors, optical phased arrays, or flash illumination. Smaller, cheaper, more reliable, but narrower field of view.

### 3.3 Point Cloud Processing

A 3D LiDAR produces hundreds of thousands of points per frame. Common processing steps:

1. **Ground removal:** Separate ground plane from obstacles (RANSAC plane fitting)
2. **Voxel downsampling:** Reduce point density for efficiency
3. **Clustering:** Group nearby points into objects (DBSCAN, Euclidean clustering)
4. **Registration:** Align successive scans (ICP -- Iterative Closest Point)
5. **Normal estimation:** Compute surface normals for each point

### 3.4 ICP Algorithm (Sketch)

ICP aligns two point clouds by iteratively:
1. For each point in cloud A, find the nearest point in cloud B
2. Compute the rigid transformation (R, t) that minimizes the sum of squared distances
3. Apply the transformation to cloud A
4. Repeat until convergence

```
  Cloud A (source)         Cloud B (target)
    *   *                      +   +
  *   *   *     ──ICP──►    +   +   +
    *   *                      +   +

  Find R, t such that:  A' = R * A + t  ≈  B
```

---

## 4. Cameras

### 4.1 Pinhole Camera Model

The pinhole model projects 3D world points onto a 2D image plane:

```
  World Point              Image Plane
  P = (X, Y, Z)           p = (u, v)

         P
        /|
       / |
      /  |
     /   |Z
    /    |
   /     |
  O──────┼──► image plane
  focal  |
  length |
  f      p(u,v)
```

The projection equations:

```
  u = f_x * (X / Z) + c_x
  v = f_y * (Y / Z) + c_y
```

In matrix form:

```
  s [u]   [f_x  0   c_x] [X]
    [v] = [ 0  f_y  c_y] [Y]
    [1]   [ 0   0    1 ] [Z]

  s * p = K * P
```

where K is the **camera intrinsic matrix** and s = Z is the depth.

### 4.2 Camera Calibration

Calibration determines the intrinsic parameters (f_x, f_y, c_x, c_y) and lens distortion coefficients. The standard method uses a checkerboard pattern:

1. Capture images of a known checkerboard at various poses
2. Detect corner points in each image
3. Solve for intrinsic and extrinsic parameters (Zhang's method)
4. Refine with nonlinear optimization (Levenberg-Marquardt)

OpenCV provides `calibrateCamera()` for this.

**Distortion models:**
- **Radial distortion:** Barrel or pincushion effect. Modeled as: `r_corrected = r (1 + k1*r^2 + k2*r^4 + k3*r^6)`
- **Tangential distortion:** From imperfect lens-sensor alignment

### 4.3 Stereo Vision

Two cameras separated by a known baseline b can triangulate depth:

```
  Left Camera          Right Camera
      O_L ─────────────── O_R
      │                    │
      │   baseline b       │
      │                    │
      │      P(X,Y,Z)     │
      │     /     \        │
      │    /       \       │
      │   /         \      │
      └──/───────────\────┘
        u_L          u_R

  disparity d = u_L - u_R
  depth Z = f * b / d
```

**Key insight:** Depth is inversely proportional to disparity. Objects far away have small disparity (hard to measure accurately), objects close have large disparity. This limits the effective range of stereo vision.

**Stereo matching** finds corresponding points between left and right images. The **epipolar constraint** reduces the search to a single line (after rectification). Methods include block matching, semi-global matching (SGM), and neural stereo networks.

### 4.4 Depth Sensors

**Structured light (e.g., Intel RealSense D400, Kinect v1):** Projects a known IR pattern and measures distortion to compute depth. Works indoors, fails in sunlight.

**Time-of-flight (e.g., Kinect v2, PMD):** Measures phase shift of modulated IR light. Each pixel independently measures depth. Works at longer ranges but lower resolution.

**Comparison:**

```
  ┌──────────────────┬────────────┬────────────┬────────────┐
  │ Sensor           │ Range      │ Resolution │ Outdoor    │
  ├──────────────────┼────────────┼────────────┼────────────┤
  │ Stereo camera    │ 1-30m      │ High       │ Yes        │
  │ Structured light │ 0.3-5m     │ High       │ No         │
  │ Time-of-flight   │ 0.5-10m   │ Medium     │ Partial    │
  │ LiDAR            │ 1-200m     │ Sparse     │ Yes        │
  └──────────────────┴────────────┴────────────┴────────────┘
```

---

## 5. Sensor Characteristics

Every sensor has key specifications that determine its suitability:

- **Accuracy:** Closeness to true value (systematic error)
- **Precision/Repeatability:** Consistency of repeated measurements (random error)
- **Resolution:** Smallest detectable change
- **Range:** Min and max measurable values
- **Bandwidth:** How fast the sensor can respond to changes
- **Latency:** Delay between event and measurement
- **Sample rate:** How often measurements are produced

**Noise models:**
- **White noise:** Constant power spectral density (Gaussian, independent samples)
- **Random walk:** Integral of white noise (accumulates, IMU bias)
- **Flicker noise (1/f):** Low-frequency noise, common in electronics
- **Quantization noise:** From analog-to-digital conversion

---

## 6. Kalman Filter

The Kalman filter is the most important algorithm in sensor fusion. It optimally combines predictions from a model with noisy measurements.

### 6.1 Problem Setup

We have a linear discrete-time system with noise:

```
  x[k] = A x[k-1] + B u[k-1] + w[k-1]     (process model)
  z[k] = H x[k] + v[k]                      (measurement model)

  w ~ N(0, Q)    process noise covariance
  v ~ N(0, R)    measurement noise covariance
```

We want to estimate x[k] given all measurements z[1], ..., z[k].

### 6.2 The Two-Step Algorithm

```
  ┌─────────────────────────────────────────────────────┐
  │                KALMAN FILTER CYCLE                  │
  │                                                     │
  │  ┌──────────┐         ┌────────────┐               │
  │  │ PREDICT  │ ──────► │  UPDATE    │               │
  │  │          │         │ (Correct)  │               │
  │  └──────────┘         └─────┬──────┘               │
  │       ▲                     │                      │
  │       │                     │                      │
  │       └─────────────────────┘                      │
  │              next time step                        │
  └─────────────────────────────────────────────────────┘
```

**Predict step** (propagate through model):

```
  x_pred    = A x_est + B u          (state prediction)
  P_pred    = A P_est A^T + Q        (covariance prediction)
```

**Update step** (incorporate measurement):

```
  y         = z - H x_pred           (innovation / residual)
  S         = H P_pred H^T + R       (innovation covariance)
  K         = P_pred H^T S^(-1)      (Kalman gain)
  x_est     = x_pred + K y           (state update)
  P_est     = (I - K H) P_pred       (covariance update)
```

### 6.3 Intuition for the Kalman Gain

The Kalman gain K determines how much we trust the measurement vs. the prediction:

- If measurement noise R is small (good sensor): K is large, we trust the measurement
- If process noise Q is large (bad model): K is large, we rely more on measurements
- If R is large (noisy sensor): K is small, we trust the prediction
- If P_pred is small (confident prediction): K is small, we trust the prediction

The gain automatically adapts over time as the covariance P evolves.

### 6.4 Derivation Sketch

The Kalman filter minimizes the expected squared estimation error E[(x - x_est)^T (x - x_est)]. The key steps:

1. Model the prediction and measurement as two independent Gaussian estimates of x
2. The optimal combination of two Gaussians N(mu_1, sigma_1^2) and N(mu_2, sigma_2^2) is a Gaussian with:
   - `mu_opt = mu_1 + K (mu_2 - mu_1)` where `K = sigma_1^2 / (sigma_1^2 + sigma_2^2)`
   - The combined variance is smaller than either individual variance
3. Generalize to multivariate Gaussians with covariance matrices

### 6.5 Python Implementation

```python
import numpy as np

class KalmanFilter:
    def __init__(self, A, B, H, Q, R, x0, P0):
        """
        Initialize Kalman Filter.

        Args:
            A: state transition matrix (n x n)
            B: control input matrix (n x m)
            H: measurement matrix (p x n)
            Q: process noise covariance (n x n)
            R: measurement noise covariance (p x p)
            x0: initial state estimate (n x 1)
            P0: initial covariance (n x n)
        """
        self.A = A
        self.B = B
        self.H = H
        self.Q = Q
        self.R = R
        self.x = x0.copy()
        self.P = P0.copy()

    def predict(self, u):
        """Predict step: propagate state and covariance."""
        self.x = self.A @ self.x + self.B @ u
        self.P = self.A @ self.P @ self.A.T + self.Q
        return self.x.copy()

    def update(self, z):
        """Update step: incorporate measurement."""
        y = z - self.H @ self.x                          # innovation
        S = self.H @ self.P @ self.H.T + self.R          # innovation cov
        K = self.P @ self.H.T @ np.linalg.inv(S)         # Kalman gain
        self.x = self.x + K @ y                          # state update
        I = np.eye(self.P.shape[0])
        self.P = (I - K @ self.H) @ self.P               # covariance update
        return self.x.copy()

# Example: tracking a 1D object with position and velocity
dt = 0.1
A = np.array([[1, dt],
              [0, 1]])
B = np.array([[0.5*dt**2],
              [dt]])
H = np.array([[1, 0]])   # we only measure position

Q = np.array([[1, 0],
              [0, 1]]) * 0.01    # small process noise
R = np.array([[1.0]])            # measurement noise variance

x0 = np.array([[0.0], [0.0]])
P0 = np.eye(2) * 10.0           # uncertain initial estimate

kf = KalmanFilter(A, B, H, Q, R, x0, P0)

# Simulate
np.random.seed(42)
true_pos = 0.0
true_vel = 1.0
estimates = []

for k in range(100):
    # True dynamics (constant velocity, no control input)
    true_pos += true_vel * dt
    u = np.array([[0.0]])

    # Noisy measurement
    z = np.array([[true_pos + np.random.randn() * 1.0]])

    kf.predict(u)
    est = kf.update(z)
    estimates.append(est.flatten())

estimates = np.array(estimates)
print(f"Final true position: {true_pos:.2f}")
print(f"Final estimated position: {estimates[-1, 0]:.2f}")
print(f"Final estimated velocity: {estimates[-1, 1]:.2f}")
print(f"Final covariance:\n{kf.P}")
```

### 6.6 Extended Kalman Filter (EKF)

When the system is nonlinear:

```
  x[k] = f(x[k-1], u[k-1]) + w[k-1]
  z[k] = h(x[k]) + v[k]
```

The EKF linearizes around the current estimate using Jacobians:

```
  F = df/dx |_{x_est}    (state transition Jacobian)
  H = dh/dx |_{x_pred}   (measurement Jacobian)
```

Then applies the standard Kalman filter equations with F replacing A and H replacing the measurement matrix. The EKF is the de facto standard for nonlinear estimation in robotics, though it can diverge if the nonlinearity is too strong.

### 6.7 Unscented Kalman Filter (UKF)

Instead of linearizing, the UKF propagates a set of carefully chosen **sigma points** through the nonlinear functions. This captures second-order effects that the EKF misses. The UKF is more accurate for highly nonlinear systems and avoids computing Jacobians.

---

## 7. Sensor Fusion Architectures

### 7.1 Loosely Coupled

Each sensor runs its own processing pipeline, and results are fused at a high level.

```
  IMU ──► Attitude Estimation ──►┐
                                  ├──► Fusion ──► State Estimate
  GPS ──► Position Fix ──────────►┤
                                  │
  LiDAR ──► Odometry ───────────►┘
```

**Pros:** Simple, modular, each sensor can fail independently.
**Cons:** Information loss, cannot handle correlations between sensors.

### 7.2 Tightly Coupled

Raw sensor data is fused in a single estimator.

```
  IMU raw data ──────────►┐
                           ├──► Single EKF/UKF ──► State Estimate
  Camera raw features ────►┤
                           │
  LiDAR raw points ───────►┘
```

**Pros:** No information loss, handles correlations, better accuracy.
**Cons:** Complex, single point of failure, computationally heavier.

### 7.3 Multi-Rate Fusion

Different sensors run at different rates. The Kalman filter handles this naturally:
- Run the predict step at the fastest sensor rate (often IMU at 100-1000 Hz)
- Run the update step whenever a measurement arrives (GPS at 1-10 Hz, LiDAR at 10-20 Hz)

```
  Time ──────────────────────────────────────────►
  IMU:  P P P P P P P P P P P P P P P P P P P P
  GPS:  U . . . . . . . . U . . . . . . . . . U
  LiDAR: . . U . . U . . U . . U . . U . . U .

  P = predict,  U = update
```

---

## 8. SLAM: Simultaneous Localization and Mapping

### 8.1 The Chicken-and-Egg Problem

To localize, you need a map. To build a map, you need to know where you are. SLAM solves both simultaneously.

```
  ┌──────────────────────────────────────────────┐
  │                 SLAM Problem                  │
  │                                              │
  │  Robot moves through unknown environment     │
  │  taking sensor measurements.                 │
  │                                              │
  │  Estimate simultaneously:                    │
  │  1. Robot trajectory (localization)          │
  │  2. Map of the environment (mapping)         │
  │                                              │
  │      ?                                       │
  │    Robot ──►  ?  ?  ?  ?                     │
  │      │        ?     ?     ?                  │
  │      │     ?     ?     ?                     │
  │      ▼        ?     ?                        │
  │    Landmarks with unknown positions          │
  └──────────────────────────────────────────────┘
```

### 8.2 EKF-SLAM

The classical approach augments the Kalman filter state with landmark positions:

```
  State vector: x = [robot_x, robot_y, robot_theta,
                     landmark_1_x, landmark_1_y,
                     landmark_2_x, landmark_2_y,
                     ...]
```

The covariance matrix captures correlations between robot pose and all landmarks, and between landmarks themselves.

```
  P = [ P_rr    P_rl1   P_rl2  ... ]
      [ P_rl1^T P_l1l1  P_l1l2 ... ]
      [ P_rl2^T P_l1l2^T P_l2l2 ...]
      [  ...    ...      ...    ... ]
```

**Complexity problem:** With n landmarks, the state vector is (3 + 2n) and the covariance is (3+2n) x (3+2n). Each update is O(n^2), making EKF-SLAM impractical for large environments (thousands of landmarks).

### 8.3 Graph-Based SLAM

Modern SLAM formulates the problem as a graph optimization:

```
  Pose Graph:

  x0 ────── x1 ────── x2 ────── x3
  │          │                    │
  │          │                    │
  └──────────┘────────────────────┘
       loop closure constraint

  Nodes: robot poses at different times
  Edges: constraints from odometry or loop closures
```

**Front-end:** Detects loop closures (recognizes previously visited places) and builds the graph.

**Back-end:** Optimizes all poses jointly to minimize constraint errors. This is a nonlinear least-squares problem solved with Gauss-Newton or Levenberg-Marquardt. Libraries: g2o, GTSAM, Ceres Solver.

**Advantages over EKF-SLAM:**
- Handles thousands of poses and landmarks efficiently (sparse matrix structure)
- Can re-linearize (EKF cannot revisit past linearization points)
- Naturally handles loop closures

### 8.4 Visual SLAM

Uses cameras as the primary sensor. Key variants:

**Feature-based (e.g., ORB-SLAM3):**
1. Extract visual features (ORB, SIFT, SURF) from images
2. Match features between frames to estimate motion
3. Triangulate 3D positions of features (landmarks)
4. Optimize with bundle adjustment (joint optimization of camera poses and 3D points)

**Direct methods (e.g., LSD-SLAM, DSO):**
1. Use pixel intensities directly (no feature extraction)
2. Minimize photometric error between frames
3. Build semi-dense or dense maps

**Comparison:**

```
  ┌──────────────┬───────────────────┬──────────────────┐
  │              │ Feature-based     │ Direct           │
  ├──────────────┼───────────────────┼──────────────────┤
  │ Map density  │ Sparse            │ Semi-dense/Dense │
  │ Textures     │ Needs features    │ Needs gradients  │
  │ Speed        │ Fast              │ Moderate         │
  │ Accuracy     │ Sub-pixel         │ Good             │
  │ Loop closure │ Bag of words      │ Harder           │
  └──────────────┴───────────────────┴──────────────────┘
```

### 8.5 LiDAR SLAM

Uses LiDAR scans instead of images. The front-end uses scan matching (ICP or NDT -- Normal Distributions Transform) to estimate motion between scans. The back-end is a pose graph optimizer.

Popular systems: LOAM, LeGO-LOAM, LIO-SAM (LiDAR-Inertial).

LiDAR SLAM is generally more robust than visual SLAM in textureless environments (warehouses, corridors) and varying lighting conditions, but cameras provide richer semantic information.

---

## 9. Sensor Selection Guidelines

### 9.1 Indoor Mobile Robot

```
  Typical sensor suite:
  ┌────────────────────────────────┐
  │  2D LiDAR (navigation)        │
  │  Wheel encoders (odometry)    │
  │  IMU (orientation)            │
  │  Depth camera (obstacle det.) │
  │  Bumper switches (safety)     │
  └────────────────────────────────┘
```

### 9.2 Autonomous Vehicle

```
  Typical sensor suite:
  ┌────────────────────────────────┐
  │  3D LiDAR x 1-4 (360 deg)    │
  │  Cameras x 6-12 (surround)   │
  │  Radar x 4-6 (velocity)      │
  │  IMU (high-grade)             │
  │  GNSS/RTK (absolute position) │
  │  Wheel encoders/speed sensors │
  └────────────────────────────────┘
```

### 9.3 Quadrotor / Drone

```
  Typical sensor suite:
  ┌────────────────────────────────┐
  │  IMU (attitude, 200+ Hz)      │
  │  Barometer (altitude)         │
  │  GPS (outdoor position)       │
  │  Downward camera (optical flow│
  │    for indoor hover)          │
  │  Rangefinder (ground distance)│
  └────────────────────────────────┘
```

### 9.4 Robot Arm / Manipulator

```
  Typical sensor suite:
  ┌────────────────────────────────┐
  │  Joint encoders (position)    │
  │  Joint torque sensors         │
  │  Wrist F/T sensor             │
  │  Camera (eye-in-hand or fixed)│
  │  Depth sensor (object detect.)│
  │  Tactile sensors (grasp)      │
  └────────────────────────────────┘
```

---

## 10. Practical Sensor Considerations

### 10.1 Time Synchronization

Different sensors produce data at different times. Even a few milliseconds of misalignment causes errors when fusing fast-moving data (e.g., IMU at 200 Hz with camera at 30 Hz).

**Solutions:**
- Hardware trigger (shared pulse triggers all sensors simultaneously)
- Timestamp interpolation (interpolate slower sensor to faster sensor's timestamps)
- PTP (Precision Time Protocol) for networked sensors

### 10.2 Coordinate Frame Management

Every sensor has its own coordinate frame. Transformations between frames (extrinsic calibration) must be known precisely.

```
  World Frame
      │
      ├── Robot Base Frame
      │       │
      │       ├── IMU Frame
      │       │
      │       ├── LiDAR Frame
      │       │
      │       └── Camera Frame
      │
      └── Map Frame
```

Use TF (Transform) libraries (e.g., ROS tf2) to manage these transformations. A common source of bugs is incorrect or inconsistent frame conventions (e.g., x-forward vs. z-forward, left-hand vs. right-hand coordinates).

### 10.3 Outlier Rejection

Sensors occasionally produce grossly wrong measurements (reflections, multipath, occlusions). The Kalman filter assumes Gaussian noise and is not robust to outliers.

**Solutions:**
- **Mahalanobis distance gating:** Reject measurements whose innovation exceeds a threshold: `d^2 = y^T S^(-1) y > chi2_threshold`
- **RANSAC:** Fit models to random subsets, keep the best fit
- **M-estimators:** Replace squared error with robust cost functions (Huber, Tukey)

---

## Interview Questions

**Q1: How does an accelerometer work, and why does it read 9.81 m/s^2 when sitting still on a table?**

A MEMS accelerometer measures the displacement of a proof mass on a spring. It measures specific force (all forces except gravity divided by mass). On a table, the normal force pushes the proof mass upward at 1g. The accelerometer cannot distinguish gravity from acceleration (equivalence principle), so it reads +9.81 m/s^2 upward.

**Q2: Explain gyroscope bias drift and its implications for dead reckoning.**

A gyroscope has a small constant offset (bias) that changes slowly over time. When you integrate angular rate to get angle, this bias accumulates linearly: after t seconds, the angle error is approximately `bias * t`. For a MEMS gyro with 1 deg/hr bias, after 1 hour you have 1 degree of heading error. This is why gyroscopes alone are insufficient for long-term navigation and must be fused with other sensors.

**Q3: Describe the Kalman filter algorithm and explain what the Kalman gain represents.**

The KF has two steps: (1) Predict: propagate state and covariance forward using the model. (2) Update: incorporate the measurement using the Kalman gain. The Kalman gain K represents the optimal weighting between the prediction and the measurement. When K is near 1, we trust the measurement; when near 0, we trust the prediction. It is determined by the ratio of prediction uncertainty to total uncertainty (prediction + measurement).

**Q4: What is the difference between EKF and UKF?**

The EKF linearizes the nonlinear model using Jacobians (first-order Taylor expansion). The UKF propagates sigma points through the full nonlinear model and reconstructs the mean and covariance from the propagated points. The UKF captures second-order effects, does not require Jacobian computation, and is more accurate for highly nonlinear systems. However, the EKF is simpler and computationally cheaper.

**Q5: Explain the pinhole camera model and what camera calibration determines.**

The pinhole model projects 3D points to 2D pixels using perspective projection: u = fx * X/Z + cx, v = fy * Y/Z + cy. Calibration determines the intrinsic parameters (focal lengths fx, fy, principal point cx, cy, and distortion coefficients) and optionally extrinsic parameters (position and orientation relative to some reference frame). It is typically done using a checkerboard pattern with known geometry.

**Q6: How does stereo vision compute depth? What limits its effective range?**

Stereo vision uses two cameras with known baseline b. For a point visible in both cameras, the disparity d = u_left - u_right relates to depth Z by Z = f*b/d. The effective range is limited by disparity resolution: at large distances, disparity approaches zero and quantization noise dominates. A wider baseline increases range but narrows the overlap region.

**Q7: Compare LiDAR and cameras for autonomous driving. Why use both?**

LiDAR provides accurate 3D geometry, works in any lighting, and directly measures distance. But it is expensive, sparse, and cannot read signs or traffic lights. Cameras are cheap, provide rich texture and color, and can recognize objects semantically. But they struggle with depth estimation and in poor lighting. Together, they complement each other: LiDAR for geometry, cameras for semantics.

**Q8: What is SLAM and why is it hard?**

SLAM (Simultaneous Localization and Mapping) estimates the robot's trajectory and a map of the environment jointly from sensor data. It is hard because: (1) errors in localization corrupt the map, and map errors corrupt localization (coupled problem), (2) the state space grows with the environment size, (3) loop closure detection must be robust to avoid catastrophic map corruption, and (4) real-time performance is required.

**Q9: Explain the difference between EKF-SLAM and graph-based SLAM.**

EKF-SLAM maintains a single Gaussian over all robot poses and landmarks, updated sequentially. Its covariance matrix is dense and O(n^2) per update, limiting it to small environments. Graph-based SLAM stores poses as nodes and constraints as edges, then optimizes all poses jointly using sparse nonlinear least squares. It is more scalable, can re-linearize, and handles loop closures naturally.

**Q10: What is the complementary filter and when would you use it instead of a Kalman filter?**

A complementary filter combines a high-pass-filtered gyroscope signal with a low-pass-filtered accelerometer signal: `angle = alpha * (angle + gyro*dt) + (1-alpha) * accel_angle`. It is simpler than a Kalman filter, requires no matrix operations, and works well for attitude estimation on resource-constrained embedded systems. Use it when computational resources are limited and the system is relatively simple.

**Q11: How do you handle sensor data arriving at different rates in a Kalman filter?**

Run the predict step at the highest rate (typically the IMU rate). When a measurement from a slower sensor arrives, run the update step with that sensor's measurement model. The covariance naturally grows during predict-only steps and shrinks during updates. This multi-rate approach is standard in robotics.

**Q12: What is ICP and when does it fail?**

Iterative Closest Point aligns two point clouds by iteratively finding nearest-neighbor correspondences and computing the optimal rigid transformation. It fails when: (1) the initial guess is too far off (converges to local minimum), (2) the environment is symmetric or featureless (ambiguous correspondences), (3) there is significant occlusion or partial overlap, or (4) the point clouds have very different densities.

**Q13: Explain the concept of observability in the context of sensor fusion. Give an example of an unobservable state.**

A state is observable if it can be determined from the sensor measurements and the known model. In IMU-only navigation, the absolute position is unobservable because the accelerometer measures relative acceleration (integrated twice for position, errors grow unboundedly). Adding GPS makes position observable. Similarly, magnetometer-free IMU systems cannot observe heading (yaw) from accelerometer and gyroscope alone, only pitch and roll.

**Q14: What is outlier rejection and why is it important for sensor fusion?**

Outliers are grossly incorrect measurements (e.g., LiDAR multipath, GPS multipath, camera feature mismatches). The Kalman filter assumes Gaussian noise and is not robust to outliers -- a single bad measurement can corrupt the state estimate. Outlier rejection (Mahalanobis gating, RANSAC, robust cost functions) identifies and discards these measurements before they enter the filter.

**Q15: Describe a complete sensor fusion pipeline for a mobile robot navigating indoors.**

(1) IMU provides high-rate predictions (200 Hz) of orientation and acceleration. (2) Wheel encoders provide odometry at 50-100 Hz, correcting for IMU drift. (3) A 2D LiDAR provides scan-matching-based pose updates at 10-40 Hz. (4) An EKF or factor graph fuses all sources. (5) The LiDAR scans are also used for SLAM to build and update a 2D occupancy grid map. (6) Mahalanobis gating rejects outlier measurements. (7) The fused pose estimate is published at the IMU rate for smooth control.
