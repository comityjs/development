import type { Repository } from "../discover.js";

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  classifyInstalledComityPackages,
  comityPackageOf,
  describeUndeclaredPackage,
} from "../installed-packages.js";

const roots: string[] = [];

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A repository with one workspace package that declares `deps` in `field`. */
function repoWith(
  deps: Record<string, string>,
  field = "devDependencies",
): { repo: Repository; root: string; pkgDir: string } {
  const root = mkdtempSync(join(tmpdir(), "comity-installed-unit-"));
  const pkgDir = join(root, "packages", "app");

  roots.push(root);

  const manifest = { name: "@comity/app", [field]: deps };

  write(join(pkgDir, "package.json"), JSON.stringify(manifest));

  return {
    root,
    pkgDir,
    repo: {
      root,
      repository: { name: "fx", type: "enterprise" },
      packageRoots: ["packages"],
      packages: [{ name: "@comity/app", path: pkgDir, layer: "core", manifest }],
      config: {},
    },
  };
}

const install = (
  root: string,
  name: string,
  manifest: unknown,
  at = join(root, "node_modules", name),
): void => write(join(at, "package.json"), JSON.stringify(manifest));

describe("classifyInstalledComityPackages", () => {
  it("classifies from the installed manifest's comity.layer, not from the name", () => {
    const { repo, root } = repoWith({
      "@comity/primitives": "1.0.0",
      "@comity/storefront-core": "1.0.0",
    });

    install(root, "@comity/primitives", {
      name: "@comity/primitives",
      version: "1.0.0",
      comity: { layer: "primitives" },
    });
    // a name that looks like Core but declares an adapter layer
    install(root, "@comity/storefront-core", {
      name: "@comity/storefront-core",
      version: "1.0.0",
      comity: { layer: "integration-adapter" },
    });

    const { layers, problems } = classifyInstalledComityPackages(repo);

    expect(Object.fromEntries(layers)).toEqual({
      "@comity/primitives": "primitives",
      "@comity/storefront-core": "integration-adapter",
    });
    expect(problems.size).toBe(0);
  });

  it("reads every dependency field, including optionalDependencies and peerDependencies", () => {
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const { repo, root } = repoWith({ "@comity/x": "1.0.0" }, field);

      install(root, "@comity/x", {
        name: "@comity/x",
        comity: { layer: "kernel" },
      });
      expect(classifyInstalledComityPackages(repo).layers.get("@comity/x")).toBe(
        "kernel",
      );
    }
  });

  it("ignores non-Comity dependencies and workspace packages", () => {
    const { repo, root } = repoWith({ zod: "1.0.0", "@comity/app": "1.0.0" });

    install(root, "zod", { name: "zod" });

    const { layers, problems } = classifyInstalledComityPackages(repo);

    expect(layers.size + problems.size).toBe(0);
  });

  it("finds a package in an ancestor node_modules, as Node would", () => {
    const { repo, root } = repoWith({ "@comity/up": "1.0.0" });

    install(root, "@comity/up", { name: "@comity/up", comity: { layer: "core" } });
    expect(classifyInstalledComityPackages(repo).layers.get("@comity/up")).toBe(
      "core",
    );
  });

  it("reads a symlinked (pnpm) package once and classifies it", () => {
    const { repo, root, pkgDir } = repoWith({ "@comity/linked": "1.0.0" });
    const store = join(root, "node_modules/.pnpm/@comity+linked@1.0.0/node_modules/@comity/linked");

    install(root, "@comity/linked", { name: "@comity/linked", comity: { layer: "core" } }, store);
    mkdirSync(join(pkgDir, "node_modules/@comity"), { recursive: true });
    symlinkSync(store, join(pkgDir, "node_modules/@comity/linked"));

    const { layers, problems } = classifyInstalledComityPackages(repo);

    expect(layers.get("@comity/linked")).toBe("core");
    expect(problems.size).toBe(0);
  });

  const problemCases: Array<[string, unknown, RegExp]> = [
    ["no comity field", { name: "@comity/p" }, /declares no `comity\.layer`/],
    ["comity without layer", { name: "@comity/p", comity: {} }, /declares no `comity\.layer`/],
    ["non-string layer", { name: "@comity/p", comity: { layer: 3 } }, /layer\W+3\W+is not one of/],
    ["unknown layer", { name: "@comity/p", comity: { layer: "banana" } }, /"banana" is not one of primitives/],
    ["dev-tooling on a runtime package", { name: "@comity/p", comity: { layer: "dev-tooling" } }, /reserved for @comity-dev/],
    ["runtime layer on a @comity-dev package", { name: "@comity-dev/p", comity: { layer: "core" } }, /not "dev-tooling"/],
    ["manifest named differently", { name: "@comity/other", comity: { layer: "core" } }, /is named "@comity\/other"/],
  ];

  it.each(problemCases)("%s → unclassifiable with a diagnostic", (_n, manifest, reason) => {
    const name = (manifest as { name: string }).name === "@comity-dev/p" ? "@comity-dev/p" : "@comity/p";
    const { repo, root } = repoWith({ [name]: "1.0.0" });

    install(root, name, manifest);

    const { layers, problems } = classifyInstalledComityPackages(repo);

    expect(layers.has(name)).toBe(false);
    expect(problems.get(name)).toMatch(reason);
  });

  it("an unreadable manifest is unclassifiable, not a crash", () => {
    const { repo, root } = repoWith({ "@comity/bad": "1.0.0" });

    write(join(root, "node_modules/@comity/bad/package.json"), "{ not json");

    const { layers, problems } = classifyInstalledComityPackages(repo);

    expect(layers.size).toBe(0);
    expect(problems.get("@comity/bad")).toMatch(/cannot be read/);
  });

  it("a declared package with no installed copy is reported", () => {
    const { repo } = repoWith({ "@comity/missing": "1.0.0" });

    expect(classifyInstalledComityPackages(repo).problems.get("@comity/missing")).toMatch(
      /not installed/,
    );
  });
});

describe("comityPackageOf", () => {
  it.each([
    ["node_modules/@comity/primitives/dist/index.js", "@comity/primitives"],
    ["node_modules/@comity/primitives/dist/result/index.d.ts", "@comity/primitives"],
    ["node_modules/.pnpm/@comity+sql@1.0.0/node_modules/@comity/sql/dist/index.js", "@comity/sql"],
    ["node_modules/@comity/a/node_modules/@comity/b/index.js", "@comity/b"],
    ["node_modules/@comity-dev/validate/dist/index.js", "@comity-dev/validate"],
    ["@comity/primitives", "@comity/primitives"],
    ["@comity/primitives/result", "@comity/primitives"],
    ["@comity-dev/build/x", "@comity-dev/build"],
  ])("%s → %s (root and subpaths share one name)", (target, expected) => {
    expect(comityPackageOf(target)).toBe(expected);
  });

  it.each([
    "packages/entitlement/src/a.ts",
    "node_modules/zod/index.js",
    "node_modules/@other/thing/index.js",
    "@comityx/a",
    "@comity/",
  ])("%s is not a Comity package", (target) => {
    expect(comityPackageOf(target)).toBeNull();
  });
});

describe("describeUndeclaredPackage", () => {
  const root = (): string => {
    const r = mkdtempSync(join(tmpdir(), "comity-undeclared-"));

    roots.push(r);

    return r;
  };

  it("a classifiable but undeclared package: says so, with its version and layer (declaration ≠ classification)", () => {
    const r = root();

    install(r, "@comity/billing", { name: "@comity/billing", version: "2.3.4", comity: { layer: "core" } });

    expect(
      describeUndeclaredPackage(r, "node_modules/@comity/billing/dist/index.js", "@comity/billing"),
    ).toBe(
      'it is installed (version 2.3.4, layer "core") but not declared as a dependency of any workspace package',
    );
  });

  it("reads the manifest of the RESOLVED package: pnpm virtual store and subpaths alike", () => {
    const r = root();
    const store = "node_modules/.pnpm/@comity+billing@1.0.0/node_modules/@comity/billing";

    install(r, "@comity/billing", { name: "@comity/billing", version: "1.0.0", comity: { layer: "integration-adapter" } }, join(r, store));

    expect(describeUndeclaredPackage(r, `${store}/dist/errors/index.js`, "@comity/billing")).toContain(
      'layer "integration-adapter"',
    );
  });

  it("an undeclared package that is also unclassifiable reports the manifest problem and the missing declaration", () => {
    const r = root();

    install(r, "@comity/plain", { name: "@comity/plain", version: "0.1.0" });

    const message = describeUndeclaredPackage(r, "node_modules/@comity/plain/index.js", "@comity/plain");

    expect(message).toContain("declares no `comity.layer`");
    expect(message).toContain("not declared as a dependency of any workspace package");
  });

  it("an unresolved specifier has no installed manifest to read", () => {
    expect(describeUndeclaredPackage(root(), "@comity/ghost/sub", "@comity/ghost")).toBe(
      "it could not be resolved and is not declared as a dependency of any workspace package",
    );
  });
});
