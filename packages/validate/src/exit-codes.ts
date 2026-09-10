/**
 * Canonical exit codes for `comity validate`.
 *
 *   0 = validation passed
 *   1 = validation failed (violations found)
 *   2 = configuration / discovery error (cannot run)
 *   3 = tool not installed (e.g. dependency-cruiser missing)
 */
export const ExitCode = Object.freeze({
  PASS: 0,
  FAIL: 1,
  CONFIG_ERROR: 2,
  TOOL_MISSING: 3,
} as const);

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
