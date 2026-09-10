/**
 * @comity-dev/validate — repository discovery.
 *
 * Walks a repository's `comity.config.json` and the configured package
 * roots to produce a normalized Repository handle that the orchestrator
 * passes to specialized validators.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface PackageRecord {
  /** The package's `name` field from its `package.json`. */
  name: string;

  /** The absolute path of the package directory. */
  path: string;

  /** The package's `comity.layer` field from its `package.json`, or null if not set. */
  layer: string | null;

  /** The parsed contents of the package's `package.json`. */
  manifest: Record<string, unknown>;
}

export interface Repository {
  /** The absolute path of the repository root. */
  root: string;

  /** The parsed contents of the repository's `comity.config.json`. */
  repository: { name: string; type: string };

  /** The configured package roots, relative to the repository root. */
  packageRoots: string[];

  /** The discovered packages in the repository, sorted by name. */
  packages: PackageRecord[];

  /** The parsed contents of the repository's `comity.config.json`. */
  config: Record<string, unknown>;
}

export interface DiscoverOptions {
  /** The absolute path of the repository root. */
  root: string;
}

/**
 * Discover a repository: load comity.config.json, walk the configured
 * package roots, and produce a normalized Repository handle.
 */
export async function discoverRepository({
  root,
}: DiscoverOptions): Promise<Repository> {
  const absRoot = resolve(root);
  const configPath = join(absRoot, "comity.config.json");

  let config: Record<string, unknown> | null = null;

  try {
    const text = await readFile(configPath, "utf8");

    config = JSON.parse(text);
  } catch {
    config = {
      repository: { name: "unknown", type: "third-party" },
      packages: { roots: ["packages"] },
    };
  }

  const cfg = config as {
    repository?: { name: string; type: string };
    packages?: { roots?: string[] };
  };
  const roots = cfg.packages?.roots ?? ["packages"];
  const packages: PackageRecord[] = [];

  for (const rel of roots) {
    const dir = join(absRoot, rel);

    try {
      await stat(dir);
    } catch {
      continue;
    }

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgDir = join(dir, entry.name);
      const manifestPath = join(pkgDir, "package.json");

      let manifest: Record<string, unknown> | null = null;

      try {
        const text = await readFile(manifestPath, "utf8");

        manifest = JSON.parse(text);
      } catch {
        continue;
      }

      if (
        !manifest?.["name"] ||
        (!String(manifest["name"]).startsWith("@comity/") &&
          !String(manifest["name"]).startsWith("@comity-dev/"))
      )
        continue;
      const m = manifest as { name: string; comity?: { layer?: string } };

      packages.push({
        name: m.name,
        path: pkgDir,
        layer: m.comity?.layer ?? null,
        manifest,
      });
    }
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));

  return {
    root: absRoot,
    repository: cfg.repository ?? { name: "unknown", type: "third-party" },
    packageRoots: roots,
    packages,
    config: config ?? {},
  };
}
