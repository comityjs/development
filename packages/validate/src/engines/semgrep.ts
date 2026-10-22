import type { ChildProcess } from "node:child_process";
import type { Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { buildSemgrepConfig } from "@comity-dev/semgrep-rules";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

/** Default overall Semgrep scan timeout: five minutes. */
export const DEFAULT_SEMGREP_TIMEOUT_MS = 300_000;

/** Maximum single Node.js timer value, in milliseconds (2^31 - 1). */
export const MAX_SEMGREP_TIMEOUT_MS = 2_147_483_647;

/** Time allowed for a timed-out process group to exit before SIGKILL. */
const SEMGREP_TERMINATION_GRACE_MS = 2_000;

/** Frequency of optional verbose heartbeats. */
const SEMGREP_HEARTBEAT_MS = 10_000;

/** Preserve the previous spawnSync maxBuffer ceiling for the async scanner. */
const MAX_SEMGREP_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface SemgrepOptions {
  /** Overall scan timeout in milliseconds; overrides COMITY_SEMGREP_TIMEOUT_MS. */
  readonly timeoutMs?: number;

  /** Emit a heartbeat on stderr while the scan is running. */
  readonly verbose?: boolean;
}

export interface SemgrepTimeoutResolution {
  /** Validated timeout in milliseconds. */
  readonly timeoutMs: number;

  /** Configuration error, if the configured timeout is invalid. */
  readonly error?: string;
}

interface SemgrepProcessOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly spawnError: Error | null;
  readonly outputLimitExceeded: boolean;
}

/**
 * A file Semgrep could not fully parse. AST-based rules may have skipped it,
 * so a scan that reports one cannot be treated as a clean pass.
 */
interface PartialParsingDiagnostic {
  readonly path: string;
  readonly message: string;
}

interface ParsedSemgrepOutput {
  readonly findings: Finding[];
  readonly malformed: boolean;
  readonly partialParsing: readonly PartialParsingDiagnostic[];
}

/**
 * Resolve the overall Semgrep timeout from an explicit override or the
 * `COMITY_SEMGREP_TIMEOUT_MS` environment variable.
 *
 * @param env - Environment to read
 * @param override - Test/embedding override; when supplied, it wins
 *
 * @returns A supported timeout in milliseconds, or a configuration error
 *
 * @remarks
 * The timeout is deliberately bounded. A value of zero would disable the
 * liveness guarantee, and values above Node's 32-bit timer limit would be
 * clamped to 1 ms, so both are rejected. Invalid values are reported as
 * configuration errors and never fall back silently.
 */
export function resolveSemgrepTimeout(
  env: NodeJS.ProcessEnv = process.env,
  override?: number,
): SemgrepTimeoutResolution {
  if (override !== undefined) {
    if (
      !Number.isSafeInteger(override) ||
      override <= 0 ||
      override > MAX_SEMGREP_TIMEOUT_MS
    ) {
      return {
        timeoutMs: DEFAULT_SEMGREP_TIMEOUT_MS,
        error: `timeoutMs must be an integer between 1 and ${MAX_SEMGREP_TIMEOUT_MS}; received ${String(override)}`,
      };
    }

    return { timeoutMs: override };
  }

  const raw = env["COMITY_SEMGREP_TIMEOUT_MS"];

  if (raw === undefined) {
    return { timeoutMs: DEFAULT_SEMGREP_TIMEOUT_MS };
  }

  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return {
      timeoutMs: DEFAULT_SEMGREP_TIMEOUT_MS,
      error: `COMITY_SEMGREP_TIMEOUT_MS must be an integer between 1 and ${MAX_SEMGREP_TIMEOUT_MS}; received "${raw}"`,
    };
  }

  const parsed = Number(trimmed);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_SEMGREP_TIMEOUT_MS
  ) {
    return {
      timeoutMs: DEFAULT_SEMGREP_TIMEOUT_MS,
      error: `COMITY_SEMGREP_TIMEOUT_MS must be an integer between 1 and ${MAX_SEMGREP_TIMEOUT_MS}; received "${raw}"`,
    };
  }

  return { timeoutMs: parsed };
}

/**
 * Terminate a Semgrep child process and, on POSIX, its process group.
 *
 * @param child - Child process started by the scanner
 * @param signal - Signal to send
 *
 * @remarks
 * The scanner is started with `detached: true` on POSIX so its Python and
 * semgrep-core descendants share a process group. Killing the group prevents
 * orphaned semgrep-core processes after a timeout. Windows has no equivalent
 * process-group primitive in Node; there only the immediate child is signalled.
 */
function terminateSemgrepProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (child.pid === undefined) return;

  if (process.platform === "win32") {
    try {
      child.kill(signal);
    } catch {
      // The child may already have exited.
    }

    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process group may already have exited.
    }
  }
}

/**
 * Run the Semgrep subprocess with an overall timeout and bounded output.
 *
 * @param command - Interpreter to execute
 * @param args - Interpreter arguments
 * @param options - Working directory, environment, timeout, and verbosity
 *
 * @returns Captured output and termination details
 *
 * @remarks
 * A timeout sends SIGTERM to the process group, then SIGKILL after a short
 * grace period. The promise always settles; a close event normally does so
 * sooner, while the grace timer is a hard ceiling. On Windows only the direct
 * child can be signalled, so descendant termination is best-effort there.
 */
function runSemgrepProcess(
  command: string,
  args: string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly timeoutMs: number;
    readonly verbose: boolean;
  },
): Promise<SemgrepProcessOutcome> {
  return new Promise((resolvePromise) => {
    let child: ChildProcess;

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolvePromise({
        stdout: "",
        stderr: "",
        status: null,
        signal: null,
        timedOut: false,
        spawnError: error instanceof Error ? error : new Error(String(error)),
        outputLimitExceeded: false,
      });

      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: Error | null = null;
    let outputLimitExceeded = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;
    const started = Date.now();

    const clearTimers = (): void => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    };

    const finish = (
      status: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (settled) return;

      settled = true;
      clearTimers();
      resolvePromise({
        stdout,
        stderr,
        status,
        signal,
        timedOut,
        spawnError,
        outputLimitExceeded,
      });
    };

    const terminate = (): void => {
      terminateSemgrepProcess(child, "SIGTERM");

      // A process that ignores SIGTERM must not hold validation open. The
      // hard timer also guarantees the promise settles if no close event
      // arrives; killing the process group is the primary termination path.
      forceTimer = setTimeout(() => {
        terminateSemgrepProcess(child, "SIGKILL");
        finish(null, "SIGKILL");
      }, SEMGREP_TERMINATION_GRACE_MS);
    };

    const appendOutput = (target: "stdout" | "stderr", chunk: Buffer | string): void => {
      const text = chunk.toString();

      if (target === "stdout") stdout += text;
      else stderr += text;

      if (
        !outputLimitExceeded &&
        Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8") >
          MAX_SEMGREP_OUTPUT_BYTES
      ) {
        outputLimitExceeded = true;
        terminate();
      }
    };

    child.stdout?.on("data", (chunk: Buffer | string) =>
      appendOutput("stdout", chunk),
    );
    child.stderr?.on("data", (chunk: Buffer | string) =>
      appendOutput("stderr", chunk),
    );

    child.on("error", (error) => {
      spawnError = error;
      finish(null, null);
    });

    child.on("close", (status, signal) => {
      finish(status, signal);
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);

    if (options.verbose) {
      heartbeatTimer = setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - started) / 1000);

        try {
          process.stderr.write(
            `comity-validate: semgrep scan still running after ${elapsedSeconds}s (timeout ${Math.round(
              options.timeoutMs / 1000,
            )}s)\n`,
          );
        } catch {
          // Diagnostics must never change the validation result.
        }
      }, SEMGREP_HEARTBEAT_MS);
    }
  });
}

/**
 * Derive the Python interpreter from a semgrep executable's shebang
 * line. Shim installs (Homebrew, pipx, venv) point `#!` at the
 * interpreter that ships the `semgrep` module; resolving it keeps the
 * scan on a working interpreter instead of an unrelated system python
 * that merely exists on PATH.
 *
 * @param binPath - Path to the semgrep executable.
 * @param env - Environment to read for `/usr/bin/env` resolution.
 *
 * @returns The interpreter path when the file starts with a usable
 * `#!` line naming an existing executable, otherwise `null`.
 */
export function resolveInterpreterFromBin(
  binPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  let head: string;

  try {
    const fd = openSync(binPath, "r");
    try {
      const buf = Buffer.alloc(2048);
      const read = readSync(fd, buf, 0, buf.length, 0);
      head = buf.subarray(0, read).toString("utf8").split("\n")[0] ?? "";
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }

  if (!head.startsWith("#!")) return null;

  const parts = head.slice(2).trim().split(/\s+/).filter(Boolean);
  const [first, second] = parts;

  if (!first) return null;

  // `#!/usr/bin/env python3 ...` form: resolve the named interpreter
  // against PATH the same way a shell would.
  if (first === "env" || first.endsWith("/env")) {
    if (!second) return null;
    const probe = spawnSync("which", [second], {
      encoding: "utf8",
      env: { ...env, PATH: env["PATH"] ?? "" },
    });

    if (probe.status === 0 && probe.stdout?.trim()) {
      return probe.stdout.trim();
    }

    return null;
  }

  return existsSync(first) ? first : null;
}

/**
 * Probe whether an interpreter ships the `semgrep` module, so a
 * resolved python is never assumed to work by mere existence.
 */
function interpreterShipsSemgrep(interpreter: string): boolean {
  try {
    const probe = spawnSync(interpreter, ["-c", "import semgrep"], {
      encoding: "utf8",
      timeout: 30000,
    });

    return probe.status === 0;
  } catch {
    return false;
  }
}

/**
 * Discover the Python interpreter that ships the `semgrep` module.
 *
 * Selection order:
 * 1. `SEMGREP_PYTHON` when set to an existing path — explicit operator
 *    configuration always wins and is never silently overridden.
 * 2. The interpreter named by the semgrep executable's shebang line
 *    (shim installs point at the interpreter that ships the module).
 * 3. Well-known absolute paths, then `python3` on PATH (historic default).
 *
 * Every auto-discovered candidate (steps 2-3) must both exist and
 * successfully `import semgrep`; the first candidate that does wins.
 * An explicit `SEMGREP_PYTHON` is honored as-is for backwards
 * compatibility.
 *
 * @param env - Environment to read. Defaults to the process environment.
 * @param binPath - Resolved semgrep executable used for step 2.
 *
 * @returns The selected interpreter path, or `null` when none is available.
 * A set-but-missing `SEMGREP_PYTHON` also yields `null` so the caller can
 * report it as invalid configuration rather than falling back silently.
 */
export function resolvePythonForSemgrep(
  env: NodeJS.ProcessEnv = process.env,
  binPath?: string,
): string | null {
  const explicit = env["SEMGREP_PYTHON"];

  if (explicit) {
    return existsSync(explicit) ? explicit : null;
  }

  const candidates: string[] = [];

  if (binPath) {
    const fromBin = resolveInterpreterFromBin(binPath, env);

    if (fromBin) candidates.push(fromBin);
  }

  candidates.push(
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  );

  for (const c of candidates) {
    if (existsSync(c) && interpreterShipsSemgrep(c)) return c;
  }

  const probe = spawnSync("which", ["python3"], {
    encoding: "utf8",
    env: { ...env, PATH: env["PATH"] ?? "" },
  });

  if (probe.status === 0 && probe.stdout?.trim()) {
    const viaPath = probe.stdout.trim();

    if (interpreterShipsSemgrep(viaPath)) return viaPath;
  }

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

export async function runSemgrep(
  repo: Repository,
  options: SemgrepOptions = {},
): Promise<EngineResult> {
  const start = Date.now();
  const timeout = resolveSemgrepTimeout(process.env, options.timeoutMs);

  if (timeout.error !== undefined) {
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "CONFIGURATION-ERROR",
      tool: "semgrep",
      reason: `${timeout.error}; the Semgrep scan was not started`,
    };
  }

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

  // Locate the Python interpreter that ships the semgrep module,
  // preferring the interpreter named by the semgrep executable's own
  // shebang line. An explicit SEMGREP_PYTHON is honored as-is; a
  // set-but-missing value is invalid configuration, never a reason to
  // silently fall back.
  const pythonBin = resolvePythonForSemgrep(
    process.env,
    semgrepBin ?? undefined,
  );

  if (!pythonBin) {
    cleanup();

    const explicitPython = process.env["SEMGREP_PYTHON"];

    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "TOOL-UNAVAILABLE",
      tool: "semgrep",
      reason: explicitPython
        ? `SEMGREP_PYTHON is set to "${explicitPython}" but that path does not exist; set SEMGREP_PYTHON to a Python interpreter that ships the semgrep module`
        : `No Python interpreter shipping the semgrep module was found (semgrep binary: "${semgrepBin}"); install semgrep so its executable resolves to a working interpreter, or set SEMGREP_PYTHON to a Python interpreter that ships the semgrep module`,
    };
  }

  // Augment PATH so the inner Python process can find semgrep's
  // sibling `pysemgrep` script (semgrep's `subprocess.run` does an
  // `execvp("pysemgrep")` lookup against this PATH). Directories of the
  // explicitly configured SEMGREP_BIN and resolved interpreter come first
  // so a locally installed Semgrep resolves its own sibling scripts
  // instead of whatever happens to be on PATH.
  const configuredDirs = [semgrepBin, pythonBin]
    .map((p) => p.slice(0, Math.max(0, p.lastIndexOf("/"))))
    .filter((d) => d.length > 0);
  const envPath = [
    ...new Set(configuredDirs),
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
  const outcome = await runSemgrepProcess(pythonBin, args, {
    cwd: repo.root,
    env: { ...process.env, PATH: envPath },
    timeoutMs: timeout.timeoutMs,
    verbose: options.verbose === true,
  });

  cleanup();

  const { stdout, stderr } = outcome;
  const parsed = parseSemgrepOutput(stdout, stderr);
  const findings = [...parsed.findings];
  const duration = Date.now() - start;

  if (outcome.spawnError !== null) {
    const message = `semgrep could not be started: ${outcome.spawnError.message}; this is a tool execution failure, not a rule match`;

    findings.push({
      tool: "semgrep",
      rule: "SEM-SPAWN",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: null,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  if (outcome.timedOut) {
    const message = `semgrep exceeded the ${timeout.timeoutMs} ms timeout after ${duration} ms during structural-pattern validation; the process group was terminated. This is a tool execution failure, not a rule match.`;

    findings.push({
      tool: "semgrep",
      rule: "SEM-TIMEOUT",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: null,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  if (outcome.outputLimitExceeded) {
    const message = `semgrep output exceeded ${MAX_SEMGREP_OUTPUT_BYTES} bytes; the process group was terminated. This is a tool execution failure, not a rule match.`;

    findings.push({
      tool: "semgrep",
      rule: "SEM-OUTPUT",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: null,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  if (outcome.signal !== null) {
    const message = `semgrep was terminated by ${outcome.signal}; this is a tool execution failure, not a rule match.`;

    findings.push({
      tool: "semgrep",
      rule: "SEM-SIGNAL",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: null,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  // Incomplete analysis takes precedence over the policy verdict. Semgrep
  // reports a partially parsed file as a `level: "warn"` error and still
  // exits 0, so the exit code alone would report a clean pass even though
  // AST-based rules may never have analysed that file. This check runs before
  // the crash/exit-code checks so the affected file is always surfaced.
  if (parsed.partialParsing.length > 0) {
    const first = parsed.partialParsing[0];

    for (const diagnostic of parsed.partialParsing) {
      findings.push({
        tool: "semgrep",
        rule: "SEM-PARTIAL-PARSE",
        message: `semgrep could not fully parse ${diagnostic.path}: ${diagnostic.message}. AST-based rules may not have analysed this file, so the result is incomplete.`,
        file: diagnostic.path,
        severity: "error",
      });
    }

    const exitNote =
      outcome.status !== null && outcome.status !== 0
        ? `; semgrep exited with code ${outcome.status}`
        : "";
    const message = `semgrep could not fully parse ${parsed.partialParsing.length} file(s) (first: ${first?.path ?? "<unknown file>"}); the scan is incomplete, so this category cannot report PASS${exitNote}. This is an incomplete-analysis failure, not a rule match.`;

    return {
      executed: true,
      exitCode: outcome.status,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  // If semgrep exited non-zero but produced no parseable findings, this
  // is an EXECUTION-ERROR (configuration, rule-parse, internal crash),
  // not a policy violation.
  if (outcome.status !== null && outcome.status !== 0 && findings.length === 0) {
    const stderrHead = stderr.split("\n")[0] ?? "";
    const stdoutHead = stdout.slice(0, 500);

    findings.push({
      tool: "semgrep",
      rule: "SEM-CRASH",
      message: `semgrep exited with code ${outcome.status}; stderr: ${stderrHead}; stdout (first 500): ${stdoutHead}`,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: outcome.status,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: `semgrep exited with code ${outcome.status} before producing findings (stderr: ${stderrHead}); this is a tool execution failure, not a rule match — see the SEM-CRASH finding`,
    };
  }

  if (outcome.status === null) {
    const message =
      "semgrep terminated without an exit code; this is a tool execution failure, not a rule match.";

    findings.push({
      tool: "semgrep",
      rule: "SEM-CRASH",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: null,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  if (parsed.malformed) {
    const stdoutHead = stdout.slice(0, 500);
    const message = `semgrep produced malformed JSON output (first 500 chars: ${stdoutHead}); this is a tool execution failure, not a rule match.`;

    findings.push({
      tool: "semgrep",
      rule: "SEM-MALFORMED",
      message,
      severity: "error",
    });

    return {
      executed: true,
      exitCode: outcome.status,
      passed: false,
      findings,
      duration,
      status: "EXECUTION-ERROR",
      tool: "semgrep",
      reason: message,
    };
  }

  return {
    executed: true,
    exitCode: outcome.status,
    passed: outcome.status === 0 && findings.length === 0,
    findings,
    duration,
    status:
      outcome.status === 0 && findings.length === 0 ? "PASS" : "FAIL",
    tool: "semgrep",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the result fields consumed by this validator. */
function isSemgrepResult(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  const start = value["start"];

  return (
    typeof value["check_id"] === "string" &&
    typeof value["path"] === "string" &&
    isRecord(start) &&
    typeof start["line"] === "number" &&
    typeof start["col"] === "number"
  );
}

/** Validate the error fields consumed by this validator. */
function isSemgrepError(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  if (typeof value["level"] !== "string") return false;
  if ("rule_id" in value && typeof value["rule_id"] !== "string") return false;
  if ("message" in value && typeof value["message"] !== "string") return false;
  // Semgrep encodes `type` as a tag name or a `[tagName, ...]` tuple; this
  // validator now reads it to detect partial parsing, so anything else is
  // treated as malformed rather than silently ignored.
  if ("type" in value && !isSemgrepErrorType(value["type"])) return false;

  return true;
}

/** Whether a Semgrep error `type` field has a supported shape. */
function isSemgrepErrorType(value: unknown): boolean {
  if (typeof value === "string") return true;

  return Array.isArray(value) && typeof value[0] === "string";
}

/** The tag name of a Semgrep error `type` field, when it is well formed. */
function semgrepErrorTypeName(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (Array.isArray(value) && typeof value[0] === "string") return value[0];

  return null;
}

/**
 * Whether an error entry reports a file Semgrep could not fully parse.
 *
 * @remarks
 * Semgrep 1.180.0 reports partial parsing at `level: "warn"` with the
 * `PartialParsing` tag name while still exiting `0`, so the exit code alone
 * cannot detect it. The tag name is the primary signal; a warning that names
 * a syntax error is treated the same way so Semgrep versions that omit the
 * tag name cannot silently skip a file. Warnings that do not indicate
 * incomplete analysis keep their existing (non-fatal) treatment.
 */
function isIncompleteAnalysisError(entry: Record<string, unknown>): boolean {
  const type = semgrepErrorTypeName(entry["type"]);

  if (type !== null && /partialparsing/i.test(type)) return true;

  const message = entry["message"];

  return typeof message === "string" && /\bsyntax error\b/i.test(message);
}

/** The file an error entry refers to, when Semgrep reports one. */
function errorEntryPath(entry: Record<string, unknown>): string {
  const direct = entry["path"];

  if (typeof direct === "string" && direct.length > 0) return direct;

  const spans = entry["spans"];

  if (Array.isArray(spans)) {
    for (const span of spans) {
      if (isRecord(span) && typeof span["file"] === "string") {
        return span["file"];
      }
    }
  }

  const locations = Array.isArray(entry["type"]) ? entry["type"][1] : undefined;

  if (Array.isArray(locations)) {
    for (const location of locations) {
      if (isRecord(location) && typeof location["path"] === "string") {
        return location["path"];
      }
    }
  }

  return "<unknown file>";
}

function parseSemgrepOutput(
  stdout: string | null,
  stderr: string | null,
): ParsedSemgrepOutput {
  const out = stdout?.trim() ? stdout : (stderr ?? "");

  if (!out.trim()) return { findings: [], malformed: true, partialParsing: [] };

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(out);
  } catch {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  if (!isRecord(parsedValue)) {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  const rawResults = parsedValue["results"];
  const rawErrors = parsedValue["errors"];

  if (!Array.isArray(rawResults)) {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  if (rawErrors !== undefined && !Array.isArray(rawErrors)) {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  if (!rawResults.every(isSemgrepResult)) {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  if (rawErrors !== undefined && !rawErrors.every(isSemgrepError)) {
    return { findings: [], malformed: true, partialParsing: [] };
  }

  const findings: Finding[] = [];
  const partialParsing: PartialParsingDiagnostic[] = [];

  for (const e of (rawErrors ?? []) as Array<Record<string, unknown>>) {
    if (e["level"] === "error") {
      findings.push({
        tool: "semgrep",
        rule: `SEM-PARSE-${
          typeof e["rule_id"] === "string" ? e["rule_id"] : "UNKNOWN"
        }`,
        message:
          typeof e["message"] === "string"
            ? e["message"]
            : "semgrep rule parse error",
        severity: "error",
      });

      continue;
    }

    if (isIncompleteAnalysisError(e)) {
      partialParsing.push({
        path: errorEntryPath(e),
        message:
          typeof e["message"] === "string"
            ? e["message"]
            : "semgrep reported a file it could not fully parse",
      });
    }
  }

  for (const r of rawResults) {
    const start = r["start"] as { line?: number; col?: number } | undefined;
    const extra = r["extra"] as
      { severity?: string; message?: string } | undefined;

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

  return { findings, malformed: false, partialParsing };
}
