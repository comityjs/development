#!/usr/bin/env node

/**
 * comity-normalize-package-json — canonical key-order normalizer for `package.json`
 * files in a Comity workspace.
 *
 * Usage:
 *   comity-normalize-package-json [options]
 *
 * Options:
 *   --help, -h                  Show this help
 *   --check                     Check mode - exit with code 1 if changes needed
 *   --packages-dir <dir>        Directory containing packages (default: packages)
 *   --package-pattern <re>      Regex pattern for package names (default: ^@comity/)
 *   --repo-root <dir>           Repository root (default: auto-detected)
 *
 * Exit codes:
 *   0 - Success (no changes needed in check mode, or changes applied)
 *   1 - Changes needed (check mode) or error
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const CANONICAL_TOP_LEVEL_ORDER = [
  "name",
  "version",
  "description",
  "type",
  "private",
  "author",
  "license",
  "comity",
  "homepage",
  "repository",
  "bugs",
  "engines",
  "keywords",
  "scripts",
  "files",
  "main",
  "module",
  "types",
  "exports",
  "typesVersions",
  "publishConfig",
  "sideEffects",
  "peerDependencies",
  "dependencies",
  "optionalDependencies",
  "devDependencies",
];

const CANONICAL_SCRIPTS_ORDER = ["build", "prepublishOnly", "dev", "test", "type-check", "lint"];

const CANONICAL_KEYWORD_PRIORITY = ["comity", "comityjs"];

function sortDependencies(deps: Record<string, string> | undefined): Record<string, string> {
  if (!deps || typeof deps !== "object") return {};

  const comity: Record<string, string> = {};
  const scoped: Record<string, string> = {};
  const unscoped: Record<string, string> = {};

  for (const [key, value] of Object.entries(deps)) {
    if (key.startsWith("@comity/")) {
      comity[key] = value;
    } else if (key.startsWith("@")) {
      scoped[key] = value;
    } else {
      unscoped[key] = value;
    }
  }

  const sortObj = (obj: Record<string, string>) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

  return { ...sortObj(comity), ...sortObj(scoped), ...sortObj(unscoped) };
}

function sortKeywords(keywords: string[] | undefined): string[] {
  if (!Array.isArray(keywords)) return [];

  const priority = new Set(CANONICAL_KEYWORD_PRIORITY);
  const priorityKeywords: string[] = [];
  const otherKeywords: string[] = [];

  for (const kw of keywords) {
    if (priority.has(kw)) {
      priorityKeywords.push(kw);
    } else {
      otherKeywords.push(kw);
    }
  }

  return [...priorityKeywords.sort(), ...otherKeywords.sort()];
}

function sortExports(exports: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!exports || typeof exports !== "object") return {};

  const result: Record<string, unknown> = {};

  if (exports["."] !== undefined) {
    result["."] = exports["."];
  }

  const subpaths = Object.keys(exports)
    .filter((k) => k !== "." && k !== "./package.json")
    .sort();

  for (const subpath of subpaths) {
    result[subpath] = exports[subpath];
  }

  if (exports["./package.json"] !== undefined) {
    result["./package.json"] = exports["./package.json"];
  }

  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const conditionOrder = ["import", "require", "types", "default"];
      const sortedConditions: Record<string, unknown> = {};
      const valueObj = value as Record<string, unknown>;
      for (const cond of conditionOrder) {
        if (valueObj[cond] !== undefined) {
          sortedConditions[cond] = valueObj[cond];
        }
      }
      for (const [cond, val] of Object.entries(valueObj)) {
        if (!conditionOrder.includes(cond)) {
          sortedConditions[cond] = val;
        }
      }
      result[key] = sortedConditions;
    }
  }

  return result;
}

function sortTypesVersions(typesVersions: Record<string, Record<string, string>> | undefined): Record<string, Record<string, string>> {
  if (!typesVersions || typeof typesVersions !== "object") return {};

  const result: Record<string, Record<string, string>> = {};

  for (const [version, mapping] of Object.entries(typesVersions)) {
    if (mapping && typeof mapping === "object") {
      result[version] = Object.fromEntries(
        Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b))
      );
    }
  }

  return result;
}

function sortScripts(scripts: Record<string, string> | undefined): Record<string, string> {
  if (!scripts || typeof scripts !== "object") return {};

  const result: Record<string, string> = {};

  for (const script of CANONICAL_SCRIPTS_ORDER) {
    if (scripts[script] !== undefined) {
      result[script] = scripts[script];
    }
  }

  for (const [key, value] of Object.entries(scripts)) {
    if (!CANONICAL_SCRIPTS_ORDER.includes(key)) {
      result[key] = value;
    }
  }

  return result;
}

function normalizePackageJson(pkgJson: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const key of CANONICAL_TOP_LEVEL_ORDER) {
    if (pkgJson[key] !== undefined) {
      let value = pkgJson[key];

      if (
        ["peerDependencies", "dependencies", "optionalDependencies", "devDependencies"].includes(key)
      ) {
        value = sortDependencies(value as Record<string, string>);
      } else if (key === "keywords") {
        value = sortKeywords(value as string[]);
      } else if (key === "exports") {
        value = sortExports(value as Record<string, unknown>);
      } else if (key === "typesVersions") {
        value = sortTypesVersions(value as Record<string, Record<string, string>>);
      } else if (key === "scripts") {
        value = sortScripts(value as Record<string, string>);
      }

      normalized[key] = value;
    }
  }

  for (const [key, value] of Object.entries(pkgJson)) {
    if (!CANONICAL_TOP_LEVEL_ORDER.includes(key)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

async function readPackageJson(pkgPath: string): Promise<Record<string, unknown>> {
  const content = await readFile(pkgPath, "utf8");
  return JSON.parse(content);
}

async function writePackageJson(pkgPath: string, pkgJson: Record<string, unknown>): Promise<void> {
  const content = JSON.stringify(pkgJson, null, 2) + "\n";
  await writeFile(pkgPath, content, "utf8");
}

interface PackageJsonInfo {
  path: string;
  name: string;
  json: Record<string, unknown>;
}

async function findPackageJsons(packagesDir: string, packagePattern: string): Promise<PackageJsonInfo[]> {
  const packageJsons: PackageJsonInfo[] = [];

  let entries;
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    return packageJsons;
  }

  const regex = new RegExp(packagePattern);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pkgPath = join(packagesDir, entry.name, "package.json");
    try {
      const pkgJson = await readPackageJson(pkgPath);
      const pkgName = pkgJson["name"] as string | undefined;
      if (pkgName && regex.test(pkgName)) {
        packageJsons.push({ path: pkgPath, name: pkgName, json: pkgJson });
      }
    } catch {
      continue;
    }
  }

  return packageJsons;
}

function printHelp(): void {
  console.log(`Usage: comity-normalize-package-json [options]

Options:
  --packages-dir <dir>    Directory containing packages (default: packages)
  --package-pattern <re>  Regex pattern for package names (default: ^@comity/)
  --repo-root <dir>       Repository root (default: auto-detected)
  --check                 Check mode - exit with code 1 if changes needed
  --help                  Show this help

Exit codes:
  0 - Success (no changes needed in check mode, or changes applied)
  1 - Changes needed (check mode) or error`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const checkMode = args.includes("--check");

  let packagesDir = "packages";
  const packagesDirIndex = args.indexOf("--packages-dir");
  if (packagesDirIndex !== -1 && packagesDirIndex + 1 < args.length) {
    const val = args[packagesDirIndex + 1];
    if (val) packagesDir = val;
  }

  let packagePattern = "^@comity/";
  const packagePatternIndex = args.indexOf("--package-pattern");
  if (packagePatternIndex !== -1 && packagePatternIndex + 1 < args.length) {
    const val = args[packagePatternIndex + 1];
    if (val) packagePattern = val;
  }

  let repoRoot = process.cwd();
  const repoRootIndex = args.indexOf("--repo-root");
  if (repoRootIndex !== -1 && repoRootIndex + 1 < args.length) {
    const val = args[repoRootIndex + 1];
    if (val) repoRoot = resolve(val);
  }

  const resolvedPackagesDir = resolve(repoRoot, packagesDir);

  const packageJsons = await findPackageJsons(resolvedPackagesDir, packagePattern);
  let hasChanges = false;
  const changedFiles: string[] = [];

  for (const { path, name, json } of packageJsons) {
    const normalized = normalizePackageJson(json);
    const originalContent = JSON.stringify(json, null, 2) + "\n";
    const normalizedContent = JSON.stringify(normalized, null, 2) + "\n";

    if (originalContent !== normalizedContent) {
      hasChanges = true;
      changedFiles.push(name);

      if (!checkMode) {
        await writePackageJson(path, normalized);
        console.log(`Normalized: ${name}`);
      } else {
        console.log(`Would normalize: ${name}`);
      }
    }
  }

  if (checkMode) {
    if (hasChanges) {
      console.log(`\n${changedFiles.length} package.json file(s) would be changed:`);
      for (const name of changedFiles) {
        console.log(`  - ${name}`);
      }
      process.exit(1);
    } else {
      console.log("All package.json files are already normalized.");
      process.exit(0);
    }
  } else {
    if (hasChanges) {
      console.log(`\nNormalized ${changedFiles.length} package.json file(s).`);
    } else {
      console.log("All package.json files are already normalized.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});