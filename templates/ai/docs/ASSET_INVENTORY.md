# AI Asset Inventory

This inventory records the current product decision for every asset family that
existed in the original `tools/ai` tree.

## Reusable Assets Kept in `ldev`

| Asset | Current location | Purpose | Reusable in `ldev` | Why |
|---|---|---|---|---|
| Standard agent bootstrap | `templates/ai/install/AGENTS.md` | Minimal entrypoint for any agent in an `ldev` project | Yes | Uses only stable `ldev` commands and points project context to local docs |
| Claude entrypoint template | `templates/ai/project/CLAUDE.md` | Lightweight Claude-specific router to project docs | Yes | Generic scaffold, still requires project owners to fill real context |
| Project context template | `templates/ai/project/docs/ai/project-context.md` | Long-form project knowledge scaffold | Yes | Optional project-owned scaffold installed only with `--project-context` or `--project` |
| Vendor skill manifest | `templates/ai/install/vendor-skills.txt` | Curated list of installable skills | Yes | Keeps install surface explicit and maintainable |
| `liferay-expert` | `templates/ai/skills/liferay-expert/` | Route technical tasks to the right reusable skill | Yes | General Liferay guidance, no project workflow coupling |
| `developing-liferay` | `templates/ai/skills/developing-liferay/` | Implement code/content/resource changes with `ldev` | Yes | Applies across compatible Liferay repos |
| `deploying-liferay` | `templates/ai/skills/deploying-liferay/` | Build, deploy and verify runtime changes | Yes | Maps directly to `ldev deploy`, `ldev osgi`, `ldev logs` |
| `troubleshooting-liferay` | `templates/ai/skills/troubleshooting-liferay/` | Diagnose runtime failures and recovery paths | Yes | General local runtime guidance |
| `migrating-journal-structures` | `templates/ai/skills/migrating-journal-structures/` | Run Journal migration workflows safely | Yes | Based on stable `ldev portal/resource ...` flows |

## Assets Not Installed By Default

| Asset | Current location | Purpose | Reusable in `ldev` | Why not |
|---|---|---|---|---|
| Project skills overlay | `templates/ai/project/skills/` | Project-owned process and project-memory workflows | No | Project-owned overlay installed only with `--project`; should not be the main home of reusable `ldev` workflows |
| Project agent overlay | `templates/ai/project/.claude/agents/` | Claude sub-agents for the project overlay | No | Optional pipeline, not needed in every project |

## Notes

- `ldev ai install` installs `AGENTS.md`, `CLAUDE.md`,
- `ldev ai install --local` keeps the generated agent/editor tooling local by
  adding it to `.gitignore`, while leaving `docs/ai/project-context.md` and
  `docs/ai/project-context.md.sample` versionable.
- `ldev ai install --project-context` additionally installs `docs/ai/project-context.md`,
  curated vendor skills and the vendor manifest.
- `ldev ai install --project` additionally installs the project-owned skills
  and Claude agents overlay.
- Project overlays should stay thin and process-specific. Reusable `ldev`
  operational knowledge belongs in vendor skills, not in `project/`.
- New reusable assets must satisfy the rules in `PRODUCT_RULES.md`.
