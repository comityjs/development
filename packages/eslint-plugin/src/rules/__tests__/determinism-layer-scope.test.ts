import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import noCryptoInCore from "../no-crypto-in-core.js";
import noDateInCore from "../no-date-in-core.js";

/**
 * Both determinism rules scope by the package's declared layer (`sourceName` + `classification`,
 * as in `no-layer-violation`), never by the `@comity/*` name prefix.
 */

const CLASSIFICATION = {
  "@comity/order": "core",
  "@comity/primitives": "primitives",
  "@comity/kernel": "kernel",
  "@comity/composition": "composition",
  "@comity/order-sql": "technology-adapter",
  "@comity/payment-stripe": "integration-adapter",
  "@comity/dev-thing": "dev-tooling",
};

type Messages = Array<{ ruleId: string | null }>;

function lint(
  ruleName: "no-date-in-core" | "no-crypto-in-core",
  code: string,
  options: Record<string, unknown> | undefined,
  filename = "/repo/adapters/x/src/index.ts",
): Messages {
  const rule = ruleName === "no-date-in-core" ? noDateInCore : noCryptoInCore;
  const linter = new Linter({ cwd: "/" });

  return linter.verify(
    code,
    {
      files: ["**"],
      plugins: { "comity-dev": { rules: { [ruleName]: rule as never } } },
      rules: {
        [`comity-dev/${ruleName}`]: options === undefined ? "error" : ["error", options],
      },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    } as never,
    filename,
  ) as Messages;
}

const CASES = [
  {
    rule: "no-date-in-core" as const,
    code: "const now = new Date(); const r = Math.random();",
    violations: 2,
  },
  {
    rule: "no-crypto-in-core" as const,
    code: 'import { randomUUID } from "node:crypto"; randomUUID();',
    violations: 1,
  },
];

describe.each(CASES)("$rule: layer-based scope", ({ rule, code, violations }) => {
  const withLayer = (sourceName: string, classification: Record<string, unknown> = CLASSIFICATION) =>
    lint(rule, code, { sourceName, classification });

  it("reports in a Core Module", () => {
    expect(withLayer("@comity/order")).toHaveLength(violations);
  });

  it.each(["@comity/kernel", "@comity/composition"])("reports in %s", (name) => {
    expect(withLayer(name)).toHaveLength(violations);
  });

  it("does not report in a technology adapter, although it is a @comity/* package", () => {
    expect(withLayer("@comity/order-sql")).toEqual([]);
  });

  it("does not report in an integration adapter", () => {
    expect(withLayer("@comity/payment-stripe")).toEqual([]);
  });

  it("does not report in a layer with no determinism contract (dev-tooling)", () => {
    expect(withLayer("@comity/dev-thing")).toEqual([]);
  });

  it("does not report in a package outside the Comity scope that is classified as an adapter", () => {
    expect(withLayer("acme-adapter", { "acme-adapter": "technology-adapter" })).toEqual([]);
  });

  it("applies to a non-@comity package the consumer classifies as core", () => {
    expect(withLayer("acme-domain", { "acme-domain": "core" })).toHaveLength(violations);
  });

  describe("missing or invalid metadata (documented, fail-safe)", () => {
    it("treats a source package absent from the classification as out of scope", () => {
      expect(withLayer("@comity/unlisted")).toEqual([]);
    });

    it("treats an invalid layer value as out of scope", () => {
      expect(withLayer("@comity/order", { "@comity/order": 42 })).toEqual([]);
      expect(withLayer("@comity/order", { "@comity/order": "" })).toEqual([]);
    });

    it("treats a classification without sourceName as out of scope", () => {
      expect(lint(rule, code, { classification: CLASSIFICATION })).toEqual([]);
    });

    it("treats an empty classification as out of scope", () => {
      expect(withLayer("@comity/order", {})).toEqual([]);
    });

    it("never classifies by name alone: sourceName without classification uses the filename heuristic", () => {
      expect(lint(rule, code, { sourceName: "@comity/order-sql" }, "/repo/adapters/x/src/i.ts")).toEqual(
        [],
      );
      expect(
        lint(rule, code, { sourceName: "@comity/order-sql" }, "/repo/packages/kernel/src/i.ts"),
      ).toHaveLength(violations);
    });
  });

  describe("filename heuristic without options (unchanged)", () => {
    it("still reports in a Core location", () => {
      expect(lint(rule, code, undefined, "/repo/packages/kernel/src/i.ts")).toHaveLength(
        violations,
      );
    });

    it("still ignores locations outside Core", () => {
      expect(lint(rule, code, undefined, "/repo/adapters/x/src/i.ts")).toEqual([]);
    });
  });
});

describe("rule schemas", () => {
  it.each([noDateInCore, noCryptoInCore])("accept exactly sourceName and classification", (rule) => {
    const schema = (rule as { meta: { schema: Array<{ properties: object }> } }).meta.schema[0];

    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["classification", "sourceName"]);
  });
});
