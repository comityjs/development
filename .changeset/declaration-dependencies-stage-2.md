---
"@comity-dev/validate": minor
---

Add stage-2 `packed-surface` tarball validation (ADR-035 D-03, design §12).

`--only=packed-surface` packs every publishable package with `pnpm pack`, reads the resulting tarball with the system `tar`
(no new dependency) and applies `ARCH-PACK-001…006` to the published surface: absent `exports` / `main` / `module` / `types` /
`typesVersions` / `bin` targets, relative declarations missing from the tarball, external references evaluated against the
packed manifest, unrewritten `workspace:` / `file:` / `link:` specifiers, exact sibling pins without a recorded ADR-033
exception, and ESM-only conformance.

The category is opt-in and runs in the release workflows after `Build` and before publication. Enforcement is report-only
until the repository variable `COMITY_PACKED_SURFACE_ENFORCEMENT` is `true`, which is gated on WP-A1, WP-A4 and WP-B formal
ratification.
