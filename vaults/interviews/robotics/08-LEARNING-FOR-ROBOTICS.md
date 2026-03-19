# Chapter 8: Machine Learning for Robotics -- Teaching Robots to Learn

> "In robotics, you don't have ImageNet. You have a robot that falls over
> every 30 seconds and a grad student who has to pick it up."

Machine learning has transformed computer vision and NLP. Robotics is next,
but the challenges are fundamentally different. This chapter covers why
robotics ML is hard, the core paradigms (imitation learning, reinforcement
learning), sim-to-real transfer, and the emerging wave of foundation models
for robot control.

---

## 1. Why ML for Robotics Is Different

### 1.1 The Core Challenges

| Challenge          | Vision/NLP                | Robotics                     |
| ------------------ | ------------------------- | ---------------------------- |
| Data               | Billions of images/text   | Hours of robot experience    |
| Labels             | Cheap (crowdsourcing)     | Expensive (expert demos)     |
| Safety             | Wrong answer is annoying  | Wrong action breaks hardware |
| Feedback           | Immediate (loss function) | Delayed (task completion)    |
| Environment        | Static dataset            | Dynamic, continuous          |
| Evaluation         | Accuracy metric           | Physical success rate        |
| Distribution shift | Moderate                  | Severe (sim vs. real)        |

### 1.2 The Data Problem

A single ImageNet took 14 million labeled images. Training GPT-4 used
trillions of tokens. A robot arm collecting data at 10 Hz needs:

```
1 hour   =   36,000 transitions
1 day    =  864,000 transitions
1 year   = 315 million transitions

Compare: Atari RL agents often need 200 million frames
         (= ~23 days of continuous play at 100 Hz)
```

Physical data collection is slow, expensive, and requires supervision.
This is why simulation and data-efficient methods matter enormously.

### 1.3 The Safety Constraint

In NLP, a bad output is wrong text. In robotics, a bad output is a
real-world collision:

```
┌─────────────────────────────────────────────┐
│         The Robotics ML Safety Ladder        │
│                                             │
│  Level 4: Safe exploration in real world    │
│           (constrained RL, safety filters)  │
│                                             │
│  Level 3: Sim-to-real transfer              │
│           (train in sim, deploy in real)    │
│                                             │
│  Level 2: Imitation learning                │
│           (copy expert, no exploration)     │
│                                             │
│  Level 1: Classical control                 │
│           (hand-designed, fully understood) │
└─────────────────────────────────────────────┘
```

---

## 2. Imitation Learning

### 2.1 The Idea

Instead of specifying a reward function and letting the robot explore,
show the robot what to do and have it learn from demonstrations.

```
Expert Demonstration:      Learned Policy:

  Human teleoperates        Robot replays
  the robot arm            similar motions
       │                        │
       ▼                        ▼
  (s₁,a₁) ──┐            s₁ ──► π(s₁) = â₁
  (s₂,a₂)   │            s₂ ──► π(s₂) = â₂
  (s₃,a₃)   ├─ Dataset   s₃ ──► π(s₃) = â₃
  (s₄,a₄)   │               ...
    ...     ─┘            sₙ ──► π(sₙ) = âₙ
```

### 2.2 Behavior Cloning

The simplest form: supervised learning on state-action pairs.

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

class BehaviorCloningPolicy(nn.Module):
    def __init__(self, state_dim, action_dim, hidden_dim=256):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim),
        )

    def forward(self, state):
        return self.network(state)

def train_behavior_cloning(demonstrations, epochs=100):
    """
    demonstrations: list of (state, action) pairs from expert
    """
    states = torch.tensor([d[0] for d in demonstrations], dtype=torch.float32)
    actions = torch.tensor([d[1] for d in demonstrations], dtype=torch.float32)

    state_dim = states.shape[1]
    action_dim = actions.shape[1]
    policy = BehaviorCloningPolicy(state_dim, action_dim)
    optimizer = torch.optim.Adam(policy.parameters(), lr=1e-3)
    loss_fn = nn.MSELoss()

    dataset = TensorDataset(states, actions)
    loader = DataLoader(dataset, batch_size=64, shuffle=True)

    for epoch in range(epochs):
        total_loss = 0.0
        for batch_states, batch_actions in loader:
            predicted = policy(batch_states)
            loss = loss_fn(predicted, batch_actions)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

    return policy
```

### 2.3 The Compounding Error Problem

Behavior cloning has a fundamental flaw: **distribution shift**.

```
Expert trajectory:     s₁ → s₂ → s₃ → s₄ → s₅ (goal)
                        ↓    ↓    ↓    ↓    ↓
                        a₁   a₂   a₃   a₄   a₅

Learned trajectory:    s₁ → s₂' → s₃'' → s₄''' → ???
                        ↓     ↓      ↓       ↓
                       â₁    â₂     â₃      â₄
                       (ok)  (small  (larger  (never seen
                              error)  error)  this state!)

Error compounds: ε per step → T·ε total error over T steps
```

The policy is trained on states from the expert's distribution. At test
time, small errors push the robot into states never seen during training.
The policy has no idea what to do there, causing further deviation.

### 2.4 DAgger (Dataset Aggregation)

DAgger solves compounding error by iteratively collecting expert labels
on the learner's own state distribution:

```
Algorithm: DAgger

1. Collect initial dataset D₀ from expert demonstrations
2. Train policy π₁ on D₀
3. For i = 1, 2, ..., N:
   a. Execute πᵢ in the environment
   b. Collect visited states {s₁, s₂, ..., sₜ}
   c. Query expert for actions at those states: {a*₁, a*₂, ..., a*ₜ}
   d. Aggregate: Dᵢ = Dᵢ₋₁ ∪ {(s₁,a*₁), ..., (sₜ,a*ₜ)}
   e. Train πᵢ₊₁ on Dᵢ
```

```
┌──────────────────────────────────────────────────┐
│                DAgger Pipeline                    │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌────────────┐ │
│  │  Expert  │    │  Train   │    │  Execute   │ │
│  │  Demos   │───►│  Policy  │───►│  Policy    │ │
│  │  D₀      │    │  πᵢ      │    │  in Env    │ │
│  └──────────┘    └──────────┘    └─────┬──────┘ │
│       ▲                                │        │
│       │          ┌──────────┐          │        │
│       └──────────│  Expert  │◄─────────┘        │
│     New labels   │  Labels  │  Visited states   │
│     added to D   │  a*      │  from πᵢ          │
│                  └──────────┘                    │
└──────────────────────────────────────────────────┘
```

DAgger reduces error from O(T^2) to O(T), but requires an expert available
during training to label on-policy states.

### 2.5 Action Chunking and Diffusion Policies

Modern imitation learning has moved beyond simple behavior cloning:

**Action Chunking (ACT):** Instead of predicting one action at a time,
predict a sequence of future actions. This reduces the effect of
compounding errors and captures temporal correlations.

```
Standard BC:      s_t → a_t         (one step)
Action Chunking:  s_t → [a_t, a_{t+1}, ..., a_{t+H}]  (H steps)
```

**Diffusion Policies:** Model the action distribution as a denoising
diffusion process. This handles multi-modal action distributions (e.g.,
"go left OR go right around the obstacle" -- both are valid).

```
Standard BC:      s → mean action    (unimodal, averages options)
Diffusion Policy: s → sample from    (multimodal, picks one option)
                     learned distribution
```

---

## 3. Reinforcement Learning for Robotics

### 3.1 The RL Framework

```
┌──────────────┐  action aₜ   ┌──────────────┐
│              │──────────────►│              │
│    Agent     │               │  Environment │
│   (Policy)   │◄──────────────│              │
│              │  state sₜ₊₁   │              │
│              │  reward rₜ    │              │
└──────────────┘               └──────────────┘

Objective: maximize E[Σ γᵗ rₜ]  (discounted cumulative reward)
```

### 3.2 Why RL Is Hard in Robotics

1. **Reward design**: "Pick up the cup" seems simple, but what reward signal
   do you give at each timestep? Sparse rewards (1 if success, 0 otherwise)
   are uninformative. Dense rewards require domain expertise.

2. **Sample efficiency**: Model-free RL algorithms typically need millions
   of transitions. At 10 Hz, that is 28 hours per million transitions.

3. **Exploration**: Random exploration in physical space is dangerous.
   A robot arm flailing randomly will hit things.

4. **Partial observability**: Robots rarely observe full state. Camera
   images are high-dimensional and ambiguous.

### 3.3 Policy Gradient Methods

Policy gradient methods directly optimize the policy parameters:

```
∇_θ J(θ) = E_τ [ Σ_t ∇_θ log π_θ(aₜ|sₜ) · (R(τ) - b) ]

where:
  π_θ     = policy parameterized by θ
  τ       = trajectory (s₁, a₁, r₁, s₂, a₂, r₂, ...)
  R(τ)    = cumulative reward of trajectory
  b       = baseline (reduces variance)
```

### 3.4 PPO (Proximal Policy Optimization)

PPO is the workhorse of robotics RL. It prevents destructively large
policy updates:

```python
import torch
import torch.nn as nn

class PPOPolicy(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.actor = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 256),
            nn.ReLU(),
            nn.Linear(256, action_dim),
        )
        self.critic = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
        )
        self.log_std = nn.Parameter(torch.zeros(action_dim))

    def forward(self, state):
        mean = self.actor(state)
        std = self.log_std.exp()
        return torch.distributions.Normal(mean, std)

    def value(self, state):
        return self.critic(state)


def ppo_update(policy, optimizer, states, actions, old_log_probs,
               returns, advantages, clip_epsilon=0.2, epochs=10):
    """Core PPO update step."""
    for _ in range(epochs):
        dist = policy(states)
        new_log_probs = dist.log_prob(actions).sum(dim=-1)
        values = policy.value(states).squeeze()

        # Policy loss with clipping
        ratio = (new_log_probs - old_log_probs).exp()
        clipped = torch.clamp(ratio, 1 - clip_epsilon, 1 + clip_epsilon)
        policy_loss = -torch.min(
            ratio * advantages,
            clipped * advantages
        ).mean()

        # Value loss
        value_loss = 0.5 * (returns - values).pow(2).mean()

        # Entropy bonus (encourages exploration)
        entropy = dist.entropy().mean()

        loss = policy_loss + 0.5 * value_loss - 0.01 * entropy

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

### 3.5 SAC (Soft Actor-Critic)

SAC is an off-policy algorithm that maximizes both reward AND entropy
(randomness). This is particularly useful in robotics because:

1. **Off-policy**: Can reuse old data (sample efficient)
2. **Entropy maximization**: Explores systematically, not randomly
3. **Continuous actions**: Designed for continuous action spaces

```
SAC Objective:  maximize E[ Σ γᵗ (rₜ + α · H(π(·|sₜ))) ]

where H(π(·|sₜ)) is the entropy of the policy at state sₜ
      α is a temperature parameter (auto-tuned)
```

### 3.6 Reward Shaping

Designing reward functions is notoriously difficult:

```
Task: "Pick up the red cup"

Bad reward (sparse):
  r = 1 if cup is grasped, 0 otherwise
  Problem: Random exploration almost never grasps the cup

Better reward (shaped):
  r = -d(gripper, cup)           # Move toward cup
    + 10 * is_touching(cup)      # Bonus for contact
    + 100 * is_grasped(cup)      # Big bonus for grasp
    + 1000 * is_lifted(cup)      # Huge bonus for lift
  Problem: Robot might game the reward (touch cup repeatedly
           without grasping)

Reward hacking examples:
  - "Maximize score" → Finds exploit in game physics
  - "Minimize distance to goal" → Vibrates near goal
  - "Stay upright" → Learns to never move (safest option)
```

---

## 4. Sim-to-Real Transfer

### 4.1 The Sim-to-Real Gap

Simulation is cheap and safe, but imperfect:

```
┌───────────────────────────────┐
│     Sources of Sim-to-Real    │
│         Gap                   │
│                               │
│  ┌─────────────────────────┐  │
│  │ Visual:                 │  │
│  │  - Textures, lighting   │  │
│  │  - Reflections, shadows │  │
│  │  - Camera noise         │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │ Dynamics:               │  │
│  │  - Friction, damping    │  │
│  │  - Contact mechanics    │  │
│  │  - Motor delays/limits  │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │ Structural:             │  │
│  │  - Object shapes        │  │
│  │  - Deformable objects   │  │
│  │  - Fluid dynamics       │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
```

### 4.2 Domain Randomization

The key insight: if you train across a wide enough distribution of
simulation parameters, the real world becomes "just another variation."

```
┌───────────────────────────────────────────────────┐
│              Domain Randomization                  │
│                                                   │
│  Simulation Instance 1:                           │
│    friction=0.3, mass=1.2kg, delay=5ms            │
│    lighting=bright, texture=wood                   │
│                                                   │
│  Simulation Instance 2:                           │
│    friction=0.8, mass=0.9kg, delay=15ms           │
│    lighting=dim, texture=metal                     │
│                                                   │
│  Simulation Instance 3:                           │
│    friction=0.5, mass=1.5kg, delay=8ms            │
│    lighting=colored, texture=plastic               │
│           ...                                     │
│  Simulation Instance N:                           │
│    friction=?, mass=?, delay=?                     │
│    lighting=?, texture=?                           │
│                                                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Real World:                                      │
│    friction=0.6, mass=1.1kg, delay=10ms           │
│    lighting=office, texture=ceramic                │
│    (falls within the randomized distribution!)    │
└───────────────────────────────────────────────────┘
```

```python
def randomize_domain(sim_env):
    """Randomize simulation parameters for sim-to-real transfer."""
    params = {
        'friction': random.uniform(0.1, 1.0),
        'object_mass': random.uniform(0.05, 2.0),
        'actuator_delay': random.uniform(0.0, 0.02),
        'camera_fov': random.uniform(55, 75),
        'lighting_intensity': random.uniform(0.3, 1.5),
        'lighting_direction': random_unit_vector(),
        'table_color': random_rgb(),
        'object_color': random_rgb(),
        'observation_noise_std': random.uniform(0.0, 0.05),
        'action_noise_std': random.uniform(0.0, 0.02),
    }
    sim_env.set_physics_params(params)
    sim_env.set_visual_params(params)
    return params
```

### 4.3 System Identification

Instead of randomizing everything, measure the real-world parameters and
make simulation match:

```
System Identification Pipeline:

1. Collect real-world data
   - Apply known forces/torques
   - Record resulting motions

2. Optimize simulation parameters
   - Run same commands in simulation
   - Minimize difference between sim and real trajectories

3. Validate
   - Run new commands (not in training set)
   - Verify sim-real match

   θ* = argmin_θ Σᵢ ||τ_real(i) - τ_sim(i; θ)||²

   where θ = [mass, friction, damping, delay, ...]
```

### 4.4 The Sim-to-Real Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Build Sim   │     │  Train in    │     │  Transfer    │
│  Environment │────►│  Simulation  │────►│  to Real     │
│  (URDF +     │     │  (RL or IL)  │     │  Robot       │
│   physics)   │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                           ┌──────────────────────┘
                           │
                           ▼
                     ┌──────────────┐
                     │  Fine-tune   │
                     │  on Real     │
                     │  Data        │
                     │  (optional)  │
                     └──────────────┘

Approaches to transfer:
  1. Zero-shot: Train in sim, deploy directly (domain randomization)
  2. Few-shot: Fine-tune on small real dataset
  3. Progressive: Gradually reduce sim reliance
```

---

## 5. Foundation Models for Robotics

### 5.1 The Vision

Large pretrained models (LLMs, VLMs) encode vast world knowledge. Can we
leverage this knowledge for robot control?

```
┌────────────────────────────────────────────────────┐
│        Foundation Models in Robotics                │
│                                                    │
│  Language:     "Pick up the red cup"               │
│       │                                            │
│       ▼                                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐ │
│  │  LLM /   │───►│ Task     │───►│  Low-level  │ │
│  │  VLM     │    │ Planner  │    │  Controller │ │
│  │          │    │          │    │             │ │
│  └──────────┘    └──────────┘    └──────┬──────┘ │
│                                         │        │
│  Vision:   Camera images ───────────────┘        │
│                                                    │
│  Action:   Joint torques / velocities              │
└────────────────────────────────────────────────────┘
```

### 5.2 SayCan -- Grounding Language in Robot Affordances

SayCan (Google, 2022) combines an LLM's knowledge of task decomposition
with a robot's knowledge of what it can actually do:

```
User: "I spilled my drink, can you help?"

LLM suggests actions     Robot scores feasibility
(task knowledge):        (affordance knowledge):

1. Find sponge      ×   P(success | current state) = 0.9  → 0.9
2. Pick up sponge   ×   P(success | current state) = 0.85 → 0.85
3. Go to spill      ×   P(success | current state) = 0.7  → 0.7
4. Wipe spill       ×   P(success | current state) = 0.6  → 0.6
5. Throw sponge away×   P(success | current state) = 0.8  → 0.8

Score = P_LLM(action | instruction) × P_robot(success | state, action)
```

### 5.3 RT-2 -- Vision-Language-Action Models

RT-2 (Google DeepMind, 2023) fine-tunes a vision-language model to directly
output robot actions:

```
Input:                        Output:
┌──────────────┐
│  Camera      │              Action tokens:
│  Image       │──────┐       [x_delta, y_delta, z_delta,
│              │      │        rx, ry, rz, gripper]
└──────────────┘      │
                      ├──► VLA Model ──► [0.02, -0.01, 0.05,
┌──────────────┐      │                   0.0, 0.0, 0.1, 1]
│  "Pick up    │──────┘
│  the red     │       Actions are tokenized as text:
│  cup"        │       "1 128 91 241 5 101 127"
└──────────────┘       (discretized into 256 bins)
```

Key insight: by tokenizing actions as text, the model can leverage all the
knowledge learned during language pretraining.

### 5.4 Open-Source VLA Models

The field is rapidly evolving. Notable open efforts:

| Model   | Organization          | Approach                        |
| ------- | --------------------- | ------------------------------- |
| Octo    | UC Berkeley           | Transformer policy, multi-robot |
| OpenVLA | Stanford/Berkeley     | Fine-tuned Llama for actions    |
| pi0     | Physical Intelligence | Flow matching VLA               |
| RT-X    | Open X-Embodiment     | Cross-robot dataset + models    |

### 5.5 Limitations of Foundation Models

```
┌─────────────────────────────────────────────────────┐
│     Current Limitations                              │
│                                                     │
│  1. Latency                                         │
│     LLM inference: 100-500ms                        │
│     Required control rate: 1-10ms                   │
│     → 100x too slow for reactive control            │
│                                                     │
│  2. Hallucination                                   │
│     LLM: "Sure, I can reach that object"            │
│     Reality: Object is 3 meters away, arm is 0.5m   │
│                                                     │
│  3. Physical grounding                              │
│     LLMs know "cups hold liquid"                    │
│     LLMs don't know the force needed to grasp THIS  │
│     cup with THESE fingers                          │
│                                                     │
│  4. Safety                                          │
│     No formal guarantees on learned behavior        │
│     Can't prove the model won't hit a person        │
└─────────────────────────────────────────────────────┘
```

---

## 6. Visuomotor Policies

### 6.1 End-to-End Learning

Visuomotor policies map directly from images to actions, skipping
explicit perception pipelines:

```
Traditional Pipeline:
  Image → Object Detection → Pose Estimation → Grasp Planning → Action
  (Each stage has errors that compound)

End-to-End Visuomotor:
  Image → Neural Network → Action
  (Learns what features matter for the task)
```

### 6.2 Architecture Choices

```
┌─────────────────────────────────────────────────────┐
│           Visuomotor Policy Architecture             │
│                                                     │
│  ┌──────────┐                                       │
│  │  Camera  │                                       │
│  │  Image   │─┐                                     │
│  │  (RGB)   │ │  ┌──────────┐  ┌────────────────┐  │
│  └──────────┘ ├─►│  Vision  │  │   Policy Head  │  │
│               │  │  Encoder │─►│   (MLP or      │──► Actions
│  ┌──────────┐ │  │  (ResNet/│  │    Transformer)│  │
│  │  Depth   │─┘  │   ViT)  │  │                │  │
│  │  Image   │    └──────────┘  └────────────────┘  │
│  └──────────┘         ▲                             │
│                       │                             │
│  ┌──────────┐         │                             │
│  │ Proprio- │─────────┘ (concatenated with          │
│  │ ception  │            visual features)           │
│  │ (joints) │                                       │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

```python
import torch
import torch.nn as nn
import torchvision.models as models

class VisuomotorPolicy(nn.Module):
    def __init__(self, action_dim, proprio_dim=7):
        super().__init__()
        # Pretrained vision encoder (frozen or fine-tuned)
        resnet = models.resnet18(pretrained=True)
        self.vision_encoder = nn.Sequential(
            *list(resnet.children())[:-1]  # Remove final FC
        )
        vision_dim = 512

        # Proprioception encoder
        self.proprio_encoder = nn.Sequential(
            nn.Linear(proprio_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
        )

        # Policy head
        self.policy_head = nn.Sequential(
            nn.Linear(vision_dim + 64, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, action_dim),
        )

    def forward(self, image, proprioception):
        vis_features = self.vision_encoder(image).flatten(1)
        proprio_features = self.proprio_encoder(proprioception)
        combined = torch.cat([vis_features, proprio_features], dim=1)
        return self.policy_head(combined)
```

### 6.3 Multi-Camera Setups

Real-world manipulation benefits from multiple viewpoints:

```
        ┌─────────┐
        │  Wrist  │  (close-up view of gripper + object)
        │  Camera │
        └────┬────┘
             │
    ┌────────┼────────┐
    │        │        │
┌───┴───┐   │   ┌───┴───┐
│ Left  │   │   │ Right │  (workspace overview)
│ Camera│   │   │ Camera│
└───────┘   │   └───────┘
            │
     ┌──────┴──────┐
     │    Robot    │
     │    Arm      │
     └─────────────┘

Each camera provides complementary information:
  - Wrist: Fine manipulation, contact detection
  - External: Global positioning, obstacle awareness
```

---

## 7. Representation Learning for Control

### 7.1 Why Representations Matter

Raw pixels are high-dimensional (640x480x3 = 921,600 dimensions) but the
information relevant to control is low-dimensional (object pose = 6 numbers).
Good representations compress this.

### 7.2 Contrastive Learning

Learn representations where similar states are close and different states
are far apart:

```
Contrastive Objective:

  Same trajectory, nearby time:  pull embeddings together
  Different trajectories:        push embeddings apart

  ┌─────┐  t=1   t=2   t=3   t=4   t=5
  │Traj │  ●─────●─────●─────●─────●     (nearby = similar)
  │  A  │           ↕ pull
  └─────┘

  ┌─────┐  t=1   t=2   t=3   t=4   t=5
  │Traj │  ○─────○─────○─────○─────○     (different = dissimilar)
  │  B  │        ↕ push apart
  └─────┘
```

### 7.3 Spatial Representations

For manipulation, spatial structure matters. Keypoint-based representations
detect salient points in the image:

```
Input Image:            Detected Keypoints:

┌──────────────┐        ┌──────────────┐
│     ____     │        │              │
│    /    \    │        │     ×  ×     │  × = keypoint
│   |  cup |   │        │    ×    ×    │
│   |      |   │        │    ×    ×    │
│    \____/    │        │     ×  ×     │
│   ─────────  │        │   ──×──×──   │
│   table      │        │     table    │
└──────────────┘        └──────────────┘

Keypoints: [(x₁,y₁), (x₂,y₂), ..., (xₖ,yₖ)]
   → Low-dimensional, spatially grounded
   → Equivariant to rotations/translations
```

### 7.4 World Models

Learn a model of the environment's dynamics, then use it for planning:

```
World Model:

  Current state sₜ ──┐
                      ├──► Dynamics Model ──► Predicted sₜ₊₁
  Action aₜ ─────────┘         fθ

  Can "imagine" future trajectories without physical interaction:

  sₜ → fθ(sₜ,a₁) → sₜ₊₁ → fθ(sₜ₊₁,a₂) → sₜ₊₂ → ...
         (predicted)              (predicted)

  Then optimize actions in imagination:
  a* = argmax_a Σᵢ r(ŝᵢ)
```

---

## 8. Safety in Learned Systems

### 8.1 The Safety Problem

Learned policies are opaque. You cannot inspect a neural network and prove
it will never collide with a person. This is a fundamental barrier to
deployment.

### 8.2 Safety Approaches

```
┌────────────────────────────────────────────────────────┐
│              Safety Architecture                        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Layer 1: Constrained Learning                    │  │
│  │  - Constrained RL (cost limits during training)   │  │
│  │  - Safe exploration (barrier functions)            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Layer 2: Runtime Safety Filter                   │  │
│  │  - Check learned action against safety constraint │  │
│  │  - Override with safe action if violation          │  │
│  │  - Control Barrier Functions (CBFs)                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Layer 3: Hardware Safety                         │  │
│  │  - Force/torque limits in motor controllers       │  │
│  │  - E-stop (always available, not software)        │  │
│  │  - Collision detection via current sensing         │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 8.3 Control Barrier Functions

CBFs provide formal safety guarantees even with learned policies:

```
Given:
  h(x) ≥ 0  defines the "safe set" (e.g., distance to obstacle > 0)

Control Barrier Function condition:
  dh/dt + α·h(x) ≥ 0   for some α > 0

This guarantees: if h(x₀) ≥ 0, then h(xₜ) ≥ 0 for all t > 0
                 (if you start safe, you stay safe)

In practice:
  1. Learned policy proposes action a_learned
  2. CBF filter solves: a_safe = argmin ||a - a_learned||²
                         subject to: dh/dt + α·h(x) ≥ 0
  3. Execute a_safe (closest safe action to learned action)
```

### 8.4 Out-of-Distribution Detection

Detect when the robot encounters situations not seen during training:

```python
class OODDetector:
    """Detect out-of-distribution states for safety."""

    def __init__(self, encoder, threshold):
        self.encoder = encoder
        self.threshold = threshold
        self.training_features = []

    def fit(self, training_data):
        """Compute feature statistics from training data."""
        features = [self.encoder(x) for x in training_data]
        self.mean = torch.stack(features).mean(dim=0)
        self.cov = torch.cov(torch.stack(features).T)
        self.cov_inv = torch.inverse(self.cov)

    def is_ood(self, observation):
        """Check if observation is out of distribution."""
        feat = self.encoder(observation)
        diff = feat - self.mean
        # Mahalanobis distance
        distance = (diff @ self.cov_inv @ diff).item()
        return distance > self.threshold
```

---

## 9. Practical Considerations

### 9.1 Data Collection for Robotics

```
Data Collection Methods (by cost and quality):

Method              Cost    Quality   Scale
─────────────────────────────────────────────
Teleoperation       High    High      Low
  (human controls robot directly)

Kinesthetic teach   High    High      Low
  (human physically guides robot)

VR teleoperation    Medium  Medium    Medium
  (human in VR, robot mimics)

Autonomous collect  Low     Low       High
  (scripted exploration)

Simulation          Very Low Medium   Very High
  (synthetic data)

Play data           Low     Medium    Medium
  (unstructured human interaction)
```

### 9.2 Choosing Between IL and RL

```
Use Imitation Learning when:
  ✓ Expert demonstrations are available
  ✓ Task is well-defined with clear correct behavior
  ✓ Safety is critical (no exploration needed)
  ✓ You need quick prototyping

Use Reinforcement Learning when:
  ✓ Reward function is available or designable
  ✓ Optimal behavior is unknown (superhuman performance desired)
  ✓ Simulation is available for training
  ✓ You have compute budget for millions of episodes

Use Both (common in practice):
  1. Pre-train with IL (warm start)
  2. Fine-tune with RL (improve beyond expert)
  3. Use IL to reset RL exploration (guided exploration)
```

### 9.3 Common Failure Modes

| Failure                | Symptom                        | Fix                                |
| ---------------------- | ------------------------------ | ---------------------------------- |
| Behavior cloning drift | Works for 2 seconds then fails | DAgger, action chunking            |
| Reward hacking         | Robot "cheats" the reward      | Redesign reward, add constraints   |
| Sim-to-real gap        | Works in sim, fails on robot   | Domain randomization, fine-tune    |
| Covariate shift        | Degrades over deployment       | Continual learning, monitoring     |
| Causal confusion       | Learns spurious correlations   | Causal IL, data augmentation       |
| Mode collapse          | Only does one thing            | Diffusion policies, mixture models |

---

## Interview Questions

**Q1: What is the compounding error problem in behavior cloning, and how does DAgger address it?**

In behavior cloning, small prediction errors push the robot into states not
seen in the training data. Since the policy was never trained on these states,
errors compound quadratically with trajectory length: O(T^2). DAgger
addresses this by iteratively executing the learned policy, collecting the
states it visits, querying the expert for the correct action at those states,
and retraining. This ensures the policy is trained on its own state
distribution, reducing error to O(T).

**Q2: Explain the sim-to-real gap and two approaches to bridge it.**

The sim-to-real gap is the difference between simulation and reality in
visual appearance, physical dynamics, and sensor behavior. Domain
randomization trains across a wide distribution of simulation parameters so
the real world falls within that distribution. System identification measures
real-world parameters (friction, mass, delay) and tunes the simulator to
match. These can be combined: identify what you can measure, randomize what
you cannot.

**Q3: Why is PPO popular in robotics RL? What does the clipping do?**

PPO is popular because it is relatively stable, works with continuous actions,
and requires minimal hyperparameter tuning. The clipping mechanism limits the
ratio between new and old policy probabilities to [1-epsilon, 1+epsilon]. This
prevents destructively large policy updates, which is critical in robotics
where a bad update can mean the robot crashes and data collection restarts.

**Q4: What is the difference between on-policy and off-policy RL, and why does it matter for robotics?**

On-policy algorithms (PPO, A2C) learn only from data collected by the current
policy. Off-policy algorithms (SAC, TD3) can learn from any data, including
old experience stored in a replay buffer. For robotics, off-policy is
preferred because physical data collection is expensive. Being able to reuse
old data improves sample efficiency by 10-100x.

**Q5: How do diffusion policies improve over standard behavior cloning?**

Standard behavior cloning predicts a single action (mean of the distribution).
When multiple valid actions exist (e.g., go left OR right around an obstacle),
it averages them (go straight into the obstacle). Diffusion policies model the
full action distribution using a denoising process, allowing them to sample
one coherent action from a multimodal distribution.

**Q6: What is a vision-language-action (VLA) model? Give an example.**

A VLA model takes visual observations and language instructions as input and
directly outputs robot actions. RT-2 is an example: it fine-tunes a
vision-language model (PaLM-E) to output action tokens (discretized joint
velocities). The key insight is that actions can be tokenized as text,
allowing the model to leverage world knowledge from language pretraining.

**Q7: Why can't we just use LLMs to directly control robots?**

Three main reasons: (1) Latency -- LLM inference takes 100-500ms while
reactive control needs 1-10ms. (2) No physical grounding -- LLMs know
abstract facts but not specific forces, torques, and contact dynamics.
(3) No safety guarantees -- we cannot prove a neural network will never
output a dangerous action. LLMs are better suited for high-level task
planning, with classical controllers handling low-level execution.

**Q8: Explain Control Barrier Functions and their role in safe learned control.**

A CBF defines a safe set via h(x) >= 0 and enforces the condition
dh/dt + alpha\*h(x) >= 0. This mathematically guarantees the system stays
within the safe set. In learned control, a CBF acts as a safety filter: the
learned policy proposes an action, the CBF checks if it would violate safety,
and if so, projects it to the closest safe action. This provides formal
safety guarantees on top of opaque learned policies.

**Q9: What is reward shaping, and what are its dangers?**

Reward shaping adds intermediate rewards to guide RL exploration (e.g.,
rewarding proximity to the goal rather than only goal achievement). The danger
is reward hacking: the agent finds ways to maximize shaped rewards without
actually completing the task. For example, rewarding "distance to cup
decreased" might cause the robot to vibrate near the cup. Potential-based
reward shaping is provably safe (same optimal policy) but harder to design.

**Q10: How would you decide between training a visuomotor policy end-to-end vs. using a modular perception-then-control pipeline?**

Use end-to-end when: the task-relevant features are hard to define explicitly,
you have sufficient demonstrations, and the task is relatively simple. Use
modular when: you need interpretability (which object was detected?), you
have strong perception models already, the task requires complex reasoning,
or you need to debug failures. In practice, many systems are hybrid:
pretrained perception encoder (frozen) feeding into a learned control head.

**Q11: What is domain randomization, and what parameters are typically randomized?**

Domain randomization trains policies across a wide distribution of simulation
parameters to make real-world conditions appear as just another sample.
Typically randomized: visual properties (textures, lighting, colors, camera
position), physical properties (friction, mass, damping, actuator delay),
and environmental properties (object positions, distractor objects, background).
The principle is that if the randomization is broad enough, the real world
falls within the training distribution.

**Q12: Describe the differences between behavior cloning, DAgger, and inverse RL.**

Behavior cloning is offline supervised learning on expert state-action pairs.
DAgger iteratively collects expert labels on the learner's own visited states,
fixing distribution shift. Inverse RL recovers a reward function from expert
demonstrations, then trains a policy to maximize it. BC is simplest but
suffers from drift. DAgger requires an online expert. IRL is most general
(can generalize beyond demonstrations) but most computationally expensive.

**Q13: What are world models, and how do they help with sample efficiency?**

World models learn the environment's dynamics: given state and action,
predict the next state. Once learned, the agent can "imagine" trajectories
and optimize actions in simulation (planning in learned model space). This
dramatically improves sample efficiency because the agent can learn from
imagined experience rather than costly physical interaction. Dreamer and
MBPO are examples. The risk is model error compounding over long horizons.

**Q14: How do you evaluate an ML-based robot policy?**

Evaluation requires multiple levels: (1) Offline metrics (validation loss,
action prediction error) give quick estimates but miss distribution shift.
(2) Simulation evaluation (success rate, completion time) tests closed-loop
behavior but misses sim-to-real gap. (3) Real-world evaluation (success rate
across object variations, lighting conditions, start positions) is the ground
truth. Report mean and variance over many trials (not just cherry-picked
successes). Also measure safety metrics: collision rate, force limits exceeded.
