# GCP IAM & Security

GCP's IAM model is fundamentally different from AWS: it uses a resource hierarchy (Organization > Folder > Project) with inherited permissions. Service accounts are the primary identity for applications. Understanding this model is critical for GCP interviews.

---

## Table of Contents

1. [Resource Hierarchy](#resource-hierarchy)
2. [IAM Model](#iam-model)
3. [Service Accounts](#service-accounts)
4. [Secret Manager](#secret-manager)
5. [Cloud KMS](#cloud-kms)
6. [VPC Service Controls](#vpc-service-controls)
7. [Comparison with AWS IAM](#comparison-with-aws-iam)
8. [Common Interview Questions](#common-interview-questions)

---

## Resource Hierarchy

```
Organization (example.com)
  |
  +-- Folder: "Engineering"
  |     +-- Project: "prod-api"        (billing, IAM, resources)
  |     +-- Project: "prod-frontend"
  |     +-- Folder: "Staging"
  |           +-- Project: "staging-api"
  |
  +-- Folder: "Data"
        +-- Project: "analytics"
        +-- Project: "ml-training"

IAM policies INHERIT downward:
  Role granted at Organization -> applies to ALL projects
  Role granted at Folder -> applies to all projects in folder
  Role granted at Project -> applies to that project only
```

### Key Principle

```
Projects are the fundamental unit in GCP:
  - Every resource belongs to exactly one project
  - Billing is per-project
  - IAM can be set at project level
  - APIs are enabled per-project
  - Quotas are per-project
```

---

## IAM Model

### Who (Identity) + What (Role) + Where (Resource)

```
"alice@company.com" has "roles/storage.admin" on "project:prod-api"
  Who:   alice@company.com
  What:  roles/storage.admin (create/read/update/delete buckets and objects)
  Where: project prod-api (all Cloud Storage resources in this project)
```

### Identity Types

| Type | Example | Use Case |
| ---- | ------- | -------- |
| **Google account** | alice@gmail.com | Individual users |
| **Google group** | eng@company.com | Team-based access |
| **Service account** | sa@project.iam.gserviceaccount.com | Applications, VMs, Cloud Run |
| **Cloud Identity domain** | company.com | All users in organization |
| **Workload Identity** | External identity (AWS, Azure, GitHub) | Cross-cloud, CI/CD |

### Role Types

| Type | Example | Granularity |
| ---- | ------- | ----------- |
| **Basic** | roles/viewer, roles/editor, roles/owner | Broad (avoid in production) |
| **Predefined** | roles/storage.objectViewer | Service-specific, curated |
| **Custom** | roles/myCustomRole | Exact permissions you define |

**Best practice:** Never use basic roles (editor, owner) in production. Use predefined or custom roles with least privilege.

### IAM Conditions

```
Grant access only under specific conditions:

"alice@company.com" has "roles/storage.objectViewer"
  on "bucket:sensitive-data"
  IF resource.name.startsWith("projects/_/buckets/sensitive-data/objects/public/")
  AND request.time < timestamp("2025-01-01T00:00:00Z")
```

---

## Service Accounts

The primary identity for applications in GCP.

### How They Work

```
Application (Cloud Run, GKE, Compute Engine)
  -> Runs as service account
  -> Service account has IAM roles
  -> Application can access GCP resources based on those roles

No API keys or secrets needed -- identity is automatic.
```

### Key Concepts

| Concept | Details |
| ------- | ------- |
| **Default SA** | Auto-created per project (has Editor role -- too broad!) |
| **User-managed SA** | You create with specific roles (recommended) |
| **SA keys** | JSON key files (avoid! use workload identity instead) |
| **SA impersonation** | User acts as SA temporarily (for testing/debugging) |
| **Workload Identity** | GKE pods use SA without keys |
| **Workload Identity Federation** | External identities (GitHub, AWS) use GCP SA without keys |

### Workload Identity Federation

```
GitHub Actions -> Workload Identity Federation -> GCP Service Account
  - No service account keys stored in GitHub
  - GitHub token exchanged for short-lived GCP token
  - Scoped to specific repos/branches

AWS -> Workload Identity Federation -> GCP Service Account
  - AWS IAM role mapped to GCP SA
  - Cross-cloud access without long-lived credentials
```

---

## Secret Manager

Managed secret storage and rotation.

```python
from google.cloud import secretmanager

client = secretmanager.SecretManagerServiceClient()
response = client.access_secret_version(
    name="projects/my-project/secrets/db-password/versions/latest"
)
password = response.payload.data.decode("UTF-8")
```

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Storage** | Encrypted at rest | Secrets Manager |
| **Versioning** | Automatic versioning | Automatic versioning |
| **Rotation** | Via Cloud Functions (manual setup) | Built-in rotation |
| **Access control** | IAM per-secret | IAM per-secret |
| **Audit** | Cloud Audit Logs | CloudTrail |
| **Pricing** | $0.06/version/month + $0.03/10K access | $0.40/secret/month |
| **Replication** | Automatic or user-managed | Regional |

---

## Cloud KMS

Managed encryption key service.

| Feature | Details |
| ------- | ------- |
| **Key types** | Symmetric (AES-256), Asymmetric (RSA, EC) |
| **Protection** | Software, HSM (FIPS 140-2 Level 3), External |
| **Key rotation** | Automatic (configurable period) |
| **Envelope encryption** | Encrypt data key with KMS key |
| **Integration** | Cloud Storage, BigQuery, Compute Engine, GKE |
| **CMEK** | Customer-Managed Encryption Keys for GCP services |

---

## VPC Service Controls

Create security perimeters around GCP resources to prevent data exfiltration.

```
+-- VPC Service Controls Perimeter --+
|                                     |
|  Project: prod-api                  |
|  Project: prod-data                 |
|                                     |
|  BigQuery, Cloud Storage, Spanner   |
|  can only be accessed from within   |
|  this perimeter                     |
|                                     |
+-------------------------------------+

Outside the perimeter:
  - Even with IAM permissions, cannot access resources
  - Prevents data exfiltration (copy to external project)
  - Blocks compromised credentials from leaking data
```

---

## Comparison with AWS IAM

| Feature | GCP IAM | AWS IAM |
| ------- | ------- | ------- |
| **Hierarchy** | Org > Folder > Project (inherited) | Account > OU (SCPs) |
| **Roles** | Granted on resources (binding) | Attached to identities (policies) |
| **Service identity** | Service accounts | IAM roles (for services) |
| **Cross-account** | Service account impersonation | AssumeRole |
| **External identity** | Workload Identity Federation | IAM Roles Anywhere |
| **Conditions** | IAM Conditions | IAM Conditions |
| **Policies** | Allow only (deny policies in preview) | Allow + explicit deny |
| **Resource policies** | Limited (buckets, Pub/Sub) | Broad (S3, SQS, KMS, etc.) |
| **Organization policies** | Org Policy Service (constraints) | Service Control Policies (SCPs) |

---

## Common Interview Questions

1. **How does GCP IAM differ from AWS IAM?** GCP uses a resource hierarchy with inherited permissions (org > folder > project). Roles are bound to resources, not identities. Service accounts are the primary application identity. AWS uses flat accounts with SCPs for organization control.

2. **What is a service account and when should you use one?** A service account is an identity for applications (not humans). Use for: Cloud Run services, GKE pods, Compute Engine VMs, CI/CD pipelines. Avoid default service accounts (too broad). Create dedicated SAs with minimal permissions.

3. **What is Workload Identity Federation?** Allows external identities (GitHub Actions, AWS IAM, Azure AD) to impersonate GCP service accounts without long-lived keys. The external token is exchanged for a short-lived GCP access token. Eliminates the need to store SA key files.

4. **Why should you avoid service account keys?** Keys are long-lived credentials that can be leaked. If compromised, they provide full access until revoked. Use Workload Identity (GKE), Workload Identity Federation (external), or attached service accounts (Compute Engine, Cloud Run) instead.

5. **What are VPC Service Controls?** Security perimeters around GCP resources that restrict access regardless of IAM permissions. Prevent data exfiltration by blocking access from outside the perimeter. Even a user with Owner role cannot access resources outside the perimeter boundary.
