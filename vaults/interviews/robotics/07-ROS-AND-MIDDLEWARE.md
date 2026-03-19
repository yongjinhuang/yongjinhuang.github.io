# Chapter 7: ROS 2 & Robotics Middleware -- The Software Backbone

> "ROS is not an operating system. It is the plumbing that lets thousands of
> robotics researchers avoid reinventing the same plumbing."

Every serious robotics project eventually faces the same question: how do you
wire together perception, planning, and control into a coherent system? ROS 2
(Robot Operating System 2) is the industry's answer. This chapter covers its
architecture, core abstractions, and the ecosystem tools that make it the
de facto standard for robotics software.

---

## 1. Why ROS Exists

### 1.1 The Problem Before ROS

Before ROS, every robotics lab wrote its own middleware:

```
Lab A:  Custom TCP sockets + shared memory + Makefiles
Lab B:  CORBA-based message passing + custom build system
Lab C:  POSIX message queues + proprietary data formats
```

The result: no code reuse. A SLAM algorithm written at MIT could not easily
run on hardware at Stanford. Drivers were rewritten dozens of times.

### 1.2 What ROS Provides

ROS provides four fundamental capabilities:

1. **Message passing** -- Typed, language-agnostic communication between processes
2. **Hardware abstraction** -- Standard interfaces for sensors and actuators
3. **Package management** -- Distributable, reusable software modules
4. **Tooling** -- Visualization (RViz), logging (rosbag), simulation (Gazebo)

### 1.3 ROS 1 vs. ROS 2

| Feature     | ROS 1                   | ROS 2                     |
| ----------- | ----------------------- | ------------------------- |
| Middleware  | Custom (TCPROS/UDPROS)  | DDS (industry standard)   |
| Discovery   | Centralized (rosmaster) | Decentralized (DDS)       |
| Real-time   | Not supported           | Supported (with care)     |
| Security    | None built-in           | DDS Security (SROS2)      |
| Multi-robot | Hacky (namespaces)      | First-class (DDS domains) |
| Lifecycle   | None                    | Managed lifecycle nodes   |
| OS support  | Linux only (official)   | Linux, macOS, Windows     |
| Python      | Python 2 (rospy)        | Python 3 (rclpy)          |

ROS 2 is the current standard. ROS 1 reached end-of-life in May 2025.

---

## 2. ROS 2 Architecture

### 2.1 The Layered Architecture

```
┌─────────────────────────────────────────────┐
│              User Application               │
│         (your nodes, launch files)          │
├─────────────────────────────────────────────┤
│         Client Libraries (rclpy, rclcpp)    │
├─────────────────────────────────────────────┤
│                rcl (ROS Client Library)      │
│              Common C implementation        │
├─────────────────────────────────────────────┤
│              rmw (ROS Middleware Interface)  │
│           Abstract middleware layer         │
├─────────────────────────────────────────────┤
│         DDS Implementation                  │
│   (CycloneDDS, FastDDS, Connext, etc.)     │
├─────────────────────────────────────────────┤
│              UDP/TCP/Shared Memory           │
└─────────────────────────────────────────────┘
```

The key insight: the `rmw` layer is an abstraction. You can swap DDS vendors
without changing your application code.

### 2.2 DDS -- The Communication Backbone

DDS (Data Distribution Service) is an OMG standard for real-time
publish/subscribe communication. Key concepts:

- **Domain Participant**: A DDS entity that joins a communication domain
- **Topic**: A named channel with a defined data type
- **Quality of Service (QoS)**: Policies controlling reliability, durability, etc.
- **Discovery**: Automatic, decentralized peer discovery (no central broker)

```
┌──────────────┐                    ┌──────────────┐
│   Node A     │   DDS Discovery    │   Node B     │
│              │◄──────────────────►│              │
│  Publisher   │                    │  Subscriber  │
│  /cmd_vel    │────── Topic ──────►│  /cmd_vel    │
│              │   Twist message    │              │
└──────────────┘                    └──────────────┘
        No central broker needed!
```

### 2.3 QoS Profiles

QoS is one of the most important (and most misunderstood) features of ROS 2:

| Policy      | Options                    | Use Case                 |
| ----------- | -------------------------- | ------------------------ |
| Reliability | RELIABLE / BEST_EFFORT     | Sensor data vs. commands |
| Durability  | TRANSIENT_LOCAL / VOLATILE | Late-joining subscribers |
| History     | KEEP_LAST(N) / KEEP_ALL    | Buffer depth             |
| Deadline    | Duration                   | Detect stale data        |
| Liveliness  | AUTOMATIC / MANUAL         | Detect dead nodes        |

Common pitfall: a RELIABLE publisher and a BEST_EFFORT subscriber will NOT
connect. QoS must be compatible.

```python
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy

sensor_qos = QoSProfile(
    reliability=ReliabilityPolicy.BEST_EFFORT,
    durability=DurabilityPolicy.VOLATILE,
    depth=5
)

command_qos = QoSProfile(
    reliability=ReliabilityPolicy.RELIABLE,
    durability=DurabilityPolicy.TRANSIENT_LOCAL,
    depth=10
)
```

---

## 3. Nodes, Topics, Services, and Actions

### 3.1 Nodes

A node is the fundamental computation unit. Each node should do one thing well.

**Python (rclpy):**

```python
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class VelocityPublisher(Node):
    def __init__(self):
        super().__init__('velocity_publisher')
        self.publisher = self.create_publisher(Twist, '/cmd_vel', 10)
        self.timer = self.create_timer(0.1, self.publish_velocity)
        self.get_logger().info('Velocity publisher started')

    def publish_velocity(self):
        msg = Twist()
        msg.linear.x = 0.5
        msg.angular.z = 0.1
        self.publisher.publish(msg)

def main():
    rclpy.init()
    node = VelocityPublisher()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
```

**C++ (rclcpp):**

```cpp
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>

class VelocityPublisher : public rclcpp::Node {
public:
    VelocityPublisher() : Node("velocity_publisher") {
        publisher_ = this->create_publisher<geometry_msgs::msg::Twist>(
            "/cmd_vel", 10);
        timer_ = this->create_wall_timer(
            std::chrono::milliseconds(100),
            std::bind(&VelocityPublisher::publish_velocity, this));
        RCLCPP_INFO(this->get_logger(), "Velocity publisher started");
    }

private:
    void publish_velocity() {
        auto msg = geometry_msgs::msg::Twist();
        msg.linear.x = 0.5;
        msg.angular.z = 0.1;
        publisher_->publish(msg);
    }

    rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<VelocityPublisher>());
    rclcpp::shutdown();
    return 0;
}
```

### 3.2 Topics -- Publish/Subscribe

Topics provide anonymous, many-to-many, asynchronous communication.

```
                    /camera/image_raw
  ┌──────────┐    ─────────────────►    ┌─────────────┐
  │  Camera   │                         │  Detector   │
  │  Driver   │    /camera/info         │  Node       │
  │  Node     │    ─────────────────►   │             │
  └──────────┘                          └─────────────┘
       │                                      │
       │         /camera/image_raw            │
       │    ─────────────────►    ┌───────────┴──┐
       │                         │  SLAM Node    │
       └─────────────────────────┤              │
                                 └──────────────┘

  One publisher, multiple subscribers. Fully decoupled.
```

### 3.3 Services -- Request/Reply

Services are synchronous RPC calls. Use when you need a response.

```python
# Service definition (SetBool.srv is built-in):
# bool data
# ---
# bool success
# string message

# Server
from std_srvs.srv import SetBool

class GripperService(Node):
    def __init__(self):
        super().__init__('gripper_service')
        self.srv = self.create_service(
            SetBool, 'set_gripper', self.gripper_callback)

    def gripper_callback(self, request, response):
        if request.data:
            self.get_logger().info('Gripper: CLOSE')
        else:
            self.get_logger().info('Gripper: OPEN')
        response.success = True
        response.message = 'Gripper command executed'
        return response

# Client (async)
class GripperClient(Node):
    def __init__(self):
        super().__init__('gripper_client')
        self.client = self.create_client(SetBool, 'set_gripper')
        while not self.client.wait_for_service(timeout_sec=1.0):
            self.get_logger().warn('Waiting for gripper service...')

    async def close_gripper(self):
        request = SetBool.Request()
        request.data = True
        future = self.client.call_async(request)
        result = await future
        return result.success
```

### 3.4 Actions -- Long-Running Tasks

Actions combine a goal, feedback, and a result. They are the correct
abstraction for tasks like "navigate to point B" or "pick up the cup."

```
┌──────────┐                        ┌──────────────┐
│  Action  │    Goal Request        │   Action     │
│  Client  │───────────────────────►│   Server     │
│          │◄───────────────────────│              │
│          │    Goal Response       │              │
│          │                        │              │
│          │    Feedback (stream)   │              │
│          │◄───────────────────────│              │
│          │    (progress updates)  │              │
│          │                        │              │
│          │    Result              │              │
│          │◄───────────────────────│              │
│          │    (final outcome)     │              │
└──────────┘                        └──────────────┘
        Client can cancel at any time!
```

```python
# Action definition (NavigateToPose.action from nav2):
# geometry_msgs/PoseStamped pose
# string behavior_tree
# ---
# std_msgs/Empty result
# ---
# geometry_msgs/PoseStamped current_pose
# float32 distance_remaining

from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient

class Navigator(Node):
    def __init__(self):
        super().__init__('navigator')
        self.action_client = ActionClient(
            self, NavigateToPose, 'navigate_to_pose')

    def navigate_to(self, x, y, theta):
        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = 'map'
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        # Set orientation from theta...

        self.action_client.wait_for_server()
        future = self.action_client.send_goal_async(
            goal, feedback_callback=self.feedback_callback)
        return future

    def feedback_callback(self, feedback_msg):
        remaining = feedback_msg.feedback.distance_remaining
        self.get_logger().info(f'Distance remaining: {remaining:.2f}m')
```

---

## 4. Lifecycle Nodes

### 4.1 The Problem with Unmanaged Nodes

Standard nodes start doing work immediately upon construction. This causes
race conditions: what if the sensor driver starts publishing before the
processing node is ready?

### 4.2 Managed Lifecycle

Lifecycle (managed) nodes follow a state machine:

```
                ┌──────────────┐
                │  Unconfigured │
                └──────┬───────┘
                       │ on_configure()
                ┌──────▼───────┐
                │   Inactive   │
                └──────┬───────┘
                       │ on_activate()
                ┌──────▼───────┐
                │    Active    │◄──────┐
                └──────┬───────┘       │
                       │ on_deactivate()
                ┌──────▼───────┐       │
                │   Inactive   │───────┘
                └──────┬───────┘  on_activate()
                       │ on_cleanup()
                ┌──────▼───────┐
                │  Unconfigured │
                └──────┬───────┘
                       │ on_shutdown()
                ┌──────▼───────┐
                │   Finalized  │
                └──────────────┘
```

```cpp
#include <rclcpp_lifecycle/lifecycle_node.hpp>

class ManagedSensor : public rclcpp_lifecycle::LifecycleNode {
public:
    ManagedSensor() : LifecycleNode("managed_sensor") {}

    CallbackReturn on_configure(const rclcpp_lifecycle::State&) override {
        // Allocate resources, read parameters
        publisher_ = this->create_publisher<sensor_msgs::msg::LaserScan>(
            "scan", 10);
        RCLCPP_INFO(get_logger(), "Configured");
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_activate(const rclcpp_lifecycle::State&) override {
        // Start publishing, enable hardware
        timer_ = this->create_wall_timer(
            50ms, std::bind(&ManagedSensor::scan_callback, this));
        RCLCPP_INFO(get_logger(), "Activated");
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_deactivate(const rclcpp_lifecycle::State&) override {
        timer_->cancel();
        RCLCPP_INFO(get_logger(), "Deactivated");
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_cleanup(const rclcpp_lifecycle::State&) override {
        publisher_.reset();
        RCLCPP_INFO(get_logger(), "Cleaned up");
        return CallbackReturn::SUCCESS;
    }

private:
    // ...
};
```

---

## 5. URDF -- Describing Your Robot

### 5.1 What is URDF?

URDF (Unified Robot Description Format) is an XML format that describes a
robot's physical structure: links (rigid bodies) and joints (connections).

```xml
<?xml version="1.0"?>
<robot name="simple_arm">
  <!-- Base link (fixed to world) -->
  <link name="base_link">
    <visual>
      <geometry>
        <cylinder radius="0.05" length="0.1"/>
      </geometry>
    </visual>
    <collision>
      <geometry>
        <cylinder radius="0.05" length="0.1"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="1.0"/>
      <inertia ixx="0.001" iyy="0.001" izz="0.001"
               ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <!-- First arm segment -->
  <link name="link_1">
    <visual>
      <geometry>
        <box size="0.04 0.04 0.3"/>
      </geometry>
      <origin xyz="0 0 0.15"/>
    </visual>
    <collision>
      <geometry>
        <box size="0.04 0.04 0.3"/>
      </geometry>
      <origin xyz="0 0 0.15"/>
    </collision>
    <inertial>
      <mass value="0.5"/>
      <origin xyz="0 0 0.15"/>
      <inertia ixx="0.004" iyy="0.004" izz="0.0001"
               ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <!-- Revolute joint connecting base to link_1 -->
  <joint name="joint_1" type="revolute">
    <parent link="base_link"/>
    <child link="link_1"/>
    <origin xyz="0 0 0.05" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"
           effort="10.0" velocity="1.0"/>
  </joint>
</robot>
```

### 5.2 URDF Joint Types

```
Fixed:      No motion (sensor mount to body)
Revolute:   Rotation about one axis with limits (elbow)
Continuous:  Rotation about one axis, no limits (wheel)
Prismatic:  Translation along one axis (linear actuator)
Floating:   6-DOF (mobile base, rarely used directly)
Planar:     Translation in a plane
```

### 5.3 Xacro -- URDF Macros

Raw URDF is verbose. Xacro adds macros, properties, and conditionals:

```xml
<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="arm">
  <xacro:property name="link_length" value="0.3"/>
  <xacro:property name="link_radius" value="0.02"/>

  <xacro:macro name="arm_link" params="name length">
    <link name="${name}">
      <visual>
        <geometry>
          <cylinder radius="${link_radius}" length="${length}"/>
        </geometry>
        <origin xyz="0 0 ${length/2}"/>
      </visual>
    </link>
  </xacro:macro>

  <xacro:arm_link name="link_1" length="${link_length}"/>
  <xacro:arm_link name="link_2" length="${link_length * 0.8}"/>
</robot>
```

---

## 6. tf2 -- Coordinate Transforms

### 6.1 The Transform Tree

Every sensor and actuator on a robot has its own coordinate frame. tf2
maintains a tree of transforms between all frames, updated in real time.

```
                    map
                     │
                     │ (localization)
                     ▼
                    odom
                     │
                     │ (odometry)
                     ▼
                 base_link
                 ┌───┼───┐
                 │   │   │
                 ▼   ▼   ▼
            left_  base_  right_
            wheel  laser  wheel
                   │
                   ▼
                 camera_link
                   │
                   ▼
              camera_optical
```

### 6.2 Broadcasting Transforms

```python
import rclpy
from rclpy.node import Node
from tf2_ros import TransformBroadcaster
from geometry_msgs.msg import TransformStamped
import math

class OdomBroadcaster(Node):
    def __init__(self):
        super().__init__('odom_broadcaster')
        self.br = TransformBroadcaster(self)
        self.timer = self.create_timer(0.02, self.broadcast_transform)
        self.x = 0.0
        self.y = 0.0
        self.theta = 0.0

    def broadcast_transform(self):
        t = TransformStamped()
        t.header.stamp = self.get_clock().now().to_msg()
        t.header.frame_id = 'odom'
        t.child_frame_id = 'base_link'

        t.transform.translation.x = self.x
        t.transform.translation.y = self.y
        t.transform.translation.z = 0.0

        # Quaternion from yaw angle
        t.transform.rotation.z = math.sin(self.theta / 2.0)
        t.transform.rotation.w = math.cos(self.theta / 2.0)

        self.br.sendTransform(t)
```

### 6.3 Listening for Transforms

```python
from tf2_ros import Buffer, TransformListener

class TransformUser(Node):
    def __init__(self):
        super().__init__('transform_user')
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)

    def get_robot_pose_in_map(self):
        try:
            transform = self.tf_buffer.lookup_transform(
                'map', 'base_link', rclpy.time.Time())
            return transform
        except Exception as e:
            self.get_logger().warn(f'Transform not available: {e}')
            return None
```

### 6.4 Static vs. Dynamic Transforms

- **Static**: Never change (e.g., camera mount position). Published once.
- **Dynamic**: Change over time (e.g., odometry). Published continuously.

Static transforms use `StaticTransformBroadcaster` and are latched (new
subscribers receive the last published value).

---

## 7. Launch Files

### 7.1 Purpose

Launch files start multiple nodes with the correct parameters, remappings,
and configuration. They replace typing dozens of `ros2 run` commands.

### 7.2 Python Launch Files

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    use_sim = DeclareLaunchArgument(
        'use_sim_time', default_value='false',
        description='Use simulation clock')

    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{
            'robot_description': open('robot.urdf').read(),
            'use_sim_time': LaunchConfiguration('use_sim_time'),
        }],
    )

    lidar_node = Node(
        package='rplidar_ros',
        executable='rplidar_node',
        parameters=[{
            'serial_port': '/dev/ttyUSB0',
            'frame_id': 'base_laser',
        }],
        remappings=[
            ('scan', '/robot/scan'),
        ],
    )

    slam_node = Node(
        package='slam_toolbox',
        executable='async_slam_toolbox_node',
        parameters=['config/slam_params.yaml'],
    )

    return LaunchDescription([
        use_sim,
        robot_state_publisher,
        lidar_node,
        slam_node,
    ])
```

### 7.3 Composable Nodes

For performance, multiple nodes can run in a single process, communicating
via shared memory instead of DDS serialization:

```python
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

container = ComposableNodeContainer(
    name='perception_container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        ComposableNode(
            package='image_proc',
            plugin='image_proc::RectifyNode',
            name='rectify',
        ),
        ComposableNode(
            package='depth_image_proc',
            plugin='depth_image_proc::PointCloudXyzrgbNode',
            name='point_cloud',
        ),
    ],
)
```

---

## 8. Gazebo Simulation

### 8.1 Why Simulate?

- Robots are expensive. Crashes cost money.
- Simulation lets you test 24/7 without hardware.
- You can test dangerous scenarios safely.
- Parallelizable: run 100 robots simultaneously.

### 8.2 Gazebo Architecture (Ignition/Gz)

```
┌──────────────────────────────────────────┐
│              Gazebo Simulator             │
│                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Physics  │  │ Rendering│  │Sensors │ │
│  │ Engine   │  │ Engine   │  │Plugins │ │
│  │ (DART/   │  │ (OGRE2)  │  │(LiDAR, │ │
│  │  Bullet) │  │          │  │Camera) │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │            │      │
│       └──────┬───────┴────────────┘      │
│              │                           │
│       ┌──────▼──────┐                    │
│       │  gz-transport│                   │
│       │  (internal)  │                   │
│       └──────┬──────┘                    │
│              │                           │
│       ┌──────▼──────┐                    │
│       │  ros_gz_     │                   │
│       │  bridge      │                   │
│       └──────┬──────┘                    │
└──────────────┼───────────────────────────┘
               │
        ┌──────▼──────┐
        │   ROS 2     │
        │   Topics    │
        └─────────────┘
```

### 8.3 Spawning a Robot in Gazebo

```python
from launch_ros.actions import Node as RosNode
from launch.actions import ExecuteProcess

# Start Gazebo
gazebo = ExecuteProcess(
    cmd=['gz', 'sim', '-r', 'empty.sdf'],
    output='screen',
)

# Spawn robot from URDF
spawn_robot = RosNode(
    package='ros_gz_sim',
    executable='create',
    arguments=[
        '-name', 'my_robot',
        '-topic', 'robot_description',
        '-x', '0.0',
        '-y', '0.0',
        '-z', '0.5',
    ],
)
```

---

## 9. MoveIt -- Motion Planning

### 9.1 What MoveIt Does

MoveIt is the standard framework for robotic arm manipulation:

- **Motion planning**: Compute collision-free trajectories
- **Kinematics**: Forward and inverse kinematics solvers
- **Collision checking**: Detect collisions with the environment
- **Grasping**: Plan grasp poses
- **Trajectory execution**: Send plans to the real robot

### 9.2 MoveIt Architecture

```
┌─────────────────────────────────────────────────┐
│                   MoveIt 2                       │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Planning │  │ Collision│  │  Kinematics   │ │
│  │ Pipeline │  │ Checking │  │  (KDL/TRAC-IK)│ │
│  │ (OMPL)   │  │ (FCL)    │  │               │ │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘ │
│       └──────────────┼────────────────┘         │
│                      │                          │
│              ┌───────▼────────┐                 │
│              │  Move Group    │                 │
│              │  (Action Server)│                │
│              └───────┬────────┘                 │
└──────────────────────┼──────────────────────────┘
                       │
               ┌───────▼────────┐
               │  ros2_control  │
               │  (controllers) │
               └───────┬────────┘
                       │
               ┌───────▼────────┐
               │  Robot Hardware│
               └────────────────┘
```

### 9.3 Using MoveIt from Python

```python
from moveit2 import MoveIt2
from geometry_msgs.msg import Pose

class PickAndPlace(Node):
    def __init__(self):
        super().__init__('pick_and_place')
        self.moveit = MoveIt2(
            node=self,
            joint_names=['joint_1', 'joint_2', 'joint_3',
                         'joint_4', 'joint_5', 'joint_6'],
            base_link_name='base_link',
            end_effector_name='tool0',
        )

    def move_to_pose(self, x, y, z):
        pose = Pose()
        pose.position.x = x
        pose.position.y = y
        pose.position.z = z
        pose.orientation.w = 1.0  # facing down

        self.moveit.set_pose_goal(pose)
        plan = self.moveit.plan()
        if plan:
            self.moveit.execute(plan)
            self.get_logger().info('Motion complete')
        else:
            self.get_logger().error('Planning failed')
```

---

## 10. Nav2 -- Autonomous Navigation

### 10.1 The Navigation Stack

Nav2 provides everything a mobile robot needs to navigate autonomously:

```
┌──────────────────────────────────────────────────────┐
│                      Nav2                             │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Global  │  │   Local      │  │   Recovery     │ │
│  │  Planner │  │   Controller │  │   Behaviors    │ │
│  │(NavFn/   │  │(DWB/MPPI/    │  │(Spin/BackUp/  │ │
│  │ Smac)    │  │ TEB)         │  │ Wait)          │ │
│  └────┬─────┘  └──────┬───────┘  └───────┬────────┘ │
│       │               │                  │          │
│  ┌────▼───────────────▼──────────────────▼────────┐ │
│  │              Behavior Tree (BT)                 │ │
│  │         (Orchestrates the full pipeline)        │ │
│  └─────────────────────┬──────────────────────────┘ │
│                        │                            │
│  ┌─────────────────────▼──────────────────────────┐ │
│  │              Costmap 2D                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │ │
│  │  │ Static   │ │ Obstacle │ │  Inflation     │  │ │
│  │  │ Layer    │ │ Layer    │ │  Layer         │  │ │
│  │  └──────────┘ └──────────┘ └────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 10.2 The Costmap

The costmap is a 2D grid where each cell has a cost:

```
0   = Free space
1-252 = Increasing cost (proximity to obstacles)
253 = Inscribed obstacle (robot center would collide)
254 = Lethal obstacle (definitely collision)
255 = Unknown
```

Layers are stacked:

1. **Static layer**: From the map (walls, furniture)
2. **Obstacle layer**: From live sensors (people, new objects)
3. **Inflation layer**: Grows obstacles by robot radius

### 10.3 Behavior Trees for Navigation

Nav2 uses behavior trees (not state machines) to orchestrate navigation:

```
                  [Sequence]
                 /          \
        [NavigateRecovery]   [GoalReached?]
        /              \
   [PipelineSequence]  [RecoveryFallback]
   /        |          /        \
[Planner] [Controller] [Spin] [BackUp]
```

Behavior trees are more modular than state machines. You can swap planners,
controllers, and recovery behaviors by editing an XML file.

---

## 11. ros2_control -- Hardware Abstraction

### 11.1 The Problem

Every robot has different hardware interfaces. Without abstraction, every
controller must know about specific motor drivers, encoders, etc.

### 11.2 Architecture

```
┌───────────────────────────────────────────────┐
│              Controller Manager                │
│                                               │
│  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Joint       │  │ Diff Drive Controller   │ │
│  │ Trajectory  │  │ (converts cmd_vel to    │ │
│  │ Controller  │  │  wheel velocities)      │ │
│  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                     │               │
│  ┌──────▼─────────────────────▼─────────────┐ │
│  │         Hardware Interface (API)          │ │
│  │   read() / write() at fixed frequency    │ │
│  └──────┬───────────────────────────────────┘ │
└─────────┼─────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────┐
│        Hardware Resource Layer                 │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐ │
│  │  GPIO       │  │  CAN Bus │  │  EtherCAT│ │
│  │  Driver     │  │  Driver  │  │  Driver  │ │
│  └─────────────┘  └──────────┘  └──────────┘ │
└───────────────────────────────────────────────┘
```

### 11.3 Writing a Hardware Interface

```cpp
#include <hardware_interface/system_interface.hpp>

class MyRobotHardware : public hardware_interface::SystemInterface {
public:
    hardware_interface::return_type read(
        const rclcpp::Time& time,
        const rclcpp::Duration& period) override
    {
        // Read encoder positions from hardware
        for (size_t i = 0; i < joint_positions_.size(); ++i) {
            joint_positions_[i] = read_encoder(i);
            joint_velocities_[i] = read_velocity(i);
        }
        return hardware_interface::return_type::OK;
    }

    hardware_interface::return_type write(
        const rclcpp::Time& time,
        const rclcpp::Duration& period) override
    {
        // Write commanded velocities to motors
        for (size_t i = 0; i < joint_commands_.size(); ++i) {
            send_velocity_command(i, joint_commands_[i]);
        }
        return hardware_interface::return_type::OK;
    }

private:
    std::vector<double> joint_positions_;
    std::vector<double> joint_velocities_;
    std::vector<double> joint_commands_;
};
```

---

## 12. ROS 2 Computation Graph

A complete ROS 2 system for a mobile manipulator:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROS 2 Computation Graph                      │
│                                                                 │
│  ┌──────────┐   /scan    ┌──────────┐  /map   ┌──────────────┐│
│  │  LiDAR   │──────────►│   SLAM   │────────►│  Map Server  ││
│  │  Driver  │            │          │         │              ││
│  └──────────┘            └──────────┘         └──────┬───────┘│
│                                                       │       │
│  ┌──────────┐  /image    ┌──────────┐                │       │
│  │  Camera  │──────────►│ Object   │  /detections    │       │
│  │  Driver  │            │ Detector │───────┐        │       │
│  └──────────┘            └──────────┘       │        │       │
│                                              ▼        ▼       │
│  ┌──────────┐  /odom     ┌──────────────────────────────────┐│
│  │  Motor   │──────────►│           Nav2                    ││
│  │  Driver  │◄──────────│  (planner + controller + costmap) ││
│  │          │  /cmd_vel  └──────────────────────────────────┘│
│  └──────────┘                                                │
│                                                               │
│  ┌──────────┐  /joint_states  ┌──────────────┐              │
│  │  Arm     │────────────────►│   MoveIt 2   │              │
│  │  Driver  │◄────────────────│              │              │
│  │          │  /joint_cmds    └──────────────┘              │
│  └──────────┘                                                │
│                                                               │
│  ┌──────────┐                 ┌──────────────┐              │
│  │   tf2    │◄────────────────│ Robot State  │              │
│  │  Buffer  │   /tf, /tf_static│ Publisher   │              │
│  └──────────┘                 └──────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Debugging and Introspection Tools

### 13.1 Command-Line Tools

```bash
# List all nodes
ros2 node list

# List all topics with types
ros2 topic list -t

# Echo topic data
ros2 topic echo /scan

# Check topic frequency
ros2 topic hz /scan

# Call a service
ros2 service call /set_gripper std_srvs/srv/SetBool "{data: true}"

# Get/set parameters
ros2 param get /slam_node map_resolution
ros2 param set /slam_node map_resolution 0.05

# View the tf tree
ros2 run tf2_tools view_frames

# Record and replay data
ros2 bag record -a                    # record everything
ros2 bag play my_recording/           # replay
```

### 13.2 RViz2

RViz2 is the standard 3D visualization tool. It subscribes to topics and
renders:

- Point clouds (from LiDAR)
- Images (from cameras)
- Robot model (from URDF + tf2)
- Paths (from planners)
- Markers (custom visualizations)
- Costmaps, occupancy grids

### 13.3 rqt

rqt provides GUI tools for introspection:

- **rqt_graph**: Visualize the node/topic graph
- **rqt_console**: View log messages with filtering
- **rqt_plot**: Plot numeric topic data over time
- **rqt_reconfigure**: Change parameters at runtime

---

## 14. Best Practices

### 14.1 Node Design

1. **One node, one responsibility.** A node should not do perception AND control.
2. **Use parameters, not hardcoded values.** Everything tunable should be a parameter.
3. **Use lifecycle nodes** for anything that manages hardware or expensive resources.
4. **Declare QoS explicitly.** Never rely on defaults for production code.

### 14.2 Package Organization

```
my_robot/
├── my_robot_description/     # URDF, meshes, rviz configs
├── my_robot_bringup/         # Launch files, parameter files
├── my_robot_perception/      # Perception nodes
├── my_robot_navigation/      # Navigation configuration
├── my_robot_manipulation/    # MoveIt configuration
├── my_robot_hardware/        # ros2_control hardware interfaces
└── my_robot_msgs/            # Custom message/service/action definitions
```

### 14.3 Common Pitfalls

| Pitfall                        | Solution                                      |
| ------------------------------ | --------------------------------------------- |
| QoS mismatch (no data flowing) | Match reliability/durability policies         |
| Transform timeout              | Ensure tf publishers are running, check rates |
| Callback not called            | Check executor type, spin correctly           |
| Simulation clock drift         | Use `use_sim_time` parameter consistently     |
| Large messages slow            | Use composable nodes (intra-process)          |
| Parameter not updating         | Use `add_on_set_parameters_callback`          |

---

## Interview Questions

**Q1: What is the difference between a topic, a service, and an action in ROS 2?**

A topic is asynchronous publish/subscribe (many-to-many, streaming data). A
service is synchronous request/reply (one-to-one, quick operations). An action
is for long-running tasks with feedback and cancellation support. Use topics
for sensor data, services for quick queries, actions for navigation/manipulation.

**Q2: Explain QoS in ROS 2 and why it matters.**

QoS (Quality of Service) policies control how messages are delivered. Key
policies include reliability (RELIABLE vs. BEST_EFFORT), durability
(TRANSIENT_LOCAL vs. VOLATILE), and history depth. QoS determines whether
messages can be dropped, whether late-joining subscribers see old messages,
and how many messages are buffered. Mismatched QoS between publisher and
subscriber will prevent communication.

**Q3: What problem does tf2 solve, and how is it organized?**

tf2 maintains a tree of coordinate transforms between all frames on a robot.
It solves the problem of converting points between frames (e.g., "where is
the object detected by the camera in the base frame?"). Transforms are
organized as a tree (not a graph) with a single root, typically `map`. Each
transform has a timestamp, enabling interpolation for asynchronous sensors.

**Q4: Why does ROS 2 use DDS instead of a custom protocol?**

DDS provides decentralized discovery (no single point of failure), proven
real-time capabilities, configurable QoS, built-in security (DDS Security),
and multi-robot support via domain IDs. Using an industry standard also
means benefiting from decades of testing in aerospace and defense.

**Q5: What is a lifecycle node and when should you use one?**

A lifecycle node follows a state machine (unconfigured, inactive, active,
finalized) with transition callbacks. Use them when you need deterministic
startup ordering, graceful shutdown, or the ability to reconfigure without
restarting. Common for hardware drivers and critical processing nodes.

**Q6: Describe the Nav2 architecture. What role does the behavior tree play?**

Nav2 consists of a global planner, local controller, costmap, and recovery
behaviors. The behavior tree orchestrates these: it calls the planner to
compute a global path, the controller to follow it locally, and triggers
recovery behaviors (spin, backup) when the robot gets stuck. BTs are more
modular than state machines because you can swap components via XML config.

**Q7: What is URDF and why is Xacro used with it?**

URDF describes a robot's physical structure as links (rigid bodies) and
joints (connections with motion constraints). Xacro adds macro capabilities
(variables, conditionals, includes) to reduce duplication. A 6-DOF arm in
raw URDF might be 500 lines; with Xacro macros, it is 100 lines.

**Q8: How does ros2_control separate controllers from hardware?**

ros2_control defines a hardware interface layer with `read()` and `write()`
methods. Controllers (e.g., joint trajectory, diff drive) command through
abstract interfaces (position, velocity, effort). Hardware plugins implement
the actual communication with motors/encoders. You can swap hardware without
changing controllers, or swap controllers without changing hardware.

**Q9: How would you debug a situation where a subscriber receives no messages?**

Checklist: (1) Verify the topic name matches (`ros2 topic list`). (2) Check
QoS compatibility between publisher and subscriber. (3) Ensure both are on
the same DDS domain (`ROS_DOMAIN_ID`). (4) Verify the publisher is actually
publishing (`ros2 topic hz`). (5) Check for namespace issues. (6) If using
composable nodes, verify the container is running.

**Q10: What are composable nodes and when should you use them?**

Composable nodes are components that can be loaded into a single process
(container). They communicate via intra-process shared memory instead of
DDS serialization. Use them when you have high-bandwidth data flows between
nodes (e.g., camera image to detector to tracker). This avoids
serialization/deserialization overhead.

**Q11: Explain the difference between the map, odom, and base_link frames.**

`map` is a fixed world frame, updated by localization (SLAM or AMCL). It
is accurate globally but can jump. `odom` is updated by odometry, smooth
and continuous but drifts over time. `base_link` is rigidly attached to the
robot. The map-to-odom transform corrects odometry drift.

**Q12: How does Gazebo integrate with ROS 2?**

Gazebo runs a physics simulation with its own transport layer (gz-transport).
The `ros_gz_bridge` node bridges Gazebo topics to ROS 2 topics. Gazebo
sensor plugins simulate LiDAR, cameras, IMUs, etc. and publish data that
appears identical to real sensor data. The `ros_gz_sim` package handles
spawning robots from URDF descriptions.

**Q13: What is the role of MoveIt in a manipulation pipeline?**

MoveIt handles motion planning (computing collision-free joint trajectories),
inverse kinematics (converting Cartesian goals to joint positions), collision
checking (against known obstacles and the robot itself), and trajectory
execution (sending commands to the robot via ros2_control). It uses OMPL
for sampling-based planning and FCL for collision detection.

**Q14: How would you set up a multi-robot system in ROS 2?**

Options: (1) Use namespaces to prefix all topics/nodes per robot
(`/robot1/cmd_vel`, `/robot2/cmd_vel`). (2) Use different DDS domain IDs
for isolated robots that communicate through an explicit bridge. (3) Use
DDS partitions. Namespaces are simplest for cooperative robots; domain IDs
provide stronger isolation. Each robot typically runs its own Nav2 stack.
