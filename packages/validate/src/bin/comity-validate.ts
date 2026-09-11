#!/usr/bin/env node

/**
 * comity-validate — thin orchestrator over Comity shared validation tooling.
 *
 * Usage:
 *   comity-validate [options]
 *
 * Options:
 *   --help, -h           Show this help
 *   --verbose, -v        Print underlying tool output
 *   --repo <path>        Repository root (default: cwd)
 *   --only <category>    Only run a single category
 *                        (schema | metadata | config | dependencies | eslint | semgrep | adapter-peers)
 *                        Default: run all categories.
 *
 * Exit codes:
 *   0  validation passed
 *   1  validation failed (violations found)
 *   2  configuration / discovery error
 *   3  required tool not installed
 *
 * The TypeScript source for this binary lives at
 * `src/bin/comity-validate.ts` and is compiled to
 * `dist/bin/comity-validate.js` by `tsc -p tsconfig.json`.
 */

import { resolve } from "node:path";
import { ExitCode } from "../exit-codes.js";
import { formatSummary, formatViolations } from "../format.js";
import { runValidation } from "../run.js";

interface ParsedArgs {
  root: string;
  verbose: boolean;
  only: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    root: process.cwd(),
    verbose: false,
    only: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--verbose" || arg === "-v") args.verbose = true;
    else if (arg === "--repo") args.root = resolve(argv[++i] ?? "");
    else if (arg?.startsWith("--repo="))
      args.root = resolve(arg.slice("--repo=".length));
    else if (arg === "--only") args.only = argv[++i] ?? null;
    else if (arg?.startsWith("--only="))
      args.only = arg.slice("--only=".length);
  }

  return args;
}

function printHelp(): void {
  console.log(`comity-validate — thin orchestrator over Comity shared validation tooling

Usage:
  comity-validate [options]

Options:
  --help, -h           Show this help
  --verbose, -v        Print underlying tool output
  --repo <path>        Repository root (default: cwd)
  --only <category>    Only run a single category
                       (schema | metadata | config | dependencies | eslint | semgrep | adapter-peers)

Exit codes:
  0  validation passed
  1  validation failed
  2  configuration / discovery error
  3  required tool not installed
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(ExitCode.PASS);
  }

  try {
    const result = await runValidation({
      root: args.root,
      verbose: args.verbose,
      only: args.only,
    });

    console.log(formatSummary(result));

    if (!result.passed && args.verbose) {
      console.log("");
      console.log(formatViolations(result.violations));
    }

    process.exit(result.passed ? ExitCode.PASS : ExitCode.FAIL);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("comity-validate: configuration error:", message);
    process.exit(ExitCode.CONFIG_ERROR);
  }
}

main();
