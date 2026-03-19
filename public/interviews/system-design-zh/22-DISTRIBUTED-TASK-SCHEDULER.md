# 设计分布式任务调度器 (Temporal / Airflow)

## 目录

1. [需求澄清](#1-需求澄清)
2. [API 设计](#2-api-设计)
3. [数据模型](#3-数据模型)
4. [高层架构](#4-高层架构)
5. [DAG 执行引擎](#5-dag-执行引擎)
6. [任务队列架构](#6-任务队列架构)
7. [精确一次执行](#7-精确一次执行)
8. [重试策略](#8-重试策略)
9. [Cron 调度](#9-cron-调度)
10. [Worker 心跳与故障检测](#10-worker-心跳与故障检测)
11. [任务状态机](#11-任务状态机)
12. [持久化执行 (Temporal)](#12-持久化执行-temporal)
13. [Saga 模式实现分布式事务](#13-saga-模式实现分布式事务)
14. [限流与背压](#14-限流与背压)
15. [多租户与公平调度](#15-多租户与公平调度)
16. [扩展策略](#16-扩展策略)
17. [对比：自建 vs 采购](#17-对比自建-vs-采购)
18. [权衡取舍](#18-权衡取舍)
19. [常见面试追问](#19-常见面试追问)

---

## 1. 需求澄清

### 功能性需求

| 类别               | 需求                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Workflow 定义**  | 以代码形式定义 workflow（Temporal）或 DAG 配置形式（Airflow）；支持顺序、并行和条件任务执行；workflow 版本管理 |
| **任务调度**       | 一次性任务、基于 cron 的周期性任务、事件触发任务、依赖触发任务                                                 |
| **任务执行**       | 执行任意代码单元（Python、Go、Java 等）；在任务间传递输入/输出；支持任务超时                                   |
| **依赖解析**       | 基于 DAG 的依赖图；任务等待上游任务完成；fan-out 和 fan-in 模式                                                |
| **重试与错误处理** | 可配置重试策略（固定间隔、指数退避、抖动）；永久失败任务进入死信队列                                           |
| **监控与可观测性** | 实时任务状态；workflow 执行历史；任务日志；失败告警                                                            |
| **Workflow 控制**  | 暂停、恢复、取消和手动重试 workflow；回填历史执行                                                              |
| **多租户**         | Namespace/租户隔离；按租户分配资源配额；RBAC                                                                   |

### 非功能性需求

| 需求           | 目标                                   |
| -------------- | -------------------------------------- |
| 吞吐量         | 10,000+ 任务/分钟（167 任务/秒）       |
| 调度到分发延迟 | < 1 秒                                 |
| 可用性         | 99.99%（每年 52 分钟停机时间）         |
| 持久性         | 零任务丢失；执行前所有状态已持久化     |
| 精确一次语义   | 关键 workflow 不能执行两次             |
| 可扩展性       | Worker 水平扩展；10K 并发 workflow     |
| 任务执行延迟   | 调度器增加的开销 < 100ms               |
| 审计追踪       | 所有 workflow/任务状态变更的不可变历史 |

### 规模估算

```
Workflow:              10,000 个并发活跃 workflow
每个 workflow 的任务:    平均 20 个任务（范围：1-1000）
任务执行时间:           平均 30 秒（范围：100ms 到 24 小时）
总活跃任务:            10,000 * 20 = 200,000 个并发任务

任务吞吐量:
  1M 任务/天 / 86,400 秒 = 11.6 任务/秒（平均）
  峰值 (10x):                  116 任务/秒
  突发 (100x):                 1,160 任务/秒

Workflow 定义:          50,000 种唯一 workflow 类型
Worker:                 5,000 个 worker 节点（每个平均 40 个并发任务）
Cron 调度:              100,000 个活跃 cron 调度
```

### 粗略计算

```
+------------------------------+-------------------+---------------------+
| 指标                          | 平均值             | 峰值                 |
+------------------------------+-------------------+---------------------+
| 分发任务数/秒                  | 11.6              | 116                 |
| 并发 workflow                 | 10,000            | 50,000              |
| 任务状态变更/秒                | ~50               | 500                 |
| 心跳/秒（5K worker）           | 5,000（每个1次/秒） | 5,000               |
| 数据库写入/秒（状态变更）        | 100               | 1,000               |
| 每次 workflow 运行存储         | ~10 KB            | --                  |
| 每日存储                      | 1M * 10 KB = 10 GB| --                  |
| 保留期（90 天）                | 900 GB            | --                  |
+------------------------------+-------------------+---------------------+
```

---

## 2. API 设计

### Workflow 管理

```
POST   /api/v1/namespaces/{namespace}/workflows
       启动新的 workflow 执行

GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}
       获取 workflow 执行详情和当前状态

DELETE /api/v1/namespaces/{namespace}/workflows/{workflow_id}
       取消正在运行的 workflow

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/signal
       向运行中的 workflow 发送信号事件

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/query
       查询运行中的 workflow 当前状态

GET    /api/v1/namespaces/{namespace}/workflows
       列出 workflow，支持过滤（状态、类型、时间范围）

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/retry
       从失败点重试失败的 workflow
```

### 任务管理

```
GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks
       列出 workflow 执行中的所有任务

GET    /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks/{task_id}
       获取任务详情、输入、输出和日志

POST   /api/v1/namespaces/{namespace}/workflows/{workflow_id}/tasks/{task_id}/retry
       手动重试特定的失败任务

POST   /api/v1/namespaces/{namespace}/tasks/poll
       Worker 轮询可用任务（长轮询，20 秒超时）

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/complete
       Worker 报告任务完成并附带输出数据

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/fail
       Worker 报告任务失败并附带错误详情

POST   /api/v1/namespaces/{namespace}/tasks/{task_token}/heartbeat
       Worker 发送心跳表明任务仍在运行
```

### 调度管理

```
POST   /api/v1/namespaces/{namespace}/schedules
       为 workflow 创建 cron 调度

GET    /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       获取调度配置和下次运行时间

PUT    /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       更新调度（cron 表达式、workflow 输入、策略）

DELETE /api/v1/namespaces/{namespace}/schedules/{schedule_id}
       暂停或删除调度

POST   /api/v1/namespaces/{namespace}/schedules/{schedule_id}/trigger
       立即手动触发已调度的 workflow

GET    /api/v1/namespaces/{namespace}/schedules/{schedule_id}/history
       列出该调度触发的最近执行记录
```

### 请求/响应示例

```json
// POST /api/v1/namespaces/prod/workflows
// 请求
{
  "workflow_type": "order-fulfillment",
  "workflow_id": "order-12345",      // 幂等键
  "task_queue": "fulfillment-workers",
  "input": {
    "order_id": "12345",
    "customer_id": "cust-789",
    "items": [{"sku": "ABC", "qty": 2}]
  },
  "execution_timeout": "PT24H",       // ISO 8601 时间段
  "retry_policy": {
    "max_attempts": 3,
    "initial_interval": "PT5S",
    "backoff_coefficient": 2.0,
    "max_interval": "PT5M"
  },
  "memo": {"priority": "high"}
}

// 响应
{
  "workflow_id": "order-12345",
  "run_id": "run-a1b2c3d4",
  "status": "RUNNING",
  "started_at": "2026-03-01T10:00:00Z",
  "namespace": "prod"
}
```

---

## 3. 数据模型

### Workflow 定义表

```sql
CREATE TABLE workflow_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id  UUID NOT NULL REFERENCES namespaces(id),
  workflow_type VARCHAR(255) NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  definition    JSONB NOT NULL,       -- DAG 结构或代码引用
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    VARCHAR(255),

  UNIQUE(namespace_id, workflow_type, version)
);
```

### Workflow 执行表

```sql
CREATE TABLE workflow_executions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id         UUID NOT NULL REFERENCES namespaces(id),
  workflow_id          VARCHAR(255) NOT NULL,  -- 用户提供的幂等键
  run_id               UUID NOT NULL UNIQUE,
  workflow_type        VARCHAR(255) NOT NULL,
  task_queue           VARCHAR(255) NOT NULL,
  status               VARCHAR(50) NOT NULL,   -- RUNNING, COMPLETED, FAILED, CANCELLED, TIMED_OUT
  input                JSONB,
  result               JSONB,
  error                TEXT,
  memo                 JSONB,
  search_attributes    JSONB,
  execution_timeout    INTERVAL,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  closed_at            TIMESTAMPTZ,
  parent_workflow_id   UUID REFERENCES workflow_executions(id),

  INDEX idx_namespace_status (namespace_id, status),
  INDEX idx_workflow_id (namespace_id, workflow_id),
  INDEX idx_task_queue (task_queue, status),
  INDEX idx_started_at (started_at),
  UNIQUE(namespace_id, workflow_id)               -- 强制每个 workflow_id 只有一个活跃运行
);
```

### 任务/Activity 表

```sql
CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id   UUID NOT NULL REFERENCES workflow_executions(id),
  task_type         VARCHAR(255) NOT NULL,
  task_queue        VARCHAR(255) NOT NULL,
  sequence_number   INT NOT NULL,           -- 在 workflow 历史中的位置
  status            VARCHAR(50) NOT NULL,   -- PENDING, SCHEDULED, RUNNING, SUCCESS, FAILED, TIMED_OUT
  priority          INT DEFAULT 0,          -- 值越高越紧急
  input             JSONB,
  output            JSONB,
  error             TEXT,
  attempt           INT DEFAULT 1,
  max_attempts      INT DEFAULT 3,
  retry_policy      JSONB,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  timeout           INTERVAL DEFAULT '30 minutes',
  worker_id         VARCHAR(255),           -- 哪个 worker 正在执行
  task_token        VARCHAR(512) UNIQUE,    -- 用于 worker 回调的不透明令牌
  heartbeat_at      TIMESTAMPTZ,

  INDEX idx_workflow_run (workflow_run_id),
  INDEX idx_task_queue_status (task_queue, status, priority DESC),
  INDEX idx_scheduled_at (status, scheduled_at),
  INDEX idx_heartbeat (status, heartbeat_at)
);
```

### Workflow 事件历史表

```sql
-- Temporal 风格：用于持久化执行的追加型事件日志
CREATE TABLE workflow_events (
  id              BIGSERIAL PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES workflow_executions(id),
  sequence_number INT NOT NULL,
  event_type      VARCHAR(100) NOT NULL,    -- WORKFLOW_STARTED, TASK_SCHEDULED, TASK_STARTED 等
  attributes      JSONB NOT NULL,           -- 事件特定的负载数据
  timestamp       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workflow_run_id, sequence_number),
  INDEX idx_workflow_events (workflow_run_id, sequence_number)
);
```

### 调度表

```sql
CREATE TABLE schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id      UUID NOT NULL REFERENCES namespaces(id),
  name              VARCHAR(255) NOT NULL,
  workflow_type     VARCHAR(255) NOT NULL,
  task_queue        VARCHAR(255) NOT NULL,
  cron_expression   VARCHAR(100),           -- "0 9 * * MON-FRI"
  timezone          VARCHAR(100) DEFAULT 'UTC',
  workflow_input    JSONB,
  retry_policy      JSONB,
  overlap_policy    VARCHAR(50) DEFAULT 'SKIP',  -- SKIP, ALLOW, BUFFER, CANCEL_OTHER
  catchup_window    INTERVAL DEFAULT '1 hour',
  is_paused         BOOLEAN DEFAULT FALSE,
  last_triggered_at TIMESTAMPTZ,
  next_trigger_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(namespace_id, name),
  INDEX idx_next_trigger (is_paused, next_trigger_at)
);
```

### Namespace/租户表

```sql
CREATE TABLE namespaces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(255) UNIQUE NOT NULL,
  description        TEXT,
  retention_days     INT DEFAULT 90,
  max_concurrent_wf  INT DEFAULT 10000,       -- 配额：最大并发 workflow 数
  max_tasks_per_sec  INT DEFAULT 1000,        -- 配额：速率限制
  global_search      BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. 高层架构

```
+------------------------------------------------------------------------------------------------------------------+
|                                         DISTRIBUTED TASK SCHEDULER                                               |
+------------------------------------------------------------------------------------------------------------------+

  客户端层
  +----------------+   +----------------+   +----------------+   +----------------+
  |   Web UI       |   |  CLI / SDK     |   |  REST API      |   |  gRPC API      |
  | (仪表盘)        |   | (Python/Go/JS) |   |  客户端         |   |  客户端         |
  +-------+--------+   +-------+--------+   +-------+--------+   +-------+--------+
          |                    |                     |                    |
          +--------------------+---------------------+--------------------+
                                         |
                                         v
  API 网关 / 负载均衡器
  +------------------------------------------------------------------+
  |                        API Gateway                               |
  |   认证 (JWT/OIDC) | 限流 | 路由 | Namespace 分发                   |
  +--------+------------------------------------+--------------------+
           |                                    |
           v                                    v
  +------------------+               +--------------------+
  |  前端服务         |               | 后端服务             |
  |  (workflow CRUD,  |               | (worker 轮询,       |
  |   调度管理)        |               |  任务分发)           |
  +--------+---------+               +----------+---------+
           |                                    |
           +------------------------------------+
                          |
                          v
  调度器核心
  +------------------------------------------------------------------+
  |                    调度器服务（高可用集群）                            |
  |  +------------------+  +--------------------+  +--------------+  |
  |  | Cron 触发器       |  | 依赖解析器          |  |Leader 选举    |  |
  |  | (解析并触发)       |  | (DAG 评估器)        |  |(基于 etcd)    |  |
  |  +------------------+  +--------------------+  +--------------+  |
  |  +------------------+  +--------------------+                    |
  |  | 超时监控器        |  | 心跳监控器           |                    |
  |  | (检测过期任务)     |  | (检测宕机 worker)   |                    |
  |  +------------------+  +--------------------+                    |
  +------------------------------------------------------------------+
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
  任务队列（按任务类型/优先级）
  +----------------+  +----------------+  +----------------+
  |  高优先级       |  | 普通队列        |  |  低优先级       |
  |  队列           |  |                |  |  队列           |
  | (Redis/Kafka)  |  | (Redis/Kafka)  |  | (Redis/Kafka)  |
  +-------+--------+  +-------+--------+  +-------+--------+
          |                   |                    |
          +-------------------+--------------------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
  Worker 池
  +----------------+  +----------------+  +----------------+
  | Worker 池 A    |  | Worker 池 B    |  | Worker 池 C    |
  | (Python 任务)   |  | (Go 任务)      |  | (Java 任务)    |
  | [W1][W2][W3]   |  | [W4][W5][W6]   |  | [W7][W8][W9]  |
  +----------------+  +----------------+  +----------------+
              |               |               |
              +---------------+---------------+
                              |
                              v
  持久化层
  +------------------------------------------------------------------+
  |  +------------------+  +------------------+  +--------------+   |
  |  | PostgreSQL       |  |  Redis           |  | 对象存储      |   |
  |  | (workflow 状态,   |  |  (任务队列,       |  | (S3/GCS)     |   |
  |  |  事件历史,        |  |   缓存, 锁,      |  | (大型 I/O    |   |
  |  |  调度)            |  |   限流)           |  |  负载数据)    |   |
  |  +------------------+  +------------------+  +--------------+   |
  |  +------------------+                                            |
  |  |  Elasticsearch   |                                            |
  |  | (workflow 搜索,   |                                            |
  |  |  可见性)          |                                            |
  |  +------------------+                                            |
  +------------------------------------------------------------------+
                              |
                              v
  可观测性
  +------------------------------------------------------------------+
  |  Prometheus (指标)  |  Jaeger (链路追踪)  |  Grafana (仪表盘)      |
  +------------------------------------------------------------------+
```

### 调度器服务基于 Leader 选举的高可用

```
+-------------------+     etcd 心跳           +-------------------+
|  调度器节点 1      |<----------------------->|  调度器节点 2      |
|  (LEADER)         |                         |  (STANDBY)        |
|                   |    etcd 分布式            |                   |
|  - 运行 cron 循环  |         锁              |  - 监视 leader    |
|  - 分发            |<----------------------->|  - 准备在 < 5s    |
|    任务            |                         |    内接管          |
|  - 监控            |                         |                   |
+-------------------+     +----------+        +-------------------+
                           |   etcd   |
                           | 集群     |
                           +----------+
```

---

## 5. DAG 执行引擎

### DAG 结构与拓扑排序

Workflow 被建模为有向无环图（DAG），其中：

- **节点** = 单个任务/活动
- **边** = 依赖关系（A -> B 表示 B 依赖于 A）

```
示例：订单履行 DAG

     +----------------+
     | validate_order |  （无依赖）
     +-------+--------+
             |
      +-------+-------+
      |               |
      v               v
+----------+    +------------+
|charge_   |    |reserve_    |
|customer  |    |inventory   |
+----+-----+    +-----+------+
     |                |
     +------+  +------+
            |  |
            v  v
       +----------+
       | ship_    |
       | order    |
       +----+-----+
            |
     +------+------+
     |             |
     v             v
+--------+   +----------+
|send_   |   |update_   |
|confirm |   |analytics |
|email   |   |          |
+--------+   +----------+
```

### 拓扑排序算法（Kahn 算法）

```python
from collections import defaultdict, deque
from typing import List, Dict, Set

class DAGExecutionEngine:
    def __init__(self, tasks: List[dict], dependencies: List[tuple]):
        # tasks: [{"id": "A", "type": "validate_order"}, ...]
        # dependencies: [("A", "B"), ...] 表示 B 依赖于 A
        self.tasks = {t["id"]: t for t in tasks}
        self.dependents = defaultdict(set)    # A -> {B, C}（谁依赖 A）
        self.prerequisites = defaultdict(set) # B -> {A}（B 需要什么）
        self.in_degree = defaultdict(int)

        for (upstream, downstream) in dependencies:
            self.dependents[upstream].add(downstream)
            self.prerequisites[downstream].add(upstream)
            self.in_degree[downstream] += 1

        # 初始化没有前置依赖的任务
        for task_id in self.tasks:
            if self.in_degree[task_id] == 0:
                self.in_degree[task_id] = 0  # 确保键存在

    def get_runnable_tasks(self, completed: Set[str]) -> List[str]:
        """返回所有前置条件已满足的任务。"""
        runnable = []
        for task_id in self.tasks:
            prereqs = self.prerequisites[task_id]
            if prereqs.issubset(completed) and task_id not in completed:
                runnable.append(task_id)
        return runnable

    def topological_order(self) -> List[str]:
        """通过 Kahn 算法返回一个有效的执行顺序。"""
        in_degree = dict(self.in_degree)
        queue = deque([t for t in self.tasks if in_degree[t] == 0])
        order = []

        while queue:
            task = queue.popleft()
            order.append(task)
            for dependent in self.dependents[task]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self.tasks):
            raise ValueError("DAG 中检测到环！")
        return order

    def on_task_complete(self, task_id: str, completed: Set[str]) -> List[str]:
        """当任务完成时调用。返回新的可运行任务。"""
        completed.add(task_id)
        newly_runnable = []
        for dependent in self.dependents[task_id]:
            if self.prerequisites[dependent].issubset(completed):
                newly_runnable.append(dependent)
        return newly_runnable
```

### 并行执行模型

```
时间  0s:  [validate_order]                          <- 深度 0（无依赖）
时间  5s:  [charge_customer] [reserve_inventory]     <- 深度 1（并行）
时间 15s:  [ship_order]                              <- 深度 2（fan-in：等待两者完成）
时间 25s:  [send_confirm_email] [update_analytics]   <- 深度 3（并行）

总挂钟时间：25s（相比顺序执行约 50s）
```

### 框架比较：Temporal vs Airflow vs Celery

| 特性                    | Temporal                       | Apache Airflow                  | Celery                        |
| ----------------------- | ------------------------------ | ------------------------------- | ----------------------------- |
| **范式**                | Workflow-as-code（持久化执行） | DAG-as-config（Python）         | 带有链的任务队列              |
| **Workflow 定义**       | 代码（Go、Python、Java、TS）   | Python DAG 文件                 | Python 装饰器                 |
| **状态管理**            | Event sourcing（重放）         | 数据库支持（任务实例）          | 无状态（结果存储在 Redis/DB） |
| **持久性**              | 内置（事件历史）               | 需要仔细的数据库配置            | 除非特别配置否则是尽力而为    |
| **精确一次**            | 是（通过幂等 SDK）             | 部分支持（幂等性非自动）        | 否（默认至少一次）            |
| **长时间运行 workflow** | 优秀（可运行数月/年）          | 差（调度器循环重启）            | 差（任务超时）                |
| **动态任务生成**        | 原生支持（动态 activity）      | 有限（2.3+ 版本的动态任务映射） | 是（chains、chords）          |
| **可视化/UI**           | Temporal Web                   | Airflow Web UI                  | Flower（基础）                |
| **版本管理**            | 内置 workflow 版本管理         | 有限                            | 无                            |
| **规模（任务/秒）**     | 10K+                           | ~100-500                        | 10K+（需要合适的 broker）     |
| **运维复杂度**          | 中等（托管版：Temporal Cloud） | 高（调度器、worker、数据库）    | 低-中等                       |
| **最适用场景**          | 微服务编排、长时间运行业务流程 | 批处理 ETL 管道、数据工程       | 简单异步任务处理              |

### Workflow-as-Code（Temporal）vs DAG-as-Config（Airflow）

```python
# ===== TEMPORAL: Workflow-as-Code =====
# 看起来像普通代码；Temporal 通过事件重放处理持久性

@workflow.defn
class OrderFulfillmentWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # 每个 activity 调用都会自动重试并具有持久性
        validated = await workflow.execute_activity(
            validate_order,
            order,
            start_to_close_timeout=timedelta(seconds=30)
        )

        # 真正的并行执行 - 只需使用 asyncio
        charge_result, reserve_result = await asyncio.gather(
            workflow.execute_activity(charge_customer, validated),
            workflow.execute_activity(reserve_inventory, validated)
        )

        # 条件逻辑就是普通 Python
        if charge_result.success and reserve_result.success:
            await workflow.execute_activity(ship_order, order)
            await asyncio.gather(
                workflow.execute_activity(send_confirmation, order),
                workflow.execute_activity(update_analytics, order)
            )
        else:
            await workflow.execute_activity(issue_refund, charge_result)

        return OrderResult(status="completed")
```

```python
# ===== AIRFLOW: DAG-as-Config =====
# 声明式图结构；调度器周期性地评估它

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

with DAG(
    dag_id="order_fulfillment",
    schedule_interval="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    default_args={"retries": 3, "retry_delay": timedelta(minutes=5)}
) as dag:

    validate   = PythonOperator(task_id="validate_order",    python_callable=validate_fn)
    charge     = PythonOperator(task_id="charge_customer",   python_callable=charge_fn)
    reserve    = PythonOperator(task_id="reserve_inventory", python_callable=reserve_fn)
    ship       = PythonOperator(task_id="ship_order",        python_callable=ship_fn)
    email      = PythonOperator(task_id="send_email",        python_callable=email_fn)
    analytics  = PythonOperator(task_id="update_analytics",  python_callable=analytics_fn)

    # 定义依赖图
    validate >> [charge, reserve]     # fan-out：并行
    [charge, reserve] >> ship         # fan-in：等待两者完成
    ship >> [email, analytics]        # fan-out：并行
```

---

## 6. 任务队列架构

### 队列设计

```
+-----------------------------------------------------------------------+
|                    任务队列系统                                          |
+-----------------------------------------------------------------------+

  调度器
     |
     | enqueue(task, priority, delay)
     v
+--------------------+
|   队列路由器        |  -- 按 task_type、租户、优先级路由
+----+---+---+-------+
     |   |   |
     v   v   v
+--------+ +--------+ +--------+
|优先级   | |优先级   | |优先级   |
| 高      | | 普通   | | 低     |
| 队列    | | 队列   | | 队列   |
+--------+ +--------+ +--------+
  Redis ZSET（score = 优先级 + 时间戳）

  +-- 延���任务队列（Redis ZSET，score = execute_at 纪元时间）--+
  |  execute_at 在未来的任务在此等待直到时间到达               |
  +------+--------------------------------------------------------+
         |
         | （当 score <= now() 时移动到主队列）
         v
+-------------------+
|  调度器循环        |  -- 每 100ms 轮询延迟队列
+-------------------+
```

### 基于 Redis 的优先级队列

```python
import redis
import json
import time
from dataclasses import dataclass

class TaskQueue:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.QUEUE_KEY = "tasks:{task_queue}:{priority}"
        self.DELAYED_KEY = "tasks:delayed"
        self.INFLIGHT_KEY = "tasks:inflight"

    def enqueue(self, task: dict, queue: str, priority: int = 0,
                delay_seconds: float = 0) -> str:
        task_json = json.dumps(task)
        if delay_seconds > 0:
            execute_at = time.time() + delay_seconds
            self.redis.zadd(self.DELAYED_KEY, {task_json: execute_at})
        else:
            # Score = -priority，这样最高优先级先出队
            score = -priority * 1e12 + time.time()
            key = self.QUEUE_KEY.format(task_queue=queue, priority=priority)
            self.redis.zadd(key, {task_json: score})
        return task["id"]

    def dequeue(self, queue: str, worker_id: str) -> dict | None:
        # 先尝试高优先级，然后普通，然后低优先级
        for priority in ["high", "normal", "low"]:
            key = self.QUEUE_KEY.format(task_queue=queue, priority=priority)
            # 使用 Lua 脚本原子性地弹出并跟踪，实现精确一次出队
            result = self.redis.zpopmin(key, 1)
            if result:
                task_json, _ = result[0]
                task = json.loads(task_json)
                # 跟踪进行中的任务并设置过期时间（心跳超时）
                inflight_key = f"{self.INFLIGHT_KEY}:{task['id']}"
                self.redis.setex(inflight_key, 60, json.dumps({
                    "task": task,
                    "worker_id": worker_id,
                    "claimed_at": time.time()
                }))
                return task
        return None

    def process_delayed_queue(self):
        """将符合条件的延迟任务移动到主队列。每 100ms 运行一次。"""
        now = time.time()
        # 获取所有 score <= now 的任务
        tasks = self.redis.zrangebyscore(self.DELAYED_KEY, 0, now, withscores=False)
        for task_json in tasks:
            task = json.loads(task_json)
            # 原子操作：从延迟队列移除，添加到主队列
            pipe = self.redis.pipeline()
            pipe.zrem(self.DELAYED_KEY, task_json)
            pipe.zadd(
                self.QUEUE_KEY.format(task_queue=task["queue"], priority="normal"),
                {task_json: time.time()}
            )
            pipe.execute()
```

### Worker 池架构

```
+------------------------------------------------------------------+
|                        WORKER 池                                   |
+------------------------------------------------------------------+

  +------------+   poll（长轮询，20s）    +------------------+
  |  Worker 1  |<------------------------->|   任务队列        |
  |            |                           |   (Redis/Kafka)  |
  |  Goroutine |   每 10s 发送心跳          |                  |
  |  池: 40    |-------------------------->|                  |
  |  个槽位     |                           +------------------+
  +------------+
  +------------+
  |  Worker 2  |   通过                    +------------------+
  |            |   HPA (k8s) 或            |  调度器            |
  |  槽位: 40  |   队列深度指标自动扩展 ---->|  (监控队列          |
  +------------+                           |  深度，扩展        |
  +------------+                           |  worker)          |
  |  Worker N  |                           +------------------+
  |            |
  +------------+

  Worker 注册：
  - 启动时：在 Redis 中注册 {worker_id, capabilities, capacity}
  - 持续：每 10s 发送心跳及当前负载
  - 关闭时：优雅排空（完成进行中的任务，停止轮询）
```

---

## 7. 精确一次执行

### 挑战

```
+-------------------+
|   调度器           |
|                   |  (1) 入队任务
|  任务已分发        +---------------------> 队列
|                   |
+-------------------+
         |
         | (2) Worker 出队，开始执行
         v
+-------------------+
|   Worker          |
|                   |
|  执行任务          |
|                   |
+-------------------+
         |
         |  此处发生崩溃！
         |
         v
  任务已运行但完成状态未记录。
  调度器认为任务仍在运行。
  超时后重新调度 --> 双重执行！
```

### 幂等令牌策略

```python
class IdempotentTaskExecutor:
    def __init__(self, db, redis):
        self.db = db
        self.redis = redis

    def execute(self, task_token: str, task_fn, inputs: dict) -> dict:
        # 1. 检查是否已完成（幂等性检查）
        cache_key = f"task:result:{task_token}"
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)  # 返回之前计算的结果

        # 2. 检查数据库中的完成记录
        existing = self.db.query(
            "SELECT output FROM tasks WHERE task_token = $1 AND status = 'SUCCESS'",
            task_token
        )
        if existing:
            result = existing[0]["output"]
            self.redis.setex(cache_key, 3600, json.dumps(result))
            return result

        # 3. 执行任务
        result = task_fn(**inputs)

        # 4. 在返回给调用者之前原子性地持久化结果
        self.db.execute("""
            UPDATE tasks
            SET status = 'SUCCESS', output = $1, completed_at = NOW()
            WHERE task_token = $2 AND status = 'RUNNING'
        """, json.dumps(result), task_token)

        # 5. 缓存结果以便快速去重
        self.redis.setex(cache_key, 3600, json.dumps(result))
        return result
```

### 通过 Workflow ID 唯一性进行去重

```sql
-- 强制：每个 namespace 中每个 workflow_id 只有一个活跃执行
-- UNIQUE 约束防止并发重复启动

INSERT INTO workflow_executions (namespace_id, workflow_id, run_id, status, ...)
VALUES ($1, $2, gen_random_uuid(), 'RUNNING', ...)
ON CONFLICT (namespace_id, workflow_id) DO NOTHING
RETURNING id;

-- 如果没有返回行，说明该 ID 的 workflow 已存在。
-- 调用者应获取现有执行并返回其 run_id。
```

---

## 8. 重试策略

### 策略比较

```
固定重试（朴素方式）：
  第 1 次尝试 t=0
  第 2 次尝试 t=5s
  第 3 次尝试 t=5s     -- 如果很多任务同时失败会产生惊群效应

指数退避：
  第 1 次尝试 t=0
  第 2 次尝试 t=2s      (base=2, multiplier=2^0 * 2 = 2)
  第 3 次尝试 t=6s      (2 + 2^1 * 2 = 6)
  第 4 次尝试 t=14s     (6 + 2^2 * 2 = 14)
  第 5 次尝试 t=30s     (14 + 2^3 * 2 = 30)
  ... 上限为 max_interval

指数退避 + 抖动（推荐）：
  第 N 次等待：min(max_interval, base * 2^(n-1)) * random(0.5, 1.5)
  将重试分散在时间上以避免惊群效应

时间线：
t=0s    [任务]--失败
t=2.3s  [任务]--失败    (2s * 抖动 1.15)
t=7.8s  [任务]--失败    (4s + 2.3s * 抖动 0.88)
t=19.2s [任务]--失败    (8s + 7.8s * 抖动 1.42)
t=MAX   [任务]--失败 --> DLQ（死信队列）
```

### 重试策略实现

```python
import random
import math

@dataclass
class RetryPolicy:
    max_attempts: int = 3
    initial_interval_sec: float = 1.0
    backoff_coefficient: float = 2.0
    max_interval_sec: float = 300.0   # 5 分钟
    jitter_factor: float = 0.2        # +/- 20% 抖动
    non_retryable_errors: list = None  # 绕过重试的错误类型

class RetryScheduler:
    def compute_next_retry_delay(self, policy: RetryPolicy, attempt: int) -> float:
        """返回下次重试前的延迟秒数。"""
        if attempt >= policy.max_attempts:
            return None  # 不再重试；发送到 DLQ

        # 指数退避
        backoff = policy.initial_interval_sec * (policy.backoff_coefficient ** (attempt - 1))

        # 上限为最大间隔
        backoff = min(backoff, policy.max_interval_sec)

        # 添加抖动：在 [backoff*(1-jitter), backoff*(1+jitter)] 范围内均匀随机
        jitter = backoff * policy.jitter_factor
        final_delay = backoff + random.uniform(-jitter, jitter)

        return max(0, final_delay)  # 确保非负

    def should_retry(self, policy: RetryPolicy, error: Exception, attempt: int) -> bool:
        if attempt >= policy.max_attempts:
            return False
        if policy.non_retryable_errors:
            for err_type in policy.non_retryable_errors:
                if isinstance(error, err_type):
                    return False
        return True
```

### 死信队列（DLQ）

```
任务在 max_attempts 次后失败
         |
         v
  +---------------+
  |      DLQ      |  -- 持久化到数据库中，包含完整错误上下文
  |               |
  | - task_id     |
  | - workflow_id |
  | - 错误日志     |
  | - 尝试次数     |
  | - 输入数据     |
  +-------+-------+
          |
          +---> 告警运维团队（PagerDuty / Slack）
          |
          +---> 手动重试界面（管理后台 UI）
          |
          +---> 自动分析：分类错误类型，
                跟踪每种任务类型的 DLQ 增长率
```

---

## 9. Cron 调度

### Cron 表达式解析

```
标准 5 字段 cron：
  * * * * *
  | | | | |
  | | | | +--- 星期几 (0=周日, 6=周六)
  | | | +----- 月份 (1-12)
  | | +------- 月中日 (1-31)
  | +--------- 小时 (0-23)
  +----------- 分钟 (0-59)

示例：
  "0 9 * * MON-FRI"    -- 周一到周五上午 9:00
  "*/15 * * * *"       -- 每 15 分钟
  "0 0 1 * *"          -- 每月 1 号午夜
  "@daily"             -- "0 0 * * *" 的别名
  "@hourly"            -- "0 * * * *" 的别名
```

### 调度器循环（Airflow 风格）

```python
class CronScheduler:
    def __init__(self, db, workflow_service, check_interval_sec=5):
        self.db = db
        self.workflow_service = workflow_service
        self.check_interval = check_interval_sec

    async def scheduler_loop(self):
        """主调度循环：仅在 leader 节点运行。"""
        while True:
            now = datetime.utcnow()

            # 1. 获取所有到期的调度
            due_schedules = await self.db.query("""
                SELECT * FROM schedules
                WHERE is_paused = FALSE
                  AND next_trigger_at <= $1
                ORDER BY next_trigger_at ASC
                LIMIT 1000
            """, now)

            for schedule in due_schedules:
                await self.trigger_schedule(schedule, now)

            # 2. 休眠到下次检查
            await asyncio.sleep(self.check_interval)

    async def trigger_schedule(self, schedule: dict, now: datetime):
        # 处理重叠策略
        if schedule["overlap_policy"] == "SKIP":
            running = await self.check_running_instance(schedule["id"])
            if running:
                # 跳过本次运行；仍然推进 next_trigger_at
                await self.advance_next_trigger(schedule, now)
                return

        # 启动 workflow
        await self.workflow_service.start_workflow(
            workflow_type=schedule["workflow_type"],
            workflow_id=f"{schedule['id']}-{now.isoformat()}",
            task_queue=schedule["task_queue"],
            input=schedule["workflow_input"],
        )

        # 推进下次触发时间
        await self.advance_next_trigger(schedule, now)

    async def advance_next_trigger(self, schedule: dict, fired_at: datetime):
        next_run = compute_next_run(
            schedule["cron_expression"],
            schedule["timezone"],
            after=fired_at
        )
        await self.db.execute("""
            UPDATE schedules
            SET last_triggered_at = $1,
                next_trigger_at = $2
            WHERE id = $3
        """, fired_at, next_run, schedule["id"])
```

### 时区处理

```python
from zoneinfo import ZoneInfo
from croniter import croniter
from datetime import datetime

def compute_next_run(cron_expr: str, timezone: str, after: datetime) -> datetime:
    tz = ZoneInfo(timezone)

    # 将 'after' 转换为本地时区供 croniter 使用（正确处理夏令时）
    after_local = after.astimezone(tz)

    cron = croniter(cron_expr, after_local)
    next_run_local = cron.get_next(datetime)

    # 转换回 UTC 进行存储
    return next_run_local.astimezone(ZoneInfo("UTC"))
```

### 错过调度的补偿

```
场景：调度器宕机 2 小时。错过了 8 次每小时的 cron 运行。

重叠策略选项：
  SKIP:          仅触发最近错过的一次运行（ETL 最常用）
  BUFFER:        将所有 8 次错过的运行排队（对长任务有风险）
  ALLOW:         立即触发所有错过的运行（真正的回填）
  CANCEL_OTHER:  取消当前正在运行的，触发最近错过的

补偿窗口：
  - 每个调度可配置（默认：1 小时）
  - 仅回填补偿窗口内的运行
  - 超出补偿窗口的运行被静默跳过

实现：
  调度器重启时：
    1. 对于每个 last_triggered_at < now 的调度：
    2. 计算 last_triggered_at 和 now 之间所有错过的触发时间
    3. 应用 overlap_policy 确定哪些需要触发
    4. 触发确定的集合（遵守 catchup_window）
    5. 将 next_trigger_at 推进到正确的未来时间
```

---

## 10. Worker 心跳与故障检测

### 心跳协议

```
Worker 生命周期：

  启动                       运行中                      关闭
     |                          |                           |
     v                          v                           v
  注册                     每 T 秒发送心跳              注销 + 排空
  {worker_id,              {worker_id,                 进行中的任务
   capabilities,            in_flight_tasks,
   max_concurrency,         current_load,
   task_types}              timestamp}
  到 Redis
     |                          |
     |                  如果心跳缺失
     |                  超过 3*T 秒：
     |                     -> Worker 被声明为死亡
     |                     -> 进行中的任务被回收
     |                     -> 任务重新入队
```

### 故障检测与任务回收

```python
class HeartbeatMonitor:
    HEARTBEAT_INTERVAL = 10    # worker 每 10s 发送一次
    TIMEOUT_MULTIPLIER = 3     # 30s 无响应后声明死亡

    def __init__(self, redis, db):
        self.redis = redis
        self.db = db

    async def monitor_loop(self):
        """在调度器节点上持续运行。"""
        while True:
            await self.detect_failed_workers()
            await asyncio.sleep(5)   # 每 5 秒检查一次

    async def detect_failed_workers(self):
        now = time.time()
        deadline = now - (self.HEARTBEAT_INTERVAL * self.TIMEOUT_MULTIPLIER)

        # 获取所有最后心跳早于截止时间的 worker
        failed_workers = self.redis.zrangebyscore(
            "worker:heartbeats",
            0,
            deadline
        )

        for worker_id_bytes in failed_workers:
            worker_id = worker_id_bytes.decode()
            await self.reclaim_worker_tasks(worker_id)
            self.redis.zrem("worker:heartbeats", worker_id)

    async def reclaim_worker_tasks(self, worker_id: str):
        # 查找分配给该 worker 且仍在 RUNNING 状态的所有任务
        stuck_tasks = await self.db.query("""
            SELECT id, workflow_run_id, task_queue, attempt, retry_policy
            FROM tasks
            WHERE worker_id = $1
              AND status = 'RUNNING'
        """, worker_id)

        for task in stuck_tasks:
            # 决定：重试还是失败
            retry_policy = task["retry_policy"]
            if task["attempt"] < retry_policy.get("max_attempts", 3):
                # 重新入队进行重试
                delay = compute_retry_delay(retry_policy, task["attempt"])
                await self.enqueue_task(task, delay)
                await self.db.execute("""
                    UPDATE tasks SET status = 'SCHEDULED', worker_id = NULL,
                    attempt = attempt + 1 WHERE id = $1
                """, task["id"])
            else:
                # 已达最大尝试次数，移到 DLQ
                await self.db.execute("""
                    UPDATE tasks SET status = 'FAILED',
                    error = 'Worker 死亡：已超过最大重试次数'
                    WHERE id = $1
                """, task["id"])
                await self.mark_workflow_failed(task["workflow_run_id"], task["id"])
```

---

## 11. 任务状态机

### 状态转换

```
                        +----------------------------+
                        |         PENDING            |
                        | (已创建，等待依赖)           |
                        +-----------+----------------+
                                    |
                         所有前置条件已满足
                                    |
                                    v
                        +----------------------------+
                        |        SCHEDULED           |
                        | (已入队到任务队列)           |
                        +-----------+----------------+
                                    |
                            worker 轮询到任务
                                    |
                                    v
                   +------------------------------+
                   |          RUNNING              |
                   |  (worker 执行中，发送          |
                   |   心跳)                       |
                   +---+-------+----------+--------+
                       |       |          |
           任务成功     |  任务失败       | 心跳超时
                        |       |        | 或 worker 崩溃
                        v       v        |
             +---------+   +--------+   |
             | SUCCESS |   | FAILED |   |
             +---------+   +----+---+   |
                                |       |
                      +---------v-------v---+
                      |    TIMED_OUT /       |
                      |    FAILED            |
                      +----------+-----------+
                                 |
                    attempt < max_attempts?
                    /                       \
                  是                         否
                   |                          |
                   v                          v
          +----------------+        +-------------------+
          |   SCHEDULED    |        |  DEAD_LETTER_QUEUE |
          | (带退避延迟     |        |  (终态，            |
          |  的重试)        |        |   已触发告警)       |
          +----------------+        +-------------------+

特殊状态：
  CANCELLED   -- workflow 被手动取消
  SKIPPED     -- 条件分支未执行（Airflow 风格）
  DEFERRED    -- 任务等待外部信号/审批
```

### 状态机实现

```python
from enum import Enum
from typing import Set

class TaskStatus(Enum):
    PENDING    = "PENDING"
    SCHEDULED  = "SCHEDULED"
    RUNNING    = "RUNNING"
    SUCCESS    = "SUCCESS"
    FAILED     = "FAILED"
    TIMED_OUT  = "TIMED_OUT"
    CANCELLED  = "CANCELLED"
    DEFERRED   = "DEFERRED"

# 有效转换：(从, 到)
VALID_TRANSITIONS: Set[tuple] = {
    (TaskStatus.PENDING,    TaskStatus.SCHEDULED),
    (TaskStatus.PENDING,    TaskStatus.CANCELLED),
    (TaskStatus.SCHEDULED,  TaskStatus.RUNNING),
    (TaskStatus.SCHEDULED,  TaskStatus.CANCELLED),
    (TaskStatus.RUNNING,    TaskStatus.SUCCESS),
    (TaskStatus.RUNNING,    TaskStatus.FAILED),
    (TaskStatus.RUNNING,    TaskStatus.TIMED_OUT),
    (TaskStatus.RUNNING,    TaskStatus.CANCELLED),
    (TaskStatus.RUNNING,    TaskStatus.DEFERRED),
    (TaskStatus.FAILED,     TaskStatus.SCHEDULED),  # 重试
    (TaskStatus.TIMED_OUT,  TaskStatus.SCHEDULED),  # 重试
    (TaskStatus.DEFERRED,   TaskStatus.SCHEDULED),  # 收到信号
}

def transition(current: TaskStatus, next_state: TaskStatus) -> TaskStatus:
    if (current, next_state) not in VALID_TRANSITIONS:
        raise ValueError(
            f"无效的状态转换：{current.value} -> {next_state.value}"
        )
    return next_state
```

---

## 12. 持久化执行（Temporal）

### Event Sourcing 模型

Temporal 的核心创新：workflow 通过**重放其事件历史**来重建。不直接存储 workflow 状态——只存储追加型的事件序列。

```
Workflow order-12345 的事件历史：

序号 | 事件类型                 | 属性
-----|-------------------------|------------------------------------
  1  | WORKFLOW_STARTED        | {input: {order_id: "12345"}}
  2  | TASK_SCHEDULED          | {task_type: "validate_order"}
  3  | TASK_STARTED            | {worker_id: "worker-7", attempt: 1}
  4  | TASK_COMPLETED          | {output: {valid: true}}
  5  | TASK_SCHEDULED          | {task_type: "charge_customer"}
  6  | TASK_SCHEDULED          | {task_type: "reserve_inventory"}
  7  | TASK_STARTED            | {worker_id: "worker-2", attempt: 1}
  8  | TASK_STARTED            | {worker_id: "worker-9", attempt: 1}
  9  | TASK_COMPLETED          | {output: {charge_id: "ch_abc"}}
 10  | TASK_COMPLETED          | {output: {reservation_id: "res_xyz"}}
 11  | TASK_SCHEDULED          | {task_type: "ship_order"}
 ...
```

### Workflow 重放机制

```
Worker 在事件 8 处崩溃（reserve_inventory 正在运行）：

  1. 新 worker 为 workflow order-12345 启动
  2. Temporal 获取完整的事件历史（事件 1-10）
  3. Worker 重放历史：
     - 确定性地重新执行 workflow 代码
     - 当代码执行到 "await execute_activity(validate_order)"：
       --> 历史显示 TASK_COMPLETED 在序号 4 --> 返回缓存的输出
     - 当代码执行到 "await gather(charge_customer, reserve_inventory)"：
       --> 历史显示两者都 COMPLETED（序号 9、10）--> 返回缓存的输出
     - 当代码执行到 "await execute_activity(ship_order)"：
       --> 历史中没有完成记录 --> 实际调度新任务
  4. 从中断处继续执行

关键约束：Workflow 代码必须是确定性的
  - 不能直接使用随机数
  - 不能直接调用 time.now()（使用 workflow.now() 代替，它使用事件时间戳）
  - 不能在 activity 之外进行外部调用
  - 非确定性 = 重放偏离 = workflow 损坏
```

### 代码变更的 Workflow 版本管理

```python
# 问题：已部署的 workflow 不能在执行过程中更改代码
# 解决方案：使用 workflow.get_version() 安全地分支

@workflow.defn
class OrderFulfillmentWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # v1 代码始终使用 validate_order_v1
        # v2 添加了欺诈检查步骤

        version = workflow.get_version(
            "add-fraud-check",        # 变更 ID（不可变标签）
            min_supported=1,
            max_supported=2
        )

        if version == 1:
            # 旧代码路径（用于此次部署前启动的 workflow）
            validated = await workflow.execute_activity(validate_order_v1, order)
        else:
            # 新代码路径（version 2+）
            await workflow.execute_activity(fraud_check, order)
            validated = await workflow.execute_activity(validate_order_v2, order)

        # 继续 workflow 的其余部分...
```

---

## 13. Saga 模式实现分布式事务

### 问题：没有 2PC 的多服务 workflow

```
订单需要：
  1. 向支付服务收费    （外部服务）
  2. 向库存服务预留    （外部服务）
  3. 向物流服务下单    （外部服务）

如果步骤 3 失败，我们必须撤销步骤 1 和 2。
跨微服务无法使用两阶段提交。
解决方案：带补偿事务的 SAGA。
```

### 基于编排的 Saga

```
  OrderService          PaymentService        InventoryService       ShippingService
      |                       |                      |                     |
      |--order.created------->|                      |                     |
      |                       |--payment.processed-->|                     |
      |                       |                      |--inventory.reserved>|
      |                       |                      |                  失败
      |                       |                      |<-shipping.failed----|
      |                       |<--inventory.released-|
      |                       |<--payment.refunded---|
      |<---order.failed-------|
```

### 基于协调器的 Saga（推荐与 Temporal 配合使用）

```python
@workflow.defn
class OrderSagaWorkflow:
    @workflow.run
    async def run(self, order: OrderInput) -> OrderResult:
        # 跟踪已完成步骤以便补偿
        completed_steps = []

        try:
            # 步骤 1：收取付款
            charge = await workflow.execute_activity(
                charge_customer,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("charge", charge))

            # 步骤 2：预留库存
            reservation = await workflow.execute_activity(
                reserve_inventory,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("reservation", reservation))

            # 步骤 3：预订物流
            shipping = await workflow.execute_activity(
                book_shipping,
                order,
                start_to_close_timeout=timedelta(seconds=30)
            )
            completed_steps.append(("shipping", shipping))

            return OrderResult(status="completed", shipping=shipping)

        except Exception as e:
            # 以逆序运行补偿事务
            await self.compensate(completed_steps, order)
            raise

    async def compensate(self, completed_steps: list, order: OrderInput):
        for step_name, step_result in reversed(completed_steps):
            if step_name == "shipping":
                await workflow.execute_activity(
                    cancel_shipping, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)  # 必须成功
                )
            elif step_name == "reservation":
                await workflow.execute_activity(
                    release_inventory, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)
                )
            elif step_name == "charge":
                await workflow.execute_activity(
                    refund_payment, step_result,
                    retry_policy=RetryPolicy(max_attempts=10)
                )
```

---

## 14. 限流与背压

### 任务执行限流

```
+-----------------------------------------------------------------------+
|                    限流层                                               |
+-----------------------------------------------------------------------+

第 1 层：Namespace 级别（每个租户的全局配额）
  - 每个 namespace 的最大任务数/秒（在 namespace 表中配置）
  - 在 API Gateway 使用令牌桶算法强制执行

第 2 层：任务队列级别
  - 每个队列的最大并发任务数（防止队列饥饿）
  - 队列深度阈值触发 worker 自动扩展

第 3 层：Worker 级别
  - 每个 worker 的最大并发 goroutine/线程
  - 背压：worker 达到容量上限时停止轮询

第 4 层：下游依赖
  - Activity worker 对外部 API 调用进行限流
  - 例如，Stripe API：每个账户 100 请求/秒
```

### 令牌桶限流器（按 Namespace）

```python
class NamespaceRateLimiter:
    def __init__(self, redis, namespace_id: str, max_tasks_per_sec: int):
        self.redis = redis
        self.key = f"ratelimit:{namespace_id}"
        self.max_per_sec = max_tasks_per_sec

    def allow_task(self) -> bool:
        """如果允许任务返回 True，如果被限流返回 False。"""
        now = time.time()
        window_start = int(now)  # 1 秒滑动窗口

        pipe = self.redis.pipeline()
        pipe.zadd(self.key, {f"{now}:{random.random()}": now})
        pipe.zremrangebyscore(self.key, 0, now - 1)  # 移除旧条目
        pipe.zcard(self.key)
        pipe.expire(self.key, 2)
        results = pipe.execute()

        count = results[2]
        return count <= self.max_per_sec
```

### 通过队列深度监控实现背压

```
队列深度    |  动作
-------------|--------------------------------------------------
0-100        |  正常：worker 自由轮询
101-500      |  警告：触发 worker 扩容
501-1000     |  高负载：以 429 拒绝新任务提交
1001+        |  严重：启动断路器，告警运维
             |  新 workflow 排队到溢出缓冲区

自动扩展器监控指标：
  queue_depth > 200 持续 60s  --> worker 扩容 25%
  queue_depth < 10 持续 300s  --> worker 缩容 10%
  （每个队列最小=2，最大=100 个 worker）
```

---

## 15. 多租户与公平调度

### Namespace 隔离

```
+------------------------------------------------------------------+
|                     多租户调度器                                     |
+------------------------------------------------------------------+

  Namespace A (prod)          Namespace B (staging)       Namespace C (batch)
  max_tasks/sec: 1000         max_tasks/sec: 100           max_tasks/sec: 500
  max_concurrent_wf: 10000    max_concurrent_wf: 1000      max_concurrent_wf: 5000
  |                           |                             |
  v                           v                             v
+----------------+         +----------------+           +----------------+
|  任务队列 A     |         |  任务队列 B     |           |  任务队列 C     |
|  (专用)         |         |  (专用)         |           |  (专用)         |
+----------------+         +----------------+           +----------------+
  |                           |                             |
  +---------------------------+-----------------------------+
                              |
                   +---------------------+
                   |  公平调度器           |
                   |  (按 namespace       |
                   |   加权轮询)           |
                   +---------------------+
                              |
                   +---------------------+
                   |   共享 Worker        |
                   |   池（经济模式）       |
                   +---------------------+
```

### 公平调度算法（加权公平队列）

```python
class FairScheduler:
    """
    跨 namespace 的加权公平队列。
    防止某个嘈杂租户饿死其他租户。
    """
    def __init__(self, namespaces: list[dict]):
        # namespace: {id, name, weight, max_tasks_per_sec}
        self.queues = {ns["id"]: [] for ns in namespaces}
        self.weights = {ns["id"]: ns["weight"] for ns in namespaces}
        self.virtual_time = {ns["id"]: 0.0 for ns in namespaces}

    def enqueue(self, namespace_id: str, task: dict):
        """将任务添加到 namespace 队列，附带虚拟完成时间。"""
        w = self.weights[namespace_id]
        # 虚拟完成时间 = 虚拟开始时间 + 任务大小 / 权重
        vft = self.virtual_time[namespace_id] + (1.0 / w)
        self.queues[namespace_id].append((vft, task))
        self.virtual_time[namespace_id] = vft

    def dequeue(self) -> dict | None:
        """
        从所有非空 namespace 队列中选择虚拟完成时间最小的任务。
        """
        candidates = []
        for ns_id, queue in self.queues.items():
            if queue:
                candidates.append((queue[0][0], ns_id))  # (vft, ns_id)

        if not candidates:
            return None

        # 选择虚拟完成时间最小的 namespace
        _, chosen_ns = min(candidates)
        _, task = self.queues[chosen_ns].pop(0)
        return task
```

---

## 16. 扩展策略

### 分区策略

```
+------------------------------------------------------------------+
|                    水平扩展                                        |
+------------------------------------------------------------------+

调度器服务：
  - 规模：3-5 个节点（通过 leader 选举实现主备高可用）
  - 分区：leader 处理所有调度；备用节点为热备
  - 替代方案：按 namespace_id 哈希分区实现 active-active

任务队列（Redis Cluster）：
  - 分区：每个 {namespace, task_type} 一个队列
  - Redis Cluster 包含 6 个分片（3 个主节点 + 3 个副本）
  - 每个分片处理队列的子集（一致性哈希）

Worker：
  - 规模：按任务队列水平扩展
  - k8s HPA：基于 queue_depth 指标扩展（通过 KEDA 自定义指标）
  - 目标：保持每个 worker 的 queue_depth < 100
  - 非关键批处理工作负载使用 Spot 实例

数据库（PostgreSQL）：
  - 主节点：处理所有写入
  - 只读副本：服务状态查询（最终一致性可接受）
  - 按 (namespace_id, started_at) 对 workflow_executions 和 tasks 表分区
  - 保留期后将已完成的旧运行归档到冷存储（S3）

事件历史（Temporal 模型）：
  - 按 workflow_id 分片（Temporal Server 默认 128 个分片）
  - 每个分片拥有 workflow 的子集及其事件历史
  - 使用 Cassandra 或 CockroachDB 进行多区域历史存储
```

### 使用 KEDA 自动扩展 Worker

```yaml
# k8s KEDA ScaledObject 用于 worker 自动扩展
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-fulfillment-workers
spec:
  scaleTargetRef:
    name: order-fulfillment-worker
  minReplicaCount: 2
  maxReplicaCount: 50
  cooldownPeriod: 60
  triggers:
    - type: redis
      metadata:
        address: redis-cluster:6379
        listName: 'tasks:order-fulfillment:normal'
        listLength: '10' # 当每个副本 > 10 个任务时扩容
```

### 数据库分区

```sql
-- 按月对 workflow_executions 分区以便高效归档
CREATE TABLE workflow_executions_2026_03
  PARTITION OF workflow_executions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 自动归档超过 retention_days 的已完成运行
CREATE OR REPLACE PROCEDURE archive_old_executions()
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workflow_executions_archive
  SELECT we.* FROM workflow_executions we
  JOIN namespaces n ON we.namespace_id = n.id
  WHERE we.status IN ('SUCCESS', 'FAILED', 'CANCELLED')
    AND we.closed_at < NOW() - (n.retention_days || ' days')::interval;

  DELETE FROM workflow_executions we
  USING namespaces n
  WHERE we.namespace_id = n.id
    AND we.status IN ('SUCCESS', 'FAILED', 'CANCELLED')
    AND we.closed_at < NOW() - (n.retention_days || ' days')::interval;
END;
$$;
```

---

## 17. 对比：自建 vs 采购

| 维度                    | 自建                   | Temporal（托管）                | Airflow（自托管）     | Celery       |
| ----------------------- | ---------------------- | ------------------------------- | --------------------- | ------------ |
| **搭建时间**            | 6-12 个月              | 数小时（Temporal Cloud）        | 1-2 周                | 数天         |
| **运维成本**            | 高（需要基础设施团队） | 中等（SaaS 费用）               | 高（基础设施 + 运维） | 低-中等      |
| **精确一次**            | 必须自行构建           | 内置                            | 需要手动实现          | 不支持       |
| **持久化执行**          | 实现复杂               | 核心功能                        | 不支持                | 不支持       |
| **长时间运行 workflow** | 可能                   | 优秀（可达数年）                | 差                    | 差           |
| **可视化**              | 需自建                 | Temporal Web UI                 | Airflow UI            | Flower       |
| **大规模成本**          | 初期高，长期较低       | ~$0.25/百万 workflow 操作       | 基础设施成本          | 非常低       |
| **DAG/ETL workflow**    | 需自建                 | 可行但代码冗长                  | 优秀                  | 有限         |
| **微服务编排**          | 需自建                 | 优秀                            | 不太适合              | 有限         |
| **多语言 worker**       | 需自建                 | Go、Java、Python、TS、.NET、PHP | 仅 Python             | 仅 Python    |
| **适用场景**            | 独特需求，需要完全控制 | 微服务 workflow，高可靠性       | 批处理 ETL，数据管道  | 简单异步任务 |

---

## 18. 权衡取舍

### 数据库驱动 vs 队列驱动调度

```
+----------------------------------+------------------------------------+
|  数据库驱动（轮询）               |  队列驱动（推送）                    |
+----------------------------------+------------------------------------+
|  优点：                          |  优点：                              |
|  - 强一致性                      |  - 低延迟分发                        |
|  - 易于查询/审计                  |  - 高吞吐量                          |
|  - 通过数据库锁实现精确一次        |  - 与数据库解耦                      |
|  - 架构更简单                    |  - 天然的背压机制                     |
+----------------------------------+------------------------------------+
|  缺点：                          |  缺点：                              |
|  - 数据库轮询增加负载              |  - 精确一次保证更难                   |
|  - 延迟：轮询间隔                 |  - Broker 故障可能导致消息丢失        |
|  - 高规模时的瓶颈                 |  - 死信处理更复杂                     |
+----------------------------------+------------------------------------+
|  适用于：< 1K 任务/秒,           |  适用于：> 1K 任务/秒,              |
|  需要强一致性                    |  对延迟敏感                          |
+----------------------------------+------------------------------------+
```

### Workflow-as-Code vs DAG-as-Config

| 方面              | Workflow-as-Code (Temporal)  | DAG-as-Config (Airflow)  |
| ----------------- | ---------------------------- | ------------------------ |
| **灵活性**        | 完整编程语言能力             | 受限于 DAG 操作符        |
| **测试**          | 使用标准工具进行单元测试     | 单元测试更困难           |
| **学习曲线**      | 较高（新的编程模型）         | 较低（Python 配置）      |
| **动态 workflow** | 原生支持（循环、条件、递归） | 有限                     |
| **版本管理**      | 内置 workflow 版本管理 API   | 手动管理（DAG 文件管理） |
| **确定性要求**    | 严格（基于重放）             | 无要求                   |

### 关键设计权衡

| 决策         | 选项 A            | 选项 B                 | 建议                                                    |
| ------------ | ----------------- | ---------------------- | ------------------------------------------------------- |
| 任务队列后端 | Redis（更低延迟） | Kafka（更高持久性）    | 任务 < 1MB 用 Redis；事件驱动触发用 Kafka               |
| 调度器高可用 | 单 leader（简单） | 分片 active-active     | 单 leader + 快速故障转移适用于 < 100K 调度              |
| 状态存储     | PostgreSQL (ACID) | Cassandra（可扩展）    | 5 万并发 workflow 以内用 PostgreSQL；超过后用 Cassandra |
| Worker 轮询  | 短轮询（1s）      | 长轮询（20s）          | 长轮询：降低 20 倍数据库负载                            |
| 历史存储     | 关系型数据库      | 追加型日志（Kafka/S3） | Temporal 风格重放使用追加型日志                         |

---

## 19. 常见面试追问

### 问：如何防止任务重复执行？

**答：** 三层防御：

1. **幂等键**：每个任务都有唯一的 `task_token`。Worker 在执行前检查是否已有 `SUCCESS` 记录。
2. **数据库约束**：`UNIQUE(namespace_id, workflow_id)` 防止重复启动 workflow。
3. **乐观锁**：原子性更新任务状态：`UPDATE tasks SET status='RUNNING' WHERE id=$1 AND status='SCHEDULED'`。如果更新 0 行，说明另一个 worker 已认领。

### 问：当需要更改 workflow 代码时，Temporal 如何处理 workflow 版本管理？

**答：** Temporal 提供 `workflow.get_version(changeId, minSupported, maxSupported)`。正在运行的 workflow 正在重放其历史——你不能在重放过程中更改代码路径。版本管理 API 允许你分支：旧的进行中 workflow 走旧代码路径（version 1），新 workflow 走新代码路径（version 2）。在所有 v1 workflow 完成后，移除 v1 分支。

### 问：如何处理执行时间超出预期的任务？

**答：** 三种机制：

1. **心跳延期**：Worker 发送周期性心跳来延长任务截止时间。如果心跳停止，任务在 `heartbeat_timeout` 后超时。
2. **执行超时**：总执行时间的硬上限；任务被终止后重试或标记为失败。
3. **异步任务**：对于非常耗时的操作，使用异步任务模式——worker 立即返回并附带回调 URL，外部系统完成后回调（Temporal 的 `wait_for_signal`）。

### 问：如何扩展到 100K 任务/秒？

**答：**

- **按 `(task_type, namespace)` 分区任务队列**——每个队列独立扩展。
- **按 workflow namespace 或 ID 哈希范围分片调度器**。
- **此规模下使用 Kafka 代替 Redis** 作为任务队列（Kafka 分区消费者 = 专用 worker 组）。
- **分离热路径和冷路径**：短生命周期任务使用内存队列；长时间运行 workflow 使用数据库支持的状态。
- **使用 KEDA 水平扩展 worker**，基于队列深度指标。

### 问：如何实现 workflow 搜索/可见性？

**答：** 双写模式：

1. 所有 workflow 状态变更写入 **PostgreSQL**（真实数据源）。
2. 异步流（Debezium CDC）将 workflow 属性索引到 **Elasticsearch**。
3. 搜索 API 查询 Elasticsearch 进行过滤，如 `status = FAILED AND started_at > 7 天前`。
4. 对于 Temporal Cloud：他们原生使用 Elasticsearch 实现 workflow 可见性。
5. 在 workflow_executions 中添加 `search_attributes` JSONB 列用于每个 workflow 的自定义标签（例如 `{"order_id": "12345", "customer_tier": "premium"}`）。

### 问：如何处理 Airflow 调度器的单点故障？

**答：**

- **Airflow 2.6+ 高可用**：多个调度器进程使用分布式锁（Postgres 咨询锁或数据库行锁）来协调，互不干扰。
- **Leader 选举**：每个调度器尝试获取每个 DAG 的锁。第一个获取锁的运行该 DAG 的调度循环。
- **数据库作为协调层**：由于 Airflow 的调度器循环查询数据库来发现待运行的任务，多个调度器可以同时运行——它们使用 `SELECT FOR UPDATE SKIP LOCKED` 来认领 DagRun 而不会重复处理。
- **故障转移时间**：< 30 秒（备用调度器的下一次数据库轮询周期接管工作）。

### 问：Temporal 的 workflow 历史与传统事件日志有什么区别？

**答：** Temporal 的历史是一个**确定性重放日志**——不仅仅是审计日志。关键区别：

- 它是 **workflow 状态的真实数据源**（不是二级审计日志）。
- 它实现**精确重放**：给定历史，你可以在任何时间点重建确切的 workflow 状态。
- 它同时捕获**命令和响应**：`TASK_SCHEDULED`、`TASK_STARTED`、`TASK_COMPLETED` 以及完整的输入/输出。
- 它支持**时间旅行调试**：重放历史到事件 N 来调试发生了什么。
- 大小问题：大型历史（>50K 事件）会减慢重放速度。对于长时间运行的 workflow，使用 `continueAsNew` 定期重置历史。

### 问：如何在租户之间实现公平调度而不产生饥饿？

**答：** **加权公平队列（WFQ）**：

- 每个 namespace 有一个与其 SLA 等级成比例的 `weight`（例如，付费=10，免费=1）。
- 跟踪每个 namespace 的 `virtual finish time`：`vft += task_cost / weight`。
- 始终选择所有 namespace 中 `vft` 最小的任务。
- 这在数学上保证：在任何时间间隔内，每个 namespace 获得的任务与其权重成正比，且没有 namespace 会被饿死（即使低权重的免费层也始终在进展）。
- 此外，强制执行硬限流（每个 namespace 的令牌桶）作为上限。

### 问：Celery 与 Temporal 在微服务编排方面相比如何？

**答：** Celery 是任务队列，不是 workflow 编排器：

- **Celery**：入队单个任务；使用 `chains` 和 `chords` 实现简单排序。没有原生 saga 支持，没有持久化执行，除非仔细配置 `acks_late=True` 和幂等任务，否则是尽力交付。
- **Temporal**：以 workflow 为中心；原生处理多步编排、错误传播、补偿和长时间运行状态。
- 对于带分布式事务的微服务编排，Temporal 远优于 Celery。Celery 适合简单的即发即忘异步任务，如发送邮件或生成缩略图。

### 问：如何实现不触发重复运行的分布式 cron？

**答：**

1. **Leader 选举**：只有 leader 节点触发 cron。备用节点处于空闲状态但准备在 5-10 秒内通过 etcd watch 接管。
2. **幂等触发记录**：在启动 workflow 之前，向 `schedule_runs` 表插入带有 `UNIQUE(schedule_id, scheduled_at)` 的记录。如果插入失败（重复），则跳过。
3. **Workflow ID 包含时间戳**：`workflow_id = f"{schedule_id}-{scheduled_at_epoch}"`。由于 `workflow_id` 在每个 namespace 中是唯一的，尝试启动重复的是空操作。
4. **分布式锁**：使用 Redis `SET NX EX`（不存在则设置，带过期时间）作为每次触发的互斥锁。只有获取到锁的进程才触发。
