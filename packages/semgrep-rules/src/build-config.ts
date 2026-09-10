import { readFile } from "node:fs/promises";
import { listRuleFiles } from "./filesystem.js";

/**
 * Builds a single combined Semgrep config file from all canonical rule
 * files. Semgrep's CLI accepts a single `--config`; the validate engine
 * writes the combined content to a temp file and invokes semgrep with
 * that path.
 */
export async function buildSemgrepConfig(): Promise<string> {
  const files = await listRuleFiles();
  const ruleBlocks: string[] = [];

  for (const f of files) {
    const text = await readFile(f, "utf8");
    // Strip the top-level `rules:` line; we want just the array entries.
    const body = text.replace(/^\s*rules:\s*\n/m, "");

    ruleBlocks.push(body.trimEnd());
  }

  return `rules:\n${ruleBlocks.join("\n")}\n`;
}
