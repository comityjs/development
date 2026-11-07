import type { Repository } from "../../discover.js";
import type { ResolvedTool } from "../../tool-resolution.js";

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { discoverRepository } from "../../discover.js";
import { ExitCode } from "../../exit-codes.js";
import { formatSummary } from "../../format.js";
import { exitCodeForResult, runValidation } from "../../run.js";
import { parseDepcruiseResult, runDepcruise } from "../depcruise.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string): string =>
  readFileSync(join(here, "__fixtures__", n), "utf8");
const VIOLATIONS_16_10_4 = fixture("depcruise-16.10.4-violations.json");
const CLEAN_16_10_4 = fixture("depcruise-16.10.4-clean.json");

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));

  dirs.push(d);

  return d;
}

/** Deep-clones the captured result and lets a test corrupt it. */
function mutated(
  base: string,
  fn: (r: Record<string, any>) => void,
): string {
  const r = JSON.parse(base);

  fn(r);

  return JSON.stringify(r);
}

describe("dependency-cruiser version compatibility", () => {
  const pkg = (p: string) =>
    JSON.parse(readFileSync(resolve(here, "../../..", p), "utf8")) as {
      version: string;
      dependencies?: Record<string, string>;
    };

  it("the installed (lockfile-resolved) version satisfies the declared range and matches the captured fixtures", () => {
    const declared = pkg("package.json").dependencies?.["dependency-cruiser"];
    const installed = pkg("node_modules/dependency-cruiser/package.json").version;

    // Supported range: ^16.10.4. Bumping the range or the lockfile must come
    // with re-captured fixtures (see __fixtures__/depcruise-<version>-*.json).
    expect(declared).toBe("^16.10.4");

    const [maj, min, pat] = installed.split(".").map(Number) as [number, number, number];

    expect(maj).toBe(16);
    expect(min > 10 || (min === 10 && pat >= 4)).toBe(true);
    expect(installed).toBe("16.10.4");
  });

  it("real output of the installed version parses", () => {
    const real = parseDepcruiseResult(VIOLATIONS_16_10_4);

    expect(real.ok).toBe(true);
  });
});

describe("parseDepcruiseResult (captured dependency-cruiser 16.10.4 output)", () => {
  it("captured fixtures have the schema the parser relies on", () => {
    const r = JSON.parse(VIOLATIONS_16_10_4);

    expect(Object.keys(r).sort()).toEqual(["modules", "summary"]);
    expect(r.violations).toBeUndefined();
    expect(Array.isArray(r.summary.violations)).toBe(true);
    expect(typeof r.summary.violations[0].from).toBe("string");
  });

  it("1. no violations → ok, zero violations", () => {
    const r = parseDepcruiseResult(CLEAN_16_10_4);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary.violations).toEqual([]);
      expect(r.summary.counts).toEqual({ error: 0, warn: 0, info: 0, ignore: 0 });
      expect(r.summary.sources.length).toBeGreaterThan(0);
    }
  });

  it("2. real error/warn/info violations are read from summary.violations", () => {
    const r = parseDepcruiseResult(VIOLATIONS_16_10_4);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary.counts).toMatchObject({ error: 1, warn: 1, info: 1 });
      expect(r.summary.violations).toEqual([
        { from: "packages/a/src/i.ts", to: "packages/b/src/i.ts", rule: "r-error", severity: "error" },
        { from: "packages/a/src/i.ts", to: "packages/c/src/i.ts", rule: "r-warn", severity: "warn" },
        { from: "packages/a/src/i.ts", to: "packages/d/src/i.ts", rule: "r-info", severity: "info" },
      ]);
    }
  });

  it("3. several error violations → exact count", () => {
    const out = mutated(VIOLATIONS_16_10_4, (r) => {
      const v = r.summary.violations;

      v.push({ ...v[0], to: "packages/x/src/1.ts" }, { ...v[0], to: "packages/x/src/2.ts" });
      r.summary.error = 3;
    });
    const r = parseDepcruiseResult(out);

    expect(r.ok && r.summary.violations.filter((v) => v.severity === "error")).toHaveLength(3);
  });

  it.each([
    ["6. malformed JSON", "{not json"],
    ["7a. empty output", ""],
    ["7b. whitespace-only output", "  \n"],
    ["7c. truncated JSON", VIOLATIONS_16_10_4.slice(0, 400)],
    ["8a. root {}", "{}"],
    ["8b. root []", "[]"],
    ["8c. root null", "null"],
    ["8d. root string", '"ok"'],
    ["8e. legacy top-level violations only", '{"violations":[]}'],
  ])("%s → rejected", (_n, out) => {
    expect(parseDepcruiseResult(out).ok).toBe(false);
  });

  it("rejects null/undefined stdout", () => {
    expect(parseDepcruiseResult(null).ok).toBe(false);
    expect(parseDepcruiseResult(undefined).ok).toBe(false);
  });

  it.each([
    ["9. missing summary", (r: any) => delete r.summary],
    ["9b. summary is an array", (r: any) => (r.summary = [])],
    ["9c. missing modules", (r: any) => delete r.modules],
    ["9d. module without source", (r: any) => (r.modules[0] = {})],
    ["10a. missing summary.violations", (r: any) => delete r.summary.violations],
    ["10b. summary.violations not an array", (r: any) => (r.summary.violations = "x")],
    ["10c. summary.violations is an object", (r: any) => (r.summary.violations = {})],
    ["11a. violation not an object", (r: any) => (r.summary.violations[0] = "x")],
    ["11b. violation without from", (r: any) => delete r.summary.violations[0].from],
    ["11c. violation.from is an object (legacy shape)", (r: any) => (r.summary.violations[0].from = { file: "a" })],
    ["11d. violation without to", (r: any) => delete r.summary.violations[0].to],
    ["11e. violation without rule", (r: any) => delete r.summary.violations[0].rule],
    ["11f. rule without name", (r: any) => delete r.summary.violations[0].rule.name],
    ["11g. unknown severity", (r: any) => (r.summary.violations[0].rule.severity = "fatal")],
    ["11h. missing severity", (r: any) => delete r.summary.violations[0].rule.severity],
    ["12a. missing error counter", (r: any) => delete r.summary.error],
    ["12b. counter is a string", (r: any) => (r.summary.error = "1")],
    ["12c. negative counter", (r: any) => (r.summary.warn = -1)],
    ["12d. fractional counter", (r: any) => (r.summary.info = 0.5)],
    ["12e. counter disagrees with entries (hidden error)", (r: any) => (r.summary.error = 0)],
    ["12f. counter disagrees with entries (phantom error)", (r: any) => (r.summary.error = 5)],
    ["12g. missing totalCruised", (r: any) => delete r.summary.totalCruised],
    ["13. rule set not reported", (r: any) => delete r.summary.ruleSetUsed],
  ])("%s → rejected", (_n, corrupt) => {
    const out = mutated(VIOLATIONS_16_10_4, corrupt);
    const r = parseDepcruiseResult(out);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});

// ── process integration ────────────────────────────────────────────────

interface StubOptions {
  /** JS body executed by the stub; receives `config` (parsed --config file). */
  body: string;
}

/** Creates a deterministic stub script, resolved like the real tool. */
function stubTool({ body }: StubOptions): ResolvedTool {
  const bin = tmp("comity-stub-bin-");
  const file = join(bin, "depcruise");

  writeFileSync(
    file,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(args[args.indexOf("--config") + 1], "utf8"));
const result = (violations, extra = {}) => {
  const c = { error: 0, warn: 0, info: 0, ignore: 0 };
  for (const v of violations) c[v.rule.severity]++;
  return JSON.stringify({
    modules: extra.modules ?? [{ source: "packages/kernel/src/index.ts", dependencies: [] }],
    summary: { violations, ...c, totalCruised: 1,
      ruleSetUsed: { forbidden: extra.forbidden ?? config.forbidden } },
  });
};
const violation = (rule, severity) => ({ type: "dependency", from: "packages/kernel/src/index.ts",
  to: "packages/catalog/src/index.ts", rule: { name: rule, severity } });
${body}
`,
  );

  return { ok: true, script: file };
}

async function layeredRepo(): Promise<Repository> {
  const root = tmp("comity-validate-repo-");

  for (const [name, layer] of [
    ["kernel", "kernel"],
    ["catalog", "core"],
  ] as const) {
    mkdirSync(join(root, "packages", name, "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", name, "package.json"),
      JSON.stringify({ name: `@comity/${name}`, version: "0.0.0", comity: { layer } }),
    );
    writeFileSync(join(root, "packages", name, "src", "index.ts"), "export {};\n");
  }

  writeFileSync(
    join(root, "comity.config.json"),
    JSON.stringify({ repository: { name: "x", type: "community" }, packages: { roots: ["packages"] } }),
  );

  return discoverRepository({ root });
}

describe("runDepcruise process handling", () => {
  it("1. successful cruise without violations → PASS", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: "process.stdout.write(result([]));" }),
    );

    expect(r).toMatchObject({ status: "PASS", passed: true, executed: true, exitCode: 0 });
    expect(r.findings).toEqual([]);
  });

  it("2. reporter exits 0 with an error violation → FAIL (exit code is not a verdict)", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: 'process.stdout.write(result([violation("kernel-no-core-deps", "error")]));' }),
    );

    expect(r).toMatchObject({ status: "FAIL", passed: false, exitCode: 0 });
    expect(r.findings).toEqual([
      expect.objectContaining({
        tool: "dependency-cruiser",
        rule: "DEP-kernel-no-core-deps",
        severity: "error",
        file: "packages/kernel/src/index.ts",
        message: expect.stringContaining("packages/catalog/src/index.ts"),
      }),
    ]);
  });

  it("2b. warn/info only → PASS, but reported as warnings", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({
        body: 'process.stdout.write(result([violation("kernel-no-core-deps", "warn"), violation("kernel-only-primitives", "info")]));',
      }),
    );

    expect(r).toMatchObject({ status: "PASS", passed: true });
    expect(r.findings.map((f) => f.severity)).toEqual(["warning", "warning"]);
  });

  it("2c. findings are counted once (entries, not entries + counters)", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({
        body: 'process.stdout.write(result([violation("kernel-no-core-deps", "error"), violation("kernel-only-primitives", "error")]));',
      }),
    );

    expect(r.findings).toHaveLength(2);
  });

  it("3. non-zero exit without output → EXECUTION-ERROR", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: 'process.stderr.write("boom\\n"); process.exit(3);' }),
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, exitCode: 3 });
    expect(r.reason).toContain("boom");
    expect(r.findings).toHaveLength(1);
  });

  it("3b. non-zero exit with a clean result is inconsistent → EXECUTION-ERROR", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: "process.stdout.write(result([])); process.exit(2);" }),
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, exitCode: 2 });
  });

  it("3c. non-zero exit with error violations → FAIL with findings", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({
        body: 'process.stdout.write(result([violation("kernel-no-core-deps", "error")])); process.exit(1);',
      }),
    );

    expect(r).toMatchObject({ status: "FAIL", passed: false, exitCode: 1 });
    expect(r.findings).toHaveLength(1);
  });

  it("4. a resolved script that cannot be loaded → EXECUTION-ERROR", async () => {
    const r = runDepcruise(await layeredRepo(), {
      ok: true,
      script: join(tmp("comity-no-script-"), "missing.js"),
    });

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, executed: true });
    expect(r.reason).toMatch(/exited with code/);
  });

  it("5. termination by signal → EXECUTION-ERROR", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: 'process.kill(process.pid, "SIGKILL");' }),
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false });
    expect(r.reason).toContain("SIGKILL");
  });

  it.each([
    ["empty output", 'process.stdout.write("");'],
    ["malformed JSON", 'process.stdout.write("{nope");'],
    ["unexpected schema", 'process.stdout.write("{}");'],
    ["legacy top-level violations", 'process.stdout.write(JSON.stringify({ violations: [] }));'],
    ["output only on stderr", 'process.stderr.write(result([]));'],
  ])("6. %s with exit 0 → EXECUTION-ERROR, never PASS", async (_n, body) => {
    const r = runDepcruise(await layeredRepo(), stubTool({ body }));

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false, executed: true });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ rule: "DEP-CRASH", severity: "error" });
  });

  it("7. a different number of applied rules than generated → EXECUTION-ERROR", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: "process.stdout.write(result([], { forbidden: [] }));" }),
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false });
    expect(r.reason).toMatch(/applied 0 forbidden rules/);
  });

  it("7b. no cruised module governed by any rule → EXECUTION-ERROR", async () => {
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({
        body: 'process.stdout.write(result([], { modules: [{ source: "elsewhere/x.ts" }] }));',
      }),
    );

    expect(r).toMatchObject({ status: "EXECUTION-ERROR", passed: false });
    expect(r.reason).toMatch(/none is governed/);
  });

  it("7c. an individual rule matching no module is not a failure", async () => {
    // Only the kernel module is cruised, so the core-only rule matches nothing.
    const r = runDepcruise(
      await layeredRepo(),
      stubTool({ body: "process.stdout.write(result([]));" }),
    );

    expect(r.status).toBe("PASS");
  });

  it("runs dependency-cruiser from the repository root with repo-relative targets", async () => {
    const repo = await layeredRepo();
    const r = runDepcruise(
      repo,
      stubTool({
        body: `if (process.cwd() !== fs.realpathSync(${JSON.stringify(repo.root)})) process.exit(9);
if (!args.includes("packages/kernel") || !args.includes("packages/catalog")) process.exit(8);
process.stdout.write(result([]));`,
      }),
    );

    expect(r.status).toBe("PASS");
  });

  it("unresolvable tool → TOOL-UNAVAILABLE with the resolution reason", async () => {
    const r = runDepcruise(await layeredRepo(), {
      ok: false,
      reason: "cannot resolve dependency \"dependency-cruiser\"",
      cause: new Error("boom"),
    });

    expect(r).toMatchObject({
      status: "TOOL-UNAVAILABLE",
      executed: false,
      reason: expect.stringContaining("dependency-cruiser"),
    });
  });

  it("repository without layered packages → NOT-APPLICABLE, not a fabricated PASS", async () => {
    const root = tmp("comity-validate-nolayer-");

    mkdirSync(join(root, "packages", "p"), { recursive: true });
    writeFileSync(join(root, "packages", "p", "package.json"), JSON.stringify({ name: "@comity/p" }));

    const r = runDepcruise(
      await discoverRepository({ root }),
      stubTool({ body: "process.exit(99);" }),
    );

    expect(r).toMatchObject({ status: "NOT-APPLICABLE", executed: false });
  });
});

// ── end to end: real validator entry point, real dependency-cruiser ─────

interface E2EPackage {
  name: string;
  layer: string;
  files: Record<string, string>;
  link?: { main: string };
}

function e2eFixture(pkgs: E2EPackage[]): string {
  const root = tmp("comity-e2e-");

  writeFileSync(
    join(root, "comity.config.json"),
    JSON.stringify({ repository: { name: "fx", type: "community" }, packages: { roots: ["packages"] } }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler" } }),
  );

  for (const p of pkgs) {
    const dir = join(root, "packages", p.name.replace("@comity/", ""));

    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: p.name,
        version: "0.0.0",
        type: "module",
        ...(p.link ? { main: p.link.main } : {}),
        comity: { layer: p.layer },
      }),
    );

    for (const [f, c] of Object.entries(p.files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), c);
    }

    if (p.link) {
      mkdirSync(join(root, "node_modules", "@comity"), { recursive: true });
      symlinkSync(dir, join(root, "node_modules", p.name));
    }
  }

  return root;
}

const validPkgs: E2EPackage[] = [
  { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": "export const p = 1;\n" } },
  {
    name: "@comity/kernel",
    layer: "kernel",
    files: {
      "src/index.ts": 'import { p } from "../../primitives/src/index"; export const k = p;\n',
    },
  },
  {
    name: "@comity/catalog",
    layer: "core",
    files: {
      "src/index.ts":
        'import { k } from "../../kernel/src/index"; import { p } from "../../primitives/src/index"; export const c = k + p;\n',
    },
  },
];

describe("end to end: comity validate dependencies engine", () => {
  it("valid fixture (permitted dependencies only) → PASS, zero findings", async () => {
    const root = e2eFixture(validPkgs);
    const result = await runValidation({ root, only: "dependencies" });

    expect(result.categories.dependencies).toMatchObject({
      status: "PASS",
      executed: true,
      passed: true,
      findings: 0,
      tool: "dependency-cruiser",
    });
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
    expect(exitCodeForResult(result)).toBe(ExitCode.PASS);
    expect(formatSummary(result)).toContain("Result: PASS");
  });

  it("forbidden dependency fixture → FAIL with correct source, target and rule", async () => {
    const pkgs = validPkgs.map((p) =>
      p.name === "@comity/kernel"
        ? {
            ...p,
            files: {
              "src/index.ts":
                'import { c } from "../../catalog/src/index"; import { p } from "../../primitives/src/index"; export const k = c + p;\n',
            },
          }
        : p,
    );
    const result = await runValidation({ root: e2eFixture(pkgs), only: "dependencies" });

    expect(result.passed).toBe(false);
    expect(result.categories.dependencies).toMatchObject({
      status: "FAIL",
      executed: true,
      passed: false,
      exitCode: 0, // the JSON reporter exits 0 even though violations exist
    });
    expect(result.categories.dependencies.findings).toBe(2);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "dependency-cruiser",
          rule: "DEP-kernel-no-core-deps",
          severity: "error",
          file: "packages/kernel/src/index.ts",
          message: expect.stringContaining("packages/catalog/src/index.ts"),
        }),
        expect.objectContaining({
          rule: "DEP-kernel-only-primitives",
          file: "packages/kernel/src/index.ts",
        }),
      ]),
    );
    expect(exitCodeForResult(result)).toBe(ExitCode.FAIL);
    expect(formatSummary(result)).toContain("Result: FAIL");
  });

  it("forbidden workspace import resolved through node_modules → FAIL", async () => {
    const pkgs: E2EPackage[] = [
      {
        name: "@comity/primitives",
        layer: "primitives",
        files: { "src/index.ts": 'import { k } from "@comity/kernel"; export const p = k;\n' },
      },
      {
        name: "@comity/kernel",
        layer: "kernel",
        files: { "src/index.ts": "export const k = 1;\n", "dist/index.js": "export const k = 1;\n" },
        link: { main: "dist/index.js" },
      },
    ];
    const result = await runValidation({ root: e2eFixture(pkgs), only: "dependencies" });

    expect(result.categories.dependencies).toMatchObject({ status: "FAIL", findings: 1 });
    expect(result.violations[0]).toMatchObject({
      rule: "DEP-primitives-no-internal",
      file: "packages/primitives/src/index.ts",
      message: expect.stringContaining("packages/kernel/dist/index.js"),
    });
  });

  it("generated output (dist/, coverage/) is neither a source of violations nor cruised", async () => {
    const pkgs = validPkgs.map((p) =>
      p.name === "@comity/primitives"
        ? {
            ...p,
            files: {
              ...p.files,
              "dist/index.js": 'import "../../kernel/src/index.ts";\n',
              "coverage/r.js": 'import "../../kernel/src/index.ts";\n',
            },
          }
        : p,
    );
    const result = await runValidation({ root: e2eFixture(pkgs), only: "dependencies" });

    expect(result.categories.dependencies).toMatchObject({ status: "PASS", findings: 0 });
  });

  it("a repository root outside the validator's own tree works (cwd independence)", async () => {
    // The fixtures above live in the OS temp dir, not beside the validator;
    // asserting the engine's cwd handling explicitly:
    const root = e2eFixture(validPkgs);
    const result = await runValidation({ root, only: "dependencies" });

    expect(result.categories.dependencies.status).toBe("PASS");
  });
});

describe("end to end: Core → Composition and type-only imports", () => {
  const compositionPkg: E2EPackage = {
    name: "@comity/composition",
    layer: "composition",
    files: {
      "src/index.ts": "export type ModuleMeta = 1;\n",
      "src/errors.ts": "export class CompositionError {}\n",
    },
  };
  const primitivesPkg: E2EPackage = {
    name: "@comity/primitives",
    layer: "primitives",
    files: { "src/index.ts": "export type P = 1; export const p = 1;\n" },
  };

  it("Core Modules importing composition (value and type) and primitives → PASS", async () => {
    const root = e2eFixture([
      primitivesPkg,
      compositionPkg,
      {
        name: "@comity/http",
        layer: "core",
        files: {
          "src/setup.ts":
            'import type { ModuleMeta } from "../../composition/src/index";\nimport { CompositionError } from "../../composition/src/errors";\nimport type { P } from "../../primitives/src/index";\nexport const e = CompositionError; export type X = [ModuleMeta, P];\n',
        },
      },
    ]);
    const result = await runValidation({ root, only: "dependencies" });

    expect(result.categories.dependencies).toMatchObject({ status: "PASS", findings: 0 });
    expect(result.passed).toBe(true);
  });

  it("a type-only forbidden import fails validation exactly like a runtime one", async () => {
    const make = (body: string) =>
      e2eFixture([
        { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": body } },
        { name: "@comity/kernel", layer: "kernel", files: { "src/index.ts": "export type K = 1; export const k = 1;\n" } },
      ]);
    const typeOnly = await runValidation({
      root: make('import type { K } from "../../kernel/src/index"; export type X = K;\n'),
      only: "dependencies",
    });
    const runtime = await runValidation({
      root: make('import { k } from "../../kernel/src/index"; export const x = k;\n'),
      only: "dependencies",
    });

    for (const r of [typeOnly, runtime]) {
      expect(r.passed).toBe(false);
      expect(r.categories.dependencies).toMatchObject({ status: "FAIL", findings: 1 });
      expect(r.violations[0]).toMatchObject({
        rule: "DEP-primitives-no-internal",
        severity: "error",
        file: "packages/primitives/src/index.ts",
        message: expect.stringContaining("packages/kernel/src/index.ts"),
      });
    }
  });
});
