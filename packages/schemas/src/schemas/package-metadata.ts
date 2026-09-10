import type { Ajv, ErrorObject } from "ajv";

import { createAjvInstance } from "../ajv-instance.js";
import {
  MIN_NODE_VERSION,
  PACKAGE_NAME_PATTERN,
  RUNTIME_LAYERS,
  VALID_LAYERS,
} from "../constants.js";

/**
 * Canonical schema for Comity package metadata.
 *
 * Covers both namespaces, with a name-scope ↔ layer boundary:
 *   - `@comity/*` (runtime)     → `comity.layer` MUST be one of the six
 *                                 runtime layers (ADR-026).
 *   - `@comity-dev/*` (tooling) → `comity.layer` MUST be `dev-tooling`.
 *
 * The boundary is enforced by the `if/then/else` clause on `comity.layer`.
 *
 * @see ADR-026 — Architecture Validator Authoritative Classification
 * @see layering-policy.md §2.1
 * @see architecture-validation.md §8 (package naming, type, engines.node)
 * @see public-api.md §3 (exports subpath rules)
 *
 * This schema is the authoritative machine-readable definition of what every
 * Comity package manifest MUST contain. Repositories consume this schema via
 * the shared `comity-validate` orchestrator; they do not redefine it.
 */
export const packageMetadataSchema = {
  $id: "https://comityjs.dev/schemas/package-metadata.v1.json",
  type: "object",
  required: ["name", "version", "type", "license", "engines", "exports"],
  additionalProperties: true,
  properties: {
    name: {
      type: "string",
      pattern: PACKAGE_NAME_PATTERN,
      description:
        "Package name MUST follow the `@comity/<kebab-case-name>` or `@comity-dev/<kebab-case-name>` convention.",
    },
    version: {
      type: "string",
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+",
      description: "Semantic version of the package.",
    },
    type: {
      const: "module",
      description: "Package type MUST be `module` (ESM).",
    },
    license: {
      type: "string",
      minLength: 1,
      description: "Package license MUST be declared.",
    },
    engines: {
      type: "object",
      required: ["node"],
      properties: {
        node: {
          type: "string",
          pattern: `>=${MIN_NODE_VERSION}`,
          description: `Node.js engine MUST be >= ${MIN_NODE_VERSION}.`,
        },
      },
      additionalProperties: true,
    },
    comity: {
      type: "object",
      description:
        "Comity metadata — authoritative source of package classification.",
      required: ["layer"],
      properties: {
        layer: {
          type: "string",
          enum: [...VALID_LAYERS],
          description:
            "Architectural layer. Runtime `@comity/*` packages MUST use one of the six runtime layers (primitives, kernel, composition, core, technology-adapter, integration-adapter). Development `@comity-dev/*` packages MUST use `dev-tooling`.",
        },
        implements: {
          // Per ADR-026, `implements` is a single Core Module name. The
          // legacy validator reports a violation when this is an array;
          // we keep the schema strict and surface the violation through
          // the metadata check.
          type: "string",
          pattern: PACKAGE_NAME_PATTERN,
          description:
            "Single Core Module that this Adapter implements (technology-adapter and integration-adapter).",
        },
      },
      additionalProperties: false,
    },
    exports: {
      type: "object",
      description:
        "Declared public subpaths. Forbidden subpaths (utils, helpers, shared, internal, lazy) are validated by ESLint.",
      additionalProperties: true,
    },
    typesVersions: {
      type: "object",
      description:
        "TypeScript typesVersions MUST be consistent with declared exports.",
      additionalProperties: true,
    },
  },
  // Name-scope ↔ layer boundary. The runtime six-layer model is
  // preserved; `dev-tooling` is reserved for `@comity-dev/*`.
  // Implemented at the manifest level so `name` and `comity.layer`
  // can be evaluated as siblings.
  allOf: [
    {
      if: {
        properties: {
          name: { pattern: "^@comity/" },
        },
        required: ["name"],
      },
      then: {
        properties: {
          comity: {
            properties: {
              layer: { enum: [...RUNTIME_LAYERS] },
            },
          },
        },
      },
    },
    {
      if: {
        properties: {
          name: { pattern: "^@comity-dev/" },
        },
        required: ["name"],
      },
      then: {
        properties: {
          comity: {
            properties: {
              layer: { const: "dev-tooling" },
            },
          },
        },
      },
    },
  ],
};

/**
 * Validates a parsed package.json against the canonical schema.
 *
 * @param manifest — parsed package.json object
 * @param ajv — optional pre-built Ajv instance
 * @returns validation result
 */
export function validatePackageMetadata(
  manifest: unknown,
  ajv: Ajv = createAjvInstance(),
): ValidationResult {
  const validate = ajv.compile(packageMetadataSchema);
  const valid = validate(manifest);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []),
  };
}

export interface PackageMetadata {
  name: string;
  version: string;
  type: "module";
  license: string;
  engines: { node: string };
  comity?: {
    layer: string;
    implements?: string;
  };
  exports: Record<string, unknown>;
  typesVersions?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}
