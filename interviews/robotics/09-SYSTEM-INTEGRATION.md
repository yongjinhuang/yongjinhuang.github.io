# Chapter 9: System Integration -- Building Complete Robots

> "A robot is not a collection of parts. It is the emergent behavior of
> hardware, software, and the physical world conspiring together."

Building a single algorithm is one thing. Integrating perception, planning,
control, communication, power, safety, and deployment into a system that
works reliably in the real world is an entirely different discipline. This
chapter covers the engineering that turns research prototypes into products.

---

## 1. Hardware-Software Co-Design

### 1.1 Why Co-Design Matters

Hardware and software are not independent. A fast planner is useless with
slow actuators. A brilliant vision algorithm is useless on a processor
that cannot run it in real time.

```
┌─────────────────────────────────────────────────────┐
│          The Co-Design Triangle                      │
│                                                     │
│               Compute                               │
│              /       \                              │
│             /         \                             │
│            /    Task    \                            │
│           /   Requirements\                         │
│          /                 \                         │
│     Sensing ──────────── Actuation                  │
│                                                     │
│  All three must be balanced for a given task.       │
│  Over-investing in one while neglecting another     │
│  produces a robot that cannot function.             │
└─────────────────────────────────────────────────────┘
```

### 1.2 Compute Selection

| Platform                       | Power    | Use Case                       | Example                  |
| ------------------------------ | -------- | ------------------------------ | ------------------------ |
| Microcontroller (ARM Cortex-M) | 0.1-1W   | Motor control, sensor reading  | STM32, ESP32             |
| Single-board computer          | 5-15W    | Basic perception, ROS 2        | Raspberry Pi, BeagleBone |
| Embedded GPU (Jetson)          | 10-60W   | Neural network inference, SLAM | Jetson Orin Nano/NX/AGX  |
| Industrial PC (x86)            | 50-200W  | Full autonomy stack            | Intel NUC, Advantech     |
| Workstation GPU                | 200-500W | Training, heavy perception     | Desktop with RTX 4090    |

A common architecture splits compute across tiers:

```
┌──────���──────────────────────────────────────────────┐
│               Compute Architecture                   │
│                                                     │
│  ┌──────────────────────────────────────┐           │
│  │  Tier 1: Real-time microcontroller   │  1 kHz    │
│  │  - Motor PID loops                   │           │
│  │  - Safety monitoring                 │           │
│  │  - Sensor sampling (IMU, encoders)   │           │
│  └──────────────┬───────────────────────┘           │
│                 │ CAN / EtherCAT / SPI              │
│  ┌──────────────▼───────────────────────┐           │
│  │  Tier 2: Embedded Linux (Jetson)     │  100 Hz   │
│  │  - Perception (object detection)     │           │
│  │  - State estimation (SLAM, EKF)      │           │
│  │  - Local planning                    │           │
│  └──────────────┬───────────────────────┘           │
│                 │ Ethernet / WiFi                    │
│  ┌──────────────▼───────────────────────┐           │
│  │  Tier 3: Cloud / Edge Server         │  1 Hz     │
│  │  - Fleet management                  │           │
│  │  - Map updates                       │           │
│  │  - ML model updates                  │           │
│  └──────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

### 1.3 Actuator Selection

| Type                | Speed     | Precision | Force     | Cost     | Use Case              |
| ------------------- | --------- | --------- | --------- | -------- | --------------------- |
| DC brushed motor    | High      | Low       | Medium    | Low      | Wheels, simple joints |
| Brushless DC (BLDC) | High      | Medium    | High      | Medium   | Drones, wheels        |
| Stepper motor       | Low       | High      | Low       | Low      | 3D printers, cameras  |
| Servo (hobby)       | Medium    | Low       | Low       | Very Low | Small robots, demos   |
| Harmonic drive      | Low       | Very High | High      | High     | Robot arms            |
| Direct drive        | High      | High      | Low       | High     | Haptics, fast arms    |
| Linear actuator     | Low       | Medium    | High      | Medium   | Grippers, lifts       |
| Pneumatic           | Very High | Low       | Very High | Medium   | Industrial grippers   |
| Hydraulic           | Medium    | Medium    | Very High | High     | Heavy machinery       |

### 1.4 Power Budget

Every robot has a power budget. Here is a typical mobile manipulator:

```
Component               Typical Power    Peak Power
──────────────────────────────────────────────────────
Drive motors (x4)       40W              120W
Arm motors (x6)         30W              90W
Jetson Orin NX          15W              25W
LiDAR                   8W               12W
Cameras (x3)            6W               6W
Microcontrollers        3W               5W
Networking (WiFi)       3W               5W
Miscellaneous           5W               10W
──────────────────────────────────────────────────────
TOTAL                   110W             273W

Battery: 24V, 20Ah = 480Wh
Runtime at typical: 480 / 110 = 4.4 hours
Runtime at peak:    480 / 273 = 1.8 hours
```

Always design for peak power, budget for typical.

---

## 2. Real-Time Systems

### 2.1 What "Real-Time" Actually Means

Real-time does NOT mean "fast." It means "deterministic" -- the system
guarantees a response within a deadline, every time.

```
┌──────────────────────────────────────────────────┐
│           Real-Time vs. Fast                      │
│                                                  │
│  Fast but not real-time:                         │
│    Average response: 1ms                         │
│    Worst case: 500ms (garbage collection spike)  │
│    → NOT acceptable for motor control            │
│                                                  │
│  Real-time but not fast:                         │
│    Average response: 5ms                         │
│    Worst case: 6ms (guaranteed)                  │
│    → Acceptable if 6ms meets the deadline        │
│                                                  │
│  Hard real-time:  Missing deadline = system       │
│                   failure (airbag, ABS)          │
│  Soft real-time:  Missing deadline = degraded     │
│                   performance (video playback)   │
│  Firm real-time:  Missing deadline = result is    │
│                   worthless but not dangerous     │
└──────────────────────────────────────────────────┘
```

### 2.2 Sources of Non-Determinism in Linux

Standard Linux is NOT real-time. These cause jitter:

```
Source                          Typical Jitter
──────────────────────────────────────────────
Page faults (virtual memory)    1-100 ms
Garbage collection (Python/JVM) 10-500 ms
Kernel preemption delays        0.1-10 ms
Network interrupts              0.01-1 ms
Filesystem I/O                  1-1000 ms
CPU frequency scaling           0.1-1 ms
Context switching               0.01-0.1 ms
Cache misses                    0.001-0.01 ms
```

### 2.3 Real-Time Linux (PREEMPT_RT)

The PREEMPT_RT patch set makes the Linux kernel (nearly) fully preemptible:

```
Standard Linux kernel:
  ┌────────────────────────────────────────┐
  │  User task running...                  │
  │  ═══════╗                              │
  │         ║ Interrupt! Kernel takes over │
  │         ║ (non-preemptible section)    │
  │         ║ ...could take milliseconds   │
  │         ╚══════════════════════════    │
  │  User task resumes                     │
  └────────────────────────────────────────┘

PREEMPT_RT kernel:
  ┌────────────────────────────────────────┐
  │  User task running...                  │
  │  ═══════╗                              │
  │         ║ Interrupt! Threaded IRQ      │
  │         ║ (preemptible)                │
  │         ╚═╗                            │
  │           ║ High-priority RT task      │
  │           ║ preempts interrupt handler │
  │           ╚════════                    │
  │  Guaranteed worst-case latency: ~50μs  │
  └────────────────────────────────────────┘
```

### 2.4 RTOS (Real-Time Operating System)

For hard real-time requirements (< 10 microseconds), use a dedicated RTOS:

| RTOS     | License     | Typical Latency | Use Case             |
| -------- | ----------- | --------------- | -------------------- |
| FreeRTOS | MIT         | 1-10 μs         | Microcontrollers     |
| Zephyr   | Apache 2.0  | 1-10 μs         | IoT, safety-critical |
| VxWorks  | Proprietary | < 1 μs          | Aerospace, defense   |
| QNX      | Proprietary | < 5 μs          | Automotive, medical  |
| Xenomai  | GPL         | 5-15 μs         | Linux + hard RT      |

### 2.5 Latency Budgets

A complete control loop has a latency budget:

```
Sensor → Process → Plan → Command → Actuate → Effect

Example: 1 kHz control loop = 1ms total budget

  Sensor reading:       50 μs   (SPI transfer)
  State estimation:    100 μs   (EKF update)
  Control computation: 200 μs   (PID + feedforward)
  Communication:        50 μs   (CAN bus)
  Actuator response:   100 μs   (motor driver)
  ─────────────────────────────
  Total:               500 μs   (within 1ms budget)
  Margin:              500 μs   (50% margin -- good)

Rule of thumb: keep 30-50% margin for worst case.
```

### 2.6 Real-Time Programming Rules

```cpp
// Rules for real-time code (in the control loop):

// 1. NO dynamic memory allocation
//    Bad:   std::vector<double> data;  data.push_back(x);
//    Good:  std::array<double, 100> data;

// 2. NO blocking I/O
//    Bad:   std::cout << "Debug: " << value << std::endl;
//    Good:  Log to lock-free ring buffer, drain in non-RT thread

// 3. NO system calls that may block
//    Bad:   open(), read(), write(), malloc()
//    Good:  Pre-allocate everything before entering RT loop

// 4. NO exceptions
//    Bad:   throw std::runtime_error("bad value");
//    Good:  Return error codes

// 5. NO locks (or use lock-free data structures)
//    Bad:   std::mutex mtx; mtx.lock();
//    Good:  std::atomic<double> shared_value;

// 6. NO virtual function calls in hot path (cache-unfriendly)
//    Acceptable with care, but be aware of vtable overhead

// Example: RT-safe control loop
class RTController {
    std::array<double, 6> joint_positions_{};
    std::array<double, 6> joint_velocities_{};
    std::array<double, 6> joint_commands_{};
    std::atomic<bool> running_{true};

public:
    void control_loop() {
        // Pre-fault stack pages
        volatile char stack[8192];
        for (size_t i = 0; i < sizeof(stack); i += 4096)
            stack[i] = 0;

        // Lock memory (prevent page faults)
        mlockall(MCL_CURRENT | MCL_FUTURE);

        struct timespec next_wake;
        clock_gettime(CLOCK_MONOTONIC, &next_wake);

        while (running_.load(std::memory_order_relaxed)) {
            read_sensors(joint_positions_, joint_velocities_);
            compute_control(joint_positions_, joint_velocities_,
                          joint_commands_);
            write_commands(joint_commands_);

            // Sleep until next period (1ms)
            next_wake.tv_nsec += 1000000;
            if (next_wake.tv_nsec >= 1000000000) {
                next_wake.tv_nsec -= 1000000000;
                next_wake.tv_sec += 1;
            }
            clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME,
                          &next_wake, nullptr);
        }
    }
};
```

---

## 3. Communication Buses

### 3.1 Overview

Robots need to move data between processors, sensors, and actuators. The
choice of communication bus depends on bandwidth, latency, distance, and cost.

```
┌───────────────────────────────────────────────────────┐
│                Communication Landscape                 │
│                                                       │
│  Bandwidth ▲                                          │
│            │  ┌──────────┐                            │
│   1 Gbps   │  │ Ethernet │  ┌──────────┐             │
│            │  │          │  │ EtherCAT │             │
│            │  └──────────┘  └──────────┘             │
│  100 Mbps  │                                          │
│            │      ┌─────┐                             │
│   10 Mbps  │      │ USB │                             │
│            │      └─────┘                             │
│    1 Mbps  │  ┌─────┐                                 │
│            │  │ CAN │                                 │
│  100 Kbps  │  └─────┘                                 │
│            │          ┌─────┐                         │
│   10 Kbps  │          │ I2C │                         │
│            │          └─────┘    ┌─────┐              │
│    1 Kbps  │                     │ 1-Wire│            │
│            │                     └──────┘             │
│            └──────────────────────────────────► Cost  │
│              Low                          High        │
└───────────────────────────────────────────────────────┘
```

### 3.2 CAN Bus (Controller Area Network)

The dominant bus in automotive and robotics for actuator communication.

```
CAN Bus Topology:

  Node A ──┬── Node B ──┬── Node C ──┬── Node D
           │            │            │
         120Ω         (bus)        120Ω
       terminator                terminator

  - Multi-master (any node can transmit)
  - Priority-based arbitration (lower ID = higher priority)
  - Max 1 Mbps (CAN 2.0) or 5 Mbps (CAN FD)
  - Up to 40m bus length at 1 Mbps
  - 8 bytes per frame (CAN 2.0) or 64 bytes (CAN FD)
  - Built-in error detection and fault confinement
```

CAN frame structure:

```
┌─────┬────┬─────┬──────┬──────┬─────┬─────┬─────┐
│ SOF │ ID │ RTR │ DLC  │ Data │ CRC │ ACK │ EOF │
│ 1b  │11b │ 1b  │ 4b   │0-64B │ 15b │ 2b  │ 7b  │
└─────┴────┴─────┴──────┴──────┴─────┴─────┴─────┘
```

### 3.3 EtherCAT

EtherCAT achieves microsecond-level synchronization over Ethernet hardware:

```
EtherCAT Ring Topology:

  Master ──► Slave 1 ──► Slave 2 ──► Slave 3 ──┐
    ▲                                            │
    └────────────────────────────────────────────┘

  - Ethernet frame passes through each slave
  - Each slave reads/writes its portion on the fly
  - Single frame services ALL slaves in one pass
  - Cycle time: 100 μs for 100 slaves
  - Jitter: < 1 μs
  - Uses standard Ethernet PHYs (cheap hardware)
```

### 3.4 SPI and I2C

For chip-to-chip communication on a single board:

| Feature      | SPI                      | I2C                        |
| ------------ | ------------------------ | -------------------------- |
| Wires        | 4 (MOSI, MISO, SCLK, CS) | 2 (SDA, SCL)               |
| Speed        | Up to 100 MHz            | Up to 3.4 MHz              |
| Topology     | Star (one CS per device) | Bus (shared, addressed)    |
| Full duplex  | Yes                      | No                         |
| Max distance | ~30 cm                   | ~1 m                       |
| Typical use  | IMU, ADC, display        | Temperature sensor, EEPROM |
| Complexity   | Simple, fast             | More complex, slower       |

### 3.5 Protocol Selection Guide

```
Decision tree for communication bus selection:

Need > 10 Mbps?
├── Yes → Ethernet or EtherCAT
│         Need real-time? → EtherCAT
│         Standard networking? → UDP/TCP over Ethernet
└── No
    Need multi-device bus?
    ├── Yes → CAN bus
    │         Need > 8 bytes/frame? → CAN FD
    │         Automotive-grade reliability? → CAN
    └── No
        On same PCB?
        ├── Yes → SPI (fast) or I2C (fewer wires)
        └── No → RS-485 or CAN
```

---

## 4. Safety Systems

### 4.1 Functional Safety Standards

| Standard  | Domain            | Levels   | Focus                  |
| --------- | ----------------- | -------- | ---------------------- |
| ISO 13849 | Machinery         | PL a-e   | Safety-related control |
| IEC 62443 | Industrial        | SL 1-4   | Cybersecurity          |
| ISO 10218 | Industrial robots | Cat 1-4  | Robot-specific safety  |
| ISO 13482 | Service robots    | --       | Personal care robots   |
| ISO 26262 | Automotive        | ASIL A-D | Vehicle safety         |
| IEC 61508 | General           | SIL 1-4  | Electrical/electronic  |
| DO-178C   | Aviation          | DAL A-E  | Airborne software      |

### 4.2 Safety Architecture

```
┌──────────────────────────────────────────────────────┐
│              Safety System Architecture                │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Layer 0: Mechanical Safety                     │  │
│  │  - Padded surfaces, compliant joints            │  │
│  │  - Breakaway couplings                          │  │
│  │  - Current-limiting motor drivers               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Layer 1: Hardware Safety (independent circuit) │  │
│  │  - Emergency stop (hardwired, not software)     │  │
│  │  - Watchdog timer (resets if software hangs)    │  │
│  │  - Hardware torque/force limits                 │  │
│  │  - Safety-rated PLCs (redundant, certified)     │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Layer 2: Software Safety                       │  │
│  │  - Collision detection (force/torque sensing)   │  │
│  │  - Speed/force monitoring                       │  │
│  │  - Geofencing (virtual safety zones)            │  │
│  │  - State machine with safe transitions          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Layer 3: Operational Safety                    │  │
│  │  - Operator training                            │  │
│  │  - Safety zones (fencing, light curtains)       │  │
│  │  - Procedures for maintenance, recovery         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 4.3 Emergency Stop (E-Stop)

The E-stop is the most critical safety component. Design rules:

```
E-Stop Requirements:
──────────────────────────────────────────────────
1. HARDWIRED -- never depends on software
2. Normally closed -- wire break = stop (fail-safe)
3. Latching -- must be manually reset
4. Accessible -- within reach from any operating position
5. Red/yellow -- universally recognized
6. Cuts power to actuators directly
7. Does NOT cut power to brakes (brakes engage on power loss)
8. Does NOT cut power to safety controller

E-Stop Circuit:
                                    ┌──────────┐
  +24V ──┤E-STOP├──┤E-STOP├───────│  Safety  │
         (btn 1)    (btn 2)        │  Relay   │──── Motor Power
         NC          NC             │  (STO)   │
                                    └──────────┘
  If ANY button pressed OR wire broken → power cut
```

### 4.4 Watchdog Timers

A watchdog ensures software is alive and functioning:

```
┌──────────────────────────────────────────────┐
│           Watchdog Timer Operation             │
│                                              │
│  Normal:                                     │
│  Software ──kick──► Watchdog ──► (resets)    │
│  (every 10ms)      Timer         (no action) │
│                                              │
│  Software hung:                              │
│  Software ──(no kick)──► Watchdog ──► RESET! │
│                          Timer expires        │
│                          (triggers safety)    │
│                                              │
│  Implementation:                             │
│  Hardware watchdog on microcontroller        │
│  Software must write specific value to       │
│  watchdog register within timeout period     │
└──────────────────────────────────────────────┘
```

```cpp
// Watchdog kick in the real-time control loop
void control_loop() {
    while (running) {
        // 1. Read sensors
        read_sensors();

        // 2. Run safety checks BEFORE control
        bool safe = check_joint_limits()
                 && check_velocity_limits()
                 && check_force_limits()
                 && check_self_collision();

        if (!safe) {
            enter_safe_stop();
            // Do NOT kick watchdog -- let hardware safety engage
            continue;
        }

        // 3. Compute control
        compute_control();

        // 4. Write commands
        write_commands();

        // 5. Kick watchdog LAST (proves full loop completed)
        kick_watchdog();

        // 6. Wait for next cycle
        wait_for_next_period();
    }
}
```

### 4.5 Collaborative Robot Safety (ISO/TS 15066)

For robots working alongside humans:

```
Power and Force Limiting:

  Body Region          Max Pressure    Max Force
  ────────────────────────────────────────────────
  Skull/forehead       130 N/cm²       130 N
  Face                  65 N/cm²        65 N
  Chest                140 N/cm²       140 N
  Hand/fingers          N/A            140 N
  Abdomen              110 N/cm²       110 N

  Speed and Separation Monitoring:

  Sp = Sh + Sr + Ss + C + Zd + Zr

  where:
    Sh = human contribution to closing speed
    Sr = robot reaction distance
    Ss = robot stopping distance
    C  = intrusion distance (sensor response)
    Zd = position uncertainty of human
    Zr = position uncertainty of robot
```

---

## 5. Testing Strategies

### 5.1 The Testing Pyramid for Robotics

```
                    ▲
                   / \
                  /   \
                 / Field\         (hours, expensive)
                / Testing \
               /───────────\
              / Hardware-in \      (minutes, moderate)
             /   -the-Loop   \
            /─────────────────\
           /   Simulation      \   (seconds, cheap)
          /     Testing         \
         /───────────────────────\
        /     Integration         \  (seconds, cheap)
       /       Tests               \
      /─────────────────────────────\
     /        Unit Tests             \  (milliseconds, very cheap)
    /─────────────────────────────────\
```

### 5.2 Unit Testing

Test individual functions in isolation:

```python
import pytest
import numpy as np

def test_inverse_kinematics_reachable():
    """IK should return valid joint angles for reachable poses."""
    arm = RobotArm(link_lengths=[0.3, 0.3, 0.2])
    target = np.array([0.4, 0.0, 0.3])

    joints = arm.inverse_kinematics(target)

    assert joints is not None
    # Verify forward kinematics reaches the target
    achieved = arm.forward_kinematics(joints)
    np.testing.assert_allclose(achieved, target, atol=1e-3)

def test_inverse_kinematics_unreachable():
    """IK should return None for unreachable poses."""
    arm = RobotArm(link_lengths=[0.3, 0.3, 0.2])
    target = np.array([10.0, 0.0, 0.0])  # Way out of reach

    joints = arm.inverse_kinematics(target)

    assert joints is None

def test_pid_controller_convergence():
    """PID controller should converge to setpoint."""
    pid = PIDController(kp=1.0, ki=0.1, kd=0.05, dt=0.01)
    value = 0.0
    setpoint = 1.0

    for _ in range(1000):
        output = pid.compute(setpoint, value)
        value += output * 0.01  # Simple plant model

    assert abs(value - setpoint) < 0.01

def test_collision_checker_detects_overlap():
    """Collision checker should detect overlapping boxes."""
    checker = CollisionChecker()
    box_a = AABB(min=[0, 0, 0], max=[1, 1, 1])
    box_b = AABB(min=[0.5, 0.5, 0.5], max=[1.5, 1.5, 1.5])

    assert checker.check(box_a, box_b) is True

def test_collision_checker_no_overlap():
    """Collision checker should not flag non-overlapping boxes."""
    checker = CollisionChecker()
    box_a = AABB(min=[0, 0, 0], max=[1, 1, 1])
    box_b = AABB(min=[2, 2, 2], max=[3, 3, 3])

    assert checker.check(box_a, box_b) is False
```

### 5.3 Simulation Testing

Test behaviors in a physics simulator:

```python
def test_navigation_reaches_goal(sim_environment):
    """Robot should navigate to goal without collision."""
    robot = sim_environment.spawn_robot(position=[0, 0, 0])
    goal = [5.0, 3.0]
    obstacles = sim_environment.get_obstacle_positions()

    robot.navigate_to(goal)
    sim_environment.run(timeout=60.0)

    # Check goal reached
    final_pos = robot.get_position()[:2]
    distance_to_goal = np.linalg.norm(
        np.array(final_pos) - np.array(goal))
    assert distance_to_goal < 0.5, f"Did not reach goal: {distance_to_goal}m away"

    # Check no collisions occurred
    assert robot.collision_count == 0, \
        f"Robot collided {robot.collision_count} times"

    # Check reasonable path length (not too circuitous)
    path_length = robot.total_distance_traveled
    straight_line = np.linalg.norm(np.array(goal))
    assert path_length < straight_line * 3.0, \
        f"Path too long: {path_length}m (straight line: {straight_line}m)"
```

### 5.4 Hardware-in-the-Loop (HIL) Testing

Real hardware + simulated environment:

```
┌───────────────────────────────────────────────────┐
│           Hardware-in-the-Loop Setup               │
│                                                   │
│  ┌──────────────┐         ┌──────────────────┐   │
│  │ Real Robot    │ ◄─────► │ Simulated World  │   │
│  │ Controller    │ commands│ (physics,        │   │
│  │ (actual HW)  │ ◄─────► │  sensors)        │   │
│  │              │ feedback │                  │   │
│  └──────────────┘         └──────────────────┘   │
│                                                   │
│  Real components:        Simulated:              │
│  - Compute board         - Physics              │
│  - Motor drivers         - Obstacles             │
│  - Safety circuits       - Sensor data           │
│  - Communication bus     - Environment           │
│                                                   │
│  Benefits:                                        │
│  - Tests real software on real hardware           │
│  - No risk of physical damage                     │
│  - Repeatable scenarios                           │
│  - Can test edge cases safely                     │
└───────────────────────────────────────────────────┘
```

### 5.5 Field Testing

Structured approach to real-world validation:

```
Field Testing Progression:

Phase 1: Controlled Environment (lab)
  - Known obstacles, good lighting
  - Safety operator with E-stop
  - 100 runs, measure success rate

Phase 2: Semi-Controlled (staging area)
  - Some variability (lighting, people)
  - Safety perimeter, no bystanders
  - 500 runs over multiple days

Phase 3: Realistic Environment (target site)
  - Real conditions, supervised
  - Safety operator shadows robot
  - 1000+ runs, collect edge cases

Phase 4: Unsupervised Operation
  - Remote monitoring
  - Automated error reporting
  - Gradual increase in autonomy

Metrics to track at each phase:
  - Task success rate (%)
  - Mean time to completion
  - Intervention rate (human takeovers)
  - Safety violations (near-misses, contacts)
  - Uptime (hours without restart)
```

### 5.6 Regression Testing

```python
class RobotRegressionSuite:
    """Run after every code change to catch regressions."""

    SCENARIOS = [
        ("straight_corridor", {"length": 10, "width": 2}),
        ("sharp_turn", {"angle": 90, "radius": 0.5}),
        ("narrow_doorway", {"width": 0.8}),
        ("dynamic_obstacle", {"speed": 1.0}),
        ("low_battery", {"voltage": 22.5}),
        ("sensor_dropout", {"lidar_failure_at": 5.0}),
        ("rough_terrain", {"bump_height": 0.02}),
    ]

    def run_all(self, robot_config):
        results = {}
        for name, params in self.SCENARIOS:
            sim = create_simulation(name, params)
            result = sim.run(robot_config, timeout=120)
            results[name] = {
                "success": result.reached_goal,
                "time": result.completion_time,
                "collisions": result.collision_count,
                "safety_score": result.min_obstacle_distance,
            }
        return results
```

---

## 6. Deployment and Fleet Management

### 6.1 From Prototype to Production

```
┌─────────────────────────────────────────────────────┐
│          Deployment Maturity Model                    │
│                                                     │
│  TRL 1-3: Research                                  │
│    - Runs on developer laptop                       │
│    - Manual launch, manual monitoring               │
│    - "It works on my machine"                       │
│                                                     │
│  TRL 4-5: Integration                               │
│    - Runs on target hardware                        │
│    - Docker/containerized                           │
│    - Automated testing                              │
│                                                     │
│  TRL 6-7: Validation                                │
│    - OTA update system                              │
│    - Fleet management dashboard                     │
│    - Remote monitoring and logging                  │
│                                                     │
│  TRL 8-9: Production                                │
│    - Canary deployments (update 1 robot first)      │
│    - Automatic rollback on failure                  │
│    - 24/7 fleet monitoring                          │
│    - Predictive maintenance                         │
└─────────────────────────────────────────────────────┘

TRL = Technology Readiness Level (NASA scale)
```

### 6.2 Over-the-Air (OTA) Updates

```
OTA Update Pipeline:

  Developer ──► CI/CD ──► Staging ──► Canary ──► Fleet
                                     (1 robot)   (all)

  ┌──────────────────────────────────────────────┐
  │  OTA Update Package                           │
  │                                              │
  │  ┌──────────────────────┐                    │
  │  │ manifest.json        │                    │
  │  │  - version: "2.3.1"  │                    │
  │  │  - min_battery: 50%  │                    │
  │  │  - rollback: "2.3.0" │                    │
  │  │  - checksum: "sha256"│                    │
  │  └──────────────────────┘                    │
  │  ┌──────────────────────┐                    │
  │  │ firmware.bin         │ (MCU firmware)     │
  │  └──────────────────────┘                    │
  │  ┌──────────────────────┐                    │
  │  │ rootfs.squashfs      │ (Linux image)     │
  │  └──────────────────────┘                    │
  │  ┌──────────────────────┐                    │
  │  │ models/              │ (ML model weights)│
  │  └──────────────────────┘                    │
  └──────────────────────────────────────────────┘
```

### 6.3 Fleet Monitoring

```
Fleet Dashboard Metrics:

  Per-Robot:
  ├── Status: ACTIVE / IDLE / CHARGING / ERROR / UPDATING
  ├── Battery: 78% (est. 3.2 hrs remaining)
  ├── Position: Building A, Floor 2, Zone C
  ├── Task: Delivering package #4521
  ├── Software version: 2.3.1
  ├── Uptime: 14 hours 23 minutes
  ├── Tasks completed today: 47
  ├── Interventions today: 1 (stuck at door)
  └── Health:
      ├── CPU temp: 62°C (normal)
      ├── Motor currents: [1.2, 0.8, 1.1, 0.9] A (normal)
      ├── LiDAR health: OK (14,400 points/scan)
      └── Network: -62 dBm WiFi (good)

  Fleet-Wide:
  ├── Total robots: 24 (20 active, 3 charging, 1 error)
  ├── Tasks completed: 1,128 (today)
  ├── Average task time: 4.2 minutes
  ├── Intervention rate: 0.3% (target: < 1%)
  ├── Fleet uptime: 99.2%
  └── Alerts: 1 (Robot #7: left wheel encoder drift)
```

### 6.4 Logging and Data Collection

```python
class RobotLogger:
    """Structured logging for robot fleet management."""

    def __init__(self, robot_id, log_sink):
        self.robot_id = robot_id
        self.sink = log_sink

    def log_event(self, event_type, data):
        entry = {
            "robot_id": self.robot_id,
            "timestamp": time.time_ns(),
            "event": event_type,
            "data": data,
            "sw_version": self.get_sw_version(),
        }
        self.sink.write(entry)

    def log_task(self, task_id, status, duration_s, metrics):
        self.log_event("task", {
            "task_id": task_id,
            "status": status,  # "completed", "failed", "aborted"
            "duration_s": duration_s,
            "path_length_m": metrics.get("path_length"),
            "interventions": metrics.get("interventions", 0),
            "min_obstacle_dist_m": metrics.get("min_obstacle_dist"),
        })

    def log_anomaly(self, subsystem, description, severity):
        self.log_event("anomaly", {
            "subsystem": subsystem,
            "description": description,
            "severity": severity,  # "info", "warning", "critical"
        })
```

---

## 7. Regulatory Landscape

### 7.1 Key Standards and Certifications

```
┌─────────────────────────────────────────────────────┐
│            Regulatory Map by Domain                   │
│                                                     │
│  Industrial Robots:                                 │
│    ISO 10218-1/2 (robot safety)                    │
│    ISO/TS 15066 (collaborative robots)             │
│    CE marking (European market)                    │
│    ANSI/RIA 15.06 (US equivalent)                  │
│                                                     │
│  Mobile Robots (indoor):                           │
│    ISO 3691-4 (driverless industrial trucks)       │
│    ANSI/ITSDF B56.5 (US, AGVs)                    │
│    EN 1525 (European, AGVs)                        │
│                                                     │
│  Service Robots:                                    │
│    ISO 13482 (personal care robots)                │
│    UL 3100 (US, service robots)                    │
│                                                     │
│  Medical Robots:                                    │
│    FDA 510(k) or De Novo (US)                      │
│    EU MDR (European medical devices)               │
│    IEC 62304 (medical device software)             │
│    IEC 60601 (medical electrical equipment)        │
│                                                     │
│  Autonomous Vehicles:                               │
│    FMVSS (US federal motor vehicle standards)      │
│    UN R157 (automated lane keeping)                │
│    ISO 26262 (functional safety)                   │
│    UL 4600 (safety for autonomous products)        │
│                                                     │
│  Drones (UAS):                                      │
│    FAA Part 107 (US, small drones)                 │
│    EASA regulations (European)                     │
│    DO-178C (if safety-critical)                    │
└─────────────────────────────────────────────────────┘
```

### 7.2 CE Marking Process

For selling robots in the European market:

```
CE Marking Steps:

1. Identify applicable directives
   - Machinery Directive 2006/42/EC
   - EMC Directive 2014/30/EU
   - Low Voltage Directive 2014/35/EU
   - Radio Equipment Directive 2014/53/EU (if wireless)

2. Identify harmonized standards
   - EN ISO 10218 (industrial robots)
   - EN ISO 13849 (safety-related controls)

3. Perform risk assessment
   - Identify hazards (mechanical, electrical, thermal)
   - Assess risk (severity × probability)
   - Apply mitigation (inherent safety → safeguards → information)

4. Technical documentation
   - Design drawings, calculations, test reports
   - Risk assessment documentation
   - URDF-like specifications (but for legal compliance)

5. Declaration of Conformity
   - Manufacturer declares compliance
   - Affix CE mark to product

6. Notified Body (if required)
   - Some categories require third-party audit
```

### 7.3 FDA Pathway for Medical Robots

```
FDA Classification:

Class I:   Low risk (surgical retractors)
           → General controls only
           → 510(k) usually exempt

Class II:  Moderate risk (surgical robots)
           → 510(k) clearance
           → Demonstrate "substantial equivalence"
              to a legally marketed device
           → Most surgical robots: Class II

Class III: High risk (implantable, life-sustaining)
           → PMA (Pre-Market Approval)
           → Clinical trials required
           → Very expensive, very slow

Timeline: 510(k) = 3-12 months
          PMA    = 1-3 years
          Cost:  $5K-$50K (510(k)) vs. $500K-$5M+ (PMA)
```

---

## 8. Ethics of Autonomous Systems

### 8.1 Key Ethical Dimensions

```
┌──────────────────────────────────────────────────────┐
│            Ethical Considerations                      │
│                                                      │
│  Safety & Harm:                                      │
│    Who is responsible when an autonomous robot        │
│    injures someone? The manufacturer? The operator?  │
│    The algorithm designer?                           │
│                                                      │
│  Autonomy & Control:                                 │
│    How much decision-making should be delegated      │
│    to machines? When must a human be in the loop?    │
│                                                      │
│  Transparency:                                       │
│    Can the robot explain why it took an action?      │
│    Is the decision-making process auditable?         │
│                                                      │
│  Bias & Fairness:                                    │
│    Do perception systems work equally well for all   │
│    people? (skin tone, clothing, mobility aids)      │
│                                                      │
│  Employment:                                         │
│    What happens to workers displaced by robots?      │
│    Who benefits from automation gains?               │
│                                                      │
│  Privacy:                                            │
│    Robots with cameras in homes, hospitals, offices. │
│    Data collection, storage, and access policies.    │
│                                                      │
│  Dual Use:                                           │
│    The same navigation system guides a delivery      │
│    robot and a military drone.                       │
└──────────────────────────────────────────────────────┘
```

### 8.2 Levels of Autonomy

```
Level 0: Manual
  Human controls everything.
  Robot is a tool.

Level 1: Assistance
  Robot handles simple subtasks.
  Human makes all decisions.
  Example: Power steering, ABS.

Level 2: Partial Autonomy
  Robot handles defined tasks.
  Human supervises and intervenes.
  Example: Adaptive cruise control, warehouse AGVs.

Level 3: Conditional Autonomy
  Robot handles most situations.
  Human takes over when requested.
  Example: Highway autopilot (limited conditions).

Level 4: High Autonomy
  Robot handles all situations in defined domain.
  No human intervention expected (within domain).
  Example: Robotaxi in geofenced area.

Level 5: Full Autonomy
  Robot handles all situations everywhere.
  No human intervention needed.
  Example: Does not exist yet.
```

### 8.3 Design Principles

```
Ethical Design Checklist for Robot Systems:

□ Fail-safe behavior defined (what happens on error?)
□ Human override always available (E-stop, remote kill)
□ Decision logging enabled (for post-incident analysis)
□ Perception tested across demographics
□ Privacy policy for collected sensor data
□ Clear documentation of system limitations
□ Operator training program defined
□ Incident reporting and response procedures
□ Regular safety audits scheduled
□ Affected community stakeholders consulted
```

---

## Interview Questions

**Q1: What is the difference between hard real-time and soft real-time? Give robotics examples of each.**

Hard real-time: missing a deadline is a system failure. Examples: motor
control loop (missing means jerky motion or instability), airbag deployment,
emergency braking. Soft real-time: missing a deadline degrades quality but
is not catastrophic. Examples: video streaming for teleoperation (frame
drops are acceptable), path planning updates (old plan still works briefly).

**Q2: Why can't you use standard Linux for a 1 kHz motor control loop?**

Standard Linux has non-deterministic latency due to: page faults (virtual
memory), kernel preemption delays, interrupt handling, filesystem I/O, and
CPU frequency scaling. Worst-case latency can be 10-100ms, far exceeding
the 1ms deadline. Solutions: PREEMPT_RT patch (brings worst case to ~50us),
dedicated RTOS on a microcontroller, or Xenomai for hard RT on Linux.

**Q3: Describe the safety architecture layers for a collaborative robot.**

Layer 0 (mechanical): Compliant joints, padded surfaces, backdrivable
actuators. Layer 1 (hardware): Hardwired E-stop, watchdog timer, hardware
torque limits, dual-channel safety circuits. Layer 2 (software): Collision
detection via force sensing, speed/force monitoring per ISO/TS 15066,
virtual safety zones. Layer 3 (operational): Safety training, defined
operating procedures, workspace risk assessment. Each layer must function
independently -- software failures should never bypass hardware safety.

**Q4: Compare CAN bus and EtherCAT for a 12-DOF robot arm.**

CAN: 1 Mbps, 8 bytes per frame, multi-master, up to 40m. Adequate for
sending joint commands and reading encoders if update rate is moderate
(1 kHz with 12 joints is feasible but tight). EtherCAT: 100 Mbps, one
Ethernet frame services all slaves in < 100us, sub-microsecond
synchronization. EtherCAT is better for high-DOF arms needing tight
synchronization. CAN is simpler, cheaper, and sufficient for many robots.

**Q5: What is a watchdog timer and why is it essential for safety?**

A hardware watchdog timer must be periodically "kicked" by software. If
software hangs (crash, infinite loop, deadlock), the watchdog expires and
triggers a safety response (reset, safe stop). It is essential because
software can fail in ways that bypass all software safety checks. The
watchdog must be kicked at the END of the control loop to prove the entire
loop completed successfully.

**Q6: Walk through the testing strategy for a new autonomous mobile robot.**

Start with unit tests for individual algorithms (path planner, controller,
collision checker). Then integration tests verifying components work together
(planner output feeds controller correctly). Simulation testing runs the full
stack in physics simulation across hundreds of scenarios. HIL testing runs
real software on real hardware with simulated environment. Field testing
progresses from controlled lab to semi-controlled staging to real-world
deployment. Maintain regression tests that run after every code change.

**Q7: What is Hardware-in-the-Loop testing and when is it essential?**

HIL testing runs real control software on real hardware (compute board,
motor drivers, safety circuits) but with a simulated environment providing
sensor data and accepting commands. It is essential when: timing matters
(verifying real-time behavior), hardware interfaces must be validated,
safety circuits must be tested without risk of damage, and before first
physical deployment. It catches bugs that pure simulation misses.

**Q8: How would you design an OTA update system for a fleet of 100 robots?**

Requirements: (1) Atomic updates with rollback (A/B partition scheme).
(2) Pre-update checks (battery > 50%, robot idle, connectivity stable).
(3) Canary deployment (update 2-3 robots first, monitor for 24 hours).
(4) Staged rollout (10%, 25%, 50%, 100% over days). (5) Automatic rollback
if health metrics degrade. (6) Signed update packages (prevent tampering).
(7) Differential updates (send only changed files to save bandwidth).

**Q9: What regulations apply to deploying a mobile robot in a hospital?**

Medical device regulations (FDA 510(k) in US, EU MDR in Europe), IEC 62304
for software development lifecycle, IEC 60601 for electrical safety, ISO
13482 for service robot safety, hospital infection control requirements
(cleanable surfaces), HIPAA compliance (if handling patient data), fire
safety codes, and ADA accessibility requirements. The regulatory path
depends on the robot's intended use (logistics vs. patient interaction
vs. surgical assistance).

**Q10: Explain the power budget considerations for a battery-powered mobile robot.**

Power budget accounts for all consumers: drive motors (typically largest),
compute (Jetson, 15-60W), sensors (LiDAR, cameras, 10-20W), communication,
and ancillary systems. Design for peak power (all motors max + compute +
sensors) and budget for typical. Battery capacity (Wh) divided by typical
power gives runtime estimate. Include 20% margin for degradation. Consider
thermal management (motors and compute generate heat). Plan charging
strategy (how long to charge vs. operate).

**Q11: What are the key differences between SPI and I2C, and when would you use each?**

SPI: 4 wires, full-duplex, up to 100 MHz, separate chip select per device.
Use for high-speed, low-latency communication (IMU at 1 kHz, high-resolution
ADC). I2C: 2 wires, half-duplex, up to 3.4 MHz, addressed bus. Use when
pin count is limited, speed is not critical (temperature sensors, EEPROMs,
slow sensors). SPI is faster but uses more pins. I2C supports more devices
on fewer wires but is slower and more complex.

**Q12: How do you ensure deterministic timing in a real-time control loop on Linux?**

Use PREEMPT_RT kernel. Set real-time scheduling policy (SCHED_FIFO) with
high priority. Lock all memory (mlockall). Pre-fault stack and heap pages.
Disable CPU frequency scaling. Avoid all blocking operations in the RT
thread (no malloc, no I/O, no mutexes). Use clock_nanosleep for precise
timing. Isolate CPU cores for RT threads (isolcpus). Measure worst-case
latency with cyclictest before deployment.

**Q13: What is functional safety, and how does ISO 13849 apply to robotics?**

Functional safety ensures that safety-related control systems perform their
intended function correctly. ISO 13849 defines Performance Levels (PL a-e)
based on the probability of dangerous failure per hour. To achieve a given
PL, you must consider: architecture (single vs. redundant channels),
component reliability (MTTFd), diagnostic coverage (DC), and common cause
failure avoidance. A collaborative robot typically requires PL d or e for
its safety functions (E-stop, speed limiting, force limiting).

**Q14: Discuss the ethical implications of deploying autonomous robots in public spaces.**

Key concerns: safety (who is liable for injuries), privacy (cameras
recording in public), accessibility (robots blocking wheelchair paths),
employment (displacing workers), equity (benefits accrue to companies while
costs are distributed), transparency (can the public understand robot
behavior), and consent (people may not choose to interact with robots).
Responsible deployment requires stakeholder engagement, clear liability
frameworks, data governance policies, and ongoing monitoring of societal
impact.
