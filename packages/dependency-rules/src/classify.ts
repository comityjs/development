import type { LayerSets } from "./constants.js";

/**
 * Pure helpers to classify packages and build layer sets from a parsed
 * classification map. No I/O.
 */

export interface PackageRecord {
  /** The name of the package */
  name: string;

  /** The layer of the package, if known */
  layer?: string | null;
}

/**
 * Returns a Map<name, layer> from an array of package records.
 *
 * @param packages — package records with optional layer
 * @returns classification map
 */
export function classifyByLayer(
  packages: PackageRecord[],
): Map<string, string> {
  const out = new Map<string, string>();

  for (const pkg of packages) {
    if (pkg.layer) out.set(pkg.name, pkg.layer);
  }

  return out;
}

/**
 * Builds per-layer Sets from a classification map.
 *
 * @param classification — Map<packageName, layer>
 * @returns layer sets
 */
export function layerSetsFromPackages(
  classification: Map<string, string>,
): LayerSets {
  const sets: LayerSets = {
    primitives: new Set<string>(),
    kernel: new Set<string>(),
    composition: new Set<string>(),
    core: new Set<string>(),
    "technology-adapter": new Set<string>(),
    "integration-adapter": new Set<string>(),
    "dev-tooling": new Set<string>(),
  };

  for (const [name, layer] of classification) {
    if (
      layer === "primitives" ||
      layer === "kernel" ||
      layer === "composition" ||
      layer === "core" ||
      layer === "technology-adapter" ||
      layer === "integration-adapter" ||
      layer === "dev-tooling"
    ) {
      sets[layer].add(name);
    }
  }

  return sets;
}
