import type { PackageRecord, Repository } from "../discover.js";
import type { EngineResult, Finding } from "./types.js";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { discoverPublishablePackages } from "../discover.js";

const SOURCE = "ADR-035";

interface DependencySets {
  dependencies: Set<string>;
  peers: Set<string>;
  optionalPeers: Set<string>;
  dev: Set<string>;
  optional: Set<string>;
  exports: string[];
}

interface ParsedDeclaration {
  relative: string[];
  external: string[];
}

interface QueryContext {
  packageRecord: PackageRecord;
  sets: DependencySets;
  packages: Map<string, PackageRecord>;
  rootReached: boolean;
  entry: string;
}

const BUILTINS = new Set(builtinModules);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringSet(value: unknown): Set<string> {
  if (!isRecord(value)) return new Set();

  return new Set(Object.keys(value));
}

function dependencySets(manifest: Record<string, unknown>): DependencySets {
  const peers = stringSet(manifest["peerDependencies"]);
  const meta = isRecord(manifest["peerDependenciesMeta"])
    ? manifest["peerDependenciesMeta"]
    : {};

  return {
    dependencies: stringSet(manifest["dependencies"]),
    peers,
    optionalPeers: new Set(
      [...peers].filter((name) => {
        const entry = meta[name];

        return isRecord(entry) && entry["optional"] === true;
      }),
    ),
    dev: stringSet(manifest["devDependencies"]),
    optional: stringSet(manifest["optionalDependencies"]),
    exports: isRecord(manifest["exports"]) ? Object.keys(manifest["exports"]) : [],
  };
}

function isDeclarationFile(path: string): boolean {
  return /\.d\.(?:ts|mts|cts)$/.test(path);
}

function collectDeclarationTargets(pkg: PackageRecord): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>();
  const add = (entry: string, value: string): void => {
    if (value.includes("*") || !isDeclarationFile(value)) return;

    const absolute = resolve(pkg.path, value);
    const files = targets.get(entry) ?? new Set<string>();

    files.add(absolute);
    targets.set(entry, files);
  };
  const walk = (entry: string, value: unknown): void => {
    if (typeof value === "string") {
      add(entry, value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(entry, item);
      return;
    }

    if (isRecord(value)) {
      for (const item of Object.values(value)) walk(entry, item);
    }
  };

  const exportsField = pkg.manifest["exports"];

  if (typeof exportsField === "string") {
    walk(".", exportsField);
  } else if (isRecord(exportsField)) {
    for (const [entry, value] of Object.entries(exportsField)) walk(entry, value);
  }

  const types = pkg.manifest["types"];

  if (typeof types === "string") add(".", types);

  const typesVersions = pkg.manifest["typesVersions"];

  if (isRecord(typesVersions)) {
    for (const mapping of Object.values(typesVersions)) {
      if (!isRecord(mapping)) continue;

      for (const [subpath, value] of Object.entries(mapping)) {
        const entry = subpath.startsWith(".")
          ? subpath
          : subpath === "*"
            ? "*"
            : `./${subpath}`;

        walk(entry, value);
      }
    }
  }

  return targets;
}

function parseDeclaration(file: string): ParsedDeclaration {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const relativeSpecifiers = new Set<string>();
  const externalSpecifiers = new Set<string>();
  const isModule = ts.isExternalModule(sourceFile);
  const add = (specifier: string): void => {
    if (specifier.startsWith(".")) relativeSpecifiers.add(specifier);
    else externalSpecifiers.add(specifier);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;

      if (
        ts.isExternalModuleReference(reference) &&
        reference.expression &&
        ts.isStringLiteral(reference.expression)
      ) {
        add(reference.expression.text);
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;

      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        add(argument.literal.text);
      }
    } else if (
      isModule &&
      ts.isModuleDeclaration(node) &&
      ts.isStringLiteral(node.name)
    ) {
      add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const reference of sourceFile.referencedFiles) add(reference.fileName);

  for (const reference of sourceFile.typeReferenceDirectives) {
    externalSpecifiers.add(reference.fileName);
  }

  return {
    relative: [...relativeSpecifiers],
    external: [...externalSpecifiers],
  };
}

function resolveRelative(specifier: string, fromFile: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates: string[] = [];

  if (base.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.d.ts`);
  else if (base.endsWith(".mjs")) candidates.push(`${base.slice(0, -4)}.d.mts`);
  else if (base.endsWith(".cjs")) candidates.push(`${base.slice(0, -4)}.d.cts`);
  else if (isDeclarationFile(base)) candidates.push(base);

  candidates.push(`${base}.d.ts`, join(base, "index.d.ts"));

  return candidates.find((candidate) => {
    return existsSync(candidate) && statSync(candidate).isFile();
  }) ?? null;
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");

  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}

function subpathOf(specifier: string, owner: string): string {
  if (specifier === owner) return "";

  return specifier.startsWith(`${owner}/`)
    ? `.${specifier.slice(owner.length)}`
    : "";
}

function typesPackageName(owner: string): string {
  if (!owner.startsWith("@")) return `@types/${owner}`;

  const [scope, name] = owner.split("/");

  return `@types/${scope?.slice(1) ?? ""}__${name ?? ""}`;
}

function matchesSubpath(exportKeys: readonly string[], subpath: string): boolean {
  return exportKeys.some((key) => {
    if (key === subpath) return true;
    if (!key.includes("*")) return false;

    const pattern = key
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");

    return new RegExp(`^${pattern}$`).test(subpath);
  });
}

function isBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || BUILTINS.has(specifier);
}

function finding(
  context: QueryContext,
  rule: string,
  specifier: string,
  file: string,
  message: string,
  remediation: string,
): Finding {
  return {
    tool: "declarations",
    rule,
    package: context.packageRecord.name,
    file,
    keyword: specifier,
    severity: "error",
    source: SOURCE,
    message,
    remediation,
  };
}

function classifyExternal(
  specifier: string,
  file: string,
  context: QueryContext,
): Finding | null {
  const owner = packageNameOf(specifier);

  if (isBuiltin(specifier)) return null;

  const { packageRecord, sets } = context;
  const subpath = subpathOf(specifier, owner);

  if (owner === packageRecord.name) {
    if (subpath && !matchesSubpath(sets.exports, subpath)) {
      return finding(
        context,
        "ARCH-DECL-DEP-004",
        specifier,
        file,
        `Package "${packageRecord.name}" exposes "${specifier}" in published declarations (${file}, via entry "${context.entry}") but references a subpath that is not exported by the package`,
        "Export the subpath or fix the reference.",
      );
    }

    return null;
  }

  const typesOwner = typesPackageName(owner);
  const declared =
    sets.dependencies.has(owner) ||
    sets.peers.has(owner) ||
    sets.dependencies.has(typesOwner) ||
    sets.peers.has(typesOwner);

  if (declared) {
    const optionalPeer =
      sets.optionalPeers.has(owner) && !sets.dependencies.has(owner);

    if (optionalPeer && context.rootReached) {
      return finding(
        context,
        "ARCH-DECL-DEP-003",
        specifier,
        file,
        `Package "${packageRecord.name}" exposes optional peer "${owner}" in published declarations (${file}, via entry "${context.entry}") reachable from the root entry "."; consumers without it get unresolved types`,
        "Make the peer required, or move the reference behind an opt-in subpath.",
      );
    }

    const sibling = context.packages.get(owner);

    if (subpath && sibling) {
      const siblingSets = dependencySets(sibling.manifest);

      if (!matchesSubpath(siblingSets.exports, subpath)) {
        return finding(
          context,
          "ARCH-DECL-DEP-005",
          specifier,
          file,
          `Package "${packageRecord.name}" exposes "${specifier}" in published declarations (${file}, via entry "${context.entry}") but "${subpath}" is not an exported subpath of "${owner}"`,
          "Import an exported subpath.",
        );
      }
    }

    return null;
  }

  const devOwner = sets.dev.has(owner)
    ? owner
    : sets.dev.has(typesOwner)
      ? typesOwner
      : null;

  if (devOwner) {
    return finding(
      context,
      "ARCH-DECL-DEP-002",
      specifier,
      file,
      `Package "${packageRecord.name}" exposes "${specifier}" in published declarations (${file}, via entry "${context.entry}") but "${devOwner}" is only a devDependency; consumers get TS2307, or "any" under skipLibCheck`,
      `Move or add "${devOwner}" to peerDependencies or dependencies.`,
    );
  }

  if (sets.optional.has(owner) || sets.optional.has(typesOwner)) {
    const optionalOwner = sets.optional.has(owner) ? owner : typesOwner;

    return finding(
      context,
      "ARCH-DECL-DEP-001",
      specifier,
      file,
      `Package "${packageRecord.name}" exposes "${specifier}" in published declarations (${file}, via entry "${context.entry}") but declares "${optionalOwner}" only in optionalDependencies; optional dependencies are not guaranteed to be installed for consumers`,
      `Move or add "${optionalOwner}" to peerDependencies or dependencies.`,
    );
  }

  return finding(
    context,
    "ARCH-DECL-DEP-001",
    specifier,
    file,
    `Package "${packageRecord.name}" exposes "${specifier}" in published declarations (${file}, via entry "${context.entry}") but declares "${owner}" in neither dependencies nor peerDependencies`,
    `Add "${owner}" as a peerDependency (nominal or shared types) or a dependency (private structural types).`,
  );
}

function countDeclarationFiles(directory: string): number {
  let count = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".turbo") continue;

    const path = join(directory, entry.name);

    if (entry.isDirectory()) count += countDeclarationFiles(path);
    else if (entry.isFile() && isDeclarationFile(entry.name)) count += 1;
  }

  return count;
}

function sortFindings(findings: Finding[]): void {
  findings.sort((a, b) => {
    return (
      (a.package ?? "").localeCompare(b.package ?? "") ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.keyword ?? "").localeCompare(b.keyword ?? "") ||
      a.rule.localeCompare(b.rule)
    );
  });
}

export function runDeclarationDependencies(repo: Repository): EngineResult {
  const start = Date.now();
  const discovery = discoverPublishablePackages(repo.root);

  if (discovery.publishable.length === 0) {
    if (discovery.allPackages.length === 0) {
      const defaultNote = discovery.usedDefaultRoots
        ? " The default package root was used."
        : "";
      const excludedNote =
        discovery.excluded.length > 0
          ? ` Excluded package directories: ${discovery.excluded.map((pkg) => pkg.path).join(", ")}.`
          : "";

      return {
        executed: false,
        exitCode: null,
        passed: false,
        findings: [],
        duration: Date.now() - start,
        status: "CONFIGURATION-ERROR",
        tool: "declarations",
        reason: `No package directory with a readable package.json was found under root(s): ${discovery.roots.join(", ")}.${defaultNote}${excludedNote}`,
      };
    }

    const privatePackages = discovery.excluded
      .filter((pkg) => pkg.reason === "private package")
      .map((pkg) => pkg.name ?? pkg.path);

    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "NOT-APPLICABLE",
      tool: "declarations",
      reason: `All discovered packages are private: ${privatePackages.join(", ")}.`,
    };
  }

  const allPackages = new Map(
    discovery.allPackages.map((pkg) => [pkg.name, pkg]),
  );
  const findings: Finding[] = [];
  let totalDeclarationFiles = 0;
  let reachableDeclarationFiles = 0;
  let externalReferenceCount = 0;
  const configurationErrors: string[] = [];

  for (const pkg of discovery.publishable) {
    totalDeclarationFiles += countDeclarationFiles(pkg.path);

    const targets = collectDeclarationTargets(pkg);

    if (targets.size === 0) continue;

    const entries = [...targets.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const missingTarget = [...targets.values()]
      .flatMap((files) => [...files])
      .sort()
      .find((file) => !existsSync(file) || !statSync(file).isFile());

    if (missingTarget) {
      configurationErrors.push(
        `Package "${pkg.name}" declares a missing declaration target: ${relative(pkg.path, missingTarget).split("\\").join("/")}`,
      );
      continue;
    }

    const parsed = new Map<string, ParsedDeclaration>();
    const entryKeysByFile = new Map<string, Set<string>>();
    const unresolvedRelative = new Map<string, Set<string>>();
    const queue: Array<{ file: string; entry: string }> = [];

    for (const [entry, files] of entries) {
      for (const file of [...files].sort()) {
        queue.push({ file, entry });
      }
    }

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];

      if (!item) continue;

      const keys = entryKeysByFile.get(item.file) ?? new Set<string>();

      if (keys.has(item.entry)) continue;

      keys.add(item.entry);
      entryKeysByFile.set(item.file, keys);

      let declaration = parsed.get(item.file);

      if (!declaration) {
        declaration = parseDeclaration(item.file);
        parsed.set(item.file, declaration);
      }

      for (const specifier of declaration.relative) {
        const resolved = resolveRelative(specifier, item.file);

        if (resolved) {
          queue.push({ file: resolved, entry: item.entry });
        } else {
          const entriesForFile =
            unresolvedRelative.get(`${item.file}\0${specifier}`) ??
            new Set<string>();

          entriesForFile.add(item.entry);
          unresolvedRelative.set(`${item.file}\0${specifier}`, entriesForFile);
        }
      }
    }

    reachableDeclarationFiles += entryKeysByFile.size;

    for (const [key, entryKeys] of unresolvedRelative) {
      const [file, specifier] = key.split("\0");

      if (!file || !specifier) continue;

      const entry = [...entryKeys].sort()[0] ?? "?";

      findings.push({
        tool: "declarations",
        rule: "ARCH-DECL-DEP-000",
        package: pkg.name,
        file: relative(pkg.path, file).split("\\").join("/"),
        keyword: specifier,
        severity: "error",
        source: SOURCE,
        message: `Package "${pkg.name}" has an unresolvable relative reference "${specifier}" in declaration "${relative(pkg.path, file).split("\\").join("/")}" (reached via entry "${entry}"); the built declaration graph is broken`,
        remediation:
          "Rebuild the package, or fix the relative import so it resolves to an emitted declaration.",
      });
    }

    for (const [file, entryKeys] of entryKeysByFile) {
      const declaration = parsed.get(file);

      if (!declaration) continue;

      const entry = [...entryKeys].sort()[0] ?? "?";
      const rootReached = entryKeys.has(".");
      const sets = dependencySets(pkg.manifest);
      const context: QueryContext = {
        packageRecord: pkg,
        sets,
        packages: allPackages,
        rootReached,
        entry,
      };

      for (const specifier of [...declaration.external].sort()) {
        externalReferenceCount += 1;

        const result = classifyExternal(specifier, relative(pkg.path, file).split("\\").join("/"), context);

        if (result) findings.push(result);
      }
    }
  }

  if (configurationErrors.length > 0) {
    return {
      executed: false,
      exitCode: null,
      passed: false,
      findings: [],
      duration: Date.now() - start,
      status: "CONFIGURATION-ERROR",
      tool: "declarations",
      reason: configurationErrors.join("; "),
    };
  }

  sortFindings(findings);

  const excludedNotes = discovery.excluded.map((pkg) => {
    return `${pkg.name ?? pkg.path} (${pkg.reason})`;
  });
  const notes = [
    `${discovery.publishable.length} publishable package(s)`,
    `${totalDeclarationFiles} declaration file(s) (${reachableDeclarationFiles} entry-reachable)`,
    `${externalReferenceCount} external reference(s)`,
  ];

  if (discovery.usedDefaultRoots) notes.push("default package root was used");
  if (excludedNotes.length > 0) {
    notes.push(`excluded: ${excludedNotes.join(", ")}`);
  }

  return {
    executed: true,
    exitCode: 0,
    passed: findings.length === 0,
    findings,
    duration: Date.now() - start,
    status: findings.length === 0 ? "PASS" : "FAIL",
    tool: "declarations",
    reason: notes.join("; "),
  };
}
