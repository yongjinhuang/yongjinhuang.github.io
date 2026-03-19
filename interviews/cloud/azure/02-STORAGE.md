# Azure Blob Storage

Azure Blob Storage is Microsoft's object storage service, equivalent to AWS S3. It stores unstructured data (images, videos, backups, logs) with multiple access tiers for cost optimization.

---

## Table of Contents

1. [Storage Account Structure](#storage-account-structure)
2. [Access Tiers](#access-tiers)
3. [Lifecycle Management](#lifecycle-management)
4. [Access Control](#access-control)
5. [Comparison with S3 and Cloud Storage](#comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## Storage Account Structure

```
Storage Account (globally unique name)
  |
  +-- Container: "images" (like S3 bucket)
  |     +-- Blob: "photo.jpg"
  |     +-- Blob: "avatar.png"
  |
  +-- Container: "logs"
        +-- Blob: "2024/01/15/app.log"
```

### Blob Types

| Type | Use Case | Details |
| ---- | -------- | ------- |
| **Block Blob** | Files, images, videos | Default type, up to 190 TB |
| **Append Blob** | Log files | Optimized for append operations |
| **Page Blob** | Disks, random access | Used by Azure VM disks, up to 8 TB |

### Redundancy Options

| Option | Copies | Scope | Durability |
| ------ | ------ | ----- | ---------- |
| **LRS** | 3 copies | Single datacenter | 99.999999999% (11 nines) |
| **ZRS** | 3 copies | 3 availability zones | 99.9999999999% (12 nines) |
| **GRS** | 6 copies | Primary + secondary region | 99.99999999999999% (16 nines) |
| **GZRS** | 6 copies | 3 zones + secondary region | 16 nines |

---

## Access Tiers

| Tier | Storage Cost | Access Cost | Min Duration | Retrieval |
| ---- | ------------ | ----------- | ------------ | --------- |
| **Hot** | Highest | Lowest | None | Instant |
| **Cool** | Lower | Moderate | 30 days | Instant |
| **Cold** | Lower still | Higher | 90 days | Instant |
| **Archive** | Lowest ($0.00099/GB) | Highest | 180 days | Hours (rehydrate first!) |

**Key difference from GCP:** Azure Archive requires rehydration (hours), similar to S3 Glacier. GCP Archive is instant access.

### Rehydration (Archive Tier)

```
Archive blob is offline. To read it:
  1. Set tier to Hot or Cool (rehydrate)
  2. Standard priority: up to 15 hours
  3. High priority: under 1 hour (higher cost)
  4. Once rehydrated, access normally
```

---

## Lifecycle Management

```json
{
  "rules": [
    {
      "name": "move-to-cool",
      "type": "Lifecycle",
      "definition": {
        "actions": {
          "baseBlob": {
            "tierToCool": { "daysAfterModificationGreaterThan": 30 },
            "tierToArchive": { "daysAfterModificationGreaterThan": 90 },
            "delete": { "daysAfterModificationGreaterThan": 365 }
          },
          "snapshot": {
            "delete": { "daysAfterCreationGreaterThan": 30 }
          }
        },
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["logs/"]
        }
      }
    }
  ]
}
```

---

## Access Control

| Method | Description | Use Case |
| ------ | ----------- | -------- |
| **Azure RBAC** | IAM roles on storage account/container | Team access management |
| **Shared Access Signatures (SAS)** | Time-limited, scoped access tokens | Client uploads, temporary access |
| **Access keys** | Full access (2 keys per account) | Application access (rotate regularly) |
| **Azure AD + Managed Identity** | Passwordless service-to-service | Recommended for services |
| **Public access** | Anonymous read access | Static website hosting |

### SAS Tokens

```
https://myaccount.blob.core.windows.net/images/photo.jpg
  ?sv=2023-01-01
  &st=2024-01-15T00:00:00Z     (start time)
  &se=2024-01-16T00:00:00Z     (expiry time)
  &sr=b                         (resource: blob)
  &sp=r                         (permission: read)
  &sig=<signature>

Types:
  Account SAS: access to entire storage account
  Service SAS: access to specific service (blob, queue, table, file)
  User delegation SAS: signed with Azure AD credentials (most secure)
```

---

## Comparison

| Feature | Azure Blob | S3 | Cloud Storage |
| ------- | ---------- | -- | ------------- |
| **Tiers** | Hot, Cool, Cold, Archive | Standard, IA, Glacier, Deep Archive | Standard, Nearline, Coldline, Archive |
| **Archive access** | Hours (rehydrate) | Minutes-hours (restore) | Instant |
| **Max object** | 190 TB (block blob) | 5 TB | 5 TB |
| **Redundancy** | LRS, ZRS, GRS, GZRS | Same-region only (cross-region replication extra) | Regional, dual-region, multi-region |
| **Events** | Event Grid | S3 Events, EventBridge | Pub/Sub notifications |
| **Static website** | Yes (built-in) | Yes | Yes |
| **CDN** | Azure CDN / Front Door | CloudFront | Cloud CDN |

---

## Common Interview Questions

1. **What are Azure Blob Storage access tiers?** Hot (frequent access, highest storage cost), Cool (30-day min, lower storage), Cold (90-day min), Archive (180-day min, offline, requires rehydration). All except Archive provide instant access.

2. **What is a SAS token?** A Shared Access Signature grants limited access to storage resources without sharing account keys. Scoped by: time (start/expiry), permissions (read/write/delete), resource (blob/container), and IP range.

3. **How does Azure redundancy work?** LRS: 3 copies in one datacenter. ZRS: 3 copies across availability zones. GRS: 3 copies locally + 3 copies in paired region. GZRS: combines ZRS + GRS for highest durability.

4. **How does Archive tier differ from S3 Glacier?** Both require a retrieval/rehydration step before data is accessible. Azure Archive: standard rehydration up to 15 hours, high priority under 1 hour. S3 Glacier: expedited 1-5 minutes, standard 3-5 hours, bulk 5-12 hours.
