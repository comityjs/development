/**
 * Shared layer scoping for the determinism rules (`no-date-in-core`, `no-crypto-in-core`).
 *
 * The package's architectural layer is data supplied by the consumer — the same `sourceName` +
 * `classification` options `no-layer-violation` reads (ADR-026). The `@comity/*` scope says
 * nothing about the layer: Technology Adapters are `@comity/*` packages too.
 *
 * Resolution, in order:
 *  1. `classification` supplied: the layer is `classification[sourceName]`. A missing
 *     `sourceName`, a missing entry or a non-string entry means the layer is unknown, and an
 *     unknown source layer is outside the rule's scope (the rule does not apply), exactly as in
 *     `no-layer-violation`.
 *  2. `classification` not supplied: the rule falls back to its filename heuristic, as it does
 *     when `sourceName` is absent. `sourceName` alone never classifies a package.
 */

/** Layers whose packages must stay deterministic and free of runtime concerns. */
const DETERMINISTIC_LAYERS = new Set(["primitives", "kernel", "composition", "core"]);

export interface LayerScopeOptions {
  readonly sourceName?: string;
  readonly classification?: Record<string, unknown>;
}

export const LAYER_SCOPE_SCHEMA_PROPERTIES = {
  sourceName: {
    type: "string",
    description:
      "Name of the source package (e.g., '@comity/http'). Looked up in `classification`; also keys the telemetry allowlist.",
  },
  classification: {
    type: "object",
    description:
      "Map of package name → layer, as for no-layer-violation. When supplied, the rule applies only to primitives, kernel, composition and core packages; an unlisted source package is outside scope. When omitted, the filename heuristic is used.",
  },
} as const;

/**
 * Decides whether a determinism rule applies to the file under lint.
 *
 * @param opts - Rule options.
 * @param filenameHeuristic - Result of the rule's filename-based scoping, used only when no
 * `classification` was supplied.
 *
 * @returns `true` when the rule applies.
 */
export function appliesToDeterministicLayer(
  opts: LayerScopeOptions,
  filenameHeuristic: () => boolean,
): boolean {
  if (opts.classification === undefined) return filenameHeuristic();

  const layer = opts.sourceName === undefined ? undefined : opts.classification[opts.sourceName];

  return typeof layer === "string" && DETERMINISTIC_LAYERS.has(layer);
}
