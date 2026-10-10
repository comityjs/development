import { describe, expect, it } from "vitest";

import type { FormatInput } from "../format.js";
import { formatSummary } from "../format.js";
import type { CategoryResult, RunResult } from "../run.js";

function category(overrides: Partial<CategoryResult> = {}): CategoryResult {
  return {
    status: "PASS",
    executed: true,
    exitCode: 0,
    passed: true,
    findings: 0,
    ...overrides,
  };
}

function inputWith(
  categories: Partial<Record<keyof RunResult["categories"], CategoryResult>>,
  passed: boolean,
): FormatInput {
  return {
    passed,
    violations: [],
    categories: {
      schema: category(),
      metadata: category(),
      config: category(),
      dependencies: category(),
      eslint: category(),
      semgrep: category(),
      adapterPeers: category(),
      ...categories,
    },
  };
}

describe("formatSummary overall result", () => {
  it("reports PASS when every category passes", () => {
    expect(formatSummary(inputWith({}, true))).toContain("Result: PASS");
  });

  it("reports FAIL when validation fails", () => {
    const input = inputWith(
      { semgrep: category({ status: "FAIL", passed: false, findings: 2 }) },
      false,
    );

    expect(formatSummary(input)).toContain("Result: FAIL");
  });

  it("never reports PASS when a required tool is unavailable", () => {
    const input = inputWith(
      {
        semgrep: category({
          status: "TOOL-UNAVAILABLE",
          executed: false,
          exitCode: null,
          passed: false,
          reason: "semgrep binary not found on PATH",
        }),
      },
      true,
    );
    const summary = formatSummary(input);

    expect(summary).toContain("Result: INCOMPLETE");
    expect(summary).not.toContain("Result: PASS");
    expect(summary).toContain("semgrep binary not found on PATH");
  });

  it("still reports FAIL when validation fails alongside an unavailable tool", () => {
    const input = inputWith(
      {
        eslint: category({ status: "FAIL", passed: false, findings: 1 }),
        semgrep: category({
          status: "TOOL-UNAVAILABLE",
          executed: false,
          exitCode: null,
          passed: false,
        }),
      },
      false,
    );

    expect(formatSummary(input)).toContain("Result: FAIL");
  });
});
