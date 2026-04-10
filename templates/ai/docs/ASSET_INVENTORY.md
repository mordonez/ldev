# AI Asset Inventory

This inventory records the current product decision for every asset family that
existed in the original `tools/ai` tree.

## Reusable Assets Kept in `ldev`

| Asset | Current location | Purpose | Reusable in `ldev` | Why |
|---|---|---|---|---|
| Standard agent bootstrap | `templates/ai/install/AGENTS.md` | Minimal entrypoint for any agent in an `ldev` project | Yes | Uses only stable `ldev` commands and points project context to local docs |
| Workspace agent bootstrap | `templates/ai/install/AGENTS.workspace.md` | Minimal entrypoint for agents in a blade-workspace project | Yes | Workspace-specific routing to official AI Workspace files and `ldev` augmentation layer |
| Claude entrypoint template | `templates/ai/project/CLAUDE.md` | Lightweight Claude-specific router to project docs | Yes | Generic scaffold, still requires project owners to fill real context |
| Project context template | `templates/ai/project/docs/ai/project-context.md` | Long-form project knowledge scaffold | Yes | Optional project-owned scaffold installed only with `--project-context` or `--project` |
| Vendor skill manifest | `templates/ai/install/vendor-skills.txt` | Curated list of installable skills | Yes | Keeps install surface explicit and maintainable |
| `liferay-expert` | `templates/ai/skills/liferay-expert/` | Route technical tasks to the right reusable skill | Yes | General Liferay guidance, no project workflow coupling |
| `developing-liferay` | `templates/ai/skills/developing-liferay/` | Implement code/content/resource changes with `ldev` | Yes | Applies across compatible Liferay repos |
| `deploying-liferay` | `templates/ai/skills/deploying-liferay/` | Build, deploy and verify runtime changes | Yes | Maps directly to `ldev deploy`, `ldev osgi`, `ldev logs` |
| `troubleshooting-liferay` | `templates/ai/skills/troubleshooting-liferay/` | Diagnose runtime failures and recovery paths | Yes | General local runtime guidance |
| `migrating-journal-structures` | `templates/ai/skills/migrating-journal-structures/` | Run Journal migration workflows safely | Yes | Based on stable `ldev portal/resource ...` flows |

## Workspace Rules

Workspace rules are installed into editor/AI tool config directories (`.claude/`, `.cursor/`, `.gemini/`, `.windsurf/`). Each rule file's name determines which project types receive it, controlled by `detectManagedRuleNamespace()` in `ai-install.ts`:

- `ldev-*` prefix — installed in all project types
- `ldev-workspace-*` prefix — installed in `blade-workspace` projects only
- `ldev-native-*` prefix — installed in `ldev-native` projects only

| Rule file | Namespace | Project type | Purpose |
|---|---|---|---|
| `ldev-liferay-core.md` | `ldev-liferay-core` | all | Liferay domain knowledge shared across all project types |
| `ldev-liferay-client-extensions.md` | `ldev-liferay-client-extensions` | all | Client Extensions authoring guidance |
| `ldev-liferay-mcp.md` | `ldev-liferay-mcp` | all | When and how to use the Liferay MCP server |
| `ldev-portal-discovery.md` | `ldev-portal-discovery` | all | Portal inventory and discovery commands |
| `ldev-resource-migrations.md` | `ldev-resource-migrations` | all | Structure, template and ADT export/import workflows |
| `ldev-runtime-troubleshooting.md` | `ldev-runtime-troubleshooting` | all | Runtime diagnosis with `ldev logs`, `ldev status`, `ldev doctor` |
| `ldev-deploy-verification.md` | `ldev-deploy-verification` | all | Post-deploy verification with `ldev portal check` |
| `ldev-workspace-setup.md` | `ldev-workspace-setup` | blade-workspace only | Blade Workspace project structure and setup |
| `ldev-workspace-runtime.md` | `ldev-workspace-runtime` | blade-workspace only | Runtime management in a blade-workspace project |
| `ldev-workspace-deploy.md` | `ldev-workspace-deploy` | blade-workspace only | Build and deploy for blade-workspace (`blade gw deploy`) |
| `ldev-workspace-agent-workflow.md` | `ldev-workspace-agent-workflow` | blade-workspace only | Full agent bootstrap and workflow for blade-workspace |
| `ldev-native-runtime.md` | `ldev-native-runtime` | ldev-native only | Docker runtime management in an ldev-native project |
| `ldev-native-deploy.md` | `ldev-native-deploy` | ldev-native only | Build and deploy for ldev-native projects |
| `ldev-native-agent-workflow.md` | `ldev-native-agent-workflow` | ldev-native only | Full agent bootstrap and workflow for ldev-native |

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
- In `blade-workspace`, official AI Workspace folders remain the base layer and
  `ldev` augments them with additional workflow guidance.
- In `ldev-native`, `ldev` provides the full runtime-specific AI layer itself.
- The agent workflow rule is split by project type: `ldev-workspace-agent-workflow` for
  blade-workspace and `ldev-native-agent-workflow` for ldev-native. There is no shared
  `ldev-agent-workflow` rule — each rule uses language and commands appropriate for its
  runtime.
- New reusable assets must satisfy the rules in `PRODUCT_RULES.md`.
