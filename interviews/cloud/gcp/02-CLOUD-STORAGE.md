# GCP Cloud Storage

Cloud Storage is GCP's object storage service, equivalent to AWS S3. It stores any amount of data with 11 nines of durability and offers four storage classes for cost optimization.

---

## Table of Contents

1. [Storage Classes](#storage-classes)
2. [Key Features](#key-features)
3. [Lifecycle Management](#lifecycle-management)
4. [Access Control](#access-control)
5. [Comparison with S3](#comparison-with-s3)
6. [Common Interview Questions](#common-interview-questions)

---

## Storage Classes

| Class | Min Storage Duration | Access Cost | Storage Cost | Use Case |
| ----- | -------------------- | ----------- | ------------ | -------- |
| **Standard** | None | Lowest | $0.020/GB | Frequently accessed data |
| **Nearline** | 30 days | Moderate | $0.010/GB | Monthly access |
| **Coldline** | 90 days | Higher | $0.004/GB | Quarterly access |
| **Archive** | 365 days | Highest | $0.0012/GB | Yearly access, compliance |

All classes have the same:
- **Durability:** 99.999999999% (11 nines)
- **Availability:** 99.95% (multi-region), 99.9% (single region)
- **Latency:** Milliseconds for first byte (even Archive -- unlike Glacier which takes hours)
- **API:** Same API for all classes (no restore step needed)

**Key difference from S3:** Archive class data is immediately accessible (no restore delay like S3 Glacier). You pay retrieval fees, but there is no waiting.

---

## Key Features

| Feature | Details |
| ------- | ------- |
| **Bucket location** | Region, dual-region, or multi-region |
| **Object versioning** | Keep historical versions (enabled per bucket) |
| **Signed URLs** | Time-limited access without authentication |
| **Object composition** | Combine up to 32 objects into one (server-side) |
| **Customer-managed encryption** | CMEK with Cloud KMS or customer-supplied keys |
| **Object holds** | Event-based or temporary holds (compliance) |
| **Retention policies** | Minimum retention period (regulatory compliance) |
| **Notifications** | Pub/Sub notifications on object changes |
| **Transfer** | Storage Transfer Service for cross-cloud/on-prem migration |

### Signed URLs

```python
from google.cloud import storage

client = storage.Client()
bucket = client.bucket("my-bucket")
blob = bucket.blob("uploads/photo.jpg")

# Generate signed URL (valid for 1 hour)
url = blob.generate_signed_url(
    version="v4",
    expiration=datetime.timedelta(hours=1),
    method="PUT",  # or "GET" for download
    content_type="image/jpeg",
)
# Client can upload directly to this URL
```

---

## Lifecycle Management

```json
{
  "rule": [
    {
      "action": { "type": "SetStorageClass", "storageClass": "NEARLINE" },
      "condition": { "age": 30, "matchesStorageClass": ["STANDARD"] }
    },
    {
      "action": { "type": "SetStorageClass", "storageClass": "COLDLINE" },
      "condition": { "age": 90, "matchesStorageClass": ["NEARLINE"] }
    },
    {
      "action": { "type": "Delete" },
      "condition": { "age": 365 }
    },
    {
      "action": { "type": "Delete" },
      "condition": { "isLive": false, "numNewerVersions": 3 }
    }
  ]
}
```

---

## Access Control

| Method | Scope | Use Case |
| ------ | ----- | -------- |
| **Uniform bucket-level** | IAM roles on bucket | Recommended, simplest |
| **Fine-grained (ACLs)** | Per-object ACLs | Legacy, avoid for new buckets |
| **Signed URLs** | Time-limited, per-object | Pre-authenticated access |
| **Public access** | `allUsers` or `allAuthenticatedUsers` | Static website hosting |

---

## Comparison with S3

| Feature | Cloud Storage | S3 |
| ------- | ------------- | -- |
| **Storage classes** | 4 (Standard, Nearline, Coldline, Archive) | 7 (Standard, IA, One Zone-IA, Glacier, etc.) |
| **Archive access** | Immediate (ms latency) | Glacier: minutes to hours |
| **Bucket namespace** | Global (unique across all GCP) | Global (unique across all AWS) |
| **Consistency** | Strong (read-after-write) | Strong (since Dec 2020) |
| **Max object** | 5 TB | 5 TB |
| **Multipart upload** | XML API or object composition | Native multipart |
| **Events** | Pub/Sub notifications | S3 Events, EventBridge |
| **CDN** | Cloud CDN | CloudFront |
| **Egress pricing** | ~$0.12/GB | ~$0.09/GB |
| **Free tier** | 5 GB Standard | 5 GB Standard |

---

## Common Interview Questions

1. **How do Cloud Storage classes differ from S3 tiers?** GCP has 4 classes, all with immediate access (including Archive). S3 has 7 classes; Glacier/Deep Archive require restore operations (minutes to hours). GCP is simpler; S3 offers more granularity.

2. **What is the difference between region, dual-region, and multi-region buckets?** Region: single location, lowest cost. Dual-region: two specific locations, auto-replication, higher availability. Multi-region: broad area (US, EU, Asia), highest availability, highest cost.

3. **How do you secure Cloud Storage?** Uniform bucket-level access (IAM), signed URLs for temporary access, VPC Service Controls to restrict access to a VPC perimeter, customer-managed encryption keys (CMEK), and retention policies for compliance.

4. **When would you use object versioning?** When you need to recover from accidental deletions or overwrites. Compliance requirements. Keeping history of configuration files. Cost: storage for all versions (use lifecycle rules to limit old versions).
