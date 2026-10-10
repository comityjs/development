import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAllRules } from "../../filesystem.js";

const RULES_DIR = join(
  dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "..",
  "rules",
);

interface ScanHit {
  rule: string;
  path: string;
  line: number;
}

function resolveSemgrepBin(): string | null {
  const explicit = process.env["SEMGREP_BIN"];

  if (explicit && existsSync(explicit)) return explicit;

  const probe = spawnSync("which", ["semgrep"], { encoding: "utf8" });

  if (probe.status === 0 && probe.stdout?.trim()) return probe.stdout.trim();

  return null;
}

const SEMGREP_BIN = resolveSemgrepBin();
const HAS_SEMGREP = SEMGREP_BIN !== null;

function semgrepVersion(): string {
  const proc = spawnSync(SEMGREP_BIN as string, ["--version"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(SEMGREP_BIN as string)}:${process.env["PATH"] ?? ""}`,
    },
  });

  return `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
}

function scan(ruleFile: string, target: string): ScanHit[] {
  const proc = spawnSync(
    SEMGREP_BIN as string,
    ["scan", "--config", ruleFile, "--json", "--quiet", target],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: `${dirname(SEMGREP_BIN as string)}:${process.env["PATH"] ?? ""}`,
      },
    },
  );
  const parsed = JSON.parse(proc.stdout || '{"results":[]}') as {
    results?: Array<{
      check_id?: string;
      path?: string;
      start?: { line?: number };
    }>;
  };

  return (parsed.results ?? []).map((r) => ({
    rule:
      String(r.check_id ?? "")
        .split(".")
        .pop() ?? "",
    path: String(r.path ?? ""),
    line: r.start?.line ?? 0,
  }));
}

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "comity-semgrep-rules-test-"));
  // Semgrep matches `paths:` globs relative to a project root: fixtures
  // must live inside a git repository for path-scoped rules to fire.
  spawnSync("git", ["init", "-q", sandbox], { encoding: "utf8" });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function writeTree(files: Record<string, string>): string {
  for (const [rel, content] of Object.entries(files)) {
    const file = join(sandbox, rel);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  return sandbox;
}

describe("rule files", () => {
  it("parse and expose the expected rule ids", async () => {
    const rules = await loadAllRules();
    const ids = new Set(rules.map((r) => r.id));

    for (const id of [
      "comity-error-class-must-have-code-field",
      "comity-error-class-must-extend-base-error",
      "comity-adapter-no-raw-error-throw",
      "comity-core-no-fs",
      "comity-core-no-fs-promises",
    ]) {
      expect(ids.has(id)).toBe(true);
    }

    expect(ids.has("comity-adapter-must-declare-implements")).toBe(false);
  });
});

describe.skipIf(!HAS_SEMGREP)(
  "semgrep engine behavior (ambient version)",
  () => {
    it("reports the expected engine version", () => {
      expect(semgrepVersion()).toMatch(/\d+\.\d+\.\d+/);
    });

    it("error-class-code-field honors every legitimate code form", () => {
      const root = writeTree({
        "packages/order/src/errors/order.ts": [
          "export class OrderError extends BaseError<OrderErrorMeta> {",
          "  readonly code: `order:${OrderErrorReason}`;",
          "}",
          "export class PlainError extends BaseError {",
          "  readonly code: string;",
          "}",
          "export class AssignedError extends BaseError {",
          '  readonly code = "order:fixed";',
          "}",
          "export class MissingError extends BaseError {",
          "  constructor() { super('x', {}); }",
          "}",
          "export class Plain {",
          "  value: string;",
          "}",
          "",
        ].join("\n"),
      });
      const hits = scan(
        join(RULES_DIR, "error-class-shape.yaml"),
        join(root, "packages"),
      ).filter((h) => h.rule === "comity-error-class-must-have-code-field");

      expect(hits.map((h) => h.line)).toEqual([10]);
    });

    it("error-class-code-field ignores test paths but detects production gaps", () => {
      const root = writeTree({
        "packages/order/src/errors/order.ts": [
          "export class MissingError extends BaseError {",
          "  constructor() { super('x', {}); }",
          "}",
          "",
        ].join("\n"),
        "packages/order/src/errors/order.test.ts": [
          "export class FixtureError extends BaseError {",
          "  constructor(code: string) {",
          "    super('x', {});",
          "    this.code = code;",
          "  }",
          "}",
          "",
        ].join("\n"),
        "packages/order/src/errors/__tests__/helper.ts": [
          "export class HelperError extends BaseError {",
          "  constructor() { super('x', {}); }",
          "}",
          "",
        ].join("\n"),
      });
      const hits = scan(
        join(RULES_DIR, "error-class-shape.yaml"),
        join(root, "packages"),
      ).filter((h) => h.rule === "comity-error-class-must-have-code-field");

      expect(hits.map((h) => h.path)).toEqual([
        expect.stringContaining(join("errors", "order.ts")),
      ]);
    });

    it("error-class-must-extend-base-error still detects direct Error extension", () => {
      // Note: a "documented domain base" escape hatch based on leading
      // docblocks is not expressible in this Semgrep version (comment-anchored
      // not-inside matches vacuously and would negate the rule). Abstract
      // bases — the only in-tree case, BaseError itself — are excluded
      // instead; see the completion report for the owner follow-up.
      const root = writeTree({
        "packages/order/src/errors/order.ts": [
          "export class RawError extends Error {}",
          "export abstract class AbstractBase extends Error {}",
          "export class OrderError extends BaseError {",
          "  readonly code: `order:x`;",
          "}",
          "",
        ].join("\n"),
      });
      const hits = scan(
        join(RULES_DIR, "error-class-shape.yaml"),
        join(root, "packages"),
      ).filter((h) => h.rule === "comity-error-class-must-extend-base-error");

      expect(hits.map((h) => h.line)).toEqual([1]);
    });

    it("error-class-must-extend-base-error ignores test paths", () => {
      const root = writeTree({
        "packages/order/src/errors/order.ts":
          "export class RawError extends Error {}\n",
        "packages/order/src/errors/order.test.ts":
          "export class FakeError extends Error {}\n",
        "packages/order/src/errors/__tests__/fake.ts":
          "export class HelperError extends Error {}\n",
      });
      const hits = scan(
        join(RULES_DIR, "error-class-shape.yaml"),
        join(root, "packages"),
      ).filter((h) => h.rule === "comity-error-class-must-extend-base-error");

      expect(hits.map((h) => h.path)).toEqual([
        expect.stringContaining(join("errors", "order.ts")),
      ]);
    });

    it("adapter-no-raw-error-throw ignores tests but detects production throws", () => {
      const root = writeTree({
        "packages/adapter-foo/src/adapter.ts":
          "export function convert(): void {\n  throw new Error('boom');\n}\n",
        "packages/adapter-foo/src/adapter.test.ts":
          "export function unwrap(): void {\n  throw new Error('Unexpected failure');\n}\n",
        "packages/adapter-foo/src/__tests__/helper.ts":
          "export function guard(): void {\n  throw new Error('nope');\n}\n",
      });
      const hits = scan(
        join(RULES_DIR, "adapter-contract-shape.yaml"),
        join(root, "packages"),
      ).filter((h) => h.rule === "comity-adapter-no-raw-error-throw");

      expect(hits.map((h) => h.path)).toEqual([
        expect.stringContaining(join("src", "adapter.ts")),
      ]);
    });

    it("core-no-fs ignores tests but detects production imports", () => {
      const root = writeTree({
        "packages/search/src/contracts/isolation.ts":
          'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
        "packages/search/src/contracts/__tests__/isolation.test.ts":
          'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
        "packages/search/src/contracts/promises.ts":
          'import { readFile } from "node:fs/promises";\nexport const x = readFile;\n',
        "packages/search/src/contracts/uses.test.ts":
          'import { readFile } from "node:fs/promises";\nexport const x = readFile;\n',
      });
      const hits = scan(
        join(RULES_DIR, "core-domain-no-crypto.yaml"),
        join(root, "packages"),
      );

      // Note: core-no-fs also matches `node:fs/promises` imports, which the
      // dedicated promises twin then reports again. Both rules agree that
      // test paths are out of scope.
      expect(
        hits.filter((h) => h.rule === "comity-core-no-fs").map((h) => h.path),
      ).toEqual([
        expect.stringContaining(join("contracts", "isolation.ts")),
        expect.stringContaining(join("contracts", "promises.ts")),
      ]);
      expect(
        hits
          .filter((h) => h.rule === "comity-core-no-fs-promises")
          .map((h) => h.path),
      ).toEqual([expect.stringContaining(join("contracts", "promises.ts"))]);
    });

    it("adapter-contract-shape.yaml no longer defines the retired implements rule", async () => {
      const { loadRule } = await import("../../filesystem.js");
      const rules = await loadRule(
        join(RULES_DIR, "adapter-contract-shape.yaml"),
      );
      const ids = rules.map((r) => r.id);

      expect(ids).not.toContain("comity-adapter-must-declare-implements");
      expect(ids).toContain("comity-adapter-no-raw-error-throw");
    });
  },
);
