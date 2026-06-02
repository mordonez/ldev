import {readdir, readFile} from 'node:fs/promises';

import {describe, expect, test} from 'vitest';

async function readTemplate(relativePath: string): Promise<string> {
  return readFile(relativePath, 'utf8');
}

async function findSkillFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        return findSkillFiles(path);
      }

      return entry.name === 'SKILL.md' ? [path] : [];
    }),
  );

  return files.flat();
}

describe('AI template guardrails', () => {
  test('generated skills stay compact and discoverable', async () => {
    const skillFiles = [
      ...(await findSkillFiles('templates/ai/skills')),
      ...(await findSkillFiles('templates/ai/project/skills')),
    ];

    expect(skillFiles.length).toBeGreaterThan(0);

    for (const skillFile of skillFiles) {
      const content = await readTemplate(skillFile);
      const lines = content.trimEnd().split(/\r?\n/);
      const description = content.match(/description:\s*(.+?)\r?\n---/s)?.[1] ?? '';

      expect(lines.length, skillFile).toBeLessThanOrEqual(100);
      expect(description, skillFile).toContain('Use when');
    }
  });

  test('agent entrypoints share the same portability contract', async () => {
    const canonicalEntrypoint = await readTemplate('templates/ai/install/AGENTS.md');

    // Full contract must appear in canonical entrypoints
    const fullContractEntrypoints = [
      'templates/ai/install/AGENTS.md',
      'templates/ai/install/AGENTS.workspace.md',
      'templates/ai/workspace-rules/ldev-native-agent-workflow.md',
      'templates/ai/workspace-rules/ldev-workspace-agent-workflow.md',
    ];
    for (const entrypoint of fullContractEntrypoints) {
      const content = await readTemplate(entrypoint);
      expect(content, entrypoint).toContain('Agent Portability Contract');
      expect(content, entrypoint).toContain('Same prompt, same gate order');
      expect(content, entrypoint).toContain('Slash commands are aliases');
      expect(content, entrypoint).toContain('read `.agents/skills/project-issue-engineering/SKILL.md`');
    }

    // Thin delegators only assert the core claim and defer the full contract to AGENTS.md
    const thinDelegators = [
      'templates/ai/project/CLAUDE.md',
      'templates/ai/project/.github/copilot-instructions.md',
      'templates/ai/project/.gemini/GEMINI.md',
      'templates/ai/project/.cursorrules',
    ];
    for (const entrypoint of thinDelegators) {
      const content = await readTemplate(entrypoint);
      const effectiveContent = content.trim().startsWith('@AGENTS.md') ? canonicalEntrypoint : content;
      expect(effectiveContent, entrypoint).toContain('Agent Portability Contract');
      expect(effectiveContent, entrypoint).toContain('Same prompt, same gate order');
      expect(effectiveContent, entrypoint).toContain('AGENTS.md');
    }
  });

  test('AGENTS.workspace.md safety invariants stay in sync with AGENTS.md', async () => {
    const agents = await readTemplate('templates/ai/install/AGENTS.md');
    const workspaceAgents = await readTemplate('templates/ai/install/AGENTS.workspace.md');

    // Shared invariants 1-10 must appear verbatim in both templates
    const sharedInvariants = [
      'Always start with `ldev ai bootstrap --intent=develop --cache=60 --json`',
      'Always consume `--json` output. Never parse human-readable text output from `ldev`',
      'Always run `--check-only` before resource mutations that support it',
      '`import-fragment` has no `--check-only`',
      'Always use the smallest deploy or import that proves the change',
      'Never use plural resource commands',
      'read back the updated resource with `ldev resource structure/template/adt`',
      'use `ldev logs diagnose --since 5m --json`',
      'Never guess IDs, keys, or site names',
      'Never assume the portal URL',
    ];

    for (const invariant of sharedInvariants) {
      expect(agents, `AGENTS.md missing: ${invariant}`).toContain(invariant);
      expect(workspaceAgents, `AGENTS.workspace.md missing: ${invariant}`).toContain(invariant);
    }

    // ldev-native worktree gate is only in the non-workspace variant
    expect(agents).toContain('isolated worktree setup and root lock');
  });

  test('mutating work delegates to shared vendor workflow skills', async () => {
    const runtime = await readTemplate('templates/ai/skills/runtime-change-workflow/SKILL.md');
    const resource = await readTemplate('templates/ai/skills/portal-resource-workflow/SKILL.md');
    const projectIssue = await readTemplate('templates/ai/project/skills/issue-engineering/SKILL.md');
    const vendorManifest = await readTemplate('templates/ai/install/vendor-skills.txt');
    const discovery = await readTemplate('templates/ai/docs/PORTAL_DISCOVERY.md');
    const mutation = await readTemplate('templates/ai/docs/RESOURCE_MUTATION_GATES.md');

    expect(vendorManifest).toContain('runtime-change-workflow');
    expect(vendorManifest).toContain('portal-resource-workflow');

    expect(runtime).toContain('Owns the reusable gate order');
    expect(runtime).toContain('Do not claim Green until the original Red scenario no longer reproduces');
    expect(resource).toContain('Owns the canonical file-backed workflow');
    expect(resource).toContain('Resolve the source-of-truth site before editing');
    expect(discovery).toContain('displayPageDdmTemplates');
    expect(mutation).toContain('real import plus read-back proves the new script hash');
    expect(runtime).toContain('PORTAL_DISCOVERY.md');
    expect(runtime).toContain('RESOURCE_MUTATION_GATES.md');
    expect(resource).toContain('PORTAL_DISCOVERY.md');
    expect(resource).toContain('RESOURCE_MUTATION_GATES.md');

    expect(projectIssue).toContain('This is the project-process wrapper');
    expect(projectIssue).toContain('switch to `runtime-change-workflow`');
    expect(projectIssue).toContain('Portal resources -> `portal-resource-workflow`');
  });

  test('AI command docs only reference installable vendor skills', async () => {
    const vendorManifest = await readTemplate('templates/ai/install/vendor-skills.txt');
    const commandDocs = await readTemplate('docs/commands/project-and-ai.md');
    const vendorSkills = new Set(
      vendorManifest
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#')),
    );
    const documentedSkills = [...commandDocs.matchAll(/--skill\s+([a-z0-9-]+)/g)].map((match) => match[1]);

    expect(documentedSkills.length).toBeGreaterThan(0);
    for (const documentedSkill of documentedSkills) {
      expect(vendorSkills.has(documentedSkill), documentedSkill).toBe(true);
    }
  });

  test('agent entrypoints document fragment imports as the check-only exception', async () => {
    const agents = await readTemplate('templates/ai/install/AGENTS.md');
    const workspaceAgents = await readTemplate('templates/ai/install/AGENTS.workspace.md');

    for (const content of [agents, workspaceAgents]) {
      expect(content).toContain('resource mutations that support it');
      expect(content).toContain('`import-fragment` has no `--check-only`');
      expect(content).not.toContain('any resource mutation (');
    }
  });

  test('ldev-native mutating work uses one Red Green loop inside the worktree', async () => {
    const runtime = await readTemplate('templates/ai/skills/runtime-change-workflow/SKILL.md');
    const agents = await readTemplate('templates/ai/install/AGENTS.md');
    const nativeWorkflow = await readTemplate('templates/ai/workspace-rules/ldev-native-agent-workflow.md');
    const executionFlow = await readTemplate(
      'templates/ai/project/skills/issue-engineering/references/execution-flow.md',
    );

    const combined = [runtime, agents, nativeWorkflow, executionFlow].join('\n');

    expect(combined).not.toContain('Red-1');
    expect(combined).not.toContain('Red-2');
    expect(combined).not.toContain('Red-1/Red-2');
    expect(runtime).toContain('Start the worktree runtime before');
    expect(runtime).toContain('do not reproduce first in the primary checkout');
    expect(nativeWorkflow).toContain('Red reproduction in the worktree runtime');
    expect(executionFlow).toContain('single Red -> Green loop inside that worktree');
  });

  test('vanilla sandbox requests bypass worktree setup', async () => {
    const runtime = await readTemplate('templates/ai/skills/runtime-change-workflow/SKILL.md');
    const worktrees = await readTemplate('templates/ai/skills/isolating-worktrees/SKILL.md');
    const agents = await readTemplate('templates/ai/install/AGENTS.md');
    const nativeWorkflow = await readTemplate('templates/ai/workspace-rules/ldev-native-agent-workflow.md');

    for (const content of [runtime, worktrees, agents, nativeWorkflow]) {
      expect(content).toContain('vanilla sandbox');
      expect(content).toContain('ldev project init');
      expect(content).toContain('activation key');
    }
  });

  test('agent entrypoints document safe PowerShell ldev invocation', async () => {
    const entrypoints = ['templates/ai/install/AGENTS.md', 'templates/ai/install/AGENTS.workspace.md'];

    for (const entrypoint of entrypoints) {
      const content = await readTemplate(entrypoint);

      expect(content, entrypoint).toContain('PowerShell ldev Invocation');
      expect(content, entrypoint).toContain('never use');
      expect(content, entrypoint).toContain('Invoke-Expression');
      expect(content, entrypoint).toContain("$args = @('portal', 'inventory', 'page', '--url', $url, '--json')");
      expect(content, entrypoint).toContain('& ldev @args');
      expect(content, entrypoint).toContain("& npx.cmd '@mordonezdev/ldev' @args");
      expect(content, entrypoint).toContain('MSYS_NO_PATHCONV=1');
      expect(content, entrypoint).toContain('C:/Program Files/Git/<site>');
    }
  });

  test('session failure guardrails cover bootstrap, nested deploys, ADTs, and learnings', async () => {
    const runtime = await readTemplate('templates/ai/skills/runtime-change-workflow/SKILL.md');
    const deploying = await readTemplate('templates/ai/skills/deploying-liferay/SKILL.md');
    const resource = await readTemplate('templates/ai/skills/portal-resource-workflow/SKILL.md');
    const implementation = await readTemplate(
      'templates/ai/skills/developing-liferay/references/implementation-paths.md',
    );
    const learnings = await readTemplate('templates/ai/skills/capturing-session-knowledge/SKILL.md');

    expect(runtime).toContain('before any file edit or runtime mutation');
    expect(deploying).toContain('leaf directory');
    expect(deploying).toContain('modules/...` relative path');
    expect(deploying).toContain('hotDeployed');
    expect(resource).toContain('--widget-type <type>');
    expect(resource).toContain('MSYS_NO_PATHCONV=1');
    expect(implementation).toContain('searchContainer.getResults()');
    expect(implementation).toContain('JSP/taglib override');
    expect(learnings).toContain('Repeated preventable agent mistakes');
  });

  test('routing references point to canonical workflows instead of duplicating them', async () => {
    const routing = await readTemplate('templates/ai/skills/liferay-expert/references/routing.md');
    const issueExecution = await readTemplate(
      'templates/ai/project/skills/issue-engineering/references/execution-flow.md',
    );
    const resourceCompatibility = await readTemplate(
      'templates/ai/skills/developing-liferay/references/resource-workflow.md',
    );

    expect(routing).toContain('runtime-change-workflow');
    expect(routing).toContain('portal-resource-workflow');
    expect(routing).toContain('migrating-journal-structures');
    expect(issueExecution).toContain('runtime-change-workflow');
    expect(issueExecution).toContain('portal-resource-workflow');
    expect(resourceCompatibility).toContain('../../portal-resource-workflow/SKILL.md');
    expect(resourceCompatibility).toContain('Do not duplicate resource import command sequences here');
  });

  test('skills cover the main ldev Liferay work scenarios', async () => {
    const scenarios = new Map([
      ['issue feature or bug fix', 'templates/ai/skills/runtime-change-workflow/SKILL.md'],
      ['unknown runtime failure', 'templates/ai/skills/troubleshooting-liferay/SKILL.md'],
      ['implementation edit', 'templates/ai/skills/developing-liferay/SKILL.md'],
      ['deploy verification', 'templates/ai/skills/deploying-liferay/SKILL.md'],
      ['portal resource edit', 'templates/ai/skills/portal-resource-workflow/SKILL.md'],
      ['journal data migration', 'templates/ai/skills/migrating-journal-structures/SKILL.md'],
      ['browser validation', 'templates/ai/skills/automating-browser-tests/SKILL.md'],
      ['worktree isolation', 'templates/ai/skills/isolating-worktrees/SKILL.md'],
    ]);

    for (const [scenario, skillPath] of scenarios) {
      const skill = await readTemplate(skillPath);
      expect(skill, scenario).toContain('ldev');
    }
  });

  test('browser automation documents PowerShell-safe run-code files', async () => {
    const reference = await readTemplate('templates/ai/skills/automating-browser-tests/REFERENCE.md');

    expect(reference).toContain('`.tmp/<issue>/*.js`');
    expect(reference).toContain('Get-Content -Raw');
    expect(reference).toContain('Set-Content -NoNewline .tmp/<issue>/mobile-viewport.js');
    expect(reference).toContain('playwright-cli -s=mobile-<issue> run-code $CODE');
    expect(reference).toContain('rewriting JavaScript operators');
  });

  test('theme deploy guidance requires runtime refresh before browser Green', async () => {
    const deploySkill = await readTemplate('templates/ai/skills/deploying-liferay/SKILL.md');
    const themeReference = await readTemplate('templates/ai/skills/developing-liferay/references/theme.md');
    const deployRules = await readTemplate('templates/ai/workspace-rules/ldev-deploy-verification.md');
    const nativeRules = await readTemplate('templates/ai/workspace-rules/ldev-native-deploy.md');
    const nativeWorkflow = await readTemplate('templates/ai/workspace-rules/ldev-native-agent-workflow.md');
    const themeProof = await readTemplate('templates/ai/docs/THEME_DEPLOY_RUNTIME_PROOF.md');

    expect(themeProof).toContain('runtimeRefreshed');
    expect(themeProof).toContain('runtimeActionRequired');
    expect(themeProof).toContain('ldev deploy theme --format json');

    for (const content of [deploySkill, themeReference, deployRules, nativeRules, nativeWorkflow]) {
      expect(content).toContain('THEME_DEPLOY_RUNTIME_PROOF.md');
    }
  });

  test('journal structure migrations require a descriptor-backed pipeline', async () => {
    const content = await readTemplate('templates/ai/skills/migrating-journal-structures/SKILL.md');
    const pipeline = await readTemplate('templates/ai/skills/migrating-journal-structures/references/pipeline.md');

    expect(content).toContain('preserve existing content');
    expect(content).toContain('migration-init is mandatory');
    expect(content).toContain('migration-pipeline --migration-file <file> --check-only');
    expect(content).toContain('migration-pipeline --migration-file <file>');
    expect(content).toContain('Do not claim Green from structure import alone');
    expect(content).toContain('introduce.articleIds');
    expect(content).toContain('Do not pass `--templates` for a data-only migration');
    expect(content).toContain('First proof is non-destructive');
    expect(content).toContain('Ask explicit user confirmation before legacy cleanup/removal');
    expect(content).toContain('--liferay-timeout-seconds 300');
    expect(content).toContain('real structure/template/pipeline mutations');
    expect(content).toContain('Treat `--check-only` as plan validation');
    expect(content).toContain('make an existing field or field pair repeatable');
    expect(content).toContain('saved values must migrate');
    expect(content).toContain('at least two repeated entries');
    expect(pipeline).toContain('`introduce.articleIds` to the exact content item');
    expect(pipeline).toContain('Do not run an unscoped site-wide migration as the first validation pass');
    expect(pipeline).toContain('`"templates": false` and do not generate');
    expect(pipeline).toContain('SomethingFieldSetFieldSet');
    expect(pipeline).toContain('Non-Destructive First Proof');
    expect(pipeline).toContain('"cleanupSource": false');
    expect(pipeline).toContain('New fieldset children must use new unique `fieldReference`/`name` values');
    expect(pipeline).toContain('LIFERAY_CLI_HTTP_TIMEOUT_SECONDS');
    expect(pipeline).toContain('import-template --liferay-timeout-seconds 300');
    expect(pipeline).toContain('Repeatable Field Decisions');
  });

  test('journal structure edits require layout placement and saved authoring proof', async () => {
    const resource = await readTemplate('templates/ai/skills/portal-resource-workflow/SKILL.md');
    const fieldCatalog = await readTemplate(
      'templates/ai/skills/developing-liferay/references/structure-field-catalog.md',
    );
    const intake = await readTemplate('templates/ai/project/skills/issue-engineering/references/intake.md');

    expect(resource).toContain('defaultDataLayout');
    expect(resource).toContain('requested visual position');
    expect(resource).toContain('Editor labels');
    expect(resource).toContain('duplicate buttons alone are not Green');
    expect(fieldCatalog).toContain('Place new fields in `defaultDataLayout`');
    expect(fieldCatalog).toContain('Do not include `FieldSet` in a new fieldset name/reference');
    expect(intake).toContain('Existing field becomes repeatable');
    expect(intake).toContain('saved legacy values must migrate');
  });

  test('site-building guidance covers headless-first content and page mutation flows', async () => {
    const skill = await readTemplate('templates/ai/skills/developing-liferay/SKILL.md');
    const siteBuilding = await readTemplate('templates/ai/skills/developing-liferay/references/site-building.md');
    const oauthSetup = await readTemplate('templates/ai/skills/developing-liferay/references/oauth2-setup.md');

    expect(skill).toContain('references/site-building.md');
    expect(siteBuilding).toContain('structured-contents/{structuredContentId}');
    expect(siteBuilding).toContain('site pages');
    expect(siteBuilding).toContain(
      'Use browser automation only when the runtime exposes no stable headless mutation path',
    );
    expect(siteBuilding).toContain('Runtime-Proven Update Matrix');
    expect(siteBuilding).toContain('top-level fields are safely mutable with `PATCH`');
    expect(siteBuilding).toContain('nested multimedia text fields are only proven with `PUT`');
    expect(siteBuilding).toContain('nested image fields are not yet reliable headless mutation targets');
    expect(oauthSetup).toContain('Liferay.Headless.Admin.Site.everything.write');
    expect(oauthSetup).toContain('ldev oauth install --write-env');
  });

  test('reindex is documented as a manual UI action, not an ldev command', async () => {
    const skillFiles = [
      ...(await findSkillFiles('templates/ai/skills')),
      ...(await findSkillFiles('templates/ai/project/skills')),
    ];
    const markdownFiles = [
      ...skillFiles,
      'templates/ai/skills/troubleshooting-liferay/references/reindex-after-import.md',
      'templates/ai/skills/troubleshooting-liferay/references/reindex-journal.md',
      'templates/ai/skills/troubleshooting-liferay/references/search-debug.md',
      'templates/ai/skills/troubleshooting-liferay/references/specialized-diagnosis.md',
      'templates/ai/skills/troubleshooting-liferay/references/content-versions.md',
      'templates/ai/skills/migrating-journal-structures/references/pipeline.md',
    ];

    for (const file of markdownFiles) {
      const content = await readTemplate(file);

      expect(content, file).not.toContain('ldev portal reindex');
      expect(content, file).not.toContain('speedup-on');
      expect(content, file).not.toContain('speedup-off');
    }

    const reindexAfterImport = await readTemplate(
      'templates/ai/skills/troubleshooting-liferay/references/reindex-after-import.md',
    );
    const reindexJournal = await readTemplate(
      'templates/ai/skills/troubleshooting-liferay/references/reindex-journal.md',
    );

    expect(reindexAfterImport).toContain('The only supported way to force');
    expect(reindexAfterImport).toContain('manual action in the Liferay UI');
    expect(reindexJournal).toContain('A human must start the relevant reindex');
  });

  test('project issue workflow locks resource origin before edits', async () => {
    const skill = await readTemplate('templates/ai/project/skills/issue-engineering/SKILL.md');
    const content = await readTemplate('templates/ai/project/skills/issue-engineering/references/resource-origin.md');

    expect(skill).toContain('read `references/resource-origin.md` before scope lock');
    expect(skill).toContain('migrating-journal-structures');
    expect(content).toContain('source-of-truth site');
    expect(content).toContain('portal inventory page --url <fullUrl> --full --json');
    expect(content).toContain('templateExportPath');
    expect(content).toContain('candidate copies are out of scope until proven active');
    expect(content).toContain('Do not edit sibling site copies');
  });

  test('project context sample prompts stable shared-resource facts', async () => {
    const content = await readTemplate('templates/ai/project/docs/ai/project-context.md.sample');

    expect(content).toContain('Shared Resource Ownership');
    expect(content).toContain('do not edit copied resources');
  });
});
