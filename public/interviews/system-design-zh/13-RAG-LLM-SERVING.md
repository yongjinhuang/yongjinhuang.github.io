# 设计 RAG Pipeline 与 LLM Serving 系统

## 1. 需求澄清

### 功能需求

| 需求 | 描述 |
|---|---|
| 文档摄入 | 上传并处理文档（PDF、HTML、Markdown、DOCX） |
| Chunking 与 Embedding | 将文档拆分为 chunk，生成向量 embedding |
| 向量存储 | 将 embedding 存储在 Vector DB 中以实现快速检索 |
| 语义检索 | 根据用户查询检索相关上下文 |
| 答案生成 | 使用 LLM 结合检索到的上下文生成有依据的答案 |
| 多轮对话 | 跨轮次维护对话上下文 |
| 引用追踪 | 将生成的答案归因到源文档和段落 |
| 反馈收集 | 收集用户评分（点赞/点踩）用于持续改进 |

### 非功能需求

| 需求 | 目标 |
|---|---|
| 端到端延迟 | < 2 秒（首 token 时间 < 500ms） |
| 文档规模 | 1000 万文档已索引 |
| 查询吞吐量 | 每天 10 万次查询（平均约 1.2 QPS，峰值 10 QPS） |
| 可用性 | 99.9% 正常运行时间 |
| 新鲜度 | 新文档在 15 分钟内可搜索 |
| 成本效率 | 每次查询平均成本 < $0.02 |
| 准确性 | 事实性查询的幻觉率 < 5% |

### 规模估算

```
文档数量:          1000 万文档
平均文档长度:       5 页 ~ 2,500 词 ~ 3,500 tokens
平均 chunks/文档:   ~10 chunks（每 chunk 256 tokens）
总 chunks 数:       1 亿 chunks

Embedding 维度:     1536（OpenAI ada-002）或 768（开源模型）
每 chunk 存储:
  - 向量:    1536 维 * 4 字节 = 6.1 KB
  - 元数据:  ~0.5 KB
  - 文本:    ~1 KB
  - 合计:    ~7.6 KB/chunk

总向量存储: 1 亿 * 6.1 KB = ~610 GB（仅向量）
总存储:     1 亿 * 7.6 KB = ~760 GB（含元数据 + 文本）

每日查询:         10 万
每次查询 tokens:  ~2,000（prompt + 上下文 + 回复）
每日总 tokens:    2 亿 tokens
每月 token 成本:  2 亿 * 30 * $0.003/1K = ~$18,000（GPT-4 级别）
                  2 亿 * 30 * $0.00015/1K = ~$900（GPT-4o-mini 级别）

Embedding 成本（一次性摄入）:
  1 亿 chunks * 256 tokens * $0.0001/1K = ~$2,560

GPU inference（自托管）:
  ~4 块 A100 GPU 可支撑 10 QPS（70B 模型）
  成本: 4 * $2/小时 = $8/小时 = ~$5,760/月
```

---

## 2. RAG 架构概述

### 什么是 RAG？

检索增强生成（RAG）是一种在生成答案之前，先从外部知识库中检索相关信息来增强大语言模型（LLM）响应的技术。RAG 不仅依赖模型的参数化知识（训练数据），还将回复建立在具体的、最新的文档之上。

**为什么 RAG 很重要：**
- 通过提供事实依据来减少幻觉
- 无需微调即可实现领域特定的回答
- 知识可以在不重新训练模型的情况下更新
- 提供可验证的源材料引用
- 对于大多数场景来说，比微调更具成本效益

### RAG vs Fine-Tuning vs Prompt Engineering

```
+---------------------+------------------+------------------+------------------+
| 维度                | Prompt Eng.      | RAG              | Fine-Tuning      |
+---------------------+------------------+------------------+------------------+
| 知识更新            | 手动             | 实时             | 需要重新训练     |
| 成本                | 低               | 中               | 高               |
| 实施时间            | 数小时           | 数天             | 数周             |
| 幻觉控制            | 有限             | 强               | 中等             |
| 领域适配            | 表层             | 深度（检索）     | 深度（权重）     |
| 延迟                | 最快             | +200-500ms       | 与基础模型相同   |
| 数据隐私            | 不适用           | 完全控制         | 与供应商共享     |
| 维护                | 低               | 中               | 高               |
| 最适用于            | 简单任务         | 知识密集型       | 风格/行为        |
+---------------------+------------------+------------------+------------------+
```

**何时使用各方案：**
- **Prompt Engineering**：简单任务、格式化、角色控制
- **RAG**：企业知识库、文档问答、客户支持
- **Fine-Tuning**：自定义语调/风格、专业推理、任务特定行为
- **RAG + Fine-Tuning**：复杂生产系统的最佳组合

### RAG 演进：朴素 RAG vs 高级 RAG vs 模块化 RAG

```
+-------------------+----------------------------------+---------------------------+
| 朴素 RAG          | 高级 RAG                          | 模块化 RAG                |
+-------------------+----------------------------------+---------------------------+
| 简单检索          | 检索前优化                        | 可插拔组件                |
|   + 生成          | （查询改写、HyDE）                | （可替换任意模块）        |
|                   |                                  |                           |
| 固定 chunking     | 智能 chunking                     | 自适应 chunking           |
|                   | （语义、父子级）                  | （按文档类型调整）        |
|                   |                                  |                           |
| 单次检索          | 多步检索                          | 在检索策略间              |
|                   | （检索 -> 重排 -> 过滤）          | 进行路由                  |
|                   |                                  |                           |
| 无评估            | 内置评估                          | 反馈循环 +                |
|                   | （RAGAS、忠实度）                 | 自我改进 pipeline         |
|                   |                                  |                           |
| 问题:             | 改进:                            | 架构:                     |
| - 低相关性        | - 查询转换                        | - 基于 Agent 的路由       |
| - 幻觉            | - 混合搜索（dense+sparse）        | - 多索引策略              |
| - 无引用          | - Cross-encoder 重排              | - 迭代检索                |
+-------------------+----------------------------------+---------------------------+
```

### 完整 RAG Pipeline（ASCII 图）

```
                        INGESTION PIPELINE (Offline/Async)
  +---------------------------------------------------------------------------+
  |                                                                           |
  |   +----------+    +-----------+    +-----------+    +----------------+    |
  |   | Documents |-->| Parser &  |--->| Chunking  |--->| Embedding      |    |
  |   | (PDF,HTML |   | Cleaner   |    | Engine    |    | Model          |    |
  |   |  MD,DOCX) |   +-----------+    +-----------+    +-------+--------+    |
  |   +----------+         |                |                   |             |
  |                        v                v                   v             |
  |                  +----------+    +------------+    +----------------+     |
  |                  | Metadata |    | Chunk Store|    | Vector DB      |     |
  |                  | Store    |    | (text+meta)|    | (embeddings)   |     |
  |                  +----------+    +------------+    +----------------+     |
  +---------------------------------------------------------------------------+

                         QUERY PIPELINE (Online/Sync)
  +---------------------------------------------------------------------------+
  |                                                                           |
  |   +-------+    +----------+    +----------+    +-----------+              |
  |   | User  |--->| Query    |--->| Embedding|--->| Vector    |              |
  |   | Query |    | Rewriter |    | Model    |    | Search    |              |
  |   +-------+    +----------+    +----------+    +-----+-----+             |
  |                                                      |                   |
  |                                                      v                   |
  |   +----------+    +-----------+    +-----------+    +----------+         |
  |   | Response |<---| LLM       |<---| Context   |<---| Reranker |         |
  |   | + Cites  |    | Generator |    | Assembler |    |          |         |
  |   +----------+    +-----------+    +-----------+    +----------+         |
  +---------------------------------------------------------------------------+
```

---

## 3. 文档摄入 Pipeline

### 文档解析

不同文档类型需要专门的解析器：

```
+-------------+---------------------------+----------------------------+
| 格式        | 解析器/工具               | 注意事项                   |
+-------------+---------------------------+----------------------------+
| PDF         | PyMuPDF, pdfplumber,      | 表格、图片、多栏布局       |
|             | Unstructured, LlamaParse  | 需要特殊处理               |
| HTML        | BeautifulSoup, Trafilatura| 去除样板内容，保留         |
|             |                           | 语义结构                   |
| Markdown    | markdown-it, remark       | 保留标题、代码块、列表     |
|             |                           |                            |
| DOCX        | python-docx, Unstructured | 处理样式、表格、           |
|             |                           | 嵌入图片                   |
| CSV/Excel   | pandas, openpyxl          | 按行或按表级别             |
|             |                           | 进行 chunking              |
| Code        | tree-sitter, AST parsers  | 函数/类级别                |
|             |                           | 语义边界                   |
+-------------+---------------------------+----------------------------+
```

**文档解析伪代码：**

```python
def parse_document(file_path: str, file_type: str) -> ParsedDocument:
    parser = get_parser(file_type)  # factory pattern

    raw_content = parser.extract_text(file_path)

    metadata = {
        "source": file_path,
        "file_type": file_type,
        "title": parser.extract_title(file_path),
        "author": parser.extract_author(file_path),
        "created_at": parser.extract_date(file_path),
        "page_count": parser.get_page_count(file_path),
        "word_count": len(raw_content.split()),
    }

    # 结构化提取保留章节、标题、表格
    sections = parser.extract_sections(file_path)

    return ParsedDocument(
        content=raw_content,
        sections=sections,
        metadata=metadata
    )
```

### Chunking 策略深入探讨

Chunking 是 RAG 质量中最关键的步骤。糟糕的 chunking 会导致糟糕的检索。

#### 1. 固定大小 Chunking

```
Document: [===========================================================]

Chunks:   [==========] [==========] [==========] [==========] [======]
           500 tokens   500 tokens   500 tokens   500 tokens   remainder

With overlap (50 tokens):
          [==========]
               [==========]
                    [==========]
                         [==========]
```

```python
def fixed_size_chunk(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    tokens = tokenize(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunks.append(detokenize(tokens[start:end]))
        start += chunk_size - overlap
    return chunks
```

#### 2. 语义 Chunking

在自然边界（句子、段落）处分割，同时遵守大小限制。

```
Document: [Para 1.............] [Para 2.....] [Para 3..................]

Chunks:   [Para 1.............] [Para 2..... | Para 3..................]
          (符合限制)             (合并以填满 chunk 大小)
```

```python
def semantic_chunk(text: str, max_tokens: int = 512) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_size = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)
        if current_size + para_tokens > max_tokens and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = []
            current_size = 0
        current_chunk.append(para)
        current_size += para_tokens

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    return chunks
```

#### 3. 递归字符文本拆分（LangChain 方法）

```
按以下顺序尝试分割: ["\n\n", "\n", ". ", " ", ""]
                     段落 -> 行 -> 句子 -> 单词 -> 字符

如果 chunk > max_size:
  尝试按第一个分隔符分割
  如果仍然太大，尝试下一个分隔符
  递归分割直到所有 chunk 符合要求
```

#### 4. 父子 Chunking（从小到大）

这是一种强大的高级技术：使用小 chunk 进行精确检索，但将较大的父 chunk 作为上下文返回给 LLM。

```
Document Section (Parent - 2000 tokens):
+-----------------------------------------------------------------------+
| "Machine learning is a subset of AI that enables systems to learn     |
|  from data. There are three main types: supervised, unsupervised,     |
|  and reinforcement learning..."                                        |
+-----------------------------------------------------------------------+
        |                    |                    |
        v                    v                    v
  +------------+      +------------+      +------------+
  | Child 1    |      | Child 2    |      | Child 3    |
  | 256 tokens |      | 256 tokens |      | 256 tokens |
  | "ML is a   |      | "supervised|      | "reinforce-|
  |  subset..." |      |  learning."|      |  ment..."  |
  +------------+      +------------+      +------------+
  (用于检索的          (用于检索的          (用于检索的
   索引)               索引)                索引)

查询: "What is supervised learning?"
  -> 匹配 Child 2（精确匹配）
  -> 返回 Parent chunk（完整上下文）给 LLM
```

```python
def parent_child_chunk(document: str) -> tuple[list[str], list[str]]:
    # 创建大的父 chunk
    parent_chunks = semantic_chunk(document, max_tokens=2000)

    child_chunks = []
    child_to_parent = {}

    for parent_idx, parent in enumerate(parent_chunks):
        # 从每个父 chunk 创建小的子 chunk
        children = fixed_size_chunk(parent, chunk_size=256, overlap=32)
        for child in children:
            child_idx = len(child_chunks)
            child_chunks.append(child)
            child_to_parent[child_idx] = parent_idx

    return parent_chunks, child_chunks, child_to_parent
```

#### 5. 滑动窗口带重叠

```
窗口大小: 512 tokens, 步长: 384 tokens (重叠 = 128)

Position:  0        384       768      1152      1536
           |---------|---------|---------|---------|
Chunk 1:   [========512========]
Chunk 2:            [========512========]
Chunk 3:                      [========512========]
Chunk 4:                                [========512========]

重叠确保不会有信息落在 chunk 边界之间。
```

#### Chunking 策略比较

```
+-------------------+------------+----------+-----------+------------------+
| 策略              | 检索       | 上下文   | 实现      | 最适用于         |
|                   | 精度       | 质量     | 难度      |                  |
+-------------------+------------+----------+-----------+------------------+
| 固定大小          | 低-中      | 低       | 极简      | 快速原型         |
| 语义              | 中         | 中       | 低        | 通用文档         |
| 递归拆分          | 中         | 中       | 低        | 混合内容         |
| 父子级            | 高         | 高       | 中        | 生产环境 RAG     |
| 滑动窗口          | 中-高      | 中       | 低        | 密集技术文档     |
| 基于 Agent（LLM） | 最高       | 最高     | 高        | 高价值文档       |
+-------------------+------------+----------+-----------+------------------+
```

**生产环境建议：** 父子 chunking 配合语义边界可以在检索精度和上下文质量之间取得最佳平衡。

### 元数据提取与丰富

```python
def enrich_chunk(chunk: str, document_metadata: dict, chunk_idx: int) -> dict:
    return {
        "chunk_id": generate_uuid(),
        "document_id": document_metadata["document_id"],
        "text": chunk,
        "chunk_index": chunk_idx,

        # 文档级元数据
        "source": document_metadata["source"],
        "title": document_metadata["title"],
        "author": document_metadata["author"],
        "created_at": document_metadata["created_at"],
        "category": document_metadata["category"],

        # Chunk 级元数据（自动提取）
        "section_header": extract_nearest_header(chunk),
        "token_count": count_tokens(chunk),
        "has_code": contains_code_block(chunk),
        "has_table": contains_table(chunk),
        "language": detect_language(chunk),

        # 用于检索时过滤
        "department": document_metadata.get("department"),
        "access_level": document_metadata.get("access_level", "public"),
    }
```

### 摄入 Pipeline 架构

```
                    Document Ingestion Pipeline

  +--------+     +----------------+     +------------------+
  | Upload |     | Message Queue  |     | Worker Pool      |
  | API    |---->| (SQS/Kafka)   |---->| (Auto-scaled)    |
  +--------+     +----------------+     +--------+---------+
                                                 |
                          +----------------------+---------------------+
                          |                      |                     |
                          v                      v                     v
                   +------------+        +-------------+       +------------+
                   | Parser     |        | Chunker     |       | Embedder   |
                   | Service    |------->| Service     |------>| Service    |
                   +------------+        +-------------+       +------+-----+
                                                                      |
                                               +----------------------+
                                               |                      |
                                               v                      v
                                        +------------+        +------------+
                                        | Chunk      |        | Vector     |
                                        | Store (PG) |        | DB         |
                                        +------------+        +------------+

  监控: 跟踪摄入速率、错误率、embedding 延迟、队列深度
```

---

## 4. Embedding 与向量存储

### Embedding 模型比较

```
+--------------------+------+--------+----------+---------+------------------+
| 模型               | 维度 | MTEB   | 速度     | 成本    | 备注             |
|                    |      | 评分   |          |         |                  |
+--------------------+------+--------+----------+---------+------------------+
| OpenAI text-       | 1536 | 61.0   | 快       | $0.0001 | 最流行，         |
| embedding-3-small  |      |        | (API)    | /1K tok | 良好基线         |
+--------------------+------+--------+----------+---------+------------------+
| OpenAI text-       | 3072 | 64.6   | 快       | $0.00013| 更高质量，       |
| embedding-3-large  |      |        | (API)    | /1K tok | 支持 MRL         |
+--------------------+------+--------+----------+---------+------------------+
| Cohere embed-v3    | 1024 | 64.5   | 快       | $0.0001 | 良好的多语言     |
|                    |      |        | (API)    | /1K tok | 支持             |
+--------------------+------+--------+----------+---------+------------------+
| Voyage-3           | 1024 | 67.1   | 快       | $0.00006| 代码 + 文本，    |
|                    |      |        | (API)    | /1K tok | 性价比高         |
+--------------------+------+--------+----------+---------+------------------+
| BGE-large-en-v1.5  | 1024 | 64.2   | 中       | 免费    | 开源，           |
| (BAAI)             |      |        | (GPU)    | (GPU$)  | 自托管           |
+--------------------+------+--------+----------+---------+------------------+
| GTE-Qwen2-7B       | 3584 | 70.2   | 慢       | 免费    | SOTA 开源        |
| (Alibaba)          |      |        | (GPU)    | (GPU$)  | 需要大 GPU       |
+--------------------+------+--------+----------+---------+------------------+
| NV-Embed-v2        | 4096 | 72.3   | 慢       | 免费    | NVIDIA，MTEB 榜首|
| (NVIDIA)           |      |        | (GPU)    | (GPU$)  | 截至 2024 年底   |
+--------------------+------+--------+----------+---------+------------------+
| all-MiniLM-L6-v2   | 384  | 56.3   | 最快     | 免费    | 轻量级，         |
| (sentence-transf.) |      |        | (CPU OK) | (CPU$)  | 适合 MVP         |
+--------------------+------+--------+----------+---------+------------------+
```

### Embedding 维度权衡

```
维度            384         768        1024        1536        3072+
                 |           |           |           |           |
质量        低-中         中          中-高         高         最高
存储        1.5 KB      3.0 KB      4.0 KB       6.1 KB     12.3 KB
搜索        最快         快          中等          较慢        最慢
速度
1亿向量     ~36 GB      ~72 GB      ~96 GB       ~144 GB    ~288 GB+
所需 RAM
                 |           |           |           |           |
最适用于    原型        均衡        生产环境      企业级      研究
            低成本      通用        高质量        最高质量    基准测试
```

**Matryoshka Representation Learning (MRL)：** 像 OpenAI text-embedding-3 这样的现代模型支持将 embedding 截断到更少的维度（如 1536 -> 512），同时质量优雅地降级。这实现了"先尝试小维度，按需升级"的方法。

### Vector DB 选型

```
+-------------+-----------+--------+--------+-----------+--------------------+
| 数据库      | 类型      | 规模   | 成本   | 过滤      | 核心特性           |
+-------------+-----------+--------+--------+-----------+--------------------+
| Pinecone    | 托管      | 10亿+  | $$     | 良好      | Serverless 选项，  |
|             | 云        |        |        |           | 易于起步           |
+-------------+-----------+--------+--------+-----------+--------------------+
| Weaviate    | 托管 /    | 10亿+  | $-$$   | 优秀      | 多模态，           |
|             | 自托管    |        |        |           | GraphQL API        |
+-------------+-----------+--------+--------+-----------+--------------------+
| Qdrant      | 托管 /    | 10亿+  | $-$$   | 优秀      | Rust 构建，快速    |
|             | 自托管    |        |        |           | 过滤 + 搜索        |
+-------------+-----------+--------+--------+-----------+--------------------+
| Milvus      | 自托管    | 100亿+ | $      | 良好      | 最大规模，         |
| (Zilliz)    | / 托管    |        |        |           | GPU 加速           |
+-------------+-----------+--------+--------+-----------+--------------------+
| pgvector    | 扩展      | 1000万 | $      | 优秀      | Postgres 原生，    |
|             | (Postgres)|        |        | (SQL!)    | 运维简单           |
+-------------+-----------+--------+--------+-----------+--------------------+
| ChromaDB    | 嵌入式    | 100万  | 免费   | 基础      | 本地开发，         |
|             |           |        |        |           | 原型验证           |
+-------------+-----------+--------+--------+-----------+--------------------+
| FAISS       | 库        | 10亿+  | 免费   | 无        | Facebook，最快的   |
|             | (内存)    |        | (RAM$) | (手动)    | 纯向量搜索         |
+-------------+-----------+--------+--------+-----------+--------------------+
| Elasticsearch| 自托管   | 10亿+  | $-$$   | 优秀      | 现有基础设施，     |
| (kNN)       | / 托管    |        |        | (完整BM25)| 混合搜索           |
+-------------+-----------+--------+--------+-----------+--------------------+
```

**选型指南：**
- **初创/原型**：pgvector（如 < 1000 万向量）或 ChromaDB（本地开发）
- **生产环境（托管）**：Pinecone 或 Qdrant Cloud
- **生产环境（自托管，最大控制权）**：Qdrant 或 Milvus
- **已使用 Postgres**：pgvector 配合适当索引
- **需要混合搜索**：Elasticsearch 或 Weaviate

### 索引算法

#### HNSW（Hierarchical Navigable Small World）

向量搜索中最流行的索引算法。构建多层图，其中高层节点更少、更分散以便快速导航，低层节点更密集以便精确搜索。

```
Layer 3 (sparse):     A ---- D
                      |
Layer 2 (medium):     A --- B ---- D --- F
                      |     |      |
Layer 1 (dense):      A - B - C - D - E - F - G - H
                      |   |   |   |   |   |   |   |
Layer 0 (all nodes):  A-B-C-D-E-F-G-H-I-J-K-L-M-N-O-P

搜索: 从最高层开始，贪心地导航到最近节点，
      下降到下一层，重复直到 Layer 0。

参数:
  M  = 每个节点的最大连接数 (16-64, 越高 = 召回率越好, RAM 越多)
  ef = 搜索时的 beam 宽度 (50-200, 越高 = 召回率越好, 越慢)
```

```
+--------+------------+---------+----------+-----------+
| 算法   | 构建时间   | 查询    | 内存     | 召回率    |
+--------+------------+---------+----------+-----------+
| HNSW   | 慢         | 最快    | 最高     | ~99%      |
| IVF    | 中         | 快      | 中       | ~95%      |
| PQ     | 中         | 快      | 最低     | ~90%      |
| IVF+PQ | 中         | 快      | 低       | ~93%      |
| Flat   | 无         | 最慢    | 基线     | 100%      |
+--------+------------+---------+----------+-----------+
```

#### IVF（Inverted File Index）

将向量空间划分为多个聚类。查询时只搜索最近的聚类。

```
向量空间被划分为 K 个聚类:

  Cluster 1: [v1, v5, v12, v23, ...]
  Cluster 2: [v2, v8, v15, v31, ...]
  Cluster 3: [v3, v6, v19, v28, ...]
  ...
  Cluster K: [v4, v11, v22, v30, ...]

查询: embed(query) -> 找到最近的 nprobe 个聚类 -> 在其中搜索
  nprobe = 1:  快但可能遗漏相关结果
  nprobe = 10: 慢但召回率更高
```

#### Product Quantization (PQ)

压缩向量以减少内存。将每个向量拆分为子向量，将每个子向量量化为码本中最近的质心。

```
原始向量 (1536 维, 6144 字节):
[0.12, 0.45, 0.78, ..., 0.33, 0.91, 0.56]

拆分为 192 个 8 维的子向量:
[0.12,0.45,...] [0.78,0.21,...] ... [0.33,0.91,...]

将每个量化为最近的质心 (256 个质心 = 每个 1 字节):
[42] [187] [5] ... [201]

压缩后: 192 字节 (32 倍压缩!)
```

### 混合搜索：Dense + Sparse

将语义向量搜索与传统关键词搜索（BM25）相结合，实现两者优势兼得的检索。

```
用户查询: "How does the TCP three-way handshake work?"

Dense Search（语义）:                   Sparse Search（BM25 关键词）:
  1. [0.92] TCP connection setup guide     1. [8.5] TCP three-way handshake RFC
  2. [0.89] Network handshake protocols    2. [7.2] SYN SYN-ACK ACK explained
  3. [0.85] HTTP connection lifecycle      3. [6.8] TCP handshake timeout config
  4. [0.82] WebSocket handshake            4. [5.1] Handshake protocol overview

Reciprocal Rank Fusion (RRF):
  score(doc) = sum( 1 / (k + rank_dense) + 1 / (k + rank_sparse) )
  k = 60 (常数，用于减少异常排名的影响)

最终融合排名:
  1. TCP three-way handshake RFC        (强关键词 + 良好语义)
  2. TCP connection setup guide         (强语义 + 尚可的关键词)
  3. Network handshake protocols        (良好语义)
  4. SYN SYN-ACK ACK explained          (良好关键词)
```

```python
def hybrid_search(query: str, top_k: int = 10, alpha: float = 0.7) -> list[dict]:
    """
    alpha 控制 dense 与 sparse 的权重。
    alpha=1.0 = 纯 dense, alpha=0.0 = 纯 sparse
    """
    query_embedding = embed(query)

    # Dense 检索
    dense_results = vector_db.search(query_embedding, top_k=top_k * 2)

    # Sparse 检索 (BM25)
    sparse_results = bm25_index.search(query, top_k=top_k * 2)

    # Reciprocal Rank Fusion
    scores = {}
    k = 60
    for rank, doc in enumerate(dense_results):
        scores[doc.id] = scores.get(doc.id, 0) + alpha * (1 / (k + rank + 1))
    for rank, doc in enumerate(sparse_results):
        scores[doc.id] = scores.get(doc.id, 0) + (1 - alpha) * (1 / (k + rank + 1))

    # 按融合分数排序
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [fetch_document(doc_id) for doc_id, _ in ranked[:top_k]]
```

---

## 5. 检索与重排

### 相似度度量

```
+------------------+-------------------+----------------------------+----------+
| 度量             | 公式              | 属性                       | 适用场景 |
+------------------+-------------------+----------------------------+----------+
| Cosine           | A.B / (|A|*|B|)   | 幅度不变，                 | 默认     |
| Similarity       |                   | 范围 [-1, 1]               | 选择     |
+------------------+-------------------+----------------------------+----------+
| Dot Product      | A.B               | 幅度敏感，                 | 已归一化 |
|                  |                   | 无界                       | 的向量   |
+------------------+-------------------+----------------------------+----------+
| Euclidean (L2)   | sqrt(sum((a-b)^2))| 距离（越小越近），          | 当幅度   |
|                  |                   | 无界                       | 很重要时 |
+------------------+-------------------+----------------------------+----------+
```

大多数 embedding 模型使用 cosine similarity 进行训练。除非模型文档另有说明，否则使用 cosine。

### 使用 Cross-Encoder 模型进行重排

Bi-encoder（embedding 模型）速度快但不够精确。Cross-encoder 速度慢但准确度很高。使用两阶段 pipeline：

```
阶段 1: Bi-Encoder（快速，检索 top-100）

  Query  ---> [Encoder] ---> query_vec  ---|
                                           |--> cosine similarity
  Doc_i  ---> [Encoder] ---> doc_vec_i ----|

  速度: ~1ms/百万文档（使用索引）
  质量: 良好但不够优秀

阶段 2: Cross-Encoder（慢速，将 top-100 重排为 top-10）

  (Query, Doc_i) ---> [Cross-Encoder] ---> relevance_score_i

  速度: ~50ms/（查询, 文档）对
  质量: 优秀（同时看到查询+文档）

Pipeline:
  Bi-Encoder: 1000 万文档 -> Top 100
  Cross-Encoder: Top 100 -> Top 10（重排后）
  总增加延迟: ~100 * 50ms / batch = ~200ms（GPU 批处理）
```

**流行的 reranker 模型：**
- Cohere Rerank v3（API，最佳质量）
- BGE-Reranker-v2-m3（开源，多语言）
- cross-encoder/ms-marco-MiniLM-L-12-v2（轻量级，快速）

```python
def retrieve_and_rerank(query: str, top_k: int = 5) -> list[Chunk]:
    # 阶段 1: 快速检索
    query_embedding = embed_model.encode(query)
    candidates = vector_db.search(query_embedding, top_k=100)

    # 阶段 2: 精确重排
    pairs = [(query, chunk.text) for chunk in candidates]
    rerank_scores = cross_encoder.predict(pairs)

    # 合并并排序
    scored_chunks = list(zip(candidates, rerank_scores))
    scored_chunks.sort(key=lambda x: x[1], reverse=True)

    return [chunk for chunk, score in scored_chunks[:top_k]]
```

### 查询转换技术

#### HyDE（Hypothetical Document Embeddings）

不是直接对查询做 embedding，而是让 LLM 生成一个假设性答案，然后对该答案做 embedding 来寻找相似的真实文档。

```
用户查询: "What causes aurora borealis?"

步骤 1: LLM 生成假设性答案:
  "The aurora borealis is caused by charged particles from the sun
   interacting with Earth's magnetosphere. Solar wind carries electrons
   and protons that collide with atmospheric gases..."

步骤 2: 对假设性答案做 embedding（而非原始查询）

步骤 3: 用假设性 embedding 搜索 Vector DB
  -> 找到关于太阳风、磁层、大气科学的文档

原理: 假设性答案与存储的文档使用相同的"语言"，
比问句形式能产生更好的语义匹配。
```

```python
def hyde_retrieval(query: str, top_k: int = 5) -> list[Chunk]:
    # 生成假设性文档
    hypothesis = llm.generate(
        f"Write a detailed passage that would answer: {query}"
    )

    # 对假设性文档做 embedding
    hypo_embedding = embed_model.encode(hypothesis)

    # 用假设性 embedding 搜索
    return vector_db.search(hypo_embedding, top_k=top_k)
```

#### Multi-Query 检索

生成原始查询的多个改写版本以提高召回率。

```
原始: "How to optimize database queries?"

生成的变体:
  1. "Database query performance tuning techniques"
  2. "SQL optimization best practices"
  3. "How to make slow database queries faster"
  4. "Index strategies for query optimization"

对每个变体检索 top-K，然后去重并合并结果。
```

#### Step-Back Prompting

对于具体问题，先问一个更宽泛的问题来检索更广的上下文。

```
原始: "What was the GDP of France in Q3 2024?"

回退: "What are the economic indicators of France in 2024?"

检索到更广泛的经济背景，其中可能包含具体答案。
```

### 检索 Pipeline（ASCII 图）

```
+-------+
| Query |
+---+---+
    |
    v
+---+----------------+
| Query Router       |  判断: 简单 vs 复杂 vs 多跳
+---+---+---+--------+
    |   |   |
    v   |   v
+-------+  +------------------+  +------------------+
| Direct|  | Query Rewriter   |  | HyDE Generator   |
| Embed |  | (multi-query)    |  | (hypothetical)   |
+---+---+  +--------+---------+  +--------+---------+
    |               |                      |
    v               v                      v
+---+---------------+----------------------+---+
|              Embedding Model                 |
+---+---------+----------+---------+-----------+
    |         |          |         |
    v         v          v         v
+---+---------+----------+---------+-----------+
|          Vector Database Search               |
|  (ANN search with metadata filters)          |
+---+------------------------------------------+
    |
    v
+---+------------------------------------------+
|          BM25 Keyword Search                  |
|  (sparse retrieval for exact matches)        |
+---+------------------------------------------+
    |
    v
+---+------------------------------------------+
|          Reciprocal Rank Fusion (RRF)        |
|  (merge dense + sparse results)              |
+---+------------------------------------------+
    |
    v (Top 50-100 候选)
+---+------------------------------------------+
|          Cross-Encoder Reranker              |
|  (精确的相关性评分)                           |
+---+------------------------------------------+
    |
    v (Top 5-10 结果)
+---+------------------------------------------+
|          后处理                                |
|  - 去重                                       |
|  - 多样性过滤（避免冗余）                     |
|  - 元数据过滤（日期、访问级别）               |
+---+------------------------------------------+
    |
    v
  [检索到的 Chunks 准备进行上下文组装]
```

---

## 6. 上下文组装与 Prompt 工程

### 上下文窗口管理

现代 LLM 具有不同的上下文窗口。你必须将以下内容放入限制内：system prompt + 检索到的 chunks + 对话历史 + 用户查询。

```
模型上下文预算:
+-------------------+----------+--------------------------------------+
| 模型              | 上下文   | 实际预算                             |
+-------------------+----------+--------------------------------------+
| GPT-4o            | 128K     | System: 2K, Context: 80K,           |
|                   |          | History: 20K, Query: 1K, Output: 16K|
+-------------------+----------+--------------------------------------+
| Claude 3.5 Sonnet | 200K     | System: 2K, Context: 120K,          |
|                   |          | History: 40K, Query: 1K, Output: 8K |
+-------------------+----------+--------------------------------------+
| Llama 3.1 70B     | 128K     | System: 2K, Context: 60K,           |
|                   |          | History: 20K, Query: 1K, Output: 4K |
+-------------------+----------+--------------------------------------+
| Mistral Large     | 128K     | System: 2K, Context: 60K,           |
|                   |          | History: 20K, Query: 1K, Output: 4K |
+-------------------+----------+--------------------------------------+

注意: 使用完整上下文窗口会降低质量。为获得最佳效果，保持在 60-70% 以下。
```

### Prompt 模板设计

```python
SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on
the provided context. Follow these rules strictly:

1. ONLY use information from the provided context to answer
2. If the context does not contain enough information, say "I don't have enough
   information to answer that question based on the available documents."
3. Cite your sources using [Source: document_title, page X] format
4. Be concise but thorough
5. If information from multiple sources conflicts, acknowledge the discrepancy"""

def build_prompt(query: str, chunks: list[Chunk], history: list[Message]) -> str:
    # 格式化检索到的上下文
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[Document {i+1}: {chunk.metadata['title']}]\n{chunk.text}\n"
        )
    context_str = "\n---\n".join(context_parts)

    # 格式化对话历史
    history_str = ""
    for msg in history[-10:]:  # 最近 10 轮
        history_str += f"{msg.role}: {msg.content}\n"

    # 组装最终 prompt
    return f"""{SYSTEM_PROMPT}

## Retrieved Context
{context_str}

## Conversation History
{history_str}

## Current Question
{query}

Please answer based on the context provided above. Cite sources."""
```

### Lost-in-the-Middle 问题

研究表明，LLM 对上下文开头和结尾的信息关注度更高，经常忽略中间部分。缓解策略：

```
朴素排序（差）:
  [Chunk 1 (最相关)]
  [Chunk 2]
  [Chunk 3]          <-- LLM 可能忽略这些
  [Chunk 4]          <-- LLM 可能忽略这些
  [Chunk 5 (最不相关)]

更好: 交错排序
  [Chunk 1 (最相关)]      -- 开头（高注意力）
  [Chunk 3]
  [Chunk 5 (最不相关)]    -- 中间（低注意力，最不相关放这里没关系）
  [Chunk 4]
  [Chunk 2 (第二相关)]    -- 结尾（高注意力）

最好: 减少到更少的、高度相关的 chunks
  [Chunk 1] [Chunk 2] [Chunk 3]  -- 只包含真正相关的 chunks

  更少的 chunks = 更少的中间部分 = 更少的信息丢失
```

### 引用与来源追踪

```python
def generate_with_citations(query: str, chunks: list[Chunk]) -> dict:
    # 在 prompt 中给每个来源编号
    prompt = build_prompt_with_numbered_sources(query, chunks)

    response = llm.generate(prompt)

    # 从回复中提取引用引用
    citations = extract_citations(response.text)  # 例如 [1], [2], [3]

    # 将引用映射到源文档
    source_map = {}
    for citation_num in citations:
        chunk = chunks[citation_num - 1]
        source_map[citation_num] = {
            "document_id": chunk.metadata["document_id"],
            "title": chunk.metadata["title"],
            "page": chunk.metadata.get("page"),
            "text_excerpt": chunk.text[:200],
            "url": chunk.metadata.get("url"),
        }

    return {
        "answer": response.text,
        "citations": source_map,
        "chunks_used": len(chunks),
        "model": response.model,
        "tokens_used": response.usage,
    }
```

---

## 7. LLM Serving 基础设施

### 模型服务选项

```
+------------------+---------+--------+----------+----------+----------------+
| 平台             | 延迟    | 成本   | 隐私     | 定制化   | 最适用于       |
+------------------+---------+--------+----------+----------+----------------+
| OpenAI API       | 低      | 中     | 低       | 低       | 快速启动，     |
| (GPT-4o/4o-mini) |         |        | (数据    |          | 通用场景       |
|                  |         |        |  共享)   |          |                |
+------------------+---------+--------+----------+----------+----------------+
| Anthropic API    | 低      | 中     | 中       | 低       | 复杂推理，     |
| (Claude 3.5/4)   |         |        |          |          | 长上下文       |
+------------------+---------+--------+----------+----------+----------------+
| Google Vertex AI | 低      | 中     | 中       | 中       | GCP 生态，     |
| (Gemini 2)       |         |        |          |          | 多模态         |
+------------------+---------+--------+----------+----------+----------------+
| vLLM             | 中      | 低     | 完全     | 完全     | 自托管         |
| (自托管)         |         | (GPU$) |          |          | 生产环境       |
+------------------+---------+--------+----------+----------+----------------+
| TGI (HuggingFace)| 中      | 低     | 完全     | 完全     | HF 模型，      |
| (自托管)         |         | (GPU$) |          |          | 易于搭建       |
+------------------+---------+--------+----------+----------+----------------+
| TensorRT-LLM    | 最低    | 低     | 完全     | 完全     | 最大吞吐量     |
| (NVIDIA)         |         | (GPU$) |          |          | NVIDIA GPU     |
+------------------+---------+--------+----------+----------+----------------+
| Ollama           | 中      | 免费   | 完全     | 有限     | 本地开发，     |
| (本地)           |         |        |          |          | 原型验证       |
+------------------+---------+--------+----------+----------+----------------+
| Together.ai /    | 低      | 低-    | 中       | 中       | 无需管理 GPU   |
| Fireworks /      |         | 中     |          |          | 的开源模型     |
| Groq             |         |        |          |          | API            |
+------------------+---------+--------+----------+----------+----------------+
```

### Inference 优化技术

#### KV Cache

在自回归生成过程中，每个新 token 需要对所有之前的 token 做 attention。KV cache 存储 Key 和 Value 矩阵，这样它们不需要为每个新 token 重新计算。

```
无 KV Cache（朴素方式）:
  Token 1: 计算 [token1] 的 K,V               -> 输出 token2
  Token 2: 计算 [token1, token2] 的 K,V        -> 输出 token3
  Token 3: 计算 [token1, token2, token3] 的 K,V -> 输出 token4
  ... (序列长度的二次方复杂度!)

有 KV Cache:
  Token 1: 计算 K1,V1，缓存                    -> 输出 token2
  Token 2: 计算 K2,V2，缓存，对 K1V1+K2V2 做 attention  -> 输出 token3
  Token 3: 计算 K3,V3，缓存，对所有缓存做 attention      -> 输出 token4
  ... (序列长度的线性复杂度!)

内存成本: ~2 * num_layers * hidden_dim * seq_len * 2 bytes (FP16)
  对于 Llama 70B, 4K 上下文: ~2 * 80 * 8192 * 4096 * 2 = ~10 GB/请求
```

#### Continuous Batching

传统 batching 等待批次中所有请求完成。Continuous batching 在请求完成时动态添加/移除请求。

```
传统 Batching:
  Req A: [============]            (12 tokens)
  Req B: [=====================]   (21 tokens)
  Req C: [========]                (8 tokens)

  Req C 在 token 8 时完��，但 GPU 等待 Req B（21 tokens）
  GPU 利用率: ~65%

Continuous Batching:
  Req A: [============]
  Req B: [=====================]
  Req C: [========]
  Req D:           [===========]    (C 完成时开始)
  Req E:             [=========]    (A 完成时开始)

  GPU 利用率: ~95%
```

#### Speculative Decoding

使用小型"草稿"模型快速生成多个候选 token，然后用大模型并行验证。

```
Draft Model (1B 参数, 快速):
  生成: "The capital of France is Paris, which is"
        token1 token2 token3 token4 token5 token6 token7

Large Model (70B 参数, 慢但准确):
  在一次前向传播中验证所有 7 个 tokens
  接受: "The capital of France is Paris"（接受 5 个 tokens）
  拒绝: ", which is"（在 token 6 处分歧）

  结果: 约 1 次大模型前向传播生成 5 个 tokens
  加速: 对于匹配良好的 draft/target 对约 3-4 倍
```

#### Quantization

降低模型精度以节省内存并提高速度。

```
+----------+--------+-----------+----------+----------------------------+
| 方法     | 位数   | 模型大小  | 质量     | 备注                       |
|          |        | 缩减      | 损失     |                            |
+----------+--------+-----------+----------+----------------------------+
| FP16     | 16-bit | vs FP32 2x| 无      | inference 标准             |
| INT8     | 8-bit  | vs FP16 2x| 极小    | 良好平衡                   |
| INT4     | 4-bit  | vs FP16 4x| 小      | serving 最流行             |
| GPTQ     | 4-bit  | vs FP16 4x| 小      | 一次性，适合 GPU           |
| AWQ      | 4-bit  | vs FP16 4x| 最小    | 感知激活，更优             |
| GGUF     | 2-6bit | 不等      | 不等    | CPU 友好（llama.cpp）      |
+----------+--------+-----------+----------+----------------------------+

Llama 70B 内存需求:
  FP16:  ~140 GB (2x A100 80GB)
  INT8:  ~70 GB  (1x A100 80GB)
  INT4:  ~35 GB  (1x A100 40GB 或 1x A6000)
```

#### Flash Attention

优化的 attention 机制，通过分块计算并避免实例化完整 attention 矩阵，将内存从 O(n^2) 降低到 O(n)。

```
Standard Attention:
  计算 S = Q * K^T  (n x n 矩阵, 存储在 HBM 中)  -- O(n^2) 内存
  计算 P = softmax(S)
  计算 O = P * V

Flash Attention:
  分块处理 Q, K, V
  不实例化完整 n x n 矩阵
  在 SRAM 中保持 softmax 的运行统计
  结果: 相同输出, O(n) 内存, 快 2-4 倍
```

### Streaming 响应（Server-Sent Events）

```python
# 服务端 (FastAPI)
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

async def stream_rag_response(query: str):
    # 检索上下文（非 streaming）
    chunks = await retrieve_and_rerank(query)
    prompt = build_prompt(query, chunks)

    # 逐 token 流式传输 LLM 响应
    async for token in llm.stream(prompt):
        yield f"data: {json.dumps({'token': token})}\n\n"

    # 在末尾发送引用
    citations = build_citations(chunks)
    yield f"data: {json.dumps({'citations': citations})}\n\n"
    yield "data: [DONE]\n\n"

@app.get("/api/chat")
async def chat(query: str):
    return StreamingResponse(
        stream_rag_response(query),
        media_type="text/event-stream"
    )
```

```javascript
// 客户端 (JavaScript)
const eventSource = new EventSource(`/api/chat?query=${encodeURIComponent(query)}`);

eventSource.onmessage = (event) => {
  if (event.data === "[DONE]") {
    eventSource.close();
    return;
  }
  const data = JSON.parse(event.data);
  if (data.token) {
    appendToResponse(data.token);
  }
  if (data.citations) {
    renderCitations(data.citations);
  }
};
```

### GPU 资源配置与自动伸缩

```
为 10 QPS 配置 Llama 70B (INT4):

单块 A100 80GB 吞吐量:
  - 每请求约 30 tokens/秒
  - 使用 continuous batching: 约 8 个并发请求
  - 平均响应: 500 tokens -> 约 17 秒
  - 有效吞吐量: 约 8/17 = 约 0.47 QPS/GPU

10 QPS 峰值需求:
  - 需要: 10 / 0.47 = 约 22 GPU
  - 带余量（目标利用率 80%）: 约 28 GPU
  - 成本: 28 * $2/小时 = $56/小时 = 约 $40,320/月

自动伸缩策略:
  扩容触发:   p95 延迟 > 3s 或 GPU 利用率 > 80%
  缩容触发:   GPU 利用率 < 30% 持续 10 分钟
  最小副本数:  4（保障可用性）
  最大副本数:  40（成本上限）
  扩容增量:    每次 4 GPU

使用 GPT-4o-mini API 的替代方案:
  10 QPS * 2000 tokens * $0.00015/1K = $0.003/秒 = 约 $7,776/月
  （运维更简单，但控制力更少）
```

---

## 8. 数据模型

### 关系型 Schema (PostgreSQL)

```sql
-- documents 表: 存储原始文档元数据
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    source_url      TEXT,
    file_type       VARCHAR(20) NOT NULL,  -- 'pdf', 'html', 'markdown', 'docx'
    file_size_bytes BIGINT,
    page_count      INTEGER,
    word_count      INTEGER,
    author          TEXT,
    category        TEXT,
    department      TEXT,
    access_level    VARCHAR(20) DEFAULT 'public',
    ingestion_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    ingested_at     TIMESTAMPTZ
);

CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_status ON documents(ingestion_status);
CREATE INDEX idx_documents_created ON documents(created_at);

-- chunks 表: 存储带有 embedding 的文档 chunks（使用 pgvector）
CREATE TABLE chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    token_count     INTEGER NOT NULL,
    embedding       vector(1536),  -- pgvector 列

    -- 用于过滤的元数据
    section_header  TEXT,
    page_number     INTEGER,
    has_code        BOOLEAN DEFAULT FALSE,
    has_table       BOOLEAN DEFAULT FALSE,

    -- 父子 chunking 支持
    parent_chunk_id UUID REFERENCES chunks(id),
    chunk_level     VARCHAR(10) DEFAULT 'leaf',  -- 'parent', 'leaf'

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 向量搜索的 HNSW 索引
CREATE INDEX idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_parent ON chunks(parent_chunk_id);

-- conversations 表: 多轮对话会话
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    title           TEXT,
    model_id        VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);

-- messages 表: 对话中的单条消息
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system'
    content         TEXT NOT NULL,

    -- RAG 元数据
    chunks_retrieved UUID[],           -- 使用的 chunk ID 数组
    retrieval_scores FLOAT[],          -- 相似度分数
    model_id        VARCHAR(100),
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    latency_ms      INTEGER,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- feedback 表: 用户对答案质量的评分
CREATE TABLE feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    rating          SMALLINT CHECK (rating IN (-1, 1)),  -- 点踩/点赞
    feedback_text   TEXT,
    feedback_type   VARCHAR(50),  -- 'hallucination', 'irrelevant', 'helpful', 'wrong_source'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_message ON feedback(message_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
```

### Vector DB Schema（用于专用向量数据库如 Qdrant）

```json
{
  "collection_name": "document_chunks",
  "vectors": {
    "size": 1536,
    "distance": "Cosine"
  },
  "payload_schema": {
    "document_id": "keyword",
    "title": "text",
    "text": "text",
    "chunk_index": "integer",
    "section_header": "text",
    "category": "keyword",
    "department": "keyword",
    "access_level": "keyword",
    "created_at": "datetime",
    "has_code": "bool",
    "page_number": "integer",
    "parent_chunk_id": "keyword"
  },
  "optimizers_config": {
    "indexing_threshold": 20000
  },
  "hnsw_config": {
    "m": 16,
    "ef_construct": 200,
    "full_scan_threshold": 10000
  }
}
```

---

## 9. 高层架构

### 完整系统架构

```
                              CLIENTS
                    +----------+  +----------+
                    | Web App  |  | API      |
                    | (React)  |  | Clients  |
                    +-----+----+  +----+-----+
                          |            |
                          v            v
                    +-----+------------+-----+
                    |    API Gateway          |
                    |  (Auth, Rate Limit,     |
                    |   Load Balance)         |
                    +----------+-------------+
                               |
               +---------------+---------------+
               |                               |
               v                               v
    +----------+----------+         +----------+----------+
    |   Chat/Query API    |         | Document Upload API |
    |   (Sync, Streaming) |         | (Async)             |
    +----------+----------+         +----------+----------+
               |                               |
               v                               v
    +----------+----------+         +----------+----------+
    |   Orchestrator      |         |   Message Queue     |
    |   Service           |         |   (Kafka / SQS)     |
    +--+-----+-----+-----+         +----------+----------+
       |     |     |                           |
       |     |     |                           v
       |     |     |                +----------+----------+
       |     |     |                | Ingestion Workers   |
       |     |     |                | (Auto-scaled)       |
       |     |     |                +--+-------+-------+--+
       |     |     |                   |       |       |
       v     |     v                   v       |       v
  +----+--+  |  +--+------+     +-----+-+     |  +---+--------+
  |Embed  |  |  |Reranker |     |Parser  |     |  |Embedding   |
  |Service|  |  |Service  |     |Service |     |  |Batch Svc   |
  +---+---+  |  +--+------+     +--------+     |  +---+--------+
      |      |     |                            |      |
      v      |     |                            |      v
  +---+------+-----+---+              +--------+------+--------+
  |    Vector Database  |              |    Vector Database     |
  |    (Qdrant/Pinecone)|              |    (write path)        |
  +---------------------+              +-----------+-----------+
      |      |                                     |
      |      v                                     |
      |  +---+------------------+                  |
      |  |  LLM Gateway         |                  |
      |  |  (Router + Fallback) |                  |
      |  +--+-----------+------+                   |
      |     |           |                          |
      |     v           v                          |
      |  +--+---+  +---+-------+                   |
      |  |OpenAI|  |Self-hosted|                   |
      |  |API   |  |vLLM (GPU) |                   |
      |  +------+  +-----------+                   |
      |                                            |
      v                                            v
  +---+--------------------------------------------+---+
  |              PostgreSQL                            |
  |  (documents, conversations, messages, feedback)    |
  +---+------------------------------------------------+
      |
      v
  +---+--------------------------------------------+
  |         Monitoring & Evaluation                |
  |  (Prometheus, Grafana, RAGAS, LangSmith)       |
  +------------------------------------------------+
```

### Orchestrator 服务（核心逻辑）

```python
class RAGOrchestrator:
    def __init__(self, config: RAGConfig):
        self.embed_service = EmbeddingService(config.embed_model)
        self.vector_db = VectorDBClient(config.vector_db_url)
        self.reranker = RerankerService(config.reranker_model)
        self.llm_gateway = LLMGateway(config.llm_config)
        self.cache = SemanticCache(config.cache_config)

    async def query(self, request: QueryRequest) -> QueryResponse:
        # 步骤 0: 检查语义缓存
        cached = await self.cache.get(request.query)
        if cached:
            return cached

        # 步骤 1: 查询转换（可选）
        queries = await self.transform_query(request.query)

        # 步骤 2: 对查询做 embedding
        query_embeddings = await self.embed_service.encode_batch(queries)

        # 步骤 3: 向量搜索（multi-query 时并行）
        all_candidates = []
        for embedding in query_embeddings:
            candidates = await self.vector_db.search(
                embedding=embedding,
                top_k=50,
                filters=request.filters
            )
            all_candidates.extend(candidates)

        # 步骤 4: 去重
        unique_candidates = deduplicate_by_id(all_candidates)

        # 步骤 5: 重排
        reranked = await self.reranker.rerank(
            query=request.query,
            documents=unique_candidates,
            top_k=request.context_chunks or 5
        )

        # 步骤 6: 处理父子关系（如果使用叶子 chunks 则获取父 chunk）
        context_chunks = await self.resolve_parent_chunks(reranked)

        # 步骤 7: 构建 prompt
        prompt = build_prompt(
            query=request.query,
            chunks=context_chunks,
            history=request.conversation_history,
            system_prompt=request.system_prompt
        )

        # 步骤 8: 生成响应（streaming）
        response = await self.llm_gateway.generate(
            prompt=prompt,
            model=request.model_id,
            stream=request.stream,
            max_tokens=request.max_tokens
        )

        # 步骤 9: 构建带引用的响应
        result = QueryResponse(
            answer=response.text,
            citations=build_citations(context_chunks),
            model=response.model,
            usage=response.usage,
            retrieval_scores=[c.score for c in reranked]
        )

        # 步骤 10: 缓存结果
        await self.cache.set(request.query, result)

        return result
```

### 带 Fallback 的 LLM Gateway

```python
class LLMGateway:
    """将请求路由到适当的 LLM 提供商并支持 fallback。"""

    def __init__(self, config: LLMConfig):
        self.providers = {
            "openai": OpenAIProvider(config.openai_key),
            "anthropic": AnthropicProvider(config.anthropic_key),
            "self_hosted": VLLMProvider(config.vllm_endpoint),
        }
        self.routing_strategy = config.routing_strategy
        self.fallback_order = config.fallback_order

    async def generate(self, prompt: str, model: str, **kwargs) -> LLMResponse:
        provider = self.resolve_provider(model)

        for attempt_provider in self.get_fallback_chain(provider):
            try:
                response = await attempt_provider.generate(
                    prompt=prompt,
                    model=model,
                    timeout=30,
                    **kwargs
                )
                return response
            except RateLimitError:
                # 尝试下一个提供商
                continue
            except TimeoutError:
                # 尝试下一个提供商
                continue
            except Exception as e:
                log_error(f"LLM provider error: {e}")
                continue

        raise AllProvidersFailedError("All LLM providers exhausted")

    def resolve_provider(self, model: str) -> str:
        """基于模型名称或智能路由进行路由。"""
        if model.startswith("gpt"):
            return "openai"
        elif model.startswith("claude"):
            return "anthropic"
        elif self.routing_strategy == "cost_optimized":
            return "self_hosted"  # 最便宜优先
        elif self.routing_strategy == "latency_optimized":
            return self.lowest_latency_provider()
        return self.fallback_order[0]
```

---

## 10. 评估与监控

### RAG 评估指标

#### 检索指标

```
+-------------------+-----------------------------------------------------+
| 指标              | 描述                                                |
+-------------------+-----------------------------------------------------+
| Recall@K          | top-K 结果中找到的相关文档百分比                    |
|                   | 越高 = 找到更多相关内容                             |
+-------------------+-----------------------------------------------------+
| MRR (Mean         | 第一个相关结果的 1/排名 的平均值                    |
| Reciprocal Rank)  | 越高 = 相关文档出现越早                             |
+-------------------+-----------------------------------------------------+
| NDCG (Normalized  | 考虑位置因素衡量排名质量                            |
| Discounted        | 越高 = 相关结果排序越好                             |
| Cumulative Gain)  |                                                     |
+-------------------+-----------------------------------------------------+
| Hit Rate          | 至少找到一个相关文档的查询百分比                    |
|                   | 基础但有用的健全性检查                              |
+-------------------+-----------------------------------------------------+
```

```python
def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """在 top-K 中找到了多少比例的相关文档？"""
    retrieved_set = set(retrieved_ids[:k])
    return len(retrieved_set & relevant_ids) / len(relevant_ids)

def mrr(retrieved_ids: list[str], relevant_ids: set[str]) -> float:
    """Mean Reciprocal Rank: 第一个相关结果位置的倒数。"""
    for rank, doc_id in enumerate(retrieved_ids, start=1):
        if doc_id in relevant_ids:
            return 1.0 / rank
    return 0.0
```

#### 生成指标

```
+-------------------+-----------------------------------------------------+
| 指标              | 描述                                                |
+-------------------+-----------------------------------------------------+
| Faithfulness      | 答案是否有检索到的上下文支持？                      |
|                   | （衡量幻觉率）                                      |
+-------------------+-----------------------------------------------------+
| Answer Relevance  | 答案是否真正回答了问题？                            |
+-------------------+-----------------------------------------------------+
| Context Relevance | 检索到的 chunks 是否与问题相关？                    |
+-------------------+-----------------------------------------------------+
| Context Precision | 检索到的 chunks 中有多少百分比被实际使用了？        |
+-------------------+-----------------------------------------------------+
| Answer            | 答案相对于标准答案的完整度如何？                    |
| Correctness       |                                                     |
+-------------------+-----------------------------------------------------+
```

### RAGAS 框架

RAGAS（Retrieval Augmented Generation Assessment）是 RAG 系统的标准评估框架。它使用 LLM 来评估 LLM 的输出。

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)

# 准备评估数据集
eval_data = {
    "question": ["What is machine learning?", "How does TCP work?"],
    "answer": [generated_answer_1, generated_answer_2],
    "contexts": [retrieved_chunks_1, retrieved_chunks_2],
    "ground_truth": [expected_answer_1, expected_answer_2],
}

# 运行评估
results = evaluate(
    dataset=eval_data,
    metrics=[
        faithfulness,        # 答案是否基于上下文？
        answer_relevancy,    # 答案是否回答了问题？
        context_precision,   # 检索到的 chunks 是否相关？
        context_recall,      # 检索到的 chunks 是否覆盖了答案？
    ],
)

# 结果:
# faithfulness:      0.92  (92% 的论断有上下文支持)
# answer_relevancy:  0.88  (88% 与问题相关)
# context_precision: 0.75  (75% 的 chunks 实际有用)
# context_recall:    0.85  (85% 所需信息被检索到)
```

### 在线监控仪表盘

```
+------------------------------------------------------------------+
|                    RAG 系统仪表盘                                  |
+------------------------------------------------------------------+
|                                                                  |
|  延迟 (p50/p95/p99)              吞吐量                           |
|  +---------------------------+ +---------------------------+     |
|  | p50: 1.2s  p95: 2.8s     | | 查询/分钟: 72             |     |
|  | p99: 4.1s                 | | Embeddings/分钟: 72       |     |
|  |  检索: 180ms (平均)       | | Tokens/分钟: 144K         |     |
|  |  重排: 200ms (平均)       | |                           |     |
|  |  LLM 生成: 850ms (平均)  | |                           |     |
|  +---------------------------+ +---------------------------+     |
|                                                                  |
|  Token 使用量                   错误率                            |
|  +---------------------------+ +---------------------------+     |
|  | 输入:  1.2M tokens/小时   | | LLM 错误: 0.3%           |     |
|  | 输出:  350K tokens/小时   | | Vector DB 错误: 0.01%    |     |
|  | 成本:  $1.82/小时         | | 超时率: 0.5%             |     |
|  | 缓存:  23% 命中率         | | 空检索: 2.1%             |     |
|  +---------------------------+ +---------------------------+     |
|                                                                  |
|  用户反馈                       检索质量                          |
|  +---------------------------+ +---------------------------+     |
|  | 点赞:    78%              | | 平均检索 chunks: 5.2     |     |
|  | 点踩:    12%              | | 平均重排分数: 0.73       |     |
|  | 无反馈:  10%              | | 空结果率: 2.1%           |     |
|  | 重新生成率: 8%            | | 平均相关性: 0.81         |     |
|  +---------------------------+ +---------------------------+     |
+------------------------------------------------------------------+
```

### 告警配置

```yaml
# alerting-rules.yaml
alerts:
  - name: high_latency
    condition: p95_latency > 3000ms
    for: 5m
    severity: warning

  - name: critical_latency
    condition: p99_latency > 8000ms
    for: 2m
    severity: critical

  - name: high_hallucination_rate
    condition: faithfulness_score < 0.85
    for: 15m
    severity: warning

  - name: low_retrieval_quality
    condition: avg_rerank_score < 0.5
    for: 10m
    severity: warning

  - name: high_empty_retrieval
    condition: empty_retrieval_rate > 5%
    for: 5m
    severity: critical

  - name: cost_spike
    condition: hourly_token_cost > 2x_rolling_average
    for: 30m
    severity: warning

  - name: gpu_saturation
    condition: gpu_utilization > 90%
    for: 5m
    severity: warning
```

---

## 11. 扩展

### Vector DB 分片与副本

```
1 亿 chunks 的分片策略:

方案 1: 基于哈希的分片（均匀分布）
  分片键: hash(document_id) % num_shards

  +----------+  +----------+  +----------+  +----------+
  | Shard 0  |  | Shard 1  |  | Shard 2  |  | Shard 3  |
  | 2500万   |  | 2500万   |  | 2500万   |  | 2500万   |
  | 向量     |  | 向量     |  | 向量     |  | 向量     |
  +----------+  +----------+  +----------+  +----------+
  查询扇出到所有分片，结果合并

方案 2: 基于类别的分片（查询路由）
  分片键: document.category

  +----------+  +----------+  +----------+  +----------+
  |工程       |  |  法务    |  |  销售    |  |  其他    |
  | 3000万   |  | 2000万   |  | 2500万   |  | 2500万   |
  | 向量     |  | 向量     |  | 向量     |  | 向量     |
  +----------+  +----------+  +----------+  +----------+
  查询仅路由到相关分片 -- 更快!

副本（保障可用性）:
  每个分片有 2-3 个副本
  写入到主副本，读取在副本间负载均衡

  Primary  --->  Replica 1
           --->  Replica 2
```

### Embedding 批处理

```
实时（单文档）:
  上传 -> 解析 -> Chunking -> Embedding -> 存储
  延迟: 每文档约 10-30 秒

批处理 pipeline（批量摄入）:
  +--------+    +--------+    +--------+    +--------+
  | S3     |--->| Spark/ |--->| Embed  |--->| Bulk   |
  | Bucket |    | Flink  |    | Service|    | Insert |
  +--------+    +--------+    +--------+    +--------+
                  |              |
                  | 并行         | GPU 批处理
                  | 处理         | (256 docs/batch)
                  |              |
  吞吐量: 使用 4 GPU 约 10K 文档/分钟

  批量 embedding 优化:
    - 按长度排序 chunks（最小化 padding）
    - 批大小 256-512 以提高 GPU 效率
    - 使用多个 embedding 模型副本
```

### LLM Inference 自动伸缩

```
                    自动伸缩架构

  +----------------------------------------------------+
  |                 Load Balancer                       |
  +----+-----+-----+-----+-----+-----+-----+-----+---+
       |     |     |     |     |     |     |     |
       v     v     v     v     v     v     v     v
  +------+ +------+ +------+ +------+ +------+ +------+
  |vLLM  | |vLLM  | |vLLM  | |vLLM  | |vLLM  | |vLLM  |
  |Pod 1 | |Pod 2 | |Pod 3 | |Pod 4 | |Pod 5 | |Pod 6 |
  |A100  | |A100  | |A100  | |A100  | |A100  | |A100  |
  +------+ +------+ +------+ +------+ +------+ +------+
  [--- 最少: 4 pods --------]  [--- 扩容的 pods ------]

  Kubernetes HPA (Horizontal Pod Autoscaler):
    metric: custom/gpu_utilization
    target: 70%
    minReplicas: 4
    maxReplicas: 20
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4          # 每次增加 4 个 pod
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # 缩容前等待 5 分钟
      policies:
        - type: Pods
          value: 2
          periodSeconds: 120
```

### 语义缓存

缓存语义相似查询的响应，避免冗余的 LLM 调用。

```
查询: "What is the capital of France?"
  -> 对查询做 embedding -> 检查缓存 (cosine > 0.95 阈值)
  -> 缓存 MISS -> 检索 -> 生成 -> 缓存结果

查询: "What's France's capital city?"
  -> 对查询做 embedding -> 检查缓存
  -> 缓存 HIT (与缓存查询的 cosine similarity = 0.97)
  -> 立即返回缓存的响应

实现:
  +----------+     +--------------+     +--------+
  | Query    |---->| Semantic     |---->| Cache  |
  | Embedding|     | Similarity   |     | Hit?   |
  +----------+     | (cosine>0.95)|     +---+----+
                   +--------------+         |
                                      Yes   |   No
                                      +-----+-----+
                                      v           v
                                  返回          完整 RAG
                                  缓存的        Pipeline
                                  响应          (然后缓存)
```

```python
class SemanticCache:
    def __init__(self, threshold: float = 0.95, ttl_hours: int = 24):
        self.threshold = threshold
        self.ttl = timedelta(hours=ttl_hours)
        self.cache_db = VectorDBClient("cache_collection")

    async def get(self, query: str) -> QueryResponse | None:
        query_embedding = await embed(query)
        results = await self.cache_db.search(
            embedding=query_embedding,
            top_k=1,
            score_threshold=self.threshold
        )
        if results and results[0].score >= self.threshold:
            cached = results[0]
            if datetime.now() - cached.created_at < self.ttl:
                return QueryResponse.from_cache(cached)
        return None

    async def set(self, query: str, response: QueryResponse) -> None:
        query_embedding = await embed(query)
        await self.cache_db.upsert(
            id=generate_uuid(),
            embedding=query_embedding,
            payload={
                "query": query,
                "response": response.to_dict(),
                "created_at": datetime.now().isoformat(),
            }
        )
```

### 多租户隔离

```
租户隔离策略:

1. 每租户独立 collection（强隔离）:
   +------------------+  +------------------+  +------------------+
   | 租户 A           |  | 租户 B           |  | 租户 C           |
   | Collection       |  | Collection       |  | Collection       |
   | (独立索引)       |  | (独立索引)       |  | (独立索引)       |
   +------------------+  +------------------+  +------------------+
   优点: 完全隔离、按租户伸缩、易于删除
   缺点: 资源消耗更多、每个租户一个索引

2. 共享 collection + 元数据过滤（成本高效）:
   +-----------------------------------------------------+
   | 共享 Collection                                      |
   | [tenant_id=A, ...] [tenant_id=B, ...] [tenant_id=C]|
   +-----------------------------------------------------+
   所有查询包含: filter={"tenant_id": request.tenant_id}
   优点: 高效、简单
   缺点: 噪声邻居问题、租户数据删除更困难

3. 混合方案（推荐用于生产环境）:
   大租户（>100 万 chunks）: 独立 collection
   小租户（<100 万 chunks）: 共享 collection + 过滤
```

---

## 12. 成本优化

### Token 成本分析

```
每次查询成本分解（GPT-4o）:

组件               | Tokens  | 费率         | 成本
-------------------+---------+--------------+----------
System prompt      | 500     | $2.50/1M in  | $0.00125
检索的上下文       | 2,000   | $2.50/1M in  | $0.00500
对话历史           | 500     | $2.50/1M in  | $0.00125
用户查询           | 50      | $2.50/1M in  | $0.000125
输出               | 500     | $10.00/1M out| $0.00500
-------------------+---------+--------------+----------
每次查询合计       | 3,550   |              | $0.01263

每日（10 万次查询）:                        $1,263
每月:                                       $37,875

改用 GPT-4o-mini:
输入:  3,050 tokens * $0.15/1M  = $0.000458
输出:  500 tokens * $0.60/1M    = $0.000300
每次查询合计:                     $0.000758
每月（10 万/天）:                 $2,273  (便宜 15 倍)

自托管 Llama 70B (INT4, 4x A100):
GPU 成本: $5,760/月（固定）
每次查询: $5,760 / 300 万次查询 = $0.00192
每月:     $5,760（固定，查询量超过约 150 万/月时更便宜）
```

### 成本优化策略

```
策略                        | 节省     | 难度   | 权衡
----------------------------+----------+--------+---------------------------
语义缓存                    | 20-40%   | 低     | 响应可能略微过时
简单问题用小模型            | 30-50%   | 中     | 需要查询分类器
减少上下文 chunks           | 10-20%   | 低     | 可能遗漏信息
缩短 system prompt          | 5-10%    | 低     | 指令遵循度降低
批量 embedding（非高峰期）  | 20-30%   | 低     | 摄入延迟更高
MRL（降低维度）             | 30-50%   | 低     | 召回率略微下降
  用于 embedding 存储        |          |        |
量化自托管模型              | 60-80%   | 高     | 运维复杂度增加
输出 token 限制             | 10-30%   | 低     | 响应可能被截断
```

### 查询路由（成本感知）

```python
class CostAwareRouter:
    """将查询路由到最具成本效益的模型。"""

    MODELS = {
        "simple": {
            "model": "gpt-4o-mini",
            "cost_per_1k_in": 0.00015,
            "cost_per_1k_out": 0.0006,
        },
        "complex": {
            "model": "gpt-4o",
            "cost_per_1k_in": 0.0025,
            "cost_per_1k_out": 0.01,
        },
        "reasoning": {
            "model": "claude-3-5-sonnet",
            "cost_per_1k_in": 0.003,
            "cost_per_1k_out": 0.015,
        },
    }

    async def classify_query(self, query: str) -> str:
        """使用便宜的模型对查询复杂度进行分类。"""
        classification = await cheap_llm.classify(
            query,
            categories=["simple", "complex", "reasoning"]
        )
        return classification

    async def route(self, query: str) -> str:
        complexity = await self.classify_query(query)
        return self.MODELS[complexity]["model"]
```

### Embedding 成本优化

```
批量 vs 实时 Embedding:

实时（按文档）:
  - 立即可用（< 30 秒）
  - API 开销导致成本更高
  - 适用于: 紧急文档、用户上传

批量（每小时/每天）:
  - 可用性延迟（数小时）
  - 便宜 20-30%（批量 API 定价、GPU 利用率）
  - 适用于: 批量摄入、周期性更新

混合方案:
  - 高优先级文档使用实时
  - 批量/低优先级内容使用批处理
  - 更新的文档使用定时重新 embedding
```

---

## 13. 部署架构

### 生产部署 (Kubernetes)

```
                    生产部署架构

  +------------------------------------------------------------------+
  |                        云服务商 (AWS/GCP)                         |
  |                                                                  |
  |   +-------------------+    +----------------------------------+  |
  |   | CloudFront/CDN    |    | Route 53 / Cloud DNS             |  |
  |   +--------+----------+    +---------------+------------------+  |
  |            |                               |                     |
  |            v                               v                     |
  |   +--------+-------------------------------+------------------+  |
  |   |              Application Load Balancer                    |  |
  |   |              (ALB / Cloud Load Balancer)                  |  |
  |   +--------+-------------------------------+------------------+  |
  |            |                               |                     |
  |   +--------+------------------+   +--------+------------------+  |
  |   |  Kubernetes Cluster       |   |  Kubernetes Cluster       |  |
  |   |  (Region: us-east-1)      |   |  (Region: us-west-2)     |  |
  |   |                          |   |                            |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   | |API   | |API   |       |   | |API   | |API   |         |  |
  |   | |Pod x3| |Pod x3|       |   | |Pod x3| |Pod x3|         |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   |                          |   |                            |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   | |Embed | |Rerank|       |   | |Embed | |Rerank|         |  |
  |   | |Svc x2| |Svc x2|       |   | |Svc x2| |Svc x2|        |  |
  |   | +------+ +------+       |   | +------+ +------+         |  |
  |   |                          |   |                            |  |
  |   | +----------------------+ |   | +----------------------+  |  |
  |   | | GPU Node Pool        | |   | | GPU Node Pool        |  |  |
  |   | | vLLM Pods (4x A100)  | |   | | vLLM Pods (4x A100)  | |  |
  |   | +----------------------+ |   | +----------------------+  |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +--------------------------+   +----------------------------+  |
  |   | Qdrant Cluster           |   | PostgreSQL (RDS)           |  |
  |   | (3-node, replicated)     |   | (Multi-AZ, read replicas) |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +--------------------------+   +----------------------------+  |
  |   | Redis Cluster            |   | Kafka / SQS               |  |
  |   | (semantic cache)         |   | (ingestion queue)         |  |
  |   +--------------------------+   +----------------------------+  |
  |                                                                  |
  |   +-----------------------------------------------------------+  |
  |   | 监控: Prometheus + Grafana + PagerDuty                    |  |
  |   | 日志: ELK Stack / CloudWatch                              |  |
  |   | 链路追踪: Jaeger / Datadog APM                            |  |
  |   | RAG 评估: LangSmith / Arize Phoenix                       |  |
  |   +-----------------------------------------------------------+  |
  +------------------------------------------------------------------+
```

### Kubernetes 资源定义

```yaml
# vllm-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-serving
spec:
  replicas: 4
  selector:
    matchLabels:
      app: vllm
  template:
    metadata:
      labels:
        app: vllm
    spec:
      nodeSelector:
        nvidia.com/gpu.product: "A100"
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - "--model=meta-llama/Llama-3.1-70B-Instruct"
            - "--quantization=awq"
            - "--tensor-parallel-size=1"
            - "--max-model-len=8192"
            - "--gpu-memory-utilization=0.9"
          resources:
            limits:
              nvidia.com/gpu: 1
              memory: "96Gi"
              cpu: "16"
            requests:
              nvidia.com/gpu: 1
              memory: "80Gi"
              cpu: "8"
          ports:
            - containerPort: 8000
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 120
            periodSeconds: 10
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vllm-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vllm-serving
  minReplicas: 4
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: gpu_utilization
        target:
          type: AverageValue
          averageValue: "70"
```

### 多区域注意事项

```
Active-Active 多区域:

Region A (us-east-1, 主)             Region B (us-west-2, 备)
+----------------------------+         +----------------------------+
| 完整 RAG 栈               |         | 完整 RAG 栈               |
| API + Embedding + LLM     |         | API + Embedding + LLM     |
+----------------------------+         +----------------------------+
         |                                       |
         v                                       v
+----------------------------+         +----------------------------+
| Vector DB (Primary)       |  <--->  | Vector DB (Replica)       |
| PostgreSQL (Primary)      |  <--->  | PostgreSQL (Read Replica) |
+----------------------------+  异步   +----------------------------+
                                复制

路由: GeoDNS 将用户路由到最近的区域
写入: 始终发往主区域，异步复制
读取: 从最近的区域提供服务
故障转移: 如果 Region A 宕机，Region B 提升为主

延迟优势: 美国西部用户减少 50-100ms
成本: 约为单区域的 1.8 倍（共享 Vector DB 复制）
```

---

## 14. 常见面试追问

### 如何处理幻觉？

**多层方法：**

1. **检索锚定**：仅从检索到的上下文中回答（严格的 prompt 指令）
2. **忠实度检查**：生成后使用 LLM 调用验证论断是否与上下文一致
3. **置信度评分**：让 LLM 评估自身置信度；低置信度触发"我不知道"
4. **引用强制**：要求内联引用；拒绝没有引用的答案
5. **护栏**：使用 NeMo Guardrails 或类似工具过滤幻觉内容

```python
async def check_faithfulness(answer: str, context: list[str]) -> float:
    """使用 LLM 验证答案中的每个论断是否有上下文支持。"""
    claims = await extract_claims(answer)  # 将答案拆分为单个论断

    supported_count = 0
    for claim in claims:
        is_supported = await llm.classify(
            f"Is this claim supported by the context?\n"
            f"Claim: {claim}\n"
            f"Context: {' '.join(context)}\n"
            f"Answer: YES or NO"
        )
        if is_supported == "YES":
            supported_count += 1

    return supported_count / len(claims) if claims else 0.0
```

### 如何实时更新知识库？

```
实时更新 pipeline:

1. 检测到文档变更（webhook、文件监听、API 上传）
2. 变更事件发布到消息队列
3. Worker 消费事件:
   a. 重新解析变更的文档
   b. 差异化 chunking（仅重新分割变更的部分）
   c. 重新对变更的 chunks 做 embedding
   d. 更新到 Vector DB（原子操作: 删除旧的 + 插入新的）
   e. 失效受影响文档的语义缓存条目
4. 在 PostgreSQL 中更新元数据

增量 vs 全量重建索引:
  - 小编辑（错别字修正）: 仅重新 embed 受影响的 chunks
  - 大幅重写: 重新 chunk 和 embed 整个文档
  - Schema 变更: 全量重建索引（后台作业，零停机切换）
```

### 如何处理多模态 RAG（图片 + 文本）？

```
多模态 RAG Pipeline:

带图片的文档:
  [文本段落 1]
  [图片: 架构图]
  [文本段落 2]
  [数据表格]

处理:
  1. 从文档中提取图片（PyMuPDF, pdf2image）
  2. 使用视觉模型生成图片描述（GPT-4V, LLaVA）
  3. 创建文本 chunks: 原始文本 + 图片描述
  4. 将所有内容作为文本做 embedding（统一的 embedding 空间）

  或（高级方案）:
  1. 使用多模态 embedding（CLIP, Nomic Embed Vision）
  2. 将文本和图片 embedding 存储在同一向量空间
  3. 同时检索文本和图片 chunks
  4. 将图片直接传递给多模态 LLM 进行生成

架构变更:
  +--------+    +--------+    +--------+    +--------+
  | 图片   |    | 表格   |    | 文本   |    | 代码   |
  +---+----+    +---+----+    +---+----+    +---+----+
      |             |             |             |
      v             v             v             v
  +---+----+    +---+----+    +---+----+    +---+----+
  | Vision |    | Table  |    | Text   |    | Code   |
  | Model  |    | Parser |    | Parser |    | Parser |
  +---+----+    +---+----+    +---+----+    +---+----+
      |             |             |             |
      v             v             v             v
      +---------+---+----+-------+------+------+
                |  Unified Embedding Space |
                +--------------------------+
```

### 如何实现对话记忆？

```
方案 1: 滑动窗口（简单）
  在 prompt 上下文中保留最近 N 条消息。
  优点: 简单，成本有界
  缺点: 丢失早期上下文

方案 2: 摘要记忆（均衡）
  定期将较旧的消息总结为运行摘要。

  消息: [M1, M2, M3, M4, M5, M6, M7, M8, M9, M10]

  5 条消息后:
  摘要: "用户询问了 ML 基础知识，我们讨论了 supervised learning..."
  活跃:  [M6, M7, M8, M9, M10]

  Prompt: [System] + [摘要] + [M6-M10] + [检索到的上下文] + [查询]

方案 3: 对对话历史做 RAG
  对每条消息做 embedding 并存储在每个会话的向量存储中。
  查询时，与文档 chunks 一起检索相关的历史消息。

实现:
```

```python
class ConversationMemory:
    def __init__(self, max_messages: int = 20, summary_threshold: int = 10):
        self.max_messages = max_messages
        self.summary_threshold = summary_threshold

    async def get_context(self, conversation_id: str) -> str:
        messages = await db.get_messages(conversation_id)

        if len(messages) <= self.max_messages:
            return format_messages(messages)

        # 总结较旧的消息
        older = messages[:-self.summary_threshold]
        recent = messages[-self.summary_threshold:]

        summary = await llm.summarize(
            f"Summarize this conversation so far:\n{format_messages(older)}"
        )

        return f"Previous conversation summary:\n{summary}\n\nRecent messages:\n{format_messages(recent)}"
```

### 如何大规模评估 RAG 质量？

```
自动化评估 Pipeline:

1. 黄金数据集（人工策划）:
   - 500-1000 个问题/答案/上下文三元组
   - 每季度更新
   - 覆盖边缘情况和常见查询

2. 合成评估（LLM 生成）:
   - 使用 LLM 从文档生成问题
   - 从标准答案创建预期答案
   - 自动扩展到 10K+ 测试用例

3. 持续评估:
   - 对 5% 的生产流量运行 RAGAS 指标（影子评估）
   - 随时间跟踪指标以检测回归
   - 指标下降时告警

4. 人机协同:
   - 抽样低置信度响应进行人工审核
   - 使用反馈改进检索和生成
   - 定期审计随机样本

指标仪表盘:
  +------------------------------------------+
  | 每周 RAG 质量报告                         |
  +------------------------------------------+
  | 忠实度:     0.92 (+0.02 vs 上周)         |
  | 相关性:     0.88 (-0.01)                 |
  | 上下文召回: 0.85 (+0.03)                 |
  | 幻觉率:     4.2% (-0.8%)                |
  | 用户满意度: 82% (+2%)                    |
  +------------------------------------------+
```

### 如何处理文档中的信息冲突？

```
策略 1: 时间优先
  - 始终优先选择最近更新的文档
  - 在元数据和 prompt 中包含文档日期

策略 2: 来源权威性
  - 为文档来源分配信任分数
  - 官方文档 > 内部 wiki > 用户生成内容
  - 按来源权威性加权检索分数

策略 3: 显式冲突检测
  - 检索后: 使用 LLM 检测冲突的论断
  - 将双方观点连同来源一起呈现给用户

  示例回复:
  "根据 2024 年的政策文件，限额为 $5,000。
   然而，2023 年的手册指出为 $3,000。较新的
   政策（2024 年）可能取代了早期文件。
   [来源: Policy v3.2, Jan 2024] [来源: Handbook v2.0, Mar 2023]"

策略 4: 检索时去重
  - 检测来自不同文档版本的近重复 chunks
  - 仅保留最新版本
  - 记录冲突供管理员审核
```

---

## 总结：面试清单

在面试中设计 RAG 系统时，确保涵盖以下内容：

```
+---+------------------------------------------------------------------+
| # | 主题                                                             |
+---+------------------------------------------------------------------+
| 1 | 需求: 规模、延迟、准确性、成本约束                               |
+---+------------------------------------------------------------------+
| 2 | 摄入: 解析、chunking 策略（推荐父子级）                          |
+---+------------------------------------------------------------------+
| 3 | Embedding: 模型选择、维度、批量 vs 实时                          |
+---+------------------------------------------------------------------+
| 4 | Vector DB: 选型理由、索引（HNSW）、混合搜索                      |
+---+------------------------------------------------------------------+
| 5 | 检索: multi-query、重排、元数据过滤                               |
+---+------------------------------------------------------------------+
| 6 | 上下文组装: prompt 设计、lost-in-middle 问题、引用                |
+---+------------------------------------------------------------------+
| 7 | LLM serving: API vs 自托管、优化（KV cache、quantization）        |
+---+------------------------------------------------------------------+
| 8 | Streaming: 逐 token 输出的 SSE                                   |
+---+------------------------------------------------------------------+
| 9 | 评估: RAGAS 指标、在线监控、反馈循环                              |
+---+------------------------------------------------------------------+
|10 | 扩展: 分片、缓存（语义缓存）、GPU 自动伸缩                      |
+---+------------------------------------------------------------------+
|11 | 成本: 模型路由、缓存、quantization、批处理                       |
+---+------------------------------------------------------------------+
|12 | 边缘情况: 幻觉、冲突、多模态、实时更新                           |
+---+------------------------------------------------------------------+
```

**面试中的关键差异化点：**
- 提到父子 chunking（展示超越朴素 RAG 的深度）
- 讨论混合搜索（dense + sparse）而非纯向量搜索
- 提出语义缓存作为成本/延迟优化方案
- 提到 cross-encoder 重排作为精度提升手段
- 讨论 RAGAS 框架用于评估（展示生产意识）
- 考虑成本感知的模型路由（展示商业敏锐度）
- 提及 lost-in-the-middle 问题（展示研究意识）
