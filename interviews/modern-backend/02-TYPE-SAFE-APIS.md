# Type-Safe API Design

## Introduction

The defining shift in backend API design since 2023 has been the move toward **end-to-end type safety** -- the idea that a type change in your database schema should produce a compile-time error in your frontend code, with zero code generation steps in between. This is not a nice-to-have; it fundamentally changes how teams ship software by catching entire categories of bugs before deployment.

This guide covers four API paradigms through the lens of type safety: tRPC (full-stack TypeScript), GraphQL (schema-driven), gRPC (protocol-buffer-driven), and REST with OpenAPI 3.1 (contract-first). Each has a distinct philosophy about where types live and how they flow.

```
+------------------------------------------------------------------+
|               TYPE SAFETY SPECTRUM (2026)                        |
+------------------------------------------------------------------+
|                                                                  |
|  MORE TYPE SAFE                              LESS TYPE SAFE      |
|  <------------------------------------------------------->      |
|                                                                  |
|  tRPC          gRPC          GraphQL         REST                |
|  (zero schema) (protobuf)    (SDL/codegen)   (OpenAPI/manual)    |
|                                                                  |
|  Types flow    Types from    Types from      Types from          |
|  directly via  .proto files  schema +        OpenAPI spec +      |
|  TS inference  + codegen     codegen         codegen             |
|                                                                  |
|  Monorepo      Cross-lang    Cross-lang      Universal           |
|  TS only       polyglot      polyglot        any lang            |
|                                                                  |
+------------------------------------------------------------------+
```

---

## tRPC: Zero-Schema Type Safety

### How tRPC Works Internally

tRPC achieves type safety without code generation by leveraging TypeScript's type inference across the client-server boundary. The key insight: if both client and server live in the same TypeScript project (or share types via a monorepo), the TypeScript compiler can infer the types end-to-end.

```
+------------------------------------------------------------------+
|                    tRPC ARCHITECTURE                              |
+------------------------------------------------------------------+
|                                                                  |
|  SERVER                          CLIENT                          |
|  +------------------------+     +-------------------------+     |
|  | Router                 |     | tRPC Client             |     |
|  | +--------------------+ |     | +---------------------+ |     |
|  | | Procedure          | |     | | Proxy Object        | |     |
|  | | - input (Zod)      | |     | | - Infers types from | |     |
|  | | - output (inferred)| |     | |   router definition | |     |
|  | | - middleware chain  | |     | | - Auto-complete     | |     |
|  | | - resolver fn      | |     | | - Type errors       | |     |
|  | +--------------------+ |     | +---------------------+ |     |
|  +------------------------+     +-------------------------+     |
|           |                              |                       |
|           v                              v                       |
|  +---------------------------------------------------+          |
|  |            HTTP / WebSocket Transport              |          |
|  |  (Batching: multiple calls in single request)      |          |
|  +---------------------------------------------------+          |
|                                                                  |
|  TYPE FLOW:                                                      |
|  Router Type ---> AppRouter type export ---> Client infers       |
|  (No codegen, no schema files, no build step)                    |
|                                                                  |
+------------------------------------------------------------------+
```

### tRPC Server Implementation

```typescript
// server/trpc.ts -- Initialize tRPC
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

// Context type -- available to all procedures
interface Context {
  db: Database;
  user: { id: string; role: 'admin' | 'user' } | null;
}

const t = initTRPC.context<Context>().create();

// Middleware
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Now typed as non-null
    },
  });
});

const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

// Procedure builders
const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(isAuthed);
const adminProcedure = t.procedure.use(isAuthed).use(isAdmin);

export { t, publicProcedure, protectedProcedure, adminProcedure };
```

```typescript
// server/routers/user.ts -- User router
import { z } from 'zod';
import { t, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';

const userRouter = t.router({
  // Query: GET-like operation
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.users.findUnique({
        where: { id: input.id },
        select: { id: true, name: true, email: true, createdAt: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `User ${input.id} not found`,
        });
      }

      return user; // Return type is inferred
    }),

  // Query with cursor-based pagination
  list: publicProcedure
    .input(z.object({
      cursor: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.users.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return { items, nextCursor };
    }),

  // Mutation: POST/PUT/DELETE-like operation
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      role: z.enum(['admin', 'user']).default('user'),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.users.findUnique({
        where: { email: input.email },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email already registered',
        });
      }

      return ctx.db.users.create({ data: input });
    }),

  // Subscription: Real-time updates via WebSocket
  onUserCreated: protectedProcedure
    .subscription(({ ctx }) => {
      return observable<User>((emit) => {
        const handler = (user: User) => emit.next(user);
        ctx.db.events.on('userCreated', handler);
        return () => ctx.db.events.off('userCreated', handler);
      });
    }),
});

export type UserRouter = typeof userRouter;
```

```typescript
// server/routers/index.ts -- Merge routers
import { t } from '../trpc';
import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = t.router({
  user: userRouter,
  post: postRouter,
});

// THIS IS THE KEY -- export the type, not the implementation
export type AppRouter = typeof appRouter;
export { appRouter };
```

### tRPC Client (React Query Integration)

```typescript
// client/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/routers'; // Type-only import

export const trpc = createTRPCReact<AppRouter>();
```

```tsx
// client/components/UserList.tsx
import { trpc } from '../trpc';

function UserList() {
  // Full type inference -- input, output, error types all inferred
  const { data, fetchNextPage, hasNextPage } = trpc.user.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  // Mutation with optimistic updates
  const createUser = trpc.user.create.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate(); // Type-safe cache invalidation
    },
  });

  // TypeScript ERROR if you pass wrong types:
  // createUser.mutate({ name: 123 }); // Error: Type 'number' is not assignable to type 'string'

  return (
    <div>
      {data?.pages.flatMap(page =>
        page.items.map(user => (
          // user.name, user.email, user.createdAt -- all type-safe
          <div key={user.id}>{user.name} ({user.email})</div>
        ))
      )}
    </div>
  );
}
```

### tRPC Batching

```
+------------------------------------------------------------------+
|                    tRPC REQUEST BATCHING                          |
+------------------------------------------------------------------+
|                                                                  |
|  Without batching (3 HTTP requests):                             |
|  Client --> GET /trpc/user.getById?id=1    --> Server            |
|  Client --> GET /trpc/post.list            --> Server            |
|  Client --> GET /trpc/user.getById?id=2    --> Server            |
|                                                                  |
|  With batching (1 HTTP request):                                 |
|  Client --> GET /trpc/user.getById,post.list,user.getById        |
|             ?batch=1                                             |
|             &input={"0":{"id":"1"},"1":{},"2":{"id":"2"}}        |
|         --> Server                                               |
|                                                                  |
|  Server processes all 3 in parallel, returns array of results    |
|                                                                  |
+------------------------------------------------------------------+
```

---

## GraphQL in 2026

### Code-First vs Schema-First

```
+------------------------------------------------------------------+
|            GRAPHQL APPROACH COMPARISON                            |
+------------------------------------------------------------------+
|                                                                  |
|  SCHEMA-FIRST (SDL)                CODE-FIRST (Pothos)           |
|  -------------------               ------------------            |
|                                                                  |
|  1. Write .graphql files           1. Write TypeScript code      |
|  2. Generate types (codegen)       2. Types inferred at build    |
|  3. Implement resolvers            3. Schema generated           |
|  4. Types can drift from SDL       4. Types always in sync       |
|                                                                  |
|  # schema.graphql                  // schema.ts                  |
|  type User {                       builder.objectType('User', {  |
|    id: ID!                           fields: (t) => ({           |
|    name: String!                       id: t.exposeID('id'),     |
|    email: String!                      name: t.exposeString(...),|
|  }                                     email: t.exposeString(..)|
|                                      })                          |
|                                    })                            |
|                                                                  |
|  WINNER 2026: Code-first with Pothos is now dominant for TS      |
|  projects. Schema-first still used in polyglot environments.     |
|                                                                  |
+------------------------------------------------------------------+
```

### Pothos Schema Builder (Code-First)

```typescript
// schema/builder.ts
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import ValidationPlugin from '@pothos/plugin-validation';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import { prisma } from '../db';

const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: {
    user: { id: string; role: string } | null;
  };
  Scalars: {
    DateTime: { Input: Date; Output: Date };
  };
}>({
  plugins: [PrismaPlugin, RelayPlugin, ValidationPlugin],
  prisma: { client: prisma },
  relay: {},
});

export { builder };
```

```typescript
// schema/user.ts
import { builder } from './builder';

// Define User type from Prisma model
builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    email: t.exposeString('email', {
      // Field-level authorization
      authScopes: { isAdmin: true },
      unauthorizedResolver: () => '***@***.com',
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),

    // Relation with automatic DataLoader batching
    posts: t.relation('posts', {
      query: { orderBy: { createdAt: 'desc' } },
    }),

    // Computed field
    postCount: t.relationCount('posts'),
  }),
});

// Query
builder.queryField('user', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args) => {
      return prisma.user.findUnique({
        ...query, // Includes Pothos's select/include optimizations
        where: { id: String(args.id) },
      });
    },
  })
);

// Mutation with input validation
builder.mutationField('createUser', (t) =>
  t.prismaField({
    type: 'User',
    args: {
      input: t.arg({
        type: builder.inputType('CreateUserInput', {
          fields: (t) => ({
            name: t.string({ required: true, validate: { minLength: 1, maxLength: 100 } }),
            email: t.string({ required: true, validate: { email: true } }),
          }),
        }),
        required: true,
      }),
    },
    resolve: async (query, _root, args) => {
      return prisma.user.create({
        ...query,
        data: args.input,
      });
    },
  })
);
```

### The N+1 Problem and DataLoader

```
+------------------------------------------------------------------+
|                    THE N+1 PROBLEM IN GRAPHQL                    |
+------------------------------------------------------------------+
|                                                                  |
|  Query:                                                          |
|  {                                                               |
|    users {            <-- 1 query: SELECT * FROM users           |
|      name                                                        |
|      posts {          <-- N queries: SELECT * FROM posts         |
|        title              WHERE user_id = ? (for EACH user)      |
|      }                                                           |
|    }                                                             |
|  }                                                               |
|                                                                  |
|  WITHOUT DataLoader (N+1 queries):                               |
|  SELECT * FROM users;                    -- 1 query              |
|  SELECT * FROM posts WHERE user_id = 1;  -- query 2              |
|  SELECT * FROM posts WHERE user_id = 2;  -- query 3              |
|  SELECT * FROM posts WHERE user_id = 3;  -- query 4              |
|  ...                                     -- N more queries       |
|                                                                  |
|  WITH DataLoader (2 queries):                                    |
|  SELECT * FROM users;                    -- 1 query              |
|  SELECT * FROM posts                     -- 1 batched query      |
|    WHERE user_id IN (1, 2, 3, ...);                              |
|                                                                  |
+------------------------------------------------------------------+
```

```typescript
// DataLoader implementation
import DataLoader from 'dataloader';

function createLoaders(prisma: PrismaClient) {
  return {
    // Batch load posts by user IDs
    postsByUserId: new DataLoader<string, Post[]>(async (userIds) => {
      const posts = await prisma.post.findMany({
        where: { userId: { in: [...userIds] } },
      });

      // Group posts by userId, maintaining order
      const postsByUser = new Map<string, Post[]>();
      for (const id of userIds) {
        postsByUser.set(id, []);
      }
      for (const post of posts) {
        postsByUser.get(post.userId)?.push(post);
      }

      return userIds.map(id => postsByUser.get(id) ?? []);
    }),
  };
}
```

### GraphQL Yoga Server

```typescript
// server.ts
import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import { schema } from './schema';
import { createLoaders } from './loaders';

const yoga = createYoga({
  schema,
  context: ({ request }) => {
    const token = request.headers.get('authorization')?.split(' ')[1];
    const user = token ? verifyToken(token) : null;

    return {
      user,
      loaders: createLoaders(prisma),
    };
  },

  // Subscriptions via Server-Sent Events (not WebSocket)
  // More HTTP-friendly, works through proxies/CDNs
  graphqlEndpoint: '/graphql',

  // Security
  maskedErrors: process.env.NODE_ENV === 'production',

  // Persisted queries (prevent arbitrary query execution)
  plugins: [
    usePersistedOperations({
      getPersistedOperation: (sha256Hash) => {
        return persistedQueries.get(sha256Hash);
      },
    }),
  ],
});

const server = createServer(yoga);
server.listen(4000);
```

### Persisted Queries

```
+------------------------------------------------------------------+
|               PERSISTED QUERIES FLOW                             |
+------------------------------------------------------------------+
|                                                                  |
|  BUILD TIME:                                                     |
|  1. Extract all GraphQL queries from client code                 |
|  2. Hash each query (SHA-256)                                    |
|  3. Store mapping: hash -> query text                            |
|  4. Client only sends hash at runtime                            |
|                                                                  |
|  RUNTIME:                                                        |
|  Client --> { "extensions": { "hash": "abc123" },               |
|               "variables": { "id": "1" } }                      |
|         --> Server looks up hash --> executes stored query        |
|                                                                  |
|  BENEFITS:                                                       |
|  - Prevents arbitrary query injection                            |
|  - Smaller payload (hash vs full query text)                     |
|  - Can allowlist queries in production                           |
|  - CDN caching with GET requests                                 |
|                                                                  |
+------------------------------------------------------------------+
```

---

## gRPC

### Architecture

```
+------------------------------------------------------------------+
|                    gRPC ARCHITECTURE                             |
+------------------------------------------------------------------+
|                                                                  |
|  +----------+                           +----------+             |
|  |  Client  |  -- HTTP/2 + Protobuf --> |  Server  |             |
|  |  (Stub)  |  <-- HTTP/2 + Protobuf -- |  (Impl)  |             |
|  +----------+                           +----------+             |
|       |                                      |                   |
|       v                                      v                   |
|  Generated code                        Generated code            |
|  from .proto                           from .proto               |
|       |                                      |                   |
|       v                                      v                   |
|  +--------------------------------------------------+           |
|  |              .proto Definition File               |           |
|  |  (Single source of truth for both sides)          |           |
|  +--------------------------------------------------+           |
|                                                                  |
|  STREAMING MODES:                                                |
|  +----------+    +----------+    +----------+    +----------+    |
|  |  Unary   |    | Server   |    | Client   |    |  Bidi    |    |
|  |  Req/Res |    | Stream   |    | Stream   |    | Stream   |    |
|  |  1:1     |    | 1:N      |    | N:1      |    | N:N      |    |
|  +----------+    +----------+    +----------+    +----------+    |
|                                                                  |
+------------------------------------------------------------------+
```

### Protocol Buffer Definitions

```protobuf
// proto/user.proto
syntax = "proto3";

package user.v1;

// Service definition
service UserService {
  // Unary RPC
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);

  // Server streaming -- server sends multiple responses
  rpc ListUsers(ListUsersRequest) returns (stream User);

  // Client streaming -- client sends multiple requests
  rpc BulkCreateUsers(stream CreateUserRequest) returns (BulkCreateResponse);

  // Bidirectional streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

// Messages
message User {
  string id = 1;
  string name = 2;
  string email = 3;
  int64 created_at = 4; // Unix timestamp
  UserRole role = 5;
  repeated string tags = 6;
  optional string avatar_url = 7;
}

enum UserRole {
  USER_ROLE_UNSPECIFIED = 0;
  USER_ROLE_ADMIN = 1;
  USER_ROLE_USER = 2;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
  UserRole role = 3;
}

message CreateUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message BulkCreateResponse {
  int32 created_count = 1;
  repeated string failed_emails = 2;
}

message ChatMessage {
  string sender_id = 1;
  string content = 2;
  int64 timestamp = 3;
}
```

### gRPC Server (Node.js with connect-es)

```typescript
// server.ts -- Using connect-es (modern gRPC for TypeScript)
import { ConnectRouter } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { fastify } from 'fastify';
import { UserService } from './gen/user/v1/user_connect';

function routes(router: ConnectRouter) {
  router.service(UserService, {
    // Unary
    async getUser(req) {
      const user = await db.users.findUnique({ where: { id: req.id } });
      if (!user) {
        throw new ConnectError('User not found', Code.NotFound);
      }
      return { user };
    },

    // Server streaming
    async *listUsers(req) {
      const pageSize = req.pageSize || 20;
      let cursor = req.pageToken || undefined;

      while (true) {
        const users = await db.users.findMany({
          take: pageSize,
          cursor: cursor ? { id: cursor } : undefined,
        });

        for (const user of users) {
          yield user; // Stream each user
        }

        if (users.length < pageSize) break;
        cursor = users[users.length - 1].id;
      }
    },

    // Client streaming
    async bulkCreateUsers(reqs) {
      let createdCount = 0;
      const failedEmails: string[] = [];

      for await (const req of reqs) {
        try {
          await db.users.create({ data: req });
          createdCount++;
        } catch {
          failedEmails.push(req.email);
        }
      }

      return { createdCount, failedEmails };
    },

    // Bidirectional streaming
    async *chat(reqs) {
      for await (const msg of reqs) {
        // Echo back with processing
        yield {
          senderId: 'system',
          content: `Received: ${msg.content}`,
          timestamp: BigInt(Date.now()),
        };
      }
    },
  });
}

const server = fastify();
await server.register(fastifyConnectPlugin, { routes });
await server.listen({ host: '0.0.0.0', port: 8080 });
```

### buf CLI (Modern Protobuf Toolchain)

```yaml
# buf.yaml -- Protobuf project configuration
version: v2
lint:
  use:
    - DEFAULT
  except:
    - FIELD_LOWER_SNAKE_CASE
breaking:
  use:
    - FILE

# buf.gen.yaml -- Code generation configuration
version: v2
plugins:
  - remote: buf.build/connectrpc/es
    out: gen
    opt: target=ts
  - remote: buf.build/bufbuild/es
    out: gen
    opt: target=ts
```

```bash
# Lint protobuf files
buf lint

# Check for breaking changes against main branch
buf breaking --against '.git#branch=main'

# Generate TypeScript code
buf generate

# Push to Buf Schema Registry (BSR)
buf push
```

### gRPC-Web for Browser Clients

```
+------------------------------------------------------------------+
|              gRPC-WEB ARCHITECTURE                               |
+------------------------------------------------------------------+
|                                                                  |
|  Browser (no HTTP/2 framing)                                     |
|  +--------+                                                      |
|  | gRPC-  |  -- HTTP/1.1 + gRPC-Web encoding -->  +--------+    |
|  | Web    |                                        | Envoy  |    |
|  | Client |  gRPC-Web uses:                        | Proxy  |    |
|  +--------+  - application/grpc-web+proto          +--------+    |
|              - Base64 or binary encoding               |         |
|              - Unary + Server streaming only           v         |
|                                                   +--------+    |
|                                                   | gRPC   |    |
|                                                   | Server |    |
|                                                   +--------+    |
|                                                                  |
|  Alternative: Connect protocol (no proxy needed)                 |
|  Browser --> connect-web --> HTTP/1.1 JSON or binary --> Server   |
|                                                                  |
+------------------------------------------------------------------+
```

---

## REST Best Practices 2026

### OpenAPI 3.1

OpenAPI 3.1 brought full JSON Schema compatibility, making it the most expressive REST API specification format.

```yaml
# openapi.yaml
openapi: '3.1.0'
info:
  title: User API
  version: '1.0.0'
  description: User management API

paths:
  /users:
    get:
      operationId: listUsers
      summary: List users with pagination
      parameters:
        - name: cursor
          in: query
          schema:
            type: string
            format: uuid
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: Paginated user list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'

    post:
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '409':
          description: Email already exists
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetail'

components:
  schemas:
    User:
      type: object
      required: [id, name, email, createdAt]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          minLength: 1
          maxLength: 100
        email:
          type: string
          format: email
        createdAt:
          type: string
          format: date-time

    # RFC 9457 Problem Details
    ProblemDetail:
      type: object
      properties:
        type:
          type: string
          format: uri
        title:
          type: string
        status:
          type: integer
        detail:
          type: string
        instance:
          type: string
          format: uri
```

### Zod-to-OpenAPI (Type-Safe REST)

```typescript
// schemas/user.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const UserSchema = z.object({
  id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  name: z.string().min(1).max(100).openapi({ example: 'Alice Johnson' }),
  email: z.string().email().openapi({ example: 'alice@example.com' }),
  createdAt: z.string().datetime().openapi({ example: '2026-01-15T10:30:00Z' }),
}).openapi('User');

export const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true });

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
```

```typescript
// routes/users.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { UserSchema, CreateUserSchema } from '../schemas/user';

const app = new OpenAPIHono();

const listRoute = createRoute({
  method: 'get',
  path: '/users',
  request: {
    query: z.object({
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(UserSchema),
            nextCursor: z.string().uuid().optional(),
          }),
        },
      },
      description: 'List of users',
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { cursor, limit } = c.req.valid('query');
  // Input is validated and typed
  const result = await getUserList(cursor, limit);
  return c.json(result, 200);
});

// Auto-generate OpenAPI spec
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'User API', version: '1.0.0' },
});

// Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }));
```

### RFC 9457 Problem Details

```typescript
// errors/problem-details.ts
interface ProblemDetail {
  type: string;    // URI identifying the problem type
  title: string;   // Human-readable summary
  status: number;  // HTTP status code
  detail: string;  // Human-readable explanation
  instance: string; // URI for this specific occurrence
}

function createProblem(
  status: number,
  type: string,
  title: string,
  detail: string,
  instance: string
): Response {
  const problem: ProblemDetail = { type, title, status, detail, instance };

  return new Response(JSON.stringify(problem), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

// Usage
function handleNotFound(userId: string): Response {
  return createProblem(
    404,
    'https://api.example.com/problems/user-not-found',
    'User Not Found',
    `No user exists with ID ${userId}`,
    `/users/${userId}`
  );
}
```

---

## Comparison Table

```
+-------------------+------------------+------------------+------------------+------------------+
| Feature           | tRPC             | GraphQL          | gRPC             | REST + OpenAPI   |
+-------------------+------------------+------------------+------------------+------------------+
| Type Safety       | Native TS        | Via codegen      | Via protoc       | Via codegen      |
| Schema Language   | TypeScript       | SDL              | Protobuf         | OpenAPI/JSON     |
| Transport         | HTTP             | HTTP             | HTTP/2           | HTTP             |
| Serialization     | JSON             | JSON             | Protobuf (bin)   | JSON             |
| Streaming         | WebSocket        | SSE              | Native           | SSE / WebSocket  |
| Browser Support   | Native           | Native           | Via gRPC-Web     | Native           |
| Polyglot          | TS only          | Any language     | Any language     | Any language     |
| Tooling Maturity  | Growing          | Mature           | Mature           | Very Mature      |
| Learning Curve    | Low (for TS)     | Medium           | High             | Low              |
| Best For          | TS full-stack    | Complex queries  | Microservices    | Public APIs      |
| Worst For         | Polyglot teams   | Simple CRUD      | Simple APIs      | Complex queries  |
| Payload Size      | Medium (JSON)    | Medium (JSON)    | Small (binary)   | Medium (JSON)    |
| Caching           | Manual           | Per-query        | Manual           | HTTP caching     |
| API Evolution     | TypeScript       | Schema deprec.   | Proto compat.    | Versioning       |
+-------------------+------------------+------------------+------------------+------------------+
```

---

## When to Use Which Approach

### Choose tRPC When:
- Full-stack TypeScript (Next.js, Remix, SvelteKit)
- Monorepo or shared packages between client and server
- Rapid prototyping where iteration speed matters most
- Internal tools and dashboards
- Team is TypeScript-fluent

### Choose GraphQL When:
- Multiple frontend clients (web, mobile, TV) with different data needs
- Complex, nested data relationships
- Need to aggregate data from multiple backend services
- API consumers need flexibility in what data they fetch
- Team has GraphQL expertise

### Choose gRPC When:
- Microservice-to-microservice communication
- Low-latency, high-throughput requirements
- Streaming is a primary use case
- Polyglot environment (Go, Rust, Java, Python services)
- Strong contract enforcement between teams

### Choose REST + OpenAPI When:
- Public-facing APIs consumed by third parties
- Simple CRUD operations
- HTTP caching is important
- Team is most familiar with REST
- API needs to be consumed by clients without codegen tooling

---

## End-to-End Type Safety Pattern

```
+------------------------------------------------------------------+
|            END-TO-END TYPE SAFETY (THE HOLY GRAIL)               |
+------------------------------------------------------------------+
|                                                                  |
|  DATABASE SCHEMA                                                 |
|  (Drizzle/Prisma)                                                |
|       |                                                          |
|       | Generates types                                          |
|       v                                                          |
|  SERVER TYPES                                                    |
|  (TypeScript interfaces)                                         |
|       |                                                          |
|       | Inferred by tRPC / generated by codegen                  |
|       v                                                          |
|  API CONTRACT                                                    |
|  (Router type / Schema)                                          |
|       |                                                          |
|       | Imported as type / generated client                      |
|       v                                                          |
|  CLIENT TYPES                                                    |
|  (Auto-complete + compile errors)                                |
|       |                                                          |
|       | React Query / SWR integration                            |
|       v                                                          |
|  UI COMPONENTS                                                   |
|  (Type-safe rendering)                                           |
|                                                                  |
|  CHANGE A COLUMN IN DB --> TS ERROR IN UI COMPONENT              |
|  (Zero manual type updates needed)                               |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Common Interview Questions

### Q: How does tRPC achieve type safety without code generation?

**Strong answer**: tRPC leverages TypeScript's structural type system and type inference. The server defines a router with procedures, each having typed input (via Zod schemas) and inferred output (from the resolver return type). The router's type is exported as `AppRouter = typeof appRouter`. On the client, `createTRPCClient<AppRouter>()` creates a Proxy object that mirrors the router's structure. TypeScript's type inference follows the Proxy's property access chain (`trpc.user.getById`) to resolve the input/output types. This only works because TypeScript evaluates types at compile time across module boundaries within the same project or monorepo. The limitation is that both client and server must be TypeScript -- you cannot generate a Python or Go client from a tRPC router.

### Q: When would you choose GraphQL over tRPC for a new project?

**Strong answer**: I would choose GraphQL when the API serves multiple clients with significantly different data requirements. For example, a mobile app might need a user's name and avatar, while the web dashboard needs the full profile with recent activity and analytics. GraphQL lets each client request exactly what it needs, reducing over-fetching. With tRPC, you would either create separate procedures for each client (duplicating logic) or return everything and let clients ignore fields (wasting bandwidth on mobile). I would also choose GraphQL when the team is not fully TypeScript -- GraphQL's schema serves as a language-agnostic contract. However, for a pure TypeScript monorepo with a single client, tRPC is simpler, faster to develop with, and has less operational overhead (no schema management, no codegen pipeline).

### Q: How do you prevent the N+1 problem in GraphQL?

**Strong answer**: The N+1 problem occurs because GraphQL resolves each field independently. When resolving a list of users and their posts, the posts resolver fires once per user. The standard solution is DataLoader, which batches and deduplicates requests within a single tick of the event loop. DataLoader collects all user IDs requested in a single GraphQL resolution cycle, then makes one batched query. The key implementation details are: (1) DataLoaders must be per-request to avoid cache leaks between users, (2) the batch function must return results in the same order as the input keys, (3) Pothos with Prisma plugin handles this automatically via `t.relation()` which generates optimal `findMany` queries with `IN` clauses. For deeply nested queries, you should also implement query complexity analysis to reject queries that would generate too many database calls regardless of batching.

### Q: What is the Connect protocol and how does it relate to gRPC?

**Strong answer**: Connect is a protocol developed by Buf that is wire-compatible with gRPC but also works over HTTP/1.1 with JSON encoding. Traditional gRPC requires HTTP/2 and uses binary Protobuf encoding, which means browsers cannot call gRPC services directly -- you need a proxy like Envoy with gRPC-Web. Connect solves this by supporting three protocols simultaneously: gRPC (HTTP/2 + Protobuf), gRPC-Web (HTTP/1.1 + Protobuf), and Connect (HTTP/1.1 + JSON or Protobuf). A single Connect server can serve all three. For TypeScript backends, `connect-es` provides a modern, TypeScript-native implementation. The practical benefit is that you define your API once in Protobuf, get strongly-typed clients for any language, and browsers can call the API directly using the Connect protocol without a proxy.
