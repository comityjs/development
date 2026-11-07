import type { Ajv, ErrorObject } from "ajv";

import { createAjv2020Instance } from "../ajv-instance.js";
import {
  adr008CanonicalRegister,
  adr008RegisterSchemaDocument,
} from "./adr-008-canonical.generated.js";

/**
 * Canonical schema for the ADR-008 Core Exception Register.
 *
 * Derived at build time from the canonical JSON Schema
 * `docs/standards/decisions/data/adr-008-core-exception-register.schema.json`
 * (ADR-009 §3, §5). It is a JSON Schema 2020-12 document, so it must be
 * compiled with {@link createAjv2020Instance}.
 *
 * @see ADR-008 — Explicit Core Module Composition Exceptions
 * @see ADR-009 — Machine-Readable Core Exception Register
 */
export const adr008RegisterSchema: Record<string, unknown> =
  adr008RegisterSchemaDocument;

/**
 * Canonical ADR-008 register, derived at build time from
 * `docs/standards/decisions/data/adr-008-core-exception-register.json`.
 * ADR-008 (Markdown) remains the architectural authority.
 */
export const adr008CoreExceptionRegister: Adr008Register =
  adr008CanonicalRegister;

/**
 * Validates a parsed ADR-008 register document against the canonical schema.
 *
 * @param document — parsed ADR-008 register
 * @param ajv — optional pre-built Ajv instance; it MUST support JSON Schema
 *   2020-12 (use {@link createAjv2020Instance})
 * @returns validation result
 */
export function validateAdr008Register(
  document: unknown,
  ajv: Ajv = createAjv2020Instance(),
): { valid: boolean; errors: ErrorObject[] } {
  const id = adr008RegisterSchema["$id"] as string;
  const validate = ajv.getSchema(id) ?? ajv.compile(adr008RegisterSchema);
  const valid = validate(document);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []),
  };
}

export interface Adr008RegisterEdge {
  from: string;
  to: string;
  layer: string;
  categories: string[];
  importKind: string;
  lifecycle: string;
  justification: string;
  adrReference: string;
  removalCandidate?: { criteria: string; action: string };
}

export interface Adr008Register {
  $schema: string;
  schemaVersion: number;
  authority: string;
  source: string;
  edges: Adr008RegisterEdge[];
}
