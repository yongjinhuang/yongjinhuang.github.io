# Modern Frontend 2026 -- Interview Preparation

## Overview

This series supplements the [core frontend interview guides](../frontend/) with topics that have become critical in 2025-2026. The frontend landscape has shifted significantly: React Server Components have matured, signals-based reactivity has gone mainstream, edge computing has become the default deployment target, native browser APIs have replaced many libraries, WebAssembly has found real production use cases, and Rust-based tooling has replaced the old JavaScript-based build stack.

If you already have solid fundamentals (React, JavaScript, CSS, TypeScript, performance, testing), these guides will level you up on the cutting-edge topics that senior and staff-level interviews now routinely cover.

---

## Table of Contents

| # | Topic | File | Key Areas |
|---|-------|------|-----------|
| 01 | [React Server Components](./01-REACT-SERVER-COMPONENTS.md) | `01-REACT-SERVER-COMPONENTS.md` | RSC architecture, server/client boundary, "use client"/"use server", server actions, streaming, Suspense, Next.js App Router |
| 02 | [Signals & Fine-Grained Reactivity](./02-SIGNALS-REACTIVITY.md) | `02-SIGNALS-REACTIVITY.md` | Signals paradigm, React vs Solid.js vs Angular vs Vue reactivity, TC39 proposal, virtual DOM vs fine-grained |
| 03 | [Edge Rendering & Partial Prerendering](./03-EDGE-RENDERING.md) | `03-EDGE-RENDERING.md` | Cloudflare Workers, Vercel Edge, Deno Deploy, edge vs serverless, PPR, streaming SSR, deployment architecture |
| 04 | [View Transitions & Modern CSS APIs](./04-VIEW-TRANSITIONS.md) | `04-VIEW-TRANSITIONS.md` | View Transitions API, cross-document transitions, scroll-driven animations, @starting-style, popover API |
| 05 | [WebAssembly for Frontend](./05-WEBASSEMBLY.md) | `05-WEBASSEMBLY.md` | WASM fundamentals, Rust-to-WASM pipeline, wasm-pack, performance vs JS, real use cases, WASI |
| 06 | [Next-Gen Tooling](./06-NEXT-GEN-TOOLING.md) | `06-NEXT-GEN-TOOLING.md` | Vite 6, Turbopack, Biome, oxc, rspack, Lightning CSS, monorepo tools, module federation 2.0 |

---

## How This Relates to the Core Guides

The [core frontend series](../frontend/) covers timeless fundamentals:

- **HTML, CSS, JavaScript** -- the platform itself
- **React fundamentals and advanced patterns** -- component model, hooks, rendering
- **TypeScript** -- the type system that underpins modern frontend
- **State management, testing, security** -- production engineering concerns
- **Build tools and performance** -- shipping fast, reliable applications

This modern series assumes you have that foundation and builds on it:

| Core Guide | Modern Extension |
|------------|-----------------|
| React Fundamentals / Advanced | **01: React Server Components** -- the new rendering architecture |
| State Management | **02: Signals & Reactivity** -- the paradigm shift beyond useState/useReducer |
| Performance Optimization | **03: Edge Rendering** -- where and how your app runs |
| CSS Layout / DOM & Browser APIs | **04: View Transitions** -- native browser animation APIs |
| JavaScript Core | **05: WebAssembly** -- when JavaScript is not enough |
| Build Tools & Bundlers | **06: Next-Gen Tooling** -- the Rust-based replacement stack |

---

## What Interviewers Are Looking For in 2026

Senior and staff frontend interviews have evolved. Beyond getting the "right answer," interviewers want to see:

**1. Architectural Reasoning**
- Can you explain *when* to use RSC vs client components and *why*?
- Do you understand the deployment implications of edge vs serverless?
- Can you reason about tradeoffs between fine-grained reactivity and virtual DOM?

**2. Platform Awareness**
- Do you reach for native browser APIs before npm packages?
- Can you articulate when WebAssembly is appropriate vs when it is overkill?
- Are you aware of the View Transitions API, or do you only know Framer Motion?

**3. Tooling Literacy**
- Can you explain why the ecosystem moved from webpack/Babel to Vite/SWC?
- Do you understand the monorepo landscape and when to use which tool?
- Are you comfortable reasoning about build performance?

**4. Progressive Enhancement Mindset**
- Can you build features that work without JavaScript and get better with it?
- Do you understand how server components enable progressive enhancement?
- Can you design UIs that degrade gracefully on slow connections?

---

## Study Strategy

**If you have 1 week:** Focus on 01 (RSC) and 06 (Tooling) -- these come up in almost every interview.

**If you have 2 weeks:** Add 02 (Signals) and 03 (Edge Rendering) -- these demonstrate you think beyond React.

**If you have 3+ weeks:** Cover all six guides. 04 (View Transitions) and 05 (WebAssembly) show deep platform knowledge that differentiates you at staff level.

For each guide, focus on:
1. The mental model (why does this exist?)
2. The tradeoffs (when to use it, when not to)
3. One concrete code example you can write from memory
4. The common interview questions at the end

---

## Prerequisites

Before diving into these guides, ensure you are comfortable with:

- React hooks, rendering model, and reconciliation
- TypeScript generics and utility types
- HTTP/2, caching, and CDN fundamentals
- Webpack/Vite basics and module systems (ESM vs CJS)
- CSS custom properties, Grid, and Flexbox
- Node.js event loop and async patterns
