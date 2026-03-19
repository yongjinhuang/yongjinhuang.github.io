# Fine-Tuning LLMs

A practical guide to fine-tuning large language models for software engineers. Covers
when to fine-tune vs RAG vs prompting, supervised fine-tuning (SFT), LoRA/QLoRA,
RLHF basics, data preparation, evaluation, and cost analysis with Hugging Face code.

---

## Table of Contents

1. [When to Fine-Tune: Decision Framework](#when-to-fine-tune-decision-framework)
2. [Fine-Tuning Approaches](#fine-tuning-approaches)
3. [Supervised Fine-Tuning (SFT)](#supervised-fine-tuning-sft)
4. [LoRA and QLoRA](#lora-and-qlora)
5. [RLHF Basics](#rlhf-basics)
6. [Data Preparation](#data-preparation)
7. [Practical Fine-Tuning with Code](#practical-fine-tuning-with-code)
8. [Evaluation of Fine-Tuned Models](#evaluation-of-fine-tuned-models)
9. [Cost Analysis](#cost-analysis)
10. [Common Interview Questions](#common-interview-questions)
11. [Quick Reference](#quick-reference)

---

## When to Fine-Tune: Decision Framework

Fine-tuning is expensive and complex. Before committing, determine whether simpler
approaches solve your problem.

### Decision Tree

```
Start: What do you need?
  |
  +--> Change output FORMAT/STYLE?
  |      +--> Try prompt engineering first
  |      +--> If inconsistent -> few-shot examples
  |      +--> If still failing -> fine-tune for style
  |
  +--> Add NEW KNOWLEDGE?
  |      +--> Use RAG (retrieval-augmented generation)
  |      +--> If RAG latency too high -> fine-tune + RAG
  |
  +--> Change model BEHAVIOR?
  |      +--> Specific persona/tone -> fine-tune (SFT)
  |      +--> Safety/alignment -> fine-tune (RLHF/DPO)
  |
  +--> Improve TASK PERFORMANCE?
  |      +--> Try CoT prompting first
  |      +--> If not enough -> fine-tune on task-specific data
  |
  +--> Reduce COST/LATENCY?
         +--> Fine-tune smaller model to match larger model
         +--> Distillation: train 8B to mimic 70B behavior
```

### Approach Comparison

```
+---------------------+------------------+-----------------+------------------+
| Dimension           | Prompt Eng.      | RAG             | Fine-Tuning      |
+---------------------+------------------+-----------------+------------------+
| Implementation time | Hours            | Days            | Weeks            |
| Cost to implement   | $0               | $100-$1K        | $1K-$100K        |
| Ongoing cost        | Per-token only   | Vector DB +     | Inference only   |
|                     |                  | per-token       | (no extra)       |
| Knowledge freshness | Static           | Real-time       | Static (retrain) |
| Output consistency  | Low-Medium       | Medium          | High             |
| Custom behavior     | Limited          | Limited         | Full control     |
| Latency             | Baseline         | +200-500ms      | Baseline         |
| Data requirement    | 0 examples       | Documents       | 100-100K examples|
| Maintenance         | Low              | Medium          | High (retraining)|
+---------------------+------------------+-----------------+------------------+
```

### When Fine-Tuning IS the Right Choice

| Scenario                                  | Why Fine-Tuning                       | Example                           |
| ----------------------------------------- | ------------------------------------- | --------------------------------- |
| Consistent output format                  | Prompt engineering fails at scale     | JSON with exact schema every time |
| Domain-specific language                  | Model lacks training data             | Legal briefs, medical notes       |
| Distillation (cost reduction)             | Smaller model, same quality           | GPT-4o quality from 8B model      |
| Custom tone/persona                       | Cannot be achieved with prompts alone | Brand-specific writing style      |
| Classification tasks                      | Few-shot is expensive per-call        | Ticket routing, intent detection  |
| Code generation for proprietary framework | Model has no training data            | Internal DSL, custom APIs         |

### When Fine-Tuning is NOT the Right Choice

| Scenario                      | Better Alternative | Why                                      |
| ----------------------------- | ------------------ | ---------------------------------------- |
| Adding factual knowledge      | RAG                | Knowledge goes stale, hallucination risk |
| Simple format changes         | Prompt engineering | Cheaper, faster, no training needed      |
| One-off tasks                 | Few-shot prompting | Not worth the investment                 |
| Rapidly changing domain       | RAG                | Cannot retrain fast enough               |
| Small dataset (< 50 examples) | Few-shot prompting | Not enough data to fine-tune well        |

---

## Fine-Tuning Approaches

### Overview of Methods

```
+------------------------------------------------------------------+
|                FINE-TUNING METHODS                                 |
+------------------------------------------------------------------+
|                                                                    |
|  FULL FINE-TUNING                                                 |
|  +------------------------------------------------------------+   |
|  | Update ALL model parameters                                 |   |
|  | Requires: massive GPU memory (2-4x model size)             |   |
|  | Quality: highest potential quality                          |   |
|  | Cost: $$$$ (8x A100 for 70B model)                         |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  LoRA (Low-Rank Adaptation)                                       |
|  +------------------------------------------------------------+   |
|  | Freeze base model, train small adapter matrices             |   |
|  | Requires: ~10% of full fine-tuning memory                  |   |
|  | Quality: 90-95% of full fine-tuning                        |   |
|  | Cost: $$ (1-2x A100 for 70B model with QLoRA)              |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  QLoRA (Quantized LoRA)                                           |
|  +------------------------------------------------------------+   |
|  | LoRA + 4-bit quantization of base model                    |   |
|  | Requires: ~5% of full fine-tuning memory                   |   |
|  | Quality: 85-95% of full fine-tuning                        |   |
|  | Cost: $ (single GPU for 7B-13B models)                     |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  ADAPTER TUNING (Prefix/Prompt Tuning)                            |
|  +------------------------------------------------------------+   |
|  | Learn soft prompts or adapter layers                        |   |
|  | Requires: minimal additional memory                        |   |
|  | Quality: lower than LoRA for most tasks                    |   |
|  | Cost: $ (least expensive)                                   |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Supervised Fine-Tuning (SFT)

SFT trains the model on (instruction, response) pairs. It is the most common and
straightforward fine-tuning approach.

### SFT Data Format

```python
# Standard chat format (most common)
training_examples = [
    {
        "messages": [
            {"role": "system", "content": "You are a customer support agent for Acme Corp."},
            {"role": "user", "content": "How do I reset my password?"},
            {"role": "assistant", "content": "To reset your password:\n1. Go to acme.com/reset\n2. Enter your email\n3. Click the link in the email\n4. Set your new password"},
        ]
    },
    {
        "messages": [
            {"role": "system", "content": "You are a customer support agent for Acme Corp."},
            {"role": "user", "content": "What's your refund policy?"},
            {"role": "assistant", "content": "Acme Corp offers a 30-day full refund on all products. Contact support@acme.com with your order number."},
        ]
    },
]

# Instruction-response format (simpler)
training_examples_simple = [
    {
        "instruction": "Classify this support ticket priority",
        "input": "My account was hacked and someone made unauthorized purchases",
        "output": "CRITICAL - Account security breach with financial impact",
    },
    {
        "instruction": "Classify this support ticket priority",
        "input": "The font on the settings page looks slightly off",
        "output": "LOW - Minor UI cosmetic issue",
    },
]
```

### OpenAI Fine-Tuning API

```python
from openai import OpenAI
import json

client = OpenAI()

# Step 1: Prepare training file (JSONL format)
training_data = [
    {
        "messages": [
            {"role": "system", "content": "You classify support tickets."},
            {"role": "user", "content": "I can't log in to my account"},
            {"role": "assistant", "content": '{"category": "auth", "priority": "high"}'},
        ]
    },
    # ... more examples (minimum 10, recommended 50-100+)
]

with open("training.jsonl", "w") as f:
    for example in training_data:
        f.write(json.dumps(example) + "\n")

# Step 2: Upload training file
file = client.files.create(
    file=open("training.jsonl", "rb"),
    purpose="fine-tune",
)

# Step 3: Create fine-tuning job
job = client.fine_tuning.jobs.create(
    training_file=file.id,
    model="gpt-4o-mini-2024-07-18",
    hyperparameters={
        "n_epochs": 3,
        "batch_size": "auto",
        "learning_rate_multiplier": "auto",
    },
)

# Step 4: Monitor progress
job_status = client.fine_tuning.jobs.retrieve(job.id)
print(f"Status: {job_status.status}")

# Step 5: Use the fine-tuned model
response = client.chat.completions.create(
    model=job_status.fine_tuned_model,  # e.g., "ft:gpt-4o-mini-2024-07-18:org:custom-name:id"
    messages=[
        {"role": "system", "content": "You classify support tickets."},
        {"role": "user", "content": "My credit card was charged twice"},
    ],
)
```

---

## LoRA and QLoRA

### How LoRA Works

Instead of updating all model weights (billions of parameters), LoRA freezes the
pre-trained model and injects small trainable matrices into each layer.

```
FULL FINE-TUNING:
  Original weight matrix W (d x d, e.g., 4096 x 4096 = 16M params)
  Updated: W' = W + delta_W  (delta_W is also 4096 x 4096 = 16M params to learn)

LoRA:
  Original weight matrix W (4096 x 4096 = 16M params) [FROZEN]
  Adapter: delta_W = A * B
    A: (4096 x r)  where r = rank (typically 8-64)
    B: (r x 4096)

  With r=16: A has 65K params, B has 65K params = 130K params
  vs 16M for full fine-tuning = 99.2% reduction in trainable params

  During inference: output = W*x + A*B*x (adds minimal overhead)
```

```
+------------------------------------------------------------------+
|                    LoRA ARCHITECTURE                               |
+------------------------------------------------------------------+
|                                                                    |
|  Input x                                                          |
|    |                                                              |
|    +--------+--------+                                            |
|    |                 |                                             |
|    v                 v                                             |
|  +------+     +------+------+                                     |
|  |  W   |     |  A   |  B   |   A: down-project (d -> r)         |
|  | (frozen)   | (trainable) |   B: up-project (r -> d)           |
|  +------+     +------+------+   r << d (rank, e.g., 16)          |
|    |                 |                                             |
|    +--------+--------+                                            |
|             |                                                     |
|             v                                                     |
|         W*x + A*B*x                                               |
|         (merged output)                                           |
+------------------------------------------------------------------+
```

### QLoRA: Quantized LoRA

QLoRA combines LoRA with 4-bit quantization of the base model, enabling fine-tuning
of large models on consumer GPUs.

```
Memory comparison for Llama 3.1 70B:

Full fine-tuning:   ~280 GB  (4x A100 80GB minimum)
LoRA (FP16):        ~140 GB  (2x A100 80GB)
QLoRA (4-bit):      ~40 GB   (1x A100 80GB or 2x RTX 4090)
```

### LoRA Hyperparameters

| Parameter          | Typical Range                  | Effect                                   |
| ------------------ | ------------------------------ | ---------------------------------------- |
| **rank (r)**       | 8-64                           | Higher = more capacity, more memory      |
| **alpha**          | 16-64 (usually 2x rank)        | Scaling factor for LoRA updates          |
| **target_modules** | q_proj, v_proj, k_proj, o_proj | Which layers to add LoRA to              |
| **dropout**        | 0.05-0.1                       | Regularization to prevent overfitting    |
| **learning_rate**  | 1e-4 to 3e-4                   | Higher than full fine-tuning             |
| **epochs**         | 1-5                            | Fewer for large datasets, more for small |

---

## RLHF Basics

Reinforcement Learning from Human Feedback aligns models with human preferences.
As a SWE, you need to understand the concept, not implement it from scratch.

### RLHF Pipeline

```
+------------------------------------------------------------------+
|                    RLHF PIPELINE                                   |
+------------------------------------------------------------------+
|                                                                    |
|  Step 1: SUPERVISED FINE-TUNING (SFT)                             |
|  +------------------------------------------------------------+   |
|  | Train on curated (instruction, good_response) pairs         |   |
|  | Result: model that follows instructions                     |   |
|  +------------------------------------------------------------+   |
|                            |                                       |
|                            v                                       |
|  Step 2: REWARD MODEL TRAINING                                    |
|  +------------------------------------------------------------+   |
|  | Collect: model generates 2+ responses per prompt            |   |
|  | Humans rank: response A > response B                        |   |
|  | Train reward model to predict human preferences             |   |
|  +------------------------------------------------------------+   |
|                            |                                       |
|                            v                                       |
|  Step 3: PPO / DPO OPTIMIZATION                                  |
|  +------------------------------------------------------------+   |
|  | PPO: Use reward model as signal to optimize policy          |   |
|  | DPO: Direct Preference Optimization (simpler, no reward     |   |
|  |      model needed -- train directly on preference pairs)    |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### DPO (Direct Preference Optimization)

DPO is replacing RLHF in many settings because it is simpler (no reward model needed).

```python
# DPO training data format
dpo_examples = [
    {
        "prompt": "Explain quantum computing to a 5-year-old",
        "chosen": "Imagine you have a magic coin that can be heads AND tails at the same time...",
        "rejected": "Quantum computing utilizes quantum mechanical phenomena such as superposition...",
    },
    {
        "prompt": "Write a polite email declining a meeting",
        "chosen": "Hi [Name],\n\nThank you for the invitation. Unfortunately, I have a conflict...",
        "rejected": "I can't come to your meeting. I'm busy.",
    },
]
```

---

## Data Preparation

Data quality is the single most important factor in fine-tuning success.

### Data Requirements

| Model Size        | Minimum Examples | Recommended | Quality Bar           |
| ----------------- | ---------------- | ----------- | --------------------- |
| 7B-8B             | 100              | 1K-10K      | High (human reviewed) |
| 13B               | 200              | 5K-50K      | High                  |
| 70B               | 500              | 10K-100K    | Medium-High           |
| API (GPT-4o-mini) | 10               | 50-500      | High                  |

### Data Quality Checklist

```
+------------------------------------------------------------------+
| DATA QUALITY CHECKLIST                                            |
+------------------------------------------------------------------+
|                                                                    |
|  FORMAT                                                           |
|  [ ] Consistent instruction/response format                      |
|  [ ] Proper chat template (system, user, assistant)               |
|  [ ] No truncated responses                                      |
|  [ ] Correct JSON/JSONL encoding                                  |
|                                                                    |
|  QUALITY                                                          |
|  [ ] Human-reviewed or human-written responses                    |
|  [ ] No factual errors in training data                           |
|  [ ] Diverse examples (not all similar)                           |
|  [ ] Edge cases included                                          |
|  [ ] Appropriate response length                                  |
|                                                                    |
|  SAFETY                                                           |
|  [ ] No PII in training data                                     |
|  [ ] No harmful content                                           |
|  [ ] No copyrighted material (check with legal)                  |
|  [ ] Bias review completed                                        |
|                                                                    |
|  SPLITS                                                           |
|  [ ] Train/validation split (90/10 or 80/20)                     |
|  [ ] No data leakage between splits                              |
|  [ ] Validation set is representative                             |
|                                                                    |
+------------------------------------------------------------------+
```

### Synthetic Data Generation

When you do not have enough human-labeled data, use a stronger model to generate
training data for a weaker model (distillation).

```python
from openai import OpenAI
import json

client = OpenAI()

def generate_training_data(
    task_description: str,
    num_examples: int = 100,
    teacher_model: str = "gpt-4o",
) -> list[dict]:
    """Generate synthetic fine-tuning data using a teacher model."""
    examples = []

    for i in range(num_examples):
        response = client.chat.completions.create(
            model=teacher_model,
            temperature=0.8,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Generate a training example for this task: {task_description}\n\n"
                        "Respond with a JSON object containing:\n"
                        '- "instruction": the user query\n'
                        '- "response": the ideal assistant response\n\n'
                        f"This is example {i+1} of {num_examples}. "
                        "Make each example unique and diverse."
                    ),
                },
                {"role": "user", "content": "Generate the next training example."},
            ],
            response_format={"type": "json_object"},
        )

        example = json.loads(response.choices[0].message.content)
        examples.append({
            "messages": [
                {"role": "user", "content": example["instruction"]},
                {"role": "assistant", "content": example["response"]},
            ]
        })

    return examples


# Generate data for a ticket classification task
data = generate_training_data(
    task_description="Classify customer support tickets into categories "
                     "(billing, technical, account, feature_request) and "
                     "priority levels (low, medium, high, critical)",
    num_examples=200,
)

# Save as JSONL
with open("synthetic_training.jsonl", "w") as f:
    for example in data:
        f.write(json.dumps(example) + "\n")
```

---

## Practical Fine-Tuning with Code

### LoRA Fine-Tuning with Hugging Face + PEFT

```python
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# --- Configuration ---
MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"
OUTPUT_DIR = "./fine-tuned-model"
MAX_LENGTH = 512

# --- Step 1: Load model with 4-bit quantization (QLoRA) ---
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

# --- Step 2: Configure LoRA ---
lora_config = LoraConfig(
    r=16,                          # Rank
    lora_alpha=32,                 # Alpha (scaling factor)
    target_modules=[               # Which layers to add LoRA to
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = prepare_model_for_kbit_training(model)
model = get_peft_model(model, lora_config)

# Print trainable parameters
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
total_params = sum(p.numel() for p in model.parameters())
print(f"Trainable: {trainable_params:,} / {total_params:,} "
      f"({100 * trainable_params / total_params:.2f}%)")

# --- Step 3: Prepare dataset ---
def format_example(example: dict) -> dict:
    """Format a training example into the chat template."""
    messages = example["messages"]
    text = tokenizer.apply_chat_template(messages, tokenize=False)
    return {"text": text}

dataset = load_dataset("json", data_files="training.jsonl", split="train")
dataset = dataset.map(format_example)
dataset = dataset.train_test_split(test_size=0.1)

def tokenize_function(examples):
    return tokenizer(
        examples["text"],
        truncation=True,
        max_length=MAX_LENGTH,
        padding="max_length",
    )

tokenized_train = dataset["train"].map(tokenize_function, batched=True)
tokenized_eval = dataset["test"].map(tokenize_function, batched=True)

# --- Step 4: Training ---
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    weight_decay=0.01,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    logging_steps=10,
    eval_strategy="steps",
    eval_steps=50,
    save_strategy="steps",
    save_steps=50,
    bf16=True,
    gradient_checkpointing=True,
    report_to="wandb",  # or "none"
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_train,
    eval_dataset=tokenized_eval,
)

trainer.train()

# --- Step 5: Save the adapter ---
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
```

### Loading and Using the Fine-Tuned Model

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# Load base model + LoRA adapter
base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct",
    device_map="auto",
    torch_dtype=torch.bfloat16,
)
model = PeftModel.from_pretrained(base_model, "./fine-tuned-model")
tokenizer = AutoTokenizer.from_pretrained("./fine-tuned-model")

# Optionally merge adapter into base model (for faster inference)
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./merged-model")

# Inference
messages = [
    {"role": "user", "content": "Classify this ticket: I can't access my account"},
]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt").to("cuda")
outputs = model.generate(inputs, max_new_tokens=256)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

---

## Evaluation of Fine-Tuned Models

### Evaluation Strategy

```
+------------------------------------------------------------------+
| FINE-TUNING EVALUATION CHECKLIST                                  |
+------------------------------------------------------------------+
|                                                                    |
|  1. HELD-OUT TEST SET                                             |
|     - 10-20% of data reserved for evaluation                     |
|     - Never used during training                                  |
|     - Compare: base model vs fine-tuned on same test set          |
|                                                                    |
|  2. TASK-SPECIFIC METRICS                                         |
|     Classification: accuracy, F1, precision, recall               |
|     Generation: BLEU, ROUGE, human eval                           |
|     Extraction: exact match, partial match                        |
|                                                                    |
|  3. REGRESSION TESTING                                            |
|     - Test on general benchmarks (MMLU, HellaSwag)               |
|     - Ensure fine-tuning didn't degrade general capability        |
|     - Check for catastrophic forgetting                           |
|                                                                    |
|  4. SAFETY EVALUATION                                             |
|     - Run safety benchmarks before and after                      |
|     - Check for introduced biases                                 |
|     - Test refusal behavior on harmful prompts                    |
|                                                                    |
|  5. A/B TESTING                                                   |
|     - Deploy fine-tuned model to small % of traffic              |
|     - Compare user satisfaction, task success rate                |
|     - Measure latency and cost differences                        |
|                                                                    |
+------------------------------------------------------------------+
```

### Evaluation Code

```python
from sklearn.metrics import classification_report, accuracy_score
import json

def evaluate_classification_model(
    model,
    tokenizer,
    test_data: list[dict],
    valid_labels: list[str],
) -> dict:
    """Evaluate a fine-tuned classification model."""
    predictions = []
    ground_truth = []

    for example in test_data:
        messages = example["messages"][:-1]  # Remove assistant message
        expected = example["messages"][-1]["content"]

        inputs = tokenizer.apply_chat_template(messages, return_tensors="pt").to("cuda")
        outputs = model.generate(inputs, max_new_tokens=50, temperature=0)
        predicted = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract the prediction (last part of generated text)
        predicted_label = predicted.split("assistant")[-1].strip()

        predictions.append(predicted_label)
        ground_truth.append(expected)

    # Compute metrics
    accuracy = accuracy_score(ground_truth, predictions)
    report = classification_report(
        ground_truth, predictions, labels=valid_labels, output_dict=True
    )

    return {
        "accuracy": accuracy,
        "classification_report": report,
        "total_examples": len(test_data),
    }
```

---

## Cost Analysis

### Fine-Tuning Cost Comparison

```
+-----------------------------------------------------------------------+
| COST COMPARISON: OpenAI API Fine-Tuning                               |
+-----------------------------------------------------------------------+
|                                                                        |
| GPT-4o-mini fine-tuning:                                              |
|   Training: $3.00 per 1M tokens                                      |
|   Inference: $0.30 / $1.20 per 1M tokens (input/output)              |
|                                                                        |
| Example: 1000 training examples, avg 500 tokens each = 500K tokens   |
| Training cost: 3 epochs * 500K * $3.00/1M = $4.50                    |
|                                                                        |
| vs GPT-4o inference:                                                   |
|   If fine-tuned GPT-4o-mini replaces GPT-4o at same quality:         |
|   Savings: $2.50 -> $0.30 per 1M input tokens (88% cheaper)          |
|   Break-even: ~20K API calls                                          |
|                                                                        |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| COST COMPARISON: Self-Hosted QLoRA                                     |
+-----------------------------------------------------------------------+
|                                                                        |
| Hardware: 1x A100 80GB ($2/hr on cloud)                               |
|                                                                        |
| Llama 3.1 8B + QLoRA:                                                 |
|   Training time: ~2-4 hours (1K examples, 3 epochs)                  |
|   Training cost: $4-8                                                  |
|   Memory required: ~20 GB                                              |
|                                                                        |
| Llama 3.1 70B + QLoRA:                                                |
|   Training time: ~8-24 hours (1K examples, 3 epochs)                 |
|   Training cost: $16-48                                                |
|   Memory required: ~48 GB                                              |
|                                                                        |
| Inference (self-hosted Llama 8B on A100):                             |
|   ~$0.10-0.20 per 1M tokens                                          |
|   Break-even vs API: ~50K-100K queries/month                         |
|                                                                        |
+-----------------------------------------------------------------------+
```

### Cost Decision Matrix

| Monthly Volume   | Recommended Approach               | Estimated Monthly Cost |
| ---------------- | ---------------------------------- | ---------------------- |
| < 10K queries    | API (GPT-4o-mini)                  | $20-50                 |
| 10K-100K queries | Fine-tuned GPT-4o-mini             | $50-200                |
| 100K-1M queries  | Self-hosted fine-tuned 8B          | $500-1,500             |
| > 1M queries     | Self-hosted fine-tuned (optimized) | $1,000-5,000           |

---

## Common Interview Questions

### Q1: When would you choose fine-tuning over RAG?

**Answer:** Choose fine-tuning when you need to change model behavior, tone, or output
format rather than add knowledge. Specific cases: (1) you need a consistent, specific
output format that prompt engineering fails to achieve reliably, (2) you want to distill
a larger model's capability into a smaller, cheaper model, (3) you need domain-specific
language patterns the model has not seen (legal/medical jargon), (4) latency is critical
and the RAG retrieval overhead is unacceptable. Choose RAG when the primary need is
accessing up-to-date or proprietary knowledge. Often the best production systems use
both: fine-tune for behavior/format + RAG for knowledge.

### Q2: Explain LoRA and why it is useful.

**Answer:** LoRA (Low-Rank Adaptation) freezes the pre-trained model weights and
injects small trainable rank-decomposition matrices into each transformer layer.
Instead of updating a full d x d weight matrix (e.g., 4096 x 4096 = 16M parameters),
LoRA learns two small matrices A (d x r) and B (r x d) where r is typically 8-64.
This reduces trainable parameters by 99%+ while achieving 90-95% of full fine-tuning
quality. It is useful because: (1) dramatically reduced memory requirements (can
fine-tune 70B models on a single GPU with QLoRA), (2) fast training (hours instead of
days), (3) adapter is small (~50MB) and can be swapped at runtime for different tasks,
(4) base model is unchanged so you can serve multiple fine-tuned versions from one base.

### Q3: How do you prepare data for fine-tuning?

**Answer:** Data preparation has four stages: (1) Collection -- gather examples from
production logs, human annotation, or synthetic generation (using a stronger model).
(2) Quality filtering -- remove duplicates, fix formatting errors, filter low-quality
responses, ensure factual accuracy. (3) Formatting -- convert to the model's expected
chat template (system/user/assistant messages in JSONL). (4) Splitting -- 90/10
train/validation split with no data leakage. Key guidelines: quality over quantity
(100 excellent examples often beats 10K mediocre ones), diversity matters (cover edge
cases and different query types), and always do a manual review of at least 50 random
examples. For sensitive applications, have domain experts validate the training data.

### Q4: How do you know if fine-tuning worked?

**Answer:** Three-level evaluation: (1) Loss curves -- training and validation loss
should both decrease; if validation loss increases while training loss decreases, you
are overfitting. (2) Task-specific metrics -- compute accuracy/F1/BLEU on the held-out
test set and compare base model vs fine-tuned. (3) Regression testing -- run general
benchmarks (MMLU, HellaSwag) to ensure you did not cause catastrophic forgetting.
Additionally, do human evaluation on a sample of 50-100 outputs and A/B test in
production. A fine-tuning is successful only if task performance improves without
meaningful degradation on general capabilities.

### Q5: What is catastrophic forgetting and how do you prevent it?

**Answer:** Catastrophic forgetting is when fine-tuning on a narrow dataset causes the
model to lose its general capabilities. Mitigation strategies: (1) Use LoRA instead of
full fine-tuning -- it modifies fewer parameters, preserving more of the base model.
(2) Use a low learning rate (1e-5 to 3e-4). (3) Train for fewer epochs (1-3 is usually
enough). (4) Mix task-specific data with general data (10-20% general examples in
training). (5) Monitor general benchmarks during training and stop if they degrade.
(6) Use regularization (weight decay, dropout in LoRA).

---

## Quick Reference

### Fine-Tuning Decision Checklist

```
Before fine-tuning, verify:
[ ] Prompt engineering was tried and is insufficient
[ ] RAG was considered and does not solve the problem
[ ] You have at least 100 high-quality training examples
[ ] You have a clear evaluation metric
[ ] You have a held-out test set
[ ] The expected ROI justifies the cost
[ ] You have GPU access (for open-source) or budget (for API)
```

### Key Numbers to Remember

```
Training data:
  Minimum: 100 examples (API), 500 examples (open-source)
  Sweet spot: 1K-10K examples
  More != better after quality saturates

LoRA hyperparameters:
  Rank (r): 16 (default starting point)
  Alpha: 32 (2x rank)
  Learning rate: 2e-4 (QLoRA), 1e-5 (full FT)
  Epochs: 3 (default)
  Batch size: 4-8 per GPU

GPU memory (QLoRA, 4-bit):
  7B model:  ~8 GB   (RTX 3090/4090)
  13B model: ~15 GB  (RTX 4090)
  70B model: ~48 GB  (A100 80GB)

Training time (QLoRA, 1K examples, 3 epochs):
  7B model:  ~30 min (A100)
  13B model: ~1 hr   (A100)
  70B model: ~8 hrs  (A100)
```

### Tool Ecosystem

| Tool                          | Purpose                       | When to Use                     |
| ----------------------------- | ----------------------------- | ------------------------------- |
| **Hugging Face Transformers** | Model loading, training       | Open-source fine-tuning         |
| **PEFT**                      | LoRA/QLoRA implementation     | Parameter-efficient fine-tuning |
| **TRL**                       | SFT, DPO, RLHF trainers       | Alignment training              |
| **bitsandbytes**              | 4/8-bit quantization          | Reduce memory for QLoRA         |
| **Weights & Biases**          | Experiment tracking           | Monitor training runs           |
| **Axolotl**                   | Simplified fine-tuning config | Quick fine-tuning with YAML     |
| **OpenAI API**                | Hosted fine-tuning            | Fine-tune GPT-4o-mini           |
| **Unsloth**                   | Optimized training            | 2x faster LoRA training         |
