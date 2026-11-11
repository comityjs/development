---
"@comity-dev/eslint-plugin": minor
---

`no-date-in-core` and `no-crypto-in-core` now scope by the package's declared layer instead of the `@comity/*` name prefix, so Technology Adapters and Integration Adapters are no longer reported. Both rules accept `sourceName` plus `classification` (as `no-layer-violation` does) and apply to `primitives`, `kernel`, `composition` and `core`; an unknown or invalid source layer is out of scope. `sourceName` alone no longer classifies a package: without `classification` the rules use their filename heuristic.

`no-layer-violation` gains the optional `consumes` option (additional Core Module contracts a Technology Adapter consumes, `adapters.md` §13; Core targets only) and the optional `development` option (devDependencies that test sources of a Technology Adapter may import). Without them the behaviour is unchanged.
