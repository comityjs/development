/**
 * @comity-dev/validate — dependency resolution.
 *
 * The validator runs tools (dependency-cruiser, ESLint) and loads modules
 * (the Comity ESLint plugin, the TypeScript parser) that are its OWN declared
 * dependencies. They are resolved from this package's location, so the result
 * follows the validator's dependency graph under any package-manager layout
 * (npm hoisting, pnpm symlinks). Neither `node_modules/.bin` nor the consumer
 * repository's `node_modules` is consulted.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolves a bare specifier to a `file:` URL, as `import.meta.resolve` does. */
export type ModuleResolver = (specifier: string) => string;

/** Resolve relative to this module, i.e. through the validator's own dependencies. */
export const resolveFromValidator: ModuleResolver = (specifier) =>
  import.meta.resolve(specifier);

export type ResolvedTool =
  | { ok: true; script: string }
  | { ok: false; reason: string; cause: unknown };

interface Manifest {
  name?: string;
  bin?: string | Record<string, string>;
}

function readManifest(path: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Resolve the executable script declared in the `bin` map of a dependency.
 *
 * The package is located through its public entry point, then its manifest is
 * found by walking up from that entry: a package's `exports` map normally
 * does not expose `package.json`, and the entry point is not the executable.
 * Never throws; a failure is returned with the original cause preserved.
 */
export function resolveToolScript(
  packageName: string,
  binName: string,
  resolver: ModuleResolver = resolveFromValidator,
): ResolvedTool {
  let entry: string;

  try {
    entry = fileURLToPath(resolver(packageName));
  } catch (cause) {
    return {
      ok: false,
      reason: `cannot resolve dependency "${packageName}" (providing "${binName}") from @comity-dev/validate: ${(cause as Error).message}`,
      cause,
    };
  }

  let dir = dirname(entry);

  for (;;) {
    const manifestPath = resolve(dir, "package.json");
    const manifest = readManifest(manifestPath);

    if (manifest?.name === packageName) {
      const bin = manifest.bin;
      const relative =
        typeof bin === "string"
          ? binName === packageName.split("/").pop()
            ? bin
            : undefined
          : bin?.[binName];

      if (!relative) {
        return {
          ok: false,
          reason: `"${packageName}" (${manifestPath}) does not declare a "${binName}" executable in its "bin" field`,
          cause: new Error(`missing bin "${binName}" in ${manifestPath}`),
        };
      }

      return { ok: true, script: resolve(dir, relative) };
    }

    const parent = dirname(dir);

    if (parent === dir) {
      return {
        ok: false,
        reason: `cannot locate the package.json of "${packageName}" above ${entry}`,
        cause: new Error(`no manifest named "${packageName}" above ${entry}`),
      };
    }

    dir = parent;
  }
}

/**
 * Resolve module specifiers to `file:` URLs through the validator's
 * dependency graph. Returns the URLs in the order requested, or the failure
 * with its cause.
 */
export function resolveModuleUrls<K extends string>(
  specifiers: Record<K, string>,
  resolver: ModuleResolver = resolveFromValidator,
):
  | { ok: true; urls: Record<K, string> }
  | { ok: false; reason: string; cause: unknown } {
  const urls = {} as Record<K, string>;

  for (const key of Object.keys(specifiers) as K[]) {
    const specifier = specifiers[key];

    try {
      urls[key] = resolver(specifier);
    } catch (cause) {
      return {
        ok: false,
        reason: `cannot resolve dependency "${specifier}" from @comity-dev/validate: ${(cause as Error).message}`,
        cause,
      };
    }
  }

  return { ok: true, urls };
}
