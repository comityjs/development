import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import {
  buildDependencyRulesForRoot,
  classifyByLayer,
} from "@comity-dev/dependency-rules";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function runDepcruise(repo: Repository, binDir: string): EngineResult {
  const start = Date.now();

  const classification = classifyByLayer(
    repo.packages.map((p) => ({ name: p.name, layer: p.layer })),
  );

  const depConfig = buildDependencyRulesForRoot(classification, repo.root);

  // Write the generated config to an OS temp directory so the consumer
  // repository is never mutated by the validator. The temp directory is
  // unique per run and cleaned up after the engine returns.
  const tmpDir = mkdtempSync("/tmp/comity-validate-depcruise-");
  const configPath = `${tmpDir}/depcruise.json`;

  writeFileSync(configPath, JSON.stringify(depConfig, null, 2));

  const bin = resolve(binDir, "depcruise");

  if (!existsSync(bin)) {
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "TOOL-UNAVAILABLE",
      tool: "dependency-cruiser",
      reason: `dependency-cruiser binary not found at ${bin}`,
    };
  }

  // Build target paths from discovered package directories
  // Use the repository's actual package directories, not a hardcoded "packages"
  const packageDirs = repo.packages.map((p) => resolve(repo.root, p.path));
  const targets =
    packageDirs.length > 0 ? packageDirs : [resolve(repo.root, "packages")];

  // Run depcruise from the validate package's directory so it can resolve
  // the shared @comity-dev/dependency-rules via workspace node_modules.
  // The tsConfig.fileName path is resolved relative to this CWD; the
  // generated config uses an absolute path so this is robust.
  const engineCwd = resolve(binDir, "..", "..");
  const proc = spawnSync(
    bin,
    ["--config", configPath, "--output-type", "json", ...targets],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      cwd: engineCwd,
      env: {
        ...process.env,
        TSCONFIG_PATH: resolve(repo.root, "tsconfig.json"),
      },
    },
  );

  const findings: Finding[] = parseDepcruiseOutput(proc.stdout, proc.stderr);

  // Clean up the temp config directory.
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  // If depcruise exited non-zero but produced no parseable JSON output,
  // that is an EXECUTION-ERROR, not a policy violation. Surface stderr
  // so the operator can diagnose, but mark status accordingly.
  if (proc.status !== 0 && findings.length === 0) {
    const stderrHead = (proc.stderr ?? "").split("\n")[0] ?? "";

    findings.push({
      tool: "dependency-cruiser",
      rule: "DEP-CRASH",
      message: `dependency-cruiser exited with code ${proc.status}; stderr: ${stderrHead}`,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: proc.status,
      passed: false,
      findings,
      duration: Date.now() - start,
      status: "EXECUTION-ERROR",
      tool: "dependency-cruiser",
    };
  }

  return {
    executed: true,
    exitCode: proc.status,
    passed: proc.status === 0 && findings.length === 0,
    findings,
    duration: Date.now() - start,
    status: proc.status === 0 ? "PASS" : "FAIL",
    tool: "dependency-cruiser",
  };
}

function parseDepcruiseOutput(
  stdout: string | null,
  stderr: string | null,
): Finding[] {
  const out = stdout ?? stderr ?? "";

  if (!out.trim()) return [];

  let parsed: { violations?: Array<Record<string, unknown>> } | null = null;

  try {
    parsed = JSON.parse(out);
  } catch {
    return [];
  }

  const violations = parsed?.violations ?? [];

  return violations.map((v) => {
    const from = v["from"] as { file?: string; line?: number } | undefined;
    const rule = v["rule"] as { name?: string; comment?: string } | undefined;

    return {
      tool: "dependency-cruiser",
      rule: `DEP-${rule?.name ?? "UNKNOWN"}`,
      message: rule?.comment ?? "Dependency rule violation",
      file: from?.file,
      line: from?.line,
      severity: "error",
    };
  });
}
