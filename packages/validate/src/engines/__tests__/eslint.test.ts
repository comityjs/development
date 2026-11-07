import type { Repository } from "../../discover.js";
import type { ResolvedTool } from "../../tool-resolution.js";

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverRepository } from "../../discover.js";
import { runValidation } from "../../run.js";
import { parseEslintOutput, runEslint, summarizeStderr } from "../eslint.js";

const dirs: string[] = [];
const originalTmpdir = process.env["TMPDIR"];
let scratchTmp = "";

function tmp(prefix: string): string {
  const d = mkdtempSync(join(originalTmpdir ?? tmpdir(), prefix));

  dirs.push(d);

  return d;
}

// Point os.tmpdir() at an empty directory so leaked temp files are detectable.
beforeEach(() => {
  scratchTmp = mkdtempSync(join(tmpdir(), "comity-eslint-tmpdir-"));
  dirs.push(scratchTmp);
  process.env["TMPDIR"] = scratchTmp;
});

afterEach(() => {
  if (originalTmpdir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = originalTmpdir;
});

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Validator temp entries left in the redirected tmpdir (ignores Node's own caches). */
function leaked(): string[] {
  return readdirSync(scratchTmp).filter((n) => n.startsWith("comity-validate-"));
}

async function repo(): Promise<Repository> {
  const root = tmp("comity-eslint-repo-");

  mkdirSync(join(root, "packages", "kernel", "src"), { recursive: true });
  writeFileSync(
    join(root, "packages", "kernel", "package.json"),
    JSON.stringify({ name: "@comity/kernel", version: "0.0.0", comity: { layer: "kernel" } }),
  );
  writeFileSync(join(root, "packages", "kernel", "src", "index.ts"), "export {};\n");

  return discoverRepository({ root });
}

/** A deterministic stand-in for the ESLint script. `body` is CommonJS. */
function stub(body: string): ResolvedTool {
  const file = join(tmp("comity-eslint-stub-"), "eslint-stub.cjs");

  writeFileSync(file, body);

  return { ok: true, script: file };
}

const URLS = {
  plugin: "file:///fake/plugin/index.js",
  recommended: "file:///fake/plugin/recommended.js",
  tsParser: "file:///fake/parser/index.js",
};
const goodModules = () => ({ ok: true as const, urls: URLS });

const message = (severity: 1 | 2, ruleId: string | null = "r") => ({
  ruleId,
  severity,
  message: "m",
  line: 3,
  column: 4,
});
const out = (results: unknown): string =>
  `process.stdout.write(${JSON.stringify(JSON.stringify(results))});`;

describe("runEslint — output interpretation", () => {
  it("valid empty JSON, exit 0 → PASS", async () => {
    const r = runEslint(await repo(), stub(out([{ filePath: "/a.ts", messages: [] }])), goodModules);

    expect(r).toMatchObject({ status: "PASS", passed: true, executed: true, exitCode: 0 });
    expect(r.findings).toEqual([]);
  });

  it("valid empty array, exit 0 → PASS", async () => {
    const r = runEslint(await repo(), stub(out([])), goodModules);

    expect(r).toMatchObject({ status: "PASS", passed: true });
  });

  it("valid findings, exit 1 → FAIL with classified findings", async () => {
    const r = runEslint(
      await repo(),
      stub(`${out([{ filePath: "/a.ts", messages: [message(2, "x/err"), message(1, "x/warn"), message(2, null)] }])} process.exit(1);`),
      goodModules,
    );

    expect(r).toMatchObject({ status: "FAIL", passed: false, exitCode: 1 });
    expect(r.findings).toEqual([
      expect.objectContaining({ rule: "x/err", severity: "error", file: "/a.ts", line: 3, column: 4 }),
      expect.objectContaining({ rule: "x/warn", severity: "warning" }),
      expect.objectContaining({ rule: "ESLINT", severity: "error" }),
    ]);
  });

  it("warnings only, exit 0 → PASS, reported as warnings", async () => {
    const r = runEslint(
      await repo(),
      stub(out([{ filePath: "/a.ts", messages: [message(1)] }])),
      goodModules,
    );

    expect(r).toMatchObject({ status: "PASS", passed: true });
    expect(r.findings.map((f) => f.severity)).toEqual(["warning"]);
  });

  it.each([
    ["empty stdout", ""],
    ["whitespace-only stdout", 'process.stdout.write("  \\n");'],
    ["non-JSON text", 'process.stdout.write("not json");'],
    ["truncated JSON", 'process.stdout.write("[{\\"filePath\\":");'],
    ["JSON object, not array", 'process.stdout.write("{}");'],
    ["entry without messages", 'process.stdout.write("[{\\"filePath\\":\\"/a\\"}]");'],
    ["message with unknown severity", out([{ filePath: "/a", messages: [{ message: "m", severity: 7 }] }])],
    ["output only on stderr", `process.stderr.write(${JSON.stringify(JSON.stringify([]))});`],
  ])("%s with exit 0 → EXECUTION-ERROR, never PASS (fail-open regression)", async (_n, body) => {
    const r = runEslint(await repo(), stub(body), goodModules);

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, executed: true, exitCode: 0 });
    expect(r.findings).toEqual([expect.objectContaining({ rule: "ESLINT-CRASH", severity: "error" })]);
  });

  it("non-zero exit with malformed output → EXECUTION-ERROR", async () => {
    const r = runEslint(
      await repo(),
      stub('process.stdout.write("garbage"); process.stderr.write("bad\\n"); process.exit(2);'),
      goodModules,
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, exitCode: 2 });
    expect(r.findings[0]?.message).toContain("bad");
  });

  it("non-zero exit with a valid but empty result is unexplained → EXECUTION-ERROR", async () => {
    const r = runEslint(await repo(), stub(`${out([])} process.exit(2);`), goodModules);

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, exitCode: 2 });
  });

  it("termination by signal → EXECUTION-ERROR", async () => {
    const r = runEslint(await repo(), stub('process.kill(process.pid, "SIGKILL");'), goodModules);

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false });
    expect(r.reason).toContain("SIGKILL");
  });
});

describe("runEslint — diagnostics", () => {
  const ESLINT_STDERR = "\\nOops! Something went wrong! :(\\n\\nESLint: 9.39.5\\n\\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/x/plugin.js'\\n    at foo\\n";

  it("keeps the real error when stderr starts with blank lines", async () => {
    const r = runEslint(
      await repo(),
      stub(`process.stderr.write("${ESLINT_STDERR}"); process.exit(2);`),
      goodModules,
    );

    expect(r.status).toBe("EXECUTION-ERROR");
    expect(r.reason).toContain("ERR_MODULE_NOT_FOUND");
    expect(r.findings[0]?.message).not.toMatch(/stderr: *$/);
    // Full diagnostic retained, including lines after the first.
    expect(r.findings[0]?.message).toContain("Oops! Something went wrong");
    expect(r.findings[0]?.message).toContain("Cannot find module '/x/plugin.js'");
  });

  it("states explicitly when there is no stderr", async () => {
    const r = runEslint(await repo(), stub("process.exit(2);"), goodModules);

    expect(r.findings[0]?.message).toContain("(no stderr output)");
  });

  it("truncates very large stderr", async () => {
    const r = runEslint(
      await repo(),
      stub('process.stderr.write("E".repeat(50000)); process.exit(2);'),
      goodModules,
    );

    expect(r.findings[0]?.message.length).toBeLessThan(5000);
    expect(r.findings[0]?.message).toContain("[truncated]");
  });

  it.each([
    ["\n\nfirst line\nsecond", "first line"],
    ["\nOops!\n\nError [ERR_X]: real cause\n", "Error [ERR_X]: real cause"],
    ["   \n\n", "(no stderr output)"],
  ])("summarizeStderr(%j) → %j", (stderr, expected) => {
    expect(summarizeStderr(stderr)).toBe(expected);
  });

  it("parseEslintOutput never returns findings for unparseable input", () => {
    expect(parseEslintOutput(null)).toMatchObject({ ok: false });
    expect(parseEslintOutput("[")).toMatchObject({ ok: false });
    expect(parseEslintOutput("[]")).toEqual({ ok: true, findings: [] });
  });
});

describe("runEslint — dependency resolution", () => {
  it("unresolved ESLint → TOOL-UNAVAILABLE with the resolution reason, nothing executed", async () => {
    const r = runEslint(
      await repo(),
      { ok: false, reason: 'cannot resolve dependency "eslint"', cause: new Error("x") },
      goodModules,
    );

    expect(r).toMatchObject({ status: "TOOL-UNAVAILABLE", executed: false, passed: false });
    expect(r.reason).toContain("eslint");
    expect(leaked()).toEqual([]);
  });

  it("unresolved config module → TOOL-UNAVAILABLE naming it; no temp files created", async () => {
    const r = runEslint(await repo(), stub(out([])), () => ({
      ok: false,
      reason: 'cannot resolve dependency "@typescript-eslint/parser" from @comity-dev/validate',
      cause: new Error("x"),
    }));

    expect(r).toMatchObject({ status: "TOOL-UNAVAILABLE", executed: false });
    expect(r.reason).toContain("@typescript-eslint/parser");
    expect(leaked()).toEqual([]);
  });

  it("generates the config from the resolved module URLs, not from the repository's node_modules", async () => {
    const r0 = await repo();
    const copy = join(tmp("comity-eslint-copy-"), "config.mjs");
    // The stub copies the --config file it is given so the test can inspect it.
    const tool = stub(`
      const fs = require("node:fs");
      const a = process.argv;
      fs.copyFileSync(a[a.indexOf("--config") + 1], ${JSON.stringify(copy)});
      process.stdout.write("[]");
    `);

    expect(runEslint(r0, tool, goodModules).status).toBe("PASS");

    const config = readFileSync(copy, "utf8");

    expect(config).toContain(`import comityPlugin from ${JSON.stringify(URLS.plugin)};`);
    expect(config).toContain(`import { recommended } from ${JSON.stringify(URLS.recommended)};`);
    expect(config).toContain(`import tsParser from ${JSON.stringify(URLS.tsParser)};`);
    expect(config).not.toContain(`${r0.root}/node_modules`);
    expect(config).toContain("recommended.rules");
  });
});

describe("runEslint — temporary files", () => {
  it.each([
    ["success", out([])],
    ["findings", `${out([{ filePath: "/a", messages: [message(2)] }])} process.exit(1);`],
    ["crash", "process.exit(2);"],
    ["malformed output", 'process.stdout.write("x");'],
    ["signal", 'process.kill(process.pid, "SIGKILL");'],
  ])("%s: creates the config under os.tmpdir() and removes it", async (_n, body) => {
    const marker = join(tmp("comity-eslint-marker-"), "seen");
    const tool = stub(`
      const fs = require("node:fs");
      const a = process.argv;
      fs.writeFileSync(${JSON.stringify(marker)}, a[a.indexOf("--config") + 1]);
      ${body}
    `);

    runEslint(await repo(), tool, goodModules);

    const configPath = readFileSync(marker, "utf8");

    expect(configPath.startsWith(scratchTmp)).toBe(true);
    expect(existsSync(configPath)).toBe(false);
    expect(leaked()).toEqual([]);
  });
});

describe("runValidation → ESLint engine with the real validator dependency graph", () => {
  // Uses the real ESLint, real @comity-dev/eslint-plugin and parser,
  // resolved from the validator's own dependencies: the fixture repository
  // has no node_modules at all.
  function fixture(sources: Record<string, string>): string {
    const root = tmp("comity-eslint-e2e-");

    writeFileSync(
      join(root, "comity.config.json"),
      JSON.stringify({ repository: { name: "fx", type: "community" }, packages: { roots: ["packages"] } }),
    );

    for (const [name, layer] of [["kernel", "kernel"]] as const) {
      const dir = join(root, "packages", name);

      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: `@comity/${name}`, version: "0.0.0", comity: { layer } }),
      );

      for (const [f, c] of Object.entries(sources)) writeFileSync(join(dir, "src", f), c);
    }

    return root;
  }

  it("clean source → PASS", async () => {
    const result = await runValidation({
      root: fixture({ "index.ts": "export const k: number = 1;\n" }),
      only: "eslint",
    });

    expect(result.categories.eslint).toMatchObject({ status: "PASS", executed: true, findings: 0 });
    expect(leaked()).toEqual([]);
  }, 60_000);

  it("Math.random() in a kernel package → FAIL with @comity-dev/no-date-in-core", async () => {
    const result = await runValidation({
      root: fixture({ "index.ts": "export const k: number = Math.random();\n" }),
      only: "eslint",
    });

    expect(result.categories.eslint).toMatchObject({ status: "FAIL", executed: true });
    expect(result.violations).toEqual([
      expect.objectContaining({ tool: "eslint", rule: "@comity-dev/no-date-in-core", severity: "error" }),
    ]);
  }, 60_000);
});
