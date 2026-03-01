# Design an Authentication & Single Sign-On System

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | User Registration | Sign up with email/password, or via social providers (Google, GitHub, Apple) |
| 2 | Login / Logout | Authenticate user identity, issue session tokens, and revoke them on logout |
| 3 | Single Sign-On (SSO) | One login grants access to multiple applications under the same identity provider |
| 4 | OAuth 2.0 / OIDC | Act as both an OAuth Authorization Server and an OpenID Connect Provider |
| 5 | SAML 2.0 Support | Enterprise SSO using SAML assertions for SP-initiated and IdP-initiated flows |
| 6 | Multi-Factor Authentication | TOTP (Google Authenticator), WebAuthn/FIDO2 passkeys, fallback SMS OTP |
| 7 | Passwordless Auth | Magic link via email, passkey-based authentication |
| 8 | Social Login | OAuth integration with Google, GitHub, Apple to federate identity |
| 9 | Token Management | Issue, refresh, rotate, and revoke access tokens and refresh tokens |
| 10 | Session Management | Server-side session store, sliding expiration, concurrent session limits |
| 11 | Role-Based Access Control | Assign roles and permissions, embed claims in tokens |
| 12 | Account Security | Rate limiting, account lockout, CAPTCHA, suspicious login detection |
| 13 | Password Management | Secure password storage, reset via email, breach detection |
| 14 | Audit Logging | Immutable log of all authentication events for compliance and forensics |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Login latency | < 200ms p99 (end-to-end) |
| 2 | Availability | 99.999% (< 5.26 min downtime/year) |
| 3 | Session lookup latency | < 5ms (Redis in-memory) |
| 4 | Token validation latency | < 1ms (local, no network call via JWT signature verification) |
| 5 | Password security | Zero plaintext password exposure, Argon2id hashing |
| 6 | Token expiry | Access tokens: 15 min; Refresh tokens: 30 days |
| 7 | Scalability | 100M total users, 10M DAU, 50K login/sec peak |
| 8 | Security compliance | SOC 2 Type II, ISO 27001, GDPR |
| 9 | Audit retention | 1 year hot, 7 years cold storage |
| 10 | Multi-region | Active-active across 3 regions with < 100ms replication lag |

### Scale Estimation

```
Users:
  Total registered users: 100M
  Daily Active Users (DAU): 10M
  Concurrent sessions peak: 500M active sessions stored in Redis

Login traffic:
  Average logins/day: 10M (each DAU logs in ~1 time)
  Avg logins/sec: 10M / 86,400 = ~116 logins/sec
  Peak multiplier: ~430x (flash events, Monday mornings)
  Peak logins/sec: 50,000

Token validation (most frequent operation):
  Each logged-in user makes ~50 API calls/day that need token validation
  Validations/day: 10M x 50 = 500M
  Avg validations/sec: ~5,800
  Peak validations/sec: ~50,000 (but done locally at API gateways, zero DB calls)

Session storage (Redis):
  500M active sessions x 512 bytes/session = ~256 GB
  With replication (3 replicas): ~768 GB total Redis memory

Refresh token operations:
  Refresh every 15 min per active session: 500M / 900s = ~555K refreshes/sec
  After deduplication (not every session refreshes simultaneously): ~50K/sec peak

Password hash compute (bcrypt/Argon2):
  50,000 logins/sec x ~300ms hashing time
  Requires ~15,000 CPU cores dedicated to hashing at peak
  (In practice: bursty, use dedicated auth worker pool)

Audit log storage:
  Events per login: ~5 events (login attempt, MFA, session created, token issued, etc.)
  Daily events: 10M x 5 = 50M events/day
  Event size: ~500 bytes
  Daily storage: 50M x 500B = ~25 GB/day
  Annual: ~9 TB/year
```

---

## 2. Authentication vs. Authorization Fundamentals

### Core Distinction

```
Authentication (AuthN)                 Authorization (AuthZ)
+------------------------------+       +------------------------------+
| WHO are you?                 |       | WHAT can you do?             |
|                              |       |                              |
| Verifies identity via:       |       | Grants/denies access via:    |
| - Password + username        |       | - Roles (RBAC)               |
| - Certificate                |       | - Attributes (ABAC)          |
| - Biometrics                 |       | - Policies (OPA/Casbin)      |
| - Token assertion            |       | - ACLs                       |
+------------------------------+       +------------------------------+
         |                                       |
         v                                       v
   "You are Alice"                   "Alice can read /reports"
```

Authentication answers: "Are you who you claim to be?"
Authorization answers: "Are you allowed to do what you're trying to do?"

A system can authenticate successfully but still deny access (AuthN success, AuthZ failure).

---

## 3. API Design

### Authentication Endpoints

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
  "mfa_code": "123456"           // optional TOTP code
}
Response: 200 OK
{
  "access_token": "eyJhbGci...",  // JWT, 15-minute TTL
  "refresh_token": "rt_01J8X...", // opaque token, 30-day TTL
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
  "access_token": "eyJhbGci...",   // new access token
  "refresh_token": "rt_01J9Y...",  // rotated refresh token (old one invalidated)
  "expires_in": 900
}

POST /auth/logout
Headers: Authorization: Bearer <access_token>
Request:
{
  "refresh_token": "rt_01J8X...",
  "all_sessions": false           // true = revoke all sessions for user
}
Response: 204 No Content

POST /auth/forgot-password
Request: { "email": "alice@example.com" }
Response: 202 Accepted (always, even if email not found — prevents enumeration)

POST /auth/reset-password
Request:
{
  "token": "prst_01J8X...",       // password reset token from email
  "new_password": "N3wP@ssw0rd"
}
Response: 200 OK
```

### OAuth 2.0 / OIDC Endpoints

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
  "id_token": "eyJhbGci...",       // OIDC: signed JWT with user identity
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

GET /.well-known/openid-configuration   // OIDC discovery document
GET /.well-known/jwks.json              // Public keys for token verification
POST /oauth/revoke                      // RFC 7009 token revocation
POST /oauth/introspect                  // RFC 7662 token introspection
```

### MFA Endpoints

```
POST /auth/mfa/totp/enroll
Response: { "secret": "BASE32SECRET", "qr_code_uri": "otpauth://..." }

POST /auth/mfa/totp/verify
Request: { "code": "123456" }
Response: { "backup_codes": ["abc123", ...] }

POST /auth/mfa/webauthn/register/begin
Response: { "challenge": "...", "rp": { "name": "MyApp", "id": "myapp.com" }, ... }

POST /auth/mfa/webauthn/register/complete
Request: { "credential": { ... } }    // WebAuthn credential JSON

POST /auth/mfa/webauthn/authenticate/begin
Response: { "challenge": "...", "allowCredentials": [...] }

POST /auth/mfa/webauthn/authenticate/complete
Request: { "assertion": { ... } }
```

---

## 4. Data Model

### Users Table

```sql
CREATE TABLE users (
    id              VARCHAR(36)  PRIMARY KEY,      -- usr_01J8X... (ULID)
    email           VARCHAR(320) NOT NULL UNIQUE,
    email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    display_name    VARCHAR(255),
    avatar_url      VARCHAR(2048),
    password_hash   VARCHAR(512),                  -- Argon2id hash, NULL for SSO-only users
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
                                                   -- active | suspended | deleted
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMP,
    login_count     INTEGER      NOT NULL DEFAULT 0,
    failed_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until    TIMESTAMP,                     -- account lockout expiry
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,

    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

### Sessions Table (metadata only; session data lives in Redis)

```sql
CREATE TABLE sessions (
    id              VARCHAR(36)  PRIMARY KEY,      -- ses_01J8X...
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of refresh token
    client_id       VARCHAR(36),                   -- OAuth client, NULL for direct login
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

### OAuth Clients Table

```sql
CREATE TABLE oauth_clients (
    id              VARCHAR(36)  PRIMARY KEY,      -- app_123
    name            VARCHAR(255) NOT NULL,
    client_secret_hash VARCHAR(64),               -- NULL for public clients (PKCE only)
    redirect_uris   TEXT         NOT NULL,         -- JSON array
    allowed_scopes  TEXT         NOT NULL,         -- space-separated
    grant_types     TEXT         NOT NULL,         -- JSON array
    is_public       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    owner_user_id   VARCHAR(36)  REFERENCES users(id)
);
```

### Authorization Codes Table

```sql
CREATE TABLE authorization_codes (
    code_hash       VARCHAR(64)  PRIMARY KEY,      -- SHA-256 of code
    client_id       VARCHAR(36)  NOT NULL REFERENCES oauth_clients(id),
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    redirect_uri    VARCHAR(2048) NOT NULL,
    scope           TEXT         NOT NULL,
    code_challenge  VARCHAR(128),                  -- PKCE
    code_challenge_method VARCHAR(10),
    expires_at      TIMESTAMP    NOT NULL,         -- short-lived: 10 minutes
    used_at         TIMESTAMP,                     -- one-time use
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

### MFA Credentials Table

```sql
CREATE TABLE mfa_credentials (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    type            VARCHAR(20)  NOT NULL,         -- totp | webauthn | backup_code
    credential_id   TEXT,                          -- WebAuthn credential ID (base64url)
    public_key      TEXT,                          -- WebAuthn COSE public key
    totp_secret_enc TEXT,                          -- AES-256 encrypted TOTP secret
    backup_code_hash VARCHAR(64),                  -- bcrypt hash of backup code
    counter         BIGINT       NOT NULL DEFAULT 0, -- WebAuthn signature counter
    aaguid          VARCHAR(36),                   -- authenticator attestation GUID
    name            VARCHAR(100),                  -- user-assigned nickname
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMP,

    INDEX idx_user_id (user_id),
    INDEX idx_credential_id (credential_id)
);
```

### Roles & Permissions (RBAC)

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

### Audit Log Table

```sql
CREATE TABLE audit_logs (
    id          BIGSERIAL    PRIMARY KEY,
    event_type  VARCHAR(100) NOT NULL,   -- login.success, login.failed, token.refresh, etc.
    user_id     VARCHAR(36),
    session_id  VARCHAR(36),
    client_id   VARCHAR(36),
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    metadata    JSONB,                   -- event-specific payload
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),

    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);
-- Partitioned by month for efficient archival
-- Retained in hot storage for 1 year, cold S3 for 7 years
```

### Social Identity Providers

```sql
CREATE TABLE social_identities (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    provider        VARCHAR(50)  NOT NULL,       -- google | github | apple
    provider_user_id VARCHAR(255) NOT NULL,      -- subject claim from provider
    access_token_enc TEXT,                       -- encrypted, for API access
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (provider, provider_user_id),
    INDEX idx_user_id (user_id)
);
```

---

## 5. High-Level Architecture

```
                          +------------------+
                          |   DNS / CDN      |
                          |  (Cloudflare)    |
                          +--------+---------+
                                   |
                          +--------+---------+
                          |   Global Load    |
                          |   Balancer       |
                          | (Anycast IP,     |
                          |  GeoDNS routing) |
                          +---+---+---+------+
                              |   |   |
              +---------------+   |   +---------------+
              |                   |                   |
     +--------+--------+  +-------+-------+  +--------+--------+
     | Region: US-EAST |  | Region: EU    |  | Region: AP-EAST |
     | Auth Service    |  | Auth Service  |  | Auth Service    |
     | Cluster         |  | Cluster       |  | Cluster         |
     +-----------------+  +---------------+  +-----------------+
              |                   |                   |
     +--------+---------+---------+---------+---------+-------+
     |                                                        |
     |                    Shared Infrastructure               |
     |                                                        |
     |  +-------------------+       +----------------------+  |
     |  | Redis Cluster     |       | PostgreSQL Cluster   |  |
     |  | (Session Store)   |       | (Users, Sessions,    |  |
     |  | Primary + 2 Read  |       | Roles, Audit)        |  |
     |  | Replicas          |       | Primary + Replicas   |  |
     |  +-------------------+       +----------------------+  |
     |                                                        |
     |  +-------------------+       +----------------------+  |
     |  | Message Queue     |       | Secrets Manager      |  |
     |  | (Kafka)           |       | (HashiCorp Vault /   |  |
     |  | Audit events,     |       |  AWS KMS)            |  |
     |  | Email triggers    |       | JWT signing keys,    |  |
     |  +-------------------+       | DB credentials       |  |
     |                              +----------------------+  |
     +--------------------------------------------------------+
```

### Auth Service Internal Architecture

```
+-------------------------------------------------------+
|                   Auth Service Pod                    |
|                                                       |
|  +-------------+  +-----------+  +-----------------+ |
|  | REST API    |  | OAuth 2.0 |  | SAML 2.0        | |
|  | Handler     |  | Handler   |  | Handler         | |
|  +------+------+  +-----+-----+  +--------+--------+ |
|         |               |                 |           |
|         +---------------+-----------------+           |
|                         |                             |
|              +----------+----------+                  |
|              |   Auth Core Logic   |                  |
|              |                     |                  |
|    +---------+---+   +----------+  |                  |
|    | Password    |   | Token    |  |                  |
|    | Verifier    |   | Issuer / |  |                  |
|    | (Argon2id)  |   | Verifier |  |                  |
|    +-------------+   +----------+  |                  |
|    +---------+---+   +----------+  |                  |
|    | MFA         |   | Session  |  |                  |
|    | Validator   |   | Manager  |  |                  |
|    | (TOTP/FIDO2)|   |          |  |                  |
|    +-------------+   +----------+  |                  |
|              |                     |                  |
|              +----------+----------+                  |
|                         |                             |
|     +---------+---------+---------+---------+         |
|     |         |         |         |         |         |
|  +--+---+ +---+---+ +---+---+ +---+---+ +--+----+    |
|  |Redis | |Postgres| |Kafka | |Vault  | |Rate   |    |
|  |Client| |Client  | |Prod. | |Client | |Limiter|    |
|  +------+ +--------+ +------+ +-------+ +-------+    |
+-------------------------------------------------------+
```

---

## 6. Deep Dive: JWT Structure & Token Strategy

### JWT Anatomy

A JSON Web Token consists of three Base64URL-encoded parts separated by dots:

```
eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleS0yMDI2MDMifQ    <- Header
.
eyJzdWIiOiJ1c3JfMDFKOFgiLCJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIi...  <- Payload
.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c      <- Signature
```

**Header** (decoded):
```json
{
  "alg": "ES256",       // Algorithm: ECDSA with P-256 and SHA-256
  "typ": "JWT",
  "kid": "key-202603"   // Key ID for key rotation — verifiers look up JWKS
}
```

**Payload** (decoded):
```json
{
  "iss": "https://auth.example.com",     // Issuer
  "sub": "usr_01J8X...",                 // Subject (user ID)
  "aud": ["api.example.com"],            // Audience
  "exp": 1740788100,                     // Expiry (Unix timestamp, 15 min from now)
  "iat": 1740787200,                     // Issued At
  "jti": "tok_01J8X...",                 // JWT ID (for revocation blacklist)
  "sid": "ses_01J8X...",                 // Session ID
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",
  "roles": ["editor"],
  "permissions": ["reports:read", "billing:read"],
  "amr": ["pwd", "totp"],                // Authentication Methods References
  "auth_time": 1740787200               // When user last authenticated
}
```

**Signature** (ECDSA P-256):
```
ES256_Sign(
  private_key,
  base64url(header) + "." + base64url(payload)
)
```

### Why ES256 over RS256?

```
+------------------+----------------+------------------+
| Property         | RS256 (RSA)    | ES256 (ECDSA)    |
+------------------+----------------+------------------+
| Key size         | 2048-4096 bits | 256 bits         |
| Signature size   | 256-512 bytes  | 64 bytes         |
| Verify speed     | ~0.5ms         | ~0.1ms           |
| Key gen speed    | Slow           | Fast             |
| Security level   | 112 bits       | 128 bits (P-256) |
+------------------+----------------+------------------+
```

ES256 is preferred: smaller tokens, faster verification, stronger security per bit.

### Access Token vs Refresh Token

```
+-------------------------+        +---------------------------+
|     Access Token        |        |      Refresh Token        |
|                         |        |                           |
| Format:  JWT (signed)   |        | Format: Opaque string     |
| TTL:     15 minutes     |        | TTL:    30 days           |
| Storage: Memory only    |        | Storage: HttpOnly cookie  |
|          (no localStorage)|      |          + DB record      |
| Usage:   Every API call |        | Usage:  Get new access    |
|          (Authorization |        |          token when old   |
|           header)       |        |          one expires      |
| Validation: Local       |        | Validation: DB lookup     |
|             (no network)|        |             required      |
| Revocation: Hard        |        | Revocation: Easy          |
|             (wait expiry)|       |             (delete from  |
|             or blacklist |       |              DB)          |
+-------------------------+        +---------------------------+
```

### Token Rotation Strategy

```
Client                           Auth Server
  |                                   |
  |-- POST /auth/refresh ------------>|
  |   { refresh_token: "rt_OLD" }     |
  |                                   |
  |                   +---------------+
  |                   | 1. Verify rt_OLD hash in DB
  |                   | 2. Check session not revoked
  |                   | 3. Check session not expired
  |                   | 4. Issue new access_token (JWT)
  |                   | 5. Issue new rt_NEW
  |                   | 6. ATOMICALLY:
  |                   |    - Mark rt_OLD as used/rotated
  |                   |    - Store rt_NEW hash in DB
  |                   +---------------+
  |                                   |
  |<-- 200 OK -----------------------|
  |   { access_token: "...",          |
  |     refresh_token: "rt_NEW" }     |
  |                                   |
  | [If rt_OLD used AGAIN later:]     |
  |-- POST /auth/refresh ------------>|
  |   { refresh_token: "rt_OLD" }     |
  |                                   |
  |                   +---------------+
  |                   | rt_OLD already used!
  |                   | REUSE DETECTED:
  |                   | -> Revoke entire session (rt_NEW too)
  |                   | -> Alert user of possible token theft
  |                   +---------------+
  |<-- 401 Unauthorized --------------|
```

Refresh token rotation with reuse detection prevents refresh token theft: if a stolen token is used, the legitimate user's next refresh attempt triggers detection and revokes the whole session.

---

## 7. Deep Dive: Session-Based vs Token-Based Auth

```
+---------------------+---------------------------+---------------------------+
| Property            | Session-Based             | Token-Based (JWT)         |
+---------------------+---------------------------+---------------------------+
| State storage       | Server-side (Redis/DB)    | Client-side (token body)  |
| Scalability         | Requires shared store     | Stateless, scales easily  |
| Revocation          | Instant (delete session)  | Hard (wait expiry or      |
|                     |                           |  maintain blacklist)       |
| Token size          | ~32 bytes session ID      | ~300-500 bytes JWT        |
| Server memory       | High (500M sessions)      | None (stateless)          |
| Cross-domain SSO    | Tricky (cookie domain)    | Easy (pass in header)     |
| Microservices       | Every svc hits Redis      | Verify locally with pubkey|
| Mobile apps         | Awkward (cookie mgmt)     | Natural (Authorization    |
|                     |                           |  header)                  |
| Data freshness      | Always fresh              | Stale until expiry        |
+---------------------+---------------------------+---------------------------+
```

### Hybrid Approach (Best of Both Worlds)

This system uses a hybrid approach:

```
1. Refresh tokens are OPAQUE (session-based):
   - Stored as hash in DB + metadata in Redis
   - Instantly revocable
   - Never expose session data to client

2. Access tokens are JWT (stateless):
   - 15-minute TTL limits staleness window
   - Services verify locally using public key (no network call)
   - Embed roles/permissions for zero-latency AuthZ

3. SSO session tracked server-side in Redis:
   - Central SSO session ID (sid) embedded in JWT
   - Browser keeps HttpOnly SSO session cookie
   - Redis entry: sid -> { user_id, apps[], last_active }
```

---

## 8. Deep Dive: OAuth 2.0 Flows

### Authorization Code + PKCE (Recommended for web & mobile)

```
Browser / App                 Auth Server              Resource Server (API)
     |                             |                           |
     | 1. Generate code_verifier   |                           |
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
     |          [Login UI shown]   |                           |
     |          [User authenticates]                           |
     |                             |                           |
     | 3. Redirect to             |                           |
     |    redirect_uri?code=AUTH_CODE&state=csrf_token         |
     <-----------------------------+                           |
     |                             |                           |
     | 4. Verify state == csrf_token                          |
     |                             |                           |
     | 5. POST /oauth/token        |                           |
     |    grant_type=authorization_code                        |
     |    &code=AUTH_CODE          |                           |
     |    &code_verifier=VERIFIER  |                           |
     +----------------------------->                           |
     |                             |                           |
     |          [Server verifies:  |                           |
     |           S256(verifier) == |                           |
     |           stored challenge] |                           |
     |                             |                           |
     | 6. { access_token, id_token, refresh_token }           |
     <-----------------------------+                           |
     |                             |                           |
     | 7. GET /api/resource        |                           |
     |    Authorization: Bearer access_token                   |
     +----------------------------------------------->        |
     |                             |    [Verify JWT locally]  |
     |                             |    [No network call]     |
     | 8. Resource data            |                           |
     <-----------------------------------------------+        |
```

### Client Credentials (Machine-to-Machine)

```
Service A                      Auth Server              Service B (API)
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

### Device Code Flow (Smart TVs, CLIs)

```
Device (TV/CLI)          Auth Server          User's Phone/Browser
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
      | Show user_code on     |                         |
      | screen + URI          |                         |
      |                       | User opens URI, enters  |
      |                       | user_code, authenticates|
      |                       <-------------------------+
      |                       |                         |
      | Poll: POST /oauth/token|                        |
      | grant_type=device_code |                        |
      | &device_code=...       |                        |
      +----------------------->                         |
      |                       | (returns authorization_pending)
      <-----------------------+                         |
      |                                                 |
      | [After user approves] |                         |
      | Poll: POST /oauth/token|                        |
      +----------------------->                         |
      |                       |                         |
      | { access_token, ... } |                         |
      <-----------------------+                         |
```

---

## 9. Deep Dive: OpenID Connect (OIDC)

OIDC is an identity layer on top of OAuth 2.0. It adds:

1. **ID Token** — a signed JWT asserting user identity (not for API access)
2. **UserInfo Endpoint** — additional user claims
3. **Discovery Document** — machine-readable configuration

### ID Token Claims

```json
{
  "iss": "https://auth.example.com",
  "sub": "usr_01J8X...",
  "aud": "app_123",               // Must match client_id
  "exp": 1740788100,
  "iat": 1740787200,
  "auth_time": 1740787100,        // When authentication happened
  "nonce": "client_nonce_abc",    // Replay attack prevention
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",
  "picture": "https://cdn.example.com/avatars/alice.jpg",
  "locale": "en-US",
  "acr": "urn:mace:incommon:iap:silver", // Authentication Context Class
  "amr": ["pwd", "otp"]          // Authentication Method References
}
```

### OIDC Discovery Document

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

### JWKS (JSON Web Key Set) for Key Rotation

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
      "kid": "key-202302",    // Old key, still valid for tokens issued before rotation
      "use": "sig",
      "alg": "ES256",
      "x": "...",
      "y": "..."
    }
  ]
}
```

Key rotation: generate new key, publish both old + new in JWKS. Services cache JWKS with 1-hour TTL. After rotation window (24h), remove old key.

---

## 10. Deep Dive: SAML 2.0 for Enterprise SSO

### Parties and Terminology

```
+------------------+     +------------------+
| Service Provider |     | Identity Provider|
|      (SP)        |     |      (IdP)       |
|                  |     |                  |
| Your App /       |     | Auth.example.com |
| Customer's SaaS  |     | or              |
|                  |     | Okta / Azure AD  |
+------------------+     +------------------+
```

### SP-Initiated Flow (Most Common)

```
Browser                    SP (Your App)          IdP (Okta/Azure)
  |                             |                       |
  | 1. GET /app/dashboard       |                       |
  +----------------------------->                       |
  |                             |                       |
  | 2. 302 to IdP with SAML     |                       |
  |    AuthnRequest (encoded)   |                       |
  <-----------------------------+                       |
  |                             |                       |
  | 3. GET /idp/sso?SAMLRequest=...                     |
  +---------------------------------------------------->|
  |                             |                       |
  |          [IdP shows login UI, user authenticates]   |
  |                             |                       |
  | 4. POST /sp/acs (assertion consumer service)        |
  |    SAMLResponse (SAML Assertion, signed by IdP)     |
  <----------------------------------------------------+|
  |                             |                       |
  | 5. POST /sp/acs             |                       |
  |    with SAMLResponse        |                       |
  +----------------------------->                       |
  |                             |                       |
  |          [SP validates:     |                       |
  |           - IdP signature   |                       |
  |           - Issuer matches  |                       |
  |           - NotBefore/      |                       |
  |             NotOnOrAfter    |                       |
  |           - InResponseTo ID |                       |
  |           - Recipient URI]  |                       |
  |                             |                       |
  | 6. 302 to /app/dashboard    |                       |
  |   (with session cookie)     |                       |
  <-----------------------------+                       |
```

### SAML Assertion Structure

```xml
<saml:Assertion ID="_abc123" IssueInstant="2026-03-01T00:00:00Z"
  Version="2.0" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">

  <saml:Issuer>https://idp.okta.com</saml:Issuer>

  <ds:Signature><!-- RSA-SHA256 signature of assertion --></ds:Signature>

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

## 11. Deep Dive: SSO Architecture

### Centralized Identity Provider with Session Federation

```
+-----------+     +-----------+     +-----------+
|  App A    |     |  App B    |     |  App C    |
| (wiki.co) |     | (crm.co)  |     |(mail.co)  |
+-----+-----+     +-----+-----+     +-----+-----+
      |                 |                 |
      | Redirect to IdP | Redirect to IdP | Redirect to IdP
      |   for SSO       |   for SSO       |   for SSO
      |                 |                 |
      +--------+--------+---------+-------+
               |                  |
               v                  |
   +-----------+-----------+      |
   |    Identity Provider  |      |
   |   (auth.example.com)  |<-----+
   |                       |
   | +-------------------+ |
   | |  SSO Session Store| |
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
    User logs in ONCE to IdP
    IdP issues SSO session cookie (.example.com)
    All apps redirect to IdP and get silent grant
    (no re-authentication needed)
```

### SSO Session Cookie Scope

```
Domain: .example.com (shared across subdomains)
HttpOnly: true        (JavaScript cannot read)
Secure: true          (HTTPS only)
SameSite: Lax         (CSRF protection, allows top-level navigation)
Path: /
Max-Age: 28800        (8 hours)
Name: __Host-sso_sid  (prefix prevents subdomain override)
```

### Single Logout (SLO)

```
User logs out of App A
      |
      v
App A -> POST /slo?token=... to IdP
      |
      v
IdP deletes SSO session in Redis
      |
      v
IdP sends logout notifications (back-channel) to all apps
that have active sessions under this SSO session:
  POST App_B /backchannel-logout  { "logout_token": "..." }
  POST App_C /backchannel-logout  { "logout_token": "..." }
      |
      v
Each app revokes its local session for the user
```

---

## 12. Deep Dive: Multi-Factor Authentication

### TOTP (Time-based One-Time Password) — RFC 6238

```
Enrollment:
  Server generates 20-byte random secret
  Encodes as Base32: "JBSWY3DPEHPK3PXP"
  Stores AES-256-encrypted in DB
  Shows QR code: otpauth://totp/MyApp:alice@example.com?secret=JBSWY3...&issuer=MyApp

Verification:
  code = HOTP(secret, floor(unix_time / 30))
  HOTP = HMAC-SHA1(secret, counter) truncated to 6 digits

  Allow T-1, T, T+1 window (3 codes) for clock skew
  Rate limit: max 5 attempts before lockout
  Prevent replay: track last-used counter

+-------------------+       +---------------------+
| Authenticator App |       | Auth Server          |
| (Google Auth)     |       |                      |
|                   |       |                      |
| Shares secret key |       | Same secret key      |
| clock: Unix time  |       | clock: Unix time     |
|                   |       |                      |
| TOTP code: 123456 | ----> | Compute expected:    |
|                   |       | 123456 (match!)      |
| Changes every 30s |       | Accept login         |
+-------------------+       +---------------------+
```

### WebAuthn / FIDO2 (Phishing-Resistant)

```
Registration:
  Server sends challenge
  Authenticator (hardware key / device biometric) creates:
    - Public/private key pair (per-origin, per-credential)
    - Attestation statement (proves authenticator model)
  Server stores: public key + credential ID + AAGUID

Authentication:
  Server sends challenge
  Authenticator signs: { challenge + origin + rpId + counter }
    using stored private key
  Server verifies:
    1. Signature valid against stored public key
    2. Origin matches expected (phishing prevention — domain-bound!)
    3. Counter > stored counter (clone detection)
    4. rpId hash matches

+------------------+         +----------------+
| Browser + FIDO2  |         | Auth Server    |
| Authenticator    |         |                |
| (YubiKey / TPM)  |         |                |
|                  |         |                |
| Private key      |         | Public key     |
| (never leaves    |         | (stored in DB) |
|  device)         |         |                |
|                  |         |                |
| Signs challenge  | ------> | Verifies sig   |
| with private key |         | with pub key   |
|                  |         |                |
| Origin-bound:    |         | Phishing-proof:|
| won't sign for   |         | attacker can't |
| evil.example.com |         | use creds      |
+------------------+         +----------------+
```

### MFA Comparison

```
+------------------+----------+-------------------+------------------+
| Method           | Phishing | Usability         | Recovery         |
|                  | Resistant|                   |                  |
+------------------+----------+-------------------+------------------+
| SMS OTP          | NO       | High              | Via phone number |
| TOTP (app)       | NO       | Medium            | Backup codes     |
| WebAuthn/FIDO2   | YES      | High (biometric)  | Backup key       |
| Hardware Key     | YES      | Medium            | Backup key       |
| Email OTP        | NO       | High              | Via email        |
| Passkey          | YES      | Very High         | iCloud/account   |
+------------------+----------+-------------------+------------------+
```

**Why SMS is weak:** SS7 protocol vulnerabilities allow SIM swapping and interception. Use TOTP or WebAuthn as primary MFA. Allow SMS only as fallback with explicit risk acknowledgment.

---

## 13. Deep Dive: Password Storage

### Never Store Plaintext or Fast Hashes

```
FORBIDDEN:
  plaintext:    "p@ssw0rd"
  MD5:          5f4dcc3b5aa765d61d8327deb882cf99
  SHA-1:        cbfdac6008f9cab4083784cbd1874f76618d2a97
  SHA-256:      (fast - GPU can compute billions/sec)
  bcrypt(cost=4): too fast for modern hardware

REQUIRED: Argon2id (winner of 2015 Password Hashing Competition)
```

### Argon2id Parameters

```
argon2id(
  password:    user's password
  salt:        32-byte cryptographically random value (stored with hash)
  memory:      64 MB  (m=65536)  -- makes GPU/ASIC attacks expensive
  iterations:  3      (t=3)      -- time factor
  parallelism: 4      (p=4)      -- threads to use
  hash_length: 32 bytes
)

Output stored in DB:
  $argon2id$v=19$m=65536,t=3,p=4$
  <base64_salt>$<base64_hash>

Verification:
  Re-compute with same params + stored salt
  Constant-time compare (prevent timing attacks)
```

### Peppering (Defense-in-Depth)

```
Pepper = 32-byte secret stored in Vault (NOT in DB)

Stored hash:
  argon2id(password + pepper, salt, params)

If DB is compromised:
  Attacker has: hash + salt
  Missing:      pepper (in Vault, different attack surface)
  Cannot crack: hash without pepper

If pepper rotation needed:
  On next login, re-hash with new pepper
```

### Password Reset Flow (Secure)

```
1. User requests reset
   -> Generate cryptographically random 32-byte token
   -> Store SHA-256(token) in DB with 1-hour expiry
   -> Send email with token in URL (never store raw token)

2. User clicks link
   -> Extract token from URL
   -> Compute SHA-256(token), look up in DB
   -> Verify expiry, mark as used (one-time)
   -> Allow password change
   -> Revoke ALL existing sessions for user
   -> Send confirmation email

3. Enumeration prevention
   -> Always respond "if email exists, you'll receive a reset link"
   -> Same response time whether email found or not
   -> Rate limit: max 3 resets per hour per email
```

---

## 14. Deep Dive: Token Revocation Strategies

### Challenge: JWTs are stateless

Once issued, a JWT cannot be un-issued before its expiry. Three strategies:

```
Strategy 1: Short-Lived Access Tokens (15 min TTL)
+---------------------------------------------------------+
| Revocation happens at next refresh, within 15 minutes  |
| No blacklist needed for access tokens                  |
| Instant revocation via refresh token invalidation      |
| Cost: slightly more refresh requests                   |
+---------------------------------------------------------+

Strategy 2: Jti Blacklist (Redis)
+---------------------------------------------------------+
| Store revoked JWT IDs (jti) in Redis until token expiry|
| On every token validation, check blacklist             |
| Memory: ~100 bytes per revoked token                   |
|                                                        |
| SET revoked:{jti} 1 EX 900  (expire with token)        |
|                                                        |
| Cost: one Redis lookup per API call                    |
| For high-QPS APIs, keep blacklist in local cache       |
| (refresh from Redis every 30 seconds)                  |
+---------------------------------------------------------+

Strategy 3: Token Introspection (RFC 7662)
+---------------------------------------------------------+
| Services call /oauth/introspect before accepting token |
| Auth server responds with active: true/false           |
| Cost: network call per request (too slow for scale)    |
| Use only for high-value operations or external clients |
+---------------------------------------------------------+
```

### Recommended Architecture

```
Fast path (99.9% of requests):
  API Gateway -> Verify JWT signature locally (< 1ms)
              -> Check local in-memory revocation cache (< 0.1ms)
              -> Proceed if valid

Revocation events:
  Logout -> Redis SET revoked:{jti} 1 EX {remaining_ttl}
          -> Pub/Sub broadcast to all gateway instances
          -> Each gateway refreshes its local cache

Cache consistency:
  Local cache TTL: 30 seconds
  Max staleness: 30 seconds (acceptable for most cases)
  For critical operations: bypass cache, check Redis directly
```

---

## 15. Deep Dive: Social Login Integration

### Federation Architecture

```
+----------+     +-----------+     +------------------+
| Your App |     | Auth      |     | Google / GitHub  |
|          |     | Service   |     | / Apple          |
+----+-----+     +-----+-----+     +--------+---------+
     |                 |                    |
     | 1. User clicks  |                    |
     |    "Login with  |                    |
     |    Google"      |                    |
     |                 |                    |
     | 2. Redirect to  |                    |
     |    /auth/social/|                    |
     |    google/begin |                    |
     +---------------->|                    |
     |                 |                    |
     |                 | 3. Redirect to     |
     |                 |    Google OAuth    |
     <-----------------+                    |
     |                                      |
     | 4. User authenticates on Google      |
     |                                      |
     |                 | 5. Callback with   |
     |                 |    code            |
     +---------------->|                    |
     |                 |                    |
     |                 | 6. Exchange code   |
     |                 |    for id_token    |
     |                 +------------------->|
     |                 | 7. id_token + user |
     |                 |    profile         |
     |                 <-------------------+|
     |                 |                    |
     |                 | 8. Verify id_token |
     |                 |    (Google's JWK)  |
     |                 |                    |
     |                 | 9. Link or create  |
     |                 |    local user:     |
     |                 |    - Look up       |
     |                 |      social_identities
     |                 |    - If found:     |
     |                 |      return user   |
     |                 |    - If not found  |
     |                 |      by provider_id:|
     |                 |      check email   |
     |                 |      in users table|
     |                 |    - If email match:|
     |                 |      link accounts |
     |                 |    - Else create   |
     |                 |      new user      |
     |                 |                    |
     | 10. Issue       |                    |
     |     access +    |                    |
     |     refresh     |                    |
     |     tokens      |                    |
     <-----------------+                    |
```

### Account Linking Security

```
Risk: "Pre-hijacking" attack
  Attacker creates account with alice@example.com
  Alice later uses "Sign in with Google" (same email)
  System auto-links -> attacker owns Alice's account!

Defense:
  1. Require email verification before linking
  2. For new social signups: set email_verified = true
     only if provider confirms email (Google does, some don't)
  3. Send "new login method linked" notification to existing email
  4. Offer explicit "Link Account" flow (not silent auto-link)
```

---

## 16. Deep Dive: Role-Based vs Attribute-Based Access Control

### RBAC (Role-Based Access Control)

```
User -> Roles -> Permissions

alice -> [editor, viewer]
editor -> [articles:write, articles:read, comments:write]
viewer -> [articles:read, comments:read]

alice's effective permissions:
  articles:write, articles:read, comments:write, comments:read

Implementation in JWT:
  "roles": ["editor"],
  "permissions": ["articles:write", "articles:read", "comments:write"]
```

RBAC is simple, auditable, and works for most applications. Limitation: "role explosion" when you need fine-grained access (e.g., "can edit articles they authored").

### ABAC (Attribute-Based Access Control)

```
Policy: ALLOW if user.department == resource.department
        AND action == "read"
        AND time.hour BETWEEN 9 AND 17

Evaluated at runtime using policy engine (OPA, Casbin):

Subject attributes:  { user_id, department, clearance_level, location }
Resource attributes: { owner_id, department, classification, created_at }
Action:              read | write | delete
Environment:         { time, ip_address, device_trust_level }

Example OPA policy:
allow {
  input.action == "read"
  input.user.department == input.resource.department
  input.user.clearance_level >= input.resource.classification
}
```

### Choosing Between RBAC and ABAC

```
+---------------------+---------------------------+---------------------------+
| Dimension           | RBAC                      | ABAC                      |
+---------------------+---------------------------+---------------------------+
| Complexity          | Low                       | High                      |
| Performance         | Fast (cached in token)    | Slower (policy eval)      |
| Flexibility         | Low (role explosion)      | Very high                 |
| Auditability        | Easy                      | Harder                    |
| Use case            | SaaS with fixed roles     | Healthcare, finance, gov  |
+---------------------+---------------------------+---------------------------+
```

Recommendation: Start with RBAC, embed roles/permissions in JWT. Add ABAC for specific resources that need fine-grained control (resource-level policies evaluated at the resource service using OPA).

---

## 17. Deep Dive: Rate Limiting & Account Security

### Login Rate Limiting Strategy

```
Multi-dimensional rate limiting:

1. Per-IP rate limit:
   Key: ratelimit:ip:{ip_address}:login
   Limit: 10 attempts per minute
   Algorithm: Token bucket (allows small bursts)

2. Per-username rate limit:
   Key: ratelimit:user:{email}:login
   Limit: 5 failures per 15 minutes
   Algorithm: Fixed window

3. Global rate limit:
   Key: ratelimit:global:login
   Limit: 50,000/sec (enforced at load balancer)

4. CAPTCHA trigger:
   After 3 consecutive failures from same IP OR username
   Use invisible reCAPTCHA first, visible only on repeated failure

5. Account lockout (progressive):
   5 failures: 30-second lockout
   10 failures: 5-minute lockout
   20 failures: 1-hour lockout
   30 failures: require admin unlock or email verification
```

### Suspicious Login Detection

```
Risk signals evaluated on each login:

+---------------------------+---------------+
| Signal                    | Risk Score    |
+---------------------------+---------------+
| New device (no cookie)    | +20           |
| New country               | +30           |
| New city (> 100km)        | +15           |
| Impossible travel (< 1hr) | +50           |
|   (e.g., LA then London)  |               |
| Tor/VPN IP                | +25           |
| Known bad IP (threat feed)| +70           |
| Failed MFA                | +40           |
| Unusual time (3am local)  | +10           |
+---------------------------+---------------+

Total score:
  0-30:   Allow, no friction
  31-60:  Require MFA (even if not enrolled -> send email OTP)
  61-80:  Require email verification + MFA
  81+:    Block + notify user + require admin review
```

---

## 18. Deep Dive: Passwordless Authentication

### Magic Links

```
1. User enters email, clicks "Send Magic Link"

2. Server:
   - Generate 32-byte cryptographically random token
   - Store SHA-256(token) in Redis: SET ml:{hash} {user_id} EX 900
   - Send email: "Click here to log in: https://app.com/auth/magic?token=RAW_TOKEN"

3. User clicks link:
   - Extract token from URL
   - Compute SHA-256(token), look up in Redis
   - If found and not expired: authenticate user, delete key (one-time)
   - Issue session tokens

Security:
   - Token is one-time use (deleted after use)
   - 15-minute expiry
   - Rate limit: 3 magic links per hour per email
   - Never log or expose the raw token
   - HTTPS enforced (token in URL query param — use POST form for extra safety)
```

### Passkeys (WebAuthn as Primary Authentication)

```
Registration:
  User authenticates once (or creates account)
  Creates a passkey: device generates keypair
  Private key stays on device (Secure Enclave / TPM)
  Public key stored on server

Login (no password!):
  User enters email or username
  Server sends WebAuthn challenge
  Device prompts for biometric (Touch ID, Face ID, Windows Hello)
  Device signs challenge with private key
  Server verifies signature with stored public key

Sync across devices:
  Apple: iCloud Keychain syncs passkeys
  Google: Google Password Manager syncs passkeys
  Cross-platform: passkey on phone authenticates laptop via Bluetooth (hybrid transport)

User experience:
  Tap fingerprint or face -> authenticated in < 2 seconds
  Phishing-proof (origin-bound)
  No password to remember or leak
```

---

## 19. Deep Dive: Session Management

### Redis Session Store Structure

```
Key:   session:{session_id}
TTL:   sliding (reset on each access)
Value: {
  "user_id": "usr_01J8X...",
  "email": "alice@example.com",
  "roles": ["editor"],
  "auth_time": 1740787200,
  "ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "mfa_verified": true,
  "device_id": "dev_01J8X...",
  "refresh_token_family": "fam_01J8X...",  // for refresh token rotation
  "created_at": 1740787200,
  "last_active": 1740788000,
  "sso_session_id": "sso_01J8X..."        // parent SSO session
}
```

### Concurrent Session Management

```
User sessions index:
  Key:   user_sessions:{user_id}
  Type:  Redis Sorted Set
  Score: last_active timestamp
  Value: session_id

Operations:
  On login:   ZADD user_sessions:{uid} {timestamp} {sid}
  On activity: ZADD user_sessions:{uid} {timestamp} {sid}  (upsert)
  On logout:  ZREM user_sessions:{uid} {sid}

Limit enforcement (max 10 concurrent sessions):
  Count = ZCARD user_sessions:{uid}
  If count >= 10: ZPOPMIN user_sessions:{uid} 1  (evict oldest)
                  -> also revoke that session in DB

Session listing for user:
  ZRANGEBYSCORE user_sessions:{uid} -inf +inf WITHSCORES
  -> Show device list in account settings
```

### Sliding Expiration

```
Each Redis session key has TTL reset on use:

   Last active: T
   Idle TTL:    8 hours

   At T+7h: User makes request
   -> Session TTL reset to T+7h + 8h = T+15h
   -> User stays logged in as long as active

   At T+29d: Absolute max lifetime
   -> Session force-expired regardless of activity
   -> User must re-authenticate
```

---

## 20. Scaling Strategy

### Global Architecture

```
+------------------------------------------------------------------+
|                        DNS: GeoDNS + Anycast                    |
+------------------+------------------+----------------------------+
                   |                  |
         +---------+--------+  +------+---------+
         | US-EAST Region   |  | EU-WEST Region |  (+ AP-EAST)
         |                  |  |                |
         | Auth Service     |  | Auth Service   |
         | (100 pods)       |  | (50 pods)      |
         |                  |  |                |
         | Redis Cluster    |  | Redis Cluster  |  <- local session
         | (primary)        |  | (replica)      |     cache
         |                  |  |                |
         | PostgreSQL       |  | PostgreSQL     |  <- read replicas
         | Read Replica     |  | Read Replica   |
         +------------------+  +----------------+
                |                       |
                +-------+-------+-------+
                        |
              +---------+---------+
              | Global Primary DB |
              | (PostgreSQL +     |
              |  Patroni HA)      |
              | US-EAST (primary) |
              +---------+---------+
```

### Horizontal Scaling for Auth Service

```
Login path (write-heavy):
  - Stateless auth pods (any pod handles any request)
  - Argon2id hashing: CPU-bound, scale by adding pods
  - DB writes to primary PostgreSQL
  - Redis writes to primary cluster

Token validation path (read-heavy, 10x more traffic):
  - Handled at API Gateway level, not auth service
  - Public key cached in memory (JWKS cached 1 hour)
  - No network call to auth service for validation
  - Scales independently with API services

Session lookup path:
  - Redis read replicas in each region
  - < 5ms latency within same region
  - Eventual consistency for cross-region session state
```

### Database Sharding Strategy

```
Users table: shard by user_id prefix
  Shard 0: user_id starts with 0-3
  Shard 1: user_id starts with 4-7
  Shard 2: user_id starts with 8-b
  Shard 3: user_id starts with c-f

Sessions table: ephemeral, kept in Redis
  PostgreSQL sessions table: metadata only, write-once
  Shard by user_id for colocation with user data

Audit logs: time-series partitioning
  Partition by month
  Hot: last 3 months on SSD (PostgreSQL)
  Warm: 3-12 months on HDD
  Cold: > 12 months on S3 (Parquet, Athena queryable)
```

### Caching Strategy

```
Layer 1: JWT public keys (JWKS)
  In-memory in API services
  TTL: 1 hour, background refresh
  Invalidated via key rotation event

Layer 2: User profile cache
  Redis: user:{user_id}:profile
  TTL: 5 minutes
  Invalidated on profile update

Layer 3: Revocation blacklist
  In-memory HashMap per API gateway instance
  Refresh every 30 seconds from Redis
  Pub/Sub for immediate critical revocations

Layer 4: RBAC permissions
  Computed and embedded in JWT at login time
  For role changes: short JWT TTL ensures freshness within 15 min
  For immediate revocation: invalidate via jti blacklist
```

---

## 21. Trade-offs

### JWT vs Opaque Tokens

**JWT chosen for access tokens because:**
- Zero network calls for validation (< 1ms vs 5ms+ for Redis)
- Works across microservices without shared session store
- Self-contained: embed roles, permissions, claims

**Trade-off:** Cannot instantly revoke a JWT. Mitigated by:
- Short TTL (15 minutes)
- jti blacklist with local cache for critical revocations

### Stateless vs Stateful Session

**Hybrid chosen because:**
- Refresh tokens must be revocable (stateful, in DB + Redis)
- Access tokens benefit from statelessness (JWT)
- SSO session requires server-side tracking for SLO

### Argon2id Hashing vs Speed

**Argon2id chosen despite slowness because:**
- 300ms hash time intentional — makes brute force impractical
- At 50K logins/sec peak: need dedicated hashing worker pool
- Use async queue: accept login request, enqueue hash job, return when done
- Queue absorbs burst, prevents overload of auth service

```
Login Request -> Queue (Kafka/SQS) -> Hashing Worker Pool (N pods)
                                   -> Result sent back via correlation ID
```

### Centralized IdP vs Decentralized Auth

**Centralized IdP chosen because:**
- Single audit trail
- Consistent security policy enforcement
- Simpler MFA and SSO
- Trade-off: single point of failure (mitigated by 99.999% HA target)

---

## 22. Common Interview Follow-ups

**Q: How do you handle token validation at scale without hitting your auth service?**

A: API services validate JWTs locally using the public key (from JWKS, cached in memory). The JWT is cryptographically signed — the service only needs the public key, not network access to the auth server. The public key is fetched once at startup and refreshed every hour. For revocation, we maintain a small in-memory blacklist of recently revoked JTIs, refreshed every 30 seconds from Redis. This gives < 1ms validation with 30-second maximum revocation staleness.

**Q: How do you prevent CSRF attacks in your OAuth flow?**

A: Two layers of protection. First, the `state` parameter in the OAuth authorization request is a random CSRF token tied to the user's browser session. The callback verifies state matches before exchanging the code. Second, we use `SameSite=Lax` on session cookies, which blocks cross-origin form POST attacks while allowing top-level OAuth redirects.

**Q: What happens if your Redis cluster goes down?**

A: Redis is used for sessions and the revocation blacklist. For sessions: we use Redis Cluster with 3 nodes plus read replicas. If Redis is unavailable, we fail to a "graceful degradation" mode: existing valid JWTs continue to work (stateless verification), but new logins fail until Redis recovers. The recovery time is typically < 30 seconds with automatic failover. For the revocation blacklist: in Redis outage, we skip the blacklist check and rely on short JWT TTL (15 minutes) as the safety net.

**Q: How do you implement "remember me" functionality?**

A: "Remember me" extends the refresh token TTL from 30 days to 90 days. The refresh token is stored as an HttpOnly Secure cookie with a matching session record in the DB. When a "remember me" session token is used, we re-verify recent authentication context (device fingerprint, IP region) before granting a new access token. Suspicious context changes (new country, new device) trigger MFA even for remembered sessions.

**Q: How do you handle the case where a user changes their password?**

A: Password change triggers: (1) invalidate all existing refresh tokens for the user (update revoked_at in DB for all sessions), (2) publish a user-level revocation event to Redis pub/sub (all API gateways add user_id to a "revoked users" cache), (3) issue a new session for the current request. The revoked-users cache is the exception to stateless JWT: we check user_id-level revocation for the 15-minute window until all JWTs expire naturally. This ensures password changes take effect immediately for security-critical operations.

**Q: How do you scale to 50,000 logins per second?**

A: Argon2id at 300ms per hash means each CPU core handles ~3 hashes/sec. For 50K logins/sec we need ~16,667 CPU cores for hashing alone. In practice: (1) the 50K peak is burst, not sustained; (2) we use a hashing worker pool (separate from the main auth service) with queue-based job dispatch; (3) Argon2id parameters are tuned based on hardware — faster servers allow higher parallelism (p parameter) reducing wall-clock time; (4) auto-scaling based on queue depth. For gradual ramp-up events we pre-scale the worker pool.

**Q: How do you prevent account enumeration attacks?**

A: Consistent responses regardless of whether email/username exists: same response time (using constant-time delay if hash is skipped), same error message ("Invalid credentials"). For password reset: always respond "If that email exists, you'll receive a link" with 202 Accepted. Use Argon2id even when the user doesn't exist (to prevent timing attacks — compute a dummy hash). Rate limit by IP to prevent enumeration via timing side-channels.

**Q: How do you design the SSO session for cross-domain applications?**

A: For same-domain apps (app-a.example.com, app-b.example.com): use a parent domain SSO session cookie (.example.com). For cross-domain apps: use back-channel with OAuth/OIDC. The SSO session ID (sid) is embedded in the ID token. Each app maintains its own local session. When the IdP SSO session expires or is revoked, IdP sends back-channel logout notifications to all registered apps. For SP-initiated logout, the app redirects to IdP logout endpoint, which broadcasts SLO to all apps in the SSO session.

**Q: What is the difference between authentication_time (auth_time) and iat in a JWT?**

A: `iat` (issued at) is when the token was created — can be a token refresh. `auth_time` is when the user actually authenticated with credentials (password + MFA). For high-security operations (transferring money, changing email), APIs check `auth_time` and require re-authentication if it's older than a threshold (e.g., 15 minutes). This prevents a stolen token from being used to perform sensitive operations if the user authenticated hours ago. It's the difference between "when was this token made" and "when did the human prove their identity."

**Q: How does your system prevent the "Session Fixation" attack?**

A: Session fixation is prevented by regenerating the session ID on successful authentication. If an attacker sets a known session ID before login (via XSS or other means), the session ID becomes invalid after authentication. We always generate a new session ID upon login, discard any pre-authentication session context, and bind sessions to the user agent + IP subnet for additional validation.

---

## 23. Security Checklist

```
+-----------------------------------------------+--------+
| Security Control                              | Status |
+-----------------------------------------------+--------+
| Passwords hashed with Argon2id                |  YES   |
| Pepper stored separately from salt/hash       |  YES   |
| No plaintext passwords in logs/DB             |  YES   |
| JWT signed with ES256 (not HS256)             |  YES   |
| JWT verified with public key (no secret share)|  YES   |
| Refresh tokens stored as SHA-256 hashes       |  YES   |
| PKCE required for all public clients          |  YES   |
| HTTPS only (HSTS enforced)                    |  YES   |
| HttpOnly + Secure + SameSite cookies          |  YES   |
| CSRF protection via state parameter           |  YES   |
| Rate limiting on login attempts               |  YES   |
| Account lockout after repeated failures       |  YES   |
| MFA support (TOTP + WebAuthn)                 |  YES   |
| Refresh token rotation with reuse detection   |  YES   |
| Token revocation on logout                    |  YES   |
| Audit log for all auth events                 |  YES   |
| Secrets in Vault (never in code/env vars)     |  YES   |
| Constant-time string comparison for tokens    |  YES   |
| Enumeration prevention (timing + response)    |  YES   |
| Session ID regeneration after login           |  YES   |
+-----------------------------------------------+--------+
```
