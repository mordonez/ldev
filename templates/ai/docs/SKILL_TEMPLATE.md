# Vendor Skill Template

Copy this file as the starting point for a new vendor skill.
See `SKILL_STANDARDS.md` for the full quality rules and `SKILL_REVIEW_CHECKLIST.md`
before opening a review.

---

## File structure

```
skills/<skill-name>/
├── SKILL.md                    # Required. Main instructions. Target: under 100 lines.
├── agents/
│   └── openai.yaml             # Required. Codex/OpenAI Agents interface metadata.
└── references/                 # Optional. Add when SKILL.md grows past ~70 lines.
    └── <topic>.md
```

---

## SKILL.md template

```markdown
---
name: <kebab-case-matches-folder>
description: '<One sentence: what the skill does>. Use when <specific concrete triggers — task type, surface, or state>.'
---

# <Title Case Name>

<One or two sentences: when to use this skill and its role relative to neighboring skills.>

## Bootstrap

```bash
ldev ai bootstrap --intent=<discover|develop|deploy|troubleshoot|migrate-resources> --cache=60 --json
```

Inspect: `<list the specific context fields the skill needs, e.g. context.liferay.portalUrl>`.

If required fields are missing, stop and report that installed ldev AI assets are out of sync.

## <Main flow section — numbered gates or named steps>

<Keep gate language concrete: commands, flags, file paths. Move edge cases and
detail to references/ when the section exceeds ~20 lines.>

## Done When

<Concrete exit condition: what artifact, evidence, or state proves the task is
complete. One to three sentences.>

## Guardrails

- <Non-negotiable safety check>
- <Non-negotiable safety check>
- <Reference the relevant shared doc, e.g. RESOURCE_MUTATION_GATES.md, when applicable>
```

---

## agents/openai.yaml template

```yaml
interface:
  display_name: "<Human-Readable Name>"
  short_description: "<What the skill does + Use when <concrete trigger>. Target: 1-2 sentences, ~150 chars max.>"
  default_prompt: "Use $<skill-name> to <action verb> <what>."
```

**Triggering notes by agent:**

| Agent | Trigger field |
|---|---|
| Claude Code | `description` in SKILL.md frontmatter |
| Codex / OpenAI Agents | `interface.short_description` in openai.yaml |
| Other agents | SKILL.md `description` (fallback) |

Both fields should independently convey when to activate the skill. Do not
assume one agent reads the other's file.

---

## Before opening a review

Run through `SKILL_REVIEW_CHECKLIST.md` — it is the single source of truth for
quality gates. Key quick checks from it: `description` and `short_description`
both include "Use when <concrete trigger>", `name` matches the folder, SKILL.md
is under 100 lines, "Done When" is present, and all commands use public `ldev`
entrypoints.
