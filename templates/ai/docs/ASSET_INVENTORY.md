# AI Asset Inventory

This inventory records the current product decision for every asset family that
existed in the original `tools/ai` tree.

## Reusable Assets Kept in `ldev`

| Asset | Current location | Purpose | Reusable in `ldev` | Why |
|---|---|---|---|---|
| Standard agent bootstrap | `tools/ai/install/AGENTS.md` | Minimal entrypoint for any agent in an `ldev` project | Yes | Uses only stable `ldev` commands and no project context |
| Vendor skill manifest | `tools/ai/install/vendor-skills.txt` | Curated list of installable skills | Yes | Keeps install surface explicit and maintainable |
| `liferay-expert` | `tools/ai/skills/liferay-expert/` | Route technical tasks to the right reusable skill | Yes | General Liferay guidance, no project workflow coupling |
| `developing-liferay` | `tools/ai/skills/developing-liferay/` | Implement code/content/resource changes with `ldev` | Yes | Applies across compatible Liferay repos |
| `deploying-liferay` | `tools/ai/skills/deploying-liferay/` | Build, deploy and verify runtime changes | Yes | Maps directly to `ldev deploy`, `ldev osgi`, `ldev logs` |
| `troubleshooting-liferay` | `tools/ai/skills/troubleshooting-liferay/` | Diagnose runtime failures and recovery paths | Yes | General local runtime guidance |
| `migrating-journal-structures` | `tools/ai/skills/migrating-journal-structures/` | Run Journal migration workflows safely | Yes | Based on stable `ldev liferay resource ...` flows |
| Skill authoring rules | `tools/ai/docs/SKILL_STANDARDS.md` | Maintainer guidance for future reusable skills | Internal only | Useful to maintain the package, not installed into projects |

## Assets Kept Out of the Reusable Surface

| Asset | Current location | Purpose | Reusable in `ldev` | Why not |
|---|---|---|---|---|
| Original project AGENTS | `tools/ai/legacy/AGENTS.md` | Bootstrap for the source project | No | Encodes legacy workflow, worktree policy and old command model |
| Project context template | `tools/ai/legacy/CLAUDE.md.template` | Per-project knowledge template | No | Inherently project-specific |
| Context bootstrap script | `tools/ai/legacy/bootstrap-project-context.sh` | Generate project context from one repo layout | No | Depends on source-repo conventions |
| Legacy shell installer | `tools/ai/legacy/install.sh` | Project overlay installer after the standard package | No | Useful for one concrete project overlay, not for the reusable vendor surface |
| Legacy agent docs | `tools/ai/legacy/agents/` | Architecture and validation for original pipeline | No | Pipeline-specific and legacy |
| Claude-only runbooks | `tools/ai/legacy/.claude/agents/` | Internal multi-agent pipeline | No | Runtime-specific and not productized |
| `issue-engineering` | `tools/ai/legacy/skills/issue-engineering/` | GitHub issue lifecycle | No | Workflow-specific, not part of `ldev` core |
| `resolving-issues` | `tools/ai/legacy/skills/resolving-issues/` | Legacy wrapper | No | Pure compatibility layer |
| `preparing-github-issues` | `tools/ai/legacy/skills/preparing-github-issues/` | GitHub issue enrichment | No | GitHub workflow specific |
| `managing-worktree-env` | `tools/ai/legacy/skills/managing-worktree-env/` | Legacy wrapper for worktree lifecycle | No | Compatibility wrapper, not a product skill |
| `capturing-session-knowledge` | `tools/ai/legacy/skills/capturing-session-knowledge/` | Update project memory after a session | No | Writes project-owned knowledge, not vendor standard |
| `automating-browser-tests` | `tools/ai/legacy/skills/automating-browser-tests/` | Playwright/UI workflow | No | Depends on project wrappers not provided by `ldev` |

## Notes

- `legacy/` is not part of the default install surface.
- `legacy/` is maintained as a project-specific overlay export for repos that
  want to layer the original workflow on top of the standard `ldev ai install`
  package.
- The overlay should be applied after the standard package, not used as a
  standalone replacement.
- New reusable assets must satisfy the rules in `PRODUCT_RULES.md`.
