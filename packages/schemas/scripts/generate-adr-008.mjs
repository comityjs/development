// Generates src/schemas/adr-008-canonical.generated.ts from the canonical ADR-008
// register and schema in docs/standards/decisions/data/ (ADR-009 §3, §5).
//
// The canonical JSON files are the only authored source. The generated file is a
// derived embedding so the published package cannot carry a hand-maintained copy.
// `pnpm --filter @comity-dev/schemas generate` rewrites it; the test suite fails if
// the committed file differs from what this script would write.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../docs/standards/decisions/data");
const outFile = resolve(here, "../src/schemas/adr-008-canonical.generated.ts");

const read = (name) => JSON.parse(readFileSync(resolve(dataDir, name), "utf8"));

export function render() {
  const schema = read("adr-008-core-exception-register.schema.json");
  const register = read("adr-008-core-exception-register.json");
  return [
    "// GENERATED FILE — DO NOT EDIT.",
    "// Source: docs/standards/decisions/data/adr-008-core-exception-register{,.schema}.json",
    "// Regenerate with: pnpm --filter @comity-dev/schemas generate",
    "",
    'import type { Adr008Register } from "./adr-008-register.js";',
    "",
    `export const adr008RegisterSchemaDocument: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};`,
    "",
    `export const adr008CanonicalRegister: Adr008Register = ${JSON.stringify(register, null, 2)};`,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(outFile, render());
}
