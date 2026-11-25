# Azure Identity & Security

Azure's identity story is its strongest differentiator: Entra ID (formerly Azure AD) is the world's most widely used identity platform, powering Microsoft 365, Azure, and thousands of enterprise applications. Understanding Managed Identity, RBAC, and Key Vault is essential for Azure interviews.

---

## Table of Contents

1. [Entra ID (Azure AD)](#entra-id)
2. [Azure RBAC](#azure-rbac)
3. [Managed Identity](#managed-identity)
4. [Key Vault](#key-vault)
5. [Comparison with AWS and GCP](#comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## Entra ID

Microsoft's cloud identity and access management service (formerly Azure Active Directory).

### What It Does

| Capability | Details |
| ---------- | ------- |
| **SSO** | Single sign-on to 1000s of SaaS apps |
| **MFA** | Multi-factor authentication (phone, authenticator, FIDO2) |
| **B2C** | Customer-facing identity (social login, custom UI) |
| **B2B** | Guest user access across organizations |
| **Conditional Access** | Policy-based access (device, location, risk) |
| **App registration** | OAuth 2.0 / OIDC for your applications |
| **Privileged Identity Management (PIM)** | Just-in-time privileged access |
| **Device management** | Intune integration for device compliance |

### Entra ID vs AWS IAM vs GCP IAM

| Feature | Entra ID | AWS IAM | GCP IAM |
| ------- | -------- | ------- | ------- |
| **Scope** | Identity platform (Azure + M365 + SaaS) | AWS resources only | GCP resources only |
| **SSO** | Built-in (enterprise-grade) | IAM Identity Center | Cloud Identity |
| **B2C** | Entra ID B2C | Cognito | Identity Platform |
| **MFA** | Built-in | IAM MFA | Cloud Identity |
| **Conditional Access** | Rich policies (device, location, risk) | IAM conditions | IAM conditions |
| **Directory** | Full directory service | Not a directory | Not a directory |

**Key insight:** Entra ID is an identity PLATFORM, not just access management. AWS IAM and GCP IAM are access management for their respective clouds. Entra ID manages identities across the entire Microsoft ecosystem and thousands of third-party apps.

---

## Azure RBAC

### Role Assignment

```
Who (Security Principal) + What (Role) + Where (Scope) = Access

"alice@company.com" + "Contributor" + "/subscriptions/xxx/resourceGroups/prod"
  -> Alice can manage all resources in the "prod" resource group

Scope hierarchy (inherited):
  Management Group > Subscription > Resource Group > Resource
```

### Built-in Roles

| Role | Permissions | Use Case |
| ---- | ----------- | -------- |
| **Owner** | Full access + assign roles | Subscription admins |
| **Contributor** | Full access, cannot assign roles | Developers, DevOps |
| **Reader** | Read-only access | Auditors, monitoring |
| **User Access Administrator** | Manage role assignments | IAM admins |
| **Storage Blob Data Contributor** | Read/write blob data | App service accounts |
| **Key Vault Secrets User** | Read secrets | Applications |

### Custom Roles

```json
{
  "Name": "VM Operator",
  "Description": "Can start, stop, and restart VMs",
  "Actions": [
    "Microsoft.Compute/virtualMachines/start/action",
    "Microsoft.Compute/virtualMachines/restart/action",
    "Microsoft.Compute/virtualMachines/deallocate/action",
    "Microsoft.Compute/virtualMachines/read"
  ],
  "NotActions": [],
  "AssignableScopes": ["/subscriptions/xxx"]
}
```

---

## Managed Identity

Azure's solution for service-to-service authentication without credentials.

```
Without Managed Identity:
  App -> stores connection string / secret -> uses secret to access Key Vault / SQL
  Problem: secret management, rotation, leakage risk

With Managed Identity:
  App -> Azure assigns identity automatically -> requests token from Entra ID -> accesses resources
  No secrets to manage!
```

### Types

| Type | Lifecycle | Scope | Use Case |
| ---- | --------- | ----- | -------- |
| **System-assigned** | Created/deleted with resource | One resource | Simple 1:1 (VM, App Service, Function) |
| **User-assigned** | Independent lifecycle | Multiple resources | Share identity across services |

### How It Works

```
1. Enable managed identity on App Service
2. Grant RBAC role on target resource (e.g., Storage Blob Data Reader on storage account)
3. App requests token:

const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");

// No connection strings or secrets!
const credential = new DefaultAzureCredential();
const client = new BlobServiceClient(
  "https://myaccount.blob.core.windows.net",
  credential
);
```

### DefaultAzureCredential Chain

```
The SDK tries these in order:
  1. Environment variables (AZURE_CLIENT_ID, etc.)
  2. Workload Identity (Kubernetes)
  3. Managed Identity (App Service, VM, Functions)
  4. Azure CLI (local development)
  5. Azure PowerShell
  6. Interactive browser

This means the SAME code works in production (managed identity) and locally (Azure CLI).
```

---

## Key Vault

Centralized secret, key, and certificate management.

| Feature | Details |
| ------- | ------- |
| **Secrets** | Connection strings, API keys, passwords |
| **Keys** | Encryption keys (RSA, EC), HSM-backed |
| **Certificates** | TLS certificates with auto-renewal |
| **Access** | RBAC or access policies |
| **Audit** | Full audit logging |
| **Soft delete** | Recover deleted secrets (retention period) |
| **Purge protection** | Prevent permanent deletion |
| **HSM** | FIPS 140-2 Level 2 (Standard), Level 3 (Premium/Managed HSM) |

### Usage

```javascript
const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

const client = new SecretClient(
  "https://my-vault.vault.azure.net",
  new DefaultAzureCredential() // Managed Identity in production, Azure CLI locally
);

const secret = await client.getSecret("database-password");
console.log(secret.value);
```

### Key Vault References (App Service / Functions)

```
Instead of storing secrets in app settings:
  DATABASE_URL = @Microsoft.KeyVault(SecretUri=https://myvault.vault.azure.net/secrets/db-url)

The platform automatically fetches the secret from Key Vault at startup.
No code changes needed!
```

---

## Comparison

| Feature | Azure | AWS | GCP |
| ------- | ----- | --- | --- |
| **Identity platform** | Entra ID (full directory + SSO) | Cognito + IAM Identity Center | Cloud Identity |
| **Service identity** | Managed Identity | IAM Roles | Service Accounts |
| **No-credential auth** | DefaultAzureCredential | Instance profile / IRSA | Application Default Credentials |
| **Secrets** | Key Vault | Secrets Manager | Secret Manager |
| **Encryption keys** | Key Vault (keys) | KMS | Cloud KMS |
| **Certificates** | Key Vault (certificates) | ACM | Certificate Manager |
| **RBAC** | Scope-based (mgmt group > sub > RG) | Policy-based (IAM policies) | Hierarchy-based (org > folder > project) |
| **Conditional access** | Rich (device, location, risk) | IAM conditions | IAM conditions |

---

## Common Interview Questions

1. **What is Managed Identity and why should you use it?** Azure assigns an identity to your resource (App Service, VM, etc.) automatically. The resource can request tokens from Entra ID to access other Azure services. No secrets to store, rotate, or leak. System-assigned (1:1 with resource) or user-assigned (shared).

2. **How does DefaultAzureCredential work?** It tries multiple authentication methods in order: environment variables, workload identity, managed identity, Azure CLI, browser. Same code works in production (managed identity) and development (Azure CLI). Eliminates environment-specific auth code.

3. **What is the difference between Entra ID and AWS IAM?** Entra ID is a full identity platform (directory, SSO, MFA, B2C, conditional access) for Azure, Microsoft 365, and thousands of SaaS apps. AWS IAM is access management for AWS resources only. Entra ID is much broader in scope.

4. **How do you secure secrets in Azure?** Store in Key Vault, access via Managed Identity (no credentials needed). Use Key Vault References in App Service for automatic secret injection. Enable soft delete and purge protection. Audit all access via diagnostic logs.

5. **What is Conditional Access?** Entra ID policies that enforce access controls based on conditions: device compliance, user location, risk level, client app, authentication strength. Example: require MFA for all access outside the office network.

6. **System-assigned vs user-assigned Managed Identity?** System-assigned: tied to one resource, deleted when resource is deleted, simplest setup. User-assigned: independent lifecycle, can be shared across multiple resources, more flexible for multi-service architectures.
