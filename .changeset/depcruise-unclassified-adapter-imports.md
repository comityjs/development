---
"@comity-dev/dependency-rules": patch
"@comity-dev/validate": patch
---

Adapter sources no longer escape the `dependencies` category when they import a Comity package that is not classified.

Layer rules for Core, Kernel, Composition and Primitives already rejected an unclassified Comity import, but adapters have no such catch-all, so an adapter importing a resolvable installed `@comity/*` package that no workspace package declares (including one that is only a transitive dependency) matched no rule and passed.

- `@comity-dev/dependency-rules`: new rule `comity-package-must-be-classified` rejects, from every file of every workspace adapter, a `@comity/*` or `@comity-dev/*` import (resolved in a hoisted or pnpm layout, or unresolved; root or subpath) whose package is neither a workspace package nor a classified installed package. Other third-party packages are not matched. `comity-import-must-resolve` now covers known names only, so no import is reported twice.
- `@comity-dev/validate`: findings for an undeclared package now state what is wrong from the manifest of the package that was actually resolved: installed with its version and layer but not declared, unclassifiable, or not installed. An undeclared package is never given a layer or treated as declared.

Existing rules, the test-only sibling-adapter exception and Core → Core semantics are unchanged. Repositories whose adapters import a Comity package that no workspace package declares will now fail this check and must declare it.
