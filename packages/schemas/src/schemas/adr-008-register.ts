import type { Ajv, ErrorObject } from "ajv";

import { createAjvInstance } from "../ajv-instance.js";
import { PACKAGE_NAME_PATTERN } from "../constants.js";

/**
 * Canonical schema for the ADR-008 Core Exception Register.
 *
 * @see ADR-008 — Explicit Core Module Composition Exceptions
 * @see ADR-009 — Machine-Readable Core Exception Register
 *
 * Each repository owns its own register instance; the schema is shared
 * Development tooling. The register enumerates Core-to-Core dependency
 * edges that are explicitly permitted despite the default prohibition.
 */
export const adr008RegisterSchema = {
  $id: "https://comityjs.dev/schemas/adr-008-register.v1.json",
  type: "object",
  required: ["version", "edges"],
  additionalProperties: false,
  properties: {
    version: {
      type: "string",
      const: "1",
      description: "Schema version of the register document.",
    },
    edges: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        required: ["from", "to", "adr", "rationale"],
        additionalProperties: false,
        properties: {
          from: {
            type: "string",
            pattern: PACKAGE_NAME_PATTERN,
            description: "Source Core Module package name.",
          },
          to: {
            type: "string",
            pattern: PACKAGE_NAME_PATTERN,
            description: "Target Core Module package name.",
          },
          adr: {
            type: "string",
            pattern: "^ADR-[0-9]{3,4}.*$",
            description: "ADR reference approving this exception.",
          },
          rationale: {
            type: "string",
            minLength: 1,
            description: "Why this Core-to-Core edge is permitted.",
          },
        },
      },
    },
  },
};

/**
 * Validates a parsed ADR-008 register document.
 *
 * @param document — parsed ADR-008 register
 * @param ajv — optional pre-built Ajv instance
 * @returns validation result
 */
export function validateAdr008Register(
  document: unknown,
  ajv: Ajv = createAjvInstance(),
): { valid: boolean; errors: ErrorObject[] } {
  const validate = ajv.compile(adr008RegisterSchema);
  const valid = validate(document);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []),
  };
}

export interface Adr008Register {
  version: "1";
  edges: Array<{
    from: string;
    to: string;
    layer: string;
    categories: string[];
    importKind: string;
    lifecycle: string;
    justification: string;
    adrReference: string;
  }>;
}
