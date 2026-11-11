/**
 * @comity-dev/no-layer-violation
 *
 * Forbid imports that violate Comity's canonical layering policy.
 *
 * The permitted edges per source layer are the table `LAYER_PROFILES` below. They follow
 * ADR-025 §5 (formal package dependencies: Application → Technology Adapters → Core
 * Modules → composition → kernel → primitives; every edge points downward), together with
 * `layering-policy.md` §2 and `architecture-validation.md` §4.1:
 *
 *   - primitives          → no internal package
 *   - kernel              → primitives
 *                           (kernel → composition is forbidden, ADR-025 §5 "Forbidden")
 *   - composition         → primitives, kernel
 *                           (composition → any Core Module is forbidden, ADR-025 hard
 *                           invariant)
 *   - core                → primitives, kernel, composition, core
 *                           (Core → Core is further gated by ADR-008, not by this rule)
 *   - technology-adapter  → primitives, kernel, composition, the Core Module it
 *                           implements, and the additional Core Modules it consumes
 *                           (adapters.md §13; see below)
 *   - integration-adapter → primitives, kernel, core, technology-adapter
 *
 * Technology Adapters MAY import the core contract they implement (declared via
 * `implements` metadata) and the additional Core Module contracts they consume
 * (declared via the `consumes` option, ADR-007 / adapters.md §13: "An adapter MAY depend on
 * additional Core Modules when those dependencies are required by its implementation").
 * `consumes` is data supplied by the consumer, like `classification` and `implements`; the
 * consumer derives it from the adapter's own manifest declarations. Only targets classified as
 * `core` are ever admitted this way: it does not turn a Technology Adapter into an Integration
 * Adapter, and it never admits an adapter, an Integration Adapter or any other layer.
 *
 * Test sources of a Technology Adapter MAY additionally import the Comity packages the adapter
 * declares as `devDependencies` (the `development` option): technology bindings such as another
 * SQL adapter are legitimate integration-test fixtures, and a development-only import never enters
 * the published dependency graph that the layering policy governs. Production sources never
 * benefit from it; a test file is recognised by its path (`__tests__`, `.test.`, `.spec.`).
 *
 * A source package whose layer has no profile (for example `dev-tooling`), and a target
 * that is not in the supplied classification, are outside this rule's scope. The
 * classification is data supplied by the consumer (ADR-026); this rule never exempts a
 * layer: there is no option to remove one.
 *
 * Allowed Core-to-Core edges are gated by ADR-008; this rule does NOT evaluate that
 * register (it is enforced separately by the dependency rules / orchestrator). The
 * sibling generator `@comity-dev/dependency-rules` expresses the same layer policy for
 * dependency-cruiser; see `architecture-validation.md` §4.1 for how the two relate.
 *
 * Standard references:
 *   - ADR-025 §5 (formal package dependencies)
 *   - layering-policy.md §2 (canonical layering model)
 *   - architecture-validation.md §4.1, §7
 *   - ADR-007 (adapter categories)
 */

type Rule = unknown;

const messages = {
  forbidden:
    "This import violates Comity's layering policy (layering-policy.md §2).",
};

const LAYER_PROFILES: Record<string, { allowed: Set<string> }> = {
  primitives: { allowed: new Set() },
  kernel: { allowed: new Set(["primitives"]) },
  composition: { allowed: new Set(["primitives", "kernel"]) },
  core: { allowed: new Set(["primitives", "kernel", "composition", "core"]) },
  "technology-adapter": {
    allowed: new Set(["primitives", "kernel", "composition"]),
  },
  "integration-adapter": {
    allowed: new Set(["primitives", "kernel", "core", "technology-adapter"]),
  },
};

function classifyTarget(specifier: string): string | null {
  const m = specifier.match(/^(@comity\/[^/]+)/);
  if (!m || !m[1]) return null;
  return m[1];
}

function inferLayerFromFilename(filename: string): string | null {
  if (!filename) return null;
  if (filename.includes("/primitives/")) return "primitives";
  if (filename.includes("/kernel/")) return "kernel";
  if (filename.includes("/composition/")) return "composition";
  if (filename.includes("/packages/")) {
    // Check for core packages
    const corePackages = [
      "http",
      "router",
      "html",
      "hydration",
      "seo",
      "content",
      "media",
      "search",
      "cache",
      "auth",
      "catalog",
      "customer",
      "inventory",
      "order",
      "payment",
      "pricing",
      "storefront",
      "taxonomy",
      "validation",
      "address",
      "geography",
      "identity",
      "organization",
      "acl",
      "auth-tokens",
      "graphql-builder",
      "graphql-client",
      "i18n",
      "sql",
      "storage",
    ];
    for (const pkg of corePackages) {
      if (filename.includes(`/packages/${pkg}/`)) return "core";
    }
    // Check for technology adapters
    const adapterPackages = [
      "html-preact",
      "html-react",
      "hydration-preact",
      "hydration-react",
      "http-hono",
      "http-fetch",
      "router-path-to-regexp",
      "acl-casl",
      "auth-jose",
      "cache-kv",
      "cache-redis",
      "cli-commander",
      "graphql-client-fetch",
      "graphql-client-ws",
      "i18n-typesafe",
      "sql-kysely",
      "validation-zod",
    ];
    for (const pkg of adapterPackages) {
      if (filename.includes(`/packages/${pkg}/`)) return "technology-adapter";
    }
  }
  return null;
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid imports that violate Comity's canonical layering policy.",
      category: "Comity Architecture",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceName: {
            type: "string",
            description:
              "Name of the source package (e.g., '@comity/pricing'). Required.",
          },
          classification: {
            type: "object",
            description:
              "Map of package name → layer. The plugin receives this via configuration; it MUST NOT hardcode layers.",
          },
          implements: {
            type: "object",
            description:
              "Map of package name → implemented core package (for technology-adapter packages).",
          },
          development: {
            type: "object",
            description:
              "Map of package name → Comity packages it declares as devDependencies. Imports of them from test sources of a technology-adapter are outside the layering policy (they never enter the published graph).",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          consumes: {
            type: "object",
            description:
              "Map of package name → additional Core Module packages the package consumes (for technology-adapter packages, adapters.md §13). Only Core-layer targets are admitted.",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
        },
        required: ["sourceName", "classification"],
        additionalProperties: false,
      },
    ],
    messages,
  },
  create(context: any) {
    const opts = (context.options[0] ?? {}) as {
      sourceName?: string;
      classification?: Record<string, string>;
      implements?: Record<string, string>;
      consumes?: Record<string, readonly string[]>;
      development?: Record<string, readonly string[]>;
    };
    const classification = opts.classification ?? {};
    const implementsMap = opts.implements ?? {};
    const consumesMap = opts.consumes ?? {};
    const developmentMap = opts.development ?? {};
    const filename = (context.filename ?? context.getFilename() ?? "").replace(/\\/g, "/");
    const isTestSource =
      /(?:^|\/)__tests__\//.test(filename) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filename);
    const sourceName = opts.sourceName ?? null;

    // Fallback: infer source layer from filename if sourceName not provided
    let sourceLayer = sourceName
      ? classification[sourceName]
      : inferLayerFromFilename(context.filename ?? context.getFilename());
    if (!sourceLayer) return {};

    const profile = LAYER_PROFILES[sourceLayer];
    if (!profile) return {};

    // If sourceName not provided, we can't check implementsMap, so skip that allowance
    const effectiveSourceName = sourceName;

    return {
      ImportDeclaration(node: any) {
        const specifier = node.source.value;
        if (!specifier) return;
        const target = classifyTarget(specifier);
        if (!target) return;

        // Look up the target package's layer
        const targetLayer = classification[target];
        if (!targetLayer) return; // unknown package — outside this rule's scope

        // Allow a technology-adapter to import its implemented core contract and the
        // additional Core Module contracts it consumes (adapters.md §13). Core layer only.
        if (
          effectiveSourceName &&
          sourceLayer === "technology-adapter" &&
          targetLayer === "core" &&
          (implementsMap[effectiveSourceName] === target ||
            (consumesMap[effectiveSourceName] ?? []).includes(target))
        ) {
          return; // Allowed: implemented or consumed Core Module contract
        }

        // Test sources of a technology-adapter may import its declared devDependencies.
        if (
          effectiveSourceName &&
          sourceLayer === "technology-adapter" &&
          isTestSource &&
          (developmentMap[effectiveSourceName] ?? []).includes(target)
        ) {
          return;
        }

        if (!profile.allowed.has(targetLayer)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

export default rule;
