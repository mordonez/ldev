# skills.sh Compatibility Refactor

**Date:** 2026-06-14  
**Status:** Approved

## Goal

Make ldev compatible with the skills.sh standard so that skills can be installed via `npx skills add https://github.com/mordonez/ldev` instead of being bundled inside the ldev npm package. `ldev ai install` becomes a lightweight bootstrap for meta-files only (AGENTS.md, CLAUDE.md, etc.).

## Current state

- Skills live in `templates/ai/skills/` inside the ldev npm package
- `ldev ai install` copies skills + installs AGENTS.md + installs workspace-rules
- `ldev ai update` refreshes vendor skills and managed rules
- workspace-rules exist as a separate install category for blade-workspace vs ldev-native differences
- No `plugin.json` — not compatible with `npx skills add`

## Problems

1. Skills are not discoverable via skills.sh / `npx skills add`
2. `ldev ai install` does too much (skills + meta-files + workspace-rules)
3. workspace-rules are a custom mechanism with no skills.sh equivalent, adding complexity without proportional value
4. Cross-skill references violate the "one level deep" best practice (e.g., `../../docs/PORTAL_DISCOVERY.md`)

## Design

### Directory structure

```
(root)
├── .claude-plugin/
│   └── plugin.json              ← NEW
├── skills/                      ← MOVED from templates/ai/skills/
│   ├── developing-liferay/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── ...existing refs...
│   │       └── portal-discovery.md   ← absorbed from templates/ai/docs/
│   ├── deploying-liferay/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── troubleshooting-liferay/
│   │   ├── SKILL.md
│   │   └── references/
│   └── ... (all other skills, same restructuring)
│
└── templates/ai/
    ├── install/
    │   ├── AGENTS.md            ← absorbs relevant workspace-rules content
    │   └── AGENTS.workspace.md  ← absorbs blade-workspace workspace-rules content
    ├── project/                 ← unchanged
    └── docs/                    ← only maintainer docs remain (SKILL_STANDARDS, etc.)
```

### Plugin manifest

`.claude-plugin/plugin.json`:
```json
{
  "name": "ldev",
  "description": "Skills for developing, deploying, troubleshooting, and managing Liferay projects with ldev. Use when working with Liferay DXP, portal resources, OSGi modules, themes, structured content, fragments, or the ldev CLI.",
  "version": "{{synced with package.json}}",
  "author": {
    "name": "mordonez"
  }
}
```

### Skill restructuring rule

Any skill that currently references a file outside its own directory (e.g., `../../docs/PORTAL_DISCOVERY.md`) must absorb that file into its own `references/` subdirectory. If multiple skills reference the same doc, each gets its own copy. This satisfies the skills.sh best practice of one-level-deep references and ensures the skill is self-contained when installed via `npx skills add`.

Shared docs that get absorbed per-skill (exact mapping from `grep '../../docs/'`):

| Doc | Skills that reference it | Target path inside each skill |
|-----|--------------------------|-------------------------------|
| `PORTAL_DISCOVERY.md` | `developing-liferay`, `troubleshooting-liferay`, `runtime-change-workflow`, `portal-resource-workflow`, `liferay-expert` | `references/portal-discovery.md` |
| `THEME_DEPLOY_RUNTIME_PROOF.md` | `deploying-liferay` (SKILL.md ×2), `developing-liferay` (via `references/theme.md` ×1 — 3-level ref) | `references/theme-deploy-runtime-proof.md` |
| `RESOURCE_MUTATION_GATES.md` | `runtime-change-workflow`, `portal-resource-workflow` | `references/resource-mutation-gates.md` |

Note on `developing-liferay/references/theme.md`: it has a 3-level reference (`../../../docs/THEME_DEPLOY_RUNTIME_PROOF.md`). After restructuring, `theme.md` lives at `skills/developing-liferay/references/theme.md` and should reference `./theme-deploy-runtime-proof.md` (same directory).

Docs that stay in `templates/ai/docs/` (maintainer-only, not loaded at runtime):
- `SKILL_STANDARDS.md`
- `SKILL_REVIEW_CHECKLIST.md`
- `SKILL_TEMPLATE.md`
- `ROADMAP.md`

### workspace-rules elimination

workspace-rules are removed. Their content is absorbed:
- Rules that apply to all project types → `templates/ai/install/AGENTS.md`
- Rules specific to blade-workspace → `templates/ai/install/AGENTS.workspace.md`
- Task-specific guidance → relevant skills

### `ldev ai install` simplified interface

```bash
ldev ai install --target <dir>          # idempotent, skips existing files
ldev ai install --target <dir> --force  # overwrites existing files
```

Installs: AGENTS.md, CLAUDE.md, `.github/copilot-instructions.md`, `.gemini/GEMINI.md`, `.cursorrules`, `docs/ai/project-context.md`, `docs/ai/project-context.md.sample`.

`ldev ai update` is removed. Skills are updated via `npx skills add`. Meta-files are refreshed via `ldev ai install --force`.

### New user flow

```bash
# Step 1: install skills (skills.sh standard)
npx skills add https://github.com/mordonez/ldev

# Step 2: bootstrap project meta-files (ldev CLI)
ldev ai install --target .
```

## Code changes

### Files deleted

| File | Reason |
|------|--------|
| `src/features/ai/ai-install-rules.ts` | workspace-rules infrastructure removed |
| `src/features/ai/ai-update.ts` | `ldev ai update` command removed |
| `templates/ai/install/vendor-skills.txt` | Skills managed by `npx skills add` |
| `templates/ai/workspace-rules/` (entire dir) | Content absorbed into AGENTS.md templates |

### Files moved

| From | To |
|------|----|
| `templates/ai/skills/<name>/` | `skills/<name>/` |
| `templates/ai/docs/PORTAL_DISCOVERY.md` (et al.) | `skills/<name>/references/` per skill |

### Files modified

**`src/core/runtime/ai-manifest.ts`**
- `skillsSourceDir`: `path.join(aiRoot, 'skills')` → `path.join(repoRoot, 'skills')`
- Remove `vendorSkillsManifestPath` from `AiAssets`
- Remove `listVendorSkills`, `readManifestSkills`, `writeVendorManifest` exports
- Remove `detectManagedRuleNamespace`, `detectRuleLayer` (workspace-rules types gone)
- Remove `AiRulesManifest`, `AiRulesManifestRule` types

**`src/features/ai/ai-install.ts`**
- Remove skill-copying loop
- Remove `writeVendorManifest` call
- Remove workspace-rules installation (`installManagedAiRules`, `cleanupRetiredManagedAiRules`)
- Remove `--skill`, `--skills-only`, `--local`, `--project`, `--project-context` logic
- Simplify `AiCommandResult` to only meta-file outcomes

**`src/features/ai/ai-install-project.ts`**
- Remove `installClaudeSkillCommands`
- Remove `resolveSelectedSkills`
- Remove `collectLocalSkills`
- Remove `buildNextSteps` skill-related content

**`src/commands/ai/ai.command.ts`**
- Remove `update` subcommand
- Simplify `install` to `--target` + `--force` only
- Remove `AiUpdateCommandOptions` type

**`templates/ai/install/AGENTS.md`**
- Absorb relevant workspace-rules content
- Remove `{{LIFECYCLE_SKILLS_SECTION}}` placeholder

**`templates/ai/install/AGENTS.workspace.md`**
- Absorb blade-workspace-specific workspace-rules content

### Simplified `AiCommandResult`

```typescript
type AiCommandResult = {
  mode: 'install';
  targetDir: string;
  projectType: ProjectType;
  agents: 'installed' | 'overwritten' | 'kept';
  claudeInstalled: boolean;
  copilotInstalled: boolean;
  geminiInstalled: boolean;
  cursorrulesInstalled: boolean;
  projectContextInstalled: boolean;
};
```

## Out of scope

- Changing skill content (only structure changes)
- Publishing to skills.sh marketplace
- Migrating existing projects that use `ldev ai install` (backward compatibility: old `.agents/.vendor-skills` files are just ignored)
- Version pinning in `plugin.json` (stays in sync with `package.json` at build time)
