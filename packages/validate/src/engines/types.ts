export type EngineStatus =
  | "PASS"
  | "FAIL"
  | "NOT-RUN"
  | "TOOL-UNAVAILABLE"
  | "CONFIGURATION-ERROR"
  | "EXECUTION-ERROR"
  | "NOT-APPLICABLE";

export interface Finding {
  /* The tool that produced this finding, e.g. "schema", "eslint", "semgrep", etc. */
  tool: string;

  /* The rule that was violated, e.g. "package-metadata", "no-foo", etc. */
  rule: string;

  /* The package that produced this finding, if applicable. */
  package?: string | undefined;

  /* The path to the file that produced this finding, if applicable. */
  path?: string | undefined;

  /* A human-readable message describing the finding. */
  message: string;

  /* The severity of the finding, e.g. "error" or "warning". */
  severity: "error" | "warning";

  /* The file that produced this finding, if applicable. */
  file?: string | undefined;

  /* The line number in the file that produced this finding, if applicable. */
  line?: number | undefined;

  /* The column number in the file that produced this finding, if applicable. */
  column?: number | undefined;

  /* The keyword associated with this finding, if applicable. */
  keyword?: string | undefined;

  /* The source of this finding, if applicable. */
  source?: string | undefined;

  /* The remediation for this finding, if applicable. */
  remediation?: string | undefined;
}

export interface EngineResult {
  /* Whether the engine was executed or not. */
  executed: boolean;

  /* The exit code of the engine process, if applicable. */
  exitCode: number | null;

  /* Whether the engine passed or failed. */
  passed: boolean;

  /* The findings produced by the engine. */
  findings: Finding[];

  /* The duration of the engine execution in milliseconds. */
  duration: number;

  /* The status of the engine execution. */
  status: EngineStatus;

  /* The tool that produced this result, if applicable. */
  tool?: string | undefined;

  /* The reason for the engine result, if applicable. */
  reason?: string | undefined;
}
