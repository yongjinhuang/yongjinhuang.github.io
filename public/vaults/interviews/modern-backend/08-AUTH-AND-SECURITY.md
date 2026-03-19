# Modern Authentication & Backend Security

## Introduction

Authentication and security are the foundation that everything else rests on. A single vulnerability can undo months of feature work, destroy user trust, and create legal liability. In 2026, the authentication landscape has shifted dramatically: passkeys are replacing passwords, OAuth 2.1 has consolidated best practices, and zero-trust architecture is the standard, not the aspiration.

This guide covers modern authentication protocols, authorization models, API security patterns, and the comprehensive security checklist that production systems require. The emphasis is on understanding WHY protocols work the way they do -- because interview questions probe the reasoning behind security decisions, not just the API calls.

---

## Authentication in 2026

### The Authentication Landscape

```
+------------------------------------------------------------------+
|              AUTHENTICATION METHODS (2026)                         |
+------------------------------------------------------------------+
|                                                                  |
|  LEGACY (Avoid)            CURRENT                EMERGING       |
|  +-------------+          +---------------+      +-------------+ |
|  | Password    |          | OAuth 2.1     |      | Passkeys    | |
|  | (plain)     |          | + PKCE        |      | (WebAuthn)  | |
|  +-------------+          +---------------+      +-------------+ |
|  | OAuth 2.0   |          | OpenID Connect|      | Verifiable  | |
|  | (implicit)  |          | (OIDC)        |      | Credentials | |
|  +-------------+          +---------------+      +-------------+ |
|  | Basic Auth  |          | Magic Links   |      | DPoP Tokens | |
|  | (API)       |          |               |      |             | |
|  +-------------+          +---------------+      +-------------+ |
|                                                                  |
|  KEY CHANGES IN 2026:                                            |
|  - Implicit flow removed entirely (OAuth 2.1)                    |
|  - PKCE required for ALL clients (not just public)               |
|  - Passkeys supported by all major browsers and platforms         |
|  - Password-only auth is considered a security liability          |
|  - DPoP (sender-constrained tokens) gaining adoption             |
|                                                                  |
+------------------------------------------------------------------+
```

### Passkeys (WebAuthn / FIDO2)

Passkeys are cryptographic credentials that replace passwords. They are phishing-resistant, unguessable, and synced across devices via platform authenticators (iCloud Keychain, Google Password Manager, Windows Hello).

```
+------------------------------------------------------------------+
|              PASSKEY REGISTRATION FLOW                             |
+------------------------------------------------------------------+
|                                                                  |
|  Browser               Server             Authenticator          |
|  |                     |                  (TouchID/FaceID)       |
|  |                     |                  |                      |
|  | 1. Register req --->|                  |                      |
|  |                     |                  |                      |
|  | 2. Challenge <------|                  |                      |
|  |    (random bytes,   |                  |                      |
|  |     user info,      |                  |                      |
|  |     relying party)  |                  |                      |
|  |                     |                  |                      |
|  | 3. navigator.credentials.create() ---->|                      |
|  |                     |                  | 4. User verifies     |
|  |                     |                  |    (biometric/PIN)   |
|  |                     |                  |                      |
|  |                     |                  | 5. Generate key pair |
|  |                     |                  |    Store private key |
|  | 6. Attestation <------------------------| Return public key   |
|  |    (public key,     |                  |   + signed challenge |
|  |     credential ID,  |                  |                      |
|  |     attestation)    |                  |                      |
|  |                     |                  |                      |
|  | 7. Send to server ->|                  |                      |
|  |                     | 8. Verify        |                      |
|  |                     |    attestation   |                      |
|  |                     |    Store pubkey  |                      |
|  | 9. Success <--------|                  |                      |
|                                                                  |
|  AUTHENTICATION FLOW:                                            |
|  Same flow but uses navigator.credentials.get()                  |
|  Server sends challenge, authenticator signs it with private key |
|  Server verifies signature with stored public key                |
|                                                                  |
|  WHY PASSKEYS ARE PHISHING-RESISTANT:                            |
|  The credential is bound to the origin (domain).                 |
|  A phishing site at evil.com cannot trigger a credential         |
|  created for example.com -- the browser enforces this.           |
|                                                                  |
+------------------------------------------------------------------+
```

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const rpName = 'My Application';
const rpID = 'example.com';
const origin = `https://${rpID}`;

// ── Registration ────────────────────────────────────────────
async function startRegistration(userId: string, userName: string) {
  // Get existing credentials for this user (to exclude them)
  const existingCredentials = await db.query(
    'SELECT credential_id, transports FROM passkeys WHERE user_id = $1',
    [userId]
  );

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(userId),
    userName,
    attestationType: 'none', // "none" is simpler; "direct" for enterprise
    excludeCredentials: existingCredentials.rows.map((cred) => ({
      id: cred.credential_id,
      type: 'public-key',
      transports: cred.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred', // Discoverable credential
      userVerification: 'preferred', // Biometric/PIN
    },
  });

  // Store challenge for verification (must be per-session)
  await redis.set(
    `webauthn:challenge:${userId}`,
    options.challenge,
    'EX',
    300 // 5 minute expiry
  );

  return options;
}

async function finishRegistration(
  userId: string,
  response: RegistrationResponseJSON
) {
  const expectedChallenge = await redis.get(`webauthn:challenge:${userId}`);
  if (!expectedChallenge) {
    throw new Error('Challenge expired or not found');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  // Store the credential
  await db.query(
    `INSERT INTO passkeys
     (user_id, credential_id, public_key, counter,
      device_type, backed_up, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      Buffer.from(credential.id),
      Buffer.from(credential.publicKey),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp,
      JSON.stringify(response.response.transports ?? []),
    ]
  );

  // Clean up challenge
  await redis.del(`webauthn:challenge:${userId}`);

  return { verified: true };
}

// ── Authentication ──────────────────────────────────────────
async function startAuthentication(userId?: string) {
  const allowCredentials = userId
    ? (
        await db.query(
          'SELECT credential_id, transports FROM passkeys WHERE user_id = $1',
          [userId]
        )
      ).rows.map((cred) => ({
        id: cred.credential_id,
        type: 'public-key' as const,
        transports: JSON.parse(cred.transports),
      }))
    : []; // Empty = discoverable credential (usernameless login)

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  await redis.set(
    `webauthn:auth-challenge:${options.challenge}`,
    userId ?? 'discoverable',
    'EX',
    300
  );

  return options;
}

async function finishAuthentication(
  response: AuthenticationResponseJSON,
  challenge: string
) {
  // Look up credential
  const credential = await db.query(
    'SELECT * FROM passkeys WHERE credential_id = $1',
    [Buffer.from(response.id, 'base64url')]
  );

  if (credential.rows.length === 0) {
    throw new Error('Credential not found');
  }

  const passkey = credential.rows[0];

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credential_id,
      publicKey: passkey.public_key,
      counter: passkey.counter,
    },
  });

  if (!verification.verified) {
    throw new Error('Authentication verification failed');
  }

  // Update counter (replay attack protection)
  await db.query('UPDATE passkeys SET counter = $1 WHERE credential_id = $2', [
    verification.authenticationInfo.newCounter,
    passkey.credential_id,
  ]);

  return { verified: true, userId: passkey.user_id };
}
```

### OAuth 2.1 with PKCE

OAuth 2.1 consolidates OAuth 2.0 best practices. Key changes: PKCE is mandatory for all clients, implicit flow is removed, and refresh tokens must be sender-constrained or one-time-use.

```
+------------------------------------------------------------------+
|              OAUTH 2.1 AUTHORIZATION CODE + PKCE                   |
+------------------------------------------------------------------+
|                                                                  |
|  Client (SPA)        Auth Server         Resource Server         |
|  |                   |                   |                       |
|  | 1. Generate:      |                   |                       |
|  |    code_verifier  |                   |                       |
|  |    (random 43-128 |                   |                       |
|  |     chars)        |                   |                       |
|  |    code_challenge  |                   |                       |
|  |    = SHA256(       |                   |                       |
|  |      code_verifier)|                  |                       |
|  |                   |                   |                       |
|  | 2. Redirect user  |                   |                       |
|  |    /authorize?    |                   |                       |
|  |    code_challenge=|                   |                       |
|  |    &method=S256   |                   |                       |
|  | ----------------->|                   |                       |
|  |                   | 3. User logs in   |                       |
|  |                   |    and consents   |                       |
|  |                   |                   |                       |
|  | 4. Redirect back  |                   |                       |
|  |    ?code=ABC123   |                   |                       |
|  | <-----------------|                   |                       |
|  |                   |                   |                       |
|  | 5. Exchange code: |                   |                       |
|  |    POST /token    |                   |                       |
|  |    code=ABC123    |                   |                       |
|  |    code_verifier= |                   |                       |
|  |    (original)     |                   |                       |
|  | ----------------->|                   |                       |
|  |                   | 6. Server         |                       |
|  |                   |    SHA256(verifier)|                      |
|  |                   |    == challenge?   |                       |
|  |                   |    YES -> issue    |                       |
|  |                   |    tokens         |                       |
|  |                   |                   |                       |
|  | 7. access_token + |                   |                       |
|  |    refresh_token  |                   |                       |
|  | <-----------------|                   |                       |
|  |                   |                   |                       |
|  | 8. API call with  |                   |                       |
|  |    Bearer token   |                   |                       |
|  | -------------------------------------->|                      |
|  |                   |                   | 9. Validate token     |
|  |                   |                   |    Return resource    |
|  | <--------------------------------------|                      |
|                                                                  |
|  WHY PKCE?                                                       |
|  Without PKCE, an attacker who intercepts the authorization code |
|  (e.g., through a malicious browser extension or redirect) can   |
|  exchange it for tokens. With PKCE, the attacker also needs the  |
|  code_verifier, which never leaves the client.                   |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Session Management

### JWT vs Opaque Tokens

```
+------------------------------------------------------------------+
|              TOKEN COMPARISON                                      |
+------------------------------------------------------------------+
|                                                                  |
|  JWT (JSON Web Token)              OPAQUE TOKEN                  |
|  +---------------------------+    +---------------------------+  |
|  | Self-contained:           |    | Random string:            |  |
|  | header.payload.signature  |    | "sess_abc123def456..."    |  |
|  |                           |    |                           |  |
|  | Payload contains:         |    | Requires server lookup:   |  |
|  | - sub (user ID)           |    | Token -> Session Store -> |  |
|  | - exp (expiration)        |    |    User data              |  |
|  | - roles, permissions      |    |                           |  |
|  | - custom claims           |    |                           |  |
|  +---------------------------+    +---------------------------+  |
|                                                                  |
|  TRADE-OFFS:                                                     |
|  +-----------------------+------------------+------------------+ |
|  |                       | JWT              | Opaque           | |
|  +-----------------------+------------------+------------------+ |
|  | Stateless validation  | Yes (no DB hit)  | No (DB required) | |
|  | Revocation            | Hard (need       | Easy (delete     | |
|  |                       | blocklist)       | from store)      | |
|  | Payload size          | Large (1-4KB)    | Small (~32 bytes)| |
|  | Cross-service auth    | Excellent        | Requires shared  | |
|  |                       |                  | session store    | |
|  | Token theft impact    | Valid until       | Revocable        | |
|  |                       | expiration       | immediately      | |
|  +-----------------------+------------------+------------------+ |
|                                                                  |
|  RECOMMENDED PATTERN (2026):                                     |
|  - Short-lived JWT access token (15 minutes)                     |
|  - Opaque refresh token (stored in DB, rotated on use)           |
|  - Access token revocation via short expiry, not blocklists      |
|                                                                  |
+------------------------------------------------------------------+
```

### JWT with Refresh Token Rotation

```typescript
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string; // Links all tokens in a rotation chain
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
}

async function generateTokenPair(
  userId: string,
  roles: ReadonlyArray<string>,
  familyId?: string
): Promise<TokenPair> {
  // Generate access token (JWT)
  const accessToken = await new SignJWT({
    sub: userId,
    roles,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setJti(crypto.randomUUID())
    .sign(JWT_SECRET);

  // Generate refresh token (opaque, stored in DB)
  const refreshToken = crypto.randomBytes(64).toString('base64url');
  const tokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  const family = familyId ?? crypto.randomUUID();

  await db.query(
    `INSERT INTO refresh_tokens
     (id, user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${REFRESH_TOKEN_TTL_DAYS} days')`,
    [crypto.randomUUID(), userId, tokenHash, family]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  };
}

async function rotateRefreshToken(oldRefreshToken: string): Promise<TokenPair> {
  const tokenHash = crypto
    .createHash('sha256')
    .update(oldRefreshToken)
    .digest('hex');

  // Find the token
  const result = await db.query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid refresh token');
  }

  const token: RefreshTokenRecord = result.rows[0];

  // Check if token was already used (REUSE DETECTION)
  if (token.usedAt) {
    // Token reuse detected! This means the token was stolen.
    // Revoke the ENTIRE family to invalidate all tokens in the chain.
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE family_id = $1`,
      [token.familyId]
    );
    throw new Error('Refresh token reuse detected. All sessions revoked.');
  }

  // Check expiration
  if (new Date(token.expiresAt) < new Date()) {
    throw new Error('Refresh token expired');
  }

  // Mark current token as used
  await db.query('UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1', [
    token.id,
  ]);

  // Get user roles for new access token
  const user = await db.query('SELECT roles FROM users WHERE id = $1', [
    token.userId,
  ]);

  // Generate new token pair (same family)
  return generateTokenPair(token.userId, user.rows[0].roles, token.familyId);
}

async function verifyAccessToken(
  token: string
): Promise<JWTPayload & { sub: string; roles: string[] }> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return payload as JWTPayload & { sub: string; roles: string[] };
  } catch (error) {
    throw new Error(`Token verification failed: ${(error as Error).message}`);
  }
}
```

---

## Authorization Models

```
+------------------------------------------------------------------+
|              AUTHORIZATION MODELS COMPARISON                       |
+------------------------------------------------------------------+
|                                                                  |
|  RBAC (Role-Based Access Control)                                |
|  +-----------------------------------------------------------+  |
|  | User -> Role -> Permissions                                |  |
|  | "Alice is an admin, admins can delete users"               |  |
|  | + Simple, well-understood                                  |  |
|  | - Role explosion (admin-east, admin-west, admin-readonly)  |  |
|  | - Cannot express relationships (own resources)             |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  ABAC (Attribute-Based Access Control)                           |
|  +-----------------------------------------------------------+  |
|  | Policy evaluates attributes of user, resource, and context |  |
|  | "If user.department == resource.department AND              |  |
|  |  time.hour >= 9 AND time.hour <= 17 THEN allow"           |  |
|  | + Very flexible, handles complex policies                  |  |
|  | - Complex to implement and audit                           |  |
|  | - Hard to answer "what can user X do?"                     |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  ReBAC (Relationship-Based Access Control)                       |
|  +-----------------------------------------------------------+  |
|  | Access based on relationships between entities              |  |
|  | "Alice can edit doc123 because Alice is a member of        |  |
|  |  team-eng, and team-eng is the owner of doc123"            |  |
|  |                                                           |  |
|  |  User:alice --member--> Team:eng --owner--> Doc:123        |  |
|  |  Therefore: alice CAN edit Doc:123                         |  |
|  |                                                           |  |
|  | + Natural model for sharing (Google Docs, Notion)          |  |
|  | + Handles hierarchies (org -> team -> member)              |  |
|  | - Complex graph traversal at scale                         |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  GOOGLE ZANZIBAR MODEL (used by Google for Docs, Drive, etc.)    |
|  +-----------------------------------------------------------+  |
|  | ReBAC at global scale. Stores relationship tuples:          |  |
|  | (object, relation, user)                                   |  |
|  | "doc:readme#viewer@user:alice"                             |  |
|  | "doc:readme#viewer@group:eng#member"                       |  |
|  |                                                           |  |
|  | Implementations: SpiceDB, OpenFGA (by Auth0/Okta),        |  |
|  |                  Permify, Ory Keto                         |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

### OPA (Open Policy Agent) Example

```rego
# policy.rego -- OPA policy for API authorization

package api.authz

import rego.v1

default allow := false

# Admins can do anything
allow if {
    input.user.roles[_] == "admin"
}

# Users can read their own profile
allow if {
    input.method == "GET"
    input.path == ["users", input.user.id]
}

# Users can update their own profile
allow if {
    input.method == "PUT"
    input.path == ["users", input.user.id]
}

# Managers can read profiles of users in their team
allow if {
    input.method == "GET"
    input.path == ["users", user_id]
    user_id == data.teams[input.user.team_id].members[_]
}

# Rate-limited endpoints require non-exceeded rate limit
allow if {
    input.method == "POST"
    input.path[0] == "api"
    input.rate_limit.remaining > 0
}
```

```typescript
// OPA integration in Express middleware
import { loadPolicy } from '@open-policy-agent/opa-wasm';

let policy: any;

async function initOPA(): Promise<void> {
  const policyWasm = await fs.readFile('./policy.wasm');
  policy = await loadPolicy(policyWasm);
}

function authorize(req: Request, res: Response, next: NextFunction): void {
  const input = {
    user: {
      id: req.user.id,
      roles: req.user.roles,
      team_id: req.user.teamId,
    },
    method: req.method,
    path: req.path.split('/').filter(Boolean),
    rate_limit: {
      remaining: req.rateLimit?.remaining ?? 0,
    },
  };

  const result = policy.evaluate(input);

  if (result?.[0]?.result?.allow) {
    next();
  } else {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to perform this action',
    });
  }
}
```

---

## Auth Providers Comparison (2026)

```
+------------------------------------------------------------------+
|              AUTH PROVIDER COMPARISON                               |
+------------------------------------------------------------------+
|                                                                  |
|  +----------+------+--------+-------+---------+-------+--------+ |
|  | Feature  |Auth0 |Clerk   |Supa-  |Lucia    |better |Descope | |
|  |          |      |        |base   |Auth     |-auth  |        | |
|  +----------+------+--------+-------+---------+-------+--------+ |
|  |Type      |SaaS  |SaaS    |SaaS   |Library  |Library|SaaS    | |
|  |Passkeys  |Yes   |Yes     |Partial|Yes      |Yes    |Yes     | |
|  |Social    |60+   |20+     |15+    |Manual   |20+    |30+     | |
|  |SSO/SAML  |Yes   |Yes     |No     |No       |Plugin |Yes     | |
|  |MFA       |Yes   |Yes     |Yes    |Plugin   |Plugin |Yes     | |
|  |Pricing   |$$$   |$$      |$      |Free     |Free   |$$      | |
|  |Self-host |No    |No      |Yes    |Yes      |Yes    |No      | |
|  |Framework |Any   |React   |Any    |Any      |Any    |Any     | |
|  |           |      |focus   |       |         |       |        | |
|  |Best for  |Enter-|Startup |Full-  |Full     |Full   |Enter-  | |
|  |          |prise |w/React |stack  |control  |control|prise   | |
|  +----------+------+--------+-------+---------+-------+--------+ |
|                                                                  |
|  DECISION GUIDE:                                                 |
|  - Need enterprise SSO/SAML? -> Auth0 or Descope                |
|  - React app, fast iteration? -> Clerk                           |
|  - Using Supabase for DB? -> Supabase Auth                       |
|  - Need full control, no vendor lock? -> better-auth or Lucia   |
|  - Cost-sensitive startup? -> better-auth (free, self-hosted)    |
|                                                                  |
+------------------------------------------------------------------+
```

---

## API Security

### Rate Limiting Algorithms

```
+------------------------------------------------------------------+
|              RATE LIMITING ALGORITHMS                               |
+------------------------------------------------------------------+
|                                                                  |
|  TOKEN BUCKET                                                    |
|  +-----------------------------------------------------------+  |
|  | Bucket has capacity C, refills at rate R tokens/second.    |  |
|  | Each request consumes 1 token. If bucket empty, reject.    |  |
|  |                                                           |  |
|  | [******....]  6/10 tokens remaining                        |  |
|  |   Request -> [*****....]  5 remaining                      |  |
|  |   Refill  -> [******....]  6 remaining (after 1/R sec)     |  |
|  |                                                           |  |
|  | + Allows bursts up to bucket capacity                      |  |
|  | + Simple to implement                                      |  |
|  | Best for: APIs with bursty traffic patterns                |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  SLIDING WINDOW LOG                                              |
|  +-----------------------------------------------------------+  |
|  | Store timestamp of each request. Count requests in the     |  |
|  | last N seconds. If count >= limit, reject.                 |  |
|  |                                                           |  |
|  | Window: [t-60s ... now]                                    |  |
|  | Requests: [t-55, t-40, t-30, t-15, t-5, now]              |  |
|  | Count: 6. Limit: 10. -> ALLOW                             |  |
|  |                                                           |  |
|  | + Precise, no boundary problems                            |  |
|  | - Memory-intensive (store every timestamp)                 |  |
|  | Best for: Strict rate enforcement, low-volume APIs         |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  SLIDING WINDOW COUNTER (hybrid)                                 |
|  +-----------------------------------------------------------+  |
|  | Combine current and previous window counts with weighting. |  |
|  |                                                           |  |
|  | Previous window: 8 requests (count_prev)                   |  |
|  | Current window:  3 requests (count_curr)                   |  |
|  | Window progress: 40% (weight)                              |  |
|  | Effective count: 8 * (1-0.4) + 3 = 7.8                    |  |
|  | Limit: 10 -> ALLOW                                        |  |
|  |                                                           |  |
|  | + Memory-efficient (just two counters per window)          |  |
|  | + Good accuracy with minimal overhead                      |  |
|  | Best for: General purpose, high-volume APIs                |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

```typescript
// Sliding window counter rate limiter with Redis
async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(now / windowSeconds);
  const previousWindow = currentWindow - 1;
  const windowProgress = (now % windowSeconds) / windowSeconds;

  const currentKey = `rate:${key}:${currentWindow}`;
  const previousKey = `rate:${key}:${previousWindow}`;

  // Use pipeline for atomicity
  const results = await redis
    .pipeline()
    .get(previousKey)
    .incr(currentKey)
    .expire(currentKey, windowSeconds * 2)
    .exec();

  const previousCount = parseInt((results?.[0]?.[1] as string) ?? '0', 10);
  const currentCount = (results?.[1]?.[1] as number) ?? 1;

  // Weighted count
  const effectiveCount = previousCount * (1 - windowProgress) + currentCount;

  if (effectiveCount > limit) {
    const retryAfter = Math.ceil(windowSeconds * (1 - windowProgress));
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(limit - effectiveCount)),
  };
}

// Express middleware
function rateLimitMiddleware(limit: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id ?? req.ip ?? 'anonymous';
    const result = await checkRateLimit(key, limit, windowSeconds);

    res.set('X-RateLimit-Limit', limit.toString());
    res.set('X-RateLimit-Remaining', result.remaining.toString());

    if (!result.allowed) {
      res.set('Retry-After', result.retryAfter?.toString() ?? '60');
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}
```

### HMAC Request Signing

```
+------------------------------------------------------------------+
|              HMAC REQUEST SIGNING                                  |
+------------------------------------------------------------------+
|                                                                  |
|  Client constructs a canonical string from the request:          |
|                                                                  |
|  canonical = [                                                   |
|    "POST",                          // Method                    |
|    "/api/v1/orders",                // Path                      |
|    "amount=100&currency=USD",       // Query (sorted)            |
|    "1706000000",                    // Timestamp                 |
|    "abc123",                        // Nonce (prevents replay)   |
|    "sha256:e3b0c44..."              // Body hash                 |
|  ].join("\n")                                                    |
|                                                                  |
|  signature = HMAC-SHA256(secret_key, canonical)                  |
|                                                                  |
|  Headers sent:                                                   |
|  Authorization: HMAC-SHA256 KeyId=client_123,                    |
|                 Signature=base64(signature),                      |
|                 Timestamp=1706000000,                             |
|                 Nonce=abc123                                      |
|                                                                  |
|  Server:                                                         |
|  1. Verify timestamp is within 5 minutes (prevent replay)        |
|  2. Verify nonce has not been used (prevent replay)              |
|  3. Reconstruct canonical string from received request           |
|  4. Compute HMAC with stored secret for KeyId                    |
|  5. Compare signatures (timing-safe comparison!)                 |
|                                                                  |
+------------------------------------------------------------------+
```

```typescript
import crypto from 'crypto';

function signRequest(
  method: string,
  path: string,
  query: Record<string, string>,
  body: string,
  secretKey: string
): { signature: string; timestamp: string; nonce: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Sort query parameters for canonical form
  const sortedQuery = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&');

  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');

  const canonical = [
    method.toUpperCase(),
    path,
    sortedQuery,
    timestamp,
    nonce,
    `sha256:${bodyHash}`,
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(canonical)
    .digest('base64');

  return { signature, timestamp, nonce };
}

function verifySignature(
  req: Request,
  secretKey: string,
  receivedSignature: string,
  timestamp: string,
  nonce: string
): boolean {
  // 1. Check timestamp freshness (5-minute window)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 300) {
    return false;
  }

  // 2. Reconstruct and compute
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body))
    .digest('hex');

  const sortedQuery = Object.keys(req.query)
    .sort()
    .map((k) => `${k}=${req.query[k]}`)
    .join('&');

  const canonical = [
    req.method.toUpperCase(),
    req.path,
    sortedQuery,
    timestamp,
    nonce,
    `sha256:${bodyHash}`,
  ].join('\n');

  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(canonical)
    .digest('base64');

  // 3. Timing-safe comparison (prevents timing attacks)
  return crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(expected)
  );
}
```

---

## Backend Security Checklist (OWASP Top 10 Focus)

```
+------------------------------------------------------------------+
|              OWASP TOP 10 (2025 EDITION) FOR BACKENDS              |
+------------------------------------------------------------------+
|                                                                  |
|  A01: BROKEN ACCESS CONTROL                                     |
|  [x] Verify authorization on every endpoint (not just frontend)  |
|  [x] Deny by default (allowlist, not blocklist)                  |
|  [x] Use CORS restrictively (not Access-Control-Allow-Origin: *)|
|  [x] Disable directory listing on file servers                   |
|  [x] Rate limit authentication endpoints                        |
|                                                                  |
|  A02: CRYPTOGRAPHIC FAILURES                                     |
|  [x] TLS 1.3 for all connections (reject TLS 1.0/1.1)           |
|  [x] Bcrypt/Argon2 for password hashing (NEVER MD5/SHA)         |
|  [x] Rotate encryption keys regularly                            |
|  [x] Do not log sensitive data (tokens, passwords, PII)         |
|                                                                  |
|  A03: INJECTION                                                  |
|  [x] Parameterized queries (NEVER string concatenation for SQL)  |
|  [x] Input validation with strict schemas (Zod)                 |
|  [x] Content-Type validation on all endpoints                   |
|  [x] Escape output for XSS prevention                           |
|                                                                  |
|  A04: INSECURE DESIGN                                            |
|  [x] Threat modeling during design phase                         |
|  [x] Rate limiting on business-critical flows                    |
|  [x] Account lockout after failed attempts                      |
|                                                                  |
|  A05: SECURITY MISCONFIGURATION                                 |
|  [x] Disable debug endpoints in production                      |
|  [x] Remove default credentials                                 |
|  [x] Security headers (CSP, X-Frame-Options, HSTS)              |
|  [x] Minimal permissions (principle of least privilege)          |
|                                                                  |
|  A06: VULNERABLE COMPONENTS                                     |
|  [x] Automated dependency scanning (Snyk, Socket, Dependabot)   |
|  [x] Lock file committed and reviewed                           |
|  [x] Supply chain attack protection (lockfile-lint, Socket.dev) |
|                                                                  |
+------------------------------------------------------------------+
```

### CORS Deep Dive

```typescript
import cors from 'cors';

// WRONG: Overly permissive
// app.use(cors()); // Allows ALL origins!

// CORRECT: Restrictive CORS configuration
const allowedOrigins = ['https://app.example.com', 'https://admin.example.com'];

if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000');
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true, // Allow cookies (requires specific origin, not *)
  maxAge: 86400, // Cache preflight for 24 hours
};
```

---

## Secrets Management

```
+------------------------------------------------------------------+
|              SECRETS MANAGEMENT HIERARCHY                          |
+------------------------------------------------------------------+
|                                                                  |
|  WORST (never do)                                                |
|  +-----------------------------------------------------------+  |
|  | Hardcoded in source code: const KEY = "sk-proj-..."        |  |
|  | Committed .env files: .env with secrets in git             |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  BETTER (acceptable for development)                             |
|  +-----------------------------------------------------------+  |
|  | .env files (gitignored) loaded by dotenv                   |  |
|  | Environment variables set in deployment platform           |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  GOOD (production minimum)                                       |
|  +-----------------------------------------------------------+  |
|  | Cloud secret managers: AWS Secrets Manager, GCP Secret     |  |
|  | Manager, Azure Key Vault                                   |  |
|  | - Automatic rotation                                       |  |
|  | - Audit logging                                            |  |
|  | - IAM-based access control                                 |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  BEST (enterprise / high security)                               |
|  +-----------------------------------------------------------+  |
|  | HashiCorp Vault:                                           |  |
|  | - Dynamic secrets (generate on demand, auto-expire)        |  |
|  | - Database credential rotation (Vault generates new        |  |
|  |   DB passwords automatically)                              |  |
|  | - PKI certificate management                               |  |
|  | - Transit secrets engine (encryption as a service)         |  |
|  | - Audit log for every secret access                        |  |
|  |                                                           |  |
|  | Infisical (modern alternative):                            |  |
|  | - Developer-friendly UI                                    |  |
|  | - Native K8s operator                                      |  |
|  | - Client SDKs for all languages                            |  |
|  | - Secret rotation and versioning                           |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  KUBERNETES-SPECIFIC:                                            |
|  - Sealed Secrets: encrypt secrets client-side, safe to commit  |
|  - External Secrets Operator: sync from Vault/AWS/GCP to K8s   |
|  - SOPS: encrypt files with KMS keys, decrypt at deploy time    |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Zero Trust Architecture

```
+------------------------------------------------------------------+
|              ZERO TRUST ARCHITECTURE                               |
+------------------------------------------------------------------+
|                                                                  |
|  TRADITIONAL (Perimeter-based):                                  |
|  +-----------------------------------------------------------+  |
|  |  Internet  |  Firewall  |  Internal Network (TRUSTED)      |  |
|  |  (untrust) |            |  Everything talks to everything  |  |
|  +-----------------------------------------------------------+  |
|  Problem: Once inside the firewall, attacker has free reign.     |
|                                                                  |
|  ZERO TRUST (Never trust, always verify):                        |
|  +-----------------------------------------------------------+  |
|  |  EVERY request is authenticated and authorized, regardless |  |
|  |  of network location.                                      |  |
|  |                                                           |  |
|  |  Service A --mTLS--> Service B --mTLS--> Service C        |  |
|  |       |                    |                   |           |  |
|  |       v                    v                   v           |  |
|  |  Identity verified    Identity verified    Identity        |  |
|  |  Policy evaluated     Policy evaluated     verified        |  |
|  |  Request logged       Request logged       Policy eval     |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  KEY PRINCIPLES:                                                 |
|  1. Verify explicitly: authenticate every request                |
|  2. Least privilege: minimal permissions, just-in-time access   |
|  3. Assume breach: encrypt everything, log everything,           |
|     segment networks, minimize blast radius                      |
|                                                                  |
|  IMPLEMENTATION WITH SERVICE MESH (Istio):                       |
|  +-----------------------------------------------------------+  |
|  | Sidecar proxy (Envoy) intercepts all traffic:              |  |
|  |                                                           |  |
|  | +--------+  +-------+       +-------+  +--------+        |  |
|  | |Service |->|Envoy  |--mTLS-->|Envoy |->|Service |        |  |
|  | |  A     |  |Proxy A|       |Proxy B|  |  B     |        |  |
|  | +--------+  +-------+       +-------+  +--------+        |  |
|  |                                                           |  |
|  | Envoy handles: TLS termination, certificate rotation,      |  |
|  | authorization policies, observability, retries             |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  SPIFFE/SPIRE:                                                   |
|  +-----------------------------------------------------------+  |
|  | Platform-agnostic identity framework for workloads.        |  |
|  | SPIFFE ID: spiffe://example.com/service/order-service      |  |
|  | SPIRE: server that issues and rotates X.509 SVIDs          |  |
|  | (Short-lived identity documents for each workload)         |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Interview Q&As

### Q1: Explain the OAuth 2.1 authorization code flow with PKCE. Why was the implicit flow removed?

**Answer**: The authorization code flow with PKCE works in three phases:

**Phase 1 - Authorization**: The client generates a random code_verifier (43-128 characters) and computes code_challenge = SHA256(code_verifier). It redirects the user to the authorization server with the code_challenge. The user authenticates and consents. The server redirects back with an authorization code.

**Phase 2 - Token Exchange**: The client sends the authorization code AND the original code_verifier to the token endpoint. The server computes SHA256(code_verifier) and compares it to the stored code_challenge. If they match, it issues tokens. This proves the same client that initiated the flow is exchanging the code.

**Phase 3 - API Access**: The client uses the access token in API requests. When it expires, the client uses the refresh token to get a new access token.

**Why implicit flow was removed**: The implicit flow returned tokens directly in the URL fragment (`#access_token=...`). This had several critical problems: (1) tokens in URLs are logged by browsers, proxies, and web servers; (2) tokens in URLs are vulnerable to cross-site request forgery; (3) there is no mechanism to verify that the token was received by the intended client (no client authentication); (4) tokens cannot be refreshed, so they were issued with long lifetimes, increasing the window for theft.

PKCE was originally designed for mobile apps (which cannot keep a client_secret confidential) but OAuth 2.1 mandates it for ALL clients, including server-side apps. This provides defense-in-depth: even if an authorization code is intercepted, it cannot be exchanged without the code_verifier.

### Q2: How would you implement session revocation at scale with JWTs?

**Answer**: This is a classic trade-off question. JWTs are stateless (no server lookup needed), but that same property makes them hard to revoke. There are several strategies, each with different trade-offs:

**Strategy 1: Short-lived tokens (recommended)**. Use very short access token lifetimes (5-15 minutes). Revocation happens naturally when the token expires. Combine with refresh token rotation: when a user logs out or is banned, revoke their refresh token. They cannot get a new access token. The maximum window of unauthorized access equals the access token lifetime. This is the standard approach and works for 90% of use cases.

**Strategy 2: Token blocklist**. Maintain a Redis set of revoked token JTIs (JWT ID). On every request, check if the token's JTI is in the blocklist. Set Redis TTL to match the token's remaining lifetime (no point blocklisting expired tokens). This adds a Redis lookup to every request but enables immediate revocation. Use this when you need to revoke within seconds (e.g., user account compromise).

**Strategy 3: Token versioning**. Store a version counter per user in Redis (`user:123:token_version = 5`). Include the version in the JWT claims. On each request, compare the JWT's version with the stored version. To revoke all tokens for a user, increment their version. This is a single fast Redis lookup and handles mass revocation efficiently.

**Strategy 4: Refresh token family revocation**. Group refresh tokens by "family" (the original login session). When token reuse is detected (same refresh token used twice), revoke the entire family. This detects token theft: the attacker uses the stolen refresh token, the legitimate client also uses it, and the reuse is detected.

In practice, I combine Strategy 1 (short-lived access tokens) with Strategy 4 (refresh token family revocation). For high-security scenarios (admin panels, financial systems), I add Strategy 2 (blocklist) for immediate revocation capability.

### Q3: Compare RBAC, ABAC, and ReBAC. When would you choose each?

**Answer**: Each model adds expressiveness at the cost of complexity.

**RBAC** assigns users to roles, and roles have permissions. It is simple, well-understood, and sufficient for most applications. Choose RBAC when: your access control can be expressed as "users with role X can do Y," you have a manageable number of roles (< 50), and you do not need to express ownership or relationships. Example: an admin dashboard where admins, editors, and viewers have different capabilities.

**ABAC** evaluates policies against attributes of the user, the resource, the action, and the context. Choose ABAC when: access depends on dynamic attributes (time of day, user department, resource classification level), you need complex policies that RBAC roles cannot express, or you are in a regulated industry where policies are defined by external rules. Example: a healthcare system where "doctors can access patient records in their department during business hours."

**ReBAC** models access as a graph of relationships between entities. Choose ReBAC when: your domain naturally involves sharing and collaboration (documents, projects, teams), you need to express hierarchies (organization -> team -> member inherits access), or when the question "who can access this resource?" requires traversing relationships. Example: Google Docs-style sharing where users, groups, and organizations can be granted viewer/editor/owner roles on documents, and access is inherited through group membership.

**The practical choice for most startups in 2026**: Start with RBAC. When you hit the "role explosion" problem (creating roles like admin-east-readonly, editor-team-a-write), evaluate whether you need ABAC (complex policies) or ReBAC (relationship-based sharing). Many teams use RBAC for global permissions (admin, user) combined with ReBAC for resource-level sharing (who can access this specific document).

For ReBAC at scale, use a purpose-built system (SpiceDB, OpenFGA) rather than building your own. The graph traversal and caching required for sub-millisecond authorization decisions at scale is non-trivial.

### Q4: What is DPoP and why is it important?

**Answer**: DPoP (Demonstrating Proof of Possession) is an OAuth extension that binds access tokens to the client that requested them, preventing token theft and replay attacks.

**The problem**: Standard Bearer tokens (including JWTs) are "bearer" tokens -- anyone who has the token can use it. If an attacker steals a token from a log file, network trace, or compromised proxy, they can use it from any device.

**How DPoP works**: The client generates a public/private key pair. When requesting a token, the client includes a DPoP proof (a JWT signed with its private key that includes the HTTP method, URL, and a timestamp). The authorization server binds the issued access token to the client's public key. When the client calls an API, it includes both the access token and a fresh DPoP proof. The resource server verifies that the DPoP proof's public key matches the one bound to the access token.

**Why it matters**: Even if an attacker steals the access token, they cannot use it because they do not have the client's private key to generate valid DPoP proofs. The token is useless without the corresponding private key.

**Trade-offs**: DPoP adds complexity (key generation, proof creation on every request) and requires all resource servers to support DPoP verification. It is most valuable in high-security scenarios (financial APIs, government systems) and is increasingly required by open banking standards.

### Q5: How do you prevent SSRF (Server-Side Request Forgery) in a backend application?

**Answer**: SSRF occurs when an attacker tricks your server into making requests to unintended destinations -- typically internal services, cloud metadata endpoints, or other resources that are only accessible from the server's network.

**Common attack vector**: A feature like "fetch URL preview" or "import from URL" where the user provides a URL and the server fetches it. The attacker provides `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata endpoint) and gets your server's IAM credentials.

**Defense layers:**

**Layer 1 - URL validation**: Parse the URL and validate the scheme (only allow `https://`), hostname (blocklist internal ranges and metadata IPs), and port (only allow 80/443). Resolve the hostname to an IP and check the IP against blocklists BEFORE making the request (prevents DNS rebinding attacks where the hostname resolves to an internal IP).

**Layer 2 - Network segmentation**: Run URL-fetching functionality in an isolated network (separate subnet or serverless function) that cannot reach internal services or cloud metadata endpoints. This is defense-in-depth: even if URL validation is bypassed, the fetcher cannot reach sensitive resources.

**Layer 3 - Cloud-specific protections**: On AWS, use IMDSv2 (requires a PUT request with a hop limit of 1, making it harder to exploit via SSRF). On GCP, use Workload Identity instead of metadata-based credentials. In Kubernetes, disable the metadata endpoint for pods that do not need it.

**Layer 4 - Request constraints**: Set timeouts (5 seconds max), follow a limited number of redirects (3 max), and do not follow redirects to internal IP ranges. Limit response size to prevent denial of service.

The key insight is that SSRF defense requires multiple layers because URL validation alone can be bypassed through DNS rebinding, IPv6 addresses, URL parser inconsistencies, and redirect chains. Network segmentation is the most robust defense.

---

## Key Takeaways

1. **Passkeys are the future of authentication.** They eliminate phishing, credential stuffing, and password reuse. Every new application in 2026 should support passkeys as a primary authentication method.
2. **OAuth 2.1 simplifies the protocol.** PKCE is mandatory, implicit flow is dead, and refresh tokens must be rotated or sender-constrained. Do not implement OAuth 2.0 patterns that 2.1 explicitly deprecated.
3. **Short-lived JWTs + rotated refresh tokens is the standard session strategy.** This gives you the stateless benefits of JWTs with the revocation capability of opaque tokens.
4. **Authorization model choice depends on domain complexity.** RBAC for simple apps, ReBAC for collaborative features, ABAC for policy-heavy regulated domains. Start simple and evolve.
5. **Rate limiting is security, not just performance.** Use sliding window counters for general APIs, token bucket for bursty workloads. Always rate-limit authentication endpoints aggressively.
6. **Defense in depth is non-negotiable.** No single security measure is sufficient. Layer input validation, authentication, authorization, encryption, monitoring, and network segmentation. Assume every layer will be bypassed and design accordingly.
7. **Secrets management maturity matters.** Moving from .env files to a proper secrets manager (Vault, AWS Secrets Manager) with rotation and audit logging is a sign of engineering maturity that interviewers look for.
