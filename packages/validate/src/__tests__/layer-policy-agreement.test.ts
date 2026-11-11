import { buildDependencyRules } from "@comity-dev/dependency-rules";
import comityPlugin from "@comity-dev/eslint-plugin";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The ESLint rule `no-layer-violation` and the dependency-cruiser configuration generator express the same layer policy
 * (ADR-025 §5, layering-policy.md §2, architecture-validation.md §4.1). This test runs both over the same synthetic
 * workspace, one pair of packages per layer, and requires them to agree on every ordered pair of packages, except for
 * the differences that are documented in architecture-validation.md §4.1 and listed below.
 */

const LAYERS = [
  "primitives",
  "kernel",
  "composition",
  "core",
  "technology-adapter",
  "integration-adapter",
] as const;
type Layer = (typeof LAYERS)[number];

const packages: Array<{ name: string; layer: Layer }> = LAYERS.flatMap(
  (layer) =>
    ["a", "b"].map((suffix) => ({ name: `@comity/${layer}-${suffix}`, layer })),
);
const layerOf = new Map(packages.map((p) => [p.name, p.layer]));
const paths = Object.fromEntries(
  packages.map((p) => [p.name, `packages/${p.name.replace("@comity/", "")}`]),
);
const classification = new Map(
  packages.map((p) => [p.name, p.layer as string]),
);
// A Technology Adapter implements exactly one Core Module; only the ESLint rule models that (`implements`).
const implementsMap = { "@comity/technology-adapter-a": "@comity/core-a" };

const config = buildDependencyRules(classification, { packagePaths: paths });

/** Whether any generated dependency-cruiser rule forbids `from` importing the bare specifier `to`. */
function generatorForbids(from: string, to: string): boolean {
  const modulePath = `${paths[from]}/src/index.ts`;

  return config.forbidden.some(
    (rule) =>
      // `couldNotResolve` rules are about resolvability, not layer policy; a bare specifier
      // here stands for an edge that resolved.
      rule.to.couldNotResolve !== true &&
      new RegExp(rule.from.path).test(modulePath) &&
      (rule.from.pathNot === undefined ||
        !new RegExp(rule.from.pathNot).test(modulePath)) &&
      new RegExp(rule.to.path).test(to) &&
      (rule.to.pathNot === undefined || !new RegExp(rule.to.pathNot).test(to)),
  );
}

const noLayerViolation = (comityPlugin.rules as Record<string, unknown>)[
  "no-layer-violation"
];

/** Whether the real ESLint rule, run through the real engine, reports `from` importing `to`. */
function eslintForbids(from: string, to: string): boolean {
  const linter = new Linter({ cwd: "/" });
  const messages = linter.verify(
    `import { x } from "${to}"; export const y = x;`,
    {
      files: ["**"],
      plugins: { c: { rules: { r: noLayerViolation as never } } },
      rules: {
        "c/r": [
          "error",
          {
            sourceName: from,
            classification: Object.fromEntries(classification),
            implements: implementsMap,
          },
        ],
      },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    } as never,
    `/repo/${paths[from]}/src/index.ts`,
  );

  return messages.some((m) => m.ruleId !== null);
}

/**
 * Documented differences. In each, the ESLint rule is stricter than the generator; there is no pair in which the generator
 * forbids what the ESLint rule allows.
 */
function documentedDifference(from: string, to: string): string | null {
  const source = layerOf.get(from);
  const target = layerOf.get(to);

  if (
    source === target &&
    (source === "primitives" || source === "kernel" || source === "composition")
  ) {
    return "sibling packages inside the primitives, kernel or composition layer (the generator treats them as intra-layer)";
  }

  if (source === "technology-adapter" && target === "core") {
    return "a Technology Adapter importing a Core Module (only the ESLint rule knows which one it implements)";
  }

  if (source === "integration-adapter" && target === "composition") {
    return "Integration Adapter → composition (layering policy is silent; the generator does not restrict adapters this way)";
  }

  return null;
}

describe("no-layer-violation and the dependency-rules generator agree on the layer policy", () => {
  const pairs = packages.flatMap((f) =>
    packages
      .filter((t) => t.name !== f.name)
      .map((t) => [f.name, t.name] as const),
  );

  it("agrees on every ordered pair of packages except the documented differences", () => {
    const undocumented: string[] = [];
    const seen = new Set<string>();

    for (const [from, to] of pairs) {
      const e = eslintForbids(from, to);
      const g = generatorForbids(from, to);
      const reason = documentedDifference(from, to);

      if (e === g) {
        continue;
      }

      if (!(e && !g) || reason === null) {
        undocumented.push(`${from} → ${to}: eslint=${e} generator=${g}`);
      } else {
        seen.add(reason);
      }
    }

    expect(undocumented).toEqual([]);
    expect(seen.size).toBe(3);
  });

  it.each([
    ["core", "composition", false],
    ["kernel", "composition", true],
    ["primitives", "composition", true],
    ["technology-adapter", "composition", false],
    ["composition", "core", true],
    ["core", "technology-adapter", true],
  ] as const)(
    "both agree that %s → %s is forbidden=%s",
    (source, target, forbidden) => {
      const from = `@comity/${source}-a`;
      const to = `@comity/${target}-b`;

      expect(eslintForbids(from, to)).toBe(forbidden);
      expect(generatorForbids(from, to)).toBe(forbidden);
    },
  );
});

describe("test-only sibling-adapter exception: no-layer-violation and the generator agree on what a test file is", () => {
  const source = "@comity/technology-adapter-a";
  const sibling = "@comity/technology-adapter-b";
  const dir = paths[source];
  const exceptionConfig = buildDependencyRules(classification, {
    packagePaths: Object.fromEntries(
      Object.entries(paths).filter(([name]) => name !== sibling),
    ),
    installedPackages: [sibling],
  });

  /** ESLint: the sibling is a declared devDependency of `source`; is the import at `file` reported? */
  function eslintReports(file: string): boolean {
    const linter = new Linter({ cwd: "/" });
    const messages = linter.verify(
      `import { x } from "${sibling}"; export const y = x;`,
      {
        files: ["**"],
        plugins: { c: { rules: { r: noLayerViolation as never } } },
        rules: {
          "c/r": [
            "error",
            {
              sourceName: source,
              classification: Object.fromEntries(classification),
              development: { [source]: [sibling] },
            },
          ],
        },
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      } as never,
      `/repo/${dir}/${file}`,
    );

    return messages.some((m) => m.ruleId !== null);
  }

  /**
   * Generator: would dependency-cruiser report the same import, with the sibling resolved into node_modules and
   * declared in `devDependencies` (dependency type `npm-dev`)?
   */
  function generatorReports(file: string): boolean {
    const modulePath = `${dir}/${file}`;
    const target = `node_modules/${sibling}/dist/index.js`;

    return exceptionConfig.forbidden.some(
      (rule) =>
        rule.name === "no-cross-adapter-deps" &&
        rule.to.dependencyTypesNot === undefined &&
        new RegExp(rule.from.path).test(modulePath) &&
        (rule.from.pathNot === undefined ||
          !new RegExp(rule.from.pathNot).test(modulePath)) &&
        new RegExp(rule.to.path).test(target) &&
        (rule.to.pathNot === undefined || !new RegExp(rule.to.pathNot).test(target)),
    );
  }

  it.each([
    ["src/index.ts", true],
    ["src/repository/order-repository.ts", true],
    ["src/contest.ts", true],
    ["src/latest.ts", true],
    ["src/__tests__/a.test.ts", false],
    ["src/__tests__/harness.ts", false],
    ["src/dialects/pg/__tests__/conformance.test.ts", false],
    ["src/a.test.ts", false],
    ["src/a.spec.tsx", false],
    ["src/a.test.mjs", false],
    ["src/a.tests.ts", true],
    ["src/my__tests__/a.ts", true],
    ["src/test/a.ts", true],
  ])("%s: reported = %s in both", (file, reported) => {
    expect(eslintReports(file)).toBe(reported);
    expect(generatorReports(file)).toBe(reported);
  });
});
