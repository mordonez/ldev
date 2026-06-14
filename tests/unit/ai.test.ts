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
    agents: 'installed',
    claudeInstalled: false,
    projectContextInstalled: false,
    projectContextSampleInstalled: false,
    copilotInstalled: false,
    geminiInstalled: false,
    cursorrulesInstalled: false,
    nextSteps: [],
    ...overrides,
  };
}

describe('formatAiResult', () => {
  test('includes targetDir and projectType', () => {
    const result = formatAiResult(makeAiCommandResult());

    expect(result).toContain('/workspace');
    expect(result).toContain('blade-workspace');
  });

  test('shows AGENTS.md status', () => {
    const result = formatAiResult(makeAiCommandResult());

    expect(result).toContain('AGENTS.md: installed');
  });

  test('shows CLAUDE.md when installed', () => {
    const result = formatAiResult(makeAiCommandResult({claudeInstalled: true}));

    expect(result).toContain('CLAUDE.md: applied');
  });

  test('shows copilot instructions when installed', () => {
    const result = formatAiResult(makeAiCommandResult({copilotInstalled: true}));

    expect(result).toContain('.github/copilot-instructions.md: applied');
  });

  test('renders next steps with numbered list', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: ['Review AGENTS.md', 'Run ldev doctor']}));

    expect(result).toContain('Next steps:');
    expect(result).toContain('1. Review AGENTS.md');
    expect(result).toContain('2. Run ldev doctor');
  });

  test('omits next steps section when empty', () => {
    const result = formatAiResult(makeAiCommandResult({nextSteps: []}));

    expect(result).not.toContain('Next steps:');
  });
});
