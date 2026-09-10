/**
 * @comity-dev/no-date-in-core
 *
 * Forbid `Date`, `performance.now`, and `Math.random` access in Core and
 * Kernel packages — they introduce non-deterministic behavior that breaks
 * the Comity reproducibility contract.
 *
 * Legitimate exceptions:
 * - Telemetry/timing measurements using `performance.now()` (observational, not domain logic)
 * - Timestamp generation using `Date.now()` or `Date` constructor for logging/metadata
 * - Time primitives in `@comity/primitives/time` (explicitly allowed)
 *
 * Standard references:
 *   - layering-policy.md §6 (determinism)
 *   - domain-modeling.md
 */

type Rule = unknown;

const FORBIDDEN_GLOBALS = new Set(["Date", "performance"]);
const FORBIDDEN_PROPERTIES: Record<string, string[]> = {
  Math: ["random"],
};

// Package names that are explicitly allowed to use Date/performance for telemetry
const TELEMETRY_ALLOWLIST = new Set([
  "@comity/primitives", // time/instant primitives
  "@comity/http", // facade timing
  "@comity/html", // renderer pipeline timing
  "@comity/hydration", // browser capability implementations (createBrowserHydrationCapabilities, createNoopHydrationCapabilities)
]);

// Allowlist for specific property access patterns that are legitimate telemetry
const TELEMETRY_PROPERTY_ALLOWLIST = new Set([
  "performance.now",
  "Date.now",
]);

const messages = {
  forbiddenGlobal:
    "Non-deterministic global '{{name}}' is forbidden in Core / Kernel (layering-policy.md §6). Use telemetry allowlist or primitives/time for timing.",
  forbiddenProperty:
    "Non-deterministic '{{object}}.{{property}}' is forbidden in Core / Kernel (layering-policy.md §6).",
};

function isInCoreOrKernelPackage(filename: string): boolean {
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
      filename.includes("/search/"))
  );
}

function isTelemetryAllowedPackage(filename: string): boolean {
  return Array.from(TELEMETRY_ALLOWLIST).some(
    (pkg) => filename.includes(`/packages/${pkg.replace("@comity/", "")}/`) || filename.includes(`/community/packages/${pkg.replace("@comity/", "")}/`),
  );
}

function isTelemetryPropertyAccess(objectName: string, propertyName: string): boolean {
  return TELEMETRY_PROPERTY_ALLOWLIST.has(`${objectName}.${propertyName}`);
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Date / performance.now / Math.random in Core and Kernel packages.",
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
              "Name of the source package (e.g., '@comity/http'). Used to scope the rule.",
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
    const inCoreOrKernel = sourceName
      ? sourceName.startsWith("@comity/") &&
        !["@comity/cli", "@comity/graphql-builder"].includes(sourceName) // these are not core/kernel
      : isInCoreOrKernelPackage(context.filename ?? context.getFilename());

    // Disable this rule outside Core/Kernel packages
    if (!inCoreOrKernel) {
      return {};
    }

    // Check if this package is allowed to use telemetry patterns
    const allowTelemetry = sourceName
      ? TELEMETRY_ALLOWLIST.has(sourceName)
      : isTelemetryAllowedPackage(context.filename ?? context.getFilename());

    return {
      Identifier(node: any) {
        // Detect globals like `Date` and `performance`
        if (
          (node.name === "Date" || node.name === "performance") &&
          // Only top-level usage (not as property of another object)
          node.parent &&
          (node.parent.type === "ExpressionStatement" ||
            node.parent.type === "VariableDeclarator" ||
            node.parent.type === "CallExpression" ||
            node.parent.type === "NewExpression" ||
            node.parent.type === "MemberExpression")
        ) {
          // Allow telemetry patterns in allowlisted packages
          if (allowTelemetry && isTelemetryPropertyAccess(node.parent.object?.name ?? "", node.name)) {
            return;
          }

          // Allow Date.now() and performance.now() in telemetry allowlisted packages
          if (
            allowTelemetry &&
            ((node.name === "Date" && node.parent.type === "MemberExpression" && node.parent.property?.name === "now") ||
              (node.name === "performance" && node.parent.type === "MemberExpression" && node.parent.property?.name === "now"))
          ) {
            return;
          }

          // Also handle optional chaining: window?.performance?.now()
          // Walk up the ancestor chain to find a MemberExpression with property 'now'
          if (allowTelemetry && (node.name === "Date" || node.name === "performance")) {
            let current = node.parent;
            while (current) {
              if (current.type === "MemberExpression" && current.property?.name === "now") {
                return;
              }
              if (current.type === "ChainExpression") {
                current = current.expression;
                continue;
              }
              current = current.parent;
            }
          }

          if (FORBIDDEN_GLOBALS.has(node.name)) {
            context.report({
              node,
              messageId: "forbiddenGlobal",
              data: { name: node.name },
            });
          }
        }

        // Detect property access like Math.random
        if (
          node.parent &&
          node.parent.type === "MemberExpression" &&
          node.parent.property === node
        ) {
          const obj = node.parent.object;
          if (obj.type === "Identifier") {
            const allowed = FORBIDDEN_PROPERTIES[obj.name];
            if (allowed && allowed.includes(node.name)) {
              // Allow Math.random in primitives/time (explicit time primitive)
              if (allowTelemetry && sourceName === "@comity/primitives") {
                return;
              }
              context.report({
                node,
                messageId: "forbiddenProperty",
                data: { object: obj.name, property: node.name },
              });
            }
          }
        }
      },
    };
  },
};

export default rule;
