# Next-Gen Frontend Tooling

## Overview

The frontend tooling landscape has undergone a generational shift. The JavaScript-based tools that dominated for a decade -- webpack, Babel, ESLint, Prettier -- are being replaced by native-speed alternatives written in Rust, Go, and Zig. The results are dramatic: build times dropping from minutes to seconds, linting from seconds to milliseconds, and formatting becoming instant.

This is not just about speed. The new tools bring better defaults, simpler configuration, and unified tool chains that replace 3-4 separate tools with one. Understanding this landscape -- what replaced what, when to migrate, and how the tools compare -- is essential for senior frontend interviews in 2026.

---

## Core Concepts

### The Old Stack vs The New Stack

```
OLD STACK (2018-2023)                NEW STACK (2024-2026)
+-----------------+                  +-----------------+
| Webpack 5       | -- bundler -->   | Vite 6 + Rolldown|
| (or Parcel)     |                  | (or Turbopack)   |
+-----------------+                  +-----------------+
| Babel           | -- compiler -->  | SWC              |
+-----------------+                  +-----------------+
| ESLint          | -- linter -->    | oxlint / Biome   |
+-----------------+                  +-----------------+
| Prettier        | -- formatter --> | Biome / dprint   |
+-----------------+                  +-----------------+
| PostCSS         | -- CSS tools --> | Lightning CSS    |
+-----------------+                  +-----------------+
| Jest            | -- test runner ->| Vitest           |
+-----------------+                  +-----------------+
| npm / yarn      | -- pkg mgr -->  | pnpm / bun       |
+-----------------+                  +-----------------+
```

### Why the Shift to Native Tooling?

JavaScript is an interpreted language with a garbage collector. Build tools written in JavaScript hit fundamental performance limits:

1. **Single-threaded by default.** Node.js runs on one core. Parsing 10,000 files happens sequentially unless you explicitly use worker threads
2. **GC pauses.** Large builds create millions of AST nodes, triggering frequent garbage collection
3. **Parsing overhead.** JavaScript itself must be parsed and JIT-compiled before it can parse your code
4. **Memory inefficiency.** JavaScript objects have significant overhead compared to Rust structs

Native tools bypass all of these:

```
                    Webpack (JS)    Turbopack (Rust)    Improvement
------------------------------------------------------------------
Cold build (1000 modules)   8.2s         1.1s              7.5x
Hot reload (1 file change)  1.2s         0.015s            80x
Memory usage                512MB        180MB             2.8x
CPU parallelism             1 core       All cores         Nx
```

### Vite 6 + Rolldown

Vite has become the default frontend build tool. Vite 6 introduces Rolldown as its internal bundler, replacing both esbuild (dev) and Rollup (production) with a single Rust-based bundler.

```typescript
// vite.config.ts -- Vite 6
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // SWC-based React plugin

export default defineConfig({
  plugins: [react()],

  build: {
    // Rolldown is now the default bundler
    // No separate config for dev vs prod
    target: 'esnext',
    minify: 'terser', // or "esbuild"
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },

  // Environment API -- new in Vite 6
  environments: {
    client: {
      build: {
        outDir: 'dist/client',
        rollupOptions: {
          input: 'src/entry-client.tsx',
        },
      },
    },
    ssr: {
      build: {
        outDir: 'dist/server',
        rollupOptions: {
          input: 'src/entry-server.tsx',
        },
      },
    },
  },
});
```

**Why Vite 6 matters:**

- **Rolldown unification.** One bundler for dev and prod means consistent behavior. No more "works in dev but breaks in prod" bundler discrepancies
- **Environment API.** First-class support for building client and server bundles in one config
- **Performance.** Rolldown is written in Rust and handles bundling, tree-shaking, and code splitting at native speed

**Vite dev server architecture:**

```
Browser Request                     Vite Dev Server
    |                                     |
    |  GET /src/App.tsx                   |
    |------------------------------------>|
    |                                     |
    |  1. Intercept request               |
    |  2. Transform file (SWC/esbuild)    |
    |  3. Return native ESM               |
    |<------------------------------------|
    |                                     |
    |  Browser handles ESM imports        |
    |  (no bundling in dev!)              |

Key insight: Vite serves unbundled ESM in development.
Each file is a separate HTTP request, transformed on demand.
This is why dev startup is instant regardless of project size.
```

### Turbopack

Turbopack is the Rust-based bundler built by Vercel, designed specifically for Next.js.

```typescript
// next.config.ts
const nextConfig = {
  // Turbopack is the default for dev in Next.js 15
  // No configuration needed

  // For customization:
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
    resolve: {
      alias: {
        '@': './src',
      },
    },
  },
};

export default nextConfig;
```

**Turbopack vs Vite:**

| Aspect               | Turbopack                     | Vite 6                         |
| -------------------- | ----------------------------- | ------------------------------ |
| **Language**         | Rust                          | JS (Rust bundler via Rolldown) |
| **Framework**        | Next.js only                  | Framework-agnostic             |
| **Dev approach**     | Incremental bundling          | Unbundled ESM                  |
| **Caching**          | Persistent (survives restart) | In-memory                      |
| **HMR speed**        | <15ms                         | <50ms                          |
| **Production**       | Yes (Next.js 15+)             | Yes (Rolldown)                 |
| **Plugin ecosystem** | Growing (webpack-compatible)  | Large (Rollup-compatible)      |

### SWC (Speedy Web Compiler)

SWC replaces Babel for JavaScript/TypeScript compilation. Written in Rust, it is 20-70x faster than Babel.

```json
// .swcrc
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true
    },
    "transform": {
      "react": {
        "runtime": "automatic",
        "importSource": "react"
      }
    },
    "target": "es2022",
    "minify": {
      "compress": true,
      "mangle": true
    }
  },
  "module": {
    "type": "es6"
  }
}
```

**What SWC does:**

- TypeScript/JSX compilation (replaces `@babel/preset-typescript`, `@babel/preset-react`)
- JavaScript minification (replaces Terser, 7x faster)
- Module transformation (ESM to CJS and vice versa)
- Decorator support
- Dead code elimination

**What SWC does NOT do:**

- Type checking (still need `tsc` or an IDE)
- Custom Babel plugins (some have SWC equivalents, many do not)

### oxc: The Oxidation Compiler

oxc is a collection of high-performance JavaScript tools written in Rust. It includes a parser, linter, resolver, transformer, and minifier.

**oxlint (the linter):**

```bash
# Install
npm install -D oxlint

# Run -- 50-100x faster than ESLint
npx oxlint ./src

# With specific categories
npx oxlint --deny-warnings -D correctness -D perf ./src
```

```json
// .oxlintrc.json
{
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "warn",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "warn"
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.spec.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

**oxlint vs ESLint:**

| Aspect               | ESLint                 | oxlint                 |
| -------------------- | ---------------------- | ---------------------- |
| **Speed**            | ~10s for large project | ~0.1s for same project |
| **Language**         | JavaScript             | Rust                   |
| **Plugin ecosystem** | Massive (2000+)        | Growing (~200 rules)   |
| **Config**           | Complex (flat config)  | Simple JSON            |
| **Custom rules**     | JavaScript             | Rust (or WASM)         |
| **TypeScript-aware** | Via @typescript-eslint | Built-in               |
| **Auto-fix**         | Yes                    | Yes (partial)          |

**Recommended approach:** Use oxlint for the rules it supports (correctness, performance, best practices) and ESLint only for rules oxlint does not cover (framework-specific rules, custom team rules). oxlint is designed to complement ESLint, not fully replace it yet.

### Biome (Formatter + Linter)

Biome is a unified tool that replaces both Prettier and ESLint with a single binary.

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "error"
      },
      "style": {
        "useConst": "error",
        "noVar": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "performance": {
        "noDelete": "warn"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

```bash
# Format + lint + organize imports in one command
npx biome check --write ./src

# CI check (no writes)
npx biome ci ./src
```

**Biome vs Prettier + ESLint:**

| Aspect                     | Prettier + ESLint           | Biome               |
| -------------------------- | --------------------------- | ------------------- |
| **Speed (format)**         | ~3.5s                       | ~0.08s (44x faster) |
| **Speed (lint)**           | ~10s                        | ~0.15s (67x faster) |
| **Config files**           | 2+ (.prettierrc, .eslintrc) | 1 (biome.json)      |
| **Dependencies**           | ~100 npm packages           | 1 binary            |
| **Install size**           | ~50MB node_modules          | ~10MB               |
| **Prettier compatibility** | Is Prettier                 | 97%+ compatible     |
| **ESLint rules**           | 2000+                       | ~300 (growing)      |

### rspack

rspack is a Rust-based webpack replacement with near-complete webpack API compatibility.

```javascript
// rspack.config.js -- looks like webpack config
const { defineConfig } = require('@rspack/cli');

module.exports = defineConfig({
  entry: './src/index.tsx',
  output: {
    path: './dist',
    filename: '[name].[contenthash].js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic' } },
            },
          },
        },
      },
      {
        test: /\.css$/,
        type: 'css', // Native CSS handling
      },
    ],
  },
  plugins: [
    // Most webpack plugins work with rspack
    new (require('html-webpack-plugin'))({ template: './index.html' }),
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
});
```

**When to use rspack:** You have a large webpack project and want to speed up builds without rewriting config. rspack is a drop-in replacement for most webpack configurations.

### Lightning CSS

Lightning CSS is a Rust-based CSS parser, transformer, bundler, and minifier. It replaces PostCSS, Autoprefixer, and cssnano.

```javascript
// Using Lightning CSS with Vite
import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    transformer: 'lightningcss', // Use Lightning CSS instead of PostCSS
    lightningcss: {
      targets: { chrome: 100, firefox: 100, safari: 16 },
      drafts: {
        customMedia: true,
        nesting: true,
      },
    },
  },
});
```

**What Lightning CSS handles:**

- CSS nesting (native, no PostCSS plugin needed)
- Browser target transpilation (like Autoprefixer but faster)
- CSS Modules (built-in)
- Minification (faster than cssnano)
- Custom media queries
- Vendor prefixing

```css
/* Input: Modern CSS */
.card {
  color: oklch(0.7 0.15 200);

  &:hover {
    color: oklch(0.8 0.15 200);
  }

  @media (width >= 768px) {
    padding: 2rem;
  }
}

/* Output: Transpiled for targets */
.card {
  color: #00a3d7;
}
.card:hover {
  color: #33c0e8;
}
@media (min-width: 768px) {
  .card {
    padding: 2rem;
  }
}
```

### Monorepo Tools

**Turborepo:**

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

```bash
# Run build across all packages, respecting dependencies
turbo build

# Run lint in parallel across all packages
turbo lint

# Only run tasks affected by changes
turbo build --filter=...@my-org/web
```

**Nx:**

```json
// nx.json
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "cache": true
    }
  },
  "affected": {
    "defaultBase": "main"
  }
}
```

```bash
# Build only affected projects
nx affected --target=build

# Visualize project graph
nx graph

# Run with distributed caching
nx build my-app --cloud
```

**Monorepo tool comparison:**

| Feature                    | Turborepo        | Nx                      | moon                      |
| -------------------------- | ---------------- | ----------------------- | ------------------------- |
| **Language**               | Go/Rust          | TypeScript/Rust         | Rust                      |
| **Config**                 | turbo.json       | nx.json + project.json  | .moon/\*.yml              |
| **Task orchestration**     | Yes              | Yes                     | Yes                       |
| **Remote caching**         | Vercel (paid)    | Nx Cloud (free tier)    | moonbase                  |
| **Affected analysis**      | File hash based  | Project graph based     | Project graph based       |
| **Code generation**        | No               | Yes (generators)        | Yes (templates)           |
| **Constraint enforcement** | No               | Yes (module boundaries) | Yes (project constraints) |
| **Learning curve**         | Low              | Medium                  | Medium                    |
| **Best for**               | Simple monorepos | Large enterprise        | Polyglot monorepos        |

### Package Managers: pnpm and Bun

**pnpm:**

```bash
# Install dependencies (uses content-addressable store)
pnpm install

# Workspace commands
pnpm --filter @my-org/web dev       # Run dev in specific package
pnpm --filter "./packages/*" build  # Build all packages
pnpm -r lint                        # Run lint recursively
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

**pnpm advantages:**

- **Disk space:** Content-addressable store means packages are stored once globally, symlinked into projects. A project with 100 dependencies might use 90% less disk space than npm
- **Strict by default:** Packages can only access their declared dependencies (no phantom dependencies)
- **Speed:** Parallel installation, efficient caching

**Bun (as package manager):**

```bash
# Bun installs faster than npm, yarn, and pnpm
bun install           # ~10x faster than npm install
bun add react         # Add dependency
bun run dev           # Run scripts (no node_modules/.bin lookup overhead)
```

Bun is a JavaScript runtime (like Node.js) that also includes a package manager, bundler, and test runner. Its package manager is the fastest available, but the ecosystem lock-in (Bun runtime) is a consideration for teams that need Node.js compatibility.

### Module Federation 2.0

Module Federation enables independently deployed micro-frontends to share dependencies at runtime.

```javascript
// Host application -- rspack.config.js
const {
  ModuleFederationPlugin,
} = require('@module-federation/enhanced/rspack');

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'host',
      remotes: {
        // Load remote module at runtime
        checkout: 'checkout@https://checkout.example.com/remoteEntry.js',
        catalog: 'catalog@https://catalog.example.com/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
      },
    }),
  ],
};
```

```javascript
// Remote application (checkout) -- rspack.config.js
const {
  ModuleFederationPlugin,
} = require('@module-federation/enhanced/rspack');

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'checkout',
      filename: 'remoteEntry.js',
      exposes: {
        './CheckoutForm': './src/components/CheckoutForm',
        './CartWidget': './src/components/CartWidget',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
      },
    }),
  ],
};
```

```tsx
// Host app consuming remote component
import React, { Suspense, lazy } from 'react';

const CheckoutForm = lazy(() => import('checkout/CheckoutForm'));
const CartWidget = lazy(() => import('catalog/CartWidget'));

function App() {
  return (
    <div>
      <h1>My Store</h1>
      <Suspense fallback={<div>Loading cart...</div>}>
        <CartWidget />
      </Suspense>
      <Suspense fallback={<div>Loading checkout...</div>}>
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
```

**Module Federation 2.0 improvements:**

- **Type safety:** Automatically generates and consumes TypeScript types across remotes
- **Runtime API:** Dynamic remote loading without build-time configuration
- **Version negotiation:** Smarter shared dependency resolution
- **Framework agnostic:** Works with React, Vue, Angular, and Solid
- **Rspack support:** First-class support alongside webpack

### Migration Guides

**webpack to Vite:**

```bash
# 1. Install Vite
npm install -D vite @vitejs/plugin-react-swc

# 2. Create vite.config.ts (see Vite section above)

# 3. Move index.html to project root (Vite uses it as entry)
# Add: <script type="module" src="/src/main.tsx"></script>

# 4. Update imports
# require() --> import
# process.env.REACT_APP_* --> import.meta.env.VITE_*
# __dirname --> import.meta.url

# 5. Update package.json scripts
# "dev": "vite"
# "build": "vite build"
# "preview": "vite preview"
```

**ESLint + Prettier to Biome:**

```bash
# 1. Install Biome
npm install -D @biomejs/biome

# 2. Initialize config
npx biome init

# 3. Migrate ESLint rules
npx biome migrate eslint --write

# 4. Migrate Prettier config
npx biome migrate prettier --write

# 5. Update package.json scripts
# "lint": "biome lint ./src"
# "format": "biome format --write ./src"
# "check": "biome check --write ./src"  (lint + format + imports)

# 6. Remove old dependencies
npm uninstall eslint prettier eslint-config-prettier @typescript-eslint/eslint-plugin ...
```

**Babel to SWC:**

```bash
# If using Vite:
npm install -D @vitejs/plugin-react-swc
# Replace @vitejs/plugin-react with @vitejs/plugin-react-swc in vite.config.ts

# If using Next.js:
# SWC is the default compiler -- no action needed

# If standalone:
npm install -D @swc/core @swc/cli
# Replace babel.config.js with .swcrc
# Replace "babel" scripts with "swc" in package.json
```

---

## Common Interview Questions

### Q1: Why has the frontend ecosystem moved from JavaScript-based build tools to native-speed alternatives?

**Answer:** The fundamental reason is performance ceiling. JavaScript-based tools like webpack, Babel, and ESLint are single-threaded by default, include garbage collection overhead, and must be parsed and JIT-compiled before they can process your code. As projects grew to thousands of files, these tools became the bottleneck in development workflows -- slow cold starts, slow HMR, slow CI pipelines.

Native tools written in Rust (SWC, Turbopack, oxlint, Lightning CSS) or Go (esbuild) bypass these limitations. They use all CPU cores, have no GC pauses, and start executing immediately. The result is 10-100x speedups for common operations: SWC compiles TypeScript 20x faster than Babel, oxlint lints 50x faster than ESLint, and Biome formats 40x faster than Prettier.

The tradeoff is plugin ecosystem maturity. Webpack has thousands of plugins; Vite/Rolldown has hundreds but growing. ESLint has 2000+ rules from community plugins; oxlint has ~200 built-in rules. The migration strategy most teams follow is: adopt native tools for what they support, keep JavaScript tools for niche requirements, and gradually migrate as the native ecosystem catches up.

### Q2: When would you choose Vite over Turbopack (or vice versa)?

**Answer:** Vite is the right choice when you want framework flexibility. It works with React, Vue, Svelte, Solid, and others. Its plugin ecosystem (Rollup-compatible) is large and mature. It is the standard build tool for non-Next.js React projects, all Vue projects, and most Svelte projects.

Turbopack is the right choice when you are using Next.js. It is deeply integrated with Next.js's architecture (RSC, App Router, middleware), and Vercel optimizes the two together. Turbopack's persistent caching across dev server restarts is a unique advantage for large Next.js projects.

If I am starting a new project without Next.js, I choose Vite. If I am building with Next.js, I use Turbopack (it is the default in Next.js 15 dev mode). If I have an existing webpack project that is too large to migrate to Vite, I consider rspack as a drop-in replacement that reuses existing webpack config.

### Q3: Explain the difference between oxlint and Biome. Which would you recommend?

**Answer:** oxlint is a standalone linter focused on being the fastest possible lint tool. It implements a curated set of rules (~200) covering correctness, performance, and best practices. It is designed to run alongside ESLint, handling the rules it supports while ESLint handles the rest.

Biome is a unified tool that combines formatting, linting, and import organization in a single binary. It aims to replace both Prettier and ESLint entirely. It has ~300 lint rules and near-perfect Prettier formatting compatibility.

My recommendation depends on the team's situation. For teams already using ESLint with many custom rules and framework-specific plugins, I recommend adding oxlint as a fast first pass and keeping ESLint for the rules oxlint does not cover. For new projects or teams willing to migrate, I recommend Biome because it eliminates the need for multiple tools, reduces configuration complexity, and provides a faster, simpler workflow.

### Q4: What is Module Federation and when should you use it?

**Answer:** Module Federation is a webpack/rspack feature that allows independently built and deployed applications to share modules at runtime. It is the technical foundation for micro-frontend architectures.

Use it when: you have multiple teams that need to deploy independently (a checkout team, a catalog team, a user account team), your application is large enough that a monolithic build is slow and risky, or you need to share components between separately deployed applications without publishing to npm.

Do not use it when: your team is small (under ~15 developers), your application is small enough for a monorepo with a single build, or you do not have the infrastructure for independent deployments. Module Federation adds complexity: version negotiation for shared dependencies, runtime loading failures, and debugging across application boundaries. It is a tool for organizational scale problems, not technical ones.

### Q5: How would you set up a modern frontend monorepo from scratch?

**Answer:** I would use pnpm for package management (strict dependency resolution, disk-efficient), Turborepo for task orchestration (simple config, good caching), Vite for building applications, and Biome for formatting and linting.

The structure would be: `apps/` for deployable applications, `packages/` for shared libraries and UI components, and `tooling/` for shared configuration (TypeScript config, Biome config).

Each package would have its own `package.json` with explicit dependencies. Turborepo would handle build ordering (libraries build before apps that depend on them), test parallelization, and caching (only rebuild what changed). pnpm workspaces would handle dependency hoisting and linking.

For CI, I would enable Turborepo remote caching so that builds cached locally or by other CI runs are reused. This typically cuts CI time by 50-80% for incremental changes.

### Q6: Compare pnpm, npm, yarn, and bun as package managers.

**Answer:** npm is the default and most compatible. It works everywhere and has no setup friction, but it is the slowest and uses the most disk space due to flat `node_modules`.

yarn (Berry/v4) introduced Plug'n'Play (PnP) which eliminates `node_modules` entirely, using a `.pnp.cjs` file to map imports to a global cache. It is fast and disk-efficient, but PnP compatibility issues with some packages remain a pain point.

pnpm uses a content-addressable store and symlinked `node_modules`. It is fast, disk-efficient, and strict by default (packages can only access declared dependencies, preventing phantom dependencies). It is the recommended choice for monorepos and teams that value correctness.

bun is the fastest for raw install speed (~10x faster than npm). It is a JavaScript runtime that includes a package manager. The downside is ecosystem maturity: bun occasionally has compatibility issues with packages that assume Node.js behavior, and some CI environments do not support it natively.

My default recommendation is pnpm for most teams: it balances speed, correctness, and compatibility.

---

## Gotchas & Edge Cases

1. **Vite dev vs build differences.** Vite uses native ESM in development (unbundled) but Rolldown for production (bundled). Code that works in dev may fail in production due to different module resolution or tree-shaking. Always test production builds locally with `vite build && vite preview`.

2. **SWC does not type-check.** SWC strips TypeScript types and compiles to JavaScript. It does not report type errors. You still need `tsc --noEmit` in your CI pipeline or an IDE for type checking. This is a common source of "it compiled but has type errors" confusion.

3. **Biome formatting differences from Prettier.** While Biome achieves ~97% Prettier compatibility, the remaining 3% can cause formatting changes when migrating. Run `biome format --write` once, commit the changes, and your team will not notice going forward.

4. **pnpm strict mode breaks some packages.** Packages that rely on phantom dependencies (accessing packages they did not declare as dependencies) will fail with pnpm. The fix is usually to add the missing dependency explicitly or use `pnpm.overrides` to provide it.

5. **Turbopack does not support all webpack loaders.** While Turbopack aims for webpack compatibility, many community loaders do not work yet. Check the compatibility list before migrating a project with custom webpack loaders.

6. **Module Federation shared dependencies version mismatch.** If the host and remote specify different versions of a shared dependency (like React), the runtime negotiation can fail or load duplicate bundles. Always pin shared dependency versions across all federated applications.

7. **Lightning CSS and PostCSS plugin ecosystem.** Switching to Lightning CSS means losing access to PostCSS plugins like `postcss-custom-properties` polyfill or `postcss-import`. Evaluate which PostCSS plugins you actually use before switching.

8. **Monorepo cache invalidation.** Both Turborepo and Nx cache task results by hashing inputs. If an input changes (environment variable, external dependency version) but the hash does not capture it, you get stale cache hits. Always declare `globalDependencies` for environment files.

9. **Bun lockfile compatibility.** Bun uses its own binary lockfile format (`bun.lockb`). Teams with mixed tooling (some developers using npm/pnpm, others using bun) will have lockfile conflicts. Standardize on one package manager.

10. **ESM/CJS interop in native tools.** The JavaScript ecosystem still has mixed ESM and CJS packages. Native bundlers handle this differently than webpack. `default` imports from CJS modules may behave differently. Use `import pkg from 'cjs-package'` instead of `import { named } from 'cjs-package'` for CJS interop.

---

## Quick Reference

| Tool              | Replaces                         | Language       | Speed Improvement            |
| ----------------- | -------------------------------- | -------------- | ---------------------------- |
| SWC               | Babel                            | Rust           | 20-70x                       |
| Turbopack         | webpack (for Next.js)            | Rust           | 5-80x                        |
| Vite 6 (Rolldown) | webpack                          | JS + Rust      | 5-10x (build), instant (dev) |
| rspack            | webpack (drop-in)                | Rust           | 5-10x                        |
| oxlint            | ESLint (partial)                 | Rust           | 50-100x                      |
| Biome             | ESLint + Prettier                | Rust           | 40-70x                       |
| Lightning CSS     | PostCSS + Autoprefixer + cssnano | Rust           | 100x+                        |
| Vitest            | Jest                             | JS (uses Vite) | 2-5x                         |
| pnpm              | npm/yarn                         | JS             | 2-3x install, 90% less disk  |
| bun               | Node.js + npm                    | Zig/C++        | 10x install, 3-5x runtime    |

| Decision                        | Recommendation                            |
| ------------------------------- | ----------------------------------------- |
| New React project (no Next.js)  | Vite + SWC + Biome                        |
| New Next.js project             | Turbopack (default) + Biome               |
| Migrating large webpack project | rspack (drop-in) or Vite (if feasible)    |
| Monorepo orchestration          | Turborepo (simple) or Nx (enterprise)     |
| Package manager                 | pnpm (general) or bun (speed-focused)     |
| Linting (new project)           | Biome (unified)                           |
| Linting (existing ESLint)       | Add oxlint, keep ESLint for custom rules  |
| CSS processing                  | Lightning CSS (via Vite)                  |
| Formatting                      | Biome (if using Biome for lint) or dprint |

| Bundler           | Best For                    | Plugin Compat             |
| ----------------- | --------------------------- | ------------------------- |
| Vite 6 (Rolldown) | Framework-agnostic projects | Rollup plugins            |
| Turbopack         | Next.js projects            | webpack loaders (partial) |
| rspack            | webpack migration           | webpack plugins (most)    |
| esbuild           | Simple builds, libraries    | Limited                   |
| Rollup            | Library bundling            | Rollup plugins            |
| Parcel            | Zero-config prototyping     | Custom plugins            |
