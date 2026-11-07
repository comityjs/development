/**
 * Consumer-install regression tests for executable resolution.
 *
 * `comity <command>` delegates to executables declared by the CLI's own
 * dependencies. These tests build and pack the real CLI, install it with the
 * real `pnpm` and `npm` into isolated fixtures (no workspace links, source
 * aliases or repository-relative paths), and run the installed `comity` shim.
 *
 * The dependencies the CLI delegates to are replaced by tiny stub packages
 * (same names, versions, `exports` and `bin` maps as the real ones) so that
 * arguments, exit codes, signals and invocation counts can be observed
 * without network access. Real-package consumer runs are covered separately
 * by the release validation procedure.
 */

import type { ChildProcess } from "node:child_process";

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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(CLI_DIR, "../..");

interface StubPackage {
  name: string;
  dir: string;
  bins: string[];
}

const STUBS: StubPackage[] = [
  { name: "@comity-dev/validate", dir: "validate", bins: ["comity-validate"] },
  { name: "@comity-dev/build", dir: "build", bins: ["comity-build"] },
  {
    name: "@comity-dev/package-tools",
    dir: "package-tools",
    bins: ["comity-normalize-exports", "comity-normalize-package-json"],
  },
];

interface RunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Environment without the package-manager state of the invoking `pnpm test`. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!/^npm_/i.test(key) && key !== "INIT_CWD") {
      env[key] = value;
    }
  }

  return { ...env, CI: "true", ...extra };
}

function start(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): { child: ChildProcess; done: Promise<RunResult> } {
  const child = spawn(command, args, { cwd, env });
  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));

  const done = new Promise<RunResult>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", (status, signal) =>
      resolvePromise({ status, signal, stdout, stderr }),
    );
  });

  return { child, done };
}

async function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = cleanEnv(),
): Promise<RunResult> {
  return start(command, args, cwd, env).done;
}

async function mustRun(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  const result = await run(command, args, cwd);

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}) in ${cwd}\n${result.stdout}\n${result.stderr}`,
    );
  }
}

function stubBinSource(pkgName: string): string {
  return `#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const log = process.env.STUB_LOG;
const record = (event) => {
  if (log) appendFileSync(log, JSON.stringify(event) + "\\n");
};

record({
  event: "run",
  pkg: ${JSON.stringify(pkgName)},
  script: process.argv[1],
  argv: process.argv.slice(2),
});

switch (process.env.STUB_MODE) {
  case "exit":
    process.exit(Number(process.env.STUB_EXIT));
    break;
  case "signal":
    process.kill(process.pid, process.env.STUB_SIGNAL);
    setInterval(() => {}, 1000);
    break;
  case "wait":
    process.on("SIGTERM", () => {
      record({ event: "SIGTERM" });
      process.exit(42);
    });
    record({ event: "ready" });
    setInterval(() => {}, 1000);
    break;
  default:
    process.exit(0);
}
`;
}

function writeStub(
  root: string,
  stub: StubPackage,
  version: string,
  options: { omitBin?: boolean } = {},
): string {
  const dir = join(root, `stub-src-${stub.dir}${options.omitBin ? "-nobin" : ""}`);

  mkdirSync(join(dir, "dist", "bin"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.js"), "export {};\n");

  const bin: Record<string, string> = {};

  for (const name of stub.bins) {
    bin[name] = `./dist/bin/${name}.js`;
    writeFileSync(join(dir, "dist", "bin", `${name}.js`), stubBinSource(stub.name));
  }

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: stub.name,
        version,
        type: "module",
        ...(options.omitBin ? {} : { bin }),
        main: "./dist/index.js",
        exports: { ".": { default: "./dist/index.js" } },
        files: ["dist"],
      },
      null,
      2,
    ),
  );

  return dir;
}

type PackageManager = "pnpm" | "npm";

interface Fixture {
  dir: string;
  comity: string;
  log: string;
}

const tarballs: Record<string, string> = {};
let scratch = "";
let cliTarball = "";

function versionOf(dir: string): string {
  return JSON.parse(readFileSync(join(REPO_ROOT, "packages", dir, "package.json"), "utf8")).version;
}

async function pack(packageDir: string, destination: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--silent", "--pack-destination", destination],
    { cwd: packageDir, env: cleanEnv() },
  );

  return join(destination, stdout.trim().split("\n").pop() ?? "");
}

async function createConsumer(
  pm: PackageManager,
  name: string,
  options: { direct: string[]; override?: Record<string, string> },
): Promise<Fixture> {
  const dir = join(scratch, `${pm}-${name}`);
  const overrides: Record<string, string> = {
    ...Object.fromEntries(STUBS.map((s) => [s.name, `file:${tarballs[s.name]}`])),
    ...options.override,
  };
  const dependencies: Record<string, string> = {
    "@comity-dev/cli": `file:${cliTarball}`,
  };

  for (const direct of options.direct) {
    dependencies[direct] = overrides[direct] ?? `file:${tarballs[direct]}`;
  }

  mkdirSync(dir, { recursive: true });

  const manifest: Record<string, unknown> = {
    name: `consumer-${name}`,
    version: "1.0.0",
    private: true,
    dependencies,
  };

  if (pm === "npm") {
    manifest["overrides"] = overrides;
  } else {
    // Strict peer dependencies, per the supported pnpm configuration.
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      [
        "strictPeerDependencies: true",
        "overrides:",
        ...Object.entries(overrides).map(([k, v]) => `  "${k}": "${v}"`),
        "",
      ].join("\n"),
    );
  }

  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));

  await mustRun(pm, ["install"], dir);

  return {
    dir,
    comity: join(dir, "node_modules", ".bin", "comity"),
    log: join(dir, "stub.log"),
  };
}

function readLog(fixture: Fixture): Array<Record<string, unknown>> {
  if (!existsSync(fixture.log)) {
    return [];
  }

  return readFileSync(fixture.log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function stubEnv(fixture: Fixture, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return cleanEnv({ STUB_LOG: fixture.log, ...extra });
}

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "comity-cli-consumer-")));

  // Build the real CLI from source and pack exactly what would be published.
  await mustRun("pnpm", ["run", "build"], CLI_DIR);

  const packDir = join(scratch, "tarballs");

  mkdirSync(packDir);

  const { stdout } = await execFileAsync(
    "pnpm",
    ["pack", "--pack-destination", packDir],
    { cwd: CLI_DIR, env: cleanEnv() },
  );

  cliTarball = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .map((line) => (line.startsWith("/") ? line : join(packDir, line)))
    .pop() ?? "";

  expect(existsSync(cliTarball)).toBe(true);

  for (const stub of STUBS) {
    const src = writeStub(scratch, stub, versionOf(stub.dir));

    tarballs[stub.name] = await pack(src, packDir);
  }
}, 120_000);

afterAll(() => {
  if (scratch) {
    rmSync(scratch, { recursive: true, force: true });
  }
});

describe.each<PackageManager>(["pnpm", "npm"])("clean %s consumer", (pm) => {
  let transitive: Fixture;
  let direct: Fixture;
  let broken: Fixture;

  beforeAll(async () => {
    // CLI is the only direct dependency; validate etc. are transitive.
    transitive = await createConsumer(pm, "transitive", { direct: [] });

    // CLI and validator are both direct dependencies.
    direct = await createConsumer(pm, "direct", {
      direct: ["@comity-dev/validate"],
    });

    // The validator package is present but declares no executable.
    const noBin = writeStub(
      scratch,
      STUBS[0] as StubPackage,
      versionOf("validate"),
      { omitBin: true },
    );

    broken = await createConsumer(pm, "broken", {
      direct: [],
      override: {
        "@comity-dev/validate": `file:${await pack(noBin, mkdtempSync(join(scratch, "nobin-")))}`,
      },
    });
  }, 180_000);

  beforeEach(() => {
    for (const fixture of [transitive, direct, broken]) {
      rmSync(fixture.log, { force: true });
    }
  });

  it("reproduces the consumer layout: validator bin is not linked at the root (pnpm only)", () => {
    const rootBin = join(transitive.dir, "node_modules", ".bin", "comity-validate");

    if (pm === "pnpm") {
      expect(existsSync(rootBin)).toBe(false);
    }

    expect(existsSync(transitive.comity)).toBe(true);
  });

  it("runs the validator when only the CLI is installed", async () => {
    const result = await run(transitive.comity, ["validate"], transitive.dir, stubEnv(transitive));

    expect(result.stderr).not.toContain("ENOENT");
    expect(result.status, result.stderr).toBe(0);

    const runs = readLog(transitive);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ pkg: "@comity-dev/validate" });
    expect(String(runs[0]?.["script"])).toMatch(/@comity-dev[\\/]validate[\\/]dist[\\/]bin[\\/]comity-validate\.js$/);
  });

  it("runs the validator exactly once when the CLI and validator are both direct dependencies", async () => {
    expect(existsSync(join(direct.dir, "node_modules", ".bin", "comity-validate"))).toBe(true);

    const result = await run(direct.comity, ["validate"], direct.dir, stubEnv(direct));

    expect(result.status).toBe(0);
    expect(readLog(direct)).toHaveLength(1);
  });

  it.each([
    [["build", "--watch"], "@comity-dev/build", "comity-build"],
    [["normalize", "exports", "--check"], "@comity-dev/package-tools", "comity-normalize-exports"],
    [["normalize", "package-json", "--check"], "@comity-dev/package-tools", "comity-normalize-package-json"],
  ])("resolves every delegated command from the CLI's own dependencies: %j", async (argv, pkg, bin) => {
    const result = await run(transitive.comity, argv, transitive.dir, stubEnv(transitive));

    expect(result.status).toBe(0);

    const runs = readLog(transitive);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ pkg });
    expect(String(runs[0]?.["script"])).toMatch(new RegExp(`${bin}\\.js$`));
  });

  it("forwards arguments unchanged", async () => {
    const args = ["--repo", ".", "--only=dependencies", "with space", "", "--", "-x", "$HOME", "*"];
    const result = await run(
      transitive.comity,
      ["validate", ...args],
      transitive.dir,
      stubEnv(transitive),
    );

    expect(result.status).toBe(0);
    expect(readLog(transitive)[0]?.["argv"]).toEqual(args);
  });

  it("propagates the validator's exit code", async () => {
    for (const code of [1, 2, 3, 77]) {
      const result = await run(
        transitive.comity,
        ["validate"],
        transitive.dir,
        stubEnv(transitive, { STUB_MODE: "exit", STUB_EXIT: String(code) }),
      );

      expect(result.status).toBe(code);
    }
  });

  it("reports a validator killed by a signal as a failure (128 + signo)", async () => {
    const result = await run(
      transitive.comity,
      ["validate"],
      transitive.dir,
      stubEnv(transitive, { STUB_MODE: "signal", STUB_SIGNAL: "SIGTERM" }),
    );

    expect(result.status).toBe(128 + 15);
  });

  it("forwards SIGTERM sent to the CLI to the validator", { timeout: 30_000 }, async () => {
    const { child, done } = start(
      transitive.comity,
      ["validate"],
      transitive.dir,
      stubEnv(transitive, { STUB_MODE: "wait" }),
    );

    const deadline = Date.now() + 15_000;

    while (!readLog(transitive).some((e) => e["event"] === "ready")) {
      if (Date.now() > deadline) {
        child.kill("SIGKILL");
        throw new Error("validator stub never became ready");
      }

      await new Promise((r) => setTimeout(r, 50));
    }

    child.kill("SIGTERM");

    const result = await done;

    expect(readLog(transitive).some((e) => e["event"] === "SIGTERM")).toBe(true);
    expect(result.status).toBe(42);
  });

  it("fails clearly when the validator package declares no executable", async () => {
    const result = await run(broken.comity, ["validate"], broken.dir, stubEnv(broken));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not declare a "comity-validate" executable');
    expect(readLog(broken)).toHaveLength(0);
  });
});

describe("CLI without its dependencies available", () => {
  it("fails with a clear error, preserves the cause and exits non-zero", async () => {
    // Unpack the real CLI tarball somewhere with no node_modules anywhere above.
    const dir = join(scratch, "bare");

    mkdirSync(dir);
    await execFileAsync("tar", ["-xzf", cliTarball, "-C", dir]);

    const result = await run(
      process.execPath,
      [join(dir, "package", "dist", "bin", "comity.js"), "validate"],
      dir,
    );

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(result.stderr).toContain('Cannot resolve "@comity-dev/validate"');
    expect(result.stderr).toMatch(/\[cause\]/);
    expect(result.stderr).toMatch(/ERR_MODULE_NOT_FOUND|Cannot find package/);
  });
});
