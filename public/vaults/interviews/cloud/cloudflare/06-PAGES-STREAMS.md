# Cloudflare Pages & Stream

Pages is Cloudflare's Jamstack deployment platform, and Stream is its video encoding and delivery service. Both are built on Cloudflare's edge network for low-latency global delivery.

---

## Table of Contents

1. [Cloudflare Pages](#cloudflare-pages)
2. [Pages Functions](#pages-functions)
3. [Cloudflare Stream](#cloudflare-stream)
4. [Cloudflare Images](#cloudflare-images)
5. [Common Interview Questions](#common-interview-questions)

---

## Cloudflare Pages

### What Is Pages?

A Git-integrated deployment platform for static sites and full-stack applications. Think Vercel/Netlify but on Cloudflare's edge network.

```
Git Push -> Build Pipeline -> Deploy to 300+ Edge PoPs
  |
  v
+------------------+     +------------------+     +------------------+
| GitHub/GitLab    | --> | Cloudflare Build | --> | Edge Network     |
| (source)         |     | (CI/CD)          |     | (300+ PoPs)      |
+------------------+     +------------------+     +------------------+
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Git integration** | GitHub and GitLab (auto-deploy on push) |
| **Preview deployments** | Every PR gets a unique URL |
| **Rollbacks** | Instant rollback to any previous deployment |
| **Custom domains** | Free SSL, automatic DNS configuration |
| **Build frameworks** | Next.js, Nuxt, Astro, SvelteKit, Remix, Hugo, etc. |
| **Build limits** | 500 builds/month (free), 5000 (pro) |
| **Bandwidth** | Unlimited (free) |

### Framework Support

| Framework | SSR on Pages? | Static Export? |
| --------- | ------------- | -------------- |
| **Next.js** | Yes (via @cloudflare/next-on-pages) | Yes |
| **Nuxt** | Yes (nitro preset) | Yes |
| **Astro** | Yes (Cloudflare adapter) | Yes |
| **SvelteKit** | Yes (Cloudflare adapter) | Yes |
| **Remix** | Yes (Cloudflare template) | N/A |
| **Hugo/11ty** | N/A (static only) | Yes |

### Configuration (wrangler.toml)

```toml
name = "my-site"
pages_build_output_dir = "./dist"

# Environment variables
[vars]
API_URL = "https://api.example.com"

# Bindings (same as Workers)
[[kv_namespaces]]
binding = "CACHE"
id = "abc123"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "my-assets"

[[d1_databases]]
binding = "DB"
database_id = "def456"
```

---

## Pages Functions

Pages Functions bring serverless compute to Pages, using the same Workers runtime.

```
Project structure:
  my-site/
  ├── functions/
  │   ├── api/
  │   │   ├── users.ts        -> /api/users
  │   │   ├── users/[id].ts   -> /api/users/:id
  │   │   └── _middleware.ts   -> middleware for /api/*
  │   └── _middleware.ts       -> middleware for all routes
  ├── public/
  │   └── index.html
  └── wrangler.toml
```

```typescript
// functions/api/users.ts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const users = await context.env.DB.prepare("SELECT * FROM users").all();
  return Response.json(users.results);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json();
  await context.env.DB.prepare(
    "INSERT INTO users (name, email) VALUES (?, ?)"
  ).bind(body.name, body.email).run();
  return new Response("Created", { status: 201 });
};

// functions/api/users/[id].ts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { id } = context.params;
  const user = await context.env.DB.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).bind(id).first();
  if (!user) return new Response("Not Found", { status: 404 });
  return Response.json(user);
};
```

### Middleware

```typescript
// functions/_middleware.ts
export const onRequest: PagesFunction = async (context) => {
  // Run before the page function
  const token = context.request.headers.get("Authorization");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Continue to page function
  const response = await context.next();

  // Modify response
  response.headers.set("X-Custom-Header", "value");
  return response;
};
```

---

## Cloudflare Stream

Managed video platform for encoding, storage, and delivery.

```
Upload -> Encode -> Store -> Deliver via Edge
  |         |        |          |
  v         v        v          v
+---------+--------+--------+---------+
| API/tus | HLS/   | R2     | CDN     |
| upload  | DASH   | backed | (300+   |
|         | encode |        | PoPs)   |
+---------+--------+--------+---------+
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Encoding** | Automatic adaptive bitrate (HLS/DASH) |
| **Upload** | Direct upload, tus (resumable), URL pull |
| **Player** | Embeddable player (iframe or Stream SDK) |
| **Live streaming** | RTMPS/SRT input, HLS output |
| **Storage** | Included in pricing (no separate storage cost) |
| **Analytics** | Views, watch time, quality metrics |
| **Access control** | Signed URLs, signed tokens (time-limited) |
| **Captions** | Auto-generated or uploaded SRT/VTT |

### Pricing

```
Storage:  $5/1000 minutes stored
Delivery: $1/1000 minutes viewed
Encoding: included

Example: 100 hours stored, 10,000 hours viewed/month
  Storage:  100 * 60 / 1000 * $5 = $30
  Delivery: 10,000 * 60 / 1000 * $1 = $600
```

### Usage

```javascript
// Upload via API
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: formData, // video file
  }
);

// Direct creator upload (presigned URL)
const { uploadURL } = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ maxDurationSeconds: 3600 }),
  }
).then(r => r.json()).then(d => d.result);

// Embed
// <iframe src="https://customer-<code>.cloudflarestream.com/<video_id>/iframe" />
```

---

## Cloudflare Images

On-the-fly image transformation and delivery.

```
Original image (R2 or URL)
     |
     v
+------------------+
| Cloudflare Images|  <-- Transform on first request, cache at edge
+------------------+
     |
     v
Variants:
  /thumbnail  -> 150x150, fit=cover
  /hero       -> 1920x1080, fit=contain
  /avatar     -> 200x200, fit=crop, gravity=face

URL format:
  https://imagedelivery.net/<account_hash>/<image_id>/thumbnail
```

| Feature | Details |
| ------- | ------- |
| **Transformations** | Resize, crop, blur, format conversion, quality |
| **Formats** | WebP, AVIF auto-negotiation |
| **Variants** | Named presets (thumbnail, hero, etc.) |
| **Storage** | $5/100K images stored |
| **Delivery** | $1/100K images delivered |

---

## Common Interview Questions

1. **How does Cloudflare Pages compare to Vercel?** Both support Git-integrated deployment and SSR. Pages runs on Cloudflare's edge (300+ PoPs) with unlimited bandwidth on the free tier. Vercel has better Next.js integration (they created Next.js). Pages has native access to Workers, KV, R2, D1.

2. **What are Pages Functions?** File-based serverless functions within a Pages project. They use the Workers runtime and have access to all Cloudflare bindings (KV, R2, D1, Durable Objects). Routes are defined by file structure in the `/functions` directory.

3. **How does Cloudflare Stream handle adaptive bitrate?** Stream automatically encodes uploaded videos into multiple bitrates and resolutions. The player uses HLS/DASH to switch between quality levels based on the viewer's bandwidth and device capability.

4. **When would you use Cloudflare Stream vs self-hosting video?** Stream when you want managed encoding, storage, and delivery without managing FFmpeg, CDN config, or player development. Self-host when you need full control over encoding settings, custom players, or have very specific compliance requirements.
