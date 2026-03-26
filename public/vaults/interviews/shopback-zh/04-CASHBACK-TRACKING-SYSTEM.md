# 系统设计：返现追踪与归因系统

> 这是 ShopBack 的**核心业务**。出现概率最高的系统设计题目。

## 1. 需求

### 功能性需求

- 追踪用户在商家联盟链接上的点击
- 将购买归因到发起点击
- 根据商家佣金率计算正确的返现
- 处理返现生命周期：待确认 → 已确认 → 已支付
- 支持多种归因模型（最后点击、首次点击）

### 非功能性需求

- **准确性**：> 99.5% 归因准确率（涉及金钱）
- **延迟**：点击追踪 < 50ms（不能拖慢重定向）
- **规模**：每天 1000 万+ 次点击，50 万+ 笔交易
- **可用性**：99.9% 正常运行时间
- **持久性**：金融交易零数据丢失

### 不在范围内

- 支付处理（独立系统）
- 商家入驻
- 用户认证

---

## 2. 高层架构

```
┌──────────┐   点击     ┌──────────────┐   重定向    ┌──────────┐
│   用户   │──────────→│  点击追踪    │───────────→│   商家   │
│ 浏览器/  │           │    服务      │            │   网站   │
│   App    │           └──────┬───────┘            └────┬─────┘
└──────────┘                  │                         │
                              │ 存储点击事件             │ 购买
                              ▼                         │ 回调
                     ┌────────────────┐                 │
                     │   事件总线     │                 │
                     │   (Kafka)      │◄────────────────┘
                     └───────┬────────┘        (S2S 回传)
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  归因      │  │  返现      │  │  分析      │
     │  引擎      │  │  计算器    │  │  服务      │
     └─────┬──────┘  └─────┬──────┘  └────────────┘
           │               │
           ▼               ▼
     ┌────────────────────────┐
     │     返现数据库         │
     │  (Aurora PostgreSQL)   │
     └────────────────────────┘
```

---

## 3. 核心组件

### 3.1 点击追踪服务

捕获用户在联盟链接上的每次点击。

```
GET /redirect?merchant_id=123&offer_id=456&user_id=789

响应：302 重定向到带追踪参数的商家 URL
```

**数据模型 - 点击事件：**

```sql
CREATE TABLE click_events (
    click_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL,
    merchant_id     INT NOT NULL,
    offer_id        INT,
    market          VARCHAR(2) NOT NULL,  -- 'sg', 'my' 等
    source          VARCHAR(20),          -- 'web', 'app', 'extension'
    device_type     VARCHAR(10),          -- 'mobile', 'desktop'
    ip_address      INET,
    user_agent      TEXT,
    referrer_url    TEXT,
    redirect_url    TEXT NOT NULL,
    sub_id          VARCHAR(255),         -- 发布商子追踪
    clicked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL  -- 归因窗口结束时间
);

-- 按月分区以提升性能
-- 在 (user_id, merchant_id, clicked_at) 上建索引用于归因查询
CREATE INDEX idx_click_attribution
    ON click_events (user_id, merchant_id, clicked_at DESC);
```

**设计决策：**

- 先写入 Kafka，立即响应重定向（< 50ms）
- 异步消费者写入数据库
- UUID click_id 嵌入联盟 URL 用于直接归因
- 基于 TTL 的过期（通常 7-30 天，取决于商家）

### 3.2 购买回调处理器

接收来自商家/联盟网络的购买通知。

**两种接入方式：**

#### 方式 A：服务器到服务器（S2S）回传

```
POST /api/v1/conversions
{
    "click_id": "来自重定向的uuid",
    "merchant_id": 123,
    "order_id": "M-ORD-456789",
    "order_amount": 150.00,
    "currency": "SGD",
    "commission_amount": 7.50,
    "items": [
        {"sku": "ABC123", "name": "耳机", "price": 150.00, "quantity": 1}
    ],
    "timestamp": "2026-03-16T10:30:00Z"
}
```

#### 方式 B：联盟网络批量处理

```
// 来自 impact.com、Rakuten 等的每日/每小时批量文件
// CSV/JSON 格式的交易详情
// 由批量接入管道处理
```

### 3.3 归因引擎

使用多种策略将购买匹配到点击：

```
┌─────────────────────────────────────────────────┐
│              归因优先级                           │
│                                                  │
│  1. 直接匹配（回传中的 click_id）         ◄ 最佳│
│  2. 用户 + 商家 + 时间窗口                       │
│  3. 设备指纹 + 商家 + 时间                       │
│  4. 基于 Cookie（备选，逐渐减少）         ◄ 最差│
└─────────────────────────────────────────────────┘
```

```typescript
interface AttributionResult {
  clickId: string;
  userId: number;
  merchantId: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'direct' | 'user_merchant' | 'fingerprint' | 'cookie';
}

// 归因逻辑伪代码：
// 1. 如果存在 click_id → 直接匹配（置信度：高）
// 2. 查找点击 WHERE user_id = X AND merchant_id = Y
//    AND clicked_at BETWEEN (purchase_time - window) AND purchase_time
//    ORDER BY clicked_at DESC LIMIT 1
// 3. 有争议的归因进入人工审核队列
```

### 3.4 返现计算器

```sql
CREATE TABLE cashback_transactions (
    txn_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL,
    click_id        UUID REFERENCES click_events(click_id),
    merchant_id     INT NOT NULL,
    order_id        VARCHAR(255) NOT NULL,
    order_amount    DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,   -- 如 0.0500 = 5%
    commission_amt  DECIMAL(12,2) NOT NULL,
    cashback_rate   DECIMAL(5,4) NOT NULL,   -- ShopBack 的分成比例
    cashback_amt    DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    market          VARCHAR(2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      -- pending → confirmed → redeemable → paid
      -- pending → rejected（商家取消订单）
    status_history  JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,

    CONSTRAINT unique_order UNIQUE (merchant_id, order_id)
);

CREATE INDEX idx_cashback_user ON cashback_transactions (user_id, status);
CREATE INDEX idx_cashback_status ON cashback_transactions (status, created_at);
```

**返现生命周期：**

```
点击 → 检测到购买 → 待确认（展示给用户）
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
          已确认                    已拒绝
       （商家验证通过）        （订单取消/退货）
              │
              ▼
          可提现
       （等待期已过）
              │
              ▼
          已支付
       （转入用户钱包）
```

**典型时间线：**

- 待确认 → 已确认：30-90 天（商家验证期）
- 已确认 → 可提现：即时
- 可提现 → 已支付：用户发起提现请求时

---

## 4. 扩展性考虑

### 读多写少模式

- 点击：每天 1000 万次写入，最少读取
- 返现状态：每天 50 万次写入，数百万次读取（用户查看状态）
- **解决方案**：写入主库，从副本读取。Redis 缓存活跃返现。

```
┌──────────┐   写入    ┌──────────┐   复制      ┌──────────┐
│  点击    │────────→│  主库    │───────────→│  副本    │◄── 读取
│  服务    │         │          │            │          │
└──────────┘         └──────────┘            └──────────┘
                                                   │
                                              ┌────┴────┐
                                              │  Redis  │◄── 热数据
                                              │  缓存   │
                                              └─────────┘
```

### 多市场

- 按市场分区数据以实现隔离
- 靠近用户的区域读副本
- 货币转换在展示层处理

### 幂等性

- 关键：同一笔购买回调收到两次不能产生双重返现
- 使用 `(merchant_id, order_id)` 作为幂等键
- Kafka 消费者尽可能使用精确一次语义

### 故障处理

- 点击追踪：发射后不管，写入 Kafka（Kafka 不可用时本地缓存）
- 归因：指数退避重试，DLQ 用于人工审核
- 返现计算：使用 Saga 模式和补偿事务

---

## 5. 关键权衡讨论

| 决策             | 选项 A                     | 选项 B          | ShopBack 可能的选择                            |
| ---------------- | -------------------------- | --------------- | ---------------------------------------------- |
| 归因窗口         | 短（7 天）                 | 长（30 天）     | 按商家配置                                     |
| 点击存储         | 仅热数据（30 天）          | 全部归档        | 热数据 + S3 归档                               |
| 一致性模型       | 强一致（无重复返现）       | 最终一致（更快）| 返现用强一致，分析用最终一致                   |
| S2S 与 Cookie    | 服务器到服务器             | 基于 Cookie     | 优先 S2S（隐私变化）                           |
| 实时与批量       | 流处理                     | 批处理          | 混合：S2S 用流处理，网络文件用批处理           |

---

## 6. 监控与告警

| 指标               | 告警阈值    | 原因                     |
| ------------------ | ----------- | ------------------------ |
| 归因率             | < 95%       | 追踪可能出故障           |
| 点击延迟 p99       | > 100ms     | 用户体验下降             |
| 重复返现率         | > 0.1%      | 资金损失                 |
| 待确认返现时长     | > 120 天    | 商家集成问题             |
| DLQ 深度           | > 1000      | 处理失败                 |
