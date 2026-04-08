import {describe, expect, test} from 'vitest';

import {
  computeContentHash,
  detectManagedRuleNamespace,
  detectRuleLayer,
  rulesManifestPath,
} from '../../src/features/ai/ai-manifest.js';
import {formatAiStatus, type AiStatusReport} from '../../src/features/ai/ai-status.js';
import {formatAiResult, type AiCommandResult} from '../../src/features/ai/ai-install.js';

// ---------------------------------------------------------------------------
// ai-manifest — pure helpers
// ---------------------------------------------------------------------------

describe('computeContentHash', () => {
  test('returns a sha256: prefixed hex digest', () => {
    const hash = computeContentHash('hello world');

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('is deterministic for the same input', () => {
    expect(computeContentHash('abc')).toBe(computeContentHash('abc'));
  });

  test('produces different hashes for different content', () => {
    expect(computeContentHash('foo')).not.toBe(computeContentHash('bar'));
  });

  test('empty string produces a valid hash', () => {
    expect(computeContentHash('')).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('detectManagedRuleNamespace', () => {
  test('returns ldev-workspace for ldev-workspace-* prefix', () => {
    expect(detectManagedRuleNamespace('ldev-workspace-setup')).toBe('ldev-workspace');
    expect(detectManagedRuleNamespace('ldev-workspace-runtime')).toBe('ldev-workspace');
  });

  test('returns ldev-native for ldev-native-* prefix', () => {
    expect(detectManagedRuleNamespace('ldev-native-runtime')).toBe('ldev-native');
    expect(detectManagedRuleNamespace('ldev-native-deploy')).toBe('ldev-native');
  });

  test('returns ldev for ldev-* prefix (non-workspace, non-native)', () => {
    expect(detectManagedRuleNamespace('ldev-liferay-core')).toBe('ldev');
    expect(detectManagedRuleNamespace('ldev-liferay-mcp')).toBe('ldev');
  });

  test('returns null for unrecognised prefixes', () => {
    expect(detectManagedRuleNamespace('custom-rule')).toBeNull();
    expect(detectManagedRuleNamespace('project-overlay')).toBeNull();
    expect(detectManagedRuleNamespace('')).toBeNull();
  });
});

describe('detectRuleLayer', () => {
  test('maps ldev namespace to ldev-common', () => {
    expect(detectRuleLayer('ldev')).toBe('ldev-common');
  });

  test('maps ldev-workspace and ldev-native namespaces to project-type', () => {
    expect(detectRuleLayer('ldev-workspace')).toBe('project-type');
    expect(detectRuleLayer('ldev-native')).toBe('project-type');
  });
});

describe('rulesManifestPath', () => {
  test('resolves to .ldev/ai/rules-manifest.json inside targetDir', () => {
    const result = rulesManifestPath('/some/project');

    expect(result).toContain('.ldev');
    expect(result).toContain('rules-manifest.json');
    expect(result).toMatch(/\/some\/project/);
  });
});

// ---------------------------------------------------------------------------
// ai-status — formatAiStatus
// ---------------------------------------------------------------------------

function makeAiStatusReport(overrides?: Partial<AiStatusReport>): AiStatusReport {
  return {
    ok: true,
    projectType: 'blade-workspace',
    manifestPresent: true,
    packageVersion: '0.2.0',
    summary: {managedRules: 3, current: 2, modified: 1, stalePackage: 0, staleRuntime: 0, missing: 0},
    officialWorkspaceFilesDetected: [],
    coexistenceNotes: [],
    rules: [],
    warnings: [],
    ...overrides,
  };
}

describe('formatAiStatus', () => {
  test('includes manifest presence, project type and rule counts', () => {
    const result = formatAiStatus(makeAiStatusReport());

    expect(result).toContain('present');
    expect(result).toContain('blade-workspace');
    expect(result).toContain('Managed rules: 3');
    expect(result).toContain('Current=2');
    expect(result).toContain('Modified=1');
  });

  test('shows "missing" when manifest is absent', () => {
    const result = formatAiStatus(makeAiStatusReport({manifestPresent: false}));

    expect(result).toContain('missing');
  });

  test('includes warnings section when warnings are present', () => {
    const result = formatAiStatus(makeAiStatusReport({warnings: ['1 managed rules were modified locally.']}));

    expect(result).toContain('Warnings');
    expect(result).toContain('1 managed rules were modified locally.');
  });

  test('omits warnings section when there are no warnings', () => {
    const result = formatAiStatus(makeAiStatusReport({warnings: []}));

    expect(result).not.toContain('Warnings');
  });
});

// ---------------------------------------------------------------------------
// ai-install — formatAiResult
// ---------------------------------------------------------------------------

function makeAiCommandResult(overrides?: Partial<AiCommandResult>): AiCommandResult {
  return {
    mode: 'install',
    targetDir: '/workspace',
    projectType: 'blade-workspace',
    local: false,
    skillsOnly: false,
    vendorSkills: ['commit', 'review-pr'],
    updatedSkills: ['commit', 'review-pr'],
    preservedLocalSkills: [],
    manifestPath: '/workspace/.agents/.vendor-skills',
    agents: 'installed',
    claudeInstalled: false,
    projectContextInstalled: false,
    projectContextSampleInstalled: false,
    copilotInstalled: false,
    projectSkillsInstalled: [],
    projectAgentsInstalled: [],
    workspaceRulesInstalled: [],
    workspaceToolTargetsUpdated: [],
    rulesManifestPath: '/workspace/.ldev/ai/rules-manifest.json',
    officialWorkspaceFilesDetected: [],
    selectedSkills: [],
    warnings: [],
    nextSteps: [],
    gitignoreEntriesAdded: [],
    ...overrides,
  };
}

describe('formatAiResult', () => {
  test('includes targetDir and projectType', () => {
    const result = formatAiResult(makeAiCommandResult());

    expect(result).toContain('/workspace');
    expect(result).toContain('blade-workspace');
  });

  test('shows installed skills count and AGENTS.md status in install mode', () => {
    const result = formatAiResult(makeAiCommandResult());

    expect(result).toContain('Installed skills: 2');
    expect(result).toContain('AGENTS.md: installed');
  });

  test('shows local gitignore mode when install uses --local', () => {
    const result = formatAiResult(makeAiCommandResult({local: true, gitignoreEntriesAdded: ['AGENTS.md', '.agents/']}));

    expect(result).toContain('Git ignore mode: local');
    expect(result).toContain('AI/tooling paths added to .gitignore: 2');
  });

  test('shows updated skills in skillsOnly mode', () => {
    const result = formatAiResult(makeAiCommandResult({skillsOnly: true, updatedSkills: ['commit']}));

    expect(result).toContain('Updated vendor skills: 1');
    expect(result).not.toContain('AGENTS.md');
  });

  test('shows preserved local skills count when non-zero in skillsOnly mode', () => {
    const result = formatAiResult(
      makeAiCommandResult({skillsOnly: true, preservedLocalSkills: ['my-skill', 'other-skill']}),
    );

    expect(result).toContain('Preserved local skills: 2');
  });

  test('includes selected skills when present', () => {
    const result = formatAiResult(makeAiCommandResult({selectedSkills: ['commit', 'review-pr']}));

    expect(result).toContain('Selected skills: commit, review-pr');
  });

  test('includes workspace rules when installed', () => {
    const result = formatAiResult(
      makeAiCommandResult({workspaceRulesInstalled: ['ldev-liferay-core', 'ldev-liferay-mcp']}),
    );

    expect(result).toContain('ldev-liferay-core, ldev-liferay-mcp');
  });

  test('includes project skills count when installed', () => {
    const result = formatAiResult(makeAiCommandResult({projectSkillsInstalled: ['project-issue-engineering']}));

    expect(result).toContain('Installed project skills: 1');
  });

  test('renders next steps with numbered list', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: ['Review AGENTS.md', 'Run ldev doctor']}));

    expect(result).toContain('Next steps:');
    expect(result).toContain('1. Review AGENTS.md');
    expect(result).toContain('2. Run ldev doctor');
  });

  test('renders warnings section when present', () => {
    const result = formatAiResult(makeAiCommandResult({warnings: ['Official files detected']}));

    expect(result).toContain('Warnings:');
    expect(result).toContain('Official files detected');
  });

  test('omits next steps and warnings sections when empty', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: [], warnings: []}));

    expect(result).not.toContain('Next steps:');
    expect(result).not.toContain('Warnings:');
  });
});
