import type { Repository } from "../../discover.js";

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPublishablePackages } from "../../discover.js";
import { ExitCode } from "../../exit-codes.js";
import { formatSummary, formatViolations } from "../../format.js";
import { exitCodeForResult, runValidation } from "../../run.js";
import { runDeclarationDependencies } from "../declaration-dependencies.js";

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

function fixture(
  files: Record<string, string>,
  config: Record<string, unknown> = {
    repository: { name: "fixture", type: "community" },
    packages: { roots: ["packages"] },
  },
): Repository {
  const root = mkdtempSync(join(tmpdir(), "comity-decl-test-"));

  roots.push(root);

  if (Object.keys(config).length > 0) {
    writeFileSync(join(root, "comity.config.json"), JSON.stringify(config));
  }

  for (const [path, content] of Object.entries(files)) {
    writeFile(root, path, content);
  }

  return {
    root,
    repository: { name: "fixture", type: "community" },
    packageRoots: ["packages"],
    packages: [],
    config,
  };
}

function pkg(
  root: string,
  directory: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): void {
  writeFile(
    root,
    `packages/${directory}/package.json`,
    JSON.stringify({ version: "1.0.0", ...manifest }),
  );

  for (const [path, content] of Object.entries(files)) {
    writeFile(root, `packages/${directory}/${path}`, content);
  }
}

function manifest(
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    types: "./dist/index.d.ts",
    exports: {
      ".": { types: "./dist/index.d.ts" },
    },
    ...overrides,
  };
}

function rules(result: ReturnType<typeof runDeclarationDependencies>): string[] {
  return result.findings.map((finding) => finding.rule);
}

describe("declaration-dependencies", () => {
  it("accepts dependencies, peers, @types mappings, built-ins, and self subpaths", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "positive",
      manifest("@fixture/positive", {
        exports: {
          ".": { types: "./dist/index.d.ts" },
          "./extra": { types: "./dist/extra.d.ts" },
        },
        dependencies: {
          dep: "^1.0.0",
          "@types/foo": "^1.0.0",
          "@types/scope__name": "^1.0.0",
        },
        peerDependencies: { peer: "^1.0.0" },
      }),
      {
        "dist/index.d.ts": [
          'import type { X } from "dep";',
          'import type { P } from "peer";',
          'import type { F } from "foo";',
          'import type { S } from "@scope/name";',
          'import type { Stats } from "node:fs/promises";',
          'import type { E } from "@fixture/positive/extra";',
          "export type { X, P, F, S, Stats, E };",
        ].join("\n"),
        "dist/extra.d.ts": "export type E = string;\n",
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("accepts an optional peer referenced only from an opt-in subpath", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "optional-subpath",
      manifest("@fixture/optional-subpath", {
        exports: {
          ".": { types: "./dist/index.d.ts" },
          "./redis": { types: "./dist/redis.d.ts" },
        },
        peerDependencies: { redis: "^5.0.0" },
        peerDependenciesMeta: { redis: { optional: true } },
      }),
      {
        "dist/index.d.ts": "export type Root = string;\n",
        "dist/redis.d.ts": 'import type { Redis } from "redis";\nexport type R = Redis;\n',
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("ignores unreachable declarations", () => {
    const repo = fixture({});

    pkg(repo.root, "unreachable", manifest("@fixture/unreachable"), {
      "dist/index.d.ts": "export type Root = string;\n",
      "dist/stray.d.ts": 'import type { X } from "undeclared";\nexport type S = X;\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("does not treat script-file ambient modules as dependencies", () => {
    const repo = fixture({});

    pkg(repo.root, "ambient", manifest("@fixture/ambient"), {
      "dist/index.d.ts": 'declare module "m" { export const x: string; }\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("follows relative cycles without reporting them", () => {
    const repo = fixture({});

    pkg(repo.root, "cycle", manifest("@fixture/cycle"), {
      "dist/index.d.ts": 'export type { A } from "./a.js";\n',
      "dist/a.d.ts": 'export type { Root } from "./index.js";\nexport type A = string;\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("matches wildcard export patterns for self-references", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "wildcard",
      manifest("@fixture/wildcard", {
        exports: {
          ".": { types: "./dist/index.d.ts" },
          "./*": { types: "./dist/*.d.ts" },
        },
      }),
      {
        "dist/index.d.ts": 'import type { X } from "@fixture/wildcard/foo";\nexport type { X };\n',
        "dist/foo.d.ts": "export type X = string;\n",
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
  });

  it("reports a dev-only declaration reference", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "dev-only",
      manifest("@fixture/dev-only", {
        devDependencies: { devdep: "^1.0.0" },
      }),
      {
        "dist/index.d.ts": 'import type { X } from "devdep";\nexport type { X };\n',
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-002"]);
  });

  it("reports an undeclared import type node", () => {
    const repo = fixture({});

    pkg(repo.root, "import-type", manifest("@fixture/import-type"), {
      "dist/index.d.ts": 'export type X = import("x").T;\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-001"]);
  });

  it("reports a module augmentation in a module file", () => {
    const repo = fixture({});

    pkg(repo.root, "augmentation", manifest("@fixture/augmentation"), {
      "dist/index.d.ts": 'export {};\ndeclare module "x" { interface Y { y: string; } }\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-001"]);
  });

  it("reports a reference-types directive", () => {
    const repo = fixture({});

    pkg(repo.root, "reference-types", manifest("@fixture/reference-types"), {
      "dist/index.d.ts": '/// <reference types="x" />\nexport {};\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-001"]);
  });

  it("reports an optional peer reachable from the root entry", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "optional-root",
      manifest("@fixture/optional-root", {
        peerDependencies: { redis: "^5.0.0" },
        peerDependenciesMeta: { redis: { optional: true } },
      }),
      {
        "dist/index.d.ts": 'import type { Redis } from "redis";\nexport type { Redis };\n',
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-003"]);
  });

  it("reports a self-reference to a non-exported subpath", () => {
    const repo = fixture({});

    pkg(repo.root, "self", manifest("@fixture/self"), {
      "dist/index.d.ts": 'import type { X } from "@fixture/self/nope";\nexport type { X };\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-004"]);
  });

  it("reports a sibling subpath that the sibling does not export", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "sibling-a",
      manifest("@fixture/sibling-a", {
        dependencies: { "@fixture/sibling-b": "^1.0.0" },
      }),
      {
        "dist/index.d.ts": 'import type { X } from "@fixture/sibling-b/nope";\nexport type { X };\n',
      },
    );
    pkg(repo.root, "sibling-b", manifest("@fixture/sibling-b"), {
      "dist/index.d.ts": "export type X = string;\n",
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-005"]);
  });

  it("reports an unresolvable relative reference", () => {
    const repo = fixture({});

    pkg(repo.root, "broken", manifest("@fixture/broken"), {
      "dist/index.d.ts": 'import type { X } from "./missing.js";\nexport type { X };\n',
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-000"]);
  });

  it("does not treat optionalDependencies as satisfying a reference", () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "optional-dep",
      manifest("@fixture/optional-dep", {
        optionalDependencies: { opt: "^1.0.0" },
      }),
      {
        "dist/index.d.ts": 'import type { X } from "opt";\nexport type { X };\n',
      },
    );

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("FAIL");
    expect(rules(result)).toEqual(["ARCH-DECL-DEP-001"]);
    expect(result.findings[0]?.message).toContain("optionalDependencies");
  });

  it("reports a missing declared types target as CONFIGURATION-ERROR", async () => {
    const repo = fixture({});

    pkg(
      repo.root,
      "missing-build",
      manifest("@fixture/missing-build", {
        types: "./dist/missing.d.ts",
        exports: { ".": { types: "./dist/missing.d.ts" } },
      }),
      {
        "dist/index.d.ts": "export type Root = string;\n",
      },
    );

    const direct = runDeclarationDependencies(repo);
    const result = await runValidation({ root: repo.root, only: "declarations" });

    expect(direct.status).toBe("CONFIGURATION-ERROR");
    expect(direct.findings).toEqual([]);
    expect(result.categories.declarations.status).toBe("CONFIGURATION-ERROR");
    expect(exitCodeForResult(result)).toBe(ExitCode.CONFIG_ERROR);
  });

  it("discovers arbitrary package namespaces", () => {
    const repo = fixture({});

    pkg(repo.root, "arbitrary", manifest("acme-thing"), {
      "dist/index.d.ts": "export type Root = string;\n",
    });

    const discovery = discoverPublishablePackages(repo.root);

    expect(discovery.publishable.map((pkg) => pkg.name)).toEqual(["acme-thing"]);
  });

  it("reports CONFIGURATION-ERROR when roots contain no package", () => {
    const repo = fixture({});

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("CONFIGURATION-ERROR");
    expect(result.reason).toContain("packages");
  });

  it("reports NOT-APPLICABLE and lists all-private packages", () => {
    const repo = fixture({});

    pkg(repo.root, "private", manifest("@fixture/private", { private: true }), {
      "dist/index.d.ts": "export type Root = string;\n",
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("NOT-APPLICABLE");
    expect(result.reason).toContain("@fixture/private");
  });

  it("records excluded private packages on a passing discovery", () => {
    const repo = fixture({});

    pkg(repo.root, "public", manifest("@fixture/public"), {
      "dist/index.d.ts": "export type Root = string;\n",
    });
    pkg(repo.root, "private", manifest("@fixture/private", { private: true }), {
      "dist/index.d.ts": "export type Root = string;\n",
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.reason).toContain("@fixture/private (private package)");
  });

  it("states when the default package root was used", () => {
    const repo = fixture({}, {});

    pkg(repo.root, "default-root", manifest("@fixture/default-root"), {
      "dist/index.d.ts": "export type Root = string;\n",
    });

    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.reason).toContain("default package root was used");
  });

  it("produces deterministic sorted findings", () => {
    const repo = fixture({});

    pkg(repo.root, "determinism", manifest("@fixture/determinism"), {
      "dist/index.d.ts": [
        'import type { Z } from "z-package";',
        'import type { A } from "a-package";',
        "export type { Z, A };",
      ].join("\n"),
    });

    const first = runDeclarationDependencies(repo);
    const second = runDeclarationDependencies(repo);

    expect(first.findings).toEqual(second.findings);
    expect(first.findings.map((finding) => finding.keyword)).toEqual([
      "a-package",
      "z-package",
    ]);
  });

  it("integrates with runValidation and maps a finding to exit 1", async () => {
    const repo = fixture({});

    pkg(repo.root, "integration", manifest("@fixture/integration"), {
      "dist/index.d.ts": 'import type { X } from "missing";\nexport type { X };\n',
    });

    const result = await runValidation({
      root: repo.root,
      only: "declaration-dependencies",
    });

    expect(result.categories.declarations.status).toBe("FAIL");
    expect(exitCodeForResult(result)).toBe(ExitCode.FAIL);
  });

  it("keeps declarations findings when another engine has a configuration error", async () => {
    const repo = fixture({});

    pkg(repo.root, "mixed", manifest("@fixture/mixed"), {
      "dist/index.d.ts": 'import type { X } from "missing";\nexport type { X };\n',
    });

    const previous = process.env["COMITY_SEMGREP_TIMEOUT_MS"];

    process.env["COMITY_SEMGREP_TIMEOUT_MS"] = "0";

    try {
      const result = await runValidation({ root: repo.root });

      expect(result.categories.declarations.status).toBe("FAIL");
      expect(result.categories.semgrep.status).toBe("CONFIGURATION-ERROR");
      expect(result.violations.map((finding) => finding.rule)).toContain(
        "ARCH-DECL-DEP-001",
      );
      expect(exitCodeForResult(result)).toBe(ExitCode.CONFIG_ERROR);
      expect(formatSummary(result)).toContain("CONFIG-ERROR");
      expect(formatViolations(result.violations)).toContain(
        "ARCH-DECL-DEP-001",
      );
    } finally {
      if (previous === undefined) delete process.env["COMITY_SEMGREP_TIMEOUT_MS"];
      else process.env["COMITY_SEMGREP_TIMEOUT_MS"] = previous;
    }
  });

  it("reproduces the zero-finding Community regression when the build is present", () => {
    const communityRoot = resolve(process.cwd(), "../../../community");
    const built = existsSync(join(communityRoot, "packages/order/dist/index.d.ts"));

    if (!built) {
      return;
    }

    const repo: Repository = {
      root: communityRoot,
      repository: { name: "community", type: "community" },
      packageRoots: ["packages"],
      packages: [],
      config: {},
    };
    const result = runDeclarationDependencies(repo);

    expect(result.status).toBe("PASS");
    expect(result.findings).toEqual([]);
    expect(result.reason).toContain("54 publishable package(s)");
    expect(result.reason).toContain("537 declaration file(s)");
  });
});
