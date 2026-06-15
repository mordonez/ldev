# Skill Review Checklist

Use this checklist when adding or reviewing a skill change.

## Activation and scope

- `description` clearly says what the skill does and when to trigger it
- trigger language is specific enough to distinguish it from neighboring skills
- vendor skills stay reusable across `ldev` projects
- project overlays stay project-specific and do not duplicate vendor workflows

## Structure

- `SKILL.md` stays focused on activation, flow, guardrails, and exit criteria
- durable detail lives in `references/` or `scripts/`
- reusable templates and checklists are not embedded inline in long sections
- router skills route quickly instead of becoming mini playbooks

## Duplication and context

- no paragraph-level duplication between `SKILL.md` and nearby references
- the same workflow is not repeated across vendor and project skills without a clear boundary
- deep references are linked from the skill instead of copied into it

## Safety and verification

- commands use public `ldev` entrypoints
- mutation guardrails remain visible in `SKILL.md`
- verification criteria are still reachable after any extraction to references
- any project-specific evidence or handoff rules still live in project overlays
- if a handoff covers runtime-backed resources in production, it includes both
	the preferred `ldev` path and a manual Liferay UI fallback when remote `ldev`
	access is not guaranteed

## Heuristics

- `SKILL.md` is under 100 lines, or the overage is intentional and justified
- if a section is only needed for some invocations, it probably belongs in a reference
- if a section mostly names neighboring references, it probably belongs in a routing reference