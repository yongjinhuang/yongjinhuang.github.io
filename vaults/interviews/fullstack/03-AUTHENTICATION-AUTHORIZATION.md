# Authentication & Authorization

## Overview

Authentication (who are you?) and authorization (what can you do?) are among the most critical aspects of any application. In full-stack interviews, this topic tests your understanding of security fundamentals, protocol design, and practical implementation. Getting auth wrong can lead to data breaches, account takeovers, and regulatory violations. Getting it right means building systems that protect users without creating friction.

Full-stack engineers are uniquely positioned to reason about auth because it spans every layer: how tokens are stored in the browser, how middleware validates requests, how database queries enforce permissions, and how secrets are managed in infrastructure.

---

## Core Concepts

### Authentication vs Authorization

```
Authentication (AuthN):
  "Who are you?"
  ├── Verifying the identity of a user or system
  ├── Happens BEFORE authorization
  ├── Examples: Login form, API key, OAuth token
  └── Result: A verified identity (user ID, service account)

Authorization (AuthZ):
  "What are you allowed to do?"
  ├── Determining permissions for an authenticated identity
  ├── Happens AFTER authentication
  ├── Examples: Role checks, permission lookups, policy evaluation
  └── Result: Allow or deny access to a resource/action
```

### JSON Web Tokens (JWT)

#### JWT Structure

```
A JWT consists of three parts separated by dots:
header.payload.signature

Example token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiJ1c2VyXzEyMyIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

Decoded:

Header (algorithm and token type):
{
  "alg": "HS256",    // Signing algorithm
  "typ": "JWT"       // Token type
}

Payload (claims):
{
  "sub": "user_123",        // Subject (user ID)
  "role": "admin",          // Custom claim
  "iat": 1700000000,        // Issued at (Unix timestamp)
  "exp": 1700003600,        // Expiration (1 hour later)
  "iss": "myapp.com",       // Issuer
  "aud": "api.myapp.com"    // Audience
}

Signature:
  HMACSHA256(
    base64UrlEncode(header) + "." + base64UrlEncode(payload),
    secret
  )
```

#### Signing Algorithms

```
Symmetric (shared secret):
├── HS256 (HMAC-SHA256)
│   - Same secret for signing and verification
│   - Simple to implement
│   - Secret must be shared between services
│   - Good for: Single service or trusted internal services
└── Key: A random string (at least 256 bits / 32 bytes)

Asymmetric (public/private key pair):
├── RS256 (RSA-SHA256)
│   - Private key signs, public key verifies
│   - Verification possible without the signing secret
│   - Good for: Microservices (only auth service has private key)
│   - Key size: 2048+ bits
├── ES256 (ECDSA-SHA256)
│   - Same concept as RS256 but with elliptic curves
│   - Smaller keys, faster verification
│   - Recommended for new applications
└── Key pair: Generated with openssl or similar tool

Recommendation:
- HS256 for simple apps with a single backend
- RS256 or ES256 for distributed systems
- NEVER use "none" algorithm (no signature)
- ALWAYS validate the algorithm in verification (prevent alg switching attack)
```

#### Access Tokens and Refresh Tokens

```
Access Token:
├── Short-lived (15 minutes to 1 hour)
├── Sent with every API request (Authorization header)
├── Contains user identity and permissions
├── Stateless - no database lookup needed
├── If stolen, exposure is time-limited
└── Format: JWT

Refresh Token:
├── Long-lived (7-30 days)
├── Used only to get new access tokens
├── Stored securely (httpOnly cookie or secure storage)
├── Can be revoked (stored in database)
├── Should be rotated on each use
└── Format: Opaque string (not JWT) stored in database

Flow:
1. User logs in with credentials
2. Server returns access_token + refresh_token
3. Client uses access_token for API calls
4. When access_token expires, client calls /auth/refresh
5. Server validates refresh_token, returns new token pair
6. Old refresh_token is invalidated (rotation)
```

#### Token Rotation

```
Why rotate refresh tokens:
- If a refresh token is stolen, attacker can get new access tokens
- Rotation ensures each refresh token is used only once
- If both real user and attacker try to use the same token,
  the server detects the reuse and invalidates the entire family

Implementation:

Token Family Approach:
┌─────────────────────────────────────────────────┐
│ refresh_tokens table                            │
│                                                 │
│ id | token_hash | family_id | user_id | used    │
│ 1  | abc123...  | fam_1     | user_1  | true    │
│ 2  | def456...  | fam_1     | user_1  | false   │
│                                                 │
│ When token 2 is used:                           │
│  - Mark token 2 as used                         │
│  - Create token 3 in the same family            │
│  - Return new access_token + token 3            │
│                                                 │
│ If someone tries to reuse token 1:              │
│  - Token 1 is already used → BREACH DETECTED    │
│  - Invalidate ALL tokens in family fam_1        │
│  - Force user to re-authenticate                │
└─────────────────────────────────────────────────┘
```

### OAuth 2.0

#### Authorization Code Flow (Web Applications)

```
Best for: Server-side web applications

1. User clicks "Login with Google"
2. App redirects to Google's authorization endpoint:
   GET https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=YOUR_CLIENT_ID
     &redirect_uri=https://yourapp.com/callback
     &response_type=code
     &scope=openid email profile
     &state=random_csrf_token

3. User logs in at Google and grants permission
4. Google redirects to your callback with authorization code:
   GET https://yourapp.com/callback
     ?code=AUTHORIZATION_CODE
     &state=random_csrf_token

5. Your server exchanges code for tokens (server-to-server):
   POST https://oauth2.googleapis.com/token
   {
     "code": "AUTHORIZATION_CODE",
     "client_id": "YOUR_CLIENT_ID",
     "client_secret": "YOUR_CLIENT_SECRET",
     "redirect_uri": "https://yourapp.com/callback",
     "grant_type": "authorization_code"
   }

6. Google returns:
   {
     "access_token": "ya29...",
     "refresh_token": "1//...",
     "id_token": "eyJ...",        // JWT with user info
     "expires_in": 3600,
     "token_type": "Bearer"
   }

7. Your server uses access_token to call Google APIs
8. Your server creates a session for the user

Key security properties:
- Client secret never exposed to the browser
- Authorization code is short-lived (typically 10 minutes)
- Authorization code can only be used once
- State parameter prevents CSRF attacks
```

#### Authorization Code Flow with PKCE (Mobile/SPA)

```
Best for: Single-page applications and mobile apps
(Cannot securely store a client_secret)

PKCE (Proof Key for Code Exchange):

1. Client generates a random code_verifier (43-128 chars)
   code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

2. Client creates code_challenge from code_verifier
   code_challenge = BASE64URL(SHA256(code_verifier))
   code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

3. Client redirects to authorization endpoint with challenge:
   GET https://auth.example.com/authorize
     ?client_id=YOUR_CLIENT_ID
     &redirect_uri=https://yourapp.com/callback
     &response_type=code
     &scope=openid email
     &state=random_csrf_token
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256

4. User authenticates and is redirected back with code

5. Client exchanges code for tokens, including the verifier:
   POST https://auth.example.com/token
   {
     "code": "AUTHORIZATION_CODE",
     "client_id": "YOUR_CLIENT_ID",
     "redirect_uri": "https://yourapp.com/callback",
     "grant_type": "authorization_code",
     "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
   }

6. Server verifies: SHA256(code_verifier) === code_challenge
   If match → issue tokens
   If no match → reject (someone intercepted the code)

Why PKCE matters:
- Even if an attacker intercepts the authorization code,
  they cannot exchange it without the code_verifier
- The code_verifier is never sent over the redirect URL
- Prevents authorization code interception attacks
```

#### OAuth 2.0 Grant Types Summary

```
Authorization Code (+ PKCE):
  Use for: Web apps, mobile apps, SPAs
  Security: Highest (code exchange happens server-side)

Client Credentials:
  Use for: Service-to-service (no user involved)
  Flow: Client sends client_id + client_secret, gets access_token
  Example: Backend service calling another backend service

Device Code:
  Use for: Smart TVs, CLI tools, IoT devices (no browser)
  Flow: Device shows code, user enters it on another device

Implicit (DEPRECATED):
  Was for: SPAs before PKCE existed
  Problem: Token in URL fragment (exposed in browser history)
  Use instead: Authorization Code + PKCE

Resource Owner Password (DEPRECATED):
  Was for: Trusted first-party apps
  Problem: App sees user's password directly
  Use instead: Authorization Code + PKCE
```

### Session-Based Authentication

```
How session auth works:

1. User sends credentials (username + password)
2. Server validates credentials
3. Server creates a session record in storage (database/Redis)
4. Server sends session ID as httpOnly cookie
5. Browser automatically includes cookie in subsequent requests
6. Server looks up session by ID to identify user
7. On logout, server deletes the session record

Session storage options:
├── In-memory (development only, lost on restart)
├── Database (PostgreSQL, MySQL)
│   - Durable, queryable
│   - Slightly slower than Redis
├── Redis (production recommended)
│   - Fast, supports TTL natively
│   - Built-in expiration for session cleanup
└── File system (not recommended for production)

Session vs JWT comparison:

Session-based:
├── Stateful (server stores session data)
├── Easy to revoke (delete from storage)
├── Cookie-based (browser handles it)
├── Works well with server-rendered apps
├── Requires session storage (database/Redis)
└── Not ideal for mobile apps or microservices

JWT-based:
├── Stateless (no server-side storage needed)
├── Hard to revoke (must use blocklist)
├── Header-based (client manages token)
├── Works well with SPAs and mobile apps
├── Scales easily (no shared session store)
└── Token size can be large with many claims
```

### Password Hashing

```
NEVER store passwords in plain text.
NEVER use MD5 or SHA-256 for passwords (too fast to brute force).
ALWAYS use a password-specific hashing algorithm.

Recommended algorithms (in order of preference):

1. Argon2id (best choice for new applications)
   - Memory-hard (resistant to GPU/ASIC attacks)
   - Winner of the Password Hashing Competition (2015)
   - Configurable: memory, iterations, parallelism
   - Parameters: memory=64MB, iterations=3, parallelism=4

2. bcrypt (widely supported, proven)
   - CPU-hard (configurable cost factor)
   - Built-in salt
   - Cost factor 12 is standard (adjust based on hardware)
   - Maximum password length: 72 bytes

3. scrypt (memory-hard alternative)
   - Memory-hard like Argon2
   - Older, less configurable
   - Still secure if properly configured

Key properties:
├── Salt: Random bytes prepended to password before hashing
│   - Prevents rainbow table attacks
│   - Each password gets a unique salt
│   - Salt is stored alongside the hash
├── Work factor: Adjustable computation cost
│   - Increase as hardware gets faster
│   - Target: ~250ms to hash on your server
│   - Too fast → brute force is easy
│   - Too slow → DoS by repeated login attempts
└── Hash comparison: Use constant-time comparison
    - Prevents timing attacks
```

### Role-Based Access Control (RBAC) vs Attribute-Based Access Control (ABAC)

```
RBAC (Role-Based Access Control):
  Users are assigned roles, roles have permissions.

  Simple RBAC:
  ├── Roles: admin, editor, viewer
  ├── Permissions per role:
  │   admin  → create, read, update, delete
  │   editor → create, read, update
  │   viewer → read
  └── Check: user.role === 'admin' || user.role === 'editor'

  Hierarchical RBAC:
  ├── Roles inherit from parent roles
  │   super_admin → admin → editor → viewer
  └── Each level includes permissions of lower levels

  Database schema:
  ┌─────────┐     ┌────────────┐     ┌─────────────┐
  │  users  │────→│ user_roles │←────│   roles     │
  │         │     │            │     │             │
  │ id      │     │ user_id    │     │ id          │
  │ name    │     │ role_id    │     │ name        │
  └─────────┘     └────────────┘     └──────┬──────┘
                                            │
                                     ┌──────┴──────┐
                                     │ role_perms  │
                                     │             │
                                     │ role_id     │
                                     │ perm_id     │
                                     └──────┬──────┘
                                            │
                                     ┌──────┴──────┐
                                     │ permissions │
                                     │             │
                                     │ id          │
                                     │ name        │
                                     │ resource    │
                                     │ action      │
                                     └─────────────┘

ABAC (Attribute-Based Access Control):
  Decisions based on attributes of user, resource, action, and environment.

  Example policy:
  "Allow if user.department === resource.department
   AND user.clearance_level >= resource.sensitivity_level
   AND environment.time is within business_hours"

  More flexible but more complex:
  ├── Can express any access control policy
  ├── Policies evaluated at runtime
  ├── Common frameworks: OPA (Open Policy Agent), Casbin, Cedar
  └── Good for: Complex enterprise environments

When to use which:
├── RBAC: Most applications (simpler, well-understood)
├── ABAC: When RBAC becomes too many roles (role explosion)
├── Hybrid: RBAC for basic permissions + ABAC for fine-grained
└── Start with RBAC, migrate to ABAC if needed
```

### Multi-Factor Authentication (MFA)

```
Factor types:
├── Something you know: Password, PIN
├── Something you have: Phone (TOTP), hardware key (WebAuthn/FIDO2)
└── Something you are: Fingerprint, face recognition

TOTP (Time-based One-Time Password):
  1. User enables MFA
  2. Server generates a secret key
  3. Secret is shared via QR code (scanned by authenticator app)
  4. App generates 6-digit codes that change every 30 seconds
  5. On login, user enters code from app
  6. Server generates the expected code and compares

  Code generation:
  TOTP = TRUNCATE(HMAC-SHA1(secret, floor(time / 30)))
  - Same algorithm in both server and authenticator app
  - Time must be approximately synchronized
  - Allow ±1 time step for clock drift

WebAuthn / FIDO2 (phishing-resistant):
  1. User registers a hardware key or platform authenticator
  2. Device generates a public/private key pair
  3. Public key stored on server, private key stays on device
  4. On login, server sends a challenge
  5. Device signs challenge with private key
  6. Server verifies signature with stored public key

  Why it is phishing-resistant:
  - Key is bound to the domain (origin)
  - A phishing site on a different domain cannot trigger the key
  - No shared secret that can be intercepted

Recovery codes:
  - Generate 8-10 one-time use codes when MFA is enabled
  - Store hashed (like passwords)
  - User stores these safely as backup
  - Each code can only be used once
```

### API Key Authentication

```
Use cases:
├── Service-to-service communication
├── Public APIs (with rate limiting)
├── CI/CD pipelines
├── Third-party integrations
└── NOT for user authentication (no identity context)

Implementation:

Key generation:
  - Use cryptographically random bytes (32+ bytes)
  - Prefix with a type identifier: sk_live_abc123... (secret key)
  - Store the hash of the key, not the key itself
  - Only show the full key once (at creation time)
  - Provide a key prefix for identification: sk_live_abc1****

Storage:
  CREATE TABLE api_keys (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,       -- Human-readable label
      key_prefix VARCHAR(10) NOT NULL,  -- First 8 chars for lookup
      key_hash VARCHAR(255) NOT NULL,   -- SHA-256 of full key
      user_id UUID REFERENCES users(id),
      scopes TEXT[],                    -- Allowed permissions
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
  );

Validation middleware:
  1. Extract key from Authorization header (Bearer) or X-API-Key header
  2. Extract prefix from key
  3. Look up key_hash by prefix
  4. Compare SHA-256(provided_key) with stored key_hash
  5. Check expiration
  6. Check scopes against requested action
  7. Update last_used_at

Security practices:
  - Rotate keys periodically
  - Support multiple active keys (for zero-downtime rotation)
  - Log key usage for auditing
  - Set expiration dates
  - Scope keys to minimum required permissions
  - Never send keys in URLs (use headers)
```

---

## Practical Scenarios

### Scenario 1: Implementing Authentication for a New Application

```
Stack: React SPA + Node.js API + PostgreSQL

Step 1: Registration
  POST /api/auth/register
  {
    "email": "user@example.com",
    "password": "SecureP@ss123",
    "name": "John Doe"
  }

  Server:
  1. Validate input (email format, password strength)
  2. Check if email already exists
  3. Hash password with Argon2id
  4. Create user in database
  5. Send verification email (optional)
  6. Return success (do NOT auto-login)

Step 2: Login
  POST /api/auth/login
  {
    "email": "user@example.com",
    "password": "SecureP@ss123"
  }

  Server:
  1. Find user by email
  2. Compare password hash
  3. Generate access token (JWT, 15 min)
  4. Generate refresh token (opaque, 7 days)
  5. Store refresh token hash in database
  6. Return tokens

Step 3: Token storage (frontend)
  Access token:  In-memory variable (not localStorage)
  Refresh token: httpOnly, secure, sameSite cookie

  Why not localStorage for access tokens:
  - Accessible to any JavaScript on the page
  - Vulnerable to XSS attacks
  - If attacker injects script, they can steal the token

  Why httpOnly cookie for refresh token:
  - Not accessible to JavaScript
  - Automatically sent with requests
  - Protected from XSS
  - sameSite=strict prevents CSRF

Step 4: Authenticated requests
  Client sends: Authorization: Bearer <access_token>
  Server middleware validates JWT and extracts user

Step 5: Token refresh
  POST /api/auth/refresh
  Cookie: refresh_token=<token>

  Server:
  1. Extract refresh token from cookie
  2. Look up token hash in database
  3. Verify token is valid and not expired
  4. Generate new access + refresh token pair
  5. Invalidate old refresh token
  6. Return new tokens

Step 6: Logout
  POST /api/auth/logout
  Server: Delete refresh token from database
  Client: Clear in-memory access token
```

### Scenario 2: Adding OAuth Social Login

```
Adding "Login with GitHub" to an existing email/password system:

Database changes:
  CREATE TABLE oauth_accounts (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,       -- 'github', 'google'
      provider_user_id VARCHAR(255) NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_user_id)
  );

Login flow:
  1. User clicks "Login with GitHub"
  2. Redirect to GitHub authorization URL
  3. User authorizes your app on GitHub
  4. GitHub redirects to callback with code
  5. Server exchanges code for GitHub access token
  6. Server fetches user profile from GitHub API
  7. Server checks: Does an oauth_account exist for this GitHub user?

  If YES (returning user):
    - Load the linked user account
    - Generate access + refresh tokens
    - Return tokens

  If NO (new user via OAuth):
    - Check if email matches an existing user
      If YES:
        - Link OAuth account to existing user
        - Generate tokens
      If NO:
        - Create new user account
        - Create linked OAuth account
        - Generate tokens

Account linking edge case:
  User registered with email, later tries "Login with GitHub"
  using the same email:
  - Do NOT auto-link (security risk: email could be unverified)
  - Prompt user to log in with password first, then link GitHub
  - Or: Send a verification email to confirm ownership
```

### Scenario 3: Implementing RBAC Middleware

```typescript
// Database schema
// roles: id, name (admin, manager, member)
// permissions: id, resource, action (posts:create, posts:read, etc.)
// role_permissions: role_id, permission_id
// user_roles: user_id, role_id, organization_id

// Middleware pattern
import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    roles: string[];
    permissions: string[];
  };
}

// Load user permissions once per request
async function loadPermissions(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const permissions = await db.query(
      `
      SELECT DISTINCT p.resource, p.action
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1
    `,
      [req.user.id]
    );

    req.user.permissions = permissions.rows.map(
      (p: { resource: string; action: string }) => `${p.resource}:${p.action}`
    );

    next();
  } catch (error) {
    next(error);
  }
}

// Authorization middleware factory
function requirePermission(resource: string, action: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const required = `${resource}:${action}`;
    const hasPermission = req.user.permissions.includes(required);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `You do not have permission to ${action} ${resource}`,
        },
      });
    }

    next();
  };
}

// Resource ownership check
function requireOwnership(
  getResourceUserId: (req: Request) => Promise<string | null>
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Admins bypass ownership check
      if (req.user.permissions.includes('admin:all')) {
        return next();
      }

      const resourceUserId = await getResourceUserId(req);

      if (resourceUserId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only modify your own resources',
          },
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Usage in routes
router.get(
  '/posts',
  authenticate,
  loadPermissions,
  requirePermission('posts', 'read'),
  listPosts
);

router.post(
  '/posts',
  authenticate,
  loadPermissions,
  requirePermission('posts', 'create'),
  createPost
);

router.patch(
  '/posts/:id',
  authenticate,
  loadPermissions,
  requirePermission('posts', 'update'),
  requireOwnership(async (req) => {
    const post = await db.query('SELECT user_id FROM posts WHERE id = $1', [
      req.params.id,
    ]);
    return post.rows[0]?.user_id || null;
  }),
  updatePost
);

router.delete(
  '/posts/:id',
  authenticate,
  loadPermissions,
  requirePermission('posts', 'delete'),
  deletePost
);
```

---

## Interview Questions

### Q1: "Explain how JWT authentication works and its trade-offs."

```
How it works:
1. User provides credentials (email + password)
2. Server verifies credentials against database
3. Server creates a JWT with user claims (id, role, exp)
4. Server signs the JWT with a secret key
5. Server returns the JWT to the client
6. Client includes JWT in Authorization header for subsequent requests
7. Server verifies the signature and extracts claims
8. No database lookup needed for authentication

Trade-offs:

Advantages:
├── Stateless: No server-side session storage needed
├── Scalable: Any server can verify the token (no shared state)
├── Cross-domain: Works easily across different origins
├── Mobile-friendly: No cookie dependency
├── Self-contained: Carries its own user data
└── Microservice-friendly: Services can verify independently

Disadvantages:
├── Cannot be revoked easily
│   - Once issued, valid until expiration
│   - Must use a blocklist (negates stateless benefit)
│   - Mitigation: Short expiration + refresh tokens
├── Token size
│   - Larger than session ID (~1KB vs ~32 bytes)
│   - Sent with every request (bandwidth overhead)
├── Sensitive data exposure
│   - Payload is base64-encoded, NOT encrypted
│   - Anyone can decode and read the claims
│   - Never store secrets in JWT payload
├── Clock synchronization
│   - Expiration depends on server time
│   - Clock skew can cause premature rejection
└── Complexity
    - Refresh token rotation adds implementation complexity
    - Need to handle token storage securely on client

When I would choose JWT:
- SPAs and mobile apps
- Microservice architectures
- APIs consumed by third parties

When I would choose sessions:
- Server-rendered applications (Next.js, Rails)
- When instant revocation is required
- Simple monolithic applications
```

### Q2: "How do you securely store passwords?"

```
Answer structure:

1. Use a purpose-built hashing algorithm
   - Argon2id (recommended) or bcrypt (widely supported)
   - NOT MD5, SHA-256, or any general-purpose hash

2. Why these specific algorithms?
   - They are intentionally slow (configurable work factor)
   - They include a random salt automatically
   - They are resistant to GPU/ASIC acceleration (Argon2)

3. Implementation example (Node.js with Argon2):
   import { hash, verify } from 'argon2';

   // Registration
   const passwordHash = await hash(password, {
     type: 2,          // argon2id
     memoryCost: 65536, // 64MB
     timeCost: 3,       // 3 iterations
     parallelism: 4,    // 4 threads
   });
   // Store passwordHash in database

   // Login
   const isValid = await verify(storedHash, providedPassword);

4. Additional security measures:
   - Enforce minimum password length (8+ characters)
   - Check against known breached passwords (Have I Been Pwned API)
   - Rate limit login attempts (5 per minute per IP/account)
   - Lock account after repeated failures (with unlock mechanism)
   - Do not reveal whether email or password is wrong
     ("Invalid credentials" instead of "User not found")

5. Password reset flow:
   - Generate a cryptographically random token
   - Store the hash of the token (not the token itself)
   - Send token via email (HTTPS link)
   - Token expires in 1 hour
   - Invalidate all sessions on password change
```

### Q3: "What is the difference between OAuth and OpenID Connect?"

```
OAuth 2.0:
  Purpose: Authorization (delegated access to resources)
  Question it answers: "Can this app access my Google Drive files?"

  - Designed for granting limited access to resources
  - Returns an access_token for API calls
  - Does NOT provide user identity information
  - The access_token is opaque to the client

OpenID Connect (OIDC):
  Purpose: Authentication (verify user identity)
  Question it answers: "Who is this user?"

  - Built ON TOP of OAuth 2.0
  - Adds an id_token (JWT with user info)
  - Defines standard claims (sub, name, email, picture)
  - Provides a /userinfo endpoint
  - Standardizes the login flow

Relationship:
  OIDC = OAuth 2.0 + Identity Layer

  OAuth 2.0 alone:
    → "Here is an access token to call my API"
    → You do not know WHO the user is

  OIDC:
    → "Here is an id_token proving this is john@example.com"
    → AND an access_token to call APIs on their behalf

In practice:
  When you implement "Login with Google":
  - You are using OIDC (getting user identity)
  - You are also using OAuth 2.0 (getting access to Google APIs)
  - The scope "openid email profile" triggers OIDC
  - Without "openid" scope, you only get OAuth 2.0
```

### Q4: "How would you implement authorization for a multi-tenant application?"

```
Requirements:
- Users belong to organizations (tenants)
- Users have different roles in different organizations
- Users must only see data from their organization
- Some users are members of multiple organizations

Database design:
  users: id, email, name
  organizations: id, name, slug
  memberships: user_id, org_id, role (owner, admin, member, viewer)

Authorization layers:

Layer 1: Authentication middleware
  - Verify JWT, extract user ID

Layer 2: Organization context
  - Determine current organization from:
    - Subdomain: acme.app.com → org = "acme"
    - Header: X-Organization-Id
    - URL parameter: /orgs/acme/...
  - Verify user is a member of this organization

Layer 3: Role-based checks
  - Check user's role within the current organization
  - Apply permission rules based on role

Layer 4: Database-level enforcement (defense in depth)
  - Row-Level Security in PostgreSQL
  - All queries automatically scoped to current org

Implementation:

  async function orgMiddleware(req, res, next) {
    const orgSlug = req.headers['x-organization'] || req.subdomains[0];

    const membership = await db.query(
      `SELECT m.role, o.id as org_id
       FROM memberships m
       JOIN organizations o ON m.org_id = o.id
       WHERE m.user_id = $1 AND o.slug = $2`,
      [req.user.id, orgSlug]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'Not a member of this organization' },
      });
    }

    req.org = {
      id: membership.rows[0].org_id,
      role: membership.rows[0].role,
    };

    // Set PostgreSQL context for RLS
    await db.query(`SET LOCAL app.org_id = '${req.org.id}'`);

    next();
  }
```

### Q5: "Explain CSRF attacks and how to prevent them."

```
CSRF (Cross-Site Request Forgery):
  Attacker tricks a user's browser into making an unwanted request
  to a site where the user is authenticated.

How it works:
  1. User is logged into bank.com (has session cookie)
  2. User visits evil.com
  3. evil.com contains:
     <form action="https://bank.com/transfer" method="POST">
       <input type="hidden" name="to" value="attacker" />
       <input type="hidden" name="amount" value="10000" />
     </form>
     <script>document.forms[0].submit();</script>
  4. Browser sends the form to bank.com WITH the session cookie
  5. Bank processes the transfer because the cookie is valid

Prevention methods:

1. CSRF tokens (traditional server-rendered apps):
   - Server generates a random token per session/request
   - Token embedded in forms as hidden field
   - Server validates token on submission
   - Attacker cannot read the token from another origin

2. SameSite cookies (modern approach):
   Set-Cookie: session=abc123; SameSite=Strict; Secure; HttpOnly
   - Strict: Cookie not sent on ANY cross-site request
   - Lax: Cookie sent on top-level navigations (GET) but not POST
   - None: Cookie always sent (requires Secure flag)
   Recommendation: Use SameSite=Lax as minimum

3. Custom request headers (for APIs):
   - Require a custom header (X-Requested-With: XMLHttpRequest)
   - Browsers do not add custom headers to form submissions
   - CORS prevents other origins from adding custom headers
   - Simple but effective for API-only backends

4. Double-submit cookie pattern:
   - Set a random value in both a cookie AND a header/body
   - Server compares the two values
   - Attacker can trigger the cookie but cannot read it
     (same-origin policy) so cannot include it in the header

Recommendation for SPAs:
  - Use SameSite=Strict cookies for auth
  - Send a CSRF token in a custom header
  - Validate Origin and Referer headers on the server
```

### Q6: "How do you handle authentication in a microservices architecture?"

```
Approaches:

1. API Gateway Authentication (most common):
   ┌────────┐     ┌──────────┐     ┌──────────────┐
   │ Client │────→│ Gateway  │────→│ Service A    │
   │        │     │          │     │ (trusts gw)  │
   └────────┘     │ Verifies │     └──────────────┘
                  │ JWT      │     ┌──────────────┐
                  │          │────→│ Service B    │
                  │ Attaches │     │ (trusts gw)  │
                  │ user ctx │     └──────────────┘
                  └──────────┘

   - Gateway validates JWT
   - Forwards user context to services (header or token)
   - Services trust the gateway
   - Services do not need to know the JWT secret
   Pro: Centralized auth logic
   Con: Gateway is a single point of failure

2. Token Verification in Each Service:
   ┌────────┐     ┌──────────────┐
   │ Client │────→│ Service A    │
   │        │     │ Verifies JWT │
   └────────┘     └──────────────┘
   │
   └────────────→ ┌──────────────┐
                  │ Service B    │
                  │ Verifies JWT │
                  └──────────────┘

   - Each service has the public key to verify JWTs
   - Use RS256/ES256 (asymmetric) so services do not need the private key
   - Only the auth service has the private key (to sign tokens)
   Pro: No single point of failure
   Con: Each service needs JWT library, harder to update auth logic

3. Service-to-Service Authentication:
   - Services authenticate to each other using:
     - Mutual TLS (mTLS): Both sides present certificates
     - Service tokens: Short-lived JWTs for service identity
     - API keys: For simpler internal communication
   - User context propagated via headers (X-User-Id, X-User-Role)
   - Service mesh (Istio, Linkerd) handles mTLS automatically

Recommendation:
  - API Gateway for external requests (validate user JWTs)
  - mTLS or service mesh for internal service-to-service
  - Propagate user context as headers inside the mesh
  - Use short-lived tokens for inter-service API calls
```

### Q7: "What security headers should every web application set?"

```
Essential security headers:

1. Content-Security-Policy (CSP):
   Content-Security-Policy: default-src 'self'; script-src 'self';
     style-src 'self' 'unsafe-inline'; img-src 'self' https:;
     connect-src 'self' https://api.example.com;
   - Prevents XSS by controlling which resources can load
   - Start with report-only mode, then enforce

2. Strict-Transport-Security (HSTS):
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   - Forces HTTPS for all future requests
   - Prevents SSL stripping attacks

3. X-Content-Type-Options:
   X-Content-Type-Options: nosniff
   - Prevents MIME type sniffing
   - Browser respects declared Content-Type

4. X-Frame-Options:
   X-Frame-Options: DENY
   - Prevents clickjacking (page cannot be embedded in iframe)
   - Modern alternative: frame-ancestors in CSP

5. Referrer-Policy:
   Referrer-Policy: strict-origin-when-cross-origin
   - Controls how much referrer info is sent
   - Prevents leaking URLs with sensitive data

6. Permissions-Policy:
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   - Disables browser features you do not use
   - Reduces attack surface

7. X-XSS-Protection (legacy, but still set it):
   X-XSS-Protection: 0
   - Disabled because it can introduce vulnerabilities
   - CSP is the modern replacement

Implementation with Helmet.js (Express):
  import helmet from 'helmet';
  app.use(helmet());
  // Sets all recommended headers with sane defaults
```

### Q8: "How would you implement a password reset flow securely?"

```
Secure password reset flow:

1. User requests reset:
   POST /api/auth/forgot-password
   { "email": "user@example.com" }

   Server:
   a. Find user by email (do NOT reveal if email exists)
   b. Generate a cryptographically random token (32 bytes)
   c. Hash the token and store it with expiration:
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 hour')
   d. Send email with reset link:
      https://app.com/reset-password?token=<raw_token>
   e. ALWAYS return success (even if email not found)
      "If an account exists with that email, we sent a reset link."

2. User clicks reset link:
   GET /reset-password?token=<raw_token>
   Frontend shows a new password form

3. User submits new password:
   POST /api/auth/reset-password
   { "token": "<raw_token>", "password": "NewSecureP@ss" }

   Server:
   a. Hash the provided token
   b. Look up the hash in password_resets table
   c. Check if expired
   d. Validate new password (length, complexity)
   e. Hash new password with Argon2id
   f. Update user's password
   g. Delete the reset token
   h. Invalidate all existing sessions for this user
   i. Send confirmation email
   j. Return success

Security considerations:
├── Token is single-use (deleted after use)
├── Token expires (1 hour maximum)
├── Store hash of token (if database is compromised, tokens are safe)
├── Rate limit the request endpoint (prevent email bombing)
├── Do not reveal if email exists (prevents user enumeration)
├── Invalidate all sessions after password change
├── Log password reset events for security auditing
└── Notify user of password change via email
```

---

## Code Examples

### Complete Authentication System (Node.js + Express)

```typescript
// auth/service.ts
import { hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;

interface TokenPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: 2, // argon2id
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(
  storedHash: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

async function generateAccessToken(
  userId: string,
  role: string
): Promise<string> {
  return new SignJWT({ sub: userId, role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setIssuer('myapp')
    .sign(JWT_SECRET);
}

function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'myapp',
  });

  return payload as unknown as TokenPayload;
}

// auth/routes.ts
import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body);

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [
      input.email,
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
        },
      });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(input.password);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [input.email, passwordHash, input.name]
    );

    return res.status(201).json({
      success: true,
      data: { user: result.rows[0] },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const input = LoginSchema.parse(req.body);

    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [
      input.email,
    ]);
    const user = result.rows[0];

    // Constant-time comparison even if user not found
    if (!user || !(await verifyPassword(user.password_hash, input.password))) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Generate tokens
    const accessToken = await generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();

    // Store refresh token hash
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_TTL_DAYS} days')`,
      [refreshTokenHash, user.id]
    );

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token required' },
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Find and validate the refresh token
    const result = await db.query(
      `SELECT rt.*, u.role FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND rt.revoked = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }

    const tokenRecord = result.rows[0];

    // Rotate: revoke old token, create new one
    await db.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [
      tokenRecord.id,
    ]);

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = crypto
      .createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    await db.query(
      `INSERT INTO refresh_tokens (token_hash, user_id, family_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '${REFRESH_TOKEN_TTL_DAYS} days')`,
      [newRefreshTokenHash, tokenRecord.user_id, tokenRecord.family_id]
    );

    const accessToken = await generateAccessToken(
      tokenRecord.user_id,
      tokenRecord.role
    );

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return res.json({
      success: true,
      data: { accessToken },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      await db.query(
        'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
        [tokenHash]
      );
    }

    res.clearCookie('refresh_token', { path: '/api/auth' });

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### Frontend Auth Hook (React)

```typescript
// hooks/useAuth.ts
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Store access token in memory (NOT localStorage)
let accessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include httpOnly cookie
    });

    if (!response.ok) {
      accessToken = null;
      tokenExpiresAt = 0;
      return null;
    }

    const data = await response.json();
    accessToken = data.data.accessToken;

    // Parse JWT to get expiration (without verifying - that is the server's job)
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    tokenExpiresAt = payload.exp * 1000;

    return accessToken;
  } catch {
    accessToken = null;
    tokenExpiresAt = 0;
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    async function init() {
      const token = await refreshAccessToken();
      if (token) {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.data.user);
        }
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // If token is still valid (with 60s buffer), return it
    if (accessToken && Date.now() < tokenExpiresAt - 60000) {
      return accessToken;
    }
    // Otherwise refresh
    return refreshAccessToken();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Login failed');
    }

    const data = await response.json();
    accessToken = data.data.accessToken;

    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    tokenExpiresAt = payload.exp * 1000;

    setUser(data.data.user);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    accessToken = null;
    tokenExpiresAt = 0;
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Authenticated fetch wrapper
export function useAuthFetch() {
  const { getAccessToken, logout } = useAuth();

  return useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getAccessToken();

    if (!token) {
      await logout();
      throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // If 401, try refreshing once
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        await logout();
        throw new Error('Session expired');
      }

      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    return response;
  }, [getAccessToken, logout]);
}
```

---

## Quick Reference

### Authentication Method Selection

```
Method              | Best For                   | Revocable | Stateless
--------------------|----------------------------|-----------|----------
Session + Cookie    | Server-rendered apps       | Yes       | No
JWT Access Token    | SPAs, mobile, APIs         | No*       | Yes
JWT + Refresh Token | SPAs, mobile (recommended) | Yes**     | Partial
OAuth 2.0           | Third-party login          | Yes       | N/A
API Keys            | Service-to-service         | Yes       | No
mTLS                | Internal microservices     | Yes       | Yes

* Can use blocklist, but loses stateless benefit
** Refresh tokens are revocable; access tokens expire quickly
```

### Token Storage Security

```
Storage Location    | XSS Safe | CSRF Safe | Recommended
--------------------|----------|-----------|------------
localStorage        | No       | Yes       | No
sessionStorage      | No       | Yes       | No
httpOnly Cookie     | Yes      | No*       | For refresh tokens
In-memory variable  | Yes      | Yes       | For access tokens
Secure Cookie + SameSite | Yes | Yes       | Best option

* Mitigate with SameSite=Strict and CSRF tokens
```

### Password Requirements Checklist

```
Hashing:
├── [ ] Use Argon2id or bcrypt (never MD5/SHA)
├── [ ] Work factor targets ~250ms hash time
├── [ ] Salt is unique per password (built into Argon2/bcrypt)
└── [ ] Use constant-time comparison for verification

Policy:
├── [ ] Minimum 8 characters (NIST recommends no max under 64)
├── [ ] Check against breached password lists
├── [ ] Do not require arbitrary complexity rules
├── [ ] Allow paste in password fields
└── [ ] Show password strength meter

Protection:
├── [ ] Rate limit login attempts (5/minute per account)
├── [ ] Account lockout after 10 failures (with unlock)
├── [ ] Generic error messages (no user enumeration)
├── [ ] Log authentication events
└── [ ] Notify user of login from new device/location
```

### OAuth 2.0 Flow Decision

```
Flow                        | Use When
----------------------------|----------------------------------
Authorization Code + PKCE   | Web apps, mobile apps, SPAs
Client Credentials          | Service-to-service (no user)
Device Code                 | TVs, CLI tools, IoT devices
Authorization Code (no PKCE)| Confidential server-side clients
```

### Security Headers Cheat Sheet

```
Header                        | Value
------------------------------|-----------------------------------
Content-Security-Policy       | default-src 'self'; script-src 'self'
Strict-Transport-Security     | max-age=31536000; includeSubDomains
X-Content-Type-Options        | nosniff
X-Frame-Options               | DENY
Referrer-Policy               | strict-origin-when-cross-origin
Permissions-Policy            | camera=(), microphone=()
X-XSS-Protection              | 0
```

### RBAC Implementation Checklist

```
Database:
├── [ ] Users table with no direct permission columns
├── [ ] Roles table (admin, editor, viewer)
├── [ ] Permissions table (resource + action pairs)
├── [ ] Role-permission mapping table
├── [ ] User-role mapping table (with optional org scope)
└── [ ] Index on user_id in user_roles table

API:
├── [ ] Authentication middleware runs first
├── [ ] Permission loading middleware (cache per request)
├── [ ] Authorization middleware per route
├── [ ] Resource ownership checks where applicable
├── [ ] Admin bypass for ownership checks
└── [ ] Clear 403 error messages (not 404 to hide resources)

Frontend:
├── [ ] Hide UI elements user cannot access
├── [ ] But ALWAYS enforce on backend (UI hiding is cosmetic)
├── [ ] Role-aware navigation menus
├── [ ] Graceful handling of 403 responses
└── [ ] Redirect to appropriate page on permission denied
```
