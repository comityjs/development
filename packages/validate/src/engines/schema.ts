import type { Repository } from "../discover.js";
import type { EngineResult } from "./types.js";

import {
  comityConfigSchema,
  createAjvInstance,
  packageMetadataSchema,
} from "@comity-dev/schemas";

export function runSchema(repo: Repository): EngineResult {
  const start = Date.now();
  const findings: EngineResult["findings"] = [];

  const ajv = createAjvInstance();

  // Per-package metadata
  const validateMeta = ajv.compile(packageMetadataSchema);

  for (const pkg of repo.packages) {
    const valid = validateMeta(pkg.manifest);

    if (!valid) {
      for (const err of validateMeta.errors ?? []) {
        findings.push({
          tool: "schema",
          rule: "package-metadata",
          package: pkg.name,
          path: err.instancePath,
          message: err.message ?? "schema violation",
          keyword: err.keyword,
          severity: "error",
        });
      }
    }
  }

  // Repository config
  const validateConfig = ajv.compile(comityConfigSchema);
  const configValid = validateConfig(repo.config);

  if (!configValid) {
    for (const err of validateConfig.errors ?? []) {
      findings.push({
        tool: "schema",
        rule: "comity-config",
        path: err.instancePath,
        message: err.message ?? "schema violation",
        keyword: err.keyword,
        severity: "error",
      });
    }
  }

  return {
    executed: true,
    exitCode: 0,
    passed: findings.length === 0,
    findings,
    duration: Date.now() - start,
    status: findings.length === 0 ? "PASS" : "FAIL",
    tool: "schema",
  };
}
