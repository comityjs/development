import type { EngineResult, Finding } from "./engines/types.js";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRepository, type Repository } from "./discover.js";
import { runAdapterPeers } from "./engines/adapter-peers.js";
import { runDepcruise } from "./engines/depcruise.js";
import { runEslint } from "./engines/eslint.js";
import { runSchema } from "./engines/schema.js";
import { runSemgrep } from "./engines/semgrep.js";

export interface RunOptions {
  /** The root directory of the repository to validate */
  root: string;

  /** If specified, only run the given category of validation */
  only?: string | null;

  /** If true, print verbose output to stdout */
  verbose?: boolean;
}

export interface CategoryResult {
  /** The status of the engine for this category */
  status: EngineResult["status"];

  /** Whether the engine was executed or skipped */
  executed: boolean;

  /** The exit code of the engine process, if applicable */
  exitCode: number | null;

  /** Whether the engine passed or failed */
  passed: boolean;

  /** The number of findings produced by the engine */
  findings: number;

  /** The tool that produced this result, if applicable */
  tool?: string | undefined;

  /** The reason for the engine's status, if applicable */
  reason?: string | undefined;
}

export interface RunResult {
  /** Whether the overall validation passed or failed */
  passed: boolean;

  /** The list of all findings across all categories */
  violations: Finding[];

  /** The results of each validation category */
  categories: {
    /** Schema validation results */
    schema: CategoryResult;

    /** Package metadata validation results */
    metadata: CategoryResult;

    /** Comity config validation results */
    config: CategoryResult;

    /** Dependency validation results */
    dependencies: CategoryResult;

    /** ESLint validation results */
    eslint: CategoryResult;

    /** Semgrep validation results */
    semgrep: CategoryResult;

    /** Adapter peers validation results */
    adapterPeers: CategoryResult;
  };
}

function categoryOf(result: EngineResult): CategoryResult {
  return {
    status: result.status,
    executed: result.executed,
    exitCode: result.exitCode,
    passed: result.passed,
    findings: result.findings.length,
    tool: result.tool,
    reason: result.reason,
  };
}

function emptyCategory(reason: string): CategoryResult {
  return {
    status: "NOT-RUN",
    executed: false,
    exitCode: null,
    passed: false,
    findings: 0,
    reason,
  };
}

function findBinDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // `__dirname` is the directory of the running module. Both the source
  // `src/` and the built `dist/` are direct children of the package root,
  // so the package's own `node_modules/.bin` is always exactly one level
  // up from the running module.
  return resolve(__dirname, "..", "node_modules", ".bin");
}
/**
 * Run validation against a repository. Returns a normalized result.
 *
 * Every category reports either an executed engine with its real exit
 * code, or an explicit NOT-RUN / TOOL-UNAVAILABLE / CONFIGURATION-ERROR
 * state. PASS without execution is impossible.
 */
export async function runValidation(options: RunOptions): Promise<RunResult> {
  const only = options.only ?? null;
  const repo: Repository = await discoverRepository({ root: options.root });
  const binDir = findBinDir();

  let schemaResult: EngineResult;
  let metaResult: EngineResult;
  let configResult: EngineResult;

  if (!only || only === "metadata" || only === "config" || only === "schema") {
    schemaResult = runSchema(repo);

    const metaFindings = schemaResult.findings.filter(
      (f) => f.rule === "package-metadata",
    );
    const configFindings = schemaResult.findings.filter(
      (f) => f.rule === "comity-config",
    );

    metaResult = {
      ...schemaResult,
      findings: metaFindings,
      passed: metaFindings.length === 0,
      status: metaFindings.length === 0 ? "PASS" : "FAIL",
    };
    configResult = {
      ...schemaResult,
      findings: configFindings,
      passed: configFindings.length === 0,
      status: configFindings.length === 0 ? "PASS" : "FAIL",
    };
  } else {
    schemaResult = emptyEngineResult("schema engine skipped");
    metaResult = emptyEngineResult("schema engine skipped");
    configResult = emptyEngineResult("schema engine skipped");
  }

  let depResult: EngineResult;

  if (!only || only === "dependencies" || only === "depcruise") {
    depResult = runDepcruise(repo, binDir);
  } else {
    depResult = emptyEngineResult("dependencies engine skipped");
  }

  let eslintResult: EngineResult;

  if (!only || only === "eslint") {
    eslintResult = runEslint(repo, binDir);
  } else {
    eslintResult = emptyEngineResult("eslint engine skipped");
  }

  let semgrepResult: EngineResult;

  if (!only || only === "semgrep") {
    semgrepResult = await runSemgrep(repo);
  } else {
    semgrepResult = emptyEngineResult("semgrep engine skipped");
  }

  let adapterResult: EngineResult;

  if (!only || only === "adapter-peers") {
    adapterResult = runAdapterPeers(repo);
  } else {
    adapterResult = emptyEngineResult("adapter-peers engine skipped");
  }

  const violations: Finding[] = [];

  for (const r of [
    schemaResult,
    depResult,
    eslintResult,
    semgrepResult,
    adapterResult,
  ]) {
    if (Array.isArray(r.findings)) {
      violations.push(...r.findings);
    }
  }

  const allExecuted = [depResult, eslintResult, semgrepResult, adapterResult];
  const allPassed =
    allExecuted.every((r) => (r.executed ? r.passed : r.status !== "FAIL")) &&
    (metaResult.executed ? metaResult.passed : metaResult.status !== "FAIL") &&
    (configResult.executed
      ? configResult.passed
      : configResult.status !== "FAIL");

  return {
    passed: allPassed,
    violations,
    categories: {
      schema: categoryOf(schemaResult),
      metadata: categoryOf(metaResult),
      config: categoryOf(configResult),
      dependencies: categoryOf(depResult),
      eslint: categoryOf(eslintResult),
      semgrep: categoryOf(semgrepResult),
      adapterPeers: categoryOf(adapterResult),
    },
  };
}

function emptyEngineResult(reason: string): EngineResult {
  return {
    executed: false,
    exitCode: null,
    passed: false,
    findings: [],
    duration: 0,
    status: "NOT-RUN",
    reason,
  };
}
