# Cloudflare R2 Object Storage

R2 is Cloudflare's S3-compatible object storage with **zero egress fees**. This is a game-changer -- AWS S3 egress fees are often the largest surprise on cloud bills. R2 uses the same S3 API, so migrating is straightforward.

---

## Table of Contents

1. [Why R2?](#why-r2)
2. [S3 Compatibility](#s3-compatibility)
3. [Architecture](#architecture)
4. [Operations](#operations)
5. [Lifecycle Policies](#lifecycle-policies)
6. [Public Access and Custom Domains](#public-access-and-custom-domains)
7. [Workers Integration](#workers-integration)
8. [Comparison with S3 and GCS](#comparison-with-s3-and-gcs)
9. [Common Interview Questions](#common-interview-questions)

---

## Why R2?

```
AWS S3 Cost Breakdown (typical):
  Storage: $0.023/GB/month    -- reasonable
  PUT/GET:  $0.005/1000       -- reasonable
  Egress:   $0.09/GB          -- THIS IS THE PROBLEM

  Example: 10TB stored, 100TB egress/month
    Storage: $230/month
    Egress:  $9,000/month     <-- 97% of cost is egress!

Cloudflare R2:
  Storage: $0.015/GB/month    -- cheaper than S3
  PUT/GET:  $0.0036/1000      -- comparable
  Egress:   $0                -- FREE
```

---

## S3 Compatibility

R2 implements the S3 API, so most S3 SDKs and tools work:

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: "https://<account_id>.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// Upload
await client.send(new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/photo.jpg",
  Body: fileBuffer,
  ContentType: "image/jpeg",
}));

// Download
const response = await client.send(new GetObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/photo.jpg",
}));
```

### What's Supported

| S3 Feature | R2 Support |
| ---------- | ---------- |
| PUT/GET/DELETE/HEAD | Yes |
| Multipart upload | Yes |
| Presigned URLs | Yes |
| Object metadata | Yes |
| Conditional operations (If-Match, If-None-Match) | Yes |
| Bucket lifecycle rules | Yes |
| Event notifications | Yes (via Workers) |
| Object versioning | No |
| Cross-region replication | No (automatic global distribution) |
| S3 Select | No |
| Bucket policies | Limited |

---

## Architecture

```
+----------------------------------------------------------+
|                    Cloudflare R2                           |
|                                                           |
|  +--------------------------------------------------+    |
|  | Bucket: "my-uploads"                              |    |
|  | +--------+  +--------+  +--------+  +--------+   |    |
|  | | Object | | Object  | | Object | | Object  |   |    |
|  | | /a.jpg | | /b.pdf  | | /c.mp4 | | /d.json |   |    |
|  | +--------+  +--------+  +--------+  +--------+   |    |
|  +--------------------------------------------------+    |
|                                                           |
|  Access Methods:                                          |
|  1. S3 API (external) -> https://<id>.r2.cloudflarestorage.com |
|  2. Workers binding (edge) -> env.MY_BUCKET.get("key")   |
|  3. Public URL -> https://pub-<hash>.r2.dev/key          |
|  4. Custom domain -> https://assets.example.com/key      |
+----------------------------------------------------------+
```

### Storage Characteristics

| Feature | Details |
| ------- | ------- |
| **Durability** | 99.999999999% (11 nines, same as S3) |
| **Availability** | 99.99% |
| **Max object size** | 5 TB (single upload: 5 GB, multipart: 5 TB) |
| **Max bucket size** | Unlimited |
| **Regions** | Automatic (no region selection needed) |
| **Encryption** | At-rest encryption by default |

---

## Operations

### Multipart Upload

For objects larger than 5 GB (or for reliability with large files):

```javascript
// 1. Create multipart upload
const { UploadId } = await client.send(new CreateMultipartUploadCommand({
  Bucket: "my-bucket", Key: "large-file.zip"
}));

// 2. Upload parts (min 5 MB per part, except last)
const parts = [];
for (let i = 0; i < chunks.length; i++) {
  const { ETag } = await client.send(new UploadPartCommand({
    Bucket: "my-bucket", Key: "large-file.zip",
    UploadId, PartNumber: i + 1, Body: chunks[i]
  }));
  parts.push({ ETag, PartNumber: i + 1 });
}

// 3. Complete
await client.send(new CompleteMultipartUploadCommand({
  Bucket: "my-bucket", Key: "large-file.zip",
  UploadId, MultipartUpload: { Parts: parts }
}));
```

### Presigned URLs

```javascript
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Upload presigned URL (client can PUT directly)
const uploadUrl = await getSignedUrl(client,
  new PutObjectCommand({ Bucket: "my-bucket", Key: "user-upload.jpg" }),
  { expiresIn: 3600 } // 1 hour
);

// Download presigned URL
const downloadUrl = await getSignedUrl(client,
  new GetObjectCommand({ Bucket: "my-bucket", Key: "file.pdf" }),
  { expiresIn: 3600 }
);
```

---

## Lifecycle Policies

```javascript
// Automatically delete objects after 90 days
await client.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: "my-bucket",
  LifecycleConfiguration: {
    Rules: [{
      ID: "delete-old-logs",
      Filter: { Prefix: "logs/" },
      Status: "Enabled",
      Expiration: { Days: 90 }
    }]
  }
}));
```

R2 does not have storage classes (no equivalent to S3 Glacier/Infrequent Access). All objects are stored at the same tier. For archival, you would need to use a different service.

---

## Public Access and Custom Domains

### r2.dev Public URL

```
Enable public access on bucket:
  https://pub-<hash>.r2.dev/my-file.jpg

Limitations:
  - Rate limited
  - No custom domain
  - No cache control
```

### Custom Domain (Recommended)

```
1. Add CNAME: assets.example.com -> <bucket>.r2.cloudflarestorage.com
2. Enable "Public Access" on bucket
3. Configure cache rules for the custom domain

Result:
  https://assets.example.com/images/photo.jpg
  - Cached at Cloudflare edge (CDN)
  - Custom cache headers
  - SSL included
```

---

## Workers Integration

Accessing R2 from Workers is the fastest path -- no network hop, direct binding:

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // Remove leading /

    switch (request.method) {
      case "GET": {
        const object = await env.MY_BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404 });

        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
            "ETag": object.httpEtag,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      case "PUT": {
        await env.MY_BUCKET.put(key, request.body, {
          httpMetadata: { contentType: request.headers.get("Content-Type") },
          customMetadata: { uploadedBy: "api" },
        });
        return new Response("Created", { status: 201 });
      }

      case "DELETE": {
        await env.MY_BUCKET.delete(key);
        return new Response("Deleted", { status: 200 });
      }
    }
  },
};
```

---

## Comparison with S3 and GCS

| Feature | R2 | S3 | GCS |
| ------- | -- | -- | --- |
| **Egress** | Free | $0.09/GB | $0.12/GB |
| **Storage** | $0.015/GB | $0.023/GB | $0.020/GB |
| **API** | S3-compatible | Native | S3-compatible + native |
| **Storage classes** | Single tier | 7 classes (Glacier, etc.) | 4 classes |
| **Versioning** | No | Yes | Yes |
| **Event notifications** | Workers bindings | S3 Events, EventBridge | Pub/Sub |
| **Regions** | Automatic | Must choose region | Must choose region |
| **CDN integration** | Native (Cloudflare CDN) | CloudFront (separate) | Cloud CDN (separate) |
| **Max object** | 5 TB | 5 TB | 5 TB |
| **Durability** | 11 nines | 11 nines | 11 nines |
| **Edge compute** | Workers binding (direct) | Lambda (via events) | Cloud Functions |

---

## Common Interview Questions

1. **Why is R2 cheaper than S3?** Zero egress fees. S3 egress ($0.09/GB) is often 80-97% of S3 bills. R2 also has lower storage costs ($0.015 vs $0.023/GB). Cloudflare can do this because serving from their own edge network costs them less.

2. **Is R2 a drop-in replacement for S3?** For most use cases, yes. R2 implements the S3 API. However, R2 lacks versioning, S3 Select, and storage classes (no Glacier equivalent). Check your specific S3 features before migrating.

3. **How would you migrate from S3 to R2?** Use `rclone` or the S3-compatible API with a migration script. Set up dual-write (write to both S3 and R2) during migration. After verification, cut over reads. R2 also supports S3-to-R2 Super Slurper for bulk migration.

4. **When would you still use S3 over R2?** Need versioning, storage classes (Glacier for archival), S3 Select, tight AWS integration (Lambda triggers, Athena queries), or complex bucket policies.

5. **How does R2 integrate with Workers?** Through environment bindings. Workers access R2 directly without a network hop -- `env.MY_BUCKET.get(key)` returns the object. This is faster than calling the S3 API externally.
