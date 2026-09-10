import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSemgrepYaml, type ParsedSemgrepRule } from "./parse-yaml.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(__dirname, "..", "rules");

export interface SemgrepRule extends ParsedSemgrepRule {
  /** The absolute path of the rule file from which this rule was loaded. */
  file: string;
}

/** Returns the canonical rule file paths under `./rules/`. */
export async function listRuleFiles(): Promise<string[]> {
  const entries = await readdir(RULES_DIR);

  return entries
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => join(RULES_DIR, f));
}

/** Loads and parses a single Semgrep rule file. */
export async function loadRule(filePath: string): Promise<SemgrepRule[]> {
  const text = await readFile(filePath, "utf8");

  return parseSemgrepYaml(text).map((r) => ({ ...r, file: filePath }));
}

/** Loads every rule in the package and returns them as a flat array. */
export async function loadAllRules(): Promise<SemgrepRule[]> {
  const files = await listRuleFiles();
  const all: SemgrepRule[] = [];

  for (const f of files) {
    const rules = await loadRule(f);

    all.push(...rules);
  }

  return all;
}
