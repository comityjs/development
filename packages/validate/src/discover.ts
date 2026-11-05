/**
 * @comity-dev/validate — repository discovery.
 *
 * Walks a repository's `comity.config.json` and the configured package
 * roots to produce a normalized Repository handle that the orchestrator
 * passes to specialized validators.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, matchesGlob, relative, resolve } from "node:path";

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

export interface ExcludedPackage {
  /** The absolute path of the excluded package directory. */
  path: string;

  /** The package's `name` field, when it has a readable string name. */
  name: string | null;

  /** Why this package is not publishable. */
  reason: string;
}

export interface PublishableDiscovery {
  /** The configured package roots, relative to the repository root. */
  roots: string[];

  /** Whether the default root was used because no explicit roots were configured. */
  usedDefaultRoots: boolean;

  /** Every discovered package with a readable manifest and a string name, including private packages. */
  allPackages: PackageRecord[];

  /** Packages that participate in stage 1 declaration validation. */
  publishable: PackageRecord[];

  /** Packages excluded from validation, with the reason recorded. */
  excluded: ExcludedPackage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfig(root: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(root, "comity.config.json"), "utf8"),
    );

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function configuredRoots(config: Record<string, unknown> | null): {
  roots: string[];
  usedDefaultRoots: boolean;
  exclude: string[];
} {
  const packages = isRecord(config) && isRecord(config["packages"])
    ? config["packages"]
    : null;
  const configured = packages?.["roots"];
  const roots =
    Array.isArray(configured) &&
    configured.length > 0 &&
    configured.every((root) => typeof root === "string")
      ? configured
      : ["packages"];
  const defaulted =
    !Array.isArray(configured) ||
    configured.length === 0 ||
    !configured.every((root) => typeof root === "string");
  const excludeValue = packages?.["exclude"];
  const exclude = Array.isArray(excludeValue)
    ? excludeValue.filter((pattern): pattern is string => typeof pattern === "string")
    : [];

  return { roots, usedDefaultRoots: defaulted, exclude };
}

function isExcluded(relativePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(relativePath, pattern));
}

/**
 * Discover every package under the configured roots, with no namespace filter.
 *
 * This is the discovery used by the stage 1 and stage 2 engines. It deliberately
 * does not change `discoverRepository`, whose existing engines still use the
 * legacy name-based classification.
 */
export function discoverPublishablePackages(root: string): PublishableDiscovery {
  const absRoot = resolve(root);
  const config = readConfig(absRoot);
  const { roots, usedDefaultRoots, exclude } = configuredRoots(config);
  const allPackages: PackageRecord[] = [];
  const publishable: PackageRecord[] = [];
  const excluded: ExcludedPackage[] = [];

  for (const relRoot of roots) {
    const dir = join(absRoot, relRoot);

    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;

    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const pkgDir = join(dir, entry.name);
      const manifestPath = join(pkgDir, "package.json");

      if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) continue;

      let manifest: Record<string, unknown>;

      try {
        const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));

        if (!isRecord(parsed)) {
          excluded.push({
            path: pkgDir,
            name: null,
            reason: "package.json is not a JSON object",
          });
          continue;
        }

        manifest = parsed;
      } catch {
        excluded.push({
          path: pkgDir,
          name: null,
          reason: "package.json is not readable JSON",
        });
        continue;
      }

      const name = manifest["name"];

      if (typeof name !== "string" || name.length === 0) {
        excluded.push({
          path: pkgDir,
          name: null,
          reason: "package.json has no string name",
        });
        continue;
      }

      const relativePath = relative(absRoot, pkgDir).split("\\").join("/");

      if (isExcluded(relativePath, exclude)) {
        excluded.push({
          path: pkgDir,
          name,
          reason: "matched packages.exclude",
        });
        continue;
      }

      const comity = isRecord(manifest["comity"]) ? manifest["comity"] : null;
      const layer = comity?.["layer"];

      const record: PackageRecord = {
        name,
        path: pkgDir,
        layer: typeof layer === "string" ? layer : null,
        manifest,
      };

      allPackages.push(record);

      if (manifest["private"] === true) {
        excluded.push({
          path: pkgDir,
          name,
          reason: "private package",
        });
      } else {
        publishable.push(record);
      }
    }
  }

  allPackages.sort((a, b) => a.path.localeCompare(b.path));
  publishable.sort((a, b) => a.path.localeCompare(b.path));
  excluded.sort((a, b) => a.path.localeCompare(b.path));

  return { roots, usedDefaultRoots, allPackages, publishable, excluded };
}
