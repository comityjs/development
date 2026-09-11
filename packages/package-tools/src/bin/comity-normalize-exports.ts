#!/usr/bin/env node

/**
 * comity-normalize-exports — canonical export declaration normalizer for Comity packages.
 *
 * Usage:
 *   comity-normalize-exports [options]
 *
 * Options:
 *   --help, -h            Show this help
 *   --check               Check mode - exit with code 1 if changes needed
 *   --repo-root <dir>     Repository root (default: current working directory)
 *
 * The tool processes all index.ts files in packages/ and normalizes
 * export declaration ordering (type exports first, then runtime exports,
 * both sorted alphabetically by module specifier).
 */

import type { ExportDeclaration, Node, SourceFile } from "typescript";

import { realpathSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSourceFile,
  forEachChild,
  isExportDeclaration,
  ScriptTarget,
} from "typescript";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "coverage",
  "__tests__",
  "__mocks__",
]);

const EXCLUDED_PACKAGES = new Set<string>([]);

/**
 * Resolve the target repository root.
 *
 * The normal invocation is `pnpm normalize:exports` executed from the
 * target repository root, so `process.cwd()` is the preferred root.
 * An explicit `--repo-root <dir>` override is accepted for tooling use.
 *
 * Following the established convention of the sibling
 * `comity-normalize-package-json` CLI.
 */
export function resolveRepoRoot(args: string[]): string {
  let repoRoot = process.cwd();
  const repoRootIndex = args.indexOf("--repo-root");

  if (repoRootIndex !== -1 && repoRootIndex + 1 < args.length) {
    const val = args[repoRootIndex + 1];

    if (val) repoRoot = resolve(val);
  }

  return repoRoot;
}

/**
 * Validate that the resolved repository root contains the expected
 * `packages/` structure. Fails explicitly instead of producing a
 * vacuous empty result.
 *
 * @throws Error when the target repository does not contain a `packages/`
 * directory or it is not a directory.
 */
export async function resolvePackagesDir(repoRoot: string): Promise<string> {
  const packagesDir = resolve(repoRoot, "packages");
  let packagesStat;

  try {
    packagesStat = await stat(packagesDir);
  } catch {
    throw new Error(
      `repository target '${repoRoot}' does not contain a 'packages/' directory`,
    );
  }

  if (!packagesStat.isDirectory()) {
    throw new Error(`'${packagesDir}' exists but is not a directory`);
  }

  return packagesDir;
}

function shouldProcessFile(repoRoot: string, filePath: string): boolean {
  const relPath = relative(repoRoot, filePath);
  const parts = relPath.split("/");

  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return false;
  }

  return true;
}

function getPackageName(packagesDir: string, filePath: string): string {
  const relPath = relative(packagesDir, filePath);
  const pkgDir = relPath.split("/")[0];

  return `@comity/${pkgDir}`;
}

function isExcludedPackage(pkgName: string): boolean {
  return EXCLUDED_PACKAGES.has(pkgName);
}

function isSetupIndex(filePath: string): boolean {
  return filePath.includes("/src/setup/index.ts");
}

export async function findTypeScriptFiles(
  repoRoot: string,
  dir: string,
): Promise<string[]> {
  const files: string[] = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    // A missing/unreadable packages directory is a configuration error,
    // not an empty repository. Surface it instead of returning [].
    throw new Error(
      `cannot read directory '${dir}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (!shouldProcessFile(repoRoot, fullPath)) continue;

    if (entry.isDirectory()) {
      files.push(...(await findTypeScriptFiles(repoRoot, fullPath)));
    } else if (entry.name === "index.ts" && fullPath.includes("/src/")) {
      files.push(fullPath);
    }
  }

  return files;
}

function getSourceFile(filePath: string, content: string): SourceFile {
  return createSourceFile(filePath, content, ScriptTarget.Latest, true);
}

function getExportDeclarations(sourceFile: SourceFile): ExportDeclaration[] {
  const exports: ExportDeclaration[] = [];

  function visit(node: Node): void {
    if (isExportDeclaration(node)) {
      exports.push(node);
    }

    forEachChild(node, visit);
  }

  visit(sourceFile);

  return exports;
}

interface ExportInfo {
  text: string;
  isTypeOnly: boolean;
  moduleSpecifier: string;
  start: number;
  end: number;
  node: ExportDeclaration;
}

function getExportInfo(
  exportDecl: ExportDeclaration,
  sourceFile: SourceFile,
): ExportInfo {
  const text = exportDecl.getText(sourceFile);
  const isTypeOnly = exportDecl.isTypeOnly === true;
  const moduleSpecifier = exportDecl.moduleSpecifier?.getText(sourceFile) ?? "";
  const start = exportDecl.getStart(sourceFile);
  const end = exportDecl.getEnd();

  return {
    text,
    isTypeOnly,
    moduleSpecifier: moduleSpecifier.replace(/^["']|["']$/g, ""),
    start,
    end,
    node: exportDecl,
  };
}

function getSortKey(info: ExportInfo): string {
  return info.moduleSpecifier || "zzz-local";
}

function normalizeExports(content: string, sourceFile: SourceFile): string {
  const exportDecls = getExportDeclarations(sourceFile);

  if (exportDecls.length === 0) return content;

  const exportInfos = exportDecls.map((decl) =>
    getExportInfo(decl, sourceFile),
  );

  const typeExports = exportInfos.filter((info) => info.isTypeOnly);
  const runtimeExports = exportInfos.filter((info) => !info.isTypeOnly);

  if (typeExports.length === 0 && runtimeExports.length === 0) {
    return content;
  }

  // exportInfos is guaranteed non-empty here because we checked above
  const firstExport = exportInfos[0]!;
  const lastExport = exportInfos[exportInfos.length - 1]!;

  typeExports.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
  runtimeExports.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));

  const lines = content.split(/\r?\n/);

  const startLine = sourceFile.getLineAndCharacterOfPosition(
    firstExport.start,
  ).line;
  const endLine = sourceFile.getLineAndCharacterOfPosition(lastExport.end).line;

  const beforeExports = lines.slice(0, startLine);
  const afterExports = lines.slice(endLine + 1);

  const newExportLines: string[] = [];

  if (typeExports.length > 0) {
    newExportLines.push(...typeExports.map((info) => info.text));
  }

  if (typeExports.length > 0 && runtimeExports.length > 0) {
    newExportLines.push("");
  }

  if (runtimeExports.length > 0) {
    newExportLines.push(...runtimeExports.map((info) => info.text));
  }

  const newContent = [
    ...beforeExports,
    ...newExportLines,
    ...afterExports,
  ].join("\n");

  return newContent;
}

interface ProcessResult {
  filePath: string;
  original: string;
  normalized: string;
  changed: boolean;
}

async function processFile(filePath: string): Promise<ProcessResult> {
  const content = await readFile(filePath, "utf8");
  const sourceFile = getSourceFile(filePath, content);
  const newContent = normalizeExports(content, sourceFile);

  return {
    filePath,
    original: content,
    normalized: newContent,
    changed: content !== newContent,
  };
}

function printHelp(): void {
  console.log(`comity-normalize-exports — canonical export declaration normalizer for Comity packages

Usage:
  comity-normalize-exports [options]

Options:
  --help, -h            Show this help
  --check               Check mode - exit with code 1 if changes needed
  --repo-root <dir>     Repository root (default: current working directory)

The tool processes all index.ts files in packages/ and normalizes
export declaration ordering (type exports first, then runtime exports,
both sorted alphabetically by module specifier).`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check") || args.includes("-c");
  const helpMode = args.includes("--help") || args.includes("-h");

  if (helpMode) {
    printHelp();
    process.exit(0);
  }

  const repoRoot = resolveRepoRoot(args);
  const packagesDir = await resolvePackagesDir(repoRoot);
  const files = await findTypeScriptFiles(repoRoot, packagesDir);

  console.log(`Found ${files.length} index.ts files to process`);

  let hasChanges = false;
  const changedFiles: { path: string; pkg: string }[] = [];

  for (const filePath of files) {
    if (!shouldProcessFile(repoRoot, filePath)) continue;

    const pkgName = getPackageName(packagesDir, filePath);

    if (isExcludedPackage(pkgName)) continue;

    const result = await processFile(filePath);

    if (result.changed) {
      hasChanges = true;

      changedFiles.push({ path: result.filePath, pkg: pkgName });

      if (!checkMode) {
        await writeFile(result.filePath, result.normalized, "utf8");
        console.log(`Normalized: ${relative(repoRoot, result.filePath)}`);
      } else {
        console.log(`Would normalize: ${relative(repoRoot, result.filePath)}`);
      }
    }
  }

  if (checkMode) {
    if (hasChanges) {
      console.log(`\n${changedFiles.length} file(s) would be changed:`);

      for (const f of changedFiles) {
        console.log(`  - ${f.pkg}: ${relative(repoRoot, f.path)}`);
      }

      process.exit(1);
    } else {
      console.log("All export declarations are already normalized.");
      process.exit(0);
    }
  } else {
    if (hasChanges) {
      console.log(`\nNormalized ${changedFiles.length} file(s).`);
    } else {
      console.log("All export declarations are already normalized.");
    }
  }
}

/**
 * Returns true when this module is being executed directly by Node (as a
 * CLI), rather than being imported by another module (e.g. tests).
 *
 * The comparison is made on real paths so symlinked execution (e.g. pnpm
 * `.bin` shims, `/var` → `/private/var` on macOS) does not false-negative.
 */
function isDirectExecution(): boolean {
  const entry = process.argv[1];

  if (!entry) return false;

  try {
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    const entryPath = realpathSync(entry);

    return modulePath === entryPath;
  } catch {
    return false;
  }
}

// Only run the CLI when executed directly; importing this module (e.g. in
// tests) must not trigger discovery/exit.
if (isDirectExecution()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`comity-normalize-exports: ${message}`);
    process.exit(1);
  });
}
