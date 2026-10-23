---
"@comity-dev/eslint-plugin": minor
---

Add the `require-internal-marker` rule and enable it in the recommended set.
The rule enforces the approved Contract B: production TypeScript sources under
`packages/*/src/internal/**` and `packages/*/src/lazy/**` MUST declare an
`@internal` JSDoc tag, either inline or as a conventional multiline docblock.
Because the rule inspects real JSDoc comments through ESLint's source-code
APIs, marker-like text in strings, template literals, tagged templates,
regular-expression literals, line comments, ordinary block comments, and JSDoc
prose does not satisfy it. It replaces the retired Semgrep rule
`comity-module-must-have-internal-marker` and MUST ship in the same release
cohort as the `@comity-dev/semgrep-rules` and `@comity-dev/validate` patches.
