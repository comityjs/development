import type { Repository } from "../discover.js";
import type { ResolvedTool } from "../tool-resolution.js";
import type { EngineResult, Finding } from "./types.js";

import {
  buildDependencyRulesForRoot,
  classifyByLayer,
} from "@comity-dev/dependency-rules";
import { spawnSync } from "node:child_process";
import {
  classifyInstalledComityPackages,
  comityPackageOf,
} from "../installed-packages.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const TOOL = "dependency-cruiser";

type DepcruiseSeverity = "error" | "warn" | "info" | "ignore";

const SEVERITIES: readonly DepcruiseSeverity[] = [
  "error",
  "warn",
  "info",
  "ignore",
];

export interface DepcruiseViolation {
  /** Source module path (dependency-cruiser's `from`). */
  from: string;

  /** Target module path (dependency-cruiser's `to`). */
  to: string;

  /** Rule identifier. */
  rule: string;

  /** Rule severity as reported by dependency-cruiser. */
  severity: DepcruiseSeverity;
}

export interface DepcruiseSummary {
  violations: DepcruiseViolation[];
  counts: Record<DepcruiseSeverity, number>;
  totalCruised: number;
  /** Source paths of every cruised module. */
  sources: string[];
  /** Number of forbidden rules dependency-cruiser reports having applied. */
  forbiddenRuleCount: number;
}

export type DepcruiseParseResult =
  | { ok: true; summary: DepcruiseSummary }
  | { ok: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Parses and validates the output of `depcruise --output-type json`.
 *
 * The dependency-cruiser result has the root shape
 * `{ modules: IModule[], summary: ISummary }` (stable from v9 to v17).
 * Violations are reported in `summary.violations`; every entry carries
 * `from` and `to` as module path strings and `rule: { name, severity }`.
 * Per-severity totals are in `summary.error | warn | info | ignore`.
 *
 * Anything that does not match this contract is rejected: a result that
 * cannot be fully validated must never be read as "no violations".
 */
export function parseDepcruiseResult(
  stdout: string | null | undefined,
): DepcruiseParseResult {
  if (typeof stdout !== "string" || stdout.trim() === "") {
    return { ok: false, reason: "dependency-cruiser produced no output" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    return {
      ok: false,
      reason: `dependency-cruiser output is not valid JSON (${(error as Error).message})`,
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: "result root is not an object" };
  }

  const { modules, summary } = parsed;

  if (!Array.isArray(modules)) {
    return { ok: false, reason: "result.modules is not an array" };
  }

  const sources: string[] = [];

  for (const [i, m] of modules.entries()) {
    if (!isRecord(m) || typeof m["source"] !== "string") {
      return {
        ok: false,
        reason: `result.modules[${i}] has no string "source"`,
      };
    }

    sources.push(m["source"]);
  }

  if (!isRecord(summary)) {
    return { ok: false, reason: "result.summary is not an object" };
  }

  const rawViolations = summary["violations"];

  if (!Array.isArray(rawViolations)) {
    return { ok: false, reason: "result.summary.violations is not an array" };
  }

  const counts = { error: 0, warn: 0, info: 0, ignore: 0 };

  for (const key of SEVERITIES) {
    const value = summary[key];

    if (!isCount(value)) {
      return {
        ok: false,
        reason: `result.summary.${key} is not a non-negative integer`,
      };
    }

    counts[key] = value;
  }

  if (!isCount(summary["totalCruised"])) {
    return {
      ok: false,
      reason: "result.summary.totalCruised is not a non-negative integer",
    };
  }

  const violations: DepcruiseViolation[] = [];
  const tally = { error: 0, warn: 0, info: 0, ignore: 0 };

  for (const [i, v] of rawViolations.entries()) {
    const where = `result.summary.violations[${i}]`;

    if (!isRecord(v)) {
      return { ok: false, reason: `${where} is not an object` };
    }

    const { from, to, rule } = v;

    if (typeof from !== "string" || from === "") {
      return { ok: false, reason: `${where}.from is not a path string` };
    }

    if (typeof to !== "string" || to === "") {
      return { ok: false, reason: `${where}.to is not a path string` };
    }

    if (
      !isRecord(rule) ||
      typeof rule["name"] !== "string" ||
      rule["name"] === ""
    ) {
      return { ok: false, reason: `${where}.rule.name is not a string` };
    }

    const severity = rule["severity"];

    if (
      typeof severity !== "string" ||
      !SEVERITIES.includes(severity as DepcruiseSeverity)
    ) {
      return {
        ok: false,
        reason: `${where}.rule.severity is not one of ${SEVERITIES.join("|")}`,
      };
    }

    tally[severity as DepcruiseSeverity] += 1;
    violations.push({
      from,
      to,
      rule: rule["name"],
      severity: severity as DepcruiseSeverity,
    });
  }

  for (const key of SEVERITIES) {
    if (tally[key] !== counts[key]) {
      return {
        ok: false,
        reason: `result.summary.${key} (${counts[key]}) disagrees with the ${tally[key]} "${key}" violation entries`,
      };
    }
  }

  const ruleSet = summary["ruleSetUsed"];
  const forbidden = isRecord(ruleSet) ? ruleSet["forbidden"] : null;

  if (!Array.isArray(forbidden)) {
    return {
      ok: false,
      reason:
        "result.summary.ruleSetUsed.forbidden is missing; cannot establish which rules were applied",
    };
  }

  return {
    ok: true,
    summary: {
      violations,
      counts,
      totalCruised: summary["totalCruised"],
      sources,
      forbiddenRuleCount: forbidden.length,
    },
  };
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function runDepcruise(
  repo: Repository,
  depcruise: ResolvedTool,
): EngineResult {
  const start = Date.now();
  const elapsed = (): number => Date.now() - start;

  const fail = (
    status: "EXECUTION-ERROR" | "CONFIGURATION-ERROR",
    reason: string,
    exitCode: number | null,
    executed: boolean,
  ): EngineResult => ({
    executed,
    exitCode,
    passed: false,
    findings: [
      {
        tool: TOOL,
        rule: status === "EXECUTION-ERROR" ? "DEP-CRASH" : "DEP-CONFIG",
        message: reason,
        severity: "error",
      },
    ],
    duration: elapsed(),
    status,
    tool: TOOL,
    reason,
  });

  if (!depcruise.ok) {
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: elapsed(),
      status: "TOOL-UNAVAILABLE",
      tool: TOOL,
      reason: depcruise.reason,
    };
  }

  // Workspace packages are classified from this repository; installed Comity
  // packages from the manifest that is actually installed. Installed packages
  // that cannot be classified are left out, so their imports fail closed.
  const installed = classifyInstalledComityPackages(repo);
  const classification = classifyByLayer(
    repo.packages.map((p) => ({ name: p.name, layer: p.layer })),
  );

  for (const [name, layer] of installed.layers) {
    if (!classification.has(name)) classification.set(name, layer);
  }

  // Rules are matched against module paths, so hand the generator every
  // package's directory, relative to the repository root.
  const packagePaths = Object.fromEntries(
    repo.packages.map((p) => [p.name, toPosix(relative(repo.root, p.path))]),
  );

  let depConfig;

  try {
    depConfig = buildDependencyRulesForRoot(classification, repo.root, {
      packagePaths,
      installedPackages: [...installed.layers.keys()],
    });
  } catch (error) {
    return fail(
      "CONFIGURATION-ERROR",
      `cannot generate architecture rules: ${(error as Error).message}`,
      null,
      false,
    );
  }

  if (depConfig.forbidden.length === 0) {
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: elapsed(),
      status: "NOT-APPLICABLE",
      tool: TOOL,
      reason:
        "no package declares a comity layer, so no architecture rules apply",
    };
  }

  // Write the generated config to an OS temp directory so the consumer
  // repository is never mutated by the validator. The temp directory is
  // unique per run and always cleaned up.
  const tmpDir = mkdtempSync(join(tmpdir(), "comity-validate-depcruise-"));

  try {
    const configPath = join(tmpDir, "depcruise.json");

    writeFileSync(configPath, JSON.stringify(depConfig, null, 2));

    // Target every package directory (repository-relative). Run from the
    // repository root so module paths are repository-relative, which is the
    // form the generated rules match.
    const targets = repo.packages.map((p) =>
      toPosix(relative(repo.root, p.path)),
    );

    // Run the resolved script with the current Node binary.
    const proc = spawnSync(
      process.execPath,
      [
        depcruise.script,
        "--config",
        configPath,
        "--output-type",
        "json",
        ...targets,
      ],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        cwd: repo.root,
      },
    );

    const stderrHead = (proc.stderr ?? "").split("\n").find((l) => l.trim());
    const detail = stderrHead ? `; stderr: ${stderrHead.trim()}` : "";

    if (proc.error) {
      return fail(
        "EXECUTION-ERROR",
        `dependency-cruiser could not be run: ${proc.error.message}`,
        proc.status,
        false,
      );
    }

    if (proc.signal) {
      return fail(
        "EXECUTION-ERROR",
        `dependency-cruiser was terminated by signal ${proc.signal}${detail}`,
        proc.status,
        true,
      );
    }

    const parsed = parseDepcruiseResult(proc.stdout);

    if (!parsed.ok) {
      return fail(
        "EXECUTION-ERROR",
        proc.status === 0
          ? `invalid dependency-cruiser result: ${parsed.reason}${detail}`
          : `dependency-cruiser exited with code ${proc.status}: ${parsed.reason}${detail}`,
        proc.status,
        true,
      );
    }

    const { summary } = parsed;

    // The reporter's own exit code is not a verdict (the JSON reporter always
    // exits 0). If it nevertheless failed, the result must still be explained
    // by error violations; otherwise something went wrong.
    if (proc.status !== 0 && summary.counts.error === 0) {
      return fail(
        "EXECUTION-ERROR",
        `dependency-cruiser exited with code ${proc.status} but reported no error violations${detail}`,
        proc.status,
        true,
      );
    }

    // Prove the generated architecture rules were actually evaluated.
    if (summary.forbiddenRuleCount !== depConfig.forbidden.length) {
      return fail(
        "EXECUTION-ERROR",
        `dependency-cruiser applied ${summary.forbiddenRuleCount} forbidden rules, expected ${depConfig.forbidden.length}`,
        proc.status,
        true,
      );
    }

    const governed = depConfig.forbidden.map((r) => ({
      from: new RegExp(r.from.path),
      pathNot: r.from.pathNot ? new RegExp(r.from.pathNot) : null,
    }));

    const anyGoverned = summary.sources.some((s) =>
      governed.some((g) => g.from.test(s) && !g.pathNot?.test(s)),
    );

    if (!anyGoverned) {
      return fail(
        "EXECUTION-ERROR",
        `dependency-cruiser cruised ${summary.totalCruised} modules but none is governed by a generated architecture rule; the rules cannot have been evaluated (check package directories and that layered packages contain source files)`,
        proc.status,
        true,
      );
    }

    const comments = new Map(
      depConfig.forbidden.map((r) => [r.name, r.comment]),
    );
    const findings: Finding[] = [];

    const workspaceNames = new Set(repo.packages.map((p) => p.name));

    // Why the target Comity package has no layer, when that is the reason a
    // layer rule could not accept it. Empty for a classified package.
    const classificationNote = (target: string): string => {
      const name = comityPackageOf(target);

      if (name === null || classification.has(name)) return "";

      const reason =
        installed.problems.get(name) ??
        (workspaceNames.has(name)
          ? "the workspace package declares no valid `comity.layer`"
          : "it is not declared as a dependency of any workspace package, so no installed manifest was read");

      return ` [${name} is not classified: ${reason}]`;
    };

    for (const v of summary.violations) {
      if (v.severity === "ignore") continue;

      findings.push({
        tool: TOOL,
        rule: `DEP-${v.rule}`,
        message: `${v.from} → ${v.to}: ${comments.get(v.rule) ?? "Dependency rule violation"}${classificationNote(v.to)}${v.severity === "info" ? " (info)" : ""}`,
        file: v.from,
        severity: v.severity === "error" ? "error" : "warning",
      });
    }

    // Only error-severity violations fail validation; warnings and notices
    // are reported but do not (same policy as the ESLint engine).
    const errors = findings.filter((f) => f.severity === "error").length;

    return {
      executed: true,
      exitCode: proc.status,
      passed: errors === 0,
      findings,
      duration: elapsed(),
      status: errors === 0 ? "PASS" : "FAIL",
      tool: TOOL,
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
