@AGENTS.md

## Claude Entry Point

For any task in this repository, start here before anything else:

1. Run `ldev ai bootstrap --intent=develop --cache=60 --json`. If it fails or
   returns partial output, continue with the available context — do not block.
2. Read `docs/ai/project-context.md` and `docs/ai/project-learnings.md`.
3. Read the matching skill file from `.agents/skills/<skill-name>/SKILL.md`
   directly using the Read file tool. Skills in this project are always loaded
   by reading the file, not via any other invocation mechanism.
4. Follow the gate order in the loaded skill without skipping steps.
