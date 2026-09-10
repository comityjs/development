/**
 * @comity-dev/no-forbidden-subpath-import
 *
 * Forbid exports to forbidden subpaths (`utils`, `helpers`, `shared`,
 * `internal`, `lazy`) per `public-api.md §3.2`.
 *
 * Standard references:
 *   - public-api.md §3.2
 *   - architecture-validation.md §4.2
 */

type Rule = unknown;

const FORBIDDEN_SUBPATHS = new Set([
  "utils",
  "helpers",
  "shared",
  "internal",
  "lazy",
]);

const messages = {
  forbiddenSubpath:
    "Exports subpath './{{segment}}' is forbidden (public-api.md §3.2).",
};

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid exports subpaths `utils`, `helpers`, `shared`, `internal`, `lazy`.",
      category: "Comity Architecture",
      recommended: true,
    },
    schema: [],
    messages,
  },
  create(context: any) {
    function isComityPackage(pkgName: string): boolean {
      return pkgName.startsWith("@comity/");
    }

    return {
      ExportNamedDeclaration(node: any) {
        // No source = local export; not relevant
        if (!node.source || !node.source.value) return;
        const specifier = node.source.value;
        if (!specifier.startsWith("@comity/")) return;
        // Only check imports/exports OF other @comity packages
        const pkgMatch = specifier.match(/^@comity\/[^/]+/);
        if (!pkgMatch || !isComityPackage(pkgMatch[0])) return;
        // Subpath after the package name
        const subpath = specifier.slice(pkgMatch[0].length).replace(/^\//, "");
        const segment = subpath.split("/")[0];
        if (segment && FORBIDDEN_SUBPATHS.has(segment)) {
          context.report({
            node,
            messageId: "forbiddenSubpath",
            data: { segment },
          });
        }
      },
      ImportDeclaration(node: any) {
        const specifier = node.source.value;
        if (!specifier || !specifier.startsWith("@comity/")) return;
        const pkgMatch = specifier.match(/^@comity\/[^/]+/);
        if (!pkgMatch || !isComityPackage(pkgMatch[0])) return;
        const subpath = specifier.slice(pkgMatch[0].length).replace(/^\//, "");
        const segment = subpath.split("/")[0];
        if (segment && FORBIDDEN_SUBPATHS.has(segment)) {
          context.report({
            node,
            messageId: "forbiddenSubpath",
            data: { segment },
          });
        }
      },
    };
  },
};

export default rule;
