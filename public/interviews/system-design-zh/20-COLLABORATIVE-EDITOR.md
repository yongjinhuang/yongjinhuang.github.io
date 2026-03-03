# 设计协同编辑器（Google Docs）

## 目录
1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [Operational Transform (OT)](#5-operational-transform-ot)
6. [CRDT：无冲突复制数据类型](#6-crdt无冲突复制数据类型)
7. [OT 与 CRDT 决策矩阵](#7-ot-与-crdt-决策矩阵)
8. [实时同步协议](#8-实时同步协议)
9. [冲突解决的具体示例](#9-冲突解决的具体示例)
10. [光标和选区状态](#10-光标和选区状态)
11. [文档版本管理与修订历史](#11-文档版本管理与修订历史)
12. [协同环境中的撤销/重做](#12-协同环境中的撤销重做)
13. [权限模型](#13-权限模型)
14. [离线编辑与重连同步](#14-离线编辑与重连同步)
15. [富文本：格式化操作](#15-富文本格式化操作)
16. [扩展策略](#16-扩展策略)
17. [常见面试追问](#17-常见面试追问)

---

## 1. 需求澄清

### 功能需求

| 功能                  | 描述                                                                          |
|--------------------------|--------------------------------------------------------------------------------------|
| 实时协同编辑     | 多个用户同时编辑同一文档，变更在 < 500ms 内可见 |
| 富文本格式化     | 加粗、斜体、下划线、标题、列表、表格、内联图片                      |
| 光标显示          | 实时查看其他用户的光标和文本选区                            |
| 评论和建议   | 内联评论、线程回复、带接受/拒绝功能的建议编辑            |
| 修订历史         | 完整的版本历史；恢复任意历史版本；查看版本间的差异            |
| 撤销 / 重做              | 每个用户独立的撤销栈，不会撤销协作者的更改                        |
| 共享和权限  | 文档级和链接级的所有者、编辑者、评论者、查看者角色                     |
| 离线编辑          | 离线状态下继续编辑；重新连接时同步                         |
| 导出                   | 导出为 DOCX、PDF、纯文本、HTML                                                |
| 搜索                   | 对用户有权访问的所有文档进行全文搜索                         |

### 非功能需求

| 属性             | 目标                                                                 |
|----------------------|------------------------------------------------------------------------|
| 本地延迟        | < 100ms：用户自己的按键立即显示（乐观本地应用） |
| 远程同步延迟  | 正常网络条件下，协作者在 < 500ms 内看到变更|
| 一致性          | 最终收敛：所有客户端必须达到相同状态            |
| 可用性         | 99.99% 在线时间（每年 < 53 分钟停机）                                 |
| 离线支持      | 无限制的离线编辑；重连时合并且不丢失数据         |
| 持久性           | 零数据丢失；每个操作在确认前持久化           |
| 可扩展性          | 1 亿文档，1000 万 DAU，3000 万并发 WebSocket 连接           |

### 规模估算

```
用户和文档：
  总文档数：              100M
  日活用户（DAU）：       10M
  峰值并发会话：          3M
  每文档平均编辑者：      3 个并发

操作量：
  活跃用户：              3M（峰值）
  每用户每分钟操作数：    50 次按键/分钟 ≈ 1 次操作/秒
  峰值操作数/秒：         3M 次操作/秒（全系统）
  每台 WebSocket 服务器：  ~10K 连接/服务器
  所需 WebSocket 服务器数：3M / 10K = 300 台

存储：
  平均文档大小：          100 KB（文本 + 格式化）
  平均操作大小：          200 字节
  每文档每日操作数：      ~5,000
  每日新操作存储：        100M 文档 x 5K 操作 x 200B = 100 TB/天（过大）
  活跃文档（1%）：        1M 活跃文档每日产生操作
  每日操作存储：          1M x 5K x 200B = 1 TB/天

快照：
  每 500 次操作快照一次：  降低重放开销
  快照大小：              100 KB
  每日新快照数：          1M 活跃文档 x 10 次快照 = 10 次快照
  每日快照存储：          10M x 100 KB = 1 TB/天

带宽：
  3M 并发用户每秒发送 1 次操作，每次 200B = 600 MB/s 入站
  每个操作扇出给平均 3 个协作者 = 1.8 GB/s 出站
```

---

## 2. API 设计

### REST 端点

```
# 文档生命周期
POST   /v1/documents                          创建新文档
GET    /v1/documents/{docId}                  获取文档元数据
PATCH  /v1/documents/{docId}                  更新元数据（标题等）
DELETE /v1/documents/{docId}                  软删除文档

# 文档内容（用于初始加载）
GET    /v1/documents/{docId}/content          获取最新快照 + 待处理操作
GET    /v1/documents/{docId}/content?rev={n}  获取修订版本 n 的快照

# 修订历史
GET    /v1/documents/{docId}/revisions            列出命名版本
POST   /v1/documents/{docId}/revisions            创建命名版本（书签）
GET    /v1/documents/{docId}/revisions/{revId}    获取特定修订版本内容
POST   /v1/documents/{docId}/revisions/{revId}/restore  恢复到修订版本

# 权限 / 共享
GET    /v1/documents/{docId}/permissions          列出访问控制条目
POST   /v1/documents/{docId}/permissions          授予用户或链接访问权限
PATCH  /v1/documents/{docId}/permissions/{permId} 更改角色
DELETE /v1/documents/{docId}/permissions/{permId} 撤销访问权限

# 评论
GET    /v1/documents/{docId}/comments              列出所有评论
POST   /v1/documents/{docId}/comments              创建评论
POST   /v1/documents/{docId}/comments/{id}/replies 回复评论
PATCH  /v1/documents/{docId}/comments/{id}         解决 / 重新打开评论
DELETE /v1/documents/{docId}/comments/{id}         删除评论

# 导出
POST   /v1/documents/{docId}/export          请求体：{ format: "docx"|"pdf"|"txt" }
GET    /v1/exports/{exportId}                轮询状态；就绪时获取下载 URL
```

### WebSocket 协议

WebSocket 连接是协同编辑的主要通道。所有实时事件都通过它传输。

```
# 连接
WS  wss://collab.example.com/v1/documents/{docId}/session
    查询参数：?token={jwt}&clientId={uuid}&rev={lastKnownRev}

# 客户端 -> 服务器消息（JSON）
{
  "type": "op",
  "clientId": "abc-123",
  "rev": 42,               # 客户端基于的修订版本
  "ops": [                 # 操作数组
    {
      "type": "insert",
      "pos": 15,
      "chars": "Hello",
      "attrs": { "bold": true }
    }
  ]
}

{
  "type": "cursor",
  "clientId": "abc-123",
  "selection": { "anchor": 20, "head": 25 }
}

{
  "type": "ack",
  "seq": 7               # 确认收到服务器广播
}

{
  "type": "ping"
}

# 服务器 -> 客户端消息
{
  "type": "op",
  "authorId": "user-789",
  "authorName": "Alice",
  "rev": 43,             # 应用此操作后的新服务器修订版本
  "ops": [ ... ]         # 转换后的操作
}

{
  "type": "cursor",
  "clientId": "user-789",
  "selection": { "anchor": 10, "head": 10 },
  "color": "#FF5733"
}

{
  "type": "ack",
  "rev": 43              # 服务器确认客户端操作，告知客户端新修订版本
}

{
  "type": "snapshot",    # 重连时如果客户端落后太多则发送
  "rev": 500,
  "content": { ... }
}

{
  "type": "presence",    # 文��中的其他用户
  "users": [
    { "userId": "user-789", "name": "Alice", "color": "#FF5733" }
  ]
}

{
  "type": "pong"
}
```

---

## 3. 数据模型

### 文档表

```sql
documents (
  doc_id        UUID         PRIMARY KEY,
  owner_id      UUID         NOT NULL REFERENCES users(user_id),
  title         VARCHAR(500) NOT NULL DEFAULT 'Untitled Document',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,                   -- 软删除
  latest_rev    INT          NOT NULL DEFAULT 0,
  snapshot_rev  INT          NOT NULL DEFAULT 0,-- 最新快照的修订版本
  word_count    INT,
  is_template   BOOLEAN      NOT NULL DEFAULT false
)
```

### 操作日志（仅追加）

```sql
document_ops (
  doc_id        UUID         NOT NULL REFERENCES documents(doc_id),
  rev           INT          NOT NULL,          -- 服务器分配的修订版本号
  client_id     VARCHAR(64)  NOT NULL,          -- 发送者
  user_id       UUID         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ops_json      JSONB        NOT NULL,           -- 操作数组
  client_rev    INT          NOT NULL,           -- 客户端提交操作时的修订版本
  PRIMARY KEY (doc_id, rev)
)
-- 按 doc_id 哈希分区以实现水平扩展
-- 在 (doc_id, rev) 上建索引以支持顺序重放
```

### 快照

```sql
document_snapshots (
  doc_id        UUID         NOT NULL,
  rev           INT          NOT NULL,
  content_json  JSONB        NOT NULL,   -- 此修订版本的完整文档状态
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  byte_size     INT          NOT NULL,
  PRIMARY KEY (doc_id, rev)
)
-- 大文档存储在对象存储（S3）中；表中保存元数据 + 小文档
```

### 权限

```sql
permissions (
  perm_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID         NOT NULL REFERENCES documents(doc_id),
  principal_type VARCHAR(16) NOT NULL,  -- 'user' | 'group' | 'link' | 'domain'
  principal_id  VARCHAR(256),           -- user_id、group_id 或链接 token
  role          VARCHAR(16)  NOT NULL,  -- 'owner' | 'editor' | 'commenter' | 'viewer'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID         NOT NULL,
  expires_at    TIMESTAMPTZ,
  UNIQUE (doc_id, principal_type, principal_id)
)
```

### 命名修订版本（版本历史）

```sql
named_revisions (
  revision_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID         NOT NULL,
  rev           INT          NOT NULL,     -- 指向的服务器修订版本
  name          VARCHAR(255),             -- 用户提供的名称（可选）
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID         NOT NULL,
  is_auto       BOOLEAN      NOT NULL DEFAULT true, -- 自动 vs 手动
  UNIQUE (doc_id, rev)
)
```

### 操作 Schema（JSONB 详情）

```json
{
  "ops": [
    {
      "type": "retain",
      "count": 10
    },
    {
      "type": "insert",
      "chars": "Hello, ",
      "attrs": {
        "bold": true,
        "fontSize": 14
      }
    },
    {
      "type": "delete",
      "count": 3
    },
    {
      "type": "format",
      "count": 5,
      "attrs": {
        "italic": true
      }
    }
  ]
}
```

这是 Delta 格式（由 Quill.js / ProseMirror 使用），它将操作编码为一系列 retain/insert/delete，并带有可选的属性对象。它是可组合的和可逆的。

---

## 4. 高层架构

### 系统组件

```
+------------------+       +------------------+       +------------------+
|   浏览器 /       |       |   浏览器 /       |       |   浏览器 /       |
|   客户端 A       |       |   客户端 B       |       |   客户端 C       |
|                  |       |                  |       |                  |
|  本地文档状态    |       |  本地文档状态    |       |  本地文档状态    |
|  OT/CRDT 引擎   |       |  OT/CRDT 引擎   |       |  OT/CRDT 引擎   |
|  待发送操作队列  |       |  待发送操作队列  |       |  待发送操作队列  |
+--------+---------+       +--------+---------+       +--------+---------+
         |  WebSocket                |  WebSocket                | WebSocket
         |                          |                           |
+--------v--------------------------v---------------------------v---------+
|                           负载均衡器（L7）                              |
|                     按 doc_id 粘性会话                                  |
+--------+----------------------------------+---------------------------+-+
         |                                  |                           |
+--------v---------+              +---------v--------+       +----------v-------+
|  协同服务器 1    |              |  协同服务器 2    |       |  协同服务器 N    |
|                  |              |                  |       |                  |
| - WS 管理器     |              | - WS 管理器     |       | - WS 管理器     |
| - OT 转换       |              | - OT 转换       |       | - OT 转换       |
| - 操作排序器    |              | - 操作排序器    |       | - 操作排序器    |
| - 在线状态管理  |              | - 在线状态管理  |       | - 在线状态管理  |
+--------+---------+              +---------+--------+       +----------+-------+
         |                                  |                           |
         +----------------------------------+---------------------------+
                                            |
              +-----------------------------+-----------------------------+
              |                             |                             |
   +----------v----------+    +-------------v-----------+   +------------v--------+
   |    消息代理          |    |    操作存储（数据库）   |   |   快照存储          |
   |    (Kafka/Redis Pub) |    |    (PostgreSQL /        |   |   (S3 / GCS)        |
   |                     |    |     Spanner)             |   |                     |
   | 主题：              |    |                         |   | - doc_snapshots/    |
   | - doc.{docId}.ops   |    | - document_ops          |   |   {docId}/{rev}.json|
   | - doc.{docId}.cursor|    | - document_snapshots    |   |                     |
   +---------------------+    | - named_revisions       |   +---------------------+
                              +-------------+-----------+
                                            |
                              +-------------v-----------+
                              |    搜索 / 分析          |
                              |    (Elasticsearch)      |
                              |                         |
                              | - 全文文档搜索          |
                              | - 活动分析              |
                              +-------------------------+
```

### 编辑操作的请求流程

```
客户端 A 输入 "H"
       |
       | 1. 本地应用（乐观，立即执行）
       v
  本地文档 = "Hello H"   （即时，0ms）
       |
       | 2. 通过 WebSocket 发送操作
       v
  { type:"op", rev:42, ops:[{type:"insert",pos:6,chars:"H"}] }
       |
       v
+------+-------+
| 协同服务器   |
|              |
| 3. 锁定文档  |  （分布式锁或每文档单写入器）
|    修订版本  |
|              |
| 4. 转换      |  对自 rev=42 以来提交的所有操作进行转换
|    传入的    |
|    操作      |
|              |
| 5. 分配      |  rev = 43
|    新修订号  |
|              |
| 6. 持久化    |  写入 document_ops（rev=43）
|    到数据库  |  （同步，在确认之前）
|              |
| 7. 确认      |  { type:"ack", rev:43 }
|    客户端 A  |
|              |
| 8. 扇出      |  将转换后的操作广播给客户端 B、C
|    到对等端  |
+--------------+

客户端 B 和 C 收到：
  { type:"op", authorId:"A", rev:43, ops:[...已转换...] }
  -> 应用到本地状态
  -> 将本地修订版本更新到 43
```

### 文档加载流程

```
客户端打开文档
       |
       v
GET /v1/documents/{docId}/content
       |
       v
  API 服务器检查权限
       |
       v
  加载最新快照（rev=500）
  + 从 rev=500 到 rev=当前（例如 rev=543）的所有操作
       |
       v
  返回 { snapshot, ops[], latestRev: 543 }
       |
       v
  客户端在快照基础上重放 43 个操作
       |
       v
  客户端打开 WebSocket：?rev=543
       |
       v
  客户端现在处于实时同步状态
```

---

## 5. Operational Transform (OT)

### 核心概念

OT 允许并发操作相互转换，使所有客户端收敛到相同的文档状态。每个操作都相对于特定的文档状态（修订版本）定义。当两个操作并发提交时，必须对其中一个进行转换以考虑另一个的影响。

### 操作类型

```
Insert(pos, chars)   — 在位置 pos 插入字符 chars
Delete(pos, count)   — 从位置 pos 开始删除 count 个字符
Retain(count)        — 保持 count 个字符不变（用于 Delta 格式）
Format(pos, count, attrs) — 对范围应用格式化
```

### 转换函数

OT 的核心是 `transform(op1, op2) -> (op1', op2')`，使得：

```
apply(apply(doc, op1), op2') == apply(apply(doc, op2), op1')
```

这就是收敛性属性。如果它成立，所有客户端将达到相同的状态，无论它们应用操作的顺序如何。

#### 示例：两个并发插入

```
初始文档：  "AC"
            01   （位置）

客户端 A：Insert("B", pos=1)   -- 想在 A 和 C 之间插入 B
客户端 B：Insert("X", pos=1)   -- 想在 A 和 C 之间插入 X

不经过转换，两个客户端发送原始操作会产生：
  客户端 A 先应用 A 再应用 B：  "AC" -> "ABC" -> "AXBC"   （在 "ABC" 上在 pos=1 应用 B 的操作）
  客户端 B 先应用 B 再应用 A：  "AC" -> "AXC" -> "ABXC"   （在 "AXC" 上在 pos=1 应用 A 的操作）

结果不一致！"AXBC" != "ABXC"
```

转换函数必须产生一致的结果：

```
transform(Insert("B", pos=1), Insert("X", pos=1)):
  -> 如果我们决定 "A 优先于 B"（例如通过 userId 字典序或客户端顺序决胜）：
     op1' = Insert("B", pos=2)   -- B 必须右移因为 X 在位置 1 被插入
     op2' = Insert("X", pos=1)   -- X 保持在 pos=1

结果：
  两个客户端："AC"
    -> 应用 Insert("X", pos=1) -> "AXC"
    -> 应用 Insert("B", pos=2) -> "AXBC"

  或者：
    -> 应用 Insert("B", pos=1) -> "ABC"
    -> 应用 Insert("B" 转换后 pos=2) 上面有误...
```

让我们更精确一些：

```python
def transform_insert_insert(op1, op2):
    """
    op1 = Insert(pos=p1, chars=c1)
    op2 = Insert(pos=p2, chars=c2)
    返回 (op1', op2')，使它们可以按任意顺序应用。
    """
    p1, c1 = op1.pos, op1.chars
    p2, c2 = op2.pos, op2.chars

    if p1 < p2:
        # op1 在 op2 位置之前插入；op2 必须右移 len(c1)
        op1_prime = Insert(p1, c1)               # 不变
        op2_prime = Insert(p2 + len(c1), c2)     # 右移
    elif p1 > p2:
        # op2 在 op1 位置之前插入；op1 必须右移 len(c2)
        op1_prime = Insert(p1 + len(c2), c1)     # 右移
        op2_prime = Insert(p2, c2)               # 不变
    else:
        # 相同位置：使用决胜规则（例如字典序 userId）
        # 约定：如果 userId_A < userId_B 则 op1 获胜
        if user_a < user_b:
            op1_prime = Insert(p1, c1)           # 不变
            op2_prime = Insert(p2 + len(c1), c2) # B 右移
        else:
            op1_prime = Insert(p1 + len(c2), c1) # A 右移
            op2_prime = Insert(p2, c2)           # 不变

    return op1_prime, op2_prime
```

#### 示例：插入 vs 删除

```
初始文档：  "Hello World"
            01234567890

客户端 A：Insert("!", pos=11)   -- 追加 "!"
客户端 B：Delete(pos=6, count=5) -- 删除 "World"

客户端 A 的操作之后，客户端 B 的删除仍然应该删除 "World"：
  transform(Delete(6,5), Insert(11,"!")):
    Insert 在 pos=11 处，>= 6+5=11（边界）
    -> Delete 位置不变：Delete(6, 5)

客户端 B 的操作之后，客户端 A 的插入需要调整：
  transform(Insert(11,"!"), Delete(6,5)):
    Insert pos=11 在 Delete start=6 之后
    11 >= 6：左移 min(count, pos-start) = min(5, 11-6) = 5
    -> Insert(11-5, "!") = Insert(6, "!")

两个客户端的结果：
  "Hello World" -> 删除 "World" -> "Hello " -> 在位置 6 插入 "!" -> "Hello !"
  "Hello World" -> 在位置 11 插入 "!" -> "Hello World!" -> 删除 "World" -> "Hello !"
```

### 服务器规范排序（Jupiter 协议）

Google Docs 使用基于 Jupiter 协议的客户端-服务器 OT 架构：

```
+----------+                                    +----------+
|  客户端  |                                    |  服务器  |
|          |                                    |          |
| 状态：   |                                    | 状态：   |
|  doc_c   |                                    |  doc_s   |
|  rev=n   |                                    |  rev=n   |
|          |                                    |          |
|   用户   |                                    |          |
|  输入    |                                    |          |
|          |                                    |          |
| op_c     |-------- Send(op_c, clientRev=n) -->|          |
| (insert  |                                    | 接收     |
|  "A"     |                                    | op_c     |
|  at 5)   |                                    |          |
|          |                                    | 同时     |
|          |<------- Broadcast(op_s, rev=n+1) --| 服务器   |
|          |         （另一个用户的操作）        | 收到 op_s|
|          |                                    | 来自 B   |
|          |                                    |          |
| 客户端   |                                    | 服务器   |
| 收到     |                                    | 收到     |
| op_s     |                                    | op_c     |
|          |                                    |          |
| 必须     |                                    | 必须     |
| 转换     |                                    | 转换     |
| op_s     |                                    | op_c     |
| 针对     |                                    | 针对     |
| 待确认的 |                                    | op_s     |
| op_c     |                                    |（op_c 基于|
|          |                                    | 旧的修订 |
|          |                                    | 版本）   |
```

服务器是操作排序的唯一权威来源。每个操作都获得一个全局序列号。客户端必须将收到的服务器操作针对其自身待确认的操作进行转换。

```
客户端算法：

pending_ops = []          # 已发送但未确认的操作
server_rev  = 42          # 从服务器收到的最新修订版本

function sendOp(op):
    op.clientRev = server_rev
    pending_ops.append(op)
    ws.send(op)

function onServerOp(serverOp, newRev):
    # 将 serverOp 针对所有待确认操作进行转换
    transformed = serverOp
    for i, pending in enumerate(pending_ops):
        pending_ops[i], transformed = transform(pending, transformed)
    # 将转换后的 serverOp 应用到本地文档
    applyToDoc(transformed)
    server_rev = newRev

function onAck(newRev):
    pending_ops.pop(0)   # 最早的待确认操作已被确认
    server_rev = newRev
```

---

## 6. CRDT：无冲突复制数据类型

### 核心概念

CRDT 是可以在多个节点间复制并无冲突合并的数据结构。收敛不需要中央服务器。每次合并都是交换的、结合的和幂等的。

```
属性             | 含义
-----------------|------------------------------------------------------------
交换性           | merge(A, B) == merge(B, A)  — 顺序无关
结合性           | merge(merge(A,B), C) == merge(A, merge(B,C))
幂等性           | merge(A, A) == A  — 重复应用同一操作是安全的
```

### 用于文本编辑的 CRDT 类型

#### RGA（可复制可增长数组）

每个字符被分配一个唯一的、不可变的标识符。字符通过 ID 引用其左邻居，而不是使用位置（位置会移动）。

```
在 START 之后插入 "H"   -> { id: (t=1, uid=A), char: "H", after: START }
在 (1,A) 之后插入 "i"   -> { id: (t=2, uid=A), char: "i", after: (1,A) }
在 (2,A) 之后插入 "!"   -> { id: (t=3, uid=A), char: "!", after: (2,A) }

文档：H(1,A) -> i(2,A) -> !(3,A)  =>  "Hi!"

在与 "!" 相同位置的并发插入 "."：
用户 B：在 (2,A) 之后插入 "." -> { id: (t=3, uid=B), char: ".", after: (2,A) }

(3,A) 和 (3,B) 都有 after=(2,A)，相同位置。
按 uid 决胜：A > B 字典序，所以 A 的 "!" 排在前面。
结果：H -> i -> ! -> .  =>  "Hi!."   （所有客户端相同）
```

#### Yjs（YATA 算法）

Yjs 是使用最广泛的 CRDT 库。它使用 YATA（Yet Another Transformation Approach），一种针对文本优化的 RGA 变体。主要特性：

```
- O(1) 均摊插入（使用双向链表 + 跳表）
- 结构共享以实现高效快照
- 内置感知协议（光标位置作为 CRDT）
- 兼容 ProseMirror、CodeMirror、Monaco、Quill
```

#### Logoot / LSEQ

与 RGA 的相对位置不同，Logoot 为每个字符分配一个全局唯一的分数位置。位置是 0 到 1 之间的分数：

```
"AC"   ->   A(0.25)  C(0.75)

在 A 和 C 之间插入 B：
  用户 A：B 获得位置 0.5   -> A(0.25) B(0.5) C(0.75)
  用户 B 并发插入 X：
    X 也获得 0.25 和 0.75 之间的位置，例如 X(0.375)

两个客户端可以按位置排序获得一致的顺序：
  A(0.25) X(0.375) B(0.5) C(0.75)  ->  "AXBC"
```

问题：随着大量插入，位置会无限增长。LSEQ 使用变深度树来管理这个问题。

### CRDT 优缺点

```
优点：
  + 收敛不需要中央服务器
  + 天然支持离线：重连时合并
  + 可实现点对点架构
  + 不需要转换函数（无 OT cp2 要求）

缺点：
  - 每个字符的元数据开销较大（唯一 ID）
  - 删除的墓碑标记消耗内存
  - 垃圾回收复杂
  - 某些 CRDT 类型产生非直觉的合并结果
    （例如并发插入的交错）
  - 撤销/重做更难正确实现
```

---

## 7. OT 与 CRDT 决策矩阵

| 维度                  | Operational Transform (OT)        | CRDT（例如 Yjs）                   |
|----------------------------|-----------------------------------|------------------------------------|
| 服务器需求         | 必须有中央服务器           | 可以 P2P 或服务器辅助    |
| 核心逻辑复杂度   | 高（转换函数很难） | 中等（数据结构复杂度） |
| 合并正确性          | 如果 cp2 属性成立则正确     | 可证明的构造正确性   |
| 元数据开销          | 低（操作紧凑）             | 较高（每个字符有唯一 ID）   |
| 撤销/重做                  | 直接（反转操作）       | 复杂（需要额外簿记）|
| 离线支持            | 较难（需要服务器转换） | 天然支持（重连时合并）       |
| 采用情况                   | Google Docs、Quip、CKEditor       | Notion、Linear、Figma、VS Code     |
| 性能（大文档）   | 良好（操作是小增量）       | 不做 GC 可能下降             |
| 富文本支持          | 研究充分（Delta 格式）       | 优秀（Yjs Y.XmlFragment）      |
| 网络分区         | 必须缓冲和重试             | 天然处理断连   |

### 何时选择 OT

```
在以下情况选择 OT：
  - 你有中央服务器且要求始终在线
  - 你需要非常低的元数据开销
  - 你的团队有深厚的 OT 专业知识（或使用 OT 库）
  - 你想要更简单的撤销/重做语义
  - 构建类似 Google Docs 的东西（客户端-服务器模型）
```

### 何时选择 CRDT

```
在以下情况选择 CRDT：
  - 离线优先是首要需求
  - 你想要 P2P 协作（无服务器往返）
  - 你正在构建本地优先的软件（CRDT + 按需同步）
  - 你想要可证明的收敛性而无需实现转换函数
  - 构建类似 Figma、Linear 或多人游戏的东西
```

### Google Docs 的实际方案

Google Docs 使用基于 Jupiter 协议的中央服务器 OT。关键方面：

```
1. 中央服务器分配全局修订版本号
2. 服务器转换和排序所有操作
3. 客户端一次只有一个待确认操作（简化的 OT）
4. 客户端可以"流水线"（在确认前发送下一个操作）但需谨慎
5. 服务器使用文档级锁（一个分片 = 一个文档）
6. 实践中：1 个服务器进程拥有一个文档的所有会话
```

---

## 8. 实时同步协议

### WebSocket 连接管理

```
+----------+                +-------------+             +----------+
|  客户端  |                | 负载均衡器  |             |  协同    |
|          |                | （粘性）    |             |  服务器  |
+----+-----+                +------+-------+             +----+-----+
     |                             |                          |
     | HTTP 升级到 WebSocket       |                          |
     +----------------------------->                          |
     |                             | 路由到服务器             |
     |                             | 按 docId 亲和性         |
     |                             +------------------------->|
     |                             |                          |
     |<=========== WS 已连接 ================================ |
     |                             |                          |
     | 发送：{ type:"join",        |                          |
     |   docId, rev:543, token }   |                          |
     +=============================================>          |
     |                             |                          |
     |                             |         验证 token       |
     |                             |         检查权限         |
     |                             |         加载文档状态     |
     |                             |                          |
     |<====== { type:"welcome",    |                          |
     |   users:[...], rev:543 } ===|                          |
     |                             |                          |
     |  [编辑开始]                 |                          |
     |                             |                          |
     | 每 30 秒心跳 ping           |                          |
     +=============================================>          |
     |<============================================ pong      |

重连处理：
  - 客户端存储 lastKnownRev
  - 重连时：使用 ?rev=lastKnownRev 连接
  - 服务器发送从 lastKnownRev+1 到当前的操作
  - 如果间隔太大（> 阈值）：服务器发送快照
```

### 连接亲和性和扇出

单个文档的 WebSocket 连接必须全部路由到同一服务器（或通过 pub/sub 共享状态的服务器）：

```
方案 A：每文档单服务器（简单）
+-----------------------------------+
|         负载均衡器                |
|    Hash(docId) -> 服务器索引      |
+-----+------------+----------------+
      |            |
+-----v--+    +----v---+
| 服务器 |    | 服务器 |
|  S1    |    |  S2    |
| 文档： |    | 文档： |
| A,B,C  |    | D,E,F  |
+--------+    +--------+

问题：如果 S1 有热点文档（数千名编辑者），S1 会过载。

方案 B：Pub/Sub 扇出（可扩展）
+----------+    +----------+    +----------+
| 服务器 1 |    | 服务器 2 |    | 服务器 3 |
| (ws A,B) |    | (ws C,D) |    | (ws E,F) |
+----+-----+    +----+-----+    +----+-----+
     |               |               |
     |    订阅 doc.{docId}           |
     +---------------+---------------+
                     |
              +------v------+
              | Redis PubSub|
              |  或 Kafka   |
              |             |
              | 当 S1       |
              | 应用操作    |
              | -> 发布     |
              |   到主题    |
              | S2、S3 扇出 |
              |   到它们的  |
              |   WS 连接   |
              +-------------+
```

### 重连和间隔填补

```
客户端在 rev=200 断开，在 rev=215 重连。

情况 1：间隔小（< 100 个操作）
  服务器查询：SELECT * FROM document_ops WHERE doc_id=X AND rev > 200
  通过 WebSocket 发送操作 201..215
  客户端在其状态上重放操作

情况 2：间隔大（> 100 个操作）或客户端离线数天
  服务器发送最新快照（例如 rev=500）
  客户端丢弃本地状态，从快照重建
  任何本地待确认操作必须重新转换或丢弃
  （实践中：提示用户"由于长时间离线，文档已重置"）

情况 3：客户端有断开前的待确认操作
  客户端在 localStorage 中保留待确认操作
  重连时，客户端重新发送待确认操作（使用原始 clientRev）
  服务器将它们针对 clientRev 以来发生的所有操作进行转换
  服务器用新的服务器修订版本确认
```

---

## 9. 冲突解决的具体示例

### 场景 1：在相同位置并发插入

```
初始文档："cat"
          012

用户 A（在 pos 1）：Insert("r")    -> 想要 "cart"
用户 B（在 pos 1）：Insert("o")    -> 想要 "coat"

两个用户同时提交。服务器先收到 A 的操作。

服务器处理 A 的操作（clientRev=0）：
  没有待转换的操作。
  应用："cat" -> "cart"  (rev=1)
  确认 A，rev=1
  广播给 B：Insert("r", pos=1) at rev=1

服务器收到 B 的操作（clientRev=0）：
  B 的操作基于 rev=0，但服务器现在在 rev=1。
  必须将 B 的操作针对 A 的操作进行转换。
  transform(Insert("o",1), Insert("r",1)):
    相同位置。决胜：A 的 userId < B 的 userId -> A 获胜。
    B 的操作右移：Insert("o", pos=2)
  应用转换后的操作："cart" -> "coart" ... 等等，这不对。

让我重新来：
  "cart" + Insert("o", pos=2) = "caort"   （在索引 2 处插入 o）

嗯，让我仔细追踪：
  "c a r t"
   0 1 2 3
  在 pos=2 插入 "o"："c a o r t" -> "caort"

用户 B 的本地状态（在收到服务器事件之前）：
  "cat" -> Insert("o", pos=1) -> "coat"
  然后收到服务器广播：Insert("r", pos=1)
  转换：Insert("r",1) 针对待确认的 Insert("o",1)
  因为 A 赢得决胜，B 的待确认操作右移到 pos=2。
  所以服务器广播 Insert("r",pos=1) 先被应用：
    "coat" ... 等等，B 已经在本地应用了。

正确的客户端视角：
  B 在本地应用了 Insert("o",1)：状态 = "coat"
  B 的待确认操作：[Insert("o",1) with clientRev=0]

  A 的操作的服务器确认到达：Insert("r",1), rev=1
  客户端 B 将其针对待确认操作转换：
    transform(server: Insert("r",1), pending: Insert("o",1)):
      它们在相同位置。A 获胜。服务器操作保持在 pos=1，待确认操作移到 pos=2。

  转换后的服务器操作：Insert("r", pos=1)
  B 应用到本地状态 "coat"：Insert("r", pos=1) -> "coart"...

  嗯，将 Insert("r",1) 应用到 "coat"：
    "c o a t"
     0 1 2 3
    在 pos=1 插入 "r"："c r o a t" -> "croat"

  B 的待确认操作变为 Insert("o", pos=2)。

  当服务器确认 B 的转换后操作（Insert("o",2) at rev=2）：
  A 和 B 都必须有 "croat"。
  服务器将 Insert("o",2) 应用到 "cart"：
    "c a r t"
     0 1 2 3
    在 pos=2 插入 "o"："c a o r t" -> "caort"  <- 错误，服务器在 A 操作后有 "cart"

  服务器上的最终状态（rev=2）："caort"
  客户端 B 上的最终状态：将 Insert("r",1) 应用到 "coat" = "croat"

  发散了。转换函数必须正确处理这个。

正确的决胜确保两个客户端看到相同的排序。
实践中，OT 库（ShareDB 等）能正确处理这个。
关键洞察：决胜必须是确定性的，且在客户端和服务器上保持一致。
```

### 场景 2：插入然后删除重叠

```
初始文档："Hello World"
          01234567890

用户 A：Delete(6, 5)   -- 删除 "World"  -> "Hello "
用户 B：Insert("!", 11) -- 追加 "!"     -> "Hello World!"

服务器先收到 A 的删除（rev=1）：
  应用："Hello World" -> "Hello "
  广播给 B。

服务器收到 B 的插入（clientRev=0）：
  将 Insert(11,"!") 针对 Delete(6,5) 进行转换：
    Insert pos=11。Delete 覆盖 [6..10]。
    pos 11 > 6+5=11（恰好在边界）
    在插入位置之前删除的字符数：min(5, 11-6) = 5
    转换后的插入位置：11 - 5 = 6
  将 Insert("!",6) 应用到 "Hello "："Hello !"

客户端 B 已在本地应用 Insert("!",11) -> "Hello World!"
收到服务器广播的 Delete(6,5)：
  必须将 Delete(6,5) 针对待确认的 Insert("!",11) 进行转换：
    Insert 在 11 > Delete 结束位置 11，所以 delete 不受影响。
    转换后：Delete(6,5) 不变。
  将 Delete(6,5) 应用到 "Hello World!"："Hello !"

两个客户端收敛到："Hello !"
```

### 场景 3：格式化冲突

```
初始状态："hello" 无格式化

用户 A：加粗位置 [0,5)    -- 加粗 "hello"
用户 B：将位置 [2,5) 设为红色 -- 将 "llo" 设为红色

两者都是非破坏性的属性操作。
它们可以通过属性并集合并：

结果："he" 是加粗的，"llo" 是加粗且红色的。

大多数编辑器使用每个属性键的"最后写入者获胜"来处理。
因为 "bold" 和 "color" 是不同的键，所以没有冲突。
如果两个用户尝试设置不同的颜色，按服务器排序最后写入者获胜。
```

---

## 10. 光标和选区状态

### 状态协议

光标是临时的（不是持久化文档的一部分），但必须保持同步。它们使用单独的轻量级通道。

```
客户端在每次光标移动时发送光标更新：
{
  "type": "cursor",
  "clientId": "abc-123",
  "selection": {
    "anchor": 42,   // 选区起点（如果没有选区则为光标位置）
    "head": 55      // 选区终点（如果没有选区则 == anchor）
  },
  "timestamp": 1709500000000
}

服务器：
  1. 接收光标更新
  2. 存储到 Redis（TTL = 30 秒，每次更新时刷新）
  3. 广播给同一文档会话中的所有其他客户端
  4. 不持久化到数据库（临时数据）

其他客户端收到：
{
  "type": "cursor",
  "userId": "user-789",
  "displayName": "Alice",
  "color": "#FF5733",      // 加入时分配，会话内稳定
  "selection": { "anchor": 42, "head": 55 }
}
```

### 远程操作后的光标位置调整

当远程操作被应用时，所有本地跟踪的光标位置（包括其他用户的光标）必须更新：

```python
def adjust_cursor_for_op(cursor_pos, op):
    """
    在应用操作后调整光标位置。
    """
    if op.type == "insert":
        if cursor_pos > op.pos:
            return cursor_pos + len(op.chars)
        elif cursor_pos == op.pos:
            # 光标恰好在插入位置。
            # 约定：光标保持不动（插入出现在光标之前）。
            return cursor_pos
        else:
            return cursor_pos
    elif op.type == "delete":
        if cursor_pos <= op.pos:
            return cursor_pos
        elif cursor_pos <= op.pos + op.count:
            # 光标在被删除的范围内；移到删除起始位置。
            return op.pos
        else:
            return cursor_pos - op.count
    return cursor_pos
```

### 状态架构

```
+----------+         +---------------+        +----------+
| 客户端 A |         | 协同服务器    |        | 客户端 B |
|          |         |               |        |          |
| 用户移动 |        |               |        |          |
| 光标     |-------->| 接收来自 A 的 |        |          |
|          | WS 消息 | 光标更新      |        |          |
|          |         |               |        |          |
|          |         | 发布到        |        |          |
|          |         | Redis：       |        |          |
|          |         | presence:docX |        |          |
|          |         |   -> A@pos42  |        |          |
|          |         |               |        |          |
|          |         | 扇出到        |------->| 接收     |
|          |         | 所有会话      | WS 消息| 来自 A   |
|          |         | docX          |        | 的光标   |
|          |         |               |        | 在 pos42 |
|          |         |               |        |          |
|          |         +---------------+        | 显示     |
|          |                                  | A 的     |
|          |                                  | 光标     |

Redis 在线状态存储：
  Key: presence:{docId}
  类型：Hash
  字段：{clientId} -> { userId, pos, timestamp, color }
  TTL：60 秒（通过心跳刷新）
```

### 心跳和超时

```
客户端每 15 秒发送心跳：
  { "type": "ping" }

服务器响应：
  { "type": "pong" }

服务器也每 30 秒向所有客户端广播在线用户列表。

如果一个客户端 60 秒内未被看到：
  从 presence:docId 哈希中移除
  向剩余客户端广播 { "type": "user_left", "userId": "..." }
```

---

## 11. 文档版本管理与修订历史

### 自动 vs 命名修订版本

```
自动保存修订版本（系统创建）：
  - 每 N 次操作（例如 N=100）
  - 每 M 分钟活动（例如 M=5）
  - 文档关闭 / 所有编辑者断开连接时

命名修订版本（用户创建）：
  - 用户显式点击"保存版本"
  - 在进行高风险批量编辑之前
  - 这些永久保留；自动修订版本在 30 天后清理
```

### 存储策略：仅追加日志 + 快照

```
                   操作日志（仅追加）
Rev:  1   2   3 ... 100  101 ... 200  201 ... 300  301 ... current
      |               |               |               |
      |               |               |               |
    快照            快照            快照            快照
   (rev=0)        (rev=100)      (rev=200)       (rev=300)

获取 rev=250 的文档：
  1. 加载 rev=200 的快照（最近的 250 之前的快照）
  2. 在快照基础上重放操作 201..250
  3. 返回结果

显示 rev=100 和 rev=300 之间的差异：
  1. 构建 rev=100 的文档（从快照）
  2. 构建 rev=300 的文档（从快照）
  3. 计算文本差异（Myers 算法）
  4. 返回统一差异格式

快照触发：
  - 每 100 次操作：创建快照
  - 后台任务：创建快照，存储到 S3
  - 更新 document_snapshots 表
```

### 修订历史 UI 数据

```
GET /v1/documents/{docId}/revisions

响应：
{
  "revisions": [
    {
      "revisionId": "rev-uuid-1",
      "rev": 543,
      "name": "最终版本",       // 用户命名
      "isAuto": false,
      "createdAt": "2024-01-15T10:30:00Z",
      "createdBy": { "userId": "...", "displayName": "Alice" },
      "wordCount": 1250,
      "charCount": 7500
    },
    {
      "revisionId": "rev-uuid-2",
      "rev": 501,
      "name": null,                  // 自动修订版本
      "isAuto": true,
      "createdAt": "2024-01-15T09:00:00Z",
      "createdBy": null,
      ...
    }
  ]
}
```

---

## 12. 协同环境中的撤销/重做

### 问题

在单用户编辑器中，撤销会恢复上一个操作。在协同编辑器中，这变得复杂：

```
状态：  "Hello"

用户 A 输入 " World"   -> "Hello World"
用户 B 输入 "!"        -> "Hello World!"

用户 A 按下 Ctrl+Z（撤销）。

应该发生什么？
  选项 1：撤销 A 的最后操作 " World" -> "Hello!"   （B 的 "!" 保留）
  选项 2：撤销全局顺序中的最后操作 -> 撤销 "!"（错误！撤销了 B 的工作）

正确行为：每个用户有自己的撤销栈。
  用户 A 的撤销应该只撤销用户 A 的操作。
  用户 B 的 "!" 应该保留。
```

### 每用户撤销栈

```
每个用户维护：
  undoStack: [op1, op2, op3]   // 他们执行的操作，最近的在最后
  redoStack: [op4, op5]        // 他们撤销的操作

当用户按下 Ctrl+Z：
  1. 从 undoStack 弹出 op3
  2. 计算 op3 的逆操作（例如 Insert 变为 Delete，反之亦然）
  3. 逆操作必须针对 op3 应用以来发生的所有操作进行转换
     （包括其他用户的操作）
  4. 将转换后的逆操作作为新操作提交
  5. 将 op3 推入 redoStack

为什么要转换逆操作？
  如果用户 A 在 pos=6 插入了 "World"（rev=10），
  之后用户 B 在 pos=11 插入了 "!"（rev=11），
  A 操作的逆操作是 Delete("World", pos=6, count=5)。
  但这必须针对 B 的 Insert("!",11) 进行转换：
    Insert 在 Delete 结束位置之后 -> Delete 不受影响。
  提交 Delete("World",6,5) -> "Hello!"
```

### 撤销栈修剪

随着时间推移，撤销栈会积累很多操作。如果用户 B 在用户 A 最早可撤销操作之后做了 1000 次更改，转换变得昂贵。解决方案：

```
1. 限制撤销历史深度（例如每用户 200 次操作）
2. 如果操作被转换过太多次，标记为"不可撤销"
3. 使用基于 OT 的选择性撤销库（例如 "any-undo" 论文）
4. CRDT 方法：逆操作是一等公��，不需要转换
   （Yjs 通过跟踪来源的 undoManager 实现此功能）
```

---

## 13. 权限模型

### 角色

```
+----------+----------+-------------------+------------------------+
| 角色     | 查看文档 | 评论文档          | 编辑文档内容           |
+----------+----------+-------------------+------------------------+
| 所有者   |    是    |        是         |          是            |
| 编辑者   |    是    |        是         |          是            |
| 评论者   |    是    |        是         |          否            |
| 查看者   |    是    |        否         |          否            |
+----------+----------+-------------------+------------------------+

额外的仅所有者操作：
  - 更改他人权限
  - 删除文档
  - 转移所有权
  - 禁用链接共享
```

### 权限继承和链接共享

```
文档拥有：
  - 直接访问：特定用户或组被授予角色
  - 链接共享：拥有链接的任何人获得角色（查看/评论/编辑）
  - 域名共享：example.com 中的所有用户获得角色
  - 公开：���联网上的任何人都可以查看

解析顺序（最具体的优先）：
  1. 用户是所有者 -> 所有者
  2. 用户有直接权限 -> 使用该角色
  3. 用户的组有权限 -> 使用该角色
  4. 用户的域名匹配域名共享 -> 使用该角色
  5. 链接共享已开启 -> 使用链接角色
  6. 文档是公开的 -> 查看者
  7. 否则 -> 拒绝访问
```

### WebSocket 处理程序中的权限检查

```
WebSocket 连接时：
  1. 验证 JWT token
  2. 从 token 中提取 userId
  3. 查询 permissions 表获取 (docId, userId)
  4. 确定有效角色
  5. 如果角色为 NONE -> 以 403 关闭 WebSocket

收到 "op" 消息时：
  1. 检查角色是 EDITOR 或 OWNER
  2. 如果角色是 COMMENTER 或 VIEWER -> 拒绝操作，发送错误

收到 "comment" 消息时：
  1. 检查角色是 EDITOR、COMMENTER 或 OWNER
  2. 如果角色是 VIEWER -> 拒绝

在 Redis 中缓存权限：
  Key: perm:{docId}:{userId}
  Value: 角色字符串
  TTL: 5 分钟（权限变更时失效）
```

---

## 14. 离线编辑与重连同步

### 离线架构

客户端将所有待确认操作存储在持久本地存储中（浏览器使用 IndexedDB）：

```
+------------------+
|  浏览器          |
|                  |
|  IndexedDB：     |
|  - 文档状态      |
|    （快照）      |
|  - 待确认操作    |
|    [op1, op2...] |
|  - 最后修订：200 |
|                  |
|  内存中：        |
|  - 已应用操作    |
|  - 撤销栈        |
+------------------+

离线时：
  - 用户正常输入
  - 操作立即应用到本地状态
  - 操作追加到 IndexedDB 待确认队列
  - 无 WebSocket 通信

重连时：
  1. 打开 WebSocket：?rev=200（最后已知的服务器修订版本）
  2. 服务器响应操作 201..当前（如果太大则发送快照）
  3. 客户端必须：
     a. 将待确认操作针对收到的服务器操作进行转换
     b. 将收到的服务器操作应用到本地状态
     c. 重新发送转换后的待确认操作到服务器
  4. 服务器用新的服务器修订版本确认每个待确认操作
  5. 客户端从待确认队列中移除已确认的操作
```

### 重连时的冲突解决

```
客户端从 rev=200 离线到当前服务器 rev=250。
客户端有 10 个待确认操作（全部基于 rev=200）。

步骤 1：接收服务器操作 201..250（50 个操作）
步骤 2：将每个待确认操作针对 50 个服务器操作进行转换
         pending[0] = transform(pending[0], serverOps[0..49])
         pending[1] = transform(pending[1], serverOps[0..49], pending[0])
         ... 以此类推。
步骤 3：将服务器操作 201..250 应用到本地状态
步骤 4：逐个将转换后的待确认操作发送到服务器
         服务器用新修订版本确认每个

如果存在根本性冲突（例如用户尝试编辑已删除的文本）：
  转换函数应优雅地处理此情况。
  通常：对已删除内容的操作变为空操作。

合并通知：
  向用户显示："您的更改已与离线期间的 5 次其他编辑合并。"
```

### 离线检测的 Service Worker

```javascript
// service-worker.js
self.addEventListener('fetch', event => {
  if (isDocumentApiRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // 网络失败：返回缓存版本
          return caches.match(event.request)
        })
    )
  }
})

// 在客户端应用中
window.addEventListener('online', () => {
  collabEngine.reconnect()
})

window.addEventListener('offline', () => {
  collabEngine.enterOfflineMode()
})
```

---

## 15. 富文本：格式化操作

### Delta 格式

富文本需要同时编码内容（字符）和属性（格式化）。Delta 格式（Quill.js 使用，被许多编辑器采用）将文档表示为一系列操作：

```
文档："Hello World"，其中 "Hello" 是加粗的，"World" 是斜体的

Delta 表示：
[
  { insert: "Hello", attributes: { bold: true } },
  { insert: " " },
  { insert: "World", attributes: { italic: true } }
]

编辑操作也是包含 retain/insert/delete 的 Delta：
  用户选择 "World" 并加粗：
  [
    { retain: 6 },                              // 跳过 "Hello "
    { retain: 5, attributes: { bold: true } }  // 格式化 "World"
  ]

在末尾插入 "!"：
  [
    { retain: 11 },   // 跳过所有现有内容
    { insert: "!" }
  ]

删除 "Hello"：
  [
    { delete: 5 },
    { retain: 6 }
  ]
```

### 组合 Delta

两个 Delta 可以组合（当 op2 在 op1 之后应用时）：

```
compose(op1, op2) -> op3
使得：apply(apply(doc, op1), op2) == apply(doc, op3)

这用于：
  - 将多个小操作压缩为一个（提高网络效率）
  - 为撤销创建复合操作的逆操作
  - 压缩存储中的操作
```

### 转换属性操作

```
用户 A：加粗位置 [0,10)    -> { retain:0, retain:10 attrs:{bold:true} }
用户 B：删除位置 [5,10)    -> { retain:5, delete:5 }

将 A 的格式化针对 B 的删除转换：
  A 的 retain:10 现在只覆盖存活文本的 [0,5)（5 个字符在 pos 5 之后被删除）
  结果：retain:5 attrs:{bold:true}

将 B 的删除针对 A 的格式化转换：
  格式化不改变位置，所以删除不变。
  结果：retain:5, delete:5

两个客户端：加粗 "Hello"（前 5 个字符），"World" 被删除了。
```

### 块级格式化

文档除了内联格式化外还有块级结构（段落、标题、列表）：

```
块结构编码为"带属性的换行符"：
[
  { insert: "My Heading", attributes: { bold: true, fontSize: 24 } },
  { insert: "\n", attributes: { header: 1 } },    // 段落标记
  { insert: "Some paragraph text" },
  { insert: "\n" },                                // 普通段落
  { insert: "• List item 1" },
  { insert: "\n", attributes: { list: "bullet" } }, // 列表项
  { insert: "• List item 2" },
  { insert: "\n", attributes: { list: "bullet" } }
]

转换块操作需要特别注意：
  - 删除换行符会合并两个段落
  - 必须正确合并块属性
  - 表格单元格特别复杂（嵌套结构）
```

---

## 16. 扩展策略

### 文档级分片

```
每个文档由一个主协同服务器（或小集群）提供服务。
分片分配：
  server_index = hash(doc_id) % num_servers

负载均衡器将同一 docId 的所有 WebSocket 连接路由到同一服务器。

+---------------------+
| 负载均衡器          |
| Hash(docId) % N     |
+----+----+----+------+
     |    |    |
  S1   S2   S3   ...
  文档：文档：文档：
  A,D,G B,E,H C,F,I

热点文档问题：
  文档 X 有 10,000 个并发编辑者。
  X 的所有流量都到一台服务器 -> 瓶颈。

解决方案：为多查看者的文档使用读副本。
  - 主服务器：接收写入，应用 OT，广播到副本
  - 副本服务器：将操作转发给主服务器，接收广播，扇出到查看者 WS
  - 写入者仍连接到主服务器；查看者可连接到任何副本
```

### 数据库分片

```
按 doc_id 对 document_ops 和 document_snapshots 进行分片：
  shard = hash(doc_id) % num_db_shards

在一个分片内，一个 doc_id 的操作是顺序的（按 doc_id、rev 分区）。

热点处理：
  - VIP 文档（例如有 10K 编辑者的全公司公告）：专用分片
  - 使用虚拟节点的一致性哈希允许重新平衡

PostgreSQL 分区：
  CREATE TABLE document_ops (
    doc_id UUID NOT NULL,
    rev    INT  NOT NULL,
    ...
    PRIMARY KEY (doc_id, rev)
  ) PARTITION BY HASH (doc_id);

  CREATE TABLE document_ops_0 PARTITION OF document_ops
    FOR VALUES WITH (modulus 8, remainder 0);
  -- ... 共 8 个分区
```

### 缓存层

```
Redis 集群缓存：
  1. 热点文档的近期操作（最后 1000 个操作）
     Key: ops:{docId}:recent  （Redis 列表，上限 1000）
     用途：不访问数据库即可提供重连间隔填补服务

  2. 最新快照元数据
     Key: snap:{docId}:latest
     Value: { rev, s3_key, byte_size }
     TTL: 5 分钟

  3. 权限缓存
     Key: perm:{docId}:{userId}
     Value: 角色字符串
     TTL: 5 分钟，权限变更时失效

  4. 在线状态
     Key: presence:{docId}
     类型：Hash {clientId -> 序列化的光标状态}
     TTL: 每个字段，每次光标更新时刷新

  5. 文档会话锁
     Key: lock:{docId}
     类型：SET NX with TTL=30s
     用途：确保同一时间只有一台服务器是文档的主服务器
     （如果主服务器失败则使用 pub/sub 回退）
```

### 快照压缩任务

```
后台任务（每小时运行）：

1. 查找符合以下条件的文档：
   自上次快照以来操作数 > 100

2. 对每个此类文档：
   a. 加载 last_snapshot_rev 处的快照
   b. 加载从 last_snapshot_rev+1 到 current_rev 的操作
   c. 将所有操作应用到快照
   d. 将新快照写入 S3
   e. 更新 document_snapshots 表
   f. 标记 < (current_rev - 30天内的操作) 的旧操作待删除

3. 清理旧的自动修订版本：
   删除 named_revisions WHERE is_auto=true AND created_at < now() - 30 天
   永久保留所有用户命名的修订版本
```

### 多区域全球架构

```
+------------------+         +------------------+         +------------------+
| 区域：US-East    |         | 区域：EU-West    |         | 区域：AP-East    |
|                  |         |                  |         |                  |
| 负载均衡器       |         | 负载均衡器       |         | 负载均衡器       |
| 协同服务器       |         | 协同服务器       |         | 协同服务器       |
| Redis（在线状态）|         | Redis（在线状态）|         | Redis（在线状态）|
|                  |         |                  |         |                  |
| 主数据库分片     |         |                  |         |                  |
|（用于 US 文档）  |         |                  |         |                  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         |     跨区域同步             |                            |
         +----------------------------+----------------------------+
                                      |
                          +-----------v----------+
                          | 全局操作日志         |
                          | (Spanner / CockroachDB|
                          |  具有全局强           |
                          |  一致性)              |
                          +----------------------+

文档归属于某个区域。
  - 如果文档所有者在美国，文档归属到 US-East。
  - 编辑美国文档的欧盟用户：他们的 WS 连接到欧盟服务器，
    欧盟服务器代理到 US-East 进行操作排序。
  - 欧盟用户在美国归属文档上增加约 100ms 延迟。
  - 对于全球协作：接受延迟或使用异步 CRDT 同步。
```

---

## 17. 常见面试追问

### 问：Google Docs 如何处理 Jupiter 协议的单待确认操作限制？

传统 OT 要求客户端等待确认后才能发送下一个操作。Google Docs 对此进行了改进：

```
技术：带修订版本跟踪的操作流水线。

客户端可以不等待确认就发送多个操作，
但必须跟踪：
  - 哪些操作未被确认（待确认）
  - 每个待确认操作基于的修订版本

服务器按顺序处理它们，逐个确认。
客户端在确认到达时调整待确认操作。

这是安全的因为：
  - 服务器按顺序处理（每个客户端连接 FIFO）
  - 服务器将每个操作针对当前服务器状态转换
  - 客户端可以通过重放确认来重建服务器的视图
```

### 问：如何处理包含 100 万字符的文档（超大文档）？

```
挑战：
  1. 加载：1M 字符 * 2 字节 = 最少 2MB
  2. 大文档上的 OT/CRDT 操作
  3. 网络：加载时发送完整文档

解决方案：
  1. 分块加载：
     - 只加载可见视口（例如滚动位置周围的 50KB）
     - 用户滚动时懒加载各部分

  2. 文档分区：
     - 内部将文档分成"段"（例如每页或每 10K 字符）
     - 每个段有自己的操作日志和锁
     - 跨段操作需要分布式事务

  3. 流式快照：
     - 快照存储在 S3 中作为多部分文件
     - 客户端通过范围请求下载

  4. 压缩：
     - 快照和操作使用 Brotli/gzip 压缩
     - 增量压缩：发送与上次快照的差异
```

### 问：如何实现建议编辑（修订跟踪）？

```
建议编辑是带有"建议"标记注释的常规操作。
它们像任何其他操作一样存储在操作日志中，但呈现方式不同。

数据模型：
{
  "type": "insert",
  "chars": "建议的文本",
  "attrs": {
    "suggestion": {
      "suggestionId": "sugg-uuid",
      "authorId": "user-123",
      "createdAt": "..."
    }
  }
}

当建议被接受时：
  - 移除 suggestion 属性，保留内容
  - 这是一个去除 "suggestion" 属性的新操作

当建议被拒绝时：
  - 删除建议的字符（发送删除操作）
  - 其他用户看到删除

建议操作像常规操作一样参与 OT/CRDT。
渲染层决定如何显示它们（删除线 vs 绿色文本）。
```

### 问：权限模型如何与实时引擎交互？

```
编辑者活跃时权限可能发生变化：
  - 所有者在编辑者正在输入时撤销其访问权限

解决方案：
  1. 协同服务器订阅权限变更事件
     （由 API 服务器发布到 Kafka 主题）
  2. 收到 docId 的权限变更事件时：
     a. 查找此服务器上 docId 的所有活跃 WebSocket 连接
     b. 对每个连接：重新检查用户的有效角色
     c. 如果角色现在是 VIEWER 或 NONE：拒绝后续操作消息
     d. 如果角色现在是 NONE：在短暂宽限期后以 403 关闭 WebSocket
  3. 缓存 TTL 为 5 分钟意味着撤销最多有 5 分钟延迟
     （对大多数用例可接受；更高安全性使用更短 TTL）
```

### 问：如果两个用户同时重命名文档会怎样？

```
文档标题不是操作日志的一部分。
标题是 documents 表中的简单元数据字段。

方法：标题使用最后写入者获胜。
  - 标题更改通过 REST API（PATCH /documents/{docId}）
  - 使用乐观锁（version 列）检测冲突
  - 如果用户的标题被覆盖则通知用户
  - 替代方案：将标题视为单字符 CRDT 文本字段

为什么不用 OT 处理标题？
  - 标题短、简单，很少并发编辑
  - 为 256 字符的字段使用完整 OT 基础设施过度设计
  - 对元数据（非文档正文）来说 LWW 是可接受的
```

### 问：文档变化时如何处理评论？

```
评论锚定到文本范围（anchor + head 位置）。
随着文档变化，这些位置必须更新。

方法：将评论锚点存储为操作日志引用，而非绝对位置。

创建评论时：
  记录：{ commentId, docRev: 543, anchor: 10, head: 20 }

解析当前修订版本（600）的评论位置：
  重放从 rev=543 到 rev=600 的操作，在每步调整 anchor/head。
  缓存解析后的位置。

当锚定文本被删除时：
  将评论标记为"孤立"（文本已删除）。
  在侧边栏显示并注明"此评论引用的文本已被删除。"

替代方案（更简单）：
  将评论锚点作为不可见 CRDT 节点嵌入文档文本中。
  CRDT 在所有操作中保留它们。
  这就是 Notion 和 Linear 的处理方式。
```

### 问：如何测试分布式协同编辑器？

```
测试层次：

1. OT/CRDT 转换函数的单元测试：
   基于属性的测试（QuickCheck 风格）：
     - 生成随机操作对
     - 验证收敛性：apply(apply(doc, op1), transform(op2,op1)) ==
                     apply(apply(doc, op2), transform(op1,op2))
   覆盖所有操作类型组合：insert-insert、insert-delete 等。

2. 服务器的集成测试：
   - 模拟 N 个客户端发送并发操作
   - 验证所有客户端收敛到相同的最终状态
   - 测试重连和间隔填补流程

3. 混沌/故障注入测试：
   - 随机丢弃 WebSocket 消息
   - 在会话中途终止协同服务器
   - 短暂分区数据库
   - 验证无数据丢失，正确收敛

4. 负载测试：
   - 同一文档 100 个并发编辑者
   - 10K 个文档，每个 3 个编辑者
   - 测量收敛延迟（p50、p99）
   - 测量 WebSocket 服务器满载时的 CPU

5. 转换函数的模糊测试：
   生成格式错误或对抗性操作。
   验证无 panic，无数据损坏。
```

### 问：如何实现拼写检查和语法建议？

```
拼写/语法检查在客户端运行（出于隐私和延迟考虑）：
  - 使用浏览器内置的拼写检查（contenteditable 属性）
  - 或者：在本地运行 LanguageTool WebAssembly 模块
  - 下划线是本地 UI 装饰，不存储在文档中

对于 AI 语法建议（如 Google Docs 中的 Gemini）：
  1. 客户端将选中文本发送到 AI API（独立服务）
  2. AI 返回建议的替换文本
  3. 建议的替换作为"建议"操作插入（见上文）
  4. 其他用户可以像查看人类建议一样查看和接受/拒绝 AI 建议
```

### 问：大规模导出 DOCX 如何工作？

```
导出是后台任务（非同步）：

1. 客户端调用 POST /v1/documents/{docId}/export { format: "docx" }
2. API 服务器将导出任务入队到队列
3. 立即返回：{ exportId: "exp-123", status: "queued" }

导出 Worker：
  1. 出队任务
  2. 加载文档快照 + 应用待确认操作 -> 获取最终状态
  3. 使用库将 Delta 格式转换为 DOCX（例如 pandoc、docx.js）
  4. 将 DOCX 上传到 S3
  5. 将导出任务状态更新为 "complete" 并附带 S3 URL

客户端轮询：
  GET /v1/exports/exp-123
  -> { status: "complete", downloadUrl: "https://s3.../doc.docx?sig=..." }
  或使用 webhook/WebSocket 通知。

扩展：
  - 导出 Worker 是无状态的，易于扩展
  - 大文档（> 10MB）可能需要 30+ 秒
  - 在文档保存时预生成常见导出（后台处理，用于热门文档）
```

---

## 总结：关键设计决策

| 决策                    | 选择                              | 理由                                         |
|-----------------------------|-------------------------------------|---------------------------------------------------|
| 并发算法       | OT（服务器规范排序）      | 成熟、适用于中央服务器模型  |
| 操作格式            | Delta (retain/insert/delete/format) | 可组合、可逆、支持富文本        |
| 传输                   | WebSocket（持久连接）              | 低延迟、服务器推送、有状态会话        |
| 数据库                    | PostgreSQL（按 doc_id 分片）      | ACID、适合顺序操作日志、易于分片  |
| 快照存储            | S3 / 对象存储                   | 廉价、持久、可扩展到任意文档大小            |
| 在线状态                    | Redis（临时，基于 TTL）        | 快速，光标不需要持久化           |
| 扇出                     | Redis Pub/Sub 或 Kafka              | 解耦 WebSocket 服务器之间的依赖        |
| 离线支持             | IndexedDB + 重连时转换  | 在浏览器中工作，通过重放处理间隔        |
| 撤销/重做                   | 每用户撤销栈 + 转换     | 用户只撤销自己的更改                 |
| 权限                 | 角色层次结构 + 缓存         | 灵活、检查快速、变更时失效    |
| 版本管理                  | 仅追加操作日志 + 快照      | 高效存储，支持任意时间点还原     |
