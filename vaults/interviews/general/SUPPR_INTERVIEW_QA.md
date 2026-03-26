# Suppr 系统设计面试 — 面试官可能追问的问题与解答

> 基于 SUPPR_SYSTEM_DESIGN_ANALYSIS.md、SUPPR_CORE_FEATURES.md、suppr_interview_keywords.md、suppr_external_dependencies.md 整理。
> 目标：从面试官视角预判问题，准备好"坦诚暴露不足 + 给出解法"的回答策略。

---

## 一、架构层面（必问）

### Q1: 用户量上来后，当前架构的瓶颈在哪里？你怎么扩展？

当前最大的三个瓶颈：

#### 瓶颈 1: MySQL 连接池 = 2

- Undertow 有 64 个 worker 线程，但只有 2 个 DB 连接 → 62 个线程可能在等连接
- 任何并发请求都会排队，延迟急剧上升

**解法：**

- 调到 20-30（公式：`2 × CPU核数 + 磁盘数`）
- 加读写分离（`AbstractRoutingDataSource`），查询密集的走读副本
- 开启 `leakDetectionThreshold: 60000` 检测连接泄漏

#### 瓶颈 2: 没有熔断器，6+ 外部依赖

- LLM 服务超时 30 分钟、翻译服务超时 24 小时
- 一个服务挂掉 → 线程池全部被占满 → 连不相关的 API 也被拖垮（**级联故障**）

**解法：**

```
外部调用 → 熔断器 → 超时 → 重试 → 舱壁 → 服务
```

- 加 **Resilience4j** 熔断器：5 次连续失败后断开，30 秒后半开探测
- 舱壁模式：每个外部服务限制并发数（如 LLM 10 个、PubMed 5 个），互相隔离
- Fallback：返回缓存结果或优雅降级提示

#### 瓶颈 3: Redis 单点故障

- SSE 事件转发、JWT 验证、任务计数、停止信号全依赖单个 Redis
- Redis 一挂 → 实时功能全部中断

**解法：**

- Redis Sentinel 或 Cluster
- Caffeine 本地缓存作 L1（热数据 5-30 秒 TTL），减少 Redis 依赖

---

### Q2: 为什么用 Kafka 而不是直接异步调用？如果消息丢了怎么办？

**为什么用 Kafka：**

- 翻译任务最长 24 小时，深度研究 30 分钟 → 不能占着 HTTP 线程等
- Kafka 提供**持久化 + at-least-once 投递** → 消费者挂了重启后继续消费
- 用**手动 ACK** → 只有任务成功后才确认，失败不 ACK → Kafka 重新投递
- **TransactionSynchronization** → Kafka 消息在 DB 事务提交后才发送，防止数据库回滚了但消息已经发出去（孤儿消息）

```java
// 关键模式：延迟发送 Kafka 消息
TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
    @Override
    public void afterCommit() {
        fileTranslateTaskProducer.sendTranslateTask(uid, sessionId);
    }
});
```

**已知不足：**

- 目前没有 DLQ（死信队列）→ 反复失败的消息会被无限重试或静默丢弃

**改进：**

- 加 `DeadLetterPublishingRecoverer`，N 次重试失败后进 DLT
- 加 Kafka consumer lag 监控，lag > 100 条或 > 5 分钟告警

---

### Q3: SSE + Redis Pub/Sub 的方案能支撑多少并发？极限在哪？

**当前架构：**

```
Consumer 完成进度 → Redis PUBLISH → API Pod SUBSCRIBE → SseEmitter → 客户端
```

**限制：**

| 问题 | 影响 | 严重度 |
|------|------|--------|
| Redis Pub/Sub 是 fire-and-forget | API Pod 重启期间消息丢失 | 高 |
| SseEmitter 存内存 ConcurrentHashMap，50 分钟超时 | 客户端异常断开不清理 = 内存泄漏 | 高 |
| 每个 SSE 连接占一个 Undertow 线程 | 连接数有上限（64 线程） | 中 |
| 无心跳检测 | 死连接不能被及时发现 | 中 |

**改进方案：**

| 措施 | 效果 |
|------|------|
| Redis Pub/Sub → **Redis Streams** | 持久化、支持消费者组、断线重连不丢消息 |
| 加**心跳 ping**（每 15 秒） | 检测死连接，及时释放资源 |
| 定期清理（每 60 秒扫描） | 淘汰超过 TTL 的 emitter |
| 超时从 50 分钟缩短到 5 分钟 | 配合客户端 `last_event_id` 自动重连 |

---

## 二、积分系统（高频追问）

### Q4: 积分的冻结-消费-回滚模式很聪明，但并发请求同时冻结同一用户的积分怎么办？

**坦诚回答：** 这是已知问题。

当前缺少锁机制，并发操作可能导致：

- 两次冻结总和 > 实际余额 → **超卖**
- 双重退款（git 历史中修过这个 bug）

**三种修法（按推荐顺序）：**

| 方案 | 实现 | 优劣 |
|------|------|------|
| 乐观锁 | `version` 列 + `UPDATE ... WHERE version = ?` | 无锁等待，高并发下需重试 |
| 悲观锁 | `SELECT ... FOR UPDATE` | 简单可靠，但并发高时有阻塞 |
| Redis 分布式锁 | 按 userId 加锁序列化操作 | 实现简单，但增加 Redis 依赖 |

**推荐组合：** 乐观锁 + 幂等键（每个 freeze/consume 带唯一 `operationId`，重复调用幂等返回）

```java
// 乐观锁示例
int updated = dao.update(
    "UPDATE user_available_point_tab SET amount = amount - ?, version = version + 1 " +
    "WHERE id = ? AND version = ? AND amount >= ?",
    freezeAmount, pointId, currentVersion, freezeAmount
);
if (updated == 0) {
    throw new OptimisticLockException("并发冲突，请重试");
}
```

---

### Q5: 积分 FIFO 过期机制怎么实现的？大量用户过期时性能怎么样？

**当前实现：**

- 每小时 cron 扫描 `expire_time <= now` 的记录
- 批量处理（每批 100 条）：创建负数流水 → 软删除
- ShedLock 保证多 Pod 只有一个执行

**面试官追问"量大了怎么办"的回答：**

| 措施 | 效果 |
|------|------|
| 分批 + 游标分页 | 避免全表扫描，控制单次事务大小 |
| 加索引 `(expire_time, is_deleted)` | 加速过期记录查找 |
| 缩小批次 + 增加频率 | 从每小时一次改为每 10 分钟一次，每次处理量更小 |
| 分片执行 | 按 uid hash 分片，多个 Pod 并行处理不同分片 |

---

### Q6: 积分生命周期完整流程？

```
AWARD（获取积分：购买/注册/签到/邀请）
  ↓
AVAILABLE（可用状态，有过期时间）
  ↓ freezePoints()
FROZEN（冻结状态：预留给异步任务，FIFO 先过期的先冻结）
  ↓                          ↓
consumePoint()          unfreezePoints()
  ↓                          ↓
CONSUMED（已消费）      AVAILABLE（回滚，恢复到原积分池）

另外两条路径：
AVAILABLE → expireUserAvailablePoints() → EXPIRED（过期，软删除）
AVAILABLE → withdrawPoints() → WITHDRAWN（退款回收，FIFO 先过期的先扣）
```

**核心设计亮点（主动说）：**

- 类似于支付中的**预授权模式** → 冻结 = 预授权，消费 = 扣款，回滚 = 撤销
- 每条消费记录的 `uprid` 关联到原始积分池 → 全链路可追溯
- 无论任务成功、失败或超时 → 积分不会"消失"

---

## 三、具体设计决策（展示深度）

### Q7: API 和 Consumer 用同一套代码但不同 Profile 部署，为什么不拆成两个服务？

**现阶段正确的选择：**

- 团队小、业务早期 → 一套代码维护成本低
- 共享 Model/DAO/Service 层 → 不会出现数据模型不一致
- 通过 `@Profile("consumer")` 控制哪些 Bean 加载 → 部署隔离够用
- K8s 独立 Helm chart → **已经可以独立扩缩容**

**什么时候该拆（展示判断力）：**

| 信号 | 说明 |
|------|------|
| 依赖分化 | Consumer 的依赖（Gotenberg、翻译服务）和 API 的依赖差异越来越大 |
| 发布节奏不同 | API 需要日更，Consumer 周更 |
| 代码分支过多 | 大量 `@Profile` 条件分支影响可读性 |
| 故障隔离不够 | Consumer 的 bug 影响到 API 的稳定性 |

**拆分方向（如果需要）：**

- **积分服务** → 独立微服务（涉及钱，需要严格一致性和独立审计）
- **翻译编排器** → 独立服务（拥有 Kafka 消费者 + 状态机 + 外部服务集成）
- **通知服务** → 统一微信/SSE/邮件推送

---

### Q8: 支付回调如何保证幂等？如果回调来了两次怎么办？

这是**做得好的地方**，自信回答。

**三重保护：**

```
回调到达
  ↓
① 条件更新：UPDATE ... SET status=SUCCESS WHERE status=WAITING
   → 第二次影响 0 行 → 跳过
  ↓
② Redis 分布式锁：获取锁后再读 notifyTimes → double-check
   → 另一个请求已处理过 → 跳过
  ↓
③ 审计日志：每次回调都记录 PayNotifyLogDO → 可追溯
```

**结果：** 精确一次的权益发放（积分/会员），即使网络重试导致多次回调。

**退款流程同样可靠：**

- 反向回调 → FIFO 回收积分（最新获得的先扣）
- 会员到期时间回退
- 所有操作有审计记录

---

### Q9: 文件翻译的去重机制是怎么设计的？

**两级去重：**

| 级别 | 缓存内容 | 命中时跳过 | 节省 |
|------|----------|-----------|------|
| 预翻译缓存 | 文件分析结果（token 数、语言检测） | 外部服务调用 | API 延迟 |
| 翻译结果复用 | 同文件 + 同目标语言 + 同选项 | Kafka 消息 + 外部翻译调用 | 计算成本 + 用户等待时间 |

**第二级特别巧妙：** 新建 session 指向已有翻译文件 → 用户即时看到结果，零等待。

---

### Q10: 并发控制怎么做的？免费用户和会员有什么区别？

**Redis 原子计数器：**

```
file_translation:active_tasks:{uid}  → INCR 开始 / DECR 完成 / 24h TTL 防泄漏
file_translation:stop:{sessionId}    → 取消标志，consumer 周期检查
```

| 用户类型 | 最大并发翻译数 |
|----------|---------------|
| 免费用户 | 1 |
| 付费会员 | 3 |

**已知问题：**

- 超出并发限制的任务每 2 秒 poll Redis 检查是否有空位 → 浪费 consumer 线程
- **改进**：改用信号量（Semaphore）或条件等待，避免忙轮询

**取消机制（亮点）：**

- 停止信号在**等待空位时**和**翻译处理中**都会被检查
- 用户可以在任务生命周期的任何阶段取消 → 响应式取消

---

## 四、长期演进（展示架构视野）

### Q11: 如果用户量从几千涨到几十万，你会怎么重构？

**分阶段规划：**

```
阶段 1：快速修复（1-2 周）
├── MySQL 连接池 2 → 20-30
├── 加 Resilience4j 熔断器 + 舱壁
├── SSE 加心跳 + 定期清理
├── Kafka 加 DLQ
└── 积分加乐观锁

阶段 2：可观测性（2-4 周）
├── Micrometer → Prometheus → Grafana（指标）
├── OpenTelemetry → Jaeger（分布式追踪）
├── 关键告警：consumer lag、连接池等待、外部服务错误率
├── Flyway 数据库迁移管理
└── 集中日志：Logback → ELK / Loki

阶段 3：扩展性（1-3 月）
├── MySQL 读写分离（AbstractRoutingDataSource）
├── Redis Sentinel / Cluster
├── Caffeine L1 + Redis L2 多级缓存
├── SSE 从 Pub/Sub 迁移到 Redis Streams
└── 积分幂等键防重复操作

阶段 4：服务拆分（3-6 月，按业务需要）
├── 积分服务 → 独立微服务（金融数据，严格一致性）
├── 翻译编排器 → 独立服务（Kafka 消费者 + 状态机）
└── 通知服务 → 统一微信 / SSE / 邮件推送
```

---

### Q12: 当前架构的依赖故障矩阵是什么？

| 依赖挂了 | 影响范围 | 现有缓解措施 | 应该补充的 |
|----------|---------|-------------|-----------|
| MySQL | 全面宕机 — 核心数据不可用 | 无 | 读副本故障转移，连接池重试 |
| Redis | 缓存雪崩 + 无锁 + SSE 中断 | 无 | Caffeine L1 降级，Redis Sentinel |
| Kafka | 异步处理停止，翻译/研究排队 | 无 | 内存队列降级，重连重试 |
| MongoDB | 搜索/文档功能不可用 | 无 | 缓存结果，功能开关降级 |
| MinIO | 文件上传下载失败 | 无 | 预签名 URL 重试，本地临时存储 |
| LLM 服务 | 文献搜索不可用 | Health check | 加熔断器 + 降级提示 |
| 翻译服务 | 翻译功能不可用 | Health check + 重试 | 加熔断器 + 排队提示 |
| Gotenberg | PDF 转换失败 | 无 | 重试 + 排队人工处理 |

---

## 五、面试话术速查表

### 主动展示亮点

| 当面试官问到... | 你主动提的亮点 |
|---|---|
| 异步处理 | "我们用 TransactionSynchronization 保证 Kafka 消息在 DB 提交后才发，防止孤儿消息" |
| 计费可靠性 | "积分采用冻结-消费-回滚三阶段模式，类似预授权，确保异步任务无论成败都不丢积分" |
| 支付安全 | "回调幂等靠条件更新 + 分布式锁 + double-check，三重保护" |
| 部署架构 | "同一代码库通过 Spring Profile 拆分 API/Consumer，K8s 独立扩缩容" |
| 去重优化 | "文件翻译两级去重：预分析缓存 + 翻译结果复用，热门文档零等待" |
| 取消机制 | "Redis stop signal 在等待和处理两个阶段都检查，响应式取消" |

### 主动暴露不足 + 给出解法（加分项）

| 不足 | 你说的解法关键词 |
|------|----------------|
| 连接池 max=2 | HikariCP 调优 20-30，读写分离，`AbstractRoutingDataSource` |
| 无熔断器 | **Resilience4j**，熔断 + 舱壁 + fallback + 半开状态 |
| 积分竞态条件 | **乐观锁**（version 列）+ 幂等键，或 `SELECT ... FOR UPDATE` |
| 无可观测性 | **Micrometer** → Prometheus → Grafana，**OpenTelemetry** → Jaeger |
| SSE 内存泄漏 | **Redis Streams** 替代 Pub/Sub，心跳 ping，定期清理 |
| 无 DLQ | **Dead Letter Topic** + consumer lag 监控 + 信号量背压 |
| 无数据库迁移 | **Flyway** 版本化 schema 变更 |
| God classes (1000+ 行) | 提取子服务，单一职责，按领域拆分 |

### 关键数字记忆

| 数据 | 值 | 用途 |
|------|-----|------|
| Undertow worker 线程 | 64 | 解释连接池瓶颈 |
| HikariCP 当前 max | 2 | 第一个要修的问题 |
| HikariCP 推荐 max | 20-30 | 给出具体方案 |
| SSE 超时 | 50 分钟 | 解释内存泄漏风险 |
| Kafka max.poll.interval | 12 小时 | 解释为什么这么大（翻译任务长） |
| 翻译服务超时 | 24 小时 | 解释为什么需要异步 |
| Consumer 并发 | 3/节点 | 解释扩展性 |
| 线程池 max | 50 | 解释并发不匹配问题 |

---

> **核心策略：** 面试官考的不是完美系统，是你**能否识别问题、权衡取舍、规划演进**。把"已知问题 + 改进方案"作为主动展示的武器，而不是等面试官挖出来。
