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
    projectContextSampleInstalled: false,
    projectIssueSkillInstalled: false,
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
    const result = formatAiResult(makeAiCommandResult({nextSteps: ['Review AGENTS.md', 'Run ldev doctor']}));

    expect(result).toContain('Next steps:');
    expect(result).toContain('1. Review AGENTS.md');
    expect(result).toContain('2. Run ldev doctor');
  });

  test('omits next steps section when empty', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: []}));

    expect(result).not.toContain('Next steps:');
  });

  test('includes project-context.md.sample line when installed', () => {
    const result = formatAiResult(makeAiCommandResult({projectContextSampleInstalled: true}));

    expect(result).toContain('docs/ai/project-context.md.sample: applied');
  });
});
