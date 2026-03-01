# User Management

## What Is It?

User management is everything that happens around a user account — from the moment someone signs up to the moment they delete their account (and even after that, because you might need to keep some data for legal reasons). It covers registration, profiles, roles, preferences, account states, and the entire lifecycle of a user's relationship with your product.

## Why Should You Care?

Every web app has users. Whether you're building a social network, a SaaS tool, or an internal dashboard, user management is foundational. And it's more than just a `users` table with an email and password. There are business rules around verification, account states, roles, data retention, and account deletion that directly affect user trust and legal compliance. Miss something here and you'll be patching it in production under pressure.

## How It Works (The Business Flow)

### Registration

1. User fills out signup form (email + password, or social login)
2. System validates: Is the email already taken? Does the password meet requirements?
3. System creates user record with status = `unverified`
4. Verification email sent with a one-time link (expires in 24 hours)
5. User clicks link → status changes to `active`
6. If link expires, user can request a new one

### Profile Management

1. User edits their profile: name, avatar, bio, preferences
2. Some fields may require re-verification (changing email requires confirming the new one)
3. Sensitive changes (email, password) often require entering the current password first
4. Profile updates are saved and immediately reflected

### Account States

A user account is a state machine:

```
Unverified → Active → Suspended → Deactivated → Deleted
                ↑                       ↓
                └───── Reactivated ─────┘
```

- **Unverified**: Signed up but hasn't confirmed email
- **Active**: Normal, fully functional account
- **Suspended**: Temporarily disabled by an admin (policy violation, suspicious activity)
- **Deactivated**: User chose to disable their account. Data preserved, can be reactivated
- **Deleted**: Permanent removal. May have a grace period before data is purged

### Password Management

1. **Password reset**: User clicks "Forgot Password" → system sends reset link → user sets new password → all existing sessions are invalidated
2. **Password change**: Logged-in user changes password (requires current password)
3. **Password requirements**: Minimum length, complexity rules. Don't over-restrict (no max length, allow special characters, allow paste)
4. **Breach detection**: Some systems check passwords against known breach databases (HaveIBeenPwned API)

### Roles & Permissions

1. Users are assigned one or more roles (e.g., Owner, Admin, Member, Viewer)
2. Each role has a set of permissions (can_create, can_edit, can_delete, can_invite)
3. Roles are usually scoped to an organization or workspace (a user can be Admin in one org and Viewer in another)
4. Permission checks happen at the API level, not just the UI

### Account Deletion

This is surprisingly complex thanks to privacy laws:

1. User requests account deletion
2. System shows what will be deleted and what must be retained
3. Grace period (often 30 days) — account is deactivated, not deleted
4. After grace period, personal data is purged
5. Some data must be kept (financial records, legal holds) — but anonymized
6. The user's content may need special handling (do their posts disappear? get attributed to "Deleted User"?)

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **User Lifecycle** | The full journey from registration to deletion |
| **Onboarding** | The initial experience after signup — welcome emails, setup wizard, guided tour |
| **KYC** | Know Your Customer — identity verification required in finance/regulated industries |
| **SSO Provisioning** | Automatically creating user accounts when employees are added in the company's identity provider |
| **SCIM** | System for Cross-domain Identity Management — a protocol for syncing user data between systems |
| **Org / Workspace / Team** | A grouping of users. One user can belong to multiple orgs |
| **Invite Flow** | Existing user invites someone → system sends invite email → invitee signs up or joins |
| **Impersonation** | Admin logs in "as" a user to debug their issues. Requires audit logging |
| **Soft Delete** | Marking a record as deleted without removing it from the database |
| **Hard Delete** | Actually removing data from the database (and backups, eventually) |
| **PII** | Personally Identifiable Information — name, email, phone, address. Must be handled carefully |
| **Data Subject Request (DSR)** | A user's formal request under GDPR/CCPA to access or delete their data |

## Common Patterns

### Pattern 1: Simple User Model

One user = one account. No teams, no orgs. Each user has a role (user, admin).

**When it's used:** Consumer apps, simple SaaS, personal tools.

**Trade-off:** Breaks down when you need multi-user collaboration.

### Pattern 2: User + Organization

Users belong to organizations. Roles are scoped per organization.

```
User ← belongs to → Organization (with role)
```

**When it's used:** B2B SaaS (Slack, Notion, GitHub).

**Trade-off:** More complex queries. Need to handle: user has no org, user has multiple orgs, org has no users.

### Pattern 3: User + Organization + Team

Organizations have teams. Permissions can be at org level or team level.

**When it's used:** Large enterprise SaaS (Jira, Azure DevOps).

**Trade-off:** Permission model gets complicated. Keep it as simple as possible.

## Gotchas & Edge Cases

- **Email uniqueness**: What if someone signs up with `john@gmail.com` via email and later tries "Sign in with Google" using the same email? You need an account linking strategy.
- **Username changes**: If usernames appear in URLs (`/users/john`), changing usernames breaks links. Either disallow changes or maintain redirects.
- **Timezone handling**: Store dates in UTC, display in user's timezone. Let users set their timezone in preferences.
- **Avatar storage**: Don't store base64 images in your database. Upload to object storage (S3) and store the URL.
- **Deleted user's content**: In a forum, if a user deletes their account, do their posts disappear? Usually not — you attribute them to "Deleted User" or "[removed]".
- **Admin account lockout**: If the only admin deletes their account or gets suspended, who manages the org? Prevent the last admin from leaving.
- **Merge accounts**: "I accidentally created two accounts" is a common support request. Account merging is hard — you need to reconcile all related data (orders, posts, settings).
- **Re-registration with deleted email**: Can someone sign up again with the same email after deleting their account? During the grace period? After?
- **Session invalidation**: When a user changes their password or an admin suspends an account, all active sessions must be invalidated immediately.

## Quick Reference

| Scenario | Recommended Approach |
|----------|---------------------|
| Simple consumer app | User + role (user/admin) |
| B2B SaaS | User + Organization with role-per-org |
| Enterprise | User + Org + Team with hierarchical permissions |
| Account deletion | 30-day grace period → soft delete → hard delete PII |
| Email verification | Required before full account access |
| Password reset | One-time link, expires in 1 hour, invalidates all sessions |
| User impersonation | Audit-logged, admin-only, clearly indicated in UI |
| Profile images | Upload to S3/CDN, resize on upload, store URL in DB |
