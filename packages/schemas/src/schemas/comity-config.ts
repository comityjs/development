import type { Ajv, ErrorObject } from "ajv";

import { createAjvInstance } from "../ajv-instance.js";

/**
 * Canonical schema for repository `comity.config.json`.
 *
 * The configuration holds REPOSITORY FACTS — package locations, repository
 * type, declared exceptions. It MUST NOT silently redefine Comity-wide
 * policy; policy belongs in the Standards and is enforced by shared tools.
 *
 * @see layering-policy.md (policy owner)
 * @see ADR-007 (integration-adapter vs technology-adapter categorization)
 */
export const comityConfigSchema = {
  $id: "https://comityjs.dev/schemas/comity-config.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["repository", "packages"],
  properties: {
    repository: {
      type: "object",
      required: ["name", "type"],
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "Logical name of the repository.",
        },
        type: {
          type: "string",
          enum: [
            "development",
            "community",
            "enterprise",
            "third-party",
            "fixture",
          ],
          description: "Repository category.",
        },
      },
    },
    packages: {
      type: "object",
      required: ["roots"],
      additionalProperties: false,
      properties: {
        roots: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          description:
            "Workspace package roots, relative to the repository root.",
        },
        exclude: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "Package path patterns to exclude from validation.",
        },
      },
    },
    validation: {
      type: "object",
      additionalProperties: false,
      properties: {
        rules: {
          type: "object",
          description:
            "Repository-specific rule selection. Allowed keys: metadata, dependencies, eslint, semgrep, orchestrator.",
          additionalProperties: { type: "boolean" },
        },
        exceptions: {
          type: "object",
          additionalProperties: false,
          properties: {
            dependencyEdges: {
              type: "array",
              description:
                "Locally-permitted dependency edges. Each entry MUST reference an ADR.",
              items: {
                type: "object",
                required: ["from", "to", "adr"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  adr: { type: "string" },
                  rationale: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            layerOverrides: {
              type: "array",
              description:
                "Layer classification overrides — for transitional packages only.",
              items: {
                type: "object",
                required: ["package", "layer", "adr"],
                properties: {
                  package: { type: "string" },
                  layer: { type: "string" },
                  adr: { type: "string" },
                  rationale: { type: "string" },
                },
                additionalProperties: false,
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Validates a parsed comity.config.json document.
 *
 * @param document — parsed comity.config.json
 * @param ajv — optional pre-built Ajv instance
 * @returns validation result
 */
export function validateComityConfig(
  document: unknown,
  ajv: Ajv = createAjvInstance(),
): { valid: boolean; errors: ErrorObject[] } {
  const validate = ajv.compile(comityConfigSchema);
  const valid = validate(document);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []),
  };
}

export interface ComityConfig {
  repository: { name: string; type: string };
  packages: { roots: string[]; exclude?: string[] };
  validation?: {
    rules?: Record<string, boolean>;
    exceptions?: {
      dependencyEdges?: Array<{
        from: string;
        to: string;
        adr: string;
        rationale?: string;
      }>;
      layerOverrides?: Array<{
        package: string;
        layer: string;
        adr: string;
        rationale?: string;
      }>;
    };
  };
}
