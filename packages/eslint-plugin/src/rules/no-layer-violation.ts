/**
 * @comity-dev/no-layer-violation
 *
 * Forbid imports that violate Comity's canonical layering policy.
 *
 * Disallowed edges (default):
 *   - primitives  → any @comity/*
 *   - kernel      → anything except primitives
 *   - composition → anything except primitives, kernel
 *   - core        → adapters
 *   - adapters    → adapters (except integration-adapter → technology-adapter)
 *
 * Technology adapters MAY import the core contract they implement
 * (declared via `implements` metadata).
 *
 * Allowed Core-to-Core edges are gated by ADR-008; this rule does NOT
 * evaluate that register (it is enforced separately by the dependency
 * rules / orchestrator). Use this rule only to catch the obvious violations.
 *
 * Standard references:
 *   - layering-policy.md §2 (canonical layering model)
 *   - architecture-validation.md §7
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
  core: { allowed: new Set(["primitives", "kernel", "core"]) },
  "technology-adapter": {
    allowed: new Set(["primitives", "kernel"]),
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
    };
    const classification = opts.classification ?? {};
    const implementsMap = opts.implements ?? {};
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

        // Allow technology-adapter to import its implemented core contract
        if (
          effectiveSourceName &&
          sourceLayer === "technology-adapter" &&
          targetLayer === "core" &&
          implementsMap[effectiveSourceName] === target
        ) {
          return; // Allowed: adapter implements this core contract
        }

        if (!profile.allowed.has(targetLayer)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

export default rule;
