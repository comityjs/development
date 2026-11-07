import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  resolveModuleUrls,
  resolveToolScript,
  type ModuleResolver,
} from "../tool-resolution.js";

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface FakePackage {
  name: string;
  manifest?: Record<string, unknown>;
  entry?: string;
  files?: string[];
}

/** Builds `<root>/node_modules/<name>` and a resolver that returns its entry. */
function fake({ name, manifest, entry = "lib/index.js", files = [] }: FakePackage): {
  root: string;
  dir: string;
  resolver: ModuleResolver;
} {
  const root = mkdtempSync(join(tmpdir(), "comity-toolres-"));
  const dir = join(root, "node_modules", ...name.split("/"));

  dirs.push(root);
  mkdirSync(join(dir, entry, ".."), { recursive: true });
  writeFileSync(join(dir, entry), "export {};\n");

  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "#!/usr/bin/env node\n");
  }

  if (manifest) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
  }

  return {
    root,
    dir,
    resolver: (spec) => {
      if (spec !== name) throw new Error(`unexpected specifier ${spec}`);

      return pathToFileURL(join(dir, entry)).href;
    },
  };
}

describe("resolveToolScript — real dependency graph", () => {
  it.each([
    ["dependency-cruiser", "depcruise", /dependency-cruise\.mjs$/],
    ["eslint", "eslint", /eslint\.js$/],
  ])("%s resolves to its declared %s executable", (pkg, bin, pattern) => {
    const r = resolveToolScript(pkg, bin);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script).toMatch(pattern);
  });
});

describe("resolveToolScript — manifests and exports", () => {
  it("reads the bin map even when the package's exports hide package.json", () => {
    const { dir, resolver } = fake({
      name: "tool-a",
      manifest: {
        exports: { ".": "./lib/index.js" }, // package.json is NOT exported
        bin: { "tool-a": "./bin/run.js", other: "./bin/other.js" },
      },
      files: ["bin/run.js", "bin/other.js"],
    });

    // Prove the premise: the manifest is not reachable through exports.
    expect(() => resolver("tool-a/package.json")).toThrow();

    expect(resolveToolScript("tool-a", "other", resolver)).toEqual({
      ok: true,
      script: join(dir, "bin", "other.js"),
    });
  });

  it("does not treat the entry point as the executable", () => {
    const { dir, resolver } = fake({
      name: "tool-b",
      manifest: { bin: { "tool-b": "bin/cli.mjs" } },
      files: ["bin/cli.mjs"],
    });
    const r = resolveToolScript("tool-b", "tool-b", resolver);

    expect(r).toEqual({ ok: true, script: join(dir, "bin", "cli.mjs") });
    expect(r.ok && r.script).not.toContain("index.js");
  });

  it("supports the string form of bin for the package's own name", () => {
    const { dir, resolver } = fake({
      name: "@scope/tool-c",
      manifest: { bin: "./bin/c.js" },
      files: ["bin/c.js"],
    });

    expect(resolveToolScript("@scope/tool-c", "tool-c", resolver)).toEqual({
      ok: true,
      script: join(dir, "bin", "c.js"),
    });
    expect(resolveToolScript("@scope/tool-c", "other", resolver).ok).toBe(false);
  });

  it("finds the manifest above a nested entry point", () => {
    const { dir, resolver } = fake({
      name: "tool-d",
      entry: "lib/deep/er/index.js",
      manifest: { bin: { d: "bin/d.js" } },
    });

    expect(resolveToolScript("tool-d", "d", resolver)).toEqual({
      ok: true,
      script: join(dir, "bin", "d.js"),
    });
  });
});

describe("resolveToolScript — failures keep their cause", () => {
  it("unresolvable dependency → ok:false with the original error", () => {
    const cause = Object.assign(new Error("Cannot find package 'nope'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    const r = resolveToolScript("nope", "nope", () => {
      throw cause;
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cause).toBe(cause);
      expect(r.reason).toContain('"nope"');
      expect(r.reason).toContain("Cannot find package");
    }
  });

  it("package without the requested bin → explicit reason naming the manifest", () => {
    const { resolver } = fake({ name: "tool-e", manifest: { bin: { x: "x.js" } } });
    const r = resolveToolScript("tool-e", "missing", resolver);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('does not declare a "missing" executable');
      expect(r.cause).toBeInstanceOf(Error);
    }
  });

  it("no manifest with the package's name above the entry → ok:false", () => {
    const { resolver } = fake({ name: "tool-f" }); // no package.json written
    const r = resolveToolScript("tool-f", "f", resolver);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("cannot locate the package.json");
  });
});

describe("resolveModuleUrls", () => {
  it("resolves the ESLint config dependencies from the validator's own graph", () => {
    const r = resolveModuleUrls({
      plugin: "@comity-dev/eslint-plugin",
      recommended: "@comity-dev/eslint-plugin/recommended",
      tsParser: "@typescript-eslint/parser",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.urls.plugin).toMatch(/^file:\/\/.*eslint-plugin.*dist\/index\.js$/);
      expect(r.urls.recommended).toMatch(/eslint-plugin.*dist\/recommended\.js$/);
      expect(r.urls.tsParser).toMatch(/^file:\/\/.*parser.*dist\/index\.js$/);
    }
  });

  it("reports the failing specifier and preserves the cause", () => {
    const cause = new Error("boom");
    const r = resolveModuleUrls({ a: "ok", b: "bad" }, (s) => {
      if (s === "bad") throw cause;

      return "file:///ok.js";
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cause).toBe(cause);
      expect(r.reason).toContain('"bad"');
    }
  });
});
