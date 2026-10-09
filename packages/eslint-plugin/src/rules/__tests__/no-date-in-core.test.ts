import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import noDateInCore from "../no-date-in-core.js";

const TIME_PRIMITIVE = "/repo/community/packages/primitives/src/time/instant.ts";
const TIME_PRIMITIVE_FLAT = "/repo/packages/primitives/src/time/instant.ts";
const TIME_PRIMITIVE_WINDOWS =
  "C:\\repo\\community\\packages\\primitives\\src\\time\\instant.ts";
const PRIMITIVES_OTHER = "/repo/community/packages/primitives/src/di/container.ts";
const CORE_KERNEL = "/repo/community/packages/kernel/src/store.ts";
const CORE_HTTP = "/repo/community/packages/http/src/facade.ts";
const OUTSIDE_CORE = "/repo/examples/demo/app.ts";
const CORE_KERNEL_WINDOWS = "C:\\repo\\packages\\kernel\\src\\store.ts";

function lint(code: string, filename: string): Array<{ ruleId: string | null }> {
  const linter = new Linter({ cwd: "/" });

  return linter.verify(
    code,
    {
      files: ["**"],
      plugins: {
        "comity-dev": {
          rules: { "no-date-in-core": noDateInCore as never },
        },
      },
      rules: { "comity-dev/no-date-in-core": "error" },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    } as never,
    filename,
  ) as Array<{ ruleId: string | null }>;
}

describe("no-date-in-core", () => {
  describe("sanctioned time primitives", () => {
    it("allows the reported instant.ts construction", () => {
      const messages = lint(
        "function toISOString() { return new Date(this.epochMilliseconds).toISOString(); }",
        TIME_PRIMITIVE,
      );

      expect(messages).toEqual([]);
    });

    it("allows Date use in a flat consumer layout", () => {
      expect(lint("new Date(value);", TIME_PRIMITIVE_FLAT)).toEqual([]);
      expect(lint("Date.now();", TIME_PRIMITIVE_FLAT)).toEqual([]);
    });

    it("normalizes Windows separators before matching the exemption", () => {
      expect(lint("new Date(value);", TIME_PRIMITIVE_WINDOWS)).toEqual([]);
    });

    it("normalizes Windows separators for ordinary Core locations", () => {
      expect(lint("new Date(value);", CORE_KERNEL_WINDOWS)).toHaveLength(1);
    });
  });

  describe("forbidden Date usage", () => {
    it("rejects Date construction in an ordinary Core location", () => {
      const messages = lint("const t = new Date(123);", CORE_KERNEL);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.ruleId).toBe("comity-dev/no-date-in-core");
    });

    it("rejects Date construction elsewhere inside @comity/primitives", () => {
      expect(lint("new Date();", PRIMITIVES_OTHER)).toHaveLength(1);
    });

    it("rejects clock and random globals in Core", () => {
      expect(lint("Date.now();", CORE_KERNEL)).toHaveLength(1);
      expect(lint("performance.now();", CORE_KERNEL)).toHaveLength(1);
      expect(lint("Math.random();", CORE_KERNEL)).toHaveLength(1);
    });
  });

  describe("existing permitted access", () => {
    it("keeps Date.now() allowed for telemetry-allowlisted packages", () => {
      expect(lint("Date.now();", CORE_HTTP)).toEqual([]);
    });

    it("keeps Date.now() allowed for non-time primitives files", () => {
      expect(lint("Date.now();", PRIMITIVES_OTHER)).toEqual([]);
    });

    it("leaves files outside Core/Kernel untouched", () => {
      expect(lint("new Date();", OUTSIDE_CORE)).toEqual([]);
    });
  });
});
