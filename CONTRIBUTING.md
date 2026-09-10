# Contributing to comity-development

## Overview

`comity-development` is the governance repository for Comity-wide standards, ADRs, and contributor conventions. It is not a runtime package repository.

Changes here affect **all** Comity repositories (Community, Enterprise, and future repositories).

## Governance Model

### What belongs here

| Artifact | Example |
|----------|---------|
| Comity-wide standards | Layering policy, coding conventions, testing standards |
| Comity-wide ADRs | Architecture decisions affecting the framework |
| Contributor conventions | AGENTS.md, PR requirements, review process |
| AI/agent conventions | Skill templates, agent operating model |
| Repository ownership model | This document, ownership matrix |
| Shared development tooling (future) | Architecture validator, CLI, scripts |

### What does NOT belong here

| Artifact | Owner |
|----------|-------|
| Runtime package code | `comity-community` / `comity-enterprise` |
| Community-specific CI | `comity-community` |
| Enterprise-specific CI | `comity-enterprise` |
| Community-specific documentation | `comity-community` |
| Migration/conformance state | `comity-community` |

## Contribution Process

### For Comity-wide standards and ADRs

1. **Propose** — Open an issue or discussion in this repository describing the change
2. **Classify** — Determine if this is a Comity-wide concern or repository-specific
3. **ADR** — Architectural changes require an ADR in `docs/standards/decisions/`
4. **Review** — Cross-repository review (Community + Enterprise maintainers)
5. **Merge** — Once approved, merge to main

### For contributor/AI conventions

1. **Propose** — Open an issue describing the convention change
2. **Discuss** — Gather input from active contributors across repositories
3. **Update** — Modify `AGENTS.md`, `docs/ai/skill-template.md`, or related files
4. **Communicate** — Announce changes to all repository maintainers

### For repository governance documents

1. **Propose** — Open an issue in this repository
2. **Review** — Maintainers from affected repositories review
3. **Merge** — Standard PR process

## Repository-Specific Commands

This repository does not have runtime commands. It is a documentation/governance repository.

Do not copy Community-specific commands such as:

```bash
pnpm architecture:validate
pnpm test
pnpm build
```

These belong in the consuming repositories.

## Cross-Repository Impact

Before merging changes to standards or ADRs:

- [ ] Verify the change is truly Comity-wide (not Community-specific)
- [ ] Confirm no breaking change to existing consumers without migration path
- [ ] Notify `comity-community` maintainers
- [ ] Notify `comity-enterprise` maintainers (when it exists)
- [ ] Update the migration manifest if ownership boundaries shift

## Style Guide

- Follow the conventions in `docs/standards/` (when migrated)
- Use clear, imperative language
- Document decisions, not intentions
- Preserve historical provenance for migrated material

## License

By contributing, you agree that your contributions will be licensed under the MIT License.