/**
 * @comity-dev/no-render-core-http-runtime
 *
 * Forbid Rendering Core Modules (html, hydration, search, seo, content)
 * from importing HTTP runtime implementations (http-hono, http-fetch,
 * html-preact, html-react, hydration-preact, hydration-react).
 *
 * The rule is scoped to only apply to files within the declared Rendering
 * Core packages. Technology adapters and client entry points are permitted
 * to import their respective runtimes.
 *
 * Standard references:
 *   - layering-policy.md §8 (rendering core MUST NOT depend on HTTP runtime)
 *   - architecture-validation.md §4.3
 */

type Rule = unknown;

const RENDERING_CORE_PACKAGES = new Set([
  "@comity/html",
  "@comity/hydration",
  "@comity/search",
  "@comity/seo",
  "@comity/content",
]);

const FORBIDDEN_RUNTIME_PACKAGES = new Set([
  "@comity/http-hono",
  "@comity/http-fetch",
  "@comity/html-preact",
  "@comity/html-react",
  "@comity/hydration-preact",
  "@comity/hydration-react",
]);

const messages = {
  forbiddenRuntime:
    "Rendering Core Module MUST NOT import HTTP/Rendering runtime '{{target}}' (layering-policy.md §8).",
};

function isInRenderingCorePackage(filename: string): boolean {
  return Array.from(RENDERING_CORE_PACKAGES).some(
    (pkg) => filename.includes(`/packages/${pkg.replace("@comity/", "")}/`),
  );
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Rendering Core Modules from importing HTTP / Rendering runtimes.",
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
              "Name of the source package (e.g., '@comity/html'). Used to scope the rule.",
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

    // If no sourceName provided, fall back to filename heuristic
    const inRenderingCore = sourceName
      ? RENDERING_CORE_PACKAGES.has(sourceName)
      : isInRenderingCorePackage(context.filename ?? context.getFilename());

    // Disable this rule outside rendering core packages
    if (!inRenderingCore) {
      return {};
    }

    function checkImport(specifier: string, node: unknown): void {
      if (!specifier.startsWith("@comity/")) return;
      if (FORBIDDEN_RUNTIME_PACKAGES.has(specifier)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.report({
          node: node as any,
          messageId: "forbiddenRuntime",
          data: { target: specifier },
        });
      }
    }

    return {
      ImportDeclaration(node: any) {
        checkImport(node.source.value, node);
      },
      ImportExpression(node: any) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string"
        ) {
          checkImport(node.source.value, node);
        }
      },
      ExportNamedDeclaration(node: any) {
        if (node.source && node.source.value) {
          checkImport(node.source.value, node);
        }
      },
    };
  },
};

export default rule;
