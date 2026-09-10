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

    // Validate that the technology-adapter does not declare peerDependencies on disallowed @comity/* packages
    for (const peerDep of Object.keys(peerDeps)) {
      if (!peerDep.startsWith("@comity/")) continue;

      const allowed = [coreModule, ...KERNEL_PACKAGES].includes(peerDep);

      if (!allowed) {
        findings.push({
          tool: "schema",
          rule: "ARCH-ADAPTER-PEER-004",
          message: `Technology Adapter "${pkg.name}" declares peerDependency on "${peerDep}" which is not the implemented Core Module or a Kernel package`,
          package: pkg.name,
          severity: "error",
          source: SOURCE,
          remediation: `Remove "${peerDep}" from peerDependencies unless it is the implemented Core Module, a Kernel package, or a required technology dependency.`,
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
