# 系统设计：高流量优惠与促销平台

> ShopBack 的优惠页面是主要的流量驱动器，尤其是在双十一、黑色星期五和网络星期一等活动期间。

## 1. 需求

### 功能性需求

- 商家创建带有返现率、有效期和条款的优惠/促销活动
- 用户按类别、商家和市场浏览、搜索和筛选优惠
- 带倒计时和限量的精选/限时抢购
- 个性化优惠推荐
- 优惠提醒推送通知

### 非功能性需求

- **低延迟**：优惠页面加载 < 200ms（API 响应）
- **高可用性**：促销活动期间 99.99%
- **规模**：限时抢购期间 10 万+ 并发用户（正常的 10 倍）
- **一致性**：优惠库存（限量）必须准确
- **新鲜度**：新优惠 30 秒内可见

### 不在范围内

- 返现追踪（独立系统）
- 支付处理

---

## 2. 高层架构

```
┌─────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│  商家   │────→│  管理    │────→│    优惠      │────→│  事件    │
│  门户   │     │  API     │     │    服务      │     │  总线    │
└─────────┘     └──────────┘     └──────┬───────┘     └────┬─────┘
                                        │                   │
                                        ▼                   ▼
                                 ┌────────────┐     ┌────────────┐
                                 │  优惠数据库│     │ 缓存       │
                                 │ (Postgres) │     │ 失效器     │
                                 └────────────┘     └─────┬──────┘
                                                          │
┌─────────┐     ┌──────────┐     ┌──────────────┐        │
│  用户   │────→│  CDN /   │────→│    优惠      │◄───────┘
│ App/Web │     │  网关    │     │   读取 API   │
└─────────┘     └──────────┘     └──────┬───────┘
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                        ┌────────┐ ┌────────┐ ┌────────┐
                        │ Redis  │ │ 搜索   │ │ 推荐   │
                        │ 缓存   │ │ (ES)   │ │ 引擎   │
                        └────────┘ └────────┘ └────────┘
```

---

## 3. 核心组件

### 3.1 数据模型

```sql
-- 商家
CREATE TABLE merchants (
    merchant_id     SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    logo_url        TEXT,
    base_cashback   DECIMAL(5,2) DEFAULT 0,  -- 默认返现百分比
    markets         VARCHAR(2)[] NOT NULL,     -- ['sg', 'my', 'id']
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 优惠 / 促销
CREATE TABLE deals (
    deal_id         SERIAL PRIMARY KEY,
    merchant_id     INT REFERENCES merchants(merchant_id),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    deal_type       VARCHAR(20) NOT NULL,
      -- 'cashback_boost', 'coupon', 'flash_sale', 'exclusive'
    cashback_rate   DECIMAL(5,2),            -- 加码返现百分比
    coupon_code     VARCHAR(50),
    discount_value  DECIMAL(10,2),
    discount_type   VARCHAR(10),             -- 'percentage', 'fixed'
    min_spend       DECIMAL(10,2) DEFAULT 0,
    max_discount    DECIMAL(10,2),

    -- 库存（限时抢购用）
    total_quantity  INT,                     -- NULL = 无限量
    claimed_count   INT DEFAULT 0,

    -- 定向
    markets         VARCHAR(2)[] NOT NULL,
    categories      VARCHAR(50)[] DEFAULT '{}',

    -- 排期
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    featured        BOOLEAN DEFAULT FALSE,
    priority        INT DEFAULT 0,           -- 数值越高越显眼

    -- 状态
    status          VARCHAR(20) DEFAULT 'draft',
      -- draft → scheduled → active → expired / sold_out

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_active ON deals (status, markets, starts_at, ends_at)
    WHERE status = 'active';
CREATE INDEX idx_deals_merchant ON deals (merchant_id, status);
CREATE INDEX idx_deals_featured ON deals (featured, priority DESC)
    WHERE featured = TRUE AND status = 'active';

-- 优惠分类（用于浏览）
CREATE TABLE categories (
    category_id     SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    parent_id       INT REFERENCES categories(category_id),
    display_order   INT DEFAULT 0
);
```

### 3.2 优惠读取 API

```
GET /api/v1/deals?market=sg&category=electronics&sort=popular&page=1

响应：
{
  "deals": [...],
  "meta": { "total": 1250, "page": 1, "limit": 20 }
}
```

**缓存策略（性能关键）：**

```
请求流程：
                                    ┌─────────┐
用户 ──→ CDN（静态资源）──→        │ API     │
                                    │ 网关    │
                                    └────┬────┘
                                         │
                                    ┌────┴────┐
                              是    │ Redis   │  否（缓存未命中）
                           ◄────── │ 缓存？  │ ──────────────→ 数据库
                                    └─────────┘
                                                   │
                                              写入 Redis
                                              （TTL：优惠列表 30 秒）
                                              （TTL：优惠详情 5 分钟）
```

**缓存键：**

```
deals:sg:electronics:popular:1  → 分页优惠列表
deal:12345                      → 单个优惠详情
deals:sg:featured               → 市场精选优惠
deals:sg:flash:active           → 进行中的限时抢购
merchant:123:deals              → 商家所有优惠
```

### 3.3 限时抢购处理

限时抢购因库存有限和流量激增需要特殊处理。

```
┌─────────┐   领取     ┌──────────────┐   递减      ┌─────────┐
│  用户   │──────────→│  限时抢购    │───────────→│  Redis  │
│         │           │    服务      │            │  计数器 │
│         │◄──────────│              │◄───────────│         │
└─────────┘   结果    └──────┬───────┘   剩余量   └─────────┘
                              │
                         异步写入
                              │
                              ▼
                       ┌────────────┐
                       │   数据库   │（事实来源）
                       └────────────┘
```

**Redis 原子计数器：**

```
-- 领取限时优惠
DECR flash:deal:12345:remaining
-- 如果结果 >= 0：领取成功
-- 如果结果 < 0：已售罄（INCR 恢复，返回错误）
```

**竞态条件预防：**

```lua
-- Redis Lua 脚本实现原子领取
local remaining = redis.call('GET', KEYS[1])
if tonumber(remaining) > 0 then
    redis.call('DECR', KEYS[1])
    return 1  -- 成功
else
    return 0  -- 已售罄
end
```

### 3.4 搜索与发现

```
┌─────────┐   查询     ┌──────────────┐
│  用户   │──────────→│ Elasticsearch│
│         │◄──────────│              │
└─────────┘   结果    └──────────────┘

索引：deals
{
  "title": "text",
  "description": "text",
  "merchant_name": "keyword",
  "categories": "keyword[]",
  "markets": "keyword[]",
  "cashback_rate": "float",
  "starts_at": "date",
  "ends_at": "date",
  "popularity_score": "float",
  "featured": "boolean"
}
```

**相关性评分**综合考虑：

- 文本匹配分数
- 返现率（越高越好）
- 热度（点击率）
- 时效性
- 精选加分

---

## 4. 峰值事件扩展

### 双十一 / 黑色星期五架构

```
正常：   10 万请求/分钟
峰值：   100 万+ 请求/分钟（10 倍）

策略：
┌─────────────────────────────────────────────┐
│  1. 活动前 1 小时预热缓存                   │
│  2. API Pod 自动扩展（k8s HPA）             │
│  3. 优惠列表页 CDN 缓存                     │
│  4. 每用户限流（10 次领取/分钟）            │
│  5. 限时抢购领取走队列（不直接访问数据库）  │
│  6. 非关键查询使用读副本                     │
│  7. 推荐 API 熔断器                          │
└─────────────────────────────────────────────┘
```

### 流量整形

- **倒计时页面**：用静态内容吸收早期流量
- **错峰开始**：不同类别在不同时间开始
- **等候室**：容量达到上限时排队用户（虚拟队列）

---

## 5. 多市场考虑

```
商家为以下市场创建优惠：['sg', 'my', 'th']

处理流程：
1. 存储带市场数组的优惠
2. 按市场货币转换价格
3. 同步到区域 Redis 集群
4. 在 Elasticsearch 中建立带市场过滤的索引
5. 按市场时区发送通知
```

| 方面     | 方法                                           |
| -------- | ---------------------------------------------- |
| 货币     | 以商家货币存储，以用户货币展示                 |
| 时区     | UTC 存储排期，本地时间展示                     |
| 语言     | 优惠标题按语言存储在 JSONB 字段中              |
| 法规     | 各市场特定的条款与条件                         |

---

## 6. 关键权衡

| 决策                           | 权衡                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| Redis 计数器 vs 数据库锁      | 速度 vs 持久性（两者都用：Redis 保证速度，数据库作为事实来源）       |
| Elasticsearch vs 数据库查询   | 灵活性 vs 运维复杂度                                                 |
| CDN 缓存优惠页面              | 新鲜度 vs 延迟（30 秒 TTL 可接受）                                  |
| 预计算 vs 实时排名            | 推荐过时 vs 计算成本                                                 |
| 单一 vs 按市场数据库          | 简洁性 vs 数据隔离                                                   |
