# React Server Components

## Overview

React Server Components (RSC) represent the most fundamental shift in React's architecture since hooks. They introduce a new rendering model where components execute on the server, send serialized UI to the client, and never ship their JavaScript to the browser. This is not server-side rendering (SSR) -- it is a fundamentally different paradigm that changes how you think about data fetching, component boundaries, and bundle size.

Every major frontend interview in 2025-2026 includes RSC questions. Interviewers want to see that you understand the mental model -- not just the API. Why do server components exist? What problems do they solve that SSR could not? When should a component be a server component vs a client component? This guide covers all of it.

---

## Core Concepts

### The Server Component Mental Model

In traditional React, every component runs in the browser. Even with SSR, the component code is sent to the client and re-executed (hydration). Server Components break this assumption: some components run *only* on the server and their JavaScript is never sent to the client.

Think of it as two React trees:

```
Server Tree (runs on server)          Client Tree (runs in browser)
+---------------------------+         +---------------------------+
| ServerLayout              |         | ClientNav (interactive)   |
|   ServerSidebar           |    -->  | ClientSearchBar           |
|   ServerContent           |         | ClientCommentForm         |
|     ClientCommentForm     |         +---------------------------+
+---------------------------+
```

Server components can:
- Access databases, file systems, and internal APIs directly
- Use `async/await` at the component level
- Import large libraries without affecting bundle size
- Read environment variables and secrets safely

Server components cannot:
- Use `useState`, `useEffect`, or any hooks that depend on browser APIs
- Attach event handlers (`onClick`, `onChange`, etc.)
- Access `window`, `document`, or other browser globals
- Use Context providers (but can read from them via client components)

### The "use client" Directive

The `"use client"` directive marks the boundary between the server and client worlds. It goes at the top of a file -- everything in that file and everything it imports becomes part of the client bundle.

```tsx
// components/SearchBar.tsx
"use client";

import { useState } from "react";

export function SearchBar() {
  const [query, setQuery] = useState("");

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

**Critical mental model:** `"use client"` does not mean "this only runs on the client." It means "this is the entry point into the client bundle." The component still gets SSR'd to HTML -- but its JavaScript is shipped to the browser for hydration and interactivity.

### The "use server" Directive

The `"use server"` directive marks functions that can be called from the client but execute on the server. These are called **Server Actions**.

```tsx
// actions/comments.ts
"use server";

import { db } from "@/lib/database";
import { revalidatePath } from "next/cache";

export async function addComment(formData: FormData) {
  const text = formData.get("text") as string;
  const postId = formData.get("postId") as string;

  await db.comments.create({
    data: { text, postId },
  });

  revalidatePath(`/posts/${postId}`);
}
```

```tsx
// components/CommentForm.tsx
"use client";

import { addComment } from "@/actions/comments";

export function CommentForm({ postId }: { postId: string }) {
  return (
    <form action={addComment}>
      <input type="hidden" name="postId" value={postId} />
      <textarea name="text" required />
      <button type="submit">Post Comment</button>
    </form>
  );
}
```

Server Actions work with native `<form>` elements, enabling progressive enhancement -- the form works even before JavaScript loads.

### Server vs Client Component Decision Tree

```
Does the component need...

  useState, useEffect, useReducer?
  --> YES --> "use client"

  onClick, onChange, onSubmit handlers?
  --> YES --> "use client"

  Browser APIs (window, document, localStorage)?
  --> YES --> "use client"

  Third-party client libraries (date pickers, maps, rich text editors)?
  --> YES --> "use client"

  Direct database/API access?
  --> YES --> Server Component (default)

  Heavy dependencies that don't need to be in the bundle?
  --> YES --> Server Component (default)

  Only renders static or async-fetched content?
  --> YES --> Server Component (default)
```

**The principle:** Start with server components by default. Only add `"use client"` when the component needs interactivity or browser APIs. Push the client boundary as far down the tree as possible.

### Composition Pattern: Server Wrapping Client

Server components can import and render client components. Client components **cannot** import server components -- but they can *accept* server components as children or props.

```tsx
// ServerLayout.tsx (server component -- no directive needed)
import { ClientTabs } from "./ClientTabs";
import { ServerExpensiveChart } from "./ServerExpensiveChart";

export async function ServerLayout() {
  const data = await fetchDashboardData();

  return (
    <ClientTabs
      tabs={["Overview", "Analytics"]}
      // Server component passed as a prop
      analyticsPanel={<ServerExpensiveChart data={data} />}
    >
      {/* Server component passed as children */}
      <ServerOverview data={data} />
    </ClientTabs>
  );
}
```

```tsx
// ClientTabs.tsx
"use client";

import { useState, ReactNode } from "react";

interface Props {
  tabs: string[];
  children: ReactNode;
  analyticsPanel: ReactNode;
}

export function ClientTabs({ tabs, children, analyticsPanel }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <nav>
        {tabs.map((tab, i) => (
          <button key={tab} onClick={() => setActiveTab(i)}>
            {tab}
          </button>
        ))}
      </nav>
      {activeTab === 0 ? children : analyticsPanel}
    </div>
  );
}
```

**Why this works:** The server components are rendered on the server and serialized into the RSC payload. The client component receives them as opaque React elements -- it does not need to re-execute their code.

### Data Fetching with Server Components

Server components make data fetching dramatically simpler. No `useEffect`, no loading state management, no data fetching libraries needed for the initial load.

```tsx
// app/posts/[id]/page.tsx (server component by default in Next.js App Router)
import { db } from "@/lib/database";
import { CommentForm } from "@/components/CommentForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;

  // Direct database access -- no API layer needed
  const post = await db.posts.findUnique({
    where: { id },
    include: { author: true, comments: true },
  });

  if (!post) {
    notFound();
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <p>By {post.author.name}</p>
      <div dangerouslySetInnerHTML={{ __html: post.htmlContent }} />

      <section>
        <h2>Comments ({post.comments.length})</h2>
        {post.comments.map((comment) => (
          <div key={comment.id}>
            <p>{comment.text}</p>
          </div>
        ))}
        <CommentForm postId={id} />
      </section>
    </article>
  );
}
```

### Streaming and Suspense

Server components integrate with React Suspense to enable streaming. Instead of waiting for all data before sending any HTML, the server streams chunks as they become ready.

```tsx
import { Suspense } from "react";

export default async function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* This renders immediately */}
      <Suspense fallback={<UserCardSkeleton />}>
        <UserCard />
      </Suspense>

      {/* This can stream in later, independently */}
      <Suspense fallback={<RevenueChartSkeleton />}>
        <RevenueChart />
      </Suspense>

      {/* And this can stream in whenever it's ready */}
      <Suspense fallback={<ActivityFeedSkeleton />}>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}

async function RevenueChart() {
  // This might take 2 seconds -- it doesn't block the rest of the page
  const data = await fetchRevenueData();
  return <Chart data={data} />;
}

async function ActivityFeed() {
  // This might take 500ms -- it streams in before RevenueChart
  const feed = await fetchActivityFeed();
  return (
    <ul>
      {feed.map((item) => (
        <li key={item.id}>{item.message}</li>
      ))}
    </ul>
  );
}
```

**How streaming works under the hood:**
1. Server sends the initial HTML shell with skeleton fallbacks
2. As each async component resolves, the server sends an HTML chunk
3. A small inline `<script>` replaces the skeleton with the real content
4. No hydration needed for server-only components

### RSC vs SSR vs SSG vs ISR

| Aspect | SSG | ISR | SSR | RSC |
|--------|-----|-----|-----|-----|
| **When it runs** | Build time | Build + revalidation | Every request | Every request (server components) |
| **JavaScript shipped** | All component code | All component code | All component code | Only client component code |
| **Data freshness** | Stale until rebuild | Stale within revalidation window | Always fresh | Always fresh |
| **TTFB** | Instant (CDN) | Instant (CDN, may be stale) | Slow (server render) | Can stream progressively |
| **Interactivity** | After hydration | After hydration | After hydration | Immediate for server parts |
| **Database access** | At build time only | At revalidation time | Via API routes | Direct in components |
| **Bundle size** | Full app | Full app | Full app | Only client components |
| **Caching** | CDN-cacheable | CDN-cacheable with TTL | Per-request | Per-component with cache() |

**Key insight:** RSC is not a replacement for SSR -- they are complementary. RSC determines *what* JavaScript ships to the client. SSR determines *when* HTML is generated. You can have RSC with SSR (the common case in Next.js App Router), RSC with SSG, or RSC with ISR.

### Server Actions In Depth

Server Actions are the mutation counterpart to server component data fetching. They replace API routes for form submissions and data mutations.

```tsx
// app/settings/page.tsx
import { updateProfile } from "@/actions/profile";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <form action={updateProfile}>
      <input name="name" defaultValue={user.name} />
      <input name="email" defaultValue={user.email} />
      <SubmitButton />
    </form>
  );
}
```

```tsx
// components/SubmitButton.tsx
"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}
```

```tsx
// actions/profile.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ProfileSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export async function updateProfile(formData: FormData) {
  const parsed = ProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  await db.users.update({
    where: { id: getCurrentUserId() },
    data: parsed.data,
  });

  revalidatePath("/settings");
  redirect("/settings");
}
```

**Progressive enhancement:** This form works without JavaScript. The browser submits the form natively, the server action executes, and the page reloads with updated data. With JavaScript, React intercepts the submission, calls the action via fetch, and updates the UI without a full page reload.

### Next.js App Router Patterns

The App Router is the primary production implementation of RSC. Key patterns:

**Layout nesting:**
```
app/
  layout.tsx          # Root layout (server component)
  page.tsx            # Home page (server component)
  dashboard/
    layout.tsx        # Dashboard layout with sidebar (server component)
    page.tsx          # Dashboard index
    settings/
      page.tsx        # Settings page
```

**Route groups:**
```
app/
  (marketing)/        # Group without URL segment
    layout.tsx        # Marketing layout
    page.tsx          # Landing page
    pricing/page.tsx
  (app)/              # App group with different layout
    layout.tsx        # App layout with navigation
    dashboard/page.tsx
```

**Parallel routes:**
```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,  // @analytics/page.tsx
  activity,   // @activity/page.tsx
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  activity: React.ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="grid grid-cols-2">
        {analytics}
        {activity}
      </div>
    </div>
  );
}
```

**Intercepting routes (modals):**
```
app/
  feed/
    page.tsx                    # Feed page
    @modal/
      (.)photo/[id]/page.tsx   # Intercepts /photo/[id] and shows as modal
  photo/
    [id]/
      page.tsx                  # Full photo page (direct navigation)
```

---

## Common Interview Questions

### Q1: Explain the React Server Component architecture. How is it different from SSR?

**Answer:** React Server Components (RSC) and Server-Side Rendering (SSR) solve different problems and work at different levels.

SSR is a rendering strategy: the server generates HTML for the initial page load, then sends all the component JavaScript to the client for hydration. After hydration, the app behaves exactly like a client-side React app. The key problem: you still ship all the component code to the browser, even for components that will never be interactive.

RSC is a component architecture: it introduces a new type of component that executes exclusively on the server. The server serializes the component's output (not its code) into a special format called the RSC payload, which the client interprets to render the UI. Server component JavaScript is never sent to the browser.

In practice, RSC and SSR work together. In Next.js App Router, server components are SSR'd to HTML for the initial page load (fast first paint), and the RSC payload is sent alongside for client-side navigation. Client components are SSR'd and hydrated normally. The result: fast initial loads, smaller bundles, and direct server-side data access.

### Q2: How do you decide what should be a server component vs a client component?

**Answer:** The default should be server component. You only add `"use client"` when the component needs one of these things: state (`useState`, `useReducer`), effects (`useEffect`), event handlers (`onClick`, `onChange`), browser APIs (`window`, `document`, `localStorage`), or third-party libraries that depend on these features.

The goal is to push the client boundary as far down the component tree as possible. Instead of making an entire page a client component because the header has a dropdown, make only the dropdown a client component. The rest of the page stays on the server.

A practical heuristic: if you grep the component for `useState`, `useEffect`, `onClick`, or `onChange` and find nothing, it should probably be a server component. Presentational components that just render data are almost always server components.

### Q3: What happens when a client component tries to import a server component?

**Answer:** This is not supported and will cause a build error. Client components cannot import server components because client component code runs in the browser, which has no access to the server environment.

However, client components can *render* server components if they receive them as children or props. The server component is rendered on the server and the result is passed as serialized React elements. The client component treats them as opaque nodes -- it does not need to execute their code.

This is the "donut pattern": a server component wraps a client component and passes other server components as children, creating a server-client-server sandwich.

### Q4: How do Server Actions work and how are they different from API routes?

**Answer:** Server Actions are functions marked with `"use server"` that execute on the server but can be called from the client. They are essentially RPC (Remote Procedure Call) endpoints that React manages for you.

When you pass a server action to a form's `action` prop, React handles the submission. Without JavaScript, the browser sends a standard POST request. With JavaScript, React intercepts the submission, serializes the form data, sends it via fetch, and updates the UI with the result.

Compared to API routes: Server Actions are colocated with your component code (better DX), they automatically handle serialization/deserialization, they integrate with React's transition system for optimistic updates, and they support progressive enhancement. API routes are still better for public APIs consumed by external clients, webhook endpoints, and non-form mutations triggered by complex client logic.

### Q5: Explain streaming with Suspense in the context of RSC.

**Answer:** Streaming allows the server to send HTML in chunks as data becomes available, rather than waiting for everything to resolve before sending anything.

When a server component is wrapped in `<Suspense>`, React can send the fallback HTML immediately while the async component is still resolving. Once the data is ready, the server sends an additional HTML chunk with a small inline script that replaces the fallback with the real content.

This means the user sees a meaningful page immediately (with skeletons for slow sections), and each section fills in independently as its data resolves. The order sections appear depends on which data resolves first, not the order in the component tree.

The benefit is a dramatically better user experience for pages with multiple data dependencies of varying latency. Instead of the page being as slow as the slowest query, most of the page loads fast and slow sections stream in progressively.

### Q6: What are the bundle size implications of RSC?

**Answer:** RSC can dramatically reduce client bundle size because server component code is never sent to the browser. In a traditional React app, every component, every utility function it imports, and every npm package it uses ends up in the bundle. With RSC, a server component that imports a 500KB markdown parsing library contributes zero bytes to the client bundle.

In practice, this means you can use heavy server-side libraries (database ORMs, image processing, PDF generation) in server components without any bundle size impact. Only client components and their dependencies are bundled for the browser.

However, there is a nuance: the RSC payload (serialized component output) is sent to the client for client-side navigation. If a server component renders a massive table with 10,000 rows, that HTML-like payload is still transmitted. The savings are in JavaScript execution and parsing, not necessarily in total transfer size for data-heavy pages.

---

## Gotchas & Edge Cases

1. **Serialization boundary.** Props passed from server to client components must be serializable (JSON-compatible). You cannot pass functions, classes, Date objects (use ISO strings), or Symbols across the boundary. Maps and Sets are not serializable either.

2. **Module-level side effects in client components.** If a file marked with `"use client"` has module-level side effects (like `window.addEventListener(...)` at the top level), those effects run on the server during SSR. Always guard browser-specific code with `typeof window !== 'undefined'` or `useEffect`.

3. **Context does not cross the server-client boundary.** A `<ThemeProvider>` in a server component layout does not provide context to server components -- only to client components. Server components cannot use `useContext`. If you need shared data in server components, pass it as props or use module-level caches.

4. **`async` client components are not supported.** Only server components can be async functions. If a client component needs data, it must receive it as props from a server component, use `useEffect` to fetch from an API, or use a data fetching library like TanStack Query.

5. **Revalidation gotchas.** `revalidatePath` and `revalidateTag` only work in server actions and route handlers. Calling them in a server component has no effect. Data cached with `fetch` uses time-based or on-demand revalidation, but direct database queries need `unstable_cache` or the `cache()` function for deduplication.

6. **Server components re-render on navigation.** When the user navigates between pages, server components re-execute on the server. React reconciles the new RSC payload with the existing client-side tree, preserving client component state when possible. But if the component tree structure changes significantly, client state may be lost.

7. **Third-party libraries.** Many npm packages do not have `"use client"` directives. If you import a library that uses `useState` internally in a server component, you get a build error. The fix is to create a wrapper file with `"use client"` that re-exports the library component.

8. **Server actions and closures.** Server actions can close over server-side variables, but those values are serialized and included in the action's reference. Sensitive data (like database connection strings) in the closure is encrypted, but be mindful of what you capture.

9. **TypeScript and RSC.** Async server components return `Promise<JSX.Element>`, which can cause type errors with some component patterns. Use `React.ReactNode` for children props and be aware that the return type differs from client components.

10. **Development vs production.** In development, server components re-execute on every file save and request. In production, caching behavior depends on your framework configuration. What works in dev may behave differently in production due to caching.

---

## Quick Reference

| Directive | Meaning | Where It Goes |
|-----------|---------|---------------|
| (none) | Server component (default) | N/A -- this is the default in App Router |
| `"use client"` | Client component entry point | Top of the file, before imports |
| `"use server"` | Server action | Top of the file (all exports are actions) or inline in a function |

| Feature | Server Component | Client Component |
|---------|-----------------|-----------------|
| `async/await` | Yes | No |
| `useState` / `useReducer` | No | Yes |
| `useEffect` / `useLayoutEffect` | No | Yes |
| Event handlers | No | Yes |
| Browser APIs | No | Yes |
| Direct DB access | Yes | No |
| Import server components | Yes | No (receive as children/props) |
| Import client components | Yes | Yes |
| `fetch` with caching | Yes (extended fetch) | Yes (standard fetch) |
| Bundle size impact | Zero | Full |

| Pattern | Description |
|---------|-------------|
| Default server | Start everything as server components |
| Leaf client | Push `"use client"` to leaf components only |
| Donut pattern | Server > Client > Server (via children) |
| Parallel data | Use `Promise.all` in server components for parallel fetches |
| Streaming | Wrap async components in `<Suspense>` for progressive loading |
| Server actions | Use `"use server"` functions for mutations |
| Progressive forms | `<form action={serverAction}>` works without JS |
| Optimistic updates | `useOptimistic` hook in client components with server actions |

| Next.js App Router Feature | Purpose |
|----------------------------|---------|
| `page.tsx` | Route entry point |
| `layout.tsx` | Persistent layout wrapping child routes |
| `loading.tsx` | Automatic Suspense boundary |
| `error.tsx` | Error boundary with retry |
| `not-found.tsx` | 404 page |
| `route.ts` | API route handler |
| `(group)` | Route group without URL segment |
| `@slot` | Parallel route slot |
| `(.)intercepted` | Intercepting route |
| `[param]` | Dynamic segment |
| `[...params]` | Catch-all segment |
