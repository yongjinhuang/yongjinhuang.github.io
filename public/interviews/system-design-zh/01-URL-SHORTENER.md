# 设计 URL 短链接服务 (TinyURL / bit.ly)

URL 短链接服务将长 URL 映射为一个简短的唯一别名（例如 `https://tinyurl.com/abc123`），
用户访问该别名时会被重定向到原始 URL。这是系统设计面试中最常被问到的问题之一，
因为它涉及 hash、数据库、缓存、扩展性和数据分析 -- 所有这些都包含在一个看似简单的产品中。

---

## 1. 需求澄清

### 1.1 功能需求

| #   | 需求       | 详情                                           |
| --- | ---------- | ---------------------------------------------- |
| F1  | 缩短 URL   | 给定一个长 URL，生成一个唯一的短别名           |
| F2  | 重定向     | 访问短 URL 时重定向到原始长 URL                |
| F3  | 自定义别名 | 用户可以选择自定义短链接 key                   |
| F4  | 过期时间   | URL 可以设置可选的存活时间（TTL）              |
| F5  | 数据分析   | 追踪点击次数、来源、地理位置、设备（扩展目标） |
| F6  | 删除/停用  | 所有者可以移除短 URL                           |

### 1.2 非功能需求

| #   | 需求         | 目标                                  |
| --- | ------------ | ------------------------------------- |
| NF1 | 高可用性     | 99.99% 可用时间（每年停机 < 52 分钟） |
| NF2 | 低延迟重定向 | p99 < 100 ms                          |
| NF3 | 不可猜测     | 短 URL 不应容易被枚举                 |
| NF4 | 持久性       | 一旦创建，URL 映射不能丢失            |
| NF5 | 可扩展性     | 处理数十亿 URL，承受大规模读取流量    |
| NF6 | 容错性       | 无单点故障                            |

### 1.3 容量估算

**假设条件：**

```
每天创建的新 URL 数量     : 100 M (100,000,000)
读写比率                  : 100 : 1
保留期限                  : 5 年
平均长 URL 大小           : 500 bytes
短 URL key 长度           : 7 个字符 (Base62)
```

**写入（URL 创建）：**

```
100 M / 天
= 100,000,000 / 86,400 秒
~ 1,160 写入/秒

峰值 (2x 平均值)
~ 2,320 写入/秒
```

**读取（重定向）：**

```
100 : 1 比率
= 100 * 1,160
~ 116,000 读取/秒

峰值 (2x)
~ 232,000 读取/秒
```

**5 年存储量：**

```
总 URL 数 = 100 M/天 * 365 天 * 5 年
          = 1825 亿条 URL
          ~ 183 B 条记录

每条记录的存储：
  short_url (7 字符)      :     7 bytes
  long_url (平均)         :   500 bytes
  created_at (时间戳)     :     8 bytes
  expires_at (时间戳)     :     8 bytes
  user_id                 :     8 bytes
  开销 (索引等)           :   ~77 bytes
  ----------------------------------
  每条记录总计            :  ~608 bytes
  向上取整为              :  ~700 bytes

总存储 = 183 B * 700 bytes
       = 128.1 TB
       ~ 130 TB
```

**带宽：**

```
入站 (写入): 1,160 请求/秒 * 700 bytes ~ 0.8 MB/s
出站 (读取): 116,000 请求/秒 * 700 bytes ~ 81 MB/s
```

**缓存（80/20 法则 -- 20% 的 URL 产生 80% 的流量）：**

```
每天请求数  = 116,000 * 86,400 ~ 10 B/天
缓存每日 URL 的 20%:
  0.20 * 10 B * 700 bytes ~ 1.4 TB

实际上，缓存最热门的 ~100 M 条 URL：
  100 M * 700 bytes = 70 GB  (轻松放入一个 Redis 集群)
```

**短 URL key 空间检查：**

```
Base62 字符集: [a-z, A-Z, 0-9] = 62 个字符

Key 长度 6: 62^6 =  568 亿    (不够 183 B)
Key 长度 7: 62^7 =   3.5 万亿 (空间充足)

7 个字符的 key 可以提供 ~3.5 万亿个唯一 URL。
183 B 条 URL 仅使用了 ~5.2% 的 key 空间。
```

**汇总表：**

```
+------------------------+-------------------+
| 指标                   | 数值              |
+------------------------+-------------------+
| 写入吞吐量             | ~1,200 请求/秒    |
| 读取吞吐量             | ~120,000 请求/秒  |
| 峰值读取吞吐量         | ~240,000 请求/秒  |
| 总 URL 数 (5 年)       | ~1830 亿          |
| 总存储                 | ~130 TB           |
| 缓存大小               | ~70 GB            |
| 短 key 长度            | 7 个字符          |
| Key 空间               | 3.5 万亿          |
+------------------------+-------------------+
```

---

## 2. API 设计

### 2.1 创建短 URL

```
POST /api/v1/shorten
Authorization: Bearer <api_key>
Content-Type: application/json

请求体:
{
  "long_url": "https://www.example.com/very/long/path?param=value",
  "custom_alias": "my-link",       // 可选
  "expires_at": "2027-01-01T00:00:00Z"  // 可选
}

响应 201 Created:
{
  "short_url": "https://tinyurl.com/abc1234",
  "short_key": "abc1234",
  "long_url": "https://www.example.com/very/long/path?param=value",
  "created_at": "2026-03-01T12:00:00Z",
  "expires_at": "2027-01-01T00:00:00Z"
}

错误 409 Conflict (自定义别名已被占用):
{
  "error": "ALIAS_TAKEN",
  "message": "The custom alias 'my-link' is already in use."
}

错误 400 Bad Request:
{
  "error": "INVALID_URL",
  "message": "The provided URL is not valid."
}
```

### 2.2 重定向

```
GET /{shortKey}
(例如, GET /abc1234)

响应 302 Found:
Location: https://www.example.com/very/long/path?param=value

错误 404 Not Found:
{
  "error": "NOT_FOUND",
  "message": "Short URL not found or has expired."
}
```

### 2.3 获取 URL 信息

```
GET /api/v1/urls/{shortKey}
Authorization: Bearer <api_key>

响应 200 OK:
{
  "short_key": "abc1234",
  "short_url": "https://tinyurl.com/abc1234",
  "long_url": "https://www.example.com/very/long/path?param=value",
  "created_at": "2026-03-01T12:00:00Z",
  "expires_at": "2027-01-01T00:00:00Z",
  "click_count": 15482
}
```

### 2.4 删除短 URL

```
DELETE /api/v1/urls/{shortKey}
Authorization: Bearer <api_key>

响应 204 No Content

错误 403 Forbidden:
{
  "error": "FORBIDDEN",
  "message": "You do not own this short URL."
}
```

### 2.5 速率限制 Header

每个响应都包含：

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1709312400
```

---

## 3. 数据模型

### 3.1 SQL Schema

```sql
-- 主 URL 映射表
CREATE TABLE urls (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    short_key       VARCHAR(16)     NOT NULL UNIQUE,
    long_url        VARCHAR(2048)   NOT NULL,
    long_url_hash   VARCHAR(64)     NOT NULL,          -- 长 URL 的 SHA-256，用于去重
    user_id         BIGINT          DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP       DEFAULT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,

    INDEX idx_short_key (short_key),                   -- 主查询
    INDEX idx_long_url_hash (long_url_hash),           -- 去重
    INDEX idx_user_id (user_id),                       -- 用户的 URL 列表
    INDEX idx_expires_at (expires_at)                   -- 过期清理
);

-- 用户账户表
CREATE TABLE users (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    api_key         VARCHAR(64)     NOT NULL UNIQUE,
    tier            ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
    rate_limit      INT             NOT NULL DEFAULT 100,    -- 每分钟请求数
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 点击分析表（仅追加，高写入）
CREATE TABLE clicks (
    id              BIGINT          PRIMARY KEY AUTO_INCREMENT,
    short_key       VARCHAR(16)     NOT NULL,
    clicked_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    referrer        VARCHAR(2048),
    country         VARCHAR(2),
    device_type     ENUM('desktop', 'mobile', 'tablet', 'bot'),

    INDEX idx_short_key_clicked (short_key, clicked_at)
);
```

### 3.2 索引策略

| 索引                     | 用途            | 查询模式                                             |
| ------------------------ | --------------- | ---------------------------------------------------- |
| `idx_short_key` (UNIQUE) | 重定向查找      | `WHERE short_key = ?`                                |
| `idx_long_url_hash`      | 去重            | `WHERE long_url_hash = ?`                            |
| `idx_user_id`            | 用户面板        | `WHERE user_id = ?`                                  |
| `idx_expires_at`         | 清理定时任务    | `WHERE expires_at < NOW()`                           |
| `idx_short_key_clicked`  | 每个 URL 的分析 | `WHERE short_key = ? AND clicked_at BETWEEN ? AND ?` |

### 3.3 SQL vs NoSQL

| 因素       | SQL (MySQL/PostgreSQL)   | NoSQL (DynamoDB/Cassandra)        |
| ---------- | ------------------------ | --------------------------------- |
| Schema     | 固定 schema，强类型      | 灵活 schema                       |
| 读取       | 有适当索引时速度快       | 大规模下使用 partition key 速度快 |
| 写入       | 良好，可能需要分片       | 出色的水平写入扩展能力            |
| Join       | 原生支持                 | 不支持                            |
| ACID       | 完整事务支持             | 最终一致性（可调）                |
| 扩展性     | 垂直扩展 + 读副本 + 分片 | 开箱即用的水平扩展                |
| 去重       | 通过唯一约束轻松实现     | 需要条件写入                      |
| 运维复杂度 | 中等                     | 在极大规模下更低                  |

**建议：从 SQL (PostgreSQL) 开始，在大规模时将热路径迁移到 NoSQL。**

- URL 映射本质上是一个键值存储（short_key -> long_url），使其在超大规模下
  非常适合 NoSQL。
- 但是，SQL 提供了强一致性、用于去重的唯一约束，以及更简单的初期开发体验。
- 在海量规模（100B+ 记录）下，考虑使用 DynamoDB，以 `short_key` 作为 partition
  key 用于重定向路径，同时保留 PostgreSQL 用于用户管理和分析。

---

## 4. 高层架构

```
                                    +------------------+
                                    |   监控           |
                                    |  (Prometheus +   |
                                    |   Grafana)       |
                                    +--------+---------+
                                             |
                                             v
+----------+     +-----------+     +-------------------+     +-------------+
|          |     |           |     |                   |     |             |
|  客户端  +---->+    DNS    +---->+  负载均衡器        +---->+  应用服务器  |
| (浏览器) |     | (Route53) |     |  (Nginx / ALB)    |     |  (集群)     |
|          |     |           |     |                   |     |             |
+----------+     +-----------+     +-------------------+     +------+------+
                                                                    |
                                          +-------------------------+----------+
                                          |                         |          |
                                          v                         v          v
                                   +------+------+          +------+---+ +----+------+
                                   |             |          |          | |           |
                                   |    缓存     |          | 数据库   | | 分析      |
                                   |   (Redis    |          | (主库    | | (Kafka +  |
                                   |   Cluster)  |          | + 副本)  | | ClickHouse|
                                   |             |          |          | |           |
                                   +-------------+          +----------+ +-----------+
```

### 组件职责

| 组件              | 角色                                                      |
| ----------------- | --------------------------------------------------------- |
| **DNS (Route53)** | 将 `tinyurl.com` 解析到最近的负载均衡器；地理路由         |
| **负载均衡器**    | 将流量分发到各应用服务器；健康检查；SSL 终止              |
| **应用服务器**    | 处理缩短 + 重定向逻辑的无状态服务；可水平扩展             |
| **缓存 (Redis)**  | 存储热门 URL 映射；~70 GB 用于前 1 亿条 URL；亚毫秒级查找 |
| **数据库 (主库)** | 所有 URL 映射的可信数据源；处理写入                       |
| **数据库 (副本)** | 用于缓存未命中时的重定向查找的读副本                      |
| **分析 (Kafka)**  | 用于点击追踪的异步事件管道；将分析与重定向路径解耦        |
| **监控**          | 追踪延迟、错误率、吞吐量、缓存命中率                      |

---

## 5. 核心算法深入探讨

核心挑战：给定一个长 URL，生成一个唯一的 7 字符短 key。

### 方案 1：Hash + 冲突解决

**工作原理：**

1. 计算长 URL 的 hash（例如 MD5、SHA-256）。
2. 取前 43 位（足够 7 个 Base62 字符）。
3. 将这些位编码为 Base62。
4. 如果发生冲突，追加递增计数器并重新 hash。

```
长 URL: "https://www.example.com/very/long/path"
    |
    v
MD5: "e4d909c290d0fb1ca068ffaddf22cbd0"
    |
    v
取 Base62 编码 hash 的前 7 个字符: "kF3a9Bx"
    |
    v
检查数据库: "kF3a9Bx" 是否已存在?
  - 否 -> 存储
  - 是 -> 追加计数器，重新 hash: MD5("https://...long/path" + "1") -> 新 key
```

**伪代码：**

```python
import hashlib
import base62

def shorten_with_hash(long_url):
    for attempt in range(MAX_RETRIES):
        url_to_hash = long_url if attempt == 0 else f"{long_url}{attempt}"
        hash_hex = hashlib.md5(url_to_hash.encode()).hexdigest()
        hash_int = int(hash_hex[:11], 16)  # 44 bits
        short_key = base62_encode(hash_int)[:7]

        if not db.exists(short_key):
            db.insert(short_key, long_url)
            return short_key

    raise Exception("Failed to generate unique key after retries")
```

**优点：** 确定性 -- 相同的 URL 总是产生相同的 hash（有利于去重）。
**缺点：** 冲突需要重试；在高负载下重试会增加延迟。

---

### 方案 2：Base62 编码 + 自增 ID

**工作原理：**

1. 将长 URL 插入数据库；获取自增 ID。
2. 将数字 ID 转换为 Base62。
3. 该 Base62 字符串就是短 key。

```
长 URL 已插入 -> 数据库分配 id = 123456789
    |
    v
Base62(123456789) = "8m0Kx"
    |
    v
短 URL: https://tinyurl.com/8m0Kx
```

**Base62 编码实现：**

```python
CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62_encode(num):
    if num == 0:
        return CHARSET[0]
    result = []
    while num > 0:
        result.append(CHARSET[num % 62])
        num //= 62
    return ''.join(reversed(result))

def base62_decode(s):
    num = 0
    for char in s:
        num = num * 62 + CHARSET.index(char)
    return num

# 示例:
# base62_encode(1)          -> "1"
# base62_encode(62)         -> "10"
# base62_encode(123456789)  -> "8m0Kx"
# base62_encode(3500000000000) -> "zzzzzz" (最大 6 字符)
```

**优点：** 零冲突；简单；快速。
**缺点：** 顺序 ID 可被猜测/枚举；如果使用单个数据库序列，则存在单点故障；
难以跨多个数据中心分布。

**可猜测性的缓解措施：** 添加随机偏移量或使用 Feistel 密码来打乱 ID。

---

### 方案 3：预生成 Key 服务 (KGS)

**工作原理：**

1. 后台服务预生成数百万个唯一的 7 字符 Base62 key。
2. Key 存储在带有 `used` 标志的 `key_pool` 表中。
3. 当应用服务器需要 key 时，从 pool 中批量获取（例如 1000 个 key）。
4. 获取的 key 被原子地标记为 `used`。

```
+------------+         +-----------+         +------------+
|            |  批量   |           |  获取    |            |
|    KGS     +-------->+ Key Pool  +--------->+ 应用服务器 |
| (生成器)   |  插入   | (数据库表)|  1000    | (内存      |
|            |         |           |  个 key  |   缓冲区)  |
+------------+         +-----------+         +------------+
                                                   |
                                                   v
                                            从本地缓冲区
                                            分配下一个 key
```

**Key Pool Schema：**

```sql
CREATE TABLE key_pool (
    short_key   VARCHAR(7)  PRIMARY KEY,
    is_used     BOOLEAN     NOT NULL DEFAULT FALSE,
    assigned_to VARCHAR(64) DEFAULT NULL,  -- 服务器实例 ID
    assigned_at TIMESTAMP   DEFAULT NULL
);
```

**优点：** 无冲突；无运行时计算；常数 O(1) key 分配。
**缺点：** 需要单独的服务；如果服务器在使用前崩溃，key 会被浪费；
增加运维复杂度。

---

### 对比表

```
+-------------------+------------------+------------------+------------------+
| 因素              | Hash + 冲突解决  | 自增 ID          | KGS (预生成)     |
+-------------------+------------------+------------------+------------------+
| 冲突风险          | 有 (需重试)      | 无               | 无               |
| 可猜测性          | 否               | 是 (顺序的)      | 否               |
| 分布式支持        | 容易             | 困难 (单序列)    | 容易             |
| 内建去重          | 是 (相同 hash)   | 否               | 否               |
| 延迟              | 不稳定           | 低               | 极低 (O(1))      |
| 复杂度            | 中等             | 低               | 高               |
| 可扩展性          | 好               | 有限             | 优秀             |
| 容错性            | 好               | 依赖数据库       | 好 (有缓冲区)    |
+-------------------+------------------+------------------+------------------+
```

**推荐的生产方案：** 写入路径使用 **KGS（方案 3）**，结合
**通过 long_url_hash 进行去重**，以避免为相同的长 URL 创建多个短 URL。

---

## 6. 详细设计

### 6.1 URL 缩短流程

```
客户端                应用服务器              缓存           数据库           KGS
  |                       |                     |                |               |
  |  POST /api/v1/shorten |                     |                |               |
  |---------------------> |                     |                |               |
  |                       |                     |                |               |
  |                       | 验证 long_url       |                |               |
  |                       |--+                  |                |               |
  |                       |  | (格式, 长度,     |                |               |
  |                       |  |  黑名单检查)     |                |               |
  |                       |<-+                  |                |               |
  |                       |                     |                |               |
  |                       | 检查去重: 通过 long_url_hash 查找   |               |
  |                       |------------------------------------>|               |
  |                       |                     |                |               |
  |                       |  (如果存在, 返回已有的 short_key)    |               |
  |                       |<------------------------------------|               |
  |                       |                     |                |               |
  |                       | 如果是新的: 从本地缓冲区获取下一个 key              |
  |                       |--+                  |                |               |
  |                       |  | (如果缓冲区为空) |                |               |
  |                       |  |  批量获取 -------|----------------|------>|       |
  |                       |  |  <---------------|----------------|-------|       |
  |                       |<-+                  |                |               |
  |                       |                     |                |               |
  |                       | INSERT 到 urls 表   |                |               |
  |                       |------------------------------------>|               |
  |                       |                     |                |               |
  |                       | 写入缓存            |                |               |
  |                       |-------------------->|                |               |
  |                       |                     |                |               |
  |  201 Created          |                     |                |               |
  |<--------------------- |                     |                |               |
```

**步骤详解：**

1. **验证输入** -- 检查 URL 格式、长度（最大 2048）、以及黑名单
   （恶意软件、钓鱼网站）。
2. **去重检查** -- 使用 SHA-256 对长 URL 进行 hash，查询数据库是否已有映射。
   如果找到，返回已存在的短 URL，而不是创建新的。
3. **获取短 key** -- 从应用服务器的内存缓冲区中弹出下一个 key
   （从 KGS 预先获取的）。如果缓冲区不足，异步请求新的批次。
4. **存储映射** -- 将 `(short_key, long_url, long_url_hash, user_id, 时间戳)`
   插入数据库。
5. **填充缓存** -- 将映射写入 Redis，使后续重定向更快。
6. **返回响应** -- 将完整的短 URL 返回给客户端。

---

### 6.2 URL 重定向流程

```
客户端                应用服务器              缓存           数据库
  |                       |                     |                |
  |  GET /abc1234         |                     |                |
  |---------------------> |                     |                |
  |                       |                     |                |
  |                       | 在缓存中查找        |                |
  |                       |-------------------->|                |
  |                       |                     |                |
  |                       |    (缓存命中?)      |                |
  |                       |<--------------------|                |
  |                       |                     |                |
  |                       | 如果未命中: 查询数据库               |
  |                       |------------------------------------>|
  |                       |                     |                |
  |                       |   long_url          |                |
  |                       |<------------------------------------|
  |                       |                     |                |
  |                       | 填充缓存            |                |
  |                       |-------------------->|                |
  |                       |                     |                |
  |                       | 发送点击事件到 Kafka (异步)          |
  |                       |--+                  |                |
  |                       |  |                  |                |
  |  302 Found            |<-+                  |                |
  |  Location: long_url   |                     |                |
  |<--------------------- |                     |                |
```

**步骤详解：**

1. **缓存查找** -- 在 Redis 中检查 `short_key -> long_url`。预期缓存命中率：80-90%。
2. **数据库回退** -- 缓存未命中时，查询数据库。检查 `is_active = TRUE`
   和 `(expires_at IS NULL OR expires_at > NOW())`。
3. **填充缓存** -- 将结果写回 Redis，TTL 与 URL 的过期时间匹配。
4. **异步分析** -- 将点击事件发布到 Kafka（非阻塞）。事件包含
   short_key、时间戳、IP、user-agent 和 referrer。
5. **重定向** -- 返回 HTTP 重定向到长 URL。

### 6.3 301 vs 302 重定向

```
+--------+---------------------------+------------------------------+
| 状态码 | 301 永久重定向            | 302 临时重定向               |
+--------+---------------------------+------------------------------+
| 缓存   | 浏览器缓存重定向          | 浏览器不缓存                 |
|        | (更少的服务器请求)        | (每次点击都会到达服务器)     |
+--------+---------------------------+------------------------------+
| SEO    | 将链接权重传递给          | 链接权重保留在               |
|        | 目标 URL                  | 短 URL                       |
+--------+---------------------------+------------------------------+
| 分析   | 失去可见性 --             | 完全可见 -- 每次             |
|        | 缓存的重定向会绕过        | 重定向都经过服务器           |
|        | 服务器                    |                              |
+--------+---------------------------+------------------------------+
| 使用   | 不需要分析的              | 需要分析时                   |
| 场景   | 永久短链接                | (bit.ly, 营销链接)           |
+--------+---------------------------+------------------------------+
```

**建议：** 默认使用 **302**（大多数 URL 短链接服务需要分析功能）。
为需要最大性能和 SEO 权重传递的用户提供 301 选项。

---

### 6.4 缓存策略

**模式：旁路缓存（延迟加载）**

```
读取路径:
  1. 检查缓存
  2. 如果命中 -> 返回缓存值
  3. 如果未命中 -> 查询数据库 -> 写入缓存 -> 返回

写入路径:
  1. 写入数据库
  2. 写入缓存 (直写)
```

**缓存配置：**

```
缓存引擎        : Redis Cluster (6+ 节点)
最大内存        : 70 GB (前 1 亿条 URL)
淘汰策略        : allkeys-lfu (最不经常使用)
默认 TTL        : 24 小时 (访问时刷新)
序列化方式      : MessagePack (比 JSON 更小)

Key 格式        : url:{short_key}
Value 格式      : {long_url, expires_at, is_active}
```

**为什么选择 LFU 而不是 LRU？**
URL 短链接服务具有幂律分布特征：少量 URL 获得绝大多数点击。LFU 将最热门的 URL
保留在缓存中，而 LRU 在一批唯一 URL 临时填满缓存时会将它们淘汰。

**缓存预热：**
服务器启动时，按点击量预加载前 10,000 条 URL 到本地缓存，
以避免冷启动时的惊群效应。

---

### 6.5 速率限��

**策略：每个 API Key 的令牌桶**

```
+------------------+-------------------+
| 等级             | 速率限制          |
+------------------+-------------------+
| Free             | 100 请求/分钟     |
| Pro              | 1,000 请求/分钟   |
| Enterprise       | 10,000 请求/分钟  |
| 重定向 (无 key)  | 1,000 请求/分钟/IP|
+------------------+-------------------+
```

**使用 Redis 的实现：**

```python
def is_rate_limited(api_key, limit, window_seconds=60):
    key = f"rate:{api_key}"
    current = redis.incr(key)
    if current == 1:
        redis.expire(key, window_seconds)
    return current > limit
```

速率限制在负载均衡器层面按 IP 应用于重定向请求，
在应用层面按 API key 应用于 API 调用。

---

## 7. 扩展性

### 7.1 数据库分片

在 1830 亿条记录下，单个数据库无法承受负载。我们将 `urls`
表分片到多个数据库实例上。

**分片策略：基于 short_key 的一致性 hash**

```
short_key = "abc1234"
shard_id  = hash("abc1234") % NUM_SHARDS

256 个分片的示例:
  hash("abc1234") = 0x7A3F...
  0x7A3F % 256 = 63
  -> 路由到 shard-63
```

**为什么选择基于 hash 而不是基于范围的分片？**

- 基于 hash 的分片均匀分布数据（没有因字母顺序聚集导致的热点分片）。
- short_key 是重定向的主查找 key，使其成为理想的分片 key。

```
                        +-------------------+
                        |  分片路由器       |
                        |  (hash % N)      |
                        +---+---+---+---+---+
                            |   |   |   |
              +-------------+   |   |   +-------------+
              |                 |   |                 |
         +----+----+      +----+----+           +----+----+
         | Shard 0 |      | Shard 1 |    ...    | Shard N |
         | 主库    |      | 主库    |           | 主库    |
         +----+----+      +----+----+           +----+----+
              |                 |                     |
         +----+----+      +----+----+           +----+----+
         | 副本    |      | 副本    |           | 副本    |
         +---------+      +---------+           +---------+
```

**分片数量规划：**

```
总数据量: 130 TB
每个分片目标: ~500 GB (可管理，快速备份)
所需分片数: 130 TB / 500 GB = 260 个分片
取整为: 256 (2 的幂，取模更简单)
```

---

### 7.2 读副本

每个分片有 2-3 个读副本：

```
写入路径:  应用服务器 -> 分片主库 (同步)
读取路径:  应用服务器 -> 分片副本 (从任一副本)
```

- **复制延迟：** 使用半同步复制时通常 < 100ms。
- **过期读取：** 对于重定向是可接受的（100ms 前创建的 URL 很少会立即被访问）。
  对于创建确认，从主库读取。

---

### 7.3 缓存层扩展

```
Redis Cluster 拓扑:

  +----------+  +----------+  +----------+
  | Master 1 |  | Master 2 |  | Master 3 |
  | 0-5460   |  | 5461-10922| |10923-16383|  (hash slots)
  +----+-----+  +----+-----+  +----+-----+
       |              |              |
  +----+-----+  +----+-----+  +----+-----+
  | Replica 1|  | Replica 2|  | Replica 3|
  +----------+  +----------+  +----------+

总计: 6 个节点, ~70 GB 分布在 3 个 master 上
每个 master: ~23 GB
```

**Redis Cluster** 使用 16384 个 hash slot 分布在各 master 节点上。添加更多 master
是无缝的 -- Redis 会自动重新平衡 slot。

---

### 7.4 分析管道

点击追踪不能给重定向路径增加延迟。

```
应用服务器              Kafka               消费者             ClickHouse
    |                       |                     |                  |
    | 发布点击事件          |                     |                  |
    | (即发即忘)            |                     |                  |
    |---------------------->|                     |                  |
    |                       |  消费批次           |                  |
    |                       |-------------------->|                  |
    |                       |                     | 批量插入         |
    |                       |                     |----------------->|
    |                       |                     |                  |
    |                       |                     | (每 5 秒或       |
    |                       |                     |  1000 个事件)    |
```

**管道详情：**

| 组件       | 用途       | 配置                                     |
| ---------- | ---------- | ---------------------------------------- |
| Kafka      | 事件缓冲区 | 3 个 broker, 12 个 partition, 7 天保留期 |
| 消费者     | 批处理器   | 3 个消费者组成消费组, 批次大小 1000      |
| ClickHouse | 分析数据库 | 列式存储, 为聚合查询优化                 |

**点击事件 Schema (Kafka 消息)：**

```json
{
  "short_key": "abc1234",
  "timestamp": "2026-03-01T12:34:56Z",
  "ip": "203.0.113.42",
  "user_agent": "Mozilla/5.0...",
  "referrer": "https://twitter.com/...",
  "country": "US",
  "device": "mobile"
}
```

**为什么选择 ClickHouse 做分析？**

- 列式存储将点击数据压缩 10-20 倍。
- 聚合查询（每日点击数、热门国家）在数十亿行上毫秒级完成。
- 轻松处理 100K+ 次插入/秒。

---

## 8. 部署架构

### 8.1 多区域部署

```
                           +------------------+
                           |   全局 DNS       |
                           |   (Route53 /     |
                           |    Cloudflare)   |
                           +--------+---------+
                                    |
                          +---------+---------+
                          |                   |
                   +------+------+     +------+------+
                   |  CDN 边缘   |     |  CDN 边缘   |
                   | (US-East)   |     | (EU-West)   |
                   +------+------+     +------+------+
                          |                   |
              +-----------+-----------+       |
              |                       |       |
      +-------+--------+   +---------+-------+--------+
      |  US-East-1     |   |  EU-West-1               |
      |  数据中心      |   |  数据中心                |
      |                |   |                           |
      | +------------+ |   | +------------+            |
      | | LB (ALB)   | |   | | LB (ALB)   |           |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | 应用服务器  | |   | | 应用服务器  |          |
      | | (ECS/K8s)  | |   | | (ECS/K8s)  |          |
      | | 10 个实例  | |   | | 10 个实例  |          |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | Redis      | |   | | Redis      |           |
      | | Cluster    | |   | | Cluster    |           |
      | +-----+------+ |   | +-----+------+           |
      |       |         |   |       |                  |
      | +-----+------+ |   | +-----+------+           |
      | | 数据库主库  | |   | | 数据库副本  |           |
      | | + 副本     | |   | | (只读)     |           |
      | +------------+ |   | +------------+           |
      +----------------+   +--------------------------+
              |                        |
              +----------+-------------+
                         |
                  +------+------+
                  | 跨区域      |
                  | 复制        |
                  +-------------+
```

### 8.2 部署策略

| 层级       | 技术                         | 扩展方式                                 |
| ---------- | ---------------------------- | ---------------------------------------- |
| DNS        | Route53 基于延迟的路由       | 自动                                     |
| CDN        | CloudFront / Cloudflare      | 边缘缓存用于 301 重定向                  |
| 负载均衡器 | AWS ALB                      | 自动扩展目标组                           |
| 应用服务器 | ECS Fargate 或 Kubernetes    | HPA: CPU > 60% 或 RPS > 5000/实例 时扩展 |
| 缓存       | ElastiCache Redis Cluster    | 添加分片增加容量                         |
| 数据库     | Aurora PostgreSQL (Multi-AZ) | 每个区域的读副本                         |
| 分析       | MSK (Kafka) + ClickHouse     | 基于 partition 的扩展                    |

### 8.3 多区域写入路由

**所有写入都发送到主区域 (US-East-1)。** 其他区域是只读副本。

```
欧洲用户创建短 URL:
  EU 应用服务器 -> 跨区域调用 US-East 数据库主库 -> 写入
  复制到 EU 副本的延迟: ~50-100ms

欧洲用户点击短 URL:
  EU 应用服务器 -> EU Redis 缓存 (或 EU 数据库副本) -> 重定向
  延迟: ~10-20ms
```

对于真正的多区域写入，可以使用无冲突复制数据类型 (CRDT) 或
分布式数据库如 CockroachDB。但这会显著增加复杂性，对于 URL 短链接服务
来说很少需要，因为写入延迟不如重定向延迟重要。

---

## 9. 权衡取舍与替代方案

### 9.1 一致性 vs 可用性 (CAP 定理)

```
+---------------------+-----------------------------------+
| 选择                | 含义                              |
+---------------------+-----------------------------------+
| 强一致性            | 每次读取都能看到最新的写入。       |
| (CP)                | 在网络分区期间可能拒绝请求。       |
+---------------------+-----------------------------------+
| 高可用性            | 始终接受读写请求。                 |
| (AP)                | 写入后可能短暂返回过期数据。       |
+---------------------+-----------------------------------+
```

**我们的选择：AP（可用性 + 分区容错性）**

理由：

- 重定向返回略微过期的映射是可接受的（URL 很少变更）。
- 100ms 前创建的 URL 返回 404 是可以容忍的，但系统不可用则不行。
- 最终一致性（复制延迟 < 200ms）对此用例来说足够了。
- 可用性至关重要：一个宕机的 URL 短链接服务会导致所有曾经创建的链接失效。

---

### 9.2 SQL vs NoSQL 决策矩阵

```
+------------------+----------------------------------+----------------------------------+
| 标准             | SQL (PostgreSQL)                 | NoSQL (DynamoDB)                 |
+------------------+----------------------------------+----------------------------------+
| 数据模型         | 关系型 (URL, 用户, 点击)         | 键值对 (short_key -> long_url)   |
| 一致性           | 强 (ACID)                        | 最终一致 (可调)                  |
| 写入扩展         | 垂直 + 分片                      | 水平 (无限)                      |
| 读取扩展         | 副本 (良好)                      | 副本 (优秀)                      |
| 去重             | UNIQUE 约束                      | 条件写入 (复杂)                  |
| Schema 变更      | 需要迁移                         | 无 Schema (灵活)                 |
| 大规模成本       | 较高 (托管实例)                  | 较低 (按请求付费)                |
| 运维             | 中等 (备份, 复制)                | 低 (完全托管)                    |
+------------------+----------------------------------+----------------------------------+
```

**推荐混合方案：**

- **PostgreSQL** 用于写入路径（创建、去重、用户管理）。
- **DynamoDB / Redis** 用于读取路径（重定向）。缓存整个热数据集。
- **ClickHouse** 用于分析。

---

### 9.3 Hash vs 计数器 vs KGS

| 场景               | 最佳方案         | 原因                      |
| ------------------ | ---------------- | ------------------------- |
| 单区域，简单场景   | 自增 ID + Base62 | 最简单，无需额外服务      |
| 多区域，大规模     | KGS (预生成)     | 区域间无需协调            |
| 去重至关重要       | 基于 Hash        | 相同 URL 总是产生相同 key |
| 需要不可猜测的 key | KGS + 随机生成   | key 没有规律              |
| 低运维开销         | 基于 Hash        | 无需维护后台服务          |

---

## 10. 常见面试追问

### 10.1 如何处理热门 URL？

一条病毒式传播的推文链接到短 URL，可能每秒产生数百万次重定向请求
到单个 key。

**解决方案：**

1. **每台应用服务器上的本地内存缓存** -- 在本地缓存前 1000 条 URL
   (带 TTL 的 HashMap)。这消除了最热门 URL 的 Redis 网络往返。

2. **Redis 读副本** -- 对于单个热 key，Redis 每个副本可服务 ~100K 读取/秒。
   5 个副本读取热 key，即可达到 500K 读取/秒。

3. **CDN 缓存** -- 如果使用 301 重定向，CDN 边缘节点会缓存重定向。
   热门 URL 将完全从 CDN 提供服务，无需到达源站。

4. **带虚拟节点的一致性 hash** -- 使用虚拟节点将热 key 分散到多个
   缓存节点上，防止任何单个节点过载。

```
热门 URL 缓解堆栈:

  客户端 -> CDN (如果 301) -> 本地应用缓存 -> Redis 副本 -> 数据库副本
            ~1ms              ~0.1ms           ~1ms          ~5ms

  每一层都吸收了相当大比例的流量。
  所有层配合：可以为单个 URL 处理数百万 RPS。
```

---

### 10.2 如何实现数据分析？

**实时分析管道：**

```
点击事件 -> Kafka topic "clicks"
                    |
            +-------+-------+
            |               |
     流处理器            批处理器
     (Flink / Kafka     (Spark, 每小时)
      Streams)                |
            |                 v
            v           数据仓库
     实时仪表板          (聚合后)
     (最近 5 分钟)
```

**ClickHouse 中的分析数据模型：**

```sql
CREATE TABLE click_events (
    short_key     String,
    clicked_at    DateTime,
    country       LowCardinality(String),
    device_type   LowCardinality(String),
    referrer      String,
    browser       LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(clicked_at)
ORDER BY (short_key, clicked_at);

-- 用于实时聚合的物化视图
CREATE MATERIALIZED VIEW clicks_per_day
ENGINE = SummingMergeTree()
ORDER BY (short_key, day)
AS SELECT
    short_key,
    toDate(clicked_at) AS day,
    count() AS clicks,
    uniqHLL12(country) AS unique_countries
FROM click_events
GROUP BY short_key, day;
```

**仪表板查询：**

```sql
-- 某个 URL 的每日点击量
SELECT day, clicks FROM clicks_per_day
WHERE short_key = 'abc1234'
ORDER BY day;

-- 过去一小时内的前 10 热门 URL
SELECT short_key, count() as clicks
FROM click_events
WHERE clicked_at > now() - INTERVAL 1 HOUR
GROUP BY short_key
ORDER BY clicks DESC
LIMIT 10;
```

---

### 10.3 如何处理 URL 过期？

**双管齐下的方案：**

1. **惰性过期（读取时）：**
   当重定向请求到来时，检查 `expires_at`。如果已过期，返回 404
   并可选地从缓存中删除。

   ```python
   def redirect(short_key):
       url = cache.get(short_key) or db.get(short_key)
       if url is None:
           return 404
       if url.expires_at and url.expires_at < now():
           cache.delete(short_key)
           return 404  # "此链接已过期"
       return redirect_302(url.long_url)
   ```

2. **主动清理（后台任务）：**
   定时任务每小时运行一次，硬删除过期 URL 并释放 key 空间。

   ```sql
   -- 每小时运行
   DELETE FROM urls
   WHERE expires_at IS NOT NULL
     AND expires_at < NOW() - INTERVAL 1 DAY  -- 宽限期
   LIMIT 10000;  -- 分批执行以避免长时间锁定
   ```

   删除的短 key 可以返回到 KGS key pool 中以供复用。

**缓存 TTL 对齐：**
缓存带过期时间的 URL 时，将 Redis TTL 设置为与之匹配：

```python
ttl = max(1, int((url.expires_at - now()).total_seconds()))
redis.setex(f"url:{short_key}", ttl, url.long_url)
```

---

### 10.4 如何防止滥用？

**多层防御：**

```
+-------------------+----------------------------------------------+
| 层级              | 保护措施                                     |
+-------------------+----------------------------------------------+
| 速率限制          | 每个 API key 和每个 IP 的令牌桶              |
| URL 验证          | 拒绝格式错误的 URL，对照黑名单检查           |
|                   | (Google Safe Browsing API)                   |
| CAPTCHA           | 匿名创建 N 次后要求 CAPTCHA                  |
| 垃圾信息检测      | ML 模型评估 URL 模式                         |
| 滥用举报          | 允许用户举报恶意短 URL                       |
| 账户封禁          | 禁用滥用账户的 API key                       |
| 链接预览          | 在重定向前显示目标 URL                       |
| 内容扫描          | 定期爬取目标网站检测恶意软件                 |
+-------------------+----------------------------------------------+
```

**Safe Browsing 检查的实现：**

```python
def is_url_safe(long_url):
    # 对照 Google Safe Browsing API 检查
    response = safe_browsing_client.lookup(long_url)
    if response.is_threat:
        raise ValueError(f"URL flagged as {response.threat_type}")

    # 对照内部黑名单检查
    domain = extract_domain(long_url)
    if domain in BLOCKED_DOMAINS:
        raise ValueError("Domain is blocked")

    return True
```

**滥用监控：**

```sql
-- 检测以异常速率创建 URL 的账户
SELECT user_id, COUNT(*) as url_count
FROM urls
WHERE created_at > NOW() - INTERVAL 1 HOUR
GROUP BY user_id
HAVING url_count > 1000
ORDER BY url_count DESC;

-- 检测点击率异常高的 URL（潜在钓鱼）
SELECT short_key, COUNT(*) as clicks
FROM click_events
WHERE clicked_at > NOW() - INTERVAL 10 MINUTE
GROUP BY short_key
HAVING clicks > 10000
ORDER BY clicks DESC;
```

---

## 附录 A：完整系统概览

```
+-------------------------------------------------------------------+
|                     URL 短链接服务架构                              |
+-------------------------------------------------------------------+
|                                                                   |
|  写入路径 (1,200 请求/秒)                                         |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  客户端 -> LB -> 应用服务器 -> 验证 URL                           |
|                             -> 检查去重 (SHA-256 hash)            |
|                             -> 从 KGS 缓冲区获取 key              |
|                             -> INSERT 到数据库 (分片)             |
|                             -> SET 到 Redis 缓存                  |
|                             <- 返回短 URL                         |
|                                                                   |
|  读取路径 (120,000 请求/秒)                                       |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  客户端 -> CDN (仅 301) -> LB -> 应用服务器                       |
|                                -> GET 从 Redis (80-90% 命中)      |
|                                -> GET 从数据库副本 (回退)         |
|                                -> 发布点击事件到 Kafka             |
|                                <- 302 重定向                      |
|                                                                   |
|  分析路径 (异步)                                                   |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  Kafka -> 消费者 -> 批量 INSERT 到 ClickHouse                     |
|                   -> 实时聚合 (物化视图)                           |
|                                                                   |
|  清理 (定期)                                                       |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                     |
|  定时任务 -> DELETE 过期 URL -> 将 key 返还 KGS pool              |
|                                                                   |
+-------------------------------------------------------------------+
```

## 附录 B：需要监控的关键指标

```
+---------------------------+------------------+------------------+
| 指标                      | 告警阈值         | 仪表板           |
+---------------------------+------------------+------------------+
| 重定向 p99 延迟           | > 100ms          | 实时图表         |
| 缓存命中率               | < 80%            | 仪表盘           |
| 数据库写入延迟            | > 50ms           | 实时图表         |
| KGS key pool 剩余量       | < 100K 个 key    | 仪表盘 + 告警    |
| 错误率 (5xx)              | > 0.1%           | 计数器           |
| Kafka 消费者延迟           | > 100K 个事件    | 仪表盘 + 告警    |
| 每个分片的磁盘使用率      | > 80%            | 仪表盘 + 告警    |
| 速率限制拒绝数            | > 1000/分钟      | 计数器           |
| 过期 URL 清理速率         | N/A              | 计数器           |
| 每分钟创建的 URL 数       | > 2x 基线        | 图表 + 异常检测  |
+---------------------------+------------------+------------------+
```

## 附录 C：面试时间管理

对于 45 分钟的系统设计面试，按以下方式分配时间：

```
+---------------------------+----------+
| 章节                      | 分钟     |
+---------------------------+----------+
| 需求与估算                | 5-7      |
| API 设计                  | 3-5      |
| 数据模型                  | 3-5      |
| 高层架构                  | 5-7      |
| 核心算法深入探讨          | 8-10     |
| 详细设计                  | 5-7      |
| 扩展与部署                | 5-7      |
| 追问问题                  | 5-7      |
+---------------------------+----------+
| 总计                      | ~45 分钟 |
+---------------------------+----------+
```

**提示：**

- 从需求开始；不要直接跳到解决方案。
- 尽早画出高层架构图；面试官喜欢有视觉思维的候选人。
- 主动提及权衡取舍（301 vs 302、SQL vs NoSQL、hash vs 计数器）。
- 在讨论过程中使用容量估算中的具体数字。
- 如果面试官询问某个特定领域，深入而不是广泛地回答。
- 以监控和运维相关的考虑作为结尾，展示生产环境的成熟度。
