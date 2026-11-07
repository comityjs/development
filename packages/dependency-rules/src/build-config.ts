import type { LayerName } from "./constants.js";

import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { layerSetsFromPackages } from "./classify.js";
import { LAYER_PROFILES } from "./constants.js";

const escapeForRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Generated or vendored directories. Modules below these directories are
 * never the *source* of a rule match.
 */
export const GENERATED_OUTPUT_PATTERN = "(^|/)(dist|coverage|node_modules)/";

/**
 * Modules excluded from the cruise entirely. Only `coverage/` is excluded:
 * it contains bundled third-party report assets. `dist/` stays in the graph
 * because workspace imports of `@scope/pkg` frequently resolve to
 * `packages/pkg/dist/...`; dropping those modules would drop the edge itself.
 * (`dist/` modules are still never the source of a match, see
 * {@link GENERATED_OUTPUT_PATTERN}.)
 */
export const EXCLUDED_FROM_CRUISE_PATTERN = "(^|/)coverage/";

/** Any `@comity/*` or `@comity-dev/*` specifier is an internal package. */
const INTERNAL_SPECIFIER = "^@comity(?:-dev)?/";

/**
 * Normalises a repository-relative package directory to the form
 * dependency-cruiser matches against: POSIX separators, no leading `./`,
 * no trailing slash.
 */
export function normalizePackageDir(dir: string): string {
  return dir
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

export interface DependencyRule {
  /** The name of the dependency rule */
  name: string;

  /** The severity of the dependency rule */
  severity: "error" | "warn" | "info";

  /** The comment associated with the dependency rule */
  comment: string;

  /** The source module of the dependency (matched against module paths) */
  from: { path: string; pathNot?: string };

  /** The target module of the dependency (matched against resolved paths) */
  to: { path: string; pathNot?: string };
}

export interface DependencyCruiserConfig {
  /** The list of forbidden dependency rules */
  forbidden: DependencyRule[];

  /** The options for the dependency-cruiser configuration */
  options: {
    /** The prefix for module paths (output presentation only) */
    prefix?: string;

    /** Modules removed from the cruise entirely */
    exclude?: { path?: string };

    /** The options for the dependency-cruiser configuration */
    doNotFollow?: {
      /** The path pattern for modules that should not be followed */
      path?: string;

      /** The dependency types that should not be followed */
      dependencyTypes?: string[];
    };

    /** The TypeScript configuration file */
    tsConfig?: { fileName?: string };

    /**
     * Include dependencies that only exist before TypeScript compilation
     * (`import type`, `import { type X }`, `export type … from`). Always
     * `true` for generated configurations so layering applies to type imports.
     */
    tsPreCompilationDeps?: boolean;
  };
}

export interface BuildOptions {
  /**
   * Package directory per package name, relative to the directory
   * dependency-cruiser runs in (the repository root), e.g.
   * `{ "@comity/kernel": "packages/kernel" }`.
   *
   * Required for every package that appears in a generated rule: rules are
   * matched against module *paths*, so a package name alone cannot be
   * enforced. Backslash separators are accepted and normalised.
   */
  packagePaths: Record<string, string>;

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
 * Builds the dependency-cruiser configuration for a layer classification.
 *
 * dependency-cruiser evaluates `from.path` against the path of each cruised
 * module and `to.path` against the *resolved* path of each dependency. A
 * workspace import can resolve in three ways, and `to` matches all of them:
 *
 * 1. a path inside the package directory (`packages/kernel/dist/index.js`);
 * 2. a path below `node_modules/<package name>/`;
 * 3. the bare specifier itself when it could not be resolved (`@comity/kernel`).
 *
 * `from` only ever matches real module paths below a package directory.
 *
 * @param classification — Map<packageName, layer>
 * @param options — repository-supplied facts (`packagePaths` is required)
 * @returns a dependency-cruiser config object
 */
export function buildDependencyRules(
  classification: Map<string, string>,
  options: BuildOptions,
): DependencyCruiserConfig {
  if (!(classification instanceof Map)) {
    throw new TypeError("classification must be a Map<packageName, layer>");
  }

  if (typeof options?.packagePaths !== "object" || options.packagePaths === null) {
    throw new TypeError(
      "buildDependencyRules: options.packagePaths is required (package name → repository-relative directory)",
    );
  }

  const {
    tsConfigFileName,
    extraRules = [],
    registeredCoreEdges = [],
    packagePaths,
  } = options;

  const sets = layerSetsFromPackages(classification);
  const primitives = [...sets.primitives];
  const kernel = [...sets.kernel];
  const composition = [...sets.composition];
  const core = [...sets.core];
  const techAdapter = [...sets["technology-adapter"]];
  const integrationAdapter = [...sets["integration-adapter"]];
  const adapters = [...techAdapter, ...integrationAdapter];

  const dirOf = (name: string): string => {
    const dir = packagePaths[name];

    if (dir === undefined || normalizePackageDir(dir) === "") {
      throw new Error(
        `buildDependencyRules: no package directory known for "${name}". ` +
          "Rules are matched against module paths, so every package that " +
          "appears in a rule needs an entry in options.packagePaths.",
      );
    }

    return normalizePackageDir(dir);
  };

  const unique = (names: Iterable<string>): string[] =>
    [...new Set(names)].sort();

  /** Alternatives (without anchors) matching any module of the given packages. */
  const alternatives = (names: string[]): string[] => {
    const sorted = unique(names);
    const dirs = sorted.map((n) => escapeForRegex(dirOf(n))).join("|");
    const specs = sorted.map(escapeForRegex).join("|");

    // No nested quantifiers: dependency-cruiser rejects "unsafe" regular expressions.
    return [
      `^(?:${dirs})/`,
      `^(?:${specs})(?:/|$)`,
      `(?:^|/)node_modules/(?:${specs})(?:/|$)`,
    ];
  };

  /** `to` matcher for the given packages. */
  const toPackages = (names: string[]): string =>
    alternatives(names).join("|");

  /** `from` matcher for the given packages: real modules, never build output. */
  const fromPackages = (
    names: string[],
  ): { path: string; pathNot: string } => ({
    path: `^(?:${unique(names)
      .map((n) => escapeForRegex(dirOf(n)))
      .join("|")})/`,
    pathNot: GENERATED_OUTPUT_PATTERN,
  });

  // Every internal package, classified or not, plus any `@comity/*` specifier.
  const internalNames = unique([
    ...Object.keys(packagePaths),
    ...classification.keys(),
  ]);
  const toInternal = (): string =>
    [...alternatives(internalNames), INTERNAL_SPECIFIER].join("|");

  /** Any internal package except the given ones. */
  const toInternalExcept = (
    allowed: string[],
  ): { path: string; pathNot: string } => ({
    path: toInternal(),
    pathNot: toPackages(allowed),
  });

  const forbidden: DependencyRule[] = [];

  // Primitives MUST NOT depend on any internal package (same-layer imports are intra-layer).
  if (primitives.length > 0) {
    forbidden.push({
      name: "primitives-no-internal",
      severity: "error",
      comment: LAYER_PROFILES.primitives.comment,
      from: fromPackages(primitives),
      to: toInternalExcept(primitives),
    });
  }

  // Kernel may depend on primitives, but nothing else.
  if (kernel.length > 0) {
    forbidden.push({
      name: "kernel-only-primitives",
      severity: "error",
      comment: LAYER_PROFILES.kernel.comment,
      from: fromPackages(kernel),
      to: toInternalExcept([...primitives, ...kernel]),
    });
  }

  // Composition may depend on kernel and primitives, but nothing else.
  if (composition.length > 0) {
    forbidden.push({
      name: "composition-only-kernel-primitives",
      severity: "error",
      comment: LAYER_PROFILES.composition.comment,
      from: fromPackages(composition),
      to: toInternalExcept([...primitives, ...kernel, ...composition]),
    });
  }

  // Core Modules may depend on primitives, kernel and composition (ADR-025). Core → Core edges are
  // not restricted by this rule; the ADR-008 closed register is out of its scope.
  if (core.length > 0) {
    forbidden.push({
      name: "core-only-kernel-primitives-or-core-peer",
      severity: "error",
      comment: LAYER_PROFILES.core.comment,
      from: fromPackages(core),
      to: toInternalExcept([...primitives, ...kernel, ...composition, ...core]),
    });
  }

  // Core Modules MUST NOT depend on Adapters.
  if (core.length > 0 && adapters.length > 0) {
    forbidden.push({
      name: "contracts-never-depend-on-adapters",
      severity: "error",
      comment:
        "Core Modules MUST NOT depend on Adapters (layering-policy.md §2.3, architecture-validation.md §7.3).",
      from: fromPackages(core),
      to: { path: toPackages(adapters) },
    });
  }

  // Adapter to Adapter dependencies are forbidden except Integration Adapter → Technology Adapter (ADR-007).
  // One rule per source package so a package's imports of itself are not reported.
  for (const adapter of unique(adapters)) {
    const isIntegration = sets["integration-adapter"].has(adapter);
    const forbiddenTargets = isIntegration ? integrationAdapter : adapters;

    forbidden.push({
      name: "no-cross-adapter-deps",
      severity: "error",
      comment:
        "Adapter to Adapter dependencies are forbidden except Integration Adapter → Technology Adapter (ADR-007).",
      from: fromPackages([adapter]),
      to: {
        path: toPackages(forbiddenTargets),
        pathNot: toPackages([adapter]),
      },
    });
  }

  // Primitives, Kernel, and Composition may not depend on Core Modules.
  if (
    (primitives.length || kernel.length || composition.length) &&
    core.length > 0
  ) {
    forbidden.push({
      name: "kernel-no-core-deps",
      severity: "error",
      comment:
        "Primitives, Kernel, and Composition MUST NOT depend on Core Modules (layering-policy.md §2.1).",
      from: fromPackages([...primitives, ...kernel, ...composition]),
      to: { path: toPackages(core) },
    });
  }

  // Explicitly registered Core-to-Core edges (ADR-008). Behaviour preserved from the previous
  // generator (edges are emitted as forbidden rules); only the matching is corrected.
  for (const edge of registeredCoreEdges) {
    const [from, to] = edge.split(" -> ").map((s) => s.trim());

    if (!from || !to) continue;

    forbidden.push({
      name: `adr-008-edge-${from}-${to}`,
      severity: "error",
      comment: `ADR-008 explicit Core-to-Core exception: ${from} → ${to}.`,
      from: fromPackages([from]),
      to: { path: toPackages([to]) },
    });
  }

  // Apply any extra rules supplied by the repository. These are additional constraints that the repository wants to enforce, beyond the canonical layering policy.
  for (const rule of extraRules) {
    const fromSet = sets[rule.fromLayer];
    const toSet = sets[rule.toLayer];

    if (!fromSet || !toSet) continue;
    if (fromSet.size === 0 || toSet.size === 0) continue;

    forbidden.push({
      name: rule.name ?? `extra-${rule.fromLayer}-no-${rule.toLayer}`,
      severity: rule.severity ?? "error",
      comment: rule.comment ?? `Disallow ${rule.fromLayer} → ${rule.toLayer}`,
      from: fromPackages([...fromSet]),
      to: { path: toPackages([...toSet]) },
    });
  }

  return {
    forbidden,
    options: {
      prefix: "^(@comity|@comity-dev)/",
      exclude: { path: EXCLUDED_FROM_CRUISE_PATTERN },
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
      tsPreCompilationDeps: true,
      ...(tsConfigFileName ? { tsConfig: { fileName: tsConfigFileName } } : {}),
    },
  } satisfies DependencyCruiserConfig;
}

/**
 * Builds the configuration for a repository root. dependency-cruiser MUST be
 * run with the repository root as its working directory so module paths are
 * repository-relative (`packages/kernel/src/index.ts`).
 *
 * `packagePaths` values may be absolute or repository-relative; they are
 * normalised to repository-relative POSIX paths. The repository's
 * `tsconfig.json` is passed to dependency-cruiser (absolute path) when it
 * exists.
 */
export function buildDependencyRulesForRoot(
  classification: Map<string, string>,
  repoRoot: string,
  options: Omit<BuildOptions, "tsConfigFileName">,
): DependencyCruiserConfig {
  const root = resolve(repoRoot);
  const packagePaths: Record<string, string> = {};

  for (const [name, dir] of Object.entries(options?.packagePaths ?? {})) {
    packagePaths[name] = normalizePackageDir(relative(root, resolve(root, dir)));
  }

  const tsConfig = resolve(root, "tsconfig.json");

  return buildDependencyRules(classification, {
    ...options,
    packagePaths,
    ...(existsSync(tsConfig) ? { tsConfigFileName: tsConfig } : {}),
  });
}
