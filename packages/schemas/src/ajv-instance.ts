import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Creates a fresh Ajv instance with strict settings and standard formats.
 *
 * @returns Configured Ajv instance
 */
export function createAjvInstance(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    strictTypes: false,
    verbose: true,
  });

  addFormats(ajv);

  return ajv;
}

/**
 * Creates a fresh Ajv instance for JSON Schema draft 2020-12 documents, such
 * as the canonical ADR-008 register schema. Separate from
 * {@link createAjvInstance} so the draft-07 package-metadata and config
 * schemas are unaffected.
 *
 * @returns Configured Ajv 2020-12 instance
 */
export function createAjv2020Instance(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    strictTypes: false,
    verbose: true,
  });

  addFormats(ajv);

  return ajv;
}
