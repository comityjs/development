import type { EngineResult, Finding } from "./engines/types.js";
import type { ExitCodeValue } from "./exit-codes.js";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRepository, type Repository } from "./discover.js";
import { runAdapterPeers } from "./engines/adapter-peers.js";
import { runDepcruise } from "./engines/depcruise.js";
import { runEslint } from "./engines/eslint.js";
import { runSchema } from "./engines/schema.js";
import { runSemgrep } from "./engines/semgrep.js";
import { ExitCode } from "./exit-codes.js";

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

/**
 * Whether a category is acceptable for the overall validation result.
 *
 * A skipped category is acceptable only when it is explicitly NOT-RUN or
 * NOT-APPLICABLE, or when a required tool is unavailable (which the exit-code
 * mapping reports separately). Configuration and execution errors are never
 * acceptable merely because they did not execute.
 */
function categoryIsAcceptable(result: EngineResult): boolean {
  if (result.executed) return result.passed;

  return (
    result.status === "NOT-RUN" ||
    result.status === "NOT-APPLICABLE" ||
    result.status === "TOOL-UNAVAILABLE"
  );
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
    semgrepResult = await runSemgrep(repo, { verbose: options.verbose === true });
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
    allExecuted.every(categoryIsAcceptable) &&
    categoryIsAcceptable(metaResult) &&
    categoryIsAcceptable(configResult);

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

/**
 * Map a validation result to the documented process exit code.
 *
 * A required tool that could not run must never surface as PASS: when
 * every executed engine passed but at least one category reports
 * `TOOL-UNAVAILABLE`, the result exits `TOOL_MISSING` (3) instead of
 * fabricating a passing result.
 */
export function exitCodeForResult(result: RunResult): ExitCodeValue {
  if (!result.passed) {
    const configurationError = Object.values(result.categories).some(
      (category) => category.status === "CONFIGURATION-ERROR",
    );

    return configurationError ? ExitCode.CONFIG_ERROR : ExitCode.FAIL;
  }

  const toolUnavailable = Object.values(result.categories).some(
    (c) => c.status === "TOOL-UNAVAILABLE",
  );

  return toolUnavailable ? ExitCode.TOOL_MISSING : ExitCode.PASS;
}
