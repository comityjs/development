import type { Repository } from "../../discover.js";

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SEMGREP_TIMEOUT_MS,
  MAX_SEMGREP_TIMEOUT_MS,
  resolveInterpreterFromBin,
  resolvePythonForSemgrep,
  resolveSemgrepTimeout,
  runSemgrep,
} from "../semgrep.js";

let sandbox: string;
let savedEnv: NodeJS.ProcessEnv;

function repoWithOneCorePackage(root: string): Repository {
  return {
    root,
    repository: { name: "fixture", type: "community" },
    packageRoots: ["packages"],
    packages: [
      {
        name: "@fixture/core",
        path: join(root, "packages", "core"),
        layer: "core",
        manifest: {},
      },
    ],
    config: {},
  };
}

/**
 * Writes an executable stub standing in for a Python interpreter that
 * ships the semgrep module: it ignores its arguments and reports a
 * successful scan with no findings.
 */
function writeFakeInterpreter(): string {
  const file = join(sandbox, "fake-python");

  writeFileSync(
    file,
    "#!/usr/bin/env node\nconsole.log(JSON.stringify({ results: [], errors: [] }));\n",
  );
  chmodSync(file, 0o755);

  return file;
}

/** Writes an executable Node script for timeout/error-path tests. */
function writeScript(name: string, source: string): string {
  const file = join(sandbox, name);

  writeFileSync(file, source);
  chmodSync(file, 0o755);

  return file;
}

/** Writes a fake interpreter that emits one fixed Semgrep JSON payload. */
function writeOutputInterpreter(output: string): string {
  return writeScript(
    "output-python",
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(output)});\n`,
  );
}

/**
 * Builds the `errors` entry Semgrep 1.180.0 emits for a file it could only
 * partially parse. Captured from a real scan: `level: "warn"`, a
 * `PartialParsing` tag name, the affected file in `path`/`spans`, and process
 * exit code `0`.
 */
function partialParsingError(file: string): Record<string, unknown> {
  const start = { line: 1, col: 21, offset: 0 };
  const end = { line: 1, col: 22, offset: 1 };

  return {
    code: 3,
    level: "warn",
    type: ["PartialParsing", [{ path: file, start, end }]],
    message: `Syntax error at line ${file}:1:\n \`=\` was unexpected`,
    path: file,
    spans: [{ file, start, end }],
  };
}

beforeEach(() => {
  savedEnv = { ...process.env };
  sandbox = mkdtempSync(join(tmpdir(), "comity-semgrep-test-"));
  delete process.env["SEMGREP_PYTHON"];
  delete process.env["SEMGREP_BIN"];
  delete process.env["COMITY_SEMGREP_TIMEOUT_MS"];
});

afterEach(() => {
  process.env = savedEnv;
  rmSync(sandbox, { recursive: true, force: true });
});

describe("resolvePythonForSemgrep", () => {
  it("prefers an explicitly configured interpreter", () => {
    const fake = join(sandbox, "python3");

    writeFileSync(fake, "");

    expect(
      resolvePythonForSemgrep({ PATH: sandbox, SEMGREP_PYTHON: fake }),
    ).toBe(fake);
  });

  it("reports a set-but-missing interpreter as unavailable", () => {
    expect(
      resolvePythonForSemgrep({
        PATH: sandbox,
        SEMGREP_PYTHON: join(sandbox, "missing-python"),
      }),
    ).toBeNull();
  });

  it("preserves default resolution when unconfigured", () => {
    const resolved = resolvePythonForSemgrep({ PATH: sandbox });

    expect(
      resolved === null ||
        [
          "/usr/bin/python3",
          "/usr/local/bin/python3",
          "/opt/homebrew/bin/python3",
        ].includes(resolved),
    ).toBe(true);
  });
});

describe("resolveInterpreterFromBin", () => {
  it("returns the interpreter from a shim-style shebang", () => {
    const python = writeFakeInterpreter();
    const shim = join(sandbox, "semgrep-shim");

    writeFileSync(
      shim,
      `#!${python}\nfrom semgrep.console_scripts.entrypoint import main\n`,
    );

    expect(resolveInterpreterFromBin(shim)).toBe(python);
  });

  it("resolves /usr/bin/env shebangs against PATH", () => {
    const interp = join(sandbox, "myinterp");

    writeFileSync(interp, "");
    chmodSync(interp, 0o755);
    process.env["PATH"] = `${sandbox}:${savedEnv["PATH"] ?? ""}`;

    const shim = join(sandbox, "semgrep-env-shim");

    writeFileSync(shim, "#!/usr/bin/env myinterp\n");

    expect(resolveInterpreterFromBin(shim)).toBe(interp);
  });

  it("returns null without a usable shebang", () => {
    const plain = join(sandbox, "semgrep-plain");

    writeFileSync(plain, "not a script\n");

    expect(resolveInterpreterFromBin(plain)).toBeNull();
    expect(resolveInterpreterFromBin(join(sandbox, "missing-shim"))).toBeNull();
  });
});

describe("runSemgrep interpreter selection", () => {
  it("runs the scan with the explicitly selected interpreter", async () => {
    const gate = join(sandbox, "semgrep-bin");

    writeFileSync(gate, "");
    process.env["SEMGREP_BIN"] = gate;
    process.env["SEMGREP_PYTHON"] = writeFakeInterpreter();

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("reports invalid interpreter configuration without falling back", async () => {
    const gate = join(sandbox, "semgrep-bin");

    writeFileSync(gate, "");
    process.env["SEMGREP_BIN"] = gate;
    process.env["SEMGREP_PYTHON"] = join(sandbox, "missing-python");

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.status).toBe("TOOL-UNAVAILABLE");
    expect(result.reason).toContain("SEMGREP_PYTHON");
  });

  it("keeps the binary gate when no executable is available", async () => {
    process.env["PATH"] = sandbox;
    process.env["SEMGREP_BIN"] = join(sandbox, "missing-bin");
    process.env["SEMGREP_PYTHON"] = join(sandbox, "missing-python");

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.status).toBe("TOOL-UNAVAILABLE");
    expect(result.reason ?? "").toMatch(/SEMGREP_BIN|SEMGREP_PYTHON/);
  });

  it("prefers the semgrep binary's shebang interpreter over the system python", async () => {
    const python = writeFakeInterpreter();
    const shim = join(sandbox, "semgrep-shim");

    writeFileSync(shim, `#!${python}\nfrom semgrep import main\n`);
    process.env["SEMGREP_BIN"] = shim;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("still fails validation on a genuine rule match", async () => {
    const stub = join(sandbox, "finding-python");

    writeFileSync(
      stub,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify({ results: [{ check_id: "x.comity-adapter-no-raw-error-throw", path: "packages/a/src/a.ts", start: { line: 3, col: 5 }, extra: { severity: "WARNING", message: "raw throw" } }], errors: [] }));\nprocess.exitCode = 1;\n',
    );
    chmodSync(stub, 0o755);
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = stub;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("FAIL");
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toContain(
      "comity-adapter-no-raw-error-throw",
    );
  });

  it("does not let a zero exit code mask findings", async () => {
    const stub = join(sandbox, "zero-exit-finding-python");

    writeFileSync(
      stub,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify({ results: [{ check_id: "x.rule", path: "packages/a/src/a.ts", start: { line: 1, col: 1 }, extra: { severity: "INFO", message: "finding" } }], errors: [] }));\n',
    );
    chmodSync(stub, 0o755);
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = stub;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("FAIL");
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
  });

  it("reports a crashing interpreter as an execution error, never a pass", async () => {
    const crashing = join(sandbox, "crashing-python");

    writeFileSync(crashing, "#!/usr/bin/env node\nprocess.exit(1);\n");
    chmodSync(crashing, 0o755);
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = crashing;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-CRASH"]);
    expect(result.reason ?? "").toContain("tool execution failure");
  });

  it("reports an invalid configured timeout as a configuration error", async () => {
    process.env["COMITY_SEMGREP_TIMEOUT_MS"] = "0";

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(false);
    expect(result.status).toBe("CONFIGURATION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.reason ?? "").toContain("COMITY_SEMGREP_TIMEOUT_MS");
  });

  it("terminates a hung scan and reports a timeout", async () => {
    const hangs = writeScript(
      "hang-python",
      "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n",
    );

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = hangs;

    const started = Date.now();
    const result = await runSemgrep(repoWithOneCorePackage(sandbox), {
      timeoutMs: 100,
    });

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-TIMEOUT"]);
    expect(result.reason ?? "").toContain("timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("reports a spawn failure as an execution error", async () => {
    const nonExecutable = join(sandbox, "not-executable-python");

    writeFileSync(nonExecutable, "");
    chmodSync(nonExecutable, 0o644);
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = nonExecutable;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-SPAWN"]);
  });

  it("reports malformed semgrep output as an execution error", async () => {
    const malformed = writeScript(
      "malformed-python",
      "#!/usr/bin/env node\nprocess.stdout.write('not json');\n",
    );

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = malformed;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-MALFORMED"]);
  });

  it("classifies invalid Semgrep JSON shapes as malformed", async () => {
    const invalidPayloads = [
      JSON.stringify({ results: {}, errors: [] }),
      JSON.stringify({ results: "not-an-array", errors: [] }),
      JSON.stringify({ results: 1, errors: [] }),
      JSON.stringify({ results: null, errors: [] }),
      JSON.stringify({ errors: [] }),
      JSON.stringify({ results: [], errors: {} }),
      JSON.stringify({ results: [], errors: [null] }),
      JSON.stringify({ results: [null], errors: [] }),
      JSON.stringify({ results: [], errors: [{ level: 42 }] }),
      JSON.stringify({
        results: [{ check_id: "x", path: "a.ts", start: { line: 1 } }],
        errors: [],
      }),
      JSON.stringify({
        results: [{ check_id: 1, path: "a.ts", start: { line: 1, col: 1 } }],
        errors: [],
      }),
    ];

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");

    for (const payload of invalidPayloads) {
      process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(payload);

      const result = await runSemgrep(repoWithOneCorePackage(sandbox));

      expect(result.executed).toBe(true);
      expect(result.status).toBe("EXECUTION-ERROR");
      expect(result.passed).toBe(false);
      expect(result.findings.map((f) => f.rule)).toEqual(["SEM-MALFORMED"]);
    }
  });

  it("accepts a valid response with empty results and no errors field", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({ results: [] }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("preserves valid Semgrep error entries", async () => {
    const payload = JSON.stringify({
      results: [],
      errors: [{ level: "error", rule_id: "fixture-rule", message: "bad rule" }],
    });

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(payload);

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("FAIL");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual([
      "SEM-PARSE-fixture-rule",
    ]);
  });

  it("never passes when Semgrep reports a partially parsed file", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({
        results: [],
        errors: [partialParsingError("packages/a/src/a.ts")],
      }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-PARTIAL-PARSE"]);
    expect(result.findings[0]?.file).toBe("packages/a/src/a.ts");
    expect(result.reason ?? "").toContain("incomplete");
  });

  it("retains policy findings alongside a partial-parsing diagnostic", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({
        results: [
          {
            check_id: "x.comity-adapter-no-raw-error-throw",
            path: "packages/a/src/b.ts",
            start: { line: 3, col: 5 },
            extra: { severity: "WARNING", message: "raw throw" },
          },
        ],
        errors: [partialParsingError("packages/a/src/a.ts")],
      }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual([
      "SEM-x.comity-adapter-no-raw-error-throw",
      "SEM-PARTIAL-PARSE",
    ]);
  });

  it("treats a syntax-error warning without the PartialParsing tag as incomplete", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({
        results: [],
        errors: [
          {
            level: "warn",
            type: "Syntax error",
            message: "Syntax error at line packages/a/src/a.ts:1",
            path: "packages/a/src/a.ts",
          },
        ],
      }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-PARTIAL-PARSE"]);
  });

  it("preserves benign warnings that do not indicate incomplete analysis", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({
        results: [],
        errors: [
          {
            level: "warn",
            type: "OtherWarning",
            message: "a benign advisory warning",
          },
        ],
      }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("treats a malformed error type field as malformed output", async () => {
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = writeOutputInterpreter(
      JSON.stringify({ results: [], errors: [{ level: "warn", type: 42 }] }),
    );

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-MALFORMED"]);
  });

  it("never passes when a partial parse coincides with a nonzero exit", async () => {
    const stub = join(sandbox, "partial-exit-python");

    writeFileSync(
      stub,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(
        JSON.stringify({
          results: [],
          errors: [partialParsingError("packages/a/src/a.ts")],
        }),
      )});\nprocess.exitCode = 2;\n`,
    );
    chmodSync(stub, 0o755);
    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = stub;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-PARTIAL-PARSE"]);
    expect(result.reason ?? "").toContain("exited with code 2");
  });

  it.skipIf(process.platform === "win32")(
    "terminates descendants after a timeout",
    async () => {
      const marker = join(sandbox, "descendant-marker");
      const descendant = writeScript(
        "descendant-python",
        `#!/usr/bin/env node
const { spawn } = require("node:child_process");
spawn(process.execPath, ["-e", "setTimeout(() => require('node:fs').writeFileSync(process.env.MARKER, 'x'), 500)"], { stdio: "ignore" });
setInterval(() => {}, 1000);
`,
      );

      process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
      writeFileSync(process.env["SEMGREP_BIN"], "");
      process.env["SEMGREP_PYTHON"] = descendant;
      process.env["MARKER"] = marker;

      const result = await runSemgrep(repoWithOneCorePackage(sandbox), {
        timeoutMs: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 700));

      expect(result.status).toBe("EXECUTION-ERROR");
      expect(result.findings.map((f) => f.rule)).toEqual(["SEM-TIMEOUT"]);
      expect(existsSync(marker)).toBe(false);
    },
  );

  it("reports output overflow without passing", async () => {
    const overflowing = writeScript(
      "overflow-python",
      "#!/usr/bin/env node\nprocess.stdout.write('x'.repeat(17 * 1024 * 1024));\n",
    );

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = overflowing;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-OUTPUT"]);
  });

  it("reports signal termination as an execution error", async () => {
    const terminated = writeScript(
      "signal-python",
      "#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGTERM');\n",
    );

    process.env["SEMGREP_BIN"] = join(sandbox, "semgrep-bin");
    writeFileSync(process.env["SEMGREP_BIN"], "");
    process.env["SEMGREP_PYTHON"] = terminated;

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.executed).toBe(true);
    expect(result.status).toBe("EXECUTION-ERROR");
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["SEM-SIGNAL"]);
  });
});

describe("resolveSemgrepTimeout", () => {
  it("defaults to a five-minute bound", () => {
    expect(resolveSemgrepTimeout({})).toEqual({
      timeoutMs: DEFAULT_SEMGREP_TIMEOUT_MS,
    });
  });

  it("accepts a positive integer environment override", () => {
    expect(resolveSemgrepTimeout({ COMITY_SEMGREP_TIMEOUT_MS: "120000" })).toEqual(
      { timeoutMs: 120_000 },
    );
  });

  it("accepts the maximum supported timeout", () => {
    expect(
      resolveSemgrepTimeout({
        COMITY_SEMGREP_TIMEOUT_MS: String(MAX_SEMGREP_TIMEOUT_MS),
      }),
    ).toEqual({ timeoutMs: MAX_SEMGREP_TIMEOUT_MS });
  });

  it("rejects one above the maximum supported timeout", () => {
    const resolved = resolveSemgrepTimeout({
      COMITY_SEMGREP_TIMEOUT_MS: String(MAX_SEMGREP_TIMEOUT_MS + 1),
    });

    expect(resolved.timeoutMs).toBe(DEFAULT_SEMGREP_TIMEOUT_MS);
    expect(resolved.error).toContain(String(MAX_SEMGREP_TIMEOUT_MS));
  });

  it("rejects oversized explicit overrides", () => {
    const resolved = resolveSemgrepTimeout({}, MAX_SEMGREP_TIMEOUT_MS + 1);

    expect(resolved.timeoutMs).toBe(DEFAULT_SEMGREP_TIMEOUT_MS);
    expect(resolved.error).toContain(String(MAX_SEMGREP_TIMEOUT_MS));
  });

  it("rejects invalid and non-positive values", () => {
    for (const value of [
      "",
      "0",
      "-1",
      "1.5",
      "nope",
      String(Number.MAX_SAFE_INTEGER),
      "999999999999999999999",
    ]) {
      const resolved = resolveSemgrepTimeout({
        COMITY_SEMGREP_TIMEOUT_MS: value,
      });

      expect(resolved.timeoutMs).toBe(DEFAULT_SEMGREP_TIMEOUT_MS);
      expect(resolved.error).toBeDefined();
    }
  });
});
