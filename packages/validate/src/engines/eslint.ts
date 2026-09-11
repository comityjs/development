import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export function runEslint(repo: Repository, binDir: string): EngineResult {
  const start = Date.now();

  // Write the temp config to an OS temp directory so the consumer
  // repository is never mutated by the validator.
  const tmpDir = mkdtempSync("/tmp/comity-validate-eslint-");
  const configPath = `${tmpDir}/eslint.config.mjs`;

  // Resolve modules from the repository's node_modules, not from the validate
  // package's node_modules. This ensures we use the repository's installed
  // versions of the plugins and parser.
  const repoNodeModules = resolve(repo.root, "node_modules");
  const pluginPath = resolve(
    repoNodeModules,
    "@comity-dev",
    "eslint-plugin",
    "dist",
    "index.js",
  );
  const recommendedPath = resolve(
    repoNodeModules,
    "@comity-dev",
    "eslint-plugin",
    "dist",
    "recommended.js",
  );
  const tsParserPath = resolve(
    repoNodeModules,
    "@typescript-eslint",
    "parser",
    "dist",
    "index.js",
  );

  // Build target directories from discovered package roots
  // Use the repository's actual package directories
  const packageDirs = repo.packages.map((p) => resolve(repo.root, p.path));
  // Compute relative paths from repo.root for ESLint target
  const targets =
    packageDirs.length > 0
      ? packageDirs.map((dir) => relative(repo.root, dir))
      : ["packages"];

  const configBody = `import comityPlugin from ${JSON.stringify(pluginPath)};\nimport { recommended } from ${JSON.stringify(recommendedPath)};\nimport tsParser from ${JSON.stringify(tsParserPath)};\nexport default [\n  // Explicitly override ESLint's auto-detected ignores. The temp config\n  // is created at runtime, far from any .gitignore / eslintrc that the\n  // consumer repo might ship.\n  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"] },\n  {\n    files: ["**/*.{ts,tsx,js,jsx}"],\n    languageOptions: {\n      parser: tsParser,\n      parserOptions: { ecmaVersion: "latest", sourceType: "module" },\n    },\n    plugins: { "@comity-dev": comityPlugin },\n    rules: recommended.rules,\n  },\n];\n`;
  writeFileSync(configPath, configBody);

  if (process.env["DEBUG_VALIDATE"]) {
    console.error("[DEBUG] ESLint config written to:", configPath);
    console.error("[DEBUG] Targets:", targets);
  }

  const bin = resolve(binDir, "eslint");
  if (!existsSync(bin)) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "TOOL-UNAVAILABLE",
      tool: "eslint",
      reason: `eslint binary not found at ${bin}`,
    };
  }

  // Run ESLint with cwd = repo.root so its file-path resolution and
  // ignore handling are anchored at the repository being validated.
  const proc = spawnSync(
    bin,
    [
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

  const findings = parseEslintOutput(proc.stdout, proc.stderr);

  // Clean up temp config (skip in debug mode for inspection)
  if (!process.env["DEBUG_VALIDATE"]) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  } else {
    console.error("[DEBUG] Temp config preserved at:", tmpDir);
  }

  // If ESLint exited non-zero but produced no parseable output, this is
  // an EXECUTION-ERROR (config failure, missing plugin, etc.) not a
  // policy violation. Surface stderr so the operator can diagnose.
  if (proc.status !== 0 && findings.length === 0) {
    const stderrHead = (proc.stderr ?? "").split("\n")[0] ?? "";
    findings.push({
      tool: "eslint",
      rule: "ESLINT-CRASH",
      message: `eslint exited with code ${proc.status}; stderr: ${stderrHead}`,
      severity: "error",
    });
    return {
      executed: true,
      exitCode: proc.status,
      passed: false,
      findings,
      duration: Date.now() - start,
      status: "EXECUTION-ERROR",
      tool: "eslint",
    };
  }

  // Debug logging
  if (process.env["DEBUG_VALIDATE"]) {
    console.error("[DEBUG] ESLint result:", {
      status: proc.status,
      findingsCount: findings.length,
      passed:
        proc.status === 0 &&
        findings.filter((f) => f.severity === "error").length === 0,
      stdout: proc.stdout?.slice(0, 500),
      stderr: proc.stderr?.slice(0, 500),
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
    tool: "eslint",
  };
}

function parseEslintOutput(
  stdout: string | null,
  stderr: string | null,
): Finding[] {
  const out = stdout ?? stderr ?? "";
  if (!out.trim()) return [];
  let parsed: Array<{
    filePath: string;
    messages: Array<{
      ruleId?: string | null;
      message: string;
      line?: number;
      column?: number;
      severity: 1 | 2;
    }>;
  }> | null = null;
  try {
    parsed = JSON.parse(out);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const findings: Finding[] = [];

  for (const fileResult of parsed) {
    for (const msg of fileResult.messages) {
      findings.push({
        tool: "eslint",
        rule: msg.ruleId ?? "ESLINT",
        message: msg.message,
        file: fileResult.filePath,
        line: msg.line,
        column: msg.column,
        severity: msg.severity === 2 ? "error" : "warning",
      });
    }
  }
  return findings;
}
