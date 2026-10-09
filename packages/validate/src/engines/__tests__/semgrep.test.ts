import type { Repository } from "../../discover.js";

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePythonForSemgrep, runSemgrep } from "../semgrep.js";

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
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({ results: [], errors: [] }));\n',
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
        ["/usr/bin/python3", "/usr/local/bin/python3", "/opt/homebrew/bin/python3"].includes(
        resolved,
      ),
    ).toBe(true);
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
});
