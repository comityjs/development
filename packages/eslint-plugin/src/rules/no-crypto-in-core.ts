/**
 * @comity-dev/no-crypto-in-core
 *
 * Forbid Node's `crypto` and WebCrypto (`globalThis.crypto`) modules in Core
 * packages. Core must be deterministic and side-effect free; cryptography
 * belongs in Adapters that own runtime concerns.
 *
 * Standard references:
 *   - layering-policy.md §2.2 (Core boundaries)
 *   - adapters.md
 */

type Rule = unknown;

const FORBIDDEN_SPECIFIERS = new Set(["crypto", "node:crypto", "webcrypto"]);

const messages = {
  forbiddenImport:
    "Importing '{{specifier}}' is forbidden in Core (layering-policy.md §2.2). Use a Technology Adapter instead.",
  forbiddenGlobal:
    "Accessing the `crypto` global is forbidden in Core (layering-policy.md §2.2). Use a Technology Adapter instead.",
};

function isInCorePackage(filename: string): boolean {
  return (
    filename.includes("/packages/") &&
    (filename.includes("/primitives/") ||
      filename.includes("/kernel/") ||
      filename.includes("/composition/") ||
      filename.includes("/http/") ||
      filename.includes("/router/") ||
      filename.includes("/html/") ||
      filename.includes("/hydration/") ||
      filename.includes("/seo/") ||
      filename.includes("/content/") ||
      filename.includes("/media/") ||
      filename.includes("/search/") ||
      filename.includes("/cache/") ||
      filename.includes("/auth/") ||
      filename.includes("/catalog/") ||
      filename.includes("/customer/") ||
      filename.includes("/inventory/") ||
      filename.includes("/order/") ||
      filename.includes("/payment/") ||
      filename.includes("/pricing/") ||
      filename.includes("/storefront/") ||
      filename.includes("/taxonomy/") ||
      filename.includes("/validation/") ||
      filename.includes("/address/") ||
      filename.includes("/geography/") ||
      filename.includes("/identity/") ||
      filename.includes("/organization/"))
  );
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `crypto` imports in Core packages — cryptography belongs in Adapters.",
      category: "Comity Architecture",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceName: {
            type: "string",
            description:
              "Name of the source package (e.g., '@comity/auth'). Used to scope the rule.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages,
  },
  create(context: any) {
    const opts = (context.options[0] ?? {}) as {
      sourceName?: string;
    };
    const sourceName = opts.sourceName ?? null;

    // If sourceName provided, use it for classification; otherwise fall back to filename
    const inCore = sourceName
      ? sourceName.startsWith("@comity/") &&
        !["@comity/cli", "@comity/graphql-builder"].includes(sourceName)
      : isInCorePackage(context.filename ?? context.getFilename());

    // Disable this rule outside Core packages
    if (!inCore) {
      return {};
    }

    function checkSpecifier(value: string | null | undefined): boolean {
      if (!value) return false;
      return FORBIDDEN_SPECIFIERS.has(value);
    }

    return {
      ImportDeclaration(node: any) {
        if (checkSpecifier(node.source.value)) {
          context.report({
            node,
            messageId: "forbiddenImport",
            data: { specifier: node.source.value },
          });
        }
      },
      ImportExpression(node: any) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string" &&
          checkSpecifier(node.source.value)
        ) {
          context.report({
            node,
            messageId: "forbiddenImport",
            data: { specifier: node.source.value },
          });
        }
      },
      Identifier(node: any) {
        if (node.name !== "crypto") return;
        // Top-level access of the `crypto` global
        const parent = node.parent;
        if (!parent) return;
        if (
          parent.type === "ExpressionStatement" ||
          parent.type === "CallExpression" ||
          parent.type === "MemberExpression"
        ) {
          context.report({ node, messageId: "forbiddenGlobal" });
        }
      },
    };
  },
};

export default rule;
