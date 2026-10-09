import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

const KERNEL_PACKAGES: ReadonlySet<string> = new Set([
  "@comity/primitives",
  "@comity/kernel",
  "@comity/composition",
]);

const SOURCE =
  "adapters.md §13 / architecture-validation.md §7.4 (docs/standards/)";

export function runAdapterPeers(repo: Repository): EngineResult {
  const start = Date.now();
  const findings: Finding[] = [];

  // Authoritative layer lookup per ADR-026: each package's own manifest
  // declares its layer. Used to distinguish consumed Core Modules (which
  // §13 requires as peers) from kernel and other layers.
  const layers = new Map(repo.packages.map((p) => [p.name, p.layer]));

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
