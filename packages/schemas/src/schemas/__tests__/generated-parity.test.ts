import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "../../..");

it("the committed generated file equals what the generator would write", async () => {
  const generator = await import(
    pathToFileURL(resolve(packageRoot, "scripts/generate-adr-008.mjs")).href
  );
  const committed = readFileSync(
    resolve(packageRoot, "src/schemas/adr-008-canonical.generated.ts"),
    "utf8",
  );
  // If this fails, the canonical register/schema changed: run
  // `pnpm --filter @comity-dev/schemas generate` and commit the result.
  expect(committed).toBe(generator.render());
});
