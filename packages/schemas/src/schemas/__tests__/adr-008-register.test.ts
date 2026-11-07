import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createAjv2020Instance } from "../../ajv-instance.js";
import {
  adr008CoreExceptionRegister,
  adr008RegisterSchema,
  validateAdr008Register,
  type Adr008Register,
} from "../adr-008-register.js";

const here = dirname(fileURLToPath(import.meta.url));
const decisionsDir = resolve(here, "../../../../../docs/standards/decisions");
const dataDir = resolve(decisionsDir, "data");

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(dataDir, name), "utf8"));

const canonicalRegister = readJson(
  "adr-008-core-exception-register.json",
) as Adr008Register;
const canonicalSchema = readJson("adr-008-core-exception-register.schema.json");

const clone = <T>(value: T): T => structuredClone(value);

describe("canonical ADR-008 register", () => {
  it("validates against the canonical schema", () => {
    const result = validateAdr008Register(canonicalRegister);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("registers 19 edges, including the two Fulfillment edges exactly once", () => {
    expect(canonicalRegister.edges).toHaveLength(19);
    for (const to of ["@comity/order", "@comity/organization"]) {
      const matches = canonicalRegister.edges.filter(
        (e) => e.from === "@comity/fulfillment" && e.to === to,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        layer: "core-to-core",
        categories: ["capability"],
        importKind: "type-only",
        lifecycle: "approved",
      });
    }
  });

  it("keeps order → pricing as a Value edge", () => {
    const edge = canonicalRegister.edges.find(
      (e) => e.from === "@comity/order" && e.to === "@comity/pricing",
    );
    expect(edge?.importKind).toBe("value");
    expect(edge?.categories).toEqual(["capability", "value-import"]);
  });

  it("has no duplicate edges", () => {
    const keys = canonicalRegister.edges.map((e) => `${e.from}>${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("packaged contract matches the canonical artifacts", () => {
  it("embeds the canonical schema unchanged", () => {
    expect(adr008RegisterSchema).toEqual(canonicalSchema);
  });

  it("embeds the canonical register unchanged", () => {
    expect(adr008CoreExceptionRegister).toEqual(canonicalRegister);
  });

  it("accepts the packaged register", () => {
    expect(validateAdr008Register(adr008CoreExceptionRegister).valid).toBe(
      true,
    );
  });

  it("can validate repeatedly on one Ajv instance", () => {
    const ajv = createAjv2020Instance();
    expect(validateAdr008Register(canonicalRegister, ajv).valid).toBe(true);
    expect(validateAdr008Register(canonicalRegister, ajv).valid).toBe(true);
  });
});

describe("ADR-008 Markdown agrees with the register (ADR-009 §8)", () => {
  const markdown = readFileSync(
    resolve(
      decisionsDir,
      "ADR-008-explicit-core-module-composition-exceptions.md",
    ),
    "utf8",
  );
  const start = markdown.indexOf("## Dependency Register (closed list)");
  const end = markdown.indexOf("### Amendment 1", start);
  const section = markdown.slice(start, end);

  const rows = [...section.matchAll(/^\| `([a-z-]+) → ([a-z-]+)`\s*\|\s*([^|]+?)\s*\|/gm)].map(
    (m) => ({ from: `@comity/${m[1]}`, to: `@comity/${m[2]}`, kind: m[3] }),
  );

  it("parses the closed register tables", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("lists every register edge, with the same import kind class", () => {
    for (const edge of canonicalRegister.edges) {
      const row = rows.find((r) => r.from === edge.from && r.to === edge.to);
      expect(row, `${edge.from} → ${edge.to} missing from ADR-008`).toBeDefined();
      const kind = row!.kind.toLowerCase();
      if (edge.importKind === "type-only") expect(kind).toBe("type-only");
      if (edge.importKind === "value") expect(kind).toMatch(/^value/);
      if (edge.importKind === "mixed") expect(kind).toMatch(/value/);
    }
  });

  it("lists no edge that the register lacks", () => {
    for (const row of rows) {
      const edge = canonicalRegister.edges.find(
        (e) => e.from === row.from && e.to === row.to,
      );
      expect(edge, `${row.from} → ${row.to} missing from register`).toBeDefined();
    }
    expect(rows).toHaveLength(canonicalRegister.edges.length);
  });
});

describe("malformed registers are rejected", () => {
  const mutate = (fn: (r: Adr008Register) => void): unknown => {
    const copy = clone(canonicalRegister);
    fn(copy);
    return copy;
  };

  it.each([
    [
      "missing importKind",
      (r: Adr008Register) =>
        delete (r.edges[0] as unknown as Record<string, unknown>)["importKind"],
    ],
    ["unknown category", (r: Adr008Register) => (r.edges[0]!.categories = ["bogus"])],
    ["empty categories", (r: Adr008Register) => (r.edges[0]!.categories = [])],
    ["invalid importKind", (r: Adr008Register) => (r.edges[0]!.importKind = "both")],
    ["invalid lifecycle", (r: Adr008Register) => (r.edges[0]!.lifecycle = "retired")],
    ["wrong layer", (r: Adr008Register) => (r.edges[0]!.layer = "adapter")],
    ["empty justification", (r: Adr008Register) => (r.edges[0]!.justification = "")],
    ["bad package name", (r: Adr008Register) => (r.edges[0]!.from = "storefront")],
    ["wrong source path", (r: Adr008Register) => (r.source = "ADR-008-explicit-core-module-composition-exceptions.md")],
    ["wrong schemaVersion", (r: Adr008Register) => (r.schemaVersion = 2)],
    ["wrong authority", (r: Adr008Register) => (r.authority = "ADR-009")],
    [
      "unknown edge property",
      (r: Adr008Register) =>
        ((r.edges[0] as unknown as Record<string, unknown>)["extra"] = true),
    ],
    [
      "migration-candidate without removalCandidate",
      (r: Adr008Register) => (r.edges[0]!.lifecycle = "migration-candidate"),
    ],
    ["duplicate edge", (r: Adr008Register) => r.edges.push(clone(r.edges[0]!))],
  ])("rejects %s", (_name, fn) => {
    expect(validateAdr008Register(mutate(fn)).valid).toBe(false);
  });

  it("accepts a migration-candidate that carries removalCandidate", () => {
    const doc = mutate((r) => {
      r.edges[0]!.lifecycle = "migration-candidate";
      r.edges[0]!.removalCandidate = { criteria: "c", action: "a" };
    });
    expect(validateAdr008Register(doc).valid).toBe(true);
  });

  it("rejects the legacy minimal shape that the 0.2.0 schema accepted", () => {
    const legacy = {
      version: "1",
      edges: [{ from: "@comity/a", to: "@comity/b", adr: "ADR-008", rationale: "x" }],
    };
    expect(validateAdr008Register(legacy).valid).toBe(false);
  });
});
