import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import requireInternalMarker from "../require-internal-marker.js";

const INTERNAL = "/repo/community/packages/foo/src/internal/impl.ts";
const LAZY = "/repo/community/packages/foo/src/lazy/impl.ts";
const NESTED = "/repo/community/packages/foo/src/internal/deep/nested/impl.ts";
const PUBLIC = "/repo/community/packages/foo/src/public.ts";
const PUBLIC_MARKED = "/repo/community/packages/foo/src/index.ts";

interface Message {
  ruleId: string | null;
  messageId?: string;
  fatal?: boolean;
}

/** Runs the real rule through the real ESLint engine for the given filename. */
function lint(code: string, filename: string): Message[] {
  const linter = new Linter({ cwd: "/" });

  return linter.verify(
    code,
    {
      files: ["**"],
      plugins: {
        "comity-dev": {
          rules: { "require-internal-marker": requireInternalMarker as never },
        },
      },
      rules: { "comity-dev/require-internal-marker": "error" },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    } as never,
    filename,
  ) as Message[];
}

/** Number of marker violations reported for the given source. */
function violations(code: string, filename: string): number {
  const messages = lint(code, filename);

  for (const message of messages) {
    expect(message.fatal ?? false).toBe(false);
  }

  return messages.filter(
    (m) => m.ruleId === "comity-dev/require-internal-marker",
  ).length;
}

const INLINE = "/** @internal */\nexport function example() {}\n";
const MULTILINE = "/**\n * @internal\n */\nexport function example() {}\n";

describe("require-internal-marker", () => {
  describe("scope and marker forms", () => {
    it("reports internal sources without a marker", () => {
      expect(violations("export const a = 1;\n", INTERNAL)).toBe(1);
    });

    it("reports lazy sources without a marker", () => {
      expect(violations("export const a = 1;\n", LAZY)).toBe(1);
    });

    it("reports nested internal sources without a marker", () => {
      expect(violations("export const a = 1;\n", NESTED)).toBe(1);
    });

    it("accepts the inline marker form", () => {
      expect(violations(INLINE, INTERNAL)).toBe(0);
    });

    it("accepts the conventional multiline marker form", () => {
      expect(violations(MULTILINE, LAZY)).toBe(0);
    });

    it("accepts a tag on a continuation line without an asterisk", () => {
      expect(
        violations("/**\n@internal\n*/\nexport const a = 1;\n", INTERNAL),
      ).toBe(0);
    });

    it("accepts a marker followed by other docblocks and blank lines", () => {
      const code =
        "/** @internal */\n\n/**\n * Another docblock.\n */\nexport const a = 1;\n";

      expect(violations(code, INTERNAL)).toBe(0);
    });

    it("accepts a marker followed by an unrecognised statement", () => {
      expect(
        violations('/** @internal */\n"use strict";\nexport const a = 1;\n', INTERNAL),
      ).toBe(0);
      expect(
        violations("/** @internal */\nvoid 0;\nexport const a = 1;\n", INTERNAL),
      ).toBe(0);
      expect(
        violations("/** @internal */\nif (1) {}\nexport const a = 1;\n", INTERNAL),
      ).toBe(0);
    });

    it("accepts a marker attached to a class member or nested function", () => {
      expect(
        violations(
          "export class C {\n  /** @internal */\n  method() {}\n}\n",
          INTERNAL,
        ),
      ).toBe(0);
      expect(
        violations(
          "export function outer() {\n  /** @internal */\n  function inner() {}\n}\n",
          INTERNAL,
        ),
      ).toBe(0);
    });

    it("accepts one marker among several declarations", () => {
      expect(
        violations(
          "/** @internal */\nexport const a = 1;\nexport const b = 2;\n",
          INTERNAL,
        ),
      ).toBe(0);
    });

    it("rejects a trailing marker with no following code", () => {
      expect(violations("export const a = 1;\n/** @internal */\n", INTERNAL)).toBe(
        1,
      );
    });

    it("rejects a marker-only file", () => {
      expect(violations("/** @internal */\n", INTERNAL)).toBe(1);
    });

    it("handles CRLF, BOM, tabs, and a missing final newline", () => {
      expect(
        violations("/**\r\n * @internal\r\n */\r\nexport const a = 1;\r\n", INTERNAL),
      ).toBe(0);
      expect(
        violations("\uFEFF/** @internal */\nexport const a = 1;\n", INTERNAL),
      ).toBe(0);
      expect(violations("\t/** @internal */\nexport const a = 1;\n", INTERNAL)).toBe(
        0,
      );
      expect(violations("/** @internal */\nexport const a = 1;", INTERNAL)).toBe(0);
      expect(violations("export const a = 1;\r\n", INTERNAL)).toBe(1);
    });

    it("normalizes Windows path separators", () => {
      const windows =
        "C:\\repo\\community\\packages\\foo\\src\\internal\\impl.ts";

      expect(violations("export const a = 1;\n", windows)).toBe(1);
      expect(violations(INLINE, windows)).toBe(0);
    });

    it("accepts a tag that carries a trailing description", () => {
      // `@internal` with a value is still the `@internal` tag.
      expect(
        violations("/** @internal is required */\nexport const a = 1;\n", INTERNAL),
      ).toBe(0);
      expect(
        violations(
          "/**\n * @internal is the marker we use.\n */\nexport const a = 1;\n",
          INTERNAL,
        ),
      ).toBe(0);
    });

    it("scopes .tsx sources", () => {
      expect(
        violations(
          "export const a = 1;\n",
          "/repo/community/packages/foo/src/internal/impl.tsx",
        ),
      ).toBe(1);
    });
  });

  describe("marker-like text that must not satisfy the rule", () => {
    it("rejects JSDoc prose that mentions the tag", () => {
      expect(
        violations(
          "/**\n * See the @internal notes above for details.\n */\nexport const a = 1;\n",
          INTERNAL,
        ),
      ).toBe(1);
      expect(
        violations(
          "/**\n * The @internal marker is required here.\n */\nexport const a = 1;\n",
          INTERNAL,
        ),
      ).toBe(1);
      expect(
        violations("/** Description. @internal */\nexport const a = 1;\n", INTERNAL),
      ).toBe(1);
    });

    it("rejects marker text inside string literals", () => {
      expect(violations('const value = "/** @internal */";\n', INTERNAL)).toBe(1);
      expect(violations("const value = '/** @internal */';\n", INTERNAL)).toBe(1);
      expect(violations('const value = "/** \\@internal */";\n', INTERNAL)).toBe(1);
    });

    it("rejects marker text inside template and tagged template literals", () => {
      expect(violations("const value = `/** @internal */`;\n", INTERNAL)).toBe(1);
      expect(violations("const value = `\n/** @internal */\n`;\n", INTERNAL)).toBe(1);
      expect(violations("const value = tag`\n/** @internal */\n`;\n", INTERNAL)).toBe(
        1,
      );
    });

    it("rejects marker text inside regular-expression literals", () => {
      expect(violations("const re = /\\/\\*\\* @internal \\*\\//;\n", INTERNAL)).toBe(
        1,
      );
    });

    it("rejects line and ordinary block comments", () => {
      expect(violations("// @internal\nexport const a = 1;\n", INTERNAL)).toBe(1);
      expect(violations("/* @internal */\nexport const a = 1;\n", INTERNAL)).toBe(1);
      expect(
        violations("/*\n * @internal\n */\nexport const a = 1;\n", INTERNAL),
      ).toBe(1);
      expect(violations("export const a = 1; /** @internal */\n", INTERNAL)).toBe(1);
    });

    it("rejects non-equivalent tag names", () => {
      expect(violations("/** @internalOnly */\nexport const a = 1;\n", INTERNAL)).toBe(
        1,
      );
      expect(
        violations("/** @internal-extra */\nexport const a = 1;\n", INTERNAL),
      ).toBe(1);
      expect(violations("/** @internals */\nexport const a = 1;\n", INTERNAL)).toBe(1);
      expect(violations("/** @Internal */\nexport const a = 1;\n", INTERNAL)).toBe(1);
    });
  });

  describe("exclusions", () => {
    const noMarker = "export const a = 1;\n";

    it("ignores public sources outside internal/lazy", () => {
      expect(violations(noMarker, PUBLIC)).toBe(0);
      expect(
        violations("/** @internal */\nexport const a = 1;\n", PUBLIC_MARKED),
      ).toBe(0);
    });

    it("ignores test files", () => {
      expect(
        violations(noMarker, "/repo/community/packages/foo/src/internal/impl.test.ts"),
      ).toBe(0);
      expect(
        violations(noMarker, "/repo/community/packages/foo/src/internal/impl.spec.ts"),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/src/internal/__tests__/helper.ts",
        ),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/src/lazy/__tests__/fixture.ts",
        ),
      ).toBe(0);
    });

    it("ignores mocks and fixtures", () => {
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/src/internal/__mocks__/client.ts",
        ),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/src/lazy/__fixtures__/sample.ts",
        ),
      ).toBe(0);
    });

    it("ignores generated, declaration, build, and coverage output", () => {
      expect(
        violations(noMarker, "/repo/community/packages/foo/src/internal/impl.d.ts"),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/src/internal/impl.generated.ts",
        ),
      ).toBe(0);
      expect(
        violations(noMarker, "/repo/community/packages/foo/dist/src/internal/impl.ts"),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/build/src/internal/impl.ts",
        ),
      ).toBe(0);
      expect(
        violations(
          noMarker,
          "/repo/community/packages/foo/coverage/src/internal/impl.ts",
        ),
      ).toBe(0);
      expect(
        violations(noMarker, "/repo/community/node_modules/pkg/src/internal/impl.ts"),
      ).toBe(0);
    });

    it("ignores non-src paths and similarly named directories", () => {
      expect(
        violations(noMarker, "/repo/community/packages/foo/scripts/internal/tool.ts"),
      ).toBe(0);
      expect(
        violations(noMarker, "/repo/community/packages/foo/src/internalism/impl.ts"),
      ).toBe(0);
      expect(
        violations(noMarker, "/repo/community/packages/foo/src/lazily/impl.ts"),
      ).toBe(0);
      expect(violations(noMarker, "/repo/community/packages/foo/src/internal.ts")).toBe(
        0,
      );
      expect(
        violations("const a = 1;\n", "/repo/community/packages/foo/src/internal/impl.js"),
      ).toBe(0);
    });
  });
});
