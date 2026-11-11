import { describe, expect, it } from "vitest";
import {
  buildDependencyRules,
  buildDependencyRulesForRoot,
  ENHANCED_RESOLVE_OPTIONS,
  GENERATED_OUTPUT_PATTERN,
  normalizePackageDir,
} from "../build-config.js";

const classification = new Map<string, string>([
  ["@comity/primitives", "primitives"],
  ["@comity/kernel", "kernel"],
  ["@comity/composition", "composition"],
  ["@comity/kernel-utils", "core"],
  ["@comity/catalog", "core"],
  ["@comity/cache-kv", "technology-adapter"],
  ["@comity/cache-redis", "technology-adapter"],
  ["@comity/payment-stripe", "integration-adapter"],
]);

const packagePaths = {
  "@comity/primitives": "packages/primitives",
  "@comity/kernel": "packages/kernel",
  "@comity/composition": "packages/composition",
  "@comity/kernel-utils": "packages/kernel-utils",
  "@comity/catalog": "packages/catalog",
  "@comity/cache-kv": "packages/cache-kv",
  "@comity/cache-redis": "packages/cache-redis",
  "@comity/payment-stripe": "packages/payment-stripe",
};

const config = buildDependencyRules(classification, { packagePaths });
const rule = (name: string, from?: string) =>
  config.forbidden.filter(
    (r) => r.name === name && (!from || new RegExp(r.from.path).test(from)),
  );

describe("buildDependencyRules path matching", () => {
  it("matches real module paths for each layer, not package names", () => {
    expect(
      new RegExp(rule("kernel-only-primitives")[0]!.from.path).test(
        "packages/kernel/src/index.ts",
      ),
    ).toBe(true);
    expect(
      new RegExp(rule("kernel-only-primitives")[0]!.from.path).test(
        "@comity/kernel",
      ),
    ).toBe(false);
    expect(
      rule("primitives-no-internal", "packages/primitives/src/a.ts"),
    ).toHaveLength(1);
    expect(
      rule(
        "core-only-kernel-primitives-or-core-peer",
        "packages/catalog/src/a.ts",
      ),
    ).toHaveLength(1);
    expect(rule("no-cross-adapter-deps", "packages/cache-kv/src/a.ts"))
      .toHaveLength(1);
    expect(
      rule("no-cross-adapter-deps", "packages/payment-stripe/src/a.ts"),
    ).toHaveLength(1);
  });

  it("does not match packages with a similar path prefix", () => {
    const kernelFrom = new RegExp(rule("kernel-only-primitives")[0]!.from.path);

    expect(kernelFrom.test("packages/kernel-utils/src/index.ts")).toBe(false);
    expect(kernelFrom.test("other/packages/kernel/src/index.ts")).toBe(false);
    expect(kernelFrom.test("packages/kernel")).toBe(false);

    const toCore = new RegExp(rule("kernel-no-core-deps")[0]!.to.path);

    expect(toCore.test("packages/catalog/src/x.ts")).toBe(true);
    expect(toCore.test("packages/catalog-extra/src/x.ts")).toBe(false);
    expect(toCore.test("@comity/catalog/errors")).toBe(true);
    expect(toCore.test("@comity/catalog-extra")).toBe(false);
    expect(toCore.test("node_modules/@comity/catalog/dist/index.js")).toBe(true);
  });

  it("never uses generated output directories as a rule source", () => {
    const notGenerated = new RegExp(GENERATED_OUTPUT_PATTERN);

    for (const r of config.forbidden) {
      // the production-source adapter rule appends the test-source patterns after it
      expect(
        r.from.pathNot === GENERATED_OUTPUT_PATTERN ||
          r.from.pathNot?.startsWith(`${GENERATED_OUTPUT_PATTERN}|`),
      ).toBe(true);
    }

    expect(notGenerated.test("packages/kernel/dist/index.js")).toBe(true);
    expect(notGenerated.test("packages/kernel/coverage/lcov.js")).toBe(true);
    expect(notGenerated.test("packages/kernel/src/distance.ts")).toBe(false);
    expect(config.options.exclude?.path).toBe("(^|/)coverage/");
  });

  it("escapes regular-expression metacharacters in package paths", () => {
    const c = buildDependencyRules(new Map([["@c/k", "kernel"]]), {
      packagePaths: { "@c/k": "packages/k.v1+(x)" },
    });
    const from = new RegExp(c.forbidden[0]!.from.path);

    expect(from.test("packages/k.v1+(x)/src/a.ts")).toBe(true);
    expect(from.test("packages/kXv1+(x)/src/a.ts")).toBe(false);
  });

  it("accepts Windows separators and produces identical rules", () => {
    const win = buildDependencyRules(classification, {
      packagePaths: Object.fromEntries(
        Object.entries(packagePaths).map(([k, v]) => [
          k,
          `.\\${v.replace("/", "\\")}\\`,
        ]),
      ),
    });

    expect(win).toEqual(config);
    expect(normalizePackageDir("packages\\a\\b\\")).toBe("packages/a/b");
  });

  it("is deterministic regardless of classification order", () => {
    const reversed = new Map([...classification].reverse());

    expect(buildDependencyRules(reversed, { packagePaths })).toEqual(config);
  });

  it("fails loudly when packagePaths is missing or incomplete", () => {
    // @ts-expect-error packagePaths is required by the type contract
    expect(() => buildDependencyRules(classification)).toThrow(
      /options\.packagePaths is required/,
    );
    // @ts-expect-error packagePaths is required by the type contract
    expect(() => buildDependencyRules(classification, {})).toThrow(
      /options\.packagePaths is required/,
    );
    expect(() =>
      buildDependencyRules(classification, {
        packagePaths: { "@comity/kernel": "packages/kernel" },
      }),
    ).toThrow(/no package directory known for/);
  });

  it("enables type-only dependencies for layering", () => {
    expect(config.options.tsPreCompilationDeps).toBe(true);
  });

  it("keeps every canonical layer restriction", () => {
    const names = new Set(config.forbidden.map((r) => r.name));

    for (const n of [
      "primitives-no-internal",
      "kernel-only-primitives",
      "core-only-kernel-primitives-or-core-peer",
      "contracts-never-depend-on-adapters",
      "no-cross-adapter-deps",
      "kernel-no-core-deps",
    ]) {
      expect(names.has(n)).toBe(true);
    }

    expect(config.forbidden.every((r) => r.severity === "error")).toBe(true);
  });

  it("allows Integration → Technology adapter edges and forbids the rest", () => {
    const from = (n: string) =>
      rule("no-cross-adapter-deps", `packages/${n}/src/a.ts`)[0]!;
    const hits = (n: string, to: string) => {
      const r = from(n);

      return (
        new RegExp(r.to.path).test(to) &&
        !(r.to.pathNot && new RegExp(r.to.pathNot).test(to))
      );
    };

    expect(hits("payment-stripe", "packages/cache-kv/src/a.ts")).toBe(false);
    expect(hits("cache-kv", "packages/cache-redis/src/a.ts")).toBe(true);
    expect(hits("cache-kv", "packages/payment-stripe/src/a.ts")).toBe(true);
    expect(hits("cache-kv", "packages/cache-kv/src/b.ts")).toBe(false);
  });

  it("pins tsconfig only when the file exists", () => {
    expect(config.options.tsConfig).toBeUndefined();
    expect(
      buildDependencyRulesForRoot(classification, "/nonexistent-root", {
        packagePaths,
      }).options.tsConfig,
    ).toBeUndefined();
  });

  it("buildDependencyRulesForRoot relativises absolute package paths", () => {
    const abs = Object.fromEntries(
      Object.entries(packagePaths).map(([k, v]) => [k, `/repo/${v}`]),
    );

    expect(
      buildDependencyRulesForRoot(classification, "/repo", {
        packagePaths: abs,
      }),
    ).toEqual(config);
  });
});

describe("Core Module allowances (ADR-025)", () => {
  const coreRule = rule(
    "core-only-kernel-primitives-or-core-peer",
    "packages/catalog/src/a.ts",
  )[0]!;
  const flagged = (to: string): boolean =>
    new RegExp(coreRule.to.path).test(to) &&
    !(coreRule.to.pathNot && new RegExp(coreRule.to.pathNot).test(to));

  it.each([
    ["composition (ADR-025), path", "packages/composition/src/errors/index.ts"],
    ["composition (ADR-025), unresolved subpath", "@comity/composition/errors"],
    ["composition (ADR-025), node_modules", "node_modules/@comity/composition/dist/index.js"],
    ["primitives", "packages/primitives/src/index.ts"],
    ["kernel", "packages/kernel/src/index.ts"],
    ["kernel, bare specifier", "@comity/kernel"],
    ["another Core Module (not restricted by this rule)", "packages/kernel-utils/src/index.ts"],
    ["itself", "packages/catalog/src/other.ts"],
  ])("does not flag Core → %s", (_n, to) => {
    expect(flagged(to)).toBe(false);
  });

  it.each([
    ["a technology adapter", "packages/cache-kv/src/index.ts"],
    ["an integration adapter", "@comity/payment-stripe"],
    ["an unclassified internal package", "@comity/unclassified"],
    ["a development-tooling package", "@comity-dev/validate"],
  ])("still flags Core → %s", (_n, to) => {
    const adapterRule = rule("contracts-never-depend-on-adapters")[0]!;
    const hit =
      flagged(to) ||
      (new RegExp(adapterRule.to.path).test(to));

    expect(hit).toBe(true);
  });

  it("rule description does not claim ADR-008 governs Core → Core edges", () => {
    expect(coreRule.comment).toContain("ADR-025");
    expect(coreRule.comment).toMatch(/does not check Core-to-Core edges/);
    expect(coreRule.comment).not.toMatch(/explicitly permitted via ADR-008/);
  });
});

describe("module resolution options", () => {
  it("honours package `exports` with the ESM, CommonJS, Node, default and types conditions", () => {
    expect(config.options.enhancedResolveOptions).toEqual({
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    });
    expect(config.options.enhancedResolveOptions).toEqual(
      ENHANCED_RESOLVE_OPTIONS,
    );
  });

  it("hands out copies: mutating a generated config never changes the shared constant", () => {
    config.options.enhancedResolveOptions!.conditionNames.push("x");
    expect(ENHANCED_RESOLVE_OPTIONS.conditionNames).not.toContain("x");
    config.options.enhancedResolveOptions!.conditionNames.pop();
  });
});

describe("installed (node_modules) packages", () => {
  const installedClassification = new Map<string, string>([
    ["@comity/entitlement", "core"],
    ["@comity/primitives", "primitives"],
    ["@comity/composition", "composition"],
    ["@comity/sql", "core"],
    ["@comity/sql-kysely", "technology-adapter"],
  ]);
  const installedConfig = buildDependencyRules(installedClassification, {
    packagePaths: { "@comity/entitlement": "packages/entitlement" },
    installedPackages: [
      "@comity/primitives",
      "@comity/composition",
      "@comity/sql",
      "@comity/sql-kysely",
    ],
  });
  const named = (name: string) =>
    installedConfig.forbidden.filter((r) => r.name === name);
  const matches = (rule: { path: string; pathNot?: string }, to: string) =>
    new RegExp(rule.path).test(to) &&
    (rule.pathNot === undefined || !new RegExp(rule.pathNot).test(to));

  const pnpm = (name: string, file = "dist/index.js") =>
    `node_modules/.pnpm/${name.replace("/", "+")}@1.0.0/node_modules/${name}/${file}`;

  it("a rule's SOURCE is only ever a workspace package, never an installed one", () => {
    for (const r of installedConfig.forbidden) {
      expect(r.from.path).toContain("packages/entitlement");
      expect(r.from.path).not.toContain("sql");
    }
  });

  it("allows the resolved path of installed primitives and composition, root and subpath, hoisted and pnpm", () => {
    const [core] = named("core-only-kernel-primitives-or-core-peer");

    for (const target of [
      "node_modules/@comity/primitives/dist/index.js",
      "node_modules/@comity/primitives/dist/result/index.d.ts",
      pnpm("@comity/primitives", "dist/time/index.d.ts"),
      pnpm("@comity/composition", "dist/setup/index.d.ts"),
    ]) {
      expect(matches(core!.to, target)).toBe(false);
    }
  });

  it("forbids the resolved path of an installed package of a forbidden layer", () => {
    const [adapters] = named("contracts-never-depend-on-adapters");

    for (const target of [
      pnpm("@comity/sql-kysely"),
      pnpm("@comity/sql-kysely", "dist/driver/index.js"),
      "node_modules/@comity/sql-kysely/dist/index.js",
    ]) {
      expect(matches(adapters!.to, target)).toBe(true);
    }
  });

  it("an installed Core Module stays outside the Core rule (Core → Core is ADR-008's)", () => {
    const [core] = named("core-only-kernel-primitives-or-core-peer");

    expect(matches(core!.to, pnpm("@comity/sql"))).toBe(false);
  });

  it("fails closed: the resolved path of an installed Comity package that is NOT classified is forbidden", () => {
    const [core] = named("core-only-kernel-primitives-or-core-peer");

    expect(matches(core!.to, pnpm("@comity/mystery"))).toBe(true);
    expect(matches(core!.to, pnpm("@comity-dev/validate"))).toBe(true);
    expect(matches(core!.to, "node_modules/@comity/mystery/dist/index.js")).toBe(
      true,
    );
  });

  it("does not match unrelated node_modules packages or look-alike scopes", () => {
    const [core] = named("core-only-kernel-primitives-or-core-peer");

    expect(matches(core!.to, pnpm("@other/thing"))).toBe(false);
    expect(matches(core!.to, "node_modules/@comityx/a/index.js")).toBe(false);
    expect(matches(core!.to, "node_modules/zod/index.js")).toBe(false);
  });

  it("an installed name without a directory and without being declared installed is still an error", () => {
    expect(() =>
      buildDependencyRules(installedClassification, {
        packagePaths: { "@comity/entitlement": "packages/entitlement" },
      }),
    ).toThrow(/no package directory known for "@comity\/(composition|primitives|sql|sql-kysely)"/);
  });

  it("a workspace package listed as installed keeps its directory", () => {
    const withBoth = buildDependencyRules(installedClassification, {
      packagePaths: {
        "@comity/entitlement": "packages/entitlement",
        "@comity/primitives": "packages/primitives",
      },
      installedPackages: [
        "@comity/primitives",
        "@comity/composition",
        "@comity/sql",
        "@comity/sql-kysely",
      ],
    });

    expect(
      withBoth.forbidden.some((r) => r.from.path.includes("packages/primitives")),
    ).toBe(true);
  });

  it("emits no rule for a layer that only exists as installed packages", () => {
    const onlyInstalled = buildDependencyRules(
      new Map([["@comity/sql", "core"]]),
      { packagePaths: {}, installedPackages: ["@comity/sql"] },
    );

    expect(onlyInstalled.forbidden).toEqual([]);
  });
});

describe("comity-import-must-resolve", () => {
  const classes = new Map<string, string>([
    ["@comity/primitives", "primitives"],
    ["@comity/entitlement", "core"],
    ["@comity/sql-kysely", "technology-adapter"],
  ]);
  const cfg = buildDependencyRules(classes, {
    packagePaths: {
      "@comity/primitives": "packages/primitives",
      "@comity/entitlement": "packages/entitlement",
      "@comity/sql-kysely": "packages/sql-kysely",
    },
  });
  const rules = cfg.forbidden.filter((r) => r.name === "comity-import-must-resolve");
  const forSource = (dir: string) =>
    rules.filter((r) => new RegExp(r.from.path).test(`${dir}/src/index.ts`));

  it("applies only to unresolved imports", () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.to.couldNotResolve === true)).toBe(true);
  });

  it("covers every governed layer, so no allowed unresolved import passes silently", () => {
    for (const dir of ["packages/primitives", "packages/entitlement", "packages/sql-kysely"]) {
      expect(forSource(dir).length).toBe(1);
    }
  });

  it("never duplicates a layer rule's catch-all: it only matches specifiers the layer MAY import", () => {
    const [core] = forSource("packages/entitlement");

    expect(new RegExp(core!.to.path).test("@comity/primitives/hidden")).toBe(true);
    expect(new RegExp(core!.to.path).test("@comity/sql-kysely")).toBe(false);
    expect(new RegExp(core!.to.path).test("@comity/mystery")).toBe(false);
  });

  it("an adapter has no catch-all, so every unresolved Comity specifier is covered", () => {
    const [adapter] = forSource("packages/sql-kysely");

    expect(new RegExp(adapter!.to.path).test("@comity/anything/at-all")).toBe(true);
    expect(new RegExp(adapter!.to.path).test("zod")).toBe(false);
  });
});

describe("no-cross-adapter-deps: test-only exception structure", () => {
  const cls = new Map<string, string>([
    ["@comity/order-sql", "technology-adapter"],
    ["@comity/cache-kv", "technology-adapter"],
    ["@comity/sql-kysely", "technology-adapter"],
    ["@comity/shop", "integration-adapter"],
  ]);
  const cfg = buildDependencyRules(cls, {
    packagePaths: {
      "@comity/order-sql": "adapters/order-sql",
      "@comity/cache-kv": "adapters/cache-kv",
      "@comity/shop": "adapters/shop",
    },
    installedPackages: ["@comity/sql-kysely"],
  });
  const forOrderSql = cfg.forbidden.filter(
    (r) =>
      r.name === "no-cross-adapter-deps" &&
      /adapters\/order-sql/.test(r.from.path),
  );
  const exempt = forOrderSql.filter((r) => r.to.dependencyTypesNot !== undefined);

  it("a technology adapter gets a production rule, a workspace test rule and an installed test rule", () => {
    expect(forOrderSql).toHaveLength(3);
    expect(exempt).toHaveLength(1);
  });

  it("only the installed-adapter test rule carries the devDependency exemption, and only for installed targets", () => {
    const [rule] = exempt;

    expect(rule!.to.dependencyTypesNot).toEqual(["npm-dev"]);
    expect(new RegExp(rule!.to.path).test("node_modules/@comity/sql-kysely/dist/index.js")).toBe(true);
    expect(new RegExp(rule!.to.path).test("adapters/cache-kv/src/index.ts")).toBe(false);
  });

  it("workspace-adapter targets are never exempt, in production or test sources", () => {
    const workspaceRules = forOrderSql.filter((r) =>
      new RegExp(r.to.path).test("adapters/cache-kv/src/index.ts"),
    );

    expect(workspaceRules.length).toBe(2);
    expect(workspaceRules.every((r) => r.to.dependencyTypesNot === undefined)).toBe(true);
  });

  it("the production rule excludes test files; the test rules match only test files", () => {
    const [prod] = forOrderSql.filter((r) => r.from.pathNot?.includes("__tests__"));
    const prodMatches = (f: string): boolean =>
      new RegExp(prod!.from.path).test(f) && !new RegExp(prod!.from.pathNot!).test(f);

    expect(prodMatches("adapters/order-sql/src/repo.ts")).toBe(true);
    expect(prodMatches("adapters/order-sql/src/__tests__/a.ts")).toBe(false);
    expect(prodMatches("adapters/order-sql/src/a.test.ts")).toBe(false);
    expect(prodMatches("adapters/order-sql-extra/src/repo.ts")).toBe(false);

    for (const r of exempt) {
      expect(new RegExp(r.from.path).test("adapters/order-sql/src/repo.ts")).toBe(false);
      expect(new RegExp(r.from.path).test("adapters/order-sql/src/__tests__/a.ts")).toBe(true);
      expect(new RegExp(r.from.path).test("adapters/order-sql/src/a.spec.ts")).toBe(true);
    }
  });

  it("an integration adapter has no test exception (matches no-layer-violation, which scopes it to technology adapters)", () => {
    const shop = cfg.forbidden.filter(
      (r) => r.name === "no-cross-adapter-deps" && /adapters\/shop/.test(r.from.path),
    );

    expect(shop).toHaveLength(1);
    expect(shop[0]!.to.dependencyTypesNot).toBeUndefined();
  });

  it("an installed adapter is never a rule source", () => {
    expect(cfg.forbidden.some((r) => /sql-kysely/.test(r.from.path))).toBe(false);
  });
});
