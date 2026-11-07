import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildDependencyRules,
  buildDependencyRulesForRoot,
} from "../build-config.js";

// The exact dependency-cruiser resolved by the lockfile for this package.
const depcruiseBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
);

const roots: string[] = [];

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

interface Pkg {
  name: string;
  layer: string;
  files?: Record<string, string>;
  /** Make `@scope/name` resolve through node_modules to `main`. */
  workspaceLink?: { main: string };
}

function makeFixture(pkgs: Pkg[], withTsconfig = true): string {
  const root = mkdtempSync(join(tmpdir(), "comity-deprules-"));

  roots.push(root);

  if (withTsconfig) {
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler" },
      }),
    );
  }

  for (const p of pkgs) {
    const dir = join(root, "packages", p.name.replace("@comity/", ""));

    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: p.name,
        version: "0.0.0",
        type: "module",
        ...(p.workspaceLink ? { main: p.workspaceLink.main } : {}),
        comity: { layer: p.layer },
      }),
    );

    for (const [file, content] of Object.entries(
      p.files ?? { "src/index.ts": "export const x = 1;\n" },
    )) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), content);
    }

    if (p.workspaceLink) {
      mkdirSync(join(root, "node_modules", "@comity"), { recursive: true });
      symlinkSync(dir, join(root, "node_modules", p.name));
    }
  }

  return root;
}

function configFor(root: string, pkgs: Pkg[]) {
  return buildDependencyRulesForRoot(
    new Map(pkgs.map((p) => [p.name, p.layer])),
    root,
    {
      packagePaths: Object.fromEntries(
        pkgs.map((p) => [p.name, `packages/${p.name.replace("@comity/", "")}`]),
      ),
    },
  );
}

interface Violation {
  from: string;
  to: string;
  rule: { name: string; severity: string };
}

function cruise(root: string, pkgs: Pkg[], targetNames?: string[]) {
  const configPath = join(root, "depcruise.generated.json");

  writeFileSync(configPath, JSON.stringify(configFor(root, pkgs)));

  const proc = spawnSync(
    process.execPath,
    [
      depcruiseBin,
      "--config",
      configPath,
      "--output-type",
      "json",
      ...(targetNames ?? pkgs.map((p) => p.name)).map(
        (n) => `packages/${n.replace("@comity/", "")}`,
      ),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  expect(proc.stderr).toBe("");

  const result = JSON.parse(proc.stdout) as {
    summary: { violations: Violation[]; error: number };
    modules: Array<{ source: string }>;
  };

  return {
    violations: result.summary.violations.map((v) => ({
      from: v.from,
      to: v.to,
      rule: v.rule.name,
    })),
    modules: result.modules.map((m) => m.source),
    exitCode: proc.status,
  };
}

const base: Pkg[] = [
  { name: "@comity/primitives", layer: "primitives" },
  { name: "@comity/kernel", layer: "kernel" },
  { name: "@comity/catalog", layer: "core" },
];

describe("generated rules executed by dependency-cruiser", () => {
  it("fires on forbidden relative-path dependencies", () => {
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts":
            'import { k } from "../../kernel/src/index"; export const p = k;\n',
        },
      },
      {
        ...base[1]!,
        files: {
          "src/index.ts":
            'import { c } from "../../catalog/src/index"; export const k = c;\n',
        },
      },
      base[2]!,
    ];
    const { violations } = cruise(makeFixture(pkgs), pkgs);

    expect(violations).toEqual(
      expect.arrayContaining([
        {
          from: "packages/kernel/src/index.ts",
          to: "packages/catalog/src/index.ts",
          rule: "kernel-no-core-deps",
        },
        {
          from: "packages/kernel/src/index.ts",
          to: "packages/catalog/src/index.ts",
          rule: "kernel-only-primitives",
        },
        {
          from: "packages/primitives/src/index.ts",
          to: "packages/kernel/src/index.ts",
          rule: "primitives-no-internal",
        },
      ]),
    );
    expect(violations).toHaveLength(3);
  });

  it("reports nothing for allowed dependencies (downward and same package)", () => {
    const pkgs: Pkg[] = [
      base[0]!,
      {
        ...base[1]!,
        files: {
          "src/index.ts":
            'import { x } from "../../primitives/src/index"; import { h } from "./helper"; export const k = x + h;\n',
          "src/helper.ts": "export const h = 1;\n",
        },
      },
      {
        ...base[2]!,
        files: {
          "src/index.ts":
            'import { k } from "../../kernel/src/index"; import { x } from "../../primitives/src/index"; export const c = k + x;\n',
        },
      },
    ];
    const { violations, modules } = cruise(makeFixture(pkgs), pkgs);

    expect(modules).toContain("packages/kernel/src/helper.ts");
    expect(violations).toEqual([]);
  });

  it("fires on workspace imports resolved through node_modules to dist", () => {
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts": 'import { k } from "@comity/kernel"; export const p = k;\n',
        },
      },
      {
        ...base[1]!,
        files: { "dist/index.js": "export const k = 1;\n", "src/index.ts": "export const k = 1;\n" },
        workspaceLink: { main: "dist/index.js" },
      },
    ];
    const { violations } = cruise(makeFixture(pkgs), pkgs);

    expect(violations).toEqual([
      {
        from: "packages/primitives/src/index.ts",
        to: "packages/kernel/dist/index.js",
        rule: "primitives-no-internal",
      },
    ]);
  });

  it("fires on unresolvable workspace specifiers (package not built or linked)", () => {
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts":
            'import { k } from "@comity/kernel/errors"; export const p = k;\n',
        },
      },
      base[1]!,
    ];
    const { violations } = cruise(makeFixture(pkgs), pkgs);

    expect(violations).toEqual([
      {
        from: "packages/primitives/src/index.ts",
        to: "@comity/kernel/errors",
        rule: "primitives-no-internal",
      },
    ]);
  });

  it("does not confuse similarly named packages", () => {
    const pkgs: Pkg[] = [
      {
        name: "@comity/kernel",
        layer: "kernel",
        files: {
          "src/index.ts":
            'import { u } from "../../kernel-utils/src/index"; export const k = u;\n',
        },
      },
      { name: "@comity/kernel-utils", layer: "core" },
    ];
    // kernel -> kernel-utils(core) is forbidden; but kernel-utils's own
    // modules must not be treated as kernel sources.
    const { violations } = cruise(makeFixture(pkgs), pkgs);

    expect(violations.map((v) => v.rule).sort()).toEqual([
      "kernel-no-core-deps",
      "kernel-only-primitives",
    ]);
    expect(violations.every((v) => v.from.startsWith("packages/kernel/"))).toBe(
      true,
    );
  });

  it("ignores generated dist/ sources and excludes coverage/ from the cruise", () => {
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts": "export const p = 1;\n",
          "dist/index.js": 'import { k } from "../../kernel/src/index.ts";\n',
          "coverage/report.js": 'import { k } from "../../kernel/src/index.ts";\n',
        },
      },
      base[1]!,
    ];
    const { violations, modules } = cruise(makeFixture(pkgs), pkgs);

    expect(violations).toEqual([]);
    expect(modules.some((m) => m.includes("/coverage/"))).toBe(false);
  });

  it("allows Integration → Technology adapter, forbids Technology → Technology", () => {
    const pkgs: Pkg[] = [
      {
        name: "@comity/cache-kv",
        layer: "technology-adapter",
        files: {
          "src/index.ts":
            'import "../../cache-redis/src/index"; import "./local"; export {};\n',
          "src/local.ts": "export {};\n",
        },
      },
      { name: "@comity/cache-redis", layer: "technology-adapter" },
      {
        name: "@comity/payment-stripe",
        layer: "integration-adapter",
        files: {
          "src/index.ts": 'import "../../cache-kv/src/index"; export {};\n',
        },
      },
    ];
    const { violations } = cruise(makeFixture(pkgs), pkgs);

    expect(violations).toEqual([
      {
        from: "packages/cache-kv/src/index.ts",
        to: "packages/cache-redis/src/index.ts",
        rule: "no-cross-adapter-deps",
      },
    ]);
  });

  it("passes tsconfig to dependency-cruiser: `paths` aliases resolve to source paths only with it", () => {
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts": 'import { k } from "@comity/kernel"; export const p = k;\n',
        },
      },
      base[1]!,
    ];
    const root = makeFixture(pkgs);

    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          baseUrl: ".",
          paths: { "@comity/kernel": ["packages/kernel/src/index.ts"] },
        },
      }),
    );

    const withTsconfig = cruise(root, pkgs).violations;

    expect(configFor(root, pkgs).options.tsConfig?.fileName).toBe(
      join(root, "tsconfig.json"),
    );
    expect(withTsconfig).toEqual([
      {
        from: "packages/primitives/src/index.ts",
        to: "packages/kernel/src/index.ts",
        rule: "primitives-no-internal",
      },
    ]);

    // Without it the alias is unresolved; the edge is still caught by name.
    const cfg = configFor(root, pkgs);

    delete cfg.options.tsConfig;
    writeFileSync(join(root, "no-ts.json"), JSON.stringify(cfg));

    const proc = spawnSync(
      process.execPath,
      [depcruiseBin, "--config", "no-ts.json", "--output-type", "json", "packages/primitives", "packages/kernel"],
      { cwd: root, encoding: "utf8" },
    );
    const without = (JSON.parse(proc.stdout) as { summary: { violations: Violation[] } })
      .summary.violations;

    expect(without.map((v) => v.to)).toEqual(["@comity/kernel"]);
  });

  it("generates a config that is not inert: a mutation test", () => {
    // The same fixture with name-only rules (the previous behaviour) finds nothing.
    const pkgs: Pkg[] = [
      {
        ...base[0]!,
        files: {
          "src/index.ts":
            'import { k } from "../../kernel/src/index"; export const p = k;\n',
        },
      },
      base[1]!,
    ];
    const root = makeFixture(pkgs);
    const nameOnly = buildDependencyRules(new Map([["@comity/primitives", "primitives"]]), {
      packagePaths: { "@comity/primitives": "packages/primitives" },
    });

    expect(nameOnly.forbidden[0]!.from.path).not.toMatch(/@comity\/primitives/);
    expect(cruise(root, pkgs).violations).toHaveLength(1);
  });
});

const pkgFile = (n: string, body: string): Record<string, string> => ({
  "src/index.ts": body,
  ...(n ? {} : {}),
});

describe("Core → Composition (ADR-025) and other Core restrictions, executed", () => {
  const comp: Pkg = { name: "@comity/composition", layer: "composition", files: { "src/index.ts": "export type M = 1; export const c = 1;\n", "src/errors.ts": "export class CompositionError {}\n" } };
  const prim: Pkg = { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": "export type P = 1; export const p = 1;\n" } };
  const kern: Pkg = { name: "@comity/kernel", layer: "kernel", files: { "src/index.ts": "export type K = 1; export const k = 1;\n" } };
  const peer: Pkg = { name: "@comity/peer", layer: "core", files: { "src/index.ts": "export type Q = 1;\n" } };
  const adapter: Pkg = { name: "@comity/cache-kv", layer: "technology-adapter", files: { "src/index.ts": "export const a = 1;\n" } };

  const coreWith = (body: string): Pkg[] => [
    { name: "@comity/catalog", layer: "core", files: pkgFile("", body) },
    comp, prim, kern, peer, adapter,
  ];

  it.each([
    ["runtime composition import", 'import { c } from "../../composition/src/index"; export const x = c;\n'],
    ["type-only composition import", 'import type { M } from "../../composition/src/index"; export type X = M;\n'],
    ["unresolved composition subpath (value)", 'import { CompositionError } from "@comity/composition/errors"; export const x = CompositionError;\n'],
    ["unresolved composition subpath (type)", 'import type { ModuleMeta } from "@comity/composition/setup"; export type X = ModuleMeta;\n'],
    ["primitives + kernel, runtime and type", 'import { p } from "../../primitives/src/index"; import type { K } from "../../kernel/src/index"; export const x = p; export type Y = K;\n'],
    ["another Core Module (unchanged behaviour for this repair)", 'import type { Q } from "../../peer/src/index"; export type X = Q;\n'],
  ])("allows Core → %s", (_n, body) => {
    const pkgs = coreWith(body);

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([]);
  });

  it.each([
    ["technology adapter, runtime", 'import { a } from "../../cache-kv/src/index"; export const x = a;\n', "contracts-never-depend-on-adapters"],
    ["technology adapter, type-only", 'import type { a } from "../../cache-kv/src/index"; export type X = typeof a;\n', "contracts-never-depend-on-adapters"],
    ["unclassified internal package (unresolved)", 'import { z } from "@comity/unclassified"; export const x = z;\n', "core-only-kernel-primitives-or-core-peer"],
  ])("still forbids Core → %s", (_n, body, ruleName) => {
    const pkgs = coreWith(body);
    const rules = cruise(makeFixture(pkgs), pkgs).violations.map((v) => v.rule);

    expect(rules).toContain(ruleName);
  });

  it("Kernel → Composition stays forbidden (ADR-025)", () => {
    const pkgs: Pkg[] = [
      comp,
      prim,
      { ...kern, files: { "src/index.ts": 'import { c } from "../../composition/src/index"; export const k = c;\n' } },
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations.map((v) => v.rule)).toEqual(["kernel-only-primitives"]);
  });
});

describe("type-only imports follow the same policy as runtime imports", () => {
  const importStyles: Array<[string, (spec: string) => string]> = [
    ["runtime", (s) => `import { v } from "${s}"; export const x = v;\n`],
    ["import type", (s) => `import type { T } from "${s}"; export type X = T;\n`],
    ["inline type modifier", (s) => `import { type T } from "${s}"; export type X = T;\n`],
    ["export type … from", (s) => `export type { T } from "${s}";\n`],
  ];
  const target = (name: string, layer: string): Pkg => ({
    name, layer, files: { "src/index.ts": "export type T = 1; export const v = 1;\n" },
  });

  it.each(importStyles)("1/2. forbidden dependency is detected: %s", (_n, make) => {
    const pkgs: Pkg[] = [
      { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": make("../../kernel/src/index") } },
      target("@comity/kernel", "kernel"),
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([
      { from: "packages/primitives/src/index.ts", to: "packages/kernel/src/index.ts", rule: "primitives-no-internal" },
    ]);
  });

  it.each(importStyles)("3/4. allowed dependency is not reported: %s", (_n, make) => {
    const pkgs: Pkg[] = [
      target("@comity/primitives", "primitives"),
      { name: "@comity/kernel", layer: "kernel", files: { "src/index.ts": make("../../primitives/src/index") } },
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([]);
  });

  it("runtime and type-only imports yield identical rule/target sets across layer pairs", () => {
    const outcome = (make: (s: string) => string) => {
      const pkgs: Pkg[] = [
        { name: "@comity/kernel", layer: "kernel", files: { "src/index.ts": make("../../catalog/src/index") } },
        target("@comity/catalog", "core"),
      ];

      return cruise(makeFixture(pkgs), pkgs).violations.map((v) => `${v.rule}>${v.to}`).sort();
    };
    const runtime = outcome(importStyles[0]![1]);

    expect(runtime.length).toBeGreaterThan(0);
    for (const [, make] of importStyles.slice(1)) expect(outcome(make)).toEqual(runtime);
  });

  it("a mixed value+type import of one module is reported once", () => {
    const pkgs: Pkg[] = [
      {
        name: "@comity/primitives", layer: "primitives",
        files: { "src/index.ts": 'import type { T } from "../../kernel/src/index"; import { v } from "../../kernel/src/index"; export type X = T; export const x = v;\n' },
      },
      target("@comity/kernel", "kernel"),
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toHaveLength(1);
  });

  it("5. type-only import of a package that is not a cruise target is still detected", () => {
    const pkgs: Pkg[] = [
      { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": 'import type { T } from "../../kernel/src/index"; export type X = T;\n' } },
      target("@comity/kernel", "kernel"),
    ];
    const { violations, modules } = cruise(makeFixture(pkgs), pkgs, ["@comity/primitives"]);

    expect(violations).toEqual([
      { from: "packages/primitives/src/index.ts", to: "packages/kernel/src/index.ts", rule: "primitives-no-internal" },
    ]);
    expect(modules).toContain("packages/kernel/src/index.ts");
  });

  it("6a. type-only edge resolved through the workspace package's built output", () => {
    const pkgs: Pkg[] = [
      { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": 'import type { T } from "@comity/kernel"; export type X = T;\n' } },
      {
        name: "@comity/kernel", layer: "kernel",
        files: { "src/index.ts": "export type T = 1;\n", "dist/index.js": "export {};\n", "dist/index.d.ts": "export type T = 1;\n" },
        workspaceLink: { main: "dist/index.js" },
      },
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([
      { from: "packages/primitives/src/index.ts", to: "packages/kernel/dist/index.js", rule: "primitives-no-internal" },
    ]);
  });

  it("6b. type-only edge to a workspace package that is not built (unresolved specifier)", () => {
    const pkgs: Pkg[] = [
      { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": 'import type { T } from "@comity/kernel"; export type X = T;\n' } },
      target("@comity/kernel", "kernel"),
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([
      { from: "packages/primitives/src/index.ts", to: "@comity/kernel", rule: "primitives-no-internal" },
    ]);
  });

  it("type-only imports inside generated output or excluded coverage are never sources", () => {
    const pkgs: Pkg[] = [
      {
        name: "@comity/primitives", layer: "primitives",
        files: {
          "src/index.ts": "export type X = 1;\n",
          "dist/index.d.ts": 'import type { T } from "../../kernel/src/index"; export type X = T;\n',
          "coverage/x.ts": 'import type { T } from "../../kernel/src/index"; export type X = T;\n',
        },
      },
      target("@comity/kernel", "kernel"),
    ];

    expect(cruise(makeFixture(pkgs), pkgs).violations).toEqual([]);
  });

  it("works without a tsconfig.json", () => {
    const pkgs: Pkg[] = [
      { name: "@comity/primitives", layer: "primitives", files: { "src/index.ts": 'import type { T } from "../../kernel/src/index"; export type X = T;\n' } },
      target("@comity/kernel", "kernel"),
    ];
    const root = makeFixture(pkgs, false);

    expect(cruise(root, pkgs).violations).toHaveLength(1);
  });
});
