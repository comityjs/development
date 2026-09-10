import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

export function runEslint(repo: Repository, binDir: string): EngineResult {
  const start = Date.now();

  // Write the temp config to an OS temp directory so the consumer
  // repository is never mutated by the validator.
  const tmpDir = mkdtempSync("/tmp/comity-validate-eslint-");
  const configPath = `${tmpDir}/eslint.config.mjs`;

  // Use absolute paths to the plugin's dist output so Node can resolve
  // them from the temp config's location (anywhere in the repo).
  // The plugin is a workspace dep of this validate package; we resolve
  // its dist via the validate package's own node_modules.
  const pluginEntry = resolve(
    resolve(binDir, "..", "..", "node_modules", "@comity-dev", "eslint-plugin"),
    "dist",
    "index.js",
  );
  const recommendedEntry = resolve(
    resolve(binDir, "..", "..", "node_modules", "@comity-dev", "eslint-plugin"),
    "dist",
    "recommended.js",
  );
  // Resolve the @typescript-eslint/parser from validate's workspace
  // node_modules; ESLint 9 flat-config needs an explicit parser for TS.
  const tsParserEntry = resolve(
    resolve(binDir, "..", "..", "node_modules", "@typescript-eslint"),
    "parser",
    "dist",
    "index.js",
  );

  // Build target directories from discovered package roots
  // Use the repository's actual package directories
  const packageDirs = repo.packages.map((p) => resolve(repo.root, p.path));
  // Compute relative paths from repo.root for ESLint target
  const targets = packageDirs.length > 0
    ? packageDirs.map((dir) => relative(repo.root, dir))
    : ["packages"];

  const configBody = `import comityPlugin from ${JSON.stringify(pluginEntry)};
import { recommended } from ${JSON.stringify(recommendedEntry)};
import tsParser from ${JSON.stringify(tsParserEntry)};
export default [
  // Explicitly override ESLint's auto-detected ignores. The temp config
  // is created at runtime, far from any .gitignore / eslintrc that the
  // consumer repo might ship.
  { ignores: ["**/node_modules/**", "**/dist/**"] },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@comity-dev": comityPlugin },
    rules: recommended.rules,
  },
];
`;
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
  // The temp config uses absolute imports for the shared plugin, so
  // workspace layout is irrelevant to module resolution. We pass the
  // target directories and let ESLint auto-discover the files; the
  // config's `files` pattern filters by extension.
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
      passed: proc.status === 0 && findings.length === 0,
      stdout: proc.stdout?.slice(0, 500),
      stderr: proc.stderr?.slice(0, 500),
    });
  }

  return {
    executed: true,
    exitCode: proc.status,
    passed: proc.status === 0 && findings.length === 0,
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