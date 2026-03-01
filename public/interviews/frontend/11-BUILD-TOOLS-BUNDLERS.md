# Build Tools & Bundlers

## Overview

Build tools and bundlers are the machinery that transforms your source code into optimized bundles that browsers can execute. Understanding how they work is essential for diagnosing slow builds, optimizing bundle size, configuring complex project setups, and making informed architectural decisions. In interviews, questions in this area test whether you understand the "why" behind your tooling choices, not just the "how" of configuration files. The landscape has shifted dramatically from Webpack dominance to a diverse ecosystem including Vite, esbuild, Rollup, and Turbopack, each with distinct trade-offs.

## Core Concepts

### Module Systems

Before understanding bundlers, you need to understand the module formats they process.

**ES Modules (ESM)** - The standard module system for JavaScript. Statically analyzable, enabling tree shaking.

```js
// Named exports
export function add(a, b) { return a + b }
export const PI = 3.14159

// Default export
export default function multiply(a, b) { return a * b }

// Import
import multiply, { add, PI } from './math.js'

// Dynamic import (code splitting)
const module = await import('./heavyModule.js')
```

**CommonJS (CJS)** - Node.js module system. Dynamic, not statically analyzable.

```js
// Export
module.exports = { add, multiply }
// or
exports.add = function(a, b) { return a + b }

// Import
const { add } = require('./math')

// Dynamic (can be conditional)
if (needsMath) {
  const math = require('./math')
}
```

**UMD (Universal Module Definition)** - Works in browsers (global), CommonJS, and AMD. Used for libraries that need to run everywhere.

```js
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['dependency'], factory)
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('dependency'))
  } else {
    root.MyLibrary = factory(root.Dependency)
  }
}(typeof self !== 'undefined' ? self : this, function (dependency) {
  // Library code
  return { /* public API */ }
}))
```

| Format | Static Analysis | Tree Shaking | Browser Native | Node.js Native | Async Loading |
|---|---|---|---|---|---|
| ESM | Yes | Yes | Yes | Yes (with config) | Yes (dynamic import) |
| CJS | No | Limited | No | Yes | No |
| UMD | No | No | Yes (global) | Yes | No |
| AMD | Partial | No | With loader | No | Yes |

### Webpack

Webpack is the most mature and feature-rich bundler. It treats everything as a module (JS, CSS, images, fonts) through its loader system.

**Core Concepts:**

```js
// webpack.config.js
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

module.exports = {
  // Entry: Where bundling starts
  entry: {
    main: './src/index.tsx',
    vendor: './src/vendor.ts'
  },

  // Output: Where bundles are written
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].chunk.js',
    clean: true
  },

  // Module: How different file types are processed
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,  // Extract CSS to files
          'css-loader',                  // Resolve CSS imports
          'postcss-loader'               // PostCSS transformations
        ]
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        type: 'asset',                  // Built-in asset modules (Webpack 5)
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024            // Inline if < 8KB
          }
        }
      },
      {
        test: /\.(woff|woff2)$/,
        type: 'asset/resource'
      }
    ]
  },

  // Plugins: Extend Webpack functionality
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css'
    }),
    process.env.ANALYZE && new BundleAnalyzerPlugin()
  ].filter(Boolean),

  // Resolve: How modules are found
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },

  // Optimization: Code splitting and minification
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        },
        common: {
          minChunks: 2,
          priority: -10,
          reuseExistingChunk: true
        }
      }
    },
    runtimeChunk: 'single'
  },

  // DevServer: Development server with HMR
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8080'
      }
    ]
  }
}
```

**Loaders** transform files. They are functions that take source code and return transformed code. They chain right-to-left:

```js
// This chain: sass-loader -> css-loader -> style-loader
// 1. sass-loader compiles SCSS to CSS
// 2. css-loader resolves @import and url()
// 3. style-loader injects CSS into the DOM
{
  test: /\.scss$/,
  use: ['style-loader', 'css-loader', 'sass-loader']
}
```

**Plugins** extend Webpack's build process. They hook into the compilation lifecycle:

| Plugin | Purpose |
|---|---|
| HtmlWebpackPlugin | Generates HTML with script tags |
| MiniCssExtractPlugin | Extracts CSS into separate files |
| DefinePlugin | Define compile-time constants |
| CopyWebpackPlugin | Copy static files to output |
| BundleAnalyzerPlugin | Visualize bundle composition |
| CompressionPlugin | Generate gzip/brotli compressed files |

**Hot Module Replacement (HMR)** - Updates modules in the browser without a full page reload, preserving application state.

```js
// Webpack HMR API
if (module.hot) {
  module.hot.accept('./App', () => {
    // Re-render with updated component
    const NextApp = require('./App').default
    render(<NextApp />, document.getElementById('root'))
  })
}
```

React Fast Refresh (used by Create React App, Next.js) builds on HMR to preserve React component state during updates.

### Vite

Vite takes a fundamentally different approach to development tooling. In development, it serves ES modules directly to the browser and uses esbuild for pre-bundling dependencies. For production, it uses Rollup for bundling.

**Why Vite is fast in development:**

1. **No bundling in dev** - Serves source files as native ES modules. The browser handles module resolution.
2. **esbuild pre-bundling** - Converts CJS dependencies to ESM and bundles many small modules into fewer files (dependency pre-bundling). esbuild is 10-100x faster than JavaScript-based tools.
3. **On-demand compilation** - Only transforms files when the browser requests them, not the entire project upfront.
4. **HMR over native ESM** - Updates are instant because only the changed module is invalidated, not the entire bundle graph.

```js
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },

  build: {
    // Production uses Rollup
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom']
        }
      }
    },
    sourcemap: true,
    target: 'es2020',
    minify: 'terser'   // or 'esbuild' (faster but less optimized)
  },

  css: {
    modules: {
      localsConvention: 'camelCase'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/variables.scss";`
      }
    }
  },

  // Environment variables
  // Only VITE_ prefixed variables are exposed to client code
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
})
```

**Vite Plugin System:**

Vite plugins extend Rollup's plugin interface with additional Vite-specific hooks.

```js
// Simple custom plugin
function myPlugin() {
  return {
    name: 'my-plugin',

    // Rollup hooks (work in both dev and build)
    resolveId(source) {
      if (source === 'virtual:my-module') {
        return source
      }
    },
    load(id) {
      if (id === 'virtual:my-module') {
        return `export const timestamp = ${Date.now()}`
      }
    },

    // Vite-specific hooks
    configureServer(server) {
      server.middlewares.use('/health', (req, res) => {
        res.end('OK')
      })
    },
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `<script>window.__BUILD_TIME__ = "${new Date().toISOString()}"</script></head>`
      )
    }
  }
}
```

**Dev vs Build differences:**
| Aspect | Development | Production Build |
|---|---|---|
| Bundler | None (native ESM) | Rollup |
| Transpiler | esbuild | esbuild + Rollup plugins |
| HMR | Native ESM-based | N/A |
| Speed | Instant startup | Full optimization |
| Code Splitting | Browser-native | Rollup chunks |
| Minification | None | Terser or esbuild |

### esbuild

esbuild is an extremely fast bundler/transpiler written in Go. It is 10-100x faster than JavaScript-based tools because it uses parallelism, shared memory, and avoids AST-to-string serialization.

```js
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  outdir: 'dist',
  splitting: true,
  format: 'esm',
  loader: {
    '.png': 'file',
    '.svg': 'text'
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  external: ['fsevents']
})
```

**Limitations of esbuild:**
- No built-in HMR (used as a tool within other systems)
- Limited CSS handling compared to PostCSS
- No support for some advanced TypeScript features (decorators with metadata)
- No HTML generation
- Plugin ecosystem is smaller than Webpack's

### Rollup

Rollup is designed for library bundling and produces clean, efficient output. It pioneered tree shaking.

```js
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import { dts } from 'rollup-plugin-dts'

export default [
  // Main build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: true
      },
      {
        file: 'dist/index.umd.js',
        format: 'umd',
        name: 'MyLibrary',
        sourcemap: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      terser()
    ],
    external: ['react', 'react-dom']
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'esm' },
    plugins: [dts()]
  }
]
```

**When to use Rollup:**
- Building libraries (produces cleaner output than Webpack)
- When you need multiple output formats (CJS, ESM, UMD)
- When tree shaking quality matters (Rollup's is the most thorough)

### Turbopack

Turbopack is the Webpack successor built by Vercel in Rust. It is designed for incremental computation.

Key features:
- **Incremental computation** - Only recomputes what changed, caching everything else
- **Function-level caching** - Caches the result of every function in the build pipeline
- **Rust-based** - Native performance without garbage collection pauses
- **Next.js integration** - First-class support in Next.js (enabled with `--turbopack` flag)

```bash
# Next.js with Turbopack
npx next dev --turbopack
```

As of 2025, Turbopack is stable for Next.js development but not yet a standalone general-purpose bundler.

### Tree Shaking Deep Dive

Tree shaking eliminates dead code by analyzing the static structure of ES module imports and exports.

```js
// math.js
export function add(a, b) { return a + b }       // Used -> kept
export function subtract(a, b) { return a - b }  // Unused -> removed
export function multiply(a, b) { return a * b }  // Unused -> removed

// app.js
import { add } from './math.js'
console.log(add(1, 2))
// Only `add` ends up in the final bundle
```

**Side effects** prevent tree shaking:

```js
// This file has side effects - importing it runs code
import './polyfills.js'    // Cannot be tree-shaken

// CSS imports are side effects
import './styles.css'

// Top-level function calls are side effects
console.log('module loaded')
registerPlugin(myPlugin)
```

Mark your package as side-effect-free in package.json:

```json
{
  "sideEffects": false
}

// Or specify which files have side effects:
{
  "sideEffects": ["*.css", "*.scss", "./src/polyfills.js"]
}
```

### Source Maps

Source maps connect minified/bundled code back to original source, enabling debugging in production.

```js
// Webpack
module.exports = {
  // Development: fast rebuild, maps to original lines
  devtool: 'eval-cheap-module-source-map',

  // Production: full mapping, separate file
  // devtool: 'source-map',

  // Production (hidden): map exists but not referenced in bundle
  // devtool: 'hidden-source-map',
}
```

| Type | Speed | Quality | Production Safe |
|---|---|---|---|
| `eval` | Fastest | Low | No |
| `eval-cheap-module-source-map` | Fast | Medium | No |
| `source-map` | Slow | High | Yes (with access control) |
| `hidden-source-map` | Slow | High | Yes |
| `nosources-source-map` | Slow | Medium | Yes |

**Security concern:** Never serve source maps publicly in production. They expose your entire source code. Use `hidden-source-map` and upload maps to error tracking services (Sentry, Datadog) privately.

### Environment Variables

```js
// Webpack: DefinePlugin
const webpack = require('webpack')

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(process.env.API_URL),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
    })
  ]
}

// Vite: import.meta.env
// Only VITE_ prefixed variables are exposed
// .env
// VITE_API_URL=https://api.example.com
// SECRET_KEY=abc123  <-- NOT exposed to client

// Usage in code:
const apiUrl = import.meta.env.VITE_API_URL

// Next.js: NEXT_PUBLIC_ prefix
// .env.local
// NEXT_PUBLIC_API_URL=https://api.example.com
// DATABASE_URL=postgres://...  <-- Server only

// Usage:
const apiUrl = process.env.NEXT_PUBLIC_API_URL
```

### Monorepo Tools

**Turborepo** - Task runner for monorepos. Caches build outputs and runs tasks in parallel.

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Nx** - Full monorepo framework with dependency graph analysis, affected commands, and generators.

```bash
# Only run tests for projects affected by recent changes
npx nx affected --target=test

# Visualize dependency graph
npx nx graph

# Generate a new library
npx nx generate @nx/react:library shared-ui
```

| Feature | Turborepo | Nx |
|---|---|---|
| Task orchestration | Yes | Yes |
| Remote caching | Yes (Vercel) | Yes (Nx Cloud) |
| Dependency graph | Implicit (file-based) | Explicit + implicit |
| Code generation | No | Yes (generators) |
| Affected commands | Via git diff | Via dependency graph |
| Plugin system | No | Extensive |
| Learning curve | Low | Medium-High |
| Best for | Simple monorepos | Large, complex monorepos |

## Common Interview Questions

### 1. Why is Vite faster than Webpack in development?

Vite does not bundle your source code in development at all. It serves files as native ES modules, letting the browser handle module resolution through `<script type="module">`. Dependencies (node_modules) are pre-bundled once with esbuild for performance. When you edit a file, only that single module is invalidated and re-served. Webpack, in contrast, rebuilds the entire dependency graph from the changed module upward, which gets slower as the project grows.

### 2. Explain how tree shaking works and what can prevent it.

Tree shaking uses static analysis of ES module `import`/`export` statements to determine which exports are used. Unused exports are marked as dead code and removed by the minifier. It requires ES modules (not CommonJS, which is dynamic). Side effects prevent tree shaking because the bundler cannot safely remove code that might do something when imported. Setting `"sideEffects": false` in package.json tells the bundler it is safe to prune unused imports from that package.

### 3. What is the difference between a loader and a plugin in Webpack?

Loaders transform individual files as they are added to the dependency graph. They are functions that take source content and return transformed content. Example: `babel-loader` transpiles JSX to JavaScript. Plugins operate on the entire compilation. They hook into Webpack's lifecycle events and can modify the output, generate additional files, or optimize the bundle. Example: `HtmlWebpackPlugin` generates an HTML file that includes all output bundles.

### 4. When would you choose Rollup over Webpack?

Choose Rollup for library development. Rollup produces cleaner output (less runtime wrapper code), supports multiple output formats (CJS, ESM, UMD) in a single config, and has superior tree shaking. Choose Webpack for applications that need HMR, complex loader chains, code splitting with dynamic imports, and a mature plugin ecosystem. In practice, Vite gives you the best of both worlds -- Rollup for production builds with Vite's dev server.

### 5. How do you handle environment variables securely in a frontend build?

Never embed secrets (API keys, database credentials) in client-side bundles -- they are visible to anyone inspecting the code. Use a prefix convention (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`) to explicitly mark variables intended for the client. Server-only variables should never have the prefix and should only be accessed in server-side code (API routes, getServerSideProps). Use `.env.local` for local overrides and never commit it. Validate that required environment variables exist at build time.

### 6. What is code splitting and what strategies can you use?

Code splitting breaks a single bundle into multiple chunks loaded on demand. Strategies: (1) Route-based splitting with `React.lazy()` and dynamic `import()` -- the highest-impact, lowest-effort approach. (2) Component-level splitting for heavy components (editors, charts, maps). (3) Vendor splitting to separate node_modules into a long-cached chunk. (4) Manual chunks via `optimization.splitChunks` (Webpack) or `manualChunks` (Rollup/Vite) for fine-grained control. The goal is to load only the code needed for the current view.

### 7. What is HMR and how does it work?

Hot Module Replacement updates changed modules in the browser without a full page reload, preserving application state. When a file changes, the dev server sends the update to the client over WebSocket. The HMR runtime checks if the module or any of its parents can accept the update. If so, it replaces the old module with the new one. If no module in the chain can accept the update, it falls back to a full reload. React Fast Refresh extends HMR to preserve React component state, including hooks.

### 8. Compare Turborepo and Nx for monorepo management.

Turborepo is simpler: it focuses on task orchestration and caching with minimal configuration. It uses `turbo.json` to define a pipeline of tasks and their dependencies, then runs them in parallel with content-aware caching. Nx is more comprehensive: it builds an explicit dependency graph, provides code generators, supports affected commands based on the graph (not just file changes), and has a rich plugin system. Choose Turborepo for straightforward monorepos where you mainly need caching and parallel execution. Choose Nx for large monorepos needing architectural enforcement, custom generators, and fine-grained dependency management.

## Code Examples

### Webpack to Vite Migration Checklist

```js
// Webpack: require syntax and DefinePlugin
const path = require('path')
const webpack = require('webpack')

module.exports = {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(process.env.API_URL)
    })
  ]
}

// Vite: ESM config, import.meta.env
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  define: {
    // Rename process.env.X to import.meta.env.VITE_X in source code
  }
})
```

Migration steps:
1. Replace `process.env.REACT_APP_*` with `import.meta.env.VITE_*` in source code
2. Convert `require()` to `import` in config and source files
3. Move HTML entry to project root (Vite uses `index.html` as entry)
4. Replace Webpack loaders with Vite plugins (most frameworks have official plugins)
5. Update proxy configuration syntax
6. Remove `node:` prefixed imports from client code

### Library Build Configuration

```js
// vite.config.ts for a library
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'] })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyComponentLib',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format}.js`
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
})
```

```json
// package.json for the library
{
  "name": "my-component-lib",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.cjs.js",
  "module": "dist/index.es.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.es.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

## Gotchas & Edge Cases

1. **CJS/ESM interop**: Importing a CJS module from ESM works (bundlers handle it), but importing ESM from CJS does not work synchronously. Use dynamic `import()` or convert your project to ESM.

2. **Vite dev/build differences**: Code that works in Vite's dev server may break in the production build because dev uses native ESM while production uses Rollup. Always test the production build.

3. **Source map exposure**: Deploying `.map` files publicly exposes your source code. Use `hidden-source-map` and upload maps to your error tracking service.

4. **Dynamic import() expressions**: `import(variable)` defeats code splitting because the bundler cannot determine which module to load. Use explicit paths: `import('./pages/' + pageName + '.js')` gives the bundler a directory to analyze.

5. **Circular dependencies**: Both Webpack and Rollup handle circular dependencies, but they can cause subtle runtime bugs (accessing a module before it is fully initialized). ESLint plugin `eslint-plugin-import` can detect these.

6. **ContentHash vs Hash**: In Webpack 5, use `[contenthash]` for cache busting. `[hash]` is based on the entire compilation, meaning all files change hash even if only one file changed. `[contenthash]` only changes when the file's content changes.

7. **Vite VITE_ prefix requirement**: Forgetting the `VITE_` prefix means your environment variable is `undefined` in client code. This is a security feature, not a bug -- it prevents accidental exposure of server secrets.

8. **Tree shaking babel transforms**: Babel can transform ES modules to CommonJS if `@babel/preset-env` has `modules: "commonjs"` (or `"auto"` in certain configs). This kills tree shaking. Set `modules: false` to preserve ESM syntax for the bundler.

## Quick Reference

| Tool | Written In | Primary Use | Dev Speed | Build Speed | Ecosystem |
|---|---|---|---|---|---|
| Webpack | JavaScript | Applications | Medium | Medium | Largest |
| Vite | JavaScript + Go (esbuild) | Applications | Fast | Fast | Growing |
| esbuild | Go | Transpiling/bundling | N/A | Fastest | Small |
| Rollup | JavaScript | Libraries | N/A | Medium | Good |
| Turbopack | Rust | Next.js apps | Fastest | Fast | Next.js |
| SWC | Rust | Transpiling | N/A | Very fast | Growing |
| Parcel | JavaScript + Rust | Zero-config apps | Fast | Fast | Small |

| Task | Webpack | Vite | Rollup |
|---|---|---|---|
| Config format | CJS (webpack.config.js) | ESM (vite.config.ts) | ESM (rollup.config.js) |
| File transforms | Loaders | Plugins (Rollup-compatible) | Plugins |
| Code splitting | splitChunks + dynamic import | Rollup manualChunks | manualChunks |
| CSS processing | css-loader + style-loader | Built-in | Plugin |
| TypeScript | ts-loader or babel | esbuild (dev), Rollup (build) | @rollup/plugin-typescript |
| Dev server | webpack-dev-server | Built-in | Plugin (rollup-plugin-serve) |
| HMR | webpack-dev-server | Built-in (native ESM) | N/A |
| Tree shaking | Yes (production mode) | Yes (via Rollup) | Yes (best) |
| Source maps | devtool option | build.sourcemap | output.sourcemap |
