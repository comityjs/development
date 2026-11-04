# Comity Coding Standards — Runtime Support

> **Provenance:**
> - Authoritative owner: `comity-development`
> - This is the canonical runtime support matrix for the `@comity/*` package set.

This document records the actual runtime support contract of Comity packages as verified during Phase 6.5. It is **normative** for publishing and runtime-compatibility claims. No package may claim a runtime it does not actually support.

---

## 1. Node

Node `>=24` is the baseline runtime for server-side / runtime packages.

Every `@comity/*` package declares `"engines": { "node": ">=24.0.0" }` and is built and tested against Node 24. Server-side and runtime packages rely only on the Node 24 LTS baseline.

The supported range is Node ≥ 24 by `engines`; `require(esm)` is available in earlier Node majors, but Comity claims no runtime below its `engines` floor.

### Distribution format (ADR-034)

Every Comity package ships a **single ESM distribution in one flat `dist/` directory**: JavaScript and TypeScript declarations side by side (`dist/index.js` next to `dist/index.d.ts`). There is no CommonJS build, no `dist/esm`, `dist/types` or `dist/cjs` tree and no package-level CommonJS exception. Each exported subpath maps `types` to its `.d.ts` and `default` to its `.js` (no separate `import` / `require` branches), so Node's `import` and `require(esm)` resolve to the **same** ESM file and yield one module instance and one set of classes.

Three distinct statements, not one:

- **`import` (ESM-native)** — the primary contract, unchanged in every environment that consumes ESM: Node, bundlers, Edge/Workers, browsers.
- **`require` (Node only)** — supported only on Node.js `>=24.0.0`, matching `engines`, through `require(esm)`, which resolves the package's `default` condition. No other runtime is claimed for the `require` condition. `require(esm)` returns the module namespace; a module with a default export carries `__esModule: true` and `default`.
- **`engines.node`** — the baseline for Node runtimes and for tooling executing the packages in Node. It is not a requirement on Edge, Workers or browser runtimes, which do not execute through Node.

`require(esm)` requires a **synchronous** module graph: a graph containing top-level `await` fails with `ERR_REQUIRE_ASYNC_MODULE`. Comity's published graphs are synchronous; `import` is unaffected either way.

## 2. Edge / Workers

Packages are supported on Edge / Workers runtimes where the implementation uses WinterCG / Web APIs and has no Node-only dependency.

**Condition scope (ADR-034).** The claims in this section are scoped to the **`import`** condition. Because `main` and Node's `require` resolution now reach ESM, a resolver that reads `main` rather than `exports` (older bundler configurations, `moduleResolution: node10`, some Workers build paths) receives ESM; **that path is unverified outside Node** and no support is claimed for it.

The census in Phase 6.5 found **no** runtime package importing `node:crypto`, `node:fs`, `node:path`, `Buffer`, `process.env`, `__dirname`, or `__filename`. The only `crypto.randomUUID()` usages are:

- `packages/order/src/entities/order.ts` — bound by entity ID generation (a permitted boundary-ID exception, see `layering-policy.md §7.2`).
- `packages/http-hono/src/internal/context.ts` — adapter-owned HTTP request-ID minting at the adapter boundary.

Both are permitted exceptions; neither is a runtime-facility import. Packages that consume only Web APIs (`fetch`, `ReadableStream`, `Headers`, `URL`, `crypto.randomUUID`, standard URL handling) are therefore Edge-runnable.

## 3. Browser / client-only

**Condition scope (ADR-034).** As in §2, the claims in this section are scoped to the **`import`** condition; the `require`/`main` path is unverified outside Node and no support is claimed for it.

The following packages are explicitly **browser/client-only** surfaces:

- `@comity/hydration/client`
- `@comity/hydration-preact` client runtime
- `@comity/hydration-react` client runtime

### client-only does not mean import-unsafe

`@comity/hydration/client` must remain import-safe outside a browser. Importing the client module in Node / SSR must not dereference browser globals. Actual DOM-dependent construction / registration may throw the documented `HydrationError("no_dom")` (code `hydration:no_dom`).

## 4. HTML streaming

There is **no** package export condition that explicitly requires Node for streaming. The actual condition split is:

- **Web / Edge streaming path** — `packages/html` models rendered output as `HtmlOutput`, whose `body` is a Web API `ReadableStream<Uint8Array>` (`packages/html/src/contracts/render-result.ts`). This is WinterCG-compatible and runs on Edge / Workers / Browser.
- **Node-specific streaming** — There is no Node-only streaming export condition. Node adapters (e.g. `@comity/http-hono`) consume the Web Streams output at the adapter boundary; they do not introduce a separate Node streaming export.

## 5. GraphQL WebSocket

`@comity/graphql-client-ws` adapts the `@comity/graphql-client` transport contract to GraphQL over WebSocket. Its `WsGraphqlTransport` accepts either an injected `graphql-ws` `Client` instance or a URL/connection-params pair from which it constructs a client via `graphql-ws` `createClient`.

Prerequisite: `graphql-ws` (declared as a `peerDependency`) requires a runtime `WebSocket` implementation. On platforms without a native `WebSocket` global (Node before 21, some Edge runtimes), a `WebSocket` polyfill / injected `Client` must be supplied; Comity does not ship or select a WebSocket implementation — this is a consumer-provided prerequisite and is not changed by implementation.