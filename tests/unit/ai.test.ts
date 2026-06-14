import {describe, expect, test} from 'vitest';

import {formatAiResult, type AiCommandResult} from '../../src/features/ai/ai-install.js';

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
    manifestPath: '/workspace/.agents/.vendor-skills',
    agents: 'installed',
    claudeInstalled: false,
    projectContextInstalled: false,
    projectContextSampleInstalled: false,
    copilotInstalled: false,
    geminiInstalled: false,
    cursorrulesInstalled: false,
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

  test('includes selected skills when present', () => {
    const result = formatAiResult(makeAiCommandResult({selectedSkills: ['commit', 'review-pr']}));

    expect(result).toContain('Selected skills: commit, review-pr');
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
