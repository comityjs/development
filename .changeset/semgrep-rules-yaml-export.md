---
"@comity-dev/semgrep-rules": patch
---

Fix the rule-file export. The package declared `"./rules": "./rules/"`, a directory target that Node cannot resolve (`ERR_UNSUPPORTED_DIR_IMPORT` on `import`, `MODULE_NOT_FOUND` on `require`, deprecation `DEP0166`), while the README documented `@comity-dev/semgrep-rules/rules/<file>.yaml`, which failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The export map now declares `"./rules/*.yaml": "./rules/*.yaml"`, so each documented rule file resolves with `import.meta.resolve()` and `require.resolve()` without warnings. Only `*.yaml` files directly under `rules/` are exposed; they are configuration data to resolve to a path, not JavaScript modules to import. The previous `./rules` entry never worked, so no working behaviour is removed (patch). README corrected.
