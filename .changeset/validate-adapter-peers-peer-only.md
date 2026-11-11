---
"@comity-dev/validate": minor
---

`adapter-peers` now supports the `peer-only` declaration model for `enterprise` repositories (package-dependency-policy §2): Technology Adapters declare the Core Module they implement and the Core Modules their production sources import as `peerDependencies`, with no Comity runtime dependency. `ARCH-ADAPTER-PEER-003` and `-004` read consumption from production imports, and the new `ARCH-ADAPTER-PEER-006` rejects a contract declared in both `dependencies` and `peerDependencies`. Repositories of every other type keep the paired `dependencies` + `peerDependencies` model unchanged.
