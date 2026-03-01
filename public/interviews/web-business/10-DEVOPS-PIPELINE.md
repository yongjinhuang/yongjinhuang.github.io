# DevOps Pipeline

## What Is It?

A DevOps pipeline is the automated path your code takes from a developer's machine to production. It covers everything after you type `git push`: code review, automated tests, building, security scanning, staging deployment, production deployment, and monitoring. The goal is to ship code quickly and safely — catching bugs before they reach users, and making deployments boring instead of terrifying.

## Why Should You Care?

Every professional development team uses some form of CI/CD pipeline. Whether you're at a startup or a large enterprise, you'll interact with the pipeline daily. Understanding the business flow — why certain checks exist, what happens during a deployment, how to roll back safely — saves you from being the person who breaks production on a Friday afternoon and doesn't know how to undo it.

## How It Works (The Business Flow)

### The Full Pipeline

```
Code → Push → CI Checks → Code Review → Merge → Build → Deploy to Staging → QA → Deploy to Production → Monitor
```

### 1. Code & Commit

1. Developer writes code on a feature branch
2. Runs local checks (linting, tests, type checking)
3. Commits with a meaningful message (see [conventional commits](https://www.conventionalcommits.org/))
4. Pushes to remote repository (GitHub, GitLab, Bitbucket)

### 2. Continuous Integration (CI)

Triggered automatically on push or pull request:

1. **Linting**: Code style and formatting checks (ESLint, Prettier)
2. **Type Checking**: TypeScript compilation, type safety verification
3. **Unit Tests**: Fast tests that verify individual functions and components
4. **Integration Tests**: Tests that verify components working together
5. **Build**: Compile the application to verify it builds successfully
6. **Security Scan**: Check dependencies for known vulnerabilities (Snyk, Dependabot)
7. **Code Coverage**: Measure what percentage of code is covered by tests

All checks must pass before the PR can be merged. This is enforced by branch protection rules.

### 3. Code Review

1. Developer opens a Pull Request (PR) with a description of changes
2. Reviewers are assigned (automatically or manually)
3. Reviewers check for: correctness, readability, performance, security, test coverage
4. Comments are left, discussions happen
5. Developer addresses feedback and pushes updates
6. When approved (usually 1-2 approvals required), PR is ready to merge

### 4. Merge & Build

1. PR is merged into the main branch (via merge commit, squash, or rebase)
2. CI runs again on the merged code
3. Build artifacts are created (Docker images, compiled assets, bundles)
4. Artifacts are tagged with a version (git SHA, semantic version, build number)
5. Artifacts are pushed to a registry (Docker Hub, ECR, Artifactory)

### 5. Deployment

**Staging (Pre-Production):**
1. Artifacts are deployed to a staging environment that mirrors production
2. QA team (or automated E2E tests) verifies everything works
3. Performance testing may happen here
4. If issues are found, the pipeline stops — fix and retry

**Production:**
1. After staging approval, artifacts are deployed to production
2. Deployment strategy is executed (see Common Patterns below)
3. Health checks verify the new version is serving traffic correctly
4. Monitoring dashboards are watched for anomalies

### 6. Post-Deployment

1. **Monitoring**: Watch error rates, latency, and key metrics
2. **Alerting**: If something goes wrong, the team is notified (PagerDuty, Slack)
3. **Rollback**: If the deployment causes issues, revert to the previous version
4. **Release notes**: Communicate what changed to stakeholders

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **CI** | Continuous Integration — automatically testing code on every push |
| **CD** | Continuous Deployment/Delivery — automatically deploying code after CI passes |
| **Pipeline** | The sequence of automated steps from code to production |
| **Artifact** | The built output (Docker image, compiled binary, bundled JS) |
| **Branch Protection** | Rules that prevent merging unless checks pass and reviews are approved |
| **Feature Branch** | A branch created for a specific feature or fix, merged back when done |
| **Trunk-Based Development** | Everyone commits to main/trunk with short-lived branches. Favors small, frequent merges |
| **GitFlow** | A branching strategy with develop, feature, release, and hotfix branches. More complex |
| **Blue-Green Deployment** | Two identical environments. Deploy to the idle one, then switch traffic |
| **Canary Deployment** | Deploy to a small percentage of users first. If metrics are good, roll out to everyone |
| **Rolling Deployment** | Gradually replace old instances with new ones, one at a time |
| **Rollback** | Reverting to a previous version when something goes wrong |
| **Environment** | A separate instance of your app (development, staging, production) |
| **Infrastructure as Code (IaC)** | Defining infrastructure (servers, databases, networks) in code (Terraform, CloudFormation) |
| **SLA** | Service Level Agreement — the promised uptime (e.g., 99.9% = max 8.7 hours downtime/year) |
| **MTTR** | Mean Time To Recovery — how quickly you recover from incidents |
| **Hotfix** | An urgent fix deployed outside the normal release cycle |
| **Feature Flag** | A toggle that enables/disables features without deploying. See [Feature Flags](19-FEATURE-FLAGS.md) |

## Common Patterns

### Pattern 1: Blue-Green Deployment

Two identical production environments (Blue and Green). Only one serves traffic at a time.

1. Blue is live, serving all traffic
2. Deploy new version to Green
3. Test Green thoroughly
4. Switch the load balancer to point to Green
5. Green is now live. Blue is idle (fallback)
6. If something goes wrong, switch back to Blue instantly

**Trade-off:** Requires double the infrastructure. Instant rollback is the payoff.

### Pattern 2: Canary Deployment

Deploy the new version to a small subset of users. Monitor. If all good, expand.

1. Deploy new version to 5% of servers/users
2. Monitor error rates, latency, business metrics
3. If metrics are healthy after 15-30 minutes, expand to 25%, then 50%, then 100%
4. If metrics degrade, roll back the canary immediately

**Trade-off:** More complex routing logic. But reduces blast radius — a bad deploy only affects 5% of users initially.

### Pattern 3: Rolling Deployment

Replace instances one at a time. At any point, some instances run the old version and some run the new.

1. Take one instance out of the load balancer
2. Deploy new version to that instance
3. Add it back to the load balancer
4. Repeat for each instance

**Trade-off:** No extra infrastructure needed. But rollback is slower (you have to roll forward or reverse the process).

### Pattern 4: Serverless / JAMstack

No servers to manage. Build static assets, deploy to a CDN.

1. Push to main → CI builds the site → deploys static files to CDN (Vercel, Netlify, Cloudflare Pages)
2. Dynamic functionality via serverless functions (API routes, edge functions)
3. Rollback = redeploy the previous build

**Trade-off:** Simplest deployment model. But limited for complex server-side logic.

## Gotchas & Edge Cases

- **Database migrations**: Code deploys are instant. Database changes are not. Always make migrations backward-compatible. Deploy migration first, then deploy code.
- **Never deploy on Fridays**: A joke that's also good advice. If something breaks, you want to fix it during work hours, not over the weekend.
- **Flaky tests**: Tests that sometimes pass and sometimes fail erode trust in the pipeline. People start ignoring failures. Fix flaky tests immediately.
- **Secret management**: Never put secrets in code, environment files committed to git, or CI logs. Use a secrets manager (Vault, AWS Secrets Manager, GitHub Secrets).
- **Long-running deployments**: If your deployment takes 30+ minutes, developers stack up changes waiting to deploy. Optimize build times.
- **Deployment permissions**: Not everyone should be able to deploy to production. Use role-based access in your CI/CD tool.
- **Observability gap**: You deployed successfully but have no way to know if the new version is actually working. Always pair deployments with monitoring.
- **Rollback data**: You can roll back code, but you can't easily roll back data. If the new code wrote data in a new format, rolling back the code doesn't undo the data changes.

## Quick Reference

| Scenario | Recommended Strategy |
|----------|---------------------|
| Small team, simple app | Push to main → auto-deploy to production |
| Growing team | Feature branches + PR reviews + staging environment |
| Large team, critical app | Canary deployment + feature flags + automated rollback |
| Static site / JAMstack | Push to main → build → deploy to CDN |
| Mobile app | CI/CD + TestFlight/Play Console + phased rollout |
| Breaking change | Feature flag to decouple deploy from release |
| Database change | Run migration separately, ensure backward compatibility |
