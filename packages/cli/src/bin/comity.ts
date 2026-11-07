#!/usr/bin/env node

/**
 * comity — Comity unified developer CLI.
 *
 * Usage:
 *   comity <command> [options]
 *
 * Commands:
 *   validate        Run architecture validation
 *   normalize       Normalize package metadata (exports, package.json)
 *   build           Build a package (internal use)
 *
 * Options:
 *   --help, -h      Show help
 *   --version, -v   Show version
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Command {
  name: string;
  description: string;
  /** Package that declares the executable, as a dependency of this CLI. */
  pkg: string;
  /** Name of the executable in that package's `bin` map. */
  bin: string;
  args: string[];
}

const COMMANDS: Record<string, Command> = {
  validate: {
    name: "validate",
    description: "Run architecture validation",
    pkg: "@comity-dev/validate",
    bin: "comity-validate",
    args: [],
  },
  "normalize:package-json": {
    name: "normalize package-json",
    description: "Normalize package.json key order",
    pkg: "@comity-dev/package-tools",
    bin: "comity-normalize-package-json",
    args: [],
  },
  "normalize:exports": {
    name: "normalize exports",
    description: "Normalize TypeScript export declarations",
    pkg: "@comity-dev/package-tools",
    bin: "comity-normalize-exports",
    args: [],
  },
  build: {
    name: "build",
    description: "Build a package (internal use)",
    pkg: "@comity-dev/build",
    bin: "comity-build",
    args: [],
  },
} as const;

type CommandName = keyof typeof COMMANDS;

function printHelp(): void {
  console.log(`comity — Comity unified developer CLI

Usage:
  comity <command> [options]

Commands:
  validate                Run architecture validation
  normalize package-json  Normalize package.json key order
  normalize exports       Normalize TypeScript export declarations
  build                   Build a package (internal use)

Options:
  --help, -h              Show this help
  --version, -v           Show version

Examples:
  comity validate --repo .
  comity normalize package-json --check
  comity normalize exports --check
  comity build --watch
`);
}

/**
 * Resolve an executable declared in the `bin` map of one of this CLI's own
 * dependencies.
 *
 * The package is resolved from this module's location (so it follows the CLI's
 * dependency graph, not the consumer's), and the executable path is read from
 * the package's `package.json`. `node_modules/.bin` is deliberately not used:
 * package managers only link `.bin` entries for a project's direct
 * dependencies, so a transitive dependency's executable is absent there under
 * pnpm.
 */
function resolveBinary(pkgName: string, binName: string): string {
  let entry: string;

  try {
    entry = fileURLToPath(import.meta.resolve(pkgName));
  } catch (cause) {
    throw new Error(
      `Cannot resolve "${pkgName}", which provides "${binName}". ` +
        `It is a dependency of @comity-dev/cli; reinstall @comity-dev/cli.`,
      { cause },
    );
  }

  // The package's exports map does not expose package.json, so locate the
  // manifest by walking up from the resolved public entry point.
  let dir = dirname(entry);

  for (;;) {
    const manifestPath = resolve(dir, "package.json");
    let manifest: { name?: string; bin?: string | Record<string, string> };

    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = {};
    }

    if (manifest.name === pkgName) {
      const bin = manifest.bin;
      const rel =
        typeof bin === "string"
          ? binName === pkgName.split("/").pop()
            ? bin
            : undefined
          : bin?.[binName];

      if (!rel) {
        throw new Error(
          `"${pkgName}" (${manifestPath}) does not declare a "${binName}" executable in its "bin" field.`,
        );
      }

      return resolve(dir, rel);
    }

    const parent = dirname(dir);

    if (parent === dir) {
      throw new Error(
        `Cannot locate the package.json of "${pkgName}" above ${entry}.`,
      );
    }

    dir = parent;
  }
}

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function execBinary(command: Command, args: string[]): Promise<number> {
  const scriptPath = resolveBinary(command.pkg, command.bin);

  return new Promise((resolvePromise, reject) => {
    // Run through the current Node binary: no reliance on shebangs, file mode
    // bits, or `.cmd` shims.
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    const forwarders = FORWARDED_SIGNALS.map((signal) => {
      const forward = (): void => {
        child.kill(signal);
      };

      process.on(signal, forward);

      return [signal, forward] as const;
    });

    const detach = (): void => {
      for (const [signal, forward] of forwarders) {
        process.off(signal, forward);
      }
    };

    child.on("close", (code, signal) => {
      detach();

      if (signal) {
        // Child was killed by a signal: report it as the conventional
        // 128 + signo exit status rather than as success.
        resolvePromise(128 + (osConstants.signals[signal] ?? 1));

        return;
      }

      resolvePromise(code ?? 1);
    });

    child.on("error", (cause) => {
      detach();
      reject(
        new Error(`Failed to execute ${command.bin} (${scriptPath})`, {
          cause,
        }),
      );
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("0.1.0");
    process.exit(0);
  }

  if (args.length === 0) {
    console.error("Error: No command specified");
    printHelp();
    process.exit(1);
  }

  const commandName = args[0];
  const commandArgs = args.slice(1);

  // Handle subcommands
  let fullCommandName: CommandName = commandName as CommandName;

  if (commandName === "normalize" && commandArgs.length > 0) {
    fullCommandName = `normalize:${commandArgs[0]}` as CommandName;

    commandArgs.shift();
  }

  const command = COMMANDS[fullCommandName];

  if (!command) {
    console.error(`Error: Unknown command "${commandName}"`);
    printHelp();
    process.exit(1);
  }

  // Pass through remaining args
  const allArgs = [...command.args, ...commandArgs];

  try {
    const exitCode = await execBinary(command, allArgs);

    process.exit(exitCode);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
