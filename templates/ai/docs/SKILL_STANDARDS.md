# Skill Standards (OpenAI + Anthropic baseline)

Short guide to maintain high-quality skills, based on patterns from:
- `openai/skills` (curated + system)
- `anthropics/skills` (examples + template)
- Agent Skills specification (`agentskills.io`)

## Minimum Rules

1. `SKILL.md` with valid frontmatter:
   - `name`: kebab-case and matches the folder.
   - `description`: must clearly explain **when it is activated**.
2. `agents/openai.yaml` present with:
   - `interface.display_name`
   - `interface.short_description`
   - `interface.default_prompt`
3. Reuse-oriented structure:
   - operational flow (steps)
   - exit/verification criteria
   - troubleshooting when applicable

## Design Best Practices

1. Progressive disclosure:
   - Keep `SKILL.md` as short as possible.
   - Move details and variations to `references/`.
   - Use `scripts/` for deterministic and repetitive steps.
2. Precise trigger:
   - Avoid generic descriptions.
   - Include concrete activation verbs (`Use when...`).
3. Output contract:
   - Define what the agent must deliver (artifacts, checks, format).
4. No duplication:
   - Do not repeat the same content in `SKILL.md` and `references/`.
5. Efficient context:
   - If the skill grows, prioritize a summary + internal links to references.


