# skills.sh Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor ldev so skills are distributed via `npx skills add https://github.com/mordonez/ldev` and `ldev ai install` becomes a lightweight meta-file bootstrap.

**Architecture:** Move `templates/ai/skills/` → root `skills/`, absorb shared doc references into each skill's own `references/` directory, delete workspace-rules infrastructure, slim down `ldev ai install` to `--target` + `--force` only.

**Tech Stack:** TypeScript, Node.js, fs-extra, vitest, Commander.js

---

## File Map

### Created
- `.claude-plugin/plugin.json`
- `skills/` (moved from `templates/ai/skills/`)
- `skills/*/references/portal-discovery.md` (per-skill copy)
- `skills/*/references/theme-deploy-runtime-proof.md` (per-skill copy)
- `skills/*/references/resource-mutation-gates.md` (per-skill copy)

### Deleted
- `templates/ai/skills/` (moved to root)
- `templates/ai/workspace-rules/` (eliminated)
- `templates/ai/install/vendor-skills.txt`
- `src/features/ai/ai-install-rules.ts`
- `src/features/ai/ai-update.ts`
- `src/features/ai/ai-status.ts`
- `src/core/runtime/ai-status.ts`
- `tests/integration/ai-status.integration.test.ts`

### Modified
- `src/core/runtime/ai-manifest.ts` — remove rules types/functions, update `skillsSourceDir` path
- `src/features/ai/ai-manifest.ts` — trim re-exports
- `src/features/ai/ai-install.ts` — remove skill copying + workspace-rules, simplify result type
- `src/features/ai/ai-install-project.ts` — remove dead functions, simplify remaining
- `src/commands/ai/ai.command.ts` — remove `update`/`status` commands, simplify `install`
- `templates/ai/install/AGENTS.md` — remove `{{LIFECYCLE_SKILLS_SECTION}}` placeholder, update skill path refs
- `tests/unit/ai.test.ts` — remove deleted-function tests, update `AiCommandResult` fixture
- `tests/unit/ai-install-modules.test.ts` — remove tests for deleted functions

---

## Task 1: Add `.claude-plugin/plugin.json`

**Files:**
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Create the directory and write plugin.json**

```bash
mkdir .claude-plugin
```

Content of `.claude-plugin/plugin.json`:
```json
{
  "name": "ldev",
  "description": "Skills for developing, deploying, troubleshooting, and managing Liferay projects with ldev. Use when working with Liferay DXP, portal resources, OSGi modules, themes, structured content, fragments, or the ldev CLI.",
  "version": "0.7.2",
  "author": {
    "name": "mordonez"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: add skills.sh plugin manifest"
```

---

## Task 2: Move `templates/ai/skills/` → `skills/`

**Files:**
- Move: `templates/ai/skills/` → `skills/`

- [ ] **Step 1: Move the skills directory with git**

```bash
git mv templates/ai/skills skills
```

- [ ] **Step 2: Verify structure**

```bash
ls skills/
```

Expected output includes: `automating-browser-tests`, `capturing-session-knowledge`, `deploying-liferay`, `developing-liferay`, `isolating-worktrees`, `liferay-expert`, `migrating-journal-structures`, `portal-resource-workflow`, `runtime-change-workflow`, `troubleshooting-liferay`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move skills to root skills/ directory"
```

---

## Task 3: Absorb shared docs into skills and fix references

**Context:** Five skills reference docs via `../../docs/` paths which will break when installed via `npx skills add`. Each skill that references a shared doc gets its own copy in `references/`.

**Shared doc mapping from grep:**
- `PORTAL_DISCOVERY.md` → skills: `developing-liferay`, `troubleshooting-liferay`, `runtime-change-workflow`, `portal-resource-workflow`, `liferay-expert`
- `THEME_DEPLOY_RUNTIME_PROOF.md` → skills: `deploying-liferay`, `developing-liferay` (via `references/theme.md`)
- `RESOURCE_MUTATION_GATES.md` → skills: `runtime-change-workflow`, `portal-resource-workflow`

**Files:**
- Modify: `skills/*/SKILL.md` (fix `../../docs/` refs)
- Modify: `skills/developing-liferay/references/theme.md` (fix `../../../docs/` ref)
- Copy docs into: `skills/*/references/`

- [ ] **Step 1: Copy `PORTAL_DISCOVERY.md` into each skill that references it**

```bash
cp templates/ai/docs/PORTAL_DISCOVERY.md skills/developing-liferay/references/portal-discovery.md
cp templates/ai/docs/PORTAL_DISCOVERY.md skills/troubleshooting-liferay/references/portal-discovery.md
cp templates/ai/docs/PORTAL_DISCOVERY.md skills/runtime-change-workflow/references/portal-discovery.md
cp templates/ai/docs/PORTAL_DISCOVERY.md skills/portal-resource-workflow/references/portal-discovery.md
mkdir -p skills/liferay-expert/references
cp templates/ai/docs/PORTAL_DISCOVERY.md skills/liferay-expert/references/portal-discovery.md
```

- [ ] **Step 2: Copy `THEME_DEPLOY_RUNTIME_PROOF.md` into skills that reference it**

```bash
cp templates/ai/docs/THEME_DEPLOY_RUNTIME_PROOF.md skills/deploying-liferay/references/theme-deploy-runtime-proof.md
cp templates/ai/docs/THEME_DEPLOY_RUNTIME_PROOF.md skills/developing-liferay/references/theme-deploy-runtime-proof.md
```

- [ ] **Step 3: Copy `RESOURCE_MUTATION_GATES.md` into skills that reference it**

```bash
cp templates/ai/docs/RESOURCE_MUTATION_GATES.md skills/runtime-change-workflow/references/resource-mutation-gates.md
cp templates/ai/docs/RESOURCE_MUTATION_GATES.md skills/portal-resource-workflow/references/resource-mutation-gates.md
```

- [ ] **Step 4: Fix `../../docs/PORTAL_DISCOVERY.md` refs in 5 SKILL.md files**

In `skills/developing-liferay/SKILL.md`, replace:
```
[../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md)
```
with:
```
[references/portal-discovery.md](references/portal-discovery.md)
```

In `skills/troubleshooting-liferay/SKILL.md`, same replacement.

In `skills/runtime-change-workflow/SKILL.md`, same replacement.

In `skills/portal-resource-workflow/SKILL.md`, same replacement.

In `skills/liferay-expert/SKILL.md` (check the exact text with grep first):
```bash
grep -n "PORTAL_DISCOVERY" skills/liferay-expert/SKILL.md
```
Replace the found reference with `[references/portal-discovery.md](references/portal-discovery.md)`.

- [ ] **Step 5: Fix `../../docs/THEME_DEPLOY_RUNTIME_PROOF.md` refs in `deploying-liferay/SKILL.md`**

In `skills/deploying-liferay/SKILL.md` there are two occurrences. Replace both:
```
[../../docs/THEME_DEPLOY_RUNTIME_PROOF.md](../../docs/THEME_DEPLOY_RUNTIME_PROOF.md)
```
with:
```
[references/theme-deploy-runtime-proof.md](references/theme-deploy-runtime-proof.md)
```

- [ ] **Step 6: Fix `../../../docs/THEME_DEPLOY_RUNTIME_PROOF.md` in `developing-liferay/references/theme.md`**

In `skills/developing-liferay/references/theme.md`, replace:
```
[../../../docs/THEME_DEPLOY_RUNTIME_PROOF.md](../../../docs/THEME_DEPLOY_RUNTIME_PROOF.md)
```
with:
```
[./theme-deploy-runtime-proof.md](./theme-deploy-runtime-proof.md)
```

- [ ] **Step 7: Fix `../../docs/RESOURCE_MUTATION_GATES.md` refs in 2 SKILL.md files**

In `skills/runtime-change-workflow/SKILL.md`, replace:
```
[../../docs/RESOURCE_MUTATION_GATES.md](../../docs/RESOURCE_MUTATION_GATES.md)
```
with:
```
[references/resource-mutation-gates.md](references/resource-mutation-gates.md)
```

In `skills/portal-resource-workflow/SKILL.md`, same replacement.

- [ ] **Step 8: Verify no remaining `../../docs/` refs in skills/**

```bash
grep -r "../../docs/" skills/
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add skills/
git commit -m "refactor: absorb shared docs into skill references and fix paths"
```

---

## Task 4: Delete workspace-rules and vendor-skills manifest

**Files:**
- Delete: `templates/ai/workspace-rules/`
- Delete: `templates/ai/install/vendor-skills.txt`

- [ ] **Step 1: Delete workspace-rules directory**

```bash
git rm -r templates/ai/workspace-rules/
```

- [ ] **Step 2: Delete vendor-skills manifest**

```bash
git rm templates/ai/install/vendor-skills.txt
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove workspace-rules and vendor-skills manifest"
```

---

## Task 5: Simplify `src/core/runtime/ai-manifest.ts`

**Files:**
- Modify: `src/core/runtime/ai-manifest.ts`

Remove all rules-related types (`ManagedRuleNamespace`, `RuleLayer`, `LocalModificationPolicy`, `AiRulesManifest`, `AiRulesManifestRule`), their Zod schemas, and all related functions (`listVendorSkills`, `readManifestSkills`, `writeVendorManifest`, `rulesManifestPath`, `writeRulesManifest`, `readRulesManifest`, `detectManagedRuleNamespace`, `detectRuleLayer`, `detectOfficialWorkspaceFiles`, `computeContentHash`). Update `AiAssets` to remove `workspaceRulesSourceDir` and `vendorSkillsManifestPath`. Update `skillsSourceDir` to point to root `skills/`.

- [ ] **Step 1: Replace the full file content**

Write `src/core/runtime/ai-manifest.ts` with:

```typescript
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fs from 'fs-extra';

import {CliError} from '../errors.js';
import {isRecord, readJsonUnknown} from '../utils/json.js';

export type AiAssets = {
  repoRoot: string;
  packageVersion: string;
  aiRoot: string;
  installDir: string;
  projectDir: string;
  skillsSourceDir: string;
  agentsTemplatePath: string;
  workspaceAgentsTemplatePath: string;
};

export function resolveAiAssets(repoRoot = getDefaultRepoRoot()): AiAssets {
  const aiRoot = path.join(repoRoot, 'templates', 'ai');
  const installDir = path.join(aiRoot, 'install');
  const projectDir = path.join(aiRoot, 'project');
  const packageJson: unknown = fs.readJsonSync(path.join(repoRoot, 'package.json'));
  const packageVersion =
    isRecord(packageJson) && typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

  return {
    repoRoot,
    packageVersion,
    aiRoot,
    installDir,
    projectDir,
    skillsSourceDir: path.join(repoRoot, 'skills'),
    agentsTemplatePath: path.join(installDir, 'AGENTS.md'),
    workspaceAgentsTemplatePath: path.join(installDir, 'AGENTS.workspace.md'),
  };
}

function getDefaultRepoRoot(): string {
  return findPackageRoot(fileURLToPath(import.meta.url));
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  for (;;) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates', 'ai'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new CliError(`Could not resolve the ldev package root from ${fromFile}`, {
        code: 'AI_PACKAGE_ROOT_NOT_FOUND',
      });
    }
    current = parent;
  }
}
```

- [ ] **Step 2: Update `src/features/ai/ai-manifest.ts` to trim re-exports**

Replace its full content with:

```typescript
export {resolveAiAssets, type AiAssets} from '../../core/runtime/ai-manifest.js';
```

- [ ] **Step 3: Commit**

```bash
git add src/core/runtime/ai-manifest.ts src/features/ai/ai-manifest.ts
git commit -m "refactor: slim down ai-manifest — remove rules infrastructure, update skillsSourceDir"
```

---

## Task 6: Delete rules and status infrastructure

**Files:**
- Delete: `src/features/ai/ai-install-rules.ts`
- Delete: `src/features/ai/ai-update.ts`
- Delete: `src/features/ai/ai-status.ts`
- Delete: `src/core/runtime/ai-status.ts`

- [ ] **Step 1: Delete the four files**

```bash
git rm src/features/ai/ai-install-rules.ts
git rm src/features/ai/ai-update.ts
git rm src/features/ai/ai-status.ts
git rm src/core/runtime/ai-status.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor: delete workspace-rules install, update, and status infrastructure"
```

---

## Task 7: Simplify `src/features/ai/ai-install-project.ts`

**Files:**
- Modify: `src/features/ai/ai-install-project.ts`

Remove: `normalizeRelativePath`, `currentVerifiedProducts`, `renderAgentsFile`, `uniqueSorted`, `resolveSelectedSkills`, `collectLocalSkills`, `collectExistingProjectSkills`, `installProjectOwnedSkills`, `installClaudeSkillCommands`, `buildWorkspaceCoexistenceWarnings`, `resolveProjectSkillsManifest`, `readSimpleManifest`.

Simplify: `installAgentsFile` (inline template read, remove `projectSkillsInstalled` param), `buildNextSteps` (remove all `--local`/`--project`/`skillsOnly` params).

Keep unchanged: `installProjectFile`.

- [ ] **Step 1: Replace the full file content**

Write `src/features/ai/ai-install-project.ts` with:

```typescript
import path from 'node:path';

import fs from 'fs-extra';

import type {ProjectType} from '../../core/config/project-type.js';
import type {AiAssets} from './ai-manifest.js';
import {copyAiTemplatePath, writeTextFileLf} from './ai-install-fs.js';

export type AgentsInstallStatus = 'installed' | 'overwritten' | 'kept';

export async function installAgentsFile(
  targetDir: string,
  assets: AiAssets,
  force: boolean,
  options: {projectType: ProjectType},
): Promise<AgentsInstallStatus> {
  const destination = path.join(targetDir, 'AGENTS.md');
  const exists = await fs.pathExists(destination);

  if (exists && !force) {
    return 'kept';
  }

  const templatePath =
    options.projectType === 'blade-workspace' ? assets.workspaceAgentsTemplatePath : assets.agentsTemplatePath;
  const content = await fs.readFile(templatePath, 'utf8');
  await writeTextFileLf(destination, content);
  return exists ? 'overwritten' : 'installed';
}

export async function installProjectFile(
  targetDir: string,
  assets: AiAssets,
  relativePath: string,
  options?: {overwrite?: boolean},
): Promise<boolean> {
  const source = path.join(assets.projectDir, relativePath);
  if (!(await fs.pathExists(source))) {
    return false;
  }

  const destination = path.join(targetDir, relativePath);
  if ((await fs.pathExists(destination)) && !options?.overwrite) {
    return false;
  }

  await fs.ensureDir(path.dirname(destination));
  await copyAiTemplatePath(source, destination, {overwrite: options?.overwrite ?? true});
  return true;
}

export function buildNextSteps(projectType: ProjectType): string[] {
  const steps: string[] = [];
  if (projectType === 'blade-workspace') {
    steps.push('Review AGENTS.md and CLAUDE.md.');
    steps.push('Keep the official Liferay Workspace AI files as the base layer; ldev is the augmentation layer.');
  } else {
    steps.push('Review AGENTS.md and CLAUDE.md.');
  }
  steps.push('Run `npx skills add https://github.com/mordonez/ldev` to install skills.');
  steps.push('Run `ldev ai bootstrap --intent=develop --json` to verify the agent can operate.');
  return steps;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai/ai-install-project.ts
git commit -m "refactor: slim down ai-install-project — remove rules/skills/symlink helpers"
```

---

## Task 8: Simplify `src/features/ai/ai-install.ts`

**Files:**
- Modify: `src/features/ai/ai-install.ts`

Remove skill-copying loop, workspace-rules install calls, `writeVendorManifest`, `writeRulesManifest`, `syncProjectWorkspaceRules`. Simplify `AiCommandResult` and `runAiInstall`.

- [ ] **Step 1: Replace the full file content**

Write `src/features/ai/ai-install.ts` with:

```typescript
import path from 'node:path';

import type {Printer} from '../../core/output/printer.js';
import {detectProjectType, type ProjectType} from '../../core/config/project-type.js';
import {resolveAiAssets, type AiAssets} from './ai-manifest.js';
import {
  buildNextSteps,
  installAgentsFile,
  installProjectFile,
} from './ai-install-project.js';

export type AiCommandResult = {
  mode: 'install';
  targetDir: string;
  projectType: ProjectType;
  agents: 'installed' | 'overwritten' | 'kept';
  claudeInstalled: boolean;
  copilotInstalled: boolean;
  geminiInstalled: boolean;
  cursorrulesInstalled: boolean;
  projectContextInstalled: boolean;
  projectContextSampleInstalled: boolean;
  nextSteps: string[];
};

export async function runAiInstall(
  options: {
    targetDir: string;
    force: boolean;
    printer?: Printer;
  },
  dependencies?: {assets?: AiAssets},
): Promise<AiCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  const projectType = detectProjectType(targetDir);
  const assets = dependencies?.assets ?? resolveAiAssets();
  const overwrite = options.force;

  const agents = await installAgentsFile(targetDir, assets, options.force, {projectType});

  const claudeInstalled =
    projectType !== 'blade-workspace'
      ? await installProjectFile(targetDir, assets, 'CLAUDE.md', {overwrite})
      : false;

  const copilotInstalled =
    projectType !== 'blade-workspace'
      ? await installProjectFile(targetDir, assets, path.join('.github', 'copilot-instructions.md'), {overwrite})
      : false;

  const geminiInstalled = await installProjectFile(targetDir, assets, path.join('.gemini', 'GEMINI.md'), {overwrite});
  const cursorrulesInstalled = await installProjectFile(targetDir, assets, '.cursorrules', {overwrite});
  const projectContextInstalled = await installProjectFile(
    targetDir,
    assets,
    path.join('docs', 'ai', 'project-context.md'),
    {overwrite},
  );
  const projectContextSampleInstalled = await installProjectFile(
    targetDir,
    assets,
    path.join('docs', 'ai', 'project-context.md.sample'),
    {overwrite},
  );

  return {
    mode: 'install',
    targetDir,
    projectType,
    agents,
    claudeInstalled,
    copilotInstalled,
    geminiInstalled,
    cursorrulesInstalled,
    projectContextInstalled,
    projectContextSampleInstalled,
    nextSteps: buildNextSteps(projectType),
  };
}

export function formatAiResult(result: AiCommandResult): string {
  const lines = [`Installation completed in: ${result.targetDir}`, ''];
  lines.push(`Project type: ${result.projectType}`);
  lines.push(`AGENTS.md: ${result.agents}`);
  if (result.claudeInstalled) lines.push('CLAUDE.md: applied');
  if (result.copilotInstalled) lines.push('.github/copilot-instructions.md: applied');
  if (result.geminiInstalled) lines.push('.gemini/GEMINI.md: applied');
  if (result.cursorrulesInstalled) lines.push('.cursorrules: applied');
  if (result.projectContextInstalled) lines.push('docs/ai/project-context.md: applied');
  if (result.projectContextSampleInstalled) lines.push('docs/ai/project-context.md.sample: applied');

  if (result.nextSteps.length > 0) {
    lines.push('', 'Next steps:');
    result.nextSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai/ai-install.ts
git commit -m "refactor: slim down ai-install — remove skill/rules install, simplify result type"
```

---

## Task 9: Simplify `src/commands/ai/ai.command.ts`

**Files:**
- Modify: `src/commands/ai/ai.command.ts`

Remove `update` command, `status` command, `collectSkillOption`, `AiUpdateCommandOptions`, `AiStatusCommandOptions`. Simplify `install` to `--target` + `--force` only.

- [ ] **Step 1: Replace the full file content**

Write `src/commands/ai/ai.command.ts` with:

```typescript
import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAiResult, runAiInstall} from '../../features/ai/ai-install.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../features/agent/agent-bootstrap.js';
import {
  formatMcpSetup,
  runMcpSetup,
  type McpStrategy,
  type McpTool,
} from '../../entrypoints/mcp-server/mcp-server-setup.js';

type AiInstallCommandOptions = {
  target: string;
  force?: boolean;
};

type AiBootstrapCommandOptions = {
  intent: string;
  cache?: string;
};

type AiMcpSetupCommandOptions = {
  target: string;
  tool: McpTool;
  strategy?: McpStrategy;
};

export function createAiCommand(): Command {
  const command = new Command('ai');

  const installCommand = addOutputFormatOption(
    command
      .command('install')
      .description('Install standard AI meta-files into a project (AGENTS.md, CLAUDE.md, etc.)')
      .requiredOption('--target <target>', 'Project root')
      .option('--force', 'Overwrite existing files'),
  );

  const bootstrapCommand = addOutputFormatOption(
    command
      .command('bootstrap')
      .description('Aggregate context and targeted doctor checks for an agent intent')
      .requiredOption(
        '--intent <intent>',
        'Agent intent: discover, develop, deploy, troubleshoot, migrate-resources, osgi-debug',
      )
      .option(
        '--cache <seconds>',
        'Reuse a cached bootstrap result for the same intent + cwd while it is newer than this TTL',
      ),
    'json',
  );

  const mcpSetupCommand = addOutputFormatOption(
    command
      .command('mcp-setup')
      .description('Write the ldev MCP server config for your AI assistant')
      .requiredOption('--target <target>', 'Project root to write the config into')
      .requiredOption(
        '--tool <tool>',
        'AI assistant to configure: all, claude-code (.claude/mcp.json), cursor (.cursor/mcp.json), or vscode (.vscode/mcp.json)',
      ),
  ).option(
    '--strategy <strategy>',
    'Server launch strategy: global (ldev-mcp-server), local (node ./node_modules/...), or npx',
  );

  command.description('Standard AI assets and skills for ldev projects').addHelpText(
    'after',
    `
Skills are distributed via the skills.sh standard:
  npx skills add https://github.com/mordonez/ldev

Meta-file bootstrap:
  install              Install AGENTS.md, CLAUDE.md, and related files
  install --force      Overwrite existing files
`,
  );

  installCommand.action(
    createFormattedAction(
      async (_context, options: AiInstallCommandOptions) => {
        return runAiInstall({
          targetDir: options.target,
          force: Boolean(options.force),
        });
      },
      {text: formatAiResult},
    ),
  );

  bootstrapCommand.action(
    createFormattedAction(async (context, options: AiBootstrapCommandOptions) => {
      return runAiBootstrap(context.cwd, {
        intent: options.intent,
        config: context.config,
        env: process.env,
        cacheTtlSeconds: parseBootstrapCacheTtl(options.cache),
      });
    }),
  );

  mcpSetupCommand.action(
    createFormattedAction(
      async (_context, options: AiMcpSetupCommandOptions) => {
        return runMcpSetup({targetDir: options.target, tool: options.tool, strategy: options.strategy});
      },
      {text: formatMcpSetup},
    ),
  );

  return command;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/ai/ai.command.ts
git commit -m "refactor: remove ai update/status commands, simplify install to --target + --force"
```

---

## Task 10: Update `templates/ai/install/AGENTS.md`

**Files:**
- Modify: `templates/ai/install/AGENTS.md`

Remove `{{LIFECYCLE_SKILLS_SECTION}}` placeholder. Update step 5 (skill path reference). The `renderAgentsFile` function has been removed — `installAgentsFile` now reads the template directly without substitution, so the placeholder must not exist.

- [ ] **Step 1: Find and remove `{{LIFECYCLE_SKILLS_SECTION}}`**

Open `templates/ai/install/AGENTS.md`. Find:
```
<!-- Replaced at install time by ldev ai install. Do not edit. -->

{{LIFECYCLE_SKILLS_SECTION}}
```
Delete those three lines entirely.

- [ ] **Step 2: Update skill invocation instruction (step 5 in Required Bootstrap)**

Find in `templates/ai/install/AGENTS.md`:
```
5. Read the task-specific skill under `.agents/skills/` if one applies.
```
Replace with:
```
5. Invoke the task-specific skill if one applies (skills are installed via `npx skills add https://github.com/mordonez/ldev`).
```

- [ ] **Step 3: Check AGENTS.workspace.md for the same placeholder**

```bash
grep -n "LIFECYCLE_SKILLS_SECTION\|\.agents/skills/" templates/ai/install/AGENTS.workspace.md
```

Apply the same fixes if found.

- [ ] **Step 4: Commit**

```bash
git add templates/ai/install/AGENTS.md templates/ai/install/AGENTS.workspace.md
git commit -m "refactor: remove LIFECYCLE_SKILLS_SECTION placeholder, update skill path refs in AGENTS templates"
```

---

## Task 11: Update tests

**Files:**
- Delete: `tests/integration/ai-status.integration.test.ts`
- Modify: `tests/unit/ai.test.ts`
- Modify: `tests/unit/ai-install-modules.test.ts`

- [ ] **Step 1: Delete the ai-status integration test**

```bash
git rm tests/integration/ai-status.integration.test.ts
```

- [ ] **Step 2: Replace `tests/unit/ai.test.ts`**

The old file tested `computeContentHash`, `detectManagedRuleNamespace`, `detectRuleLayer`, `rulesManifestPath` (all deleted), `formatAiStatus` (deleted), and `formatAiResult` (changed type). Replace with:

```typescript
import {describe, expect, test} from 'vitest';

import {formatAiResult, type AiCommandResult} from '../../src/features/ai/ai-install.js';

function makeAiCommandResult(overrides?: Partial<AiCommandResult>): AiCommandResult {
  return {
    mode: 'install',
    targetDir: '/workspace',
    projectType: 'ldev-native',
    agents: 'installed',
    claudeInstalled: false,
    copilotInstalled: false,
    geminiInstalled: false,
    cursorrulesInstalled: false,
    projectContextInstalled: false,
    projectContextSampleInstalled: false,
    nextSteps: [],
    ...overrides,
  };
}

describe('formatAiResult', () => {
  test('includes targetDir and projectType', () => {
    const result = formatAiResult(makeAiCommandResult());

    expect(result).toContain('/workspace');
    expect(result).toContain('ldev-native');
  });

  test('shows AGENTS.md status', () => {
    const result = formatAiResult(makeAiCommandResult({agents: 'installed'}));

    expect(result).toContain('AGENTS.md: installed');
  });

  test('shows AGENTS.md kept when not overwritten', () => {
    const result = formatAiResult(makeAiCommandResult({agents: 'kept'}));

    expect(result).toContain('AGENTS.md: kept');
  });

  test('includes CLAUDE.md line when installed', () => {
    const result = formatAiResult(makeAiCommandResult({claudeInstalled: true}));

    expect(result).toContain('CLAUDE.md: applied');
  });

  test('omits CLAUDE.md line when not installed', () => {
    const result = formatAiResult(makeAiCommandResult({claudeInstalled: false}));

    expect(result).not.toContain('CLAUDE.md');
  });

  test('renders next steps when present', () => {
    const result = formatAiResult(
      makeAiCommandResult({nextSteps: ['Review AGENTS.md', 'Run ldev doctor']}),
    );

    expect(result).toContain('Next steps:');
    expect(result).toContain('1. Review AGENTS.md');
    expect(result).toContain('2. Run ldev doctor');
  });

  test('omits next steps section when empty', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: []}));

    expect(result).not.toContain('Next steps:');
  });

  test('includes project-context line when installed', () => {
    const result = formatAiResult(makeAiCommandResult({projectContextInstalled: true}));

    expect(result).toContain('docs/ai/project-context.md: applied');
  });
});
```

- [ ] **Step 3: Replace `tests/unit/ai-install-modules.test.ts`**

The old file tested `buildRulesManifest` (deleted from `ai-install-rules.ts`), `normalizeRelativePath`, `uniqueSorted`, `resolveSelectedSkills`, `buildWorkspaceCoexistenceWarnings` (all deleted from `ai-install-project.ts`). Keep only the `ai-install-fs` tests and the surviving `buildNextSteps` tests.

Replace full file with:

```typescript
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {
  isProbablyBinary,
  normalizeGitignoreEntryForComparison,
  normalizeTextLineEndings,
  ensureLocalAiGitignoreEntries,
  writeTextFileLf,
} from '../../src/features/ai/ai-install-fs.js';
import {buildNextSteps} from '../../src/features/ai/ai-install-project.js';

// ---------------------------------------------------------------------------
// ai-install-fs — pure helpers
// ---------------------------------------------------------------------------

describe('normalizeTextLineEndings', () => {
  test('converts CRLF to LF', () => {
    expect(normalizeTextLineEndings('foo\r\nbar\r\nbaz')).toBe('foo\nbar\nbaz');
  });

  test('converts CR-only to LF', () => {
    expect(normalizeTextLineEndings('foo\rbar')).toBe('foo\nbar');
  });

  test('leaves LF-only content unchanged', () => {
    expect(normalizeTextLineEndings('foo\nbar\n')).toBe('foo\nbar\n');
  });

  test('handles empty string', () => {
    expect(normalizeTextLineEndings('')).toBe('');
  });
});

describe('isProbablyBinary', () => {
  test('returns true when buffer contains a null byte', () => {
    const buf = Buffer.from([0x66, 0x6f, 0x00, 0x62]);
    expect(isProbablyBinary(buf)).toBe(true);
  });

  test('returns false for a plain text buffer with no null bytes', () => {
    const buf = Buffer.from('hello world', 'utf8');
    expect(isProbablyBinary(buf)).toBe(false);
  });

  test('returns false for an empty buffer', () => {
    expect(isProbablyBinary(Buffer.alloc(0))).toBe(false);
  });
});

describe('normalizeGitignoreEntryForComparison', () => {
  test('strips leading slashes', () => {
    expect(normalizeGitignoreEntryForComparison('/node_modules')).toBe('node_modules');
    expect(normalizeGitignoreEntryForComparison('//dist')).toBe('dist');
  });

  test('strips inline comments', () => {
    expect(normalizeGitignoreEntryForComparison('dist/ # build output')).toBe('dist/');
  });

  test('returns empty string for comment-only lines', () => {
    expect(normalizeGitignoreEntryForComparison('# this is a comment')).toBe('');
  });

  test('returns empty string for blank lines', () => {
    expect(normalizeGitignoreEntryForComparison('')).toBe('');
    expect(normalizeGitignoreEntryForComparison('   ')).toBe('');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeGitignoreEntryForComparison('  .env  ')).toBe('.env');
  });
});

describe('ensureLocalAiGitignoreEntries', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('creates .gitignore with expected entries when it does not exist', async () => {
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added.length).toBeGreaterThan(0);
    expect(added).toContain('AGENTS.md');
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('# ldev ai install --local');
    expect(content).toContain('AGENTS.md');
  });

  test('does not duplicate entries when called twice', async () => {
    await ensureLocalAiGitignoreEntries(tmpDir);
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added).toHaveLength(0);
  });

  test('appends entries to an existing .gitignore', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.writeFile(gitignorePath, 'node_modules/\n');
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    const content = await fs.readFile(gitignorePath, 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('AGENTS.md');
    expect(added).toContain('AGENTS.md');
  });

  test('skips entries already present in the .gitignore', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.writeFile(gitignorePath, 'AGENTS.md\n');
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added).not.toContain('AGENTS.md');
  });
});

describe('writeTextFileLf', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('writes content with LF line endings', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await writeTextFileLf(filePath, 'foo\r\nbar\r\nbaz');

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('foo\nbar\nbaz');
    expect(content).not.toContain('\r');
  });
});

// ---------------------------------------------------------------------------
// ai-install-project — buildNextSteps
// ---------------------------------------------------------------------------

describe('buildNextSteps', () => {
  test('includes npx skills add step for all project types', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.some((s) => s.includes('npx skills add'))).toBe(true);
  });

  test('includes bootstrap verification step', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.some((s) => s.includes('ldev ai bootstrap'))).toBe(true);
  });

  test('includes base layer note for blade-workspace', () => {
    const steps = buildNextSteps('blade-workspace');

    expect(steps.some((s) => s.includes('base layer'))).toBe(true);
  });

  test('does not include base layer note for ldev-native', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.every((s) => !s.includes('base layer'))).toBe(true);
  });
});
```

- [ ] **Step 4: Run the unit tests to verify they pass**

```bash
npx vitest run tests/unit/ai.test.ts tests/unit/ai-install-modules.test.ts
```

Expected: all tests pass (no failures).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/ai.test.ts tests/unit/ai-install-modules.test.ts tests/integration/ai-status.integration.test.ts
git commit -m "test: update ai unit tests for simplified types, delete ai-status integration test"
```

---

## Task 12: Build and validate

- [ ] **Step 1: Build TypeScript**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run all unit tests**

```bash
npx vitest run tests/unit/
```

Expected: all pass. If any test fails with "cannot find module" or type errors, fix the import in that test file.

- [ ] **Step 3: Smoke-test the CLI**

```bash
node dist/index.js ai --help
```

Expected output includes `install` and `bootstrap` and `mcp-setup` sub-commands. Does NOT include `update` or `status`.

```bash
node dist/index.js ai install --help
```

Expected: only `--target` and `--force` options shown.

- [ ] **Step 4: Verify `skills/` structure is correct**

```bash
ls skills/
```

Expected: ten skill directories at root level.

```bash
grep -r "../../docs/" skills/
```

Expected: no output (all cross-references resolved).

- [ ] **Step 5: Verify `plugin.json` is valid**

```bash
node -e "const p = require('./.claude-plugin/plugin.json'); console.log(p.name, p.version)"
```

Expected output: `ldev 0.7.2`

- [ ] **Step 6: Final commit if any fixups were needed**

```bash
git add -A
git status
# commit only if there are changes not already committed
git commit -m "fix: post-build fixups"
```

- [ ] **Step 7: Push branch**

```bash
git push -u origin feat/skills-sh-compatibility
```
