---
"@comity-dev/validate": minor
---

Make the dependency-cruiser engine fail closed and read the real result schema.

The engine read a top-level `violations` property that dependency-cruiser does not emit (it is `summary.violations`), treated unparseable output as "no findings", and decided success from the exit code, which the JSON reporter always sets to 0. Together this reported `PASS` with 0 findings regardless of the dependency graph.

Why minor, not patch (0.x policy, `release-review.md`): this is a verdict change for the same input, not only a defect fix. Repositories that passed because nothing was evaluated can now `FAIL`, a repository without layered packages now reports `NOT-APPLICABLE` instead of `PASS`, and the engine requires `@comity-dev/dependency-rules` with `packagePaths` support. Consumers must expect their validation to start reporting real layering findings (including type-only imports) after upgrading.

- The result is validated strictly (root, `modules`, `summary`, counters, violation entries, rule set applied). Findings come from `summary.violations` with source, target, rule and severity; only `error` severity fails.
- Empty, malformed or unexpected output, crashes, start-up failures, signals and unexplained non-zero exits are `EXECUTION-ERROR`.
- The engine fails if the generated rules were not applied or govern no cruised module, and runs from the repository root.
