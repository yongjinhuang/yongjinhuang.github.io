# 设计认证与单点登录系统

---

## 1. 需求澄清

### 功能需求

| # | 需求 | 描述 |
|---|------|------|
| 1 | 用户注册 | 通过邮箱/密码注册，或通过社交账号提供商（Google、GitHub、Apple）注册 |
| 2 | 登录/登出 | 验证用户身份，签发会话令牌，登出时撤销令牌 |
| 3 | Single Sign-On (SSO) | 一次登录即可访问同一身份提供商下的多个应用程序 |
| 4 | OAuth 2.0 / OIDC | 同时作为 OAuth 授权服务器和 OpenID Connect 提供商 |
| 5 | SAML 2.0 支持 | 使用 SAML 断言的企业级 SSO，支持 SP 发起和 IdP 发起的流程 |
| 6 | 多因素认证 | TOTP（Google Authenticator）、WebAuthn/FIDO2 通行密钥、短信 OTP 备用方案 |
| 7 | 无密码认证 | 通过邮件发送魔法链接、基于通行密钥的认证 |
| 8 | 社交登录 | 与 Google、GitHub、Apple 的 OAuth 集成以联合身份 |
| 9 | 令牌管理 | 签发、刷新、轮换和撤销访问令牌与刷新令牌 |
| 10 | 会话管理 | 服务端会话存储、滑动过期、并发会话限制 |
| 11 | 基于角色的访问控制 | 分配角色和权限，在令牌中嵌入声明 |
| 12 | 账户安全 | 速率限制、账户锁定、CAPTCHA、可疑登录检测 |
| 13 | 密码管理 | 安全的密码存储、通过邮件重置、泄露检测 |
| 14 | 审计日志 | 所有认证事件的不可变日志，用于合规和取证 |

### 非功能需求

| # | 需求 | 目标 |
|---|------|------|
| 1 | 登录延迟 | < 200ms p99（端到端） |
| 2 | 可用性 | 99.999%（每年 < 5.26 分钟停机） |
| 3 | 会话查询延迟 | < 5ms（Redis 内存） |
| 4 | 令牌验证延迟 | < 1ms（本地验证，无需网络调用，通过 JWT 签名验证） |
| 5 | 密码安全 | 零明文密码暴露，Argon2id 哈希 |
| 6 | 令牌过期 | 访问令牌：15 分钟；刷新令牌：30 天 |
| 7 | 可扩展性 | 1 亿总用户，1000 万 DAU，峰值 5 万次登录/秒 |
| 8 | 安全合规 | SOC 2 Type II、ISO 27001、GDPR |
| 9 | 审计保留 | 1 年热存储，7 年冷存储 |
| 10 | 多区域 | 3 个区域主主部署，复制延迟 < 100ms |

### 规模估算

```
用户：
  总注册用户：1 亿
  日活用户（DAU）：1000 万
  并发会话峰值：5 亿活跃会话存储在 Redis 中

登录流量：
  平均登录次数/天：1000 万（每个 DAU 约登录 1 次）
  平均登录次数/秒：10M / 86,400 = ~116 次/秒
  峰值倍数：~430 倍（闪购活动、周一早晨）
  峰值登录次数/秒：50,000

令牌验证（最频繁的操作）：
  每个登录用户每天发起约 50 次需要令牌验证的 API 调用
  验证次数/天：10M x 50 = 5 亿
  平均验证次数/秒：~5,800
  峰值验证次数/秒：~50,000（但在 API 网关本地完成，零数据库调用）

会话存储（Redis）：
  5 亿活跃会话 x 512 字节/会话 = ~256 GB
  含副本（3 个副本）：~768 GB 总 Redis 内存

刷新令牌操作：
  每个活跃会话每 15 分钟刷新一次：500M / 900s = ~55.5 万次刷新/秒
  去重后（并非所有会话同时刷新）：峰值 ~5 万/秒

密码哈希计算（bcrypt/Argon2）：
  50,000 次登录/秒 x ~300ms 哈希时间
  峰值需要 ~15,000 个 CPU 核心专用于哈希计算
  （实际情况：突发性流量，使用专用认证工作池）

审计日志存储：
  每次登录的事件数：~5 个事件（登录尝试、MFA、会话创建、令牌签发等）
  每日事件数：10M x 5 = 5000 万事件/天
  事件大小：~500 字节
  每日存储：50M x 500B = ~25 GB/天
  年度：~9 TB/年
```

---

## 2. 认证与授权基础

### 核心区别

```
认证（AuthN）                          授权（AuthZ）
+------------------------------+       +------------------------------+
| 你是谁？                      |       | 你能做什么？                  |
|                              |       |                              |
| 通过以下方式验证身份：          |       | 通过以下方式授予/拒绝访问：     |
| - 密码 + 用户名               |       | - 角色 (RBAC)                |
| - 证书                       |       | - 属性 (ABAC)                |
| - 生物特征                    |       | - 策略 (OPA/Casbin)          |
| - 令牌断言                    |       | - ACLs                       |
+------------------------------+       +------------------------------+
         |                                       |
         v                                       v
   "你是 Alice"                        "Alice 可以读取 /reports"
```

认证回答的是："你是否是你所声称的那个人？"
授权回答的是："你是否被允许执行你试图做的操作？"

一个系统可以认证成功但仍拒绝访问（AuthN 成功，AuthZ 失败）。

---

## 3. API 设计

### 认证端点

```
POST /auth/register
Request:
{
  "email": "alice@example.com",
  "password": "s3cur3P@ssw0rd",
  "display_name": "Alice"
}
Response: 201 Created
{
  "user_id": "usr_01J8X...",
  "email": "alice@example.com",
  "email_verified": false,
  "created_at": "2026-03-01T00:00:00Z"
}

POST /auth/login
Request:
{
  "email": "alice@example.com",
  "password": "s3cur3P@ssw0rd",
  "mfa_code": "123456"           // 可选的 TOTP 验证码
}
Response: 200 OK
{
  "access_token": "eyJhbGci...",  // JWT，15 分钟 TTL
  "refresh_token": "rt_01J8X...", // 不透明令牌，30 天 TTL
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email",
  "session_id": "ses_01J8X..."
}

POST /auth/refresh
Request:
{
  "refresh_token": "rt_01J8X..."
}
Response: 200 OK
{
  "access_token": "eyJhbGci...",   // 新的访问令牌
  "refresh_token": "rt_01J9Y...",  // 轮换后的刷新令牌（旧令牌已失效）
  "expires_in": 900
}

POST /auth/logout
Headers: Authorization: Bearer <access_token>
Request:
{
  "refresh_token": "rt_01J8X...",
  "all_sessions": false           // true = 撤销该用户的所有会话
}
Response: 204 No Content

POST /auth/forgot-password
Request: { "email": "alice@example.com" }
Response: 202 Accepted（始终返回此响应，即使邮箱不存在——防止枚举攻击）

POST /auth/reset-password
Request:
{
  "token": "prst_01J8X...",       // 来自邮件的密码重置令牌
  "new_password": "N3wP@ssw0rd"
}
Response: 200 OK
```

### OAuth 2.0 / OIDC 端点

```
GET /oauth/authorize
  ?client_id=app_123
  &response_type=code
  &redirect_uri=https://app.example.com/callback
  &scope=openid+profile+email
  &state=random_csrf_token
  &code_challenge=s256_hash        // PKCE
  &code_challenge_method=S256

Response: 302 Redirect to redirect_uri with ?code=authz_code&state=...

POST /oauth/token
Request (application/x-www-form-urlencoded):
  grant_type=authorization_code
  &code=authz_code
  &redirect_uri=https://app.example.com/callback
  &client_id=app_123
  &code_verifier=pkce_verifier    // PKCE

Response: 200 OK
{
  "access_token": "eyJhbGci...",
  "id_token": "eyJhbGci...",       // OIDC：包含用户身份的签名 JWT
  "refresh_token": "rt_01J8X...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email"
}

GET /oauth/userinfo
Headers: Authorization: Bearer <access_token>
Response: 200 OK
{
  "sub": "usr_01J8X...",
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",
  "picture": "https://cdn.example.com/avatars/alice.jpg",
  "updated_at": 1740787200
}

GET /.well-known/openid-configuration   // OIDC 发现文档
GET /.well-known/jwks.json              // 用于令牌验证的公钥
POST /oauth/revoke                      // RFC 7009 令牌撤销
POST /oauth/introspect                  // RFC 7662 令牌内省
```

### MFA 端点

```
POST /auth/mfa/totp/enroll
Response: { "secret": "BASE32SECRET", "qr_code_uri": "otpauth://..." }

POST /auth/mfa/totp/verify
Request: { "code": "123456" }
Response: { "backup_codes": ["abc123", ...] }

POST /auth/mfa/webauthn/register/begin
Response: { "challenge": "...", "rp": { "name": "MyApp", "id": "myapp.com" }, ... }

POST /auth/mfa/webauthn/register/complete
Request: { "credential": { ... } }    // WebAuthn 凭证 JSON

POST /auth/mfa/webauthn/authenticate/begin
Response: { "challenge": "...", "allowCredentials": [...] }

POST /auth/mfa/webauthn/authenticate/complete
Request: { "assertion": { ... } }
```

---

## 4. 数据模型

### 用户表

```sql
CREATE TABLE users (
    id              VARCHAR(36)  PRIMARY KEY,      -- usr_01J8X...（ULID）
    email           VARCHAR(320) NOT NULL UNIQUE,
    email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    display_name    VARCHAR(255),
    avatar_url      VARCHAR(2048),
    password_hash   VARCHAR(512),                  -- Argon2id 哈希，仅 SSO 用户为 NULL
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
                                                   -- active | suspended | deleted
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMP,
    login_count     INTEGER      NOT NULL DEFAULT 0,
    failed_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until    TIMESTAMP,                     -- 账户锁定过期时间
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,

    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

### 会话表（仅元数据；会话数据存储在 Redis 中）

```sql
CREATE TABLE sessions (
    id              VARCHAR(36)  PRIMARY KEY,      -- ses_01J8X...
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE, -- 刷新令牌的 SHA-256 哈希
    client_id       VARCHAR(36),                   -- OAuth 客户端，直接登录时为 NULL
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP    NOT NULL,
    revoked_at      TIMESTAMP,
    revoke_reason   VARCHAR(100),                  -- logout | admin | suspicious | rotation

    INDEX idx_user_id (user_id),
    INDEX idx_refresh_token_hash (refresh_token_hash),
    INDEX idx_expires_at (expires_at)
);
```

### OAuth 客户端表

```sql
CREATE TABLE oauth_clients (
    id              VARCHAR(36)  PRIMARY KEY,      -- app_123
    name            VARCHAR(255) NOT NULL,
    client_secret_hash VARCHAR(64),               -- 公共客户端为 NULL（仅使用 PKCE）
    redirect_uris   TEXT         NOT NULL,         -- JSON 数组
    allowed_scopes  TEXT         NOT NULL,         -- 空格分隔
    grant_types     TEXT         NOT NULL,         -- JSON 数组
    is_public       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    owner_user_id   VARCHAR(36)  REFERENCES users(id)
);
```

### 授权码表

```sql
CREATE TABLE authorization_codes (
    code_hash       VARCHAR(64)  PRIMARY KEY,      -- 授权码的 SHA-256 哈希
    client_id       VARCHAR(36)  NOT NULL REFERENCES oauth_clients(id),
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    redirect_uri    VARCHAR(2048) NOT NULL,
    scope           TEXT         NOT NULL,
    code_challenge  VARCHAR(128),                  -- PKCE
    code_challenge_method VARCHAR(10),
    expires_at      TIMESTAMP    NOT NULL,         -- 短期有效：10 分钟
    used_at         TIMESTAMP,                     -- 一次性使用
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

### MFA 凭证表

```sql
CREATE TABLE mfa_credentials (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    type            VARCHAR(20)  NOT NULL,         -- totp | webauthn | backup_code
    credential_id   TEXT,                          -- WebAuthn 凭证 ID（base64url）
    public_key      TEXT,                          -- WebAuthn COSE 公钥
    totp_secret_enc TEXT,                          -- AES-256 加密的 TOTP 密钥
    backup_code_hash VARCHAR(64),                  -- 备份码的 bcrypt 哈希
    counter         BIGINT       NOT NULL DEFAULT 0, -- WebAuthn 签名计数器
    aaguid          VARCHAR(36),                   -- 认证器证明 GUID
    name            VARCHAR(100),                  -- 用户自定义昵称
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMP,

    INDEX idx_user_id (user_id),
    INDEX idx_credential_id (credential_id)
);
```

### 角色与权限（RBAC）

```sql
CREATE TABLE roles (
    id      VARCHAR(36)  PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE,           -- admin, editor, viewer
    description TEXT
);

CREATE TABLE permissions (
    id          VARCHAR(36)  PRIMARY KEY,
    resource    VARCHAR(100) NOT NULL,              -- reports, users, billing
    action      VARCHAR(50)  NOT NULL,              -- read, write, delete
    UNIQUE (resource, action)
);

CREATE TABLE role_permissions (
    role_id       VARCHAR(36) REFERENCES roles(id),
    permission_id VARCHAR(36) REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id    VARCHAR(36) REFERENCES users(id),
    role_id    VARCHAR(36) REFERENCES roles(id),
    granted_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    granted_by VARCHAR(36) REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);
```

### 审计日志表

```sql
CREATE TABLE audit_logs (
    id          BIGSERIAL    PRIMARY KEY,
    event_type  VARCHAR(100) NOT NULL,   -- login.success, login.failed, token.refresh 等
    user_id     VARCHAR(36),
    session_id  VARCHAR(36),
    client_id   VARCHAR(36),
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    metadata    JSONB,                   -- 事件特定的负载
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),

    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);
-- 按月分区以实现高效归档
-- 热存储保留 1 年，冷存储在 S3 上保留 7 年
```

### 社交身份提供商

```sql
CREATE TABLE social_identities (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    provider        VARCHAR(50)  NOT NULL,       -- google | github | apple
    provider_user_id VARCHAR(255) NOT NULL,      -- 来自提供商的 subject 声明
    access_token_enc TEXT,                       -- 加密存储，用于 API 访问
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (provider, provider_user_id),
    INDEX idx_user_id (user_id)
);
```

---

## 5. 高层架构

```
                          +------------------+
                          |   DNS / CDN      |
                          |  (Cloudflare)    |
                          +--------+---------+
                                   |
                          +--------+---------+
                          |   全局负载        |
                          |   均衡器          |
                          | (Anycast IP,     |
                          |  GeoDNS 路由)    |
                          +---+---+---+------+
                              |   |   |
              +---------------+   |   +---------------+
              |                   |                   |
     +--------+--------+  +-------+-------+  +--------+--------+
     | 区域：US-EAST   |  | 区域：EU      |  | 区域：AP-EAST   |
     | 认证服务        |  | 认证服务       |  | 认证服务         |
     | 集群            |  | 集群          |  | 集群             |
     +-----------------+  +---------------+  +-----------------+
              |                   |                   |
     +--------+---------+---------+---------+---------+-------+
     |                                                        |
     |                    共享基础设施                          |
     |                                                        |
     |  +-------------------+       +----------------------+  |
     |  | Redis 集群         |       | PostgreSQL 集群       |  |
     |  | （会话存储）        |       | （用户、会话、         |  |
     |  | 主节点 + 2 个读     |       | 角色、审计）          |  |
     |  | 副本               |       | 主节点 + 副本         |  |
     |  +-------------------+       +----------------------+  |
     |                                                        |
     |  +-------------------+       +----------------------+  |
     |  | 消息队列           |       | 密钥管理器            |  |
     |  | (Kafka)           |       | (HashiCorp Vault /   |  |
     |  | 审计事件、          |       |  AWS KMS)            |  |
     |  | 邮件触发           |       | JWT 签名密钥、        |  |
     |  +-------------------+       | 数据库凭证            |  |
     |                              +----------------------+  |
     +--------------------------------------------------------+
```

### 认证服务内部架构

```
+-------------------------------------------------------+
|                   认证服务 Pod                          |
|                                                       |
|  +-------------+  +-----------+  +-----------------+ |
|  | REST API    |  | OAuth 2.0 |  | SAML 2.0        | |
|  | 处理器       |  | 处理器     |  | 处理器           | |
|  +------+------+  +-----+-----+  +--------+--------+ |
|         |               |                 |           |
|         +---------------+-----------------+           |
|                         |                             |
|              +----------+----------+                  |
|              |   认证核心逻辑       |                  |
|              |                     |                  |
|    +---------+---+   +----------+  |                  |
|    | 密码         |   | 令牌     |  |                  |
|    | 验证器       |   | 签发器 / |  |                  |
|    | (Argon2id)  |   | 验证器   |  |                  |
|    +-------------+   +----------+  |                  |
|    +---------+---+   +----------+  |                  |
|    | MFA         |   | 会话     |  |                  |
|    | 验证器       |   | 管理器   |  |                  |
|    | (TOTP/FIDO2)|   |          |  |                  |
|    +-------------+   +----------+  |                  |
|              |                     |                  |
|              +----------+----------+                  |
|                         |                             |
|     +---------+---------+---------+---------+         |
|     |         |         |         |         |         |
|  +--+---+ +---+---+ +---+---+ +---+---+ +--+----+    |
|  |Redis | |Postgres| |Kafka | |Vault  | |速率   |    |
|  |客户端| |客户端   | |生产者 | |客户端  | |限制器 |    |
|  +------+ +--------+ +------+ +-------+ +-------+    |
+-------------------------------------------------------+
```

---

## 6. 深入探讨：JWT 结构与令牌策略

### JWT 剖析

JSON Web Token 由三个 Base64URL 编码的部分组成，以点号分隔：

```
eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleS0yMDI2MDMifQ    <- 头部
.
eyJzdWIiOiJ1c3JfMDFKOFgiLCJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIi...  <- 负载
.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c      <- 签名
```

**头部**（解码后）：
```json
{
  "alg": "ES256",       // 算法：使用 P-256 和 SHA-256 的 ECDSA
  "typ": "JWT",
  "kid": "key-202603"   // 密钥 ID，用于密钥轮换——验证方通过 JWKS 查找
}
```

**负载**（解码后）：
```json
{
  "iss": "https://auth.example.com",     // 签发者
  "sub": "usr_01J8X...",                 // 主体（用户 ID）
  "aud": ["api.example.com"],            // 受众
  "exp": 1740788100,                     // 过期时间（Unix 时间戳，从现在起 15 分钟）
  "iat": 1740787200,                     // 签发时间
  "jti": "tok_01J8X...",                 // JWT ID（用于撤销黑名单）
  "sid": "ses_01J8X...",                 // 会话 ID
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",
  "roles": ["editor"],
  "permissions": ["reports:read", "billing:read"],
  "amr": ["pwd", "totp"],                // 认证方法引用
  "auth_time": 1740787200               // 用户最后一次认证的时间
}
```

**签名**（ECDSA P-256）：
```
ES256_Sign(
  private_key,
  base64url(header) + "." + base64url(payload)
)
```

### 为什么选择 ES256 而不是 RS256？

```
+------------------+----------------+------------------+
| 属性              | RS256 (RSA)    | ES256 (ECDSA)    |
+------------------+----------------+------------------+
| 密钥大小          | 2048-4096 位    | 256 位            |
| 签名大小          | 256-512 字节    | 64 字节           |
| 验证速度          | ~0.5ms         | ~0.1ms           |
| 密钥生成速度       | 慢             | 快               |
| 安全级别          | 112 位          | 128 位 (P-256)   |
+------------------+----------------+------------------+
```

ES256 是首选：更小的令牌、更快的验证、每比特更强的安全性。

### 访问令牌 vs 刷新令牌

```
+-------------------------+        +---------------------------+
|     访问令牌             |        |      刷新令牌              |
|                         |        |                           |
| 格式：  JWT（签名）      |        | 格式：不透明字符串          |
| TTL：   15 分钟          |        | TTL：  30 天              |
| 存储：  仅内存           |        | 存储：HttpOnly cookie     |
|         （不用            |        |        + 数据库记录        |
|          localStorage） |        |                           |
| 用途：  每次 API 调用    |        | 用途：旧访问令牌过期时      |
|         （Authorization  |        |        获取新的访问令牌     |
|          头部）          |        |                           |
| 验证：  本地             |        | 验证：需要数据库查询        |
|         （无网络调用）    |        |                           |
| 撤销：  困难             |        | 撤销：容易                 |
|         （等待过期）      |        |       （从数据库删除）      |
|         或黑名单         |        |                           |
+-------------------------+        +---------------------------+
```

### 令牌轮换策略

```
客户端                             认证服务器
  |                                   |
  |-- POST /auth/refresh ------------>|
  |   { refresh_token: "rt_OLD" }     |
  |                                   |
  |                   +---------------+
  |                   | 1. 在数据库中验证 rt_OLD 的哈希
  |                   | 2. 检查会话未被撤销
  |                   | 3. 检查会话未过期
  |                   | 4. 签发新的 access_token（JWT）
  |                   | 5. 签发新的 rt_NEW
  |                   | 6. 原子操作：
  |                   |    - 将 rt_OLD 标记为已使用/已轮换
  |                   |    - 将 rt_NEW 的哈希存储到数据库
  |                   +---------------+
  |                                   |
  |<-- 200 OK -----------------------|
  |   { access_token: "...",          |
  |     refresh_token: "rt_NEW" }     |
  |                                   |
  | [如果 rt_OLD 之后再次被使用：]      |
  |-- POST /auth/refresh ------------>|
  |   { refresh_token: "rt_OLD" }     |
  |                                   |
  |                   +---------------+
  |                   | rt_OLD 已经被使用过！
  |                   | 检测到重用：
  |                   | -> 撤销整个会话（包括 rt_NEW）
  |                   | -> 警告用户可能存在令牌被盗
  |                   +---------------+
  |<-- 401 Unauthorized --------------|
```

刷新令牌轮换配合重用检测可以防止刷新令牌被盗：如果被盗的令牌被使用，合法用户的下一次刷新尝试将触发检测并撤销整个会话。

---

## 7. 深入探讨：基于会话的认证 vs 基于令牌的认证

```
+---------------------+---------------------------+---------------------------+
| 属性                 | 基于会话                   | 基于令牌 (JWT)             |
+---------------------+---------------------------+---------------------------+
| 状态存储             | 服务端（Redis/DB）          | 客户端（令牌本体）          |
| 可扩展性             | 需要共享存储                | 无状态，易于扩展            |
| 撤销                 | 即时（删除会话）            | 困难（等待过期或             |
|                     |                           |  维护黑名单）              |
| 令牌大小             | ~32 字节会话 ID            | ~300-500 字节 JWT          |
| 服务器内存           | 高（5 亿会话）              | 无（无状态）               |
| 跨域 SSO            | 棘手（cookie 域限制）       | 容易（在头部传递）           |
| 微服务               | 每个服务都需访问 Redis      | 使用公钥本地验证            |
| 移动应用             | 不便（cookie 管理）         | 自然（Authorization        |
|                     |                           |  头部）                   |
| 数据新鲜度           | 始终最新                   | 过期前可能过时              |
+---------------------+---------------------------+---------------------------+
```

### 混合方案（两全其美）

本系统采用混合方案：

```
1. 刷新令牌是不透明的（基于会话）：
   - 以哈希形式存储在数据库中 + 元数据存储在 Redis 中
   - 可即时撤销
   - 不向客户端暴露会话数据

2. 访问令牌是 JWT（无状态）：
   - 15 分钟 TTL 限制了数据过时窗口
   - 服务使用公钥本地验证（无网络调用）
   - 嵌入角色/权限实现零延迟授权

3. SSO 会话在服务端通过 Redis 跟踪：
   - 中央 SSO 会话 ID（sid）嵌入 JWT 中
   - 浏览器保存 HttpOnly SSO 会话 cookie
   - Redis 条目：sid -> { user_id, apps[], last_active }
```

---

## 8. 深入探讨：OAuth 2.0 流程

### 授权码 + PKCE（推荐用于 Web 和移动端）

```
浏览器 / 应用                   认证服务器                资源服务器（API）
     |                             |                           |
     | 1. 生成 code_verifier       |                           |
     |    code_challenge = S256(verifier)                      |
     |                             |                           |
     | 2. GET /oauth/authorize     |                           |
     |    ?client_id=app_123       |                           |
     |    &response_type=code      |                           |
     |    &redirect_uri=...        |                           |
     |    &scope=openid+profile    |                           |
     |    &state=csrf_token        |                           |
     |    &code_challenge=...      |                           |
     |    &code_challenge_method=S256                          |
     +----------------------------->                           |
     |                             |                           |
     |          [显示登录界面]       |                           |
     |          [用户进行认证]       |                           |
     |                             |                           |
     | 3. 重定向到                  |                           |
     |    redirect_uri?code=AUTH_CODE&state=csrf_token         |
     <-----------------------------+                           |
     |                             |                           |
     | 4. 验证 state == csrf_token                             |
     |                             |                           |
     | 5. POST /oauth/token        |                           |
     |    grant_type=authorization_code                        |
     |    &code=AUTH_CODE          |                           |
     |    &code_verifier=VERIFIER  |                           |
     +----------------------------->                           |
     |                             |                           |
     |          [服务器验证：       |                           |
     |           S256(verifier) == |                           |
     |           存储的 challenge]  |                           |
     |                             |                           |
     | 6. { access_token, id_token, refresh_token }           |
     <-----------------------------+                           |
     |                             |                           |
     | 7. GET /api/resource        |                           |
     |    Authorization: Bearer access_token                   |
     +----------------------------------------------->        |
     |                             |    [本地验证 JWT]         |
     |                             |    [无网络调用]           |
     | 8. 资源数据                  |                           |
     <-----------------------------------------------+        |
```

### 客户端凭证（机器对机器）

```
服务 A                           认证服务器                服务 B（API）
   |                                |                        |
   | POST /oauth/token              |                        |
   |   grant_type=client_credentials|                        |
   |   &client_id=svc_A_id         |                        |
   |   &client_secret=svc_A_secret |                        |
   +-------------------------------->                        |
   |                                |                        |
   | { access_token, expires_in }   |                        |
   <--------------------------------+                        |
   |                                |                        |
   | GET /api/internal              |                        |
   |   Authorization: Bearer token  |                        |
   +------------------------------------------------->       |
   | 200 OK + data                  |                        |
   <-------------------------------------------------+       |
```

### 设备码流程（智能电视、CLI）

```
设备（电视/CLI）          认证服务器            用户的手机/浏览器
      |                       |                         |
      | POST /oauth/device    |                         |
      | { client_id }         |                         |
      +----------------------->                         |
      |                       |                         |
      | { device_code,        |                         |
      |   user_code: "BDFH-JLNP", |                    |
      |   verification_uri: "https://auth.example.com/activate",
      |   interval: 5 }       |                         |
      <-----------------------+                         |
      |                       |                         |
      | 在屏幕上显示            |                         |
      | user_code + URI       |                         |
      |                       | 用户打开 URI，输入        |
      |                       | user_code，进行认证       |
      |                       <-------------------------+
      |                       |                         |
      | 轮询：POST /oauth/token|                        |
      | grant_type=device_code |                        |
      | &device_code=...       |                        |
      +----------------------->                         |
      |                       | （返回 authorization_pending）
      <-----------------------+                         |
      |                                                 |
      | [用户批准后]            |                         |
      | 轮询：POST /oauth/token|                        |
      +----------------------->                         |
      |                       |                         |
      | { access_token, ... } |                         |
      <-----------------------+                         |
```

---

## 9. 深入探讨：OpenID Connect (OIDC)

OIDC 是 OAuth 2.0 之上的身份层。它增加了：

1. **ID Token** — 一个签名的 JWT，断言用户身份（不用于 API 访问）
2. **UserInfo 端点** — 附加的用户声明
3. **发现文档** — 机器可读的配置

### ID Token 声明

```json
{
  "iss": "https://auth.example.com",
  "sub": "usr_01J8X...",
  "aud": "app_123",               // 必须匹配 client_id
  "exp": 1740788100,
  "iat": 1740787200,
  "auth_time": 1740787100,        // 认证发生的时间
  "nonce": "client_nonce_abc",    // 防重放攻击
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",
  "picture": "https://cdn.example.com/avatars/alice.jpg",
  "locale": "en-US",
  "acr": "urn:mace:incommon:iap:silver", // 认证上下文类别
  "amr": ["pwd", "otp"]          // 认证方法引用
}
```

### OIDC 发现文档

```
GET /.well-known/openid-configuration
Response:
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/oauth/authorize",
  "token_endpoint": "https://auth.example.com/oauth/token",
  "userinfo_endpoint": "https://auth.example.com/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "registration_endpoint": "https://auth.example.com/oauth/register",
  "scopes_supported": ["openid", "profile", "email", "phone", "address"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["ES256"],
  "claims_supported": ["sub", "email", "name", "picture", "locale"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "private_key_jwt"]
}
```

### JWKS（JSON Web Key Set）用于密钥轮换

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "kid": "key-202603",
      "use": "sig",
      "alg": "ES256",
      "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
      "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"
    },
    {
      "kty": "EC",
      "crv": "P-256",
      "kid": "key-202302",    // 旧密钥，对轮换前签发的令牌仍然有效
      "use": "sig",
      "alg": "ES256",
      "x": "...",
      "y": "..."
    }
  ]
}
```

密钥轮换：生成新密钥，在 JWKS 中同时发布新旧密钥。服务缓存 JWKS，TTL 为 1 小时。轮换窗口期（24 小时）过后，移除旧密钥。

---

## 10. 深入探讨：SAML 2.0 企业级 SSO

### 参与方和术语

```
+------------------+     +------------------+
| 服务提供商        |     | 身份提供商        |
|      (SP)        |     |      (IdP)       |
|                  |     |                  |
| 你的应用 /        |     | Auth.example.com |
| 客户的 SaaS      |     | 或               |
|                  |     | Okta / Azure AD  |
+------------------+     +------------------+
```

### SP 发起的流程（最常见）

```
浏览器                      SP（你的应用）            IdP（Okta/Azure）
  |                             |                       |
  | 1. GET /app/dashboard       |                       |
  +----------------------------->                       |
  |                             |                       |
  | 2. 302 重定向到 IdP 并携带    |                       |
  |    SAML AuthnRequest（编码） |                       |
  <-----------------------------+                       |
  |                             |                       |
  | 3. GET /idp/sso?SAMLRequest=...                     |
  +---------------------------------------------------->|
  |                             |                       |
  |          [IdP 显示登录界面，用户进行认证]               |
  |                             |                       |
  | 4. POST /sp/acs（断言消费服务）                        |
  |    SAMLResponse（SAML 断言，由 IdP 签名）              |
  <----------------------------------------------------+|
  |                             |                       |
  | 5. POST /sp/acs             |                       |
  |    携带 SAMLResponse        |                       |
  +----------------------------->                       |
  |                             |                       |
  |          [SP 验证：          |                       |
  |           - IdP 签名        |                       |
  |           - 签发者匹配       |                       |
  |           - NotBefore/      |                       |
  |             NotOnOrAfter    |                       |
  |           - InResponseTo ID |                       |
  |           - 接收方 URI]      |                       |
  |                             |                       |
  | 6. 302 重定向到 /app/dashboard|                      |
  |   （携带会话 cookie）         |                       |
  <-----------------------------+                       |
```

### SAML 断言结构

```xml
<saml:Assertion ID="_abc123" IssueInstant="2026-03-01T00:00:00Z"
  Version="2.0" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">

  <saml:Issuer>https://idp.okta.com</saml:Issuer>

  <ds:Signature><!-- 断言的 RSA-SHA256 签名 --></ds:Signature>

  <saml:Subject>
    <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
      alice@enterprise.com
    </saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
      <saml:SubjectConfirmationData
        InResponseTo="_req456"
        NotOnOrAfter="2026-03-01T00:05:00Z"
        Recipient="https://yourapp.com/sp/acs"/>
    </saml:SubjectConfirmation>
  </saml:Subject>

  <saml:Conditions
    NotBefore="2026-03-01T00:00:00Z"
    NotOnOrAfter="2026-03-01T00:05:00Z">
    <saml:AudienceRestriction>
      <saml:Audience>https://yourapp.com</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>

  <saml:AttributeStatement>
    <saml:Attribute Name="email">
      <saml:AttributeValue>alice@enterprise.com</saml:AttributeValue>
    </saml:Attribute>
    <saml:Attribute Name="groups">
      <saml:AttributeValue>engineering</saml:AttributeValue>
      <saml:AttributeValue>admins</saml:AttributeValue>
    </saml:Attribute>
  </saml:AttributeStatement>

</saml:Assertion>
```

---

## 11. 深入探讨：SSO 架构

### 集中式身份提供商与会话联合

```
+-----------+     +-----------+     +-----------+
|  应用 A   |     |  应用 B    |     |  应用 C   |
| (wiki.co) |     | (crm.co)  |     |(mail.co)  |
+-----+-----+     +-----+-----+     +-----+-----+
      |                 |                 |
      | 重定向到 IdP     | 重定向到 IdP     | 重定向到 IdP
      |   进行 SSO      |   进行 SSO      |   进行 SSO
      |                 |                 |
      +--------+--------+---------+-------+
               |                  |
               v                  |
   +-----------+-----------+      |
   |    身份提供商           |      |
   |   (auth.example.com)  |<-----+
   |                       |
   | +-------------------+ |
   | |  SSO 会话存储      | |
   | |  (Redis)          | |
   | |  sid -> {         | |
   | |   user_id,        | |
   | |   auth_time,      | |
   | |   apps_logged_in, | |
   | |   last_active     | |
   | |  }                | |
   | +-------------------+ |
   +-----------+-----------+
               |
    用户只需登录一次到 IdP
    IdP 签发 SSO 会话 cookie（.example.com）
    所有应用重定向到 IdP 并获得静默授权
    （无需重新认证）
```

### SSO 会话 Cookie 作用域

```
Domain: .example.com（跨子域共享）
HttpOnly: true        （JavaScript 无法读取）
Secure: true          （仅 HTTPS）
SameSite: Lax         （CSRF 防护，允许顶级导航）
Path: /
Max-Age: 28800        （8 小时）
Name: __Host-sso_sid  （前缀防止子域覆盖）
```

### 单点登出（SLO）

```
用户从应用 A 登出
      |
      v
应用 A -> POST /slo?token=... 到 IdP
      |
      v
IdP 删除 Redis 中的 SSO 会话
      |
      v
IdP 向所有在此 SSO 会话下有活跃会话的应用
发送登出通知（后端通道）：
  POST App_B /backchannel-logout  { "logout_token": "..." }
  POST App_C /backchannel-logout  { "logout_token": "..." }
      |
      v
每个应用撤销该用户的本地会话
```

---

## 12. 深入探讨：多因素认证

### TOTP（基于时间的一次性密码）— RFC 6238

```
注册：
  服务器生成 20 字节的随机密钥
  编码为 Base32："JBSWY3DPEHPK3PXP"
  以 AES-256 加密后存储在数据库中
  显示二维码：otpauth://totp/MyApp:alice@example.com?secret=JBSWY3...&issuer=MyApp

验证：
  code = HOTP(secret, floor(unix_time / 30))
  HOTP = HMAC-SHA1(secret, counter) 截断为 6 位数字

  允许 T-1、T、T+1 窗口（3 个验证码）以适应时钟偏差
  速率限制：最多 5 次尝试后锁定
  防重放：跟踪最后使用的计数器

+-------------------+       +---------------------+
| 认证器应用         |       | 认证服务器            |
| (Google Auth)     |       |                      |
|                   |       |                      |
| 共享密钥          |       | 相同的密钥            |
| 时钟：Unix 时间    |       | 时钟：Unix 时间       |
|                   |       |                      |
| TOTP 验证码：     | ----> | 计算预期值：           |
| 123456            |       | 123456（匹配！）      |
| 每 30 秒变化一次   |       | 接受登录              |
+-------------------+       +---------------------+
```

### WebAuthn / FIDO2（防钓鱼）

```
注册：
  服务器发送挑战
  认证器（硬件密钥/设备生物识别）创建：
    - 公私钥对（每个来源、每个凭证）
    - 证明声明（证明认证器型号）
  服务器存储：公钥 + 凭证 ID + AAGUID

认证：
  服务器发送挑战
  认证器签名：{ challenge + origin + rpId + counter }
    使用存储的私钥
  服务器验证：
    1. 签名对照存储的公钥有效
    2. origin 匹配预期（防钓鱼——绑定域名！）
    3. counter > 存储的计数器（克隆检测）
    4. rpId 哈希匹配

+------------------+         +----------------+
| 浏览器 + FIDO2    |         | 认证服务器      |
| 认证器            |         |                |
| (YubiKey / TPM)  |         |                |
|                  |         |                |
| 私钥              |         | 公钥           |
| （永不离开         |         | （存储在数据库） |
|  设备）           |         |                |
|                  |         |                |
| 签名挑战          | ------> | 验证签名        |
| 使用私钥          |         | 使用公钥        |
|                  |         |                |
| 绑定来源：         |         | 防钓鱼：        |
| 不会为             |         | 攻击者无法      |
| evil.example.com  |         | 使用凭证        |
| 签名              |         |                |
+------------------+         +----------------+
```

### MFA 比较

```
+------------------+----------+-------------------+------------------+
| 方法              | 防钓鱼    | 可用性             | 恢复方式          |
|                  |          |                   |                  |
+------------------+----------+-------------------+------------------+
| SMS OTP          | 否       | 高                | 通过手机号码      |
| TOTP（应用）      | 否       | 中                | 备份码           |
| WebAuthn/FIDO2   | 是       | 高（生物识别）      | 备用密钥          |
| 硬件密钥          | 是       | 中                | 备用密钥          |
| 邮件 OTP         | 否       | 高                | 通过邮箱          |
| Passkey          | 是       | 非常高             | iCloud/账户       |
+------------------+----------+-------------------+------------------+
```

**为什么短信不安全：** SS7 协议漏洞允许 SIM 卡交换和拦截。使用 TOTP 或 WebAuthn 作为主要 MFA。仅在用户明确确认风险后允许短信作为备用方案。

---

## 13. 深入探讨：密码存储

### 永远不要存储明文或快速哈希

```
禁止：
  明文：    "p@ssw0rd"
  MD5：     5f4dcc3b5aa765d61d8327deb882cf99
  SHA-1：   cbfdac6008f9cab4083784cbd1874f76618d2a97
  SHA-256： （速度快——GPU 每秒可计算数十亿次）
  bcrypt(cost=4)：对现代硬件来说太快

必须使用：Argon2id（2015 年密码哈希竞赛优胜者）
```

### Argon2id 参数

```
argon2id(
  password:    用户密码
  salt:        32 字节密码学随机值（与哈希一起存储）
  memory:      64 MB  (m=65536)  -- 使 GPU/ASIC 攻击代价高昂
  iterations:  3      (t=3)      -- 时间因子
  parallelism: 4      (p=4)      -- 使用的线程数
  hash_length: 32 字节
)

数据库中存储的输出：
  $argon2id$v=19$m=65536,t=3,p=4$
  <base64_salt>$<base64_hash>

验证：
  使用相同参数 + 存储的 salt 重新计算
  常量时间比较（防止时序攻击）
```

### 加盐加胡椒（纵深防御）

```
Pepper = 32 字节密钥存储在 Vault 中（不在数据库中）

存储的哈希：
  argon2id(password + pepper, salt, params)

如果数据库被泄露：
  攻击者拥有：hash + salt
  缺少：      pepper（在 Vault 中，不同的攻击面）
  无法破解：  没有 pepper 的哈希

如果需要轮换 pepper：
  在用户下次登录时，使用新 pepper 重新哈希
```

### 密码重置流程（安全）

```
1. 用户请求重置
   -> 生成密码学随机 32 字节令牌
   -> 将 SHA-256(token) 存储在数据库中，1 小时过期
   -> 发送包含令牌 URL 的邮件（永远不存储原始令牌）

2. 用户点击链接
   -> 从 URL 中提取令牌
   -> 计算 SHA-256(token)，在数据库中查找
   -> 验证过期时间，标记为已使用（一次性）
   -> 允许更改密码
   -> 撤销该用户的所有现有会话
   -> 发送确认邮件

3. 防枚举
   -> 始终回复"如果该邮箱存在，您将收到重置链接"
   -> 无论邮箱是否存在，响应时间相同
   -> 速率限制：每小时每个邮箱最多 3 次重置
```

---

## 14. 深入探讨：令牌撤销策略

### 挑战：JWT 是无状态的

一旦签发，JWT 在过期之前无法被撤销。三种策略：

```
策略 1：短期访问令牌（15 分钟 TTL）
+---------------------------------------------------------+
| 撤销在下次刷新时生效，最多 15 分钟内                      |
| 访问令牌无需黑名单                                       |
| 通过使刷新令牌失效实现即时撤销                             |
| 代价：稍微增加刷新请求                                    |
+---------------------------------------------------------+

策略 2：Jti 黑名单（Redis）
+---------------------------------------------------------+
| 将已撤销的 JWT ID（jti）存储在 Redis 中直到令牌过期       |
| 每次令牌验证时检查黑名单                                  |
| 内存：每个已撤销令牌约 100 字节                           |
|                                                        |
| SET revoked:{jti} 1 EX 900  （随令牌过期）               |
|                                                        |
| 代价：每次 API 调用需要一次 Redis 查询                    |
| 对于高 QPS API，在本地缓存中维护黑名单                    |
| （每 30 秒从 Redis 刷新）                                |
+---------------------------------------------------------+

策略 3：令牌内省（RFC 7662）
+---------------------------------------------------------+
| 服务在接受令牌前调用 /oauth/introspect                    |
| 认证服务器响应 active: true/false                         |
| 代价：每次请求需要网络调用（大规模下太慢）                  |
| 仅用于高价值操作或外部客户端                               |
+---------------------------------------------------------+
```

### 推荐架构

```
快速路径（99.9% 的请求）：
  API 网关 -> 本地验证 JWT 签名（< 1ms）
           -> 检查本地内存撤销缓存（< 0.1ms）
           -> 如果有效则继续处理

撤销事件：
  登出 -> Redis SET revoked:{jti} 1 EX {remaining_ttl}
       -> 通过 Pub/Sub 广播到所有网关实例
       -> 每个网关刷新其本地缓存

缓存一致性：
  本地缓存 TTL：30 秒
  最大过时时间：30 秒（大多数情况下可接受）
  对于关键操作：绕过缓存，直接检查 Redis
```

---

## 15. 深入探讨：社交登录集成

### 联合架构

```
+----------+     +-----------+     +------------------+
| 你的应用  |     | 认证       |     | Google / GitHub  |
|          |     | 服务       |     | / Apple          |
+----+-----+     +-----+-----+     +--------+---------+
     |                 |                    |
     | 1. 用户点击     |                    |
     |    "使用        |                    |
     |    Google 登录" |                    |
     |                 |                    |
     | 2. 重定向到     |                    |
     |    /auth/social/|                    |
     |    google/begin |                    |
     +---------------->|                    |
     |                 |                    |
     |                 | 3. 重定向到         |
     |                 |    Google OAuth    |
     <-----------------+                    |
     |                                      |
     | 4. 用户在 Google 上认证               |
     |                                      |
     |                 | 5. 携带 code        |
     |                 |    回调             |
     +---------------->|                    |
     |                 |                    |
     |                 | 6. 用 code 交换     |
     |                 |    id_token        |
     |                 +------------------->|
     |                 | 7. id_token + 用户  |
     |                 |    资料             |
     |                 <-------------------+|
     |                 |                    |
     |                 | 8. 验证 id_token    |
     |                 |    （Google 的 JWK）|
     |                 |                    |
     |                 | 9. 关联或创建        |
     |                 |    本地用户：        |
     |                 |    - 查找           |
     |                 |      social_identities
     |                 |    - 如果找到：      |
     |                 |      返回用户       |
     |                 |    - 如果按          |
     |                 |      provider_id   |
     |                 |      未找到：       |
     |                 |      检查 users    |
     |                 |      表中的邮箱     |
     |                 |    - 如果邮箱匹配：  |
     |                 |      关联账户       |
     |                 |    - 否则创建       |
     |                 |      新用户         |
     |                 |                    |
     | 10. 签发        |                    |
     |     access +    |                    |
     |     refresh     |                    |
     |     令牌         |                    |
     <-----------------+                    |
```

### 账户关联安全

```
风险："预劫持"攻击
  攻击者使用 alice@example.com 创建账户
  Alice 之后使用"使用 Google 登录"（相同邮箱）
  系统自动关联 -> 攻击者拥有了 Alice 的账户！

防御：
  1. 关联前要求邮箱验证
  2. 对于新的社交登录注册：仅在提供商确认邮箱时
     设置 email_verified = true（Google 会确认，有些不会）
  3. 向现有邮箱发送"新登录方式已关联"通知
  4. 提供明确的"关联账户"流程（而非静默自动关联）
```

---

## 16. 深入探讨：基于角色的访问控制 vs 基于属性的访问控制

### RBAC（基于角色的访问控制）

```
用户 -> 角色 -> 权限

alice -> [editor, viewer]
editor -> [articles:write, articles:read, comments:write]
viewer -> [articles:read, comments:read]

alice 的有效权限：
  articles:write, articles:read, comments:write, comments:read

JWT 中的实现：
  "roles": ["editor"],
  "permissions": ["articles:write", "articles:read", "comments:write"]
```

RBAC 简单、可审计，适用于大多数应用。局限性：当需要细粒度访问控制时会出现"角色爆炸"（例如，"可以编辑自己撰写的文章"）。

### ABAC（基于属性的访问控制）

```
策略：允许 如果 user.department == resource.department
      且 action == "read"
      且 time.hour 在 9 到 17 之间

使用策略引擎（OPA、Casbin）在运行时评估：

主体属性：  { user_id, department, clearance_level, location }
资源属性：  { owner_id, department, classification, created_at }
操作：      read | write | delete
环境：      { time, ip_address, device_trust_level }

OPA 策略示例：
allow {
  input.action == "read"
  input.user.department == input.resource.department
  input.user.clearance_level >= input.resource.classification
}
```

### RBAC 与 ABAC 的选择

```
+---------------------+---------------------------+---------------------------+
| 维度                 | RBAC                      | ABAC                      |
+---------------------+---------------------------+---------------------------+
| 复杂度               | 低                        | 高                        |
| 性能                 | 快（缓存在令牌中）          | 较慢（策略评估）            |
| 灵活性               | 低（角色爆炸）              | 非常高                    |
| 可审计性              | 容易                      | 较难                      |
| 用例                 | 固定角色的 SaaS            | 医疗、金融、政府            |
+---------------------+---------------------------+---------------------------+
```

建议：从 RBAC 开始，在 JWT 中嵌入角色/权限。对需要细粒度控制的特定资源添加 ABAC（在资源服务中使用 OPA 评估资源级策略）。

---

## 17. 深入探讨：速率限制与账户安全

### 登录速率限制策略

```
多维度速率限制：

1. 按 IP 速率限制：
   Key: ratelimit:ip:{ip_address}:login
   限制：每分钟 10 次尝试
   算法：令牌桶（允许小规模突发）

2. 按用户名速率限制：
   Key: ratelimit:user:{email}:login
   限制：15 分钟内 5 次失败
   算法：固定窗口

3. 全局速率限制：
   Key: ratelimit:global:login
   限制：50,000/秒（在负载均衡器层强制执行）

4. CAPTCHA 触发：
   同一 IP 或用户名连续 3 次失败后
   先使用不可见 reCAPTCHA，重复失败后使用可见验证

5. 账户锁定（渐进式）：
   5 次失败：30 秒锁定
   10 次失败：5 分钟锁定
   20 次失败：1 小时锁定
   30 次失败：需要管理员解锁或邮箱验证
```

### 可疑登录检测

```
每次登录评估的风险信号：

+---------------------------+---------------+
| 信号                       | 风险评分       |
+---------------------------+---------------+
| 新设备（无 cookie）         | +20           |
| 新国家                     | +30           |
| 新城市（> 100km）          | +15           |
| 不可能的旅行（< 1 小时）    | +50           |
|   （例如，洛杉矶后伦敦）    |               |
| Tor/VPN IP                | +25           |
| 已知恶意 IP（威胁情报）     | +70           |
| MFA 验证失败               | +40           |
| 异常时间（当地凌晨 3 点）   | +10           |
+---------------------------+---------------+

总分：
  0-30：  允许，无额外摩擦
  31-60： 要求 MFA（即使未注册 -> 发送邮箱 OTP）
  61-80： 要求邮箱验证 + MFA
  81+：   阻止 + 通知用户 + 需要管理员审核
```

---

## 18. 深入探讨：无密码认证

### 魔法链接

```
1. 用户输入邮箱，点击"发送魔法链接"

2. 服务器：
   - 生成密码学随机 32 字节令牌
   - 将 SHA-256(token) 存储在 Redis 中：SET ml:{hash} {user_id} EX 900
   - 发送邮件："点击此处登录：https://app.com/auth/magic?token=RAW_TOKEN"

3. 用户点击链接：
   - 从 URL 中提取令牌
   - 计算 SHA-256(token)，在 Redis 中查找
   - 如果找到且未过期：认证用户，删除键（一次性使用）
   - 签发会话令牌

安全性：
   - 令牌为一次性使用（使用后删除）
   - 15 分钟过期
   - 速率限制：每小时每个邮箱最多 3 个魔法链接
   - 永远不记录或暴露原始令牌
   - 强制 HTTPS（令牌在 URL 查询参数中——使用 POST 表单更安全）
```

### Passkey（以 WebAuthn 作为主要认证）

```
注册：
  用户认证一次（或创建账户）
  创建 Passkey：设备生成密钥对
  私钥留在设备上（Secure Enclave / TPM）
  公钥存储在服务器上

登录（无需密码！）：
  用户输入邮箱或用户名
  服务器发送 WebAuthn 挑战
  设备提示生物识别（Touch ID、Face ID、Windows Hello）
  设备使用私钥签名挑战
  服务器使用存储的公钥验证签名

跨设备同步：
  Apple：iCloud 钥匙串同步 Passkey
  Google：Google 密码管理器同步 Passkey
  跨平台：手机上的 Passkey 通过蓝牙认证笔记本（混合传输）

用户体验：
  按指纹或面部 -> 2 秒内完成认证
  防钓鱼（绑定来源）
  无需记忆或泄露密码
```

---

## 19. 深入探讨：会话管理

### Redis 会话存储结构

```
Key:   session:{session_id}
TTL:   滑动（每次访问时重置）
Value: {
  "user_id": "usr_01J8X...",
  "email": "alice@example.com",
  "roles": ["editor"],
  "auth_time": 1740787200,
  "ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "mfa_verified": true,
  "device_id": "dev_01J8X...",
  "refresh_token_family": "fam_01J8X...",  // 用于刷新令牌轮换
  "created_at": 1740787200,
  "last_active": 1740788000,
  "sso_session_id": "sso_01J8X..."        // 父级 SSO 会话
}
```

### 并发会话管理

```
用户会话索引：
  Key:   user_sessions:{user_id}
  Type:  Redis 有序集合
  Score: last_active 时间戳
  Value: session_id

操作：
  登录时：  ZADD user_sessions:{uid} {timestamp} {sid}
  活动时：  ZADD user_sessions:{uid} {timestamp} {sid}（更新插入）
  登出时：  ZREM user_sessions:{uid} {sid}

限制执行（最多 10 个并发会话）：
  Count = ZCARD user_sessions:{uid}
  如果 count >= 10：ZPOPMIN user_sessions:{uid} 1（驱逐最旧的）
                   -> 同时在数据库中撤销该会话

用户的会话列表：
  ZRANGEBYSCORE user_sessions:{uid} -inf +inf WITHSCORES
  -> 在账户设置中显示设备列表
```

### 滑动过期

```
每个 Redis 会话键在使用时重置 TTL：

   最后活跃时间：T
   空闲 TTL：    8 小时

   在 T+7h：用户发起请求
   -> 会话 TTL 重置为 T+7h + 8h = T+15h
   -> 只要用户活跃就保持登录状态

   在 T+29d：绝对最大生命周期
   -> 会话强制过期，不论活动状态
   -> 用户必须重新认证
```

---

## 20. 扩展策略

### 全局架构

```
+------------------------------------------------------------------+
|                        DNS: GeoDNS + Anycast                    |
+------------------+------------------+----------------------------+
                   |                  |
         +---------+--------+  +------+---------+
         | US-EAST 区域      |  | EU-WEST 区域   |  (+ AP-EAST)
         |                  |  |                |
         | 认证服务           |  | 认证服务        |
         | （100 个 Pod）    |  | （50 个 Pod）   |
         |                  |  |                |
         | Redis 集群        |  | Redis 集群      |  <- 本地会话
         | （主节点）         |  | （副本）         |     缓存
         |                  |  |                |
         | PostgreSQL       |  | PostgreSQL     |  <- 读副本
         | 读副本            |  | 读副本          |
         +------------------+  +----------------+
                |                       |
                +-------+-------+-------+
                        |
              +---------+---------+
              | 全局主数据库        |
              | （PostgreSQL +    |
              |  Patroni HA）     |
              | US-EAST（主节点）  |
              +---------+---------+
```

### 认证服务的水平扩展

```
登录路径（写密集型）：
  - 无状态认证 Pod（任何 Pod 处理任何请求）
  - Argon2id 哈希：CPU 密集型，通过增加 Pod 扩展
  - 数据库写入到主 PostgreSQL
  - Redis 写入到主集群

令牌验证路径（读密集型，流量为登录的 10 倍）：
  - 在 API 网关层处理，不经过认证服务
  - 公钥缓存在内存中（JWKS 缓存 1 小时）
  - 验证无需网络调用到认证服务
  - 随 API 服务独立扩展

会话查询路径：
  - 每个区域都有 Redis 读副本
  - 同区域延迟 < 5ms
  - 跨区域会话状态最终一致
```

### 数据库分片策略

```
Users 表：按 user_id 前缀分片
  分片 0：user_id 以 0-3 开头
  分片 1：user_id 以 4-7 开头
  分片 2：user_id 以 8-b 开头
  分片 3：user_id 以 c-f 开头

Sessions 表：临时性，存储在 Redis 中
  PostgreSQL sessions 表：仅元数据，一次写入
  按 user_id 分片以与用户数据共置

审计日志：时间序列分区
  按月分区
  热：最近 3 个月在 SSD 上（PostgreSQL）
  温：3-12 个月在 HDD 上
  冷：> 12 个月在 S3 上（Parquet 格式，可通过 Athena 查询）
```

### 缓存策略

```
第 1 层：JWT 公钥（JWKS）
  API 服务的内存中
  TTL：1 小时，后台刷新
  通过密钥轮换事件失效

第 2 层：用户资料缓存
  Redis：user:{user_id}:profile
  TTL：5 分钟
  资料更新时失效

第 3 层：撤销黑名单
  每个 API 网关实例的内存 HashMap
  每 30 秒从 Redis 刷新
  通过 Pub/Sub 即时处理关键撤销

第 4 层：RBAC 权限
  在登录时计算并嵌入 JWT 中
  对于角色变更：短 JWT TTL 确保 15 分钟内刷新
  对于即时撤销：通过 jti 黑名单失效
```

---

## 21. 权衡取舍

### JWT vs 不透明令牌

**选择 JWT 作为访问令牌的原因：**
- 验证无需网络调用（< 1ms vs Redis 的 5ms+）
- 跨微服务工作，无需共享会话存储
- 自包含：嵌入角色、权限、声明

**权衡：** 无法即时撤销 JWT。缓解措施：
- 短 TTL（15 分钟）
- 带本地缓存的 jti 黑名单，用于关键撤销

### 无状态 vs 有状态会话

**选择混合方案的原因：**
- 刷新令牌必须可撤销（有状态，存储在数据库 + Redis 中）
- 访问令牌受益于无状态性（JWT）
- SSO 会话需要服务端跟踪以支持 SLO

### Argon2id 哈希 vs 速度

**尽管较慢仍选择 Argon2id 的原因：**
- 300ms 的哈希时间是有意为之——使暴力破解不可行
- 在 5 万次/秒的峰值登录下：需要专用的哈希工作池
- 使用异步队列：接受登录请求，入队哈希任务，完成后返回
- 队列吸收突发流量，防止认证服务过载

```
登录请求 -> 队列（Kafka/SQS）-> 哈希工作池（N 个 Pod）
                              -> 通过关联 ID 返回结果
```

### 集中式 IdP vs 去中心化认证

**选择集中式 IdP 的原因：**
- 单一审计追踪
- 一致的安全策略执行
- 更简单的 MFA 和 SSO
- 权衡：单点故障（通过 99.999% 高可用目标缓解）

---

## 22. 常见面试追问

**问：如何在大规模下进行令牌验证而不访问认证服务？**

答：API 服务使用公钥（来自 JWKS，缓存在内存中）在本地验证 JWT。JWT 经过密码学签名——服务只需要公钥，不需要访问认证服务器的网络连接。公钥在启动时获取一次，每小时刷新一次。对于撤销，我们维护一个小型内存黑名单，存储最近撤销的 JTI，每 30 秒从 Redis 刷新。这实现了 < 1ms 的验证，最大撤销过时时间为 30 秒。

**问：如何防止 OAuth 流程中的 CSRF 攻击？**

答：两层防护。首先，OAuth 授权请求中的 `state` 参数是与用户浏览器会话绑定的随机 CSRF 令牌。回调在交换授权码之前验证 state 是否匹配。其次，我们在会话 cookie 上使用 `SameSite=Lax`，它阻止跨源表单 POST 攻击，同时允许顶级 OAuth 重定向。

**问：如果 Redis 集群宕机会怎样？**

答：Redis 用于会话和撤销黑名单。对于会话：我们使用 3 个节点加读副本的 Redis 集群。如果 Redis 不可用，我们降级到"优雅降级"模式：现有的有效 JWT 继续工作（无状态验证），但新的登录将失败直到 Redis 恢复。自动故障转移的恢复时间通常 < 30 秒。对于撤销黑名单：在 Redis 故障期间，我们跳过黑名单检查，依赖短 JWT TTL（15 分钟）作为安全网。

**问：如何实现"记住我"功能？**

答："记住我"将刷新令牌的 TTL 从 30 天延长到 90 天。刷新令牌作为 HttpOnly Secure cookie 存储，并在数据库中有对应的会话记录。当使用"记住我"会话令牌时，我们在授予新的访问令牌之前重新验证最近的认证上下文（设备指纹、IP 区域）。可疑的上下文变化（新国家、新设备）即使对于已记住的会话也会触发 MFA。

**问：用户更改密码后如何处理？**

答：密码更改触发：（1）使该用户的所有现有刷新令牌失效（更新数据库中所有会话的 revoked_at），（2）向 Redis pub/sub 发布用户级撤销事件（所有 API 网关将 user_id 添加到"已撤销用户"缓存中），（3）为当前请求签发新会话。已撤销用户缓存是无状态 JWT 的例外：我们在 15 分钟窗口内检查用户级撤销，直到所有 JWT 自然过期。这确保密码更改对安全关键操作立即生效。

**问：如何扩展到每秒 50,000 次登录？**

答：Argon2id 每次哈希需要 300ms，意味着每个 CPU 核心每秒处理约 3 次哈希。对于 5 万次/秒的登录，仅哈希就需要约 16,667 个 CPU 核心。实际上：（1）5 万的峰值是突发性的，不是持续的；（2）我们使用一个独立于主认证服务的哈希工作池，基于队列的任务分发；（3）根据硬件调整 Argon2id 参数——更快的服务器允许更高的并行度（p 参数）以减少挂钟时间；（4）基于队列深度的自动扩展。对于渐进式增长事件，我们预先扩展工作池。

**问：如何防止账户枚举攻击？**

答：无论邮箱/用户名是否存在，都返回一致的响应：相同的响应时间（如果跳过哈希则使用常量时间延迟）、相同的错误消息（"无效的凭证"）。对于密码重置：始终回复"如果该邮箱存在，您将收到链接"并返回 202 Accepted。即使用户不存在也使用 Argon2id（防止时序攻击——计算一个虚拟哈希）。按 IP 限制速率以防止通过时序侧信道进行枚举。

**问：如何为跨域应用设计 SSO 会话？**

答：对于同域应用（app-a.example.com、app-b.example.com）：使用父域 SSO 会话 cookie（.example.com）。对于跨域应用：使用 OAuth/OIDC 的后端通道。SSO 会话 ID（sid）嵌入在 ID Token 中。每个应用维护自己的本地会话。当 IdP SSO 会话过期或被撤销时，IdP 向所有注册的应用发送后端通道登出通知。对于 SP 发起的登出，应用重定向到 IdP 登出端点，IdP 向 SSO 会话中的所有应用广播 SLO。

**问：JWT 中 authentication_time（auth_time）和 iat 有什么区别？**

答：`iat`（签发时间）是令牌创建的时间——可以是令牌刷新。`auth_time` 是用户实际使用凭证（密码 + MFA）进行认证的时间。对于高安全性操作（转账、更改邮箱），API 检查 `auth_time`，如果超过阈值（例如 15 分钟），则要求重新认证。这可以防止被盗的令牌被用于执行敏感操作（如果用户几小时前才认证过）。这就是"这个令牌何时制作"与"人类何时证明了自己的身份"之间的区别。

**问：你的系统如何防止"会话固定"攻击？**

答：通过在成功认证后重新生成会话 ID 来防止会话固定。如果攻击者在登录前设置了已知的会话 ID（通过 XSS 或其他方式），该会话 ID 在认证后将变为无效。我们始终在登录时生成新的会话 ID，丢弃任何认证前的会话上下文，并将会话绑定到用户代理 + IP 子网以进行额外验证。

---

## 23. 安全检查清单

```
+-----------------------------------------------+--------+
| 安全控制项                                      | 状态    |
+-----------------------------------------------+--------+
| 密码使用 Argon2id 哈希                          |  是     |
| Pepper 与 salt/hash 分开存储                    |  是     |
| 日志/数据库中无明文密码                           |  是     |
| JWT 使用 ES256 签名（非 HS256）                  |  是     |
| JWT 使用公钥验证（无密钥共享）                     |  是     |
| 刷新令牌以 SHA-256 哈希存储                       |  是     |
| 所有公共客户端要求 PKCE                           |  是     |
| 仅 HTTPS（强制 HSTS）                           |  是     |
| HttpOnly + Secure + SameSite cookies            |  是     |
| 通过 state 参数防 CSRF                           |  是     |
| 登录尝试的速率限制                                |  是     |
| 重复失败后账户锁定                                |  是     |
| MFA 支持（TOTP + WebAuthn）                     |  是     |
| 刷新令牌轮换及重用检测                             |  是     |
| 登出时令牌撤销                                    |  是     |
| 所有认证事件的审计日志                             |  是     |
| 密钥存储在 Vault 中（永不在代码/环境变量中）         |  是     |
| 令牌的常量时间字符串比较                            |  是     |
| 枚举防护（时序 + 响应）                            |  是     |
| 登录后会话 ID 重新生成                             |  是     |
+-----------------------------------------------+--------+
```
