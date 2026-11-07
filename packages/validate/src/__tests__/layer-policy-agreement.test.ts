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
