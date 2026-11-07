import type { Repository } from "../discover.js";
import type { ResolvedTool } from "../tool-resolution.js";
import type { EngineResult, Finding } from "./types.js";

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { resolveModuleUrls } from "../tool-resolution.js";

const TOOL = "eslint";

/** Longest stderr kept in a finding message. */
const MAX_DIAGNOSTIC_CHARS = 4000;

/**
 * Module specifiers the generated ESLint configuration imports. They are
 * resolved from the validator's own dependency graph, so the plugin and parser
 * versions are the ones this validator declares — not whichever versions the
 * validated repository happens to install — and consumers need not install
 * them directly.
 */
const CONFIG_MODULES = {
  plugin: "@comity-dev/eslint-plugin",
  recommended: "@comity-dev/eslint-plugin/recommended",
  tsParser: "@typescript-eslint/parser",
} as const;

export type EslintConfigModules = Record<keyof typeof CONFIG_MODULES, string>;

/** Resolves the modules the ESLint config imports; injectable for tests. */
export type ConfigModuleResolver = () =>
  | { ok: true; urls: EslintConfigModules }
  | { ok: false; reason: string; cause: unknown };

const resolveConfigModules: ConfigModuleResolver = () =>
  resolveModuleUrls(CONFIG_MODULES);

/**
 * Pick the most informative single line of stderr. ESLint prints blank lines
 * and a generic banner before the actual error, so prefer the first line that
 * names an error, then the first non-empty line.
 */
export function summarizeStderr(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    lines.find((l) => /^(\w+)?Error\b|^Error\b|\bERR_[A-Z_]+\b/.test(l)) ??
    lines[0] ??
    "(no stderr output)"
  );
}

function fullDiagnostic(stderr: string): string {
  const text = stderr.trim();

  if (!text) return "(no stderr output)";

  return text.length > MAX_DIAGNOSTIC_CHARS
    ? `${text.slice(0, MAX_DIAGNOSTIC_CHARS)}… [truncated]`
    : text;
}

function failure(
  status: "TOOL-UNAVAILABLE" | "EXECUTION-ERROR",
  reason: string,
  detail: string,
  executed: boolean,
  exitCode: number | null,
  start: number,
): EngineResult {
  return {
    executed,
    exitCode,
    passed: false,
    findings:
      status === "TOOL-UNAVAILABLE"
        ? []
        : [
            {
              tool: TOOL,
              rule: "ESLINT-CRASH",
              message: detail,
              severity: "error",
            },
          ],
    duration: Date.now() - start,
    status,
    tool: TOOL,
    reason,
  };
}

export function runEslint(
  repo: Repository,
  eslint: ResolvedTool,
  resolveModules: ConfigModuleResolver = resolveConfigModules,
): EngineResult {
  const start = Date.now();

  if (!eslint.ok) {
    return failure("TOOL-UNAVAILABLE", eslint.reason, eslint.reason, false, null, start);
  }

  const modules = resolveModules();

  if (!modules.ok) {
    return failure("TOOL-UNAVAILABLE", modules.reason, modules.reason, false, null, start);
  }

  // Write the temp config to an OS temp directory so the consumer
  // repository is never mutated by the validator.
  const tmpDir = mkdtempSync(join(tmpdir(), "comity-validate-eslint-"));

  try {
    const configPath = join(tmpDir, "eslint.config.mjs");
    const { plugin, recommended, tsParser } = modules.urls;

    // Build target directories from discovered package roots
    // Use the repository's actual package directories
    const targets =
      repo.packages.length > 0
        ? repo.packages.map((p) => relative(repo.root, p.path))
        : ["packages"];

    const configBody = `import comityPlugin from ${JSON.stringify(plugin)};\nimport { recommended } from ${JSON.stringify(recommended)};\nimport tsParser from ${JSON.stringify(tsParser)};\nexport default [\n  // Explicitly override ESLint's auto-detected ignores. The temp config\n  // is created at runtime, far from any .gitignore / eslintrc that the\n  // consumer repo might ship.\n  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"] },\n  {\n    files: ["**/*.{ts,tsx,js,jsx}"],\n    languageOptions: {\n      parser: tsParser,\n      parserOptions: { ecmaVersion: "latest", sourceType: "module" },\n    },\n    plugins: { "@comity-dev": comityPlugin },\n    rules: recommended.rules,\n  },\n];\n`;

    writeFileSync(configPath, configBody);

    if (process.env["DEBUG_VALIDATE"]) {
      console.error("[DEBUG] ESLint config written to:", configPath);
      console.error("[DEBUG] Targets:", targets);
    }

    // Run the resolved ESLint script with the current Node binary and
    // cwd = repo.root so its file-path resolution and ignore handling are
    // anchored at the repository being validated.
    const proc = spawnSync(
      process.execPath,
      [
        eslint.script,
        "--config",
        configPath,
        "--format",
        "json",
        "--no-config-lookup",
        "--no-inline-config",
        ...targets,
      ],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        cwd: repo.root,
      },
    );

    const stderr = proc.stderr ?? "";

    if (proc.error) {
      return failure(
        "EXECUTION-ERROR",
        `eslint could not be run: ${proc.error.message}`,
        `eslint could not be run: ${proc.error.message}`,
        false,
        proc.status,
        start,
      );
    }

    if (proc.signal) {
      return failure(
        "EXECUTION-ERROR",
        `eslint was terminated by signal ${proc.signal}`,
        `eslint was terminated by signal ${proc.signal}; stderr: ${fullDiagnostic(stderr)}`,
        true,
        proc.status,
        start,
      );
    }

    const parsed = parseEslintOutput(proc.stdout);

    // Output that cannot be interpreted is never "no findings", whatever the
    // exit code: ESLint with `--format json` always prints a JSON array.
    if (!parsed.ok) {
      return failure(
        "EXECUTION-ERROR",
        `eslint exited with code ${proc.status} and ${parsed.reason}: ${summarizeStderr(stderr)}`,
        `eslint exited with code ${proc.status} and ${parsed.reason}; stderr: ${fullDiagnostic(stderr)}`,
        true,
        proc.status,
        start,
      );
    }

    const findings = parsed.findings;

    // A non-zero exit that is not explained by findings is a crash
    // (config failure, missing plugin, etc.), not a policy violation.
    if (proc.status !== 0 && findings.length === 0) {
      return failure(
        "EXECUTION-ERROR",
        `eslint exited with code ${proc.status}: ${summarizeStderr(stderr)}`,
        `eslint exited with code ${proc.status}; stderr: ${fullDiagnostic(stderr)}`,
        true,
        proc.status,
        start,
      );
    }

    if (process.env["DEBUG_VALIDATE"]) {
      console.error("[DEBUG] ESLint result:", {
        status: proc.status,
        findingsCount: findings.length,
        stdout: proc.stdout?.slice(0, 500),
        stderr: stderr.slice(0, 500),
      });
    }

    return {
      executed: true,
      exitCode: proc.status,
      passed:
        proc.status === 0 &&
        findings.filter((f) => f.severity === "error").length === 0,
      findings,
      duration: Date.now() - start,
      status: proc.status === 0 ? "PASS" : "FAIL",
      tool: TOOL,
    };
  } finally {
    // Skip cleanup in debug mode so the generated config can be inspected.
    if (process.env["DEBUG_VALIDATE"]) {
      console.error("[DEBUG] Temp config preserved at:", tmpDir);
    } else {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

type ParsedEslint =
  | { ok: true; findings: Finding[] }
  | { ok: false; reason: string };

/**
 * Strictly interpret ESLint's JSON formatter output: an array of file
 * results, each with a `messages` array. Anything else is a parse failure.
 */
export function parseEslintOutput(stdout: string | null): ParsedEslint {
  const out = stdout ?? "";

  if (!out.trim()) {
    return { ok: false, reason: "produced no JSON output" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(out);
  } catch {
    return { ok: false, reason: "produced output that is not valid JSON" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, reason: "produced JSON that is not an array of results" };
  }

  const findings: Finding[] = [];

  for (const fileResult of parsed as unknown[]) {
    const entry = fileResult as {
      filePath?: unknown;
      messages?: unknown;
    } | null;

    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.filePath !== "string" ||
      !Array.isArray(entry.messages)
    ) {
      return { ok: false, reason: "produced a result entry of unexpected shape" };
    }

    for (const raw of entry.messages as unknown[]) {
      const msg = raw as {
        ruleId?: string | null;
        message?: unknown;
        line?: number;
        column?: number;
        severity?: unknown;
      } | null;

      if (
        typeof msg !== "object" ||
        msg === null ||
        typeof msg.message !== "string" ||
        (msg.severity !== 1 && msg.severity !== 2)
      ) {
        return { ok: false, reason: "produced a message entry of unexpected shape" };
      }

      findings.push({
        tool: TOOL,
        rule: msg.ruleId ?? "ESLINT",
        message: msg.message,
        file: entry.filePath,
        line: msg.line,
        column: msg.column,
        severity: msg.severity === 2 ? "error" : "warning",
      });
    }
  }

  return { ok: true, findings };
}
