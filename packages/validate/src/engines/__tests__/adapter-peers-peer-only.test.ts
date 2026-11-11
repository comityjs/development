import type { PackageRecord, Repository } from "../../discover.js";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { runAdapterPeers } from "../adapter-peers.js";

/**
 * Realistic on-disk fixtures for the `peer-only` dependency model: Technology Adapters of a
 * repository that consumes published Comity packages (Commerce package-dependency-policy §2,
 * ADR-036). The adapter has real production and test sources, and the Comity packages it consumes
 * are installed in its own `node_modules`, carrying their own `comity.layer`.
 */

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface AdapterSpec {
  /** Production imports (`src/`). */
  readonly imports?: readonly string[];

  /** Imports that only tests use (`src/__tests__/`). */
  readonly testImports?: readonly string[];

  readonly peers?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;

  /** Published packages installed beside the adapter, with their declared layer. */
  readonly installed?: Record<string, string>;

  readonly layer?: string;
  readonly implementsModule?: string | null;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function makeAdapter(spec: AdapterSpec): PackageRecord {
  const root = mkdtempSync(join(tmpdir(), "adapter-peers-"));

  roots.push(root);

  const importLines = (names: readonly string[]): string =>
    `${names.map((name, index) => `import { v${index} } from "${name}";`).join("\n")}\nexport {};\n`;

  write(join(root, "src", "index.ts"), importLines(spec.imports ?? []));
  write(join(root, "src", "__tests__", "adapter.test.ts"), importLines(spec.testImports ?? []));
  write(join(root, "src", "__tests__", "support.ts"), importLines(spec.testImports ?? []));

  for (const [name, layer] of Object.entries(spec.installed ?? {})) {
    write(
      join(root, "node_modules", name, "package.json"),
      JSON.stringify({ name, version: "1.0.0", comity: { layer } }),
    );
  }

  const manifest: Record<string, unknown> = {
    name: "@comity/order-store",
    comity: {
      layer: spec.layer ?? "technology-adapter",
      ...(spec.implementsModule === null
        ? {}
        : { implements: spec.implementsModule ?? "@comity/order" }),
    },
    peerDependencies: spec.peers ?? {},
    devDependencies: spec.devDependencies ?? {},
    ...(spec.dependencies !== undefined ? { dependencies: spec.dependencies } : {}),
  };

  return {
    name: "@comity/order-store",
    path: root,
    layer: spec.layer ?? "technology-adapter",
    manifest,
  };
}

function repo(type: string, packages: PackageRecord[]): Repository {
  return {
    root: "/repo",
    repository: { name: "fixture", type },
    packageRoots: ["adapters"],
    packages,
    config: {},
  };
}

const rulesOf = (result: ReturnType<typeof runAdapterPeers>): string[] =>
  result.findings.map((finding) => String((finding as { rule?: unknown }).rule));

const PUBLISHED: Record<string, string> = {
  "@comity/order": "core",
  "@comity/sql": "core",
  "@comity/pricing": "core",
  "@comity/organization": "core",
  "@comity/primitives": "primitives",
  "@comity/sql-kysely": "technology-adapter",
  "@comity/payment-stripe": "integration-adapter",
};

const RANGE = "^0.9.0";

describe("adapter-peers: peer-only model (enterprise repositories)", () => {
  it("accepts an adapter implementing one Core Module and consuming additional Core Modules as peers", () => {
    const adapter = makeAdapter({
      imports: [
        "@comity/order",
        "@comity/order/errors",
        "@comity/sql",
        "@comity/sql/errors",
        "@comity/pricing",
        "@comity/primitives/result",
      ],
      testImports: ["@comity/sql-kysely"],
      peers: {
        "@comity/order": RANGE,
        "@comity/sql": RANGE,
        "@comity/pricing": RANGE,
        "@comity/primitives": RANGE,
      },
      devDependencies: {
        "@comity/order": "0.11.0",
        "@comity/sql": "0.9.3",
        "@comity/pricing": "0.10.0",
        "@comity/primitives": "0.9.4",
        "@comity/sql-kysely": "0.9.4",
        kysely: "0.28.19",
      },
      installed: PUBLISHED,
    });
    const result = runAdapterPeers(repo("enterprise", [adapter]));

    expect(result.findings).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("accepts an adapter whose only Core dependency is the implemented Core Module", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order", "@comity/primitives/errors"],
      peers: { "@comity/order": RANGE },
      installed: PUBLISHED,
    });

    expect(runAdapterPeers(repo("enterprise", [adapter])).findings).toEqual([]);
  });

  it("rejects a Core Module the adapter imports but does not declare as a peer", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order", "@comity/sql"],
      peers: { "@comity/order": RANGE },
      installed: PUBLISHED,
    });
    const result = runAdapterPeers(repo("enterprise", [adapter]));

    expect(rulesOf(result)).toEqual(["ARCH-ADAPTER-PEER-003"]);
    expect(result.passed).toBe(false);
  });

  it("rejects a Core Module peer that production source never imports (unjustified peer)", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order"],
      peers: { "@comity/order": RANGE, "@comity/sql": RANGE },
      installed: PUBLISHED,
    });

    expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toEqual([
      "ARCH-ADAPTER-PEER-004",
    ]);
  });

  it("does not let test-only imports justify a published peer", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order"],
      testImports: ["@comity/sql"],
      peers: { "@comity/order": RANGE, "@comity/sql": RANGE },
      installed: PUBLISHED,
    });

    expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toEqual([
      "ARCH-ADAPTER-PEER-004",
    ]);
  });

  it.each(["@comity/sql-kysely", "@comity/payment-stripe"])(
    "rejects a peer on a non-Core package (%s) even when it is imported",
    (name) => {
      const adapter = makeAdapter({
        imports: ["@comity/order", name],
        peers: { "@comity/order": RANGE, [name]: RANGE },
        installed: PUBLISHED,
      });

      expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toEqual([
        "ARCH-ADAPTER-PEER-004",
      ]);
    },
  );

  it("rejects an adapter that does not declare its implemented Core Module as a peer", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order"],
      peers: {},
      installed: PUBLISHED,
    });

    expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toContain(
      "ARCH-ADAPTER-PEER-001",
    );
  });

  it("rejects an adapter without comity.implements", () => {
    const adapter = makeAdapter({ imports: [], implementsModule: null, installed: PUBLISHED });

    expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toEqual([
      "ARCH-ADAPTER-PEER-005",
    ]);
  });

  it("rejects peers duplicated into runtime dependencies to satisfy the paired-model rule", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order", "@comity/sql"],
      peers: { "@comity/order": RANGE, "@comity/sql": RANGE },
      dependencies: { "@comity/order": RANGE, "@comity/sql": RANGE },
      installed: PUBLISHED,
    });
    const result = runAdapterPeers(repo("enterprise", [adapter]));

    expect(rulesOf(result)).toEqual(["ARCH-ADAPTER-PEER-006", "ARCH-ADAPTER-PEER-006"]);
    expect(result.passed).toBe(false);
  });

  it("rejects a consumed Core Module declared only as a runtime dependency (§13 requires a peer)", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order", "@comity/sql"],
      peers: { "@comity/order": RANGE },
      dependencies: { "@comity/sql": RANGE },
      installed: PUBLISHED,
    });

    expect(rulesOf(runAdapterPeers(repo("enterprise", [adapter])))).toEqual([
      "ARCH-ADAPTER-PEER-003",
    ]);
  });

  it("leaves third-party dependencies and peers alone", () => {
    const adapter = makeAdapter({
      imports: ["@comity/order"],
      peers: { "@comity/order": RANGE, "some-lib": "^1.0.0" },
      dependencies: { "some-runtime-lib": "^2.0.0" },
      installed: PUBLISHED,
    });

    expect(runAdapterPeers(repo("enterprise", [adapter])).findings).toEqual([]);
  });

  it("accepts an unclassifiable package only when the adapter imports it", () => {
    const imported = makeAdapter({
      imports: ["@comity/order", "@comity/unknown"],
      peers: { "@comity/order": RANGE, "@comity/unknown": RANGE },
      installed: { "@comity/order": "core" },
    });
    const notImported = makeAdapter({
      imports: ["@comity/order"],
      peers: { "@comity/order": RANGE, "@comity/unknown": RANGE },
      installed: { "@comity/order": "core" },
    });

    expect(runAdapterPeers(repo("enterprise", [imported])).findings).toEqual([]);
    expect(rulesOf(runAdapterPeers(repo("enterprise", [notImported])))).toEqual([
      "ARCH-ADAPTER-PEER-004",
    ]);
  });

  it("applies only to technology adapters", () => {
    const core = makeAdapter({
      layer: "core",
      imports: ["@comity/sql"],
      dependencies: { "@comity/sql": RANGE },
      installed: PUBLISHED,
    });

    expect(runAdapterPeers(repo("enterprise", [core])).findings).toEqual([]);
  });
});

describe("adapter-peers: paired model is unchanged for every other repository category", () => {
  it.each(["community", "development", "third-party", "fixture"])(
    "%s repositories still require the dependencies + peerDependencies pairing",
    (type) => {
      const peerOnly = makeAdapter({
        imports: ["@comity/order", "@comity/sql"],
        peers: { "@comity/order": RANGE, "@comity/sql": RANGE },
        installed: PUBLISHED,
      });
      const result = runAdapterPeers(repo(type, [peerOnly]));

      // The Community model reads consumption from `dependencies`: a peer without one is not a
      // declared consumption, whatever the sources import.
      expect(rulesOf(result)).toEqual(["ARCH-ADAPTER-PEER-004"]);
    },
  );

  it("does not flag runtime dependencies on Comity packages in a paired repository", () => {
    const paired = makeAdapter({
      imports: ["@comity/order", "@comity/sql"],
      peers: { "@comity/order": RANGE, "@comity/sql": RANGE },
      dependencies: { "@comity/order": RANGE, "@comity/sql": RANGE },
      installed: PUBLISHED,
    });
    const result = runAdapterPeers(repo("community", [paired]));

    expect(result.findings).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
