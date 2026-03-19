# Data Model: Authentication & SSO (OAuth/OIDC)

An authentication system manages user identity, credentials, sessions, and authorization. This model implements OAuth 2.0 / OpenID Connect with support for social login, multi-factor authentication (MFA), and role-based access control (RBAC). Every security-sensitive field uses hashing or encryption, and every action is audit-logged. The design prioritizes defense in depth: even if one layer is compromised, others still protect the user.

---

## Table Responsibilities

| Table                   | Purpose                                   | Why It Exists                                                                 |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| **users**               | Core user identity and credential state   | Central identity record; stores hashed password and account security state    |
| **sessions**            | Active login sessions with refresh tokens | Tracks where and how users are logged in; enables per-device revocation       |
| **oauth_clients**       | Registered OAuth client applications      | Controls which apps can request tokens and what scopes they can access        |
| **authorization_codes** | Short-lived OAuth authorization codes     | Part of the authorization code flow; exchanged for tokens within 10 minutes   |
| **mfa_credentials**     | Multi-factor authentication secrets       | Supports TOTP, WebAuthn, and backup codes per user                            |
| **roles**               | Named permission groups                   | Groups permissions into assignable roles (admin, editor, viewer)              |
| **permissions**         | Granular resource-action pairs            | Defines what actions can be performed on what resources                       |
| **role_permissions**    | Maps roles to permissions                 | Many-to-many: a role has many permissions, a permission belongs to many roles |
| **user_roles**          | Maps users to roles                       | Many-to-many with audit trail: who granted which role and when                |
| **social_identities**   | External identity provider links          | Connects users to Google, GitHub, Apple accounts for social login             |
| **audit_logs**          | Immutable security event log              | Records every authentication and authorization event for compliance           |

---

## Detailed Field Descriptions

### users

| Field                 | Type             | Description                                                   |
| --------------------- | ---------------- | ------------------------------------------------------------- |
| id                    | ULID (PK)        | Universally unique, lexicographically sortable identifier     |
| email                 | VARCHAR (UNIQUE) | Primary email; used for login and recovery                    |
| email_verified        | BOOLEAN          | Whether email ownership has been confirmed                    |
| display_name          | VARCHAR          | User-facing name                                              |
| avatar                | VARCHAR          | Avatar URL                                                    |
| password_hash         | VARCHAR          | Argon2id hash of the password; NULL for social-only accounts  |
| status                | ENUM             | active, suspended, deactivated                                |
| mfa_enabled           | BOOLEAN          | Whether any MFA credential is enrolled                        |
| failed_login_attempts | INT              | Counter for brute-force protection; reset on successful login |
| locked_until          | TIMESTAMP        | Account locked until this time after too many failed attempts |
| last_login_at         | TIMESTAMP        | Last successful login timestamp                               |

**Why ULID instead of UUID?** ULIDs are lexicographically sortable by creation time, which makes index scans more efficient and provides a natural ordering without an additional timestamp column.

**Why Argon2id?** It is the current recommended password hashing algorithm (OWASP). It is resistant to GPU attacks (memory-hard), timing attacks (constant-time), and side-channel attacks. bcrypt is acceptable but Argon2id is preferred.

### sessions

| Field              | Type      | Description                                         |
| ------------------ | --------- | --------------------------------------------------- |
| session_id         | UUID (PK) | Unique session identifier                           |
| user_id            | UUID (FK) | The authenticated user                              |
| refresh_token_hash | VARCHAR   | SHA-256 hash of the refresh token (never store raw) |
| client_id          | UUID (FK) | Which OAuth client created this session             |
| ip_address         | INET      | Client IP at session creation                       |
| user_agent         | VARCHAR   | Browser/device user agent string                    |
| created_at         | TIMESTAMP | Session start time                                  |
| expires_at         | TIMESTAMP | Absolute session expiry (e.g., 30 days)             |
| revoked_at         | TIMESTAMP | NULL if active; set when explicitly revoked         |

**Why hash the refresh token?** If the sessions table is leaked in a breach, raw refresh tokens would allow attackers to impersonate users. Storing only the hash means the leaked data is useless without the original tokens.

**Why store IP and user_agent?** Enables "active sessions" UI ("Chrome on MacOS, 192.168.1.1, 3 days ago") and anomaly detection (login from new country triggers MFA re-challenge).

### oauth_clients

| Field              | Type      | Description                                                                 |
| ------------------ | --------- | --------------------------------------------------------------------------- |
| client_id          | UUID (PK) | Public client identifier                                                    |
| name               | VARCHAR   | Client application name                                                     |
| client_secret_hash | VARCHAR   | Hashed client secret; NULL for public clients (SPAs, mobile)                |
| redirect_uris      | VARCHAR[] | Allowed redirect URIs (strict matching prevents open redirect attacks)      |
| allowed_scopes     | VARCHAR[] | Scopes this client can request (openid, profile, email, etc.)               |
| grant_types        | VARCHAR[] | Allowed grant types (authorization_code, refresh_token, client_credentials) |
| is_public          | BOOLEAN   | Public clients (no secret) vs confidential clients                          |

**Why is_public flag?** Public clients (SPAs, mobile apps) cannot securely store a client_secret. They must use PKCE (Proof Key for Code Exchange) instead. The flag determines which authentication flow is enforced.

### authorization_codes

| Field               | Type         | Description                                        |
| ------------------- | ------------ | -------------------------------------------------- |
| code_hash           | VARCHAR (PK) | SHA-256 hash of the authorization code             |
| client_id           | UUID (FK)    | Which client requested this code                   |
| user_id             | UUID (FK)    | Which user authorized it                           |
| redirect_uri        | VARCHAR      | Must match exactly when exchanging the code        |
| scope               | VARCHAR      | Granted scopes                                     |
| pkce_code_challenge | VARCHAR      | PKCE challenge for public clients                  |
| pkce_method         | ENUM         | S256 (recommended) or plain                        |
| expires_at          | TIMESTAMP    | 10-minute TTL (OAuth spec recommendation)          |
| used_at             | TIMESTAMP    | Set when exchanged; prevents replay (one-time use) |

**Why hash the code?** Same principle as refresh tokens -- if the database is breached, hashed codes cannot be exchanged for tokens. The code is single-use (used_at prevents replay) and short-lived (10-minute TTL).

**Why PKCE?** Without PKCE, authorization code interception attacks are possible on mobile and SPA clients. PKCE ensures that only the client that initiated the flow can exchange the code, even if the code is intercepted.

### mfa_credentials

| Field               | Type      | Description                                                 |
| ------------------- | --------- | ----------------------------------------------------------- |
| credential_id       | UUID (PK) | Unique credential identifier                                |
| user_id             | UUID (FK) | Which user owns this credential                             |
| type                | ENUM      | totp (time-based OTP), webauthn (hardware key), backup_code |
| encrypted_secret    | VARCHAR   | AES-256-GCM encrypted TOTP secret or backup code            |
| webauthn_public_key | TEXT      | WebAuthn public key for hardware key verification           |
| counter             | INT       | WebAuthn sign counter (detects cloned keys)                 |
| last_used_at        | TIMESTAMP | Last successful MFA verification                            |

**Why encrypted (not hashed) TOTP secrets?** Unlike passwords, TOTP secrets need to be decrypted to generate the expected code for comparison. The encryption key is stored in a KMS (Key Management Service), not in the database.

### roles

| Field       | Type             | Description                       |
| ----------- | ---------------- | --------------------------------- |
| role_id     | UUID (PK)        | Unique role identifier            |
| name        | VARCHAR (UNIQUE) | Role name (admin, editor, viewer) |
| description | TEXT             | What this role is for             |

### permissions

| Field         | Type      | Description                                              |
| ------------- | --------- | -------------------------------------------------------- |
| permission_id | UUID (PK) | Unique permission identifier                             |
| resource      | VARCHAR   | The resource being protected (orders, users, reports)    |
| action        | VARCHAR   | The action being controlled (read, write, delete, admin) |

### role_permissions

| Field         | Type      | Description          |
| ------------- | --------- | -------------------- |
| role_id       | UUID (FK) | Part of composite PK |
| permission_id | UUID (FK) | Part of composite PK |

### user_roles

| Field      | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| user_id    | UUID (FK) | Part of composite PK          |
| role_id    | UUID (FK) | Part of composite PK          |
| granted_by | UUID      | Which admin granted this role |
| granted_at | TIMESTAMP | When the role was assigned    |

**Why granted_by and granted_at?** Audit trail. In a compliance review, you need to answer "who gave this user admin access and when?" Without these fields, that question is unanswerable.

### social_identities

| Field                  | Type      | Description                                                |
| ---------------------- | --------- | ---------------------------------------------------------- |
| user_id                | UUID (FK) | Composite PK with provider                                 |
| provider               | ENUM      | google, github, apple                                      |
| provider_user_id       | VARCHAR   | The user's ID at the provider (unique per provider)        |
| encrypted_access_token | VARCHAR   | Encrypted OAuth access token for API calls to the provider |
| token_expires_at       | TIMESTAMP | When the provider access token expires                     |

**Why encrypted access tokens?** These tokens grant access to user data at the provider (Google, GitHub). If the database leaks, encrypted tokens are useless without the KMS decryption key.

### audit_logs

| Field         | Type      | Description                                                                  |
| ------------- | --------- | ---------------------------------------------------------------------------- |
| id            | UUID (PK) | Unique log entry identifier                                                  |
| event_type    | VARCHAR   | login_success, login_failed, mfa_challenge, token_issued, role_changed, etc. |
| user_id       | UUID      | The user involved (nullable for pre-auth events)                             |
| session_id    | UUID      | The session involved, if any                                                 |
| client_id     | UUID      | Which OAuth client, if applicable                                            |
| ip_address    | INET      | Client IP address                                                            |
| user_agent    | VARCHAR   | Client user agent                                                            |
| metadata_json | JSONB     | Additional context (e.g., failure reason, old/new role for role_changed)     |
| created_at    | TIMESTAMP | When the event occurred                                                      |

**Why a dedicated audit table instead of application logs?** Audit logs have retention requirements (often 7+ years for compliance). They need to be queryable ("show all failed logins for user X in the last 30 days"). Application logs are typically unstructured and ephemeral.

---

## ER Diagram

```
+-------------------+         +-------------------+
|   oauth_clients   |         | social_identities |
+-------------------+         +-------------------+
| client_id (PK)    |         | user_id (FK)(CPK) |
| name              |         | provider (CPK)    |
| client_secret_hash|         | provider_user_id  |
| redirect_uris[]   |         | encrypted_token   |
| allowed_scopes[]  |         | token_expires_at  |
| grant_types[]     |         +---------+---------+
| is_public         |                   |
+---------+---------+                   | *
          |                             |
          | 1                           |
          |                      +------+----------+
          *                      |     users       |
+---------+---------+            +--+--------------+
| authorization_    |            | id (PK, ULID)   |
|   codes           |            | email           |
+-------------------+            | email_verified  |
| code_hash (PK)    |            | display_name    |
| client_id (FK)    |     +------| password_hash   |
| user_id (FK)      +--*--+ 1   | status          |
| redirect_uri      |            | mfa_enabled     |
| scope             |            | failed_attempts |
| pkce_challenge    |            | locked_until    |
| pkce_method       |            | last_login_at   |
| expires_at        |            +---+----+----+---+
| used_at           |                |    |    |
+-------------------+                |    |    |
                                     |    |    |
          +--------------------------+    |    +-------------------+
          |                               |                       |
          | 1                             | 1                     | 1
          |                               |                       |
          *                               *                       *
+---------+---------+          +----------+--------+   +----------+--------+
|    sessions       |          | mfa_credentials   |   |   user_roles      |
+-------------------+          +-------------------+   +-------------------+
| session_id (PK)   |          | credential_id(PK) |   | user_id (FK)(CPK) |
| user_id (FK)      |          | user_id (FK)      |   | role_id (FK)(CPK) |
| refresh_token_hash|          | type              |   | granted_by        |
| client_id (FK)    |          | encrypted_secret  |   | granted_at        |
| ip_address        |          | webauthn_pub_key  |   +---------+---------+
| user_agent        |          | counter           |             |
| created_at        |          | last_used_at      |             | *
| expires_at        |          +-------------------+             |
| revoked_at        |                                   +--------+--------+
+-------------------+                                   |     roles       |
                                                        +-----------------+
+-------------------+                                   | role_id (PK)    |
|   audit_logs      |                                   | name            |
+-------------------+                                   | description     |
| id (PK)           |                                   +--------+--------+
| event_type        |                                            |
| user_id           |                                            | 1
| session_id        |                                            |
| client_id         |                                            *
| ip_address        |                                   +--------+-----------+
| user_agent        |                                   | role_permissions   |
| metadata_json     |                                   +--------------------+
| created_at        |                                   | role_id (FK)(CPK)  |
+-------------------+                                   | permission_id(CPK) |
                                                        +--------+-----------+
                                                                 |
                                                                 | *
                                                                 |
                                                        +--------+---------+
                                                        |   permissions    |
                                                        +------------------+
                                                        | permission_id(PK)|
                                                        | resource         |
                                                        | action           |
                                                        +------------------+
```

### Relationship Summary

```
users              1───* sessions            (one user has many active sessions)
users              1───* mfa_credentials     (one user has many MFA methods)
users              1───* social_identities   (one user linked to many providers)
users              *───* roles               (many-to-many via user_roles)
roles              *───* permissions          (many-to-many via role_permissions)
oauth_clients      1───* authorization_codes (one client issues many auth codes)
oauth_clients      1───* sessions            (one client creates many sessions)
users              1───* authorization_codes  (one user authorizes many codes)
```

---

## Data Flow

### Registration Flow

1. **User registers** -- A new `users` row is created with email, password_hash (Argon2id), email_verified=false, status=active.

2. **Email verification** -- A signed verification token is emailed to the user. On click, email_verified is set to true. Unverified users may have limited access.

3. **MFA enrollment (optional)** -- User enrolls a TOTP app or WebAuthn key. A `mfa_credentials` row is created with the encrypted secret. `users.mfa_enabled` is set to true.

### Login Flow

4. **Credential check** -- User submits email and password. The system loads the user, checks `status` (not suspended/deactivated), checks `locked_until` (not locked). If `failed_login_attempts` exceeds threshold (e.g., 5), the account is locked for a duration.

5. **Password verification** -- The submitted password is hashed with Argon2id and compared to `password_hash`. On failure, `failed_login_attempts` is incremented and an audit_log entry is created (event_type=login_failed).

6. **MFA challenge** -- If `mfa_enabled=true`, the user must provide a second factor. The system loads `mfa_credentials` and verifies the TOTP code, WebAuthn assertion, or backup code. Audit logged.

7. **Session creation** -- On success, a `sessions` row is created. The refresh token is generated, hashed, and stored as `refresh_token_hash`. An access token (JWT, short-lived, 15-minute TTL) is issued. `failed_login_attempts` is reset to 0.

### Social Login Flow

8. **OAuth redirect** -- User clicks "Login with Google." The system redirects to Google with client_id, redirect_uri, scope, and a PKCE code_challenge.

9. **Authorization callback** -- Google redirects back with an authorization code. The system exchanges it for tokens, extracts the provider_user_id, and looks up `social_identities`. If found, log in the linked user. If not found, create a new user and social_identity.

### API Authorization Flow

10. **Token validation** -- Each API request includes an access token (JWT). The system validates the signature, checks expiry, and extracts user_id and scopes.

11. **Permission check** -- The system loads the user's roles (via `user_roles`), resolves permissions (via `role_permissions` and `permissions`), and checks if the required resource+action is granted.

12. **Token refresh** -- When the access token expires, the client sends the refresh token. The system hashes it, looks up the matching session, verifies it is not revoked or expired, and issues a new access token.

### Logout Flow

13. **Session revocation** -- The session's `revoked_at` is set to NOW(). Subsequent refresh attempts with this session's token are rejected. The client discards its tokens.

14. **All events audit-logged** -- Every step above generates an `audit_logs` entry with event_type, user context, IP, and user_agent.

---

## Interview Discussion Points

**Q: Why not store the access token in the database?**
Access tokens are JWTs that are validated by signature, not by database lookup. This is stateless verification -- every API request does NOT hit the database. Only refresh tokens (long-lived) are tracked in sessions for revocation.

**Q: How do you handle token revocation if JWTs are stateless?**
Short TTL (15 minutes) means revocation takes effect within 15 minutes at most. For immediate revocation, maintain a small in-memory blocklist (Redis) of revoked JWT IDs (jti) that is checked on each request. The blocklist only needs to hold tokens for their remaining TTL.

**Q: Why RBAC instead of ABAC (Attribute-Based Access Control)?**
RBAC is simpler to reason about and audit. For most applications, the combination of roles and fine-grained permissions (resource + action) is sufficient. ABAC adds context-aware rules (e.g., "can edit only their own orders") which can be layered on top of RBAC at the application level.

**Q: How do you handle account linking (user has both password and Google login)?**
The `social_identities` table supports multiple providers per user. When a user with an existing password account logs in via Google for the first time, and the email matches, prompt them to link accounts (after verifying ownership of both). This creates a social_identities row linked to their existing user_id.
