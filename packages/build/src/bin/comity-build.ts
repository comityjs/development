#!/usr/bin/env node

/**
 * comity-build — Comity package build tool.
 *
 * Usage:
 *   comity-build [options]
 *
 * Options:
 *   --help, -h     Show this help
 *   --watch, -w    Watch mode
 *
 * The tool reads the current working directory's tsconfig.json and builds
 * ESM, CJS, and type declaration outputs.
 */

import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", ".."); // monorepo root (from dist/bin/)
const CWD = process.cwd(); // package directory

/**
 * Execute a command as a child process.
 * @param {string} command - The command to execute.
 * @param {string[]} args - The command arguments.
 * @param {object} options - Additional options for spawn.
 * @returns {Promise<void>} - A promise that resolves when the command completes.
 */
function exec(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      args.filter((a) => a !== ""),
      {
        stdio: "inherit",
        cwd: options.cwd || CWD,
        ...options,
      },
    );

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Check if a file exists.
 * @param {string} path - The file path.
 * @returns {Promise<boolean>} - A promise that resolves to true if the file exists, false otherwise.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean the dist directory.
 */
async function clean(): Promise<void> {
  const distDir = join(CWD, "dist");

  if (await fileExists(distDir)) {
    console.log("Cleaning...");
    await rm(distDir, { recursive: true, force: true });
  }
}

/**
 * Build the package in the current working directory.
 * @param {object} options - Build options.
 */
async function buildPackage(options: { watch?: boolean } = {}): Promise<void> {
  const tsconfig = join(CWD, "tsconfig.json");

  if (!(await fileExists(tsconfig))) {
    console.warn("tsconfig.json not found, skipping build.");
    return;
  }

  // Watch mode
  if (options.watch) {
    console.log(`👀 Starting watch mode on ${relative(ROOT, CWD)}...`);

    await typeCheck(tsconfig);
    return watchBuildWithTSC(tsconfig);
  }

  console.log(`🏗️  Building ${relative(ROOT, CWD)}...`);

  // 1. Cleanup
  await clean();
  // 2. Type check
  await typeCheck(tsconfig);

  // 3. ESM + CJS + DTS build
  await buildWithTSC(tsconfig);

  console.log("Build completed\n");
}

/**
 * Type check the project using tsc.
 * @param {string} tsconfig - Path to the tsconfig.json file.
 */
async function typeCheck(tsconfig: string): Promise<void> {
  console.log("Type checking...");

  await exec("tsc", ["--noEmit", "--project", tsconfig]);
}

/**
 * Build the project using tsc with specific options.
 * @param {string} tsconfig - Path to the tsconfig.json file.
 */
async function buildWithTSC(tsconfig: string): Promise<void> {
  console.log("Building ESM...");

  await exec("tsc", [
    "--project",
    tsconfig,
    "--outDir",
    join(CWD, "dist", "esm"),
    "--declaration",
    "false",
    "--sourceMap",
    process.env["NODE_ENV"] !== "production" ? "true" : "false",
  ]);

  console.log("Building CJS...");

  await exec("tsc", [
    "--project",
    tsconfig,
    "--outDir",
    join(CWD, "dist", "cjs"),
    "--declaration",
    "false",
    "--sourceMap",
    process.env["NODE_ENV"] !== "production" ? "true" : "false",
    "--module",
    "CommonJS",
    "--moduleResolution",
    "node",
    "--allowSyntheticDefaultImports",
    "true",
  ]);

  console.log("Building types...");

  await exec("tsc", [
    "--project",
    tsconfig,
    "--outDir",
    join(CWD, "dist", "types"),
    "--declaration",
    "true",
    "--emitDeclarationOnly",
    "true",
    "--sourceMap",
    process.env["NODE_ENV"] !== "production" ? "true" : "false",
  ]);
}

/**
 * Watch mode build using tsc.
 * @param {string} tsconfig - Path to the tsconfig.json file.
 */
async function watchBuildWithTSC(tsconfig: string): Promise<void> {
  const processes: ReturnType<typeof spawn>[] = [];

  // Function to start a watch process
  function startWatchProcess(
    label: string,
    args: string[],
  ): ReturnType<typeof spawn> {
    console.log(`Starting ${label} watch...`);

    const child = spawn(
      "tsc",
      args.filter((a) => a),
      {
        stdio: "inherit",
        cwd: CWD,
      },
    );

    processes.push(child);

    return child;
  }

  try {
    startWatchProcess("ESM", [
      "--watch",
      "--preserveWatchOutput",
      "--project",
      tsconfig,
      "--outDir",
      join(CWD, "dist", "esm"),
      "--declaration",
      "false",
      "--sourceMap",
      "true",
    ]);
    startWatchProcess("CJS", [
      "--watch",
      "--preserveWatchOutput",
      "--project",
      tsconfig,
      "--outDir",
      join(CWD, "dist", "cjs"),
      "--declaration",
      "false",
      "--sourceMap",
      "true",
      "--module",
      "CommonJS",
      "--moduleResolution",
      "node",
      "--allowSyntheticDefaultImports",
      "true",
    ]);
    startWatchProcess("Types", [
      "--watch",
      "--preserveWatchOutput",
      "--project",
      tsconfig,
      "--outDir",
      join(CWD, "dist", "types"),
      "--declaration",
      "true",
      "--emitDeclarationOnly",
      "true",
      "--sourceMap",
      "true",
    ]);

    // Handle graceful shutdown on SIGINT
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        console.log("\nStopping watch processes...");
        processes.forEach((p) => p.kill("SIGINT"));
        resolve();
      });
    });
  } catch (error) {
    console.error(error);
    processes.forEach((p) => p.kill());
    throw error;
  }
}

// CLI entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Flags parsing
  const flags = {
    watch: args.includes("--watch") || args.includes("-w"),
    help: args.includes("--help") || args.includes("-h"),
  };

  if (flags.help) {
    console.log(`comity-build — Comity package build tool

Usage:
  comity-build [options]

Options:
  --help, -h     Show this help
  --watch, -w    Watch mode

The tool reads the current working directory's tsconfig.json and builds
ESM, CJS, and type declaration outputs.`);
    process.exit(0);
  }

  try {
    await buildPackage(flags);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
