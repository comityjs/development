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
