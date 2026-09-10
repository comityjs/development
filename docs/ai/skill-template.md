# Skill Template — Comity Development Repository

## Purpose

This template defines the structure for Comity-wide agent skills. Skills in this repository are **canonical** — they define conventions that apply across all Comity repositories (Community, Enterprise, Development).

Repository-specific skills belong in their respective repositories.

## Skill Structure

```markdown
# Skill Name

## Description

Brief description of what this skill enables.

## When to Use

Explicit triggers — when should an agent load this skill?

## Instructions

Step-by-step workflow for the agent.

## Resources

- File paths
- Scripts
- External references

## Boundaries

What this skill does NOT cover (prevents scope creep).
```

## Required Fields

| Field        | Required | Notes                   |
| ------------ | -------- | ----------------------- |
| Name         | Yes      | Unique, descriptive     |
| Description  | Yes      | One sentence            |
| When to Use  | Yes      | Explicit triggers       |
| Instructions | Yes      | Actionable steps        |
| Resources    | Optional | Links to relevant files |
| Boundaries   | Yes      | Scope limitation        |

## Comity-Wide Skills (Canonical)

These skills live in `comity-development` and apply everywhere:

| Skill                      | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `architecture-review`      | Review architectural changes against layering policy |
| `adr-authoring`            | Write and review Architectural Decision Records      |
| `standards-authoring`      | Create and update Comity-wide standards              |
| `ownership-classification` | Classify concerns by repository ownership            |
| `phase-gate-validation`    | Validate phase completion criteria                   |

## Repository-Specific Skills (Not Here)

These skills belong in their respective repositories:

| Skill                 | Repository          | Reason                                  |
| --------------------- | ------------------- | --------------------------------------- |
| `community-release`   | `comity-community`  | Community-specific CI/release           |
| `community-validator` | `comity-community`  | Architecture validator implementation   |
| `enterprise-release`  | `comity-enterprise` | Enterprise-specific CI/release (future) |

## Creating a New Skill

1. Determine if the skill is **Comity-wide** or **repository-specific**
2. If Comity-wide: create in `comity-development/.opencode/skill/`
3. If repository-specific: create in the target repository's `.opencode/skill/`
4. Follow the structure above
5. Add to this index

## Skill Discovery

Agents should:

1. Check `comity-development` for Comity-wide skills first
2. Check the current repository for repository-specific skills
3. Use `find-skills` skill to discover installable skills

## Versioning

Skills in `comity-development` are versioned with the repository. No separate versioning scheme.

## License

MIT — same as Comity framework.
