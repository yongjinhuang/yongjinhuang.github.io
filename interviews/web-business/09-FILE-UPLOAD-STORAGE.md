# File Upload & Storage

## What Is It?

File upload and storage is how your app handles files that users send to you — profile pictures, documents, videos, spreadsheets, CSVs, whatever. It covers the entire journey: the user picks a file, it gets uploaded, processed (resized, scanned, transcoded), stored somewhere, and served back when needed. It sounds straightforward, but at scale it involves CDNs, object storage, access control, virus scanning, and cost management.

## Why Should You Care?

Almost every app eventually needs file uploads. Profile avatars, document attachments, image galleries, CSV imports, video uploads — they're everywhere. The naive approach (save files to your server's disk) works in development but falls apart in production. Files eat disk space, slow down your server, and become a single point of failure. Understanding the business and infrastructure patterns helps you build something that scales without burning money.

## How It Works (The Business Flow)

### Simple Upload Flow

1. User selects a file via `<input type="file">` or drag-and-drop
2. Client validates: Is the file type allowed? Is it under the size limit?
3. File is sent to the server (as `multipart/form-data`)
4. Server validates again: file type, size, content (don't trust the client)
5. Server saves the file to object storage (S3, GCS, Azure Blob)
6. Server stores the file URL/path in the database
7. File is served back to users via a CDN

### Direct Upload (Presigned URL)

For large files, you don't want to route through your server:

1. Client requests an upload URL from your server
2. Server generates a presigned URL from the storage provider (S3 presigned URL)
3. Client uploads directly to the storage provider using the presigned URL
4. Storage provider notifies your server when upload completes (or client confirms)
5. Server records the file metadata

**Why this matters:** Your server never handles the file bytes. No memory pressure, no bandwidth cost, no upload timeout issues.

### Image Processing

1. User uploads a photo (could be a 10MB JPEG from their phone)
2. System creates multiple versions: thumbnail (100x100), medium (800x600), large (1920x1080)
3. Format conversion: JPEG → WebP (smaller file size, better quality)
4. Metadata stripping: Remove EXIF data (which might contain GPS coordinates)
5. All versions stored in object storage, URLs recorded in database
6. Frontend requests the appropriate size based on context

### File Serving

1. File URL is typically a CDN URL (e.g., `cdn.yourapp.com/images/abc123.webp`)
2. CDN caches the file at edge locations globally
3. First request: CDN fetches from storage (origin). Subsequent requests: served from cache
4. Cache headers control how long files are cached
5. For private files: use signed URLs with expiration times

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Object Storage** | Cloud storage for files (S3, GCS, Azure Blob). Cheap, durable, scalable. Not a filesystem — stores objects with keys |
| **S3** | Amazon Simple Storage Service — the most popular object storage. "S3-compatible" APIs are an industry standard |
| **Bucket** | A container in object storage. Like a top-level folder. You might have buckets for `uploads`, `avatars`, `documents` |
| **Presigned URL** | A temporary URL that grants permission to upload or download a specific file. Expires after a set time |
| **CDN** | Content Delivery Network — distributes files globally. Users download from the nearest server |
| **MIME Type** | The file type identifier (e.g., `image/jpeg`, `application/pdf`). Used for validation and serving |
| **Multipart Upload** | Uploading large files in chunks. Allows resume after failure |
| **Blob** | Binary Large Object — the raw file data |
| **EXIF Data** | Metadata embedded in images (camera model, GPS location, timestamp). Privacy concern |
| **Transcoding** | Converting files from one format to another (video: MP4 to HLS, image: PNG to WebP) |
| **Lifecycle Policy** | Rules for automatically transitioning files between storage tiers or deleting old files |
| **Storage Class** | Different pricing/performance tiers (S3 Standard, S3 Infrequent Access, Glacier) |

## Common Patterns

### Pattern 1: Server-Side Upload

File goes through your server to storage. Simple, works for small files.

```
Client → Your Server → Object Storage (S3)
```

**When it's used:** Small files (avatars, thumbnails), when you need to process files before storing.

**Trade-off:** Server becomes a bottleneck. Memory usage spikes during large uploads.

### Pattern 2: Direct Upload (Presigned URL)

Client uploads directly to storage. Your server only generates the upload URL.

```
Client → Your Server (get presigned URL) → Client → S3 (upload) → Your Server (confirm)
```

**When it's used:** Large files, video uploads, any high-traffic app.

**Trade-off:** Slightly more complex client code. Need to handle upload confirmation.

### Pattern 3: Image Processing Pipeline

Upload triggers a processing pipeline that generates variants.

```
Upload → S3 → Lambda/Worker → Generate thumbnails → Store variants → Update database
```

**When it's used:** Apps with lots of images (social media, e-commerce, real estate listings).

**Trade-off:** Async processing means variants aren't immediately available. Show a placeholder until processing completes.

### Pattern 4: On-the-Fly Transformation

Images are transformed at request time based on URL parameters. No pre-generated variants.

```
https://cdn.example.com/images/photo.jpg?w=200&h=200&fit=crop
```

**When it's used:** When you need many size variations or don't know sizes in advance. Cloudinary, imgix, Cloudflare Image Resizing.

**Trade-off:** First request is slow (transformation happens in real-time). CDN caches subsequent requests.

## Gotchas & Edge Cases

- **Never trust file extensions**: A `.jpg` file might actually be an executable. Validate MIME types by reading file headers (magic bytes), not just the extension.
- **File size limits**: Set limits at every level — client-side validation, server middleware, storage policy. A missing limit means someone uploads a 10GB file and crashes your server.
- **Filename sanitization**: User filenames can contain special characters, spaces, unicode, even path traversal attempts (`../../etc/passwd`). Generate your own filenames (UUIDs) and store the original name as metadata.
- **Virus scanning**: For user-uploaded documents, scan with an antivirus service before making them available. ClamAV is common for self-hosted, or use a cloud scanning service.
- **Storage costs add up**: A million users uploading 5MB each = 5TB. At $0.023/GB/month (S3 Standard), that's $115/month just for storage. Plus data transfer costs. Use lifecycle policies to move old files to cheaper tiers.
- **Orphaned files**: User uploads a file, then navigates away without saving the form. The file exists in storage but isn't referenced by anything. Run periodic cleanup jobs.
- **Private files**: Not everything should be publicly accessible. Medical records, financial documents, private photos need access control. Use signed URLs with short expiration.
- **Resumable uploads**: For large files over flaky connections, support resumable uploads. The TUS protocol is a standard for this.
- **Duplicate detection**: Users upload the same file multiple times. Hash files on upload and deduplicate to save storage.

## Quick Reference

| File Type | Best Approach |
|-----------|---------------|
| Small images (<5MB) | Server-side upload + background processing |
| Large images / videos | Direct upload (presigned URL) + async processing |
| Documents (PDF, DOCX) | Server-side upload + virus scan |
| Bulk CSV imports | Direct upload + background job for processing |
| User avatars | Server-side upload + on-the-fly resize |

| Storage Tier | Use Case | Cost (S3, approx.) |
|-------------|----------|-------------------|
| Standard | Frequently accessed files | $0.023/GB/month |
| Infrequent Access | Backups, old uploads | $0.0125/GB/month |
| Glacier | Archival, legal retention | $0.004/GB/month |
