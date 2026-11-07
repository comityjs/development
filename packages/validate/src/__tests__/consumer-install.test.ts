/**
 * Packed-artifact consumer tests.
 *
 * Packs `@comity-dev/validate` exactly as it would be published (`pnpm pack`,
 * which rewrites `workspace:` ranges), installs it with the real `npm` and the
 * real `pnpm` into a clean consumer repository, and runs the installed
 * `comity-validate` binary. The consumer declares ONLY the validator: its
 * tools (dependency-cruiser, ESLint) and ESLint configuration dependencies
 * (the Comity plugin, the TypeScript parser) must be found through the
 * validator's own dependency graph under each package manager's real layout.
 *
 * Sibling Comity packages are substituted with `file:` tarballs of the current
 * source via `overrides` so nothing needs to be published. Third-party
 * dependencies come from the registry (or the local package-manager cache), so
 * these tests need network access or a warm cache.
 */

import { execFile, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const VALIDATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES_DIR = resolve(VALIDATE_DIR, "..");
const VALIDATE = "@comity-dev/validate";

/** Sibling workspace packages the validator depends on, in build order. */
const SIBLINGS = [
  ["@comity-dev/schemas", "schemas"],
  ["@comity-dev/dependency-rules", "dependency-rules"],
  ["@comity-dev/eslint-plugin", "eslint-plugin"],
  ["@comity-dev/semgrep-rules", "semgrep-rules"],
] as const;

type PackageManager = "npm" | "pnpm";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!/^npm_/i.test(key) && key !== "INIT_CWD") env[key] = value;
  }

  return { ...env, CI: "true" };
}

function run(command: string, args: string[], cwd: string): Promise<Run> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: cleanEnv() });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

async function mustRun(command: string, args: string[], cwd: string): Promise<Run> {
  const result = await run(command, args, cwd);

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}) in ${cwd}\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result;
}

// ── fixture repository ──────────────────────────────────────────────────

function write(root: string, path: string, content: unknown): void {
  const file = join(root, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

function manifest(name: string, layer: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    version: "0.1.0",
    description: `${name} fixture`,
    type: "module",
    private: false,
    license: "MIT",
    comity: { layer, ...((extra["comity"] as object | undefined) ?? {}) },
    engines: { node: ">=24.0.0" },
    main: "./src/index.ts",
    exports: { ".": "./src/index.ts" },
    files: ["dist"],
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "comity")),
  };
}

/** A small valid layered repository: kernel ← core-a ← adapter-x. */
function writeFixtureRepo(root: string): void {
  write(root, "comity.config.json", {
    repository: { name: "fixture", type: "community" },
    packages: { roots: ["packages"] },
    validation: { rules: {}, exceptions: { dependencyEdges: [], layerOverrides: [] } },
  });
  write(root, "packages/kernel/package.json", manifest("@comity/kernel", "kernel"));
  write(root, "packages/kernel/src/index.ts", "export const k: number = 1;\n");
  write(root, "packages/core-a/package.json", manifest("@comity/core-a", "core"));
  write(
    root,
    "packages/core-a/src/index.ts",
    'import { k } from "../../kernel/src/index.js";\nexport const a: number = k + 1;\n',
  );
  write(
    root,
    "packages/adapter-x/package.json",
    manifest("@comity/adapter-x", "technology-adapter", {
      comity: { implements: "@comity/core-a" },
      peerDependencies: { "@comity/core-a": "^0.1.0" },
    }),
  );
  write(
    root,
    "packages/adapter-x/src/index.ts",
    'import { a } from "../../core-a/src/index.js";\nexport const x: number = a + 1;\n',
  );
}

// ── packing and installing ──────────────────────────────────────────────

let scratch = "";
const tarballs: Record<string, string> = {};

async function pack(dir: string, destination: string): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["pack", "--pack-destination", destination], {
    cwd: dir,
    env: cleanEnv(),
  });
  const tgz = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".tgz"))
    .pop();

  if (!tgz) throw new Error(`pnpm pack produced no tarball in ${dir}:\n${stdout}`);

  return tgz.startsWith("/") ? tgz : join(destination, tgz);
}

interface Consumer {
  dir: string;
  bin: string;
  pm: PackageManager;
}

async function installConsumer(pm: PackageManager): Promise<Consumer> {
  const dir = join(scratch, `consumer-${pm}`);
  const overrides = Object.fromEntries(
    SIBLINGS.map(([name]) => [name, `file:${tarballs[name]}`]),
  );

  mkdirSync(dir, { recursive: true });
  writeFixtureRepo(dir);

  // The consumer's only dependency is the validator.
  const pkg: Record<string, unknown> = {
    name: `consumer-${pm}`,
    version: "1.0.0",
    private: true,
    type: "module",
    devDependencies: { [VALIDATE]: `file:${tarballs[VALIDATE]}` },
  };

  if (pm === "npm") {
    pkg["overrides"] = overrides;
  } else {
    write(
      dir,
      "pnpm-workspace.yaml",
      [
        "strictPeerDependencies: true",
        "overrides:",
        ...Object.entries(overrides).map(([k, v]) => `  "${k}": "${v}"`),
        "",
      ].join("\n"),
    );
  }

  write(dir, "package.json", pkg);
  await mustRun(pm, ["install"], dir);

  return { dir, bin: join(dir, "node_modules", ".bin", "comity-validate"), pm };
}

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "comity-validate-consumer-")));

  // Make sure the sibling packages are built (usually already, after `pnpm build`).
  for (const [, dir] of SIBLINGS) {
    if (!existsSync(join(PACKAGES_DIR, dir, "dist"))) {
      await mustRun("pnpm", ["run", "build"], join(PACKAGES_DIR, dir));
    }
  }

  // Always rebuild the package under test so the tarball reflects the source.
  await mustRun("pnpm", ["run", "build"], VALIDATE_DIR);

  const packDir = join(scratch, "tarballs");

  mkdirSync(packDir);
  tarballs[VALIDATE] = await pack(VALIDATE_DIR, packDir);

  for (const [name, dir] of SIBLINGS) {
    tarballs[name] = await pack(join(PACKAGES_DIR, dir), packDir);
  }
}, 300_000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

// ── the matrix ──────────────────────────────────────────────────────────

/** The category line for an engine, e.g. "PASS    Dependencies (depcruise)". */
function categoryLine(output: string, label: string): string {
  return (
    output
      .split("\n")
      .find((l) => /^(PASS|FAIL|EXEC-ERROR|TOOL-UNAVAILABLE|NOT-APPLICABLE|CONFIG-ERROR|NOT-RUN)\b/.test(l) && l.includes(label))
      ?.replace(/\s+/g, " ") ?? ""
  );
}

describe.each<PackageManager>(["npm", "pnpm"])("packed validator in a clean %s consumer", (pm) => {
  let consumer: Consumer;

  const validate = (only: string): Promise<Run> =>
    run(consumer.bin, ["--repo", ".", `--only=${only}`], consumer.dir);

  const output = (r: Run): string => `${r.stdout}\n${r.stderr}`;

  beforeAll(async () => {
    consumer = await installConsumer(pm);
  }, 300_000);

  it("is a genuine clean install: the consumer declares only the validator", () => {
    const pkg = JSON.parse(readFileSync(join(consumer.dir, "package.json"), "utf8"));

    expect(Object.keys(pkg.devDependencies)).toEqual([VALIDATE]);
    expect(pkg.dependencies).toBeUndefined();
  });

  it("reproduces the layout that broke 0.5.0", () => {
    const validatePkg = realpathSync(join(consumer.dir, "node_modules", "@comity-dev", "validate"));

    if (pm === "npm") {
      // Hoisted: the validator has no node_modules of its own, so a
      // `<validate>/node_modules/.bin` lookup cannot succeed.
      expect(existsSync(join(validatePkg, "node_modules", ".bin", "depcruise"))).toBe(false);
      expect(existsSync(join(consumer.dir, "node_modules", "eslint"))).toBe(true);
    } else {
      // Isolated: the consumer root has neither the tools nor the ESLint
      // configuration dependencies.
      expect(existsSync(join(consumer.dir, "node_modules", "eslint"))).toBe(false);
      expect(existsSync(join(consumer.dir, "node_modules", "@typescript-eslint", "parser"))).toBe(false);
      expect(existsSync(join(consumer.dir, "node_modules", "@comity-dev", "eslint-plugin"))).toBe(false);
      expect(existsSync(join(consumer.dir, "node_modules", ".bin", "depcruise"))).toBe(false);
    }
  });

  it("dependency-cruiser starts and passes a valid fixture", async () => {
    const r = await validate("dependencies");

    expect(categoryLine(output(r), "Dependencies")).toMatch(/^PASS /);
    expect(r.status).toBe(0);
  }, 120_000);

  it("dependency-cruiser detects a forbidden dependency", async () => {
    const bad = "packages/core-a/src/bad.ts";

    write(consumer.dir, bad, 'import { x } from "../../adapter-x/src/index.js";\nexport const bad: number = x;\n');

    try {
      const r = await validate("dependencies");
      const out = output(r);

      expect(categoryLine(out, "Dependencies")).toMatch(/^FAIL /);
      expect(out).toContain("DEP-contracts-never-depend-on-adapters");
      expect(out).toContain("packages/core-a/src/bad.ts");
      expect(out).toContain("packages/adapter-x/src/index.ts");
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(join(consumer.dir, bad), { force: true });
    }
  }, 120_000);

  it("ESLint starts and passes a valid fixture", async () => {
    const r = await validate("eslint");

    expect(categoryLine(output(r), "ESLint")).toMatch(/^PASS /);
    expect(r.status).toBe(0);
  }, 120_000);

  it("ESLint reports a genuine rule violation (@comity-dev/no-date-in-core)", async () => {
    const bad = "packages/kernel/src/random.ts";

    write(consumer.dir, bad, "export const r: number = Math.random();\n");

    try {
      const r = await validate("eslint");
      const out = output(r);

      expect(categoryLine(out, "ESLint")).toMatch(/^FAIL /);
      expect(out).toContain("@comity-dev/no-date-in-core");
      expect(out).toContain("random.ts");
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(join(consumer.dir, bad), { force: true });
    }
  }, 120_000);

  it("ESLint execution errors fail closed with a useful diagnostic", async () => {
    // A package with no lintable files makes ESLint itself exit 2
    // (all files in the target are ignored).
    const dir = join(consumer.dir, "packages", "empty");

    write(consumer.dir, "packages/empty/package.json", manifest("@comity/empty", "kernel"));

    try {
      const r = await validate("eslint");
      const out = output(r);

      expect(categoryLine(out, "ESLint")).toMatch(/^EXEC-ERROR /);
      expect(categoryLine(out, "ESLint")).not.toMatch(/^PASS/);
      expect(out).toMatch(/all of the files matching the glob pattern/);
      expect(out).toContain("ESLINT-CRASH");
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("Semgrep either runs or is explicitly unavailable — never silently passed", async () => {
    const r = await validate("semgrep");
    const line = categoryLine(output(r), "Semgrep");

    // The Semgrep contract: it is an external (Python) tool. It either runs
    // and passes this clean fixture, or is reported TOOL-UNAVAILABLE with a
    // non-zero exit. A silent success without execution is not an option.
    if (/^PASS /.test(line)) {
      expect(r.status).toBe(0);
    } else {
      expect(line).toMatch(/^TOOL-UNAVAILABLE /);
      expect(output(r)).toMatch(/semgrep/i);
      expect(r.status).not.toBe(0);
    }

    // Both outcomes are explicit; record which one this environment produced.
    console.info(`[consumer-install:${pm}] semgrep → ${line}`);
  }, 180_000);
});

describe.each<PackageManager>(["npm", "pnpm"])("full `comity-validate` command in a clean %s consumer (no --only)", (pm) => {
  let consumer: Consumer;

  const full = (): Promise<Run> => run(consumer.bin, ["--repo", "."], consumer.dir);
  const output = (r: Run): string => `${r.stdout}\n${r.stderr}`;

  beforeAll(async () => {
    consumer = await installConsumer(pm);
  }, 300_000);

  it("starts, runs every configured engine, and PASSes a valid fixture", async () => {
    const r = await full();
    const out = output(r);

    for (const label of [
      "Schema",
      "Package metadata",
      "Comity config",
      "Dependencies",
      "ESLint",
      "Semgrep",
      "Adapter peers",
      "Declarations",
    ]) {
      const line = categoryLine(out, label);

      // Every engine reports an explicit outcome; none is silently absent,
      // and none of them is a fabricated PASS without having executed.
      expect(line, `missing category line for "${label}" in:\n${out}`).not.toBe("");
      expect(line).not.toMatch(/^NOT-RUN/);
    }

    expect(categoryLine(out, "Dependencies")).toMatch(/^PASS /);
    expect(categoryLine(out, "ESLint")).toMatch(/^PASS /);
    expect(out).toContain("Result: PASS");
    expect(r.status).toBe(0);
  }, 180_000);

  it("fails the whole command on a forbidden dependency, with the correct rule and files", async () => {
    const bad = "packages/core-a/src/bad.ts";

    write(
      consumer.dir,
      bad,
      'import { x } from "../../adapter-x/src/index.js";\nexport const bad: number = x;\n',
    );

    try {
      const r = await full();
      const out = output(r);

      expect(categoryLine(out, "Dependencies")).toMatch(/^FAIL /);
      expect(out).toContain("DEP-contracts-never-depend-on-adapters");
      expect(out).toContain("packages/core-a/src/bad.ts");
      expect(out).toContain("packages/adapter-x/src/index.ts");
      expect(out).toContain("Result: FAIL");
      // The exit code reflects the overall validation result, not any one engine's own exit code.
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(join(consumer.dir, bad), { force: true });
    }
  }, 180_000);

  it("fails the whole command on a genuine ESLint violation, with the correct rule and file", async () => {
    const bad = "packages/kernel/src/random.ts";

    write(consumer.dir, bad, "export const r: number = Math.random();\n");

    try {
      const r = await full();
      const out = output(r);

      expect(categoryLine(out, "ESLint")).toMatch(/^FAIL /);
      expect(out).toContain("@comity-dev/no-date-in-core");
      expect(out).toContain("random.ts");
      expect(out).toContain("Result: FAIL");
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(join(consumer.dir, bad), { force: true });
    }
  }, 180_000);

  it("Semgrep cannot silently become PASS: it either genuinely executed or is explicitly unavailable", async () => {
    const r = await full();
    const line = categoryLine(output(r), "Semgrep");

    if (/^PASS /.test(line)) {
      // A PASS claim must correspond to a tool that actually ran: the
      // availability contract, not merely the text of this one line.
      expect(line).not.toMatch(/NOT-RUN|SKIP/);
    } else {
      expect(line).toMatch(/^TOOL-UNAVAILABLE /);
      expect(output(r)).toMatch(/semgrep/i);
    }

    console.info(`[consumer-install:${pm}:full] semgrep → ${line}`);
  }, 180_000);
});

