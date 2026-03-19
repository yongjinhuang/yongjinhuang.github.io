# API Design

## Overview

API design is the backbone of full-stack engineering. Every interaction between a client and a server, between services, and between your system and the outside world flows through APIs. In full-stack interviews, API design reveals whether you understand how data moves through a system, how to balance flexibility with simplicity, and how to build interfaces that other developers can use correctly without reading the source code.

Strong API design skills demonstrate that you can think about contracts between systems, handle edge cases gracefully, and build APIs that evolve over time without breaking existing consumers.

---

## Core Concepts

### REST Conventions

REST (Representational State Transfer) is the most widely used API style. While REST is not a strict standard, there are strong conventions that interviewers expect you to know.

#### Resource Naming

```
GOOD (nouns, plural, hierarchical):
GET    /api/users                    → List users
GET    /api/users/123                → Get user 123
POST   /api/users                    → Create a user
PATCH  /api/users/123                → Update user 123
DELETE /api/users/123                → Delete user 123
GET    /api/users/123/orders         → List orders for user 123
GET    /api/users/123/orders/456     → Get order 456 for user 123

BAD (verbs, inconsistent):
GET    /api/getUsers
POST   /api/createUser
GET    /api/user/123/getOrders
POST   /api/deleteUser/123
```

#### HTTP Methods

```
GET     → Read a resource. Must be idempotent and safe.
         No side effects. Cacheable.

POST    → Create a new resource. Not idempotent.
         Returns 201 Created with Location header.

PUT     → Replace a resource entirely. Idempotent.
         Client sends the full resource representation.

PATCH   → Partially update a resource. Not necessarily idempotent.
         Client sends only the fields to change.

DELETE  → Remove a resource. Idempotent.
         Returns 204 No Content or 200 with confirmation.

HEAD    → Same as GET but returns only headers. Useful for checking
         if a resource exists or for cache validation.

OPTIONS → Returns allowed methods. Used for CORS preflight.
```

#### HTTP Status Codes

```
2xx Success:
├── 200 OK             → General success (GET, PATCH, DELETE)
├── 201 Created        → Resource created (POST)
├── 202 Accepted       → Request accepted for async processing
├── 204 No Content     → Success with no response body (DELETE)

3xx Redirection:
├── 301 Moved Permanently  → Resource URL changed permanently
├── 304 Not Modified       → Client cache is still valid

4xx Client Errors:
├── 400 Bad Request        → Invalid input / validation error
├── 401 Unauthorized       → Authentication required (not logged in)
├── 403 Forbidden          → Authenticated but not authorized
├── 404 Not Found          → Resource does not exist
├── 405 Method Not Allowed → HTTP method not supported on this endpoint
├── 409 Conflict           → State conflict (duplicate, version mismatch)
├── 413 Payload Too Large  → Request body exceeds size limit
├── 422 Unprocessable      → Semantically invalid (valid JSON but bad data)
├── 429 Too Many Requests  → Rate limit exceeded

5xx Server Errors:
├── 500 Internal Error     → Unexpected server failure
├── 502 Bad Gateway        → Upstream service failure
├── 503 Service Unavailable → Server overloaded or in maintenance
├── 504 Gateway Timeout    → Upstream service timeout
```

#### Pagination

```
Offset-based (simple, but problematic at scale):
GET /api/posts?page=2&limit=20

Response:
{
  "data": [...],
  "meta": {
    "total": 1543,
    "page": 2,
    "limit": 20,
    "totalPages": 78
  }
}

Problem: Page drift when items are inserted/deleted between requests.


Cursor-based (stable, efficient for large datasets):
GET /api/posts?cursor=eyJpZCI6MTAwfQ&limit=20

Response:
{
  "data": [...],
  "meta": {
    "nextCursor": "eyJpZCI6MTIwfQ",
    "hasMore": true
  }
}

How cursors work:
- Cursor encodes the last item's sort key (usually base64-encoded)
- Server decodes cursor and queries WHERE id > cursor_value
- Stable even when items are added or removed
- Cannot jump to arbitrary pages (trade-off)
```

#### Filtering and Sorting

```
Filtering:
GET /api/products?category=electronics&minPrice=100&maxPrice=500
GET /api/products?status=active&createdAfter=2025-01-01

Sorting:
GET /api/products?sort=price        → Ascending by price
GET /api/products?sort=-price       → Descending by price (prefix with -)
GET /api/products?sort=-created_at,title  → Multiple sort fields

Field Selection (sparse fieldsets):
GET /api/users/123?fields=id,name,email
→ Returns only requested fields (reduces payload)
```

#### API Versioning

```
URL Path Versioning (most common, explicit):
GET /api/v1/users
GET /api/v2/users

Header Versioning (cleaner URLs, harder to test):
GET /api/users
Accept: application/vnd.myapp.v2+json

Query Parameter Versioning (easy but pollutes URL):
GET /api/users?version=2

Recommendation:
- Use URL path versioning for public APIs
- Use header versioning for internal APIs
- Only increment major version for breaking changes
- Support at least 2 versions simultaneously during migration
```

### Request and Response Design

#### Consistent Response Envelope

```typescript
// Success response
{
  "success": true,
  "data": {
    "id": "abc-123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email address",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      }
    ]
  }
}

// List response with pagination
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

#### Error Handling Patterns

```typescript
// Centralized error handler (Express)
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Specific error factories
function notFound(resource: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`);
}

function validationError(details: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details);
}

function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

function forbidden(message = 'Insufficient permissions'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

// Error handling middleware
function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // Unexpected errors - log full details but return generic message
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

### Idempotency

Idempotency means that making the same request multiple times produces the same result as making it once. This is critical for reliability in distributed systems.

```
Naturally idempotent methods:
├── GET    → Reading never changes state
├── PUT    → Replacing with same data yields same result
├── DELETE → Deleting an already-deleted resource is a no-op
└── HEAD   → Same as GET

Not naturally idempotent:
├── POST   → Creating twice creates two resources
└── PATCH  → Incrementing a counter twice gives different results
```

**Idempotency key pattern for POST requests**:

```typescript
// Client sends an idempotency key
// POST /api/payments
// Headers: Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

async function handlePayment(req: Request, res: Response) {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required',
      },
    });
  }

  // Check if we already processed this request
  const existing = await cache.get(`idempotency:${idempotencyKey}`);
  if (existing) {
    return res.status(200).json(JSON.parse(existing));
  }

  // Process the payment
  const result = await processPayment(req.body);

  // Store the result with TTL (24 hours)
  const response = { success: true, data: result };
  await cache.set(
    `idempotency:${idempotencyKey}`,
    JSON.stringify(response),
    'EX',
    86400
  );

  return res.status(201).json(response);
}
```

### Rate Limiting

```typescript
// Token bucket algorithm with Redis
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;

  const pipeline = redis.pipeline();
  pipeline.incr(windowKey);
  pipeline.expire(windowKey, windowSeconds);

  const results = await pipeline.exec();
  const count = results?.[0]?.[1] as number;

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetAt: (Math.floor(now / windowSeconds) + 1) * windowSeconds,
  };
}

// Middleware
function rateLimiter(maxRequests: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip;
    const result = await checkRateLimit(key, maxRequests, windowSeconds);

    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
        },
      });
    }

    next();
  };
}
```

### GraphQL

#### Schema Design

```graphql
type Query {
  user(id: ID!): User
  users(filter: UserFilter, pagination: PaginationInput): UserConnection!
  post(id: ID!): Post
  posts(filter: PostFilter, pagination: PaginationInput): PostConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
  createPost(input: CreatePostInput!): CreatePostPayload!
}

type User {
  id: ID!
  name: String!
  email: String!
  posts(first: Int, after: String): PostConnection!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments(first: Int, after: String): CommentConnection!
  createdAt: DateTime!
}

# Relay-style pagination
type PostConnection {
  edges: [PostEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type PostEdge {
  node: Post!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Input types
input CreateUserInput {
  name: String!
  email: String!
  password: String!
}

input UserFilter {
  name: String
  email: String
  createdAfter: DateTime
}

input PaginationInput {
  first: Int
  after: String
}

# Payload types (allow returning errors alongside data)
type CreateUserPayload {
  user: User
  errors: [UserError!]
}

type UserError {
  field: String!
  message: String!
}
```

#### N+1 Problem and DataLoader

```typescript
// WITHOUT DataLoader: N+1 queries
// Query: { users { posts { title } } }
// 1 query for users + N queries for each user's posts

// WITH DataLoader: Batched queries
import DataLoader from 'dataloader';

function createLoaders() {
  return {
    postsByUserId: new DataLoader<string, Post[]>(async (userIds) => {
      // Single query: SELECT * FROM posts WHERE user_id IN ($1, $2, ...)
      const posts = await db.query(
        'SELECT * FROM posts WHERE user_id = ANY($1)',
        [userIds]
      );

      // Group posts by user_id, maintaining order of input userIds
      const postsByUser = new Map<string, Post[]>();
      for (const post of posts.rows) {
        const existing = postsByUser.get(post.user_id) || [];
        postsByUser.set(post.user_id, [...existing, post]);
      }

      return userIds.map((id) => postsByUser.get(id) || []);
    }),
  };
}

// Resolver
const resolvers = {
  User: {
    posts: (
      parent: User,
      _args: unknown,
      context: { loaders: ReturnType<typeof createLoaders> }
    ) => {
      return context.loaders.postsByUserId.load(parent.id);
    },
  },
};
```

### gRPC Basics

```protobuf
// user.proto
syntax = "proto3";

package user;

service UserService {
  // Unary RPC
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);

  // Server streaming RPC
  rpc ListUsers(ListUsersRequest) returns (stream User);

  // Client streaming RPC
  rpc UploadUserPhotos(stream PhotoChunk) returns (UploadResult);

  // Bidirectional streaming RPC
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  int64 created_at = 4;
}

message GetUserRequest {
  string id = 1;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}
```

**When to use each API style**:

```
REST:
├── Public APIs consumed by third parties
├── CRUD-heavy applications
├── When cacheability is important (HTTP caching)
├── Wide tooling and ecosystem support
└── Teams familiar with HTTP semantics

GraphQL:
├── Complex data requirements (mobile apps needing different views)
├── Rapidly evolving frontends
├── Multiple client types (web, iOS, Android)
├── When over-fetching/under-fetching is a real problem
└── Teams willing to invest in schema design

gRPC:
├── Internal service-to-service communication
├── High performance requirements (binary protocol)
├── Strongly typed contracts are critical
├── Streaming data (real-time, file uploads)
└── Polyglot environments (proto generates code for many languages)
```

### API Documentation (OpenAPI/Swagger)

```yaml
# openapi.yaml
openapi: 3.0.3
info:
  title: Task Management API
  version: 1.0.0
  description: API for managing tasks and projects

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: http://localhost:3000/v1
    description: Development

paths:
  /tasks:
    get:
      summary: List tasks
      operationId: listTasks
      tags: [Tasks]
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [todo, in_progress, done]
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: List of tasks
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Task'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'

    post:
      summary: Create a task
      operationId: createTask
      tags: [Tasks]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTaskInput'
      responses:
        '201':
          description: Task created
        '400':
          description: Validation error
        '401':
          description: Unauthorized

components:
  schemas:
    Task:
      type: object
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
        status:
          type: string
          enum: [todo, in_progress, done]
        createdAt:
          type: string
          format: date-time

    CreateTaskInput:
      type: object
      required: [title]
      properties:
        title:
          type: string
          minLength: 1
          maxLength: 255
        description:
          type: string
        assigneeId:
          type: string
          format: uuid

    PaginationMeta:
      type: object
      properties:
        total:
          type: integer
        page:
          type: integer
        limit:
          type: integer
        totalPages:
          type: integer

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## Practical Scenarios

### Scenario 1: Designing an E-Commerce API

**Requirements**: Build an API for an e-commerce platform with products, orders, and payments.

```
Resource Design:

Products:
  GET    /api/v1/products                  → List products
  GET    /api/v1/products/:id              → Get product details
  GET    /api/v1/products/:id/reviews      → Get product reviews
  POST   /api/v1/products                  → Create product (admin)
  PATCH  /api/v1/products/:id              → Update product (admin)

Orders:
  GET    /api/v1/orders                    → List user's orders
  GET    /api/v1/orders/:id                → Get order details
  POST   /api/v1/orders                    → Create order
  PATCH  /api/v1/orders/:id/cancel         → Cancel order

Payments:
  POST   /api/v1/orders/:id/payments       → Initiate payment
  GET    /api/v1/orders/:id/payments/:pid   → Get payment status

Cart:
  GET    /api/v1/cart                       → Get current cart
  POST   /api/v1/cart/items                 → Add item to cart
  PATCH  /api/v1/cart/items/:id             → Update cart item quantity
  DELETE /api/v1/cart/items/:id             → Remove from cart
```

**Key design decisions**:

```
1. Cart as a resource vs client-side state
   - Authenticated users: Server-side cart (persists across devices)
   - Guest users: Client-side cart (localStorage), merged on login

2. Order creation flow
   - POST /orders creates order from cart atomically
   - Stock is reserved (not deducted) at order creation
   - Stock is deducted when payment is confirmed
   - Reservation expires after 15 minutes

3. Payment handling
   - Payment is a sub-resource of order
   - Use idempotency keys for payment creation
   - Webhook from payment provider updates order status
   - Never store full card numbers (PCI compliance)
```

### Scenario 2: Evolving an API Without Breaking Clients

**Problem**: You need to change the user response from returning `name` (single string) to `firstName` and `lastName` (separate fields).

```
Strategy: Additive changes with deprecation

Step 1: Add new fields alongside old ones (non-breaking)
{
  "id": "123",
  "name": "John Doe",           // Keep for backwards compatibility
  "firstName": "John",          // New field
  "lastName": "Doe",            // New field
  "nameDeprecated": true        // Signal to clients
}

Step 2: Document deprecation
- Update API docs with deprecation notice
- Add Sunset header: Sunset: Sat, 01 Mar 2026 00:00:00 GMT
- Notify consumers via changelog / email

Step 3: Monitor usage of deprecated field
- Log when clients read the "name" field
- Track which clients have migrated

Step 4: Remove after migration period (typically 6-12 months)
- Remove "name" field
- Increment API version if removing in a breaking way
```

### Scenario 3: Handling File Uploads

```typescript
// Multipart upload endpoint
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          400,
          'INVALID_FILE_TYPE',
          'Only JPEG, PNG, and WebP images are allowed'
        )
      );
    }
  },
});

router.post(
  '/api/uploads',
  authenticate,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const key = `uploads/${req.user.id}/${Date.now()}-${req.file.originalname}`;

    const s3 = new S3Client({ region: process.env.AWS_REGION });
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    const upload = await db.query(
      'INSERT INTO uploads (key, filename, content_type, size, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        key,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      data: {
        id: upload.rows[0].id,
        url: `${process.env.CDN_URL}/${key}`,
        filename: req.file.originalname,
        size: req.file.size,
      },
    });
  }
);

// For large files: presigned URL approach
router.post('/api/uploads/presign', authenticate, async (req, res) => {
  const { filename, contentType } = req.body;
  const key = `uploads/${req.user.id}/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return res.json({
    success: true,
    data: {
      uploadUrl: presignedUrl,
      key,
    },
  });
});
```

---

## Interview Questions

### Q1: "Design a REST API for a blog platform. Walk me through your decisions."

**Strong answer**:

```
Resources and endpoints:

Posts:
  GET    /api/v1/posts                → List published posts
  GET    /api/v1/posts/:slug          → Get post by slug (SEO-friendly)
  POST   /api/v1/posts                → Create draft post
  PATCH  /api/v1/posts/:id            → Update post
  DELETE /api/v1/posts/:id            → Delete post
  POST   /api/v1/posts/:id/publish    → Publish a draft (action endpoint)

Comments:
  GET    /api/v1/posts/:id/comments   → List comments for a post
  POST   /api/v1/posts/:id/comments   → Add comment
  DELETE /api/v1/comments/:id         → Delete comment

Users:
  GET    /api/v1/users/:id            → Public profile
  PATCH  /api/v1/users/me             → Update own profile

Key decisions:
1. Use slug for public GET (better URLs, SEO), ID for mutations
2. Publish is an action (POST), not a PATCH to status
   - Publishing may trigger side effects (notifications, RSS update)
   - Action endpoints are appropriate when an operation has side effects
3. Comments are nested under posts for listing (natural hierarchy)
   but use flat path for deletion (no need to know the post ID)
4. /users/me convention for the authenticated user's own profile
5. Pagination defaults: page=1, limit=20, max limit=100
6. Sorting: ?sort=-publishedAt (newest first by default)
```

### Q2: "When would you choose GraphQL over REST?"

```
Choose GraphQL when:
1. Multiple clients with different data needs
   - Mobile needs minimal data (bandwidth)
   - Web dashboard needs rich data
   - GraphQL lets each client request exactly what it needs

2. Deeply nested, related data
   - A user's posts, their comments, the commenters' profiles
   - REST requires multiple roundtrips or complex include params
   - GraphQL fetches the entire graph in one request

3. Rapid frontend iteration
   - Frontend can add fields without backend changes
   - Schema serves as a living contract

4. When you have a strong type system culture
   - GraphQL schema generates types for clients
   - Catches contract mismatches at build time

Choose REST when:
1. Simple CRUD operations
   - REST maps naturally to database operations
   - Less overhead than a GraphQL layer

2. Caching is important
   - HTTP caching works naturally with REST (GET requests)
   - GraphQL typically uses POST, making HTTP caching harder

3. File uploads/downloads
   - REST handles multipart uploads and binary responses easily
   - GraphQL requires workarounds for file handling

4. Public API for third parties
   - REST is universally understood
   - Lower learning curve for consumers
   - Better tooling ecosystem (Postman, curl)

5. Simple, small team
   - REST requires less infrastructure
   - No need for a schema stitching layer
```

### Q3: "How do you handle API errors consistently?"

```
Three principles:
1. Machine-readable error codes (not just HTTP status codes)
2. Human-readable messages (for developers, not end users)
3. Structured details for validation errors

Error response shape:
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",       // Machine-readable, stable
    "message": "User with ID 123 not found",  // Human-readable
    "details": null                      // Additional context
  },
  "requestId": "req_abc123"             // For debugging
}

Validation error with details:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Must be a valid email" },
      { "field": "age", "message": "Must be at least 18" }
    ]
  }
}

Implementation:
- Define error codes in an enum or constants file
- Use middleware to catch and format all errors consistently
- Log the full error server-side, return safe details to the client
- Never expose stack traces, database errors, or internal paths
- Include a request ID for cross-referencing with server logs
```

### Q4: "Explain idempotency and why it matters for APIs."

```
Idempotency: Making the same request N times produces the same
result as making it once.

Why it matters:
- Network failures cause retries
- Mobile apps may send duplicate requests
- Message queues may deliver messages more than once
- Webhooks may fire multiple times
- Users may double-click submit buttons

Example: Payment processing
Without idempotency:
  POST /payments {amount: 100}  → Payment #1 created (Success)
  POST /payments {amount: 100}  → Payment #2 created (Double charge!)

With idempotency key:
  POST /payments
  Idempotency-Key: pay_abc123
  {amount: 100}                 → Payment #1 created (Success)

  POST /payments
  Idempotency-Key: pay_abc123
  {amount: 100}                 → Returns Payment #1 (No duplicate)

Implementation requirements:
1. Client generates a unique key per logical operation
2. Server stores the key and response for a TTL (24-72 hours)
3. On duplicate key, return the stored response
4. Use database transactions to prevent race conditions
5. Store in Redis or a dedicated idempotency table
```

### Q5: "How would you design an API for a real-time chat application?"

```
Hybrid approach: REST for CRUD + WebSocket for real-time

REST endpoints:
  GET    /api/v1/conversations              → List conversations
  POST   /api/v1/conversations              → Create conversation
  GET    /api/v1/conversations/:id/messages  → Historical messages (paginated)
  POST   /api/v1/conversations/:id/messages  → Send message (also via WebSocket)
  PATCH  /api/v1/conversations/:id/messages/:mid  → Edit message
  DELETE /api/v1/conversations/:id/messages/:mid  → Delete message

WebSocket events:
  Client → Server:
  - message:send    { conversationId, content, tempId }
  - message:typing  { conversationId }
  - message:read    { conversationId, messageId }

  Server → Client:
  - message:new     { message, conversationId }
  - message:updated { message, conversationId }
  - message:deleted { messageId, conversationId }
  - user:typing     { userId, conversationId }
  - user:online     { userId, status }

Key design decisions:
1. Messages sent via WebSocket for low latency,
   but also available via REST for reliability
2. Client generates a tempId so it can match
   the server response to the optimistic UI update
3. Historical messages loaded via REST with cursor pagination
4. Typing indicators sent via WebSocket with debounce
5. Read receipts batched and sent periodically
6. Offline messages delivered when user reconnects
```

### Q6: "What is the N+1 problem in APIs and how do you solve it?"

```
The N+1 problem: To fetch a list of N items with related data,
you make 1 query for the list + N queries for each item's related data.

Example:
GET /api/posts?include=author

Without optimization:
  Query 1: SELECT * FROM posts LIMIT 20           → 20 posts
  Query 2: SELECT * FROM users WHERE id = 1        → Author for post 1
  Query 3: SELECT * FROM users WHERE id = 2        → Author for post 2
  ...
  Query 21: SELECT * FROM users WHERE id = 15      → Author for post 20
  Total: 21 queries

Solutions:

1. Eager loading (SQL JOIN):
   SELECT p.*, u.name as author_name
   FROM posts p
   JOIN users u ON p.author_id = u.id
   LIMIT 20
   Total: 1 query

2. Batch loading (IN clause):
   Query 1: SELECT * FROM posts LIMIT 20
   Query 2: SELECT * FROM users WHERE id IN (1, 2, 3, ..., 15)
   Total: 2 queries

3. DataLoader pattern (for GraphQL):
   - Collects all IDs requested in a single tick
   - Fires one batched query
   - Returns results mapped to original requests

4. ORM-level solutions:
   - Prisma: include: { author: true }
   - SQLAlchemy: joinedload(Post.author)
   - Django: select_related('author')
   - ActiveRecord: includes(:author)
```

### Q7: "How do you version a GraphQL API?"

```
GraphQL APIs typically do not use versioning. Instead, they evolve
through additive changes and deprecation.

Strategy:
1. Add new fields (non-breaking)
   - New fields do not affect existing queries
   - Clients only get fields they request

2. Deprecate old fields
   type User {
     name: String @deprecated(reason: "Use firstName and lastName")
     firstName: String!
     lastName: String!
   }

3. Monitor deprecated field usage
   - Track which clients use deprecated fields
   - Reach out to consumers before removal

4. Remove after migration period
   - Remove field from schema
   - Clients using removed fields get clear error messages

Why this works for GraphQL but not REST:
- REST returns ALL fields by default (removing one breaks clients)
- GraphQL returns ONLY requested fields (adding one affects nobody)

When you DO need breaking changes in GraphQL:
- Changing a field's type (String → Int)
- Making a nullable field required
- Removing a field from a union type
- In these cases, create a new field with the new type
  and deprecate the old one
```

### Q8: "Explain HATEOAS and whether you would use it."

```
HATEOAS (Hypermedia As The Engine Of Application State):
API responses include links to related actions and resources.

Example:
GET /api/orders/123

{
  "id": "123",
  "status": "pending",
  "total": 99.99,
  "_links": {
    "self": { "href": "/api/orders/123" },
    "cancel": { "href": "/api/orders/123/cancel", "method": "POST" },
    "payment": { "href": "/api/orders/123/payments", "method": "POST" },
    "items": { "href": "/api/orders/123/items" }
  }
}

After payment:
{
  "id": "123",
  "status": "paid",
  "_links": {
    "self": { "href": "/api/orders/123" },
    "refund": { "href": "/api/orders/123/refund", "method": "POST" }
    // Note: "cancel" link is gone because paid orders cannot be canceled
  }
}

Pros:
- Client discovers available actions dynamically
- Server controls state transitions
- Client does not need to hardcode URLs

Cons:
- Adds complexity to response format
- Most frontend apps hardcode routes anyway
- Rarely implemented in practice

Recommendation:
- Use for public APIs where discoverability matters
- Skip for internal APIs where both sides are under your control
- Consider a middle ground: include a "links" field for pagination
  (next, previous) but not for every possible action
```

---

## Code Examples

### Complete Express API Setup with Best Practices

```typescript
// app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/logger';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import taskRoutes from './routes/tasks';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  })
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Request processing
app.use(express.json({ limit: '10mb' }));
app.use(requestId());
app.use(requestLogger());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/tasks', authenticate, taskRoutes);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

### Frontend API Client with Retry Logic

```typescript
// lib/api.ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

interface RequestConfig {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(
    path: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      retries = 2,
      retryDelay = 1000,
    } = config;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.token) {
      requestHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

        // Do not retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const data = await response.json();
          return data as ApiResponse<T>;
        }

        // Retry server errors (5xx)
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        return data as ApiResponse<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * (attempt + 1))
          );
        }
      }
    }

    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: lastError?.message || 'Request failed after retries',
      },
    };
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'POST', body });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL || '/api/v1');
```

---

## Quick Reference

### REST API Design Checklist

```
Naming:
├── [ ] Use plural nouns for collections (/users, not /user)
├── [ ] Use kebab-case for multi-word resources (/user-profiles)
├── [ ] Use path hierarchy for relationships (/users/:id/orders)
├── [ ] Keep URLs short and predictable
└── [ ] Use query parameters for filtering, sorting, pagination

Methods:
├── [ ] GET for reading (safe, idempotent, cacheable)
├── [ ] POST for creating (not idempotent)
├── [ ] PUT for full replacement (idempotent)
├── [ ] PATCH for partial updates
└── [ ] DELETE for removal (idempotent)

Responses:
├── [ ] Consistent envelope structure
├── [ ] Appropriate status codes (not everything is 200)
├── [ ] Machine-readable error codes
├── [ ] Pagination metadata for list endpoints
└── [ ] Request ID for debugging

Security:
├── [ ] Authentication via Authorization header (not query params)
├── [ ] Rate limiting with proper 429 responses
├── [ ] Input validation on all endpoints
├── [ ] CORS configured for allowed origins only
└── [ ] No sensitive data in URLs (passwords, tokens)

Documentation:
├── [ ] OpenAPI/Swagger spec maintained
├── [ ] Examples for every endpoint
├── [ ] Error response documentation
├── [ ] Authentication instructions
└── [ ] Changelog for API updates
```

### GraphQL vs REST Decision Matrix

```
Criterion                    | REST  | GraphQL
-----------------------------|-------|--------
Simple CRUD                  | Best  | OK
Complex data requirements    | OK    | Best
Multiple client types        | OK    | Best
HTTP caching                 | Best  | Hard
File uploads                 | Best  | Hard
Real-time subscriptions      | Needs WS  | Built-in
Learning curve               | Low   | Medium
Tooling ecosystem            | Rich  | Growing
Over/under-fetching          | Common| Solved
API evolution                | Versioning | Deprecation
Error handling               | HTTP codes | Custom errors
```

### HTTP Status Code Quick Reference

```
Most commonly used in practice:

200 → Success (most responses)
201 → Created (after POST)
204 → No Content (after DELETE)
400 → Bad input from client
401 → Not authenticated
403 → Not authorized
404 → Resource not found
409 → Conflict (duplicate, stale data)
422 → Valid syntax but semantic error
429 → Rate limited
500 → Server bug
503 → Server overloaded / maintenance
```
