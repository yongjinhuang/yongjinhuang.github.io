# Full-Stack Security

## Overview

Security is not a feature you bolt on at the end -- it is a property of every line of code you write. In full-stack interviews, security questions test whether you understand the threats that affect web applications and can write code that defends against them. The OWASP Top 10 provides the vocabulary, but interviewers want to see that you can apply these concepts across the entire stack: validating input on the server, encoding output on the client, managing secrets properly, configuring security headers, and thinking adversarially about your own code.

This guide covers the OWASP Top 10, injection attacks, authentication and authorization vulnerabilities, XSS, CSRF, SSRF, input validation, secrets management, HTTPS/TLS, CORS, CSP, rate limiting, dependency security, and security headers.

---

## Core Concepts

### 1. The OWASP Top 10 (2021)

The Open Web Application Security Project (OWASP) maintains a list of the most critical web application security risks, updated every few years. Here are the categories most relevant to full-stack developers:

| # | Category | Description |
|---|----------|-------------|
| A01 | Broken Access Control | Users can act outside their intended permissions |
| A02 | Cryptographic Failures | Sensitive data exposed due to weak or missing encryption |
| A03 | Injection | Untrusted data sent to an interpreter as part of a command or query |
| A04 | Insecure Design | Flaws in architecture that no amount of implementation fixes can address |
| A05 | Security Misconfiguration | Default configs, open cloud storage, verbose error messages |
| A06 | Vulnerable Components | Using libraries with known vulnerabilities |
| A07 | Identification & Auth Failures | Weak passwords, missing MFA, session fixation |
| A08 | Software & Data Integrity Failures | CI/CD pipeline tampering, unsigned updates |
| A09 | Security Logging & Monitoring Failures | Breaches go undetected due to inadequate logging |
| A10 | Server-Side Request Forgery (SSRF) | Server is tricked into making requests to unintended destinations |

### 2. Injection Attacks

Injection happens when untrusted data is sent to an interpreter (SQL, NoSQL, OS command, LDAP) as part of a command. The most common form is SQL injection.

**How SQL Injection Works:**

```sql
-- Vulnerable query (string concatenation)
SELECT * FROM users WHERE email = '${userInput}' AND password = '${passwordInput}'

-- Attacker enters email: ' OR '1'='1' --
-- Resulting query:
SELECT * FROM users WHERE email = '' OR '1'='1' --' AND password = ''
-- This returns ALL users because '1'='1' is always true
```

**Prevention: Parameterized Queries (Prepared Statements)**

The database driver separates the SQL structure from the data, making it impossible for user input to alter the query structure.

```typescript
// VULNERABLE: String concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`;

// SAFE: Parameterized query (node-postgres)
const query = 'SELECT * FROM users WHERE email = $1';
const result = await pool.query(query, [email]);

// SAFE: ORM (Prisma)
const user = await prisma.user.findUnique({ where: { email } });

// SAFE: Query builder (Knex)
const user = await knex('users').where({ email }).first();
```

**Other injection types:**

- **NoSQL injection:** Passing objects where strings are expected (`{ "$gt": "" }`)
- **Command injection:** Passing shell metacharacters to `exec()` or `spawn()`
- **LDAP injection:** Manipulating LDAP queries via unsanitized input

### 3. Cross-Site Scripting (XSS)

XSS occurs when an attacker injects malicious scripts into content that other users view. The browser executes the script because it trusts the origin.

**Three types:**

| Type | How It Works | Example |
|------|-------------|---------|
| **Stored XSS** | Malicious script saved to database, served to all users | Comment containing `<script>` tag |
| **Reflected XSS** | Script in URL parameters reflected back in the response | Search query shown on results page |
| **DOM-based XSS** | Client-side JavaScript writes untrusted data to the DOM | `innerHTML = location.hash` |

**Prevention:**

1. **Output encoding:** Encode data when rendering into HTML. React does this automatically for JSX expressions.
2. **Content Security Policy (CSP):** Restrict which scripts can execute.
3. **Avoid `dangerouslySetInnerHTML`:** If you must render HTML, sanitize it first with a library like DOMPurify.
4. **HttpOnly cookies:** Prevent JavaScript from accessing session cookies.

```typescript
// React: Safe by default (auto-escapes)
function Comment({ text }: { text: string }) {
  return <p>{text}</p>; // Safe: React escapes the text
}

// React: Dangerous -- only use with sanitized content
import DOMPurify from 'dompurify';

function RichComment({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href'],
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### 4. Cross-Site Request Forgery (CSRF)

CSRF tricks an authenticated user's browser into making unwanted requests to a site where they are already logged in.

**How it works:**

1. User logs into bank.com and gets a session cookie
2. User visits evil.com, which contains: `<img src="https://bank.com/transfer?to=attacker&amount=10000">`
3. Browser sends the request to bank.com with the user's session cookie
4. Bank.com processes the transfer because the cookie is valid

**Prevention:**

- **CSRF tokens:** Server generates a unique token per session/form. The token is included in the form and verified on submission. Cookies alone cannot carry it.
- **SameSite cookies:** Set `SameSite=Strict` or `SameSite=Lax` on session cookies. The browser will not send the cookie on cross-origin requests.
- **Check Origin/Referer headers:** Verify that requests originate from your own domain.

```typescript
// Express CSRF protection
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: 'strict' } });

app.get('/form', csrfProtection, (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

app.post('/transfer', csrfProtection, (req, res) => {
  // CSRF token is automatically validated by the middleware
  processTransfer(req.body);
});
```

### 5. Server-Side Request Forgery (SSRF)

SSRF occurs when an attacker can make the server issue requests to unintended destinations, typically internal services or metadata endpoints.

**Classic attack:** Cloud metadata endpoint

```
// User provides a URL for the server to fetch (e.g., webhook URL, avatar URL)
POST /api/fetch-url
{ "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/" }

// Server fetches the URL and returns AWS credentials
```

**Prevention:**

- Validate and allowlist URLs (only permit specific schemes and domains)
- Block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
- Use a dedicated egress proxy for outbound requests
- Do not expose raw responses from fetched URLs

```typescript
import { URL } from 'node:url';
import ipaddr from 'ipaddr.js';
import dns from 'node:dns/promises';

async function validateUrl(input: string): Promise<URL> {
  const url = new URL(input);

  // Only allow HTTP(S)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS protocols are allowed');
  }

  // Resolve hostname to IP and check for private ranges
  const addresses = await dns.resolve4(url.hostname);
  for (const addr of addresses) {
    const parsed = ipaddr.parse(addr);
    const range = parsed.range();
    if (range !== 'unicast') {
      throw new Error(`Resolved to non-public IP range: ${range}`);
    }
  }

  return url;
}
```

### 6. Input Validation

Validate all user input on the server. Client-side validation is for UX; server-side validation is for security.

**Principles:**

- **Allowlist over denylist:** Define what is valid, not what is invalid.
- **Validate type, length, range, and format.**
- **Use a validation library** (Zod, Joi, class-validator) instead of writing regex by hand.

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(13).max(150),
  role: z.enum(['user', 'admin']),
  bio: z.string().max(1000).optional(),
});

// In your route handler
app.post('/api/users', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const user = await createUser(parsed.data);
  return res.status(201).json({ data: user });
});
```

### 7. Secrets Management

Never hardcode secrets. Never commit them to version control.

**Hierarchy of approaches:**

| Approach | When to Use | Example |
|----------|-------------|---------|
| Environment variables | Simple apps, local dev | `process.env.DATABASE_URL` |
| `.env` files (not committed) | Local development | `.env` in `.gitignore` |
| CI/CD secrets | Build-time secrets | GitHub Actions secrets, GitLab CI variables |
| Secret managers | Production | AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager |
| Sealed secrets | Kubernetes | Bitnami Sealed Secrets |

```typescript
// config.ts -- Validate all required secrets at startup
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  SENTRY_DSN: z.string().url().optional(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return parsed.data;
}

export const config = loadConfig();
```

### 8. HTTPS and TLS

All production traffic must use HTTPS. TLS encrypts data in transit, prevents eavesdropping, and authenticates the server's identity via certificates.

**Key configurations:**

- Redirect all HTTP to HTTPS (301 redirect)
- Use HSTS (HTTP Strict Transport Security) to prevent downgrade attacks
- Use TLS 1.2 or 1.3 (disable older versions)
- Renew certificates automatically (Let's Encrypt, AWS ACM)

### 9. CORS (Cross-Origin Resource Sharing)

CORS controls which origins can make requests to your API from a browser.

```typescript
import cors from 'cors';

// WRONG: Allow all origins
app.use(cors());

// CORRECT: Explicit allowlist
app.use(cors({
  origin: ['https://myapp.com', 'https://staging.myapp.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24 hours
}));
```

### 10. Content Security Policy (CSP)

CSP tells the browser which resources are allowed to load, providing a strong defense against XSS.

```typescript
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'nonce-{NONCE}'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.myapp.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://api.myapp.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
});
```

### 11. Rate Limiting

Rate limiting protects against brute-force attacks, DoS, and abuse.

```typescript
import rateLimit from 'express-rate-limit';

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Only count failed attempts
  message: { error: 'Too many login attempts, please try again later' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

### 12. Security Headers

A set of HTTP response headers that instruct the browser to enable security features.

```typescript
import helmet from 'helmet';

// helmet sets multiple security headers at once
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

**Key headers explained:**

| Header | Purpose |
|--------|---------|
| `Strict-Transport-Security` | Force HTTPS for all future requests |
| `X-Content-Type-Options: nosniff` | Prevent MIME type sniffing |
| `X-Frame-Options: DENY` | Prevent clickjacking via iframes |
| `Referrer-Policy` | Control how much referrer info is sent |
| `Content-Security-Policy` | Restrict resource loading |
| `Permissions-Policy` | Control browser feature access (camera, mic, geolocation) |

### 13. Dependency Vulnerabilities

Your application is only as secure as its weakest dependency.

**Tools:**

- `npm audit` / `yarn audit` -- Check for known vulnerabilities
- `Dependabot` (GitHub) -- Automated PRs for vulnerable dependencies
- `Snyk` -- Deeper analysis, container scanning, license compliance
- `Socket` -- Supply chain attack detection

**Process:**

1. Run `npm audit` in CI -- fail the build on high/critical vulnerabilities
2. Enable Dependabot for automated security updates
3. Pin major versions to avoid unreviewed breaking changes
4. Review new dependencies before adding them (check maintainer count, download trends, last update date)

---

## Practical Scenarios

### Scenario 1: Securing an Authentication System

**Requirements:** Email/password login, session management, password reset.

**Security measures:**

1. **Password storage:** Hash with bcrypt (cost factor 12+) or Argon2. Never store plaintext.
2. **Login:** Rate limit login attempts (5 per 15 minutes per IP + email combination). Return generic error messages ("Invalid email or password") to prevent user enumeration.
3. **Sessions:** Use HttpOnly, Secure, SameSite=Strict cookies. Set reasonable expiry. Regenerate session ID after login.
4. **Password reset:** Use a time-limited, single-use token. Send to the email on file. Do not reveal whether the email exists.
5. **MFA:** Implement TOTP (Google Authenticator) as a second factor for sensitive accounts.

```typescript
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const SALT_ROUNDS = 12;

async function registerUser(email: string, password: string) {
  // Validate password strength
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return db.users.create({
    email: email.toLowerCase().trim(),
    passwordHash,
  });
}

async function loginUser(email: string, password: string) {
  const user = await db.users.findByEmail(email.toLowerCase().trim());

  // Always hash even if user not found (prevent timing attacks)
  if (!user) {
    await bcrypt.hash(password, SALT_ROUNDS);
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  return user;
}

function createSession(res, userId: string) {
  const sessionId = randomBytes(32).toString('hex');
  res.cookie('session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });
  return sessionStore.set(sessionId, { userId, createdAt: Date.now() });
}
```

### Scenario 2: Handling User-Generated Content

**Situation:** Users can post comments with rich text formatting.

**Threats:** Stored XSS, malicious links, content injection.

**Solution:**

1. Accept markdown input (not raw HTML)
2. Render markdown to HTML server-side with a strict sanitizer
3. Apply CSP to prevent inline scripts
4. Validate URLs in links (no `javascript:` schemes)

```typescript
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

function renderComment(markdownInput: string): string {
  // Convert markdown to HTML
  const rawHtml = marked.parse(markdownInput);

  // Sanitize the HTML
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });

  // Ensure all links open in new tab with noopener
  return cleanHtml.replace(
    /<a /g,
    '<a target="_blank" rel="noopener noreferrer" '
  );
}
```

### Scenario 3: Protecting an Internal Admin API

**Situation:** Admin endpoints must only be accessible to authorized users.

**Security layers:**

1. **Authentication:** Verify the user is logged in (valid session/JWT)
2. **Authorization:** Verify the user has the admin role
3. **Network:** Admin API on a separate subdomain or path prefix behind additional access controls
4. **Audit logging:** Log every admin action with who, what, when, and from where
5. **Rate limiting:** Strict rate limits even for authenticated admin users

```typescript
// middleware/auth.ts
function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = session.user;
  next();
}

function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      // Log the unauthorized access attempt
      auditLogger.warn({
        event: 'unauthorized_access_attempt',
        userId: req.user.id,
        requiredRoles: roles,
        actualRole: req.user.role,
        path: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage
app.delete('/api/admin/users/:id',
  requireAuth,
  requireRole('admin', 'super_admin'),
  auditLog('user.delete'),
  deleteUserHandler
);
```

### Scenario 4: API Key Security

**Situation:** Your API is consumed by third-party developers using API keys.

**Best practices:**

1. Generate cryptographically random keys (at least 32 bytes)
2. Store only the hash of the key (like a password)
3. Show the full key only once at creation time
4. Support key rotation (multiple active keys per account)
5. Scope keys with permissions (read-only, write, admin)
6. Log all API key usage for audit

```typescript
import { randomBytes, createHash } from 'node:crypto';

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `sk_live_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12); // For identification without exposing the full key

  return { key, hash, prefix };
}

async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  const hash = createHash('sha256').update(key).digest('hex');
  const record = await db.apiKeys.findByHash(hash);

  if (!record || record.revokedAt) {
    return null;
  }

  // Update last used timestamp (non-blocking)
  db.apiKeys.updateLastUsed(record.id).catch(() => {});

  return record;
}
```

---

## Interview Questions

### Question 1: What is the difference between authentication and authorization? How do you implement both?

**Answer:**

**Authentication** verifies *who you are* (identity). **Authorization** verifies *what you can do* (permissions).

Authentication answers: "Is this user who they claim to be?"
Authorization answers: "Is this user allowed to perform this action?"

**Implementation:**

Authentication typically happens first -- via session cookies, JWTs, or OAuth tokens. The server verifies the credential and establishes the user's identity.

Authorization happens after authentication. Common patterns:

- **Role-Based Access Control (RBAC):** Users are assigned roles (admin, editor, viewer). Roles have permissions.
- **Attribute-Based Access Control (ABAC):** Access decisions based on attributes of the user, resource, and environment.
- **Permission-based:** Fine-grained permissions checked per action (e.g., `users:delete`, `posts:edit`).

A common mistake is checking authorization only on the frontend (hiding UI elements) without enforcing it on the backend. Authorization must always be enforced server-side.

### Question 2: Explain XSS and how React helps prevent it.

**Answer:**

Cross-Site Scripting (XSS) is when an attacker injects executable scripts into a web page viewed by other users. The browser runs the script because it trusts the page's origin.

React prevents XSS by default because JSX expressions are automatically escaped before rendering. When you write `{userInput}` in JSX, React converts special characters (like `<`, `>`, `&`, `"`) to their HTML entity equivalents, so they render as text rather than HTML.

React's protection breaks down in two cases:

1. **`dangerouslySetInnerHTML`:** This bypasses escaping entirely. If you must use it, sanitize the HTML with DOMPurify first.
2. **`href` attributes with `javascript:` URLs:** React does not block `<a href="javascript:alert('xss')">`. You must validate URLs yourself.

Additional layers of defense:
- Content Security Policy to prevent inline script execution
- HttpOnly cookies to prevent session theft even if XSS occurs
- Input validation on the server to reject obvious attack payloads

### Question 3: How do you prevent SQL injection?

**Answer:**

SQL injection is prevented by **never concatenating user input into SQL strings**. Use parameterized queries (prepared statements) instead.

With parameterized queries, the database driver sends the SQL structure and the data separately. The database compiles the SQL first, then binds the data values. User input can never alter the query structure.

Every major database driver and ORM supports parameterized queries:

- **Raw SQL:** Use placeholders (`$1`, `?`, `:name`) and pass values as a separate array
- **ORMs (Prisma, Sequelize, TypeORM):** Parameterize automatically
- **Query builders (Knex):** Parameterize by default when using the fluent API

Additional defenses:
- Use the principle of least privilege for database users (read-only connections where possible)
- Validate input types and lengths before they reach the query
- Use stored procedures for complex operations

### Question 4: What is CSRF and how do modern apps defend against it?

**Answer:**

CSRF (Cross-Site Request Forgery) exploits the fact that browsers automatically attach cookies to requests. An attacker on `evil.com` can trigger a request to `bank.com`, and the browser will include the user's `bank.com` session cookie.

**Modern defenses:**

1. **SameSite cookies (most effective, simplest):** Setting `SameSite=Lax` (default in modern browsers) prevents the cookie from being sent on cross-origin POST requests. `SameSite=Strict` blocks it on all cross-origin requests including navigation.

2. **CSRF tokens:** The server generates a random token per session and embeds it in forms. On submission, the server verifies the token matches. An attacker cannot read the token from a different origin (same-origin policy).

3. **Checking Origin/Referer headers:** The server verifies that the request came from its own origin.

For SPAs using JWT in `Authorization` headers (not cookies), CSRF is not a concern because the token is not automatically attached by the browser. However, if the JWT is stored in a cookie, CSRF protection is still needed.

### Question 5: How do you manage secrets in a production environment?

**Answer:**

Secrets (API keys, database passwords, encryption keys) should never be in source code or version control.

**Production approach:**

1. **Store secrets in a dedicated secret manager** (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager). These provide encryption at rest, access control, audit logging, and automatic rotation.

2. **Inject secrets as environment variables** at deployment time. The application reads them from the environment, never from files in the repository.

3. **Validate at startup.** If a required secret is missing, the application should fail fast with a clear error message rather than failing later with a cryptic error.

4. **Rotate regularly.** Design the system to support rotation without downtime (e.g., accept both old and new API keys during a transition period).

5. **Principle of least privilege.** Each service should only have access to the secrets it needs.

**What to do if a secret is leaked:**
1. Rotate the secret immediately
2. Audit access logs for the compromised credential
3. If it was committed to Git, the secret is in the history even if you delete it from the latest commit. Rotate and use `git filter-branch` or BFG Repo-Cleaner to remove it from history.

### Question 6: Explain Content Security Policy (CSP) and how you would implement it.

**Answer:**

CSP is an HTTP response header that tells the browser which sources of content are trusted. It is one of the strongest defenses against XSS because even if an attacker injects a script tag, the browser will refuse to execute it if the source is not in the CSP allowlist.

**Key directives:**

- `default-src`: Fallback for all resource types
- `script-src`: Where JavaScript can be loaded from
- `style-src`: Where CSS can be loaded from
- `img-src`: Where images can be loaded from
- `connect-src`: Where fetch/XHR/WebSocket can connect to
- `frame-ancestors`: Who can embed this page in an iframe (replaces X-Frame-Options)

**Implementation strategy:**

1. Start in report-only mode (`Content-Security-Policy-Report-Only`) to see what would be blocked without breaking anything.
2. Collect violation reports via a reporting endpoint.
3. Fix violations (remove inline scripts, move them to external files, use nonces).
4. Switch to enforcement mode.
5. Iterate: tighten the policy over time.

The hardest part is eliminating inline scripts and styles. Use nonces (`'nonce-{random}'`) for inline scripts that cannot be externalized.

### Question 7: How do you handle security in a CI/CD pipeline?

**Answer:**

Security in CI/CD prevents vulnerabilities from reaching production:

1. **Dependency scanning:** Run `npm audit` or Snyk on every PR. Fail the build on high/critical vulnerabilities.
2. **Static analysis (SAST):** Tools like Semgrep or CodeQL scan code for security patterns (hardcoded secrets, SQL injection, XSS).
3. **Secret scanning:** GitHub secret scanning or tools like truffleHog detect accidentally committed secrets.
4. **Container scanning:** If using Docker, scan images for OS-level vulnerabilities (Trivy, Snyk Container).
5. **License compliance:** Ensure dependencies have compatible licenses.
6. **Branch protection:** Require PR reviews, passing checks, and signed commits.
7. **Least privilege for CI:** CI runners should have minimal permissions. Do not give CI admin access to production.

```yaml
# GitHub Actions security checks
name: Security
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm audit --audit-level=high

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: p/owasp-top-ten

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified
```

### Question 8: What is SSRF and how do you prevent it?

**Answer:**

Server-Side Request Forgery (SSRF) happens when an attacker can control a URL that the server fetches. The server becomes a proxy for the attacker, who can use it to access internal services, cloud metadata endpoints, or private networks.

**Common attack vectors:**

- Webhook URLs: User provides a URL for the server to call when events occur
- Image/file fetching: User provides a URL for the server to download
- URL previews: Server fetches a URL to generate a link preview

**Prevention:**

1. **Validate and allowlist URLs:** Only permit specific schemes (https) and domains.
2. **Block private IP ranges:** After DNS resolution, verify the IP is not in a private range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16).
3. **Block DNS rebinding:** Resolve the hostname, validate the IP, then make the request to the IP (not the hostname).
4. **Use a dedicated egress proxy:** Route all outbound requests through a proxy that enforces access policies.
5. **Network-level controls:** AWS IMDSv2 requires a token for metadata access, mitigating the most common cloud SSRF attack.

---

## Code Examples

### Example 1: Complete Security Middleware Stack

```typescript
// security.ts -- Apply all security middleware
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';

export function applySecurityMiddleware(app: Express) {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://cdn.example.com'],
        connectSrc: ["'self'", 'https://api.example.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));

  // CORS
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }));

  // Rate limiting
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Body size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Disable powered-by header
  app.disable('x-powered-by');
}
```

### Example 2: JWT Authentication with Refresh Tokens

```typescript
// auth/tokens.ts
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

interface TokenPayload {
  userId: string;
  role: string;
}

function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'myapp',
    audience: 'myapp-api',
  });
}

function generateRefreshToken(): string {
  return randomBytes(40).toString('hex');
}

async function createTokenPair(user: User) {
  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken();

  // Store refresh token hash in database
  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  await db.refreshTokens.create({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
}

function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'myapp',
    audience: 'myapp-api',
  }) as TokenPayload;
}

async function refreshAccessToken(refreshToken: string) {
  const hash = createHash('sha256').update(refreshToken).digest('hex');
  const stored = await db.refreshTokens.findByHash(hash);

  if (!stored || stored.expiresAt < new Date() || stored.revokedAt) {
    throw new Error('Invalid refresh token');
  }

  const user = await db.users.findById(stored.userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Rotate refresh token (invalidate old one, issue new one)
  await db.refreshTokens.revoke(stored.id);
  return createTokenPair(user);
}
```

### Example 3: Input Sanitization Pipeline

```typescript
// validation/sanitize.ts
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Custom Zod transformers for security
const sanitizedString = z.string().transform(val => val.trim());

const sanitizedHtml = z.string().transform(val =>
  DOMPurify.sanitize(val, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
  })
);

const safeUrl = z.string().url().refine(
  url => {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  },
  { message: 'Only HTTP and HTTPS URLs are allowed' }
);

const safeEmail = z.string()
  .email()
  .max(255)
  .transform(val => val.toLowerCase().trim());

// Usage in schemas
export const createPostSchema = z.object({
  title: sanitizedString.pipe(z.string().min(1).max(200)),
  body: sanitizedHtml.pipe(z.string().min(1).max(50000)),
  authorEmail: safeEmail,
  externalLink: safeUrl.optional(),
  tags: z.array(sanitizedString.pipe(z.string().min(1).max(50))).max(10),
});
```

### Example 4: Secure File Upload

```typescript
// uploads/validator.ts
import { createHash } from 'node:crypto';
import fileType from 'file-type';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
}

async function validateUpload(
  buffer: Buffer,
  claimedMimeType: string,
  filename: string
): Promise<FileValidationResult> {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Detect actual file type from magic bytes (not from extension or claimed type)
  const detected = await fileType.fromBuffer(buffer);
  if (!detected) {
    return { valid: false, error: 'Could not determine file type' };
  }

  if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
    return { valid: false, error: `File type ${detected.mime} is not allowed` };
  }

  // Verify claimed type matches detected type
  if (detected.mime !== claimedMimeType) {
    return {
      valid: false,
      error: `Claimed type ${claimedMimeType} does not match detected type ${detected.mime}`,
    };
  }

  // Sanitize filename (prevent path traversal)
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Generate content-based filename to prevent conflicts and enumerate attacks
  const hash = createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  const finalFilename = `${hash}_${safeFilename}`;

  return { valid: true, detectedType: detected.mime };
}
```

### Example 5: Password Strength Validation

```typescript
// validation/password.ts
import { z } from 'zod';

const commonPasswords = new Set([
  'password123', '123456789', 'qwerty123', 'admin123',
  'letmein', 'welcome1', 'monkey123', 'dragon123',
  // In production, load from a file with 10,000+ common passwords
]);

export const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    pw => /[a-z]/.test(pw),
    'Password must contain at least one lowercase letter'
  )
  .refine(
    pw => /[A-Z]/.test(pw),
    'Password must contain at least one uppercase letter'
  )
  .refine(
    pw => /[0-9]/.test(pw),
    'Password must contain at least one number'
  )
  .refine(
    pw => !commonPasswords.has(pw.toLowerCase()),
    'This password is too common'
  );

export function estimatePasswordStrength(password: string): 'weak' | 'fair' | 'strong' {
  let score = 0;

  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  // Check for character variety (not just repeating patterns)
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 8) score += 1;

  if (score <= 2) return 'weak';
  if (score <= 4) return 'fair';
  return 'strong';
}
```

---

## Quick Reference

### Security Header Checklist

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### OWASP Top 10 -- Quick Defenses

| Vulnerability | Defense |
|---------------|---------|
| Injection | Parameterized queries, ORMs |
| Broken Auth | bcrypt/Argon2, MFA, session management |
| XSS | Output encoding (React auto-escapes), CSP, DOMPurify |
| CSRF | SameSite cookies, CSRF tokens |
| SSRF | URL allowlisting, block private IPs |
| Broken Access Control | Server-side authorization checks on every endpoint |
| Security Misconfiguration | Helmet, disable debug mode, remove defaults |
| Vulnerable Components | npm audit, Dependabot, Snyk |
| Logging Failures | Structured logging, audit trails |
| Insecure Design | Threat modeling during design phase |

### Cookie Security Settings

```
Set-Cookie: session=abc123;
  HttpOnly;          # No JavaScript access
  Secure;            # HTTPS only
  SameSite=Strict;   # No cross-origin sending
  Path=/;            # Available site-wide
  Max-Age=86400;     # 24 hours
```

### Input Validation Checklist

```
1. [ ] Validate type (string, number, boolean, array)
2. [ ] Validate length/size (min, max)
3. [ ] Validate format (email, URL, UUID)
4. [ ] Validate range (min value, max value)
5. [ ] Validate against allowlist (enum values, allowed characters)
6. [ ] Sanitize for output context (HTML encoding, SQL parameterization)
7. [ ] Reject unexpected fields (use strict schemas)
```

### Password Security Quick Reference

```
Hashing:        bcrypt (cost 12+) or Argon2id
Min Length:     12 characters
Max Length:     128 characters (prevent DoS via hashing)
Storage:        Hash only, never plaintext or encrypted
Comparison:     Constant-time comparison (bcrypt.compare handles this)
Reset:          Time-limited, single-use, random token
Rate Limiting:  5 attempts per 15 minutes per IP+email
Error Message:  "Invalid email or password" (generic, no enumeration)
```

### Key Takeaways

1. **Never trust user input.** Validate on the server. Always.
2. **Use parameterized queries.** There is no excuse for SQL injection in modern code.
3. **React escapes by default**, but `dangerouslySetInnerHTML` and `href` are escape hatches that bypass protection.
4. **SameSite cookies** are the simplest CSRF defense and are the browser default now.
5. **Secrets belong in secret managers**, not in code, not in Git, not in environment files committed to the repo.
6. **Security headers are free defense.** Use Helmet and a strict CSP.
7. **Scan your dependencies.** You inherit the vulnerabilities of every library you import.
8. **Defense in depth.** No single control is sufficient. Layer input validation, output encoding, CSP, and server-side authorization.
