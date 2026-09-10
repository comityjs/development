import type { LayerName } from "./constants.js";

import { resolve } from "node:path";
import { layerSetsFromPackages } from "./classify.js";
import { DEFAULT_REPOSITORY_FACTS, LAYER_PROFILES } from "./constants.js";

const escapeForRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface DependencyRule {
  /** The name of the dependency rule */
  name: string;

  /** The severity of the dependency rule */
  severity: "error" | "warn" | "info";

  /** The comment associated with the dependency rule */
  comment: string;

  /** The source module of the dependency */
  from: { path: string };

  /** The target module of the dependency */
  to: { path: string };
}

export interface DependencyCruiserConfig {
  /** The list of forbidden dependency rules */
  forbidden: DependencyRule[];

  /** The options for the dependency-cruiser configuration */
  options: {
    /** The prefix for module paths */
    prefix?: string;

    /** The options for the dependency-cruiser configuration */
    doNotFollow?: {
      /** The path pattern for modules that should not be followed */
      path?: string;

      /** The dependency types that should not be followed */
      dependencyTypes?: string[];
    };

    /** The TypeScript configuration file */
    tsConfig?: { fileName?: string };
  };
}

export interface BuildOptions {
  /** The path to the TypeScript configuration file */
  tsConfigFileName?: string;

  /** Additional dependency rules to be applied */
  extraRules?: Array<{
    /** The name of the extra rule */
    name?: string;

    /** The source layer of the extra rule */
    fromLayer: LayerName;

    /** The target layer of the extra rule */
    toLayer: LayerName;

    /** The severity of the extra rule */
    severity?: "error" | "warn" | "info";

    /** The comment associated with the extra rule */
    comment?: string;
  }>;

  /** Explicitly registered Core-to-Core edges (ADR-008) */
  registeredCoreEdges?: string[];
}

/**
 * @param classification — Map<packageName, layer>
 * @param options — repository-supplied facts
 * @returns a dependency-cruiser config object
 */
export function buildDependencyRules(
  classification: Map<string, string>,
  options: BuildOptions = {},
): DependencyCruiserConfig {
  const {
    tsConfigFileName = DEFAULT_REPOSITORY_FACTS.tsConfigFileName,
    extraRules = [],
    registeredCoreEdges = [],
  } = options;

  if (!(classification instanceof Map)) {
    throw new TypeError("classification must be a Map<packageName, layer>");
  }

  const sets = layerSetsFromPackages(classification);
  const primitives = [...sets.primitives];
  const kernel = [...sets.kernel];
  const composition = [...sets.composition];
  const core = [...sets.core];
  const techAdapter = [...sets["technology-adapter"]];
  const integrationAdapter = [...sets["integration-adapter"]];
  const adapters = [...techAdapter, ...integrationAdapter];

  const forbidden: DependencyRule[] = [];

  // Build the forbidden rules based on the canonical layer profiles and the repository-supplied classification.
  if (primitives.length > 0) {
    forbidden.push({
      name: "primitives-no-internal",
      severity: "error",
      comment: LAYER_PROFILES.primitives.comment,
      from: { path: `^(${primitives.map(escapeForRegex).join("|")})$` },
      to: { path: "^@comity/" },
    });
  }

  // Kernel may depend on primitives, but nothing else.
  if (kernel.length > 0) {
    const allowedKernel = [...new Set([...primitives, ...kernel])];

    forbidden.push({
      name: "kernel-only-primitives",
      severity: "error",
      comment: LAYER_PROFILES.kernel.comment,
      from: { path: `^(${kernel.map(escapeForRegex).join("|")})$` },
      to: { path: `^(?!(${allowedKernel.map(escapeForRegex).join("|")})$).*$` },
    });
  }

  // Composition may depend on kernel and primitives, but nothing else.
  if (composition.length > 0) {
    const allowedComposition = [
      ...new Set([...primitives, ...kernel, ...composition]),
    ];

    forbidden.push({
      name: "composition-only-kernel-primitives",
      severity: "error",
      comment: LAYER_PROFILES.composition.comment,
      from: { path: `^(${composition.map(escapeForRegex).join("|")})$` },
      to: {
        path: `^(?!(${allowedComposition.map(escapeForRegex).join("|")})$).*$`,
      },
    });
  }

  // Core Modules may depend on primitives, kernel, and other Core Modules explicitly permitted via ADR-008.
  if (core.length > 0) {
    const allowedCorePeers = [...primitives, ...kernel, ...core];

    forbidden.push({
      name: "core-only-kernel-primitives-or-core-peer",
      severity: "error",
      comment: LAYER_PROFILES.core.comment,
      from: { path: `^(${core.map(escapeForRegex).join("|")})$` },
      to: {
        path: `^(?!(${allowedCorePeers.map(escapeForRegex).join("|")})$).*$`,
      },
    });
  }

  // Technology Adapters may not depend on any other Adapters except Integration Adapter → Technology Adapter (ADR-007).
  if (core.length > 0 && adapters.length > 0) {
    forbidden.push({
      name: "contracts-never-depend-on-adapters",
      severity: "error",
      comment:
        "Core Modules MUST NOT depend on Adapters (layering-policy.md §2.3, architecture-validation.md §7.3).",
      from: { path: `^(${core.map(escapeForRegex).join("|")})$` },
      to: { path: `^(${adapters.map(escapeForRegex).join("|")})$` },
    });
  }

  // Adapter to Adapter dependencies are forbidden except Integration Adapter → Technology Adapter (ADR-007).
  if (adapters.length > 0) {
    forbidden.push({
      name: "no-cross-adapter-deps",
      severity: "error",
      comment:
        "Adapter to Adapter dependencies are forbidden except Integration Adapter → Technology Adapter (ADR-007).",
      from: { path: `^(${adapters.map(escapeForRegex).join("|")})$` },
      to: { path: `^(${adapters.map(escapeForRegex).join("|")})$` },
    });
  }

  // Primitives, Kernel, and Composition may not depend on Core Modules.
  if (
    (primitives.length || kernel.length || composition.length) &&
    core.length > 0
  ) {
    const inner = [...primitives, ...kernel, ...composition];

    forbidden.push({
      name: "kernel-no-core-deps",
      severity: "error",
      comment:
        "Primitives, Kernel, and Composition MUST NOT depend on Core Modules (layering-policy.md §2.1).",
      from: { path: `^(${inner.map(escapeForRegex).join("|")})$` },
      to: { path: `^(${core.map(escapeForRegex).join("|")})$` },
    });
  }

  // Explicitly registered Core-to-Core edges (ADR-008) are allowed, so we need to add them to the forbidden list with a comment indicating that they are exceptions.
  for (const edge of registeredCoreEdges) {
    const [from, to] = edge.split(" -> ").map((s) => s.trim());

    if (!from || !to) continue;

    forbidden.push({
      name: `adr-008-edge-${from}-${to}`,
      severity: "error",
      comment: `ADR-008 explicit Core-to-Core exception: ${from} → ${to}.`,
      from: { path: `^${escapeForRegex(from)}$` },
      to: { path: `^${escapeForRegex(to)}$` },
    });
  }

  // Apply any extra rules supplied by the repository. These are additional constraints that the repository wants to enforce, beyond the canonical layering policy.
  for (const rule of extraRules) {
    const fromSet = sets[rule.fromLayer];
    const toSet = sets[rule.toLayer];

    if (!fromSet || !toSet) continue;

    forbidden.push({
      name: rule.name ?? `extra-${rule.fromLayer}-no-${rule.toLayer}`,
      severity: rule.severity ?? "error",
      comment: rule.comment ?? `Disallow ${rule.fromLayer} → ${rule.toLayer}`,
      from: {
        path: `^(${Array.from(fromSet).map(escapeForRegex).join("|")})$`,
      },
      to: {
        path: `^(${Array.from(toSet).map(escapeForRegex).join("|")})$`,
      },
    });
  }

  return {
    forbidden,
    options: {
      prefix: "^(@comity|@comity-dev)/",
      doNotFollow: {
        path: "node_modules",
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
        ],
      },
    },
  } satisfies DependencyCruiserConfig;
}

// Re-export a helper that returns the config with an absolute tsconfig path
// pinned to a specific repo root. Consumers call this when the engine's CWD
// differs from the repo root.
export function buildDependencyRulesForRoot(
  classification: Map<string, string>,
  repoRoot: string,
  options: Omit<BuildOptions, "tsConfigFileName"> = {},
): DependencyCruiserConfig {
  return buildDependencyRules(classification, {
    ...options,
    tsConfigFileName: resolve(repoRoot, "tsconfig.json"),
  });
}
