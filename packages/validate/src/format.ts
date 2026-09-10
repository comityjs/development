import type { Finding } from "./engines/types.js";
import type { CategoryResult } from "./run.js";

export interface FormatInput {
  /** Whether the overall validation passed or failed */
  passed: boolean;

  /** The list of all findings across all categories */
  violations: Finding[];

  /** The results of each validation category */
  categories: {
    /** Schema validation results */
    schema: CategoryResult;

    /** Package metadata validation results */
    metadata: CategoryResult;

    /** Comity config validation results */
    config: CategoryResult;

    /** Dependency validation results */
    dependencies: CategoryResult;

    /** ESLint validation results */
    eslint: CategoryResult;

    /** Semgrep validation results */
    semgrep: CategoryResult;

    /** Adapter peers validation results */
    adapterPeers: CategoryResult;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  schema: "Schema",
  metadata: "Package metadata",
  config: "Comity config",
  dependencies: "Dependencies (depcruise)",
  eslint: "Source rules (ESLint)",
  semgrep: "Structural patterns (Semgrep)",
  adapterPeers: "Adapter peers",
};

function statusBadge(cat: CategoryResult): string {
  switch (cat.status) {
    case "PASS":
      return "PASS";

    case "FAIL":
      return "FAIL";

    case "NOT-RUN":
      return "NOT-RUN";

    case "TOOL-UNAVAILABLE":
      return "TOOL-UNAVAILABLE";

    case "CONFIGURATION-ERROR":
      return "CONFIG-ERROR";

    case "EXECUTION-ERROR":
      return "EXEC-ERROR";

    case "NOT-APPLICABLE":
      return "NOT-APPLICABLE";

    default:
      return cat.executed ? (cat.passed ? "PASS" : "FAIL") : "NOT-RUN";
  }
}

/**
 * Format a unified summary for the terminal.
 */
export function formatSummary(result: FormatInput): string {
  const lines: string[] = ["Comity validation", ""];

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const cat = result.categories[key as keyof FormatInput["categories"]];

    if (!cat) continue;

    const badge = statusBadge(cat);
    const count = cat.findings > 0 ? ` (${cat.findings} findings)` : "";
    const exit =
      cat.exitCode !== null && cat.exitCode !== 0
        ? ` exit=${cat.exitCode}`
        : "";

    lines.push(`${badge.padEnd(18)}  ${label}${count}${exit}`);
  }

  lines.push("");

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const cat = result.categories[key as keyof FormatInput["categories"]];

    if (!cat) continue;

    if (
      cat.status === "TOOL-UNAVAILABLE" ||
      cat.status === "CONFIGURATION-ERROR" ||
      cat.status === "EXECUTION-ERROR" ||
      cat.status === "NOT-APPLICABLE"
    ) {
      lines.push(`  ${label}: ${cat.reason ?? cat.status}`);
    }
  }

  lines.push("");
  lines.push(`Result: ${result.passed ? "PASS" : "FAIL"}`);

  return lines.join("\n");
}

/**
 * Format detailed violations for debugging.
 */
export function formatViolations(violations: Finding[]): string {
  if (violations.length === 0) return "";

  const lines: string[] = [`${violations.length} violation(s):\n`];

  for (const v of violations) {
    const loc = v.file
      ? ` ${v.file}${v.line ? `:${v.line}` : ""}${v.column ? `:${v.column}` : ""}`
      : "";

    lines.push(`[${v.tool}] ${v.rule} ${v.package ?? ""}${loc} — ${v.message}`);
  }

  return lines.join("\n");
}
