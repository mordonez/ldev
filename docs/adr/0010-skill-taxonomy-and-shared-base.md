# ADR 0010 — Skill taxonomy: Workflow vs Recipe, and a shared base skill

- **Status:** Accepted
- **Date:** 2026-06-23

Skills are split into two categories — *Workflow* and *Recipe* — and a shared base skill (`ldev-shared`) is introduced as an explicit prerequisite for all new skills.

## Context

The `skills/` directory in a user project contains agent skills that encode the correct workflow for Liferay tasks. As the skill catalogue grows, two problems emerge: (1) every skill duplicates the same bootstrap, flag, and safety-invariant preamble; (2) there is no way for an agent or contributor to distinguish a broad operational reference from a narrow task sequence.

This decision was informed by reviewing the [googleworkspace/cli](https://github.com/googleworkspace/cli) project, which organises skills into Services, Helpers, Recipes, and Personas and uses a `gws-shared` base skill as a universal prerequisite. The patterns that transfer to ldev are the two-level taxonomy and the shared base; the patterns that do not transfer are auto-generation (ldev's value is in operational judgement, not command enumeration) and Personas (unnecessary at team scale).

## Decision

**Two skill categories:**

- **Workflow skill** — covers a domain broadly: context, sequencing, guardrails, and branching logic. The ten existing skills (`troubleshooting-liferay`, `portal-resource-workflow`, etc.) are Workflow skills and are not renamed.
- **Recipe skill** — a concrete, narrow task sequence with exact commands and a clear "done when" condition. Named `recipe-<task>`. First three: `recipe-deploy-and-verify`, `recipe-resource-import-and-verify`, `recipe-sync-codebase-from-portal`.

**Shared base skill (`ldev-shared`):**

A new skill containing: how to run and interpret `ldev ai bootstrap`, universal flags (`--json`, `--ndjson`, `--strict`, `--check-only`), safety invariants (discover before mutate, check-only before mutation, read-after-write verify), and the distinction between `ldev status`, `ldev context`, and `ldev doctor`. All new skills (Workflow and Recipe alike) declare it as an explicit prerequisite in their opening block.

**Skills discovery via bootstrap:**

`ldev ai bootstrap` will include a `context.skills[]` field listing the name and description of every skill found in the project's `skills/` directory. This replaces a static index file.

## Considered alternatives

**Auto-generate reference skills from `--help` output.** Rejected. The ldev CLI surface is small and `ldev --help` already serves as the command reference. The value of ldev skills is operational context — order, guardrails, what not to do — which cannot be derived from help text.

**Persona skills (role-based bundles).** Rejected. With ten skills and a three-person team, the catalogue is manageable without bundles. Revisit if the catalogue exceeds ~20 skills.

**Separate `AGENTS.md` from `CONTEXT.md`.** Rejected. `CONTEXT.md` remains the single architecture document. Splitting adds maintenance surface without benefit at current scale.

**Defer prerequisites to existing skills.** Considered but rejected. Adding `ldev-shared` as prerequisite only when skills are edited for another reason would leave the catalogue inconsistent for an indefinite period. Since the review of all existing skills was already in scope, prerequisites and See Also cross-references were applied uniformly in this PR.

## Consequences

- `ldev-shared` is created as the first new skill.
- New skills reference `ldev-shared` in their opening prerequisite block.
- `ldev ai bootstrap` gains a `context.skills[]` field (tracked separately as a CLI change).
- The ADR index in `CONTEXT.md` is updated to include this entry.
