import type { Repository } from "../../discover.js";

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveInterpreterFromBin,
  resolvePythonForSemgrep,
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

beforeEach(() => {
  savedEnv = { ...process.env };
  sandbox = mkdtempSync(join(tmpdir(), "comity-semgrep-test-"));
  delete process.env["SEMGREP_PYTHON"];
  delete process.env["SEMGREP_BIN"];
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
});
