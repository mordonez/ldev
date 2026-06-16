@AGENTS.md

## Claude Entry Point

For any task in this repository, start here before anything else:

1. Read `AGENTS.md` and follow its direct MCP fast path when the user asks for a
   visible read-only `ldev` MCP tool.
2. Otherwise run `ldev ai bootstrap --intent=develop --cache=60 --json`. If it
   fails or returns partial output, continue with the available context.
3. Read `docs/ai/project-context.md` and `docs/ai/project-learnings.md`.
4. Read the matching skill file from `.agents/skills/<skill-name>/SKILL.md`
   directly using the Read file tool. Skills in this project are always loaded
   by reading the file, not via any other invocation mechanism.
5. Follow the gate order in the loaded skill without skipping steps.
