# LLM Fundamentals for Software Engineers

A practical guide to how Large Language Models work -- focused on what you need to know
as a software engineer building AI products, not as an ML researcher writing papers.

---

## Table of Contents

1. [What Is an LLM?](#what-is-an-llm)
2. [The Transformer Architecture (Simplified)](#the-transformer-architecture-simplified)
3. [Tokenization](#tokenization)
4. [Attention Mechanisms](#attention-mechanisms)
5. [Context Windows](#context-windows)
6. [Sampling Parameters](#sampling-parameters)
7. [Key Models Landscape](#key-models-landscape)
8. [Token Economics](#token-economics)
9. [Common Interview Questions](#common-interview-questions)
10. [Quick Reference](#quick-reference)

---

## What Is an LLM?

A Large Language Model is a neural network trained on massive text corpora that predicts
the next token in a sequence. Despite the simplicity of this objective, scaling it to
billions of parameters produces emergent capabilities: reasoning, code generation,
translation, summarization, and more.

**Key mental model for SWEs:** An LLM is a stateless function.

```
f(input_tokens) -> probability_distribution_over_next_token
```

It has no memory between calls. It does not "think" -- it performs a single forward pass
through the network to produce a probability distribution, then samples from that
distribution to pick the next token. Repeat until done.

```
+-------------------+      +------------------+      +-------------------+
| Input Text        | ---> | Tokenizer        | ---> | Token IDs         |
| "Hello, world"    |      | (BPE/SentencePiece)|    | [15496, 11, 995]  |
+-------------------+      +------------------+      +-------------------+
                                                              |
                                                              v
+-------------------+      +------------------+      +-------------------+
| Output Text       | <--- | Detokenizer      | <--- | Transformer       |
| "Hello, world!"   |      |                  |      | Neural Network    |
+-------------------+      +------------------+      +-------------------+
```

### Pre-training vs Post-training

```
+------------------------------------------------------------------+
|                    LLM TRAINING PIPELINE                          |
+------------------------------------------------------------------+
|                                                                    |
|  Stage 1: PRE-TRAINING                                            |
|  +------------------------------------------------------------+   |
|  | Train on massive text corpus (internet, books, code)        |   |
|  | Objective: predict next token                               |   |
|  | Result: "base model" -- good at completion, not instruction |   |
|  | Cost: $1M - $100M+ in compute                               |   |
|  +------------------------------------------------------------+   |
|                            |                                       |
|                            v                                       |
|  Stage 2: SUPERVISED FINE-TUNING (SFT)                            |
|  +------------------------------------------------------------+   |
|  | Train on (instruction, response) pairs                      |   |
|  | Human-written high-quality examples                         |   |
|  | Result: model follows instructions                          |   |
|  +------------------------------------------------------------+   |
|                            |                                       |
|                            v                                       |
|  Stage 3: RLHF / RLAIF                                           |
|  +------------------------------------------------------------+   |
|  | Reinforcement Learning from Human/AI Feedback               |   |
|  | Train reward model on human preferences                     |   |
|  | Optimize policy to maximize reward                          |   |
|  | Result: model is helpful, harmless, honest                  |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## The Transformer Architecture (Simplified)

The Transformer is the neural network architecture behind all modern LLMs. You do not
need to implement one, but you need to understand the building blocks.

### High-Level Architecture

```
                    THE TRANSFORMER (Decoder-Only, like GPT)

     Input: "The cat sat on the"
                    |
                    v
     +---------------------------+
     | Token Embedding Layer     |  Convert tokens to vectors (e.g., 4096-dim)
     +---------------------------+
                    |
                    v
     +---------------------------+
     | Positional Encoding       |  Add position information (token order matters)
     +---------------------------+
                    |
                    v
     +---------------------------+
     | Transformer Block 1       |  Self-attention + Feed-forward
     +---------------------------+
                    |
                    v
     +---------------------------+
     | Transformer Block 2       |  Same structure, different learned weights
     +---------------------------+
                    |
                    v
            ... (N blocks) ...      GPT-4: ~120 blocks, Llama 3 70B: 80 blocks
                    |
                    v
     +---------------------------+
     | Output Projection         |  Project back to vocabulary size
     +---------------------------+
                    |
                    v
     +---------------------------+
     | Softmax                   |  Convert to probability distribution
     +---------------------------+
                    |
                    v
     Output: probability for each token in vocabulary
             "mat": 0.35, "rug": 0.12, "floor": 0.08, ...
```

### Inside a Transformer Block

Each transformer block contains two sub-layers:

```
     +--------------------------------------------------+
     |              TRANSFORMER BLOCK                     |
     |                                                    |
     |   Input                                            |
     |     |                                              |
     |     +----> Layer Norm                              |
     |     |         |                                    |
     |     |    Multi-Head Self-Attention                  |
     |     |         |                                    |
     |     +-----> Add (Residual Connection)              |
     |     |                                              |
     |     +----> Layer Norm                              |
     |     |         |                                    |
     |     |    Feed-Forward Network (MLP)                |
     |     |    (expand 4x, activate, project back)       |
     |     |         |                                    |
     |     +-----> Add (Residual Connection)              |
     |                                                    |
     |   Output                                           |
     +--------------------------------------------------+
```

**Why this matters for SWEs:**
- **Layer count** affects model depth/capability (more layers = more reasoning steps)
- **Hidden dimension** affects model width (more dimensions = richer representations)
- **Residual connections** prevent training collapse -- this is why deep models work at all

### Model Size Reference

| Model | Parameters | Layers | Hidden Dim | Heads | Context |
|-------|-----------|--------|------------|-------|---------|
| GPT-3 | 175B | 96 | 12,288 | 96 | 4K |
| Llama 3.1 8B | 8B | 32 | 4,096 | 32 | 128K |
| Llama 3.1 70B | 70B | 80 | 8,192 | 64 | 128K |
| Llama 3.1 405B | 405B | 126 | 16,384 | 128 | 128K |
| Mistral 7B | 7.3B | 32 | 4,096 | 32 | 32K |

---

## Tokenization

Tokenization converts raw text into numbers the model can process. Understanding it is
critical for cost estimation, prompt design, and debugging weird model behavior.

### BPE (Byte Pair Encoding)

The dominant tokenization algorithm. Used by GPT models and most modern LLMs.

**How it works (simplified):**

1. Start with individual characters as tokens
2. Find the most frequent pair of adjacent tokens
3. Merge that pair into a new token
4. Repeat until you reach desired vocabulary size

```
Step 0: "l o w e r"  "l o w e s t"  "n e w e r"
Step 1: "lo w e r"   "lo w e s t"   "n e w e r"    (merged "l"+"o" -> "lo")
Step 2: "low e r"    "low e s t"    "n e w e r"     (merged "lo"+"w" -> "low")
Step 3: "low er"     "low e s t"    "n ew er"       (merged "e"+"r" -> "er")
Step 4: "lower"      "low e s t"    "n ewer"        (merged "low"+"er" -> "lower")
```

### SentencePiece

Used by Llama, Mistral, and many open-source models. Operates on raw text (including
spaces) rather than pre-tokenized words.

### Tokenization in Practice

```python
import tiktoken

# OpenAI's tokenizer (used by GPT-4, GPT-4o)
enc = tiktoken.encoding_for_model("gpt-4o")

text = "Hello, world! This is a test."
tokens = enc.encode(text)
print(f"Text: {text}")
print(f"Tokens: {tokens}")
print(f"Token count: {len(tokens)}")
print(f"Decoded tokens: {[enc.decode([t]) for t in tokens]}")

# Output:
# Text: Hello, world! This is a test.
# Tokens: [9906, 11, 1917, 0, 1115, 374, 264, 1296, 13]
# Token count: 9
# Decoded tokens: ['Hello', ',', ' world', '!', ' This', ' is', ' a', ' test', '.']
```

### Tokenization Gotchas for SWEs

| Gotcha | Example | Impact |
|--------|---------|--------|
| Spaces are tokens | `" Hello"` != `"Hello"` | Prompt formatting matters |
| Numbers split oddly | `"12345"` -> `["123", "45"]` | Math reasoning is hard for LLMs |
| Non-English is expensive | Chinese: ~1.5-2x more tokens | Cost varies by language |
| Code tokens vary | `function` = 1 token, `querySelector` = 3 | Code costs more than prose |
| Special tokens | `<|endoftext|>`, `<|im_start|>` | Control flow, not visible to user |

### Token Counting for Cost Estimation

```python
import tiktoken

def estimate_cost(
    prompt: str,
    expected_completion_tokens: int,
    model: str = "gpt-4o",
    input_price_per_1k: float = 0.0025,
    output_price_per_1k: float = 0.01,
) -> dict:
    enc = tiktoken.encoding_for_model(model)
    input_tokens = len(enc.encode(prompt))

    input_cost = (input_tokens / 1000) * input_price_per_1k
    output_cost = (expected_completion_tokens / 1000) * output_price_per_1k
    total_cost = input_cost + output_cost

    return {
        "input_tokens": input_tokens,
        "estimated_output_tokens": expected_completion_tokens,
        "input_cost": f"${input_cost:.6f}",
        "output_cost": f"${output_cost:.6f}",
        "total_cost": f"${total_cost:.6f}",
    }
```

---

## Attention Mechanisms

Attention is the core innovation that makes Transformers work. As a SWE, you need the
intuition, not the linear algebra.

### Self-Attention: The Intuition

Self-attention lets each token "look at" every other token in the sequence to decide
what is relevant for predicting the next token.

```
Sentence: "The cat sat on the mat because it was tired"

When processing "it", attention helps the model figure out:
  "it" refers to "cat" (high attention weight)
  not "mat" (lower attention weight)
  not "the" (very low attention weight)

Attention weights for "it":
  The  -> 0.02
  cat  -> 0.45  <-- highest: "it" refers to "cat"
  sat  -> 0.05
  on   -> 0.01
  the  -> 0.02
  mat  -> 0.15
  because -> 0.08
  it   -> 0.12
  was  -> 0.05
  tired -> 0.05
```

### Query, Key, Value (QKV)

The attention mechanism uses three projections -- think of it like a database lookup:

```
+-------+------------------------------------------+---------------------------+
| Name  | Analogy                                  | Role                      |
+-------+------------------------------------------+---------------------------+
| Query | "What am I looking for?"                 | The current token's       |
|       | (like a search query)                    | question to other tokens  |
+-------+------------------------------------------+---------------------------+
| Key   | "What do I contain?"                     | Each token's label that   |
|       | (like a database index)                  | says what info it has     |
+-------+------------------------------------------+---------------------------+
| Value | "Here is my actual content"              | The actual information    |
|       | (like the database record)               | that gets retrieved       |
+-------+------------------------------------------+---------------------------+

Process:
1. Compute similarity: score = Query * Key^T  (dot product)
2. Normalize: weights = softmax(score / sqrt(d_k))
3. Retrieve: output = weights * Value
```

### Multi-Head Attention

Instead of one attention operation, run multiple in parallel with different learned
projections. Each "head" can learn to attend to different patterns.

```
+------------------------------------------------------------------+
|                    MULTI-HEAD ATTENTION                            |
|                                                                    |
|   Head 1: Learns syntactic relationships (subject-verb)           |
|   Head 2: Learns semantic similarity (synonyms, coreference)     |
|   Head 3: Learns positional patterns (nearby words)              |
|   Head 4: Learns long-range dependencies                         |
|   ...                                                             |
|   Head N: (each head has its own QKV projections)                |
|                                                                    |
|   All heads concatenated -> Linear projection -> Output           |
+------------------------------------------------------------------+
```

**Why multi-head matters for SWEs:**
- More heads = model can track more relationships simultaneously
- This is why models handle complex, multi-part instructions
- Head count is a key model architecture parameter

### Causal (Autoregressive) Masking

Decoder-only models (GPT, Claude, Llama) use causal masking: each token can only
attend to tokens that came before it (not after). This ensures the model generates
left-to-right, one token at a time.

```
Attention mask for "The cat sat":

         The  cat  sat
The    [  1    0    0  ]   <- "The" can only see itself
cat    [  1    1    0  ]   <- "cat" can see "The" and itself
sat    [  1    1    1  ]   <- "sat" can see everything before it

0 = masked (cannot attend)
1 = visible (can attend)
```

### KV Cache

When generating tokens one at a time, the model would recompute attention for all
previous tokens at each step. KV cache stores previous key/value computations to
avoid redundant work.

```
Without KV cache (naive):
  Step 1: compute attention for [The]
  Step 2: compute attention for [The, cat]         (recomputes "The")
  Step 3: compute attention for [The, cat, sat]    (recomputes "The", "cat")
  ...
  Step N: O(N^2) total computation

With KV cache:
  Step 1: compute K,V for [The], cache them
  Step 2: compute K,V for [cat], reuse cached [The]
  Step 3: compute K,V for [sat], reuse cached [The, cat]
  ...
  Step N: O(N) total computation per step
```

**Why KV cache matters for SWEs:**
- KV cache is why long context windows need so much GPU memory
- KV cache size = `2 * num_layers * num_heads * head_dim * seq_len * dtype_size`
- A 70B model with 128K context can need 40+ GB just for KV cache
- This is a key constraint when hosting models yourself

---

## Context Windows

The context window is the maximum number of tokens a model can process in a single
request (input + output combined).

### Context Window Sizes (2025)

| Model | Context Window | Approx. Pages of Text |
|-------|---------------|----------------------|
| GPT-4o | 128K tokens | ~300 pages |
| Claude 3.5 Sonnet | 200K tokens | ~500 pages |
| Claude 3 Opus | 200K tokens | ~500 pages |
| Gemini 1.5 Pro | 2M tokens | ~5,000 pages |
| Llama 3.1 405B | 128K tokens | ~300 pages |
| Mistral Large | 128K tokens | ~300 pages |

### The "Lost in the Middle" Problem

Models pay more attention to the beginning and end of the context window. Information
placed in the middle is more likely to be missed.

```
Attention distribution across context:

Position:  [Start .................. Middle .................. End]
Attention: [HIGH   ................ LOW    ................ HIGH  ]

  ^                                                           ^
  |                                                           |
  Strong recall                                     Strong recall
                         ^
                         |
                   Weakest recall
                  ("lost in the middle")
```

**Practical implications for SWEs:**
- Place important context at the beginning or end of prompts
- Put instructions at the top, reference material in the middle, question at the end
- For RAG: put most relevant chunks first, not in the middle
- Long context != good context -- retrieval quality matters more than stuffing tokens

### Context Window vs. Effective Context

Just because a model supports 128K tokens does not mean it performs well at 128K.

```
+--------------------------------------------+
| Context Length vs. Performance              |
+--------------------------------------------+
|                                             |
| Performance                                 |
| ^                                           |
| |****                                       |
| |    ****                                   |
| |        *****                              |
| |             *****                         |
| |                  *********                |
| |                           ***********     |
| +------------------------------------->     |
|   4K   16K   32K   64K  128K  200K         |
|          Context Length (tokens)             |
+--------------------------------------------+

Rule of thumb:
- < 16K: Models perform reliably
- 16K-64K: Performance degrades gradually
- 64K+: Significant degradation on needle-in-haystack tasks
```

---

## Sampling Parameters

When the model outputs a probability distribution over tokens, sampling parameters
control how we pick the next token. These are your most important knobs as an engineer.

### Temperature

Controls randomness. Lower = more deterministic, higher = more creative.

```
Probabilities for next token after "The capital of France is":

              Temperature = 0        Temperature = 0.7      Temperature = 1.5
              (deterministic)        (balanced)             (creative)

  Paris       0.95                   0.72                   0.41
  Lyon        0.03                   0.12                   0.18
  Marseille   0.01                   0.08                   0.15
  Berlin      0.005                  0.04                   0.12
  Tokyo       0.001                  0.02                   0.08
  Pizza       0.0001                 0.01                   0.06

  Result:     Always "Paris"         Usually "Paris"        Sometimes surprising
```

**Temperature = 0** is actually **greedy decoding** (always pick the highest probability token).

### Top-p (Nucleus Sampling)

Instead of considering all tokens, only consider the smallest set of tokens whose
cumulative probability exceeds `p`.

```
Top-p = 0.9 means: consider tokens until their cumulative probability reaches 90%

Token probabilities (sorted): Paris=0.72, Lyon=0.12, Marseille=0.08, ...

Cumulative:
  Paris:     0.72  (< 0.9, include)
  Lyon:      0.84  (< 0.9, include)
  Marseille: 0.92  (>= 0.9, include this one, then stop)

Sample from: {Paris, Lyon, Marseille} only
All other tokens are excluded regardless of their probability.
```

### Top-k

Only consider the `k` most probable tokens.

```
Top-k = 3 means: only consider the top 3 tokens

Token probabilities: Paris=0.72, Lyon=0.12, Marseille=0.08, Berlin=0.04, ...

Sample from: {Paris, Lyon, Marseille} only
```

### Practical Parameter Combinations

| Use Case | Temperature | Top-p | Top-k | Why |
|----------|-------------|-------|-------|-----|
| Code generation | 0 - 0.2 | 0.95 | -- | Correctness over creativity |
| Factual Q&A | 0 | 1.0 | -- | Deterministic, reproducible |
| Creative writing | 0.8 - 1.0 | 0.95 | 40 | Variety and surprise |
| Chat assistant | 0.5 - 0.7 | 0.9 | -- | Balanced and natural |
| Data extraction | 0 | 1.0 | -- | Exact, consistent output |
| Brainstorming | 1.0 - 1.2 | 0.98 | 50 | Maximum diversity |

### Sampling in Code

```python
from openai import OpenAI

client = OpenAI()

# Deterministic (for code gen, extraction)
response = client.chat.completions.create(
    model="gpt-4o",
    temperature=0,
    messages=[{"role": "user", "content": "Write a Python function to sort a list"}],
)

# Creative (for brainstorming)
response = client.chat.completions.create(
    model="gpt-4o",
    temperature=1.0,
    top_p=0.95,
    messages=[{"role": "user", "content": "Give me 10 startup ideas"}],
)
```

### Other Important Parameters

| Parameter | What It Does | Typical Values |
|-----------|-------------|----------------|
| `max_tokens` | Maximum output length | 256 - 4096 |
| `stop` | Stop sequences to end generation | `["\n\n", "END"]` |
| `frequency_penalty` | Penalize tokens that appear often (-2 to 2) | 0 - 0.5 |
| `presence_penalty` | Penalize tokens that have appeared at all (-2 to 2) | 0 - 0.5 |
| `seed` | For reproducible outputs (with temp=0) | Any integer |
| `logprobs` | Return log probabilities of tokens | `true` / `false` |

---

## Key Models Landscape

### Major Model Families (2025)

```
+------------------------------------------------------------------+
|                    LLM LANDSCAPE (2025)                            |
+------------------------------------------------------------------+
|                                                                    |
|  PROPRIETARY (API-only)                                           |
|  +------------------------------------------------------------+   |
|  | OpenAI:   GPT-4o, GPT-4o-mini, o1, o3                      |   |
|  | Anthropic: Claude 3.5 Sonnet, Claude 3 Opus, Claude 4      |   |
|  | Google:   Gemini 1.5 Pro, Gemini 2.0 Flash                 |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  OPEN-WEIGHT (downloadable, self-hostable)                        |
|  +------------------------------------------------------------+   |
|  | Meta:     Llama 3.1 (8B, 70B, 405B), Llama 3.2             |   |
|  | Mistral:  Mistral 7B, Mixtral 8x7B, Mistral Large          |   |
|  | Alibaba:  Qwen 2.5 (0.5B - 72B)                            |   |
|  | DeepSeek: DeepSeek-V3, DeepSeek-R1                          |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  SPECIALIZED                                                      |
|  +------------------------------------------------------------+   |
|  | Code:     Codestral, StarCoder2, DeepSeek-Coder             |   |
|  | Embedding: text-embedding-3-large, BGE, E5                  |   |
|  | Multimodal: GPT-4o, Gemini, Claude 3.5 (vision)            |   |
|  +------------------------------------------------------------+   |
+------------------------------------------------------------------+
```

### Model Selection Guide for SWEs

| Criteria | Best Choice | Why |
|----------|------------|-----|
| Best overall quality | GPT-4o, Claude 3.5 Sonnet | Highest benchmarks across tasks |
| Lowest cost at scale | GPT-4o-mini, Gemini Flash, Llama 3.1 8B | 10-50x cheaper than frontier |
| Self-hosted / air-gapped | Llama 3.1, Mistral, Qwen | Open weights, no API dependency |
| Long context (>100K) | Gemini 1.5 Pro (2M), Claude (200K) | Largest context windows |
| Code generation | Claude 3.5 Sonnet, GPT-4o, Codestral | Top coding benchmarks |
| Complex reasoning | o1/o3, Claude, DeepSeek-R1 | Chain-of-thought, reasoning models |
| Multimodal (vision) | GPT-4o, Gemini, Claude 3.5 | Native image understanding |
| Embedding/search | text-embedding-3-large, Cohere Embed v3 | Purpose-built for similarity |

### Reasoning Models (o1, o3, DeepSeek-R1)

A new class of models that use extended "thinking" before answering. They trade latency
for accuracy on complex problems.

```
Standard model:
  Input -> [Single forward pass] -> Output
  Latency: 1-5 seconds
  Good for: most tasks

Reasoning model:
  Input -> [Think step 1] -> [Think step 2] -> ... -> [Think step N] -> Output
  Latency: 10-60+ seconds
  Good for: math, logic, complex code, multi-step reasoning
  Cost: 3-10x more tokens (thinking tokens are billed)
```

---

## Token Economics

Understanding token costs is essential for production AI engineering.

### Pricing Comparison (2025, per 1M tokens)

| Model | Input Price | Output Price | Notes |
|-------|-----------|-------------|-------|
| GPT-4o | $2.50 | $10.00 | Best OpenAI general model |
| GPT-4o-mini | $0.15 | $0.60 | 95% of GPT-4o quality, 17x cheaper |
| Claude 3.5 Sonnet | $3.00 | $15.00 | Strong coding and analysis |
| Claude 3 Haiku | $0.25 | $1.25 | Fast and cheap |
| Gemini 1.5 Pro | $1.25 | $5.00 | Best price for long context |
| Gemini 1.5 Flash | $0.075 | $0.30 | Ultra-cheap for simple tasks |
| Llama 3.1 70B (hosted) | ~$0.50 | ~$0.75 | Via Together/Fireworks |
| Self-hosted Llama 70B | ~$0.20 | ~$0.20 | GPU cost only, high volume |

### Cost Optimization Strategies

```
+---------------------------------------------------+
| COST REDUCTION TECHNIQUES                          |
+---------------------------------------------------+
|                                                     |
|  1. Model Routing                                   |
|     Easy queries -> GPT-4o-mini ($0.15/1M)         |
|     Hard queries -> GPT-4o ($2.50/1M)              |
|     Savings: 60-80%                                |
|                                                     |
|  2. Prompt Compression                              |
|     Remove redundant context                        |
|     Use shorter system prompts                      |
|     Savings: 20-40%                                |
|                                                     |
|  3. Caching                                         |
|     Cache identical or similar queries              |
|     Semantic cache for near-duplicates              |
|     Savings: 30-70% (depends on hit rate)          |
|                                                     |
|  4. Batching                                        |
|     Batch API (OpenAI: 50% discount)               |
|     Process non-urgent requests in bulk             |
|     Savings: 50%                                   |
|                                                     |
+---------------------------------------------------+
```

---

## Common Interview Questions

### Q1: Explain how a Transformer generates text.

**Answer:** A Transformer generates text one token at a time through autoregressive
decoding. The input tokens are embedded into vectors, positional information is added,
and the sequence passes through multiple Transformer blocks. Each block applies
multi-head self-attention (allowing tokens to attend to all previous tokens via causal
masking) followed by a feed-forward network. The final layer projects the output to
vocabulary size and applies softmax to get a probability distribution. We sample from
this distribution using parameters like temperature and top-p to select the next token,
append it to the sequence, and repeat until a stop condition is met.

### Q2: What is the difference between temperature, top-p, and top-k?

**Answer:** All three control the randomness of token selection. Temperature scales the
logits before softmax -- lower values sharpen the distribution (more deterministic),
higher values flatten it (more random). Top-p (nucleus sampling) dynamically selects the
smallest set of tokens whose cumulative probability exceeds p, adapting the candidate
pool size per step. Top-k simply takes the k highest-probability tokens. In practice,
temperature + top-p is the most common combination. For deterministic tasks (code gen,
extraction), use temperature=0. For creative tasks, use temperature 0.7-1.0 with
top-p around 0.95.

### Q3: Why do LLMs struggle with math?

**Answer:** Three reasons. First, tokenization splits numbers unpredictably -- "12345"
might become ["123", "45"], making digit-level reasoning difficult. Second, LLMs are
trained to predict the next token, not to compute -- they learn statistical patterns of
math rather than arithmetic algorithms. Third, they generate answers left-to-right, but
many math operations require right-to-left processing (carrying in addition). Reasoning
models (o1, R1) partially address this by using chain-of-thought reasoning to break
problems into steps, but they are still not calculators. For production systems, always
use code execution for math rather than relying on the LLM.

### Q4: What is KV cache and why does it matter?

**Answer:** KV cache stores the Key and Value matrices from previous tokens during
autoregressive generation. Without it, generating each new token requires recomputing
attention over the entire sequence, making generation O(n^2). With KV cache, each new
token only computes its own K/V and attends to cached K/V from previous tokens, making
per-token generation O(n). The tradeoff is memory: KV cache grows linearly with sequence
length and is proportional to model layers and hidden dimensions. For a 70B model at
128K context, KV cache alone can require 40+ GB of GPU memory, which is why long-context
inference is expensive and why techniques like GQA (Grouped Query Attention) are important
for reducing KV cache size.

### Q5: When would you choose an open-weight model over a proprietary API?

**Answer:** Choose open-weight models when you need: (1) data privacy -- sensitive data
cannot leave your infrastructure, (2) cost control at high volume -- self-hosting is
cheaper above ~10M tokens/day, (3) customization -- you need to fine-tune the model for
domain-specific tasks, (4) latency control -- you need guaranteed latency without API
rate limits, (5) offline/air-gapped deployment. Choose proprietary APIs when you need:
(1) state-of-the-art quality with minimal effort, (2) low-volume usage where self-hosting
does not justify the cost, (3) rapid prototyping, (4) access to the latest capabilities
without infrastructure management.

### Q6: What is the "lost in the middle" problem?

**Answer:** Research shows that LLMs have a U-shaped attention pattern across long
contexts -- they attend strongly to tokens at the beginning and end of the context window
but pay less attention to information in the middle. This means relevant context placed
in the middle of a long prompt is more likely to be missed or ignored. For RAG systems,
this means you should place the most relevant retrieved chunks at the beginning, not
in the middle. For prompts, put instructions at the top and the query at the bottom.
Some teams reorder retrieved documents so the most relevant appears first and last.

---

## Quick Reference

### Key Numbers to Know

```
1 token       ~ 4 characters in English (approximately 0.75 words)
1 page        ~ 500-750 tokens
1,000 tokens  ~ 750 words
100K tokens   ~ 75,000 words (~150 pages)

GPT-4o cost (1M input tokens):   $2.50
GPT-4o-mini cost (1M tokens):    $0.15
Claude 3.5 Sonnet (1M tokens):   $3.00

Inference speed (API):
  GPT-4o:          ~80-100 tokens/sec
  Claude 3.5:      ~70-90 tokens/sec
  Llama 70B (A100): ~30-40 tokens/sec

GPU memory requirements (FP16):
  7B model:   ~14 GB  (1x A100 40GB)
  13B model:  ~26 GB  (1x A100 80GB)
  70B model:  ~140 GB (2x A100 80GB)
  405B model: ~810 GB (8-10x A100 80GB)
```

### Terminology Cheat Sheet

| Term | Definition |
|------|-----------|
| **Token** | The basic unit of text processing (subword, ~4 chars in English) |
| **Context window** | Maximum input + output tokens per request |
| **Temperature** | Controls randomness of output (0 = deterministic, 1+ = creative) |
| **Top-p** | Nucleus sampling -- consider tokens up to cumulative probability p |
| **Top-k** | Only consider the k most probable tokens |
| **Embedding** | Dense vector representation of text (for similarity search) |
| **Fine-tuning** | Further training a model on task-specific data |
| **RLHF** | Reinforcement Learning from Human Feedback (alignment technique) |
| **LoRA** | Low-Rank Adaptation -- efficient fine-tuning method |
| **Inference** | Running a trained model to generate predictions |
| **Latency** | Time to generate a response (TTFT = time to first token) |
| **Throughput** | Tokens generated per second |
| **Quantization** | Reducing model precision (FP16 -> INT8/INT4) to save memory |
| **KV cache** | Cached key/value matrices for efficient autoregressive generation |
| **Causal masking** | Prevents tokens from attending to future tokens |
| **GQA** | Grouped Query Attention -- shares KV heads to reduce memory |
| **MoE** | Mixture of Experts -- activates subset of parameters per token |
