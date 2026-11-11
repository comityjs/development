import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import noLayerViolation from "../no-layer-violation.js";

interface Message {
  ruleId: string | null;
  messageId?: string;
  fatal?: boolean;
  message?: string;
}

/** Layer of each package in the classification supplied by the consumer (ADR-026). */
const CLASSIFICATION: Record<string, string> = {
  "@comity/primitives": "primitives",
  "@comity/kernel": "kernel",
  "@comity/composition": "composition",
  "@comity/catalog": "core",
  "@comity/order": "core",
  "@comity/cache": "core",
  "@comity/cache-kv": "technology-adapter",
  "@comity/cache-redis": "technology-adapter",
  "@comity/payment-stripe": "integration-adapter",
  "@comity/order-store": "technology-adapter",
};

const IMPLEMENTS: Record<string, string> = {
  "@comity/cache-kv": "@comity/cache",
  "@comity/cache-redis": "@comity/cache",
  "@comity/order-store": "@comity/order",
};

/** Runs the real rule through the real ESLint engine for `source`, a package of the classification. */
function lint(
  source: string,
  code: string,
  options: Record<string, unknown> = {},
  classification: Record<string, string> = CLASSIFICATION,
  file?: string,
): Message[] {
  const linter = new Linter({ cwd: "/" });

  return linter.verify(
    code,
    {
      files: ["**"],
      plugins: {
        "comity-dev": {
          rules: { "no-layer-violation": noLayerViolation as never },
        },
      },
      rules: {
        "comity-dev/no-layer-violation": [
          "error",
          {
            sourceName: source,
            classification,
            implements: IMPLEMENTS,
            ...options,
          },
        ],
      },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    } as never,
    file ?? `/repo/packages/${source.replace("@comity/", "")}/src/index.ts`,
  ) as Message[];
}

const imp = (specifier: string): string =>
  `import { x } from "${specifier}"; export const y = x;`;
const violations = (messages: Message[]): Message[] =>
  messages.filter((m) => m.ruleId !== null);

describe("no-layer-violation", () => {
  describe("Core → composition (ADR-025 §5: Core Modules → @comity/composition)", () => {
    it.each([
      "@comity/composition",
      "@comity/composition/setup",
      "@comity/composition/errors",
    ])("accepts a Core Module importing %s", (specifier) => {
      expect(lint("@comity/catalog", imp(specifier))).toEqual([]);
    });

    it("still accepts the previously permitted Core dependencies", () => {
      expect(lint("@comity/catalog", imp("@comity/primitives/result"))).toEqual(
        [],
      );
      expect(lint("@comity/catalog", imp("@comity/kernel"))).toEqual([]);
      expect(lint("@comity/catalog", imp("@comity/order"))).toEqual([]);
    });
  });

  describe("composition stays forbidden below the Core layer (ADR-025 §5 Forbidden)", () => {
    it.each(["@comity/composition", "@comity/composition/setup"])(
      "rejects kernel → %s",
      (specifier) => {
        const messages = lint("@comity/kernel", imp(specifier));
        expect(messages).toHaveLength(1);
        expect(messages[0]?.messageId).toBe("forbidden");
      },
    );

    it.each(["@comity/composition", "@comity/composition/setup"])(
      "rejects primitives → %s",
      (specifier) => {
        const messages = lint("@comity/primitives", imp(specifier));
        expect(messages).toHaveLength(1);
        expect(messages[0]?.messageId).toBe("forbidden");
      },
    );

    it("keeps every other kernel and primitives restriction", () => {
      expect(
        violations(lint("@comity/kernel", imp("@comity/catalog"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/kernel", imp("@comity/primitives"))),
      ).toHaveLength(0);
      expect(
        violations(lint("@comity/primitives", imp("@comity/kernel"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/primitives", imp("@comity/catalog"))),
      ).toHaveLength(1);
    });
  });

  describe("composition-layer sources are still analysed", () => {
    it("rejects composition → Core Module (ADR-025 hard invariant)", () => {
      const messages = lint("@comity/composition", imp("@comity/catalog"));
      expect(messages).toHaveLength(1);
      expect(messages[0]?.messageId).toBe("forbidden");
    });

    it("rejects composition → adapters", () => {
      expect(
        violations(lint("@comity/composition", imp("@comity/cache-kv"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/composition", imp("@comity/payment-stripe"))),
      ).toHaveLength(1);
    });

    it("accepts composition → kernel and composition → primitives", () => {
      expect(lint("@comity/composition", imp("@comity/kernel"))).toEqual([]);
      expect(lint("@comity/composition", imp("@comity/primitives/di"))).toEqual(
        [],
      );
    });

    it("does not no-op for the composition source layer: it reports where a Core source would not", () => {
      expect(
        violations(lint("@comity/composition", imp("@comity/catalog"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/catalog", imp("@comity/catalog"))),
      ).toHaveLength(0);
    });
  });

  describe("adapters", () => {
    it("accepts a Technology Adapter importing composition infrastructure", () => {
      expect(lint("@comity/cache-kv", imp("@comity/composition"))).toEqual([]);
      expect(
        lint("@comity/cache-kv", imp("@comity/composition/setup")),
      ).toEqual([]);
    });

    it("still accepts a Technology Adapter importing the Core Module it implements", () => {
      expect(lint("@comity/cache-kv", imp("@comity/cache"))).toEqual([]);
    });

    it("still rejects a Technology Adapter importing a Core Module it does not implement", () => {
      expect(
        violations(lint("@comity/cache-kv", imp("@comity/catalog"))),
      ).toHaveLength(1);
    });

    it("still rejects adapter → adapter and Core → adapter", () => {
      expect(
        violations(lint("@comity/cache-kv", imp("@comity/cache-redis"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/catalog", imp("@comity/cache-kv"))),
      ).toHaveLength(1);
      expect(
        violations(lint("@comity/catalog", imp("@comity/payment-stripe"))),
      ).toHaveLength(1);
    });

    describe("Technology Adapter consuming additional Core Modules (adapters.md §13)", () => {
      const consumes = { "@comity/order-store": ["@comity/catalog", "@comity/cache"] };

      it("accepts the implemented Core Module and the declared additional Core Modules", () => {
        for (const specifier of [
          "@comity/order",
          "@comity/order/errors",
          "@comity/catalog",
          "@comity/cache",
          "@comity/primitives/result",
          "@comity/composition",
        ]) {
          expect(
            lint("@comity/order-store", imp(specifier), { consumes }),
          ).toEqual([]);
        }
      });

      it("accepts only the implemented Core Module when nothing else is consumed", () => {
        expect(lint("@comity/order-store", imp("@comity/order"))).toEqual([]);
        expect(
          violations(lint("@comity/order-store", imp("@comity/catalog"))),
        ).toHaveLength(1);
        expect(
          violations(
            lint("@comity/order-store", imp("@comity/catalog"), { consumes: {} }),
          ),
        ).toHaveLength(1);
      });

      it("rejects a Core Module that is neither implemented nor declared as consumed", () => {
        const messages = lint(
          "@comity/order-store",
          imp("@comity/payment"),
          { consumes },
          { ...CLASSIFICATION, "@comity/payment": "core" },
        );
        expect(messages).toHaveLength(1);
        expect(messages[0]?.messageId).toBe("forbidden");
      });

      it("never admits a non-Core layer through consumes", () => {
        const hostile = {
          "@comity/order-store": [
            "@comity/cache-kv",
            "@comity/payment-stripe",
            "@comity/composition",
            "@comity/kernel",
          ],
        };

        expect(
          violations(
            lint("@comity/order-store", imp("@comity/cache-kv"), { consumes: hostile }),
          ),
        ).toHaveLength(1);
        expect(
          violations(
            lint("@comity/order-store", imp("@comity/payment-stripe"), {
              consumes: hostile,
            }),
          ),
        ).toHaveLength(1);
      });

      it("does not leak one package's consumes to another package", () => {
        expect(
          violations(lint("@comity/cache-kv", imp("@comity/catalog"), { consumes })),
        ).toHaveLength(1);
      });

      it("does not change Core, kernel, primitives, composition or Integration Adapter restrictions", () => {
        const all = { "@comity/payment-stripe": ["@comity/composition"] };

        expect(
          violations(lint("@comity/payment-stripe", imp("@comity/composition"), { consumes: all })),
        ).toHaveLength(1);
        expect(
          violations(lint("@comity/kernel", imp("@comity/catalog"), { consumes })),
        ).toHaveLength(1);
        expect(
          violations(lint("@comity/catalog", imp("@comity/cache-kv"), { consumes })),
        ).toHaveLength(1);
      });

      describe("test sources and declared devDependencies", () => {
        const development = { "@comity/order-store": ["@comity/cache-kv"] };
        const testFile = "/repo/adapters/order-store/src/dialects/__tests__/db.test.ts";
        const supportFile = "/repo/adapters/order-store/src/__tests__/support.ts";
        const prodFile = "/repo/adapters/order-store/src/index.ts";
        const run = (specifier: string, file: string, dev = development) =>
          violations(
            lint("@comity/order-store", imp(specifier), { development: dev }, CLASSIFICATION, file),
          );

        it("lets test sources import a technology binding the adapter declares as a devDependency", () => {
          expect(run("@comity/cache-kv", testFile)).toHaveLength(0);
          expect(run("@comity/cache-kv/errors", supportFile)).toHaveLength(0);
        });

        it("never lets production sources import it", () => {
          expect(run("@comity/cache-kv", prodFile)).toHaveLength(1);
        });

        it("only admits packages declared as devDependencies", () => {
          expect(run("@comity/cache-redis", testFile)).toHaveLength(1);
          expect(run("@comity/cache-kv", testFile, {})).toHaveLength(1);
        });

        it("does not apply to other layers", () => {
          const messages = violations(
            lint(
              "@comity/catalog",
              imp("@comity/cache-kv"),
              { development: { "@comity/catalog": ["@comity/cache-kv"] } },
              CLASSIFICATION,
              "/repo/packages/catalog/src/__tests__/a.test.ts",
            ),
          );

          expect(messages).toHaveLength(1);
        });
      });

      it("still rejects adapter → adapter for the adapter that consumes Core Modules", () => {
        expect(
          violations(
            lint("@comity/order-store", imp("@comity/cache-redis"), { consumes }),
          ),
        ).toHaveLength(1);
      });
    });

    it("accepts the documented Integration Adapter edges and leaves composition unchanged for them", () => {
      expect(lint("@comity/payment-stripe", imp("@comity/catalog"))).toEqual(
        [],
      );
      expect(lint("@comity/payment-stripe", imp("@comity/cache-kv"))).toEqual(
        [],
      );
      expect(
        violations(lint("@comity/payment-stripe", imp("@comity/composition"))),
      ).toHaveLength(1);
    });
  });

  describe("scope and configuration", () => {
    it("ignores a target that is absent from the classification (fail-open, unchanged)", () => {
      expect(lint("@comity/kernel", imp("@comity/unclassified"))).toEqual([]);
    });

    it("does nothing for a source layer without a profile (unchanged)", () => {
      expect(
        lint(
          "@comity/tool",
          imp("@comity/catalog"),
          {},
          { ...CLASSIFICATION, "@comity/tool": "dev-tooling" },
        ),
      ).toEqual([]);
    });

    it("rejects invalid options: unknown property, missing classification, missing sourceName", () => {
      const rejects = (options: unknown): boolean => {
        const linter = new Linter({ cwd: "/" });

        try {
          linter.verify(
            imp("@comity/kernel"),
            {
              files: ["**"],
              plugins: {
                "comity-dev": {
                  rules: { "no-layer-violation": noLayerViolation as never },
                },
              },
              rules: { "comity-dev/no-layer-violation": ["error", options] },
              languageOptions: { ecmaVersion: "latest", sourceType: "module" },
            } as never,
            "/repo/packages/x/src/index.ts",
          );
        } catch {
          return true;
        }

        return false;
      };

      expect(
        rejects({
          sourceName: "@comity/catalog",
          classification: {},
          allow: ["composition"],
        }),
      ).toBe(true);
      expect(rejects({ sourceName: "@comity/catalog" })).toBe(true);
      expect(rejects({ classification: {} })).toBe(true);
      expect(
        rejects({ sourceName: "@comity/catalog", classification: {} }),
      ).toBe(false);
    });

    it("offers no option that exempts a layer", () => {
      const props = (
        noLayerViolation as { meta: { schema: Array<{ properties: object }> } }
      ).meta.schema[0]?.properties;
      expect(Object.keys(props ?? {}).sort()).toEqual([
        "classification",
        "consumes",
        "development",
        "implements",
        "sourceName",
      ]);
    });
  });
});
