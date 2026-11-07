import type { Repository } from "../../discover.js";

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSemgrep } from "../semgrep.js";

// Kept separate from semgrep.test.ts: that file replaces `process.env` with a
// plain object, after which assignments no longer reach `os.tmpdir()`. Here the
// real environment is mutated and restored key by key.
const KEYS = ["TMPDIR", "PATH", "SEMGREP_BIN", "SEMGREP_PYTHON", "COMITY_SEMGREP_TIMEOUT_MS"];
let saved: Record<string, string | undefined>;
let sandbox: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  sandbox = mkdtempSync(join(tmpdir(), "comity-semgrep-env-"));
  delete process.env["SEMGREP_PYTHON"];
  delete process.env["SEMGREP_BIN"];
  delete process.env["COMITY_SEMGREP_TIMEOUT_MS"];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }

  rmSync(sandbox, { recursive: true, force: true });
});

function repoWithOneCorePackage(root: string): Repository {
  return {
    root,
    repository: { name: "fixture", type: "community" },
    packageRoots: ["packages"],
    packages: [
      { name: "@fixture/core", path: join(root, "packages", "core"), layer: "core", manifest: {} },
    ],
    config: {},
  };
}

function writeScript(name: string, source: string): string {
  const file = join(sandbox, name);

  writeFileSync(file, source);
  chmodSync(file, 0o755);

  return file;
}

describe("runSemgrep environment and temporary files", () => {
  /** Redirects os.tmpdir() into an empty directory so leaks are visible. */
  function redirectTmpdir(): string {
    const dir = join(sandbox, "tmpdir");

    mkdirSync(dir);
    process.env["TMPDIR"] = dir;

    return dir;
  }

  const leaked = (dir: string): string[] =>
    readdirSync(dir).filter((n) => n.startsWith("comity-validate-"));

  it("does not add developer-specific directories to the child PATH", async () => {
    const tmp = redirectTmpdir();
    const report = join(sandbox, "report.json");
    const gate = join(sandbox, "semgrep-bin");

    writeFileSync(gate, "");
    process.env["SEMGREP_BIN"] = gate;
    process.env["SEMGREP_PYTHON"] = writeScript(
      "reporting-python",
      `#!${process.execPath}
const fs = require("node:fs");
const a = process.argv;
fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({ path: process.env.PATH, config: a[a.indexOf("--config") + 1] }));
console.log(JSON.stringify({ results: [], errors: [] }));
`,
    );
    process.env["PATH"] = "/usr/bin:/bin";

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));
    const seen = JSON.parse(readFileSync(report, "utf8")) as { path: string; config: string };

    expect(result.status).toBe("PASS");
    expect(seen.path).not.toMatch(/\/Users\//);
    expect(seen.path).not.toContain("Library/Python");
    // Legitimate discovery is preserved: the configured binary's directory
    // and the caller's PATH remain.
    expect(seen.path.split(":")).toEqual(expect.arrayContaining([sandbox, "/usr/bin", "/bin"]));
    // The synthesized config lives under os.tmpdir(), not a hardcoded /tmp.
    expect(seen.config, `config=${seen.config} tmp=${tmp}`).toContain(tmp);
    expect(leaked(tmp)).toEqual([]);
  });

  it.each([
    ["crashing interpreter", "#!/usr/bin/env node\nprocess.exit(3);\n"],
    ["clean scan", "#!/usr/bin/env node\nconsole.log(JSON.stringify({ results: [], errors: [] }));\n"],
    ["unparseable output", "#!/usr/bin/env node\nprocess.stdout.write('nope');\n"],
  ])("removes its temp directory after a %s", async (_n, source) => {
    const tmp = redirectTmpdir();
    const gate = join(sandbox, "semgrep-bin");

    writeFileSync(gate, "");
    process.env["SEMGREP_BIN"] = gate;
    process.env["SEMGREP_PYTHON"] = writeScript("python-stub", source);

    await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(leaked(tmp)).toEqual([]);
  });

  it("removes its temp directory when the interpreter is unavailable", async () => {
    const tmp = redirectTmpdir();

    process.env["SEMGREP_BIN"] = join(sandbox, "missing-bin");
    process.env["SEMGREP_PYTHON"] = join(sandbox, "missing-python");

    const result = await runSemgrep(repoWithOneCorePackage(sandbox));

    expect(result.status).toBe("TOOL-UNAVAILABLE");
    expect(leaked(tmp)).toEqual([]);
  });
});
