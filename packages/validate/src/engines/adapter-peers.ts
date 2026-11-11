import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PackageRecord, Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

const KERNEL_PACKAGES: ReadonlySet<string> = new Set([
  "@comity/primitives",
  "@comity/kernel",
  "@comity/composition",
]);

const SOURCE =
  "adapters.md §13 / architecture-validation.md §7.4 (docs/standards/)";

/**
 * How a repository declares the Comity contracts a Technology Adapter consumes.
 *
 * - `paired` — the Comity monorepo convention (ADR-033 Decision 3): a consumed Core Module is
 *   listed in `dependencies` and, as the compatibility contract, in `peerDependencies`.
 * - `peer-only` — the convention of repositories that consume published Comity packages
 *   (Commerce package-dependency-policy §2, ADR-036): contracts are `peerDependencies` (plus an
 *   exact `devDependencies` entry for local builds and tests) and never runtime `dependencies`.
 *   Consumption is then established from the adapter's own production imports.
 *
 * The model is a property of the repository category (`comity.config.json` →
 * `repository.type`), not of any package: `enterprise` repositories use `peer-only`; every other
 * category keeps `paired`.
 */
type DependencyModel = "paired" | "peer-only";

function dependencyModelOf(repo: Repository): DependencyModel {
  return repo.repository.type === "enterprise" ? "peer-only" : "paired";
}

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts)$/;
const NON_PRODUCTION_DIRECTORIES: ReadonlySet<string> = new Set([
  "__tests__",
  "__fixtures__",
  "node_modules",
  "dist",
]);
const COMITY_IMPORT =
  /(?:from\s*|import\s*\(\s*|import\s+)["'](@comity\/[a-z0-9][a-z0-9-]*)(?:\/[^"']*)?["']/g;

/**
 * The `@comity/*` packages imported by a package's production source.
 *
 * Tests, fixtures, declaration files and build output are excluded: they justify development
 * dependencies, never a published peer.
 */
function importedComityPackages(pkg: PackageRecord): Set<string> {
  const found = new Set<string>();
  const walk = (directory: string): void => {
    let entries;

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!NON_PRODUCTION_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name));

        continue;
      }

      if (
        !SOURCE_EXTENSIONS.test(entry.name) ||
        entry.name.endsWith(".d.ts") ||
        /\.(?:test|spec)\./.test(entry.name)
      ) {
        continue;
      }

      const text = readFileSync(join(directory, entry.name), "utf8");

      for (const match of text.matchAll(COMITY_IMPORT)) {
        if (match[1] !== undefined) found.add(match[1]);
      }
    }
  };

  walk(join(pkg.path, "src"));

  return found;
}

/**
 * The layer of a Comity package: the workspace package when there is one, otherwise the manifest
 * installed next to the adapter (published packages declare their layer, ADR-026).
 */
function layerOf(
  name: string,
  workspaceLayers: ReadonlyMap<string, string | null>,
  from: PackageRecord,
): string | null {
  if (workspaceLayers.has(name)) return workspaceLayers.get(name) ?? null;

  const installed = join(from.path, "node_modules", name, "package.json");

  if (!existsSync(installed)) return null;

  try {
    const manifest = JSON.parse(readFileSync(installed, "utf8")) as {
      comity?: { layer?: unknown };
    };

    return typeof manifest.comity?.layer === "string" ? manifest.comity.layer : null;
  } catch {
    return null;
  }
}

/**
 * `peer-only` model checks for one adapter (everything after ARCH-ADAPTER-PEER-001).
 *
 * - ARCH-ADAPTER-PEER-006: a Comity package declared both in `dependencies` and in
 *   `peerDependencies`. That is the paired-model duplication; a peer-only repository declares a
 *   contract once, as a peer. (A Core Module declared only in `dependencies` is reported by
 *   ARCH-ADAPTER-PEER-003 when the adapter imports it: §13 requires consumed Core Modules to be
 *   peers.)
 * - ARCH-ADAPTER-PEER-003: a Core Module imported by production source but not declared as a peer.
 * - ARCH-ADAPTER-PEER-004: a Comity peer that is not the implemented Core Module, a kernel
 *   package, or a Core Module the adapter imports.
 */
function peerOnlyFindings(
  pkg: PackageRecord,
  coreModule: string,
  peerDeps: Record<string, string>,
  deps: Record<string, string>,
  layers: ReadonlyMap<string, string | null>,
): Finding[] {
  const findings: Finding[] = [];
  const imported = importedComityPackages(pkg);

  for (const dep of Object.keys(deps)) {
    if (!dep.startsWith("@comity/") || !peerDeps[dep]) continue;

    findings.push({
      tool: "schema",
      rule: "ARCH-ADAPTER-PEER-006",
      message: `Technology Adapter "${pkg.name}" declares "${dep}" in both dependencies and peerDependencies, but this repository declares a Comity contract once, as a peerDependency (with an exact devDependency)`,
      package: pkg.name,
      severity: "error",
      source: SOURCE,
      remediation: `Remove "${dep}" from dependencies; keep it in peerDependencies and devDependencies.`,
    });
  }

  for (const name of imported) {
    if (name === coreModule || KERNEL_PACKAGES.has(name) || peerDeps[name]) continue;
    if (layerOf(name, layers, pkg) !== "core") continue;

    findings.push({
      tool: "schema",
      rule: "ARCH-ADAPTER-PEER-003",
      message: `Technology Adapter "${pkg.name}" imports Core Module "${name}" but does not declare it as a peerDependency`,
      package: pkg.name,
      severity: "error",
      source: SOURCE,
      remediation: `Add "${name}" to peerDependencies.`,
    });
  }

  for (const peerDep of Object.keys(peerDeps)) {
    if (!peerDep.startsWith("@comity/")) continue;
    if (peerDep === coreModule || KERNEL_PACKAGES.has(peerDep)) continue;

    const layer = layerOf(peerDep, layers, pkg);
    // An unclassifiable package (not installed, not in the workspace) is accepted only when the
    // adapter's source imports it; a package of a known non-Core layer is never a Core peer.
    const justified = imported.has(peerDep) && (layer === "core" || layer === null);

    if (!justified) {
      findings.push({
        tool: "schema",
        rule: "ARCH-ADAPTER-PEER-004",
        message: `Technology Adapter "${pkg.name}" declares peerDependency on "${peerDep}" which is not the implemented Core Module, a Kernel package, or a Core Module imported by the adapter's production source`,
        package: pkg.name,
        severity: "error",
        source: SOURCE,
        remediation: `Remove "${peerDep}" from peerDependencies unless it is the implemented Core Module, a Kernel package, or a Core Module the adapter actually imports.`,
      });
    }
  }

  return findings;
}

export function runAdapterPeers(repo: Repository): EngineResult {
  const start = Date.now();
  const findings: Finding[] = [];

  // Authoritative layer lookup per ADR-026: each package's own manifest
  // declares its layer. Used to distinguish consumed Core Modules (which
  // §13 requires as peers) from kernel and other layers.
  const layers = new Map(repo.packages.map((p) => [p.name, p.layer]));
  const model = dependencyModelOf(repo);

  for (const pkg of repo.packages) {
    if (pkg.layer !== "technology-adapter") continue;

    const m = pkg.manifest as {
      comity?: { implements?: unknown };
      peerDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    const implementsMeta = m.comity?.implements;

    // Validate that the technology-adapter declares its implemented Core Module in comity.implements
    if (typeof implementsMeta !== "string" || !implementsMeta.trim()) {
      findings.push({
        tool: "schema",
        rule: "ARCH-ADAPTER-PEER-005",
        message: `Technology Adapter "${pkg.name}" cannot determine implemented Core Module (missing or invalid comity.implements)`,
        package: pkg.name,
        severity: "error",
        source: SOURCE,
        remediation:
          'Ensure package.json has "comity.implements" set to a string Core Module package name.',
      });

      continue;
    }

    const coreModule = implementsMeta.trim();
    const peerDeps = m.peerDependencies ?? {};
    const deps = m.dependencies ?? {};

    // Validate that the technology-adapter declares its implemented Core Module as a peerDependency
    if (!peerDeps[coreModule]) {
      findings.push({
        tool: "schema",
        rule: "ARCH-ADAPTER-PEER-001",
        message: `Technology Adapter "${pkg.name}" implements "${coreModule}" but does not declare it as a peerDependency`,
        package: pkg.name,
        severity: "error",
        source: SOURCE,
        remediation: `Add "${coreModule}" to peerDependencies.`,
      });
    }

    if (model === "peer-only") {
      findings.push(...peerOnlyFindings(pkg, coreModule, peerDeps, deps, layers));

      continue;
    }

    // Validate that the technology-adapter declares its implemented Core Module as a dependency
    if (!deps[coreModule] && !peerDeps[coreModule]) {
      findings.push({
        tool: "schema",
        rule: "ARCH-ADAPTER-PEER-002",
        message: `Technology Adapter "${pkg.name}" implements "${coreModule}" but does not depend on it at all`,
        package: pkg.name,
        severity: "error",
        source: SOURCE,
        remediation: `Add "${coreModule}" to dependencies and peerDependencies.`,
      });
    }

    // Validate that every consumed Core Module is declared as a
    // peerDependency (adapters.md §13). "Consumed" is the manifest
    // `dependencies` signal: npm runtime-requirement semantics, mirrored by
    // the §13 examples and by every adapter in the monorepo. Transitive,
    // lockfile-only, and dev dependencies are structurally excluded. The
    // implemented module is covered by ARCH-ADAPTER-PEER-001 above and is
    // skipped here to keep diagnostics singular.
    for (const dep of Object.keys(deps)) {
      if (!dep.startsWith("@comity/")) continue;
      if (dep === coreModule) continue;
      if (layers.get(dep) !== "core") continue;

      if (!peerDeps[dep]) {
        findings.push({
          tool: "schema",
          rule: "ARCH-ADAPTER-PEER-003",
          message: `Technology Adapter "${pkg.name}" consumes Core Module "${dep}" but does not declare it as a peerDependency`,
          package: pkg.name,
          severity: "error",
          source: SOURCE,
          remediation: `Add "${dep}" to peerDependencies.`,
        });
      }
    }

    // Validate that the technology-adapter does not declare peerDependencies
    // on unrelated @comity/* packages. Per §13, peers are allowed for the
    // implemented Core Module, kernel packages, and consumed Core Modules.
    // A matching `dependencies` entry is the authoritative consumption
    // signal (npm runtime-requirement semantics, mirrored by the §13
    // examples and every adapter in the monorepo), so it uniformly covers
    // workspace and external packages. A peer with no dependency
    // relationship expresses nothing real and is rejected. Adapter-to-
    // adapter edges remain the depcruise L6 rule's responsibility.
    for (const peerDep of Object.keys(peerDeps)) {
      if (!peerDep.startsWith("@comity/")) continue;

      const allowed =
        [coreModule, ...KERNEL_PACKAGES].includes(peerDep) || peerDep in deps;

      if (!allowed) {
        findings.push({
          tool: "schema",
          rule: "ARCH-ADAPTER-PEER-004",
          message: `Technology Adapter "${pkg.name}" declares peerDependency on "${peerDep}" which is not the implemented Core Module, a Kernel package, or a consumed Core Module`,
          package: pkg.name,
          severity: "error",
          source: SOURCE,
          remediation: `Remove "${peerDep}" from peerDependencies unless it is the implemented Core Module, a Kernel package, or a consumed Core Module declared in dependencies.`,
        });
      }
    }
  }

  return {
    executed: true,
    exitCode: 0,
    passed: findings.length === 0,
    findings,
    duration: Date.now() - start,
    status: findings.length === 0 ? "PASS" : "FAIL",
    tool: "adapter-peers",
  };
}
