import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, "..", "..");
const RULES_DIR = join(PACKAGE_ROOT, "rules");
const NAME = "@comity-dev/semgrep-rules";

const manifest = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { exports: Record<string, unknown>; files: string[] };

const ruleFiles = readdirSync(RULES_DIR)
  .filter((file) => file.endsWith(".yaml"))
  .sort();

interface Probe {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Run an ES module script inside the package so that Node's own package
 * self-reference resolution applies, with deprecations promoted to errors.
 * @param {string} body - Script body; its result is printed as JSON.
 * @returns {Probe} The process output.
 */
function probe(body: string): Probe {
  const run = spawnSync(
    process.execPath,
    ["--throw-deprecation", "--input-type=module", "-e", body],
    { cwd: PACKAGE_ROOT, encoding: "utf8" },
  );

  return {
    stdout: run.stdout,
    stderr: run.stderr,
    status: run.status ?? -1,
  };
}

describe("@comity-dev/semgrep-rules exports", () => {
  it("has rule files to expose", () => {
    expect(ruleFiles.length).toBeGreaterThan(0);
  });

  it("no longer advertises the broken directory export", () => {
    expect(manifest.exports).not.toHaveProperty("./rules");
    expect(JSON.stringify(manifest.exports)).not.toMatch(/"\.\/rules\/"/);
    expect(manifest.exports["./rules/*.yaml"]).toBe("./rules/*.yaml");
    expect(manifest.files).toContain("./rules");
  });

  it("resolves every rule file with import.meta.resolve to a file inside rules/", () => {
    const run = probe(`
      import { fileURLToPath } from "node:url";
      const files = ${JSON.stringify(ruleFiles)};
      console.log(JSON.stringify(files.map((f) =>
        fileURLToPath(import.meta.resolve("${NAME}/rules/" + f)))));
    `);

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);

    const resolved = JSON.parse(run.stdout) as string[];

    expect(resolved).toHaveLength(ruleFiles.length);
    resolved.forEach((path, index) => {
      expect(existsSync(path)).toBe(true);
      expect(path.startsWith(RULES_DIR + sep)).toBe(true);
      expect(path.endsWith(ruleFiles[index] ?? "")).toBe(true);
    });
  });

  it("resolves every rule file with require.resolve (Node 24+)", () => {
    const run = probe(`
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      const files = ${JSON.stringify(ruleFiles)};
      console.log(JSON.stringify(files.map((f) => require.resolve("${NAME}/rules/" + f))));
    `);

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);

    const resolved = JSON.parse(run.stdout) as string[];

    resolved.forEach((path, index) => {
      expect(existsSync(path)).toBe(true);
      expect(path.startsWith(RULES_DIR + sep)).toBe(true);
      expect(path.endsWith(ruleFiles[index] ?? "")).toBe(true);
    });
  });

  it("reports a nonexistent rule file as missing", () => {
    const specifier = `${NAME}/rules/does-not-exist.yaml`;
    const run = probe(`
      import { createRequire } from "node:module";
      import { fileURLToPath } from "node:url";
      const require = createRequire(import.meta.url);
      let cjs = "resolved";
      try { require.resolve("${specifier}"); } catch (e) { cjs = e.code; }
      // ESM resolution maps the pattern without checking existence.
      const esmPath = fileURLToPath(import.meta.resolve("${specifier}"));
      console.log(JSON.stringify({ cjs, esmPath }));
    `);

    expect(run.stderr).toBe("");

    const observed = JSON.parse(run.stdout) as { cjs: string; esmPath: string };

    expect(observed.cjs).toBe("MODULE_NOT_FOUND");
    expect(observed.esmPath.startsWith(RULES_DIR + sep)).toBe(true);
    expect(existsSync(observed.esmPath)).toBe(false);
  });

  it.each([
    ["a non-YAML file", `${NAME}/rules/module-shape.txt`],
    ["the bare rules directory", `${NAME}/rules`],
    ["a traversal out of rules/", `${NAME}/rules/../package.json`],
    ["a source file", `${NAME}/src/index.ts`],
  ])("does not export %s", (_label, specifier) => {
    const run = probe(`
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      let esm = "resolved";
      let cjs = "resolved";
      try { import.meta.resolve("${specifier}"); } catch (e) { esm = e.code; }
      try { require.resolve("${specifier}"); } catch (e) { cjs = e.code; }
      console.log(JSON.stringify({ esm, cjs }));
    `);

    expect(run.stderr).toBe("");
    expect(JSON.parse(run.stdout)).toEqual({
      esm: "ERR_PACKAGE_PATH_NOT_EXPORTED",
      cjs: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  });
});
