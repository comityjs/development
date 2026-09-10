import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { buildSemgrepConfig } from "@comity-dev/semgrep-rules";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * Discover the Python interpreter that ships the `semgrep` module.
 * We try well-known absolute paths first, then fall back to PATH.
 */
function resolvePythonForSemgrep(): string | null {
  const candidates: string[] = [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  const probe = spawnSync("which", ["python3"], { encoding: "utf8" });

  if (probe.status === 0 && probe.stdout?.trim()) return probe.stdout.trim();

  return null;
}

function findSemgrepBin(fallbackDirs: string[]): string | null {
  const explicitBin = process.env["SEMGREP_BIN"];

  if (explicitBin && existsSync(explicitBin)) return explicitBin;

  const probe = spawnSync("which", ["semgrep"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fallbackDirs.join(":")}:${process.env["PATH"] ?? ""}`,
    },
  });

  if (probe.status === 0 && probe.stdout?.trim()) {
    return probe.stdout.trim();
  }

  const absoluteCandidates = [
    "/usr/bin/semgrep",
    "/usr/local/bin/semgrep",
    "/opt/homebrew/bin/semgrep",
  ];

  for (const c of absoluteCandidates) {
    if (existsSync(c)) return c;
  }

  return null;
}

/**
 * Returns the set of package directory names that should be excluded
 * from Semgrep scanning. The Development-owned runtime rule set
 * (`@comity-dev/semgrep-rules`) targets Comity Core Modules and
 * Adapters; it MUST NOT fire on Development tooling packages
 * (`comity.layer: "dev-tooling"`) because those packages legitimately
 * use Node APIs, `process.env`, and other patterns the rules forbid
 * for runtime Core Modules.
 */
function devToolingPackageDirs(repo: Repository): string[] {
  const dirs: string[] = [];

  for (const pkg of repo.packages) {
    if (pkg.layer === "dev-tooling") {
      const rel = relative(repo.root, pkg.path);
      const top = rel.split("/")[0];
      if (top) dirs.push(top);
    }
  }

  return [...new Set(dirs)];
}

function buildSemgrepArgs(
  configPath: string,
  target: string,
  excludedDirs: string[],
): string[] {
  const args: string[] = [
    "-c",
    "from semgrep.console_scripts.entrypoint import main; main()",
    "scan",
    "--config",
    configPath,
    "--json",
    "--quiet",
    "--error",
    target,
  ];
  // Exclude dev-tooling package directories by both path-pattern
  // (via --exclude) and directory name (via --exclude-dir) so semgrep
  // does not scan them at all. The runtime rule set is not designed
  // for development-tooling source.

  for (const d of excludedDirs) {
    args.push("--exclude", `**/packages/${d}/**`);
    args.push("--exclude-dir", d);
  }

  return args;
}

export async function runSemgrep(repo: Repository): Promise<EngineResult> {
  const start = Date.now();

  // Build the combined Semgrep config. Semgrep's CLI accepts a single
  // --config path, so we concatenate all canonical rule files into one
  // synthesized config.
  const configYaml = await buildSemgrepConfig();
  const tmpDir = mkdtempSync("/tmp/comity-validate-semgrep-");
  const configPath = `${tmpDir}/semgrep-config.yaml`;

  writeFileSync(configPath, configYaml);

  const pathDirs = (process.env["PATH"] ?? "").split(":").filter(Boolean);
  const fallbackDirs = ["/usr/local/bin", "/opt/homebrew/bin"];
  const candidateDirs = [...new Set([...pathDirs, ...fallbackDirs])];

  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  const semgrepBin = findSemgrepBin(fallbackDirs);

  if (!semgrepBin) {
    cleanup();
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "TOOL-UNAVAILABLE",
      tool: "semgrep",
      reason:
        "semgrep binary not found on PATH; install semgrep or set SEMGREP_BIN",
    };
  }

  // Locate the Python interpreter that ships the semgrep module.
  const pythonBin = resolvePythonForSemgrep();

  if (!pythonBin) {
    cleanup();
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "TOOL-UNAVAILABLE",
      tool: "semgrep",
      reason: "Python interpreter not found; semgrep requires Python on PATH",
    };
  }

  // Augment PATH so the inner Python process can find semgrep's
  // sibling `pysemgrep` script (semgrep's `subprocess.run` does an
  // `execvp("pysemgrep")` lookup against this PATH).
  const envPath = [
    ...candidateDirs,
    "/Users/filippo/Library/Python/3.14/bin",
    "/Users/filippo/Library/Python/3.13/bin",
    "/Users/filippo/Library/Python/3.12/bin",
    process.env["PATH"] ?? "",
    "/usr/bin",
    "/bin",
  ].join(":");

  const target = resolve(repo.root, "packages");
  const excludedDirs = devToolingPackageDirs(repo);

  // If every discovered package is dev-tooling, the runtime rule
  // set is not applicable to this repository. Report NOT-APPLICABLE
  // rather than running semgrep against an empty target.
  const runtimePackages = repo.packages.filter(
    (p) => p.layer !== "dev-tooling",
  );

  if (runtimePackages.length === 0) {
    cleanup();

    return {
      executed: false,
      exitCode: null,
      passed: true,
      findings: [],
      duration: Date.now() - start,
      status: "NOT-APPLICABLE",
      tool: "semgrep",
      reason:
        "Repository contains no runtime packages; the @comity-dev/semgrep-rules rule set targets Comity Core Modules and Adapters and is not applicable to development-tooling-only repositories.",
    };
  }

  const args = buildSemgrepArgs(configPath, target, excludedDirs);
  const proc = spawnSync(pythonBin, args, {
    cwd: repo.root,
    env: { ...process.env, PATH: envPath },
    maxBuffer: 16 * 1024 * 1024,
    encoding: "utf8",
  });

  cleanup();

  const stdout = (proc.stdout as string) ?? "";
  const stderr = (proc.stderr as string) ?? "";
  const findings = parseSemgrepOutput(stdout, stderr);

  // If semgrep exited non-zero but produced no parseable findings, this
  // is an EXECUTION-ERROR (configuration, rule-parse, internal crash),
  // not a policy violation.
  if (proc.status !== null && proc.status !== 0 && findings.length === 0) {
    const stderrHead = stderr.split("\n")[0] ?? "";
    const stdoutHead = stdout.slice(0, 500);

    findings.push({
      tool: "semgrep",
      rule: "SEM-CRASH",
      message: `semgrep exited with code ${proc.status}; stderr: ${stderrHead}; stdout (first 500): ${stdoutHead}`,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: proc.status,
      passed: false,
      findings,
      duration: Date.now() - start,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
    };
  }

  return {
    executed: true,
    exitCode: proc.status,
    passed: proc.status === 0 && findings.length === 0,
    findings,
    duration: Date.now() - start,
    status: proc.status === 0 ? "PASS" : "FAIL",
    tool: "semgrep",
  };
}

function parseSemgrepOutput(
  stdout: string | null,
  stderr: string | null,
): Finding[] {
  const out = stdout ?? stderr ?? "";

  if (!out.trim()) return [];

  let parsed: {
    results?: Array<Record<string, unknown>>;
    errors?: Array<{
      rule_id?: string;
      message?: string;
      level?: string;
    }>;
  } | null = null;

  try {
    parsed = JSON.parse(out);
  } catch {
    return [];
  }

  const findings: Finding[] = [];

  for (const e of parsed?.errors ?? []) {
    if (e.level === "error") {
      findings.push({
        tool: "semgrep",
        rule: `SEM-PARSE-${e.rule_id ?? "UNKNOWN"}`,
        message: e.message ?? "semgrep rule parse error",
        severity: "error",
      });
    }
  }

  const results = parsed?.results ?? [];

  for (const r of results) {
    const start = r["start"] as { line?: number; col?: number } | undefined;
    const extra = r["extra"] as
      | { severity?: string; message?: string }
      | undefined;

    findings.push({
      tool: "semgrep",
      rule: `SEM-${String(r["check_id"] ?? "UNKNOWN")}`,
      message: extra?.message ?? "Semgrep rule violation",
      file: typeof r["path"] === "string" ? r["path"] : undefined,
      line: start?.line,
      column: start?.col,
      severity: extra?.severity === "ERROR" ? "error" : "warning",
    });
  }

  return findings;
}
