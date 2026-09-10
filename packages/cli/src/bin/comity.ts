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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Command {
  name: string;
  description: string;
  bin: string;
  args: string[];
}

const COMMANDS: Record<string, Command> = {
  validate: {
    name: "validate",
    description: "Run architecture validation",
    bin: "comity-validate",
    args: [],
  },
  "normalize:package-json": {
    name: "normalize package-json",
    description: "Normalize package.json key order",
    bin: "comity-normalize-package-json",
    args: [],
  },
  "normalize:exports": {
    name: "normalize exports",
    description: "Normalize TypeScript export declarations",
    bin: "comity-normalize-exports",
    args: [],
  },
  build: {
    name: "build",
    description: "Build a package (internal use)",
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

function findRepoRoot(startDir: string): string {
  let dir = startDir;

  while (dir !== resolve(dir, "..")) {
    try {
      const pkgPath = resolve(dir, "package.json");
      const content = readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(content);
      if (pkg.workspaces) {
        return dir;
      }
    } catch {
      // ignore
    }
    dir = resolve(dir, "..");
  }

  return startDir;
}

function findBinary(name: string): string {
  // Find the binary in node_modules/.bin at the repo root
  const repoRoot = findRepoRoot(process.cwd());

  return resolve(repoRoot, "node_modules", ".bin", name);
}

function execBinary(binaryName: string, args: string[]): Promise<number> {
  const binaryPath = findBinary(binaryName);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(binaryPath, args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    child.on("close", (code) => {
      resolvePromise(code ?? 1);
    });

    child.on("error", (err) => {
      console.error(`Failed to execute ${binaryName}:`, err.message);
      reject(err);
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
    const exitCode = await execBinary(command.bin, allArgs);

    process.exit(exitCode);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
