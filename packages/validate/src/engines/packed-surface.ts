import type { PackageRecord, Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, posix } from "node:path";
import {
  classifyExternal,
  dependencySets,
  isDeclarationFile,
  parseDeclarationText,
  sortFindings,
  type QueryContext,
} from "./declaration-dependencies.js";
import { discoverPublishablePackages } from "../discover.js";

const SOURCE = "ADR-035";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const EXACT_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const IMPORT_CONDITIONS = new Set(["node", "import", "default"]);
const REQUIRE_CONDITIONS = new Set(["node", "require", "default"]);

class ToolUnavailableError extends Error {}
class PackedConfigurationError extends Error {}

interface TarPackage {
  files: string[];
  fileSet: Set<string>;
  read(file: string): string;
}

interface PackedPackage {
  packageRecord: PackageRecord;
  workspacePath: string;
  tarballPath: string;
  tar: TarPackage;
  manifest: Record<string, unknown>;
}

interface ManifestTarget {
  field: string;
  target: string;
  entry: string | null;
}

interface RuntimeExport {
  key: string;
  value: unknown;
}

interface ProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function run(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
): ProcessResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      throw new ToolUnavailableError(
        `Required tool "${command}" was not found on PATH`,
      );
    }

    throw new PackedConfigurationError(
      `Failed to execute "${command} ${args.join(" ")}": ${result.error.message}`,
    );
  }

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function normalizeTarPath(raw: string): string {
  if (raw.startsWith("/") || raw.includes("\0")) {
    throw new PackedConfigurationError(`Unsafe absolute path in tarball: ${raw}`);
  }

  const normalized = posix.normalize(raw).replace(/^\.\//, "");

  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new PackedConfigurationError(
      `Unsafe path traversal entry in tarball: ${raw}`,
    );
  }

  if (!normalized.startsWith("package/")) {
    throw new PackedConfigurationError(
      `Tarball entry is not under the "package/" prefix: ${raw}`,
    );
  }

  return normalized.slice("package/".length);
}

function readTarball(tarballPath: string): TarPackage {
  const listing = run("tar", ["-tzf", tarballPath], process.cwd(), 60_000);

  if (listing.status !== 0) {
    throw new PackedConfigurationError(
      `Cannot read tarball ${tarballPath}: ${listing.stderr.trim() || `tar exited ${listing.status}`}`,
    );
  }

  const files = listing.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(normalizeTarPath)
    .filter((file) => file.length > 0 && !file.endsWith("/"))
    .sort();
  const fileSet = new Set(files);
  const cache = new Map<string, string>();

  return {
    files,
    fileSet,
    read(file: string): string {
      const cached = cache.get(file);

      if (cached !== undefined) return cached;

      if (!fileSet.has(file)) {
        throw new PackedConfigurationError(
          `Tarball entry is missing: package/${file}`,
        );
      }

      const extracted = run(
        "tar",
        ["-xOf", tarballPath, `package/${file}`],
        process.cwd(),
        60_000,
      );

      if (extracted.status !== 0) {
        throw new PackedConfigurationError(
          `Cannot read package/${file} from ${tarballPath}: ${extracted.stderr.trim() || `tar exited ${extracted.status}`}`,
        );
      }

      cache.set(file, extracted.stdout);

      return extracted.stdout;
    },
  };
}

function readPackedManifest(tar: TarPackage): Record<string, unknown> {
  const parsed: unknown = JSON.parse(tar.read("package.json"));

  if (!isRecord(parsed)) {
    throw new PackedConfigurationError("Packed package.json is not a JSON object");
  }

  return parsed;
}

function packPackage(pkg: PackageRecord, destination: string): string {
  const result = run(
    "pnpm",
    ["pack", "--pack-destination", destination, "--silent"],
    pkg.path,
    120_000,
  );

  if (result.status !== 0) {
    throw new PackedConfigurationError(
      `pnpm pack failed for "${pkg.name}": ${result.stderr.trim() || `pnpm exited ${result.status}`}`,
    );
  }

  const tarballs = readdirSync(destination)
    .filter((file) => file.endsWith(".tgz"))
    .sort();

  if (tarballs.length !== 1) {
    throw new PackedConfigurationError(
      `pnpm pack for "${pkg.name}" produced ${tarballs.length} tarball(s) in ${destination}`,
    );
  }

  const tarball = tarballs[0];

  if (!tarball) {
    throw new PackedConfigurationError(
      `pnpm pack for "${pkg.name}" produced no tarball`,
    );
  }

  return join(destination, tarball);
}

function normalizeTarget(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");

  return posix.normalize(normalized);
}

function isSafeRelativeTarget(target: string): boolean {
  return (
    target.length > 0 &&
    !target.startsWith("/") &&
    target !== ".." &&
    !target.startsWith("../")
  );
}

function addTarget(
  targets: ManifestTarget[],
  field: string,
  value: string,
  entry: string | null,
): void {
  const target = normalizeTarget(value);

  if (!isSafeRelativeTarget(target)) return;

  targets.push({ field, target, entry });
}

function walkExportValue(
  targets: ManifestTarget[],
  field: string,
  entry: string,
  value: unknown,
): void {
  if (typeof value === "string") {
    addTarget(targets, field, value, entry);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) walkExportValue(targets, field, entry, item);
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    walkExportValue(
      targets,
      field,
      key.startsWith(".") ? key : entry,
      child,
    );
  }
}

function collectManifestTargets(
  manifest: Record<string, unknown>,
): ManifestTarget[] {
  const targets: ManifestTarget[] = [];
  const exportsField = manifest["exports"];

  if (typeof exportsField === "string") {
    addTarget(targets, "exports", exportsField, ".");
  } else if (isRecord(exportsField)) {
    const hasSubpaths = Object.keys(exportsField).some((key) =>
      key.startsWith("."),
    );

    if (hasSubpaths) {
      for (const [key, value] of Object.entries(exportsField)) {
        if (key.startsWith(".")) {
          walkExportValue(targets, `exports["${key}"]`, key, value);
        }
      }
    } else {
      walkExportValue(targets, "exports", ".", exportsField);
    }
  }

  for (const field of ["main", "module", "types"] as const) {
    const value = manifest[field];

    if (typeof value === "string") addTarget(targets, field, value, ".");
  }

  const bin = manifest["bin"];

  if (typeof bin === "string") {
    addTarget(targets, "bin", bin, null);
  } else if (isRecord(bin)) {
    for (const value of Object.values(bin)) {
      if (typeof value === "string") addTarget(targets, "bin", value, null);
    }
  }

  const typesVersions = manifest["typesVersions"];

  if (isRecord(typesVersions)) {
    for (const mapping of Object.values(typesVersions)) {
      if (!isRecord(mapping)) continue;

      for (const [subpath, value] of Object.entries(mapping)) {
        const entry = subpath.startsWith(".")
          ? subpath
          : subpath === "*"
            ? "*"
            : `./${subpath}`;

        if (typeof value === "string") {
          addTarget(targets, "typesVersions", value, entry);
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "string") {
              addTarget(targets, "typesVersions", item, entry);
            }
          }
        }
      }
    }
  }

  return targets;
}

function targetFiles(tar: TarPackage, target: string): string[] {
  if (target.includes("*")) {
    return tar.files.filter((file) => matchesGlob(file, target));
  }

  return tar.fileSet.has(target) ? [target] : [];
}

function relativeCandidates(specifier: string, fromFile: string): string[] {
  const base = posix.normalize(
    posix.join(posix.dirname(fromFile), specifier),
  );
  const candidates: string[] = [];

  if (base.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.d.ts`);
  else if (base.endsWith(".mjs")) candidates.push(`${base.slice(0, -4)}.d.mts`);
  else if (base.endsWith(".cjs")) candidates.push(`${base.slice(0, -4)}.d.cts`);
  else if (isDeclarationFile(base)) candidates.push(base);

  candidates.push(`${base}.d.ts`, posix.join(base, "index.d.ts"));

  return candidates;
}

/**
 * A recorded ARCH-PACK-005 exception (ADR-033 §4): a line in the package's
 * `docs/conventions.md` that names the sibling and records the exception or
 * its justification. ADR-033 does not prescribe a machine format, so the check
 * stays deliberately permissive: the sibling must be named on the same line as
 * the exception or justification wording.
 */
function exactPinException(packagePath: string, sibling: string): boolean {
  const convention = join(packagePath, "docs", "conventions.md");

  if (!existsSync(convention)) return false;

  try {
    return readFileSync(convention, "utf8")
      .split(/\r?\n/)
      .some(
        (line) =>
          line.includes(sibling) &&
          /exception|justification/i.test(line) &&
          !/\bno\s+(?:recorded\s+)?exceptions?\b/i.test(line),
      );
  } catch {
    return false;
  }
}

function finding(
  pkg: string,
  rule: string,
  message: string,
  remediation: string,
  options: {
    file?: string | undefined;
    keyword?: string | undefined;
  } = {},
): Finding {
  return {
    tool: "packed-surface",
    rule,
    package: pkg,
    file: options.file,
    keyword: options.keyword,
    severity: "error",
    source: SOURCE,
    message,
    remediation,
  };
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const item of findings) {
    const key = [
      item.package ?? "",
      item.rule,
      item.file ?? "",
      item.keyword ?? "",
      item.message,
    ].join("\0");

    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function resolveRuntimeTarget(
  value: unknown,
  conditions: ReadonlySet<string>,
): string | null {
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveRuntimeTarget(item, conditions);

      if (resolved) return resolved;
    }

    return null;
  }

  if (!isRecord(value)) return null;

  for (const [key, child] of Object.entries(value)) {
    if (key === "types") continue;
    if (key !== "default" && !conditions.has(key)) continue;

    const resolved = resolveRuntimeTarget(child, conditions);

    if (resolved) return resolved;
  }

  return null;
}

function runtimeExports(manifest: Record<string, unknown>): RuntimeExport[] {
  const exportsField = manifest["exports"];

  if (typeof exportsField === "string") {
    return [{ key: ".", value: exportsField }];
  }

  if (!isRecord(exportsField)) return [];

  const hasSubpaths = Object.keys(exportsField).some((key) =>
    key.startsWith("."),
  );

  if (!hasSubpaths) return [{ key: ".", value: exportsField }];

  return Object.entries(exportsField)
    .filter(([key]) => key.startsWith("."))
    .map(([key, value]) => ({ key, value }));
}

/**
 * Rules `ARCH-PACK-004` (unrewritten `workspace:`/`file:`/`link:` specifiers)
 * and `ARCH-PACK-005` (exact sibling pins without a recorded ADR-033 exception),
 * evaluated against the **packed** manifest.
 *
 * Exported so the `workspace:` branch of `ARCH-PACK-004` has direct test
 * coverage: a real `pnpm pack` always rewrites `workspace:` protocols (and fails
 * outright when it cannot resolve them), so a published tarball carrying a
 * `workspace:` specifier can only come from a broken publish path, never from
 * the packer this engine invokes.
 */
export function packedDependencySpecifierFindings(
  pkg: Pick<PackageRecord, "name" | "path">,
  manifest: Record<string, unknown>,
  siblingNames: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];

  for (const field of DEPENDENCY_FIELDS) {
    const values = manifest[field];

    if (!isRecord(values)) continue;

    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== "string") continue;

      if (!/^(?:workspace:|file:|link:)/.test(value)) continue;

      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-004",
          `Package "${pkg.name}" ships "${name}": "${value}" in ${field}; published manifests must not contain workspace:, file: or link: specifiers`,
          "Rewrite the dependency as a published semver range.",
          { file: "package.json", keyword: name },
        ),
      );
    }
  }

  for (const field of ["dependencies", "peerDependencies"] as const) {
    const values = manifest[field];

    if (!isRecord(values)) continue;

    for (const [name, value] of Object.entries(values)) {
      if (
        typeof value !== "string" ||
        !siblingNames.has(name) ||
        !EXACT_VERSION.test(value) ||
        exactPinException(pkg.path, name)
      ) {
        continue;
      }

      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-005",
          `Package "${pkg.name}" pins sibling "${name}" to exact version "${value}" in ${field} without a recorded exception in docs/conventions.md`,
          `Use a caret range (workspace:^ publishes as ^${value}) or record the exception in docs/conventions.md.`,
          { file: "package.json", keyword: name },
        ),
      );
    }
  }

  return findings;
}

function checkPackedPackage(
  packed: PackedPackage,
  packages: Map<string, PackageRecord>,
  siblingNames: ReadonlySet<string>,
): { findings: Finding[]; declarationFiles: number; externalReferences: number } {
  const findings: Finding[] = [];
  const pkg = packed.packageRecord;
  const manifest = packed.manifest;
  const targets = collectManifestTargets(manifest);
  const entries = new Map<string, Set<string>>();
  let externalReferences = 0;

  for (const target of targets) {
    const matches = targetFiles(packed.tar, target.target);

    if (matches.length === 0) {
      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-001",
          `Package "${pkg.name}" declares ${target.field} target "${target.target}" but the tarball does not contain it`,
          "Include the target in the package files field, or correct the manifest target.",
          { file: target.target, keyword: target.target },
        ),
      );
      continue;
    }

    if (target.entry === null) continue;

    for (const file of matches) {
      if (!isDeclarationFile(file)) continue;

      const keys = entries.get(file) ?? new Set<string>();

      keys.add(target.entry);
      entries.set(file, keys);
    }
  }

  const parsed = new Map<
    string,
    { relative: string[]; external: string[] }
  >();
  const entryKeysByFile = new Map<string, Set<string>>();
  const unresolved = new Map<string, Set<string>>();
  const queue: Array<{ file: string; entry: string }> = [];

  for (const [file, keys] of [...entries.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const entry of [...keys].sort()) queue.push({ file, entry });
  }

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];

    if (!item) continue;

    const keys = entryKeysByFile.get(item.file) ?? new Set<string>();

    if (keys.has(item.entry)) continue;

    keys.add(item.entry);
    entryKeysByFile.set(item.file, keys);

    let declaration = parsed.get(item.file);

    if (!declaration) {
      declaration = parseDeclarationText(
        item.file,
        packed.tar.read(item.file),
      );
      parsed.set(item.file, declaration);
    }

    for (const specifier of declaration.relative) {
      const resolved = relativeCandidates(specifier, item.file).find((file) =>
        packed.tar.fileSet.has(file),
      );

      if (resolved) {
        queue.push({ file: resolved, entry: item.entry });
      } else {
        const key = `${item.file}\0${specifier}`;
        const entryKeys = unresolved.get(key) ?? new Set<string>();

        entryKeys.add(item.entry);
        unresolved.set(key, entryKeys);
      }
    }
  }

  for (const [key, entryKeys] of unresolved) {
    const [file, specifier] = key.split("\0");

    if (!file || !specifier) continue;

    const entry = [...entryKeys].sort()[0] ?? "?";

    findings.push(
      finding(
        pkg.name,
        "ARCH-PACK-002",
        `Package "${pkg.name}" publishes entry "${entry}" whose declaration "${file}" references "${specifier}", but the resolved declaration is absent from the tarball`,
        "Include the emitted declaration in the package files field, or fix the relative reference.",
        { file, keyword: specifier },
      ),
    );
  }

  if (entryKeysByFile.size === 0 && targets.some((target) => target.entry !== null)) {
    findings.push(
      finding(
        pkg.name,
        "ARCH-PACK-002",
        `Package "${pkg.name}" declares declaration entry points but the tarball contains no reachable declaration file`,
        "Include the emitted declarations in the package files field.",
      ),
    );
  }

  const sets = dependencySets(manifest);
  const packedPackages = new Map(packages);

  for (const [file, entryKeys] of [...entryKeysByFile.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const declaration = parsed.get(file);

    if (!declaration) continue;

    const entry = [...entryKeys].sort()[0] ?? "?";
    const context: QueryContext = {
      packageRecord: pkg,
      sets,
      packages: packedPackages,
      rootReached: entryKeys.has("."),
      entry,
      tool: "packed-surface",
    };

    for (const specifier of [...declaration.external].sort()) {
      externalReferences += 1;

      const result = classifyExternal(specifier, file, context);

      if (result) findings.push(result);
    }
  }

  findings.push(
    ...packedDependencySpecifierFindings(
      { name: pkg.name, path: packed.workspacePath },
      manifest,
      siblingNames,
    ),
  );

  const cjs = packed.tar.files.filter(
    (file) => file === "dist/cjs" || file.startsWith("dist/cjs/"),
  );

  if (cjs.length > 0) {
    findings.push(
      finding(
        pkg.name,
        "ARCH-PACK-006",
        `Package "${pkg.name}" ships ${cjs.length} file(s) under dist/cjs/; Comity publishes a single ESM distribution`,
        "Remove the CommonJS build from the package outputs.",
        { file: "dist/cjs", keyword: "dist/cjs" },
      ),
    );
  }

  for (const entry of runtimeExports(manifest)) {
    const importTarget = resolveRuntimeTarget(entry.value, IMPORT_CONDITIONS);
    const requireTarget = resolveRuntimeTarget(entry.value, REQUIRE_CONDITIONS);

    if (!importTarget || !requireTarget) {
      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-006",
          `Package "${pkg.name}" exports "${entry.key}" but does not resolve for both import and require consumers`,
          "Add a default (or matching import/require) condition that resolves to the ESM artifact.",
          { file: "package.json", keyword: entry.key },
        ),
      );
      continue;
    }

    if (importTarget !== requireTarget) {
      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-006",
          `Package "${pkg.name}" exports "${entry.key}" with import "${importTarget}" and require "${requireTarget}"; both must resolve to the same ESM artifact`,
          "Point import and require at the same ESM file.",
          { file: "package.json", keyword: entry.key },
        ),
      );
      continue;
    }

    if (/\.(?:cjs|cts)$/.test(importTarget)) {
      findings.push(
        finding(
          pkg.name,
          "ARCH-PACK-006",
          `Package "${pkg.name}" exports "${entry.key}" to a CommonJS artifact "${importTarget}"`,
          "Publish the ESM artifact for this export.",
          { file: importTarget, keyword: entry.key },
        ),
      );
    }
  }

  return {
    findings: dedupeFindings(findings),
    declarationFiles: entryKeysByFile.size,
    externalReferences,
  };
}

export function runPackedSurface(repo: Repository): EngineResult {
  const start = Date.now();
  const discovery = discoverPublishablePackages(repo.root);

  if (discovery.publishable.length === 0) {
    if (discovery.allPackages.length === 0) {
      const defaultNote = discovery.usedDefaultRoots
        ? " The default package root was used."
        : "";
      const excludedNote =
        discovery.excluded.length > 0
          ? ` Excluded package directories: ${discovery.excluded.map((pkg) => pkg.path).join(", ")}.`
          : "";

      return {
        executed: false,
        exitCode: null,
        passed: false,
        findings: [],
        duration: Date.now() - start,
        status: "CONFIGURATION-ERROR",
        tool: "packed-surface",
        reason: `No package directory with a readable package.json was found under root(s): ${discovery.roots.join(", ")}.${defaultNote}${excludedNote}`,
      };
    }

    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "NOT-APPLICABLE",
      tool: "packed-surface",
      reason: `All discovered packages are private: ${discovery.excluded
        .filter((pkg) => pkg.reason === "private package")
        .map((pkg) => pkg.name ?? pkg.path)
        .join(", ")}.`,
    };
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "comity-packed-surface-"));
  const packed: PackedPackage[] = [];
  const configurationErrors: string[] = [];

  try {
    for (const [index, pkg] of discovery.publishable.entries()) {
      const destination = join(tempRoot, `pack-${index}`);

      mkdirSync(destination, { recursive: true });

      try {
        const tarballPath = packPackage(pkg, destination);
        const tar = readTarball(tarballPath);
        const manifest = readPackedManifest(tar);

        packed.push({
          packageRecord: { ...pkg, manifest },
          workspacePath: pkg.path,
          tarballPath,
          tar,
          manifest,
        });
      } catch (error) {
        if (error instanceof ToolUnavailableError) throw error;

        configurationErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });

    if (error instanceof ToolUnavailableError) {
      return {
        executed: false,
        exitCode: null,
        passed: false,
        findings: [],
        duration: Date.now() - start,
        status: "TOOL-UNAVAILABLE",
        tool: "packed-surface",
        reason: error.message,
      };
    }

    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "CONFIGURATION-ERROR",
      tool: "packed-surface",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const siblingNames = new Set(discovery.allPackages.map((pkg) => pkg.name));
    const packedByName = new Map(packed.map((item) => [item.packageRecord.name, item]));
    const packages = new Map<string, PackageRecord>();

    for (const pkg of discovery.allPackages) {
      const item = packedByName.get(pkg.name);

      packages.set(
        pkg.name,
        item
          ? { ...pkg, manifest: item.manifest }
          : pkg,
      );
    }

    const findings: Finding[] = [];
    let declarationFiles = 0;
    let externalReferences = 0;

    for (const item of packed) {
      try {
        const result = checkPackedPackage(item, packages, siblingNames);

        findings.push(...result.findings);
        declarationFiles += result.declarationFiles;
        externalReferences += result.externalReferences;
      } catch (error) {
        if (error instanceof ToolUnavailableError) throw error;

        configurationErrors.push(
          `${item.packageRecord.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    sortFindings(findings);

    if (configurationErrors.length > 0) {
      return {
        executed: false,
        exitCode: null,
        passed: false,
        findings,
        duration: Date.now() - start,
        status: "CONFIGURATION-ERROR",
        tool: "packed-surface",
        reason: configurationErrors.join("; "),
      };
    }

    const excludedNotes = discovery.excluded.map(
      (pkg) => `${pkg.name ?? pkg.path} (${pkg.reason})`,
    );
    const notes = [
      `${packed.length} publishable package(s)`,
      `${declarationFiles} reachable declaration file(s)`,
      `${externalReferences} external reference(s)`,
      "external references evaluated against the packed manifests (ARCH-PACK-003 umbrella; violations are reported as ARCH-DECL-DEP-001…005)",
    ];

    if (discovery.usedDefaultRoots) notes.push("default package root was used");
    if (excludedNotes.length > 0) {
      notes.push(`excluded: ${excludedNotes.join(", ")}`);
    }

    return {
      executed: true,
      exitCode: 0,
      passed: findings.length === 0,
      findings,
      duration: Date.now() - start,
      status: findings.length === 0 ? "PASS" : "FAIL",
      tool: "packed-surface",
      reason: notes.join("; "),
    };
  } catch (error) {
    if (error instanceof ToolUnavailableError) {
      return {
        executed: false,
        exitCode: null,
        passed: false,
        findings: [],
        duration: Date.now() - start,
        status: "TOOL-UNAVAILABLE",
        tool: "packed-surface",
        reason: error.message,
      };
    }

    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "CONFIGURATION-ERROR",
      tool: "packed-surface",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export { readTarball };
