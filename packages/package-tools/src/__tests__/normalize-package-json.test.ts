import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, "..", "..");
const NORMALIZER = join(PACKAGE_ROOT, "src", "bin", "comity-normalize-package-json.ts");
const BINARY = join(PACKAGE_ROOT, "dist", "bin", "comity-normalize-package-json.js");

let workspace = "";

beforeAll(() => {
  const compiled = spawnSync(
    join(PACKAGE_ROOT, "..", "..", "node_modules", ".bin", "tsc"),
    ["-p", join(PACKAGE_ROOT, "tsconfig.json")],
    { cwd: PACKAGE_ROOT, encoding: "utf8" },
  );

  if (compiled.status !== 0) {
    throw new Error(`${NORMALIZER}: ${compiled.stdout}${compiled.stderr}`);
  }

  workspace = mkdtempSync(join(tmpdir(), "comity-normalize-"));
  mkdirSync(join(workspace, "packages", "demo"), { recursive: true });
  writeFileSync(
    join(workspace, "packages", "demo", "package.json"),
    JSON.stringify({
      name: "@comity/demo",
      version: "0.0.0",
      type: "module",
      exports: {
        "./package.json": "./package.json",
        "./streaming": {
          default: "./dist/streaming/index.js",
          node: "./dist/streaming/node/index.js",
          types: "./dist/streaming/index.d.ts",
        },
        ".": {
          default: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
      },
    }),
  );
}, 120_000);

afterAll(() => {
  if (workspace !== "") rmSync(workspace, { recursive: true, force: true });
});

describe("comity-normalize-package-json: flat ESM export maps", () => {
  it("keeps types first and default last, with environment conditions between", () => {
    const run = spawnSync(
      process.execPath,
      [BINARY, "--repo-root", workspace],
      { cwd: workspace, encoding: "utf8" },
    );

    expect(run.status).toBe(0);

    const manifest = JSON.parse(
      readFileSync(join(workspace, "packages", "demo", "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };

    expect(Object.keys(manifest.exports)).toEqual([".", "./streaming", "./package.json"]);
    expect(Object.keys(manifest.exports["."] as object)).toEqual(["types", "default"]);
    expect(Object.keys(manifest.exports["./streaming"] as object)).toEqual([
      "types",
      "node",
      "default",
    ]);
  });
});

describe("comity-normalize-package-json: dependency key ordering", () => {
  let depWorkspace = "";

  beforeAll(() => {
    depWorkspace = mkdtempSync(join(tmpdir(), "comity-normalize-deps-"));
    mkdirSync(join(depWorkspace, "packages", "dep-test"), { recursive: true });
    writeFileSync(
      join(depWorkspace, "packages", "dep-test", "package.json"),
      JSON.stringify({
        name: "@comity/dep-test",
        version: "0.0.0",
        type: "module",
        peerDependencies: {
          "@comity/acl": "workspace:^",
          "@casl/ability": "^7.0.0",
          "zod": "^3.0.0",
          "alpha-pkg": "^1.0.0",
        },
        dependencies: {
          "@comity/primitives": "workspace:^",
          "@other/scoped": "^2.0.0",
          "lodash": "^4.0.0",
          "beta-dep": "^1.0.0",
        },
        devDependencies: {
          "@comity/cli": "workspace:^",
          "@types/node": "^20.0.0",
          "typescript": "^5.0.0",
          "vitest": "^1.0.0",
        },
        optionalDependencies: {
          "@comity/optional": "workspace:^",
          "@external/opt": "^1.0.0",
          "optional-pkg": "^1.0.0",
        },
      }),
    );
  });

  afterAll(() => {
    if (depWorkspace !== "") rmSync(depWorkspace, { recursive: true, force: true });
  });

  it("sorts peerDependencies alphabetically", () => {
    const run = spawnSync(
      process.execPath,
      [BINARY, "--repo-root", depWorkspace],
      { cwd: depWorkspace, encoding: "utf8" },
    );

    expect(run.status).toBe(0);

    const manifest = JSON.parse(
      readFileSync(join(depWorkspace, "packages", "dep-test", "package.json"), "utf8"),
    ) as { peerDependencies: Record<string, string> };

    expect(Object.keys(manifest.peerDependencies)).toEqual([
      "@casl/ability",
      "@comity/acl",
      "alpha-pkg",
      "zod",
    ]);
  });

  it("sorts dependencies alphabetically", () => {
    const manifest = JSON.parse(
      readFileSync(join(depWorkspace, "packages", "dep-test", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    expect(Object.keys(manifest.dependencies)).toEqual([
      "@comity/primitives",
      "@other/scoped",
      "beta-dep",
      "lodash",
    ]);
  });

  it("sorts devDependencies alphabetically", () => {
    const manifest = JSON.parse(
      readFileSync(join(depWorkspace, "packages", "dep-test", "package.json"), "utf8"),
    ) as { devDependencies: Record<string, string> };

    expect(Object.keys(manifest.devDependencies)).toEqual([
      "@comity/cli",
      "@types/node",
      "typescript",
      "vitest",
    ]);
  });

  it("sorts optionalDependencies alphabetically", () => {
    const manifest = JSON.parse(
      readFileSync(join(depWorkspace, "packages", "dep-test", "package.json"), "utf8"),
    ) as { optionalDependencies: Record<string, string> };

    expect(Object.keys(manifest.optionalDependencies)).toEqual([
      "@comity/optional",
      "@external/opt",
      "optional-pkg",
    ]);
  });
});
