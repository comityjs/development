import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runValidation } from "../../run.js";

/**
 * End-to-end tests of the `dependencies` category for INSTALLED Comity
 * packages: real `@comity-dev/validate` entry point, real dependency-cruiser,
 * real `node_modules` layouts with real `exports` maps.
 *
 * They cover both defect classes:
 *  - false positives: allowed subpath imports (`@comity/primitives/result`)
 *    stayed unresolved and were matched by the catch-all pattern;
 *  - false negatives: a forbidden package that resolved into `node_modules`
 *    matched no rule at all.
 */

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Exports = Record<string, { types: string; default: string }>;

interface Installed {
  name: string;
  version?: string;
  /** Raw `comity` manifest value; omitted when `undefined`. */
  comity?: unknown;
  exports?: Exports;
  /** Files below the package root. Defaults to every export target. */
  files?: Record<string, string>;
  /** Store the package pnpm-style and symlink it into each consumer. */
  pnpm?: boolean;
  /** Restrict the pnpm symlinks to these workspace directory names. */
  linkTo?: string[];
}

interface Workspace {
  name: string;
  layer: string;
  /** Production source files, relative to the package directory. */
  files: Record<string, string>;
  /** Declared Comity dependencies (name → version), as peer + dev deps. */
  deps?: Record<string, string>;
  /** Extra package.json fields (e.g. exports of a workspace package). */
  manifest?: Record<string, unknown>;
  /** Link the workspace package into the root node_modules, as pnpm does. */
  link?: boolean;
}

function subpathExports(...subpaths: string[]): Exports {
  const out: Exports = {
    ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  };

  for (const s of subpaths) {
    out[`./${s}`] = {
      types: `./dist/${s}/index.d.ts`,
      default: `./dist/${s}/index.js`,
    };
  }

  return out;
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "comity-installed-"));

  dirs.push(root);

  return root;
}

function installPackage(
  root: string,
  consumers: string[],
  pkg: Installed,
): void {
  const version = pkg.version ?? "1.0.0";
  const exportsMap = pkg.exports ?? subpathExports();
  const storeDir = pkg.pnpm
    ? join(
        root,
        "node_modules",
        ".pnpm",
        `${pkg.name.replace("/", "+")}@${version}`,
        "node_modules",
        pkg.name,
      )
    : join(root, "node_modules", pkg.name);

  write(
    join(storeDir, "package.json"),
    JSON.stringify({
      name: pkg.name,
      version,
      type: "module",
      // published Comity packages declare `main`/`types` next to `exports`, which
      // is why a root import resolved into node_modules even without exports support
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      ...(pkg.comity === undefined ? {} : { comity: pkg.comity }),
      exports: exportsMap,
    }),
  );

  const files =
    pkg.files ??
    Object.fromEntries(
      Object.values(exportsMap).flatMap((t) => [
        [t.types.slice(2), "export {};\n"],
        [t.default.slice(2), "export {};\n"],
      ]),
    );

  for (const [f, c] of Object.entries(files)) write(join(storeDir, f), c);

  if (pkg.pnpm) {
    for (const consumer of consumers.filter(
      (c) => pkg.linkTo === undefined || pkg.linkTo.includes(basename(c)),
    )) {
      const link = join(consumer, "node_modules", pkg.name);

      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(storeDir, link);
    }
  }
}

interface FixtureOptions {
  workspaces: Workspace[];
  installed: Installed[];
}

function fixture({ workspaces, installed }: FixtureOptions): string {
  const root = scratch();

  write(
    join(root, "comity.config.json"),
    JSON.stringify({
      repository: { name: "fx", type: "enterprise" },
      packages: { roots: ["packages"] },
    }),
  );
  write(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "esnext", moduleResolution: "bundler" },
    }),
  );

  const consumerDirs: string[] = [];

  for (const w of workspaces) {
    const dir = join(root, "packages", w.name.replace(/^@[^/]+\//, ""));

    consumerDirs.push(dir);
    write(
      join(dir, "package.json"),
      JSON.stringify({
        name: w.name,
        version: "0.0.0",
        type: "module",
        comity: { layer: w.layer },
        peerDependencies: w.deps ?? {},
        devDependencies: w.deps ?? {},
        ...w.manifest,
      }),
    );

    for (const [f, c] of Object.entries(w.files)) write(join(dir, f), c);

    if (w.link) {
      mkdirSync(join(root, "node_modules", dirname(w.name)), { recursive: true });
      symlinkSync(dir, join(root, "node_modules", w.name));
    }
  }

  for (const pkg of installed) installPackage(root, consumerDirs, pkg);

  return root;
}

const PRIMITIVES: Installed = {
  name: "@comity/primitives",
  comity: { layer: "primitives" },
  exports: subpathExports("errors", "result", "time"),
};

const COMPOSITION: Installed = {
  name: "@comity/composition",
  comity: { layer: "composition" },
  exports: subpathExports("setup"),
};

const SQL: Installed = {
  name: "@comity/sql",
  comity: { layer: "core" },
  exports: subpathExports("errors"),
};

const SQL_KYSELY: Installed = {
  name: "@comity/sql-kysely",
  comity: { layer: "technology-adapter", implements: "@comity/sql" },
  exports: subpathExports("driver"),
};

const STOREFRONT: Installed = {
  name: "@comity/storefront-shop",
  comity: { layer: "integration-adapter" },
};

const ALL_DEPS = {
  "@comity/primitives": "1.0.0",
  "@comity/composition": "1.0.0",
};

const core = (
  files: Record<string, string>,
  deps: Record<string, string> = ALL_DEPS,
): Workspace => ({
  name: "@comity/entitlement",
  layer: "core",
  files,
  deps,
});

async function run(root: string) {
  const result = await runValidation({ root, only: "dependencies" });

  return {
    result,
    category: result.categories.dependencies,
    violations: result.violations,
  };
}

const IMPORTS_ALLOWED = {
  "src/a.ts": [
    'import { a } from "@comity/primitives";',
    'import { b } from "@comity/primitives/errors";',
    'import { c } from "@comity/primitives/result";',
    'import { d } from "@comity/primitives/time";',
    'import { e } from "@comity/composition";',
    'import { f } from "@comity/composition/setup";',
    "export const all = [a, b, c, d, e, f];",
  ].join("\n"),
  "src/types.ts": [
    'import type { A } from "@comity/primitives/result";',
    'import type { S } from "@comity/composition/setup";',
    "export type T = [A, S];",
  ].join("\n"),
};

describe("A. allowed dependencies of a Core Module (installed packages)", () => {
  for (const layout of ["hoisted", "pnpm"] as const) {
    it(`primitives/composition roots and subpaths, value and type imports (${layout} layout) → PASS`, async () => {
      const pnpm = layout === "pnpm";
      const root = fixture({
        workspaces: [core(IMPORTS_ALLOWED)],
        installed: [
          { ...PRIMITIVES, pnpm },
          { ...COMPOSITION, pnpm },
        ],
      });
      const { category, violations } = await run(root);

      expect(violations).toEqual([]);
      expect(category).toMatchObject({ status: "PASS", findings: 0 });
    });
  }

  it("a Core Module importing another installed Core Module is not restricted by this rule (ADR-008 owns Core → Core)", async () => {
    const root = fixture({
      workspaces: [
        core(
          { "src/a.ts": 'import { s } from "@comity/sql"; export const x = s;' },
          { ...ALL_DEPS, "@comity/sql": "1.0.0" },
        ),
      ],
      installed: [PRIMITIVES, COMPOSITION, SQL],
    });
    const { category, violations } = await run(root);

    expect(violations).toEqual([]);
    expect(category).toMatchObject({ status: "PASS" });
  });
});

describe("B. forbidden dependencies — root imports of installed packages", () => {
  const cases: Array<[string, Installed, string]> = [
    [
      "technology adapter @comity/sql-kysely",
      SQL_KYSELY,
      "DEP-contracts-never-depend-on-adapters",
    ],
    [
      "integration adapter @comity/storefront-shop",
      STOREFRONT,
      "DEP-contracts-never-depend-on-adapters",
    ],
  ];

  for (const [label, pkg, rule] of cases) {
    it(`Core → ${label} → FAIL (${rule})`, async () => {
      const root = fixture({
        workspaces: [
          core(
            { "src/a.ts": `import { x } from "${pkg.name}"; export { x };` },
            { ...ALL_DEPS, [pkg.name]: "1.0.0" },
          ),
        ],
        installed: [PRIMITIVES, COMPOSITION, pkg],
      });
      const { category, violations } = await run(root);

      expect(category).toMatchObject({ status: "FAIL" });
      expect(violations.map((v) => v.rule)).toContain(rule);
      expect(violations.some((v) => v.message.includes(pkg.name))).toBe(true);
    });
  }

  it("Core → installed dev-tooling package is forbidden by the Core rule", async () => {
    const root = fixture({
      workspaces: [
        core(
          { "src/a.ts": 'import { v } from "@comity-dev/validate"; export { v };' },
          { ...ALL_DEPS, "@comity-dev/validate": "1.0.0" },
        ),
      ],
      installed: [
        PRIMITIVES,
        COMPOSITION,
        { name: "@comity-dev/validate", comity: { layer: "dev-tooling" } },
      ],
    });
    const { violations } = await run(root);

    expect(violations.map((v) => v.rule)).toContain(
      "DEP-core-only-kernel-primitives-or-core-peer",
    );
  });

  it("Kernel → installed Core Module (@comity/sql) is forbidden", async () => {
    const root = fixture({
      workspaces: [
        {
          name: "@comity/kernel",
          layer: "kernel",
          files: { "src/a.ts": 'import { s } from "@comity/sql"; export { s };' },
          deps: { "@comity/primitives": "1.0.0", "@comity/sql": "1.0.0" },
        },
        // a workspace Core Module makes the kernel-no-core rule applicable
        core({ "src/a.ts": "export const z = 1;" }),
      ],
      installed: [PRIMITIVES, COMPOSITION, SQL],
    });
    const { violations } = await run(root);

    expect(violations.map((v) => v.rule)).toContain(
      "DEP-kernel-only-primitives",
    );
  });
});

describe("C. forbidden dependencies — subpath imports of installed packages", () => {
  it("Core → @comity/sql-kysely/driver (a real exported subpath) → FAIL", async () => {
    const root = fixture({
      workspaces: [
        core(
          {
            "src/a.ts":
              'import { d } from "@comity/sql-kysely/driver"; export { d };',
          },
          { ...ALL_DEPS, "@comity/sql-kysely": "1.0.0" },
        ),
      ],
      installed: [PRIMITIVES, COMPOSITION, SQL_KYSELY],
    });
    const { category, violations } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.rule)).toContain(
      "DEP-contracts-never-depend-on-adapters",
    );
  });
});

describe("D. workspace packages keep their behaviour", () => {
  it("a workspace Core Module importing workspace primitives through an exports-mapped subpath → PASS", async () => {
    const root = fixture({
      workspaces: [
        {
          name: "@comity/primitives",
          layer: "primitives",
          link: true,
          files: {
            "src/index.ts": "export const p = 1;",
            "dist/index.js": "export const p = 1;",
            "dist/index.d.ts": "export declare const p: number;",
            "dist/result/index.js": "export const r = 1;",
            "dist/result/index.d.ts": "export declare const r: number;",
          },
          manifest: {
            exports: subpathExports("result"),
            peerDependencies: {},
            devDependencies: {},
          },
        },
        core(
          { "src/a.ts": 'import { r } from "@comity/primitives/result"; export { r };' },
          { "@comity/primitives": "1.0.0" },
        ),
      ],
      installed: [],
    });
    const { category, violations } = await run(root);

    expect(violations).toEqual([]);
    expect(category).toMatchObject({ status: "PASS" });
  });

  it("a workspace package wins over an installed copy of the same name", async () => {
    const root = fixture({
      workspaces: [
        {
          name: "@comity/primitives",
          layer: "primitives",
          files: { "src/index.ts": "export const p = 1;" },
        },
        core({ "src/a.ts": "export const z = 1;" }),
      ],
      installed: [
        // installed copy claims to be an adapter; the workspace layer governs
        { ...PRIMITIVES, comity: { layer: "technology-adapter" } },
      ],
    });
    const { category, violations } = await run(root);

    expect(violations).toEqual([]);
    expect(category).toMatchObject({ status: "PASS" });
  });
});

describe("E. unknown, unclassified and malformed Comity packages never pass silently", () => {
  const withImport = (
    installed: Installed[],
    spec: string,
    extraDeps: Record<string, string> = {},
  ): string =>
    fixture({
      workspaces: [
        core(
          { "src/a.ts": `import { x } from "${spec}"; export { x };` },
          { ...ALL_DEPS, ...extraDeps },
        ),
      ],
      installed: [PRIMITIVES, COMPOSITION, ...installed],
    });

  it("installed package without comity.layer → FAIL with a classification diagnostic", async () => {
    const root = withImport(
      [{ name: "@comity/mystery", comity: undefined }],
      "@comity/mystery",
      { "@comity/mystery": "1.0.0" },
    );
    const { category, violations } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.message).join("\n")).toMatch(
      /@comity\/mystery[^\n]*(no `?comity\.layer`?|not classified|unclassified)/i,
    );
  });

  it("installed package with an invalid layer value → FAIL naming the value", async () => {
    const root = withImport(
      [{ name: "@comity/odd", comity: { layer: "banana" } }],
      "@comity/odd",
      { "@comity/odd": "1.0.0" },
    );
    const { category, violations } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.message).join("\n")).toContain("banana");
  });

  it("a runtime package declaring dev-tooling (scope ↔ layer boundary) is invalid → FAIL", async () => {
    const root = withImport(
      [{ name: "@comity/sneaky", comity: { layer: "dev-tooling" } }],
      "@comity/sneaky",
      { "@comity/sneaky": "1.0.0" },
    );
    const { category } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
  });

  it("two workspace packages resolving installed copies that declare different layers → FAIL (conflicting)", async () => {
    const root = fixture({
      workspaces: [
        core(
          { "src/a.ts": 'import { x } from "@comity/split"; export { x };' },
          { ...ALL_DEPS, "@comity/split": "1.0.0" },
        ),
        {
          name: "@comity/fulfillment",
          layer: "core",
          files: { "src/a.ts": 'import { x } from "@comity/split"; export { x };' },
          deps: { ...ALL_DEPS, "@comity/split": "2.0.0" },
        },
      ],
      installed: [
        PRIMITIVES,
        COMPOSITION,
        {
          name: "@comity/split",
          comity: { layer: "core" },
          version: "1.0.0",
          pnpm: true,
          linkTo: ["entitlement"],
        },
        {
          name: "@comity/split",
          comity: { layer: "technology-adapter" },
          version: "2.0.0",
          pnpm: true,
          linkTo: ["fulfillment"],
        },
      ],
    });
    const { category, violations } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.message).join("\n")).toMatch(
      /conflicting layers \(1\.0\.0: core, 2\.0\.0: technology-adapter\)/,
    );
  });

  it("an unknown Comity package that is not installed or declared → FAIL, with the reason", async () => {
    const { category, violations } = await run(
      withImport([], "@comity/never-installed"),
    );

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.message).join("\n")).toContain(
      "@comity/never-installed is not classified: it could not be resolved and is not declared as a dependency of any workspace package",
    );
  });

  it("a declared but not installed Comity package → FAIL, with the reason", async () => {
    const { category, violations } = await run(
      withImport([], "@comity/declared-only", { "@comity/declared-only": "1.0.0" }),
    );

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.message).join("\n")).toContain(
      "is declared as a dependency but is not installed",
    );
  });

  it("an UNEXPORTED subpath of an otherwise allowed package → FAIL (does not silently become valid)", async () => {
    const { category, violations } = await run(
      withImport([], "@comity/primitives/hidden-internal"),
    );

    expect(category).toMatchObject({ status: "FAIL" });
    expect(violations.map((v) => v.rule)).toContain(
      "DEP-comity-import-must-resolve",
    );
  });

  it("an installed package with a malformed exports field resolves to nothing → FAIL", async () => {
    const root = withImport(
      [
        {
          name: "@comity/broken",
          comity: { layer: "core" },
          exports: { ".": { types: "./dist/missing.d.ts", default: "./dist/missing.js" } },
          files: { "unrelated.txt": "" },
        },
      ],
      "@comity/broken",
      { "@comity/broken": "1.0.0" },
    );
    const { category } = await run(root);

    expect(category).toMatchObject({ status: "FAIL" });
  });
});

describe("F. regression: the Commerce false-positive pattern", () => {
  it("many Core files consuming primitives and composition through published-style subpath exports → zero findings", async () => {
    const files: Record<string, string> = {};

    for (let i = 0; i < 12; i += 1) {
      files[`src/f${i}.ts`] = [
        'import { ok } from "@comity/primitives/result";',
        'import { BaseError } from "@comity/primitives/errors";',
        'import { now } from "@comity/primitives/time";',
        'import type { Setup } from "@comity/composition/setup";',
        `export const v${i} = [ok, BaseError, now] as const;`,
        `export type S${i} = Setup;`,
      ].join("\n");
    }

    const root = fixture({
      workspaces: [core(files)],
      installed: [
        { ...PRIMITIVES, pnpm: true },
        { ...COMPOSITION, pnpm: true },
      ],
    });
    const { result, category, violations } = await run(root);

    expect(violations).toEqual([]);
    expect(category).toMatchObject({ status: "PASS", findings: 0 });
    expect(result.passed).toBe(true);
  });

  it("the same Core Module plus ONE forbidden adapter import fails on exactly that import", async () => {
    const files: Record<string, string> = {
      "src/ok.ts": [
        'import { ok } from "@comity/primitives/result";',
        'import type { Setup } from "@comity/composition/setup";',
        "export const v = ok; export type S = Setup;",
      ].join("\n"),
      "src/bad.ts": 'import { k } from "@comity/sql-kysely"; export { k };',
    };
    const root = fixture({
      workspaces: [core(files, { ...ALL_DEPS, "@comity/sql-kysely": "1.0.0" })],
      installed: [
        { ...PRIMITIVES, pnpm: true },
        { ...COMPOSITION, pnpm: true },
        { ...SQL_KYSELY, pnpm: true },
      ],
    });
    const { violations } = await run(root);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.file?.endsWith("src/bad.ts"))).toBe(true);
  });
});

// ── G. test-only sibling-adapter exception ─────────────────────────────

const SQL_DRIZZLE: Installed = {
  name: "@comity/sql-drizzle",
  comity: { layer: "technology-adapter", implements: "@comity/sql" },
};

type DepField = "devDependencies" | "peerDependencies" | "dependencies";

interface AdapterOptions {
  /** Files of the adapter under test, relative to its directory. */
  files: Record<string, string>;
  /** Which manifest field declares each installed adapter. */
  declared: Partial<Record<DepField, string[]>>;
  installed?: Installed[];
  extraWorkspaces?: Workspace[];
}

const imp = (name: string): string =>
  `import { x } from "${name}"; export { x };\n`;

function adapterFixture({
  files,
  declared,
  installed = [SQL_KYSELY, SQL_DRIZZLE],
  extraWorkspaces = [],
}: AdapterOptions): string {
  const field = (f: DepField): Record<string, string> =>
    Object.fromEntries((declared[f] ?? []).map((n) => [n, "1.0.0"]));

  return fixture({
    workspaces: [
      {
        name: "@comity/order-sql",
        layer: "technology-adapter",
        files,
        manifest: {
          dependencies: field("dependencies"),
          devDependencies: field("devDependencies"),
          peerDependencies: field("peerDependencies"),
        },
      },
      ...extraWorkspaces,
    ],
    installed,
  });
}

describe("G. test-only exception of no-cross-adapter-deps (installed adapters declared in devDependencies)", () => {
  const KYSELY = "@comity/sql-kysely";
  const both = { devDependencies: [KYSELY], peerDependencies: [KYSELY] };
  const rules = (v: Array<{ rule: string }>): string[] => v.map((x) => x.rule);

  it("production source importing an installed sibling adapter → FAIL", async () => {
    const { violations } = await run(
      adapterFixture({ files: { "src/repo.ts": imp(KYSELY) }, declared: both }),
    );

    expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
  });

  it("production source importing an adapter declared ONLY in devDependencies → FAIL", async () => {
    const { violations } = await run(
      adapterFixture({
        files: { "src/repo.ts": imp(KYSELY) },
        declared: { devDependencies: [KYSELY] },
      }),
    );

    expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
  });

  it.each([
    ["a __tests__ directory", "src/__tests__/kysely.test.ts"],
    ["a __tests__ helper that is not itself a *.test file", "src/dialects/pg/__tests__/harness.ts"],
    ["a *.test.ts file outside __tests__", "src/dialects/pg/kysely.test.ts"],
    ["a *.spec.mts file", "src/kysely.spec.mts"],
  ])("test source (%s) importing an installed adapter declared in devDependencies → PASS", async (_n, file) => {
    const { category, violations } = await run(
      adapterFixture({
        files: { "src/repo.ts": "export const r = 1;\n", [file]: imp(KYSELY) },
        declared: both,
      }),
    );

    expect(violations).toEqual([]);
    expect(category).toMatchObject({ status: "PASS" });
  });

  it("the exception is per file: the same adapter imported from production AND a test fails only for production", async () => {
    const { violations } = await run(
      adapterFixture({
        files: {
          "src/repo.ts": imp(KYSELY),
          "src/__tests__/kysely.test.ts": imp(KYSELY),
        },
        declared: both,
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("packages/order-sql/src/repo.ts");
  });

  it.each([
    ["only a peerDependency", { peerDependencies: [KYSELY] }],
    ["only a regular dependency", { dependencies: [KYSELY] }],
  ] as Array<[string, AdapterOptions["declared"]]>)(
    "test source importing an installed adapter declared as %s (not in devDependencies) → FAIL",
    async (_n, declared) => {
      const { violations } = await run(
        adapterFixture({
          files: { "src/__tests__/kysely.test.ts": imp(KYSELY) },
          declared,
        }),
      );

      expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
    },
  );

  it("the devDependency exemption is per package, not blanket: an unrelated adapter that is not a devDependency still fails", async () => {
    const { violations } = await run(
      adapterFixture({
        files: {
          "src/__tests__/a.test.ts": imp(KYSELY),
          "src/__tests__/b.test.ts": imp("@comity/sql-drizzle"),
        },
        declared: { ...both, peerDependencies: [KYSELY, "@comity/sql-drizzle"] },
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("sql-drizzle");
    expect(violations[0]?.file).toBe("packages/order-sql/src/__tests__/b.test.ts");
  });

  it("a test file importing an installed INTEGRATION adapter that is a devDependency is still allowed only for technology-adapter sources (integration source is not exempt)", async () => {
    const { violations } = await run(
      fixture({
        workspaces: [
          {
            name: "@comity/shop-a",
            layer: "integration-adapter",
            files: { "src/__tests__/a.test.ts": imp("@comity/storefront-shop") },
            manifest: { devDependencies: { "@comity/storefront-shop": "1.0.0" } },
          },
        ],
        installed: [STOREFRONT],
      }),
    );

    expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
  });

  it("workspace adapters are unchanged: a test file importing a workspace sibling adapter declared in devDependencies still fails", async () => {
    const sibling: Workspace = {
      name: "@comity/cache-kv",
      layer: "technology-adapter",
      link: true,
      files: { "src/index.ts": "export const x = 1;\n" },
      manifest: { main: "./src/index.ts" },
    };
    const root = adapterFixture({
      files: { "src/__tests__/a.test.ts": imp("@comity/cache-kv") },
      declared: { devDependencies: ["@comity/cache-kv"] },
      installed: [],
      extraWorkspaces: [sibling],
    });
    const { violations } = await run(root);

    expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
  });

  it("workspace adapters are unchanged: a production file importing a workspace sibling adapter still fails", async () => {
    const sibling: Workspace = {
      name: "@comity/cache-kv",
      layer: "technology-adapter",
      link: true,
      files: { "src/index.ts": "export const x = 1;\n" },
      manifest: { main: "./src/index.ts" },
    };
    const { violations } = await run(
      adapterFixture({
        files: { "src/repo.ts": imp("@comity/cache-kv") },
        declared: { devDependencies: ["@comity/cache-kv"] },
        installed: [],
        extraWorkspaces: [sibling],
      }),
    );

    expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
  });
});

describe("G2. Core-to-Core semantics are unchanged; Core → adapter stays forbidden", () => {
  it("Core importing @comity/sql (a Core Module) → PASS", async () => {
    const { violations } = await run(
      fixture({
        workspaces: [
          core({ "src/a.ts": imp("@comity/sql") }, {
            ...ALL_DEPS,
            "@comity/sql": "1.0.0",
          }),
        ],
        installed: [PRIMITIVES, COMPOSITION, SQL],
      }),
    );

    expect(violations).toEqual([]);
  });

  it("Core importing @comity/sql-kysely (a technology adapter) → FAIL, also from a test file", async () => {
    const { violations } = await run(
      fixture({
        workspaces: [
          {
            ...core(
              {
                "src/a.ts": imp("@comity/sql-kysely"),
                "src/__tests__/a.test.ts": imp("@comity/sql-kysely"),
              },
              { ...ALL_DEPS },
            ),
            manifest: { devDependencies: { "@comity/sql-kysely": "1.0.0" } },
          },
        ],
        installed: [PRIMITIVES, COMPOSITION, SQL_KYSELY],
      }),
    );

    expect([...new Set(violations.map((v) => v.file))].sort()).toEqual([
      "packages/entitlement/src/__tests__/a.test.ts",
      "packages/entitlement/src/a.ts",
    ]);
    expect(violations.map((v) => v.rule)).toContain(
      "DEP-contracts-never-depend-on-adapters",
    );
  });
});

// ── H. every Comity import of an adapter is classified or rejected ─────

describe("H. adapter sources: Comity imports are classified or rejected, never silently accepted", () => {
  const rules = (v: Array<{ rule: string }>): string[] => v.map((x) => x.rule);
  const messages = (v: Array<{ message: string }>): string =>
    v.map((x) => x.message).join("\n");

  /** A technology adapter whose only declared dependencies are `declared`. */
  const techAdapter = (
    files: Record<string, string>,
    declared: string[],
    installed: Installed[],
    extra: Workspace[] = [],
  ): string =>
    fixture({
      workspaces: [
        {
          name: "@comity/order-sql",
          layer: "technology-adapter",
          files,
          manifest: {
            peerDependencies: Object.fromEntries(declared.map((d) => [d, "1.0.0"])),
            devDependencies: Object.fromEntries(declared.map((d) => [d, "1.0.0"])),
          },
        },
        ...extra,
      ],
      installed,
    });

  const UNDECLARED_CORE: Installed = {
    name: "@comity/billing",
    comity: { layer: "core" },
  };

  describe("undeclared installed Comity package (resolvable, correctly classified in its own manifest)", () => {
    it("technology adapter, production source, hoisted layout → FAIL with an undeclared diagnostic", async () => {
      const root = techAdapter(
        { "src/repo.ts": imp("@comity/billing") },
        [],
        [UNDECLARED_CORE],
      );
      const { category, violations } = await run(root);

      expect(category).toMatchObject({ status: "FAIL" });
      expect(rules(violations)).toContain("DEP-comity-package-must-be-classified");
      expect(messages(violations)).toMatch(
        /@comity\/billing is not classified: it is installed \(version 1\.0\.0, layer "core"\) but not declared as a dependency of any workspace package/,
      );
    });

    it("technology adapter, test source → FAIL (the devDependency exception needs a declaration)", async () => {
      const { violations } = await run(
        techAdapter(
          { "src/__tests__/a.test.ts": imp("@comity/billing") },
          [],
          [UNDECLARED_CORE],
        ),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
    });

    it("undeclared installed ADAPTER imported from an adapter test → FAIL", async () => {
      const { violations } = await run(
        techAdapter(
          { "src/__tests__/a.test.ts": imp("@comity/sql-kysely") },
          [],
          [SQL_KYSELY],
        ),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
    });

    it("integration adapter → FAIL", async () => {
      const { violations } = await run(
        fixture({
          workspaces: [
            {
              name: "@comity/shop-a",
              layer: "integration-adapter",
              files: { "src/repo.ts": imp("@comity/billing") },
            },
          ],
          installed: [UNDECLARED_CORE],
        }),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
    });

    it("transitive only: nested below a declared package, so it does not even resolve from the adapter → FAIL, never treated as declared", async () => {
      const root = techAdapter(
        { "src/repo.ts": imp("@comity/billing") },
        ["@comity/sql"],
        [
          SQL,
          // the only copy of billing lives inside @comity/sql's own node_modules
        ],
      );

      write(
        join(root, "node_modules/@comity/sql/node_modules/@comity/billing/package.json"),
        JSON.stringify({
          name: "@comity/billing",
          version: "1.0.0",
          main: "./dist/index.js",
          comity: { layer: "core" },
        }),
      );
      write(
        join(root, "node_modules/@comity/sql/node_modules/@comity/billing/dist/index.js"),
        "export const x = 1;\n",
      );

      const { category, violations } = await run(root);

      expect(category).toMatchObject({ status: "FAIL" });
      expect(rules(violations)).toContain("DEP-comity-package-must-be-classified");
    });

    it("a subpath of an undeclared package is rejected like its root", async () => {
      const { violations } = await run(
        techAdapter(
          { "src/repo.ts": imp("@comity/billing/errors") },
          [],
          [{ ...UNDECLARED_CORE, exports: subpathExports("errors") }],
        ),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
    });
  });

  describe("declared but not classifiable, or not resolvable", () => {
    const declared = (
      installed: Installed[],
      spec: string,
      name = spec,
    ): string => techAdapter({ "src/repo.ts": imp(spec) }, [name], installed);

    it("no comity.layer → FAIL with the reason", async () => {
      const { violations } = await run(
        declared([{ name: "@comity/plain", comity: undefined }], "@comity/plain"),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
      expect(messages(violations)).toContain("declares no `comity.layer`");
    });

    it("invalid layer → FAIL naming the value", async () => {
      const { violations } = await run(
        declared([{ name: "@comity/odd", comity: { layer: "banana" } }], "@comity/odd"),
      );

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
      expect(messages(violations)).toContain("banana");
    });

    it("conflicting copies across workspace packages → FAIL", async () => {
      const root = fixture({
        workspaces: [
          {
            name: "@comity/order-sql",
            layer: "technology-adapter",
            files: { "src/repo.ts": imp("@comity/split") },
            manifest: { devDependencies: { "@comity/split": "1.0.0" } },
          },
          {
            name: "@comity/other-sql",
            layer: "technology-adapter",
            files: { "src/a.ts": "export const a = 1;\n" },
            manifest: { devDependencies: { "@comity/split": "2.0.0" } },
          },
        ],
        installed: [
          { name: "@comity/split", comity: { layer: "core" }, version: "1.0.0", pnpm: true, linkTo: ["order-sql"] },
          { name: "@comity/split", comity: { layer: "integration-adapter" }, version: "2.0.0", pnpm: true, linkTo: ["other-sql"] },
        ],
      });
      const { violations } = await run(root);

      expect(rules(violations)).toContain("DEP-comity-package-must-be-classified");
      expect(messages(violations)).toMatch(/conflicting layers/);
    });

    it("declared but not installed (unresolvable) → FAIL once, with the reason", async () => {
      const { violations } = await run(declared([], "@comity/ghost"));

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
      expect(messages(violations)).toContain("declared as a dependency but is not installed");
    });

    it("neither declared nor installed (unresolvable) → FAIL once", async () => {
      const { violations } = await run(techAdapter({ "src/repo.ts": imp("@comity/nowhere") }, [], []));

      expect(rules(violations)).toEqual(["DEP-comity-package-must-be-classified"]);
    });
  });

  describe("declared and classified: existing layer rules apply", () => {
    it.each([
      ["hoisted", false],
      ["pnpm virtual store", true],
    ])("technology adapter → allowed Core Module, root, valid subpath and type-only (%s) → PASS", async (_n, pnpm) => {
      const root = techAdapter(
        {
          "src/repo.ts":
            'import { x } from "@comity/sql"; import { y } from "@comity/sql/errors"; export { x, y };\n',

          "src/types.ts": 'import type { T } from "@comity/sql/errors"; export type U = T;\n',
        },
        ["@comity/sql"],
        [{ ...SQL, pnpm }],
      );
      const { category, violations } = await run(root);

      expect(violations).toEqual([]);
      expect(category).toMatchObject({ status: "PASS" });
    });

    it("an unexported subpath of a classified package → FAIL via comity-import-must-resolve", async () => {
      const { violations } = await run(
        techAdapter({ "src/repo.ts": imp("@comity/sql/hidden") }, ["@comity/sql"], [SQL]),
      );

      expect(rules(violations)).toEqual(["DEP-comity-import-must-resolve"]);
    });

    it("technology adapter → declared forbidden sibling adapter, production → FAIL", async () => {
      const { violations } = await run(
        techAdapter({ "src/repo.ts": imp("@comity/sql-kysely") }, ["@comity/sql-kysely"], [SQL_KYSELY]),
      );

      expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
    });

    it("technology adapter → installed integration adapter, declared → FAIL (no-cross-adapter-deps)", async () => {
      const { violations } = await run(
        techAdapter({ "src/repo.ts": imp("@comity/storefront-shop") }, ["@comity/storefront-shop"], [STOREFRONT]),
      );

      expect(rules(violations)).toEqual(["DEP-no-cross-adapter-deps"]);
    });

    it("a workspace Comity package is already known: importing it needs no installed classification", async () => {
      const { violations } = await run(
        techAdapter(
          { "src/repo.ts": imp("@comity/order") },
          [],
          [],
          [
            {
              name: "@comity/order",
              layer: "core",
              link: true,
              files: { "src/index.ts": "export const x = 1;\n" },
              manifest: { main: "./src/index.ts" },
            },
          ],
        ),
      );

      expect(violations).toEqual([]);
    });
  });

  describe("non-Comity dependencies keep their behaviour", () => {
    it("an installed third-party package nobody declares is NOT a finding", async () => {
      const root = techAdapter({ "src/repo.ts": imp("zod") }, [], []);

      write(join(root, "node_modules/zod/package.json"), JSON.stringify({ name: "zod", main: "./index.js" }));
      write(join(root, "node_modules/zod/index.js"), "export const x = 1;\n");

      const { category, violations } = await run(root);

      expect(violations).toEqual([]);
      expect(category).toMatchObject({ status: "PASS" });
    });

    it("an unresolvable third-party package is NOT a finding either (unchanged)", async () => {
      const { violations } = await run(techAdapter({ "src/repo.ts": imp("not-installed-lib") }, [], []));

      expect(violations).toEqual([]);
    });

    it("look-alike scopes are not Comity packages", async () => {
      const { violations } = await run(techAdapter({ "src/repo.ts": imp("@comityx/lib") }, [], []));

      expect(violations).toEqual([]);
    });
  });
});
