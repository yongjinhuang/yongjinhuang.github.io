# Authentication & Authorization

## What Is It?

Authentication is proving who you are. Authorization is determining what you're allowed to do. Almost every web app needs both. When you log in, that's authentication. When the app decides you can view admin pages but your colleague can't, that's authorization.

## Why Should You Care?

Auth is the front door to your application. Get it wrong and you've got unauthorized access, data breaches, and angry users. As a developer, you'll touch auth code in nearly every project — whether it's building login pages, protecting API endpoints, or integrating with third-party identity providers. If you don't understand the business logic, you'll build something that either locks everyone out or lets everyone in.

## How It Works (The Business Flow)

### Registration

1. User fills out a signup form (email, password, maybe name)
2. System validates the input (is the email already taken? Is the password strong enough?)
3. System creates a user record and hashes the password (never store plain text)
4. System sends a verification email with a one-time link
5. User clicks the link → account is verified and active

### Login

1. User enters email + password
2. System checks credentials against the stored hash
3. If valid, system creates a session or issues a token (JWT)
4. Token/session is sent back to the client and stored (cookie, localStorage)
5. Every subsequent request includes this token for identification

### Authorization Check

1. User tries to access a resource (e.g., `/admin/dashboard`)
2. System reads the token, identifies the user
3. System checks: does this user have the required role/permission?
4. If yes → allow. If no → return 403 Forbidden.

### Logout

1. User clicks "Sign Out"
2. Client-side: token/cookie is deleted
3. Server-side: session is invalidated (if using sessions) or token is added to a blocklist (if using JWTs)

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Authentication (AuthN)** | Verifying identity — "who are you?" |
| **Authorization (AuthZ)** | Checking permissions — "what can you do?" |
| **OAuth 2.0** | A protocol that lets users log in via Google, GitHub, etc. without sharing their password with your app |
| **OpenID Connect (OIDC)** | A layer on top of OAuth 2.0 that adds identity information (who the user is, not just what they can access) |
| **SSO (Single Sign-On)** | Log in once, access multiple apps. Common in enterprise (e.g., Okta, Azure AD) |
| **MFA / 2FA** | Multi-factor authentication — requiring a second proof (SMS code, authenticator app, hardware key) |
| **JWT (JSON Web Token)** | A self-contained token that carries user info and permissions, signed so it can't be tampered with |
| **Session** | Server-side storage of user state. The client holds a session ID (usually in a cookie), the server holds the data |
| **RBAC (Role-Based Access Control)** | Assign users roles (admin, editor, viewer), each role has specific permissions |
| **ABAC (Attribute-Based Access Control)** | Permissions based on attributes (department, location, time of day). More flexible than RBAC, more complex |
| **Refresh Token** | A long-lived token used to get new access tokens without re-entering credentials |
| **SAML** | Security Assertion Markup Language — an older SSO protocol, still widely used in enterprise |
| **API Key** | A simple string identifying a client application (not a user). Used for server-to-server communication |

## Common Patterns

### Pattern 1: Session-Based Auth (Traditional)

User logs in → server creates a session → stores session ID in a cookie → every request sends the cookie → server looks up the session.

**When it's used:** Traditional web apps, server-rendered pages, apps where you need easy session invalidation.

**Trade-off:** Requires server-side storage (memory, Redis, database). Harder to scale horizontally because sessions are stateful.

### Pattern 2: Token-Based Auth (JWT)

User logs in → server generates a JWT → sends it to client → client sends it with every request in the `Authorization` header → server validates the token's signature without looking anything up.

**When it's used:** SPAs, mobile apps, microservices. The token is self-contained.

**Trade-off:** You can't easily revoke a JWT before it expires (no server-side session to delete). Workaround: short expiry + refresh tokens.

### Pattern 3: OAuth 2.0 / Social Login

User clicks "Sign in with Google" → redirected to Google's login page → user authorizes your app → Google redirects back with an authorization code → your server exchanges it for tokens → you now have user info from Google.

**When it's used:** "Sign in with Google/GitHub/Apple," integrating with third-party APIs on behalf of the user.

**Trade-off:** Complex flow (multiple redirects). You depend on a third party for availability.

### Pattern 4: SSO (Enterprise)

Employee visits your app → redirected to their company's identity provider (Okta, Azure AD) → authenticates there → redirected back to your app with a SAML assertion or OIDC token → your app trusts the identity provider.

**When it's used:** B2B SaaS apps where enterprise customers want their employees to use their company credentials.

**Trade-off:** Integration complexity. Each customer might use a different identity provider.

## Gotchas & Edge Cases

- **Password reset flow**: Don't reveal whether an email exists in your system. Say "If this email is registered, you'll receive a reset link" — otherwise attackers can enumerate users.
- **Token storage**: Don't store JWTs in localStorage if your app is vulnerable to XSS. HttpOnly cookies are safer.
- **Session fixation**: Always regenerate the session ID after login. Otherwise an attacker can pre-set a session ID and hijack the user's session.
- **OAuth state parameter**: Always use the `state` parameter to prevent CSRF attacks during OAuth flows. Without it, attackers can trick users into linking their account to the attacker's identity.
- **Role explosion**: Start with a few roles. Companies that create dozens of fine-grained roles end up with an unmaintainable mess.
- **Forgot to protect the API**: You added auth to the frontend but your API endpoints are wide open. Always enforce auth server-side.
- **Hardcoded secrets**: Never put API keys or secrets in frontend code. They're visible to anyone who opens DevTools.

## Quick Reference

| Scenario | Recommended Approach |
|----------|---------------------|
| Traditional web app | Session-based auth with cookies |
| SPA / Mobile app | JWT with refresh tokens |
| "Sign in with Google" | OAuth 2.0 + OpenID Connect |
| Enterprise B2B | SSO via SAML or OIDC |
| API-to-API | API keys or client credentials grant |
| Need extra security | Add MFA (TOTP, WebAuthn) |
| Microservices | JWT passed between services, validated at each gateway |
