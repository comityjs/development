/**
 * @comity-dev/validate — classification of INSTALLED Comity packages.
 *
 * Workspace packages are classified from the repository itself. A repository
 * may also consume published Comity packages from `node_modules`
 * (`@comity/primitives`, `@comity/sql-kysely`, ...). Their layer is read from
 * the `comity.layer` field of the manifest that is actually installed — the
 * same canonical metadata the workspace packages use (ADR-026), validated
 * against the canonical layer list of `@comity-dev/schemas`. The layer is never
 * inferred from a package name, and no list of packages is maintained here.
 *
 * A package that cannot be classified is NOT given a layer. It is reported in
 * `problems` with the reason, and the generated dependency rules treat any
 * import of it as forbidden (fail closed).
 */

import type { Repository } from "./discover.js";

import { VALID_LAYERS } from "@comity-dev/schemas";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

const COMITY_NAME = /^@comity(?:-dev)?\//;
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export interface InstalledClassification {
  /** Installed package name → validated `comity.layer`. */
  layers: Map<string, string>;

  /** Installed package name → why it could not be classified. */
  problems: Map<string, string>;
}

interface InstalledCopy {
  version: string;
  layer: string | null;
  invalid: string | null;
}

/**
 * Finds the installed `package.json` of `name` as seen from `fromDir`, using
 * Node's own lookup (`node_modules` of the directory and each ancestor). The
 * real path is returned so that one package reachable through several
 * symlinks (pnpm) is read once.
 */
function locateManifest(fromDir: string, name: string): string | null {
  let dir = fromDir;

  for (;;) {
    const candidate = join(dir, "node_modules", name, "package.json");

    if (existsSync(candidate)) return realpathSync(candidate);

    const parent = dirname(dir);

    if (parent === dir) return null;
    dir = parent;
  }
}

function readCopy(name: string, manifestPath: string): InstalledCopy {
  let manifest: unknown;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      version: "unknown",
      layer: null,
      invalid: `its installed package.json cannot be read (${(error as Error).message})`,
    };
  }

  const m = (typeof manifest === "object" && manifest !== null
    ? manifest
    : {}) as {
    name?: unknown;
    version?: unknown;
    comity?: { layer?: unknown } | null;
  };
  const version = typeof m.version === "string" ? m.version : "unknown";

  if (m.name !== name) {
    return {
      version,
      layer: null,
      invalid: `its installed package.json is named ${JSON.stringify(m.name)}, not ${JSON.stringify(name)}`,
    };
  }

  const layer = m.comity?.layer;

  if (layer === undefined) {
    return {
      version,
      layer: null,
      invalid: "its installed package.json declares no `comity.layer`",
    };
  }

  if (typeof layer !== "string" || !VALID_LAYERS.includes(layer)) {
    return {
      version,
      layer: null,
      invalid: `its \`comity.layer\` ${JSON.stringify(layer)} is not one of ${VALID_LAYERS.join(", ")}`,
    };
  }

  // Name-scope ↔ layer boundary (ADR-026): `dev-tooling` is reserved for
  // `@comity-dev/*`, and `@comity-dev/*` may only use it.
  const isDev = name.startsWith("@comity-dev/");

  if (isDev !== (layer === "dev-tooling")) {
    return {
      version,
      layer: null,
      invalid: isDev
        ? `its \`comity.layer\` "${layer}" is not "dev-tooling", which @comity-dev/* packages must use`
        : `its \`comity.layer\` "dev-tooling" is reserved for @comity-dev/* packages`,
    };
  }

  return { version, layer, invalid: null };
}

/**
 * Classifies every installed Comity package that a workspace package declares
 * as a dependency (dependencies, devDependencies, peerDependencies,
 * optionalDependencies). Workspace packages themselves are skipped: the
 * workspace classification governs.
 *
 * Deterministic: names are processed in sorted order and every copy found from
 * any declaring package is considered. Copies that disagree on the layer make
 * the package unclassifiable rather than picking one.
 */
export function classifyInstalledComityPackages(
  repo: Repository,
): InstalledClassification {
  const workspace = new Set(repo.packages.map((p) => p.name));
  const declaredBy = new Map<string, Set<string>>();

  for (const pkg of repo.packages) {
    for (const field of DEPENDENCY_FIELDS) {
      const deps = pkg.manifest[field];

      if (typeof deps !== "object" || deps === null) continue;

      for (const name of Object.keys(deps)) {
        if (!COMITY_NAME.test(name) || workspace.has(name)) continue;

        const dirs = declaredBy.get(name) ?? new Set<string>();

        dirs.add(pkg.path);
        declaredBy.set(name, dirs);
      }
    }
  }

  const layers = new Map<string, string>();
  const problems = new Map<string, string>();

  for (const name of [...declaredBy.keys()].sort()) {
    const manifests = new Set<string>();

    for (const dir of [...(declaredBy.get(name) ?? [])].sort()) {
      const found = locateManifest(dir, name);

      if (found !== null) manifests.add(found);
    }

    if (manifests.size === 0) {
      problems.set(
        name,
        "it is declared as a dependency but is not installed (no node_modules copy found)",
      );
      continue;
    }

    const copies = [...manifests].sort().map((m) => readCopy(name, m));
    const invalid = copies.find((c) => c.invalid !== null);

    if (invalid) {
      problems.set(
        name,
        `${invalid.invalid} (version ${invalid.version}), so it cannot be classified`,
      );
      continue;
    }

    const distinct = new Set(copies.map((c) => c.layer));

    if (distinct.size > 1) {
      problems.set(
        name,
        `installed copies declare conflicting layers (${copies
          .map((c) => `${c.version}: ${c.layer}`)
          .join(", ")}), so it cannot be classified`,
      );
      continue;
    }

    layers.set(name, copies[0]!.layer as string);
  }

  return { layers, problems };
}

/**
 * The Comity package a dependency-cruiser target belongs to: the innermost
 * `node_modules/<@comity or @comity-dev scope>/<name>` segment of a resolved path, or the leading
 * `@scope/name` of an unresolved specifier. Subpaths and the package root map
 * to the same name, so one classification governs both.
 */
export function comityPackageOf(target: string): string | null {
  const resolved = [
    ...target.matchAll(/(?:^|\/)node_modules\/(@comity(?:-dev)?\/[^/]+)(?=\/)/g),
  ].pop();

  if (resolved) return resolved[1] ?? null;

  const spec = /^(@comity(?:-dev)?\/[^/]+)(?:\/|$)/.exec(target);

  return spec?.[1] ?? null;
}
