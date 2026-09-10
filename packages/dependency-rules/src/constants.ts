/**
 * Default repository facts used by the dependency-cruiser rule builder
 * when no overrides are supplied.
 *
 * Repositories MAY override these in their `comity.config.json` or via
 * the `buildDependencyRules` options. They MUST NOT alter layering policy
 * through configuration.
 */
export const DEFAULT_REPOSITORY_FACTS = Object.freeze({
  packageRoots: ["packages"],
  tsConfigFileName: "tsconfig.json",
});

/**
 * Canonical layer profile comments referenced by the dependency rule
 * builder. Keeping the prose here makes rule generation deterministic and
 * prevents duplication across repositories.
 */
export const LAYER_PROFILES = Object.freeze({
  primitives: {
    comment:
      "Primitives MUST NOT depend on any internal package (layering-policy.md §2.1).",
  },
  kernel: {
    comment: "Kernel MUST only depend on primitives (layering-policy.md §2.1).",
  },
  composition: {
    comment:
      "Composition MUST only depend on kernel and primitives (layering-policy.md §2.1).",
  },
  core: {
    comment:
      "Core Modules MAY depend on primitives, kernel, and other Core Modules explicitly permitted via ADR-008.",
  },
  "technology-adapter": {
    comment:
      "Technology Adapters MUST NOT depend on Adapters except Integration Adapter → Technology Adapter (ADR-007).",
  },
  "integration-adapter": {
    comment:
      "Integration Adapters may depend on primitives, kernel, core, and technology adapters (ADR-007).",
  },
} as const);

export type LayerName =
  | "primitives"
  | "kernel"
  | "composition"
  | "core"
  | "technology-adapter"
  | "integration-adapter"
  | "dev-tooling";

export interface LayerSets {
  /** The set of package names in each layer */
  primitives: Set<string>;

  /** The set of package names in each layer */
  kernel: Set<string>;

  /** The set of package names in each layer */
  composition: Set<string>;

  /** The set of package names in each layer */
  core: Set<string>;

  /** The set of package names in each layer */
  "technology-adapter": Set<string>;

  /** The set of package names in each layer */
  "integration-adapter": Set<string>;

  /** The set of package names in each layer */
  "dev-tooling": Set<string>;
}
