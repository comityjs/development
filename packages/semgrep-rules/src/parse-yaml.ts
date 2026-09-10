/**
 * Internal helper for parsing Semgrep YAML rule files.
 *
 * The YAML format we target is a strict subset:
 *   rules:
 *     - id: <name>
 *       severity: <level>
 *       languages: [<lang>]
 *       message: |
 *         <text>
 *       pattern: |
 *         <pattern>
 *
 * We do not use a YAML library because the canonical rule files are
 * authored by the Development repository and follow a known shape.
 */

export interface ParsedSemgrepRule {
  id: string;
  severity: string | null;
  languages: string[] | null;
  message: string | null;
  raw: string;
}

export function parseSemgrepYaml(text: string): ParsedSemgrepRule[] {
  const ruleBlockRe =
    /^[ \t]{2}- id:\s*(.+?)\n((?:^(?![ \t]{2}- id:|rules:|---).*\n?)*)/gm;
  const rules: ParsedSemgrepRule[] = [];
  let match: RegExpExecArray | null;
  while ((match = ruleBlockRe.exec(text)) !== null) {
    const id = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    const severityMatch = body.match(/^\s*severity:\s*(.+)$/m);
    const languagesMatch = body.match(/languages:\s*\[(.+?)\]/m);
    const messageMatch = body.match(/message:\s*\|?\s*\n((?:[ \t]+.+\n?)*)/m);
    rules.push({
      id,
      severity: severityMatch?.[1]?.trim() ?? null,
      languages: languagesMatch?.[1]?.split(",").map((s) => s.trim()) ?? null,
      message: messageMatch?.[1]?.trim() ?? null,
      raw: `  - id: ${id}\n${body}`,
    });
  }
  return rules;
}
