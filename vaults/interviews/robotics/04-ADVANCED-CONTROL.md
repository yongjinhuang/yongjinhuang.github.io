# Chapter 4: Advanced Control -- Beyond PID

PID control is the workhorse of industry, but it has fundamental limitations. It operates on scalar error signals, cannot handle constraints explicitly, and struggles with multivariable systems where inputs and outputs are coupled. This chapter introduces the modern control toolkit: state-space methods, optimal control, predictive control, and techniques for handling nonlinearity and uncertainty.

---

## 1. State-Space Representation

### 1.1 From Transfer Functions to State Space

Classical control uses transfer functions -- ratios of polynomials in the Laplace variable s. This works well for single-input single-output (SISO) systems but becomes unwieldy for multi-input multi-output (MIMO) systems. State-space representation handles any number of inputs and outputs with a unified framework.

The canonical continuous-time state-space form:

```
  x_dot(t) = A x(t) + B u(t)      (state equation)
  y(t)     = C x(t) + D u(t)      (output equation)
```

Where:

- `x(t)` is the state vector (n x 1) -- the minimum set of variables that fully describe the system
- `u(t)` is the input vector (m x 1)
- `y(t)` is the output vector (p x 1)
- `A` is the state matrix (n x n)
- `B` is the input matrix (n x m)
- `C` is the output matrix (p x n)
- `D` is the feedthrough matrix (p x m), often zero

### 1.2 Block Diagram

```
                    State-Space System
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   u(t) ──► [B] ──►(+)──► ∫ ──► x(t) ──►  │
  │                    ▲            │     │     │
  │                    │            │     │     │
  │                    └── [A] ◄────┘     │     │
  │                                       │     │
  │                    ┌── [C] ◄──────────┘     │
  │                    │                        │
  │   u(t) ──► [D] ──►(+)──► y(t)              │
  │                                             │
  └─────────────────────────────────────────────┘
```

The integrator block (∫) is the key insight: state variables are the outputs of integrators. This means the state captures the "memory" of the system.

### 1.3 Discrete-Time State Space

For digital implementation, we use the discrete-time form:

```
  x[k+1] = A_d x[k] + B_d u[k]
  y[k]   = C_d x[k] + D_d u[k]
```

The discrete matrices are obtained via matrix exponential:

```
  A_d = e^(A * dt)
  B_d = A^(-1) (A_d - I) B    (when A is invertible)
```

### 1.4 Example: DC Motor

A DC motor can be modeled with states x = [theta, omega]^T (angle and angular velocity), input u = voltage, and output y = theta.

```
  A = [ 0     1   ]    B = [ 0   ]
      [ 0   -b/J  ]        [ K/J ]

  C = [ 1  0 ]             D = [ 0 ]
```

Where b is friction, J is inertia, and K is the motor constant.

---

## 2. Controllability and Observability

### 2.1 Controllability

A system is **controllable** if we can drive it from any initial state to any final state in finite time using the input u(t).

**Controllability matrix:**

```
  C_ctrl = [ B  |  AB  |  A^2 B  |  ...  |  A^(n-1) B ]
```

The system is controllable if and only if `rank(C_ctrl) = n` (full row rank).

**Intuition:** Each column AB, A^2 B, etc. represents the directions the input can "reach" after successive time steps. If these span the full n-dimensional state space, every state is reachable.

### 2.2 Observability

A system is **observable** if we can determine the full state x(t) from the output history y(t).

**Observability matrix:**

```
  O = [ C      ]
      [ CA     ]
      [ CA^2   ]
      [  ...   ]
      [ CA^(n-1)]
```

The system is observable if and only if `rank(O) = n` (full column rank).

**Intuition:** If the output measurements, combined with knowledge of how the state evolves, let us reconstruct every state variable, then nothing is "hidden" from us.

### 2.3 Duality

Controllability and observability are dual concepts. The pair (A, B) is controllable if and only if (A^T, B^T) is observable. This duality is not just mathematical elegance -- it means that controller design and observer design use the same underlying tools.

### 2.4 Python Check

```python
import numpy as np

def check_controllability(A, B):
    """Check if (A, B) is controllable."""
    n = A.shape[0]
    C_ctrl = B.copy()
    col = B.copy()
    for i in range(1, n):
        col = A @ col
        C_ctrl = np.hstack([C_ctrl, col])
    rank = np.linalg.matrix_rank(C_ctrl)
    return rank == n, rank

def check_observability(A, C):
    """Check if (A, C) is observable."""
    n = A.shape[0]
    O = C.copy()
    row = C.copy()
    for i in range(1, n):
        row = row @ A
        O = np.vstack([O, row])
    rank = np.linalg.matrix_rank(O)
    return rank == n, rank

# DC motor example
A = np.array([[0, 1], [0, -1]])
B = np.array([[0], [1]])
C = np.array([[1, 0]])

ctrl, r1 = check_controllability(A, B)
obs, r2 = check_observability(A, C)
print(f"Controllable: {ctrl} (rank {r1})")
print(f"Observable:   {obs} (rank {r2})")
```

---

## 3. State Feedback and Pole Placement

### 3.1 Full-State Feedback

If we can measure the full state x, we can apply the control law:

```
  u = -K x + r
```

where K is a gain matrix and r is a reference. The closed-loop dynamics become:

```
  x_dot = (A - BK) x + B r
```

The eigenvalues of (A - BK) determine stability and response speed. If the system is controllable, we can place the eigenvalues (poles) anywhere we want by choosing K appropriately.

### 3.2 Pole Placement Procedure

1. Choose desired closed-loop poles (eigenvalues of A - BK)
2. Compute K using Ackermann's formula or direct assignment
3. Verify the closed-loop eigenvalues match

**Design rules of thumb:**

- Poles further left in the complex plane give faster response but require more control effort
- Complex poles cause oscillation; real poles give smooth response
- Avoid placing poles too far left -- it amplifies noise and saturates actuators

---

## 4. Linear Quadratic Regulator (LQR)

### 4.1 The Optimality Question

Pole placement tells us _what is possible_ but not _what is best_. LQR answers: "What gain K minimizes a cost function that balances state error against control effort?"

### 4.2 Cost Function

The infinite-horizon LQR minimizes:

```
  J = integral from 0 to infinity of [ x^T Q x  +  u^T R u ] dt
```

- **Q** (n x n, positive semi-definite): penalizes state deviation. Large Q_ii means "keep state i close to zero."
- **R** (m x m, positive definite): penalizes control effort. Large R_jj means "don't use actuator j aggressively."

The ratio Q/R governs the aggressiveness of the controller. Think of it as a tuning dial between performance and effort.

### 4.3 Solution via Algebraic Riccati Equation

The optimal gain is:

```
  K = R^(-1) B^T P
```

where P is the unique positive definite solution of the Continuous Algebraic Riccati Equation (CARE):

```
  A^T P + P A - P B R^(-1) B^T P + Q = 0
```

This is a matrix equation that can be solved numerically. The beauty of LQR is that it automatically provides a stabilizing controller with guaranteed robustness margins (60-degree phase margin, infinite gain margin for SISO).

### 4.4 Python Implementation

```python
import numpy as np
from scipy import linalg

def lqr(A, B, Q, R):
    """
    Solve the continuous-time LQR problem.

    Returns:
        K: optimal gain matrix
        P: solution to the Riccati equation
        eigvals: closed-loop eigenvalues
    """
    P = linalg.solve_continuous_are(A, B, Q, R)
    K = np.linalg.solve(R, B.T @ P)
    eigvals = np.linalg.eigvals(A - B @ K)
    return K, P, eigvals

# Example: inverted pendulum (linearized about upright)
# States: [x, x_dot, theta, theta_dot]
g = 9.81
L = 1.0   # pendulum length
m = 0.2   # pendulum mass
M = 1.0   # cart mass

A = np.array([
    [0, 1, 0, 0],
    [0, 0, -m*g/M, 0],
    [0, 0, 0, 1],
    [0, 0, (M+m)*g/(M*L), 0]
])
B = np.array([[0], [1/M], [0], [-1/(M*L)]])

# Tuning: penalize angle deviation heavily
Q = np.diag([1.0, 1.0, 10.0, 10.0])
R = np.array([[1.0]])

K, P, eigvals = lqr(A, B, Q, R)
print(f"LQR Gain K: {K}")
print(f"Closed-loop eigenvalues: {eigvals}")
print(f"All stable: {all(e.real < 0 for e in eigvals)}")
```

### 4.5 Discrete-Time LQR

For digital implementation, minimize:

```
  J = sum from k=0 to infinity of [ x[k]^T Q x[k] + u[k]^T R u[k] ]
```

Use `scipy.linalg.solve_discrete_are` for the discrete Riccati equation.

### 4.6 LQR Tuning Guidelines

| Goal                      | Action             |
| ------------------------- | ------------------ |
| Faster response           | Increase Q         |
| Less actuator effort      | Increase R         |
| Penalize specific state i | Increase Q[i,i]    |
| Limit specific input j    | Increase R[j,j]    |
| Equal priority all states | Q = C^T C (Bryson) |

---

## 5. State Estimation

### 5.1 The Problem

LQR assumes we know the full state x. In practice, we only measure y = Cx (plus noise). We need an **observer** (state estimator) to reconstruct x from y.

### 5.2 Luenberger Observer

The observer is a copy of the system with a correction term:

```
  x_hat_dot = A x_hat + B u + L (y - C x_hat)
```

```
  ┌──────────────────────────────────────────────────┐
  │              Luenberger Observer                  │
  │                                                  │
  │  y ──────────────────────►(-)──► [L] ──►(+)      │
  │                            ▲              │      │
  │                            │              ▼      │
  │  u ──► [B] ──────────────►(+)◄─── [A] ◄── ∫     │
  │                                           │      │
  │                            ▲              │      │
  │                    y_hat ◄─┤── [C] ◄──────┘      │
  │                            │                     │
  │                          x_hat (output)          │
  └──────────────────────────────────────────────────┘
```

The estimation error e = x - x_hat evolves as:

```
  e_dot = (A - LC) e
```

If the system is observable, we can choose L to place the eigenvalues of (A - LC) wherever we want. By duality with pole placement, this is the same problem as controller design.

### 5.3 Separation Principle

The controller and observer can be designed independently. Use LQR to find K, use observer pole placement (or Kalman filter) to find L, and combine them:

```
  u = -K x_hat
```

The closed-loop system remains stable with the combined controller-observer, and each can be tuned independently. This is the **separation principle**.

### 5.4 Kalman Filter as Optimal Observer

The Kalman filter is the optimal observer when process noise and measurement noise are Gaussian. It solves the dual of the LQR problem. The observer gain L is computed from the dual Riccati equation:

```
  L = P C^T R_n^(-1)
```

where P solves:

```
  A P + P A^T - P C^T R_n^(-1) C P + Q_n = 0
```

Q_n is process noise covariance, R_n is measurement noise covariance. We cover the Kalman filter in depth in Chapter 5.

---

## 6. Model Predictive Control (MPC)

### 6.1 The Core Idea

MPC is fundamentally different from LQR and PID. Instead of computing a fixed gain, it solves an optimization problem at every time step:

1. Measure the current state x[k]
2. Predict the future trajectory over a horizon of N steps
3. Optimize the input sequence u[0], u[1], ..., u[N-1] to minimize a cost function subject to constraints
4. Apply only the first input u[0]
5. Repeat at the next time step (receding horizon)

```
  Time ──────────────────────────────────────────►

  Past          Now              Future (Horizon N)
  ─────────────┤├───────────────────────────────►
               x[k]
                ├── u[0] ──► x[k+1]
                │   u[1] ──► x[k+2]
                │   u[2] ──► x[k+3]
                │    ...       ...
                │   u[N-1] ► x[k+N]
                │
                └── Apply only u[0], then re-solve
```

### 6.2 Why MPC?

- **Handles constraints explicitly**: actuator limits, safety bounds, obstacle avoidance
- **Handles MIMO systems naturally**: no loop-at-a-time tuning
- **Preview capability**: can anticipate known future references or disturbances
- **Systematic tuning**: cost function weights have physical meaning

### 6.3 MPC Formulation

```
  minimize    sum_{i=0}^{N-1} [ x[i]^T Q x[i] + u[i]^T R u[i] ] + x[N]^T Q_f x[N]

  subject to  x[i+1] = A x[i] + B u[i]        (dynamics)
              u_min <= u[i] <= u_max            (input constraints)
              x_min <= x[i] <= x_max            (state constraints)
              x[0] = x_current                  (initial condition)
```

Q_f is a terminal cost that approximates the infinite-horizon cost beyond the prediction window.

### 6.4 Solving the MPC Problem

For linear systems with quadratic cost, MPC is a Quadratic Program (QP) -- a convex optimization problem with efficient solvers. For nonlinear systems, it becomes a Nonlinear Program (NLP), which is harder but tractable with modern solvers.

### 6.5 Python Implementation (Simple Linear MPC)

```python
import numpy as np
from scipy.optimize import minimize

def simple_mpc(A, B, Q, R, Q_f, x0, N, u_min, u_max):
    """
    Simple linear MPC with input constraints.

    Args:
        A, B: system matrices
        Q, R: stage cost matrices
        Q_f: terminal cost matrix
        x0: current state
        N: prediction horizon
        u_min, u_max: input bounds (scalar for single input)

    Returns:
        u_opt: first optimal input to apply
        x_pred: predicted state trajectory
    """
    n_x = A.shape[0]
    n_u = B.shape[1]

    def cost_function(u_flat):
        u_seq = u_flat.reshape(N, n_u)
        total_cost = 0.0
        x = x0.copy()
        for i in range(N):
            total_cost += x.T @ Q @ x + u_seq[i].T @ R @ u_seq[i]
            x = A @ x + B @ u_seq[i]
        total_cost += x.T @ Q_f @ x
        return float(total_cost)

    u_init = np.zeros(N * n_u)
    bounds = [(u_min, u_max)] * (N * n_u)

    result = minimize(cost_function, u_init, method='SLSQP', bounds=bounds)
    u_opt_seq = result.x.reshape(N, n_u)

    # Simulate predicted trajectory
    x_pred = [x0.copy()]
    x = x0.copy()
    for i in range(N):
        x = A @ x + B @ u_opt_seq[i]
        x_pred.append(x.copy())

    return u_opt_seq[0], np.array(x_pred)

# Example: double integrator (position + velocity)
dt = 0.1
A = np.array([[1, dt], [0, 1]])
B = np.array([[0.5*dt**2], [dt]])
Q = np.diag([10.0, 1.0])
R = np.array([[0.1]])
Q_f = 10 * Q
x0 = np.array([5.0, 0.0])  # start at position 5, zero velocity

u_opt, x_pred = simple_mpc(A, B, Q, R, Q_f, x0, N=20, u_min=-2.0, u_max=2.0)
print(f"Optimal first input: {u_opt}")
print(f"Predicted final state: {x_pred[-1]}")
```

For production MPC, use dedicated solvers like OSQP, qpOASES, or CVXPY with a QP backend.

### 6.6 MPC Tuning

| Parameter      | Effect                                            |
| -------------- | ------------------------------------------------- |
| Horizon N      | Longer = better performance, more computation     |
| Q (state cost) | Larger = tighter tracking, more aggressive inputs |
| R (input cost) | Larger = smoother inputs, slower response         |
| Q_f (terminal) | Ensures stability; often set to LQR cost-to-go    |
| Sampling time  | Shorter = better tracking, heavier computation    |

### 6.7 Nonlinear MPC

For nonlinear systems x_dot = f(x, u), the prediction step uses the nonlinear model. The optimization becomes a nonlinear program. Common approaches:

- **Sequential Quadratic Programming (SQP)**: Solve a sequence of QP approximations
- **Direct collocation**: Discretize the trajectory and solve jointly for states and inputs
- **Shooting methods**: Simulate forward, optimize over inputs only

Libraries: CasADi, acados, FORCESPRO.

---

## 7. Adaptive Control

### 7.1 Motivation

All controllers so far assume we know the model (A, B, C, D) perfectly. In reality, parameters change: a robot picks up an unknown load, a drone's battery drains and shifts its center of gravity, or a chemical process drifts over time. Adaptive control adjusts the controller parameters online.

### 7.2 Model Reference Adaptive Control (MRAC)

The idea: define a **reference model** that describes desired behavior, then adjust controller parameters so the plant tracks the reference model.

```
  Reference  ┌──────────────┐
  input r ──►│ Reference     │──► y_m (desired output)
              │ Model         │           │
              └──────────────┘           │
                                          ▼
                                        (-)──► e (error)
                                          ▲
              ┌──────────────┐           │
  r ─────────►│ Adaptive     │──► u ──► Plant ──► y
              │ Controller   │                     │
              └──────┬───────┘                     │
                     ▲                             │
                     └─── Adaptation Law ◄─────────┘
```

The adaptation law adjusts controller gains to drive the tracking error e = y - y_m to zero. MIT rule and Lyapunov-based methods are common approaches.

### 7.3 When to Use Adaptive Control

- Unknown or slowly varying plant parameters
- Gain scheduling is insufficient (too many operating points)
- Self-tuning is needed without human intervention

**Caution:** Adaptive control can be fragile. Persistent excitation (the input must be "rich enough") is required for convergence, and transient performance can be poor.

---

## 8. Robust Control

### 8.1 The Robustness Problem

Instead of adapting to uncertainty, robust control designs a _fixed_ controller that works well despite bounded uncertainty. The question shifts from "what is the model?" to "what could the model be?"

### 8.2 Uncertainty Modeling

Uncertainty is modeled as perturbations:

- **Parametric uncertainty**: known structure, unknown values (e.g., mass between 1 and 2 kg)
- **Unmodeled dynamics**: high-frequency behavior not captured by the model
- **Disturbances**: external forces, noise

### 8.3 H-infinity Control (Overview)

H-infinity (H∞) control minimizes the worst-case gain from disturbance to performance output. The "infinity" refers to the infinity norm of the transfer function.

```
                    ┌──────────┐
  disturbance w ──► │          │ ──► performance z
                    │  Plant P │
  control u ──────► │          │ ──► measurement y
                    └──────────┘
                         ▲
                         │
                    ┌────┴─────┐
                    │Controller│
                    │    K     │
                    └──────────┘
```

The H∞ problem: find K that minimizes `||T_zw||_∞`, the worst-case amplification from w to z across all frequencies.

**Key insight:** H∞ control provides frequency-dependent robustness guarantees. You shape the sensitivity function to reject low-frequency disturbances while tolerating high-frequency uncertainty.

### 8.4 When to Use Robust Control

- Safety-critical systems (aerospace, medical devices)
- Systems with significant model uncertainty
- When you need guaranteed performance bounds
- When adaptive control is too risky (no time for learning)

---

## 9. Nonlinear Control

### 9.1 Why Linear Methods Fall Short

Linear control theory applies near equilibrium points. But robots operate over wide ranges: a manipulator swings through 180 degrees, a quadrotor transitions from hover to aggressive flight. Nonlinear methods are essential.

### 9.2 Feedback Linearization

The idea: find a nonlinear coordinate transformation and control input that make the closed-loop system behave linearly.

Given a nonlinear system:

```
  x_dot = f(x) + g(x) u
  y = h(x)
```

Differentiate y until the input u appears:

```
  y_dot   = Lf h(x)                     (u doesn't appear yet)
  y_ddot  = Lf^2 h(x) + Lg Lf h(x) * u (u appears!)
```

where Lf and Lg are Lie derivatives. If `Lg Lf h(x) != 0`, choose:

```
  u = [1 / (Lg Lf h(x))] * (v - Lf^2 h(x))
```

This yields `y_ddot = v`, a simple double integrator that can be controlled with any linear method.

**Example:** For a single-link robot arm with equation `J * theta_ddot + b * theta_dot + m*g*L*sin(theta) = tau`, the feedback linearizing control is:

```
  tau = J * v + b * theta_dot + m*g*L*sin(theta)
```

which cancels the nonlinearities and yields `theta_ddot = v`.

### 9.3 Sliding Mode Control

Sliding mode control forces the state to reach and stay on a **sliding surface** s(x) = 0, where the dynamics have desirable properties.

**Design steps:**

1. Define a sliding surface: `s = e_dot + lambda * e` (for a second-order system, where e is tracking error)
2. Design control to drive s to zero: `u = u_eq + u_sw`
   - `u_eq` is the equivalent control (keeps state on surface)
   - `u_sw = -k * sign(s)` is the switching control (drives state to surface)

```
  State Space
  ▲
  │         ╲  Reaching phase
  │          ╲
  │           ╲    Sliding surface s = 0
  │            ╲ ─────────────────────────► equilibrium
  │           ╱
  │          ╱
  │         ╱  Reaching phase
  │
  └──────────────────────────────────────►
```

**Advantages:** Extremely robust to model uncertainty and disturbances (invariant once on the sliding surface).

**Disadvantage:** Chattering -- the `sign(s)` function causes high-frequency switching. Remedies include boundary layers (replace sign with sat) and higher-order sliding modes.

### 9.4 Lyapunov Stability

Lyapunov's direct method is the fundamental tool for analyzing nonlinear stability. Choose a scalar function V(x) (the "energy-like" Lyapunov function):

- V(x) > 0 for all x != 0, V(0) = 0 (positive definite)
- V_dot(x) < 0 for all x != 0 (decreasing along trajectories)

If such a V exists, the origin is asymptotically stable. No linearization needed.

This is used extensively in robotics to prove stability of controllers for manipulators, walking robots, and autonomous vehicles.

---

## 10. Comparison of Control Methods

```
  ┌────────────────┬───────────────┬───────────────┬──────────────┐
  │ Method         │ Handles       │ Handles       │ Computational│
  │                │ Constraints?  │ Nonlinearity? │ Cost         │
  ├────────────────┼───────────────┼───────────────┼──────────────┤
  │ PID            │ No            │ No            │ Minimal      │
  │ LQR            │ No            │ No (linear)   │ Low          │
  │ Pole Placement │ No            │ No            │ Low          │
  │ MPC            │ Yes           │ Yes (NMPC)    │ High         │
  │ Adaptive       │ Indirectly    │ Some          │ Medium       │
  │ H∞             │ No            │ No (linear)   │ Medium       │
  │ Feedback Lin.  │ No            │ Yes           │ Low          │
  │ Sliding Mode   │ No            │ Yes           │ Low          │
  └────────────────┴───────────────┴───────────────┴──────────────┘
```

**Rules of thumb for selection:**

- Simple SISO, no constraints: PID
- MIMO, known linear model: LQR
- Constraints matter: MPC
- Unknown parameters: Adaptive
- Guaranteed robustness needed: H∞
- Known nonlinear model, wide operating range: Feedback linearization
- Robustness to large disturbances: Sliding mode

---

## 11. Practical Considerations

### 11.1 Actuator Saturation

Every actuator has limits. A motor cannot produce infinite torque. When the controller commands an input beyond the limit, the actuator saturates. This can cause **integrator windup** in PID and instability in state-feedback controllers.

**Solutions:**

- Anti-windup for PID (clamp integrator when output saturates)
- MPC handles this naturally via constraints
- For LQR: add saturation-aware modifications or switch to MPC

### 11.2 Model Mismatch

No model is perfect. Always validate controllers in simulation before hardware. Common issues:

- Unmodeled friction (stiction, Coulomb friction)
- Unmodeled flexibility (cables, joints)
- Time delays (communication, computation)
- Sensor noise

### 11.3 Discrete-Time Implementation

All controllers run on digital computers at finite sample rates. The sample rate must be fast enough:

- Rule of thumb: sample at least 10x the closed-loop bandwidth
- ZOH (zero-order hold) discretization is most common
- Watch for aliasing in sensor measurements

---

## Interview Questions

**Q1: What is the state-space representation, and why is it preferred over transfer functions for MIMO systems?**

State-space uses matrices (A, B, C, D) to describe system dynamics with vectors for states, inputs, and outputs. It naturally handles multiple inputs and outputs without the combinatorial explosion of transfer functions (one per input-output pair). It also directly supports modern control methods like LQR and observers.

**Q2: Explain controllability. Give an example of an uncontrollable system.**

A system is controllable if any state can be reached from any other state using the input. An uncontrollable example: two masses connected by a spring where you can only push one mass -- if both modes have the same natural frequency, you cannot independently control both masses. Formally, the controllability matrix must have full rank.

**Q3: What is LQR and how does it differ from pole placement?**

Both compute a state-feedback gain K. Pole placement lets you choose exact eigenvalue locations. LQR finds the K that minimizes a weighted sum of state deviation and control effort (the Q and R matrices). LQR is generally preferred because it provides optimal trade-offs and guaranteed robustness margins, while pole placement gives no optimality guarantees.

**Q4: Derive (conceptually) why the LQR solution involves a Riccati equation.**

The cost-to-go from state x is quadratic: V(x) = x^T P x. By the principle of optimality (Bellman), the optimal cost satisfies a recursive relationship. Substituting the quadratic form and optimizing over u yields the Riccati equation as the consistency condition on P.

**Q5: What is the separation principle?**

The controller (e.g., LQR gain K) and the state estimator (e.g., Luenberger observer gain L) can be designed independently. The combined system (controller + observer) is stable if each is designed to be stable individually. This dramatically simplifies design.

**Q6: Explain MPC in simple terms. What is the receding horizon?**

MPC predicts the system's future behavior over a finite horizon, optimizes the input sequence to minimize a cost function subject to constraints, applies only the first input, and repeats. "Receding horizon" means the prediction window slides forward in time at each step. It is like playing chess: plan several moves ahead, make the first move, then re-plan.

**Q7: Why is MPC computationally expensive compared to LQR?**

LQR computes a fixed gain offline (solve Riccati once). MPC solves an optimization problem at every time step. For a horizon of N steps with n states and m inputs, the QP has N\*m decision variables. This must be solved within one sample period, which is challenging for fast systems.

**Q8: What is feedback linearization? What are its limitations?**

Feedback linearization uses a nonlinear control law to cancel the system's nonlinearities, yielding a linear input-output relationship. Limitations: requires an accurate nonlinear model (sensitive to model error), may not work if the system has non-minimum phase zeros, and can require large control inputs to cancel nonlinearities.

**Q9: Explain sliding mode control and the chattering problem.**

Sliding mode control defines a surface in state space and uses discontinuous control to force the state onto that surface. Once on the surface, dynamics are governed by a reduced-order system. Chattering is the rapid switching of the control signal around the surface due to the discontinuous sign function. It causes mechanical wear and excites unmodeled dynamics. Solutions include boundary layers and super-twisting algorithms.

**Q10: When would you choose adaptive control over robust control?**

Choose adaptive when parameters change slowly and you need performance that improves over time (e.g., a robot learning the weight of a new payload). Choose robust when you need guaranteed worst-case performance without waiting for adaptation, especially in safety-critical applications (e.g., aircraft).

**Q11: What is the Kalman filter's relationship to the Luenberger observer?**

The Kalman filter is the optimal Luenberger observer for systems with Gaussian noise. The observer structure is identical (prediction + correction), but the Kalman filter computes the gain L optimally to minimize estimation error covariance, while the Luenberger observer allows arbitrary gain selection.

**Q12: How do you handle actuator saturation in LQR?**

LQR does not handle constraints natively. Options: (1) Scale the gain K to respect limits under expected conditions, (2) Clamp the output and add anti-windup logic, (3) Switch to MPC which handles constraints explicitly, (4) Use a reference governor that filters the reference to prevent saturation.

**Q13: What is the H-infinity norm and why does it matter for control?**

The H∞ norm is the peak gain of a transfer function across all frequencies. Minimizing it means minimizing the worst-case amplification of disturbances. It matters because it provides guaranteed performance bounds: if the H∞ norm from disturbance to output is below gamma, no disturbance can produce an output larger than gamma times the disturbance.

**Q14: Explain the practical steps to implement an LQR controller on a real robot.**

(1) Derive a linear model (or linearize a nonlinear model around the operating point). (2) Verify controllability. (3) Choose Q and R matrices based on physical units and priorities. (4) Solve the Riccati equation for K. (5) Implement a state estimator (Kalman filter) since not all states are measured. (6) Discretize for digital implementation. (7) Add anti-windup and saturation handling. (8) Test in simulation, then on hardware with conservative gains first.

**Q15: Compare MPC and LQR for a self-driving car application.**

LQR is simple and fast but cannot handle constraints (speed limits, lane boundaries, obstacle avoidance). MPC naturally incorporates these as constraints in the optimization. For a self-driving car, MPC is preferred because constraints are critical for safety. However, LQR might be used as the terminal controller within MPC or for low-level actuator control where constraints are less important.
