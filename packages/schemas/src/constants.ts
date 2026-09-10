/**
 * Canonical Comity constants.
 *
 * These values are derived from the authoritative Comity Standards
 * (layering-policy.md, ADR-026). They MUST be kept in sync with those
 * documents; updating them here implies updating the standards.
 *
 * @see layering-policy.md §2.1 / ADR-026 (package classification)
 *
 * ADR-026 defines `comity.layer` as the architecture classification of
 * Comity RUNTIME packages (`@comity/*`). The six runtime layers are:
 *
 *   primitives, kernel, composition, core,
 *   technology-adapter, integration-adapter
 *
 * `dev-tooling` is a reserved Development-side extension for
 * `@comity-dev/*` packages only. It is NOT a seventh runtime layer
 * and MUST NOT be used by `@comity/*` packages. The name-scope ↔
 * layer boundary is enforced by the package-metadata JSON Schema
 * (`schemas/package-metadata.ts`).
 *
 * Rationale for the extension: Development tooling packages
 * legitimately use Node APIs, `process.env`, and other patterns that
 * the runtime Semgrep and ESLint rules forbid. Declaring `dev-tooling`
 * on these packages lets the validator engines (semgrep, depcruise,
 * eslint, adapter-peers) scope those rules away from them. The
 * runtime six-layer model is unchanged.
 */
export const RUNTIME_LAYERS: readonly string[] = Object.freeze([
  "primitives",
  "kernel",
  "composition",
  "core",
  "technology-adapter",
  "integration-adapter",
]);

/**
 * All layer values accepted by `comity.layer`. The boundary between
 * runtime and development layers is enforced by the schema, not by
 * this list alone.
 */
export const VALID_LAYERS: readonly string[] = Object.freeze([
  ...RUNTIME_LAYERS,
  "dev-tooling",
]);

/**
 * @see ADR-026 (package naming)
 *      architecture-validation.md §8
 */
export const PACKAGE_NAME_PATTERN = "^@comity(-dev)?/[a-z0-9]+(?:-[a-z0-9]+)*$";

/**
 * @see architecture-validation.md §8 (metadata — engines.node minimum)
 */
export const MIN_NODE_VERSION = "24.0.0";
