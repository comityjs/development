import type { PackageRecord, Repository } from "../../discover.js";

import { describe, expect, it } from "vitest";

import { runAdapterPeers } from "../adapter-peers.js";

function pkg(
  name: string,
  layer: string | null,
  manifest: Record<string, unknown>,
): PackageRecord {
  return { name, path: `/repo/packages/${name.replace("@comity/", "")}`, layer, manifest };
}

function repo(packages: PackageRecord[]): Repository {
  return {
    root: "/repo",
    repository: { name: "fixture", type: "community" },
    packageRoots: ["packages"],
    packages,
    config: {},
  };
}

function adapterManifest(peers: Record<string, string>, deps: Record<string, string>): Record<string, unknown> {
  return {
    name: "@comity/adapter-fixture",
    comity: { layer: "technology-adapter", implements: "@comity/core-a" },
    peerDependencies: peers,
    dependencies: deps,
  };
}

function coreManifest(name: string): Record<string, unknown> {
  return { name, comity: { layer: "core" } };
}

function rulesOf(result: ReturnType<typeof runAdapterPeers>): string[] {
  return result.findings.map((f) => String((f as { rule?: unknown }).rule));
}

const CORE_A = pkg("@comity/core-a", "core", coreManifest("@comity/core-a"));
const CORE_B = pkg("@comity/core-b", "core", coreManifest("@comity/core-b"));
const CORE_C = pkg("@comity/core-c", "core", coreManifest("@comity/core-c"));

describe("adapter-peers", () => {
  it("accepts an adapter whose only Core peer is its implemented module", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest({ "@comity/core-a": "workspace:*" }, { "@comity/core-a": "workspace:*" }),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A]));

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("accepts an additional consumed Core Module declared in both sections", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        { "@comity/core-a": "workspace:*", "@comity/core-b": "workspace:*" },
        { "@comity/core-a": "workspace:*", "@comity/core-b": "workspace:*" },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A, CORE_B]));

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("rejects a consumed Core Module missing from peerDependencies", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        { "@comity/core-a": "workspace:*" },
        { "@comity/core-a": "workspace:*", "@comity/core-b": "workspace:*" },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A, CORE_B]));

    expect(result.passed).toBe(false);
    expect(rulesOf(result)).toEqual(["ARCH-ADAPTER-PEER-003"]);
  });

  it("rejects an unrelated Core Module peer with no dependency relationship", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        { "@comity/core-a": "workspace:*", "@comity/core-c": "workspace:*" },
        { "@comity/core-a": "workspace:*" },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A, CORE_C]));

    expect(result.passed).toBe(false);
    expect(rulesOf(result)).toEqual(["ARCH-ADAPTER-PEER-004"]);
  });

  it("accepts established kernel peers", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        {
          "@comity/core-a": "workspace:*",
          "@comity/composition": "workspace:*",
          "@comity/primitives": "workspace:*",
        },
        {
          "@comity/core-a": "workspace:*",
          "@comity/composition": "workspace:*",
          "@comity/primitives": "workspace:*",
        },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A]));

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("rejects a missing implemented-module peer", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest({}, { "@comity/core-a": "workspace:*" }),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A]));

    expect(result.passed).toBe(false);
    expect(rulesOf(result)).toContain("ARCH-ADAPTER-PEER-001");
  });

  it("leaves non-Core peer dependencies unchanged", () => {
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        { "@comity/core-a": "workspace:*", "some-lib": "^1.0.0" },
        { "@comity/core-a": "workspace:*" },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A]));

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("treats a declared dependency as the consumption signal without source analysis", () => {
    // The engine is manifest-only by design: a Core Module listed in
    // `dependencies` and mirrored in `peerDependencies` satisfies §13.
    // Whether production source imports it is not inspected here.
    const adapter = pkg(
      "@comity/adapter-fixture",
      "technology-adapter",
      adapterManifest(
        { "@comity/core-a": "workspace:*", "@comity/core-b": "workspace:*" },
        { "@comity/core-a": "workspace:*", "@comity/core-b": "workspace:*" },
      ),
    );

    const result = runAdapterPeers(repo([adapter, CORE_A, CORE_B]));

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });
});
