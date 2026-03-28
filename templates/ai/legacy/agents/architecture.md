# Architecture

This legacy package assumes one public local tooling contract: `ldev`.

Layers:

- `AGENTS.md`: global project rules
- `CLAUDE.md`: project-specific know-how
- `agents/`: supporting docs and validation
- `.agents/skills/`: project and reusable skills
- `.claude/agents/`: optional Claude-specific runbooks

Unified operational flow:

```text
Issue -> issue-resolver -> build-verifier -> runtime-verifier -> pr-creator
```

All local runtime and portal operations in that flow must use `ldev`.
