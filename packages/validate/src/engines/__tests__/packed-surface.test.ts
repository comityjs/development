import type { Repository } from "../../discover.js";
import type { EngineResult } from "../types.js";

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExitCode } from "../../exit-codes.js";
import { exitCodeForResult, runValidation } from "../../run.js";
import {
  packedDependencySpecifierFindings,
  readTarball,
  runPackedSurface,
} from "../packed-surface.js";

/**
 * Stage 2 (`packed-surface`) tests.
 *
 * Every rule test packs **real tarballs** with `pnpm pack`: the fixtures are
 * packable package directories, and the engine reads the resulting tarballs,
 * never the workspace `dist`. Two cases cannot be produced by `pnpm pack`:
 * a `workspace:` specifier that survived publishing (the packer rewrites it, or
 * fails when it cannot resolve it) and a corrupted tarball. Those are covered by
 * the exported `packedDependencySpecifierFindings` and `readTarball` units.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFile(root: string, path: string, content: string): void {
  const target = join(root, path);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture(): Repository {
  const root = mkdtempSync(join(tmpdir(), "comity-pack-test-"));

  roots.push(root);
  writeFileSync(
    join(root, "comity.config.json"),
    JSON.stringify({
      repository: { name: "fixture", type: "community" },
      packages: { roots: ["packages"] },
    }),
  );

  return {
    root,
    repository: { name: "fixture", type: "community" },
    packageRoots: ["packages"],
    packages: [],
    config: {},
  };
}

/** A packable package with an ESM-only surface and one exported subpath. */
function pkg(
  repo: Repository,
  directory: string,
  overrides: Record<string, unknown> = {},
  files: Record<string, string> = {
    "dist/index.js": "export const value = 1;\n",
    "dist/index.d.ts": "export declare const value: number;\n",
  },
): void {
  writeFile(
    repo.root,
    `packages/${directory}/package.json`,
    JSON.stringify({
      name: `@comity/${directory}`,
      version: "0.1.0",
      files: ["dist"],
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
      ...overrides,
    }),
  );

  for (const [path, content] of Object.entries(files)) {
    writeFile(repo.root, `packages/${directory}/${path}`, content);
  }
}

function pack(repo: Repository): EngineResult {
  return runPackedSurface(repo);
}

function rules(result: EngineResult): string[] {
  return result.findings.map((finding) => finding.rule).sort();
}

describe("packed-surface", () => {
  it("accepts valid packed tarballs with zero findings", () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(repo, "alpha", { dependencies: { "@comity/beta": "^0.1.0" } });

    const result = pack(repo);

    expect(result.status).toBe("PASS");
    expect(result.executed).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.reason).toContain("2 publishable package(s)");
    expect(result.reason).toContain("ARCH-PACK-003 umbrella");
    expect(result.tool).toBe("packed-surface");
  });

  it("reports ARCH-PACK-001 when an exports target is absent from the tarball", () => {
    const repo = fixture();

    pkg(repo, "alpha", {
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./missing": { default: "./dist/missing.js" },
      },
    });

    const result = pack(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-PACK-001"]);

    const finding = result.findings[0];

    expect(finding?.file).toBe("dist/missing.js");
    expect(finding?.keyword).toBe("dist/missing.js");
    expect(finding?.package).toBe("@comity/alpha");
    expect(finding?.source).toBe("ADR-035");
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("does not contain it");
    expect(finding?.remediation).toBeTruthy();
  });

  it("reports ARCH-PACK-001 for a bin target absent from the tarball", () => {
    const repo = fixture();

    pkg(repo, "alpha", { bin: { "comity-alpha": "./dist/cli.js" } });

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-001"]);
    expect(result.findings[0]?.message).toContain("bin target");
    expect(result.findings[0]?.keyword).toBe("dist/cli.js");
  });

  it("accepts a bin target that is auto-included by the packer", () => {
    const repo = fixture();

    pkg(
      repo,
      "alpha",
      { bin: { "comity-alpha": "./bin/cli.js" } },
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts": "export declare const value: number;\n",
        "bin/cli.js": "#!/usr/bin/env node\n",
      },
    );

    const result = pack(repo);

    expect(result.findings).toEqual([]);
    expect(result.status).toBe("PASS");
  });

  it("reports ARCH-PACK-002 when a reachable declaration is excluded by files", () => {
    const repo = fixture();

    pkg(
      repo,
      "alpha",
      { files: ["dist/index.js", "dist/index.d.ts"] },
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts": 'export * from "./internal/helper.js";\n',
        "dist/internal/helper.d.ts": "export declare const helper: number;\n",
      },
    );

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-002"]);
    expect(result.findings[0]?.keyword).toBe("./internal/helper.js");
    expect(result.findings[0]?.file).toBe("dist/index.d.ts");
    expect(result.findings[0]?.message).toContain("absent from the tarball");
  });

  it("evaluates external references against the packed manifest (ARCH-PACK-003 umbrella)", () => {
    const repo = fixture();

    pkg(
      repo,
      "alpha",
      { devDependencies: { "left-pad": "^1.0.0" } },
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts":
          'import type { Pad } from "left-pad";\nexport declare const value: Pad;\n',
      },
    );

    const result = pack(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-002"]);
    expect(result.findings[0]?.tool).toBe("packed-surface");
    expect(result.findings[0]?.package).toBe("@comity/alpha");
    expect(result.findings[0]?.source).toBe("ADR-035");
    expect(result.reason).toContain("ARCH-PACK-003 umbrella");
  });

  it("reports ARCH-PACK-004 for file: and link: specifiers in the packed manifest", () => {
    const repo = fixture();

    pkg(repo, "alpha", {
      dependencies: { "left-pad": "file:../left-pad" },
      peerDependencies: { "right-pad": "link:../right-pad" },
    });

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-004", "ARCH-PACK-004"]);
    expect(result.findings.map((finding) => finding.keyword).sort()).toEqual([
      "left-pad",
      "right-pad",
    ]);
  });

  it("reports ARCH-PACK-004 for an unrewritten workspace: specifier", () => {
    const findings = packedDependencySpecifierFindings(
      { name: "@comity/alpha", path: "/repo/packages/alpha" },
      {
        dependencies: { "@comity/beta": "workspace:*" },
        peerDependencies: { "@comity/gamma": "workspace:^" },
      },
      new Set(["@comity/beta", "@comity/gamma"]),
    );

    expect(findings.map((finding) => finding.rule)).toEqual([
      "ARCH-PACK-004",
      "ARCH-PACK-004",
    ]);
    expect(findings.map((finding) => finding.keyword)).toEqual([
      "@comity/beta",
      "@comity/gamma",
    ]);
  });

  it("reports ARCH-PACK-005 for an exact sibling pin", () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(repo, "alpha", { dependencies: { "@comity/beta": "0.1.0" } });

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-005"]);
    expect(result.findings[0]?.package).toBe("@comity/alpha");
    expect(result.findings[0]?.keyword).toBe("@comity/beta");
    expect(result.findings[0]?.message).toContain("exact version \"0.1.0\"");
  });

  it("accepts an exact sibling pin with an ADR-033 exception in docs/conventions.md", () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(repo, "alpha", { dependencies: { "@comity/beta": "0.1.0" } });
    writeFile(
      repo.root,
      "packages/alpha/docs/conventions.md",
      "- Exception: `@comity/beta` is pinned exactly because `alpha` consumes its non-exported implementation detail.\n",
    );

    const result = pack(repo);

    expect(result.findings).toEqual([]);
    expect(result.status).toBe("PASS");
  });

  it("reports ARCH-PACK-006 when the tarball ships dist/cjs", () => {
    const repo = fixture();

    pkg(
      repo,
      "alpha",
      {},
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts": "export declare const value: number;\n",
        "dist/cjs/index.cjs": "module.exports = { value: 1 };\n",
      },
    );

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-006"]);
    expect(result.findings[0]?.file).toBe("dist/cjs");
    expect(result.findings[0]?.message).toContain("dist/cjs/");
  });

  it("reports ARCH-PACK-006 when import and require diverge", () => {
    const repo = fixture();

    pkg(
      repo,
      "alpha",
      {
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
            require: "./dist/index.cjs",
          },
        },
      },
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts": "export declare const value: number;\n",
        "dist/index.cjs": "module.exports = { value: 1 };\n",
      },
    );

    const result = pack(repo);

    expect(rules(result)).toEqual(["ARCH-PACK-006"]);
    expect(result.findings[0]?.keyword).toBe(".");
    expect(result.findings[0]?.message).toContain(
      "both must resolve to the same ESM artifact",
    );
  });

  it("reports multiple violations for one package in a stable order", () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(
      repo,
      "alpha",
      {
        dependencies: { "@comity/beta": "0.1.0" },
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
          "./missing": { default: "./dist/missing.js" },
        },
      },
      {
        "dist/index.js": "export const value = 1;\n",
        "dist/index.d.ts": "export declare const value: number;\n",
        "dist/cjs/index.cjs": "module.exports = {};\n",
      },
    );

    const first = pack(repo);
    const second = pack(repo);

    expect(rules(first)).toEqual([
      "ARCH-PACK-001",
      "ARCH-PACK-005",
      "ARCH-PACK-006",
    ]);
    expect(second.findings).toEqual(first.findings);
    expect(first.passed).toBe(false);
  });

  it("returns CONFIGURATION-ERROR and exit code 2 when packing fails", async () => {
    const repo = fixture();

    pkg(repo, "alpha", { scripts: { prepack: "exit 1" } });

    const result = pack(repo);

    expect(result.status).toBe("CONFIGURATION-ERROR");
    expect(result.executed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.reason).toContain("@comity/alpha");

    const run = await runValidation({
      root: repo.root,
      only: "packed-surface",
    });

    expect(exitCodeForResult(run)).toBe(ExitCode.CONFIG_ERROR);
  });

  it("rejects a corrupted tarball", () => {
    const root = mkdtempSync(join(tmpdir(), "comity-pack-test-"));

    roots.push(root);

    const tarball = join(root, "corrupt.tgz");

    writeFileSync(tarball, "this is not a gzip stream");

    expect(() => readTarball(tarball)).toThrow(/Cannot read tarball/);
    expect(() => readTarball(join(root, "missing.tgz"))).toThrow(
      /Cannot read tarball/,
    );
  });

  it("rejects a tarball whose entries are outside the package/ prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "comity-pack-test-"));

    roots.push(root);
    writeFileSync(join(root, "payload.txt"), "x");

    const tarball = join(root, "unprefixed.tgz");
    const tar = spawnSync("tar", ["-czf", tarball, "-C", root, "payload.txt"], {
      encoding: "utf8",
    });

    expect(tar.status).toBe(0);
    expect(() => readTarball(tarball)).toThrow(/package\/.*prefix|prefix/);
  });

  it("runs only when the packed-surface category is selected", async () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(repo, "alpha", { dependencies: { "@comity/beta": "0.1.0" } });

    const skipped = await runValidation({ root: repo.root, only: "declarations" });

    expect(skipped.categories.packedSurface.executed).toBe(false);
    expect(skipped.categories.packedSurface.status).toBe("NOT-RUN");
    expect(skipped.categories.packedSurface.reason).toContain("skipped");

    const selected = await runValidation({
      root: repo.root,
      only: "packed-surface",
    });

    expect(selected.categories.packedSurface.executed).toBe(true);
    expect(selected.categories.packedSurface.status).toBe("FAIL");
    expect(selected.categories.packedSurface.findings).toBe(1);
    expect(selected.violations.map((finding) => finding.rule)).toEqual([
      "ARCH-PACK-005",
    ]);
    expect(exitCodeForResult(selected)).toBe(ExitCode.FAIL);
  });

  it("passes through runValidation when the packed surface is clean", async () => {
    const repo = fixture();

    pkg(repo, "beta");
    pkg(repo, "alpha", { dependencies: { "@comity/beta": "^0.1.0" } });

    const run = await runValidation({
      root: repo.root,
      only: "packed-surface",
    });

    expect(run.categories.packedSurface.status).toBe("PASS");
    expect(run.violations).toEqual([]);
    expect(exitCodeForResult(run)).toBe(ExitCode.PASS);
  });
});
