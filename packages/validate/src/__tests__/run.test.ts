import type { CategoryResult, RunResult } from "../run.js";

import { describe, expect, it } from "vitest";
import { ExitCode } from "../exit-codes.js";
import { exitCodeForResult } from "../run.js";

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

function resultWith(
  categories: Partial<Record<keyof RunResult["categories"], CategoryResult>>,
  passed: boolean,
): RunResult {
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

describe("exitCodeForResult", () => {
  it("exits PASS when every category passes", () => {
    expect(exitCodeForResult(resultWith({}, true))).toBe(ExitCode.PASS);
  });

  it("exits FAIL when validation fails", () => {
    const result = resultWith(
      { semgrep: category({ status: "FAIL", passed: false, findings: 2 }) },
      false,
    );

    expect(exitCodeForResult(result)).toBe(ExitCode.FAIL);
  });

  it("exits TOOL_MISSING rather than PASS when a tool is unavailable", () => {
    const result = resultWith(
      {
        semgrep: category({
          status: "TOOL-UNAVAILABLE",
          executed: false,
          exitCode: null,
          passed: false,
          reason: "semgrep binary not found",
        }),
      },
      true,
    );

    expect(exitCodeForResult(result)).toBe(ExitCode.TOOL_MISSING);
  });

  it("exits FAIL rather than TOOL_MISSING when validation also fails", () => {
    const result = resultWith(
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

    expect(exitCodeForResult(result)).toBe(ExitCode.FAIL);
  });
});
