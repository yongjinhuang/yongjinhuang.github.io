# Chapter 3: Classical Control Theory -- Making Robots Obey

> A robot's kinematics tells us where it _should_ go. Control theory tells us how
> to _make_ it go there -- and stay there -- in the presence of disturbances,
> model errors, and physical limitations. This chapter covers the classical
> (frequency-domain) control toolkit that every robotics engineer must master.

---

## 1. Open-Loop vs. Closed-Loop Control

### 1.1 Open-Loop Control

Apply a pre-computed input and hope for the best. No feedback, no correction.

```
  Reference ---> [Controller] ---> [Plant] ---> Output
       r(t)          u(t)           y(t)
```

Example: sending a fixed PWM signal to a motor to rotate "about 90 degrees."

Problems:

- No correction for disturbances (friction, load changes).
- No way to know if the output matches the reference.
- Accuracy depends entirely on model fidelity.

### 1.2 Closed-Loop (Feedback) Control

Measure the output, compare it to the reference, and adjust the input.

```
  Reference ---> [+] ---> [Controller] ---> [Plant] ---> Output
       r(t)      |   e(t)      u(t)           y(t)       |
                 |                                        |
                 +---------- [Sensor] <-------------------+
                      -y(t)
```

The error signal e(t) = r(t) - y(t) drives the controller. This is the
foundation of all practical control systems.

### 1.3 Why Feedback?

| Property              | Open-Loop       | Closed-Loop         |
| --------------------- | --------------- | ------------------- |
| Disturbance rejection | None            | Automatic           |
| Sensitivity to model  | High            | Reduced             |
| Stability risk        | Low             | Can become unstable |
| Complexity            | Simple          | More complex        |
| Accuracy              | Model-dependent | Can be very high    |

The fundamental trade-off: feedback improves performance but introduces the
possibility of instability. The rest of this chapter is about navigating that
trade-off.

---

## 2. Transfer Functions and the Laplace Transform

### 2.1 The Laplace Transform

The Laplace transform converts a time-domain signal f(t) into a complex
frequency-domain function F(s), where s = sigma + j\*omega:

```
F(s) = integral from 0 to infinity of f(t) * e^{-st} dt
```

Key transforms:

| Time domain f(t) | Laplace domain F(s)   |
| ---------------- | --------------------- |
| delta(t)         | 1                     |
| step u(t)        | 1/s                   |
| e^{-at}          | 1/(s+a)               |
| t \* e^{-at}     | 1/(s+a)^2             |
| sin(omega\*t)    | omega/(s^2 + omega^2) |
| cos(omega\*t)    | s/(s^2 + omega^2)     |

### 2.2 Transfer Functions

For a linear time-invariant (LTI) system, the transfer function G(s) relates the
Laplace transform of the output Y(s) to the input U(s):

```
G(s) = Y(s) / U(s) = (b_m * s^m + ... + b_1 * s + b_0)
                      / (a_n * s^n + ... + a_1 * s + a_0)
```

The **poles** (roots of the denominator) determine stability and transient
behavior. The **zeros** (roots of the numerator) shape the frequency response.

### 2.3 Example: DC Motor Model

A DC motor with inertia J, damping b, and torque constant K:

```
             K
G(s) = ---------------
        J*s^2 + b*s
```

Poles at s = 0 and s = -b/J. The pole at the origin means the motor is an
integrator (angular position accumulates with constant torque).

```python
import numpy as np

# Python: using the control systems library
# pip install control
import control

# DC motor parameters
J = 0.01    # inertia (kg*m^2)
b = 0.1     # damping (N*m*s)
K = 0.01    # torque constant (N*m/A)

# Transfer function: theta(s) / V(s)
num = [K]
den = [J, b, 0]  # J*s^2 + b*s + 0

motor_tf = control.tf(num, den)
print("Motor TF:", motor_tf)
print("Poles:", control.poles(motor_tf))
```

---

## 3. PID Control

### 3.1 The PID Controller

The most widely used controller in industry. Three terms, each addressing a
different aspect of the error:

```
u(t) = Kp * e(t) + Ki * integral(e(τ)dτ) + Kd * de(t)/dt
```

```
                    +--------+
          e(t)      |        |
   +----->[ Kp ]--->|        |
   |                |        |
   +----->[ Ki ]----| Summer |----> u(t)
   |      [∫dt ]    |        |
   |                |        |
   +----->[ Kd ]--->|        |
          [d/dt]    |        |
                    +--------+
```

In the Laplace domain:

```
C(s) = Kp + Ki/s + Kd*s

     = (Kd*s^2 + Kp*s + Ki) / s
```

### 3.2 What Each Term Does

| Term | Response to...       | Effect                        | Pathology if too high    |
| ---- | -------------------- | ----------------------------- | ------------------------ |
| P    | Current error        | Fast response, proportional   | Oscillation              |
| I    | Accumulated error    | Eliminates steady-state error | Windup, slow oscillation |
| D    | Rate of error change | Damping, predictive           | Noise amplification      |

### 3.3 Intuitive Understanding

Imagine parking a car at a specific spot:

- **P (Proportional)**: The further you are from the spot, the harder you press
  the gas. Problem: you might overshoot.

- **I (Integral)**: If you have been sitting slightly off the spot for a while
  (maybe on a hill), gradually increase force. Eliminates the steady-state error
  from the hill's gravity.

- **D (Derivative)**: As you approach the spot quickly, start braking. Prevents
  overshoot by anticipating the future error.

### 3.4 Python: PID Controller

```python
class PIDController:
    """Discrete PID controller with anti-windup."""

    def __init__(
        self,
        kp: float,
        ki: float,
        kd: float,
        dt: float,
        output_limits: tuple[float, float] = (-float('inf'), float('inf')),
    ):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.dt = dt
        self.output_limits = output_limits

        self._integral = 0.0
        self._prev_error = 0.0
        self._initialized = False

    def compute(self, setpoint: float, measurement: float) -> float:
        error = setpoint - measurement

        # Proportional term
        p_term = self.kp * error

        # Integral term with clamping anti-windup
        self._integral += error * self.dt
        i_term = self.ki * self._integral

        # Derivative term (on error; alternatively on measurement)
        if not self._initialized:
            d_term = 0.0
            self._initialized = True
        else:
            d_term = self.kd * (error - self._prev_error) / self.dt

        self._prev_error = error

        # Compute output
        output = p_term + i_term + d_term

        # Clamp output and apply anti-windup
        lo, hi = self.output_limits
        if output > hi:
            output = hi
            self._integral -= error * self.dt  # undo integration
        elif output < lo:
            output = lo
            self._integral -= error * self.dt

        return output

    def reset(self) -> None:
        self._integral = 0.0
        self._prev_error = 0.0
        self._initialized = False
```

### 3.5 Simulating a PID-Controlled System

```python
def simulate_pid(
    plant_tf: control.TransferFunction,
    pid: PIDController,
    setpoint: float,
    t_final: float,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Simulate a PID controller driving a continuous plant.
    Uses Euler integration for simplicity.
    """
    dt = pid.dt
    n_steps = int(t_final / dt)
    times = np.linspace(0, t_final, n_steps)
    outputs = np.zeros(n_steps)

    # Convert TF to state-space for simulation
    ss = control.tf2ss(plant_tf)
    A, B, C, D = ss.A, ss.B, ss.C, ss.D
    x = np.zeros((A.shape[0], 1))

    for i in range(n_steps):
        y = float(C @ x + D * 0)
        outputs[i] = y

        u = pid.compute(setpoint, y)

        # State update (Euler)
        x = x + dt * (A @ x + B * u)

    return times, outputs
```

---

## 4. PID Tuning: Ziegler-Nichols Method

### 4.1 The Ultimate Gain Method

A systematic procedure for finding initial PID gains:

1. Set Ki = 0 and Kd = 0.
2. Increase Kp from zero until the system oscillates with constant amplitude.
   This is the **ultimate gain** Ku.
3. Measure the **ultimate period** Tu of the oscillation.
4. Set PID gains from the table:

```
Controller |   Kp      |   Ki          |   Kd
-----------+-----------+---------------+------------
P          | 0.5 * Ku  |   --          |   --
PI         | 0.45 * Ku | 0.54*Ku/Tu    |   --
PID        | 0.6 * Ku  | 1.2*Ku/Tu     | 0.075*Ku*Tu
```

### 4.2 Step Response

```
  output
     ^
     |          _____________________
     |         /                       setpoint
     |        / overshoot
     |   ____/  |
     |  /    \  v
     | /      \___/  <-- settling
     |/
     +--------------------------------> time
         |   |     |
       rise  peak  settling
       time  time  time
```

Key metrics:

- **Rise time**: time to first reach the setpoint.
- **Overshoot**: how far past the setpoint the output goes (as a percentage).
- **Settling time**: time until the output stays within a band (e.g., 2%) of the
  setpoint.
- **Steady-state error**: final offset from the setpoint.

### 4.3 Python: Ziegler-Nichols Tuning

```python
def ziegler_nichols_pid(Ku: float, Tu: float) -> tuple[float, float, float]:
    """
    Compute PID gains using Ziegler-Nichols ultimate gain method.
    Returns (Kp, Ki, Kd).
    """
    kp = 0.6 * Ku
    ki = 1.2 * Ku / Tu
    kd = 0.075 * Ku * Tu
    return kp, ki, kd

# Example: Ku = 10, Tu = 0.5 seconds
kp, ki, kd = ziegler_nichols_pid(10.0, 0.5)
print(f"Kp={kp}, Ki={ki}, Kd={kd}")
# Kp=6.0, Ki=24.0, Kd=0.375
```

### 4.4 Practical Tuning Tips

Ziegler-Nichols gives a starting point, but manual refinement is almost always
needed:

1. Start with P-only control. Increase Kp until response is fast but oscillatory.
2. Add D to damp oscillations. Increase Kd until overshoot is acceptable.
3. Add I to eliminate steady-state error. Keep Ki small to avoid windup.
4. If the system has significant delay, reduce all gains.
5. Always test with realistic disturbances, not just step responses.

---

## 5. Stability Analysis

### 5.1 BIBO Stability

A system is **Bounded-Input Bounded-Output (BIBO) stable** if every bounded input
produces a bounded output. For an LTI system, this holds if and only if all poles
of the transfer function have **negative real parts** (lie in the left half of the
s-plane).

```
  Imaginary (jω)
       ^
       |
   X   |        X = unstable pole (right half-plane)
       |
  --O--+---------->  Real (σ)
       |
   O   |        O = stable pole (left half-plane)
       |
```

### 5.2 Routh-Hurwitz Criterion

A quick algebraic test for stability _without_ computing the poles. Given the
characteristic polynomial:

```
a_n * s^n + a_{n-1} * s^{n-1} + ... + a_1 * s + a_0 = 0
```

Construct the **Routh array**:

```
s^n    |  a_n     a_{n-2}   a_{n-4}  ...
s^{n-1}|  a_{n-1} a_{n-3}   a_{n-5}  ...
s^{n-2}|  b_1     b_2       b_3      ...
s^{n-3}|  c_1     c_2       c_3      ...
  ...      ...
s^0    |  ...
```

where:

```
b_1 = (a_{n-1} * a_{n-2} - a_n * a_{n-3}) / a_{n-1}
```

**Criterion**: The system is stable if and only if all elements in the **first
column** of the Routh array are positive (assuming a_n > 0). The number of sign
changes equals the number of right-half-plane poles.

### 5.3 Example: Is This System Stable?

```
G(s) = 1 / (s^3 + 6s^2 + 11s + 6)
```

Characteristic polynomial: s^3 + 6s^2 + 11s + 6

Routh array:

```
s^3  |  1    11
s^2  |  6     6
s^1  |  (6*11 - 1*6)/6 = 60/6 = 10
s^0  |  6
```

First column: 1, 6, 10, 6 -- all positive. System is stable.

(The poles are s = -1, -2, -3, confirming stability.)

```python
import control

# Verify with Python
sys = control.tf([1], [1, 6, 11, 6])
poles = control.poles(sys)
print("Poles:", poles)
print("Stable:", all(p.real < 0 for p in poles))
```

---

## 6. Frequency Response and Bode Plots

### 6.1 Frequency Response

The **frequency response** G(j*omega) of a system describes how it responds to
sinusoidal inputs at different frequencies. Evaluate the transfer function along
the imaginary axis (s = j*omega):

- **Magnitude** |G(j\*omega)|: how much the input amplitude is scaled.
- **Phase** angle(G(j\*omega)): how much the output is shifted in time.

### 6.2 Bode Plots

Two plots stacked vertically:

1. **Magnitude plot**: 20\*log10(|G(jw)|) in dB vs. log(omega).
2. **Phase plot**: angle(G(jw)) in degrees vs. log(omega).

```
  Magnitude (dB)
     20 |----\
      0 |     -----\
    -20 |           -----\
    -40 |                 -----\
        +---+---+---+---+---+---> log(ω)
       0.1  1   10  100 1000

  Phase (degrees)
      0 |--------\
    -45 |         -----\
    -90 |               -----\
   -135 |                     -----\
   -180 |                           ---
        +---+---+---+---+---+-------> log(ω)
       0.1  1   10  100 1000
```

### 6.3 Gain Margin and Phase Margin

These are the two most important stability metrics for a feedback system.

**Phase margin (PM)**: How much additional phase lag the system can tolerate
before becoming unstable. Measured at the **gain crossover frequency** (where
|G(jw)| = 0 dB):

```
PM = 180° + angle(G(j*w_gc))
```

**Gain margin (GM)**: How much the gain can increase before instability. Measured
at the **phase crossover frequency** (where angle(G(jw)) = -180 degrees):

```
GM = -20*log10(|G(j*w_pc)|) dB
```

```
  Magnitude (dB)
      |
   0 dB ---*--- gain crossover (ω_gc)
      |    |         \
      |    |          -----
      |    |    gain margin
      |    |     ↕
      |    +-- phase crossover (ω_pc)
      +-------------------------> log(ω)

  Phase (degrees)
      |
      |    phase margin
      |     ↕
  -180° ---+------- phase crossover
      |         |
      |         *--- gain crossover
      +-------------------------> log(ω)
```

**Rules of thumb** for good design:

- Phase margin > 45 degrees (60 degrees is excellent).
- Gain margin > 6 dB (12 dB is excellent).

### 6.4 Python: Bode Plot and Margins

```python
import control
import numpy as np

# Open-loop transfer function: controller * plant
Kp, Ki, Kd = 6.0, 24.0, 0.375
C = control.tf([Kd, Kp, Ki], [1, 0])  # PID in TF form

J, b_val, K_val = 0.01, 0.1, 0.01
P = control.tf([K_val], [J, b_val, 0])

L = C * P  # Open-loop transfer function

# Compute margins
gm, pm, wgc, wpc = control.margin(L)
print(f"Gain Margin: {20*np.log10(gm):.1f} dB at {wpc:.2f} rad/s")
print(f"Phase Margin: {pm:.1f}° at {wgc:.2f} rad/s")

# Generate Bode plot data (for programmatic use)
mag, phase, omega = control.bode(L, plot=False)
```

---

## 7. Root Locus

### 7.1 Concept

The **root locus** plots the trajectories of the closed-loop poles as a single
parameter (usually the gain K) varies from 0 to infinity.

For the standard feedback configuration:

```
             K * G(s)
T(s) = ---------------
        1 + K * G(s)
```

The closed-loop poles are the roots of: 1 + K \* G(s) = 0.

### 7.2 Key Rules for Sketching

1. **Starting points** (K=0): open-loop poles.
2. **Ending points** (K->infinity): open-loop zeros (or infinity).
3. **Number of branches**: equals the number of open-loop poles.
4. **Real-axis segments**: to the left of an odd number of real-axis poles+zeros.
5. **Asymptotes**: (n-m) branches go to infinity along asymptotes at angles
   (2k+1)\*180/(n-m) degrees, where n = number of poles, m = number of zeros.

### 7.3 ASCII Root Locus Example

For G(s) = 1 / (s(s+2)):

```
  Imaginary
     ^
     |        X (K=0, pole at -2)
     |
     |    <---*---------O (K=0, pole at 0)
     |        |
     |        | (branches move toward each other on real axis)
     |        |
     |     *--+--*  (breakaway at s=-1, then go to ±j∞)
     |    /   |   \
     |   /    |    \
     +---+----+----+----> Real
    -3  -2   -1    0

  As K increases from 0:
  - Two poles start at 0 and -2
  - They meet at -1 (breakaway point)
  - Then split vertically toward ±j∞
```

### 7.4 Python: Root Locus

```python
import control
import numpy as np

# Plant: G(s) = 1 / (s * (s + 2))
G = control.tf([1], [1, 2, 0])

# Compute root locus data
rlist, klist = control.root_locus(G, plot=False)

# Find the gain K that places poles at desired locations
# For example, find K for damping ratio zeta = 0.5
# Using the angle condition or numerical search
for k_val in [0.5, 1.0, 2.0, 5.0, 10.0]:
    cl = control.feedback(k_val * G, 1)
    poles = control.poles(cl)
    print(f"K={k_val:5.1f} -> poles: {poles}")
```

---

## 8. Nyquist Criterion

### 8.1 The Nyquist Plot

A Nyquist plot is a parametric plot of G(j\*omega) in the complex plane as omega
goes from -infinity to +infinity (or equivalently, from 0 to infinity with the
reflection).

```
  Imaginary
     ^
     |    .  .  .
     |   .        .
     |  .    Nyquist   .
     | .     contour     .
     |.                   .
  ---+----------*---------+---> Real
     |        (-1,0)     .
     | .                .
     |  .             .
     |   .  .  .  .
```

### 8.2 The Nyquist Stability Criterion

For an open-loop transfer function L(s) = C(s)\*G(s):

```
Z = N + P

where:
  Z = number of unstable closed-loop poles
  N = number of clockwise encirclements of the point (-1, 0)
  P = number of unstable open-loop poles
```

For stability, we need Z = 0, so N = -P. If the open loop is stable (P = 0),
the Nyquist contour must not encircle (-1, 0).

### 8.3 Connection to Gain and Phase Margin

The gain margin is the reciprocal of the distance from the origin to the point
where the Nyquist plot crosses the negative real axis. The phase margin is the
angle from the negative real axis to the point where the Nyquist plot crosses the
unit circle.

```python
import control

L = control.tf([10], [1, 3, 3, 1])  # Example open-loop TF

# Compute Nyquist plot data
contour = control.nyquist_response(L)
```

---

## 9. Closed-Loop Transfer Functions

### 9.1 Standard Feedback Configuration

```
  R(s) -->[+]--> C(s) ---> G(s) ---+--> Y(s)
           ^-                      |
           |                       |
           +----- H(s) <-----------+
```

**Closed-loop transfer function** (reference to output):

```
T(s) = C(s)*G(s) / (1 + C(s)*G(s)*H(s))
```

For unity feedback (H(s) = 1):

```
T(s) = C(s)*G(s) / (1 + C(s)*G(s))
```

### 9.2 Sensitivity and Complementary Sensitivity

**Sensitivity function** S(s): how disturbances at the output affect the output.

```
S(s) = 1 / (1 + L(s))     where L(s) = C(s)*G(s)
```

**Complementary sensitivity** T(s) = L(s) / (1 + L(s)).

Note: S(s) + T(s) = 1 at all frequencies. You cannot make both small
simultaneously -- this is a fundamental limitation of feedback control (Bode's
sensitivity integral).

### 9.3 Disturbance Rejection

```
  R(s) -->[+]--> C(s) -->[+]--> G(s) ---+--> Y(s)
           ^-             ^+             |
           |              D(s)           |
           |        (disturbance)        |
           +-----------------------------+
```

The effect of disturbance D(s) on output:

```
Y_d(s) = G(s) / (1 + C(s)*G(s)) * D(s) = S(s) * G(s) * D(s)
```

High loop gain (large |L(jw)|) makes S small, rejecting disturbances. This is
the primary benefit of feedback.

---

## 10. Practical Considerations

### 10.1 Integral Windup

When the actuator saturates, the integral term continues to accumulate error,
leading to large overshoot when the saturation ends.

```
  output
     ^
  sat+|=======___________________
     |       /  overshoot from windup
     |      /
     |     /
     |    /
     |___/
     +--------------------------------> time
```

**Solutions**:

- **Clamping**: stop integrating when output is saturated (shown in the PID code
  above).
- **Back-calculation**: reduce the integral by the difference between the desired
  and actual (saturated) output.

### 10.2 Derivative Kick

A step change in the setpoint causes a spike in the derivative term (de/dt is
infinite for a step). Solutions:

- **Derivative on measurement**: differentiate -y(t) instead of e(t). The
  measurement changes smoothly even when the setpoint steps.
- **Filtered derivative**: D(s) = Kd _ s / (1 + tau_f _ s), where tau_f is a
  small filter time constant.

### 10.3 Discretization

Real controllers run on digital computers with a fixed sample rate. Key concerns:

- **Sample rate**: must be at least 10-20x the system bandwidth (Nyquist is the
  bare minimum; in practice, much higher is needed for good performance).
- **Tustin (bilinear) transform**: maps s-domain to z-domain while preserving
  frequency response:
  ```
  s = (2/T) * (z - 1) / (z + 1)
  ```
- **ZOH (zero-order hold)**: assumes the control signal is held constant between
  samples.

```python
def discretize_pid_tustin(
    kp: float, ki: float, kd: float, dt: float
) -> tuple[np.ndarray, np.ndarray]:
    """
    Discretize a PID controller using the Tustin (bilinear) method.
    Returns (numerator_coeffs, denominator_coeffs) for the z-domain TF.
    """
    # Continuous PID: C(s) = Kp + Ki/s + Kd*s
    # Apply Tustin transform: s = (2/dt) * (z-1)/(z+1)

    a0 = kp + ki * dt / 2 + 2 * kd / dt
    a1 = ki * dt - 4 * kd / dt
    a2 = -kp + ki * dt / 2 + 2 * kd / dt

    # C(z) = (a0 + a1*z^{-1} + a2*z^{-2}) / (1 - z^{-2})
    num = np.array([a0, a1, a2])
    den = np.array([1, 0, -1])

    return num, den
```

### 10.4 Cascade (Inner/Outer Loop) Control

In robotics, a common architecture is cascaded loops:

```
  Position  --> [Pos   ] --> Velocity --> [Vel    ] --> Torque --> [Motor]
  reference     [Ctrl  ]    reference     [Ctrl   ]    command     [Plant]
                (outer)                   (inner)
                  |                          |
                  +<-- position feedback     +<-- velocity feedback
```

- **Inner loop** (velocity/torque): fast, high bandwidth, handles disturbances.
- **Outer loop** (position): slower, sets the reference for the inner loop.

Rule: the inner loop should be ~5-10x faster than the outer loop.

---

## 11. Putting It All Together: PID for a Robot Joint

```python
import control
import numpy as np

# ----- Plant Model: DC motor driving a robot joint -----
J = 0.5       # joint + motor inertia (kg*m^2)
b = 0.2       # viscous friction (N*m*s/rad)
Kt = 0.1      # torque constant (N*m/A)
R_motor = 1.0 # motor resistance (Ohm)
L_motor = 0.01  # motor inductance (H) -- often neglected

# Simplified model (neglect inductance):
# theta(s) / V(s) = Kt / (s * (J*s + b) * R + Kt^2)
#                 ≈ Kt / (R * J * s^2 + R * b * s)  for small Kt^2

num_plant = [Kt]
den_plant = [R_motor * J, R_motor * b, 0]  # includes integrator
plant = control.tf(num_plant, den_plant)

# ----- Ziegler-Nichols Tuning -----
# Find ultimate gain by increasing Kp until sustained oscillation
# (In practice, use simulation or experiment)
Ku = 150.0   # ultimate gain (found experimentally)
Tu = 0.3     # ultimate period (seconds)

kp = 0.6 * Ku
ki = 1.2 * Ku / Tu
kd = 0.075 * Ku * Tu

print(f"ZN gains: Kp={kp:.1f}, Ki={ki:.1f}, Kd={kd:.3f}")

# ----- Build PID Transfer Function -----
pid = control.tf([kd, kp, ki], [1, 0])

# ----- Open-Loop and Closed-Loop Analysis -----
L = pid * plant  # open-loop
T = control.feedback(L, 1)  # closed-loop (unity feedback)

# Check stability margins
gm, pm, wgc, wpc = control.margin(L)
print(f"Gain Margin: {20*np.log10(gm):.1f} dB")
print(f"Phase Margin: {pm:.1f}°")

# Step response
t = np.linspace(0, 2, 1000)
t_out, y_out = control.step_response(T, T=t)

# Find rise time, overshoot, settling time
y_final = y_out[-1]
overshoot = (max(y_out) - y_final) / y_final * 100
rise_idx = np.argmax(y_out >= 0.9 * y_final)
rise_time = t_out[rise_idx]

settle_band = 0.02 * y_final
settled = np.where(np.abs(y_out - y_final) > settle_band)[0]
settling_time = t_out[settled[-1]] if len(settled) > 0 else t_out[-1]

print(f"Rise time: {rise_time:.3f}s")
print(f"Overshoot: {overshoot:.1f}%")
print(f"Settling time: {settling_time:.3f}s")
```

---

## 12. Beyond PID: A Brief Look Ahead

Classical PID and frequency-domain methods form the foundation, but modern
robotics increasingly uses:

| Method                    | When to use                              |
| ------------------------- | ---------------------------------------- |
| State-space / LQR         | Multi-input, multi-output (MIMO) systems |
| Model Predictive Control  | Constraints, preview of future reference |
| Adaptive control          | Unknown or changing plant parameters     |
| Robust control (H-inf)    | Guaranteed performance with uncertainty  |
| Computed torque control   | Nonlinear robot dynamics compensation    |
| Impedance/admittance ctrl | Contact tasks, human-robot interaction   |

These are the subject of future chapters.

---

## Interview Questions

**Q1.** Explain the difference between open-loop and closed-loop control. Why is
feedback essential in robotics?

> **A:** Open-loop applies a pre-computed input with no measurement feedback.
> Closed-loop measures the output and adjusts the input to reduce error. Feedback
> is essential in robotics because real systems have disturbances (friction, load
> changes, external forces), model inaccuracies, and noise that open-loop control
> cannot compensate for.

**Q2.** What does each term in a PID controller do? What happens if you only use
proportional control?

> **A:** P provides response proportional to current error (fast but may have
> steady-state error and oscillation). I accumulates past error to eliminate
> steady-state offset. D responds to the rate of error change, providing damping.
> P-only control will have steady-state error for step disturbances or reference
> changes in type-0 systems, and may oscillate if the gain is too high.

**Q3.** Explain the Ziegler-Nichols ultimate gain tuning method.

> **A:** Set Ki=Kd=0, increase Kp until sustained oscillation occurs. Record the
> critical gain Ku and oscillation period Tu. Then set Kp=0.6*Ku, Ki=1.2*Ku/Tu,
> Kd=0.075*Ku*Tu. This gives an aggressive starting point that usually requires
> manual refinement.

**Q4.** What is integral windup and how do you prevent it?

> **A:** When the actuator saturates, the integral term continues to grow because
> the error is not being reduced. When saturation ends, the large integral causes
> excessive overshoot. Prevention: clamping (stop integrating during saturation)
> or back-calculation (reduce integral based on the saturation amount).

**Q5.** What is the Routh-Hurwitz criterion and when would you use it?

> **A:** It is an algebraic test for stability based on the coefficients of the
> characteristic polynomial. You construct a Routh array and check the first
> column for sign changes -- each sign change indicates one right-half-plane pole.
> Use it when you need a quick stability check without computing the actual poles,
> especially for parametric analysis.

**Q6.** Explain gain margin and phase margin. What values indicate a
well-designed system?

> **A:** Gain margin: how much the loop gain can increase before instability
> (measured in dB at the phase crossover frequency). Phase margin: how much
> additional phase lag the system can tolerate (measured in degrees at the gain
> crossover frequency). Good design: PM > 45 degrees, GM > 6 dB.

**Q7.** Draw a Bode plot for G(s) = 10 / (s + 1)(s + 10). What are the key
features?

> **A:** DC gain = 10/(1\*10) = 1 = 0 dB. Two poles at s=-1 (break at 1 rad/s)
> and s=-10 (break at 10 rad/s). Magnitude: flat at 0 dB until 1 rad/s, then
> -20 dB/decade, then -40 dB/decade after 10 rad/s. Phase: starts at 0 degrees,
> -45 degrees at 1 rad/s, -90 degrees between the breaks, -135 degrees at 10
> rad/s, approaches -180 degrees at high frequency.

**Q8.** What is the Nyquist stability criterion? How does it differ from
Routh-Hurwitz?

> **A:** Nyquist uses the frequency response (Nyquist plot) of the open-loop
> transfer function: Z = N + P (encirclements of -1 plus open-loop unstable
> poles = closed-loop unstable poles). Unlike Routh-Hurwitz, it works directly
> with frequency response data (which can be measured experimentally), handles
> time delays naturally, and provides gain/phase margin information visually.

**Q9.** Why is the derivative term problematic in practice? How do you address
this?

> **A:** Pure differentiation amplifies high-frequency noise, and step changes
> in setpoint cause "derivative kick" (infinite derivative). Solutions:
> differentiate the measurement instead of the error, add a low-pass filter on
> the derivative term (D(s) = Kd*s / (1 + tau_f*s)), and ensure adequate sensor
> filtering.

**Q10.** Explain cascaded (inner/outer loop) control and why it is used in
robotics.

> **A:** An inner loop controls a fast variable (velocity or current/torque) and
> an outer loop controls a slower variable (position). The inner loop rejects
> disturbances quickly and linearizes the plant as seen by the outer loop. The
> inner loop must be ~5-10x faster than the outer loop. This is the standard
> architecture for industrial robot joint controllers.

**Q11.** What is the sensitivity function S(s) and what fundamental limitation
does it impose?

> **A:** S(s) = 1/(1+L(s)) describes how disturbances and noise affect the
> output. S(s) + T(s) = 1, where T is the complementary sensitivity. Bode's
> sensitivity integral shows that reducing sensitivity at some frequencies must
> increase it at others (you cannot make S small everywhere). This is the
> "waterbed effect."

**Q12.** How do you discretize a continuous-time PID controller? What sample rate
do you need?

> **A:** Use the Tustin (bilinear) transform s = (2/T)(z-1)/(z+1) or zero-order
> hold. The sample rate should be 10-20x the closed-loop bandwidth for good
> performance. Too slow: poor performance, potential instability. Too fast:
> unnecessary computation, noise amplification in the derivative term.

**Q13.** What does the root locus tell you? How do you use it for design?

> **A:** The root locus shows how closed-loop pole locations change with a
> parameter (usually gain K). You use it to select a gain that places poles in
> desired locations -- for example, within a region of the s-plane that meets
> damping ratio and natural frequency requirements. Branches start at open-loop
> poles and end at zeros or infinity.

**Q14.** A robot joint overshoots its target and oscillates before settling. Which
PID term would you adjust first and in which direction?

> **A:** Increase Kd (derivative gain) first to add damping. If oscillations
> persist, reduce Kp. If there is steady-state error after damping the
> oscillations, then carefully increase Ki. Reducing Ki can also help if the
> oscillation is slow (indicative of integral-driven instability).

**Q15.** Explain the difference between stability in the sense of Lyapunov and
BIBO stability. When does it matter?

> **A:** BIBO stability requires bounded output for bounded input and applies to
> input-output models (transfer functions). Lyapunov stability considers the
> internal state trajectory: a state is stable if nearby trajectories stay near
> it. For minimal (controllable and observable) systems, they are equivalent. It
> matters when there are hidden (unobservable or uncontrollable) modes that could
> be unstable internally while the input-output behavior appears stable.
