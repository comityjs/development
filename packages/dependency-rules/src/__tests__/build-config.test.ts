import { describe, expect, it } from "vitest";
import {
  buildDependencyRules,
  buildDependencyRulesForRoot,
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
      expect(r.from.pathNot).toBe(GENERATED_OUTPUT_PATTERN);
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
