/**
 * @comity-dev/no-forbidden-deep-import
 *
 * Forbid deep imports into another `@comity/*` package's internals.
 *
 * Examples:
 *   import { foo } from "@comity/pricing/src/foo"      // ❌
 *   import { foo } from "@comity/pricing/dist/foo.js"   // ❌
 *   import { foo } from "@comity/pricing/internal/x"    // ❌
 *   import { foo } from "@comity/pricing/lazy/x"        // ❌
 *   import { foo } from "@comity/pricing"               // ✅
 *   import { foo } from "@comity/pricing/exports/foo"   // ✅
 *
 * Standard references:
 *   - public-api.md §3.2
 *   - architecture-validation.md §4.1
 */

type Rule = unknown;

const FORBIDDEN_PATTERNS = [
  /^@comity\/[^/]+\/src\//,
  /^@comity\/[^/]+\/dist\//,
  /^@comity\/[^/]+\/internal/,
  /^@comity\/[^/]+\/lazy/,
];

function isForbidden(specifier: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(specifier));
}

const messages = {
  forbidden:
    "Deep imports into another package's internals are forbidden (public-api.md §3.2). Import only from declared public subpaths.",
};

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid deep imports into other `@comity/*` packages' internals (src/, dist/, internal/, lazy/).",
      category: "Comity Architecture",
      recommended: true,
    },
    schema: [],
    messages,
  },
  create(context: any) {
    return {
      ImportDeclaration(node: any) {
        const specifier = node.source.value;
        if (!specifier || !specifier.startsWith("@comity/")) return;
        if (isForbidden(specifier)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
      ExportNamedDeclaration(node: any) {
        if (!node.source || !node.source.value) return;
        const specifier = node.source.value;
        if (!specifier.startsWith("@comity/")) return;
        if (isForbidden(specifier)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
      ExportAllDeclaration(node: any) {
        const specifier = node.source.value;
        if (!specifier || !specifier.startsWith("@comity/")) return;
        if (isForbidden(specifier)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

export default rule;
