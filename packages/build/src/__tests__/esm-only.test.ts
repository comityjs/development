import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, "..", "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const TOOL_SOURCE = join(PACKAGE_ROOT, "src", "bin", "comity-build.ts");
const TOOL_BINARY = join(PACKAGE_ROOT, "dist", "bin", "comity-build.js");
const NODE_BIN_DIR = join(REPO_ROOT, "node_modules", ".bin");

/** Path fragments that must never appear in an ESM-only build output. */
const CJS_MARKERS = ["dist/cjs", ".cjs", ".cts"];

let workspace = "";
let fixtureDir = "";
let tlaFixtureDir = "";
let nestedFixtureDir = "";

/**
 * Write a minimal standalone TypeScript package for the build tool to compile.
 * @param {string} dir - The fixture package directory.
 * @param {string} source - The contents of `src/index.ts`.
 * @returns {void}
 */
function writeFixture(dir: string, source: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      { name: "fixture", version: "0.0.0", type: "module" },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "es2022",
          moduleResolution: "bundler",
          target: "es2022",
          lib: ["ES2022"],
          types: [],
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          noEmit: false,
          declaration: false,
          outDir: "dist",
          rootDir: "src",
        },
        include: ["src/**/*"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, "src", "index.ts"), source);
}

/**
 * Run the build tool inside a package directory.
 * @param {string} cwd - The package directory to build.
 * @returns {{ status: number, stderr: string }} The exit status and stderr.
 */
function runTool(cwd: string): { status: number; stderr: string } {
  const result = spawnSync(process.execPath, [TOOL_BINARY], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${NODE_BIN_DIR}:${process.env["PATH"] ?? ""}`,
    },
  });

  return { status: result.status ?? -1, stderr: result.stderr ?? "" };
}

/**
 * List every file under a directory, recursively.
 * @param {string} dir - The directory to walk.
 * @param {string} prefix - The accumulated relative path prefix.
 * @returns {string[]} Relative file paths.
 */
function collectFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;

    return entry.isDirectory()
      ? collectFiles(join(dir, entry.name), `${relative}/`)
      : [relative];
  });
}

beforeAll(() => {
  if (!existsSync(TOOL_BINARY)) {
    const compiled = spawnSync(
      join(NODE_BIN_DIR, "tsc"),
      ["-p", join(PACKAGE_ROOT, "tsconfig.json")],
      { cwd: PACKAGE_ROOT, encoding: "utf8" },
    );

    if (compiled.status !== 0) {
      throw new Error(compiled.stderr || compiled.stdout);
    }
  }

  workspace = mkdtempSync(join(tmpdir(), "comity-esm-only-"));
  fixtureDir = join(workspace, "fixture");
  tlaFixtureDir = join(workspace, "tla-fixture");
  nestedFixtureDir = join(workspace, "nested-fixture");

  writeFixture(
    fixtureDir,
    [
      "export class FixtureError extends Error {",
      "  public constructor(message: string) {",
      "    super(message);",
      "    this.name = \"FixtureError\";",
      "  }",
      "}",
      "",
      "export const answer = 42;",
      "",
      "export default { answer };",
      "",
    ].join("\n"),
  );

  writeFixture(
    nestedFixtureDir,
    [
      "export type { NestedError } from \"./errors/index.js\";",
      "export const nested = 1;",
      "",
    ].join("\n"),
  );
  mkdirSync(join(nestedFixtureDir, "src", "errors"), { recursive: true });
  writeFileSync(
    join(nestedFixtureDir, "src", "errors", "index.ts"),
    "export interface NestedError { readonly code: string }\nexport const errorCode = \"E\";\n",
  );

  writeFixture(
    tlaFixtureDir,
    ["export const delayed = await Promise.resolve(\"resolved\");", ""].join("\n"),
  );
}, 180_000);

afterAll(() => {
  if (workspace !== "") rmSync(workspace, { recursive: true, force: true });
});

describe("ADR-034: comity-build emits one flat dist/ directory", () => {
  it("the build tool source has no CommonJS pass and no split output trees", () => {
    const source = readFileSync(TOOL_SOURCE, "utf8");

    expect(source).not.toContain(`join(CWD, "dist", "cjs")`);
    expect(source).not.toContain(`join(CWD, "dist", "esm")`);
    expect(source).not.toContain(`join(CWD, "dist", "types")`);
    expect(source).not.toContain(`"CommonJS"`);
    expect(source).not.toContain(`startWatchProcess("CJS"`);
    expect(source).not.toContain("Building CJS...");
    expect(source).not.toContain("Building types...");
  });

  it("emits JavaScript and declarations side by side directly under dist/", () => {
    const built = runTool(fixtureDir);

    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);

    const files = collectFiles(join(fixtureDir, "dist"))
      .filter((file) => !file.endsWith(".map"))
      .sort();

    expect(files).toEqual(["index.d.ts", "index.js"]);
  }, 180_000);

  it("emits no esm/, types/, or cjs/ tree and no CJS artifact", () => {
    const dist = join(fixtureDir, "dist");
    const files = collectFiles(dist);

    for (const tree of ["esm", "types", "cjs"]) {
      expect(existsSync(join(dist, tree))).toBe(false);
    }
    for (const marker of CJS_MARKERS) {
      expect(files.some((file) => file.includes(marker))).toBe(false);
    }
    expect(files.some((file) => /\.(d\.)?[cm]ts$|\.[cm]js$/.test(file))).toBe(false);
  });

  it("emits source maps whose sources resolve to the package src/ directory", () => {
    const map = JSON.parse(
      readFileSync(join(fixtureDir, "dist", "index.js.map"), "utf8"),
    ) as { sources: string[] };

    expect(map.sources).toEqual(["../src/index.ts"]);
    expect(
      existsSync(resolve(fixtureDir, "dist", map.sources[0] ?? "missing")),
    ).toBe(true);
  });

  it("emits declarations that reference sibling modules by valid relative paths", () => {
    const built = runTool(nestedFixtureDir);

    expect(built.status).toBe(0);

    const dist = join(nestedFixtureDir, "dist");

    expect(readFileSync(join(dist, "index.d.ts"), "utf8")).toContain(
      "./errors/index.js",
    );
    expect(existsSync(join(dist, "errors", "index.js"))).toBe(true);
    expect(existsSync(join(dist, "errors", "index.d.ts"))).toBe(true);
    expect(readdirSync(dist).sort()).toEqual([
      "errors",
      "index.d.ts",
      "index.js",
      "index.js.map",
    ]);
  }, 180_000);

  it("removes obsolete esm/, types/, and cjs/ output on every rebuild", () => {
    const dist = join(fixtureDir, "dist");

    for (const stale of ["esm/index.js", "types/index.d.ts", "cjs/index.js"]) {
      mkdirSync(dirname(join(dist, stale)), { recursive: true });
      writeFileSync(join(dist, stale), "stale\n");
    }

    const rebuilt = runTool(fixtureDir);

    expect(rebuilt.status).toBe(0);
    for (const tree of ["esm", "types", "cjs"]) {
      expect(existsSync(join(dist, tree))).toBe(false);
    }
    expect(existsSync(join(dist, "index.js"))).toBe(true);
    expect(existsSync(join(dist, "index.d.ts"))).toBe(true);
  }, 180_000);
});

describe("ADR-034: the single ESM artifact is loadable", () => {
  it("import() resolves the built ESM entry point", async () => {
    const entry = join(fixtureDir, "dist", "index.js");
    const namespace = (await import(pathToFileURL(entry).href)) as {
      answer: number;
      FixtureError: new (message: string) => Error;
    };

    expect(namespace.answer).toBe(42);
    expect(new namespace.FixtureError("x")).toBeInstanceOf(Error);
  });

  it("Node 24 require(ESM) resolves the same artifact with identical identity", () => {
    const entry = join(fixtureDir, "dist", "index.js");
    const probe = join(workspace, "probe.cjs");

    writeFileSync(
      probe,
      [
        "const entry = process.argv[2];",
        "const required = require(entry);",
        "import(entry).then((imported) => {",
        "  process.stdout.write(JSON.stringify({",
        "    requireKeys: Object.keys(required).sort(),",
        "    importKeys: Object.keys(imported).sort(),",
        "    sameClass: required.FixtureError === imported.FixtureError,",
        "    instanceOf: new required.FixtureError(\"x\") instanceof imported.FixtureError,",
        "    hasEsModule: required.__esModule === true,",
        "  }));",
        "});",
        "",
      ].join("\n"),
    );

    const result = spawnSync(process.execPath, [probe, entry], {
      encoding: "utf8",
    });

    // ADR-034 Validation requirement 3: no warning noise on stderr.
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const observed = JSON.parse(result.stdout) as {
      requireKeys: string[];
      importKeys: string[];
      sameClass: boolean;
      instanceOf: boolean;
      hasEsModule: boolean;
    };

    // Validation requirement 1: export keys equal the ESM namespace's, plus the
    // documented `__esModule` interop marker of Decision 8.
    const requireKeys = observed.requireKeys.filter((key) => key !== "__esModule");

    expect(requireKeys).toEqual(observed.importKeys);
    expect(requireKeys).toContain("FixtureError");
    expect(observed.requireKeys).toContain("__esModule");
    // Validation requirement 2 / Decision 9: one preserved identity.
    expect(observed.sameClass).toBe(true);
    expect(observed.instanceOf).toBe(true);
    // Decision 8: the documented `require()` return shape.
    expect(observed.hasEsModule).toBe(true);
  });
});

describe("ADR-034: documented top-level await limitation", () => {
  it("require(esm) rejects a graph with top-level await", () => {
    const built = runTool(tlaFixtureDir);

    expect(built.status).toBe(0);

    const entry = join(tlaFixtureDir, "dist", "index.js");
    const probe = join(workspace, "tla-probe.cjs");

    writeFileSync(
      probe,
      [
        "try {",
        "  require(process.argv[2]);",
        "  process.stdout.write(JSON.stringify({ threw: false }));",
        "} catch (error) {",
        "  process.stdout.write(JSON.stringify({ threw: true, code: error.code }));",
        "}",
        "",
      ].join("\n"),
    );

    const result = spawnSync(process.execPath, [probe, entry], {
      encoding: "utf8",
    });
    const observed = JSON.parse(result.stdout) as {
      threw: boolean;
      code?: string;
    };

    // Decision 7: ESM graphs must stay synchronous for `require(esm)` to work.
    expect(observed.threw).toBe(true);
    expect(observed.code).toBe("ERR_REQUIRE_ASYNC_MODULE");
  }, 180_000);

  it("the same top-level-await module still loads through import()", async () => {
    const entry = join(tlaFixtureDir, "dist", "index.js");
    const namespace = (await import(pathToFileURL(entry).href)) as {
      delayed: string;
    };

    expect(namespace.delayed).toBe("resolved");
  });
});



