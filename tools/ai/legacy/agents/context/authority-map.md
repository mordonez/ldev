# Authority map

Documentation precedence for the legacy project package:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `agents/`
4. `.agents/skills/`
5. `.claude/agents/`

Rules:

- Put project policy in `AGENTS.md`.
- Put stable project knowledge in `CLAUDE.md`.
- Put tactical execution steps in skills.
- Keep Claude-only optimizations out of the main source of truth.
