import Ajv from "ajv";
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
